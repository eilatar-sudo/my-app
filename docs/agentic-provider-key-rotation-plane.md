# mondayDB Agentic Provider-Key Rotation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-19.v1`

## 1. Why this plane, before how

A sealed provider-receipt attestation certificate can bind gated saga
`UNKNOWN_EFFECT` mutate and compensate intents to trusted tool receipts.
It does not decide **how a receipt-signing key is retired, a successor is
enrolled, or a grace overlap is bounded** without scanning every attested
receipt, rewriting historical silence into success, or inventing a winner
from a compromised key.

Without a provider-key rotation plane, operators and agents either:

- scan every attested receipt looking for "which keys we can still trust"
  (neighbor-harmful on boards with 1M+ rows), or
- treat rotation as implicit success of previously silent receipts, so a
  retired key keeps signing `TRUSTED_SUCCESS`, a halt-scoped compensation
  is "unlocked" by a successor, hop-attenuated purpose is amplified back to
  the donor, and historical `UNKNOWN_EFFECT` is rewritten as `ACKED`.

The product trade-off is **rotation fluency versus rotation isolation**:

- Accepting every provider key-rollover immediately maximizes agent fluency
  and reduces re-planning cost, but creates history-rewrite invention,
  retired-key signature leak, unauditable successor storms, and recursive
  key-catalog walks against neighbors.
- Binding a sealed rotation certificate under an approved rotation profile,
  signing-key point lookups, history-rewrite fences, retired-key-sign
  fences, halt-rotate fences, purpose-amplification fences, successor-leak
  fences, and steward budgets adds one bounded evaluate transaction and
  short-lived rotation storage.
- Semantic similarity may discover rotation profiles, but it must never
  decide whether a signing key may be nominated, a rotation evaluated, a
  certificate sealed, or a successor dispatched.

The recommended model keeps the data plane deterministic:

1. An approved rotation profile defines allowed key kinds, rotation policy,
   and notify policy. Evaluation **never** invents a winning fact hash and
   **never** rewrites a historical attestation kind.
2. A rotation session opens under purpose, budget, and authorization
   fences, and only nominates sealed attestation signing keys by point
   lookup from the Provider-Receipt Attestation plane.
3. mondayDB evaluates a rotation whose kind is a pure function of
   `(source_key_kind, placement_kind, key_lifecycle, receipt_kind,
   requested_purpose_hash, attenuation_hash, hop_count, provider_key_hash)`.
   Silence cannot become historical success. Retired keys cannot sign new
   success. Halted slots cannot become rotate-success.
4. Sealing a rotation certificate binds
   `consumer_ref + purpose_hash + key_set_hash + successor_set_hash +
   retirement_set_hash + attenuation_hash`. The certificate **must not**
   emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. Successor enrollment never claims
   success from silence or from a retired predecessor.
6. Unscoped attestation-ledger, key-catalog, working-set, grant-graph, or
   board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"re-sign every historical receipt forever" or "enroll every successor until
silence looks like success" loops are rejectable before they scan boards
with 1M+ rows. Perception is restored by sealed rotation certificates, not
by magic key orchestration inside the engine.

### Product outcome

For any provider-key rotation evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or notify dispatch?
- Which nominated signing keys, placement kinds, hop counts, attenuation
  hashes, receipt kinds, and rotation kinds were bound?
- Is the rotation certificate still current, invalidated, or awaiting
  notify acknowledgement?
- Did async notify or successor enrollment become `UNKNOWN_EFFECT`?
- Can the rotation history be replayed without invoking an LLM?

## 2. Scope and ownership

The Provider-Key Rotation Plane owns:

1. Immutable approved rotation profiles as procedural memory of "how a
   trusted receipt-signing key is retired and a successor enrolled without
   amplifying purpose, leaking halted facts, rewriting attested history, or
   inventing success from a retired key."
2. Tenant-scoped rotation sessions with purpose and budget fences.
3. Deterministic nomination of sealed attestation signing keys by point
   lookup — never attestation-ledger, working-set, or board scans.
4. Deterministic evaluation receipts, sealed rotation certificates, and
   immutable rotation bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded rotation budgets.

It integrates with, but does not replace:

- **Provider-Receipt Attestation:** supplies sealed signing-key IDs,
  receipt kinds, placement kinds, attenuation hashes, and invalidation
  events.
- **Envelope Tool-Effect Saga / Envelope Purpose Gate / Certificate
  Placement:** upstream hop-attenuated context that produced the attested
  receipts those keys signed.
