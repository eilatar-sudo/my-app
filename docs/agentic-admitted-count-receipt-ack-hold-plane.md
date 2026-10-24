# mondayDB Agentic Admitted Count Receipt-Ack Hold Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-24.v1`

## 1. Why this plane, before how

The 2026-10-23 Admitted Count Receipt Acknowledgement Plane publishes one
receipt acknowledgement for one already sealed binding receipt. The grain
is `(account_id, utc_day, consumer_principal_id)`. An `ACKNOWLEDGED`
acknowledgement copies the three counts, names exactly the acknowledgement
reader, and seals `RECEIPTED_RECEIPT_ACKNOWLEDGED` with next action
`ACKNOWLEDGE_RECEIPTED_RECEIPT`. A `NOT_ACKNOWLEDGED` acknowledgement seals
`NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE` with null counts. That plane does
not record a consumer-visible hold of the acknowledgement.

Without this plane an agent either:

- treats `ACKNOWLEDGE_RECEIPTED_RECEIPT` itself as proof the runtime held
  the three counts, or
- walks context packets, tool logs, or a board with 1M+ rows to invent a
  hold (neighbor-harmful, and a miss against the 99.99% availability
  target).

The product trade-off is **hold honesty versus acknowledgement isolation**,
and **hold latency versus a second reader**:

- Honesty: the consumer named on an `ACKNOWLEDGED` acknowledgement should
  have one receipt-ack hold that copies the three counts already on that
  acknowledgement, without opening the acknowledgement again.
- Isolation: the database does not call the provider and does not execute
  the tool. Recording the hold is a deterministic seal. A probabilistic
  agent stays outside the engine, so a slow or recursive tool cannot spend
  neighbor latency inside the ACID path.
- Least privilege: a `NOT_ACKNOWLEDGED` acknowledgement cannot be held as
  received. The hold names the acknowledgement reader and no one else. A
  second reader is a new request, and this plane rejects it.
- The acknowledgement head is not rewritten. Replay of the acknowledgement
  stays stable. The hold is a new row that cites the acknowledgement by
  primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does not
  promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the hold is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key write
of that same grain. Consistency is the sealed hold plus the
acknowledgement id it cites. Neighbor availability stays at the 99.99%
target because an unscoped day walk, a reader list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved hold profile is procedural memory for "how one already
   sealed acknowledgement becomes a single receipt-ack hold." The profile
   names exactly one receipt-ack-hold code and the one
   receipt-acknowledgement code that hold may cite. A profile never
   inlines a fact body, never rewrites `ACKED` as `TRUSTED_ENROLLED`, and
   never opens another nested expiry plane.
2. A session nominates exactly one observation key. The hold then reads
   `agent_acrh_acknowledgement_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB records a hold only when the head is `ACKNOWLEDGED`,
   `acknowledgement_recorded` is true, the acknowledgement reason is
   `RECEIPTED_RECEIPT_ACKNOWLEDGED`, the next action is
   `ACKNOWLEDGE_RECEIPTED_RECEIPT`, and the requested reader equals the
   acknowledgement reader. The copy of the three counts is equality with
   the acknowledgement. It does not call a model and it does not execute
   the tool.
4. `NOT_ACKNOWLEDGED` seals `NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD`
   with `ack_hold_recorded = false` and null counts. Silence keeps a null
   lag. There is no hold that shows the acknowledgement as received.
5. The reader equals the acknowledgement reader and is distinct from the
   consumer and from every steward, including the two receipt-ack-hold
   stewards and the two receipt-acknowledgement stewards. Two
   receipt-ack-hold stewards witness the hold. They are distinct from the
   consumer, from the reader, from the receipt-acknowledgement stewards,
   and from the binding-receipt, binding, perception, hold,
   acknowledgement, reader-receipt, grant, citation, provider, effect,
   bind, provider-receipt, card, admission, attestation, synopsis, and
   publication stewards.
6. Unscoped observation or board scans are **FULL SCAN REJECTED** before
   planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the nomination and the
  receipt-ack hold?
- Was the hold a point lookup of an already sealed acknowledgement, and
  what class did that acknowledgement have?
- Did an `ACKNOWLEDGED` acknowledgement hold exactly its one reader and
  seal `ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD` with the three acknowledgement
  counts?
- Did a `NOT_ACKNOWLEDGED` acknowledgement stay unheld, with null counts
  and `NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the acknowledgement head keep the class, the reader, and the counts
  it was exported with?
- Can the hold be replayed without invoking an LLM, and without executing
  the tool?

HNSW profile discovery stays account-scoped and never records this hold.

## 2. Scope and ownership

The Admitted Count Receipt-Ack Hold Plane owns:

1. Immutable approved hold profiles as procedural memory, each naming one
   receipt-ack-hold code for one receipt-acknowledgement code.
2. Tenant-scoped hold sessions with a hard cap of one nominated
   observation and the one reader already on that acknowledgement.
3. Deterministic nomination of that observation, then one point lookup of
   the acknowledgement head.
4. A receipt-ack hold keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the
   acknowledgement `reader_principal_id`.
5. An agent perception row that carries counts only when
   `ack_hold_recorded` is true, which is only when
   `acknowledgement_recorded` is true.
6. Audit events that cite the hold hash.

It integrates with, but does not replace:

- the receipt acknowledgement plane, which remains the exporter of
  `agent_acrh_acknowledgement_head`;
- the upstream receipt, binding, card, and hold seals, which stay
  historical attributes on that head;
- Open API GraphQL, which is the only supported read and write surface
  for this plane;
- account-scoped pgvector discovery of approved profiles.

### Non-goals

- Opening another nested expiry plane.
- Executing the tool, calling the provider, or promoting `ACKED` to
  `TRUSTED_ENROLLED`.
- Inlining a fact body or scanning context packets.
- Granting a second reader.
- Rewriting the acknowledgement head.
- A full scan of a board with 1M+ rows.

## 3. Product contract

### 3.1 Hold profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the acknowledgement must already
  carry (one token, no list);
- the single `allowed_effect_code` the head must already carry (one
  token, no list);
- the single `allowed_provider_code` the head must already carry (one
  token, no list);
- the single `allowed_citation_code` the head must already carry (one
  token, no list);
- the single `allowed_grant_code` the head must already carry (one token,
  no list);
- the single `allowed_receipt_code` the head must already carry (one
  token, no list);
- the single `allowed_hold_code` the head must already carry (one token,
  no list);
- the single `allowed_perception_code` the head must already carry (one
  token, no list);
- the single `allowed_binding_code` the head must already carry (one
  token, no list);
- the single `allowed_binding_receipt_code` the head must already carry
  (one token, no list);
- the single `allowed_receipt_acknowledgement_code` the head must already
  carry (one token, no list);
