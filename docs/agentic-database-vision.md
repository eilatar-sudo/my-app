# mondayDB Agentic Database Vision

## Why this matters

mondayDB already optimizes for high-throughput WorkOS workloads: schemaless boards,
decoupled storage and compute, row storage for transactional updates, and columnar
storage for analytics. The agentic era adds a new access pattern: autonomous systems
need to retrieve context, follow reusable procedures, and call tools without harming
neighbor tenants or making the data layer probabilistic.

The strategic trade-off is latency versus governed context. A pure vector lookup can be
fast, but without tenant-scoped budgets, freshness watermarks, and deterministic audit
records it can return context that an enterprise customer cannot explain or replay. The
target state is therefore not "AI inside the database"; it is a deterministic agentic
control plane around mondayDB that exposes semantic retrieval, procedural memory, and
tool-use readiness through the Open API while preserving ACID writes, 99.99%
availability, and predictable multi-tenant isolation.

## Design principles

1. **Deterministic core, probabilistic edge.** Embedding generation and LLM planning
   happen outside the storage engine. mondayDB persists inputs, outputs, watermarks,
   budgets, and hashes so every decision can be replayed.
2. **Tenant scope is structural.** Every row, vector record, memory object, and audit
   event is keyed by `account_id`; indexes must prefix on `account_id` before any
   board, entity, or vector partition key.
3. **Hybrid retrieval is explicit.** Agents should be able to combine row, columnar,
   and semantic paths, but the planner must record which path was selected and why.
4. **Procedural memory is versioned.** Instructions for agents are stored as immutable,
   reviewed records with activation windows and rollback-safe versions.
5. **Expensive loops are contained.** Recursive retrieval/tool/query chains require
   deterministic limits: max depth, max fanout, estimated cost, timeout, and budget
   reservation before execution.

## Reference architecture

```text
Agent / LLM
   |
   v
Open API GraphQL
   |
   v
Agentic Gateway
   |-- plan verifier
   |-- query budget ledger
   |-- loop containment
   |-- audit hash writer
   |
   +--> Row store path        (ACID updates, point reads)
   +--> Columnar path         (bounded analytics/aggregations)
   +--> Semantic vector path  (tenant-partitioned HNSW)
   +--> Procedure memory path (versioned instructions)
   +--> Tool execution path   (leased, idempotent actions)
```

The gateway is the policy boundary. It never asks an LLM whether a query is safe; it
uses deterministic estimates, tenant limits, and compiled access policies to decide
whether the request can run.

## Core TypeScript contracts

```ts
export type AgenticSourceKind =
  | "row"
  | "columnar"
  | "vector"
  | "procedure"
  | "tool";

export interface AgenticRetrievalRequest {
  accountId: string;
  actorId: string;
  boardIds: string[];
  objective: string;
  sourceKinds: AgenticSourceKind[];
  semanticQuery?: {
    embeddingModel: string;
    embedding: number[];
    topK: number;
    minScore?: number;
  };
  consistency: {
    requiredWatermark: string;
    allowStaleVectorMs: number;
  };
  guardrails: {
    maxDepth: number;
    maxFanout: number;
    maxEstimatedRows: number;
    maxEstimatedVectorCandidates: number;
    timeoutMs: number;
    budgetTokens: number;
  };
}

export interface AgenticContextPacket {
  accountId: string;
  packetId: string;
  requestHash: string;
  resultWatermark: string;
  sources: AgenticContextSource[];
  procedures: ProcedureMemoryRef[];
  auditHash: string;
  createdAt: string;
}

export interface AgenticContextSource {
  kind: AgenticSourceKind;
  boardId?: string;
  itemId?: string;
  columnId?: string;
  vectorId?: string;
  toolLeaseId?: string;
  score?: number;
  freshnessWatermark: string;
  visibility: "agent_visible" | "human_only" | "restricted";
  tags: string[];
}

export interface ProcedureMemoryRef {
  procedureId: string;
  version: number;
  title: string;
  preconditions: string[];
  deterministicSteps: string[];
  rollbackHint?: string;
}
```

These contracts make the agent's perception explicit. The LLM sees a bounded
`AgenticContextPacket` with source tags, freshness, and procedure references; it does
not receive unbounded database access.

## SQL schema sketch

