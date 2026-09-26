# mondayDB Agentic Perception Context Packet Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-09-26.v1`

## 1. Why this plane, before how

The 2026-09-25 Attestation Perception Card Plane can seal a
card that cites `provider_receipt_hash` and
`effect_observation` by point lookup of
`(account_id, source_certificate_id)`. `ACKED` on that card
is an effect observation. The disputed fact stays
`DISPUTED_HELD`. The key stays `AWAITING_CONFIRMATION`.

An agent context compiler still cannot carry that card.
Without a context-packet plane the compiler either:

- inlines the disputed fact body and reads `ACKED` as
  `TRUSTED_ENROLLED` (a citation becomes a prompt truth), or
- scans perception snapshots, vote ledgers, and board rows
  looking for "which card belongs in this prompt"
  (neighbor-harmful on boards with 1M+ rows).

The product trade-off is **context fluency versus citation
integrity**:

- Inlining the fact body, or promoting `ACKED` to
  `TRUSTED_ENROLLED` inside the packet, maximizes prompt
  fluency and hides the hold.
- Compiling one context packet by point lookup of
  `(account_id, snapshot_id)` adds one bounded compile
  transaction. The packet may repeat the receipt hash and
  the effect observation as `UNTRUSTED_METADATA`. When the
  card is invalidated, the live citation becomes `DROPPED`.
  The disputed fact stays `DISPUTED_HELD`. Silence stays
  `UNKNOWN_EFFECT`.
- Semantic similarity may discover compilation profiles,
  but it must never decide whether a snapshot may be
  nominated, metadata bound, a packet evaluated, a packet
  sealed, a citation dropped, or a consumer notified.

Latency stays on the primary key. Consistency is the sealed
packet row inside one ACID transaction, not an eventually
consistent guess. Neighbor availability stays at the 99.99%
target because an unscoped lookup is **FULL SCAN REJECTED**
before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved compilation profile is procedural memory for
   "how one sealed perception card may be attached to a
   context packet." A profile **never** inlines a fact body
   and **never** rewrites `ACKED` as `TRUSTED_ENROLLED`.
2. A session opens under purpose, budget, and authorization
   fences, and nominates exactly one sealed perception card
   by point lookup of `(account_id, snapshot_id)`. Hashes
   are copied from the snapshot catalog. They are never
   computed by walking ledgers.
3. mondayDB evaluates a compile whose outcome is a pure
   function of `(source_kind, access_path, gate_kind,
   gate_action, terminal_kind, placement_kind,
   key_lifecycle, clock_lifecycle, attested_key_kind,
   perceive_kind, compile_kind, body_visibility,
   fact_disposition, clock_disposition, receipt_disposition,
   effect_observation, purpose_relation, citation_state,
   metadata_trust, silence_inferred, inlines_fact_body,
   hop_count)`. `ACKED` cannot become trust. `RESTORED`
   cannot be written. A body cannot be inlined.
4. Sealing binds `consumer_ref + purpose_hash +
   prior_clock_hash + successor_clock_hash +
   disputed_fact_hash + provider_receipt_hash +
   halt_scope_hash + attenuation_hash + decision_set_hash +
   compiler_steward_a + compiler_steward_b`. The packet
   **must not** emit a fact body and **must not** emit
   `TRUSTED_ENROLLED`.
5. Upstream invalidation of the snapshot drops the live
   citation. Notify intents may become `UNKNOWN_EFFECT`
   until acknowledged. A notify acknowledgement is not a
   new tool receipt, not enrollment, and not a fact restore.
6. Unscoped snapshot-catalog, vote-ledger, page-ledger,
   ack-ledger, escalation-ledger, containment-ledger,
   review-ledger, resolution-ledger, promotion-ledger,
   working-set, grant-graph, or board scans are
   **FULL SCAN REJECTED**.

### Product outcome

For any perception context packet, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, metadata bind, evaluation, seal, citation
  drop, or notify dispatch?
- Which sealed perception card was read by primary key
  `(account_id, snapshot_id)`, and which receipt hash and
  effect observation were repeated as untrusted metadata?
- Did `ACKED` stay an effect observation while the disputed
  fact stayed held, the body stayed envelope-only, and the
  key stayed unconfirmed?
- Was the live citation dropped when that card was
  invalidated, without inlining the fact?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the packet history be replayed without invoking an LLM?

## 2. Scope and ownership

The Perception Context Packet Plane owns:

1. Immutable approved compilation profiles as procedural
   memory of "how one sealed perception card may be
   attached without inlining a disputed fact, treating
   `ACKED` as `TRUSTED_ENROLLED`, amplifying purpose,
   leaking a halted or quarantined body, scanning
   governance ledgers, or opening another nested expiry."
2. Tenant-scoped compile sessions with purpose and budget
   fences, and a hard cap of one nominated snapshot and one
   packet per session.
3. Deterministic nomination of sealed perception cards by
   point lookup of `(account_id, snapshot_id)`.
4. Deterministic untrusted metadata bindings, compile
   records, sealed packets, and immutable decisions that
   never invent a winner.
5. Citation drops when the source card is invalidated, plus
   notify intents with honest uncertainty.
6. Agent perception of the packet, audit replay, and
   bounded compile budgets.

It integrates with, but does not replace:

- **Attestation Perception Card Plane:** supplies the sealed
  snapshot this plane may nominate. This plane never
  re-perceives the receipt and never rewrites the card.
- **Tool-Read Receipt Attestation Plane:** the cited receipt
  hash is copied. This plane never re-binds a provider
  receipt.
- **Extended Working-Set Purpose Gate Plane:** the cited
  gate kind is copied. This plane never authorizes
  `TOOL_MUTATE` or a body read.
- **SLA Extension Certificate Plane:** the successor clock
  is copied. This plane never re-arms a clock and never
  treats a re-armed clock as `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  vector, seal, drop, and notify units.

### Non-goals

- Letting an LLM decide that `ACKED` "probably means the
  fact is true."
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative packets from columnar or
  vector projections.
- Cross-account compilation or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, or fact bodies
  on the packet.
- Claiming distributed atomicity with external notify
  providers.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because a packet repeated an attested receipt.
- Keeping a live citation after the source card is
  invalidated.
- Scanning vote, TTL, page, ack, escalation, review,
  resolution, or containment ledgers to compile a packet.
- Opening another nested expiry-containment-review-
  resolution plane from a context packet.
- Attaching more than one perception card to a packet.
- Showing a `PERMANENT_QUARANTINE` body or restoring a
  disputed fact because the packet was compiled.

## 3. Product contract

### 3.1 Compilation profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_PERCEPTION_CARD`,
  `SEALED_ATTEST_CERT`, `SEALED_TOOL_READ_DECISION`,
  `SEALED_PROVIDER_RECEIPT`, `SEALED_EFFECT_INTENT`);
- compile threshold (distinct compiler-steward principals,
  minimum 2), max packets per session (exactly 1), and max
  nominated snapshots (exactly 1);
- compile policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `PACKET_NEVER_RESTORES_FACTS`,
  `PACKET_NEVER_INLINES_BODY`, `PACKET_NEVER_CONFIRMS`,
  `ONE_CARD_PER_PACKET`, `DROP_ON_INVALIDATION`,
  `POINT_LOOKUP_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `LEDGER_NEVER_SCANNED`, `HALT_DENIES_BODY_READ`,
  `QUARANTINE_BODY_NEVER_VISIBLE`,
  `PRIOR_PERCEPTION_STEWARDS_EXCLUDED`,
  `PRIOR_RECEIPT_STEWARDS_EXCLUDED`,
  `PRIOR_GATE_STEWARDS_EXCLUDED`,
  `PRIOR_EXTENSION_STEWARDS_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_COMPILE`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_TOOL_READ_DECISION` (24 bytes). The longest
compile kind is `DENY_PACKET_AS_RESTORE` (22 bytes).

Approval and revocation require the authority fence
`approve_agent_cpc_profile` / `revoke_agent_cpc_profile`.
Direct `UPDATE` of a sealed profile or its compile rules
is rejected. Profiles must be inserted as `DRAFT`.

