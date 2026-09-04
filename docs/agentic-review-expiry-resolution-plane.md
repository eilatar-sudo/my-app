# mondayDB Agentic Review-Expiry Resolution Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-04.v1`

## 1. Why this plane, before how

A sealed Containment-Expiry Review certificate can
dual-control `REVIEW_EXPIRED_CONTAINMENT` or seal
`REVIEW_EXPIRED` when the review window closes
without two distinct review stewards. It does not decide
**how an expired, unanswered, or single-control review
is resolved** — without scanning every review binding,
rewriting review-expiry silence into
`TRUSTED_ENROLLED`, or treating a closed review
window as confirmation.

Without a review-expiry resolution plane, operators
and agents either:

- scan every pending review, containment, resolution,
  escalation, acknowledgement, page, and vote ledger
  looking for "who still has not dual-control resolved
  the expired review" (neighbor-harmful on boards
  with 1M+ rows), or
- treat review-expiry silence as retroactive engine
  truth, so a closed review window is rewritten as
  confirmation, historical `UNKNOWN_EFFECT` is rewritten
  as `ACKED`, a silent resolution auto-promotes
  `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`, a halt-scoped
  body is "unlocked" by later resolution, and hop-
  attenuated purpose is amplified back to the donor.

The product trade-off is **resolution fluency versus
resolution isolation**:

- Treating every expired review, freeze timeout, or
  review timer as implicit confirmation maximizes
  agent fluency and reduces re-planning cost, but creates
  history-rewrite invention, review-expiry-as-confirmation,
  expired-review-as-trust, silence-success, first-
  enrollment auto-trust, unauditable resolution storms,
  and recursive review-ledger walks against neighbors.
- Binding a sealed resolution certificate under an
  approved resolution profile, review-catalog point
  lookups, history-rewrite fences, silence-success
  fences, first-enrollment auto-trust fences, review-
  expiry-as-confirmation fences, expired-review-as-
  trust fences, halt-resolve fences, purpose-amplification
  fences, successor-leak fences, prior-review-steward-
  exclusion fences, ledger-scan fences, and steward
  budgets adds one bounded evaluate transaction and
  short-lived resolution storage.
- Semantic similarity may discover resolution profiles,
  but it must never decide whether a sealed review,
  containment, resolution, escalation, acknowledgement, SLO,
  window, TTL, or confirm certificate may be nominated, a
  resolution snapshot refreshed, a certificate sealed, or
  a first-enrollment key trusted.

The recommended model keeps the data plane deterministic:

1. An approved resolution profile defines allowed source
   kinds, resolution-window duration, dual-control
   resolution-steward policy, prior-review-steward
   exclusion, and notify policy. Evaluation **never**
   invents a winning fact hash and **never** rewrites an
   expired review into `TRUSTED_ENROLLED`.
2. A resolution session opens under purpose, budget, and
   authorization fences, and only nominates sealed
   review certificates, sealed containment
   certificates, sealed resolution certificates, sealed
   escalation certificates, sealed acknowledgement
   certificates, sealed SLO certificates, sealed window
   certificates, sealed TTL certificates, sealed confirm
   certificates, or first-enrollment claims by point
   lookup from the Containment-Expiry Review,
   Resolution-Expiry Containment, Review-Resolution,
   Unanswered-Containment Review,
   Unanswered-Escalation Containment, Unanswered-Ack
   Escalation, SLO Ack Suppression, Remaining-Window SLO,
   Confirmation-Window Observability, Confirmation-TTL
   Retirement, and First-Enrollment Confirmation planes.
3. mondayDB evaluates a resolution whose kind is a pure
   function of `(source_window_kind, placement_kind,
   key_lifecycle, clock_lifecycle, attested_key_kind,
   requested_purpose_hash, attenuation_hash, hop_count,
   remaining_ttl_ms, extend_budget_remaining, expire_at,
   now_attested, ttl_expired, review_count,
   distinct_review_steward_count,
   prior_review_steward_set_hash,
   resolution_steward_count, resolution_window_ms,
   resolution_kind)`. Silence cannot become historical
   success. An expired review seals
   `REJECT_EXPIRY_AS_CONFIRMATION` or
   `RESOLUTION_EXPIRED` only — never `TRUSTED_ENROLLED`.
   Dual-control `RESOLVE_EXPIRED_REVIEW` resolves an
   expired review page for a first-enrollment key after
   `REVIEW_EXPIRED` without inventing confirmation.
   `HOLD_RESOLUTION_WINDOW` holds further resolution for
   a bounded window without restoring a winner. Halted
   slots cannot become resolution-restored winners.
   Original review stewards are excluded from the
   resolution-steward pair.
4. Sealing a resolution certificate binds
   `consumer_ref + purpose_hash + window_set_hash +
   clock_set_hash + remaining_set_hash + attenuation_hash`.
   The certificate **must not** emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
   Observation of `UNKNOWN_EFFECT` remains uncertain until a
   trusted refresh or resolution vote arrives.
6. Unscoped key-catalog, clock-catalog, confirm-ledger, vote-
   ledger, TTL-ledger, page-ledger, ack-ledger, escalation-
   ledger, containment-ledger, review-ledger,
   resolution-ledger, working-set, grant-graph, or board
   scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "re-resolve every expired
review forever" or "treat review-expiry silence
as confirmation until it looks like success" loops are
rejectable before they scan boards with 1M+ rows. Perception
is restored by sealed resolution certificates, not by magic
resolution orchestration inside the engine.

### Product outcome

For any review-expiry-resolution evaluation,
mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, resolution refresh, evaluate, seal,
  invalidate, or notify dispatch?
- Which nominated review certificates, placement kinds,
  hop counts, attenuation hashes, remaining-set hashes,
  prior-review-steward exclusions, and resolution kinds were
  bound?
- Is the resolution certificate still current, invalidated,
  resolved, hold-windowed, resolution-expired, or awaiting
  notify acknowledgement?
- Did async notify or first-enrollment sync become
  `UNKNOWN_EFFECT`?
- Can the resolution history be replayed without invoking an
  LLM?

## 2. Scope and ownership

The Review-Expiry Resolution Plane owns:

1. Immutable approved resolution profiles as procedural
   memory of "how expired reviews are dual-control resolved
   for a first-enrollment key without amplifying purpose,
   leaking halted facts, rewriting attested history,
   scanning vote, page, ack, escalation, review,
   resolution, or containment ledgers, or inventing
   `TRUSTED_ENROLLED` from review-expiry silence."
2. Tenant-scoped resolution sessions with purpose and budget
   fences.
