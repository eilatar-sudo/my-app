# Agentic Semantic Join Plane

## Why this matters

Agents need to discover related work across schemaless boards, updates, docs, automations, and historical decisions. A naive semantic join would ask a vector index for "similar things" and then expand outward recursively, which is useful for recall but dangerous for mondayDB: it can cross tenant boundaries, hide non-deterministic behavior in the data layer, and create neighbor-impacting workloads on large accounts.

The semantic join plane keeps that product trade-off explicit:

- **Latency vs. recall:** candidate generation uses bounded pgvector/HNSW search for blink-of-an-eye recall, then deterministic row/columnar verification trims candidates to authorized, current source records.
- **Consistency vs. freshness:** semantic indexes may lag source mutations, so every response returns source and vector watermarks. Agents can request `READ_YOUR_WRITE` only when the planner can route to freshly materialized embeddings or a row-store fallback within budget.
- **Agent capability vs. enterprise stability:** the database exposes join plans, budgets, and audit hashes. It never lets an LLM recursively explore relationships without deterministic limits.

## Scope

The plane provides tenant-scoped, explainable semantic joins between:

1. **Row-store entities** for transactional source truth.
2. **Columnar projections** for aggregations and high-cardinality filters.
3. **Vectorized memory records** for semantic candidate generation.
4. **Procedural memory references** that tell an agent how to use the joined evidence.

It does not execute autonomous actions. It returns evidence packets that upstream agent runtimes can feed into plan verification, consent delegation, tool execution, or transaction intent flows.

## TypeScript contracts

```ts
type SemanticJoinConsistency = "BOUNDED_STALE" | "READ_YOUR_WRITE";
type SemanticJoinStatus = "ADMITTED" | "DEGRADED" | "REJECTED";

interface AgenticSemanticJoinRequest {
  account_id: string;
  board_id?: string;
  actor_user_id: string;
  agent_session_id: string;
  purpose_boundary_id: string;
  query_text: string;
  source_entity_refs: EntityRef[];
  join_targets: SemanticJoinTarget[];
  consistency: SemanticJoinConsistency;
  max_vector_top_k: number;
  max_join_candidates: number;
  max_expansion_depth: number;
  deadline_ms: number;
  budget_token: string;
}

interface EntityRef {
  source_kind: "BOARD_ITEM" | "UPDATE" | "DOC" | "AUTOMATION" | "MEMORY";
  source_id: string;
  source_version?: string;
}

interface SemanticJoinTarget {
  source_kind: EntityRef["source_kind"];
  board_id?: string;
  required_column_ids?: string[];
  metadata_filters?: Record<string, string | number | boolean>;
}

interface SemanticJoinPlan {
  account_id: string;
  join_plan_id: string;
  request_hash: string;
  budget_token_hash: string;
  status: SemanticJoinStatus;
  rejection_reason?: string;
  estimated_board_rows: number;
  estimated_row_reads: number;
  estimated_columnar_reads: number;
  estimated_vector_candidates: number;
  estimated_cost_units: number;
  consistency: SemanticJoinConsistency;
  vector_watermark: string;
  row_store_watermark: string;
  max_vector_top_k: number;
  max_join_candidates: number;
  max_expansion_depth: number;
  audit_hash: string;
}

interface SemanticJoinEvidencePacket {
  account_id: string;
  join_plan_id: string;
  evidence_id: string;
  source_ref: EntityRef;
  similarity_score: number;
  deterministic_rank: number;
  matched_fields: string[];
  procedure_memory_refs: string[];
  perception_card: AgentPerceptionCard;
  source_watermark: string;
  audit_hash: string;
}

interface AgentPerceptionCard {
  label: string;
  summary: string;
  entity_tags: string[];
  risk_tags: string[];
  suggested_actions: string[];
  forbidden_actions: string[];
}
```

## SQL schema

All primary and secondary keys lead with `account_id`. This is the invariant that prevents cross-tenant leakage and enables account-level partition pruning.

