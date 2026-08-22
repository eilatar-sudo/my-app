# mondayDB Agentic Successor-Clock Re-Attestation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-22.v1`

## 1. Why this plane, before how

A sealed watermark-clock attestation certificate can bind a retirement or
compromise watermark to a deterministic provider clock. It does not decide
**whether a quarantined receipt may be rebound** to a newly attested
successor clock — without scanning every historical receipt, rewriting
silence into a trusted pre-watermark success, or inventing a winner from a
regressed, post-watermark, or halted body.

Without a successor-clock re-attestation plane, operators and agents either:

- scan every quarantined receipt looking for "which signatures can ride
  the new clock" (neighbor-harmful on boards with 1M+ rows), or
- treat a newly attested successor clock as retroactive engine truth, so
  historical `UNKNOWN_EFFECT` is rewritten as `ACKED`, a receipt signed
  after the retirement watermark is trusted, a halt-scoped body is
  "unlocked" by later successor success, and hop-attenuated purpose is
  amplified back to the donor.

The product trade-off is **rebind fluency versus rebind isolation**:

- Accepting every successor-clock arrival immediately maximizes agent
  fluency and reduces re-planning cost, but creates history-rewrite
  invention, post-watermark trust leak, invented-success leak, unauditable
  rebind storms, and recursive receipt-catalog walks against neighbors.
- Binding a sealed re-attestation certificate under an approved reattest
  profile, receipt point lookups, history-rewrite fences, post-watermark
  fences, invented-success fences, halt-reattest fences,
  purpose-amplification fences, successor-leak fences, and steward budgets
  adds one bounded evaluate transaction and short-lived rebind storage.
- Semantic similarity may discover reattest profiles, but it must never
  decide whether a receipt may be nominated, a successor evaluated, a
  certificate sealed, or a notify dispatched.

The recommended model keeps the data plane deterministic:

1. An approved reattest profile defines allowed receipt kinds, successor
   policy, and notify policy. Evaluation **never** invents a winning fact
   hash and **never** rewrites a historical receipt kind.
2. A reattest session opens under purpose, budget, and authorization
   fences, and only nominates sealed quarantined receipts, clock
   certificates, successor samples, or retired-key claims by point lookup
   from the Watermark-Clock Attestation, Key-Compromise Quarantine, and
   Provider-Key Rotation planes.
3. mondayDB evaluates a rebind whose kind is a pure function of
   `(source_receipt_kind, placement_kind, successor_lifecycle,
   receipt_lifecycle, attested_successor_kind, requested_purpose_hash,
   attenuation_hash, hop_count, retired_signed_at,
   successor_first_attested_at, retirement_watermark_at, max_skew_ms)`.
   Silence cannot become historical success. Post-watermark receipts
   cannot become trusted. Invented successor history cannot become
   trusted. Halted slots cannot become rebind-trusted.
4. Sealing a reattest certificate binds
   `consumer_ref + purpose_hash + receipt_set_hash + successor_set_hash +
   watermark_set_hash + attenuation_hash`. The certificate **must not**
   emit a `resolved_fact_hash`.
5. Upstream invalidation marks certificates stale; notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. Re-attestation of `UNKNOWN_EFFECT`
   remains uncertain until a trusted monotonic successor arrives.
6. Unscoped receipt-catalog, clock-catalog, quarantine-ledger, working-set,
   grant-graph, or board scans are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"re-judge every historical receipt forever" or "keep every post-watermark
signature until silence looks like success" loops are rejectable before they
scan boards with 1M+ rows. Perception is restored by sealed reattest
certificates, not by magic time orchestration inside the engine.

### Product outcome

For any successor-clock re-attestation evaluation, mondayDB can answer:

- Which profile, principal, and session authorized the nomination, evaluate,
  seal, invalidate, or notify dispatch?
- Which nominated receipts, placement kinds, hop counts, attenuation
  hashes, attested successor kinds, and reattest kinds were bound?
- Is the reattest certificate still current, invalidated, or awaiting
  notify acknowledgement?
- Did async notify or successor-clock sync become `UNKNOWN_EFFECT`?
- Can the rebind history be replayed without invoking an LLM?

## 2. Scope and ownership

The Successor-Clock Re-Attestation Plane owns:

1. Immutable approved reattest profiles as procedural memory of "how a
   quarantined receipt is rebound to a deterministic successor clock
   without amplifying purpose, leaking halted facts, rewriting attested
   history, or inventing success from silence or post-watermark trust."
2. Tenant-scoped reattest sessions with purpose and budget fences.
3. Deterministic nomination of sealed receipts, clock certificates, and
   successor samples by point lookup — never receipt-catalog, working-set,
   or board scans.
4. Deterministic evaluation receipts, sealed reattest certificates, and
   immutable reattest bindings that never invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded reattest budgets.

It integrates with, but does not replace:

- **Watermark-Clock Attestation:** supplies sealed successor-clock
  certificates that this plane may rebind receipts against. This plane
  never re-attests the clock itself.
- **Key-Compromise Quarantine:** supplies sealed quarantined receipts
  whose signed-at timestamps are compared only after this plane evaluates
  a successor rebind.
- **Provider-Key Rotation:** supplies sealed retirement watermarks and
  successor enrollment hashes that still require re-attestation of
  existing receipts.
- **Provider-Receipt Attestation:** supplies sealed receipt IDs whose
  trusted-at timestamps remain historical; this plane does not rewrite
  them as successor-signed.
- **Envelope Tool-Effect Saga / Envelope Purpose Gate / Certificate
  Placement:** upstream hop-attenuated context that produced the receipts
  now under successor rebind review.
- **Executive Freeze / Thaw SLA:** halt/restore context that still forbids
  rebind-to-successor against a halted body.
- **Emergency Containment:** the coarse stop/drain path used when a
  contained receipt evaluates to `SKIP` or `REJECT_POST_WATERMARK`; this
  plane is purpose-scoped rebind isolation, not workspace-wide
  containment.
- **Decision Memory:** may consume sealed reattest certificates as reuse
  evidence, not raw successor-clock webhooks.
- **Query Governor / Budgets:** reserves nominate, evaluate, vector, seal,
  invalidate, and reattest units.

