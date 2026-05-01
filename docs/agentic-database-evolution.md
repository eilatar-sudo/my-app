# mondayDB Agentic Database Evolution

## Why this matters

mondayDB already optimizes for predictable WorkOS workloads: low-latency item reads, high-throughput updates, reliable aggregations, and strict tenant isolation. The agentic shift adds a new workload shape: agents need semantic retrieval, durable task memory, and safe tool execution over business data. Product value comes from making agents useful without making the database nondeterministic.

The core trade-off is latency versus context quality. More retrieved context can improve agent answers, but unbounded semantic expansion can create high tail latency, noisy plans, and neighbor impact on shared compute. The design below keeps probabilistic ranking outside the transaction path and requires deterministic guardrails before any query reaches row or columnar storage.

## Design principles

- Keep mondayDB engine deterministic. AI may rank candidate memory, but query planning, limits, tenancy checks, writes, and audit events are deterministic.
- Scope every record and index by `account_id`; never allow vector or metadata lookup without tenant prefix.
- Treat embeddings as derived data from immutable source events, not as source of truth.
- Make every agent action replayable from request, plan, budgets, resolved tools, and result hashes.
- Use row storage for transactional memory and tool state; use columnar storage for analytics over agent behavior; use HNSW-compatible vector indexes for bounded semantic recall.

## Conceptual layers

1. **Agent memory row plane**
   - Stores procedural instructions, semantic facts, and tool-use state.
   - Optimized for point reads, writes, versioning, ACID updates, and audit hooks.
2. **Semantic retrieval plane**
   - Async projection from row-plane events to tenant-scoped vector indexes.
   - Supports pgvector/HNSW-style nearest-neighbor lookup with explicit `top_k`, filters, and cost budgets.
3. **Agent execution guardrail plane**
   - Validates tenant scope, budgets, recursion depth, tool allowlists, and query estimates before work begins.
4. **Agent analytics columnar plane**
   - Projects deterministic events for adoption, latency, cost, safety, and quality dashboards.

## TypeScript contracts

```ts
export type AgentMemoryKind = "procedural" | "semantic" | "episodic" | "tool_state";

export interface AgentMemoryRecord {
  accountId: string;
  boardId?: string;
  itemId?: string;
  memoryId: string;
  kind: AgentMemoryKind;
  namespace: string;
  title: string;
  body: string;
  metadata: {
    tags: string[];
    source: "user" | "automation" | "integration" | "system";
    sensitivity: "public" | "account" | "restricted";
    ttlSeconds?: number;
    embeddingModel?: string;
    schemaVersion: number;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByActorId: string;
}

export interface AgentRetrievalRequest {
  accountId: string;
  actorId: string;
  queryText: string;
  namespaces: string[];
  boardIds?: string[];
  topK: number;
  maxLatencyMs: number;
  maxVectorCandidates: number;
  metadataFilters?: Record<string, string | string[]>;
}

export interface AgentRetrievalResult {
  accountId: string;
  requestHash: string;
  memories: Array<{
    memoryId: string;
    kind: AgentMemoryKind;
    score: number;
    title: string;
    excerpt: string;
    tags: string[];
    sourceVersion: number;
  }>;
  truncated: boolean;
  cost: {
    vectorCandidatesScanned: number;
    rowRecordsHydrated: number;
    elapsedMs: number;
  };
}

export interface AgentToolInvocation {
  accountId: string;
  invocationId: string;
  actorId: string;
  toolName: string;
  inputHash: string;
  planHash: string;
  parentInvocationId?: string;
  recursionDepth: number;
  budgets: {
    maxRowsRead: number;
    maxRowsWritten: number;
    maxVectorQueries: number;
    timeoutMs: number;
  };
}
```

## SQL schema sketch

```sql
CREATE TABLE agent_memory_records (
  account_id            BIGINT NOT NULL,
  memory_id             UUID NOT NULL,
  board_id              BIGINT,
  item_id               BIGINT,
  kind                  TEXT NOT NULL CHECK (kind IN ('procedural', 'semantic', 'episodic', 'tool_state')),
  namespace             TEXT NOT NULL,
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  metadata              JSONB NOT NULL,
  version               BIGINT NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_actor_id   BIGINT NOT NULL,
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX idx_agent_memory_scope
  ON agent_memory_records (account_id, namespace, kind, board_id);

CREATE INDEX idx_agent_memory_metadata_tags
  ON agent_memory_records USING GIN ((metadata -> 'tags'));

CREATE TABLE agent_memory_embeddings (
  account_id          BIGINT NOT NULL,
  memory_id           UUID NOT NULL,
  embedding_model     TEXT NOT NULL,
  embedding_version   BIGINT NOT NULL,
  embedding           VECTOR(1536) NOT NULL,
  source_version      BIGINT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, embedding_model),
  FOREIGN KEY (account_id, memory_id)
    REFERENCES agent_memory_records (account_id, memory_id)
);

-- HNSW index must preserve tenant isolation through query predicates.
-- Query shape must include account_id before vector ranking.
CREATE INDEX idx_agent_memory_embedding_hnsw
  ON agent_memory_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE agent_audit_events (
  account_id          BIGINT NOT NULL,
  audit_event_id      UUID NOT NULL,
  actor_id            BIGINT NOT NULL,
  event_type          TEXT NOT NULL,
  request_hash        TEXT NOT NULL,
  plan_hash           TEXT NOT NULL,
  result_hash         TEXT,
  metadata            JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX idx_agent_audit_actor_time
  ON agent_audit_events (account_id, actor_id, created_at DESC);
```

