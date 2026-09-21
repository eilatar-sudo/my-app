# mondayDB Agentic Terminal Working-Set Compilation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-21.v1`

## 1. Why this plane, before how

The 2026-09-20 Cycle-Bound Terminal Plane can now dual-control
seal `REQUIRE_HUMAN` or `PERMANENT_QUARANTINE` after a
first-enrollment key rotates the governance cycle
`max_cycle_count` times. It does not decide **how those
sealed terminal certificates compile into a halt-aware
working set** that an agent may perceive — without scanning
every terminal, cycle-census, vote, page, ack, escalation,
containment, review, resolution, or promotion ledger,
rewriting compilation silence into `TRUSTED_ENROLLED`,
leaking a quarantined body into visible context, or treating
compilation as permission to open another nested expiry.

Without a terminal working-set plane, operators and agents
either:

- walk every sealed terminal certificate looking for "what
  this agent may see now" (neighbor-harmful on boards with
  1M+ rows), or
- sticky-copy `REQUIRE_HUMAN` into a restored slot, so
  compilation becomes invented confirmation, a
  `PERMANENT_QUARANTINE` body leaks into agent context, and
  a hop-attenuated citation is amplified back to the donor
  purpose.

The product trade-off is **compilation fluency versus
terminal-halt isolation**:

- Compiling every sealed terminal certificate into a fully
  visible working set maximizes agent fluency and reduces
  re-grounding cost, but creates compile-as-confirmation,
  quarantine leak, invented winners, nested-expiry re-entry,
  and unauditable purpose amplification.
- Compiling a sealed working-set packet under an approved
  compile profile, certificate-catalog point lookups,
  halt-scope snapshots, terminal-restore fences, quarantine-
  leak fences, compile-as-confirmation fences, nested-expiry
  fences, and steward budgets adds one bounded compile
  transaction and short-lived packet storage.
- Semantic similarity may discover compile profiles, but it
  must never decide whether a sealed terminal certificate
  may be nominated, a halt scope refreshed, a slot compiled,
  a packet sealed, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved compile profile defines allowed source kinds,
   allowed compile kinds, dual-control compile-steward
   policy, purpose attenuation, and notify policy.
   Compilation **never** invents a winning fact hash and
   **never** rewrites a sealed terminal as
   `TRUSTED_ENROLLED`.
2. A compile session opens under purpose, budget, and
   authorization fences, and only nominates sealed
   `REQUIRE_HUMAN`, `PERMANENT_QUARANTINE`, `HOLD_UNKNOWN`,
   `REJECT_CYCLE_CONFIRM`, and `REJECT_NESTED_EXPIRY`
   certificates by point lookup from the terminal
   certificate catalog. Halt scope is read from a sealed
   snapshot — never computed by walking ledgers.
3. mondayDB compiles slots whose placement kind is a pure
   function of `(source_window_kind, terminal_kind,
   placement_kind, key_lifecycle, clock_lifecycle,
   attested_key_kind, requested_purpose_hash,
   attenuation_hash, hop_count, halt_scope_hash,
   compile_kind)`. Silence cannot become historical
   success. `REQUIRE_HUMAN` and `PERMANENT_QUARANTINE`
   compile only to `HALTED`, `EXTENDED_HALT`, or `OMITTED`
   — never `RESTORED_WITHOUT_WINNER`.
4. Sealing a working-set packet binds
   `consumer_ref + purpose_hash + halt_scope_hash +
   disputed_fact_set_hash + placement_set_hash +
   terminal_set_hash + attenuation_hash`. The packet
   **must not** emit a `resolved_fact_hash`.
5. Upstream invalidation marks packets stale; notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped terminal-catalog, cycle-census, vote-ledger,
   page-ledger, ack-ledger, escalation-ledger, containment-
   ledger, review-ledger, resolution-ledger, promotion-
   ledger, working-set, grant-graph, or board scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "recompile every sealed terminal
certificate forever" loops are rejectable before they scan
boards with 1M+ rows. Perception is restored by sealed
working-set packets, not by magic visibility inside the
engine.

### Product outcome

For any terminal working-set compilation, mondayDB can
answer:

- Which profile, principal, and session authorized the
  nomination, halt-scope refresh, compile, seal,
  invalidate, or notify dispatch?
- Which nominated sealed terminal certificates, halt
  scopes, placement kinds, hop counts, attenuation hashes,
  and compile kinds were bound?
- Is the working-set packet still current, invalidated,
  halt-visible, quarantine-omitted, or awaiting notify
  acknowledgement?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the compilation history be replayed without invoking
  an LLM?

## 2. Scope and ownership

The Terminal Working-Set Compilation Plane owns:

1. Immutable approved compile profiles as procedural
   memory of "how a sealed `REQUIRE_HUMAN` or
   `PERMANENT_QUARANTINE` certificate compiles into a
   halt-aware working set without amplifying purpose,
   leaking quarantined bodies, rewriting attested history,
   scanning vote, page, ack, escalation, review,
   resolution, or containment ledgers, or inventing
   `TRUSTED_ENROLLED` from compilation silence."
2. Tenant-scoped compile sessions with purpose and budget
   fences.
3. Deterministic nomination of sealed terminal certificates
   by point lookup — never ledger or board scans.
4. Deterministic halt-scope snapshots, compile receipts,
   sealed working-set packets, and immutable placement
   slots that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded
   compile budgets.

It integrates with, but does not replace:

- **Cycle-Bound Terminal Plane:** supplies sealed
  `REQUIRE_HUMAN` / `PERMANENT_QUARANTINE` /
  `HOLD_UNKNOWN` / `REJECT_CYCLE_CONFIRM` /
  `REJECT_NESTED_EXPIRY` certificates this plane may
  compile. This plane never seals a new terminal and never
  invents `TRUSTED_ENROLLED`.
- **Certificate Placement / Envelope Purpose Gate /
  Decision Memory:** consume sealed working-set packets as
  halt-aware context. This plane never authorizes tool
  mutation.
- **Emergency Containment:** the coarse stop/drain path
  used when a compiled `PERMANENT_QUARANTINE` slot must
  halt workspace-wide dispatch; this plane is purpose-
  scoped compilation, not workspace-wide containment.
- **Query Governor / Budgets:** reserves nominate,
  compile, vector, seal, invalidate, and notify units.

### Non-goals

- Letting an LLM decide that a sealed terminal "feels
  visible enough" or "needs one more review."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative working-set packets from
  columnar or vector projections.
