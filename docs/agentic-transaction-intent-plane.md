# Agentic Transaction Intent Plane

## Why before how

Autonomous agents need to move from "read and recommend" to "read, decide, and
change work." The product trade-off is latency vs. consistency: a useful agent
wants to commit board changes in the blink of an eye, while enterprise tenants
need ACID semantics, deterministic audit trails, and confidence that one
agent's loop cannot damage a neighbor's latency.

The transaction intent plane keeps mondayDB deterministic by separating
probabilistic planning from database writes. Agents submit explicit,
tenant-scoped write intents with bounded operations, preconditions, idempotency
keys, and procedure references. mondayDB verifies, reserves, and commits those
intents through deterministic storage paths; it never infers hidden AI behavior
inside the engine.

## Scope

- Accept agent-authored write proposals for items, columns, updates, and
  approved tool effects.
- Require every operation to be scoped by `account_id` and, for board data, by
  `board_id`.
- Preserve ACID writes in the row store while emitting deterministic events for
  columnar projections, vector indexes, semantic caches, and audit ledgers.
- Expose prepare, reserve, commit, cancel, and inspection flows through the
  monday.com Open API GraphQL surface.
- Prevent recursive or bulk agent writes from creating full scans or noisy
  neighbor effects.

## TypeScript contracts

```ts
export type AgenticIntentStatus =
  | "draft"
  | "prepared"
  | "reserved"
  | "committed"
  | "rejected"
  | "cancelled"
  | "expired";

export type AgenticWriteOperationKind =
  | "create_item"
  | "update_column_value"
  | "move_item"
  | "create_update"
  | "tool_effect";

export type AgenticConsistencyMode =
  | "serializable_transaction"
  | "optimistic_version"
  | "async_verified_batch";

export type AgenticIntentRiskClass = "low" | "medium" | "high" | "restricted";

export interface AgenticTransactionIntent {
  account_id: string;
  intent_id: string;
  actor_id: string;
  agent_id: string;
  board_id: string;
  procedure_id: string;
  idempotency_key: string;
  status: AgenticIntentStatus;
  consistency_mode: AgenticConsistencyMode;
  risk_class: AgenticIntentRiskClass;
  operation_count: number;
  item_ids: string[];
  semantic_context_refs: string[];
  expected_read_watermark: string;
  semantic_query_hash?: string;
  write_set_hash: string;
  precondition_hash: string;
  audit_hash: string;
  previous_audit_hash?: string;
  created_at: string;
  expires_at: string;
  committed_at?: string;
}

export interface AgenticIntentOperation {
  account_id: string;
  intent_id: string;
  operation_id: string;
  ordinal: number;
  operation_kind: AgenticWriteOperationKind;
  target_type: "board" | "item" | "column" | "update" | "external_tool";
  target_id: string;
  column_id?: string;
  payload_hash: string;
  redacted_payload_ref: string;
  requires_human_approval: boolean;
  metadata_tags: string[];
}

export interface AgenticIntentPrecondition {
  account_id: string;
  intent_id: string;
  precondition_id: string;
  target_type: "board" | "item" | "column" | "account_policy";
  target_id: string;
  expected_version?: string;
  predicate_hash: string;
  failure_mode: "reject" | "refresh_context" | "request_human_review";
}

export interface AgenticIntentCommitResult {
  account_id: string;
  intent_id: string;
  status: "committed" | "rejected" | "expired";
  committed_operation_count: number;
  emitted_event_ids: string[];
  row_store_txn_id?: string;
  audit_hash: string;
  rejection_reason?: string;
}
```

## SQL schema

Every primary key and secondary lookup starts with `account_id`. Board-facing
paths also include `board_id` so planners can prove tenant and board scope
before touching item or column rows.

