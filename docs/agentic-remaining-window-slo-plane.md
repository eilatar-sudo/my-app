# mondayDB Agentic Remaining-Window SLO Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-27.v1`

## 1. Why this plane, before how

A sealed confirmation-window observability certificate can
perceive remaining confirmation window, extend budget, and
retirement urgency as `PAGE_WINDOW_CURRENT` /
`PAGE_WINDOW_EXPIRING` / `PAGE_WINDOW_EXPIRED` perception. It
does not decide **how operators and agents are paged** when a
window is expiring — without scanning every observe binding,
rewriting an unanswered page into `TRUSTED_ENROLLED`, or
inventing a winner from SLO silence.

Without a remaining-window SLO plane, operators and agents
either:

- scan every pending `WINDOW_EXPIRING` observe binding and vote
  ledger looking for "who still needs to be paged"
  (neighbor-harmful on boards with 1M+ rows), or
- treat an unanswered page as retroactive engine truth, so SLO
  silence is rewritten as confirmation, historical
  `UNKNOWN_EFFECT` is rewritten as `ACKED`, a silent page fire
  auto-promotes `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`, a
  halt-scoped body is "unlocked" by later paging, and
  hop-attenuated purpose is amplified back to the donor.

The product trade-off is **paging fluency versus paging
isolation**:

- Firing every remaining-millisecond threshold immediately as
  implicit confirmation maximizes agent fluency and reduces
  re-planning cost, but creates history-rewrite invention,
  page-as-confirmation, silence-success, first-enrollment
  auto-trust, unauditable paging storms, and recursive
  observe-ledger walks against neighbors.
- Binding a sealed remaining-window SLO certificate under an
  approved SLO profile, certificate point lookups, history-
  rewrite fences, silence-success fences, first-enrollment
  auto-trust fences, page-as-confirmation fences, halt-page
  fences, purpose-amplification fences, successor-leak fences,
  ledger-scan fences, and steward budgets adds one bounded
  evaluate transaction and short-lived paging storage.
- Semantic similarity may discover SLO profiles, but it must
  never decide whether a sealed window, TTL, or confirm
  certificate may be nominated, an SLO snapshot refreshed, a
  certificate sealed, or a page dispatched.

The recommended model keeps the data plane deterministic:

1. An approved SLO profile defines allowed source kinds, paging
   thresholds, dual-control acknowledgement policy, and notify
   policy. Evaluation **never** invents a winning fact hash and
   **never** rewrites an unanswered page into
   `TRUSTED_ENROLLED`.
2. An SLO session opens under purpose, budget, and authorization
   fences, and only nominates sealed window certificates, sealed
   TTL certificates, sealed confirm certificates, or first-
   enrollment claims by point lookup from the Confirmation-
   Window Observability, Confirmation-TTL Retirement, and First-
   Enrollment Confirmation planes.
3. mondayDB evaluates a page whose kind is a pure function of
   `(source_window_kind, placement_kind, key_lifecycle,
   clock_lifecycle, attested_key_kind, requested_purpose_hash,
   attenuation_hash, hop_count, remaining_ttl_ms,
   extend_budget_remaining, expire_at, now_attested,
   ttl_expired, ack_count, distinct_acker_count,
   page_kind)`. Silence cannot become historical success. An
   unanswered page seals `REJECT_PAGE_AS_CONFIRMATION` or
   `PAGE_WINDOW_EXPIRING` only — never `TRUSTED_ENROLLED`.
   Dual-control `ACK_WINDOW_SLO` acknowledges the page without
   inventing confirmation. Halted slots cannot become page-
   restored winners.
4. Sealing an SLO certificate binds
   `consumer_ref + purpose_hash + window_set_hash +
   clock_set_hash + remaining_set_hash + attenuation_hash`. The
   certificate **must not** emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
   Observation of `UNKNOWN_EFFECT` remains uncertain until a
   trusted refresh or contain vote arrives.
6. Unscoped key-catalog, clock-catalog, confirm-ledger, vote-
   ledger, TTL-ledger, observe-ledger, working-set, grant-graph,
   or board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "re-page every expiring window forever"
or "treat unanswered SLO silence as confirmation until it looks
like success" loops are rejectable before they scan boards with
1M+ rows. Perception is restored by sealed SLO certificates,
not by magic paging orchestration inside the engine.

### Product outcome

For any remaining-window SLO evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, SLO refresh, evaluate, seal, invalidate, or
  notify dispatch?
- Which nominated windows, placement kinds, hop counts,
  attenuation hashes, remaining-set hashes, and page kinds were
  bound?
- Is the SLO certificate still current, invalidated,
  acknowledged, suppressed, or awaiting notify
  acknowledgement?
- Did async notify or first-enrollment sync become
  `UNKNOWN_EFFECT`?
- Can the paging history be replayed without invoking an LLM?

## 2. Scope and ownership

The Remaining-Window SLO Plane owns:

1. Immutable approved SLO profiles as procedural memory of
   "how remaining confirmation window urgency pages operators
   without amplifying purpose, leaking halted facts, rewriting
   attested history, scanning vote or observe ledgers, or
   inventing `TRUSTED_ENROLLED` from an unanswered page."
