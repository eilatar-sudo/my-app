# mondayDB Agentic Database Vision

Last updated: 2026-05-30

## Executive thesis

mondayDB should become agentic by exposing deterministic memory, retrieval,
planning, and guardrail primitives around the existing WorkOS data engine. The
database should not make probabilistic decisions. Instead, it should give agents
safe, auditable, tenant-scoped surfaces for perceiving work data, retrieving
semantic context, following stored procedures, and proving that each planned
query or tool action fits enterprise budgets.

The product trade-off is latency versus trust. A single opaque "AI query" could
feel fast in demos, but it weakens predictability, auditability, and multi-tenant
isolation. mondayDB should prefer explicit control-plane records and bounded
execution envelopes even when that adds a small planning step, because customers
need deterministic replay before they allow autonomous agents to operate on
mission-critical boards.

## Design principles

1. **Tenant scope is a physical invariant.** Every persisted record, vector
   partition, audit event, and GraphQL resolver must require `account_id`.
2. **Agents consume metadata, not magic.** The database stores instructions,
   retrieval hints, capabilities, budgets, and citations as normal versioned
   data with deterministic hashes.
3. **The row path remains transactional.** Agentic writes use mondayDB's hybrid
   row layer for ACID prepare and commit semantics. Columnar and vector paths are
   read-optimized derivatives with watermarks.
4. **Vector retrieval is bounded.** HNSW/pgvector-compatible search is allowed
   only through account-partitioned indexes, explicit `top_k`, budget caps, and
   source visibility filters.
5. **No unverified recursive execution.** Agent loops must acquire an execution
   envelope that caps depth, fan-out, row touches, vector probes, and tool calls.

## Product architecture

### 1. Agent memory control plane

**Why:** Agents need long-term and procedural memory, but database behavior must
remain deterministic. Storing memory as first-class mondayDB records makes
instructions reviewable, versioned, searchable, and revocable.

```ts
export type AgentMemoryKind =
  | "procedure"
  | "semantic_context"
  | "decision_preference"
  | "tool_instruction"
  | "retrieval_hint";

export interface AgentMemoryRecord {
  accountId: string;
  memoryId: string;
  kind: AgentMemoryKind;
  title: string;
  body: string;
  tags: string[];
  boardIds: string[];
  itemIds: string[];
  visibility: "account" | "workspace" | "board" | "private";
  ownerUserId: string;
  version: number;
  embeddingRef?: {
    model: string;
    vectorId: string;
    dimension: number;
    sourceWatermark: string;
  };
  proceduralSteps?: Array<{
    stepId: string;
    instruction: string;
    requiredCapability: string;
    maxEstimatedRows: number;
  }>;
  audit: {
    createdAt: string;
    updatedAt: string;
    deterministicHash: string;
    previousHash?: string;
  };
}
```

```sql
CREATE TABLE agent_memory_records (
  account_id          BIGINT NOT NULL,
  memory_id           UUID NOT NULL,
  kind                TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  board_ids           BIGINT[] NOT NULL DEFAULT '{}',
  item_ids            BIGINT[] NOT NULL DEFAULT '{}',
  visibility          TEXT NOT NULL,
  owner_user_id       BIGINT NOT NULL,
  version             INTEGER NOT NULL,
  embedding_model     TEXT,
  embedding_vector_id UUID,
  embedding_dimension INTEGER,
  source_watermark    TEXT,
  procedural_steps    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL,
  deterministic_hash  BYTEA NOT NULL,
  previous_hash       BYTEA,
  PRIMARY KEY (account_id, memory_id, version)
);

CREATE INDEX agent_memory_by_account_kind
  ON agent_memory_records (account_id, kind, updated_at DESC);

CREATE TABLE agent_memory_board_scope (
  account_id BIGINT NOT NULL,
  board_id   BIGINT NOT NULL,
  memory_id  UUID NOT NULL,
  version    INTEGER NOT NULL,
  PRIMARY KEY (account_id, board_id, memory_id, version),
  FOREIGN KEY (account_id, memory_id, version)
    REFERENCES agent_memory_records (account_id, memory_id, version)
);
```

