# mondayDB Agentic Split Resolution Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-11.v1`

## 1. Why this plane, before how

A sealed refresh quorum certificate under `REQUIRE_HUMAN_ON_SPLIT` can open a
human-resolution gap, but it does not decide **how dual-control humans may
converge on one resolved fact hash**: which conflict candidates count, which
distinct approvers must assent, what purpose attenuation binds consumers, and
without scanning every conflict or recipient refresh row in an account.

Without a split resolution plane, agents either:

- scan every related conflict, ballot, and recipient session after a split
  (neighbor-harmful on boards with 1M+ rows and dense share graphs), or
- sticky-adopt the first human ACK they observe, so one operator's silent or
  superseded choice becomes workspace truth without a dual-control receipt.

The product trade-off is **human resolution fluency versus dual-control isolation**:

- Letting every consumer freely reconcile all human decisions maximizes fluency
  and reduces re-grounding cost, but creates non-deterministic winners,
  single-approver sticky copies, and unauditable overrides of quorum splits.
- Compiling a sealed resolution certificate under an approved resolution
  profile, conflict point lookups, and dual-control assent budgets adds one
  bounded resolution transaction and short-lived certificate storage.
- Semantic similarity may discover resolution profiles, but it must never decide
  whether a conflict candidate may be nominated, assented, sealed into a
  certificate, or refreshed.

The recommended model keeps the data plane deterministic:

1. An approved resolution profile defines dual-control thresholds, allowed
   candidate kinds, conflict policy, and how purpose must attenuate for
   consumer reuse.
2. A resolution session opens under purpose, budget, and authorization fences,
   and only nominates sealed split candidates by point lookup.
3. mondayDB casts distinct-principal assents under budget, then seals a
   resolution certificate binding
   `consumer_ref + purpose_hash + assent_set_hash + resolved_fact_hash`.
4. Upstream invalidation marks certificates stale; refresh intents may become
   `UNKNOWN_EFFECT` until acknowledged.
5. Unscoped conflict/recipient scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ask every human forever" or "reconcile every peer conflict forever" loops are
rejectable before they scan boards with 1M+ rows.

### Product outcome

For any split resolution compilation, mondayDB can answer:

- Which profile, principal, and session authorized the certificate?
- Which nominated candidates, assent ordinals, approver principals, and
  resolved fact hashes were bound?
- Is the certificate still current, invalidated, escalated, or awaiting refresh?
- Did async certificate refresh become `UNKNOWN_EFFECT`?
- Can the dual-control history be replayed without invoking an LLM?

## 2. Scope and ownership

The Split Resolution Plane owns:

1. Immutable approved resolution profiles as procedural memory of "how dual-
   control humans may resolve REQUIRE_HUMAN_ON_SPLIT conflicts under
   distinct-principal assent fences."
2. Tenant-scoped resolution sessions with purpose and budget fences.
3. Deterministic nomination of sealed split candidates by point lookup —
   never conflict-ledger or full recipient-session scans.
4. Distinct-principal assent cast receipts and sealed resolution certificates.
5. Invalidation and refresh intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded assent budgets.

It integrates with, but does not replace:

- **Refresh Quorum / Grant Graph Visibility:** supply sealed split conflict
  candidate IDs and invalidation events under REQUIRE_HUMAN_ON_SPLIT.
- **Fact Consumption / Grounding:** constrain what a winning fact hash may
  expose.
- **Working Set / Decision Memory:** may consume sealed certificates, not raw
  peer refresh walks.
- **Transaction Intent / Effect Saga:** may execute certificate refresh under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves nominate, assent, vector, and refresh
  units.
- **Emergency Containment:** can freeze profiles or quarantine sessions.

### Non-goals

- Letting an LLM decide certificate membership or the "best" human override.
- Reconstructing authoritative dual-control certificates from columnar or vector projections.
- Cross-account split resolution or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external refresh consumers.
- Unbounded recursive human-escalation or conflict walks across boards with 1M+ rows.

## 3. Product contract

### 3.1 Quorum profile contract

A resolution profile version is immutable after approval. It defines:

- allowed observation kinds (`SPLIT_CANDIDATE_FACT`, `SUPERSEDED_CANDIDATE_FACT`,
  `HUMAN_RESOLUTION_OUTCOME`);
- dual-control threshold (distinct human principals) and max assents;
- conflict policy (`STRICT_DUAL_CONTROL`, `THRESHOLD_DUAL_CONTROL`,
  `ESCALATE_ON_DISAGREE`);
- purpose attenuation rules (narrowing only; never amplification for consumers);
- refresh policy after upstream invalidation;
- optional procedural refs for "how to present dual-control resolved truth."

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
assent binds observation, assent ordinal, observed fact hash, and further
attenuation hash. Sealing a resolution certificate binds `consumer_ref`,
`purpose_hash`, `assent_set_hash`, and `resolved_fact_hash`. Certificate assents
never mutate identity; invalidation or refresh creates a new state transition
and optional refresh intent. Disagreeing assents under the conflict policy emit an
escalation record and may require a higher authority fence.

### 3.4 Invalidation and refresh contract

Invalidations bind certificates to upstream candidate revocation. Refresh
intents start as `PREPARED`, may become `UNKNOWN_EFFECT` when the refresh
consumer does not acknowledge, and never invent success from silence.

### 3.5 Availability contract

Quorum control-plane APIs target 99.99% availability for open, nominate,
assent, seal, and perception reads. External refresh side-effects are
best-effort and surfaced as uncertainty rather than silent success.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and resolution rules are immutable.
4. Certificate assent identity
   (`candidate_id`, `fact_hash`, `attenuation_hash`, `assent_ordinal`) is
   immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Candidate nomination uses point lookup by
   `(account_id, candidate_id)` — never full conflict-ledger scans.
7. Refresh intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/assent/seal/refresh.
10. Plans that require unscoped board, session, or conflict-ledger scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate dual-control resolution rules. Approval validates
definition hash, requires at least one resolution rule, and fences the status
transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and assent

Nominate looks up a sealed refresh observation by primary key, verifies
observation kind and purpose attenuation, and emits a nomination receipt.
Cast assent binds one observation under CAS and assent budgets.

### 5.4 Seal certificate

Seal materializes immutable certificate assents from accepted casts, applies
the dual-control policy / threshold, and binds `assent_set_hash` plus
`resolved_fact_hash` under the session purpose hash. Disagreeing outcomes under
`ESCALATE_ON_DISAGREE` open an escalation record instead of inventing a
winner.

### 5.5 Invalidate and refresh

