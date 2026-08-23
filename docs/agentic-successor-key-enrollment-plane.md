# mondayDB Agentic Successor-Key Enrollment Attestation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-23.v1`

## 1. Why this plane, before how

A sealed successor-clock re-attestation certificate can rebind quarantined
receipts to an already-attested successor clock. It does not decide
**whether a rotated signing key may be enrolled** against that clock —
without scanning every historical key, rewriting silence into a trusted
pre-sample success, or inventing a winner from a regressed, unattested, or
halted body.

Without a successor-key enrollment plane, operators and agents either:

- scan every rotated key looking for "which signatures can ride
  the attested clock" (neighbor-harmful on boards with 1M+ rows), or
- treat a newly rotated signing key as retroactive engine truth, so
  historical `UNKNOWN_EFFECT` is rewritten as `ACKED`, a key that predates
  the first attested clock sample is trusted, a halt-scoped body is
  "unlocked" by later key enrollment, and hop-attenuated purpose is
  amplified back to the donor.

The product trade-off is **enrollment fluency versus enrollment isolation**:

- Accepting every successor-key arrival immediately maximizes agent
  fluency and reduces re-planning cost, but creates history-rewrite
  invention, unattested-clock leak, invented-history leak, unauditable
  enrollment storms, and recursive key-catalog walks against neighbors.
- Binding a sealed enrollment certificate under an approved enroll
  profile, key point lookups, history-rewrite fences, unattested-clock
  fences, invented-history fences, halt-enroll fences,
  purpose-amplification fences, successor-leak fences, and steward budgets
  adds one bounded evaluate transaction and short-lived enrollment storage.
- Semantic similarity may discover enroll profiles, but it must never
  decide whether a key may be nominated, a clock evaluated, a
  certificate sealed, or a notify dispatched.

The recommended model keeps the data plane deterministic:

1. An approved enroll profile defines allowed key kinds, clock
   policy, and notify policy. Evaluation **never** invents a winning fact
   hash and **never** rewrites a historical key kind.
2. An enroll session opens under purpose, budget, and authorization
   fences, and only nominates sealed reattest certificates, clock
   certificates, successor-key claims, or rotated signing material by point lookup
   from the Successor-Clock Re-Attestation, Watermark-Clock Attestation, and
   Provider-Key Rotation planes.
3. mondayDB evaluates an enrollment whose kind is a pure function of
   `(source_key_kind, placement_kind, key_lifecycle,
   clock_lifecycle, attested_key_kind, requested_purpose_hash,
   attenuation_hash, hop_count, key_rotated_at,
   clock_first_attested_at, clock_attested_at, max_skew_ms)`.
   Silence cannot become historical success. Unattested clocks
   cannot become trusted. Invented key history cannot become
   trusted. Halted slots cannot become enrollment-trusted.
4. Sealing an enroll certificate binds
   `consumer_ref + purpose_hash + key_set_hash + clock_set_hash +
   watermark_set_hash + attenuation_hash`. The certificate **must not**
   emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. Enrollment of `UNKNOWN_EFFECT`
   remains uncertain until a trusted enrolled key arrives.
6. Unscoped key-catalog, clock-catalog, quarantine-ledger, working-set,
   grant-graph, or board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"re-judge every historical key forever" or "keep every unattested
signature until silence looks like success" loops are rejectable before they
scan boards with 1M+ rows. Perception is restored by sealed enroll
certificates, not by magic key orchestration inside the engine.

### Product outcome

For any successor-key enrollment evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or notify dispatch?
- Which nominated keys, placement kinds, hop counts, attenuation
  hashes, attested key kinds, and enroll kinds were bound?
- Is the enroll certificate still current, invalidated, or awaiting
  notify acknowledgement?
- Did async notify or key-enrollment sync become `UNKNOWN_EFFECT`?
- Can the enrollment history be replayed without invoking an LLM?

## 2. Scope and ownership

The Successor-Key Enrollment Attestation Plane owns:

1. Immutable approved enroll profiles as procedural memory of "how a
   rotated signing key is enrolled against an already-attested successor
   clock without amplifying purpose, leaking halted facts, rewriting
   attested history, or inventing success from silence or an unattested
   clock."
2. Tenant-scoped enroll sessions with purpose and budget fences.
3. Deterministic nomination of sealed keys, clock certificates, and
   successor-key claims by point lookup — never key-catalog, working-set,
   or board scans.
4. Deterministic evaluation receipts, sealed enroll certificates, and
   immutable enroll bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded enroll budgets.

It integrates with, but does not replace:

