# mondayDB Agentic Database Strategy (v1)

## 1) Product thesis: why this shape wins

### Goal tension
mondayDB must optimize three forces that naturally conflict:
1. **Agentic capability** (memory + retrieval + tool-awareness)
2. **Enterprise reliability** (determinism, ACID, tenant isolation)
3. **Low-latency scale** (interactive queries on very large boards)

### Why this architecture
- **Deterministic core, probabilistic edge:** keep the database engine predictable and auditable while allowing agents to consume enriched metadata externally.
- **Dual-path retrieval:** keep OLTP row-store writes fast while enabling vector + columnar read paths for semantic and analytical workloads.
- **Guardrailed autonomy:** enforce query budgets and recursion limits at query planning time, not inside model prompts.

This reduces product risk: agents become additive capabilities, not a source of unstable runtime behavior.

---

## 2) Core product decisions and trade-offs (why before how)

### A. Consistency vs latency
- **Decision:** keep transactional writes strongly consistent in row storage; asynchronously project to vector/columnar indexes.
- **Why:** board edits and automations must preserve ACID semantics; semantic retrieval can tolerate slight indexing lag.
- **Trade-off:** RAG freshness may trail writes by seconds. This is preferable to slowing write latency for all tenants.

### B. Isolation vs global retrieval quality
- **Decision:** every retrieval path is hard-scoped by `account_id` (and usually `workspace_id`/`board_id`).
- **Why:** strict multi-tenant boundaries outweigh slight recall gains from global vector spaces.
- **Trade-off:** no cross-tenant embedding neighborhoods; requires per-tenant filtering/partitioning strategies.

### C. Agent flexibility vs deterministic operations
- **Decision:** store agent instructions as versioned data objects (procedural memory), not executable dynamic rules in the engine.
- **Why:** deterministic replay and auditable changes are mandatory for enterprise incident response.
- **Trade-off:** less "magic"; more explicit orchestration logic at API/service layer.

### D. Query power vs neighbor safety
- **Decision:** add explicit cost budgets, depth limits, and execution classes for agent-originated queries.
- **Why:** autonomous loops can unintentionally amplify load.
- **Trade-off:** some agent workflows are rate-limited/deferred to protect p99 latency for other tenants.

---

## 3) Canonical data model (SQL)

> All tables include `account_id` in keys/indexes to enforce tenant-first execution plans.

```sql
-- 3.1 Procedural memory: explicit instructions/playbooks for agents
CREATE TABLE agent_procedural_memory (
  account_id           BIGINT      NOT NULL,
  memory_id            UUID        NOT NULL,
  workspace_id         BIGINT      NOT NULL,
  board_id             BIGINT      NULL,
  name                 TEXT        NOT NULL,
  instruction_markdown TEXT        NOT NULL,
  tool_contract_json   JSONB       NOT NULL, -- deterministic input/output contract
  state                TEXT        NOT NULL CHECK (state IN ('draft', 'active', 'deprecated')),
  version              INTEGER     NOT NULL,
  created_by_user_id   BIGINT      NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX idx_apm_scope
  ON agent_procedural_memory (account_id, workspace_id, board_id, state);

-- 3.2 Semantic memory chunks for RAG
CREATE TABLE agent_memory_chunk (
  account_id           BIGINT       NOT NULL,
  chunk_id             UUID         NOT NULL,
  workspace_id         BIGINT       NOT NULL,
  board_id             BIGINT       NULL,
  item_id              BIGINT       NULL,
  source_type          TEXT         NOT NULL, -- update, file, doc, comment, automation
  source_id            TEXT         NOT NULL,
  content_text         TEXT         NOT NULL,
  embedding_model      TEXT         NOT NULL,
  embedding_dim        INTEGER      NOT NULL,
  embedding            VECTOR(1536) NOT NULL,
  semantic_tags        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  token_count          INTEGER      NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, chunk_id)
);

-- Filter-first index to avoid tenant leakage and large scans.
CREATE INDEX idx_amc_scope
  ON agent_memory_chunk (account_id, workspace_id, board_id, created_at DESC);

-- Vector index (HNSW) for nearest-neighbor retrieval inside scoped candidate sets.
CREATE INDEX idx_amc_embedding_hnsw
  ON agent_memory_chunk USING hnsw (embedding vector_cosine_ops);

-- 3.3 Tool policy and guardrails
CREATE TABLE agent_tool_policy (
  account_id              BIGINT      NOT NULL,
  policy_id               UUID        NOT NULL,
  workspace_id            BIGINT      NOT NULL,
  board_id                BIGINT      NULL,
  tool_name               TEXT        NOT NULL,
  allow_mode              TEXT        NOT NULL CHECK (allow_mode IN ('allow', 'deny', 'allow_with_budget')),
  max_calls_per_minute    INTEGER     NULL,
  max_recursion_depth     INTEGER     NOT NULL DEFAULT 3,
  max_estimated_cost_unit BIGINT      NOT NULL DEFAULT 100000,
  require_human_approval  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id)
);

CREATE INDEX idx_atp_scope
  ON agent_tool_policy (account_id, workspace_id, board_id, tool_name);

-- 3.4 Deterministic audit trail for every mutation and tool execution
CREATE TABLE agent_audit_event (
  account_id             BIGINT      NOT NULL,
  event_id               UUID        NOT NULL,
  event_ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type             TEXT        NOT NULL, -- user, automation, agent
  actor_id               TEXT        NOT NULL,
  operation              TEXT        NOT NULL, -- CREATE_MEMORY, QUERY_VECTOR, TOOL_CALL, UPDATE_ITEM
  request_fingerprint    TEXT        NOT NULL, -- deterministic hash of canonicalized request
  target_resource_type   TEXT        NOT NULL,
  target_resource_id     TEXT        NOT NULL,
  request_payload_json   JSONB       NOT NULL,
  response_payload_json  JSONB       NOT NULL,
  outcome                TEXT        NOT NULL CHECK (outcome IN ('success', 'rejected', 'failed')),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX idx_aae_lookup
  ON agent_audit_event (account_id, event_ts DESC, actor_type, operation);
```

