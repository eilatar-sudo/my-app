# mondayDB Agentic Admitted Count Hold Perception Card Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-20.v1`

## 1. Why this plane, before how

The 2026-10-19 Admitted Count Acknowledgement Hold Plane records one
consumer-visible hold for one already sealed acknowledgement. The grain
is `(account_id, utc_day, consumer_principal_id)`. A `HELD` row copies
the three counts, names exactly the observation reader, and seals
`ACKNOWLEDGED_OBSERVATION_HELD` with next action
`HOLD_ACKNOWLEDGED_OBSERVATION`. A `NOT_HELD` row seals
`NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD` with null counts. That plane
does not publish a consumer perception card.

Without this plane an agent either:

- treats `HOLD_ACKNOWLEDGED_OBSERVATION` itself as proof the consumer
  was shown the counts, or
- walks context packets, tool logs, or a board with 1M+ rows to invent
  a card (neighbor-harmful, and a miss against the 99.99% availability
  target).

The product trade-off is **perception honesty versus hold isolation**,
and **card latency versus a second reader**:

- Honesty: the consumer named on a `HELD` observation should have one
  perception card that copies the three counts already on that hold,
  without opening the hold again.
- Isolation: the database does not call the provider and does not
  execute the tool. Publishing the card is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or recursive
  tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_HELD` observation cannot be shown as
  received. The card names the hold reader and no one else. A second
  reader is a new request, and this plane rejects it.
- The hold head is not rewritten. Replay of the hold stays stable. The
  card is a new row that cites the hold by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does not
  promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the card is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed card plus the hold
id it cites. Neighbor availability stays at the 99.99% target because
an unscoped day walk, a reader list, or a packet walk is **FULL SCAN
REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved perception profile is procedural memory for "how one
   already sealed hold becomes a single consumer perception card." The
   profile names exactly one perception code and the one hold code that
   card may cite. A profile never inlines a fact body, never rewrites
   `ACKED` as `TRUSTED_ENROLLED`, and never opens another nested expiry
   plane.
2. A session nominates exactly one observation key. The card then reads
   `agent_achpc_hold_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB publishes a card only when the head is `HELD`,
   `hold_recorded` is true, the hold reason is
   `ACKNOWLEDGED_OBSERVATION_HELD`, the next action is
   `HOLD_ACKNOWLEDGED_OBSERVATION`, and the requested reader equals the
   hold reader. The copy of the three counts is equality with the hold.
   It does not call a model and it does not execute the tool.
4. `NOT_HELD` seals `NOT_HELD_OBSERVATION_CANNOT_PERCEIVE` with
   `card_recorded = false` and null counts. Silence keeps a null lag.
   There is no card that shows the observation as received.
5. The reader equals the hold reader and is distinct from the consumer
   and from every steward, including the two perception stewards and
   the two hold stewards. Two perception stewards witness the card.
   They are distinct from the consumer, from the reader, from the hold
   stewards, and from the acknowledgement, reader-receipt, grant,
   citation, provider, effect, bind, provider-receipt, card, admission,
   attestation, synopsis, and publication stewards.
6. Unscoped observation or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session published the nomination and
  the consumer perception card?
- Was the card a point lookup of an already sealed hold, and what class
  did that hold have?
- Did a `HELD` observation show exactly its one reader and seal
  `HELD_OBSERVATION_PERCEIVED` with the three hold counts?
- Did a `NOT_HELD` observation stay unshown, with null counts and
  `NOT_HELD_OBSERVATION_CANNOT_PERCEIVE`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the hold head keep the class, the reader, and the counts it was
  exported with?
- Can the card be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never publishes this
card.

## 2. Scope and ownership

The Admitted Count Hold Perception Card Plane owns:

1. Immutable approved perception profiles as procedural memory, each
   naming one perception code for one hold.
2. Tenant-scoped card sessions with a hard cap of one nominated
   observation and the one reader already on that hold.
3. Deterministic nomination of that observation, then one point lookup
   of the hold head.
4. A consumer perception card keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the hold
   `reader_principal_id`.
5. An agent perception row that carries counts only when
   `card_recorded` is true, which is only when `hold_recorded` is true.
6. Audit events that cite the card hash.

It integrates with, but does not replace:

- **Admitted Count Acknowledgement Hold Plane:** supplies the sealed
  hold this plane reads. Exporters copy the hold class, the hold
  reason, `hold_recorded`, the one reader, the counts the hold actually
  copied, the next action, and the stewards onto
  `agent_achpc_hold_head`. This plane does not re-hold the
  acknowledgement, does not recover withheld counts, and does not
  promote `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, perceive, vector,
  and notify units. A refused observation is a sealed non-card, not a
  scan of the packet log. The card does not run the tool and does not
  call the provider.

### Non-goals

- Letting an LLM choose which reader a hold may show.
- Executing the tool, calling the provider, or compiling a board query
  inside `publish_agent_achpc_perception_card`.
- Publishing any perception code other than the single code on the
  approved profile.
- Copying counts onto a card whose hold is `NOT_HELD`.
- Rewriting the hold head so a refused hold becomes a shown card.
- Naming a reader other than the hold reader. That would grant a
  second reader, and this plane rejects it.
- Recomputing cards by scanning a board, a packet log, or a reader
  ledger.
- Cross-account cards or global nearest-neighbor perception.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the card.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because the
  effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this card.
- Recording a separate agent perception binding of the card. That is
  the next plane, and only for an already `PERCEIVED` card.

## 3. Product contract

### 3.1 Perception profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the hold must already carry (one
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
- the single `allowed_acknowledgement_code` the head must already
  carry (one token, no list);
- the single `allowed_hold_code` the head must already carry (one
  token, no list);
- the single `allowed_perception_code` this plane may seal (one token,
  no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- perception threshold (distinct perception stewards, minimum 2), max
  observations per session (exactly 1), max nominated observations
  (exactly 1), and max readers per observation (exactly 1);
- perception policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `CARD_NEVER_EXECUTES_TOOL`, `CARD_NEVER_INLINES_BODY`,
  `CARD_NEVER_CONFIRMS`, `ONE_OBSERVATION_PER_SESSION`,
  `ONE_CARD_PER_OBSERVATION`, `HOLD_READER_ONLY`, `POINT_LOOKUP_ONLY`,
  `HELD_OBSERVATION_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `COUNTS_ONLY_WHEN_HOLD_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_CARD`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so PostgreSQL
`CREATE TYPE` accepts it. The longest card reason is
`NOT_HELD_OBSERVATION_CANNOT_PERCEIVE` (35 bytes). The success reason
is `HELD_OBSERVATION_PERCEIVED` (25 bytes).

