# mondayDB Agentic Provider-Receipt Attestation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-18.v1`

## 1. Why this plane, before how

A sealed envelope tool-effect saga certificate can bind gated `TOOL_MUTATE`
and `TOOL_READ` decisions to envelope-scoped steps, and it can leave
unacknowledged provider work as `UNKNOWN_EFFECT`. It does not decide
**whether a later provider webhook, signed receipt, or compensation ACK is
trustworthy enough to leave `UNKNOWN_EFFECT`**: which receipts may bind,
which silence must stay unknown, and how to do so without scanning every
saga effect, compensation step, or board row in an account.

Without a provider-receipt attestation plane, operators and agents either:

- scan every `UNKNOWN_EFFECT` saga intent looking for "what we can now call
  success" (neighbor-harmful on boards with 1M+ rows), or
- treat the first webhook as success, so silence is invented as `ACKED`, a
  halted compensation "restores" a disputed fact, a hop-attenuated purpose
  is amplified back to the donor, and a missing signature is treated as a
  trusted receipt.

The product trade-off is **receipt fluency versus attestation isolation**:

- Accepting every provider callback immediately maximizes agent fluency and
  reduces re-planning cost, but creates silence-success invention, halt
  leak through compensation, unauditable ACK storms, and recursive receipt
  walks against neighbors.
- Binding a sealed attestation certificate under an approved attestation
  profile, saga-effect point lookups, silence-success fences,
  halt-attest fences, purpose-amplification fences, compensation-leak
  fences, and steward budgets adds one bounded evaluate transaction and
  short-lived attestation storage.
- Semantic similarity may discover attestation profiles, but it must never
  decide whether a saga effect may be nominated, a receipt evaluated, a
  certificate sealed, or an ACK dispatched.

The recommended model keeps the data plane deterministic:

1. An approved attestation profile defines allowed effect kinds, receipt
   kinds, attestation policy, and notify policy. Evaluation **never**
   invents a winning fact hash.
2. An attestation session opens under purpose, budget, and authorization
   fences, and only nominates sealed saga effect intents by point lookup
   from the Envelope Tool-Effect Saga plane.
3. mondayDB evaluates an attestation whose kind is a pure function of
   `(source_effect_kind, placement_kind, receipt_kind, requested_purpose_hash,
   attenuation_hash, hop_count, provider_receipt_hash)`. Silence cannot
   become success. Halted slots cannot become attested success.
4. Sealing an attestation certificate binds
   `consumer_ref + purpose_hash + effect_set_hash + receipt_set_hash +
   compensation_set_hash + attenuation_hash`. The certificate **must not**
   emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. Compensation never claims success
   from silence.
6. Unscoped saga-effect, working-set, grant-graph, citation, or board
   scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"ACK every silent peer forever" or "compensate every unsigned receipt
forever" loops are rejectable before they scan boards with 1M+ rows.
Perception is restored by sealed attestation certificates, not by magic
receipt orchestration inside the engine.

### Product outcome

For any provider-receipt attestation evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or notify dispatch?
- Which nominated saga effects, placement kinds, hop counts, attenuation
  hashes, receipt kinds, and attestation kinds were bound?
- Is the attestation certificate still current, invalidated, or awaiting
  notify acknowledgement?
- Did async notify or compensation become `UNKNOWN_EFFECT`?
- Can the attestation history be replayed without invoking an LLM?

## 2. Scope and ownership

The Provider-Receipt Attestation Plane owns:

1. Immutable approved attestation profiles as procedural memory of "how
   sealed saga `UNKNOWN_EFFECT` mutate and compensate intents become
   envelope-scoped receipt bindings without amplifying purpose, leaking
   halted facts, or inventing success from silence."
2. Tenant-scoped attestation sessions with purpose and budget fences.
3. Deterministic nomination of sealed saga effect intents by point lookup —
   never saga-ledger, working-set, or board scans.
4. Deterministic evaluation receipts, sealed attestation certificates, and
   immutable attestation bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded attestation budgets.

It integrates with, but does not replace:

- **Envelope Tool-Effect Saga:** supplies sealed effect-intent IDs, step
  kinds, placement kinds, attenuation hashes, and invalidation events.
- **Envelope Purpose Gate / Certificate Placement / Citation Sharing /
  Grant Graph Visibility:** upstream hop-attenuated context that produced
  the gated saga effects.