2. Tenant-scoped SLO sessions with purpose and budget fences.
3. Deterministic nomination of sealed window certificates,
   sealed TTL certificates, confirm certificates, and first-
   enrollment claims by point lookup — never key-catalog, vote-
   ledger, TTL-ledger, observe-ledger, working-set, or board
   scans.
4. Deterministic SLO snapshots, evaluation receipts, sealed SLO
   certificates, and immutable page bindings that never invent
   a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded page
   budgets.

It integrates with, but does not replace:

- **Confirmation-Window Observability:** supplies sealed window
  certificates whose remaining-window perception this plane may
  page. This plane never computes remaining TTL by walking
  observe bindings.
- **Confirmation-TTL Retirement:** supplies sealed TTL
  certificates whose remaining window, extend budget, and
  retire kind this plane may page. This plane never retires,
  extends, or contains a key.
- **First-Enrollment Confirmation:** supplies sealed confirm
  certificates and pending first-enrollment nominations whose
  remaining confirmation window this plane may page. This plane
  never dual-control confirms a key into `TRUSTED_ENROLLED`.
- **Successor-Key Enrollment / Successor-Clock Re-Attestation /
  Provider-Key Rotation:** supply sealed enroll, clock, and
  rotation claims that this plane may bind a page against. This
  plane never enrolls a key, attests a clock, or rotates
  signing material.
- **Certificate Placement / Envelope Purpose Gate / Decision
  Memory:** may consume sealed SLO certificates as perception
  evidence, not raw paging webhooks.
- **Executive Freeze / Thaw SLA:** halt/restore context that
  still forbids page-as-restore against a halted body. Thaw SLA
  decides freeze liveness; TTL retirement decides confirmation-
  vote liveness; observability decides remaining-window
  perception; this plane decides remaining-window paging.
- **Emergency Containment:** the coarse stop/drain path used
  when a contained key evaluates to `SKIP` or
  `SUPPRESS_WINDOW_SLO`; this plane is purpose-scoped paging
  isolation, not workspace-wide containment.
- **Query Governor / Budgets:** reserves nominate, evaluate,
  vector, seal, invalidate, and page units.

### Non-goals

- Letting an LLM decide that an unanswered page "feels
  confirmable enough."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative SLO certificates from columnar
  or vector projections.
- Cross-account remaining-window paging or global nearest-
  neighbor authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted plaintext.
- Claiming distributed atomicity with external pager or time-
  distribution providers.
- Inventing a winning fact hash when a page goes unanswered
  after a restored slot.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED` because an
  SLO fired or a page was not acknowledged.
- Scanning vote, TTL, or observe ledgers to decide who to page.

## 3. Product contract

### 3.1 SLO profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_WINDOW_CERTIFICATE`,
  `SEALED_TTL_CERTIFICATE`, `SEALED_CONFIRM_CERTIFICATE`,
  `FIRST_ENROLLMENT_CLAIM`);
- paging-TTL buckets (`expiring_threshold_ms`), max refresh
  count, evaluate threshold (distinct human principals for
  `ACK_WINDOW_SLO`, minimum 2), max bindings per certificate,
  and max nominated windows;
- page policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`, `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `PAGE_NEVER_CONFIRMS`, `LEDGER_NEVER_SCANNED`,
  `HALT_DENIES_PAGE_RESTORE`, `PURPOSE_NARROW_ONLY`,
  `SUCCESSOR_NEVER_RESTORES_WINNER`);
- purpose attenuation rules (narrowing only; never
  amplification);
- allowed page kinds (`PAGE_WINDOW_CURRENT`,
  `PAGE_WINDOW_EXPIRING`, `PAGE_WINDOW_EXPIRED`,
  `ACK_WINDOW_SLO`, `SUPPRESS_WINDOW_SLO`, `HOLD_UNKNOWN`,
  `REJECT_PAGE_AS_CONFIRMATION`, `SKIP`) and notify policy after
  seal, invalidation, or upstream key or clock change;
- optional procedural refs for "how to page remaining,
  expiring, or contained truth without a winner."

Only `APPROVED` versions are discoverable or executable.

### 3.2 Session contract

A session opens under an approved profile, purpose hash, budget
reservations, and authorization evidence. Duplicate
`(account_id, idempotency_key)` is rejected. Nomination is
source-window point lookup. Refresh remaining-window SLO is a
point lookup against the nominated sealed certificate — never a
ledger scan.

### 3.3 Evaluate and certificate contract

Evaluate is a pure function of nominated windows, SLO
snapshots, clock lifecycles, retire kinds, dual-control ack
counts, and purpose relation. It never walks catalogs. Seal
binds window-set, clock-set, remaining-set, and attenuation
hashes. The certificate must not store `resolved_fact_hash`. An
unanswered page cannot evaluate to a kind that implies
`TRUSTED_ENROLLED`.

### 3.4 Invalidation and effect contract

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Observation of
unknown remaining time remains `HOLD_UNKNOWN` until a trusted
refresh arrives.

### 3.5 Availability contract

Open, nominate, refresh, evaluate, seal, and perception p99
latency stay inside the 99.99% control-plane budget. Neighbor
boards with 1M+ rows are protected by **FULL SCAN REJECTED**
planner rules and page-unit budgets.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set
   `app.account_id` before query.
