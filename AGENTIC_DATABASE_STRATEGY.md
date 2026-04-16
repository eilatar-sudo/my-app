# mondayDB Agentic Database Evolution Strategy

## 1) Why Before How: Product Trade-offs and Decision Principles

### A. Latency vs. Consistency (Online agent actions)
- **Why:** Agent workflows (e.g., "summarize board + create tasks") feel broken if p95 latency exceeds a human attention threshold, but enterprise users cannot accept inconsistent writes.
- **Decision:** Keep transactional state changes on the row store under strict ACID semantics; allow eventually consistent vector/index refresh for retrieval paths.
- **Result:** Deterministic writes and predictable tenant behavior, while preserving low-latency semantic lookup.

### B. Flexibility vs. Predictability (Schemaless + enterprise controls)
- **Why:** Agents need evolving context schemas ("goals", "plans", "tool traces"), but enterprise platforms require stable governance and debuggability.
- **Decision:** Keep schemaless payloads for agent metadata, but add **typed envelopes** for critical dimensions (tenant scope, actor, policy tier, retention class, cost budget).
- **Result:** Rapid product iteration without introducing "magic" behavior in the data layer.

### C. Throughput vs. Isolation (Multi-tenant neighbor safety)
- **Why:** Recursive agent queries can accidentally flood compute and degrade adjacent tenants.
- **Decision:** Enforce account-scoped budgets at planner time and execution time (token, row, recursion-depth, and wall-clock budgets).
- **Result:** Strong neighbor isolation with deterministic throttling and audit traces.

---

## 2) North-Star Capability Model for Agentic mondayDB

1. **Procedural Memory Layer**  
   Durable storage for machine-readable instructions, plans, and tool-use outcomes tied to board/work item context.

2. **Semantic Retrieval Layer**  
   Embeddings + ANN index for low-latency retrieval of relevant board records, updates, docs, and tool traces.

3. **Deterministic Guardrail Layer**  
   Query planner constraints and policy engine limits to prevent runaway or expensive autonomous behavior.

4. **Audit & Replay Layer**  
   Deterministic event ledger so every agent-visible change can be replayed and explained.

---

## 3) Proposed Logical Data Model (SQL)

> All tables include `account_id` and are indexed for strict tenant scoping.

