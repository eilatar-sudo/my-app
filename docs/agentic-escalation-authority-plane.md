# mondayDB Agentic Escalation Authority Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-12.v1`

## 1. Why this plane, before how

A sealed split-resolution escalation record under `ESCALATE_ON_DISAGREE` can
open a higher-authority gap, but it does not decide **how a higher-authority
tier may converge on one resolved fact hash**: which sealed disagreement cases
count, which distinct authority principals must rule, which first-tier
approvers are excluded from re-ruling their own split, what purpose attenuation
binds consumers, and how to do so without scanning every disagreement or
recipient refresh row in an account.

Without an escalation authority plane, agents either:

- scan every related disagreement, first-tier assent, and recipient session
  after a split (neighbor-harmful on boards with 1M+ rows and dense share
  graphs), or
- sticky-adopt the first higher-tier ACK they observe, so one operator's silent
  or superseded choice becomes workspace truth without an authority-tier
  receipt and without excluding the original disagreeing principals.

The product trade-off is **escalation fluency versus higher-authority isolation**:

- Letting every consumer freely reconcile all first-tier disagreements maximizes
  fluency and reduces re-grounding cost, but creates non-deterministic winners,
  single-approver sticky copies, and unauditable overrides of split-resolution
  escalations.
- Compiling a sealed escalation certificate under an approved escalation
  profile, case point lookups, prior-principal exclusion fences, and
  higher-authority ruling budgets adds one bounded escalation transaction and
  short-lived certificate storage.
- Semantic similarity may discover escalation profiles, but it must never decide
  whether an escalation case may be nominated, ruled, sealed into a
  certificate, or refreshed.

The recommended model keeps the data plane deterministic:

1. An approved escalation profile defines higher-authority thresholds, allowed
   case kinds, prior-principal exclusion policy, authority policy, and how
   purpose must attenuate for consumer reuse.
2. An escalation session opens under purpose, budget, and authorization fences,
   and only nominates sealed escalation cases by point lookup from the Split
   Resolution Plane.
3. mondayDB casts distinct-authority rulings under budget (excluding first-tier
   disagreeing principals), then seals an escalation certificate binding
   `consumer_ref + purpose_hash + authority_set_hash + resolved_fact_hash`.
4. Upstream invalidation marks certificates stale; refresh intents may become
   `UNKNOWN_EFFECT` until acknowledged.
5. Unscoped disagreement/recipient scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ask every human forever" or "reconcile every peer disagreement forever" loops
are rejectable before they scan boards with 1M+ rows.

### Product outcome

For any escalation authority compilation, mondayDB can answer:

- Which profile, principal, and session authorized the certificate?
- Which nominated cases, ruling ordinals, authority principals, excluded
  first-tier principals, and resolved fact hashes were bound?
- Is the certificate still current, invalidated, frozen, or awaiting refresh?
- Did async certificate refresh become `UNKNOWN_EFFECT`?
- Can the higher-authority history be replayed without invoking an LLM?

## 2. Scope and ownership

The Escalation Authority Plane owns:

1. Immutable approved escalation profiles as procedural memory of "how a higher-
   authority tier may resolve `ESCALATE_ON_DISAGREE` outcomes under
   distinct-authority ruling fences and prior-principal exclusion."
2. Tenant-scoped escalation sessions with purpose and budget fences.
3. Deterministic nomination of sealed escalation cases by point lookup —
   never disagreement-ledger or full recipient-session scans.
4. Distinct-authority ruling cast receipts and sealed escalation certificates.
5. Invalidation and refresh intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded ruling budgets.

It integrates with, but does not replace:

- **Split Resolution:** supplies sealed `ESCALATE_ON_DISAGREE` case IDs, excluded
  first-tier principal sets, and invalidation events.
- **Refresh Quorum / Grant Graph Visibility:** upstream conflict and share
  context that produced the split.
- **Fact Consumption / Grounding:** constrain what a winning fact hash may
  expose.
- **Working Set / Decision Memory:** may consume sealed certificates, not raw
  peer disagreement walks.
- **Transaction Intent / Effect Saga:** may execute certificate refresh under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves nominate, ruling, vector, and refresh
  units.
- **Emergency Containment:** can freeze profiles or quarantine sessions.

### Non-goals

- Letting an LLM decide certificate membership or the "best" authority override.
- Reconstructing authoritative higher-authority certificates from columnar or
  vector projections.
