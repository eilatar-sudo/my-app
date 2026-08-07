# mondayDB Agentic Citation Materialization Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-07.v1`

## 1. Why this plane, before how

A sealed citation proves that an agent bound a published fact to
`ledger_entry_id + fact_hash` under a purpose fence. It does not decide how
that citation becomes a durable, purpose-attenuated artifact on a board item,
working set, or decision-memory slot without inventing board writes or
rescanning consumption sessions.

Without a materialization plane, agents either:

- paste fact bodies into board columns without binding identity (unauditable,
  sticky after supersession), or
- re-resolve consumption sessions for every board render (neighbor-harmful on
  boards with 1M+ rows).

The product trade-off is **durable board presence versus citation freshness**:

- Letting agents freely write citation text onto boards maximizes fluency, but
  creates sticky stale truth, purpose amplification across sessions, and
  unauditable writebacks after invalidation.
- Requiring an approved materialization profile, sealed placement bindings,
  purpose attenuation receipts, and deterministic sync adds one bounded
  transaction and short-lived sync storage.
- Semantic similarity may discover materialization profiles, but it must never
  decide whether a citation may land on a board, sync, or write back.

The recommended model keeps the data plane deterministic:

1. An approved materialization profile defines which citation surfaces may land
   on which target kinds and how purpose must attenuate.
2. A materialization session opens under purpose, budget, and authorization
   fences, and only accepts sealed citation IDs by point lookup.
3. mondayDB seals a placement binding to
   `citation_id + fact_hash + target_ref + attenuation_hash`.
4. Sync subscriptions emit invalidation when the source citation moves;
   board writeback may become `UNKNOWN_EFFECT` until reconciled.
5. Fan-out across board items is budgeted; unscoped plans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"materialize every related citation onto every item" loops are rejectable
before they scan boards with 1M+ rows.

### Product outcome

For any agent materialization of a sealed citation, mondayDB can answer:

- Which profile, principal, and session authorized the placement?
- Which citation, fact hash, and attenuated purpose were bound?
- Is the placement still current, invalidated, or awaiting writeback?
- Did async board writeback become `UNKNOWN_EFFECT`?
- Can the materialization history be replayed without invoking an LLM?

## 2. Scope and ownership

The Citation Materialization Plane owns:

1. Immutable approved materialization profiles as procedural memory of "how an
   agent may place sealed citations onto durable targets."
2. Tenant-scoped materialization sessions with purpose and budget fences.
3. Deterministic placement of sealed citations by point lookup (never session
   or ledger table scans).
4. Purpose attenuation receipts and sealed placement bindings.
5. Sync invalidation and board writeback intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded fan-out.

It integrates with, but does not replace:

- **Fact Consumption:** supplies sealed citation IDs and invalidation events.
- **Fact Publication / Grounding:** constrain what a placement may expose.
- **Working Set / Decision Memory:** may receive sealed placements, not raw
  citation peeks.
- **Transaction Intent / Effect Saga:** may execute board writebacks under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves place, sync, vector, and writeback
  units.
- **Emergency Containment:** can freeze profiles or quarantine sessions.

### Non-goals

- Letting an LLM decide placement validity or "best" board column.
- Reconstructing authoritative placements from columnar or vector projections.
- Cross-account citation materialization or global nearest-neighbor writes.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external board write consumers.
- Unbounded recursive materialization across boards with 1M+ rows.

## 3. Product contract

### 3.1 Materialization profile contract

A materialization profile version is immutable after approval. It defines:

- allowed citation surface-key patterns and target kinds
  (`BOARD_ITEM`, `WORKING_SET`, `DECISION_MEMORY`);
- purpose attenuation rules (narrowing only; never amplification);
- max placement fan-out per session and per target;
- sync and writeback policies;
- optional procedural refs for "how to render and route placements."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
sessions; in-flight sessions follow the captured revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures policy and ACL
revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Placement contract

Accepting a sealed citation returns an acceptance receipt. Sealing a
materialization binds `citation_id`, `fact_hash`, `target_ref`, and
`attenuation_hash`. Placements never mutate identity; invalidation creates a
new state transition and optional writeback intent.

### 3.4 Sync and writeback contract

Subscriptions bind placements to citation invalidation. Writeback intents start
as `PREPARED`, may become `UNKNOWN_EFFECT` when the external board consumer
does not acknowledge, and never invent success from silence.