### 3.2 Session and budget contract

A session is scoped by `account_id` and an idempotency key.
Budgets cover nominate, bind, seal, vector, drop, and
notify units, plus wall-clock, compile threshold, max
packets, and max nominated snapshots. Consumed units cannot
exceed the budget. Deadline must be after creation.
Evaluation consumes bind units. Sealing consumes seal
units. Dropping a citation consumes drop units.
`max_packets_per_session` and `max_nominated_snapshots`
are both fixed at 1.

### 3.3 Nomination and metadata contract

Nomination is a point lookup of `(account_id, snapshot_id)`
in the snapshot catalog. `nominate_agent_cpc_snapshot`
reads that primary key and copies the receipt hash and the
effect observation. It does not store a fact body.
`access_path` on the nomination is `POINT_LOOKUP`.
`LEDGER_SCAN` is rejected. A null snapshot id is
**FULL SCAN REJECTED**.

A metadata binding is append-only. It may repeat the
receipt hash and the effect observation already on the
catalog row, tagged `UNTRUSTED_METADATA`. It never walks a
ledger, never inlines a body, and never moves the clock.

### 3.4 Packet and compile-decision contract

A sealed packet certificate names two distinct compiler
stewards, both perception stewards, both receipt stewards,
both prior gate stewards, and both prior extension
stewards. A compiler steward who matches a perception
steward, a receipt steward, a gate steward, or an extension
steward is rejected. A compile decision records:

- `compile_kind`: `ATTACH_SEALED_CARD` is the only attach
  success; `DROP_INVALIDATED_CARD` records a drop;
  `HOLD_UNKNOWN_EFFECT`, `DENY_PACKET_AS_TRUST`,
  `DENY_PACKET_AS_RESTORE`, `DENY_BODY_INLINE`,
  `DENY_ACK_AS_TRUST`, `SKIP`, and `UNKNOWN_EFFECT` never
  attach a body;
- `citation_state`: `ATTACHED` only while the source
  snapshot is `SEALED`; `DROPPED` after invalidation;
- `metadata_trust`: `UNTRUSTED_METADATA` only;
- `fact_disposition`: `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED` (never `RESTORED`);
- `body_visibility`: `ENVELOPE_ONLY` or `OMITTED` (never
  `BODY_VISIBLE`);
- `clock_disposition`: `REARMED` is required for
  `ATTACH_SEALED_CARD`, and the successor clock hash must
  differ from the prior clock hash;
- `receipt_disposition`: `ATTESTED` is required when the
  cited effect is `ACKED`;
- `effect_observation`: the only success citation is
  `ACKED`, and it stays an observation;
- `attested_key_kind`: must not be `TRUSTED_ENROLLED` or
  `TRUSTED_WITHIN_SKEW`;
- `access_path`: `POINT_LOOKUP` (never `LEDGER_SCAN`);
- `opens_nested_expiry`: must be false;
- `inlines_fact_body`: must be false;
- `provider_receipt_hash`: must differ from
  `disputed_fact_hash`.

There is no fact-body column and no `resolved_fact_hash`
column. `ATTACH_SEALED_CARD` requires
`SEALED_PERCEPTION_CARD`, `POINT_LOOKUP`,
`PERCEIVE_ATTESTED_RECEIPT`, `ALLOW_TOOL_READ`,
`TOOL_READ`, `ENVELOPE_ONLY`, `DISPUTED_HELD`,
`EXTENDED_HALT`, `REQUIRE_HUMAN`, `NARROWS`,
`AWAITING_CONFIRMATION`, `UNTRUSTED_METADATA`, `ATTACHED`,
and a non-silent `ACKED` receipt whose hash differs from
the disputed fact hash. The source snapshot must still be
`SEALED`.

The context packet is what an agent reads. It stores the
effect observation, the receipt hash, and the disputed-fact
hash as separate untrusted metadata. `packet_body` must not
contain `factBody`, `fact_body`, or `resolvedFactHash`.
The live `citation_state` column is authoritative. A sealed
`packet_body` is not rewritten when the citation drops.

### 3.5 Notify and drop contract

Notify intents start as `PREPARED`. Identity columns are
immutable after insert. A missing or ambiguous provider
response is `UNKNOWN_EFFECT`. `ACKED` on a notify intent
means the notifier accepted the packet notice. It does not
rewrite `effect_observation`, restore a fact, or reattach
a dropped citation.

`drop_agent_cpc_citation` is the only writer that moves
`citation_state` from `ATTACHED` to `DROPPED`. It requires
the snapshot catalog row to be `INVALIDATED`. A drop does
not delete the historical receipt hash. It removes the live
citation so a later compile must not treat the card as
attached.

## 4. Deterministic invariants

1. Every row and every access index leads with
   `account_id`.
2. Profiles enter as `DRAFT` and leave `DRAFT` only through
   the approval or revocation authority fence.
3. Compiler stewards are distinct from each other, from
   both perception stewards, from both receipt stewards,
   from both prior gate stewards, and from both prior
   extension stewards.
4. A session nominates at most one snapshot and seals at
   most one packet.
5. `ACKED` on a compile decision requires
   `receipt_disposition = ATTESTED` and
   `silence_inferred = false`. `ACKED` does not write
   `TRUSTED_ENROLLED`.
6. `TRUSTED_ENROLLED` and `TRUSTED_WITHIN_SKEW` are
   rejected on the decision and on the packet.
7. `RESTORED` and `BODY_VISIBLE` are rejected. A packet is
   not a fact restore.
8. `inlines_fact_body` is false. `packet_body` cannot carry
   a fact body.
9. `TOOL_MUTATE` is rejected. `LEDGER_SCAN` is rejected.
10. `opens_nested_expiry` must be false.
11. Purpose `AMPLIFIES` is rejected. After a hop, the
    requested purpose hash must differ from the donor
    purpose hash.
12. The provider receipt hash must differ from the disputed
    fact hash.
13. `ATTACHED` is legal only while the source snapshot is
    `SEALED`. Invalidation drops the citation to `DROPPED`.
14. Metadata trust is `UNTRUSTED_METADATA`.
15. Unscoped catalog or board access is **FULL SCAN
    REJECTED**.

## 5. Execution model

Open, nominate, bind, evaluate, seal, drop, and
effect-prepare each run in one ACID row-store transaction
with session compare-and-swap. Packet seal never joins a
neighbor board write, never updates the disputed fact, and
never rewrites the successor clock or the attested key.

Columnar synopses may count attached, dropped, unknown, and
denied packets for an account. They are not authoritative.
Vector search discovers profile tags inside an
account-owned partition. It never returns a fact body and
never authorizes seal.

External notify providers are outside the ACID boundary.
Until a notify receipt is bound, the notify observation
remains `UNKNOWN_EFFECT`. That uncertainty does not change
the cited tool-read effect and does not reattach a dropped
citation.

## 6. Lifecycle

### 6.1 Draft and approve

A steward inserts a `DRAFT` profile and at least one
dual-control compile rule. Approval checks the definition
hash and rule count, then sets `APPROVED` through
`approve_agent_cpc_profile`.

### 6.2 Open and nominate

A session opens under an approved profile. Nomination
calls `nominate_agent_cpc_snapshot`, which copies one
catalog row by primary key `(account_id, snapshot_id)`.
It does not filter the catalog by similarity and it does
not scan boards.

### 6.3 Bind and evaluate

Bind appends an untrusted metadata candidate. Evaluate
emits a compile decision. Silence evaluates to
`HOLD_UNKNOWN_EFFECT` or `DENY_ACK_AS_TRUST`, never to
`ATTACH_SEALED_CARD`. An invalidated snapshot cannot be
attached.

### 6.4 Seal

Seal writes the packet certificate, the decision, and the
context packet in the same transaction. Stewards who
perceived the card, attested the receipt, gated the
citation, or extended the clock cannot compile the packet.

### 6.5 Drop and notify

