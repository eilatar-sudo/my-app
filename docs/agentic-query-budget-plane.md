# mondayDB Agentic Query Budget Plane

## Why

Agentic workloads turn a single user intent into many retrieval, planning, and
tool-use queries. That is useful for procedural memory and semantic recall, but
it creates a latency-versus-autonomy trade-off: more agent steps improve context,
while unbounded fan-out can hurt neighbor tenants and make costs unpredictable.

The query budget plane keeps mondayDB deterministic. Agents may propose work, but
mondayDB accepts only a bounded, tenant-scoped query plan with explicit limits,
audit metadata, and predictable failure modes.

## Product contract

- Every request is scoped by `account_id`.
- Every agent run receives a deterministic `agent_run_id`.
- Every recursive retrieval or tool call consumes budget before execution.
- Budget exhaustion returns a stable error, not partial hidden behavior.
- Semantic retrieval is allowed only through tenant-prefixed vector indexes.
- Procedural memory records are data, not executable database logic.

## TypeScript shape

```ts
export type AgenticWorkloadKind =
  | "semantic_retrieval"
  | "procedural_memory"
  | "tool_preflight"
  | "columnar_analytics";

export interface AgenticQueryBudget {
  account_id: string;
  agent_run_id: string;
  board_id?: string;
  workload_kind: AgenticWorkloadKind;
  max_queries: number;
  max_recursive_depth: number;
  max_vector_top_k: number;
  max_rows_scanned: number;
  max_columnar_bytes: number;
  timeout_ms: number;
  requested_by_user_id: string;
  request_hash: string;
  created_at: string;
}

export interface AgenticBudgetLedgerEntry {
  account_id: string;
  agent_run_id: string;
  sequence: number;
  operation: AgenticWorkloadKind;
  estimated_rows: number;
  estimated_columnar_bytes: number;
  vector_top_k?: number;
  recursive_depth: number;
  accepted: boolean;
  rejection_reason?: "missing_account_scope" | "budget_exhausted" | "full_scan_risk";
  audit_hash: string;
  created_at: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_query_budgets (
  account_id TEXT NOT NULL,
  agent_run_id TEXT NOT NULL,
  board_id TEXT,
  workload_kind TEXT NOT NULL,
  max_queries INTEGER NOT NULL CHECK (max_queries > 0),
  max_recursive_depth INTEGER NOT NULL CHECK (max_recursive_depth >= 0),
  max_vector_top_k INTEGER NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_rows_scanned BIGINT NOT NULL CHECK (max_rows_scanned > 0),
  max_columnar_bytes BIGINT NOT NULL CHECK (max_columnar_bytes > 0),
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 1 AND 30000),
  requested_by_user_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, agent_run_id)
);

CREATE TABLE agentic_budget_ledger (
  account_id TEXT NOT NULL,
  agent_run_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  operation TEXT NOT NULL,
  estimated_rows BIGINT NOT NULL,
  estimated_columnar_bytes BIGINT NOT NULL,
  vector_top_k INTEGER,
  recursive_depth INTEGER NOT NULL,
  accepted BOOLEAN NOT NULL,
  rejection_reason TEXT,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, agent_run_id, sequence),
  FOREIGN KEY (account_id, agent_run_id)
    REFERENCES agentic_query_budgets (account_id, agent_run_id)
);

CREATE INDEX agentic_budget_ledger_account_created_idx
  ON agentic_budget_ledger (account_id, created_at DESC);
```

## Open API GraphQL surface

```graphql
scalar BigInt

type AgenticQueryBudget {
  accountId: ID!
  agentRunId: ID!
  boardId: ID
  workloadKind: String!
  maxQueries: Int!
  maxRecursiveDepth: Int!
  maxVectorTopK: Int!
  maxRowsScanned: BigInt!
  maxColumnarBytes: BigInt!
  timeoutMs: Int!
  requestHash: String!
}

input AgenticQueryBudgetInput {
  boardId: ID
  workloadKind: String!
  maxQueries: Int!
  maxRecursiveDepth: Int!
  maxVectorTopK: Int!
  maxRowsScanned: BigInt!
  maxColumnarBytes: BigInt!
  timeoutMs: Int!
  requestHash: String!
}

type Mutation {
  createAgenticQueryBudget(input: AgenticQueryBudgetInput!): AgenticQueryBudget!
}
```

`accountId` and `requestedByUserId` come from the authenticated monday.com
context, not client input.

## Execution guardrails

1. Reject plans missing `account_id` before optimization.
2. Estimate row and columnar byte cost before query dispatch.
3. Debit `max_queries`, `max_rows_scanned`, and `max_columnar_bytes` atomically.
4. Enforce `max_recursive_depth` across retrieval and tool preflight calls.
5. Cap vector retrieval at `max_vector_top_k`.
6. Write one ledger row for every accepted or rejected operation.
7. Derive `audit_hash` from `(previous_audit_hash, account_id, agent_run_id,
   sequence, normalized_operation_plan)` so replay creates the same trace.

## Semantic retrieval compatibility

Vector indexes must keep tenant and object scope in the leading metadata fields:

```sql
CREATE TABLE agentic_memory_embeddings (
  account_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  board_id TEXT,
  memory_kind TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agentic_memory_embeddings_hnsw_idx
  ON agentic_memory_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX agentic_memory_embeddings_scope_idx
  ON agentic_memory_embeddings (account_id, board_id, memory_kind);
```

The planner must apply `account_id` and optional `board_id` filters before HNSW
candidate expansion. If the vector store cannot guarantee that order, maintain
per-tenant or per-shard HNSW partitions.

## Performance check

Potential full-scan risks on boards with 1M+ rows:

- Semantic search without an `account_id` predicate.
- Procedural memory lookup filtered only by JSON metadata.
- Agent recursion that expands to every item on a board.
- Columnar analytics without `board_id`, date, or partition pruning.
- `topK` values above the budget cap.

Required mitigations:

- Composite indexes begin with `account_id`.
- Row-store lookups use `(account_id, board_id, item_id)` when item-scoped.
- Columnar scans must expose estimated bytes before execution.
- JSON metadata filters need promoted columns for hot predicates.

## Agent perception

Expose budget state to agents as metadata, not hidden magic:

```json
{
  "agent_run_id": "run_123",
  "remaining_queries": 14,
  "remaining_recursive_depth": 2,
  "remaining_vector_top_k": 50,
  "risk": "columnar_scan_requires_partition_filter",
  "required_scope": {
    "account_id": "acct_456",
    "board_id": "board_789"
  }
}
```

This lets an LLM choose cheaper retrieval steps while mondayDB still enforces the
same deterministic rules for every tenant.
