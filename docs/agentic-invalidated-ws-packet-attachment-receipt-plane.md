# mondayDB Agentic Invalidated Context-Packet Attachment Receipt Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-06.v1`

## 1. Why this plane, before how

The 2026-10-05 Invalidated Working-Set Member Perception
Context Packet Plane can attach exactly one sealed
perception card to one context packet by point lookup of
`(account_id, card_id)`. That packet repeats membership
`OMITTED`, citation `DROPPED`, and catalog status
`INVALIDATED` as `UNTRUSTED_METADATA`. `ACKED` stays an
effect observation. The disputed fact stays
`DISPUTED_HELD`. The key stays `AWAITING_CONFIRMATION`.
The body stays off the packet.

A downstream agent still cannot see that the attachment
happened without a second compile. Without this plane the
agent either:

- scans context packets, perception cards, and board rows
  to decide which packet to acknowledge (neighbor-harmful
  on boards with 1M+ rows), or
- inlines the disputed fact and reads `ACKED` as
  `TRUSTED_ENROLLED` so the receipt "explains" the packet
  by revealing the held fact.

The product trade-off is **receipt fluency versus citation
integrity and neighbor latency**:

- Scanning every context packet, or copying the fact body
  onto a receipt, maximizes prompt fluency and hides the
  hold. It also puts a 1M+ row walk on the primary path
  and can miss the 99.99% neighbor availability target.
- Recording exactly one agent-visible attachment receipt
  by point lookup of `(account_id, packet_id)` adds one
  bounded compile transaction. The receipt repeats
  membership `OMITTED`, citation `DROPPED`, and catalog
  status `INVALIDATED` as `UNTRUSTED_METADATA`. `ACKED`
  stays an effect observation. The disputed fact stays
  `DISPUTED_HELD`. The key stays `AWAITING_CONFIRMATION`.
  The body stays `OMITTED`. Silence stays
  `UNKNOWN_EFFECT`.
- Semantic similarity may discover receipt profiles, but
  it must never decide whether a packet may be nominated,
  metadata bound, a receipt evaluated, a receipt sealed,
  a receipt published, or a consumer notified.

Latency stays on the primary key. Consistency is the
sealed receipt row inside one ACID transaction, not an
eventually consistent guess that an omitted packet
"probably belongs in the prompt." Neighbor availability
stays at the 99.99% target because an unscoped packet
walk is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved receipt profile is procedural memory for
   "how one sealed invalidated context packet is recorded
   as one attachment receipt." A profile **never** inlines
   a fact body, **never** rewrites `ACKED` as
   `TRUSTED_ENROLLED`, and **never** opens another nested
   expiry plane.
2. A session opens under purpose, budget, and authorization
   fences, and nominates exactly one sealed packet by
   point lookup of `(account_id, packet_id)`. Hashes and
   catalog status are copied from the packet catalog. They
   are never computed by walking context packets or
   ledgers.
3. mondayDB evaluates a receipt whose outcome is a pure
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
   cannot be recorded as if the packet were a trusted fact.
   A catalog status other than `INVALIDATED` cannot be
   recorded by this plane.
4. Sealing binds `consumer_ref + purpose_hash +
   prior_clock_hash + successor_clock_hash +
   disputed_fact_hash + provider_receipt_hash +
   halt_scope_hash + attenuation_hash + decision_set_hash +
   attachment_receipt_steward_a +
   attachment_receipt_steward_b`. The receipt **must not**
   emit a fact body and **must not** emit
   `TRUSTED_ENROLLED`. Attachment-receipt stewards are
   distinct from each other and from both source
   context-packet stewards who sealed the packet, and from
   both prior working-set omission stewards, both prior
   packet stewards, both prior card stewards, both prior
   omission stewards, both prior compiler stewards, both
   perception stewards, both prior receipt stewards, both
   prior gate stewards, and both prior extension stewards.
5. Publishing the receipt is a second point lookup of the
   same `(account_id, packet_id)` plus `(account_id,
   receipt_id)`. Notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not enrollment, not a fact restore,
   and not permission to put the packet back.
6. Unscoped packet-catalog, context-packet, perception-card,
   working-set, vote-ledger, page-ledger, ack-ledger,
   escalation-ledger, containment-ledger, review-ledger,
   resolution-ledger, promotion-ledger, or board scans are
   **FULL SCAN REJECTED** before planning.

### Product outcome

For any invalidated context-packet attachment receipt,
mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, metadata bind, evaluation, seal, receipt
  publication, or notify dispatch?
- Which sealed context packet was read by primary key
  `(account_id, packet_id)`, and which membership,
  citation, and catalog status were repeated as untrusted
  metadata?
- Did the receipt repeat `OMITTED`, `DROPPED`, and
  `INVALIDATED` while `ACKED` stayed an effect observation,
  the disputed fact stayed held, the body stayed omitted,
  and the key stayed unconfirmed?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the receipt history be replayed without invoking an
  LLM?

HNSW profile discovery stays account-scoped and never
authorizes this receipt.

## 2. Scope and ownership

The Invalidated Context-Packet Attachment Receipt Plane
owns:

1. Immutable approved receipt profiles as procedural
   memory of "how one sealed context packet is recorded as
   one attachment receipt without inlining a disputed fact,
   treating `ACKED` as `TRUSTED_ENROLLED`, scanning
   context packets, amplifying purpose, or opening another
   nested expiry."
2. Tenant-scoped receipt sessions with purpose and budget
   fences, and a hard cap of one nominated packet and one
   attachment receipt per session.
3. Deterministic nomination of sealed packets by point
   lookup of `(account_id, packet_id)`.
4. Deterministic untrusted metadata bindings, record
   decisions, and attachment receipts that never invent a
   winner and never restore a fact.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the sealed receipt, audit replay,
   and bounded receipt budgets.

It integrates with, but does not replace:

- **Invalidated Working-Set Member Perception Context
  Packet Plane:** supplies the sealed context packet this
  plane may nominate by `(account_id, packet_id)`.
  Membership, citation, and catalog status on that packet
  are already `OMITTED`, `DROPPED`, and `INVALIDATED`.
  This plane never puts that packet back, never rewrites
  the packet body, and never promotes `ACKED` to
  `TRUSTED_ENROLLED`.
- **Invalidated Working-Set Member Perception Card
  Plane:** the cited perception card stays upstream of the
  packet. This plane never re-perceives that card and
  never scans cards.
- **Invalidated Context-Packet Working-Set Omission
  Plane:** the cited working-set member stays upstream of
  the card. This plane never re-omits that member and
  never scans working sets.
- **Tool-Read Receipt Attestation Plane:** `ACKED` stays
  the copied effect observation. This plane never re-binds
  a provider receipt and never treats that provider
  receipt as the attachment receipt.
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
- Discovering sealed packets by scanning a board, a
  context-packet table, a perception-card table, or a
  citation-drop ledger.
- Auto-amplifying a hop-narrowed purpose back to the donor
  purpose.
- Reconstructing authoritative receipts from columnar or
  vector projections.
- Cross-account receipt recording or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, or fact bodies
  on the attachment receipt.
- Claiming distributed atomicity with external notify
  providers. Provider silence remains `UNKNOWN_EFFECT`.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because a receipt repeated an attested provider receipt.
- Opening another nested expiry, containment, review, or
  resolution plane from this receipt.

## 3. Product contract

### 3.1 Receipt profile contract

A profile version is immutable after approval. It defines:

- allowed source kinds (`SEALED_INVALIDATED_WS_PACKET`,
  `SEALED_PERCEPTION_CARD`, `SEALED_ATTEST_CERT`,
  `SEALED_TOOL_READ_DECISION`, `SEALED_PROVIDER_RECEIPT`,
  `SEALED_EFFECT_INTENT`);
- compile threshold (distinct attachment-receipt stewards,
  minimum 2), max packets per session (exactly 1), and max
  nominated packets (exactly 1);
- compile policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `RECEIPT_NEVER_RESTORES_FACTS`,
  `RECEIPT_NEVER_INLINES_BODY`, `RECEIPT_NEVER_CONFIRMS`,
  `ONE_PACKET_PER_SESSION`, `OMITTED_ONLY`,
  `POINT_LOOKUP_ONLY`, `INVALIDATED_CATALOG_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `HALT_DENIES_BODY_READ`,
  `QUARANTINE_BODY_NEVER_VISIBLE`,
  `SOURCE_PACKET_STEWARDS_EXCLUDED`,
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
  `STOP_BEFORE_RECORD`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest source
kind is `SEALED_INVALIDATED_WS_PACKET` (28 bytes). The
longest compile kind is `RECORD_INVALIDATED_WS_PACKET`
(28 bytes).

Approval and revocation require the authority fence
`approve_agent_iwsmpcpar_profile` /
`revoke_agent_iwsmpcpar_profile`, owned by
`agent_iwsmpcpar_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, seal, vector, publish, and notify units, plus wall
time. `max_packets_per_session` and
`max_nominated_packets` are both exactly 1. A second
nomination in the same session is rejected before it can
fan out into a recursive retrieval.

