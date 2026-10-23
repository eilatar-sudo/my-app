# mondayDB Agentic Admitted Count Receipt Acknowledgement Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-23.v1`

## 1. Why this plane, before how

The 2026-10-22 Admitted Count Binding Receipt Plane publishes one
binding receipt for one already sealed perception binding. The grain is
`(account_id, utc_day, consumer_principal_id)`. A `RECEIPTED` receipt
copies the three counts, names exactly the receipt reader, and seals
`BOUND_BINDING_RECEIPTED` with next action `RECEIPT_BOUND_BINDING`. A
`NOT_RECEIPTED` receipt seals `NOT_BOUND_BINDING_CANNOT_RECEIPT` with
null counts. That plane does not record a receipt acknowledgement.

Without this plane an agent either:

- treats `RECEIPT_BOUND_BINDING` itself as proof the runtime
  acknowledged the three counts, or
- walks context packets, tool logs, or a board with 1M+ rows to invent
  an acknowledgement (neighbor-harmful, and a miss against the 99.99%
  availability target).

The product trade-off is **acknowledgement honesty versus receipt
isolation**, and **acknowledgement latency versus a second reader**:

- Honesty: the consumer named on a `RECEIPTED` receipt should have one
  receipt acknowledgement that copies the three counts already on that
  receipt, without opening the receipt again.
- Isolation: the database does not call the provider and does not
  execute the tool. Recording the acknowledgement is a deterministic
  seal. A probabilistic agent stays outside the engine, so a slow or
  recursive tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_RECEIPTED` receipt cannot be acknowledged as
  received. The acknowledgement names the receipt reader and no one
  else. A second reader is a new request, and this plane rejects it.
- The receipt head is not rewritten. Replay of the receipt stays
  stable. The acknowledgement is a new row that cites the receipt by
  primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does not
  promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the acknowledgement is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed acknowledgement
plus the receipt id it cites. Neighbor availability stays at the 99.99%
target because an unscoped day walk, a reader list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved acknowledgement profile is procedural memory for "how
   one already sealed receipt becomes a single receipt
   acknowledgement." The profile names exactly one
   receipt-acknowledgement code and the one binding-receipt code that
   acknowledgement may cite. A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens another
   nested expiry plane.
2. A session nominates exactly one observation key. The acknowledgement
   then reads `agent_acra_receipt_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB records an acknowledgement only when the head is
   `RECEIPTED`, `receipt_recorded` is true, the receipt reason is
   `BOUND_BINDING_RECEIPTED`, the next action is
   `RECEIPT_BOUND_BINDING`, and the requested reader equals the receipt
   reader. The copy of the three counts is equality with the receipt.
   It does not call a model and it does not execute the tool.
4. `NOT_RECEIPTED` seals `NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE`
   with `acknowledgement_recorded = false` and null counts. Silence
   keeps a null lag. There is no acknowledgement that shows the receipt
   as received.
5. The reader equals the receipt reader and is distinct from the
   consumer and from every steward, including the two
   receipt-acknowledgement stewards and the two binding-receipt
   stewards. Two receipt-acknowledgement stewards witness the
   acknowledgement. They are distinct from the consumer, from the
   reader, from the binding-receipt stewards, and from the binding,
   perception, hold, acknowledgement, reader-receipt, grant, citation,
   provider, effect, bind, provider-receipt, card, admission,
   attestation, synopsis, and publication stewards.
6. Unscoped observation or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the nomination and
  the receipt acknowledgement?
- Was the acknowledgement a point lookup of an already sealed receipt,
  and what class did that receipt have?
- Did a `RECEIPTED` receipt acknowledge exactly its one reader and seal
  `RECEIPTED_RECEIPT_ACKNOWLEDGED` with the three receipt counts?
- Did a `NOT_RECEIPTED` receipt stay unacknowledged, with null counts
  and `NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the receipt head keep the class, the reader, and the counts it
  was exported with?
- Can the acknowledgement be replayed without invoking an LLM, and
  without executing the tool?

HNSW profile discovery stays account-scoped and never records this
acknowledgement.

## 2. Scope and ownership

The Admitted Count Receipt Acknowledgement Plane owns:

1. Immutable approved acknowledgement profiles as procedural memory,
   each naming one receipt-acknowledgement code for one
   binding-receipt code.
2. Tenant-scoped acknowledgement sessions with a hard cap of one
   nominated observation and the one reader already on that receipt.
3. Deterministic nomination of that observation, then one point lookup
   of the receipt head.
4. A receipt acknowledgement keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the
   receipt `reader_principal_id`.
5. An agent perception row that carries counts only when
   `acknowledgement_recorded` is true, which is only when
   `receipt_recorded` is true.
6. Audit events that cite the acknowledgement hash.

It integrates with, but does not replace:

- the binding receipt plane, which remains the exporter of
  `agent_acra_receipt_head`;
- the upstream binding, card, hold, and reader-receipt seals, which
  stay historical attributes on that head;
- Open API GraphQL, which is the only supported read and write surface
  for this plane;
- account-scoped pgvector discovery of approved profiles.

### Non-goals

- Opening another nested expiry plane.
- Executing the tool, calling the provider, or promoting `ACKED` to
  `TRUSTED_ENROLLED`.
- Inlining a fact body or scanning context packets.
- Granting a second reader.
- Rewriting the receipt head.
- A full scan of a board with 1M+ rows.

## 3. Product contract

### 3.1 Acknowledgement profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the receipt must already carry
  (one token, no list);
- the single `allowed_effect_code` the head must already carry (one
  token, no list);
- the single `allowed_provider_code` the head must already carry (one
  token, no list);
- the single `allowed_citation_code` the head must already carry (one
  token, no list);
- the single `allowed_grant_code` the head must already carry (one
  token, no list);
- the single `allowed_receipt_code` the head must already carry (the
  upstream reader-receipt code, one token, no list);
- the single `allowed_hold_code` the head must already carry (one
  token, no list);
- the single `allowed_perception_code` the head must already carry
  (one token, no list);
- the single `allowed_binding_code` the head must already carry (one
  token, no list);
- the single `allowed_binding_receipt_code` the head must already
  carry (one token, no list);
- the single `allowed_receipt_acknowledgement_code` this plane may
  seal (one token, no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- acknowledgement threshold (distinct receipt-acknowledgement
  stewards, minimum 2), max observations per session (exactly 1), max
  nominated observations (exactly 1), and max readers per observation
  (exactly 1);
- acknowledgement policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `ACKNOWLEDGEMENT_NEVER_EXECUTES_TOOL`,
  `ACKNOWLEDGEMENT_NEVER_INLINES_BODY`,
  `ACKNOWLEDGEMENT_NEVER_CONFIRMS`, `ONE_OBSERVATION_PER_SESSION`,
  `ONE_ACKNOWLEDGEMENT_PER_OBSERVATION`, `RECEIPT_READER_ONLY`,
  `POINT_LOOKUP_ONLY`, `RECEIPTED_RECEIPT_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `COUNTS_ONLY_WHEN_RECEIPT_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_ACKNOWLEDGEMENT`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so PostgreSQL
can store it as an enum label.

### 3.2 Session and budget contract

A session is opened against one approved profile version. It nominates
exactly one observation. The reader budget is exactly one, and that
reader must already be the receipt reader. Nominate, acknowledgement,
vector, and notify budgets are integers reserved before the
acknowledgement runs. A refused acknowledgement still consumes one
acknowledgement unit, because the refusal is a sealed row, not a retry
loop. Provider silence stays `UNKNOWN_EFFECT` and is not retried inside
the acknowledgement transaction.

### 3.3 Receipt head and nomination contract