- **Executive Freeze / Thaw SLA:** halt/restore context that still forbids
  rotate-success against a halted body.
- **Emergency Containment:** the coarse stop/drain/quarantine path used when
  a contained key evaluates to `SKIP` or `ROTATE_FAILURE`; this plane is
  purpose-scoped key lifecycle, not workspace-wide containment.
- **Workload Identity Attestation:** the non-human principal that presents
  the key; this plane rotates the signing material, not the principal.
- **Decision Memory:** may consume sealed rotation certificates as reuse
  evidence, not raw provider key-rollover webhooks.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and rotate units.

### Non-goals

- Letting an LLM decide that a silent key-rollover "feels successful enough."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative rotation certificates from columnar or
  vector projections.
- Cross-account key rotation or global nearest-neighbor authorization.
- Storing raw private keys, unrestricted tool payloads, or redacted
  plaintext.
- Claiming distributed atomicity with external key-distribution providers.
- Inventing a winning fact hash when a successor key arrives after a
  restored slot.
- Rewriting historical `SILENCE` or `UNKNOWN_EFFECT` receipts as
  `TRUSTED_SUCCESS` because a new key exists.
- Unbounded recursive attestation-ledger or board walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Rotation profile contract

A profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_ATTESTATION_SIGNING_KEY`,
  `SUPERSEDED_KEY`, `COMPROMISED_KEY`);
- evaluate threshold (distinct human or attested principals), max bindings
  per certificate, and max nominated keys;
- rotation policy (`HISTORY_NEVER_REWRITTEN`, `RETIRED_KEY_NEVER_SIGNS`,
  `HALT_DENIES_ROTATE_SUCCESS`, `PURPOSE_NARROW_ONLY`,
  `SUCCESSOR_NEVER_RESTORES_WINNER`, `GRACE_SILENCE_NEVER_SUCCESS`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed rotation kinds (`RETIRE`, `ENROLL_SUCCESSOR`, `GRACE_OVERLAP`,
  `ROTATE_SUCCESS`, `ROTATE_FAILURE`, `SKIP`) and notify policy after
  seal, invalidation, or upstream key change;
- optional procedural refs for "how to present unknown, retired, or
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

Nominating a sealed signing key returns a nomination receipt. Evaluating a
rotation binds each nominated key to a rotation kind that is compatible with
the receipt kind, placement kind, key lifecycle, and purpose relation.
Sealing a certificate binds
`consumer_ref + purpose_hash + key_set_hash + successor_set_hash +
retirement_set_hash + attenuation_hash`. Certificates **must not** emit a
`resolved_fact_hash` winner. Bindings compiled from silence or unknown
receipts are rejected when the requested rotation kind is
`ROTATE_SUCCESS` (history-rewrite fence). Bindings compiled from
`RETIRED` or `COMPROMISED` keys are rejected when the requested rotation
kind is `ROTATE_SUCCESS` (retired-key-sign fence). Bindings compiled from
halted, extended-halt, or omitted keys are rejected when the requested
rotation kind is `ROTATE_SUCCESS` (halt-rotate fence). Bindings that
would amplify purpose relative to the key attenuation hash are rejected
(purpose-amplification fence). Successor bindings that would emit a
winner or restore a halted body are rejected (successor-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream attestation, placement, or
visibility revocation. Notify intents start as `PREPARED`, may become
`UNKNOWN_EFFECT` when the key-distribution provider does not acknowledge,
and never invent success from silence. Enrollment of `UNKNOWN_EFFECT`
remains `UNKNOWN_EFFECT` until a trusted successor receipt arrives.

### 3.5 Availability contract

Rotation control-plane APIs target 99.99% availability for open, nominate,
evaluate, seal, and perception reads. External notify and successor
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Rotation evaluation must not silently restore neighbor-impacting
board mutations from halted slots, retired keys, or unsigned receipts.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and rotation rules are immutable.
4. Binding identity
   (`source_key_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `provider_key_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Key nomination uses point lookup by
   `(account_id, source_key_id)` — never full attestation-ledger or board
   scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/rotate.
10. Silence and unknown receipts cannot evaluate to `ROTATE_SUCCESS`
    (history-rewrite fence).
11. Halted, extended-halt, and omitted keys cannot evaluate to
    `ROTATE_SUCCESS` (halt-rotate fence).
12. Requested purposes that amplify a key attenuation hash are rejected
    (purpose-amplification fence).
13. Successor enrollment cannot emit a winning fact hash or restore a
    halted body (successor-leak fence).
14. Retired or compromised keys cannot evaluate to `ROTATE_SUCCESS`
    (retired-key-sign fence).
15. Rotation certificates bind key set, successor set, retirement set,
    and attenuation hashes; they never invent a winning fact hash.
16. Plans that require unscoped board, session, working-set, grant-graph,
    attestation-ledger, or citation-ledger scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate rotation rules. Approval validates definition
hash, requires at least one rotation rule, and fences the status
transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Nominate and evaluate

Nominate looks up a sealed signing key by primary key, verifies observation
kind and purpose attenuation, and emits a nomination receipt. Evaluate binds
compatible rotation kinds under CAS and evaluate budgets.

### 5.4 Seal rotation certificate

Seal materializes immutable bindings from the evaluation receipt. The seal
**does not** choose a winner among disputed fact hashes, **does not**
restore halted bodies into rotate-success context, and **does not** rewrite
historical silence as success.

### 5.5 Invalidate and dispatch

Invalidation marks certificates stale when upstream keys revoke, release,
or supersede. Optional notify intents dispatch to key-distribution
providers; unresolved external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and rotation rules. No session may open.

### 6.2 Session open

An authorized principal opens a session against an `APPROVED` profile.
Budgets and purpose hashes are captured.

### 6.3 Nominating / evaluating

Signing keys are nominated by point lookup and an evaluation receipt is
emitted. Evaluate work consumes budget against that session's primary key.

### 6.4 Sealed / invalidated

Seal materializes an immutable rotation certificate. Upstream change may
invalidate. Notify dispatch may enter `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`. Terminal records
are append-only.

### 6.6 Retain

Audit events, certificates, evaluation receipts, and terminal records retain
per account retention policy for replay. Vector profile embeddings follow the
same account-scoped watermark as the approved definition hash.

## 7. TypeScript contracts

These interfaces are the service boundary for provider-key rotation
and attestation-bound signing-key lifecycle. IDs are opaque; resolvers
validate formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type SourceKeyId = string;
type EvaluationId = string;
type CertificateId = string;
type BindingId = string;
type Sha256 = string;
type Timestamp = string;
type ConsumerRef = string;

type TrustedNextAction =
  | "NOMINATE_SIGNING_KEY"
  | "EVALUATE_PROVIDER_KEY_ROTATION"
  | "SEAL_ROTATION_CERTIFICATE"
  | "INVALIDATE_PROVIDER_KEY_ROTATION"
  | "PREPARE_ROTATION_EFFECT"
  | "RESOLVE_ROTATION_UNCERTAINTY"
  | "CLOSE_SESSION";

type ProviderKeyRotationBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "KEY_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "RETIRED_KEY_SIGN_DENIED"
  | "HALT_ROTATE_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
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

type SourceKeyKind =
  | "SEALED_ATTESTATION_SIGNING_KEY"
  | "SUPERSEDED_KEY"
  | "COMPROMISED_KEY";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type KeyLifecycle =
  | "ACTIVE"
  | "GRACE_OVERLAP"
  | "RETIRED"
  | "COMPROMISED"
  | "UNKNOWN_EFFECT";

type ReceiptKind =
  | "TRUSTED_RETIRE"
  | "TRUSTED_ENROLL"
  | "TRUSTED_SUCCESS"
  | "TRUSTED_FAILURE"
  | "SILENCE"
  | "UNKNOWN_EFFECT";

type RotationKind =
  | "RETIRE"
  | "ENROLL_SUCCESSOR"
  | "GRACE_OVERLAP"
  | "ROTATE_SUCCESS"
  | "ROTATE_FAILURE"
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

interface ProviderKeyRotationBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly rotateUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedKeys: number;
}

interface ProviderKeyRotationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedKeys: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ProviderKeyRotationSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ProviderKeyRotationBudget;
  readonly consumed: Omit<
    ProviderKeyRotationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedKeys"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface KeyNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceKeyId: SourceKeyId;
  readonly sourceKeyKind: SourceKeyKind;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface ProviderKeyRotationEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly keySetHash: Sha256;
  readonly successorSetHash: Sha256;
  readonly retirementSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface ProviderKeyRotationBinding {
  readonly accountId: AccountId;
  readonly bindingId: BindingId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceKeyId: SourceKeyId;
  readonly sourceKeyKind: SourceKeyKind;
  readonly bindingOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly receiptKind: ReceiptKind;
  readonly rotationKind: RotationKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly providerKeyHash: Sha256;
  readonly successorKeyHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface ProviderKeyRotationCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly keySetHash: Sha256;
  readonly successorSetHash: Sha256;
  readonly retirementSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ProviderKeyRotationEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentProviderKeyRotationPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly retireBindingCount: number;
  readonly enrollBindingCount: number;
  readonly graceBindingCount: number;
  readonly successBindingCount: number;
  readonly failureBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly ProviderKeyRotationEffectObservation[];
  readonly remainingBudget: Omit<
    ProviderKeyRotationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedKeys"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ProviderKeyRotationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateProviderKeyRotationSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ProviderKeyRotationBudget;
}

interface NominateSigningKeyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceKeyId: SourceKeyId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateProviderKeyRotationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedKeySetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealRotationCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedSuccessorSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateProviderKeyRotationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceKeyId: SourceKeyId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareRotationEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveRotationUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_SUCCESSOR"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseProviderKeyRotationSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ProviderKeyRotationDecision =
  | { readonly decision: "ALLOWED"; readonly session: ProviderKeyRotationSession;
      readonly certificate?: ProviderKeyRotationCertificate;
      readonly member?: ProviderKeyRotationBinding;
      readonly receipt?: KeyNominationReceipt;
      readonly evaluation?: ProviderKeyRotationEvaluationReceipt;
      readonly perception: AgentProviderKeyRotationPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ProviderKeyRotationBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentProviderKeyRotationPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE pkr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE pkr_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_source_kind AS ENUM (
  'SEALED_ATTESTATION_SIGNING_KEY', 'SUPERSEDED_KEY', 'COMPROMISED_KEY'
);
CREATE TYPE pkr_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_key_lifecycle AS ENUM (
  'ACTIVE', 'GRACE_OVERLAP', 'RETIRED', 'COMPROMISED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_receipt_kind AS ENUM (
  'TRUSTED_RETIRE', 'TRUSTED_ENROLL', 'TRUSTED_SUCCESS', 'TRUSTED_FAILURE',
  'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_rotation_kind AS ENUM (
  'RETIRE', 'ENROLL_SUCCESSOR', 'GRACE_OVERLAP', 'ROTATE_SUCCESS',
  'ROTATE_FAILURE', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE pkr_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_pkr_profile_authority NOLOGIN;

CREATE TABLE agent_pkr_authorization_evidence (
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

CREATE TABLE agent_pkr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status pkr_profile_status NOT NULL,
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
  max_nominated_keys SMALLINT NOT NULL
    CHECK (max_nominated_keys BETWEEN 1 AND 256),
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
    REFERENCES agent_pkr_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_pkr_profile_rotation_rule (
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
  rotation_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_pkr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_pkr_key_catalog (
  account_id BIGINT NOT NULL,
  source_key_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  key_ref TEXT NOT NULL,
  source_key_kind pkr_source_kind NOT NULL,
  placement_kind pkr_placement_kind NOT NULL,
  key_lifecycle pkr_key_lifecycle NOT NULL,
  status pkr_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  key_sealed_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_key_id),
  UNIQUE (account_id, key_ref, source_key_kind)
);

CREATE TABLE agent_pkr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status pkr_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_rotate_units BIGINT NOT NULL CHECK (budget_rotate_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_rotate_units BIGINT NOT NULL CHECK (consumed_rotate_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_keys SMALLINT NOT NULL
    CHECK (max_nominated_keys BETWEEN 1 AND 256),
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
    REFERENCES agent_pkr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_pkr_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_rotate_units <= budget_rotate_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_pkr_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  source_key_kind pkr_source_kind NOT NULL,
  placement_kind pkr_placement_kind NOT NULL,
  key_lifecycle pkr_key_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_key_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pkr_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_pkr_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_pkr_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  key_set_hash CHAR(64) NOT NULL CHECK (length(key_set_hash) = 64),
  successor_set_hash CHAR(64) NOT NULL CHECK (length(successor_set_hash) = 64),
  retirement_set_hash CHAR(64) NOT NULL
    CHECK (length(retirement_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pkr_session (account_id, session_id)
);

CREATE TABLE agent_pkr_rotation_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  key_set_hash CHAR(64) NOT NULL CHECK (length(key_set_hash) = 64),
  successor_set_hash CHAR(64) NOT NULL CHECK (length(successor_set_hash) = 64),
  retirement_set_hash CHAR(64) NOT NULL
    CHECK (length(retirement_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  binding_watermark SMALLINT NOT NULL CHECK (binding_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pkr_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_pkr_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_pkr_rotation_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  source_key_kind pkr_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status pkr_binding_status NOT NULL,
  placement_kind pkr_placement_kind NOT NULL,
  key_lifecycle pkr_key_lifecycle NOT NULL,
  receipt_kind pkr_receipt_kind NOT NULL,
  rotation_kind pkr_rotation_kind NOT NULL,
  purpose_relation pkr_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  provider_key_hash CHAR(64) NOT NULL
    CHECK (length(provider_key_hash) = 64),
  successor_key_hash CHAR(64) NOT NULL
    CHECK (length(successor_key_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_key_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_pkr_rotation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pkr_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_pkr_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_pkr_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'KEY_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_pkr_rotation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_pkr_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_pkr_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status pkr_effect_status NOT NULL,
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
    REFERENCES agent_pkr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_pkr_rotation_certificate (account_id, certificate_id)
);

CREATE TABLE agent_pkr_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'ROTATE'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pkr_session (account_id, session_id)
);

CREATE TABLE agent_pkr_terminal_record (
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
    REFERENCES agent_pkr_session (account_id, session_id)
);

CREATE TABLE agent_pkr_command_result (
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

CREATE TABLE agent_pkr_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_pkr_audit_event (
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

CREATE TABLE agent_pkr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_pkr_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status pkr_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_pkr_session (account_id, session_id)
);

CREATE TABLE agent_pkr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_pkr_profile()
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
       OR NEW.max_nominated_keys
         IS DISTINCT FROM OLD.max_nominated_keys
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
    IF current_setting('app.pkr_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.pkr_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_pkr_profile_protect
BEFORE INSERT OR UPDATE ON agent_pkr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_pkr_profile();

CREATE FUNCTION protect_agent_pkr_profile_rotation_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status pkr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_pkr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile rotation rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_pkr_profile_rotation_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_pkr_profile_rotation_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_pkr_profile_rotation_rule();

CREATE FUNCTION protect_agent_pkr_rotation_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_key_id IS DISTINCT FROM OLD.source_key_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.binding_ordinal IS DISTINCT FROM OLD.binding_ordinal
       OR NEW.source_key_kind IS DISTINCT FROM OLD.source_key_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.key_lifecycle IS DISTINCT FROM OLD.key_lifecycle
       OR NEW.receipt_kind IS DISTINCT FROM OLD.receipt_kind
       OR NEW.rotation_kind IS DISTINCT FROM OLD.rotation_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.provider_key_hash IS DISTINCT FROM OLD.provider_key_hash
       OR NEW.successor_key_hash IS DISTINCT FROM OLD.successor_key_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'rotation binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.rotation_kind = 'ROTATE_SUCCESS'
     AND NEW.receipt_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks success from silent or unknown receipt';
  END IF;

  IF NEW.rotation_kind = 'ROTATE_SUCCESS'
     AND NEW.key_lifecycle IN ('RETIRED', 'COMPROMISED') THEN
    RAISE EXCEPTION 'retired-key-sign fence blocks success from a retired or compromised key';
  END IF;

  IF NEW.rotation_kind = 'ROTATE_SUCCESS'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-rotate fence blocks success on halted key';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than key attenuation';
  END IF;

  IF NEW.rotation_kind = 'ENROLL_SUCCESSOR'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.rotation_kind = 'ROTATE_SUCCESS'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose success after attenuation hops';
  END IF;

  IF NEW.rotation_kind = 'ROTATE_SUCCESS'
     AND NEW.receipt_kind IS DISTINCT FROM 'TRUSTED_SUCCESS' THEN
    RAISE EXCEPTION 'unsigned-receipt fence blocks rotate-success without trusted success receipt';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_pkr_rotation_binding_protect
BEFORE INSERT OR UPDATE ON agent_pkr_rotation_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_pkr_rotation_binding();

CREATE FUNCTION protect_agent_pkr_effect_intent()
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

CREATE TRIGGER agent_pkr_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_pkr_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_pkr_effect_intent();

CREATE FUNCTION approve_agent_pkr_profile(
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
  stored_status pkr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_pkr_profile
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
  FROM agent_pkr_profile_rotation_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one rotation rule';
  END IF;

  PERFORM set_config(
    'app.pkr_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_pkr_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_pkr_profile(
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
  stored_status pkr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_pkr_profile
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
    'app.pkr_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_pkr_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_pkr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_pkr_profile_authority;
ALTER FUNCTION revoke_agent_pkr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_pkr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_pkr_profile_authority;
GRANT SELECT ON
  agent_pkr_profile,
  agent_pkr_profile_rotation_rule
TO agent_pkr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_pkr_profile TO agent_pkr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_pkr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_pkr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_pkr_profile FROM PUBLIC;

CREATE INDEX agent_pkr_session_work_idx ON agent_pkr_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_pkr_session_profile_idx ON agent_pkr_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_pkr_binding_certificate_idx ON agent_pkr_rotation_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_pkr_binding_key_idx ON agent_pkr_rotation_binding (
  account_id, source_key_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_pkr_catalog_ref_idx ON agent_pkr_key_catalog (
  account_id, key_ref, sealed_at DESC, source_key_id
);
CREATE INDEX agent_pkr_catalog_kind_idx ON agent_pkr_key_catalog (
  account_id, source_key_kind, sealed_at DESC, source_key_id
);
CREATE INDEX agent_pkr_evaluation_session_idx ON agent_pkr_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_pkr_certificate_session_idx ON agent_pkr_rotation_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_pkr_effect_work_idx ON agent_pkr_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_pkr_audit_time_idx ON agent_pkr_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_pkr_perception_status_idx ON agent_pkr_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_pkr_command_expiry_idx ON agent_pkr_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_pkr_invalidation_certificate_idx ON agent_pkr_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_pkr_authorization_evidence',
    'agent_pkr_profile',
    'agent_pkr_profile_rotation_rule',
    'agent_pkr_key_catalog',
    'agent_pkr_session',
    'agent_pkr_nomination_receipt',
    'agent_pkr_evaluation_receipt',
    'agent_pkr_rotation_certificate',
    'agent_pkr_rotation_binding',
    'agent_pkr_invalidation',
    'agent_pkr_effect_intent',
    'agent_pkr_budget_ledger',
    'agent_pkr_terminal_record',
    'agent_pkr_command_result',
    'agent_pkr_audit_head',
    'agent_pkr_audit_event',
    'agent_pkr_audit_anchor',
    'agent_pkr_perception_snapshot',
    'agent_pkr_projection_checkpoint'
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
single ACID row-store transaction with session CAS. Rotation-certificate
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

enum AgentPkrSessionStatus {
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

enum AgentPkrBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentPkrSourceKind {
  SEALED_ATTESTATION_SIGNING_KEY
  SUPERSEDED_KEY
  COMPROMISED_KEY
}

enum AgentPkrPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentPkrKeyLifecycle {
  ACTIVE
  GRACE_OVERLAP
  RETIRED
  COMPROMISED
  UNKNOWN_EFFECT
}

enum AgentPkrReceiptKind {
  TRUSTED_RETIRE
  TRUSTED_ENROLL
  TRUSTED_SUCCESS
  TRUSTED_FAILURE
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentPkrRotationKind {
  RETIRE
  ENROLL_SUCCESSOR
  GRACE_OVERLAP
  ROTATE_SUCCESS
  ROTATE_FAILURE
  SKIP
  UNKNOWN_EFFECT
}

enum AgentPkrPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentPkrEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentPkrNextAction {
  NOMINATE_SIGNING_KEY
  EVALUATE_PROVIDER_KEY_ROTATION
  SEAL_ROTATION_CERTIFICATE
  INVALIDATE_PROVIDER_KEY_ROTATION
  PREPARE_ROTATION_EFFECT
  RESOLVE_ROTATION_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentPkrBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  KEY_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  RETIRED_KEY_SIGN_DENIED
  HALT_ROTATE_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
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

enum AgentPkrUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_SUCCESSOR
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentPkrInvalidationReason {
  SUPERSEDED
  RETRACTED
  QUARANTINED
  KEY_REVOKED
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentPkrBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  rotateUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
}

type AgentPkrProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentPkrSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentPkrSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentPkrBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentPkrNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  sourceKeyKind: AgentPkrSourceKind!
  placementKind: AgentPkrPlacementKind!
  keyLifecycle: AgentPkrKeyLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentPkrEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  keySetHash: SHA256!
  successorSetHash: SHA256!
  retirementSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentPkrCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  keySetHash: SHA256!
  successorSetHash: SHA256!
  retirementSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentPkrBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  sourceKeyKind: AgentPkrSourceKind!
  bindingOrdinal: Int!
  status: AgentPkrBindingStatus!
  placementKind: AgentPkrPlacementKind!
  keyLifecycle: AgentPkrKeyLifecycle!
  receiptKind: AgentPkrReceiptKind!
  rotationKind: AgentPkrRotationKind!
  purposeRelation: AgentPkrPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  providerKeyHash: SHA256!
  successorKeyHash: SHA256!
  sealedAt: DateTime!
}

type AgentPkrEffectObservation {
  effectId: ID!
  status: AgentPkrEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentPkrPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentPkrSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  retireBindingCount: Int!
  enrollBindingCount: Int!
  graceBindingCount: Int!
  successBindingCount: Int!
  failureBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentPkrEffectObservation!]!
  remainingBudget: AgentPkrBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentPkrNextAction!]!
  blockedReasons: [AgentPkrBlockedReason!]!
  cardHash: SHA256!
}

type AgentPkrMutationResult {
  decision: String!
  session: AgentPkrSession
  certificate: AgentPkrCertificate
  member: AgentPkrBinding
  receipt: AgentPkrNominationReceipt
  evaluation: AgentPkrEvaluationReceipt
  perception: AgentPkrPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentPkrBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  rotateUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
}

input CreateProviderKeyRotationSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentPkrBudgetInput!
}

input NominateSigningKeyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceKeyId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluateProviderKeyRotationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedKeySetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealRotationCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedSuccessorSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateProviderKeyRotationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceKeyId: ID!
  reasonCode: AgentPkrInvalidationReason!
  idempotencyKey: String!
}

input PrepareRotationEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveRotationUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentPkrUncertaintyResolution!
  idempotencyKey: String!
}

input AgentPkrProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentPkrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentPkrProfile
  agentPkrSession(accountId: ID!, sessionId: ID!): AgentPkrSession
  agentPkrRotationCertificate(accountId: ID!, certificateId: ID!): AgentPkrCertificate
  agentPkrPerceptionCard(accountId: ID!, sessionId: ID!): AgentPkrPerceptionCard
  agentPkrNominatedKey(
    accountId: ID!
    sessionId: ID!
    sourceKeyId: ID!
  ): AgentPkrNominationReceipt
  agentPkrSearchProfiles(input: AgentPkrProfileSearchInput!): [AgentPkrProfile!]!
}

type Mutation {
  createProviderKeyRotationSession(
    input: CreateProviderKeyRotationSessionInput!
  ): AgentPkrMutationResult!
  nominateSigningKey(input: NominateSigningKeyInput!): AgentPkrMutationResult!
  evaluateProviderKeyRotation(
    input: EvaluateProviderKeyRotationInput!
  ): AgentPkrMutationResult!
  sealRotationCertificate(input: SealRotationCertificateInput!): AgentPkrMutationResult!
  invalidateProviderKeyRotation(
    input: InvalidateProviderKeyRotationInput!
  ): AgentPkrMutationResult!
  prepareRotationEffect(input: PrepareRotationEffectInput!): AgentPkrMutationResult!
  resolveRotationUncertainty(
    input: ResolveRotationUncertaintyInput!
  ): AgentPkrMutationResult!
  closeProviderKeyRotationSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentPkrMutationResult!
  approveProviderKeyRotationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentPkrMutationResult!
  revokeProviderKeyRotationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentPkrMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealRotationCertificate` is rejected with `HISTORY_REWRITE_DENIED`
  when a nominated silent or unknown receipt would evaluate to
  `ROTATE_SUCCESS`.
