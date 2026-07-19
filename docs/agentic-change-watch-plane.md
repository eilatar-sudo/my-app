# Agentic Change Watch Plane

## Why this belongs in mondayDB

Agents should react to committed work, not repeatedly ask whether work changed.
Polling a million-row board wastes row-store capacity, adds reaction latency, and makes
one noisy automation a neighbor-impact problem. A conventional database change stream
is not sufficient either: raw log records expose physical storage details, are difficult
to authorize at delivery time, and encourage consumers to treat an internal log offset
as a stable product contract.

The product trade-off is **reaction latency versus isolation and deterministic
delivery**. mondayDB should expose a durable, tenant-scoped **change watch** over a
bounded board scope. A watch advances through immutable change deltas with an opaque
cursor. It may emit a lightweight webhook hint, but the authorized data is always
pulled through the monday.com Open API. This preserves replay and backpressure without
putting a long-lived GraphQL subscription on database compute.

The engine remains deterministic:

1. the ACID row transaction writes a tenant-scoped outbox record;
2. an asynchronous projector creates a canonical, redaction-safe delta;
3. a bounded matcher evaluates typed watch filters, never natural language;
4. the Open API releases a finite packet after fresh policy and visibility checks; and
5. acknowledgement advances one monotonic cursor using compare-and-set.

An LLM may interpret a delta and decide what to propose next. Similarity search may
retrieve context after a delta arrives. Neither an LLM nor a vector distance decides
whether the watch fired.

### Product guarantees

- **Tenant isolation:** `account_id` leads every persisted key, foreign key, queue
  claim, lookup, and vector partition. The resolver compares input `accountId` with the
  authenticated account before any storage access.
- **ACID capture:** a source mutation and its outbox event commit in the same row-store
  transaction. A committed mutation cannot be silently absent from the feed.
- **Explicit consistency:** row commit is synchronous; delta projection is
  asynchronous. Every response reports source and projected watermarks and lag.
- **At-least-once delivery:** retries may repeat a delta. Stable `delta_id`,
  `event_hash`, and pull receipts make consumer handling idempotent.
- **No false global order:** ordering is monotonic only within
  `(account_id, board_id)`. Version 1 gives each watch exactly one board.
- **Fresh authorization:** registration permission does not grant perpetual access.
  Pull, context retrieval, and acknowledgement re-evaluate the current principal,
  purpose, policy, redaction, consent, and revocation state.
- **Deterministic matching:** watch predicates are typed IDs and enums over one board.
  Semantic similarity and arbitrary JSON expressions are forbidden trigger predicates.
- **Bounded work:** packet count, packet bytes, replay distance, projected columns,
  reaction depth, and downstream work are admitted before execution.
- **Auditable progress:** registration, pause, pull, acknowledgement, expiration,
  policy denial, and cursor reset produce hash-chained audit events.
- **No silent repair scan:** an expired cursor returns `CURSOR_EXPIRED`. mondayDB never
  rebuilds it with an implicit full-board scan.

## Scope and semantics

A **change watch** is a versioned registration owned by a principal and purpose. It
targets one board, a bounded item set or all future board items, a bounded column
projection, and explicit event kinds. Registration captures the current board
watermark; it does not backfill board history by default.

A **source event** is the immutable, transaction-coupled record that a board object
changed. It contains typed object and column identifiers, source versions, origin
metadata, and encrypted payload references. It does not contain embeddings.

A **change delta** is a canonical projection of one source event. It contains bounded
metadata, changed-field descriptors, current classification labels, semantic journal
pointers, and hashes. Sensitive values remain in separately authorized artifacts.

A **watch cursor** is the last acknowledged board change sequence for one watch
generation. The sequence is allocated by the authoritative row-store partition in
commit order. Gaps are valid; reuse and reordering are not.

A **pull receipt** seals the exact sequence range, delta IDs, policy version,
visibility checkpoint, packet hash, and expiration returned by one pull. An
acknowledgement must present its token. This prevents a client from advancing beyond
data it was authorized to receive.

A **webhook hint** contains only `watch_id`, generation, latest projected watermark,
hint ID, and expiry under a monday signature. It is a wake-up signal, not the delta,
not an acknowledgement, and not authority to read.

Version 1 supports:

- one board per watch;
- `ALL_ITEMS` or at most 256 exact item IDs;
- at most 32 projected column IDs and 16 event kinds;
- start at `NOW` or replay from a still-retained, server-issued cursor;
- pull packets of at most 500 deltas and 1 MiB;
- monotonic compare-and-set acknowledgement;
- pause, resume, and generation-fenced scope replacement;
- optional metadata-only webhook hints;
- reaction lineage and loop-containment metadata; and
- bounded semantic context retrieval after deterministic delivery.

Version 1 rejects:

- account-wide and multi-board watches;
- view, formula, natural-language, regex, vector, or arbitrary JSON trigger predicates;
- unbounded historical replay;
- raw database log sequence numbers as an API contract;
- exact vector fallback scans;
- synchronous embedding generation in a source transaction;
- cursor acknowledgement without a live pull receipt;
- one watch directly creating another watch; and
- automatic action execution from a delta without a fresh governed-action preflight.

## TypeScript contracts

Opaque IDs, hashes, timestamps, byte counts, sequence numbers, and row estimates use
strings where JavaScript number precision could be unsafe.