**Performance check:** The resolver must never scan memories across accounts.
Board filters should be combined with `account_id` and `kind`; semantic lookup
should use the vector sidecar first, then hydrate only the returned memory IDs.
For boards with 1M+ rows, `item_ids` should be treated as citation metadata, not
as a primary filter for large joins.

**Agent perception:** LLMs perceive these records as durable instructions and
grounding snippets. `tags`, `kind`, `visibility`, `boardIds`, and
`proceduralSteps.requiredCapability` give the model a compact affordance map
without exposing raw neighboring tenant data.

### 2. Tenant-partitioned semantic retrieval plane

**Why:** Semantic retrieval makes mondayDB agent-ready for RAG, but unbounded
nearest-neighbor search can become a noisy-neighbor risk. The product should
offer fast retrieval with explicit consistency and cost semantics.

```ts
export interface SemanticRetrievalRequest {
  accountId: string;
  actorUserId: string;
  queryText: string;
  boardScope: string[];
  memoryKinds: AgentMemoryKind[];
  topK: number;
  maxVectorProbes: number;
  consistency: "latest_visible" | "watermark" | "snapshot";
  requiredWatermark?: string;
  includeCitations: boolean;
}

export interface SemanticRetrievalResult {
  accountId: string;
  requestHash: string;
  servedWatermark: string;
  results: Array<{
    memoryId: string;
    version: number;
    score: number;
    title: string;
    tags: string[];
    citationRefs: Array<{
      boardId: string;
      itemId?: string;
      columnId?: string;
      sourceWatermark: string;
    }>;
  }>;
  budget: {
    vectorProbesUsed: number;
    rowHydrationsUsed: number;
    estimatedCostUnits: number;
  };
}
```

