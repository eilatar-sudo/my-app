# mondayDB Agentic Admitted Count Perception Binding Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-21.v1`

## 1. Why this plane, before how

The 2026-10-20 Admitted Count Hold Perception Card Plane publishes one
consumer perception card for one already sealed hold. The grain is
`(account_id, utc_day, consumer_principal_id)`. A `PERCEIVED` card
copies the three counts, names exactly the card reader, and seals
`HELD_OBSERVATION_PERCEIVED` with next action
`PERCEIVE_HELD_OBSERVATION`. A `NOT_PERCEIVED` card seals
`NOT_HELD_OBSERVATION_CANNOT_PERCEIVE` with null counts. That plane
does not record an agent perception binding.

Without this plane an agent either:

- treats `PERCEIVE_HELD_OBSERVATION` itself as proof the runtime bound
  the three counts, or
- walks context packets, tool logs, or a board with 1M+ rows to invent
  a binding (neighbor-harmful, and a miss against the 99.99%
  availability target).

The product trade-off is **binding honesty versus card isolation**,
and **binding latency versus a second reader**:

- Honesty: the consumer named on a `PERCEIVED` card should have one
  perception binding that copies the three counts already on that
  card, without opening the card again.
- Isolation: the database does not call the provider and does not
  execute the tool. Recording the binding is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or recursive
  tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_PERCEIVED` card cannot be bound as received.
  The binding names the card reader and no one else. A second reader
  is a new request, and this plane rejects it.
- The card head is not rewritten. Replay of the card stays stable. The
  binding is a new row that cites the card by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does not
  promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the binding is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed binding plus the
card id it cites. Neighbor availability stays at the 99.99% target
because an unscoped day walk, a reader list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved binding profile is procedural memory for "how one
   already sealed card becomes a single agent perception binding." The
   profile names exactly one binding code and the one perception code
   that binding may cite. A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens another
   nested expiry plane.
2. A session nominates exactly one observation key. The binding then
   reads `agent_acpb_card_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB records a binding only when the head is `PERCEIVED`,
   `card_recorded` is true, the card reason is
   `HELD_OBSERVATION_PERCEIVED`, the next action is
   `PERCEIVE_HELD_OBSERVATION`, and the requested reader equals the
   card reader. The copy of the three counts is equality with the
   card. It does not call a model and it does not execute the tool.
4. `NOT_PERCEIVED` seals `NOT_PERCEIVED_CARD_CANNOT_BIND` with
   `binding_recorded = false` and null counts. Silence keeps a null
   lag. There is no binding that shows the card as received.
5. The reader equals the card reader and is distinct from the consumer
   and from every steward, including the two binding stewards and the
   two perception stewards. Two binding stewards witness the binding.
   They are distinct from the consumer, from the reader, from the
   perception stewards, and from the hold, acknowledgement,
   reader-receipt, grant, citation, provider, effect, bind,
   provider-receipt, card, admission, attestation, synopsis, and
   publication stewards.
6. Unscoped observation or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the nomination and
  the agent perception binding?
- Was the binding a point lookup of an already sealed card, and what
  class did that card have?
- Did a `PERCEIVED` card bind exactly its one reader and seal
  `PERCEIVED_OBSERVATION_BOUND` with the three card counts?
- Did a `NOT_PERCEIVED` card stay unbound, with null counts and
  `NOT_PERCEIVED_CARD_CANNOT_BIND`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the card head keep the class, the reader, and the counts it was
  exported with?
- Can the binding be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never records this
binding.

## 2. Scope and ownership

The Admitted Count Perception Binding Plane owns:

1. Immutable approved binding profiles as procedural memory, each
   naming one binding code for one perception code.
2. Tenant-scoped binding sessions with a hard cap of one nominated
   observation and the one reader already on that card.
3. Deterministic nomination of that observation, then one point lookup
   of the card head.
4. An agent perception binding keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the card
   `reader_principal_id`.
5. An agent perception row that carries counts only when
   `binding_recorded` is true, which is only when `card_recorded` is
   true.
6. Audit events that cite the binding hash.

It integrates with, but does not replace:

- **Admitted Count Hold Perception Card Plane:** supplies the sealed
  card this plane reads. Exporters copy the card class, the card
  reason, `card_recorded`, the one reader, the counts the card actually
  copied, the next action, and the stewards onto
  `agent_acpb_card_head`. This plane does not re-perceive the hold,
  does not recover withheld counts, and does not promote `ACKED` to
  `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind, vector, and
  notify units. A refused observation is a sealed non-binding, not a
  scan of the packet log. The binding does not run the tool and does
  not call the provider.

### Non-goals

- Letting an LLM choose which reader a card may bind.
- Executing the tool, calling the provider, or compiling a board query
  inside `record_agent_acpb_perception_binding`.
- Recording any binding code other than the single code on the
  approved profile.
- Copying counts onto a binding whose card is `NOT_PERCEIVED`.
- Rewriting the card head so a refused card becomes a bound observation.
- Naming a reader other than the card reader. That would grant a
  second reader, and this plane rejects it.
- Recomputing bindings by scanning a board, a packet log, or a reader
  ledger.
- Cross-account bindings or global nearest-neighbor retrieval.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the binding.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because the
  effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this binding.
- Recording a separate receipt of the binding. That is the next plane,
  and only for an already `BOUND` binding.

## 3. Product contract

### 3.1 Binding profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the card must already carry (one
  token, no list);
- the single `allowed_effect_code` the head must already carry (one
  token, no list);
- the single `allowed_provider_code` the head must already carry (one
  token, no list);
- the single `allowed_citation_code` the head must already carry (one
  token, no list);
- the single `allowed_grant_code` the head must already carry (one
  token, no list);
- the single `allowed_receipt_code` the head must already carry (one
  token, no list);
- the single `allowed_hold_code` the head must already carry (one
  token, no list);
- the single `allowed_perception_code` the head must already carry
  (one token, no list);
- the single `allowed_binding_code` this plane may seal (one token,
  no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- binding threshold (distinct binding stewards, minimum 2), max
  observations per session (exactly 1), max nominated observations
  (exactly 1), and max readers per observation (exactly 1);
- binding policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `BINDING_NEVER_EXECUTES_TOOL`, `BINDING_NEVER_INLINES_BODY`,
  `BINDING_NEVER_CONFIRMS`, `ONE_OBSERVATION_PER_SESSION`,
  `ONE_BINDING_PER_OBSERVATION`, `CARD_READER_ONLY`, `POINT_LOOKUP_ONLY`,
  `PERCEIVED_CARD_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `COUNTS_ONLY_WHEN_CARD_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_BINDING`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so PostgreSQL
`CREATE TYPE` accepts it. The longest binding reason is
`NOT_PERCEIVED_CARD_CANNOT_BIND` (30 bytes). The success reason is
`PERCEIVED_OBSERVATION_BOUND` (26 bytes).