3. Deterministic nomination of sealed review
   certificates, sealed containment certificates, sealed
   resolution certificates, sealed escalation
   certificates, sealed acknowledgement certificates,
   sealed SLO certificates, sealed window certificates,
   sealed TTL certificates, confirm certificates, and
   first-enrollment claims by point lookup — never
   key-catalog, vote-ledger, TTL-ledger, page-ledger,
   ack-ledger, escalation-ledger, review-ledger,
   containment-ledger, working-set, or board scans.
4. Deterministic resolution snapshots, evaluation receipts,
   sealed resolution certificates, and immutable
   resolution bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded
   resolution budgets.

It integrates with, but does not replace:

- **Containment-Expiry Review:** supplies sealed
  review certificates whose `REVIEW_EXPIRED`,
  unanswered, or single-control outcomes this plane may
  resolve. This plane never invents a new review by
  walking review bindings.
- **Resolution-Expiry Containment:** supplies sealed
  containment certificates whose unanswered, expired, or
  single-control freezes this plane may bind as
  resolution evidence. This plane never invents a new
  containment by walking containment bindings.
- **Review-Resolution:** supplies sealed
  resolution certificates whose unanswered, expired, or
  single-control steward outcomes this plane may bind as
  review evidence. This plane never invents a new
  resolution by walking resolution bindings.
- **Unanswered-Containment Review:** supplies sealed
  review certificates whose unanswered, expired, or
  single-control steward pages this plane may bind as
  review evidence. This plane never invents a new
  review by walking review bindings.
- **Unanswered-Escalation Containment:** supplies sealed
  containment certificates whose unanswered, expired, or
  single-control freezes this plane may bind. This plane
  never invents a new containment by walking containment
  bindings.
- **Unanswered-Ack Escalation:** supplies sealed escalation
  certificates whose unanswered, expired, or single-control
  escalations this plane may bind as resolution evidence. This
  plane never invents a new escalation by walking
  escalation bindings.
- **SLO Ack Suppression:** supplies sealed acknowledgement
  certificates whose unanswered acknowledgements this plane
  may bind as resolution evidence. This plane never invents
  a new acknowledgement by walking ack bindings.
- **Remaining-Window SLO:** supplies sealed SLO certificates
  and page bindings whose operator pages this plane may bind
  as resolution evidence. This plane never invents a new
  page by walking page bindings.
- **Confirmation-Window Observability:** supplies sealed
  window certificates whose remaining-window perception this
  plane may bind as resolution evidence. This plane never
  computes remaining TTL by walking review bindings.
- **Confirmation-TTL Retirement:** supplies sealed TTL
  certificates whose remaining window, extend budget, and
  retire kind this plane may bind. This plane never retires
  or extends a key; it may resolve an expired review only
  through a sealed review certificate.
- **First-Enrollment Confirmation:** supplies sealed confirm
  certificates and pending first-enrollment nominations
  whose remaining confirmation window this plane may
  resolve. This plane never dual-control confirms a key into
  `TRUSTED_ENROLLED`.
- **Successor-Key Enrollment / Successor-Clock Re-Attestation /
  Provider-Key Rotation:** supply sealed enroll, clock, and
  rotation claims that this plane may bind a resolution
  against. This plane never enrolls a key, attests a clock,
  or rotates signing material.
- **Certificate Placement / Envelope Purpose Gate / Decision
  Memory:** may consume sealed resolution certificates as
  perception evidence, not raw pager webhooks.
- **Executive Freeze / Thaw SLA:** halt/restore context that
  still forbids resolution-as-restore against a halted body.
  Thaw SLA decides freeze liveness; TTL retirement decides
  confirmation-vote liveness; observability decides
  remaining-window perception; ack suppression decides
  acknowledgement suppression; unanswered-ack escalation
  decides higher-authority paging; containment-expiry
  review decides first-enrollment review pages; this plane
  decides review-expiry resolution.
- **Emergency Containment:** the coarse stop/drain path used
  when a resolved key evaluates to `SKIP` or
  `HOLD_RESOLUTION_WINDOW`; this plane is purpose-scoped
  steward resolution isolation, not workspace-wide
  containment.
- **Query Governor / Budgets:** reserves nominate, evaluate,
  vector, seal, invalidate, and resolve units.

### Non-goals

- Letting an LLM decide that an expired review "feels
  confirmable enough" or "feels resolved enough."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative resolution certificates from
  columnar or vector projections.
- Cross-account resolution or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted plaintext.
- Claiming distributed atomicity with external pager or
  time-distribution providers.
- Inventing a winning fact hash when a review goes
  unanswered after a restored slot.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED` because
  a review was unanswered, resolved, held, or expired.
- Scanning vote, TTL, page, ack, escalation, review, or
  containment ledgers to decide who may resolve.
- Letting the original dual-control review stewards
  also serve as the resolution-steward pair.

## 3. Product contract

### 3.1 Resolution profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_REVIEW_CERTIFICATE`,
  `SEALED_CONTAINMENT_CERTIFICATE`,
  `SEALED_ESCALATION_CERTIFICATE`, `SEALED_ACK_CERTIFICATE`,
  `SEALED_SLO_CERTIFICATE`, `SEALED_TTL_CERTIFICATE`,
  `SEALED_CONFIRM_CERTIFICATE`, `FIRST_ENROLLMENT_CLAIM`);
- review-window buckets (`resolution_window_ms`), max
  refresh count, evaluate threshold (distinct review-
  steward principals for `RESOLVE_EXPIRED_REVIEW`,
  minimum 2), max bindings per certificate, and max
  nominated windows;
- review policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`, `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `EXPIRY_NEVER_CONFIRMS`, `EXPIRED_CONTAINMENT_NEVER_TRUSTS`,
  `LEDGER_NEVER_SCANNED`, `HALT_DENIES_REVIEW_RESTORE`,
  `PURPOSE_NARROW_ONLY`, `SUCCESSOR_NEVER_RESTORES_WINNER`,
  `PRIOR_REVIEW_STEWARD_NEVER_REVIEWS`);
- purpose attenuation rules (narrowing only; never
  amplification);
- allowed review kinds (`RESOLUTION_CURRENT`,
  `RESOLUTION_ACTIVE`, `RESOLUTION_EXPIRED`,
  `RESOLVE_EXPIRED_REVIEW`, `HOLD_RESOLUTION_WINDOW`,
  `HOLD_UNKNOWN`, `REJECT_EXPIRY_AS_CONFIRMATION`,
  `SKIP`) and notify policy after seal, invalidation, or
  upstream key or clock change;
- optional procedural refs for "how to review unanswered
  containments without inventing a winner."

Only `APPROVED` versions are discoverable or executable.

### 3.2 Session contract