```sql
CREATE TABLE agentic_context_packets (
  account_id            BIGINT NOT NULL,
  packet_id             UUID NOT NULL,
  actor_id              BIGINT NOT NULL,
  objective_hash        BYTEA NOT NULL,
  request_hash          BYTEA NOT NULL,
  result_watermark      TEXT NOT NULL,
  max_depth             INTEGER NOT NULL CHECK (max_depth BETWEEN 0 AND 8),
  max_fanout            INTEGER NOT NULL CHECK (max_fanout BETWEEN 1 AND 128),
  max_estimated_rows    BIGINT NOT NULL,
  budget_tokens         BIGINT NOT NULL,
  audit_hash            BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id)
);

CREATE TABLE agentic_context_sources (
  account_id            BIGINT NOT NULL,
  packet_id             UUID NOT NULL,
  source_seq            INTEGER NOT NULL,
  source_kind           TEXT NOT NULL CHECK (
    source_kind IN ('row', 'columnar', 'vector', 'procedure', 'tool')
  ),
  board_id              BIGINT,
  item_id               BIGINT,
  column_id             TEXT,
  vector_id             UUID,
  tool_lease_id         UUID,
  score                 DOUBLE PRECISION,
  freshness_watermark   TEXT NOT NULL,
  visibility            TEXT NOT NULL CHECK (
    visibility IN ('agent_visible', 'human_only', 'restricted')
  ),
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, packet_id, source_seq),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agentic_context_packets (account_id, packet_id)
);

CREATE TABLE agentic_procedure_memory (
  account_id            BIGINT NOT NULL,
  procedure_id          UUID NOT NULL,
  version               INTEGER NOT NULL,
  title                 TEXT NOT NULL,
  preconditions         JSONB NOT NULL,
  deterministic_steps   JSONB NOT NULL,
  rollback_hint         TEXT,
  review_state          TEXT NOT NULL CHECK (
    review_state IN ('draft', 'approved', 'retired')
  ),
  embedding_model       TEXT,
  embedding             vector(1536),
  metadata_tags         TEXT[] NOT NULL DEFAULT '{}',
  created_by            BIGINT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_hash            BYTEA NOT NULL,
  PRIMARY KEY (account_id, procedure_id, version)
);

CREATE INDEX agentic_context_sources_board_idx
  ON agentic_context_sources (account_id, board_id, source_kind, packet_id);

CREATE INDEX agentic_procedure_memory_state_idx
  ON agentic_procedure_memory (account_id, review_state, procedure_id, version DESC);

CREATE INDEX agentic_procedure_memory_hnsw_idx
  ON agentic_procedure_memory
  USING hnsw (embedding vector_cosine_ops)
  WHERE review_state = 'approved';
```

In production, the HNSW index should be physically or logically partitioned by
`account_id` to prevent cross-tenant candidate generation before post-filtering.
Post-filtering a global vector index by tenant is not sufficient for enterprise
isolation or predictable latency.

## Open API GraphQL shape

```graphql
input AgenticRetrievalGuardrailsInput {
  maxDepth: Int!
  maxFanout: Int!
  maxEstimatedRows: BigInt!
  maxEstimatedVectorCandidates: Int!
  timeoutMs: Int!
  budgetTokens: BigInt!
}

input AgenticSemanticQueryInput {
  embeddingModel: String!
  embedding: [Float!]!
  topK: Int!
  minScore: Float
}

input AgenticContextRequestInput {
  accountId: ID!
  boardIds: [ID!]!
  objective: String!
  sourceKinds: [AgenticSourceKind!]!
  semanticQuery: AgenticSemanticQueryInput
  requiredWatermark: String!
  allowStaleVectorMs: Int!
  guardrails: AgenticRetrievalGuardrailsInput!
}

type AgenticContextPacket {
  accountId: ID!
  packetId: ID!
  requestHash: String!
  resultWatermark: String!
  sources: [AgenticContextSource!]!
  procedures: [ProcedureMemoryRef!]!
  auditHash: String!
  createdAt: DateTime!
}

extend type Query {
  agenticContextPacket(packetId: ID!, accountId: ID!): AgenticContextPacket
}

extend type Mutation {
  createAgenticContextPacket(input: AgenticContextRequestInput!): AgenticContextPacket!
}
```

The API exposes the same deterministic packet used internally. This keeps the feature
API-first and makes agent-facing context inspectable by admins and auditors.

## Guardrails for expensive agent behavior

- Reject requests without `accountId` and at least one scoped `boardId`.
- Require `topK <= maxEstimatedVectorCandidates` and cap both per tenant tier.
- Require a budget reservation before row, columnar, vector, or tool fanout begins.
- Stop recursive agent loops when `maxDepth` is reached or when two consecutive
  context packets have the same objective hash and overlapping source fingerprints.
- Split timeouts by path, for example: 40% vector, 35% row/columnar, 15% procedure
  memory, 10% packet assembly and audit writes.
- Persist every admission decision and rejection with a deterministic audit hash.

## Performance checks for 1M+ row boards

Any proposal or query plan should be rejected or rewritten if it does one of the
following:

- Scans board items without predicates on both `account_id` and `board_id`.
- Runs semantic search with an unbounded `topK` or a vector index that is not tenant
  partitioned.
- Applies JSON/schemaless column filters after retrieving a large candidate set instead
  of using compiled schema contracts or indexed projections.
- Joins context packets to sources without the composite `(account_id, packet_id)` key.
- Runs columnar aggregations from an agent loop without preflight row-count estimates
  and budget reservation.

## Auditability and replay

Each packet should hash the normalized request, planner version, tenant policy version,
budget reservation, source watermarks, and ordered source identifiers:

```text
audit_hash = SHA256(
  account_id ||
  packet_id ||
  request_hash ||
  planner_version ||
  policy_version ||
  budget_reservation_id ||
  ordered_source_fingerprints ||
  result_watermark
)
```

This gives support, security, and enterprise admins a deterministic trace without
requiring the database to reproduce the LLM's probabilistic reasoning.

## Agent-ready perception metadata

Agents should perceive mondayDB data through curated metadata, not raw tables:

- `tags`: semantic labels such as `customer_escalation`, `blocked_status`, or
  `renewal_risk`.
- `visibility`: whether a source is safe for agent prompts.
- `freshnessWatermark`: whether row, columnar, and vector views are consistent enough.
- `procedureRefs`: approved instructions that tell the agent how to act.
- `sourceKind`: whether the fact came from transactional state, analytics, semantic
  memory, or a tool lease.

This metadata lets an LLM ground its response while mondayDB remains deterministic,
tenant-safe, and predictable under enterprise scale.