- **Successor-Clock Re-Attestation:** supplies sealed reattest
  certificates that this plane may enroll keys against. This plane
  never re-attests the clock itself and never rotates signing material.
- **Watermark-Clock Attestation:** supplies sealed successor-clock
  certificates that this plane may bind a key against. This plane
  never invents a first clock sample.
- **Provider-Key Rotation:** supplies sealed successor enrollment hashes
  and rotated signing-material claims that still require enrollment
  against an attested clock.
- **Key-Compromise Quarantine / Provider-Receipt Attestation:** supply
  historical receipt IDs whose trusted-at timestamps remain historical;
  this plane does not rewrite them as successor-signed.
- **Envelope Tool-Effect Saga / Envelope Purpose Gate / Certificate
  Placement:** upstream hop-attenuated context that produced the keys
  now under enrollment review.
- **Executive Freeze / Thaw SLA:** halt/restore context that still forbids
  enroll-key-to-clock against a halted body.
- **Emergency Containment:** the coarse stop/drain path used when a
  contained key evaluates to `SKIP` or `REJECT_UNATTESTED_CLOCK`; this
  plane is purpose-scoped enrollment isolation, not workspace-wide
  containment.
- **Decision Memory:** may consume sealed enroll certificates as reuse
  evidence, not raw key-enrollment webhooks.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and enroll units.

### Non-goals

- Letting an LLM decide that a silent or unattested key "feels
  enrollable enough."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative enroll certificates from columnar or
  vector projections.
- Cross-account successor-key enrollment or global nearest-neighbor authorization.
- Storing raw private keys, unrestricted tool payloads, or redacted
  plaintext.
- Claiming distributed atomicity with external time-distribution providers.
- Inventing a winning fact hash when a successor key arrives after a
  restored slot.
- Rewriting historical `SILENCE` or `UNKNOWN_EFFECT` keys as
  `ENROLL_KEY_TO_CLOCK` because a new key exists.
- Rewriting a later trusted key as invented history solely because a
  later key sample exists (that is an explicit supersession, not
  this plane).
- Unbounded recursive key-catalog or board walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Enroll profile contract

A profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_REATTEST_CERTIFICATE`,
  `SEALED_CLOCK_CERTIFICATE`, `SUCCESSOR_KEY_CLAIM`,
  `ROTATED_SIGNING_MATERIAL`);
- evaluate threshold (distinct human or attested principals), max bindings
  per certificate, and max nominated keys;
- enroll policy (`HISTORY_NEVER_REWRITTEN`,
  `UNATTESTED_NEVER_TRUSTED`, `KEY_NEVER_INVENT_HISTORY`,
  `HALT_DENIES_ENROLL`,
  `PURPOSE_NARROW_ONLY`, `SUCCESSOR_NEVER_RESTORES_WINNER`,
  `GRACE_SILENCE_NEVER_SUCCESS`, `SKEW_BOUND_NEVER_TRUSTED_BEYOND`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed enroll kinds (`ENROLL_KEY_TO_CLOCK`, `HOLD_UNKNOWN`,
  `REJECT_UNATTESTED_CLOCK`, `REJECT_INVENTED_HISTORY`, `SKIP`) and notify
  policy after seal, invalidation, or upstream key or clock change;
- optional procedural refs for "how to present unknown, unattested-clock, or
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

Nominating sealed key material returns a nomination receipt. Evaluating
an enrollment binds each nominated key to an enroll kind that is
compatible with the attested key kind, placement kind, key
lifecycle, clock lifecycle, skew bound, and purpose relation. Sealing a
certificate binds
`consumer_ref + purpose_hash + key_set_hash + clock_set_hash +
watermark_set_hash + attenuation_hash`. Certificates **must not** emit a
`resolved_fact_hash` winner. Bindings compiled from silence or unknown
keys are rejected when the requested enroll kind is
`ENROLL_KEY_TO_CLOCK` (history-rewrite fence). Bindings compiled from
`UNATTESTED` clocks are rejected when the requested enroll
kind is `ENROLL_KEY_TO_CLOCK` (unattested-clock fence). Bindings
compiled from `INVENTED_HISTORY` keys are rejected when the
requested enroll kind is `ENROLL_KEY_TO_CLOCK` (invented-history
fence). Bindings compiled from halted, extended-halt, or omitted keys
are rejected when the requested enroll kind is `ENROLL_KEY_TO_CLOCK`
(halt-enroll fence). Bindings that would amplify purpose relative to
the key attenuation hash are rejected (purpose-amplification fence).
Successor bindings that would emit a winner or restore a halted body are
rejected (successor-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream rotation, quarantine, placement,
clock, or visibility revocation. Notify intents start as `PREPARED`, may
become `UNKNOWN_EFFECT` when the successor provider does not acknowledge,
and never invent success from silence. Enrollment of `UNKNOWN_EFFECT`
remains `UNKNOWN_EFFECT` until a trusted enrolled key arrives.

### 3.5 Availability contract

Enroll control-plane APIs target 99.99% availability for open, nominate,
evaluate, seal, and perception reads. External notify and successor-clock
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Enroll evaluation must not silently restore neighbor-impacting
board mutations from halted slots, unattested clocks, or unbound
keys.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and enroll rules are immutable.
4. Binding identity
   (`source_key_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `successor_key_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Key nomination uses point lookup by
   `(account_id, source_key_id)` — never full key-catalog or board
   scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/enroll.
10. Silence and unknown keys cannot evaluate to `ENROLL_KEY_TO_CLOCK`
    (history-rewrite fence).
11. Halted, extended-halt, and omitted keys cannot evaluate to
    `ENROLL_KEY_TO_CLOCK` (halt-enroll fence).
12. Requested purposes that amplify a key attenuation hash are rejected
    (purpose-amplification fence).
13. Successor enrollment cannot emit a winning fact hash or restore a
    halted body (successor-leak fence).
14. Unattested clocks cannot evaluate to `ENROLL_KEY_TO_CLOCK`
    (unattested-clock fence).
15. Key samples that invent history earlier than the first attested
    clock cannot evaluate to `ENROLL_KEY_TO_CLOCK` (invented-history
    fence).
16. Enroll certificates bind key set, clock set, watermark set,
    and attenuation hashes; they never invent a winning fact hash.
17. Plans that require unscoped board, session, working-set, grant-graph,
    key-catalog, clock-catalog, quarantine-ledger, or citation-ledger
    scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate enroll rules. Approval validates definition
hash, requires at least one enroll rule, and fences the status
transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash, budget
reservations, and authorization evidence. The session starts `OPEN` with
`state_revision = 0`. Duplicate `(account_id, idempotency_key)` is rejected.

### 5.3 Nominate and evaluate

Nominate performs a point lookup on the key catalog and writes an
immutable nomination receipt. Evaluate is a pure function of nominated
keys, attested key kinds, clock lifecycles, skew bounds, and
purpose relation. It never walks the catalog.

### 5.4 Seal enroll certificate

Seal binds the evaluation hashes to a consumer ref. The certificate stores
key-set, clock-set, watermark-set, and attenuation hashes. It must
not store `resolved_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is source-key keyed. Notify intents start `PREPARED` and may
become `UNKNOWN_EFFECT`. Dispatch never scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one enroll rule. Approval
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
type SourceKeyId = string & { readonly brand: "SourceKeyId" };
type EvaluationId = string & { readonly brand: "EvaluationId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type BindingId = string & { readonly brand: "BindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SUCCESSOR_KEY"
  | "EVALUATE_SUCCESSOR_KEY_ENROLLMENT"
  | "SEAL_ENROLL_CERTIFICATE"
  | "INVALIDATE_SUCCESSOR_KEY_ENROLLMENT"
  | "PREPARE_ENROLL_EFFECT"
  | "RESOLVE_ENROLL_UNCERTAINTY"
  | "CLOSE_SESSION";

type SuccessorKeyEnrollmentBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "KEY_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "UNATTESTED_CLOCK_DENIED"
  | "INVENTED_HISTORY_DENIED"
  | "HALT_ENROLL_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "UNBOUND_KEY_DENIED"
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

type SourceKeyKind =
  | "SEALED_REATTEST_CERTIFICATE"
  | "SEALED_CLOCK_CERTIFICATE"
  | "SUCCESSOR_KEY_CLAIM"
  | "ROTATED_SIGNING_MATERIAL";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type KeyLifecycle =
  | "FIRST_ENROLLMENT"
  | "MONOTONIC"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "UNKNOWN_EFFECT";

type ClockLifecycle =
  | "ATTESTED"
  | "UNATTESTED"
  | "UNKNOWN_EFFECT";

type AttestedKeyKind =
  | "TRUSTED_ENROLLED"
  | "TRUSTED_WITHIN_SKEW"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "SILENCE"
  | "UNKNOWN_EFFECT";

type EnrollKind =
  | "ENROLL_KEY_TO_CLOCK"
  | "HOLD_UNKNOWN"
  | "REJECT_UNATTESTED_CLOCK"
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

interface SuccessorKeyEnrollmentBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly enrollUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedKeys: number;
}

