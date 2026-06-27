# mondayDB Agentic Runtime Contract Plane

## Why this matters before how it works

mondayDB can become an agentic database without making the storage engine
probabilistic. The product trade-off is to give agents richer context and tool
affordances while preserving the deterministic guarantees enterprise customers
expect: ACID writes, tenant isolation, replayable audits, and predictable query
cost. The runtime contract plane is the boundary between those goals.

An agent should not directly "discover" what it may read, retrieve, aggregate,
or mutate by exploring production data. Instead, mondayDB should issue a
tenant-scoped runtime contract that describes the allowed data surfaces, memory
references, semantic retrieval limits, tool budgets, freshness requirements, and
audit obligations for one agent session or workflow step. The agent can reason
over this packet, but mondayDB remains the deterministic authority that admits,
rejects, or degrades work.

## Product position

The runtime contract plane turns mondayDB into an agent-ready WorkOS data layer:

- **Procedural memory:** Agents receive explicit operating instructions,
  approval requirements, retry policies, and allowed tool sequences.
- **Semantic retrieval:** Agents receive bounded vector search routes that are
  compatible with account-partitioned pgvector/HNSW indexes.
- **Tool-use readiness:** Agents receive typed tool affordances with deterministic
  budgets, idempotency keys, and replayable audit hashes.
- **Enterprise predictability:** Every contract is scoped by `account_id`,
  generated from deterministic policy inputs, and invalidated by source
  watermarks rather than hidden AI judgement.

The core database continues to optimize row writes, columnar analytics, and
vector search separately. The contract plane composes those capabilities into a
safe context envelope for autonomous systems.

## Runtime lifecycle

1. **Request:** The Open API receives an agent runtime request containing
   `account_id`, actor identity, purpose, target boards, and desired operations.
2. **Compile:** mondayDB deterministically compiles policies, board metadata,
   schema contracts, freshness envelopes, workload budgets, and memory refs into
   a runtime contract.
3. **Admit:** The planner estimates row, columnar, vector, and tool costs. It
   returns `ADMIT`, `DEGRADE`, `QUEUE`, or `REJECT`.
4. **Execute:** The agent calls only operations covered by the active contract.
   Each operation consumes budget ledger entries and emits audit events.
5. **Refresh or close:** Source watermarks, policy changes, budget exhaustion, or
   loop-containment signals force a refresh, downgrade, or closure.

## TypeScript contracts

```ts
export type AgenticRuntimeDecision = "ADMIT" | "DEGRADE" | "QUEUE" | "REJECT";

export type AgenticRuntimeOperation =
  | "ROW_READ"
  | "ROW_WRITE"
  | "COLUMNAR_AGGREGATE"
  | "VECTOR_RETRIEVE"
  | "TOOL_EXECUTE";

export interface AgenticRuntimeContract {
  contract_id: string;
  account_id: string;
  actor_id: string;
  agent_id: string;
  purpose_id: string;
  decision: AgenticRuntimeDecision;
  allowed_operations: AgenticRuntimeOperation[];
  board_scope: AgenticBoardScope[];
  memory_scope: AgenticMemoryScope;
  semantic_scope: AgenticSemanticScope;
  tool_scope: AgenticToolScope[];
  budget: AgenticRuntimeBudget;
  freshness: AgenticFreshnessEnvelope;
  guardrails: AgenticRuntimeGuardrails;
  audit: AgenticRuntimeAudit;
  expires_at: string;
  created_at: string;
}

export interface AgenticBoardScope {
  board_id: string;
  view_ids: string[];
  permitted_column_ids: string[];
  row_filter_ast_hash: string;
  max_rows_per_page: number;
  max_aggregation_groups: number;
}

export interface AgenticMemoryScope {
  procedural_memory_ids: string[];
  long_term_memory_capsule_ids: string[];
  required_instruction_hashes: string[];
  disallowed_instruction_hashes: string[];
}

export interface AgenticSemanticScope {
  vector_index_ids: string[];
  embedding_model_id: string;
  max_top_k: number;
  min_score: number;
  hnsw_ef_search_cap: number;
  metadata_filters: {
    account_id: string;
    board_ids: string[];
    visibility: "PRIVATE" | "TEAM" | "ACCOUNT";
  };
}

export interface AgenticToolScope {
  tool_id: string;
  tool_version: string;
  allowed_intents: string[];
  idempotency_namespace: string;
  max_calls: number;
  requires_human_approval: boolean;
}

export interface AgenticRuntimeBudget {
  max_vector_queries: number;
  max_columnar_scanned_rows: bigint;
  max_row_reads: bigint;
  max_row_writes: bigint;
  max_tool_calls: number;
  max_runtime_ms: number;
  max_neighbor_impact_score: number;
}

export interface AgenticFreshnessEnvelope {
  row_watermark: string;
  columnar_watermark: string;
  vector_watermark: string;
  policy_watermark: string;
  max_staleness_ms: number;
}

export interface AgenticRuntimeGuardrails {
  max_recursion_depth: number;
  max_plan_steps: number;
  require_account_id_predicate: true;
  reject_unbounded_json_filters: true;
  reject_vector_without_metadata_filter: true;
  degrade_on_slo_pressure: true;
}

export interface AgenticRuntimeAudit {
  request_hash: string;
  compiled_policy_hash: string;
  contract_hash: string;
  previous_audit_hash: string | null;
  audit_event_id: string;
}
```

