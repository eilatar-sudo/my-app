# mondayDB Agentic Confirmation-TTL Retirement Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-25.v1`

## 1. Why this plane, before how

A sealed first-enrollment confirmation certificate can dual-control
confirm a first-seen signing key against an attested successor clock.
It does not decide **whether an unconfirmed nomination may expire** —
without scanning every pending confirmation vote, rewriting silence
into `TRUSTED_ENROLLED`, or inventing a winner from a clock timeout.

Without a confirmation-TTL retirement plane, operators and agents either:

- scan every pending first-enrollment vote looking for "which keys
  timed out" (neighbor-harmful on boards with 1M+ rows), or
- treat TTL expiry as retroactive engine truth, so historical
  `UNKNOWN_EFFECT` is rewritten as `ACKED`, a silent clock tick
  auto-promotes `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`, a halt-scoped
  body is "unlocked" by later retirement, and hop-attenuated purpose
  is amplified back to the donor.

The product trade-off is **retirement fluency versus retirement isolation**:

- Accepting every timeout immediately as implicit confirmation
  maximizes agent fluency and reduces re-planning cost, but creates
  history-rewrite invention, silence-success, first-enrollment
  auto-trust, unauditable retirement storms, and recursive
  confirmation-vote walks against neighbors.
- Binding a sealed retirement certificate under an approved TTL
  profile, key point lookups, history-rewrite fences, silence-success
  fences, first-enrollment auto-trust fences, premature-retire fences,
  self-extend fences, single-control-extend fences, halt-retire fences,
  purpose-amplification fences, successor-leak fences, and steward
  budgets adds one bounded evaluate transaction and short-lived
  retirement storage.
- Semantic similarity may discover TTL profiles, but it must never
  decide whether a pending key may be nominated, a TTL-extend vote
  recorded, a certificate sealed, or a notify dispatched.

The recommended model keeps the data plane deterministic:

1. An approved TTL profile defines allowed key kinds, default TTL,
   dual-control extend policy, and notify policy. Evaluation **never**
   invents a winning fact hash and **never** rewrites a historical
   key kind into `TRUSTED_ENROLLED` from silence.
2. A retirement session opens under purpose, budget, and authorization
   fences, and only nominates sealed confirm certificates,
   first-enrollment claims, successor-key claims, or rotated signing
   material by point lookup from the First-Enrollment Confirmation,
   Successor-Key Enrollment, Successor-Clock Re-Attestation, and
   Provider-Key Rotation planes.
3. mondayDB evaluates a retirement whose kind is a pure function of
   `(source_key_kind, placement_kind, key_lifecycle,
   clock_lifecycle, attested_key_kind, requested_purpose_hash,
   attenuation_hash, hop_count, confirmation_count,
   distinct_confirmer_count, extend_count, distinct_extender_count,
   self_extend, ttl_expired, expires_at, first_seen_at,
   nominated_at, default_ttl_ms, max_extend_count, now_attested)`.
   Silence cannot become historical success. Clock expiry seals
   `RETIRE_UNCONFIRMED` only — never `TRUSTED_ENROLLED`. Dual-control
   `EXTEND_TTL` re-arms the clock without inventing confirmation.
   Halted slots cannot become retirement-restored winners.
4. Sealing a TTL certificate binds
   `consumer_ref + purpose_hash + key_set_hash + clock_set_hash +
   ttl_set_hash + extender_set_hash + attenuation_hash`. The
   certificate **must not** emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may
   become `UNKNOWN_EFFECT` until acknowledged. Retirement of
   `UNKNOWN_EFFECT` remains uncertain until a trusted dual-control
   extend or contain vote arrives.
6. Unscoped key-catalog, clock-catalog, confirm-ledger, vote-ledger,
   working-set, grant-graph, or board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection:
recursive "re-judge every pending vote forever" or "keep every
unconfirmed signature until silence looks like success" loops are
rejectable before they scan boards with 1M+ rows. Perception is
restored by sealed TTL certificates, not by magic timeout
orchestration inside the engine.

### Product outcome

For any confirmation-TTL retirement evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination,
  extend vote, evaluate, seal, invalidate, or notify dispatch?
- Which nominated keys, placement kinds, hop counts, attenuation
  hashes, extender set hashes, TTL set hashes, and retire kinds
  were bound?
- Is the TTL certificate still current, invalidated, extended, or
  awaiting notify acknowledgement?
- Did async notify or first-enrollment sync become `UNKNOWN_EFFECT`?
- Can the retirement history be replayed without invoking an LLM?

## 2. Scope and ownership

The Confirmation-TTL Retirement Plane owns:

1. Immutable approved TTL profiles as procedural memory of "how an
   unconfirmed first-enrollment nomination expires, extends, or is
   contained without amplifying purpose, leaking halted facts,
   rewriting attested history, or inventing `TRUSTED_ENROLLED` from
   silence."
2. Tenant-scoped retirement sessions with purpose and budget fences.
3. Deterministic nomination of sealed keys, confirm certificates, and
   first-enrollment claims by point lookup — never key-catalog,
   vote-ledger, working-set, or board scans.
4. Deterministic TTL-extend votes from two distinct humans, evaluation
   receipts, sealed TTL certificates, and immutable retire bindings
   that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded retire budgets.

It integrates with, but does not replace:

- **First-Enrollment Confirmation:** supplies sealed confirm
  certificates and pending first-enrollment nominations whose
  unconfirmed keys this plane may retire, extend, or contain. This
  plane never dual-control confirms a key into `TRUSTED_ENROLLED`.
- **Successor-Key Enrollment / Successor-Clock Re-Attestation /
  Provider-Key Rotation:** supply sealed enroll, clock, and rotation
  claims that this plane may bind a retirement against. This plane
  never enrolls a key, attests a clock, or rotates signing material.
- **Key-Compromise Quarantine / Provider-Receipt Attestation:** supply
  historical receipt IDs whose trusted-at timestamps remain historical;
  this plane does not rewrite them as TTL-confirmed.