```sql
CREATE TABLE agentic_transaction_intents (
  account_id              BIGINT NOT NULL,
  intent_id               UUID NOT NULL,
  actor_id                BIGINT NOT NULL,
  agent_id                UUID NOT NULL,
  board_id                BIGINT NOT NULL,
  procedure_id            UUID NOT NULL,
  idempotency_key         TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (
    status IN (
      'draft',
      'prepared',
      'reserved',
      'committed',
      'rejected',
      'cancelled',
      'expired'
    )
  ),
  consistency_mode        TEXT NOT NULL CHECK (
    consistency_mode IN (
      'serializable_transaction',
      'optimistic_version',
      'async_verified_batch'
    )
  ),
  risk_class              TEXT NOT NULL CHECK (
    risk_class IN ('low', 'medium', 'high', 'restricted')
  ),
  operation_count         INTEGER NOT NULL,
  item_ids                BIGINT[] NOT NULL,
  semantic_context_refs   UUID[] NOT NULL DEFAULT '{}',
  expected_read_watermark TEXT NOT NULL,
  semantic_query_hash     TEXT,
  write_set_hash          TEXT NOT NULL,
  precondition_hash       TEXT NOT NULL,
  previous_audit_hash     TEXT,
  audit_hash              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ NOT NULL,
  committed_at            TIMESTAMPTZ,
  PRIMARY KEY (account_id, intent_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX agentic_transaction_intents_board_status_idx
  ON agentic_transaction_intents (
    account_id,
    board_id,
    status,
    expires_at
  );

CREATE INDEX agentic_transaction_intents_actor_idx
  ON agentic_transaction_intents (
    account_id,
    actor_id,
    created_at DESC
  );

CREATE TABLE agentic_intent_operations (
  account_id              BIGINT NOT NULL,
  intent_id               UUID NOT NULL,
  operation_id            UUID NOT NULL,
  ordinal                 INTEGER NOT NULL,
  operation_kind          TEXT NOT NULL CHECK (
    operation_kind IN (
      'create_item',
      'update_column_value',
      'move_item',
      'create_update',
      'tool_effect'
    )
  ),
  target_type             TEXT NOT NULL CHECK (
    target_type IN ('board', 'item', 'column', 'update', 'external_tool')
  ),
  target_id               BIGINT,
  column_id               TEXT,
  payload_ref             TEXT NOT NULL,
  payload_hash            TEXT NOT NULL,
  requires_human_approval BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_tags           JSONB NOT NULL DEFAULT '[]',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, intent_id, operation_id),
  UNIQUE (account_id, intent_id, ordinal)
);

CREATE INDEX agentic_intent_operations_target_idx
  ON agentic_intent_operations (
    account_id,
    target_type,
    target_id,
    created_at DESC
  )
  WHERE target_id IS NOT NULL;

CREATE TABLE agentic_intent_preconditions (
  account_id        BIGINT NOT NULL,
  intent_id         UUID NOT NULL,
  precondition_id   UUID NOT NULL,
  target_type       TEXT NOT NULL CHECK (
    target_type IN ('board', 'item', 'column', 'account_policy')
  ),
  target_id         BIGINT NOT NULL,
  expected_version  TEXT,
  predicate_hash    TEXT NOT NULL,
  failure_mode      TEXT NOT NULL CHECK (
    failure_mode IN ('reject', 'refresh_context', 'request_human_review')
  ),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, intent_id, precondition_id)
);

CREATE INDEX agentic_intent_preconditions_target_idx
  ON agentic_intent_preconditions (
    account_id,
    target_type,
    target_id
  );

CREATE TABLE agentic_intent_commit_events (
  account_id          BIGINT NOT NULL,
  event_id            UUID NOT NULL,
  intent_id           UUID NOT NULL,
  row_store_txn_id    UUID,
  board_id            BIGINT NOT NULL,
  status              TEXT NOT NULL CHECK (
    status IN ('committed', 'rejected', 'expired')
  ),
  emitted_change_ids  UUID[] NOT NULL DEFAULT '{}',
  rejection_reason    TEXT,
  previous_audit_hash TEXT,
  audit_hash          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_intent_commit_events_intent_idx
  ON agentic_intent_commit_events (
    account_id,
    intent_id,
    created_at DESC
  );
```

## Vector and semantic retrieval compatibility

