# mondayDB Agentic Database Vision

## Why this matters

mondayDB already optimizes for WorkOS scale: fast operational updates, predictable
analytics, and reliable multi-tenant isolation. The agentic era adds a new access
pattern: autonomous systems need to retrieve context, remember procedures, and use
tools without turning the database into a probabilistic black box.

The product trade-off is latency vs. contextual richness. Rich semantic retrieval
helps agents reason over boards, docs, automations, and historical outcomes, but it
can introduce expensive vector scans, hidden fan-out, and non-deterministic looking
behavior if it is not modeled explicitly. The database layer should stay
deterministic: it stores facts, embeddings, policies, and traces; agents decide what
to do with them under guardrails.

## Strategic principles

1. **Tenant-first semantics:** every row, index entry, embedding, memory, and audit
   event is scoped by `account_id`.
2. **Hybrid storage alignment:** transactional memory and guardrail state live in
   row storage; high-volume retrieval telemetry and aggregations flow to columnar
   storage.
3. **Deterministic data layer:** mondayDB exposes declarative retrieval, cost, and
   policy contracts. It does not infer hidden behavior or mutate data without an
   auditable command.
4. **Agent-ready metadata:** agents perceive records through stable metadata:
   purpose, source, freshness, sensitivity, and allowed actions.
5. **No unbounded autonomy:** all agent-originated queries require budget, depth,
   timeout, and tenant filters before execution.

## Core concepts

### Agent memory record

Agent memory should be stored as first-class data, not as an opaque prompt cache.
This lets customers audit why an agent behaved a certain way and lets mondayDB apply
normal consistency, isolation, and retention controls.

```ts
export type AgentMemoryKind =
  | "semantic_fact"
  | "procedural_instruction"
  | "episodic_outcome"
  | "tool_affordance";

export interface AgentMemoryRecord {
  accountId: string;
  memoryId: string;
  boardId?: string;
  itemId?: string;
  kind: AgentMemoryKind;
  title: string;
  body: string;
  metadata: {
    source: "user" | "automation" | "integration" | "system";
    sensitivity: "public" | "workspace" | "restricted";
    freshnessExpiresAt?: string;
    tags: string[];
    allowedToolNames: string[];
  };
  embeddingRef?: {
    model: string;
    dimensions: number;
    vectorId: string;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

```sql
CREATE TABLE agent_memory_records (
  account_id TEXT NOT NULL,
  memory_id UUID NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'semantic_fact',
      'procedural_instruction',
      'episodic_outcome',
      'tool_affordance'
    )
  ),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  embedding_vector_id UUID,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agent_memory_by_board
  ON agent_memory_records (account_id, board_id, kind, updated_at DESC)
  WHERE deleted_at IS NULL;
```

**Performance check:** no lookup may rely on `kind`, `board_id`, or `updated_at`
without `account_id`. On boards with 1M+ rows, omitting `account_id` or `board_id`
would risk cross-tenant scans and unpredictable latency.

### Semantic retrieval index

Vector search should be compatible with pgvector/HNSW-style retrieval while keeping
tenant isolation explicit in the index key. Approximate nearest neighbor search is
acceptable for candidate generation; final authorization and ranking remain
deterministic.

```ts
export interface SemanticVectorEntry {
  accountId: string;
  vectorShard: string;
  vectorId: string;
  entityType: "board" | "item" | "update" | "doc" | "agent_memory";
  entityId: string;
  embedding: number[];
  embeddingModel: string;
  metadata: {
    boardId?: string;
    workspaceId?: string;
    sourceUpdatedAt: string;
    tags: string[];
    visibility: "public" | "workspace" | "restricted";
  };
}
```

```sql
CREATE TABLE semantic_vector_entries (
  account_id TEXT NOT NULL,
  vector_shard TEXT NOT NULL,
  vector_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  metadata JSONB NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, vector_shard, vector_id)
) PARTITION BY HASH (vector_shard);

CREATE INDEX semantic_vector_hnsw_by_shard
  ON semantic_vector_entries
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX semantic_vector_scope
  ON semantic_vector_entries
    (account_id, vector_shard, entity_type, source_updated_at DESC);
