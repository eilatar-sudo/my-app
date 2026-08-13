# mondayDB Agentic Executive Freeze Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-13.v1`

## 1. Why this plane, before how

A sealed escalation-authority freeze record under `FREEZE_ON_AUTHORITY_DISAGREE`
can halt a disputed fact hash, but it does not decide **how an executive tier
may freeze and later release consumption without inventing a winner**: which
sealed freeze cases count, which distinct executive principals must freeze,
which first-tier and higher-authority disagreeing principals are excluded from
re-ruling their own freeze, which freeze casters are barred from self-release,
what purpose attenuation binds consumers, and how to do so without scanning
every freeze, ruling, or recipient refresh row in an account.

Without an executive freeze plane, agents either:

- scan every related authority disagreement, freeze event, and recipient
  session after `FREEZE_ON_AUTHORITY_DISAGREE` (neighbor-harmful on boards with
  1M+ rows and dense share graphs), or
- sticky-adopt the first executive ACK they observe, so one operator's silent
  or superseded freeze/thaw becomes workspace truth without an executive-tier
  receipt, without excluding the original disagreeing principals, and without
  preventing the same executive from freezing and then unilaterally releasing.

The product trade-off is **executive freeze fluency versus freeze/release
isolation**:

- Letting every consumer freely freeze or thaw all higher-authority
  disagreements maximizes fluency and reduces re-grounding cost, but creates
  non-deterministic winners, single-approver sticky copies, self-release
  thaws, and unauditable overrides of escalation-authority freezes.
- Compiling a sealed freeze certificate under an approved freeze profile, case
  point lookups, prior-principal exclusion fences, anti-self-release fences,
  and executive freeze/release budgets adds one bounded freeze transaction and
  short-lived certificate storage.
- Semantic similarity may discover freeze profiles, but it must never decide
  whether a freeze case may be nominated, frozen, sealed into a certificate,
  released, or notified.

The recommended model keeps the data plane deterministic:

1. An approved freeze profile defines executive freeze and release thresholds,
   allowed case kinds, prior-principal exclusion policy, anti-self-release
   policy, and how purpose must attenuate for consumer halt/restore.
2. A freeze session opens under purpose, budget, and authorization fences, and
   only nominates sealed freeze cases by point lookup from the Escalation
   Authority Plane.
3. mondayDB casts distinct-executive freeze votes under budget (excluding
   first-tier and higher-authority disagreeing principals), then seals a freeze
   certificate binding
   `consumer_ref + purpose_hash + executive_set_hash + disputed_fact_set_hash + halt_scope_hash`.
   The certificate **does not** choose a winning fact hash.
4. Distinct executives who did not freeze the case may later cast release
   votes; freeze casters cannot self-release. Upstream invalidation marks
   certificates stale; notify intents may become `UNKNOWN_EFFECT` until
   acknowledged.
5. Unscoped freeze-ledger, disagreement, or recipient scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ask every executive forever" or "thaw every peer freeze forever" loops are
rejectable before they scan boards with 1M+ rows.

### Product outcome

For any executive freeze compilation, mondayDB can answer:

- Which profile, principal, and session authorized the freeze or release
  certificate?
- Which nominated cases, freeze/release ordinals, executive principals,
  excluded prior-tier principals, disputed fact hashes, and halt scopes were
  bound?
- Is the certificate still current, invalidated, frozen, released, or awaiting
  notify?
- Did async freeze/release notify become `UNKNOWN_EFFECT`?
- Can the freeze/release history be replayed without invoking an LLM?

## 2. Scope and ownership

The Executive Freeze Plane owns:

1. Immutable approved freeze profiles as procedural memory of "how an
   executive tier may freeze `FREEZE_ON_AUTHORITY_DISAGREE` outcomes under
   distinct-executive freeze fences, prior-principal exclusion, and
   anti-self-release."
2. Tenant-scoped freeze sessions with purpose and budget fences.
3. Deterministic nomination of sealed freeze cases by point lookup — never
   disagreement-ledger or full recipient-session scans.
4. Distinct-executive freeze and release cast receipts and sealed freeze /
   release certificates that halt or restore consumption without inventing a
   winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded freeze/release budgets.

It integrates with, but does not replace:

- **Escalation Authority:** supplies sealed `FREEZE_ON_AUTHORITY_DISAGREE`
  case IDs, excluded first-tier and higher-authority principal sets, and
  invalidation events.
- **Split Resolution / Refresh Quorum / Grant Graph Visibility:** upstream
  conflict and share context that produced the freeze.
- **Fact Consumption / Grounding:** constrain what a halted or restored fact
  hash may expose.
- **Working Set / Decision Memory:** may consume sealed freeze/release
  certificates, not raw peer disagreement walks.
- **Transaction Intent / Effect Saga:** may execute freeze/release notify
  under `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves nominate, freeze, release, vector,
  and notify units.
- **Emergency Containment:** remains the coarse stop/drain/quarantine path;
  this plane is purpose-scoped freeze/release, not workspace-wide containment.

### Non-goals

- Letting an LLM decide certificate membership or the "best" freeze/thaw.
- Reconstructing authoritative freeze certificates from columnar or vector
  projections.
- Cross-account executive freeze or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external notify consumers.
- Inventing a winning fact hash when higher-authority principals disagree.
- Unbounded recursive executive-escalation or freeze-ledger walks across
  boards with 1M+ rows.

## 3. Product contract

### 3.1 Freeze profile contract

A freeze profile version is immutable after approval. It defines:

- allowed observation kinds (`FREEZE_CASE_FACT`, `SUPERSEDED_FREEZE_FACT`,
  `AUTHORITY_DISAGREE_OUTCOME`);
- executive freeze threshold and release threshold (distinct human
  principals) and max holds;
- freeze policy (`STRICT_EXECUTIVE_TIER`, `THRESHOLD_EXECUTIVE_TIER`,
  `REQUIRE_DISTINCT_RELEASE_SET`);
- purpose attenuation rules (narrowing only; never amplification for
  consumers);
- notify policy after freeze, release, or upstream invalidation;
- optional procedural refs for "how to present halted or restored truth
  without a winner."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
sessions; in-flight sessions follow the captured revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures policy and ACL
revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Certificate contract

Nominating a sealed freeze observation returns a nomination receipt. Casting a
freeze binds observation, freeze ordinal, disputed fact hash, halt scope hash,
and further attenuation hash. Sealing a freeze certificate binds
`consumer_ref`, `purpose_hash`, `executive_set_hash`,
`disputed_fact_set_hash`, and `halt_scope_hash`. Certificate holds never mutate
identity; invalidation, notify, or release creates a new state transition and
optional notify intent. Freeze certificates **must not** emit a
`resolved_fact_hash` winner. Release casts are rejected when the executive
already froze the same case (anti-self-release fence).

### 3.4 Invalidation and refresh contract

Invalidations bind certificates to upstream case revocation. Notify
intents start as `PREPARED`, may become `UNKNOWN_EFFECT` when the notify
consumer does not acknowledge, and never invent success from silence.

### 3.5 Availability contract

Executive freeze control-plane APIs target 99.99% availability for open,
nominate, freeze, seal, release, and perception reads. External notify
side-effects are best-effort and surfaced as uncertainty rather than silent
success.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and freeze rules are immutable.
4. Certificate hold identity
   (`case_id`, `disputed_fact_hash`, `attenuation_hash`, `hold_ordinal`) is
   immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Case nomination uses point lookup by
   `(account_id, case_id)` — never full freeze-ledger scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/freeze/seal/release/notify.
10. First-tier and higher-authority principals recorded on the sealed freeze
    case cannot cast executive freeze or release votes on that case
    (prior-principal exclusion fence).
11. An executive who cast a freeze on a case cannot cast a release on the same
    case (anti-self-release fence).
12. Freeze certificates bind halt scope and disputed fact set hashes; they
    never invent a winning fact hash.
13. Plans that require unscoped board, session, or freeze-ledger scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate executive freeze rules. Approval validates
definition hash, requires at least one freeze rule, and fences the status
transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and freeze

Nominate looks up a sealed freeze observation by primary key, verifies
observation kind and purpose attenuation, and emits a nomination receipt.
Cast freeze binds one observation under CAS and freeze budgets.

### 5.4 Seal freeze certificate

Seal materializes immutable certificate holds from accepted freeze casts,
applies the executive freeze policy / threshold, and binds
`executive_set_hash`, `disputed_fact_set_hash`, and `halt_scope_hash` under
the session purpose hash. The seal **does not** choose a winner among
disputed fact hashes.

### 5.5 Release, invalidate, and notify

Distinct executives who did not freeze the case may cast release votes under
release budgets. Invalidation marks certificates stale when upstream
observations revoke or supersede. Optional notify intents retally freeze or
release to consumers; unresolved external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and freeze rules. No session may open.

### 6.2 Session open

An approved profile opens a freeze session with budgets and fences.

### 6.3 Freeze certificate sealed

Accepted freeze votes meeting threshold seal a freeze certificate that halts
consumption for a consumer purpose.

### 6.4 Released / invalidated / notifying

Distinct executives may seal a release certificate. Upstream observation
changes invalidate certificates; optional notify intents retally under
uncertainty honesty.

### 6.5 Terminal states

Sessions close, expire, cancel, fail, quarantine, or remain
`UNKNOWN_EFFECT` until human/provider resolution.

### 6.6 Retain

Audit anchors and sealed freeze/release certificates remain replayable after
session close; operational freeze votes follow retention policy without
weakening immutability.

## 7. TypeScript contracts

These interfaces are the service boundary for executive freeze and release.
IDs are opaque; resolvers validate formats and never infer `accountId` from an
object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CaseId = string;
type CertificateId = string;
type HoldId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_CASE"
  | "CAST_FREEZE"
  | "SEAL_FREEZE_CERTIFICATE"
  | "CAST_RELEASE"
  | "PREPARE_FREEZE_NOTIFY"
  | "RESOLVE_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type FreezeBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CASE_MISSING"
  | "PRIOR_PRINCIPAL_EXCLUDED"
  | "SELF_RELEASE_DENIED"
  | "HASH_MISMATCH"
  | "EXECUTIVE_THRESHOLD_NOT_MET"
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
  | "FREEZING"
  | "FROZEN"
  | "RELEASING"
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

type CaseKind = "FREEZE_CASE_FACT" | "SUPERSEDED_FREEZE_FACT" | "AUTHORITY_DISAGREE_OUTCOME";
type CertificateKind = "FREEZE" | "RELEASE";
type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface ExecutiveFreezeBudget {
  readonly nominateUnits: number;
  readonly freezeUnits: number;
  readonly releaseUnits: number;
  readonly vectorUnits: number;
  readonly sealUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly freezeThreshold: number;
  readonly releaseThreshold: number;
  readonly maxHoldsPerCertificate: number;
}

interface ExecutiveFreezeProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly freezeThreshold: number;
  readonly releaseThreshold: number;
  readonly maxHoldsPerCertificate: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ExecutiveFreezeSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ExecutiveFreezeBudget;
  readonly consumed: Omit<
    ExecutiveFreezeBudget,
    "maxWallTimeMs" | "freezeThreshold" | "releaseThreshold" | "maxHoldsPerCertificate"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface CaseNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly caseId: CaseId;
  readonly caseKind: CaseKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly excludedPrincipalIds: readonly string[];
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface FreezeCertificateHold {
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

interface FreezeCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly certificateKind: CertificateKind;
  readonly executiveSetHash: Sha256;
  readonly disputedFactSetHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly holdWatermark: number;
  readonly sealedAt: Timestamp;
}

interface FreezeNotifyObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentExecutiveFreezePerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedHoldCount: number;
  readonly invalidatedHoldCount: number;
  readonly uncertainNotifyIntents: readonly FreezeNotifyObservation[];
  readonly remainingBudget: Omit<
    ExecutiveFreezeBudget,
    "maxWallTimeMs" | "freezeThreshold" | "releaseThreshold" | "maxHoldsPerCertificate"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly FreezeBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateExecutiveFreezeSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ExecutiveFreezeBudget;
}

interface NominateFreezeCaseInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly caseId: CaseId;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface CastExecutiveFreezeInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly priorCaseId: CaseId | null;
  readonly caseId: CaseId;
  readonly executivePrincipalId: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealFreezeCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedExecutiveSetHash: Sha256;
  readonly expectedDisputedFactSetHash: Sha256;
  readonly expectedHaltScopeHash: Sha256;
  readonly idempotencyKey: string;
}

interface CastExecutiveReleaseInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly caseId: CaseId;
  readonly executivePrincipalId: string;
  readonly expectedHaltScopeHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface PrepareFreezeNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveFreezeUncertaintyInput {
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

interface CloseExecutiveFreezeSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ExecutiveFreezeDecision =
  | { readonly decision: "ALLOWED"; readonly session: ExecutiveFreezeSession;
      readonly certificate?: FreezeCertificate; readonly member?: FreezeCertificateHold;
      readonly receipt?: CaseNominationReceipt;
      readonly perception: AgentExecutiveFreezePerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: FreezeBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentExecutiveFreezePerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production binding may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE ef_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE ef_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'FREEZING', 'FROZEN', 'RELEASING', 'REFRESHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ef_hold_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE ef_case_kind AS ENUM (
  'FREEZE_CASE_FACT', 'SUPERSEDED_FREEZE_FACT', 'AUTHORITY_DISAGREE_OUTCOME'
);
CREATE TYPE ef_certificate_kind AS ENUM ('FREEZE', 'RELEASE');
CREATE TYPE ef_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ef_case_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_ef_profile_authority NOLOGIN;

CREATE TABLE agent_ef_authorization_evidence (
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

CREATE TABLE agent_ef_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status ef_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  freeze_threshold SMALLINT NOT NULL
    CHECK (freeze_threshold BETWEEN 1 AND 8),
  release_threshold SMALLINT NOT NULL
    CHECK (release_threshold BETWEEN 1 AND 8),
  max_holds_per_certificate SMALLINT NOT NULL
    CHECK (max_holds_per_certificate BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_FREEZE', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_ef_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_ef_profile_freeze_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_case_kinds TEXT[] NOT NULL,
  freeze_threshold SMALLINT NOT NULL CHECK (freeze_threshold BETWEEN 1 AND 8),
  release_threshold SMALLINT NOT NULL CHECK (release_threshold BETWEEN 1 AND 8),
  require_notify BOOLEAN NOT NULL,
  freeze_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_ef_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_ef_freeze_catalog (
  account_id BIGINT NOT NULL,
  case_id UUID NOT NULL,
  source_freeze_id UUID NOT NULL,
  escalation_session_id UUID NOT NULL,
  case_ref TEXT NOT NULL,
  case_kind ef_case_kind NOT NULL,
  status ef_case_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  excluded_principal_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, case_id),
  UNIQUE (account_id, source_freeze_id, case_kind),
  CHECK (cardinality(excluded_principal_ids) BETWEEN 0 AND 64)
);

CREATE TABLE agent_ef_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status ef_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_freeze_units BIGINT NOT NULL CHECK (budget_freeze_units >= 0),
  budget_release_units BIGINT NOT NULL CHECK (budget_release_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_freeze_units BIGINT NOT NULL CHECK (consumed_freeze_units >= 0),
  consumed_release_units BIGINT NOT NULL CHECK (consumed_release_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  freeze_threshold SMALLINT NOT NULL
    CHECK (freeze_threshold BETWEEN 1 AND 8),
  release_threshold SMALLINT NOT NULL
    CHECK (release_threshold BETWEEN 1 AND 8),
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
    REFERENCES agent_ef_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_ef_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_freeze_units <= budget_freeze_units),
  CHECK (consumed_release_units <= budget_release_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_ef_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  case_kind ef_case_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, case_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ef_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ef_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_ef_freeze_cast (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_case_id UUID,
  case_id UUID NOT NULL,
  executive_principal_id TEXT NOT NULL,
  freeze_ordinal SMALLINT NOT NULL CHECK (freeze_ordinal BETWEEN 1 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  freeze_hash CHAR(64) NOT NULL CHECK (length(freeze_hash) = 64),
  cast_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, session_id, case_id, freeze_ordinal),
  UNIQUE (account_id, session_id, executive_principal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ef_session (account_id, session_id),
  FOREIGN KEY (account_id, prior_case_id)
    REFERENCES agent_ef_freeze_catalog (account_id, case_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ef_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_ef_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  certificate_kind ef_certificate_kind NOT NULL,
  executive_set_hash CHAR(64) NOT NULL CHECK (length(executive_set_hash) = 64),
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
    REFERENCES agent_ef_session (account_id, session_id)
);

CREATE TABLE agent_ef_certificate_hold (
  account_id BIGINT NOT NULL,
  hold_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  case_kind ef_case_kind NOT NULL,
  hold_ordinal SMALLINT NOT NULL CHECK (hold_ordinal BETWEEN 0 AND 8),
  status ef_hold_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, hold_id),
  UNIQUE (account_id, certificate_id, case_id, hold_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ef_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ef_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ef_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_ef_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  case_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CASE_REVOKED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ef_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ef_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_ef_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status ef_refresh_status NOT NULL,
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
    REFERENCES agent_ef_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ef_certificate (account_id, certificate_id)
);

CREATE TABLE agent_ef_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('NOMINATE', 'FREEZE', 'RELEASE', 'VECTOR', 'SEAL', 'NOTIFY')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ef_session (account_id, session_id)
);

CREATE TABLE agent_ef_release_cast (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  executive_principal_id TEXT NOT NULL,
  release_ordinal SMALLINT NOT NULL CHECK (release_ordinal BETWEEN 1 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  release_hash CHAR(64) NOT NULL CHECK (length(release_hash) = 64),
  cast_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, session_id, case_id, release_ordinal),
  UNIQUE (account_id, session_id, executive_principal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ef_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ef_freeze_catalog (account_id, case_id)
);

CREATE TABLE agent_ef_terminal_record (
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
    REFERENCES agent_ef_session (account_id, session_id)
);

CREATE TABLE agent_ef_command_result (
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

CREATE TABLE agent_ef_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_ef_audit_event (
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

CREATE TABLE agent_ef_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_ef_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status ef_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ef_session (account_id, session_id)
);

CREATE TABLE agent_ef_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_ef_profile()
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
       OR NEW.freeze_threshold IS DISTINCT FROM OLD.freeze_threshold
       OR NEW.release_threshold IS DISTINCT FROM OLD.release_threshold
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
    IF current_setting('app.ef_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.ef_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_ef_profile_protect
BEFORE INSERT OR UPDATE ON agent_ef_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_ef_profile();

CREATE FUNCTION protect_agent_ef_profile_freeze_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status ef_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_ef_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile freeze rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_ef_profile_freeze_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_ef_profile_freeze_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_ef_profile_freeze_rule();

CREATE FUNCTION protect_agent_ef_certificate_hold()
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

CREATE TRIGGER agent_ef_certificate_hold_protect
BEFORE UPDATE ON agent_ef_certificate_hold
FOR EACH ROW EXECUTE FUNCTION protect_agent_ef_certificate_hold();

CREATE FUNCTION protect_agent_ef_freeze_cast_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_exclusion$
DECLARE
  excluded TEXT[];
BEGIN
  SELECT excluded_principal_ids INTO excluded
  FROM agent_ef_freeze_catalog
  WHERE account_id = NEW.account_id
    AND case_id = NEW.case_id;

  IF excluded IS NULL THEN
    RAISE EXCEPTION 'freeze case missing for freeze cast';
  END IF;

  IF NEW.executive_principal_id = ANY (excluded) THEN
    RAISE EXCEPTION 'prior-principal exclusion fence blocks freeze cast';
  END IF;

  RETURN NEW;
END
$protect_exclusion$;

CREATE TRIGGER agent_ef_freeze_cast_exclusion_protect
BEFORE INSERT OR UPDATE ON agent_ef_freeze_cast
FOR EACH ROW EXECUTE FUNCTION protect_agent_ef_freeze_cast_exclusion();

CREATE FUNCTION protect_agent_ef_release_cast_fences()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_release$
DECLARE
  excluded TEXT[];
  freeze_exists BOOLEAN;
BEGIN
  SELECT excluded_principal_ids INTO excluded
  FROM agent_ef_freeze_catalog
  WHERE account_id = NEW.account_id
    AND case_id = NEW.case_id;

  IF excluded IS NULL THEN
    RAISE EXCEPTION 'freeze case missing for release cast';
  END IF;

  IF NEW.executive_principal_id = ANY (excluded) THEN
    RAISE EXCEPTION 'prior-principal exclusion fence blocks release cast';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM agent_ef_freeze_cast
    WHERE account_id = NEW.account_id
      AND case_id = NEW.case_id
      AND executive_principal_id = NEW.executive_principal_id
  ) INTO freeze_exists;

  IF freeze_exists THEN
    RAISE EXCEPTION 'anti-self-release fence blocks release cast';
  END IF;

  RETURN NEW;
END
$protect_release$;

CREATE TRIGGER agent_ef_release_cast_fences_protect
BEFORE INSERT OR UPDATE ON agent_ef_release_cast
FOR EACH ROW EXECUTE FUNCTION protect_agent_ef_release_cast_fences();

CREATE FUNCTION protect_agent_ef_refresh_intent()
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

CREATE TRIGGER agent_ef_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_ef_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_ef_refresh_intent();

CREATE FUNCTION approve_agent_ef_profile(
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
  stored_status ef_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ef_profile
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
  FROM agent_ef_profile_freeze_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one freeze rule';
  END IF;

  PERFORM set_config(
    'app.ef_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_ef_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_ef_profile(
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
  stored_status ef_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ef_profile
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
    'app.ef_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_ef_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_ef_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ef_profile_authority;
ALTER FUNCTION revoke_agent_ef_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ef_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_ef_profile_authority;
GRANT SELECT ON
  agent_ef_profile,
  agent_ef_profile_freeze_rule
TO agent_ef_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ef_profile TO agent_ef_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_ef_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_ef_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ef_profile FROM PUBLIC;

CREATE INDEX agent_ef_session_work_idx ON agent_ef_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_ef_session_profile_idx ON agent_ef_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_ef_hold_certificate_idx ON agent_ef_certificate_hold (
  account_id, certificate_id, sealed_at DESC, hold_id
);
CREATE INDEX agent_ef_hold_case_idx ON agent_ef_certificate_hold (
  account_id, case_id, sealed_at DESC, hold_id
);
CREATE INDEX agent_ef_case_ref_idx ON agent_ef_freeze_catalog (
  account_id, case_ref, sealed_at DESC, case_id
);
CREATE INDEX agent_ef_case_binding_idx ON agent_ef_freeze_catalog (
  account_id, source_freeze_id, sealed_at DESC, case_id
);
CREATE INDEX agent_ef_freeze_session_idx ON agent_ef_freeze_cast (
  account_id, session_id, freeze_ordinal, cast_at DESC
);
CREATE INDEX agent_ef_release_session_idx ON agent_ef_release_cast (
  account_id, session_id, release_ordinal, cast_at DESC
);
CREATE INDEX agent_ef_refresh_work_idx ON agent_ef_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_ef_audit_time_idx ON agent_ef_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_ef_perception_status_idx ON agent_ef_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_ef_command_expiry_idx ON agent_ef_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_ef_invalidation_certificate_idx ON agent_ef_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_ef_authorization_evidence',
    'agent_ef_profile',
    'agent_ef_profile_freeze_rule',
    'agent_ef_freeze_catalog',
    'agent_ef_session',
    'agent_ef_nomination_receipt',
    'agent_ef_freeze_cast',
    'agent_ef_certificate',
    'agent_ef_certificate_hold',
    'agent_ef_invalidation',
    'agent_ef_refresh_intent',
    'agent_ef_budget_ledger',
    'agent_ef_release_cast',
    'agent_ef_terminal_record',
    'agent_ef_command_result',
    'agent_ef_audit_head',
    'agent_ef_audit_event',
    'agent_ef_audit_anchor',
    'agent_ef_perception_snapshot',
    'agent_ef_projection_checkpoint'
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

Open session, nominate case, cast freeze, seal freeze/release certificates,
cast release, prepare notify, and audit-chain append commit in one ACID
transaction per command. External notify acknowledgement is out of band.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers must `set_config('app.account_id', ...)`
before any read or write. Composite indexes all lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
notify work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentEfSessionStatus {
  OPEN
  NOMINATING
  FREEZING
  FROZEN
  RELEASING
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentEfHoldStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentEfCaseKind {
  FREEZE_CASE_FACT
  SUPERSEDED_FREEZE_FACT
  AUTHORITY_DISAGREE_OUTCOME
}

enum AgentEfCertificateKind {
  FREEZE
  RELEASE
}

enum AgentEfRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentEfNextAction {
  NOMINATE_CASE
  CAST_FREEZE
  SEAL_FREEZE_CERTIFICATE
  CAST_RELEASE
  PREPARE_FREEZE_NOTIFY
  RESOLVE_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentEfBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CASE_MISSING
  PRIOR_PRINCIPAL_EXCLUDED
  SELF_RELEASE_DENIED
  HASH_MISMATCH
  EXECUTIVE_THRESHOLD_NOT_MET
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentEfUncertaintyResolution {
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

type AgentEfBudget {
  nominateUnits: Long!
  freezeUnits: Long!
  releaseUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  freezeThreshold: Int!
  releaseThreshold: Int!
  maxHoldsPerCertificate: Int!
}

type AgentEfProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  freezeThreshold: Int!
  releaseThreshold: Int!
  maxHoldsPerCertificate: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentEfSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentEfSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentEfBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentEfNominationReceipt {
  accountId: ID!
  sessionId: ID!
  caseId: ID!
  caseKind: AgentEfCaseKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  excludedPrincipalIds: [ID!]!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentEfCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  certificateKind: AgentEfCertificateKind!
  executiveSetHash: SHA256!
  disputedFactSetHash: SHA256!
  haltScopeHash: SHA256!
  holdWatermark: Int!
  sealedAt: DateTime!
}

type AgentEfHold {
  accountId: ID!
  holdId: ID!
  certificateId: ID!
  sessionId: ID!
  caseId: ID!
  caseKind: AgentEfCaseKind!
  holdOrdinal: Int!
  status: AgentEfHoldStatus!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentEfNotifyObservation {
  refreshId: ID!
  status: AgentEfRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentEfPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentEfSessionStatus!
  summary: AgentUntrustedText!
  sealedHoldCount: Int!
  invalidatedHoldCount: Int!
  uncertainNotifyIntents: [AgentEfNotifyObservation!]!
  remainingBudget: AgentEfBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentEfNextAction!]!
  blockedReasons: [AgentEfBlockedReason!]!
  cardHash: SHA256!
}

type AgentEfMutationResult {
  decision: String!
  session: AgentEfSession
  certificate: AgentEfCertificate
  member: AgentEfHold
  receipt: AgentEfNominationReceipt
  perception: AgentEfPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentEfBudgetInput {
  nominateUnits: Long!
  freezeUnits: Long!
  releaseUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  freezeThreshold: Int!
  releaseThreshold: Int!
  maxHoldsPerCertificate: Int!
}

input CreateExecutiveFreezeSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentEfBudgetInput!
}

input NominateFreezeCaseInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  caseId: ID!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input CastExecutiveFreezeInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  priorCaseId: ID
  caseId: ID!
  executivePrincipalId: ID!
  expectedDisputedFactHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealFreezeCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedExecutiveSetHash: SHA256!
  expectedDisputedFactSetHash: SHA256!
  expectedHaltScopeHash: SHA256!
  idempotencyKey: String!
}

input CastExecutiveReleaseInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  caseId: ID!
  executivePrincipalId: ID!
  expectedHaltScopeHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input PrepareFreezeNotifyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveFreezeUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentEfUncertaintyResolution!
  idempotencyKey: String!
}

input CloseExecutiveFreezeSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentEfProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentEfProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentEfProfile
  agentEfSession(accountId: ID!, sessionId: ID!): AgentEfSession
  agentEfCertificate(accountId: ID!, certificateId: ID!): AgentEfCertificate
  agentEfPerceptionCard(accountId: ID!, sessionId: ID!): AgentEfPerceptionCard
  agentEfNominatedCase(
    accountId: ID!
    sessionId: ID!
    caseId: ID!
  ): AgentEfNominationReceipt
  agentEfSearchProfiles(input: AgentEfProfileSearchInput!): [AgentEfProfile!]!
}

type Mutation {
  createExecutiveFreezeSession(
    input: CreateExecutiveFreezeSessionInput!
  ): AgentEfMutationResult!
  nominateFreezeCase(input: NominateFreezeCaseInput!): AgentEfMutationResult!
  castExecutiveFreeze(
    input: CastExecutiveFreezeInput!
  ): AgentEfMutationResult!
  sealFreezeCertificate(
    input: SealFreezeCertificateInput!
  ): AgentEfMutationResult!
  castExecutiveRelease(
    input: CastExecutiveReleaseInput!
  ): AgentEfMutationResult!
  prepareFreezeNotify(
    input: PrepareFreezeNotifyInput!
  ): AgentEfMutationResult!
  resolveFreezeUncertainty(
    input: ResolveFreezeUncertaintyInput!
  ): AgentEfMutationResult!
  closeExecutiveFreezeSession(
    input: CloseExecutiveFreezeSessionInput!
  ): AgentEfMutationResult!
  approveExecutiveFreezeProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentEfMutationResult!
  revokeExecutiveFreezeProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentEfMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Freeze and release mutations reject when ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.

## 10. Procedural memory

Approved freeze profiles are procedural memory: versioned instructions for how
executive humans may freeze and later release `FREEZE_ON_AUTHORITY_DISAGREE`
conflicts without inventing a winner. Procedure refs may point to
presentation/playbook steps. Profiles are immutable after approval; agents
perceive `procedureTags` and `allowedNextActions` on perception cards, never
inventing freeze or thaw policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which freeze profile fits
incident executive freeze cases?"). Embeddings are account-owned and must be
queried with `account_id` equality. The reference schema stores vectors but
does **not** create a cross-tenant HNSW index; production builds
account-partitioned HNSW segments.

Semantic retrieval may return freeze profiles only. It never authorizes
nominate, freeze, seal, release, or notify. Vector `topK` is budgeted and
clamped.

```sql
CREATE TABLE agent_ef_profile_embedding (
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
    REFERENCES agent_ef_profile (account_id, profile_id, profile_version)
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
replayable. Agents perceive freeze as a halt of consumption, not as a chosen
winner.

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, freeze/release casts, certificate seals, and
audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed freeze certificates
but are not authoritative for freeze or release outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Freeze/release notify side-effects are not silently ACID-coupled; silence
becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Freeze/release/threshold caps on holds per certificate and per session.
- Budget ledgers for NOMINATE/FREEZE/RELEASE/VECTOR/SEAL/NOTIFY.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped freeze-ledger/board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Nominating observations by scanning recipient or sharing sessions (rejected).
- Casting freeze/release by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  observation-keyed active certificate hold indexes).

