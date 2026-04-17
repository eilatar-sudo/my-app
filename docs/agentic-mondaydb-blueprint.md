# mondayDB Agentic Database Blueprint

## 1) Why this evolution, now

mondayDB already optimizes for transactional reliability and high-throughput WorkOS workloads. The agentic shift introduces a new product expectation: users and agents should be able to retrieve context, execute safe actions, and learn from historical workflows in near real-time.

The core trade-off is:

- **Richer agent context vs. deterministic engine behavior**  
  We should make semantic and procedural context first-class data, but keep query execution deterministic, explainable, and tenant-scoped.
- **Low-latency retrieval vs. strict isolation and ACID semantics**  
  Vector search and memory indexing should not weaken transaction guarantees or create noisy-neighbor effects.
- **Fast experimentation vs. enterprise predictability**  
  New agentic features must be API-first, auditable, and guarded by explicit budgets/quotas.

## 2) Target state: three data primitives for the Agentic Era

Introduce three engine-level primitives that sit beside existing rows/columns:

1. **Semantic Memory Records**: embeddings + metadata for RAG.
2. **Procedural Memory Blocks**: deterministic “how-to” instructions for agent workflows.
3. **Agent Execution Ledger**: immutable action trail for auditability, replay, and policy enforcement.

All three must be hard-scoped by `account_id`, and exposed through GraphQL API contracts.

---

## 3) Schema design (SQL + TypeScript)

### 3.1 Semantic memory (RAG-compatible)

> Goal: efficient semantic retrieval without full table scans on large boards.