```sql
CREATE TABLE agent_semantic_vectors (
  account_id          BIGINT NOT NULL,
  vector_id           UUID NOT NULL,
  source_type         TEXT NOT NULL,
  source_id           UUID NOT NULL,
  source_version      INTEGER NOT NULL,
  board_id            BIGINT,
  visibility          TEXT NOT NULL,
  embedding_model     TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  source_watermark    TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, vector_id)
);

-- In pgvector-compatible deployments, keep HNSW partitions tenant-prefixed.
-- Large accounts may use account-local shard tables to avoid global graph churn.
CREATE INDEX agent_semantic_vectors_scope
  ON agent_semantic_vectors (account_id, board_id, source_type, source_version);

-- If vectors are stored directly in pgvector, use account-local partitions.
-- Example child table name: agent_semantic_vector_embeddings_a12345.
CREATE TABLE agent_semantic_vector_embeddings (
  account_id BIGINT NOT NULL,
  vector_id  UUID NOT NULL,
  embedding  VECTOR(1536) NOT NULL,
  PRIMARY KEY (account_id, vector_id)
) PARTITION BY LIST (account_id);

-- Create HNSW indexes on account partitions, never as one global tenant-mixed graph.
-- CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

**Performance check:** A query with missing `account_id`, `topK > 100`, absent
visibility filters, or unlimited vector probes should be rejected before it
reaches HNSW. For a board with 1M+ rows, semantic retrieval must not hydrate all
candidate items; it should hydrate only the bounded vector result set and use
columnar aggregations for rollups.

**Agent perception:** The agent sees retrieval results as ranked, cited context
with watermarks. It can reason about freshness and source visibility without
guessing whether a result is complete.

### 3. Deterministic execution envelope

**Why:** Autonomous agents need to call tools and issue follow-up queries, but
enterprise tenants need predictable blast-radius limits. The envelope separates
planning from execution and turns "expensive" into a deterministic admission
decision.

```ts
export interface AgentExecutionEnvelope {
  accountId: string;
  envelopeId: string;
  actorUserId: string;
  agentId: string;
  purpose: string;
  allowedCapabilities: string[];
  boardScope: string[];
  maxDepth: number;
  maxToolCalls: number;
  maxRowTouches: number;
  maxColumnarBytes: number;
  maxVectorProbes: number;
  timeoutMs: number;
  consistency: "read_committed" | "snapshot" | "watermark";
  state: "draft" | "verified" | "active" | "exhausted" | "revoked";
  planHash: string;
  auditHash: string;
}
```

```sql
CREATE TABLE agent_execution_envelopes (
  account_id          BIGINT NOT NULL,
  envelope_id         UUID NOT NULL,
  actor_user_id       BIGINT NOT NULL,
  agent_id            TEXT NOT NULL,
  purpose             TEXT NOT NULL,
  allowed_capabilities TEXT[] NOT NULL,
  board_scope         BIGINT[] NOT NULL,
  max_depth           INTEGER NOT NULL,
  max_tool_calls      INTEGER NOT NULL,
  max_row_touches     BIGINT NOT NULL,
  max_columnar_bytes  BIGINT NOT NULL,
  max_vector_probes   BIGINT NOT NULL,
  timeout_ms          INTEGER NOT NULL,
  consistency         TEXT NOT NULL,
  state               TEXT NOT NULL,
  plan_hash           BYTEA NOT NULL,
  audit_hash          BYTEA NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE INDEX agent_execution_active_by_account
  ON agent_execution_envelopes (account_id, state, expires_at);
```

**Performance check:** Query admission must fail closed when estimates are
unknown for a recursive or cross-board plan. Any resolver that cannot estimate
row touches, vector probes, or columnar bytes should require human approval or a
smaller board scope before execution.

**Agent perception:** The envelope is the agent's operating contract. The LLM
can inspect remaining budget and allowed capabilities, but it cannot expand its
own limits; expansion is a deterministic API action with audit review.

### 4. Budget ledger

**Why:** Execution envelopes define maximum blast radius, but a ledger is needed
to debit actual usage deterministically as the agent retrieves, queries, and
calls tools. This protects neighboring tenants from recursive or unexpectedly
expensive behavior.

```ts
export interface AgentBudgetLedgerEntry {
  accountId: string;
  envelopeId: string;
  sequence: number;
  operation:
    | "row_query"
    | "columnar_aggregation"
    | "vector_search"
    | "tool_call"
    | "write_prepare"
    | "write_commit";
  rowTouches: number;
  columnarBytes: number;
  vectorProbes: number;
  toolCalls: number;
  remaining: {
    rowTouches: number;
    columnarBytes: number;
    vectorProbes: number;
    toolCalls: number;
    depth: number;
  };
  operationHash: string;
  createdAt: string;
}
```

```sql
CREATE TABLE agent_budget_ledger (
  account_id       BIGINT NOT NULL,
  envelope_id      UUID NOT NULL,
  sequence         BIGINT NOT NULL,
  operation        TEXT NOT NULL,
  row_touches      BIGINT NOT NULL DEFAULT 0,
  columnar_bytes   BIGINT NOT NULL DEFAULT 0,
  vector_probes    BIGINT NOT NULL DEFAULT 0,
  tool_calls       INTEGER NOT NULL DEFAULT 0,
  remaining_budget JSONB NOT NULL,
  operation_hash   BYTEA NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id, sequence),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_execution_envelopes (account_id, envelope_id)
);

CREATE INDEX agent_budget_recent_by_envelope
  ON agent_budget_ledger (account_id, envelope_id, created_at DESC);
