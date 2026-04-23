# mondayDB Agentic Database Evolution Strategy

## 1) Why this direction now

mondayDB already wins on transactional speed and WorkOS scale. The next competitive edge is becoming the best **agent runtime data layer**, where autonomous workflows can plan, retrieve context, and execute tools safely.

The core product trade-off to manage is:

- **Latency vs. Consistency**: agents need sub-second retrieval loops, but enterprise tenants need deterministic ACID writes and predictable reads.
- **Flexibility vs. Isolation**: semantically rich retrieval must not weaken strict `account_id` isolation.
- **Autonomy vs. Cost Control**: agents should reason deeply, but the database must prevent runaway recursive query patterns.

## 2) Product principles (non-negotiable)

1. **Deterministic engine, probabilistic clients**  
   AI behavior can be non-deterministic; database behavior cannot.
2. **Multi-tenant safety by default**  
   Every table and every index path includes `account_id` in leading scope.
3. **API-first parity**  
   Any capability available internally must be exposed through monday.com GraphQL API.
4. **No unbounded scans at scale**  
   On boards with 1M+ rows, every critical path query must remain index-backed and budgeted.
5. **Audit everything**  
   Every agent-issued write and retrieval policy decision leaves a deterministic trace.

## 3) Capability architecture for the agentic era

### 3.1 Procedural memory (instructions an agent can execute)

Store reusable machine instructions as versioned, tenant-scoped artifacts.

```sql
CREATE TABLE agent_instruction_sets (
  account_id            BIGINT      NOT NULL,
  instruction_set_id    UUID        NOT NULL,
  board_id              BIGINT      NULL,
  name                  TEXT        NOT NULL,
  version               INTEGER     NOT NULL,
  status                TEXT        NOT NULL CHECK (status IN ('draft', 'active', 'deprecated')),
  instruction_dsl       JSONB       NOT NULL,
  deterministic_hash    TEXT        NOT NULL,
  created_by_user_id    BIGINT      NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, instruction_set_id, version)
);

CREATE INDEX idx_instruction_sets_scope
  ON agent_instruction_sets (account_id, board_id, status, created_at DESC);
```

Why this shape:
- Versioned instructions allow controlled rollout and rollback.
- `deterministic_hash` enables replay verification and audit-grade traceability.
- Optional `board_id` supports shared account-level playbooks and board-specific overrides.

### 3.2 Semantic memory (RAG-ready retrieval)

Store memory chunks and embeddings with explicit tenant scope and lifecycle metadata.

```sql
-- Requires pgvector extension
CREATE TABLE agent_memory_chunks (
  account_id            BIGINT        NOT NULL,
  memory_id             UUID          NOT NULL,
  board_id              BIGINT        NULL,
  item_id               BIGINT        NULL,
  source_type           TEXT          NOT NULL CHECK (source_type IN ('update', 'item', 'doc', 'integration')),
  content               TEXT          NOT NULL,
  token_count           INTEGER       NOT NULL,
  embedding             VECTOR(1536)  NOT NULL,
  embedding_model       TEXT          NOT NULL,
  semantic_tags         JSONB         NOT NULL DEFAULT '[]'::jsonb,
  importance_score      REAL          NOT NULL DEFAULT 0.0,
  freshness_ts          TIMESTAMPTZ   NOT NULL,
  retention_class       TEXT          NOT NULL CHECK (retention_class IN ('short', 'standard', 'legal_hold')),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX idx_memory_scope_filter
  ON agent_memory_chunks (account_id, board_id, source_type, freshness_ts DESC);

CREATE INDEX idx_memory_tags_gin
  ON agent_memory_chunks USING GIN (semantic_tags);

-- Per-tenant ANN strategy (HNSW) while preserving account-first filtering path
CREATE INDEX idx_memory_embedding_hnsw
  ON agent_memory_chunks USING hnsw (embedding vector_cosine_ops);
```

Why this shape:
- Retrieval remains tenant-aware through mandatory `account_id`.
- `semantic_tags`, `importance_score`, and `freshness_ts` help agents prioritize context.
- HNSW gives low-latency top-k retrieval for interactive agent loops.

### 3.3 Tool-use readiness and execution ledger

```sql
CREATE TABLE agent_tool_executions (
  account_id            BIGINT      NOT NULL,
  execution_id          UUID        NOT NULL,
  agent_run_id          UUID        NOT NULL,
  tool_name             TEXT        NOT NULL,
  request_payload       JSONB       NOT NULL,
  response_payload      JSONB       NULL,
  status                TEXT        NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed', 'blocked')),
  cost_units            BIGINT      NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ NULL,
  PRIMARY KEY (account_id, execution_id)
);

CREATE INDEX idx_tool_executions_run
  ON agent_tool_executions (account_id, agent_run_id, started_at DESC);
```