```ts
type DecimalString = string;
type IsoTimestamp = string;

type ChangeEventKind =
  | "ITEM_CREATED"
  | "ITEM_UPDATED"
  | "ITEM_ARCHIVED"
  | "ITEM_RESTORED"
  | "ITEM_DELETED"
  | "COLUMN_VALUE_CHANGED"
  | "COLUMN_CREATED"
  | "COLUMN_UPDATED"
  | "COLUMN_DELETED"
  | "BOARD_STRUCTURE_CHANGED";

type WatchStatus =
  | "ACTIVE"
  | "PAUSED"
  | "POLICY_BLOCKED"
  | "CURSOR_EXPIRED"
  | "REVOKED";

type WatchItemScope =
  | { kind: "ALL_ITEMS" }
  | { kind: "ITEM_SET"; itemIds: string[] };

interface TenantScope {
  accountId: string;
  principalId: string;
  purposeId: string;
}

interface AgentChangeWatchScope {
  accountId: string;
  boardId: string;
  itemScope: WatchItemScope;
  projectedColumnIds: string[];
  eventKinds: ChangeEventKind[];
  includeValueArtifacts: boolean;
}

interface WatchDeliveryBudget {
  maxDeltasPerPull: number;
  maxPacketBytes: DecimalString;
  maxReplayEvents: DecimalString;
  maxProjectedColumns: number;
  maxVisibilityChecks: number;
  maxReactionDepth: number;
  maxDownstreamActionsPerDelta: number;
  timeoutMs: number;
}

interface ChangeCursor {
  accountId: string;
  watchId: string;
  watchGeneration: DecimalString;
  boardId: string;
  acknowledgedSequence: DecimalString;
  projectedWatermark: DecimalString;
  sourceWatermark: DecimalString;
  opaqueCursorToken: string;
}

interface ChangeOrigin {
  originKind: "USER" | "AUTOMATION" | "AGENT" | "API" | "SYSTEM";
  originPrincipalId?: string;
  originAgentId?: string;
  originRequestId?: string;
  rootCausationId: string;
  parentDeltaId?: string;
  reactionDepth: number;
  lineageHash: string;
}

interface ChangedFieldDescriptor {
  accountId: string;
  boardId: string;
  columnId: string;
  valueKind: string;
  operation: "SET" | "CLEAR" | "APPEND" | "REMOVE" | "STRUCTURE";
  beforeValueHash?: string;
  afterValueHash?: string;
  authorizedValueArtifactId?: string;
  classificationLabels: string[];
}

interface AgentChangeDelta {
  accountId: string;
  deltaId: string;
  sourceEventId: string;
  boardId: string;
  boardChangeSequence: DecimalString;
  commitTimestamp: IsoTimestamp;
  eventKind: ChangeEventKind;
  objectType: "BOARD" | "ITEM" | "COLUMN";
  objectId: string;
  objectVersion: DecimalString;
  changedFields: ChangedFieldDescriptor[];
  origin: ChangeOrigin;
  semanticJournalRefs: Array<{
    accountId: string;
    journalId: string;
    manifestVersion: string;
  }>;
  sourceVisibilityEpoch: DecimalString;
  redactionEnvelopeHash: string;
  eventHash: string;
}

interface ChangePerceptionCard {
  accountId: string;
  deltaId: string;
  boardId: string;
  title: string;
  deterministicSummary: string;
  eventKind: ChangeEventKind;
  changedColumnIds: string[];
  classificationLabels: string[];
  freshness: {
    sourceSequence: DecimalString;
    projectedSequence: DecimalString;
    lagEvents: DecimalString;
  };
  procedureHints: Array<{
    accountId: string;
    procedureId: string;
    procedureVersion: string;
    applicabilityEvaluationRequired: true;
  }>;
  allowedNextOperations: Array<
    "RETRIEVE_CONTEXT" | "PROPOSE_ACTION" | "ACKNOWLEDGE" | "ESCALATE"
  >;
  prohibitedOperations: string[];
  perceptionHash: string;
}

interface PullChangeDeltasRequest extends TenantScope {
  requestId: string;
  watchId: string;
  cursorToken: string;
  limit: number;
  maxPacketBytes: DecimalString;
  expectedWatchGeneration: DecimalString;
  reactionContext?: {
    rootCausationId: string;
    parentDeltaId: string;
    reactionDepth: number;
    recentLineageHashes: string[];
  };
}

type PullDecision =
  | "DELIVERED"
  | "NO_CHANGES"
  | "THROTTLED"
  | "POLICY_BLOCKED"
  | "CURSOR_EXPIRED"
  | "WATCH_PAUSED"
  | "REAUTHENTICATION_REQUIRED"
  | "REJECTED";

interface PullChangeDeltasResult {
  accountId: string;
  requestId: string;
  watchId: string;
  decision: PullDecision;
  reasonCodes: string[];
  deltas: AgentChangeDelta[];
  perceptionCards: ChangePerceptionCard[];
  pullReceiptToken?: string;
  nextCursorToken?: string;
  deliveredThroughSequence: DecimalString;
  sourceWatermark: DecimalString;
  projectedWatermark: DecimalString;
  projectionLagEvents: DecimalString;
  budgetConsumed: {
    eventsExamined: DecimalString;
    deltasDelivered: number;
    packetBytes: DecimalString;
    visibilityChecks: number;
    elapsedMs: number;
  };
  retryAfterMs?: number;
  auditEventId: string;
}

interface AcknowledgeChangeDeltasRequest extends TenantScope {
  requestId: string;
  watchId: string;
  expectedWatchGeneration: DecimalString;
  expectedAcknowledgedSequence: DecimalString;
  acknowledgeThroughSequence: DecimalString;
  pullReceiptToken: string;
  consumerStateHash: string;
}

interface AcknowledgeChangeDeltasResult {
  accountId: string;
  requestId: string;
  watchId: string;
  decision: "ACKNOWLEDGED" | "ALREADY_ACKNOWLEDGED" | "CONFLICT" | "REJECTED";
  acknowledgedSequence: DecimalString;
  cursorToken: string;
  auditEventId: string;
}

interface SemanticContextRequest extends TenantScope {
  requestId: string;
  deltaId: string;
  queryText: string;
  embeddingModelId: string;
  embeddingManifestVersion: string;
  topK: number;
  maxCandidates: number;
  maxEstimatedBytes: DecimalString;
  timeoutMs: number;
}
```

### Resolver invariants

```ts
interface AuthContext {
  accountId: string;
  principalId: string;
  policyVersion: string;
  visibilityEpoch: string;
}

function assertTenantScope(input: TenantScope, auth: AuthContext): void {
  if (input.accountId !== auth.accountId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }
  if (input.principalId !== auth.principalId) {
    throw new Error("PRINCIPAL_SCOPE_MISMATCH");
  }
}

function validatePullBounds(
  input: PullChangeDeltasRequest,
  policy: WatchDeliveryBudget,
): void {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error("INVALID_LIMIT");
  }
  if (input.limit > Math.min(policy.maxDeltasPerPull, 500)) {
    throw new Error("DELTA_LIMIT_EXCEEDED");
  }
  if (BigInt(input.maxPacketBytes) > BigInt(policy.maxPacketBytes)) {
    throw new Error("PACKET_BUDGET_EXCEEDED");
  }
  const depth = input.reactionContext?.reactionDepth ?? 0;
  if (depth > policy.maxReactionDepth) {
    throw new Error("REACTION_DEPTH_EXCEEDED");
  }
  if ((input.reactionContext?.recentLineageHashes.length ?? 0) > 32) {
    throw new Error("LINEAGE_WINDOW_EXCEEDED");
  }
}
```