When the source snapshot becomes `INVALIDATED`,
`drop_agent_cpc_citation` appends a drop reason
(`CARD_INVALIDATED`, `RETRACTED`, `QUARANTINED`,
`KEY_REVOKED`) and sets the live citation to `DROPPED`.
Notify is prepared, then dispatched. Ambiguity becomes
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

Close is explicit. Audit events stay hash-chained. Profile
embeddings may be refreshed from the approved definition.
They are not a second source of authorization. A dropped
citation remains replayable and is not a live attachment.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SnapshotId = string & { readonly brand: "SnapshotId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type PacketId = string & { readonly brand: "PacketId" };
type MetadataBindingId = string & { readonly brand: "MetadataBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_SEALED_PERCEPTION_CARD"
  | "BIND_UNTRUSTED_METADATA"
  | "EVALUATE_CONTEXT_PACKET"
  | "SEAL_CONTEXT_PACKET"
  | "DROP_INVALIDATED_CITATION"
  | "PREPARE_PACKET_NOTIFY"
  | "PACKET_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type ContextPacketBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "SNAPSHOT_MISSING"
  | "METADATA_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "PACKET_AS_TRUST_DENIED"
  | "SILENCE_AS_ACK_DENIED"
  | "PACKET_AS_CONFIRMATION_DENIED"
  | "PACKET_AS_RESTORE_DENIED"
  | "BODY_INLINE_DENIED"
  | "HALT_READ_DENIED"
  | "TOOL_MUTATE_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "LEDGER_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "PACKET_AS_FACT_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
  | "CITATION_DROPPED"
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

type SourceKind =
  | "SEALED_PERCEPTION_CARD"
  | "SEALED_ATTEST_CERT"
  | "SEALED_TOOL_READ_DECISION"
  | "SEALED_PROVIDER_RECEIPT"
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

type CompileKind =
  | "ATTACH_SEALED_CARD"
  | "DROP_INVALIDATED_CARD"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_PACKET_AS_TRUST"
  | "DENY_PACKET_AS_RESTORE"
  | "DENY_BODY_INLINE"
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

type CitationState = "ATTACHED" | "DROPPED" | "HELD" | "UNKNOWN_EFFECT";

type MetadataTrust = "UNTRUSTED_METADATA";

type EffectIntentStatus = "PREPARED" | "DISPATCHED" | "ACKED" | "FAILED" | "UNKNOWN_EFFECT";

interface ContextPacketBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly dropUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly compileThreshold: number;
  readonly maxPacketsPerSession: 1;
  readonly maxNominatedSnapshots: 1;
}

interface ContextCompilationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly compileThreshold: number;
  readonly maxPacketsPerSession: 1;
  readonly maxNominatedSnapshots: 1;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface ContextPacketSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: ContextPacketBudget;
  readonly consumed: Omit<
    ContextPacketBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxPacketsPerSession" | "maxNominatedSnapshots"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface PerceptionCardNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly snapshotId: SnapshotId;
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

interface UntrustedMetadataBinding {
  readonly accountId: AccountId;
  readonly metadataBindingId: MetadataBindingId;
  readonly sessionId: SessionId;
  readonly snapshotId: SnapshotId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly metadataTrust: MetadataTrust;
  readonly inlinesFactBody: false;
  readonly capturedAt: Timestamp;
}

interface ContextCompileRecord {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly snapshotId: SnapshotId;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly compileHash: Sha256;
  readonly compiledAt: Timestamp;
}

interface ContextPacketDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly snapshotId: SnapshotId;
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
  readonly compileKind: CompileKind;
  readonly bodyVisibility: BodyVisibility;
  readonly factDisposition: FactDisposition;
  readonly clockDisposition: ClockDisposition;
  readonly receiptDisposition: ReceiptDisposition;
  readonly effectObservation: EffectObservation;
  readonly purposeRelation: PurposeRelation;
  readonly citationState: CitationState;
  readonly metadataTrust: MetadataTrust;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly silenceInferred: boolean;
  readonly opensNestedExpiry: boolean;
  readonly inlinesFactBody: boolean;
  readonly expiresAt: Timestamp;
  readonly sealedAt: Timestamp;
}

interface ContextPacketCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly purposeHash: Sha256;
  readonly priorClockHash: Sha256;
  readonly successorClockHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly haltScopeHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly decisionSetHash: Sha256;
  readonly compilerStewardA: string;
  readonly compilerStewardB: string;
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

interface PacketNotifyObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentContextPacketCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly packetId: PacketId;
  readonly snapshotId: SnapshotId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly citationState: CitationState;
  readonly metadataTrust: MetadataTrust;
  readonly effectObservation: EffectObservation;
  readonly providerReceiptHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly factDisposition: FactDisposition;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly bodyVisibility: BodyVisibility;
  readonly inlinesFactBody: false;
  readonly attachedPacketCount: number;
  readonly droppedCitationCount: number;
  readonly unknownEffectCount: number;
  readonly silenceDeniedCount: number;
  readonly disputedHeldCount: number;
  readonly restoreDeniedCount: number;
  readonly trustDeniedCount: number;
  readonly bodyInlineDeniedCount: number;
  readonly uncertainNotifyIntents: readonly PacketNotifyObservation[];
  readonly remainingBudget: Omit<
    ContextPacketBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxPacketsPerSession" | "maxNominatedSnapshots"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ContextPacketBlockedReason[];
  readonly packetHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateContextPacketSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: ContextPacketBudget;
}

interface NominateSealedPerceptionCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly snapshotId: SnapshotId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedProviderReceiptHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindUntrustedMetadataInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly snapshotId: SnapshotId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly silenceInferred: boolean;
  readonly idempotencyKey: string;
}