Approval and revocation require the authority fence
`approve_agent_acpb_profile` / `revoke_agent_acpb_profile`, owned by
`agent_acpb_profile_authority`. A profile cannot be inserted as
`APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, bind, vector,
and notify units, plus wall time. `max_observations_per_session`,
`max_nominated_observations`, and `max_readers_per_observation` are all
exactly 1. A second observation nomination in the same session is
rejected before it can fan out into a recursive reader walk.

The session principal is the only consumer that session may bind. A
binding for a different consumer is rejected. The reader on the
binding is the reader already stored on the card. It cannot be the
consumer, and it cannot be replaced.

### 3.3 Card head and nomination contract

Upstream card export writes one card head per
`(account_id, utc_day, consumer_principal_id)`. The head copy includes
`card_class`, `card_reason`, `card_recorded`, `reader_principal_id`,
`trusted_next_action`, the three counts when they were recorded, and
the stewards. It does not include a fact body and it does not include
withheld counts. The head is immutable. This plane does not advance it
and does not reclassify it.

`nominate_agent_acpb_observation(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates that
observation. A null `utc_day`, a null `account_id`, a null consumer, or
a null binding code is **FULL SCAN REJECTED**. The access path is
`POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN` are
rejected.

### 3.4 Agent perception binding contract

`record_agent_acpb_perception_binding` is the only compile that writes
an agent perception binding. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one card head for that key, with `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`, `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, `packet_scan_used = false`, and
  `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` (`TRUSTED_ENROLLED` is
  rejected);
- `binding_code` equal to the profile's `allowed_binding_code`, and
  `perception_code` equal to the head perception code and the profile
  perception code, each matching `^[a-z0-9:_-]{1,64}$` (one token, not
  a list and not a query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the card head,
  and distinct from the consumer, from both binding stewards, from
  both perception stewards, and from every hold, acknowledgement,
  reader-receipt, grant, citation, provider, effect, bind,
  provider-receipt, card, admission, attestation, synopsis, and
  publication steward;
- binding stewards distinct from each other and from those same
  principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That grain
holds one agent perception binding and therefore the one card reader.
Projection is:

- `BOUND` when the head card class is `PERCEIVED`, `card_recorded` is
  true, the card reason is `HELD_OBSERVATION_PERCEIVED`, and the next
  action is `PERCEIVE_HELD_OBSERVATION`. The binding copies
  `sealed_count`, `denied_count`, and `unknown_effect_count`.
  `binding_recorded` is true. `binding_reason` is
  `PERCEIVED_OBSERVATION_BOUND`. `trusted_next_action` is
  `BIND_PERCEIVED_OBSERVATION`. The action binds the three counts for
  that consumer and that one reader. It does not run the tool, it does
  not inline a fact body, and it does not open another nested expiry.
- `NOT_BOUND` when the head next action is `STOP_HOLD_PERCEPTION`.
  Counts stay null. `binding_reason` is
  `NOT_PERCEIVED_CARD_CANNOT_BIND`. `binding_recorded` is false.
  `trusted_next_action` is `STOP_CARD_BINDING`. The denied lag is
  copied and is not cleared.
- `NOT_BOUND` when the head admission class is `UNKNOWN_EFFECT` or the
  next action is `OMIT_HOLD_PERCEPTION`. Counts stay null. The binding
  lag stays null. `binding_reason` is
  `NOT_PERCEIVED_CARD_CANNOT_BIND`. `binding_recorded` is false.
  `trusted_next_action` is `OMIT_CARD_BINDING`.

A `NOT_PERCEIVED` card cannot be bound as received. The three counts
are copied only when `card_recorded` is true. `binding_body` rejects
`factBody`, `fact_body`, and `resolvedFactHash`. `ACKED` is copied as
`effect_observation` when the head observed it. It does not write
`TRUSTED_ENROLLED`. The card head is not updated. A second binding for
the same consumer and day is rejected. A reader other than the card
reader is rejected, so this plane does not grant a second reader. A
forged bound row whose counts differ from the head is rejected. A
forged bound row on a `NOT_PERCEIVED` head is rejected. A forged
non-binding that carries any count, or that sets `binding_recorded`,
is rejected. A binding code other than the profile code is rejected
before a row is sealed, so the caller can retry the one allowed code.
A null binding code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acpb_binding_perception` for the
agent. Counts appear there only when `binding_recorded` is true. The
perception names `binding_code`, the card reader, and whether the
binding was recorded. Binding intents start as `PREPARED`. Provider
silence stays `UNKNOWN_EFFECT`. A binding of the notify is not
enrollment, not a fact restore, not a tool execution, and not a second
reader. This plane does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads with
   `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null binding code, or a null
   `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one observation. The access path is
   `POINT_LOOKUP`. One observation binds its one reader.
4. The card head is immutable. The binding does not rewrite it and
   does not change its reader.
5. A successful binding is recorded only from a `PERCEIVED` head whose
   card reason is `HELD_OBSERVATION_PERCEIVED`, whose `card_recorded`
   is true, and whose next action is `PERCEIVE_HELD_OBSERVATION`, and
   only for the profile's single binding code and the card reader.
6. `NOT_PERCEIVED` bindings store null counts and
   `binding_recorded = false`. Silence stores a null lag. A
   `NOT_PERCEIVED` card cannot be bound as received. Counts are copied
   only when `card_recorded` is true.
7. `ACKED` stays an effect observation. `AWAITING_CONFIRMATION` stays
   the key kind. `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`, and
   `executes_tool` stay false. The binding does not execute the tool.
9. The reader equals the card reader. The reader, the consumer, the
   binding stewards, the perception stewards, and the upstream
   stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never records a binding.
11. The engine does not call a model. Replay is a pure function of the
    card head, the consumer id, the card reader, and the profile
    binding code.

## 5. Execution model

```text
approved profile (one allowed_binding_code)
  -> open session (one observation budget, the card reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read card head by primary key
  -> require reader = card reader
  -> project BOUND or NOT_BOUND
  -> append binding + perception + audit
  -> leave the card head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `BIND_PERCEIVED_OBSERVATION` for both bindings. The
class on the binding, not a second plane, distinguishes a recorded
binding from a refusal. Notify dispatch is a later binding intent and
may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one provider
   code, one citation code, one grant code, one receipt code, one hold
   code, one perception code, and one binding code, and add one
   dual-control binding rule.
2. Approve it through `agent_acpb_profile_authority`.
3. Export one card head per consumer and day. The export is a point
   copy of the consumer perception card, not a packet walk.
4. Open a session and nominate one observation key.
5. Record the profile binding code for the card reader. Perceived
   cards copy the counts and seal `PERCEIVED_OBSERVATION_BOUND`. Other
   cards seal a non-binding with null counts.
6. The agent reads the perception row. A withheld perception has no
   count fields and `bindingRecorded: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite bindings already sealed.
8. This plane does not open another nested expiry. It does not run the
   tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type PerceptionBindingId = string;
export type UtcDay = string;
export type BindingCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type CardClass = "PERCEIVED" | "NOT_PERCEIVED";
export type CardReason =
  | "HELD_OBSERVATION_PERCEIVED"
  | "NOT_HELD_OBSERVATION_CANNOT_PERCEIVE";
export type CardNextAction =
  | "PERCEIVE_HELD_OBSERVATION"
  | "STOP_HOLD_PERCEPTION"
  | "OMIT_HOLD_PERCEPTION";
export type BindingClass = "BOUND" | "NOT_BOUND";
export type BindingReason =
  | "PERCEIVED_OBSERVATION_BOUND"
  | "NOT_PERCEIVED_CARD_CANNOT_BIND";
export type BindingNextAction =
  | "BIND_PERCEIVED_OBSERVATION"
  | "STOP_CARD_BINDING"
  | "OMIT_CARD_BINDING";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const PERCEPTION_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface CardHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly receiptCode: string;
  readonly holdCode: string;
  readonly perceptionCode: string;
  readonly admissionClass: AdmissionClass;
  readonly cardClass: CardClass;
  readonly cardReason: CardReason;
  readonly cardRecorded: boolean;
  readonly holdRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: CardNextAction;
}

export interface AgentPerceptionBinding {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly perceptionBindingId: PerceptionBindingId;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly receiptCode: string;
  readonly holdCode: string;
  readonly perceptionCode: string;
  readonly bindingCode: BindingCode;
  readonly admissionClass: AdmissionClass;
  readonly cardClass: CardClass;
  readonly bindingClass: BindingClass;
  readonly bindingReason: BindingReason;
  readonly cardRecorded: boolean;
  readonly bindingRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: "AWAITING_CONFIRMATION";
  readonly ackPromotedToTrust: false;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly packetScanUsed: false;
  readonly executesTool: false;
  readonly trustedNextAction: BindingNextAction;
}