- `sealRotationCertificate` is rejected with `RETIRED_KEY_SIGN_DENIED`
  when a nominated `RETIRED` or `COMPROMISED` key would evaluate to
  `ROTATE_SUCCESS`.
- `sealRotationCertificate` is rejected with `HALT_ROTATE_DENIED` when a
  nominated halted, extended-halt, or omitted key would evaluate to
  `ROTATE_SUCCESS`.
- `evaluateProviderKeyRotation` is rejected with
  `PURPOSE_AMPLIFICATION_DENIED` when the requested purpose would amplify a
  key attenuation hash.
- Successor enrollment that would restore a halted body or invent a winner
  is rejected with `SUCCESSOR_LEAK_DENIED`.

## 10. Procedural memory

Approved rotation profiles are procedural memory: versioned instructions
for how sealed attestation signing keys become envelope-scoped retirement
and successor bindings without inventing a winner and without rewriting
historical silence as success. Procedure refs may point to key-rollover
playbook steps. Profiles are immutable after approval; agents perceive
`procedureTags` and `allowedNextActions` on perception cards, never
inventing rotation policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which rotation profile
fits incident hop-attenuated attestation key retirement?"). Embeddings are
account-owned and must be queried with `account_id` equality. The reference
schema stores vectors but does **not** create a cross-tenant HNSW index;
production builds account-partitioned HNSW segments.