### 3.5 Availability contract

Materialization control-plane APIs target 99.99% availability for open, accept,
seal, sync, and perception reads. External board writebacks are best-effort and
surfaced as uncertainty rather than silent success.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and target rules are immutable.
4. Placement identity
   (`citation_id`, `fact_hash`, `target_ref`, `attenuation_hash`) is immutable
   after seal.
5. Purpose attenuation may only narrow the session purpose; amplification is
   rejected.
6. Citation acceptance uses point lookup by
   `(account_id, citation_id)` — never session scans.
7. Writeback intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes place/sync/
   writeback.
10. Plans that require unscoped board or citation scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate target rules. Approval validates definition hash,
requires at least one target rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Accept and place

Accept looks up a sealed citation by primary key, verifies surface pattern and
purpose attenuation, and emits an acceptance receipt. Seal binds placement to
target and attenuation hash under CAS.

### 5.4 Sync

Subscribe attaches the placement to citation invalidation. Fan-out across
targets is budget-capped.

### 5.5 Invalidate and writeback

Invalidation marks placements stale. Optional writeback intents reconcile board
columns; unresolved external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and target rules. No session may open.

### 6.2 Session open

Session moves `OPEN` -> `ACCEPTING` -> `ACTIVE` as citations are accepted.

### 6.3 Binding

Seal materialization creates an immutable placement binding.

### 6.4 Invalidated / syncing

Citation invalidation moves placements to `INVALIDATED` or `SYNCING` with
optional writeback.

### 6.5 Terminal states

Sessions end as `CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`,
or `UNKNOWN_EFFECT`.

### 6.6 Retain

Audit anchors and sealed placements retain for enterprise replay; physical
purge follows the erasure plane.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CitationId = string;
type MaterializationId = string;
type PlacementId = string;
type Sha256 = string;
type Timestamp = string;
type SurfaceKey = string;
type TargetRef = string;

type TrustedNextAction =
  | "ACCEPT_CITATION"
  | "SEAL_MATERIALIZATION"
  | "SUBSCRIBE_SYNC"
  | "FAN_OUT_PLACEMENTS"
  | "PREPARE_WRITEBACK"
  | "RESOLVE_WRITEBACK"
  | "CLOSE_SESSION";

type MaterializationBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CITATION_MISSING"
  | "HASH_MISMATCH"
  | "FAN_OUT_EXCEEDED"
  | "POLICY_DENIED"
  | "UNKNOWN_EFFECT";

interface UntrustedText {
  readonly value: string;
  readonly provenance: "USER_INPUT" | "BOARD_VALUE" | "PROVIDER_VALUE" | "AGENT_DRAFT";
  readonly trust: "UNTRUSTED_CONTENT";
}

type ProfileStatus = "DRAFT" | "APPROVED" | "REVOKED";
type SessionStatus =
  | "OPEN"
  | "ACCEPTING"
  | "ACTIVE"
  | "SYNCING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type PlacementStatus =
  | "SEALED"
  | "INVALIDATED"
  | "SYNCING"
  | "WRITEBACK_PENDING"
  | "SUPERSEDED_REF"
  | "UNKNOWN_EFFECT";

type TargetKind = "BOARD_ITEM" | "WORKING_SET" | "DECISION_MEMORY";
type WritebackIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface CitationMaterializationBudget {
  readonly acceptUnits: number;
  readonly placeUnits: number;
  readonly vectorUnits: number;
  readonly syncUnits: number;
  readonly writebackUnits: number;
  readonly maxWallTimeMs: number;
  readonly maxPlacementFanOut: number;
  readonly maxTargetsPerCitation: number;
}

interface CitationMaterializationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly maxPlacementFanOut: number;
  readonly maxTargetsPerCitation: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface CitationMaterializationSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: CitationMaterializationBudget;
  readonly consumed: Omit<
    CitationMaterializationBudget,
    "maxWallTimeMs" | "maxPlacementFanOut" | "maxTargetsPerCitation"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface CitationAcceptanceReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly surfaceKey: SurfaceKey;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly acceptanceHash: Sha256;
  readonly acceptedAt: Timestamp;
}

