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
  asynchronous. Every authorized watch response reports source and projected
  watermarks and lag; pre-authorization failures expose none.
- **At-least-once delivery:** retries may repeat a delta. Stable `delta_id`,
  `event_hash`, persisted idempotent responses, and pull receipts make consumer
  handling deterministic.
- **No false global order:** ordering is monotonic only within
  `(account_id, board_id)`. Version 1 gives each watch exactly one board.
- **Fresh authorization:** registration permission does not grant perpetual access.
  Pull and context retrieval re-evaluate current purpose, policy, redaction, consent,
  and revocation. Acknowledgement authenticates the current caller and validates the
  issuance-time receipt, but does not re-release or reauthorize delivered values.
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
metadata, the immutable classification/redaction schema references observed by the
transaction, and encrypted payload references. It does not contain embeddings.

A **change delta** is a canonical projection of one source event. It contains bounded
metadata, changed-field descriptors, source-time classification labels, semantic journal
pointers, and hashes. Sensitive values remain in separately authorized artifacts.

A **watch cursor** is the last acknowledged board change sequence for one watch
generation. The sequence is allocated at the board partition's serialization point.
The board-local allocator lock is held until commit or abort, so a later sequence
cannot become visible before an earlier committed sequence. Aborted transactions do
not publish source events. Ordering is serialization order, not wall-clock order.

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
- new registration at an atomically captured `NOW` source watermark;
- continued pull from an existing watch's still-retained cursor;
- pull packets of at most 500 deltas and 1 MiB;
- monotonic compare-and-set acknowledgement;
- pause and resume with generation-fenced capabilities;
- optional metadata-only webhook hints;
- reaction lineage and loop-containment metadata; and
- bounded semantic context retrieval after deterministic delivery.

Version 1 rejects:

- account-wide and multi-board watches;
- view, formula, natural-language, regex, vector, or arbitrary JSON trigger predicates;
- new-watch historical replay or unbounded existing-watch replay;
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
  boardId: string;
  itemScope: WatchItemScope;
  projectedColumnIds: string[];
  eventKinds: ChangeEventKind[];
  includeValueArtifacts: boolean;
}

interface WatchDeliveryBudget {
  maxDeltasPerPull: number;
  maxEventsExamined: number;
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
  recordedAt: IsoTimestamp;
  eventKind: ChangeEventKind;
  objectType: "BOARD" | "ITEM" | "COLUMN";
  objectId: string;
  subjectItemId?: string;
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
  maxEventsExamined: number;
  maxPacketBytes: DecimalString;
  expectedWatchGeneration: DecimalString;
  causationCapabilityToken?: string;
  consistency:
    | { mode: "PROJECTED" }
    | { mode: "AT_LEAST_SEQUENCE"; sequence: DecimalString };
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
  scannedThroughSequence?: DecimalString;
  sourceWatermark?: DecimalString;
  projectedWatermark?: DecimalString;
  projectionLagEvents?: DecimalString;
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
  pullReceiptToken: string;
  consumerStateHash: string;
}

interface AcknowledgeChangeDeltasResult {
  accountId: string;
  requestId: string;
  watchId: string;
  decision: "ACKNOWLEDGED" | "ALREADY_ACKNOWLEDGED" | "CONFLICT" | "REJECTED";
  acknowledgedSequence?: DecimalString;
  cursorToken?: string;
  auditEventId: string;
}