```sql
CREATE TABLE agentic_semantic_join_plans (
  account_id              BIGINT       NOT NULL,
  join_plan_id            UUID         NOT NULL,
  actor_user_id           BIGINT       NOT NULL,
  agent_session_id        UUID         NOT NULL,
  purpose_boundary_id     UUID         NOT NULL,
  request_hash            CHAR(64)     NOT NULL,
  budget_token_hash       CHAR(64)     NOT NULL,
  status                  TEXT         NOT NULL CHECK (status IN ('ADMITTED', 'DEGRADED', 'REJECTED')),
  rejection_reason        TEXT,
  consistency             TEXT         NOT NULL CHECK (consistency IN ('BOUNDED_STALE', 'READ_YOUR_WRITE')),
  estimated_board_rows    BIGINT       NOT NULL,
  estimated_row_reads     BIGINT       NOT NULL,
  estimated_columnar_reads BIGINT      NOT NULL,
  estimated_vector_candidates BIGINT   NOT NULL,
  estimated_cost_units    BIGINT       NOT NULL,
  max_vector_top_k        INTEGER      NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_join_candidates     INTEGER      NOT NULL CHECK (max_join_candidates BETWEEN 1 AND 1000),
  max_expansion_depth     INTEGER      NOT NULL CHECK (max_expansion_depth BETWEEN 0 AND 3),
  vector_watermark        TEXT         NOT NULL,
  row_store_watermark     TEXT         NOT NULL,
  previous_audit_hash     CHAR(64),
  audit_hash              CHAR(64)     NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, join_plan_id)
);

CREATE INDEX agentic_semantic_join_plans_session_idx
  ON agentic_semantic_join_plans (account_id, agent_session_id, created_at DESC);

CREATE TABLE agentic_semantic_join_edges (
  account_id          BIGINT      NOT NULL,
  join_plan_id        UUID        NOT NULL,
  evidence_id         UUID        NOT NULL,
  source_kind         TEXT        NOT NULL,
  source_id           TEXT        NOT NULL,
  source_version      TEXT,
  deterministic_rank  INTEGER     NOT NULL,
  similarity_score    DOUBLE PRECISION NOT NULL,
  matched_fields      JSONB       NOT NULL,
  procedure_memory_refs UUID[]    NOT NULL DEFAULT '{}',
  perception_card     JSONB       NOT NULL,
  source_watermark    TEXT        NOT NULL,
  audit_hash          CHAR(64)    NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, join_plan_id, evidence_id),
  FOREIGN KEY (account_id, join_plan_id)
    REFERENCES agentic_semantic_join_plans (account_id, join_plan_id)
);

CREATE INDEX agentic_semantic_join_edges_source_idx
  ON agentic_semantic_join_edges (account_id, source_kind, source_id, created_at DESC);

CREATE TABLE agentic_semantic_join_vectors (
  account_id       BIGINT      NOT NULL,
  source_kind      TEXT        NOT NULL,
  source_id        TEXT        NOT NULL,
  source_version   TEXT        NOT NULL,
  board_id         BIGINT,
  embedding_model  TEXT        NOT NULL,
  embedding        vector(1536) NOT NULL,
  metadata_tags    JSONB       NOT NULL,
  procedure_memory_refs UUID[] NOT NULL DEFAULT '{}',
  materialized_at  TIMESTAMPTZ NOT NULL,
  source_watermark TEXT        NOT NULL,
  PRIMARY KEY (account_id, source_kind, source_id, source_version)
);

CREATE INDEX agentic_semantic_join_vectors_hnsw_idx
  ON agentic_semantic_join_vectors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX agentic_semantic_join_vectors_route_idx
  ON agentic_semantic_join_vectors (account_id, board_id, source_kind, materialized_at DESC);
```

Deployment note: the HNSW index must be physically or logically partitioned by `account_id` and, for high-volume accounts, by `(account_id, board_id, source_kind)`. A global HNSW index without tenant partition routing is not acceptable because post-filtering by `account_id` can leak latency and increase neighbor impact.

## Open API GraphQL shape

```graphql
enum AgenticSemanticJoinConsistency {
  BOUNDED_STALE
  READ_YOUR_WRITE
}

enum AgenticSemanticJoinStatus {
  ADMITTED
  DEGRADED
  REJECTED
}

input AgenticEntityRefInput {
  sourceKind: String!
  sourceId: ID!
  sourceVersion: String
}

input AgenticSemanticJoinTargetInput {
  sourceKind: String!
  boardId: ID
  requiredColumnIds: [ID!]
  metadataFilters: JSON
}

input AgenticSemanticJoinInput {
  accountId: ID!
  boardId: ID
  actorUserId: ID!
  agentSessionId: ID!
  purposeBoundaryId: ID!
  queryText: String!
  sourceEntityRefs: [AgenticEntityRefInput!]!
  joinTargets: [AgenticSemanticJoinTargetInput!]!
  consistency: AgenticSemanticJoinConsistency!
  maxVectorTopK: Int! = 40
  maxJoinCandidates: Int! = 100
  maxExpansionDepth: Int! = 1
  deadlineMs: Int! = 250
  budgetToken: String!
}

type Mutation {
  preflightAgenticSemanticJoin(input: AgenticSemanticJoinInput!): AgenticSemanticJoinPlan!
  executeAgenticSemanticJoin(joinPlanId: ID!, accountId: ID!): AgenticSemanticJoinResult!
}

type AgenticSemanticJoinPlan {
  accountId: ID!
  joinPlanId: ID!
  status: AgenticSemanticJoinStatus!
  rejectionReason: String
  estimatedBoardRows: BigInt!
  estimatedCostUnits: BigInt!
  maxVectorTopK: Int!
  maxJoinCandidates: Int!
  maxExpansionDepth: Int!
  vectorWatermark: String!
  rowStoreWatermark: String!
  auditHash: String!
}

type AgenticSemanticJoinResult {
  accountId: ID!
  joinPlanId: ID!
  status: AgenticSemanticJoinStatus!
  evidence: [AgenticSemanticJoinEvidencePacket!]!
  vectorWatermark: String!
  rowStoreWatermark: String!
  auditHash: String!
}
```

