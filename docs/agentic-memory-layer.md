# mondayDB Agentic Memory Layer

## Why before how

mondayDB can become agent-ready without making the database engine probabilistic.
The trade-off is to keep writes, reads, audits, and isolation deterministic while
adding semantic retrieval as an indexed access path over immutable business data.
This preserves enterprise predictability and multi-tenant safety, but it requires
asynchronous embedding generation: a newly written item is immediately available
through row storage and columnar analytics, while its semantic representation
becomes searchable after the enrichment pipeline commits the embedding record.

That latency vs. consistency boundary is intentional:

- **ACID path:** board/item mutations commit synchronously in mondayDB row storage.
- **Analytical path:** columnar projections continue to serve aggregations.
- **Agentic path:** embeddings and procedural instructions are derived from
  deterministic change events, scoped by `account_id`, and queryable only through
  budgeted APIs.

Agents can use the layer for retrieval-augmented generation and tool planning,
but they do not get an unbounded database cursor.

## Product surface

The first agentic primitive should be a tenant-scoped memory record that can
represent either semantic facts or procedural instructions. Procedural memories
teach an agent how work should be done; semantic memories help it find the right
business context.

```ts
export type AgenticMemoryKind = "semantic_fact" | "procedural_instruction";

export interface AgenticMemoryRecord {
  accountId: string;
  boardId: string;
  itemId?: string;
  memoryId: string;
  kind: AgenticMemoryKind;
  sourceEventId: string;
  sourceVersion: number;
  title: string;
  body: string;
  metadataTags: string[];
  toolScopes: string[];
  embeddingModel: string;
  embeddingDimension: number;
  createdAt: string;
  updatedAt: string;
  auditHash: string;
}

export interface AgenticRetrievalBudget {
  accountId: string;
  maxTopK: number;
  maxVectorCandidates: number;
  maxDepth: number;
  timeoutMs: number;
  allowColumnarFallback: boolean;
}

export interface AgenticRetrievalAuditEvent {
  accountId: string;
  requestId: string;
  actorUserId: string;
  boardId: string;
  queryHash: string;
  selectedMemoryIds: string[];
  vectorIndexVersion: number;
  elapsedMs: number;
  estimatedRowsScanned: number;
  auditHash: string;
}
```

## Storage schema

The relational contract below keeps all access paths tenant-prefixed and makes
the vector index compatible with pgvector/HNSW-style retrieval. The embedding
table is separate from source row storage so failed or delayed enrichment never
blocks board transactions.

```sql
CREATE TABLE agentic_memory_records (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  item_id BIGINT NULL,
  memory_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('semantic_fact', 'procedural_instruction')),
  source_event_id UUID NOT NULL,
  source_version BIGINT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  tool_scopes TEXT[] NOT NULL DEFAULT '{}',
  embedding_model TEXT NOT NULL,
  embedding_dimension INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  audit_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, memory_id)
);

CREATE TABLE agentic_memory_embeddings (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  embedding_version BIGINT NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, memory_id),
  FOREIGN KEY (account_id, memory_id)
    REFERENCES agentic_memory_records (account_id, memory_id)
);

CREATE INDEX agentic_memory_board_kind_idx
  ON agentic_memory_records (account_id, board_id, kind, updated_at DESC);

CREATE INDEX agentic_memory_tags_idx
  ON agentic_memory_records USING GIN (metadata_tags);

CREATE INDEX agentic_memory_embedding_hnsw_idx
  ON agentic_memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE agentic_memory_retrieval_audit_events (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  query_hash BYTEA NOT NULL,
  selected_memory_ids UUID[] NOT NULL,
  vector_index_version BIGINT NOT NULL,
  elapsed_ms INT NOT NULL,
  estimated_rows_scanned BIGINT NOT NULL,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id)
);
```

Implementation note: if the vector index implementation cannot include
`account_id` in the ANN operator class, the query planner must pre-filter by
tenant through a tenant-local partition or shard. A global HNSW search followed
by tenant filtering is disallowed because it risks cross-tenant candidate
leakage, noisy-neighbor CPU spikes, and nondeterministic recall under load.

## Open API shape

Every feature must be available through monday.com Open API. The GraphQL surface
should expose bounded retrieval and deterministic audit fields rather than
agent-specific magic.

```graphql
enum AgenticMemoryKind {
  SEMANTIC_FACT
  PROCEDURAL_INSTRUCTION
}

type AgenticMemory {
  account_id: ID!
  board_id: ID!
  item_id: ID
  memory_id: ID!
  kind: AgenticMemoryKind!
  title: String!
  body: String!
  metadata_tags: [String!]!
  tool_scopes: [String!]!
  source_event_id: ID!
  source_version: Int!
  audit_hash: String!
  updated_at: String!
}

input AgenticMemoryQueryInput {
  board_id: ID!
  kind: AgenticMemoryKind
  query_text: String!
  metadata_tags: [String!]
  top_k: Int = 10
  max_depth: Int = 1
}

type Query {
  agentic_memories(input: AgenticMemoryQueryInput!): [AgenticMemory!]!
}
```

Server-side resolvers derive `account_id` from authentication context, never from
client input. The response includes `audit_hash` so enterprise customers can
replay which deterministic memory records influenced an agent action.

## Guardrails for autonomous agents

Agentic retrieval should be treated as a budgeted tool call:

1. Require `account_id`, `board_id`, and authenticated user context before
   planning a query.
2. Clamp `top_k` to the tenant plan limit, with a default of 10 and an initial
   hard maximum of 50.
3. Reject recursive retrieval when `max_depth > 2`; most workflows should run at
   depth 1.
4. Require at least one indexed filter for boards with more than 1M items:
   `board_id`, `kind`, or selective `metadata_tags`.
5. Stop columnar fallback unless `allowColumnarFallback` is true and the planner
   estimate is below the tenant CPU budget.
6. Emit an immutable audit event containing request hash, selected memory IDs,
   vector index version, elapsed time, and budget counters.
7. Deny plans that rely on a global ANN index followed by `account_id`
   post-filtering.

These rules prevent an LLM from turning a vague prompt into expensive recursive
queries that degrade neighboring tenants.

## Performance check

Potential full table scan risks:

- Missing `account_id` predicate on either memory table.
- Searching by `body` with `ILIKE` instead of vector or full-text indexes.
- Unbounded `top_k`, high ANN candidate counts, or recursive tool calls.
- Filtering `metadata_tags` without a GIN index or tenant partition pruning.
- Falling back to columnar scans on boards with 1M+ rows without planner limits.

Recommended planner invariants:

```ts
export interface AgenticQueryPlan {
  accountId: string;
  boardId: string;
  usesTenantPartition: boolean;
  usesVectorIndex: boolean;
  estimatedRowsScanned: number;
  estimatedVectorCandidates: number;
  topK: number;
  maxDepth: number;
  auditHash: string;
}
```

The resolver should fail closed when `usesTenantPartition` is false or when
`estimatedRowsScanned` exceeds the tenant's configured budget.

## How an agent perceives the data

Agents should receive memory records as tagged, source-linked context:

- `kind` tells the agent whether the record is a fact or an instruction.
- `metadata_tags` map context to domains such as `crm`, `status_policy`, or
  `risk_escalation`.
- `tool_scopes` describe which monday.com tools the memory may inform, such as
  `items.read`, `updates.create`, or `automations.suggest`.
- `source_event_id`, `source_version`, and `audit_hash` make the context
  replayable and deterministic.

The LLM can reason over this metadata, but mondayDB remains responsible for
tenant scoping, index selection, cost limits, and trace generation.
