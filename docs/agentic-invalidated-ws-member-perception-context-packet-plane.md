# mondayDB Agentic Invalidated Working-Set Member Perception Context Packet Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-05.v1`

## 1. Why this plane, before how

The 2026-10-04 Invalidated Working-Set Member Perception
Card Plane can publish exactly one sealed perception card
for one omitted working-set member by point lookup of
`(account_id, card_id)`. That card repeats membership
`OMITTED`, citation `DROPPED`, and catalog status
`INVALIDATED` as `UNTRUSTED_METADATA`. `ACKED` stays an
effect observation. The disputed fact stays
`DISPUTED_HELD`. The key stays `AWAITING_CONFIRMATION`.
The body stays off the card.

A downstream agent still cannot carry that card into the
next prompt without a second compile. Without this plane
the agent either:

- scans perception cards, working-set members, and board
  rows to decide which card to attach (neighbor-harmful on
  boards with 1M+ rows), or
- inlines the disputed fact and reads `ACKED` as
  `TRUSTED_ENROLLED` so the packet "explains" the card by
  revealing the held fact.

The product trade-off is **attachment fluency versus
citation integrity and neighbor latency**:

- Scanning every perception card, or copying the fact body
  into the packet, maximizes prompt fluency and hides the
  hold. It also puts a 1M+ row walk on the primary path
  and can miss the 99.99% neighbor availability target.
- Attaching exactly one sealed card to one context packet
  by point lookup of `(account_id, card_id)` adds one
  bounded compile transaction. The packet repeats
  membership `OMITTED`, citation `DROPPED`, and catalog
  status `INVALIDATED` as `UNTRUSTED_METADATA`. `ACKED`
  stays an effect observation. The disputed fact stays
  `DISPUTED_HELD`. The key stays `AWAITING_CONFIRMATION`.
  The body stays `OMITTED`. Silence stays
  `UNKNOWN_EFFECT`.
- Semantic similarity may discover attachment profiles,
  but it must never decide whether a card may be
  nominated, metadata bound, a packet evaluated, a packet
  sealed, a packet published, or a consumer notified.

Latency stays on the primary key. Consistency is the
sealed packet row inside one ACID transaction, not an
eventually consistent guess that an omitted card
"probably belongs in the prompt." Neighbor availability
stays at the 99.99% target because an unscoped card walk
is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved attachment profile is procedural memory for
   "how one omitted invalidated perception card is
   attached to one context packet." A profile **never**
   inlines a fact body, **never** rewrites `ACKED` as
   `TRUSTED_ENROLLED`, and **never** opens another nested
   expiry plane.
2. A session opens under purpose, budget, and authorization
   fences, and nominates exactly one omitted card by point
   lookup of `(account_id, card_id)`. Hashes and catalog
   status are copied from the card catalog. They are never
   computed by walking perception cards or ledgers.
3. mondayDB evaluates an attachment whose outcome is a pure
   function of `(source_kind, access_path, gate_kind,
   gate_action, terminal_kind, placement_kind,
   key_lifecycle, clock_lifecycle, attested_key_kind,
   perceive_kind, compile_kind, body_visibility,
   fact_disposition, clock_disposition, receipt_disposition,
   effect_observation, purpose_relation, citation_state,
   membership_state, catalog_status, metadata_trust,
   silence_inferred, inlines_fact_body, opens_nested_expiry,
   hop_count)`. `ACKED` cannot become trust. `RESTORED`
   cannot be written. A body cannot be inlined. `INCLUDED`
   cannot be attached as if the card were back in the
   working set. A catalog status other than `INVALIDATED`
   cannot be attached by this plane.
4. Sealing binds `consumer_ref + purpose_hash +
   prior_clock_hash + successor_clock_hash +
   disputed_fact_hash + provider_receipt_hash +
   halt_scope_hash + attenuation_hash + decision_set_hash +
   packet_steward_a + packet_steward_b`. The packet **must
   not** emit a fact body and **must not** emit
   `TRUSTED_ENROLLED`. Packet stewards are distinct from
   each other and from both source perception-card
   stewards who sealed the card, and from both prior
   working-set omission stewards, both prior packet
   stewards, both prior card stewards, both prior omission
   stewards, both prior compiler stewards, both perception
   stewards, both receipt stewards, both prior gate
   stewards, and both prior extension stewards.
5. Publishing the packet is a second point lookup of the
   same `(account_id, card_id)` plus `(account_id,
   packet_id)`. Notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not enrollment, not a fact restore,
   and not permission to put the card back.
6. Unscoped card-catalog, perception-card, working-set,
   vote-ledger, page-ledger, ack-ledger, escalation-ledger,
   containment-ledger, review-ledger, resolution-ledger,
   promotion-ledger, or board scans are **FULL SCAN
   REJECTED**.

### Product outcome

For any invalidated perception-card context packet,
mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, metadata bind, evaluation, seal, packet
  publication, or notify dispatch?
- Which omitted perception card was read by primary key
  `(account_id, card_id)`, and which membership,
  citation, and catalog status were repeated as untrusted
  metadata?
- Did the packet repeat `OMITTED`, `DROPPED`, and
  `INVALIDATED` while `ACKED` stayed an effect observation,
  the disputed fact stayed held, the body stayed omitted,
  and the key stayed unconfirmed?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the packet history be replayed without invoking an
  LLM?

HNSW profile discovery stays account-scoped and never
authorizes this packet.

## 2. Scope and ownership

The Invalidated Working-Set Member Perception Context
Packet Plane owns:

1. Immutable approved attachment profiles as procedural
   memory of "how one omitted perception card is attached
   to one context packet without inlining a disputed fact,
   treating `ACKED` as `TRUSTED_ENROLLED`, scanning
   perception cards, amplifying purpose, or opening
   another nested expiry."
2. Tenant-scoped attachment sessions with purpose and
   budget fences, and a hard cap of one nominated card and
   one context packet per session.
3. Deterministic nomination of omitted cards by point
   lookup of `(account_id, card_id)`.
4. Deterministic untrusted metadata bindings, attachment
   records, sealed decisions, and context packets that
   never invent a winner and never restore a fact.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the sealed packet, audit replay, and
   bounded attachment budgets.

It integrates with, but does not replace:

- **Invalidated Working-Set Member Perception Card
  Plane:** supplies the sealed perception card this plane
  may nominate by `(account_id, card_id)`. Membership,
  citation, and catalog status on that card are already
  `OMITTED`, `DROPPED`, and `INVALIDATED`. This plane
  never puts that card back, never rewrites the card body,
  and never promotes `ACKED` to `TRUSTED_ENROLLED`.
- **Invalidated Context-Packet Working-Set Omission
  Plane:** the cited working-set member stays upstream of
  the card. This plane never re-omits that member and
  never scans working sets.
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
- Discovering omitted cards by scanning a board, a
  perception-card table, a working-set table, or a
  citation-drop ledger.
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative packets from columnar or
  vector projections.
- Cross-account attachment or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, or fact bodies
  on the context packet.
- Claiming distributed atomicity with external notify
  providers. Provider silence remains `UNKNOWN_EFFECT`.
- Opening another nested expiry, containment, review, or
  resolution plane from this attachment.

## 3. Product contract

### 3.1 Attachment profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_INVALIDATED_WS_CARD`,
  `SEALED_PERCEPTION_CARD`, `SEALED_ATTEST_CERT`,
  `SEALED_TOOL_READ_DECISION`, `SEALED_PROVIDER_RECEIPT`,
  `SEALED_EFFECT_INTENT`);
- compile threshold (distinct packet-steward principals,
  minimum 2), max cards per session (exactly 1), and max
  nominated cards (exactly 1);
- compile policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `PACKET_NEVER_RESTORES_FACTS`,
  `PACKET_NEVER_INLINES_BODY`, `PACKET_NEVER_CONFIRMS`,
  `ONE_CARD_PER_SESSION`, `OMITTED_ONLY`,
  `POINT_LOOKUP_ONLY`, `INVALIDATED_CATALOG_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`,
  `CARD_NEVER_SCANNED`, `HALT_DENIES_BODY_READ`,
  `QUARANTINE_BODY_NEVER_VISIBLE`,
  `SOURCE_CARD_STEWARDS_EXCLUDED`,
  `PRIOR_WS_OMISSION_STEWARDS_EXCLUDED`,
  `PRIOR_PACKET_STEWARDS_EXCLUDED`,
  `PRIOR_CARD_STEWARDS_EXCLUDED`,
  `PRIOR_OMISSION_STEWARDS_EXCLUDED`,
  `PRIOR_COMPILER_STEWARDS_EXCLUDED`,
  `PRIOR_PERCEPTION_STEWARDS_EXCLUDED`,
  `PRIOR_RECEIPT_STEWARDS_EXCLUDED`,
  `PRIOR_GATE_STEWARDS_EXCLUDED`,
  `PRIOR_EXTENSION_STEWARDS_EXCLUDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_ATTACH`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_INVALIDATED_WS_CARD` (26 bytes). The
longest compile kind is `ATTACH_INVALIDATED_WS_CARD`
(25 bytes).

Approval and revocation require the authority fence
`approve_agent_iwsmpcp_profile` /
`revoke_agent_iwsmpcp_profile`, owned by
`agent_iwsmpcp_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, seal, vector, publish, and notify units, plus wall
time. `max_cards_per_session` and
`max_nominated_cards` are both exactly 1. A second
nomination in the same session is rejected before it can
fan out into a recursive retrieval.