These examples are defense in depth. The storage adapter must still bind
`account_id = auth.accountId` in every statement; validating an object once is not a
substitute for tenant-leading SQL predicates and row-level security.

## SQL row-store schema

The SQL is illustrative PostgreSQL. Production mondayDB may map the same logical
contracts to its hybrid row store. UUIDs are server-minted. Artifact payloads are
encrypted and stored separately from searchable metadata.

```sql
CREATE TYPE agent_watch_status AS ENUM (
  'ACTIVE',
  'PAUSED',
  'POLICY_BLOCKED',
  'CURSOR_EXPIRED',
  'REVOKED'
);

CREATE TYPE agent_watch_item_scope AS ENUM (
  'ALL_ITEMS',
  'ITEM_SET'
);

CREATE TYPE agent_change_event_kind AS ENUM (
  'ITEM_CREATED',
  'ITEM_UPDATED',
  'ITEM_ARCHIVED',
  'ITEM_RESTORED',
  'ITEM_DELETED',
  'COLUMN_VALUE_CHANGED',
  'COLUMN_CREATED',
  'COLUMN_UPDATED',
  'COLUMN_DELETED',
  'BOARD_STRUCTURE_CHANGED'
);

CREATE TYPE agent_change_origin_kind AS ENUM (
  'USER',
  'AUTOMATION',
  'AGENT',
  'API',
  'SYSTEM'
);

CREATE TABLE agent_change_watch (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  board_id BIGINT NOT NULL,
  owner_principal_id UUID NOT NULL,
  purpose_id UUID NOT NULL,
  status agent_watch_status NOT NULL,
  item_scope agent_watch_item_scope NOT NULL,
  include_value_artifacts BOOLEAN NOT NULL DEFAULT FALSE,
  start_sequence BIGINT NOT NULL CHECK (start_sequence >= 0),
  retention_class TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  scope_hash TEXT NOT NULL,
  delivery_budget_json JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  idempotency_payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, watch_id),
  UNIQUE (account_id, owner_principal_id, idempotency_key),
  UNIQUE (account_id, watch_id, board_id),
  CHECK (jsonb_typeof(delivery_budget_json) = 'object')
);

CREATE INDEX agent_change_watch_board_active_idx
  ON agent_change_watch (account_id, board_id, status, watch_id);

CREATE TABLE agent_change_watch_item (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, watch_id, item_id),
  FOREIGN KEY (account_id, watch_id, board_id)
    REFERENCES agent_change_watch (account_id, watch_id, board_id)
    ON DELETE CASCADE
);

CREATE INDEX agent_change_watch_item_match_idx
  ON agent_change_watch_item (account_id, board_id, item_id, watch_id);

CREATE TABLE agent_change_watch_column (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  column_id BIGINT NOT NULL,
  projection_ordinal SMALLINT NOT NULL CHECK (projection_ordinal BETWEEN 0 AND 31),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, watch_id, column_id),
  UNIQUE (account_id, watch_id, projection_ordinal),
  FOREIGN KEY (account_id, watch_id, board_id)
    REFERENCES agent_change_watch (account_id, watch_id, board_id)
    ON DELETE CASCADE
);

CREATE TABLE agent_change_watch_event_kind (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  event_kind agent_change_event_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, watch_id, event_kind),
  FOREIGN KEY (account_id, watch_id, board_id)
    REFERENCES agent_change_watch (account_id, watch_id, board_id)
    ON DELETE CASCADE
);

CREATE INDEX agent_change_watch_event_match_idx
  ON agent_change_watch_event_kind
    (account_id, board_id, event_kind, watch_id);

CREATE TABLE agent_change_source_outbox (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  board_change_sequence BIGINT NOT NULL CHECK (board_change_sequence > 0),
  source_event_id UUID NOT NULL,
  source_transaction_id UUID NOT NULL,
  commit_timestamp TIMESTAMPTZ NOT NULL,
  event_kind agent_change_event_kind NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('BOARD', 'ITEM', 'COLUMN')),
  object_id BIGINT NOT NULL,
  object_version BIGINT NOT NULL CHECK (object_version > 0),
  changed_column_ids BIGINT[] NOT NULL DEFAULT '{}',
  encrypted_payload_artifact_id UUID,
  payload_hash TEXT NOT NULL,
  origin_kind agent_change_origin_kind NOT NULL,
  origin_principal_id UUID,
  origin_agent_id UUID,
  origin_request_id UUID,
  root_causation_id UUID NOT NULL,
  parent_delta_id UUID,
  reaction_depth SMALLINT NOT NULL DEFAULT 0
    CHECK (reaction_depth BETWEEN 0 AND 32),
  lineage_hash TEXT NOT NULL,
  source_visibility_epoch BIGINT NOT NULL CHECK (source_visibility_epoch > 0),
  PRIMARY KEY (account_id, board_id, board_change_sequence),
  UNIQUE (account_id, source_event_id),
  UNIQUE (account_id, source_transaction_id, source_event_id)
);

CREATE INDEX agent_change_source_projector_idx
  ON agent_change_source_outbox
    (account_id, board_id, board_change_sequence, source_event_id);

CREATE TABLE agent_change_projection_checkpoint (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  projected_through_sequence BIGINT NOT NULL CHECK (projected_through_sequence >= 0),
  source_watermark BIGINT NOT NULL CHECK (source_watermark >= 0),
  projector_version TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, board_id)
);

CREATE TABLE agent_change_delta (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  board_change_sequence BIGINT NOT NULL CHECK (board_change_sequence > 0),
  delta_id UUID NOT NULL,
  source_event_id UUID NOT NULL,
  commit_timestamp TIMESTAMPTZ NOT NULL,
  event_kind agent_change_event_kind NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('BOARD', 'ITEM', 'COLUMN')),
  object_id BIGINT NOT NULL,
  object_version BIGINT NOT NULL CHECK (object_version > 0),
  changed_column_ids BIGINT[] NOT NULL DEFAULT '{}',
  changed_field_manifest_json JSONB NOT NULL,
  semantic_journal_refs_json JSONB NOT NULL DEFAULT '[]',
  classification_labels TEXT[] NOT NULL DEFAULT '{}',
  redaction_envelope_hash TEXT NOT NULL,
  source_visibility_epoch BIGINT NOT NULL CHECK (source_visibility_epoch > 0),
  event_hash TEXT NOT NULL,
  projector_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, board_id, board_change_sequence),
  UNIQUE (account_id, delta_id),
  UNIQUE (account_id, source_event_id),
  FOREIGN KEY (account_id, board_id, board_change_sequence)
    REFERENCES agent_change_source_outbox
      (account_id, board_id, board_change_sequence),
  CHECK (jsonb_typeof(changed_field_manifest_json) = 'array'),
  CHECK (jsonb_typeof(semantic_journal_refs_json) = 'array')
);

CREATE INDEX agent_change_delta_item_idx
  ON agent_change_delta
    (account_id, board_id, object_id, board_change_sequence);

CREATE INDEX agent_change_delta_kind_idx
  ON agent_change_delta
    (account_id, board_id, event_kind, board_change_sequence);

CREATE TABLE agent_change_watch_cursor (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  watch_generation BIGINT NOT NULL CHECK (watch_generation > 0),
  acknowledged_sequence BIGINT NOT NULL CHECK (acknowledged_sequence >= 0),
  last_issued_sequence BIGINT NOT NULL CHECK (last_issued_sequence >= 0),
  cursor_version BIGINT NOT NULL DEFAULT 1 CHECK (cursor_version > 0),
  cursor_token_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, watch_id),
  FOREIGN KEY (account_id, watch_id, board_id)
    REFERENCES agent_change_watch (account_id, watch_id, board_id)
    ON DELETE CASCADE,
  CHECK (acknowledged_sequence <= last_issued_sequence)
);

CREATE TABLE agent_change_pull_receipt (
  account_id BIGINT NOT NULL,
  pull_receipt_id UUID NOT NULL,
  watch_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  watch_generation BIGINT NOT NULL CHECK (watch_generation > 0),
  principal_id UUID NOT NULL,
  purpose_id UUID NOT NULL,
  from_sequence_exclusive BIGINT NOT NULL CHECK (from_sequence_exclusive >= 0),
  to_sequence_inclusive BIGINT NOT NULL CHECK (to_sequence_inclusive >= 0),
  delta_count INTEGER NOT NULL CHECK (delta_count BETWEEN 0 AND 500),
  packet_bytes BIGINT NOT NULL CHECK (packet_bytes BETWEEN 0 AND 1048576),
  delta_set_hash TEXT NOT NULL,
  packet_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  visibility_epoch BIGINT NOT NULL CHECK (visibility_epoch > 0),
  receipt_token_hash TEXT NOT NULL,
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, pull_receipt_id),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (account_id, watch_id, board_id)
    REFERENCES agent_change_watch (account_id, watch_id, board_id),
  CHECK (from_sequence_exclusive <= to_sequence_inclusive),
  CHECK (expires_at > created_at)
);

CREATE INDEX agent_change_pull_receipt_ack_idx
  ON agent_change_pull_receipt
    (account_id, watch_id, to_sequence_inclusive, expires_at);

CREATE TABLE agent_change_procedure_binding (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  procedure_id UUID NOT NULL,
  procedure_version BIGINT NOT NULL CHECK (procedure_version > 0),
  applicability_contract_hash TEXT NOT NULL,
  max_invocations_per_delta SMALLINT NOT NULL
    CHECK (max_invocations_per_delta BETWEEN 0 AND 8),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, watch_id, procedure_id, procedure_version),
  FOREIGN KEY (account_id, watch_id)
    REFERENCES agent_change_watch (account_id, watch_id)
    ON DELETE CASCADE
);

CREATE TABLE agent_change_webhook_hint (
  account_id BIGINT NOT NULL,
  hint_id UUID NOT NULL,
  watch_id UUID NOT NULL,
  watch_generation BIGINT NOT NULL CHECK (watch_generation > 0),
  projected_watermark BIGINT NOT NULL CHECK (projected_watermark >= 0),
  endpoint_ref_id UUID NOT NULL,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 12),
  not_before TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  response_class TEXT,
  hint_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, hint_id),
  UNIQUE (account_id, watch_id, watch_generation, projected_watermark, attempt_number),
  FOREIGN KEY (account_id, watch_id)
    REFERENCES agent_change_watch (account_id, watch_id),
  CHECK (expires_at > created_at)
);

CREATE INDEX agent_change_webhook_hint_queue_idx
  ON agent_change_webhook_hint
    (account_id, not_before, hint_id)
  WHERE delivered_at IS NULL;

CREATE TABLE agent_change_audit_event (
  account_id BIGINT NOT NULL,
  audit_shard SMALLINT NOT NULL CHECK (audit_shard BETWEEN 0 AND 63),
  audit_sequence BIGINT NOT NULL CHECK (audit_sequence > 0),
  audit_event_id UUID NOT NULL,
  watch_id UUID,
  request_id UUID,
  principal_id UUID NOT NULL,
  purpose_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  visibility_epoch BIGINT NOT NULL CHECK (visibility_epoch > 0),
  previous_event_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_shard, audit_sequence),
  UNIQUE (account_id, audit_event_id),
  UNIQUE (account_id, audit_shard, event_hash)
);

CREATE INDEX agent_change_audit_watch_idx
  ON agent_change_audit_event
    (account_id, watch_id, created_at, audit_event_id);

ALTER TABLE agent_change_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_column ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_event_kind ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_source_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_projection_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_delta ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_pull_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_procedure_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_webhook_hint ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_change_watch_tenant_policy ON agent_change_watch
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_watch_item_tenant_policy ON agent_change_watch_item
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_watch_column_tenant_policy ON agent_change_watch_column
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_watch_event_tenant_policy ON agent_change_watch_event_kind
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_source_tenant_policy ON agent_change_source_outbox
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_checkpoint_tenant_policy
  ON agent_change_projection_checkpoint
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_delta_tenant_policy ON agent_change_delta
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_cursor_tenant_policy ON agent_change_watch_cursor
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_receipt_tenant_policy ON agent_change_pull_receipt
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_procedure_tenant_policy
  ON agent_change_procedure_binding
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_hint_tenant_policy ON agent_change_webhook_hint
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_audit_tenant_policy ON agent_change_audit_event
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);
```