### Required access paths

- Observation nomination: PK `(account_id, case_id)`.
- Holds by certificate/observation: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on refresh intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/freeze-ledger scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session and
certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must narrow relative to
  observation and session purposes.
- Sticky first-ACK freeze or thaw after supersession: invalidation +
  executive re-freeze + notify uncertainty + profile revocation.
- Self-release by the same executive who froze: anti-self-release fence.
- Silent notify success: `UNKNOWN_EFFECT` until ACK.
- Recursive peer-freeze storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.
- Inventing a winner under `FREEZE_ON_AUTHORITY_DISAGREE`: freeze certificates
  bind halt scope, never `resolved_fact_hash`.

## 18. Observability and SLOs

- Open/nominate/freeze/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Notify ACK lag and `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow executive freeze

Compile profiles and validate case nomination without durable certificates.

### Phase 2: single-case freeze certificates only

Allow sealed freeze certificates for executive freeze threshold 1 from
nominated `FREEZE_CASE_FACT` observations.

### Phase 3: dual-control freeze and anti-self-release

Enable budgeted multi-observation freeze under approved profiles, with
distinct-executive release.

### Phase 4: notify uncertainty

Enable freeze/release notify intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, prior-principal
  exclusion, anti-self-release, and notify start state.

### Behavioral validation

- Nominate requires sealed observation point lookup and hash match.
- Freeze binds disputed fact hash and ordinal under budget.
- Seal binds immutable certificate holds under executive-set, disputed-fact-set,
  and halt-scope hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/freeze/release path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed freeze certificates after process restart.

## 21. Product decision

Adopt the Executive Freeze Plane as the deterministic executive path for
`FREEZE_ON_AUTHORITY_DISAGREE` outcomes from the Escalation Authority Plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the freeze-gap
   after higher-authority disagreement without sticky first-ACK adoption,
   self-release thaws, or inventing a winning fact hash.
2. Account-leading indexes, distinct-executive freeze/release constraints, and
   **FULL SCAN REJECTED** planner rules protect 99.99% neighbor latency on
   boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
