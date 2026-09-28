# mondayDB Agentic Omission Perception Card Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-09-28.v1`

## 1. Why this plane, before how

The 2026-09-27 Dropped-Packet Omission Plane can seal one
working-set member by point lookup of `(account_id, packet_id)`.
Membership on that member is `OMITTED`. The source citation
stays `DROPPED`. `ACKED` stays an effect observation. The
disputed fact stays `DISPUTED_HELD`. The body stays out of
the member.

Downstream agents still need to perceive that omission.
Without a perception-card plane they either:

- scan working-set members, citation drops, and board rows
  to discover "which members were omitted" (neighbor-harmful
  on boards with 1M+ rows), or
- inline the disputed fact and read `ACKED` as
  `TRUSTED_ENROLLED` so the prompt "explains" the omission
  by revealing the held fact.

The product trade-off is **perception fluency versus
citation integrity and neighbor latency**:

- Scanning every working-set member, or copying the fact
  body onto the card, maximizes prompt fluency and hides
  the hold. It also puts a 1M+ row walk on the primary
  path and can miss the 99.99% neighbor availability
  target.
- Publishing exactly one omission perception card by point
  lookup of `(account_id, member_id)` adds one bounded
  compile transaction. The card may repeat membership
  `OMITTED` and citation `DROPPED` as `UNTRUSTED_METADATA`.
  `ACKED` stays an effect observation. The disputed fact
  stays `DISPUTED_HELD`. The key stays
  `AWAITING_CONFIRMATION`. The body stays `OMITTED`.
  Silence stays `UNKNOWN_EFFECT`.
- Semantic similarity may discover perception profiles, but
  it must never decide whether a member may be nominated,
  metadata bound, a card evaluated, a card sealed, a card
  published, or a consumer notified.

Latency stays on the primary key. Consistency is the sealed
card row inside one ACID transaction, not an eventually
consistent guess that an omitted member "probably belongs
in the prompt." Neighbor availability stays at the 99.99%
target because an unscoped member walk is **FULL SCAN
REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved perception profile is procedural memory for
   "how one omitted working-set member is published as a
   card." A profile **never** inlines a fact body,
   **never** rewrites `ACKED` as `TRUSTED_ENROLLED`, and
   **never** opens another nested expiry plane.
2. A session opens under purpose, budget, and authorization
   fences, and nominates exactly one omitted member by
   point lookup of `(account_id, member_id)`. Hashes are
   copied from the member catalog. They are never computed
   by walking working-set members or ledgers.
3. mondayDB evaluates a perception whose outcome is a pure
   function of `(source_kind, access_path, gate_kind,
   gate_action, terminal_kind, placement_kind,
   key_lifecycle, clock_lifecycle, attested_key_kind,
   perceive_kind, compile_kind, body_visibility,
   fact_disposition, clock_disposition, receipt_disposition,
   effect_observation, purpose_relation, citation_state,
   membership_state, metadata_trust, silence_inferred,
   inlines_fact_body, opens_nested_expiry, hop_count)`.
   `ACKED` cannot become trust. `RESTORED` cannot be
   written. A body cannot be inlined. `INCLUDED` cannot be
   perceived as if it were omitted.
4. Sealing binds `consumer_ref + purpose_hash +
   prior_clock_hash + successor_clock_hash +
   disputed_fact_hash + provider_receipt_hash +
   halt_scope_hash + attenuation_hash + decision_set_hash +
   card_steward_a + card_steward_b`. The card **must not**
   emit a fact body and **must not** emit
   `TRUSTED_ENROLLED`.
5. Publishing the card is a second point lookup of the same
   `(account_id, member_id)`. Notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not enrollment, not a fact restore,
   and not permission to put the member back.
6. Unscoped member-catalog, working-set, vote-ledger,
   page-ledger, ack-ledger, escalation-ledger,
   containment-ledger, review-ledger, resolution-ledger,
   promotion-ledger, or board scans are **FULL SCAN
   REJECTED**.

### Product outcome

For any omission perception card, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, metadata bind, evaluation, seal, card
  publication, or notify dispatch?
- Which omitted member was read by primary key
  `(account_id, member_id)`, and which membership and
  citation were repeated as untrusted metadata?
- Did the card repeat `OMITTED` and `DROPPED` while `ACKED`
  stayed an effect observation, the disputed fact stayed
  held, the body stayed omitted, and the key stayed
  unconfirmed?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the card history be replayed without invoking an LLM?

## 2. Scope and ownership

The Omission Perception Card Plane owns:

1. Immutable approved perception profiles as procedural
   memory of "how one omitted working-set member is
   published as a card without inlining a disputed fact,
   treating `ACKED` as `TRUSTED_ENROLLED`, scanning
   working-set members, amplifying purpose, or opening
   another nested expiry."
2. Tenant-scoped perception sessions with purpose and
   budget fences, and a hard cap of one nominated member
   and one perception card per session.
3. Deterministic nomination of omitted members by point
   lookup of `(account_id, member_id)`.
4. Deterministic untrusted metadata bindings, perception
   records, sealed decisions, and perception cards that
   never invent a winner and never restore a fact.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the sealed card, audit replay, and
   bounded perception budgets.

It integrates with, but does not replace:

- **Dropped-Packet Omission Plane:** supplies the omitted
  member this plane may nominate. This plane never puts
  that member back and never rewrites the member body.
- **Perception Context Packet Plane:** the cited receipt
  hash is copied. This plane never reattaches the dropped
  citation and never inlines the packet body.
- **Attestation Perception Card Plane:** the cited receipt
  hash is copied. This plane never re-perceives that card
  as a new attestation.
- **Tool-Read Receipt Attestation Plane:** `ACKED` stays
  the copied effect observation. This plane never re-binds
  a provider receipt.
- **Extended Working-Set Purpose Gate Plane:** the cited
  gate kind is copied. This plane never authorizes
  `TOOL_MUTATE` or a body read.
- **SLA Extension Certificate Plane:** the successor clock
  is copied. This plane never re-arms a clock and never
  treats a re-armed clock as `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  vector, seal, publish, and notify units.

### Non-goals

- Letting an LLM decide that `ACKED` "probably means the
  fact is true enough to show."
- Discovering omitted members by scanning a board, a
  working-set table, or a citation-drop ledger.
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative cards from columnar or
  vector projections.
- Cross-account perception or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, or fact bodies
  on the perception card.
- Claiming distributed atomicity with external notify
  providers.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because a card repeated an attested receipt.
- Putting an omitted member back by writing `ATTACHED`,
  `INCLUDED`, or `RESTORED`.
- Opening another nested expiry-containment-review-
  resolution plane from a perception card.
- Publishing more than one card per session.
- Showing a `PERMANENT_QUARANTINE` body because the member
  was perceived.

## 3. Product contract

### 3.1 Perception profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_OMISSION_MEMBER`,
  `SEALED_PERCEPTION_CARD`, `SEALED_ATTEST_CERT`,
  `SEALED_TOOL_READ_DECISION`, `SEALED_PROVIDER_RECEIPT`,
  `SEALED_EFFECT_INTENT`);
- compile threshold (distinct card-steward principals,
  minimum 2), max members per session (exactly 1), and max
  nominated members (exactly 1);
- compile policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `CARD_NEVER_RESTORES_FACTS`,
  `CARD_NEVER_INLINES_BODY`, `CARD_NEVER_CONFIRMS`,
  `ONE_MEMBER_PER_SESSION`, `OMITTED_ONLY`,
  `POINT_LOOKUP_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `MEMBER_NEVER_SCANNED`, `HALT_DENIES_BODY_READ`,
  `QUARANTINE_BODY_NEVER_VISIBLE`,
  `PRIOR_OMISSION_STEWARDS_EXCLUDED`,
  `PRIOR_COMPILER_STEWARDS_EXCLUDED`,
  `PRIOR_PERCEPTION_STEWARDS_EXCLUDED`,
  `PRIOR_RECEIPT_STEWARDS_EXCLUDED`,
  `PRIOR_GATE_STEWARDS_EXCLUDED`,
  `PRIOR_EXTENSION_STEWARDS_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PERCEIVE`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_TOOL_READ_DECISION` (24 bytes). The longest
compile kind is `PERCEIVE_OMITTED_MEMBER` (23 bytes).

Approval and revocation require the authority fence
`approve_agent_opc_profile` / `revoke_agent_opc_profile`.
Direct `UPDATE` of a sealed profile or its perceive rules
is rejected. Profiles must be inserted as `DRAFT`.

### 3.2 Session and budget contract