Transaction intents are operational records first, but their procedure and
outcome metadata should be retrievable by agents that need examples of safe
actions. The vector path stores embeddings for intent summaries, not raw write
payloads.

```sql
CREATE TABLE agentic_intent_embeddings (
  account_id       BIGINT NOT NULL,
  intent_id        UUID NOT NULL,
  board_id         BIGINT NOT NULL,
  procedure_id     UUID NOT NULL,
  risk_class       TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  embedding        VECTOR(1536) NOT NULL,
  metadata_tags    JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, intent_id)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_intent_embeddings_lookup_idx
  ON agentic_intent_embeddings (
    account_id,
    board_id,
    procedure_id,
    created_at DESC
  );

-- Create HNSW indexes per account hash partition so no tenant shares one
-- global graph with another tenant's semantic write history.
CREATE INDEX agentic_intent_embeddings_hnsw_idx
  ON agentic_intent_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Semantic retrieval must always pre-filter by `account_id` and, by default,
`board_id`. Results are bounded by a workload policy cap such as `topK <= 25`
for interactive agents and `topK <= 100` for offline review jobs. The agent sees
metadata tags such as `["intent:update_column_value", "risk:low",
"outcome:committed", "procedure:triage_sla"]` before it sees any redacted
summary.

## Open API GraphQL surface

The public API should make the deterministic lifecycle explicit. The server
derives the authenticated tenant and rejects any request whose `accountId` does
not match the session-scoped `account_id`.

```graphql
enum AgenticIntentStatus {
  DRAFT
  PREPARED
  RESERVED
  COMMITTED
  REJECTED
  CANCELLED
  EXPIRED
}

enum AgenticConsistencyMode {
  SERIALIZABLE_TRANSACTION
  OPTIMISTIC_VERSION
  ASYNC_VERIFIED_BATCH
}

input AgenticIntentOperationInput {
  operationKind: String!
  targetType: String!
  targetId: ID
  columnId: String
  payload: JSON!
  metadataTags: [String!]!
}

input AgenticIntentPreconditionInput {
  targetType: String!
  targetId: ID!
  expectedVersion: String
  predicateHash: String!
  failureMode: String!
}

input PrepareAgenticTransactionIntentInput {
  accountId: ID!
  boardId: ID!
  agentId: ID!
  procedureId: ID!
  idempotencyKey: String!
  consistencyMode: AgenticConsistencyMode!
  expectedReadWatermark: String!
  semanticContextRefs: [ID!]!
  operations: [AgenticIntentOperationInput!]!
  preconditions: [AgenticIntentPreconditionInput!]!
}

type AgenticTransactionIntent {
  accountId: ID!
  intentId: ID!
  boardId: ID!
  agentId: ID!
  procedureId: ID!
  status: AgenticIntentStatus!
  riskClass: String!
  operationCount: Int!
  writeSetHash: String!
  preconditionHash: String!
  auditHash: String!
  expiresAt: ISO8601DateTime!
}

type AgenticIntentPreflight {
  intent: AgenticTransactionIntent!
  estimatedRowsTouched: Int!
  estimatedColumnarInvalidations: Int!
  estimatedVectorInvalidations: Int!
  requiresHumanApproval: Boolean!
  rejectionReason: String
}

type AgenticIntentCommitResult {
  accountId: ID!
  intentId: ID!
  status: AgenticIntentStatus!
  committedOperationCount: Int!
  emittedEventIds: [ID!]!
  auditHash: String!
  rejectionReason: String
}

type Mutation {
  prepareAgenticTransactionIntent(
    input: PrepareAgenticTransactionIntentInput!
  ): AgenticIntentPreflight!

  reserveAgenticTransactionIntent(
    accountId: ID!
    intentId: ID!
  ): AgenticTransactionIntent!

  commitAgenticTransactionIntent(
    accountId: ID!
    intentId: ID!
  ): AgenticIntentCommitResult!

  cancelAgenticTransactionIntent(
    accountId: ID!
    intentId: ID!
    reason: String!
  ): AgenticTransactionIntent!
}

