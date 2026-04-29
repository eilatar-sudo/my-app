# mondayDB Agentic Tool Execution Ledger

## Why this matters

Agentic mondayDB needs tool-use readiness without turning the database engine
into an autonomous actor. Product trade-off: agents need fast, contextual
actions across boards, automations, docs, and integrations, while enterprise
customers need deterministic writes, replayable audits, tenant isolation, and
predictable resource use.

The tool execution ledger makes every agent-initiated action explicit before it
touches row storage. mondayDB stores the intended tool call, scope, guardrail
decision, cost budget, idempotency key, and resulting mutation hashes as
ordinary deterministic records. Agents can perceive tools and instructions, but
the engine only executes approved, account-scoped plans.

## Design goals

- **Procedural memory:** Bind reusable instructions to approved tool contracts
  and activation rules.
- **Semantic retrieval:** Allow tools to request RAG context from
  pgvector/HNSW-compatible memory indexes without bypassing planner limits.
- **Agentic guardrails:** Cap recursive retrieval, fan-out, mutation count,
  columnar reads, and tool-call chains before execution.
- **Enterprise stability:** Keep ACID board mutations in the row layer and emit
  append-only audit rows for every plan, approval, execution, and rollback.
- **API first:** Expose contracts and executions through monday.com Open API
  GraphQL, deriving `account_id` from auth context.

## Core schema

Tool calls are split into immutable contracts, deterministic execution requests,
and append-only audit events. Every primary key and lookup starts with
`account_id`.

```sql
CREATE TYPE agent_tool_risk_level AS ENUM (
  'read_only',
  'single_item_write',
  'bulk_write',
  'external_side_effect'
);

CREATE TYPE agent_tool_execution_status AS ENUM (
  'planned',
  'approved',
  'rejected',
  'executing',
  'succeeded',
  'failed',
  'rolled_back'
);

CREATE TABLE agent_tool_contracts (
  account_id BIGINT NOT NULL,
  tool_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  risk_level agent_tool_risk_level NOT NULL,
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  activation_rules JSONB NOT NULL DEFAULT '{}',
  required_scopes TEXT[] NOT NULL DEFAULT '{}',
  max_row_reads BIGINT NOT NULL,
  max_row_writes BIGINT NOT NULL,
  max_vector_top_k INTEGER NOT NULL DEFAULT 20,
  max_recursive_depth INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_actor_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, tool_id, version),
  UNIQUE (account_id, tool_name, version)
);

CREATE INDEX agent_tool_contracts_lookup_idx
  ON agent_tool_contracts (account_id, tool_name, enabled, updated_at DESC);

CREATE TABLE agent_tool_execution_requests (
  account_id BIGINT NOT NULL,
  execution_id UUID NOT NULL,
  tool_id UUID NOT NULL,
  tool_version INTEGER NOT NULL,
  actor_id BIGINT NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  idempotency_key TEXT NOT NULL,
  normalized_input_hash BYTEA NOT NULL,
  normalized_plan_hash BYTEA NOT NULL,
  semantic_context_ids UUID[] NOT NULL DEFAULT '{}',
  status agent_tool_execution_status NOT NULL,
  guardrail_reason TEXT NOT NULL,
  estimated_row_reads BIGINT NOT NULL,
  estimated_row_writes BIGINT NOT NULL,
  estimated_vector_probes BIGINT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, execution_id),
  UNIQUE (account_id, idempotency_key),
  FOREIGN KEY (account_id, tool_id, tool_version)
    REFERENCES agent_tool_contracts (account_id, tool_id, version)
);

CREATE INDEX agent_tool_execution_board_idx
  ON agent_tool_execution_requests
  (account_id, board_id, status, requested_at DESC)
  WHERE board_id IS NOT NULL;

CREATE INDEX agent_tool_execution_actor_idx
  ON agent_tool_execution_requests
  (account_id, actor_id, requested_at DESC);

CREATE TABLE agent_tool_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'contract_created',
    'execution_planned',
    'execution_approved',
    'execution_rejected',
    'execution_started',
    'execution_succeeded',
    'execution_failed',
    'execution_rolled_back'
  )),
  deterministic_hash BYTEA NOT NULL,
  before_state_hash BYTEA,
  after_state_hash BYTEA,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agent_tool_audit_execution_idx
  ON agent_tool_audit_events (account_id, execution_id, created_at);
```

