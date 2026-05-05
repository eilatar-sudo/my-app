# mondayDB agentic database strategy

## Why before how

mondayDB should become agent-ready by exposing deterministic memory and retrieval
primitives through the Open API, not by putting probabilistic behavior inside the
database engine. This keeps the current WorkOS strengths: ACID semantics for
board updates, strict multi-tenant isolation, and low-latency queries at large
scale.

Core trade-off:

- **Latency vs. consistency:** semantic retrieval can be eventually indexed, but
  writes to source records and memory manifests must stay transactional.
- **Recall vs. tenant safety:** vector search improves agent recall, but every
  index entry must be scoped by `account_id` and policy metadata before ranking.
- **Agent autonomy vs. neighbor performance:** agents need tool-ready context,
  but recursive planning queries must have budgets, depth limits, and audit
  traces.

## Product capability: Agent Memory Layer

The Agent Memory Layer stores deterministic instructions and facts that agents
can retrieve, explain, and execute against monday.com objects. It has three
memory classes:

1. **Procedural memory:** versioned instructions, workflows, policy hints, and
   tool contracts for agents.
2. **Semantic memory:** embeddings derived from board items, updates, docs, and
   procedural memory for RAG.
3. **Execution memory:** auditable records of agent plans, tool calls, query
   budgets, and outcomes.

Agents perceive this layer as tagged, scoped context:

```ts
export interface AgentPerceivedContext {
  accountId: string;
  boardId?: string;
  itemId?: string;
  memoryKind: "procedural" | "semantic" | "execution";
  title: string;
  summary: string;
  tags: string[];
  source: {
    objectType: "board" | "item" | "column" | "doc" | "automation" | "agent";
    objectId: string;
    version: string;
  };
  confidence: number;
  lastVerifiedAt: string;
}
```

## Schema design

Use account-scoped tables or collections that map cleanly to row storage for
transactional writes and columnar projections for analytics.

```sql
CREATE TABLE agent_memory_manifest (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  memory_kind TEXT NOT NULL CHECK (
    memory_kind IN ('procedural', 'semantic', 'execution')
  ),
  source_object_type TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility_policy JSONB NOT NULL,
  created_by_actor_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id)
);

CREATE TABLE agent_procedural_memory (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  instruction_version INTEGER NOT NULL,
  instruction_body JSONB NOT NULL,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  deterministic_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, instruction_version),
  FOREIGN KEY (account_id, memory_id)
    REFERENCES agent_memory_manifest (account_id, memory_id)
);

CREATE TABLE agent_semantic_embedding (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  hnsw_partition_key TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, embedding_model),
  FOREIGN KEY (account_id, memory_id)
    REFERENCES agent_memory_manifest (account_id, memory_id)
);

CREATE TABLE agent_execution_audit (
  account_id BIGINT NOT NULL,
  execution_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  root_memory_id UUID,
  requested_tool TEXT NOT NULL,
  query_budget JSONB NOT NULL,
  deterministic_plan_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('accepted', 'rejected', 'completed', 'failed')
  ),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, execution_id)
);
```

TypeScript API contracts:

```ts
export interface AgentMemoryManifest {
  accountId: string;
  memoryId: string;
  memoryKind: "procedural" | "semantic" | "execution";
  sourceObjectType: "board" | "item" | "column" | "doc" | "automation" | "agent";
  sourceObjectId: string;
  sourceVersion: string;
  boardId?: string;
  itemId?: string;
  title: string;
  summary: string;
  tags: string[];
  visibilityPolicy: {
    allowedUserIds?: string[];
    allowedTeamIds?: string[];
    boardRoleMinimum?: "viewer" | "editor" | "owner";
  };
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProceduralMemory {
  accountId: string;
  memoryId: string;
  instructionVersion: number;
  instructionBody: {
    objective: string;
    constraints: string[];
    requiredInputs: string[];
    successCriteria: string[];
  };
  allowedTools: string[];
  deterministicHash: string;
}

export interface AgentQueryBudget {
  maxRowsScanned: number;
  maxVectorCandidates: number;
  maxRecursiveDepth: number;
  timeoutMs: number;
  requireBoardPredicate: boolean;
}
```