### Physical layout

- Hash-partition high-volume tables by `account_id`, then range-partition
  `agent_change_source_outbox` and `agent_change_delta` by commit time or board
  sequence. A tenant can move partitions without mixing data with another tenant.
- Keep source outbox, cursor, and acknowledgement state in the ACID row path.
  Columnar storage may mirror delta metadata for aggregate observability, but it is not
  authoritative for delivery.
- Allocate `board_change_sequence` in the authoritative board transaction partition.
  Range leasing may create gaps, which cursor semantics tolerate. A sequence may never
  be reused after rollback or failover.
- Compact immutable delta segments only below the minimum retained acknowledged
  sequence plus enterprise retention. Compaction produces a signed manifest and audit
  event; it does not rewrite surviving event hashes.
- Queue workers claim exact account-leading ranges. Cross-account queue scans require a
  privileged control-plane role and fair scheduling; application roles never receive
  that capability.

### Transaction boundaries

**Source commit**

1. Lock or validate the target board item version.
2. Apply the row mutation.
3. Allocate the next board change sequence.
4. Insert `agent_change_source_outbox` with payload and lineage hashes.
5. Append the source-capture audit event.
6. Commit once.

Embedding, webhook, semantic retrieval, and LLM work are not allowed in this
transaction.

**Projection**