## Open API GraphQL shape

```graphql
type AgentMemory {
  accountId: ID!
  memoryId: ID!
  kind: AgentMemoryKind!
  namespace: String!
  title: String!
  body: String!
  tags: [String!]!
  version: Int!
  updatedAt: DateTime!
}

input AgentMemoryUpsertInput {
  namespace: String!
  kind: AgentMemoryKind!
  boardId: ID
  itemId: ID
  title: String!
  body: String!
  tags: [String!]!
  sensitivity: AgentMemorySensitivity!
}

input AgentMemorySearchInput {
  queryText: String!
  namespaces: [String!]!
  boardIds: [ID!]
  topK: Int!
  maxLatencyMs: Int!
  metadataFilters: JSON
}

type AgentMemorySearchResult {
  memories: [AgentMemoryMatch!]!
  truncated: Boolean!
  requestHash: String!
  elapsedMs: Int!
}

extend type Query {
  agentMemorySearch(input: AgentMemorySearchInput!): AgentMemorySearchResult!
}

extend type Mutation {
  upsertAgentMemory(input: AgentMemoryUpsertInput!): AgentMemory!
}
```

Resolvers must derive `account_id` from authenticated context, not client input. Client-supplied account identifiers should be ignored or rejected to prevent cross-tenant probing.

## Retrieval flow

1. Authenticate actor and resolve `account_id`.
2. Validate `topK`, namespace count, board filter count, latency budget, and metadata filters.
3. Hash request and write a pending audit event.
4. Generate or reuse query embedding outside the row transaction.
5. Run vector lookup with tenant and namespace filters.
6. Hydrate selected memory records from row storage by `(account_id, memory_id)`.
7. Return deterministic result envelope with scores, source versions, truncation flag, and cost counters.
8. Finalize audit event with result hash and observed counters.

## Guardrails

| Risk | Guardrail | Product trade-off |
| --- | --- | --- |
| Agent triggers recursive lookup loop | Enforce `recursionDepth <= 3` and `maxVectorQueries` per invocation | Some complex workflows need explicit user confirmation instead of silent continuation |
| Expensive semantic fanout | Require `topK <= 50`, `maxVectorCandidates <= 1000`, and namespace filters | Limits recall but protects shared compute |
| Cross-tenant leakage | Resolver-owned `account_id`, composite primary keys, tenant-scoped hydration | Slightly more index complexity for stronger isolation |
| Nondeterministic writes | Agents submit explicit tool plans with `planHash`; DB applies normal ACID writes only | Agents become planners, not hidden database operators |
| Audit gaps | Write pending and completed audit events with request, plan, and result hashes | Extra write amplification, acceptable for enterprise trust |

## Performance checks

- **Full table scan danger:** `agentMemorySearch` without namespace or board filters can degrade on accounts with 1M+ memory records. Reject unscoped searches unless an admin-level offline job is used.
- **Vector index danger:** global HNSW over all tenants can create noisy candidate sets. If pgvector cannot partition by tenant efficiently enough, shard vector indexes by `account_id` hash bucket or physical tenant group.
- **JSON filter danger:** arbitrary metadata filters over `metadata` may bypass indexes. Allow only registered filter keys with generated or GIN-backed indexes.
- **Hydration danger:** semantic lookup should hydrate only final candidates, never all vector candidates.
- **Columnar sync danger:** analytics projections must be async so agent telemetry does not slow transactional memory writes.

## How an agent perceives this data

Agents should see memory as tagged, scoped context snippets:

```json
{
  "kind": "procedural",
  "namespace": "sales-crm-automation",
  "tags": ["renewal", "approval-policy", "human-review"],
  "title": "Renewal discount approval rule",
  "excerpt": "Discounts over 20% require manager approval before quote update.",
  "sourceVersion": 7
}
```

This gives an LLM explicit instructions, provenance, and boundaries. It avoids magical behavior: the agent can cite memory and propose a tool plan, but mondayDB still enforces deterministic permissions, budgets, and ACID writes.

## Rollout path

1. Ship read-only semantic retrieval over selected procedural memories.
2. Add GraphQL mutation for memory upsert with immutable audit events.
3. Enable agent tool plans with strict budgets and dry-run estimates.
4. Project telemetry to columnar storage for cost, latency, and safety dashboards.
5. Expand from board-scoped memory to account-wide namespaces after per-tenant cost controls are proven.
