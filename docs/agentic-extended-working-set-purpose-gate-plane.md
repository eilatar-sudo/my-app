# mondayDB Agentic Extended Working-Set Purpose Gate Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-23.v1`

## 1. Why this plane, before how

The 2026-09-22 SLA Extension Certificate Plane can re-arm a
successor clock on a sealed halt-aware working set. The
disputed fact stays `DISPUTED_HELD`, `HALTED`, or
`QUARANTINE_OMITTED`. That plane does not decide **whether
a citation already placed into that extended working set
may be read or tool-read**.

Without an envelope-scoped purpose gate, operators and
agents either:

- treat the re-armed clock as `TRUSTED_ENROLLED` and open
  the citation body (a clock watermark becomes a read
  grant), or
- scan every placed citation on the board looking for
  "what the new clock unlocked" (neighbor-harmful on boards
  with 1M+ rows).

The product trade-off is **read fluency versus
envelope-scoped purpose isolation**:

- Letting a re-armed clock authorize body reads maximizes
  agent fluency and reduces re-grounding cost, but creates
  clock-as-trust, gate-as-restore, halt leak, quarantine
  leak, and purpose amplification.
- Issuing a sealed purpose-gate certificate under an
  approved gate profile, citation-catalog point lookups,
  and dual-control gate stewards who did not re-arm the
  clock adds one bounded gate transaction. The agent may
  perceive the citation envelope. The disputed fact body
  stays closed. The key stays `AWAITING_CONFIRMATION`.
- Semantic similarity may discover gate profiles, but it
  must never decide whether a citation may be nominated, a
  successor clock bound, a gate evaluated, a certificate
  sealed, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved gate profile defines allowed source kinds,
   dual-control gate-steward policy (minimum two distinct
   principals, excluding both prior extension stewards),
   purpose attenuation, and notify policy. A gate **never**
   invents a winning fact hash and **never** rewrites a
   re-armed clock as `TRUSTED_ENROLLED`.
2. A gate session opens under purpose, budget, and
   authorization fences, and only nominates sealed
   citations by point lookup from the citation catalog.
   The prior clock and successor clock are copied from the
   sealed SLA extension certificate — never computed by
   walking ledgers.
3. mondayDB evaluates a gate decision whose outcome is a
   pure function of `(source_kind, terminal_kind,
   placement_kind, key_lifecycle, clock_lifecycle,
   attested_key_kind, gate_kind, gate_action,
   body_visibility, fact_disposition, clock_disposition,
   purpose_relation, hop_count)`. Silence cannot become
   historical success. `ALLOW_ENVELOPE_READ` and
   `ALLOW_TOOL_READ` require `clock_disposition = REARMED`,
   `body_visibility = ENVELOPE_ONLY`, and
   `fact_disposition = DISPUTED_HELD`.
4. Sealing a gate certificate binds
   `consumer_ref + purpose_hash + prior_clock_hash +
   successor_clock_hash + disputed_fact_hash +
   halt_scope_hash + attenuation_hash + citation_set_hash +
   gate_steward_a + gate_steward_b`. The certificate
   **must not** emit a `resolved_fact_hash` and **must
   not** emit `TRUSTED_ENROLLED`.
5. Upstream invalidation marks certificates stale; notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
6. Unscoped citation-catalog, clock-catalog, vote-ledger,
   page-ledger, ack-ledger, escalation-ledger, containment-
   ledger, review-ledger, resolution-ledger, promotion-
   ledger, working-set, grant-graph, or board scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "read every citation the new clock
touched" loops are rejectable before they scan boards with
1M+ rows. Perception is restored by sealed envelope-only
certificates, not by magic visibility inside the engine.

### Product outcome

For any extended working-set purpose gate, mondayDB can
answer:

- Which profile, principal, and session authorized the
  nomination, clock bind, evaluation, seal, invalidate, or
  notify dispatch?
- Which nominated citations, prior clocks, successor
  clocks, disputed-fact hashes, halt scopes, and gate
  kinds were bound?
- Did the gate allow an envelope read while the disputed
  fact stayed held and the key stayed unconfirmed?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the gate history be replayed without invoking an LLM?

## 2. Scope and ownership

The Extended Working-Set Purpose Gate Plane owns:

1. Immutable approved gate profiles as procedural memory
   of "how a citation placed into a clock-extended working
   set may be envelope-read or tool-read without restoring
   a disputed fact, amplifying purpose, leaking a halted
   or quarantined body, rewriting a re-armed clock as
   `TRUSTED_ENROLLED`, scanning governance ledgers, or
   opening another nested expiry."
2. Tenant-scoped gate sessions with purpose and budget
   fences.
3. Deterministic nomination of sealed citations by point
   lookup — never ledger or board scans.
4. Deterministic clock bindings, gate receipts, sealed
   certificates, and immutable gate decisions that never
   invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded gate
   budgets.

It integrates with, but does not replace:

- **SLA Extension Certificate Plane:** supplies the sealed
  extension certificate and fact hold whose successor
  clock this plane may bind. This plane never re-arms a
  clock and never treats a re-armed clock as
  `TRUSTED_ENROLLED`.
- **Terminal Working-Set Compilation Plane:** supplies the
  halt-aware packet the citation was placed into. This
  plane never recompiles a terminal and never restores a
  quarantined body.
- **Envelope Tool-Effect Saga:** may later bind a sealed
  `ALLOW_TOOL_READ` decision to a provider receipt. This
  plane does not authorize `TOOL_MUTATE` and does not
  claim the external read succeeded.
- **Query Governor / Budgets:** reserves nominate, bind,
  vector, seal, invalidate, and notify units.

### Non-goals

- Letting an LLM decide that a re-armed clock "probably
  means the citation is trusted."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative gate certificates from
  columnar or vector projections.
- Cross-account gates or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted fact bodies.
- Claiming distributed atomicity with external pager or
  notify providers.
- Inventing a winning fact hash when an envelope read is
  allowed.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`
  because a purpose gate sealed.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to find citations a
  new clock "unlocked."
- Opening another nested expiry-containment-review-
  resolution plane from a gate certificate.
- Authorizing `TOOL_MUTATE` or showing a
  `PERMANENT_QUARANTINE` body.

## 3. Product contract

### 3.1 Gate profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_SLA_EXTENSION_CERT`,
  `SEALED_SLA_FACT_HOLD`, `SEALED_PLACED_CITATION`,
  `SEALED_EXTENDED_WS_PACKET`, `SEALED_PURPOSE_SLOT`);
- gate threshold (distinct gate-steward principals,
  minimum 2), max decisions per certificate, and max
  nominated citations;
