# mondayDB Agentic Tool-Read Receipt Attestation Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-24.v1`

## 1. Why this plane, before how

The 2026-09-23 Extended Working-Set Purpose Gate Plane can
seal `ALLOW_TOOL_READ` for a citation whose clock was
re-armed. That decision authorizes an attempt. It does not
attest that a provider returned a receipt, and it must not
treat silence as success.

Without a receipt-attestation plane, operators and agents
either:

- treat the sealed `ALLOW_TOOL_READ` decision as proof the
  tool completed (a gate becomes a success bit), or
- scan effect ledgers, notify logs, and board rows looking
  for "did the provider answer" (neighbor-harmful on boards
  with 1M+ rows).

The product trade-off is **receipt fluency versus effect
honesty**:

- Binding any provider payload, or inferring success from
  silence, maximizes agent fluency and hides uncertainty.
  It also creates silence-as-success, receipt-as-restore,
  receipt-as-trust, and body visibility.
- Issuing a sealed attestation certificate under an
  approved profile, decision-catalog point lookups, and
  dual-control receipt stewards who did not gate the
  citation and did not re-arm the clock adds one bounded
  attestation transaction. `ACKED` is allowed only when a
  provider receipt hash is present. Silence stays
  `UNKNOWN_EFFECT`. The disputed fact stays held. The key
  stays `AWAITING_CONFIRMATION`.
- Semantic similarity may discover attestation profiles,
  but it must never decide whether a decision may be
  nominated, a receipt bound, an attestation evaluated, a
  certificate sealed, or a consumer notified.

The recommended model keeps the data plane deterministic:

1. An approved attestation profile is procedural memory for
   "how a sealed `ALLOW_TOOL_READ` decision may be bound to
   a provider receipt." A profile **never** invents a
   winning fact hash and **never** rewrites a re-armed
   clock as `TRUSTED_ENROLLED`.
2. A session opens under purpose, budget, and authorization
   fences, and only nominates sealed tool-read decisions by
   point lookup of `(account_id, source_decision_id)`. The
   prior clock, successor clock, and disputed-fact hash are
   copied from the catalog. They are never computed by
   walking ledgers.
3. mondayDB evaluates an attestation whose outcome is a
   pure function of `(source_kind, gate_kind, gate_action,
   terminal_kind, placement_kind, key_lifecycle,
   clock_lifecycle, attested_key_kind, attest_kind,
   body_visibility, fact_disposition, clock_disposition,
   receipt_disposition, effect_observation,
   purpose_relation, silence_inferred, hop_count)`.
   Silence cannot become `ACKED`.
4. Sealing binds `consumer_ref + purpose_hash +
   prior_clock_hash + successor_clock_hash +
   disputed_fact_hash + provider_receipt_hash +
   halt_scope_hash + attenuation_hash + decision_set_hash +
   receipt_steward_a + receipt_steward_b`. The certificate
   **must not** emit a `resolved_fact_hash` and **must
   not** emit `TRUSTED_ENROLLED`.
5. Upstream invalidation marks certificates stale. Notify
   intents may become `UNKNOWN_EFFECT` until acknowledged.
   A notify acknowledgement is not a tool receipt.
6. Unscoped decision-catalog, receipt-catalog, vote-ledger,
   page-ledger, ack-ledger, escalation-ledger, containment-
   ledger, review-ledger, resolution-ledger, promotion-
   ledger, working-set, grant-graph, or board scans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor
protection: recursive "find every tool call the new clock
unlocked" loops are rejectable before they scan boards
with 1M+ rows. Perception is restored by sealed receipt
certificates, not by magic success inside the engine.

### Product outcome

For any tool-read receipt attestation, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, receipt bind, evaluation, seal, invalidate,
  or notify dispatch?
- Which nominated `ALLOW_TOOL_READ` decision, provider
  receipt hash, prior clock, successor clock, and
  disputed-fact hash were bound?
- Did `ACKED` require a non-silent attested receipt while
  the disputed fact stayed held and the key stayed
  unconfirmed?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the attestation history be replayed without invoking
  an LLM?

## 2. Scope and ownership

The Tool-Read Receipt Attestation Plane owns:

1. Immutable approved attestation profiles as procedural
   memory of "how a sealed tool-read decision may be bound
   to a provider receipt without restoring a disputed fact,
   amplifying purpose, leaking a halted or quarantined
   body, rewriting a re-armed clock as `TRUSTED_ENROLLED`,
   treating silence as success, scanning governance
   ledgers, or opening another nested expiry."
2. Tenant-scoped attestation sessions with purpose and
   budget fences.
3. Deterministic nomination of sealed `ALLOW_TOOL_READ`
   decisions by point lookup.
4. Deterministic receipt bindings, attestation records,
   sealed certificates, and immutable decisions that never
   invent a winner.
5. Invalidation and notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded
   attestation budgets.

It integrates with, but does not replace:

- **Extended Working-Set Purpose Gate Plane:** supplies the
  sealed `ALLOW_TOOL_READ` decision this plane may
  nominate. This plane never re-evaluates the purpose gate
  and never authorizes `TOOL_MUTATE` or `ALLOW_ENVELOPE_READ`
  as a receipt.
- **SLA Extension Certificate Plane:** supplies the
  successor clock copied into the catalog. This plane never
  re-arms a clock and never treats a re-armed clock as
  `TRUSTED_ENROLLED`.
- **Envelope Tool-Effect Saga:** may later compensate an
  external effect. This plane does not claim compensation
  ran, and a missing receipt stays `UNKNOWN_EFFECT`.
- **Query Governor / Budgets:** reserves nominate, bind,
  vector, seal, invalidate, and notify units.

### Non-goals

- Letting an LLM decide that silence "probably means the
  tool succeeded."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative receipt certificates from
  columnar or vector projections.
- Cross-account attestation or global nearest-neighbor
  authorization.
- Storing raw private keys, unrestricted tool payloads, or
  redacted fact bodies.
- Claiming distributed atomicity with external tool or
  notify providers.
- Inventing a winning fact hash when a receipt is attested.
- Promoting `FIRST_ENROLLMENT` to `TRUSTED_ENROLLED`
  because a receipt was attested.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to find tool calls a
  new clock "completed."
- Opening another nested expiry-containment-review-
  resolution plane from a receipt certificate.