```sql
-- Extension assumed in compute layer where vector ops are enabled
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE semantic_memory (
  id                BIGSERIAL PRIMARY KEY,
  account_id        BIGINT NOT NULL,
  board_id          BIGINT NOT NULL,
  item_id           BIGINT,
  source_type       TEXT NOT NULL,        -- 'item_update' | 'doc' | 'automation_log' | ...
  source_ref        TEXT NOT NULL,        -- stable source key
  content           TEXT NOT NULL,
  embedding         VECTOR(1536) NOT NULL,
  embedding_model   TEXT NOT NULL,
  tokens_estimate   INT NOT NULL DEFAULT 0,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_semantic_memory_scope
  ON semantic_memory(account_id, board_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_semantic_memory_source
  ON semantic_memory(account_id, source_type, source_ref)
  WHERE deleted_at IS NULL;

-- ANN index (HNSW) with mandatory tenant prefilter in planner/query path
CREATE INDEX idx_semantic_memory_embedding_hnsw
  ON semantic_memory
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

```ts
export interface SemanticMemoryRecord {
  id: string;
  accountId: string;
  boardId: string;
  itemId?: string;
  sourceType: "item_update" | "doc" | "automation_log" | "integration_event";
  sourceRef: string;
  content: string;
  embeddingModel: string;
  embeddingDimensions: 1536;
  metadata: {
    labels?: string[];
    columnIds?: string[];
    actorType?: "user" | "automation" | "agent";
    piiClass?: "none" | "low" | "high";
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

### 3.2 Procedural memory (agent instructions)

> Goal: store deterministic, reviewable instructions an agent can execute.

```sql
CREATE TABLE procedural_memory (
  id                BIGSERIAL PRIMARY KEY,
  account_id        BIGINT NOT NULL,
  board_id          BIGINT NOT NULL,
  name              TEXT NOT NULL,
  version           INT NOT NULL,
  status            TEXT NOT NULL,        -- 'draft' | 'active' | 'deprecated'
  instruction_dsl   JSONB NOT NULL,       -- deterministic action graph, no free-form code execution
  tool_whitelist    JSONB NOT NULL,       -- explicitly allowed tool identifiers
  max_steps         INT NOT NULL DEFAULT 20,
  max_cost_units    INT NOT NULL DEFAULT 1000,
  owner_user_id     BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, board_id, name, version)
);

CREATE INDEX idx_procedural_memory_scope
  ON procedural_memory(account_id, board_id, status);
```

```ts
export interface ProceduralMemoryBlock {
  id: string;
  accountId: string;
  boardId: string;
  name: string;
  version: number;
  status: "draft" | "active" | "deprecated";
  instructionDsl: {
    steps: Array<{
      id: string;
      action: "query" | "mutate" | "notify" | "wait";
      inputSchemaRef: string;
      outputSchemaRef: string;
      retryPolicy?: { maxRetries: number; backoffMs: number };
    }>;
    transitions: Array<{ from: string; to: string; when: string }>;
  };
  toolWhitelist: string[];
  maxSteps: number;
  maxCostUnits: number;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 Agent execution ledger (audit + replay)

> Goal: deterministic trace for every agent-triggered read/mutation.

```sql
CREATE TABLE agent_execution_ledger (
  id                    BIGSERIAL PRIMARY KEY,
  account_id            BIGINT NOT NULL,
  board_id              BIGINT NOT NULL,
  agent_run_id          TEXT NOT NULL,
  procedural_memory_id  BIGINT,
  step_id               TEXT NOT NULL,
  action_type           TEXT NOT NULL, -- 'read' | 'write' | 'tool_call'
  query_fingerprint     TEXT,          -- normalized hash for reproducibility
  rows_scanned          BIGINT NOT NULL DEFAULT 0,
  rows_touched          BIGINT NOT NULL DEFAULT 0,
  cost_units            INT NOT NULL DEFAULT 0,
  status                TEXT NOT NULL, -- 'success' | 'rejected' | 'failed'
  error_code            TEXT,
  trace_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_ledger_scope_time
  ON agent_execution_ledger(account_id, board_id, created_at DESC);

CREATE INDEX idx_agent_ledger_run
  ON agent_execution_ledger(account_id, agent_run_id, step_id);
```

```ts
export interface AgentExecutionLedgerEntry {
  id: string;
  accountId: string;
  boardId: string;
  agentRunId: string;
  proceduralMemoryId?: string;
  stepId: string;
  actionType: "read" | "write" | "tool_call";
  queryFingerprint?: string;
  rowsScanned: number;
  rowsTouched: number;
  costUnits: number;
  status: "success" | "rejected" | "failed";
  errorCode?: string;
  trace: {
    requestId: string;
    actorId?: string;
    policyDecisions: string[];
    latencyMs: number;
  };
  createdAt: string;
}
```

---

## 4) Guardrails: keep the engine deterministic and neighbors safe

### 4.1 Mandatory tenant scoping

- Every API and planner path must inject `account_id = $callerAccountId`.
- Reject any query plan lacking tenant predicate before execution.
- For vector retrieval, enforce tenant prefilter before ANN candidate evaluation.

### 4.2 Agent query budget enforcement

Introduce per-run and per-account budgets:

- `max_rows_scanned_per_step`
- `max_recursive_depth`
- `max_cost_units_per_run`
- `max_concurrent_agent_queries_per_account`

If a limit is exceeded, fail closed with deterministic error codes (`AGENT_BUDGET_EXCEEDED`, `AGENT_RECURSION_LIMIT`).

### 4.3 Recursive query protection

- Detect cyclic tool-call graphs from `instruction_dsl.transitions`.
- Carry a deterministic run context token: `{run_id, depth, cumulative_cost}`.
- Hard-stop recursion at depth boundary and log rejection to ledger.

### 4.4 Full table scan prevention on 1M+ row boards

**Risk flagged:** semantic fallback queries without indexable predicates can degrade into full scans.

Mitigations:

- Require at least one selective filter (`board_id`, `updated_at`, tag/metadata key) for memory retrieval.
- Enforce index-aware query linting in API layer.
- Add adaptive sampling or top-K cap for large-board reads.
- Reject unbounded GraphQL queries from agent paths.

---

## 5) API-first contract (GraphQL)

```graphql
type SemanticMemory {
  id: ID!
  accountId: ID!
  boardId: ID!
  itemId: ID
  sourceType: String!
  sourceRef: String!
  content: String!
  metadata: JSON!
  createdAt: DateTime!
}

type AgentExecutionLedgerEntry {
  id: ID!
  accountId: ID!
  boardId: ID!
  agentRunId: String!
  stepId: String!
  actionType: String!
  rowsScanned: Long!
  rowsTouched: Long!
  costUnits: Int!
  status: String!
  trace: JSON!
  createdAt: DateTime!
}

input SemanticSearchInput {
  boardId: ID!
  query: String!
  topK: Int = 20
  metadataFilter: JSON
  maxLatencyMs: Int = 150
}

type Query {
  semanticSearch(input: SemanticSearchInput!): [SemanticMemory!]!
  agentExecutionLedger(agentRunId: String!, boardId: ID!): [AgentExecutionLedgerEntry!]!
}
```

Notes:

- GraphQL resolvers must enforce tenant context server-side, never trust client-supplied `accountId`.
- `semanticSearch` should enforce bounded `topK` and reject missing `boardId`.

---

## 6) How an LLM/Agent perceives this data

To make retrieval and reasoning robust, memory records should include explicit machine-readable tags:

- `intent`: `"summarize_board" | "triage_incident" | "generate_followup"`
- `confidence`: numeric score from ingestion pipeline
- `freshness_tier`: `"realtime" | "hourly" | "historical"`
- `sensitivity`: `"public" | "internal" | "restricted"`

This allows policy-aware prompt assembly and deterministic filtering before inference.

---

## 7) Reliability and performance SLO alignment

- **99.99% availability:** isolate vector index maintenance from transactional write path using async embedding pipelines and idempotent retries.
- **ACID compliance:** writes to core row store remain source of truth; semantic/procedural layers are append/update projections with versioning.
- **Low-latency queries:** prefer precomputed embeddings and HNSW indices; keep hot metadata in row-store indexes for selective filtering.

Operational controls:

- Canary rollout by account tier.
- Per-feature kill switches (`semantic_search_enabled`, `agent_write_enabled`).
- Deterministic audit replay from `agent_execution_ledger`.

---

## 8) Incremental implementation plan (low-risk sequence)

1. **Phase A: Ledger first**  
   Ship `agent_execution_ledger` and budget enforcement hooks before autonomous writes.
2. **Phase B: Semantic memory read path**  
   Add ingest + vector retrieval with strict tenant and bounded query constraints.
3. **Phase C: Procedural memory + controlled execution**  
   Enable DSL-backed agent actions with allowlisted tools and deterministic policy checks.
4. **Phase D: Enterprise hardening**  
   Add replay tooling, anomaly alerts, and per-account adaptive quotas.

This order minimizes risk: observability and controls come before expanded agent autonomy.
