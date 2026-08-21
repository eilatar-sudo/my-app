# mondayDB Agentic Watermark-Clock Attestation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-21.v1`

## 1. Why this plane, before how

A sealed key-compromise quarantine certificate can isolate receipts signed
after a retirement or compromise watermark. It does not decide **whether
that watermark's timestamp is itself attested** against a deterministic
provider clock — without scanning every historical clock sample, rewriting
silence into a trusted pre-watermark instant, or inventing a winner from a
regressed or backdated provider report.

Without a watermark-clock attestation plane, operators and agents either:

- scan every provider clock sample looking for "which watermark arrived
  before the first attested tick" (neighbor-harmful on boards with 1M+
  rows), or
- treat an unattested provider timestamp as engine truth, so a compromised
  or skewed clock authorizes `ATTEST_MONOTONIC`, a halt-scoped body is
  "unlocked" by a later clock-success, hop-attenuated purpose is amplified
  back to the donor, and historical `UNKNOWN_EFFECT` is rewritten as
  `ACKED`.

The product trade-off is **clock fluency versus clock isolation**:

- Accepting every provider-reported timestamp immediately maximizes agent
  fluency and reduces re-planning cost, but creates history-rewrite
  invention, clock-regression leak, invented-history leak, unauditable
  clock storms, and recursive clock-catalog walks against neighbors.
- Binding a sealed clock certificate under an approved clock profile,
  sample point lookups, history-rewrite fences, clock-regression fences,
  invented-history fences, halt-attest fences, purpose-amplification
  fences, successor-leak fences, and steward budgets adds one bounded
  evaluate transaction and short-lived clock storage.
- Semantic similarity may discover clock profiles, but it must never
  decide whether a sample may be nominated, a clock evaluated, a
  certificate sealed, or a notify dispatched.

The recommended model keeps the data plane deterministic:

1. An approved clock profile defines allowed sample kinds, skew policy, and
   notify policy. Evaluation **never** invents a winning fact hash and
   **never** rewrites a historical clock kind.
2. A clock session opens under purpose, budget, and authorization fences,
   and only nominates sealed clock samples or watermark claims by point
   lookup from the Key-Compromise Quarantine and Provider-Key Rotation
   planes.
3. mondayDB evaluates a clock whose kind is a pure function of
   `(source_clock_kind, placement_kind, clock_lifecycle,
   attested_clock_kind, requested_purpose_hash, attenuation_hash,
   hop_count, provider_reported_at, last_attested_sample_at,
   first_attested_sample_at, engine_observed_at, max_skew_ms)`. Silence
   cannot become historical success. Regressed clocks cannot remain
   trusted. Invented watermarks earlier than the first attested sample
   cannot become trusted. Halted slots cannot become clock-trusted.
4. Sealing a clock certificate binds
   `consumer_ref + purpose_hash + sample_set_hash + clock_set_hash +
   watermark_set_hash + attenuation_hash`. The certificate **must not**
   emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. Attestation of `UNKNOWN_EFFECT`
   remains uncertain until a trusted monotonic sample arrives.
6. Unscoped clock-catalog, quarantine-ledger, working-set, grant-graph, or
   board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"re-judge every historical clock forever" or "keep every backdated
watermark until silence looks like success" loops are rejectable before they
scan boards with 1M+ rows. Perception is restored by sealed clock
certificates, not by magic time orchestration inside the engine.

### Product outcome

For any watermark-clock attestation evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or notify dispatch?
- Which nominated samples, placement kinds, hop counts, attenuation
  hashes, attested clock kinds, and clock kinds were bound?
- Is the clock certificate still current, invalidated, or awaiting
  notify acknowledgement?
- Did async notify or provider clock sync become `UNKNOWN_EFFECT`?
- Can the clock history be replayed without invoking an LLM?

## 2. Scope and ownership

The Watermark-Clock Attestation Plane owns:

1. Immutable approved clock profiles as procedural memory of "how a
   retirement or compromise watermark is bound to a deterministic provider
   clock without amplifying purpose, leaking halted facts, rewriting
   attested history, or inventing success from silence or regression."
2. Tenant-scoped clock sessions with purpose and budget fences.
3. Deterministic nomination of sealed clock samples and watermark claims by
   point lookup — never clock-catalog, working-set, or board scans.
4. Deterministic evaluation receipts, sealed clock certificates, and
   immutable clock bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded clock budgets.

It integrates with, but does not replace:

- **Key-Compromise Quarantine:** consumes attested watermark hashes; this
  plane is the clock that those watermarks must bind to before quarantine
  evaluation treats them as trusted.
- **Provider-Key Rotation:** supplies sealed retirement watermarks and
  successor enrollment hashes that still require clock attestation.