---

## 4) API-first contract (TypeScript + GraphQL mapping)

```ts
export type TenantScope = {
  accountId: string;
  workspaceId: string;
  boardId?: string;
};

export interface ProceduralMemory {
  accountId: string;
  memoryId: string;
  workspaceId: string;
  boardId?: string;
  name: string;
  instructionMarkdown: string;
  toolContractJson: Record<string, unknown>;
  state: "draft" | "active" | "deprecated";
  version: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticMemoryChunk {
  accountId: string;
  chunkId: string;
  workspaceId: string;
  boardId?: string;
  itemId?: string;
  sourceType: "update" | "file" | "doc" | "comment" | "automation";
  sourceId: string;
  contentText: string;
  embeddingModel: string;
  embeddingDim: number;
  semanticTags: string[];
  tokenCount: number;
  createdAt: string;
}

export interface AgentToolPolicy {
  accountId: string;
  policyId: string;
  workspaceId: string;
  boardId?: string;
  toolName: string;
  allowMode: "allow" | "deny" | "allow_with_budget";
  maxCallsPerMinute?: number;
  maxRecursionDepth: number;
  maxEstimatedCostUnit: number;
  requireHumanApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAuditEvent {
  accountId: string;
  eventId: string;
  eventTs: string;
  actorType: "user" | "automation" | "agent";
  actorId: string;
  operation: string;
  requestFingerprint: string;
  targetResourceType: string;
  targetResourceId: string;
  requestPayloadJson: Record<string, unknown>;
  responsePayloadJson: Record<string, unknown>;
  outcome: "success" | "rejected" | "failed";
}
```

Recommended GraphQL capabilities (all require `accountId` in auth scope and resolver filters):
- `upsertProceduralMemory(input)`
- `querySemanticMemory(input: { queryText, topK, workspaceId, boardId, timeRange })`
- `setAgentToolPolicy(input)`
- `agentAuditEvents(input: { actorType, operation, fromTs, toTs, limit, cursor })`

---

## 5) Query planning guardrails for agent-originated workloads

### Admission control
1. Resolve tenant scope from auth context (`account_id` required).
2. Attach policy (`agent_tool_policy`) by `(account_id, workspace_id, board_id, tool_name)`.
3. Reject when recursion depth or budget would be exceeded.

### Cost controls
- **Static estimator** assigns cost units from:
  - rows scanned estimate
  - vector `top_k`
  - join fanout expectations
  - recursion depth
- **Hard limits:**
  - `top_k` max (e.g., 200)
  - recursion depth max (e.g., 3)
  - per-request cost ceiling
  - per-minute token/call budget

### Determinism
- Canonicalize request JSON before execution.
- Generate `request_fingerprint`.
- Persist full request/response in `agent_audit_event`.
- Replay uses exact same resolver path and deterministic fallback ordering.

---

## 6) Performance checklist (1M+ rows / board safety)

Use this checklist for each feature gate:

1. **Tenant-first predicate present?**
   - Must include `account_id` and usually `workspace_id`/`board_id` in WHERE clause.
2. **Potential full table scan?**
   - Flag if query lacks leading indexed predicate on `account_id`.
3. **Vector query bounded?**
   - Require `top_k` upper bound and optional time/window filters.
4. **Hot partition risk?**
   - Evaluate skew for very large enterprise tenants; consider partitioning/compaction strategies.
5. **Explain plan reviewed?**
   - Reject launch if plan shows Seq Scan on shared large tables for common paths.

### Explicit red flags
- Any query pattern of form:
  - `SELECT ... FROM agent_memory_chunk WHERE embedding <-> :q LIMIT :k`
  without `account_id` filter.
- Any audit lookup without `(account_id, event_ts)` index usage.
- Any resolver that infers tenant from user input rather than auth context.

---

## 7) Agent perception model (metadata tagging strategy)

To make data intelligible to LLM agents while preserving deterministic storage:
- Store `semantic_tags` as explicit controlled vocab:
  - `domain:sales`, `entity:deal`, `status:blocker`, `priority:high`, `board:<id>`
- Attach provenance metadata per chunk:
  - source object, timestamp, author, confidence score, pii classification.
- Keep natural language summaries outside transaction-critical tables; reference by immutable IDs.

This yields predictable retrieval slices and safer tool-use planning.

---

## 8) Rollout sequence

1. **Foundation:** audit + policy tables; resolver-level tenant assertions.
2. **Semantic layer:** chunk ingestion and scoped vector retrieval APIs.
3. **Procedural memory:** versioned playbooks and tool contracts.
4. **Guardrail hardening:** budget engine, recursion controls, circuit breakers.
5. **Scale tuning:** partitioning, index tuning, p95/p99 SLO enforcement.

Each phase is independently shippable and preserves enterprise determinism.