## TypeScript contract

```ts
export type AgentToolRiskLevel =
  | "read_only"
  | "single_item_write"
  | "bulk_write"
  | "external_side_effect";

export type AgentToolExecutionStatus =
  | "planned"
  | "approved"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed"
  | "rolled_back";

export interface AgentToolContract {
  accountId: string;
  toolId: string;
  toolName: string;
  version: number;
  riskLevel: AgentToolRiskLevel;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  activationRules: {
    boardKinds?: string[];
    memoryTags?: string[];
    requiredActorRoles?: string[];
    allowedAutomationIds?: string[];
  };
  requiredScopes: string[];
  budgets: {
    maxRowReads: number;
    maxRowWrites: number;
    maxVectorTopK: number;
    maxRecursiveDepth: number;
    timeoutMs: number;
  };
  enabled: boolean;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolExecutionRequest {
  accountId: string;
  executionId: string;
  toolId: string;
  toolVersion: number;
  actorId: string;
  boardId?: string;
  itemId?: string;
  idempotencyKey: string;
  normalizedInputHash: string;
  normalizedPlanHash: string;
  semanticContextIds: string[];
  status: AgentToolExecutionStatus;
  guardrailReason: string;
  estimates: {
    rowReads: number;
    rowWrites: number;
    vectorProbes: number;
    columnarPartitions: number;
  };
  requestedAt: string;
  completedAt?: string;
}
```

## Open API GraphQL shape

`account_id` and `actor_id` must come from the authenticated monday.com
session. Client input can reference boards, items, tools, and idempotency keys,
but it cannot choose tenant scope.

```graphql
enum AgentToolRiskLevel {
  READ_ONLY
  SINGLE_ITEM_WRITE
  BULK_WRITE
  EXTERNAL_SIDE_EFFECT
}

enum AgentToolExecutionStatus {
  PLANNED
  APPROVED
  REJECTED
  EXECUTING
  SUCCEEDED
  FAILED
  ROLLED_BACK
}

type AgentToolContract {
  id: ID!
  name: String!
  version: Int!
  riskLevel: AgentToolRiskLevel!
  inputSchema: JSON!
  outputSchema: JSON!
  activationRules: JSON!
  requiredScopes: [String!]!
  enabled: Boolean!
  updatedAt: ISO8601DateTime!
}

type AgentToolExecution {
  id: ID!
  tool: AgentToolContract!
  boardId: ID
  itemId: ID
  status: AgentToolExecutionStatus!
  guardrailReason: String!
  normalizedPlanHash: String!
  semanticContextIds: [ID!]!
  requestedAt: ISO8601DateTime!
  completedAt: ISO8601DateTime
}

input AgentToolExecutionInput {
  toolName: String!
  toolVersion: Int!
  boardId: ID
  itemId: ID
  idempotencyKey: String!
  input: JSON!
  semanticMemoryIds: [ID!] = []
}

extend type Query {
  agentToolContracts(boardId: ID, enabled: Boolean = true): [AgentToolContract!]!
  agentToolExecution(id: ID!): AgentToolExecution
}

extend type Mutation {
  planAgentToolExecution(input: AgentToolExecutionInput!): AgentToolExecution!
  executeAgentToolExecution(id: ID!): AgentToolExecution!
}
```

## Execution flow

1. Resolve `account_id`, `actor_id`, permissions, and board scope from auth.
2. Load the active tool contract by `(account_id, tool_name, version)`.
3. Validate input against the stored JSON schema and produce a canonical input
   hash.
4. Retrieve semantic memory only through an approved account-scoped retrieval
   plan. Persist selected memory IDs in `semantic_context_ids`.
