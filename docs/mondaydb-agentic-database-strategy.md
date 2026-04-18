# mondayDB Agentic Database Strategy

## 1) Why before how: product trade-offs

The core product tension is **agentic flexibility vs deterministic database behavior**.

- If we over-optimize for agent freedom (deep recursive tool chains, unconstrained retrieval), we risk noisy-neighbor incidents and unpredictable latency.
- If we over-optimize for strict determinism, agent experiences become shallow and lose value for planning, memory, and automation.

Strategic position:

1. Keep the **data plane deterministic** (ACID transactions, fixed query semantics, auditable writes).
2. Add agentic features as **explicit primitives** (vector index, procedural memory, tool policy tables), not implicit behavior.
3. Enforce **tenant-scoped guardrails** at query planning time and execution time.

This preserves enterprise trust while enabling agent-native product capabilities.

## 2) Target capabilities and architecture implications

### A. Semantic retrieval (RAG-ready)

Why:
- Agents need contextual recall over board updates, docs, and event history.
- Retrieval quality is directly tied to task completion quality.

How:
- Introduce tenant-scoped embedding tables with HNSW index.
- Keep embeddings and chunk metadata in row store for updates; use columnar projections for aggregate analytics on retrieval quality.

### B. Procedural memory

Why:
- Agents need reusable instructions ("how to close quarter-end board", "how to triage incidents").
- Procedural memory reduces repeated prompt overhead and increases consistency.

How:
- Store versioned, deterministic playbooks as structured steps with policy bindings.
- Every execution references immutable playbook version + input snapshot hash.

### C. Tool-use readiness with guardrails

Why:
- Agentic workflows require calling internal/external tools via Open API.
- Without controls, recursive plans can trigger expensive fan-out queries.

How:
- Introduce per-account and per-agent budget limits (depth, row scan quota, token quota, time quota).
- Add static and runtime cost checks before query execution.

## 3) Core schema design (SQL)

> All tables are explicitly tenant-scoped with `account_id` and include deterministic audit fields.

```sql
-- 3.1 Procedural memory: versioned playbooks
CREATE TABLE agent_playbook (
  account_id          BIGINT NOT NULL,
  playbook_id         UUID   NOT NULL,
  version             INT    NOT NULL,
  name                TEXT   NOT NULL,
  description         TEXT   NOT NULL,
  status              TEXT   NOT NULL CHECK (status IN ('draft', 'active', 'deprecated')),
  steps_json          JSONB  NOT NULL, -- deterministic step graph, no executable code blobs
  tool_policy_id      UUID   NOT NULL,
  created_by_user_id  BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum_sha256     TEXT   NOT NULL, -- immutable version fingerprint
  PRIMARY KEY (account_id, playbook_id, version)
);

CREATE INDEX idx_agent_playbook_account_status
  ON agent_playbook (account_id, status, created_at DESC);

-- 3.2 Semantic memory: chunked content + embeddings
CREATE TABLE agent_memory_chunk (
  account_id            BIGINT NOT NULL,
  memory_id             UUID   NOT NULL,
  chunk_id              UUID   NOT NULL,
  source_type           TEXT   NOT NULL, -- board_item, update, doc, webhook_event, etc.
  source_ref            TEXT   NOT NULL, -- stable source pointer
  text_content          TEXT   NOT NULL,
  embedding             VECTOR(1536) NOT NULL,
  metadata_json         JSONB  NOT NULL, -- board_id, group_id, item_id, column tags, pii flags
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, memory_id, chunk_id)
);

-- HNSW for ANN recall, still scoped by account_id in query predicate.
CREATE INDEX idx_agent_memory_chunk_embedding_hnsw
  ON agent_memory_chunk USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_agent_memory_chunk_account_source
  ON agent_memory_chunk (account_id, source_type, created_at DESC);

-- 3.3 Tool policy and query budgets
CREATE TABLE agent_tool_policy (
  account_id             BIGINT NOT NULL,
  tool_policy_id         UUID   NOT NULL,
  policy_name            TEXT   NOT NULL,
  max_recursion_depth    INT    NOT NULL DEFAULT 4,
  max_rows_scanned       BIGINT NOT NULL DEFAULT 500000,
  max_execution_ms       INT    NOT NULL DEFAULT 2000,
  max_tools_per_run      INT    NOT NULL DEFAULT 20,
  allow_external_network BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, tool_policy_id)
);

-- 3.4 Deterministic execution trace
CREATE TABLE agent_execution_trace (
  account_id             BIGINT NOT NULL,
  execution_id           UUID   NOT NULL,
  agent_id               UUID   NOT NULL,
  playbook_id            UUID,
  playbook_version       INT,
  input_snapshot_hash    TEXT   NOT NULL,
  plan_hash              TEXT   NOT NULL,
  status                 TEXT   NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'aborted_policy')),
  depth_reached          INT    NOT NULL DEFAULT 0,
  rows_scanned_total     BIGINT NOT NULL DEFAULT 0,
  tools_invoked_total    INT    NOT NULL DEFAULT 0,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,
  failure_reason         TEXT,
  PRIMARY KEY (account_id, execution_id)
);

CREATE INDEX idx_agent_execution_trace_account_started
  ON agent_execution_trace (account_id, started_at DESC);
```

### Performance check (SQL)

For 1M+ row boards, queries must include at least:

- `account_id = ?` (mandatory)
- `board_id = ?` or other high-selectivity partition key in `metadata_json`
- `LIMIT` for retrieval candidates before re-ranking

