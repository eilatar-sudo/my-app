# mondayDB Agentic SLA Extension Certificate Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-22.v1`

## 1. Why this plane, before how

The 2026-09-21 Terminal Working-Set Compilation Plane can
compile sealed `REQUIRE_HUMAN` and `PERMANENT_QUARANTINE`
certificates into halt-aware working-set packets. It does
not decide **how a successor clock is dual-control re-armed**
when that attested window is about to lapse — without
restoring a disputed fact, rewriting extension silence into
`TRUSTED_ENROLLED`, leaking a quarantined body, scanning
vote, page, ack, escalation, containment, review, resolution,
or promotion ledgers, or opening another nested expiry.

Without an SLA extension plane, operators and agents either:

- walk every sealed working-set packet looking for "which
  clock is about to lapse" (neighbor-harmful on boards with
  1M+ rows), or
- sticky-copy a new expiry onto the disputed fact, so a
  clock extension becomes invented confirmation and a
  `PERMANENT_QUARANTINE` body leaks back into agent context.

The product trade-off is **clock fluency versus fact
isolation**:

- Re-arming a successor clock by restoring the disputed
  fact maximizes agent fluency and reduces re-grounding
  cost, but creates extension-as-restore, quarantine leak,
  invented winners, and unauditable purpose amplification.
- Issuing a sealed SLA extension certificate under an
  approved extension profile, packet-catalog point lookups,
  append-only clock snapshots, and dual-control stewards
  who are not the original compile stewards adds one
  bounded extension transaction. The clock watermark moves.
  The disputed fact stays `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED`.
- Semantic similarity may discover extension profiles, but
  it must never decide whether a sealed packet may be
  nominated, a successor clock refreshed, an extension
  evaluated, a certificate sealed, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved extension profile defines allowed source
   kinds, dual-control extension-steward policy (minimum
   two distinct principals, excluding the prior compile
   steward), purpose attenuation, and notify policy.
   Extension **never** invents a winning fact hash and
   **never** rewrites a sealed terminal as
   `TRUSTED_ENROLLED`.
2. An extension session opens under purpose, budget, and
   authorization fences, and only nominates sealed
   working-set packets and placement slots by point lookup
   from the packet catalog. The prior clock is read from
   a sealed snapshot — never computed by walking ledgers.
3. mondayDB evaluates a fact hold whose disposition is a
   pure function of `(source_window_kind, terminal_kind,
   placement_kind, key_lifecycle, clock_lifecycle,
   attested_key_kind, fact_disposition, clock_disposition,
   prior_clock_hash, successor_clock_hash)`. Silence cannot
   become historical success. `EXTEND_SUCCESSOR_CLOCK` may
   set `clock_disposition = REARMED` only when the
   successor clock hash differs from the prior clock hash
   and the fact disposition stays held.
4. Sealing an extension certificate binds
   `consumer_ref + purpose_hash + prior_clock_hash +
   successor_clock_hash + disputed_fact_hash +
   halt_scope_hash + attenuation_hash + fact_set_hash +
   extension_steward_a + extension_steward_b`. The
   certificate **must not** emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped packet-catalog, clock-catalog, vote-ledger,
   page-ledger, ack-ledger, escalation-ledger, containment-
   ledger, review-ledger, resolution-ledger, promotion-
   ledger, working-set, grant-graph, or board scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "extend every sealed packet forever"
loops are rejectable before they scan boards with 1M+ rows.
Perception is restored by sealed clock-only certificates,
not by magic visibility inside the engine.

### Product outcome

For any SLA extension, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, clock refresh, evaluation, seal, invalidate,
  or notify dispatch?
- Which nominated sealed packets, prior clocks, successor
  clocks, disputed-fact hashes, halt scopes, and extension
  kinds were bound?
- Did the clock re-arm while the disputed fact stayed held?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the extension history be replayed without invoking
  an LLM?

## 2. Scope and ownership

The SLA Extension Certificate Plane owns:

1. Immutable approved extension profiles as procedural
   memory of "how a sealed halt-aware working-set packet
   re-arms a successor clock without restoring disputed
   facts, amplifying purpose, leaking quarantined bodies,
   rewriting attested history, scanning governance
   ledgers, or inventing `TRUSTED_ENROLLED` from extension
   silence."
2. Tenant-scoped extension sessions with purpose and
   budget fences.
3. Deterministic nomination of sealed working-set packets
   and slots by point lookup — never ledger or board scans.
4. Deterministic clock snapshots, extension receipts,
   sealed certificates, and immutable fact holds that
   never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded
   extension budgets.

It integrates with, but does not replace:

- **Terminal Working-Set Compilation Plane:** supplies
  sealed halt-aware packets and slots this plane may
  extend. This plane never recompiles a terminal and never
  invents `TRUSTED_ENROLLED`.
- **Envelope Purpose Gate / Decision Memory:** may later
  consume a sealed extension certificate as a clock
  watermark. This plane never authorizes tool mutation and
  never restores a disputed fact into those envelopes.
- **Emergency Containment:** the coarse stop/drain path
  used when a `PERMANENT_QUARANTINE` hold must halt
  workspace-wide dispatch. This plane is purpose-scoped
  clock re-arm, not workspace-wide containment.
- **Query Governor / Budgets:** reserves nominate, extend,
  vector, seal, invalidate, and notify units.

### Non-goals

- Letting an LLM decide that a clock "feels long enough"
  or that a disputed fact "should come back."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative extension certificates from
  columnar or vector projections.
- Cross-account extension or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted plaintext.
- Claiming distributed atomicity with external pager or
  notify providers.
- Inventing a winning fact hash when a clock is re-armed.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`
  because an SLA was extended.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to compute the prior
  clock.
- Opening another nested expiry-containment-review-
  resolution plane from an extension certificate.
- Restoring a `PERMANENT_QUARANTINE` body into a visible
  fact hold.

## 3. Product contract

### 3.1 Extension profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_TWS_WORKING_SET_PACKET`,
  `SEALED_REQUIRE_HUMAN_SLOT`,
  `SEALED_QUARANTINE_OMIT_SLOT`,
  `SEALED_HALT_SCOPE_SNAPSHOT`, `SEALED_COMPILE_RECEIPT`);
- extend threshold (distinct extension-steward principals,
  minimum 2), max fact holds per certificate, and max
  nominated windows;