A session is scoped by `account_id` and an idempotency key.
Budgets cover nominate, bind, seal, vector, publish, and
notify units, plus wall-clock, compile threshold, max
members, and max nominated members. Consumed units cannot
exceed the budget. Deadline must be after creation.
Evaluation consumes bind units. Sealing consumes seal
units. Publishing a card consumes publish units.
`max_members_per_session` and `max_nominated_members` are
both fixed at 1.

### 3.3 Nomination and metadata contract

Nomination is a point lookup of `(account_id, member_id)`
in the member catalog. `nominate_agent_opc_member` reads
that primary key and copies membership `OMITTED`, citation
`DROPPED`, the receipt hash, and the effect observation.
It does not store a fact body. `access_path` on the
nomination is `POINT_LOOKUP`. `MEMBER_SCAN` and
`LEDGER_SCAN` are rejected. A null member id is **FULL
SCAN REJECTED**.

Nomination succeeds only when the catalog membership is
`OMITTED`, the catalog citation is `DROPPED`, the source
kind is `SEALED_OMISSION_MEMBER`, and the key is still
`AWAITING_CONFIRMATION`. An `INCLUDED` or `ATTACHED`
member cannot be nominated. That would hide a live
citation by pretending it had already been omitted.

A metadata binding is append-only. It may repeat
membership, citation, the receipt hash, and the effect
observation already on the catalog row, tagged
`UNTRUSTED_METADATA`. It never walks members, never
inlines a body, and never moves the clock.

### 3.4 Card decision and perception-card contract

A sealed perception certificate names two distinct card
stewards, both prior omission stewards, both prior
compiler stewards, both perception stewards, both receipt
stewards, both prior gate stewards, and both prior
extension stewards. A card steward who matches a prior
omission steward, a prior compiler, a perception steward,
a receipt steward, a gate steward, or an extension steward
is rejected. A perception decision records:

- `compile_kind`: `PERCEIVE_OMITTED_MEMBER` is the only
  publish success; `HOLD_UNKNOWN_EFFECT`,
  `DENY_CARD_AS_TRUST`, `DENY_CARD_AS_RESTORE`,
  `DENY_BODY_INLINE`, `DENY_ACK_AS_TRUST`,
  `DENY_MEMBER_SCAN`, `DENY_NESTED_EXPIRY`, `SKIP`, and
  `UNKNOWN_EFFECT` never place a fact body;
- `membership_state`: `OMITTED` on success; `INCLUDED` is
  rejected because perception must not put the member back;
- `citation_state`: `DROPPED` on success, matching the
  catalog; writing `ATTACHED` would reattach the citation;
- `metadata_trust`: `UNTRUSTED_METADATA` only;
- `fact_disposition`: `DISPUTED_HELD`, `HALTED`, or
  `QUARANTINE_OMITTED` (never `RESTORED`);
- `body_visibility`: `OMITTED` on success (never
  `BODY_VISIBLE`);
- `clock_disposition`: `REARMED` is required for
  `PERCEIVE_OMITTED_MEMBER`, and the successor clock hash
  must differ from the prior clock hash;
- `receipt_disposition`: `ATTESTED` is required when the
  cited effect is `ACKED`;
- `effect_observation`: the only success citation is
  `ACKED`, and it stays an observation;
- `attested_key_kind`: must not be `TRUSTED_ENROLLED` or
  `TRUSTED_WITHIN_SKEW`;
- `access_path`: `POINT_LOOKUP` (never `MEMBER_SCAN` or
  `LEDGER_SCAN`);
- `opens_nested_expiry`: must be false;
- `inlines_fact_body`: must be false;
- `provider_receipt_hash`: must differ from
  `disputed_fact_hash`.

There is no fact-body column and no `resolved_fact_hash`
column. `PERCEIVE_OMITTED_MEMBER` requires
`SEALED_OMISSION_MEMBER`, `POINT_LOOKUP`,
`PERCEIVE_ATTESTED_RECEIPT`, `ALLOW_TOOL_READ`,
`TOOL_READ`, `OMITTED` membership, `OMITTED` body
visibility, `DISPUTED_HELD`, `EXTENDED_HALT`,
`REQUIRE_HUMAN`, `NARROWS`, `AWAITING_CONFIRMATION`,
`UNTRUSTED_METADATA`, `DROPPED`, and a non-silent `ACKED`
receipt whose hash differs from the disputed fact hash.
The catalog citation must still be `DROPPED` and the
catalog membership must still be `OMITTED`.

The perception card is what an agent reads. It stores
membership `OMITTED`, citation `DROPPED`, the effect
observation, the receipt hash, and the disputed-fact hash
as separate untrusted metadata. `card_body` must not
contain `factBody`, `fact_body`, or `resolvedFactHash`.
The card is sealed at insert. Perception does not rewrite
the upstream member body and does not move the citation
back to `ATTACHED`.

### 3.5 Notify and publication contract

Notify intents start as `PREPARED`. Identity columns are
immutable after insert. A missing or ambiguous provider
response is `UNKNOWN_EFFECT`. `ACKED` on a notify intent
means the notifier accepted the card notice. It does not
rewrite `effect_observation`, restore a fact, or include
the member in a working set.

`publish_agent_opc_card` is the writer that appends a
publication record. It point-looks up
`(account_id, member_id)` and the sealed card. It requires
catalog membership `OMITTED` and catalog citation
`DROPPED`. A publication does not delete the historical
receipt hash. It does not inline a fact. It does not
promote the key.

## 4. Deterministic invariants

1. Every row and every access index leads with
   `account_id`.
2. Profiles enter as `DRAFT` and leave `DRAFT` only through
   the approval or revocation authority fence.
3. Card stewards are distinct from each other, from both
   prior omission stewards, from both prior compiler
   stewards, from both perception stewards, from both
   receipt stewards, from both prior gate stewards, and
   from both prior extension stewards.
4. A session nominates at most one member and seals at
   most one perception card.
5. `ACKED` on a perception decision requires
   `receipt_disposition = ATTESTED` and
   `silence_inferred = false`. `ACKED` does not write
   `TRUSTED_ENROLLED`.
6. `TRUSTED_ENROLLED` and `TRUSTED_WITHIN_SKEW` are
   rejected on the decision and on the card.
7. `RESTORED`, `BODY_VISIBLE`, and `INCLUDED` are rejected.
   A card is not a fact restore and not a reattach.
8. `inlines_fact_body` is false. `card_body` cannot carry
   a fact body.
9. `TOOL_MUTATE` is rejected. `MEMBER_SCAN` and
   `LEDGER_SCAN` are rejected.
10. `opens_nested_expiry` must be false. This plane does
    not start another expiry cycle.
11. Purpose `AMPLIFIES` is rejected. After a hop, the
    requested purpose hash must differ from the donor
    purpose hash.
12. The provider receipt hash must differ from the disputed
    fact hash.
13. `PERCEIVE_OMITTED_MEMBER` is legal only when the
    catalog membership is `OMITTED` and the catalog
    citation is `DROPPED`. An `INCLUDED` member is not
    perceived by this plane.
14. Metadata trust is `UNTRUSTED_METADATA`. Membership
    `OMITTED` and citation `DROPPED` are repeated only as
    that untrusted metadata.
15. Unscoped catalog or board access is **FULL SCAN
    REJECTED**.

## 5. Execution model

Open, nominate, bind, evaluate, seal, publish, and
effect-prepare each run in one ACID row-store transaction
with session compare-and-swap. Card seal never joins a
neighbor board write, never updates the disputed fact, and
never rewrites the successor clock, the attested key, or
the upstream member body.

Columnar synopses may count perceived, held, unknown, and
denied cards for an account. They are not authoritative.
Vector search discovers profile tags inside an
account-owned partition. It never returns a fact body and
never authorizes seal.

External notify providers are outside the ACID boundary.
Until a notify receipt is bound, the notify observation
remains `UNKNOWN_EFFECT`. That uncertainty does not change
the cited tool-read effect and does not include the
omitted member.

## 6. Lifecycle

### 6.1 Draft and approve

A steward inserts a `DRAFT` profile and at least one
dual-control perceive rule. Approval checks the definition
hash and rule count, then sets `APPROVED` through
`approve_agent_opc_profile`.

### 6.2 Open and nominate

A session opens under an approved profile. Nomination
calls `nominate_agent_opc_member`, which copies one catalog
row by primary key `(account_id, member_id)`. It does not
filter the catalog by similarity and it does not scan
boards. A member whose membership is still `INCLUDED`, or
whose citation is still `ATTACHED`, is rejected.

### 6.3 Bind and evaluate

