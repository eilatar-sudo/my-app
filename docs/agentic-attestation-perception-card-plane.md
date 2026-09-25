# mondayDB Agentic Attestation Perception Card Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-25.v1`

## 1. Why this plane, before how

The 2026-09-24 Tool-Read Receipt Attestation Plane can seal
a certificate that binds `ALLOW_TOOL_READ` to a provider
receipt hash. `ACKED` on that certificate means a receipt
was bound. It does not mean the disputed fact is restored,
and it does not mean the signing key is `TRUSTED_ENROLLED`.

Downstream agents still need to perceive that certificate.
Without a perception-card plane they either:

- treat `ACKED` as enrollment and copy the disputed fact
  into the prompt (a receipt becomes a truth bit), or
- scan attestation ledgers, vote ledgers, and board rows
  looking for "what did the tool return" (neighbor-harmful
  on boards with 1M+ rows).

The product trade-off is **perception fluency versus fact
integrity**:

- Inlining the fact body, or reading `ACKED` as
  `TRUSTED_ENROLLED`, maximizes agent fluency and hides
  the hold. It also creates perception-as-trust,
  perception-as-restore, and body visibility.
- Compiling a perception card by point lookup of
  `(account_id, source_certificate_id)` adds one bounded
  compile transaction. The card may cite
  `provider_receipt_hash` and `effect_observation`. The
  disputed fact stays `DISPUTED_HELD`. The key stays
  `AWAITING_CONFIRMATION`. Silence stays `UNKNOWN_EFFECT`.
- Semantic similarity may discover perception profiles,
  but it must never decide whether a certificate may be
  nominated, a citation bound, a card evaluated, a card
  sealed, or a consumer notified.

Latency stays on the primary key. Consistency is the
sealed certificate row inside one ACID transaction, not an
eventually consistent guess. Neighbor availability stays
at the 99.99% target because an unscoped lookup is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved perception profile is procedural memory for
   "how a sealed attestation certificate may be projected
   into a card." A profile **never** invents a winning
   fact hash and **never** rewrites `ACKED` as
   `TRUSTED_ENROLLED`.
2. A session opens under purpose, budget, and authorization
   fences, and only nominates sealed attestation
   certificates by point lookup of
   `(account_id, source_certificate_id)`. Hashes are copied
   from the catalog. They are never computed by walking
   ledgers.
3. mondayDB evaluates a perception whose outcome is a pure
   function of `(source_kind, access_path, gate_kind,
   gate_action, terminal_kind, placement_kind,
   key_lifecycle, clock_lifecycle, attested_key_kind,
   perceive_kind, body_visibility, fact_disposition,
   clock_disposition, receipt_disposition,
   effect_observation, purpose_relation, silence_inferred,
   hop_count)`. `ACKED` cannot become trust. `RESTORED`
   cannot be written.
4. Sealing binds `consumer_ref + purpose_hash +
   prior_clock_hash + successor_clock_hash +
   disputed_fact_hash + provider_receipt_hash +
   halt_scope_hash + attenuation_hash + decision_set_hash +
   perception_steward_a + perception_steward_b`. The card
   **must not** emit a fact body and **must not** emit
   `TRUSTED_ENROLLED`.
5. Upstream invalidation marks cards stale. Notify intents
   may become `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not a new tool receipt and is not
   enrollment.
6. Unscoped certificate-catalog, vote-ledger, page-ledger,
   ack-ledger, escalation-ledger, containment-ledger,
   review-ledger, resolution-ledger, promotion-ledger,
   working-set, grant-graph, or board scans are
   **FULL SCAN REJECTED**.

### Product outcome

For any attestation perception card, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, citation bind, evaluation, seal, invalidate,
  or notify dispatch?
- Which sealed attestation certificate was read by primary
  key, and which receipt hash and effect observation were
  cited?
- Did `ACKED` stay an effect observation while the disputed
  fact stayed held and the key stayed unconfirmed?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the card history be replayed without invoking an LLM?

## 2. Scope and ownership

The Attestation Perception Card Plane owns:

1. Immutable approved perception profiles as procedural
   memory of "how a sealed attestation certificate may be
   cited without restoring a disputed fact, treating
   `ACKED` as `TRUSTED_ENROLLED`, amplifying purpose,
   leaking a halted or quarantined body, scanning
   governance ledgers, or opening another nested expiry."
2. Tenant-scoped perception sessions with purpose and
   budget fences.
3. Deterministic nomination of sealed attestation
   certificates by point lookup.
4. Deterministic citation bindings, perception records,
   sealed cards, and immutable decisions that never invent
   a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded
   perception budgets.

It integrates with, but does not replace:

- **Tool-Read Receipt Attestation Plane:** supplies the
  sealed certificate this plane may nominate. This plane
  never re-binds a provider receipt and never re-evaluates
  the receipt attestation.
- **Extended Working-Set Purpose Gate Plane:** the cited
  gate kind is copied. This plane never authorizes
  `TOOL_MUTATE` or a body read.
- **SLA Extension Certificate Plane:** the successor clock
  is copied. This plane never re-arms a clock and never
  treats a re-armed clock as `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  vector, seal, invalidate, and notify units.

### Non-goals

- Letting an LLM decide that `ACKED` "probably means the
  fact is true."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative cards from columnar or
  vector projections.
- Cross-account perception or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, or fact bodies
  on the card.
- Claiming distributed atomicity with external notify
  providers.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because a card cited an attested receipt.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to compile a card.
- Opening another nested expiry-containment-review-
  resolution plane from a perception card.
- Showing a `PERMANENT_QUARANTINE` body or restoring a
  disputed fact because the card was compiled.

## 3. Product contract

### 3.1 Perception profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_ATTEST_CERT`,
  `SEALED_TOOL_READ_DECISION`, `SEALED_PROVIDER_RECEIPT`,
  `SEALED_RECEIPT_SLOT`, `SEALED_EFFECT_INTENT`);
- perceive threshold (distinct perception-steward
  principals, minimum 2), max cards per certificate, and
  max nominated certificates;
- perceive policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `CARD_NEVER_RESTORES_FACTS`,
  `CARD_NEVER_CONFIRMS`, `BODY_NEVER_VISIBLE`,
  `TOOL_MUTATE_NEVER_ALLOWED`, `POINT_LOOKUP_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `LEDGER_NEVER_SCANNED`,
  `HALT_DENIES_BODY_READ`, `QUARANTINE_BODY_NEVER_VISIBLE`,
  `PRIOR_RECEIPT_STEWARDS_EXCLUDED`,
  `PRIOR_GATE_STEWARDS_EXCLUDED`,
  `PRIOR_EXTENSION_STEWARDS_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PERCEIVE`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_TOOL_READ_DECISION` (24 bytes). The longest
perceive kind is `PERCEIVE_ATTESTED_RECEIPT` (25 bytes).

Approval and revocation require the authority fence
`approve_agent_apc_profile` / `revoke_agent_apc_profile`.
Direct `UPDATE` of a sealed profile or its perceive rules
is rejected. Profiles must be inserted as `DRAFT`.

### 3.2 Session and budget contract