export function projectAgentPerceptionBinding(
  head: CardHead,
  perceptionBindingId: PerceptionBindingId,
  readerPrincipalId: PrincipalId,
  bindingCode: BindingCode,
): AgentPerceptionBinding {
  const readerIsCardReader = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    perceptionBindingId,
    consumerPrincipalId: head.consumerPrincipalId,
    readerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode: head.citationCode,
    grantCode: head.grantCode,
    receiptCode: head.receiptCode,
    holdCode: head.holdCode,
    perceptionCode: head.perceptionCode,
    bindingCode,
    admissionClass: head.admissionClass,
    cardClass: head.cardClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = PERCEPTION_TOKEN.test(bindingCode);

  if (
    readerIsCardReader &&
    readerIsDistinct &&
    singleCode &&
    head.cardClass === "PERCEIVED" &&
    head.cardReason === "HELD_OBSERVATION_PERCEIVED" &&
    head.cardRecorded &&
    head.holdRecorded &&
    head.trustedNextAction === "PERCEIVE_HELD_OBSERVATION" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      bindingClass: "BOUND",
      bindingReason: "PERCEIVED_OBSERVATION_BOUND",
      cardRecorded: true,
      bindingRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "BIND_PERCEIVED_OBSERVATION",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_HOLD_PERCEPTION";

  return {
    ...shared,
    cardClass: "NOT_PERCEIVED",
    cardRecorded: false,
    bindingClass: "NOT_BOUND",
    bindingReason: "NOT_PERCEIVED_CARD_CANNOT_BIND",
    bindingRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_CARD_BINDING" : "STOP_CARD_BINDING",
  };
}
```

```ts
export function bindingOmitsUnboundCard(
  card: AgentPerceptionBinding,
): boolean {
  return (
    card.bindingRecorded === false &&
    card.bindingClass === "NOT_BOUND" &&
    card.cardRecorded === false &&
    card.sealedCount === null &&
    card.deniedCount === null &&
    card.unknownEffectCount === null &&
    card.ackPromotedToTrust === false &&
    card.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    card.executesTool === false
  );
}
```

`projectAgentPerceptionBinding` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`. It never
copies counts off a card whose `card_recorded` is false. It never
executes the tool. A binding token that is not a single code, or a
reader other than the card reader, projects to `NOT_BOUND`. The
database additionally requires the token to equal the approved profile
binding code, requires the reader to equal the card reader, and
rejects a reader who collides with the consumer or any steward, before
it seals `BOUND`. A mismatched reader is rejected rather than
sealed, so the plane does not grant a second reader.

## 8. SQL row-store schema

```sql
CREATE TYPE acpb_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acpb_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acpb_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acpb_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acpb_hold_class AS ENUM ('HELD', 'NOT_HELD');
CREATE TYPE acpb_hold_reason AS ENUM (
  'ACKNOWLEDGED_OBSERVATION_HELD',
  'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
);
CREATE TYPE acpb_card_class AS ENUM ('PERCEIVED', 'NOT_PERCEIVED');
CREATE TYPE acpb_card_reason AS ENUM (
  'HELD_OBSERVATION_PERCEIVED',
  'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
);
CREATE TYPE acpb_card_next AS ENUM (
  'PERCEIVE_HELD_OBSERVATION',
  'STOP_HOLD_PERCEPTION',
  'OMIT_HOLD_PERCEPTION'
);
CREATE TYPE acpb_binding_class AS ENUM ('BOUND', 'NOT_BOUND');
CREATE TYPE acpb_binding_reason AS ENUM (
  'PERCEIVED_OBSERVATION_BOUND',
  'NOT_PERCEIVED_CARD_CANNOT_BIND'
);
CREATE TYPE acpb_binding_next AS ENUM (
  'BIND_PERCEIVED_OBSERVATION',
  'STOP_CARD_BINDING',
  'OMIT_CARD_BINDING'
);
CREATE TYPE acpb_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acpb_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acpb_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acpb_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acpb_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acpb_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acpb_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acpb_compile_kind AS ENUM ('BIND_PERCEIVED_OBSERVATION');
CREATE TYPE acpb_terminal_kind AS ENUM (
  'BINDING_RECORDED',
  'BINDING_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acpb_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_BINDING',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acpb_profile_authority NOLOGIN;

CREATE FUNCTION acpb_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acpb_authorization_evidence (
  account_id BIGINT NOT NULL,
  evidence_id UUID NOT NULL,
  principal_id TEXT NOT NULL,
  policy_revision INTEGER NOT NULL,
  resource_acl_revision INTEGER NOT NULL,
  redacted_scope_summary JSONB NOT NULL,
  encrypted_evidence_ref TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (char_length(evidence_hash) = 64),
  immutable_archive_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evidence_id)
);

CREATE TABLE agent_acpb_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acpb_profile_status NOT NULL,
  definition_hash TEXT NOT NULL CHECK (char_length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash TEXT,
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash TEXT NOT NULL CHECK (char_length(authorization_snapshot_hash) = 64),
  allowed_purpose TEXT NOT NULL CHECK (allowed_purpose ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_effect_code TEXT NOT NULL CHECK (allowed_effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_provider_code TEXT NOT NULL CHECK (allowed_provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_citation_code TEXT NOT NULL CHECK (allowed_citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_grant_code TEXT NOT NULL CHECK (allowed_grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_receipt_code TEXT NOT NULL CHECK (allowed_receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_hold_code TEXT NOT NULL CHECK (allowed_hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_perception_code TEXT NOT NULL CHECK (allowed_perception_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_binding_code TEXT NOT NULL CHECK (allowed_binding_code ~ '^[a-z0-9:_-]{1,64}$'),
  binding_threshold INTEGER NOT NULL CHECK (binding_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acpb_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acpb_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acpb_profile_binding_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acpb_admission_class[] NOT NULL,
  binding_threshold INTEGER NOT NULL CHECK (binding_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  require_dual_control_binding BOOLEAN NOT NULL,
  binding_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acpb_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acpb_card_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  perception_card_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  hold_code TEXT NOT NULL CHECK (hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  perception_code TEXT NOT NULL CHECK (perception_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acpb_admission_class NOT NULL,
  hold_class acpb_hold_class NOT NULL,
  card_class acpb_card_class NOT NULL,
  hold_reason acpb_hold_reason NOT NULL,
  card_reason acpb_card_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  freshness_class acpb_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acpb_effect_observation NOT NULL,
  attested_key_kind acpb_key_kind NOT NULL,
  fact_disposition acpb_fact_disposition NOT NULL,
  body_visibility acpb_body_visibility NOT NULL,
  metadata_trust acpb_metadata_trust NOT NULL,
  access_path acpb_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acpb_card_next NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  hold_steward_a TEXT NOT NULL,
  hold_steward_b TEXT NOT NULL,
  reader_receipt_steward_a TEXT NOT NULL,
  reader_receipt_steward_b TEXT NOT NULL,
  grant_steward_a TEXT NOT NULL,
  grant_steward_b TEXT NOT NULL,
  citation_steward_a TEXT NOT NULL,
  citation_steward_b TEXT NOT NULL,
  provider_steward_a TEXT NOT NULL,
  provider_steward_b TEXT NOT NULL,
  effect_steward_a TEXT NOT NULL,
  effect_steward_b TEXT NOT NULL,
  bind_steward_a TEXT NOT NULL,
  bind_steward_b TEXT NOT NULL,
  provider_receipt_steward_a TEXT NOT NULL,
  provider_receipt_steward_b TEXT NOT NULL,
  card_steward_a TEXT NOT NULL,
  card_steward_b TEXT NOT NULL,
  admission_steward_a TEXT NOT NULL,
  admission_steward_b TEXT NOT NULL,
  attestation_steward_a TEXT NOT NULL,
  attestation_steward_b TEXT NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  card_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, perception_card_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (executes_tool = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (card_body ? 'factBody')),
  CHECK (NOT (card_body ? 'fact_body')),
  CHECK (NOT (card_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acpb_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acpb_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_bind_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_bind_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  binding_threshold INTEGER NOT NULL,
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash TEXT NOT NULL CHECK (char_length(delegated_scope_hash) = 64),
  authorization_revision INTEGER NOT NULL,
  resource_scope_hash TEXT NOT NULL CHECK (char_length(resource_scope_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, idempotency_key),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acpb_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acpb_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acpb_observation_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acpb_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id)
);

CREATE TABLE agent_acpb_observation_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_card_id UUID NOT NULL,
  admission_class acpb_admission_class NOT NULL,
  card_class acpb_card_class NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acpb_card_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acpb_binding_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  binding_code TEXT NOT NULL,
  admission_class acpb_admission_class NOT NULL,
  binding_class acpb_binding_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  binding_hash TEXT NOT NULL CHECK (char_length(binding_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acpb_binding_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  binding_code TEXT NOT NULL,
  perception_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  binding_hash TEXT NOT NULL CHECK (char_length(binding_hash) = 64),
  admission_class acpb_admission_class NOT NULL,
  card_class acpb_card_class NOT NULL,
  binding_class acpb_binding_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  binding_steward_a TEXT NOT NULL,
  binding_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  hold_steward_a TEXT NOT NULL,
  hold_steward_b TEXT NOT NULL,
  reader_receipt_steward_a TEXT NOT NULL,
  reader_receipt_steward_b TEXT NOT NULL,
  grant_steward_a TEXT NOT NULL,
  grant_steward_b TEXT NOT NULL,
  citation_steward_a TEXT NOT NULL,
  citation_steward_b TEXT NOT NULL,
  provider_steward_a TEXT NOT NULL,
  provider_steward_b TEXT NOT NULL,
  effect_steward_a TEXT NOT NULL,
  effect_steward_b TEXT NOT NULL,
  bind_steward_a TEXT NOT NULL,
  bind_steward_b TEXT NOT NULL,
  provider_receipt_steward_a TEXT NOT NULL,
  provider_receipt_steward_b TEXT NOT NULL,
  card_steward_a TEXT NOT NULL,
  card_steward_b TEXT NOT NULL,
  admission_steward_a TEXT NOT NULL,
  admission_steward_b TEXT NOT NULL,
  attestation_steward_a TEXT NOT NULL,
  attestation_steward_b TEXT NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  sealed_revision INTEGER NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acpb_binding_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acpb_binding_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  binding_code TEXT NOT NULL,
  compile_kind acpb_compile_kind NOT NULL,
  admission_class acpb_admission_class NOT NULL,
  card_class acpb_card_class NOT NULL,
  binding_class acpb_binding_class NOT NULL,
  freshness_class acpb_freshness_class NOT NULL,
  effect_observation acpb_effect_observation NOT NULL,
  attested_key_kind acpb_key_kind NOT NULL,
  fact_disposition acpb_fact_disposition NOT NULL,
  body_visibility acpb_body_visibility NOT NULL,
  access_path acpb_access_path NOT NULL,
  metadata_trust acpb_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  binding_hash TEXT NOT NULL CHECK (char_length(binding_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpb_binding_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acpb_perception_binding (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  perception_card_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  hold_code TEXT NOT NULL CHECK (hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  perception_code TEXT NOT NULL CHECK (perception_code ~ '^[a-z0-9:_-]{1,64}$'),
  binding_code TEXT NOT NULL CHECK (binding_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acpb_admission_class NOT NULL,
  hold_class acpb_hold_class NOT NULL,
  card_class acpb_card_class NOT NULL,
  binding_class acpb_binding_class NOT NULL,
  card_reason acpb_card_reason NOT NULL,
  binding_reason acpb_binding_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acpb_effect_observation NOT NULL,
  attested_key_kind acpb_key_kind NOT NULL,
  fact_disposition acpb_fact_disposition NOT NULL,
  body_visibility acpb_body_visibility NOT NULL,
  metadata_trust acpb_metadata_trust NOT NULL,
  access_path acpb_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acpb_binding_next NOT NULL,
  binding_steward_a TEXT NOT NULL,
  binding_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  binding_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, perception_binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpb_binding_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acpb_card_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (executes_tool = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (binding_body ? 'factBody')),
  CHECK (NOT (binding_body ? 'fact_body')),
  CHECK (NOT (binding_body ? 'resolvedFactHash')),
  CHECK (
    (binding_recorded = true AND binding_class = 'BOUND'
      AND card_recorded = true AND card_class = 'PERCEIVED'
      AND hold_recorded = true AND hold_class = 'HELD'
      AND trusted_next_action = 'BIND_PERCEIVED_OBSERVATION'
      AND binding_reason = 'PERCEIVED_OBSERVATION_BOUND'
      AND card_reason = 'HELD_OBSERVATION_PERCEIVED'
      AND sealed_count IS NOT NULL
      AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL
      AND binding_body ? 'sealedCount'
      AND binding_body ? 'deniedCount'
      AND binding_body ? 'unknownEffectCount')
    OR (binding_recorded = false AND binding_class = 'NOT_BOUND'
      AND card_recorded = false AND card_class = 'NOT_PERCEIVED'
      AND hold_recorded = false AND hold_class = 'NOT_HELD'
      AND binding_reason = 'NOT_PERCEIVED_CARD_CANNOT_BIND'
      AND card_reason = 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
      AND trusted_next_action IN ('STOP_CARD_BINDING', 'OMIT_CARD_BINDING')
      AND sealed_count IS NULL
      AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND NOT (binding_body ? 'sealedCount')
      AND NOT (binding_body ? 'deniedCount')
      AND NOT (binding_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acpb_binding_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  binding_code TEXT NOT NULL,
  binding_class acpb_binding_class NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acpb_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acpb_binding_next NOT NULL,
  binding_perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acpb_perception_binding (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (binding_perception_body ? 'factBody')),
  CHECK (NOT (binding_perception_body ? 'fact_body')),
  CHECK (NOT (binding_perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acpb_binding_intent (
  account_id BIGINT NOT NULL,
  binding_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acpb_intent_status NOT NULL,
  binding_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpb_binding_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acpb_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id)
);

CREATE TABLE agent_acpb_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acpb_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id)
);

CREATE TABLE agent_acpb_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id)
);

CREATE TABLE agent_acpb_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acpb_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acpb_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acpb_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpb_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_acpb_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_profile$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'profile must be inserted as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT'
     AND OLD.definition_hash IS DISTINCT FROM NEW.definition_hash THEN
    RAISE EXCEPTION 'sealed profile definition is immutable';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'APPROVED' THEN
      IF current_setting('app.acpb_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acpb_profile_revocation', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile revocation requires the authority fence';
      END IF;
    ELSE
      RAISE EXCEPTION 'profile status transition is not allowed';
    END IF;
  END IF;

  RETURN NEW;
END
$protect_profile$;

CREATE TRIGGER agent_acpb_profile_protect
BEFORE INSERT OR UPDATE ON agent_acpb_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_profile();

CREATE FUNCTION protect_agent_acpb_perception_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acpb_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acpb_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed perception rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acpb_perception_rule_protect
BEFORE UPDATE ON agent_acpb_profile_binding_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_perception_rule();

CREATE FUNCTION protect_agent_acpb_card_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed hold head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.card_body ? 'factBody'
     OR NEW.card_body ? 'fact_body'
     OR NEW.card_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NOT acpb_parties_are_distinct(ARRAY[
       NEW.reader_principal_id, NEW.consumer_principal_id,
       NEW.perception_steward_a, NEW.perception_steward_b,
       NEW.hold_steward_a, NEW.hold_steward_b,
       NEW.reader_receipt_steward_a, NEW.reader_receipt_steward_b,
       NEW.grant_steward_a, NEW.grant_steward_b,
       NEW.citation_steward_a, NEW.citation_steward_b,
       NEW.provider_steward_a, NEW.provider_steward_b,
       NEW.effect_steward_a, NEW.effect_steward_b,
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.provider_receipt_steward_a, NEW.provider_receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     ]) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;

  IF NEW.card_class = 'PERCEIVED' OR NEW.card_recorded THEN
    IF NEW.card_recorded IS DISTINCT FROM TRUE
       OR NEW.card_class IS DISTINCT FROM 'PERCEIVED'
       OR NEW.card_reason IS DISTINCT FROM 'HELD_OBSERVATION_PERCEIVED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'PERCEIVE_HELD_OBSERVATION'
       OR NEW.hold_recorded IS DISTINCT FROM TRUE
       OR NEW.hold_class IS DISTINCT FROM 'HELD'
       OR NEW.hold_reason IS DISTINCT FROM 'ACKNOWLEDGED_OBSERVATION_HELD'
       OR NEW.receipt_issued IS DISTINCT FROM TRUE
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.card_body ? 'sealedCount')
       OR NOT (NEW.card_body ? 'deniedCount')
       OR NOT (NEW.card_body ? 'unknownEffectCount') THEN
      RAISE EXCEPTION 'held observation head must carry the hold counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.card_reason IS DISTINCT FROM 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
     OR NEW.card_class IS DISTINCT FROM 'NOT_PERCEIVED'
     OR NEW.card_recorded
     OR NEW.hold_recorded
     OR NEW.hold_class IS DISTINCT FROM 'NOT_HELD'
     OR NEW.hold_reason IS DISTINCT FROM 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
     OR NEW.receipt_issued
     OR NEW.card_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not held observation head cannot be shown as received';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_HOLD_PERCEPTION' THEN
      RAISE EXCEPTION 'silence is not a perceived observation';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_HOLD_PERCEPTION' THEN
      RAISE EXCEPTION 'denied hold head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'hold head class is not perceivable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acpb_card_head_protect
BEFORE INSERT OR UPDATE ON agent_acpb_card_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_card_head();

CREATE FUNCTION protect_agent_acpb_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.binding_hash IS DISTINCT FROM NEW.binding_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'card decision identity is immutable';
    END IF;
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence';
  END IF;

  IF NEW.packet_scan_used
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.executes_tool THEN
    RAISE EXCEPTION 'packet scan fence';
  END IF;

  IF NEW.binding_class = 'BOUND' AND NEW.binding_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'perceived observation must copy the hold counts';
  END IF;

  IF NEW.binding_class = 'NOT_BOUND' AND NEW.binding_recorded THEN
    RAISE EXCEPTION 'not held observation cannot be shown as received';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acpb_decision_protect
BEFORE INSERT OR UPDATE ON agent_acpb_binding_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_decision();

CREATE FUNCTION protect_agent_acpb_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acpb_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.binding_steward_a, NEW.binding_steward_b,
    NEW.perception_steward_a, NEW.perception_steward_b,
    NEW.hold_steward_a, NEW.hold_steward_b,
    NEW.reader_receipt_steward_a, NEW.reader_receipt_steward_b,
    NEW.grant_steward_a, NEW.grant_steward_b,
    NEW.citation_steward_a, NEW.citation_steward_b,
    NEW.provider_steward_a, NEW.provider_steward_b,
    NEW.effect_steward_a, NEW.effect_steward_b,
    NEW.bind_steward_a, NEW.bind_steward_b,
    NEW.provider_receipt_steward_a, NEW.provider_receipt_steward_b,
    NEW.card_steward_a, NEW.card_steward_b,
    NEW.admission_steward_a, NEW.admission_steward_b,
    NEW.attestation_steward_a, NEW.attestation_steward_b,
    NEW.synopsis_steward_a, NEW.synopsis_steward_b,
    NEW.publication_steward_a, NEW.publication_steward_b
  ]) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acpb_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acpb_binding_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_certificate();

CREATE FUNCTION protect_agent_acpb_binding_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_intent$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'card intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.binding_idempotency_key IS DISTINCT FROM NEW.binding_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared card identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acpb_binding_intent_protect
BEFORE INSERT OR UPDATE ON agent_acpb_binding_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_binding_intent();

CREATE FUNCTION protect_agent_acpb_perception_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_card$
DECLARE
  v_head agent_acpb_card_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
  v_ack TEXT;
  v_hold TEXT;
  v_perception TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed consumer perception card is immutable';
  END IF;

  IF NEW.executes_tool THEN
    RAISE EXCEPTION 'tool execution inside the card';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.binding_body ? 'factBody'
     OR NEW.binding_body ? 'fact_body'
     OR NEW.binding_body ? 'resolvedFactHash'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'card fence';
  END IF;

  IF NEW.binding_code IS NULL OR NEW.binding_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acpb_card_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the hold reader';
  END IF;

  IF NOT acpb_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.binding_steward_a, NEW.binding_steward_b,
    NEW.perception_steward_a, NEW.perception_steward_b,
    v_head.hold_steward_a, v_head.hold_steward_b,
    v_head.reader_receipt_steward_a, v_head.reader_receipt_steward_b,
    v_head.grant_steward_a, v_head.grant_steward_b,
    v_head.citation_steward_a, v_head.citation_steward_b,
    v_head.provider_steward_a, v_head.provider_steward_b,
    v_head.effect_steward_a, v_head.effect_steward_b,
    v_head.bind_steward_a, v_head.bind_steward_b,
    v_head.provider_receipt_steward_a, v_head.provider_receipt_steward_b,
    v_head.card_steward_a, v_head.card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b
  ]) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;

  IF NEW.perception_steward_a IS DISTINCT FROM v_head.perception_steward_a
     OR NEW.perception_steward_b IS DISTINCT FROM v_head.perception_steward_b
     OR NEW.perception_card_id IS DISTINCT FROM v_head.perception_card_id THEN
    RAISE EXCEPTION 'card must cite the sealed hold';
  END IF;

  IF NEW.binding_class = 'BOUND' OR NEW.binding_recorded THEN
    IF v_head.card_class IS DISTINCT FROM 'PERCEIVED'
       OR v_head.card_recorded IS DISTINCT FROM TRUE
       OR v_head.card_reason IS DISTINCT FROM 'HELD_OBSERVATION_PERCEIVED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'PERCEIVE_HELD_OBSERVATION' THEN
      RAISE EXCEPTION 'not held observation cannot be shown as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.binding_reason IS DISTINCT FROM 'PERCEIVED_OBSERVATION_BOUND'
       OR NEW.trusted_next_action IS DISTINCT FROM 'BIND_PERCEIVED_OBSERVATION'
       OR NEW.card_recorded IS DISTINCT FROM TRUE
       OR NEW.binding_class IS DISTINCT FROM 'BOUND' THEN
      RAISE EXCEPTION 'perceived observation must copy the hold counts';
    END IF;
  ELSE
    IF v_head.card_class IS DISTINCT FROM 'NOT_PERCEIVED'
       OR v_head.card_recorded THEN
      RAISE EXCEPTION 'held observation must show the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.binding_body ? 'sealedCount'
       OR NEW.binding_recorded
       OR NEW.card_recorded
       OR NEW.binding_reason IS DISTINCT FROM 'NOT_PERCEIVED_CARD_CANNOT_BIND' THEN
      RAISE EXCEPTION 'not held observation cannot be shown as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_HOLD_PERCEPTION' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_CARD_BINDING' THEN
        RAISE EXCEPTION 'silence cannot be shown as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_CARD_BINDING'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused card must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_hold_code, p.allowed_perception_code, p.allowed_binding_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt,
         v_ack, v_hold, v_perception
  FROM agent_acpb_session AS s
  JOIN agent_acpb_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_perception IS NULL
     OR NEW.binding_code IS DISTINCT FROM v_perception
     OR NEW.perception_code IS DISTINCT FROM v_hold
     OR NEW.hold_code IS DISTINCT FROM v_ack
     OR NEW.receipt_code IS DISTINCT FROM v_receipt
     OR NEW.provider_code IS DISTINCT FROM v_provider
     OR NEW.effect_code IS DISTINCT FROM v_effect
     OR NEW.purpose_code IS DISTINCT FROM v_purpose
     OR NEW.effect_code IS DISTINCT FROM v_head.effect_code
     OR NEW.purpose_code IS DISTINCT FROM v_head.purpose_code
     OR NEW.provider_code IS DISTINCT FROM v_head.provider_code
     OR NEW.citation_code IS DISTINCT FROM v_head.citation_code
     OR NEW.grant_code IS DISTINCT FROM v_head.grant_code
     OR NEW.receipt_code IS DISTINCT FROM v_head.receipt_code
     OR NEW.hold_code IS DISTINCT FROM v_head.hold_code
     OR NEW.perception_code IS DISTINCT FROM v_head.perception_code THEN
    RAISE EXCEPTION 'perception code is not the profile perception';
  END IF;

  RETURN NEW;
END
$protect_card$;

CREATE TRIGGER agent_acpb_perception_binding_protect
BEFORE INSERT OR UPDATE ON agent_acpb_perception_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_perception_binding();

CREATE FUNCTION protect_agent_acpb_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed card perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.binding_perception_body ? 'factBody'
     OR NEW.binding_perception_body ? 'fact_body'
     OR NEW.binding_perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.binding_class = 'NOT_BOUND'
     AND (NEW.binding_recorded
          OR NEW.card_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.binding_perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not perceived card cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acpb_perception_protect
BEFORE INSERT OR UPDATE ON agent_acpb_binding_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpb_perception();

CREATE FUNCTION approve_agent_acpb_profile(
  p_tenant_id BIGINT,
  p_profile_id UUID,
  p_profile_version INTEGER,
  p_definition_hash TEXT,
  p_approver_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $approve$
DECLARE
  stored_hash TEXT;
  stored_status acpb_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acpb_profile
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
  FOR UPDATE;

  IF char_length(p_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM p_definition_hash THEN
    RAISE EXCEPTION 'profile approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO rule_count
  FROM agent_acpb_profile_binding_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_binding IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control perception rule';
  END IF;

  PERFORM set_config(
    'app.acpb_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acpb_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acpb_profile(
  p_tenant_id BIGINT,
  p_profile_id UUID,
  p_profile_version INTEGER,
  p_definition_hash TEXT,
  p_revoker_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $revoke$
DECLARE
  stored_hash TEXT;
  stored_status acpb_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acpb_profile
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
  FOR UPDATE;

  IF char_length(p_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM p_definition_hash THEN
    RAISE EXCEPTION 'profile revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.acpb_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acpb_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acpb_observation(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_nomination_id UUID,
  p_nomination_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  v_session_status acpb_session_status;
  v_profile_status acpb_profile_status;
  v_principal TEXT;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL OR p_consumer_principal IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_nomination_hash) <> 64 THEN
    RAISE EXCEPTION 'nomination hash must be 64 hex characters';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acpb_observation_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one observation per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acpb_session AS s
  JOIN agent_acpb_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'nomination requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  INSERT INTO agent_acpb_observation_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION record_agent_acpb_perception_binding(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_binding_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_binding_id UUID,
  p_binding_digest TEXT,
  p_binding_steward_a TEXT,
  p_binding_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acpb_session_status;
  v_profile_status acpb_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_allowed_hold TEXT;
  v_allowed_perception TEXT;
  v_allowed_binding TEXT;
  v_principal TEXT;
  v_head agent_acpb_card_head%ROWTYPE;
  v_binding_class acpb_binding_class;
  v_card_class acpb_card_class;
  v_hold_class acpb_hold_class;
  v_reason acpb_binding_reason;
  v_card_reason acpb_card_reason;
  v_binding_recorded BOOLEAN;
  v_card_recorded BOOLEAN;
  v_hold_recorded BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acpb_binding_next;
  v_terminal acpb_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_binding_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_binding_digest) <> 64 THEN
    RAISE EXCEPTION 'binding digest must be 64 hex characters';
  END IF;

  IF p_binding_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acpb_observation_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'card requires a nominated observation point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, pr.allowed_hold_code, pr.allowed_perception_code,
         pr.allowed_binding_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_hold, v_allowed_perception, v_allowed_binding, v_principal
  FROM agent_acpb_session AS s
  JOIN agent_acpb_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'card requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_binding_code IS DISTINCT FROM v_allowed_binding THEN
    RAISE EXCEPTION 'perception code is not the profile perception';
  END IF;

  SELECT * INTO v_head
  FROM agent_acpb_card_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation
     OR v_head.grant_code IS DISTINCT FROM v_allowed_grant
     OR v_head.receipt_code IS DISTINCT FROM v_allowed_receipt
     OR v_head.hold_code IS DISTINCT FROM v_allowed_hold
     OR v_head.perception_code IS DISTINCT FROM v_allowed_perception THEN
    RAISE EXCEPTION 'hold code is not the profile hold';
  END IF;

  IF v_head.inlines_fact_body
     OR v_head.opens_nested_expiry
     OR v_head.ack_promoted_to_trust
     OR v_head.packet_scan_used
     OR v_head.executes_tool
     OR v_head.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_head.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR v_head.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR v_head.body_visibility IS DISTINCT FROM 'OMITTED'
     OR v_head.card_body ? 'factBody'
     OR v_head.card_body ? 'fact_body'
     OR v_head.card_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'card fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acpb_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_binding_steward_a, p_binding_steward_b,
       v_head.perception_steward_a, v_head.perception_steward_b,
       v_head.hold_steward_a, v_head.hold_steward_b,
       v_head.reader_receipt_steward_a, v_head.reader_receipt_steward_b,
       v_head.grant_steward_a, v_head.grant_steward_b,
       v_head.citation_steward_a, v_head.citation_steward_b,
       v_head.provider_steward_a, v_head.provider_steward_b,
       v_head.effect_steward_a, v_head.effect_steward_b,
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.provider_receipt_steward_a, v_head.provider_receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     ]) THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer and every steward';
  END IF;

  IF p_reader_principal IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the hold reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acpb_perception_binding
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'consumer perception card already recorded';
  END IF;

  IF v_head.card_class = 'PERCEIVED'
     AND v_head.card_reason = 'HELD_OBSERVATION_PERCEIVED'
     AND v_head.card_recorded
     AND v_head.hold_recorded
     AND v_head.hold_class = 'HELD'
     AND v_head.hold_reason = 'ACKNOWLEDGED_OBSERVATION_HELD'
     AND v_head.receipt_issued
     AND v_head.trusted_next_action = 'PERCEIVE_HELD_OBSERVATION'
     AND v_head.admission_class = 'ADMITTED' THEN
    v_binding_class := 'BOUND';
    v_card_class := 'PERCEIVED';
    v_hold_class := 'HELD';
    v_reason := 'PERCEIVED_OBSERVATION_BOUND';
    v_card_reason := 'HELD_OBSERVATION_PERCEIVED';
    v_binding_recorded := true;
    v_card_recorded := true;
    v_hold_recorded := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'BIND_PERCEIVED_OBSERVATION';
    v_terminal := 'BINDING_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_HOLD_PERCEPTION' THEN
    v_binding_class := 'NOT_BOUND';
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_reason := 'NOT_PERCEIVED_CARD_CANNOT_BIND';
    v_card_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_CARD_BINDING';
    v_terminal := 'BINDING_REFUSED';
  ELSE
    v_binding_class := 'NOT_BOUND';
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_reason := 'NOT_PERCEIVED_CARD_CANNOT_BIND';
    v_card_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_CARD_BINDING';
    v_terminal := 'BINDING_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'readerPrincipalId', p_reader_principal,
    'purposeCode', v_head.purpose_code,
    'effectCode', v_head.effect_code,
    'providerCode', v_head.provider_code,
    'citationCode', v_head.citation_code,
    'grantCode', v_head.grant_code,
    'receiptCode', v_head.receipt_code,
    'holdCode', v_head.hold_code,
    'perceptionCode', v_head.perception_code,
    'bindingCode', p_binding_code,
    'admissionClass', v_head.admission_class,
    'cardClass', v_card_class,
    'bindingClass', v_binding_class,
    'bindingReason', v_reason,
    'cardRecorded', v_card_recorded,
    'bindingRecorded', v_binding_recorded,
    'lagPublications', v_lag,
    'maxLagBudget', v_head.max_lag_budget,
    'metadataTrust', 'UNTRUSTED_METADATA',
    'attestedKeyKind', 'AWAITING_CONFIRMATION',
    'ackPromotedToTrust', false,
    'inlinesFactBody', false,
    'opensNestedExpiry', false,
    'packetScanUsed', false,
    'executesTool', false
  );
  IF v_binding_recorded THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acpb_observation_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, perception_card_id, admission_class, card_class,
    card_recorded, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.perception_card_id, v_head.admission_class,
    v_head.card_class, v_head.card_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpb_binding_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, binding_code, admission_class, binding_class,
    binding_recorded, binding_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_binding_code, v_head.admission_class, v_binding_class,
    v_binding_recorded, p_binding_digest, clock_timestamp()
  );

  INSERT INTO agent_acpb_binding_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, binding_code, perception_code, provider_code,
    binding_hash, admission_class, card_class, binding_class, binding_recorded,
    binding_steward_a, binding_steward_b,
    perception_steward_a, perception_steward_b,
    hold_steward_a, hold_steward_b,
    reader_receipt_steward_a, reader_receipt_steward_b,
    grant_steward_a, grant_steward_b,
    citation_steward_a, citation_steward_b,
    provider_steward_a, provider_steward_b,
    effect_steward_a, effect_steward_b,
    bind_steward_a, bind_steward_b,
    provider_receipt_steward_a, provider_receipt_steward_b,
    card_steward_a, card_steward_b,
    admission_steward_a, admission_steward_b,
    attestation_steward_a, attestation_steward_b,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_certificate_id, p_session_id, p_compile_id, p_consumer_principal,
    p_reader_principal, p_utc_day, p_binding_code, v_head.perception_code,
    v_head.provider_code, p_binding_digest, v_head.admission_class, v_card_class,
    v_binding_class, v_binding_recorded,
    p_binding_steward_a, p_binding_steward_b,
    v_head.perception_steward_a, v_head.perception_steward_b,
    v_head.hold_steward_a, v_head.hold_steward_b,
    v_head.reader_receipt_steward_a, v_head.reader_receipt_steward_b,
    v_head.grant_steward_a, v_head.grant_steward_b,
    v_head.citation_steward_a, v_head.citation_steward_b,
    v_head.provider_steward_a, v_head.provider_steward_b,
    v_head.effect_steward_a, v_head.effect_steward_b,
    v_head.bind_steward_a, v_head.bind_steward_b,
    v_head.provider_receipt_steward_a, v_head.provider_receipt_steward_b,
    v_head.card_steward_a, v_head.card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpb_binding_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, binding_code, compile_kind,
    admission_class, card_class, binding_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    binding_recorded, executes_tool, lag_publications, max_lag_budget, binding_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_binding_code,
    'BIND_PERCEIVED_OBSERVATION',
    v_head.admission_class, v_card_class, v_binding_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_binding_recorded, false, v_lag, v_head.max_lag_budget, p_binding_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpb_perception_binding (
    account_id, utc_day, consumer_principal_id, perception_binding_id, session_id,
    certificate_id, perception_card_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, hold_code,
    perception_code, binding_code, admission_class, hold_class, card_class,
    binding_class, card_reason, binding_reason, hold_recorded, card_recorded,
    binding_recorded, sealed_count, denied_count, unknown_effect_count, lag_publications,
    max_lag_budget, effect_observation, attested_key_kind, fact_disposition,
    body_visibility, metadata_trust, access_path, inlines_fact_body, opens_nested_expiry,
    ack_promoted_to_trust, packet_scan_used, executes_tool, trusted_next_action,
    binding_steward_a, binding_steward_b, perception_steward_a, perception_steward_b,
    binding_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_binding_id, p_session_id,
    p_certificate_id, v_head.perception_card_id, p_reader_principal,
    v_head.purpose_code, v_head.effect_code, v_head.provider_code, v_head.citation_code,
    v_head.grant_code, v_head.receipt_code, v_head.hold_code, v_head.perception_code,
    p_binding_code, v_head.admission_class, v_hold_class, v_card_class, v_binding_class,
    v_card_reason, v_reason, v_hold_recorded, v_card_recorded, v_binding_recorded,
    v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false, v_next,
    p_binding_steward_a, p_binding_steward_b, v_head.perception_steward_a,
    v_head.perception_steward_b, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpb_binding_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, perception_binding_id,
    binding_code, binding_class, card_recorded, binding_recorded, sealed_count, denied_count,
    unknown_effect_count, attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    binding_perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_binding_id,
    p_binding_code, v_binding_class, v_card_recorded, v_binding_recorded, v_sealed, v_denied,
    v_unknown, 'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acpb_binding_intent (
    account_id, binding_intent_id, session_id, certificate_id, intent_status,
    binding_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_binding_id, p_session_id, p_certificate_id, 'PREPARED',
    p_binding_id::TEXT, 1, p_binding_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpb_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_binding_id, p_session_id, 'BIND', 1, clock_timestamp()
  );

  INSERT INTO agent_acpb_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acpb_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'PERCEPTION_BINDING_SEALED',
    p_binding_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acpb_session
  SET consumed_bind_units = consumed_bind_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$publish$;

CREATE FUNCTION reject_agent_acpb_unscoped_scan(
  has_account BOOLEAN,
  has_observation_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_observation_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_acpb_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acpb_profile_authority;
ALTER FUNCTION revoke_agent_acpb_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acpb_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acpb_profile_authority;
GRANT SELECT ON
  agent_acpb_profile,
  agent_acpb_profile_binding_rule
TO agent_acpb_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acpb_profile TO agent_acpb_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acpb_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acpb_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acpb_profile FROM PUBLIC;

CREATE INDEX agent_acpb_session_work_idx ON agent_acpb_session (
  account_id,
  status
);
CREATE INDEX agent_acpb_session_profile_idx ON agent_acpb_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acpb_head_consumer_idx ON agent_acpb_card_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acpb_nomination_session_idx ON agent_acpb_observation_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acpb_certificate_session_idx ON agent_acpb_binding_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acpb_decision_cert_idx ON agent_acpb_binding_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acpb_card_consumer_idx ON agent_acpb_perception_binding (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acpb_card_reader_idx ON agent_acpb_perception_binding (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acpb_perception_day_idx ON agent_acpb_binding_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acpb_intent_work_idx ON agent_acpb_binding_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acpb_audit_time_idx ON agent_acpb_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acpb_command_expiry_idx ON agent_acpb_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acpb_checkpoint_day_idx ON agent_acpb_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acpb_binding_day_idx ON agent_acpb_observation_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acpb_authorization_evidence',
    'agent_acpb_profile',
    'agent_acpb_profile_binding_rule',
    'agent_acpb_card_head',
    'agent_acpb_session',
    'agent_acpb_observation_nomination',
    'agent_acpb_observation_binding',
    'agent_acpb_binding_compile',
    'agent_acpb_binding_certificate',
    'agent_acpb_binding_decision',
    'agent_acpb_perception_binding',
    'agent_acpb_binding_perception',
    'agent_acpb_binding_intent',
    'agent_acpb_budget_ledger',
    'agent_acpb_terminal_record',
    'agent_acpb_command_result',
    'agent_acpb_audit_head',
    'agent_acpb_audit_event',
    'agent_acpb_audit_anchor',
    'agent_acpb_projection_checkpoint'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (account_id = NULLIF(current_setting(''app.account_id'', true), '''')::BIGINT) WITH CHECK (account_id = NULLIF(current_setting(''app.account_id'', true), '''')::BIGINT)',
      t
    );
  END LOOP;
END
$rls$;
```

Direct inserts that skip the publish function still pass through the
triggers. A successful card on a `NOT_PERCEIVED` observation, a trusted key,
a packet scan, a fact body, a tool execution flag, or a nested expiry
flag is rejected. The hold head cannot be updated to launder a refused
hold into a shown card. A reader other than the hold reader is
rejected, so the insert does not grant a second reader.

The reference check executes this schema fence, including
`acpb_session_status`, the triggers, and
`record_agent_acpb_perception_binding`, as one database session.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcpbAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcpbCardClass {
  PERCEIVED
  NOT_PERCEIVED
}

enum AcpbBindingClass {
  BOUND
  NOT_BOUND
}

enum AcpbBindingReason {
  PERCEIVED_OBSERVATION_BOUND
  NOT_PERCEIVED_CARD_CANNOT_BIND
}

enum AcpbNextAction {
  BIND_PERCEIVED_OBSERVATION
  STOP_CARD_BINDING
  OMIT_CARD_BINDING
}

enum AcpbKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcpbProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  allowedPurpose: String!
  allowedEffectCode: String!
  allowedProviderCode: String!
  allowedCitationCode: String!
  allowedGrantCode: String!
  allowedReceiptCode: String!
  allowedHoldCode: String!
  allowedPerceptionCode: String!
  allowedBindingCode: String!
  procedureRef: String!
}

type AcpbSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerObservation: Int!
}

type AcpbCardHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  cardClass: AcpbCardClass!
  cardRecorded: Boolean!
  attestedKeyKind: AcpbKeyKind!
}

type AcpbPerceptionBinding {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  perceptionBindingId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  grantCode: String!
  receiptCode: String!
  holdCode: String!
  perceptionCode: String!
  bindingCode: String!
  admissionClass: AcpbAdmissionClass!
  cardClass: AcpbCardClass!
  bindingClass: AcpbBindingClass!
  bindingReason: AcpbBindingReason!
  cardRecorded: Boolean!
  bindingRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcpbKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcpbNextAction!
}

type AcpbBindingPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  bindingCode: String!
  bindingRecorded: Boolean!
  bindingPerceptionBody: JSON!
}

type AcpbAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcpbProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcpbProfile
  agentAcpbSession(accountId: ID!, sessionId: ID!): AcpbSession
  agentAcpbCardHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcpbCardHead
  agentAcpbPerceptionBinding(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcpbPerceptionBinding
  agentAcpbBindingPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcpbBindingPerception
  agentAcpbAuditEvents(accountId: ID!, utcDay: String!): [AcpbAuditEvent!]!
}

type Mutation {
  createAgentAcpbProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcpbProfile!
  approveAgentAcpbProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcpbProfile!
  revokeAgentAcpbProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcpbProfile!
  openAgentAcpbSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcpbSession!
  nominateAgentAcpbObservation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  recordAgentAcpbPerceptionBinding(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    bindingCode: String!
  ): AcpbPerceptionBinding!
  appendAgentAcpbBindingIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcpbAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Observation and card reads also take a
non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool. Resolvers
must call `reject_agent_acpb_unscoped_scan` before planning when
either the account or the observation key is missing. A card read is
one primary-key lookup. It does not join a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-perception-binding`. The
instruction payload on the binding rule is deterministic JSON:

- point-look up one card by
  `(account_id, utc_day, consumer_principal_id)`;
- record the single `allowed_binding_code` for the card reader only
  when `card_recorded` is true, the card reason is
  `HELD_OBSERVATION_PERCEIVED`, and the next action is
  `PERCEIVE_HELD_OBSERVATION`;
- otherwise seal `NOT_PERCEIVED_CARD_CANNOT_BIND` with null
  counts;
- never execute the tool inside the binding;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
binding code, and the card reader. It may not rewrite the instruction
by chatting with the engine. Changing the binding code is a new
profile version that stays `DRAFT` until the authority fence approves
it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single
binding code. Queries must filter `account_id` before topK. A global
ANN index would mix tenants and is rejected. The reference schema does
not build an HNSW index.

```sql
CREATE TABLE agent_acpb_profile_embedding (
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
    REFERENCES agent_acpb_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acpb_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acpb_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acpb_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one observation, and records that profile's one binding code
for the card reader. Discovery never writes
`agent_acpb_perception_binding`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the card `reader_principal_id` and the one `binding_code`;
- `bindingRecorded` true only when the three counts are present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on a
  bound observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`BIND_PERCEIVED_OBSERVATION` as permission to execute the tool or to
enroll the key. `ACKED` on the upstream effect stays an observation.
It is not this binding, and it is not trust.

## 13. ACID and consistency

The record function is one transaction. The session binding, compile,
certificate, decision, perception binding, perception row, intent,
budget, terminal, and audit commit together or not at all. The card
head is not updated. Isolation is the tenant RLS predicate on
`account_id`. Durability is the hash-chained audit event
`PERCEPTION_BINDING_SEALED`.

Consistency beats a faster but lossy fan-out. A binding that copied
counts from a `NOT_PERCEIVED` card would be a durable lie. The engine
would rather seal `NOT_BOUND` with null counts than reconstruct a
reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null binding code is
  **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected access
  paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one observation. A second nomination is
  rejected.
- The binding does not execute the tool, does not call the provider,
  and does not open another nested expiry.
- A reader other than the card reader is rejected, which keeps one
  noisy agent from binding every principal in the account.
- Budgets cap bind, vector, and notify units so a retry loop cannot
  spend a neighbor's latency.
- Semantic topK is account-filtered and cannot record a binding.

These guards keep the 99.99% availability target. An autonomous agent
cannot turn one binding into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The binding path does not read a board. It reads one primary key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve the
path lead with `account_id`. There is no predicate that scans every
item on a board, every context packet, or every reader in the account.

Any plan that lacks both `account_id` and the observation key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this plane.
The columnar synopsis stays upstream. This plane does not re-aggregate
it.

## 16. Auditability and replay

Each seal appends `agent_acpb_audit_event` with
`event_kind = PERCEPTION_BINDING_SEALED`, a 64-character event hash,
and a previous hash. Replay reads the card head and the profile
binding code and must reproduce `binding_class`, `binding_reason`, the
reader, and the three counts or their absence. Replay does not call a
model. The card head and the binding row are immutable after insert,
so a later agent cannot edit history to make a refused card look
bound.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the card
  reader. The function rejects the call. The card head reader stays
  unchanged.
- **Forged binding on a refused card:** the trigger reads the head by
  primary key and rejects `binding_recorded` when `card_recorded` is
  false.
- **Count laundering:** a bound row whose counts differ from the head
  is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The binding is
  not a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash` are
  rejected on the head and on the binding.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane does
  not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are rejected.
- **Steward reuse:** binding stewards must be distinct from the reader,
  the consumer, the perception stewards, and every upstream steward.
- **Cross-tenant read:** forced RLS hides every row whose `account_id`
  does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is rejected.
  Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the binding transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The binding transaction performs one primary-key read and a fixed
  set of primary-key writes. It has no board fan-out.
- Counters: bindings recorded, bindings refused, full-scan rejects,
  steward-reuse rejects, second-reader rejects, and tool-execution
  rejects.
- A recorded binding with null counts, or a refused binding with any
  count, is a correctness page.
- A card-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing bindings.
2. Export card heads for one canary account by primary key. Confirm
   heads are immutable and tenant-scoped.
3. Enable `record_agent_acpb_perception_binding` for that account.
   Compare recorded counts to the card head.
4. Watch full-scan rejects and second-reader rejects. A spike means an
   agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW index.
   Do not enable tool execution inside the binding.

Revocation stops new sessions. It does not rewrite sealed bindings.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one binding for a perceived head with counts
  1/1/1 and lag 3 inside budget 5, leaves that head unchanged, and
  seals `PERCEIVED_OBSERVATION_BOUND` for `principal:reader-1`.
- A not-perceived head with lag 8 keeps null counts,
  `NOT_PERCEIVED_CARD_CANNOT_BIND`, and the denied lag.
- Silence seals `NOT_BOUND` with a null lag and null counts.
- A null day, a second nomination, a foreign binding code, a fact
  body, a nested expiry, a packet scan, steward reuse, a binding on a
  not-perceived card, a reader equal to the consumer, counts that
  differ from the head, an ack promoted to trust, tool execution, a
  mutated head, a mutated binding, a profile inserted as approved, a
  second reader, and an unscoped scan are rejected.
- `npm audit` reports no vulnerabilities in the validation toolchain.

## 21. Product decision

Ship the agent perception binding as a deterministic point lookup of an
already sealed card. The binding copies the three counts only when
`card_recorded` is true, names only the card reader, and leaves the
card head unchanged. `ACKED` is not trust. The tool does not run. The
plane does not open another nested expiry.

The next increment should record one binding receipt of one already
`BOUND` binding by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_BOUND` binding
cannot be receipted as received. The receipt copies the three counts
only when `binding_recorded` is true. The reader on the receipt must
equal the binding reader and stay distinct from the consumer and every
steward. The receipt must not scan context packets, must not inline a
fact body, must not promote `ACKED` to `TRUSTED_ENROLLED`, must not
execute the tool, must not grant a second reader, and must not open
another nested expiry plane.