Semantic retrieval may return rotation profiles only. It never authorizes
nominate, evaluate, seal, or rotate. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_pkr_profile_embedding (
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
    REFERENCES agent_pkr_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed/retire/
enroll/grace/success/failure/unknown/skipped/invalidated binding counts,
uncertain notify intents, remaining budgets, procedure tags, allowed next
actions, and blocked reasons. Summary text is `UntrustedText`. Cards never
embed raw private keys or redacted fact bodies. `cardHash` makes perception
replayable. Agents perceive `RETIRE` as a trusted retirement that still
cannot invent a winner, `ENROLL_SUCCESSOR` as a trusted successor plan that
cannot restore a halted body, `GRACE_OVERLAP` as a bounded dual-key window,
`ROTATE_SUCCESS` as a trusted successor that still cannot rewrite history,
`ROTATE_FAILURE` as a trusted negative receipt, and `SKIP` as a sealed
refusal — never as a key that "must have succeeded historically."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, rotation-certificate
seals, and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed rotation
certificates but are not authoritative for retire, enroll, or rotate-success
outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Notify dispatch and successor-enrollment side-effects are not silently
ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on holds per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/ROTATE.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped attestation-ledger, working-set, grant-graph,
  citation, or board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board mutations from
  halted slots, retired keys, or unsigned receipts.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding rotatable keys by scanning the attestation or working-set ledger
  (rejected; nominate by `(account_id, source_key_id)`).
- Evaluating a rotation by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  key-keyed active binding indexes).

