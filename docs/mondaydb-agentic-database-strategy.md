# mondayDB: Strategic Blueprint for an Agentic Database

## 1) Why this direction now (before the how)

### Product tension to manage

1. **Latency vs. Consistency**
   - Agents want instant retrieval (sub-100ms recall) and iterative tool calls.
   - Enterprise workloads require strict ACID semantics for board updates and automations.
   - **Decision:** keep transactional writes in the deterministic row layer; run semantic retrieval in a derived, asynchronously indexed path with explicit freshness metadata.

2. **Agent power vs. Tenant safety**
   - Agents can generate recursive, broad, and expensive query plans.
   - Multi-tenant systems cannot allow "one noisy agent" to degrade neighboring accounts.
   - **Decision:** enforce account-scoped query planning and cost budgets at compile time and runtime, with deterministic rejections.

3. **Feature velocity vs. Platform predictability**
   - AI-facing capabilities evolve quickly (new embedding models, tool schemas).
   - Core DB behavior must remain stable and auditable.
   - **Decision:** isolate AI variability in versioned metadata and pluggable index pipelines while keeping the core query engine deterministic.

---

## 2) North Star capabilities for the Agentic Database

### A. Procedural memory (instructions agents can execute safely)
- Store reusable "how-to" artifacts (playbooks, workflows, prompt fragments, tool templates) as first-class data entities.
- Version and scope procedural memory by `account_id`, `workspace_id`, and optional `board_id`.
- Support policy checks before execution (allowed tools, row limits, timeout budgets).

### B. Semantic retrieval for operational context
- Vectorize board/item/activity content and procedural memory into an account-scoped embedding index.
- Combine lexical filters (tenant, board, permissions, recency) with vector similarity (HNSW/pgvector compatible).
- Return deterministic ranking metadata (scores, filters applied, index version) for auditability.

### C. Tool-use readiness
- Publish discoverable, typed tool contracts via the Open API (GraphQL) so agents can enumerate safe actions.
- Require declared side effects and budget classes per tool.
- Enforce circuit breakers for recursive tool chains.

---

## 3) Proposed data model (SQL) with multi-tenant and audit controls

> All tables include `account_id` and MUST be indexed for tenant-first access patterns.

```sql
-- 3.1 Procedural memory units
CREATE TABLE agent_procedural_memory (
  id                BIGSERIAL PRIMARY KEY,
  account_id        BIGINT NOT NULL,
  workspace_id      BIGINT NOT NULL,
  board_id          BIGINT NULL,
  memory_key        TEXT NOT NULL, -- unique logical key (e.g. "triage-bug-playbook")
  instruction_text  TEXT NOT NULL, -- deterministic instruction body
  tool_contract_ref TEXT NOT NULL, -- reference to registered tool contract version
  policy_json       JSONB NOT NULL, -- max_rows, max_depth, allowed_tools, timeout_ms
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  version           INTEGER NOT NULL DEFAULT 1,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        BIGINT NOT NULL,
  updated_by        BIGINT NOT NULL,
  UNIQUE(account_id, workspace_id, memory_key, version)
);

CREATE INDEX idx_apm_tenant_scope
  ON agent_procedural_memory(account_id, workspace_id, board_id, is_active);

-- 3.2 Semantic chunks (source of vector indexing)
CREATE TABLE agent_semantic_chunk (
  id                BIGSERIAL PRIMARY KEY,
  account_id        BIGINT NOT NULL,
  workspace_id      BIGINT NOT NULL,
  board_id          BIGINT NULL,
  source_type       TEXT NOT NULL, -- item, update, doc, memory
  source_id         BIGINT NOT NULL,
  chunk_ordinal     INTEGER NOT NULL,
  content_text      TEXT NOT NULL,
  metadata_json     JSONB NOT NULL, -- labels, entity references, permissions snapshot
  embedding_model   TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, source_type, source_id, chunk_ordinal, embedding_version)
);

CREATE INDEX idx_asc_tenant_source
  ON agent_semantic_chunk(account_id, source_type, source_id);

-- If pgvector is available:
-- ALTER TABLE agent_semantic_chunk ADD COLUMN embedding VECTOR(1536);
-- CREATE INDEX idx_asc_tenant_hnsw
--   ON agent_semantic_chunk
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 128)
--   WHERE account_id IS NOT NULL;

-- 3.3 Query budget policy (deterministic guardrails)
CREATE TABLE agent_query_budget_policy (
  id                  BIGSERIAL PRIMARY KEY,
  account_id          BIGINT NOT NULL,
  policy_name         TEXT NOT NULL,
  max_cost_units      BIGINT NOT NULL,  -- internal planner cost budget
  max_rows_returned   INTEGER NOT NULL,
  max_tool_depth      INTEGER NOT NULL, -- recursion chain depth
  max_execution_ms    INTEGER NOT NULL,
  max_concurrent_runs INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, policy_name)
);

CREATE INDEX idx_aqbp_tenant ON agent_query_budget_policy(account_id);

-- 3.4 Deterministic execution trace
CREATE TABLE agent_execution_trace (
  id                  BIGSERIAL PRIMARY KEY,
  account_id          BIGINT NOT NULL,
  run_id              UUID NOT NULL,
  parent_run_id       UUID NULL,
  tool_name           TEXT NOT NULL,
  tool_version        TEXT NOT NULL,
  request_hash        TEXT NOT NULL, -- hash(input + policy + tenant scope)
  planner_cost_units  BIGINT NOT NULL,
  rows_scanned        BIGINT NOT NULL,
  rows_returned       BIGINT NOT NULL,
  status              TEXT NOT NULL, -- allowed, rejected_budget, timeout, completed
  reason_code         TEXT NOT NULL, -- deterministic rejection/termination code
  started_at          TIMESTAMPTZ NOT NULL,
  finished_at         TIMESTAMPTZ NOT NULL,
  actor_id            BIGINT NOT NULL,
  metadata_json       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aet_tenant_run
  ON agent_execution_trace(account_id, run_id, started_at DESC);
```