### Non-goals

- Letting an LLM decide that a silent or post-watermark receipt "feels
  reboundable enough."
- Auto-amplifying a hop-narrowed purpose back to the donor purpose.
- Reconstructing authoritative reattest certificates from columnar or
  vector projections.
- Cross-account successor rebind or global nearest-neighbor authorization.
- Storing raw private keys, unrestricted tool payloads, or redacted
  plaintext.
- Claiming distributed atomicity with external time-distribution providers.
- Inventing a winning fact hash when a successor clock arrives after a
  restored slot.
- Rewriting historical `SILENCE` or `UNKNOWN_EFFECT` receipts as
  `REBIND_TO_SUCCESSOR` because a new clock exists.
- Rewriting a later trusted receipt as invented success solely because a
  later successor sample exists (that is an explicit supersession, not
  this plane).
- Unbounded recursive receipt-catalog or board walks across boards with
  1M+ rows.

## 3. Product contract

### 3.1 Reattest profile contract

A profile version is immutable after approval. It defines:

- allowed observation kinds (`SEALED_QUARANTINE_RECEIPT`,
  `SEALED_CLOCK_CERTIFICATE`, `SUCCESSOR_CLOCK_SAMPLE`,
  `RETIRED_KEY_CLAIM`);
- evaluate threshold (distinct human or attested principals), max bindings
  per certificate, and max nominated receipts;
- reattest policy (`HISTORY_NEVER_REWRITTEN`,
  `POST_WATERMARK_NEVER_TRUSTED`, `SUCCESSOR_NEVER_INVENT_SUCCESS`,
  `HALT_DENIES_REBIND`,
  `PURPOSE_NARROW_ONLY`, `SUCCESSOR_NEVER_RESTORES_WINNER`,
  `GRACE_SILENCE_NEVER_SUCCESS`, `SKEW_BOUND_NEVER_TRUSTED_BEYOND`);
- purpose attenuation rules (narrowing only; never amplification);
- allowed reattest kinds (`REBIND_TO_SUCCESSOR`, `HOLD_UNKNOWN`,
  `REJECT_POST_WATERMARK`, `REJECT_INVENTED_SUCCESS`, `SKIP`) and notify
  policy after seal, invalidation, or upstream successor change;
- optional procedural refs for "how to present unknown, post-watermark, or
  invented-success truth without a winner."

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

Nominating a sealed receipt returns a nomination receipt. Evaluating a
rebind binds each nominated receipt to a reattest kind that is
compatible with the attested successor kind, placement kind, successor
lifecycle, receipt lifecycle, skew bound, and purpose relation. Sealing a
certificate binds
`consumer_ref + purpose_hash + receipt_set_hash + successor_set_hash +
watermark_set_hash + attenuation_hash`. Certificates **must not** emit a
`resolved_fact_hash` winner. Bindings compiled from silence or unknown
successors are rejected when the requested reattest kind is
`REBIND_TO_SUCCESSOR` (history-rewrite fence). Bindings compiled from
`POST_WATERMARK` receipts are rejected when the requested reattest
kind is `REBIND_TO_SUCCESSOR` (post-watermark-trust fence). Bindings
compiled from `INVENTED_HISTORY` successors are rejected when the
requested reattest kind is `REBIND_TO_SUCCESSOR` (invented-success
fence). Bindings compiled from halted, extended-halt, or omitted receipts
are rejected when the requested reattest kind is `REBIND_TO_SUCCESSOR`
(halt-reattest fence). Bindings that would amplify purpose relative to
the receipt attenuation hash are rejected (purpose-amplification fence).
Successor bindings that would emit a winner or restore a halted body are
rejected (successor-leak fence).

### 3.4 Invalidation and effect contract

Invalidations bind certificates to upstream rotation, quarantine, placement,
clock, or visibility revocation. Notify intents start as `PREPARED`, may
become `UNKNOWN_EFFECT` when the successor provider does not acknowledge,
and never invent success from silence. Re-attestation of `UNKNOWN_EFFECT`
remains `UNKNOWN_EFFECT` until a trusted monotonic successor arrives.

### 3.5 Availability contract

Reattest control-plane APIs target 99.99% availability for open, nominate,
evaluate, seal, and perception reads. External notify and successor-clock
side-effects are best-effort and surfaced as uncertainty rather than silent
success. Reattest evaluation must not silently restore neighbor-impacting
board mutations from halted slots, post-watermark receipts, or unsigned
successors.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and reattest rules are immutable.
4. Binding identity
   (`source_receipt_id`, `disputed_fact_hash`, `attenuation_hash`,
   `binding_ordinal`, `successor_clock_hash`) is immutable after seal.
5. Purpose attenuation may only narrow for consumers; amplification is rejected.
6. Receipt nomination uses point lookup by
   `(account_id, source_receipt_id)` — never full receipt-catalog or board
   scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   nominate/evaluate/seal/reattest.
10. Silence and unknown successors cannot evaluate to `REBIND_TO_SUCCESSOR`
    (history-rewrite fence).
11. Halted, extended-halt, and omitted receipts cannot evaluate to
    `REBIND_TO_SUCCESSOR` (halt-reattest fence).
12. Requested purposes that amplify a receipt attenuation hash are rejected
    (purpose-amplification fence).
13. Successor enrollment cannot emit a winning fact hash or restore a
    halted body (successor-leak fence).
14. Post-watermark receipts cannot evaluate to `REBIND_TO_SUCCESSOR`
    (post-watermark-trust fence).
15. Successor samples that invent history earlier than the first attested
    successor cannot evaluate to `REBIND_TO_SUCCESSOR` (invented-success
    fence).
16. Reattest certificates bind receipt set, successor set, watermark set,
    and attenuation hashes; they never invent a winning fact hash.
17. Plans that require unscoped board, session, working-set, grant-graph,
    receipt-catalog, clock-catalog, quarantine-ledger, or citation-ledger
    scans are **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate reattest rules. Approval validates definition
hash, requires at least one reattest rule, and fences the status
transition.

### 5.2 Open session

