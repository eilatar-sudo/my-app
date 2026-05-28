# mondayDB Agentic Database Vision

## Why this matters

mondayDB is already optimized for WorkOS workloads: fast transactional updates,
large-scale board queries, analytics over columnar projections, and strict
multi-tenant isolation. The agentic era adds a new class of workload: autonomous
software that searches semantically, remembers procedures, proposes tool calls,
and may repeat query loops without human pacing.

The product trade-off is clear:

- **Latency vs. semantic depth:** Vector search improves agent relevance, but
  ANN traversal and reranking can add unpredictable latency if it is not bounded
  per tenant, board, and agent run.
- **Consistency vs. memory freshness:** Procedural and semantic memories should
  be useful quickly, but mondayDB must keep ACID writes deterministic and avoid
  letting asynchronous embedding pipelines change transactional truth.
- **Autonomy vs. neighbor safety:** Agents need tool-use readiness, but every
  agent query must pass deterministic cost, tenant, and recursion guardrails
  before it reaches shared compute.

The vision is deterministic infrastructure for probabilistic agents: mondayDB
stores facts, memories, permissions, costs, and audit traces in predictable
schemas, while LLMs consume those records as context and propose actions.

## North-star product capabilities

1. **Tenant-scoped semantic retrieval**
   - Every vector lookup is scoped by `account_id` and then narrowed by board,
     item, object type, and permission visibility.
   - HNSW indexes accelerate candidate generation, but deterministic filters
     decide whether a row is visible.

2. **Procedural memory as first-class data**
   - Reusable operating instructions, playbooks, and workflow constraints are
     versioned, auditable, and addressable through the monday.com Open API.
   - Agents retrieve procedures the same way they retrieve facts, but execution
     is authorized separately.

3. **Agent workload admission control**
   - Every agent-originated query carries an `agent_run_id`, declared intent,
     estimated cost, maximum recursion depth, and timeout budget.
   - mondayDB rejects or degrades work that would cause full scans, recursive
     fanout, or tenant-level budget exhaustion.

4. **Deterministic audit traces**
   - Semantic retrieval, procedure selection, query planning, and writes produce
     immutable audit events with content hashes and plan fingerprints.
   - Audit trails explain what the agent could see and which guardrail allowed
     or denied each step.

## Reference architecture

```text
GraphQL Open API
  |
  |-- Agent context headers: account, user, app, agent run
  v
Agentic Admission Plane
  |-- tenant scope verification
  |-- plan cost estimate
  |-- recursion and fanout limits
  |-- audit event creation
  v
mondayDB Query Router
  |-- row store: transactions and fresh item state
  |-- columnar store: analytics and aggregation projections
  |-- vector sidecar: pgvector/HNSW semantic candidates
  v
Deterministic Result Envelope
  |-- records
  |-- visibility proof
  |-- cost summary
  |-- audit event ids
  |-- agent perception metadata
```

## Core schema contracts

### TypeScript interfaces

```ts
export type AgenticObjectKind =
  | "board_item"
  | "column_value"
  | "doc"
  | "procedure"
  | "automation"
  | "tool_contract";

export interface AgenticEmbeddingRecord {
  accountId: string;
  boardId?: string;
  objectKind: AgenticObjectKind;
  objectId: string;
  sourceVersion: number;
  embeddingModel: string;
  embeddingDimension: number;
  metadataTags: string[];
  visibilityHash: string;
  contentHash: string;
  createdAt: string;
}

export interface AgenticProcedureMemory {
  accountId: string;
  procedureId: string;
  version: number;
  title: string;
  objective: string;
  instructionsMarkdown: string;
  requiredToolScopes: string[];
  guardrailPolicyId: string;
  metadataTags: string[];
  status: "draft" | "active" | "deprecated";
  contentHash: string;
  createdByUserId: string;
  createdAt: string;
}

export interface AgenticQueryEnvelope {
  accountId: string;
  userId: string;
  appId?: string;
  agentRunId: string;
  intent: "retrieve" | "aggregate" | "write" | "tool_prepare";
  maxRows: number;
  maxVectorCandidates: number;
  maxRecursionDepth: number;
  timeoutMs: number;
  explainRequired: boolean;
}

export interface AgenticResultEnvelope<TRecord> {
  accountId: string;
  agentRunId: string;
  records: TRecord[];
  perception: AgenticPerceptionMetadata[];
  cost: {
    rowStoreReads: number;
    columnarSegmentsRead: number;
    vectorCandidatesScanned: number;
    estimatedCpuMs: number;
  };
  auditEventIds: string[];
}

export interface AgenticPerceptionMetadata {
  objectKind: AgenticObjectKind;
  objectId: string;
  sourceVersion: number;
  semanticScore?: number;
  metadataTags: string[];
  visibility: "direct" | "derived" | "redacted";
  reason: string;
}
```

### SQL schemas

The physical implementation can remain decoupled across row, columnar, and
vector storage, but the logical contract should be explicit and tenant scoped.