- Cross-account escalation authority or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external refresh consumers.
- Unbounded recursive human-escalation or disagreement walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Escalation profile contract

An escalation profile version is immutable after approval. It defines:

- allowed observation kinds (`ESCALATION_CASE_FACT`, `SUPERSEDED_CASE_FACT`,
  `AUTHORITY_RESOLUTION_OUTCOME`);
- higher-authority threshold (distinct human principals) and max rulings;
- authority policy (`STRICT_AUTHORITY_TIER`, `THRESHOLD_AUTHORITY_TIER`,
  `FREEZE_ON_AUTHORITY_DISAGREE`);
- purpose attenuation rules (narrowing only; never amplification for consumers);
- refresh policy after upstream invalidation;
- optional procedural refs for "how to present higher-authority resolved truth."

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

Nominating a sealed refresh observation returns a nomination receipt. Casting a
ruling binds observation, ruling ordinal, observed fact hash, and further
attenuation hash. Sealing an escalation certificate binds `consumer_ref`,
`purpose_hash`, `authority_set_hash`, and `resolved_fact_hash`. Certificate rulings
never mutate identity; invalidation or refresh creates a new state transition
and optional refresh intent. Disagreeing rulings under `FREEZE_ON_AUTHORITY_DISAGREE` emit a
terminal freeze record and require emergency containment rather than inventing a winner.

### 3.4 Invalidation and refresh contract

Invalidations bind certificates to upstream case revocation. Refresh
intents start as `PREPARED`, may become `UNKNOWN_EFFECT` when the refresh
consumer does not acknowledge, and never invent success from silence.

### 3.5 Availability contract

Escalation control-plane APIs target 99.99% availability for open, nominate,
ruling, seal, and perception reads. External refresh side-effects are
best-effort and surfaced as uncertainty rather than silent success.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and escalation rules are immutable.
4. Certificate ruling identity
   (`case_id`, `fact_hash`, `attenuation_hash`, `ruling_ordinal`) is
   immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Case nomination uses point lookup by
   `(account_id, case_id)` — never full disagreement-ledger scans.
7. Refresh intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/ruling/seal/refresh.
10. First-tier principals recorded on the sealed disagreement case cannot cast
    authority rulings on that case (prior-principal exclusion fence).
11. Plans that require unscoped board, session, or disagreement-ledger scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate higher-authority escalation rules. Approval validates
definition hash, requires at least one escalation rule, and fences the status
transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and ruling

Nominate looks up a sealed refresh observation by primary key, verifies
observation kind and purpose attenuation, and emits a nomination receipt.
Cast ruling binds one observation under CAS and ruling budgets.

### 5.4 Seal certificate

Seal materializes immutable certificate rulings from accepted casts, applies
the higher-authority policy / threshold, and binds `authority_set_hash` plus
`resolved_fact_hash` under the session purpose hash. Disagreeing outcomes under
`ESCALATE_ON_DISAGREE` open an escalation record instead of inventing a
winner.

### 5.5 Invalidate and refresh

