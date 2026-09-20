# mondayDB Agentic Cycle-Bound Terminal Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-20.v1`

## 1. Why this plane, before how

A first-enrollment key can now rotate through an unbounded
promotion → containment → review → resolution → expiry
nest. Each nested plane is locally correct: it never
rewrites silence into `TRUSTED_ENROLLED`, never invents a
winner hash, and never full-scans a ledger. Taken together,
the nest itself is a recursive neighbor-harmful walk.

The 2026-09-19 Promotion-Resolution-Containment-Resolution-
Containment-Resolution-Containment-Resolution-Containment-
Expiry Review Plane can dual-control page successor
stewards after `CONTAINMENT_EXPIRED`. It does not decide
**when the same first-enrollment key has already consumed
its cycle budget** — without scanning every vote, page,
ack, escalation, containment, review, resolution, or
promotion ledger, rewriting cycle silence into
`TRUSTED_ENROLLED`, treating another nested expiry as
progress, or restoring a halted fact as a winner.

The product trade-off is **cycle fluency versus cycle
isolation**:

- Letting agents keep opening another expiry-containment-
  review-resolution plane "until someone eventually
  confirms" maximizes fluency and reduces re-planning
  cost, but creates unbounded nesting, cycle-as-
  confirmation, expired-cycle-as-trust, silence-success,
  first-enrollment auto-trust, unauditable steward storms,
  and recursive ledger walks against neighbors.
- Binding a sealed terminal certificate under an approved
  terminal profile, a point-lookup cycle census, history-
  rewrite fences, silence-success fences, first-enrollment
  auto-trust fences, cycle-as-confirmation fences, nested-
  expiry fences, halt-terminal fences, purpose-
  amplification fences, successor-leak fences, prior-
  steward-exclusion fences, ledger-scan fences, and
  steward budgets adds one bounded evaluate transaction
  and short-lived terminal storage.
- Semantic similarity may discover terminal profiles, but
  it must never decide whether a sealed review, containment,
  resolution, promotion, escalation, acknowledgement, SLO,
  window, TTL, confirm, or first-enrollment claim may be
  nominated, a cycle census refreshed, a certificate
  sealed, or a first-enrollment key trusted.

The recommended model keeps the data plane deterministic:

1. An approved terminal profile defines allowed source
   kinds, `max_cycle_count` (the hard bound), dual-control
   terminal-steward policy, prior-steward exclusion, and
   notify policy. Evaluation **never** invents a winning
   fact hash and **never** rewrites cycle silence into
   `TRUSTED_ENROLLED`.
2. A terminal session opens under purpose, budget, and
   authorization fences, and only nominates sealed
   promotion-RC review certificates, sealed cycle-census
   snapshots, and first-enrollment claims by point lookup
   from the certificate catalog. Cycle count is read from
   the sealed census row — never computed by walking
   ledgers.
3. mondayDB evaluates a terminal whose kind is a pure
   function of `(source_window_kind, placement_kind,
   key_lifecycle, clock_lifecycle, attested_key_kind,
   requested_purpose_hash, attenuation_hash, hop_count,
   cycle_count, max_cycle_count, prior_steward_set_hash,
   terminal_steward_count, terminal_window_ms,
   terminal_kind)`. Silence cannot become historical
   success. When `cycle_count >= max_cycle_count`, a
   sealed certificate seals `REQUIRE_HUMAN` or
   `PERMANENT_QUARANTINE` only — never
   `TRUSTED_ENROLLED`, never another nested expiry. Dual-
   control `TERMINAL_REQUIRE_HUMAN` pages humans for a
   first-enrollment key after the cycle budget is
   exhausted. `REJECT_NESTED_EXPIRY` refuses to start
   another expiry-containment-review-resolution plane
   even when the census is still under bound.
4. Sealing a terminal certificate binds
   `consumer_ref + purpose_hash + window_set_hash +
   cycle_set_hash + remaining_set_hash + attenuation_hash`.
   The certificate **must not** emit a `terminated_fact_hash`.
5. Upstream invalidation marks certificates stale; notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped key-catalog, clock-catalog, confirm-ledger,
   vote-ledger, TTL-ledger, page-ledger, ack-ledger,
   escalation-ledger, containment-ledger, review-ledger,
   resolution-ledger, promotion-ledger, working-set,
   grant-graph, or board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "re-review every sealed governance
certificate forever" loops are rejectable before they scan
boards with 1M+ rows. Perception is restored by sealed
terminal certificates, not by magic cycle orchestration
inside the engine.

### Product outcome

For any cycle-bound terminal evaluation, mondayDB can
answer:

- Which profile, principal, and session authorized the
  nomination, census refresh, evaluate, seal, invalidate,
  or notify dispatch?
- Which nominated sealed certificates, placement kinds,
  hop counts, attenuation hashes, cycle-set hashes, prior-
  steward exclusions, and terminal kinds were bound?
- Is the terminal certificate still current, invalidated,
  require-human, permanently quarantined, or awaiting
  notify acknowledgement?
- Did async notify or first-enrollment sync become
  `UNKNOWN_EFFECT`?
- Can the terminal history be replayed without invoking an
  LLM?

## 2. Scope and ownership

The Cycle-Bound Terminal Plane owns:

1. Immutable approved terminal profiles as procedural
   memory of "how a first-enrollment key that has rotated
   the governance cycle `max_cycle_count` times is dual-
   control terminated without amplifying purpose, leaking
   halted facts, rewriting attested history, scanning
   vote, page, ack, escalation, review, resolution, or
   containment ledgers, or inventing `TRUSTED_ENROLLED`
   from cycle silence."
2. Tenant-scoped terminal sessions with purpose and budget
   fences.
