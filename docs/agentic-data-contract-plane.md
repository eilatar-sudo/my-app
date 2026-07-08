# mondayDB Agentic Data Contract Plane

## Why: stable agent perception without probabilistic database behavior

mondayDB can become the premier agentic database by exposing deterministic data
contracts that agents can read before they query, plan, or call tools. The
trade-off is latency versus consistency: agents need low-latency context to feel
"blink-of-an-eye," but enterprise users need repeatable decisions, ACID writes,
and strict tenant isolation. The Agentic Data Contract Plane resolves this by
making every agent-facing board, view, memory, vector route, and tool affordance
publish a versioned contract that is scoped by `account_id`, hash-audited, and
checked by the planner before execution.

The database engine remains deterministic. LLMs can interpret contract metadata,
but mondayDB only admits work through explicit budgets, source watermarks,
compiled filters, and replayable audit hashes.

## Product principles

1. **Procedural memory as a contract, not a prompt.** Store approved operating
   steps, required filters, and escalation rules as versioned records that the
   planner can enforce.
2. **Semantic retrieval as a bounded route.** Vector search is allowed only
   through tenant-partitioned HNSW indexes with explicit `top_k`, freshness, and
   cost ceilings.
3. **Guardrails before execution.** Recursive agent loops, broad aggregations,
   and tool calls are preflighted against deterministic query budgets.
4. **API-first availability.** Contracts are available through the monday.com
   Open API GraphQL surface so external agents never need private database
   access.

## TypeScript contracts

```ts
export type ContractSurface = "row" | "columnar" | "vector" | "tool" | "hybrid";

export interface AgenticDataContract {
  account_id: string;
  contract_id: string;
  board_id: string;
  version: number;
  status: "draft" | "active" | "retired";
  surfaces: ContractSurface[];
  purpose: string;
  deterministic_filters: DeterministicFilter[];
  procedural_memory_refs: ProceduralMemoryRef[];
  semantic_routes: SemanticRoute[];
  tool_affordances: ToolAffordance[];
  budget_policy: ContractBudgetPolicy;
  source_watermark: SourceWatermark;
  perception_card: AgentPerceptionCard;
  audit: ContractAuditEnvelope;
  created_at: string;
  updated_at: string;
}

export interface DeterministicFilter {
  field_id: string;
  operator: "eq" | "in" | "range" | "exists";
  required: boolean;
  value_shape: "scalar" | "array" | "timestamp_range" | "account_scoped_ref";
  row_index_hint?: string;
  columnar_index_hint?: string;
}

export interface ProceduralMemoryRef {
  memory_id: string;
  version: number;
  instruction_type: "retrieve" | "summarize" | "write" | "escalate";
  required_before_surfaces: ContractSurface[];
  audit_hash: string;
}

export interface SemanticRoute {
  route_id: string;
  embedding_space: "board_item_v1" | "doc_block_v1" | "procedure_v1";
  hnsw_partition_key: "account_id" | "account_id_board_id";
  max_top_k: number;
  max_vector_distance?: number;
  freshness_watermark: string;
  metadata_filters: Array<"account_id" | "board_id" | "contract_id" | "visibility">;
}

export interface ToolAffordance {
  tool_name: string;
  allowed_operations: Array<"read" | "write" | "notify" | "handoff">;
  requires_human_review: boolean;
  idempotency_key_fields: string[];
  max_calls_per_plan: number;
}

export interface ContractBudgetPolicy {
  max_estimated_rows: number;
  max_columnar_bytes: number;
  max_vector_candidates: number;
  max_recursive_depth: number;
  timeout_ms: number;
  neighbor_impact_class: "low" | "medium" | "high";
}

export interface SourceWatermark {
  row_lsn: string;
  columnar_snapshot_id: string;
  vector_index_epoch: string;
  procedural_memory_epoch: string;
}

export interface AgentPerceptionCard {
  title: string;
  description: string;
  tags: string[];
  visible_fields: string[];
  hidden_fields: string[];
  safe_actions: string[];
  escalation_triggers: string[];
}

export interface ContractAuditEnvelope {
  created_by: string;
  request_hash: string;
  contract_hash: string;
  previous_contract_hash?: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_data_contracts (
  account_id BIGINT NOT NULL,
  contract_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  surfaces TEXT[] NOT NULL,
  purpose TEXT NOT NULL,
  deterministic_filters JSONB NOT NULL,
  procedural_memory_refs JSONB NOT NULL,
  semantic_routes JSONB NOT NULL,
  tool_affordances JSONB NOT NULL,
  budget_policy JSONB NOT NULL,
  source_watermark JSONB NOT NULL,
  perception_card JSONB NOT NULL,
  request_hash BYTEA NOT NULL,
  contract_hash BYTEA NOT NULL,
  previous_contract_hash BYTEA,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, contract_id, version)
);

CREATE INDEX agentic_data_contracts_active_board_idx
  ON agentic_data_contracts (account_id, board_id, status, version DESC)
  WHERE status = 'active';

CREATE TABLE agentic_data_contract_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  contract_id UUID NOT NULL,
  contract_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('created', 'activated', 'retired', 'admitted', 'rejected')
  ),
  planner_decision JSONB NOT NULL,
  request_hash BYTEA NOT NULL,
  previous_event_hash BYTEA,
  event_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_data_contract_audit_contract_idx
  ON agentic_data_contract_audit_events
  (account_id, contract_id, contract_version, created_at DESC);

CREATE TABLE agentic_contract_embeddings (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  contract_id UUID NOT NULL,
  contract_version INTEGER NOT NULL,
  embedding_space TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, board_id, contract_id, contract_version, embedding_space)
);

CREATE INDEX agentic_contract_embeddings_hnsw_idx
  ON agentic_contract_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The HNSW index must be deployed with physical or logical partitioning by
`account_id` or `(account_id, board_id)`. The raw HNSW access path is never
called without the tenant predicate because that would risk cross-tenant recall
and unpredictable neighbor impact.

## Open API GraphQL shape

```graphql
type AgenticDataContract {
  accountId: ID!
  contractId: ID!
  boardId: ID!
  version: Int!
  status: AgenticContractStatus!
  surfaces: [AgenticContractSurface!]!
  purpose: String!
  deterministicFilters: [AgenticDeterministicFilter!]!
  proceduralMemoryRefs: [AgenticProceduralMemoryRef!]!
  semanticRoutes: [AgenticSemanticRoute!]!
  toolAffordances: [AgenticToolAffordance!]!
  budgetPolicy: AgenticContractBudgetPolicy!
  sourceWatermark: AgenticSourceWatermark!
  perceptionCard: AgenticPerceptionCard!
  auditHash: String!
}

