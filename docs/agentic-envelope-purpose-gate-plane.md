# mondayDB Agentic Envelope Purpose Gate Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-16.v1`

## 1. Why this plane, before how

A sealed certificate-placement packet can compile freeze, breach, thaw,
extend, and contain certificates into halt-aware working-set slots, but it
does not decide **whether an agent may read or invoke a tool against those
slots**: which hop-attenuated citations stay readable, which remain
redacted, which tools may mutate, and how to do so without scanning every
working-set, grant, or citation row in an account.

Without an envelope purpose-gate plane, operators and agents either:

- scan every compiled working-set slot looking for "what this agent may
  read or tool now" (neighbor-harmful on boards with 1M+ rows), or
- sticky-copy the latest slot into a tool/read envelope, so a hop-attenuated
  citation is amplified back to the donor purpose, a `HALTED` slot leaks
  frozen bodies into `READ_VISIBLE` or `TOOL_MUTATE`, and a silent tool ACK
  is invented as success.

The product trade-off is **tool/read fluency versus envelope-scoped purpose
isolation**:

- Authorizing every placed citation for every downstream read or tool
  maximizes agent fluency and reduces re-grounding cost, but creates
  purpose amplification, halt leak, hop leak, invented winners, and
  unauditable tool effects.
- Evaluating a sealed gate certificate under an approved purpose-gate
  profile, slot point lookups, purpose-amplification fences, halt-read
  fences, and steward budgets adds one bounded evaluate transaction and
  short-lived certificate storage.
- Semantic similarity may discover purpose-gate profiles, but it must never
  decide whether a slot may be nominated, a gate evaluated, a certificate
  sealed, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved purpose-gate profile defines allowed source-slot kinds, gate
   kinds, purpose attenuation, allowed tool scopes, and notify policy.
   Evaluation **never** invents a winning fact hash.
2. A gate session opens under purpose, budget, and authorization fences, and
   only nominates sealed working-set slots by point lookup from the
   Certificate Placement, Citation Sharing, and Grant Graph Visibility
   planes.
3. mondayDB evaluates a gate whose kind is a pure function of
   `(placement_kind, requested_purpose_hash, slot_attenuation_hash,
   hop_count, tool_scope_hash)`. Halted slots cannot become visible reads
   or mutating tools.
4. Sealing a gate certificate binds
   `consumer_ref + purpose_hash + slot_set_hash + gate_set_hash +
   attenuation_hash`. The certificate **must not** emit a
   `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped working-set, grant-graph, citation, or board scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ask every placed citation forever" or "tool every peer halt forever" loops
are rejectable before they scan boards with 1M+ rows. Perception is restored
by sealed gate certificates, not by magic authorization inside the engine.

### Product outcome

For any envelope purpose-gate evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or notify?
- Which nominated slots, placement kinds, hop counts, attenuation hashes,
  gate kinds, and tool scopes were bound?
- Is the gate certificate still current, invalidated, or awaiting notify?
- Did async gate notify become `UNKNOWN_EFFECT`?
- Can the gate history be replayed without invoking an LLM?

## 2. Scope and ownership

The Envelope Purpose Gate Plane owns:

1. Immutable approved purpose-gate profiles as procedural memory of "how
   sealed working-set slots and hop-attenuated citations authorize reads
   and tools without amplifying purpose or leaking halted facts."
2. Tenant-scoped gate sessions with purpose and budget fences.
3. Deterministic nomination of sealed source slots by point lookup — never
   working-set, grant-graph, or citation-ledger scans.
4. Deterministic evaluation receipts, sealed gate certificates, and
   immutable gate decisions that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded gate budgets.

It integrates with, but does not replace:

- **Certificate Placement:** supplies sealed working-set slot IDs, placement
  kinds, halt scopes, disputed fact sets, and invalidation events.
- **Citation Sharing / Grant Graph Visibility:** supply hop-attenuated
  citation grants and visibility envelopes that further narrow purpose.
- **Executive Freeze / Thaw SLA:** upstream halt/restore context that
  produced the placed slots.
- **Emergency Containment:** the coarse stop/drain/quarantine path used when
  a contained slot evaluates to `DENIED`; this plane is purpose-scoped
  gating, not workspace-wide containment.
- **Fact Consumption / Grounding / Citation Materialization:** constrain
  what a gated read may expose onto boards.
- **Working Set / Decision Memory:** consume sealed gate certificates, not
  raw working-set or grant-graph walks.
- **Transaction Intent / Effect Saga:** may execute gated tools under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and notify units.

### Non-goals

- Letting an LLM decide that a hop-attenuated citation "feels readable."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative gate certificates from columnar or vector
  projections.
- Cross-account gating or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external notify or tool consumers.
- Inventing a winning fact hash when a restored slot is gated.
- Unbounded recursive working-set or grant-graph walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Purpose-gate profile contract

A purpose-gate profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_WORKING_SET_SLOT`,
  `SEALED_CITATION_GRANT`, `SEALED_VISIBILITY_ENVELOPE`,
  `SUPERSEDED_SLOT`);