Open captures the approved profile version, purpose hash, budget
reservations, and authorization evidence. The session starts `OPEN` with
`state_revision = 0`. Duplicate `(account_id, idempotency_key)` is rejected.

### 5.3 Nominate and evaluate

Nominate performs a point lookup on the receipt catalog and writes an
immutable nomination receipt. Evaluate is a pure function of nominated
receipts, attested successor kinds, receipt lifecycles, skew bounds, and
purpose relation. It never walks the catalog.

### 5.4 Seal reattest certificate

Seal binds the evaluation hashes to a consumer ref. The certificate stores
receipt-set, successor-set, watermark-set, and attenuation hashes. It must
not store `resolved_fact_hash`.

### 5.5 Invalidate and dispatch

Invalidation is receipt-keyed. Notify intents start `PREPARED` and may
become `UNKNOWN_EFFECT`. Dispatch never scans neighbor boards.

## 6. Lifecycle

### 6.1 Draft profile

A steward inserts a `DRAFT` profile and at least one reattest rule. Approval
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
type SourceReceiptId = string & { readonly brand: "SourceReceiptId" };
type EvaluationId = string & { readonly brand: "EvaluationId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type BindingId = string & { readonly brand: "BindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_QUARANTINED_RECEIPT"
  | "EVALUATE_SUCCESSOR_CLOCK_REATTESTATION"
  | "SEAL_REATTEST_CERTIFICATE"
  | "INVALIDATE_SUCCESSOR_CLOCK_REATTESTATION"
  | "PREPARE_REATTEST_EFFECT"
  | "RESOLVE_REATTEST_UNCERTAINTY"
  | "CLOSE_SESSION";

type SuccessorClockReattestationBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "RECEIPT_MISSING"
  | "EVALUATE_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "POST_WATERMARK_TRUST_DENIED"
  | "INVENTED_SUCCESS_DENIED"
  | "HALT_REATTEST_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "SUCCESSOR_LEAK_DENIED"
  | "HOP_LEAK_DENIED"
  | "UNSIGNED_SUCCESSOR_DENIED"
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

type SourceReceiptKind =
  | "SEALED_QUARANTINE_RECEIPT"
  | "SEALED_CLOCK_CERTIFICATE"
  | "SUCCESSOR_CLOCK_SAMPLE"
  | "RETIRED_KEY_CLAIM";

type PlacementKind =
  | "HALTED"
  | "EXTENDED_HALT"
  | "RESTORED_WITHOUT_WINNER"
  | "OMITTED"
  | "UNKNOWN_EFFECT";

type SuccessorLifecycle =
  | "FIRST_SUCCESSOR"
  | "MONOTONIC"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "UNKNOWN_EFFECT";

type ReceiptLifecycle =
  | "PRE_WATERMARK"
  | "POST_WATERMARK"
  | "UNKNOWN_EFFECT";

type AttestedSuccessorKind =
  | "TRUSTED_MONOTONIC"
  | "TRUSTED_WITHIN_SKEW"
  | "REGRESSED"
  | "INVENTED_HISTORY"
  | "SILENCE"
  | "UNKNOWN_EFFECT";

type ReattestKind =
  | "REBIND_TO_SUCCESSOR"
  | "HOLD_UNKNOWN"
  | "REJECT_POST_WATERMARK"
  | "REJECT_INVENTED_SUCCESS"
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

interface SuccessorClockReattestationBudget {
  readonly nominateUnits: number;
  readonly evaluateUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly reattestUnits: number;
  readonly maxWallTimeMs: number;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedReceipts: number;
}

interface SuccessorClockReattestationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly evaluateThreshold: number;
  readonly maxBindingsPerCertificate: number;
  readonly maxNominatedReceipts: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface SuccessorClockReattestationSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: SuccessorClockReattestationBudget;
  readonly consumed: Omit<
    SuccessorClockReattestationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedReceipts"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface ReceiptNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceReceiptId: SourceReceiptId;
  readonly sourceReceiptKind: SourceReceiptKind;
  readonly placementKind: PlacementKind;
  readonly successorLifecycle: SuccessorLifecycle;
  readonly receiptLifecycle: ReceiptLifecycle;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly donorPurposeHash: Sha256;
  readonly hopCount: number;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface SuccessorClockReattestationEvaluationReceipt {
  readonly accountId: AccountId;
  readonly evaluationId: EvaluationId;
  readonly sessionId: SessionId;
  readonly receiptSetHash: Sha256;
  readonly successorSetHash: Sha256;
  readonly watermarkSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly evaluationHash: Sha256;
  readonly evaluatedAt: Timestamp;
}

interface SuccessorClockReattestationBinding {
  readonly accountId: AccountId;
  readonly bindingId: BindingId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceReceiptId: SourceReceiptId;
  readonly sourceReceiptKind: SourceReceiptKind;
  readonly bindingOrdinal: number;
  readonly status: MemberStatus;
  readonly placementKind: PlacementKind;
  readonly successorLifecycle: SuccessorLifecycle;
  readonly receiptLifecycle: ReceiptLifecycle;
  readonly attestedSuccessorKind: AttestedSuccessorKind;
  readonly reattestKind: ReattestKind;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly requestedPurposeHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly retirementWatermarkHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface SuccessorClockReattestationCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly receiptSetHash: Sha256;
  readonly successorSetHash: Sha256;
  readonly watermarkSetHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly bindingWatermark: number;
  readonly sealedAt: Timestamp;
}

interface SuccessorClockReattestationEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentSuccessorClockReattestationPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly rebindToSuccessorBindingCount: number;
  readonly holdUnknownBindingCount: number;
  readonly rejectPostWatermarkBindingCount: number;
  readonly rejectInventedSuccessBindingCount: number;
  readonly unknownBindingCount: number;
  readonly skippedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainEffectIntents: readonly SuccessorClockReattestationEffectObservation[];
  readonly remainingBudget: Omit<
    SuccessorClockReattestationBudget,
    | "maxWallTimeMs"
    | "evaluateThreshold"
    | "maxBindingsPerCertificate"
    | "maxNominatedReceipts"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly SuccessorClockReattestationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateSuccessorClockReattestationSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: SuccessorClockReattestationBudget;
}