3. Deterministic nomination of sealed promotion-RC review
   certificates, sealed cycle-census snapshots, sealed
   promotion, resolution, review, containment, escalation,
   acknowledgement, SLO, window, TTL, and confirm
   certificates, and first-enrollment claims by point
   lookup — never ledger or board scans.
4. Deterministic cycle-census snapshots, evaluation
   receipts, sealed terminal certificates, and immutable
   terminal bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded
   terminal budgets.

It integrates with, but does not replace:

- **Promotion-RC Resolution-Containment Review-Expiry
  Containment-Expiry Review:** supplies sealed review
  certificates and `CONTAINMENT_EXPIRED` steward pages
  this plane may terminate. This plane never invents a new
  review by walking review bindings.
- **Every prior nested expiry-containment-review-
  resolution plane:** supplies sealed certificates this
  plane may bind as cycle evidence. This plane never
  starts another nested expiry.
- **Decision-Memory Promotion / First-Enrollment
  Confirmation / Confirmation-TTL Retirement:** supply
  first-enrollment claims and confirmation windows. This
  plane never dual-control confirms a key into
  `TRUSTED_ENROLLED`.
- **Certificate Placement / Envelope Purpose Gate /
  Decision Memory:** may consume sealed terminal
  certificates as halt-aware working-set evidence. This
  plane never compiles a working set.
- **Emergency Containment:** the coarse stop/drain path
  used when a key evaluates to `PERMANENT_QUARANTINE`;
  this plane is purpose-scoped cycle isolation, not
  workspace-wide containment.
- **Query Governor / Budgets:** reserves nominate,
  evaluate, vector, seal, invalidate, and terminal units.

### Non-goals

- Letting an LLM decide that a cycle "feels confirmable
  enough" or "needs one more review."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative terminal certificates from
  columnar or vector projections.
- Cross-account termination or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted plaintext.
- Claiming distributed atomicity with external pager or
  time-distribution providers.
- Inventing a winning fact hash when a cycle closes.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`
  because a cycle was unanswered, contained, held, or
  expired.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to compute cycle
  count.
- Opening another nested expiry-containment-review-
  resolution plane after the cycle bound.
- Letting prior cycle stewards also serve as the terminal-
  steward pair.

## 3. Product contract

### 3.1 Terminal profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_CERT`,
  `SEALED_CYCLE_CENSUS`,
  `SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_RES_CONTAIN_CERT`,
  `SEALED_PROMOTION_CERTIFICATE`,
  `SEALED_RESOLUTION_CERTIFICATE`,
  `SEALED_REVIEW_CERTIFICATE`,
  `SEALED_CONTAINMENT_CERTIFICATE`,
  `SEALED_ESCALATION_CERTIFICATE`, `SEALED_ACK_CERTIFICATE`,
  `SEALED_SLO_CERTIFICATE`, `SEALED_TTL_CERTIFICATE`,
  `SEALED_CONFIRM_CERTIFICATE`, `FIRST_ENROLLMENT_CLAIM`);
- `max_cycle_count` (1–8; recommended 3), terminal-window
  buckets (`terminal_window_ms`), max refresh count,
  evaluate threshold (distinct terminal-steward principals
  for `TERMINAL_REQUIRE_HUMAN`, minimum 2), max bindings
  per certificate, and max nominated windows;
- terminal policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`, `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `CYCLE_NEVER_CONFIRMS`, `NESTED_EXPIRY_NEVER_OPENS`,
  `LEDGER_NEVER_SCANNED`, `HALT_DENIES_TERMINAL_RESTORE`,
  `PURPOSE_NARROW_ONLY`, `SUCCESSOR_NEVER_RESTORES_WINNER`,
  `PRIOR_STEWARD_NEVER_TERMINATES`);
- purpose attenuation rules (narrowing only; never
  amplification);
- allowed terminal kinds (`REQUIRE_HUMAN`,
  `PERMANENT_QUARANTINE`, `HOLD_UNKNOWN`,
  `REJECT_CYCLE_AS_CONFIRMATION`, `REJECT_NESTED_EXPIRY`,
  `SKIP`) and notify policy after seal, invalidation, or
  upstream key or clock change;
- optional procedural refs for "how to terminate a first-
  enrollment key after N governance cycles without
  inventing a winner."

Only `APPROVED` versions are discoverable or executable.

### 3.2 Session contract

A session opens under an approved profile, purpose hash,
budget reservations, and authorization evidence. Duplicate
`(account_id, idempotency_key)` is rejected. Nomination is
source-window point lookup against the certificate catalog.
Refresh cycle-census is a point lookup against the
nominated sealed census — never a ledger scan.

### 3.3 Evaluate and certificate contract

Evaluate is a pure function of nominated windows, cycle
census snapshots, clock lifecycles, dual-control terminal-
steward counts, prior-steward exclusion, and purpose
relation. It never walks catalogs. When
`cycle_count >= max_cycle_count`, the only sealable kinds
are `REQUIRE_HUMAN` and `PERMANENT_QUARANTINE`. Seal binds
window-set, cycle-set, remaining-set, and attenuation
hashes. The certificate must not store
`terminated_fact_hash`. A sealed certificate cannot
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
REJECTED** planner rules and terminal-unit budgets.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set
   `app.account_id` before query.
2. Profiles start as `DRAFT` and become `APPROVED` only
   through an authority-fenced approval function.
3. Sealed profile definitions and terminal rules are
   immutable.
4. Binding identity
   (`source_window_id`, `disputed_fact_hash`,
   `attenuation_hash`, `binding_ordinal`,
   `cycle_set_hash`) is immutable after seal.
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
   authorizes nominate/refresh/evaluate/seal/terminate.
10. Silence and unknown windows cannot evaluate to
    `REQUIRE_HUMAN` or any kind that implies
    `TRUSTED_ENROLLED` (history-rewrite and silence-success
    fences).