Avoid any retrieval/query path that can degenerate into:

- full table scan on `agent_memory_chunk`
- cross-account ANN search without strict `account_id` filter
- unbounded recursive joins or repeated tool invocations

## 4) TypeScript interfaces for API/data contracts

```ts
export interface AgentPlaybookStep {
  stepId: string;
  kind: "query" | "mutation" | "tool_call" | "condition" | "wait";
  instruction: string;
  toolName?: string;
  inputSchema?: Record<string, unknown>;
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };
  nextStepIds: string[];
}

export interface AgentPlaybookVersion {
  accountId: string;
  playbookId: string;
  version: number;
  name: string;
  description: string;
  status: "draft" | "active" | "deprecated";
  steps: AgentPlaybookStep[];
  toolPolicyId: string;
  checksumSha256: string;
  createdByUserId: string;
  createdAt: string;
}

export interface AgentMemoryChunk {
  accountId: string;
  memoryId: string;
  chunkId: string;
  sourceType: "board_item" | "update" | "doc" | "webhook_event";
  sourceRef: string;
  textContent: string;
  embeddingModel: string;
  embeddingDimension: 1536;
  metadata: {
    boardId?: string;
    itemId?: string;
    groupId?: string;
    tags?: string[];
    piiClass?: "none" | "low" | "restricted";
    freshnessScore?: number;
  };
  createdAt: string;
}

export interface AgentToolPolicy {
  accountId: string;
  toolPolicyId: string;
  policyName: string;
  maxRecursionDepth: number;
  maxRowsScanned: number;
  maxExecutionMs: number;
  maxToolsPerRun: number;
  allowExternalNetwork: boolean;
}

export interface AgentExecutionTrace {
  accountId: string;
  executionId: string;
  agentId: string;
  playbookId?: string;
  playbookVersion?: number;
  inputSnapshotHash: string;
  planHash: string;
  status: "started" | "succeeded" | "failed" | "aborted_policy";
  depthReached: number;
  rowsScannedTotal: number;
  toolsInvokedTotal: number;
  startedAt: string;
  completedAt?: string;
  failureReason?: string;
}
```

## 5) Open API (GraphQL) surface design

Expose features via explicit API-first primitives:

- `upsertAgentPlaybookVersion(input)`
- `activateAgentPlaybookVersion(accountId, playbookId, version)`
- `ingestAgentMemoryChunks(input[])`
- `queryAgentMemory(input: { accountId, queryEmbedding, k, filters, budget })`
- `startAgentExecution(input)`
- `getAgentExecutionTrace(accountId, executionId)`
- `upsertAgentToolPolicy(input)`

GraphQL resolver requirements:

1. Inject `account_id` server-side from auth context (never trust caller-provided tenant scope alone).
2. Log deterministic audit event per mutation.
3. Reject requests failing budget pre-checks before touching storage layers.

## 6) Agentic guardrails (anti-recursion and anti-noisy-neighbor)

### Pre-execution checks

- Static plan validation:
  - no cyclic playbook graph unless node type is explicit bounded loop with max iterations
  - all query steps must include tenant + partition predicates
  - reject missing `LIMIT` on non-point lookups
- Cost estimation:
  - predicted rows scanned
  - predicted tool fan-out
  - ANN candidate set size

### Runtime enforcement

- Hard stop when any policy budget is exceeded:
  - recursion depth
  - rows scanned
  - execution time
  - tool invocation count
- Per-account token bucket rate limiter for agent-triggered queries.
- Circuit breaker on rising p95/p99 latency by tenant and global cluster.

### Post-execution controls

- Persist execution trace with deterministic hashes.
- Asynchronous policy violation analyzer to refine safe defaults.

## 7) Multi-tenant isolation and auditability

- Include `account_id` in every PK and critical index prefix.
- Enforce row-level security semantics (or equivalent middleware guarantees) on all read/write paths.
- Include immutable hashes (`input_snapshot_hash`, `plan_hash`) in execution trace for replayability.
- Keep AI decisioning out of the storage engine: planner chooses from deterministic policies, never opaque model-only overrides.

## 8) How agents should perceive data (agent-ready metadata)

Every memory chunk and playbook step should include metadata that supports robust agent reasoning:

- `intent_tags`: planning, reporting, triage, update, escalation
- `domain_tags`: sales, engineering, support, finance
- `trust_tier`: system_verified, user_generated, inferred
- `freshness`: event time + ingestion time
- `sensitivity`: pii class and handling rules

This enables agents to prioritize recent, trustworthy, and policy-safe context while preserving deterministic retrieval filters.

## 9) Rollout strategy (safe evolution)

1. **Foundation**
   - Add schema + API for tool policy and execution trace.
   - Ship read-only observability for agent runs.

2. **Semantic layer**
   - Add memory chunk ingestion and ANN retrieval with strict tenant filters.
   - Validate p95 latency and recall quality by tenant segment.

3. **Procedural automation**
   - Enable active playbooks with bounded execution.
   - Add account-level policy templates and admin controls.

4. **Optimization**
   - Adaptive ANN candidate sizing by query budget.
   - Hot/cold memory tiering across row and columnar layers.

## 10) Success criteria

- Reliability: no regressions to 99.99% availability targets.
- Isolation: zero cross-tenant retrieval incidents.
- Performance: agent retrieval within interactive latency budgets at 1M+ row board scale.
- Governance: 100% of agent mutations and runs produce deterministic trace records.