A session opens under an approved profile, purpose hash,
budget reservations, and authorization evidence. Duplicate
`(account_id, idempotency_key)` is rejected. Nomination is
source-window point lookup against the review catalog.
Refresh review-expiry-resolution is a point lookup
against the nominated sealed certificate — never a ledger
scan.

### 3.3 Evaluate and certificate contract

Evaluate is a pure function of nominated windows,
resolution snapshots, clock lifecycles, retire kinds,
dual-control review-steward counts, prior-containment-
steward exclusion, and purpose relation. It never walks
catalogs.
Seal binds window-set, clock-set, remaining-set, and
attenuation hashes. The certificate must not store
`reviewed_fact_hash`. An expired containment cannot
evaluate to a kind that implies `TRUSTED_ENROLLED`.

### 3.4 Invalidation and effect contract

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Observation of
unknown remaining time remains `HOLD_UNKNOWN` until a
trusted refresh arrives.

### 3.5 Availability contract

Open, nominate, refresh, evaluate, seal, and perception p99
latency stay inside the 99.99% control-plane budget.
Neighbor boards with 1M+ rows are protected by **FULL SCAN
REJECTED** planner rules and resolve-unit budgets.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set
   `app.account_id` before query.
2. Profiles start as `DRAFT` and become `APPROVED` only
   through an authority-fenced approval function.
3. Sealed profile definitions and containment rules are
   immutable.