```sql
-- 1) Procedural memory: explicit instruction artifacts for agents
CREATE TABLE agent_procedural_memory (
  memory_id            BIGSERIAL PRIMARY KEY,
  account_id           BIGINT NOT NULL,
  workspace_id         BIGINT NOT NULL,
  board_id             BIGINT,
  item_id              BIGINT,
  memory_type          TEXT NOT NULL, -- 'instruction' | 'plan' | 'policy_hint' | 'tool_recipe'
  title                TEXT NOT NULL,
  instruction_payload  JSONB NOT NULL, -- deterministic machine-readable structure
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  version              INTEGER NOT NULL DEFAULT 1,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_actor_id  BIGINT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, workspace_id, memory_id)
);

CREATE INDEX idx_apm_account_board_item
  ON agent_procedural_memory (account_id, board_id, item_id, is_active);

CREATE INDEX idx_apm_tags_gin
  ON agent_procedural_memory USING GIN (tags);


-- 2) Semantic chunks: canonical retrieval unit for RAG
CREATE TABLE agent_semantic_chunk (
  chunk_id              BIGSERIAL PRIMARY KEY,
  account_id            BIGINT NOT NULL,
  source_type           TEXT NOT NULL, -- 'item', 'update', 'doc', 'audit_event', 'memory'
  source_id             TEXT NOT NULL, -- opaque identifier string, deterministic
  board_id              BIGINT,
  item_id               BIGINT,
  content_text          TEXT NOT NULL,
  content_metadata      JSONB NOT NULL DEFAULT '{}'::jsonb, -- includes pii_classification, language, etc.
  embedding_model       TEXT NOT NULL,
  embedding_dimensions  INTEGER NOT NULL,
  embedding             VECTOR(1536), -- configurable per model family
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_asc_account_source
  ON agent_semantic_chunk (account_id, source_type, source_id);

CREATE INDEX idx_asc_account_board_item
  ON agent_semantic_chunk (account_id, board_id, item_id);

-- ANN index (choose HNSW parameters by workload profile)
CREATE INDEX idx_asc_embedding_hnsw
  ON agent_semantic_chunk USING hnsw (embedding vector_cosine_ops);


-- 3) Guardrails: deterministic query/action policy envelopes
CREATE TABLE agent_guardrail_policy (
  policy_id               BIGSERIAL PRIMARY KEY,
  account_id              BIGINT NOT NULL,
  policy_name             TEXT NOT NULL,
  max_query_depth         INTEGER NOT NULL DEFAULT 3,
  max_rows_scanned        BIGINT NOT NULL DEFAULT 200000,
  max_rows_returned       BIGINT NOT NULL DEFAULT 5000,
  max_tool_calls          INTEGER NOT NULL DEFAULT 20,
  max_execution_ms        INTEGER NOT NULL DEFAULT 2000,
  max_vector_candidates   INTEGER NOT NULL DEFAULT 1000,
  allow_cross_board_join  BOOLEAN NOT NULL DEFAULT FALSE,
  allow_recursive_actions BOOLEAN NOT NULL DEFAULT FALSE,
  policy_payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, policy_name)
);

CREATE INDEX idx_agp_account_name
  ON agent_guardrail_policy (account_id, policy_name);


-- 4) Cost ledger: every agent execution has a deterministic trace
CREATE TABLE agent_execution_ledger (
  execution_id            UUID PRIMARY KEY,
  account_id              BIGINT NOT NULL,
  actor_id                BIGINT NOT NULL,
  board_id                BIGINT,
  item_id                 BIGINT,
  request_fingerprint     TEXT NOT NULL, -- deterministic hash of normalized request
  policy_id               BIGINT NOT NULL REFERENCES agent_guardrail_policy(policy_id),
  outcome_status          TEXT NOT NULL, -- 'success' | 'blocked' | 'timeout' | 'error'
  rows_scanned            BIGINT NOT NULL DEFAULT 0,
  rows_returned           BIGINT NOT NULL DEFAULT 0,
  vector_candidates       BIGINT NOT NULL DEFAULT 0,
  tool_calls              INTEGER NOT NULL DEFAULT 0,
  recursion_depth         INTEGER NOT NULL DEFAULT 0,
  execution_time_ms       INTEGER NOT NULL DEFAULT 0,
  error_code              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ael_account_created
  ON agent_execution_ledger (account_id, created_at DESC);

CREATE INDEX idx_ael_account_request
  ON agent_execution_ledger (account_id, request_fingerprint);
```

---

## 4) API-First TypeScript Contracts (GraphQL-facing service layer)

```ts
export interface TenantScoped {
  accountId: string;
}

export interface ProceduralMemoryRecord extends TenantScoped {
  memoryId: string;
  workspaceId: string;
  boardId?: string;
  itemId?: string;
  memoryType: "instruction" | "plan" | "policy_hint" | "tool_recipe";
  title: string;
  instructionPayload: Record<string, unknown>;
  tags: string[];
  version: number;
  isActive: boolean;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticChunkRecord extends TenantScoped {
  chunkId: string;
  sourceType: "item" | "update" | "doc" | "audit_event" | "memory";
  sourceId: string;
  boardId?: string;
  itemId?: string;
  contentText: string;
  contentMetadata: {
    piiClassification?: "none" | "low" | "high";
    language?: string;
    labels?: string[];
    retentionClass?: "short" | "standard" | "extended";
    [k: string]: unknown;
  };
  embeddingModel: string;
  embeddingDimensions: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGuardrailPolicy extends TenantScoped {
  policyId: string;
  policyName: string;
  maxQueryDepth: number;
  maxRowsScanned: number;
  maxRowsReturned: number;
  maxToolCalls: number;
  maxExecutionMs: number;
  maxVectorCandidates: number;
  allowCrossBoardJoin: boolean;
  allowRecursiveActions: boolean;
  policyPayload: Record<string, unknown>;
}

export interface AgentExecutionLedgerEvent extends TenantScoped {
  executionId: string;
  actorId: string;
  boardId?: string;
  itemId?: string;
  requestFingerprint: string;
  policyId: string;
  outcomeStatus: "success" | "blocked" | "timeout" | "error";
  rowsScanned: number;
  rowsReturned: number;
  vectorCandidates: number;
  toolCalls: number;
  recursionDepth: number;
  executionTimeMs: number;
  errorCode?: string;
  createdAt: string;
}
```