- **Provider-Receipt Attestation:** supplies sealed receipt IDs whose
  signed-at timestamps are compared only after this plane attests the
  clock.
- **Envelope Tool-Effect Saga / Envelope Purpose Gate / Certificate
  Placement:** upstream hop-attenuated context that produced the receipts
  whose clocks are now under attestation review.
- **Executive Freeze / Thaw SLA:** halt/restore context that still forbids
  attest-monotonic against a halted body.
- **Emergency Containment:** the coarse stop/drain path used when a
  contained sample evaluates to `SKIP` or `REJECT_REGRESSION`; this plane
  is purpose-scoped clock isolation, not workspace-wide containment.
- **Decision Memory:** may consume sealed clock certificates as reuse
  evidence, not raw provider clock webhooks.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and clock units.

### Non-goals

- Letting an LLM decide that a silent or regressed sample "feels
  monotonic enough."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative clock certificates from columnar or
  vector projections.
- Cross-account clock attestation or global nearest-neighbor authorization.
- Storing raw private keys, unrestricted tool payloads, or redacted
  plaintext.
- Claiming distributed atomicity with external time-distribution providers.
- Inventing a winning fact hash when a successor clock arrives after a
  restored slot.
- Rewriting historical `SILENCE` or `UNKNOWN_EFFECT` samples as
  `ATTEST_MONOTONIC` because a new clock exists.
- Rewriting a later trusted sample as invented history solely because a
  later watermark claim exists (that is an explicit supersession, not this
  plane).
- Unbounded recursive clock-catalog or board walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Clock profile contract

A profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_QUARANTINE_WATERMARK`,
  `PROVIDER_CLOCK_SAMPLE`, `RETIREMENT_WATERMARK_CLAIM`,
  `COMPROMISE_WATERMARK_CLAIM`);
- evaluate threshold (distinct human or attested principals), max bindings
  per certificate, and max nominated samples;
- clock policy (`HISTORY_NEVER_REWRITTEN`,
  `CLOCK_NEVER_REGRESSES`, `WATERMARK_NEVER_PREDATES_FIRST_SAMPLE`,
  `HALT_DENIES_ATTEST_MONOTONIC`,
  `PURPOSE_NARROW_ONLY`, `SUCCESSOR_NEVER_RESTORES_WINNER`,
  `GRACE_SILENCE_NEVER_SUCCESS`, `SKEW_BOUND_NEVER_TRUSTED_BEYOND`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed clock kinds (`ATTEST_MONOTONIC`, `HOLD_UNKNOWN`,
  `REJECT_REGRESSION`, `REJECT_INVENTED_HISTORY`, `SKIP`) and notify policy
  after seal, invalidation, or upstream clock change;
- optional procedural refs for "how to present unknown, regressed, or
  invented-history truth without a winner."

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

Nominating a sealed sample returns a nomination receipt. Evaluating a
clock binds each nominated sample to a clock kind that is
compatible with the attested clock kind, placement kind, clock
lifecycle, skew bound, and purpose relation. Sealing a certificate binds
`consumer_ref + purpose_hash + sample_set_hash + clock_set_hash +
watermark_set_hash + attenuation_hash`. Certificates **must not** emit a
`resolved_fact_hash` winner. Bindings compiled from silence or unknown
samples are rejected when the requested clock kind is
`ATTEST_MONOTONIC` (history-rewrite fence). Bindings compiled from
`REGRESSED` samples are rejected when the requested clock
kind is `ATTEST_MONOTONIC` (clock-regression fence). Bindings
compiled from `INVENTED_HISTORY` samples are rejected when the requested
clock kind is `ATTEST_MONOTONIC` (invented-history fence). Bindings
compiled from halted, extended-halt, or omitted samples are rejected
when the requested clock kind is `ATTEST_MONOTONIC`
(halt-attest fence). Bindings that would amplify purpose relative to
the sample attenuation hash are rejected (purpose-amplification fence).
Successor bindings that would emit a winner or restore a halted body are
rejected (successor-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream rotation, quarantine, placement,
or visibility revocation. Notify intents start as `PREPARED`, may become
`UNKNOWN_EFFECT` when the clock provider does not acknowledge, and
never invent success from silence. Attestation of `UNKNOWN_EFFECT` remains
`UNKNOWN_EFFECT` until a trusted monotonic sample arrives.

### 3.5 Availability contract

Clock control-plane APIs target 99.99% availability for open, nominate,
evaluate, seal, and perception reads. External notify and clock-sync
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Clock evaluation must not silently restore neighbor-impacting
board mutations from halted slots, regressed samples, or unsigned
samples.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and clock rules are immutable.
4. Binding identity
   (`source_clock_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `provider_sample_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Sample nomination uses point lookup by
   `(account_id, source_clock_id)` — never full clock-catalog or board
   scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/attest.
10. Silence and unknown samples cannot evaluate to `ATTEST_MONOTONIC`
    (history-rewrite fence).
11. Halted, extended-halt, and omitted samples cannot evaluate to
    `ATTEST_MONOTONIC` (halt-attest fence).
12. Requested purposes that amplify a sample attenuation hash are rejected
    (purpose-amplification fence).
13. Successor enrollment cannot emit a winning fact hash or restore a
    halted body (successor-leak fence).
14. Regressed samples cannot evaluate to `ATTEST_MONOTONIC`
    (clock-regression fence).
15. Watermark claims earlier than the first attested sample cannot evaluate
    to `ATTEST_MONOTONIC` (invented-history fence).
16. Clock certificates bind sample set, clock set, watermark set,
    and attenuation hashes; they never invent a winning fact hash.
17. Plans that require unscoped board, session, working-set, grant-graph,
    clock-catalog, quarantine-ledger, or citation-ledger scans are **FULL
    SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate clock rules. Approval validates definition
hash, requires at least one clock rule, and fences the status
transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash, budget
reservations, and authorization evidence. The session starts `OPEN` with
`state_revision = 0`. Duplicate `(account_id, idempotency_key)` is rejected.

### 5.3 Nominate and evaluate

Nominate performs a point lookup on the clock catalog and writes an
immutable nomination receipt. Evaluate is a pure function of nominated
samples, attested clock kinds, skew bounds, and purpose relation. It never
walks the catalog.

### 5.4 Seal clock certificate

Seal binds the evaluation hashes to a consumer ref. The certificate stores
sample-set, clock-set, watermark-set, and attenuation hashes. It must not
store `resolved_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is receipt-keyed. Notify intents start `PREPARED` and may
become `UNKNOWN_EFFECT`. Dispatch never scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one clock rule. Approval
is authority-fenced.