interface SuccessorKeyEnrollmentProfile {
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

interface SuccessorKeyEnrollmentSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: SuccessorKeyEnrollmentBudget;
  readonly consumed: Omit<
    SuccessorKeyEnrollmentBudget,
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
  readonly clockLifecycle: ClockLifecycle;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface SuccessorKeyEnrollmentEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly keySetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly watermarkSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface SuccessorKeyEnrollmentBinding {
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
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly enrollKind: EnrollKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly successorKeyHash: Sha256;
  readonly clockAttestationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface SuccessorKeyEnrollmentCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly keySetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly watermarkSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface SuccessorKeyEnrollmentEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentSuccessorKeyEnrollmentPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly enrollKeyToClockBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectUnattestedClockBindingCount: number;
  readonly rejectInventedHistoryBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly SuccessorKeyEnrollmentEffectObservation[];
  readonly remainingBudget: Omit<
    SuccessorKeyEnrollmentBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedKeys"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly SuccessorKeyEnrollmentBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateSuccessorKeyEnrollmentSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: SuccessorKeyEnrollmentBudget;
}

interface NominateSuccessorKeyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceKeyId: SourceKeyId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateSuccessorKeyEnrollmentInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedReceiptSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealEnrollCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedWatermarkSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateSuccessorKeyEnrollmentInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceKeyId: SourceKeyId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareEnrollEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveEnrollUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_ENROLLMENT"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseSuccessorKeyEnrollmentSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type SuccessorKeyEnrollmentDecision =
  | { readonly decision: "ALLOWED"; readonly session: SuccessorKeyEnrollmentSession;
      readonly certificate?: SuccessorKeyEnrollmentCertificate;
      readonly member?: SuccessorKeyEnrollmentBinding;
      readonly receipt?: KeyNominationReceipt;
      readonly evaluation?: SuccessorKeyEnrollmentEvaluationReceipt;
      readonly perception: AgentSuccessorKeyEnrollmentPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: SuccessorKeyEnrollmentBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentSuccessorKeyEnrollmentPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE ske_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE ske_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_source_kind AS ENUM (
  'SEALED_REATTEST_CERTIFICATE', 'SEALED_CLOCK_CERTIFICATE',
  'SUCCESSOR_KEY_CLAIM', 'ROTATED_SIGNING_MATERIAL'
);
CREATE TYPE ske_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ske_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'MONOTONIC', 'REGRESSED', 'INVENTED_HISTORY',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ske_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_attested_key_kind AS ENUM (
  'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW', 'REGRESSED',
  'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_enroll_kind AS ENUM (
  'ENROLL_KEY_TO_CLOCK', 'HOLD_UNKNOWN', 'REJECT_UNATTESTED_CLOCK',
  'REJECT_INVENTED_HISTORY', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ske_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_ske_profile_authority NOLOGIN;

CREATE TABLE agent_ske_authorization_evidence (
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

CREATE TABLE agent_ske_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status ske_profile_status NOT NULL,
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
    REFERENCES agent_ske_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_ske_profile_enroll_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  require_trusted_key BOOLEAN NOT NULL,
  enroll_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_ske_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_ske_key_catalog (
  account_id BIGINT NOT NULL,
  source_key_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_key_kind ske_source_kind NOT NULL,
  placement_kind ske_placement_kind NOT NULL,
  key_lifecycle ske_key_lifecycle NOT NULL,
  clock_lifecycle ske_clock_lifecycle NOT NULL,
  status ske_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  key_rotated_at TIMESTAMPTZ NOT NULL,
  clock_first_attested_at TIMESTAMPTZ,
  clock_attested_at TIMESTAMPTZ,
  max_skew_ms BIGINT NOT NULL CHECK (max_skew_ms BETWEEN 0 AND 86400000),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_key_id),
  UNIQUE (account_id, receipt_ref, source_key_kind)
);

CREATE TABLE agent_ske_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status ske_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_enroll_units BIGINT NOT NULL CHECK (budget_enroll_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_enroll_units BIGINT NOT NULL
    CHECK (consumed_enroll_units >= 0),
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
    REFERENCES agent_ske_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_ske_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_enroll_units <= budget_enroll_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_ske_nomination_key (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  source_key_kind ske_source_kind NOT NULL,
  placement_kind ske_placement_kind NOT NULL,
  key_lifecycle ske_key_lifecycle NOT NULL,
  clock_lifecycle ske_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_key_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ske_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ske_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_ske_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  key_set_hash CHAR(64) NOT NULL CHECK (length(key_set_hash) = 64),
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
    REFERENCES agent_ske_session (account_id, session_id)
);

CREATE TABLE agent_ske_enroll_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  key_set_hash CHAR(64) NOT NULL CHECK (length(key_set_hash) = 64),
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
    REFERENCES agent_ske_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_ske_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_ske_enroll_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  source_key_kind ske_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status ske_binding_status NOT NULL,
  placement_kind ske_placement_kind NOT NULL,
  key_lifecycle ske_key_lifecycle NOT NULL,
  clock_lifecycle ske_clock_lifecycle NOT NULL,
  attested_key_kind ske_attested_key_kind NOT NULL,
  enroll_kind ske_enroll_kind NOT NULL,
  purpose_relation ske_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  successor_key_hash CHAR(64) NOT NULL
    CHECK (length(successor_key_hash) = 64),
  clock_attestation_hash CHAR(64) NOT NULL
    CHECK (length(clock_attestation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_key_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ske_enroll_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ske_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ske_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_ske_invalidation (
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
    REFERENCES agent_ske_enroll_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ske_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_ske_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status ske_effect_status NOT NULL,
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
    REFERENCES agent_ske_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ske_enroll_certificate (account_id, certificate_id)
);

CREATE TABLE agent_ske_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'ENROLL'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ske_session (account_id, session_id)
);

CREATE TABLE agent_ske_terminal_record (
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
    REFERENCES agent_ske_session (account_id, session_id)
);

CREATE TABLE agent_ske_command_result (
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

CREATE TABLE agent_ske_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_ske_audit_event (
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

CREATE TABLE agent_ske_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_ske_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status ske_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ske_session (account_id, session_id)
);

CREATE TABLE agent_ske_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_ske_profile()
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
    IF current_setting('app.ske_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.ske_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_ske_profile_protect
BEFORE INSERT OR UPDATE ON agent_ske_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_ske_profile();

CREATE FUNCTION protect_agent_ske_profile_enroll_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status ske_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_ske_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile enroll rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_ske_profile_enroll_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_ske_profile_enroll_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_ske_profile_enroll_rule();

CREATE FUNCTION protect_agent_ske_enroll_binding()
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
       OR NEW.clock_lifecycle IS DISTINCT FROM OLD.clock_lifecycle
       OR NEW.attested_key_kind
         IS DISTINCT FROM OLD.attested_key_kind
       OR NEW.enroll_kind IS DISTINCT FROM OLD.enroll_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.successor_key_hash IS DISTINCT FROM OLD.successor_key_hash
       OR NEW.clock_attestation_hash
         IS DISTINCT FROM OLD.clock_attestation_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'enroll binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks enrollment from silent or unknown successor';
  END IF;

  IF NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks enrollment against an unattested clock';
  END IF;

  IF NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks enroll for invented successor history';
  END IF;

  IF NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-enroll fence blocks enrollment on halted key';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose enroll after attenuation hops';
  END IF;

  IF NEW.enroll_kind = 'ENROLL_KEY_TO_CLOCK'
     AND NEW.attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'unbound-key fence blocks enrollment without trusted enrolled key';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_ske_enroll_binding_protect
BEFORE INSERT OR UPDATE ON agent_ske_enroll_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_ske_enroll_binding();

CREATE FUNCTION protect_agent_ske_effect_intent()
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

CREATE TRIGGER agent_ske_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_ske_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_ske_effect_intent();

CREATE FUNCTION approve_agent_ske_profile(
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
  stored_status ske_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ske_profile
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
  FROM agent_ske_profile_enroll_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one enroll rule';
  END IF;

  PERFORM set_config(
    'app.ske_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_ske_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_ske_profile(
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
  stored_status ske_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ske_profile
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
    'app.ske_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_ske_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_ske_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ske_profile_authority;
ALTER FUNCTION revoke_agent_ske_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ske_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_ske_profile_authority;
GRANT SELECT ON
  agent_ske_profile,
  agent_ske_profile_enroll_rule
TO agent_ske_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ske_profile TO agent_ske_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_ske_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_ske_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ske_profile FROM PUBLIC;

CREATE INDEX agent_ske_session_work_idx ON agent_ske_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_ske_session_profile_idx ON agent_ske_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_ske_binding_certificate_idx ON agent_ske_enroll_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_ske_binding_receipt_idx ON agent_ske_enroll_binding (
  account_id, source_key_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_ske_catalog_ref_idx ON agent_ske_key_catalog (
  account_id, receipt_ref, sealed_at DESC, source_key_id
);
CREATE INDEX agent_ske_catalog_kind_idx ON agent_ske_key_catalog (
  account_id, source_key_kind, sealed_at DESC, source_key_id
);
CREATE INDEX agent_ske_evaluation_session_idx ON agent_ske_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_ske_certificate_session_idx ON agent_ske_enroll_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_ske_effect_work_idx ON agent_ske_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_ske_audit_time_idx ON agent_ske_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_ske_perception_status_idx ON agent_ske_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_ske_command_expiry_idx ON agent_ske_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_ske_invalidation_certificate_idx ON agent_ske_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_ske_authorization_evidence',
    'agent_ske_profile',
    'agent_ske_profile_enroll_rule',
    'agent_ske_key_catalog',
    'agent_ske_session',
    'agent_ske_nomination_key',
    'agent_ske_evaluation_receipt',
    'agent_ske_enroll_certificate',
    'agent_ske_enroll_binding',
    'agent_ske_invalidation',
    'agent_ske_effect_intent',
    'agent_ske_budget_ledger',
    'agent_ske_terminal_record',
    'agent_ske_command_result',
    'agent_ske_audit_head',
    'agent_ske_audit_event',
    'agent_ske_audit_anchor',
    'agent_ske_perception_snapshot',
    'agent_ske_projection_checkpoint'
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
single ACID row-store transaction with session CAS. Enroll-certificate
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

enum AgentSkeSessionStatus {
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

enum AgentSkeBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentSkeSourceKind {
  SEALED_REATTEST_CERTIFICATE
  SEALED_CLOCK_CERTIFICATE
  SUCCESSOR_KEY_CLAIM
  ROTATED_SIGNING_MATERIAL
}

enum AgentSkePlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentSkeKeyLifecycle {
  FIRST_ENROLLMENT
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentSkeClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentSkeAttestedKeyKind {
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentSkeEnrollKind {
  ENROLL_KEY_TO_CLOCK
  HOLD_UNKNOWN
  REJECT_UNATTESTED_CLOCK
  REJECT_INVENTED_HISTORY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentSkePurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentSkeEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentSkeNextAction {
  NOMINATE_SUCCESSOR_KEY
  EVALUATE_SUCCESSOR_KEY_ENROLLMENT
  SEAL_ENROLL_CERTIFICATE
  INVALIDATE_SUCCESSOR_KEY_ENROLLMENT
  PREPARE_ENROLL_EFFECT
  RESOLVE_ENROLL_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentSkeBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  KEY_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  UNATTESTED_CLOCK_DENIED
  INVENTED_HISTORY_DENIED
  HALT_ENROLL_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  UNBOUND_KEY_DENIED
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

enum AgentSkeUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_ENROLLMENT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentSkeInvalidationReason {
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

type AgentSkeBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  enrollUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
}

type AgentSkeProfile {
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

type AgentSkeSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentSkeSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentSkeBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentSkeNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  sourceKeyKind: AgentSkeSourceKind!
  placementKind: AgentSkePlacementKind!
  keyLifecycle: AgentSkeKeyLifecycle!
  clockLifecycle: AgentSkeClockLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentSkeEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  keySetHash: SHA256!
  clockSetHash: SHA256!
  watermarkSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentSkeCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  keySetHash: SHA256!
  clockSetHash: SHA256!
  watermarkSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentSkeBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  sourceKeyKind: AgentSkeSourceKind!
  bindingOrdinal: Int!
  status: AgentSkeBindingStatus!
  placementKind: AgentSkePlacementKind!
  keyLifecycle: AgentSkeKeyLifecycle!
  clockLifecycle: AgentSkeClockLifecycle!
  attestedKeyKind: AgentSkeAttestedKeyKind!
  enrollKind: AgentSkeEnrollKind!
  purposeRelation: AgentSkePurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  successorKeyHash: SHA256!
  clockAttestationHash: SHA256!
  sealedAt: DateTime!
}

type AgentSkeEffectObservation {
  effectId: ID!
  status: AgentSkeEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentSkePerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentSkeSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  enrollKeyToClockBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectUnattestedClockBindingCount: Int!
  rejectInventedHistoryBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentSkeEffectObservation!]!
  remainingBudget: AgentSkeBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentSkeNextAction!]!
  blockedReasons: [AgentSkeBlockedReason!]!
  cardHash: SHA256!
}

type AgentSkeMutationResult {
  decision: String!
  session: AgentSkeSession
  certificate: AgentSkeCertificate
  member: AgentSkeBinding
  receipt: AgentSkeNominationReceipt
  evaluation: AgentSkeEvaluationReceipt
  perception: AgentSkePerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentSkeBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  enrollUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
}

input CreateSuccessorKeyEnrollmentSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentSkeBudgetInput!
}

input NominateSuccessorKeyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceKeyId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluateSuccessorKeyEnrollmentInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedReceiptSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealEnrollCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedWatermarkSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateSuccessorKeyEnrollmentInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceKeyId: ID!
  reasonCode: AgentSkeInvalidationReason!
  idempotencyKey: String!
}

input PrepareEnrollEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveEnrollUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentSkeUncertaintyResolution!
  idempotencyKey: String!
}

input AgentSkeProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentSkeProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentSkeProfile
  agentSkeSession(accountId: ID!, sessionId: ID!): AgentSkeSession
  agentSkeEnrollCertificate(accountId: ID!, certificateId: ID!): AgentSkeCertificate
  agentSkePerceptionCard(accountId: ID!, sessionId: ID!): AgentSkePerceptionCard
  agentSkeNominatedKey(
    accountId: ID!
    sessionId: ID!
    sourceKeyId: ID!
  ): AgentSkeNominationReceipt
  agentSkeSearchProfiles(input: AgentSkeProfileSearchInput!): [AgentSkeProfile!]!
}

type Mutation {
  createSuccessorKeyEnrollmentSession(
    input: CreateSuccessorKeyEnrollmentSessionInput!
  ): AgentSkeMutationResult!
  nominateSuccessorKey(
    input: NominateSuccessorKeyInput!
  ): AgentSkeMutationResult!
  evaluateSuccessorKeyEnrollment(
    input: EvaluateSuccessorKeyEnrollmentInput!
  ): AgentSkeMutationResult!
  sealEnrollCertificate(input: SealEnrollCertificateInput!): AgentSkeMutationResult!
  invalidateSuccessorKeyEnrollment(
    input: InvalidateSuccessorKeyEnrollmentInput!
  ): AgentSkeMutationResult!
  prepareEnrollEffect(input: PrepareEnrollEffectInput!): AgentSkeMutationResult!
  resolveEnrollUncertainty(
    input: ResolveEnrollUncertaintyInput!
  ): AgentSkeMutationResult!
  closeSuccessorKeyEnrollmentSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentSkeMutationResult!
  approveSuccessorKeyEnrollmentProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentSkeMutationResult!
  revokeSuccessorKeyEnrollmentProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentSkeMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealEnrollCertificate` is rejected with `HISTORY_REWRITE_DENIED`
  when a nominated silent or unknown successor would evaluate to
  `ENROLL_KEY_TO_CLOCK`.
- `sealEnrollCertificate` is rejected with
  `UNATTESTED_CLOCK_DENIED` when a nominated `UNATTESTED` clock
  would evaluate to `ENROLL_KEY_TO_CLOCK`.
- `sealEnrollCertificate` is rejected with `INVENTED_HISTORY_DENIED`
  when a nominated key that invents history would evaluate to
  `ENROLL_KEY_TO_CLOCK`.
- `sealEnrollCertificate` is rejected with `HALT_ENROLL_DENIED`
  when a nominated halted, extended-halt, or omitted key would evaluate
  to `ENROLL_KEY_TO_CLOCK`.
- `evaluateSuccessorKeyEnrollment` is rejected with
  `PURPOSE_AMPLIFICATION_DENIED` when the requested purpose would amplify a
  key attenuation hash.
- Successor enrollment that would restore a halted body or invent a winner
  is rejected with `SUCCESSOR_LEAK_DENIED`.

## 10. Procedural memory

Approved enroll profiles are procedural memory: versioned instructions
for how sealed successor keys and attested successor clocks become
envelope-scoped enrollment bindings without inventing a
winner and without rewriting historical silence as success. Procedure refs
may point to successor-containment playbook steps. Profiles are immutable
after approval; agents perceive `procedureTags` and `allowedNextActions` on
perception cards, never inventing enroll policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which enroll profile
fits incident hop-attenuated successor-key enrollment?"). Embeddings
are account-owned and must be queried with `account_id` equality. The
reference schema stores vectors but does **not** create a cross-tenant HNSW
index; production builds account-partitioned HNSW segments.

Semantic retrieval may return enroll profiles only. It never authorizes
nominate, evaluate, seal, or enroll. Vector `topK` is budgeted and
clamped.

```sql
CREATE TABLE agent_ske_profile_embedding (
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
    REFERENCES agent_ske_profile (account_id, profile_id, profile_version)
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
enroll-key-to-clock / hold-unknown / reject-unattested-clock / invented-history /
unknown / skipped / invalidated binding counts, uncertain notify intents,
remaining budgets, procedure tags, allowed next actions, and blocked
reasons. Summary text is `UntrustedText`. Cards never embed raw private
keys or redacted fact bodies. `cardHash` makes perception replayable.
Agents perceive `ENROLL_KEY_TO_CLOCK` as a trusted key bound to an
attested clock that still cannot invent a winner, `HOLD_UNKNOWN` as a
bounded uncertainty window, `REJECT_UNATTESTED_CLOCK` as a trusted
negative for a key that predates clock attestation, `REJECT_INVENTED_HISTORY`
as a trusted refusal of a key that predates the first attested sample,
and `SKIP` as a sealed refusal — never as a key that "must have been
enrolled before the first clock sample."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, enroll-certificate
seals, and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed enroll
certificates but are not authoritative for enroll-key-to-clock,
hold-unknown, or reject-unattested-clock outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Notify dispatch and key-enrollment side-effects are not silently
ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on enrollments per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/ENROLL.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped key-catalog, clock-catalog, working-set,
  grant-graph, citation, quarantine-ledger, or board scans as **FULL SCAN
  REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board mutations from
  halted slots, unattested clocks, or unbound keys.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding enrollable keys by scanning the receipt or working-set
  ledger (rejected; nominate by `(account_id, source_key_id)`).
- Evaluating an enrollment by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  receipt-keyed active binding indexes).

### Required access paths

- Key nomination: PK `(account_id, source_key_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/receipt: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/key-catalog/clock-catalog/quarantine-ledger/citation
scan is **FULL SCAN REJECTED** before execution.

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
- Historical silence invented as enroll-key-to-clock: history-rewrite fence.
- Key bound to an unattested clock kept as trusted: unattested-clock
  fence.
- Key that invents history earlier than the first attested sample:
  invented-history fence.
- Halt leak of frozen bodies into enroll-key-to-clock: halt-enroll fence.
- Key that restores a halted body or invents a winner:
  successor-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot enrollment: certificates bind receipt
  and watermark sets, never `resolved_fact_hash`.
- Silent notify or successor-clock success: `UNKNOWN_EFFECT` until ACK.
- Recursive key-catalog or board storms: budget and **FULL SCAN
  REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- History-rewrite rejection, unattested-clock rejection,
  invented-history rejection, halt-enroll rejection, purpose-amplification
  rejection, successor-leak rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow enrollment

Compile profiles and validate key nomination without durable
certificates.

### Phase 2: reject-unattested-clock and skip only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT`
keys as `REJECT_UNATTESTED_CLOCK` or `SKIP`. Enroll-key-to-clock stays
closed.

### Phase 3: trusted enrollment and halt-enroll fences

Enable budgeted `ENROLL_KEY_TO_CLOCK` from `RESTORED_WITHOUT_WINNER`
keys with `TRUSTED_ENROLLED` or `TRUSTED_WITHIN_SKEW` clocks only.

### Phase 4: notify uncertainty

Enable enrollment notify intents with `UNKNOWN_EFFECT` reconciliation and
`HOLD_UNKNOWN` that cannot invent enrollment trust from silence.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`ENROLL_KEY_TO_CLOCK` only for attested clocks that cannot rewrite
historical silence as success.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, history-rewrite,
  purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed key material point lookup and hash match.
- Evaluate binds key set and attenuation under budget.
- Seal is rejected when silence would become enroll-key-to-clock, and never
  invents a winning fact hash.
- Enroll-certificate seal binds immutable bindings under key-set,
  clock-set, watermark-set, and attenuation hashes — never a winner
  hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed enroll certificates after process
  restart.

## 21. Product decision

Adopt the Successor-Key Enrollment Attestation Plane as the deterministic
enrollment path for rotated signing keys bound by the Successor-Clock
Re-Attestation, Watermark-Clock Attestation, and Provider-Key Rotation
planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the
   post-reattestation key-enrollment gap without history rewrite,
   unattested-clock leak, invented-history leak, halt leak, purpose
   amplification, invented winners, or key-catalog scans.
2. Account-leading indexes, history-rewrite and purpose-amplification
   fences, and **FULL SCAN REJECTED** planner rules protect 99.99% neighbor
   latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile
   discovery, perception cards, and hash-chained audit replay make the
   plane agent-ready without putting probabilistic AI inside the data
   engine.
