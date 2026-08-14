# mondayDB Agentic Thaw SLA Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-14.v1`

## 1. Why this plane, before how

A sealed executive freeze certificate can halt consumption under
`FREEZE_ON_AUTHORITY_DISAGREE`, but it does not decide **how an unreleased
freeze may expire under a timed dual-control thaw SLA without auto-restoring
disputed facts**: which sealed freeze certificates count, when the SLA clock
starts, which freeze casters and prior-tier principals are excluded from thaw,
which distinct thaw stewards must dual-control restore or extend, and how to
do so without scanning every freeze, clock, or recipient row in an account.

Without a thaw SLA plane, operators and agents either:

- scan every frozen certificate, freeze-ledger hold, and recipient session
  looking for "overdue" freezes (neighbor-harmful on boards with 1M+ rows), or
- sticky-adopt wall-clock silence as thaw, so a missed executive ACK becomes
  workspace restore without a steward receipt, without excluding the original
  freeze casters, and without preventing the same executive from freezing and
  then unilaterally thawing after a timeout.

The product trade-off is **availability fluency versus freeze/thaw isolation**:

- Auto-thawing every freeze when a deadline elapses maximizes 99.99% consumer
  availability and reduces re-grounding cost, but creates non-deterministic
  restores, single-approver sticky copies, self-thaw after self-freeze, and
  unauditable overrides of executive halt scope.
- Compiling a sealed thaw-SLA certificate under an approved profile, freeze
  point lookups, deterministic clocks from `freeze_sealed_at + sla_ms`,
  prior-principal exclusion, anti-self-thaw fences, and steward budgets adds
  one bounded SLA transaction and short-lived certificate storage.
- Semantic similarity may discover thaw-SLA profiles, but it must never decide
  whether a freeze certificate may be nominated, a clock armed, a breach
  sealed, a thaw cast, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved thaw-SLA profile defines deadline duration, allowed freeze
   kinds, steward thaw/extend thresholds, prior-principal exclusion, and
   anti-self-thaw policy. Clock expiry **never** auto-restores facts.
2. A thaw-SLA session opens under purpose, budget, and authorization fences,
   and only nominates sealed freeze certificates by point lookup from the
   Executive Freeze Plane.
3. mondayDB arms a clock whose `deadline_at` is a pure function of
   `freeze_sealed_at + sla_duration_ms`. Watchdog work is a budgeted point
   lookup, not a freeze-ledger scan.
4. After deadline, distinct thaw stewards (excluding freeze casters and
   prior-tier principals) may dual-control seal `THAW`, `EXTEND`, or
   `CONTAIN`. Clock expiry alone may only seal `BREACH` — halt continues with
   an honest SLA-breach receipt and **no** winning fact hash.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped freeze-ledger, clock, or recipient scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ask every overdue freeze forever" or "thaw every peer freeze forever" loops
are rejectable before they scan boards with 1M+ rows. Liveness is restored by
dual-control stewards, not by magic timeouts inside the engine.

### Product outcome

For any thaw-SLA compilation, mondayDB can answer:

- Which profile, principal, and session authorized the clock, breach, thaw,
  extend, or contain certificate?
- Which nominated freeze certificates, freeze-sealed timestamps, deadlines,
  excluded freeze casters, disputed fact hashes, and halt scopes were bound?
- Is the certificate still current, invalidated, breached, thawed, extended,
  contained, or awaiting notify?
- Did async thaw/breach notify become `UNKNOWN_EFFECT`?
- Can the SLA history be replayed without invoking an LLM?

## 2. Scope and ownership

The Thaw SLA Plane owns:

1. Immutable approved thaw-SLA profiles as procedural memory of "how an
   unreleased executive freeze may breach a deadline and later thaw, extend,
   or contain under distinct-steward fences, prior-principal exclusion, and
   anti-self-thaw."
2. Tenant-scoped thaw-SLA sessions with purpose and budget fences.
3. Deterministic nomination of sealed freeze certificates by point lookup —
   never freeze-ledger or full recipient-session scans.
4. Deterministic SLA clocks, budgeted watchdog ticks, and sealed
   breach/thaw/extend/contain certificates that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded thaw-SLA budgets.

It integrates with, but does not replace:

- **Executive Freeze:** supplies sealed freeze certificate IDs, freeze caster
  sets, excluded prior-tier principals, halt scopes, and invalidation events.
- **Escalation Authority / Split Resolution / Refresh Quorum:** upstream
  conflict context that produced the freeze.
- **Emergency Containment:** the coarse stop/drain/quarantine path used when
  stewards seal `CONTAIN`; this plane is purpose-scoped SLA thaw, not
  workspace-wide containment.