The Open API requires `accountId` on both preflight and execute calls. The execute mutation must reject a `joinPlanId` that was created for a different account, actor, purpose boundary, or budget token hash.

## Execution flow

1. **Preflight:** hash the request, validate purpose boundary and actor visibility, estimate row/columnar/vector reads, reserve budget, and either admit, degrade, or reject the plan.
2. **Candidate generation:** route to the account-partitioned HNSW shard using `(account_id, board_id, source_kind)` before vector search. Limit candidate count by `max_vector_top_k`.
3. **Deterministic verification:** fetch current row-store records by `(account_id, source_kind, source_id)` and validate board permissions, source versions, purpose boundary, and metadata filters.
4. **Columnar refinement:** apply high-cardinality filters and aggregation summaries only through account-prefixed projections. This step may reduce candidates but must not expand the search set.
5. **Ranking:** sort by normalized similarity, source freshness, deterministic tie-breakers, and policy flags. Equal scores are ordered by `(source_kind, source_id, source_version)`.
6. **Evidence sealing:** persist evidence edges, perception cards, watermarks, and audit hashes before returning results.

## Guardrails for autonomous agents

- `max_expansion_depth` is capped at 3 and defaults to 1.
- `max_vector_top_k` is capped at 200 and defaults to 40.
- `max_join_candidates` is capped at 1000 and defaults to 100.
- Plans with missing `account_id`, missing purpose boundary, expired budget token, or unbounded metadata filters are rejected.
- Recursive calls must include the prior `join_plan_id`; loop containment compares request hashes and semantic fingerprints before admission.
- Tool execution is never triggered by this plane. Evidence packets may include `suggested_actions`, but execution requires a separate governed action or transaction-intent flow.
- Degraded mode may reduce `topK`, switch from `READ_YOUR_WRITE` to `BOUNDED_STALE`, or return only already-materialized candidates. It must not silently widen scope.

## Performance checks

The planner must reject or degrade any plan that would cause a full scan on boards with 1M+ rows:

- **Reject:** vector search without account-partition routing.
- **Reject:** row or columnar filters that do not include `account_id`.
- **Reject:** metadata predicates over unindexed JSON paths when `estimated_board_rows >= 1_000_000`.
- **Reject:** recursive joins where `max_expansion_depth * max_vector_top_k` exceeds the reserved budget.
- **Degrade:** `READ_YOUR_WRITE` when fresh embeddings are unavailable and row-store fallback would exceed `deadline_ms`.
- **Degrade:** broad board-level joins by requiring a narrower `board_id`, `source_kind`, indexed column filter, or smaller `topK`.

Candidate generation is allowed to be approximate; final authorization, source visibility, and evidence ordering are deterministic.

## Auditability

Every plan and evidence packet includes:

- `request_hash`: canonical JSON hash of the request.
- `previous_audit_hash`: prior account/session hash for chain replay.
- `audit_hash`: deterministic hash of request, estimates, watermarks, selected candidates, and policy decisions.
- `source_watermark`: row/columnar source version used for verification.
- `vector_watermark`: embedding materialization point used for retrieval.

Support and compliance teams can replay the preflight using the same watermarks to explain why an agent saw a specific piece of evidence, why a candidate was excluded, or why a plan was rejected.

## Agent perception

Agents should perceive semantic joins as evidence, not as hidden truth. Each `AgentPerceptionCard` gives an LLM compact, bounded context:

- `entity_tags` describe what the record is about.
- `risk_tags` warn about stale data, sensitive fields, or high-cost follow-up paths.
- `procedure_memory_refs` point to deterministic instructions for how to use the evidence.
- `suggested_actions` and `forbidden_actions` make tool readiness explicit without executing tools.

This keeps mondayDB deterministic while still giving probabilistic agents a structured way to reason over related data.