Approval and revocation require the authority fence
`approve_agent_achpc_profile` / `revoke_agent_achpc_profile`, owned by
`agent_achpc_profile_authority`. A profile cannot be inserted as
`APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, perceive,
vector, and notify units, plus wall time. `max_observations_per_session`,
`max_nominated_observations`, and `max_readers_per_observation` are all
exactly 1. A second observation nomination in the same session is
rejected before it can fan out into a recursive reader walk.

The session principal is the only consumer that session may show. A
card for a different consumer is rejected. The reader on the card is
the reader already stored on the hold. It cannot be the consumer, and
it cannot be replaced.

### 3.3 Hold head and nomination contract

Upstream hold export writes one hold head per
`(account_id, utc_day, consumer_principal_id)`. The head copy includes
`hold_class`, `hold_reason`, `hold_recorded`, `reader_principal_id`,
`trusted_next_action`, the three counts when they were recorded, and
the stewards. It does not include a fact body and it does not include
withheld counts. The head is immutable. This plane does not advance it
and does not reclassify it.

`nominate_agent_achpc_observation(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates that
observation. A null `utc_day`, a null `account_id`, a null consumer, or
a null perception code is **FULL SCAN REJECTED**. The access path is
`POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN` are
rejected.

### 3.4 Consumer perception card contract

`publish_agent_achpc_perception_card` is the only compile that writes a
consumer perception card. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one hold head for that key, with `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`, `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, `packet_scan_used = false`, and
  `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` (`TRUSTED_ENROLLED` is
  rejected);
- `perception_code` equal to the profile's `allowed_perception_code`,
  and `hold_code` equal to the head hold and the profile hold, each
  matching `^[a-z0-9:_-]{1,64}$` (one token, not a list and not a
  query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the hold head,
  and distinct from the consumer, from both perception stewards, from
  both hold stewards, and from every acknowledgement, reader-receipt,
  grant, citation, provider, effect, bind, provider-receipt, card,
  admission, attestation, synopsis, and publication steward;
- perception stewards distinct from each other and from those same
  principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That grain
holds one consumer perception card and therefore the one hold reader.
Projection is:

- `PERCEIVED` when the head hold class is `HELD`, `hold_recorded` is
  true, the hold reason is `ACKNOWLEDGED_OBSERVATION_HELD`, and the
  next action is `HOLD_ACKNOWLEDGED_OBSERVATION`. The card copies
  `sealed_count`, `denied_count`, and `unknown_effect_count`.
  `card_recorded` is true. `card_reason` is
  `HELD_OBSERVATION_PERCEIVED`. `trusted_next_action` is
  `PERCEIVE_HELD_OBSERVATION`. The action shows the three counts to
  that consumer for that one reader. It does not run the tool, it does
  not inline a fact body, and it does not open another nested expiry.
- `NOT_PERCEIVED` when the head next action is
  `STOP_ACKNOWLEDGEMENT_HOLD`. Counts stay null. `card_reason` is
  `NOT_HELD_OBSERVATION_CANNOT_PERCEIVE`. `card_recorded` is false.
  `trusted_next_action` is `STOP_HOLD_PERCEPTION`. The denied lag is
  copied and is not cleared.
- `NOT_PERCEIVED` when the head admission class is `UNKNOWN_EFFECT` or
  the next action is `OMIT_ACKNOWLEDGEMENT_HOLD`. Counts stay null.
  The card lag stays null. `card_reason` is
  `NOT_HELD_OBSERVATION_CANNOT_PERCEIVE`. `card_recorded` is false.
  `trusted_next_action` is `OMIT_HOLD_PERCEPTION`.

A `NOT_HELD` observation cannot be shown as received. The three counts
are copied only when `hold_recorded` is true. `card_body` rejects
`factBody`, `fact_body`, and `resolvedFactHash`. `ACKED` is copied as
`effect_observation` when the head observed it. It does not write
`TRUSTED_ENROLLED`. The hold head is not updated. A second card for the
same consumer and day is rejected. A reader other than the hold reader
is rejected, so this plane does not grant a second reader. A forged
perceived row whose counts differ from the head is rejected. A forged
perceived row on a `NOT_HELD` head is rejected. A forged non-card that
carries any count, or that sets `card_recorded`, is rejected. A
perception code other than the profile code is rejected before a row is
sealed, so the caller can retry the one allowed code. A null perception
code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_achpc_card_perception` for the
agent. Counts appear there only when `card_recorded` is true. The
perception names `perception_code`, the hold reader, and whether the
card was recorded. Card intents start as `PREPARED`. Provider silence
stays `UNKNOWN_EFFECT`. A card of the notify is not enrollment, not a
fact restore, not a tool execution, and not a second reader. This plane
does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads with
   `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null perception code, or a null
   `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one observation. The access path is
   `POINT_LOOKUP`. One observation shows its one reader.
4. The hold head is immutable. The card does not rewrite it and does
   not change its reader.
5. A successful card is recorded only from a `HELD` head whose hold
   reason is `ACKNOWLEDGED_OBSERVATION_HELD`, whose `hold_recorded` is
   true, and whose next action is `HOLD_ACKNOWLEDGED_OBSERVATION`, and
   only for the profile's single perception code and the hold reader.
6. `NOT_HELD` cards store null counts and `card_recorded = false`.
   Silence stores a null lag. A `NOT_HELD` observation cannot be shown
   as received. Counts are copied only when `hold_recorded` is true.
7. `ACKED` stays an effect observation. `AWAITING_CONFIRMATION` stays
   the key kind. `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`, and
   `executes_tool` stay false. The card does not execute the tool.
9. The reader equals the hold reader. The reader, the consumer, the
   perception stewards, the hold stewards, and the upstream stewards
   are pairwise distinct.
10. Semantic retrieval may rank profiles. It never publishes a card.
11. The engine does not call a model. Replay is a pure function of the
    hold head, the consumer id, the hold reader, and the profile
    perception code.

## 5. Execution model

```text
approved profile (one allowed_perception_code)
  -> open session (one observation budget, the hold reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read hold head by primary key
  -> require reader = hold reader
  -> project PERCEIVED or NOT_PERCEIVED
  -> append card + perception + audit
  -> leave the hold head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `PERCEIVE_HELD_OBSERVATION` for both cards. The class
on the card, not a second plane, distinguishes a recorded card from a
refusal. Notify dispatch is a later card intent and may remain
`UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one provider
   code, one citation code, one grant code, one receipt code, one
   acknowledgement code, one hold code, and one perception code, and
   add one dual-control perception rule.
2. Approve it through `agent_achpc_profile_authority`.
3. Export one hold head per consumer and day. The export is a point
   copy of the consumer-visible hold, not a packet walk.
4. Open a session and nominate one observation key.
5. Publish the profile perception code for the hold reader. Held
   observations copy the counts and seal `HELD_OBSERVATION_PERCEIVED`.
   Other observations seal a non-card with null counts.
6. The agent reads the perception row. A withheld perception has no
   count fields and `cardRecorded: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite cards already sealed.
8. This plane does not open another nested expiry. It does not run the
   tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type PerceptionCardId = string;
export type UtcDay = string;
export type PerceptionCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type HoldClass = "HELD" | "NOT_HELD";
export type HoldReason =
  | "ACKNOWLEDGED_OBSERVATION_HELD"
  | "NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD";
export type HoldNextAction =
  | "HOLD_ACKNOWLEDGED_OBSERVATION"
  | "STOP_ACKNOWLEDGEMENT_HOLD"
  | "OMIT_ACKNOWLEDGEMENT_HOLD";
export type CardClass = "PERCEIVED" | "NOT_PERCEIVED";
export type CardReason =
  | "HELD_OBSERVATION_PERCEIVED"
  | "NOT_HELD_OBSERVATION_CANNOT_PERCEIVE";
export type CardNextAction =
  | "PERCEIVE_HELD_OBSERVATION"
  | "STOP_HOLD_PERCEPTION"
  | "OMIT_HOLD_PERCEPTION";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const PERCEPTION_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface HoldHead {
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
  readonly acknowledgementCode: string;
  readonly holdCode: string;
  readonly admissionClass: AdmissionClass;
  readonly holdClass: HoldClass;
  readonly holdReason: HoldReason;
  readonly holdRecorded: boolean;
  readonly acknowledgementRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: HoldNextAction;
}

export interface ConsumerPerceptionCard {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly perceptionCardId: PerceptionCardId;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly receiptCode: string;
  readonly acknowledgementCode: string;
  readonly holdCode: string;
  readonly perceptionCode: PerceptionCode;
  readonly admissionClass: AdmissionClass;
  readonly holdClass: HoldClass;
  readonly cardClass: CardClass;
  readonly cardReason: CardReason;
  readonly holdRecorded: boolean;
  readonly cardRecorded: boolean;
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
  readonly trustedNextAction: CardNextAction;
}

export function projectConsumerPerceptionCard(
  head: HoldHead,
  perceptionCardId: PerceptionCardId,
  readerPrincipalId: PrincipalId,
  perceptionCode: PerceptionCode,
): ConsumerPerceptionCard {
  const readerIsHoldReader = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    perceptionCardId,
    consumerPrincipalId: head.consumerPrincipalId,
    readerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode: head.citationCode,
    grantCode: head.grantCode,
    receiptCode: head.receiptCode,
    acknowledgementCode: head.acknowledgementCode,
    holdCode: head.holdCode,
    perceptionCode,
    admissionClass: head.admissionClass,
    holdClass: head.holdClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = PERCEPTION_TOKEN.test(perceptionCode);

  if (
    readerIsHoldReader &&
    readerIsDistinct &&
    singleCode &&
    head.holdClass === "HELD" &&
    head.holdReason === "ACKNOWLEDGED_OBSERVATION_HELD" &&
    head.holdRecorded &&
    head.acknowledgementRecorded &&
    head.trustedNextAction === "HOLD_ACKNOWLEDGED_OBSERVATION" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      cardClass: "PERCEIVED",
      cardReason: "HELD_OBSERVATION_PERCEIVED",
      holdRecorded: true,
      cardRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "PERCEIVE_HELD_OBSERVATION",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_ACKNOWLEDGEMENT_HOLD";

  return {
    ...shared,
    holdClass: "NOT_HELD",
    holdRecorded: false,
    cardClass: "NOT_PERCEIVED",
    cardReason: "NOT_HELD_OBSERVATION_CANNOT_PERCEIVE",
    cardRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_HOLD_PERCEPTION" : "STOP_HOLD_PERCEPTION",
  };
}
```

```ts
export function perceptionOmitsUnshownObservation(
  card: ConsumerPerceptionCard,
): boolean {
  return (
    card.cardRecorded === false &&
    card.cardClass === "NOT_PERCEIVED" &&
    card.holdRecorded === false &&
    card.sealedCount === null &&
    card.deniedCount === null &&
    card.unknownEffectCount === null &&
    card.ackPromotedToTrust === false &&
    card.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    card.executesTool === false
  );
}
```

`projectConsumerPerceptionCard` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`. It never
copies counts off a hold whose `hold_recorded` is false. It never
executes the tool. A perception token that is not a single code, or a
reader other than the hold reader, projects to `NOT_PERCEIVED`. The
database additionally requires the token to equal the approved profile
perception code, requires the reader to equal the hold reader, and
rejects a reader who collides with the consumer or any steward, before
it seals `PERCEIVED`. A mismatched reader is rejected rather than
sealed, so the plane does not grant a second reader.

## 8. SQL row-store schema

```sql
CREATE TYPE achpc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE achpc_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE achpc_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE achpc_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE achpc_ack_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE achpc_ack_reason AS ENUM (
  'ISSUED_READER_RECEIPT_ACKNOWLEDGED',
  'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE'
);
CREATE TYPE achpc_hold_class AS ENUM ('HELD', 'NOT_HELD');
CREATE TYPE achpc_hold_reason AS ENUM (
  'ACKNOWLEDGED_OBSERVATION_HELD',
  'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
);
CREATE TYPE achpc_hold_next AS ENUM (
  'HOLD_ACKNOWLEDGED_OBSERVATION',
  'STOP_ACKNOWLEDGEMENT_HOLD',
  'OMIT_ACKNOWLEDGEMENT_HOLD'
);
CREATE TYPE achpc_card_class AS ENUM ('PERCEIVED', 'NOT_PERCEIVED');
CREATE TYPE achpc_card_reason AS ENUM (
  'HELD_OBSERVATION_PERCEIVED',
  'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
);
CREATE TYPE achpc_card_next AS ENUM (
  'PERCEIVE_HELD_OBSERVATION',
  'STOP_HOLD_PERCEPTION',
  'OMIT_HOLD_PERCEPTION'
);
CREATE TYPE achpc_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE achpc_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE achpc_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE achpc_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE achpc_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE achpc_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE achpc_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE achpc_compile_kind AS ENUM ('PERCEIVE_HELD_OBSERVATION');
CREATE TYPE achpc_terminal_kind AS ENUM (
  'CARD_RECORDED',
  'CARD_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE achpc_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_CARD',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_achpc_profile_authority NOLOGIN;

CREATE FUNCTION achpc_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_achpc_authorization_evidence (
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

CREATE TABLE agent_achpc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status achpc_profile_status NOT NULL,
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
  allowed_acknowledgement_code TEXT NOT NULL CHECK (allowed_acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_hold_code TEXT NOT NULL CHECK (allowed_hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_perception_code TEXT NOT NULL CHECK (allowed_perception_code ~ '^[a-z0-9:_-]{1,64}$'),
  perception_threshold INTEGER NOT NULL CHECK (perception_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy achpc_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_achpc_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_achpc_profile_perception_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes achpc_admission_class[] NOT NULL,
  perception_threshold INTEGER NOT NULL CHECK (perception_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  require_dual_control_perception BOOLEAN NOT NULL,
  perception_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_achpc_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_achpc_hold_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  consumer_hold_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  acknowledgement_code TEXT NOT NULL CHECK (acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  hold_code TEXT NOT NULL CHECK (hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class achpc_admission_class NOT NULL,
  acknowledgement_class achpc_ack_class NOT NULL,
  hold_class achpc_hold_class NOT NULL,
  acknowledgement_reason achpc_ack_reason NOT NULL,
  hold_reason achpc_hold_reason NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  freshness_class achpc_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation achpc_effect_observation NOT NULL,
  attested_key_kind achpc_key_kind NOT NULL,
  fact_disposition achpc_fact_disposition NOT NULL,
  body_visibility achpc_body_visibility NOT NULL,
  metadata_trust achpc_metadata_trust NOT NULL,
  access_path achpc_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action achpc_hold_next NOT NULL,
  hold_steward_a TEXT NOT NULL,
  hold_steward_b TEXT NOT NULL,
  acknowledgement_steward_a TEXT NOT NULL,
  acknowledgement_steward_b TEXT NOT NULL,
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
  hold_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, consumer_hold_id),
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
  CHECK (NOT (hold_body ? 'factBody')),
  CHECK (NOT (hold_body ? 'fact_body')),
  CHECK (NOT (hold_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_achpc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status achpc_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_perceive_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_perceive_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  perception_threshold INTEGER NOT NULL,
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
    REFERENCES agent_achpc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_achpc_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_achpc_observation_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path achpc_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id)
);

CREATE TABLE agent_achpc_observation_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  consumer_hold_id UUID NOT NULL,
  admission_class achpc_admission_class NOT NULL,
  hold_class achpc_hold_class NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_achpc_hold_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_achpc_card_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_code TEXT NOT NULL,
  admission_class achpc_admission_class NOT NULL,
  card_class achpc_card_class NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  card_hash TEXT NOT NULL CHECK (char_length(card_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_achpc_card_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  perception_code TEXT NOT NULL,
  hold_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  card_hash TEXT NOT NULL CHECK (char_length(card_hash) = 64),
  admission_class achpc_admission_class NOT NULL,
  hold_class achpc_hold_class NOT NULL,
  card_class achpc_card_class NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  hold_steward_a TEXT NOT NULL,
  hold_steward_b TEXT NOT NULL,
  acknowledgement_steward_a TEXT NOT NULL,
  acknowledgement_steward_b TEXT NOT NULL,
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
    REFERENCES agent_achpc_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_achpc_card_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_achpc_card_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_code TEXT NOT NULL,
  compile_kind achpc_compile_kind NOT NULL,
  admission_class achpc_admission_class NOT NULL,
  hold_class achpc_hold_class NOT NULL,
  card_class achpc_card_class NOT NULL,
  freshness_class achpc_freshness_class NOT NULL,
  effect_observation achpc_effect_observation NOT NULL,
  attested_key_kind achpc_key_kind NOT NULL,
  fact_disposition achpc_fact_disposition NOT NULL,
  body_visibility achpc_body_visibility NOT NULL,
  access_path achpc_access_path NOT NULL,
  metadata_trust achpc_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  card_hash TEXT NOT NULL CHECK (char_length(card_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_achpc_card_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_achpc_consumer_perception_card (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  perception_card_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  consumer_hold_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  acknowledgement_code TEXT NOT NULL CHECK (acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  hold_code TEXT NOT NULL CHECK (hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  perception_code TEXT NOT NULL CHECK (perception_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class achpc_admission_class NOT NULL,
  acknowledgement_class achpc_ack_class NOT NULL,
  hold_class achpc_hold_class NOT NULL,
  card_class achpc_card_class NOT NULL,
  hold_reason achpc_hold_reason NOT NULL,
  card_reason achpc_card_reason NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation achpc_effect_observation NOT NULL,
  attested_key_kind achpc_key_kind NOT NULL,
  fact_disposition achpc_fact_disposition NOT NULL,
  body_visibility achpc_body_visibility NOT NULL,
  metadata_trust achpc_metadata_trust NOT NULL,
  access_path achpc_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action achpc_card_next NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  hold_steward_a TEXT NOT NULL,
  hold_steward_b TEXT NOT NULL,
  card_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, perception_card_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_achpc_card_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_achpc_hold_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (card_body ? 'resolvedFactHash')),
  CHECK (
    (card_recorded = true AND card_class = 'PERCEIVED'
      AND hold_recorded = true AND hold_class = 'HELD'
      AND acknowledgement_recorded = true AND acknowledgement_class = 'ACKNOWLEDGED'
      AND trusted_next_action = 'PERCEIVE_HELD_OBSERVATION'
      AND card_reason = 'HELD_OBSERVATION_PERCEIVED'
      AND hold_reason = 'ACKNOWLEDGED_OBSERVATION_HELD'
      AND sealed_count IS NOT NULL
      AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL
      AND card_body ? 'sealedCount'
      AND card_body ? 'deniedCount'
      AND card_body ? 'unknownEffectCount')
    OR (card_recorded = false AND card_class = 'NOT_PERCEIVED'
      AND hold_recorded = false AND hold_class = 'NOT_HELD'
      AND acknowledgement_recorded = false AND acknowledgement_class = 'NOT_ACKNOWLEDGED'
      AND card_reason = 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
      AND hold_reason = 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
      AND trusted_next_action IN ('STOP_HOLD_PERCEPTION', 'OMIT_HOLD_PERCEPTION')
      AND sealed_count IS NULL
      AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND NOT (card_body ? 'sealedCount')
      AND NOT (card_body ? 'deniedCount')
      AND NOT (card_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_achpc_card_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_card_id UUID NOT NULL,
  perception_code TEXT NOT NULL,
  card_class achpc_card_class NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind achpc_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action achpc_card_next NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_achpc_consumer_perception_card (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_achpc_card_intent (
  account_id BIGINT NOT NULL,
  card_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status achpc_intent_status NOT NULL,
  card_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, card_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_achpc_card_certificate (account_id, certificate_id)
);

CREATE TABLE agent_achpc_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id)
);

CREATE TABLE agent_achpc_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind achpc_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id)
);

CREATE TABLE agent_achpc_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id)
);

CREATE TABLE agent_achpc_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_achpc_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_achpc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_achpc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_achpc_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_achpc_profile()
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
      IF current_setting('app.achpc_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.achpc_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_achpc_profile_protect
BEFORE INSERT OR UPDATE ON agent_achpc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_profile();

CREATE FUNCTION protect_agent_achpc_perception_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status achpc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_achpc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed perception rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_achpc_perception_rule_protect
BEFORE UPDATE ON agent_achpc_profile_perception_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_perception_rule();

CREATE FUNCTION protect_agent_achpc_hold_head()
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
     OR NEW.hold_body ? 'factBody'
     OR NEW.hold_body ? 'fact_body'
     OR NEW.hold_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NOT achpc_parties_are_distinct(ARRAY[
       NEW.reader_principal_id, NEW.consumer_principal_id,
       NEW.hold_steward_a, NEW.hold_steward_b,
       NEW.acknowledgement_steward_a, NEW.acknowledgement_steward_b,
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

  IF NEW.hold_class = 'HELD' OR NEW.hold_recorded THEN
    IF NEW.hold_recorded IS DISTINCT FROM TRUE
       OR NEW.hold_class IS DISTINCT FROM 'HELD'
       OR NEW.hold_reason IS DISTINCT FROM 'ACKNOWLEDGED_OBSERVATION_HELD'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_ACKNOWLEDGED_OBSERVATION'
       OR NEW.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR NEW.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
       OR NEW.receipt_issued IS DISTINCT FROM TRUE
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.hold_body ? 'sealedCount')
       OR NOT (NEW.hold_body ? 'deniedCount')
       OR NOT (NEW.hold_body ? 'unknownEffectCount') THEN
      RAISE EXCEPTION 'held observation head must carry the hold counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.hold_reason IS DISTINCT FROM 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
     OR NEW.hold_class IS DISTINCT FROM 'NOT_HELD'
     OR NEW.hold_recorded
     OR NEW.acknowledgement_recorded
     OR NEW.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
     OR NEW.acknowledgement_reason IS DISTINCT FROM 'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE'
     OR NEW.receipt_issued
     OR NEW.hold_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not held observation head cannot be shown as received';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_ACKNOWLEDGEMENT_HOLD' THEN
      RAISE EXCEPTION 'silence is not a perceived observation';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_ACKNOWLEDGEMENT_HOLD' THEN
      RAISE EXCEPTION 'denied hold head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'hold head class is not perceivable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_achpc_hold_head_protect
BEFORE INSERT OR UPDATE ON agent_achpc_hold_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_hold_head();

CREATE FUNCTION protect_agent_achpc_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.card_hash IS DISTINCT FROM NEW.card_hash
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

  IF NEW.card_class = 'PERCEIVED' AND NEW.card_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'perceived observation must copy the hold counts';
  END IF;

  IF NEW.card_class = 'NOT_PERCEIVED' AND NEW.card_recorded THEN
    RAISE EXCEPTION 'not held observation cannot be shown as received';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_achpc_decision_protect
BEFORE INSERT OR UPDATE ON agent_achpc_card_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_decision();

CREATE FUNCTION protect_agent_achpc_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT achpc_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.perception_steward_a, NEW.perception_steward_b,
    NEW.hold_steward_a, NEW.hold_steward_b,
    NEW.acknowledgement_steward_a, NEW.acknowledgement_steward_b,
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

CREATE TRIGGER agent_achpc_certificate_protect
BEFORE INSERT OR UPDATE ON agent_achpc_card_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_certificate();

CREATE FUNCTION protect_agent_achpc_card_intent()
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
     OR OLD.card_idempotency_key IS DISTINCT FROM NEW.card_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared card identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_achpc_card_intent_protect
BEFORE INSERT OR UPDATE ON agent_achpc_card_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_card_intent();

CREATE FUNCTION protect_agent_achpc_consumer_perception_card()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_card$
DECLARE
  v_head agent_achpc_hold_head%ROWTYPE;
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
     OR NEW.card_body ? 'factBody'
     OR NEW.card_body ? 'fact_body'
     OR NEW.card_body ? 'resolvedFactHash'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'card fence';
  END IF;

  IF NEW.perception_code IS NULL OR NEW.perception_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_achpc_hold_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the hold reader';
  END IF;

  IF NOT achpc_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.perception_steward_a, NEW.perception_steward_b,
    NEW.hold_steward_a, NEW.hold_steward_b,
    v_head.acknowledgement_steward_a, v_head.acknowledgement_steward_b,
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

  IF NEW.hold_steward_a IS DISTINCT FROM v_head.hold_steward_a
     OR NEW.hold_steward_b IS DISTINCT FROM v_head.hold_steward_b
     OR NEW.consumer_hold_id IS DISTINCT FROM v_head.consumer_hold_id THEN
    RAISE EXCEPTION 'card must cite the sealed hold';
  END IF;

  IF NEW.card_class = 'PERCEIVED' OR NEW.card_recorded THEN
    IF v_head.hold_class IS DISTINCT FROM 'HELD'
       OR v_head.hold_recorded IS DISTINCT FROM TRUE
       OR v_head.hold_reason IS DISTINCT FROM 'ACKNOWLEDGED_OBSERVATION_HELD'
       OR v_head.trusted_next_action IS DISTINCT FROM 'HOLD_ACKNOWLEDGED_OBSERVATION' THEN
      RAISE EXCEPTION 'not held observation cannot be shown as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.card_reason IS DISTINCT FROM 'HELD_OBSERVATION_PERCEIVED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'PERCEIVE_HELD_OBSERVATION'
       OR NEW.hold_recorded IS DISTINCT FROM TRUE
       OR NEW.card_class IS DISTINCT FROM 'PERCEIVED' THEN
      RAISE EXCEPTION 'perceived observation must copy the hold counts';
    END IF;
  ELSE
    IF v_head.hold_class IS DISTINCT FROM 'NOT_HELD'
       OR v_head.hold_recorded THEN
      RAISE EXCEPTION 'held observation must show the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.card_body ? 'sealedCount'
       OR NEW.card_recorded
       OR NEW.hold_recorded
       OR NEW.card_reason IS DISTINCT FROM 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE' THEN
      RAISE EXCEPTION 'not held observation cannot be shown as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_ACKNOWLEDGEMENT_HOLD' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_HOLD_PERCEPTION' THEN
        RAISE EXCEPTION 'silence cannot be shown as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_HOLD_PERCEPTION'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused card must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_acknowledgement_code, p.allowed_hold_code, p.allowed_perception_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt,
         v_ack, v_hold, v_perception
  FROM agent_achpc_session AS s
  JOIN agent_achpc_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_perception IS NULL
     OR NEW.perception_code IS DISTINCT FROM v_perception
     OR NEW.hold_code IS DISTINCT FROM v_hold
     OR NEW.acknowledgement_code IS DISTINCT FROM v_ack
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
     OR NEW.acknowledgement_code IS DISTINCT FROM v_head.acknowledgement_code
     OR NEW.hold_code IS DISTINCT FROM v_head.hold_code THEN
    RAISE EXCEPTION 'perception code is not the profile perception';
  END IF;

  RETURN NEW;
END
$protect_card$;

CREATE TRIGGER agent_achpc_consumer_perception_card_protect
BEFORE INSERT OR UPDATE ON agent_achpc_consumer_perception_card
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_consumer_perception_card();

CREATE FUNCTION protect_agent_achpc_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed card perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.card_class = 'NOT_PERCEIVED'
     AND (NEW.card_recorded
          OR NEW.hold_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not perceived card cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_achpc_perception_protect
BEFORE INSERT OR UPDATE ON agent_achpc_card_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_achpc_perception();

CREATE FUNCTION approve_agent_achpc_profile(
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
  stored_status achpc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_achpc_profile
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
  FROM agent_achpc_profile_perception_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_perception IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control perception rule';
  END IF;

  PERFORM set_config(
    'app.achpc_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_achpc_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_achpc_profile(
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
  stored_status achpc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_achpc_profile
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
    'app.achpc_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_achpc_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_achpc_observation(
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
  v_session_status achpc_session_status;
  v_profile_status achpc_profile_status;
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
    FROM agent_achpc_observation_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one observation per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_achpc_session AS s
  JOIN agent_achpc_profile AS pr
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

  INSERT INTO agent_achpc_observation_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION publish_agent_achpc_perception_card(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_perception_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_card_id UUID,
  p_card_digest TEXT,
  p_perception_steward_a TEXT,
  p_perception_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status achpc_session_status;
  v_profile_status achpc_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_allowed_ack TEXT;
  v_allowed_hold TEXT;
  v_allowed_perception TEXT;
  v_principal TEXT;
  v_head agent_achpc_hold_head%ROWTYPE;
  v_card_class achpc_card_class;
  v_hold_class achpc_hold_class;
  v_ack_class achpc_ack_class;
  v_reason achpc_card_reason;
  v_hold_reason achpc_hold_reason;
  v_recorded BOOLEAN;
  v_hold_recorded BOOLEAN;
  v_ack_recorded BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next achpc_card_next;
  v_terminal achpc_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_perception_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_card_digest) <> 64 THEN
    RAISE EXCEPTION 'card digest must be 64 hex characters';
  END IF;

  IF p_perception_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_achpc_observation_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'card requires a nominated observation point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, pr.allowed_acknowledgement_code, pr.allowed_hold_code,
         pr.allowed_perception_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_ack, v_allowed_hold, v_allowed_perception, v_principal
  FROM agent_achpc_session AS s
  JOIN agent_achpc_profile AS pr
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

  IF p_perception_code IS DISTINCT FROM v_allowed_perception THEN
    RAISE EXCEPTION 'perception code is not the profile perception';
  END IF;

  SELECT * INTO v_head
  FROM agent_achpc_hold_head
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
     OR v_head.acknowledgement_code IS DISTINCT FROM v_allowed_ack
     OR v_head.hold_code IS DISTINCT FROM v_allowed_hold THEN
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
     OR v_head.hold_body ? 'factBody'
     OR v_head.hold_body ? 'fact_body'
     OR v_head.hold_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'card fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT achpc_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_perception_steward_a, p_perception_steward_b,
       v_head.hold_steward_a, v_head.hold_steward_b,
       v_head.acknowledgement_steward_a, v_head.acknowledgement_steward_b,
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
    FROM agent_achpc_consumer_perception_card
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'consumer perception card already recorded';
  END IF;

  IF v_head.hold_class = 'HELD'
     AND v_head.hold_reason = 'ACKNOWLEDGED_OBSERVATION_HELD'
     AND v_head.hold_recorded
     AND v_head.acknowledgement_recorded
     AND v_head.acknowledgement_class = 'ACKNOWLEDGED'
     AND v_head.acknowledgement_reason = 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
     AND v_head.receipt_issued
     AND v_head.trusted_next_action = 'HOLD_ACKNOWLEDGED_OBSERVATION'
     AND v_head.admission_class = 'ADMITTED' THEN
    v_card_class := 'PERCEIVED';
    v_hold_class := 'HELD';
    v_ack_class := 'ACKNOWLEDGED';
    v_reason := 'HELD_OBSERVATION_PERCEIVED';
    v_hold_reason := 'ACKNOWLEDGED_OBSERVATION_HELD';
    v_recorded := true;
    v_hold_recorded := true;
    v_ack_recorded := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'PERCEIVE_HELD_OBSERVATION';
    v_terminal := 'CARD_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_ACKNOWLEDGEMENT_HOLD' THEN
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_ack_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_hold_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_recorded := false;
    v_hold_recorded := false;
    v_ack_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_HOLD_PERCEPTION';
    v_terminal := 'CARD_REFUSED';
  ELSE
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_ack_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_hold_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_recorded := false;
    v_hold_recorded := false;
    v_ack_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_HOLD_PERCEPTION';
    v_terminal := 'CARD_REFUSED';
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
    'acknowledgementCode', v_head.acknowledgement_code,
    'holdCode', v_head.hold_code,
    'perceptionCode', p_perception_code,
    'admissionClass', v_head.admission_class,
    'holdClass', v_hold_class,
    'cardClass', v_card_class,
    'cardReason', v_reason,
    'holdRecorded', v_hold_recorded,
    'cardRecorded', v_recorded,
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
  IF v_recorded THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_achpc_observation_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, consumer_hold_id, admission_class, hold_class,
    hold_recorded, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.consumer_hold_id, v_head.admission_class,
    v_head.hold_class, v_head.hold_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_achpc_card_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, perception_code, admission_class, card_class,
    card_recorded, card_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_perception_code, v_head.admission_class, v_card_class,
    v_recorded, p_card_digest, clock_timestamp()
  );

  INSERT INTO agent_achpc_card_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, perception_code, hold_code, provider_code,
    card_hash, admission_class, hold_class, card_class, card_recorded,
    perception_steward_a, perception_steward_b,
    hold_steward_a, hold_steward_b,
    acknowledgement_steward_a, acknowledgement_steward_b,
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
    p_reader_principal, p_utc_day, p_perception_code, v_head.hold_code,
    v_head.provider_code, p_card_digest, v_head.admission_class, v_hold_class,
    v_card_class, v_recorded,
    p_perception_steward_a, p_perception_steward_b,
    v_head.hold_steward_a, v_head.hold_steward_b,
    v_head.acknowledgement_steward_a, v_head.acknowledgement_steward_b,
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

  INSERT INTO agent_achpc_card_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, perception_code, compile_kind,
    admission_class, hold_class, card_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    card_recorded, executes_tool, lag_publications, max_lag_budget, card_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_perception_code,
    'PERCEIVE_HELD_OBSERVATION',
    v_head.admission_class, v_hold_class, v_card_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_recorded, false, v_lag, v_head.max_lag_budget, p_card_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_achpc_consumer_perception_card (
    account_id, utc_day, consumer_principal_id, perception_card_id, session_id,
    certificate_id, consumer_hold_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, acknowledgement_code,
    hold_code, perception_code, admission_class, acknowledgement_class, hold_class,
    card_class, hold_reason, card_reason, acknowledgement_recorded, hold_recorded,
    card_recorded, sealed_count, denied_count, unknown_effect_count, lag_publications,
    max_lag_budget, effect_observation, attested_key_kind, fact_disposition,
    body_visibility, metadata_trust, access_path, inlines_fact_body, opens_nested_expiry,
    ack_promoted_to_trust, packet_scan_used, executes_tool, trusted_next_action,
    perception_steward_a, perception_steward_b, hold_steward_a, hold_steward_b,
    card_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_card_id, p_session_id,
    p_certificate_id, v_head.consumer_hold_id, p_reader_principal,
    v_head.purpose_code, v_head.effect_code, v_head.provider_code, v_head.citation_code,
    v_head.grant_code, v_head.receipt_code, v_head.acknowledgement_code, v_head.hold_code,
    p_perception_code, v_head.admission_class, v_ack_class, v_hold_class, v_card_class,
    v_hold_reason, v_reason, v_ack_recorded, v_hold_recorded, v_recorded,
    v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false, v_next,
    p_perception_steward_a, p_perception_steward_b, v_head.hold_steward_a,
    v_head.hold_steward_b, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_achpc_card_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, perception_card_id,
    perception_code, card_class, hold_recorded, card_recorded, sealed_count, denied_count,
    unknown_effect_count, attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_card_id,
    p_perception_code, v_card_class, v_hold_recorded, v_recorded, v_sealed, v_denied,
    v_unknown, 'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_achpc_card_intent (
    account_id, card_intent_id, session_id, certificate_id, intent_status,
    card_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_card_id, p_session_id, p_certificate_id, 'PREPARED',
    p_card_id::TEXT, 1, p_card_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_achpc_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_card_id, p_session_id, 'PERCEIVE', 1, clock_timestamp()
  );

  INSERT INTO agent_achpc_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_achpc_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'HOLD_PERCEPTION_CARD_SEALED',
    p_card_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_achpc_session
  SET consumed_perceive_units = consumed_perceive_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$publish$;

CREATE FUNCTION reject_agent_achpc_unscoped_scan(
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

ALTER FUNCTION approve_agent_achpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_achpc_profile_authority;
ALTER FUNCTION revoke_agent_achpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_achpc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_achpc_profile_authority;
GRANT SELECT ON
  agent_achpc_profile,
  agent_achpc_profile_perception_rule
TO agent_achpc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_achpc_profile TO agent_achpc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_achpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_achpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_achpc_profile FROM PUBLIC;

CREATE INDEX agent_achpc_session_work_idx ON agent_achpc_session (
  account_id,
  status
);
CREATE INDEX agent_achpc_session_profile_idx ON agent_achpc_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_achpc_head_consumer_idx ON agent_achpc_hold_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_achpc_nomination_session_idx ON agent_achpc_observation_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_achpc_certificate_session_idx ON agent_achpc_card_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_achpc_decision_cert_idx ON agent_achpc_card_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_achpc_card_consumer_idx ON agent_achpc_consumer_perception_card (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_achpc_card_reader_idx ON agent_achpc_consumer_perception_card (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_achpc_perception_day_idx ON agent_achpc_card_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_achpc_intent_work_idx ON agent_achpc_card_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_achpc_audit_time_idx ON agent_achpc_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_achpc_command_expiry_idx ON agent_achpc_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_achpc_checkpoint_day_idx ON agent_achpc_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_achpc_binding_day_idx ON agent_achpc_observation_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_achpc_authorization_evidence',
    'agent_achpc_profile',
    'agent_achpc_profile_perception_rule',
    'agent_achpc_hold_head',
    'agent_achpc_session',
    'agent_achpc_observation_nomination',
    'agent_achpc_observation_binding',
    'agent_achpc_card_compile',
    'agent_achpc_card_certificate',
    'agent_achpc_card_decision',
    'agent_achpc_consumer_perception_card',
    'agent_achpc_card_perception',
    'agent_achpc_card_intent',
    'agent_achpc_budget_ledger',
    'agent_achpc_terminal_record',
    'agent_achpc_command_result',
    'agent_achpc_audit_head',
    'agent_achpc_audit_event',
    'agent_achpc_audit_anchor',
    'agent_achpc_projection_checkpoint'
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
triggers. A successful card on a `NOT_HELD` observation, a trusted key,
a packet scan, a fact body, a tool execution flag, or a nested expiry
flag is rejected. The hold head cannot be updated to launder a refused
hold into a shown card. A reader other than the hold reader is
rejected, so the insert does not grant a second reader.

The reference check executes this schema fence, including
`achpc_session_status`, the triggers, and
`publish_agent_achpc_perception_card`, as one database session.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AchpcAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AchpcHoldClass {
  HELD
  NOT_HELD
}

enum AchpcCardClass {
  PERCEIVED
  NOT_PERCEIVED
}

enum AchpcCardReason {
  HELD_OBSERVATION_PERCEIVED
  NOT_HELD_OBSERVATION_CANNOT_PERCEIVE
}

enum AchpcNextAction {
  PERCEIVE_HELD_OBSERVATION
  STOP_HOLD_PERCEPTION
  OMIT_HOLD_PERCEPTION
}

enum AchpcKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AchpcProfile {
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
  allowedAcknowledgementCode: String!
  allowedHoldCode: String!
  allowedPerceptionCode: String!
  procedureRef: String!
}

type AchpcSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerObservation: Int!
}

type AchpcHoldHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  holdClass: AchpcHoldClass!
  holdRecorded: Boolean!
  attestedKeyKind: AchpcKeyKind!
}

type AchpcConsumerPerceptionCard {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  perceptionCardId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  grantCode: String!
  receiptCode: String!
  acknowledgementCode: String!
  holdCode: String!
  perceptionCode: String!
  admissionClass: AchpcAdmissionClass!
  holdClass: AchpcHoldClass!
  cardClass: AchpcCardClass!
  cardReason: AchpcCardReason!
  holdRecorded: Boolean!
  cardRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AchpcKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AchpcNextAction!
}

type AchpcCardPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  perceptionCode: String!
  cardRecorded: Boolean!
  perceptionBody: JSON!
}

type AchpcAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAchpcProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AchpcProfile
  agentAchpcSession(accountId: ID!, sessionId: ID!): AchpcSession
  agentAchpcHoldHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AchpcHoldHead
  agentAchpcConsumerPerceptionCard(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AchpcConsumerPerceptionCard
  agentAchpcCardPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AchpcCardPerception
  agentAchpcAuditEvents(accountId: ID!, utcDay: String!): [AchpcAuditEvent!]!
}

type Mutation {
  createAgentAchpcProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AchpcProfile!
  approveAgentAchpcProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AchpcProfile!
  revokeAgentAchpcProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AchpcProfile!
  openAgentAchpcSession(accountId: ID!, sessionId: ID!, profileId: ID!): AchpcSession!
  nominateAgentAchpcObservation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  publishAgentAchpcPerceptionCard(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    perceptionCode: String!
  ): AchpcConsumerPerceptionCard!
  appendAgentAchpcCardIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAchpcAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Observation and card reads also take a
non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool. Resolvers
must call `reject_agent_achpc_unscoped_scan` before planning when
either the account or the observation key is missing. A card read is
one primary-key lookup. It does not join a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-hold-perception-card`. The
instruction payload on the perception rule is deterministic JSON:

- point-look up one hold by
  `(account_id, utc_day, consumer_principal_id)`;
- publish the single `allowed_perception_code` for the hold reader only
  when `hold_recorded` is true, the hold reason is
  `ACKNOWLEDGED_OBSERVATION_HELD`, and the next action is
  `HOLD_ACKNOWLEDGED_OBSERVATION`;
- otherwise seal `NOT_HELD_OBSERVATION_CANNOT_PERCEIVE` with null
  counts;
- never execute the tool inside the card;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
perception code, and the hold reader. It may not rewrite the
instruction by chatting with the engine. Changing the perception code
is a new profile version that stays `DRAFT` until the authority fence
approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single
perception code. Queries must filter `account_id` before topK. A global
ANN index would mix tenants and is rejected. The reference schema does
not build an HNSW index.

```sql
CREATE TABLE agent_achpc_profile_embedding (
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
    REFERENCES agent_achpc_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_achpc_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_achpc_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_achpc_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one observation, and publishes that profile's one perception
code for the hold reader. Discovery never writes
`agent_achpc_consumer_perception_card`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the hold `reader_principal_id` and the one `perception_code`;
- `cardRecorded` true only when the three counts are present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on a
  perceived observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`PERCEIVE_HELD_OBSERVATION` as permission to execute the tool or to
enroll the key. `ACKED` on the upstream effect stays an observation.
It is not this card, and it is not trust.

## 13. ACID and consistency

The publish function is one transaction. Binding, compile, certificate,
decision, card, perception, intent, budget, terminal, and audit commit
together or not at all. The hold head is not updated. Isolation is the
tenant RLS predicate on `account_id`. Durability is the hash-chained
audit event `HOLD_PERCEPTION_CARD_SEALED`.

Consistency beats a faster but lossy fan-out. A card that copied counts
from a `NOT_HELD` observation would be a durable lie. The engine would
rather seal `NOT_PERCEIVED` with null counts than reconstruct a reader
list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null perception code is
  **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected access
  paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one observation. A second nomination is
  rejected.
- The card does not execute the tool, does not call the provider, and
  does not open another nested expiry.
- A reader other than the hold reader is rejected, which keeps one
  noisy agent from showing every principal in the account.
- Budgets cap perceive, vector, and notify units so a retry loop cannot
  spend a neighbor's latency.
- Semantic topK is account-filtered and cannot publish a card.

These guards keep the 99.99% availability target. An autonomous agent
cannot turn one card into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The card path does not read a board. It reads one primary key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve the
path lead with `account_id`. There is no predicate that scans every
item on a board, every context packet, or every reader in the account.

Any plan that lacks both `account_id` and the observation key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this plane.
The columnar synopsis stays upstream. This plane does not re-aggregate
it.

## 16. Auditability and replay

Each seal appends `agent_achpc_audit_event` with
`event_kind = HOLD_PERCEPTION_CARD_SEALED`, a 64-character event hash,
and a previous hash. Replay reads the hold head and the profile
perception code and must reproduce `card_class`, `card_reason`, the
reader, and the three counts or their absence. Replay does not call a
model. The hold head and the card row are immutable after insert, so a
later agent cannot edit history to make a refused hold look perceived.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the hold
  reader. The function rejects the call. The hold head reader stays
  unchanged.
- **Forged card on a refused hold:** the trigger reads the head by
  primary key and rejects `card_recorded` when `hold_recorded` is
  false.
- **Count laundering:** a perceived row whose counts differ from the
  head is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The card is not
  a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash` are
  rejected on the head and on the card.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane does
  not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are rejected.
- **Steward reuse:** perception stewards must be distinct from the
  reader, the consumer, the hold stewards, and every upstream steward.
- **Cross-tenant read:** forced RLS hides every row whose `account_id`
  does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is rejected.
  Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the card transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The card transaction performs one primary-key read and a fixed set of
  primary-key writes. It has no board fan-out.
- Counters: cards recorded, cards refused, full-scan rejects,
  steward-reuse rejects, second-reader rejects, and tool-execution
  rejects.
- A recorded card with null counts, or a refused card with any count,
  is a correctness page.
- A hold-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing cards.
2. Export hold heads for one canary account by primary key. Confirm
   heads are immutable and tenant-scoped.
3. Enable `publish_agent_achpc_perception_card` for that account.
   Compare recorded counts to the hold head.
4. Watch full-scan rejects and second-reader rejects. A spike means an
   agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW index.
   Do not enable tool execution inside the card.

Revocation stops new sessions. It does not rewrite sealed cards.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one card for a held head with counts 1/1/1 and
  lag 3 inside budget 5, leaves that head unchanged, and seals
  `HELD_OBSERVATION_PERCEIVED` for `principal:reader-1`.
- A not-held head with lag 8 keeps null counts,
  `NOT_HELD_OBSERVATION_CANNOT_PERCEIVE`, and the denied lag.
- Silence seals `NOT_PERCEIVED` with a null lag and null counts.
- A null day, a second nomination, a foreign perception code, a fact
  body, a nested expiry, a packet scan, steward reuse, a card on a
  not-held observation, a reader equal to the consumer, counts that
  differ from the head, an ack promoted to trust, tool execution, a
  mutated head, a mutated card, a profile inserted as approved, a
  second reader, and an unscoped scan are rejected.
- `npm audit` reports no vulnerabilities in the validation toolchain.

## 21. Product decision

Ship the consumer perception card as a deterministic point lookup of an
already sealed hold. The card copies the three counts only when
`hold_recorded` is true, names only the hold reader, and leaves the
hold head unchanged. `ACKED` is not trust. The tool does not run. The
plane does not open another nested expiry.

The next increment should record one agent perception binding of one
already `PERCEIVED` card by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_PERCEIVED` card
cannot be bound as received. The binding copies the three counts only
when `card_recorded` is true. The reader on the binding must equal the
card reader and stay distinct from the consumer and every steward. The
binding must not scan context packets, must not inline a fact body,
must not promote `ACKED` to `TRUSTED_ENROLLED`, must not execute the
tool, must not grant a second reader, and must not open another nested
expiry plane.
