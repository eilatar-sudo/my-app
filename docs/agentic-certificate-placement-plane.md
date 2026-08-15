# mondayDB Agentic Certificate Placement Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-15.v1`

## 1. Why this plane, before how

A sealed freeze, breach, thaw, extend, or contain certificate can halt or
restore consumption under executive and thaw-SLA fences, but it does not
decide **how those certificates compile into a placement-aware working set**:
which sealed certificates count, which slots stay halted, which restore
without a winner, which remain omitted under further purpose attenuation, and
how to do so without scanning every freeze, thaw, clock, or certificate row
in an account.

Without a certificate-placement plane, operators and agents either:

- scan every freeze, thaw-SLA, breach, and contain certificate looking for
  "what this agent may see now" (neighbor-harmful on boards with 1M+ rows), or
- sticky-copy the latest certificate kind into a working set, so a `THAW`
  becomes an invented winning fact, a `BREACH` leaks frozen bodies into
  agent context, and a hop-attenuated citation is amplified back to the
  original purpose.

The product trade-off is **compilation fluency versus halt-scope isolation**:

- Compiling every sealed certificate into a fully visible working set
  maximizes agent fluency and reduces re-grounding cost, but creates
  non-deterministic restores, leaked halt scopes, invented winners, and
  unauditable purpose amplification.
- Compiling a sealed working-set packet under an approved placement profile,
  certificate point lookups, halt-leak fences, and steward budgets adds one
  bounded compile transaction and short-lived packet storage.
- Semantic similarity may discover placement profiles, but it must never
  decide whether a certificate may be nominated, a slot compiled, a packet
  sealed, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved placement profile defines allowed source-certificate kinds,
   slot placement kinds, purpose attenuation, and notify policy. Compilation
   **never** invents a winning fact hash.
2. A placement session opens under purpose, budget, and authorization fences,
   and only nominates sealed certificates by point lookup from the Executive
   Freeze and Thaw SLA planes.
3. mondayDB compiles slots whose placement kind is a pure function of
   `(source_certificate_kind, further_attenuation_hash)`. Halted certificates
   cannot become restored slots.
4. Sealing a working-set packet binds
   `consumer_ref + purpose_hash + halt_scope_hash + disputed_fact_set_hash +
   placement_set_hash`. The packet **must not** emit a `resolved_fact_hash`.
5. Upstream invalidation marks packets stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped certificate-ledger, working-set, or board scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ask every freeze/thaw certificate forever" or "restore every peer halt
forever" loops are rejectable before they scan boards with 1M+ rows.
Perception is restored by sealed placement packets, not by magic visibility
inside the engine.

### Product outcome

For any certificate-placement compilation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, compile,
  seal, invalidate, or notify?
- Which nominated certificates, halt scopes, disputed fact hashes, placement
  kinds, and attenuation hashes were bound?
- Is the working-set packet still current, invalidated, or awaiting notify?
- Did async placement notify become `UNKNOWN_EFFECT`?
- Can the placement history be replayed without invoking an LLM?

## 2. Scope and ownership

The Certificate Placement Plane owns:

1. Immutable approved placement profiles as procedural memory of "how sealed
   freeze, breach, thaw, extend, or contain certificates compile into a
   halt-aware working set without leaking halted facts or inventing a winner."
2. Tenant-scoped placement sessions with purpose and budget fences.
3. Deterministic nomination of sealed source certificates by point lookup —
   never freeze-ledger, thaw-ledger, or full working-set scans.
4. Deterministic compile receipts, sealed working-set packets, and immutable
   placement slots that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded placement budgets.

It integrates with, but does not replace:

- **Executive Freeze / Thaw SLA:** supply sealed freeze, breach, thaw,
  extend, and contain certificate IDs, halt scopes, disputed fact sets, and
  invalidation events.
- **Escalation Authority / Split Resolution / Refresh Quorum:** upstream
  conflict context that produced the certificates.
- **Emergency Containment:** the coarse stop/drain/quarantine path used when
  a `CONTAIN` certificate compiles to omitted/halted slots; this plane is
  purpose-scoped placement, not workspace-wide containment.
- **Fact Consumption / Grounding / Citation Materialization:** constrain what
  a halted or restored slot may expose onto boards.
- **Working Set / Decision Memory:** consume sealed placement packets, not
  raw certificate-ledger walks.