- **Fact Consumption / Grounding:** constrain what a halted or restored fact
  hash may expose.
- **Working Set / Decision Memory:** may consume sealed thaw-SLA certificates,
  not raw overdue-freeze walks.
- **Transaction Intent / Effect Saga:** may execute thaw/breach notify under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves nominate, arm, thaw, vector, seal,
  and notify units.

### Non-goals

- Letting an LLM decide certificate membership or that a freeze "feels overdue."
- Auto-restoring disputed facts when a wall clock elapses.
- Reconstructing authoritative thaw certificates from columnar or vector
  projections.
- Cross-account thaw SLA or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external notify consumers.
- Inventing a winning fact hash when a freeze is thawed or extended.
- Unbounded recursive overdue-freeze or freeze-ledger walks across boards
  with 1M+ rows.

## 3. Product contract

### 3.1 Thaw-SLA profile contract

A thaw-SLA profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_FREEZE_CERT`, `SUPERSEDED_FREEZE_CERT`,
  `UNRELEASED_FREEZE_HOLD`);
- SLA duration bounds, steward thaw threshold and extend threshold (distinct
  human principals), and max holds;
- thaw policy (`DUAL_CONTROL_AFTER_BREACH`, `THRESHOLD_STEWARD_TIER`,
  `REQUIRE_DISTINCT_EXTEND_SET`);
- purpose attenuation rules (narrowing only; never amplification);
- notify policy after breach, thaw, extend, contain, or upstream invalidation;
- optional procedural refs for "how to present halted, restored, or extended
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

### 3.3 Clock and certificate contract

Nominating a sealed freeze certificate returns a nomination receipt. Arming a
clock binds `freeze_sealed_at`, `sla_duration_ms`, and
`deadline_at = freeze_sealed_at + sla_duration_ms`. Sealing a `BREACH`
certificate is allowed only after `deadline_at` and **does not** restore
consumption. Casting a thaw/extend/contain vote binds observation, steward
ordinal, halt scope hash, and further attenuation hash. Sealing a thaw
certificate binds
`consumer_ref + purpose_hash + steward_set_hash + disputed_fact_set_hash + halt_scope_hash`.
Certificates **must not** emit a `resolved_fact_hash` winner. Thaw casts are
rejected when the steward froze the same case (anti-self-thaw fence).

### 3.4 Invalidation and refresh contract

Invalidations bind certificates to upstream freeze revocation or release.
Notify intents start as `PREPARED`, may become `UNKNOWN_EFFECT` when the
notify consumer does not acknowledge, and never invent success from silence.

### 3.5 Availability contract

Thaw-SLA control-plane APIs target 99.99% availability for open, nominate,
arm, seal, thaw, and perception reads. External notify side-effects are
best-effort and surfaced as uncertainty rather than silent success. Clock
expiry must not silently restore neighbor-impacting board reads.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and thaw-SLA rules are immutable.
4. Certificate hold identity
   (`case_id`, `disputed_fact_hash`, `attenuation_hash`, `hold_ordinal`) is
   immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Freeze nomination uses point lookup by
   `(account_id, case_id)` — never full freeze-ledger scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/arm/seal/thaw/notify.
10. Freeze casters and prior-tier principals recorded on the sealed freeze
    case cannot cast thaw, extend, or contain votes (prior-principal
    exclusion and anti-self-thaw fences).
11. Clock expiry may seal `BREACH` only; it never auto-seals `THAW`.
12. Thaw/extend/contain certificates bind halt scope and disputed fact set
    hashes; they never invent a winning fact hash.
13. Plans that require unscoped board, session, clock, or freeze-ledger scans
    are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate thaw-SLA rules. Approval validates definition hash,
requires at least one thaw rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and arm

Nominate looks up a sealed freeze observation by primary key, verifies
observation kind and purpose attenuation, and emits a nomination receipt.
Arm clock binds freeze sealed-at, SLA duration, and deadline under CAS and
arm budgets.

### 5.4 Seal breach certificate

After `deadline_at`, seal materializes immutable `BREACH` holds from the
armed clock. Halt continues. The seal **does not** choose a winner among
disputed fact hashes and **does not** restore consumption.

### 5.5 Thaw, extend, contain, invalidate, and notify

Distinct thaw stewards who did not freeze the case may cast thaw, extend, or
contain votes under thaw budgets. Invalidation marks certificates stale when
upstream freeze observations revoke, release, or supersede. Optional notify
intents retally breach or thaw to consumers; unresolved external effects
become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and thaw-SLA rules. No session may open.

### 6.2 Session open

An authorized principal opens a session against an `APPROVED` profile.
Budgets and purpose hashes are captured.

### 6.3 Clock armed

A freeze certificate is nominated by point lookup and the SLA clock is armed.
Watchdog ticks consume budget against that clock's primary key.

### 6.4 Breached / thawed / extended / contained

Deadline elapsed → `BREACH` certificate. Dual-control stewards may later seal
`THAW`, `EXTEND`, or `CONTAIN`. Notify may enter `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`. Terminal records
are append-only.

### 6.6 Retain

Audit events, certificates, clocks, and terminal records retain per account
retention policy for replay. Vector profile embeddings follow the same
account-scoped watermark as the approved definition hash.

## 7. TypeScript contracts

These interfaces are the service boundary for thaw SLA, breach, and dual-control
thaw. IDs are opaque; resolvers validate formats and never infer `accountId`
from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CaseId = string;
type ClockId = string;
type CertificateId = string;
type HoldId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_FREEZE_CERTIFICATE"
  | "ARM_THAW_CLOCK"
  | "SEAL_BREACH_CERTIFICATE"
  | "CAST_THAW_STEWARD"
  | "SEAL_THAW_CERTIFICATE"
  | "PREPARE_THAW_NOTIFY"
  | "RESOLVE_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type ThawBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CASE_MISSING"
  | "CLOCK_NOT_ARMED"
  | "DEADLINE_NOT_ELAPSED"
  | "PRIOR_PRINCIPAL_EXCLUDED"
  | "SELF_THAW_DENIED"
  | "HASH_MISMATCH"
  | "STEWARD_THRESHOLD_NOT_MET"
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
  | "ARMED"
  | "BREACHED"
  | "THAWING"
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

type CaseKind =
  | "SEALED_FREEZE_CERT"
  | "SUPERSEDED_FREEZE_CERT"
  | "UNRELEASED_FREEZE_HOLD";
type CertificateKind = "BREACH" | "THAW" | "EXTEND" | "CONTAIN";
type StewardVoteKind = "THAW" | "EXTEND" | "CONTAIN";
type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface ThawSlaBudget {
  readonly nominateUnits: number;
  readonly armUnits: number;
  readonly thawUnits: number;
  readonly vectorUnits: number;
  readonly sealUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly thawThreshold: number;
  readonly extendThreshold: number;
  readonly slaDurationMs: number;
  readonly maxHoldsPerCertificate: number;
}

interface ThawSlaProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly thawThreshold: number;
  readonly extendThreshold: number;
  readonly slaDurationMs: number;
  readonly maxHoldsPerCertificate: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ThawSlaSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ThawSlaBudget;
  readonly consumed: Omit<
    ThawSlaBudget,
    | "maxWallTimeMs"
    | "thawThreshold"
    | "extendThreshold"
    | "slaDurationMs"
    | "maxHoldsPerCertificate"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface FreezeNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly caseId: CaseId;
  readonly caseKind: CaseKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly freezeCasterIds: readonly string[];
  readonly excludedPrincipalIds: readonly string[];
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface ThawClock {
  readonly accountId: AccountId;
  readonly clockId: ClockId;
  readonly sessionId: SessionId;
  readonly caseId: CaseId;
  readonly freezeSealedAt: Timestamp;
  readonly slaDurationMs: number;
  readonly deadlineAt: Timestamp;
  readonly clockHash: Sha256;
  readonly armedAt: Timestamp;
}

interface ThawCertificateHold {
  readonly accountId: AccountId;
  readonly holdId: HoldId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly caseId: CaseId;
  readonly caseKind: CaseKind;
  readonly holdOrdinal: number;
  readonly status: MemberStatus;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface ThawSlaCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly certificateKind: CertificateKind;
  readonly stewardSetHash: Sha256;
  readonly disputedFactSetHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly holdWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ThawNotifyObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentThawSlaPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedHoldCount: number;
  readonly invalidatedHoldCount: number;
  readonly uncertainNotifyIntents: readonly ThawNotifyObservation[];
  readonly remainingBudget: Omit<
    ThawSlaBudget,
    | "maxWallTimeMs"
    | "thawThreshold"
    | "extendThreshold"
    | "slaDurationMs"
    | "maxHoldsPerCertificate"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ThawBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateThawSlaSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ThawSlaBudget;
}

interface NominateFreezeCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly caseId: CaseId;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface ArmThawClockInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly caseId: CaseId;
  readonly expectedFreezeSealedAt: Timestamp;
  readonly expectedSlaDurationMs: number;
  readonly idempotencyKey: string;
}

interface SealBreachCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly clockId: ClockId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedHaltScopeHash: Sha256;
  readonly idempotencyKey: string;
}

interface CastThawStewardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly caseId: CaseId;
  readonly stewardPrincipalId: string;
  readonly voteKind: StewardVoteKind;
  readonly expectedHaltScopeHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealThawCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly consumerRef: ConsumerRef;
  readonly certificateKind: Exclude<CertificateKind, "BREACH">;
  readonly expectedPurposeHash: Sha256;
  readonly expectedStewardSetHash: Sha256;
  readonly expectedDisputedFactSetHash: Sha256;
  readonly expectedHaltScopeHash: Sha256;
  readonly idempotencyKey: string;
}

interface PrepareThawNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveThawUncertaintyInput {
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

interface CloseThawSlaSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ThawSlaDecision =
  | { readonly decision: "ALLOWED"; readonly session: ThawSlaSession;
      readonly certificate?: ThawSlaCertificate; readonly member?: ThawCertificateHold;
      readonly receipt?: FreezeNominationReceipt; readonly clock?: ThawClock;
      readonly perception: AgentThawSlaPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ThawBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentThawSlaPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE th_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE th_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'ARMED', 'BREACHED', 'THAWING', 'REFRESHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE th_hold_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE th_case_kind AS ENUM (
  'SEALED_FREEZE_CERT', 'SUPERSEDED_FREEZE_CERT', 'UNRELEASED_FREEZE_HOLD'
);
CREATE TYPE th_certificate_kind AS ENUM ('BREACH', 'THAW', 'EXTEND', 'CONTAIN');
CREATE TYPE th_vote_kind AS ENUM ('THAW', 'EXTEND', 'CONTAIN');
CREATE TYPE th_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE th_case_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_th_profile_authority NOLOGIN;

CREATE TABLE agent_th_authorization_evidence (
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

CREATE TABLE agent_th_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status th_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  thaw_threshold SMALLINT NOT NULL
    CHECK (thaw_threshold BETWEEN 1 AND 8),
  extend_threshold SMALLINT NOT NULL
    CHECK (extend_threshold BETWEEN 1 AND 8),
  sla_duration_ms BIGINT NOT NULL
    CHECK (sla_duration_ms BETWEEN 1000 AND 2592000000),
  max_holds_per_certificate SMALLINT NOT NULL
    CHECK (max_holds_per_certificate BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_ARM', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_th_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_th_profile_thaw_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_case_kinds TEXT[] NOT NULL,
  thaw_threshold SMALLINT NOT NULL CHECK (thaw_threshold BETWEEN 1 AND 8),
  extend_threshold SMALLINT NOT NULL CHECK (extend_threshold BETWEEN 1 AND 8),
  sla_duration_ms BIGINT NOT NULL
    CHECK (sla_duration_ms BETWEEN 1000 AND 2592000000),
  require_notify BOOLEAN NOT NULL,
  thaw_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_th_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_th_freeze_catalog (
  account_id BIGINT NOT NULL,
  case_id UUID NOT NULL,
  source_freeze_certificate_id UUID NOT NULL,
  freeze_session_id UUID NOT NULL,
  case_ref TEXT NOT NULL,
  case_kind th_case_kind NOT NULL,
  status th_case_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  freeze_sealed_at TIMESTAMPTZ NOT NULL,
  freeze_caster_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  excluded_principal_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, case_id),
  UNIQUE (account_id, source_freeze_certificate_id, case_kind),
  CHECK (cardinality(freeze_caster_ids) BETWEEN 0 AND 64),
  CHECK (cardinality(excluded_principal_ids) BETWEEN 0 AND 64)
);

CREATE TABLE agent_th_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status th_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_arm_units BIGINT NOT NULL CHECK (budget_arm_units >= 0),
  budget_thaw_units BIGINT NOT NULL CHECK (budget_thaw_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_arm_units BIGINT NOT NULL CHECK (consumed_arm_units >= 0),
  consumed_thaw_units BIGINT NOT NULL CHECK (consumed_thaw_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  thaw_threshold SMALLINT NOT NULL
    CHECK (thaw_threshold BETWEEN 1 AND 8),
  extend_threshold SMALLINT NOT NULL
    CHECK (extend_threshold BETWEEN 1 AND 8),
  sla_duration_ms BIGINT NOT NULL
    CHECK (sla_duration_ms BETWEEN 1000 AND 2592000000),
  max_holds_per_certificate SMALLINT NOT NULL
    CHECK (max_holds_per_certificate BETWEEN 1 AND 256),
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
    REFERENCES agent_th_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_th_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_arm_units <= budget_arm_units),
  CHECK (consumed_thaw_units <= budget_thaw_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_th_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  case_kind th_case_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, case_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_th_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_th_clock_arm (
  account_id BIGINT NOT NULL,
  clock_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  freeze_sealed_at TIMESTAMPTZ NOT NULL,
  sla_duration_ms BIGINT NOT NULL
    CHECK (sla_duration_ms BETWEEN 1000 AND 2592000000),
  deadline_at TIMESTAMPTZ NOT NULL,
  clock_hash CHAR(64) NOT NULL CHECK (length(clock_hash) = 64),
  armed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, clock_id),
  UNIQUE (account_id, session_id, case_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_th_freeze_catalog (account_id, case_id),
  CHECK (deadline_at > freeze_sealed_at)
);

CREATE TABLE agent_th_thaw_cast (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  steward_principal_id TEXT NOT NULL,
  vote_kind th_vote_kind NOT NULL,
  thaw_ordinal SMALLINT NOT NULL CHECK (thaw_ordinal BETWEEN 1 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  thaw_hash CHAR(64) NOT NULL CHECK (length(thaw_hash) = 64),
  cast_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, session_id, case_id, thaw_ordinal),
  UNIQUE (account_id, session_id, steward_principal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_th_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_th_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  certificate_kind th_certificate_kind NOT NULL,
  steward_set_hash CHAR(64) NOT NULL CHECK (length(steward_set_hash) = 64),
  disputed_fact_set_hash CHAR(64) NOT NULL
    CHECK (length(disputed_fact_set_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  hold_watermark SMALLINT NOT NULL CHECK (hold_watermark BETWEEN 0 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, certificate_kind, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id)
);

CREATE TABLE agent_th_certificate_hold (
  account_id BIGINT NOT NULL,
  hold_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  case_kind th_case_kind NOT NULL,
  hold_ordinal SMALLINT NOT NULL CHECK (hold_ordinal BETWEEN 0 AND 8),
  status th_hold_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, hold_id),
  UNIQUE (account_id, certificate_id, case_id, hold_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_th_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_th_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_th_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  case_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CASE_REVOKED', 'FREEZE_RELEASED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_th_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_th_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_th_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status th_refresh_status NOT NULL,
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
    REFERENCES agent_th_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_th_certificate (account_id, certificate_id)
);

CREATE TABLE agent_th_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('NOMINATE', 'ARM', 'THAW', 'VECTOR', 'SEAL', 'NOTIFY')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id)
);

CREATE TABLE agent_th_terminal_record (
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
    REFERENCES agent_th_session (account_id, session_id)
);

CREATE TABLE agent_th_command_result (
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

CREATE TABLE agent_th_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_th_audit_event (
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

CREATE TABLE agent_th_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_th_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status th_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_th_session (account_id, session_id)
);

CREATE TABLE agent_th_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_th_profile()
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
       OR NEW.thaw_threshold IS DISTINCT FROM OLD.thaw_threshold
       OR NEW.extend_threshold IS DISTINCT FROM OLD.extend_threshold
       OR NEW.sla_duration_ms IS DISTINCT FROM OLD.sla_duration_ms
       OR NEW.max_holds_per_certificate
         IS DISTINCT FROM OLD.max_holds_per_certificate
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
    IF current_setting('app.th_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.th_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_th_profile_protect
BEFORE INSERT OR UPDATE ON agent_th_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_th_profile();

CREATE FUNCTION protect_agent_th_profile_thaw_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status th_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_th_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile thaw rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_th_profile_thaw_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_th_profile_thaw_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_th_profile_thaw_rule();

CREATE FUNCTION protect_agent_th_certificate_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.hold_ordinal IS DISTINCT FROM OLD.hold_ordinal
       OR NEW.case_kind IS DISTINCT FROM OLD.case_kind
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'certificate hold identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_th_certificate_hold_protect
BEFORE UPDATE ON agent_th_certificate_hold
FOR EACH ROW EXECUTE FUNCTION protect_agent_th_certificate_hold();

CREATE FUNCTION protect_agent_th_thaw_cast_fences()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_thaw$
DECLARE
  excluded TEXT[];
  casters TEXT[];
BEGIN
  SELECT excluded_principal_ids, freeze_caster_ids
    INTO excluded, casters
  FROM agent_th_freeze_catalog
  WHERE account_id = NEW.account_id
    AND case_id = NEW.case_id;

  IF excluded IS NULL THEN
    RAISE EXCEPTION 'freeze case missing for thaw cast';
  END IF;

  IF NEW.steward_principal_id = ANY (excluded) THEN
    RAISE EXCEPTION 'prior-principal exclusion fence blocks thaw cast';
  END IF;

  IF casters IS NOT NULL
     AND NEW.steward_principal_id = ANY (casters) THEN
    RAISE EXCEPTION 'anti-self-thaw fence blocks thaw cast';
  END IF;

  RETURN NEW;
END
$protect_thaw$;

CREATE TRIGGER agent_th_thaw_cast_fences_protect
BEFORE INSERT OR UPDATE ON agent_th_thaw_cast
FOR EACH ROW EXECUTE FUNCTION protect_agent_th_thaw_cast_fences();

CREATE FUNCTION protect_agent_th_refresh_intent()
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
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared refresh identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_refresh$;

CREATE TRIGGER agent_th_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_th_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_th_refresh_intent();

CREATE FUNCTION approve_agent_th_profile(
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
  stored_status th_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_th_profile
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
  FROM agent_th_profile_thaw_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one thaw rule';
  END IF;

  PERFORM set_config(
    'app.th_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_th_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_th_profile(
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
  stored_status th_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_th_profile
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
    'app.th_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_th_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_th_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_th_profile_authority;
ALTER FUNCTION revoke_agent_th_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_th_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_th_profile_authority;
GRANT SELECT ON
  agent_th_profile,
  agent_th_profile_thaw_rule
TO agent_th_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_th_profile TO agent_th_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_th_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_th_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_th_profile FROM PUBLIC;

CREATE INDEX agent_th_session_work_idx ON agent_th_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_th_session_profile_idx ON agent_th_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_th_hold_certificate_idx ON agent_th_certificate_hold (
  account_id, certificate_id, sealed_at DESC, hold_id
);
CREATE INDEX agent_th_hold_case_idx ON agent_th_certificate_hold (
  account_id, case_id, sealed_at DESC, hold_id
);
CREATE INDEX agent_th_case_ref_idx ON agent_th_freeze_catalog (
  account_id, case_ref, sealed_at DESC, case_id
);
CREATE INDEX agent_th_case_binding_idx ON agent_th_freeze_catalog (
  account_id, source_freeze_certificate_id, sealed_at DESC, case_id
);
CREATE INDEX agent_th_clock_deadline_idx ON agent_th_clock_arm (
  account_id, deadline_at, session_id, clock_id
);
CREATE INDEX agent_th_thaw_session_idx ON agent_th_thaw_cast (
  account_id, session_id, thaw_ordinal, cast_at DESC
);
CREATE INDEX agent_th_refresh_work_idx ON agent_th_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_th_audit_time_idx ON agent_th_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_th_perception_status_idx ON agent_th_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_th_command_expiry_idx ON agent_th_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_th_invalidation_certificate_idx ON agent_th_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_th_authorization_evidence',
    'agent_th_profile',
    'agent_th_profile_thaw_rule',
    'agent_th_freeze_catalog',
    'agent_th_session',
    'agent_th_nomination_receipt',
    'agent_th_clock_arm',
    'agent_th_thaw_cast',
    'agent_th_certificate',
    'agent_th_certificate_hold',
    'agent_th_invalidation',
    'agent_th_refresh_intent',
    'agent_th_budget_ledger',
    'agent_th_terminal_record',
    'agent_th_command_result',
    'agent_th_audit_head',
    'agent_th_audit_event',
    'agent_th_audit_anchor',
    'agent_th_perception_snapshot',
    'agent_th_projection_checkpoint'
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

Open, nominate, arm, seal, thaw-cast, invalidate, and notify-prepare each run
in a single ACID row-store transaction with session CAS. Clock arm and
certificate seal never join a columnar rebuild or HNSW mutation.

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

enum AgentThSessionStatus {
  OPEN
  NOMINATING
  ARMED
  BREACHED
  THAWING
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentThHoldStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentThCaseKind {
  SEALED_FREEZE_CERT
  SUPERSEDED_FREEZE_CERT
  UNRELEASED_FREEZE_HOLD
}

enum AgentThCertificateKind {
  BREACH
  THAW
  EXTEND
  CONTAIN
}

enum AgentThVoteKind {
  THAW
  EXTEND
  CONTAIN
}

enum AgentThRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentThNextAction {
  NOMINATE_FREEZE_CERTIFICATE
  ARM_THAW_CLOCK
  SEAL_BREACH_CERTIFICATE
  CAST_THAW_STEWARD
  SEAL_THAW_CERTIFICATE
  PREPARE_THAW_NOTIFY
  RESOLVE_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentThBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CASE_MISSING
  CLOCK_NOT_ARMED
  DEADLINE_NOT_ELAPSED
  PRIOR_PRINCIPAL_EXCLUDED
  SELF_THAW_DENIED
  HASH_MISMATCH
  STEWARD_THRESHOLD_NOT_MET
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentThUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentThBudget {
  nominateUnits: Long!
  armUnits: Long!
  thawUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  thawThreshold: Int!
  extendThreshold: Int!
  slaDurationMs: Long!
  maxHoldsPerCertificate: Int!
}

type AgentThProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  thawThreshold: Int!
  extendThreshold: Int!
  slaDurationMs: Long!
  maxHoldsPerCertificate: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentThSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentThSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentThBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentThNominationReceipt {
  accountId: ID!
  sessionId: ID!
  caseId: ID!
  caseKind: AgentThCaseKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  freezeCasterIds: [ID!]!
  excludedPrincipalIds: [ID!]!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentThClock {
  accountId: ID!
  clockId: ID!
  sessionId: ID!
  caseId: ID!
  freezeSealedAt: DateTime!
  slaDurationMs: Long!
  deadlineAt: DateTime!
  clockHash: SHA256!
  armedAt: DateTime!
}

type AgentThCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  certificateKind: AgentThCertificateKind!
  stewardSetHash: SHA256!
  disputedFactSetHash: SHA256!
  haltScopeHash: SHA256!
  holdWatermark: Int!
  sealedAt: DateTime!
}

type AgentThHold {
  accountId: ID!
  holdId: ID!
  certificateId: ID!
  sessionId: ID!
  caseId: ID!
  caseKind: AgentThCaseKind!
  holdOrdinal: Int!
  status: AgentThHoldStatus!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentThNotifyObservation {
  refreshId: ID!
  status: AgentThRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentThPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentThSessionStatus!
  summary: AgentUntrustedText!
  sealedHoldCount: Int!
  invalidatedHoldCount: Int!
  uncertainNotifyIntents: [AgentThNotifyObservation!]!
  remainingBudget: AgentThBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentThNextAction!]!
  blockedReasons: [AgentThBlockedReason!]!
  cardHash: SHA256!
}

type AgentThMutationResult {
  decision: String!
  session: AgentThSession
  certificate: AgentThCertificate
  member: AgentThHold
  receipt: AgentThNominationReceipt
  clock: AgentThClock
  perception: AgentThPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentThBudgetInput {
  nominateUnits: Long!
  armUnits: Long!
  thawUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  thawThreshold: Int!
  extendThreshold: Int!
  slaDurationMs: Long!
  maxHoldsPerCertificate: Int!
}

input CreateThawSlaSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentThBudgetInput!
}

input NominateFreezeCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  caseId: ID!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input ArmThawClockInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  caseId: ID!
  expectedFreezeSealedAt: DateTime!
  expectedSlaDurationMs: Long!
  idempotencyKey: String!
}

input SealBreachCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  clockId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedHaltScopeHash: SHA256!
  idempotencyKey: String!
}

input CastThawStewardInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  caseId: ID!
  stewardPrincipalId: ID!
  voteKind: AgentThVoteKind!
  expectedHaltScopeHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealThawCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  consumerRef: String!
  certificateKind: AgentThCertificateKind!
  expectedPurposeHash: SHA256!
  expectedStewardSetHash: SHA256!
  expectedDisputedFactSetHash: SHA256!
  expectedHaltScopeHash: SHA256!
  idempotencyKey: String!
}

input PrepareThawNotifyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveThawUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentThUncertaintyResolution!
  idempotencyKey: String!
}

input AgentThProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentThProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentThProfile
  agentThSession(accountId: ID!, sessionId: ID!): AgentThSession
  agentThCertificate(accountId: ID!, certificateId: ID!): AgentThCertificate
  agentThPerceptionCard(accountId: ID!, sessionId: ID!): AgentThPerceptionCard
  agentThNominatedCase(
    accountId: ID!
    sessionId: ID!
    caseId: ID!
  ): AgentThNominationReceipt
  agentThSearchProfiles(input: AgentThProfileSearchInput!): [AgentThProfile!]!
}

type Mutation {
  createThawSlaSession(
    input: CreateThawSlaSessionInput!
  ): AgentThMutationResult!
  nominateFreezeCertificate(
    input: NominateFreezeCertificateInput!
  ): AgentThMutationResult!
  armThawClock(input: ArmThawClockInput!): AgentThMutationResult!
  sealBreachCertificate(
    input: SealBreachCertificateInput!
  ): AgentThMutationResult!
  castThawSteward(input: CastThawStewardInput!): AgentThMutationResult!
  sealThawCertificate(input: SealThawCertificateInput!): AgentThMutationResult!
  prepareThawNotify(input: PrepareThawNotifyInput!): AgentThMutationResult!
  resolveThawUncertainty(
    input: ResolveThawUncertaintyInput!
  ): AgentThMutationResult!
  approveThawSlaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentThMutationResult!
  revokeThawSlaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentThMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Thaw mutations reject when ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.
- `sealBreachCertificate` is rejected with `DEADLINE_NOT_ELAPSED` when the
  armed clock's `deadline_at` is still in the future.

## 10. Procedural memory

Approved thaw-SLA profiles are procedural memory: versioned instructions for
how distinct thaw stewards may breach, thaw, extend, or contain an unreleased
executive freeze without inventing a winner and without auto-restoring on
clock expiry. Procedure refs may point to presentation/playbook steps.
Profiles are immutable after approval; agents perceive `procedureTags` and
`allowedNextActions` on perception cards, never inventing thaw policy from
embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which thaw-SLA profile fits
incident executive freeze deadlines?"). Embeddings are account-owned and must
be queried with `account_id` equality. The reference schema stores vectors but
does **not** create a cross-tenant HNSW index; production builds
account-partitioned HNSW segments.

Semantic retrieval may return thaw-SLA profiles only. It never authorizes
nominate, arm, seal, thaw, or notify. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_th_profile_embedding (
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
    REFERENCES agent_th_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed/invalidated
hold counts, uncertain notify intents, remaining budgets, procedure tags,
allowed next actions, and blocked reasons. Summary text is `UntrustedText`.
Cards never embed raw redacted fact bodies. `cardHash` makes perception
replayable. Agents perceive `BREACH` as continued halt with an SLA receipt,
and `THAW` as dual-control restore without a chosen winner — never as a
timeout that "must have been fine."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, clock arms, thaw casts, certificate seals,
and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed thaw-SLA
certificates but are not authoritative for breach, thaw, extend, or contain
outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Thaw/breach notify side-effects are not silently ACID-coupled; silence
becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Thaw/extend/threshold caps on holds per certificate and per session.
- Budget ledgers for NOMINATE/ARM/THAW/VECTOR/SEAL/NOTIFY.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped freeze-ledger, clock, or board scans as
  **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Clock expiry never auto-restores neighbor-visible board reads.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding overdue freezes by scanning the freeze ledger or all clocks in an
  account (rejected; arm and tick by `(account_id, case_id)` / clock PK).
- Casting thaw by walking all notify intents for an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  freeze-keyed active certificate hold indexes).

### Required access paths

- Freeze nomination: PK `(account_id, case_id)`.
- Clock arm/tick: PK `(account_id, clock_id)` and unique
  `(account_id, session_id, case_id)`.
- Holds by certificate/observation: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on refresh intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/freeze-ledger/clock scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session,
clock, and certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must narrow relative to
  observation and session purposes.
- Sticky first-ACK thaw after supersession: invalidation + steward re-thaw +
  notify uncertainty + profile revocation.
- Self-thaw by the same executive who froze: anti-self-thaw fence.
- Auto-restore on timeout: clock expiry seals `BREACH` only.
- Silent notify success: `UNKNOWN_EFFECT` until ACK.
- Recursive overdue-freeze storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.
- Inventing a winner under thaw: certificates bind halt scope, never
  `resolved_fact_hash`.

## 18. Observability and SLOs

- Open/nominate/arm/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- SLA-breach age, thaw ACK lag, and `UNKNOWN_EFFECT` rate as first-class
  metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow thaw SLA

Compile profiles and validate freeze nomination and clock arm without durable
certificates.

### Phase 2: breach certificates only

Allow sealed `BREACH` certificates after deadline from nominated
`SEALED_FREEZE_CERT` observations. Halt continues.

### Phase 3: dual-control thaw and anti-self-thaw

Enable budgeted steward thaw/extend under approved profiles, excluding freeze
casters.

### Phase 4: notify uncertainty

Enable thaw/breach notify intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, prior-principal
  exclusion, anti-self-thaw, and notify start state.

### Behavioral validation

- Nominate requires sealed freeze-certificate point lookup and hash match.
- Arm binds freeze sealed-at and SLA duration under budget.
- Breach seal is rejected before deadline and never restores consumption.
- Thaw seal binds immutable certificate holds under steward-set,
  disputed-fact-set, and halt-scope hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/arm/thaw path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed thaw-SLA certificates after process restart.

## 21. Product decision

Adopt the Thaw SLA Plane as the deterministic liveness path for unreleased
executive freeze certificates from the Executive Freeze Plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the liveness gap
   after executive freeze without sticky first-ACK thaw, self-thaw, auto-restore
   on timeout, or inventing a winning fact hash.
2. Account-leading indexes, distinct-steward thaw constraints, deterministic
   clocks, and **FULL SCAN REJECTED** planner rules protect 99.99% neighbor
   latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