### 6.2 Session open

An authorized principal opens a session under the approved version.

### 6.3 Nominating / evaluating

The session moves `OPEN → NOMINATING → EVALUATING` by CAS. Budgets decrement
in the ledger.

### 6.4 Sealed / invalidated

Seal moves the session to `SEALED`. Upstream revocation writes an
invalidation and may move bindings to `INVALIDATED`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`, and
`UNKNOWN_EFFECT` are terminal. Terminal records are append-only.

### 6.6 Retain

Audit events, certificates, and bindings retain for the account's legal
hold. Perception snapshots are derived and may be compacted after Merkle
anchor.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SourceClockId = string & { readonly brand: "SourceClockId" };
type EvaluationId = string & { readonly brand: "EvaluationId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type BindingId = string & { readonly brand: "BindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_CLOCK_SAMPLE"
  | "EVALUATE_WATERMARK_CLOCK"
  | "SEAL_CLOCK_CERTIFICATE"
  | "INVALIDATE_WATERMARK_CLOCK"
  | "PREPARE_CLOCK_EFFECT"
  | "RESOLVE_CLOCK_UNCERTAINTY"
  | "CLOSE_SESSION";

type WatermarkClockAttestationBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "SAMPLE_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "CLOCK_REGRESSION_DENIED"
  | "INVENTED_HISTORY_DENIED"
  | "HALT_ATTEST_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "UNSIGNED_CLOCK_DENIED"
  | "SKEW_BOUND_DENIED"
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

type SourceClockKind =
  | "SEALED_QUARANTINE_WATERMARK"
  | "PROVIDER_CLOCK_SAMPLE"
  | "RETIREMENT_WATERMARK_CLAIM"
  | "COMPROMISE_WATERMARK_CLAIM";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type ClockLifecycle =
  | "FIRST_SAMPLE"
  | "MONOTONIC"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "UNKNOWN_EFFECT";

type AttestedClockKind =
  | "TRUSTED_MONOTONIC"
  | "TRUSTED_WITHIN_SKEW"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "SILENCE"
  | "UNKNOWN_EFFECT";

type ClockKind =
  | "ATTEST_MONOTONIC"
  | "HOLD_UNKNOWN"
  | "REJECT_REGRESSION"
  | "REJECT_INVENTED_HISTORY"
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

interface WatermarkClockAttestationBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly clockUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedSamples: number;
}

interface WatermarkClockAttestationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedSamples: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface WatermarkClockAttestationSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: WatermarkClockAttestationBudget;
  readonly consumed: Omit<
    WatermarkClockAttestationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedSamples"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface ClockNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceClockId: SourceClockId;
  readonly sourceClockKind: SourceClockKind;
  readonly placementKind: PlacementKind;
  readonly clockLifecycle: ClockLifecycle;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface WatermarkClockAttestationEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly sampleSetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly watermarkSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface WatermarkClockAttestationBinding {
  readonly accountId: AccountId;
  readonly bindingId: BindingId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceClockId: SourceClockId;
  readonly sourceClockKind: SourceClockKind;
  readonly bindingOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedClockKind: AttestedClockKind;
  readonly clockKind: ClockKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly providerSampleHash: Sha256;
  readonly retirementWatermarkHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface WatermarkClockAttestationCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly sampleSetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly watermarkSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface WatermarkClockAttestationEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentWatermarkClockAttestationPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly attestMonotonicBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectRegressionBindingCount: number;
  readonly rejectInventedHistoryBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly WatermarkClockAttestationEffectObservation[];
  readonly remainingBudget: Omit<
    WatermarkClockAttestationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedSamples"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly WatermarkClockAttestationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateWatermarkClockAttestationSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: WatermarkClockAttestationBudget;
}

interface NominateClockSampleInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceClockId: SourceClockId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateWatermarkClockInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedSampleSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealClockCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedWatermarkSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateWatermarkClockInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceClockId: SourceClockId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "CLOCK_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareClockEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveClockUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_SAMPLE"
    | "ACCEPT_ATTESTATION"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseWatermarkClockAttestationSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type WatermarkClockAttestationDecision =
  | { readonly decision: "ALLOWED"; readonly session: WatermarkClockAttestationSession;
      readonly certificate?: WatermarkClockAttestationCertificate;
      readonly member?: WatermarkClockAttestationBinding;
      readonly receipt?: ClockNominationReceipt;
      readonly evaluation?: WatermarkClockAttestationEvaluationReceipt;
      readonly perception: AgentWatermarkClockAttestationPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: WatermarkClockAttestationBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentWatermarkClockAttestationPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE wca_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE wca_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE wca_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE wca_source_kind AS ENUM (
  'SEALED_QUARANTINE_WATERMARK', 'PROVIDER_CLOCK_SAMPLE',
  'RETIREMENT_WATERMARK_CLAIM', 'COMPROMISE_WATERMARK_CLAIM'
);
CREATE TYPE wca_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE wca_clock_lifecycle AS ENUM (
  'FIRST_SAMPLE', 'MONOTONIC', 'REGRESSED', 'INVENTED_HISTORY',
  'UNKNOWN_EFFECT'
);
CREATE TYPE wca_attested_clock_kind AS ENUM (
  'TRUSTED_MONOTONIC', 'TRUSTED_WITHIN_SKEW', 'REGRESSED',
  'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE wca_clock_kind AS ENUM (
  'ATTEST_MONOTONIC', 'HOLD_UNKNOWN', 'REJECT_REGRESSION',
  'REJECT_INVENTED_HISTORY', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE wca_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE wca_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE wca_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_wca_profile_authority NOLOGIN;

CREATE TABLE agent_wca_authorization_evidence (
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

CREATE TABLE agent_wca_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status wca_profile_status NOT NULL,
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
  max_nominated_samples SMALLINT NOT NULL
    CHECK (max_nominated_samples BETWEEN 1 AND 256),
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
    REFERENCES agent_wca_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_wca_profile_clock_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  require_trusted_sample BOOLEAN NOT NULL,
  clock_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_wca_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_wca_clock_catalog (
  account_id BIGINT NOT NULL,
  source_clock_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  clock_ref TEXT NOT NULL,
  source_clock_kind wca_source_kind NOT NULL,
  placement_kind wca_placement_kind NOT NULL,
  clock_lifecycle wca_clock_lifecycle NOT NULL,
  status wca_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  provider_reported_at TIMESTAMPTZ NOT NULL,
  engine_observed_at TIMESTAMPTZ NOT NULL,
  first_attested_sample_at TIMESTAMPTZ,
  last_attested_sample_at TIMESTAMPTZ,
  max_skew_ms BIGINT NOT NULL CHECK (max_skew_ms BETWEEN 0 AND 86400000),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_clock_id),
  UNIQUE (account_id, clock_ref, source_clock_kind)
);

CREATE TABLE agent_wca_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status wca_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_clock_units BIGINT NOT NULL CHECK (budget_clock_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_clock_units BIGINT NOT NULL
    CHECK (consumed_clock_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_samples SMALLINT NOT NULL
    CHECK (max_nominated_samples BETWEEN 1 AND 256),
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
    REFERENCES agent_wca_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_wca_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_clock_units <= budget_clock_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_wca_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_clock_id UUID NOT NULL,
  source_clock_kind wca_source_kind NOT NULL,
  placement_kind wca_placement_kind NOT NULL,
  clock_lifecycle wca_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_clock_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_wca_session (account_id, session_id),
  FOREIGN KEY (account_id, source_clock_id)
    REFERENCES agent_wca_clock_catalog (account_id, source_clock_id)
);

CREATE TABLE agent_wca_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  sample_set_hash CHAR(64) NOT NULL CHECK (length(sample_set_hash) = 64),
  clock_set_hash CHAR(64) NOT NULL
    CHECK (length(clock_set_hash) = 64),
  watermark_set_hash CHAR(64) NOT NULL
    CHECK (length(watermark_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_wca_session (account_id, session_id)
);

CREATE TABLE agent_wca_clock_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  sample_set_hash CHAR(64) NOT NULL CHECK (length(sample_set_hash) = 64),
  clock_set_hash CHAR(64) NOT NULL
    CHECK (length(clock_set_hash) = 64),
  watermark_set_hash CHAR(64) NOT NULL
    CHECK (length(watermark_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  binding_watermark SMALLINT NOT NULL CHECK (binding_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_wca_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_wca_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_wca_clock_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_clock_id UUID NOT NULL,
  source_clock_kind wca_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status wca_binding_status NOT NULL,
  placement_kind wca_placement_kind NOT NULL,
  clock_lifecycle wca_clock_lifecycle NOT NULL,
  attested_clock_kind wca_attested_clock_kind NOT NULL,
  clock_kind wca_clock_kind NOT NULL,
  purpose_relation wca_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  provider_sample_hash CHAR(64) NOT NULL
    CHECK (length(provider_sample_hash) = 64),
  retirement_watermark_hash CHAR(64) NOT NULL
    CHECK (length(retirement_watermark_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_clock_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_wca_clock_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_wca_session (account_id, session_id),
  FOREIGN KEY (account_id, source_clock_id)
    REFERENCES agent_wca_clock_catalog (account_id, source_clock_id)
);

CREATE TABLE agent_wca_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_clock_id UUID NOT NULL,
  prior_disputed_fact_hash CHAR(64) NOT NULL
    CHECK (length(prior_disputed_fact_hash) = 64),
  next_disputed_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CLOCK_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_wca_clock_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_clock_id)
    REFERENCES agent_wca_clock_catalog (account_id, source_clock_id)
);

CREATE TABLE agent_wca_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status wca_effect_status NOT NULL,
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
    REFERENCES agent_wca_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_wca_clock_certificate (account_id, certificate_id)
);

CREATE TABLE agent_wca_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'CLOCK'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_wca_session (account_id, session_id)
);

CREATE TABLE agent_wca_terminal_record (
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
    REFERENCES agent_wca_session (account_id, session_id)
);

CREATE TABLE agent_wca_command_result (
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

CREATE TABLE agent_wca_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_wca_audit_event (
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

CREATE TABLE agent_wca_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_wca_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status wca_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_wca_session (account_id, session_id)
);

CREATE TABLE agent_wca_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_wca_profile()
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
       OR NEW.max_nominated_samples
         IS DISTINCT FROM OLD.max_nominated_samples
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
    IF current_setting('app.wca_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.wca_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_wca_profile_protect
BEFORE INSERT OR UPDATE ON agent_wca_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_wca_profile();

CREATE FUNCTION protect_agent_wca_profile_clock_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status wca_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_wca_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile clock rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_wca_profile_clock_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_wca_profile_clock_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_wca_profile_clock_rule();

CREATE FUNCTION protect_agent_wca_clock_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_clock_id IS DISTINCT FROM OLD.source_clock_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.binding_ordinal IS DISTINCT FROM OLD.binding_ordinal
       OR NEW.source_clock_kind IS DISTINCT FROM OLD.source_clock_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.clock_lifecycle IS DISTINCT FROM OLD.clock_lifecycle
       OR NEW.attested_clock_kind IS DISTINCT FROM OLD.attested_clock_kind
       OR NEW.clock_kind IS DISTINCT FROM OLD.clock_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.provider_sample_hash IS DISTINCT FROM OLD.provider_sample_hash
       OR NEW.retirement_watermark_hash
         IS DISTINCT FROM OLD.retirement_watermark_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'clock binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.attested_clock_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks attest-monotonic from silent or unknown sample';
  END IF;

  IF NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.attested_clock_kind = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks attest-monotonic after provider regression';
  END IF;

  IF NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.attested_clock_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks attest-monotonic for pre-first-sample watermark';
  END IF;

  IF NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-attest fence blocks attest-monotonic on halted sample';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than sample attenuation';
  END IF;

  IF NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose attest after attenuation hops';
  END IF;

  IF NEW.clock_kind = 'ATTEST_MONOTONIC'
     AND NEW.attested_clock_kind NOT IN ('TRUSTED_MONOTONIC', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'unsigned-clock fence blocks attest-monotonic without trusted monotonic sample';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_wca_clock_binding_protect
BEFORE INSERT OR UPDATE ON agent_wca_clock_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_wca_clock_binding();

CREATE FUNCTION protect_agent_wca_effect_intent()
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

CREATE TRIGGER agent_wca_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_wca_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_wca_effect_intent();

CREATE FUNCTION approve_agent_wca_profile(
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
  stored_status wca_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_wca_profile
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
  FROM agent_wca_profile_clock_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one clock rule';
  END IF;

  PERFORM set_config(
    'app.wca_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_wca_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_wca_profile(
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
  stored_status wca_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_wca_profile
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
    'app.wca_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_wca_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_wca_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_wca_profile_authority;
ALTER FUNCTION revoke_agent_wca_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_wca_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_wca_profile_authority;
GRANT SELECT ON
  agent_wca_profile,
  agent_wca_profile_clock_rule
TO agent_wca_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_wca_profile TO agent_wca_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_wca_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_wca_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_wca_profile FROM PUBLIC;

CREATE INDEX agent_wca_session_work_idx ON agent_wca_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_wca_session_profile_idx ON agent_wca_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_wca_binding_certificate_idx ON agent_wca_clock_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_wca_binding_clock_idx ON agent_wca_clock_binding (
  account_id, source_clock_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_wca_catalog_ref_idx ON agent_wca_clock_catalog (
  account_id, clock_ref, sealed_at DESC, source_clock_id
);
CREATE INDEX agent_wca_catalog_kind_idx ON agent_wca_clock_catalog (
  account_id, source_clock_kind, sealed_at DESC, source_clock_id
);
CREATE INDEX agent_wca_evaluation_session_idx ON agent_wca_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_wca_certificate_session_idx ON agent_wca_clock_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_wca_effect_work_idx ON agent_wca_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_wca_audit_time_idx ON agent_wca_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_wca_perception_status_idx ON agent_wca_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_wca_command_expiry_idx ON agent_wca_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_wca_invalidation_certificate_idx ON agent_wca_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_wca_authorization_evidence',
    'agent_wca_profile',
    'agent_wca_profile_clock_rule',
    'agent_wca_clock_catalog',
    'agent_wca_session',
    'agent_wca_nomination_receipt',
    'agent_wca_evaluation_receipt',
    'agent_wca_clock_certificate',
    'agent_wca_clock_binding',
    'agent_wca_invalidation',
    'agent_wca_effect_intent',
    'agent_wca_budget_ledger',
    'agent_wca_terminal_record',
    'agent_wca_command_result',
    'agent_wca_audit_head',
    'agent_wca_audit_event',
    'agent_wca_audit_anchor',
    'agent_wca_perception_snapshot',
    'agent_wca_projection_checkpoint'
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
single ACID row-store transaction with session CAS. Clock-certificate
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

enum AgentWcaSessionStatus {
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

enum AgentWcaBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentWcaSourceKind {
  SEALED_QUARANTINE_WATERMARK
  PROVIDER_CLOCK_SAMPLE
  RETIREMENT_WATERMARK_CLAIM
  COMPROMISE_WATERMARK_CLAIM
}

enum AgentWcaPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentWcaClockLifecycle {
  FIRST_SAMPLE
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentWcaAttestedClockKind {
  TRUSTED_MONOTONIC
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentWcaClockKind {
  ATTEST_MONOTONIC
  HOLD_UNKNOWN
  REJECT_REGRESSION
  REJECT_INVENTED_HISTORY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentWcaPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentWcaEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentWcaNextAction {
  NOMINATE_CLOCK_SAMPLE
  EVALUATE_WATERMARK_CLOCK
  SEAL_CLOCK_CERTIFICATE
  INVALIDATE_WATERMARK_CLOCK
  PREPARE_CLOCK_EFFECT
  RESOLVE_CLOCK_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentWcaBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  SAMPLE_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  CLOCK_REGRESSION_DENIED
  INVENTED_HISTORY_DENIED
  HALT_ATTEST_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  UNSIGNED_CLOCK_DENIED
  SKEW_BOUND_DENIED
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

enum AgentWcaUncertaintyResolution {
  RETRY_SAME_SAMPLE
  ACCEPT_ATTESTATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentWcaInvalidationReason {
  SUPERSEDED
  RETRACTED
  QUARANTINED
  CLOCK_REVOKED
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentWcaBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  clockUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedSamples: Int!
}

type AgentWcaProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedSamples: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentWcaSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentWcaSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentWcaBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentWcaNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceClockId: ID!
  sourceClockKind: AgentWcaSourceKind!
  placementKind: AgentWcaPlacementKind!
  clockLifecycle: AgentWcaClockLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentWcaEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  sampleSetHash: SHA256!
  clockSetHash: SHA256!
  watermarkSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentWcaCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  sampleSetHash: SHA256!
  clockSetHash: SHA256!
  watermarkSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentWcaBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceClockId: ID!
  sourceClockKind: AgentWcaSourceKind!
  bindingOrdinal: Int!
  status: AgentWcaBindingStatus!
  placementKind: AgentWcaPlacementKind!
  clockLifecycle: AgentWcaClockLifecycle!
  attestedClockKind: AgentWcaAttestedClockKind!
  clockKind: AgentWcaClockKind!
  purposeRelation: AgentWcaPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  providerSampleHash: SHA256!
  retirementWatermarkHash: SHA256!
  sealedAt: DateTime!
}

type AgentWcaEffectObservation {
  effectId: ID!
  status: AgentWcaEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentWcaPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentWcaSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  attestMonotonicBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectRegressionBindingCount: Int!
  rejectInventedHistoryBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentWcaEffectObservation!]!
  remainingBudget: AgentWcaBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentWcaNextAction!]!
  blockedReasons: [AgentWcaBlockedReason!]!
  cardHash: SHA256!
}

type AgentWcaMutationResult {
  decision: String!
  session: AgentWcaSession
  certificate: AgentWcaCertificate
  member: AgentWcaBinding
  receipt: AgentWcaNominationReceipt
  evaluation: AgentWcaEvaluationReceipt
  perception: AgentWcaPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentWcaBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  clockUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedSamples: Int!
}

input CreateWatermarkClockAttestationSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentWcaBudgetInput!
}

input NominateClockSampleInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceClockId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluateWatermarkClockInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedSampleSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealClockCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedWatermarkSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateWatermarkClockInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceClockId: ID!
  reasonCode: AgentWcaInvalidationReason!
  idempotencyKey: String!
}

input PrepareClockEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveClockUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentWcaUncertaintyResolution!
  idempotencyKey: String!
}

input AgentWcaProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentWcaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentWcaProfile
  agentWcaSession(accountId: ID!, sessionId: ID!): AgentWcaSession
  agentWcaClockCertificate(accountId: ID!, certificateId: ID!): AgentWcaCertificate
  agentWcaPerceptionCard(accountId: ID!, sessionId: ID!): AgentWcaPerceptionCard
  agentWcaNominatedSample(
    accountId: ID!
    sessionId: ID!
    sourceClockId: ID!
  ): AgentWcaNominationReceipt
  agentWcaSearchProfiles(input: AgentWcaProfileSearchInput!): [AgentWcaProfile!]!
}

type Mutation {
  createWatermarkClockAttestationSession(
    input: CreateWatermarkClockAttestationSessionInput!
  ): AgentWcaMutationResult!
  nominateClockSample(input: NominateClockSampleInput!): AgentWcaMutationResult!
  evaluateWatermarkClock(
    input: EvaluateWatermarkClockInput!
  ): AgentWcaMutationResult!
  sealClockCertificate(input: SealClockCertificateInput!): AgentWcaMutationResult!
  invalidateWatermarkClock(
    input: InvalidateWatermarkClockInput!
  ): AgentWcaMutationResult!
  prepareClockEffect(input: PrepareClockEffectInput!): AgentWcaMutationResult!
  resolveClockUncertainty(
    input: ResolveClockUncertaintyInput!
  ): AgentWcaMutationResult!
  closeWatermarkClockAttestationSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentWcaMutationResult!
  approveWatermarkClockAttestationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentWcaMutationResult!
  revokeWatermarkClockAttestationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentWcaMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealClockCertificate` is rejected with `HISTORY_REWRITE_DENIED`
  when a nominated silent or unknown sample would evaluate to
  `ATTEST_MONOTONIC`.