1. Claim a bounded `(account_id, board_id, sequence range)`.
2. Read current classification and redaction metadata with a visibility checkpoint.
3. Build canonical field descriptors and semantic journal pointers.
4. Insert `agent_change_delta` idempotently by source event.
5. Advance `agent_change_projection_checkpoint` with compare-and-set.
6. Enqueue coalesced webhook hints and append an audit event.

Projection may lag without blocking board writes. If lag exceeds policy, hints stop,
pulls report `THROTTLED`, and operators scale or isolate the projector. The service
does not skip source events to appear current.

**Pull and acknowledge**

1. Resolve the authenticated account, principal, purpose, and current policy.
2. Point-read the watch and cursor by `(account_id, watch_id)`.
3. Verify generation, status, cursor token, retention, and reaction lineage.
4. Reserve packet and visibility-check budgets.
5. Range-read deltas by `(account_id, board_id, sequence)` and apply bounded exact
   item, event-kind, and column projection filters.
6. Materialize only authorized value artifacts; replace denied fields with typed
   redaction descriptors.
7. Persist a pull receipt and audit decision, then return the packet.
8. On acknowledgement, lock the cursor, validate the live receipt and expected
   sequence, advance monotonically, append an audit event, and commit once.

The cursor never advances during pull. A consumer crash therefore repeats a packet
rather than losing it.

## Open API GraphQL contract

`accountId` is explicit for audit and SDK clarity, but it is never trusted. Every
resolver compares it with the authenticated account before loading a watch. Cursor and
receipt tokens are opaque, signed, short-lived capabilities bound to account,
principal, purpose, watch generation, and visibility epoch.