interface CitationPlacement {
  readonly accountId: AccountId;
  readonly placementId: PlacementId;
  readonly materializationId: MaterializationId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly targetKind: TargetKind;
  readonly targetRef: TargetRef;
  readonly status: PlacementStatus;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface WritebackObservation {
  readonly writebackId: string;
  readonly status: WritebackIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentCitationMaterializationPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedPlacementCount: number;
  readonly invalidatedPlacementCount: number;
  readonly uncertainWritebacks: readonly WritebackObservation[];
  readonly remainingBudget: Omit<
    CitationMaterializationBudget,
    "maxWallTimeMs" | "maxPlacementFanOut" | "maxTargetsPerCitation"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly MaterializationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateCitationMaterializationSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: CitationMaterializationBudget;
}

interface AcceptSealedCitationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly expectedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealCitationMaterializationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly targetKind: TargetKind;
  readonly targetRef: TargetRef;
  readonly expectedFactHash: Sha256;
  readonly expectedAcceptanceHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SubscribePlacementSyncInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly placementId: PlacementId;
  readonly idempotencyKey: string;
}

interface FanOutCitationPlacementsInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly maxFanOut: number;
  readonly idempotencyKey: string;
}

interface PreparePlacementWritebackInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly placementId: PlacementId;
  readonly idempotencyKey: string;
}

interface ResolveWritebackUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly writebackId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_RECEIPT"
    | "REJECT_PLACEMENT"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseCitationMaterializationSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type CitationMaterializationDecision =
  | { readonly decision: "ALLOWED"; readonly session: CitationMaterializationSession;
      readonly placement?: CitationPlacement; readonly receipt?: CitationAcceptanceReceipt;
      readonly perception: AgentCitationMaterializationPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: MaterializationBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentCitationMaterializationPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production placement may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE cm_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE cm_session_status AS ENUM (
  'OPEN', 'ACCEPTING', 'ACTIVE', 'SYNCING', 'CLOSED', 'EXPIRED',
  'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cm_placement_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SYNCING', 'WRITEBACK_PENDING',
  'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE cm_target_kind AS ENUM (
  'BOARD_ITEM', 'WORKING_SET', 'DECISION_MEMORY'
);
CREATE TYPE cm_writeback_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cm_citation_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF',
  'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_cm_profile_authority NOLOGIN;

CREATE TABLE agent_cm_authorization_evidence (
  account_id BIGINT NOT NULL,
  evidence_id UUID NOT NULL,
  principal_id TEXT NOT NULL,
  policy_revision BIGINT NOT NULL CHECK (policy_revision >= 0),
  resource_acl_revision BIGINT NOT NULL CHECK (resource_acl_revision >= 0),
  redacted_scope_summary JSONB NOT NULL,
  encrypted_evidence_ref TEXT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  immutable_archive_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evidence_id),
  UNIQUE (account_id, evidence_id, evidence_hash),
  CHECK (length(evidence_hash) = 64)
);

CREATE TABLE agent_cm_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status cm_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  max_placement_fan_out SMALLINT NOT NULL
    CHECK (max_placement_fan_out BETWEEN 0 AND 32),
  max_targets_per_citation SMALLINT NOT NULL
    CHECK (max_targets_per_citation BETWEEN 1 AND 16),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_ACCEPT', 'REQUIRE_CONTAINMENT'
    )
  ),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  UNIQUE (account_id, profile_id, profile_version, definition_hash),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_cm_authorization_evidence (account_id, evidence_id),
  CHECK (
    (status = 'DRAFT' AND approved_at IS NULL
      AND approval_validation_hash IS NULL) OR
    (status IN ('APPROVED', 'REVOKED') AND approved_at IS NOT NULL
      AND approval_validation_hash IS NOT NULL)
  ),
  CHECK (
    (status <> 'REVOKED' AND revoked_by IS NULL AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CHECK (length(authorization_snapshot_hash) = 64)
);

CREATE TABLE agent_cm_profile_target_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  surface_key_pattern TEXT NOT NULL,
  allowed_target_kinds TEXT[] NOT NULL,
  require_sync BOOLEAN NOT NULL,
  attenuation_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cm_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_cm_citation_catalog (
  account_id BIGINT NOT NULL,
  citation_id UUID NOT NULL,
  consumption_session_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  status cm_citation_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  ledger_entry_id UUID NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, citation_id),
  UNIQUE (account_id, consumption_session_id, citation_id)
);