- Cross-account compilation or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted plaintext.
- Claiming distributed atomicity with external pager or
  notify providers.
- Inventing a winning fact hash when a terminal compiles.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`
  because a working set was compiled.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to compute halt scope.
- Opening another nested expiry-containment-review-
  resolution plane from a compiled packet.
- Restoring a `PERMANENT_QUARANTINE` body into a visible
  slot.

## 3. Product contract

### 3.1 Compile profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_REQUIRE_HUMAN_CERT`,
  `SEALED_PERMANENT_QUARANTINE_CERT`,
  `SEALED_HOLD_UNKNOWN_CERT`,
  `SEALED_REJECT_CYCLE_CONFIRM_CERT`,
  `SEALED_REJECT_NESTED_EXPIRY_CERT`,
  `SEALED_CBT_TERMINAL_CERTIFICATE`,
  `SEALED_CYCLE_CENSUS`);
- compile threshold (distinct compile-steward principals,
  minimum 2), max slots per packet, and max nominated
  windows;
- compile policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`,
  `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `COMPILE_NEVER_CONFIRMS`, `NESTED_EXPIRY_NEVER_OPENS`,
  `LEDGER_NEVER_SCANNED`, `HALT_DENIES_TERMINAL_RESTORE`,
  `QUARANTINE_NEVER_LEAKS`, `PURPOSE_NARROW_ONLY`,
  `SUCCESSOR_NEVER_RESTORES_WINNER`);
- purpose attenuation rules (narrowing only; never
  amplification);
- allowed compile kinds (`REQUIRE_HUMAN_HALT`,
  `PERMANENT_QUARANTINE_OMIT`, `HOLD_UNKNOWN_SLOT`,
  `REJECT_CYCLE_OMIT`, `REJECT_NESTED_EXPIRY_OMIT`,
  `SKIP`) and notify policy after seal, invalidation, or
  upstream terminal change;
- optional procedural refs for "how to present a sealed
  terminal without inventing a winner."

Only `APPROVED` versions are discoverable or executable.

### 3.2 Session contract

A session opens under an approved profile, purpose hash,
budget reservations, and authorization evidence. Duplicate
`(account_id, idempotency_key)` is rejected. Nomination is
source-window point lookup against the terminal certificate
catalog. Refresh halt-scope is a point lookup against the
nominated sealed snapshot — never a ledger scan.

### 3.3 Compile and packet contract

Compile is a pure function of nominated windows, halt-scope
snapshots, clock lifecycles, dual-control compile-steward
counts, and purpose relation. It never walks catalogs.
`REQUIRE_HUMAN` and `PERMANENT_QUARANTINE` may only compile
to `HALTED`, `EXTENDED_HALT`, or `OMITTED`. Seal binds
halt-scope, disputed-fact-set, placement-set, terminal-set,
and attenuation hashes. The packet must not store
`resolved_fact_hash`. A sealed packet cannot evaluate to a
kind that implies `TRUSTED_ENROLLED`.

### 3.4 Invalidation and effect contract

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Observation of
unknown remaining halt scope remains `HOLD_UNKNOWN` until a
trusted refresh arrives.

### 3.5 Availability contract

Open, nominate, refresh, compile, seal, and perception p99
latency stay inside the 99.99% control-plane budget.
Neighbor boards with 1M+ rows are protected by **FULL SCAN
REJECTED** planner rules and compile-unit budgets.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set
   `app.account_id` before query.
2. Profiles start as `DRAFT` and become `APPROVED` only
   through an authority-fenced approval function.
3. Sealed profile definitions and compile rules are
   immutable.