## SQL schema

The runtime contract tables are append-only except for deterministic status
transitions. Every table includes `account_id`, and every operational index is
prefixed by `account_id` to prevent accidental cross-tenant access.

```sql
CREATE TABLE agentic_runtime_contracts (
  account_id BIGINT NOT NULL,
  contract_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  purpose_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ADMIT', 'DEGRADE', 'QUEUE', 'REJECT')),
  allowed_operations TEXT[] NOT NULL,
  contract_json JSONB NOT NULL,
  request_hash BYTEA NOT NULL,
  compiled_policy_hash BYTEA NOT NULL,
  contract_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DEGRADED', 'CLOSED', 'EXPIRED', 'REJECTED')),
  row_watermark TEXT NOT NULL,
  columnar_watermark TEXT NOT NULL,
  vector_watermark TEXT NOT NULL,
  policy_watermark TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, contract_id)
);

CREATE INDEX agentic_runtime_contracts_active_idx
  ON agentic_runtime_contracts (account_id, actor_id, status, expires_at)
  WHERE status IN ('ACTIVE', 'DEGRADED');

CREATE TABLE agentic_runtime_budget_ledger (
  account_id BIGINT NOT NULL,
  contract_id UUID NOT NULL,
  ledger_seq BIGINT NOT NULL,
  operation TEXT NOT NULL,
  requested_units BIGINT NOT NULL,
  admitted_units BIGINT NOT NULL,
  consumed_units BIGINT NOT NULL DEFAULT 0,
  neighbor_impact_score NUMERIC(10, 4) NOT NULL,
  idempotency_key TEXT NOT NULL,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, contract_id, ledger_seq),
  UNIQUE (account_id, contract_id, idempotency_key)
);

CREATE TABLE agentic_runtime_semantic_routes (
  account_id BIGINT NOT NULL,
  contract_id UUID NOT NULL,
  vector_index_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  embedding_model_id TEXT NOT NULL,
  max_top_k INT NOT NULL CHECK (max_top_k BETWEEN 1 AND 200),
  min_score NUMERIC(6, 5) NOT NULL,
  hnsw_ef_search_cap INT NOT NULL CHECK (hnsw_ef_search_cap BETWEEN 8 AND 512),
  metadata_filter_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, contract_id, vector_index_id, board_id)
);

CREATE INDEX agentic_runtime_semantic_routes_board_idx
  ON agentic_runtime_semantic_routes (account_id, board_id, vector_index_id);

CREATE TABLE agentic_runtime_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  contract_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  deterministic_input_hash BYTEA NOT NULL,
  deterministic_output_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agentic_runtime_audit_contract_idx
  ON agentic_runtime_audit_events (account_id, contract_id, created_at);
```

## pgvector/HNSW compatibility

Runtime contracts do not store high-cardinality embedding payloads inside the
contract row. They point to account-partitioned vector indexes and deterministic
metadata filters:

```sql
-- Representative vector table shape.
CREATE TABLE agentic_memory_embeddings (
  account_id BIGINT NOT NULL,
  embedding_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  embedding_model_id TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL,
  source_watermark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id)
);

CREATE INDEX agentic_memory_embeddings_hnsw_idx
  ON agentic_memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX agentic_memory_embeddings_metadata_idx
  ON agentic_memory_embeddings (account_id, board_id, embedding_model_id);
```

Planner rule: vector retrieval is valid only when the runtime contract supplies
`account_id`, bounded `board_id` filters, `max_top_k`, and an `ef_search` cap.
If the request omits those filters, the deterministic decision is `REJECT`, not
best-effort search.

## Open API GraphQL surface

