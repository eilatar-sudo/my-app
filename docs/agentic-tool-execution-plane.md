# mondayDB Agentic Tool Execution Plane

## Why: tool-use readiness without noisy-neighbor risk

Agentic workflows need database-backed tool calls: read board context, retrieve relevant
memory, write deterministic updates, and hand control back to an LLM or worker. The
trade-off is autonomy vs. predictability. If mondayDB lets agents recursively issue
unbounded queries, one tenant can burn compute, degrade HNSW recall latency, or create
audit gaps. If the engine blocks every agent action behind synchronous approvals, agents
lose their value.

The proposed tool execution plane keeps mondayDB deterministic by storing every agent
tool invocation as a tenant-scoped, budgeted, auditable lease. Agents may be
probabilistic in how they choose tools, but mondayDB only executes explicit plans with
bounded cost, stable inputs, and deterministic audit hashes.

## Design goals

- **Multi-tenant isolation:** every row and query path starts with `account_id`.
- **ACID-safe writes:** agent tool writes use existing transaction semantics and
  idempotency keys.
- **Semantic retrieval compatibility:** tool context can reference pgvector/HNSW-backed
  memories without embedding vectors inside the hot transaction row.
- **Procedural memory:** reusable tool instructions are versioned records with explicit
  preconditions, budgets, and rollback behavior.
- **Open API first:** agents can create, approve, inspect, and cancel leases through
  GraphQL.
- **Guardrails by default:** recursion depth, cost units, row limits, vector `topK`, and
  wall-clock timeout are enforced before execution.

## Core TypeScript model

```ts
export type AgentToolLeaseStatus =
  | "PENDING_APPROVAL"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "BUDGET_EXHAUSTED";

export interface AgentToolProcedure {
  accountId: string;
  procedureId: string;
  version: number;
  name: string;
  description: string;
  instructionMarkdown: string;
  allowedToolNames: string[];
  requiredScopes: string[];
  maxRecursionDepth: number;
  maxEstimatedCostUnits: number;
  maxVectorTopK: number;
  maxRowsRead: number;
  timeoutMs: number;
  metadataTags: string[];
  createdByUserId: string;
  createdAt: string;
}

export interface AgentToolLease {
  accountId: string;
  leaseId: string;
  procedureId: string;
  procedureVersion: number;
  boardId?: string;
  requestingActorId: string;
  actorType: "USER" | "APP" | "AGENT";
  status: AgentToolLeaseStatus;
  idempotencyKey: string;
  requestedToolNames: string[];
  recursionDepth: number;
  estimatedCostUnits: number;
  vectorTopK: number;
  rowReadLimit: number;
  expiresAt: string;
  inputDigestSha256: string;
  planDigestSha256: string;
  auditChainPrevSha256?: string;
  auditChainSha256: string;
  createdAt: string;
  updatedAt: string;
}
```

## SQL schema

```sql
CREATE TABLE agent_tool_procedures (
  account_id BIGINT NOT NULL,
  procedure_id UUID NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  instruction_markdown TEXT NOT NULL,
  allowed_tool_names TEXT[] NOT NULL,
  required_scopes TEXT[] NOT NULL,
  max_recursion_depth SMALLINT NOT NULL CHECK (max_recursion_depth BETWEEN 0 AND 8),
  max_estimated_cost_units INTEGER NOT NULL CHECK (max_estimated_cost_units > 0),
  max_vector_top_k SMALLINT NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_rows_read INTEGER NOT NULL CHECK (max_rows_read BETWEEN 1 AND 100000),
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 100 AND 30000),
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, procedure_id, version)
);

CREATE TABLE agent_tool_leases (
  account_id BIGINT NOT NULL,
  lease_id UUID NOT NULL,
  procedure_id UUID NOT NULL,
  procedure_version INTEGER NOT NULL,
  board_id BIGINT,
  requesting_actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('USER', 'APP', 'AGENT')),
  status TEXT NOT NULL CHECK (
    status IN (
      'PENDING_APPROVAL',
      'READY',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'BUDGET_EXHAUSTED'
    )
  ),
  idempotency_key TEXT NOT NULL,
  requested_tool_names TEXT[] NOT NULL,
  recursion_depth SMALLINT NOT NULL CHECK (recursion_depth >= 0),
  estimated_cost_units INTEGER NOT NULL CHECK (estimated_cost_units >= 0),
  vector_top_k SMALLINT NOT NULL CHECK (vector_top_k BETWEEN 1 AND 200),
  row_read_limit INTEGER NOT NULL CHECK (row_read_limit BETWEEN 1 AND 100000),
  expires_at TIMESTAMPTZ NOT NULL,
  input_digest_sha256 CHAR(64) NOT NULL,
  plan_digest_sha256 CHAR(64) NOT NULL,
  audit_chain_prev_sha256 CHAR(64),
  audit_chain_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, lease_id),
  UNIQUE (account_id, idempotency_key),
  FOREIGN KEY (account_id, procedure_id, procedure_version)
    REFERENCES agent_tool_procedures(account_id, procedure_id, version)
);

CREATE INDEX agent_tool_leases_account_status_expires_idx
  ON agent_tool_leases (account_id, status, expires_at);

CREATE INDEX agent_tool_leases_account_board_status_idx
  ON agent_tool_leases (account_id, board_id, status, updated_at DESC)
  WHERE board_id IS NOT NULL;
```

Vector context lives in the semantic memory plane and is referenced by deterministic
digests:

```sql
CREATE TABLE agent_tool_lease_context_refs (
  account_id BIGINT NOT NULL,
  lease_id UUID NOT NULL,
  context_ref_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('BOARD_ITEM', 'DOC', 'PROCEDURE', 'MEMORY')),
  source_id TEXT NOT NULL,
  embedding_model TEXT,
  embedding_digest_sha256 CHAR(64),
  retrieval_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, lease_id, context_ref_id),
  FOREIGN KEY (account_id, lease_id)
    REFERENCES agent_tool_leases(account_id, lease_id)
);

CREATE INDEX agent_tool_context_account_source_idx
  ON agent_tool_lease_context_refs (account_id, source_type, source_id);
```

## GraphQL Open API shape

```graphql
type AgentToolProcedure {
  accountId: ID!
  procedureId: ID!
  version: Int!
  name: String!
  description: String!
  instructionMarkdown: String!
  allowedToolNames: [String!]!
  requiredScopes: [String!]!
  maxRecursionDepth: Int!
  maxEstimatedCostUnits: Int!
  maxVectorTopK: Int!
  maxRowsRead: Int!
  timeoutMs: Int!
  metadataTags: [String!]!
}

type AgentToolLease {
  accountId: ID!
  leaseId: ID!
  procedureId: ID!
  procedureVersion: Int!
  boardId: ID
  status: String!
  requestedToolNames: [String!]!
  recursionDepth: Int!
  estimatedCostUnits: Int!
  vectorTopK: Int!
  rowReadLimit: Int!
  expiresAt: String!
  inputDigestSha256: String!
  planDigestSha256: String!
  auditChainSha256: String!
}

input CreateAgentToolLeaseInput {
  procedureId: ID!
  procedureVersion: Int!
  boardId: ID
  idempotencyKey: String!
  requestedToolNames: [String!]!
  recursionDepth: Int!
  estimatedCostUnits: Int!
  vectorTopK: Int!
  rowReadLimit: Int!
  expiresAt: String!
  inputDigestSha256: String!
  planDigestSha256: String!
}

extend type Mutation {
  createAgentToolLease(input: CreateAgentToolLeaseInput!): AgentToolLease!
  cancelAgentToolLease(leaseId: ID!, reason: String!): AgentToolLease!
}

extend type Query {
  agentToolLease(leaseId: ID!): AgentToolLease
  agentToolLeases(boardId: ID, status: String, limit: Int = 50): [AgentToolLease!]!
  agentToolProcedures(metadataTags: [String!], limit: Int = 50): [AgentToolProcedure!]!
}
```

The API resolver must derive `account_id` from the authenticated monday.com context,
not from client input.

## Execution flow

1. Agent retrieves candidate procedures by `account_id` and metadata tags.
2. Agent proposes a concrete tool plan and computes stable input and plan digests.
3. mondayDB validates procedure version, scopes, recursion depth, cost, `topK`, and row
   limits inside a single transaction.
4. mondayDB creates a lease with `READY` or `PENDING_APPROVAL` status.
5. Worker claims the lease by `(account_id, lease_id)` and moves it to `RUNNING`.
6. Every read path receives the lease limits as hard query parameters.
7. Every write path records audit events and updates the lease terminal status.

## Performance check

Queries on boards with 1M+ rows must not scan arbitrary JSON or unbounded item sets.
Reject or rewrite plans that contain:

- missing `account_id` predicate;
- missing `board_id` predicate for board-local operations;
- vector search without `account_id` partitioning or HNSW filter;
- `topK > max_vector_top_k`;
- row reads above `row_read_limit`;
- recursive tool calls above `max_recursion_depth`;
- filter predicates that cannot use row-store primary keys, columnar projections, or a
  maintained secondary index.

For semantic retrieval, use an index shape equivalent to:

```sql
CREATE INDEX agent_memory_embedding_hnsw_idx
  ON agent_semantic_memories
  USING hnsw (embedding vector_cosine_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX agent_memory_account_kind_idx
  ON agent_semantic_memories (account_id, memory_kind, updated_at DESC)
  WHERE deleted_at IS NULL;
```

The query planner must apply the `account_id` and memory-kind filters before accepting
the vector candidate set. If the planner cannot prove tenant filtering, fail closed.

## Auditability

Each status transition appends an audit event:

```ts
export interface AgentToolLeaseAuditEvent {
  accountId: string;
  leaseId: string;
  sequence: number;
  fromStatus?: AgentToolLeaseStatus;
  toStatus: AgentToolLeaseStatus;
  actorId: string;
  reason?: string;
  inputDigestSha256: string;
  planDigestSha256: string;
  previousEventSha256?: string;
  eventSha256: string;
  createdAt: string;
}
```

The `eventSha256` is computed from a canonical JSON payload. This gives enterprise
customers a deterministic trace without storing raw prompts or sensitive context in the
hot lease table.

## How an agent perceives this data

An LLM sees procedures as tagged capabilities:

```json
{
  "capability": "update_items_from_policy",
  "tags": ["board-items", "policy-enforcement", "write-guarded"],
  "allowedTools": ["items.query", "items.update"],
  "limits": {
    "maxRecursionDepth": 2,
    "maxVectorTopK": 25,
    "maxRowsRead": 5000,
    "timeoutMs": 5000
  },
  "requiresLease": true,
  "auditDigestRequired": true
}
```

This is agent-ready but not magical: the model can rank capabilities semantically, while
mondayDB enforces the deterministic lease contract.

## Rollout guardrails

- Start read-only for procedure-backed tools, then enable writes per tool family.
- Require explicit `required_scopes` for each procedure version.
- Default new procedures to low `max_rows_read` and small `max_vector_top_k`.
- Alert on `BUDGET_EXHAUSTED`, repeated idempotency collisions, and cancelled running
  leases.
- Keep all lease and audit queries prefix-indexed by `account_id`.