- **Envelope Tool-Effect Saga / Envelope Purpose Gate / Certificate
  Placement:** upstream hop-attenuated context that produced the keys
  now under TTL review.
- **Executive Freeze / Thaw SLA:** halt/restore context that still
  forbids retire-unconfirmed against a halted body as if it restored
  a winner. Thaw SLA decides freeze liveness; this plane decides
  confirmation-vote liveness.
- **Emergency Containment:** the coarse stop/drain path used when a
  contained key evaluates to `SKIP` or `CONTAIN_PENDING`; this plane
  is purpose-scoped retirement isolation, not workspace-wide
  containment.
- **Decision Memory:** may consume sealed TTL certificates as reuse
  evidence, not raw timeout webhooks.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector,
  seal, invalidate, and retire units.

### Non-goals

- Letting an LLM decide that a silent or expired key "feels
  confirmable enough."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative TTL certificates from columnar or
  vector projections.
- Cross-account confirmation-TTL retirement or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or redacted
  plaintext.
- Claiming distributed atomicity with external time-distribution
  providers.
- Inventing a winning fact hash when a first-enrollment key expires
  after a restored slot.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED` because a clock
  ticked.

## 3. Product contract

### 3.1 TTL profile contract

A profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_CONFIRM_CERTIFICATE`,
  `FIRST_ENROLLMENT_CLAIM`, `SUCCESSOR_KEY_CLAIM`,
  `ROTATED_SIGNING_MATERIAL`);
- default TTL (`default_ttl_ms`), max extend count, evaluate
  threshold (distinct human principals for `EXTEND_TTL`, minimum 2),
  max bindings per certificate, and max nominated keys;
- retire policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`, `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `PREMATURE_RETIRE_DENIED`, `SELF_NEVER_EXTENDS`,
  `SINGLE_CONTROL_NEVER_EXTENDS`, `HALT_DENIES_RETIRE_RESTORE`,
  `PURPOSE_NARROW_ONLY`, `SUCCESSOR_NEVER_RESTORES_WINNER`,
  `GRACE_SILENCE_NEVER_SUCCESS`, `SKEW_BOUND_NEVER_TRUSTED_BEYOND`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed retire kinds (`RETIRE_UNCONFIRMED`, `EXTEND_TTL`,
  `CONTAIN_PENDING`, `HOLD_UNKNOWN`, `REJECT_SILENCE_SUCCESS`, `SKIP`)
  and notify policy after seal, invalidation, or upstream key or
  clock change;
- optional procedural refs for "how to present unknown, expired, or
  contained truth without a winner."

Only `APPROVED` versions are discoverable or executable. Revocation
blocks new sessions; in-flight sessions follow the captured
revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures
policy and ACL revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command
idempotency key. State advances by compare-and-swap on
`state_revision`.

### 3.3 Evaluate and certificate contract