### 3.3 Nomination and metadata contract

Nomination is `nominate_agent_iwsmpcp_card(account_id,
session_id, card_id, nomination_id, nomination_hash)`.
A null `card_id` is **FULL SCAN REJECTED**. The catalog
row must already be `SEALED_INVALIDATED_WS_CARD`,
citation `DROPPED`, membership `OMITTED`, status
`DROPPED`, and catalog status `INVALIDATED`. `ACKED` is
accepted only with `receipt_disposition = ATTESTED` and
`silence_inferred = false`. `TRUSTED_ENROLLED` and
`inlines_fact_body` are rejected at nomination. Metadata
bindings are append-only and `UNTRUSTED_METADATA`.

### 3.4 Packet decision and context-packet contract

`ATTACH_INVALIDATED_WS_CARD` is the only compile kind
that writes a context packet. It requires:

- `source_kind = SEALED_INVALIDATED_WS_CARD`;
- `access_path = POINT_LOOKUP` (`CARD_SCAN` and
  `LEDGER_SCAN` are **FULL SCAN REJECTED**);
- `gate_kind = ALLOW_TOOL_READ` and
  `gate_action = TOOL_READ` (`TOOL_MUTATE` is rejected);
- `perceive_kind = PERCEIVE_ATTESTED_RECEIPT`;
- `placement_kind = EXTENDED_HALT`;
- `terminal_kind = REQUIRE_HUMAN`;
- `key_lifecycle = FIRST_ENROLLMENT` and
  `attested_key_kind = AWAITING_CONFIRMATION`;
- `clock_lifecycle = ATTESTED` and
  `clock_disposition = REARMED`, with the successor clock
  hash distinct from the prior clock hash;
- `receipt_disposition = ATTESTED`,
  `effect_observation = ACKED`, and
  `silence_inferred = false`;
- `purpose_relation = NARROWS` (not `AMPLIFIES`);
- `body_visibility = OMITTED`,
  `fact_disposition = DISPUTED_HELD`,
  `membership_state = OMITTED`,
  `citation_state = DROPPED`,
  `catalog_status = INVALIDATED`,
  `metadata_trust = UNTRUSTED_METADATA`;
- `inlines_fact_body = false` and
  `opens_nested_expiry = false`;
- the provider receipt hash distinct from the disputed
  fact hash.

The context packet repeats those states in `packet_body`
and rejects `factBody`, `fact_body`, and
`resolvedFactHash`. Packet stewards on the certificate must
differ from `source_card_steward_a/b` and from every
prior steward pair copied from the source card.

### 3.5 Notify and publication contract

`publish_agent_iwsmpcp_packet` point-looks up
`(account_id, card_id)` and `(account_id, packet_id)` and
appends one publication with reason
`INVALIDATED_WS_CARD_ATTACHED`. Effect intents start as
`PREPARED`. Provider silence stays `UNKNOWN_EFFECT`. An
acknowledgement does not enroll a key, restore a fact, or
put the card back.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`. RLS policy
   `tenant_isolation` is forced on every table.
2. Nomination and publication use point lookup only. A
   missing `account_id` or `card_id` is **FULL SCAN
   REJECTED**.
3. `ACKED` is an effect observation. It never writes
   `TRUSTED_ENROLLED` or `TRUSTED_WITHIN_SKEW`.
4. `RESTORED`, `INCLUDED`, `ATTACHED`, and `BODY_VISIBLE`
   are rejected on this plane.
5. `packet_body` never contains a fact body.
6. Catalog status `INVALIDATED` is copied from the card
   catalog. A `LIVE` catalog cannot be attached here.
7. `opens_nested_expiry` is rejected. This plane does not
   start another expiry, containment, review, or resolution
   cycle.
8. `CARD_SCAN` and `LEDGER_SCAN` are rejected. This plane
   does not scan perception cards.
9. Purpose `AMPLIFIES` is rejected. After a hop, the
   requested purpose hash must differ from the donor
   purpose hash.
10. Packet stewards are distinct from each other and from
    the source perception-card stewards, and from prior
    working-set omission, packet, card, omission,
    compiler, perception, receipt, gate, and extension
    stewards.
11. Profile approval and revocation go through the
    authority fence. Sealed profiles and sealed attach
    rules are immutable.
12. Decision identity, certificate identity, catalog
    identity, and metadata bindings are append-only.
13. One session nominates one card and writes one context
    packet.
14. Silence is not `ACKED`. A receipt hash is not a fact
    hash.
15. The database engine stays deterministic. Agents above
    it may be probabilistic. Similarity never nominates.

## 5. Execution model

The row store is the authority. Columnar projections and
pgvector embeddings are derived. The attach compile reads
one card-catalog row by primary key and writes one
decision plus one context packet in the same transaction.
Publication is a second point lookup that appends history
without rewriting the packet. Notify dispatch is outside
the ACID boundary and starts at `PREPARED`.

An agent perceives the packet, not the fact. The packet is
procedural evidence that one omitted invalidated
perception card was attached without restoring the
citation.

## 6. Lifecycle

### 6.1 Draft and approve

A profile is inserted as `DRAFT` with at least one
dual-control attach rule. `approve_agent_iwsmpcp_profile`
checks the definition hash and sets
`app.iwsmpcp_profile_approval` before the status becomes
`APPROVED`.

### 6.2 Open and nominate

A session opens under an approved profile.
`nominate_agent_iwsmpcp_card` point-looks up
`(account_id, card_id)`. Included, attached, or
non-invalidated cards are rejected. A null key is
**FULL SCAN REJECTED**.

### 6.3 Bind and evaluate

Metadata binding copies the receipt hash, the disputed
fact hash, and `ACKED` as `UNTRUSTED_METADATA`. Evaluation
is a pure function of the sealed inputs. It cannot inline
a body or open a nested expiry.

### 6.4 Seal

Dual-control packet stewards seal the certificate. Source
perception-card stewards are excluded. The decision row
`ATTACH_INVALIDATED_WS_CARD` and the context packet commit
together.

### 6.5 Publish and notify

`publish_agent_iwsmpcp_packet` appends
`INVALIDATED_WS_CARD_ATTACHED`. Notify may remain
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

The session closes. Audit events stay hash-chained.
Revocation with `STOP_BEFORE_ATTACH` blocks new
nominations. In-flight sealed packets remain replayable.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type CardId = string & { readonly brand: "CardId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type PacketId = string & { readonly brand: "PacketId" };
type MetadataBindingId = string & { readonly brand: "MetadataBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_INVALIDATED_WS_CARD"
  | "BIND_UNTRUSTED_METADATA"
  | "EVALUATE_INVALIDATED_PERCEPTION"
  | "SEAL_INVALIDATED_PERCEPTION"
  | "PUBLISH_INVALIDATED_PERCEPTION"
  | "PREPARE_PERCEPTION_NOTIFY"
  | "PERCEPTION_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type InvalidatedWsCardContextPacketBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CARD_MISSING"
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
  | "CARD_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "PACKET_AS_FACT_DENIED"
  | "HOP_LEAK_DENIED"
  | "CLOCK_REGRESSION_DENIED"
  | "CITATION_STILL_ATTACHED"
  | "CATALOG_NOT_INVALIDATED"
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
  | "SEALED_INVALIDATED_WS_CARD"
  | "SEALED_PERCEPTION_CARD"
  | "SEALED_ATTEST_CERT"
  | "SEALED_TOOL_READ_DECISION"
  | "SEALED_PROVIDER_RECEIPT"
  | "SEALED_EFFECT_INTENT";

type AccessPath = "POINT_LOOKUP" | "CARD_SCAN" | "LEDGER_SCAN";

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
  | "ATTACH_INVALIDATED_WS_CARD"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_CARD_AS_TRUST"
  | "DENY_CARD_AS_RESTORE"
  | "DENY_BODY_INLINE"
  | "DENY_ACK_AS_TRUST"
  | "DENY_CARD_SCAN"
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

type SourceCatalogStatus = "INVALIDATED" | "ATTACHED" | "LIVE" | "UNKNOWN_EFFECT";

type EffectIntentStatus = "PREPARED" | "DISPATCHED" | "ACKED" | "FAILED" | "UNKNOWN_EFFECT";

interface InvalidatedWsCardContextPacketBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly publishUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly compileThreshold: number;
  readonly maxCardsPerSession: 1;
  readonly maxNominatedCards: 1;
}

interface InvalidatedWsCardContextPacketProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly compileThreshold: number;
  readonly maxCardsPerSession: 1;
  readonly maxNominatedCards: 1;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface InvalidatedWsCardContextPacketSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: InvalidatedWsCardContextPacketBudget;
  readonly consumed: Omit<
    InvalidatedWsCardContextPacketBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxCardsPerSession" | "maxNominatedCards"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface InvalidatedWsCardNominationReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly cardId: CardId;
  readonly sourceKind: SourceKind;
  readonly accessPath: AccessPath;
  readonly gateKind: GateKind;
  readonly gateAction: GateAction;
  readonly effectObservation: EffectObservation;
  readonly receiptDisposition: ReceiptDisposition;
  readonly silenceInferred: boolean;
  readonly citationState: CitationState;
  readonly catalogStatus: SourceCatalogStatus;
  readonly disputedFactHash: Sha256;
  readonly providerReceiptHash: Sha256;
  readonly nominationHash: Sha256;
  readonly nominatedAt: Timestamp;
}

interface UntrustedInvalidatedMetadataBinding {
  readonly accountId: AccountId;
  readonly metadataBindingId: MetadataBindingId;
  readonly sessionId: SessionId;
  readonly cardId: CardId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly metadataTrust: MetadataTrust;
  readonly inlinesFactBody: false;
  readonly capturedAt: Timestamp;
}

interface InvalidatedWsCardContextPacketCompileRecord {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly cardId: CardId;
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

interface InvalidatedWsCardContextPacketDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly cardId: CardId;
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
  readonly catalogStatus: SourceCatalogStatus;
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

interface InvalidatedWsCardContextPacketCertificate {
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
  readonly packetStewardA: string;
  readonly packetStewardB: string;
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
  readonly priorOmissionStewardA: string;
  readonly priorOmissionStewardB: string;
  readonly priorCardStewardA: string;
  readonly priorCardStewardB: string;
  readonly priorPacketStewardA: string;
  readonly priorPacketStewardB: string;
  readonly priorWsOmissionStewardA: string;
  readonly priorWsOmissionStewardB: string;
  readonly decisionWatermark: number;
  readonly sealedAt: Timestamp;
}

interface InvalidatedNotifyObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentInvalidatedWsCardContextPacket {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly packetId: PacketId;
  readonly cardId: CardId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly membershipState: MembershipState;
  readonly citationState: CitationState;
  readonly catalogStatus: SourceCatalogStatus;
  readonly metadataTrust: MetadataTrust;
  readonly effectObservation: EffectObservation;
  readonly providerReceiptHash: Sha256;
  readonly disputedFactHash: Sha256;
  readonly factDisposition: FactDisposition;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly bodyVisibility: BodyVisibility;
  readonly inlinesFactBody: false;
  readonly attachedCardCount: number;
  readonly attachedPacketRejectedCount: number;
  readonly unknownEffectCount: number;
  readonly silenceDeniedCount: number;
  readonly disputedHeldCount: number;
  readonly restoreDeniedCount: number;
  readonly trustDeniedCount: number;
  readonly bodyInlineDeniedCount: number;
  readonly cardScanDeniedCount: number;
  readonly uncertainNotifyIntents: readonly InvalidatedNotifyObservation[];
  readonly remainingBudget: Omit<
    InvalidatedWsCardContextPacketBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxCardsPerSession" | "maxNominatedCards"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly InvalidatedWsCardContextPacketBlockedReason[];
  readonly packetHash: Sha256;
}
```