```graphql
scalar DateTime
scalar Long

enum AgentChangeEventKind {
  ITEM_CREATED
  ITEM_UPDATED
  ITEM_ARCHIVED
  ITEM_RESTORED
  ITEM_DELETED
  COLUMN_VALUE_CHANGED
  COLUMN_CREATED
  COLUMN_UPDATED
  COLUMN_DELETED
  BOARD_STRUCTURE_CHANGED
}

enum AgentChangeWatchStatus {
  ACTIVE
  PAUSED
  POLICY_BLOCKED
  CURSOR_EXPIRED
  REVOKED
}

enum AgentChangeWatchStart {
  NOW
  AFTER_CURSOR
}

enum AgentChangePullDecision {
  DELIVERED
  NO_CHANGES
  THROTTLED
  POLICY_BLOCKED
  CURSOR_EXPIRED
  WATCH_PAUSED
  REAUTHENTICATION_REQUIRED
  REJECTED
}

input AgentWatchItemScopeInput {
  allItems: Boolean
  itemIds: [ID!]
}

input AgentChangeWatchScopeInput {
  accountId: ID!
  boardId: ID!
  items: AgentWatchItemScopeInput!
  projectedColumnIds: [ID!]!
  eventKinds: [AgentChangeEventKind!]!
  includeValueArtifacts: Boolean! = false
}

input AgentWatchDeliveryBudgetInput {
  maxDeltasPerPull: Int!
  maxPacketBytes: Long!
  maxReplayEvents: Long!
  maxVisibilityChecks: Int!
  maxReactionDepth: Int!
  maxDownstreamActionsPerDelta: Int!
  timeoutMs: Int!
}

input RegisterAgentChangeWatchInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  idempotencyKey: String!
  scope: AgentChangeWatchScopeInput!
  start: AgentChangeWatchStart!
  afterCursorToken: String
  budget: AgentWatchDeliveryBudgetInput!
  procedureVersionIds: [ID!]! = []
  webhookEndpointRefId: ID
}

type AgentChangeCursor {
  accountId: ID!
  watchId: ID!
  watchGeneration: Long!
  boardId: ID!
  acknowledgedSequence: Long!
  sourceWatermark: Long!
  projectedWatermark: Long!
  opaqueCursorToken: String!
}

type AgentChangeWatch {
  accountId: ID!
  watchId: ID!
  generation: Long!
  boardId: ID!
  ownerPrincipalId: ID!
  purposeId: ID!
  status: AgentChangeWatchStatus!
  eventKinds: [AgentChangeEventKind!]!
  projectedColumnIds: [ID!]!
  includeValueArtifacts: Boolean!
  cursor: AgentChangeCursor!
  scopeHash: String!
  policyVersion: String!
  createdAt: DateTime!
  expiresAt: DateTime
}

type RegisterAgentChangeWatchPayload {
  watch: AgentChangeWatch
  decision: String!
  reasonCodes: [String!]!
  auditEventId: ID!
}

input AgentChangeReactionContextInput {
  rootCausationId: ID!
  parentDeltaId: ID!
  reactionDepth: Int!
  recentLineageHashes: [String!]!
}

input PullAgentChangeDeltasInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  watchId: ID!
  cursorToken: String!
  expectedWatchGeneration: Long!
  limit: Int!
  maxPacketBytes: Long!
  reactionContext: AgentChangeReactionContextInput
}

type AgentChangedField {
  accountId: ID!
  boardId: ID!
  columnId: ID!
  valueKind: String!
  operation: String!
  beforeValueHash: String
  afterValueHash: String
  authorizedValueArtifactId: ID
  classificationLabels: [String!]!
}

type AgentChangeOrigin {
  originKind: String!
  originPrincipalId: ID
  originAgentId: ID
  originRequestId: ID
  rootCausationId: ID!
  parentDeltaId: ID
  reactionDepth: Int!
  lineageHash: String!
}

type AgentSemanticJournalRef {
  accountId: ID!
  journalId: ID!
  manifestVersion: String!
}

type AgentChangeDelta {
  accountId: ID!
  deltaId: ID!
  sourceEventId: ID!
  boardId: ID!
  boardChangeSequence: Long!
  commitTimestamp: DateTime!
  eventKind: AgentChangeEventKind!
  objectType: String!
  objectId: ID!
  objectVersion: Long!
  changedFields: [AgentChangedField!]!
  origin: AgentChangeOrigin!
  semanticJournalRefs: [AgentSemanticJournalRef!]!
  sourceVisibilityEpoch: Long!
  redactionEnvelopeHash: String!
  eventHash: String!
}

type AgentProcedureHint {
  accountId: ID!
  procedureId: ID!
  procedureVersion: Long!
  applicabilityEvaluationRequired: Boolean!
}

type AgentChangeFreshness {
  sourceSequence: Long!
  projectedSequence: Long!
  lagEvents: Long!
}

type AgentChangePerceptionCard {
  accountId: ID!
  deltaId: ID!
  boardId: ID!
  title: String!
  deterministicSummary: String!
  eventKind: AgentChangeEventKind!
  changedColumnIds: [ID!]!
  classificationLabels: [String!]!
  freshness: AgentChangeFreshness!
  procedureHints: [AgentProcedureHint!]!
  allowedNextOperations: [String!]!
  prohibitedOperations: [String!]!
  perceptionHash: String!
}

type AgentChangeBudgetConsumed {
  eventsExamined: Long!
  deltasDelivered: Int!
  packetBytes: Long!
  visibilityChecks: Int!
  elapsedMs: Int!
}

type PullAgentChangeDeltasPayload {
  accountId: ID!
  requestId: ID!
  watchId: ID!
  decision: AgentChangePullDecision!
  reasonCodes: [String!]!
  deltas: [AgentChangeDelta!]!
  perceptionCards: [AgentChangePerceptionCard!]!
  pullReceiptToken: String
  nextCursorToken: String
  deliveredThroughSequence: Long!
  sourceWatermark: Long!
  projectedWatermark: Long!
  projectionLagEvents: Long!
  budgetConsumed: AgentChangeBudgetConsumed!
  retryAfterMs: Int
  auditEventId: ID!
}

input AcknowledgeAgentChangeDeltasInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  watchId: ID!
  expectedWatchGeneration: Long!
  expectedAcknowledgedSequence: Long!
  acknowledgeThroughSequence: Long!
  pullReceiptToken: String!
  consumerStateHash: String!
}

type AcknowledgeAgentChangeDeltasPayload {
  accountId: ID!
  requestId: ID!
  watchId: ID!
  decision: String!
  acknowledgedSequence: Long!
  cursorToken: String!
  auditEventId: ID!
}

input UpdateAgentChangeWatchStateInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  watchId: ID!
  expectedGeneration: Long!
  desiredStatus: AgentChangeWatchStatus!
  reason: String!
}

input AgentChangeContextInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  deltaId: ID!
  queryText: String!
  embeddingModelId: String!
  embeddingManifestVersion: String!
  topK: Int! = 8
  maxCandidates: Int! = 64
  maxEstimatedBytes: Long!
  timeoutMs: Int!
}

type AgentSemanticContextCandidate {
  accountId: ID!
  objectType: String!
  objectId: ID!
  boardId: ID!
  score: Float!
  visibilityEpoch: Long!
  sourceVersion: Long!
  perceptionCardHash: String!
}

type AgentChangeContextPayload {
  accountId: ID!
  deltaId: ID!
  candidates: [AgentSemanticContextCandidate!]!
  underfilled: Boolean!
  reasonCodes: [String!]!
  auditEventId: ID!
}

type Query {
  agentChangeWatch(
    accountId: ID!
    principalId: ID!
    purposeId: ID!
    watchId: ID!
  ): AgentChangeWatch

  pullAgentChangeDeltas(
    input: PullAgentChangeDeltasInput!
  ): PullAgentChangeDeltasPayload!

  agentChangeContext(
    input: AgentChangeContextInput!
  ): AgentChangeContextPayload!
}

type Mutation {
  registerAgentChangeWatch(
    input: RegisterAgentChangeWatchInput!
  ): RegisterAgentChangeWatchPayload!

  acknowledgeAgentChangeDeltas(
    input: AcknowledgeAgentChangeDeltasInput!
  ): AcknowledgeAgentChangeDeltasPayload!

  updateAgentChangeWatchState(
    input: UpdateAgentChangeWatchStateInput!
  ): RegisterAgentChangeWatchPayload!
}
```

GraphQL request complexity assigns fixed base cost plus declared packet, value artifact,
and semantic candidate costs. The server clamps all client limits to the current policy;
lower client limits never expand server limits. Pagination is cursor-only.

## Procedural memory

A watch may reference versioned procedure memory, but it stores references and
applicability contracts rather than executable prompts. A delivered perception card
tells an agent:

- which procedure versions might apply;
- which exact preconditions must be checked;
- which tools and write scopes the procedure could request;
- which policy, purpose, and data-contract versions govern it;
- the maximum allowed downstream actions; and
- that a fresh plan verification and governed-action envelope are required.

The database does not interpret procedure prose. Before instructions are released, a
deterministic applicability evaluator point-reads the procedure version, validates its
scope against the delta, and returns one of `APPLICABLE`, `NOT_APPLICABLE`,
`REVIEW_REQUIRED`, or `REJECTED`. A retired or changed procedure cannot be recovered
from an old delta or pull receipt.

Procedure execution creates a new causation edge:

```text
source event
  -> projected delta
  -> pull receipt
  -> applicability evaluation
  -> verified plan
  -> governed action / transaction intent
  -> resulting source event
```

Every edge carries `account_id`, `root_causation_id`, `parent_delta_id`, reaction
depth, and a lineage hash. The loop-containment governor rejects repeated lineage
fingerprints and depth beyond policy before any downstream query or tool call.

## Semantic retrieval

Change matching is never semantic. After deterministic delivery, an agent can request
bounded context for one delta:

1. point-read the delta by `(account_id, delta_id)`;
2. verify current visibility and the requested embedding manifest;
3. mint the query embedding server-side from redaction-safe text;
4. search the physical HNSW partition selected by
   `(account_id, model_id, manifest_version)`;
5. cap `topK <= 32`, `maxCandidates <= 256`, `ef_search`, bytes, and timeout;
6. post-filter every candidate against authoritative current visibility;
7. return an underfilled result rather than cross partitions or exact-scan fallback;
8. record query, manifest, candidate, visibility, and result hashes.

Embeddings may cover redacted perception cards, board schema metadata, procedure
descriptions, and semantic memory. They do not include raw restricted values or opaque
cursor capabilities. New source events write semantic journal references; an
asynchronous vector transaction journal advances its own explicit watermark.

This separation lets an LLM perceive:

- **what changed** through deterministic field descriptors;
- **how fresh it is** through source and projection watermarks;
- **what it may inspect** through allowed operations;
- **what instructions might apply** through procedure hints; and
- **what related context exists** through bounded semantic candidates.

Similarity is discovery, not trigger truth, permission, or authorization.

## Guardrails and neighbor protection

Admission occurs at registration, pull, context retrieval, and every downstream
action.

### Registration

- Require exactly one authorized board.
- Reject `ALL_ITEMS` when tenant policy requires an explicit item set.
- Cap item IDs at 256, projected columns at 32, event kinds at 16, and procedures at 8.
- Reject unknown, mirrored cross-account, or currently invisible IDs.
- Start at the current projected watermark unless a valid retained cursor is supplied.
- Estimate event rate and projected bytes from board synopses. Queue or reject a watch
  whose forecast exceeds the tenant's watch budget.
- Charge active watch count, projected event rate, retained bytes, and hint rate to an
  account ledger.

### Pull

- Require an exact watch point read and board-sequence range.
- Enforce `limit <= 500`, packet bytes `<= 1 MiB`, and a short timeout.
- Stop before a budget boundary and issue a receipt only for the returned range.
- Cap visibility checks and value artifact decryptions separately.
- Apply per-account token buckets and weighted fair scheduling.
- Return `THROTTLED` with retry guidance instead of borrowing another tenant's share.
- Coalesce webhook hints; hints never cause database work beyond a queue point read.

### Reaction

- Default `maxReactionDepth` is 3 and hard maximum is 8.
- Reject a repeated lineage hash in the last 32 causation edges.
- Cap downstream actions per delta, tool fanout, semantic calls, row estimates, bytes,
  and wall time.
- A watch cannot register or broaden another watch.
- Agent-generated writes require idempotency, expected object versions, transaction
  intents, and current leases where applicable.
- A circuit breaker pauses the watch after repeated policy denials, action failures, or
  self-trigger loops. Resume is explicit and audited.

### Deterministic reason codes

At minimum:

```text
TENANT_SCOPE_MISMATCH
BOARD_NOT_VISIBLE
WATCH_LIMIT_EXCEEDED
EVENT_RATE_BUDGET_EXCEEDED
INVALID_CURSOR
CURSOR_EXPIRED
WATCH_GENERATION_CHANGED
WATCH_PAUSED
POLICY_CHANGED
PURPOSE_REVOKED
VISIBILITY_CHANGED
PROJECTION_LAG_EXCEEDED
DELTA_LIMIT_EXCEEDED
PACKET_BUDGET_EXCEEDED
VALUE_ARTIFACT_BUDGET_EXCEEDED
REACTION_DEPTH_EXCEEDED
LINEAGE_LOOP_DETECTED
DOWNSTREAM_ACTION_BUDGET_EXCEEDED
SEMANTIC_MANIFEST_MISMATCH
VECTOR_BUDGET_EXCEEDED
```

The same canonical input, watch generation, policy version, visibility checkpoint,
watermarks, and budget state must produce the same admission decision.

## Performance check for boards with 1M+ rows

The dangerous design is a predicate such as “notify me when any item resembles this
sentence.” It requires evaluating every changed row against a probabilistic predicate,
has unstable selectivity, and can force vector work into the write path. Version 1
forbids it.

| Operation | Required access path | Bound | Full-scan response |
| --- | --- | --- | --- |
| Load watch | `(account_id, watch_id)` point read | 1 watch | Reject missing tenant key |
| Match exact item | `(account_id, board_id, item_id, watch_id)` | 256 item refs/watch | Reject larger set |
| Match event kind | `(account_id, board_id, event_kind, watch_id)` | 16 kinds/watch | Reject unknown kind |
| Pull deltas | `(account_id, board_id, sequence)` range | 500 deltas / 1 MiB | Stop at budget |
| Load cursor | `(account_id, watch_id)` point read | 1 cursor | Reject token mismatch |
| Ack receipt | `(account_id, watch_id, to_sequence, expiry)` | 1 receipt | Reject missing receipt |
| Replay | Retained board-sequence range | Policy event cap | Return `CURSOR_EXPIRED` |
| Semantic context | Tenant/model/manifest HNSW | `topK <= 32` | Underfill; no exact fallback |
| Audit history | `(account_id, watch_id, created_at)` | Cursor page | Reject offset pagination |