type Query {
  agenticTransactionIntent(
    accountId: ID!
    intentId: ID!
  ): AgenticTransactionIntent!
}
```

## Deterministic execution lifecycle

1. **Prepare:** Persist the intent, operations, and preconditions as immutable
   records. Compute `write_set_hash`, `precondition_hash`, and a preflight cost
   estimate without mutating customer data.
2. **Reserve:** Acquire short-lived write reservations for target rows and
   columns. Reject expired intents and duplicate idempotency keys.
3. **Commit:** Execute the row-store transaction under the selected consistency
   mode. All target versions and policy preconditions must still match.
4. **Project:** Emit ordered change events for columnar projections, semantic
   caches, vector refreshes, and lineage ledgers. Projection is async, but the
   source event list is deterministic.
5. **Audit:** Append a commit event with `previous_audit_hash` and `audit_hash`
   so enterprise customers can replay the full decision chain.

## Guardrails for autonomous writes

- Require a `procedure_id` for every agent-submitted intent. The procedure is
  procedural memory: it tells the agent what safe steps are allowed, while the
  intent proves which steps were requested.
- Cap operation counts by workload class. For interactive agents, start with
  small limits such as 25 operations and one `board_id`; route larger changes
  through `async_verified_batch`.
- Reject recursive commits where a tool effect attempts to commit another
  intent without an explicit parent ledger entry and remaining recursion budget.
- Require human approval for `risk_class = 'restricted'`, cross-board moves,
  external tool effects, or payloads that touch permissions, billing, or
  account-level policy.
- Enforce idempotency through `(account_id, idempotency_key)` so retrying an
  agent action cannot duplicate writes.
- Store redacted payload references instead of embedding raw sensitive values in
  vector summaries or audit-visible semantic metadata.

## Performance check for 1M+ row boards

Flag and reject any plan that would require a full board scan:

- `prepareAgenticTransactionIntent` must provide direct target IDs or a bounded
  semantic retrieval result set. It cannot accept "all matching rows" unless a
  deterministic indexed filter has already materialized target IDs.
- Preconditions must resolve through `(account_id, target_type, target_id)` or
  existing board/item primary keys. JSON predicates without an indexed generated
  column are not allowed in the preflight path.
- Columnar invalidations should be range- or item-id based. Recomputing an
  entire board projection for a small intent is a planner error.
- HNSW searches for prior intents must use tenant partitions and a bounded
  `topK`; a global vector graph or unbounded semantic history lookup creates
  noisy-neighbor risk.
- Bulk intents should be chunked by item ID ranges and committed with
  watermarks, so row-store locks remain short and columnar projection lag is
  visible.

## How an agent perceives the data

An LLM should receive compact, deterministic cards rather than raw table rows:

```ts
export interface AgenticIntentPerceptionCard {
  account_id: string;
  board_id: string;
  intent_id: string;
  procedure_id: string;
  allowed_next_actions: Array<"reserve" | "commit" | "cancel" | "request_review">;
  risk_class: AgenticIntentRiskClass;
  operation_summary: string;
  precondition_summary: string;
  metadata_tags: string[];
  audit_hash: string;
}
```

Example metadata tags:

- `tenant_scoped:account_id`
- `procedure:triage_sla_update`
- `intent:update_column_value`
- `consistency:optimistic_version`
- `risk:low`
- `guardrail:single_board`
- `outcome:committed`

These tags make the data useful for RAG while keeping mondayDB predictable: the
agent can retrieve examples and procedural hints, but the database only commits
explicit, hashable, tenant-scoped operations.

## Rollout notes

- Start with `update_column_value` and `create_update` because they map cleanly
  to existing row-store transactions and audit events.
- Keep `tool_effect` behind capability registry policy and human-review gates
  until tool leases and workload budgets prove stable in production.
- Emit metrics for prepare rejection rate, reservation contention, commit
  latency, projection lag, vector invalidation lag, and audit hash continuity.
- Treat any missing `account_id`, missing `board_id`, or unbounded operation
  list as a hard API error, not a planner fallback.