```ts
interface CreateInvalidatedWsCardContextPacketSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: InvalidatedWsCardContextPacketBudget;
}

interface NominateInvalidatedWsCardInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly cardId: CardId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedProviderReceiptHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindInvalidatedWsCardContextPacketMetadataInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly cardId: CardId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly silenceInferred: boolean;
  readonly idempotencyKey: string;
}

interface EvaluateInvalidatedWsCardContextPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedProviderReceiptHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealInvalidatedWsCardContextPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly packetStewardA: string;
  readonly packetStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface RecordInvalidatedWsCardContextPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly cardId: CardId;
  readonly packetId: PacketId;
  readonly reasonCode: "INVALIDATED_WS_CARD_ATTACHED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareInvalidatedWsCardContextPacketNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface InvalidatedNotifyUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion: "RETRY_SAME_PERCEPTION" | "ACCEPT_OBSERVATION" | "REJECT_PERCEPTION" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseInvalidatedWsCardContextPacketSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface PublishInvalidatedWsCardContextPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type InvalidatedWsCardContextPacketDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: InvalidatedWsCardContextPacketSession;
      readonly certificate?: InvalidatedWsCardContextPacketCertificate;
      readonly omissionDecision?: InvalidatedWsCardContextPacketDecision;
      readonly nomination?: InvalidatedWsCardNominationReceipt;
      readonly metadata?: UntrustedInvalidatedMetadataBinding;
      readonly compile?: InvalidatedWsCardContextPacketCompileRecord;
      readonly perception: AgentInvalidatedWsCardContextPacket;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: InvalidatedWsCardContextPacketBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly perception?: AgentInvalidatedWsCardContextPacket;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE iwsmpcp_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE iwsmpcp_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'COMPILING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_source_kind AS ENUM (
  'SEALED_INVALIDATED_WS_CARD',
  'SEALED_PERCEPTION_CARD',
  'SEALED_ATTEST_CERT',
  'SEALED_TOOL_READ_DECISION',
  'SEALED_PROVIDER_RECEIPT',
  'SEALED_EFFECT_INTENT'
);
CREATE TYPE iwsmpcp_access_path AS ENUM ('POINT_LOOKUP', 'CARD_SCAN', 'LEDGER_SCAN');
CREATE TYPE iwsmpcp_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE iwsmpcp_perceive_kind AS ENUM (
  'PERCEIVE_ATTESTED_RECEIPT', 'HOLD_UNKNOWN_EFFECT', 'DENY_SILENCE_AS_ACK',
  'DENY_CARD_AS_RESTORE', 'DENY_ACK_AS_TRUST', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_compile_kind AS ENUM (
  'ATTACH_INVALIDATED_WS_CARD', 'HOLD_UNKNOWN_EFFECT', 'DENY_CARD_AS_TRUST',
  'DENY_CARD_AS_RESTORE', 'DENY_BODY_INLINE', 'DENY_ACK_AS_TRUST',
  'DENY_CARD_SCAN', 'DENY_NESTED_EXPIRY', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE iwsmpcp_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_receipt_disposition AS ENUM (
  'UNBOUND', 'ATTESTED', 'SILENCE', 'REJECTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_citation_state AS ENUM (
  'DROPPED', 'ATTACHED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_membership_state AS ENUM (
  'OMITTED', 'INCLUDED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE iwsmpcp_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_catalog_status AS ENUM (
  'DROPPED', 'ATTACHED', 'HELD', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcp_source_catalog_status AS ENUM (
  'INVALIDATED', 'ATTACHED', 'LIVE', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_iwsmpcp_profile_authority NOLOGIN;

CREATE TABLE agent_iwsmpcp_authorization_evidence (
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

CREATE TABLE agent_iwsmpcp_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status iwsmpcp_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  compile_threshold SMALLINT NOT NULL
    CHECK (compile_threshold BETWEEN 2 AND 8),
  max_cards_per_session SMALLINT NOT NULL
    CHECK (max_cards_per_session = 1),
  max_nominated_cards SMALLINT NOT NULL
    CHECK (max_nominated_cards = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_ATTACH', 'REQUIRE_REVIEW'
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
    REFERENCES agent_iwsmpcp_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_iwsmpcp_profile_perceive_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  compile_threshold SMALLINT NOT NULL CHECK (compile_threshold BETWEEN 2 AND 8),
  max_cards_per_session SMALLINT NOT NULL
    CHECK (max_cards_per_session = 1),
  max_nominated_cards SMALLINT NOT NULL
    CHECK (max_nominated_cards = 1),
  require_dual_control_compile BOOLEAN NOT NULL,
  compile_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_iwsmpcp_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_iwsmpcp_card_catalog (
  account_id BIGINT NOT NULL,
  card_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  card_ref TEXT NOT NULL,
  source_kind iwsmpcp_source_kind NOT NULL,
  perceive_kind iwsmpcp_perceive_kind NOT NULL,
  gate_kind iwsmpcp_gate_kind NOT NULL,
  gate_action iwsmpcp_gate_action NOT NULL,
  terminal_kind iwsmpcp_terminal_kind NOT NULL,
  placement_kind iwsmpcp_placement_kind NOT NULL,
  key_lifecycle iwsmpcp_key_lifecycle NOT NULL,
  clock_lifecycle iwsmpcp_clock_lifecycle NOT NULL,
  attested_key_kind iwsmpcp_attested_key_kind NOT NULL,
  status iwsmpcp_catalog_status NOT NULL,
  citation_state iwsmpcp_citation_state NOT NULL,
  membership_state iwsmpcp_membership_state NOT NULL,
  catalog_status iwsmpcp_source_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  receipt_disposition iwsmpcp_receipt_disposition NOT NULL,
  effect_observation iwsmpcp_effect_observation NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  fact_disposition iwsmpcp_fact_disposition NOT NULL,
  body_visibility iwsmpcp_body_visibility NOT NULL,
  clock_disposition iwsmpcp_clock_disposition NOT NULL,
  metadata_trust iwsmpcp_metadata_trust NOT NULL,
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
  prior_card_steward_a TEXT NOT NULL,
  prior_card_steward_b TEXT NOT NULL,
  prior_packet_steward_a TEXT NOT NULL,
  prior_packet_steward_b TEXT NOT NULL,
  ws_omission_steward_a TEXT NOT NULL,
  ws_omission_steward_b TEXT NOT NULL,
  source_card_steward_a TEXT NOT NULL,
  source_card_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, card_id),
  UNIQUE (account_id, card_ref, source_kind),
  CHECK (prior_compiler_steward_a <> prior_compiler_steward_b),
  CHECK (perception_steward_a <> perception_steward_b),
  CHECK (receipt_steward_a <> receipt_steward_b),
  CHECK (prior_gate_steward_a <> prior_gate_steward_b),
  CHECK (prior_extension_steward_a <> prior_extension_steward_b),
  CHECK (prior_omission_steward_a <> prior_omission_steward_b),
  CHECK (prior_card_steward_a <> prior_card_steward_b),
  CHECK (prior_packet_steward_a <> prior_packet_steward_b),
  CHECK (ws_omission_steward_a <> ws_omission_steward_b),
  CHECK (source_card_steward_a <> source_card_steward_b),
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
  CHECK (citation_state <> 'DROPPED' OR membership_state = 'OMITTED'),
  CHECK (
    catalog_status <> 'INVALIDATED'
    OR (
      citation_state = 'DROPPED'
      AND membership_state = 'OMITTED'
      AND status = 'DROPPED'
    )
  )
);

CREATE TABLE agent_iwsmpcp_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status iwsmpcp_session_status NOT NULL,
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
  max_cards_per_session SMALLINT NOT NULL
    CHECK (max_cards_per_session = 1),
  max_nominated_cards SMALLINT NOT NULL
    CHECK (max_nominated_cards = 1),
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
    REFERENCES agent_iwsmpcp_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_iwsmpcp_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at)
);

CREATE TABLE agent_iwsmpcp_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  card_id UUID NOT NULL,
  access_path iwsmpcp_access_path NOT NULL,
  source_kind iwsmpcp_source_kind NOT NULL,
  gate_kind iwsmpcp_gate_kind NOT NULL,
  gate_action iwsmpcp_gate_action NOT NULL,
  effect_observation iwsmpcp_effect_observation NOT NULL,
  receipt_disposition iwsmpcp_receipt_disposition NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  citation_state iwsmpcp_citation_state NOT NULL,
  catalog_status iwsmpcp_source_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_iwsmpcp_card_catalog (account_id, card_id),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (citation_state = 'DROPPED'),
  CHECK (catalog_status = 'INVALIDATED'),
  CHECK (source_kind = 'SEALED_INVALIDATED_WS_CARD'),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_iwsmpcp_metadata_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  card_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  effect_observation iwsmpcp_effect_observation NOT NULL,
  metadata_trust iwsmpcp_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_iwsmpcp_card_catalog (account_id, card_id),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_iwsmpcp_attach_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  card_id UUID NOT NULL,
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
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_iwsmpcp_card_catalog (account_id, card_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_iwsmpcp_packet_certificate (
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
  packet_steward_a TEXT NOT NULL,
  packet_steward_b TEXT NOT NULL,
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
  prior_card_steward_a TEXT NOT NULL,
  prior_card_steward_b TEXT NOT NULL,
  prior_packet_steward_a TEXT NOT NULL,
  prior_packet_steward_b TEXT NOT NULL,
  prior_ws_omission_steward_a TEXT NOT NULL,
  prior_ws_omission_steward_b TEXT NOT NULL,
  source_card_steward_a TEXT NOT NULL,
  source_card_steward_b TEXT NOT NULL,
  decision_watermark SMALLINT NOT NULL CHECK (decision_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_iwsmpcp_attach_compile (account_id, compile_id),
  CHECK (packet_steward_a <> packet_steward_b),
  CHECK (prior_omission_steward_a <> prior_omission_steward_b),
  CHECK (prior_card_steward_a <> prior_card_steward_b),
  CHECK (prior_packet_steward_a <> prior_packet_steward_b),
  CHECK (prior_ws_omission_steward_a <> prior_ws_omission_steward_b),
  CHECK (source_card_steward_a <> source_card_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_iwsmpcp_packet_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  card_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_kind iwsmpcp_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status iwsmpcp_binding_status NOT NULL,
  placement_kind iwsmpcp_placement_kind NOT NULL,
  key_lifecycle iwsmpcp_key_lifecycle NOT NULL,
  clock_lifecycle iwsmpcp_clock_lifecycle NOT NULL,
  attested_key_kind iwsmpcp_attested_key_kind NOT NULL,
  terminal_kind iwsmpcp_terminal_kind NOT NULL,
  gate_kind iwsmpcp_gate_kind NOT NULL,
  gate_action iwsmpcp_gate_action NOT NULL,
  perceive_kind iwsmpcp_perceive_kind NOT NULL,
  compile_kind iwsmpcp_compile_kind NOT NULL,
  body_visibility iwsmpcp_body_visibility NOT NULL,
  fact_disposition iwsmpcp_fact_disposition NOT NULL,
  clock_disposition iwsmpcp_clock_disposition NOT NULL,
  receipt_disposition iwsmpcp_receipt_disposition NOT NULL,
  effect_observation iwsmpcp_effect_observation NOT NULL,
  purpose_relation iwsmpcp_purpose_relation NOT NULL,
  access_path iwsmpcp_access_path NOT NULL,
  citation_state iwsmpcp_citation_state NOT NULL,
  membership_state iwsmpcp_membership_state NOT NULL,
  catalog_status iwsmpcp_source_catalog_status NOT NULL,
  metadata_trust iwsmpcp_metadata_trust NOT NULL,
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
  UNIQUE (account_id, certificate_id, card_id, decision_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_iwsmpcp_packet_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_iwsmpcp_card_catalog (account_id, card_id)
);

CREATE TABLE agent_iwsmpcp_context_packet (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  card_id UUID NOT NULL,
  membership_state iwsmpcp_membership_state NOT NULL,
  citation_state iwsmpcp_citation_state NOT NULL,
  catalog_status iwsmpcp_source_catalog_status NOT NULL,
  metadata_trust iwsmpcp_metadata_trust NOT NULL,
  effect_observation iwsmpcp_effect_observation NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  fact_disposition iwsmpcp_fact_disposition NOT NULL,
  attested_key_kind iwsmpcp_attested_key_kind NOT NULL,
  body_visibility iwsmpcp_body_visibility NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  packet_hash CHAR(64) NOT NULL CHECK (length(packet_hash) = 64),
  packet_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, packet_id),
  UNIQUE (account_id, session_id),
  UNIQUE (account_id, card_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_iwsmpcp_packet_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_iwsmpcp_card_catalog (account_id, card_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (membership_state = 'OMITTED'),
  CHECK (citation_state = 'DROPPED'),
  CHECK (catalog_status = 'INVALIDATED'),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (inlines_fact_body = false),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (packet_body ? 'factBody')),
  CHECK (NOT (packet_body ? 'fact_body')),
  CHECK (NOT (packet_body ? 'resolvedFactHash')),
  CHECK (packet_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (packet_body->>'factDisposition' IS DISTINCT FROM 'RESTORED'),
  CHECK (packet_body->>'bodyVisibility' IS DISTINCT FROM 'BODY_VISIBLE'),
  CHECK (packet_body->>'membershipState' = 'OMITTED'),
  CHECK (packet_body->>'citationState' = 'DROPPED'),
  CHECK (packet_body->>'catalogStatus' = 'INVALIDATED'),
  CHECK (packet_body->>'metadataTrust' = 'UNTRUSTED_METADATA')
);

CREATE TABLE agent_iwsmpcp_publication_record (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  card_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  effect_observation iwsmpcp_effect_observation NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'INVALIDATED_WS_CARD_ATTACHED', 'RETRACTED', 'QUARANTINED', 'KEY_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, card_id),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_iwsmpcp_card_catalog (account_id, card_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcp_context_packet (account_id, packet_id)
);

CREATE TABLE agent_iwsmpcp_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status iwsmpcp_effect_status NOT NULL,
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
    REFERENCES agent_iwsmpcp_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_iwsmpcp_packet_certificate (account_id, certificate_id)
);

CREATE TABLE agent_iwsmpcp_budget_ledger (
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
    REFERENCES agent_iwsmpcp_session (account_id, session_id)
);

CREATE TABLE agent_iwsmpcp_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcp_session (account_id, session_id)
);

CREATE TABLE agent_iwsmpcp_command_result (
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

CREATE TABLE agent_iwsmpcp_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_iwsmpcp_audit_event (
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

CREATE TABLE agent_iwsmpcp_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_iwsmpcp_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_iwsmpcp_profile()
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
       OR NEW.max_cards_per_session IS DISTINCT FROM OLD.max_cards_per_session
       OR NEW.max_nominated_cards IS DISTINCT FROM OLD.max_nominated_cards
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
    IF current_setting('app.iwsmpcp_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.iwsmpcp_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_iwsmpcp_profile_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_profile();

CREATE FUNCTION protect_agent_iwsmpcp_profile_perceive_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status iwsmpcp_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_iwsmpcp_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile compile rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_iwsmpcp_profile_perceive_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_iwsmpcp_profile_perceive_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_profile_perceive_rule();

CREATE FUNCTION protect_agent_iwsmpcp_card_catalog()
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

CREATE TRIGGER agent_iwsmpcp_card_catalog_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_card_catalog
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_card_catalog();

CREATE FUNCTION protect_agent_iwsmpcp_metadata_binding()
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

CREATE TRIGGER agent_iwsmpcp_metadata_binding_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_metadata_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_metadata_binding();

CREATE FUNCTION protect_agent_iwsmpcp_packet_certificate()
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
       OR NEW.packet_steward_a IS DISTINCT FROM OLD.packet_steward_a
       OR NEW.packet_steward_b IS DISTINCT FROM OLD.packet_steward_b
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
         IS DISTINCT FROM OLD.prior_omission_steward_b
       OR NEW.prior_card_steward_a
         IS DISTINCT FROM OLD.prior_card_steward_a
       OR NEW.prior_card_steward_b
         IS DISTINCT FROM OLD.prior_card_steward_b
       OR NEW.prior_packet_steward_a
         IS DISTINCT FROM OLD.prior_packet_steward_a
       OR NEW.prior_packet_steward_b
         IS DISTINCT FROM OLD.prior_packet_steward_b
       OR NEW.prior_ws_omission_steward_a
         IS DISTINCT FROM OLD.prior_ws_omission_steward_a
       OR NEW.prior_ws_omission_steward_b
         IS DISTINCT FROM OLD.prior_ws_omission_steward_b
       OR NEW.source_card_steward_a IS DISTINCT FROM OLD.source_card_steward_a
       OR NEW.source_card_steward_b IS DISTINCT FROM OLD.source_card_steward_b THEN
      RAISE EXCEPTION 'packet certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.packet_steward_a = NEW.packet_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct packet stewards';
  END IF;
  IF NEW.packet_steward_a = NEW.prior_compiler_steward_a
     OR NEW.packet_steward_a = NEW.prior_compiler_steward_b
     OR NEW.packet_steward_b = NEW.prior_compiler_steward_a
     OR NEW.packet_steward_b = NEW.prior_compiler_steward_b
     OR NEW.packet_steward_a = NEW.perception_steward_a
     OR NEW.packet_steward_a = NEW.perception_steward_b
     OR NEW.packet_steward_b = NEW.perception_steward_a
     OR NEW.packet_steward_b = NEW.perception_steward_b
     OR NEW.packet_steward_a = NEW.receipt_steward_a
     OR NEW.packet_steward_a = NEW.receipt_steward_b
     OR NEW.packet_steward_b = NEW.receipt_steward_a
     OR NEW.packet_steward_b = NEW.receipt_steward_b
     OR NEW.packet_steward_a = NEW.prior_gate_steward_a
     OR NEW.packet_steward_a = NEW.prior_gate_steward_b
     OR NEW.packet_steward_b = NEW.prior_gate_steward_a
     OR NEW.packet_steward_b = NEW.prior_gate_steward_b
     OR NEW.packet_steward_a = NEW.prior_extension_steward_a
     OR NEW.packet_steward_a = NEW.prior_extension_steward_b
     OR NEW.packet_steward_b = NEW.prior_extension_steward_a
     OR NEW.packet_steward_b = NEW.prior_extension_steward_b
     OR NEW.packet_steward_a = NEW.prior_omission_steward_a
     OR NEW.packet_steward_a = NEW.prior_omission_steward_b
     OR NEW.packet_steward_b = NEW.prior_omission_steward_a
     OR NEW.packet_steward_b = NEW.prior_omission_steward_b
     OR NEW.packet_steward_a = NEW.prior_card_steward_a
     OR NEW.packet_steward_a = NEW.prior_card_steward_b
     OR NEW.packet_steward_b = NEW.prior_card_steward_a
     OR NEW.packet_steward_b = NEW.prior_card_steward_b
     OR NEW.packet_steward_a = NEW.prior_packet_steward_a
     OR NEW.packet_steward_a = NEW.prior_packet_steward_b
     OR NEW.packet_steward_b = NEW.prior_packet_steward_a
     OR NEW.packet_steward_b = NEW.prior_packet_steward_b
     OR NEW.packet_steward_a = NEW.prior_ws_omission_steward_a
     OR NEW.packet_steward_a = NEW.prior_ws_omission_steward_b
     OR NEW.packet_steward_b = NEW.prior_ws_omission_steward_a
     OR NEW.packet_steward_b = NEW.prior_ws_omission_steward_b
     OR NEW.packet_steward_a = NEW.source_card_steward_a
     OR NEW.packet_steward_a = NEW.source_card_steward_b
     OR NEW.packet_steward_b = NEW.source_card_steward_a
     OR NEW.packet_steward_b = NEW.source_card_steward_b THEN
    RAISE EXCEPTION 'prior-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_iwsmpcp_packet_certificate_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_packet_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_packet_certificate();

CREATE FUNCTION protect_agent_iwsmpcp_packet_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
DECLARE
  catalog_citation iwsmpcp_citation_state;
  catalog_source_status iwsmpcp_source_catalog_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.card_id IS DISTINCT FROM OLD.card_id
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
       OR NEW.catalog_status IS DISTINCT FROM OLD.catalog_status
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

  IF NEW.metadata_trust IS DISTINCT FROM 'UNTRUSTED_METADATA' THEN
    RAISE EXCEPTION 'metadata fence requires UNTRUSTED_METADATA';
  END IF;

  IF NEW.purpose_relation = 'AMPLIFIES' THEN
    RAISE EXCEPTION 'purpose-amplification fence blocks broader purpose than citation attenuation';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence blocks opening another expiry plane';
  END IF;

  IF NEW.access_path IN ('CARD_SCAN', 'LEDGER_SCAN') THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.clock_disposition = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks rewinding a successor clock';
  END IF;

  SELECT citation_state, catalog_status
    INTO catalog_citation, catalog_source_status
  FROM agent_iwsmpcp_card_catalog
  WHERE account_id = NEW.account_id
    AND card_id = NEW.card_id;

  IF NEW.compile_kind = 'ATTACH_INVALIDATED_WS_CARD'
     AND (
       catalog_citation IS DISTINCT FROM 'DROPPED'
       OR catalog_source_status IS DISTINCT FROM 'INVALIDATED'
     ) THEN
    RAISE EXCEPTION 'live-member fence blocks perceiving a live working-set member';
  END IF;

  IF NEW.compile_kind = 'ATTACH_INVALIDATED_WS_CARD'
     AND (
       NEW.source_kind IS DISTINCT FROM 'SEALED_INVALIDATED_WS_CARD'
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
       OR NEW.catalog_status IS DISTINCT FROM 'INVALIDATED'
       OR NEW.metadata_trust IS DISTINCT FROM 'UNTRUSTED_METADATA'
       OR NEW.silence_inferred
       OR NEW.inlines_fact_body
       OR NEW.opens_nested_expiry
       OR NEW.successor_clock_hash IS NOT DISTINCT FROM NEW.prior_clock_hash
     ) THEN
    RAISE EXCEPTION 'perceive fence requires one invalidated working-set member by point lookup';
  END IF;

  IF NEW.compile_kind = 'ATTACH_INVALIDATED_WS_CARD'
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

CREATE TRIGGER agent_iwsmpcp_packet_decision_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_packet_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_packet_decision();

CREATE FUNCTION protect_agent_iwsmpcp_context_packet()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
DECLARE
  catalog_citation iwsmpcp_citation_state;
  catalog_source_status iwsmpcp_source_catalog_status;
  decision_found BOOLEAN;
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

  IF NEW.catalog_status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'catalog-status fence blocks a member that does not repeat INVALIDATED';
  END IF;

  SELECT citation_state, catalog_status
    INTO catalog_citation, catalog_source_status
  FROM agent_iwsmpcp_card_catalog
  WHERE account_id = NEW.account_id
    AND card_id = NEW.card_id;

  IF catalog_citation IS DISTINCT FROM 'DROPPED'
     OR catalog_source_status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'live-member fence blocks perceiving a live working-set member';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM agent_iwsmpcp_packet_decision
    WHERE account_id = NEW.account_id
      AND certificate_id = NEW.certificate_id
      AND card_id = NEW.card_id
      AND compile_kind = 'ATTACH_INVALIDATED_WS_CARD'
      AND membership_state = 'OMITTED'
      AND citation_state = 'DROPPED'
      AND catalog_status = 'INVALIDATED'
  ) INTO decision_found;

  IF decision_found IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'perception card requires a sealed perception decision';
  END IF;

  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_iwsmpcp_context_packet_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_context_packet
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_context_packet();

CREATE FUNCTION protect_agent_iwsmpcp_effect_intent()
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

CREATE TRIGGER agent_iwsmpcp_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcp_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcp_effect_intent();

CREATE FUNCTION approve_agent_iwsmpcp_profile(
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
  stored_status iwsmpcp_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_iwsmpcp_profile
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
  FROM agent_iwsmpcp_profile_perceive_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_compile IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control compile rule';
  END IF;

  PERFORM set_config(
    'app.iwsmpcp_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_iwsmpcp_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_iwsmpcp_profile(
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
  stored_status iwsmpcp_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_iwsmpcp_profile
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
    'app.iwsmpcp_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_iwsmpcp_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_iwsmpcp_card(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_card_id UUID,
  recipient_nomination_id UUID,
  nomination_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  catalog agent_iwsmpcp_card_catalog%ROWTYPE;
BEGIN
  IF recipient_card_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_iwsmpcp_card_catalog
  WHERE account_id = tenant_id
    AND card_id = recipient_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member point lookup missed';
  END IF;

  IF catalog.citation_state IS DISTINCT FROM 'DROPPED'
     OR catalog.status IS DISTINCT FROM 'DROPPED'
     OR catalog.membership_state IS DISTINCT FROM 'OMITTED'
     OR catalog.catalog_status IS DISTINCT FROM 'INVALIDATED'
     OR catalog.source_kind IS DISTINCT FROM 'SEALED_INVALIDATED_WS_CARD' THEN
    RAISE EXCEPTION 'live-member fence blocks nominating a live working-set member';
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

  INSERT INTO agent_iwsmpcp_nomination (
    account_id, nomination_id, session_id, card_id,
    access_path, source_kind, gate_kind, gate_action,
    effect_observation, receipt_disposition, silence_inferred,
    citation_state, catalog_status, disputed_fact_hash, provider_receipt_hash,
    nomination_hash, nominated_at
  ) VALUES (
    tenant_id, recipient_nomination_id, recipient_session_id,
    recipient_card_id, 'POINT_LOOKUP', catalog.source_kind,
    catalog.gate_kind, catalog.gate_action,
    catalog.effect_observation, catalog.receipt_disposition,
    catalog.silence_inferred, catalog.citation_state, catalog.catalog_status,
    catalog.disputed_fact_hash, catalog.provider_receipt_hash,
    nomination_digest, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION publish_agent_iwsmpcp_packet(
  tenant_id BIGINT,
  recipient_card_id UUID,
  recipient_packet_id UUID,
  recipient_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $record_omission$
DECLARE
  catalog agent_iwsmpcp_card_catalog%ROWTYPE;
  member agent_iwsmpcp_context_packet%ROWTYPE;
BEGIN
  IF recipient_card_id IS NULL OR recipient_packet_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_iwsmpcp_card_catalog
  WHERE account_id = tenant_id
    AND card_id = recipient_card_id;

  IF NOT FOUND
     OR catalog.citation_state IS DISTINCT FROM 'DROPPED'
     OR catalog.catalog_status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'perception publication requires an invalidated working-set member point lookup';
  END IF;

  SELECT * INTO member
  FROM agent_iwsmpcp_context_packet
  WHERE account_id = tenant_id
    AND packet_id = recipient_packet_id;

  IF NOT FOUND
     OR member.card_id IS DISTINCT FROM recipient_card_id
     OR member.membership_state IS DISTINCT FROM 'OMITTED'
     OR member.citation_state IS DISTINCT FROM 'DROPPED'
     OR member.catalog_status IS DISTINCT FROM 'INVALIDATED'
     OR member.inlines_fact_body THEN
    RAISE EXCEPTION 'perception publication requires a sealed invalidated working-set member';
  END IF;

  INSERT INTO agent_iwsmpcp_publication_record (
    account_id, record_id, card_id, packet_id,
    provider_receipt_hash, effect_observation, reason_code, created_at
  ) VALUES (
    tenant_id, recipient_record_id, recipient_card_id, recipient_packet_id,
    member.provider_receipt_hash, member.effect_observation,
    'INVALIDATED_WS_CARD_ATTACHED', clock_timestamp()
  );
END
$record_omission$;

CREATE FUNCTION reject_agent_iwsmpcp_unscoped_scan(
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

ALTER FUNCTION approve_agent_iwsmpcp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_iwsmpcp_profile_authority;
ALTER FUNCTION revoke_agent_iwsmpcp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_iwsmpcp_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_iwsmpcp_profile_authority;
GRANT SELECT ON
  agent_iwsmpcp_profile,
  agent_iwsmpcp_profile_perceive_rule
TO agent_iwsmpcp_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_iwsmpcp_profile TO agent_iwsmpcp_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_iwsmpcp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_iwsmpcp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_iwsmpcp_profile FROM PUBLIC;

CREATE INDEX agent_iwsmpcp_session_work_idx ON agent_iwsmpcp_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_iwsmpcp_session_profile_idx ON agent_iwsmpcp_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_iwsmpcp_decision_packet_idx ON agent_iwsmpcp_packet_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_iwsmpcp_decision_source_idx ON agent_iwsmpcp_packet_decision (
  account_id, card_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_iwsmpcp_catalog_ref_idx ON agent_iwsmpcp_card_catalog (
  account_id, card_ref, sealed_at DESC, card_id
);
CREATE INDEX agent_iwsmpcp_catalog_kind_idx ON agent_iwsmpcp_card_catalog (
  account_id, source_kind, sealed_at DESC, card_id
);
CREATE INDEX agent_iwsmpcp_record_session_idx ON agent_iwsmpcp_attach_compile (
  account_id, session_id, compiled_at DESC, compile_id
);
CREATE INDEX agent_iwsmpcp_certificate_session_idx ON agent_iwsmpcp_packet_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_iwsmpcp_nomination_session_idx ON agent_iwsmpcp_nomination (
  account_id, session_id, nominated_at DESC, nomination_id
);
CREATE INDEX agent_iwsmpcp_effect_work_idx ON agent_iwsmpcp_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_iwsmpcp_audit_time_idx ON agent_iwsmpcp_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_iwsmpcp_card_status_idx ON agent_iwsmpcp_context_packet (
  account_id, membership_state, created_at DESC, packet_id
);
CREATE INDEX agent_iwsmpcp_command_expiry_idx ON agent_iwsmpcp_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_iwsmpcp_publication_packet_idx ON agent_iwsmpcp_publication_record (
  account_id, card_id, created_at DESC, record_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_iwsmpcp_authorization_evidence',
    'agent_iwsmpcp_profile',
    'agent_iwsmpcp_profile_perceive_rule',
    'agent_iwsmpcp_card_catalog',
    'agent_iwsmpcp_session',
    'agent_iwsmpcp_nomination',
    'agent_iwsmpcp_metadata_binding',
    'agent_iwsmpcp_attach_compile',
    'agent_iwsmpcp_packet_certificate',
    'agent_iwsmpcp_packet_decision',
    'agent_iwsmpcp_context_packet',
    'agent_iwsmpcp_publication_record',
    'agent_iwsmpcp_effect_intent',
    'agent_iwsmpcp_budget_ledger',
    'agent_iwsmpcp_terminal_record',
    'agent_iwsmpcp_command_result',
    'agent_iwsmpcp_audit_head',
    'agent_iwsmpcp_audit_event',
    'agent_iwsmpcp_audit_anchor',
    'agent_iwsmpcp_projection_checkpoint'
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

Nomination, metadata bind, evaluation, seal, and the
context packet commit or roll back together. Publication
is its own append. Notify dispatch is not part of the
database transaction. `state_revision` is the
compare-and-swap token for session commands.

### 8.2 Tenant isolation

`account_id` is the first column of every table and every
index. `FORCE ROW LEVEL SECURITY` applies
`tenant_isolation` using `app.account_id`. Cross-tenant
reads and writes fail closed. There is no global card
catalog.

## 9. Open API GraphQL contract

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentIwsmpcpSessionStatus {
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

enum AgentIwsmpcpCompileKind {
  ATTACH_INVALIDATED_WS_CARD
  HOLD_UNKNOWN_EFFECT
  DENY_CARD_AS_TRUST
  DENY_CARD_AS_RESTORE
  DENY_BODY_INLINE
  DENY_ACK_AS_TRUST
  DENY_CARD_SCAN
  DENY_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentIwsmpcpCitationState {
  DROPPED
  ATTACHED
  HELD
  UNKNOWN_EFFECT
}

enum AgentIwsmpcpSourceCatalogStatus {
  INVALIDATED
  ATTACHED
  LIVE
  UNKNOWN_EFFECT
}

enum AgentIwsmpcpMembershipState {
  OMITTED
  INCLUDED
  HELD
  UNKNOWN_EFFECT
}

enum AgentIwsmpcpEffectObservation {
  ACKED
  FAILED
  DISPATCHED
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentIwsmpcpEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentIwsmpcpNextAction {
  NOMINATE_INVALIDATED_WS_CARD
  BIND_UNTRUSTED_METADATA
  EVALUATE_INVALIDATED_PERCEPTION
  SEAL_INVALIDATED_PERCEPTION
  PUBLISH_INVALIDATED_PERCEPTION
  PREPARE_PERCEPTION_NOTIFY
  PERCEPTION_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentIwsmpcpBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  BUDGET_EXHAUSTED
  CARD_MISSING
  PACKET_AS_TRUST_DENIED
  PACKET_AS_RESTORE_DENIED
  BODY_INLINE_DENIED
  CITATION_STILL_ATTACHED
  CATALOG_NOT_INVALIDATED
  NESTED_EXPIRY_DENIED
  CARD_SCAN_DENIED
  UNKNOWN_EFFECT
}

type AgentIwsmpcpProfile {
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

type AgentIwsmpcpSession {
  accountId: Long!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentIwsmpcpSessionStatus!
  stateRevision: Long!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentIwsmpcpCardCatalogEntry {
  accountId: Long!
  cardId: ID!
  sourceKind: String!
  citationState: AgentIwsmpcpCitationState!
  catalogStatus: AgentIwsmpcpSourceCatalogStatus!
  gateKind: String!
  gateAction: String!
  disputedFactHash: SHA256!
  providerReceiptHash: SHA256!
  effectObservation: AgentIwsmpcpEffectObservation!
  status: String!
}

type AgentIwsmpcpCertificate {
  accountId: Long!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  compileKind: AgentIwsmpcpCompileKind!
  effectObservation: AgentIwsmpcpEffectObservation!
  sealedAt: DateTime!
}

type AgentIwsmpcpContextPacket {
  accountId: Long!
  sessionId: ID!
  packetId: ID!
  cardId: ID!
  status: AgentIwsmpcpSessionStatus!
  summary: String!
  membershipState: AgentIwsmpcpMembershipState!
  citationState: AgentIwsmpcpCitationState!
  catalogStatus: AgentIwsmpcpSourceCatalogStatus!
  metadataTrust: String!
  effectObservation: AgentIwsmpcpEffectObservation!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  factDisposition: String!
  attestedKeyKind: String!
  bodyVisibility: String!
  inlinesFactBody: Boolean!
  unknownEffectCount: Int!
  allowedNextActions: [AgentIwsmpcpNextAction!]!
  blockedReasons: [AgentIwsmpcpBlockedReason!]!
  packetHash: SHA256!
}

type AgentIwsmpcpAuditHead {
  accountId: Long!
  headSequence: Long!
  headHash: SHA256!
  updatedAt: DateTime!
}

type AgentIwsmpcpResult {
  decision: String!
  retryable: Boolean!
  reason: String!
  session: AgentIwsmpcpSession
  certificate: AgentIwsmpcpCertificate
  perception: AgentIwsmpcpContextPacket
  auditHash: SHA256!
}

input AgentIwsmpcpBudgetInput {
  nominateUnits: Int!
  bindUnits: Int!
  sealUnits: Int!
  vectorUnits: Int!
  publishUnits: Int!
  notifyUnits: Int!
  maxWallTimeMs: Int!
  compileThreshold: Int!
  maxCardsPerSession: Int!
  maxNominatedCards: Int!
}

input CreateInvalidatedWsCardContextPacketSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentIwsmpcpBudgetInput!
}

input NominateInvalidatedWsCardInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  cardId: ID!
  expectedDisputedFactHash: SHA256!
  expectedProviderReceiptHash: SHA256!
  idempotencyKey: String!
}

input BindInvalidatedWsCardContextPacketMetadataInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  cardId: ID!
  providerReceiptHash: SHA256!
  effectObservation: AgentIwsmpcpEffectObservation!
  silenceInferred: Boolean!
  idempotencyKey: String!
}

input EvaluateInvalidatedWsCardContextPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  expectedProviderReceiptHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealInvalidatedWsCardContextPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  compileId: ID!
  consumerRef: String!
  packetStewardA: String!
  packetStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input RecordInvalidatedWsCardContextPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  cardId: ID!
  packetId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input PrepareInvalidatedWsCardContextPacketNotifyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input RecordInvalidatedWsCardContextPacketNotifyUncertaintyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: String!
  idempotencyKey: String!
}

input CloseInvalidatedWsCardContextPacketSessionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input PublishInvalidatedWsCardContextPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

type Query {
  invalidatedWsCardContextPacketProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentIwsmpcpProfile
  invalidatedWsCardContextPacketSession(accountId: Long!, sessionId: ID!): AgentIwsmpcpSession
  invalidatedWsCardCatalogEntry(accountId: Long!, cardId: ID!): AgentIwsmpcpCardCatalogEntry
  invalidatedWsCardContextPacketCertificate(accountId: Long!, certificateId: ID!): AgentIwsmpcpCertificate
  invalidatedWsCardContextPacket(accountId: Long!, packetId: ID!): AgentIwsmpcpContextPacket
  invalidatedWsCardContextPacketAuditReplay(accountId: Long!, sessionId: ID!): AgentIwsmpcpAuditHead
}

type Mutation {
  createInvalidatedWsCardContextPacketSession(input: CreateInvalidatedWsCardContextPacketSessionInput!): AgentIwsmpcpResult!
  nominateInvalidatedWsCard(input: NominateInvalidatedWsCardInput!): AgentIwsmpcpResult!
  bindInvalidatedWsCardContextPacketMetadata(input: BindInvalidatedWsCardContextPacketMetadataInput!): AgentIwsmpcpResult!
  evaluateInvalidatedWsCardContextPacket(input: EvaluateInvalidatedWsCardContextPacketInput!): AgentIwsmpcpResult!
  sealInvalidatedWsCardContextPacket(input: SealInvalidatedWsCardContextPacketInput!): AgentIwsmpcpResult!
  recordInvalidatedWsCardContextPacket(input: RecordInvalidatedWsCardContextPacketInput!): AgentIwsmpcpResult!
  prepareInvalidatedWsCardContextPacketNotify(input: PrepareInvalidatedWsCardContextPacketNotifyInput!): AgentIwsmpcpResult!
  recordInvalidatedWsCardContextPacketNotifyUncertainty(input: RecordInvalidatedWsCardContextPacketNotifyUncertaintyInput!): AgentIwsmpcpResult!
  closeInvalidatedWsCardContextPacketSession(input: CloseInvalidatedWsCardContextPacketSessionInput!): AgentIwsmpcpResult!
  publishInvalidatedWsCardContextPacket(input: PublishInvalidatedWsCardContextPacketInput!): AgentIwsmpcpResult!
}
```