```

**Guardrail:** vector retrieval must execute in two phases:

1. Candidate generation on a tenant-derived `vector_shard` partition with
   `account_id` plus optional `board_id`, `workspace_id`, `entity_type`, and
   freshness filters.
2. Deterministic post-filtering for permissions, sensitivity, row-level policies,
   and response limit.

**Performance check:** HNSW indexes can still become noisy for large tenants if the
candidate set is unconstrained. Agent APIs should require a `limit`, default to a
small result set, and reject retrieval requests that do not include at least one
business scope such as board, workspace, entity type, or tag.

### Agent query budget

Agents should carry a query budget that is enforced before planning and charged
during execution. This prevents recursive tool use from consuming shared capacity.

```ts
export interface AgentQueryBudget {
  accountId: string;
  actorId: string;
  agentSessionId: string;
  maxRowsRead: number;
  maxVectorCandidates: number;
  maxJoinDepth: number;
  maxRecursiveToolCalls: number;
  timeoutMs: number;
  consistency: "strong" | "bounded_staleness";
}
```

```sql
CREATE TABLE agent_query_audit_events (
  account_id TEXT NOT NULL,
  audit_event_id UUID NOT NULL,
  agent_session_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  query_shape JSONB NOT NULL,
  budget JSONB NOT NULL,
  rows_read BIGINT NOT NULL,
  vector_candidates BIGINT NOT NULL,
  tool_calls BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'rejected', 'timed_out')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agent_query_audit_by_session
  ON agent_query_audit_events (account_id, agent_session_id, created_at DESC);
```

**Agentic guardrails:**

- Reject queries with missing `account_id`.
- Reject recursive calls above `maxRecursiveToolCalls`.
- Reject query plans that estimate more than `maxRowsRead` or
  `maxVectorCandidates`.
- Require idempotency keys for agent-triggered mutations.
- Persist the normalized `query_shape` and `request_hash` for deterministic audit.

## Open API shape

Every agentic feature should be available through the monday.com Open API.

```graphql
type AgentMemory {
  accountId: ID!
  memoryId: ID!
  boardId: ID
  itemId: ID
  kind: AgentMemoryKind!
  title: String!
  body: String!
  tags: [String!]!
  allowedToolNames: [String!]!
  version: Int!
  updatedAt: DateTime!
}

input AgentMemoryInput {
  boardId: ID
  itemId: ID
  kind: AgentMemoryKind!
  title: String!
  body: String!
  tags: [String!] = []
  allowedToolNames: [String!] = []
}

input SemanticRetrievalInput {
  accountId: ID!
  boardId: ID
  workspaceId: ID
  entityTypes: [SemanticEntityType!]!
  queryText: String!
  tags: [String!] = []
  limit: Int! = 10
  maxVectorCandidates: Int! = 200
}

type SemanticRetrievalResult {
  entityType: SemanticEntityType!
  entityId: ID!
  score: Float!
  title: String!
  snippet: String!
  sourceUpdatedAt: DateTime!
  tags: [String!]!
}

type Query {
  semanticRetrieve(input: SemanticRetrievalInput!): [SemanticRetrievalResult!]!
}

type Mutation {
  upsertAgentMemory(input: AgentMemoryInput!): AgentMemory!
}
```

**Why this shape:** GraphQL makes tenant scope and retrieval limits explicit at the
contract boundary. It also gives agents a stable, tool-friendly schema instead of
requiring prompt-only conventions.

## Consistency model

- **Procedural instructions:** strong consistency. An agent must not execute an old
  instruction after a user changes policy or workflow steps.
- **Semantic facts:** bounded staleness is acceptable when the source record version
  is returned with the retrieval result.
- **Analytics and retrieval telemetry:** columnar eventual consistency is acceptable
  because these records support optimization and audit review, not immediate
  transactional decisions.

## Rollout sequence

1. Introduce scoped memory records and audit events.
2. Add vector candidate generation behind explicit query budgets.
3. Expose GraphQL retrieval and memory mutation APIs.
4. Add tenant-level observability for agent query cost, rejection rate, and latency.
5. Use columnar analytics to tune HNSW parameters and detect expensive query shapes.

## Operational signals

Track these by `account_id`, plan shape, and API caller:

- P50/P95/P99 semantic retrieval latency.
- HNSW candidate count vs. final authorized result count.
- Rejected agent queries by reason.
- Rows read per agent session.
- Tool recursion depth per session.
- Memory mutation rate and audit completeness.

## Non-goals

- Do not let the database decide agent intent.
- Do not perform cross-tenant semantic search.
- Do not allow unbounded vector search on all board content.
- Do not hide approximate retrieval behind deterministic-sounding guarantees.
- Do not mutate procedural memory without an audit event and actor identity.