All functionality must be available through monday.com's Open API. The GraphQL
surface should expose the contract packet and keep execution deterministic.

```graphql
enum AgenticRuntimeDecision {
  ADMIT
  DEGRADE
  QUEUE
  REJECT
}

enum AgenticRuntimeOperation {
  ROW_READ
  ROW_WRITE
  COLUMNAR_AGGREGATE
  VECTOR_RETRIEVE
  TOOL_EXECUTE
}

input AgenticRuntimeRequestInput {
  accountId: ID!
  actorId: ID!
  agentId: String!
  purposeId: ID!
  boardIds: [ID!]!
  requestedOperations: [AgenticRuntimeOperation!]!
  desiredFreshnessMs: Int!
  idempotencyKey: String!
}

type AgenticRuntimeContract {
  contractId: ID!
  accountId: ID!
  decision: AgenticRuntimeDecision!
  allowedOperations: [AgenticRuntimeOperation!]!
  expiresAt: String!
  contractHash: String!
  guardrails: AgenticRuntimeGuardrails!
  semanticScope: AgenticSemanticScope!
  budget: AgenticRuntimeBudget!
}

type Mutation {
  compileAgenticRuntimeContract(input: AgenticRuntimeRequestInput!): AgenticRuntimeContract!
  closeAgenticRuntimeContract(accountId: ID!, contractId: ID!, idempotencyKey: String!): Boolean!
}

type Query {
  agenticRuntimeContract(accountId: ID!, contractId: ID!): AgenticRuntimeContract
}
```

## Performance checks for boards with 1M+ rows

The planner must reject or degrade any runtime contract that would cause a
full table scan or uncontrolled neighbor impact.

- **Row path:** Require `account_id` plus board/view predicates before reading
  item rows. Reject unbounded JSON predicates unless backed by a compiled schema
  contract or materialized index.
- **Columnar path:** Require partition pruning by `account_id`, `board_id`, and
  time or column families before aggregate admission. Cap
  `max_columnar_scanned_rows` in the budget ledger.
- **Vector path:** Require account-scoped metadata filters, bounded `topK`, and
  an `ef_search` cap. Never run semantic search across account partitions.
- **Tool path:** Charge tool calls against the same contract budget. Recursive
  tool invocation is rejected when `max_recursion_depth` would be exceeded.
- **Hybrid path:** Estimate each sub-plan separately. Admit only if the combined
  neighbor-impact score remains within the tenant and cell-level SLO envelope.

Any plan that cannot produce deterministic cost estimates should return
`QUEUE` for offline precomputation or `REJECT` with an explainable reason.

## Agent perception model

An LLM should perceive the runtime contract as a constrained capability card,
not as raw database internals. Suggested metadata exposed to agents:

```ts
export interface AgenticPerceptionCard {
  account_id: string;
  contract_id: string;
  purpose_label: string;
  readable_boards: Array<{
    board_id: string;
    semantic_tags: string[];
    freshness_label: "LIVE" | "NEARLINE" | "STALE_ALLOWED";
  }>;
  instructions: Array<{
    procedural_memory_id: string;
    title: string;
    summary: string;
    required: boolean;
  }>;
  retrieval_affordances: Array<{
    route_label: string;
    max_top_k: number;
    metadata_tags: string[];
    expected_latency_ms: number;
  }>;
  forbidden_actions: string[];
  audit_notice: string;
}
```

This keeps agent prompts compact while preserving deterministic enforcement in
the database layer.

## Guardrail examples

- A contract that allows `VECTOR_RETRIEVE` but lacks an account-bound metadata
  filter is rejected.
- A contract that asks for live row reads and stale vector retrieval can be
  degraded to row-only if vector indexes lag beyond `max_staleness_ms`.
- A contract that repeatedly alternates vector search and tool execution with
  similar semantic fingerprints is closed by loop containment.
- A contract that requests a board-wide aggregation on 1M+ rows without a
  columnar partition predicate is queued for precomputation or rejected.

## Rollout guidance

1. Start with read-only contracts for semantic retrieval and columnar summaries.
2. Add tool execution contracts with strict idempotency and approval flags.
3. Add row-write contracts only after plan verification and transaction-intent
   envelopes can prove ACID-safe prepare and commit behavior.
4. Use audit replay before broad enablement: the same request, policy watermarks,
   and source watermarks must reproduce the same contract hash and decision.

This sequencing lets mondayDB ship agentic capabilities while protecting the
99.99% availability and low-latency expectations of the existing WorkOS engine.