Bind appends an untrusted metadata candidate. Evaluate
emits a perception decision. Silence evaluates to
`HOLD_UNKNOWN_EFFECT` or `DENY_ACK_AS_TRUST`, never to
`PERCEIVE_OMITTED_MEMBER`. An included member cannot be
perceived as omitted. A member scan cannot be evaluated
into success.

### 6.4 Seal

Seal writes the perception certificate, the decision, and
the perception card in the same transaction. Stewards who
omitted the member, compiled the upstream packet, perceived
the prior card, attested the receipt, gated the citation,
or extended the clock cannot seal this card.

### 6.5 Publish and notify

`publish_agent_opc_card` appends a reason
(`MEMBER_OMITTED`, `RETRACTED`, `QUARANTINED`,
`KEY_REVOKED`) after a second point lookup. Notify is
prepared, then dispatched. Ambiguity becomes
`UNKNOWN_EFFECT`. Neither step rewrites the card body.

### 6.6 Close and retain

Close is explicit. Audit events stay hash-chained. Profile
embeddings may be refreshed from the approved definition.
They are not a second source of authorization. A published
card remains replayable and is not a live attachment.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type MemberId = string & { readonly brand: "MemberId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type CardId = string & { readonly brand: "CardId" };
type MetadataBindingId = string & { readonly brand: "MetadataBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_OMITTED_MEMBER"
  | "BIND_UNTRUSTED_METADATA"
  | "EVALUATE_OMISSION_PERCEPTION"
  | "SEAL_OMISSION_PERCEPTION"
  | "PUBLISH_OMISSION_PERCEPTION"
  | "PREPARE_PERCEPTION_NOTIFY"
  | "PERCEPTION_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type OmissionPerceptionBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "MEMBER_MISSING"
  | "METADATA_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "CARD_AS_TRUST_DENIED"
  | "SILENCE_AS_ACK_DENIED"
  | "CARD_AS_CONFIRMATION_DENIED"
  | "CARD_AS_RESTORE_DENIED"
  | "BODY_INLINE_DENIED"
  | "HALT_READ_DENIED"
  | "TOOL_MUTATE_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "MEMBER_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "CARD_AS_FACT_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
  | "CITATION_STILL_ATTACHED"
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
  | "SEALED_OMISSION_MEMBER"
  | "SEALED_PERCEPTION_CARD"
  | "SEALED_ATTEST_CERT"
  | "SEALED_TOOL_READ_DECISION"
  | "SEALED_PROVIDER_RECEIPT"
  | "SEALED_EFFECT_INTENT";

type AccessPath = "POINT_LOOKUP" | "MEMBER_SCAN" | "LEDGER_SCAN";

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
  | "PERCEIVE_OMITTED_MEMBER"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_CARD_AS_TRUST"
  | "DENY_CARD_AS_RESTORE"
  | "DENY_BODY_INLINE"
  | "DENY_ACK_AS_TRUST"
  | "DENY_MEMBER_SCAN"
  | "DENY_NESTED_EXPIRY"
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

type CitationState = "DROPPED" | "ATTACHED" | "HELD" | "UNKNOWN_EFFECT";

type MembershipState = "OMITTED" | "INCLUDED" | "HELD" | "UNKNOWN_EFFECT";

type MetadataTrust = "UNTRUSTED_METADATA";

type EffectIntentStatus = "PREPARED" | "DISPATCHED" | "ACKED" | "FAILED" | "UNKNOWN_EFFECT";

interface OmissionPerceptionBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly publishUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly compileThreshold: number;
  readonly maxMembersPerSession: 1;
  readonly maxNominatedMembers: 1;
}

interface OmissionPerceptionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly compileThreshold: number;
  readonly maxMembersPerSession: 1;
  readonly maxNominatedMembers: 1;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface OmissionPerceptionSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: OmissionPerceptionBudget;
  readonly consumed: Omit<
    OmissionPerceptionBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxMembersPerSession" | "maxNominatedMembers"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface OmittedMemberNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly memberId: MemberId;
  readonly sourceKind: SourceKind;
  readonly accessPath: AccessPath;
  readonly gateKind: GateKind;
  readonly gateAction: GateAction;
  readonly effectObservation: EffectObservation;
  readonly receiptDisposition: ReceiptDisposition;
  readonly silenceInferred: boolean;
  readonly citationState: CitationState;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface UntrustedOmissionMetadataBinding {
  readonly accountId: AccountId;
  readonly metadataBindingId: MetadataBindingId;
  readonly sessionId: SessionId;
  readonly memberId: MemberId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly metadataTrust: MetadataTrust;
  readonly inlinesFactBody: false;
  readonly capturedAt: Timestamp;
}

interface OmissionPerceptionCompileRecord {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly memberId: MemberId;
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

interface OmissionPerceptionDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly memberId: MemberId;
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
  readonly membershipState: MembershipState;
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

interface OmissionPerceptionCertificate {
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
  readonly cardStewardA: string;
  readonly cardStewardB: string;
  readonly priorCompilerStewardA: string;
  readonly priorCompilerStewardB: string;
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

interface OmissionNotifyObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentOmissionPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly cardId: CardId;
  readonly memberId: MemberId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly membershipState: MembershipState;
  readonly citationState: CitationState;
  readonly metadataTrust: MetadataTrust;
  readonly effectObservation: EffectObservation;
  readonly providerReceiptHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly factDisposition: FactDisposition;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly bodyVisibility: BodyVisibility;
  readonly inlinesFactBody: false;
  readonly omittedMemberCount: number;
  readonly attachedPacketRejectedCount: number;
  readonly unknownEffectCount: number;
  readonly silenceDeniedCount: number;
  readonly disputedHeldCount: number;
  readonly restoreDeniedCount: number;
  readonly trustDeniedCount: number;
  readonly bodyInlineDeniedCount: number;
  readonly packetScanDeniedCount: number;
  readonly uncertainNotifyIntents: readonly OmissionNotifyObservation[];
  readonly remainingBudget: Omit<
    OmissionPerceptionBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxMembersPerSession" | "maxNominatedMembers"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly OmissionPerceptionBlockedReason[];
  readonly memberHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateOmissionPerceptionSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: OmissionPerceptionBudget;
}

interface NominateOmittedMemberInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly memberId: MemberId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedProviderReceiptHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindOmissionPerceptionMetadataInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly memberId: MemberId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly silenceInferred: boolean;
  readonly idempotencyKey: string;
}

interface EvaluateOmissionPerceptionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedProviderReceiptHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealOmissionPerceptionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly cardStewardA: string;
  readonly cardStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface RecordOmissionPerceptionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly memberId: MemberId;
  readonly cardId: CardId;
  readonly reasonCode: "MEMBER_OMITTED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareOmissionPerceptionNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface OmissionNotifyUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion: "RETRY_SAME_OMISSION" | "ACCEPT_OBSERVATION" | "REJECT_OMISSION" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseOmissionPerceptionSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface PublishOmissionPerceptionCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type OmissionPerceptionDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: OmissionPerceptionSession;
      readonly certificate?: OmissionPerceptionCertificate;
      readonly omissionDecision?: OmissionPerceptionDecision;
      readonly nomination?: OmittedMemberNominationReceipt;
      readonly metadata?: UntrustedOmissionMetadataBinding;
      readonly compile?: OmissionPerceptionCompileRecord;
      readonly perception: AgentOmissionPerceptionCard;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: OmissionPerceptionBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly perception?: AgentOmissionPerceptionCard;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE opc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE opc_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'COMPILING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_source_kind AS ENUM (
  'SEALED_OMISSION_MEMBER',
  'SEALED_PERCEPTION_CARD',
  'SEALED_ATTEST_CERT',
  'SEALED_TOOL_READ_DECISION',
  'SEALED_PROVIDER_RECEIPT',
  'SEALED_EFFECT_INTENT'
);
CREATE TYPE opc_access_path AS ENUM ('POINT_LOOKUP', 'MEMBER_SCAN', 'LEDGER_SCAN');
CREATE TYPE opc_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE opc_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE opc_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE opc_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE opc_perceive_kind AS ENUM (
  'PERCEIVE_ATTESTED_RECEIPT', 'HOLD_UNKNOWN_EFFECT', 'DENY_SILENCE_AS_ACK',
  'DENY_CARD_AS_RESTORE', 'DENY_ACK_AS_TRUST', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE opc_compile_kind AS ENUM (
  'PERCEIVE_OMITTED_MEMBER', 'HOLD_UNKNOWN_EFFECT', 'DENY_CARD_AS_TRUST',
  'DENY_CARD_AS_RESTORE', 'DENY_BODY_INLINE', 'DENY_ACK_AS_TRUST',
  'DENY_MEMBER_SCAN', 'DENY_NESTED_EXPIRY', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE opc_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE opc_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_receipt_disposition AS ENUM (
  'UNBOUND', 'ATTESTED', 'SILENCE', 'REJECTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_citation_state AS ENUM (
  'DROPPED', 'ATTACHED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_membership_state AS ENUM (
  'OMITTED', 'INCLUDED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE opc_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE opc_catalog_status AS ENUM (
  'DROPPED', 'ATTACHED', 'HELD', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_opc_profile_authority NOLOGIN;

CREATE TABLE agent_opc_authorization_evidence (
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

CREATE TABLE agent_opc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status opc_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_members_per_session SMALLINT NOT NULL
    CHECK (max_members_per_session = 1),
  max_nominated_members SMALLINT NOT NULL
    CHECK (max_nominated_members = 1),
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
    REFERENCES agent_opc_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_opc_profile_perceive_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  compile_threshold SMALLINT NOT NULL CHECK (compile_threshold BETWEEN 2 AND 8),
  max_members_per_session SMALLINT NOT NULL
    CHECK (max_members_per_session = 1),
  max_nominated_members SMALLINT NOT NULL
    CHECK (max_nominated_members = 1),
  require_dual_control_compile BOOLEAN NOT NULL,
  compile_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_opc_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_opc_member_catalog (
  account_id BIGINT NOT NULL,
  member_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  member_ref TEXT NOT NULL,
  source_kind opc_source_kind NOT NULL,
  perceive_kind opc_perceive_kind NOT NULL,
  gate_kind opc_gate_kind NOT NULL,
  gate_action opc_gate_action NOT NULL,
  terminal_kind opc_terminal_kind NOT NULL,
  placement_kind opc_placement_kind NOT NULL,
  key_lifecycle opc_key_lifecycle NOT NULL,
  clock_lifecycle opc_clock_lifecycle NOT NULL,
  attested_key_kind opc_attested_key_kind NOT NULL,
  status opc_catalog_status NOT NULL,
  citation_state opc_citation_state NOT NULL,
  membership_state opc_membership_state NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  receipt_disposition opc_receipt_disposition NOT NULL,
  effect_observation opc_effect_observation NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  fact_disposition opc_fact_disposition NOT NULL,
  body_visibility opc_body_visibility NOT NULL,
  clock_disposition opc_clock_disposition NOT NULL,
  metadata_trust opc_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  prior_compiler_steward_a TEXT NOT NULL,
  prior_compiler_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  prior_omission_steward_a TEXT NOT NULL,
  prior_omission_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, member_id),
  UNIQUE (account_id, member_ref, source_kind),
  CHECK (prior_compiler_steward_a <> prior_compiler_steward_b),
  CHECK (perception_steward_a <> perception_steward_b),
  CHECK (receipt_steward_a <> receipt_steward_b),
  CHECK (prior_gate_steward_a <> prior_gate_steward_b),
  CHECK (prior_extension_steward_a <> prior_extension_steward_b),
  CHECK (prior_omission_steward_a <> prior_omission_steward_b),
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
    (citation_state = 'DROPPED' AND status = 'DROPPED') OR
    (citation_state = 'ATTACHED' AND status = 'ATTACHED') OR
    (citation_state = 'HELD' AND status = 'HELD') OR
    (citation_state = 'UNKNOWN_EFFECT' AND status = 'UNKNOWN_EFFECT')
  ),
  CHECK (citation_state <> 'DROPPED' OR membership_state = 'OMITTED')
);

CREATE TABLE agent_opc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status opc_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_publish_units BIGINT NOT NULL CHECK (budget_publish_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_publish_units BIGINT NOT NULL CHECK (consumed_publish_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_members_per_session SMALLINT NOT NULL
    CHECK (max_members_per_session = 1),
  max_nominated_members SMALLINT NOT NULL
    CHECK (max_nominated_members = 1),
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
    REFERENCES agent_opc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_opc_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at)
);

CREATE TABLE agent_opc_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  member_id UUID NOT NULL,
  access_path opc_access_path NOT NULL,
  source_kind opc_source_kind NOT NULL,
  gate_kind opc_gate_kind NOT NULL,
  gate_action opc_gate_action NOT NULL,
  effect_observation opc_effect_observation NOT NULL,
  receipt_disposition opc_receipt_disposition NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  citation_state opc_citation_state NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, member_id)
    REFERENCES agent_opc_member_catalog (account_id, member_id),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (citation_state = 'DROPPED'),
  CHECK (source_kind = 'SEALED_OMISSION_MEMBER'),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_opc_metadata_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  member_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  effect_observation opc_effect_observation NOT NULL,
  metadata_trust opc_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, member_id)
    REFERENCES agent_opc_member_catalog (account_id, member_id),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_opc_perceive_record (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  member_id UUID NOT NULL,
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
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, member_id)
    REFERENCES agent_opc_member_catalog (account_id, member_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_opc_card_certificate (
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
  card_steward_a TEXT NOT NULL,
  card_steward_b TEXT NOT NULL,
  prior_compiler_steward_a TEXT NOT NULL,
  prior_compiler_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
  prior_gate_steward_a TEXT NOT NULL,
  prior_gate_steward_b TEXT NOT NULL,
  prior_extension_steward_a TEXT NOT NULL,
  prior_extension_steward_b TEXT NOT NULL,
  prior_omission_steward_a TEXT NOT NULL,
  prior_omission_steward_b TEXT NOT NULL,
  decision_watermark SMALLINT NOT NULL CHECK (decision_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_opc_perceive_record (account_id, compile_id),
  CHECK (card_steward_a <> card_steward_b),
  CHECK (prior_omission_steward_a <> prior_omission_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_opc_card_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  member_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_kind opc_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status opc_binding_status NOT NULL,
  placement_kind opc_placement_kind NOT NULL,
  key_lifecycle opc_key_lifecycle NOT NULL,
  clock_lifecycle opc_clock_lifecycle NOT NULL,
  attested_key_kind opc_attested_key_kind NOT NULL,
  terminal_kind opc_terminal_kind NOT NULL,
  gate_kind opc_gate_kind NOT NULL,
  gate_action opc_gate_action NOT NULL,
  perceive_kind opc_perceive_kind NOT NULL,
  compile_kind opc_compile_kind NOT NULL,
  body_visibility opc_body_visibility NOT NULL,
  fact_disposition opc_fact_disposition NOT NULL,
  clock_disposition opc_clock_disposition NOT NULL,
  receipt_disposition opc_receipt_disposition NOT NULL,
  effect_observation opc_effect_observation NOT NULL,
  purpose_relation opc_purpose_relation NOT NULL,
  access_path opc_access_path NOT NULL,
  citation_state opc_citation_state NOT NULL,
  membership_state opc_membership_state NOT NULL,
  metadata_trust opc_metadata_trust NOT NULL,
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
  UNIQUE (account_id, certificate_id, member_id, decision_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_opc_card_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, member_id)
    REFERENCES agent_opc_member_catalog (account_id, member_id)
);

CREATE TABLE agent_opc_perception_card (
  account_id BIGINT NOT NULL,
  card_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  member_id UUID NOT NULL,
  membership_state opc_membership_state NOT NULL,
  citation_state opc_citation_state NOT NULL,
  metadata_trust opc_metadata_trust NOT NULL,
  effect_observation opc_effect_observation NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  fact_disposition opc_fact_disposition NOT NULL,
  attested_key_kind opc_attested_key_kind NOT NULL,
  body_visibility opc_body_visibility NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, card_id),
  UNIQUE (account_id, session_id),
  UNIQUE (account_id, member_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_opc_card_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, member_id)
    REFERENCES agent_opc_member_catalog (account_id, member_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (membership_state = 'OMITTED'),
  CHECK (citation_state = 'DROPPED'),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (inlines_fact_body = false),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (card_body ? 'factBody')),
  CHECK (NOT (card_body ? 'fact_body')),
  CHECK (NOT (card_body ? 'resolvedFactHash')),
  CHECK (card_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (card_body->>'factDisposition' IS DISTINCT FROM 'RESTORED'),
  CHECK (card_body->>'bodyVisibility' IS DISTINCT FROM 'BODY_VISIBLE'),
  CHECK (card_body->>'membershipState' = 'OMITTED'),
  CHECK (card_body->>'citationState' = 'DROPPED'),
  CHECK (card_body->>'metadataTrust' = 'UNTRUSTED_METADATA')
);

CREATE TABLE agent_opc_publication_record (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  member_id UUID NOT NULL,
  card_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  effect_observation opc_effect_observation NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'MEMBER_OMITTED', 'RETRACTED', 'QUARANTINED', 'KEY_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, member_id),
  FOREIGN KEY (account_id, member_id)
    REFERENCES agent_opc_member_catalog (account_id, member_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_opc_perception_card (account_id, card_id)
);

CREATE TABLE agent_opc_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status opc_effect_status NOT NULL,
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
    REFERENCES agent_opc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_opc_card_certificate (account_id, certificate_id)
);

CREATE TABLE agent_opc_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN (
      'NOMINATE', 'BIND', 'SEAL', 'VECTOR', 'PUBLISH', 'NOTIFY'
    )
  ),
  units BIGINT NOT NULL CHECK (units >= 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id)
);

CREATE TABLE agent_opc_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_opc_session (account_id, session_id)
);