5. Build a normalized deterministic plan that lists row reads, row writes,
   vector probes, columnar partitions, tool depth, and timeout.
6. Reject or degrade plans that exceed the contract budget or tenant budget.
7. Insert an `agent_tool_execution_requests` row with status `planned`,
   `approved`, or `rejected`.
8. Execute only approved plans with the same idempotency key and plan hash.
9. Commit row-layer mutations atomically, then append audit events with before
   and after hashes.

## Guardrail policy

| Risk | Guardrail | Default |
| --- | --- | ---: |
| Recursive tool chains | `max_recursive_depth` hard cap | 1 |
| Broad semantic prefetch | `max_vector_top_k` and vector probe cap | 20 |
| Bulk mutation blast radius | `max_row_writes` per contract | 1 for default tools |
| Noisy-neighbor analytics | Columnar partition estimate before execution | tenant-tier based |
| Duplicate side effects | Required `(account_id, idempotency_key)` uniqueness | mandatory |
| Cross-tenant leakage | Server-derived `account_id` on every lookup | mandatory |
| Hidden AI behavior | Persist plan hash and selected memory IDs | mandatory |

## Performance check

Reject these patterns for boards with 1M+ rows:

- Tool planning without `account_id` and a finite board, item, workspace, or
  indexed time-window scope.
- Semantic memory expansion where HNSW results are post-filtered by tenant
  instead of searched inside tenant partitions or tenant hash shards.
- JSON input filters that map to raw board columns without generated columns,
  B-tree indexes, or precomputed columnar projections.
- Bulk write tools that calculate target rows by scanning all board items.
- Tool chains where one execution can enqueue unbounded follow-up executions.
- Audit lookup by `execution_id` without the `(account_id, execution_id)` key.

Preferred planning query shape:

```sql
WITH contract AS (
  SELECT *
  FROM agent_tool_contracts
  WHERE account_id = $1
    AND tool_name = $2
    AND version = $3
    AND enabled = true
),
scoped_item AS (
  SELECT item_id
  FROM board_items
  WHERE account_id = $1
    AND board_id = $4
    AND item_id = $5
)
INSERT INTO agent_tool_execution_requests (
  account_id,
  execution_id,
  tool_id,
  tool_version,
  actor_id,
  board_id,
  item_id,
  idempotency_key,
  normalized_input_hash,
  normalized_plan_hash,
  semantic_context_ids,
  status,
  guardrail_reason,
  estimated_row_reads,
  estimated_row_writes,
  estimated_vector_probes
)
SELECT
  $1,
  $6,
  c.tool_id,
  c.version,
  $7,
  $4,
  s.item_id,
  $8,
  $9,
  $10,
  $11,
  CASE WHEN c.max_row_writes >= $12 THEN 'approved' ELSE 'rejected' END,
  CASE WHEN c.max_row_writes >= $12 THEN 'within_budget' ELSE 'row_write_budget_exceeded' END,
  $13,
  $12,
  $14
FROM contract c
JOIN scoped_item s ON true;
```

This shape fails closed if the item is outside the authenticated account and
board scope.

## Agent perception model

Agents should perceive a tool contract as bounded capability, not permission to
generate arbitrary queries:

```json
{
  "tool_name": "create_update",
  "risk_level": "single_item_write",
  "activation_rules": {
    "memoryTags": ["approved-playbook", "customer-escalation"]
  },
  "budgets": {
    "maxRowReads": 25,
    "maxRowWrites": 1,
    "maxVectorTopK": 10,
    "maxRecursiveDepth": 1
  },
  "required_trace": [
    "idempotency_key",
    "normalized_plan_hash",
    "semantic_context_ids"
  ]
}
```

Metadata tags tell the LLM which procedural memories justify the tool. The
execution ledger tells mondayDB what was actually approved and executed. This
keeps the probabilistic reasoning layer useful while the database remains
deterministic, auditable, and tenant-safe.