- `sealClockCertificate` is rejected with
  `CLOCK_REGRESSION_DENIED` when a nominated `REGRESSED` sample
  would evaluate to `ATTEST_MONOTONIC`.
- `sealClockCertificate` is rejected with `INVENTED_HISTORY_DENIED`
  when a nominated watermark earlier than the first attested sample would
  evaluate to `ATTEST_MONOTONIC`.
- `sealClockCertificate` is rejected with `HALT_ATTEST_DENIED`
  when a nominated halted, extended-halt, or omitted sample would evaluate
  to `ATTEST_MONOTONIC`.
- `evaluateWatermarkClock` is rejected with
  `PURPOSE_AMPLIFICATION_DENIED` when the requested purpose would amplify a
  sample attenuation hash.
- Successor enrollment that would restore a halted body or invent a winner
  is rejected with `SUCCESSOR_LEAK_DENIED`.

## 10. Procedural memory

Approved clock profiles are procedural memory: versioned instructions
for how sealed quarantine watermarks and provider clock samples become
envelope-scoped attestation bindings without inventing a
winner and without rewriting historical silence as success. Procedure refs
may point to clock-containment playbook steps. Profiles are immutable
after approval; agents perceive `procedureTags` and `allowedNextActions` on
perception cards, never inventing clock policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which clock profile
fits incident hop-attenuated watermark attestation?"). Embeddings
are account-owned and must be queried with `account_id` equality. The
reference schema stores vectors but does **not** create a cross-tenant HNSW
index; production builds account-partitioned HNSW segments.