Invalidation marks certificates stale when upstream observations revoke or
supersede. Optional refresh intents retally; unresolved external effects become
`UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and resolution rules. No session may open.

### 6.2 Session open

An approved profile opens a resolution session with budgets and fences.

### 6.3 Certificate sealed

Accepted assents meeting threshold seal a resolution certificate for a consumer
purpose.

### 6.4 Invalidated / refreshing

Upstream observation changes invalidate certificates; optional refresh intents
retally under uncertainty honesty.

### 6.5 Terminal states

Sessions close, expire, cancel, fail, quarantine, or remain
`UNKNOWN_EFFECT` until human/provider resolution.

### 6.6 Retain

Audit anchors and sealed certificates remain replayable after session close;
operational assents follow retention policy without weakening immutability.

## 7. TypeScript contracts

These interfaces are the service boundary for split resolution tallying. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CandidateId = string;
type CertificateId = string;
type AssentId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_CANDIDATE"
  | "CAST_ASSENT"
  | "SEAL_RESOLUTION_CERTIFICATE"
  | "INVALIDATE_CERTIFICATE"
  | "PREPARE_CERTIFICATE_REFRESH"
  | "RESOLVE_REFRESH_UNCERTAINTY"
  | "CLOSE_SESSION";

type ResolutionBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CANDIDATE_MISSING"
  | "HASH_MISMATCH"
  | "DUAL_CONTROL_THRESHOLD_NOT_MET"
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
  | "ASSENTING"
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

type CandidateKind = "SPLIT_CANDIDATE_FACT" | "SUPERSEDED_CANDIDATE_FACT" | "HUMAN_RESOLUTION_OUTCOME";
type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface SplitResolutionBudget {
  readonly nominateUnits: number;
  readonly assentUnits: number;
  readonly vectorUnits: number;
  readonly sealUnits: number;
  readonly refreshUnits: number;
  readonly maxWallTimeMs: number;
  readonly dualControlThreshold: number;
  readonly maxAssentsPerCertificate: number;
}

interface SplitResolutionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly dualControlThreshold: number;
  readonly maxAssentsPerCertificate: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface SplitResolutionSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: SplitResolutionBudget;
  readonly consumed: Omit<
    SplitResolutionBudget,
    "maxWallTimeMs" | "dualControlThreshold" | "maxAssentsPerCertificate"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface CandidateNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly candidateId: CandidateId;
  readonly candidateKind: CandidateKind;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface ResolutionCertificateAssent {
  readonly accountId: AccountId;
  readonly assentId: AssentId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly candidateId: CandidateId;
  readonly candidateKind: CandidateKind;
  readonly assentOrdinal: number;
  readonly status: MemberStatus;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface ResolutionCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly assentSetHash: Sha256;
  readonly resolvedFactHash: Sha256;
  readonly assentWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ResolutionRefreshObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentSplitResolutionPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedAssentCount: number;
  readonly invalidatedAssentCount: number;
  readonly uncertainRefreshIntents: readonly ResolutionRefreshObservation[];
  readonly remainingBudget: Omit<
    SplitResolutionBudget,
    "maxWallTimeMs" | "dualControlThreshold" | "maxAssentsPerCertificate"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ResolutionBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateSplitResolutionSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: SplitResolutionBudget;
}

interface NominateSplitCandidateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly candidateId: CandidateId;
  readonly expectedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface CastResolutionAssentInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly priorCandidateId: CandidateId | null;
  readonly candidateId: CandidateId;
  readonly approverPrincipalId: string;
  readonly expectedFactHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealResolutionCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedAssentSetHash: Sha256;
  readonly expectedResolvedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateResolutionCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly candidateId: CandidateId;
  readonly idempotencyKey: string;
}

interface PrepareResolutionRefreshInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveResolutionUncertaintyInput {
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

interface CloseSplitResolutionSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type SplitResolutionDecision =
  | { readonly decision: "ALLOWED"; readonly session: SplitResolutionSession;
      readonly certificate?: ResolutionCertificate; readonly member?: ResolutionCertificateAssent;
      readonly receipt?: CandidateNominationReceipt;
      readonly perception: AgentSplitResolutionPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ResolutionBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentSplitResolutionPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production binding may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE sr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE sr_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'ASSENTING', 'ACTIVE', 'REFRESHING', 'CLOSED', 'EXPIRED',
  'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sr_assent_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE sr_candidate_kind AS ENUM (
  'SPLIT_CANDIDATE_FACT', 'SUPERSEDED_CANDIDATE_FACT', 'HUMAN_RESOLUTION_OUTCOME'
);
CREATE TYPE sr_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sr_candidate_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_sr_profile_authority NOLOGIN;

CREATE TABLE agent_sr_authorization_evidence (
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

CREATE TABLE agent_sr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status sr_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  dual_control_threshold SMALLINT NOT NULL
    CHECK (dual_control_threshold BETWEEN 1 AND 8),
  max_assents_per_certificate SMALLINT NOT NULL
    CHECK (max_assents_per_certificate BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_ASSENT', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_sr_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_sr_profile_resolution_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_candidate_kinds TEXT[] NOT NULL,
  dual_control_threshold SMALLINT NOT NULL CHECK (dual_control_threshold BETWEEN 1 AND 8),
  require_refresh BOOLEAN NOT NULL,
  dual_control_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_sr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_sr_conflict_catalog (
  account_id BIGINT NOT NULL,
  candidate_id UUID NOT NULL,
  source_conflict_id UUID NOT NULL,
  quorum_session_id UUID NOT NULL,
  candidate_ref TEXT NOT NULL,
  candidate_kind sr_candidate_kind NOT NULL,
  status sr_candidate_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, candidate_id),
  UNIQUE (account_id, source_conflict_id, candidate_kind)
);

CREATE TABLE agent_sr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status sr_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_assent_units BIGINT NOT NULL CHECK (budget_assent_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_refresh_units BIGINT NOT NULL CHECK (budget_refresh_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_assent_units BIGINT NOT NULL CHECK (consumed_assent_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_refresh_units BIGINT NOT NULL CHECK (consumed_refresh_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  dual_control_threshold SMALLINT NOT NULL
    CHECK (dual_control_threshold BETWEEN 1 AND 8),
  max_assents_per_certificate SMALLINT NOT NULL
    CHECK (max_assents_per_certificate BETWEEN 1 AND 256),
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
    REFERENCES agent_sr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_sr_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_assent_units <= budget_assent_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_refresh_units <= budget_refresh_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_sr_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  candidate_kind sr_candidate_kind NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, candidate_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id),
  FOREIGN KEY (account_id, candidate_id)
    REFERENCES agent_sr_conflict_catalog (account_id, candidate_id)
);

CREATE TABLE agent_sr_assent_cast (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_candidate_id UUID,
  candidate_id UUID NOT NULL,
  approver_principal_id TEXT NOT NULL,
  assent_ordinal SMALLINT NOT NULL CHECK (assent_ordinal BETWEEN 1 AND 8),
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  assent_hash CHAR(64) NOT NULL CHECK (length(assent_hash) = 64),
  cast_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, session_id, candidate_id, assent_ordinal),
  UNIQUE (account_id, session_id, approver_principal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id),
  FOREIGN KEY (account_id, prior_candidate_id)
    REFERENCES agent_sr_conflict_catalog (account_id, candidate_id),
  FOREIGN KEY (account_id, candidate_id)
    REFERENCES agent_sr_conflict_catalog (account_id, candidate_id)
);

CREATE TABLE agent_sr_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  assent_set_hash CHAR(64) NOT NULL CHECK (length(assent_set_hash) = 64),
  resolved_fact_hash CHAR(64) NOT NULL CHECK (length(resolved_fact_hash) = 64),
  assent_watermark SMALLINT NOT NULL CHECK (assent_watermark BETWEEN 0 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id)
);

CREATE TABLE agent_sr_certificate_assent (
  account_id BIGINT NOT NULL,
  assent_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  candidate_kind sr_candidate_kind NOT NULL,
  assent_ordinal SMALLINT NOT NULL CHECK (assent_ordinal BETWEEN 0 AND 8),
  status sr_assent_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assent_id),
  UNIQUE (account_id, certificate_id, candidate_id, assent_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_sr_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id),
  FOREIGN KEY (account_id, candidate_id)
    REFERENCES agent_sr_conflict_catalog (account_id, candidate_id)
);

CREATE TABLE agent_sr_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  prior_fact_hash CHAR(64) NOT NULL CHECK (length(prior_fact_hash) = 64),
  next_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CANDIDATE_REVOKED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_sr_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, candidate_id)
    REFERENCES agent_sr_conflict_catalog (account_id, candidate_id)
);

CREATE TABLE agent_sr_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status sr_refresh_status NOT NULL,
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
    REFERENCES agent_sr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_sr_certificate (account_id, certificate_id)
);

CREATE TABLE agent_sr_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('NOMINATE', 'ASSENT', 'VECTOR', 'SEAL', 'REFRESH')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id)
);

CREATE TABLE agent_sr_split_event (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  session_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  left_assent_id UUID,
  right_assent_ordinal SMALLINT,
  conflict_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id)
);

CREATE TABLE agent_sr_escalation_record (
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
    REFERENCES agent_sr_session (account_id, session_id)
);

CREATE TABLE agent_sr_command_result (
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

CREATE TABLE agent_sr_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_sr_audit_event (
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

CREATE TABLE agent_sr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_sr_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status sr_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sr_session (account_id, session_id)
);

CREATE TABLE agent_sr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_sr_profile()
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
       OR NEW.dual_control_threshold IS DISTINCT FROM OLD.dual_control_threshold
       OR NEW.max_assents_per_certificate
         IS DISTINCT FROM OLD.max_assents_per_certificate
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
    IF current_setting('app.sr_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.sr_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_sr_profile_protect
BEFORE INSERT OR UPDATE ON agent_sr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_sr_profile();

CREATE FUNCTION protect_agent_sr_profile_resolution_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status sr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_sr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile resolution rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_sr_profile_resolution_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_sr_profile_resolution_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_sr_profile_resolution_rule();

CREATE FUNCTION protect_agent_sr_certificate_assent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
       OR NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.assent_ordinal IS DISTINCT FROM OLD.assent_ordinal
       OR NEW.candidate_kind IS DISTINCT FROM OLD.candidate_kind
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'certificate assent identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_sr_certificate_assent_protect
BEFORE UPDATE ON agent_sr_certificate_assent
FOR EACH ROW EXECUTE FUNCTION protect_agent_sr_certificate_assent();

CREATE FUNCTION protect_agent_sr_refresh_intent()
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

CREATE TRIGGER agent_sr_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_sr_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_sr_refresh_intent();

CREATE FUNCTION approve_agent_sr_profile(
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
  stored_status sr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_sr_profile
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
  FROM agent_sr_profile_resolution_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one resolution rule';
  END IF;

  PERFORM set_config(
    'app.sr_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_sr_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_sr_profile(
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
  stored_status sr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_sr_profile
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
    'app.sr_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_sr_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_sr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_sr_profile_authority;
ALTER FUNCTION revoke_agent_sr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_sr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_sr_profile_authority;
GRANT SELECT ON
  agent_sr_profile,
  agent_sr_profile_resolution_rule
TO agent_sr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_sr_profile TO agent_sr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_sr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_sr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_sr_profile FROM PUBLIC;

CREATE INDEX agent_sr_session_work_idx ON agent_sr_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_sr_session_profile_idx ON agent_sr_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_sr_assent_certificate_idx ON agent_sr_certificate_assent (
  account_id, certificate_id, sealed_at DESC, assent_id
);
CREATE INDEX agent_sr_assent_candidate_idx ON agent_sr_certificate_assent (
  account_id, candidate_id, sealed_at DESC, assent_id
);
CREATE INDEX agent_sr_candidate_ref_idx ON agent_sr_conflict_catalog (
  account_id, candidate_ref, sealed_at DESC, candidate_id
);
CREATE INDEX agent_sr_candidate_binding_idx ON agent_sr_conflict_catalog (
  account_id, source_conflict_id, sealed_at DESC, candidate_id
);
CREATE INDEX agent_sr_assent_session_idx ON agent_sr_assent_cast (
  account_id, session_id, assent_ordinal, cast_at DESC
);
CREATE INDEX agent_sr_refresh_work_idx ON agent_sr_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_sr_audit_time_idx ON agent_sr_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_sr_perception_status_idx ON agent_sr_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_sr_command_expiry_idx ON agent_sr_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_sr_conflict_candidate_idx ON agent_sr_split_event (
  account_id, candidate_id, created_at DESC, conflict_id
);
CREATE INDEX agent_sr_invalidation_certificate_idx ON agent_sr_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_sr_authorization_evidence',
    'agent_sr_profile',
    'agent_sr_profile_resolution_rule',
    'agent_sr_conflict_catalog',
    'agent_sr_session',
    'agent_sr_nomination_receipt',
    'agent_sr_assent_cast',
    'agent_sr_certificate',
    'agent_sr_certificate_assent',
    'agent_sr_invalidation',
    'agent_sr_refresh_intent',
    'agent_sr_budget_ledger',
    'agent_sr_split_event',
    'agent_sr_escalation_record',
    'agent_sr_command_result',
    'agent_sr_audit_head',
    'agent_sr_audit_event',
    'agent_sr_audit_anchor',
    'agent_sr_perception_snapshot',
    'agent_sr_projection_checkpoint'
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

Open session, seed+receipt, expand hop, seal certificate/members, invalidate,
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

enum AgentSrSessionStatus {
  OPEN
  NOMINATING
  ASSENTING
  ACTIVE
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentSrAssentStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentSrCandidateKind {
  SPLIT_CANDIDATE_FACT
  SUPERSEDED_CANDIDATE_FACT
  HUMAN_RESOLUTION_OUTCOME
}

enum AgentSrRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentSrNextAction {
  NOMINATE_CANDIDATE
  CAST_ASSENT
  SEAL_RESOLUTION_CERTIFICATE
  INVALIDATE_CERTIFICATE
  PREPARE_CERTIFICATE_REFRESH
  RESOLVE_REFRESH_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentSrBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CANDIDATE_MISSING
  HASH_MISMATCH
  DUAL_CONTROL_THRESHOLD_NOT_MET
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentSrUncertaintyResolution {
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

type AgentSrBudget {
  nominateUnits: Long!
  assentUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  dualControlThreshold: Int!
  maxAssentsPerCertificate: Int!
}

type AgentSrProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  dualControlThreshold: Int!
  maxAssentsPerCertificate: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentSrSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentSrSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentSrBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentSrNominationReceipt {
  accountId: ID!
  sessionId: ID!
  candidateId: ID!
  candidateKind: AgentSrCandidateKind!
  factHash: SHA256!
  attenuationHash: SHA256!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentSrCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  assentSetHash: SHA256!
  resolvedFactHash: SHA256!
  assentWatermark: Int!
  sealedAt: DateTime!
}

type AgentSrAssent {
  accountId: ID!
  assentId: ID!
  certificateId: ID!
  sessionId: ID!
  candidateId: ID!
  candidateKind: AgentSrCandidateKind!
  assentOrdinal: Int!
  status: AgentSrAssentStatus!
  factHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentSrRefreshObservation {
  refreshId: ID!
  status: AgentSrRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentSrPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentSrSessionStatus!
  summary: AgentUntrustedText!
  sealedAssentCount: Int!
  invalidatedAssentCount: Int!
  uncertainRefreshIntents: [AgentSrRefreshObservation!]!
  remainingBudget: AgentSrBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentSrNextAction!]!
  blockedReasons: [AgentSrBlockedReason!]!
  cardHash: SHA256!
}

type AgentSrMutationResult {
  decision: String!
  session: AgentSrSession
  certificate: AgentSrCertificate
  member: AgentSrAssent
  receipt: AgentSrNominationReceipt
  perception: AgentSrPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentSrBudgetInput {
  nominateUnits: Long!
  assentUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  dualControlThreshold: Int!
  maxAssentsPerCertificate: Int!
}

input CreateSplitResolutionSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentSrBudgetInput!
}

input NominateSplitCandidateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  candidateId: ID!
  expectedFactHash: SHA256!
  idempotencyKey: String!
}

input CastResolutionAssentInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  priorCandidateId: ID
  candidateId: ID!
  approverPrincipalId: ID!
  expectedFactHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealResolutionCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedAssentSetHash: SHA256!
  expectedResolvedFactHash: SHA256!
  idempotencyKey: String!
}

input InvalidateResolutionCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  candidateId: ID!
  idempotencyKey: String!
}

input PrepareResolutionRefreshInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveResolutionUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentSrUncertaintyResolution!
  idempotencyKey: String!
}

input CloseSplitResolutionSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentSrProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentSrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentSrProfile
  agentSrSession(accountId: ID!, sessionId: ID!): AgentSrSession
  agentSrCertificate(accountId: ID!, certificateId: ID!): AgentSrCertificate
  agentSrPerceptionCard(accountId: ID!, sessionId: ID!): AgentSrPerceptionCard
  agentSrNominatedCandidate(
    accountId: ID!
    sessionId: ID!
    candidateId: ID!
  ): AgentSrNominationReceipt
  agentSrSearchProfiles(input: AgentSrProfileSearchInput!): [AgentSrProfile!]!
}

type Mutation {
  createSplitResolutionSession(
    input: CreateSplitResolutionSessionInput!
  ): AgentSrMutationResult!
  nominateSplitCandidate(input: NominateSplitCandidateInput!): AgentSrMutationResult!
  castResolutionAssent(
    input: CastResolutionAssentInput!
  ): AgentSrMutationResult!
  sealResolutionCertificate(
    input: SealResolutionCertificateInput!
  ): AgentSrMutationResult!
  invalidateResolutionCertificate(
    input: InvalidateResolutionCertificateInput!
  ): AgentSrMutationResult!
  prepareResolutionRefresh(
    input: PrepareResolutionRefreshInput!
  ): AgentSrMutationResult!
  resolveResolutionUncertainty(
    input: ResolveResolutionUncertaintyInput!
  ): AgentSrMutationResult!
  closeSplitResolutionSession(
    input: CloseSplitResolutionSessionInput!
  ): AgentSrMutationResult!
  approveSplitResolutionProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    approverPrincipalId: ID!
  ): AgentSrMutationResult!
  revokeSplitResolutionProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentSrMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Expand mutations reject when assent ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.

## 10. Procedural memory

Approved resolution profiles are procedural memory: versioned instructions for how
dual-control humans may resolve REQUIRE_HUMAN_ON_SPLIT conflicts. Procedure refs may
point to presentation/playbook steps. Profiles are immutable after approval;
agents perceive `procedureTags` and `allowedNextActions` on perception cards,
never inventing resolution policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which resolution profile fits
incident split conflicts?"). Embeddings are account-owned and must be queried
with `account_id` equality. The reference schema stores vectors but does **not**
create a cross-tenant HNSW index; production builds account-partitioned HNSW
segments.

Semantic retrieval may return candidate profiles only. It never authorizes
nominate, assent, seal, invalidate, or refresh. Vector `topK` is budgeted and
clamped.

```sql
CREATE TABLE agent_sr_profile_embedding (
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
    REFERENCES agent_sr_profile (account_id, profile_id, profile_version)
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
assent counts, uncertain refresh intents, remaining budgets, procedure tags,
allowed next actions, and blocked reasons. Summary text is `UntrustedText`.
Cards never embed raw redacted fact bodies. `cardHash` makes perception
replayable.

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, assent casts, certificate seals, and audit
appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed certificates but are
not authoritative for quorum winners.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Certificate refresh side-effects are not silently ACID-coupled; silence becomes
`UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Assent/threshold caps on assents per certificate and per session.
- Budget ledgers for NOMINATE/ASSENT/VECTOR/SEAL/REFRESH.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped refresh-ledger/board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Nominating observations by scanning recipient or sharing sessions (rejected).
- Casting assents by walking all refresh intents for an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  observation-keyed active certificate assent indexes).

### Required access paths

- Observation nomination: PK `(account_id, candidate_id)`.
- Assents by certificate/observation: composite indexes leading with
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
- Sticky first-ACK adoption after supersession: invalidation + quorum retally +
  refresh uncertainty + profile revocation.
- Silent refresh success: `UNKNOWN_EFFECT` until ACK.
- Recursive peer-refresh storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/assent/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Refresh ACK lag and `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow dual-control

Compile profiles and validate candidate nomination without durable
certificates.

### Phase 2: single-candidate certificates only

Allow sealed certificates for dual-control threshold 1 from nominated SPLIT_CANDIDATE_FACT
observations.

### Phase 3: multi-approver dual-control

Enable budgeted multi-observation assent under approved profiles.

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
- Assent binds observed fact hash and ordinal under budget.
- Seal binds immutable certificate assents under assent-set and winner hashes.
- Refresh silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/assent path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed certificates after process restart.

## 21. Product decision

Adopt the Split Resolution Plane as the deterministic dual-control path for
`REQUIRE_HUMAN_ON_SPLIT` outcomes from the Refresh Quorum Plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the human-gap
   after quorum splits without sticky first-ACK adoption.
2. Account-leading indexes, dual-control distinct-principal constraints, and
   **FULL SCAN REJECTED** planner rules protect 99.99% neighbor latency on
   boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