- Showing a `PERMANENT_QUARANTINE` body or restoring a
  disputed fact because a provider answered.

## 3. Product contract

### 3.1 Attestation profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_TOOL_READ_DECISION`,
  `SEALED_EWG_GATE_CERT`, `SEALED_PROVIDER_RECEIPT`,
  `SEALED_RECEIPT_SLOT`, `SEALED_EFFECT_INTENT`);
- attest threshold (distinct receipt-steward principals,
  minimum 2), max decisions per certificate, and max
  nominated decisions;
- attest policy (`HISTORY_NEVER_REWRITTEN`,
  `SILENCE_NEVER_SUCCESS`,
  `FIRST_ENROLLMENT_NEVER_AUTO_TRUSTED`,
  `CLOCK_NEVER_BECOMES_TRUST`,
  `RECEIPT_NEVER_RESTORES_FACTS`,
  `RECEIPT_NEVER_CONFIRMS`, `BODY_NEVER_VISIBLE`,
  `TOOL_MUTATE_NEVER_ALLOWED`, `ENVELOPE_READ_NEVER_ATTESTED`,
  `NESTED_EXPIRY_NEVER_OPENS`, `LEDGER_NEVER_SCANNED`,
  `HALT_DENIES_BODY_READ`, `QUARANTINE_BODY_NEVER_VISIBLE`,
  `PRIOR_GATE_STEWARDS_EXCLUDED`,
  `PRIOR_EXTENSION_STEWARDS_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_ATTEST`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_TOOL_READ_DECISION` (24 bytes). The longest
attest kind is `DENY_RECEIPT_AS_TRUST` (20 bytes).

Approval and revocation require the authority fence
`approve_agent_tra_profile` / `revoke_agent_tra_profile`.
Direct `UPDATE` of a sealed profile or its attest rules is
rejected. Profiles must be inserted as `DRAFT`.

### 3.2 Session and budget contract

A session is scoped by `account_id` and an idempotency key.
Budgets cover nominate, bind, seal, vector, invalidate,
and notify units, plus wall-clock, attest threshold, max
decisions, and max nominated decisions. Consumed units
cannot exceed the budget. Deadline must be after creation.
Evaluation consumes bind units. Sealing consumes seal
units.

### 3.3 Nomination and receipt-binding contract

Nomination is a point lookup of
`(account_id, source_decision_id)` in the decision catalog.
The catalog stores the gate kind, gate action, disputed
fact hash, prior clock hash, and successor clock hash that
the purpose-gate plane already sealed. It does not store a
fact body or a tool payload. Only `ALLOW_TOOL_READ` with
`TOOL_READ` may be nominated for `ATTEST_TOOL_READ`.

A receipt binding is append-only. `ATTESTED` requires a
provider receipt hash, `silence_inferred = false`, and
`effect_observation = ACKED`. `SILENCE` requires
`effect_observation = UNKNOWN_EFFECT`. A binding never
walks a ledger and never moves the clock.

### 3.4 Certificate and attest-decision contract

A sealed certificate names two distinct receipt stewards,
both prior gate stewards, and both prior extension
stewards. A receipt steward who matches either gate
steward or either extension steward is rejected. An attest
decision records:

- `fact_disposition`: `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED` (never `RESTORED`);
- `body_visibility`: `ENVELOPE_ONLY` or `OMITTED` (never
  `BODY_VISIBLE`);
- `clock_disposition`: `REARMED` is required for
  `ATTEST_TOOL_READ`, and the successor clock hash must
  differ from the prior clock hash;
- `receipt_disposition`: `ATTESTED` is required for
  `ACKED`; `SILENCE` forces `UNKNOWN_EFFECT`;
- `attest_kind`: `ATTEST_TOOL_READ`,
  `HOLD_UNKNOWN_EFFECT`, `DENY_SILENCE_SUCCESS`,
  `DENY_RECEIPT_RESTORE`, `DENY_RECEIPT_AS_TRUST`, `SKIP`,
  or `UNKNOWN_EFFECT`;
- `gate_action`: `TOOL_READ` for an attested tool read
  (`TOOL_MUTATE` and envelope `READ` are rejected for
  `ATTEST_TOOL_READ`);
- `opens_nested_expiry`: must be false;
- `attested_key_kind`: must not be `TRUSTED_ENROLLED` or
  `TRUSTED_WITHIN_SKEW`;
- `provider_receipt_hash`: must differ from
  `disputed_fact_hash`.

There is no `resolved_fact_hash` column. `ATTEST_TOOL_READ`
requires `ALLOW_TOOL_READ`, `ENVELOPE_ONLY`,
`DISPUTED_HELD`, `EXTENDED_HALT`, `REQUIRE_HUMAN`,
`NARROWS`, `AWAITING_CONFIRMATION`, and a non-silent
`ACKED` receipt.

### 3.5 Notify contract

Notify intents start as `PREPARED`. Identity columns are
immutable after insert. A missing or ambiguous provider
response is `UNKNOWN_EFFECT`. `ACKED` on a notify intent
means the notifier accepted the attestation notice. It
does not rewrite `effect_observation` and it does not
restore a fact.

## 4. Deterministic invariants

1. Every row and every access index leads with
   `account_id`.
2. Profiles enter as `DRAFT` and leave `DRAFT` only through
   the approval or revocation authority fence.
3. Receipt stewards are distinct from each other, from both
   prior gate stewards, and from both prior extension
   stewards.
4. `ACKED` tool observation requires `receipt_disposition =
   ATTESTED` and `silence_inferred = false`.
5. `TRUSTED_ENROLLED` and `TRUSTED_WITHIN_SKEW` are
   rejected. A re-armed clock is not enrollment.
6. `RESTORED` and `BODY_VISIBLE` are rejected. A receipt is
   not a fact restore.
7. `TOOL_MUTATE` is rejected. `ALLOW_ENVELOPE_READ` cannot
   seal `ATTEST_TOOL_READ`.
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
with session compare-and-swap. Certificate seal never joins
a neighbor board write, never updates the disputed fact,
and never rewrites the successor clock.

Columnar synopses may count sealed, unknown, and denied
attestations for an account. They are not authoritative.
Vector search discovers profile tags inside an
account-owned partition. It never returns a receipt body
and never authorizes seal.

External tool providers and notify providers are outside
the ACID boundary. Until a receipt hash is bound, the
observation remains `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft and approve

A steward inserts a `DRAFT` profile and at least one
dual-control attest rule. Approval checks the definition
hash and rule count, then sets `APPROVED` through
`approve_agent_tra_profile`.

### 6.2 Open and nominate

A session opens under an approved profile. Nomination
copies one catalog row by primary key. It does not filter
the catalog by similarity and it does not scan boards.

### 6.3 Bind and evaluate

Bind appends a receipt candidate. Evaluate emits an attest
decision. Silence evaluates to `HOLD_UNKNOWN_EFFECT` or
`DENY_SILENCE_SUCCESS`, never to `ATTEST_TOOL_READ`.

### 6.4 Seal

Seal writes the certificate and the decision in the same
transaction. Stewards who gated or extended the citation
cannot attest it.

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
type SourceDecisionId = string & { readonly brand: "SourceDecisionId" };
type AttestId = string & { readonly brand: "AttestId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type ReceiptBindingId = string & { readonly brand: "ReceiptBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_TOOL_READ_DECISION"
  | "BIND_PROVIDER_RECEIPT"
  | "EVALUATE_TOOL_READ_RECEIPT"
  | "SEAL_TOOL_READ_RECEIPT_CERTIFICATE"
  | "INVALIDATE_TOOL_READ_RECEIPT"
  | "PREPARE_TOOL_READ_RECEIPT_EFFECT"
  | "TOOL_READ_RECEIPT_EFFECT_UNCERTAINTY"
  | "CLOSE_SESSION";

type ToolReadReceiptBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "DECISION_MISSING"
  | "RECEIPT_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "RECEIPT_AS_TRUST_DENIED"
  | "SILENCE_SUCCESS_DENIED"
  | "FIRST_ENROLLMENT_AUTO_TRUST_DENIED"
  | "RECEIPT_AS_RESTORE_DENIED"
  | "RECEIPT_AS_CONFIRMATION_DENIED"
  | "HALT_READ_DENIED"
  | "TOOL_MUTATE_DENIED"
  | "ENVELOPE_READ_ATTEST_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "RECEIPT_AS_FACT_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
  | "CLOCK_NOT_EXTENDED_DENIED"
  | "UNBOUND_DECISION_DENIED"
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
  | "ATTESTING"
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
  | "SEALED_TOOL_READ_DECISION"
  | "SEALED_EWG_GATE_CERT"
  | "SEALED_PROVIDER_RECEIPT"
  | "SEALED_RECEIPT_SLOT"
  | "SEALED_EFFECT_INTENT";

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

type AttestKind =
  | "ATTEST_TOOL_READ"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_SILENCE_SUCCESS"
  | "DENY_RECEIPT_RESTORE"
  | "DENY_RECEIPT_AS_TRUST"
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

interface ToolReadReceiptBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly invalidateUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly attestThreshold: number;
  readonly maxDecisionsPerCertificate: number;
  readonly maxNominatedDecisions: number;
}

interface ToolReadReceiptProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly attestThreshold: number;
  readonly maxDecisionsPerCertificate: number;
  readonly maxNominatedDecisions: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ToolReadReceiptSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ToolReadReceiptBudget;
  readonly consumed: Omit<
    ToolReadReceiptBudget,
    "maxWallTimeMs" | "attestThreshold" | "maxDecisionsPerCertificate" | "maxNominatedDecisions"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface ToolReadNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly sourceDecisionId: SourceDecisionId;
  readonly sourceKind: SourceKind;
  readonly gateKind: GateKind;
  readonly gateAction: GateAction;
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
  readonly priorGateStewardA: string;
  readonly priorGateStewardB: string;
  readonly priorExtensionStewardA: string;
  readonly priorExtensionStewardB: string;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
  readonly expiresAt: Timestamp;
}