- **Transaction Intent / Effect Saga:** may execute placement notify under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves nominate, compile, vector, seal,
  invalidate, and notify units.

### Non-goals

- Letting an LLM decide slot membership or that a freeze "feels visible."
- Auto-restoring disputed facts when a working set is compiled.
- Reconstructing authoritative placement packets from columnar or vector
  projections.
- Cross-account placement or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external notify consumers.
- Inventing a winning fact hash when a thaw certificate is placed.
- Unbounded recursive certificate-ledger or working-set walks across boards
  with 1M+ rows.

## 3. Product contract

### 3.1 Placement profile contract

A placement profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_FREEZE_CERT`, `SEALED_BREACH_CERT`,
  `SEALED_THAW_CERT`, `SEALED_EXTEND_CERT`, `SEALED_CONTAIN_CERT`,
  `SUPERSEDED_CERT`);
- compile threshold (distinct human or attested principals), max slots per
  packet, and max nominated certificates;
- placement policy (`HALT_AWARE_COMPILE`, `NO_WINNER_ON_THAW`,
  `OMIT_CONTAINED_SLOTS`);
- purpose attenuation rules (narrowing only; never amplification);
- notify policy after seal, invalidation, or upstream certificate change;
- optional procedural refs for "how to present halted, restored, or omitted
  truth without a winner."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
sessions; in-flight sessions follow the captured revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures policy and ACL
revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Compile and packet contract

Nominating a sealed source certificate returns a nomination receipt. Compiling
a working set binds each nominated certificate to a placement kind that is
compatible with the source kind. Sealing a packet binds
`consumer_ref + purpose_hash + halt_scope_hash + disputed_fact_set_hash +
placement_set_hash`. Packets **must not** emit a `resolved_fact_hash` winner.
Slots compiled from freeze, breach, extend, or contain certificates are
rejected when the requested placement kind is `RESTORED_WITHOUT_WINNER`
(halt-leak fence).

### 3.4 Invalidation and refresh contract

Invalidations bind packets to upstream freeze, thaw, or certificate
revocation. Notify intents start as `PREPARED`, may become `UNKNOWN_EFFECT`
when the notify consumer does not acknowledge, and never invent success from
silence.

### 3.5 Availability contract

Placement control-plane APIs target 99.99% availability for open, nominate,
compile, seal, and perception reads. External notify side-effects are
best-effort and surfaced as uncertainty rather than silent success. Working-set
compilation must not silently restore neighbor-impacting board reads.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and placement rules are immutable.
4. Slot identity
   (`source_certificate_id`, `disputed_fact_hash`, `attenuation_hash`,
   `slot_ordinal`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Certificate nomination uses point lookup by
   `(account_id, source_certificate_id)` — never full freeze/thaw-ledger scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/compile/seal/notify.
10. Freeze, breach, extend, and contain certificates cannot compile to
    `RESTORED_WITHOUT_WINNER` slots (halt-leak fence).
11. Thaw certificates cannot compile to `HALTED` slots (thaw-restore fence).
12. Working-set packets bind halt scope, disputed fact set, and placement set
    hashes; they never invent a winning fact hash.
13. Plans that require unscoped board, session, certificate-ledger, or
    working-set scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate placement rules. Approval validates definition hash,
requires at least one placement rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and compile

Nominate looks up a sealed source certificate by primary key, verifies
observation kind and purpose attenuation, and emits a nomination receipt.
Compile binds compatible placement kinds under CAS and compile budgets.

### 5.4 Seal working-set packet

Seal materializes immutable slots from the compile receipt. The seal **does
not** choose a winner among disputed fact hashes and **does not** restore
halted bodies into visible context.

### 5.5 Invalidate and notify

Invalidation marks packets stale when upstream certificates revoke, release,
or supersede. Optional notify intents retally placement to consumers;
unresolved external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and placement rules. No session may open.

### 6.2 Session open

An authorized principal opens a session against an `APPROVED` profile.
Budgets and purpose hashes are captured.

### 6.3 Nominating / compiling

Source certificates are nominated by point lookup and a compile receipt is
emitted. Compile work consumes budget against that session's primary key.

### 6.4 Sealed / invalidated

Seal materializes an immutable working-set packet. Upstream change may
invalidate. Notify may enter `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`. Terminal records
are append-only.

### 6.6 Retain

Audit events, packets, compile receipts, and terminal records retain per
account retention policy for replay. Vector profile embeddings follow the same
account-scoped watermark as the approved definition hash.

## 7. TypeScript contracts

These interfaces are the service boundary for certificate placement and
halt-aware working-set compilation. IDs are opaque; resolvers validate formats
and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type SourceCertificateId = string;
type CompileId = string;
type WorkingSetId = string;
type SlotId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_SOURCE_CERTIFICATE"
  | "COMPILE_WORKING_SET"
  | "SEAL_WORKING_SET"
  | "INVALIDATE_PLACEMENT"
  | "PREPARE_PLACEMENT_NOTIFY"
  | "RESOLVE_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type PlacementBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CERTIFICATE_MISSING"
  | "COMPILE_NOT_READY"
  | "HALT_LEAK_DENIED"
  | "THAW_RESTORE_DENIED"
  | "HASH_MISMATCH"
  | "SLOT_THRESHOLD_NOT_MET"
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
  | "NOMINATING"
  | "COMPILING"
  | "SEALED"
  | "REFRESHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type MemberStatus =
  | "SEALED"
  | "INVALIDATED"
  | "REFRESHING"
  | "SUPERSEDED_REF"
  | "UNKNOWN_EFFECT";

type SourceCertificateKind =
  | "SEALED_FREEZE_CERT"
  | "SEALED_BREACH_CERT"
  | "SEALED_THAW_CERT"
  | "SEALED_EXTEND_CERT"
  | "SEALED_CONTAIN_CERT"
  | "SUPERSEDED_CERT";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface CertificatePlacementBudget {
  readonly nominateUnits: number;
  readonly compileUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly compileThreshold: number;
  readonly maxSlotsPerPacket: number;
  readonly maxNominatedCertificates: number;
}

interface CertificatePlacementProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly compileThreshold: number;
  readonly maxSlotsPerPacket: number;
  readonly maxNominatedCertificates: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface CertificatePlacementSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: CertificatePlacementBudget;
  readonly consumed: Omit<
    CertificatePlacementBudget,
    | "maxWallTimeMs"
    | "compileThreshold"
    | "maxSlotsPerPacket"
    | "maxNominatedCertificates"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface SourceNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly sourceCertificateKind: SourceCertificateKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface PlacementCompileReceipt {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly placementSetHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly disputedFactSetHash: Sha256;
  readonly compileHash: Sha256;
  readonly compiledAt: Timestamp;
}

interface WorkingSetSlot {
  readonly accountId: AccountId;
  readonly slotId: SlotId;
  readonly workingSetId: WorkingSetId;
  readonly sessionId: SessionId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly sourceCertificateKind: SourceCertificateKind;
  readonly slotOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface PlacementWorkingSet {
  readonly accountId: AccountId;
  readonly workingSetId: WorkingSetId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly disputedFactSetHash: Sha256;
  readonly placementSetHash: Sha256;
  readonly slotWatermark: number;
  readonly sealedAt: Timestamp;
}

interface PlacementNotifyObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentCertificatePlacementPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedSlotCount: number;
  readonly haltedSlotCount: number;
  readonly restoredSlotCount: number;
  readonly omittedSlotCount: number;
  readonly invalidatedSlotCount: number;
  readonly uncertainNotifyIntents: readonly PlacementNotifyObservation[];
  readonly remainingBudget: Omit<
    CertificatePlacementBudget,
    | "maxWallTimeMs"
    | "compileThreshold"
    | "maxSlotsPerPacket"
    | "maxNominatedCertificates"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly PlacementBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateCertificatePlacementSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: CertificatePlacementBudget;
}

interface NominateSourceCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceCertificateId: SourceCertificateId;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface CompileWorkingSetInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedHaltScopeHash: Sha256;
  readonly expectedDisputedFactSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealWorkingSetInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedPlacementSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidatePlacementInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly workingSetId: WorkingSetId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "CERTIFICATE_REVOKED";
  readonly idempotencyKey: string;
}

interface PreparePlacementNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly workingSetId: WorkingSetId;
  readonly idempotencyKey: string;
}

interface ResolvePlacementUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly refreshId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_RECEIPT"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseCertificatePlacementSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type CertificatePlacementDecision =
  | { readonly decision: "ALLOWED"; readonly session: CertificatePlacementSession;
      readonly workingSet?: PlacementWorkingSet; readonly member?: WorkingSetSlot;
      readonly receipt?: SourceNominationReceipt; readonly compile?: PlacementCompileReceipt;
      readonly perception: AgentCertificatePlacementPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: PlacementBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentCertificatePlacementPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE cp_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE cp_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'COMPILING', 'SEALED', 'REFRESHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cp_slot_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE cp_source_kind AS ENUM (
  'SEALED_FREEZE_CERT', 'SEALED_BREACH_CERT', 'SEALED_THAW_CERT',
  'SEALED_EXTEND_CERT', 'SEALED_CONTAIN_CERT', 'SUPERSEDED_CERT'
);
CREATE TYPE cp_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cp_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cp_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_cp_profile_authority NOLOGIN;

CREATE TABLE agent_cp_authorization_evidence (
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

CREATE TABLE agent_cp_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status cp_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 1 AND 8),
  max_slots_per_packet SMALLINT NOT NULL
    CHECK (max_slots_per_packet BETWEEN 1 AND 256),
  max_nominated_certificates SMALLINT NOT NULL
    CHECK (max_nominated_certificates BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_COMPILE', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_cp_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_cp_profile_placement_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  compile_threshold SMALLINT NOT NULL CHECK (compile_threshold BETWEEN 1 AND 8),
  max_slots_per_packet SMALLINT NOT NULL
    CHECK (max_slots_per_packet BETWEEN 1 AND 256),
  require_notify BOOLEAN NOT NULL,
  placement_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cp_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_cp_certificate_catalog (
  account_id BIGINT NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  certificate_ref TEXT NOT NULL,
  source_certificate_kind cp_source_kind NOT NULL,
  status cp_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  certificate_sealed_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_certificate_id),
  UNIQUE (account_id, certificate_ref, source_certificate_kind)
);

CREATE TABLE agent_cp_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status cp_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_compile_units BIGINT NOT NULL CHECK (budget_compile_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_compile_units BIGINT NOT NULL CHECK (consumed_compile_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 1 AND 8),
  max_slots_per_packet SMALLINT NOT NULL
    CHECK (max_slots_per_packet BETWEEN 1 AND 256),
  max_nominated_certificates SMALLINT NOT NULL
    CHECK (max_nominated_certificates BETWEEN 1 AND 256),
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
    REFERENCES agent_cp_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_cp_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_compile_units <= budget_compile_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_cp_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_certificate_kind cp_source_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_certificate_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_cp_certificate_catalog (account_id, source_certificate_id)
);

CREATE TABLE agent_cp_compile_receipt (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  placement_set_hash CHAR(64) NOT NULL CHECK (length(placement_set_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  disputed_fact_set_hash CHAR(64) NOT NULL
    CHECK (length(disputed_fact_set_hash) = 64),
  compile_hash CHAR(64) NOT NULL CHECK (length(compile_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  UNIQUE (account_id, session_id, compile_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id)
);

CREATE TABLE agent_cp_working_set (
  account_id BIGINT NOT NULL,
  working_set_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  disputed_fact_set_hash CHAR(64) NOT NULL
    CHECK (length(disputed_fact_set_hash) = 64),
  placement_set_hash CHAR(64) NOT NULL CHECK (length(placement_set_hash) = 64),
  slot_watermark SMALLINT NOT NULL CHECK (slot_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, working_set_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_cp_compile_receipt (account_id, compile_id)
);

CREATE TABLE agent_cp_working_set_slot (
  account_id BIGINT NOT NULL,
  slot_id UUID NOT NULL,
  working_set_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_certificate_kind cp_source_kind NOT NULL,
  slot_ordinal SMALLINT NOT NULL CHECK (slot_ordinal BETWEEN 0 AND 256),
  status cp_slot_status NOT NULL,
  placement_kind cp_placement_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, slot_id),
  UNIQUE (account_id, working_set_id, source_certificate_id, slot_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, working_set_id)
    REFERENCES agent_cp_working_set (account_id, working_set_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_cp_certificate_catalog (account_id, source_certificate_id)
);

CREATE TABLE agent_cp_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  working_set_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CERTIFICATE_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, working_set_id)
    REFERENCES agent_cp_working_set (account_id, working_set_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_cp_certificate_catalog (account_id, source_certificate_id)
);

CREATE TABLE agent_cp_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  working_set_id UUID NOT NULL,
  intent_status cp_refresh_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL
    CHECK (length(canonical_request_hash) = 64),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, refresh_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id),
  FOREIGN KEY (account_id, working_set_id)
    REFERENCES agent_cp_working_set (account_id, working_set_id)
);

CREATE TABLE agent_cp_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'COMPILE', 'SEAL', 'VECTOR', 'INVALIDATE', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id)
);

CREATE TABLE agent_cp_terminal_record (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  session_id UUID NOT NULL,
  refresh_id UUID,
  conflict_id UUID,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id)
);

CREATE TABLE agent_cp_command_result (
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

CREATE TABLE agent_cp_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_cp_audit_event (
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

CREATE TABLE agent_cp_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_cp_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status cp_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cp_session (account_id, session_id)
);

CREATE TABLE agent_cp_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_cp_profile()
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
       OR NEW.compile_threshold IS DISTINCT FROM OLD.compile_threshold
       OR NEW.max_slots_per_packet IS DISTINCT FROM OLD.max_slots_per_packet
       OR NEW.max_nominated_certificates
         IS DISTINCT FROM OLD.max_nominated_certificates
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
    IF current_setting('app.cp_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.cp_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_cp_profile_protect
BEFORE INSERT OR UPDATE ON agent_cp_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_cp_profile();

CREATE FUNCTION protect_agent_cp_profile_placement_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status cp_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_cp_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile placement rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_cp_profile_placement_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_cp_profile_placement_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_cp_profile_placement_rule();

CREATE FUNCTION protect_agent_cp_working_set_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_slot$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_certificate_id IS DISTINCT FROM OLD.source_certificate_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.slot_ordinal IS DISTINCT FROM OLD.slot_ordinal
       OR NEW.source_certificate_kind IS DISTINCT FROM OLD.source_certificate_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.working_set_id IS DISTINCT FROM OLD.working_set_id THEN
      RAISE EXCEPTION 'working-set slot identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.placement_kind = 'RESTORED_WITHOUT_WINNER'
     AND NEW.source_certificate_kind IN (
       'SEALED_FREEZE_CERT',
       'SEALED_BREACH_CERT',
       'SEALED_EXTEND_CERT',
       'SEALED_CONTAIN_CERT'
     ) THEN
    RAISE EXCEPTION 'halt-leak fence blocks restored placement from halted certificate';
  END IF;

  IF NEW.placement_kind = 'HALTED'
     AND NEW.source_certificate_kind = 'SEALED_THAW_CERT' THEN
    RAISE EXCEPTION 'thaw-restore fence blocks halted placement from thaw certificate';
  END IF;

  RETURN NEW;
END
$protect_slot$;

CREATE TRIGGER agent_cp_working_set_slot_protect
BEFORE INSERT OR UPDATE ON agent_cp_working_set_slot
FOR EACH ROW EXECUTE FUNCTION protect_agent_cp_working_set_slot();

CREATE FUNCTION protect_agent_cp_refresh_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_refresh$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'refresh intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.provider_idempotency_key
       IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.working_set_id IS DISTINCT FROM NEW.working_set_id THEN
    RAISE EXCEPTION 'prepared refresh identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_refresh$;

CREATE TRIGGER agent_cp_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_cp_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_cp_refresh_intent();

CREATE FUNCTION approve_agent_cp_profile(
  tenant_id BIGINT,
  recipient_profile_id UUID,
  recipient_profile_version INTEGER,
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
  stored_status cp_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cp_profile
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'profile approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO rule_count
  FROM agent_cp_profile_placement_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one placement rule';
  END IF;

  PERFORM set_config(
    'app.cp_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_cp_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_cp_profile(
  tenant_id BIGINT,
  recipient_profile_id UUID,
  recipient_profile_version INTEGER,
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
  stored_status cp_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cp_profile
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
  FOR UPDATE;

  IF length(expected_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM expected_definition_hash THEN
    RAISE EXCEPTION 'profile revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.cp_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_cp_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_cp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cp_profile_authority;
ALTER FUNCTION revoke_agent_cp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cp_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_cp_profile_authority;
GRANT SELECT ON
  agent_cp_profile,
  agent_cp_profile_placement_rule
TO agent_cp_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cp_profile TO agent_cp_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_cp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_cp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cp_profile FROM PUBLIC;

CREATE INDEX agent_cp_session_work_idx ON agent_cp_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_cp_session_profile_idx ON agent_cp_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_cp_slot_working_set_idx ON agent_cp_working_set_slot (
  account_id, working_set_id, sealed_at DESC, slot_id
);
CREATE INDEX agent_cp_slot_certificate_idx ON agent_cp_working_set_slot (
  account_id, source_certificate_id, sealed_at DESC, slot_id
);
CREATE INDEX agent_cp_catalog_ref_idx ON agent_cp_certificate_catalog (
  account_id, certificate_ref, sealed_at DESC, source_certificate_id
);
CREATE INDEX agent_cp_catalog_kind_idx ON agent_cp_certificate_catalog (
  account_id, source_certificate_kind, sealed_at DESC, source_certificate_id
);
CREATE INDEX agent_cp_compile_session_idx ON agent_cp_compile_receipt (
  account_id, session_id, compiled_at DESC, compile_id
);
CREATE INDEX agent_cp_working_set_session_idx ON agent_cp_working_set (
  account_id, session_id, sealed_at DESC, working_set_id
);
CREATE INDEX agent_cp_refresh_work_idx ON agent_cp_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_cp_audit_time_idx ON agent_cp_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_cp_perception_status_idx ON agent_cp_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_cp_command_expiry_idx ON agent_cp_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_cp_invalidation_working_set_idx ON agent_cp_invalidation (
  account_id, working_set_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_cp_authorization_evidence',
    'agent_cp_profile',
    'agent_cp_profile_placement_rule',
    'agent_cp_certificate_catalog',
    'agent_cp_session',
    'agent_cp_nomination_receipt',
    'agent_cp_compile_receipt',
    'agent_cp_working_set',
    'agent_cp_working_set_slot',
    'agent_cp_invalidation',
    'agent_cp_refresh_intent',
    'agent_cp_budget_ledger',
    'agent_cp_terminal_record',
    'agent_cp_command_result',
    'agent_cp_audit_head',
    'agent_cp_audit_event',
    'agent_cp_audit_anchor',
    'agent_cp_perception_snapshot',
    'agent_cp_projection_checkpoint'
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

Open, nominate, compile, seal, invalidate, and notify-prepare each run in a
single ACID row-store transaction with session CAS. Working-set seal never
joins a columnar rebuild or HNSW mutation.

### 8.2 Tenant isolation

Forced RLS on every table uses `app.account_id`. Composite primary keys and
every access index lead with `account_id`. Missing tenant context yields no
rows, not a cross-tenant scan.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
notify work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentCpSessionStatus {
  OPEN
  NOMINATING
  COMPILING
  SEALED
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentCpSlotStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentCpSourceKind {
  SEALED_FREEZE_CERT
  SEALED_BREACH_CERT
  SEALED_THAW_CERT
  SEALED_EXTEND_CERT
  SEALED_CONTAIN_CERT
  SUPERSEDED_CERT
}

enum AgentCpPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentCpRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentCpNextAction {
  NOMINATE_SOURCE_CERTIFICATE
  COMPILE_WORKING_SET
  SEAL_WORKING_SET
  INVALIDATE_PLACEMENT
  PREPARE_PLACEMENT_NOTIFY
  RESOLVE_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentCpBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CERTIFICATE_MISSING
  COMPILE_NOT_READY
  HALT_LEAK_DENIED
  THAW_RESTORE_DENIED
  HASH_MISMATCH
  SLOT_THRESHOLD_NOT_MET
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentCpUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentCpInvalidationReason {
  SUPERSEDED
  RETRACTED
  QUARANTINED
  CERTIFICATE_REVOKED
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentCpBudget {
  nominateUnits: Long!
  compileUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  compileThreshold: Int!
  maxSlotsPerPacket: Int!
  maxNominatedCertificates: Int!
}

type AgentCpProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  compileThreshold: Int!
  maxSlotsPerPacket: Int!
  maxNominatedCertificates: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentCpSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentCpSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentCpBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentCpNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceCertificateId: ID!
  sourceCertificateKind: AgentCpSourceKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  haltScopeHash: SHA256!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentCpCompileReceipt {
  accountId: ID!
  compileId: ID!
  sessionId: ID!
  placementSetHash: SHA256!
  haltScopeHash: SHA256!
  disputedFactSetHash: SHA256!
  compileHash: SHA256!
  compiledAt: DateTime!
}

type AgentCpWorkingSet {
  accountId: ID!
  workingSetId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  haltScopeHash: SHA256!
  disputedFactSetHash: SHA256!
  placementSetHash: SHA256!
  slotWatermark: Int!
  sealedAt: DateTime!
}

type AgentCpSlot {
  accountId: ID!
  slotId: ID!
  workingSetId: ID!
  sessionId: ID!
  sourceCertificateId: ID!
  sourceCertificateKind: AgentCpSourceKind!
  slotOrdinal: Int!
  status: AgentCpSlotStatus!
  placementKind: AgentCpPlacementKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentCpNotifyObservation {
  refreshId: ID!
  status: AgentCpRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentCpPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentCpSessionStatus!
  summary: AgentUntrustedText!
  sealedSlotCount: Int!
  haltedSlotCount: Int!
  restoredSlotCount: Int!
  omittedSlotCount: Int!
  invalidatedSlotCount: Int!
  uncertainNotifyIntents: [AgentCpNotifyObservation!]!
  remainingBudget: AgentCpBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentCpNextAction!]!
  blockedReasons: [AgentCpBlockedReason!]!
  cardHash: SHA256!
}

type AgentCpMutationResult {
  decision: String!
  session: AgentCpSession
  workingSet: AgentCpWorkingSet
  member: AgentCpSlot
  receipt: AgentCpNominationReceipt
  compile: AgentCpCompileReceipt
  perception: AgentCpPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentCpBudgetInput {
  nominateUnits: Long!
  compileUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  compileThreshold: Int!
  maxSlotsPerPacket: Int!
  maxNominatedCertificates: Int!
}

input CreateCertificatePlacementSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentCpBudgetInput!
}

input NominateSourceCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceCertificateId: ID!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input CompileWorkingSetInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedHaltScopeHash: SHA256!
  expectedDisputedFactSetHash: SHA256!
  idempotencyKey: String!
}

input SealWorkingSetInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  compileId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedPlacementSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidatePlacementInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  workingSetId: ID!
  sourceCertificateId: ID!
  reasonCode: AgentCpInvalidationReason!
  idempotencyKey: String!
}

input PreparePlacementNotifyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  workingSetId: ID!
  idempotencyKey: String!
}

input ResolvePlacementUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentCpUncertaintyResolution!
  idempotencyKey: String!
}

input AgentCpProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentCpProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentCpProfile
  agentCpSession(accountId: ID!, sessionId: ID!): AgentCpSession
  agentCpWorkingSet(accountId: ID!, workingSetId: ID!): AgentCpWorkingSet
  agentCpPerceptionCard(accountId: ID!, sessionId: ID!): AgentCpPerceptionCard
  agentCpNominatedCertificate(
    accountId: ID!
    sessionId: ID!
    sourceCertificateId: ID!
  ): AgentCpNominationReceipt
  agentCpSearchProfiles(input: AgentCpProfileSearchInput!): [AgentCpProfile!]!
}

type Mutation {
  createCertificatePlacementSession(
    input: CreateCertificatePlacementSessionInput!
  ): AgentCpMutationResult!
  nominateSourceCertificate(
    input: NominateSourceCertificateInput!
  ): AgentCpMutationResult!
  compileWorkingSet(input: CompileWorkingSetInput!): AgentCpMutationResult!
  sealWorkingSet(input: SealWorkingSetInput!): AgentCpMutationResult!
  invalidatePlacement(input: InvalidatePlacementInput!): AgentCpMutationResult!
  preparePlacementNotify(
    input: PreparePlacementNotifyInput!
  ): AgentCpMutationResult!
  resolvePlacementUncertainty(
    input: ResolvePlacementUncertaintyInput!
  ): AgentCpMutationResult!
  closeCertificatePlacementSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentCpMutationResult!
  approveCertificatePlacementProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentCpMutationResult!
  revokeCertificatePlacementProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentCpMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Compile mutations reject when slot ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.
- `sealWorkingSet` is rejected with `HALT_LEAK_DENIED` when a nominated
  freeze, breach, extend, or contain certificate would compile to
  `RESTORED_WITHOUT_WINNER`.

## 10. Procedural memory

Approved placement profiles are procedural memory: versioned instructions for
how sealed freeze, breach, thaw, extend, or contain certificates compile into
a halt-aware working set without inventing a winner and without leaking
halted bodies into agent context. Procedure refs may point to
presentation/playbook steps. Profiles are immutable after approval; agents
perceive `procedureTags` and `allowedNextActions` on perception cards, never
inventing placement policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which placement profile fits
incident freeze/thaw working-set compilation?"). Embeddings are account-owned
and must be queried with `account_id` equality. The reference schema stores
vectors but does **not** create a cross-tenant HNSW index; production builds
account-partitioned HNSW segments.

Semantic retrieval may return placement profiles only. It never authorizes
nominate, compile, seal, or notify. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_cp_profile_embedding (
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
    REFERENCES agent_cp_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed/halted/
restored/omitted/invalidated slot counts, uncertain notify intents, remaining
budgets, procedure tags, allowed next actions, and blocked reasons. Summary
text is `UntrustedText`. Cards never embed raw redacted fact bodies.
`cardHash` makes perception replayable. Agents perceive `HALTED` as continued
halt with a placement receipt, `EXTENDED_HALT` as a re-armed halt without
restore, and `RESTORED_WITHOUT_WINNER` as dual-control thaw placement without
a chosen winner — never as a compile that "must have been fine."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, compile receipts, working-set seals, and
audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed placement packets
but are not authoritative for halt, restore, or omit outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Placement notify side-effects are not silently ACID-coupled; silence becomes
`UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Slot/threshold caps on holds per packet and per session.
- Budget ledgers for NOMINATE/COMPILE/SEAL/VECTOR/INVALIDATE/NOTIFY.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped certificate-ledger, working-set, or board scans as
  **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Compilation never auto-restores neighbor-visible board reads from halted
  certificates.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding placeable certificates by scanning the freeze or thaw ledger
  (rejected; nominate by `(account_id, source_certificate_id)`).