Nominating sealed key material returns a nomination receipt and a
deterministic `expires_at = nominated_at + default_ttl_ms`. Recording
a TTL-extend vote binds a distinct human principal to the session.
Evaluating a retirement binds each nominated key to a retire kind
that is compatible with the attested key kind, placement kind, key
lifecycle, clock lifecycle, TTL expiry, dual-control extend
threshold, self-extend exclusion, skew bound, and purpose relation.
Sealing a certificate binds
`consumer_ref + purpose_hash + key_set_hash + clock_set_hash +
ttl_set_hash + extender_set_hash + attenuation_hash`. Certificates
**must not** emit a `resolved_fact_hash` winner. Bindings compiled
from silence or unknown keys are rejected when the requested retire
kind is `EXTEND_TTL` (silence-success / history-rewrite fence).
Bindings compiled from `FIRST_ENROLLMENT` keys that would emit
`TRUSTED_ENROLLED` are rejected (first-enrollment-auto-trust fence).
Bindings compiled as `RETIRE_UNCONFIRMED` before `expires_at` are
rejected (premature-retire fence). Bindings compiled from an
extender who nominated the key or already voted are rejected
(self-extend fence). Bindings compiled as `EXTEND_TTL` with fewer
than two distinct extenders are rejected (single-control-extend
fence). Bindings compiled from halted, extended-halt, or omitted
keys are rejected when the requested retire kind would restore a
winner (halt-retire fence). Bindings that would amplify purpose
relative to the key attenuation hash are rejected
(purpose-amplification fence). Successor bindings that would emit a
winner or restore a halted body are rejected (successor-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream confirmation, rotation,
quarantine, placement, clock, or visibility revocation. Notify
intents start as `PREPARED`, may become `UNKNOWN_EFFECT` when the
successor provider does not acknowledge, and never invent success
from silence. Retirement of `UNKNOWN_EFFECT` remains
`UNKNOWN_EFFECT` until a trusted dual-control extend or contain
vote arrives.

### 3.5 Availability contract

TTL control-plane APIs target 99.99% availability for open,
nominate, vote, evaluate, seal, and perception reads. External
notify and successor-clock side-effects are best-effort and
surfaced as uncertainty rather than silent success. Retirement
evaluation must not silently restore neighbor-impacting board
mutations from halted slots, expired votes, or unbound keys.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set
   `app.account_id` before query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an
   authority-fenced approval function.
3. Sealed profile definitions and TTL rules are immutable.
4. Binding identity
   (`source_key_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `successor_key_hash`, `ttl_set_hash`,
   `extender_set_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification
   is rejected.
6. Key nomination uses point lookup by
   `(account_id, source_key_id)` — never full key-catalog, vote-ledger,
   or board scans.
7. Notify intents start as `PREPARED` and may become
   `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/vote/evaluate/seal/retire.
10. Silence and unknown keys cannot evaluate to `EXTEND_TTL` or any
    kind that implies `TRUSTED_ENROLLED` (history-rewrite and
    silence-success fences).
11. Halted, extended-halt, and omitted keys cannot evaluate to a
    retire kind that restores a winner (halt-retire fence).
12. Requested purposes that amplify a key attenuation hash are
    rejected (purpose-amplification fence).
13. Successor retirement cannot emit a winning fact hash or restore
    a halted body (successor-leak fence).
14. `RETIRE_UNCONFIRMED` requires `ttl_expired = true`
    (premature-retire fence) and never writes
    `attested_key_kind = TRUSTED_ENROLLED`.
15. `EXTEND_TTL` requires two distinct extenders who are not the
    nominating principal (self-extend and single-control-extend
    fences).
16. TTL certificates bind key set, clock set, TTL set, extender set,
    and attenuation hashes; they never invent a winning fact hash.
17. Plans that require unscoped board, session, working-set,
    grant-graph, key-catalog, clock-catalog, confirm-ledger,
    vote-ledger, or citation-ledger scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate TTL rules. Approval validates definition
hash, requires at least one TTL rule, requires
`evaluate_threshold >= 2`, requires `default_ttl_ms > 0`, and fences
the status transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash, budget
reservations, and authorization evidence. The session starts `OPEN`
with `state_revision = 0`. Duplicate `(account_id, idempotency_key)`
is rejected.

### 5.3 Nominate, vote, and evaluate

Nominate performs a point lookup on the key catalog and writes an
immutable nomination receipt with
`expires_at = nominated_at + default_ttl_ms`. Vote appends a
TTL-extend confirmation from a distinct human principal. Evaluate
is a pure function of nominated keys, extender set hashes, clock
lifecycles, TTL expiry, dual-control counts, and purpose relation.
It never walks the catalog.

### 5.4 Seal TTL certificate

Seal binds the evaluation hashes to a consumer ref. The certificate
stores key-set, clock-set, TTL-set, extender-set, and attenuation
hashes. It must not store `resolved_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is source-key keyed. Notify intents start `PREPARED`
and may become `UNKNOWN_EFFECT`. Dispatch never scans neighbor
boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one TTL rule.
Approval is authority-fenced.

### 6.2 Session open

An authorized principal opens a session under the approved version.

### 6.3 Nominating / voting / evaluating

The session moves `OPEN → NOMINATING → EVALUATING` by CAS. Budgets
decrement in the ledger. TTL-extend votes are append-only.

### 6.4 Sealed / invalidated

Seal moves the session to `SEALED`. Upstream revocation writes an
invalidation and may move bindings to `INVALIDATED`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`, and
`UNKNOWN_EFFECT` are terminal. Terminal records are append-only.

### 6.6 Retain

Audit events, certificates, and bindings retain for the account's
legal hold. Perception snapshots are derived and may be compacted
after Merkle anchor.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SourceKeyId = string & { readonly brand: "SourceKeyId" };
type EvaluationId = string & { readonly brand: "EvaluationId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type BindingId = string & { readonly brand: "BindingId" };
type VoteId = string & { readonly brand: "VoteId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_PENDING_CONFIRMATION_KEY"
  | "RECORD_TTL_EXTEND_VOTE"
  | "EVALUATE_CONFIRMATION_TTL"
  | "SEAL_TTL_CERTIFICATE"
  | "INVALIDATE_TTL_RETIREMENT"
  | "PREPARE_TTL_EFFECT"
  | "RESOLVE_TTL_UNCERTAINTY"
  | "CLOSE_SESSION";

type ConfirmationTtlRetirementBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "KEY_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "PREMATURE_RETIRE_DENIED"
  | "SELF_EXTEND_DENIED"
  | "SINGLE_CONTROL_EXTEND_DENIED"
  | "HALT_RETIRE_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "UNBOUND_KEY_DENIED"
  | "UNATTESTED_CLOCK_DENIED"
  | "INVENTED_HISTORY_DENIED"
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
  | "SEALED_CONFIRM_CERTIFICATE"
  | "FIRST_ENROLLMENT_CLAIM"
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
  | "CONFIRMED"
  | "MONOTONIC"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "UNKNOWN_EFFECT";

type ClockLifecycle =
  | "ATTESTED"
  | "UNATTESTED"
  | "UNKNOWN_EFFECT";

type AttestedKeyKind =
  | "AWAITING_CONFIRMATION"
  | "TRUSTED_ENROLLED"
  | "TRUSTED_WITHIN_SKEW"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "SILENCE"
  | "UNKNOWN_EFFECT";

type RetireKind =
  | "RETIRE_UNCONFIRMED"
  | "EXTEND_TTL"
  | "CONTAIN_PENDING"
  | "HOLD_UNKNOWN"
  | "REJECT_SILENCE_SUCCESS"
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

interface ConfirmationTtlRetirementBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly retireUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedKeys: number;
}

interface ConfirmationTtlRetirementProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly defaultTtlMs: number;
  readonly maxExtendCount: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedKeys: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ConfirmationTtlRetirementSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ConfirmationTtlRetirementBudget;
  readonly consumed: Omit<
    ConfirmationTtlRetirementBudget,
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
  readonly expiresAt: Timestamp;
  readonly ttlExpired: boolean;
}

interface TtlExtendVote {
  readonly accountId: AccountId;
  readonly voteId: VoteId;
  readonly sessionId: SessionId;
  readonly sourceKeyId: SourceKeyId;
  readonly extenderPrincipalId: string;
  readonly voteOrdinal: number;
  readonly voteHash: Sha256;
  readonly votedAt: Timestamp;
}

interface ConfirmationTtlRetirementEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly keySetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly ttlSetHash: Sha256;
  readonly extenderSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface ConfirmationTtlRetirementBinding {
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
  readonly retireKind: RetireKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly successorKeyHash: Sha256;
  readonly clockAttestationHash: Sha256;
  readonly ttlSetHash: Sha256;
  readonly confirmationCount: number;
  readonly distinctConfirmerCount: number;
  readonly extendCount: number;
  readonly distinctExtenderCount: number;
  readonly selfExtend: boolean;
  readonly ttlExpired: boolean;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface ConfirmationTtlRetirementCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly keySetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly ttlSetHash: Sha256;
  readonly extenderSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ConfirmationTtlRetirementEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentConfirmationTtlRetirementPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly retireUnconfirmedBindingCount: number;
  readonly extendTtlBindingCount: number;
  readonly containPendingBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectSilenceSuccessBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly ConfirmationTtlRetirementEffectObservation[];
  readonly remainingBudget: Omit<
    ConfirmationTtlRetirementBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedKeys"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ConfirmationTtlRetirementBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateConfirmationTtlRetirementSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ConfirmationTtlRetirementBudget;
}

interface NominatePendingConfirmationKeyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceKeyId: SourceKeyId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface RecordTtlExtendVoteInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceKeyId: SourceKeyId;
  readonly extenderPrincipalId: string;
  readonly idempotencyKey: string;
}

interface EvaluateConfirmationTtlInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedReceiptSetHash: Sha256;
  readonly expectedExtenderSetHash: Sha256;
  readonly expectedTtlSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealTtlCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedTtlSetHash: Sha256;
  readonly expectedExtenderSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateTtlRetirementInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceKeyId: SourceKeyId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareTtlEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveTtlUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_RETIREMENT"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseConfirmationTtlRetirementSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ConfirmationTtlRetirementDecision =
  | { readonly decision: "ALLOWED"; readonly session: ConfirmationTtlRetirementSession;
      readonly certificate?: ConfirmationTtlRetirementCertificate;
      readonly member?: ConfirmationTtlRetirementBinding;
      readonly receipt?: KeyNominationReceipt;
      readonly vote?: TtlExtendVote;
      readonly evaluation?: ConfirmationTtlRetirementEvaluationReceipt;
      readonly perception: AgentConfirmationTtlRetirementPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ConfirmationTtlRetirementBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentConfirmationTtlRetirementPerceptionCard;
      readonly auditHash: Sha256 };
```


## 8. SQL row-store schema

```sql
CREATE TYPE ctt_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE ctt_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_source_kind AS ENUM (
  'SEALED_CONFIRM_CERTIFICATE', 'FIRST_ENROLLMENT_CLAIM',
  'SUCCESSOR_KEY_CLAIM', 'ROTATED_SIGNING_MATERIAL'
);
CREATE TYPE ctt_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_retire_kind AS ENUM (
  'RETIRE_UNCONFIRMED', 'EXTEND_TTL', 'CONTAIN_PENDING', 'HOLD_UNKNOWN',
  'REJECT_SILENCE_SUCCESS', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ctt_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_ctt_profile_authority NOLOGIN;

CREATE TABLE agent_ctt_authorization_evidence (
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

CREATE TABLE agent_ctt_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status ctt_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  default_ttl_ms BIGINT NOT NULL
    CHECK (default_ttl_ms BETWEEN 1000 AND 2592000000),
  max_extend_count SMALLINT NOT NULL
    CHECK (max_extend_count BETWEEN 0 AND 16),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 2 AND 8),
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
    REFERENCES agent_ctt_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_ctt_profile_ttl_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  default_ttl_ms BIGINT NOT NULL
    CHECK (default_ttl_ms BETWEEN 1000 AND 2592000000),
  require_dual_control_extend BOOLEAN NOT NULL,
  ttl_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_ctt_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_ctt_key_catalog (
  account_id BIGINT NOT NULL,
  source_key_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_key_kind ctt_source_kind NOT NULL,
  placement_kind ctt_placement_kind NOT NULL,
  key_lifecycle ctt_key_lifecycle NOT NULL,
  clock_lifecycle ctt_clock_lifecycle NOT NULL,
  status ctt_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  first_seen_at TIMESTAMPTZ NOT NULL,
  enroll_sealed_at TIMESTAMPTZ,
  clock_attested_at TIMESTAMPTZ,
  max_skew_ms BIGINT NOT NULL CHECK (max_skew_ms BETWEEN 0 AND 86400000),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_key_id),
  UNIQUE (account_id, receipt_ref, source_key_kind)
);

CREATE TABLE agent_ctt_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status ctt_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_retire_units BIGINT NOT NULL CHECK (budget_retire_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_retire_units BIGINT NOT NULL
    CHECK (consumed_retire_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 2 AND 8),
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
    REFERENCES agent_ctt_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_ctt_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_retire_units <= budget_retire_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_ctt_nomination_key (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  source_key_kind ctt_source_kind NOT NULL,
  placement_kind ctt_placement_kind NOT NULL,
  key_lifecycle ctt_key_lifecycle NOT NULL,
  clock_lifecycle ctt_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ttl_expired BOOLEAN NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_key_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ctt_key_catalog (account_id, source_key_id),
  CHECK (expires_at > nominated_at)
);

CREATE TABLE agent_ctt_ttl_extend_vote (
  account_id BIGINT NOT NULL,
  vote_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  extender_principal_id TEXT NOT NULL,
  vote_ordinal SMALLINT NOT NULL CHECK (vote_ordinal BETWEEN 1 AND 8),
  vote_hash CHAR(64) NOT NULL CHECK (length(vote_hash) = 64),
  voted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, vote_id),
  UNIQUE (account_id, session_id, source_key_id, extender_principal_id),
  UNIQUE (account_id, session_id, source_key_id, vote_ordinal),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ctt_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_ctt_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  key_set_hash CHAR(64) NOT NULL CHECK (length(key_set_hash) = 64),
  clock_set_hash CHAR(64) NOT NULL
    CHECK (length(clock_set_hash) = 64),
  ttl_set_hash CHAR(64) NOT NULL CHECK (length(ttl_set_hash) = 64),
  extender_set_hash CHAR(64) NOT NULL
    CHECK (length(extender_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id)
);

CREATE TABLE agent_ctt_ttl_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  key_set_hash CHAR(64) NOT NULL CHECK (length(key_set_hash) = 64),
  clock_set_hash CHAR(64) NOT NULL
    CHECK (length(clock_set_hash) = 64),
  ttl_set_hash CHAR(64) NOT NULL CHECK (length(ttl_set_hash) = 64),
  extender_set_hash CHAR(64) NOT NULL
    CHECK (length(extender_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  binding_watermark SMALLINT NOT NULL CHECK (binding_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_ctt_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_ctt_retire_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_key_id UUID NOT NULL,
  source_key_kind ctt_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status ctt_binding_status NOT NULL,
  placement_kind ctt_placement_kind NOT NULL,
  key_lifecycle ctt_key_lifecycle NOT NULL,
  clock_lifecycle ctt_clock_lifecycle NOT NULL,
  attested_key_kind ctt_attested_key_kind NOT NULL,
  retire_kind ctt_retire_kind NOT NULL,
  purpose_relation ctt_purpose_relation NOT NULL,
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
  ttl_set_hash CHAR(64) NOT NULL CHECK (length(ttl_set_hash) = 64),
  confirmation_count SMALLINT NOT NULL
    CHECK (confirmation_count BETWEEN 0 AND 8),
  distinct_confirmer_count SMALLINT NOT NULL
    CHECK (distinct_confirmer_count BETWEEN 0 AND 8),
  extend_count SMALLINT NOT NULL
    CHECK (extend_count BETWEEN 0 AND 16),
  distinct_extender_count SMALLINT NOT NULL
    CHECK (distinct_extender_count BETWEEN 0 AND 8),
  self_extend BOOLEAN NOT NULL,
  ttl_expired BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_key_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ctt_ttl_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ctt_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_ctt_invalidation (
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
    REFERENCES agent_ctt_ttl_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_key_id)
    REFERENCES agent_ctt_key_catalog (account_id, source_key_id)
);

CREATE TABLE agent_ctt_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status ctt_effect_status NOT NULL,
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
    REFERENCES agent_ctt_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ctt_ttl_certificate (account_id, certificate_id)
);

CREATE TABLE agent_ctt_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'RETIRE'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id)
);

CREATE TABLE agent_ctt_terminal_record (
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
    REFERENCES agent_ctt_session (account_id, session_id)
);

CREATE TABLE agent_ctt_command_result (
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

CREATE TABLE agent_ctt_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_ctt_audit_event (
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

CREATE TABLE agent_ctt_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_ctt_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status ctt_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ctt_session (account_id, session_id)
);

CREATE TABLE agent_ctt_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_ctt_profile()
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
       OR NEW.default_ttl_ms IS DISTINCT FROM OLD.default_ttl_ms
       OR NEW.max_extend_count IS DISTINCT FROM OLD.max_extend_count
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
    IF current_setting('app.ctt_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.ctt_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_ctt_profile_protect
BEFORE INSERT OR UPDATE ON agent_ctt_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_ctt_profile();

CREATE FUNCTION protect_agent_ctt_profile_ttl_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status ctt_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_ctt_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile ttl rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_ctt_profile_ttl_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_ctt_profile_ttl_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_ctt_profile_ttl_rule();

CREATE FUNCTION protect_agent_ctt_ttl_extend_vote()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_vote$
DECLARE
  opener_principal TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ttl extend votes are append-only';
  END IF;

  SELECT principal_id INTO opener_principal
  FROM agent_ctt_session
  WHERE account_id = NEW.account_id
    AND session_id = NEW.session_id;

  IF opener_principal IS NOT DISTINCT FROM NEW.extender_principal_id THEN
    RAISE EXCEPTION 'self-extend fence blocks vote by nominating principal';
  END IF;

  RETURN NEW;
END
$protect_vote$;

CREATE TRIGGER agent_ctt_ttl_extend_vote_protect
BEFORE INSERT OR UPDATE ON agent_ctt_ttl_extend_vote
FOR EACH ROW EXECUTE FUNCTION protect_agent_ctt_ttl_extend_vote();

CREATE FUNCTION protect_agent_ctt_retire_binding()
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
       OR NEW.retire_kind IS DISTINCT FROM OLD.retire_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.successor_key_hash IS DISTINCT FROM OLD.successor_key_hash
       OR NEW.clock_attestation_hash
         IS DISTINCT FROM OLD.clock_attestation_hash
       OR NEW.ttl_set_hash IS DISTINCT FROM OLD.ttl_set_hash
       OR NEW.confirmation_count IS DISTINCT FROM OLD.confirmation_count
       OR NEW.distinct_confirmer_count
         IS DISTINCT FROM OLD.distinct_confirmer_count
       OR NEW.extend_count IS DISTINCT FROM OLD.extend_count
       OR NEW.distinct_extender_count
         IS DISTINCT FROM OLD.distinct_extender_count
       OR NEW.self_extend IS DISTINCT FROM OLD.self_extend
       OR NEW.ttl_expired IS DISTINCT FROM OLD.ttl_expired
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'retire binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.retire_kind = 'RETIRE_UNCONFIRMED'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks retirement from rewriting confirmed trust';
  END IF;

  IF NEW.retire_kind = 'RETIRE_UNCONFIRMED'
     AND NEW.ttl_expired IS NOT TRUE THEN
    RAISE EXCEPTION 'premature-retire fence blocks retirement before TTL expiry';
  END IF;

  IF NEW.retire_kind = 'EXTEND_TTL'
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks TTL extension of silent or unknown successor';
  END IF;

  IF NEW.retire_kind = 'EXTEND_TTL'
     AND NEW.distinct_extender_count < 2 THEN
    RAISE EXCEPTION 'single-control-extend fence blocks TTL extension below dual-control threshold';
  END IF;

  IF NEW.retire_kind = 'EXTEND_TTL'
     AND NEW.self_extend IS TRUE THEN
    RAISE EXCEPTION 'self-extend fence blocks TTL extension by a prior principal';
  END IF;

  IF NEW.retire_kind = 'RETIRE_UNCONFIRMED'
     AND NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from TTL expiry';
  END IF;

  IF NEW.retire_kind = 'EXTEND_TTL'
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks TTL extension against an unattested clock';
  END IF;

  IF NEW.retire_kind IN ('RETIRE_UNCONFIRMED', 'EXTEND_TTL')
     AND NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks retire for invented successor history';
  END IF;

  IF NEW.retire_kind = 'RETIRE_UNCONFIRMED'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'halt-retire fence blocks retirement that would restore a halted key';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.retire_kind = 'RETIRE_UNCONFIRMED'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.retire_kind = 'RETIRE_UNCONFIRMED'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose retire after attenuation hops';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_ctt_retire_binding_protect
BEFORE INSERT OR UPDATE ON agent_ctt_retire_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_ctt_retire_binding();

CREATE FUNCTION protect_agent_ctt_effect_intent()
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

CREATE TRIGGER agent_ctt_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_ctt_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_ctt_effect_intent();

CREATE FUNCTION approve_agent_ctt_profile(
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
  stored_status ctt_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ctt_profile
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
  FROM agent_ctt_profile_ttl_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one ttl rule';
  END IF;

  PERFORM set_config(
    'app.ctt_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_ctt_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_ctt_profile(
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
  stored_status ctt_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ctt_profile
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
    'app.ctt_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_ctt_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_ctt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ctt_profile_authority;
ALTER FUNCTION revoke_agent_ctt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ctt_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_ctt_profile_authority;
GRANT SELECT ON
  agent_ctt_profile,
  agent_ctt_profile_ttl_rule
TO agent_ctt_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ctt_profile TO agent_ctt_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_ctt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_ctt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ctt_profile FROM PUBLIC;

CREATE INDEX agent_ctt_session_work_idx ON agent_ctt_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_ctt_session_profile_idx ON agent_ctt_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_ctt_binding_certificate_idx ON agent_ctt_retire_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_ctt_binding_receipt_idx ON agent_ctt_retire_binding (
  account_id, source_key_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_ctt_catalog_ref_idx ON agent_ctt_key_catalog (
  account_id, receipt_ref, sealed_at DESC, source_key_id
);
CREATE INDEX agent_ctt_catalog_kind_idx ON agent_ctt_key_catalog (
  account_id, source_key_kind, sealed_at DESC, source_key_id
);
CREATE INDEX agent_ctt_evaluation_session_idx ON agent_ctt_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_ctt_certificate_session_idx ON agent_ctt_ttl_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_ctt_vote_session_idx ON agent_ctt_ttl_extend_vote (
  account_id, session_id, voted_at DESC, vote_id
);
CREATE INDEX agent_ctt_effect_work_idx ON agent_ctt_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_ctt_audit_time_idx ON agent_ctt_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_ctt_perception_status_idx ON agent_ctt_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_ctt_command_expiry_idx ON agent_ctt_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_ctt_invalidation_certificate_idx ON agent_ctt_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_ctt_authorization_evidence',
    'agent_ctt_profile',
    'agent_ctt_profile_ttl_rule',
    'agent_ctt_key_catalog',
    'agent_ctt_session',
    'agent_ctt_nomination_key',
    'agent_ctt_ttl_extend_vote',
    'agent_ctt_evaluation_receipt',
    'agent_ctt_ttl_certificate',
    'agent_ctt_retire_binding',
    'agent_ctt_invalidation',
    'agent_ctt_effect_intent',
    'agent_ctt_budget_ledger',
    'agent_ctt_terminal_record',
    'agent_ctt_command_result',
    'agent_ctt_audit_head',
    'agent_ctt_audit_event',
    'agent_ctt_audit_anchor',
    'agent_ctt_perception_snapshot',
    'agent_ctt_projection_checkpoint'
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

Open, nominate, vote, evaluate, seal, invalidate, and effect-prepare each run
in a single ACID row-store transaction with session CAS. TTL-certificate
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

enum AgentCttSessionStatus {
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

enum AgentCttBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentCttSourceKind {
  SEALED_CONFIRM_CERTIFICATE
  FIRST_ENROLLMENT_CLAIM
  SUCCESSOR_KEY_CLAIM
  ROTATED_SIGNING_MATERIAL
}

enum AgentCttPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentCttKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentCttClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentCttAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentCttRetireKind {
  RETIRE_UNCONFIRMED
  EXTEND_TTL
  CONTAIN_PENDING
  HOLD_UNKNOWN
  REJECT_SILENCE_SUCCESS
  SKIP
  UNKNOWN_EFFECT
}

enum AgentCttPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentCttEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentCttNextAction {
  NOMINATE_PENDING_CONFIRMATION_KEY
  RECORD_TTL_EXTEND_VOTE
  EVALUATE_CONFIRMATION_TTL
  SEAL_TTL_CERTIFICATE
  INVALIDATE_TTL_RETIREMENT
  PREPARE_TTL_EFFECT
  RESOLVE_TTL_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentCttBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  KEY_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  PREMATURE_RETIRE_DENIED
  SELF_EXTEND_DENIED
  SINGLE_CONTROL_EXTEND_DENIED
  HALT_RETIRE_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  UNBOUND_KEY_DENIED
  UNATTESTED_CLOCK_DENIED
  INVENTED_HISTORY_DENIED
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

enum AgentCttUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RETIREMENT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentCttInvalidationReason {
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

type AgentCttBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  retireUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
}

type AgentCttProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  defaultTtlMs: Long!
  maxExtendCount: Int!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentCttSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentCttSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentCttBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentCttNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  sourceKeyKind: AgentCttSourceKind!
  placementKind: AgentCttPlacementKind!
  keyLifecycle: AgentCttKeyLifecycle!
  clockLifecycle: AgentCttClockLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
  expiresAt: DateTime!
  ttlExpired: Boolean!
}

type AgentCttTtlExtendVote {
  accountId: ID!
  voteId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  extenderPrincipalId: ID!
  voteOrdinal: Int!
  voteHash: SHA256!
  votedAt: DateTime!
}

type AgentCttEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  keySetHash: SHA256!
  clockSetHash: SHA256!
  ttlSetHash: SHA256!
  extenderSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentCttCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  keySetHash: SHA256!
  clockSetHash: SHA256!
  ttlSetHash: SHA256!
  extenderSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentCttBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceKeyId: ID!
  sourceKeyKind: AgentCttSourceKind!
  bindingOrdinal: Int!
  status: AgentCttBindingStatus!
  placementKind: AgentCttPlacementKind!
  keyLifecycle: AgentCttKeyLifecycle!
  clockLifecycle: AgentCttClockLifecycle!
  attestedKeyKind: AgentCttAttestedKeyKind!
  retireKind: AgentCttRetireKind!
  purposeRelation: AgentCttPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  successorKeyHash: SHA256!
  clockAttestationHash: SHA256!
  ttlSetHash: SHA256!
  confirmationCount: Int!
  distinctConfirmerCount: Int!
  extendCount: Int!
  distinctExtenderCount: Int!
  selfExtend: Boolean!
  ttlExpired: Boolean!
  expiresAt: DateTime!
  sealedAt: DateTime!
}

type AgentCttEffectObservation {
  effectId: ID!
  status: AgentCttEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentCttPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentCttSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  retireUnconfirmedBindingCount: Int!
  extendTtlBindingCount: Int!
  containPendingBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectSilenceSuccessBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentCttEffectObservation!]!
  remainingBudget: AgentCttBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentCttNextAction!]!
  blockedReasons: [AgentCttBlockedReason!]!
  cardHash: SHA256!
}

type AgentCttMutationResult {
  decision: String!
  session: AgentCttSession
  certificate: AgentCttCertificate
  member: AgentCttBinding
  receipt: AgentCttNominationReceipt
  vote: AgentCttTtlExtendVote
  evaluation: AgentCttEvaluationReceipt
  perception: AgentCttPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentCttBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  retireUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedKeys: Int!
}

input CreateConfirmationTtlRetirementSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentCttBudgetInput!
}

input NominatePendingConfirmationKeyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceKeyId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input RecordTtlExtendVoteInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceKeyId: ID!
  extenderPrincipalId: ID!
  idempotencyKey: String!
}

input EvaluateConfirmationTtlInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedReceiptSetHash: SHA256!
  expectedExtenderSetHash: SHA256!
  expectedTtlSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealTtlCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedTtlSetHash: SHA256!
  expectedExtenderSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateTtlRetirementInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceKeyId: ID!
  reasonCode: AgentCttInvalidationReason!
  idempotencyKey: String!
}

input PrepareTtlEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveTtlUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentCttUncertaintyResolution!
  idempotencyKey: String!
}

input AgentCttProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentCttProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentCttProfile
  agentCttSession(accountId: ID!, sessionId: ID!): AgentCttSession
  agentCttTtlCertificate(accountId: ID!, certificateId: ID!): AgentCttCertificate
  agentCttPerceptionCard(accountId: ID!, sessionId: ID!): AgentCttPerceptionCard
  agentCttNominatedKey(
    accountId: ID!
    sessionId: ID!
    sourceKeyId: ID!
  ): AgentCttNominationReceipt
  agentCttSearchProfiles(input: AgentCttProfileSearchInput!): [AgentCttProfile!]!
}

type Mutation {
  createConfirmationTtlRetirementSession(
    input: CreateConfirmationTtlRetirementSessionInput!
  ): AgentCttMutationResult!
  nominatePendingConfirmationKey(
    input: NominatePendingConfirmationKeyInput!
  ): AgentCttMutationResult!
  recordTtlExtendVote(
    input: RecordTtlExtendVoteInput!
  ): AgentCttMutationResult!
  evaluateConfirmationTtl(
    input: EvaluateConfirmationTtlInput!
  ): AgentCttMutationResult!
  sealTtlCertificate(input: SealTtlCertificateInput!): AgentCttMutationResult!
  invalidateTtlRetirement(
    input: InvalidateTtlRetirementInput!
  ): AgentCttMutationResult!
  prepareTtlEffect(input: PrepareTtlEffectInput!): AgentCttMutationResult!
  resolveTtlUncertainty(
    input: ResolveTtlUncertaintyInput!
  ): AgentCttMutationResult!
  closeConfirmationTtlRetirementSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentCttMutationResult!
  approveConfirmationTtlRetirementProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentCttMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealTtlCertificate` is rejected with `HISTORY_REWRITE_DENIED` when
  expiry would invent `TRUSTED_ENROLLED`, with `PREMATURE_RETIRE_DENIED`
  when `ttl_expired` is false, and with `SILENCE_SUCCESS_DENIED` when
  silence would become an extend success.

## 10. Procedural memory

Approved TTL profiles are procedural memory: versioned instructions
for how sealed unconfirmed first-enrollment keys become
envelope-scoped retirement bindings without inventing a winner and
without rewriting historical silence as dual-control success or
`TRUSTED_ENROLLED`. Procedure refs may point to
successor-containment playbook steps. Profiles are immutable after
approval; agents perceive `procedureTags` and `allowedNextActions` on
perception cards, never inventing retire policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which TTL profile
fits incident hop-attenuated first-enrollment retirement?").
Embeddings are account-owned and must be queried with `account_id`
equality. The reference schema stores vectors but does **not** create
a cross-tenant HNSW index; production builds account-partitioned
HNSW segments.

Semantic retrieval may return TTL profiles only. It never authorizes
nominate, vote, evaluate, seal, or retire. Vector `topK` is budgeted
and clamped.

```sql
CREATE TABLE agent_ctt_profile_embedding (
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
    REFERENCES agent_ctt_profile (account_id, profile_id, profile_version)
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
retire-unconfirmed / extend-ttl / contain-pending / hold-unknown /
reject-silence-success / unknown / skipped / invalidated binding
counts, uncertain notify intents, remaining budgets, procedure tags,
allowed next actions, and blocked reasons. Summary text is
`UntrustedText`. Cards never embed raw private keys or redacted fact
bodies. `cardHash` makes perception replayable. Agents perceive
`RETIRE_UNCONFIRMED` as a first-seen key whose confirmation window
expired without dual-control trust and still cannot invent a winner,
`EXTEND_TTL` as a dual-control re-arm that does not confirm the key,
`CONTAIN_PENDING` as a trusted hold that refuses silent retirement,
`HOLD_UNKNOWN` as a bounded uncertainty window,
`REJECT_SILENCE_SUCCESS` as a trusted negative for a clock tick that
would have rewritten silence as success, and `SKIP` as a sealed
refusal — never as a key that "must have been trusted because the
TTL elapsed."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, TTL-extend votes, evaluation
receipts, TTL-certificate seals, and audit appends are ACID
transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed TTL
certificates but are not authoritative for retire-unconfirmed,
extend-ttl, or reject-silence-success outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile
approval events; staleness is visible via source watermarks.

### External tools

Notify dispatch and first-enrollment side-effects are not silently
ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on retirements per certificate and per
  session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/RETIRE.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped key-catalog, clock-catalog, working-set,
  grant-graph, citation, confirm-ledger, vote-ledger, or board scans
  as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning
  neighbors.
- Evaluation never auto-restores neighbor-visible board mutations
  from halted slots, expired votes, or unbound keys.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding expiring keys by scanning the confirmation-vote or
  working-set ledger (rejected; nominate by
  `(account_id, source_key_id)`).
- Evaluating a retirement by walking all notify intents for an
  account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account
  (rejected; use receipt-keyed active binding indexes).

### Required access paths

- Key nomination: PK `(account_id, source_key_id)`.
- Vote append: unique `(account_id, session_id, source_key_id,
  extender_principal_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/receipt: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an
unscoped board/working-set/grant-graph/key-catalog/clock-catalog/
confirm-ledger/vote-ledger/citation scan is **FULL SCAN REJECTED**
before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs
session, vote, evaluation, and certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced RLS and
  PK scope.
- Purpose amplification for consumers: attenuation hash must narrow
  relative to observation and session purposes.
- Sticky first-ACK success after supersession: invalidation +
  re-evaluate + notify uncertainty + profile revocation.
- Historical silence invented as `TRUSTED_ENROLLED` from TTL expiry:
  history-rewrite and silence-success fences.
- First-enrollment key auto-promoted to `TRUSTED_ENROLLED` by a clock
  tick: first-enrollment-auto-trust and premature-retire fences.
- Nominating principal extending their own TTL: self-extend fence.
- Single steward extending TTL: single-control-extend fence.
- Halt leak of frozen bodies into retire-as-restore: halt-retire
  fence.
- Key that restores a halted body or invents a winner:
  successor-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot retirement: certificates
  bind receipt, TTL, and extender sets, never `resolved_fact_hash`.
- Silent notify or first-enrollment success: `UNKNOWN_EFFECT` until
  ACK.
- Recursive key-catalog or board storms: budget and **FULL SCAN
  REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke
  only.

## 18. Observability and SLOs

- Open/nominate/vote/evaluate/seal/perception p99 latency budgets
  for 99.99% control-plane availability.
- History-rewrite rejection, silence-success rejection,
  first-enrollment-auto-trust rejection, premature-retire rejection,
  self-extend rejection, single-control-extend rejection,
  halt-retire rejection, purpose-amplification rejection,
  successor-leak rejection, and `UNKNOWN_EFFECT` rate as first-class
  metrics.
- Threshold-failure rejection and full-scan rejection counters per
  account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow retirement

Compile profiles and validate key nomination without durable
certificates.

### Phase 2: reject-silence-success and skip only

Allow sealed certificates from nominated `HALTED` and
`EXTENDED_HALT` keys as `REJECT_SILENCE_SUCCESS` or `SKIP`.
Retire-unconfirmed stays closed.

### Phase 3: expire-only retire and halt-retire fences

Enable budgeted `RETIRE_UNCONFIRMED` from
`RESTORED_WITHOUT_WINNER` keys with `ttl_expired = true` and
`AWAITING_CONFIRMATION` only. Clock expiry never writes
`TRUSTED_ENROLLED`.

### Phase 4: dual-control extend and notify uncertainty

Enable `EXTEND_TTL` under two distinct humans and confirmation
notify intents with `UNKNOWN_EFFECT` reconciliation and
`HOLD_UNKNOWN` that cannot invent confirmation trust from silence.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets,
including `RETIRE_UNCONFIRMED` only for first-enrollment keys that
cannot rewrite historical silence as success and cannot auto-trust
from a clock tick.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability,
  history-rewrite, purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed key material point lookup and hash match.
- Vote requires a distinct human principal who is not the session
  opener.
- Evaluate binds key set, TTL set, extender set, and attenuation
  under budget.
- Seal is rejected when silence would become `TRUSTED_ENROLLED`,
  when `RETIRE_UNCONFIRMED` is requested before `expires_at`, or
  when a nominating principal would extend their own TTL, and never
  invents a winning fact hash.
- TTL-certificate seal binds immutable bindings under key-set,
  clock-set, TTL-set, extender-set, and attenuation hashes — never
  a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/vote/evaluate/seal path performs a
  full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed TTL certificates after process
  restart.

## 21. Product decision

Adopt the Confirmation-TTL Retirement Plane as the deterministic
expiry path for unconfirmed first-enrollment keys bound by the
First-Enrollment Confirmation, Successor-Key Enrollment,
Successor-Clock Re-Attestation, and Provider-Key Rotation planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the
   post-confirmation liveness gap without history rewrite,
   silence-success, first-enrollment auto-trust, premature retire,
   self-extend leak, halt leak, purpose amplification, invented
   winners, or vote-ledger scans.
2. Account-leading indexes, history-rewrite and
   purpose-amplification fences, and **FULL SCAN REJECTED** planner
   rules protect 99.99% neighbor latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile
   discovery, perception cards, and hash-chained audit replay make
   the plane agent-ready without putting probabilistic AI inside
   the data engine.