Exporters insert `agent_acra_receipt_head` by primary key. The export
is a point copy of one sealed binding receipt. It is not a packet walk
and it is not a board scan. The head is immutable after insert.
`access_path` is `POINT_LOOKUP`. `inlines_fact_body`,
`opens_nested_expiry`, `ack_promoted_to_trust`, `packet_scan_used`,
and `executes_tool` are false. `attested_key_kind` is
`AWAITING_CONFIRMATION`. `body_visibility` is `OMITTED`. The body
rejects `factBody`, `fact_body`, and `resolvedFactHash`.

A `RECEIPTED` head carries `receipt_recorded = true`, reason
`BOUND_BINDING_RECEIPTED`, next action `RECEIPT_BOUND_BINDING`, and
the three counts. A `NOT_RECEIPTED` head carries null counts and
`NOT_BOUND_BINDING_CANNOT_RECEIPT`. A stop keeps the denied lag above
the budget. Silence keeps a null lag and next action
`OMIT_BINDING_RECEIPT`.

Nomination stores the same
`(account_id, utc_day, consumer_principal_id)` the acknowledgement
will read. A null day, a null consumer, or a null account is **FULL
SCAN REJECTED**. A second nomination in the same session is rejected.

### 3.4 Receipt acknowledgement contract

`record_agent_acra_receipt_acknowledgement` is the only compile that
writes a receipt acknowledgement. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one receipt head for that key, with `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`, `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, `packet_scan_used = false`, and
  `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` (`TRUSTED_ENROLLED` is
  rejected);
- `receipt_acknowledgement_code` equal to the profile's
  `allowed_receipt_acknowledgement_code`, and `binding_receipt_code`
  equal to the head receipt code and the profile binding-receipt code,
  each matching `^[a-z0-9:_-]{1,64}$` (one token, not a list and not a
  query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the receipt
  head, and distinct from the consumer, from both
  receipt-acknowledgement stewards, from both binding-receipt
  stewards, from both binding stewards, from both perception stewards,
  and from every hold, acknowledgement, reader-receipt, grant,
  citation, provider, effect, bind, provider-receipt, card, admission,
  attestation, synopsis, and publication steward;
- receipt-acknowledgement stewards distinct from each other and from
  those same principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That grain
holds one receipt acknowledgement and therefore the one receipt reader.
Projection is:

- `ACKNOWLEDGED` when the head receipt class is `RECEIPTED`,
  `receipt_recorded` is true, the receipt reason is
  `BOUND_BINDING_RECEIPTED`, and the next action is
  `RECEIPT_BOUND_BINDING`. The acknowledgement copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`.
  `acknowledgement_recorded` is true. `acknowledgement_reason` is
  `RECEIPTED_RECEIPT_ACKNOWLEDGED`. `trusted_next_action` is
  `ACKNOWLEDGE_RECEIPTED_RECEIPT`. The action acknowledges the three
  counts for that consumer and that one reader. It does not run the
  tool, it does not inline a fact body, and it does not open another
  nested expiry.
- `NOT_ACKNOWLEDGED` when the head next action is
  `STOP_BINDING_RECEIPT`. Counts stay null. `acknowledgement_reason`
  is `NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE`.
  `acknowledgement_recorded` is false. `trusted_next_action` is
  `STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT`. The denied lag is copied and
  is not cleared.
- `NOT_ACKNOWLEDGED` when the head admission class is `UNKNOWN_EFFECT`
  or the next action is `OMIT_BINDING_RECEIPT`. Counts stay null. The
  acknowledgement lag stays null. `acknowledgement_reason` is
  `NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE`.
  `acknowledgement_recorded` is false. `trusted_next_action` is
  `OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT`.