- Compiling a working set by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all working sets for an account (rejected; use
  certificate-keyed active slot indexes).

### Required access paths

- Certificate nomination: PK `(account_id, source_certificate_id)`.
- Compile/seal: PK `(account_id, compile_id)` / `(account_id, working_set_id)`
  and unique `(account_id, session_id, consumer_ref, sealed_revision)`.
- Slots by packet/certificate: composite indexes leading with `account_id`.
- Notify work: partial indexes on refresh intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/certificate-ledger/working-set scan is **FULL SCAN REJECTED** before
execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session,
compile, and packet state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant packet via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must narrow relative to
  observation and session purposes.
- Sticky first-ACK restore after supersession: invalidation + re-compile +
  notify uncertainty + profile revocation.
- Halt leak of frozen bodies into restored slots: halt-leak fence.
- Thaw compiled back to halt without a new freeze certificate: thaw-restore
  fence.
- Inventing a winner under thaw placement: packets bind halt scope, never
  `resolved_fact_hash`.
- Silent notify success: `UNKNOWN_EFFECT` until ACK.
- Recursive certificate-ledger storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/compile/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Halt-leak rejection, thaw-restore rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow placement

Compile profiles and validate certificate nomination without durable packets.

### Phase 2: halted slots only

Allow sealed packets from nominated `SEALED_FREEZE_CERT` and
`SEALED_BREACH_CERT` observations. Halt continues.

### Phase 3: thaw placement and halt-leak fences

Enable budgeted `RESTORED_WITHOUT_WINNER` slots from thaw certificates only.

### Phase 4: notify uncertainty

Enable placement notify intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, halt-leak, thaw-restore,
  and notify start state.

### Behavioral validation

- Nominate requires sealed source-certificate point lookup and hash match.
- Compile binds halt scope and disputed fact set under budget.
- Seal is rejected when a halted certificate would restore, and never invents
  a winning fact hash.
- Working-set seal binds immutable slots under halt-scope, disputed-fact-set,
  and placement-set hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/compile/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed placement packets after process restart.

## 21. Product decision

Adopt the Certificate Placement Plane as the deterministic compilation path
for sealed freeze, breach, thaw, extend, and contain certificates from the
Executive Freeze and Thaw SLA planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the working-set
   compilation gap after thaw SLA without sticky first-ACK restore, halt leak,
   invented winners, or certificate-ledger scans.
2. Account-leading indexes, halt-leak and thaw-restore fences, and
   **FULL SCAN REJECTED** planner rules protect 99.99% neighbor latency on
   boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