```sql
CREATE TABLE agentic_embeddings (
  account_id           BIGINT NOT NULL,
  object_kind          TEXT NOT NULL,
  object_id            BIGINT NOT NULL,
  board_id             BIGINT,
  source_version       BIGINT NOT NULL,
  embedding_model      TEXT NOT NULL,
  embedding_dimension  INT NOT NULL,
  embedding            VECTOR(1536) NOT NULL,
  metadata_tags        TEXT[] NOT NULL DEFAULT '{}',
  visibility_hash      BYTEA NOT NULL,
  content_hash         BYTEA NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, object_kind, object_id, source_version)
);

CREATE INDEX agentic_embeddings_hnsw_idx
  ON agentic_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX agentic_embeddings_scope_idx
  ON agentic_embeddings (account_id, board_id, object_kind, created_at DESC);

CREATE TABLE agentic_procedure_memories (
  account_id             BIGINT NOT NULL,
  procedure_id           BIGINT NOT NULL,
  version                BIGINT NOT NULL,
  title                  TEXT NOT NULL,
  objective              TEXT NOT NULL,
  instructions_markdown  TEXT NOT NULL,
  required_tool_scopes   TEXT[] NOT NULL DEFAULT '{}',
  guardrail_policy_id    BIGINT NOT NULL,
  metadata_tags          TEXT[] NOT NULL DEFAULT '{}',
  status                 TEXT NOT NULL CHECK (status IN ('draft', 'active', 'deprecated')),
  content_hash           BYTEA NOT NULL,
  created_by_user_id     BIGINT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, procedure_id, version)
);

CREATE INDEX agentic_procedure_active_idx
  ON agentic_procedure_memories (account_id, status, created_at DESC)
  WHERE status = 'active';

CREATE TABLE agentic_guardrail_policies (
  account_id                BIGINT NOT NULL,
  policy_id                 BIGINT NOT NULL,
  max_rows                  BIGINT NOT NULL,
  max_vector_candidates     INT NOT NULL,
  max_recursion_depth       INT NOT NULL,
  max_columnar_segments     INT NOT NULL,
  timeout_ms                INT NOT NULL,
  require_indexed_predicate BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id)
);

CREATE TABLE agentic_audit_events (
  account_id        BIGINT NOT NULL,
  event_id          BIGINT NOT NULL,
  agent_run_id      UUID NOT NULL,
  event_type        TEXT NOT NULL,
  object_kind       TEXT,
  object_id         BIGINT,
  plan_fingerprint  BYTEA NOT NULL,
  content_hash      BYTEA,
  decision          TEXT NOT NULL CHECK (decision IN ('allowed', 'denied', 'degraded')),
  reason_code       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_audit_run_idx
  ON agentic_audit_events (account_id, agent_run_id, created_at DESC);
```

## Open API GraphQL surface

Every resolver derives `account_id` from authentication context. Clients may
provide board filters, object kinds, and intent, but cannot override tenant
scope.

```graphql
type AgenticPerception {
  objectKind: String!
  objectId: ID!
  sourceVersion: Int!
  semanticScore: Float
  metadataTags: [String!]!
  visibility: String!
  reason: String!
}

type AgenticCostSummary {
  rowStoreReads: Int!
  columnarSegmentsRead: Int!
  vectorCandidatesScanned: Int!
  estimatedCpuMs: Int!
}

type AgenticSearchResult {
  recordsJson: JSON!
  perception: [AgenticPerception!]!
  cost: AgenticCostSummary!
  auditEventIds: [ID!]!
}

input AgenticSearchInput {
  query: String!
  boardIds: [ID!]
  objectKinds: [String!]!
  metadataTags: [String!]
  maxRows: Int = 50
  maxVectorCandidates: Int = 200
  agentRunId: ID!
  intent: String!
}

extend type Query {
  agenticSearch(input: AgenticSearchInput!): AgenticSearchResult!
}
```

## Query execution invariants

1. **Tenant scope first**
   - The first predicate in every logical plan is `account_id = auth.account_id`.
   - Vector candidate generation must receive tenant and visibility filters
     before ANN expansion, not after reranking.

2. **No unbounded agent scans**
   - Agentic queries on boards with 1M+ rows require at least one indexed
     predicate besides `account_id`: `board_id`, `item_id`, object kind,
     partition timestamp, or metadata tag.
   - Any query that would scan all board items, all column values, or all vector
     embeddings for an account is denied unless it is routed through an approved
     offline job class.

3. **ACID writes stay in the row store**
   - Agent-generated writes use the same transactional path as human writes.
   - Embeddings and columnar projections are derived asynchronously from
     committed row-store versions.

4. **Semantic ranking cannot grant permission**
   - HNSW similarity only ranks candidate records.
   - Authorization and visibility checks are deterministic predicates over
     account, user, board, workspace, and app scopes.

5. **Recursive loops are budgeted**
   - Each `agent_run_id` accumulates vector candidates scanned, row reads,
     columnar segments read, tool preparations, and recursion depth.
   - The admission plane denies the next step when the budget is exhausted,
     even if each individual query is valid.

## Performance checklist

- **Potential full table scan:** `agenticSearch` with no `boardIds`, no
  `objectKinds`, and no `metadataTags` can degrade into a tenant-wide vector
  scan. Reject it for online requests.
- **Potential columnar fanout:** Aggregations over all boards in an account
  should require partition pruning and segment-level statistics before reading
  columnar blocks.
- **HNSW index sizing:** Store embeddings per tenant-aware partition or shard so
  large enterprise accounts do not dominate cache residency for smaller tenants.
- **Freshness envelope:** Return `sourceVersion` and projection freshness so the
  agent knows whether a semantic result reflects the latest committed item.
- **Backpressure:** Apply per-account and per-agent-run budgets before query
  routing to protect neighboring tenants.

## Agent perception model

Agents should see data as evidence, not as hidden database internals. Each
record returned to an LLM should include:

- `objectKind` and `objectId` so the agent can cite and revisit sources.
- `sourceVersion` so stale memories are detectable.
- `metadataTags` such as `["sales", "renewal", "procedure"]` for planning.
- `semanticScore` for relevance, explicitly labeled as non-authoritative.
- `visibility` and `reason` so redactions are explainable without leaking data.
- `auditEventIds` so downstream tool calls can be traced to the retrieval that
  justified them.

This keeps mondayDB deterministic while making its data legible to agents.