Specific rules:

- Never reconstruct a cursor with `SELECT ... FROM items WHERE board_id = ?`.
- Never filter an unbounded delta range with JSONPath, regex, or `unnest` after read.
- `changed_field_manifest_json` is an output artifact, not a watch-filter index.
- `ALL_ITEMS` means all **future deltas** on one board, not a snapshot of existing rows.
- Initial state must be obtained from a separate bounded snapshot API with explicit
  pagination and budget; watch registration does not return board contents.
- Do not use offset pagination. Cursors bind board, sequence, watch generation,
  account, principal, purpose, visibility epoch, and expiry.
- Maintain account-leading statistics for projected event rate and packet size. Never
  run `COUNT(*)` over a board during admission.
- When retention has removed required deltas, return the retained floor and an explicit
  recovery contract. Do not silently skip to “now.”

## Availability, consistency, and failure behavior

The 99.99% availability target applies independently to source writes and watch reads.
The asynchronous path protects the primary transaction SLO:

- Board writes depend only on the local outbox insert, not projector, webhook, vector,
  or LLM availability.
- Projectors are idempotent by `(account_id, source_event_id)` and resume from durable
  account/board checkpoints.
- Pull serves only through the projected watermark and reports source lag. It never
  labels stale projection as current.
- Webhook failure does not affect cursor durability. Hints retry with bounded,
  jittered schedules and expire; agents may always pull.
- Region failover fences old sequence allocators. Gaps are allowed, but two committed
  events cannot receive the same board sequence.
- A policy or visibility service outage fails closed for value artifacts and
  procedures. Metadata delivery may continue only when a predeclared enterprise policy
  explicitly permits it.
- Audit append failure fails closed for registration, pull-receipt issuance,
  acknowledgement, and downstream actions. Telemetry loss does not masquerade as audit.

Consistency options are explicit:

- `PROJECTED`: return immediately through the current projected watermark.
- `AT_LEAST_SEQUENCE`: wait within a bounded timeout for one source sequence; otherwise
  return current watermarks and `PROJECTION_LAG_EXCEEDED`.

There is no unbounded “wait until current” mode.

## Audit and replay

Canonical audit inputs include:

- authenticated account, principal, purpose, and request;
- watch ID, generation, scope hash, and status;
- cursor hash, requested and delivered sequence bounds;
- source and projected watermarks;
- policy, visibility, redaction, procedure, and vector manifest versions;
- packet delta-set hash and byte/count budgets;
- reaction root, parent, depth, and lineage window hash;
- admission decision and ordered reason codes; and
- previous audit event hash.

Raw values, prompts, embeddings, cursor tokens, receipt tokens, and webhook secrets are
never placed in audit rows. Audit chains are sharded inside one account to avoid a
tenant-wide serialization hotspot. Each shard has a monotonic sequence and signed
checkpoint roots; replay verifies both chain continuity and checkpoint inclusion.

A deterministic support replay can prove:

1. the source mutation and outbox event committed together;
2. the projector covered the event without skipping its sequence;
3. the watch scope and generation matched the delta;
4. current policy allowed each released field;
5. the pull packet hash equals the recorded delta set;
6. acknowledgement referenced a live receipt and expected cursor; and
7. any resulting action descended from the recorded causation chain.

Replay explains database decisions. It does not re-run an LLM or claim that the
agent's probabilistic interpretation was inevitable.

## Rollout

1. **Observe:** write source outbox events and compare source/projected watermarks
   without exposing watches.
2. **Internal pull:** enable exact board/item/kind watches for first-party agents with
   metadata-only packets and strict budgets.
3. **Shadow policy:** run delivery visibility checks and audit decisions while keeping
   values redacted.
4. **Open API preview:** expose register, pull, acknowledgement, pause, and watermarks;
   no webhook hints or downstream procedure bindings.
5. **Hint delivery:** add coalesced metadata-only webhook hints after pull durability
   and replay SLOs are proven.
6. **Procedure hints:** release audited procedure applicability references, still
   requiring fresh plan verification and governed actions.
7. **Semantic context:** add post-delivery tenant-partitioned HNSW retrieval with
   separate budgets and watermarks.
8. **Enterprise scale:** tune account partitions, hot-board isolation, retention
   classes, and regional failover against 1M+ row board workloads.

Rollback pauses new registrations and hint emission first. Existing cursors and source
events remain durable and readable under retention policy; disabling a projector never
deletes source evidence.

## Acceptance criteria

- Every table, primary key, foreign key, unique constraint, operational index, queue
  claim, and query path is tenant-scoped by `account_id`.
- A source row mutation and outbox event are atomically committed.
- Projector retry creates exactly one delta for a source event.
- A consumer crash before acknowledgement redelivers the same stable delta IDs.
- Two concurrent acknowledgements allow one compare-and-set winner and one typed
  conflict; the cursor never moves backward.
- Revoking a principal after registration prevents the next pull from releasing data.
- Replacing watch scope increments generation and fences old cursor and receipt tokens.
- Projection lag is visible and never represented as source freshness.
- A webhook body contains no changed values and cannot advance a cursor.
- Reaction depth, lineage loop, packet, value, semantic, and downstream action budgets
  are enforced before expensive work.
- Semantic underfill never triggers a cross-tenant, cross-manifest, or exact scan.
- An expired cursor returns `CURSOR_EXPIRED` and performs no board backfill.
- Explain plans for a 1M+ row board use account/board/sequence or exact-item indexes;
  no plan scans the board item table.
- TypeScript contracts type-check, GraphQL SDL parses, SQL DDL parses, and invariant
  checks confirm account-leading keys and RLS coverage.

## Product decision

Build a durable change-watch plane before adding autonomous reactive execution.
mondayDB should make committed changes cheap to observe, difficult to misuse, and easy
to replay. The watch tells an agent **that an authorized deterministic change
occurred**, with bounded metadata and explicit freshness. Semantic retrieval helps the
agent understand related context; procedural memory suggests applicable instructions;
governed actions decide whether anything may happen next.

That separation preserves the core promise: probabilistic agents can move quickly
without making mondayDB's tenancy, consistency, or cost behavior probabilistic.