- **Executive Freeze / Thaw SLA:** halt/restore context that still forbids
  attesting success against a halted body.
- **Emergency Containment:** the coarse stop/drain/quarantine path used when
  a contained effect evaluates to `SKIP` or `ATTEST_FAILURE`; this plane is
  purpose-scoped receipt binding, not workspace-wide containment.
- **Effect Saga / Transaction Intent:** the generic ACID/external-effect
  orchestrator; this plane binds those receipts to a specific saga
  certificate and envelope purpose.
- **Decision Memory:** may consume sealed attestation certificates as reuse
  evidence, not raw provider webhooks.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and attest units.

### Non-goals

- Letting an LLM decide that a silent tool "feels successful enough."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative attestation certificates from columnar or
  vector projections.
- Cross-account receipt attestation or global nearest-neighbor
  authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external tool providers.
- Inventing a winning fact hash when a compensation receipt arrives after a
  restored slot.
- Unbounded recursive saga-effect or board walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Attestation profile contract

A profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_SAGA_MUTATE_EFFECT`,
  `SEALED_SAGA_READ_EFFECT`, `SEALED_SAGA_COMPENSATE_EFFECT`,
  `SUPERSEDED_EFFECT`);
- evaluate threshold (distinct human or attested principals), max bindings
  per certificate, and max nominated effects;
- attestation policy (`SILENCE_NEVER_SUCCESS`, `HALT_DENIES_SUCCESS`,
  `PURPOSE_NARROW_ONLY`, `COMPENSATION_NEVER_RESTORES_WINNER`,
  `HOP_DENIES_DONOR_SUCCESS`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed attestation kinds (`ATTEST_SUCCESS`, `ATTEST_FAILURE`,
  `ATTEST_COMPENSATE`, `ATTEST_UNKNOWN`, `SKIP`) and notify policy after
  seal, invalidation, or upstream effect change;
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

Nominating a sealed saga effect returns a nomination receipt. Evaluating an
attestation binds each nominated effect to an attestation kind that is
compatible with the receipt kind, placement kind, and purpose relation.
Sealing a certificate binds
`consumer_ref + purpose_hash + effect_set_hash + receipt_set_hash +
compensation_set_hash + attenuation_hash`. Certificates **must not** emit a
`resolved_fact_hash` winner. Bindings compiled from silence or unknown
receipts are rejected when the requested attestation kind is
`ATTEST_SUCCESS` (silence-success fence). Bindings compiled from halted,
extended-halt, or omitted effects are rejected when the requested
attestation kind is `ATTEST_SUCCESS` (halt-attest fence). Bindings that
would amplify purpose relative to the effect attenuation hash are rejected
(purpose-amplification fence). Compensation bindings that would emit a
winner or restore a halted body are rejected (compensation-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream saga, placement, or visibility
revocation. Notify intents start as `PREPARED`, may become `UNKNOWN_EFFECT`
when the notify provider does not acknowledge, and never invent success from
silence. Compensation of `UNKNOWN_EFFECT` remains `UNKNOWN_EFFECT` until a
trusted receipt arrives.

### 3.5 Availability contract

Attestation control-plane APIs target 99.99% availability for open, nominate,
evaluate, seal, and perception reads. External notify and compensation
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Attestation evaluation must not silently restore neighbor-impacting
board mutations from halted slots or unsigned receipts.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and attestation rules are immutable.
4. Binding identity
   (`source_effect_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `provider_receipt_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Effect nomination uses point lookup by
   `(account_id, source_effect_id)` — never full saga-ledger or board
   scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/attest.
10. Silence and unknown receipts cannot evaluate to `ATTEST_SUCCESS`
    (silence-success fence).
11. Halted, extended-halt, and omitted effects cannot evaluate to
    `ATTEST_SUCCESS` (halt-attest fence).
12. Requested purposes that amplify an effect attenuation hash are rejected
    (purpose-amplification fence).
13. Compensation cannot emit a winning fact hash or restore a halted body
    (compensation-leak fence).
14. Attestation certificates bind effect set, receipt set, compensation set,
    and attenuation hashes; they never invent a winning fact hash.
15. Plans that require unscoped board, session, working-set, grant-graph,
    saga-ledger, or citation-ledger scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate attestation rules. Approval validates definition
hash, requires at least one attestation rule, and fences the status
transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and evaluate

Nominate looks up a sealed saga effect by primary key, verifies observation
kind and purpose attenuation, and emits a nomination receipt. Evaluate binds
compatible attestation kinds under CAS and evaluate budgets.

### 5.4 Seal attestation certificate

Seal materializes immutable bindings from the evaluation receipt. The seal
**does not** choose a winner among disputed fact hashes and **does not**
restore halted bodies into attested-success context.

### 5.5 Invalidate and dispatch

Invalidation marks certificates stale when upstream effects revoke, release,
or supersede. Optional notify intents dispatch to providers; unresolved
external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and attestation rules. No session may open.

### 6.2 Session open

An authorized principal opens a session against an `APPROVED` profile.
Budgets and purpose hashes are captured.

### 6.3 Nominating / evaluating

Saga effects are nominated by point lookup and an evaluation receipt is
emitted. Evaluate work consumes budget against that session's primary key.

### 6.4 Sealed / invalidated

Seal materializes an immutable attestation certificate. Upstream change may
invalidate. Notify dispatch may enter `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`. Terminal records
are append-only.

### 6.6 Retain

Audit events, certificates, evaluation receipts, and terminal records retain
per account retention policy for replay. Vector profile embeddings follow the
same account-scoped watermark as the approved definition hash.

## 7. TypeScript contracts

These interfaces are the service boundary for provider-receipt attestation
and saga-bound receipt authorization. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type SourceEffectId = string;
type EvaluationId = string;
type CertificateId = string;
type BindingId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_SAGA_EFFECT"
  | "EVALUATE_PROVIDER_RECEIPT_ATTESTATION"
  | "SEAL_ATTESTATION_CERTIFICATE"
  | "INVALIDATE_PROVIDER_RECEIPT_ATTESTATION"
  | "PREPARE_ATTESTATION_EFFECT"
  | "RESOLVE_ATTESTATION_UNCERTAINTY"
  | "CLOSE_SESSION";

type ProviderReceiptAttestationBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "EFFECT_MISSING"
  | "EVALUATE_NOT_READY"
  | "SILENCE_SUCCESS_DENIED"
  | "HALT_ATTEST_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "COMPENSATION_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "UNSIGNED_RECEIPT_DENIED"
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

type SourceEffectKind =
  | "SEALED_SAGA_MUTATE_EFFECT"
  | "SEALED_SAGA_READ_EFFECT"
  | "SEALED_SAGA_COMPENSATE_EFFECT"
  | "SUPERSEDED_EFFECT";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type StepKind =
  | "MUTATE"
  | "READ_ONLY"
  | "COMPENSATE"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type ReceiptKind =
  | "TRUSTED_SUCCESS"
  | "TRUSTED_FAILURE"
  | "TRUSTED_COMPENSATION"
  | "SILENCE"
  | "UNKNOWN_EFFECT";

type AttestationKind =
  | "ATTEST_SUCCESS"
  | "ATTEST_FAILURE"
  | "ATTEST_COMPENSATE"
  | "ATTEST_UNKNOWN"
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

interface ProviderReceiptAttestationBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly attestUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedEffects: number;
}

interface ProviderReceiptAttestationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedEffects: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ProviderReceiptAttestationSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ProviderReceiptAttestationBudget;
  readonly consumed: Omit<
    ProviderReceiptAttestationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedEffects"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface EffectNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceEffectId: SourceEffectId;
  readonly sourceEffectKind: SourceEffectKind;
  readonly placementKind: PlacementKind;
  readonly stepKind: StepKind;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface ProviderReceiptAttestationEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly effectSetHash: Sha256;
  readonly receiptSetHash: Sha256;
  readonly compensationSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface ProviderReceiptAttestationBinding {
  readonly accountId: AccountId;
  readonly bindingId: BindingId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceEffectId: SourceEffectId;
  readonly sourceEffectKind: SourceEffectKind;
  readonly bindingOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly stepKind: StepKind;
  readonly receiptKind: ReceiptKind;
  readonly attestationKind: AttestationKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface ProviderReceiptAttestationCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly effectSetHash: Sha256;
  readonly receiptSetHash: Sha256;
  readonly compensationSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ProviderReceiptAttestationEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentProviderReceiptAttestationPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly successBindingCount: number;
  readonly failureBindingCount: number;
  readonly compensateBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly ProviderReceiptAttestationEffectObservation[];
  readonly remainingBudget: Omit<
    ProviderReceiptAttestationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedEffects"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ProviderReceiptAttestationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateProviderReceiptAttestationSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ProviderReceiptAttestationBudget;
}

interface NominateSagaEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceEffectId: SourceEffectId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateProviderReceiptAttestationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedEffectSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealAttestationCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedReceiptSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateProviderReceiptAttestationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceEffectId: SourceEffectId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "EFFECT_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareAttestationEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveAttestationUncertaintyInput {
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

interface CloseProviderReceiptAttestationSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ProviderReceiptAttestationDecision =
  | { readonly decision: "ALLOWED"; readonly session: ProviderReceiptAttestationSession;
      readonly certificate?: ProviderReceiptAttestationCertificate;
      readonly member?: ProviderReceiptAttestationBinding;
      readonly receipt?: EffectNominationReceipt;
      readonly evaluation?: ProviderReceiptAttestationEvaluationReceipt;
      readonly perception: AgentProviderReceiptAttestationPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ProviderReceiptAttestationBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentProviderReceiptAttestationPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE pra_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE pra_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pra_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE pra_source_kind AS ENUM (
  'SEALED_SAGA_MUTATE_EFFECT', 'SEALED_SAGA_READ_EFFECT',
  'SEALED_SAGA_COMPENSATE_EFFECT', 'SUPERSEDED_EFFECT'
);
CREATE TYPE pra_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE pra_step_kind AS ENUM (
  'MUTATE', 'READ_ONLY', 'COMPENSATE', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE pra_receipt_kind AS ENUM (
  'TRUSTED_SUCCESS', 'TRUSTED_FAILURE', 'TRUSTED_COMPENSATION', 'SILENCE',
  'UNKNOWN_EFFECT'
);
CREATE TYPE pra_attestation_kind AS ENUM (
  'ATTEST_SUCCESS', 'ATTEST_FAILURE', 'ATTEST_COMPENSATE', 'ATTEST_UNKNOWN',
  'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE pra_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pra_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pra_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_pra_profile_authority NOLOGIN;

CREATE TABLE agent_pra_authorization_evidence (
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

CREATE TABLE agent_pra_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status pra_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_effects SMALLINT NOT NULL
    CHECK (max_nominated_effects BETWEEN 1 AND 256),
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
    REFERENCES agent_pra_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_pra_profile_attestation_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  require_trusted_receipt BOOLEAN NOT NULL,
  attestation_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_pra_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_pra_effect_catalog (
  account_id BIGINT NOT NULL,
  source_effect_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  effect_ref TEXT NOT NULL,
  source_effect_kind pra_source_kind NOT NULL,
  placement_kind pra_placement_kind NOT NULL,
  step_kind pra_step_kind NOT NULL,
  status pra_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  effect_sealed_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_effect_id),
  UNIQUE (account_id, effect_ref, source_effect_kind)
);

CREATE TABLE agent_pra_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status pra_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_attest_units BIGINT NOT NULL CHECK (budget_attest_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_attest_units BIGINT NOT NULL CHECK (consumed_attest_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_effects SMALLINT NOT NULL
    CHECK (max_nominated_effects BETWEEN 1 AND 256),
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
    REFERENCES agent_pra_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_pra_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_attest_units <= budget_attest_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_pra_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_effect_id UUID NOT NULL,
  source_effect_kind pra_source_kind NOT NULL,
  placement_kind pra_placement_kind NOT NULL,
  step_kind pra_step_kind NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_effect_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pra_session (account_id, session_id),
  FOREIGN KEY (account_id, source_effect_id)
    REFERENCES agent_pra_effect_catalog (account_id, source_effect_id)
);

CREATE TABLE agent_pra_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  effect_set_hash CHAR(64) NOT NULL CHECK (length(effect_set_hash) = 64),
  receipt_set_hash CHAR(64) NOT NULL CHECK (length(receipt_set_hash) = 64),
  compensation_set_hash CHAR(64) NOT NULL
    CHECK (length(compensation_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pra_session (account_id, session_id)
);

CREATE TABLE agent_pra_attestation_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  effect_set_hash CHAR(64) NOT NULL CHECK (length(effect_set_hash) = 64),
  receipt_set_hash CHAR(64) NOT NULL CHECK (length(receipt_set_hash) = 64),
  compensation_set_hash CHAR(64) NOT NULL
    CHECK (length(compensation_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  binding_watermark SMALLINT NOT NULL CHECK (binding_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pra_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_pra_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_pra_attestation_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_effect_id UUID NOT NULL,
  source_effect_kind pra_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status pra_binding_status NOT NULL,
  placement_kind pra_placement_kind NOT NULL,
  step_kind pra_step_kind NOT NULL,
  receipt_kind pra_receipt_kind NOT NULL,
  attestation_kind pra_attestation_kind NOT NULL,
  purpose_relation pra_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  provider_receipt_hash CHAR(64) NOT NULL
    CHECK (length(provider_receipt_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_effect_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_pra_attestation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pra_session (account_id, session_id),
  FOREIGN KEY (account_id, source_effect_id)
    REFERENCES agent_pra_effect_catalog (account_id, source_effect_id)
);

CREATE TABLE agent_pra_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_effect_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'EFFECT_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_pra_attestation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_effect_id)
    REFERENCES agent_pra_effect_catalog (account_id, source_effect_id)
);

CREATE TABLE agent_pra_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status pra_effect_status NOT NULL,
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
    REFERENCES agent_pra_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_pra_attestation_certificate (account_id, certificate_id)
);

CREATE TABLE agent_pra_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'ATTEST'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pra_session (account_id, session_id)
);

CREATE TABLE agent_pra_terminal_record (
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
    REFERENCES agent_pra_session (account_id, session_id)
);

CREATE TABLE agent_pra_command_result (
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

CREATE TABLE agent_pra_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_pra_audit_event (
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

CREATE TABLE agent_pra_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_pra_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status pra_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pra_session (account_id, session_id)
);

CREATE TABLE agent_pra_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_pra_profile()
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
       OR NEW.max_bindings_per_certificate
         IS DISTINCT FROM OLD.max_bindings_per_certificate
       OR NEW.max_nominated_effects
         IS DISTINCT FROM OLD.max_nominated_effects
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
    IF current_setting('app.pra_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.pra_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_pra_profile_protect
BEFORE INSERT OR UPDATE ON agent_pra_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_pra_profile();

CREATE FUNCTION protect_agent_pra_profile_attestation_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status pra_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_pra_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile attestation rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_pra_profile_attestation_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_pra_profile_attestation_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_pra_profile_attestation_rule();

CREATE FUNCTION protect_agent_pra_attestation_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_effect_id IS DISTINCT FROM OLD.source_effect_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.binding_ordinal IS DISTINCT FROM OLD.binding_ordinal
       OR NEW.source_effect_kind IS DISTINCT FROM OLD.source_effect_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.step_kind IS DISTINCT FROM OLD.step_kind
       OR NEW.receipt_kind IS DISTINCT FROM OLD.receipt_kind
       OR NEW.attestation_kind IS DISTINCT FROM OLD.attestation_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.provider_receipt_hash IS DISTINCT FROM OLD.provider_receipt_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'attestation binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attestation_kind = 'ATTEST_SUCCESS'
     AND NEW.receipt_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks ACK from unsigned or silent receipt';
  END IF;

  IF NEW.attestation_kind = 'ATTEST_SUCCESS'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-attest fence blocks success on halted effect';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than effect attenuation';
  END IF;

  IF NEW.attestation_kind = 'ATTEST_COMPENSATE'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'compensation-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.attestation_kind = 'ATTEST_SUCCESS'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose success after attenuation hops';
  END IF;

  IF NEW.attestation_kind = 'ATTEST_SUCCESS'
     AND NEW.receipt_kind IS DISTINCT FROM 'TRUSTED_SUCCESS' THEN
    RAISE EXCEPTION 'unsigned-receipt fence blocks success without trusted success receipt';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_pra_attestation_binding_protect
BEFORE INSERT OR UPDATE ON agent_pra_attestation_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_pra_attestation_binding();

CREATE FUNCTION protect_agent_pra_effect_intent()
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

CREATE TRIGGER agent_pra_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_pra_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_pra_effect_intent();

CREATE FUNCTION approve_agent_pra_profile(
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
  stored_status pra_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_pra_profile
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
  FROM agent_pra_profile_attestation_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one attestation rule';
  END IF;

  PERFORM set_config(
    'app.pra_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_pra_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_pra_profile(
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
  stored_status pra_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_pra_profile
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
    'app.pra_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_pra_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_pra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_pra_profile_authority;
ALTER FUNCTION revoke_agent_pra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_pra_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_pra_profile_authority;
GRANT SELECT ON
  agent_pra_profile,
  agent_pra_profile_attestation_rule
TO agent_pra_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_pra_profile TO agent_pra_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_pra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_pra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_pra_profile FROM PUBLIC;

CREATE INDEX agent_pra_session_work_idx ON agent_pra_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_pra_session_profile_idx ON agent_pra_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_pra_binding_certificate_idx ON agent_pra_attestation_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_pra_binding_effect_idx ON agent_pra_attestation_binding (
  account_id, source_effect_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_pra_catalog_ref_idx ON agent_pra_effect_catalog (
  account_id, effect_ref, sealed_at DESC, source_effect_id
);
CREATE INDEX agent_pra_catalog_kind_idx ON agent_pra_effect_catalog (
  account_id, source_effect_kind, sealed_at DESC, source_effect_id
);
CREATE INDEX agent_pra_evaluation_session_idx ON agent_pra_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_pra_certificate_session_idx ON agent_pra_attestation_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_pra_effect_work_idx ON agent_pra_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_pra_audit_time_idx ON agent_pra_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_pra_perception_status_idx ON agent_pra_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_pra_command_expiry_idx ON agent_pra_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_pra_invalidation_certificate_idx ON agent_pra_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_pra_authorization_evidence',
    'agent_pra_profile',
    'agent_pra_profile_attestation_rule',
    'agent_pra_effect_catalog',
    'agent_pra_session',
    'agent_pra_nomination_receipt',
    'agent_pra_evaluation_receipt',
    'agent_pra_attestation_certificate',
    'agent_pra_attestation_binding',
    'agent_pra_invalidation',
    'agent_pra_effect_intent',
    'agent_pra_budget_ledger',
    'agent_pra_terminal_record',
    'agent_pra_command_result',
    'agent_pra_audit_head',
    'agent_pra_audit_event',
    'agent_pra_audit_anchor',
    'agent_pra_perception_snapshot',
    'agent_pra_projection_checkpoint'
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
single ACID row-store transaction with session CAS. Attestation-certificate
seal never joins a columnar rebuild or HNSW mutation.

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

enum AgentPraSessionStatus {
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

enum AgentPraBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentPraSourceKind {
  SEALED_SAGA_MUTATE_EFFECT
  SEALED_SAGA_READ_EFFECT
  SEALED_SAGA_COMPENSATE_EFFECT
  SUPERSEDED_EFFECT
}

enum AgentPraPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentPraStepKind {
  MUTATE
  READ_ONLY
  COMPENSATE
  SKIP
  UNKNOWN_EFFECT
}

enum AgentPraReceiptKind {
  TRUSTED_SUCCESS
  TRUSTED_FAILURE
  TRUSTED_COMPENSATION
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentPraAttestationKind {
  ATTEST_SUCCESS
  ATTEST_FAILURE
  ATTEST_COMPENSATE
  ATTEST_UNKNOWN
  SKIP
  UNKNOWN_EFFECT
}

enum AgentPraPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentPraEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentPraNextAction {
  NOMINATE_SAGA_EFFECT
  EVALUATE_PROVIDER_RECEIPT_ATTESTATION
  SEAL_ATTESTATION_CERTIFICATE
  INVALIDATE_PROVIDER_RECEIPT_ATTESTATION
  PREPARE_ATTESTATION_EFFECT
  RESOLVE_ATTESTATION_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentPraBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  EFFECT_MISSING
  EVALUATE_NOT_READY
  SILENCE_SUCCESS_DENIED
  HALT_ATTEST_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  COMPENSATION_LEAK_DENIED
  HOP_LEAK_DENIED
  UNSIGNED_RECEIPT_DENIED
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

enum AgentPraUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentPraInvalidationReason {
  SUPERSEDED
  RETRACTED
  QUARANTINED
  EFFECT_REVOKED
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentPraBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  attestUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedEffects: Int!
}

type AgentPraProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedEffects: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentPraSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentPraSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentPraBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentPraNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceEffectId: ID!
  sourceEffectKind: AgentPraSourceKind!
  placementKind: AgentPraPlacementKind!
  stepKind: AgentPraStepKind!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentPraEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  effectSetHash: SHA256!
  receiptSetHash: SHA256!
  compensationSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentPraCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  effectSetHash: SHA256!
  receiptSetHash: SHA256!
  compensationSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentPraBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceEffectId: ID!
  sourceEffectKind: AgentPraSourceKind!
  bindingOrdinal: Int!
  status: AgentPraBindingStatus!
  placementKind: AgentPraPlacementKind!
  stepKind: AgentPraStepKind!
  receiptKind: AgentPraReceiptKind!
  attestationKind: AgentPraAttestationKind!
  purposeRelation: AgentPraPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  providerReceiptHash: SHA256!
  sealedAt: DateTime!
}

type AgentPraEffectObservation {
  effectId: ID!
  status: AgentPraEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentPraPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentPraSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  successBindingCount: Int!
  failureBindingCount: Int!
  compensateBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentPraEffectObservation!]!
  remainingBudget: AgentPraBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentPraNextAction!]!
  blockedReasons: [AgentPraBlockedReason!]!
  cardHash: SHA256!
}

type AgentPraMutationResult {
  decision: String!
  session: AgentPraSession
  certificate: AgentPraCertificate
  member: AgentPraBinding
  receipt: AgentPraNominationReceipt
  evaluation: AgentPraEvaluationReceipt
  perception: AgentPraPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentPraBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  attestUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedEffects: Int!
}

input CreateProviderReceiptAttestationSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentPraBudgetInput!
}

input NominateSagaEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceEffectId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluateProviderReceiptAttestationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedEffectSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealAttestationCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedReceiptSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateProviderReceiptAttestationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceEffectId: ID!
  reasonCode: AgentPraInvalidationReason!
  idempotencyKey: String!
}

input PrepareAttestationEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveAttestationUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentPraUncertaintyResolution!
  idempotencyKey: String!
}

input AgentPraProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentPraProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentPraProfile
  agentPraSession(accountId: ID!, sessionId: ID!): AgentPraSession
  agentPraAttestationCertificate(accountId: ID!, certificateId: ID!): AgentPraCertificate
  agentPraPerceptionCard(accountId: ID!, sessionId: ID!): AgentPraPerceptionCard
  agentPraNominatedEffect(
    accountId: ID!
    sessionId: ID!
    sourceEffectId: ID!
  ): AgentPraNominationReceipt
  agentPraSearchProfiles(input: AgentPraProfileSearchInput!): [AgentPraProfile!]!
}

type Mutation {
  createProviderReceiptAttestationSession(
    input: CreateProviderReceiptAttestationSessionInput!
  ): AgentPraMutationResult!
  nominateSagaEffect(input: NominateSagaEffectInput!): AgentPraMutationResult!
  evaluateProviderReceiptAttestation(
    input: EvaluateProviderReceiptAttestationInput!
  ): AgentPraMutationResult!
  sealAttestationCertificate(input: SealAttestationCertificateInput!): AgentPraMutationResult!
  invalidateProviderReceiptAttestation(
    input: InvalidateProviderReceiptAttestationInput!
  ): AgentPraMutationResult!
  prepareAttestationEffect(input: PrepareAttestationEffectInput!): AgentPraMutationResult!
  resolveAttestationUncertainty(
    input: ResolveAttestationUncertaintyInput!
  ): AgentPraMutationResult!
  closeProviderReceiptAttestationSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentPraMutationResult!
  approveProviderReceiptAttestationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentPraMutationResult!
  revokeProviderReceiptAttestationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentPraMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw tool payloads or redacted fact bodies.
- `sealAttestationCertificate` is rejected with `SILENCE_SUCCESS_DENIED`
  when a nominated silent or unknown receipt would evaluate to
  `ATTEST_SUCCESS`.
- `sealAttestationCertificate` is rejected with `HALT_ATTEST_DENIED` when a
  nominated halted, extended-halt, or omitted effect would evaluate to
  `ATTEST_SUCCESS`.
- `evaluateProviderReceiptAttestation` is rejected with
  `PURPOSE_AMPLIFICATION_DENIED` when the requested purpose would amplify an
  effect attenuation hash.
- Compensation that would restore a halted body or invent a winner is
  rejected with `COMPENSATION_LEAK_DENIED`.

## 10. Procedural memory

Approved attestation profiles are procedural memory: versioned instructions
for how sealed saga `UNKNOWN_EFFECT` mutate and compensate intents become
envelope-scoped receipt bindings without inventing a winner and without
treating silence as success. Procedure refs may point to receipt-playbook
steps. Profiles are immutable after approval; agents perceive
`procedureTags` and `allowedNextActions` on perception cards, never
inventing attestation policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which attestation profile
fits incident hop-attenuated saga compensation?"). Embeddings are account-
owned and must be queried with `account_id` equality. The reference schema
stores vectors but does **not** create a cross-tenant HNSW index; production
builds account-partitioned HNSW segments.

Semantic retrieval may return attestation profiles only. It never authorizes
nominate, evaluate, seal, or attest. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_pra_profile_embedding (
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
    REFERENCES agent_pra_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed/success/
failure/compensate/unknown/skipped/invalidated binding counts, uncertain
notify intents, remaining budgets, procedure tags, allowed next actions, and
blocked reasons. Summary text is `UntrustedText`. Cards never embed raw tool
payloads or redacted fact bodies. `cardHash` makes perception replayable.
Agents perceive `ATTEST_SUCCESS` as a trusted receipt that still cannot
invent a winner, `ATTEST_FAILURE` as a trusted negative receipt,
`ATTEST_COMPENSATE` as an honest rollback plan that cannot restore a halted
body, `ATTEST_UNKNOWN` as unresolved provider silence, and `SKIP` as a
sealed refusal — never as a receipt that "must have succeeded."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, attestation-
certificate seals, and audit appends are ACID transactions in the hybrid
row store.

### Columnar store

Columnar projections may accelerate analytics over sealed attestation
certificates but are not authoritative for success, failure, or compensate
outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Notify dispatch and compensation side-effects are not silently ACID-coupled;
silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on holds per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/ATTEST.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped saga-ledger, working-set, grant-graph, citation,
  or board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board mutations from
  halted slots or unsigned receipts.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding attestable effects by scanning the saga or working-set ledger
  (rejected; nominate by `(account_id, source_effect_id)`).
- Evaluating an attestation by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  effect-keyed active binding indexes).

### Required access paths

- Effect nomination: PK `(account_id, source_effect_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/effect: composite indexes leading with `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/saga-ledger/citation scan is **FULL SCAN
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
- Sticky first-ACK success after supersession: invalidation + re-evaluate +
  notify uncertainty + profile revocation.
- Silence invented as success: silence-success fence.
- Halt leak of frozen bodies into attested success: halt-attest fence.
- Compensation that restores a halted body or invents a winner:
  compensation-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot success: certificates bind effect
  and receipt sets, never `resolved_fact_hash`.
- Silent notify or compensation success: `UNKNOWN_EFFECT` until ACK.
- Recursive saga-ledger or board storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- Silence-success rejection, halt-attest rejection, purpose-amplification
  rejection, compensation-leak rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow attestation

Compile profiles and validate effect nomination without durable
certificates.

### Phase 2: failure and skip only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT`
effects as `ATTEST_FAILURE` or `SKIP`. Success stays closed.

### Phase 3: trusted success and halt-attest fences

Enable budgeted `ATTEST_SUCCESS` from `RESTORED_WITHOUT_WINNER` effects
with `TRUSTED_SUCCESS` receipts only.

### Phase 4: notify uncertainty

Enable attestation notify intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`ATTEST_COMPENSATE` that cannot restore a halted body or invent a winner.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, silence-success,
  purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed saga-effect point lookup and hash match.
- Evaluate binds effect set and attenuation under budget.
- Seal is rejected when silence would become success, and never invents a
  winning fact hash.
- Attestation-certificate seal binds immutable bindings under effect-set,
  receipt-set, compensation-set, and attenuation hashes — never a winner
  hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed attestation certificates after process
  restart.

## 21. Product decision

Adopt the Provider-Receipt Attestation Plane as the deterministic binding
path for trusted tool receipts against sealed saga `UNKNOWN_EFFECT`
intents produced by the Envelope Tool-Effect Saga plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the receipt-
   honesty gap after saga dispatch without sticky first-ACK success, halt
   leak, purpose amplification, invented winners, or saga-ledger scans.
2. Account-leading indexes, silence-success and purpose-amplification
   fences, and **FULL SCAN REJECTED** planner rules protect 99.99% neighbor
   latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile
   discovery, perception cards, and hash-chained audit replay make the
   plane agent-ready without putting probabilistic AI inside the data
   engine.