CREATE TABLE agent_cm_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status cm_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_accept_units BIGINT NOT NULL CHECK (budget_accept_units >= 0),
  budget_place_units BIGINT NOT NULL CHECK (budget_place_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_sync_units BIGINT NOT NULL CHECK (budget_sync_units >= 0),
  budget_writeback_units BIGINT NOT NULL CHECK (budget_writeback_units >= 0),
  consumed_accept_units BIGINT NOT NULL CHECK (consumed_accept_units >= 0),
  consumed_place_units BIGINT NOT NULL CHECK (consumed_place_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_sync_units BIGINT NOT NULL CHECK (consumed_sync_units >= 0),
  consumed_writeback_units BIGINT NOT NULL CHECK (consumed_writeback_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  max_placement_fan_out SMALLINT NOT NULL
    CHECK (max_placement_fan_out BETWEEN 0 AND 32),
  max_targets_per_citation SMALLINT NOT NULL
    CHECK (max_targets_per_citation BETWEEN 1 AND 16),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL,
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  terminal_outcome_hash CHAR(64),
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, session_id, profile_id, profile_version),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cm_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_cm_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_accept_units <= budget_accept_units),
  CHECK (consumed_place_units <= budget_place_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_sync_units <= budget_sync_units),
  CHECK (consumed_writeback_units <= budget_writeback_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_cm_acceptance_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  acceptance_hash CHAR(64) NOT NULL CHECK (length(acceptance_hash) = 64),
  accepted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, citation_id, acceptance_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cm_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cm_materialization (
  account_id BIGINT NOT NULL,
  materialization_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, materialization_id),
  UNIQUE (account_id, session_id, citation_id, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cm_citation_catalog (account_id, citation_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_cm_acceptance_receipt (account_id, receipt_id)
);

CREATE TABLE agent_cm_placement (
  account_id BIGINT NOT NULL,
  placement_id UUID NOT NULL,
  materialization_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  target_kind cm_target_kind NOT NULL,
  target_ref TEXT NOT NULL,
  status cm_placement_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, placement_id),
  UNIQUE (account_id, session_id, citation_id, target_ref, sealed_revision),
  FOREIGN KEY (account_id, materialization_id)
    REFERENCES agent_cm_materialization (account_id, materialization_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cm_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cm_sync_subscription (
  account_id BIGINT NOT NULL,
  subscription_id UUID NOT NULL,
  session_id UUID NOT NULL,
  placement_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, subscription_id),
  UNIQUE (account_id, session_id, placement_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id),
  FOREIGN KEY (account_id, placement_id)
    REFERENCES agent_cm_placement (account_id, placement_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cm_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cm_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  placement_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  prior_fact_hash CHAR(64) NOT NULL CHECK (length(prior_fact_hash) = 64),
  next_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CITATION_MOVED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, subscription_id)
    REFERENCES agent_cm_sync_subscription (account_id, subscription_id),
  FOREIGN KEY (account_id, placement_id)
    REFERENCES agent_cm_placement (account_id, placement_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cm_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cm_writeback_intent (
  account_id BIGINT NOT NULL,
  writeback_id UUID NOT NULL,
  session_id UUID NOT NULL,
  placement_id UUID NOT NULL,
  intent_status cm_writeback_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL
    CHECK (length(canonical_request_hash) = 64),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, writeback_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id),
  FOREIGN KEY (account_id, placement_id)
    REFERENCES agent_cm_placement (account_id, placement_id)
);

CREATE TABLE agent_cm_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('ACCEPT', 'PLACE', 'VECTOR', 'SYNC', 'WRITEBACK')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id)
);

CREATE TABLE agent_cm_conflict_record (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  left_placement_id UUID,
  right_target_ref TEXT,
  conflict_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id)
);

CREATE TABLE agent_cm_human_resolution (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  session_id UUID NOT NULL,
  writeback_id UUID,
  conflict_id UUID,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id)
);

CREATE TABLE agent_cm_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID,
  operation_name TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL,
  result_hash CHAR(64) NOT NULL CHECK (length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  UNIQUE (account_id, operation_name, principal_id, idempotency_key)
);

CREATE TABLE agent_cm_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_cm_audit_event (
  account_id BIGINT NOT NULL,
  event_sequence BIGINT NOT NULL CHECK (event_sequence >= 0),
  session_id UUID,
  event_type TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL CHECK (length(payload_hash) = 64),
  prev_hash CHAR(64) NOT NULL CHECK (length(prev_hash) = 64),
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_sequence)
);

