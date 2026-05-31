# mondayDB Agentic Database Vision

mondayDB should evolve from a high-performance WorkOS engine into an
agent-ready database without compromising the properties that make it trusted:
tenant isolation, deterministic behavior, ACID transactions, and predictable
latency at monday.com scale.

## Why this matters

Agents need durable memory, semantic retrieval, and safe tool-use context. The
database should provide those primitives as explicit, auditable data structures
instead of hiding probabilistic behavior inside the storage engine.

The central product trade-off is **agent usefulness vs. enterprise
predictability**:

- Richer semantic retrieval helps agents find relevant work context, but stale
  embeddings can disagree with transactional row state.
- Long-term procedural memory improves automation quality, but unbounded memory
  search can create noisy results and expensive cross-board scans.
- Agent tool-use metadata enables safer automation, but every tool plan must be
  scoped, budgeted, and audited to protect neighboring tenants.

The recommended direction is a deterministic "agentic memory plane" above the
existing mondayDB row and columnar layers.

## Design principles

1. **Account scope is mandatory.** Every API, index, and query plan begins with
   `account_id`.
2. **AI output is data, not database behavior.** mondayDB stores embeddings,
   memories, tool traces, and policy metadata; it does not make magical,
   non-deterministic query decisions.
3. **Fresh transactional state wins.** Row storage remains the source of truth
   for board updates and ACID workflows. Semantic indexes are derived views with
   freshness metadata.
4. **Cost is a first-class guardrail.** Agent queries must carry budgets for
   rows scanned, vector probes, recursion depth, and wall-clock latency.
5. **Open API first.** Agentic capabilities must be exposed through the
   monday.com GraphQL API with deterministic request and response contracts.

## Reference architecture

```text
GraphQL Open API
  -> Agentic Query Gateway
     -> tenant policy and budget enforcement
     -> deterministic query planner
     -> row storage for transactions and fresh state
     -> columnar storage for aggregations
     -> vector index for semantic retrieval
     -> audit stream for traceability
```

### Storage placement

| Concern | Primary layer | Reason |
| --- | --- | --- |
| Board item state | Row storage | Low-latency updates, ACID semantics |
| Aggregated board analytics | Columnar storage | Fast scans and group-by workloads |
| Semantic memories | Vector index plus row metadata | HNSW-compatible retrieval with deterministic filters |
| Procedural memories | Row storage plus versioned audit | Agents need ordered instructions and provenance |
| Tool invocation traces | Append-only audit log | Deterministic replay and compliance review |

## Schema design

### TypeScript contracts

```ts
export type MemoryKind = "semantic" | "procedural" | "episodic";

export interface AccountScoped {
  accountId: string;
}

export interface AgenticMemory extends AccountScoped {
  memoryId: string;
  boardId?: string;
  itemId?: string;
  kind: MemoryKind;
  title: string;
  content: string;
  metadataTags: string[];
  sourceRef: {
    type: "board_item" | "doc" | "automation" | "tool_trace";
    id: string;
  };
  embeddingModel: string;
  embeddingVersion: number;
  embeddingFreshAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProceduralMemory extends AccountScoped {
  procedureId: string;
  name: string;
  instructions: string[];
  allowedToolNames: string[];
  requiredHumanApproval: boolean;
  version: number;
  status: "draft" | "active" | "archived";
}

export interface AgenticQueryBudget {
  maxRowsScanned: number;
  maxVectorCandidates: number;
  maxRecursiveDepth: number;
  timeoutMs: number;
  requireAccountScopedIndexes: true;
}

export interface AgentMemorySearchRequest extends AccountScoped {
  queryText: string;
  boardIds?: string[];
  tags?: string[];
  limit: number;
  budget: AgenticQueryBudget;
}

export interface ToolInvocationAudit extends AccountScoped {
  invocationId: string;
  agentId: string;
  toolName: string;
  inputDigest: string;
  outputDigest?: string;
  affectedBoardIds: string[];
  budget: AgenticQueryBudget;
  status: "planned" | "executed" | "blocked" | "failed";
  createdAt: string;
}
```

### SQL shape

The exact implementation can map to mondayDB internals, but the logical schema
should preserve account-first access patterns.

```sql
CREATE TABLE agentic_memories (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  kind TEXT NOT NULL CHECK (kind IN ('semantic', 'procedural', 'episodic')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version INTEGER NOT NULL,
  embedding_fresh_at TIMESTAMPTZ NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_memories_account_board_idx
  ON agentic_memories (account_id, board_id, kind, updated_at DESC);

CREATE INDEX agentic_memories_account_tags_idx
  ON agentic_memories USING GIN (metadata_tags);

CREATE INDEX agentic_memories_embedding_hnsw_idx
  ON agentic_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE procedural_memories (
  account_id BIGINT NOT NULL,
  procedure_id UUID NOT NULL,
  name TEXT NOT NULL,
  instructions JSONB NOT NULL,
  allowed_tool_names TEXT[] NOT NULL DEFAULT '{}',
  required_human_approval BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, procedure_id, version)
);

CREATE TABLE agent_tool_invocation_audit (
  account_id BIGINT NOT NULL,
  invocation_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  output_digest TEXT,
  affected_board_ids BIGINT[] NOT NULL DEFAULT '{}',
  budget JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'executed', 'blocked', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, invocation_id)
);
```