---

## 5) Query Planning & Guardrails (Deterministic)

### Pre-execution checks (hard fail)
1. Require `account_id` in all query plans and retrieval plans.
2. Reject plans missing selective predicates for datasets over configured threshold.
3. Reject recursive plans exceeding `max_query_depth`.
4. Reject vector requests with candidate pools above policy limits.

### In-execution checks (circuit breakers)
1. Stop execution when `rows_scanned > max_rows_scanned`.
2. Stop tool orchestration when `tool_calls > max_tool_calls`.
3. Enforce `execution_time_ms` cap with deterministic timeout code.

### Post-execution logging
- Persist one immutable ledger event per execution with normalized fingerprint + measured costs.
- Emit board/workspace-level rollups for anomaly detection and cost shaping.

---

## 6) Performance Checks (1M+ row boards)

### High-risk patterns to flag
1. **Unbounded semantic retrieval without account + board filters**  
   Risk: cross-tenant or cross-board scanning in candidate generation.
2. **JSONB containment queries without supporting index**  
   Risk: full table scan in procedural memory metadata lookups.
3. **Cross-board joins initiated by agent planners**  
   Risk: explosive intermediate row sets.

### Required mitigations
- Always inject tenant and (where possible) board predicates before ANN lookup.
- Maintain HNSW indexes partitioned or logically segmented by tenant.
- Use covering indexes for `(account_id, board_id, item_id)` on hot paths.
- Cache top-K semantic retrieval fingerprints for short TTL when safe.

---

## 7) How an Agent Should Perceive mondayDB Data

Add explicit metadata tags so an LLM can reason predictably:
- `intent`: `"summarize" | "plan" | "execute" | "audit"`
- `scope`: `{ accountId, workspaceId, boardId?, itemId? }`
- `safety`: `{ policyName, riskTier, requiresHumanApproval }`
- `lineage`: `{ sourceType, sourceId, generatedByExecutionId? }`
- `freshness`: `{ lastUpdatedAt, ttlSeconds }`

This keeps agent reasoning explainable and lets orchestration layers choose retrieval and action strategies without hidden engine heuristics.

---

## 8) Rollout Strategy (Low-risk sequencing)

1. **Phase 1: Deterministic envelope first**  
   Ship guardrail policy + execution ledger before advanced agent retrieval features.
2. **Phase 2: Semantic retrieval in bounded mode**  
   Enable vector search with conservative candidate limits and strict tenant filters.
3. **Phase 3: Procedural memory authoring**  
   Expose APIs for instruction records and versioned memory artifacts.
4. **Phase 4: Adaptive policy tuning**  
   Use ledger analytics to calibrate per-tenant cost limits and defaults.

---

## 9) Success Metrics

- **Reliability:** No regression on 99.99% availability SLO.
- **Safety:** Zero confirmed cross-tenant leakage incidents.
- **Latency:** p95 retrieval + plan time within interactive threshold targets.
- **Predictability:** 100% of agent-triggered mutations linked to ledger events.
- **Adoption:** Growth in boards using semantic and procedural memory features.

---

## 10) Summary Recommendation

Evolve mondayDB into an Agentic Database by introducing **typed procedural memory**, **tenant-scoped semantic retrieval**, and **deterministic guardrail + audit primitives** as first-class data-layer constructs. This path preserves enterprise-grade determinism and multi-tenant isolation while enabling fast, agent-native experiences on top of the existing hybrid row/column architecture.