interface EvaluateContextPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedProviderReceiptHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealContextPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly compilerStewardA: string;
  readonly compilerStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface DropInvalidatedCitationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly packetId: PacketId;
  readonly snapshotId: SnapshotId;
  readonly reasonCode: "CARD_INVALIDATED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PreparePacketNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface PacketNotifyUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion: "RETRY_SAME_PACKET" | "ACCEPT_OBSERVATION" | "REJECT_PACKET" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseContextPacketSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface PublishContextPacketCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type ContextPacketDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: ContextPacketSession;
      readonly certificate?: ContextPacketCertificate;
      readonly packetDecision?: ContextPacketDecision;
      readonly nomination?: PerceptionCardNominationReceipt;
      readonly metadata?: UntrustedMetadataBinding;
      readonly compile?: ContextCompileRecord;
      readonly perception: AgentContextPacketCard;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: ContextPacketBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly perception?: AgentContextPacketCard;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE cpc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE cpc_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'COMPILING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_source_kind AS ENUM (
  'SEALED_PERCEPTION_CARD',
  'SEALED_ATTEST_CERT',
  'SEALED_TOOL_READ_DECISION',
  'SEALED_PROVIDER_RECEIPT',
  'SEALED_EFFECT_INTENT'
);
CREATE TYPE cpc_access_path AS ENUM ('POINT_LOOKUP', 'LEDGER_SCAN');
CREATE TYPE cpc_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE cpc_perceive_kind AS ENUM (
  'PERCEIVE_ATTESTED_RECEIPT', 'HOLD_UNKNOWN_EFFECT', 'DENY_SILENCE_AS_ACK',
  'DENY_CARD_AS_RESTORE', 'DENY_ACK_AS_TRUST', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_compile_kind AS ENUM (
  'ATTACH_SEALED_CARD', 'DROP_INVALIDATED_CARD', 'HOLD_UNKNOWN_EFFECT',
  'DENY_PACKET_AS_TRUST', 'DENY_PACKET_AS_RESTORE', 'DENY_BODY_INLINE',
  'DENY_ACK_AS_TRUST', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE cpc_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_receipt_disposition AS ENUM (
  'UNBOUND', 'ATTESTED', 'SILENCE', 'REJECTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_citation_state AS ENUM (
  'ATTACHED', 'DROPPED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE cpc_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cpc_catalog_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_cpc_profile_authority NOLOGIN;

CREATE TABLE agent_cpc_authorization_evidence (
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

CREATE TABLE agent_cpc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status cpc_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_packets_per_session SMALLINT NOT NULL
    CHECK (max_packets_per_session = 1),
  max_nominated_snapshots SMALLINT NOT NULL
    CHECK (max_nominated_snapshots = 1),
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
    REFERENCES agent_cpc_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_cpc_profile_compile_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  compile_threshold SMALLINT NOT NULL CHECK (compile_threshold BETWEEN 2 AND 8),
  max_packets_per_session SMALLINT NOT NULL
    CHECK (max_packets_per_session = 1),
  require_dual_control_compile BOOLEAN NOT NULL,
  compile_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cpc_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_cpc_snapshot_catalog (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  card_ref TEXT NOT NULL,
  source_kind cpc_source_kind NOT NULL,
  perceive_kind cpc_perceive_kind NOT NULL,
  gate_kind cpc_gate_kind NOT NULL,
  gate_action cpc_gate_action NOT NULL,
  terminal_kind cpc_terminal_kind NOT NULL,
  placement_kind cpc_placement_kind NOT NULL,
  key_lifecycle cpc_key_lifecycle NOT NULL,
  clock_lifecycle cpc_clock_lifecycle NOT NULL,
  attested_key_kind cpc_attested_key_kind NOT NULL,
  status cpc_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  receipt_disposition cpc_receipt_disposition NOT NULL,
  effect_observation cpc_effect_observation NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  fact_disposition cpc_fact_disposition NOT NULL,
  body_visibility cpc_body_visibility NOT NULL,
  clock_disposition cpc_clock_disposition NOT NULL,
  metadata_trust cpc_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  UNIQUE (account_id, card_ref, source_kind),
  CHECK (perception_steward_a <> perception_steward_b),
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
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility <> 'BODY_VISIBLE'),
  CHECK (inlines_fact_body = false),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (
    (status = 'INVALIDATED' AND invalidated_at IS NOT NULL) OR
    (status <> 'INVALIDATED' AND invalidated_at IS NULL)
  )
);

CREATE TABLE agent_cpc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status cpc_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_drop_units BIGINT NOT NULL CHECK (budget_drop_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_drop_units BIGINT NOT NULL CHECK (consumed_drop_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_packets_per_session SMALLINT NOT NULL
    CHECK (max_packets_per_session = 1),
  max_nominated_snapshots SMALLINT NOT NULL
    CHECK (max_nominated_snapshots = 1),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL CHECK (length(delegated_scope_hash) = 64),
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL CHECK (length(resource_scope_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, idempotency_key),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cpc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_cpc_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_drop_units <= budget_drop_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at)
);

CREATE TABLE agent_cpc_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  access_path cpc_access_path NOT NULL,
  source_kind cpc_source_kind NOT NULL,
  gate_kind cpc_gate_kind NOT NULL,
  gate_action cpc_gate_action NOT NULL,
  effect_observation cpc_effect_observation NOT NULL,
  receipt_disposition cpc_receipt_disposition NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agent_cpc_snapshot_catalog (account_id, snapshot_id),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_cpc_metadata_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  effect_observation cpc_effect_observation NOT NULL,
  metadata_trust cpc_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agent_cpc_snapshot_catalog (account_id, snapshot_id),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_cpc_compile_record (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  compile_hash CHAR(64) NOT NULL CHECK (length(compile_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agent_cpc_snapshot_catalog (account_id, snapshot_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_cpc_packet_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  decision_set_hash CHAR(64) NOT NULL CHECK (length(decision_set_hash) = 64),
  compiler_steward_a TEXT NOT NULL,
  compiler_steward_b TEXT NOT NULL,
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
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_cpc_compile_record (account_id, compile_id),
  CHECK (compiler_steward_a <> compiler_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_cpc_packet_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_kind cpc_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status cpc_binding_status NOT NULL,
  placement_kind cpc_placement_kind NOT NULL,
  key_lifecycle cpc_key_lifecycle NOT NULL,
  clock_lifecycle cpc_clock_lifecycle NOT NULL,
  attested_key_kind cpc_attested_key_kind NOT NULL,
  terminal_kind cpc_terminal_kind NOT NULL,
  gate_kind cpc_gate_kind NOT NULL,
  gate_action cpc_gate_action NOT NULL,
  perceive_kind cpc_perceive_kind NOT NULL,
  compile_kind cpc_compile_kind NOT NULL,
  body_visibility cpc_body_visibility NOT NULL,
  fact_disposition cpc_fact_disposition NOT NULL,
  clock_disposition cpc_clock_disposition NOT NULL,
  receipt_disposition cpc_receipt_disposition NOT NULL,
  effect_observation cpc_effect_observation NOT NULL,
  purpose_relation cpc_purpose_relation NOT NULL,
  access_path cpc_access_path NOT NULL,
  citation_state cpc_citation_state NOT NULL,
  metadata_trust cpc_metadata_trust NOT NULL,
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
  inlines_fact_body BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  UNIQUE (account_id, certificate_id, snapshot_id, decision_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_cpc_packet_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agent_cpc_snapshot_catalog (account_id, snapshot_id)
);

CREATE TABLE agent_cpc_context_packet (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  citation_state cpc_citation_state NOT NULL,
  metadata_trust cpc_metadata_trust NOT NULL,
  effect_observation cpc_effect_observation NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  fact_disposition cpc_fact_disposition NOT NULL,
  attested_key_kind cpc_attested_key_kind NOT NULL,
  body_visibility cpc_body_visibility NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  packet_hash CHAR(64) NOT NULL CHECK (length(packet_hash) = 64),
  packet_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, packet_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_cpc_packet_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agent_cpc_snapshot_catalog (account_id, snapshot_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility <> 'BODY_VISIBLE'),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (inlines_fact_body = false),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (packet_body ? 'factBody')),
  CHECK (NOT (packet_body ? 'fact_body')),
  CHECK (NOT (packet_body ? 'resolvedFactHash')),
  CHECK (packet_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (packet_body->>'factDisposition' IS DISTINCT FROM 'RESTORED'),
  CHECK (packet_body->>'bodyVisibility' IS DISTINCT FROM 'BODY_VISIBLE'),
  CHECK (packet_body->>'metadataTrust' = 'UNTRUSTED_METADATA')
);

CREATE TABLE agent_cpc_citation_drop (
  account_id BIGINT NOT NULL,
  drop_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  effect_observation cpc_effect_observation NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'CARD_INVALIDATED', 'RETRACTED', 'QUARANTINED', 'KEY_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, drop_id),
  UNIQUE (account_id, packet_id, snapshot_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_cpc_context_packet (account_id, packet_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agent_cpc_snapshot_catalog (account_id, snapshot_id)
);

CREATE TABLE agent_cpc_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status cpc_effect_status NOT NULL,
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
    REFERENCES agent_cpc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_cpc_packet_certificate (account_id, certificate_id)
);

CREATE TABLE agent_cpc_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'BIND', 'SEAL', 'VECTOR', 'DROP', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units >= 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id)
);

CREATE TABLE agent_cpc_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cpc_session (account_id, session_id)
);

CREATE TABLE agent_cpc_command_result (
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

CREATE TABLE agent_cpc_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_cpc_audit_event (
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

CREATE TABLE agent_cpc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_cpc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_cpc_profile()
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
       OR NEW.max_packets_per_session IS DISTINCT FROM OLD.max_packets_per_session
       OR NEW.max_nominated_snapshots IS DISTINCT FROM OLD.max_nominated_snapshots
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
    IF current_setting('app.cpc_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.cpc_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_cpc_profile_protect
BEFORE INSERT OR UPDATE ON agent_cpc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_profile();

CREATE FUNCTION protect_agent_cpc_profile_compile_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status cpc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_cpc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile compile rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_cpc_profile_compile_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_cpc_profile_compile_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_profile_compile_rule();

CREATE FUNCTION protect_agent_cpc_snapshot_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_catalog$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
     OR NEW.source_certificate_id IS DISTINCT FROM OLD.source_certificate_id
     OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
     OR NEW.prior_clock_hash IS DISTINCT FROM OLD.prior_clock_hash
     OR NEW.successor_clock_hash IS DISTINCT FROM OLD.successor_clock_hash
     OR NEW.provider_receipt_hash IS DISTINCT FROM OLD.provider_receipt_hash
     OR NEW.effect_observation IS DISTINCT FROM OLD.effect_observation
     OR NEW.attested_key_kind IS DISTINCT FROM OLD.attested_key_kind
     OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
     OR NEW.body_visibility IS DISTINCT FROM OLD.body_visibility
     OR NEW.inlines_fact_body IS DISTINCT FROM OLD.inlines_fact_body THEN
    RAISE EXCEPTION 'snapshot catalog identity is immutable';
  END IF;

  IF OLD.status = 'SEALED' AND NEW.status = 'INVALIDATED' THEN
    IF NEW.invalidated_at IS NULL THEN
      RAISE EXCEPTION 'invalidation requires invalidated_at';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at THEN
    RAISE EXCEPTION 'illegal catalog status transition';
  END IF;

  RETURN NEW;
END
$protect_catalog$;

CREATE TRIGGER agent_cpc_snapshot_catalog_protect
BEFORE INSERT OR UPDATE ON agent_cpc_snapshot_catalog
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_snapshot_catalog();

CREATE FUNCTION protect_agent_cpc_metadata_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'metadata bindings are append-only';
  END IF;
  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_cpc_metadata_binding_protect
BEFORE INSERT OR UPDATE ON agent_cpc_metadata_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_metadata_binding();

CREATE FUNCTION protect_agent_cpc_packet_certificate()
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
       OR NEW.compiler_steward_a IS DISTINCT FROM OLD.compiler_steward_a
       OR NEW.compiler_steward_b IS DISTINCT FROM OLD.compiler_steward_b
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
      RAISE EXCEPTION 'packet certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.compiler_steward_a = NEW.compiler_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct compiler stewards';
  END IF;
  IF NEW.compiler_steward_a = NEW.perception_steward_a
     OR NEW.compiler_steward_a = NEW.perception_steward_b
     OR NEW.compiler_steward_b = NEW.perception_steward_a
     OR NEW.compiler_steward_b = NEW.perception_steward_b
     OR NEW.compiler_steward_a = NEW.receipt_steward_a
     OR NEW.compiler_steward_a = NEW.receipt_steward_b
     OR NEW.compiler_steward_b = NEW.receipt_steward_a
     OR NEW.compiler_steward_b = NEW.receipt_steward_b
     OR NEW.compiler_steward_a = NEW.prior_gate_steward_a
     OR NEW.compiler_steward_a = NEW.prior_gate_steward_b
     OR NEW.compiler_steward_b = NEW.prior_gate_steward_a
     OR NEW.compiler_steward_b = NEW.prior_gate_steward_b
     OR NEW.compiler_steward_a = NEW.prior_extension_steward_a
     OR NEW.compiler_steward_a = NEW.prior_extension_steward_b
     OR NEW.compiler_steward_b = NEW.prior_extension_steward_a
     OR NEW.compiler_steward_b = NEW.prior_extension_steward_b THEN
    RAISE EXCEPTION 'prior-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_cpc_packet_certificate_protect
BEFORE INSERT OR UPDATE ON agent_cpc_packet_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_packet_certificate();

CREATE FUNCTION protect_agent_cpc_packet_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
DECLARE
  catalog_status cpc_catalog_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
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
       OR NEW.compile_kind IS DISTINCT FROM OLD.compile_kind
       OR NEW.body_visibility IS DISTINCT FROM OLD.body_visibility
       OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
       OR NEW.clock_disposition IS DISTINCT FROM OLD.clock_disposition
       OR NEW.receipt_disposition IS DISTINCT FROM OLD.receipt_disposition
       OR NEW.effect_observation IS DISTINCT FROM OLD.effect_observation
       OR NEW.purpose_relation IS DISTINCT FROM OLD.purpose_relation
       OR NEW.access_path IS DISTINCT FROM OLD.access_path
       OR NEW.citation_state IS DISTINCT FROM OLD.citation_state
       OR NEW.metadata_trust IS DISTINCT FROM OLD.metadata_trust
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id
       OR NEW.silence_inferred IS DISTINCT FROM OLD.silence_inferred
       OR NEW.opens_nested_expiry IS DISTINCT FROM OLD.opens_nested_expiry
       OR NEW.inlines_fact_body IS DISTINCT FROM OLD.inlines_fact_body THEN
      RAISE EXCEPTION 'packet decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'packet-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'packet-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'halt-read fence blocks exposing a disputed fact body';
  END IF;

  IF NEW.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.gate_action = 'TOOL_MUTATE' THEN
    RAISE EXCEPTION 'tool-mutate fence blocks mutation from a context packet';
  END IF;

  IF NEW.effect_observation = 'ACKED'
     AND (
       NEW.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR NEW.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence blocks ACKED without an attested receipt';
  END IF;

  IF NEW.provider_receipt_hash IS NOT DISTINCT FROM NEW.disputed_fact_hash THEN
    RAISE EXCEPTION 'packet-as-fact fence blocks using the disputed fact hash as a receipt';
  END IF;

  IF NEW.metadata_trust IS DISTINCT FROM 'UNTRUSTED_METADATA' THEN
    RAISE EXCEPTION 'metadata fence requires UNTRUSTED_METADATA';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than citation attenuation';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence blocks opening another expiry plane';
  END IF;

  IF NEW.access_path = 'LEDGER_SCAN' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.clock_disposition = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks rewinding a successor clock';
  END IF;

  SELECT status INTO catalog_status
  FROM agent_cpc_snapshot_catalog
  WHERE account_id = NEW.account_id
    AND snapshot_id = NEW.snapshot_id;

  IF NEW.compile_kind = 'ATTACH_SEALED_CARD'
     AND catalog_status IS DISTINCT FROM 'SEALED' THEN
    RAISE EXCEPTION 'invalidated-card fence blocks attaching a dropped perception card';
  END IF;

  IF NEW.compile_kind = 'ATTACH_SEALED_CARD'
     AND (
       NEW.source_kind IS DISTINCT FROM 'SEALED_PERCEPTION_CARD'
       OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
       OR NEW.gate_kind IS DISTINCT FROM 'ALLOW_TOOL_READ'
       OR NEW.gate_action IS DISTINCT FROM 'TOOL_READ'
       OR NEW.perceive_kind IS DISTINCT FROM 'PERCEIVE_ATTESTED_RECEIPT'
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
       OR NEW.citation_state IS DISTINCT FROM 'ATTACHED'
       OR NEW.metadata_trust IS DISTINCT FROM 'UNTRUSTED_METADATA'
       OR NEW.silence_inferred
       OR NEW.inlines_fact_body
       OR NEW.successor_clock_hash IS NOT DISTINCT FROM NEW.prior_clock_hash
     ) THEN
    RAISE EXCEPTION 'attach fence requires one non-silent sealed card by point lookup';
  END IF;

  IF NEW.compile_kind = 'ATTACH_SEALED_CARD'
     AND NEW.hop_count > 0
     AND NEW.requested_purpose_hash IS NOT DISTINCT FROM NEW.donor_purpose_hash THEN
    RAISE EXCEPTION 'hop-leak fence blocks donor-purpose reads after attenuation hops';
  END IF;

  IF NEW.compile_kind = 'HOLD_UNKNOWN_EFFECT'
     AND NEW.effect_observation IS DISTINCT FROM 'UNKNOWN_EFFECT' THEN
    RAISE EXCEPTION 'unknown-effect fence blocks HOLD_UNKNOWN_EFFECT with a success observation';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_cpc_packet_decision_protect
BEFORE INSERT OR UPDATE ON agent_cpc_packet_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_packet_decision();

CREATE FUNCTION protect_agent_cpc_context_packet()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_packet$
BEGIN
  IF NEW.packet_body ? 'factBody'
     OR NEW.packet_body ? 'fact_body'
     OR NEW.packet_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'packet-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' OR NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'packet-as-restore fence blocks restoring disputed facts';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.citation_state IS DISTINCT FROM 'ATTACHED' THEN
      RAISE EXCEPTION 'packets attach only while the source card is sealed';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider_receipt_hash IS DISTINCT FROM OLD.provider_receipt_hash
     OR NEW.disputed_fact_hash IS DISTINCT FROM OLD.disputed_fact_hash
     OR NEW.effect_observation IS DISTINCT FROM OLD.effect_observation
     OR NEW.fact_disposition IS DISTINCT FROM OLD.fact_disposition
     OR NEW.attested_key_kind IS DISTINCT FROM OLD.attested_key_kind
     OR NEW.body_visibility IS DISTINCT FROM OLD.body_visibility
     OR NEW.packet_body IS DISTINCT FROM OLD.packet_body
     OR NEW.packet_hash IS DISTINCT FROM OLD.packet_hash
     OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
     OR NEW.metadata_trust IS DISTINCT FROM OLD.metadata_trust
     OR NEW.inlines_fact_body IS DISTINCT FROM OLD.inlines_fact_body THEN
    RAISE EXCEPTION 'context packet metadata is immutable';
  END IF;

  IF OLD.citation_state = 'ATTACHED' AND NEW.citation_state = 'DROPPED' THEN
    IF current_setting('app.cpc_citation_drop', true) IS DISTINCT FROM
       concat(OLD.packet_id::TEXT, ':', OLD.snapshot_id::TEXT) THEN
      RAISE EXCEPTION 'citation drop requires the drop authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.citation_state IS DISTINCT FROM NEW.citation_state THEN
    RAISE EXCEPTION 'illegal citation state transition';
  END IF;

  RETURN NEW;
END
$protect_packet$;

CREATE TRIGGER agent_cpc_context_packet_protect
BEFORE INSERT OR UPDATE ON agent_cpc_context_packet
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_context_packet();

CREATE FUNCTION protect_agent_cpc_effect_intent()
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

CREATE TRIGGER agent_cpc_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_cpc_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_cpc_effect_intent();

CREATE FUNCTION approve_agent_cpc_profile(
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
  stored_status cpc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cpc_profile
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
  FROM agent_cpc_profile_compile_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_compile IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control compile rule';
  END IF;

  PERFORM set_config(
    'app.cpc_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_cpc_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_cpc_profile(
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
  stored_status cpc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cpc_profile
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
    'app.cpc_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_cpc_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_cpc_snapshot(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_snapshot_id UUID,
  recipient_nomination_id UUID,
  nomination_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  catalog agent_cpc_snapshot_catalog%ROWTYPE;
BEGIN
  IF recipient_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_cpc_snapshot_catalog
  WHERE account_id = tenant_id
    AND snapshot_id = recipient_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot point lookup missed';
  END IF;

  IF catalog.status IS DISTINCT FROM 'SEALED' THEN
    RAISE EXCEPTION 'invalidated-card fence blocks nominating a dropped perception card';
  END IF;

  IF catalog.effect_observation = 'ACKED'
     AND (
       catalog.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR catalog.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence';
  END IF;

  IF catalog.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'packet-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF catalog.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  INSERT INTO agent_cpc_nomination (
    account_id, nomination_id, session_id, snapshot_id,
    access_path, source_kind, gate_kind, gate_action,
    effect_observation, receipt_disposition, silence_inferred,
    disputed_fact_hash, provider_receipt_hash,
    nomination_hash, nominated_at
  ) VALUES (
    tenant_id, recipient_nomination_id, recipient_session_id,
    recipient_snapshot_id, 'POINT_LOOKUP', catalog.source_kind,
    catalog.gate_kind, catalog.gate_action,
    catalog.effect_observation, catalog.receipt_disposition,
    catalog.silence_inferred, catalog.disputed_fact_hash,
    catalog.provider_receipt_hash, nomination_digest, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION drop_agent_cpc_citation(
  tenant_id BIGINT,
  recipient_packet_id UUID,
  recipient_snapshot_id UUID,
  recipient_drop_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $drop_citation$
DECLARE
  catalog agent_cpc_snapshot_catalog%ROWTYPE;
  packet agent_cpc_context_packet%ROWTYPE;
BEGIN
  IF recipient_snapshot_id IS NULL OR recipient_packet_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_cpc_snapshot_catalog
  WHERE account_id = tenant_id
    AND snapshot_id = recipient_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot point lookup missed';
  END IF;

  IF catalog.status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'drop fence requires an invalidated perception card';
  END IF;

  SELECT * INTO packet
  FROM agent_cpc_context_packet
  WHERE account_id = tenant_id
    AND packet_id = recipient_packet_id
  FOR UPDATE;

  IF NOT FOUND OR packet.snapshot_id IS DISTINCT FROM recipient_snapshot_id THEN
    RAISE EXCEPTION 'packet point lookup missed';
  END IF;

  IF packet.citation_state IS DISTINCT FROM 'ATTACHED' THEN
    RAISE EXCEPTION 'drop fence requires a live attached citation';
  END IF;

  INSERT INTO agent_cpc_citation_drop (
    account_id, drop_id, packet_id, snapshot_id,
    provider_receipt_hash, effect_observation, reason_code, created_at
  ) VALUES (
    tenant_id, recipient_drop_id, recipient_packet_id, recipient_snapshot_id,
    packet.provider_receipt_hash, packet.effect_observation,
    'CARD_INVALIDATED', clock_timestamp()
  );

  PERFORM set_config(
    'app.cpc_citation_drop',
    concat(recipient_packet_id::TEXT, ':', recipient_snapshot_id::TEXT),
    true
  );

  UPDATE agent_cpc_context_packet
  SET citation_state = 'DROPPED'
  WHERE account_id = tenant_id
    AND packet_id = recipient_packet_id;
END
$drop_citation$;

CREATE FUNCTION reject_agent_cpc_unscoped_scan(
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

ALTER FUNCTION approve_agent_cpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cpc_profile_authority;
ALTER FUNCTION revoke_agent_cpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cpc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_cpc_profile_authority;
GRANT SELECT ON
  agent_cpc_profile,
  agent_cpc_profile_compile_rule
TO agent_cpc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cpc_profile TO agent_cpc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_cpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_cpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cpc_profile FROM PUBLIC;

CREATE INDEX agent_cpc_session_work_idx ON agent_cpc_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_cpc_session_profile_idx ON agent_cpc_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_cpc_decision_packet_idx ON agent_cpc_packet_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_cpc_decision_snapshot_idx ON agent_cpc_packet_decision (
  account_id, snapshot_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_cpc_catalog_ref_idx ON agent_cpc_snapshot_catalog (
  account_id, card_ref, sealed_at DESC, snapshot_id
);
CREATE INDEX agent_cpc_catalog_kind_idx ON agent_cpc_snapshot_catalog (
  account_id, source_kind, sealed_at DESC, snapshot_id
);
CREATE INDEX agent_cpc_record_session_idx ON agent_cpc_compile_record (
  account_id, session_id, compiled_at DESC, compile_id
);
CREATE INDEX agent_cpc_certificate_session_idx ON agent_cpc_packet_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_cpc_nomination_session_idx ON agent_cpc_nomination (
  account_id, session_id, nominated_at DESC, nomination_id
);
CREATE INDEX agent_cpc_effect_work_idx ON agent_cpc_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_cpc_audit_time_idx ON agent_cpc_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_cpc_packet_status_idx ON agent_cpc_context_packet (
  account_id, citation_state, created_at DESC, packet_id
);
CREATE INDEX agent_cpc_command_expiry_idx ON agent_cpc_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_cpc_citation_drop_packet_idx ON agent_cpc_citation_drop (
  account_id, packet_id, created_at DESC, drop_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_cpc_authorization_evidence',
    'agent_cpc_profile',
    'agent_cpc_profile_compile_rule',
    'agent_cpc_snapshot_catalog',
    'agent_cpc_session',
    'agent_cpc_nomination',
    'agent_cpc_metadata_binding',
    'agent_cpc_compile_record',
    'agent_cpc_packet_certificate',
    'agent_cpc_packet_decision',
    'agent_cpc_context_packet',
    'agent_cpc_citation_drop',
    'agent_cpc_effect_intent',
    'agent_cpc_budget_ledger',
    'agent_cpc_terminal_record',
    'agent_cpc_command_result',
    'agent_cpc_audit_head',
    'agent_cpc_audit_event',
    'agent_cpc_audit_anchor',
    'agent_cpc_projection_checkpoint'
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

Open, nominate, bind, evaluate, seal, drop, and
effect-prepare each run in a single ACID row-store
transaction with session compare-and-swap. Packet seal
never joins a neighbor board write, never updates the
disputed fact, and never rewrites the successor clock.
Citation drop updates only `citation_state` on the packet
that was looked up by `(account_id, packet_id)`.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers set `app.account_id`
before query. Composite primary keys and every access index
lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open
API. Long-running notify work returns durable state, not a
synchronous board promise. Profile search discovers
procedural memory. It does not authorize a packet.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentCpcSessionStatus {
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

enum AgentCpcCompileKind {
  ATTACH_SEALED_CARD
  DROP_INVALIDATED_CARD
  HOLD_UNKNOWN_EFFECT
  DENY_PACKET_AS_TRUST
  DENY_PACKET_AS_RESTORE
  DENY_BODY_INLINE
  DENY_ACK_AS_TRUST
  SKIP
  UNKNOWN_EFFECT
}

enum AgentCpcCitationState {
  ATTACHED
  DROPPED
  HELD
  UNKNOWN_EFFECT
}

enum AgentCpcEffectObservation {
  ACKED
  FAILED
  DISPATCHED
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentCpcEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentCpcNextAction {
  NOMINATE_SEALED_PERCEPTION_CARD
  BIND_UNTRUSTED_METADATA
  EVALUATE_CONTEXT_PACKET
  SEAL_CONTEXT_PACKET
  DROP_INVALIDATED_CITATION
  PREPARE_PACKET_NOTIFY
  PACKET_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentCpcBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  BUDGET_EXHAUSTED
  SNAPSHOT_MISSING
  PACKET_AS_TRUST_DENIED
  PACKET_AS_RESTORE_DENIED
  BODY_INLINE_DENIED
  CITATION_DROPPED
  NESTED_EXPIRY_DENIED
  LEDGER_SCAN_DENIED
  UNKNOWN_EFFECT
}

type AgentCpcProfile {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  compileThreshold: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentCpcSession {
  accountId: Long!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentCpcSessionStatus!
  stateRevision: Long!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentCpcSnapshot {
  accountId: Long!
  snapshotId: ID!
  sourceKind: String!
  gateKind: String!
  gateAction: String!
  disputedFactHash: SHA256!
  providerReceiptHash: SHA256!
  effectObservation: AgentCpcEffectObservation!
  status: String!
}

type AgentCpcCertificate {
  accountId: Long!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  compileKind: AgentCpcCompileKind!
  effectObservation: AgentCpcEffectObservation!
  sealedAt: DateTime!
}

type AgentCpcPerception {
  accountId: Long!
  sessionId: ID!
  packetId: ID!
  snapshotId: ID!
  status: AgentCpcSessionStatus!
  summary: String!
  citationState: AgentCpcCitationState!
  metadataTrust: String!
  effectObservation: AgentCpcEffectObservation!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  factDisposition: String!
  attestedKeyKind: String!
  bodyVisibility: String!
  inlinesFactBody: Boolean!
  unknownEffectCount: Int!
  allowedNextActions: [AgentCpcNextAction!]!
  blockedReasons: [AgentCpcBlockedReason!]!
  packetHash: SHA256!
}

type AgentCpcAuditHead {
  accountId: Long!
  headSequence: Long!
  headHash: SHA256!
  updatedAt: DateTime!
}

type AgentCpcResult {
  decision: String!
  retryable: Boolean!
  reason: String!
  session: AgentCpcSession
  certificate: AgentCpcCertificate
  perception: AgentCpcPerception
  auditHash: SHA256!
}

input AgentCpcBudgetInput {
  nominateUnits: Int!
  bindUnits: Int!
  sealUnits: Int!
  vectorUnits: Int!
  dropUnits: Int!
  notifyUnits: Int!
  maxWallTimeMs: Int!
  compileThreshold: Int!
  maxPacketsPerSession: Int!
  maxNominatedSnapshots: Int!
}

input CreateContextPacketSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentCpcBudgetInput!
}

input NominateSealedPerceptionCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  snapshotId: ID!
  expectedDisputedFactHash: SHA256!
  expectedProviderReceiptHash: SHA256!
  idempotencyKey: String!
}

input BindUntrustedMetadataInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  snapshotId: ID!
  providerReceiptHash: SHA256!
  effectObservation: AgentCpcEffectObservation!
  silenceInferred: Boolean!
  idempotencyKey: String!
}

input EvaluateContextPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  expectedProviderReceiptHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealContextPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  compileId: ID!
  consumerRef: String!
  compilerStewardA: String!
  compilerStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input DropInvalidatedCitationInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  packetId: ID!
  snapshotId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input PreparePacketNotifyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input RecordPacketNotifyUncertaintyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: String!
  idempotencyKey: String!
}

input CloseContextPacketSessionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input PublishContextPacketCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

type Query {
  contextCompilationProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentCpcProfile
  contextPacketSession(accountId: Long!, sessionId: ID!): AgentCpcSession
  sealedPerceptionSnapshot(accountId: Long!, snapshotId: ID!): AgentCpcSnapshot
  contextPacketCertificate(accountId: Long!, certificateId: ID!): AgentCpcCertificate
  contextPacketCard(accountId: Long!, sessionId: ID!): AgentCpcPerception
  contextPacketAuditReplay(accountId: Long!, sessionId: ID!): AgentCpcAuditHead
}

type Mutation {
  createContextPacketSession(input: CreateContextPacketSessionInput!): AgentCpcResult!
  nominateSealedPerceptionCard(input: NominateSealedPerceptionCardInput!): AgentCpcResult!
  bindUntrustedMetadata(input: BindUntrustedMetadataInput!): AgentCpcResult!
  evaluateContextPacket(input: EvaluateContextPacketInput!): AgentCpcResult!
  sealContextPacket(input: SealContextPacketInput!): AgentCpcResult!
  dropInvalidatedCitation(input: DropInvalidatedCitationInput!): AgentCpcResult!
  preparePacketNotify(input: PreparePacketNotifyInput!): AgentCpcResult!
  recordPacketNotifyUncertainty(input: RecordPacketNotifyUncertaintyInput!): AgentCpcResult!
  closeContextPacketSession(input: CloseContextPacketSessionInput!): AgentCpcResult!
  publishContextPacketCard(input: PublishContextPacketCardInput!): AgentCpcResult!
}
```

### GraphQL limits

Resolvers require `accountId` and reject missing tenant
scope. Snapshot and certificate reads are primary-key point
lookups of `(account_id, snapshot_id)` or
`(account_id, certificate_id)`. Packet and audit reads are
bounded by `sessionId`. There is no list-all-packets field.
A client that asks for every card on a board is **FULL SCAN
REJECTED** before execution.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `compile_instruction` records that a packet attaches
one sealed perception card, repeats the receipt hash and
the effect observation as untrusted metadata, drops the
citation when the card is invalidated, and never treats
`ACKED` as trust. `procedureRef` points at that profile
version. Agents do not store a second hidden policy. If the
profile is revoked with `STOP_BEFORE_COMPILE`, new
nominations stop. In-flight packets remain replayable.

Semantic tags (`incident`, `context-packet`) are for
discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_cpc_profile_embedding (
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
    REFERENCES agent_cpc_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_cpc_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_cpc_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_cpc_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped snapshot-catalog or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one snapshot by primary key, and seals
under dual control. Similarity never compiles a context
packet and never reattaches a dropped citation.

## 12. Agent perception

Agents receive one packet per compile session. The packet
exposes `citationState`, `metadataTrust`,
`effectObservation`, `providerReceiptHash`, and
`disputedFactHash` as separate metadata, plus
`factDisposition`, `attestedKeyKind`, and `bodyVisibility`.
Summary text is `UntrustedText`. Packets also expose
dropped-citation counts, unknown-effect counts, remaining
budgets, procedure tags, allowed next actions, and blocked
reasons. They never embed raw private keys, tool payloads,
fact bodies, or a winning fact hash. `packetHash` makes
perception replayable.

An LLM should read an `ATTACHED` packet as: "one sealed
perception card was attached by point lookup of
`(account_id, snapshot_id)`, and the effect is either
`ACKED` with this untrusted receipt hash or still
`UNKNOWN_EFFECT`." It should read a `DROPPED` packet as:
"that citation is no longer live." It should not read
either state as "the disputed fact is now true" or "the
signing key is `TRUSTED_ENROLLED`." Metadata tags that keep
that reading stable are `metadataTrust=UNTRUSTED_METADATA`,
`factDisposition=DISPUTED_HELD`,
`attestedKeyKind=AWAITING_CONFIRMATION`,
`bodyVisibility=ENVELOPE_ONLY`, and
`inlinesFactBody=false`.

## 13. ACID and consistency

### Row store

Nomination, metadata bind, evaluation, and seal commit or
roll back together. Compare-and-swap on `state_revision`
rejects lost updates. Decision identity is immutable. The
packet is a projection of one sealed snapshot, not a second
fact. Citation drop is its own transaction and changes only
the live citation state.

### Columnar store

Analytical counts of compile kinds, citation states, and
effect observations are derived from the row store by
`account_id`. They lag the seal watermark and cannot
authorize a new packet or restore a dropped citation.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but discovery never nominates a snapshot.
Account predicates are applied before HNSW topK.

### External tools

Notify providers sit outside the ACID boundary. Silence and
ambiguous responses stay `UNKNOWN_EFFECT`. A notify
acknowledgement cannot reattach a citation, inline a fact
body, or promote `ACKED` to `TRUSTED_ENROLLED`.

## 14. Guardrails and neighbor protection

Compile budgets cap nominate, bind, seal, vector, drop, and
notify units per session. The one-card cap rejects a second
nomination before it can fan out into recursive retrieval.
A packet cannot schedule another compile of itself.
`LEDGER_SCAN`, missing `account_id`, and a missing
`snapshot_id` are **FULL SCAN REJECTED** by
`reject_agent_cpc_unscoped_scan` before the planner touches
a board with 1M+ rows. Vector discovery is capped by
`budget_vector_units` and cannot authorize seal. Halted and
quarantined bodies stay `ENVELOPE_ONLY` or `OMITTED`.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing every perception card for an account to "find the
  one that belongs in this prompt."
- Joining packets to board items, vote ledgers, or
  promotion ledgers to recover a fact body.
- Building one global HNSW index and authorizing from the
  nearest profile.
- Recompiling a packet by scanning every prior citation
  drop.

Each of those plans is **FULL SCAN REJECTED**.

### Required access paths

- Snapshot nomination: primary key
  `(account_id, snapshot_id)`.
- Packet read and citation drop: primary key
  `(account_id, packet_id)`.
- Session and audit reads: `(account_id, session_id)` plus
  the session work index.
- Profile discovery: `account_id` equality, then HNSW topK
  inside that partition.

### Planner enforcement

`nominate_agent_cpc_snapshot` and `drop_agent_cpc_citation`
refuse a null point key. Resolvers do not expose an
unbounded list field. The reference schema creates no
cross-tenant HNSW index.

## 16. Auditability and replay

`agent_cpc_audit_event` is a hash chain per `account_id`.
Anchors store a Merkle root over a sequence range. Replay
recomputes the compile decision from the sealed snapshot
hashes, the dual-control stewards, and the citation state.
It does not call an LLM and does not reconstruct a fact
body. A drop event records `CARD_INVALIDATED` without
erasing the historical receipt hash.

## 17. Threat and failure analysis

- **Packet-as-trust:** a compiler writes `TRUSTED_ENROLLED`
  because the effect was `ACKED`. Rejected.
- **Packet-as-restore:** a compiler writes `RESTORED` or
  `BODY_VISIBLE`. Rejected.
- **Body inline:** `packet_body` contains `factBody`.
  Rejected.
- **Silence-as-ack:** `ACKED` with `silence_inferred`.
  Rejected.
- **Stale citation:** the snapshot is `INVALIDATED` and the
  packet stays `ATTACHED`. The drop fence is the only legal
  transition, and attach of an invalidated snapshot is
  rejected.
- **Nested expiry:** `opens_nested_expiry` is rejected.
- **Ledger scan and hop leak:** `LEDGER_SCAN` and purpose
  amplification are rejected.
- **Prior steward reuse:** perception, receipt, gate, and
  extension stewards cannot compile the packet.
- **Neighbor damage:** unscoped scans and a second card in
  the same session are rejected before they touch a 1M+ row
  board.

## 18. Observability and SLOs

Availability target remains 99.99% for neighbor board
traffic. This plane's SLOs are:

- point-lookup nomination p99 under 20 ms inside the
  tenant partition;
- seal transaction p99 under 50 ms with no board write;
- citation drop p99 under 20 ms after the snapshot is
  marked `INVALIDATED`;
- zero packets sealed with `inlines_fact_body = true`;
- zero `ATTACHED` packets whose snapshot is `INVALIDATED`
  for longer than the drop budget;
- `UNKNOWN_EFFECT` notify age visible on the packet card.

Columnar counts of attached, dropped, and denied packets
are operational. They are not authorization.

## 19. Rollout

### Phase 1: shadow packets

Compile packets in shadow mode. Agents do not read them.
Compare attached metadata with the source card.

### Phase 2: deny-only

Serve `DENY_PACKET_AS_TRUST`, `DENY_PACKET_AS_RESTORE`, and
`DENY_BODY_INLINE`. Do not attach.

### Phase 3: one attached card

Allow `ATTACH_SEALED_CARD` for approved profiles. Facts
stay `DISPUTED_HELD`. Metadata stays untrusted.

### Phase 4: drop and notify uncertainty

Enable citation drop on invalidation and surface
`UNKNOWN_EFFECT` notify. A drop does not restore a fact.

### Phase 5: broad availability

Default-on for tenants that already use perception cards.
Profiles still require dual control. Similarity still
cannot seal.

## 20. Ship criteria

### Contract validation

TypeScript contracts compile under strict mode. The GraphQL
schema builds with 6 queries and 10 mutations. SQL enums
stay within 63-byte labels. Every table and index leads
with `account_id`.

### Behavioral validation

- A sealed snapshot can be nominated by
  `(account_id, snapshot_id)` and attached once.
- The packet repeats `ACKED` and the receipt hash as
  `UNTRUSTED_METADATA` while the key stays
  `AWAITING_CONFIRMATION` and the fact stays
  `DISPUTED_HELD`.
- `TRUSTED_ENROLLED`, `RESTORED`, `BODY_VISIBLE`, and
  `factBody` are rejected.
- Invalidating the snapshot and calling
  `drop_agent_cpc_citation` moves the live citation to
  `DROPPED` without rewriting the packet body.
- Direct profile approval, sealed-rule edits, and unscoped
  scans are rejected.

### Scale and failure validation

Explain plans for nomination and drop use the primary key.
A missing point key is **FULL SCAN REJECTED**. A 1M+ row
board is not read. Notify silence remains `UNKNOWN_EFFECT`.

## 21. Product decision

Ship the Perception Context Packet Plane as the deterministic
bridge from a sealed perception card to one agent context
packet. The latency cost is one primary-key compile. The
consistency win is that `ACKED` stays an untrusted effect
observation, the disputed fact stays held, and an
invalidated card loses its live citation. The next
increment should omit a `DROPPED` packet from the next
working-set compile by point lookup of
`(account_id, packet_id)`. That compile must not scan
packets, must not inline the fact body, must not promote
`ACKED` to `TRUSTED_ENROLLED`, and must not open another
nested expiry plane.