interface ProviderReceiptBinding {
  readonly accountId: AccountId;
  readonly receiptBindingId: ReceiptBindingId;
  readonly sessionId: SessionId;
  readonly sourceDecisionId: SourceDecisionId;
  readonly providerReceiptHash: Sha256;
  readonly receiptDisposition: ReceiptDisposition;
  readonly effectObservation: EffectObservation;
  readonly silenceInferred: boolean;
  readonly capturedAt: Timestamp;
}

interface ToolReadAttestRecord {
  readonly accountId: AccountId;
  readonly attestId: AttestId;
  readonly sessionId: SessionId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly attestHash: Sha256;
  readonly attestedAt: Timestamp;
}

interface ToolReadAttestDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly sourceDecisionId: SourceDecisionId;
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
  readonly attestKind: AttestKind;
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

interface ToolReadAttestCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly attestId: AttestId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly receiptStewardA: string;
  readonly receiptStewardB: string;
  readonly priorGateStewardA: string;
  readonly priorGateStewardB: string;
  readonly priorExtensionStewardA: string;
  readonly priorExtensionStewardB: string;
  readonly decisionWatermark: number;
  readonly sealedAt: Timestamp;
}

interface ToolReadReceiptEffectObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentToolReadReceiptPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedDecisionCount: number;
  readonly attestedReceiptCount: number;
  readonly unknownEffectCount: number;
  readonly silenceDeniedCount: number;
  readonly disputedHeldCount: number;
  readonly restoreDeniedCount: number;
  readonly trustDeniedCount: number;
  readonly quarantineOmittedCount: number;
  readonly skippedDecisionCount: number;
  readonly invalidatedDecisionCount: number;
  readonly uncertainEffectIntents: readonly ToolReadReceiptEffectObservation[];
  readonly remainingBudget: Omit<
    ToolReadReceiptBudget,
    "maxWallTimeMs" | "attestThreshold" | "maxDecisionsPerCertificate" | "maxNominatedDecisions"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ToolReadReceiptBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateToolReadAttestationSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ToolReadReceiptBudget;
}

interface NominateAllowToolReadDecisionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceDecisionId: SourceDecisionId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedSuccessorClockHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindProviderReceiptCandidateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly sourceDecisionId: SourceDecisionId;
  readonly providerReceiptHash: Sha256 | null;
  readonly silenceInferred: boolean;
  readonly idempotencyKey: string;
}