interface NominateQuarantinedReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceReceiptId: SourceReceiptId;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface EvaluateSuccessorClockReattestationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedReceiptSetHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealReattestCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly evaluationId: EvaluationId;
  readonly consumerRef: ConsumerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedWatermarkSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateSuccessorClockReattestationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceReceiptId: SourceReceiptId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "CLOCK_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareReattestEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ResolveReattestUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly resolution:
    | "RETRY_SAME_RECEIPT"
    | "ACCEPT_REATTESTATION"
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseSuccessorClockReattestationSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type SuccessorClockReattestationDecision =
  | { readonly decision: "ALLOWED"; readonly session: SuccessorClockReattestationSession;
      readonly certificate?: SuccessorClockReattestationCertificate;
      readonly member?: SuccessorClockReattestationBinding;
      readonly receipt?: ReceiptNominationReceipt;
      readonly evaluation?: SuccessorClockReattestationEvaluationReceipt;
      readonly perception: AgentSuccessorClockReattestationPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: SuccessorClockReattestationBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentSuccessorClockReattestationPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

```sql
CREATE TYPE scr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE scr_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'EVALUATING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_source_kind AS ENUM (
  'SEALED_QUARANTINE_RECEIPT', 'SEALED_CLOCK_CERTIFICATE',
  'SUCCESSOR_CLOCK_SAMPLE', 'RETIRED_KEY_CLAIM'
);
CREATE TYPE scr_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE scr_successor_lifecycle AS ENUM (
  'FIRST_SUCCESSOR', 'MONOTONIC', 'REGRESSED', 'INVENTED_HISTORY',
  'UNKNOWN_EFFECT'
);
CREATE TYPE scr_receipt_lifecycle AS ENUM (
  'PRE_WATERMARK', 'POST_WATERMARK', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_attested_successor_kind AS ENUM (
  'TRUSTED_MONOTONIC', 'TRUSTED_WITHIN_SKEW', 'REGRESSED',
  'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_reattest_kind AS ENUM (
  'REBIND_TO_SUCCESSOR', 'HOLD_UNKNOWN', 'REJECT_POST_WATERMARK',
  'REJECT_INVENTED_SUCCESS', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE scr_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_scr_profile_authority NOLOGIN;

CREATE TABLE agent_scr_authorization_evidence (
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

CREATE TABLE agent_scr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status scr_profile_status NOT NULL,
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
  max_nominated_receipts SMALLINT NOT NULL
    CHECK (max_nominated_receipts BETWEEN 1 AND 256),
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
    REFERENCES agent_scr_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_scr_profile_reattest_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  evaluate_threshold SMALLINT NOT NULL CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  require_trusted_successor BOOLEAN NOT NULL,
  reattest_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_scr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_scr_receipt_catalog (
  account_id BIGINT NOT NULL,
  source_receipt_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_receipt_kind scr_source_kind NOT NULL,
  placement_kind scr_placement_kind NOT NULL,
  successor_lifecycle scr_successor_lifecycle NOT NULL,
  receipt_lifecycle scr_receipt_lifecycle NOT NULL,
  status scr_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  retired_signed_at TIMESTAMPTZ NOT NULL,
  successor_first_attested_at TIMESTAMPTZ,
  retirement_watermark_at TIMESTAMPTZ,
  max_skew_ms BIGINT NOT NULL CHECK (max_skew_ms BETWEEN 0 AND 86400000),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_receipt_id),
  UNIQUE (account_id, receipt_ref, source_receipt_kind)
);

CREATE TABLE agent_scr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status scr_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_evaluate_units BIGINT NOT NULL CHECK (budget_evaluate_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_invalidate_units BIGINT NOT NULL CHECK (budget_invalidate_units >= 0),
  budget_reattest_units BIGINT NOT NULL CHECK (budget_reattest_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_evaluate_units BIGINT NOT NULL CHECK (consumed_evaluate_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_invalidate_units BIGINT NOT NULL
    CHECK (consumed_invalidate_units >= 0),
  consumed_reattest_units BIGINT NOT NULL
    CHECK (consumed_reattest_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  evaluate_threshold SMALLINT NOT NULL
    CHECK (evaluate_threshold BETWEEN 1 AND 8),
  max_bindings_per_certificate SMALLINT NOT NULL
    CHECK (max_bindings_per_certificate BETWEEN 1 AND 256),
  max_nominated_receipts SMALLINT NOT NULL
    CHECK (max_nominated_receipts BETWEEN 1 AND 256),
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
    REFERENCES agent_scr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_scr_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_evaluate_units <= budget_evaluate_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_reattest_units <= budget_reattest_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_scr_nomination_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_receipt_id UUID NOT NULL,
  source_receipt_kind scr_source_kind NOT NULL,
  placement_kind scr_placement_kind NOT NULL,
  successor_lifecycle scr_successor_lifecycle NOT NULL,
  receipt_lifecycle scr_receipt_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, source_receipt_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_scr_session (account_id, session_id),
  FOREIGN KEY (account_id, source_receipt_id)
    REFERENCES agent_scr_receipt_catalog (account_id, source_receipt_id)
);

CREATE TABLE agent_scr_evaluation_receipt (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  receipt_set_hash CHAR(64) NOT NULL CHECK (length(receipt_set_hash) = 64),
  successor_set_hash CHAR(64) NOT NULL
    CHECK (length(successor_set_hash) = 64),
  watermark_set_hash CHAR(64) NOT NULL
    CHECK (length(watermark_set_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  evaluation_hash CHAR(64) NOT NULL CHECK (length(evaluation_hash) = 64),
  evaluated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, session_id, evaluation_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_scr_session (account_id, session_id)
);

CREATE TABLE agent_scr_reattest_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  evaluation_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  receipt_set_hash CHAR(64) NOT NULL CHECK (length(receipt_set_hash) = 64),
  successor_set_hash CHAR(64) NOT NULL
    CHECK (length(successor_set_hash) = 64),
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
    REFERENCES agent_scr_session (account_id, session_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agent_scr_evaluation_receipt (account_id, evaluation_id)
);

CREATE TABLE agent_scr_reattest_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_receipt_id UUID NOT NULL,
  source_receipt_kind scr_source_kind NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 0 AND 256),
  status scr_binding_status NOT NULL,
  placement_kind scr_placement_kind NOT NULL,
  successor_lifecycle scr_successor_lifecycle NOT NULL,
  receipt_lifecycle scr_receipt_lifecycle NOT NULL,
  attested_successor_kind scr_attested_successor_kind NOT NULL,
  reattest_kind scr_reattest_kind NOT NULL,
  purpose_relation scr_purpose_relation NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  successor_clock_hash CHAR(64) NOT NULL
    CHECK (length(successor_clock_hash) = 64),
  retirement_watermark_hash CHAR(64) NOT NULL
    CHECK (length(retirement_watermark_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, certificate_id, source_receipt_id, binding_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_scr_reattest_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_scr_session (account_id, session_id),
  FOREIGN KEY (account_id, source_receipt_id)
    REFERENCES agent_scr_receipt_catalog (account_id, source_receipt_id)
);

CREATE TABLE agent_scr_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_receipt_id UUID NOT NULL,
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
    REFERENCES agent_scr_reattest_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_receipt_id)
    REFERENCES agent_scr_receipt_catalog (account_id, source_receipt_id)
);

CREATE TABLE agent_scr_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status scr_effect_status NOT NULL,
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
    REFERENCES agent_scr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_scr_reattest_certificate (account_id, certificate_id)
);

CREATE TABLE agent_scr_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'EVALUATE', 'SEAL', 'VECTOR', 'INVALIDATE', 'REATTEST'
    )
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_scr_session (account_id, session_id)
);

CREATE TABLE agent_scr_terminal_record (
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
    REFERENCES agent_scr_session (account_id, session_id)
);

CREATE TABLE agent_scr_command_result (
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

CREATE TABLE agent_scr_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_scr_audit_event (
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

CREATE TABLE agent_scr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_scr_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status scr_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_scr_session (account_id, session_id)
);

CREATE TABLE agent_scr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_scr_profile()
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
       OR NEW.max_nominated_receipts
         IS DISTINCT FROM OLD.max_nominated_receipts
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
    IF current_setting('app.scr_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.scr_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_scr_profile_protect
BEFORE INSERT OR UPDATE ON agent_scr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_scr_profile();

CREATE FUNCTION protect_agent_scr_profile_reattest_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status scr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_scr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile reattest rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_scr_profile_reattest_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_scr_profile_reattest_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_scr_profile_reattest_rule();

CREATE FUNCTION protect_agent_scr_reattest_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_receipt_id IS DISTINCT FROM OLD.source_receipt_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.binding_ordinal IS DISTINCT FROM OLD.binding_ordinal
       OR NEW.source_receipt_kind IS DISTINCT FROM OLD.source_receipt_kind
       OR NEW.placement_kind IS DISTINCT FROM OLD.placement_kind
       OR NEW.successor_lifecycle IS DISTINCT FROM OLD.successor_lifecycle
       OR NEW.receipt_lifecycle IS DISTINCT FROM OLD.receipt_lifecycle
       OR NEW.attested_successor_kind
         IS DISTINCT FROM OLD.attested_successor_kind
       OR NEW.reattest_kind IS DISTINCT FROM OLD.reattest_kind
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
       OR NEW.retirement_watermark_hash
         IS DISTINCT FROM OLD.retirement_watermark_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id THEN
      RAISE EXCEPTION 'reattest binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.attested_successor_kind IN ('SILENCE', 'UNKNOWN_EFFECT') THEN
    RAISE EXCEPTION 'history-rewrite fence blocks rebind from silent or unknown successor';
  END IF;

  IF NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.receipt_lifecycle = 'POST_WATERMARK' THEN
    RAISE EXCEPTION 'post-watermark-trust fence blocks rebind of post-watermark receipt';
  END IF;

  IF NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.attested_successor_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-success fence blocks rebind for invented successor history';
  END IF;

  IF NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'halt-reattest fence blocks rebind on halted receipt';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than receipt attenuation';
  END IF;

  IF NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.placement_kind IN ('HALTED', 'EXTENDED_HALT', 'OMITTED') THEN
    RAISE EXCEPTION 'successor-leak fence blocks restore of halted body';
  END IF;

  IF NEW.hop_count > 0
     AND NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose rebind after attenuation hops';
  END IF;

  IF NEW.reattest_kind = 'REBIND_TO_SUCCESSOR'
     AND NEW.attested_successor_kind NOT IN ('TRUSTED_MONOTONIC', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'unsigned-successor fence blocks rebind without trusted monotonic successor';
  END IF;

  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_scr_reattest_binding_protect
BEFORE INSERT OR UPDATE ON agent_scr_reattest_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_scr_reattest_binding();

CREATE FUNCTION protect_agent_scr_effect_intent()
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

CREATE TRIGGER agent_scr_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_scr_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_scr_effect_intent();

CREATE FUNCTION approve_agent_scr_profile(
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
  stored_status scr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_scr_profile
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
  FROM agent_scr_profile_reattest_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one reattest rule';
  END IF;

  PERFORM set_config(
    'app.scr_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_scr_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_scr_profile(
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
  stored_status scr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_scr_profile
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
    'app.scr_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_scr_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_scr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_scr_profile_authority;
ALTER FUNCTION revoke_agent_scr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_scr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_scr_profile_authority;
GRANT SELECT ON
  agent_scr_profile,
  agent_scr_profile_reattest_rule
TO agent_scr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_scr_profile TO agent_scr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_scr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_scr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_scr_profile FROM PUBLIC;

CREATE INDEX agent_scr_session_work_idx ON agent_scr_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_scr_session_profile_idx ON agent_scr_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_scr_binding_certificate_idx ON agent_scr_reattest_binding (
  account_id, certificate_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_scr_binding_receipt_idx ON agent_scr_reattest_binding (
  account_id, source_receipt_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_scr_catalog_ref_idx ON agent_scr_receipt_catalog (
  account_id, receipt_ref, sealed_at DESC, source_receipt_id
);
CREATE INDEX agent_scr_catalog_kind_idx ON agent_scr_receipt_catalog (
  account_id, source_receipt_kind, sealed_at DESC, source_receipt_id
);
CREATE INDEX agent_scr_evaluation_session_idx ON agent_scr_evaluation_receipt (
  account_id, session_id, evaluated_at DESC, evaluation_id
);
CREATE INDEX agent_scr_certificate_session_idx ON agent_scr_reattest_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_scr_effect_work_idx ON agent_scr_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_scr_audit_time_idx ON agent_scr_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_scr_perception_status_idx ON agent_scr_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_scr_command_expiry_idx ON agent_scr_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_scr_invalidation_certificate_idx ON agent_scr_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_scr_authorization_evidence',
    'agent_scr_profile',
    'agent_scr_profile_reattest_rule',
    'agent_scr_receipt_catalog',
    'agent_scr_session',
    'agent_scr_nomination_receipt',
    'agent_scr_evaluation_receipt',
    'agent_scr_reattest_certificate',
    'agent_scr_reattest_binding',
    'agent_scr_invalidation',
    'agent_scr_effect_intent',
    'agent_scr_budget_ledger',
    'agent_scr_terminal_record',
    'agent_scr_command_result',
    'agent_scr_audit_head',
    'agent_scr_audit_event',
    'agent_scr_audit_anchor',
    'agent_scr_perception_snapshot',
    'agent_scr_projection_checkpoint'
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
single ACID row-store transaction with session CAS. Reattest-certificate
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

enum AgentScrSessionStatus {
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

enum AgentScrBindingStatus {
  SEALED
  INVALIDATED
  DISPATCHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentScrSourceKind {
  SEALED_QUARANTINE_RECEIPT
  SEALED_CLOCK_CERTIFICATE
  SUCCESSOR_CLOCK_SAMPLE
  RETIRED_KEY_CLAIM
}

enum AgentScrPlacementKind {
  HALTED
  EXTENDED_HALT
  RESTORED_WITHOUT_WINNER
  OMITTED
  UNKNOWN_EFFECT
}

enum AgentScrSuccessorLifecycle {
  FIRST_SUCCESSOR
  MONOTONIC
  REGRESSED
  INVENTED_HISTORY
  UNKNOWN_EFFECT
}

enum AgentScrReceiptLifecycle {
  PRE_WATERMARK
  POST_WATERMARK
  UNKNOWN_EFFECT
}

enum AgentScrAttestedSuccessorKind {
  TRUSTED_MONOTONIC
  TRUSTED_WITHIN_SKEW
  REGRESSED
  INVENTED_HISTORY
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentScrReattestKind {
  REBIND_TO_SUCCESSOR
  HOLD_UNKNOWN
  REJECT_POST_WATERMARK
  REJECT_INVENTED_SUCCESS
  SKIP
  UNKNOWN_EFFECT
}

enum AgentScrPurposeRelation {
  EQUAL
  NARROWS
  AMPLIFIES
  UNRELATED
  UNKNOWN_EFFECT
}

enum AgentScrEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentScrNextAction {
  NOMINATE_QUARANTINED_RECEIPT
  EVALUATE_SUCCESSOR_CLOCK_REATTESTATION
  SEAL_REATTEST_CERTIFICATE
  INVALIDATE_SUCCESSOR_CLOCK_REATTESTATION
  PREPARE_REATTEST_EFFECT
  RESOLVE_REATTEST_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentScrBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  RECEIPT_MISSING
  EVALUATE_NOT_READY
  HISTORY_REWRITE_DENIED
  POST_WATERMARK_TRUST_DENIED
  INVENTED_SUCCESS_DENIED
  HALT_REATTEST_DENIED
  PURPOSE_AMPLIFICATION_DENIED
  SUCCESSOR_LEAK_DENIED
  HOP_LEAK_DENIED
  UNSIGNED_SUCCESSOR_DENIED
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

enum AgentScrUncertaintyResolution {
  RETRY_SAME_RECEIPT
  ACCEPT_REATTESTATION
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

enum AgentScrInvalidationReason {
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

type AgentScrBudget {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  reattestUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedReceipts: Int!
}

type AgentScrProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedReceipts: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentScrSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentScrSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentScrBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentScrNominationReceipt {
  accountId: ID!
  sessionId: ID!
  sourceReceiptId: ID!
  sourceReceiptKind: AgentScrSourceKind!
  placementKind: AgentScrPlacementKind!
  successorLifecycle: AgentScrSuccessorLifecycle!
  receiptLifecycle: AgentScrReceiptLifecycle!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  donorPurposeHash: SHA256!
  hopCount: Int!
  nominationHash: SHA256!
  nominatedAt: DateTime!
}

type AgentScrEvaluationReceipt {
  accountId: ID!
  evaluationId: ID!
  sessionId: ID!
  receiptSetHash: SHA256!
  successorSetHash: SHA256!
  watermarkSetHash: SHA256!
  attenuationHash: SHA256!
  evaluationHash: SHA256!
  evaluatedAt: DateTime!
}

type AgentScrCertificate {
  accountId: ID!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  purposeHash: SHA256!
  receiptSetHash: SHA256!
  successorSetHash: SHA256!
  watermarkSetHash: SHA256!
  attenuationHash: SHA256!
  bindingWatermark: Int!
  sealedAt: DateTime!
}

type AgentScrBinding {
  accountId: ID!
  bindingId: ID!
  certificateId: ID!
  sessionId: ID!
  sourceReceiptId: ID!
  sourceReceiptKind: AgentScrSourceKind!
  bindingOrdinal: Int!
  status: AgentScrBindingStatus!
  placementKind: AgentScrPlacementKind!
  successorLifecycle: AgentScrSuccessorLifecycle!
  receiptLifecycle: AgentScrReceiptLifecycle!
  attestedSuccessorKind: AgentScrAttestedSuccessorKind!
  reattestKind: AgentScrReattestKind!
  purposeRelation: AgentScrPurposeRelation!
  disputedFactHash: SHA256!
  attenuationHash: SHA256!
  requestedPurposeHash: SHA256!
  successorClockHash: SHA256!
  retirementWatermarkHash: SHA256!
  sealedAt: DateTime!
}

type AgentScrEffectObservation {
  effectId: ID!
  status: AgentScrEffectStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentScrPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentScrSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  rebindToSuccessorBindingCount: Int!
  holdUnknownBindingCount: Int!
  rejectPostWatermarkBindingCount: Int!
  rejectInventedSuccessBindingCount: Int!
  unknownBindingCount: Int!
  skippedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainEffectIntents: [AgentScrEffectObservation!]!
  remainingBudget: AgentScrBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentScrNextAction!]!
  blockedReasons: [AgentScrBlockedReason!]!
  cardHash: SHA256!
}

type AgentScrMutationResult {
  decision: String!
  session: AgentScrSession
  certificate: AgentScrCertificate
  member: AgentScrBinding
  receipt: AgentScrNominationReceipt
  evaluation: AgentScrEvaluationReceipt
  perception: AgentScrPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentScrBudgetInput {
  nominateUnits: Long!
  evaluateUnits: Long!
  sealUnits: Long!
  vectorUnits: Long!
  invalidateUnits: Long!
  reattestUnits: Long!
  maxWallTimeMs: Long!
  evaluateThreshold: Int!
  maxBindingsPerCertificate: Int!
  maxNominatedReceipts: Int!
}

input CreateSuccessorClockReattestationSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentScrBudgetInput!
}

input NominateQuarantinedReceiptInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  sourceReceiptId: ID!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input EvaluateSuccessorClockReattestationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  expectedReceiptSetHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealReattestCertificateInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  evaluationId: ID!
  consumerRef: String!
  expectedPurposeHash: SHA256!
  expectedWatermarkSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateSuccessorClockReattestationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceReceiptId: ID!
  reasonCode: AgentScrInvalidationReason!
  idempotencyKey: String!
}

input PrepareReattestEffectInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input ResolveReattestUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  resolution: AgentScrUncertaintyResolution!
  idempotencyKey: String!
}

input AgentScrProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentScrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentScrProfile
  agentScrSession(accountId: ID!, sessionId: ID!): AgentScrSession
  agentScrReattestCertificate(accountId: ID!, certificateId: ID!): AgentScrCertificate
  agentScrPerceptionCard(accountId: ID!, sessionId: ID!): AgentScrPerceptionCard
  agentScrNominatedReceipt(
    accountId: ID!
    sessionId: ID!
    sourceReceiptId: ID!
  ): AgentScrNominationReceipt
  agentScrSearchProfiles(input: AgentScrProfileSearchInput!): [AgentScrProfile!]!
}

type Mutation {
  createSuccessorClockReattestationSession(
    input: CreateSuccessorClockReattestationSessionInput!
  ): AgentScrMutationResult!
  nominateQuarantinedReceipt(
    input: NominateQuarantinedReceiptInput!
  ): AgentScrMutationResult!
  evaluateSuccessorClockReattestation(
    input: EvaluateSuccessorClockReattestationInput!
  ): AgentScrMutationResult!
  sealReattestCertificate(input: SealReattestCertificateInput!): AgentScrMutationResult!
  invalidateSuccessorClockReattestation(
    input: InvalidateSuccessorClockReattestationInput!
  ): AgentScrMutationResult!
  prepareReattestEffect(input: PrepareReattestEffectInput!): AgentScrMutationResult!
  resolveReattestUncertainty(
    input: ResolveReattestUncertaintyInput!
  ): AgentScrMutationResult!
  closeSuccessorClockReattestationSession(
    accountId: ID!
    sessionId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentScrMutationResult!
  approveSuccessorClockReattestationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    authorityPrincipalId: ID!
  ): AgentScrMutationResult!
  revokeSuccessorClockReattestationProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentScrMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Evaluate mutations reject when binding ordinal exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw private keys, tool payloads, or redacted
  fact bodies.
- `sealReattestCertificate` is rejected with `HISTORY_REWRITE_DENIED`
  when a nominated silent or unknown successor would evaluate to
  `REBIND_TO_SUCCESSOR`.
- `sealReattestCertificate` is rejected with
  `POST_WATERMARK_TRUST_DENIED` when a nominated `POST_WATERMARK` receipt
  would evaluate to `REBIND_TO_SUCCESSOR`.
- `sealReattestCertificate` is rejected with `INVENTED_SUCCESS_DENIED`
  when a nominated successor that invents history would evaluate to
  `REBIND_TO_SUCCESSOR`.
- `sealReattestCertificate` is rejected with `HALT_REATTEST_DENIED`
  when a nominated halted, extended-halt, or omitted receipt would evaluate
  to `REBIND_TO_SUCCESSOR`.
- `evaluateSuccessorClockReattestation` is rejected with
  `PURPOSE_AMPLIFICATION_DENIED` when the requested purpose would amplify a
  receipt attenuation hash.
- Successor enrollment that would restore a halted body or invent a winner
  is rejected with `SUCCESSOR_LEAK_DENIED`.

## 10. Procedural memory

Approved reattest profiles are procedural memory: versioned instructions
for how sealed quarantined receipts and successor clock samples become
envelope-scoped rebind bindings without inventing a
winner and without rewriting historical silence as success. Procedure refs
may point to successor-containment playbook steps. Profiles are immutable
after approval; agents perceive `procedureTags` and `allowedNextActions` on
perception cards, never inventing reattest policy from embeddings.

## 11. Semantic retrieval and HNSW compatibility

Profile embeddings support advisory discovery ("which reattest profile
fits incident hop-attenuated successor rebind?"). Embeddings
are account-owned and must be queried with `account_id` equality. The
reference schema stores vectors but does **not** create a cross-tenant HNSW
index; production builds account-partitioned HNSW segments.

Semantic retrieval may return reattest profiles only. It never authorizes
nominate, evaluate, seal, or reattest. Vector `topK` is budgeted and
clamped.

```sql
CREATE TABLE agent_scr_profile_embedding (
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
    REFERENCES agent_scr_profile (account_id, profile_id, profile_version)
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
rebind-to-successor / hold-unknown / reject-post-watermark / invented-success /
unknown / skipped / invalidated binding counts, uncertain notify intents,
remaining budgets, procedure tags, allowed next actions, and blocked
reasons. Summary text is `UntrustedText`. Cards never embed raw private
keys or redacted fact bodies. `cardHash` makes perception replayable.
Agents perceive `REBIND_TO_SUCCESSOR` as a trusted successor that still
cannot invent a winner, `HOLD_UNKNOWN` as a bounded uncertainty window,
`REJECT_POST_WATERMARK` as a trusted negative receipt for a signature
after retirement, `REJECT_INVENTED_SUCCESS` as a trusted refusal of a
successor that predates the first attested sample, and `SKIP` as a sealed
refusal — never as a receipt that "must have been signed before the
watermark."

## 13. ACID and consistency

### Row store

Session CAS, nomination receipts, evaluation receipts, reattest-certificate
seals, and audit appends are ACID transactions in the hybrid row store.

### Columnar store

Columnar projections may accelerate analytics over sealed reattest
certificates but are not authoritative for rebind-to-successor,
hold-unknown, or reject-post-watermark outcomes.

### Vector store

Vector indexes are asynchronously enriched from immutable profile approval
events; staleness is visible via source watermarks.

### External tools

Notify dispatch and successor-clock side-effects are not silently
ACID-coupled; silence becomes `UNKNOWN_EFFECT`.

## 14. Guardrails and neighbor protection

- Binding/threshold caps on reattestations per certificate and per session.
- Budget ledgers for NOMINATE/EVALUATE/SEAL/VECTOR/INVALIDATE/REATTEST.
- Purpose attenuation narrowing only for consumers.
- Forced RLS on every table.
- Planner rejects unscoped receipt-catalog, clock-catalog, working-set,
  grant-graph, citation, quarantine-ledger, or board scans as **FULL SCAN
  REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.
- Evaluation never auto-restores neighbor-visible board mutations from
  halted slots, post-watermark receipts, or unsigned successors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Finding rebindable receipts by scanning the receipt or working-set
  ledger (rejected; nominate by `(account_id, source_receipt_id)`).
- Evaluating a rebind by walking all notify intents for an account
  (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all certificates for an account (rejected; use
  receipt-keyed active binding indexes).

### Required access paths

- Receipt nomination: PK `(account_id, source_receipt_id)`.
- Evaluate/seal: PK `(account_id, evaluation_id)` /
  `(account_id, certificate_id)` and unique
  `(account_id, session_id, consumer_ref, sealed_revision)`.
- Bindings by certificate/receipt: composite indexes leading with
  `account_id`.
- Notify work: partial indexes on effect intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/working-set/grant-graph/receipt-catalog/clock-catalog/quarantine-ledger/citation
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
- Historical silence invented as rebind-to-successor: history-rewrite fence.
- Receipt signed after retirement kept as trusted: post-watermark-trust
  fence.
- Successor that invents history earlier than the first attested sample:
  invented-success fence.
- Halt leak of frozen bodies into rebind-to-successor: halt-reattest fence.
- Successor that restores a halted body or invents a winner:
  successor-leak fence.
- Hop leak of donor purpose after attenuation hops: hop-leak fence.
- Inventing a winner under restored-slot rebind: certificates bind receipt
  and watermark sets, never `resolved_fact_hash`.
- Silent notify or successor-clock success: `UNKNOWN_EFFECT` until ACK.
- Recursive receipt-catalog or board storms: budget and **FULL SCAN
  REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/nominate/evaluate/seal/perception p99 latency budgets for 99.99%
  control-plane availability.
- History-rewrite rejection, post-watermark-trust rejection,
  invented-success rejection, halt-reattest rejection, purpose-amplification
  rejection, successor-leak rejection, and `UNKNOWN_EFFECT` rate as
  first-class metrics.
- Threshold-failure rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow reattest

Compile profiles and validate receipt nomination without durable
certificates.

### Phase 2: reject-post-watermark and skip only

Allow sealed certificates from nominated `HALTED` and `EXTENDED_HALT`
receipts as `REJECT_POST_WATERMARK` or `SKIP`. Rebind-to-successor stays
closed.

### Phase 3: trusted rebind and halt-reattest fences

Enable budgeted `REBIND_TO_SUCCESSOR` from `RESTORED_WITHOUT_WINNER`
receipts with `TRUSTED_MONOTONIC` or `TRUSTED_WITHIN_SKEW` successors only.

### Phase 4: notify uncertainty

Enable successor notify intents with `UNKNOWN_EFFECT` reconciliation and
`HOLD_UNKNOWN` that cannot invent successor trust from silence.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets, including
`REBIND_TO_SUCCESSOR` only for pre-watermark receipts that cannot rewrite
historical silence as success.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, history-rewrite,
  purpose-amplification, and effect start state.

### Behavioral validation

- Nominate requires sealed receipt point lookup and hash match.
- Evaluate binds receipt set and attenuation under budget.
- Seal is rejected when silence would become rebind-to-successor, and never
  invents a winning fact hash.
- Reattest-certificate seal binds immutable bindings under receipt-set,
  successor-set, watermark-set, and attenuation hashes — never a winner
  hash.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no nominate/evaluate/seal path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed reattest certificates after process
  restart.

## 21. Product decision

Adopt the Successor-Clock Re-Attestation Plane as the deterministic rebind
path for quarantined receipts bound by the Watermark-Clock Attestation,
Key-Compromise Quarantine, and Provider-Key Rotation planes.

Ship it because:

1. It preserves ACID and multi-tenant isolation while closing the
   post-attestation successor-rebind gap without history rewrite,
   post-watermark trust leak, invented-success leak, halt leak, purpose
   amplification, invented winners, or receipt-catalog scans.
2. Account-leading indexes, history-rewrite and purpose-amplification
   fences, and **FULL SCAN REJECTED** planner rules protect 99.99% neighbor
   latency on boards with 1M+ rows.
3. Open API GraphQL, procedural memory, account-owned HNSW profile
   discovery, perception cards, and hash-chained audit replay make the
   plane agent-ready without putting probabilistic AI inside the data
   engine.
