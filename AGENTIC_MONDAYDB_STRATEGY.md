# mondayDB Agentic Database Strategy

## 0) Executive Summary

The product goal is to make mondayDB the best backend for autonomous agents **without** sacrificing enterprise-grade guarantees. The central trade-off is:

- **Agentic flexibility** (rich retrieval, memory, tool planning)
- versus **deterministic execution** (predictable latency, ACID semantics, tenant isolation)

The recommended approach is to add an **Agentic Control Plane** on top of existing row + columnar foundations, rather than pushing non-deterministic behavior into the core transaction engine.

---

## 1) Product Principles: Why Before How

### 1.1 Latency vs. Consistency
- **Why:** Agents need fast context retrieval, but core mutations (items, boards, automations) must remain strongly consistent and auditable.
- **Decision:** Keep OLTP writes in row storage under ACID boundaries; keep embeddings/indexes eventually consistent via deterministic change streams.
- **Consequence:** Agent context may lag by seconds, but source-of-truth transactional data never does.

### 1.2 Intelligence vs. Predictability
- **Why:** AI features can appear “magical,” but enterprise teams require deterministic outcomes.
- **Decision:** Database layer remains deterministic; only retrieval ranking/model inference is probabilistic, and all model-facing operations are logged with versioned metadata.
- **Consequence:** Debuggable behavior and reproducible policy checks across tenants.

### 1.3 Rich Retrieval vs. Neighbor Safety
- **Why:** Vector + graph-like traversal can accidentally trigger expensive query explosions.
- **Decision:** Introduce query budgets, recursion depth caps, and per-account compute quotas enforced at planning time and runtime.
- **Consequence:** Protects 99.99% availability and multi-tenant fairness.

### 1.4 API Simplicity vs. Future-Proofing
- **Why:** Every capability must be Open API/GraphQL-first.
- **Decision:** Ship agentic primitives as explicit GraphQL types and mutations (no hidden implicit behavior).
- **Consequence:** Integrations stay stable; capabilities are discoverable and governable.

---

## 2) Target Architecture Additions

### 2.1 New Logical Components
1. **Memory Ledger** (procedural + episodic + semantic metadata)
2. **Embedding Service + Vector Index** (pgvector/HNSW compatible)
3. **Agentic Guardrail Engine** (query budget, recursion, tool allowlists)
4. **Deterministic Audit Stream** (append-only trace for all writes and retrieval executions)

### 2.2 Data Flow (Deterministic Core + Async Enrichment)
1. Transactional write enters row store (`items`, `updates`, etc.) under ACID.
2. Write emits immutable `change_event`.
3. Async workers derive embeddings and memory projections.
4. Vector index and retrieval metadata are updated idempotently.
5. Read path composes:
   - transactional facts (strongly consistent)
   - memory/semantic context (bounded staleness)

---

## 3) Schema Design (SQL + TypeScript)

> All tables are tenant-scoped and must include `account_id`.  
> Composite indexes always start with `account_id` to avoid cross-tenant scans.

### 3.1 SQL: Agent Memory Objects

```sql
CREATE TABLE agent_memory_objects (
  account_id           BIGINT      NOT NULL,
  object_id            UUID        NOT NULL,
  board_id             BIGINT      NULL,
  item_id              BIGINT      NULL,
  memory_type          TEXT        NOT NULL CHECK (memory_type IN ('procedural', 'episodic', 'semantic')),
  title                TEXT        NOT NULL,
  content_json         JSONB       NOT NULL,
  content_text         TEXT        NOT NULL,
  metadata_json        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source_event_id      UUID        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, object_id)
);

CREATE INDEX idx_memory_objects_account_board
  ON agent_memory_objects (account_id, board_id, updated_at DESC);

CREATE INDEX idx_memory_objects_account_item
  ON agent_memory_objects (account_id, item_id, updated_at DESC);

CREATE INDEX idx_memory_objects_metadata_gin
  ON agent_memory_objects
  USING GIN (metadata_json jsonb_path_ops);
```

### 3.2 SQL: Embeddings (pgvector-Compatible)

```sql
-- If using pgvector extension:
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_memory_embeddings (
  account_id           BIGINT      NOT NULL,
  object_id            UUID        NOT NULL,
  embedding_model      TEXT        NOT NULL,
  embedding_version    TEXT        NOT NULL,
  embedding_vector     VECTOR(1536) NOT NULL,
  token_count          INTEGER     NOT NULL,
  checksum_sha256      TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, object_id, embedding_model, embedding_version)
);

-- HNSW index scoped by account_id in planner filter.
-- Note: For very large tenants, consider account-sharded partitions to keep
-- nearest-neighbor candidate sets cache-resident.
CREATE INDEX idx_embeddings_hnsw
  ON agent_memory_embeddings
  USING hnsw (embedding_vector vector_cosine_ops);

CREATE INDEX idx_embeddings_account_model
  ON agent_memory_embeddings (account_id, embedding_model, embedding_version);
```