input AgenticContractPreflightInput {
  accountId: ID!
  boardId: ID!
  contractId: ID!
  version: Int!
  requestedSurfaces: [AgenticContractSurface!]!
  estimatedRows: BigInt!
  requestedTopK: Int
  requestedRecursiveDepth: Int
  purpose: String!
}

type AgenticContractPreflightDecision {
  admitted: Boolean!
  reason: String!
  cappedTopK: Int
  cappedRecursiveDepth: Int!
  requiredFilters: [String!]!
  sourceWatermark: AgenticSourceWatermark!
  auditHash: String!
}

extend type Query {
  agenticDataContract(accountId: ID!, boardId: ID!, contractId: ID!): AgenticDataContract
  agenticDataContracts(accountId: ID!, boardId: ID!, status: AgenticContractStatus): [AgenticDataContract!]!
}

extend type Mutation {
  preflightAgenticContract(input: AgenticContractPreflightInput!): AgenticContractPreflightDecision!
}
```

## Execution flow

1. Agent requests a contract through GraphQL with `accountId` and `boardId`.
2. Planner loads only active contracts via the composite tenant index.
3. Planner checks required deterministic filters, procedural memory versions,
   source watermarks, and budget policy.
4. Semantic routes compile into account-partitioned HNSW lookups with capped
   `top_k` and required metadata filters.
5. Accepted plans emit an `admitted` audit event; rejected plans emit a
   deterministic rejection reason and hash.
6. Row, columnar, vector, and tool execution layers receive only the compiled
   contract envelope, not free-form LLM instructions.

## Performance checks for 1M+ row boards

- Reject plans where `estimatedRows > budget_policy.max_estimated_rows` unless a
  required indexed filter is present; on 1M+ row boards this is treated as a
  full-scan risk, not a soft warning.
- Never evaluate JSONB filters as the first predicate on large boards; the first
  predicate must be `account_id` plus an indexed `board_id`, item id, group id,
  date range, or status shard.
- Cap vector `top_k` at the route-level `max_top_k`; large exploratory searches
  must page through saved working sets rather than broad HNSW probes.
- Route aggregations to the columnar layer only after validating snapshot
  freshness and byte estimates.
- Reject recursive planning where `requestedRecursiveDepth` exceeds the contract
  cap, and include prior step hashes in loop-containment checks.
- Avoid contract discovery queries that scan all boards in an account because
  they can become cross-board full-scan operations. Discovery should start from
  `(account_id, board_id, status)` or from a tenant-partitioned semantic route
  with metadata filters.

## Agent-ready perception

An LLM should perceive each contract as a card with:

- **What this board represents:** `perception_card.title` and `description`.
- **What is safe to inspect:** `visible_fields`, `semantic_routes`, and required
  deterministic filters.
- **What is safe to do:** `tool_affordances`, `safe_actions`, and human-review
  requirements.
- **When to stop:** `escalation_triggers`, recursive-depth caps, timeouts, and
  neighbor-impact class.
- **How fresh the answer is:** row, columnar, vector, and procedural memory
  watermarks.

This makes the agent's context explicit without allowing the agent to invent
database behavior.

## Auditability and isolation invariants

- Every primary key and secondary index starts with `account_id`.
- Every GraphQL entry point requires `accountId`.
- Every admitted or rejected plan writes a hash-chained audit event.
- Contract updates create a new version; active contracts are never mutated in
  place.
- Embeddings may include semantic summaries, tags, and field names, but never
  raw values hidden by visibility rules.
- Tool execution receives idempotency fields from the contract so retries remain
  deterministic.

## Rollout sequence

1. Start with read-only contracts for high-value boards and dashboards.
2. Add vector routes for semantic discovery once tenant partitioning and
   metadata filters are enforced.
3. Introduce tool affordances with human review and idempotency requirements.
4. Allow write-capable contracts only after audit replay and plan verification
   demonstrate deterministic behavior across row, columnar, vector, and tool
   paths.
