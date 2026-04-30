# Agentic Procedure Memory Plane

## Why

mondayDB can become agent-ready without making the storage engine probabilistic. The
trade-off is to keep ACID row writes and deterministic query planning in the core
engine, then add an asynchronous, tenant-scoped memory plane that agents can read
through bounded APIs.

This design favors predictable enterprise behavior over "magic" AI behavior:

- Writes stay strongly scoped by `account_id` and preserve existing transaction
  guarantees.
- Embeddings and vector indexes are derived artifacts from immutable audit events.
- Agents get semantic retrieval and procedural instructions, but every read has
  deterministic cost budgets, limits, and audit traces.

## Product shape

The feature exposes two agent-visible record types:

1. **Procedural memory**: versioned instructions that tell an agent how to operate
   on a board, workspace, automation, or integration.
2. **Semantic memory chunks**: embedded facts, decisions, and examples extracted
   from board activity, docs, updates, and approved procedure versions.

Agents perceive both as metadata-rich context cards. Each card includes scope,
source, confidence, freshness, allowed tools, and cost metadata so an LLM can
choose context without guessing database internals.

## TypeScript schema

```ts
export type AgentMemoryScopeType =
  | "account"
  | "workspace"
  | "board"
  | "item"
  | "automation"
  | "integration";

export interface AgentProcedureMemory {
  accountId: string;
  procedureId: string;
  version: number;
  scopeType: AgentMemoryScopeType;
  scopeId: string;
  title: string;
  instructionMarkdown: string;
  allowedToolNames: string[];
  deniedToolNames: string[];
  maxRecursiveReads: number;
  maxEstimatedRowsRead: number;
  maxVectorTopK: number;
  status: "draft" | "active" | "archived";
  createdByActorId: string;
  createdAt: string;
  deterministicHash: string;
}

export interface AgentSemanticMemoryChunk {
  accountId: string;
  chunkId: string;
  scopeType: AgentMemoryScopeType;
  scopeId: string;
  sourceType: "procedure" | "board_update" | "doc" | "automation_run" | "audit_event";
  sourceId: string;
  contentText: string;
  metadataTags: string[];
  embeddingModel: string;
  embeddingVector: number[];
  visibility: "private" | "workspace" | "account";
  freshnessTs: string;
  deterministicHash: string;
}

export interface AgentRetrievalBudget {
  accountId: string;
  actorId: string;
  requestId: string;
  maxScopes: number;
  maxVectorTopK: number;
  maxEstimatedRowsRead: number;
  maxRecursiveReads: number;
  deadlineMs: number;
}
```

## SQL schema

```sql
CREATE TABLE agent_procedure_memories (
  account_id BIGINT NOT NULL,
  procedure_id UUID NOT NULL,
  version INTEGER NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction_markdown TEXT NOT NULL,
  allowed_tool_names TEXT[] NOT NULL DEFAULT '{}',
  denied_tool_names TEXT[] NOT NULL DEFAULT '{}',
  max_recursive_reads INTEGER NOT NULL DEFAULT 1,
  max_estimated_rows_read BIGINT NOT NULL DEFAULT 50000,
  max_vector_top_k INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL,
  created_by_actor_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deterministic_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, procedure_id, version)
);

CREATE INDEX agent_procedure_memories_scope_idx
  ON agent_procedure_memories (account_id, scope_type, scope_id, status, version DESC);

CREATE TABLE agent_semantic_memory_chunks (
  account_id BIGINT NOT NULL,
  chunk_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  embedding_model TEXT NOT NULL,
  embedding_vector vector(1536) NOT NULL,
  visibility TEXT NOT NULL,
  freshness_ts TIMESTAMPTZ NOT NULL,
  deterministic_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, chunk_id)
)
PARTITION BY HASH (account_id);

CREATE INDEX agent_semantic_memory_scope_idx
  ON agent_semantic_memory_chunks (account_id, scope_type, scope_id, freshness_ts DESC);

CREATE INDEX agent_semantic_memory_hnsw_idx
  ON agent_semantic_memory_chunks
  USING hnsw (embedding_vector vector_cosine_ops);

CREATE TABLE agent_memory_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  request_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  deterministic_plan_hash BYTEA NOT NULL,
  estimated_rows_read BIGINT NOT NULL,
  vector_top_k INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);
```

## Open API GraphQL shape