interface EvaluateToolReadReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedProviderReceiptHash: Sha256 | null;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealToolReadReceiptCertificateInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly attestId: AttestId;
  readonly consumerRef: ConsumerRef;
  readonly receiptStewardA: string;
  readonly receiptStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateToolReadReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly sourceDecisionId: SourceDecisionId;
  readonly reasonCode: "SUPERSEDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareToolReadReceiptEffectInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface ToolReadReceiptEffectUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion: "RETRY_SAME_DECISION" | "ACCEPT_OBSERVATION" | "REJECT_RECEIPT" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseToolReadAttestationSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface PublishToolReadPerceptionCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ToolReadReceiptDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: ToolReadReceiptSession;
      readonly certificate?: ToolReadAttestCertificate;
      readonly attestDecision?: ToolReadAttestDecision;
      readonly nomination?: ToolReadNominationReceipt;
      readonly binding?: ProviderReceiptBinding;
      readonly attest?: ToolReadAttestRecord;
      readonly perception: AgentToolReadReceiptPerceptionCard;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: ToolReadReceiptBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly perception?: AgentToolReadReceiptPerceptionCard;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE tra_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE tra_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'ATTESTING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_source_kind AS ENUM (
  'SEALED_TOOL_READ_DECISION',
  'SEALED_EWG_GATE_CERT',
  'SEALED_PROVIDER_RECEIPT',
  'SEALED_RECEIPT_SLOT',
  'SEALED_EFFECT_INTENT'
);
CREATE TYPE tra_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tra_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tra_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tra_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE tra_attest_kind AS ENUM (
  'ATTEST_TOOL_READ', 'HOLD_UNKNOWN_EFFECT', 'DENY_SILENCE_SUCCESS',
  'DENY_RECEIPT_RESTORE', 'DENY_RECEIPT_AS_TRUST', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tra_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE tra_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE tra_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_receipt_disposition AS ENUM (
  'UNBOUND', 'ATTESTED', 'SILENCE', 'REJECTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE tra_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_tra_profile_authority NOLOGIN;

CREATE TABLE agent_tra_authorization_evidence (
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

CREATE TABLE agent_tra_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status tra_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  attest_threshold SMALLINT NOT NULL
    CHECK (attest_threshold BETWEEN 2 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  max_nominated_decisions SMALLINT NOT NULL
    CHECK (max_nominated_decisions BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_ATTEST', 'REQUIRE_REVIEW'
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
    REFERENCES agent_tra_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_tra_profile_attest_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  attest_threshold SMALLINT NOT NULL CHECK (attest_threshold BETWEEN 2 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  require_dual_control_attest BOOLEAN NOT NULL,
  attest_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_tra_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_tra_decision_catalog (
  account_id BIGINT NOT NULL,
  source_decision_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  receipt_ref TEXT NOT NULL,
  source_kind tra_source_kind NOT NULL,
  gate_kind tra_gate_kind NOT NULL,
  gate_action tra_gate_action NOT NULL,
  terminal_kind tra_terminal_kind NOT NULL,
  placement_kind tra_placement_kind NOT NULL,
  key_lifecycle tra_key_lifecycle NOT NULL,
  clock_lifecycle tra_clock_lifecycle NOT NULL,
  attested_key_kind tra_attested_key_kind NOT NULL,
  status tra_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_decision_id),
  UNIQUE (account_id, receipt_ref, source_kind),
  CHECK (prior_gate_steward_a <> prior_gate_steward_b),
  CHECK (prior_extension_steward_a <> prior_extension_steward_b),
  CHECK (
    gate_kind <> 'ALLOW_TOOL_READ' OR gate_action = 'TOOL_READ'
  )
);

CREATE TABLE agent_tra_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status tra_session_status NOT NULL,
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
  attest_threshold SMALLINT NOT NULL
    CHECK (attest_threshold BETWEEN 2 AND 8),
  max_decisions_per_certificate SMALLINT NOT NULL
    CHECK (max_decisions_per_certificate BETWEEN 1 AND 256),
  max_nominated_decisions SMALLINT NOT NULL
    CHECK (max_nominated_decisions BETWEEN 1 AND 256),
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
    REFERENCES agent_tra_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_tra_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_tra_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  source_kind tra_source_kind NOT NULL,
  gate_kind tra_gate_kind NOT NULL,
  gate_action tra_gate_action NOT NULL,
  terminal_kind tra_terminal_kind NOT NULL,
  placement_kind tra_placement_kind NOT NULL,
  key_lifecycle tra_key_lifecycle NOT NULL,
  clock_lifecycle tra_clock_lifecycle NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id, source_decision_id, nomination_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tra_session (account_id, session_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_tra_decision_catalog (account_id, source_decision_id),
  CHECK (gate_kind = 'ALLOW_TOOL_READ'),
  CHECK (gate_action = 'TOOL_READ')
);

CREATE TABLE agent_tra_receipt_binding (
  account_id BIGINT NOT NULL,
  receipt_binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  receipt_disposition tra_receipt_disposition NOT NULL,
  effect_observation tra_effect_observation NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_binding_id),
  UNIQUE (account_id, session_id, source_decision_id, provider_receipt_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tra_session (account_id, session_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_tra_decision_catalog (account_id, source_decision_id),
  CHECK (
    (
      silence_inferred = false
      AND receipt_disposition = 'ATTESTED'
      AND effect_observation = 'ACKED'
    ) OR (
      silence_inferred = true
      AND receipt_disposition = 'SILENCE'
      AND effect_observation = 'UNKNOWN_EFFECT'
    ) OR (
      silence_inferred = false
      AND receipt_disposition IN ('UNBOUND', 'REJECTED', 'UNKNOWN_EFFECT')
      AND effect_observation = 'UNKNOWN_EFFECT'
    )
  )
);

CREATE TABLE agent_tra_attest_record (
  account_id BIGINT NOT NULL,
  attest_id UUID NOT NULL,
  session_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  attest_hash CHAR(64) NOT NULL CHECK (length(attest_hash) = 64),
  attested_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, attest_id),
  UNIQUE (account_id, session_id, attest_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tra_session (account_id, session_id),
  CHECK (successor_clock_hash <> prior_clock_hash),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_tra_attest_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  attest_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
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
    REFERENCES agent_tra_session (account_id, session_id),
  FOREIGN KEY (account_id, attest_id)
    REFERENCES agent_tra_attest_record (account_id, attest_id),
  CHECK (receipt_steward_a <> receipt_steward_b),
  CHECK (receipt_steward_a <> prior_gate_steward_a),
  CHECK (receipt_steward_a <> prior_gate_steward_b),
  CHECK (receipt_steward_b <> prior_gate_steward_a),
  CHECK (receipt_steward_b <> prior_gate_steward_b),
  CHECK (receipt_steward_a <> prior_extension_steward_a),
  CHECK (receipt_steward_a <> prior_extension_steward_b),
  CHECK (receipt_steward_b <> prior_extension_steward_a),
  CHECK (receipt_steward_b <> prior_extension_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_tra_attest_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  source_kind tra_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status tra_binding_status NOT NULL,
  placement_kind tra_placement_kind NOT NULL,
  key_lifecycle tra_key_lifecycle NOT NULL,
  clock_lifecycle tra_clock_lifecycle NOT NULL,
  attested_key_kind tra_attested_key_kind NOT NULL,
  terminal_kind tra_terminal_kind NOT NULL,
  gate_kind tra_gate_kind NOT NULL,
  gate_action tra_gate_action NOT NULL,
  attest_kind tra_attest_kind NOT NULL,
  body_visibility tra_body_visibility NOT NULL,
  fact_disposition tra_fact_disposition NOT NULL,
  clock_disposition tra_clock_disposition NOT NULL,
  receipt_disposition tra_receipt_disposition NOT NULL,
  effect_observation tra_effect_observation NOT NULL,
  purpose_relation tra_purpose_relation NOT NULL,
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
  UNIQUE (account_id, certificate_id, source_decision_id, decision_ordinal,
    sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_tra_attest_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tra_session (account_id, session_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_tra_decision_catalog (account_id, source_decision_id)
);

CREATE TABLE agent_tra_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
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
    REFERENCES agent_tra_attest_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, source_decision_id)
    REFERENCES agent_tra_decision_catalog (account_id, source_decision_id)
);

CREATE TABLE agent_tra_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status tra_effect_status NOT NULL,
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
    REFERENCES agent_tra_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_tra_attest_certificate (account_id, certificate_id)
);

CREATE TABLE agent_tra_budget_ledger (
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
    REFERENCES agent_tra_session (account_id, session_id)
);

CREATE TABLE agent_tra_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tra_session (account_id, session_id)
);

CREATE TABLE agent_tra_command_result (
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

CREATE TABLE agent_tra_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_tra_audit_event (
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

CREATE TABLE agent_tra_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_tra_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status tra_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_tra_session (account_id, session_id)
);

CREATE TABLE agent_tra_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_tra_profile()
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
       OR NEW.attest_threshold IS DISTINCT FROM OLD.attest_threshold
       OR NEW.max_decisions_per_certificate
         IS DISTINCT FROM OLD.max_decisions_per_certificate
       OR NEW.max_nominated_decisions IS DISTINCT FROM OLD.max_nominated_decisions
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
    IF current_setting('app.tra_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.tra_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_tra_profile_protect
BEFORE INSERT OR UPDATE ON agent_tra_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_tra_profile();

CREATE FUNCTION protect_agent_tra_profile_attest_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status tra_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_tra_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile attest rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_tra_profile_attest_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_tra_profile_attest_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_tra_profile_attest_rule();

CREATE FUNCTION protect_agent_tra_receipt_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'receipt bindings are append-only';
  END IF;
  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_tra_receipt_binding_protect
BEFORE INSERT OR UPDATE ON agent_tra_receipt_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_tra_receipt_binding();

CREATE FUNCTION protect_agent_tra_attest_certificate()
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
       OR NEW.receipt_steward_a IS DISTINCT FROM OLD.receipt_steward_a
       OR NEW.receipt_steward_b IS DISTINCT FROM OLD.receipt_steward_b
       OR NEW.prior_gate_steward_a IS DISTINCT FROM OLD.prior_gate_steward_a
       OR NEW.prior_gate_steward_b IS DISTINCT FROM OLD.prior_gate_steward_b
       OR NEW.prior_extension_steward_a
         IS DISTINCT FROM OLD.prior_extension_steward_a
       OR NEW.prior_extension_steward_b
         IS DISTINCT FROM OLD.prior_extension_steward_b THEN
      RAISE EXCEPTION 'tool-read receipt certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.receipt_steward_a = NEW.receipt_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct receipt stewards';
  END IF;
  IF NEW.receipt_steward_a = NEW.prior_gate_steward_a
     OR NEW.receipt_steward_a = NEW.prior_gate_steward_b
     OR NEW.receipt_steward_b = NEW.prior_gate_steward_a
     OR NEW.receipt_steward_b = NEW.prior_gate_steward_b
     OR NEW.receipt_steward_a = NEW.prior_extension_steward_a
     OR NEW.receipt_steward_a = NEW.prior_extension_steward_b
     OR NEW.receipt_steward_b = NEW.prior_extension_steward_a
     OR NEW.receipt_steward_b = NEW.prior_extension_steward_b THEN
    RAISE EXCEPTION 'prior-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_tra_attest_certificate_protect
BEFORE INSERT OR UPDATE ON agent_tra_attest_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_tra_attest_certificate();

CREATE FUNCTION protect_agent_tra_attest_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_decision_id IS DISTINCT FROM OLD.source_decision_id
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
       OR NEW.attest_kind IS DISTINCT FROM OLD.attest_kind
       OR NEW.body_visibility IS DISTINCT FROM OLD.body_visibility
       OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
       OR NEW.clock_disposition IS DISTINCT FROM OLD.clock_disposition
       OR NEW.receipt_disposition IS DISTINCT FROM OLD.receipt_disposition
       OR NEW.effect_observation IS DISTINCT FROM OLD.effect_observation
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id
       OR NEW.silence_inferred IS DISTINCT FROM OLD.silence_inferred
       OR NEW.opens_nested_expiry IS DISTINCT FROM OLD.opens_nested_expiry THEN
      RAISE EXCEPTION 'attest decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'receipt-as-trust fence blocks rewriting a re-armed clock as enrolled trust';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'receipt-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'halt-read fence blocks exposing a disputed fact body';
  END IF;

  IF NEW.gate_action = 'TOOL_MUTATE' THEN
    RAISE EXCEPTION 'tool-mutate fence blocks mutation from a tool-read receipt';
  END IF;

  IF NEW.effect_observation = 'ACKED'
     AND (
       NEW.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR NEW.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-success fence blocks ACKED without an attested receipt';
  END IF;

  IF NEW.provider_receipt_hash IS NOT DISTINCT FROM NEW.disputed_fact_hash THEN
    RAISE EXCEPTION 'receipt-as-fact fence blocks using the disputed fact hash as a receipt';
  END IF;

  IF NEW.key_lifecycle = 'FIRST_ENROLLMENT'
     AND NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'first-enrollment-auto-trust fence blocks TRUSTED_ENROLLED from a receipt';
  END IF;

  IF NEW.attested_key_kind = 'INVENTED_HISTORY' THEN
    RAISE EXCEPTION 'invented-history fence blocks a receipt for invented successor history';
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

  IF NEW.clock_disposition = 'REARMED'
     AND NEW.successor_clock_hash IS NOT DISTINCT FROM NEW.prior_clock_hash THEN
    RAISE EXCEPTION 'clock-rearm fence requires a distinct successor clock hash';
  END IF;

  IF NEW.attest_kind = 'ATTEST_TOOL_READ'
     AND NEW.hop_count > 0
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose reads after attenuation hops';
  END IF;

  IF NEW.attest_kind = 'ATTEST_TOOL_READ'
     AND (
       NEW.gate_kind IS DISTINCT FROM 'ALLOW_TOOL_READ'
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
    RAISE EXCEPTION 'tool-read receipt fence requires a non-silent receipt on a held citation';
  END IF;

  IF NEW.attest_kind = 'HOLD_UNKNOWN_EFFECT'
     AND NEW.effect_observation IS DISTINCT FROM 'UNKNOWN_EFFECT' THEN
    RAISE EXCEPTION 'unknown-effect fence blocks HOLD_UNKNOWN_EFFECT with a success observation';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_tra_attest_decision_protect
BEFORE INSERT OR UPDATE ON agent_tra_attest_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_tra_attest_decision();

CREATE FUNCTION protect_agent_tra_effect_intent()
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

CREATE TRIGGER agent_tra_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_tra_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_tra_effect_intent();

CREATE FUNCTION approve_agent_tra_profile(
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
  stored_status tra_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_tra_profile
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
  FROM agent_tra_profile_attest_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_attest IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control attest rule';
  END IF;

  PERFORM set_config(
    'app.tra_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_tra_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_tra_profile(
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
  stored_status tra_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_tra_profile
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
    'app.tra_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_tra_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_tra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_tra_profile_authority;
ALTER FUNCTION revoke_agent_tra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_tra_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_tra_profile_authority;
GRANT SELECT ON
  agent_tra_profile,
  agent_tra_profile_attest_rule
TO agent_tra_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_tra_profile TO agent_tra_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_tra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_tra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_tra_profile FROM PUBLIC;

CREATE INDEX agent_tra_session_work_idx ON agent_tra_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_tra_session_profile_idx ON agent_tra_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_tra_decision_certificate_idx ON agent_tra_attest_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_tra_decision_source_idx ON agent_tra_attest_decision (
  account_id, source_decision_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_tra_catalog_ref_idx ON agent_tra_decision_catalog (
  account_id, receipt_ref, sealed_at DESC, source_decision_id
);
CREATE INDEX agent_tra_catalog_kind_idx ON agent_tra_decision_catalog (
  account_id, source_kind, sealed_at DESC, source_decision_id
);
CREATE INDEX agent_tra_record_session_idx ON agent_tra_attest_record (
  account_id, session_id, attested_at DESC, attest_id
);
CREATE INDEX agent_tra_certificate_session_idx ON agent_tra_attest_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_tra_binding_session_idx ON agent_tra_receipt_binding (
  account_id, session_id, captured_at DESC, receipt_binding_id
);
CREATE INDEX agent_tra_effect_work_idx ON agent_tra_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_tra_audit_time_idx ON agent_tra_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_tra_perception_status_idx ON agent_tra_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_tra_command_expiry_idx ON agent_tra_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_tra_invalidation_certificate_idx ON agent_tra_invalidation (
  account_id, certificate_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_tra_authorization_evidence',
    'agent_tra_profile',
    'agent_tra_profile_attest_rule',
    'agent_tra_decision_catalog',
    'agent_tra_session',
    'agent_tra_nomination',
    'agent_tra_receipt_binding',
    'agent_tra_attest_record',
    'agent_tra_attest_certificate',
    'agent_tra_attest_decision',
    'agent_tra_invalidation',
    'agent_tra_effect_intent',
    'agent_tra_budget_ledger',
    'agent_tra_terminal_record',
    'agent_tra_command_result',
    'agent_tra_audit_head',
    'agent_tra_audit_event',
    'agent_tra_audit_anchor',
    'agent_tra_perception_snapshot',
    'agent_tra_projection_checkpoint'
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

All functionality is available through the monday.com Open
API. Long-running notify work returns durable state, not a
synchronous board promise. Profile search discovers
procedural memory. It does not authorize an attestation.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentTraSessionStatus {
  OPEN
  NOMINATING
  ATTESTING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentTraAttestKind {
  ATTEST_TOOL_READ
  HOLD_UNKNOWN_EFFECT
  DENY_SILENCE_SUCCESS
  DENY_RECEIPT_RESTORE
  DENY_RECEIPT_AS_TRUST
  SKIP
  UNKNOWN_EFFECT
}

enum AgentTraEffectObservation {
  ACKED
  FAILED
  DISPATCHED
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentTraEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentTraNextAction {
  NOMINATE_TOOL_READ_DECISION
  BIND_PROVIDER_RECEIPT
  EVALUATE_TOOL_READ_RECEIPT
  SEAL_TOOL_READ_RECEIPT_CERTIFICATE
  INVALIDATE_TOOL_READ_RECEIPT
  PREPARE_TOOL_READ_RECEIPT_EFFECT
  TOOL_READ_RECEIPT_EFFECT_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentTraBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  BUDGET_EXHAUSTED
  DECISION_MISSING
  SILENCE_SUCCESS_DENIED
  RECEIPT_AS_TRUST_DENIED
  RECEIPT_AS_RESTORE_DENIED
  TOOL_MUTATE_DENIED
  NESTED_EXPIRY_DENIED
  LEDGER_SCAN_DENIED
  UNKNOWN_EFFECT
}

type AgentTraProfile {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  attestThreshold: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentTraSession {
  accountId: Long!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentTraSessionStatus!
  stateRevision: Long!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentTraCatalogEntry {
  accountId: Long!
  sourceDecisionId: ID!
  gateKind: String!
  gateAction: String!
  disputedFactHash: SHA256!
  successorClockHash: SHA256!
  status: String!
}

type AgentTraCertificate {
  accountId: Long!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  attestKind: AgentTraAttestKind!
  effectObservation: AgentTraEffectObservation!
  sealedAt: DateTime!
}

type AgentTraPerception {
  accountId: Long!
  sessionId: ID!
  status: AgentTraSessionStatus!
  summary: String!
  attestedReceiptCount: Int!
  unknownEffectCount: Int!
  silenceDeniedCount: Int!
  allowedNextActions: [AgentTraNextAction!]!
  blockedReasons: [AgentTraBlockedReason!]!
  cardHash: SHA256!
}

type AgentTraAuditHead {
  accountId: Long!
  headSequence: Long!
  headHash: SHA256!
  updatedAt: DateTime!
}

type AgentTraResult {
  decision: String!
  retryable: Boolean!
  reason: String!
  session: AgentTraSession
  certificate: AgentTraCertificate
  perception: AgentTraPerception
  auditHash: SHA256!
}

input AgentTraBudgetInput {
  nominateUnits: Int!
  bindUnits: Int!
  sealUnits: Int!
  vectorUnits: Int!
  invalidateUnits: Int!
  notifyUnits: Int!
  maxWallTimeMs: Int!
  attestThreshold: Int!
  maxDecisionsPerCertificate: Int!
  maxNominatedDecisions: Int!
}

input CreateToolReadAttestationSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentTraBudgetInput!
}

input NominateAllowToolReadDecisionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  sourceDecisionId: ID!
  expectedDisputedFactHash: SHA256!
  expectedSuccessorClockHash: SHA256!
  idempotencyKey: String!
}

input BindProviderReceiptCandidateInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  sourceDecisionId: ID!
  providerReceiptHash: SHA256
  silenceInferred: Boolean!
  idempotencyKey: String!
}

input EvaluateToolReadReceiptInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  expectedProviderReceiptHash: SHA256
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealToolReadReceiptCertificateInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  attestId: ID!
  consumerRef: String!
  receiptStewardA: String!
  receiptStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input InvalidateToolReadReceiptInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  sourceDecisionId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input PrepareToolReadReceiptEffectInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input RecordToolReadEffectUncertaintyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: String!
  idempotencyKey: String!
}

input CloseToolReadAttestationSessionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input PublishToolReadPerceptionCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

type Query {
  toolReadAttestationProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentTraProfile
  toolReadAttestationSession(accountId: Long!, sessionId: ID!): AgentTraSession
  toolReadDecisionCatalogEntry(accountId: Long!, sourceDecisionId: ID!): AgentTraCatalogEntry
  toolReadReceiptCertificate(accountId: Long!, certificateId: ID!): AgentTraCertificate
  toolReadAttestationPerception(accountId: Long!, sessionId: ID!): AgentTraPerception
  toolReadAttestationAuditReplay(accountId: Long!, sessionId: ID!): AgentTraAuditHead
}

type Mutation {
  createToolReadAttestationSession(input: CreateToolReadAttestationSessionInput!): AgentTraResult!
  nominateAllowToolReadDecision(input: NominateAllowToolReadDecisionInput!): AgentTraResult!
  bindProviderReceiptCandidate(input: BindProviderReceiptCandidateInput!): AgentTraResult!
  evaluateToolReadReceipt(input: EvaluateToolReadReceiptInput!): AgentTraResult!
  sealToolReadReceiptCertificate(input: SealToolReadReceiptCertificateInput!): AgentTraResult!
  invalidateToolReadReceipt(input: InvalidateToolReadReceiptInput!): AgentTraResult!
  prepareToolReadReceiptEffect(input: PrepareToolReadReceiptEffectInput!): AgentTraResult!
  recordToolReadEffectUncertainty(input: RecordToolReadEffectUncertaintyInput!): AgentTraResult!
  closeToolReadAttestationSession(input: CloseToolReadAttestationSessionInput!): AgentTraResult!
  publishToolReadPerceptionCard(input: PublishToolReadPerceptionCardInput!): AgentTraResult!
}
```

### GraphQL limits

Resolvers require `accountId` and reject missing tenant
scope. Catalog and certificate reads are primary-key point
lookups. Perception and audit reads are bounded by
`sessionId`. There is no list-all-receipts field. A client
that asks for every tool call on a board is **FULL SCAN
REJECTED** before execution.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `attest_instruction` records that silence is never
success, a receipt never restores a fact, and a re-armed
clock is never trust. `procedureRef` points at that
profile version. Agents do not store a second hidden
policy. If the profile is revoked with `STOP_BEFORE_ATTEST`,
new nominations stop. In-flight certificates remain
replayable.

Semantic tags (`incident`, `tool-read-receipt`) are for
discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_tra_profile_embedding (
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
    REFERENCES agent_tra_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_tra_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tra_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_tra_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped decision-catalog or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates by primary key, and seals under
dual control. Similarity never attests a receipt.

## 12. Agent perception

Agents receive perception cards summarizing session status,
attested-receipt, unknown-effect, silence-denied,
disputed-held, restore-denied, trust-denied,
quarantine-omitted, skipped, and invalidated counts,
uncertain notify intents, remaining budgets, procedure
tags, allowed next actions, and blocked reasons. Summary
text is `UntrustedText`. Cards expose the provider receipt
hash and the disputed-fact hash as separate metadata. They
never embed raw private keys, tool payloads, fact bodies,
or a winning fact hash. `cardHash` makes perception
replayable.

An LLM should read the card as: "a tool-read was allowed,
and either a receipt hash is attested or the effect is
still `UNKNOWN_EFFECT`." It should not read the card as
"the disputed fact is now true" or "the signing key is
`TRUSTED_ENROLLED`."

## 13. ACID and consistency

### Row store

Nomination, binding, evaluation, and seal commit or roll
back together. Compare-and-swap on `state_revision` rejects
lost updates. Certificate identity is immutable.

### Columnar store

Analytical counts of attest kinds and effect observations
are derived from the row store by `account_id`. They lag
the seal watermark and cannot authorize a new attestation.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but approval status is re-read from the row
store before a session opens.

### External tools

Tool providers and notify providers are not in the local
transaction. Silence, timeout, and ambiguous HTTP responses
stay `UNKNOWN_EFFECT`. A later receipt may be bound by a
new append-only row. It does not rewrite history.

## 14. Guardrails and neighbor protection

Budgets cap nominate, bind, seal, vector, invalidate, and
notify units. Wall-clock is bounded. Attest threshold is at
least two distinct stewards. Hop count is at most 8.
Decisions per certificate are at most 256.

Recursive agent loops that re-query "all receipts for this
board" without `account_id` plus a decision or session key
are **FULL SCAN REJECTED**. Vector topK without
`account_id` is rejected. A session cannot spend another
tenant's budget.

These fences protect the 99.99% availability target:
one agent's uncertainty cannot become a neighbor's
table scan.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

The following plans are **FULL SCAN REJECTED**:

- decision catalog filter on receipt text, purpose, or
  provider payload without `account_id` and
  `source_decision_id`;
- attest decision filter on `effect_observation` alone;
- JSON containment on `card_body` or `attest_instruction`
  across accounts;
- unbounded topK on `agent_tra_profile_embedding`;
- joining attestations to board items by scanning every
  item to see whether a tool "finished."

### Required access paths

Every hot path starts with `account_id`, then a session,
decision, certificate, or profile key. Partial indexes
cover in-flight notify work (`PREPARED`, `DISPATCHED`,
`UNKNOWN_EFFECT`) without reading sealed history.

### Planner enforcement

The governor checks estimated rows and required predicates
before execution. Missing `account_id` or a point-lookup
key fails the statement. The engine does not sample the
board to answer a receipt question.

## 16. Auditability and replay

Each command appends an audit event with `payload_hash`,
`prev_hash`, and `event_hash`. Anchors store a Merkle root
over a sequence range. Replay reconstructs nomination,
binding, seal, invalidation, and notify uncertainty from
hashes. Replay does not call an embedding model and does
not invent a receipt that was not bound.

Perception snapshots store `card_hash` so a later agent
sees the same uncertainty the sealing transaction
published.

## 17. Threat and failure analysis

| Threat | Fence |
| --- | --- |
| Silence treated as tool success | `ACKED` requires `ATTESTED` and `silence_inferred = false` |
| Receipt rewrites the key to trust | `TRUSTED_ENROLLED` rejected |
| Receipt restores the disputed fact | `RESTORED` and `BODY_VISIBLE` rejected |
| Receipt hash is the fact hash | hashes must differ |
| Same steward gates and attests | prior gate and extension stewards excluded |
| Envelope read attested as a tool receipt | `ATTEST_TOOL_READ` requires `ALLOW_TOOL_READ` |
| Tool mutation | `TOOL_MUTATE` rejected |
| Nested expiry loop | `opens_nested_expiry` rejected |
| Cross-tenant vector hit | `account_id` predicate and forced RLS |
| Ledger walk on 1M+ rows | **FULL SCAN REJECTED** |
| Notify ack launders tool success | notify status does not update `effect_observation` |

Failure of the external tool leaves `UNKNOWN_EFFECT`. The
session can close, retry the same decision under a new
idempotency key, or require a human. It cannot mark the
fact restored.

## 18. Observability and SLOs

Track, per `account_id`:

- attest seal latency against the session budget;
- fraction of decisions that remain `UNKNOWN_EFFECT`;
- silence-success rejections;
- receipt-as-trust and receipt-as-restore rejections;
- full-scan rejections;
- notify intents stuck in `PREPARED` or `DISPATCHED`.

The availability objective remains 99.99% for neighbor
queries. Attestation uncertainty is a correct outcome, not
an error budget burn. A rise in full-scan rejections is a
client bug. A rise in silence-success rejections is a
client trying to launder uncertainty.

## 19. Rollout

### Phase 1: shadow gates

Write attestation decisions in shadow mode. Compare them
to what agents would have inferred from silence. Do not
change tool authorization.

### Phase 2: deny-only

Enforce silence-success, receipt-as-trust, receipt-as-
restore, and full-scan rejections. Do not yet return
`ATTEST_TOOL_READ` to agents.

### Phase 3: attested receipts with facts held

Return sealed `ATTEST_TOOL_READ` certificates. Facts stay
`DISPUTED_HELD`. Keys stay `AWAITING_CONFIRMATION`.

### Phase 4: notify uncertainty

Dispatch notify intents. Surface `UNKNOWN_EFFECT` on the
perception card when the notifier does not acknowledge.

### Phase 5: broad availability

Enable account-partitioned HNSW profile discovery. Keep
point-lookup nomination. Do not open a nested expiry
plane.

## 20. Ship criteria

### Contract validation

`npm run validate` typechecks the TypeScript contracts,
builds the GraphQL schema (6 queries, 10 mutations), and
executes the SQL on PGlite with pgvector.

### Behavioral validation

The fixture seals one `ATTEST_TOOL_READ` decision and
rejects:

- duplicate session idempotency keys;
- mutation of a sealed attest rule;
- insertion of a pre-approved profile;
- mutation of attest-decision identity;
- direct profile revocation;
- a non-`PREPARED` effect intent;
- mutation of prepared effect identity;
- mutation of a sealed profile definition;
- `TRUSTED_ENROLLED` (receipt-as-trust);
- `RESTORED` / `BODY_VISIBLE` (receipt-as-restore).

### Scale and failure validation

Explain plans for catalog and certificate reads stay on
`account_id` leading indexes at 1M+ catalog rows. A query
without that prefix is **FULL SCAN REJECTED**. Killing the
notify provider leaves the intent `UNKNOWN_EFFECT` and
leaves the disputed fact hash unchanged.

## 21. Product decision

Ship the Tool-Read Receipt Attestation Plane as the
deterministic binder between a sealed `ALLOW_TOOL_READ`
decision and a provider receipt.

Choose effect honesty over receipt fluency. An attested
receipt proves a provider hash was bound under dual
control. It does not prove the disputed fact, it does not
enroll the key, and it does not show the body. Silence
remains `UNKNOWN_EFFECT`.

The following increment should let a downstream session
consume a sealed attestation certificate by point lookup
into a perception card. That card may cite the receipt
hash and the effect observation. It must not restore the
disputed fact, must not treat `ACKED` as `TRUSTED_ENROLLED`,
and must not open another nested expiry-containment-review-
resolution plane.