CREATE TABLE agent_cm_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_cm_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status cm_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cm_session (account_id, session_id)
);

CREATE TABLE agent_cm_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_cm_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_profile$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'profiles must start as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM 'DRAFT'
     AND (
       NEW.definition_hash IS DISTINCT FROM OLD.definition_hash
       OR NEW.max_placement_fan_out IS DISTINCT FROM OLD.max_placement_fan_out
       OR NEW.max_targets_per_citation
         IS DISTINCT FROM OLD.max_targets_per_citation
       OR NEW.semantic_tags IS DISTINCT FROM OLD.semantic_tags
       OR NEW.procedure_ref IS DISTINCT FROM OLD.procedure_ref
       OR NEW.revocation_policy IS DISTINCT FROM OLD.revocation_policy
       OR NEW.authorization_evidence_id
         IS DISTINCT FROM OLD.authorization_evidence_id
       OR NEW.authorization_snapshot_hash
         IS DISTINCT FROM OLD.authorization_snapshot_hash
     ) THEN
    RAISE EXCEPTION 'sealed profile definition is immutable';
  END IF;

  IF OLD.status = 'APPROVED' AND NEW.status = 'REVOKED' THEN
    IF current_setting('app.cm_profile_revocation', true) IS DISTINCT FROM
       concat(
         OLD.profile_id::TEXT, ':',
         OLD.profile_version::TEXT, ':',
         OLD.definition_hash
       ) THEN
      RAISE EXCEPTION 'profile revocation requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
    IF current_setting('app.cm_profile_approval', true) IS DISTINCT FROM
       concat(
         OLD.profile_id::TEXT, ':',
         OLD.profile_version::TEXT, ':',
         OLD.definition_hash
       ) THEN
      RAISE EXCEPTION 'profile approval requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status = 'DRAFT' AND NEW.status = 'APPROVED')
       OR (OLD.status = 'APPROVED' AND NEW.status = 'REVOKED')
     ) THEN
    RAISE EXCEPTION 'illegal profile status transition';
  END IF;

  RETURN NEW;
END
$protect_profile$;

CREATE TRIGGER agent_cm_profile_protect
BEFORE INSERT OR UPDATE ON agent_cm_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_cm_profile();

CREATE FUNCTION protect_agent_cm_profile_target_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status cm_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_cm_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile target rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_cm_profile_target_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_cm_profile_target_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_cm_profile_target_rule();

CREATE FUNCTION protect_agent_cm_placement()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_placement$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.citation_id IS DISTINCT FROM OLD.citation_id
       OR NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.target_ref IS DISTINCT FROM OLD.target_ref
       OR NEW.target_kind IS DISTINCT FROM OLD.target_kind
       OR NEW.materialization_id IS DISTINCT FROM OLD.materialization_id THEN
      RAISE EXCEPTION 'placement identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_placement$;

CREATE TRIGGER agent_cm_placement_protect
BEFORE UPDATE ON agent_cm_placement
FOR EACH ROW EXECUTE FUNCTION protect_agent_cm_placement();

CREATE FUNCTION protect_agent_cm_writeback_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_writeback$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'writeback intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.provider_idempotency_key
       IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.placement_id IS DISTINCT FROM NEW.placement_id THEN
    RAISE EXCEPTION 'prepared writeback identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_writeback$;

CREATE TRIGGER agent_cm_writeback_intent_protect
BEFORE INSERT OR UPDATE ON agent_cm_writeback_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_cm_writeback_intent();