- evaluate threshold (distinct human or attested principals), max decisions
  per certificate, and max nominated slots;
- gate policy (`PURPOSE_NARROW_ONLY`, `HALT_DENIES_VISIBLE_READ`,
  `HALT_DENIES_MUTATING_TOOL`, `HOP_DENIES_DONOR_PURPOSE`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed tool scopes (read-only vs mutate) and notify policy after seal,
  invalidation, or upstream slot change;
- optional procedural refs for "how to present denied, redacted, or visible
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

### 3.3 Evaluate and certificate contract

Nominating a sealed source slot returns a nomination receipt. Evaluating a
gate binds each nominated slot to a gate kind that is compatible with the
placement kind and purpose relation. Sealing a certificate binds
`consumer_ref + purpose_hash + slot_set_hash + gate_set_hash +
attenuation_hash`. Certificates **must not** emit a `resolved_fact_hash`
winner. Decisions compiled from halted, extended-halt, or omitted slots are
rejected when the requested gate kind is `READ_VISIBLE` or `TOOL_MUTATE`
(halt-read fence). Decisions that would amplify purpose relative to the
slot attenuation hash are rejected (purpose-amplification fence).

### 3.4 Invalidation and refresh contract

Invalidations bind certificates to upstream placement, grant, or visibility
revocation. Notify intents start as `PREPARED`, may become `UNKNOWN_EFFECT`
when the notify or tool consumer does not acknowledge, and never invent
success from silence.

### 3.5 Availability contract

Purpose-gate control-plane APIs target 99.99% availability for open,
nominate, evaluate, seal, and perception reads. External notify and tool
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Gate evaluation must not silently restore neighbor-impacting board
reads or mutating tools from halted slots.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and gate rules are immutable.
4. Decision identity
   (`source_slot_id`, `disputed_fact_hash`, `attenuation_hash`,
   `decision_ordinal`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Slot nomination uses point lookup by
   `(account_id, source_slot_id)` — never full working-set or grant-graph
   scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/notify.
10. Halted, extended-halt, and omitted slots cannot evaluate to
    `READ_VISIBLE` or `TOOL_MUTATE` (halt-read fence).
11. Requested purposes that amplify a slot attenuation hash are rejected
    (purpose-amplification fence).
12. Gate certificates bind slot set, gate set, and attenuation hashes; they
    never invent a winning fact hash.
13. Plans that require unscoped board, session, working-set, grant-graph, or
    citation-ledger scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate gate rules. Approval validates definition hash,
requires at least one gate rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and evaluate

Nominate looks up a sealed source slot by primary key, verifies observation
kind and purpose attenuation, and emits a nomination receipt. Evaluate binds
compatible gate kinds under CAS and evaluate budgets.

### 5.4 Seal gate certificate

Seal materializes immutable decisions from the evaluation receipt. The seal
**does not** choose a winner among disputed fact hashes and **does not**
restore halted bodies into visible or mutating context.

### 5.5 Invalidate and notify

Invalidation marks certificates stale when upstream slots revoke, release,
or supersede. Optional notify intents retally gates to consumers; unresolved
external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and gate rules. No session may open.

### 6.2 Session open

An authorized principal opens a session against an `APPROVED` profile.
Budgets and purpose hashes are captured.

### 6.3 Nominating / evaluating

Source slots are nominated by point lookup and an evaluation receipt is
emitted. Evaluate work consumes budget against that session's primary key.

### 6.4 Sealed / invalidated

Seal materializes an immutable gate certificate. Upstream change may
invalidate. Notify may enter `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`. Terminal records
are append-only.

### 6.6 Retain

Audit events, certificates, evaluation receipts, and terminal records retain
per account retention policy for replay. Vector profile embeddings follow the
same account-scoped watermark as the approved definition hash.

## 7. TypeScript contracts

These interfaces are the service boundary for envelope purpose gates and
hop-attenuated read/tool authorization. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type SourceSlotId = string;
type EvaluationId = string;
type CertificateId = string;
type DecisionId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_SOURCE_SLOT"
  | "EVALUATE_PURPOSE_GATE"
  | "SEAL_GATE_CERTIFICATE"
  | "INVALIDATE_PURPOSE_GATE"
  | "PREPARE_GATE_NOTIFY"
  | "RESOLVE_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type PurposeGateBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "SLOT_MISSING"
  | "EVALUATE_NOT_READY"
  | "HALT_READ_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "HOP_LEAK_DENIED"
  | "HASH_MISMATCH"
  | "DECISION_THRESHOLD_NOT_MET"
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
  | "EVALUATING"
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

type SourceSlotKind =
  | "SEALED_WORKING_SET_SLOT"
  | "SEALED_CITATION_GRANT"
  | "SEALED_VISIBILITY_ENVELOPE"
  | "SUPERSEDED_SLOT";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type GateKind =
  | "READ_REDACTED"
  | "READ_VISIBLE"
  | "TOOL_READ"
  | "TOOL_MUTATE"
  | "DENIED"
  | "UNKNOWN_EFFECT";

type PurposeRelation =
  | "EQUAL"
  | "NARROWS"
  | "AMPLIFIES"
  | "UNRELATED"
  | "UNKNOWN_EFFECT";

type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface EnvelopePurposeGateBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxDecisionsPerCertificate: number;
  readonly maxNominatedSlots: number;
}

interface EnvelopePurposeGateProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly evaluateThreshold: number;
  readonly maxDecisionsPerCertificate: number;
  readonly maxNominatedSlots: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface EnvelopePurposeGateSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: EnvelopePurposeGateBudget;
  readonly consumed: Omit<
    EnvelopePurposeGateBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxDecisionsPerCertificate"
    | "maxNominatedSlots"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface SourceNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceSlotId: SourceSlotId;
  readonly sourceSlotKind: SourceSlotKind;
  readonly placementKind: PlacementKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface PurposeGateEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly slotSetHash: Sha256;
  readonly gateSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface PurposeGateDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceSlotId: SourceSlotId;
  readonly sourceSlotKind: SourceSlotKind;
  readonly decisionOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly gateKind: GateKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface PurposeGateCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly slotSetHash: Sha256;
  readonly gateSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionWatermark: number;
  readonly sealedAt: Timestamp;
}