11. Halted, extended-halt, and omitted windows cannot
    evaluate to a terminal kind that restores a winner
    (halt-terminal fence).
12. Requested purposes that amplify a window attenuation
    hash are rejected (purpose-amplification fence).
13. Successor termination cannot emit a winning fact hash
    or restore a halted body (successor-leak fence).
14. A terminal certificate never writes
    `attested_key_kind = TRUSTED_ENROLLED`
    (cycle-as-confirmation and expired-cycle-as-trust
    fences).
15. `TERMINAL_REQUIRE_HUMAN` and `PERMANENT_QUARANTINE`
    require two distinct terminal-steward principals who
    are not the nominating principal and are not members
    of the prior-cycle steward set.
16. Terminal certificates bind window set, cycle set,
    remaining set, and attenuation hashes; they never
    invent a winning fact hash.
17. Plans that require unscoped board, session, working-set,
    grant-graph, key-catalog, clock-catalog, confirm-ledger,
    vote-ledger, TTL-ledger, page-ledger, ack-ledger,
    escalation-ledger, review-ledger, containment-ledger,
    resolution-ledger, promotion-ledger, or citation-ledger
    scans are **FULL SCAN REJECTED**.
18. This plane never opens another nested expiry-
    containment-review-resolution session
    (`REJECT_NESTED_EXPIRY`).

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate terminal rules. Approval
validates definition hash, requires at least one terminal
rule, requires `evaluate_threshold >= 2`, requires
`max_cycle_count BETWEEN 1 AND 8`, requires
`terminal_window_ms > 0`, and fences the status
transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash,
budget reservations, and authorization evidence. The session
starts `OPEN` with `state_revision = 0`. Duplicate
`(account_id, idempotency_key)` is rejected.

### 5.3 Nominate, refresh, and evaluate

Nominate performs a point lookup on the certificate catalog
and writes an immutable nomination receipt with
`cycle_count` copied from the sealed census. Refresh cycle-
census is a point lookup against that same source — never
a vote-ledger, page-ledger, ack-ledger, escalation-ledger,
review-ledger, or resolution-ledger walk. Evaluate is a
pure function of nominated windows, cycle-set hashes,
clock lifecycles, prior-steward exclusion, and purpose
relation. It never walks the catalog.

### 5.4 Seal terminal certificate

Seal binds the evaluation hashes to a consumer ref. The
certificate stores window-set, cycle-set, remaining-set,
and attenuation hashes. It must not store
`terminated_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Dispatch never
scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one
terminal rule. Approval is authority-fenced.

### 6.2 Session open

An authorized principal opens a session under the approved
version.

### 6.3 Nominating / refreshing / evaluating

The session moves `OPEN → NOMINATING → EVALUATING` by CAS.
Budgets decrement in the ledger. Cycle-census snapshots are
append-only.

### 6.4 Sealed / invalidated

Seal moves the session to `SEALED`. Upstream revocation
writes an invalidation and may move bindings to
`INVALIDATED`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`,
and `UNKNOWN_EFFECT` are terminal. Terminal records are
append-only. A sealed `PERMANENT_QUARANTINE` binding is
also terminal for the first-enrollment key: no later plane
may reopen a nested expiry against it.

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
type CensusId = string & { readonly brand: "CensusId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_CERT"
  | "REFRESH_CYCLE_CENSUS"
  | "EVALUATE_TERMINAL"
  | "SEAL_TERMINAL_CERTIFICATE"
  | "INVALIDATE_TERMINAL"
  | "PREPARE_TERMINAL_EFFECT"
  | "TERMINAL_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type CycleBoundTerminalBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "WINDOW_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "CYCLE_AS_CONFIRMATION_DENIED"
  | "EXPIRED_CYCLE_AS_TRUST_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "CYCLE_BOUND_EXCEEDED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "HALT_TERMINAL_DENIED"
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
  | "SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_CERT"
  | "SEALED_CYCLE_CENSUS"
  | "SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_RES_CONTAIN_CERT"
  | "SEALED_PROMOTION_CERTIFICATE"
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

type TerminalKind =
  | "REQUIRE_HUMAN"
  | "PERMANENT_QUARANTINE"
  | "HOLD_UNKNOWN"
  | "REJECT_CYCLE_AS_CONFIRMATION"
  | "REJECT_NESTED_EXPIRY"
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

interface CycleBoundTerminalBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly terminalUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedWindows: number;
  readonly maxCycleCount: number;
}

interface CycleBoundTerminalProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly terminalWindowMs: number;
  readonly maxCycleCount: number;
  readonly maxRefreshCount: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedWindows: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface CycleBoundTerminalSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: CycleBoundTerminalBudget;
  readonly consumed: Omit<
    CycleBoundTerminalBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedWindows"
    | "maxCycleCount"
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
  readonly cycleCount: number;
  readonly maxCycleCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
  readonly expiresAt: Timestamp;
}

interface CycleCensusSnapshot {
  readonly accountId: AccountId;
  readonly censusId: CensusId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly cycleCount: number;
  readonly maxCycleCount: number;
  readonly cycleSetHash: Sha256;
  readonly lastSourceCertificateId: CertificateId;
  readonly capturedAt: Timestamp;
}

interface CycleBoundTerminalEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly windowSetHash: Sha256;
  readonly cycleSetHash: Sha256;
  readonly remainingSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface CycleBoundTerminalBinding {
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
  readonly terminalKind: TerminalKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly cycleSetHash: Sha256;
  readonly cycleCount: number;
  readonly maxCycleCount: number;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface CycleBoundTerminalCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly windowSetHash: Sha256;
  readonly cycleSetHash: Sha256;
  readonly remainingSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface CycleBoundTerminalEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentCycleBoundTerminalPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly requireHumanBindingCount: number;
  readonly permanentQuarantineBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectCycleAsConfirmationBindingCount: number;
  readonly rejectNestedExpiryBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly CycleBoundTerminalEffectObservation[];
  readonly remainingBudget: Omit<
    CycleBoundTerminalBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedWindows"
    | "maxCycleCount"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly CycleBoundTerminalBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateCycleBoundTerminalSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: CycleBoundTerminalBudget;
}