- extension policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`,
  `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `EXTENSION_NEVER_RESTORES_FACTS`,
  `EXTENSION_NEVER_CONFIRMS`, `NESTED_EXPIRY_NEVER_OPENS`,
  `LEDGER_NEVER_SCANNED`, `HALT_DENIES_TERMINAL_RESTORE`,
  `QUARANTINE_BODY_NEVER_VISIBLE`,
  `PRIOR_COMPILE_STEWARD_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_EXTEND`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_TWS_WORKING_SET_PACKET` (29 bytes). The
longest extension kind is `REJECT_EXTENSION_AS_RESTORE`
(27 bytes).

Approval and revocation require the authority fence
`approve_agent_sla_profile` / `revoke_agent_sla_profile`.
Direct `UPDATE` of a sealed profile or its extension rules
is rejected. Profiles must be inserted as `DRAFT`.

### 3.2 Session and budget contract

A session is scoped by `account_id` and an idempotency key.
Budgets cover nominate, extend, seal, vector, invalidate,
and notify units, plus wall-clock, extend threshold, max
holds, and max nominated windows. Consumed units cannot
exceed the budget. Deadline must be after creation.

### 3.3 Nomination and clock snapshot contract

Nomination is a point lookup of
`(account_id, source_window_id)` in the packet catalog.
The catalog stores the disputed fact hash and the prior
clock hash that the working-set plane already sealed. It
does not store a restored fact. A clock snapshot is
append-only and records the proposed successor clock hash
beside the prior clock hash. Refresh never walks a ledger.

### 3.4 Certificate and fact-hold contract

A sealed certificate names two distinct extension stewards
and the prior compile steward. Either extension steward
matching the prior compile steward is rejected. A fact
hold records:

- `fact_disposition`: `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED` (never `RESTORED`);
- `clock_disposition`: `REARMED` only when
  `successor_clock_hash` differs from `prior_clock_hash`;
- `extension_kind`: `EXTEND_SUCCESSOR_CLOCK`,
  `HOLD_EXTENSION_WINDOW`, `REJECT_EXTENSION_AS_RESTORE`,
  `SKIP`, or `UNKNOWN_EFFECT`;
- `opens_nested_expiry`: must be false.

There is no `resolved_fact_hash` column. Changing
`disputed_fact_hash` after insert is rejected.

### 3.5 Notify contract

Effect intents start as `PREPARED`. A prepared identity
(`canonical_request_hash`, provider idempotency key,
certificate id) is immutable. Dispatch may later move to
`DISPATCHED`, `ACKED`, `FAILED`, or `UNKNOWN_EFFECT`.
Silence is not success.

## 4. Deterministic invariants

1. Every row and every access index leads with `account_id`.
2. Extension never writes `TRUSTED_ENROLLED` or
   `TRUSTED_WITHIN_SKEW` (history-rewrite fence).
3. `EXTEND_SUCCESSOR_CLOCK` cannot bind `SILENCE` or
   `UNKNOWN_EFFECT` as the attested key (silence-success
   fence).
4. `FIRST_ENROLLMENT` cannot become `TRUSTED_ENROLLED`
   because a clock was re-armed
   (first-enrollment-auto-trust fence).
5. `fact_disposition = RESTORED` is rejected
   (extension-as-restore fence).
6. `placement_kind = RESTORED_WITHOUT_WINNER` on a sealed
   terminal is rejected (terminal-restore fence).
7. `PERMANENT_QUARANTINE` fact holds must stay
   `QUARANTINE_OMITTED` or `HALTED` (quarantine-leak
   fence).
8. `opens_nested_expiry` must be false (nested-expiry
   fence). Another expiry-containment-review-resolution
   plane is not a legal output of this certificate.
9. `purpose_relation = AMPLIFIES` is rejected
   (purpose-amplification fence).
10. After one or more attenuation hops, the requested
    purpose hash must differ from the donor purpose hash
    (hop-leak fence).
11. `clock_disposition = REGRESSED` is rejected
    (clock-regression fence). `REARMED` requires a
    distinct successor clock hash.
12. Extension stewards are distinct from each other and
    from the prior compile steward.
13. Semantic retrieval discovers profiles only. It never
    authorizes nominate, refresh, evaluate, seal, or
    notify.
14. Unscoped scans of catalogs, ledgers, or boards are
    **FULL SCAN REJECTED**.

## 5. Execution model

1. Resolve the approved profile by
   `(account_id, profile_id, profile_version)`.
2. Open a session under purpose, budget, and authorization
   evidence. Idempotency is `(account_id, idempotency_key)`.
3. Nominate sealed packets by primary-key lookup. Reject
   missing windows, hash mismatches, and ledger-scan plans.
4. Refresh the successor clock from the append-only
   snapshot. Reject regression and identical hashes when
   the disposition would be `REARMED`.
5. Evaluate fact holds. Apply every fence in section 4
   before insert.
6. Seal the certificate with two extension stewards.
   Bind clock hashes and the unchanged disputed-fact hash.
   Do not emit a winner.
7. Prepare a notify intent as `PREPARED`. External ack is
   a later transition. Timeout becomes `UNKNOWN_EFFECT`.
8. Append a hash-chained audit event in the same row-store
   transaction as the state change it records.

Columnar projections and account-owned HNSW indexes are
asynchronous and non-authoritative.

## 6. Lifecycle

### 6.1 Draft and approve

Profiles enter as `DRAFT` with at least one extension rule
whose `require_dual_control_extension` is true. Approval
checks the definition hash and the authority fence.

### 6.2 Open and nominate

Session status moves `OPEN` → `NOMINATING`. Each nomination
consumes one nominate unit and stores a nomination hash.

### 6.3 Refresh and evaluate

Session status moves to `EXTENDING`. Clock refresh is a
point lookup. Evaluation inserts fact holds or rejects
with a blocked reason. No fact is restored.

### 6.4 Seal

Session status moves to `SEALED`. The certificate watermark
counts fact holds. Sealing does not confirm the underlying
key.

### 6.5 Invalidate and notify

Invalidation records `SUPERSEDED`, `RETRACTED`,
`QUARANTINED`, or `KEY_REVOKED` without rewriting the
disputed fact. Notify status may become `UNKNOWN_EFFECT`.

### 6.6 Close and retain

Sessions close, expire, cancel, fail, or quarantine.
Audit events, certificates, and fact holds retain for the
account's legal hold. Perception snapshots are derived and
may be compacted after Merkle anchor.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SourceWindowId = string & { readonly brand: "SourceWindowId" };
type ExtensionId = string & { readonly brand: "ExtensionId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type HoldId = string & { readonly brand: "HoldId" };
type ClockSnapshotId = string & { readonly brand: "ClockSnapshotId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SEALED_WORKING_SET"
  | "REFRESH_SUCCESSOR_CLOCK"
  | "EVALUATE_SLA_EXTENSION"
  | "SEAL_SLA_EXTENSION_CERTIFICATE"
  | "INVALIDATE_SLA_EXTENSION"
  | "PREPARE_SLA_EXTENSION_EFFECT"
  | "SLA_EXTENSION_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type SlaExtensionBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "WINDOW_MISSING"
  | "EXTENSION_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "EXTENSION_AS_RESTORE_DENIED"
  | "EXTENSION_AS_CONFIRMATION_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
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
  | "EXTENDING"
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
  | "SEALED_TWS_WORKING_SET_PACKET"
  | "SEALED_REQUIRE_HUMAN_SLOT"
  | "SEALED_QUARANTINE_OMIT_SLOT"
  | "SEALED_HALT_SCOPE_SNAPSHOT"
  | "SEALED_COMPILE_RECEIPT";

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
  | "REJECT_CYCLE_CONFIRM"
  | "REJECT_NESTED_EXPIRY"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type ExtensionKind =
  | "EXTEND_SUCCESSOR_CLOCK"
  | "HOLD_EXTENSION_WINDOW"
  | "REJECT_EXTENSION_AS_RESTORE"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type FactDisposition =
  | "DISPUTED_HELD"
  | "HALTED"
  | "QUARANTINE_OMITTED"
  | "RESTORED"
  | "UNKNOWN_EFFECT";

type ClockDisposition =
  | "REARMED"
  | "UNCHANGED"
  | "REGRESSED"
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

interface SlaExtensionBudget {
  readonly nominateUnits: number;
  readonly extendUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly extendThreshold: number;
  readonly maxHoldsPerCertificate: number;
  readonly maxNominatedWindows: number;
}

interface SlaExtensionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly extendThreshold: number;
  readonly maxHoldsPerCertificate: number;
  readonly maxNominatedWindows: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface SlaExtensionSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: SlaExtensionBudget;
  readonly consumed: Omit<
    SlaExtensionBudget,
    | "maxWallTimeMs"
    | "extendThreshold"
    | "maxHoldsPerCertificate"
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
  readonly terminalKind: TerminalKind;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly disputedFactHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly haltScopeHash: Sha256;
  readonly priorCompileSteward: string;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
  readonly expiresAt: Timestamp;
}

interface SuccessorClockSnapshot {
  readonly accountId: AccountId;
  readonly clockSnapshotId: ClockSnapshotId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly lastSourceCertificateId: CertificateId;
  readonly capturedAt: Timestamp;
}

interface SlaExtensionReceipt {
  readonly accountId: AccountId;
  readonly extensionId: ExtensionId;
  readonly sessionId: SessionId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly factSetHash: Sha256;
  readonly extensionHash: Sha256;
  readonly extendedAt: Timestamp;
}

interface SlaFactHold {
  readonly accountId: AccountId;
  readonly holdId: HoldId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly sourceWindowKind: SourceWindowKind;
  readonly holdOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly terminalKind: TerminalKind;
  readonly extensionKind: ExtensionKind;
  readonly factDisposition: FactDisposition;
  readonly clockDisposition: ClockDisposition;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly opensNestedExpiry: boolean;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface SlaExtensionCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly extensionId: ExtensionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly factSetHash: Sha256;
  readonly extensionStewardA: string;
  readonly extensionStewardB: string;
  readonly priorCompileSteward: string;
  readonly holdWatermark: number;
  readonly sealedAt: Timestamp;
}

interface SlaExtensionEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentSlaExtensionPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedHoldCount: number;
  readonly clockRearmedCount: number;
  readonly disputedHeldCount: number;
  readonly quarantineOmittedCount: number;
  readonly rejectRestoreCount: number;
  readonly holdWindowCount: number;
  readonly unknownHoldCount: number;
  readonly skippedHoldCount: number;
  readonly invalidatedHoldCount: number;
  readonly uncertainEffectIntents: readonly SlaExtensionEffectObservation[];
  readonly remainingBudget: Omit<
    SlaExtensionBudget,
    | "maxWallTimeMs"
    | "extendThreshold"
    | "maxHoldsPerCertificate"
    | "maxNominatedWindows"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly SlaExtensionBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateSlaExtensionSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: SlaExtensionBudget;
}

interface NominateSealedWorkingSetInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface RefreshSuccessorClockInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedPriorClockHash: Sha256;
  readonly proposedSuccessorClockHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateSlaExtensionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedPriorClockHash: Sha256;
  readonly expectedSuccessorClockHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealSlaExtensionCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly extensionId: ExtensionId;
  readonly consumerRef: ConsumerRef;
  readonly extensionStewardA: string;
  readonly extensionStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateSlaExtensionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceWindowId: SourceWindowId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareSlaExtensionEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface SlaExtensionEffectUncertaintyInput {
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

interface CloseSlaExtensionSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type SlaExtensionDecision =
  | { readonly decision: "ALLOWED"; readonly session: SlaExtensionSession;
      readonly certificate?: SlaExtensionCertificate;
      readonly hold?: SlaFactHold;
      readonly receipt?: WindowNominationReceipt;
      readonly snapshot?: SuccessorClockSnapshot;
      readonly extension?: SlaExtensionReceipt;
      readonly perception: AgentSlaExtensionPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: SlaExtensionBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentSlaExtensionPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE sla_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE sla_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EXTENDING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_source_kind AS ENUM (
  'SEALED_TWS_WORKING_SET_PACKET',
  'SEALED_REQUIRE_HUMAN_SLOT',
  'SEALED_QUARANTINE_OMIT_SLOT',
  'SEALED_HALT_SCOPE_SNAPSHOT',
  'SEALED_COMPILE_RECEIPT'
);
CREATE TYPE sla_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE sla_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE sla_extension_kind AS ENUM (
  'EXTEND_SUCCESSOR_CLOCK', 'HOLD_EXTENSION_WINDOW',
  'REJECT_EXTENSION_AS_RESTORE', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE sla_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE sla_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_sla_profile_authority NOLOGIN;

CREATE TABLE agent_sla_authorization_evidence (
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

CREATE TABLE agent_sla_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status sla_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  extend_threshold SMALLINT NOT NULL
    CHECK (extend_threshold BETWEEN 2 AND 8),
  max_holds_per_certificate SMALLINT NOT NULL
    CHECK (max_holds_per_certificate BETWEEN 1 AND 256),
  max_nominated_windows SMALLINT NOT NULL
    CHECK (max_nominated_windows BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_EXTEND', 'REQUIRE_REVIEW'
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
    REFERENCES agent_sla_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_sla_profile_extension_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  extend_threshold SMALLINT NOT NULL CHECK (extend_threshold BETWEEN 2 AND 8),
  max_holds_per_certificate SMALLINT NOT NULL
    CHECK (max_holds_per_certificate BETWEEN 1 AND 256),
  require_dual_control_extension BOOLEAN NOT NULL,
  extension_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_sla_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_sla_packet_catalog (
  account_id BIGINT NOT NULL,
  source_window_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_window_kind sla_source_kind NOT NULL,
  terminal_kind sla_terminal_kind NOT NULL,
  placement_kind sla_placement_kind NOT NULL,
  key_lifecycle sla_key_lifecycle NOT NULL,
  clock_lifecycle sla_clock_lifecycle NOT NULL,
  attested_key_kind sla_attested_key_kind NOT NULL,
  status sla_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  prior_compile_steward TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_window_id),
  UNIQUE (account_id, receipt_ref, source_window_kind)
);

CREATE TABLE agent_sla_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status sla_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_extend_units BIGINT NOT NULL CHECK (budget_extend_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_extend_units BIGINT NOT NULL CHECK (consumed_extend_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  extend_threshold SMALLINT NOT NULL
    CHECK (extend_threshold BETWEEN 2 AND 8),
  max_holds_per_certificate SMALLINT NOT NULL
    CHECK (max_holds_per_certificate BETWEEN 1 AND 256),
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
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, session_id, profile_id, profile_version),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_sla_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_sla_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_extend_units <= budget_extend_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_sla_nomination_window (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind sla_source_kind NOT NULL,
  terminal_kind sla_terminal_kind NOT NULL,
  placement_kind sla_placement_kind NOT NULL,
  key_lifecycle sla_key_lifecycle NOT NULL,
  clock_lifecycle sla_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  prior_compile_steward TEXT NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_window_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_sla_packet_catalog (account_id, source_window_id)
);

CREATE TABLE agent_sla_clock_snapshot (
  account_id BIGINT NOT NULL,
  clock_snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  last_source_certificate_id UUID NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, clock_snapshot_id),
  UNIQUE (account_id, session_id, source_window_id, successor_clock_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_sla_packet_catalog (account_id, source_window_id)
);

CREATE TABLE agent_sla_extension_receipt (
  account_id BIGINT NOT NULL,
  extension_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  fact_set_hash CHAR(64) NOT NULL CHECK (length(fact_set_hash) = 64),
  extension_hash CHAR(64) NOT NULL CHECK (length(extension_hash) = 64),
  extended_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, extension_id),
  UNIQUE (account_id, session_id, extension_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id)
);

CREATE TABLE agent_sla_extension_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  extension_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  fact_set_hash CHAR(64) NOT NULL CHECK (length(fact_set_hash) = 64),
  extension_steward_a TEXT NOT NULL,
  extension_steward_b TEXT NOT NULL,
  prior_compile_steward TEXT NOT NULL,
  hold_watermark SMALLINT NOT NULL CHECK (hold_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id),
  FOREIGN KEY (account_id, extension_id)
    REFERENCES agent_sla_extension_receipt (account_id, extension_id),
  CHECK (extension_steward_a <> extension_steward_b),
  CHECK (extension_steward_a <> prior_compile_steward),
  CHECK (extension_steward_b <> prior_compile_steward)
);

CREATE TABLE agent_sla_fact_hold (
  account_id BIGINT NOT NULL,
  hold_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind sla_source_kind NOT NULL,
  hold_ordinal SMALLINT NOT NULL CHECK (hold_ordinal BETWEEN 0 AND 256),
  status sla_binding_status NOT NULL,
  placement_kind sla_placement_kind NOT NULL,
  key_lifecycle sla_key_lifecycle NOT NULL,
  clock_lifecycle sla_clock_lifecycle NOT NULL,
  attested_key_kind sla_attested_key_kind NOT NULL,
  terminal_kind sla_terminal_kind NOT NULL,
  extension_kind sla_extension_kind NOT NULL,
  fact_disposition sla_fact_disposition NOT NULL,
  clock_disposition sla_clock_disposition NOT NULL,
  purpose_relation sla_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  opens_nested_expiry BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, hold_id),
  UNIQUE (account_id, certificate_id, source_window_id, hold_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_sla_extension_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_sla_packet_catalog (account_id, source_window_id)
);

CREATE TABLE agent_sla_invalidation (
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
    REFERENCES agent_sla_extension_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_sla_packet_catalog (account_id, source_window_id)
);

CREATE TABLE agent_sla_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status sla_effect_status NOT NULL,
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
    REFERENCES agent_sla_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_sla_extension_certificate (account_id, certificate_id)
);

CREATE TABLE agent_sla_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EXTEND', 'SEAL', 'VECTOR', 'INVALIDATE', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id)
);

CREATE TABLE agent_sla_terminal_record (
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
    REFERENCES agent_sla_session (account_id, session_id)
);

CREATE TABLE agent_sla_command_result (
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

CREATE TABLE agent_sla_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_sla_audit_event (
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

CREATE TABLE agent_sla_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_sla_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status sla_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_sla_session (account_id, session_id)
);

CREATE TABLE agent_sla_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_sla_profile()
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
       OR NEW.extend_threshold IS DISTINCT FROM OLD.extend_threshold
       OR NEW.max_holds_per_certificate IS DISTINCT FROM OLD.max_holds_per_certificate
       OR NEW.max_nominated_windows IS DISTINCT FROM OLD.max_nominated_windows
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
    IF current_setting('app.sla_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.sla_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_sla_profile_protect
BEFORE INSERT OR UPDATE ON agent_sla_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_sla_profile();

CREATE FUNCTION protect_agent_sla_profile_extension_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status sla_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_sla_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile extension rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_sla_profile_extension_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_sla_profile_extension_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_sla_profile_extension_rule();

CREATE FUNCTION protect_agent_sla_clock_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_clock$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'clock snapshots are append-only';
  END IF;
  RETURN NEW;
END
$protect_clock$;

CREATE TRIGGER agent_sla_clock_snapshot_protect
BEFORE INSERT OR UPDATE ON agent_sla_clock_snapshot
FOR EACH ROW EXECUTE FUNCTION protect_agent_sla_clock_snapshot();

CREATE FUNCTION protect_agent_sla_extension_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.prior_clock_hash IS DISTINCT FROM OLD.prior_clock_hash
       OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.extension_steward_a IS DISTINCT FROM OLD.extension_steward_a
       OR NEW.extension_steward_b IS DISTINCT FROM OLD.extension_steward_b
       OR NEW.prior_compile_steward IS DISTINCT FROM OLD.prior_compile_steward THEN
      RAISE EXCEPTION 'extension certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.extension_steward_a = NEW.extension_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct extension stewards';
  END IF;
  IF NEW.extension_steward_a = NEW.prior_compile_steward
     OR NEW.extension_steward_b = NEW.prior_compile_steward THEN
    RAISE EXCEPTION 'prior-compile-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_sla_extension_certificate_protect
BEFORE INSERT OR UPDATE ON agent_sla_extension_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_sla_extension_certificate();

CREATE FUNCTION protect_agent_sla_fact_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_hold$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_window_id IS DISTINCT FROM OLD.source_window_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.prior_clock_hash IS DISTINCT FROM OLD.prior_clock_hash
       OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.hold_ordinal IS DISTINCT FROM OLD.hold_ordinal
       OR NEW.source_window_kind IS DISTINCT FROM OLD.source_window_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.key_lifecycle IS DISTINCT FROM OLD.key_lifecycle
       OR NEW.clock_lifecycle IS DISTINCT FROM OLD.clock_lifecycle
       OR NEW.attested_key_kind IS DISTINCT FROM OLD.attested_key_kind
       OR NEW.terminal_kind IS DISTINCT FROM OLD.terminal_kind
       OR NEW.extension_kind IS DISTINCT FROM OLD.extension_kind
       OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
       OR NEW.clock_disposition IS DISTINCT FROM OLD.clock_disposition
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id
       OR NEW.opens_nested_expiry IS DISTINCT FROM OLD.opens_nested_expiry THEN
      RAISE EXCEPTION 'fact hold identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks extension from rewriting confirmed trust';
  END IF;

  IF NEW.extension_kind = 'EXTEND_SUCCESSOR_CLOCK'
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks extension of a silent or unknown successor';
  END IF;

  IF NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from extension';
  END IF;

  IF NEW.extension_kind = 'EXTEND_SUCCESSOR_CLOCK'
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks extension against an unattested clock';
  END IF;

  IF NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks extension for invented successor history';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'extension-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.placement_kind = 'RESTORED_WITHOUT_WINNER' THEN
    RAISE EXCEPTION 'terminal-restore fence blocks restore of a sealed terminal';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.extension_kind = 'EXTEND_SUCCESSOR_CLOCK'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose extension after attenuation hops';
  END IF;

  IF NEW.terminal_kind = 'PERMANENT_QUARANTINE'
     AND NEW.fact_disposition NOT IN ('QUARANTINE_OMITTED', 'HALTED') THEN
    RAISE EXCEPTION 'quarantine-leak fence blocks visible restore of a quarantined body';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.fact_disposition NOT IN ('DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted facts';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence blocks opening another expiry plane';
  END IF;

  IF NEW.clock_disposition = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks rewinding a successor clock';
  END IF;

  IF NEW.clock_disposition = 'REARMED'
     AND NEW.successor_clock_hash IS NOT DISTINCT FROM NEW.prior_clock_hash THEN
    RAISE EXCEPTION 'clock-rearm fence requires a distinct successor clock hash';
  END IF;

  RETURN NEW;
END
$protect_hold$;

CREATE TRIGGER agent_sla_fact_hold_protect
BEFORE INSERT OR UPDATE ON agent_sla_fact_hold
FOR EACH ROW EXECUTE FUNCTION protect_agent_sla_fact_hold();

CREATE FUNCTION protect_agent_sla_effect_intent()
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

CREATE TRIGGER agent_sla_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_sla_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_sla_effect_intent();

CREATE FUNCTION approve_agent_sla_profile(
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
  stored_status sla_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_sla_profile
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
  FROM agent_sla_profile_extension_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one extension rule';
  END IF;

  PERFORM set_config(
    'app.sla_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_sla_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_sla_profile(
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
  stored_status sla_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_sla_profile
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
    'app.sla_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_sla_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_sla_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_sla_profile_authority;
ALTER FUNCTION revoke_agent_sla_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_sla_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_sla_profile_authority;
GRANT SELECT ON
  agent_sla_profile,
  agent_sla_profile_extension_rule
TO agent_sla_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_sla_profile TO agent_sla_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_sla_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_sla_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_sla_profile FROM PUBLIC;

CREATE INDEX agent_sla_session_work_idx ON agent_sla_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_sla_session_profile_idx ON agent_sla_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_sla_hold_certificate_idx ON agent_sla_fact_hold (
  account_id, certificate_id, sealed_at DESC, hold_id
);
CREATE INDEX agent_sla_hold_window_idx ON agent_sla_fact_hold (
  account_id, source_window_id, sealed_at DESC, hold_id
);
CREATE INDEX agent_sla_catalog_ref_idx ON agent_sla_packet_catalog (
  account_id, receipt_ref, sealed_at DESC, source_window_id
);
CREATE INDEX agent_sla_catalog_kind_idx ON agent_sla_packet_catalog (
  account_id, source_window_kind, sealed_at DESC, source_window_id
);
CREATE INDEX agent_sla_receipt_session_idx ON agent_sla_extension_receipt (
  account_id, session_id, extended_at DESC, extension_id
);
CREATE INDEX agent_sla_certificate_session_idx ON agent_sla_extension_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_sla_clock_session_idx ON agent_sla_clock_snapshot (
  account_id, session_id, captured_at DESC, clock_snapshot_id
);
CREATE INDEX agent_sla_effect_work_idx ON agent_sla_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_sla_audit_time_idx ON agent_sla_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_sla_perception_status_idx ON agent_sla_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_sla_command_expiry_idx ON agent_sla_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_sla_invalidation_certificate_idx ON agent_sla_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_sla_authorization_evidence',
    'agent_sla_profile',
    'agent_sla_profile_extension_rule',
    'agent_sla_packet_catalog',
    'agent_sla_session',
    'agent_sla_nomination_window',
    'agent_sla_clock_snapshot',
    'agent_sla_extension_receipt',
    'agent_sla_extension_certificate',
    'agent_sla_fact_hold',
    'agent_sla_invalidation',
    'agent_sla_effect_intent',
    'agent_sla_budget_ledger',
    'agent_sla_terminal_record',
    'agent_sla_command_result',
    'agent_sla_audit_head',
    'agent_sla_audit_event',
    'agent_sla_audit_anchor',
    'agent_sla_perception_snapshot',
    'agent_sla_projection_checkpoint'
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
effect-prepare each run in a single ACID row-store
transaction with session compare-and-swap. Certificate seal
never joins a neighbor board write and never updates the
disputed fact.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers set `app.account_id`
before query. Composite primary keys and every access index
lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API.
Long-running notify work returns durable state, not a
synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentSlaSessionStatus {
  OPEN
  NOMINATING
  EXTENDING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentSlaBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentSlaSourceKind {
  SEALED_TWS_WORKING_SET_PACKET
  SEALED_REQUIRE_HUMAN_SLOT
  SEALED_QUARANTINE_OMIT_SLOT
  SEALED_HALT_SCOPE_SNAPSHOT
  SEALED_COMPILE_RECEIPT
}

enum AgentSlaPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentSlaKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentSlaClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentSlaAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentSlaTerminalKind {
  REQUIRE_HUMAN
  PERMANENT_QUARANTINE
  HOLD_UNKNOWN
  REJECT_CYCLE_CONFIRM
  REJECT_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentSlaExtensionKind {
  EXTEND_SUCCESSOR_CLOCK
  HOLD_EXTENSION_WINDOW
  REJECT_EXTENSION_AS_RESTORE
  SKIP
  UNKNOWN_EFFECT
}

enum AgentSlaFactDisposition {
  DISPUTED_HELD
  HALTED
  QUARANTINE_OMITTED
  RESTORED
  UNKNOWN_EFFECT
}

enum AgentSlaClockDisposition {
  REARMED
  UNCHANGED
  REGRESSED
  UNKNOWN_EFFECT
}

enum AgentSlaPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentSlaEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentSlaNextAction {
  NOMINATE_SEALED_WORKING_SET
  REFRESH_SUCCESSOR_CLOCK
  EVALUATE_SLA_EXTENSION
  SEAL_SLA_EXTENSION_CERTIFICATE
  INVALIDATE_SLA_EXTENSION
  PREPARE_SLA_EXTENSION_EFFECT
  SLA_EXTENSION_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentSlaBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  WINDOW_MISSING
  EXTENSION_NOT_READY
  HISTORY_REWRITE_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  EXTENSION_AS_RESTORE_DENIED
  EXTENSION_AS_CONFIRMATION_DENIED
  TERMINAL_RESTORE_DENIED
  QUARANTINE_LEAK_DENIED
  NESTED_EXPIRY_DENIED
  PRIOR_STEWARD_EXCLUSION_DENIED
  LEDGER_SCAN_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  CLOCK_REGRESSION_DENIED
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

enum AgentSlaUncertaintyResolution {
  RETRY_SAME_WINDOW
  ACCEPT_OBSERVATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentSlaInvalidationReason {
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

type AgentSlaBudget {
  nominateUnits: Long!
  extendUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  extendThreshold: Int!
  maxHoldsPerCertificate: Int!
  maxNominatedWindows: Int!
}

type AgentSlaProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  extendThreshold: Int!
  maxHoldsPerCertificate: Int!
  maxNominatedWindows: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentSlaSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentSlaSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentSlaBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentSlaNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentSlaSourceKind!
  terminalKind: AgentSlaTerminalKind!
  placementKind: AgentSlaPlacementKind!
  keyLifecycle: AgentSlaKeyLifecycle!
  clockLifecycle: AgentSlaClockLifecycle!
  disputedFactHash: SHA256!
  priorClockHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  haltScopeHash: SHA256!
  priorCompileSteward: String!
  nominationHash: SHA256!
  nominatedAt: DateTime!
  expiresAt: DateTime!
}

type AgentSlaClockSnapshot {
  accountId: ID!
  clockSnapshotId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  haltScopeHash: SHA256!
  lastSourceCertificateId: ID!
  capturedAt: DateTime!
}

type AgentSlaExtensionReceipt {
  accountId: ID!
  extensionId: ID!
  sessionId: ID!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  disputedFactHash: SHA256!
  haltScopeHash: SHA256!
  attenuationHash: SHA256!
  factSetHash: SHA256!
  extensionHash: SHA256!
  extendedAt: DateTime!
}

type AgentSlaExtensionCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  disputedFactHash: SHA256!
  haltScopeHash: SHA256!
  attenuationHash: SHA256!
  factSetHash: SHA256!
  extensionStewardA: String!
  extensionStewardB: String!
  priorCompileSteward: String!
  holdWatermark: Int!
  sealedAt: DateTime!
}

type AgentSlaFactHold {
  accountId: ID!
  holdId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentSlaSourceKind!
  holdOrdinal: Int!
  status: AgentSlaBindingStatus!
  placementKind: AgentSlaPlacementKind!
  keyLifecycle: AgentSlaKeyLifecycle!
  clockLifecycle: AgentSlaClockLifecycle!
  attestedKeyKind: AgentSlaAttestedKeyKind!
  terminalKind: AgentSlaTerminalKind!
  extensionKind: AgentSlaExtensionKind!
  factDisposition: AgentSlaFactDisposition!
  clockDisposition: AgentSlaClockDisposition!
  purposeRelation: AgentSlaPurposeRelation!
  disputedFactHash: SHA256!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  haltScopeHash: SHA256!
  opensNestedExpiry: Boolean!
  expiresAt: DateTime!
  sealedAt: DateTime!
}

type AgentSlaEffectObservation {
  effectId: ID!
  status: AgentSlaEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentSlaPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentSlaSessionStatus!
  summary: AgentUntrustedText!
  sealedHoldCount: Int!
  clockRearmedCount: Int!
  disputedHeldCount: Int!
  quarantineOmittedCount: Int!
  rejectRestoreCount: Int!
  holdWindowCount: Int!
  unknownHoldCount: Int!
  skippedHoldCount: Int!
  invalidatedHoldCount: Int!
  uncertainEffectIntents: [AgentSlaEffectObservation!]!
  remainingBudget: AgentSlaBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentSlaNextAction!]!
  blockedReasons: [AgentSlaBlockedReason!]!
  cardHash: SHA256!
}

type AgentSlaMutationResult {
  decision: String!
  session: AgentSlaSession
  certificate: AgentSlaExtensionCertificate
  hold: AgentSlaFactHold
  receipt: AgentSlaNominationReceipt
  snapshot: AgentSlaClockSnapshot
  extension: AgentSlaExtensionReceipt
  perception: AgentSlaPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentSlaBudgetInput {
  nominateUnits: Long!
  extendUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  extendThreshold: Int!
  maxHoldsPerCertificate: Int!
  maxNominatedWindows: Int!
}

input CreateSlaExtensionSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentSlaBudgetInput!
}

input NominateSealedWorkingSetInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input RefreshSuccessorClockInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedPriorClockHash: SHA256!
  proposedSuccessorClockHash: SHA256!
  idempotencyKey: String!
}

input EvaluateSlaExtensionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedPriorClockHash: SHA256!
  expectedSuccessorClockHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealSlaExtensionCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  extensionId: ID!
  consumerRef: String!
  extensionStewardA: String!
  extensionStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input InvalidateSlaExtensionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceWindowId: ID!
  reasonCode: AgentSlaInvalidationReason!
  idempotencyKey: String!
}

input PrepareSlaExtensionEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input SlaExtensionEffectUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: AgentSlaUncertaintyResolution!
  idempotencyKey: String!
}

input AgentSlaProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentSlaProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentSlaProfile
  agentSlaSession(accountId: ID!, sessionId: ID!): AgentSlaSession
  agentSlaExtensionCertificate(
    accountId: ID!
    certificateId: ID!
  ): AgentSlaExtensionCertificate
  agentSlaPerceptionCard(accountId: ID!, sessionId: ID!): AgentSlaPerceptionCard
  agentSlaNominatedWindow(
    accountId: ID!
    sessionId: ID!
    sourceWindowId: ID!
  ): AgentSlaNominationReceipt
  agentSlaSearchProfiles(input: AgentSlaProfileSearchInput!): [AgentSlaProfile!]!
}

type Mutation {
  createSlaExtensionSession(
    input: CreateSlaExtensionSessionInput!
  ): AgentSlaMutationResult!
  nominateSealedWorkingSet(
    input: NominateSealedWorkingSetInput!
  ): AgentSlaMutationResult!
  refreshSuccessorClock(
    input: RefreshSuccessorClockInput!
  ): AgentSlaMutationResult!
  evaluateSlaExtension(
    input: EvaluateSlaExtensionInput!
  ): AgentSlaMutationResult!
  sealSlaExtensionCertificate(
    input: SealSlaExtensionCertificateInput!
  ): AgentSlaMutationResult!
  invalidateSlaExtension(
    input: InvalidateSlaExtensionInput!
  ): AgentSlaMutationResult!
  prepareSlaExtensionEffect(
    input: PrepareSlaExtensionEffectInput!
  ): AgentSlaMutationResult!
  slaExtensionEffectUncertainty(
    input: SlaExtensionEffectUncertaintyInput!
  ): AgentSlaMutationResult!
  closeSlaExtensionSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentSlaMutationResult!
  approveSlaExtensionProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentSlaMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when hold ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies. They never include a `resolvedFactHash`.
- `sealSlaExtensionCertificate` is rejected with `HISTORY_REWRITE_DENIED`
  when an extension would invent `TRUSTED_ENROLLED`, with
  `EXTENSION_AS_RESTORE_DENIED` when a disputed fact would become visible,
  with `EXTENSION_AS_CONFIRMATION_DENIED` when clock re-arm is treated as
  confirmation, with `CLOCK_REGRESSION_DENIED` when the successor clock
  would move backward, with `QUARANTINE_LEAK_DENIED` when a
  `PERMANENT_QUARANTINE` body would become visible, with
  `NESTED_EXPIRY_DENIED` when another expiry-containment-review-resolution
  plane would open, and with `LEDGER_SCAN_DENIED` when the prior clock
  would be computed by walking a vote, TTL, page, ack, escalation, review,
  or resolution ledger.

## 10. Procedural memory

Approved extension profiles are procedural memory: versioned
instructions for how a sealed halt-aware working-set packet
re-arms a successor clock without restoring a disputed fact
and without rewriting extension silence as dual-control
success or `TRUSTED_ENROLLED`. Procedure refs may point to
human-escalation or permanent-quarantine playbook steps.
Profiles are immutable after approval; agents perceive them
as tagged instructions, never as authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses account-owned embeddings and
pgvector/HNSW-compatible ANN. Retrieval is a discovery
hint only. Every ANN query must include `account_id`
equality before `topK`. Cross-tenant HNSW is forbidden.
An embedding hit never authorizes nominate, refresh,
evaluate, seal, or notify.

```sql
CREATE TABLE agent_sla_profile_embedding (
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
    REFERENCES agent_sla_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_sla_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sla_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_sla_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped packet-catalog or board walks are FULL SCAN REJECTED.
```

## 12. Agent perception

Agents receive perception cards summarizing session status,
sealed-hold, clock-rearmed, disputed-held, quarantine-omitted,
reject-restore, hold-window, unknown, skipped, and
invalidated counts, uncertain notify intents, remaining
budgets, procedure tags, allowed next actions, and blocked
reasons. Summary text is `UntrustedText`. Cards never embed
raw private keys, redacted fact bodies, or a winning fact
hash. `cardHash` makes perception replayable.

Agents perceive `EXTEND_SUCCESSOR_CLOCK` with
`clock_disposition = REARMED` and
`fact_disposition = DISPUTED_HELD` as a clock watermark
that moved while the dispute stayed held. They perceive
`QUARANTINE_OMITTED` as a sealed omit that still forbids
showing the quarantined body. They perceive
`REJECT_EXTENSION_AS_RESTORE` as a trusted negative.
They perceive `HOLD_EXTENSION_WINDOW` as bounded
uncertainty, not as confirmation. They perceive `SKIP` as
a sealed refusal — never as a key that "must have been
trusted because the SLA was extended."

Metadata tags on the card are `sla-extension`,
`clock-rearmed`, `fact-held`, and the profile's procedure
ref. Those tags are for retrieval. They are not grants.

## 13. ACID and consistency

### Row store

Session compare-and-swap, nomination receipts, clock
snapshots, extension receipts, certificate seals, and audit
appends are ACID transactions in the hybrid row store.
Fact holds and clock hashes commit together. A restored
fact cannot commit in a later "best effort" write.

### Columnar store

Columnar projections may accelerate analytics over sealed
extension certificates but are not authoritative for
`REARMED`, `DISPUTED_HELD`, or `QUARANTINE_OMITTED`
outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable
profile approval events. Staleness is visible via source
watermarks. The vector path cannot seal a certificate.

### External tools

Notify dispatch side-effects are not silently ACID-coupled.
Silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Hold and threshold caps on extensions per certificate and
  per session.
- Budget ledgers for NOMINATE, EXTEND, SEAL, VECTOR,
  INVALIDATE, and NOTIFY.
- Purpose attenuation narrowing only.
- Forced RLS on every table, including profile embeddings.
- Planner rejects unscoped packet-catalog, clock-catalog,
  working-set, grant-graph, citation, confirm-ledger,
  vote-ledger, TTL-ledger, page-ledger, ack-ledger,
  escalation-ledger, review-ledger, containment-ledger,
  resolution-ledger, promotion-ledger, or board scans as
  **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without
  scanning neighbors.
- Extension never auto-restores neighbor-visible board
  mutations from halted slots.
- Nested-expiry fence rejects opening another
  expiry-containment-review-resolution plane.
- Quarantine-leak fence rejects visible restore of a
  `PERMANENT_QUARANTINE` body.
- Extension-as-restore fence rejects `fact_disposition =
  RESTORED` even when the successor clock hash is new.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding sealed working-set packets whose clocks lapse by
  scanning the confirmation-vote, TTL-retirement, page,
  ack, escalation, review, or resolution ledger (rejected;
  nominate by `(account_id, source_window_id)`).
- Computing `prior_clock_hash` by walking every sealed
  governance certificate for an account (rejected; point
  lookup of the packet catalog and the clock snapshot).
- Re-arming clocks by walking all notify intents or all
  fact holds for an account (rejected).
- Vector search without an `account_id` predicate
  (rejected).
- Invalidation by scanning all certificates for an account
  (rejected; use certificate-keyed indexes).

Any of those plans is **FULL SCAN REJECTED** before
execution. A board with 1M+ rows must not be visited to
re-arm one successor clock.

### Required access paths

- Window nomination: primary key
  `(account_id, source_window_id)`.
- Clock refresh: unique
  `(account_id, session_id, source_window_id, successor_clock_hash)`.
- Evaluate and seal: primary key `(account_id, extension_id)`
  and `(account_id, certificate_id)`, plus unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Fact holds by certificate or window: composite indexes
  leading with `account_id`.
- Notify work: partial index on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate, or
requiring an unscoped board, working-set, grant-graph,
packet-catalog, clock-catalog, confirm-ledger, vote-ledger,
TTL-ledger, page-ledger, ack-ledger, escalation-ledger,
review-ledger, containment-ledger, resolution-ledger,
promotion-ledger, or citation scan, is **FULL SCAN
REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay
reconstructs session, clock snapshot, extension receipt,
certificate, and fact-hold state without LLM calls. Replay
can show that `successor_clock_hash` changed while
`disputed_fact_hash` did not. Replay cannot invent a winner
the seal never stored.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged identifiers: blocked
  by forced RLS and primary-key scope.
- Purpose amplification: attenuation hash must narrow
  relative to the packet and session purposes.
- Sticky success after supersession: invalidation plus
  re-evaluation plus notify uncertainty plus profile
  revocation.
- Historical silence invented as `TRUSTED_ENROLLED`:
  history-rewrite, silence-success, and
  extension-as-confirmation fences.
- First-enrollment key auto-promoted by a clock re-arm:
  first-enrollment-auto-trust fence.
- Prior clock computed by walking vote, TTL, page, ack,
  escalation, review, or containment ledgers: ledger-scan
  fence and **FULL SCAN REJECTED**.
- Disputed fact restored because the clock moved:
  extension-as-restore fence. There is no
  `resolved_fact_hash`.
- Halted terminal restored into a visible slot:
  terminal-restore fence.
- Quarantined body shown because the SLA was extended:
  quarantine-leak fence.
- Hop leak of donor purpose after attenuation hops:
  hop-leak fence.
- Successor clock moved backward to rewrite history:
  clock-regression fence.
- Same compile steward approves their own extension:
  prior-compile-steward exclusion.
- Opening another nested expiry after extension:
  nested-expiry fence.
- Silent notify success: `UNKNOWN_EFFECT` until
  acknowledgement.
- Recursive catalog or board storms: budgets and
  **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced
  approve and revoke only.

## 18. Observability and SLOs

- Open, nominate, refresh, evaluate, seal, and perception
  p99 latency budgets for 99.99% control-plane availability.
- History-rewrite rejection, silence-success rejection,
  first-enrollment-auto-trust rejection,
  extension-as-restore rejection, clock-regression
  rejection, terminal-restore rejection, quarantine-leak
  rejection, nested-expiry rejection, ledger-scan
  rejection, purpose-amplification rejection, and
  `UNKNOWN_EFFECT` rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection
  counters per account.
- Audit chain gap alerts.
- A re-armed clock with a changed disputed-fact hash is a
  page-worthy invariant break, not a success.

## 19. Rollout

### Phase 1: shadow extension

Approve extension profiles and validate packet-catalog
nomination without durable certificates.

### Phase 2: reject-as-restore only

Allow sealed certificates whose extension kind is
`REJECT_EXTENSION_AS_RESTORE` or `SKIP`. Clock re-arm stays
closed.

### Phase 3: clock re-arm with facts held

Enable budgeted `EXTEND_SUCCESSOR_CLOCK` only when
`fact_disposition` is `DISPUTED_HELD` or `HALTED`,
`clock_disposition` is `REARMED`, and the successor clock
hash differs from the prior clock hash. A sealed
certificate never writes `TRUSTED_ENROLLED`.

### Phase 4: quarantine omit and notify uncertainty

Enable `QUARANTINE_OMITTED` holds for
`PERMANENT_QUARANTINE` slots under point-lookup clock
refresh. Notify intents stay `UNKNOWN_EFFECT` until
acknowledged. `HOLD_EXTENSION_WINDOW` cannot invent
confirmation from an unanswered extension.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor
budgets. Agents may discover profiles. They may not treat
a re-armed clock as permission to read a disputed fact or
to open another nested expiry plane.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite plus pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability,
  history-rewrite, extension-as-restore, and effect start
  state.

### Behavioral validation

- Nominate requires sealed packet-catalog material by
  point lookup and hash match.
- Refresh of the successor clock is a point lookup and
  never a vote-ledger, page-ledger, ack-ledger, or
  escalation-ledger scan.
- Evaluate binds prior clock, successor clock, disputed
  fact, halt scope, and attenuation under budget, and
  rejects `RESTORED`.
- Seal is rejected when an extension would become
  `TRUSTED_ENROLLED`, when a disputed fact would be
  restored, when the clock would regress, when a
  quarantined body would become visible, when another
  nested expiry would open, or when the prior clock would
  be computed by scanning ledgers. Seal never invents a
  winning fact hash.
- Certificate seal binds fact holds under prior-clock,
  successor-clock, disputed-fact, halt-scope, and
  attenuation hashes.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- On boards with 1M+ rows, no nominate, refresh, evaluate,
  or seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed extension certificates
  after process restart and shows the disputed fact hash
  unchanged.

## 21. Product decision

Adopt the SLA Extension Certificate Plane as the
deterministic way to re-arm a successor clock on a sealed
halt-aware working set.

Ship it because:

1. It preserves ACID and multi-tenant isolation while
   closing the clock-lapse gap without history rewrite,
   silence-success, first-enrollment auto-trust,
   extension-as-restore, ledger scans, halt leak,
   quarantine leak, purpose amplification, invented
   winners, or vote, page, ack, escalation, containment,
   review, resolution, or promotion ledger walks.
2. Account-leading indexes, the extension-as-restore
   fence, and **FULL SCAN REJECTED** planner rules protect
   99.99% neighbor latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW
   profile discovery, perception cards, and hash-chained
   audit replay make the plane agent-ready without putting
   probabilistic AI inside the data engine.
4. This increment re-arms clocks only. The next increment
   should attach envelope-scoped purpose gates to citations
   placed into working sets whose clocks were extended by
   these certificates. Do not add another nested
   expiry-containment-review-resolution plane. Do not
   treat a re-armed clock as `TRUSTED_ENROLLED`.