Invalidation marks certificates stale when upstream observations revoke or
supersede. Optional refresh intents retally; unresolved external effects become
`UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and escalation rules. No session may open.

### 6.2 Session open

An approved profile opens an escalation session with budgets and fences.

### 6.3 Certificate sealed

Accepted rulings meeting threshold seal an escalation certificate for a consumer
purpose.

### 6.4 Invalidated / refreshing

Upstream observation changes invalidate certificates; optional refresh intents
retally under uncertainty honesty.

### 6.5 Terminal states

Sessions close, expire, cancel, fail, quarantine, or remain
`UNKNOWN_EFFECT` until human/provider resolution.

### 6.6 Retain

Audit anchors and sealed certificates remain replayable after session close;
operational rulings follow retention policy without weakening immutability.

## 7. TypeScript contracts

These interfaces are the service boundary for escalation authority ruling. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CaseId = string;
type CertificateId = string;
type RulingId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_CASE"
  | "CAST_RULING"
  | "SEAL_ESCALATION_CERTIFICATE"
  | "INVALIDATE_CERTIFICATE"
  | "PREPARE_CERTIFICATE_REFRESH"
  | "RESOLVE_REFRESH_UNCERTAINTY"
  | "CLOSE_SESSION";

type EscalationBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CASE_MISSING"
  | "PRIOR_PRINCIPAL_EXCLUDED"
  | "HASH_MISMATCH"
  | "AUTHORITY_THRESHOLD_NOT_MET"
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
  | "RULING"
  | "ACTIVE"
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

type CaseKind = "ESCALATION_CASE_FACT" | "SUPERSEDED_CASE_FACT" | "AUTHORITY_RESOLUTION_OUTCOME";
type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface EscalationAuthorityBudget {
  readonly nominateUnits: number;
  readonly rulingUnits: number;
  readonly vectorUnits: number;
  readonly sealUnits: number;
  readonly refreshUnits: number;
  readonly maxWallTimeMs: number;
  readonly authorityThreshold: number;
  readonly maxRulingsPerCertificate: number;
}

interface EscalationAuthorityProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly authorityThreshold: number;
  readonly maxRulingsPerCertificate: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface EscalationAuthoritySession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: EscalationAuthorityBudget;
  readonly consumed: Omit<
    EscalationAuthorityBudget,
    "maxWallTimeMs" | "authorityThreshold" | "maxRulingsPerCertificate"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface CaseNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly caseId: CaseId;
  readonly caseKind: CaseKind;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly excludedPrincipalIds: readonly string[];
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface EscalationCertificateRuling {
  readonly accountId: AccountId;
  readonly rulingId: RulingId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly caseId: CaseId;
  readonly caseKind: CaseKind;
  readonly rulingOrdinal: number;
  readonly status: MemberStatus;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface EscalationCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly authoritySetHash: Sha256;
  readonly resolvedFactHash: Sha256;
  readonly rulingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface EscalationRefreshObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentEscalationAuthorityPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedRulingCount: number;
  readonly invalidatedRulingCount: number;
  readonly uncertainRefreshIntents: readonly EscalationRefreshObservation[];
  readonly remainingBudget: Omit<
    EscalationAuthorityBudget,
    "maxWallTimeMs" | "authorityThreshold" | "maxRulingsPerCertificate"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly EscalationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateEscalationAuthoritySessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: EscalationAuthorityBudget;
}

interface NominateEscalationCaseInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly caseId: CaseId;
  readonly expectedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface CastAuthorityRulingInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly priorCaseId: CaseId | null;
  readonly caseId: CaseId;
  readonly authorityPrincipalId: string;
  readonly expectedFactHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealEscalationCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedAuthoritySetHash: Sha256;
  readonly expectedResolvedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateEscalationCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly caseId: CaseId;
  readonly idempotencyKey: string;
}

interface PrepareEscalationRefreshInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveEscalationUncertaintyInput {
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

interface CloseEscalationAuthoritySessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type EscalationAuthorityDecision =
  | { readonly decision: "ALLOWED"; readonly session: EscalationAuthoritySession;
      readonly certificate?: EscalationCertificate; readonly member?: EscalationCertificateRuling;
      readonly receipt?: CaseNominationReceipt;
      readonly perception: AgentEscalationAuthorityPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: EscalationBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentEscalationAuthorityPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production binding may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE ea_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE ea_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'RULING', 'ACTIVE', 'REFRESHING', 'CLOSED', 'EXPIRED',
  'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ea_ruling_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE ea_case_kind AS ENUM (
  'ESCALATION_CASE_FACT', 'SUPERSEDED_CASE_FACT', 'AUTHORITY_RESOLUTION_OUTCOME'
);
CREATE TYPE ea_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ea_case_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_ea_profile_authority NOLOGIN;

CREATE TABLE agent_ea_authorization_evidence (
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

CREATE TABLE agent_ea_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status ea_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  authority_threshold SMALLINT NOT NULL
    CHECK (authority_threshold BETWEEN 1 AND 8),
  max_rulings_per_certificate SMALLINT NOT NULL
    CHECK (max_rulings_per_certificate BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_RULING', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_ea_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_ea_profile_escalation_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_case_kinds TEXT[] NOT NULL,
  authority_threshold SMALLINT NOT NULL CHECK (authority_threshold BETWEEN 1 AND 8),
  require_refresh BOOLEAN NOT NULL,
  authority_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_ea_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_ea_escalation_catalog (
  account_id BIGINT NOT NULL,
  case_id UUID NOT NULL,
  source_escalation_id UUID NOT NULL,
  split_session_id UUID NOT NULL,
  case_ref TEXT NOT NULL,
  case_kind ea_case_kind NOT NULL,
  status ea_case_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  excluded_principal_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, case_id),
  UNIQUE (account_id, source_escalation_id, case_kind),
  CHECK (cardinality(excluded_principal_ids) BETWEEN 0 AND 64)
);

CREATE TABLE agent_ea_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status ea_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_ruling_units BIGINT NOT NULL CHECK (budget_ruling_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_refresh_units BIGINT NOT NULL CHECK (budget_refresh_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_ruling_units BIGINT NOT NULL CHECK (consumed_ruling_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_refresh_units BIGINT NOT NULL CHECK (consumed_refresh_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  authority_threshold SMALLINT NOT NULL
    CHECK (authority_threshold BETWEEN 1 AND 8),
  max_rulings_per_certificate SMALLINT NOT NULL
    CHECK (max_rulings_per_certificate BETWEEN 1 AND 256),
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
    REFERENCES agent_ea_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_ea_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_ruling_units <= budget_ruling_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_refresh_units <= budget_refresh_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_ea_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  case_kind ea_case_kind NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, case_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ea_escalation_catalog (account_id, case_id)
);

CREATE TABLE agent_ea_ruling_cast (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_case_id UUID,
  case_id UUID NOT NULL,
  authority_principal_id TEXT NOT NULL,
  ruling_ordinal SMALLINT NOT NULL CHECK (ruling_ordinal BETWEEN 1 AND 8),
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  ruling_hash CHAR(64) NOT NULL CHECK (length(ruling_hash) = 64),
  cast_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, session_id, case_id, ruling_ordinal),
  UNIQUE (account_id, session_id, authority_principal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id),
  FOREIGN KEY (account_id, prior_case_id)
    REFERENCES agent_ea_escalation_catalog (account_id, case_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ea_escalation_catalog (account_id, case_id)
);

CREATE TABLE agent_ea_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  authority_set_hash CHAR(64) NOT NULL CHECK (length(authority_set_hash) = 64),
  resolved_fact_hash CHAR(64) NOT NULL CHECK (length(resolved_fact_hash) = 64),
  ruling_watermark SMALLINT NOT NULL CHECK (ruling_watermark BETWEEN 0 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id)
);

CREATE TABLE agent_ea_certificate_ruling (
  account_id BIGINT NOT NULL,
  ruling_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  case_kind ea_case_kind NOT NULL,
  ruling_ordinal SMALLINT NOT NULL CHECK (ruling_ordinal BETWEEN 0 AND 8),
  status ea_ruling_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ruling_id),
  UNIQUE (account_id, certificate_id, case_id, ruling_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ea_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ea_escalation_catalog (account_id, case_id)
);

CREATE TABLE agent_ea_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  case_id UUID NOT NULL,
  prior_fact_hash CHAR(64) NOT NULL CHECK (length(prior_fact_hash) = 64),
  next_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CASE_REVOKED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ea_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, case_id)
    REFERENCES agent_ea_escalation_catalog (account_id, case_id)
);

CREATE TABLE agent_ea_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status ea_refresh_status NOT NULL,
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
    REFERENCES agent_ea_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ea_certificate (account_id, certificate_id)
);

CREATE TABLE agent_ea_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('NOMINATE', 'RULING', 'VECTOR', 'SEAL', 'REFRESH')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id)
);

CREATE TABLE agent_ea_disagree_event (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  session_id UUID NOT NULL,
  case_id UUID NOT NULL,
  left_ruling_id UUID,
  right_ruling_ordinal SMALLINT,
  conflict_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id)
);

CREATE TABLE agent_ea_terminal_record (
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
    REFERENCES agent_ea_session (account_id, session_id)
);

CREATE TABLE agent_ea_command_result (
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

CREATE TABLE agent_ea_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_ea_audit_event (
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

CREATE TABLE agent_ea_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_ea_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status ea_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ea_session (account_id, session_id)
);

CREATE TABLE agent_ea_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_ea_profile()
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
       OR NEW.authority_threshold IS DISTINCT FROM OLD.authority_threshold
       OR NEW.max_rulings_per_certificate
         IS DISTINCT FROM OLD.max_rulings_per_certificate
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
    IF current_setting('app.ea_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.ea_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_ea_profile_protect
BEFORE INSERT OR UPDATE ON agent_ea_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_ea_profile();

CREATE FUNCTION protect_agent_ea_profile_escalation_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status ea_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_ea_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile escalation rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_ea_profile_escalation_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_ea_profile_escalation_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_ea_profile_escalation_rule();

CREATE FUNCTION protect_agent_ea_certificate_ruling()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.case_id IS DISTINCT FROM OLD.case_id
       OR NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.ruling_ordinal IS DISTINCT FROM OLD.ruling_ordinal
       OR NEW.case_kind IS DISTINCT FROM OLD.case_kind
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'certificate ruling identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_ea_certificate_ruling_protect
BEFORE UPDATE ON agent_ea_certificate_ruling
FOR EACH ROW EXECUTE FUNCTION protect_agent_ea_certificate_ruling();


CREATE FUNCTION protect_agent_ea_ruling_cast_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_exclusion$
DECLARE
  excluded TEXT[];
BEGIN
  SELECT excluded_principal_ids INTO excluded
  FROM agent_ea_escalation_catalog
  WHERE account_id = NEW.account_id
    AND case_id = NEW.case_id;

  IF excluded IS NULL THEN
    RAISE EXCEPTION 'escalation case missing for ruling cast';
  END IF;

  IF NEW.authority_principal_id = ANY (excluded) THEN
    RAISE EXCEPTION 'prior-principal exclusion fence blocks ruling cast';
  END IF;

  RETURN NEW;
END
$protect_exclusion$;

CREATE TRIGGER agent_ea_ruling_cast_exclusion_protect
BEFORE INSERT OR UPDATE ON agent_ea_ruling_cast
FOR EACH ROW EXECUTE FUNCTION protect_agent_ea_ruling_cast_exclusion();

CREATE FUNCTION protect_agent_ea_refresh_intent()
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

CREATE TRIGGER agent_ea_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_ea_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_ea_refresh_intent();

CREATE FUNCTION approve_agent_ea_profile(
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
  stored_status ea_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ea_profile
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
  FROM agent_ea_profile_escalation_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one escalation rule';
  END IF;

  PERFORM set_config(
    'app.ea_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_ea_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_ea_profile(
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
  stored_status ea_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ea_profile
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
    'app.ea_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_ea_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_ea_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ea_profile_authority;
ALTER FUNCTION revoke_agent_ea_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ea_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_ea_profile_authority;
GRANT SELECT ON
  agent_ea_profile,
  agent_ea_profile_escalation_rule
TO agent_ea_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ea_profile TO agent_ea_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_ea_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_ea_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ea_profile FROM PUBLIC;

CREATE INDEX agent_ea_session_work_idx ON agent_ea_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_ea_session_profile_idx ON agent_ea_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_ea_ruling_certificate_idx ON agent_ea_certificate_ruling (
  account_id, certificate_id, sealed_at DESC, ruling_id
);
CREATE INDEX agent_ea_ruling_case_idx ON agent_ea_certificate_ruling (
  account_id, case_id, sealed_at DESC, ruling_id
);
CREATE INDEX agent_ea_case_ref_idx ON agent_ea_escalation_catalog (
  account_id, case_ref, sealed_at DESC, case_id
);
CREATE INDEX agent_ea_case_binding_idx ON agent_ea_escalation_catalog (
  account_id, source_escalation_id, sealed_at DESC, case_id
);
CREATE INDEX agent_ea_ruling_session_idx ON agent_ea_ruling_cast (
  account_id, session_id, ruling_ordinal, cast_at DESC
);
CREATE INDEX agent_ea_refresh_work_idx ON agent_ea_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_ea_audit_time_idx ON agent_ea_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_ea_perception_status_idx ON agent_ea_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_ea_command_expiry_idx ON agent_ea_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_ea_conflict_case_idx ON agent_ea_disagree_event (
  account_id, case_id, created_at DESC, conflict_id
);
CREATE INDEX agent_ea_invalidation_certificate_idx ON agent_ea_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_ea_authorization_evidence',
    'agent_ea_profile',
    'agent_ea_profile_escalation_rule',
    'agent_ea_escalation_catalog',
    'agent_ea_session',
    'agent_ea_nomination_receipt',
    'agent_ea_ruling_cast',
    'agent_ea_certificate',
    'agent_ea_certificate_ruling',
    'agent_ea_invalidation',
    'agent_ea_refresh_intent',
    'agent_ea_budget_ledger',
    'agent_ea_disagree_event',
    'agent_ea_terminal_record',
    'agent_ea_command_result',
    'agent_ea_audit_head',
    'agent_ea_audit_event',
    'agent_ea_audit_anchor',
    'agent_ea_perception_snapshot',
    'agent_ea_projection_checkpoint'
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

Open session, nominate case, cast ruling, seal certificate/rulings, invalidate,
prepare refresh, and audit-chain append commit in one ACID transaction per
command. External refresh acknowledgement is out of band.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers must `set_config('app.account_id', ...)`
before any read or write. Composite indexes all lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
refresh work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentEaSessionStatus {
  OPEN
  NOMINATING
  RULING
  ACTIVE
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentEaRulingStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentEaCaseKind {
  ESCALATION_CASE_FACT
  SUPERSEDED_CASE_FACT
  AUTHORITY_RESOLUTION_OUTCOME
}

enum AgentEaRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentEaNextAction {
  NOMINATE_CASE
  CAST_RULING
  SEAL_ESCALATION_CERTIFICATE
  INVALIDATE_CERTIFICATE
  PREPARE_CERTIFICATE_REFRESH
  RESOLVE_REFRESH_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentEaBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CASE_MISSING
  PRIOR_PRINCIPAL_EXCLUDED
  HASH_MISMATCH
  AUTHORITY_THRESHOLD_NOT_MET
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentEaUncertaintyResolution {
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

type AgentEaBudget {
  nominateUnits: Long!
  rulingUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  authorityThreshold: Int!
  maxRulingsPerCertificate: Int!
}

type AgentEaProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  authorityThreshold: Int!
  maxRulingsPerCertificate: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentEaSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentEaSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentEaBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentEaNominationReceipt {
  accountId: ID!
  sessionId: ID!
  caseId: ID!
  caseKind: AgentEaCaseKind!
  factHash: SHA256!
  attenuationHash: SHA256!
  excludedPrincipalIds: [ID!]!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentEaCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  authoritySetHash: SHA256!
  resolvedFactHash: SHA256!
  rulingWatermark: Int!
  sealedAt: DateTime!
}

type AgentEaRuling {
  accountId: ID!
  rulingId: ID!
  certificateId: ID!
  sessionId: ID!
  caseId: ID!
  caseKind: AgentEaCaseKind!
  rulingOrdinal: Int!
  status: AgentEaRulingStatus!
  factHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentEaRefreshObservation {
  refreshId: ID!
  status: AgentEaRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentEaPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentEaSessionStatus!
  summary: AgentUntrustedText!
  sealedRulingCount: Int!
  invalidatedRulingCount: Int!
  uncertainRefreshIntents: [AgentEaRefreshObservation!]!
  remainingBudget: AgentEaBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentEaNextAction!]!
  blockedReasons: [AgentEaBlockedReason!]!
  cardHash: SHA256!
}

type AgentEaMutationResult {
  decision: String!
  session: AgentEaSession
  certificate: AgentEaCertificate
  member: AgentEaRuling
  receipt: AgentEaNominationReceipt
  perception: AgentEaPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentEaBudgetInput {
  nominateUnits: Long!
  rulingUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  authorityThreshold: Int!
  maxRulingsPerCertificate: Int!
}

input CreateEscalationAuthoritySessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentEaBudgetInput!
}

input NominateEscalationCaseInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  caseId: ID!
  expectedFactHash: SHA256!
  idempotencyKey: String!
}

input CastAuthorityRulingInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  priorCaseId: ID
  caseId: ID!
  authorityPrincipalId: ID!
  expectedFactHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealEscalationCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedAuthoritySetHash: SHA256!
  expectedResolvedFactHash: SHA256!
  idempotencyKey: String!
}

input InvalidateEscalationCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  caseId: ID!
  idempotencyKey: String!
}

input PrepareEscalationRefreshInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveEscalationUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentEaUncertaintyResolution!
  idempotencyKey: String!
}

input CloseEscalationAuthoritySessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentEaProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentEaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentEaProfile
  agentEaSession(accountId: ID!, sessionId: ID!): AgentEaSession
  agentEaCertificate(accountId: ID!, certificateId: ID!): AgentEaCertificate
  agentEaPerceptionCard(accountId: ID!, sessionId: ID!): AgentEaPerceptionCard
  agentEaNominatedCase(
    accountId: ID!
    sessionId: ID!
    caseId: ID!
  ): AgentEaNominationReceipt
  agentEaSearchProfiles(input: AgentEaProfileSearchInput!): [AgentEaProfile!]!
}

type Mutation {
  createEscalationAuthoritySession(
    input: CreateEscalationAuthoritySessionInput!
  ): AgentEaMutationResult!
  nominateEscalationCase(input: NominateEscalationCaseInput!): AgentEaMutationResult!
  castAuthorityRuling(
    input: CastAuthorityRulingInput!
  ): AgentEaMutationResult!
  sealEscalationCertificate(
    input: SealEscalationCertificateInput!
  ): AgentEaMutationResult!
  invalidateEscalationCertificate(
    input: InvalidateEscalationCertificateInput!
  ): AgentEaMutationResult!
  prepareEscalationRefresh(
    input: PrepareEscalationRefreshInput!
  ): AgentEaMutationResult!
  resolveEscalationUncertainty(
    input: ResolveEscalationUncertaintyInput!
  ): AgentEaMutationResult!
  closeEscalationAuthoritySession(
    input: CloseEscalationAuthoritySessionInput!
  ): AgentEaMutationResult!
  approveEscalationAuthorityProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentEaMutationResult!
  revokeEscalationAuthorityProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentEaMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Ruling mutations reject when ruling ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.

## 10. Procedural memory

Approved escalation profiles are procedural memory: versioned instructions for how
higher-authority humans may resolve ESCALATE_ON_DISAGREE conflicts. Procedure refs may
point to presentation/playbook steps. Profiles are immutable after approval;
agents perceive `procedureTags` and `allowedNextActions` on perception cards,
never inventing resolution policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which escalation profile fits
incident escalation cases?"). Embeddings are account-owned and must be queried
with `account_id` equality. The reference schema stores vectors but does **not**
create a cross-tenant HNSW index; production builds account-partitioned HNSW
segments.

Semantic retrieval may return case profiles only. It never authorizes
nominate, ruling, seal, invalidate, or refresh. Vector `topK` is budgeted and
clamped.

```sql
CREATE TABLE agent_ea_profile_embedding (
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
    REFERENCES agent_ea_profile (account_id, profile_id, profile_version)
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
ruling counts, uncertain refresh intents, remaining budgets, procedure tags,
allowed next actions, and blocked reasons. Summary text is `UntrustedText`.
Cards never embed raw redacted fact bodies. `cardHash` makes perception
replayable.

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, ruling casts, certificate seals, and audit
appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed certificates but are
not authoritative for escalation winners.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Certificate refresh side-effects are not silently ACID-coupled; silence becomes
`UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Ruling/threshold caps on rulings per certificate and per session.
- Budget ledgers for NOMINATE/RULING/VECTOR/SEAL/REFRESH.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped refresh-ledger/board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Nominating observations by scanning recipient or sharing sessions (rejected).
- Casting rulings by walking all refresh intents for an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  observation-keyed active certificate ruling indexes).

### Required access paths

- Observation nomination: PK `(account_id, case_id)`.
- Rulings by certificate/observation: composite indexes leading with
  `account_id`.
- Refresh work: partial indexes on refresh intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/refresh-ledger scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session and
certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must narrow relative to
  observation and session purposes.
- Sticky first-ACK adoption after supersession: invalidation + authority re-ruling +
  refresh uncertainty + profile revocation.
- Silent refresh success: `UNKNOWN_EFFECT` until ACK.
- Recursive peer-refresh storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/ruling/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Refresh ACK lag and `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow higher-authority

Compile profiles and validate case nomination without durable
certificates.

### Phase 2: single-case certificates only

Allow sealed certificates for higher-authority threshold 1 from nominated ESCALATION_CASE_FACT
observations.

### Phase 3: multi-approver higher-authority

Enable budgeted multi-observation ruling under approved profiles.

### Phase 4: refresh uncertainty

Enable certificate refresh intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, and refresh start
  state.

### Behavioral validation

- Nominate requires sealed observation point lookup and hash match.
- Ruling binds observed fact hash and ordinal under budget.
- Seal binds immutable certificate rulings under ruling-set and winner hashes.
- Refresh silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/ruling path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed certificates after process restart.

## 21. Product decision

Adopt the Escalation Authority Plane as the deterministic higher-authority path for
`ESCALATE_ON_DISAGREE` outcomes from the Split Resolution Plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the authority-gap
   after dual-control splits without sticky first-ACK adoption or re-ruling by
   the original disagreeing principals.
2. Account-leading indexes, higher-authority distinct-principal constraints, and
   **FULL SCAN REJECTED** planner rules protect 99.99% neighbor latency on
   boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