```

**Performance check:** Ledger debits must be single-envelope writes keyed by
`(account_id, envelope_id, sequence)`. Do not compute remaining budget by
scanning history during query execution; store the post-debit balance on each
entry and use the latest sequence as the concurrency control point.

**Agent perception:** The agent can inspect a compact remaining-budget snapshot
instead of inferring resource usage from raw database metrics.

### 5. Audit and replay ledger

**Why:** Enterprise customers will only trust autonomous actions when support,
security, and admins can replay what the agent saw, planned, retrieved, and
changed. The ledger should be append-only and hash-chained per account.

```ts
export interface AgentAuditEvent {
  accountId: string;
  eventId: string;
  envelopeId: string;
  eventType:
    | "memory.created"
    | "retrieval.executed"
    | "plan.verified"
    | "tool.called"
    | "transaction.prepared"
    | "transaction.committed"
    | "budget.exhausted"
    | "guardrail.denied";
  actorUserId: string;
  deterministicInputHash: string;
  deterministicOutputHash: string;
  previousEventHash?: string;
  eventHash: string;
  createdAt: string;
}
```

```sql
CREATE TABLE agent_audit_events (
  account_id                 BIGINT NOT NULL,
  event_id                   UUID NOT NULL,
  envelope_id                UUID NOT NULL,
  event_type                 TEXT NOT NULL,
  actor_user_id              BIGINT NOT NULL,
  deterministic_input_hash   BYTEA NOT NULL,
  deterministic_output_hash  BYTEA NOT NULL,
  previous_event_hash        BYTEA,
  event_hash                 BYTEA NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agent_audit_by_envelope
  ON agent_audit_events (account_id, envelope_id, created_at);
```

**Performance check:** Audit writes must be append-only and colocated by
`account_id` to avoid cross-tenant hot partitions. Replay queries must be scoped
by `(account_id, envelope_id)` and paginated; account-wide scans should require
time windows.

**Agent perception:** Audit events become citations for the agent and for human
reviewers. The model can summarize "why this action happened" from ledger
metadata while deterministic hashes prove the exact replay packet.

## Open API GraphQL surface

Every resolver requires `accountId` and must validate the caller's tenant
membership before reading row, columnar, vector, or audit paths.

```graphql
scalar JSON

type AgentMemoryRecord {
  accountId: ID!
  memoryId: ID!
  kind: String!
  title: String!
  body: String!
  tags: [String!]!
  boardIds: [ID!]!
  visibility: String!
  version: Int!
  deterministicHash: String!
}

input CreateAgentMemoryInput {
  accountId: ID!
  kind: String!
  title: String!
  body: String!
  tags: [String!] = []
  boardIds: [ID!] = []
  visibility: String!
  proceduralSteps: JSON
}

input SemanticRetrievalInput {
  accountId: ID!
  queryText: String!
  boardScope: [ID!]!
  memoryKinds: [String!]!
  topK: Int!
  maxVectorProbes: Int!
  consistency: String!
  requiredWatermark: String
  includeCitations: Boolean! = true
}

type SemanticRetrievalResult {
  accountId: ID!
  requestHash: String!
  servedWatermark: String!
  results: [SemanticRetrievalHit!]!
  vectorProbesUsed: Int!
  rowHydrationsUsed: Int!
  estimatedCostUnits: Int!
}

type SemanticRetrievalHit {
  memoryId: ID!
  version: Int!
  score: Float!
  title: String!
  tags: [String!]!
  citationRefs: [AgentCitationRef!]!
}

type AgentCitationRef {
  boardId: ID!
  itemId: ID
  columnId: ID
  sourceWatermark: String!
}

input VerifyAgentExecutionInput {
  accountId: ID!
  agentId: ID!
  purpose: String!
  boardScope: [ID!]!
  allowedCapabilities: [String!]!
  proposedPlan: JSON!
  requestedBudgets: AgentBudgetInput!
}

input AgentBudgetInput {
  maxDepth: Int!
  maxToolCalls: Int!
  maxRowTouches: Int!
  maxColumnarBytes: Int!
  maxVectorProbes: Int!
  timeoutMs: Int!
}

type AgentExecutionEnvelope {
  accountId: ID!
  envelopeId: ID!
  state: String!
  allowedCapabilities: [String!]!
  boardScope: [ID!]!
  planHash: String!
  auditHash: String!
}

type AgentAuditEvent {
  accountId: ID!
  eventId: ID!
  envelopeId: ID!
  eventType: String!
  actorUserId: ID!
  deterministicInputHash: String!
  deterministicOutputHash: String!
  previousEventHash: String
  eventHash: String!
  createdAt: String!
}

type AgentAuditEventEdge {
  cursor: String!
  node: AgentAuditEvent!
}

type AgentAuditEventConnection {
  edges: [AgentAuditEventEdge!]!
  hasNextPage: Boolean!
}

extend type Query {
  searchAgentMemory(input: SemanticRetrievalInput!): SemanticRetrievalResult!
  agentAuditEvents(accountId: ID!, envelopeId: ID!, first: Int!, after: String): AgentAuditEventConnection!
}

extend type Mutation {
  createAgentMemory(input: CreateAgentMemoryInput!): AgentMemoryRecord!
  verifyAgentExecution(input: VerifyAgentExecutionInput!): AgentExecutionEnvelope!
}
```

## Guardrails for expensive recursive queries

1. **Admission first:** No agent query or tool call executes without a verified
   envelope.
2. **Depth counter:** Each retrieval, row query, aggregation, and tool call
   increments envelope depth and fails when `maxDepth` is exhausted.
3. **Fan-out limiter:** Cross-board plans must declare board scope; dynamic board
   expansion is a separate audited mutation.
4. **Cost ledger:** Row touches, columnar bytes, vector probes, and tool calls
   are debited atomically by `(account_id, envelope_id)`.
5. **Loop fingerprinting:** Repeated query signatures within the same envelope
   are denied or served from a semantic cache when source watermarks match.
6. **Tenant partitioning:** Vector indexes, audit logs, budget ledgers, and
   memory records are partitioned or indexed with `account_id` as the leading
   key.
7. **Human review threshold:** Plans with unknown estimates, unbounded filters,
   missing board scope, or writes over sensitive columns require approval before
   becoming active.

## Consistency model

The agentic layer should expose explicit freshness envelopes:

- **Transactional row writes:** ACID semantics on the row layer for prepared and
  committed agent writes.
- **Columnar analytics:** Read by snapshot or watermark; aggregation answers
  disclose the served watermark.
- **Vector retrieval:** Eventually refreshed from immutable change events; every
  hit carries the embedding source watermark.
- **Procedural memory:** Versioned and immutable after publication; updates
  create a new version and hash-chain audit event.

This favors predictable, explainable behavior over hiding asynchronous
enrichment lag. Agents can ask for newer watermarks, but mondayDB should return a
deterministic "not available yet" instead of guessing.

## Implementation seams

1. **Control-plane tables:** Add tenant-scoped memory, vector metadata,
   execution envelope, budget ledger, and audit event tables.
2. **Vector sidecar:** Maintain pgvector/HNSW-compatible account partitions fed
   by mondayDB change events. Store only vector IDs in the control plane and
   hydrate canonical row data after access checks.
3. **GraphQL resolvers:** Require `accountId`, validate membership, run planner
   admission, and return deterministic hashes and watermarks in every response.
4. **Planner estimator:** Estimate row touches, columnar bytes, vector probes,
   and tool calls before execution. Unknown estimates fail closed.
5. **Audit replay:** Persist input/output hashes and enough envelope metadata to
   reconstruct the exact plan, retrieval bundle, and write intent.

## Full-table-scan risk register

| Risk | Why it matters on 1M+ row boards | Required mitigation |
| --- | --- | --- |
| Missing `account_id` predicate | Cross-tenant leakage and global scans | Reject at resolver and planner layers |
| Unbounded `topK` vector search | HNSW graph churn and noisy-neighbor latency | Enforce `topK <= 100` and `maxVectorProbes` |
| JSON-only procedural filters | Poor selectivity for board-scale search | Add typed columns for kind, board scope, visibility, and version |
| Audit replay without envelope scope | Account-wide ledger scans | Require `(account_id, envelope_id)` plus pagination |
| Recursive board expansion | Agent can multiply query cost | Require explicit board scope and depth budget |
| Hydrating all semantic candidates | Converts vector search into row scan | Hydrate only bounded vector hits after access checks |

## Success criteria

- Agents can retrieve tenant-scoped semantic and procedural context with
  citations, watermarks, and deterministic request hashes.
- Every autonomous action is admitted through a bounded execution envelope.
- Every memory change, retrieval, tool call, and write intent is audit-replayable
  through a hash-chained ledger.
- GraphQL exposes the same first-class controls used internally by mondayDB.
- Query planning rejects unbounded or unknown-cost recursive behavior before it
  can impact neighboring tenants.