- the single `allowed_receipt_ack_hold_code` this plane may seal (one
  token, no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- hold threshold (distinct receipt-ack-hold stewards, minimum 2), max
  observations per session (exactly 1), max nominated observations
  (exactly 1), and max readers per observation (exactly 1);
- hold policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `HOLD_NEVER_EXECUTES_TOOL`, `HOLD_NEVER_INLINES_BODY`,
  `HOLD_NEVER_CONFIRMS`, `ONE_OBSERVATION_PER_SESSION`,
  `ONE_HOLD_PER_OBSERVATION`, `ACKNOWLEDGEMENT_READER_ONLY`,
  `POINT_LOOKUP_ONLY`, `ACKNOWLEDGED_ACKNOWLEDGEMENT_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `COUNTS_ONLY_WHEN_ACKNOWLEDGEMENT_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_ACK_HOLD`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so PostgreSQL can
store it as an enum label.

### 3.2 Session and budget contract

A session is opened against one approved profile version. It nominates
exactly one observation. The reader budget is exactly one, and that
reader must already be the acknowledgement reader. Nominate, hold,
vector, and notify budgets are integers reserved before the hold runs. A
refused hold still consumes one hold unit, because the refusal is a
sealed row, not a retry loop. Provider silence stays `UNKNOWN_EFFECT`
and is not retried inside the hold transaction.

### 3.3 Acknowledgement head and nomination contract

Exporters insert `agent_acrh_acknowledgement_head` by primary key. The
export is a point copy of one sealed receipt acknowledgement. It is not a
packet walk and it is not a board scan. The head is immutable after
insert. `access_path` is `POINT_LOOKUP`. `inlines_fact_body`,
`opens_nested_expiry`, `ack_promoted_to_trust`, `packet_scan_used`, and
`executes_tool` are false. `attested_key_kind` is
`AWAITING_CONFIRMATION`. `body_visibility` is `OMITTED`. The body rejects
`factBody`, `fact_body`, and `resolvedFactHash`.

An `ACKNOWLEDGED` head carries `acknowledgement_recorded = true`, reason
`RECEIPTED_RECEIPT_ACKNOWLEDGED`, next action
`ACKNOWLEDGE_RECEIPTED_RECEIPT`, receipt reason
`BOUND_BINDING_RECEIPTED`, and the three counts. A `NOT_ACKNOWLEDGED`
head carries null counts and
`NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE`. A stop keeps the denied lag
above the budget and next action
`STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT`. Silence keeps a null lag and
next action `OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT`.

Nomination stores the same
`(account_id, utc_day, consumer_principal_id)` the hold will read. A
null day, a null consumer, or a null account is **FULL SCAN REJECTED**.
A second nomination in the same session is rejected.

### 3.4 Receipt-ack hold contract

`record_agent_acrh_receipt_ack_hold` is the only compile that writes a
receipt-ack hold. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one acknowledgement head for that key, with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` (`TRUSTED_ENROLLED` is
  rejected);
- `receipt_ack_hold_code` equal to the profile's
  `allowed_receipt_ack_hold_code`, and `receipt_acknowledgement_code`
  equal to the head acknowledgement code and the profile
  acknowledgement code, each matching `^[a-z0-9:_-]{1,64}$` (one token,
  not a list and not a query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the
  acknowledgement;
- two receipt-ack-hold stewards distinct from the reader, the consumer,
  the receipt-acknowledgement stewards, and every upstream steward.

When the head is `ACKNOWLEDGED`, `acknowledgement_recorded` is true, the
reason is `RECEIPTED_RECEIPT_ACKNOWLEDGED`, the next action is
`ACKNOWLEDGE_RECEIPTED_RECEIPT`, and the admission class is `ADMITTED`,
the hold seals `ACK_HELD` / `ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD` /
`HOLD_ACKNOWLEDGED_RECEIPT` and copies `sealed_count`, `denied_count`,
and `unknown_effect_count`. Otherwise `ack_hold_recorded` is false, the
three counts are null, and the reason is
`NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD`. Silence
(`UNKNOWN_EFFECT` or `OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT`) uses a null
lag and next action `OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD`. Any other
refusal keeps the head lag and uses
`STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD`.

The hold does not open another nested expiry. It does not execute the
tool. It does not grant a second reader. It does not rewrite the
acknowledgement head.

### 3.5 Perception and notify contract

The same transaction writes `agent_acrh_acknowledgement_perception` for
the agent. Counts appear there only when `ack_hold_recorded` is true,
which requires `acknowledgement_recorded`. The perception names
`receipt_ack_hold_code`, the acknowledgement reader, and whether the
hold was recorded. Hold intents start as `PREPARED`. Provider silence
stays `UNKNOWN_EFFECT`. An acknowledgement of the notify is not
enrollment, not a fact restore, not a tool execution, and not a second
reader. This plane does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads with
   `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null receipt-ack-hold code, or
   a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one observation. The access path is
   `POINT_LOOKUP`. One observation holds its one reader.
4. The acknowledgement head is immutable. The hold does not rewrite it
   and does not change its reader.
5. A successful hold is recorded only from an `ACKNOWLEDGED` head whose
   acknowledgement reason is `RECEIPTED_RECEIPT_ACKNOWLEDGED`, whose
   `acknowledgement_recorded` is true, and whose next action is
   `ACKNOWLEDGE_RECEIPTED_RECEIPT`, and only for the profile's single
   receipt-ack-hold code and the acknowledgement reader.
6. `NOT_ACK_HELD` rows store null counts and `ack_hold_recorded = false`.
   Silence stores a null lag. A `NOT_ACKNOWLEDGED` acknowledgement cannot
   be held as received. Counts are copied only when
   `acknowledgement_recorded` is true.
7. `ACKED` stays an effect observation. `AWAITING_CONFIRMATION` stays
   the key kind. `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`, and
   `executes_tool` stay false. The hold does not execute the tool.
9. The reader equals the acknowledgement reader. The reader, the
   consumer, the receipt-ack-hold stewards, the
   receipt-acknowledgement stewards, and the upstream stewards are
   pairwise distinct.
10. Semantic retrieval may rank profiles. It never records a hold.
11. The engine does not call a model. Replay is a pure function of the
    acknowledgement head, the consumer id, the acknowledgement reader,
    and the profile receipt-ack-hold code.

## 5. Execution model

```text
approved profile (one allowed_receipt_ack_hold_code)
  -> open session (one observation budget, the acknowledgement reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read acknowledgement head by primary key
  -> require reader = acknowledgement reader
  -> project ACK_HELD or NOT_ACK_HELD
  -> append hold + perception + audit
  -> leave the acknowledgement head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `HOLD_ACKNOWLEDGED_RECEIPT` for both outcomes. The class
on the hold, not a second plane, distinguishes a recorded hold from a
refusal. Notify dispatch is a later hold intent and may remain
`UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one provider
   code, one citation code, one grant code, one reader-receipt code,
   one hold code, one perception code, one binding code, one
   binding-receipt code, one receipt-acknowledgement code, and one
   receipt-ack-hold code, and add one dual-control hold rule.
2. Approve it through `agent_acrh_profile_authority`.
3. Export one acknowledgement head per consumer and day. The export is
   a point copy of the receipt acknowledgement, not a packet walk.
4. Open a session and nominate one observation key.
5. Record the profile receipt-ack-hold code for the acknowledgement
   reader. Acknowledged heads copy the counts and seal
   `ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD`. Other heads seal a non-hold with
   null counts.
6. The agent reads the perception row. A withheld perception has no
   count fields and `ackHoldRecorded: false`.
7. Revocation stops a later session from nominating. It does not rewrite
   holds already sealed.
8. This plane does not open another nested expiry. It does not run the
   tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type ReceiptAckHoldId = string;
export type UtcDay = string;
export type ReceiptAckHoldCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type AcknowledgementClass = "ACKNOWLEDGED" | "NOT_ACKNOWLEDGED";
export type AcknowledgementReason =
  | "RECEIPTED_RECEIPT_ACKNOWLEDGED"
  | "NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE";
export type AcknowledgementNextAction =
  | "ACKNOWLEDGE_RECEIPTED_RECEIPT"
  | "STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT"
  | "OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT";
export type AckHoldClass = "ACK_HELD" | "NOT_ACK_HELD";
export type AckHoldReason =
  | "ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD"
  | "NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD";
export type AckHoldNextAction =
  | "HOLD_ACKNOWLEDGED_RECEIPT"
  | "STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD"
  | "OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const HOLD_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface AcknowledgementHead {
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
  readonly bindingCode: string;
  readonly bindingReceiptCode: string;
  readonly receiptAcknowledgementCode: string;
  readonly admissionClass: AdmissionClass;
  readonly acknowledgementClass: AcknowledgementClass;
  readonly acknowledgementReason: AcknowledgementReason;
  readonly acknowledgementRecorded: boolean;
  readonly receiptRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: AcknowledgementNextAction;
}

export interface AgentReceiptAckHold {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly receiptAckHoldId: ReceiptAckHoldId;
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
  readonly bindingCode: string;
  readonly bindingReceiptCode: string;
  readonly receiptAcknowledgementCode: string;
  readonly receiptAckHoldCode: ReceiptAckHoldCode;
  readonly admissionClass: AdmissionClass;
  readonly acknowledgementClass: AcknowledgementClass;
  readonly ackHoldClass: AckHoldClass;
  readonly ackHoldReason: AckHoldReason;
  readonly acknowledgementRecorded: boolean;
  readonly ackHoldRecorded: boolean;
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
  readonly trustedNextAction: AckHoldNextAction;
}

export function projectAgentReceiptAckHold(
  head: AcknowledgementHead,
  receiptAckHoldId: ReceiptAckHoldId,
  readerPrincipalId: PrincipalId,
  receiptAckHoldCode: ReceiptAckHoldCode,
): AgentReceiptAckHold {
  const readerIsAcknowledgementReader = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    receiptAckHoldId,
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
    bindingCode: head.bindingCode,
    bindingReceiptCode: head.bindingReceiptCode,
    receiptAcknowledgementCode: head.receiptAcknowledgementCode,
    receiptAckHoldCode,
    admissionClass: head.admissionClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = HOLD_TOKEN.test(receiptAckHoldCode);

  if (
    readerIsAcknowledgementReader &&
    readerIsDistinct &&
    singleCode &&
    head.acknowledgementClass === "ACKNOWLEDGED" &&
    head.acknowledgementReason === "RECEIPTED_RECEIPT_ACKNOWLEDGED" &&
    head.acknowledgementRecorded &&
    head.receiptRecorded &&
    head.trustedNextAction === "ACKNOWLEDGE_RECEIPTED_RECEIPT" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      acknowledgementClass: "ACKNOWLEDGED",
      ackHoldClass: "ACK_HELD",
      ackHoldReason: "ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD",
      acknowledgementRecorded: true,
      ackHoldRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "HOLD_ACKNOWLEDGED_RECEIPT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT";

  return {
    ...shared,
    acknowledgementClass: "NOT_ACKNOWLEDGED",
    acknowledgementRecorded: false,
    ackHoldClass: "NOT_ACK_HELD",
    ackHoldReason: "NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD",
    ackHoldRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit
      ? "OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD"
      : "STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD",
  };
}
```

```ts
export function holdOmitsUnacknowledgedAcknowledgement(
  hold: AgentReceiptAckHold,
): boolean {
  return (
    hold.ackHoldRecorded === false &&
    hold.ackHoldClass === "NOT_ACK_HELD" &&
    hold.acknowledgementRecorded === false &&
    hold.acknowledgementClass === "NOT_ACKNOWLEDGED" &&
    hold.sealedCount === null &&
    hold.deniedCount === null &&
    hold.unknownEffectCount === null &&
    hold.ackPromotedToTrust === false &&
    hold.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    hold.executesTool === false
  );
}
```

`projectAgentReceiptAckHold` is the procedural projection an agent runtime
must match. It never returns `TRUSTED_ENROLLED`. It never copies counts
off an acknowledgement whose `acknowledgement_recorded` is false. It
never executes the tool. A hold token that is not a single code, or a
reader other than the acknowledgement reader, projects to `NOT_ACK_HELD`.
The database additionally requires the token to equal the approved
profile receipt-ack-hold code, requires the reader to equal the
acknowledgement reader, and rejects a reader who collides with the
consumer or any steward, before it seals `ACK_HELD`. A mismatched reader
is rejected rather than sealed, so the plane does not grant a second
reader.

## 8. SQL row-store schema

```sql
CREATE TYPE acrh_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acrh_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acrh_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acrh_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acrh_hold_class AS ENUM ('HELD', 'NOT_HELD');
CREATE TYPE acrh_hold_reason AS ENUM (
  'ACKNOWLEDGED_OBSERVATION_HELD',
  'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
);
CREATE TYPE acrh_card_class AS ENUM ('PERCEIVED', 'NOT_PERCEIVED');
CREATE TYPE acrh_card_reason AS ENUM (
  'HELD_OBSERVATION_PERCEIVED',
  'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
);
CREATE TYPE acrh_binding_class AS ENUM ('BOUND', 'NOT_BOUND');
CREATE TYPE acrh_binding_reason AS ENUM (
  'PERCEIVED_OBSERVATION_BOUND',
  'NOT_PERCEIVED_CARD_CANNOT_BIND'
);
CREATE TYPE acrh_receipt_next AS ENUM (
  'RECEIPT_BOUND_BINDING',
  'STOP_BINDING_RECEIPT',
  'OMIT_BINDING_RECEIPT'
);
CREATE TYPE acrh_receipt_class AS ENUM ('RECEIPTED', 'NOT_RECEIPTED');
CREATE TYPE acrh_receipt_reason AS ENUM (
  'BOUND_BINDING_RECEIPTED',
  'NOT_BOUND_BINDING_CANNOT_RECEIPT'
);
CREATE TYPE acrh_acknowledgement_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE acrh_acknowledgement_reason AS ENUM (
  'RECEIPTED_RECEIPT_ACKNOWLEDGED',
  'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE'
);
CREATE TYPE acrh_acknowledgement_next AS ENUM (
  'ACKNOWLEDGE_RECEIPTED_RECEIPT',
  'STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT',
  'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT'
);
CREATE TYPE acrh_ack_hold_class AS ENUM ('ACK_HELD', 'NOT_ACK_HELD');
CREATE TYPE acrh_ack_hold_reason AS ENUM (
  'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD',
  'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
);
CREATE TYPE acrh_ack_hold_next AS ENUM (
  'HOLD_ACKNOWLEDGED_RECEIPT',
  'STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD',
  'OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD'
);
CREATE TYPE acrh_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acrh_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acrh_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acrh_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acrh_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acrh_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acrh_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acrh_compile_kind AS ENUM ('HOLD_ACKNOWLEDGED_RECEIPT');
CREATE TYPE acrh_terminal_kind AS ENUM (
  'ACK_HOLD_RECORDED',
  'ACK_HOLD_REFUSED'
);
CREATE TYPE acrh_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_ACK_HOLD',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acrh_profile_authority NOLOGIN;

CREATE FUNCTION acrh_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acrh_authorization_evidence (
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

CREATE TABLE agent_acrh_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acrh_profile_status NOT NULL,
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
  allowed_binding_receipt_code TEXT NOT NULL CHECK (allowed_binding_receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_receipt_acknowledgement_code TEXT NOT NULL CHECK (allowed_receipt_acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_receipt_ack_hold_code TEXT NOT NULL CHECK (allowed_receipt_ack_hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  acknowledgement_threshold INTEGER NOT NULL CHECK (acknowledgement_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acrh_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrh_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrh_profile_acknowledgement_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acrh_admission_class[] NOT NULL,
  acknowledgement_threshold INTEGER NOT NULL CHECK (acknowledgement_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  require_dual_control_acknowledgement BOOLEAN NOT NULL,
  receipt_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acrh_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acrh_acknowledgement_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  binding_receipt_id UUID NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
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
  binding_receipt_code TEXT NOT NULL CHECK (binding_receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_acknowledgement_code TEXT NOT NULL CHECK (receipt_acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acrh_admission_class NOT NULL,
  hold_class acrh_hold_class NOT NULL,
  card_class acrh_card_class NOT NULL,
  binding_class acrh_binding_class NOT NULL,
  receipt_class acrh_receipt_class NOT NULL,
  acknowledgement_class acrh_acknowledgement_class NOT NULL,
  hold_reason acrh_hold_reason NOT NULL,
  card_reason acrh_card_reason NOT NULL,
  binding_reason acrh_binding_reason NOT NULL,
  receipt_reason acrh_receipt_reason NOT NULL,
  acknowledgement_reason acrh_acknowledgement_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  freshness_class acrh_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrh_effect_observation NOT NULL,
  attested_key_kind acrh_key_kind NOT NULL,
  fact_disposition acrh_fact_disposition NOT NULL,
  body_visibility acrh_body_visibility NOT NULL,
  metadata_trust acrh_metadata_trust NOT NULL,
  access_path acrh_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acrh_acknowledgement_next NOT NULL,
  binding_receipt_steward_a TEXT NOT NULL,
  binding_receipt_steward_b TEXT NOT NULL,
  receipt_acknowledgement_steward_a TEXT NOT NULL,
  receipt_acknowledgement_steward_b TEXT NOT NULL,
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
  acknowledgement_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, perception_binding_id),
  UNIQUE (account_id, binding_receipt_id),
  UNIQUE (account_id, receipt_acknowledgement_id),
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
  CHECK (NOT (acknowledgement_body ? 'factBody')),
  CHECK (NOT (acknowledgement_body ? 'fact_body')),
  CHECK (NOT (acknowledgement_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acrh_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acrh_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_ack_hold_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_ack_hold_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  acknowledgement_threshold INTEGER NOT NULL,
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
    REFERENCES agent_acrh_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrh_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrh_observation_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acrh_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id)
);

CREATE TABLE agent_acrh_observation_acknowledgement (
  account_id BIGINT NOT NULL,
  ack_hold_link_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  admission_class acrh_admission_class NOT NULL,
  binding_class acrh_binding_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ack_hold_link_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrh_acknowledgement_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrh_acknowledgement_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_ack_hold_code TEXT NOT NULL,
  admission_class acrh_admission_class NOT NULL,
  receipt_class acrh_receipt_class NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  ack_hold_hash TEXT NOT NULL CHECK (char_length(ack_hold_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrh_acknowledgement_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  receipt_ack_hold_code TEXT NOT NULL,
  binding_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  ack_hold_hash TEXT NOT NULL CHECK (char_length(ack_hold_hash) = 64),
  admission_class acrh_admission_class NOT NULL,
  binding_class acrh_binding_class NOT NULL,
  receipt_class acrh_receipt_class NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  receipt_ack_hold_steward_a TEXT NOT NULL,
  receipt_ack_hold_steward_b TEXT NOT NULL,
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
    REFERENCES agent_acrh_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acrh_acknowledgement_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrh_acknowledgement_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_ack_hold_code TEXT NOT NULL,
  compile_kind acrh_compile_kind NOT NULL,
  admission_class acrh_admission_class NOT NULL,
  binding_class acrh_binding_class NOT NULL,
  receipt_class acrh_receipt_class NOT NULL,
  freshness_class acrh_freshness_class NOT NULL,
  effect_observation acrh_effect_observation NOT NULL,
  attested_key_kind acrh_key_kind NOT NULL,
  fact_disposition acrh_fact_disposition NOT NULL,
  body_visibility acrh_body_visibility NOT NULL,
  access_path acrh_access_path NOT NULL,
  metadata_trust acrh_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  ack_hold_hash TEXT NOT NULL CHECK (char_length(ack_hold_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrh_acknowledgement_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrh_receipt_ack_hold (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_ack_hold_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  perception_binding_id UUID NOT NULL,
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
  receipt_acknowledgement_code TEXT NOT NULL CHECK (receipt_acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_ack_hold_code TEXT NOT NULL CHECK (receipt_ack_hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  binding_receipt_code TEXT NOT NULL CHECK (binding_receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acrh_admission_class NOT NULL,
  hold_class acrh_hold_class NOT NULL,
  card_class acrh_card_class NOT NULL,
  binding_class acrh_binding_class NOT NULL,
  receipt_class acrh_receipt_class NOT NULL,
  acknowledgement_class acrh_acknowledgement_class NOT NULL,
  ack_hold_class acrh_ack_hold_class NOT NULL,
  hold_reason acrh_hold_reason NOT NULL,
  card_reason acrh_card_reason NOT NULL,
  binding_reason acrh_binding_reason NOT NULL,
  receipt_reason acrh_receipt_reason NOT NULL,
  acknowledgement_reason acrh_acknowledgement_reason NOT NULL,
  ack_hold_reason acrh_ack_hold_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  ack_hold_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrh_effect_observation NOT NULL,
  attested_key_kind acrh_key_kind NOT NULL,
  fact_disposition acrh_fact_disposition NOT NULL,
  body_visibility acrh_body_visibility NOT NULL,
  metadata_trust acrh_metadata_trust NOT NULL,
  access_path acrh_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acrh_ack_hold_next NOT NULL,
  receipt_acknowledgement_steward_a TEXT NOT NULL,
  receipt_acknowledgement_steward_b TEXT NOT NULL,
  receipt_ack_hold_steward_a TEXT NOT NULL,
  receipt_ack_hold_steward_b TEXT NOT NULL,
  binding_receipt_steward_a TEXT NOT NULL,
  binding_receipt_steward_b TEXT NOT NULL,
  binding_steward_a TEXT NOT NULL,
  binding_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  ack_hold_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, receipt_ack_hold_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrh_acknowledgement_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrh_acknowledgement_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (ack_hold_body ? 'factBody')),
  CHECK (NOT (ack_hold_body ? 'fact_body')),
  CHECK (NOT (ack_hold_body ? 'resolvedFactHash')),
  CHECK (
    (acknowledgement_recorded = true AND acknowledgement_class = 'ACKNOWLEDGED'
      AND acknowledgement_reason = 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
      AND receipt_recorded = true AND receipt_class = 'RECEIPTED'
      AND binding_recorded = true AND binding_class = 'BOUND'
      AND card_recorded = true AND card_class = 'PERCEIVED'
      AND hold_recorded = true AND hold_class = 'HELD'
      AND receipt_issued = true
      AND receipt_reason = 'BOUND_BINDING_RECEIPTED'
      AND binding_reason = 'PERCEIVED_OBSERVATION_BOUND'
      AND ack_hold_recorded = true
      AND ack_hold_class = 'ACK_HELD'
      AND ack_hold_reason = 'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD'
      AND trusted_next_action = 'HOLD_ACKNOWLEDGED_RECEIPT'
      AND sealed_count IS NOT NULL
      AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL
      AND ack_hold_body ? 'sealedCount'
      AND ack_hold_body ? 'deniedCount'
      AND ack_hold_body ? 'unknownEffectCount')
    OR (acknowledgement_recorded = false AND acknowledgement_class = 'NOT_ACKNOWLEDGED'
      AND acknowledgement_reason = 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE'
      AND receipt_recorded = false AND receipt_class = 'NOT_RECEIPTED'
      AND binding_recorded = false AND binding_class = 'NOT_BOUND'
      AND card_recorded = false AND card_class = 'NOT_PERCEIVED'
      AND hold_recorded = false AND hold_class = 'NOT_HELD'
      AND receipt_issued = false
      AND receipt_reason = 'NOT_BOUND_BINDING_CANNOT_RECEIPT'
      AND binding_reason = 'NOT_PERCEIVED_CARD_CANNOT_BIND'
      AND ack_hold_recorded = false
      AND ack_hold_class = 'NOT_ACK_HELD'
      AND ack_hold_reason = 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
      AND trusted_next_action IN ('STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD', 'OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD')
      AND sealed_count IS NULL
      AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND NOT (ack_hold_body ? 'sealedCount')
      AND NOT (ack_hold_body ? 'deniedCount')
      AND NOT (ack_hold_body ? 'unknownEffectCount'))
  )
);



CREATE TABLE agent_acrh_acknowledgement_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_ack_hold_id UUID NOT NULL,
  receipt_ack_hold_code TEXT NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  ack_hold_recorded BOOLEAN NOT NULL,
  receipt_class acrh_receipt_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acrh_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acrh_ack_hold_next NOT NULL,
  ack_hold_perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (ack_hold_perception_body ? 'factBody')),
  CHECK (NOT (ack_hold_perception_body ? 'fact_body')),
  CHECK (NOT (ack_hold_perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acrh_acknowledgement_intent (
  account_id BIGINT NOT NULL,
  ack_hold_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acrh_intent_status NOT NULL,
  ack_hold_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ack_hold_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrh_acknowledgement_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acrh_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id)
);

CREATE TABLE agent_acrh_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acrh_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id)
);

CREATE TABLE agent_acrh_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id)
);

CREATE TABLE agent_acrh_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acrh_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acrh_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acrh_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrh_session (account_id, session_id)
);
CREATE FUNCTION protect_agent_acrh_profile()
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
      IF current_setting('app.acrh_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acrh_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acrh_profile_protect
BEFORE INSERT OR UPDATE ON agent_acrh_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_profile();

CREATE FUNCTION protect_agent_acrh_acknowledgement_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acrh_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acrh_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed receipt rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acrh_acknowledgement_rule_protect
BEFORE UPDATE ON agent_acrh_profile_acknowledgement_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_acknowledgement_rule();

CREATE FUNCTION protect_agent_acrh_acknowledgement_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.acknowledgement_body ? 'factBody'
     OR NEW.acknowledgement_body ? 'fact_body'
     OR NEW.acknowledgement_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NOT acrh_parties_are_distinct(ARRAY[
       NEW.reader_principal_id, NEW.consumer_principal_id,
       NEW.binding_receipt_steward_a, NEW.binding_receipt_steward_b,
       NEW.receipt_acknowledgement_steward_a, NEW.receipt_acknowledgement_steward_b,
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

  IF NEW.acknowledgement_class = 'ACKNOWLEDGED' OR NEW.acknowledgement_recorded THEN
    IF NEW.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR NEW.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'ACKNOWLEDGE_RECEIPTED_RECEIPT'
       OR NEW.receipt_recorded IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'RECEIPTED'
       OR NEW.receipt_reason IS DISTINCT FROM 'BOUND_BINDING_RECEIPTED'
       OR NEW.binding_recorded IS DISTINCT FROM TRUE
       OR NEW.binding_class IS DISTINCT FROM 'BOUND'
       OR NEW.binding_reason IS DISTINCT FROM 'PERCEIVED_OBSERVATION_BOUND'
       OR NEW.card_recorded IS DISTINCT FROM TRUE
       OR NEW.card_class IS DISTINCT FROM 'PERCEIVED'
       OR NEW.card_reason IS DISTINCT FROM 'HELD_OBSERVATION_PERCEIVED'
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
       OR NOT (NEW.acknowledgement_body ? 'sealedCount')
       OR NOT (NEW.acknowledgement_body ? 'deniedCount')
       OR NOT (NEW.acknowledgement_body ? 'unknownEffectCount') THEN
      RAISE EXCEPTION 'acknowledged head must carry the acknowledgement counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.acknowledgement_recorded
     OR NEW.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
     OR NEW.acknowledgement_reason IS DISTINCT FROM 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE'
     OR NEW.receipt_recorded
     OR NEW.receipt_class IS DISTINCT FROM 'NOT_RECEIPTED'
     OR NEW.receipt_reason IS DISTINCT FROM 'NOT_BOUND_BINDING_CANNOT_RECEIPT'
     OR NEW.binding_recorded
     OR NEW.binding_class IS DISTINCT FROM 'NOT_BOUND'
     OR NEW.binding_reason IS DISTINCT FROM 'NOT_PERCEIVED_CARD_CANNOT_BIND'
     OR NEW.card_recorded
     OR NEW.card_class IS DISTINCT FROM 'NOT_PERCEIVED'
     OR NEW.card_reason IS DISTINCT FROM 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
     OR NEW.hold_recorded
     OR NEW.hold_class IS DISTINCT FROM 'NOT_HELD'
     OR NEW.hold_reason IS DISTINCT FROM 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
     OR NEW.receipt_issued
     OR NEW.acknowledgement_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not acknowledged head cannot be shown as received';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT' THEN
      RAISE EXCEPTION 'silence is not an acknowledged receipt';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT' THEN
      RAISE EXCEPTION 'denied acknowledgement head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'acknowledgement head class is not holdable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acrh_acknowledgement_head_protect
BEFORE INSERT OR UPDATE ON agent_acrh_acknowledgement_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_acknowledgement_head();

CREATE FUNCTION protect_agent_acrh_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.ack_hold_hash IS DISTINCT FROM NEW.ack_hold_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'receipt decision identity is immutable';
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

  IF NEW.receipt_class = 'RECEIPTED' AND NEW.receipt_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'receipted binding must copy the head counts';
  END IF;

  IF NEW.receipt_class = 'NOT_RECEIPTED' AND NEW.receipt_recorded THEN
    RAISE EXCEPTION 'not bound binding cannot be receipted as received';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acrh_decision_protect
BEFORE INSERT OR UPDATE ON agent_acrh_acknowledgement_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_decision();

CREATE FUNCTION protect_agent_acrh_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acrh_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.receipt_ack_hold_steward_a, NEW.receipt_ack_hold_steward_b,
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

CREATE TRIGGER agent_acrh_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acrh_acknowledgement_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_certificate();

CREATE FUNCTION protect_agent_acrh_acknowledgement_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_intent$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'receipt intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.ack_hold_idempotency_key IS DISTINCT FROM NEW.ack_hold_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared receipt identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acrh_acknowledgement_intent_protect
BEFORE INSERT OR UPDATE ON agent_acrh_acknowledgement_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_acknowledgement_intent();

CREATE FUNCTION protect_agent_acrh_receipt_ack_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_receipt$
DECLARE
  v_head agent_acrh_acknowledgement_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
  v_hold TEXT;
  v_perception TEXT;
  v_binding TEXT;
  v_allowed_ack_hold TEXT;
  v_allowed_acknowledgement TEXT;
  v_allowed_cited_receipt TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt-ack hold is immutable';
  END IF;

  IF NEW.executes_tool THEN
    RAISE EXCEPTION 'tool execution inside the hold';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.ack_hold_body ? 'factBody'
     OR NEW.ack_hold_body ? 'fact_body'
     OR NEW.ack_hold_body ? 'resolvedFactHash'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'hold fence';
  END IF;

  IF NEW.receipt_ack_hold_code IS NULL OR NEW.receipt_ack_hold_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrh_acknowledgement_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acknowledgement head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the acknowledgement reader';
  END IF;

  IF NOT acrh_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.receipt_ack_hold_steward_a, NEW.receipt_ack_hold_steward_b,
    NEW.receipt_acknowledgement_steward_a, NEW.receipt_acknowledgement_steward_b,
    NEW.binding_receipt_steward_a, NEW.binding_receipt_steward_b,
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

  IF NEW.binding_steward_a IS DISTINCT FROM v_head.binding_steward_a
     OR NEW.binding_steward_b IS DISTINCT FROM v_head.binding_steward_b
     OR NEW.binding_receipt_steward_a IS DISTINCT FROM v_head.binding_receipt_steward_a
     OR NEW.binding_receipt_steward_b IS DISTINCT FROM v_head.binding_receipt_steward_b
     OR NEW.receipt_acknowledgement_steward_a IS DISTINCT FROM v_head.receipt_acknowledgement_steward_a
     OR NEW.receipt_acknowledgement_steward_b IS DISTINCT FROM v_head.receipt_acknowledgement_steward_b
     OR NEW.receipt_acknowledgement_code IS DISTINCT FROM v_head.receipt_acknowledgement_code
     OR NEW.binding_receipt_code IS DISTINCT FROM v_head.binding_receipt_code
     OR NEW.perception_steward_a IS DISTINCT FROM v_head.perception_steward_a
     OR NEW.perception_steward_b IS DISTINCT FROM v_head.perception_steward_b
     OR NEW.perception_binding_id IS DISTINCT FROM v_head.perception_binding_id THEN
    RAISE EXCEPTION 'hold must cite the sealed acknowledgement';
  END IF;

  IF NEW.ack_hold_class = 'ACK_HELD' OR NEW.ack_hold_recorded THEN
    IF v_head.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR v_head.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR v_head.acknowledgement_reason IS DISTINCT FROM 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'ACKNOWLEDGE_RECEIPTED_RECEIPT'
       OR v_head.receipt_class IS DISTINCT FROM 'RECEIPTED'
       OR v_head.receipt_recorded IS DISTINCT FROM TRUE
       OR v_head.receipt_reason IS DISTINCT FROM 'BOUND_BINDING_RECEIPTED' THEN
      RAISE EXCEPTION 'not acknowledged acknowledgement cannot be held as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.ack_hold_reason IS DISTINCT FROM 'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_ACKNOWLEDGED_RECEIPT'
       OR NEW.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR NEW.ack_hold_recorded IS DISTINCT FROM TRUE
       OR NEW.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
       OR NEW.ack_hold_class IS DISTINCT FROM 'ACK_HELD'
       OR NEW.receipt_recorded IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'acknowledged acknowledgement must copy the head counts';
    END IF;
  ELSE
    IF v_head.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
       OR v_head.acknowledgement_recorded
       OR v_head.receipt_recorded THEN
      RAISE EXCEPTION 'acknowledged acknowledgement must show the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.ack_hold_body ? 'sealedCount'
       OR NEW.acknowledgement_recorded
       OR NEW.ack_hold_recorded
       OR NEW.ack_hold_class IS DISTINCT FROM 'NOT_ACK_HELD'
       OR NEW.ack_hold_reason IS DISTINCT FROM 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
       OR NEW.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE' THEN
      RAISE EXCEPTION 'not acknowledged acknowledgement cannot be held as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD' THEN
        RAISE EXCEPTION 'silence cannot be shown as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused acknowledgement must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_hold_code, p.allowed_perception_code, p.allowed_binding_code,
         p.allowed_binding_receipt_code, p.allowed_receipt_acknowledgement_code,
         p.allowed_receipt_ack_hold_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt,
         v_hold, v_perception, v_binding, v_allowed_cited_receipt,
         v_allowed_acknowledgement, v_allowed_ack_hold
  FROM agent_acrh_session AS s
  JOIN agent_acrh_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_allowed_ack_hold IS NULL
     OR NEW.receipt_ack_hold_code IS DISTINCT FROM v_allowed_ack_hold
     OR NEW.receipt_acknowledgement_code IS DISTINCT FROM v_allowed_acknowledgement
     OR NEW.binding_receipt_code IS DISTINCT FROM v_allowed_cited_receipt
     OR NEW.binding_code IS DISTINCT FROM v_binding
     OR NEW.perception_code IS DISTINCT FROM v_perception
     OR NEW.hold_code IS DISTINCT FROM v_hold
     OR NEW.receipt_code IS DISTINCT FROM v_receipt
     OR NEW.grant_code IS DISTINCT FROM v_grant
     OR NEW.citation_code IS DISTINCT FROM v_citation
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
     OR NEW.perception_code IS DISTINCT FROM v_head.perception_code
     OR NEW.binding_code IS DISTINCT FROM v_head.binding_code THEN
    RAISE EXCEPTION 'receipt-ack hold code is not the profile hold';
  END IF;

  RETURN NEW;
END
$protect_receipt$;

CREATE TRIGGER agent_acrh_receipt_ack_hold_protect
BEFORE INSERT OR UPDATE ON agent_acrh_receipt_ack_hold
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_receipt_ack_hold();

CREATE FUNCTION protect_agent_acrh_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.ack_hold_perception_body ? 'factBody'
     OR NEW.ack_hold_perception_body ? 'fact_body'
     OR NEW.ack_hold_perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.receipt_class = 'NOT_RECEIPTED'
     AND (NEW.receipt_recorded
          OR NEW.binding_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.ack_hold_perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not bound binding cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acrh_perception_protect
BEFORE INSERT OR UPDATE ON agent_acrh_acknowledgement_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrh_perception();

CREATE FUNCTION approve_agent_acrh_profile(
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
  stored_status acrh_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrh_profile
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
  FROM agent_acrh_profile_acknowledgement_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_acknowledgement IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control receipt rule';
  END IF;

  PERFORM set_config(
    'app.acrh_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrh_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acrh_profile(
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
  stored_status acrh_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrh_profile
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
    'app.acrh_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrh_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acrh_observation(
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
  v_session_status acrh_session_status;
  v_profile_status acrh_profile_status;
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
    FROM agent_acrh_observation_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one observation per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acrh_session AS s
  JOIN agent_acrh_profile AS pr
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

  INSERT INTO agent_acrh_observation_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;
CREATE FUNCTION record_agent_acrh_receipt_ack_hold(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_receipt_ack_hold_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_acknowledgement_id UUID,
  p_ack_hold_digest TEXT,
  p_receipt_ack_hold_steward_a TEXT,
  p_receipt_ack_hold_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acrh_session_status;
  v_profile_status acrh_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_allowed_hold TEXT;
  v_allowed_perception TEXT;
  v_allowed_binding TEXT;
  v_allowed_acknowledgement_code TEXT;
  v_allowed_ack_hold TEXT;
  v_allowed_cited_receipt TEXT;
  v_principal TEXT;
  v_head agent_acrh_acknowledgement_head%ROWTYPE;
  v_receipt_class acrh_receipt_class;
  v_binding_class acrh_binding_class;
  v_card_class acrh_card_class;
  v_hold_class acrh_hold_class;
  v_reason acrh_receipt_reason;
  v_binding_reason acrh_binding_reason;
  v_card_reason acrh_card_reason;
  v_hold_reason acrh_hold_reason;
  v_receipt_recorded BOOLEAN;
  v_ack_class acrh_acknowledgement_class;
  v_ack_reason acrh_acknowledgement_reason;
  v_ack_recorded BOOLEAN;
  v_ack_hold_class acrh_ack_hold_class;
  v_ack_hold_reason acrh_ack_hold_reason;
  v_ack_hold_recorded BOOLEAN;
  v_binding_recorded BOOLEAN;
  v_card_recorded BOOLEAN;
  v_hold_recorded BOOLEAN;
  v_receipt_issued BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acrh_ack_hold_next;
  v_terminal acrh_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_receipt_ack_hold_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_ack_hold_digest) <> 64 THEN
    RAISE EXCEPTION 'receipt digest must be 64 hex characters';
  END IF;

  IF p_receipt_ack_hold_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acrh_observation_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'receipt requires a nominated observation point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, pr.allowed_hold_code, pr.allowed_perception_code,
         pr.allowed_binding_code, pr.allowed_binding_receipt_code,
         pr.allowed_receipt_acknowledgement_code, pr.allowed_receipt_ack_hold_code,
         s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_hold, v_allowed_perception, v_allowed_binding,
         v_allowed_cited_receipt, v_allowed_acknowledgement_code, v_allowed_ack_hold,
         v_principal
  FROM agent_acrh_session AS s
  JOIN agent_acrh_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'receipt requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_receipt_ack_hold_code IS DISTINCT FROM v_allowed_ack_hold THEN
    RAISE EXCEPTION 'receipt-ack hold code is not the profile hold';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrh_acknowledgement_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'receipt head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation
     OR v_head.grant_code IS DISTINCT FROM v_allowed_grant
     OR v_head.receipt_code IS DISTINCT FROM v_allowed_receipt
     OR v_head.hold_code IS DISTINCT FROM v_allowed_hold
     OR v_head.perception_code IS DISTINCT FROM v_allowed_perception
     OR v_head.binding_code IS DISTINCT FROM v_allowed_binding
     OR v_head.binding_receipt_code IS DISTINCT FROM v_allowed_cited_receipt
     OR v_head.receipt_acknowledgement_code IS DISTINCT FROM v_allowed_acknowledgement_code THEN
    RAISE EXCEPTION 'acknowledgement code is not the profile acknowledgement';
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
     OR v_head.acknowledgement_body ? 'factBody'
     OR v_head.acknowledgement_body ? 'fact_body'
     OR v_head.acknowledgement_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'receipt fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acrh_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_receipt_ack_hold_steward_a, p_receipt_ack_hold_steward_b,
       v_head.receipt_acknowledgement_steward_a, v_head.receipt_acknowledgement_steward_b,
       v_head.binding_receipt_steward_a, v_head.binding_receipt_steward_b,
       v_head.binding_steward_a, v_head.binding_steward_b,
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
    RAISE EXCEPTION 'reader must equal the acknowledgement reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acrh_receipt_ack_hold
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'binding receipt already recorded';
  END IF;

  IF v_head.acknowledgement_class = 'ACKNOWLEDGED'
     AND v_head.acknowledgement_reason = 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
     AND v_head.acknowledgement_recorded
     AND v_head.receipt_recorded
     AND v_head.receipt_class = 'RECEIPTED'
     AND v_head.receipt_reason = 'BOUND_BINDING_RECEIPTED'
     AND v_head.trusted_next_action = 'ACKNOWLEDGE_RECEIPTED_RECEIPT'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.binding_class = 'BOUND'
     AND v_head.binding_recorded
     AND v_head.sealed_count IS NOT NULL
     AND v_head.denied_count IS NOT NULL
     AND v_head.unknown_effect_count IS NOT NULL THEN
    v_receipt_class := 'RECEIPTED';
    v_ack_class := 'ACKNOWLEDGED';
    v_ack_reason := 'RECEIPTED_RECEIPT_ACKNOWLEDGED';
    v_ack_recorded := true;
    v_ack_hold_class := 'ACK_HELD';
    v_ack_hold_reason := 'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD';
    v_ack_hold_recorded := true;
    v_binding_class := 'BOUND';
    v_card_class := 'PERCEIVED';
    v_hold_class := 'HELD';
    v_reason := 'BOUND_BINDING_RECEIPTED';
    v_binding_reason := 'PERCEIVED_OBSERVATION_BOUND';
    v_card_reason := 'HELD_OBSERVATION_PERCEIVED';
    v_hold_reason := 'ACKNOWLEDGED_OBSERVATION_HELD';
    v_receipt_recorded := true;
    v_binding_recorded := true;
    v_card_recorded := true;
    v_hold_recorded := true;
    v_receipt_issued := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'HOLD_ACKNOWLEDGED_RECEIPT';
    v_terminal := 'ACK_HOLD_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT' THEN
    v_receipt_class := 'NOT_RECEIPTED';
    v_binding_class := 'NOT_BOUND';
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_reason := 'NOT_BOUND_BINDING_CANNOT_RECEIPT';
    v_binding_reason := 'NOT_PERCEIVED_CARD_CANNOT_BIND';
    v_card_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_hold_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_receipt_recorded := false;
    v_ack_class := 'NOT_ACKNOWLEDGED';
    v_ack_reason := 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE';
    v_ack_recorded := false;
    v_ack_hold_class := 'NOT_ACK_HELD';
    v_ack_hold_reason := 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD';
    v_ack_hold_recorded := false;
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_receipt_issued := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD';
    v_terminal := 'ACK_HOLD_REFUSED';
  ELSE
    v_receipt_class := 'NOT_RECEIPTED';
    v_binding_class := 'NOT_BOUND';
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_reason := 'NOT_BOUND_BINDING_CANNOT_RECEIPT';
    v_binding_reason := 'NOT_PERCEIVED_CARD_CANNOT_BIND';
    v_card_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_hold_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_receipt_recorded := false;
    v_ack_class := 'NOT_ACKNOWLEDGED';
    v_ack_reason := 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE';
    v_ack_recorded := false;
    v_ack_hold_class := 'NOT_ACK_HELD';
    v_ack_hold_reason := 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD';
    v_ack_hold_recorded := false;
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_receipt_issued := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD';
    v_terminal := 'ACK_HOLD_REFUSED';
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
    'bindingCode', v_head.binding_code,
    'bindingReceiptCode', v_head.binding_receipt_code,
    'receiptAcknowledgementCode', v_head.receipt_acknowledgement_code,
    'receiptAckHoldCode', p_receipt_ack_hold_code,
    'admissionClass', v_head.admission_class,
    'acknowledgementClass', v_ack_class,
    'acknowledgementReason', v_ack_reason,
    'acknowledgementRecorded', v_ack_recorded,
    'ackHoldClass', v_ack_hold_class,
    'ackHoldReason', v_ack_hold_reason,
    'ackHoldRecorded', v_ack_hold_recorded,
    'receiptRecorded', v_receipt_recorded,
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
  IF v_ack_hold_recorded THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acrh_observation_acknowledgement (
    account_id, ack_hold_link_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, perception_binding_id, admission_class, binding_class,
    binding_recorded, acknowledged_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.perception_binding_id, v_head.admission_class,
    v_head.binding_class, v_head.binding_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrh_acknowledgement_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, receipt_ack_hold_code, admission_class, receipt_class,
    receipt_recorded, ack_hold_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_receipt_ack_hold_code, v_head.admission_class, v_receipt_class,
    v_receipt_recorded, p_ack_hold_digest, clock_timestamp()
  );

  INSERT INTO agent_acrh_acknowledgement_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, receipt_ack_hold_code, binding_code, provider_code,
    ack_hold_hash, admission_class, binding_class, receipt_class, receipt_recorded,
    receipt_ack_hold_steward_a, receipt_ack_hold_steward_b,
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
    p_reader_principal, p_utc_day, p_receipt_ack_hold_code, v_head.binding_code,
    v_head.provider_code, p_ack_hold_digest, v_head.admission_class, v_binding_class,
    v_receipt_class, v_receipt_recorded,
    p_receipt_ack_hold_steward_a, p_receipt_ack_hold_steward_b,
    v_head.binding_steward_a, v_head.binding_steward_b,
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

  INSERT INTO agent_acrh_acknowledgement_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, receipt_ack_hold_code, compile_kind,
    admission_class, binding_class, receipt_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    receipt_recorded, executes_tool, lag_publications, max_lag_budget, ack_hold_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_receipt_ack_hold_code,
    'HOLD_ACKNOWLEDGED_RECEIPT',
    v_head.admission_class, v_binding_class, v_receipt_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_receipt_recorded, false, v_lag, v_head.max_lag_budget, p_ack_hold_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrh_receipt_ack_hold (
    account_id, utc_day, consumer_principal_id, receipt_ack_hold_id, session_id,
    certificate_id, perception_binding_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, hold_code,
    perception_code, binding_code, receipt_acknowledgement_code, receipt_ack_hold_code,
    binding_receipt_code, admission_class, hold_class, card_class, binding_class, receipt_class,
    acknowledgement_class, ack_hold_class, hold_reason, card_reason, binding_reason, receipt_reason,
    acknowledgement_reason, ack_hold_reason, hold_recorded, card_recorded, receipt_issued,
    binding_recorded, receipt_recorded, acknowledgement_recorded, ack_hold_recorded, sealed_count,
    denied_count, unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust, access_path,
    inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
    executes_tool, trusted_next_action, receipt_acknowledgement_steward_a,
    receipt_acknowledgement_steward_b, receipt_ack_hold_steward_a, receipt_ack_hold_steward_b,
    binding_receipt_steward_a, binding_receipt_steward_b, binding_steward_a, binding_steward_b,
    perception_steward_a, perception_steward_b, ack_hold_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_acknowledgement_id, p_session_id,
    p_certificate_id, v_head.perception_binding_id, p_reader_principal,
    v_head.purpose_code, v_head.effect_code, v_head.provider_code, v_head.citation_code,
    v_head.grant_code, v_head.receipt_code, v_head.hold_code, v_head.perception_code,
    v_head.binding_code, v_head.receipt_acknowledgement_code, p_receipt_ack_hold_code,
    v_head.binding_receipt_code, v_head.admission_class, v_hold_class, v_card_class,
    v_binding_class, v_receipt_class, v_ack_class, v_ack_hold_class, v_hold_reason,
    v_card_reason, v_binding_reason, v_reason, v_ack_reason, v_ack_hold_reason,
    v_hold_recorded, v_card_recorded, v_receipt_issued, v_binding_recorded,
    v_receipt_recorded, v_ack_recorded, v_ack_hold_recorded, v_sealed, v_denied, v_unknown, v_lag,
    v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, false, v_next,
    v_head.receipt_acknowledgement_steward_a, v_head.receipt_acknowledgement_steward_b,
    p_receipt_ack_hold_steward_a, p_receipt_ack_hold_steward_b,
    v_head.binding_receipt_steward_a, v_head.binding_receipt_steward_b,
    v_head.binding_steward_a, v_head.binding_steward_b,
    v_head.perception_steward_a, v_head.perception_steward_b,
    v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrh_acknowledgement_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, receipt_ack_hold_id,
    receipt_ack_hold_code, acknowledgement_recorded, ack_hold_recorded, receipt_class,
    binding_recorded, receipt_recorded, sealed_count, denied_count, unknown_effect_count,
    attested_key_kind, ack_promoted_to_trust, trusted_next_action, ack_hold_perception_body,
    created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_acknowledgement_id,
    p_receipt_ack_hold_code, v_ack_recorded, v_ack_hold_recorded, v_receipt_class,
    v_binding_recorded, v_receipt_recorded, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acrh_acknowledgement_intent (
    account_id, ack_hold_intent_id, session_id, certificate_id, intent_status,
    ack_hold_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_acknowledgement_id, p_session_id, p_certificate_id, 'PREPARED',
    p_acknowledgement_id::TEXT, 1, p_ack_hold_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrh_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_acknowledgement_id, p_session_id, 'ACK_HOLD', 1, clock_timestamp()
  );

  INSERT INTO agent_acrh_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acrh_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'RECEIPT_ACK_HOLD_SEALED',
    p_ack_hold_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acrh_session
  SET consumed_ack_hold_units = consumed_ack_hold_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$publish$;

CREATE FUNCTION reject_agent_acrh_unscoped_scan(
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

ALTER FUNCTION approve_agent_acrh_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrh_profile_authority;
ALTER FUNCTION revoke_agent_acrh_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrh_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acrh_profile_authority;
GRANT SELECT ON
  agent_acrh_profile,
  agent_acrh_profile_acknowledgement_rule
TO agent_acrh_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrh_profile TO agent_acrh_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acrh_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acrh_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrh_profile FROM PUBLIC;

CREATE INDEX agent_acrh_session_work_idx ON agent_acrh_session (
  account_id,
  status
);
CREATE INDEX agent_acrh_session_profile_idx ON agent_acrh_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acrh_head_consumer_idx ON agent_acrh_acknowledgement_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acrh_nomination_session_idx ON agent_acrh_observation_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acrh_certificate_session_idx ON agent_acrh_acknowledgement_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acrh_decision_cert_idx ON agent_acrh_acknowledgement_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acrh_receipt_consumer_idx ON agent_acrh_receipt_ack_hold (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acrh_receipt_reader_idx ON agent_acrh_receipt_ack_hold (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acrh_perception_day_idx ON agent_acrh_acknowledgement_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acrh_intent_work_idx ON agent_acrh_acknowledgement_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acrh_audit_time_idx ON agent_acrh_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acrh_command_expiry_idx ON agent_acrh_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acrh_checkpoint_day_idx ON agent_acrh_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acrh_observation_acknowledgement_day_idx ON agent_acrh_observation_acknowledgement (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acrh_authorization_evidence',
    'agent_acrh_profile',
    'agent_acrh_profile_acknowledgement_rule',
    'agent_acrh_acknowledgement_head',
    'agent_acrh_session',
    'agent_acrh_observation_nomination',
    'agent_acrh_observation_acknowledgement',
    'agent_acrh_acknowledgement_compile',
    'agent_acrh_acknowledgement_certificate',
    'agent_acrh_acknowledgement_decision',
    'agent_acrh_receipt_ack_hold',
    'agent_acrh_acknowledgement_perception',
    'agent_acrh_acknowledgement_intent',
    'agent_acrh_budget_ledger',
    'agent_acrh_terminal_record',
    'agent_acrh_command_result',
    'agent_acrh_audit_head',
    'agent_acrh_audit_event',
    'agent_acrh_audit_anchor',
    'agent_acrh_projection_checkpoint'
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
triggers. A successful hold on a `NOT_ACKNOWLEDGED` acknowledgement, a
trusted key, a packet scan, a fact body, a tool execution flag, or a
nested expiry flag is rejected. The acknowledgement head cannot be
updated to launder a refused acknowledgement into a held observation. A
reader other than the acknowledgement reader is rejected, so the insert
does not grant a second reader.

The reference check executes this schema fence, including
`acrh_session_status`, the triggers, and
`record_agent_acrh_receipt_ack_hold`, as one database session.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcrhAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcrhAcknowledgementClass {
  ACKNOWLEDGED
  NOT_ACKNOWLEDGED
}

enum AcrhAckHoldClass {
  ACK_HELD
  NOT_ACK_HELD
}

enum AcrhAckHoldReason {
  ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD
  NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD
}

enum AcrhNextAction {
  HOLD_ACKNOWLEDGED_RECEIPT
  STOP_RECEIPT_ACKNOWLEDGEMENT_HOLD
  OMIT_RECEIPT_ACKNOWLEDGEMENT_HOLD
}

enum AcrhKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcrhProfile {
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
  allowedBindingReceiptCode: String!
  allowedReceiptAcknowledgementCode: String!
  allowedReceiptAckHoldCode: String!
  procedureRef: String!
}

type AcrhSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerObservation: Int!
}

type AcrhAcknowledgementHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  acknowledgementClass: AcrhAcknowledgementClass!
  acknowledgementRecorded: Boolean!
  attestedKeyKind: AcrhKeyKind!
}

type AcrhReceiptAckHold {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptAckHoldId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  grantCode: String!
  receiptCode: String!
  holdCode: String!
  perceptionCode: String!
  bindingCode: String!
  bindingReceiptCode: String!
  receiptAcknowledgementCode: String!
  receiptAckHoldCode: String!
  admissionClass: AcrhAdmissionClass!
  acknowledgementClass: AcrhAcknowledgementClass!
  acknowledgementRecorded: Boolean!
  ackHoldClass: AcrhAckHoldClass!
  ackHoldReason: AcrhAckHoldReason!
  ackHoldRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcrhKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcrhNextAction!
}

type AcrhAckHoldPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptAckHoldCode: String!
  acknowledgementRecorded: Boolean!
  ackHoldRecorded: Boolean!
  ackHoldPerceptionBody: JSON!
}

type AcrhAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcrhProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcrhProfile
  agentAcrhSession(accountId: ID!, sessionId: ID!): AcrhSession
  agentAcrhAcknowledgementHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrhAcknowledgementHead
  agentAcrhReceiptAckHold(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrhReceiptAckHold
  agentAcrhAckHoldPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrhAckHoldPerception
  agentAcrhAuditEvents(accountId: ID!, utcDay: String!): [AcrhAuditEvent!]!
}

type Mutation {
  createAgentAcrhProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcrhProfile!
  approveAgentAcrhProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrhProfile!
  revokeAgentAcrhProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrhProfile!
  openAgentAcrhSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcrhSession!
  nominateAgentAcrhObservation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  recordAgentAcrhReceiptAckHold(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    receiptAckHoldCode: String!
  ): AcrhReceiptAckHold!
  appendAgentAcrhAckHoldIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcrhAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```



## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-receipt-ack-hold`. The
instruction payload on the hold rule is deterministic JSON:

- point-look up one acknowledgement by
  `(account_id, utc_day, consumer_principal_id)`;
- record the single `allowed_receipt_ack_hold_code` for the
  acknowledgement reader only when `acknowledgement_recorded` is true,
  the acknowledgement reason is `RECEIPTED_RECEIPT_ACKNOWLEDGED`, and
  the next action is `ACKNOWLEDGE_RECEIPTED_RECEIPT`;
- otherwise seal `NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD` with
  null counts;
- never execute the tool inside the hold;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
receipt-ack-hold code, and the acknowledgement reader. It may not
rewrite the instruction by chatting with the engine. Changing the
receipt-ack-hold code is a new profile version that stays `DRAFT`
until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single
receipt-ack-hold code. Queries must filter `account_id` before topK. A
global ANN index would mix tenants and is rejected. The reference
schema does not build an HNSW index.

```sql
CREATE TABLE agent_acrh_profile_embedding (
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
    REFERENCES agent_acrh_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acrh_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acrh_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acrh_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one observation, and records that profile's one
receipt-ack-hold code for the acknowledgement reader. Discovery never
writes `agent_acrh_receipt_ack_hold`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the acknowledgement `reader_principal_id` and the one
  `receipt_ack_hold_code`;
- `ackHoldRecorded` true only when the three counts are present, which
  is only when `acknowledgementRecorded` is true;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on a held
  observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`HOLD_ACKNOWLEDGED_RECEIPT` as permission to execute the tool or to
enroll the key. `ACKED` on the upstream effect stays an observation. It
is not this hold, and it is not trust.

## 13. ACID and consistency

The record function is one transaction. The session hold link, compile,
certificate, decision, receipt-ack hold, perception row, intent,
budget, terminal, and audit commit together or not at all. The
acknowledgement head is not updated. Isolation is the tenant RLS
predicate on `account_id`. Durability is the hash-chained audit event
`RECEIPT_ACK_HOLD_SEALED`.

Consistency beats a faster but lossy fan-out. A hold that copied counts
from a `NOT_ACKNOWLEDGED` acknowledgement would be a durable lie. The
engine would rather seal `NOT_ACK_HELD` with null counts than
reconstruct a reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null receipt-ack-hold code
  is **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected access
  paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one observation. A second nomination is
  rejected.
- The hold does not execute the tool, does not call the provider, and
  does not open another nested expiry.
- A reader other than the acknowledgement reader is rejected, which
  keeps one noisy agent from holding every principal in the account.
- Budgets cap hold, vector, and notify units so a retry loop cannot
  spend a neighbor's latency.
- Semantic topK is account-filtered and cannot record a hold.

These guards keep the 99.99% availability target. An autonomous agent
cannot turn one hold into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The hold path does not read a board. It reads one primary key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve the
path lead with `account_id`. There is no predicate that scans every
item on a board, every context packet, or every reader in the account.

Any plan that lacks both `account_id` and the observation key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this plane.
The columnar synopsis stays upstream. This plane does not re-aggregate
it.

## 16. Auditability and replay

Each seal appends `agent_acrh_audit_event` with
`event_kind = RECEIPT_ACK_HOLD_SEALED`, a 64-character event hash, and
a previous hash. Replay reads the acknowledgement head and the profile
receipt-ack-hold code and must reproduce `ack_hold_class`,
`ack_hold_reason`, the reader, and the three counts or their absence.
Replay does not call a model. The acknowledgement head and the hold row
are immutable after insert, so a later agent cannot edit history to
make a refused acknowledgement look held.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the
  acknowledgement reader. The function rejects the call. The
  acknowledgement head reader stays unchanged.
- **Forged hold on a refused acknowledgement:** the trigger reads the
  head by primary key and rejects `ack_hold_recorded` when
  `acknowledgement_recorded` is false.
- **Count laundering:** a held row whose counts differ from the head is
  rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The hold is not
  a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash` are
  rejected on the head and on the hold.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane does
  not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are rejected.
- **Steward reuse:** receipt-ack-hold stewards must be distinct from
  the reader, the consumer, the receipt-acknowledgement stewards, and
  every upstream steward.
- **Cross-tenant read:** forced RLS hides every row whose `account_id`
  does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is rejected.
  Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the hold transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The hold transaction performs one primary-key read and a fixed set of
  primary-key writes. It has no board fan-out.
- Counters: holds recorded, holds refused, full-scan rejects,
  steward-reuse rejects, second-reader rejects, and tool-execution
  rejects.
- A recorded hold with null counts, or a refused hold with any count,
  is a correctness page.
- An acknowledgement-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing holds.
2. Export acknowledgement heads for one canary account by primary key.
   Confirm heads are immutable and tenant-scoped.
3. Enable `record_agent_acrh_receipt_ack_hold` for that account.
   Compare recorded counts to the acknowledgement head.
4. Watch full-scan rejects and second-reader rejects. A spike means an
   agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW index.
   Do not enable tool execution inside the hold.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one hold for an acknowledged head with counts
  1/1/1 and lag 3 inside budget 5, leaves that head unchanged, and
  seals `ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD` for `principal:reader-1`.
- A not-acknowledged head with lag 8 keeps null counts,
  `NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD`, and the denied lag.
- Silence seals `NOT_ACK_HELD` with a null lag and null counts.
- A null day, a second nomination, a foreign receipt-ack-hold code, a
  fact body, a nested expiry, a packet scan, steward reuse, a hold on a
  not-acknowledged acknowledgement, a reader equal to the consumer,
  counts that differ from the head, an ack promoted to trust, tool
  execution, a mutated head, a mutated hold, a profile inserted as
  approved, a second reader, and an unscoped scan are rejected.
- `npm audit` reports no vulnerabilities in the validation toolchain.

## 21. Product decision

Ship the receipt-ack hold as a deterministic point lookup of an already
sealed acknowledgement. The hold copies the three counts only when
`acknowledgement_recorded` is true, names only the acknowledgement
reader, and leaves the acknowledgement head unchanged. `ACKED` is not
trust. The tool does not run. The plane does not open another nested
expiry.

The next increment should record one consumer-visible perception card
of one already `ACK_HELD` receipt-ack hold by point lookup of
`(account_id, utc_day, consumer_principal_id)`. Name the note
`agentic-admitted-count-ack-hold-card-plane.md`. Do not lengthen the
filename by nesting prior plane names. A `NOT_ACK_HELD` hold cannot be
perceived as received. The card copies the three counts only when
`ack_hold_recorded` is true. The reader on the card must equal the hold
reader and stay distinct from the consumer and every steward. The card
must not scan context packets, must not inline a fact body, must not
promote `ACKED` to `TRUSTED_ENROLLED`, must not execute the tool, must
not grant a second reader, and must not open another nested expiry
plane.