### GraphQL limits

The schema exposes 6 point-lookup queries and 10 mutations.
Every operation takes `accountId`. There is no unbounded
list of perception cards. Resolvers that would scan a
board with 1M+ rows are **FULL SCAN REJECTED** before
planning. `publishInvalidatedWsCardContextPacket` repeats
one already sealed card as a context packet. It does not
search for the next card to attach.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `compile_instruction` records that one attachment
compile publishes one sealed invalidated perception card
as a context packet, repeats membership `OMITTED`, citation
`DROPPED`, and catalog status `INVALIDATED` as untrusted
metadata, and never treats `ACKED` as trust.
`procedureRef` points at that profile version. Agents do
not store a second hidden policy. If the profile is
revoked with `STOP_BEFORE_ATTACH`, new nominations stop.
In-flight packets remain replayable.

Semantic tags (`incident`, `invalidated-ws-card`) are
for discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_iwsmpcp_profile_embedding (
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
    REFERENCES agent_iwsmpcp_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_iwsmpcp_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_iwsmpcp_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_iwsmpcp_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped perception-card catalog or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one invalidated perception card by
primary key `(account_id, card_id)`, and seals under
dual control. Similarity never publishes a packet and never
puts an omitted card back into the working set.

## 12. Agent perception

Agents receive one context packet per session. The packet
exposes `membershipState`, `citationState`,
`catalogStatus`, `metadataTrust`, `effectObservation`,
`providerReceiptHash`, and `disputedFactHash` as separate
metadata, plus `factDisposition`, `attestedKeyKind`, and
`bodyVisibility`. Summary text is `UntrustedText`. Packets
also expose unknown-effect counts, card-scan denials,
remaining budgets, procedure tags, allowed next actions,
and blocked reasons. They never embed raw private keys,
tool payloads, fact bodies, or a winning fact hash.
`packetHash` makes perception replayable.

An LLM should read the packet as: "one omitted invalidated
perception card was attached by point lookup of
`(account_id, card_id)`. Membership is `OMITTED`, the
citation is `DROPPED`, and the catalog status is
`INVALIDATED`, all as `UNTRUSTED_METADATA`. The effect is
either `ACKED` with this untrusted receipt hash or still
`UNKNOWN_EFFECT`." It should not read the packet as "the
disputed fact is now false," "the fact body is available,"
"the catalog status promotes the key," or "the signing
key is `TRUSTED_ENROLLED`." Metadata tags that keep that
reading stable are `metadataTrust=UNTRUSTED_METADATA`,
`membershipState=OMITTED`, `citationState=DROPPED`,
`catalogStatus=INVALIDATED`,
`factDisposition=DISPUTED_HELD`,
`attestedKeyKind=AWAITING_CONFIRMATION`,
`bodyVisibility=OMITTED`, and `inlinesFactBody=false`.

## 13. ACID and consistency

### Row store

Nomination, metadata bind, evaluation, and seal commit or
roll back together. Compare-and-swap on `state_revision`
rejects lost updates. Decision identity is immutable. The
context packet is a projection of one omitted perception
card, not a second fact. The publication record is its
own transaction and appends history without rewriting the
packet.

### Columnar store

Analytical counts of compile kinds, membership states, and
effect observations are derived from the row store by
`account_id`. They lag the seal watermark and cannot
authorize a new packet or restore an omitted card.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but discovery never nominates a card.
Account predicates are applied before HNSW topK.

### External tools

Notify providers sit outside the ACID boundary. Silence and
ambiguous responses stay `UNKNOWN_EFFECT`. A notify
acknowledgement cannot include a card, inline a fact
body, or promote `ACKED` to `TRUSTED_ENROLLED`.

## 14. Guardrails and neighbor protection

Attachment budgets cap nominate, bind, seal, vector,
publish, and notify units per session. The one-card cap
rejects a second nomination before it can fan out into
recursive retrieval. A packet cannot schedule another
compile of itself and cannot open a nested expiry.
`CARD_SCAN`, `LEDGER_SCAN`, missing `account_id`, and a
missing `card_id` are **FULL SCAN REJECTED** by
`reject_agent_iwsmpcp_unscoped_scan` before the planner
touches a board with 1M+ rows. Vector discovery is capped
by `budget_vector_units` and cannot authorize seal. Halted
and quarantined bodies stay `OMITTED`.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing every perception card for an account to "find
  the invalidated ones before attaching them."
- Joining perception cards to board items or citation
  ledgers to recover a fact body.
- Building one global HNSW index and authorizing from the
  nearest profile.
- Attaching a card by scanning every prior packet.

Each of those plans is **FULL SCAN REJECTED**. The primary
path is one index lookup on `(account_id, card_id)`,
which stays selective on boards with 1M+ rows.

### Required access paths

- Card nomination and packet publication: primary key
  `(account_id, card_id)`.
- Context packet read: primary key `(account_id, packet_id)`.
- Session and audit reads: `(account_id, session_id)` plus
  the session work index.
- Profile discovery: `account_id` equality, then HNSW topK
  inside that partition.

### Planner enforcement

`nominate_agent_iwsmpcp_card` and
`publish_agent_iwsmpcp_packet` refuse a null point key.
Resolvers do not expose an unbounded list field. The
reference schema creates no cross-tenant HNSW index.

## 16. Auditability and replay

`agent_iwsmpcp_audit_event` is a hash chain per
`account_id`. Anchors store a Merkle root over a sequence
range. Replay recomputes the attachment decision from the
sealed card hashes, the dual-control stewards, and the
membership, citation, and catalog status. It does not call
an LLM and does not reconstruct a fact body. A publication
record stores `INVALIDATED_WS_CARD_ATTACHED` without
erasing the historical receipt hash and without promoting
`ACKED`.

## 17. Threat and failure analysis

- **Packet-as-trust:** a compiler writes `TRUSTED_ENROLLED`
  because the effect was `ACKED`. Rejected.
- **Packet-as-restore:** a compiler writes `RESTORED`,
  `INCLUDED`, `ATTACHED`, or `BODY_VISIBLE`. Rejected.
- **Body inline:** `packet_body` contains `factBody`.
  Rejected.
- **Silence-as-ack:** `ACKED` with `silence_inferred`.
  Rejected.
- **Live card:** the catalog membership is `INCLUDED`,
  the citation is `ATTACHED`, or the catalog status is not
  `INVALIDATED`, and the compiler still tries to attach
  it. Nomination and seal are rejected. This plane does
  not invent an attachment or an invalidation.
- **Nested expiry:** `opens_nested_expiry` is rejected.
  Attachment does not start another review cycle.
- **Card scan and hop leak:** `CARD_SCAN`,
  `LEDGER_SCAN`, and purpose amplification are rejected.
- **Prior steward reuse:** source perception-card,
  working-set omission, packet, card, omission, compiler,
  perception, receipt, gate, and extension stewards cannot
  seal this packet.
- **Neighbor damage:** unscoped scans and a second card
  in the same session are rejected before they touch a
  1M+ row board.

## 18. Observability and SLOs

Availability target remains 99.99% for neighbor board
traffic. This plane's SLOs are:

- point-lookup nomination p99 under 20 ms inside the
  tenant partition;
- seal transaction p99 under 50 ms with no board write;
- publication append p99 under 20 ms after the packet is
  sealed;
- zero packets sealed with `inlines_fact_body = true`;
- zero packets whose catalog membership is not `OMITTED`,
  whose catalog citation is not `DROPPED`, or whose
  catalog status is not `INVALIDATED`;
- `UNKNOWN_EFFECT` notify age visible on the context
  packet.

Columnar counts of attached, held, and denied cards are
operational. They are not authorization.

## 19. Rollout

### Phase 1: shadow packets

Compile packets in shadow mode. Agents do not read them.
Compare packet metadata with the source omitted perception
card.

### Phase 2: deny-only

Serve `DENY_CARD_AS_TRUST`, `DENY_CARD_AS_RESTORE`,
`DENY_BODY_INLINE`, and `DENY_CARD_SCAN`. Do not publish.

### Phase 3: one attached card

Allow `ATTACH_INVALIDATED_WS_CARD` for approved
profiles. Facts stay `DISPUTED_HELD`. Metadata stays
untrusted. Membership is `OMITTED`. Citation is `DROPPED`.
Catalog status is `INVALIDATED`.

### Phase 4: publish and notify uncertainty

Enable publication records and surface `UNKNOWN_EFFECT`
notify. A publication does not restore a fact and does not
promote `ACKED`.

### Phase 5: broad availability

Default-on for tenants that already perceive omitted
invalidated working-set members as cards. Profiles still
require dual control. Similarity still cannot seal.

## 20. Ship criteria

### Contract validation

TypeScript contracts compile under strict mode. The GraphQL
schema builds with 6 queries and 10 mutations. SQL enums
stay within 63-byte labels. Every table and index leads
with `account_id`.

### Behavioral validation

- An omitted invalidated perception card can be nominated
  by `(account_id, card_id)` and attached once.
- The context packet repeats `OMITTED`, `DROPPED`,
  `INVALIDATED`, `ACKED`, and the receipt hash as
  `UNTRUSTED_METADATA` while the key stays
  `AWAITING_CONFIRMATION` and the fact stays
  `DISPUTED_HELD`.
- `TRUSTED_ENROLLED`, `RESTORED`, `BODY_VISIBLE`,
  `INCLUDED`, and `factBody` are rejected.
- `CARD_SCAN`, `opens_nested_expiry`, and nomination of
  an `INCLUDED` card are rejected.
- `publish_agent_iwsmpcp_packet` appends
  `INVALIDATED_WS_CARD_ATTACHED` without rewriting the
  packet body.
- Direct profile approval, sealed-rule edits, and unscoped
  scans are rejected.
- A packet steward who sealed the source perception card
  is rejected.

### Scale and failure validation

Explain plans for nomination and publication use the
primary key. A missing point key is **FULL SCAN
REJECTED**. A 1M+ row board is not read. Notify silence
remains `UNKNOWN_EFFECT`.

## 21. Product decision

Ship the Invalidated Working-Set Member Perception Context
Packet Plane as the deterministic bridge from one omitted
invalidated perception card to one context packet. The
latency cost is one primary-key compile on
`(account_id, card_id)`. The consistency win is that
membership `OMITTED`, citation `DROPPED`, and catalog
status `INVALIDATED` stay untrusted metadata, `ACKED`
stays an effect observation, the disputed fact stays held,
and the body stays omitted. Catalog status `INVALIDATED`
is copied from the card catalog. It is not invented by
the packet, and it is not `TRUSTED_ENROLLED`.

The next increment should record one agent-visible
attachment receipt for that sealed context packet by point
lookup of `(account_id, packet_id)`. The receipt repeats
membership `OMITTED`, citation `DROPPED`, and catalog
status `INVALIDATED` as `UNTRUSTED_METADATA`. `ACKED` stays
an effect observation. The receipt must not scan context
packets, must not inline the fact body, must not promote
`ACKED` to `TRUSTED_ENROLLED`, and must not open another
nested expiry plane.