### Required access paths

- Key nomination: PK `(account_id, source_key_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/key: composite indexes leading with `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/attestation-ledger/citation scan is **FULL
SCAN REJECTED** before execution.

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
- Historical silence invented as success: history-rewrite fence.
- Retired or compromised key continues to sign success: retired-key-sign
  fence.
- Halt leak of frozen bodies into rotate-success: halt-rotate fence.
- Successor that restores a halted body or invents a winner:
  successor-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot success: certificates bind key
  and retirement sets, never `resolved_fact_hash`.
- Silent notify or successor success: `UNKNOWN_EFFECT` until ACK.
- Recursive attestation-ledger or board storms: budget and **FULL SCAN
  REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- History-rewrite rejection, retired-key-sign rejection, halt-rotate
  rejection, purpose-amplification rejection, successor-leak rejection, and
  `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow rotation

Compile profiles and validate key nomination without durable certificates.

### Phase 2: failure and skip only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT`
keys as `ROTATE_FAILURE` or `SKIP`. Success and enroll stay closed.

### Phase 3: trusted retire and halt-rotate fences

Enable budgeted `RETIRE` from `RESTORED_WITHOUT_WINNER` keys with
`TRUSTED_RETIRE` receipts only.

### Phase 4: successor notify uncertainty

Enable rotation notify intents with `UNKNOWN_EFFECT` reconciliation and
`ENROLL_SUCCESSOR` that cannot restore a halted body.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`GRACE_OVERLAP` that cannot rewrite historical silence as success.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, history-rewrite,
  purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed signing-key point lookup and hash match.
- Evaluate binds key set and attenuation under budget.
- Seal is rejected when silence would become success, and never invents a
  winning fact hash.
- Rotation-certificate seal binds immutable bindings under key-set,
  successor-set, retirement-set, and attenuation hashes — never a winner
  hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed rotation certificates after process
  restart.

## 21. Product decision

Adopt the Provider-Key Rotation Plane as the deterministic lifecycle path
for retiring receipt-signing material bound by the Provider-Receipt
Attestation plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the key-
   lifecycle gap after receipt attestation without history rewrite, retired-
   key signature leak, halt leak, purpose amplification, invented winners,
   or attestation-ledger scans.
2. Account-leading indexes, history-rewrite and purpose-amplification
   fences, and **FULL SCAN REJECTED** planner rules protect 99.99% neighbor
   latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile
   discovery, perception cards, and hash-chained audit replay make the
   plane agent-ready without putting probabilistic AI inside the data
   engine.