CREATE FUNCTION approve_agent_cm_profile(
  tenant_id BIGINT,
  target_profile_id UUID,
  target_profile_version INTEGER,
  validated_definition_hash TEXT,
  approver_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $approve$
DECLARE
  stored_hash CHAR(64);
  stored_status cm_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cm_profile
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'profile approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO rule_count
  FROM agent_cm_profile_target_rule
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one target rule';
  END IF;

  PERFORM set_config(
    'app.cm_profile_approval',
    concat(
      target_profile_id::TEXT, ':',
      target_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_cm_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_cm_profile(
  tenant_id BIGINT,
  target_profile_id UUID,
  target_profile_version INTEGER,
  expected_definition_hash TEXT,
  revoker_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $revoke$
DECLARE
  stored_hash CHAR(64);
  stored_status cm_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cm_profile
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version
  FOR UPDATE;

  IF length(expected_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM expected_definition_hash THEN
    RAISE EXCEPTION 'profile revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.cm_profile_revocation',
    concat(
      target_profile_id::TEXT, ':',
      target_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_cm_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_cm_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cm_profile_authority;
ALTER FUNCTION revoke_agent_cm_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cm_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_cm_profile_authority;
GRANT SELECT ON
  agent_cm_profile,
  agent_cm_profile_target_rule
TO agent_cm_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cm_profile TO agent_cm_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_cm_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_cm_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cm_profile FROM PUBLIC;

CREATE INDEX agent_cm_session_work_idx ON agent_cm_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_cm_session_profile_idx ON agent_cm_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_cm_placement_session_idx ON agent_cm_placement (
  account_id, session_id, sealed_at DESC, placement_id
);
CREATE INDEX agent_cm_placement_citation_idx ON agent_cm_placement (
  account_id, citation_id, sealed_at DESC, placement_id
);
CREATE INDEX agent_cm_placement_target_idx ON agent_cm_placement (
  account_id, target_kind, target_ref, sealed_at DESC
);
CREATE INDEX agent_cm_citation_surface_idx ON agent_cm_citation_catalog (
  account_id, surface_key, sealed_at DESC, citation_id
);
CREATE INDEX agent_cm_sync_active_idx ON agent_cm_sync_subscription (
  account_id, active, citation_id, subscription_id
) WHERE active;
CREATE INDEX agent_cm_writeback_work_idx ON agent_cm_writeback_intent (
  account_id, intent_status, updated_at, writeback_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_cm_audit_time_idx ON agent_cm_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_cm_perception_status_idx ON agent_cm_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_cm_command_expiry_idx ON agent_cm_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_cm_conflict_citation_idx ON agent_cm_conflict_record (
  account_id, citation_id, created_at DESC, conflict_id
);
CREATE INDEX agent_cm_invalidation_placement_idx ON agent_cm_invalidation (
  account_id, placement_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_cm_authorization_evidence',
    'agent_cm_profile',
    'agent_cm_profile_target_rule',
    'agent_cm_citation_catalog',
    'agent_cm_session',
    'agent_cm_acceptance_receipt',
    'agent_cm_materialization',
    'agent_cm_placement',
    'agent_cm_sync_subscription',
    'agent_cm_invalidation',
    'agent_cm_writeback_intent',
    'agent_cm_budget_ledger',
    'agent_cm_conflict_record',
    'agent_cm_human_resolution',
    'agent_cm_command_result',
    'agent_cm_audit_head',
    'agent_cm_audit_event',
    'agent_cm_audit_anchor',
    'agent_cm_perception_snapshot',
    'agent_cm_projection_checkpoint'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
       USING (account_id = NULLIF(current_setting(''app.account_id'', true), '''')::BIGINT)
       WITH CHECK (account_id = NULLIF(current_setting(''app.account_id'', true), '''')::BIGINT)',
      table_name
    );
  END LOOP;
END
$tenant_isolation$;
```

### 8.1 Transaction boundaries

Open session, accept+receipt, seal materialization/placement, subscribe, fan-out,
prepare writeback, and audit-chain append commit in one ACID transaction per
command. Citation catalog ingestion from consumption is separately watermarked.

### 8.2 Tenant isolation

Every table enables and forces RLS. Policies compare `account_id` to
`app.account_id`. Resolvers must set the GUC before query execution.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
writeback work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentCmSessionStatus {
  OPEN
  ACCEPTING
  ACTIVE
  SYNCING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentCmPlacementStatus {
  SEALED
  INVALIDATED
  SYNCING
  WRITEBACK_PENDING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentCmTargetKind {
  BOARD_ITEM
  WORKING_SET
  DECISION_MEMORY
}

enum AgentCmWritebackStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentCmNextAction {
  ACCEPT_CITATION
  SEAL_MATERIALIZATION
  SUBSCRIBE_SYNC
  FAN_OUT_PLACEMENTS
  PREPARE_WRITEBACK
  RESOLVE_WRITEBACK
  CLOSE_SESSION
}

enum AgentCmBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CITATION_MISSING
  HASH_MISMATCH
  FAN_OUT_EXCEEDED
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentCmUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_PLACEMENT
  REQUIRE_HUMAN
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentCmBudget {
  acceptUnits: Long!
  placeUnits: Long!
  vectorUnits: Long!
  syncUnits: Long!
  writebackUnits: Long!
  maxWallTimeMs: Long!
  maxPlacementFanOut: Int!
  maxTargetsPerCitation: Int!
}

type AgentCmProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  maxPlacementFanOut: Int!
  maxTargetsPerCitation: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentCmSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentCmSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentCmBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentCmAcceptanceReceipt {
  accountId: ID!
  sessionId: ID!
  citationId: ID!
  surfaceKey: String!
  factHash: SHA256!
  attenuationHash: SHA256!
  acceptanceHash: SHA256!
  acceptedAt: DateTime!
}

type AgentCmPlacement {
  accountId: ID!
  placementId: ID!
  materializationId: ID!
  sessionId: ID!
  citationId: ID!
  targetKind: AgentCmTargetKind!
  targetRef: String!
  status: AgentCmPlacementStatus!
  factHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentCmWritebackObservation {
  writebackId: ID!
  status: AgentCmWritebackStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentCmPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentCmSessionStatus!
  summary: AgentUntrustedText!
  sealedPlacementCount: Int!
  invalidatedPlacementCount: Int!
  uncertainWritebacks: [AgentCmWritebackObservation!]!
  remainingBudget: AgentCmBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentCmNextAction!]!
  blockedReasons: [AgentCmBlockedReason!]!
  cardHash: SHA256!
}

type AgentCmMutationResult {
  decision: String!
  session: AgentCmSession
  placement: AgentCmPlacement
  receipt: AgentCmAcceptanceReceipt
  perception: AgentCmPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentCmBudgetInput {
  acceptUnits: Long!
  placeUnits: Long!
  vectorUnits: Long!
  syncUnits: Long!
  writebackUnits: Long!
  maxWallTimeMs: Long!
  maxPlacementFanOut: Int!
  maxTargetsPerCitation: Int!
}

input CreateCitationMaterializationSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentCmBudgetInput!
}

input AcceptSealedCitationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  expectedFactHash: SHA256!
  idempotencyKey: String!
}

input SealCitationMaterializationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  targetKind: AgentCmTargetKind!
  targetRef: String!
  expectedFactHash: SHA256!
  expectedAcceptanceHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SubscribePlacementSyncInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  placementId: ID!
  idempotencyKey: String!
}

input FanOutCitationPlacementsInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  maxFanOut: Int!
  idempotencyKey: String!
}

input PreparePlacementWritebackInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  placementId: ID!
  idempotencyKey: String!
}

input ResolveWritebackUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  writebackId: ID!
  resolution: AgentCmUncertaintyResolution!
  idempotencyKey: String!
}

input CloseCitationMaterializationSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentCmProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentCmProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentCmProfile
  agentCmSession(accountId: ID!, sessionId: ID!): AgentCmSession
  agentCmPlacement(accountId: ID!, placementId: ID!): AgentCmPlacement
  agentCmPerceptionCard(accountId: ID!, sessionId: ID!): AgentCmPerceptionCard
  agentCmAcceptedCitation(
    accountId: ID!
    sessionId: ID!
    citationId: ID!
  ): AgentCmAcceptanceReceipt
  agentCmSearchProfiles(input: AgentCmProfileSearchInput!): [AgentCmProfile!]!
}

type Mutation {
  createCitationMaterializationSession(
    input: CreateCitationMaterializationSessionInput!
  ): AgentCmMutationResult!
  acceptSealedCitation(input: AcceptSealedCitationInput!): AgentCmMutationResult!
  sealCitationMaterialization(
    input: SealCitationMaterializationInput!
  ): AgentCmMutationResult!
  subscribePlacementSync(
    input: SubscribePlacementSyncInput!
  ): AgentCmMutationResult!
  fanOutCitationPlacements(
    input: FanOutCitationPlacementsInput!
  ): AgentCmMutationResult!
  preparePlacementWriteback(
    input: PreparePlacementWritebackInput!
  ): AgentCmMutationResult!
  resolveWritebackUncertainty(
    input: ResolveWritebackUncertaintyInput!
  ): AgentCmMutationResult!
  closeCitationMaterializationSession(
    input: CloseCitationMaterializationSessionInput!
  ): AgentCmMutationResult!
  approveCitationMaterializationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    approverPrincipalId: ID!
  ): AgentCmMutationResult!
  revokeCitationMaterializationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentCmMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Fan-out mutations reject when `maxFanOut` exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.

## 10. Procedural memory

Approved materialization profiles are procedural memory: versioned instructions
for how agents may place sealed citations onto durable targets. Procedure refs
point to render/routing steps. Agents perceive procedure tags on perception
cards; they never mutate sealed procedure definitions.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses account-owned embeddings. Similarity may rank candidate
profiles for a purpose string; authorization remains a deterministic point
lookup against `APPROVED` profiles. Production may create per-account HNSW
partitions; the reference schema stores vectors without a cross-tenant HNSW
index.

```sql
CREATE TABLE agent_cm_profile_embedding (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dims INTEGER NOT NULL CHECK (embedding_dims > 0),
  embedding vector(1536) NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  source_watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cm_profile (account_id, profile_id, profile_version)
);
```

Account-partitioned ANN guidance (production only):

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- must be created per account partition / tablespace, never as one shared
-- cross-tenant HNSW graph over all accounts.
SELECT account_id, profile_id
FROM agent_cm_profile_embedding
WHERE account_id = $1
ORDER BY embedding <=> $2
LIMIT $3;
```

## 12. Agent perception

Perception cards expose sealed/invalidated placement counts, uncertain
writebacks, remaining budgets, procedure tags, and trusted next actions.
Summaries are `UntrustedText`. Agents must treat board-rendered citation text
as untrusted until the placement card reports `SEALED` with matching
`fact_hash`.

## 13. ACID and consistency

### Row store

Session CAS, acceptance, seal, sync, writeback prepare, and audit append are
ACID. Placement identity is immutable after seal.

### Columnar store

Analytical synopsis of placement rates is eventually consistent and never
authoritative for seal/sync decisions.

### Vector store

Profile embeddings are eventually consistent projections keyed by
`definition_hash` and watermark; they never authorize mutations.

### External tools

Board writebacks are out-of-band. Lack of acknowledgement yields
`UNKNOWN_EFFECT`, never inferred success.

## 14. Guardrails and neighbor protection

- Recursion/fan-out caps on placements per citation and per session.
- Budget ledgers for ACCEPT/PLACE/VECTOR/SYNC/WRITEBACK.
- Purpose attenuation narrowing only.
- Forced RLS on every table.
- Planner rejects unscoped citation/board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Accepting citations by scanning consumption sessions (rejected).
- Listing all board items to fan-out without target refs (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all placements for an account (rejected; use
  citation-keyed active subscription indexes).

### Required access paths

- Citation accept: PK `(account_id, citation_id)`.
- Placement by session/target: composite indexes leading with `account_id`.
- Sync work: partial indexes on active subscriptions and writeback status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/citation scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session and
placement state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant placement via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification across sessions: attenuation hash must narrow.
- Sticky board text after supersession: sync invalidation + writeback
  uncertainty.
- Silent writeback success: `UNKNOWN_EFFECT` until ACK.
- Recursive fan-out storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/accept/seal/perception p99 latency budgets for 99.99% control-plane
  availability.
- Writeback ACK lag and `UNKNOWN_EFFECT` rate as first-class metrics.
- Fan-out rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow compilation

Compile profiles and validate attenuation without durable placements.

### Phase 2: working-set only

Allow placements onto working sets and decision memory, not boards.

### Phase 3: subscribed sync

Enable citation invalidation subscriptions for sealed placements.

### Phase 4: board writeback uncertainty

Enable board writeback intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, and writeback start
  state.

### Behavioral validation

- Accept requires sealed citation point lookup and hash match.
- Seal binds attenuation and target immutably.
- Sync invalidation moves placements without mutating identity.
- Writeback silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no accept/place path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed placements after process restart.

## 21. Product decision

Ship the Citation Materialization Plane as the deterministic bridge from sealed
citations to durable, purpose-attenuated board and memory presence. Keep
semantic retrieval advisory for profile discovery only. Prefer short-lived sync
and honest `UNKNOWN_EFFECT` writebacks over sticky unauditable board text.
Reject unscoped materialization plans on boards with 1M+ rows as
**FULL SCAN REJECTED**, preserving 99.99% neighbor isolation while making
agent placements procedural-memory-driven, auditable, and replayable.