A `NOT_RECEIPTED` receipt cannot be acknowledged as received. The three
counts are copied only when `receipt_recorded` is true.
`acknowledgement_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as `effect_observation` when the
head observed it. It does not write `TRUSTED_ENROLLED`. The receipt
head is not updated. A second acknowledgement for the same consumer and
day is rejected. A reader other than the receipt reader is rejected, so
this plane does not grant a second reader. A forged acknowledged row
whose counts differ from the head is rejected. A forged acknowledged
row on a `NOT_RECEIPTED` head is rejected. A forged non-acknowledgement
that carries any count, or that sets `acknowledgement_recorded`, is
rejected. A receipt-acknowledgement code other than the profile code is
rejected before a row is sealed, so the caller can retry the one
allowed code. A null receipt-acknowledgement code is **FULL SCAN
REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acra_acknowledgement_perception`
for the agent. Counts appear there only when `acknowledgement_recorded`
is true. The perception names `receipt_acknowledgement_code`, the
receipt reader, and whether the acknowledgement was recorded.
Acknowledgement intents start as `PREPARED`. Provider silence stays
`UNKNOWN_EFFECT`. An acknowledgement of the notify is not enrollment,
not a fact restore, not a tool execution, and not a second reader.
This plane does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads with
   `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null receipt-acknowledgement
   code, or a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one observation. The access path is
   `POINT_LOOKUP`. One observation acknowledges its one reader.
4. The receipt head is immutable. The acknowledgement does not rewrite
   it and does not change its reader.
5. A successful acknowledgement is recorded only from a `RECEIPTED`
   head whose receipt reason is `BOUND_BINDING_RECEIPTED`, whose
   `receipt_recorded` is true, and whose next action is
   `RECEIPT_BOUND_BINDING`, and only for the profile's single
   receipt-acknowledgement code and the receipt reader.
6. `NOT_RECEIPTED` acknowledgements store null counts and
   `acknowledgement_recorded = false`. Silence stores a null lag. A
   `NOT_RECEIPTED` receipt cannot be acknowledged as received. Counts
   are copied only when `receipt_recorded` is true.
7. `ACKED` stays an effect observation. `AWAITING_CONFIRMATION` stays
   the key kind. `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`, and
   `executes_tool` stay false. The acknowledgement does not execute the
   tool.
9. The reader equals the receipt reader. The reader, the consumer, the
   receipt-acknowledgement stewards, the binding-receipt stewards, the
   binding stewards, the perception stewards, and the upstream stewards
   are pairwise distinct.
10. Semantic retrieval may rank profiles. It never records an
    acknowledgement.
11. The engine does not call a model. Replay is a pure function of the
    receipt head, the consumer id, the receipt reader, and the profile
    receipt-acknowledgement code.

## 5. Execution model

```text
approved profile (one allowed_receipt_acknowledgement_code)
  -> open session (one observation budget, the receipt reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read receipt head by primary key
  -> require reader = receipt reader
  -> project ACKNOWLEDGED or NOT_ACKNOWLEDGED
  -> append acknowledgement + perception + audit
  -> leave the receipt head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `ACKNOWLEDGE_RECEIPTED_RECEIPT` for both outcomes. The
class on the acknowledgement, not a second plane, distinguishes a
recorded acknowledgement from a refusal. Notify dispatch is a later
acknowledgement intent and may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one provider
   code, one citation code, one grant code, one reader-receipt code,
   one hold code, one perception code, one binding code, one
   binding-receipt code, and one receipt-acknowledgement code, and add
   one dual-control acknowledgement rule.
2. Approve it through `agent_acra_profile_authority`.
3. Export one receipt head per consumer and day. The export is a point
   copy of the binding receipt, not a packet walk.
4. Open a session and nominate one observation key.
5. Record the profile receipt-acknowledgement code for the receipt
   reader. Receipted receipts copy the counts and seal
   `RECEIPTED_RECEIPT_ACKNOWLEDGED`. Other receipts seal a
   non-acknowledgement with null counts.
6. The agent reads the perception row. A withheld perception has no
   count fields and `acknowledgementRecorded: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite acknowledgements already sealed.
8. This plane does not open another nested expiry. It does not run the
   tool. It does not grant a second reader.


## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type ReceiptAcknowledgementId = string;
export type UtcDay = string;
export type ReceiptAcknowledgementCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type ReceiptClass = "RECEIPTED" | "NOT_RECEIPTED";
export type ReceiptReason =
  | "BOUND_BINDING_RECEIPTED"
  | "NOT_BOUND_BINDING_CANNOT_RECEIPT";
export type ReceiptNextAction =
  | "RECEIPT_BOUND_BINDING"
  | "STOP_BINDING_RECEIPT"
  | "OMIT_BINDING_RECEIPT";
export type AcknowledgementClass = "ACKNOWLEDGED" | "NOT_ACKNOWLEDGED";
export type AcknowledgementReason =
  | "RECEIPTED_RECEIPT_ACKNOWLEDGED"
  | "NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE";
export type AcknowledgementNextAction =
  | "ACKNOWLEDGE_RECEIPTED_RECEIPT"
  | "STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT"
  | "OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const ACK_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface ReceiptHead {
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
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly receiptRecorded: boolean;
  readonly bindingRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: ReceiptNextAction;
}

export interface AgentReceiptAcknowledgement {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly receiptAcknowledgementId: ReceiptAcknowledgementId;
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
  readonly receiptAcknowledgementCode: ReceiptAcknowledgementCode;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly acknowledgementClass: AcknowledgementClass;
  readonly acknowledgementReason: AcknowledgementReason;
  readonly receiptRecorded: boolean;
  readonly acknowledgementRecorded: boolean;
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
  readonly trustedNextAction: AcknowledgementNextAction;
}

export function projectAgentReceiptAcknowledgement(
  head: ReceiptHead,
  receiptAcknowledgementId: ReceiptAcknowledgementId,
  readerPrincipalId: PrincipalId,
  receiptAcknowledgementCode: ReceiptAcknowledgementCode,
): AgentReceiptAcknowledgement {
  const readerIsReceiptReader = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    receiptAcknowledgementId,
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
    receiptAcknowledgementCode,
    admissionClass: head.admissionClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = ACK_TOKEN.test(receiptAcknowledgementCode);

  if (
    readerIsReceiptReader &&
    readerIsDistinct &&
    singleCode &&
    head.receiptClass === "RECEIPTED" &&
    head.receiptReason === "BOUND_BINDING_RECEIPTED" &&
    head.receiptRecorded &&
    head.bindingRecorded &&
    head.trustedNextAction === "RECEIPT_BOUND_BINDING" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      receiptClass: "RECEIPTED",
      acknowledgementClass: "ACKNOWLEDGED",
      acknowledgementReason: "RECEIPTED_RECEIPT_ACKNOWLEDGED",
      receiptRecorded: true,
      acknowledgementRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "ACKNOWLEDGE_RECEIPTED_RECEIPT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_BINDING_RECEIPT";

  return {
    ...shared,
    receiptClass: "NOT_RECEIPTED",
    receiptRecorded: false,
    acknowledgementClass: "NOT_ACKNOWLEDGED",
    acknowledgementReason: "NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE",
    acknowledgementRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit
      ? "OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT"
      : "STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT",
  };
}
```

```ts
export function acknowledgementOmitsUnreceiptedReceipt(
  acknowledgement: AgentReceiptAcknowledgement,
): boolean {
  return (
    acknowledgement.acknowledgementRecorded === false &&
    acknowledgement.acknowledgementClass === "NOT_ACKNOWLEDGED" &&
    acknowledgement.receiptRecorded === false &&
    acknowledgement.receiptClass === "NOT_RECEIPTED" &&
    acknowledgement.sealedCount === null &&
    acknowledgement.deniedCount === null &&
    acknowledgement.unknownEffectCount === null &&
    acknowledgement.ackPromotedToTrust === false &&
    acknowledgement.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    acknowledgement.executesTool === false
  );
}
```

`projectAgentReceiptAcknowledgement` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`. It never
copies counts off a receipt whose `receipt_recorded` is false. It
never executes the tool. An acknowledgement token that is not a single
code, or a reader other than the receipt reader, projects to
`NOT_ACKNOWLEDGED`. The database additionally requires the token to
equal the approved profile receipt-acknowledgement code, requires the
reader to equal the receipt reader, and rejects a reader who collides
with the consumer or any steward, before it seals `ACKNOWLEDGED`. A
mismatched reader is rejected rather than sealed, so the plane does not
grant a second reader.


## 8. SQL row-store schema

```sql
CREATE TYPE acra_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acra_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acra_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acra_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acra_hold_class AS ENUM ('HELD', 'NOT_HELD');
CREATE TYPE acra_hold_reason AS ENUM (
  'ACKNOWLEDGED_OBSERVATION_HELD',
  'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
);
CREATE TYPE acra_card_class AS ENUM ('PERCEIVED', 'NOT_PERCEIVED');
CREATE TYPE acra_card_reason AS ENUM (
  'HELD_OBSERVATION_PERCEIVED',
  'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
);
CREATE TYPE acra_binding_class AS ENUM ('BOUND', 'NOT_BOUND');
CREATE TYPE acra_binding_reason AS ENUM (
  'PERCEIVED_OBSERVATION_BOUND',
  'NOT_PERCEIVED_CARD_CANNOT_BIND'
);
CREATE TYPE acra_receipt_next AS ENUM (
  'RECEIPT_BOUND_BINDING',
  'STOP_BINDING_RECEIPT',
  'OMIT_BINDING_RECEIPT'
);
CREATE TYPE acra_receipt_class AS ENUM ('RECEIPTED', 'NOT_RECEIPTED');
CREATE TYPE acra_receipt_reason AS ENUM (
  'BOUND_BINDING_RECEIPTED',
  'NOT_BOUND_BINDING_CANNOT_RECEIPT'
);
CREATE TYPE acra_acknowledgement_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE acra_acknowledgement_reason AS ENUM (
  'RECEIPTED_RECEIPT_ACKNOWLEDGED',
  'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE'
);
CREATE TYPE acra_acknowledgement_next AS ENUM (
  'ACKNOWLEDGE_RECEIPTED_RECEIPT',
  'STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT',
  'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT'
);
CREATE TYPE acra_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acra_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acra_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acra_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acra_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acra_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acra_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acra_compile_kind AS ENUM ('ACKNOWLEDGE_RECEIPTED_RECEIPT');
CREATE TYPE acra_terminal_kind AS ENUM (
  'ACKNOWLEDGEMENT_RECORDED',
  'ACKNOWLEDGEMENT_REFUSED'
);
CREATE TYPE acra_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_ACKNOWLEDGEMENT',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acra_profile_authority NOLOGIN;

CREATE FUNCTION acra_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acra_authorization_evidence (
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

CREATE TABLE agent_acra_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acra_profile_status NOT NULL,
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
  acknowledgement_threshold INTEGER NOT NULL CHECK (acknowledgement_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acra_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acra_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acra_profile_acknowledgement_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acra_admission_class[] NOT NULL,
  acknowledgement_threshold INTEGER NOT NULL CHECK (acknowledgement_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  require_dual_control_acknowledgement BOOLEAN NOT NULL,
  receipt_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acra_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acra_receipt_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  binding_receipt_id UUID NOT NULL,
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
  admission_class acra_admission_class NOT NULL,
  hold_class acra_hold_class NOT NULL,
  card_class acra_card_class NOT NULL,
  binding_class acra_binding_class NOT NULL,
  receipt_class acra_receipt_class NOT NULL,
  hold_reason acra_hold_reason NOT NULL,
  card_reason acra_card_reason NOT NULL,
  binding_reason acra_binding_reason NOT NULL,
  receipt_reason acra_receipt_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  freshness_class acra_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acra_effect_observation NOT NULL,
  attested_key_kind acra_key_kind NOT NULL,
  fact_disposition acra_fact_disposition NOT NULL,
  body_visibility acra_body_visibility NOT NULL,
  metadata_trust acra_metadata_trust NOT NULL,
  access_path acra_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acra_receipt_next NOT NULL,
  binding_receipt_steward_a TEXT NOT NULL,
  binding_receipt_steward_b TEXT NOT NULL,
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
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, perception_binding_id),
  UNIQUE (account_id, binding_receipt_id),
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
  CHECK (NOT (receipt_body ? 'factBody')),
  CHECK (NOT (receipt_body ? 'fact_body')),
  CHECK (NOT (receipt_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acra_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acra_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_acknowledgement_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_acknowledgement_units INTEGER NOT NULL,
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
    REFERENCES agent_acra_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acra_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acra_observation_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acra_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id)
);

CREATE TABLE agent_acra_observation_acknowledgement (
  account_id BIGINT NOT NULL,
  acknowledgement_link_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  admission_class acra_admission_class NOT NULL,
  binding_class acra_binding_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, acknowledgement_link_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acra_receipt_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acra_acknowledgement_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_acknowledgement_code TEXT NOT NULL,
  admission_class acra_admission_class NOT NULL,
  receipt_class acra_receipt_class NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  acknowledgement_hash TEXT NOT NULL CHECK (char_length(acknowledgement_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acra_acknowledgement_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  receipt_acknowledgement_code TEXT NOT NULL,
  binding_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  acknowledgement_hash TEXT NOT NULL CHECK (char_length(acknowledgement_hash) = 64),
  admission_class acra_admission_class NOT NULL,
  binding_class acra_binding_class NOT NULL,
  receipt_class acra_receipt_class NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
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
  sealed_revision INTEGER NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acra_acknowledgement_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acra_acknowledgement_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_acknowledgement_code TEXT NOT NULL,
  compile_kind acra_compile_kind NOT NULL,
  admission_class acra_admission_class NOT NULL,
  binding_class acra_binding_class NOT NULL,
  receipt_class acra_receipt_class NOT NULL,
  freshness_class acra_freshness_class NOT NULL,
  effect_observation acra_effect_observation NOT NULL,
  attested_key_kind acra_key_kind NOT NULL,
  fact_disposition acra_fact_disposition NOT NULL,
  body_visibility acra_body_visibility NOT NULL,
  access_path acra_access_path NOT NULL,
  metadata_trust acra_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  acknowledgement_hash TEXT NOT NULL CHECK (char_length(acknowledgement_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acra_acknowledgement_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acra_receipt_acknowledgement (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
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
  binding_receipt_code TEXT NOT NULL CHECK (binding_receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acra_admission_class NOT NULL,
  hold_class acra_hold_class NOT NULL,
  card_class acra_card_class NOT NULL,
  binding_class acra_binding_class NOT NULL,
  receipt_class acra_receipt_class NOT NULL,
  acknowledgement_class acra_acknowledgement_class NOT NULL,
  hold_reason acra_hold_reason NOT NULL,
  card_reason acra_card_reason NOT NULL,
  binding_reason acra_binding_reason NOT NULL,
  receipt_reason acra_receipt_reason NOT NULL,
  acknowledgement_reason acra_acknowledgement_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acra_effect_observation NOT NULL,
  attested_key_kind acra_key_kind NOT NULL,
  fact_disposition acra_fact_disposition NOT NULL,
  body_visibility acra_body_visibility NOT NULL,
  metadata_trust acra_metadata_trust NOT NULL,
  access_path acra_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acra_acknowledgement_next NOT NULL,
  receipt_acknowledgement_steward_a TEXT NOT NULL,
  receipt_acknowledgement_steward_b TEXT NOT NULL,
  binding_receipt_steward_a TEXT NOT NULL,
  binding_receipt_steward_b TEXT NOT NULL,
  binding_steward_a TEXT NOT NULL,
  binding_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  acknowledgement_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, receipt_acknowledgement_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acra_acknowledgement_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acra_receipt_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (acknowledgement_body ? 'resolvedFactHash')),
  CHECK (
    (receipt_recorded = true AND receipt_class = 'RECEIPTED'
      AND binding_recorded = true AND binding_class = 'BOUND'
      AND card_recorded = true AND card_class = 'PERCEIVED'
      AND hold_recorded = true AND hold_class = 'HELD'
      AND receipt_issued = true
      AND trusted_next_action = 'ACKNOWLEDGE_RECEIPTED_RECEIPT'
      AND acknowledgement_recorded = true
      AND acknowledgement_class = 'ACKNOWLEDGED'
      AND acknowledgement_reason = 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
      AND receipt_reason = 'BOUND_BINDING_RECEIPTED'
      AND binding_reason = 'PERCEIVED_OBSERVATION_BOUND'
      AND sealed_count IS NOT NULL
      AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL
      AND acknowledgement_body ? 'sealedCount'
      AND acknowledgement_body ? 'deniedCount'
      AND acknowledgement_body ? 'unknownEffectCount')
    OR (receipt_recorded = false AND receipt_class = 'NOT_RECEIPTED'
      AND binding_recorded = false AND binding_class = 'NOT_BOUND'
      AND card_recorded = false AND card_class = 'NOT_PERCEIVED'
      AND hold_recorded = false AND hold_class = 'NOT_HELD'
      AND receipt_issued = false
      AND acknowledgement_recorded = false
      AND acknowledgement_class = 'NOT_ACKNOWLEDGED'
      AND acknowledgement_reason = 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE'
      AND receipt_reason = 'NOT_BOUND_BINDING_CANNOT_RECEIPT'
      AND binding_reason = 'NOT_PERCEIVED_CARD_CANNOT_BIND'
      AND trusted_next_action IN ('STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT', 'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT')
      AND sealed_count IS NULL
      AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND NOT (acknowledgement_body ? 'sealedCount')
      AND NOT (acknowledgement_body ? 'deniedCount')
      AND NOT (acknowledgement_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acra_acknowledgement_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
  receipt_acknowledgement_code TEXT NOT NULL,
  receipt_class acra_receipt_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acra_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acra_acknowledgement_next NOT NULL,
  acknowledgement_perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (acknowledgement_perception_body ? 'factBody')),
  CHECK (NOT (acknowledgement_perception_body ? 'fact_body')),
  CHECK (NOT (acknowledgement_perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acra_acknowledgement_intent (
  account_id BIGINT NOT NULL,
  acknowledgement_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acra_intent_status NOT NULL,
  acknowledgement_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, acknowledgement_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acra_acknowledgement_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acra_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id)
);

CREATE TABLE agent_acra_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acra_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id)
);

CREATE TABLE agent_acra_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id)
);

CREATE TABLE agent_acra_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acra_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acra_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acra_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acra_session (account_id, session_id)
);
CREATE FUNCTION protect_agent_acra_profile()
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
      IF current_setting('app.acra_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acra_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acra_profile_protect
BEFORE INSERT OR UPDATE ON agent_acra_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_profile();

CREATE FUNCTION protect_agent_acra_acknowledgement_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acra_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acra_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed receipt rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acra_acknowledgement_rule_protect
BEFORE UPDATE ON agent_acra_profile_acknowledgement_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_acknowledgement_rule();

CREATE FUNCTION protect_agent_acra_receipt_head()
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
     OR NEW.receipt_body ? 'factBody'
     OR NEW.receipt_body ? 'fact_body'
     OR NEW.receipt_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NOT acra_parties_are_distinct(ARRAY[
       NEW.reader_principal_id, NEW.consumer_principal_id,
       NEW.binding_receipt_steward_a, NEW.binding_receipt_steward_b,
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

  IF NEW.binding_class = 'BOUND' OR NEW.binding_recorded THEN
    IF NEW.binding_recorded IS DISTINCT FROM TRUE
       OR NEW.binding_class IS DISTINCT FROM 'BOUND'
       OR NEW.binding_reason IS DISTINCT FROM 'PERCEIVED_OBSERVATION_BOUND'
       OR NEW.trusted_next_action IS DISTINCT FROM 'RECEIPT_BOUND_BINDING'
       OR NEW.card_recorded IS DISTINCT FROM TRUE
       OR NEW.card_class IS DISTINCT FROM 'PERCEIVED'
       OR NEW.card_reason IS DISTINCT FROM 'HELD_OBSERVATION_PERCEIVED'
       OR NEW.hold_recorded IS DISTINCT FROM TRUE
       OR NEW.hold_class IS DISTINCT FROM 'HELD'
       OR NEW.hold_reason IS DISTINCT FROM 'ACKNOWLEDGED_OBSERVATION_HELD'
       OR NEW.receipt_issued IS DISTINCT FROM TRUE
       OR NEW.receipt_recorded IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'RECEIPTED'
       OR NEW.receipt_reason IS DISTINCT FROM 'BOUND_BINDING_RECEIPTED'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.receipt_body ? 'sealedCount')
       OR NOT (NEW.receipt_body ? 'deniedCount')
       OR NOT (NEW.receipt_body ? 'unknownEffectCount') THEN
      RAISE EXCEPTION 'bound binding head must carry the binding counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.binding_reason IS DISTINCT FROM 'NOT_PERCEIVED_CARD_CANNOT_BIND'
     OR NEW.binding_class IS DISTINCT FROM 'NOT_BOUND'
     OR NEW.binding_recorded
     OR NEW.card_recorded
     OR NEW.card_class IS DISTINCT FROM 'NOT_PERCEIVED'
     OR NEW.card_reason IS DISTINCT FROM 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
     OR NEW.hold_recorded
     OR NEW.hold_class IS DISTINCT FROM 'NOT_HELD'
     OR NEW.hold_reason IS DISTINCT FROM 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
     OR NEW.receipt_issued
     OR NEW.receipt_recorded
     OR NEW.receipt_class IS DISTINCT FROM 'NOT_RECEIPTED'
     OR NEW.receipt_reason IS DISTINCT FROM 'NOT_BOUND_BINDING_CANNOT_RECEIPT'
     OR NEW.receipt_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not bound binding head cannot be shown as received';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_BINDING_RECEIPT' THEN
      RAISE EXCEPTION 'silence is not a receipted binding';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_BINDING_RECEIPT' THEN
      RAISE EXCEPTION 'denied binding head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'binding head class is not receiptable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acra_receipt_head_protect
BEFORE INSERT OR UPDATE ON agent_acra_receipt_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_receipt_head();

CREATE FUNCTION protect_agent_acra_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.acknowledgement_hash IS DISTINCT FROM NEW.acknowledgement_hash
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

CREATE TRIGGER agent_acra_decision_protect
BEFORE INSERT OR UPDATE ON agent_acra_acknowledgement_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_decision();

CREATE FUNCTION protect_agent_acra_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acra_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
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
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acra_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acra_acknowledgement_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_certificate();

CREATE FUNCTION protect_agent_acra_acknowledgement_intent()
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
     OR OLD.acknowledgement_idempotency_key IS DISTINCT FROM NEW.acknowledgement_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared receipt identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acra_acknowledgement_intent_protect
BEFORE INSERT OR UPDATE ON agent_acra_acknowledgement_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_acknowledgement_intent();

CREATE FUNCTION protect_agent_acra_receipt_acknowledgement()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_receipt$
DECLARE
  v_head agent_acra_receipt_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
  v_hold TEXT;
  v_perception TEXT;
  v_binding TEXT;
  v_allowed_acknowledgement TEXT;
  v_allowed_cited_receipt TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt acknowledgement is immutable';
  END IF;

  IF NEW.executes_tool THEN
    RAISE EXCEPTION 'tool execution inside the receipt';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.acknowledgement_body ? 'factBody'
     OR NEW.acknowledgement_body ? 'fact_body'
     OR NEW.acknowledgement_body ? 'resolvedFactHash'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'receipt fence';
  END IF;

  IF NEW.receipt_acknowledgement_code IS NULL OR NEW.receipt_acknowledgement_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acra_receipt_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'receipt head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the receipt reader';
  END IF;

  IF NOT acra_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
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
     OR NEW.binding_receipt_code IS DISTINCT FROM v_head.binding_receipt_code
     OR NEW.perception_steward_a IS DISTINCT FROM v_head.perception_steward_a
     OR NEW.perception_steward_b IS DISTINCT FROM v_head.perception_steward_b
     OR NEW.perception_binding_id IS DISTINCT FROM v_head.perception_binding_id THEN
    RAISE EXCEPTION 'acknowledgement must cite the sealed receipt';
  END IF;

  IF NEW.receipt_class = 'RECEIPTED' OR NEW.receipt_recorded THEN
    IF v_head.binding_class IS DISTINCT FROM 'BOUND'
       OR v_head.binding_recorded IS DISTINCT FROM TRUE
       OR v_head.receipt_class IS DISTINCT FROM 'RECEIPTED'
       OR v_head.receipt_recorded IS DISTINCT FROM TRUE
       OR v_head.receipt_reason IS DISTINCT FROM 'BOUND_BINDING_RECEIPTED'
       OR v_head.binding_reason IS DISTINCT FROM 'PERCEIVED_OBSERVATION_BOUND'
       OR v_head.trusted_next_action IS DISTINCT FROM 'RECEIPT_BOUND_BINDING' THEN
      RAISE EXCEPTION 'not receipted receipt cannot be acknowledged as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.receipt_reason IS DISTINCT FROM 'BOUND_BINDING_RECEIPTED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'RECEIPTED_RECEIPT_ACKNOWLEDGED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'ACKNOWLEDGE_RECEIPTED_RECEIPT'
       OR NEW.binding_recorded IS DISTINCT FROM TRUE
       OR NEW.receipt_recorded IS DISTINCT FROM TRUE
       OR NEW.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'RECEIPTED'
       OR NEW.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED' THEN
      RAISE EXCEPTION 'receipted binding must copy the head counts';
    END IF;
  ELSE
    IF v_head.binding_class IS DISTINCT FROM 'NOT_BOUND'
       OR v_head.binding_recorded
       OR v_head.receipt_class IS DISTINCT FROM 'NOT_RECEIPTED'
       OR v_head.receipt_recorded THEN
      RAISE EXCEPTION 'receipted receipt must show the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.acknowledgement_body ? 'sealedCount'
       OR NEW.receipt_recorded
       OR NEW.acknowledgement_recorded
       OR NEW.binding_recorded
       OR NEW.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE'
       OR NEW.receipt_reason IS DISTINCT FROM 'NOT_BOUND_BINDING_CANNOT_RECEIPT' THEN
      RAISE EXCEPTION 'not receipted receipt cannot be acknowledged as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_BINDING_RECEIPT' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT' THEN
        RAISE EXCEPTION 'silence cannot be shown as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused binding must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_hold_code, p.allowed_perception_code, p.allowed_binding_code,
         p.allowed_binding_receipt_code, p.allowed_receipt_acknowledgement_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt,
         v_hold, v_perception, v_binding, v_allowed_cited_receipt, v_allowed_acknowledgement
  FROM agent_acra_session AS s
  JOIN agent_acra_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_allowed_acknowledgement IS NULL
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
    RAISE EXCEPTION 'binding receipt code is not the profile receipt';
  END IF;

  RETURN NEW;
END
$protect_receipt$;

CREATE TRIGGER agent_acra_receipt_acknowledgement_protect
BEFORE INSERT OR UPDATE ON agent_acra_receipt_acknowledgement
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_receipt_acknowledgement();

CREATE FUNCTION protect_agent_acra_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.acknowledgement_perception_body ? 'factBody'
     OR NEW.acknowledgement_perception_body ? 'fact_body'
     OR NEW.acknowledgement_perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.receipt_class = 'NOT_RECEIPTED'
     AND (NEW.receipt_recorded
          OR NEW.binding_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.acknowledgement_perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not bound binding cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acra_perception_protect
BEFORE INSERT OR UPDATE ON agent_acra_acknowledgement_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acra_perception();

CREATE FUNCTION approve_agent_acra_profile(
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
  stored_status acra_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acra_profile
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
  FROM agent_acra_profile_acknowledgement_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_acknowledgement IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control receipt rule';
  END IF;

  PERFORM set_config(
    'app.acra_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acra_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acra_profile(
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
  stored_status acra_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acra_profile
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
    'app.acra_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acra_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acra_observation(
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
  v_session_status acra_session_status;
  v_profile_status acra_profile_status;
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
    FROM agent_acra_observation_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one observation per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acra_session AS s
  JOIN agent_acra_profile AS pr
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

  INSERT INTO agent_acra_observation_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;
CREATE FUNCTION record_agent_acra_receipt_acknowledgement(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_receipt_acknowledgement_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_acknowledgement_id UUID,
  p_acknowledgement_digest TEXT,
  p_receipt_acknowledgement_steward_a TEXT,
  p_receipt_acknowledgement_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acra_session_status;
  v_profile_status acra_profile_status;
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
  v_allowed_cited_receipt TEXT;
  v_principal TEXT;
  v_head agent_acra_receipt_head%ROWTYPE;
  v_receipt_class acra_receipt_class;
  v_binding_class acra_binding_class;
  v_card_class acra_card_class;
  v_hold_class acra_hold_class;
  v_reason acra_receipt_reason;
  v_binding_reason acra_binding_reason;
  v_card_reason acra_card_reason;
  v_hold_reason acra_hold_reason;
  v_receipt_recorded BOOLEAN;
  v_ack_class acra_acknowledgement_class;
  v_ack_reason acra_acknowledgement_reason;
  v_ack_recorded BOOLEAN;
  v_binding_recorded BOOLEAN;
  v_card_recorded BOOLEAN;
  v_hold_recorded BOOLEAN;
  v_receipt_issued BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acra_acknowledgement_next;
  v_terminal acra_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_receipt_acknowledgement_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_acknowledgement_digest) <> 64 THEN
    RAISE EXCEPTION 'receipt digest must be 64 hex characters';
  END IF;

  IF p_receipt_acknowledgement_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acra_observation_nomination
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
         pr.allowed_receipt_acknowledgement_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_hold, v_allowed_perception, v_allowed_binding,
         v_allowed_cited_receipt, v_allowed_acknowledgement_code, v_principal
  FROM agent_acra_session AS s
  JOIN agent_acra_profile AS pr
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

  IF p_receipt_acknowledgement_code IS DISTINCT FROM v_allowed_acknowledgement_code THEN
    RAISE EXCEPTION 'receipt acknowledgement code is not the profile acknowledgement';
  END IF;

  SELECT * INTO v_head
  FROM agent_acra_receipt_head
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
     OR v_head.binding_receipt_code IS DISTINCT FROM v_allowed_cited_receipt THEN
    RAISE EXCEPTION 'binding code is not the profile binding';
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
     OR v_head.receipt_body ? 'factBody'
     OR v_head.receipt_body ? 'fact_body'
     OR v_head.receipt_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'receipt fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acra_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_receipt_acknowledgement_steward_a, p_receipt_acknowledgement_steward_b,
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
    RAISE EXCEPTION 'reader must equal the receipt reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acra_receipt_acknowledgement
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'binding receipt already recorded';
  END IF;

  IF v_head.binding_class = 'BOUND'
     AND v_head.binding_reason = 'PERCEIVED_OBSERVATION_BOUND'
     AND v_head.binding_recorded
     AND v_head.card_recorded
     AND v_head.hold_recorded
     AND v_head.receipt_issued
     AND v_head.card_class = 'PERCEIVED'
     AND v_head.card_reason = 'HELD_OBSERVATION_PERCEIVED'
     AND v_head.hold_class = 'HELD'
     AND v_head.hold_reason = 'ACKNOWLEDGED_OBSERVATION_HELD'
     AND v_head.trusted_next_action = 'RECEIPT_BOUND_BINDING'
     AND v_head.receipt_class = 'RECEIPTED'
     AND v_head.receipt_reason = 'BOUND_BINDING_RECEIPTED'
     AND v_head.receipt_recorded
     AND v_head.admission_class = 'ADMITTED' THEN
    v_receipt_class := 'RECEIPTED';
    v_ack_class := 'ACKNOWLEDGED';
    v_ack_reason := 'RECEIPTED_RECEIPT_ACKNOWLEDGED';
    v_ack_recorded := true;
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
    v_next := 'ACKNOWLEDGE_RECEIPTED_RECEIPT';
    v_terminal := 'ACKNOWLEDGEMENT_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_BINDING_RECEIPT' THEN
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
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_receipt_issued := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT';
    v_terminal := 'ACKNOWLEDGEMENT_REFUSED';
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
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_receipt_issued := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT';
    v_terminal := 'ACKNOWLEDGEMENT_REFUSED';
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
    'receiptAcknowledgementCode', p_receipt_acknowledgement_code,
    'admissionClass', v_head.admission_class,
    'bindingClass', v_binding_class,
    'receiptClass', v_receipt_class,
    'receiptReason', v_reason,
    'acknowledgementClass', v_ack_class,
    'acknowledgementReason', v_ack_reason,
    'bindingRecorded', v_binding_recorded,
    'receiptRecorded', v_receipt_recorded,
    'acknowledgementRecorded', v_ack_recorded,
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
  IF v_receipt_recorded THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acra_observation_acknowledgement (
    account_id, acknowledgement_link_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, perception_binding_id, admission_class, binding_class,
    binding_recorded, acknowledged_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.perception_binding_id, v_head.admission_class,
    v_head.binding_class, v_head.binding_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acra_acknowledgement_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, receipt_acknowledgement_code, admission_class, receipt_class,
    receipt_recorded, acknowledgement_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_receipt_acknowledgement_code, v_head.admission_class, v_receipt_class,
    v_receipt_recorded, p_acknowledgement_digest, clock_timestamp()
  );

  INSERT INTO agent_acra_acknowledgement_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, receipt_acknowledgement_code, binding_code, provider_code,
    acknowledgement_hash, admission_class, binding_class, receipt_class, receipt_recorded,
    receipt_acknowledgement_steward_a, receipt_acknowledgement_steward_b,
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
    p_reader_principal, p_utc_day, p_receipt_acknowledgement_code, v_head.binding_code,
    v_head.provider_code, p_acknowledgement_digest, v_head.admission_class, v_binding_class,
    v_receipt_class, v_receipt_recorded,
    p_receipt_acknowledgement_steward_a, p_receipt_acknowledgement_steward_b,
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

  INSERT INTO agent_acra_acknowledgement_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, receipt_acknowledgement_code, compile_kind,
    admission_class, binding_class, receipt_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    receipt_recorded, executes_tool, lag_publications, max_lag_budget, acknowledgement_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_receipt_acknowledgement_code,
    'ACKNOWLEDGE_RECEIPTED_RECEIPT',
    v_head.admission_class, v_binding_class, v_receipt_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_receipt_recorded, false, v_lag, v_head.max_lag_budget, p_acknowledgement_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acra_receipt_acknowledgement (
    account_id, utc_day, consumer_principal_id, receipt_acknowledgement_id, session_id,
    certificate_id, perception_binding_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, hold_code,
    perception_code, binding_code, receipt_acknowledgement_code, binding_receipt_code,
    admission_class, hold_class, card_class, binding_class, receipt_class,
    acknowledgement_class, hold_reason, card_reason, binding_reason, receipt_reason,
    acknowledgement_reason, hold_recorded, card_recorded, receipt_issued, binding_recorded,
    receipt_recorded, acknowledgement_recorded, sealed_count, denied_count,
    unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust, access_path,
    inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
    executes_tool, trusted_next_action, receipt_acknowledgement_steward_a,
    receipt_acknowledgement_steward_b, binding_receipt_steward_a, binding_receipt_steward_b,
    binding_steward_a, binding_steward_b, perception_steward_a, perception_steward_b,
    acknowledgement_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_acknowledgement_id, p_session_id,
    p_certificate_id, v_head.perception_binding_id, p_reader_principal,
    v_head.purpose_code, v_head.effect_code, v_head.provider_code, v_head.citation_code,
    v_head.grant_code, v_head.receipt_code, v_head.hold_code, v_head.perception_code,
    v_head.binding_code, p_receipt_acknowledgement_code, v_head.binding_receipt_code,
    v_head.admission_class, v_hold_class, v_card_class, v_binding_class, v_receipt_class,
    v_ack_class, v_hold_reason, v_card_reason, v_binding_reason, v_reason,
    v_ack_reason, v_hold_recorded, v_card_recorded, v_receipt_issued, v_binding_recorded,
    v_receipt_recorded, v_ack_recorded, v_sealed, v_denied, v_unknown, v_lag,
    v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, false, v_next,
    p_receipt_acknowledgement_steward_a, p_receipt_acknowledgement_steward_b,
    v_head.binding_receipt_steward_a, v_head.binding_receipt_steward_b,
    v_head.binding_steward_a, v_head.binding_steward_b,
    v_head.perception_steward_a, v_head.perception_steward_b,
    v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acra_acknowledgement_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, receipt_acknowledgement_id,
    receipt_acknowledgement_code, receipt_class, binding_recorded, receipt_recorded, sealed_count,
    denied_count, unknown_effect_count, attested_key_kind, ack_promoted_to_trust,
    trusted_next_action, acknowledgement_perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_acknowledgement_id,
    p_receipt_acknowledgement_code, v_receipt_class, v_binding_recorded, v_receipt_recorded,
    v_sealed, v_denied, v_unknown, 'AWAITING_CONFIRMATION', false, v_next, v_body,
    clock_timestamp()
  );

  INSERT INTO agent_acra_acknowledgement_intent (
    account_id, acknowledgement_intent_id, session_id, certificate_id, intent_status,
    acknowledgement_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_acknowledgement_id, p_session_id, p_certificate_id, 'PREPARED',
    p_acknowledgement_id::TEXT, 1, p_acknowledgement_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acra_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_acknowledgement_id, p_session_id, 'ACKNOWLEDGEMENT', 1, clock_timestamp()
  );

  INSERT INTO agent_acra_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acra_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'RECEIPT_ACKNOWLEDGEMENT_SEALED',
    p_acknowledgement_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acra_session
  SET consumed_acknowledgement_units = consumed_acknowledgement_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$publish$;

CREATE FUNCTION reject_agent_acra_unscoped_scan(
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

ALTER FUNCTION approve_agent_acra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acra_profile_authority;
ALTER FUNCTION revoke_agent_acra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acra_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acra_profile_authority;
GRANT SELECT ON
  agent_acra_profile,
  agent_acra_profile_acknowledgement_rule
TO agent_acra_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acra_profile TO agent_acra_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acra_profile FROM PUBLIC;

CREATE INDEX agent_acra_session_work_idx ON agent_acra_session (
  account_id,
  status
);
CREATE INDEX agent_acra_session_profile_idx ON agent_acra_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acra_head_consumer_idx ON agent_acra_receipt_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acra_nomination_session_idx ON agent_acra_observation_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acra_certificate_session_idx ON agent_acra_acknowledgement_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acra_decision_cert_idx ON agent_acra_acknowledgement_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acra_receipt_consumer_idx ON agent_acra_receipt_acknowledgement (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acra_receipt_reader_idx ON agent_acra_receipt_acknowledgement (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acra_perception_day_idx ON agent_acra_acknowledgement_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acra_intent_work_idx ON agent_acra_acknowledgement_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acra_audit_time_idx ON agent_acra_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acra_command_expiry_idx ON agent_acra_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acra_checkpoint_day_idx ON agent_acra_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acra_observation_acknowledgement_day_idx ON agent_acra_observation_acknowledgement (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acra_authorization_evidence',
    'agent_acra_profile',
    'agent_acra_profile_acknowledgement_rule',
    'agent_acra_receipt_head',
    'agent_acra_session',
    'agent_acra_observation_nomination',
    'agent_acra_observation_acknowledgement',
    'agent_acra_acknowledgement_compile',
    'agent_acra_acknowledgement_certificate',
    'agent_acra_acknowledgement_decision',
    'agent_acra_receipt_acknowledgement',
    'agent_acra_acknowledgement_perception',
    'agent_acra_acknowledgement_intent',
    'agent_acra_budget_ledger',
    'agent_acra_terminal_record',
    'agent_acra_command_result',
    'agent_acra_audit_head',
    'agent_acra_audit_event',
    'agent_acra_audit_anchor',
    'agent_acra_projection_checkpoint'
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
triggers. A successful receipt on a `NOT_RECEIPTED` receipt, a trusted key,
a packet scan, a fact body, a tool execution flag, or a nested expiry
flag is rejected. The receipt head cannot be updated to launder a
refused receipt into a receipted observation. A reader other than the
receipt reader is rejected, so the insert does not grant a second
reader.

The reference check executes this schema fence, including
`acra_session_status`, the triggers, and
`record_agent_acra_receipt_acknowledgement`, as one database session.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcraAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcraReceiptClass {
  RECEIPTED
  NOT_RECEIPTED
}

enum AcraAcknowledgementClass {
  ACKNOWLEDGED
  NOT_ACKNOWLEDGED
}

enum AcraAcknowledgementReason {
  RECEIPTED_RECEIPT_ACKNOWLEDGED
  NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE
}

enum AcraNextAction {
  ACKNOWLEDGE_RECEIPTED_RECEIPT
  STOP_BINDING_RECEIPT_ACKNOWLEDGEMENT
  OMIT_BINDING_RECEIPT_ACKNOWLEDGEMENT
}

enum AcraKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcraProfile {
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
  procedureRef: String!
}

type AcraSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerObservation: Int!
}

type AcraReceiptHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptClass: AcraReceiptClass!
  receiptRecorded: Boolean!
  attestedKeyKind: AcraKeyKind!
}

type AcraReceiptAcknowledgement {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptAcknowledgementId: ID!
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
  admissionClass: AcraAdmissionClass!
  receiptClass: AcraReceiptClass!
  acknowledgementClass: AcraAcknowledgementClass!
  acknowledgementReason: AcraAcknowledgementReason!
  receiptRecorded: Boolean!
  acknowledgementRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcraKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcraNextAction!
}

type AcraAcknowledgementPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptAcknowledgementCode: String!
  acknowledgementRecorded: Boolean!
  acknowledgementPerceptionBody: JSON!
}

type AcraAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcraProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcraProfile
  agentAcraSession(accountId: ID!, sessionId: ID!): AcraSession
  agentAcraReceiptHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcraReceiptHead
  agentAcraReceiptAcknowledgement(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcraReceiptAcknowledgement
  agentAcraAcknowledgementPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcraAcknowledgementPerception
  agentAcraAuditEvents(accountId: ID!, utcDay: String!): [AcraAuditEvent!]!
}

type Mutation {
  createAgentAcraProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcraProfile!
  approveAgentAcraProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcraProfile!
  revokeAgentAcraProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcraProfile!
  openAgentAcraSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcraSession!
  nominateAgentAcraObservation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  recordAgentAcraReceiptAcknowledgement(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    receiptAcknowledgementCode: String!
  ): AcraReceiptAcknowledgement!
  appendAgentAcraAcknowledgementIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcraAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```


## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-receipt-acknowledgement`. The
instruction payload on the acknowledgement rule is deterministic JSON:

- point-look up one receipt by
  `(account_id, utc_day, consumer_principal_id)`;
- record the single `allowed_receipt_acknowledgement_code` for the
  receipt reader only when `receipt_recorded` is true, the receipt
  reason is `BOUND_BINDING_RECEIPTED`, and the next action is
  `RECEIPT_BOUND_BINDING`;
- otherwise seal `NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE` with null
  counts;
- never execute the tool inside the acknowledgement;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
receipt-acknowledgement code, and the receipt reader. It may not rewrite
the instruction by chatting with the engine. Changing the
receipt-acknowledgement code is a new profile version that stays
`DRAFT` until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single
receipt-acknowledgement code. Queries must filter `account_id` before topK. A
global ANN index would mix tenants and is rejected. The reference
schema does not build an HNSW index.

```sql
CREATE TABLE agent_acra_profile_embedding (
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
    REFERENCES agent_acra_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acra_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acra_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acra_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one observation, and records that profile's one
receipt-acknowledgement code for the receipt reader. Discovery never writes
`agent_acra_receipt_acknowledgement`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the receipt `reader_principal_id` and the one `receipt_acknowledgement_code`;
- `acknowledgementRecorded` true only when the three counts are present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on an
  acknowledged observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`ACKNOWLEDGE_RECEIPTED_RECEIPT` as permission to execute the tool or to enroll
the key. `ACKED` on the upstream effect stays an observation. It is
not this acknowledgement, and it is not trust.

## 13. ACID and consistency

The record function is one transaction. The session receipt link,
compile, certificate, decision, receipt acknowledgement, perception row,
intent, budget, terminal, and audit commit together or not at all. The
receipt head is not updated. Isolation is the tenant RLS predicate on
`account_id`. Durability is the hash-chained audit event
`RECEIPT_ACKNOWLEDGEMENT_SEALED`.

Consistency beats a faster but lossy fan-out. An acknowledgement that
copied counts from a `NOT_RECEIPTED` receipt would be a durable lie. The
engine would rather seal `NOT_ACKNOWLEDGED` with null counts than
reconstruct a reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null receipt-acknowledgement code
  is **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected access
  paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one observation. A second nomination is
  rejected.
- The acknowledgement does not execute the tool, does not call the
  provider, and does not open another nested expiry.
- A reader other than the receipt reader is rejected, which keeps one
  noisy agent from acknowledging every principal in the account.
- Budgets cap acknowledgement, vector, and notify units so a retry loop
  cannot spend a neighbor's latency.
- Semantic topK is account-filtered and cannot record an acknowledgement.

These guards keep the 99.99% availability target. An autonomous agent
cannot turn one acknowledgement into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The acknowledgement path does not read a board. It reads one primary key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve the
path lead with `account_id`. There is no predicate that scans every
item on a board, every context packet, or every reader in the account.

Any plan that lacks both `account_id` and the observation key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this plane.
The columnar synopsis stays upstream. This plane does not re-aggregate
it.

## 16. Auditability and replay

Each seal appends `agent_acra_audit_event` with
`event_kind = RECEIPT_ACKNOWLEDGEMENT_SEALED`, a 64-character event hash, and
a previous hash. Replay reads the receipt head and the profile
receipt-acknowledgement code and must reproduce `acknowledgement_class`,
`acknowledgement_reason`, the reader, and the three counts or their
absence. Replay does not call a model. The receipt head and the
acknowledgement row are immutable after insert, so a later agent cannot
edit history to make a refused receipt look acknowledged.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the receipt
  reader. The function rejects the call. The receipt head reader stays
  unchanged.
- **Forged acknowledgement on a refused receipt:** the trigger reads the
  head by primary key and rejects `acknowledgement_recorded` when
  `receipt_recorded` is false.
- **Count laundering:** an acknowledged row whose counts differ from the
  head is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The
  acknowledgement is not a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash` are
  rejected on the head and on the acknowledgement.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane does
  not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are rejected.
- **Steward reuse:** receipt-acknowledgement stewards must be distinct
  from the reader, the consumer, the binding-receipt stewards, and every
  upstream steward.
- **Cross-tenant read:** forced RLS hides every row whose `account_id`
  does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is rejected.
  Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the acknowledgement transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The acknowledgement transaction performs one primary-key read and a
  fixed set of primary-key writes. It has no board fan-out.
- Counters: acknowledgements recorded, acknowledgements refused,
  full-scan rejects, steward-reuse rejects, second-reader rejects, and
  tool-execution rejects.
- A recorded acknowledgement with null counts, or a refused
  acknowledgement with any count, is a correctness page.
- A receipt-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing acknowledgements.
2. Export receipt heads for one canary account by primary key. Confirm
   heads are immutable and tenant-scoped.
3. Enable `record_agent_acra_receipt_acknowledgement` for that account.
   Compare recorded counts to the receipt head.
4. Watch full-scan rejects and second-reader rejects. A spike means an
   agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW index.
   Do not enable tool execution inside the acknowledgement.

Revocation stops new sessions. It does not rewrite sealed
acknowledgements.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one acknowledgement for a receipted head with
  counts 1/1/1 and lag 3 inside budget 5, leaves that head unchanged,
  and seals `RECEIPTED_RECEIPT_ACKNOWLEDGED` for `principal:reader-1`.
- A not-receipted head with lag 8 keeps null counts,
  `NOT_RECEIPTED_RECEIPT_CANNOT_ACKNOWLEDGE`, and the denied lag.
- Silence seals `NOT_ACKNOWLEDGED` with a null lag and null counts.
- A null day, a second nomination, a foreign receipt-acknowledgement
  code, a fact body, a nested expiry, a packet scan, steward reuse, an
  acknowledgement on a not-receipted receipt, a reader equal to the
  consumer, counts that differ from the head, an ack promoted to trust,
  tool execution, a mutated head, a mutated acknowledgement, a profile
  inserted as approved, a second reader, and an unscoped scan are
  rejected.
- `npm audit` reports no vulnerabilities in the validation toolchain.

## 21. Product decision

Ship the receipt acknowledgement as a deterministic point lookup of an
already sealed receipt. The acknowledgement copies the three counts only
when `receipt_recorded` is true, names only the receipt reader, and
leaves the receipt head unchanged. `ACKED` is not trust. The tool does
not run. The plane does not open another nested expiry.

The next increment should record one consumer-visible hold of one
already `ACKNOWLEDGED` receipt acknowledgement by point lookup of
`(account_id, utc_day, consumer_principal_id)`. Name the note
`agentic-admitted-count-receipt-ack-hold-plane.md`. Do not lengthen the
filename by nesting prior plane names. A `NOT_ACKNOWLEDGED`
acknowledgement cannot be held as received. The hold copies the three
counts only when `acknowledgement_recorded` is true. The reader on the
hold must equal the acknowledgement reader and stay distinct from the
consumer and every steward. The hold must not scan context packets, must
not inline a fact body, must not promote `ACKED` to `TRUSTED_ENROLLED`,
must not execute the tool, must not grant a second reader, and must not
open another nested expiry plane.