- gate policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`,
  `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `CLOCK_NEVER_BECOMES_TRUST`,
  `GATE_NEVER_RESTORES_FACTS`, `GATE_NEVER_CONFIRMS`,
  `BODY_NEVER_VISIBLE`, `TOOL_MUTATE_NEVER_ALLOWED`,
  `NESTED_EXPIRY_NEVER_OPENS`, `LEDGER_NEVER_SCANNED`,
  `HALT_DENIES_BODY_READ`, `QUARANTINE_BODY_NEVER_VISIBLE`,
  `PRIOR_EXTENSION_STEWARDS_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_GATE`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_SLA_EXTENSION_CERT` (25 bytes). The longest
gate kind is `DENY_PURPOSE_AMPLIFY` (20 bytes).

Approval and revocation require the authority fence
`approve_agent_ewg_profile` / `revoke_agent_ewg_profile`.
Direct `UPDATE` of a sealed profile or its gate rules is
rejected. Profiles must be inserted as `DRAFT`.

### 3.2 Session and budget contract

A session is scoped by `account_id` and an idempotency key.
Budgets cover nominate, bind, seal, vector, invalidate,
and notify units, plus wall-clock, gate threshold, max
decisions, and max nominated citations. Consumed units
cannot exceed the budget. Deadline must be after creation.
Evaluation consumes bind units. Sealing consumes seal
units.

### 3.3 Nomination and clock-binding contract

Nomination is a point lookup of `(account_id, citation_id)`
in the citation catalog. The catalog stores the disputed
fact hash, the prior clock hash, and the successor clock
hash that the SLA extension plane already sealed. It does
not store a fact body. A clock binding is append-only and
copies those hashes. Bind never walks a ledger and never
moves the clock.

### 3.4 Certificate and gate-decision contract

A sealed certificate names two distinct gate stewards and
both prior extension stewards. A gate steward who matches
either extension steward is rejected. A gate decision
records:

- `fact_disposition`: `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED` (never `RESTORED`);
- `body_visibility`: `ENVELOPE_ONLY` or `OMITTED` (never
  `BODY_VISIBLE`);
- `clock_disposition`: `REARMED` is required for
  `ALLOW_ENVELOPE_READ` and `ALLOW_TOOL_READ`, and the
  successor clock hash must differ from the prior clock
  hash;
- `gate_kind`: `ALLOW_ENVELOPE_READ`, `ALLOW_TOOL_READ`,
  `DENY_HALT_READ`, `DENY_CLOCK_AS_TRUST`,
  `DENY_PURPOSE_AMPLIFY`, `SKIP`, or `UNKNOWN_EFFECT`;
- `gate_action`: `READ` or `TOOL_READ` (`TOOL_MUTATE` is
  rejected);
- `opens_nested_expiry`: must be false;
- `attested_key_kind`: must not be `TRUSTED_ENROLLED` or
  `TRUSTED_WITHIN_SKEW`.

There is no `resolved_fact_hash` column. Changing
`disputed_fact_hash` after insert is rejected. An allow
decision is legal only when `placement_kind` is
`EXTENDED_HALT`, `terminal_kind` is `REQUIRE_HUMAN`,
`purpose_relation` is `NARROWS`, and `fact_disposition` is
`DISPUTED_HELD`.

### 3.5 Notify contract

Effect intents start as `PREPARED`. A prepared identity
(`canonical_request_hash`, provider idempotency key,
certificate id) is immutable. Dispatch may later move to
`DISPATCHED`, `ACKED`, `FAILED`, or `UNKNOWN_EFFECT`.
Silence is not success. A gate notify says the envelope
decision was prepared. It does not say the external tool
read succeeded.

## 4. Deterministic invariants

1. Every row and every access index leads with `account_id`.
2. A gate never writes `TRUSTED_ENROLLED` or
   `TRUSTED_WITHIN_SKEW` (clock-as-trust / history-rewrite
   fence). A re-armed clock is not enrollment.
3. `ALLOW_ENVELOPE_READ` and `ALLOW_TOOL_READ` cannot bind
   `SILENCE` or `UNKNOWN_EFFECT` as the attested key
   (silence-success fence).
4. `FIRST_ENROLLMENT` cannot become `TRUSTED_ENROLLED`
   because a gate sealed (first-enrollment-auto-trust
   fence).
5. `fact_disposition = RESTORED` is rejected
   (gate-as-restore fence).
6. `body_visibility = BODY_VISIBLE` is rejected
   (halt-read fence). Envelope reads expose hashes and
   purpose attenuation, not the disputed body.
7. `gate_action = TOOL_MUTATE` is rejected
   (tool-mutate fence). Mutation belongs to a later saga
   that still cannot restore facts.
8. `placement_kind = RESTORED_WITHOUT_WINNER` on a sealed
   terminal is rejected (terminal-restore fence).
9. `PERMANENT_QUARANTINE` decisions must stay
   `QUARANTINE_OMITTED` or `HALTED` (quarantine-leak
   fence). Allow kinds are rejected for that terminal.
10. `opens_nested_expiry` must be false (nested-expiry
    fence). Another expiry-containment-review-resolution
    plane is not a legal output of this certificate.
11. `purpose_relation = AMPLIFIES` is rejected
    (purpose-amplification fence).
12. After one or more attenuation hops, the requested
    purpose hash must differ from the donor purpose hash
    (hop-leak fence).
13. `clock_disposition = REGRESSED` is rejected
    (clock-regression fence). Allow kinds require
    `REARMED` and a distinct successor clock hash.
14. Gate stewards are distinct from each other and from
    both prior extension stewards.
15. Semantic retrieval discovers profiles only. It never
    authorizes nominate, bind, evaluate, seal, or notify.
16. Unscoped scans of catalogs, ledgers, or boards are
    **FULL SCAN REJECTED**.

## 5. Execution model

1. Resolve the approved profile by
   `(account_id, profile_id, profile_version)`.
2. Open a session under purpose, budget, and authorization
   evidence. Idempotency is `(account_id, idempotency_key)`.
3. Nominate sealed citations by primary-key lookup. Reject
   missing citations, hash mismatches, and ledger-scan
   plans.
4. Bind the successor clock from the citation catalog.
   Reject regression, identical hashes, and any attempt to
   move the clock inside this plane.
5. Evaluate gate decisions. Apply every fence in section 4
   before insert.
6. Seal the certificate with two gate stewards who are not
   the extension stewards. Bind clock hashes and the
   unchanged disputed-fact hash. Do not emit a winner and
   do not emit `TRUSTED_ENROLLED`.
7. Prepare a notify intent as `PREPARED`. External ack is
   a later transition. Timeout becomes `UNKNOWN_EFFECT`.
8. Append a hash-chained audit event in the same row-store
   transaction as the state change it records.

Columnar projections and account-owned HNSW indexes are
asynchronous and non-authoritative.

## 6. Lifecycle

### 6.1 Draft and approve

Profiles enter as `DRAFT` with at least one gate rule
whose `require_dual_control_gate` is true. Approval checks
the definition hash and the authority fence. Revocation
uses the same fence. Direct status updates are rejected.

### 6.2 Open and nominate

Session status moves `OPEN` → `NOMINATING`. Each nomination
consumes one nominate unit and stores a nomination hash
over the citation, disputed fact, both clock hashes, and
the attenuation hash.

### 6.3 Bind and evaluate

Session status moves to `GATING`. Clock bind is a point
lookup. Evaluation inserts gate decisions or rejects with
a blocked reason. No fact is restored. No body is marked
visible. No key is marked `TRUSTED_ENROLLED`.

### 6.4 Seal

Session status moves to `SEALED`. The certificate watermark
counts decisions. Sealing does not confirm the underlying
key and does not re-arm the clock again.

### 6.5 Invalidate and notify

Invalidation records `SUPERSEDED`, `RETRACTED`,
`QUARANTINED`, or `KEY_REVOKED` without rewriting the
disputed fact. Notify status may become `UNKNOWN_EFFECT`.

### 6.6 Close and retain

Sessions close, expire, cancel, fail, or quarantine.
Audit events, certificates, and gate decisions retain for
the account's legal hold. Perception snapshots are derived
and may be compacted after Merkle anchor.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type CitationId = string & { readonly brand: "CitationId" };
type GateId = string & { readonly brand: "GateId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type ClockBindingId = string & { readonly brand: "ClockBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_EXTENDED_CITATION"
  | "BIND_SUCCESSOR_CLOCK"
  | "EVALUATE_PURPOSE_GATE"
  | "SEAL_PURPOSE_GATE_CERTIFICATE"
  | "INVALIDATE_PURPOSE_GATE"
  | "PREPARE_PURPOSE_GATE_EFFECT"
  | "PURPOSE_GATE_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type PurposeGateBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CITATION_MISSING"
  | "GATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "CLOCK_AS_TRUST_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "GATE_AS_RESTORE_DENIED"
  | "GATE_AS_CONFIRMATION_DENIED"
  | "HALT_READ_DENIED"
  | "TOOL_MUTATE_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
  | "CLOCK_NOT_EXTENDED_DENIED"
  | "UNBOUND_CITATION_DENIED"
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
  | "GATING"
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

type SourceKind =
  | "SEALED_SLA_EXTENSION_CERT"
  | "SEALED_SLA_FACT_HOLD"
  | "SEALED_PLACED_CITATION"
  | "SEALED_EXTENDED_WS_PACKET"
  | "SEALED_PURPOSE_SLOT";

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

type GateKind =
  | "ALLOW_ENVELOPE_READ"
  | "ALLOW_TOOL_READ"
  | "DENY_HALT_READ"
  | "DENY_CLOCK_AS_TRUST"
  | "DENY_PURPOSE_AMPLIFY"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type GateAction = "READ" | "TOOL_READ" | "TOOL_MUTATE";

type BodyVisibility = "ENVELOPE_ONLY" | "BODY_VISIBLE" | "OMITTED";

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

interface PurposeGateBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly gateThreshold: number;
  readonly maxDecisionsPerCertificate: number;
  readonly maxNominatedCitations: number;
}

interface PurposeGateProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly gateThreshold: number;
  readonly maxDecisionsPerCertificate: number;
  readonly maxNominatedCitations: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface PurposeGateSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: PurposeGateBudget;
  readonly consumed: Omit<
    PurposeGateBudget,
    | "maxWallTimeMs"
    | "gateThreshold"
    | "maxDecisionsPerCertificate"
    | "maxNominatedCitations"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface CitationNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly sourceKind: SourceKind;
  readonly terminalKind: TerminalKind;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly disputedFactHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly haltScopeHash: Sha256;
  readonly priorExtensionStewardA: string;
  readonly priorExtensionStewardB: string;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
  readonly expiresAt: Timestamp;
}

interface SuccessorClockBinding {
  readonly accountId: AccountId;
  readonly clockBindingId: ClockBindingId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly lastSourceCertificateId: CertificateId;
  readonly capturedAt: Timestamp;
}

interface PurposeGateReceipt {
  readonly accountId: AccountId;
  readonly gateId: GateId;
  readonly sessionId: SessionId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly citationSetHash: Sha256;
  readonly gateHash: Sha256;
  readonly gatedAt: Timestamp;
}

interface PurposeGateDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly sourceKind: SourceKind;
  readonly decisionOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly terminalKind: TerminalKind;
  readonly gateKind: GateKind;
  readonly gateAction: GateAction;
  readonly bodyVisibility: BodyVisibility;
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

interface PurposeGateCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly gateId: GateId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly citationSetHash: Sha256;
  readonly gateStewardA: string;
  readonly gateStewardB: string;
  readonly priorExtensionStewardA: string;
  readonly priorExtensionStewardB: string;
  readonly decisionWatermark: number;
  readonly sealedAt: Timestamp;
}

interface PurposeGateEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentPurposeGatePerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedDecisionCount: number;
  readonly envelopeReadCount: number;
  readonly toolReadCount: number;
  readonly disputedHeldCount: number;
  readonly haltDeniedCount: number;
  readonly clockTrustDeniedCount: number;
  readonly quarantineOmittedCount: number;
  readonly unknownDecisionCount: number;
  readonly skippedDecisionCount: number;
  readonly invalidatedDecisionCount: number;
  readonly uncertainEffectIntents: readonly PurposeGateEffectObservation[];
  readonly remainingBudget: Omit<
    PurposeGateBudget,
    | "maxWallTimeMs"
    | "gateThreshold"
    | "maxDecisionsPerCertificate"
    | "maxNominatedCitations"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly PurposeGateBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreatePurposeGateSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: PurposeGateBudget;
}

interface NominateExtendedCitationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedSuccessorClockHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindSuccessorClockInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly expectedPriorClockHash: Sha256;
  readonly expectedSuccessorClockHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluatePurposeGateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedPriorClockHash: Sha256;
  readonly expectedSuccessorClockHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealPurposeGateCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly gateId: GateId;
  readonly consumerRef: ConsumerRef;
  readonly gateStewardA: string;
  readonly gateStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidatePurposeGateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly citationId: CitationId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PreparePurposeGateEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface PurposeGateEffectUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion:
    | "RETRY_SAME_CITATION"
    | "ACCEPT_OBSERVATION"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface ClosePurposeGateSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type PurposeGateDecisionResult =
  | { readonly decision: "ALLOWED"; readonly session: PurposeGateSession;
      readonly certificate?: PurposeGateCertificate;
      readonly gateDecision?: PurposeGateDecision;
      readonly receipt?: CitationNominationReceipt;
      readonly binding?: SuccessorClockBinding;
      readonly gate?: PurposeGateReceipt;
      readonly perception: AgentPurposeGatePerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: PurposeGateBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentPurposeGatePerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE ewg_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE ewg_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'GATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_source_kind AS ENUM (
  'SEALED_SLA_EXTENSION_CERT',
  'SEALED_SLA_FACT_HOLD',
  'SEALED_PLACED_CITATION',
  'SEALED_EXTENDED_WS_PACKET',
  'SEALED_PURPOSE_SLOT'
);
CREATE TYPE ewg_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE ewg_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE ewg_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE ewg_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_ewg_profile_authority NOLOGIN;

CREATE TABLE agent_ewg_authorization_evidence (
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

CREATE TABLE agent_ewg_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status ewg_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  gate_threshold SMALLINT NOT NULL
    CHECK (gate_threshold BETWEEN 2 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  max_nominated_citations SMALLINT NOT NULL
    CHECK (max_nominated_citations BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_GATE', 'REQUIRE_REVIEW'
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
    REFERENCES agent_ewg_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_ewg_profile_gate_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  gate_threshold SMALLINT NOT NULL CHECK (gate_threshold BETWEEN 2 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  require_dual_control_gate BOOLEAN NOT NULL,
  gate_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_ewg_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_ewg_citation_catalog (
  account_id BIGINT NOT NULL,
  citation_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_kind ewg_source_kind NOT NULL,
  terminal_kind ewg_terminal_kind NOT NULL,
  placement_kind ewg_placement_kind NOT NULL,
  key_lifecycle ewg_key_lifecycle NOT NULL,
  clock_lifecycle ewg_clock_lifecycle NOT NULL,
  attested_key_kind ewg_attested_key_kind NOT NULL,
  status ewg_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, citation_id),
  UNIQUE (account_id, receipt_ref, source_kind),
  CHECK (prior_extension_steward_a <> prior_extension_steward_b)
);

CREATE TABLE agent_ewg_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status ewg_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  gate_threshold SMALLINT NOT NULL
    CHECK (gate_threshold BETWEEN 2 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  max_nominated_citations SMALLINT NOT NULL
    CHECK (max_nominated_citations BETWEEN 1 AND 256),
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
    REFERENCES agent_ewg_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_ewg_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_ewg_nomination (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  source_kind ewg_source_kind NOT NULL,
  terminal_kind ewg_terminal_kind NOT NULL,
  placement_kind ewg_placement_kind NOT NULL,
  key_lifecycle ewg_key_lifecycle NOT NULL,
  clock_lifecycle ewg_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, citation_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_ewg_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_ewg_clock_binding (
  account_id BIGINT NOT NULL,
  clock_binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  last_source_certificate_id UUID NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, clock_binding_id),
  UNIQUE (account_id, session_id, citation_id, successor_clock_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_ewg_citation_catalog (account_id, citation_id),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_ewg_gate_receipt (
  account_id BIGINT NOT NULL,
  gate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  citation_set_hash CHAR(64) NOT NULL CHECK (length(citation_set_hash) = 64),
  gate_hash CHAR(64) NOT NULL CHECK (length(gate_hash) = 64),
  gated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, gate_id),
  UNIQUE (account_id, session_id, gate_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id)
);

CREATE TABLE agent_ewg_gate_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  gate_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  citation_set_hash CHAR(64) NOT NULL CHECK (length(citation_set_hash) = 64),
  gate_steward_a TEXT NOT NULL,
  gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  decision_watermark SMALLINT NOT NULL CHECK (decision_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id),
  FOREIGN KEY (account_id, gate_id)
    REFERENCES agent_ewg_gate_receipt (account_id, gate_id),
  CHECK (gate_steward_a <> gate_steward_b),
  CHECK (gate_steward_a <> prior_extension_steward_a),
  CHECK (gate_steward_a <> prior_extension_steward_b),
  CHECK (gate_steward_b <> prior_extension_steward_a),
  CHECK (gate_steward_b <> prior_extension_steward_b)
);

CREATE TABLE agent_ewg_gate_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  source_kind ewg_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status ewg_binding_status NOT NULL,
  placement_kind ewg_placement_kind NOT NULL,
  key_lifecycle ewg_key_lifecycle NOT NULL,
  clock_lifecycle ewg_clock_lifecycle NOT NULL,
  attested_key_kind ewg_attested_key_kind NOT NULL,
  terminal_kind ewg_terminal_kind NOT NULL,
  gate_kind ewg_gate_kind NOT NULL,
  gate_action ewg_gate_action NOT NULL,
  body_visibility ewg_body_visibility NOT NULL,
  fact_disposition ewg_fact_disposition NOT NULL,
  clock_disposition ewg_clock_disposition NOT NULL,
  purpose_relation ewg_purpose_relation NOT NULL,
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
  PRIMARY KEY (account_id, decision_id),
  UNIQUE (account_id, certificate_id, citation_id, decision_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ewg_gate_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_ewg_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_ewg_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  citation_id UUID NOT NULL,
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
    REFERENCES agent_ewg_gate_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_ewg_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_ewg_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status ewg_effect_status NOT NULL,
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
    REFERENCES agent_ewg_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_ewg_gate_certificate (account_id, certificate_id)
);

CREATE TABLE agent_ewg_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'BIND', 'SEAL', 'VECTOR', 'INVALIDATE', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id)
);

CREATE TABLE agent_ewg_terminal_record (
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
    REFERENCES agent_ewg_session (account_id, session_id)
);

CREATE TABLE agent_ewg_command_result (
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

CREATE TABLE agent_ewg_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_ewg_audit_event (
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

CREATE TABLE agent_ewg_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_ewg_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status ewg_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_ewg_session (account_id, session_id)
);

CREATE TABLE agent_ewg_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_ewg_profile()
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
       OR NEW.gate_threshold IS DISTINCT FROM OLD.gate_threshold
       OR NEW.max_decisions_per_certificate
         IS DISTINCT FROM OLD.max_decisions_per_certificate
       OR NEW.max_nominated_citations IS DISTINCT FROM OLD.max_nominated_citations
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
    IF current_setting('app.ewg_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.ewg_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_ewg_profile_protect
BEFORE INSERT OR UPDATE ON agent_ewg_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_ewg_profile();

CREATE FUNCTION protect_agent_ewg_profile_gate_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status ewg_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_ewg_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile gate rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_ewg_profile_gate_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_ewg_profile_gate_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_ewg_profile_gate_rule();

CREATE FUNCTION protect_agent_ewg_clock_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_clock$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'clock bindings are append-only';
  END IF;
  RETURN NEW;
END
$protect_clock$;

CREATE TRIGGER agent_ewg_clock_binding_protect
BEFORE INSERT OR UPDATE ON agent_ewg_clock_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_ewg_clock_binding();

CREATE FUNCTION protect_agent_ewg_gate_certificate()
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
       OR NEW.gate_steward_a IS DISTINCT FROM OLD.gate_steward_a
       OR NEW.gate_steward_b IS DISTINCT FROM OLD.gate_steward_b
       OR NEW.prior_extension_steward_a
         IS DISTINCT FROM OLD.prior_extension_steward_a
       OR NEW.prior_extension_steward_b
         IS DISTINCT FROM OLD.prior_extension_steward_b THEN
      RAISE EXCEPTION 'purpose gate certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.gate_steward_a = NEW.gate_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct gate stewards';
  END IF;
  IF NEW.gate_steward_a = NEW.prior_extension_steward_a
     OR NEW.gate_steward_a = NEW.prior_extension_steward_b
     OR NEW.gate_steward_b = NEW.prior_extension_steward_a
     OR NEW.gate_steward_b = NEW.prior_extension_steward_b THEN
    RAISE EXCEPTION 'prior-extension-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_ewg_gate_certificate_protect
BEFORE INSERT OR UPDATE ON agent_ewg_gate_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_ewg_gate_certificate();

CREATE FUNCTION protect_agent_ewg_gate_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.citation_id IS DISTINCT FROM OLD.citation_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.prior_clock_hash IS DISTINCT FROM OLD.prior_clock_hash
       OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.decision_ordinal IS DISTINCT FROM OLD.decision_ordinal
       OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.key_lifecycle IS DISTINCT FROM OLD.key_lifecycle
       OR NEW.clock_lifecycle IS DISTINCT FROM OLD.clock_lifecycle
       OR NEW.attested_key_kind IS DISTINCT FROM OLD.attested_key_kind
       OR NEW.terminal_kind IS DISTINCT FROM OLD.terminal_kind
       OR NEW.gate_kind IS DISTINCT FROM OLD.gate_kind
       OR NEW.gate_action IS DISTINCT FROM OLD.gate_action
       OR NEW.body_visibility IS DISTINCT FROM OLD.body_visibility
       OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
       OR NEW.clock_disposition IS DISTINCT FROM OLD.clock_disposition
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id
       OR NEW.opens_nested_expiry IS DISTINCT FROM OLD.opens_nested_expiry THEN
      RAISE EXCEPTION 'gate decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'clock-as-trust fence blocks rewriting a re-armed clock as enrolled trust';
  END IF;

  IF NEW.gate_kind IN ('ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ')
     AND NEW.attested_key_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'silence-success fence blocks an allow gate on a silent key';
  END IF;

  IF NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from a purpose gate';
  END IF;

  IF NEW.gate_kind IN ('ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ')
     AND NEW.clock_lifecycle = 'UNATTESTED' THEN
    RAISE EXCEPTION 'unattested-clock fence blocks an allow gate on an unattested clock';
  END IF;

  IF NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks a gate for invented successor history';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'gate-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'halt-read fence blocks exposing a disputed fact body';
  END IF;

  IF NEW.gate_action = 'TOOL_MUTATE' THEN
    RAISE EXCEPTION 'tool-mutate fence blocks mutation from an envelope purpose gate';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.placement_kind = 'RESTORED_WITHOUT_WINNER' THEN
    RAISE EXCEPTION 'terminal-restore fence blocks restore of a sealed terminal';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than citation attenuation';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.gate_kind IN ('ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ')
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose reads after attenuation hops';
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

  IF NEW.gate_kind IN ('ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ')
     AND NEW.clock_disposition IS DISTINCT FROM 'REARMED' THEN
    RAISE EXCEPTION 'clock-not-extended fence blocks an allow gate without a re-armed clock';
  END IF;

  IF NEW.gate_kind = 'ALLOW_ENVELOPE_READ'
     AND (
       NEW.gate_action IS DISTINCT FROM 'READ'
       OR NEW.body_visibility IS DISTINCT FROM 'ENVELOPE_ONLY'
       OR NEW.placement_kind IS DISTINCT FROM 'EXTENDED_HALT'
       OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
       OR NEW.terminal_kind IS DISTINCT FROM 'REQUIRE_HUMAN'
       OR NEW.purpose_relation IS DISTINCT FROM 'NARROWS'
     ) THEN
    RAISE EXCEPTION 'envelope-read fence requires a narrowed envelope on a held citation';
  END IF;

  IF NEW.gate_kind = 'ALLOW_TOOL_READ'
     AND (
       NEW.gate_action IS DISTINCT FROM 'TOOL_READ'
       OR NEW.body_visibility IS DISTINCT FROM 'ENVELOPE_ONLY'
       OR NEW.placement_kind IS DISTINCT FROM 'EXTENDED_HALT'
       OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
       OR NEW.terminal_kind IS DISTINCT FROM 'REQUIRE_HUMAN'
       OR NEW.purpose_relation IS DISTINCT FROM 'NARROWS'
     ) THEN
    RAISE EXCEPTION 'tool-read fence requires a narrowed envelope on a held citation';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_ewg_gate_decision_protect
BEFORE INSERT OR UPDATE ON agent_ewg_gate_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_ewg_gate_decision();

CREATE FUNCTION protect_agent_ewg_effect_intent()
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

CREATE TRIGGER agent_ewg_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_ewg_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_ewg_effect_intent();

CREATE FUNCTION approve_agent_ewg_profile(
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
  stored_status ewg_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ewg_profile
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
  FROM agent_ewg_profile_gate_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_gate IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control gate rule';
  END IF;

  PERFORM set_config(
    'app.ewg_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_ewg_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_ewg_profile(
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
  stored_status ewg_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_ewg_profile
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
    'app.ewg_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_ewg_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_ewg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ewg_profile_authority;
ALTER FUNCTION revoke_agent_ewg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_ewg_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_ewg_profile_authority;
GRANT SELECT ON
  agent_ewg_profile,
  agent_ewg_profile_gate_rule
TO agent_ewg_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ewg_profile TO agent_ewg_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_ewg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_ewg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_ewg_profile FROM PUBLIC;

CREATE INDEX agent_ewg_session_work_idx ON agent_ewg_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_ewg_session_profile_idx ON agent_ewg_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_ewg_decision_certificate_idx ON agent_ewg_gate_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_ewg_decision_citation_idx ON agent_ewg_gate_decision (
  account_id, citation_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_ewg_catalog_ref_idx ON agent_ewg_citation_catalog (
  account_id, receipt_ref, sealed_at DESC, citation_id
);
CREATE INDEX agent_ewg_catalog_kind_idx ON agent_ewg_citation_catalog (
  account_id, source_kind, sealed_at DESC, citation_id
);
CREATE INDEX agent_ewg_receipt_session_idx ON agent_ewg_gate_receipt (
  account_id, session_id, gated_at DESC, gate_id
);
CREATE INDEX agent_ewg_certificate_session_idx ON agent_ewg_gate_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_ewg_clock_session_idx ON agent_ewg_clock_binding (
  account_id, session_id, captured_at DESC, clock_binding_id
);
CREATE INDEX agent_ewg_effect_work_idx ON agent_ewg_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_ewg_audit_time_idx ON agent_ewg_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_ewg_perception_status_idx ON agent_ewg_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_ewg_command_expiry_idx ON agent_ewg_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_ewg_invalidation_certificate_idx ON agent_ewg_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_ewg_authorization_evidence',
    'agent_ewg_profile',
    'agent_ewg_profile_gate_rule',
    'agent_ewg_citation_catalog',
    'agent_ewg_session',
    'agent_ewg_nomination',
    'agent_ewg_clock_binding',
    'agent_ewg_gate_receipt',
    'agent_ewg_gate_certificate',
    'agent_ewg_gate_decision',
    'agent_ewg_invalidation',
    'agent_ewg_effect_intent',
    'agent_ewg_budget_ledger',
    'agent_ewg_terminal_record',
    'agent_ewg_command_result',
    'agent_ewg_audit_head',
    'agent_ewg_audit_event',
    'agent_ewg_audit_anchor',
    'agent_ewg_perception_snapshot',
    'agent_ewg_projection_checkpoint'
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

Open, nominate, bind, evaluate, seal, invalidate, and
effect-prepare each run in a single ACID row-store
transaction with session compare-and-swap. Certificate seal
never joins a neighbor board write, never updates the
disputed fact, and never rewrites the successor clock.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers set `app.account_id`
before query. Composite primary keys and every access index
lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API.
Long-running notify work returns durable state, not a
synchronous board promise. Profile search discovers
procedural memory. It does not authorize a gate.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentEwgSessionStatus {
  OPEN
  NOMINATING
  GATING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentEwgBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentEwgSourceKind {
  SEALED_SLA_EXTENSION_CERT
  SEALED_SLA_FACT_HOLD
  SEALED_PLACED_CITATION
  SEALED_EXTENDED_WS_PACKET
  SEALED_PURPOSE_SLOT
}

enum AgentEwgPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentEwgKeyLifecycle {
  FIRST_ENROLLMENT
  CONFIRMED
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentEwgClockLifecycle {
  ATTESTED
  UNATTESTED
  UNKNOWN_EFFECT
}

enum AgentEwgAttestedKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentEwgTerminalKind {
  REQUIRE_HUMAN
  PERMANENT_QUARANTINE
  HOLD_UNKNOWN
  REJECT_CYCLE_CONFIRM
  REJECT_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentEwgGateKind {
  ALLOW_ENVELOPE_READ
  ALLOW_TOOL_READ
  DENY_HALT_READ
  DENY_CLOCK_AS_TRUST
  DENY_PURPOSE_AMPLIFY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentEwgGateAction {
  READ
  TOOL_READ
  TOOL_MUTATE
}

enum AgentEwgBodyVisibility {
  ENVELOPE_ONLY
  BODY_VISIBLE
  OMITTED
}

enum AgentEwgFactDisposition {
  DISPUTED_HELD
  HALTED
  QUARANTINE_OMITTED
  RESTORED
  UNKNOWN_EFFECT
}

enum AgentEwgClockDisposition {
  REARMED
  UNCHANGED
  REGRESSED
  UNKNOWN_EFFECT
}

enum AgentEwgPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentEwgEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentEwgNextAction {
  NOMINATE_EXTENDED_CITATION
  BIND_SUCCESSOR_CLOCK
  EVALUATE_PURPOSE_GATE
  SEAL_PURPOSE_GATE_CERTIFICATE
  INVALIDATE_PURPOSE_GATE
  PREPARE_PURPOSE_GATE_EFFECT
  PURPOSE_GATE_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentEwgBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CITATION_MISSING
  GATE_NOT_READY
  HISTORY_REWRITE_DENIED
  CLOCK_AS_TRUST_DENIED
  SILENCE_SUCCESS_DENIED
  FIRST_ENROLLMENT_AUTO_TRUST_DENIED
  GATE_AS_RESTORE_DENIED
  GATE_AS_CONFIRMATION_DENIED
  HALT_READ_DENIED
  TOOL_MUTATE_DENIED
  TERMINAL_RESTORE_DENIED
  QUARANTINE_LEAK_DENIED
  NESTED_EXPIRY_DENIED
  PRIOR_STEWARD_EXCLUSION_DENIED
  LEDGER_SCAN_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  CLOCK_REGRESSION_DENIED
  CLOCK_NOT_EXTENDED_DENIED
  UNBOUND_CITATION_DENIED
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

enum AgentEwgUncertaintyResolution {
  RETRY_SAME_CITATION
  ACCEPT_OBSERVATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentEwgInvalidationReason {
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

type AgentEwgBudget {
  nominateUnits: Long!
  bindUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  gateThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedCitations: Int!
}

type AgentEwgProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  gateThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedCitations: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentEwgSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentEwgSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentEwgBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentEwgNominationReceipt {
  accountId: ID!
  sessionId: ID!
  citationId: ID!
  sourceKind: AgentEwgSourceKind!
  terminalKind: AgentEwgTerminalKind!
  placementKind: AgentEwgPlacementKind!
  keyLifecycle: AgentEwgKeyLifecycle!
  clockLifecycle: AgentEwgClockLifecycle!
  disputedFactHash: SHA256!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  haltScopeHash: SHA256!
  priorExtensionStewardA: String!
  priorExtensionStewardB: String!
  nominationHash: SHA256!
  nominatedAt: DateTime!
  expiresAt: DateTime!
}

type AgentEwgClockBinding {
  accountId: ID!
  clockBindingId: ID!
  sessionId: ID!
  citationId: ID!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  haltScopeHash: SHA256!
  lastSourceCertificateId: ID!
  capturedAt: DateTime!
}

type AgentEwgGateReceipt {
  accountId: ID!
  gateId: ID!
  sessionId: ID!
  priorClockHash: SHA256!
  successorClockHash: SHA256!
  disputedFactHash: SHA256!
  haltScopeHash: SHA256!
  attenuationHash: SHA256!
  citationSetHash: SHA256!
  gateHash: SHA256!
  gatedAt: DateTime!
}

type AgentEwgGateCertificate {
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
  citationSetHash: SHA256!
  gateStewardA: String!
  gateStewardB: String!
  priorExtensionStewardA: String!
  priorExtensionStewardB: String!
  decisionWatermark: Int!
  sealedAt: DateTime!
}

type AgentEwgGateDecision {
  accountId: ID!
  decisionId: ID!
  certificateId: ID!
  sessionId: ID!
  citationId: ID!
  sourceKind: AgentEwgSourceKind!
  decisionOrdinal: Int!
  status: AgentEwgBindingStatus!
  placementKind: AgentEwgPlacementKind!
  keyLifecycle: AgentEwgKeyLifecycle!
  clockLifecycle: AgentEwgClockLifecycle!
  attestedKeyKind: AgentEwgAttestedKeyKind!
  terminalKind: AgentEwgTerminalKind!
  gateKind: AgentEwgGateKind!
  gateAction: AgentEwgGateAction!
  bodyVisibility: AgentEwgBodyVisibility!
  factDisposition: AgentEwgFactDisposition!
  clockDisposition: AgentEwgClockDisposition!
  purposeRelation: AgentEwgPurposeRelation!
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

type AgentEwgEffectObservation {
  effectId: ID!
  status: AgentEwgEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentEwgPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentEwgSessionStatus!
  summary: AgentUntrustedText!
  sealedDecisionCount: Int!
  envelopeReadCount: Int!
  toolReadCount: Int!
  disputedHeldCount: Int!
  haltDeniedCount: Int!
  clockTrustDeniedCount: Int!
  quarantineOmittedCount: Int!
  unknownDecisionCount: Int!
  skippedDecisionCount: Int!
  invalidatedDecisionCount: Int!
  uncertainEffectIntents: [AgentEwgEffectObservation!]!
  remainingBudget: AgentEwgBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentEwgNextAction!]!
  blockedReasons: [AgentEwgBlockedReason!]!
  cardHash: SHA256!
}

type AgentEwgMutationResult {
  decision: String!
  session: AgentEwgSession
  certificate: AgentEwgGateCertificate
  gateDecision: AgentEwgGateDecision
  receipt: AgentEwgNominationReceipt
  binding: AgentEwgClockBinding
  gate: AgentEwgGateReceipt
  perception: AgentEwgPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentEwgBudgetInput {
  nominateUnits: Long!
  bindUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  gateThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedCitations: Int!
}

input CreatePurposeGateSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentEwgBudgetInput!
}

input NominateExtendedCitationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  expectedDisputedFactHash: SHA256!
  expectedSuccessorClockHash: SHA256!
  idempotencyKey: String!
}

input BindSuccessorClockInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  expectedPriorClockHash: SHA256!
  expectedSuccessorClockHash: SHA256!
  idempotencyKey: String!
}

input EvaluatePurposeGateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedPriorClockHash: SHA256!
  expectedSuccessorClockHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealPurposeGateCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  gateId: ID!
  consumerRef: String!
  gateStewardA: String!
  gateStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input InvalidatePurposeGateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  citationId: ID!
  reasonCode: AgentEwgInvalidationReason!
  idempotencyKey: String!
}

input PreparePurposeGateEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input PurposeGateEffectUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: AgentEwgUncertaintyResolution!
  idempotencyKey: String!
}

input AgentEwgProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentExtendedWorkingSetGateProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentEwgProfile
  agentExtendedWorkingSetGateSession(
    accountId: ID!
    sessionId: ID!
  ): AgentEwgSession
  agentExtendedWorkingSetGateCertificate(
    accountId: ID!
    certificateId: ID!
  ): AgentEwgGateCertificate
  agentExtendedWorkingSetGatePerception(
    accountId: ID!
    sessionId: ID!
  ): AgentEwgPerceptionCard
  agentExtendedWorkingSetGateNomination(
    accountId: ID!
    sessionId: ID!
    citationId: ID!
  ): AgentEwgNominationReceipt
  agentExtendedWorkingSetGateSearchProfiles(
    input: AgentEwgProfileSearchInput!
  ): [AgentEwgProfile!]!
}

type Mutation {
  createExtendedWorkingSetGateSession(
    input: CreatePurposeGateSessionInput!
  ): AgentEwgMutationResult!
  nominateExtendedWorkingSetCitation(
    input: NominateExtendedCitationInput!
  ): AgentEwgMutationResult!
  bindExtendedWorkingSetSuccessorClock(
    input: BindSuccessorClockInput!
  ): AgentEwgMutationResult!
  evaluateExtendedWorkingSetPurposeGate(
    input: EvaluatePurposeGateInput!
  ): AgentEwgMutationResult!
  sealExtendedWorkingSetPurposeGate(
    input: SealPurposeGateCertificateInput!
  ): AgentEwgMutationResult!
  invalidateExtendedWorkingSetPurposeGate(
    input: InvalidatePurposeGateInput!
  ): AgentEwgMutationResult!
  prepareExtendedWorkingSetPurposeGateEffect(
    input: PreparePurposeGateEffectInput!
  ): AgentEwgMutationResult!
  extendedWorkingSetPurposeGateEffectUncertainty(
    input: PurposeGateEffectUncertaintyInput!
  ): AgentEwgMutationResult!
  approveExtendedWorkingSetGateProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentEwgMutationResult!
  revokeExtendedWorkingSetGateProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentEwgMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when decision ordinal exceeds
  session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool
  payloads, or redacted fact bodies. They never include a
  `resolvedFactHash` and never include `TRUSTED_ENROLLED`
  as an outcome of this plane.
- `sealExtendedWorkingSetPurposeGate` is rejected with
  `CLOCK_AS_TRUST_DENIED` when a gate would invent
  `TRUSTED_ENROLLED`, with `GATE_AS_RESTORE_DENIED` when a
  disputed fact would become visible, with
  `HALT_READ_DENIED` when `body_visibility` would be
  `BODY_VISIBLE`, with `TOOL_MUTATE_DENIED` when the action
  would mutate, with `CLOCK_REGRESSION_DENIED` when the
  successor clock would move backward, with
  `QUARANTINE_LEAK_DENIED` when a `PERMANENT_QUARANTINE`
  body would become visible, with `NESTED_EXPIRY_DENIED`
  when another expiry-containment-review-resolution plane
  would open, and with `LEDGER_SCAN_DENIED` when the
  citation would be found by walking a vote, TTL, page,
  ack, escalation, review, or resolution ledger.

## 10. Procedural memory

Approved gate profiles are procedural memory: versioned
instructions for how a citation placed into a clock-extended
working set may be envelope-read or tool-read without
restoring a disputed fact and without rewriting a re-armed
clock as `TRUSTED_ENROLLED`. Procedure refs may point to
human-escalation or permanent-quarantine playbook steps.
Profiles are immutable after approval; agents perceive them
as tagged instructions, never as authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses account-owned embeddings and
pgvector/HNSW-compatible ANN. Retrieval is a discovery
hint only. Every ANN query must include `account_id`
equality before `topK`. Cross-tenant HNSW is forbidden.
An embedding hit never authorizes nominate, bind,
evaluate, seal, or notify.

```sql
CREATE TABLE agent_ewg_profile_embedding (
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
    REFERENCES agent_ewg_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_ewg_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ewg_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_ewg_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped citation-catalog or board walks are FULL SCAN REJECTED.
```

## 12. Agent perception

Agents receive perception cards summarizing session status,
sealed-decision, envelope-read, tool-read, disputed-held,
halt-denied, clock-trust-denied, quarantine-omitted,
unknown, skipped, and invalidated counts, uncertain notify
intents, remaining budgets, procedure tags, allowed next
actions, and blocked reasons. Summary text is
`UntrustedText`. Cards never embed raw private keys,
redacted fact bodies, or a winning fact hash. `cardHash`
makes perception replayable.

Agents perceive `ALLOW_ENVELOPE_READ` with
`body_visibility = ENVELOPE_ONLY`,
`clock_disposition = REARMED`, and
`fact_disposition = DISPUTED_HELD` as permission to read
the citation envelope while the dispute stays held and the
key stays `AWAITING_CONFIRMATION`. They perceive
`ALLOW_TOOL_READ` the same way for a tool read that has
not yet produced a provider receipt. They perceive
`DENY_HALT_READ` and `DENY_CLOCK_AS_TRUST` as trusted
negatives: a re-armed clock did not unlock the body and
did not enroll the key. They perceive
`QUARANTINE_OMITTED` as a sealed omit. They perceive
`SKIP` as a sealed refusal. They do not perceive a
re-armed clock as `TRUSTED_ENROLLED`.

Metadata tags on the card are `purpose-gate`,
`envelope-only`, `clock-rearmed`, `fact-held`, and the
profile's procedure ref. Those tags are for retrieval.
They are not grants.

## 13. ACID and consistency

### Row store

Session compare-and-swap, nomination receipts, clock
bindings, gate receipts, certificate seals, and audit
appends are ACID transactions in the hybrid row store.
Gate decisions and clock hashes commit together. A restored
fact cannot commit in a later "best effort" write. This
plane does not update the SLA extension certificate that
re-armed the clock.

### Columnar store

Columnar projections may accelerate analytics over sealed
gate certificates but are not authoritative for
`ALLOW_ENVELOPE_READ`, `DISPUTED_HELD`, or
`QUARANTINE_OMITTED` outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable
profile approval events. Staleness is visible via source
watermarks. The vector path cannot seal a certificate.

### External tools

Notify dispatch and tool reads are not silently
ACID-coupled. Silence becomes `UNKNOWN_EFFECT`. A prepared
tool-read intent is not evidence that the provider
returned the envelope.

## 14. Guardrails and neighbor protection

- Decision and threshold caps on gates per certificate and
  per session.
- Budget ledgers for NOMINATE, BIND, SEAL, VECTOR,
  INVALIDATE, and NOTIFY.
- Purpose attenuation narrowing only.
- Forced RLS on every table, including profile embeddings.
- Planner rejects unscoped citation-catalog, clock-catalog,
  working-set, grant-graph, confirm-ledger, vote-ledger,
  TTL-ledger, page-ledger, ack-ledger, escalation-ledger,
  review-ledger, containment-ledger, resolution-ledger,
  promotion-ledger, or board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without
  scanning neighbors.
- A gate never auto-restores neighbor-visible board
  mutations from halted slots.
- Nested-expiry fence rejects opening another
  expiry-containment-review-resolution plane.
- Quarantine-leak fence rejects visible restore of a
  `PERMANENT_QUARANTINE` body.
- Gate-as-restore fence rejects `fact_disposition =
  RESTORED` even when the successor clock hash is new.
- Clock-as-trust fence rejects `TRUSTED_ENROLLED` even
  when the gate stewards are distinct.
- Tool-mutate fence rejects `TOOL_MUTATE` so an envelope
  read cannot become a board write inside this plane.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding citations "unlocked" by a re-armed clock by
  scanning the confirmation-vote, TTL-retirement, page,
  ack, escalation, review, or resolution ledger (rejected;
  nominate by `(account_id, citation_id)`).
- Computing `successor_clock_hash` by walking every sealed
  SLA extension certificate for an account (rejected;
  point lookup of the citation catalog and the clock
  binding).
- Authorizing reads by walking all notify intents or all
  gate decisions for an account (rejected).
- Vector search without an `account_id` predicate
  (rejected).
- Invalidation by scanning all certificates for an account
  (rejected; use certificate-keyed indexes).

Any of those plans is **FULL SCAN REJECTED** before
execution. A board with 1M+ rows must not be visited to
gate one citation.

### Required access paths

- Citation nomination: primary key
  `(account_id, citation_id)`.
- Clock bind: unique
  `(account_id, session_id, citation_id, successor_clock_hash)`.
- Evaluate and seal: primary key `(account_id, gate_id)`
  and `(account_id, certificate_id)`, plus unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Decisions by certificate or citation: composite indexes
  leading with `account_id`.
- Notify work: partial index on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate, or
requiring an unscoped board, working-set, grant-graph,
citation-catalog, clock-catalog, confirm-ledger,
vote-ledger, TTL-ledger, page-ledger, ack-ledger,
escalation-ledger, review-ledger, containment-ledger,
resolution-ledger, promotion-ledger, or citation scan, is
**FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay
reconstructs session, clock binding, gate receipt,
certificate, and gate-decision state without LLM calls.
Replay can show that `body_visibility` stayed
`ENVELOPE_ONLY` while `disputed_fact_hash` did not change
and `attested_key_kind` stayed `AWAITING_CONFIRMATION`.
Replay cannot invent a winner or `TRUSTED_ENROLLED` the
seal never stored.

## 17. Threat and failure analysis

- Cross-tenant certificate via forged identifiers: blocked
  by forced RLS and primary-key scope.
- Purpose amplification: attenuation hash must narrow
  relative to the citation and session purposes.
- Sticky success after supersession: invalidation plus
  re-evaluation plus notify uncertainty plus profile
  revocation.
- Re-armed clock invented as `TRUSTED_ENROLLED`:
  clock-as-trust, history-rewrite, silence-success, and
  gate-as-confirmation fences.
- First-enrollment key auto-promoted by a purpose gate:
  first-enrollment-auto-trust fence.
- Citations discovered by walking vote, TTL, page, ack,
  escalation, review, or containment ledgers: ledger-scan
  fence and **FULL SCAN REJECTED**.
- Disputed fact restored because the clock moved:
  gate-as-restore fence. There is no `resolved_fact_hash`.
- Halted body shown because the envelope was allowed:
  halt-read fence. `BODY_VISIBLE` is rejected.
- Tool read upgraded to a board mutation: tool-mutate
  fence.
- Quarantined body shown because a gate sealed:
  quarantine-leak fence.
- Hop leak of donor purpose after attenuation hops:
  hop-leak fence.
- Successor clock moved backward to rewrite history:
  clock-regression fence.
- Extension stewards grant themselves the read:
  prior-extension-steward exclusion.
- Opening another nested expiry after a gate:
  nested-expiry fence.
- Silent notify success: `UNKNOWN_EFFECT` until
  acknowledgement.
- Recursive catalog or board storms: budgets and
  **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced
  approve and revoke only.

## 18. Observability and SLOs

- Open, nominate, bind, evaluate, seal, and perception
  p99 latency budgets for 99.99% control-plane availability.
- Clock-as-trust rejection, silence-success rejection,
  first-enrollment-auto-trust rejection, gate-as-restore
  rejection, halt-read rejection, tool-mutate rejection,
  clock-regression rejection, quarantine-leak rejection,
  nested-expiry rejection, ledger-scan rejection,
  purpose-amplification rejection, and `UNKNOWN_EFFECT`
  rate as first-class metrics.
- Threshold-failure rejection and full-scan rejection
  counters per account.
- Audit chain gap alerts.
- An allow decision with `BODY_VISIBLE`, `RESTORED`, or
  `TRUSTED_ENROLLED` is a page-worthy invariant break, not
  a success.

## 19. Rollout

### Phase 1: shadow gates

Approve gate profiles and validate citation-catalog
nomination without durable certificates.

### Phase 2: deny-only

Allow sealed certificates whose gate kind is
`DENY_HALT_READ`, `DENY_CLOCK_AS_TRUST`,
`DENY_PURPOSE_AMPLIFY`, or `SKIP`. Envelope reads stay
closed.

### Phase 3: envelope reads with facts held

Enable budgeted `ALLOW_ENVELOPE_READ` only when
`body_visibility` is `ENVELOPE_ONLY`, `fact_disposition`
is `DISPUTED_HELD`, `clock_disposition` is `REARMED`, and
`attested_key_kind` is `AWAITING_CONFIRMATION`. A sealed
certificate never writes `TRUSTED_ENROLLED`.

### Phase 4: tool-read and notify uncertainty

Enable `ALLOW_TOOL_READ` under the same fences.
`TOOL_MUTATE` stays rejected. Notify intents stay
`UNKNOWN_EFFECT` until acknowledged. Quarantine citations
remain `QUARANTINE_OMITTED`.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor
budgets. Agents may discover profiles. They may not treat
a re-armed clock as permission to read a disputed body or
to open another nested expiry plane.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite plus pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability,
  clock-as-trust, gate-as-restore, and effect start state.

### Behavioral validation

- Nominate requires sealed citation-catalog material by
  point lookup and hash match.
- Bind of the successor clock is a point lookup and never
  a vote-ledger, page-ledger, ack-ledger, or
  escalation-ledger scan. Bind does not move the clock.
- Evaluate binds prior clock, successor clock, disputed
  fact, halt scope, and attenuation under budget, and
  rejects `RESTORED`, `BODY_VISIBLE`, `TOOL_MUTATE`, and
  `TRUSTED_ENROLLED`.
- Seal is rejected when a gate would become
  `TRUSTED_ENROLLED`, when a disputed fact would be
  restored, when a body would become visible, when the
  clock would regress, when a quarantined body would
  become visible, when another nested expiry would open,
  or when the citation would be found by scanning
  ledgers. Seal never invents a winning fact hash.
- Certificate seal binds decisions under prior-clock,
  successor-clock, disputed-fact, halt-scope, and
  attenuation hashes.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- On boards with 1M+ rows, no nominate, bind, evaluate, or
  seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed gate certificates after
  process restart and shows the disputed fact hash
  unchanged and the key still unconfirmed.

## 21. Product decision

Adopt the Extended Working-Set Purpose Gate Plane as the
deterministic way to authorize envelope-scoped reads of
citations placed into working sets whose clocks were
re-armed by SLA extension certificates.

Ship it because:

1. It preserves ACID and multi-tenant isolation while
   closing the authorization gap without history rewrite,
   clock-as-trust, silence-success, first-enrollment
   auto-trust, gate-as-restore, halt-read, tool-mutate,
   ledger scans, quarantine leak, purpose amplification,
   invented winners, or vote, page, ack, escalation,
   containment, review, resolution, or promotion ledger
   walks.
2. Account-leading indexes, the gate-as-restore fence, and
   **FULL SCAN REJECTED** planner rules protect 99.99%
   neighbor latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW
   profile discovery, perception cards, and hash-chained
   audit replay make the plane agent-ready without putting
   probabilistic AI inside the data engine.
4. This increment gates envelope reads only. The next
   increment should bind sealed `ALLOW_TOOL_READ` decisions
   to provider-receipt attestation with `UNKNOWN_EFFECT`
   honesty. Do not add another nested
   expiry-containment-review-resolution plane. Do not
   treat a re-armed clock as `TRUSTED_ENROLLED`. Do not
   restore a disputed fact.