A session is scoped by `account_id` and an idempotency key.
Budgets cover nominate, bind, seal, vector, invalidate,
and notify units, plus wall-clock, perceive threshold, max
cards, and max nominated certificates. Consumed units
cannot exceed the budget. Deadline must be after creation.
Evaluation consumes bind units. Sealing consumes seal
units.

### 3.3 Nomination and citation contract

Nomination is a point lookup of
`(account_id, source_certificate_id)` in the certificate
catalog. `nominate_agent_apc_certificate` reads that
primary key and copies the receipt hash and the effect
observation. It does not store a fact body. `access_path`
on the nomination is `POINT_LOOKUP`. `LEDGER_SCAN` is
rejected.

A citation binding is append-only. It may repeat the
receipt hash and the effect observation already on the
catalog row. It never walks a ledger and never moves the
clock.

### 3.4 Card and perception-decision contract

A sealed perception certificate names two distinct
perception stewards, both receipt stewards, both prior
gate stewards, and both prior extension stewards. A
perception steward who matches a receipt steward, a gate
steward, or an extension steward is rejected. A perception
decision records:

- `fact_disposition`: `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED` (never `RESTORED`);
- `body_visibility`: `ENVELOPE_ONLY` or `OMITTED` (never
  `BODY_VISIBLE`);
- `clock_disposition`: `REARMED` is required for
  `PERCEIVE_ATTESTED_RECEIPT`, and the successor clock hash
  must differ from the prior clock hash;
- `receipt_disposition`: `ATTESTED` is required when the
  cited effect is `ACKED`;
- `effect_observation`: the only success citation is
  `ACKED`, and it stays an observation;
- `attested_key_kind`: must not be `TRUSTED_ENROLLED` or
  `TRUSTED_WITHIN_SKEW`;
- `perceive_kind`: `PERCEIVE_ATTESTED_RECEIPT`,
  `HOLD_UNKNOWN_EFFECT`, `DENY_SILENCE_AS_ACK`,
  `DENY_CARD_AS_RESTORE`, `DENY_ACK_AS_TRUST`, `SKIP`, or
  `UNKNOWN_EFFECT`;
- `access_path`: `POINT_LOOKUP` (never `LEDGER_SCAN`);
- `opens_nested_expiry`: must be false;
- `provider_receipt_hash`: must differ from
  `disputed_fact_hash`.

There is no fact-body column and no `resolved_fact_hash`
column. `PERCEIVE_ATTESTED_RECEIPT` requires
`SEALED_ATTEST_CERT`, `POINT_LOOKUP`, `ALLOW_TOOL_READ`,
`TOOL_READ`, `ENVELOPE_ONLY`, `DISPUTED_HELD`,
`EXTENDED_HALT`, `REQUIRE_HUMAN`, `NARROWS`,
`AWAITING_CONFIRMATION`, and a non-silent `ACKED` receipt.

The perception snapshot is the card an agent reads. It
stores the effect observation, the receipt hash, and the
disputed-fact hash as separate metadata. `card_body` must
not contain `factBody`, `fact_body`, or
`resolvedFactHash`.

### 3.5 Notify contract

Notify intents start as `PREPARED`. Identity columns are
immutable after insert. A missing or ambiguous provider
response is `UNKNOWN_EFFECT`. `ACKED` on a notify intent
means the notifier accepted the card notice. It does not
rewrite `effect_observation` and it does not restore a
fact.

## 4. Deterministic invariants

1. Every row and every access index leads with
   `account_id`.
2. Profiles enter as `DRAFT` and leave `DRAFT` only through
   the approval or revocation authority fence.
3. Perception stewards are distinct from each other, from
   both receipt stewards, from both prior gate stewards,
   and from both prior extension stewards.
4. `ACKED` on a perception decision requires
   `receipt_disposition = ATTESTED` and
   `silence_inferred = false`. `ACKED` does not write
   `TRUSTED_ENROLLED`.
5. `TRUSTED_ENROLLED` and `TRUSTED_WITHIN_SKEW` are
   rejected on the decision and on the card.
6. `RESTORED` and `BODY_VISIBLE` are rejected. A card is
   not a fact restore.
7. `TOOL_MUTATE` is rejected. `LEDGER_SCAN` is rejected.
8. `opens_nested_expiry` must be false.
9. Purpose `AMPLIFIES` is rejected. After a hop, the
   requested purpose hash must differ from the donor
   purpose hash.
10. The provider receipt hash must differ from the disputed
    fact hash.
11. Unscoped catalog or board access is **FULL SCAN
    REJECTED**.

## 5. Execution model

Open, nominate, bind, evaluate, seal, invalidate, and
effect-prepare each run in one ACID row-store transaction
with session compare-and-swap. Card seal never joins a
neighbor board write, never updates the disputed fact, and
never rewrites the successor clock or the attested key.

Columnar synopses may count sealed, unknown, and denied
cards for an account. They are not authoritative. Vector
search discovers profile tags inside an account-owned
partition. It never returns a fact body and never
authorizes seal.

External notify providers are outside the ACID boundary.
Until a notify receipt is bound, the notify observation
remains `UNKNOWN_EFFECT`. That uncertainty does not change
the cited tool-read effect.

## 6. Lifecycle

### 6.1 Draft and approve

A steward inserts a `DRAFT` profile and at least one
dual-control perceive rule. Approval checks the definition
hash and rule count, then sets `APPROVED` through
`approve_agent_apc_profile`.

### 6.2 Open and nominate

A session opens under an approved profile. Nomination
calls `nominate_agent_apc_certificate`, which copies one
catalog row by primary key. It does not filter the catalog
by similarity and it does not scan boards.

### 6.3 Bind and evaluate

Bind appends a citation candidate. Evaluate emits a
perception decision. Silence evaluates to
`HOLD_UNKNOWN_EFFECT` or `DENY_SILENCE_AS_ACK`, never to
`PERCEIVE_ATTESTED_RECEIPT`.

### 6.4 Seal

Seal writes the perception certificate, the decision, and
the snapshot card in the same transaction. Stewards who
attested the receipt, gated the citation, or extended the
clock cannot compile the card.

### 6.5 Invalidate and notify

Invalidation appends a reason (`SUPERSEDED`, `RETRACTED`,
`QUARANTINED`, `KEY_REVOKED`). Notify is prepared, then
dispatched. Ambiguity becomes `UNKNOWN_EFFECT`.

### 6.6 Close and retain