```graphql
type AgentProcedureMemory {
  procedureId: ID!
  version: Int!
  scopeType: String!
  scopeId: ID!
  title: String!
  instructionMarkdown: String!
  allowedToolNames: [String!]!
  deniedToolNames: [String!]!
  maxRecursiveReads: Int!
  maxEstimatedRowsRead: Float!
  maxVectorTopK: Int!
  status: String!
  deterministicHash: String!
}

type AgentSemanticMemoryChunk {
  chunkId: ID!
  scopeType: String!
  scopeId: ID!
  sourceType: String!
  sourceId: ID!
  contentText: String!
  metadataTags: [String!]!
  freshnessTs: String!
  deterministicHash: String!
}

input AgentMemoryScopeInput {
  scopeType: String!
  scopeId: ID!
}

input AgentRetrievalBudgetInput {
  maxScopes: Int = 5
  maxVectorTopK: Int = 20
  maxEstimatedRowsRead: Float = 50000
  maxRecursiveReads: Int = 1
  deadlineMs: Int = 250
}

extend type Query {
  agentProcedureMemories(scope: AgentMemoryScopeInput!, status: String = "active"): [AgentProcedureMemory!]!
  agentSemanticMemorySearch(
    scope: AgentMemoryScopeInput!
    query: String!
    metadataTags: [String!]
    budget: AgentRetrievalBudgetInput
  ): [AgentSemanticMemoryChunk!]!
}
```

The GraphQL resolver must derive `account_id` from the authenticated monday.com
context. It must not accept `account_id` as user input.

## Resolver contract

```ts
export interface AgentSemanticMemorySearchArgs {
  scope: AgentMemoryScopeInput;
  query: string;
  metadataTags?: string[];
  budget?: Partial<Omit<AgentRetrievalBudget, "accountId" | "actorId" | "requestId">>;
}

export interface AgentSemanticMemorySearchContext {
  accountId: string;
  actorId: string;
  requestId: string;
  authorizedScopeIds: string[];
}
```

Resolver flow:

```sql
SELECT chunk_id, content_text, metadata_tags, freshness_ts, deterministic_hash
FROM agent_semantic_memory_chunks
WHERE account_id = $1
  AND scope_type = $2
  AND scope_id = $3
  AND scope_id = ANY($4)
  AND ($5::text[] IS NULL OR metadata_tags && $5)
ORDER BY embedding_vector <=> $6
LIMIT $7;
```

`$7` must be the lower of the request budget, active procedure limit, and system
tenant limit. The planner must fail closed if it cannot prove the `account_id`
and scope predicates before the HNSW order step.

## Guardrails

- Require `account_id` in every physical key and planner predicate.
- Hash-partition semantic memory by `account_id` so vector probes stay within a
  tenant-owned partition before HNSW ranking.
- Reject vector searches where `maxVectorTopK > 100`.
- Reject recursive retrieval plans above the active procedure's
  `max_recursive_reads`.
- Stop any plan whose estimate exceeds `max_estimated_rows_read` before execution.
- Emit an `agent_memory_audit_events` row for read and write paths.
- Keep embedding generation asynchronous from immutable change events so failed AI
  enrichment never blocks ACID board writes.

## Performance check

Risky patterns on 1M+ row boards:

- Searching semantic chunks without `(account_id, scope_type, scope_id)`.
- Filtering only on `metadata_tags` without a bounded scope.
- Asking for unbounded `topK` vector results.
- Recursing from board to item to update without a depth cap.
- Re-embedding content synchronously during user writes.

Safe path:

1. Resolve authorized scopes for the actor.
2. Fetch active procedure memories by
   `(account_id, scope_type, scope_id, status)`.
3. Build a deterministic retrieval budget from procedure limits.
4. Run bounded pgvector/HNSW search inside authorized scopes.
5. Persist audit event with plan hash, estimated rows, and returned IDs.

## Agent perception

Agents receive compact cards:

```ts
export interface AgentContextCard {
  id: string;
  kind: "procedure" | "semantic_memory";
  scope: `${AgentMemoryScopeType}:${string}`;
  title?: string;
  content: string;
  tags: string[];
  allowedTools: string[];
  deniedTools: string[];
  freshnessTs?: string;
  deterministicHash: string;
}
```

The LLM sees instructions and facts. mondayDB sees deterministic scoped reads,
bounded vector search, and auditable records.