Why this shape:
- Tool usage becomes auditable and meterable.
- Cost and status fields support runtime guardrails and postmortem analysis.

## 4) Guardrails for predictable multi-tenant performance

### 4.1 Query budget envelopes (hard limits, deterministic behavior)

```sql
CREATE TABLE agent_query_budgets (
  account_id                  BIGINT      NOT NULL,
  budget_profile_id           UUID        NOT NULL,
  max_depth                   INTEGER     NOT NULL DEFAULT 4,
  max_vector_candidates       INTEGER     NOT NULL DEFAULT 200,
  max_tool_calls_per_run      INTEGER     NOT NULL DEFAULT 20,
  max_total_cost_units        BIGINT      NOT NULL DEFAULT 100000,
  max_runtime_ms              INTEGER     NOT NULL DEFAULT 8000,
  fail_mode                   TEXT        NOT NULL CHECK (fail_mode IN ('hard_stop', 'partial_results')),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, budget_profile_id)
);
```

Enforcement model:
1. Compile an execution plan with bounded operators only.
2. Reject plans that violate depth/candidate/runtime thresholds before execution.
3. Emit deterministic error codes (`BUDGET_EXCEEDED`, `PLAN_REJECTED_UNBOUNDED_SCAN`).

### 4.2 Full-scan prevention checklist (1M+ row boards)

Flag as high risk if any of the following is true:
- Vector retrieval executes without `account_id` + board/item scope prefilter.
- Sorts on unindexed high-cardinality columns.
- Graph expansion without depth limit.
- JSONB filter predicates without supporting GIN/BTree composite indexes.
- Cross-board joins that skip partition-friendly predicates.

## 5) API-first surface (GraphQL)

```ts
export interface AgentMemoryChunkInput {
  accountId: string; // required tenant scope
  boardId?: string;
  itemId?: string;
  sourceType: "update" | "item" | "doc" | "integration";
  content: string;
  semanticTags: string[];
  importanceScore?: number;
  retentionClass: "short" | "standard" | "legal_hold";
}

export interface AgentRetrievalRequest {
  accountId: string;
  boardId?: string;
  queryText: string;
  topK: number; // enforced by budget profile
  minFreshnessTs?: string;
  requiredTags?: string[];
  instructionSetId?: string;
}

export interface AgentRetrievalResult {
  memoryId: string;
  score: number;
  contentSnippet: string;
  semanticTags: string[];
  freshnessTs: string;
  provenance: {
    sourceType: string;
    itemId?: string;
  };
}
```

GraphQL contract requirements:
- `accountId` is required in all agentic mutations/queries.
- Responses include provenance metadata for auditability.
- Budget profile used for the request is returned in response extensions.

## 6) Reliability and enterprise controls

1. **99.99 availability**: isolate vector index maintenance from critical write path; graceful degradation to lexical fallback if ANN subsystem is unhealthy.
2. **ACID compliance**: keep memory writes transactional in row store, asynchronously projected to columnar/ANN read paths.
3. **Deterministic audit**: write append-only audit events for plan generation, budget checks, tool calls, and mutation commits.

```sql
CREATE TABLE agent_audit_events (
  account_id            BIGINT      NOT NULL,
  event_id              UUID        NOT NULL,
  agent_run_id          UUID        NOT NULL,
  event_type            TEXT        NOT NULL,
  event_payload         JSONB       NOT NULL,
  deterministic_hash    TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX idx_agent_audit_run
  ON agent_audit_events (account_id, agent_run_id, created_at);
```

## 7) How agents perceive the data model

Recommended metadata envelope attached to retrievable entities:

```ts
export interface AgentPerceptionMetadata {
  accountId: string;
  boardId?: string;
  entityType: "item" | "update" | "doc" | "instruction";
  semanticTags: string[];
  confidence?: number;
  freshnessTs: string;
  sensitivity: "public" | "internal" | "restricted";
  allowedTools: string[];
}
```

This enables:
- Better grounding (what this context means),
- Safer actions (which tools are allowed),
- Stronger governance (sensitivity-aware policies).

## 8) Implementation sequence (low-risk path)

1. **Foundation**: ship budget enforcement + audit events before enabling autonomous loops.
2. **Memory v1**: semantic chunks with strict tenant filters and top-k limits.
3. **Procedural memory**: versioned instruction sets with deterministic hash checks.
4. **Tool ledger**: full execution tracking and account-level budget tuning.
5. **Optimization**: per-tenant ANN tuning, hot-path caching, and query planner heuristics.

This sequence minimizes enterprise risk while enabling progressively more capable agent behavior.