interface SemanticContextRequest extends TenantScope {
  requestId: string;
  watchId: string;
  deltaId: string;
  pullReceiptToken: string;
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
  authorizedPurposeIds: readonly string[];
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
  if (!auth.authorizedPurposeIds.includes(input.purposeId)) {
    throw new Error("PURPOSE_NOT_AUTHORIZED");
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
  if (
    !Number.isInteger(input.maxEventsExamined) ||
    input.maxEventsExamined < input.limit ||
    input.maxEventsExamined > Math.min(policy.maxEventsExamined, 2000)
  ) {
    throw new Error("EVENT_SCAN_LIMIT_EXCEEDED");
  }
  if (
    !/^[1-9][0-9]*$/.test(input.maxPacketBytes) ||
    BigInt(input.maxPacketBytes) > 1048576n ||
    BigInt(input.maxPacketBytes) > BigInt(policy.maxPacketBytes)
  ) {
    throw new Error("PACKET_BUDGET_EXCEEDED");
  }
  if (
    !Number.isInteger(policy.maxReactionDepth) ||
    policy.maxReactionDepth < 0 ||
    policy.maxReactionDepth > 8
  ) {
    throw new Error("INVALID_REACTION_POLICY");
  }
  if (
    !Number.isInteger(policy.timeoutMs) ||
    policy.timeoutMs < 1 ||
    input.consistency.mode === "AT_LEAST_SEQUENCE" && policy.timeoutMs > 5000
  ) {
    throw new Error("INVALID_TIMEOUT");
  }
}
```

These examples are defense in depth. The storage adapter must still bind
`account_id = auth.accountId` in every statement; validating an object once is not a
substitute for tenant-leading SQL predicates and row-level security. Version 1 permits
only the owning principal to pull a watch: after the point read, the resolver must also
verify `watch.ownerPrincipalId === auth.principalId` and
`watch.purposeId === input.purposeId`. Delegation requires a future explicit,
tenant-scoped grant; it is never inferred from account membership.

Reaction lineage is not accepted as caller-authored JSON. If
`causationCapabilityToken` is absent, the server creates a root causation at depth
zero. If present, it verifies the signed token, point-reads the server-side causation
record, and derives root, parent, depth, and recent lineage hashes. Semantic context is
different: its lineage is always derived from the delivered delta and can never start a
new root. Forged or expired capabilities fail before downstream work.

## SQL row-store schema

The SQL is illustrative PostgreSQL. Production mondayDB may map the same logical
contracts to its hybrid row store. UUIDs are server-minted. Artifact payloads are
encrypted and stored separately from searchable metadata. The `vector` extension is
provisioned by infrastructure before this migration; API roles cannot create
extensions.

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

CREATE TABLE agent_change_classification_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  redaction_schema_version TEXT NOT NULL,
  classification_manifest_hash TEXT NOT NULL,
  encrypted_manifest_artifact_id UUID NOT NULL,
  canonicalization_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  retain_until TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  UNIQUE (account_id, snapshot_id, redaction_schema_version),
  UNIQUE (account_id, snapshot_id, redaction_schema_version, board_id),
  CHECK (retain_until > created_at)
);

CREATE TABLE agent_change_source_outbox (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  board_change_sequence BIGINT NOT NULL CHECK (board_change_sequence > 0),
  source_event_id UUID NOT NULL,
  source_transaction_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  event_kind agent_change_event_kind NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('BOARD', 'ITEM', 'COLUMN')),
  object_id BIGINT NOT NULL,
  subject_item_id BIGINT,
  object_version BIGINT NOT NULL CHECK (object_version > 0),
  changed_column_ids BIGINT[] NOT NULL DEFAULT '{}',
  encrypted_payload_artifact_id UUID,
  payload_hash TEXT NOT NULL,
  classification_snapshot_id UUID NOT NULL,
  redaction_schema_version TEXT NOT NULL,
  canonicalization_version TEXT NOT NULL,
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
  UNIQUE (account_id, source_transaction_id, source_event_id),
  FOREIGN KEY (
    account_id,
    classification_snapshot_id,
    redaction_schema_version,
    board_id
  ) REFERENCES agent_change_classification_snapshot
      (account_id, snapshot_id, redaction_schema_version, board_id),
  CHECK (
    (
      event_kind IN (
        'ITEM_CREATED',
        'ITEM_UPDATED',
        'ITEM_ARCHIVED',
        'ITEM_RESTORED',
        'ITEM_DELETED',
        'COLUMN_VALUE_CHANGED'
      )
      AND object_type = 'ITEM'
      AND subject_item_id = object_id
    )
    OR (
      event_kind IN ('COLUMN_CREATED', 'COLUMN_UPDATED', 'COLUMN_DELETED')
      AND object_type = 'COLUMN'
      AND subject_item_id IS NULL
    )
    OR (
      event_kind = 'BOARD_STRUCTURE_CHANGED'
      AND object_type = 'BOARD'
      AND subject_item_id IS NULL
    )
  )
);

CREATE INDEX agent_change_source_projector_idx
  ON agent_change_source_outbox
    (account_id, board_id, board_change_sequence, source_event_id);

CREATE TABLE agent_change_projection_checkpoint (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  projected_through_sequence BIGINT NOT NULL CHECK (projected_through_sequence >= 0),
  source_watermark BIGINT NOT NULL CHECK (source_watermark >= 0),
  retained_from_sequence BIGINT NOT NULL CHECK (retained_from_sequence >= 0),
  projector_version TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, board_id),
  CHECK (retained_from_sequence <= projected_through_sequence),
  CHECK (projected_through_sequence <= source_watermark)
);

CREATE TABLE agent_change_delta (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  board_change_sequence BIGINT NOT NULL CHECK (board_change_sequence > 0),
  delta_id UUID NOT NULL,
  source_event_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  event_kind agent_change_event_kind NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type IN ('BOARD', 'ITEM', 'COLUMN')),
  object_id BIGINT NOT NULL,
  subject_item_id BIGINT,
  object_version BIGINT NOT NULL CHECK (object_version > 0),
  changed_column_ids BIGINT[] NOT NULL DEFAULT '{}',
  changed_field_manifest_json JSONB NOT NULL,
  semantic_journal_refs_json JSONB NOT NULL DEFAULT '[]',
  classification_labels TEXT[] NOT NULL DEFAULT '{}',
  classification_snapshot_id UUID NOT NULL,
  redaction_schema_version TEXT NOT NULL,
  redaction_envelope_hash TEXT NOT NULL,
  source_visibility_epoch BIGINT NOT NULL CHECK (source_visibility_epoch > 0),
  event_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  canonicalization_version TEXT NOT NULL,
  projector_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, board_id, board_change_sequence),
  UNIQUE (account_id, delta_id),
  UNIQUE (account_id, source_event_id),
  FOREIGN KEY (account_id, board_id, board_change_sequence)
    REFERENCES agent_change_source_outbox
      (account_id, board_id, board_change_sequence),
  FOREIGN KEY (
    account_id,
    classification_snapshot_id,
    redaction_schema_version,
    board_id
  ) REFERENCES agent_change_classification_snapshot
      (account_id, snapshot_id, redaction_schema_version, board_id),
  CHECK (jsonb_typeof(changed_field_manifest_json) = 'array'),
  CHECK (jsonb_typeof(semantic_journal_refs_json) = 'array'),
  CHECK (
    (
      event_kind IN (
        'ITEM_CREATED',
        'ITEM_UPDATED',
        'ITEM_ARCHIVED',
        'ITEM_RESTORED',
        'ITEM_DELETED',
        'COLUMN_VALUE_CHANGED'
      )
      AND object_type = 'ITEM'
      AND subject_item_id = object_id
    )
    OR (
      event_kind IN ('COLUMN_CREATED', 'COLUMN_UPDATED', 'COLUMN_DELETED')
      AND object_type = 'COLUMN'
      AND subject_item_id IS NULL
    )
    OR (
      event_kind = 'BOARD_STRUCTURE_CHANGED'
      AND object_type = 'BOARD'
      AND subject_item_id IS NULL
    )
  )
);

CREATE INDEX agent_change_delta_item_idx
  ON agent_change_delta
    (account_id, board_id, subject_item_id, board_change_sequence)
  WHERE subject_item_id IS NOT NULL;

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
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  canonicalization_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  visibility_epoch BIGINT NOT NULL CHECK (visibility_epoch > 0),
  receipt_token_hash TEXT NOT NULL,
  request_id UUID NOT NULL,
  request_payload_hash TEXT NOT NULL,
  encrypted_response_artifact_id UUID NOT NULL,
  response_hash TEXT NOT NULL,
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

CREATE TABLE agent_change_pull_request (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  requested_watch_id UUID NOT NULL,
  authenticated_principal_id UUID NOT NULL,
  requested_purpose_id UUID NOT NULL,
  request_payload_hash TEXT NOT NULL,
  request_state TEXT NOT NULL CHECK (request_state IN ('PROCESSING', 'COMPLETE')),
  terminal_decision TEXT,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  encrypted_response_artifact_id UUID,
  response_hash TEXT,
  pull_receipt_id UUID,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, request_id),
  FOREIGN KEY (account_id, pull_receipt_id)
    REFERENCES agent_change_pull_receipt (account_id, pull_receipt_id),
  CHECK (
    (
      request_state = 'PROCESSING'
      AND terminal_decision IS NULL
      AND encrypted_response_artifact_id IS NULL
      AND response_hash IS NULL
      AND completed_at IS NULL
    )
    OR (
      request_state = 'COMPLETE'
      AND terminal_decision IS NOT NULL
      AND encrypted_response_artifact_id IS NOT NULL
      AND response_hash IS NOT NULL
      AND completed_at IS NOT NULL
    )
  )
);

CREATE INDEX agent_change_pull_request_lease_idx
  ON agent_change_pull_request
    (account_id, request_state, lease_expires_at, request_id)
  WHERE request_state = 'PROCESSING';

CREATE TABLE agent_change_context_request (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  requested_watch_id UUID NOT NULL,
  requested_delta_id UUID NOT NULL,
  authenticated_principal_id UUID NOT NULL,
  requested_purpose_id UUID NOT NULL,
  request_payload_hash TEXT NOT NULL,
  request_state TEXT NOT NULL CHECK (request_state IN ('PROCESSING', 'COMPLETE')),
  terminal_decision TEXT,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  encrypted_response_artifact_id UUID,
  response_hash TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, request_id),
  CHECK (
    (
      request_state = 'PROCESSING'
      AND terminal_decision IS NULL
      AND encrypted_response_artifact_id IS NULL
      AND response_hash IS NULL
      AND completed_at IS NULL
    )
    OR (
      request_state = 'COMPLETE'
      AND terminal_decision IS NOT NULL
      AND encrypted_response_artifact_id IS NOT NULL
      AND response_hash IS NOT NULL
      AND completed_at IS NOT NULL
    )
  )
);

CREATE INDEX agent_change_context_request_lease_idx
  ON agent_change_context_request
    (account_id, request_state, lease_expires_at, request_id)
  WHERE request_state = 'PROCESSING';

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

CREATE TABLE agent_change_hint_work (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  target_projected_watermark BIGINT NOT NULL
    CHECK (target_projected_watermark >= 0),
  next_watch_id UUID,
  work_state TEXT NOT NULL CHECK (work_state IN ('PENDING', 'LEASED')),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_number SMALLINT NOT NULL DEFAULT 0
    CHECK (attempt_number BETWEEN 0 AND 32),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, board_id)
);

CREATE INDEX agent_change_hint_work_queue_idx
  ON agent_change_hint_work
    (account_id, work_state, lease_expires_at, board_id);

CREATE TABLE agent_change_webhook_hint_state (
  account_id BIGINT NOT NULL,
  watch_id UUID NOT NULL,
  watch_generation BIGINT NOT NULL CHECK (watch_generation > 0),
  projected_watermark BIGINT NOT NULL CHECK (projected_watermark >= 0),
  endpoint_ref_id UUID NOT NULL,
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('PENDING', 'DELIVERED')),
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 0 AND 12),
  not_before TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  response_class TEXT,
  hint_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, watch_id),
  FOREIGN KEY (account_id, watch_id)
    REFERENCES agent_change_watch (account_id, watch_id),
  CHECK (expires_at > created_at)
);

CREATE INDEX agent_change_webhook_hint_queue_idx
  ON agent_change_webhook_hint_state
    (account_id, delivery_state, not_before, watch_id)
  WHERE delivery_state = 'PENDING';

CREATE TABLE agent_change_audit_head (
  account_id BIGINT NOT NULL,
  audit_shard SMALLINT NOT NULL CHECK (audit_shard BETWEEN 0 AND 63),
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_event_hash TEXT NOT NULL,
  head_version BIGINT NOT NULL CHECK (head_version > 0),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_shard)
);

CREATE TABLE agent_change_audit_event (
  account_id BIGINT NOT NULL,
  audit_shard SMALLINT NOT NULL CHECK (audit_shard BETWEEN 0 AND 63),
  audit_sequence BIGINT NOT NULL CHECK (audit_sequence >= 0),
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
  previous_audit_sequence BIGINT CHECK (previous_audit_sequence >= 0),
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  canonicalization_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_shard, audit_sequence),
  UNIQUE (account_id, audit_event_id),
  UNIQUE (account_id, audit_shard, event_hash),
  UNIQUE (
    account_id,
    audit_shard,
    audit_sequence,
    event_hash
  ),
  FOREIGN KEY (
    account_id,
    audit_shard,
    previous_audit_sequence,
    previous_event_hash
  ) REFERENCES agent_change_audit_event
      (account_id, audit_shard, audit_sequence, event_hash),
  CHECK (
    (
      audit_sequence = 0
      AND previous_audit_sequence IS NULL
      AND previous_event_hash IS NULL
      AND event_type = 'GENESIS'
    )
    OR (
      audit_sequence > 0
      AND previous_audit_sequence = audit_sequence - 1
      AND previous_event_hash IS NOT NULL
    )
  )
);

ALTER TABLE agent_change_audit_head
  ADD FOREIGN KEY (
    account_id,
    audit_shard,
    head_sequence,
    head_event_hash
  ) REFERENCES agent_change_audit_event
      (account_id, audit_shard, audit_sequence, event_hash);

CREATE INDEX agent_change_audit_watch_idx
  ON agent_change_audit_event
    (account_id, watch_id, created_at, audit_event_id);

CREATE TABLE agent_change_audit_checkpoint (
  account_id BIGINT NOT NULL,
  audit_shard SMALLINT NOT NULL CHECK (audit_shard BETWEEN 0 AND 63),
  audit_sequence BIGINT NOT NULL CHECK (audit_sequence > 0),
  event_hash TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  signer_key_id TEXT NOT NULL,
  signature_bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_shard, audit_sequence),
  UNIQUE (account_id, audit_shard, checkpoint_hash),
  FOREIGN KEY (account_id, audit_shard, audit_sequence, event_hash)
    REFERENCES agent_change_audit_event
      (account_id, audit_shard, audit_sequence, event_hash)
);

CREATE TABLE agent_change_vector_manifest (
  account_id BIGINT NOT NULL,
  model_id TEXT NOT NULL,
  manifest_version TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions = 1536),
  distance_metric TEXT NOT NULL CHECK (distance_metric = 'COSINE'),
  segment_set_id UUID NOT NULL,
  canonicalization_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('BUILDING', 'SEALED', 'RETIRED')),
  sealed_watermark BIGINT NOT NULL CHECK (sealed_watermark >= 0),
  manifest_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, model_id, manifest_version),
  UNIQUE (account_id, segment_set_id)
);

CREATE TABLE agent_change_vector_segment (
  account_id BIGINT NOT NULL,
  model_id TEXT NOT NULL,
  manifest_version TEXT NOT NULL,
  segment_ordinal SMALLINT NOT NULL CHECK (segment_ordinal BETWEEN 0 AND 63),
  vector_segment_id UUID NOT NULL,
  encrypted_index_artifact_id UUID NOT NULL,
  vector_count BIGINT NOT NULL CHECK (vector_count >= 0),
  hnsw_m SMALLINT NOT NULL CHECK (hnsw_m BETWEEN 4 AND 32),
  hnsw_ef_construction SMALLINT NOT NULL
    CHECK (hnsw_ef_construction BETWEEN 16 AND 256),
  index_format TEXT NOT NULL,
  index_hash TEXT NOT NULL,
  plan_attestation_key_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('BUILDING', 'SEALED', 'RETIRED')),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id,
    model_id,
    manifest_version,
    segment_ordinal
  ),
  UNIQUE (account_id, vector_segment_id),
  FOREIGN KEY (account_id, model_id, manifest_version)
    REFERENCES agent_change_vector_manifest
      (account_id, model_id, manifest_version)
);

CREATE INDEX agent_change_vector_segment_route_idx
  ON agent_change_vector_segment
    (account_id, model_id, manifest_version, status, segment_ordinal);

ALTER TABLE agent_change_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_column ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_event_kind ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_classification_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_source_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_projection_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_delta ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_pull_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_pull_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_context_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_procedure_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_hint_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_webhook_hint_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_head ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_vector_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_change_vector_segment ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent_change_watch FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_item FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_column FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_event_kind FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_classification_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_source_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_projection_checkpoint FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_delta FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_watch_cursor FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_pull_receipt FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_pull_request FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_context_request FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_procedure_binding FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_hint_work FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_webhook_hint_state FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_head FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_event FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_audit_checkpoint FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_vector_manifest FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_change_vector_segment FORCE ROW LEVEL SECURITY;

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

CREATE POLICY agent_change_classification_snapshot_tenant_policy
  ON agent_change_classification_snapshot
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

CREATE POLICY agent_change_pull_request_tenant_policy ON agent_change_pull_request
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_context_request_tenant_policy ON agent_change_context_request
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_procedure_tenant_policy
  ON agent_change_procedure_binding
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_hint_work_tenant_policy ON agent_change_hint_work
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_hint_tenant_policy ON agent_change_webhook_hint_state
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_audit_head_tenant_policy ON agent_change_audit_head
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_audit_tenant_policy ON agent_change_audit_event
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_audit_checkpoint_tenant_policy
  ON agent_change_audit_checkpoint
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_vector_manifest_tenant_policy
  ON agent_change_vector_manifest
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);

CREATE POLICY agent_change_vector_segment_tenant_policy
  ON agent_change_vector_segment
  USING (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', TRUE), '')::BIGINT);
```

### Physical layout

- Hash-partition row and audit tables by `account_id`. Version 1 does not add native
  time/sequence subpartitions because PostgreSQL uniqueness would then require the
  subpartition key in every ID constraint. mondayDB may compact account-owned physical
  segments behind the logical table while preserving the declared global tenant keys.
- Keep source outbox, cursor, and acknowledgement state in the ACID row path.
  Columnar storage may mirror delta metadata for aggregate observability, but it is not
  authoritative for delivery.
- Allocate `board_change_sequence` from a board-local counter at the authoritative
  partition's serialization point. Hold the allocator lock through transaction end;
  do not lease ranges. The source watermark is the greatest contiguously committed
  sequence, so a projector never advances over an unresolved transaction.
- Compact immutable delta segments only below the minimum retained acknowledged
  sequence plus enterprise retention. Compaction produces a signed manifest and audit
  event; it does not rewrite surviving event hashes.
- Retention is not pinned indefinitely by a silent consumer. When cursor lag exceeds
  `maxReplayEvents` or the retention class, a transaction records the retained floor,
  moves the watch to `CURSOR_EXPIRED`, emits an audit event, and permits compaction.
- Queue workers claim exact account-leading ranges. Cross-account queue scans require a
  privileged control-plane role and fair scheduling; application roles never receive
  that capability.
- Store only vector manifest and segment routing metadata in PostgreSQL. Production
  vector compute loads bounded, account-owned HNSW segments from encrypted artifacts;
  many logical segments share a compute process without sharing a graph or SQL
  relation. This avoids one PostgreSQL table per account while preserving physical ANN
  isolation. A pgvector adapter may materialize one temporary/dedicated relation per
  claimed segment for conformance testing, never as the global production catalog.

Application connections use a non-owner, non-`BYPASSRLS` role. A trusted gateway sets
`app.account_id` with transaction-local `SET LOCAL` after authenticating the request
and resets it on every pooled transaction. Request fields can never set this GUC.
Projectors use a separate least-privilege role scoped to explicitly claimed accounts.
`FORCE ROW LEVEL SECURITY` applies even to table owners; emergency administrative
roles are isolated, audited, and unavailable to API processes.

### Transaction boundaries

**Source commit**

1. Lock or validate the target board item version.
2. Apply the row mutation.
3. Read immutable classification snapshot and redaction schema versions in the same
   transaction.
4. Lock the board-local allocator and allocate the next serialization sequence.
5. Insert `agent_change_source_outbox` with snapshot, payload, and lineage hashes.
6. Append the source-capture audit event through the locked audit-shard head.
7. Commit once, releasing both allocator locks.

Embedding, webhook, semantic retrieval, and LLM work are not allowed in this
transaction.

Registration with `NOW` locks the same board allocator long enough to capture its
contiguous source watermark. That watermark becomes `start_sequence`, even when
projection is behind. Pull never returns sequences at or below it; it may wait within a
declared consistency timeout for projection to catch up. This prevents pre-registration
changes from leaking into a new watch.

**Projection**

1. Claim a bounded `(account_id, board_id, sequence range)`.
2. Load the immutable classification snapshot and redaction schema versions captured
   by each source event.
3. Build canonical field descriptors and semantic journal pointers with the declared
   canonicalization version.
4. Insert `agent_change_delta` idempotently by source event.
5. Advance `agent_change_projection_checkpoint` and upsert
   `agent_change_hint_work.target_projected_watermark` in the same transaction.
6. Append an audit event through a locked shard head and commit.

Projection may lag without blocking board writes. If lag exceeds policy, hints stop,
pulls report `THROTTLED`, and operators scale or isolate the projector. The service
does not skip source events to appear current.

Projection does not enumerate watches. A separate fairly scheduled hint worker reads a
bounded page of active watches from
`(account_id, board_id, status, watch_id)` after a board watermark advances. Admission
enforces a hard active-watch fanout per account/board. The worker compare-and-sets the
single `agent_change_webhook_hint_state` row for each watch to the newest watermark,
coalescing intermediate changes. If it exhausts its page or tenant hint budget, it
persists its account-leading continuation and yields; pull durability is unaffected.

**Pull and acknowledge**

1. Resolve the authenticated account, principal, purpose, and current policy.
2. Point-read the watch and cursor by `(account_id, watch_id)`.
3. Verify owner, exact purpose, generation, status, cursor token, retention, and
   reaction lineage.
4. Reserve packet and visibility-check budgets.
5. Range-read at most `maxEventsExamined` deltas by
   `(account_id, board_id, sequence)`, tracking `scannedThroughSequence`, and apply
   bounded exact subject-item, event-kind, and column projection filters.
6. Materialize only authorized value artifacts; replace denied fields with typed
   redaction descriptors.
7. Persist a pull receipt for the entire scanned range, including an empty delta set,
   plus an encrypted canonical response and audit decision; then return the packet.
8. On acknowledgement, lock the cursor, validate the live receipt and expected
   sequence, advance to `scannedThroughSequence`, append an audit event through the
   shard head, and commit once.

The cursor never advances during pull. A consumer crash therefore repeats a packet
rather than losing it. A retry with the same `(account_id, request_id)` and payload hash
returns the persisted response while its receipt and authorization checkpoint remain
valid. A payload mismatch is an idempotency conflict; a now-revoked authorization
returns a typed denial rather than replaying old values.

After account authentication and before watch lookup, pull inserts or claims
`agent_change_pull_request`. Every terminal outcome—including invalid watch/cursor,
paused, throttled, unauthorized, and empty—stores its canonical encrypted response and
hash. This makes failure retries deterministic without revealing whether an
unauthorized watch exists. In-flight duplicates wait briefly on the request lease or
return `REQUEST_IN_PROGRESS`; expired leases are safely reclaimed by payload hash.

`scannedThroughSequence` advances only after an event is conclusively a nonmatch or its
matching delta was included (possibly with typed field redactions). If count, byte,
visibility, or time budget would omit a matching event, scanning stops immediately
before that sequence. A single matching delta that cannot fit the hard metadata packet
limit returns `OVERSIZED_DELTA_REQUIRES_SNAPSHOT` and does not advance past it. Thus an
acknowledged scanned range can never skip an undelivered match.

Acknowledgement has no caller-selected target sequence: the receipt's exact
`scannedThroughSequence` is the only possible new cursor. It releases no new data and
validates the signed receipt's account, principal, purpose, generation, scanned range,
and expiry, but does not require that the principal still be allowed to read the
already delivered values. This lets a
consumer advance after a policy change without pinning retention. Expired receipts
require an audited re-pull or administrator-approved cursor reset; there is no silent
skip.

Scope creation locks the watch row and validates relational cardinality before commit:
`ALL_ITEMS` has zero item rows; `ITEM_SET` has 1–256; column rows are
0–32 with unique ordinals; event-kind rows are 1–16; procedure bindings are 0–8.
PostgreSQL deployments enforce the same rules with deferred constraint triggers, so a
partially written scope cannot become active. Version 1 scopes are immutable; changing
scope requires registering a new watch and revoking the old one.

## Open API GraphQL contract

`accountId` is explicit for audit and SDK clarity, but it is never trusted. Every
resolver compares it with the authenticated account before loading a watch. Cursor and
receipt tokens are opaque, signed, short-lived capabilities bound to account,
principal, purpose, watch generation, and issuance visibility epoch. Pull compares
that epoch with current visibility. Acknowledgement validates the issuance-time receipt
but deliberately does not compare its epoch with the current one.

```graphql
scalar DateTime
scalar Long

directive @oneOf on INPUT_OBJECT

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

enum AgentChangeWatchOperation {
  PAUSE
  RESUME
}

enum AgentChangeAcknowledgeDecision {
  ACKNOWLEDGED
  ALREADY_ACKNOWLEDGED
  CONFLICT
  REJECTED
}

enum AgentChangeObjectType {
  BOARD
  ITEM
  COLUMN
}

enum AgentChangedFieldOperation {
  SET
  CLEAR
  APPEND
  REMOVE
  STRUCTURE
}

enum AgentChangeOriginKind {
  USER
  AUTOMATION
  AGENT
  API
  SYSTEM
}

enum AgentAllowedNextOperation {
  RETRIEVE_CONTEXT
  PROPOSE_ACTION
  ACKNOWLEDGE
  ESCALATE
}

input AgentWatchAllItemsInput {
  enabled: Boolean!
}

input AgentWatchItemSetInput {
  itemIds: [ID!]!
}

input AgentWatchItemScopeInput @oneOf {
  all: AgentWatchAllItemsInput
  itemSet: AgentWatchItemSetInput
}

input AgentProjectedConsistencyInput {
  enabled: Boolean!
}

input AgentAtLeastSequenceConsistencyInput {
  sequence: Long!
}

input AgentChangeConsistencyInput @oneOf {
  projected: AgentProjectedConsistencyInput
  atLeastSequence: AgentAtLeastSequenceConsistencyInput
}

input AgentChangeWatchScopeInput {
  boardId: ID!
  items: AgentWatchItemScopeInput!
  projectedColumnIds: [ID!]!
  eventKinds: [AgentChangeEventKind!]!
  includeValueArtifacts: Boolean! = false
}

input AgentWatchDeliveryBudgetInput {
  maxDeltasPerPull: Int!
  maxEventsExamined: Int!
  maxPacketBytes: Long!
  maxReplayEvents: Long!
  maxProjectedColumns: Int!
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

input PullAgentChangeDeltasInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  watchId: ID!
  cursorToken: String!
  expectedWatchGeneration: Long!
  limit: Int!
  maxEventsExamined: Int!
  maxPacketBytes: Long!
  consistency: AgentChangeConsistencyInput!
  causationCapabilityToken: String
}

type AgentChangedField {
  accountId: ID!
  boardId: ID!
  columnId: ID!
  valueKind: String!
  operation: AgentChangedFieldOperation!
  beforeValueHash: String
  afterValueHash: String
  authorizedValueArtifactId: ID
  classificationLabels: [String!]!
}

type AgentChangeOrigin {
  originKind: AgentChangeOriginKind!
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
  recordedAt: DateTime!
  eventKind: AgentChangeEventKind!
  objectType: AgentChangeObjectType!
  objectId: ID!
  subjectItemId: ID
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
  allowedNextOperations: [AgentAllowedNextOperation!]!
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
  scannedThroughSequence: Long
  sourceWatermark: Long
  projectedWatermark: Long
  projectionLagEvents: Long
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
  pullReceiptToken: String!
  consumerStateHash: String!
}

type AcknowledgeAgentChangeDeltasPayload {
  accountId: ID!
  requestId: ID!
  watchId: ID!
  decision: AgentChangeAcknowledgeDecision!
  acknowledgedSequence: Long
  cursorToken: String
  auditEventId: ID!
}

input UpdateAgentChangeWatchStateInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  watchId: ID!
  expectedGeneration: Long!
  operation: AgentChangeWatchOperation!
  reason: String!
}

input AgentChangeContextInput {
  accountId: ID!
  principalId: ID!
  purposeId: ID!
  requestId: ID!
  watchId: ID!
  deltaId: ID!
  pullReceiptToken: String!
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
  objectType: AgentChangeObjectType!
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
}

type Mutation {
  registerAgentChangeWatch(
    input: RegisterAgentChangeWatchInput!
  ): RegisterAgentChangeWatchPayload!

  pullAgentChangeDeltas(
    input: PullAgentChangeDeltasInput!
  ): PullAgentChangeDeltasPayload!

  agentChangeContext(
    input: AgentChangeContextInput!
  ): AgentChangeContextPayload!

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
lower client limits never expand server limits. Pagination is cursor-only. `Long`
serializes as a canonical base-10 string, never a JSON number.

The router enforces `@oneOf`: item scope contains exactly one of `all` or `itemSet`,
and consistency contains exactly one of `projected` or `atLeastSequence`. `all.enabled`
and `projected.enabled` must be true; item IDs must be non-empty. Registration always
starts at the atomically captured `NOW` source watermark. The public state operation
accepts only `PAUSE` and `RESUME`. `POLICY_BLOCKED`,
`CURSOR_EXPIRED`, and `REVOKED` are server-controlled states and cannot be requested
by a client.

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

1. validate the watch and pull receipt against the current principal and purpose;
2. decrypt the receipt's bounded canonical response artifact, recompute its
   `delta_set_hash`, and verify that this exact delta ID and event hash were delivered;
3. point-read the delta by `(account_id, delta_id)` and re-check current visibility;
4. derive the same root causation from the delta, set the delta as parent, increment
   its server-recorded depth, and reject depth/lineage loops;
5. verify the requested sealed embedding manifest and account-owned segment set;
6. mint the query embedding server-side from redaction-safe text;
7. search at most four deterministically routed HNSW segments;
8. cap `topK <= 32`, `maxCandidates <= 256`, `ef_search`, bytes, and timeout;
9. post-filter every candidate against authoritative current visibility;
10. return an underfilled result rather than cross segments or exact-scan fallback; and
11. record receipt, lineage, manifest, plan, candidate, visibility, and result hashes.

Before watch or delta lookup, the mutation claims
`agent_change_context_request` by `(account_id, request_id)` and payload hash. Every
success, denial, throttle, underfill, and vector failure persists one encrypted
canonical response. Retries return that response while its authorization checkpoint is
valid; payload mismatch is an idempotency conflict. This bounds duplicate ANN cost and
produces one logical audit outcome under gateway retries.

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

The manifest fixes 1,536 dimensions and cosine distance. A mismatched model is rejected
before ANN work. `agent_change_vector_segment` binds each manifest to at most 64
immutable account-owned HNSW artifacts. Deterministic routing by board/object class
selects no more than four; graphs never mix accounts. The production vector service
loads these segments into shared compute but separate graph address spaces, avoiding a
PostgreSQL relation per account.

Every vector response includes a signed plan attestation over account, model, manifest,
segment IDs and hashes, index format, `planKind = HNSW`, `ef_search <= 128`,
`maxCandidates <= 256`, and `exactFallback = false`. The adapter verifies the
attestation before releasing candidates. Missing/retired segments, an unavailable HNSW
index, or any non-HNSW plan fails closed. The pgvector conformance adapter materializes
only the claimed account segment with `vector(1536)` plus
`vector_cosine_ops`, sets `hnsw.iterative_scan = strict_order` and
`hnsw.max_scan_tuples <= 256`, and rejects `EXPLAIN (FORMAT JSON)` unless the expected
HNSW index scan is present. Sequential scan is never a runtime fallback.

## Guardrails and neighbor protection

Admission occurs at registration, pull, context retrieval, and every downstream
action.

### Registration

- Require exactly one authorized board.
- Reject `ALL_ITEMS` when tenant policy requires an explicit item set.
- Cap item IDs at 256, projected columns at 32, event kinds at 16, and procedures at 8.
- Reject unknown, mirrored cross-account, or currently invisible IDs.
- Atomically capture the current contiguous source watermark as `start_sequence`.
- Estimate event rate and projected bytes from board synopses. Queue or reject a watch
  whose forecast exceeds the tenant's watch budget.
- Charge active watch count, projected event rate, retained bytes, and hint rate to an
  account ledger.
- Enforce a policy hard cap on active watches per account/board (default 1,024,
  absolute maximum 4,096), so hint matching has a finite fanout.

### Pull

- Require an exact watch point read and board-sequence range.
- Enforce `limit <= 500`, `maxEventsExamined <= 2,000`, packet bytes `<= 1 MiB`,
  maximum cursor lag, and a short timeout.
- Stop at the first count, byte, visibility, or time boundary. Issue a receipt for the
  scanned range even when no delta matched, so sparse filters advance without an
  unbounded search.
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
EVENT_SCAN_LIMIT_EXCEEDED
VALUE_ARTIFACT_BUDGET_EXCEEDED
REACTION_DEPTH_EXCEEDED
LINEAGE_LOOP_DETECTED
DOWNSTREAM_ACTION_BUDGET_EXCEEDED
SEMANTIC_MANIFEST_MISMATCH
VECTOR_BUDGET_EXCEEDED
OVERSIZED_DELTA_REQUIRES_SNAPSHOT
REQUEST_IN_PROGRESS
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
| Match exact item | `(account_id, board_id, subject_item_id, sequence)` plus exact watch item set | 2,000 events examined | Stop at scan bound |
| Match event kind | `(account_id, board_id, event_kind, watch_id)` | 16 kinds/watch | Reject unknown kind |
| Pull deltas | `(account_id, board_id, sequence)` range | 2,000 examined; 500 returned; 1 MiB | Receipt covers scanned range |
| Load cursor | `(account_id, watch_id)` point read | 1 cursor | Reject token mismatch |
| Ack receipt | `(account_id, watch_id, to_sequence, expiry)` | 1 receipt | Reject missing receipt |
| Replay | Retained board-sequence range | Policy event cap | Return `CURSOR_EXPIRED` |
| Semantic context | Account/model/manifest HNSW segment route | 4 segments; `topK <= 32` | Underfill; no exact fallback |
| Audit history | `(account_id, watch_id, created_at)` | Cursor page | Reject offset pagination |

Specific rules:

- Never reconstruct a cursor with `SELECT ... FROM items WHERE board_id = ?`.
- Never filter an unbounded delta range with JSONPath, regex, or `unnest` after read.
- `changed_field_manifest_json` is an output artifact, not a watch-filter index.
- `subject_item_id` is populated only when an event belongs to one item. Item-scoped
  watches reject board/column events with no subject; they never compare the overloaded
  `object_id`.
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

- Board writes depend on local row mutation, immutable classification-snapshot lookup,
  board allocator lock, outbox insert, and one sharded audit-head append. These are
  co-located in the replicated row partition; writes do not depend on projector,
  webhook, vector, policy network calls, or LLM availability.
- Projectors are idempotent by `(account_id, source_event_id)` and resume from durable
  account/board checkpoints.
- Pull serves only through the projected watermark and reports source lag. It never
  labels stale projection as current.
- Webhook failure does not affect cursor durability. Hints retry with bounded,
  jittered schedules and expire; agents may always pull.
- Region failover fences old board allocators through the row-store consensus term.
  A later visible sequence cannot overtake an earlier committed sequence, and two
  committed events cannot receive the same sequence.
- A policy or visibility service outage fails closed for value artifacts and
  procedures. Metadata delivery may continue only when a predeclared enterprise policy
  explicitly permits it.
- Audit append failure fails closed for source mutation, registration, pull-response
  issuance, acknowledgement, and downstream actions. Source-audit shards are selected
  by board hash to avoid an account-wide head; allocator and audit-lock p99 contention
  are explicit write-SLO budgets. Telemetry loss does not masquerade as audit.

Classification snapshots are immutable and retained at least as long as every
referencing source event, delta, pull response, and audit checkpoint. Compaction first
proves zero tenant-scoped references, then records a signed retention manifest. A
missing snapshot is a corruption alarm, never a request to use current metadata.

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

An audit append locks `agent_change_audit_head` for the exact account/shard, verifies
its sequence, hash, and version, inserts the sole successor with
`previous_audit_sequence` and `previous_event_hash`, then compare-and-sets the head in
the same transaction. The self-referencing composite foreign key binds the predecessor
hash, while the sequence primary key prevents two successors. Sequence zero is a
persisted `GENESIS` event inserted before its matching head row. A signing
worker periodically commits `agent_change_audit_checkpoint`; signatures cover account,
shard, sequence, event hash, canonicalization version, and deployment identity.

All hashes use length-prefixed canonical CBOR, SHA-256, sorted reason-code enums, UTC
timestamps with fixed precision, and explicit schema/canonicalization versions.
Unknown versions fail replay rather than falling back to ambient JSON serialization.

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
7. **Semantic context:** add post-delivery account-owned segmented HNSW retrieval with
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
- Watch scope is immutable; registering a replacement and revoking the old watch fences
  the old watch's cursor and receipt tokens.
- Projection lag is visible and never represented as source freshness.
- A webhook body contains no changed values and cannot advance a cursor.
- Reaction depth, lineage loop, packet, value, semantic, and downstream action budgets
  are enforced before expensive work.
- All pull outcomes are idempotently persisted, and acknowledged scan ranges contain no
  omitted matching delta.
- Semantic underfill never triggers a cross-tenant, cross-manifest, or exact scan.
- An expired cursor returns `CURSOR_EXPIRED` and performs no board backfill.
- Explain plans for a 1M+ row board use account/board/sequence or exact-item indexes;
  no plan scans the board item table.
- Pooled-connection tests prove transaction-local tenant state is reset, non-owner API
  roles cannot bypass RLS, and vector plan attestations name only account-owned
  segments.
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
