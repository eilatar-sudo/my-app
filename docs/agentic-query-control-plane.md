# mondayDB Agentic Query Control Plane

## Why this matters

mondayDB can become agent-ready without making the database engine probabilistic. The product trade-off is **agent flexibility vs. tenant predictability**: agents need semantic retrieval, procedural memory, and tool-use context, while enterprise workloads need bounded latency, ACID writes, deterministic audit trails, and strict `account_id` isolation.

This control plane keeps AI behavior outside the storage engine. The engine executes deterministic row, columnar, and vector queries only after a signed query plan passes tenant, budget, and audit checks.

## Design goals

- **Procedural memory:** Store reusable instructions as versioned records with deterministic activation rules.
- **Semantic retrieval:** Support pgvector/HNSW-compatible embeddings for RAG over board items, docs, automations, and agent memories.
- **Agentic guardrails:** Bound recursive retrieval, tool calls, fan-out, and estimated scan cost before execution.
- **Enterprise stability:** Require `account_id` on every table, index, GraphQL resolver, audit event, and query plan.
- **Predictability:** Persist exact plan hashes and cost decisions so behavior can be replayed.

## Core schema

```sql
CREATE TABLE agentic_memory_records (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('procedural', 'semantic', 'episodic')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  activation_rules JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(1536),
  embedding_model TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  created_by_actor_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agentic_memory_hnsw_idx
  ON agentic_memory_records
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX agentic_memory_tenant_lookup_idx
  ON agentic_memory_records (account_id, board_id, memory_type, updated_at DESC);

CREATE TABLE agentic_query_plans (
  account_id BIGINT NOT NULL,
  plan_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  root_request_hash TEXT NOT NULL,
  normalized_plan_hash TEXT NOT NULL,
  max_vector_top_k INT NOT NULL,
  max_recursive_depth INT NOT NULL,
  max_tool_calls INT NOT NULL,
  estimated_row_reads BIGINT NOT NULL,
  estimated_vector_probes BIGINT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'degraded')),
  decision_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, plan_id)
);
```

### TypeScript contract

```ts
export type AgenticMemoryType = "procedural" | "semantic" | "episodic";
export type AgenticPlanDecision = "approved" | "rejected" | "degraded";

export interface AgenticMemoryRecord {
  accountId: string;
  memoryId: string;
  boardId?: string;
  itemId?: string;
  memoryType: AgenticMemoryType;
  title: string;
  body: string;
  metadata: {
    tags: string[];
    source: "board" | "doc" | "automation" | "integration" | "agent";
    sensitivity: "public" | "account" | "restricted";
    toolHints?: string[];
  };
  activationRules: {
    boardKinds?: string[];
    userRoles?: string[];
    minSimilarity?: number;
  };
  embedding?: number[];
  embeddingModel?: string;
  version: number;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgenticQueryPlan {
  accountId: string;
  planId: string;
  actorId: string;
  rootRequestHash: string;
  normalizedPlanHash: string;
  budgets: {
    maxVectorTopK: number;
    maxRecursiveDepth: number;
    maxToolCalls: number;
    timeoutMs: number;
  };
  estimates: {
    rowReads: number;
    vectorProbes: number;
    columnarPartitions: number;
  };
  decision: AgenticPlanDecision;
  decisionReason: string;
}
```

## Open API GraphQL shape

Every resolver must derive `account_id` from the authenticated session, never from client input alone.

```graphql
type AgenticMemoryRecord {
  id: ID!
  boardId: ID
  itemId: ID
  memoryType: String!
  title: String!
  body: String!
  metadata: JSON!
  activationRules: JSON!
  version: Int!
  updatedAt: String!
}

input AgenticMemorySearchInput {
  boardId: ID
  memoryTypes: [String!]
  query: String!
  topK: Int = 20
  maxRecursiveDepth: Int = 1
}

type AgenticMemorySearchResult {
  record: AgenticMemoryRecord!
  similarity: Float!
  planId: ID!
  matchedTags: [String!]!
}

extend type Query {
  agenticMemorySearch(input: AgenticMemorySearchInput!): [AgenticMemorySearchResult!]!
}
```

## Query execution flow

1. Normalize the GraphQL request and derive `account_id`, actor, board scope, and requested budgets.
2. Generate or reuse embedding outside the transaction path.
3. Build a deterministic query plan with explicit row, vector, and columnar operators.
4. Reject plans without an `account_id` prefix on every storage access.
5. Compare estimates against tenant budgets.
6. Execute approved plans with per-operator timeouts and result limits.
7. Write immutable audit events with request hash, normalized plan hash, cost estimates, and decision.

## Guardrail policy

| Risk | Guardrail | Default |
| --- | --- | --- |
| Recursive RAG loop | `maxRecursiveDepth` hard cap | 1 for user queries, 2 for trusted automations |
| Expensive vector fan-out | `topK` cap and HNSW probe cap | `topK <= 50` |
| Neighbor impact | Account-level token bucket for vector probes | Enforced before execution |
| Tool storm | Tool call count and wall-clock budget | `maxToolCalls <= 5` |
| Full table scan | Reject unindexed filters on 1M+ row boards | Mandatory |
| Data leakage | Composite tenant key on reads/writes | `account_id` first |

## Performance check

Do not run semantic search by filtering vectors after a broad board scan. For boards above 1M rows, these patterns must be rejected or degraded:

- Missing `account_id` predicate.
- `topK` above tenant budget.
- JSONB metadata filters without a matching `(account_id, key)` index or generated column.
- Unbounded recursion where retrieved memories trigger more retrieval calls.
- Columnar aggregation joined to vector results without pre-limited candidate IDs.

Preferred plan for RAG:

```sql
WITH candidates AS (
  SELECT account_id, memory_id, 1 - (embedding <=> $1) AS similarity
  FROM agentic_memory_records
  WHERE account_id = $2
    AND board_id = $3
    AND memory_type = ANY($4)
  ORDER BY embedding <=> $1
  LIMIT LEAST($5, 50)
)
SELECT m.*, c.similarity
FROM candidates c
JOIN agentic_memory_records m
  ON m.account_id = c.account_id
 AND m.memory_id = c.memory_id
ORDER BY c.similarity DESC;
```

## Agent perception model

Agents should perceive each memory as:

- **Instruction:** `memory_type = 'procedural'`, `activation_rules`, and `toolHints`.
- **Evidence:** semantic body text, source, board/item IDs, and version.
- **Boundary:** sensitivity tag, actor role requirements, account scope, and plan budget.
- **Trace:** `plan_id`, memory version, similarity score, and deterministic audit hash.

This gives LLMs useful context while keeping mondayDB deterministic: the agent can reason over metadata, but the engine only executes bounded, tenant-scoped plans.