### 3.3 SQL: Tool Invocation Policies

```sql
CREATE TABLE agent_tool_policies (
  account_id             BIGINT      NOT NULL,
  policy_id              UUID        NOT NULL,
  tool_name              TEXT        NOT NULL,
  is_enabled             BOOLEAN     NOT NULL DEFAULT true,
  max_calls_per_minute   INTEGER     NOT NULL DEFAULT 60,
  max_recursion_depth    INTEGER     NOT NULL DEFAULT 3,
  max_estimated_cost_ms  INTEGER     NOT NULL DEFAULT 2000,
  allowed_scopes_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id     BIGINT      NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id)
);

CREATE UNIQUE INDEX uq_tool_policy_account_tool
  ON agent_tool_policies (account_id, tool_name);
```

### 3.4 SQL: Deterministic Audit Trail

```sql
CREATE TABLE agent_execution_audit (
  account_id             BIGINT      NOT NULL,
  execution_id           UUID        NOT NULL,
  actor_type             TEXT        NOT NULL CHECK (actor_type IN ('user', 'system', 'agent')),
  actor_id               TEXT        NOT NULL,
  request_hash           TEXT        NOT NULL,
  plan_hash              TEXT        NOT NULL,
  actions_json           JSONB       NOT NULL,
  budget_snapshot_json   JSONB       NOT NULL,
  started_at             TIMESTAMPTZ NOT NULL,
  finished_at            TIMESTAMPTZ NOT NULL,
  outcome                TEXT        NOT NULL CHECK (outcome IN ('success', 'blocked', 'failed')),
  error_code             TEXT        NULL,
  PRIMARY KEY (account_id, execution_id)
);

CREATE INDEX idx_execution_audit_account_time
  ON agent_execution_audit (account_id, started_at DESC);
```

### 3.5 TypeScript Domain Contracts

```ts
export type MemoryType = "procedural" | "episodic" | "semantic";

export interface TenantScoped {
  accountId: number;
}

export interface AgentMemoryObject extends TenantScoped {
  objectId: string; // UUID
  boardId?: number;
  itemId?: number;
  memoryType: MemoryType;
  title: string;
  contentJson: Record<string, unknown>;
  contentText: string;
  metadataJson: Record<string, unknown>; // includes tags: ["policy", "workflow", ...]
  sourceEventId: string; // UUID
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface AgentMemoryEmbedding extends TenantScoped {
  objectId: string;
  embeddingModel: string;
  embeddingVersion: string;
  embeddingVector: number[];
  tokenCount: number;
  checksumSha256: string;
  createdAt: string;
}

export interface AgentToolPolicy extends TenantScoped {
  policyId: string;
  toolName: string;
  isEnabled: boolean;
  maxCallsPerMinute: number;
  maxRecursionDepth: number;
  maxEstimatedCostMs: number;
  allowedScopesJson: Record<string, unknown>;
  updatedByUserId: number;
  updatedAt: string;
}

export interface AgentExecutionAudit extends TenantScoped {
  executionId: string;
  actorType: "user" | "system" | "agent";
  actorId: string;
  requestHash: string;
  planHash: string;
  actionsJson: Record<string, unknown>;
  budgetSnapshotJson: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
  outcome: "success" | "blocked" | "failed";
  errorCode?: string;
}
```

---

## 4) GraphQL/Open API Surface (API-First)

### 4.1 Query Primitives

```graphql
type Query {
  agentMemorySearch(
    accountId: ID!,
    boardId: ID,
    itemId: ID,
    query: String!,
    topK: Int = 20,
    memoryTypes: [AgentMemoryType!],
    metadataFilter: JSON
  ): AgentMemorySearchResult!

  agentExecutionAudit(
    accountId: ID!,
    executionId: ID!
  ): AgentExecutionAudit!
}
```

### 4.2 Mutation Primitives

```graphql
type Mutation {
  upsertAgentMemoryObject(input: UpsertAgentMemoryInput!): AgentMemoryObject!
  setAgentToolPolicy(input: SetAgentToolPolicyInput!): AgentToolPolicy!
  executeAgentPlan(input: ExecuteAgentPlanInput!): AgentExecutionResult!
}
```

### 4.3 Determinism Rules at API Layer
- Every mutation requires `accountId`.
- Server computes `requestHash` and `planHash` for replayability.
- If policy budget exceeded, return deterministic error code (e.g., `AGENT_BUDGET_EXCEEDED`) with no partial side effects.

---