### 3.3 Nomination and metadata contract

Nomination is `nominate_agent_iwsmpcpar_packet(account_id,
session_id, packet_id, nomination_id, nomination_hash)`.
A null `packet_id` is **FULL SCAN REJECTED**. The catalog
row must already be `SEALED_INVALIDATED_WS_PACKET`,
citation `DROPPED`, membership `OMITTED`, status
`DROPPED`, and catalog status `INVALIDATED`. `ACKED` is
accepted only with `receipt_disposition = ATTESTED` and
`silence_inferred = false`. `TRUSTED_ENROLLED` and
`inlines_fact_body` are rejected at nomination. Metadata
bindings are append-only and `UNTRUSTED_METADATA`.

### 3.4 Receipt decision and attachment-receipt contract

`RECORD_INVALIDATED_WS_PACKET` is the only compile kind
that writes an attachment receipt. It requires:

- `source_kind = SEALED_INVALIDATED_WS_PACKET`;
- `access_path = POINT_LOOKUP` (`PACKET_SCAN` and
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

The attachment receipt repeats those states in `receipt_body`
and rejects `factBody`, `fact_body`, and
`resolvedFactHash`. Attachment-receipt stewards on the
certificate must differ from `source_packet_steward_a/b`
and from every prior steward pair copied from the source
packet.

### 3.5 Notify and publication contract

`publish_agent_iwsmpcpar_receipt` point-looks up
`(account_id, packet_id)` and `(account_id, receipt_id)` and
appends one publication with reason
`INVALIDATED_WS_PACKET_RECORDED`. Effect intents start as
`PREPARED`. Provider silence stays `UNKNOWN_EFFECT`. An
acknowledgement does not enroll a key, restore a fact, or
put the packet back.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`. RLS policy
   `tenant_isolation` is forced on every table.
2. Nomination and publication use point lookup only. A
   missing `account_id` or `packet_id` is **FULL SCAN
   REJECTED**.
3. `ACKED` is an effect observation. It never writes
   `TRUSTED_ENROLLED` or `TRUSTED_WITHIN_SKEW`.
4. `RESTORED`, `INCLUDED`, `ATTACHED`, and `BODY_VISIBLE`
   are rejected on this plane.
5. `receipt_body` never contains a fact body.
6. Catalog status `INVALIDATED` is copied from the packet
   catalog. A `LIVE` catalog cannot be recorded here.
7. `opens_nested_expiry` is rejected. This plane does not
   start another expiry, containment, review, or resolution
   cycle.
8. `PACKET_SCAN` and `LEDGER_SCAN` are rejected. This plane
   does not scan context packets.
9. Purpose `AMPLIFIES` is rejected. After a hop, the
   requested purpose hash must differ from the donor
   purpose hash.
10. Attachment-receipt stewards are distinct from each
    other and from the source context-packet stewards, and
    from prior working-set omission, packet, card,
    omission, compiler, perception, receipt, gate, and
    extension stewards.
11. Profile approval and revocation go through the
    authority fence. Sealed profiles and sealed record
    rules are immutable.
12. Decision identity, certificate identity, catalog
    identity, and metadata bindings are append-only.
13. One session nominates one packet and writes one
    attachment receipt.
14. Silence is not `ACKED`. A receipt hash is not a fact
    hash.
15. The database engine stays deterministic. Agents above
    it may be probabilistic. Similarity never nominates.

## 5. Execution model

The row store is the authority. Columnar projections and
pgvector embeddings are derived. The record compile reads
one packet-catalog row by primary key and writes one
decision plus one attachment receipt in the same transaction.
Publication is a second point lookup that appends history
without rewriting the receipt. Notify dispatch is outside
the ACID boundary and starts at `PREPARED`.

An agent perceives the receipt, not the fact. The receipt
is procedural evidence that one sealed invalidated context
packet was recorded without restoring the citation.

## 6. Lifecycle

### 6.1 Draft and approve

A profile is inserted as `DRAFT` with at least one
dual-control record rule. `approve_agent_iwsmpcpar_profile`
checks the definition hash and sets
`app.iwsmpcpar_profile_approval` before the status becomes
`APPROVED`.

### 6.2 Open and nominate

A session opens under an approved profile.
`nominate_agent_iwsmpcpar_packet` point-looks up
`(account_id, packet_id)`. Included, attached, or
non-invalidated packets are rejected. A null key is
**FULL SCAN REJECTED**.

### 6.3 Bind and evaluate

Metadata binding copies the receipt hash, the disputed
fact hash, and `ACKED` as `UNTRUSTED_METADATA`. Evaluation
is a pure function of the sealed inputs. It cannot inline
a body or open a nested expiry.

### 6.4 Seal

Dual-control attachment-receipt stewards seal the
certificate. Source context-packet stewards are excluded.
The decision row
`RECORD_INVALIDATED_WS_PACKET` and the attachment receipt commit
together.

### 6.5 Publish and notify

`publish_agent_iwsmpcpar_receipt` appends
`INVALIDATED_WS_PACKET_RECORDED`. Notify may remain
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

The session closes. Audit events stay hash-chained.
Revocation with `STOP_BEFORE_RECORD` blocks new
nominations. In-flight sealed receipts remain replayable.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type PacketId = string & { readonly brand: "PacketId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type ReceiptId = string & { readonly brand: "ReceiptId" };
type MetadataBindingId = string & { readonly brand: "MetadataBindingId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };

type TrustedNextAction =
  | "NOMINATE_INVALIDATED_WS_PACKET"
  | "BIND_UNTRUSTED_METADATA"
  | "EVALUATE_ATTACHMENT_RECEIPT"
  | "SEAL_ATTACHMENT_RECEIPT"
  | "PUBLISH_ATTACHMENT_RECEIPT"
  | "PREPARE_RECEIPT_NOTIFY"
  | "RECEIPT_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type InvalidatedWsPacketAttachmentReceiptBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "PACKET_MISSING"
  | "METADATA_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "RECEIPT_AS_TRUST_DENIED"
  | "SILENCE_AS_ACK_DENIED"
  | "RECEIPT_AS_CONFIRMATION_DENIED"
  | "RECEIPT_AS_RESTORE_DENIED"
  | "BODY_INLINE_DENIED"
  | "HALT_READ_DENIED"
  | "TOOL_MUTATE_DENIED"
  | "TERMINAL_RESTORE_DENIED"
  | "QUARANTINE_LEAK_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PRIOR_STEWARD_EXCLUSION_DENIED"
  | "PACKET_SCAN_DENIED"
  | "PURPOSE_AMPLIFICATION_DENIED"
  | "RECEIPT_AS_FACT_DENIED"
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
  | "SEALED_INVALIDATED_WS_PACKET"
  | "SEALED_PERCEPTION_CARD"
  | "SEALED_ATTEST_CERT"
  | "SEALED_TOOL_READ_DECISION"
  | "SEALED_PROVIDER_RECEIPT"
  | "SEALED_EFFECT_INTENT";

type AccessPath = "POINT_LOOKUP" | "PACKET_SCAN" | "LEDGER_SCAN";

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
  | "DENY_PACKET_AS_RESTORE"
  | "DENY_ACK_AS_TRUST"
  | "SKIP"
  | "UNKNOWN_EFFECT";

type CompileKind =
  | "RECORD_INVALIDATED_WS_PACKET"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_PACKET_AS_TRUST"
  | "DENY_PACKET_AS_RESTORE"
  | "DENY_BODY_INLINE"
  | "DENY_ACK_AS_TRUST"
  | "DENY_PACKET_SCAN"
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

interface InvalidatedWsPacketAttachmentReceiptBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly sealUnits: number;
  readonly vectorUnits: number;
  readonly publishUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly compileThreshold: number;
  readonly maxPacketsPerSession: 1;
  readonly maxNominatedPackets: 1;
}

interface InvalidatedWsPacketAttachmentReceiptProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly compileThreshold: number;
  readonly maxPacketsPerSession: 1;
  readonly maxNominatedPackets: 1;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface InvalidatedWsPacketAttachmentReceiptSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: InvalidatedWsPacketAttachmentReceiptBudget;
  readonly consumed: Omit<
    InvalidatedWsPacketAttachmentReceiptBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxPacketsPerSession" | "maxNominatedPackets"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface InvalidatedWsPacketNomination {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly packetId: PacketId;
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
  readonly packetId: PacketId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly metadataTrust: MetadataTrust;
  readonly inlinesFactBody: false;
  readonly capturedAt: Timestamp;
}

interface InvalidatedWsPacketAttachmentReceiptCompileRecord {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly packetId: PacketId;
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

interface InvalidatedWsPacketAttachmentReceiptDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly packetId: PacketId;
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

interface InvalidatedWsPacketAttachmentReceiptCertificate {
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
  readonly attachmentReceiptStewardA: string;
  readonly attachmentReceiptStewardB: string;
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
  readonly sourcePacketStewardA: string;
  readonly sourcePacketStewardB: string;
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

interface AgentInvalidatedWsPacketAttachmentReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly receiptId: ReceiptId;
  readonly packetId: PacketId;
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
  readonly recordedPacketCount: number;
  readonly packetRecordRejectedCount: number;
  readonly unknownEffectCount: number;
  readonly silenceDeniedCount: number;
  readonly disputedHeldCount: number;
  readonly restoreDeniedCount: number;
  readonly trustDeniedCount: number;
  readonly bodyInlineDeniedCount: number;
  readonly packetScanDeniedCount: number;
  readonly uncertainNotifyIntents: readonly InvalidatedNotifyObservation[];
  readonly remainingBudget: Omit<
    InvalidatedWsPacketAttachmentReceiptBudget,
    "maxWallTimeMs" | "compileThreshold" | "maxPacketsPerSession" | "maxNominatedPackets"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly InvalidatedWsPacketAttachmentReceiptBlockedReason[];
  readonly receiptHash: Sha256;
}
```

```ts
interface CreateInvalidatedWsPacketAttachmentReceiptSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: InvalidatedWsPacketAttachmentReceiptBudget;
}

interface NominateInvalidatedWsPacketInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly packetId: PacketId;
  readonly expectedDisputedFactHash: Sha256;
  readonly expectedProviderReceiptHash: Sha256;
  readonly idempotencyKey: string;
}

interface BindInvalidatedWsPacketAttachmentReceiptMetadataInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly packetId: PacketId;
  readonly providerReceiptHash: Sha256;
  readonly effectObservation: EffectObservation;
  readonly silenceInferred: boolean;
  readonly idempotencyKey: string;
}

interface EvaluateInvalidatedWsPacketAttachmentReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly expectedProviderReceiptHash: Sha256;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealInvalidatedWsPacketAttachmentReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly attachmentReceiptStewardA: string;
  readonly attachmentReceiptStewardB: string;
  readonly expectedDisputedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface RecordInvalidatedWsPacketAttachmentReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly packetId: PacketId;
  readonly receiptId: ReceiptId;
  readonly reasonCode: "INVALIDATED_WS_PACKET_RECORDED" | "RETRACTED" | "QUARANTINED" | "KEY_REVOKED";
  readonly idempotencyKey: string;
}

interface PrepareInvalidatedWsPacketAttachmentReceiptNotifyInput {
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
  readonly promotion: "RETRY_SAME_RECEIPT" | "ACCEPT_OBSERVATION" | "REJECT_RECEIPT" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseInvalidatedWsPacketAttachmentReceiptSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface PublishInvalidatedWsPacketAttachmentReceiptInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type InvalidatedWsPacketAttachmentReceiptDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: InvalidatedWsPacketAttachmentReceiptSession;
      readonly certificate?: InvalidatedWsPacketAttachmentReceiptCertificate;
      readonly receiptDecision?: InvalidatedWsPacketAttachmentReceiptDecision;
      readonly nomination?: InvalidatedWsPacketNomination;
      readonly metadata?: UntrustedInvalidatedMetadataBinding;
      readonly compile?: InvalidatedWsPacketAttachmentReceiptCompileRecord;
      readonly attachmentReceipt: AgentInvalidatedWsPacketAttachmentReceipt;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: InvalidatedWsPacketAttachmentReceiptBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly attachmentReceipt?: AgentInvalidatedWsPacketAttachmentReceipt;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE iwsmpcpar_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE iwsmpcpar_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'COMPILING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'DISPATCHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_source_kind AS ENUM (
  'SEALED_INVALIDATED_WS_PACKET',
  'SEALED_PERCEPTION_CARD',
  'SEALED_ATTEST_CERT',
  'SEALED_TOOL_READ_DECISION',
  'SEALED_PROVIDER_RECEIPT',
  'SEALED_EFFECT_INTENT'
);
CREATE TYPE iwsmpcpar_access_path AS ENUM ('POINT_LOOKUP', 'PACKET_SCAN', 'LEDGER_SCAN');
CREATE TYPE iwsmpcpar_placement_kind AS ENUM (
  'HALTED', 'EXTENDED_HALT', 'RESTORED_WITHOUT_WINNER', 'OMITTED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_key_lifecycle AS ENUM (
  'FIRST_ENROLLMENT', 'CONFIRMED', 'MONOTONIC', 'REGRESSED',
  'INVENTED_HISTORY', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_clock_lifecycle AS ENUM (
  'ATTESTED', 'UNATTESTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'INVENTED_HISTORY', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'PERMANENT_QUARANTINE', 'HOLD_UNKNOWN',
  'REJECT_CYCLE_CONFIRM', 'REJECT_NESTED_EXPIRY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_gate_kind AS ENUM (
  'ALLOW_ENVELOPE_READ', 'ALLOW_TOOL_READ', 'DENY_HALT_READ',
  'DENY_CLOCK_AS_TRUST', 'DENY_PURPOSE_AMPLIFY', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_gate_action AS ENUM ('READ', 'TOOL_READ', 'TOOL_MUTATE');
CREATE TYPE iwsmpcpar_perceive_kind AS ENUM (
  'PERCEIVE_ATTESTED_RECEIPT', 'HOLD_UNKNOWN_EFFECT', 'DENY_SILENCE_AS_ACK',
  'DENY_PACKET_AS_RESTORE', 'DENY_ACK_AS_TRUST', 'SKIP',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_compile_kind AS ENUM (
  'RECORD_INVALIDATED_WS_PACKET', 'HOLD_UNKNOWN_EFFECT', 'DENY_PACKET_AS_TRUST',
  'DENY_PACKET_AS_RESTORE', 'DENY_BODY_INLINE', 'DENY_ACK_AS_TRUST',
  'DENY_PACKET_SCAN', 'DENY_NESTED_EXPIRY', 'SKIP', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_body_visibility AS ENUM (
  'ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED'
);
CREATE TYPE iwsmpcpar_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED',
  'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_clock_disposition AS ENUM (
  'REARMED', 'UNCHANGED', 'REGRESSED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_receipt_disposition AS ENUM (
  'UNBOUND', 'ATTESTED', 'SILENCE', 'REJECTED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_purpose_relation AS ENUM (
  'EQUAL', 'NARROWS', 'AMPLIFIES', 'UNRELATED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_citation_state AS ENUM (
  'DROPPED', 'ATTACHED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_membership_state AS ENUM (
  'OMITTED', 'INCLUDED', 'HELD', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE iwsmpcpar_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_catalog_status AS ENUM (
  'DROPPED', 'ATTACHED', 'HELD', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE iwsmpcpar_source_catalog_status AS ENUM (
  'INVALIDATED', 'ATTACHED', 'LIVE', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_iwsmpcpar_profile_authority NOLOGIN;

CREATE TABLE agent_iwsmpcpar_authorization_evidence (
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

CREATE TABLE agent_iwsmpcpar_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status iwsmpcpar_profile_status NOT NULL,
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
  max_nominated_packets SMALLINT NOT NULL
    CHECK (max_nominated_packets = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_RECORD', 'REQUIRE_REVIEW'
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
    REFERENCES agent_iwsmpcpar_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_iwsmpcpar_profile_record_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_source_kinds TEXT[] NOT NULL,
  compile_threshold SMALLINT NOT NULL CHECK (compile_threshold BETWEEN 2 AND 8),
  max_packets_per_session SMALLINT NOT NULL
    CHECK (max_packets_per_session = 1),
  max_nominated_packets SMALLINT NOT NULL
    CHECK (max_nominated_packets = 1),
  require_dual_control_compile BOOLEAN NOT NULL,
  compile_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_iwsmpcpar_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_iwsmpcpar_packet_catalog (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  source_session_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_decision_id UUID NOT NULL,
  packet_ref TEXT NOT NULL,
  source_kind iwsmpcpar_source_kind NOT NULL,
  perceive_kind iwsmpcpar_perceive_kind NOT NULL,
  gate_kind iwsmpcpar_gate_kind NOT NULL,
  gate_action iwsmpcpar_gate_action NOT NULL,
  terminal_kind iwsmpcpar_terminal_kind NOT NULL,
  placement_kind iwsmpcpar_placement_kind NOT NULL,
  key_lifecycle iwsmpcpar_key_lifecycle NOT NULL,
  clock_lifecycle iwsmpcpar_clock_lifecycle NOT NULL,
  attested_key_kind iwsmpcpar_attested_key_kind NOT NULL,
  status iwsmpcpar_catalog_status NOT NULL,
  citation_state iwsmpcpar_citation_state NOT NULL,
  membership_state iwsmpcpar_membership_state NOT NULL,
  catalog_status iwsmpcpar_source_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  prior_clock_hash CHAR(64) NOT NULL CHECK (length(prior_clock_hash) = 64),
  successor_clock_hash CHAR(64) NOT NULL CHECK (length(successor_clock_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  donor_purpose_hash CHAR(64) NOT NULL CHECK (length(donor_purpose_hash) = 64),
  hop_count SMALLINT NOT NULL CHECK (hop_count BETWEEN 0 AND 8),
  halt_scope_hash CHAR(64) NOT NULL CHECK (length(halt_scope_hash) = 64),
  receipt_disposition iwsmpcpar_receipt_disposition NOT NULL,
  effect_observation iwsmpcpar_effect_observation NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  fact_disposition iwsmpcpar_fact_disposition NOT NULL,
  body_visibility iwsmpcpar_body_visibility NOT NULL,
  clock_disposition iwsmpcpar_clock_disposition NOT NULL,
  metadata_trust iwsmpcpar_metadata_trust NOT NULL,
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
  source_packet_steward_a TEXT NOT NULL,
  source_packet_steward_b TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, packet_id),
  UNIQUE (account_id, packet_ref, source_kind),
  CHECK (prior_compiler_steward_a <> prior_compiler_steward_b),
  CHECK (perception_steward_a <> perception_steward_b),
  CHECK (receipt_steward_a <> receipt_steward_b),
  CHECK (prior_gate_steward_a <> prior_gate_steward_b),
  CHECK (prior_extension_steward_a <> prior_extension_steward_b),
  CHECK (prior_omission_steward_a <> prior_omission_steward_b),
  CHECK (prior_card_steward_a <> prior_card_steward_b),
  CHECK (prior_packet_steward_a <> prior_packet_steward_b),
  CHECK (ws_omission_steward_a <> ws_omission_steward_b),
  CHECK (source_packet_steward_a <> source_packet_steward_b),
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

CREATE TABLE agent_iwsmpcpar_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status iwsmpcpar_session_status NOT NULL,
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
  max_packets_per_session SMALLINT NOT NULL
    CHECK (max_packets_per_session = 1),
  max_nominated_packets SMALLINT NOT NULL
    CHECK (max_nominated_packets = 1),
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
    REFERENCES agent_iwsmpcpar_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_iwsmpcpar_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at)
);

CREATE TABLE agent_iwsmpcpar_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  access_path iwsmpcpar_access_path NOT NULL,
  source_kind iwsmpcpar_source_kind NOT NULL,
  gate_kind iwsmpcpar_gate_kind NOT NULL,
  gate_action iwsmpcpar_gate_action NOT NULL,
  effect_observation iwsmpcpar_effect_observation NOT NULL,
  receipt_disposition iwsmpcpar_receipt_disposition NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  citation_state iwsmpcpar_citation_state NOT NULL,
  catalog_status iwsmpcpar_source_catalog_status NOT NULL,
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcpar_packet_catalog (account_id, packet_id),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (citation_state = 'DROPPED'),
  CHECK (catalog_status = 'INVALIDATED'),
  CHECK (source_kind = 'SEALED_INVALIDATED_WS_PACKET'),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_iwsmpcpar_metadata_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  effect_observation iwsmpcpar_effect_observation NOT NULL,
  metadata_trust iwsmpcpar_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcpar_packet_catalog (account_id, packet_id),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false),
  CHECK (provider_receipt_hash <> disputed_fact_hash)
);

CREATE TABLE agent_iwsmpcpar_record_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  packet_id UUID NOT NULL,
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
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcpar_packet_catalog (account_id, packet_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_iwsmpcpar_receipt_certificate (
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
  attachment_receipt_steward_a TEXT NOT NULL,
  attachment_receipt_steward_b TEXT NOT NULL,
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
  source_packet_steward_a TEXT NOT NULL,
  source_packet_steward_b TEXT NOT NULL,
  decision_watermark SMALLINT NOT NULL CHECK (decision_watermark BETWEEN 0 AND 256),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, session_id, consumer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_iwsmpcpar_record_compile (account_id, compile_id),
  CHECK (attachment_receipt_steward_a <> attachment_receipt_steward_b),
  CHECK (prior_omission_steward_a <> prior_omission_steward_b),
  CHECK (prior_card_steward_a <> prior_card_steward_b),
  CHECK (prior_packet_steward_a <> prior_packet_steward_b),
  CHECK (prior_ws_omission_steward_a <> prior_ws_omission_steward_b),
  CHECK (source_packet_steward_a <> source_packet_steward_b),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (successor_clock_hash <> prior_clock_hash)
);

CREATE TABLE agent_iwsmpcpar_receipt_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  source_certificate_id UUID NOT NULL,
  source_kind iwsmpcpar_source_kind NOT NULL,
  decision_ordinal SMALLINT NOT NULL CHECK (decision_ordinal BETWEEN 0 AND 256),
  status iwsmpcpar_binding_status NOT NULL,
  placement_kind iwsmpcpar_placement_kind NOT NULL,
  key_lifecycle iwsmpcpar_key_lifecycle NOT NULL,
  clock_lifecycle iwsmpcpar_clock_lifecycle NOT NULL,
  attested_key_kind iwsmpcpar_attested_key_kind NOT NULL,
  terminal_kind iwsmpcpar_terminal_kind NOT NULL,
  gate_kind iwsmpcpar_gate_kind NOT NULL,
  gate_action iwsmpcpar_gate_action NOT NULL,
  perceive_kind iwsmpcpar_perceive_kind NOT NULL,
  compile_kind iwsmpcpar_compile_kind NOT NULL,
  body_visibility iwsmpcpar_body_visibility NOT NULL,
  fact_disposition iwsmpcpar_fact_disposition NOT NULL,
  clock_disposition iwsmpcpar_clock_disposition NOT NULL,
  receipt_disposition iwsmpcpar_receipt_disposition NOT NULL,
  effect_observation iwsmpcpar_effect_observation NOT NULL,
  purpose_relation iwsmpcpar_purpose_relation NOT NULL,
  access_path iwsmpcpar_access_path NOT NULL,
  citation_state iwsmpcpar_citation_state NOT NULL,
  membership_state iwsmpcpar_membership_state NOT NULL,
  catalog_status iwsmpcpar_source_catalog_status NOT NULL,
  metadata_trust iwsmpcpar_metadata_trust NOT NULL,
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
  UNIQUE (account_id, certificate_id, packet_id, decision_ordinal, sealed_revision),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_iwsmpcpar_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcpar_packet_catalog (account_id, packet_id)
);

CREATE TABLE agent_iwsmpcpar_attachment_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  membership_state iwsmpcpar_membership_state NOT NULL,
  citation_state iwsmpcpar_citation_state NOT NULL,
  catalog_status iwsmpcpar_source_catalog_status NOT NULL,
  metadata_trust iwsmpcpar_metadata_trust NOT NULL,
  effect_observation iwsmpcpar_effect_observation NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  disputed_fact_hash CHAR(64) NOT NULL CHECK (length(disputed_fact_hash) = 64),
  fact_disposition iwsmpcpar_fact_disposition NOT NULL,
  attested_key_kind iwsmpcpar_attested_key_kind NOT NULL,
  body_visibility iwsmpcpar_body_visibility NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  receipt_hash CHAR(64) NOT NULL CHECK (length(receipt_hash) = 64),
  receipt_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id),
  UNIQUE (account_id, packet_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_iwsmpcpar_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcpar_packet_catalog (account_id, packet_id),
  CHECK (provider_receipt_hash <> disputed_fact_hash),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (membership_state = 'OMITTED'),
  CHECK (citation_state = 'DROPPED'),
  CHECK (catalog_status = 'INVALIDATED'),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (inlines_fact_body = false),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (receipt_body ? 'factBody')),
  CHECK (NOT (receipt_body ? 'fact_body')),
  CHECK (NOT (receipt_body ? 'resolvedFactHash')),
  CHECK (receipt_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (receipt_body->>'factDisposition' IS DISTINCT FROM 'RESTORED'),
  CHECK (receipt_body->>'bodyVisibility' IS DISTINCT FROM 'BODY_VISIBLE'),
  CHECK (receipt_body->>'membershipState' = 'OMITTED'),
  CHECK (receipt_body->>'citationState' = 'DROPPED'),
  CHECK (receipt_body->>'catalogStatus' = 'INVALIDATED'),
  CHECK (receipt_body->>'metadataTrust' = 'UNTRUSTED_METADATA')
);

CREATE TABLE agent_iwsmpcpar_publication_record (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  packet_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  provider_receipt_hash CHAR(64) NOT NULL CHECK (length(provider_receipt_hash) = 64),
  effect_observation iwsmpcpar_effect_observation NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'INVALIDATED_WS_PACKET_RECORDED', 'RETRACTED', 'QUARANTINED', 'KEY_REVOKED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, packet_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_iwsmpcpar_packet_catalog (account_id, packet_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_iwsmpcpar_attachment_receipt (account_id, receipt_id)
);

CREATE TABLE agent_iwsmpcpar_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status iwsmpcpar_effect_status NOT NULL,
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
    REFERENCES agent_iwsmpcpar_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_iwsmpcpar_receipt_certificate (account_id, certificate_id)
);

CREATE TABLE agent_iwsmpcpar_budget_ledger (
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
    REFERENCES agent_iwsmpcpar_session (account_id, session_id)
);

CREATE TABLE agent_iwsmpcpar_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_iwsmpcpar_session (account_id, session_id)
);

CREATE TABLE agent_iwsmpcpar_command_result (
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

CREATE TABLE agent_iwsmpcpar_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_iwsmpcpar_audit_event (
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

CREATE TABLE agent_iwsmpcpar_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_iwsmpcpar_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_iwsmpcpar_profile()
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
       OR NEW.max_nominated_packets IS DISTINCT FROM OLD.max_nominated_packets
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
    IF current_setting('app.iwsmpcpar_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.iwsmpcpar_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_iwsmpcpar_profile_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_profile();

CREATE FUNCTION protect_agent_iwsmpcpar_profile_record_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status iwsmpcpar_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_iwsmpcpar_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile compile rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_iwsmpcpar_profile_record_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_iwsmpcpar_profile_record_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_profile_record_rule();

CREATE FUNCTION protect_agent_iwsmpcpar_packet_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_catalog$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'packet catalog identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_catalog$;

CREATE TRIGGER agent_iwsmpcpar_packet_catalog_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_packet_catalog
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_packet_catalog();

CREATE FUNCTION protect_agent_iwsmpcpar_metadata_binding()
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

CREATE TRIGGER agent_iwsmpcpar_metadata_binding_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_metadata_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_metadata_binding();

CREATE FUNCTION protect_agent_iwsmpcpar_receipt_certificate()
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
       OR NEW.attachment_receipt_steward_a IS DISTINCT FROM OLD.attachment_receipt_steward_a
       OR NEW.attachment_receipt_steward_b IS DISTINCT FROM OLD.attachment_receipt_steward_b
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
       OR NEW.source_packet_steward_a IS DISTINCT FROM OLD.source_packet_steward_a
       OR NEW.source_packet_steward_b IS DISTINCT FROM OLD.source_packet_steward_b THEN
      RAISE EXCEPTION 'receipt certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attachment_receipt_steward_a = NEW.attachment_receipt_steward_b THEN
    RAISE EXCEPTION 'dual-control fence requires distinct attachment-receipt stewards';
  END IF;
  IF NEW.attachment_receipt_steward_a = NEW.prior_compiler_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_compiler_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_compiler_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_compiler_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.perception_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.perception_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.perception_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.perception_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.receipt_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.receipt_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.receipt_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.receipt_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.prior_gate_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_gate_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_gate_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_gate_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.prior_extension_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_extension_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_extension_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_extension_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.prior_omission_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_omission_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_omission_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_omission_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.prior_card_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_card_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_card_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_card_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.prior_packet_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_packet_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_packet_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_packet_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.prior_ws_omission_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.prior_ws_omission_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.prior_ws_omission_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.prior_ws_omission_steward_b
     OR NEW.attachment_receipt_steward_a = NEW.source_packet_steward_a
     OR NEW.attachment_receipt_steward_a = NEW.source_packet_steward_b
     OR NEW.attachment_receipt_steward_b = NEW.source_packet_steward_a
     OR NEW.attachment_receipt_steward_b = NEW.source_packet_steward_b THEN
    RAISE EXCEPTION 'prior-steward exclusion fence';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_iwsmpcpar_receipt_certificate_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_receipt_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_receipt_certificate();

CREATE FUNCTION protect_agent_iwsmpcpar_receipt_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
DECLARE
  catalog_citation iwsmpcpar_citation_state;
  catalog_source_status iwsmpcpar_source_catalog_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.packet_id IS DISTINCT FROM OLD.packet_id
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
      RAISE EXCEPTION 'receipt decision identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'receipt-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED' OR NEW.membership_state = 'INCLUDED' THEN
    RAISE EXCEPTION 'receipt-as-restore fence blocks restoring disputed facts';
  END IF;

  IF NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'halt-read fence blocks exposing a disputed fact body';
  END IF;

  IF NEW.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.gate_action = 'TOOL_MUTATE' THEN
    RAISE EXCEPTION 'tool-mutate fence blocks mutation from an attachment receipt';
  END IF;

  IF NEW.effect_observation = 'ACKED'
     AND (
       NEW.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR NEW.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence blocks ACKED without an attested receipt';
  END IF;

  IF NEW.provider_receipt_hash IS NOT DISTINCT FROM NEW.disputed_fact_hash THEN
    RAISE EXCEPTION 'receipt-as-fact fence blocks using the disputed fact hash as a provider receipt';
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

  IF NEW.access_path IN ('PACKET_SCAN', 'LEDGER_SCAN') THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.clock_disposition = 'REGRESSED' THEN
    RAISE EXCEPTION 'clock-regression fence blocks rewinding a successor clock';
  END IF;

  SELECT citation_state, catalog_status
    INTO catalog_citation, catalog_source_status
  FROM agent_iwsmpcpar_packet_catalog
  WHERE account_id = NEW.account_id
    AND packet_id = NEW.packet_id;

  IF NEW.compile_kind = 'RECORD_INVALIDATED_WS_PACKET'
     AND (
       catalog_citation IS DISTINCT FROM 'DROPPED'
       OR catalog_source_status IS DISTINCT FROM 'INVALIDATED'
     ) THEN
    RAISE EXCEPTION 'live-packet fence blocks recording an attachment receipt that is not INVALIDATED';
  END IF;

  IF NEW.compile_kind = 'RECORD_INVALIDATED_WS_PACKET'
     AND (
       NEW.source_kind IS DISTINCT FROM 'SEALED_INVALIDATED_WS_PACKET'
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
    RAISE EXCEPTION 'record fence requires one invalidated attachment receipt by point lookup';
  END IF;

  IF NEW.compile_kind = 'RECORD_INVALIDATED_WS_PACKET'
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

CREATE TRIGGER agent_iwsmpcpar_receipt_decision_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_receipt_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_receipt_decision();

CREATE FUNCTION protect_agent_iwsmpcpar_attachment_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
DECLARE
  catalog_citation iwsmpcpar_citation_state;
  catalog_source_status iwsmpcpar_source_catalog_status;
  decision_found BOOLEAN;
BEGIN
  IF NEW.receipt_body ? 'factBody'
     OR NEW.receipt_body ? 'fact_body'
     OR NEW.receipt_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.inlines_fact_body THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  IF NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'receipt-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF NEW.fact_disposition = 'RESTORED'
     OR NEW.body_visibility = 'BODY_VISIBLE'
     OR NEW.membership_state = 'INCLUDED'
     OR NEW.citation_state = 'ATTACHED' THEN
    RAISE EXCEPTION 'receipt-as-restore fence blocks restoring disputed facts';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'attachment receipt metadata is immutable';
  END IF;

  IF NEW.catalog_status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'catalog-status fence blocks a receipt that does not repeat INVALIDATED';
  END IF;

  SELECT citation_state, catalog_status
    INTO catalog_citation, catalog_source_status
  FROM agent_iwsmpcpar_packet_catalog
  WHERE account_id = NEW.account_id
    AND packet_id = NEW.packet_id;

  IF catalog_citation IS DISTINCT FROM 'DROPPED'
     OR catalog_source_status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'live-packet fence blocks recording an attachment receipt that is not INVALIDATED';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM agent_iwsmpcpar_receipt_decision
    WHERE account_id = NEW.account_id
      AND certificate_id = NEW.certificate_id
      AND packet_id = NEW.packet_id
      AND compile_kind = 'RECORD_INVALIDATED_WS_PACKET'
      AND membership_state = 'OMITTED'
      AND citation_state = 'DROPPED'
      AND catalog_status = 'INVALIDATED'
  ) INTO decision_found;

  IF decision_found IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'attachment receipt requires a sealed record decision';
  END IF;

  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_iwsmpcpar_attachment_receipt_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_attachment_receipt
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_attachment_receipt();

CREATE FUNCTION protect_agent_iwsmpcpar_effect_intent()
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

CREATE TRIGGER agent_iwsmpcpar_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_iwsmpcpar_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_iwsmpcpar_effect_intent();

CREATE FUNCTION approve_agent_iwsmpcpar_profile(
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
  stored_status iwsmpcpar_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_iwsmpcpar_profile
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
  FROM agent_iwsmpcpar_profile_record_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_compile IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control compile rule';
  END IF;

  PERFORM set_config(
    'app.iwsmpcpar_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_iwsmpcpar_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_iwsmpcpar_profile(
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
  stored_status iwsmpcpar_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_iwsmpcpar_profile
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
    'app.iwsmpcpar_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_iwsmpcpar_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_iwsmpcpar_packet(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_packet_id UUID,
  recipient_nomination_id UUID,
  nomination_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  catalog agent_iwsmpcpar_packet_catalog%ROWTYPE;
BEGIN
  IF recipient_packet_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_iwsmpcpar_packet_catalog
  WHERE account_id = tenant_id
    AND packet_id = recipient_packet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'packet point lookup missed';
  END IF;

  IF catalog.citation_state IS DISTINCT FROM 'DROPPED'
     OR catalog.status IS DISTINCT FROM 'DROPPED'
     OR catalog.membership_state IS DISTINCT FROM 'OMITTED'
     OR catalog.catalog_status IS DISTINCT FROM 'INVALIDATED'
     OR catalog.source_kind IS DISTINCT FROM 'SEALED_INVALIDATED_WS_PACKET' THEN
    RAISE EXCEPTION 'live-packet fence blocks nominating an attachment receipt that is not INVALIDATED';
  END IF;

  IF catalog.effect_observation = 'ACKED'
     AND (
       catalog.receipt_disposition IS DISTINCT FROM 'ATTESTED'
       OR catalog.silence_inferred
     ) THEN
    RAISE EXCEPTION 'silence-as-ack fence';
  END IF;

  IF catalog.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'receipt-as-trust fence blocks treating ACKED as TRUSTED_ENROLLED';
  END IF;

  IF catalog.inlines_fact_body OR catalog.fact_disposition = 'RESTORED' THEN
    RAISE EXCEPTION 'body-inline fence blocks inlining a disputed fact';
  END IF;

  INSERT INTO agent_iwsmpcpar_nomination (
    account_id, nomination_id, session_id, packet_id,
    access_path, source_kind, gate_kind, gate_action,
    effect_observation, receipt_disposition, silence_inferred,
    citation_state, catalog_status, disputed_fact_hash, provider_receipt_hash,
    nomination_hash, nominated_at
  ) VALUES (
    tenant_id, recipient_nomination_id, recipient_session_id,
    recipient_packet_id, 'POINT_LOOKUP', catalog.source_kind,
    catalog.gate_kind, catalog.gate_action,
    catalog.effect_observation, catalog.receipt_disposition,
    catalog.silence_inferred, catalog.citation_state, catalog.catalog_status,
    catalog.disputed_fact_hash, catalog.provider_receipt_hash,
    nomination_digest, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION publish_agent_iwsmpcpar_receipt(
  tenant_id BIGINT,
  recipient_packet_id UUID,
  recipient_receipt_id UUID,
  recipient_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $record_omission$
DECLARE
  catalog agent_iwsmpcpar_packet_catalog%ROWTYPE;
  member agent_iwsmpcpar_attachment_receipt%ROWTYPE;
BEGIN
  IF recipient_packet_id IS NULL OR recipient_receipt_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO catalog
  FROM agent_iwsmpcpar_packet_catalog
  WHERE account_id = tenant_id
    AND packet_id = recipient_packet_id;

  IF NOT FOUND
     OR catalog.citation_state IS DISTINCT FROM 'DROPPED'
     OR catalog.catalog_status IS DISTINCT FROM 'INVALIDATED' THEN
    RAISE EXCEPTION 'receipt publication requires an invalidated attachment receipt point lookup';
  END IF;

  SELECT * INTO member
  FROM agent_iwsmpcpar_attachment_receipt
  WHERE account_id = tenant_id
    AND receipt_id = recipient_receipt_id;

  IF NOT FOUND
     OR member.packet_id IS DISTINCT FROM recipient_packet_id
     OR member.membership_state IS DISTINCT FROM 'OMITTED'
     OR member.citation_state IS DISTINCT FROM 'DROPPED'
     OR member.catalog_status IS DISTINCT FROM 'INVALIDATED'
     OR member.inlines_fact_body THEN
    RAISE EXCEPTION 'receipt publication requires a sealed invalidated attachment receipt';
  END IF;

  INSERT INTO agent_iwsmpcpar_publication_record (
    account_id, record_id, packet_id, receipt_id,
    provider_receipt_hash, effect_observation, reason_code, created_at
  ) VALUES (
    tenant_id, recipient_record_id, recipient_packet_id, recipient_receipt_id,
    member.provider_receipt_hash, member.effect_observation,
    'INVALIDATED_WS_PACKET_RECORDED', clock_timestamp()
  );
END
$record_omission$;

CREATE FUNCTION reject_agent_iwsmpcpar_unscoped_scan(
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

ALTER FUNCTION approve_agent_iwsmpcpar_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_iwsmpcpar_profile_authority;
ALTER FUNCTION revoke_agent_iwsmpcpar_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_iwsmpcpar_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_iwsmpcpar_profile_authority;
GRANT SELECT ON
  agent_iwsmpcpar_profile,
  agent_iwsmpcpar_profile_record_rule
TO agent_iwsmpcpar_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_iwsmpcpar_profile TO agent_iwsmpcpar_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_iwsmpcpar_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_iwsmpcpar_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_iwsmpcpar_profile FROM PUBLIC;

CREATE INDEX agent_iwsmpcpar_session_work_idx ON agent_iwsmpcpar_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_iwsmpcpar_session_profile_idx ON agent_iwsmpcpar_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_iwsmpcpar_decision_receipt_idx ON agent_iwsmpcpar_receipt_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_iwsmpcpar_decision_source_idx ON agent_iwsmpcpar_receipt_decision (
  account_id, packet_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_iwsmpcpar_catalog_ref_idx ON agent_iwsmpcpar_packet_catalog (
  account_id, packet_ref, sealed_at DESC, packet_id
);
CREATE INDEX agent_iwsmpcpar_catalog_kind_idx ON agent_iwsmpcpar_packet_catalog (
  account_id, source_kind, sealed_at DESC, packet_id
);
CREATE INDEX agent_iwsmpcpar_record_session_idx ON agent_iwsmpcpar_record_compile (
  account_id, session_id, compiled_at DESC, compile_id
);
CREATE INDEX agent_iwsmpcpar_certificate_session_idx ON agent_iwsmpcpar_receipt_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_iwsmpcpar_nomination_session_idx ON agent_iwsmpcpar_nomination (
  account_id, session_id, nominated_at DESC, nomination_id
);
CREATE INDEX agent_iwsmpcpar_effect_work_idx ON agent_iwsmpcpar_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_iwsmpcpar_audit_time_idx ON agent_iwsmpcpar_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_iwsmpcpar_receipt_status_idx ON agent_iwsmpcpar_attachment_receipt (
  account_id, membership_state, created_at DESC, receipt_id
);
CREATE INDEX agent_iwsmpcpar_command_expiry_idx ON agent_iwsmpcpar_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_iwsmpcpar_publication_receipt_idx ON agent_iwsmpcpar_publication_record (
  account_id, packet_id, created_at DESC, record_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_iwsmpcpar_authorization_evidence',
    'agent_iwsmpcpar_profile',
    'agent_iwsmpcpar_profile_record_rule',
    'agent_iwsmpcpar_packet_catalog',
    'agent_iwsmpcpar_session',
    'agent_iwsmpcpar_nomination',
    'agent_iwsmpcpar_metadata_binding',
    'agent_iwsmpcpar_record_compile',
    'agent_iwsmpcpar_receipt_certificate',
    'agent_iwsmpcpar_receipt_decision',
    'agent_iwsmpcpar_attachment_receipt',
    'agent_iwsmpcpar_publication_record',
    'agent_iwsmpcpar_effect_intent',
    'agent_iwsmpcpar_budget_ledger',
    'agent_iwsmpcpar_terminal_record',
    'agent_iwsmpcpar_command_result',
    'agent_iwsmpcpar_audit_head',
    'agent_iwsmpcpar_audit_event',
    'agent_iwsmpcpar_audit_anchor',
    'agent_iwsmpcpar_projection_checkpoint'
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
attachment receipt commit or roll back together. Publication
is its own append. Notify dispatch is not part of the
database transaction. `state_revision` is the
compare-and-swap token for session commands.

### 8.2 Tenant isolation

`account_id` is the first column of every table and every
index. `FORCE ROW LEVEL SECURITY` applies
`tenant_isolation` using `app.account_id`. Cross-tenant
reads and writes fail closed. There is no global packet
catalog.

## 9. Open API GraphQL contract

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentIwsmpcparSessionStatus {
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

enum AgentIwsmpcparCompileKind {
  RECORD_INVALIDATED_WS_PACKET
  HOLD_UNKNOWN_EFFECT
  DENY_PACKET_AS_TRUST
  DENY_PACKET_AS_RESTORE
  DENY_BODY_INLINE
  DENY_ACK_AS_TRUST
  DENY_PACKET_SCAN
  DENY_NESTED_EXPIRY
  SKIP
  UNKNOWN_EFFECT
}

enum AgentIwsmpcparCitationState {
  DROPPED
  ATTACHED
  HELD
  UNKNOWN_EFFECT
}

enum AgentIwsmpcparSourceCatalogStatus {
  INVALIDATED
  ATTACHED
  LIVE
  UNKNOWN_EFFECT
}

enum AgentIwsmpcparMembershipState {
  OMITTED
  INCLUDED
  HELD
  UNKNOWN_EFFECT
}

enum AgentIwsmpcparEffectObservation {
  ACKED
  FAILED
  DISPATCHED
  SILENCE
  UNKNOWN_EFFECT
}

enum AgentIwsmpcparEffectStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentIwsmpcparNextAction {
  NOMINATE_INVALIDATED_WS_PACKET
  BIND_UNTRUSTED_METADATA
  EVALUATE_ATTACHMENT_RECEIPT
  SEAL_ATTACHMENT_RECEIPT
  PUBLISH_ATTACHMENT_RECEIPT
  PREPARE_RECEIPT_NOTIFY
  RECEIPT_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentIwsmpcparBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  BUDGET_EXHAUSTED
  PACKET_MISSING
  RECEIPT_AS_TRUST_DENIED
  RECEIPT_AS_RESTORE_DENIED
  BODY_INLINE_DENIED
  CITATION_STILL_ATTACHED
  CATALOG_NOT_INVALIDATED
  NESTED_EXPIRY_DENIED
  PACKET_SCAN_DENIED
  UNKNOWN_EFFECT
}

type AgentIwsmpcparProfile {
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

type AgentIwsmpcparSession {
  accountId: Long!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentIwsmpcparSessionStatus!
  stateRevision: Long!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentIwsmpcparPacketCatalogEntry {
  accountId: Long!
  packetId: ID!
  sourceKind: String!
  citationState: AgentIwsmpcparCitationState!
  catalogStatus: AgentIwsmpcparSourceCatalogStatus!
  gateKind: String!
  gateAction: String!
  disputedFactHash: SHA256!
  providerReceiptHash: SHA256!
  effectObservation: AgentIwsmpcparEffectObservation!
  status: String!
}

type AgentIwsmpcparCertificate {
  accountId: Long!
  certificateId: ID!
  sessionId: ID!
  consumerRef: String!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  compileKind: AgentIwsmpcparCompileKind!
  effectObservation: AgentIwsmpcparEffectObservation!
  sealedAt: DateTime!
}

type AgentIwsmpcparAttachmentReceipt {
  accountId: Long!
  sessionId: ID!
  receiptId: ID!
  packetId: ID!
  status: AgentIwsmpcparSessionStatus!
  summary: String!
  membershipState: AgentIwsmpcparMembershipState!
  citationState: AgentIwsmpcparCitationState!
  catalogStatus: AgentIwsmpcparSourceCatalogStatus!
  metadataTrust: String!
  effectObservation: AgentIwsmpcparEffectObservation!
  providerReceiptHash: SHA256!
  disputedFactHash: SHA256!
  factDisposition: String!
  attestedKeyKind: String!
  bodyVisibility: String!
  inlinesFactBody: Boolean!
  unknownEffectCount: Int!
  allowedNextActions: [AgentIwsmpcparNextAction!]!
  blockedReasons: [AgentIwsmpcparBlockedReason!]!
  receiptHash: SHA256!
}

type AgentIwsmpcparAuditHead {
  accountId: Long!
  headSequence: Long!
  headHash: SHA256!
  updatedAt: DateTime!
}

type AgentIwsmpcparResult {
  decision: String!
  retryable: Boolean!
  reason: String!
  session: AgentIwsmpcparSession
  certificate: AgentIwsmpcparCertificate
  attachmentReceipt: AgentIwsmpcparAttachmentReceipt
  auditHash: SHA256!
}

input AgentIwsmpcparBudgetInput {
  nominateUnits: Int!
  bindUnits: Int!
  sealUnits: Int!
  vectorUnits: Int!
  publishUnits: Int!
  notifyUnits: Int!
  maxWallTimeMs: Int!
  compileThreshold: Int!
  maxPacketsPerSession: Int!
  maxNominatedPackets: Int!
}

input CreateInvalidatedWsPacketAttachmentReceiptSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentIwsmpcparBudgetInput!
}

input NominateInvalidatedWsPacketInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  packetId: ID!
  expectedDisputedFactHash: SHA256!
  expectedProviderReceiptHash: SHA256!
  idempotencyKey: String!
}

input BindInvalidatedWsPacketAttachmentReceiptMetadataInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  packetId: ID!
  providerReceiptHash: SHA256!
  effectObservation: AgentIwsmpcparEffectObservation!
  silenceInferred: Boolean!
  idempotencyKey: String!
}

input EvaluateInvalidatedWsPacketAttachmentReceiptInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  expectedProviderReceiptHash: SHA256!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input SealInvalidatedWsPacketAttachmentReceiptInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  compileId: ID!
  consumerRef: String!
  attachmentReceiptStewardA: String!
  attachmentReceiptStewardB: String!
  expectedDisputedFactHash: SHA256!
  idempotencyKey: String!
}

input RecordInvalidatedWsPacketAttachmentReceiptInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  packetId: ID!
  receiptId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input PrepareInvalidatedWsPacketAttachmentReceiptNotifyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  certificateId: ID!
  idempotencyKey: String!
}

input RecordInvalidatedWsPacketAttachmentReceiptNotifyUncertaintyInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  effectId: ID!
  promotion: String!
  idempotencyKey: String!
}

input CloseInvalidatedWsPacketAttachmentReceiptSessionInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input PublishInvalidatedWsPacketAttachmentReceiptInput {
  accountId: Long!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

type Query {
  invalidatedWsPacketAttachmentReceiptProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentIwsmpcparProfile
  invalidatedWsPacketAttachmentReceiptSession(accountId: Long!, sessionId: ID!): AgentIwsmpcparSession
  invalidatedWsPacketCatalogEntry(accountId: Long!, packetId: ID!): AgentIwsmpcparPacketCatalogEntry
  invalidatedWsPacketAttachmentReceiptCertificate(accountId: Long!, certificateId: ID!): AgentIwsmpcparCertificate
  invalidatedWsPacketAttachmentReceipt(accountId: Long!, receiptId: ID!): AgentIwsmpcparAttachmentReceipt
  invalidatedWsPacketAttachmentReceiptAuditReplay(accountId: Long!, sessionId: ID!): AgentIwsmpcparAuditHead
}

type Mutation {
  createInvalidatedWsPacketAttachmentReceiptSession(input: CreateInvalidatedWsPacketAttachmentReceiptSessionInput!): AgentIwsmpcparResult!
  nominateInvalidatedWsPacket(input: NominateInvalidatedWsPacketInput!): AgentIwsmpcparResult!
  bindInvalidatedWsPacketAttachmentReceiptMetadata(input: BindInvalidatedWsPacketAttachmentReceiptMetadataInput!): AgentIwsmpcparResult!
  evaluateInvalidatedWsPacketAttachmentReceipt(input: EvaluateInvalidatedWsPacketAttachmentReceiptInput!): AgentIwsmpcparResult!
  sealInvalidatedWsPacketAttachmentReceipt(input: SealInvalidatedWsPacketAttachmentReceiptInput!): AgentIwsmpcparResult!
  recordInvalidatedWsPacketAttachmentReceipt(input: RecordInvalidatedWsPacketAttachmentReceiptInput!): AgentIwsmpcparResult!
  prepareInvalidatedWsPacketAttachmentReceiptNotify(input: PrepareInvalidatedWsPacketAttachmentReceiptNotifyInput!): AgentIwsmpcparResult!
  recordInvalidatedWsPacketAttachmentReceiptNotifyUncertainty(input: RecordInvalidatedWsPacketAttachmentReceiptNotifyUncertaintyInput!): AgentIwsmpcparResult!
  closeInvalidatedWsPacketAttachmentReceiptSession(input: CloseInvalidatedWsPacketAttachmentReceiptSessionInput!): AgentIwsmpcparResult!
  publishInvalidatedWsPacketAttachmentReceipt(input: PublishInvalidatedWsPacketAttachmentReceiptInput!): AgentIwsmpcparResult!
}
```

### GraphQL limits

The schema exposes 6 point-lookup queries and 10 mutations.
Every operation takes `accountId`. There is no unbounded
list of context packets. Resolvers that would scan a
board with 1M+ rows are **FULL SCAN REJECTED** before
planning. `publishInvalidatedWsPacketAttachmentReceipt` repeats
one already sealed packet as an attachment receipt. It does
not search for the next packet to record.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `compile_instruction` records that one record
compile publishes one sealed invalidated context packet
as an attachment receipt, repeats membership `OMITTED`, citation
`DROPPED`, and catalog status `INVALIDATED` as untrusted
metadata, and never treats `ACKED` as trust.
`procedureRef` points at that profile version. Agents do
not store a second hidden policy. If the profile is
revoked with `STOP_BEFORE_RECORD`, new nominations stop.
In-flight packets remain replayable.

Semantic tags (`incident`, `invalidated-ws-packet`) are
for discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_iwsmpcpar_profile_embedding (
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
    REFERENCES agent_iwsmpcpar_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_iwsmpcpar_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_iwsmpcpar_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_iwsmpcpar_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped context-packet catalog or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one invalidated context packet by
primary key `(account_id, packet_id)`, and seals under
dual control. Similarity never publishes a receipt and never
puts an omitted packet back into the prompt.

## 12. Agent perception

Agents receive one attachment receipt per session. The
receipt exposes `membershipState`, `citationState`,
`catalogStatus`, `metadataTrust`, `effectObservation`,
`providerReceiptHash`, and `disputedFactHash` as separate
metadata, plus `factDisposition`, `attestedKeyKind`, and
`bodyVisibility`. Summary text is `UntrustedText`.
Receipts also expose unknown-effect counts, packet-scan
denials, remaining budgets, procedure tags, allowed next
actions, and blocked reasons. They never embed raw private
keys, tool payloads, fact bodies, or a winning fact hash.
`receiptHash` makes the receipt replayable.

An LLM should read the receipt as: "one sealed invalidated
context packet was recorded by point lookup of
`(account_id, packet_id)`. Membership is `OMITTED`, the
citation is `DROPPED`, and the catalog status is
`INVALIDATED`, all as `UNTRUSTED_METADATA`. The effect is
either `ACKED` with this untrusted provider-receipt hash
or still `UNKNOWN_EFFECT`." It should not read the receipt
as "the disputed fact is now false," "the fact body is
available," "the catalog status promotes the key," or
"the signing key is `TRUSTED_ENROLLED`." Metadata tags
that keep that reading stable are
`metadataTrust=UNTRUSTED_METADATA`,
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
attachment receipt is a projection of one omitted context
packet, not a second fact. The publication record is its
own transaction and appends history without rewriting the
receipt.

### Columnar store

Analytical counts of compile kinds, membership states, and
effect observations are derived from the row store by
`account_id`. They lag the seal watermark and cannot
authorize a new receipt or restore an omitted packet.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but discovery never nominates a packet.
Account predicates are applied before HNSW topK.

### External tools

Notify providers sit outside the ACID boundary. Silence and
ambiguous responses stay `UNKNOWN_EFFECT`. A notify
acknowledgement cannot put a packet back, inline a fact
body, or promote `ACKED` to `TRUSTED_ENROLLED`.

## 14. Guardrails and neighbor protection

Receipt budgets cap nominate, bind, seal, vector,
publish, and notify units per session. The one-packet cap
rejects a second nomination before it can fan out into
recursive retrieval. A receipt cannot schedule another
compile of itself and cannot open a nested expiry.
`PACKET_SCAN`, `LEDGER_SCAN`, missing `account_id`, and a
missing `packet_id` are **FULL SCAN REJECTED** by
`reject_agent_iwsmpcpar_unscoped_scan` before the planner
touches a board with 1M+ rows. Vector discovery is capped
by `budget_vector_units` and cannot authorize seal. Halted
and quarantined bodies stay `OMITTED`.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing every context packet for an account to "find
  the invalidated ones before recording them."
- Joining context packets to board items or citation
  ledgers to recover a fact body.
- Building one global HNSW index and authorizing from the
  nearest profile.
- Recording a packet by scanning every prior receipt.

Each of those plans is **FULL SCAN REJECTED**. The primary
path is one index lookup on `(account_id, packet_id)`,
which stays selective on boards with 1M+ rows.

### Required access paths

- Packet nomination: primary key `(account_id, packet_id)`.
- Receipt publication and receipt read: primary key
  `(account_id, receipt_id)`.
- Session and audit reads: `(account_id, session_id)` plus
  the session work index.
- Profile discovery: `account_id` equality, then HNSW topK
  inside that partition.

### Planner enforcement

`nominate_agent_iwsmpcpar_packet` and
`publish_agent_iwsmpcpar_receipt` refuse a null point key.
Resolvers do not expose an unbounded list field. The
reference schema creates no cross-tenant HNSW index.

## 16. Auditability and replay

`agent_iwsmpcpar_audit_event` is a hash chain per
`account_id`. Anchors store a Merkle root over a sequence
range. Replay recomputes the attachment decision from the
sealed packet hashes, the dual-control stewards, and the
membership, citation, and catalog status. It does not call
an LLM and does not reconstruct a fact body. A publication
record stores `INVALIDATED_WS_PACKET_RECORDED` without
erasing the historical receipt hash and without promoting
`ACKED`.

## 17. Threat and failure analysis

- **Receipt-as-trust:** a compiler writes `TRUSTED_ENROLLED`
  because the effect was `ACKED`. Rejected.
- **Receipt-as-restore:** a compiler writes `RESTORED`,
  `INCLUDED`, `ATTACHED`, or `BODY_VISIBLE`. Rejected.
- **Body inline:** `receipt_body` contains `factBody`.
  Rejected.
- **Silence-as-ack:** `ACKED` with `silence_inferred`.
  Rejected.
- **Live packet:** the catalog membership is `INCLUDED`,
  the citation is `ATTACHED`, or the catalog status is not
  `INVALIDATED`, and the compiler still tries to record
  it. Nomination and seal are rejected. This plane does
  not invent a receipt or an invalidation.
- **Nested expiry:** `opens_nested_expiry` is rejected.
  Recording does not start another review cycle.
- **Packet scan and hop leak:** `PACKET_SCAN`,
  `LEDGER_SCAN`, and purpose amplification are rejected.
- **Prior steward reuse:** source context-packet,
  working-set omission, packet, card, omission, compiler,
  perception, provider-receipt, gate, and extension
  stewards cannot seal this receipt.
- **Neighbor damage:** unscoped scans and a second packet
  in the same session are rejected before they touch a
  1M+ row board.

## 18. Observability and SLOs

Availability target remains 99.99% for neighbor board
traffic. This plane's SLOs are:

- point-lookup nomination p99 under 20 ms inside the
  tenant partition;
- seal transaction p99 under 50 ms with no board write;
- publication append p99 under 20 ms after the receipt is
  sealed;
- zero receipts sealed with `inlines_fact_body = true`;
- zero receipts whose catalog membership is not `OMITTED`,
  whose catalog citation is not `DROPPED`, or whose
  catalog status is not `INVALIDATED`;
- `UNKNOWN_EFFECT` notify age visible on the attachment
  receipt.

Columnar counts of recorded, held, and denied packets are
operational. They are not authorization.

## 19. Rollout

### Phase 1: shadow receipts

Compile receipts in shadow mode. Agents do not read them.
Compare receipt metadata with the source sealed context
packet.

### Phase 2: deny-only

Serve `DENY_PACKET_AS_TRUST`, `DENY_PACKET_AS_RESTORE`,
`DENY_BODY_INLINE`, and `DENY_PACKET_SCAN`. Do not publish.

### Phase 3: one recorded packet

Allow `RECORD_INVALIDATED_WS_PACKET` for approved
profiles. Facts stay `DISPUTED_HELD`. Metadata stays
untrusted. Membership is `OMITTED`. Citation is `DROPPED`.
Catalog status is `INVALIDATED`.

### Phase 4: publish and notify uncertainty

Enable publication records and surface `UNKNOWN_EFFECT`
notify. A publication does not restore a fact and does not
promote `ACKED`.

### Phase 5: broad availability

Default-on for tenants that already attach omitted
invalidated perception cards into context packets.
Profiles still require dual control. Similarity still
cannot seal.

## 20. Ship criteria

### Contract validation

TypeScript contracts compile under strict mode. The GraphQL
schema builds with 6 queries and 10 mutations. SQL enums
stay within 63-byte labels. Every table and index leads
with `account_id`.

### Behavioral validation

- An omitted invalidated context packet can be nominated
  by `(account_id, packet_id)` and recorded once.
- The attachment receipt repeats `OMITTED`, `DROPPED`,
  `INVALIDATED`, `ACKED`, and the provider receipt hash as
  `UNTRUSTED_METADATA` while the key stays
  `AWAITING_CONFIRMATION` and the fact stays
  `DISPUTED_HELD`.
- `TRUSTED_ENROLLED`, `RESTORED`, `BODY_VISIBLE`,
  `INCLUDED`, and `factBody` are rejected.
- `PACKET_SCAN`, `opens_nested_expiry`, and nomination of
  an `INCLUDED` packet are rejected.
- `publish_agent_iwsmpcpar_receipt` appends
  `INVALIDATED_WS_PACKET_RECORDED` without rewriting the
  receipt body.
- Direct profile approval, sealed-rule edits, and unscoped
  scans are rejected.
- An attachment-receipt steward who sealed the source
  context packet is rejected.

### Scale and failure validation

Explain plans for nomination and publication use the
primary key. A missing point key is **FULL SCAN
REJECTED**. A 1M+ row board is not read. Notify silence
remains `UNKNOWN_EFFECT`.

## 21. Product decision

Ship the Invalidated Context-Packet Attachment Receipt
Plane as the deterministic bridge from one sealed
invalidated context packet to one agent-visible attachment
receipt. The latency cost is one primary-key compile on
`(account_id, packet_id)`. The consistency win is that
membership `OMITTED`, citation `DROPPED`, and catalog
status `INVALIDATED` stay untrusted metadata, `ACKED`
stays an effect observation, the disputed fact stays held,
and the body stays omitted. Catalog status `INVALIDATED`
is copied from the packet catalog. It is not invented by
the receipt, and it is not `TRUSTED_ENROLLED`.

The next increment should publish one account-scoped
columnar synopsis of attachment-receipt outcomes (sealed,
denied, and `UNKNOWN_EFFECT`) keyed by `(account_id,
utc_day)` from the receipt publication watermark. The
synopsis must not scan context packets, must not inline a
fact body, must not promote `ACKED` to `TRUSTED_ENROLLED`,
and must not open another nested expiry plane.