### Performance note

The logical table is partitioned by `account_id` so HNSW and GIN indexes can be
deployed per tenant shard. A vector search that cannot prove `account_id`
selectivity before candidate expansion is unsafe for multi-tenant production
traffic.

## GraphQL API proposal

```graphql
type AgenticMemory {
  memoryId: ID!
  accountId: ID!
  boardId: ID
  itemId: ID
  kind: AgenticMemoryKind!
  title: String!
  content: String!
  metadataTags: [String!]!
  embeddingFreshAt: ISO8601DateTime!
  sourceRef: AgenticSourceRef!
}

input AgentMemorySearchInput {
  accountId: ID!
  queryText: String!
  boardIds: [ID!]
  tags: [String!]
  limit: Int! = 10
  budget: AgenticQueryBudgetInput!
}

type Query {
  agentMemorySearch(input: AgentMemorySearchInput!): [AgenticMemory!]!
}

type Mutation {
  upsertProceduralMemory(input: UpsertProceduralMemoryInput!): ProceduralMemory!
  planAgentToolInvocation(input: PlanAgentToolInvocationInput!): ToolInvocationPlan!
}
```

API behavior should be deterministic:

- The caller must provide `accountId`; server-side authorization verifies it.
- The response includes freshness metadata so agents can decide whether to
  request live row reads.
- Mutations append audit records before execution and update them after
  completion.

## Agentic guardrails

Agentic queries require a gateway that rejects unsafe plans before they reach
storage.

| Guardrail | Why | Enforcement |
| --- | --- | --- |
| Mandatory `account_id` | Prevent tenant leakage | Static validation and planner invariant |
| Board allowlist | Limit blast radius | Require `boardIds` for high-cardinality accounts |
| Vector candidate cap | Bound HNSW fan-out | `maxVectorCandidates` budget |
| Recursive depth cap | Prevent agent loops | `maxRecursiveDepth` budget and invocation lineage |
| Cost preflight | Avoid neighbor impact | Reject plans exceeding row/vector/latency budgets |
| Audit digest | Deterministic trace | Hash inputs, outputs, and query plan IDs |
| Human approval flags | Protect destructive tools | Enforce procedure policy before execution |

## Full-scan risk checklist

Any proposal must be rejected or redesigned if it can trigger one of these
patterns on boards with more than 1M rows:

- Vector search without an `account_id` filter.
- Tag filtering that depends only on a global GIN index.
- Columnar aggregation without board, account, or time partition pruning.
- Recursive agent planning that expands across all connected boards.
- Backfill jobs that recompute embeddings synchronously in user request paths.

## How an agent perceives mondayDB data

Agents should see memory as typed, scoped context:

```json
{
  "account_id": "123",
  "board_id": "456",
  "kind": "procedural",
  "title": "Escalate blocked enterprise renewal",
  "metadata_tags": ["sales", "renewal", "human-approval-required"],
  "freshness": {
    "embedding_fresh_at": "2026-05-31T00:00:00Z",
    "source_updated_at": "2026-05-31T00:00:00Z"
  },
  "allowed_tools": ["create_update", "notify_owner"],
  "guardrails": {
    "max_recursive_depth": 2,
    "requires_human_approval": true
  }
}
```

This gives the LLM enough semantic context for retrieval-augmented generation
while preserving deterministic enforcement in mondayDB.

## Recommended delivery path

1. **Read-only semantic memory search**
   - Add account-scoped vector retrieval for board and item context.
   - Return freshness and source metadata in GraphQL responses.
   - Keep transactional writes unchanged.

2. **Versioned procedural memory**
   - Store explicit instructions, allowed tools, and approval requirements.
   - Require audit records for every mutation.

3. **Agentic query gateway**
   - Add budget-aware plan validation for vector, columnar, and recursive
     workloads.
   - Block unsafe queries before execution.

4. **Tool-use audit and replay**
   - Capture deterministic input and output digests.
   - Link each tool invocation to account, boards, agent, procedure version,
     and query plan.

5. **Columnar analytics for agent observability**
   - Measure memory hit rates, blocked plan reasons, stale embedding rates,
     and per-account cost budgets without scanning transactional rows.

## Key open decisions

- Whether vector indexes are physically partitioned by `account_id` or use a
  shared index with account-aware prefilters.
- Freshness SLA for embeddings after row updates.
- Maximum default query budget for enterprise accounts with very large boards.
- GraphQL shape for exposing rejected query plans without leaking internal
  planner details.