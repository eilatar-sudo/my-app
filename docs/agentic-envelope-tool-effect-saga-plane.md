# mondayDB Agentic Envelope Tool-Effect Saga Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-17.v1`

## 1. Why this plane, before how

A sealed envelope purpose-gate certificate can authorize hop-attenuated
reads and tools against compiled working-set slots, but it does not decide
**how a gated `TOOL_MUTATE` becomes an external effect**: which steps may
dispatch, which compensations may run, how silence is recorded, and how to
do so without scanning every gate decision, working-set slot, or board row
in an account.

Without an envelope tool-effect saga plane, operators and agents either:

- scan every sealed gate decision looking for "what this agent may mutate
  now" (neighbor-harmful on boards with 1M+ rows), or
- fire the tool immediately after a gate certificate, so a `HALTED` slot
  leaks into a mutating provider call, a hop-attenuated purpose is amplified
  back to the donor, compensation silently "restores" a disputed fact, and a
  silent tool ACK is invented as success.

The product trade-off is **tool fluency versus envelope-scoped effect
isolation**:

- Dispatching every gated `TOOL_MUTATE` immediately maximizes agent fluency
  and reduces re-planning cost, but creates halt leak, purpose
  amplification, invented winners, unauditable compensation, and recursive
  tool storms against neighbors.
- Binding a sealed saga certificate under an approved saga profile, gate-
  decision point lookups, halt-mutate fences, purpose-amplification fences,
  compensation-leak fences, and steward budgets adds one bounded evaluate
  transaction and short-lived saga storage.
- Semantic similarity may discover saga profiles, but it must never decide
  whether a gate decision may be nominated, a saga evaluated, a certificate
  sealed, or an effect dispatched.

The recommended model keeps the data plane deterministic:

1. An approved saga profile defines allowed gate kinds, step kinds,
   compensation policy, and notify policy. Evaluation **never** invents a
   winning fact hash.
2. A saga session opens under purpose, budget, and authorization fences, and
   only nominates sealed purpose-gate decisions by point lookup from the
   Envelope Purpose Gate plane.
3. mondayDB evaluates a saga whose step kind is a pure function of
   `(gate_kind, placement_kind, requested_purpose_hash,
   decision_attenuation_hash, hop_count, tool_scope_hash)`. Halted slots
   cannot become mutating tool steps.
4. Sealing a saga certificate binds
   `consumer_ref + purpose_hash + decision_set_hash + step_set_hash +
   compensation_set_hash + attenuation_hash`. The certificate **must not**
   emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; effect intents may become
   `UNKNOWN_EFFECT` until acknowledged. Compensation never claims success
   from silence.
6. Unscoped gate-decision, working-set, grant-graph, citation, or board
   scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"mutate every gated peer forever" or "compensate every silent ACK forever"
loops are rejectable before they scan boards with 1M+ rows. Perception is
restored by sealed saga certificates, not by magic orchestration inside the
engine.

### Product outcome

For any envelope tool-effect saga evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or effect dispatch?
- Which nominated gate decisions, placement kinds, hop counts, attenuation
  hashes, step kinds, and compensation plans were bound?
- Is the saga certificate still current, invalidated, or awaiting effect
  acknowledgement?
- Did async tool dispatch or compensation become `UNKNOWN_EFFECT`?
- Can the saga history be replayed without invoking an LLM?

## 2. Scope and ownership

The Envelope Tool-Effect Saga Plane owns:

1. Immutable approved saga profiles as procedural memory of "how sealed
   purpose-gate `TOOL_MUTATE` and `TOOL_READ` decisions become envelope-
   scoped effects without amplifying purpose, leaking halted facts, or
   inventing compensation success."
2. Tenant-scoped saga sessions with purpose and budget fences.
3. Deterministic nomination of sealed gate decisions by point lookup — never
   gate-ledger, working-set, or board scans.
4. Deterministic evaluation receipts, sealed saga certificates, and
   immutable saga steps that never invent a winner.
5. Invalidation and effect intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded saga budgets.

It integrates with, but does not replace:

- **Envelope Purpose Gate:** supplies sealed gate-decision IDs, gate kinds,
  placement kinds, attenuation hashes, and invalidation events.