4. Slot identity
   (`source_window_id`, `disputed_fact_hash`,
   `attenuation_hash`, `slot_ordinal`,
   `halt_scope_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers;
   amplification is rejected.
6. Window nomination uses point lookup by
   `(account_id, source_window_id)` — never full terminal-
   catalog, vote-ledger, TTL-ledger, page-ledger,
   ack-ledger, escalation-ledger, review-ledger, or board
   scans.
7. Notify intents start as `PREPARED` and may become
   `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never
   authorizes nominate/refresh/compile/seal/notify.
10. Silence and unknown windows cannot compile to
    `REQUIRE_HUMAN_HALT` in a way that implies
    `TRUSTED_ENROLLED` (history-rewrite and silence-success
    fences).
11. Halted, extended-halt, and omitted windows cannot
    compile to `RESTORED_WITHOUT_WINNER`
    (terminal-restore and halt-leak fences).
12. Requested purposes that amplify a window attenuation
    hash are rejected (purpose-amplification fence).
13. Successor compilation cannot emit a winning fact hash
    or restore a halted body (successor-leak fence).
14. A working-set packet never writes
    `attested_key_kind = TRUSTED_ENROLLED`
    (compile-as-confirmation fence).
15. `REQUIRE_HUMAN_HALT` and `PERMANENT_QUARANTINE_OMIT`
    require two distinct compile-steward principals who
    are not the nominating principal.
16. Working-set packets bind halt scope, disputed fact set,
    placement set, terminal set, and attenuation hashes;
    they never invent a winning fact hash.
17. Plans that require unscoped board, session, working-set,
    grant-graph, terminal-catalog, clock-catalog, confirm-
    ledger, vote-ledger, TTL-ledger, page-ledger, ack-
    ledger, escalation-ledger, review-ledger, containment-
    ledger, resolution-ledger, promotion-ledger, or
    citation-ledger scans are **FULL SCAN REJECTED**.
18. This plane never opens another nested expiry-
    containment-review-resolution session
    (`REJECT_NESTED_EXPIRY_OMIT`).
19. `PERMANENT_QUARANTINE` bodies never enter a visible
    slot (quarantine-leak fence).

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate compile rules. Approval
validates definition hash, requires at least one compile
rule, requires `compile_threshold >= 2`, requires
`max_slots_per_packet BETWEEN 1 AND 256`, and fences the
status transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash,
budget reservations, and authorization evidence. The
session starts `OPEN` with `state_revision = 0`. Duplicate
`(account_id, idempotency_key)` is rejected.

### 5.3 Nominate, refresh, and compile

Nominate performs a point lookup on the terminal
certificate catalog and writes an immutable nomination
receipt with `halt_scope_hash` copied from the sealed
snapshot. Refresh halt-scope is a point lookup against
that same source — never a vote-ledger, page-ledger,
ack-ledger, escalation-ledger, review-ledger, or
resolution-ledger walk. Compile is a pure function of
nominated windows, halt-scope hashes, clock lifecycles,
and purpose relation. It never walks the catalog.

### 5.4 Seal working-set packet

Seal binds the compile hashes to a consumer ref. The
packet stores halt-scope, disputed-fact-set, placement-set,
terminal-set, and attenuation hashes. It must not store
`resolved_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is source-window keyed. Notify intents start
`PREPARED` and may become `UNKNOWN_EFFECT`. Dispatch never
scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one
compile rule. Approval is authority-fenced.

### 6.2 Session open

An authorized principal opens a session under the approved
version.

### 6.3 Nominating / refreshing / compiling

The session moves `OPEN → NOMINATING → COMPILING` by CAS.
Budgets decrement in the ledger. Halt-scope snapshots are
append-only.

### 6.4 Sealed / invalidated

Seal moves the session to `SEALED`. Upstream revocation
writes an invalidation and may move slots to
`INVALIDATED`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`,
and `UNKNOWN_EFFECT` are terminal. Terminal records are
append-only. A sealed `PERMANENT_QUARANTINE_OMIT` slot is
also terminal for the first-enrollment key: no later plane
may restore its body.

### 6.6 Retain

Audit events, packets, and slots retain for the account's
legal hold. Perception snapshots are derived and may be
compacted after Merkle anchor.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SourceWindowId = string & { readonly brand: "SourceWindowId" };
type CompileId = string & { readonly brand: "CompileId" };
type PacketId = string & { readonly brand: "PacketId" };
type SlotId = string & { readonly brand: "SlotId" };
type HaltScopeId = string & { readonly brand: "HaltScopeId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SEALED_TERMINAL_CERTIFICATE"
  | "REFRESH_HALT_SCOPE"
  | "COMPILE_TERMINAL_WORKING_SET"
  | "SEAL_WORKING_SET_PACKET"
  | "INVALIDATE_WORKING_SET"
  | "PREPARE_WORKING_SET_EFFECT"
  | "WORKING_SET_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type TerminalWorkingSetBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "WINDOW_MISSING"
  | "COMPILE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "COMPILE_AS_CONFIRMATION_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
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
  | "COMPILING"
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
  | "SEALED_REQUIRE_HUMAN_CERT"
  | "SEALED_PERMANENT_QUARANTINE_CERT"
  | "SEALED_HOLD_UNKNOWN_CERT"
  | "SEALED_REJECT_CYCLE_CONFIRM_CERT"
  | "SEALED_REJECT_NESTED_EXPIRY_CERT"
  | "SEALED_CBT_TERMINAL_CERTIFICATE"
  | "SEALED_CYCLE_CENSUS";

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

type CompileKind =
  | "REQUIRE_HUMAN_HALT"
  | "PERMANENT_QUARANTINE_OMIT"
  | "HOLD_UNKNOWN_SLOT"
  | "REJECT_CYCLE_OMIT"
  | "REJECT_NESTED_EXPIRY_OMIT"
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

interface TerminalWorkingSetBudget {
  readonly nominateUnits: number;
  readonly compileUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly compileThreshold: number;
  readonly maxSlotsPerPacket: number;
  readonly maxNominatedWindows: number;
}

interface TerminalWorkingSetProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly compileThreshold: number;
  readonly maxSlotsPerPacket: number;
  readonly maxNominatedWindows: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface TerminalWorkingSetSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: TerminalWorkingSetBudget;
  readonly consumed: Omit<
    TerminalWorkingSetBudget,
    | "maxWallTimeMs"
    | "compileThreshold"
    | "maxSlotsPerPacket"
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
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly haltScopeHash: Sha256;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
  readonly expiresAt: Timestamp;
}

interface HaltScopeSnapshot {
  readonly accountId: AccountId;
  readonly haltScopeId: HaltScopeId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly haltScopeHash: Sha256;
  readonly lastSourceCertificateId: PacketId;
  readonly capturedAt: Timestamp;
}

interface TerminalWorkingSetCompileReceipt {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly haltScopeHash: Sha256;
  readonly disputedFactSetHash: Sha256;
  readonly placementSetHash: Sha256;
  readonly terminalSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly compileHash: Sha256;
  readonly compiledAt: Timestamp;
}

interface TerminalWorkingSetSlot {
  readonly accountId: AccountId;
  readonly slotId: SlotId;
  readonly packetId: PacketId;
  readonly sessionId: SessionId;
  readonly sourceWindowId: SourceWindowId;
  readonly sourceWindowKind: SourceWindowKind;
  readonly slotOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly terminalKind: TerminalKind;
  readonly compileKind: CompileKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface TerminalWorkingSetPacket {
  readonly accountId: AccountId;
  readonly packetId: PacketId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly disputedFactSetHash: Sha256;
  readonly placementSetHash: Sha256;
  readonly terminalSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly slotWatermark: number;
  readonly sealedAt: Timestamp;
}

interface TerminalWorkingSetEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentTerminalWorkingSetPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedSlotCount: number;
  readonly requireHumanHaltCount: number;
  readonly permanentQuarantineOmitCount: number;
  readonly holdUnknownSlotCount: number;
  readonly rejectCycleOmitCount: number;
  readonly rejectNestedExpiryOmitCount: number;
  readonly unknownSlotCount: number;
  readonly skippedSlotCount: number;
  readonly invalidatedSlotCount: number;
  readonly uncertainEffectIntents: readonly TerminalWorkingSetEffectObservation[];
  readonly remainingBudget: Omit<
    TerminalWorkingSetBudget,
    | "maxWallTimeMs"
    | "compileThreshold"
    | "maxSlotsPerPacket"
    | "maxNominatedWindows"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly TerminalWorkingSetBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateTerminalWorkingSetSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: TerminalWorkingSetBudget;
}

interface NominateSealedTerminalCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface RefreshHaltScopeInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceWindowId: SourceWindowId;
  readonly expectedHaltScopeHash: Sha256;
  readonly idempotencyKey: string;
}

interface CompileTerminalWorkingSetInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedHaltScopeHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealWorkingSetPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedHaltScopeHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateTerminalWorkingSetInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly packetId: PacketId;
  readonly sourceWindowId: SourceWindowId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareWorkingSetEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly packetId: PacketId;
  readonly idempotencyKey: string;
}