## 5) Agentic Guardrails (Neighbor-Safe by Default)

### 5.1 Hard Limits
1. **Max recursion depth** per execution (default 3)
2. **Max tool calls** per minute/account
3. **Max estimated query cost** per request (planner estimate + runtime watchdog)
4. **Max semantic candidate set** (e.g., 2,000 vectors before rerank)
5. **Timeout budget** partitioned by phase: retrieval, planning, execution, post-write verification

### 5.2 Admission Control
- Requests classified into QoS lanes:
  - interactive read
  - transactional write
  - async enrichment
  - agent background workflows
- Agent background workflows are preemptible and throttled first during load spikes.

### 5.3 Policy Evaluation Order
1. Tenant auth + `account_id` validation
2. Policy lookup (`agent_tool_policies`)
3. Static plan checks (depth, allowed tools, estimated cost)
4. Runtime counters (calls/min, elapsed budget)
5. Execute or block with deterministic reason code

---

## 6) Performance Check (1M+ Row Boards)

### 6.1 Full Table Scan Risks to Flag
- Filtering on `board_id` or `item_id` **without** `account_id` leading key
- JSONB metadata filters without GIN strategy
- Vector search with post-filtering by tenant (must pre-filter by partition/shard where possible)
- Unbounded topK or no time window constraints in episodic memory lookups

### 6.2 Required Query Patterns
- Always predicate `WHERE account_id = $1` first.
- For board-scoped memory:
  - `WHERE account_id = $1 AND board_id = $2 ORDER BY updated_at DESC LIMIT $N`
- For semantic retrieval:
  - preselect tenant/account partition
  - ANN retrieval with bounded candidate set
  - deterministic rerank over bounded candidate set

### 6.3 SLO-Oriented Recommendations
- P95 interactive retrieval < 150ms for warmed cache paths
- P99 agent mutation safety checks < 50ms
- Async embedding propagation target < 5s end-to-end
- Use account-level hot partition detection and adaptive throttling

---

## 7) How an LLM/Agent Perceives the Data

### 7.1 Memory Metadata Tags
Each memory object should include standardized tags in `metadata_json`, for example:

```json
{
  "intent_tags": ["handoff", "sla", "approval_required"],
  "entity_refs": ["board:123", "item:456"],
  "risk_level": "medium",
  "tool_hints": ["read_board_items", "post_update"],
  "retention_class": "90d"
}
```

This enables:
- semantic grounding (intent/entity alignment)
- deterministic policy checks (risk/tool constraints)
- cleaner prompt assembly with explicit provenance

### 7.2 Procedural Memory Encoding
Store instructions as explicit machine-readable steps, not free text only:

```json
{
  "procedure_name": "escalate_blocked_item",
  "version": 3,
  "steps": [
    {"id": "s1", "action": "read_item", "args_schema": {"item_id": "number"}},
    {"id": "s2", "action": "notify_owner", "requires_approval": false},
    {"id": "s3", "action": "set_status", "allowed_values": ["Escalated"]}
  ],
  "guardrails": {"max_steps": 5, "max_tool_calls": 3}
}
```

---

## 8) Rollout Plan (Low-Risk Sequence)

### Phase A: Foundations
- Create tables/indexes for memory, embeddings, policies, audit.
- Implement account-scoped API contracts.
- Add deterministic audit hashing.

### Phase B: Semantic Retrieval
- Introduce embedding pipeline + ANN index.
- Add bounded `agentMemorySearch`.
- Add quality + latency telemetry.

### Phase C: Safe Agent Execution
- Add policy engine and budget enforcement.
- Expose `executeAgentPlan` with strict deterministic failure modes.

### Phase D: Optimization + Multi-Tenant Fairness
- Account-level partitions for large tenants.
- Admission control and adaptive throttling for background agent workloads.
- Continuous workload replay tests for regression prevention.

---

## 9) Non-Negotiable Enterprise Invariants

1. **Tenant Isolation:** no execution path without `account_id`.
2. **Auditability:** every agent execution generates immutable audit record.
3. **Determinism:** same input + same policy version => same database-level outcome.
4. **Cost Safety:** every execution subject to explicit budget checks.
5. **No Hidden AI in Core Engine:** probabilistic behavior only in clearly bounded retrieval/planning layers.

---

## 10) Decision Log Template (for Future Features)

For each agentic feature proposal, require this checklist:

1. What is the user value?
2. What is the latency vs consistency trade-off?
3. Which schema changes are required (with `account_id`)?
4. Could this trigger full scans on 1M+ row boards?
5. What deterministic audit event is emitted?
6. What guardrail blocks worst-case recursive cost?

Using this template keeps mondayDB’s evolution fast while preserving WorkOS-grade reliability and trust.