### Full-table-scan risk flags
- `agent_semantic_chunk` can grow rapidly; **never** query without `(account_id + source filters)` preconditions.
- similarity-only scans across an entire tenant can still be expensive at 1M+ rows; require:
  1) account predicate,
  2) optional board/time filter,
  3) top-k cap + timeout.

---

## 4) API-first contracts (TypeScript + GraphQL-ready shapes)

```ts
export interface TenantScope {
  accountId: number;
  workspaceId: number;
  boardId?: number;
}

export interface ProceduralMemory {
  id: string;
  scope: TenantScope;
  memoryKey: string;
  instructionText: string;
  toolContractRef: string;
  policy: {
    maxRows: number;
    maxDepth: number;
    timeoutMs: number;
    allowedTools: string[];
  };
  tags: string[];
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticRetrieveRequest {
  scope: TenantScope;
  queryText: string;
  topK: number;
  filters?: {
    sourceTypes?: Array<"item" | "update" | "doc" | "memory">;
    updatedAfter?: string;
    labels?: string[];
  };
  budgetPolicyName: string;
}

export interface SemanticRetrieveResult {
  chunkId: string;
  sourceType: string;
  sourceId: string;
  score: number;
  rationaleTags: string[]; // what an agent can interpret for grounding
  metadata: Record<string, unknown>;
}

export interface AgentExecutionReceipt {
  runId: string;
  accountId: number;
  toolName: string;
  toolVersion: string;
  status: "allowed" | "rejected_budget" | "timeout" | "completed";
  reasonCode: string;
  plannerCostUnits: number;
  rowsScanned: number;
  rowsReturned: number;
  startedAt: string;
  finishedAt: string;
}
```

### GraphQL design notes
- Mutations:
  - `upsertProceduralMemory(input)`
  - `setAgentQueryBudgetPolicy(input)`
  - `executeAgentTool(input)` (returns `AgentExecutionReceipt`)
- Queries:
  - `semanticRetrieve(input)` returns `SemanticRetrieveResult[]`
  - `agentExecutionTrace(runId, scope)` for audit drill-down

All resolvers must derive `account_id` from authenticated context, never from client payload alone.

---

## 5) Agentic guardrails (deterministic, tenant-safe)

1. **Compile-time query rewriting**
   - Inject `WHERE account_id = $ctx.account_id` into all plans.
   - Reject plans lacking tenant predicate with `reason_code = MISSING_TENANT_SCOPE`.

2. **Budgeted execution envelopes**
   - Pre-execution planner estimates are compared against policy.
   - If estimate exceeds policy, reject before execution (`reason_code = BUDGET_EXCEEDED_PRECHECK`).

3. **Recursion and fan-out limits**
   - Enforce `max_tool_depth` and `max_concurrent_runs`.
   - On breach: deterministic stop (`reason_code = RECURSION_LIMIT` or `CONCURRENCY_LIMIT`).

4. **Read path isolation**
   - Agent retrieval workloads run in resource-governed pools separate from transactional workloads.
   - Protects P99 write latencies for core WorkOS operations.

5. **Deterministic traceability**
   - Every run stores request hash, policy snapshot, and reason codes.
   - Enables replay analysis and enterprise audit requirements.

---

## 6) How an LLM/Agent should perceive the data

To improve grounding quality and reduce hallucinations, each retrieved chunk should include explicit metadata tags:
- `entity_type`: board | item | update | memory
- `entity_id`
- `board_id`
- `permission_scope_hash`
- `freshness_ts`
- `confidence_class` (derived from ranking + policy constraints)
- `instructionality`: factual | procedural | policy

This allows the model to separate:
- **Facts** (current board state),
- **Procedures** (how to act),
- **Policies** (what is allowed).

---

## 7) Performance checklist for 1M+ row boards

Before shipping any agentic query feature, verify:

1. Query plan is tenant-first (`account_id` predicate present).
2. Secondary filter exists for high-cardinality paths (`board_id`, `source_type`, or time window).
3. Top-k hard cap is enforced (`k <= configured_max`).
4. Planner cost estimate is compared against budget policy.
5. No unbounded ORDER BY over tenant-wide chunk tables.
6. Fallback behavior (timeout/rejection) returns deterministic error contract.

---

## 8) Suggested phased delivery (risk-controlled)

1. **Phase 1: Foundation**
   - Introduce procedural memory + execution trace tables.
   - Add GraphQL contracts with strict tenant scoping.

2. **Phase 2: Retrieval**
   - Add semantic chunk pipeline and vector index integration.
   - Launch read-only `semanticRetrieve` with budget controls.

3. **Phase 3: Tool execution**
   - Enable `executeAgentTool` with recursion/concurrency limits.
   - Expand audit dashboards and policy simulation tools.

This sequence minimizes blast radius while making the platform progressively agent-ready.