interface PurposeGateNotifyObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentEnvelopePurposeGatePerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedDecisionCount: number;
  readonly visibleReadCount: number;
  readonly redactedReadCount: number;
  readonly deniedDecisionCount: number;
  readonly mutatingToolCount: number;
  readonly invalidatedDecisionCount: number;
  readonly uncertainNotifyIntents: readonly PurposeGateNotifyObservation[];
  readonly remainingBudget: Omit<
    EnvelopePurposeGateBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxDecisionsPerCertificate"
    | "maxNominatedSlots"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly PurposeGateBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateEnvelopePurposeGateSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: EnvelopePurposeGateBudget;
}

interface NominateSourceSlotInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceSlotId: SourceSlotId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluatePurposeGateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedSlotSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealGateCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedGateSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidatePurposeGateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceSlotId: SourceSlotId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "SLOT_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareGateNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveGateUncertaintyInput {
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

interface CloseEnvelopePurposeGateSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type EnvelopePurposeGateDecision =
  | { readonly decision: "ALLOWED"; readonly session: EnvelopePurposeGateSession;
      readonly certificate?: PurposeGateCertificate; readonly member?: PurposeGateDecision;
      readonly receipt?: SourceNominationReceipt; readonly evaluation?: PurposeGateEvaluationReceipt;
      readonly perception: AgentEnvelopePurposeGatePerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: PurposeGateBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentEnvelopePurposeGatePerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE epg_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE epg_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'REFRESHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE epg_decision_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE epg_source_kind AS ENUM (
  'SEALED_WORKING_SET_SLOT', 'SEALED_CITATION_GRANT',
  'SEALED_VISIBILITY_ENVELOPE', 'SUPERSEDED_SLOT'
);
CREATE TYPE epg_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE epg_gate_kind AS ENUM (
  'READ_REDACTED', 'READ_VISIBLE', 'TOOL_READ', 'TOOL_MUTATE', 'DENIED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE epg_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE epg_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE epg_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_epg_profile_authority NOLOGIN;

CREATE TABLE agent_epg_authorization_evidence (
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

CREATE TABLE agent_epg_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status epg_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  max_nominated_slots SMALLINT NOT NULL
    CHECK (max_nominated_slots BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_EVALUATE', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_epg_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_epg_profile_gate_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  require_notify BOOLEAN NOT NULL,
  gate_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_epg_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_epg_slot_catalog (
  account_id BIGINT NOT NULL,
  source_slot_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  slot_ref TEXT NOT NULL,
  source_slot_kind epg_source_kind NOT NULL,
  placement_kind epg_placement_kind NOT NULL,
  status epg_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  slot_sealed_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_slot_id),
  UNIQUE (account_id, slot_ref, source_slot_kind)
);

CREATE TABLE agent_epg_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status epg_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  max_nominated_slots SMALLINT NOT NULL
    CHECK (max_nominated_slots BETWEEN 1 AND 256),
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
    REFERENCES agent_epg_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_epg_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_epg_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_slot_id UUID NOT NULL,
  source_slot_kind epg_source_kind NOT NULL,
  placement_kind epg_placement_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_slot_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_epg_session (account_id, session_id),
  FOREIGN KEY (account_id, source_slot_id)
    REFERENCES agent_epg_slot_catalog (account_id, source_slot_id)
);

CREATE TABLE agent_epg_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  slot_set_hash CHAR(64) NOT NULL CHECK (length(slot_set_hash) = 64),
  gate_set_hash CHAR(64) NOT NULL CHECK (length(gate_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_epg_session (account_id, session_id)
);

CREATE TABLE agent_epg_gate_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  slot_set_hash CHAR(64) NOT NULL CHECK (length(slot_set_hash) = 64),
  gate_set_hash CHAR(64) NOT NULL CHECK (length(gate_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_watermark SMALLINT NOT NULL CHECK (decision_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_epg_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_epg_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_epg_gate_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_slot_id UUID NOT NULL,
  source_slot_kind epg_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status epg_decision_status NOT NULL,
  placement_kind epg_placement_kind NOT NULL,
  gate_kind epg_gate_kind NOT NULL,
  purpose_relation epg_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  UNIQUE (account_id, certificate_id, source_slot_id, decision_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_epg_gate_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_epg_session (account_id, session_id),
  FOREIGN KEY (account_id, source_slot_id)
    REFERENCES agent_epg_slot_catalog (account_id, source_slot_id)
);

CREATE TABLE agent_epg_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_slot_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'SLOT_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_epg_gate_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_slot_id)
    REFERENCES agent_epg_slot_catalog (account_id, source_slot_id)
);

CREATE TABLE agent_epg_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status epg_refresh_status NOT NULL,
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
    REFERENCES agent_epg_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_epg_gate_certificate (account_id, certificate_id)
);

CREATE TABLE agent_epg_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_epg_session (account_id, session_id)
);

CREATE TABLE agent_epg_terminal_record (
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
    REFERENCES agent_epg_session (account_id, session_id)
);

CREATE TABLE agent_epg_command_result (
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

CREATE TABLE agent_epg_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_epg_audit_event (
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

CREATE TABLE agent_epg_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_epg_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status epg_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_epg_session (account_id, session_id)
);

CREATE TABLE agent_epg_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_epg_profile()
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
       OR NEW.evaluate_threshold IS DISTINCT FROM OLD.evaluate_threshold
       OR NEW.max_decisions_per_certificate
         IS DISTINCT FROM OLD.max_decisions_per_certificate
       OR NEW.max_nominated_slots IS DISTINCT FROM OLD.max_nominated_slots
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
    IF current_setting('app.epg_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.epg_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_epg_profile_protect
BEFORE INSERT OR UPDATE ON agent_epg_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_epg_profile();

CREATE FUNCTION protect_agent_epg_profile_gate_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status epg_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_epg_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile gate rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_epg_profile_gate_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_epg_profile_gate_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_epg_profile_gate_rule();

CREATE FUNCTION protect_agent_epg_gate_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_slot_id IS DISTINCT FROM OLD.source_slot_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.decision_ordinal IS DISTINCT FROM OLD.decision_ordinal
       OR NEW.source_slot_kind IS DISTINCT FROM OLD.source_slot_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.gate_kind IS DISTINCT FROM OLD.gate_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'gate decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.gate_kind IN ('READ_VISIBLE', 'TOOL_MUTATE')
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-read fence blocks visible read or mutating tool on halted slot';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than slot attenuation';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.gate_kind = 'TOOL_MUTATE'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose mutate after attenuation hops';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_epg_gate_decision_protect
BEFORE INSERT OR UPDATE ON agent_epg_gate_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_epg_gate_decision();

CREATE FUNCTION protect_agent_epg_refresh_intent()
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

CREATE TRIGGER agent_epg_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_epg_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_epg_refresh_intent();

CREATE FUNCTION approve_agent_epg_profile(
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
  stored_status epg_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_epg_profile
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
  FROM agent_epg_profile_gate_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one gate rule';
  END IF;

  PERFORM set_config(
    'app.epg_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_epg_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_epg_profile(
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
  stored_status epg_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_epg_profile
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
    'app.epg_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_epg_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_epg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_epg_profile_authority;
ALTER FUNCTION revoke_agent_epg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_epg_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_epg_profile_authority;
GRANT SELECT ON
  agent_epg_profile,
  agent_epg_profile_gate_rule
TO agent_epg_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_epg_profile TO agent_epg_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_epg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_epg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_epg_profile FROM PUBLIC;

CREATE INDEX agent_epg_session_work_idx ON agent_epg_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_epg_session_profile_idx ON agent_epg_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_epg_decision_certificate_idx ON agent_epg_gate_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_epg_decision_slot_idx ON agent_epg_gate_decision (
  account_id, source_slot_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_epg_catalog_ref_idx ON agent_epg_slot_catalog (
  account_id, slot_ref, sealed_at DESC, source_slot_id
);
CREATE INDEX agent_epg_catalog_kind_idx ON agent_epg_slot_catalog (
  account_id, source_slot_kind, sealed_at DESC, source_slot_id
);
CREATE INDEX agent_epg_evaluation_session_idx ON agent_epg_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_epg_certificate_session_idx ON agent_epg_gate_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_epg_refresh_work_idx ON agent_epg_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_epg_audit_time_idx ON agent_epg_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_epg_perception_status_idx ON agent_epg_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_epg_command_expiry_idx ON agent_epg_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_epg_invalidation_certificate_idx ON agent_epg_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_epg_authorization_evidence',
    'agent_epg_profile',
    'agent_epg_profile_gate_rule',
    'agent_epg_slot_catalog',
    'agent_epg_session',
    'agent_epg_nomination_receipt',
    'agent_epg_evaluation_receipt',
    'agent_epg_gate_certificate',
    'agent_epg_gate_decision',
    'agent_epg_invalidation',
    'agent_epg_refresh_intent',
    'agent_epg_budget_ledger',
    'agent_epg_terminal_record',
    'agent_epg_command_result',
    'agent_epg_audit_head',
    'agent_epg_audit_event',
    'agent_epg_audit_anchor',
    'agent_epg_perception_snapshot',
    'agent_epg_projection_checkpoint'
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

Open, nominate, evaluate, seal, invalidate, and notify-prepare each run in a
single ACID row-store transaction with session CAS. Gate-certificate seal
never joins a columnar rebuild or HNSW mutation.

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

enum AgentEpgSessionStatus {
  OPEN
  NOMINATING
  EVALUATING
  SEALED
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentEpgDecisionStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentEpgSourceKind {
  SEALED_WORKING_SET_SLOT
  SEALED_CITATION_GRANT
  SEALED_VISIBILITY_ENVELOPE
  SUPERSEDED_SLOT
}

enum AgentEpgPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentEpgGateKind {
  READ_REDACTED
  READ_VISIBLE
  TOOL_READ
  TOOL_MUTATE
  DENIED
  UNKNOWN_EFFECT
}

enum AgentEpgPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentEpgRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentEpgNextAction {
  NOMINATE_SOURCE_SLOT
  EVALUATE_PURPOSE_GATE
  SEAL_GATE_CERTIFICATE
  INVALIDATE_PURPOSE_GATE
  PREPARE_GATE_NOTIFY
  RESOLVE_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentEpgBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  SLOT_MISSING
  EVALUATE_NOT_READY
  HALT_READ_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  HOP_LEAK_DENIED
  HASH_MISMATCH
  DECISION_THRESHOLD_NOT_MET
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentEpgUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentEpgInvalidationReason {
  SUPERSEDED
  RETRACTED
  QUARANTINED
  SLOT_REVOKED
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentEpgBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedSlots: Int!
}

type AgentEpgProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  evaluateThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedSlots: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentEpgSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentEpgSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentEpgBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentEpgNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceSlotId: ID!
  sourceSlotKind: AgentEpgSourceKind!
  placementKind: AgentEpgPlacementKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentEpgEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  slotSetHash: SHA256!
  gateSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentEpgCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  slotSetHash: SHA256!
  gateSetHash: SHA256!
  attenuationHash: SHA256!
  decisionWatermark: Int!
  sealedAt: DateTime!
}

type AgentEpgDecision {
  accountId: ID!
  decisionId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceSlotId: ID!
  sourceSlotKind: AgentEpgSourceKind!
  decisionOrdinal: Int!
  status: AgentEpgDecisionStatus!
  placementKind: AgentEpgPlacementKind!
  gateKind: AgentEpgGateKind!
  purposeRelation: AgentEpgPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  sealedAt: DateTime!
}

type AgentEpgNotifyObservation {
  refreshId: ID!
  status: AgentEpgRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentEpgPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentEpgSessionStatus!
  summary: AgentUntrustedText!
  sealedDecisionCount: Int!
  visibleReadCount: Int!
  redactedReadCount: Int!
  deniedDecisionCount: Int!
  mutatingToolCount: Int!
  invalidatedDecisionCount: Int!
  uncertainNotifyIntents: [AgentEpgNotifyObservation!]!
  remainingBudget: AgentEpgBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentEpgNextAction!]!
  blockedReasons: [AgentEpgBlockedReason!]!
  cardHash: SHA256!
}

type AgentEpgMutationResult {
  decision: String!
  session: AgentEpgSession
  certificate: AgentEpgCertificate
  member: AgentEpgDecision
  receipt: AgentEpgNominationReceipt
  evaluation: AgentEpgEvaluationReceipt
  perception: AgentEpgPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentEpgBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedSlots: Int!
}

input CreateEnvelopePurposeGateSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentEpgBudgetInput!
}

input NominateSourceSlotInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceSlotId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluatePurposeGateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedSlotSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealGateCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedGateSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidatePurposeGateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceSlotId: ID!
  reasonCode: AgentEpgInvalidationReason!
  idempotencyKey: String!
}

input PrepareGateNotifyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveGateUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentEpgUncertaintyResolution!
  idempotencyKey: String!
}

input AgentEpgProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentEpgProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentEpgProfile
  agentEpgSession(accountId: ID!, sessionId: ID!): AgentEpgSession
  agentEpgGateCertificate(accountId: ID!, certificateId: ID!): AgentEpgCertificate
  agentEpgPerceptionCard(accountId: ID!, sessionId: ID!): AgentEpgPerceptionCard
  agentEpgNominatedSlot(
    accountId: ID!
    sessionId: ID!
    sourceSlotId: ID!
  ): AgentEpgNominationReceipt
  agentEpgSearchProfiles(input: AgentEpgProfileSearchInput!): [AgentEpgProfile!]!
}

type Mutation {
  createEnvelopePurposeGateSession(
    input: CreateEnvelopePurposeGateSessionInput!
  ): AgentEpgMutationResult!
  nominateSourceSlot(input: NominateSourceSlotInput!): AgentEpgMutationResult!
  evaluatePurposeGate(input: EvaluatePurposeGateInput!): AgentEpgMutationResult!
  sealGateCertificate(input: SealGateCertificateInput!): AgentEpgMutationResult!
  invalidatePurposeGate(
    input: InvalidatePurposeGateInput!
  ): AgentEpgMutationResult!
  prepareGateNotify(input: PrepareGateNotifyInput!): AgentEpgMutationResult!
  resolveGateUncertainty(
    input: ResolveGateUncertaintyInput!
  ): AgentEpgMutationResult!
  closeEnvelopePurposeGateSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentEpgMutationResult!
  approveEnvelopePurposeGateProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentEpgMutationResult!
  revokeEnvelopePurposeGateProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentEpgMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when decision ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.
- `sealGateCertificate` is rejected with `HALT_READ_DENIED` when a nominated
  halted, extended-halt, or omitted slot would evaluate to `READ_VISIBLE` or
  `TOOL_MUTATE`.
- `evaluatePurposeGate` is rejected with `PURPOSE_AMPLIFICATION_DENIED` when
  the requested purpose would amplify a slot attenuation hash.

## 10. Procedural memory

Approved purpose-gate profiles are procedural memory: versioned instructions
for how sealed working-set slots and hop-attenuated citations authorize
reads and tools without inventing a winner and without leaking halted bodies
into agent context. Procedure refs may point to presentation/playbook steps.
Profiles are immutable after approval; agents perceive `procedureTags` and
`allowedNextActions` on perception cards, never inventing gate policy from
embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which purpose-gate profile
fits incident hop-attenuated citation reads?"). Embeddings are account-owned
and must be queried with `account_id` equality. The reference schema stores
vectors but does **not** create a cross-tenant HNSW index; production builds
account-partitioned HNSW segments.

Semantic retrieval may return purpose-gate profiles only. It never authorizes
nominate, evaluate, seal, or notify. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_epg_profile_embedding (
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
    REFERENCES agent_epg_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed/visible/
redacted/denied/mutating/invalidated decision counts, uncertain notify
intents, remaining budgets, procedure tags, allowed next actions, and
blocked reasons. Summary text is `UntrustedText`. Cards never embed raw
redacted fact bodies. `cardHash` makes perception replayable. Agents perceive
`READ_REDACTED` as a halt-aware redaction receipt, `READ_VISIBLE` as a
narrowed restored read without a chosen winner, `TOOL_READ` as a
non-mutating tool under the attenuated purpose, `TOOL_MUTATE` as a mutating
tool that still cannot invent a winner, and `DENIED` as a sealed refusal —
never as a gate that "must have been fine."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, gate-certificate
seals, and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed gate certificates
but are not authoritative for read, tool, or deny outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Gate notify and tool side-effects are not silently ACID-coupled; silence
becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Decision/threshold caps on holds per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/NOTIFY.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped working-set, grant-graph, citation, or board
  scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board reads or mutating
  tools from halted slots.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding gateable slots by scanning the working-set or grant-graph ledger
  (rejected; nominate by `(account_id, source_slot_id)`).
- Evaluating a gate by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  slot-keyed active decision indexes).

### Required access paths

- Slot nomination: PK `(account_id, source_slot_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Decisions by certificate/slot: composite indexes leading with `account_id`.
- Notify work: partial indexes on refresh intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/citation scan is **FULL SCAN REJECTED** before
execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session,
evaluation, and certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced RLS and PK
  scope.
- Purpose amplification for consumers: attenuation hash must narrow relative
  to observation and session purposes.
- Sticky first-ACK restore after supersession: invalidation + re-evaluate +
  notify uncertainty + profile revocation.
- Halt leak of frozen bodies into visible reads or mutating tools: halt-read
  fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot gating: certificates bind slot and
  gate sets, never `resolved_fact_hash`.
- Silent notify or tool success: `UNKNOWN_EFFECT` until ACK.
- Recursive working-set or grant-graph storms: budget and
  **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Halt-read rejection, purpose-amplification rejection, hop-leak rejection,
  and `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow gating

Compile profiles and validate slot nomination without durable certificates.

### Phase 2: redacted reads only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT` slots
as `READ_REDACTED` or `DENIED`. Visible reads stay closed.

### Phase 3: visible reads and halt-read fences

Enable budgeted `READ_VISIBLE` and `TOOL_READ` from
`RESTORED_WITHOUT_WINNER` slots only.

### Phase 4: notify uncertainty

Enable gate notify intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`TOOL_MUTATE` on hop-zero restored slots.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, halt-read,
  purpose-amplification, and notify start state.

### Behavioral validation

- Nominate requires sealed source-slot point lookup and hash match.
- Evaluate binds slot set and attenuation under budget.
- Seal is rejected when a halted slot would become a visible read or
  mutating tool, and never invents a winning fact hash.
- Gate-certificate seal binds immutable decisions under slot-set, gate-set,
  and attenuation hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed gate certificates after process restart.

## 21. Product decision

Adopt the Envelope Purpose Gate Plane as the deterministic authorization
path for reads and tools against hop-attenuated citations placed into
compiled working sets by the Certificate Placement plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the read/tool
   authorization gap after certificate placement without sticky first-ACK
   restore, halt leak, purpose amplification, invented winners, or
   working-set scans.
2. Account-leading indexes, halt-read and purpose-amplification fences, and
   **FULL SCAN REJECTED** planner rules protect 99.99% neighbor latency on
   boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