- **Certificate Placement / Citation Sharing / Grant Graph Visibility:**
  upstream hop-attenuated context that produced the gated decisions.
- **Executive Freeze / Thaw SLA:** halt/restore context that still forbids
  mutating a halted body.
- **Emergency Containment:** the coarse stop/drain/quarantine path used when
  a contained decision evaluates to `SKIP` or `DENIED`; this plane is
  purpose-scoped saga binding, not workspace-wide containment.
- **Effect Saga / Transaction Intent:** the generic ACID/external-effect
  orchestrator; this plane binds those effects to a specific gate
  certificate and envelope purpose.
- **Decision Memory:** may consume sealed saga certificates as reuse
  evidence, not raw tool receipts.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and effect units.

### Non-goals

- Letting an LLM decide that a gated mutate "feels safe to dispatch."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative saga certificates from columnar or vector
  projections.
- Cross-account saga dispatch or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external tool providers.
- Inventing a winning fact hash when compensation runs after a restored
  slot.
- Unbounded recursive gate-decision or board walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Saga profile contract

A saga profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_TOOL_MUTATE_DECISION`,
  `SEALED_TOOL_READ_DECISION`, `SUPERSEDED_DECISION`);
- evaluate threshold (distinct human or attested principals), max steps
  per certificate, and max nominated decisions;
- saga policy (`HALT_DENIES_MUTATE`, `PURPOSE_NARROW_ONLY`,
  `COMPENSATION_NEVER_RESTORES_WINNER`, `HOP_DENIES_DONOR_MUTATE`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed step kinds (`MUTATE`, `READ_ONLY`, `COMPENSATE`, `SKIP`) and
  notify policy after seal, invalidation, or upstream decision change;
- optional procedural refs for "how to present unknown, compensated, or
  skipped truth without a winner."

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

Nominating a sealed gate decision returns a nomination receipt. Evaluating a
saga binds each nominated decision to a step kind that is compatible with the
gate kind, placement kind, and purpose relation. Sealing a certificate binds
`consumer_ref + purpose_hash + decision_set_hash + step_set_hash +
compensation_set_hash + attenuation_hash`. Certificates **must not** emit a
`resolved_fact_hash` winner. Steps compiled from halted, extended-halt, or
omitted decisions are rejected when the requested step kind is `MUTATE`
(halt-mutate fence). Steps that would amplify purpose relative to the
decision attenuation hash are rejected (purpose-amplification fence).
Compensation steps that would emit a winner or restore a halted body are
rejected (compensation-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream gate, placement, or visibility
revocation. Effect intents start as `PREPARED`, may become `UNKNOWN_EFFECT`
when the tool provider does not acknowledge, and never invent success from
silence. Compensation of `UNKNOWN_EFFECT` remains `UNKNOWN_EFFECT` until a
trusted receipt arrives.

### 3.5 Availability contract

Saga control-plane APIs target 99.99% availability for open, nominate,
evaluate, seal, and perception reads. External tool and compensation
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Saga evaluation must not silently restore neighbor-impacting board
mutations from halted slots.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and saga rules are immutable.
4. Step identity
   (`source_decision_id`, `disputed_fact_hash`, `attenuation_hash`,
   `step_ordinal`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Decision nomination uses point lookup by
   `(account_id, source_decision_id)` — never full gate-ledger or board
   scans.
7. Effect intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/dispatch.
10. Halted, extended-halt, and omitted decisions cannot evaluate to
    `MUTATE` (halt-mutate fence).
11. Requested purposes that amplify a decision attenuation hash are rejected
    (purpose-amplification fence).
12. Compensation cannot emit a winning fact hash or restore a halted body
    (compensation-leak fence).
13. Saga certificates bind decision set, step set, compensation set, and
    attenuation hashes; they never invent a winning fact hash.
14. Plans that require unscoped board, session, working-set, grant-graph,
    gate-ledger, or citation-ledger scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate saga rules. Approval validates definition hash,
requires at least one saga rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and evaluate

Nominate looks up a sealed gate decision by primary key, verifies observation
kind and purpose attenuation, and emits a nomination receipt. Evaluate binds
compatible step kinds under CAS and evaluate budgets.

### 5.4 Seal saga certificate

Seal materializes immutable steps from the evaluation receipt. The seal
**does not** choose a winner among disputed fact hashes and **does not**
restore halted bodies into mutating context.

### 5.5 Invalidate and dispatch

Invalidation marks certificates stale when upstream decisions revoke, release,
or supersede. Optional effect intents dispatch tools to providers; unresolved
external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and saga rules. No session may open.

### 6.2 Session open

An authorized principal opens a session against an `APPROVED` profile.
Budgets and purpose hashes are captured.

### 6.3 Nominating / evaluating

Gate decisions are nominated by point lookup and an evaluation receipt is
emitted. Evaluate work consumes budget against that session's primary key.

### 6.4 Sealed / invalidated

Seal materializes an immutable saga certificate. Upstream change may
invalidate. Effect dispatch may enter `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`. Terminal records
are append-only.

### 6.6 Retain

Audit events, certificates, evaluation receipts, and terminal records retain
per account retention policy for replay. Vector profile embeddings follow the
same account-scoped watermark as the approved definition hash.

## 7. TypeScript contracts

These interfaces are the service boundary for envelope tool-effect sagas and
gate-bound mutate/compensate authorization. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type SourceDecisionId = string;
type EvaluationId = string;
type CertificateId = string;
type StepId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_GATE_DECISION"
  | "EVALUATE_TOOL_EFFECT_SAGA"
  | "SEAL_SAGA_CERTIFICATE"
  | "INVALIDATE_TOOL_EFFECT_SAGA"
  | "PREPARE_SAGA_EFFECT"
  | "RESOLVE_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type ToolEffectSagaBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "DECISION_MISSING"
  | "EVALUATE_NOT_READY"
  | "HALT_MUTATE_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "COMPENSATION_LEAK_DENIED"
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
  | "DISPATCHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type MemberStatus =
  | "SEALED"
  | "INVALIDATED"
  | "DISPATCHING"
  | "SUPERSEDED_REF"
  | "UNKNOWN_EFFECT";

type SourceDecisionKind =
  | "SEALED_TOOL_MUTATE_DECISION"
  | "SEALED_TOOL_READ_DECISION"
  | "SUPERSEDED_DECISION";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type GateKind =
  | "TOOL_READ"
  | "TOOL_MUTATE"
  | "DENIED"
  | "UNKNOWN_EFFECT";

type StepKind =
  | "MUTATE"
  | "READ_ONLY"
  | "COMPENSATE"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type PurposeRelation =
  | "EQUAL"
  | "NARROWS"
  | "AMPLIFIES"
  | "UNRELATED"
  | "UNKNOWN_EFFECT";

type EffectIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface EnvelopeToolEffectSagaBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly effectUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxStepsPerCertificate: number;
  readonly maxNominatedDecisions: number;
}

interface EnvelopeToolEffectSagaProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly evaluateThreshold: number;
  readonly maxStepsPerCertificate: number;
  readonly maxNominatedDecisions: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface EnvelopeToolEffectSagaSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: EnvelopeToolEffectSagaBudget;
  readonly consumed: Omit<
    EnvelopeToolEffectSagaBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxStepsPerCertificate"
    | "maxNominatedDecisions"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface DecisionNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceDecisionId: SourceDecisionId;
  readonly sourceDecisionKind: SourceDecisionKind;
  readonly placementKind: PlacementKind;
  readonly gateKind: GateKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface ToolEffectSagaEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly decisionSetHash: Sha256;
  readonly stepSetHash: Sha256;
  readonly compensationSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface ToolEffectSagaStep {
  readonly accountId: AccountId;
  readonly stepId: StepId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceDecisionId: SourceDecisionId;
  readonly sourceDecisionKind: SourceDecisionKind;
  readonly stepOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly gateKind: GateKind;
  readonly stepKind: StepKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface ToolEffectSagaCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly stepSetHash: Sha256;
  readonly compensationSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly stepWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ToolEffectSagaEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentEnvelopeToolEffectSagaPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedStepCount: number;
  readonly mutateStepCount: number;
  readonly readOnlyStepCount: number;
  readonly compensateStepCount: number;
  readonly skippedStepCount: number;
  readonly invalidatedStepCount: number;
  readonly uncertainEffectIntents: readonly ToolEffectSagaEffectObservation[];
  readonly remainingBudget: Omit<
    EnvelopeToolEffectSagaBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxStepsPerCertificate"
    | "maxNominatedDecisions"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ToolEffectSagaBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateEnvelopeToolEffectSagaSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: EnvelopeToolEffectSagaBudget;
}

interface NominateGateDecisionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceDecisionId: SourceDecisionId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateToolEffectSagaInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedDecisionSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealSagaCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedStepSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateToolEffectSagaInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceDecisionId: SourceDecisionId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "DECISION_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareSagaEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveSagaUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_RECEIPT"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseEnvelopeToolEffectSagaSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type EnvelopeToolEffectSagaDecision =
  | { readonly decision: "ALLOWED"; readonly session: EnvelopeToolEffectSagaSession;
      readonly certificate?: ToolEffectSagaCertificate; readonly member?: ToolEffectSagaStep;
      readonly receipt?: DecisionNominationReceipt; readonly evaluation?: ToolEffectSagaEvaluationReceipt;
      readonly perception: AgentEnvelopeToolEffectSagaPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ToolEffectSagaBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentEnvelopeToolEffectSagaPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE ets_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE ets_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ets_step_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE ets_source_kind AS ENUM (
  'SEALED_TOOL_MUTATE_DECISION', 'SEALED_TOOL_READ_DECISION',
  'SUPERSEDED_DECISION'
);
CREATE TYPE ets_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ets_gate_kind AS ENUM (
  'TOOL_READ', 'TOOL_MUTATE', 'DENIED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ets_step_kind AS ENUM (
  'MUTATE', 'READ_ONLY', 'COMPENSATE', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE ets_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ets_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ets_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_ets_profile_authority NOLOGIN;

CREATE TABLE agent_ets_authorization_evidence (
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

CREATE TABLE agent_ets_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status ets_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_steps_per_certificate SMALLINT NOT NULL
    CHECK (max_steps_per_certificate BETWEEN 1 AND 256),
  max_nominated_decisions SMALLINT NOT NULL
    CHECK (max_nominated_decisions BETWEEN 1 AND 256),
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
    REFERENCES agent_ets_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_ets_profile_saga_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_steps_per_certificate SMALLINT NOT NULL
    CHECK (max_steps_per_certificate BETWEEN 1 AND 256),
  require_effect_ack BOOLEAN NOT NULL,
  saga_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_ets_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_ets_decision_catalog (
  account_id BIGINT NOT NULL,
  source_decision_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  decision_ref TEXT NOT NULL,
  source_decision_kind ets_source_kind NOT NULL,
  placement_kind ets_placement_kind NOT NULL,
  gate_kind ets_gate_kind NOT NULL,
  status ets_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  decision_sealed_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_decision_id),
  UNIQUE (account_id, decision_ref, source_decision_kind)
);

CREATE TABLE agent_ets_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status ets_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_effect_units BIGINT NOT NULL CHECK (budget_effect_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_effect_units BIGINT NOT NULL CHECK (consumed_effect_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_steps_per_certificate SMALLINT NOT NULL
    CHECK (max_steps_per_certificate BETWEEN 1 AND 256),
  max_nominated_decisions SMALLINT NOT NULL
    CHECK (max_nominated_decisions BETWEEN 1 AND 256),
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
    REFERENCES agent_ets_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_ets_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_effect_units <= budget_effect_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_ets_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  source_decision_kind ets_source_kind NOT NULL,
  placement_kind ets_placement_kind NOT NULL,
  gate_kind ets_gate_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_decision_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_ets_decision_catalog (account_id, source_decision_id)
);

CREATE TABLE agent_ets_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  step_set_hash CHAR(64) NOT NULL CHECK (length(step_set_hash) = 64),
  compensation_set_hash CHAR(64) NOT NULL
    CHECK (length(compensation_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id)
);

CREATE TABLE agent_ets_saga_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  step_set_hash CHAR(64) NOT NULL CHECK (length(step_set_hash) = 64),
  compensation_set_hash CHAR(64) NOT NULL
    CHECK (length(compensation_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  step_watermark SMALLINT NOT NULL CHECK (step_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_ets_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_ets_saga_step (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  source_decision_kind ets_source_kind NOT NULL,
  step_ordinal SMALLINT NOT NULL CHECK (step_ordinal BETWEEN 0 AND 256),
  status ets_step_status NOT NULL,
  placement_kind ets_placement_kind NOT NULL,
  gate_kind ets_gate_kind NOT NULL,
  step_kind ets_step_kind NOT NULL,
  purpose_relation ets_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, certificate_id, source_decision_id, step_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ets_saga_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_ets_decision_catalog (account_id, source_decision_id)
);

CREATE TABLE agent_ets_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'DECISION_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ets_saga_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_ets_decision_catalog (account_id, source_decision_id)
);

CREATE TABLE agent_ets_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status ets_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL
    CHECK (length(canonical_request_hash) = 64),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ets_saga_certificate (account_id, certificate_id)
);

CREATE TABLE agent_ets_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'EFFECT'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id)
);

CREATE TABLE agent_ets_terminal_record (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  session_id UUID NOT NULL,
  effect_id UUID,
  conflict_id UUID,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id)
);

CREATE TABLE agent_ets_command_result (
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

CREATE TABLE agent_ets_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_ets_audit_event (
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

CREATE TABLE agent_ets_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_ets_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status ets_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ets_session (account_id, session_id)
);

CREATE TABLE agent_ets_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_ets_profile()
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
       OR NEW.max_steps_per_certificate
         IS DISTINCT FROM OLD.max_steps_per_certificate
       OR NEW.max_nominated_decisions
         IS DISTINCT FROM OLD.max_nominated_decisions
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
    IF current_setting('app.ets_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.ets_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_ets_profile_protect
BEFORE INSERT OR UPDATE ON agent_ets_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_ets_profile();

CREATE FUNCTION protect_agent_ets_profile_saga_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status ets_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_ets_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile saga rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_ets_profile_saga_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_ets_profile_saga_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_ets_profile_saga_rule();

CREATE FUNCTION protect_agent_ets_saga_step()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_step$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_decision_id IS DISTINCT FROM OLD.source_decision_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.step_ordinal IS DISTINCT FROM OLD.step_ordinal
       OR NEW.source_decision_kind IS DISTINCT FROM OLD.source_decision_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.gate_kind IS DISTINCT FROM OLD.gate_kind
       OR NEW.step_kind IS DISTINCT FROM OLD.step_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'saga step identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.step_kind = 'MUTATE'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-mutate fence blocks mutating tool on halted decision';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than decision attenuation';
  END IF;

  IF NEW.step_kind = 'COMPENSATE'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'compensation-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.step_kind = 'MUTATE'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose mutate after attenuation hops';
  END IF;

  RETURN NEW;
END
$protect_step$;

CREATE TRIGGER agent_ets_saga_step_protect
BEFORE INSERT OR UPDATE ON agent_ets_saga_step
FOR EACH ROW EXECUTE FUNCTION protect_agent_ets_saga_step();

CREATE FUNCTION protect_agent_ets_effect_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_effect$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'effect intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.provider_idempotency_key
       IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared effect identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_effect$;

CREATE TRIGGER agent_ets_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_ets_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_ets_effect_intent();

CREATE FUNCTION approve_agent_ets_profile(
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
  stored_status ets_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ets_profile
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
  FROM agent_ets_profile_saga_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one saga rule';
  END IF;

  PERFORM set_config(
    'app.ets_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_ets_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_ets_profile(
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
  stored_status ets_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ets_profile
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
    'app.ets_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_ets_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_ets_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ets_profile_authority;
ALTER FUNCTION revoke_agent_ets_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ets_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_ets_profile_authority;
GRANT SELECT ON
  agent_ets_profile,
  agent_ets_profile_saga_rule
TO agent_ets_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ets_profile TO agent_ets_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_ets_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_ets_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ets_profile FROM PUBLIC;

CREATE INDEX agent_ets_session_work_idx ON agent_ets_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_ets_session_profile_idx ON agent_ets_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_ets_step_certificate_idx ON agent_ets_saga_step (
  account_id, certificate_id, sealed_at DESC, step_id
);
CREATE INDEX agent_ets_step_decision_idx ON agent_ets_saga_step (
  account_id, source_decision_id, sealed_at DESC, step_id
);
CREATE INDEX agent_ets_catalog_ref_idx ON agent_ets_decision_catalog (
  account_id, decision_ref, sealed_at DESC, source_decision_id
);
CREATE INDEX agent_ets_catalog_kind_idx ON agent_ets_decision_catalog (
  account_id, source_decision_kind, sealed_at DESC, source_decision_id
);
CREATE INDEX agent_ets_evaluation_session_idx ON agent_ets_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_ets_certificate_session_idx ON agent_ets_saga_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_ets_effect_work_idx ON agent_ets_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_ets_audit_time_idx ON agent_ets_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_ets_perception_status_idx ON agent_ets_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_ets_command_expiry_idx ON agent_ets_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_ets_invalidation_certificate_idx ON agent_ets_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_ets_authorization_evidence',
    'agent_ets_profile',
    'agent_ets_profile_saga_rule',
    'agent_ets_decision_catalog',
    'agent_ets_session',
    'agent_ets_nomination_receipt',
    'agent_ets_evaluation_receipt',
    'agent_ets_saga_certificate',
    'agent_ets_saga_step',
    'agent_ets_invalidation',
    'agent_ets_effect_intent',
    'agent_ets_budget_ledger',
    'agent_ets_terminal_record',
    'agent_ets_command_result',
    'agent_ets_audit_head',
    'agent_ets_audit_event',
    'agent_ets_audit_anchor',
    'agent_ets_perception_snapshot',
    'agent_ets_projection_checkpoint'
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

Open, nominate, evaluate, seal, invalidate, and effect-prepare each run in a
single ACID row-store transaction with session CAS. Saga-certificate seal
never joins a columnar rebuild or HNSW mutation.

### 8.2 Tenant isolation

Forced RLS on every table uses `app.account_id`. Composite primary keys and
every access index lead with `account_id`. Missing tenant context yields no
rows, not a cross-tenant scan.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
effect work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentEtsSessionStatus {
  OPEN
  NOMINATING
  EVALUATING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentEtsStepStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentEtsSourceKind {
  SEALED_TOOL_MUTATE_DECISION
  SEALED_TOOL_READ_DECISION
  SUPERSEDED_DECISION
}

enum AgentEtsPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentEtsGateKind {
  TOOL_READ
  TOOL_MUTATE
  DENIED
  UNKNOWN_EFFECT
}

enum AgentEtsStepKind {
  MUTATE
  READ_ONLY
  COMPENSATE
  SKIP
  UNKNOWN_EFFECT
}

enum AgentEtsPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentEtsEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentEtsNextAction {
  NOMINATE_GATE_DECISION
  EVALUATE_TOOL_EFFECT_SAGA
  SEAL_SAGA_CERTIFICATE
  INVALIDATE_TOOL_EFFECT_SAGA
  PREPARE_SAGA_EFFECT
  RESOLVE_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentEtsBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  DECISION_MISSING
  EVALUATE_NOT_READY
  HALT_MUTATE_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  COMPENSATION_LEAK_DENIED
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

enum AgentEtsUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentEtsInvalidationReason {
  SUPERSEDED
  RETRACTED
  QUARANTINED
  DECISION_REVOKED
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentEtsBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  effectUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxStepsPerCertificate: Int!
  maxNominatedDecisions: Int!
}

type AgentEtsProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  evaluateThreshold: Int!
  maxStepsPerCertificate: Int!
  maxNominatedDecisions: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentEtsSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentEtsSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentEtsBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentEtsNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceDecisionId: ID!
  sourceDecisionKind: AgentEtsSourceKind!
  placementKind: AgentEtsPlacementKind!
  gateKind: AgentEtsGateKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentEtsEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  decisionSetHash: SHA256!
  stepSetHash: SHA256!
  compensationSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentEtsCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  decisionSetHash: SHA256!
  stepSetHash: SHA256!
  compensationSetHash: SHA256!
  attenuationHash: SHA256!
  stepWatermark: Int!
  sealedAt: DateTime!
}

type AgentEtsStep {
  accountId: ID!
  stepId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceDecisionId: ID!
  sourceDecisionKind: AgentEtsSourceKind!
  stepOrdinal: Int!
  status: AgentEtsStepStatus!
  placementKind: AgentEtsPlacementKind!
  gateKind: AgentEtsGateKind!
  stepKind: AgentEtsStepKind!
  purposeRelation: AgentEtsPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  sealedAt: DateTime!
}

type AgentEtsEffectObservation {
  effectId: ID!
  status: AgentEtsEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentEtsPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentEtsSessionStatus!
  summary: AgentUntrustedText!
  sealedStepCount: Int!
  mutateStepCount: Int!
  readOnlyStepCount: Int!
  compensateStepCount: Int!
  skippedStepCount: Int!
  invalidatedStepCount: Int!
  uncertainEffectIntents: [AgentEtsEffectObservation!]!
  remainingBudget: AgentEtsBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentEtsNextAction!]!
  blockedReasons: [AgentEtsBlockedReason!]!
  cardHash: SHA256!
}

type AgentEtsMutationResult {
  decision: String!
  session: AgentEtsSession
  certificate: AgentEtsCertificate
  member: AgentEtsStep
  receipt: AgentEtsNominationReceipt
  evaluation: AgentEtsEvaluationReceipt
  perception: AgentEtsPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentEtsBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  effectUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxStepsPerCertificate: Int!
  maxNominatedDecisions: Int!
}

input CreateEnvelopeToolEffectSagaSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentEtsBudgetInput!
}

input NominateGateDecisionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceDecisionId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluateToolEffectSagaInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedDecisionSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealSagaCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedStepSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateToolEffectSagaInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceDecisionId: ID!
  reasonCode: AgentEtsInvalidationReason!
  idempotencyKey: String!
}

input PrepareSagaEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveSagaUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentEtsUncertaintyResolution!
  idempotencyKey: String!
}

input AgentEtsProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentEtsProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentEtsProfile
  agentEtsSession(accountId: ID!, sessionId: ID!): AgentEtsSession
  agentEtsSagaCertificate(accountId: ID!, certificateId: ID!): AgentEtsCertificate
  agentEtsPerceptionCard(accountId: ID!, sessionId: ID!): AgentEtsPerceptionCard
  agentEtsNominatedDecision(
    accountId: ID!
    sessionId: ID!
    sourceDecisionId: ID!
  ): AgentEtsNominationReceipt
  agentEtsSearchProfiles(input: AgentEtsProfileSearchInput!): [AgentEtsProfile!]!
}

type Mutation {
  createEnvelopeToolEffectSagaSession(
    input: CreateEnvelopeToolEffectSagaSessionInput!
  ): AgentEtsMutationResult!
  nominateGateDecision(input: NominateGateDecisionInput!): AgentEtsMutationResult!
  evaluateToolEffectSaga(input: EvaluateToolEffectSagaInput!): AgentEtsMutationResult!
  sealSagaCertificate(input: SealSagaCertificateInput!): AgentEtsMutationResult!
  invalidateToolEffectSaga(
    input: InvalidateToolEffectSagaInput!
  ): AgentEtsMutationResult!
  prepareSagaEffect(input: PrepareSagaEffectInput!): AgentEtsMutationResult!
  resolveSagaUncertainty(
    input: ResolveSagaUncertaintyInput!
  ): AgentEtsMutationResult!
  closeEnvelopeToolEffectSagaSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentEtsMutationResult!
  approveEnvelopeToolEffectSagaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentEtsMutationResult!
  revokeEnvelopeToolEffectSagaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentEtsMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when step ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw tool payloads or redacted fact bodies.
- `sealSagaCertificate` is rejected with `HALT_MUTATE_DENIED` when a nominated
  halted, extended-halt, or omitted decision would evaluate to `MUTATE`.
- `evaluateToolEffectSaga` is rejected with `PURPOSE_AMPLIFICATION_DENIED`
  when the requested purpose would amplify a decision attenuation hash.
- Compensation that would restore a halted body or invent a winner is
  rejected with `COMPENSATION_LEAK_DENIED`.

## 10. Procedural memory

Approved saga profiles are procedural memory: versioned instructions for how
sealed purpose-gate `TOOL_MUTATE` and `TOOL_READ` decisions become envelope-
scoped effects without inventing a winner and without leaking halted bodies
into provider calls. Procedure refs may point to compensation/playbook steps.
Profiles are immutable after approval; agents perceive `procedureTags` and
`allowedNextActions` on perception cards, never inventing saga policy from
embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which saga profile fits
incident hop-attenuated tool mutate?"). Embeddings are account-owned and must
be queried with `account_id` equality. The reference schema stores vectors
but does **not** create a cross-tenant HNSW index; production builds
account-partitioned HNSW segments.

Semantic retrieval may return saga profiles only. It never authorizes
nominate, evaluate, seal, or dispatch. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_ets_profile_embedding (
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
    REFERENCES agent_ets_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed/mutate/
read-only/compensate/skipped/invalidated step counts, uncertain effect
intents, remaining budgets, procedure tags, allowed next actions, and
blocked reasons. Summary text is `UntrustedText`. Cards never embed raw tool
payloads or redacted fact bodies. `cardHash` makes perception replayable.
Agents perceive `MUTATE` as a gated provider call that still cannot invent a
winner, `READ_ONLY` as a non-mutating tool under the attenuated purpose,
`COMPENSATE` as an honest rollback plan that cannot restore a halted body,
`SKIP` as a sealed refusal, and `UNKNOWN_EFFECT` as unresolved provider
silence — never as a saga that "must have succeeded."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, saga-certificate
seals, and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed saga certificates
but are not authoritative for mutate, compensate, or skip outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Tool dispatch and compensation side-effects are not silently ACID-coupled;
silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Step/threshold caps on holds per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/EFFECT.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped gate-ledger, working-set, grant-graph, citation,
  or board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board mutations from
  halted slots.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding sagable decisions by scanning the purpose-gate or working-set
  ledger (rejected; nominate by `(account_id, source_decision_id)`).
- Evaluating a saga by walking all effect intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  decision-keyed active step indexes).

### Required access paths

- Decision nomination: PK `(account_id, source_decision_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Steps by certificate/decision: composite indexes leading with `account_id`.
- Effect work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/gate-ledger/citation scan is **FULL SCAN
REJECTED** before execution.

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
- Sticky first-ACK mutate after supersession: invalidation + re-evaluate +
  effect uncertainty + profile revocation.
- Halt leak of frozen bodies into mutating tools: halt-mutate fence.
- Compensation that restores a halted body or invents a winner:
  compensation-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot mutate: certificates bind decision
  and step sets, never `resolved_fact_hash`.
- Silent tool or compensation success: `UNKNOWN_EFFECT` until ACK.
- Recursive gate-ledger or board storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Halt-mutate rejection, purpose-amplification rejection, compensation-leak
  rejection, and `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow saga

Compile profiles and validate decision nomination without durable
certificates.

### Phase 2: read-only and skip only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT`
decisions as `READ_ONLY` or `SKIP`. Mutate stays closed.

### Phase 3: mutate and halt-mutate fences

Enable budgeted `MUTATE` from `RESTORED_WITHOUT_WINNER` decisions only.

### Phase 4: effect uncertainty

Enable saga effect intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`COMPENSATE` that cannot restore a halted body or invent a winner.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, halt-mutate,
  purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed gate-decision point lookup and hash match.
- Evaluate binds decision set and attenuation under budget.
- Seal is rejected when a halted decision would become a mutating tool, and
  never invents a winning fact hash.
- Saga-certificate seal binds immutable steps under decision-set, step-set,
  compensation-set, and attenuation hashes — never a winner hash.
- Effect silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed saga certificates after process restart.

## 21. Product decision

Adopt the Envelope Tool-Effect Saga Plane as the deterministic binding path
for gated `TOOL_MUTATE` and `TOOL_READ` decisions produced by the Envelope
Purpose Gate plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the tool-effect
   gap after purpose gating without sticky first-ACK mutate, halt leak,
   purpose amplification, invented winners, or gate-ledger scans.
2. Account-leading indexes, halt-mutate and purpose-amplification fences, and
   **FULL SCAN REJECTED** planner rules protect 99.99% neighbor latency on
   boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile discovery,
   perception cards, and hash-chained audit replay make the plane agent-ready
   without putting probabilistic AI inside the data engine.