## Open API GraphQL surface

Every field resolves inside an `account_id` scope derived from authentication.
Clients never provide raw tenant scope as a trust boundary.

```graphql
type AgentMemory {
  id: ID!
  kind: AgentMemoryKind!
  boardId: ID
  itemId: ID
  title: String!
  summary: String!
  tags: [String!]!
  source: AgentMemorySource!
  updatedAt: ISO8601DateTime!
}

enum AgentMemoryKind {
  PROCEDURAL
  SEMANTIC
  EXECUTION
}

input AgentMemorySearchInput {
  boardIds: [ID!]
  itemIds: [ID!]
  tags: [String!]
  query: String!
  limit: Int = 20
  budget: AgentQueryBudgetInput
}

type Query {
  agentMemorySearch(input: AgentMemorySearchInput!): [AgentMemory!]!
}

type Mutation {
  upsertAgentProceduralMemory(input: UpsertAgentProceduralMemoryInput!): AgentMemory!
}
```

## Query and index strategy

Recommended indexes:

```sql
CREATE INDEX idx_agent_memory_board
  ON agent_memory_manifest (account_id, board_id, updated_at DESC);

CREATE INDEX idx_agent_memory_item
  ON agent_memory_manifest (account_id, item_id, updated_at DESC);

CREATE INDEX idx_agent_memory_tags
  ON agent_memory_manifest USING GIN (tags);

CREATE INDEX idx_agent_embedding_hnsw
  ON agent_semantic_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

For pgvector or HNSW compatibility, keep embeddings in a separate account-scoped
relation and join back through `(account_id, memory_id)`. In production,
partition or shard the vector relation by `account_id` or an account-derived
`hnsw_partition_key` so nearest-neighbor search never ranks cross-tenant
candidates.

Performance checks:

- Reject `agentMemorySearch` without at least one selective predicate:
  `boardIds`, `itemIds`, `tags`, or a tenant-local vector partition.
- Cap HNSW candidate expansion before hydration. Default `limit` should be 20
  and maximum should be 100.
- Do not scan board item rows to build context at read time. Use async
  projection jobs to update `agent_memory_manifest` and embeddings after source
  changes commit.
- Tag searches must combine the tag GIN bitmap with an `account_id` filter.
- Any query plan for a board with 1M+ rows must show an `account_id` predicate
  and one of `board_id`, `item_id`, tag GIN bitmap access, or vector index
  access. Otherwise fail closed with a deterministic budget error.

## Agentic guardrails

Guardrails are deterministic database policies, not model prompts:

```ts
export interface AgenticGuardrailDecision {
  accountId: string;
  executionId: string;
  accepted: boolean;
  reason?: "missing_scope" | "budget_exceeded" | "recursive_depth" | "tool_denied";
  enforcedBudget: AgentQueryBudget;
  planHash: string;
}
```

Rules:

1. Require `account_id` on every storage call and derive it from auth context.
2. Enforce maximum recursive depth for agent query planning.
3. Require a costed plan before execution when vector retrieval is combined with
   board item hydration.
4. Write `agent_execution_audit` before tool execution and update status after
   completion or failure.
5. Deny tool calls whose deterministic plan hash changes after approval.

## Rollout path

1. Ship manifest and procedural memory APIs first. This gives agents stable
   instructions without adding vector-read latency to critical paths.
2. Add semantic embeddings as asynchronous projections. Source writes remain
   ACID; embedding freshness is observable through `indexed_at` and
   `source_checksum`.
3. Add execution audit and budgets to protect shared compute.
4. Expose GraphQL search only after plan enforcement confirms no full table scan
   risk for large boards.

## Success metrics

- P99 `agentMemorySearch` latency under existing board query SLO for scoped
  searches.
- Zero cross-account candidate leakage in vector retrieval tests.
- 100% of agent tool executions have `agent_execution_audit` rows.
- No unbounded scans in query-plan tests for synthetic 1M+ row boards.