4. Binding identity
   (`source_window_id`, `disputed_fact_hash`,
   `attenuation_hash`, `binding_ordinal`,
   `remaining_set_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers;
   amplification is rejected.
6. Window nomination uses point lookup by
   `(account_id, source_window_id)` — never full key-catalog,
   vote-ledger, TTL-ledger, page-ledger, ack-ledger,
   escalation-ledger, review-ledger, or board scans.
7. Notify intents start as `PREPARED` and may become
   `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never
   authorizes nominate/refresh/evaluate/seal/review.
10. Silence and unknown windows cannot evaluate to
    `RESOLVE_EXPIRED_REVIEW` or any kind that implies
    `TRUSTED_ENROLLED` (history-rewrite and silence-success
    fences).
11. Halted, extended-halt, and omitted windows cannot
    evaluate to a containment kind that restores a winner
    (halt-resolve fence).
12. Requested purposes that amplify a window attenuation
    hash are rejected (purpose-amplification fence).
13. Successor review cannot emit a winning fact hash or
    restore a halted body (successor-leak fence).
14. An expired containment never writes
    `attested_key_kind = TRUSTED_ENROLLED`
    (review-expiry-as-confirmation and unanswered-containment-
    as-trust fences).
15. `RESOLVE_EXPIRED_REVIEW` requires two distinct
    review-steward principals who are not the
    nominating principal and are not members of the prior-
    containment-authority set.
16. Resolution certificates bind window set, clock set,
    remaining set, and attenuation hashes; they never invent
    a winning fact hash.
17. Plans that require unscoped board, session, working-set,
    grant-graph, key-catalog, clock-catalog, confirm-ledger,
    vote-ledger, TTL-ledger, page-ledger, ack-ledger,
    escalation-ledger, review-ledger, containment-ledger, or citation-ledger scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate containment rules. Approval
validates definition hash, requires at least one review
rule, requires `evaluate_threshold >= 2`, requires
`resolution_window_ms > 0`, and fences the status
transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash,
budget reservations, and authorization evidence. The session
starts `OPEN` with `state_revision = 0`. Duplicate
`(account_id, idempotency_key)` is rejected.

### 5.3 Nominate, refresh, and evaluate

Nominate performs a point lookup on the review catalog
and writes an immutable nomination receipt with
`remaining_ttl_ms` copied from the sealed source
certificate. Refresh review-expiry-resolution is a
point lookup against that same source — never a vote-ledger,
page-ledger, ack-ledger, escalation-ledger, or review-ledger walk. Evaluate
is a pure function of nominated windows, remaining-set
hashes, clock lifecycles, prior-review-steward exclusion, and
purpose relation. It never walks the catalog.

### 5.4 Seal resolution certificate

Seal binds the evaluation hashes to a consumer ref. The
certificate stores window-set, clock-set, remaining-set, and
attenuation hashes. It must not store `contained_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Dispatch never
scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one
containment rule. Approval is authority-fenced.

### 6.2 Session open

An authorized principal opens a session under the approved
version.

### 6.3 Nominating / refreshing / evaluating

The session moves `OPEN → NOMINATING → EVALUATING` by CAS.
Budgets decrement in the ledger. Containment snapshots are
append-only.

### 6.4 Sealed / invalidated

Seal moves the session to `SEALED`. Upstream revocation
writes an invalidation and may move bindings to
`INVALIDATED`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`,
and `UNKNOWN_EFFECT` are terminal. Terminal records are
append-only.

### 6.6 Retain

Audit events, certificates, and bindings retain for the
account's legal hold. Perception snapshots are derived and
may be compacted after Merkle anchor.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SourceWindowId = string & { readonly brand: "SourceWindowId" };
type EvaluationId = string & { readonly brand: "EvaluationId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type BindingId = string & { readonly brand: "BindingId" };
type SnapshotId = string & { readonly brand: "SnapshotId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SEALED_REVIEW_CERTIFICATE"
  | "REFRESH_REVIEW_EXPIRY"
  | "EVALUATE_REVIEW_EXPIRY"
  | "SEAL_RESOLUTION_CERTIFICATE"
  | "INVALIDATE_REVIEW_EXPIRY"
  | "PREPARE_RESOLUTION_EFFECT"
  | "RESOLUTION_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type ReviewExpiryResolutionBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "WINDOW_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "EXPIRY_AS_CONFIRMATION_DENIED"
  | "EXPIRED_REVIEW_AS_TRUST_DENIED"
  | "PRIOR_REVIEW_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "HALT_RESOLVE_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "UNBOUND_WINDOW_DENIED"
  | "UNATTESTED_CLOCK_DENIED"
  | "INVENTED_HISTORY_DENIED"
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

type SourceWindowKind =
  | "SEALED_TTL_CERTIFICATE"
  | "SEALED_CONFIRM_CERTIFICATE"
  | "FIRST_ENROLLMENT_CLAIM"
  | "SEALED_SLO_CERTIFICATE"
  | "SEALED_ACK_CERTIFICATE"
  | "SEALED_ESCALATION_CERTIFICATE"
  | "SEALED_RESOLUTION_CERTIFICATE"
  | "SEALED_REVIEW_CERTIFICATE"
  | "SEALED_CONTAINMENT_CERTIFICATE";

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

type ResolutionKind =
  | "RESOLUTION_CURRENT"
  | "RESOLUTION_ACTIVE"
  | "RESOLUTION_EXPIRED"
  | "RESOLVE_EXPIRED_REVIEW"
  | "HOLD_RESOLUTION_WINDOW"
  | "HOLD_UNKNOWN"
  | "REJECT_EXPIRY_AS_CONFIRMATION"
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

interface ReviewExpiryResolutionBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly resolveUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedWindows: number;
}

interface ReviewExpiryResolutionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly resolutionWindowMs: number;
  readonly maxRefreshCount: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedWindows: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ReviewExpiryResolutionSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ReviewExpiryResolutionBudget;
  readonly consumed: Omit<
    ReviewExpiryResolutionBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedWindows"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface WindowNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly sourceWindowKind: SourceWindowKind;
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
  readonly remainingTtlMs: number;
  readonly ttlExpired: boolean;
}

interface ReviewExpiryResolutionSnapshot {
  readonly accountId: AccountId;
  readonly snapshotId: SnapshotId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly remainingTtlMs: number;
  readonly extendBudgetRemaining: number;
  readonly snapshotHash: Sha256;
  readonly capturedAt: Timestamp;
}

interface ReviewExpiryResolutionEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly windowSetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly remainingSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface ReviewExpiryResolutionBinding {
  readonly accountId: AccountId;
  readonly bindingId: BindingId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly sourceWindowKind: SourceWindowKind;
  readonly bindingOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly resolutionKind: ResolutionKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly remainingSetHash: Sha256;
  readonly remainingTtlMs: number;
  readonly extendBudgetRemaining: number;
  readonly ttlExpired: boolean;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface ReviewExpiryResolutionCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly windowSetHash: Sha256;
  readonly clockSetHash: Sha256;
  readonly remainingSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ReviewExpiryResolutionEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentReviewExpiryResolutionPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly resolutionCurrentBindingCount: number;
  readonly resolutionActiveBindingCount: number;
  readonly resolutionExpiredBindingCount: number;
  readonly resolveExpiredReviewBindingCount: number;
  readonly holdResolutionWindowBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectExpiryAsConfirmationBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly ReviewExpiryResolutionEffectObservation[];
  readonly remainingBudget: Omit<
    ReviewExpiryResolutionBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedWindows"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ReviewExpiryResolutionBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateReviewExpiryResolutionSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ReviewExpiryResolutionBudget;
}

interface NominateSealedReviewCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface RefreshReviewExpiryResolutionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedRemainingSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateReviewExpiryResolutionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedWindowSetHash: Sha256;
  readonly expectedRemainingSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealResolutionCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedRemainingSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateReviewExpiryResolutionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceWindowId: SourceWindowId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareResolutionEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolutionEffectUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_WINDOW"
    | "ACCEPT_OBSERVATION"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseReviewExpiryResolutionSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ReviewExpiryResolutionDecision =
  | { readonly decision: "ALLOWED"; readonly session: ReviewExpiryResolutionSession;
      readonly certificate?: ReviewExpiryResolutionCertificate;
      readonly member?: ReviewExpiryResolutionBinding;
      readonly receipt?: WindowNominationReceipt;
      readonly snapshot?: ReviewExpiryResolutionSnapshot;
      readonly evaluation?: ReviewExpiryResolutionEvaluationReceipt;
      readonly perception: AgentReviewExpiryResolutionPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ReviewExpiryResolutionBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentReviewExpiryResolutionPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE rer_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE rer_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_source_kind AS ENUM (
  'SEALED_TTL_CERTIFICATE', 'SEALED_CONFIRM_CERTIFICATE',
  'FIRST_ENROLLMENT_CLAIM', 'SEALED_SLO_CERTIFICATE',
  'SEALED_ACK_CERTIFICATE', 'SEALED_ESCALATION_CERTIFICATE',
  'SEALED_RESOLUTION_CERTIFICATE', 'SEALED_REVIEW_CERTIFICATE', 'SEALED_CONTAINMENT_CERTIFICATE'
);
CREATE TYPE rer_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE rer_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_resolution_kind AS ENUM (
  'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLUTION_EXPIRED',
  'RESOLVE_EXPIRED_REVIEW', 'HOLD_RESOLUTION_WINDOW', 'HOLD_UNKNOWN',
  'REJECT_EXPIRY_AS_CONFIRMATION', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rer_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_rer_profile_authority NOLOGIN;

CREATE TABLE agent_rer_authorization_evidence (
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

CREATE TABLE agent_rer_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status rer_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  resolution_window_ms BIGINT NOT NULL
    CHECK (resolution_window_ms BETWEEN 1000 AND 2592000000),
  max_refresh_count SMALLINT NOT NULL
    CHECK (max_refresh_count BETWEEN 0 AND 16),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_windows SMALLINT NOT NULL
    CHECK (max_nominated_windows BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_EVALUATE', 'REQUIRE_REVIEW'
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
    REFERENCES agent_rer_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_rer_profile_resolution_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  resolution_window_ms BIGINT NOT NULL
    CHECK (resolution_window_ms BETWEEN 1000 AND 2592000000),
  require_dual_control_resolution BOOLEAN NOT NULL,
  resolution_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_rer_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_rer_review_catalog (
  account_id BIGINT NOT NULL,
  source_window_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_window_kind rer_source_kind NOT NULL,
  placement_kind rer_placement_kind NOT NULL,
  key_lifecycle rer_key_lifecycle NOT NULL,
  clock_lifecycle rer_clock_lifecycle NOT NULL,
  status rer_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  remaining_ttl_ms BIGINT NOT NULL CHECK (remaining_ttl_ms >= 0),
  extend_budget_remaining SMALLINT NOT NULL
    CHECK (extend_budget_remaining BETWEEN 0 AND 16),
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  enroll_sealed_at TIMESTAMPTZ,
  clock_attested_at TIMESTAMPTZ,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_window_id),
  UNIQUE (account_id, receipt_ref, source_window_kind)
);

CREATE TABLE agent_rer_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status rer_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_resolve_units BIGINT NOT NULL CHECK (budget_resolve_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_resolve_units BIGINT NOT NULL
    CHECK (consumed_resolve_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_windows SMALLINT NOT NULL
    CHECK (max_nominated_windows BETWEEN 1 AND 256),
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
    REFERENCES agent_rer_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_rer_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_resolve_units <= budget_resolve_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_rer_nomination_window (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind rer_source_kind NOT NULL,
  placement_kind rer_placement_kind NOT NULL,
  key_lifecycle rer_key_lifecycle NOT NULL,
  clock_lifecycle rer_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  remaining_ttl_ms BIGINT NOT NULL CHECK (remaining_ttl_ms >= 0),
  ttl_expired BOOLEAN NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_window_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rer_review_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rer_resolution_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  remaining_ttl_ms BIGINT NOT NULL CHECK (remaining_ttl_ms >= 0),
  extend_budget_remaining SMALLINT NOT NULL
    CHECK (extend_budget_remaining BETWEEN 0 AND 16),
  snapshot_hash CHAR(64) NOT NULL CHECK (length(snapshot_hash) = 64),
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  UNIQUE (account_id, session_id, source_window_id, snapshot_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rer_review_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rer_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  window_set_hash CHAR(64) NOT NULL CHECK (length(window_set_hash) = 64),
  clock_set_hash CHAR(64) NOT NULL
    CHECK (length(clock_set_hash) = 64),
  remaining_set_hash CHAR(64) NOT NULL
    CHECK (length(remaining_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id)
);

CREATE TABLE agent_rer_resolution_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  window_set_hash CHAR(64) NOT NULL CHECK (length(window_set_hash) = 64),
  clock_set_hash CHAR(64) NOT NULL
    CHECK (length(clock_set_hash) = 64),
  remaining_set_hash CHAR(64) NOT NULL
    CHECK (length(remaining_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  binding_watermark SMALLINT NOT NULL CHECK (binding_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_rer_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_rer_resolution_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind rer_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status rer_binding_status NOT NULL,
  placement_kind rer_placement_kind NOT NULL,
  key_lifecycle rer_key_lifecycle NOT NULL,
  clock_lifecycle rer_clock_lifecycle NOT NULL,
  attested_key_kind rer_attested_key_kind NOT NULL,
  resolution_kind rer_resolution_kind NOT NULL,
  purpose_relation rer_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  remaining_set_hash CHAR(64) NOT NULL
    CHECK (length(remaining_set_hash) = 64),
  remaining_ttl_ms BIGINT NOT NULL CHECK (remaining_ttl_ms >= 0),
  extend_budget_remaining SMALLINT NOT NULL
    CHECK (extend_budget_remaining BETWEEN 0 AND 16),
  ttl_expired BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_window_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_rer_resolution_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rer_review_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rer_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
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
    REFERENCES agent_rer_resolution_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rer_review_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rer_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status rer_effect_status NOT NULL,
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
    REFERENCES agent_rer_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_rer_resolution_certificate (account_id, certificate_id)
);

CREATE TABLE agent_rer_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'REVIEW'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id)
);

CREATE TABLE agent_rer_terminal_record (
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
    REFERENCES agent_rer_session (account_id, session_id)
);

CREATE TABLE agent_rer_command_result (
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

CREATE TABLE agent_rer_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_rer_audit_event (
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

CREATE TABLE agent_rer_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_rer_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status rer_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rer_session (account_id, session_id)
);

CREATE TABLE agent_rer_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_rer_profile()
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
       OR NEW.resolution_window_ms IS DISTINCT FROM OLD.resolution_window_ms
       OR NEW.max_refresh_count IS DISTINCT FROM OLD.max_refresh_count
       OR NEW.evaluate_threshold IS DISTINCT FROM OLD.evaluate_threshold
       OR NEW.max_bindings_per_certificate
         IS DISTINCT FROM OLD.max_bindings_per_certificate
       OR NEW.max_nominated_windows
         IS DISTINCT FROM OLD.max_nominated_windows
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
    IF current_setting('app.rer_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.rer_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_rer_profile_protect
BEFORE INSERT OR UPDATE ON agent_rer_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_rer_profile();

CREATE FUNCTION protect_agent_rer_profile_resolution_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status rer_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_rer_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile resolution rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_rer_profile_resolution_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_rer_profile_resolution_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_rer_profile_resolution_rule();

CREATE FUNCTION protect_agent_rer_resolution_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_snapshot$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'resolution snapshots are append-only';
  END IF;
  RETURN NEW;
END
$protect_snapshot$;

CREATE TRIGGER agent_rer_resolution_snapshot_protect
BEFORE INSERT OR UPDATE ON agent_rer_resolution_snapshot
FOR EACH ROW EXECUTE FUNCTION protect_agent_rer_resolution_snapshot();

CREATE FUNCTION protect_agent_rer_resolution_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_window_id IS DISTINCT FROM OLD.source_window_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.binding_ordinal IS DISTINCT FROM OLD.binding_ordinal
       OR NEW.source_window_kind IS DISTINCT FROM OLD.source_window_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.key_lifecycle IS DISTINCT FROM OLD.key_lifecycle
       OR NEW.clock_lifecycle IS DISTINCT FROM OLD.clock_lifecycle
       OR NEW.attested_key_kind
         IS DISTINCT FROM OLD.attested_key_kind
       OR NEW.resolution_kind IS DISTINCT FROM OLD.resolution_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.remaining_set_hash IS DISTINCT FROM OLD.remaining_set_hash
       OR NEW.remaining_ttl_ms IS DISTINCT FROM OLD.remaining_ttl_ms
       OR NEW.extend_budget_remaining
         IS DISTINCT FROM OLD.extend_budget_remaining
       OR NEW.ttl_expired IS DISTINCT FROM OLD.ttl_expired
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'resolution binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.resolution_kind IN (
       'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLUTION_EXPIRED',
       'RESOLVE_EXPIRED_REVIEW', 'REJECT_EXPIRY_AS_CONFIRMATION'
     )
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks resolution from rewriting confirmed trust';
  END IF;

  IF NEW.resolution_kind = 'REJECT_EXPIRY_AS_CONFIRMATION'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'review-expiry-as-confirmation fence blocks TRUSTED_ENROLLED from an expired review';
  END IF;

  IF NEW.resolution_kind = 'RESOLVE_EXPIRED_REVIEW'
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks resolution of silent or unknown successor';
  END IF;

  IF NEW.resolution_kind IN (
       'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLUTION_EXPIRED',
       'REJECT_EXPIRY_AS_CONFIRMATION'
     )
     AND NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from review-expiry-resolution';
  END IF;

  IF NEW.resolution_kind = 'RESOLVE_EXPIRED_REVIEW'
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks resolution against an unattested clock';
  END IF;

  IF NEW.resolution_kind IN (
       'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLUTION_EXPIRED', 'RESOLVE_EXPIRED_REVIEW'
     )
     AND NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks resolution for invented successor history';
  END IF;

  IF NEW.resolution_kind IN (
       'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLVE_EXPIRED_REVIEW'
     )
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'halt-resolve fence blocks resolution that would restore a halted key';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.resolution_kind IN (
       'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLVE_EXPIRED_REVIEW'
     )
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.resolution_kind IN (
       'RESOLUTION_CURRENT', 'RESOLUTION_ACTIVE', 'RESOLVE_EXPIRED_REVIEW'
     )
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose resolution after attenuation hops';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_rer_resolution_binding_protect
BEFORE INSERT OR UPDATE ON agent_rer_resolution_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_rer_resolution_binding();

CREATE FUNCTION protect_agent_rer_effect_intent()
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

CREATE TRIGGER agent_rer_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_rer_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_rer_effect_intent();

CREATE FUNCTION approve_agent_rer_profile(
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
  stored_status rer_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_rer_profile
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
  FROM agent_rer_profile_resolution_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one containment rule';
  END IF;

  PERFORM set_config(
    'app.rer_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_rer_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_rer_profile(
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
  stored_status rer_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_rer_profile
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
    'app.rer_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_rer_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_rer_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_rer_profile_authority;
ALTER FUNCTION revoke_agent_rer_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_rer_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_rer_profile_authority;
GRANT SELECT ON
  agent_rer_profile,
  agent_rer_profile_resolution_rule
TO agent_rer_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_rer_profile TO agent_rer_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_rer_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_rer_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_rer_profile FROM PUBLIC;

CREATE INDEX agent_rer_session_work_idx ON agent_rer_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_rer_session_profile_idx ON agent_rer_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_rer_binding_certificate_idx ON agent_rer_resolution_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_rer_binding_window_idx ON agent_rer_resolution_binding (
  account_id, source_window_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_rer_catalog_ref_idx ON agent_rer_review_catalog (
  account_id, receipt_ref, sealed_at DESC, source_window_id
);
CREATE INDEX agent_rer_catalog_kind_idx ON agent_rer_review_catalog (
  account_id, source_window_kind, sealed_at DESC, source_window_id
);
CREATE INDEX agent_rer_evaluation_session_idx ON agent_rer_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_rer_certificate_session_idx ON agent_rer_resolution_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_rer_snapshot_session_idx ON agent_rer_resolution_snapshot (
  account_id, session_id, captured_at DESC, snapshot_id
);
CREATE INDEX agent_rer_effect_work_idx ON agent_rer_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_rer_audit_time_idx ON agent_rer_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_rer_perception_status_idx ON agent_rer_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_rer_command_expiry_idx ON agent_rer_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_rer_invalidation_certificate_idx ON agent_rer_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_rer_authorization_evidence',
    'agent_rer_profile',
    'agent_rer_profile_resolution_rule',
    'agent_rer_review_catalog',
    'agent_rer_session',
    'agent_rer_nomination_window',
    'agent_rer_resolution_snapshot',
    'agent_rer_evaluation_receipt',
    'agent_rer_resolution_certificate',
    'agent_rer_resolution_binding',
    'agent_rer_invalidation',
    'agent_rer_effect_intent',
    'agent_rer_budget_ledger',
    'agent_rer_terminal_record',
    'agent_rer_command_result',
    'agent_rer_audit_head',
    'agent_rer_audit_event',
    'agent_rer_audit_anchor',
    'agent_rer_perception_snapshot',
    'agent_rer_projection_checkpoint'
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

Open, nominate, refresh, evaluate, seal, invalidate, and
effect-prepare each run in a single ACID row-store transaction
with session CAS. Containment-certificate seal never joins a columnar
rebuild or HNSW mutation.

### 8.2 Tenant isolation

Forced RLS on every table uses `app.account_id`. Composite
primary keys and every access index lead with `account_id`.
Missing tenant context yields no rows, not a cross-tenant scan.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API.
Long-running notify work returns durable state, not a synchronous
board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentRerSessionStatus {
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

enum AgentRerBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentRerSourceKind {
  SEALED_TTL_CERTIFICATE
  SEALED_CONFIRM_CERTIFICATE
  FIRST_ENROLLMENT_CLAIM
  SEALED_SLO_CERTIFICATE
  SEALED_ACK_CERTIFICATE
  SEALED_ESCALATION_CERTIFICATE
  SEALED_RESOLUTION_CERTIFICATE
  SEALED_REVIEW_CERTIFICATE
  SEALED_CONTAINMENT_CERTIFICATE
}

enum AgentRerPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentRerKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentRerClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentRerAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentRerResolutionKind {
  RESOLUTION_CURRENT
  RESOLUTION_ACTIVE
  RESOLUTION_EXPIRED
  RESOLVE_EXPIRED_REVIEW
  HOLD_RESOLUTION_WINDOW
  HOLD_UNKNOWN
  REJECT_EXPIRY_AS_CONFIRMATION
  SKIP
  UNKNOWN_EFFECT
}

enum AgentRerPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentRerEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentRerNextAction {
  NOMINATE_SEALED_REVIEW_CERTIFICATE
  REFRESH_REVIEW_EXPIRY
  EVALUATE_REVIEW_EXPIRY
  SEAL_RESOLUTION_CERTIFICATE
  INVALIDATE_REVIEW_EXPIRY
  PREPARE_RESOLUTION_EFFECT
  RESOLUTION_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentRerBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  WINDOW_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  EXPIRY_AS_CONFIRMATION_DENIED
  EXPIRED_REVIEW_AS_TRUST_DENIED
  PRIOR_REVIEW_STEWARD_EXCLUSION_DENIED
  LEDGER_SCAN_DENIED
  HALT_RESOLVE_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  UNBOUND_WINDOW_DENIED
  UNATTESTED_CLOCK_DENIED
  INVENTED_HISTORY_DENIED
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

enum AgentRerUncertaintyResolution {
  RETRY_SAME_WINDOW
  ACCEPT_OBSERVATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentRerInvalidationReason {
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

type AgentRerBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  resolveUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
}

type AgentRerProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  resolutionWindowMs: Long!
  maxRefreshCount: Int!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentRerSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentRerSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentRerBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentRerNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentRerSourceKind!
  placementKind: AgentRerPlacementKind!
  keyLifecycle: AgentRerKeyLifecycle!
  clockLifecycle: AgentRerClockLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
  expiresAt: DateTime!
  remainingTtlMs: Long!
  ttlExpired: Boolean!
}

type AgentRerReviewExpiryResolutionSnapshot {
  accountId: ID!
  snapshotId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  remainingTtlMs: Long!
  extendBudgetRemaining: Int!
  snapshotHash: SHA256!
  capturedAt: DateTime!
}

type AgentRerEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  windowSetHash: SHA256!
  clockSetHash: SHA256!
  remainingSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentRerResolutionCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  windowSetHash: SHA256!
  clockSetHash: SHA256!
  remainingSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentRerBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentRerSourceKind!
  bindingOrdinal: Int!
  status: AgentRerBindingStatus!
  placementKind: AgentRerPlacementKind!
  keyLifecycle: AgentRerKeyLifecycle!
  clockLifecycle: AgentRerClockLifecycle!
  attestedKeyKind: AgentRerAttestedKeyKind!
  resolutionKind: AgentRerResolutionKind!
  purposeRelation: AgentRerPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  remainingSetHash: SHA256!
  remainingTtlMs: Long!
  extendBudgetRemaining: Int!
  ttlExpired: Boolean!
  expiresAt: DateTime!
  sealedAt: DateTime!
}

type AgentRerEffectObservation {
  effectId: ID!
  status: AgentRerEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentRerPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentRerSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  resolutionCurrentBindingCount: Int!
  resolutionActiveBindingCount: Int!
  resolutionExpiredBindingCount: Int!
  resolveExpiredReviewBindingCount: Int!
  holdResolutionWindowBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectExpiryAsConfirmationBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentRerEffectObservation!]!
  remainingBudget: AgentRerBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentRerNextAction!]!
  blockedReasons: [AgentRerBlockedReason!]!
  cardHash: SHA256!
}

type AgentRerMutationResult {
  decision: String!
  session: AgentRerSession
  certificate: AgentRerResolutionCertificate
  member: AgentRerBinding
  receipt: AgentRerNominationReceipt
  snapshot: AgentRerReviewExpiryResolutionSnapshot
  evaluation: AgentRerEvaluationReceipt
  perception: AgentRerPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentRerBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  resolveUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
}

input CreateReviewExpiryResolutionSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentRerBudgetInput!
}

input NominateSealedReviewCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input RefreshReviewExpiryResolutionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedRemainingSetHash: SHA256!
  idempotencyKey: String!
}

input EvaluateReviewExpiryResolutionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedWindowSetHash: SHA256!
  expectedRemainingSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealResolutionCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedRemainingSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateReviewExpiryResolutionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceWindowId: ID!
  reasonCode: AgentRerInvalidationReason!
  idempotencyKey: String!
}

input PrepareResolutionEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolutionEffectUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentRerUncertaintyResolution!
  idempotencyKey: String!
}

input AgentRerProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentRerProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentRerProfile
  agentRerSession(accountId: ID!, sessionId: ID!): AgentRerSession
  agentRerResolutionCertificate(accountId: ID!, certificateId: ID!): AgentRerResolutionCertificate
  agentRerPerceptionCard(accountId: ID!, sessionId: ID!): AgentRerPerceptionCard
  agentRerNominatedWindow(
    accountId: ID!
    sessionId: ID!
    sourceWindowId: ID!
  ): AgentRerNominationReceipt
  agentRerSearchProfiles(input: AgentRerProfileSearchInput!): [AgentRerProfile!]!
}

type Mutation {
  createReviewExpiryResolutionSession(
    input: CreateReviewExpiryResolutionSessionInput!
  ): AgentRerMutationResult!
  nominateSealedReviewCertificate(
    input: NominateSealedReviewCertificateInput!
  ): AgentRerMutationResult!
  refreshReviewExpiryResolution(
    input: RefreshReviewExpiryResolutionInput!
  ): AgentRerMutationResult!
  evaluateReviewExpiryResolution(
    input: EvaluateReviewExpiryResolutionInput!
  ): AgentRerMutationResult!
  sealResolutionCertificate(input: SealResolutionCertificateInput!): AgentRerMutationResult!
  invalidateReviewExpiryResolution(
    input: InvalidateReviewExpiryResolutionInput!
  ): AgentRerMutationResult!
  prepareResolutionEffect(input: PrepareResolutionEffectInput!): AgentRerMutationResult!
  resolutionEffectUncertainty(
    input: ResolutionEffectUncertaintyInput!
  ): AgentRerMutationResult!
  closeReviewExpiryResolutionSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentRerMutationResult!
  approveReviewExpiryResolutionProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentRerMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealResolutionCertificate` is rejected with `HISTORY_REWRITE_DENIED` when
  remaining TTL would invent `TRUSTED_ENROLLED`, with
  `EXPIRY_AS_CONFIRMATION_DENIED` when an expired containment is treated as confirmation, and with
  `LEDGER_SCAN_DENIED` when remaining time would be computed by walking
  a vote, TTL, page, ack, escalation, or review ledger.

## 10. Procedural memory

Approved resolution profiles are procedural memory:
versioned instructions for how sealed containment,
resolution, review, escalation, acknowledgement, SLO,
window, TTL, and confirm certificates become envelope-
scoped first-enrollment steward resolutions without inventing a
winner and without rewriting an expired containment as
dual-control success or `TRUSTED_ENROLLED`.
Procedure refs may point to successor-review playbook
steps. Profiles are immutable after approval; agents
perceive `procedureTags` and `allowedNextActions` on
perception cards, never inventing review policy from
embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which
resolution profile fits incident hop-attenuated first-
enrollment expired containment?"). Embeddings are
account-owned and must be queried with `account_id`
equality. The reference schema stores vectors but does
**not** create a cross-tenant HNSW index; production builds
account-partitioned HNSW segments.

Semantic retrieval may return resolution profiles only. It
never authorizes nominate, refresh, evaluate, seal, or
resolve. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_rer_profile_embedding (
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
    REFERENCES agent_rer_profile (account_id, profile_id, profile_version)
);
```

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- only inside an account-partitioned table/segment. Never build one global
-- HNSW across tenants. Reference validation intentionally omits HNSW DDL.
-- ANN queries must include account_id equality before topK.
```

## 12. Agent perception

Agents receive perception cards summarizing session status,
sealed / resolution-current / resolution-active /
resolution-expired / resolve-expired-review /
hold-resolution-window / hold-unknown /
reject-expiry-as-confirmation / unknown / skipped /
invalidated binding counts, uncertain notify intents,
remaining budgets, procedure tags, allowed next actions, and
blocked reasons. Summary text is `UntrustedText`. Cards
never embed raw private keys or redacted fact bodies.
`cardHash` makes perception replayable. Agents perceive
`RESOLUTION_CURRENT` as a first-seen expired containment
whose review window is still open and still cannot
invent a winner, `RESOLUTION_ACTIVE` as a bounded steward
page whose remaining time is below the profile
threshold without confirmation, `RESOLUTION_EXPIRED` as a
sealed review that the window closed without dual-
control trust, `RESOLVE_EXPIRED_REVIEW` as a dual-
control expired-containment review that does not confirm the key,
`HOLD_RESOLUTION_WINDOW` as a trusted hold that refuses
silent confirmation, `HOLD_UNKNOWN` as a bounded uncertainty
window, `REJECT_EXPIRY_AS_CONFIRMATION` as a trusted
negative for an expired containment that would have
rewritten silence as success, and `SKIP` as a sealed
refusal — never as a key that "must have been trusted
because nobody reviewed the expired containment."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, containment snapshots,
evaluation receipts, containment-certificate seals, and
audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed
containment certificates but are not authoritative for
contain-current, contain-active, or reject-
review-expiry-as-confirmation outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable
profile approval events; staleness is visible via source
watermarks.

### External tools

Notify dispatch and first-enrollment side-effects are not
silently ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on containments per certificate and
  per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/REVIEW.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped key-catalog, clock-catalog,
  working-set, grant-graph, citation, confirm-ledger,
  vote-ledger, TTL-ledger, page-ledger, ack-ledger,
  escalation-ledger, review-ledger, or board scans as **FULL SCAN
  REJECTED**.
- Emergency containment may quarantine sessions without
  scanning neighbors.
- Evaluation never auto-restores neighbor-visible board
  mutations from halted slots, expired votes, unanswered
  acknowledgements, expired containments, or unbound
  windows.
- Prior-escalator exclusion rejects original dual-control
  containment authorities as the review-steward pair.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding remaining expired containments to resolve by
  scanning the confirmation-vote, TTL-retirement, page,
  ack, or escalation ledger (rejected; nominate by
  `(account_id, source_window_id)`).
- Evaluating a containment by walking all notify intents for
  an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account
  (rejected; use receipt-keyed active binding indexes).

### Required access paths

- Window nomination: PK `(account_id, source_window_id)`.
- review-expiry-resolution refresh: unique
  `(account_id, session_id, source_window_id, snapshot_hash)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/window: composite indexes leading
  with `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or
requiring an unscoped board/working-set/grant-graph/key-
catalog/clock-catalog/confirm-ledger/vote-ledger/TTL-ledger/
page-ledger/ack-ledger/escalation-ledger/review-ledger/containment-ledger/citation scan is
**FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay
reconstructs session, containment snapshot, evaluation, and
certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced
  RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must
  narrow relative to containment and session purposes.
- Sticky first-containment success after supersession:
  invalidation + re-evaluate + notify uncertainty + profile
  revocation.
- Historical silence invented as `TRUSTED_ENROLLED` from an
  expired containment: history-rewrite, silence-success,
  and expired-review-as-trust fences.
- First-enrollment key auto-promoted to `TRUSTED_ENROLLED`
  by a containment: first-enrollment-auto-trust and
  review-expiry-as-confirmation fences.
- Remaining time or containment targets computed by walking
  vote, TTL, page, ack, escalation, review, or containment ledgers: ledger-scan
  fence and **FULL SCAN REJECTED**.
- Halt leak of frozen bodies into review-as-restore:
  halt-resolve fence.
- Containment that restores a halted body or invents a
  winner: successor-leak fence.
- Hop leak of donor purpose after attenuation hops:
  hop-leak fence.
- Inventing a winner under restored-slot containment:
  certificates bind receipt and remaining sets, never
  `contained_fact_hash`.
- Original containment authorities serving as the review-steward
  pair: prior-review-steward-exclusion fence.
- Silent notify or first-enrollment success:
  `UNKNOWN_EFFECT` until ACK.
- Recursive window-catalog or board storms: budget and
  **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced
  approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/refresh/evaluate/seal/perception p99 latency
  budgets for 99.99% control-plane availability.
- History-rewrite rejection, silence-success rejection,
  first-enrollment-auto-trust rejection, resolution-as-
  confirmation rejection, ledger-scan rejection, halt-
  contain rejection, purpose-amplification rejection,
  successor-leak rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection
  counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow resolution

Compile profiles and validate review-catalog nomination
without durable certificates.

### Phase 2: reject-review-expiry-as-confirmation and skip only

Allow sealed certificates from nominated `HALTED` and
`EXTENDED_HALT` windows as
`REJECT_EXPIRY_AS_CONFIRMATION` or `SKIP`.
Containment-active stays closed.

### Phase 3: expire-only resolution and halt-resolve fences

Enable budgeted `RESOLUTION_EXPIRED` from
`RESTORED_WITHOUT_WINNER` windows with `ttl_expired = true`
and `AWAITING_CONFIRMATION` only. An expired containment
never writes `TRUSTED_ENROLLED`.

### Phase 4: resolution-expired-resolution resolutions and notify uncertainty

Enable `RESOLUTION_CURRENT` / `RESOLUTION_ACTIVE` under
point-lookup refresh and confirmation notify intents with
`UNKNOWN_EFFECT` reconciliation and `HOLD_UNKNOWN` that
cannot invent confirmation trust from an unanswered
escalation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor
budgets, including resolution-expired-resolution resolutions only for
first-enrollment keys that cannot rewrite an unanswered
escalation as success and cannot auto-trust from review
silence.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability,
  history-rewrite, purpose-amplification, and effect start
  state.

### Behavioral validation

- Nominate requires sealed review-catalog material point
  lookup and hash match.
- Refresh review-expiry-resolution is a point
  lookup and never a vote-ledger, page-ledger, ack-ledger,
  or escalation-ledger scan.
- Evaluate binds window set, remaining set, and attenuation
  under budget and prior-review-steward exclusion.
- Seal is rejected when an expired containment would
  become `TRUSTED_ENROLLED`, when a containment is treated
  as confirmation, or when remaining time would be computed
  by scanning ledgers, and never invents a winning fact
  hash.
- Containment-certificate seal binds immutable bindings
  under window-set, clock-set, remaining-set, and
  attenuation hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/refresh/evaluate/seal path
  performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed containment certificates
  after process restart.

## 21. Product decision

Adopt the Review-Expiry Resolution Plane as the
deterministic steward-resolution path for expired, unanswered, or
single-control containment-expiry-review outcomes bound by the
Containment-Expiry Review, Resolution-Expiry Containment,
Review-Resolution, Unanswered-Containment Review,
Unanswered-Escalation Containment, Unanswered-Ack
Escalation, SLO Ack Suppression, Remaining-Window SLO,
Confirmation-Window Observability, Confirmation-TTL
Retirement, and First-Enrollment Confirmation planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while
   closing the post-review expiry gap without
   history rewrite, silence-success, first-enrollment auto-
   trust, review-expiry-as-confirmation, expired-
   review-as-trust, ledger scans, halt leak, purpose
   amplification, invented winners, prior-review-
   steward reuse, or vote/page/ack/escalation/containment/
   review/resolution-ledger walks.
2. Account-leading indexes, history-rewrite and purpose-
   amplification fences, and **FULL SCAN REJECTED** planner
   rules protect 99.99% neighbor latency on boards with 1M+
   rows.
3. Open API GraphQL, procedural memory, account-owned HNSW
   profile discovery, perception cards, and hash-chained
   audit replay make the plane agent-ready without putting
   probabilistic AI inside the data engine.