2. Profiles start as `DRAFT` and become `APPROVED` only through
   an authority-fenced approval function.
3. Sealed profile definitions and page rules are immutable.
4. Binding identity
   (`source_window_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `remaining_set_hash`) is immutable after
   seal.
5. Purpose attenuation may only narrow for consumers;
   amplification is rejected.
6. Window nomination uses point lookup by
   `(account_id, source_window_id)` — never full key-catalog,
   vote-ledger, TTL-ledger, observe-ledger, or board scans.
7. Notify intents start as `PREPARED` and may become
   `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never
   authorizes nominate/refresh/evaluate/seal/page.
10. Silence and unknown windows cannot evaluate to
    `ACK_WINDOW_SLO` or any kind that implies
    `TRUSTED_ENROLLED` (history-rewrite and silence-success
    fences).
11. Halted, extended-halt, and omitted windows cannot evaluate
    to a page kind that restores a winner (halt-page fence).
12. Requested purposes that amplify a window attenuation hash
    are rejected (purpose-amplification fence).
13. Successor paging cannot emit a winning fact hash or restore
    a halted body (successor-leak fence).
14. An unanswered page never writes
    `attested_key_kind = TRUSTED_ENROLLED`
    (page-as-confirmation fence).
15. `ACK_WINDOW_SLO` requires two distinct acknowledgers who
    are not the nominating principal.
16. SLO certificates bind window set, clock set, remaining set,
    and attenuation hashes; they never invent a winning fact
    hash.
17. Plans that require unscoped board, session, working-set,
    grant-graph, key-catalog, clock-catalog, confirm-ledger,
    vote-ledger, TTL-ledger, observe-ledger, or citation-ledger
    scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate page rules. Approval validates
definition hash, requires at least one page rule, requires
`evaluate_threshold >= 2`, requires `expiring_threshold_ms > 0`,
and fences the status transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash,
budget reservations, and authorization evidence. The session
starts `OPEN` with `state_revision = 0`. Duplicate
`(account_id, idempotency_key)` is rejected.

### 5.3 Nominate, refresh, and evaluate

Nominate performs a point lookup on the window catalog and
writes an immutable nomination receipt with `remaining_ttl_ms`
copied from the sealed source certificate. Refresh remaining-
window SLO is a point lookup against that same source — never a
vote-ledger or observe-ledger walk. Evaluate is a pure function
of nominated windows, remaining-set hashes, clock lifecycles,
and purpose relation. It never walks the catalog.

### 5.4 Seal SLO certificate

Seal binds the evaluation hashes to a consumer ref. The
certificate stores window-set, clock-set, remaining-set, and
attenuation hashes. It must not store `resolved_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Dispatch never
scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one page rule.
Approval is authority-fenced.

### 6.2 Session open

An authorized principal opens a session under the approved
version.

### 6.3 Nominating / refreshing / evaluating

The session moves `OPEN → NOMINATING → EVALUATING` by CAS.
Budgets decrement in the ledger. SLO snapshots are append-only.

### 6.4 Sealed / invalidated

Seal moves the session to `SEALED`. Upstream revocation writes
an invalidation and may move bindings to `INVALIDATED`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`, and
`UNKNOWN_EFFECT` are terminal. Terminal records are append-only.

### 6.6 Retain

Audit events, certificates, and bindings retain for the
account's legal hold. Perception snapshots are derived and may
be compacted after Merkle anchor.

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
  | "NOMINATE_SEALED_WINDOW_CERTIFICATE"
  | "REFRESH_REMAINING_WINDOW_SLO"
  | "EVALUATE_REMAINING_WINDOW_SLO"
  | "SEAL_SLO_CERTIFICATE"
  | "INVALIDATE_REMAINING_WINDOW_SLO"
  | "PREPARE_SLO_EFFECT"
  | "RESOLVE_SLO_UNCERTAINTY"
  | "CLOSE_SESSION";

type RemainingWindowSloBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "WINDOW_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "PAGE_AS_CONFIRMATION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "HALT_PAGE_DENIED"
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
  | "SEALED_WINDOW_CERTIFICATE";

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

type PageKind =
  | "PAGE_WINDOW_CURRENT"
  | "PAGE_WINDOW_EXPIRING"
  | "PAGE_WINDOW_EXPIRED"
  | "ACK_WINDOW_SLO"
  | "SUPPRESS_WINDOW_SLO"
  | "HOLD_UNKNOWN"
  | "REJECT_PAGE_AS_CONFIRMATION"
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

interface RemainingWindowSloBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly pageUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedWindows: number;
}

interface RemainingWindowSloProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly expiringThresholdMs: number;
  readonly maxRefreshCount: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedWindows: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface RemainingWindowSloSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: RemainingWindowSloBudget;
  readonly consumed: Omit<
    RemainingWindowSloBudget,
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

interface RemainingWindowSloSnapshot {
  readonly accountId: AccountId;
  readonly snapshotId: SnapshotId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly remainingTtlMs: number;
  readonly extendBudgetRemaining: number;
  readonly snapshotHash: Sha256;
  readonly capturedAt: Timestamp;
}