Close is explicit. Audit events stay hash-chained. Profile
embeddings may be refreshed from the approved definition.
They are not a second source of authorization.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SourceCertificateId = string & { readonly brand: "SourceCertificateId" };
type PerceiveId = string & { readonly brand: "PerceiveId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type CitationBindingId = string & { readonly brand: "CitationBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SEALED_ATTESTATION"
  | "BIND_RECEIPT_CITATION"
  | "EVALUATE_ATTESTATION_PERCEPTION"
  | "SEAL_ATTESTATION_PERCEPTION_CARD"
  | "INVALIDATE_ATTESTATION_PERCEPTION"
  | "PREPARE_PERCEPTION_NOTIFY"
  | "PERCEPTION_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type AttestationPerceptionBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CERTIFICATE_MISSING"
  | "CITATION_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "PERCEPTION_AS_TRUST_DENIED"
  | "SILENCE_AS_ACK_DENIED"
  | "CARD_AS_CONFIRMATION_DENIED"
  | "PERCEPTION_AS_RESTORE_DENIED"
  | "HALT_READ_DENIED"
  | "TOOL_MUTATE_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "CARD_AS_FACT_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
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
  | "PERCEIVING"
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
  | "SEALED_ATTEST_CERT"
  | "SEALED_TOOL_READ_DECISION"
  | "SEALED_PROVIDER_RECEIPT"
  | "SEALED_RECEIPT_SLOT"
  | "SEALED_EFFECT_INTENT";

type AccessPath = "POINT_LOOKUP" | "LEDGER_SCAN";

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

type ClockLifecycle = "ATTESTED" | "UNATTESTED" | "UNKNOWN_EFFECT";

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

type PerceiveKind =
  | "PERCEIVE_ATTESTED_RECEIPT"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_SILENCE_AS_ACK"
  | "DENY_CARD_AS_RESTORE"
  | "DENY_ACK_AS_TRUST"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type BodyVisibility = "ENVELOPE_ONLY" | "BODY_VISIBLE" | "OMITTED";

type FactDisposition =
  | "DISPUTED_HELD"
  | "HALTED"
  | "QUARANTINE_OMITTED"
  | "RESTORED"
  | "UNKNOWN_EFFECT";

type ClockDisposition = "REARMED" | "UNCHANGED" | "REGRESSED" | "UNKNOWN_EFFECT";

type ReceiptDisposition =
  | "UNBOUND"
  | "ATTESTED"
  | "SILENCE"
  | "REJECTED"
  | "UNKNOWN_EFFECT";

type EffectObservation = "ACKED" | "FAILED" | "DISPATCHED" | "SILENCE" | "UNKNOWN_EFFECT";

type PurposeRelation = "EQUAL" | "NARROWS" | "AMPLIFIES" | "UNRELATED" | "UNKNOWN_EFFECT";

type EffectIntentStatus = "PREPARED" | "DISPATCHED" | "ACKED" | "FAILED" | "UNKNOWN_EFFECT";

interface AttestationPerceptionBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly perceiveThreshold: number;
  readonly maxCardsPerCertificate: number;
  readonly maxNominatedCertificates: number;
}

interface AttestationPerceptionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly perceiveThreshold: number;
  readonly maxCardsPerCertificate: number;
  readonly maxNominatedCertificates: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface AttestationPerceptionSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: AttestationPerceptionBudget;
  readonly consumed: Omit<
    AttestationPerceptionBudget,
    "maxWallTimeMs" | "perceiveThreshold" | "maxCardsPerCertificate" | "maxNominatedCertificates"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface AttestationNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly sourceKind: SourceKind;
  readonly accessPath: AccessPath;
  readonly gateKind: GateKind;
  readonly gateAction: GateAction;
  readonly effectObservation: EffectObservation;
  readonly receiptDisposition: ReceiptDisposition;
  readonly silenceInferred: boolean;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface ReceiptCitationBinding {
  readonly accountId: AccountId;
  readonly citationBindingId: CitationBindingId;
  readonly sessionId: SessionId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly receiptDisposition: ReceiptDisposition;
  readonly silenceInferred: boolean;
  readonly capturedAt: Timestamp;
}

interface AttestationPerceiveRecord {
  readonly accountId: AccountId;
  readonly perceiveId: PerceiveId;
  readonly sessionId: SessionId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly perceiveHash: Sha256;
  readonly perceivedAt: Timestamp;
}

interface AttestationPerceptionDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly sourceKind: SourceKind;
  readonly decisionOrdinal: number;
  readonly status: MemberStatus;
  readonly accessPath: AccessPath;
  readonly placementKind: PlacementKind;
  readonly keyLifecycle: KeyLifecycle;
  readonly clockLifecycle: ClockLifecycle;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly terminalKind: TerminalKind;
  readonly gateKind: GateKind;
  readonly gateAction: GateAction;
  readonly perceiveKind: PerceiveKind;
  readonly bodyVisibility: BodyVisibility;
  readonly factDisposition: FactDisposition;
  readonly clockDisposition: ClockDisposition;
  readonly receiptDisposition: ReceiptDisposition;
  readonly effectObservation: EffectObservation;
  readonly purposeRelation: PurposeRelation;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly silenceInferred: boolean;
  readonly opensNestedExpiry: boolean;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface AttestationPerceptionCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly perceiveId: PerceiveId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly perceptionStewardA: string;
  readonly perceptionStewardB: string;
  readonly receiptStewardA: string;
  readonly receiptStewardB: string;
  readonly priorGateStewardA: string;
  readonly priorGateStewardB: string;
  readonly priorExtensionStewardA: string;
  readonly priorExtensionStewardB: string;
  readonly decisionWatermark: number;
  readonly sealedAt: Timestamp;
}

interface PerceptionNotifyObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentAttestationPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly certificateId: CertificateId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly effectObservation: EffectObservation;
  readonly providerReceiptHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly factDisposition: FactDisposition;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly bodyVisibility: BodyVisibility;
  readonly sealedCardCount: number;
  readonly unknownEffectCount: number;
  readonly silenceDeniedCount: number;
  readonly disputedHeldCount: number;
  readonly restoreDeniedCount: number;
  readonly trustDeniedCount: number;
  readonly quarantineOmittedCount: number;
  readonly uncertainNotifyIntents: readonly PerceptionNotifyObservation[];
  readonly remainingBudget: Omit<
    AttestationPerceptionBudget,
    "maxWallTimeMs" | "perceiveThreshold" | "maxCardsPerCertificate" | "maxNominatedCertificates"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly AttestationPerceptionBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateAttestationPerceptionSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: AttestationPerceptionBudget;
}

interface NominateSealedAttestationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceCertificateId: SourceCertificateId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedProviderReceiptHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindReceiptCitationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceCertificateId: SourceCertificateId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly silenceInferred: boolean;
  readonly idempotencyKey: string;
}

interface EvaluateAttestationPerceptionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedProviderReceiptHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealAttestationPerceptionCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly perceiveId: PerceiveId;
  readonly consumerRef: ConsumerRef;
  readonly perceptionStewardA: string;
  readonly perceptionStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateAttestationPerceptionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceCertificateId: SourceCertificateId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PreparePerceptionNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface PerceptionNotifyUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion: "RETRY_SAME_CARD" | "ACCEPT_OBSERVATION" | "REJECT_CARD" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseAttestationPerceptionSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface PublishAttestationPerceptionCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type AttestationPerceptionDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: AttestationPerceptionSession;
      readonly certificate?: AttestationPerceptionCertificate;
      readonly perceptionDecision?: AttestationPerceptionDecision;
      readonly nomination?: AttestationNominationReceipt;
      readonly citation?: ReceiptCitationBinding;
      readonly perceive?: AttestationPerceiveRecord;
      readonly perception: AgentAttestationPerceptionCard;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: AttestationPerceptionBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly perception?: AgentAttestationPerceptionCard;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE apc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE apc_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'PERCEIVING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_source_kind AS ENUM (
  'SEALED_ATTEST_CERT',
  'SEALED_TOOL_READ_DECISION',
  'SEALED_PROVIDER_RECEIPT',
  'SEALED_RECEIPT_SLOT',
  'SEALED_EFFECT_INTENT'
);
CREATE TYPE apc_access_path AS ENUM ('POINT_LOOKUP', 'LEDGER_SCAN');
CREATE TYPE apc_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE apc_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE apc_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE apc_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE apc_perceive_kind AS ENUM (
  'PERCEIVE_ATTESTED_RECEIPT', 'HOLD_UNKNOWN_EFFECT', 'DENY_SILENCE_AS_ACK',
  'DENY_CARD_AS_RESTORE', 'DENY_ACK_AS_TRUST', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE apc_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE apc_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE apc_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_receipt_disposition AS ENUM (
  'UNBOUND', 'ATTESTED', 'SILENCE', 'REJECTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE apc_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_apc_profile_authority NOLOGIN;

CREATE TABLE agent_apc_authorization_evidence (
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

CREATE TABLE agent_apc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status apc_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  perceive_threshold SMALLINT NOT NULL
    CHECK (perceive_threshold BETWEEN 2 AND 8),
  max_cards_per_certificate SMALLINT NOT NULL
    CHECK (max_cards_per_certificate BETWEEN 1 AND 256),
  max_nominated_certificates SMALLINT NOT NULL
    CHECK (max_nominated_certificates BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_PERCEIVE', 'REQUIRE_REVIEW'
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
    REFERENCES agent_apc_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_apc_profile_perceive_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  perceive_threshold SMALLINT NOT NULL CHECK (perceive_threshold BETWEEN 2 AND 8),
  max_cards_per_certificate SMALLINT NOT NULL
    CHECK (max_cards_per_certificate BETWEEN 1 AND 256),
  require_dual_control_perceive BOOLEAN NOT NULL,
  perceive_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_apc_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_apc_certificate_catalog (
  account_id BIGINT NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_kind apc_source_kind NOT NULL,
  gate_kind apc_gate_kind NOT NULL,
  gate_action apc_gate_action NOT NULL,
  terminal_kind apc_terminal_kind NOT NULL,
  placement_kind apc_placement_kind NOT NULL,
  key_lifecycle apc_key_lifecycle NOT NULL,
  clock_lifecycle apc_clock_lifecycle NOT NULL,
  attested_key_kind apc_attested_key_kind NOT NULL,
  status apc_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  receipt_disposition apc_receipt_disposition NOT NULL,
  effect_observation apc_effect_observation NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_certificate_id),
  UNIQUE (account_id, receipt_ref, source_kind),
  CHECK (receipt_steward_a <> receipt_steward_b),
  CHECK (prior_gate_steward_a <> prior_gate_steward_b),
  CHECK (prior_extension_steward_a <> prior_extension_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash),
  CHECK (gate_kind <> 'ALLOW_TOOL_READ' OR gate_action = 'TOOL_READ'),
  CHECK (
    effect_observation <> 'ACKED'
    OR (receipt_disposition = 'ATTESTED' AND silence_inferred = false)
  ),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW'))
);

CREATE TABLE agent_apc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status apc_session_status NOT NULL,
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
  perceive_threshold SMALLINT NOT NULL
    CHECK (perceive_threshold BETWEEN 2 AND 8),
  max_cards_per_certificate SMALLINT NOT NULL
    CHECK (max_cards_per_certificate BETWEEN 1 AND 256),
  max_nominated_certificates SMALLINT NOT NULL
    CHECK (max_nominated_certificates BETWEEN 1 AND 256),
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
    REFERENCES agent_apc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_apc_authorization_evidence (account_id, evidence_id),
  CHECK (deadline_at > created_at),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_invalidate_units <= budget_invalidate_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_apc_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  access_path apc_access_path NOT NULL,
  source_kind apc_source_kind NOT NULL,
  gate_kind apc_gate_kind NOT NULL,
  gate_action apc_gate_action NOT NULL,
  effect_observation apc_effect_observation NOT NULL,
  receipt_disposition apc_receipt_disposition NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id, source_certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_apc_certificate_catalog (account_id, source_certificate_id),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_apc_citation_binding (
  account_id BIGINT NOT NULL,
  citation_binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  effect_observation apc_effect_observation NOT NULL,
  receipt_disposition apc_receipt_disposition NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, citation_binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_apc_certificate_catalog (account_id, source_certificate_id),
  CHECK (provider_receipt_hash <> ''),
  CHECK (
    effect_observation <> 'ACKED'
    OR (receipt_disposition = 'ATTESTED' AND silence_inferred = false)
  )
);

CREATE TABLE agent_apc_perceive_record (
  account_id BIGINT NOT NULL,
  perceive_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  perceive_hash CHAR(64) NOT NULL CHECK (length(perceive_hash) = 64),
  perceived_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, perceive_id),
  UNIQUE (account_id, session_id, perceive_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id),
  CHECK (successor_clock_hash <> prior_clock_hash),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_apc_perception_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  perceive_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  decision_watermark SMALLINT NOT NULL CHECK (decision_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id),
  FOREIGN KEY (account_id, perceive_id)
    REFERENCES agent_apc_perceive_record (account_id, perceive_id),
  CHECK (perception_steward_a <> perception_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_apc_perception_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_kind apc_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status apc_binding_status NOT NULL,
  placement_kind apc_placement_kind NOT NULL,
  key_lifecycle apc_key_lifecycle NOT NULL,
  clock_lifecycle apc_clock_lifecycle NOT NULL,
  attested_key_kind apc_attested_key_kind NOT NULL,
  terminal_kind apc_terminal_kind NOT NULL,
  gate_kind apc_gate_kind NOT NULL,
  gate_action apc_gate_action NOT NULL,
  perceive_kind apc_perceive_kind NOT NULL,
  body_visibility apc_body_visibility NOT NULL,
  fact_disposition apc_fact_disposition NOT NULL,
  clock_disposition apc_clock_disposition NOT NULL,
  receipt_disposition apc_receipt_disposition NOT NULL,
  effect_observation apc_effect_observation NOT NULL,
  purpose_relation apc_purpose_relation NOT NULL,
  access_path apc_access_path NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  requested_purpose_hash CHAR(64) NOT NULL
    CHECK (length(requested_purpose_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  silence_inferred BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  UNIQUE (account_id, certificate_id, source_certificate_id, decision_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_apc_perception_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_apc_certificate_catalog (account_id, source_certificate_id)
);

CREATE TABLE agent_apc_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
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
    REFERENCES agent_apc_perception_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_certificate_id)
    REFERENCES agent_apc_certificate_catalog (account_id, source_certificate_id)
);

CREATE TABLE agent_apc_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status apc_effect_status NOT NULL,
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
    REFERENCES agent_apc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_apc_perception_certificate (account_id, certificate_id)
);

CREATE TABLE agent_apc_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'BIND', 'SEAL', 'VECTOR', 'INVALIDATE', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units >= 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id)
);

CREATE TABLE agent_apc_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id)
);