interface WorkingSetEffectUncertaintyInput {
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

interface CloseTerminalWorkingSetSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type TerminalWorkingSetDecision =
  | { readonly decision: "ALLOWED"; readonly session: TerminalWorkingSetSession;
      readonly packet?: TerminalWorkingSetPacket;
      readonly member?: TerminalWorkingSetSlot;
      readonly receipt?: WindowNominationReceipt;
      readonly snapshot?: HaltScopeSnapshot;
      readonly compile?: TerminalWorkingSetCompileReceipt;
      readonly perception: AgentTerminalWorkingSetPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: TerminalWorkingSetBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentTerminalWorkingSetPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE tws_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE tws_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'COMPILING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_source_kind AS ENUM (
  'SEALED_REQUIRE_HUMAN_CERT',
  'SEALED_PERMANENT_QUARANTINE_CERT',
  'SEALED_HOLD_UNKNOWN_CERT',
  'SEALED_REJECT_CYCLE_CONFIRM_CERT',
  'SEALED_REJECT_NESTED_EXPIRY_CERT',
  'SEALED_CBT_TERMINAL_CERTIFICATE',
  'SEALED_CYCLE_CENSUS'
);
CREATE TYPE tws_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tws_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tws_compile_kind AS ENUM (
  'REQUIRE_HUMAN_HALT', 'PERMANENT_QUARANTINE_OMIT', 'HOLD_UNKNOWN_SLOT',
  'REJECT_CYCLE_OMIT', 'REJECT_NESTED_EXPIRY_OMIT', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tws_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tws_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_tws_profile_authority NOLOGIN;

CREATE TABLE agent_tws_authorization_evidence (
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

CREATE TABLE agent_tws_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status tws_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_slots_per_packet SMALLINT NOT NULL
    CHECK (max_slots_per_packet BETWEEN 1 AND 256),
  max_nominated_windows SMALLINT NOT NULL
    CHECK (max_nominated_windows BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_COMPILE', 'REQUIRE_REVIEW'
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
    REFERENCES agent_tws_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_tws_profile_compile_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  compile_threshold SMALLINT NOT NULL CHECK (compile_threshold BETWEEN 2 AND 8),
  max_slots_per_packet SMALLINT NOT NULL
    CHECK (max_slots_per_packet BETWEEN 1 AND 256),
  require_dual_control_compile BOOLEAN NOT NULL,
  compile_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_tws_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_tws_certificate_catalog (
  account_id BIGINT NOT NULL,
  source_window_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_window_kind tws_source_kind NOT NULL,
  terminal_kind tws_terminal_kind NOT NULL,
  placement_kind tws_placement_kind NOT NULL,
  key_lifecycle tws_key_lifecycle NOT NULL,
  clock_lifecycle tws_clock_lifecycle NOT NULL,
  attested_key_kind tws_attested_key_kind NOT NULL,
  status tws_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_window_id),
  UNIQUE (account_id, receipt_ref, source_window_kind)
);

CREATE TABLE agent_tws_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status tws_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_compile_units BIGINT NOT NULL CHECK (budget_compile_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_compile_units BIGINT NOT NULL CHECK (consumed_compile_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_slots_per_packet SMALLINT NOT NULL
    CHECK (max_slots_per_packet BETWEEN 1 AND 256),
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
    REFERENCES agent_tws_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_tws_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_compile_units <= budget_compile_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_tws_nomination_window (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind tws_source_kind NOT NULL,
  terminal_kind tws_terminal_kind NOT NULL,
  placement_kind tws_placement_kind NOT NULL,
  key_lifecycle tws_key_lifecycle NOT NULL,
  clock_lifecycle tws_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_window_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_tws_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_tws_halt_scope_snapshot (
  account_id BIGINT NOT NULL,
  halt_scope_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  last_source_certificate_id UUID NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, halt_scope_id),
  UNIQUE (account_id, session_id, source_window_id, halt_scope_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_tws_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_tws_compile_receipt (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  disputed_fact_set_hash CHAR(64) NOT NULL
    CHECK (length(disputed_fact_set_hash) = 64),
  placement_set_hash CHAR(64) NOT NULL
    CHECK (length(placement_set_hash) = 64),
  terminal_set_hash CHAR(64) NOT NULL
    CHECK (length(terminal_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  compile_hash CHAR(64) NOT NULL CHECK (length(compile_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  UNIQUE (account_id, session_id, compile_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id)
);

CREATE TABLE agent_tws_working_set_packet (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  disputed_fact_set_hash CHAR(64) NOT NULL
    CHECK (length(disputed_fact_set_hash) = 64),
  placement_set_hash CHAR(64) NOT NULL
    CHECK (length(placement_set_hash) = 64),
  terminal_set_hash CHAR(64) NOT NULL
    CHECK (length(terminal_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  slot_watermark SMALLINT NOT NULL CHECK (slot_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, packet_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_tws_compile_receipt (account_id, compile_id)
);

CREATE TABLE agent_tws_placement_slot (
  account_id BIGINT NOT NULL,
  slot_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_window_id UUID NOT NULL,
  source_window_kind tws_source_kind NOT NULL,
  slot_ordinal SMALLINT NOT NULL CHECK (slot_ordinal BETWEEN 0 AND 256),
  status tws_binding_status NOT NULL,
  placement_kind tws_placement_kind NOT NULL,
  key_lifecycle tws_key_lifecycle NOT NULL,
  clock_lifecycle tws_clock_lifecycle NOT NULL,
  attested_key_kind tws_attested_key_kind NOT NULL,
  terminal_kind tws_terminal_kind NOT NULL,
  compile_kind tws_compile_kind NOT NULL,
  purpose_relation tws_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, slot_id),
  UNIQUE (account_id, packet_id, source_window_id, slot_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_tws_working_set_packet (account_id, packet_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_tws_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_tws_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  packet_id UUID NOT NULL,
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
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_tws_working_set_packet (account_id, packet_id),
  FOREIGN KEY (account_id, source_window_id)
    REFERENCES agent_tws_certificate_catalog (account_id, source_window_id)
);

CREATE TABLE agent_tws_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  intent_status tws_effect_status NOT NULL,
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
    REFERENCES agent_tws_session (account_id, session_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_tws_working_set_packet (account_id, packet_id)
);

CREATE TABLE agent_tws_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'COMPILE', 'SEAL', 'VECTOR', 'INVALIDATE', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id)
);

CREATE TABLE agent_tws_terminal_record (
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
    REFERENCES agent_tws_session (account_id, session_id)
);

CREATE TABLE agent_tws_command_result (
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

CREATE TABLE agent_tws_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_tws_audit_event (
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

CREATE TABLE agent_tws_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_tws_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status tws_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tws_session (account_id, session_id)
);

CREATE TABLE agent_tws_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_tws_profile()
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
       OR NEW.compile_threshold IS DISTINCT FROM OLD.compile_threshold
       OR NEW.max_slots_per_packet IS DISTINCT FROM OLD.max_slots_per_packet
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
    IF current_setting('app.tws_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.tws_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_tws_profile_protect
BEFORE INSERT OR UPDATE ON agent_tws_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_tws_profile();

CREATE FUNCTION protect_agent_tws_profile_compile_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status tws_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_tws_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile compile rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_tws_profile_compile_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_tws_profile_compile_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_tws_profile_compile_rule();

CREATE FUNCTION protect_agent_tws_halt_scope_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_scope$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'halt scope snapshots are append-only';
  END IF;
  RETURN NEW;
END
$protect_scope$;

CREATE TRIGGER agent_tws_halt_scope_snapshot_protect
BEFORE INSERT OR UPDATE ON agent_tws_halt_scope_snapshot
FOR EACH ROW EXECUTE FUNCTION protect_agent_tws_halt_scope_snapshot();

CREATE FUNCTION protect_agent_tws_placement_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_slot$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_window_id IS DISTINCT FROM OLD.source_window_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.slot_ordinal IS DISTINCT FROM OLD.slot_ordinal
       OR NEW.source_window_kind IS DISTINCT FROM OLD.source_window_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.key_lifecycle IS DISTINCT FROM OLD.key_lifecycle
       OR NEW.clock_lifecycle IS DISTINCT FROM OLD.clock_lifecycle
       OR NEW.attested_key_kind IS DISTINCT FROM OLD.attested_key_kind
       OR NEW.terminal_kind IS DISTINCT FROM OLD.terminal_kind
       OR NEW.compile_kind IS DISTINCT FROM OLD.compile_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.packet_id IS DISTINCT FROM OLD.packet_id THEN
      RAISE EXCEPTION 'placement slot identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks compile from rewriting confirmed trust';
  END IF;

  IF NEW.compile_kind IN ('REQUIRE_HUMAN_HALT', 'PERMANENT_QUARANTINE_OMIT')
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks compile of silent or unknown successor';
  END IF;

  IF NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from compile';
  END IF;

  IF NEW.compile_kind IN ('REQUIRE_HUMAN_HALT', 'PERMANENT_QUARANTINE_OMIT')
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks compile against an unattested clock';
  END IF;

  IF NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks compile for invented successor history';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.placement_kind = 'RESTORED_WITHOUT_WINNER' THEN
    RAISE EXCEPTION 'terminal-restore fence blocks restore of a sealed terminal';
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
     AND NEW.compile_kind IN ('REQUIRE_HUMAN_HALT', 'PERMANENT_QUARANTINE_OMIT')
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose compile after attenuation hops';
  END IF;

  IF NEW.terminal_kind = 'PERMANENT_QUARANTINE'
     AND NEW.placement_kind NOT IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'quarantine-leak fence blocks visible restore of a quarantined body';
  END IF;

  IF NEW.compile_kind = 'REJECT_NESTED_EXPIRY_OMIT'
     AND NEW.placement_kind = 'RESTORED_WITHOUT_WINNER' THEN
    RAISE EXCEPTION 'nested-expiry fence blocks compile that would reopen nested expiry';
  END IF;

  RETURN NEW;
END
$protect_slot$;

CREATE TRIGGER agent_tws_placement_slot_protect
BEFORE INSERT OR UPDATE ON agent_tws_placement_slot
FOR EACH ROW EXECUTE FUNCTION protect_agent_tws_placement_slot();

CREATE FUNCTION protect_agent_tws_effect_intent()
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
     OR OLD.packet_id IS DISTINCT FROM NEW.packet_id THEN
    RAISE EXCEPTION 'prepared effect identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_effect$;

CREATE TRIGGER agent_tws_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_tws_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_tws_effect_intent();

CREATE FUNCTION approve_agent_tws_profile(
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
  stored_status tws_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_tws_profile
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
  FROM agent_tws_profile_compile_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one compile rule';
  END IF;

  PERFORM set_config(
    'app.tws_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_tws_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_tws_profile(
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
  stored_status tws_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_tws_profile
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
    'app.tws_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_tws_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_tws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_tws_profile_authority;
ALTER FUNCTION revoke_agent_tws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_tws_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_tws_profile_authority;
GRANT SELECT ON
  agent_tws_profile,
  agent_tws_profile_compile_rule
TO agent_tws_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_tws_profile TO agent_tws_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_tws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_tws_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_tws_profile FROM PUBLIC;

CREATE INDEX agent_tws_session_work_idx ON agent_tws_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_tws_session_profile_idx ON agent_tws_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_tws_slot_packet_idx ON agent_tws_placement_slot (
  account_id, packet_id, sealed_at DESC, slot_id
);
CREATE INDEX agent_tws_slot_window_idx ON agent_tws_placement_slot (
  account_id, source_window_id, sealed_at DESC, slot_id
);
CREATE INDEX agent_tws_catalog_ref_idx ON agent_tws_certificate_catalog (
  account_id, receipt_ref, sealed_at DESC, source_window_id
);
CREATE INDEX agent_tws_catalog_kind_idx ON agent_tws_certificate_catalog (
  account_id, source_window_kind, sealed_at DESC, source_window_id
);
CREATE INDEX agent_tws_compile_session_idx ON agent_tws_compile_receipt (
  account_id, session_id, compiled_at DESC, compile_id
);
CREATE INDEX agent_tws_packet_session_idx ON agent_tws_working_set_packet (
  account_id, session_id, sealed_at DESC, packet_id
);
CREATE INDEX agent_tws_halt_scope_session_idx ON agent_tws_halt_scope_snapshot (
  account_id, session_id, captured_at DESC, halt_scope_id
);
CREATE INDEX agent_tws_effect_work_idx ON agent_tws_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_tws_audit_time_idx ON agent_tws_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_tws_perception_status_idx ON agent_tws_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_tws_command_expiry_idx ON agent_tws_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_tws_invalidation_packet_idx ON agent_tws_invalidation (
  account_id, packet_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_tws_authorization_evidence',
    'agent_tws_profile',
    'agent_tws_profile_compile_rule',
    'agent_tws_certificate_catalog',
    'agent_tws_session',
    'agent_tws_nomination_window',
    'agent_tws_halt_scope_snapshot',
    'agent_tws_compile_receipt',
    'agent_tws_working_set_packet',
    'agent_tws_placement_slot',
    'agent_tws_invalidation',
    'agent_tws_effect_intent',
    'agent_tws_budget_ledger',
    'agent_tws_terminal_record',
    'agent_tws_command_result',
    'agent_tws_audit_head',
    'agent_tws_audit_event',
    'agent_tws_audit_anchor',
    'agent_tws_perception_snapshot',
    'agent_tws_projection_checkpoint'
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

Open, nominate, refresh, compile, seal, invalidate, and
effect-prepare each run in a single ACID row-store
transaction with session CAS. Working-set packet seal never
joins a neighbor board write.

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

enum AgentTwsSessionStatus {
  OPEN
  NOMINATING
  COMPILING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentTwsBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentTwsSourceKind {
  SEALED_REQUIRE_HUMAN_CERT
  SEALED_PERMANENT_QUARANTINE_CERT
  SEALED_HOLD_UNKNOWN_CERT
  SEALED_REJECT_CYCLE_CONFIRM_CERT
  SEALED_REJECT_NESTED_EXPIRY_CERT
  SEALED_CBT_TERMINAL_CERTIFICATE
  SEALED_CYCLE_CENSUS
}

enum AgentTwsPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentTwsKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentTwsClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentTwsAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentTwsTerminalKind {
  REQUIRE_HUMAN
  PERMANENT_QUARANTINE
  HOLD_UNKNOWN
  REJECT_CYCLE_CONFIRM
  REJECT_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentTwsCompileKind {
  REQUIRE_HUMAN_HALT
  PERMANENT_QUARANTINE_OMIT
  HOLD_UNKNOWN_SLOT
  REJECT_CYCLE_OMIT
  REJECT_NESTED_EXPIRY_OMIT
  SKIP
  UNKNOWN_EFFECT
}

enum AgentTwsPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentTwsEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentTwsNextAction {
  NOMINATE_SEALED_TERMINAL_CERTIFICATE
  REFRESH_HALT_SCOPE
  COMPILE_TERMINAL_WORKING_SET
  SEAL_WORKING_SET_PACKET
  INVALIDATE_WORKING_SET
  PREPARE_WORKING_SET_EFFECT
  WORKING_SET_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentTwsBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  WINDOW_MISSING
  COMPILE_NOT_READY
  HISTORY_REWRITE_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  COMPILE_AS_CONFIRMATION_DENIED
  TERMINAL_RESTORE_DENIED
  QUARANTINE_LEAK_DENIED
  NESTED_EXPIRY_DENIED
  PRIOR_STEWARD_EXCLUSION_DENIED
  LEDGER_SCAN_DENIED
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

enum AgentTwsUncertaintyResolution {
  RETRY_SAME_WINDOW
  ACCEPT_OBSERVATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentTwsInvalidationReason {
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

type AgentTwsBudget {
  nominateUnits: Long!
  compileUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  compileThreshold: Int!
  maxSlotsPerPacket: Int!
  maxNominatedWindows: Int!
}

type AgentTwsProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  compileThreshold: Int!
  maxSlotsPerPacket: Int!
  maxNominatedWindows: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentTwsSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentTwsSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentTwsBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentTwsNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentTwsSourceKind!
  terminalKind: AgentTwsTerminalKind!
  placementKind: AgentTwsPlacementKind!
  keyLifecycle: AgentTwsKeyLifecycle!
  clockLifecycle: AgentTwsClockLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  haltScopeHash: SHA256!
  nominationHash: SHA256!
  nominatedAt: DateTime!
  expiresAt: DateTime!
}

type AgentTwsHaltScope {
  accountId: ID!
  haltScopeId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  haltScopeHash: SHA256!
  lastSourceCertificateId: ID!
  capturedAt: DateTime!
}

type AgentTwsCompileReceipt {
  accountId: ID!
  compileId: ID!
  sessionId: ID!
  haltScopeHash: SHA256!
  disputedFactSetHash: SHA256!
  placementSetHash: SHA256!
  terminalSetHash: SHA256!
  attenuationHash: SHA256!
  compileHash: SHA256!
  compiledAt: DateTime!
}

type AgentTwsWorkingSetPacket {
  accountId: ID!
  packetId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  haltScopeHash: SHA256!
  disputedFactSetHash: SHA256!
  placementSetHash: SHA256!
  terminalSetHash: SHA256!
  attenuationHash: SHA256!
  slotWatermark: Int!
  sealedAt: DateTime!
}

type AgentTwsSlot {
  accountId: ID!
  slotId: ID!
  packetId: ID!
  sessionId: ID!
  sourceWindowId: ID!
  sourceWindowKind: AgentTwsSourceKind!
  slotOrdinal: Int!
  status: AgentTwsBindingStatus!
  placementKind: AgentTwsPlacementKind!
  keyLifecycle: AgentTwsKeyLifecycle!
  clockLifecycle: AgentTwsClockLifecycle!
  attestedKeyKind: AgentTwsAttestedKeyKind!
  terminalKind: AgentTwsTerminalKind!
  compileKind: AgentTwsCompileKind!
  purposeRelation: AgentTwsPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  haltScopeHash: SHA256!
  expiresAt: DateTime!
  sealedAt: DateTime!
}

type AgentTwsEffectObservation {
  effectId: ID!
  status: AgentTwsEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentTwsPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentTwsSessionStatus!
  summary: AgentUntrustedText!
  sealedSlotCount: Int!
  requireHumanHaltCount: Int!
  permanentQuarantineOmitCount: Int!
  holdUnknownSlotCount: Int!
  rejectCycleOmitCount: Int!
  rejectNestedExpiryOmitCount: Int!
  unknownSlotCount: Int!
  skippedSlotCount: Int!
  invalidatedSlotCount: Int!
  uncertainEffectIntents: [AgentTwsEffectObservation!]!
  remainingBudget: AgentTwsBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentTwsNextAction!]!
  blockedReasons: [AgentTwsBlockedReason!]!
  cardHash: SHA256!
}

type AgentTwsMutationResult {
  decision: String!
  session: AgentTwsSession
  packet: AgentTwsWorkingSetPacket
  member: AgentTwsSlot
  receipt: AgentTwsNominationReceipt
  snapshot: AgentTwsHaltScope
  compile: AgentTwsCompileReceipt
  perception: AgentTwsPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentTwsBudgetInput {
  nominateUnits: Long!
  compileUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  compileThreshold: Int!
  maxSlotsPerPacket: Int!
  maxNominatedWindows: Int!
}

input CreateTerminalWorkingSetSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentTwsBudgetInput!
}

input NominateSealedTerminalCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input RefreshHaltScopeInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceWindowId: ID!
  expectedHaltScopeHash: SHA256!
  idempotencyKey: String!
}

input CompileTerminalWorkingSetInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedHaltScopeHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealWorkingSetPacketInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  compileId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedHaltScopeHash: SHA256!
  idempotencyKey: String!
}

input InvalidateTerminalWorkingSetInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  packetId: ID!
  sourceWindowId: ID!
  reasonCode: AgentTwsInvalidationReason!
  idempotencyKey: String!
}

input PrepareWorkingSetEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  packetId: ID!
  idempotencyKey: String!
}

input WorkingSetEffectUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: AgentTwsUncertaintyResolution!
  idempotencyKey: String!
}

input AgentTwsProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentTwsProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentTwsProfile
  agentTwsSession(accountId: ID!, sessionId: ID!): AgentTwsSession
  agentTwsWorkingSetPacket(accountId: ID!, packetId: ID!): AgentTwsWorkingSetPacket
  agentTwsPerceptionCard(accountId: ID!, sessionId: ID!): AgentTwsPerceptionCard
  agentTwsNominatedWindow(
    accountId: ID!
    sessionId: ID!
    sourceWindowId: ID!
  ): AgentTwsNominationReceipt
  agentTwsSearchProfiles(input: AgentTwsProfileSearchInput!): [AgentTwsProfile!]!
}

type Mutation {
  createTerminalWorkingSetSession(
    input: CreateTerminalWorkingSetSessionInput!
  ): AgentTwsMutationResult!
  nominateSealedTerminalCertificate(
    input: NominateSealedTerminalCertificateInput!
  ): AgentTwsMutationResult!
  refreshHaltScope(
    input: RefreshHaltScopeInput!
  ): AgentTwsMutationResult!
  compileTerminalWorkingSet(
    input: CompileTerminalWorkingSetInput!
  ): AgentTwsMutationResult!
  sealWorkingSetPacket(input: SealWorkingSetPacketInput!): AgentTwsMutationResult!
  invalidateTerminalWorkingSet(
    input: InvalidateTerminalWorkingSetInput!
  ): AgentTwsMutationResult!
  prepareWorkingSetEffect(input: PrepareWorkingSetEffectInput!): AgentTwsMutationResult!
  workingSetEffectUncertainty(
    input: WorkingSetEffectUncertaintyInput!
  ): AgentTwsMutationResult!
  closeTerminalWorkingSetSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentTwsMutationResult!
  approveTerminalWorkingSetProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentTwsMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Compile mutations reject when slot ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealWorkingSetPacket` is rejected with `HISTORY_REWRITE_DENIED` when
  a compile would invent `TRUSTED_ENROLLED`, with
  `COMPILE_AS_CONFIRMATION_DENIED` when compilation is treated as
  confirmation, with `TERMINAL_RESTORE_DENIED` when a sealed terminal
  would restore a winner, with `QUARANTINE_LEAK_DENIED` when a
  `PERMANENT_QUARANTINE` body would become visible, with
  `NESTED_EXPIRY_DENIED` when another expiry-containment-review-
  resolution plane would open, and with `LEDGER_SCAN_DENIED` when halt
  scope would be computed by walking a vote, TTL, page, ack,
  escalation, review, or resolution ledger.

## 10. Procedural memory

Approved compile profiles are procedural memory: versioned
instructions for how a sealed `REQUIRE_HUMAN` or
`PERMANENT_QUARANTINE` certificate becomes a halt-aware
working-set packet without inventing a winner and without
rewriting compilation silence as dual-control success or
`TRUSTED_ENROLLED`. Procedure refs may point to human-
escalation or permanent-quarantine playbook steps.
Profiles are immutable after approval; agents perceive
them as tagged instructions, never as authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses account-owned embeddings and
pgvector/HNSW-compatible ANN. Retrieval is a discovery
hint only. Every ANN query must include `account_id`
equality before `topK`. Cross-tenant HNSW is forbidden.

```sql
CREATE TABLE agent_tws_profile_embedding (
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
    REFERENCES agent_tws_profile (account_id, profile_id, profile_version)
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
sealed / require-human-halt / permanent-quarantine-omit /
hold-unknown / reject-cycle-omit / reject-nested-expiry /
unknown / skipped / invalidated slot counts, uncertain
notify intents, remaining budgets, procedure tags, allowed
next actions, and blocked reasons. Summary text is
`UntrustedText`. Cards never embed raw private keys or
redacted fact bodies. `cardHash` makes perception
replayable. Agents perceive `REQUIRE_HUMAN_HALT` as a
halt-visible card after the cycle budget is exhausted that
still cannot invent a winner, `PERMANENT_QUARANTINE_OMIT`
as a sealed omit that forbids later nested expiry,
`HOLD_UNKNOWN_SLOT` as a bounded uncertainty window,
`REJECT_CYCLE_OMIT` as a trusted negative for a census
that would have rewritten silence as success,
`REJECT_NESTED_EXPIRY_OMIT` as a sealed refusal to open
another expiry-containment-review-resolution plane, and
`SKIP` as a sealed refusal — never as a key that "must
have been trusted because a working set compiled."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, halt-scope snapshots,
compile receipts, working-set packet seals, and audit
appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed
working-set packets but are not authoritative for
require-human-halt, permanent-quarantine-omit, or
reject-cycle-omit outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable
profile approval events; staleness is visible via source
watermarks.

### External tools

Notify dispatch side-effects are not silently ACID-coupled;
silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Slot/threshold caps on compiles per packet and per
  session.
- Budget ledgers for NOMINATE/COMPILE/SEAL/VECTOR/INVALIDATE/NOTIFY.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped terminal-catalog, clock-catalog,
  working-set, grant-graph, citation, confirm-ledger,
  vote-ledger, TTL-ledger, page-ledger, ack-ledger,
  escalation-ledger, review-ledger, containment-ledger,
  resolution-ledger, promotion-ledger, or board scans as
  **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without
  scanning neighbors.
- Compilation never auto-restores neighbor-visible board
  mutations from halted slots, expired votes, unanswered
  acknowledgements, expired containments, or unbound
  windows.
- Nested-expiry fence rejects opening another expiry-
  containment-review-resolution plane from a compiled
  packet.
- Quarantine-leak fence rejects visible restore of a
  `PERMANENT_QUARANTINE` body.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding remaining sealed terminals to compile by
  scanning the confirmation-vote, TTL-retirement, page,
  ack, escalation, review, or resolution ledger (rejected;
  nominate by `(account_id, source_window_id)`).
- Computing `halt_scope_hash` by walking every sealed
  governance certificate for an account (rejected; point
  lookup of the sealed halt-scope snapshot).
- Compiling a working set by walking all notify intents
  for an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all packets for an account
  (rejected; use receipt-keyed active slot indexes).

### Required access paths

- Window nomination: PK `(account_id, source_window_id)`.
- Halt-scope refresh: unique
  `(account_id, session_id, source_window_id, halt_scope_hash)`.
- Compile/seal: PK `(account_id, compile_id)` /
  `(account_id, packet_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Slots by packet/window: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or
requiring an unscoped board/working-set/grant-graph/
terminal-catalog/clock-catalog/confirm-ledger/vote-ledger/
TTL-ledger/page-ledger/ack-ledger/escalation-ledger/
review-ledger/containment-ledger/resolution-ledger/
promotion-ledger/citation scan is **FULL SCAN REJECTED**
before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay
reconstructs session, halt scope, compile, and packet
state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant packet via forged IDs: blocked by forced
  RLS and PK scope.
- Purpose amplification for consumers: attenuation hash
  must narrow relative to terminal and session purposes.
- Sticky first-compile success after supersession:
  invalidation + re-compile + notify uncertainty + profile
  revocation.
- Historical silence invented as `TRUSTED_ENROLLED` from a
  sealed compile: history-rewrite, silence-success, and
  compile-as-confirmation fences.
- First-enrollment key auto-promoted to `TRUSTED_ENROLLED`
  by a compile: first-enrollment-auto-trust fence.
- Halt scope computed by walking vote, TTL, page, ack,
  escalation, review, or containment ledgers: ledger-scan
  fence and **FULL SCAN REJECTED**.
- Halt leak of frozen bodies into compile-as-restore:
  terminal-restore fence.
- Compile that restores a halted body or invents a
  winner: successor-leak fence.
- Hop leak of donor purpose after attenuation hops:
  hop-leak fence.
- Inventing a winner under a restored slot: packets bind
  halt scope and placement sets, never
  `resolved_fact_hash`.
- Opening another nested expiry after compile: nested-
  expiry fence.
- Visible restore of a quarantined body: quarantine-leak
  fence.
- Silent notify success: `UNKNOWN_EFFECT` until ACK.
- Recursive window-catalog or board storms: budget and
  **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced
  approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/refresh/compile/seal/perception p99 latency
  budgets for 99.99% control-plane availability.
- History-rewrite rejection, silence-success rejection,
  first-enrollment-auto-trust rejection, compile-as-
  confirmation rejection, terminal-restore rejection,
  quarantine-leak rejection, nested-expiry rejection,
  ledger-scan rejection, purpose-amplification rejection,
  successor-leak rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection
  counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow compile

Compile profiles and validate certificate-catalog
nomination without durable packets.

### Phase 2: reject-cycle-omit and reject-nested-expiry only

Allow sealed packets from nominated `HALTED` and
`EXTENDED_HALT` windows as `REJECT_CYCLE_OMIT`,
`REJECT_NESTED_EXPIRY_OMIT`, or `SKIP`. Require-human-halt
stays closed.

### Phase 3: require-human-halt and terminal-restore fences

Enable budgeted `REQUIRE_HUMAN_HALT` from sealed
`REQUIRE_HUMAN` certificates with
`AWAITING_CONFIRMATION` only. A sealed packet never
writes `TRUSTED_ENROLLED`.

### Phase 4: permanent quarantine omit and notify uncertainty

Enable `PERMANENT_QUARANTINE_OMIT` under point-lookup
halt-scope refresh and notify intents with
`UNKNOWN_EFFECT` reconciliation and `HOLD_UNKNOWN_SLOT`
that cannot invent confirmation trust from an unanswered
compile.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor
budgets, including permanent-quarantine omit only for
first-enrollment keys that cannot rewrite an unanswered
cycle as success and cannot auto-trust from compile
silence.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability,
  history-rewrite, purpose-amplification, terminal-restore,
  and effect start state.

### Behavioral validation

- Nominate requires sealed certificate-catalog material
  point lookup and hash match.
- Refresh halt-scope is a point lookup and never a vote-
  ledger, page-ledger, ack-ledger, or escalation-ledger
  scan.
- Compile binds halt scope, disputed fact set, placement
  set, and attenuation under budget.
- Seal is rejected when a sealed packet would become
  `TRUSTED_ENROLLED`, when compilation is treated as
  confirmation, when a sealed terminal would restore a
  winner, when a quarantined body would become visible,
  when another nested expiry would open, or when halt
  scope would be computed by scanning ledgers, and never
  invents a winning fact hash.
- Packet seal binds immutable slots under halt-scope,
  disputed-fact-set, placement-set, terminal-set, and
  attenuation hashes — never a winner hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/refresh/compile/seal path
  performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed working-set packets
  after process restart.

## 21. Product decision

Adopt the Terminal Working-Set Compilation Plane as the
deterministic compiler for sealed `REQUIRE_HUMAN` and
`PERMANENT_QUARANTINE` certificates produced by the
Cycle-Bound Terminal Plane.

Ship it because:

1. It preserves ACID and multi-tenant isolation while
   closing the compilation gap without history rewrite,
   silence-success, first-enrollment auto-trust, compile-
   as-confirmation, ledger scans, halt leak, quarantine
   leak, purpose amplification, invented winners, or
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
4. This increment compiles sealed terminal certificates.
   The next increment should issue dual-control SLA
   extension certificates that re-arm successor clocks
   without restoring disputed facts, or attach envelope-
   scoped purpose gates to citations placed into these
   compiled working sets. Do not add another nested
   expiry-containment-review-resolution plane.