interface RemainingWindowSloEvaluationReceipt {
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

interface RemainingWindowSloBinding {
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
  readonly pageKind: PageKind;
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

interface RemainingWindowSloCertificate {
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

interface RemainingWindowSloEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentRemainingWindowSloPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly pageWindowCurrentBindingCount: number;
  readonly pageWindowExpiringBindingCount: number;
  readonly pageWindowExpiredBindingCount: number;
  readonly ackWindowSloBindingCount: number;
  readonly suppressWindowSloBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectPageAsConfirmationBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly RemainingWindowSloEffectObservation[];
  readonly remainingBudget: Omit<
    RemainingWindowSloBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedWindows"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly RemainingWindowSloBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateRemainingWindowSloSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: RemainingWindowSloBudget;
}

interface NominateSealedWindowCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface RefreshRemainingWindowSloInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedRemainingSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateRemainingWindowSloInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedWindowSetHash: Sha256;
  readonly expectedRemainingSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealSloCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedRemainingSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateRemainingWindowSloInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceWindowId: SourceWindowId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareSloEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveSloUncertaintyInput {
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

interface CloseRemainingWindowSloSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type RemainingWindowSloDecision =
  | { readonly decision: "ALLOWED"; readonly session: RemainingWindowSloSession;
      readonly certificate?: RemainingWindowSloCertificate;
      readonly member?: RemainingWindowSloBinding;
      readonly receipt?: WindowNominationReceipt;
      readonly snapshot?: RemainingWindowSloSnapshot;
      readonly evaluation?: RemainingWindowSloEvaluationReceipt;
      readonly perception: AgentRemainingWindowSloPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: RemainingWindowSloBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentRemainingWindowSloPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE rws_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE rws_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_source_kind AS ENUM (
  'SEALED_TTL_CERTIFICATE', 'SEALED_CONFIRM_CERTIFICATE',
  'FIRST_ENROLLMENT_CLAIM', 'SEALED_WINDOW_CERTIFICATE'
);
CREATE TYPE rws_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE rws_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_page_kind AS ENUM (
  'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'PAGE_WINDOW_EXPIRED',
  'ACK_WINDOW_SLO', 'SUPPRESS_WINDOW_SLO', 'HOLD_UNKNOWN',
  'REJECT_PAGE_AS_CONFIRMATION', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE rws_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_rws_profile_authority NOLOGIN;

CREATE TABLE agent_rws_authorization_evidence (
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

CREATE TABLE agent_rws_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status rws_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  expiring_threshold_ms BIGINT NOT NULL
    CHECK (expiring_threshold_ms BETWEEN 1000 AND 2592000000),
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
    REFERENCES agent_rws_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_rws_profile_page_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 2 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  expiring_threshold_ms BIGINT NOT NULL
    CHECK (expiring_threshold_ms BETWEEN 1000 AND 2592000000),
  require_dual_control_refresh BOOLEAN NOT NULL,
  page_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_rws_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_rws_window_catalog (
  account_id BIGINT NOT NULL,
  source_window_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_window_kind rws_source_kind NOT NULL,
  placement_kind rws_placement_kind NOT NULL,
  key_lifecycle rws_key_lifecycle NOT NULL,
  clock_lifecycle rws_clock_lifecycle NOT NULL,
  status rws_catalog_status NOT NULL,
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

CREATE TABLE agent_rws_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status rws_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_page_units BIGINT NOT NULL CHECK (budget_page_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_page_units BIGINT NOT NULL
    CHECK (consumed_page_units >= 0),
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
    REFERENCES agent_rws_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_rws_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_page_units <= budget_page_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_rws_nomination_window (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind rws_source_kind NOT NULL,
  placement_kind rws_placement_kind NOT NULL,
  key_lifecycle rws_key_lifecycle NOT NULL,
  clock_lifecycle rws_clock_lifecycle NOT NULL,
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
    REFERENCES agent_rws_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rws_window_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rws_slo_snapshot (
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
    REFERENCES agent_rws_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rws_window_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rws_evaluation_receipt (
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
    REFERENCES agent_rws_session (account_id, session_id)
);

CREATE TABLE agent_rws_slo_certificate (
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
    REFERENCES agent_rws_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_rws_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_rws_page_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind rws_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status rws_binding_status NOT NULL,
  placement_kind rws_placement_kind NOT NULL,
  key_lifecycle rws_key_lifecycle NOT NULL,
  clock_lifecycle rws_clock_lifecycle NOT NULL,
  attested_key_kind rws_attested_key_kind NOT NULL,
  page_kind rws_page_kind NOT NULL,
  purpose_relation rws_purpose_relation NOT NULL,
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
    REFERENCES agent_rws_slo_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rws_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rws_window_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rws_invalidation (
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
    REFERENCES agent_rws_slo_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_rws_window_catalog (account_id, source_window_id)
);

CREATE TABLE agent_rws_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status rws_effect_status NOT NULL,
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
    REFERENCES agent_rws_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_rws_slo_certificate (account_id, certificate_id)
);

CREATE TABLE agent_rws_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'PAGE'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rws_session (account_id, session_id)
);

CREATE TABLE agent_rws_terminal_record (
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
    REFERENCES agent_rws_session (account_id, session_id)
);

CREATE TABLE agent_rws_command_result (
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

CREATE TABLE agent_rws_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_rws_audit_event (
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

CREATE TABLE agent_rws_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_rws_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status rws_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_rws_session (account_id, session_id)
);

CREATE TABLE agent_rws_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_rws_profile()
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
       OR NEW.expiring_threshold_ms IS DISTINCT FROM OLD.expiring_threshold_ms
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
    IF current_setting('app.rws_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.rws_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_rws_profile_protect
BEFORE INSERT OR UPDATE ON agent_rws_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_rws_profile();

CREATE FUNCTION protect_agent_rws_profile_page_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status rws_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_rws_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile page rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_rws_profile_page_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_rws_profile_page_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_rws_profile_page_rule();

CREATE FUNCTION protect_agent_rws_slo_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_snapshot$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SLO snapshots are append-only';
  END IF;
  RETURN NEW;
END
$protect_snapshot$;

CREATE TRIGGER agent_rws_slo_snapshot_protect
BEFORE INSERT OR UPDATE ON agent_rws_slo_snapshot
FOR EACH ROW EXECUTE FUNCTION protect_agent_rws_slo_snapshot();

CREATE FUNCTION protect_agent_rws_page_binding()
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
       OR NEW.page_kind IS DISTINCT FROM OLD.page_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.remaining_set_hash IS DISTINCT FROM OLD.remaining_set_hash
       OR NEW.remaining_ttl_ms IS DISTINCT FROM OLD.remaining_ttl_ms
       OR NEW.extend_budget_remaining
         IS DISTINCT FROM OLD.extend_budget_remaining
       OR NEW.ttl_expired IS DISTINCT FROM OLD.ttl_expired
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'page binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.page_kind IN (
       'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'PAGE_WINDOW_EXPIRED',
       'ACK_WINDOW_SLO', 'REJECT_PAGE_AS_CONFIRMATION'
     )
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks paging from rewriting confirmed trust';
  END IF;

  IF NEW.page_kind = 'REJECT_PAGE_AS_CONFIRMATION'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'page-as-confirmation fence blocks TRUSTED_ENROLLED from an unanswered page';
  END IF;

  IF NEW.page_kind = 'ACK_WINDOW_SLO'
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks SLO acknowledgement of silent or unknown successor';
  END IF;

  IF NEW.page_kind IN (
       'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'PAGE_WINDOW_EXPIRED',
       'REJECT_PAGE_AS_CONFIRMATION'
     )
     AND NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from an unanswered page';
  END IF;

  IF NEW.page_kind = 'ACK_WINDOW_SLO'
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks SLO acknowledgement against an unattested clock';
  END IF;

  IF NEW.page_kind IN (
       'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'PAGE_WINDOW_EXPIRED', 'ACK_WINDOW_SLO'
     )
     AND NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks paging for invented successor history';
  END IF;

  IF NEW.page_kind IN (
       'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'ACK_WINDOW_SLO'
     )
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'halt-page fence blocks paging that would restore a halted key';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.page_kind IN (
       'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'ACK_WINDOW_SLO'
     )
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED')
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.page_kind IN (
       'PAGE_WINDOW_CURRENT', 'PAGE_WINDOW_EXPIRING', 'ACK_WINDOW_SLO'
     )
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose paging after attenuation hops';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_rws_page_binding_protect
BEFORE INSERT OR UPDATE ON agent_rws_page_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_rws_page_binding();

CREATE FUNCTION protect_agent_rws_effect_intent()
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

CREATE TRIGGER agent_rws_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_rws_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_rws_effect_intent();

CREATE FUNCTION approve_agent_rws_profile(
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
  stored_status rws_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_rws_profile
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
  FROM agent_rws_profile_page_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one page rule';
  END IF;

  PERFORM set_config(
    'app.rws_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_rws_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_rws_profile(
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
  stored_status rws_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_rws_profile
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
    'app.rws_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_rws_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_rws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_rws_profile_authority;
ALTER FUNCTION revoke_agent_rws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_rws_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_rws_profile_authority;
GRANT SELECT ON
  agent_rws_profile,
  agent_rws_profile_page_rule
TO agent_rws_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_rws_profile TO agent_rws_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_rws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_rws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_rws_profile FROM PUBLIC;

CREATE INDEX agent_rws_session_work_idx ON agent_rws_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_rws_session_profile_idx ON agent_rws_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_rws_binding_certificate_idx ON agent_rws_page_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_rws_binding_window_idx ON agent_rws_page_binding (
  account_id, source_window_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_rws_catalog_ref_idx ON agent_rws_window_catalog (
  account_id, receipt_ref, sealed_at DESC, source_window_id
);
CREATE INDEX agent_rws_catalog_kind_idx ON agent_rws_window_catalog (
  account_id, source_window_kind, sealed_at DESC, source_window_id
);
CREATE INDEX agent_rws_evaluation_session_idx ON agent_rws_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_rws_certificate_session_idx ON agent_rws_slo_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_rws_snapshot_session_idx ON agent_rws_slo_snapshot (
  account_id, session_id, captured_at DESC, snapshot_id
);
CREATE INDEX agent_rws_effect_work_idx ON agent_rws_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_rws_audit_time_idx ON agent_rws_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_rws_perception_status_idx ON agent_rws_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_rws_command_expiry_idx ON agent_rws_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_rws_invalidation_certificate_idx ON agent_rws_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_rws_authorization_evidence',
    'agent_rws_profile',
    'agent_rws_profile_page_rule',
    'agent_rws_window_catalog',
    'agent_rws_session',
    'agent_rws_nomination_window',
    'agent_rws_slo_snapshot',
    'agent_rws_evaluation_receipt',
    'agent_rws_slo_certificate',
    'agent_rws_page_binding',
    'agent_rws_invalidation',
    'agent_rws_effect_intent',
    'agent_rws_budget_ledger',
    'agent_rws_terminal_record',
    'agent_rws_command_result',
    'agent_rws_audit_head',
    'agent_rws_audit_event',
    'agent_rws_audit_anchor',
    'agent_rws_perception_snapshot',
    'agent_rws_projection_checkpoint'
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
with session CAS. SLO-certificate seal never joins a columnar
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

enum AgentRwsSessionStatus {
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

enum AgentRwsBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentRwsSourceKind {
  SEALED_TTL_CERTIFICATE
  SEALED_CONFIRM_CERTIFICATE
  FIRST_ENROLLMENT_CLAIM
  SEALED_WINDOW_CERTIFICATE
}

enum AgentRwsPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentRwsKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentRwsClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentRwsAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentRwsPageKind {
  PAGE_WINDOW_CURRENT
  PAGE_WINDOW_EXPIRING
  PAGE_WINDOW_EXPIRED
  ACK_WINDOW_SLO
  SUPPRESS_WINDOW_SLO
  HOLD_UNKNOWN
  REJECT_PAGE_AS_CONFIRMATION
  SKIP
  UNKNOWN_EFFECT
}

enum AgentRwsPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentRwsEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentRwsNextAction {
  NOMINATE_SEALED_WINDOW_CERTIFICATE
  REFRESH_REMAINING_WINDOW_SLO
  EVALUATE_REMAINING_WINDOW_SLO
  SEAL_SLO_CERTIFICATE
  INVALIDATE_REMAINING_WINDOW_SLO
  PREPARE_SLO_EFFECT
  RESOLVE_SLO_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentRwsBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  WINDOW_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  PAGE_AS_CONFIRMATION_DENIED
  LEDGER_SCAN_DENIED
  HALT_PAGE_DENIED
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

enum AgentRwsUncertaintyResolution {
  RETRY_SAME_WINDOW
  ACCEPT_OBSERVATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentRwsInvalidationReason {
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

type AgentRwsBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  pageUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
}

type AgentRwsProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  expiringThresholdMs: Long!
  maxRefreshCount: Int!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentRwsSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentRwsSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentRwsBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentRwsNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentRwsSourceKind!
  placementKind: AgentRwsPlacementKind!
  keyLifecycle: AgentRwsKeyLifecycle!
  clockLifecycle: AgentRwsClockLifecycle!
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

type AgentRwsRemainingWindowSloSnapshot {
  accountId: ID!
  snapshotId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  remainingTtlMs: Long!
  extendBudgetRemaining: Int!
  snapshotHash: SHA256!
  capturedAt: DateTime!
}

type AgentRwsEvaluationReceipt {
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

type AgentRwsSloCertificate {
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

type AgentRwsBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentRwsSourceKind!
  bindingOrdinal: Int!
  status: AgentRwsBindingStatus!
  placementKind: AgentRwsPlacementKind!
  keyLifecycle: AgentRwsKeyLifecycle!
  clockLifecycle: AgentRwsClockLifecycle!
  attestedKeyKind: AgentRwsAttestedKeyKind!
  pageKind: AgentRwsPageKind!
  purposeRelation: AgentRwsPurposeRelation!
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

type AgentRwsEffectObservation {
  effectId: ID!
  status: AgentRwsEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentRwsPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentRwsSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  pageWindowCurrentBindingCount: Int!
  pageWindowExpiringBindingCount: Int!
  pageWindowExpiredBindingCount: Int!
  ackWindowSloBindingCount: Int!
  suppressWindowSloBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectPageAsConfirmationBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentRwsEffectObservation!]!
  remainingBudget: AgentRwsBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentRwsNextAction!]!
  blockedReasons: [AgentRwsBlockedReason!]!
  cardHash: SHA256!
}

type AgentRwsMutationResult {
  decision: String!
  session: AgentRwsSession
  certificate: AgentRwsSloCertificate
  member: AgentRwsBinding
  receipt: AgentRwsNominationReceipt
  snapshot: AgentRwsRemainingWindowSloSnapshot
  evaluation: AgentRwsEvaluationReceipt
  perception: AgentRwsPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentRwsBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  pageUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedWindows: Int!
}

input CreateRemainingWindowSloSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentRwsBudgetInput!
}

input NominateSealedWindowCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input RefreshRemainingWindowSloInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedRemainingSetHash: SHA256!
  idempotencyKey: String!
}

input EvaluateRemainingWindowSloInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedWindowSetHash: SHA256!
  expectedRemainingSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealSloCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedRemainingSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateRemainingWindowSloInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceWindowId: ID!
  reasonCode: AgentRwsInvalidationReason!
  idempotencyKey: String!
}

input PrepareSloEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveSloUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentRwsUncertaintyResolution!
  idempotencyKey: String!
}

input AgentRwsProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentRwsProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentRwsProfile
  agentRwsSession(accountId: ID!, sessionId: ID!): AgentRwsSession
  agentRwsSloCertificate(accountId: ID!, certificateId: ID!): AgentRwsSloCertificate
  agentRwsPerceptionCard(accountId: ID!, sessionId: ID!): AgentRwsPerceptionCard
  agentRwsNominatedWindow(
    accountId: ID!
    sessionId: ID!
    sourceWindowId: ID!
  ): AgentRwsNominationReceipt
  agentRwsSearchProfiles(input: AgentRwsProfileSearchInput!): [AgentRwsProfile!]!
}

type Mutation {
  createRemainingWindowSloSession(
    input: CreateRemainingWindowSloSessionInput!
  ): AgentRwsMutationResult!
  nominateSealedWindowCertificate(
    input: NominateSealedWindowCertificateInput!
  ): AgentRwsMutationResult!
  refreshRemainingWindowSlo(
    input: RefreshRemainingWindowSloInput!
  ): AgentRwsMutationResult!
  evaluateRemainingWindowSlo(
    input: EvaluateRemainingWindowSloInput!
  ): AgentRwsMutationResult!
  sealSloCertificate(input: SealSloCertificateInput!): AgentRwsMutationResult!
  invalidateRemainingWindowSlo(
    input: InvalidateRemainingWindowSloInput!
  ): AgentRwsMutationResult!
  prepareSloEffect(input: PrepareSloEffectInput!): AgentRwsMutationResult!
  resolveSloUncertainty(
    input: ResolveSloUncertaintyInput!
  ): AgentRwsMutationResult!
  closeRemainingWindowSloSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentRwsMutationResult!
  approveRemainingWindowSloProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentRwsMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealSloCertificate` is rejected with `HISTORY_REWRITE_DENIED` when
  remaining TTL would invent `TRUSTED_ENROLLED`, with
  `PAGE_AS_CONFIRMATION_DENIED` when an unanswered page is treated as
  confirmation, and with `LEDGER_SCAN_DENIED` when remaining time would
  be computed by walking a vote, TTL, or observe ledger.

## 10. Procedural memory

Approved SLO profiles are procedural memory: versioned
instructions for how sealed window, TTL, and confirm
certificates become envelope-scoped remaining-window pages
without inventing a winner and without rewriting an unanswered
page as dual-control success or `TRUSTED_ENROLLED`. Procedure
refs may point to successor-containment playbook steps.
Profiles are immutable after approval; agents perceive
`procedureTags` and `allowedNextActions` on perception cards,
never inventing page policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which SLO
profile fits incident hop-attenuated first-enrollment remaining
window paging?"). Embeddings are account-owned and must be
queried with `account_id` equality. The reference schema stores
vectors but does **not** create a cross-tenant HNSW index;
production builds account-partitioned HNSW segments.

Semantic retrieval may return SLO profiles only. It never
authorizes nominate, refresh, evaluate, seal, or page. Vector
`topK` is budgeted and clamped.

```sql
CREATE TABLE agent_rws_profile_embedding (
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
    REFERENCES agent_rws_profile (account_id, profile_id, profile_version)
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
sealed / page-window-current / page-window-expiring / page-
window-expired / ack-window-slo / suppress-window-slo / hold-
unknown / reject-page-as-confirmation / unknown / skipped /
invalidated binding counts, uncertain notify intents, remaining
budgets, procedure tags, allowed next actions, and blocked
reasons. Summary text is `UntrustedText`. Cards never embed raw
private keys or redacted fact bodies. `cardHash` makes
perception replayable. Agents perceive `PAGE_WINDOW_CURRENT` as
a first-seen key whose confirmation window is still open and
still cannot invent a winner, `PAGE_WINDOW_EXPIRING` as a
bounded page that remaining time is below the profile threshold
without confirmation, `PAGE_WINDOW_EXPIRED` as a sealed page
that the window closed without dual-control trust,
`ACK_WINDOW_SLO` as a dual-control acknowledgement that does
not confirm the key, `SUPPRESS_WINDOW_SLO` as a trusted hold
that refuses silent confirmation, `HOLD_UNKNOWN` as a bounded
uncertainty window, `REJECT_PAGE_AS_CONFIRMATION` as a trusted
negative for an unanswered page that would have rewritten SLO
silence as success, and `SKIP` as a sealed refusal — never as a
key that "must have been trusted because nobody acknowledged
the page."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, SLO snapshots, evaluation
receipts, SLO-certificate seals, and audit appends are ACID
transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed SLO
certificates but are not authoritative for page-window-current,
page-window-expiring, or reject-page-as-confirmation outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable
profile approval events; staleness is visible via source
watermarks.

### External tools

Notify dispatch and first-enrollment side-effects are not
silently ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on pages per certificate and per
  session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/PAGE.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped key-catalog, clock-catalog, working-
  set, grant-graph, citation, confirm-ledger, vote-ledger, TTL-
  ledger, observe-ledger, or board scans as **FULL SCAN
  REJECTED**.
- Emergency containment may quarantine sessions without scanning
  neighbors.
- Evaluation never auto-restores neighbor-visible board
  mutations from halted slots, expired votes, unanswered pages,
  or unbound windows.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding remaining windows to page by scanning the
  confirmation-vote, TTL-retirement, or observe ledger
  (rejected; nominate by `(account_id, source_window_id)`).
- Evaluating a page by walking all notify intents for an
  account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account
  (rejected; use receipt-keyed active binding indexes).

### Required access paths

- Window nomination: PK `(account_id, source_window_id)`.
- Remaining-window SLO refresh: unique `(account_id, session_id,
  source_window_id, snapshot_hash)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/window: composite indexes leading
  with `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring
an unscoped board/working-set/grant-graph/key-catalog/clock-
catalog/confirm-ledger/vote-ledger/TTL-ledger/observe-ledger/
citation scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay
reconstructs session, SLO snapshot, evaluation, and certificate
state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged IDs: blocked by forced
  RLS and PK scope.
- Purpose amplification for consumers: attenuation hash must
  narrow relative to paging and session purposes.
- Sticky first-ACK success after supersession: invalidation +
  re-evaluate + notify uncertainty + profile revocation.
- Historical silence invented as `TRUSTED_ENROLLED` from an
  unanswered page: history-rewrite and silence-success fences.
- First-enrollment key auto-promoted to `TRUSTED_ENROLLED` by a
  page fire: first-enrollment-auto-trust and page-as-
  confirmation fences.
- Remaining time or page targets computed by walking vote,
  TTL, or observe ledgers: ledger-scan fence and **FULL SCAN
  REJECTED**.
- Halt leak of frozen bodies into page-as-restore: halt-page
  fence.
- Page that restores a halted body or invents a winner:
  successor-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak
  fence.
- Inventing a winner under restored-slot paging: certificates
  bind receipt and remaining sets, never `resolved_fact_hash`.
- Silent notify or first-enrollment success: `UNKNOWN_EFFECT`
  until ACK.
- Recursive window-catalog or board storms: budget and
  **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced
  approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/refresh/evaluate/seal/perception p99 latency
  budgets for 99.99% control-plane availability.
- History-rewrite rejection, silence-success rejection, first-
  enrollment-auto-trust rejection, page-as-confirmation
  rejection, ledger-scan rejection, halt-page rejection,
  purpose-amplification rejection, successor-leak rejection,
  and `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection counters
  per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow paging

Compile profiles and validate window nomination without durable
certificates.

### Phase 2: reject-page-as-confirmation and skip only

Allow sealed certificates from nominated `HALTED` and
`EXTENDED_HALT` windows as `REJECT_PAGE_AS_CONFIRMATION` or
`SKIP`. Page-window-expiring stays closed.

### Phase 3: expire-only page and halt-page fences

Enable budgeted `PAGE_WINDOW_EXPIRED` from
`RESTORED_WITHOUT_WINNER` windows with `ttl_expired = true` and
`AWAITING_CONFIRMATION` only. An unanswered page never writes
`TRUSTED_ENROLLED`.

### Phase 4: remaining-window pages and notify uncertainty

Enable `PAGE_WINDOW_CURRENT` / `PAGE_WINDOW_EXPIRING` under
point-lookup refresh and confirmation notify intents with
`UNKNOWN_EFFECT` reconciliation and `HOLD_UNKNOWN` that cannot
invent confirmation trust from an unanswered page.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor
budgets, including remaining-window pages only for first-
enrollment keys that cannot rewrite an unanswered page as
success and cannot auto-trust from SLO silence.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, history-
  rewrite, purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed window material point lookup and
  hash match.
- Refresh remaining-window SLO is a point lookup and never a
  vote-ledger or observe-ledger scan.
- Evaluate binds window set, remaining set, and attenuation
  under budget.
- Seal is rejected when an unanswered page would become
  `TRUSTED_ENROLLED`, when a page is treated as confirmation,
  or when remaining time would be computed by scanning ledgers,
  and never invents a winning fact hash.
- SLO-certificate seal binds immutable bindings under window-
  set, clock-set, remaining-set, and attenuation hashes —
  never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/refresh/evaluate/seal path
  performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed SLO certificates after
  process restart.

## 21. Product decision

Adopt the Remaining-Window SLO Plane as the deterministic
remaining-window paging path for sealed window, TTL, and
confirm certificates bound by the Confirmation-Window
Observability, Confirmation-TTL Retirement, and First-
Enrollment Confirmation planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing
   the post-observability paging gap without history rewrite,
   silence-success, first-enrollment auto-trust, page-as-
   confirmation, ledger scans, halt leak, purpose
   amplification, invented winners, or vote-ledger walks.
2. Account-leading indexes, history-rewrite and purpose-
   amplification fences, and **FULL SCAN REJECTED** planner
   rules protect 99.99% neighbor latency on boards with 1M+
   rows.
3. Open API GraphQL, procedural memory, account-owned HNSW
   profile discovery, perception cards, and hash-chained audit
   replay make the plane agent-ready without putting
   probabilistic AI inside the data engine.