CREATE TABLE agent_opc_command_result (
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

CREATE TABLE agent_opc_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_opc_audit_event (
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

CREATE TABLE agent_opc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_opc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_opc_profile()
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
       OR NEW.max_members_per_session IS DISTINCT FROM OLD.max_members_per_session
       OR NEW.max_nominated_members IS DISTINCT FROM OLD.max_nominated_members
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
    IF current_setting('app.opc_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.opc_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_opc_profile_protect
BEFORE INSERT OR UPDATE ON agent_opc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_profile();

CREATE FUNCTION protect_agent_opc_profile_perceive_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status opc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_opc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile compile rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_opc_profile_perceive_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_opc_profile_perceive_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_profile_perceive_rule();

CREATE FUNCTION protect_agent_opc_member_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_catalog$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'member catalog identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_catalog$;

CREATE TRIGGER agent_opc_member_catalog_protect
BEFORE INSERT OR UPDATE ON agent_opc_member_catalog
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_member_catalog();

CREATE FUNCTION protect_agent_opc_metadata_binding()
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

CREATE TRIGGER agent_opc_metadata_binding_protect
BEFORE INSERT OR UPDATE ON agent_opc_metadata_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_metadata_binding();

CREATE FUNCTION protect_agent_opc_card_certificate()
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
       OR NEW.card_steward_a IS DISTINCT FROM OLD.card_steward_a
       OR NEW.card_steward_b IS DISTINCT FROM OLD.card_steward_b
       OR NEW.prior_compiler_steward_a IS DISTINCT FROM OLD.prior_compiler_steward_a
       OR NEW.prior_compiler_steward_b IS DISTINCT FROM OLD.prior_compiler_steward_b
       OR NEW.perception_steward_a IS DISTINCT FROM OLD.perception_steward_a
       OR NEW.perception_steward_b IS DISTINCT FROM OLD.perception_steward_b
       OR NEW.receipt_steward_a IS DISTINCT FROM OLD.receipt_steward_a
       OR NEW.receipt_steward_b IS DISTINCT FROM OLD.receipt_steward_b
       OR NEW.prior_gate_steward_a IS DISTINCT FROM OLD.prior_gate_steward_a
       OR NEW.prior_gate_steward_b IS DISTINCT FROM OLD.prior_gate_steward_b
       OR NEW.prior_extension_steward_a
         IS DISTINCT FROM OLD.prior_extension_steward_a
       OR NEW.prior_extension_steward_b
         IS DISTINCT FROM OLD.prior_extension_steward_b
       OR NEW.prior_omission_steward_a
         IS DISTINCT FROM OLD.prior_omission_steward_a
       OR NEW.prior_omission_steward_b
         IS DISTINCT FROM OLD.prior_omission_steward_b THEN
      RAISE EXCEPTION 'perception certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.card_steward_a = NEW.card_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct card stewards';
  END IF;
  IF NEW.card_steward_a = NEW.prior_compiler_steward_a
     OR NEW.card_steward_a = NEW.prior_compiler_steward_b
     OR NEW.card_steward_b = NEW.prior_compiler_steward_a
     OR NEW.card_steward_b = NEW.prior_compiler_steward_b
     OR NEW.card_steward_a = NEW.perception_steward_a
     OR NEW.card_steward_a = NEW.perception_steward_b
     OR NEW.card_steward_b = NEW.perception_steward_a
     OR NEW.card_steward_b = NEW.perception_steward_b
     OR NEW.card_steward_a = NEW.receipt_steward_a
     OR NEW.card_steward_a = NEW.receipt_steward_b
     OR NEW.card_steward_b = NEW.receipt_steward_a
     OR NEW.card_steward_b = NEW.receipt_steward_b
     OR NEW.card_steward_a = NEW.prior_gate_steward_a
     OR NEW.card_steward_a = NEW.prior_gate_steward_b
     OR NEW.card_steward_b = NEW.prior_gate_steward_a
     OR NEW.card_steward_b = NEW.prior_gate_steward_b
     OR NEW.card_steward_a = NEW.prior_extension_steward_a
     OR NEW.card_steward_a = NEW.prior_extension_steward_b
     OR NEW.card_steward_b = NEW.prior_extension_steward_a
     OR NEW.card_steward_b = NEW.prior_extension_steward_b
     OR NEW.card_steward_a = NEW.prior_omission_steward_a
     OR NEW.card_steward_a = NEW.prior_omission_steward_b
     OR NEW.card_steward_b = NEW.prior_omission_steward_a
     OR NEW.card_steward_b = NEW.prior_omission_steward_b THEN
    RAISE EXCEPTION 'prior-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_opc_card_certificate_protect
BEFORE INSERT OR UPDATE ON agent_opc_card_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_card_certificate();

CREATE FUNCTION protect_agent_opc_card_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
DECLARE
  catalog_citation opc_citation_state;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.member_id IS DISTINCT FROM OLD.member_id
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
       OR NEW.membership_state IS DISTINCT FROM OLD.membership_state
       OR NEW.metadata_trust IS DISTINCT FROM OLD.metadata_trust
       OR NEW.requested_purpose_hash IS DISTINCT FROM OLD.requested_purpose_hash
       OR NEW.halt_scope_hash IS DISTINCT FROM OLD.halt_scope_hash
       OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id
       OR NEW.silence_inferred IS DISTINCT FROM OLD.silence_inferred
       OR NEW.opens_nested_expiry IS DISTINCT FROM OLD.opens_nested_expiry
       OR NEW.inlines_fact_body IS DISTINCT FROM OLD.inlines_fact_body THEN
      RAISE EXCEPTION 'perception decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'card-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' OR NEW.membership_state = 'INCLUDED' THEN
    RAISE EXCEPTION 'card-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'halt-read fence blocks exposing a disputed fact body';
  END IF;

  IF NEW.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.gate_action = 'TOOL_MUTATE' THEN
    RAISE EXCEPTION 'tool-mutate fence blocks mutation from an omission';
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

  IF NEW.metadata_trust IS DISTINCT FROM 'UNTRUSTED_METADATA' THEN
    RAISE EXCEPTION 'metadata fence requires UNTRUSTED_METADATA';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than citation attenuation';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence blocks opening another expiry plane';
  END IF;

  IF NEW.access_path IN ('MEMBER_SCAN', 'LEDGER_SCAN') THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.clock_disposition = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks rewinding a successor clock';
  END IF;

  SELECT citation_state INTO catalog_citation
  FROM agent_opc_member_catalog
  WHERE account_id = NEW.account_id
    AND member_id = NEW.member_id;

  IF NEW.compile_kind = 'PERCEIVE_OMITTED_MEMBER'
     AND catalog_citation IS DISTINCT FROM 'DROPPED' THEN
    RAISE EXCEPTION 'included-member fence blocks perceiving a live citation';
  END IF;

  IF NEW.compile_kind = 'PERCEIVE_OMITTED_MEMBER'
     AND (
       NEW.source_kind IS DISTINCT FROM 'SEALED_OMISSION_MEMBER'
       OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
       OR NEW.gate_kind IS DISTINCT FROM 'ALLOW_TOOL_READ'
       OR NEW.gate_action IS DISTINCT FROM 'TOOL_READ'
       OR NEW.perceive_kind IS DISTINCT FROM 'PERCEIVE_ATTESTED_RECEIPT'
       OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
       OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
       OR NEW.clock_disposition IS DISTINCT FROM 'REARMED'
       OR NEW.placement_kind IS DISTINCT FROM 'EXTENDED_HALT'
       OR NEW.terminal_kind IS DISTINCT FROM 'REQUIRE_HUMAN'
       OR NEW.purpose_relation IS DISTINCT FROM 'NARROWS'
       OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
       OR NEW.clock_lifecycle IS DISTINCT FROM 'ATTESTED'
       OR NEW.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR NEW.effect_observation IS DISTINCT FROM 'ACKED'
       OR NEW.citation_state IS DISTINCT FROM 'DROPPED'
       OR NEW.membership_state IS DISTINCT FROM 'OMITTED'
       OR NEW.metadata_trust IS DISTINCT FROM 'UNTRUSTED_METADATA'
       OR NEW.silence_inferred
       OR NEW.inlines_fact_body
       OR NEW.opens_nested_expiry
       OR NEW.successor_clock_hash IS NOT DISTINCT FROM NEW.prior_clock_hash
     ) THEN
    RAISE EXCEPTION 'perceive fence requires one omitted member by point lookup';
  END IF;

  IF NEW.compile_kind = 'PERCEIVE_OMITTED_MEMBER'
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

CREATE TRIGGER agent_opc_card_decision_protect
BEFORE INSERT OR UPDATE ON agent_opc_card_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_card_decision();

CREATE FUNCTION protect_agent_opc_perception_card()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
DECLARE
  catalog_citation opc_citation_state;
  decision_found BOOLEAN;
BEGIN
  IF NEW.card_body ? 'factBody'
     OR NEW.card_body ? 'fact_body'
     OR NEW.card_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'card-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED'
     OR NEW.body_visibility = 'BODY_VISIBLE'
     OR NEW.membership_state = 'INCLUDED'
     OR NEW.citation_state = 'ATTACHED' THEN
    RAISE EXCEPTION 'card-as-restore fence blocks restoring disputed facts';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'perception card metadata is immutable';
  END IF;

  SELECT citation_state INTO catalog_citation
  FROM agent_opc_member_catalog
  WHERE account_id = NEW.account_id
    AND member_id = NEW.member_id;

  IF catalog_citation IS DISTINCT FROM 'DROPPED' THEN
    RAISE EXCEPTION 'included-member fence blocks perceiving a live citation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM agent_opc_card_decision
    WHERE account_id = NEW.account_id
      AND certificate_id = NEW.certificate_id
      AND member_id = NEW.member_id
      AND compile_kind = 'PERCEIVE_OMITTED_MEMBER'
      AND membership_state = 'OMITTED'
      AND citation_state = 'DROPPED'
  ) INTO decision_found;

  IF decision_found IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'perception card requires a sealed perceive decision';
  END IF;

  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_opc_perception_card_protect
BEFORE INSERT OR UPDATE ON agent_opc_perception_card
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_perception_card();

CREATE FUNCTION protect_agent_opc_effect_intent()
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

CREATE TRIGGER agent_opc_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_opc_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_opc_effect_intent();

CREATE FUNCTION approve_agent_opc_profile(
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
  stored_status opc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_opc_profile
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
  FROM agent_opc_profile_perceive_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_compile IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control compile rule';
  END IF;

  PERFORM set_config(
    'app.opc_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_opc_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_opc_profile(
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
  stored_status opc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_opc_profile
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
    'app.opc_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_opc_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_opc_member(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_member_id UUID,
  recipient_nomination_id UUID,
  nomination_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  catalog agent_opc_member_catalog%ROWTYPE;
BEGIN
  IF recipient_member_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_opc_member_catalog
  WHERE account_id = tenant_id
    AND member_id = recipient_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member point lookup missed';
  END IF;

  IF catalog.citation_state IS DISTINCT FROM 'DROPPED'
     OR catalog.status IS DISTINCT FROM 'DROPPED'
     OR catalog.membership_state IS DISTINCT FROM 'OMITTED'
     OR catalog.source_kind IS DISTINCT FROM 'SEALED_OMISSION_MEMBER' THEN
    RAISE EXCEPTION 'included-member fence blocks nominating a live citation';
  END IF;

  IF catalog.effect_observation = 'ACKED'
     AND (
       catalog.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR catalog.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence';
  END IF;

  IF catalog.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'card-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF catalog.inlines_fact_body OR catalog.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  INSERT INTO agent_opc_nomination (
    account_id, nomination_id, session_id, member_id,
    access_path, source_kind, gate_kind, gate_action,
    effect_observation, receipt_disposition, silence_inferred,
    citation_state, disputed_fact_hash, provider_receipt_hash,
    nomination_hash, nominated_at
  ) VALUES (
    tenant_id, recipient_nomination_id, recipient_session_id,
    recipient_member_id, 'POINT_LOOKUP', catalog.source_kind,
    catalog.gate_kind, catalog.gate_action,
    catalog.effect_observation, catalog.receipt_disposition,
    catalog.silence_inferred, catalog.citation_state,
    catalog.disputed_fact_hash, catalog.provider_receipt_hash,
    nomination_digest, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION publish_agent_opc_card(
  tenant_id BIGINT,
  recipient_member_id UUID,
  recipient_card_id UUID,
  recipient_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $record_omission$
DECLARE
  catalog agent_opc_member_catalog%ROWTYPE;
  member agent_opc_perception_card%ROWTYPE;
BEGIN
  IF recipient_member_id IS NULL OR recipient_card_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_opc_member_catalog
  WHERE account_id = tenant_id
    AND member_id = recipient_member_id;

  IF NOT FOUND OR catalog.citation_state IS DISTINCT FROM 'DROPPED' THEN
    RAISE EXCEPTION 'perception card requires an omitted member point lookup';
  END IF;

  SELECT * INTO member
  FROM agent_opc_perception_card
  WHERE account_id = tenant_id
    AND card_id = recipient_card_id;

  IF NOT FOUND
     OR member.member_id IS DISTINCT FROM recipient_member_id
     OR member.membership_state IS DISTINCT FROM 'OMITTED'
     OR member.citation_state IS DISTINCT FROM 'DROPPED'
     OR member.inlines_fact_body THEN
    RAISE EXCEPTION 'perception card requires a sealed omitted member';
  END IF;

  INSERT INTO agent_opc_publication_record (
    account_id, record_id, member_id, card_id,
    provider_receipt_hash, effect_observation, reason_code, created_at
  ) VALUES (
    tenant_id, recipient_record_id, recipient_member_id, recipient_card_id,
    member.provider_receipt_hash, member.effect_observation,
    'MEMBER_OMITTED', clock_timestamp()
  );
END
$record_omission$;

CREATE FUNCTION reject_agent_opc_unscoped_scan(
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

ALTER FUNCTION approve_agent_opc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_opc_profile_authority;
ALTER FUNCTION revoke_agent_opc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_opc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_opc_profile_authority;
GRANT SELECT ON
  agent_opc_profile,
  agent_opc_profile_perceive_rule
TO agent_opc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_opc_profile TO agent_opc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_opc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_opc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_opc_profile FROM PUBLIC;

CREATE INDEX agent_opc_session_work_idx ON agent_opc_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_opc_session_profile_idx ON agent_opc_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_opc_decision_member_idx ON agent_opc_card_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_opc_decision_source_idx ON agent_opc_card_decision (
  account_id, member_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_opc_catalog_ref_idx ON agent_opc_member_catalog (
  account_id, member_ref, sealed_at DESC, member_id
);
CREATE INDEX agent_opc_catalog_kind_idx ON agent_opc_member_catalog (
  account_id, source_kind, sealed_at DESC, member_id
);
CREATE INDEX agent_opc_record_session_idx ON agent_opc_perceive_record (
  account_id, session_id, compiled_at DESC, compile_id
);
CREATE INDEX agent_opc_certificate_session_idx ON agent_opc_card_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_opc_nomination_session_idx ON agent_opc_nomination (
  account_id, session_id, nominated_at DESC, nomination_id
);
CREATE INDEX agent_opc_effect_work_idx ON agent_opc_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_opc_audit_time_idx ON agent_opc_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_opc_member_status_idx ON agent_opc_perception_card (
  account_id, membership_state, created_at DESC, card_id
);
CREATE INDEX agent_opc_command_expiry_idx ON agent_opc_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_opc_publication_record_member_idx ON agent_opc_publication_record (
  account_id, member_id, created_at DESC, record_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_opc_authorization_evidence',
    'agent_opc_profile',
    'agent_opc_profile_perceive_rule',
    'agent_opc_member_catalog',
    'agent_opc_session',
    'agent_opc_nomination',
    'agent_opc_metadata_binding',
    'agent_opc_perceive_record',
    'agent_opc_card_certificate',
    'agent_opc_card_decision',
    'agent_opc_perception_card',
    'agent_opc_publication_record',
    'agent_opc_effect_intent',
    'agent_opc_budget_ledger',
    'agent_opc_terminal_record',
    'agent_opc_command_result',
    'agent_opc_audit_head',
    'agent_opc_audit_event',
    'agent_opc_audit_anchor',
    'agent_opc_projection_checkpoint'
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

Open, nominate, bind, evaluate, seal, publish, and
effect-prepare each run in a single ACID row-store
transaction with session compare-and-swap. Card seal
never joins a neighbor board write, never updates the
disputed fact, and never rewrites the successor clock.
`publish_agent_opc_card` reads the catalog and the card
by primary key `(account_id, member_id)` and
`(account_id, card_id)`. It appends a publication record.
It does not scan working-set members and it does not
rewrite the card.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers set `app.account_id`
before query. Composite primary keys and every access index
lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open
API. Long-running notify work returns durable state, not a
synchronous board promise. Profile search discovers
procedural memory. It does not authorize a perception card.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentOpcSessionStatus {
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

enum AgentOpcCompileKind {
  PERCEIVE_OMITTED_MEMBER
  HOLD_UNKNOWN_EFFECT
  DENY_CARD_AS_TRUST
  DENY_CARD_AS_RESTORE
  DENY_BODY_INLINE
  DENY_ACK_AS_TRUST
  DENY_MEMBER_SCAN
  DENY_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentOpcCitationState {
  DROPPED
  ATTACHED
  HELD
  UNKNOWN_EFFECT
}

enum AgentOpcMembershipState {
  OMITTED
  INCLUDED
  HELD
  UNKNOWN_EFFECT
}

enum AgentOpcEffectObservation {
  ACKED
  FAILED
  DISPATCHED
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentOpcEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentOpcNextAction {
  NOMINATE_OMITTED_MEMBER
  BIND_UNTRUSTED_METADATA
  EVALUATE_OMISSION_PERCEPTION
  SEAL_OMISSION_PERCEPTION
  PUBLISH_OMISSION_PERCEPTION
  PREPARE_PERCEPTION_NOTIFY
  PERCEPTION_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentOpcBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  BUDGET_EXHAUSTED
  MEMBER_MISSING
  CARD_AS_TRUST_DENIED
  CARD_AS_RESTORE_DENIED
  BODY_INLINE_DENIED
  CITATION_STILL_ATTACHED
  NESTED_EXPIRY_DENIED
  MEMBER_SCAN_DENIED
  UNKNOWN_EFFECT
}

type AgentOpcProfile {
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

type AgentOpcSession {
  accountId: Long!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentOpcSessionStatus!
  stateRevision: Long!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentOpcMemberCatalogEntry {
  accountId: Long!
  memberId: ID!
  sourceKind: String!
  citationState: AgentOpcCitationState!
  gateKind: String!
  gateAction: String!
  disputedFactHash: SHA256!
  providerReceiptHash: SHA256!
  effectObservation: AgentOpcEffectObservation!
  status: String!
}

type AgentOpcCertificate {
  accountId: Long!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  compileKind: AgentOpcCompileKind!
  effectObservation: AgentOpcEffectObservation!
  sealedAt: DateTime!
}

type AgentOpcPerceptionCard {
  accountId: Long!
  sessionId: ID!
  cardId: ID!
  memberId: ID!
  status: AgentOpcSessionStatus!
  summary: String!
  membershipState: AgentOpcMembershipState!
  citationState: AgentOpcCitationState!
  metadataTrust: String!
  effectObservation: AgentOpcEffectObservation!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  factDisposition: String!
  attestedKeyKind: String!
  bodyVisibility: String!
  inlinesFactBody: Boolean!
  unknownEffectCount: Int!
  allowedNextActions: [AgentOpcNextAction!]!
  blockedReasons: [AgentOpcBlockedReason!]!
  memberHash: SHA256!
}

type AgentOpcAuditHead {
  accountId: Long!
  headSequence: Long!
  headHash: SHA256!
  updatedAt: DateTime!
}

type AgentOpcResult {
  decision: String!
  retryable: Boolean!
  reason: String!
  session: AgentOpcSession
  certificate: AgentOpcCertificate
  perception: AgentOpcPerceptionCard
  auditHash: SHA256!
}

input AgentOpcBudgetInput {
  nominateUnits: Int!
  bindUnits: Int!
  sealUnits: Int!
  vectorUnits: Int!
  publishUnits: Int!
  notifyUnits: Int!
  maxWallTimeMs: Int!
  compileThreshold: Int!
  maxMembersPerSession: Int!
  maxNominatedMembers: Int!
}

input CreateOmissionPerceptionSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentOpcBudgetInput!
}

input NominateOmittedMemberInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  memberId: ID!
  expectedDisputedFactHash: SHA256!
  expectedProviderReceiptHash: SHA256!
  idempotencyKey: String!
}

input BindOmissionPerceptionMetadataInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  memberId: ID!
  providerReceiptHash: SHA256!
  effectObservation: AgentOpcEffectObservation!
  silenceInferred: Boolean!
  idempotencyKey: String!
}

input EvaluateOmissionPerceptionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  expectedProviderReceiptHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealOmissionPerceptionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  compileId: ID!
  consumerRef: String!
  cardStewardA: String!
  cardStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input RecordOmissionPerceptionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  memberId: ID!
  cardId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input PrepareOmissionPerceptionNotifyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input RecordOmissionPerceptionNotifyUncertaintyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: String!
  idempotencyKey: String!
}

input CloseOmissionPerceptionSessionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input PublishOmissionPerceptionCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

type Query {
  omissionPerceptionProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentOpcProfile
  omissionPerceptionSession(accountId: Long!, sessionId: ID!): AgentOpcSession
  omissionMemberCatalogEntry(accountId: Long!, memberId: ID!): AgentOpcMemberCatalogEntry
  omissionPerceptionCertificate(accountId: Long!, certificateId: ID!): AgentOpcCertificate
  omissionPerceptionCard(accountId: Long!, cardId: ID!): AgentOpcPerceptionCard
  omissionPerceptionAuditReplay(accountId: Long!, sessionId: ID!): AgentOpcAuditHead
}

type Mutation {
  createOmissionPerceptionSession(input: CreateOmissionPerceptionSessionInput!): AgentOpcResult!
  nominateOmittedMember(input: NominateOmittedMemberInput!): AgentOpcResult!
  bindOmissionPerceptionMetadata(input: BindOmissionPerceptionMetadataInput!): AgentOpcResult!
  evaluateOmissionPerception(input: EvaluateOmissionPerceptionInput!): AgentOpcResult!
  sealOmissionPerception(input: SealOmissionPerceptionInput!): AgentOpcResult!
  recordOmissionPerception(input: RecordOmissionPerceptionInput!): AgentOpcResult!
  prepareOmissionPerceptionNotify(input: PrepareOmissionPerceptionNotifyInput!): AgentOpcResult!
  recordOmissionPerceptionNotifyUncertainty(input: RecordOmissionPerceptionNotifyUncertaintyInput!): AgentOpcResult!
  closeOmissionPerceptionSession(input: CloseOmissionPerceptionSessionInput!): AgentOpcResult!
  publishOmissionPerceptionCard(input: PublishOmissionPerceptionCardInput!): AgentOpcResult!
}
```

### GraphQL limits

Resolvers require `accountId` and reject missing tenant
scope. Catalog and certificate reads are primary-key point
lookups of `(account_id, member_id)` or
`(account_id, certificate_id)`. Card and audit reads are
bounded by one id. There is no list-all-members field and
no list-all-cards field. A client that asks for every
omitted member on a board is **FULL SCAN REJECTED** before
execution.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `compile_instruction` records that a perception
card publishes one omitted working-set member, repeats
membership `OMITTED` and citation `DROPPED` as untrusted
metadata, and never treats `ACKED` as trust.
`procedureRef` points at that profile version. Agents do
not store a second hidden policy. If the profile is
revoked with `STOP_BEFORE_PERCEIVE`, new nominations stop.
In-flight cards remain replayable.

Semantic tags (`incident`, `omission-perception-card`) are
for discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_opc_profile_embedding (
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
    REFERENCES agent_opc_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_opc_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_opc_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_opc_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped member-catalog or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one omitted member by primary key, and
seals under dual control. Similarity never publishes a
card and never puts an omitted member back into the
working set.

## 12. Agent perception

Agents receive one perception card per session. The card
exposes `membershipState`, `citationState`,
`metadataTrust`, `effectObservation`, `providerReceiptHash`,
and `disputedFactHash` as separate metadata, plus
`factDisposition`, `attestedKeyKind`, and `bodyVisibility`.
Summary text is `UntrustedText`. Cards also expose
included-member rejection counts, unknown-effect counts,
member-scan denials, remaining budgets, procedure tags,
allowed next actions, and blocked reasons. They never embed
raw private keys, tool payloads, fact bodies, or a winning
fact hash. `cardHash` makes perception replayable.

An LLM should read the card as: "one omitted working-set
member was perceived by point lookup of
`(account_id, member_id)`. Membership is `OMITTED` and the
citation is `DROPPED`, both as `UNTRUSTED_METADATA`. The
effect is either `ACKED` with this untrusted receipt hash
or still `UNKNOWN_EFFECT`." It should not read the card as
"the disputed fact is now false," "the fact body is
available," or "the signing key is `TRUSTED_ENROLLED`."
Metadata tags that keep that reading stable are
`metadataTrust=UNTRUSTED_METADATA`,
`membershipState=OMITTED`, `citationState=DROPPED`,
`factDisposition=DISPUTED_HELD`,
`attestedKeyKind=AWAITING_CONFIRMATION`,
`bodyVisibility=OMITTED`, and `inlinesFactBody=false`.

## 13. ACID and consistency

### Row store

Nomination, metadata bind, evaluation, and seal commit or
roll back together. Compare-and-swap on `state_revision`
rejects lost updates. Decision identity is immutable. The
card is a projection of one omitted member, not a second
fact. The publication record is its own transaction and
appends history without rewriting the card.

### Columnar store

Analytical counts of compile kinds, membership states, and
effect observations are derived from the row store by
`account_id`. They lag the seal watermark and cannot
authorize a new card or restore an omitted member.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but discovery never nominates a member.
Account predicates are applied before HNSW topK.

### External tools

Notify providers sit outside the ACID boundary. Silence and
ambiguous responses stay `UNKNOWN_EFFECT`. A notify
acknowledgement cannot include a member, inline a fact
body, or promote `ACKED` to `TRUSTED_ENROLLED`.

## 14. Guardrails and neighbor protection

Perception budgets cap nominate, bind, seal, vector,
publish, and notify units per session. The one-member cap
rejects a second nomination before it can fan out into
recursive retrieval. A card cannot schedule another
compile of itself and cannot open a nested expiry.
`MEMBER_SCAN`, `LEDGER_SCAN`, missing `account_id`, and a
missing `member_id` are **FULL SCAN REJECTED** by
`reject_agent_opc_unscoped_scan` before the planner touches
a board with 1M+ rows. Vector discovery is capped by
`budget_vector_units` and cannot authorize seal. Halted and
quarantined bodies stay `OMITTED`.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing every working-set member for an account to "find
  the omitted ones before publishing a card."
- Joining perception cards to board items or citation
  ledgers to recover a fact body.
- Building one global HNSW index and authorizing from the
  nearest profile.
- Publishing a card by scanning every prior omission
  record.

Each of those plans is **FULL SCAN REJECTED**.

### Required access paths

- Member nomination and card publication: primary key
  `(account_id, member_id)`.
- Perception card read: primary key `(account_id, card_id)`.
- Session and audit reads: `(account_id, session_id)` plus
  the session work index.
- Profile discovery: `account_id` equality, then HNSW topK
  inside that partition.

### Planner enforcement

`nominate_agent_opc_member` and `publish_agent_opc_card`
refuse a null point key. Resolvers do not expose an
unbounded list field. The reference schema creates no
cross-tenant HNSW index.

## 16. Auditability and replay

`agent_opc_audit_event` is a hash chain per `account_id`.
Anchors store a Merkle root over a sequence range. Replay
recomputes the perception decision from the sealed member
hashes, the dual-control stewards, and the membership and
citation states. It does not call an LLM and does not
reconstruct a fact body. A publication record stores
`MEMBER_OMITTED` without erasing the historical receipt
hash and without promoting `ACKED`.

## 17. Threat and failure analysis

- **Card-as-trust:** a compiler writes `TRUSTED_ENROLLED`
  because the effect was `ACKED`. Rejected.
- **Card-as-restore:** a compiler writes `RESTORED`,
  `INCLUDED`, `ATTACHED`, or `BODY_VISIBLE`. Rejected.
- **Body inline:** `card_body` contains `factBody`.
  Rejected.
- **Silence-as-ack:** `ACKED` with `silence_inferred`.
  Rejected.
- **Live member:** the catalog membership is `INCLUDED`
  or the citation is `ATTACHED`, and the compiler still
  tries to perceive it as omitted. Nomination and seal
  are rejected. This plane does not invent an omission.
- **Nested expiry:** `opens_nested_expiry` is rejected.
  Perception does not start another review cycle.
- **Member scan and hop leak:** `MEMBER_SCAN`,
  `LEDGER_SCAN`, and purpose amplification are rejected.
- **Prior steward reuse:** omission, compiler, perception,
  receipt, gate, and extension stewards cannot seal the
  card.
- **Neighbor damage:** unscoped scans and a second member
  in the same session are rejected before they touch a
  1M+ row board.

## 18. Observability and SLOs

Availability target remains 99.99% for neighbor board
traffic. This plane's SLOs are:

- point-lookup nomination p99 under 20 ms inside the
  tenant partition;
- seal transaction p99 under 50 ms with no board write;
- publication append p99 under 20 ms after the card is
  sealed;
- zero cards sealed with `inlines_fact_body = true`;
- zero `OMITTED` cards whose catalog membership is not
  `OMITTED` or whose catalog citation is not `DROPPED`;
- `UNKNOWN_EFFECT` notify age visible on the perception
  card.

Columnar counts of perceived, held, and denied cards are
operational. They are not authorization.

## 19. Rollout

### Phase 1: shadow cards

Compile cards in shadow mode. Agents do not read them.
Compare card metadata with the source omitted member.

### Phase 2: deny-only

Serve `DENY_CARD_AS_TRUST`, `DENY_CARD_AS_RESTORE`,
`DENY_BODY_INLINE`, and `DENY_MEMBER_SCAN`. Do not
publish.

### Phase 3: one perceived member

Allow `PERCEIVE_OMITTED_MEMBER` for approved profiles.
Facts stay `DISPUTED_HELD`. Metadata stays untrusted.
Membership is `OMITTED`. Citation is `DROPPED`.

### Phase 4: publish and notify uncertainty

Enable publication records and surface `UNKNOWN_EFFECT`
notify. A publication does not restore a fact and does
not promote `ACKED`.

### Phase 5: broad availability

Default-on for tenants that already omit dropped context
packets. Profiles still require dual control. Similarity
still cannot seal.

## 20. Ship criteria

### Contract validation

TypeScript contracts compile under strict mode. The GraphQL
schema builds with 6 queries and 10 mutations. SQL enums
stay within 63-byte labels. Every table and index leads
with `account_id`.

### Behavioral validation

- An omitted member can be nominated by
  `(account_id, member_id)` and perceived once.
- The card repeats `OMITTED`, `DROPPED`, `ACKED`, and the
  receipt hash as `UNTRUSTED_METADATA` while the key stays
  `AWAITING_CONFIRMATION` and the fact stays
  `DISPUTED_HELD`.
- `TRUSTED_ENROLLED`, `RESTORED`, `BODY_VISIBLE`,
  `INCLUDED`, and `factBody` are rejected.
- `MEMBER_SCAN`, `opens_nested_expiry`, and nomination of
  an `INCLUDED` member are rejected.
- `publish_agent_opc_card` appends `MEMBER_OMITTED`
  without rewriting the card body.
- Direct profile approval, sealed-rule edits, and unscoped
  scans are rejected.

### Scale and failure validation

Explain plans for nomination and publication use the
primary key. A missing point key is **FULL SCAN
REJECTED**. A 1M+ row board is not read. Notify silence
remains `UNKNOWN_EFFECT`.

## 21. Product decision

Ship the Omission Perception Card Plane as the
deterministic bridge from one `OMITTED` working-set member
to one perception card. The latency cost is one
primary-key compile. The consistency win is that
membership `OMITTED` and citation `DROPPED` stay untrusted
metadata, `ACKED` stays an effect observation, the
disputed fact stays held, and the body stays omitted.

The next increment should attach one sealed omission
perception card to an agent context packet by point lookup
of `(account_id, card_id)`. The packet may repeat
membership `OMITTED` and citation `DROPPED` as
`UNTRUSTED_METADATA`. It must not scan perception cards,
must not inline the fact body, must not promote `ACKED`
to `TRUSTED_ENROLLED`, and must not open another nested
expiry plane.