CREATE TABLE agent_apc_command_result (
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

CREATE TABLE agent_apc_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_apc_audit_event (
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

CREATE TABLE agent_apc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_apc_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  status apc_binding_status NOT NULL,
  effect_observation apc_effect_observation NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  fact_disposition apc_fact_disposition NOT NULL,
  attested_key_kind apc_attested_key_kind NOT NULL,
  body_visibility apc_body_visibility NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_apc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_apc_perception_certificate (account_id, certificate_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility <> 'BODY_VISIBLE'),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (NOT (card_body ? 'factBody')),
  CHECK (NOT (card_body ? 'fact_body')),
  CHECK (NOT (card_body ? 'resolvedFactHash')),
  CHECK (card_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (card_body->>'factDisposition' IS DISTINCT FROM 'RESTORED'),
  CHECK (card_body->>'bodyVisibility' IS DISTINCT FROM 'BODY_VISIBLE')
);

CREATE TABLE agent_apc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_apc_profile()
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
       OR NEW.perceive_threshold IS DISTINCT FROM OLD.perceive_threshold
       OR NEW.max_cards_per_certificate
         IS DISTINCT FROM OLD.max_cards_per_certificate
       OR NEW.max_nominated_certificates IS DISTINCT FROM OLD.max_nominated_certificates
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
    IF current_setting('app.apc_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.apc_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_apc_profile_protect
BEFORE INSERT OR UPDATE ON agent_apc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_apc_profile();

CREATE FUNCTION protect_agent_apc_profile_perceive_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status apc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_apc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile perceive rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_apc_profile_perceive_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_apc_profile_perceive_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_apc_profile_perceive_rule();

CREATE FUNCTION protect_agent_apc_citation_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'citation bindings are append-only';
  END IF;
  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_apc_citation_binding_protect
BEFORE INSERT OR UPDATE ON agent_apc_citation_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_apc_citation_binding();

CREATE FUNCTION protect_agent_apc_perception_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.prior_clock_hash IS DISTINCT FROM OLD.prior_clock_hash
       OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
       OR NEW.provider_receipt_hash IS DISTINCT FROM OLD.provider_receipt_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.perception_steward_a IS DISTINCT FROM OLD.perception_steward_a
       OR NEW.perception_steward_b IS DISTINCT FROM OLD.perception_steward_b
       OR NEW.receipt_steward_a IS DISTINCT FROM OLD.receipt_steward_a
       OR NEW.receipt_steward_b IS DISTINCT FROM OLD.receipt_steward_b
       OR NEW.prior_gate_steward_a IS DISTINCT FROM OLD.prior_gate_steward_a
       OR NEW.prior_gate_steward_b IS DISTINCT FROM OLD.prior_gate_steward_b
       OR NEW.prior_extension_steward_a
         IS DISTINCT FROM OLD.prior_extension_steward_a
       OR NEW.prior_extension_steward_b
         IS DISTINCT FROM OLD.prior_extension_steward_b THEN
      RAISE EXCEPTION 'perception certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.perception_steward_a = NEW.perception_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct perception stewards';
  END IF;
  IF NEW.perception_steward_a = NEW.receipt_steward_a
     OR NEW.perception_steward_a = NEW.receipt_steward_b
     OR NEW.perception_steward_b = NEW.receipt_steward_a
     OR NEW.perception_steward_b = NEW.receipt_steward_b
     OR NEW.perception_steward_a = NEW.prior_gate_steward_a
     OR NEW.perception_steward_a = NEW.prior_gate_steward_b
     OR NEW.perception_steward_b = NEW.prior_gate_steward_a
     OR NEW.perception_steward_b = NEW.prior_gate_steward_b
     OR NEW.perception_steward_a = NEW.prior_extension_steward_a
     OR NEW.perception_steward_a = NEW.prior_extension_steward_b
     OR NEW.perception_steward_b = NEW.prior_extension_steward_a
     OR NEW.perception_steward_b = NEW.prior_extension_steward_b THEN
    RAISE EXCEPTION 'prior-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_apc_perception_certificate_protect
BEFORE INSERT OR UPDATE ON agent_apc_perception_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_apc_perception_certificate();

CREATE FUNCTION protect_agent_apc_perception_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_certificate_id IS DISTINCT FROM OLD.source_certificate_id
       OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
       OR NEW.prior_clock_hash IS DISTINCT FROM OLD.prior_clock_hash
       OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
       OR NEW.provider_receipt_hash IS DISTINCT FROM OLD.provider_receipt_hash
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
       OR NEW.perceive_kind IS DISTINCT FROM OLD.perceive_kind
       OR NEW.body_visibility IS DISTINCT FROM OLD.body_visibility
       OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
       OR NEW.clock_disposition IS DISTINCT FROM OLD.clock_disposition
       OR NEW.receipt_disposition IS DISTINCT FROM OLD.receipt_disposition
       OR NEW.effect_observation IS DISTINCT FROM OLD.effect_observation
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.access_path IS DISTINCT FROM OLD.access_path
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id
       OR NEW.silence_inferred IS DISTINCT FROM OLD.silence_inferred
       OR NEW.opens_nested_expiry IS DISTINCT FROM OLD.opens_nested_expiry THEN
      RAISE EXCEPTION 'perception decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'perception-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'perception-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'halt-read fence blocks exposing a disputed fact body';
  END IF;

  IF NEW.gate_action = 'TOOL_MUTATE' THEN
    RAISE EXCEPTION 'tool-mutate fence blocks mutation from a perception card';
  END IF;

  IF NEW.effect_observation = 'ACKED'
     AND (
       NEW.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR NEW.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence blocks ACKED without an attested receipt';
  END IF;

  IF NEW.provider_receipt_hash IS NOT DISTINCT FROM NEW.disputed_fact_hash THEN
    RAISE EXCEPTION 'card-as-fact fence blocks using the disputed fact hash as a receipt';
  END IF;

  IF NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'card-as-confirmation fence blocks TRUSTED_ENROLLED from a perception card';
  END IF;

  IF NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks a card for invented successor history';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than citation attenuation';
  END IF;

  IF NEW.terminal_kind IN ('REQUIRE_HUMAN', 'PERMANENT_QUARANTINE')
     AND NEW.placement_kind = 'RESTORED_WITHOUT_WINNER' THEN
    RAISE EXCEPTION 'terminal-restore fence blocks restore of a sealed terminal';
  END IF;

  IF NEW.terminal_kind = 'PERMANENT_QUARANTINE'
     AND NEW.fact_disposition NOT IN ('QUARANTINE_OMITTED', 'HALTED') THEN
    RAISE EXCEPTION 'quarantine-leak fence blocks visible restore of a quarantined body';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence blocks opening another expiry plane';
  END IF;

  IF NEW.clock_disposition = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks rewinding a successor clock';
  END IF;

  IF NEW.access_path = 'LEDGER_SCAN' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.perceive_kind = 'PERCEIVE_ATTESTED_RECEIPT'
     AND NEW.successor_clock_hash IS NOT DISTINCT FROM NEW.prior_clock_hash THEN
    RAISE EXCEPTION 'clock fence requires a distinct successor clock hash';
  END IF;

  IF NEW.perceive_kind = 'PERCEIVE_ATTESTED_RECEIPT'
     AND NEW.hop_count > 0
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose reads after attenuation hops';
  END IF;

  IF NEW.perceive_kind = 'PERCEIVE_ATTESTED_RECEIPT'
     AND (
       NEW.source_kind IS DISTINCT FROM 'SEALED_ATTEST_CERT'
       OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
       OR NEW.gate_kind IS DISTINCT FROM 'ALLOW_TOOL_READ'
       OR NEW.gate_action IS DISTINCT FROM 'TOOL_READ'
       OR NEW.body_visibility IS DISTINCT FROM 'ENVELOPE_ONLY'
       OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
       OR NEW.clock_disposition IS DISTINCT FROM 'REARMED'
       OR NEW.placement_kind IS DISTINCT FROM 'EXTENDED_HALT'
       OR NEW.terminal_kind IS DISTINCT FROM 'REQUIRE_HUMAN'
       OR NEW.purpose_relation IS DISTINCT FROM 'NARROWS'
       OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
       OR NEW.clock_lifecycle IS DISTINCT FROM 'ATTESTED'
       OR NEW.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR NEW.effect_observation IS DISTINCT FROM 'ACKED'
       OR NEW.silence_inferred
     ) THEN
    RAISE EXCEPTION 'perception fence requires a non-silent receipt citation on a held fact';
  END IF;

  IF NEW.perceive_kind = 'HOLD_UNKNOWN_EFFECT'
     AND NEW.effect_observation IS DISTINCT FROM 'UNKNOWN_EFFECT' THEN
    RAISE EXCEPTION 'unknown-effect fence blocks HOLD_UNKNOWN_EFFECT with a success observation';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_apc_perception_decision_protect
BEFORE INSERT OR UPDATE ON agent_apc_perception_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_apc_perception_decision();

CREATE FUNCTION protect_agent_apc_effect_intent()
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

CREATE TRIGGER agent_apc_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_apc_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_apc_effect_intent();

CREATE FUNCTION approve_agent_apc_profile(
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
  stored_status apc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_apc_profile
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
  FROM agent_apc_profile_perceive_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_perceive IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control perceive rule';
  END IF;

  PERFORM set_config(
    'app.apc_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_apc_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_apc_profile(
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
  stored_status apc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_apc_profile
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
    'app.apc_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_apc_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_apc_certificate(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_certificate_id UUID,
  recipient_nomination_id UUID,
  nomination_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  catalog agent_apc_certificate_catalog%ROWTYPE;
BEGIN
  IF recipient_certificate_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_apc_certificate_catalog
  WHERE account_id = tenant_id
    AND source_certificate_id = recipient_certificate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'certificate point lookup missed';
  END IF;

  IF catalog.effect_observation = 'ACKED'
     AND (
       catalog.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR catalog.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence';
  END IF;

  IF catalog.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'perception-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  INSERT INTO agent_apc_nomination (
    account_id, nomination_id, session_id, source_certificate_id,
    access_path, source_kind, gate_kind, gate_action,
    effect_observation, receipt_disposition, silence_inferred,
    disputed_fact_hash, provider_receipt_hash,
    nomination_hash, nominated_at
  ) VALUES (
    tenant_id, recipient_nomination_id, recipient_session_id,
    recipient_certificate_id, 'POINT_LOOKUP', catalog.source_kind,
    catalog.gate_kind, catalog.gate_action,
    catalog.effect_observation, catalog.receipt_disposition,
    catalog.silence_inferred, catalog.disputed_fact_hash,
    catalog.provider_receipt_hash, nomination_digest, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION reject_agent_apc_unscoped_scan(
  has_account BOOLEAN,
  has_point_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_point_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_apc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_apc_profile_authority;
ALTER FUNCTION revoke_agent_apc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_apc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_apc_profile_authority;
GRANT SELECT ON
  agent_apc_profile,
  agent_apc_profile_perceive_rule
TO agent_apc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_apc_profile TO agent_apc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_apc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_apc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_apc_profile FROM PUBLIC;

CREATE INDEX agent_apc_session_work_idx ON agent_apc_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_apc_session_profile_idx ON agent_apc_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_apc_decision_certificate_idx ON agent_apc_perception_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_apc_decision_source_idx ON agent_apc_perception_decision (
  account_id, source_certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_apc_catalog_ref_idx ON agent_apc_certificate_catalog (
  account_id, receipt_ref, sealed_at DESC, source_certificate_id
);
CREATE INDEX agent_apc_catalog_kind_idx ON agent_apc_certificate_catalog (
  account_id, source_kind, sealed_at DESC, source_certificate_id
);
CREATE INDEX agent_apc_record_session_idx ON agent_apc_perceive_record (
  account_id, session_id, perceived_at DESC, perceive_id
);
CREATE INDEX agent_apc_certificate_session_idx ON agent_apc_perception_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_apc_nomination_session_idx ON agent_apc_nomination (
  account_id, session_id, nominated_at DESC, nomination_id
);
CREATE INDEX agent_apc_effect_work_idx ON agent_apc_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_apc_audit_time_idx ON agent_apc_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_apc_perception_status_idx ON agent_apc_perception_snapshot (
  account_id, status, created_at DESC, snapshot_id
);
CREATE INDEX agent_apc_command_expiry_idx ON agent_apc_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_apc_invalidation_certificate_idx ON agent_apc_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_apc_authorization_evidence',
    'agent_apc_profile',
    'agent_apc_profile_perceive_rule',
    'agent_apc_certificate_catalog',
    'agent_apc_session',
    'agent_apc_nomination',
    'agent_apc_citation_binding',
    'agent_apc_perceive_record',
    'agent_apc_perception_certificate',
    'agent_apc_perception_decision',
    'agent_apc_invalidation',
    'agent_apc_effect_intent',
    'agent_apc_budget_ledger',
    'agent_apc_terminal_record',
    'agent_apc_command_result',
    'agent_apc_audit_head',
    'agent_apc_audit_event',
    'agent_apc_audit_anchor',
    'agent_apc_perception_snapshot',
    'agent_apc_projection_checkpoint'
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
transaction with session compare-and-swap. Card seal never
joins a neighbor board write, never updates the disputed
fact, and never rewrites the successor clock.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers set `app.account_id`
before query. Composite primary keys and every access index
lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open
API. Long-running notify work returns durable state, not a
synchronous board promise. Profile search discovers
procedural memory. It does not authorize a card.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentApcSessionStatus {
  OPEN
  NOMINATING
  PERCEIVING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentApcPerceiveKind {
  PERCEIVE_ATTESTED_RECEIPT
  HOLD_UNKNOWN_EFFECT
  DENY_SILENCE_AS_ACK
  DENY_CARD_AS_RESTORE
  DENY_ACK_AS_TRUST
  SKIP
  UNKNOWN_EFFECT
}

enum AgentApcEffectObservation {
  ACKED
  FAILED
  DISPATCHED
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentApcEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentApcNextAction {
  NOMINATE_SEALED_ATTESTATION
  BIND_RECEIPT_CITATION
  EVALUATE_ATTESTATION_PERCEPTION
  SEAL_ATTESTATION_PERCEPTION_CARD
  INVALIDATE_ATTESTATION_PERCEPTION
  PREPARE_PERCEPTION_NOTIFY
  PERCEPTION_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentApcBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  BUDGET_EXHAUSTED
  CERTIFICATE_MISSING
  SILENCE_AS_ACK_DENIED
  PERCEPTION_AS_TRUST_DENIED
  PERCEPTION_AS_RESTORE_DENIED
  TOOL_MUTATE_DENIED
  NESTED_EXPIRY_DENIED
  LEDGER_SCAN_DENIED
  UNKNOWN_EFFECT
}

type AgentApcProfile {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  perceiveThreshold: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentApcSession {
  accountId: Long!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentApcSessionStatus!
  stateRevision: Long!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentApcCatalogEntry {
  accountId: Long!
  sourceCertificateId: ID!
  gateKind: String!
  gateAction: String!
  disputedFactHash: SHA256!
  providerReceiptHash: SHA256!
  effectObservation: AgentApcEffectObservation!
  status: String!
}

type AgentApcCertificate {
  accountId: Long!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  perceiveKind: AgentApcPerceiveKind!
  effectObservation: AgentApcEffectObservation!
  sealedAt: DateTime!
}

type AgentApcPerception {
  accountId: Long!
  sessionId: ID!
  certificateId: ID!
  status: AgentApcSessionStatus!
  summary: String!
  effectObservation: AgentApcEffectObservation!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  factDisposition: String!
  attestedKeyKind: String!
  bodyVisibility: String!
  unknownEffectCount: Int!
  allowedNextActions: [AgentApcNextAction!]!
  blockedReasons: [AgentApcBlockedReason!]!
  cardHash: SHA256!
}

type AgentApcAuditHead {
  accountId: Long!
  headSequence: Long!
  headHash: SHA256!
  updatedAt: DateTime!
}

type AgentApcResult {
  decision: String!
  retryable: Boolean!
  reason: String!
  session: AgentApcSession
  certificate: AgentApcCertificate
  perception: AgentApcPerception
  auditHash: SHA256!
}

input AgentApcBudgetInput {
  nominateUnits: Int!
  bindUnits: Int!
  sealUnits: Int!
  vectorUnits: Int!
  invalidateUnits: Int!
  notifyUnits: Int!
  maxWallTimeMs: Int!
  perceiveThreshold: Int!
  maxCardsPerCertificate: Int!
  maxNominatedCertificates: Int!
}

input CreateAttestationPerceptionSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentApcBudgetInput!
}

input NominateSealedAttestationInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  sourceCertificateId: ID!
  expectedDisputedFactHash: SHA256!
  expectedProviderReceiptHash: SHA256!
  idempotencyKey: String!
}

input BindReceiptCitationInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  sourceCertificateId: ID!
  providerReceiptHash: SHA256!
  effectObservation: AgentApcEffectObservation!
  silenceInferred: Boolean!
  idempotencyKey: String!
}

input EvaluateAttestationPerceptionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  expectedProviderReceiptHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealAttestationPerceptionCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  perceiveId: ID!
  consumerRef: String!
  perceptionStewardA: String!
  perceptionStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input InvalidateAttestationPerceptionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceCertificateId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input PreparePerceptionNotifyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input RecordPerceptionNotifyUncertaintyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: String!
  idempotencyKey: String!
}

input CloseAttestationPerceptionSessionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input PublishAttestationPerceptionCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

type Query {
  attestationPerceptionProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentApcProfile
  attestationPerceptionSession(accountId: Long!, sessionId: ID!): AgentApcSession
  sealedAttestationCertificate(accountId: Long!, sourceCertificateId: ID!): AgentApcCatalogEntry
  attestationPerceptionCertificate(accountId: Long!, certificateId: ID!): AgentApcCertificate
  attestationPerceptionCard(accountId: Long!, sessionId: ID!): AgentApcPerception
  attestationPerceptionAuditReplay(accountId: Long!, sessionId: ID!): AgentApcAuditHead
}

type Mutation {
  createAttestationPerceptionSession(input: CreateAttestationPerceptionSessionInput!): AgentApcResult!
  nominateSealedAttestation(input: NominateSealedAttestationInput!): AgentApcResult!
  bindReceiptCitation(input: BindReceiptCitationInput!): AgentApcResult!
  evaluateAttestationPerception(input: EvaluateAttestationPerceptionInput!): AgentApcResult!
  sealAttestationPerceptionCard(input: SealAttestationPerceptionCardInput!): AgentApcResult!
  invalidateAttestationPerception(input: InvalidateAttestationPerceptionInput!): AgentApcResult!
  preparePerceptionNotify(input: PreparePerceptionNotifyInput!): AgentApcResult!
  recordPerceptionNotifyUncertainty(input: RecordPerceptionNotifyUncertaintyInput!): AgentApcResult!
  closeAttestationPerceptionSession(input: CloseAttestationPerceptionSessionInput!): AgentApcResult!
  publishAttestationPerceptionCard(input: PublishAttestationPerceptionCardInput!): AgentApcResult!
}
```

### GraphQL limits

Resolvers require `accountId` and reject missing tenant
scope. Catalog and certificate reads are primary-key point
lookups. Perception and audit reads are bounded by
`sessionId`. There is no list-all-cards field. A client
that asks for every tool call on a board is **FULL SCAN
REJECTED** before execution.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `perceive_instruction` records that a card cites
the receipt hash and the effect observation, that `ACKED`
is never trust, and that a card never restores a fact.
`procedureRef` points at that profile version. Agents do
not store a second hidden policy. If the profile is revoked
with `STOP_BEFORE_PERCEIVE`, new nominations stop. In-flight
cards remain replayable.

Semantic tags (`incident`, `attestation-perception`) are
for discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_apc_profile_embedding (
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
    REFERENCES agent_apc_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_apc_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_apc_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_apc_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped certificate-catalog or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates by primary key, and seals under dual
control. Similarity never compiles a perception card.

## 12. Agent perception

Agents receive one card per sealed certificate. The card
exposes `effectObservation`, `providerReceiptHash`, and
`disputedFactHash` as separate metadata, plus
`factDisposition`, `attestedKeyKind`, and `bodyVisibility`.
Summary text is `UntrustedText`. Cards also expose unknown-
effect counts, remaining budgets, procedure tags, allowed
next actions, and blocked reasons. They never embed raw
private keys, tool payloads, fact bodies, or a winning fact
hash. `cardHash` makes perception replayable.

An LLM should read the card as: "a sealed attestation
certificate was cited by point lookup, and the effect is
either `ACKED` with this receipt hash or still
`UNKNOWN_EFFECT`." It should not read the card as "the
disputed fact is now true" or "the signing key is
`TRUSTED_ENROLLED`." Metadata tags that keep that reading
stable are `factDisposition=DISPUTED_HELD`,
`attestedKeyKind=AWAITING_CONFIRMATION`, and
`bodyVisibility=ENVELOPE_ONLY`.

## 13. ACID and consistency

### Row store

Nomination, citation, evaluation, and seal commit or roll
back together. Compare-and-swap on `state_revision` rejects
lost updates. Card identity is immutable. The card is a
projection of the sealed certificate, not a second fact.

### Columnar store

Analytical counts of perceive kinds and effect observations
are derived from the row store by `account_id`. They lag
the seal watermark and cannot authorize a new card.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but approval status is re-read from the row
store before a session opens.

### External tools

Notify providers are not in the local transaction. Silence,
timeout, and ambiguous HTTP responses stay `UNKNOWN_EFFECT`.
A later notify receipt may be bound by a new append-only
row. It does not rewrite the cited tool-read effect and it
does not restore the disputed fact.

## 14. Guardrails and neighbor protection

Budgets cap nominate, bind, seal, vector, invalidate, and
notify units. Wall-clock is bounded. Perceive threshold is
at least two distinct stewards. Hop count is at most 8.
Cards per certificate are at most 256.

Recursive agent loops that re-query "all receipts for this
board" without `account_id` plus a certificate or session
key are **FULL SCAN REJECTED**. Vector topK without
`account_id` is rejected. A session cannot spend another
tenant's budget. `reject_agent_apc_unscoped_scan` fails
closed when the point-lookup key is missing.

These fences protect the 99.99% availability target:
one agent's uncertainty cannot become a neighbor's
table scan.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

The following plans are **FULL SCAN REJECTED**:

- certificate catalog filter on receipt text, purpose, or
  provider payload without `account_id` and
  `source_certificate_id`;
- perception decision filter on `effect_observation` alone;
- JSON containment on `card_body` or `perceive_instruction`
  across accounts;
- unbounded topK on `agent_apc_profile_embedding`;
- joining cards to board items by scanning every item to
  see whether a tool "finished."

### Required access paths

Every hot path starts with `account_id`, then a session,
certificate, or profile key. Nomination is a primary-key
lookup. Partial indexes cover in-flight notify work
(`PREPARED`, `DISPATCHED`, `UNKNOWN_EFFECT`) without
reading sealed history.

### Planner enforcement

The governor checks estimated rows and required predicates
before execution. Missing `account_id` or a point-lookup
key fails the statement. The engine does not sample the
board to answer a perception question.

## 16. Auditability and replay

Each command appends an audit event with `payload_hash`,
`prev_hash`, and `event_hash`. Anchors store a Merkle root
over a sequence range. Replay reconstructs nomination,
citation, seal, invalidation, and notify uncertainty from
hashes. Replay does not call an embedding model and does
not invent a fact body that was not stored.

Perception snapshots store `card_hash` so a later agent
sees the same effect observation the sealing transaction
published.

## 17. Threat and failure analysis

| Threat | Fence |
| --- | --- |
| `ACKED` read as key trust | `TRUSTED_ENROLLED` rejected |
| Card restores the disputed fact | `RESTORED` and `BODY_VISIBLE` rejected |
| Receipt hash is the fact hash | hashes must differ |
| Same steward attests and perceives | receipt, gate, and extension stewards excluded |
| Ledger walk on 1M+ rows | **FULL SCAN REJECTED** |
| Tool mutation from a card | `TOOL_MUTATE` rejected |
| Nested expiry loop | `opens_nested_expiry` rejected |
| Silence cited as `ACKED` | `ACKED` requires `ATTESTED` and `silence_inferred = false` |
| Cross-tenant vector hit | `account_id` predicate and forced RLS |
| Notify ack launders tool success | notify status does not update `effect_observation` |
| Card JSON smuggles a fact body | `factBody` and `resolvedFactHash` rejected |

Failure of the notify provider leaves `UNKNOWN_EFFECT`.
The session can close, retry the same card under a new
idempotency key, or require a human. It cannot mark the
fact restored.

## 18. Observability and SLOs

Track, per `account_id`:

- card seal latency against the session budget;
- fraction of cards that remain `UNKNOWN_EFFECT`;
- perception-as-trust and perception-as-restore rejections;
- full-scan rejections;
- notify intents stuck in `PREPARED` or `DISPATCHED`.

The availability objective remains 99.99% for neighbor
queries. Perception uncertainty is a correct outcome, not
an error budget burn. A rise in full-scan rejections is a
client bug. A rise in perception-as-trust rejections is a
client trying to launder `ACKED` into enrollment.

## 19. Rollout

### Phase 1: shadow cards

Write perception decisions in shadow mode. Compare them to
what agents would have inferred from `ACKED`. Do not change
fact visibility.

### Phase 2: deny-only

Enforce perception-as-trust, perception-as-restore,
silence-as-ack, and full-scan rejections. Do not yet return
`PERCEIVE_ATTESTED_RECEIPT` to agents.

### Phase 3: cited receipts with facts held

Return sealed perception cards. Facts stay `DISPUTED_HELD`.
Keys stay `AWAITING_CONFIRMATION`. Bodies stay
`ENVELOPE_ONLY`.

### Phase 4: notify uncertainty

Dispatch notify intents. Surface `UNKNOWN_EFFECT` on the
card when the notifier does not acknowledge. Do not rewrite
the cited tool-read effect.

### Phase 5: broad availability

Enable account-partitioned HNSW profile discovery. Keep
point-lookup nomination. Do not open a nested expiry plane.

## 20. Ship criteria

### Contract validation

`npm run validate` typechecks the TypeScript contracts,
builds the GraphQL schema (6 queries, 10 mutations), and
executes the SQL on PGlite with pgvector.

### Behavioral validation

The fixture nominates one sealed attestation certificate by
point lookup, seals one `PERCEIVE_ATTESTED_RECEIPT` card
whose effect is `ACKED` and whose key stays
`AWAITING_CONFIRMATION`, and rejects:

- an unscoped certificate scan;
- duplicate session idempotency keys;
- mutation of a sealed perceive rule;
- insertion of a pre-approved profile;
- mutation of perception-decision identity;
- direct profile revocation;
- a non-`PREPARED` effect intent;
- mutation of prepared effect identity;
- mutation of a sealed profile definition;
- `TRUSTED_ENROLLED` (perception-as-trust);
- `RESTORED` / `BODY_VISIBLE` (perception-as-restore).

### Scale and failure validation

Explain plans for catalog and card reads stay on
`account_id` leading indexes at 1M+ catalog rows. A query
without that prefix is **FULL SCAN REJECTED**. Killing the
notify provider leaves the intent `UNKNOWN_EFFECT` and
leaves the disputed fact hash unchanged.

## 21. Product decision

Ship the Attestation Perception Card Plane as the
deterministic way a downstream session consumes a sealed
tool-read receipt attestation certificate.

Choose fact integrity over perception fluency. The card
cites a receipt hash and an effect observation. `ACKED` is
not `TRUSTED_ENROLLED`. The disputed fact stays held. The
body stays hidden. Compilation is a point lookup, not a
ledger scan, and it does not open another nested
expiry-containment-review-resolution plane.

The following increment should let a context compiler
attach one sealed perception card to an agent context
packet by point lookup of `(account_id, snapshot_id)`. The
packet may repeat the receipt hash and the effect
observation as untrusted metadata. It must drop the
citation when the card is invalidated. It must not inline
the disputed fact body, must not promote `ACKED` to
`TRUSTED_ENROLLED`, and must not open another nested expiry
plane.