Semantic retrieval may return clock profiles only. It never authorizes
nominate, evaluate, seal, or attest. Vector `topK` is budgeted and
clamped.

```sql
CREATE TABLE agent_wca_profile_embedding (
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
    REFERENCES agent_wca_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status, sealed /
attest-monotonic / hold-unknown / reject-regression / invented-history /
unknown / skipped / invalidated binding counts, uncertain notify intents,
remaining budgets, procedure tags, allowed next actions, and blocked
reasons. Summary text is `UntrustedText`. Cards never embed raw private
keys or redacted fact bodies. `cardHash` makes perception replayable.
Agents perceive `ATTEST_MONOTONIC` as a trusted clock that still cannot
invent a winner, `HOLD_UNKNOWN` as a bounded uncertainty window,
`REJECT_REGRESSION` as a trusted negative receipt for a backwards
provider clock, `REJECT_INVENTED_HISTORY` as a trusted refusal of a
watermark that predates the first attested sample, and `SKIP` as a sealed
refusal — never as a sample that "must have been signed before the
watermark."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, clock-certificate
seals, and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed clock
certificates but are not authoritative for attest-monotonic,
hold-unknown, or reject-regression outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Notify dispatch and clock-sync side-effects are not silently ACID-coupled;
silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on attestations per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/CLOCK.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped clock-catalog, working-set, grant-graph,
  citation, quarantine-ledger, or board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board mutations from
  halted slots, regressed samples, or unsigned samples.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding attestable samples by scanning the clock or working-set
  ledger (rejected; nominate by `(account_id, source_clock_id)`).
- Evaluating a clock by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  sample-keyed active binding indexes).

### Required access paths

- Sample nomination: PK `(account_id, source_clock_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/sample: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/clock-catalog/quarantine-ledger/citation scan
is **FULL SCAN REJECTED** before execution.

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
- Historical silence invented as attest-monotonic: history-rewrite fence.
- Provider clock that moves backwards kept as trusted: clock-regression
  fence.
- Watermark that predates the first attested sample kept as trusted:
  invented-history fence.
- Halt leak of frozen bodies into attest-monotonic: halt-attest fence.
- Successor that restores a halted body or invents a winner:
  successor-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot attest: certificates bind sample
  and watermark sets, never `resolved_fact_hash`.
- Silent notify or clock-sync success: `UNKNOWN_EFFECT` until ACK.
- Recursive clock-catalog or board storms: budget and **FULL SCAN
  REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- History-rewrite rejection, clock-regression rejection,
  invented-history rejection, halt-attest rejection, purpose-amplification
  rejection, successor-leak rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow clock

Compile profiles and validate sample nomination without durable
certificates.

### Phase 2: reject-regression and skip only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT`
samples as `REJECT_REGRESSION` or `SKIP`. Attest-monotonic stays closed.

### Phase 3: trusted attest and halt-attest fences

Enable budgeted `ATTEST_MONOTONIC` from `RESTORED_WITHOUT_WINNER` samples
with `TRUSTED_MONOTONIC` or `TRUSTED_WITHIN_SKEW` samples only.

### Phase 4: notify uncertainty

Enable clock notify intents with `UNKNOWN_EFFECT` reconciliation and
`HOLD_UNKNOWN` that cannot invent monotonic trust from silence.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`ATTEST_MONOTONIC` only for monotonic samples that cannot rewrite
historical silence as success.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, history-rewrite,
  purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed sample point lookup and hash match.
- Evaluate binds sample set and attenuation under budget.
- Seal is rejected when silence would become attest-monotonic, and never
  invents a winning fact hash.
- Clock-certificate seal binds immutable bindings under sample-set,
  clock-set, watermark-set, and attenuation hashes — never a winner
  hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed clock certificates after process
  restart.

## 21. Product decision

Adopt the Watermark-Clock Attestation Plane as the deterministic clock
path for retirement and compromise watermarks bound
by the Key-Compromise Quarantine and Provider-Key Rotation planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the
   post-quarantine watermark-clock gap without history rewrite,
   clock-regression leak, invented-history leak, halt leak, purpose
   amplification, invented winners, or clock-catalog scans.
2. Account-leading indexes, history-rewrite and purpose-amplification
   fences, and **FULL SCAN REJECTED** planner rules protect 99.99% neighbor
   latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile
   discovery, perception cards, and hash-chained audit replay make the
   plane agent-ready without putting probabilistic AI inside the data
   engine.