interface NominateSealedCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface RefreshCycleCensusInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedCycleSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateCycleBoundTerminalInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedWindowSetHash: Sha256;
  readonly expectedCycleSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealTerminalCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedCycleSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateCycleBoundTerminalInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceWindowId: SourceWindowId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareTerminalEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface TerminalEffectUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion:
    | "RETRY_SAME_WINDOW"
    | "ACCEPT_OBSERVATION"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseCycleBoundTerminalSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type CycleBoundTerminalDecision =
  | { readonly decision: "ALLOWED"; readonly session: CycleBoundTerminalSession;
      readonly certificate?: CycleBoundTerminalCertificate;
      readonly member?: CycleBoundTerminalBinding;
      readonly receipt?: WindowNominationReceipt;
      readonly snapshot?: CycleCensusSnapshot;
      readonly evaluation?: CycleBoundTerminalEvaluationReceipt;
      readonly perception: AgentCycleBoundTerminalPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: CycleBoundTerminalBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentCycleBoundTerminalPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE cbt_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE cbt_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_source_kind AS ENUM (
  'SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_CERT',
  'SEALED_CYCLE_CENSUS',
  'SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_RES_CONTAIN_CERT',
  'SEALED_PROMOTION_CERTIFICATE',
  'SEALED_TTL_CERTIFICATE',
  'SEALED_CONFIRM_CERTIFICATE', 'FIRST_ENROLLMENT_CLAIM',
  'SEALED_SLO_CERTIFICATE', 'SEALED_ACK_CERTIFICATE',
  'SEALED_ESCALATION_CERTIFICATE', 'SEALED_RESOLUTION_CERTIFICATE',
  'SEALED_REVIEW_CERTIFICATE', 'SEALED_CONTAINMENT_CERTIFICATE'
);
CREATE TYPE cbt_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_AS_CONFIRMATION', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cbt_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_cbt_profile_authority NOLOGIN;

CREATE TABLE agent_cbt_authorization_evidence (
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

CREATE TABLE agent_cbt_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status cbt_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  terminal_window_ms BIGINT NOT NULL
    CHECK (terminal_window_ms BETWEEN 1000 AND 2592000000),
  max_cycle_count SMALLINT NOT NULL
    CHECK (max_cycle_count BETWEEN 1 AND 8),
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
    REFERENCES agent_cbt_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_cbt_profile_terminal_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_cycle_count SMALLINT NOT NULL
    CHECK (max_cycle_count BETWEEN 1 AND 8),
  terminal_window_ms BIGINT NOT NULL
    CHECK (terminal_window_ms BETWEEN 1000 AND 2592000000),
  require_dual_control_terminal BOOLEAN NOT NULL,
  terminal_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cbt_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_cbt_certificate_catalog (
  account_id BIGINT NOT NULL,
  source_window_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_window_kind cbt_source_kind NOT NULL,
  placement_kind cbt_placement_kind NOT NULL,
  key_lifecycle cbt_key_lifecycle NOT NULL,
  clock_lifecycle cbt_clock_lifecycle NOT NULL,
  status cbt_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  cycle_count SMALLINT NOT NULL CHECK (cycle_count BETWEEN 0 AND 8),
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

CREATE TABLE agent_cbt_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status cbt_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_terminal_units BIGINT NOT NULL CHECK (budget_terminal_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_terminal_units BIGINT NOT NULL
    CHECK (consumed_terminal_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_cycle_count SMALLINT NOT NULL
    CHECK (max_cycle_count BETWEEN 1 AND 8),
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
    REFERENCES agent_cbt_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_cbt_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_terminal_units <= budget_terminal_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_cbt_nomination_window (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind cbt_source_kind NOT NULL,
  placement_kind cbt_placement_kind NOT NULL,
  key_lifecycle cbt_key_lifecycle NOT NULL,
  clock_lifecycle cbt_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  cycle_count SMALLINT NOT NULL CHECK (cycle_count BETWEEN 0 AND 8),
  max_cycle_count SMALLINT NOT NULL CHECK (max_cycle_count BETWEEN 1 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_window_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_cbt_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_cbt_cycle_census (
  account_id BIGINT NOT NULL,
  census_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  cycle_count SMALLINT NOT NULL CHECK (cycle_count BETWEEN 0 AND 8),
  max_cycle_count SMALLINT NOT NULL CHECK (max_cycle_count BETWEEN 1 AND 8),
  cycle_set_hash CHAR(64) NOT NULL CHECK (length(cycle_set_hash) = 64),
  last_source_certificate_id UUID NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, census_id),
  UNIQUE (account_id, session_id, source_window_id, cycle_set_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_cbt_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_cbt_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  window_set_hash CHAR(64) NOT NULL CHECK (length(window_set_hash) = 64),
  cycle_set_hash CHAR(64) NOT NULL
    CHECK (length(cycle_set_hash) = 64),
  remaining_set_hash CHAR(64) NOT NULL
    CHECK (length(remaining_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id)
);

CREATE TABLE agent_cbt_terminal_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  window_set_hash CHAR(64) NOT NULL CHECK (length(window_set_hash) = 64),
  cycle_set_hash CHAR(64) NOT NULL
    CHECK (length(cycle_set_hash) = 64),
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
    REFERENCES agent_cbt_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_cbt_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_cbt_terminal_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind cbt_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status cbt_binding_status NOT NULL,
  placement_kind cbt_placement_kind NOT NULL,
  key_lifecycle cbt_key_lifecycle NOT NULL,
  clock_lifecycle cbt_clock_lifecycle NOT NULL,
  attested_key_kind cbt_attested_key_kind NOT NULL,
  terminal_kind cbt_terminal_kind NOT NULL,
  purpose_relation cbt_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  cycle_set_hash CHAR(64) NOT NULL
    CHECK (length(cycle_set_hash) = 64),
  cycle_count SMALLINT NOT NULL CHECK (cycle_count BETWEEN 0 AND 8),
  max_cycle_count SMALLINT NOT NULL CHECK (max_cycle_count BETWEEN 1 AND 8),
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_window_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_cbt_terminal_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_cbt_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_cbt_invalidation (
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
    REFERENCES agent_cbt_terminal_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_cbt_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_cbt_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status cbt_effect_status NOT NULL,
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
    REFERENCES agent_cbt_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_cbt_terminal_certificate (account_id, certificate_id)
);

CREATE TABLE agent_cbt_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'TERMINAL'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id)
);

CREATE TABLE agent_cbt_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  effect_id UUID,
  conflict_id UUID,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id)
);

CREATE TABLE agent_cbt_command_result (
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

CREATE TABLE agent_cbt_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_cbt_audit_event (
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

CREATE TABLE agent_cbt_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_cbt_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status cbt_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cbt_session (account_id, session_id)
);

CREATE TABLE agent_cbt_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_cbt_profile()
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
       OR NEW.terminal_window_ms IS DISTINCT FROM OLD.terminal_window_ms
       OR NEW.max_cycle_count IS DISTINCT FROM OLD.max_cycle_count
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
    IF current_setting('app.cbt_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.cbt_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_cbt_profile_protect
BEFORE INSERT OR UPDATE ON agent_cbt_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_cbt_profile();

CREATE FUNCTION protect_agent_cbt_profile_terminal_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status cbt_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_cbt_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile terminal rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_cbt_profile_terminal_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_cbt_profile_terminal_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_cbt_profile_terminal_rule();

CREATE FUNCTION protect_agent_cbt_cycle_census()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_census$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'cycle census snapshots are append-only';
  END IF;
  RETURN NEW;
END
$protect_census$;

CREATE TRIGGER agent_cbt_cycle_census_protect
BEFORE INSERT OR UPDATE ON agent_cbt_cycle_census
FOR EACH ROW EXECUTE FUNCTION protect_agent_cbt_cycle_census();

CREATE FUNCTION protect_agent_cbt_terminal_binding()
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
       OR NEW.terminal_kind IS DISTINCT FROM OLD.terminal_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.cycle_set_hash IS DISTINCT FROM OLD.cycle_set_hash
       OR NEW.cycle_count IS DISTINCT FROM OLD.cycle_count
       OR NEW.max_cycle_count IS DISTINCT FROM OLD.max_cycle_count
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'terminal binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.terminal_kind IN (
       'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE',
       'REJECT_CYCLE_AS_CONFIRMATION'
     )
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks terminal from rewriting confirmed trust';
  END IF;

  IF NEW.terminal_kind = 'REJECT_CYCLE_AS_CONFIRMATION'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'cycle-as-confirmation fence blocks TRUSTED_ENROLLED from a sealed cycle census';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks terminal of silent or unknown successor';
  END IF;

  IF NEW.terminal_kind IN (
       'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE',
       'REJECT_CYCLE_AS_CONFIRMATION'
     )
     AND NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from cycle-bound terminal';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks terminal against an unattested clock';
  END IF;

  IF NEW.terminal_kind IN (
       'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE'
     )
     AND NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks terminal for invented successor history';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'halt-terminal fence blocks terminal that would restore a halted key';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose terminal after attenuation hops';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.cycle_count < NEW.max_cycle_count THEN
    RAISE EXCEPTION 'nested-expiry fence blocks terminal kinds before the cycle bound';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_cbt_terminal_binding_protect
BEFORE INSERT OR UPDATE ON agent_cbt_terminal_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_cbt_terminal_binding();

CREATE FUNCTION protect_agent_cbt_effect_intent()
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

CREATE TRIGGER agent_cbt_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_cbt_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_cbt_effect_intent();

CREATE FUNCTION approve_agent_cbt_profile(
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
  stored_status cbt_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cbt_profile
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
  FROM agent_cbt_profile_terminal_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one terminal rule';
  END IF;

  PERFORM set_config(
    'app.cbt_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_cbt_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_cbt_profile(
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
  stored_status cbt_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cbt_profile
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
    'app.cbt_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_cbt_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_cbt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cbt_profile_authority;
ALTER FUNCTION revoke_agent_cbt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cbt_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_cbt_profile_authority;
GRANT SELECT ON
  agent_cbt_profile,
  agent_cbt_profile_terminal_rule
TO agent_cbt_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cbt_profile TO agent_cbt_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_cbt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_cbt_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cbt_profile FROM PUBLIC;

CREATE INDEX agent_cbt_session_work_idx ON agent_cbt_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_cbt_session_profile_idx ON agent_cbt_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_cbt_binding_certificate_idx ON agent_cbt_terminal_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_cbt_binding_window_idx ON agent_cbt_terminal_binding (
  account_id, source_window_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_cbt_catalog_ref_idx ON agent_cbt_certificate_catalog (
  account_id, receipt_ref, sealed_at DESC, source_window_id
);
CREATE INDEX agent_cbt_catalog_kind_idx ON agent_cbt_certificate_catalog (
  account_id, source_window_kind, sealed_at DESC, source_window_id
);
CREATE INDEX agent_cbt_evaluation_session_idx ON agent_cbt_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_cbt_certificate_session_idx ON agent_cbt_terminal_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_cbt_census_session_idx ON agent_cbt_cycle_census (
  account_id, session_id, captured_at DESC, census_id
);
CREATE INDEX agent_cbt_effect_work_idx ON agent_cbt_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_cbt_audit_time_idx ON agent_cbt_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_cbt_perception_status_idx ON agent_cbt_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_cbt_command_expiry_idx ON agent_cbt_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_cbt_invalidation_certificate_idx ON agent_cbt_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_cbt_authorization_evidence',
    'agent_cbt_profile',
    'agent_cbt_profile_terminal_rule',
    'agent_cbt_certificate_catalog',
    'agent_cbt_session',
    'agent_cbt_nomination_window',
    'agent_cbt_cycle_census',
    'agent_cbt_evaluation_receipt',
    'agent_cbt_terminal_certificate',
    'agent_cbt_terminal_binding',
    'agent_cbt_invalidation',
    'agent_cbt_effect_intent',
    'agent_cbt_budget_ledger',
    'agent_cbt_terminal_record',
    'agent_cbt_command_result',
    'agent_cbt_audit_head',
    'agent_cbt_audit_event',
    'agent_cbt_audit_anchor',
    'agent_cbt_perception_snapshot',
    'agent_cbt_projection_checkpoint'
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
with session CAS. Terminal-certificate seal never joins a
columnar rebuild or HNSW mutation.

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

enum AgentCbtSessionStatus {
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

enum AgentCbtBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentCbtSourceKind {
  SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_CERT
  SEALED_CYCLE_CENSUS
  SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_RES_CONTAIN_CERT
  SEALED_PROMOTION_CERTIFICATE
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

enum AgentCbtPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentCbtKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentCbtClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentCbtAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentCbtTerminalKind {
  REQUIRE_HUMAN
  PERMANENT_QUARANTINE
  HOLD_UNKNOWN
  REJECT_CYCLE_AS_CONFIRMATION
  REJECT_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentCbtPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentCbtEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentCbtNextAction {
  NOMINATE_SEALED_PROMOTION_RC_RES_CONTAIN_RC_REVIEW_CERT
  REFRESH_CYCLE_CENSUS
  EVALUATE_TERMINAL
  SEAL_TERMINAL_CERTIFICATE
  INVALIDATE_TERMINAL
  PREPARE_TERMINAL_EFFECT
  TERMINAL_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentCbtBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  WINDOW_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  CYCLE_AS_CONFIRMATION_DENIED
  EXPIRED_CYCLE_AS_TRUST_DENIED
  NESTED_EXPIRY_DENIED
  CYCLE_BOUND_EXCEEDED
  PRIOR_STEWARD_EXCLUSION_DENIED
  LEDGER_SCAN_DENIED
  HALT_TERMINAL_DENIED
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

enum AgentCbtUncertaintyResolution {
  RETRY_SAME_WINDOW
  ACCEPT_OBSERVATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentCbtInvalidationReason {
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

type AgentCbtBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  terminalUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
  maxCycleCount: Int!
}

type AgentCbtProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  terminalWindowMs: Long!
  maxCycleCount: Int!
  maxRefreshCount: Int!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentCbtSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentCbtSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentCbtBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentCbtNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentCbtSourceKind!
  placementKind: AgentCbtPlacementKind!
  keyLifecycle: AgentCbtKeyLifecycle!
  clockLifecycle: AgentCbtClockLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  cycleCount: Int!
  maxCycleCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
  expiresAt: DateTime!
}

type AgentCbtCycleCensus {
  accountId: ID!
  censusId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  cycleCount: Int!
  maxCycleCount: Int!
  cycleSetHash: SHA256!
  lastSourceCertificateId: ID!
  capturedAt: DateTime!
}

type AgentCbtEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  windowSetHash: SHA256!
  cycleSetHash: SHA256!
  remainingSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentCbtTerminalCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  windowSetHash: SHA256!
  cycleSetHash: SHA256!
  remainingSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentCbtBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentCbtSourceKind!
  bindingOrdinal: Int!
  status: AgentCbtBindingStatus!
  placementKind: AgentCbtPlacementKind!
  keyLifecycle: AgentCbtKeyLifecycle!
  clockLifecycle: AgentCbtClockLifecycle!
  attestedKeyKind: AgentCbtAttestedKeyKind!
  terminalKind: AgentCbtTerminalKind!
  purposeRelation: AgentCbtPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  cycleSetHash: SHA256!
  cycleCount: Int!
  maxCycleCount: Int!
  expiresAt: DateTime!
  sealedAt: DateTime!
}

type AgentCbtEffectObservation {
  effectId: ID!
  status: AgentCbtEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentCbtPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentCbtSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  requireHumanBindingCount: Int!
  permanentQuarantineBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectCycleAsConfirmationBindingCount: Int!
  rejectNestedExpiryBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentCbtEffectObservation!]!
  remainingBudget: AgentCbtBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentCbtNextAction!]!
  blockedReasons: [AgentCbtBlockedReason!]!
  cardHash: SHA256!
}

type AgentCbtMutationResult {
  decision: String!
  session: AgentCbtSession
  certificate: AgentCbtTerminalCertificate
  member: AgentCbtBinding
  receipt: AgentCbtNominationReceipt
  snapshot: AgentCbtCycleCensus
  evaluation: AgentCbtEvaluationReceipt
  perception: AgentCbtPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentCbtBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  terminalUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
  maxCycleCount: Int!
}

input CreateCycleBoundTerminalSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentCbtBudgetInput!
}

input NominateSealedCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input RefreshCycleCensusInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedCycleSetHash: SHA256!
  idempotencyKey: String!
}

input EvaluateCycleBoundTerminalInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedWindowSetHash: SHA256!
  expectedCycleSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealTerminalCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedCycleSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateCycleBoundTerminalInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceWindowId: ID!
  reasonCode: AgentCbtInvalidationReason!
  idempotencyKey: String!
}

input PrepareTerminalEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input TerminalEffectUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: AgentCbtUncertaintyResolution!
  idempotencyKey: String!
}

input AgentCbtProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentCbtProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentCbtProfile
  agentCbtSession(accountId: ID!, sessionId: ID!): AgentCbtSession
  agentCbtTerminalCertificate(accountId: ID!, certificateId: ID!): AgentCbtTerminalCertificate
  agentCbtPerceptionCard(accountId: ID!, sessionId: ID!): AgentCbtPerceptionCard
  agentCbtNominatedWindow(
    accountId: ID!
    sessionId: ID!
    sourceWindowId: ID!
  ): AgentCbtNominationReceipt
  agentCbtSearchProfiles(input: AgentCbtProfileSearchInput!): [AgentCbtProfile!]!
}

type Mutation {
  createCycleBoundTerminalSession(
    input: CreateCycleBoundTerminalSessionInput!
  ): AgentCbtMutationResult!
  nominateSealedCertificate(
    input: NominateSealedCertificateInput!
  ): AgentCbtMutationResult!
  refreshCycleCensus(
    input: RefreshCycleCensusInput!
  ): AgentCbtMutationResult!
  evaluateCycleBoundTerminal(
    input: EvaluateCycleBoundTerminalInput!
  ): AgentCbtMutationResult!
  sealTerminalCertificate(input: SealTerminalCertificateInput!): AgentCbtMutationResult!
  invalidateCycleBoundTerminal(
    input: InvalidateCycleBoundTerminalInput!
  ): AgentCbtMutationResult!
  prepareTerminalEffect(input: PrepareTerminalEffectInput!): AgentCbtMutationResult!
  terminalEffectUncertainty(
    input: TerminalEffectUncertaintyInput!
  ): AgentCbtMutationResult!
  closeCycleBoundTerminalSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentCbtMutationResult!
  approveCycleBoundTerminalProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentCbtMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealTerminalCertificate` is rejected with `HISTORY_REWRITE_DENIED` when
  a cycle would invent `TRUSTED_ENROLLED`, with
  `CYCLE_AS_CONFIRMATION_DENIED` when a sealed census is treated as
  confirmation, with `NESTED_EXPIRY_DENIED` when another expiry-
  containment-review-resolution plane would open, and with
  `LEDGER_SCAN_DENIED` when cycle count would be computed by walking
  a vote, TTL, page, ack, escalation, review, or resolution ledger.

## 10. Procedural memory

Approved terminal profiles are procedural memory:
versioned instructions for how a first-enrollment key that
has rotated the governance cycle `max_cycle_count` times
becomes a dual-control `REQUIRE_HUMAN` or
`PERMANENT_QUARANTINE` without inventing a winner and
without rewriting cycle silence as dual-control success or
`TRUSTED_ENROLLED`. Procedure refs may point to human-
escalation or permanent-quarantine playbook steps.
Profiles are immutable after approval; agents perceive
`procedureTags` and `allowedNextActions` on perception
cards, never inventing terminal policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which
terminal profile fits a first-enrollment key that has
exhausted its cycle budget?"). Embeddings are account-owned
and must be queried with `account_id` equality. The
reference schema stores vectors but does **not** create a
cross-tenant HNSW index; production builds account-
partitioned HNSW segments.

Semantic retrieval may return terminal profiles only. It
never authorizes nominate, refresh, evaluate, seal, or
terminate. Vector `topK` is budgeted and clamped.

```sql
CREATE TABLE agent_cbt_profile_embedding (
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
    REFERENCES agent_cbt_profile (account_id, profile_id, profile_version)
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
sealed / require-human / permanent-quarantine / hold-
unknown / reject-cycle-as-confirmation / reject-nested-
expiry / unknown / skipped / invalidated binding counts,
uncertain notify intents, remaining budgets, procedure
tags, allowed next actions, and blocked reasons. Summary
text is `UntrustedText`. Cards never embed raw private keys
or redacted fact bodies. `cardHash` makes perception
replayable. Agents perceive `REQUIRE_HUMAN` as a dual-
control page after the cycle budget is exhausted that still
cannot invent a winner, `PERMANENT_QUARANTINE` as a sealed
stop that forbids later nested expiry, `HOLD_UNKNOWN` as a
bounded uncertainty window, `REJECT_CYCLE_AS_CONFIRMATION`
as a trusted negative for a census that would have
rewritten silence as success, `REJECT_NESTED_EXPIRY` as a
sealed refusal to open another expiry-containment-review-
resolution plane, and `SKIP` as a sealed refusal — never
as a key that "must have been trusted because the cycle
ran long enough."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, cycle-census snapshots,
evaluation receipts, terminal-certificate seals, and audit
appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed
terminal certificates but are not authoritative for
require-human, permanent-quarantine, or reject-cycle-as-
confirmation outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable
profile approval events; staleness is visible via source
watermarks.

### External tools

Notify dispatch and first-enrollment side-effects are not
silently ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on terminals per certificate and
  per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/TERMINAL.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped key-catalog, clock-catalog,
  working-set, grant-graph, citation, confirm-ledger,
  vote-ledger, TTL-ledger, page-ledger, ack-ledger,
  escalation-ledger, review-ledger, containment-ledger,
  resolution-ledger, promotion-ledger, or board scans as
  **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without
  scanning neighbors.
- Evaluation never auto-restores neighbor-visible board
  mutations from halted slots, expired votes, unanswered
  acknowledgements, expired containments, or unbound
  windows.
- Prior-steward exclusion rejects original dual-control
  cycle authorities as the terminal-steward pair.
- Nested-expiry fence rejects opening another expiry-
  containment-review-resolution plane after this terminal.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding remaining sealed certificates to terminate by
  scanning the confirmation-vote, TTL-retirement, page,
  ack, escalation, review, or resolution ledger (rejected;
  nominate by `(account_id, source_window_id)`).
- Computing `cycle_count` by walking every sealed
  governance certificate for an account (rejected; point
  lookup of the sealed cycle census).
- Evaluating a terminal by walking all notify intents for
  an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account
  (rejected; use receipt-keyed active binding indexes).

### Required access paths

- Window nomination: PK `(account_id, source_window_id)`.
- Cycle-census refresh: unique
  `(account_id, session_id, source_window_id, cycle_set_hash)`.
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
page-ledger/ack-ledger/escalation-ledger/review-ledger/
containment-ledger/resolution-ledger/promotion-ledger/
citation scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay
reconstructs session, cycle census, evaluation, and
certificate state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced
  RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must
  narrow relative to terminal and session purposes.
- Sticky first-terminal success after supersession:
  invalidation + re-evaluate + notify uncertainty + profile
  revocation.
- Historical silence invented as `TRUSTED_ENROLLED` from a
  sealed cycle: history-rewrite, silence-success, and
  expired-cycle-as-trust fences.
- First-enrollment key auto-promoted to `TRUSTED_ENROLLED`
  by a terminal: first-enrollment-auto-trust and cycle-as-
  confirmation fences.
- Cycle count computed by walking vote, TTL, page, ack,
  escalation, review, or containment ledgers: ledger-scan
  fence and **FULL SCAN REJECTED**.
- Halt leak of frozen bodies into terminal-as-restore:
  halt-terminal fence.
- Terminal that restores a halted body or invents a
  winner: successor-leak fence.
- Hop leak of donor purpose after attenuation hops:
  hop-leak fence.
- Inventing a winner under restored-slot terminal:
  certificates bind receipt and cycle sets, never
  `terminated_fact_hash`.
- Original cycle authorities serving as the terminal-
  steward pair: prior-steward-exclusion fence.
- Opening another nested expiry after the bound: nested-
  expiry fence.
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
  first-enrollment-auto-trust rejection, cycle-as-
  confirmation rejection, nested-expiry rejection, ledger-
  scan rejection, halt-terminal rejection, purpose-
  amplification rejection, successor-leak rejection, and
  `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection
  counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow terminal

Compile profiles and validate certificate-catalog nomination
without durable certificates.

### Phase 2: reject-cycle-as-confirmation and reject-nested-expiry only

Allow sealed certificates from nominated `HALTED` and
`EXTENDED_HALT` windows as
`REJECT_CYCLE_AS_CONFIRMATION`, `REJECT_NESTED_EXPIRY`, or
`SKIP`. Require-human stays closed.

### Phase 3: require-human and halt-terminal fences

Enable budgeted `REQUIRE_HUMAN` from
`RESTORED_WITHOUT_WINNER` windows with
`cycle_count >= max_cycle_count` and
`AWAITING_CONFIRMATION` only. A sealed certificate never
writes `TRUSTED_ENROLLED`.

### Phase 4: permanent quarantine and notify uncertainty

Enable `PERMANENT_QUARANTINE` under point-lookup census
refresh and confirmation notify intents with
`UNKNOWN_EFFECT` reconciliation and `HOLD_UNKNOWN` that
cannot invent confirmation trust from an unanswered
cycle.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor
budgets, including permanent quarantine only for first-
enrollment keys that cannot rewrite an unanswered cycle as
success and cannot auto-trust from cycle silence.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability,
  history-rewrite, purpose-amplification, and effect start
  state.

### Behavioral validation

- Nominate requires sealed certificate-catalog material point
  lookup and hash match.
- Refresh cycle-census is a point lookup and never a vote-
  ledger, page-ledger, ack-ledger, or escalation-ledger
  scan.
- Evaluate binds window set, cycle set, and attenuation
  under budget and prior-steward exclusion.
- Seal is rejected when a sealed certificate would
  become `TRUSTED_ENROLLED`, when a cycle is treated as
  confirmation, when another nested expiry would open, or
  when cycle count would be computed by scanning ledgers,
  and never invents a winning fact hash.
- Terminal-certificate seal binds immutable bindings
  under window-set, cycle-set, remaining-set, and
  attenuation hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/refresh/evaluate/seal path
  performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed terminal certificates
  after process restart.

## 21. Product decision

Adopt the Cycle-Bound Terminal Plane as the deterministic
stop for first-enrollment keys whose sealed governance
certificates have rotated the promotion-containment-review-
resolution cycle `max_cycle_count` times, bound by the
Promotion-RC Resolution-Containment Review-Expiry
Containment-Expiry Review plane and every prior nested
expiry plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while
   closing the unbounded-nesting gap without history
   rewrite, silence-success, first-enrollment auto-trust,
   cycle-as-confirmation, expired-cycle-as-trust, ledger
   scans, halt leak, purpose amplification, invented
   winners, prior-steward reuse, or
   vote/page/ack/escalation/containment/review/resolution/
   promotion-ledger walks.
2. Account-leading indexes, history-rewrite and purpose-
   amplification fences, and **FULL SCAN REJECTED** planner
   rules protect 99.99% neighbor latency on boards with 1M+
   rows.
3. Open API GraphQL, procedural memory, account-owned HNSW
   profile discovery, perception cards, and hash-chained
   audit replay make the plane agent-ready without putting
   probabilistic AI inside the data engine.
4. This increment is the cycle-bound terminal. The next
   increment must compile sealed `REQUIRE_HUMAN` and
   `PERMANENT_QUARANTINE` certificates into halt-aware
   working sets, or issue dual-control SLA extension
   certificates that re-arm successor clocks without
   restoring disputed facts. Do not add another nested
   expiry-containment-review-resolution plane.
