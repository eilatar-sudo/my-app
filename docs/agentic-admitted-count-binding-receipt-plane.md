# mondayDB Agentic Admitted Count Binding Receipt Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-22.v1`

## 1. Why this plane, before how

The 2026-10-21 Admitted Count Perception Binding Plane publishes one
agent perception binding for one already sealed perception card. The
grain is `(account_id, utc_day, consumer_principal_id)`. A `BOUND`
binding copies the three counts, names exactly the binding reader, and
seals `PERCEIVED_OBSERVATION_BOUND` with next action
`BIND_PERCEIVED_OBSERVATION`. A `NOT_BOUND` binding seals
`NOT_PERCEIVED_CARD_CANNOT_BIND` with null counts. That plane does not
record a binding receipt.

Without this plane an agent either:

- treats `BIND_PERCEIVED_OBSERVATION` itself as proof the runtime
  receipted the three counts, or
- walks context packets, tool logs, or a board with 1M+ rows to invent
  a receipt (neighbor-harmful, and a miss against the 99.99%
  availability target).

The product trade-off is **receipt honesty versus binding isolation**,
and **receipt latency versus a second reader**:

- Honesty: the consumer named on a `BOUND` binding should have one
  binding receipt that copies the three counts already on that
  binding, without opening the binding again.
- Isolation: the database does not call the provider and does not
  execute the tool. Recording the receipt is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or recursive
  tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_BOUND` binding cannot be receipted as
  received. The receipt names the binding reader and no one else. A
  second reader is a new request, and this plane rejects it.
- The binding head is not rewritten. Replay of the binding stays
  stable. The receipt is a new row that cites the binding by primary
  key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does not
  promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the receipt is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed receipt plus the
binding id it cites. Neighbor availability stays at the 99.99% target
because an unscoped day walk, a reader list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved receipt profile is procedural memory for "how one
   already sealed binding becomes a single binding receipt." The
   profile names exactly one binding-receipt code and the one binding
   code that receipt may cite. A profile never inlines a fact body,
   never rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one observation key. The receipt then
   reads `agent_acbr_binding_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB records a receipt only when the head is `BOUND`,
   `binding_recorded` is true, the binding reason is
   `PERCEIVED_OBSERVATION_BOUND`, the next action is
   `BIND_PERCEIVED_OBSERVATION`, and the requested reader equals the
   binding reader. The copy of the three counts is equality with the
   binding. It does not call a model and it does not execute the tool.
4. `NOT_BOUND` seals `NOT_BOUND_BINDING_CANNOT_RECEIPT` with
   `receipt_recorded = false` and null counts. Silence keeps a null
   lag. There is no receipt that shows the binding as received.
5. The reader equals the binding reader and is distinct from the
   consumer and from every steward, including the two binding-receipt
   stewards and the two binding stewards. Two binding-receipt stewards
   witness the receipt. They are distinct from the consumer, from the
   reader, from the binding stewards, and from the perception, hold,
   acknowledgement, reader-receipt, grant, citation, provider, effect,
   bind, provider-receipt, card, admission, attestation, synopsis, and
   publication stewards.
6. Unscoped observation or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the nomination and
  the binding receipt?
- Was the receipt a point lookup of an already sealed binding, and
  what class did that binding have?
- Did a `BOUND` binding receipt exactly its one reader and seal
  `BOUND_BINDING_RECEIPTED` with the three binding counts?
- Did a `NOT_BOUND` binding stay unreceipted, with null counts and
  `NOT_BOUND_BINDING_CANNOT_RECEIPT`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the binding head keep the class, the reader, and the counts it
  was exported with?
- Can the receipt be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never records this
receipt.

## 2. Scope and ownership

The Admitted Count Binding Receipt Plane owns:

1. Immutable approved receipt profiles as procedural memory, each
   naming one binding-receipt code for one binding code.
2. Tenant-scoped receipt sessions with a hard cap of one nominated
   observation and the one reader already on that binding.
3. Deterministic nomination of that observation, then one point lookup
   of the binding head.
4. A binding receipt keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the
   binding `reader_principal_id`.
5. An agent perception row that carries counts only when
   `receipt_recorded` is true, which is only when `binding_recorded`
   is true.
6. Audit events that cite the receipt hash.

It integrates with, but does not replace:

- **Admitted Count Perception Binding Plane:** supplies the sealed
  binding this plane reads. Exporters copy the binding class, the
  binding reason, `binding_recorded`, the one reader, the counts the
  binding actually copied, the next action, and the stewards onto
  `agent_acbr_binding_head`. This plane does not re-bind the card,
  does not recover withheld counts, and does not promote `ACKED` to
  `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, receipt, vector, and
  notify units. A refused observation is a sealed non-receipt, not a
  scan of the packet log. The receipt does not run the tool and does
  not call the provider.

### Non-goals

- Letting an LLM choose which reader a binding may receipt.
- Executing the tool, calling the provider, or compiling a board query
  inside `record_agent_acbr_binding_receipt`.
- Recording any binding-receipt code other than the single code on the
  approved profile.
- Copying counts onto a receipt whose binding is `NOT_BOUND`.
- Rewriting the binding head so a refused binding becomes a receipted
  observation.
- Naming a reader other than the binding reader. That would grant a
  second reader, and this plane rejects it.
- Recomputing receipts by scanning a board, a packet log, or a reader
  ledger.
- Cross-account receipts or global nearest-neighbor retrieval.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the receipt.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because the
  effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this receipt.
- Recording a separate acknowledgement of the receipt. That is the
  next plane, and only for an already `RECEIPTED` receipt.

## 3. Product contract

### 3.1 Receipt profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the binding must already carry
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
- the single `allowed_binding_receipt_code` this plane may seal (one
  token, no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- receipt threshold (distinct binding-receipt stewards, minimum 2),
  max observations per session (exactly 1), max nominated observations
  (exactly 1), and max readers per observation (exactly 1);
- receipt policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `RECEIPT_NEVER_EXECUTES_TOOL`, `RECEIPT_NEVER_INLINES_BODY`,
  `RECEIPT_NEVER_CONFIRMS`, `ONE_OBSERVATION_PER_SESSION`,
  `ONE_RECEIPT_PER_OBSERVATION`, `BINDING_READER_ONLY`,
  `POINT_LOOKUP_ONLY`, `BOUND_BINDING_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `COUNTS_ONLY_WHEN_BINDING_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_RECEIPT`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so PostgreSQL
can store it as an enum label.

### 3.2 Session and budget contract

A session is opened against one approved profile version. It nominates
exactly one observation. The reader budget is exactly one, and that
reader must already be the binding reader. Nominate, receipt, vector,
and notify budgets are integers reserved before the receipt runs. A
refused receipt still consumes one receipt unit, because the refusal
is a sealed row, not a retry loop. Provider silence stays
`UNKNOWN_EFFECT` and is not retried inside the receipt transaction.

### 3.3 Binding head and nomination contract

Exporters insert `agent_acbr_binding_head` by primary key. The export
is a point copy of one sealed perception binding. It is not a packet
walk and it is not a board scan. The head is immutable after insert.
`access_path` is `POINT_LOOKUP`. `inlines_fact_body`,
`opens_nested_expiry`, `ack_promoted_to_trust`, `packet_scan_used`,
and `executes_tool` are false. `attested_key_kind` is
`AWAITING_CONFIRMATION`. `body_visibility` is `OMITTED`. The body
rejects `factBody`, `fact_body`, and `resolvedFactHash`.

A `BOUND` head carries `binding_recorded = true`, reason
`PERCEIVED_OBSERVATION_BOUND`, next action
`BIND_PERCEIVED_OBSERVATION`, and the three counts. A `NOT_BOUND` head
carries null counts and `NOT_PERCEIVED_CARD_CANNOT_BIND`. A stop keeps
the denied lag above the budget. Silence keeps a null lag and next
action `OMIT_CARD_BINDING`.

Nomination stores the same
`(account_id, utc_day, consumer_principal_id)` the receipt will read.
A null day, a null consumer, or a null account is **FULL SCAN
REJECTED**. A second nomination in the same session is rejected.

### 3.4 Binding receipt contract

`record_agent_acbr_binding_receipt` is the only compile that writes a
binding receipt. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one binding head for that key, with `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`, `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, `packet_scan_used = false`, and
  `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` (`TRUSTED_ENROLLED` is
  rejected);
- `binding_receipt_code` equal to the profile's
  `allowed_binding_receipt_code`, and `binding_code` equal to the head
  binding code and the profile binding code, each matching
  `^[a-z0-9:_-]{1,64}$` (one token, not a list and not a query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the binding
  head, and distinct from the consumer, from both binding-receipt
  stewards, from both binding stewards, from both perception stewards,
  and from every hold, acknowledgement, reader-receipt, grant,
  citation, provider, effect, bind, provider-receipt, card, admission,
  attestation, synopsis, and publication steward;
- binding-receipt stewards distinct from each other and from those
  same principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That grain
holds one binding receipt and therefore the one binding reader.
Projection is:

- `RECEIPTED` when the head binding class is `BOUND`,
  `binding_recorded` is true, the binding reason is
  `PERCEIVED_OBSERVATION_BOUND`, and the next action is
  `BIND_PERCEIVED_OBSERVATION`. The receipt copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`. `receipt_recorded` is
  true. `receipt_reason` is `BOUND_BINDING_RECEIPTED`.
  `trusted_next_action` is `RECEIPT_BOUND_BINDING`. The action
  receipts the three counts for that consumer and that one reader. It
  does not run the tool, it does not inline a fact body, and it does
  not open another nested expiry.
- `NOT_RECEIPTED` when the head next action is `STOP_CARD_BINDING`.
  Counts stay null. `receipt_reason` is
  `NOT_BOUND_BINDING_CANNOT_RECEIPT`. `receipt_recorded` is false.
  `trusted_next_action` is `STOP_BINDING_RECEIPT`. The denied lag is
  copied and is not cleared.
- `NOT_RECEIPTED` when the head admission class is `UNKNOWN_EFFECT` or
  the next action is `OMIT_CARD_BINDING`. Counts stay null. The
  receipt lag stays null. `receipt_reason` is
  `NOT_BOUND_BINDING_CANNOT_RECEIPT`. `receipt_recorded` is false.
  `trusted_next_action` is `OMIT_BINDING_RECEIPT`.

A `NOT_BOUND` binding cannot be receipted as received. The three
counts are copied only when `binding_recorded` is true. `receipt_body`
rejects `factBody`, `fact_body`, and `resolvedFactHash`. `ACKED` is
copied as `effect_observation` when the head observed it. It does not
write `TRUSTED_ENROLLED`. The binding head is not updated. A second
receipt for the same consumer and day is rejected. A reader other than
the binding reader is rejected, so this plane does not grant a second
reader. A forged receipted row whose counts differ from the head is
rejected. A forged receipted row on a `NOT_BOUND` head is rejected. A
forged non-receipt that carries any count, or that sets
`receipt_recorded`, is rejected. A binding-receipt code other than the
profile code is rejected before a row is sealed, so the caller can
retry the one allowed code. A null binding-receipt code is **FULL SCAN
REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acbr_receipt_perception` for the
agent. Counts appear there only when `receipt_recorded` is true. The
perception names `binding_receipt_code`, the binding reader, and
whether the receipt was recorded. Receipt intents start as `PREPARED`.
Provider silence stays `UNKNOWN_EFFECT`. A receipt of the notify is
not enrollment, not a fact restore, not a tool execution, and not a
second reader. This plane does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads with
   `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null binding-receipt code, or
   a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one observation. The access path is
   `POINT_LOOKUP`. One observation receipts its one reader.
4. The binding head is immutable. The receipt does not rewrite it and
   does not change its reader.
5. A successful receipt is recorded only from a `BOUND` head whose
   binding reason is `PERCEIVED_OBSERVATION_BOUND`, whose
   `binding_recorded` is true, and whose next action is
   `BIND_PERCEIVED_OBSERVATION`, and only for the profile's single
   binding-receipt code and the binding reader.
6. `NOT_BOUND` receipts store null counts and
   `receipt_recorded = false`. Silence stores a null lag. A
   `NOT_BOUND` binding cannot be receipted as received. Counts are
   copied only when `binding_recorded` is true.
7. `ACKED` stays an effect observation. `AWAITING_CONFIRMATION` stays
   the key kind. `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`, and
   `executes_tool` stay false. The receipt does not execute the tool.
9. The reader equals the binding reader. The reader, the consumer, the
   binding-receipt stewards, the binding stewards, the perception
   stewards, and the upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never records a receipt.
11. The engine does not call a model. Replay is a pure function of the
    binding head, the consumer id, the binding reader, and the profile
    binding-receipt code.

## 5. Execution model

```text
approved profile (one allowed_binding_receipt_code)
  -> open session (one observation budget, the binding reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read binding head by primary key
  -> require reader = binding reader
  -> project RECEIPTED or NOT_RECEIPTED
  -> append receipt + perception + audit
  -> leave the binding head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `RECEIPT_BOUND_BINDING` for both receipts. The class
on the receipt, not a second plane, distinguishes a recorded receipt
from a refusal. Notify dispatch is a later receipt intent and may
remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one provider
   code, one citation code, one grant code, one reader-receipt code,
   one hold code, one perception code, one binding code, and one
   binding-receipt code, and add one dual-control receipt rule.
2. Approve it through `agent_acbr_profile_authority`.
3. Export one binding head per consumer and day. The export is a point
   copy of the perception binding, not a packet walk.
4. Open a session and nominate one observation key.
5. Record the profile binding-receipt code for the binding reader.
   Bound bindings copy the counts and seal `BOUND_BINDING_RECEIPTED`.
   Other bindings seal a non-receipt with null counts.
6. The agent reads the perception row. A withheld perception has no
   count fields and `receiptRecorded: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite receipts already sealed.
8. This plane does not open another nested expiry. It does not run the
   tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type BindingReceiptId = string;
export type UtcDay = string;
export type BindingReceiptCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type BindingClass = "BOUND" | "NOT_BOUND";
export type BindingReason =
  | "PERCEIVED_OBSERVATION_BOUND"
  | "NOT_PERCEIVED_CARD_CANNOT_BIND";
export type BindingNextAction =
  | "BIND_PERCEIVED_OBSERVATION"
  | "STOP_CARD_BINDING"
  | "OMIT_CARD_BINDING";
export type ReceiptClass = "RECEIPTED" | "NOT_RECEIPTED";
export type ReceiptReason =
  | "BOUND_BINDING_RECEIPTED"
  | "NOT_BOUND_BINDING_CANNOT_RECEIPT";
export type ReceiptNextAction =
  | "RECEIPT_BOUND_BINDING"
  | "STOP_BINDING_RECEIPT"
  | "OMIT_BINDING_RECEIPT";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const RECEIPT_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface BindingHead {
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
  readonly admissionClass: AdmissionClass;
  readonly bindingClass: BindingClass;
  readonly bindingReason: BindingReason;
  readonly bindingRecorded: boolean;
  readonly cardRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: BindingNextAction;
}

export interface AgentBindingReceipt {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly bindingReceiptId: BindingReceiptId;
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
  readonly bindingReceiptCode: BindingReceiptCode;
  readonly admissionClass: AdmissionClass;
  readonly bindingClass: BindingClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly bindingRecorded: boolean;
  readonly receiptRecorded: boolean;
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
  readonly trustedNextAction: ReceiptNextAction;
}

export function projectAgentBindingReceipt(
  head: BindingHead,
  bindingReceiptId: BindingReceiptId,
  readerPrincipalId: PrincipalId,
  bindingReceiptCode: BindingReceiptCode,
): AgentBindingReceipt {
  const readerIsBindingReader = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    bindingReceiptId,
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
    bindingReceiptCode,
    admissionClass: head.admissionClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = RECEIPT_TOKEN.test(bindingReceiptCode);

  if (
    readerIsBindingReader &&
    readerIsDistinct &&
    singleCode &&
    head.bindingClass === "BOUND" &&
    head.bindingReason === "PERCEIVED_OBSERVATION_BOUND" &&
    head.bindingRecorded &&
    head.cardRecorded &&
    head.trustedNextAction === "BIND_PERCEIVED_OBSERVATION" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      bindingClass: "BOUND",
      receiptClass: "RECEIPTED",
      receiptReason: "BOUND_BINDING_RECEIPTED",
      bindingRecorded: true,
      receiptRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "RECEIPT_BOUND_BINDING",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_CARD_BINDING";

  return {
    ...shared,
    bindingClass: "NOT_BOUND",
    bindingRecorded: false,
    receiptClass: "NOT_RECEIPTED",
    receiptReason: "NOT_BOUND_BINDING_CANNOT_RECEIPT",
    receiptRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_BINDING_RECEIPT" : "STOP_BINDING_RECEIPT",
  };
}
```

```ts
export function receiptOmitsUnboundBinding(
  receipt: AgentBindingReceipt,
): boolean {
  return (
    receipt.receiptRecorded === false &&
    receipt.receiptClass === "NOT_RECEIPTED" &&
    receipt.bindingRecorded === false &&
    receipt.sealedCount === null &&
    receipt.deniedCount === null &&
    receipt.unknownEffectCount === null &&
    receipt.ackPromotedToTrust === false &&
    receipt.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    receipt.executesTool === false
  );
}
```

`projectAgentBindingReceipt` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`. It never
copies counts off a binding whose `binding_recorded` is false. It
never executes the tool. A receipt token that is not a single code, or
a reader other than the binding reader, projects to `NOT_RECEIPTED`.
The database additionally requires the token to equal the approved
profile binding-receipt code, requires the reader to equal the binding
reader, and rejects a reader who collides with the consumer or any
steward, before it seals `RECEIPTED`. A mismatched reader is rejected
rather than sealed, so the plane does not grant a second reader.

## 8. SQL row-store schema

```sql
CREATE TYPE acbr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acbr_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acbr_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acbr_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acbr_hold_class AS ENUM ('HELD', 'NOT_HELD');
CREATE TYPE acbr_hold_reason AS ENUM (
  'ACKNOWLEDGED_OBSERVATION_HELD',
  'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
);
CREATE TYPE acbr_card_class AS ENUM ('PERCEIVED', 'NOT_PERCEIVED');
CREATE TYPE acbr_card_reason AS ENUM (
  'HELD_OBSERVATION_PERCEIVED',
  'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE'
);
CREATE TYPE acbr_binding_class AS ENUM ('BOUND', 'NOT_BOUND');
CREATE TYPE acbr_binding_reason AS ENUM (
  'PERCEIVED_OBSERVATION_BOUND',
  'NOT_PERCEIVED_CARD_CANNOT_BIND'
);
CREATE TYPE acbr_binding_next AS ENUM (
  'BIND_PERCEIVED_OBSERVATION',
  'STOP_CARD_BINDING',
  'OMIT_CARD_BINDING'
);
CREATE TYPE acbr_receipt_class AS ENUM ('RECEIPTED', 'NOT_RECEIPTED');
CREATE TYPE acbr_receipt_reason AS ENUM (
  'BOUND_BINDING_RECEIPTED',
  'NOT_BOUND_BINDING_CANNOT_RECEIPT'
);
CREATE TYPE acbr_receipt_next AS ENUM (
  'RECEIPT_BOUND_BINDING',
  'STOP_BINDING_RECEIPT',
  'OMIT_BINDING_RECEIPT'
);
CREATE TYPE acbr_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acbr_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acbr_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acbr_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acbr_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acbr_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acbr_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acbr_compile_kind AS ENUM ('RECEIPT_BOUND_BINDING');
CREATE TYPE acbr_terminal_kind AS ENUM (
  'RECEIPT_RECORDED',
  'RECEIPT_REFUSED'
);
CREATE TYPE acbr_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_RECEIPT',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acbr_profile_authority NOLOGIN;

CREATE FUNCTION acbr_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acbr_authorization_evidence (
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

CREATE TABLE agent_acbr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acbr_profile_status NOT NULL,
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
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acbr_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acbr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acbr_profile_receipt_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acbr_admission_class[] NOT NULL,
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  require_dual_control_receipt BOOLEAN NOT NULL,
  receipt_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acbr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acbr_binding_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
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
  admission_class acbr_admission_class NOT NULL,
  hold_class acbr_hold_class NOT NULL,
  card_class acbr_card_class NOT NULL,
  binding_class acbr_binding_class NOT NULL,
  hold_reason acbr_hold_reason NOT NULL,
  card_reason acbr_card_reason NOT NULL,
  binding_reason acbr_binding_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  freshness_class acbr_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acbr_effect_observation NOT NULL,
  attested_key_kind acbr_key_kind NOT NULL,
  fact_disposition acbr_fact_disposition NOT NULL,
  body_visibility acbr_body_visibility NOT NULL,
  metadata_trust acbr_metadata_trust NOT NULL,
  access_path acbr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acbr_binding_next NOT NULL,
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
  binding_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, perception_binding_id),
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
  CHECK (NOT (binding_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acbr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acbr_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_receipt_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_receipt_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  receipt_threshold INTEGER NOT NULL,
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
    REFERENCES agent_acbr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acbr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acbr_observation_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acbr_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id)
);

CREATE TABLE agent_acbr_observation_receipt (
  account_id BIGINT NOT NULL,
  receipt_link_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  perception_binding_id UUID NOT NULL,
  admission_class acbr_admission_class NOT NULL,
  binding_class acbr_binding_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_link_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acbr_binding_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acbr_receipt_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  binding_receipt_code TEXT NOT NULL,
  admission_class acbr_admission_class NOT NULL,
  receipt_class acbr_receipt_class NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acbr_receipt_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  binding_receipt_code TEXT NOT NULL,
  binding_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  admission_class acbr_admission_class NOT NULL,
  binding_class acbr_binding_class NOT NULL,
  receipt_class acbr_receipt_class NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
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
  sealed_revision INTEGER NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acbr_receipt_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acbr_receipt_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  binding_receipt_code TEXT NOT NULL,
  compile_kind acbr_compile_kind NOT NULL,
  admission_class acbr_admission_class NOT NULL,
  binding_class acbr_binding_class NOT NULL,
  receipt_class acbr_receipt_class NOT NULL,
  freshness_class acbr_freshness_class NOT NULL,
  effect_observation acbr_effect_observation NOT NULL,
  attested_key_kind acbr_key_kind NOT NULL,
  fact_disposition acbr_fact_disposition NOT NULL,
  body_visibility acbr_body_visibility NOT NULL,
  access_path acbr_access_path NOT NULL,
  metadata_trust acbr_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acbr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acbr_binding_receipt (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  binding_receipt_id UUID NOT NULL,
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
  binding_receipt_code TEXT NOT NULL CHECK (binding_receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acbr_admission_class NOT NULL,
  hold_class acbr_hold_class NOT NULL,
  card_class acbr_card_class NOT NULL,
  binding_class acbr_binding_class NOT NULL,
  receipt_class acbr_receipt_class NOT NULL,
  hold_reason acbr_hold_reason NOT NULL,
  card_reason acbr_card_reason NOT NULL,
  binding_reason acbr_binding_reason NOT NULL,
  receipt_reason acbr_receipt_reason NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  card_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acbr_effect_observation NOT NULL,
  attested_key_kind acbr_key_kind NOT NULL,
  fact_disposition acbr_fact_disposition NOT NULL,
  body_visibility acbr_body_visibility NOT NULL,
  metadata_trust acbr_metadata_trust NOT NULL,
  access_path acbr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acbr_receipt_next NOT NULL,
  binding_receipt_steward_a TEXT NOT NULL,
  binding_receipt_steward_b TEXT NOT NULL,
  binding_steward_a TEXT NOT NULL,
  binding_steward_b TEXT NOT NULL,
  perception_steward_a TEXT NOT NULL,
  perception_steward_b TEXT NOT NULL,
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, binding_receipt_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acbr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acbr_binding_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (receipt_body ? 'resolvedFactHash')),
  CHECK (
    (receipt_recorded = true AND receipt_class = 'RECEIPTED'
      AND binding_recorded = true AND binding_class = 'BOUND'
      AND card_recorded = true AND card_class = 'PERCEIVED'
      AND hold_recorded = true AND hold_class = 'HELD'
      AND receipt_issued = true
      AND trusted_next_action = 'RECEIPT_BOUND_BINDING'
      AND receipt_reason = 'BOUND_BINDING_RECEIPTED'
      AND binding_reason = 'PERCEIVED_OBSERVATION_BOUND'
      AND sealed_count IS NOT NULL
      AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL
      AND receipt_body ? 'sealedCount'
      AND receipt_body ? 'deniedCount'
      AND receipt_body ? 'unknownEffectCount')
    OR (receipt_recorded = false AND receipt_class = 'NOT_RECEIPTED'
      AND binding_recorded = false AND binding_class = 'NOT_BOUND'
      AND card_recorded = false AND card_class = 'NOT_PERCEIVED'
      AND hold_recorded = false AND hold_class = 'NOT_HELD'
      AND receipt_issued = false
      AND receipt_reason = 'NOT_BOUND_BINDING_CANNOT_RECEIPT'
      AND binding_reason = 'NOT_PERCEIVED_CARD_CANNOT_BIND'
      AND trusted_next_action IN ('STOP_BINDING_RECEIPT', 'OMIT_BINDING_RECEIPT')
      AND sealed_count IS NULL
      AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND NOT (receipt_body ? 'sealedCount')
      AND NOT (receipt_body ? 'deniedCount')
      AND NOT (receipt_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acbr_receipt_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  binding_receipt_id UUID NOT NULL,
  binding_receipt_code TEXT NOT NULL,
  receipt_class acbr_receipt_class NOT NULL,
  binding_recorded BOOLEAN NOT NULL,
  receipt_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acbr_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acbr_receipt_next NOT NULL,
  receipt_perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (receipt_perception_body ? 'factBody')),
  CHECK (NOT (receipt_perception_body ? 'fact_body')),
  CHECK (NOT (receipt_perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acbr_receipt_intent (
  account_id BIGINT NOT NULL,
  receipt_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acbr_intent_status NOT NULL,
  receipt_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acbr_receipt_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acbr_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id)
);

CREATE TABLE agent_acbr_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acbr_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id)
);

CREATE TABLE agent_acbr_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id)
);

CREATE TABLE agent_acbr_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acbr_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acbr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acbr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acbr_session (account_id, session_id)
);
CREATE FUNCTION protect_agent_acbr_profile()
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
      IF current_setting('app.acbr_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acbr_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acbr_profile_protect
BEFORE INSERT OR UPDATE ON agent_acbr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_profile();

CREATE FUNCTION protect_agent_acbr_receipt_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acbr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acbr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed receipt rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acbr_receipt_rule_protect
BEFORE UPDATE ON agent_acbr_profile_receipt_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_receipt_rule();

CREATE FUNCTION protect_agent_acbr_binding_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed binding head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.binding_body ? 'factBody'
     OR NEW.binding_body ? 'fact_body'
     OR NEW.binding_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NOT acbr_parties_are_distinct(ARRAY[
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

  IF NEW.binding_class = 'BOUND' OR NEW.binding_recorded THEN
    IF NEW.binding_recorded IS DISTINCT FROM TRUE
       OR NEW.binding_class IS DISTINCT FROM 'BOUND'
       OR NEW.binding_reason IS DISTINCT FROM 'PERCEIVED_OBSERVATION_BOUND'
       OR NEW.trusted_next_action IS DISTINCT FROM 'BIND_PERCEIVED_OBSERVATION'
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
       OR NOT (NEW.binding_body ? 'sealedCount')
       OR NOT (NEW.binding_body ? 'deniedCount')
       OR NOT (NEW.binding_body ? 'unknownEffectCount') THEN
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
     OR NEW.binding_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not bound binding head cannot be shown as received';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_CARD_BINDING' THEN
      RAISE EXCEPTION 'silence is not a receipted binding';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_CARD_BINDING' THEN
      RAISE EXCEPTION 'denied binding head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'binding head class is not receiptable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acbr_binding_head_protect
BEFORE INSERT OR UPDATE ON agent_acbr_binding_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_binding_head();

CREATE FUNCTION protect_agent_acbr_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.receipt_hash IS DISTINCT FROM NEW.receipt_hash
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

CREATE TRIGGER agent_acbr_decision_protect
BEFORE INSERT OR UPDATE ON agent_acbr_receipt_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_decision();

CREATE FUNCTION protect_agent_acbr_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acbr_parties_are_distinct(ARRAY[
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
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acbr_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acbr_receipt_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_certificate();

CREATE FUNCTION protect_agent_acbr_receipt_intent()
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
     OR OLD.receipt_idempotency_key IS DISTINCT FROM NEW.receipt_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared receipt identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acbr_receipt_intent_protect
BEFORE INSERT OR UPDATE ON agent_acbr_receipt_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_receipt_intent();

CREATE FUNCTION protect_agent_acbr_binding_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_receipt$
DECLARE
  v_head agent_acbr_binding_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
  v_hold TEXT;
  v_perception TEXT;
  v_binding TEXT;
  v_binding_receipt TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed binding receipt is immutable';
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
     OR NEW.receipt_body ? 'factBody'
     OR NEW.receipt_body ? 'fact_body'
     OR NEW.receipt_body ? 'resolvedFactHash'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'receipt fence';
  END IF;

  IF NEW.binding_receipt_code IS NULL OR NEW.binding_receipt_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acbr_binding_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the binding reader';
  END IF;

  IF NOT acbr_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
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
     OR NEW.perception_steward_a IS DISTINCT FROM v_head.perception_steward_a
     OR NEW.perception_steward_b IS DISTINCT FROM v_head.perception_steward_b
     OR NEW.perception_binding_id IS DISTINCT FROM v_head.perception_binding_id THEN
    RAISE EXCEPTION 'receipt must cite the sealed binding';
  END IF;

  IF NEW.receipt_class = 'RECEIPTED' OR NEW.receipt_recorded THEN
    IF v_head.binding_class IS DISTINCT FROM 'BOUND'
       OR v_head.binding_recorded IS DISTINCT FROM TRUE
       OR v_head.binding_reason IS DISTINCT FROM 'PERCEIVED_OBSERVATION_BOUND'
       OR v_head.trusted_next_action IS DISTINCT FROM 'BIND_PERCEIVED_OBSERVATION' THEN
      RAISE EXCEPTION 'not bound binding cannot be receipted as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.receipt_reason IS DISTINCT FROM 'BOUND_BINDING_RECEIPTED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'RECEIPT_BOUND_BINDING'
       OR NEW.binding_recorded IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'RECEIPTED' THEN
      RAISE EXCEPTION 'receipted binding must copy the head counts';
    END IF;
  ELSE
    IF v_head.binding_class IS DISTINCT FROM 'NOT_BOUND'
       OR v_head.binding_recorded THEN
      RAISE EXCEPTION 'bound binding must show the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.receipt_body ? 'sealedCount'
       OR NEW.receipt_recorded
       OR NEW.binding_recorded
       OR NEW.receipt_reason IS DISTINCT FROM 'NOT_BOUND_BINDING_CANNOT_RECEIPT' THEN
      RAISE EXCEPTION 'not bound binding cannot be receipted as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_CARD_BINDING' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_BINDING_RECEIPT' THEN
        RAISE EXCEPTION 'silence cannot be shown as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_BINDING_RECEIPT'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused binding must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_hold_code, p.allowed_perception_code, p.allowed_binding_code,
         p.allowed_binding_receipt_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt,
         v_hold, v_perception, v_binding, v_binding_receipt
  FROM agent_acbr_session AS s
  JOIN agent_acbr_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_binding_receipt IS NULL
     OR NEW.binding_receipt_code IS DISTINCT FROM v_binding_receipt
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

CREATE TRIGGER agent_acbr_binding_receipt_protect
BEFORE INSERT OR UPDATE ON agent_acbr_binding_receipt
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_binding_receipt();

CREATE FUNCTION protect_agent_acbr_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.receipt_perception_body ? 'factBody'
     OR NEW.receipt_perception_body ? 'fact_body'
     OR NEW.receipt_perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.receipt_class = 'NOT_RECEIPTED'
     AND (NEW.receipt_recorded
          OR NEW.binding_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.receipt_perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not bound binding cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acbr_perception_protect
BEFORE INSERT OR UPDATE ON agent_acbr_receipt_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acbr_perception();

CREATE FUNCTION approve_agent_acbr_profile(
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
  stored_status acbr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acbr_profile
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
  FROM agent_acbr_profile_receipt_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_receipt IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control receipt rule';
  END IF;

  PERFORM set_config(
    'app.acbr_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acbr_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acbr_profile(
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
  stored_status acbr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acbr_profile
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
    'app.acbr_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acbr_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acbr_observation(
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
  v_session_status acbr_session_status;
  v_profile_status acbr_profile_status;
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
    FROM agent_acbr_observation_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one observation per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acbr_session AS s
  JOIN agent_acbr_profile AS pr
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

  INSERT INTO agent_acbr_observation_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;
CREATE FUNCTION record_agent_acbr_binding_receipt(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_binding_receipt_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_receipt_id UUID,
  p_receipt_digest TEXT,
  p_binding_receipt_steward_a TEXT,
  p_binding_receipt_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acbr_session_status;
  v_profile_status acbr_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_allowed_hold TEXT;
  v_allowed_perception TEXT;
  v_allowed_binding TEXT;
  v_allowed_binding_receipt TEXT;
  v_principal TEXT;
  v_head agent_acbr_binding_head%ROWTYPE;
  v_receipt_class acbr_receipt_class;
  v_binding_class acbr_binding_class;
  v_card_class acbr_card_class;
  v_hold_class acbr_hold_class;
  v_reason acbr_receipt_reason;
  v_binding_reason acbr_binding_reason;
  v_card_reason acbr_card_reason;
  v_hold_reason acbr_hold_reason;
  v_receipt_recorded BOOLEAN;
  v_binding_recorded BOOLEAN;
  v_card_recorded BOOLEAN;
  v_hold_recorded BOOLEAN;
  v_receipt_issued BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acbr_receipt_next;
  v_terminal acbr_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_binding_receipt_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_receipt_digest) <> 64 THEN
    RAISE EXCEPTION 'receipt digest must be 64 hex characters';
  END IF;

  IF p_binding_receipt_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acbr_observation_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'receipt requires a nominated observation point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, pr.allowed_hold_code, pr.allowed_perception_code,
         pr.allowed_binding_code, pr.allowed_binding_receipt_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_hold, v_allowed_perception, v_allowed_binding,
         v_allowed_binding_receipt, v_principal
  FROM agent_acbr_session AS s
  JOIN agent_acbr_profile AS pr
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

  IF p_binding_receipt_code IS DISTINCT FROM v_allowed_binding_receipt THEN
    RAISE EXCEPTION 'binding receipt code is not the profile receipt';
  END IF;

  SELECT * INTO v_head
  FROM agent_acbr_binding_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation
     OR v_head.grant_code IS DISTINCT FROM v_allowed_grant
     OR v_head.receipt_code IS DISTINCT FROM v_allowed_receipt
     OR v_head.hold_code IS DISTINCT FROM v_allowed_hold
     OR v_head.perception_code IS DISTINCT FROM v_allowed_perception
     OR v_head.binding_code IS DISTINCT FROM v_allowed_binding THEN
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
     OR v_head.binding_body ? 'factBody'
     OR v_head.binding_body ? 'fact_body'
     OR v_head.binding_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'receipt fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acbr_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_binding_receipt_steward_a, p_binding_receipt_steward_b,
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
    RAISE EXCEPTION 'reader must equal the binding reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acbr_binding_receipt
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
     AND v_head.trusted_next_action = 'BIND_PERCEIVED_OBSERVATION'
     AND v_head.admission_class = 'ADMITTED' THEN
    v_receipt_class := 'RECEIPTED';
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
    v_next := 'RECEIPT_BOUND_BINDING';
    v_terminal := 'RECEIPT_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_CARD_BINDING' THEN
    v_receipt_class := 'NOT_RECEIPTED';
    v_binding_class := 'NOT_BOUND';
    v_card_class := 'NOT_PERCEIVED';
    v_hold_class := 'NOT_HELD';
    v_reason := 'NOT_BOUND_BINDING_CANNOT_RECEIPT';
    v_binding_reason := 'NOT_PERCEIVED_CARD_CANNOT_BIND';
    v_card_reason := 'NOT_HELD_OBSERVATION_CANNOT_PERCEIVE';
    v_hold_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_receipt_recorded := false;
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_receipt_issued := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_BINDING_RECEIPT';
    v_terminal := 'RECEIPT_REFUSED';
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
    v_binding_recorded := false;
    v_card_recorded := false;
    v_hold_recorded := false;
    v_receipt_issued := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_BINDING_RECEIPT';
    v_terminal := 'RECEIPT_REFUSED';
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
    'bindingReceiptCode', p_binding_receipt_code,
    'admissionClass', v_head.admission_class,
    'bindingClass', v_binding_class,
    'receiptClass', v_receipt_class,
    'receiptReason', v_reason,
    'bindingRecorded', v_binding_recorded,
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
  IF v_receipt_recorded THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acbr_observation_receipt (
    account_id, receipt_link_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, perception_binding_id, admission_class, binding_class,
    binding_recorded, receipted_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.perception_binding_id, v_head.admission_class,
    v_head.binding_class, v_head.binding_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acbr_receipt_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, binding_receipt_code, admission_class, receipt_class,
    receipt_recorded, receipt_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_binding_receipt_code, v_head.admission_class, v_receipt_class,
    v_receipt_recorded, p_receipt_digest, clock_timestamp()
  );

  INSERT INTO agent_acbr_receipt_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, binding_receipt_code, binding_code, provider_code,
    receipt_hash, admission_class, binding_class, receipt_class, receipt_recorded,
    binding_receipt_steward_a, binding_receipt_steward_b,
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
    p_reader_principal, p_utc_day, p_binding_receipt_code, v_head.binding_code,
    v_head.provider_code, p_receipt_digest, v_head.admission_class, v_binding_class,
    v_receipt_class, v_receipt_recorded,
    p_binding_receipt_steward_a, p_binding_receipt_steward_b,
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

  INSERT INTO agent_acbr_receipt_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, binding_receipt_code, compile_kind,
    admission_class, binding_class, receipt_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    receipt_recorded, executes_tool, lag_publications, max_lag_budget, receipt_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_binding_receipt_code,
    'RECEIPT_BOUND_BINDING',
    v_head.admission_class, v_binding_class, v_receipt_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_receipt_recorded, false, v_lag, v_head.max_lag_budget, p_receipt_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acbr_binding_receipt (
    account_id, utc_day, consumer_principal_id, binding_receipt_id, session_id,
    certificate_id, perception_binding_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, hold_code,
    perception_code, binding_code, binding_receipt_code, admission_class, hold_class,
    card_class, binding_class, receipt_class, hold_reason, card_reason, binding_reason,
    receipt_reason, hold_recorded, card_recorded, receipt_issued, binding_recorded,
    receipt_recorded, sealed_count, denied_count, unknown_effect_count, lag_publications,
    max_lag_budget, effect_observation, attested_key_kind, fact_disposition,
    body_visibility, metadata_trust, access_path, inlines_fact_body, opens_nested_expiry,
    ack_promoted_to_trust, packet_scan_used, executes_tool, trusted_next_action,
    binding_receipt_steward_a, binding_receipt_steward_b,
    binding_steward_a, binding_steward_b, perception_steward_a, perception_steward_b,
    receipt_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_receipt_id, p_session_id,
    p_certificate_id, v_head.perception_binding_id, p_reader_principal,
    v_head.purpose_code, v_head.effect_code, v_head.provider_code, v_head.citation_code,
    v_head.grant_code, v_head.receipt_code, v_head.hold_code, v_head.perception_code,
    v_head.binding_code, p_binding_receipt_code, v_head.admission_class, v_hold_class,
    v_card_class, v_binding_class, v_receipt_class, v_hold_reason, v_card_reason,
    v_binding_reason, v_reason, v_hold_recorded, v_card_recorded, v_receipt_issued,
    v_binding_recorded, v_receipt_recorded, v_sealed, v_denied, v_unknown, v_lag,
    v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, false, v_next,
    p_binding_receipt_steward_a, p_binding_receipt_steward_b,
    v_head.binding_steward_a, v_head.binding_steward_b,
    v_head.perception_steward_a, v_head.perception_steward_b,
    v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acbr_receipt_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, binding_receipt_id,
    binding_receipt_code, receipt_class, binding_recorded, receipt_recorded, sealed_count,
    denied_count, unknown_effect_count, attested_key_kind, ack_promoted_to_trust,
    trusted_next_action, receipt_perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_receipt_id,
    p_binding_receipt_code, v_receipt_class, v_binding_recorded, v_receipt_recorded,
    v_sealed, v_denied, v_unknown, 'AWAITING_CONFIRMATION', false, v_next, v_body,
    clock_timestamp()
  );

  INSERT INTO agent_acbr_receipt_intent (
    account_id, receipt_intent_id, session_id, certificate_id, intent_status,
    receipt_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, p_certificate_id, 'PREPARED',
    p_receipt_id::TEXT, 1, p_receipt_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acbr_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, 'RECEIPT', 1, clock_timestamp()
  );

  INSERT INTO agent_acbr_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acbr_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'BINDING_RECEIPT_SEALED',
    p_receipt_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acbr_session
  SET consumed_receipt_units = consumed_receipt_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$publish$;

CREATE FUNCTION reject_agent_acbr_unscoped_scan(
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

ALTER FUNCTION approve_agent_acbr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acbr_profile_authority;
ALTER FUNCTION revoke_agent_acbr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acbr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acbr_profile_authority;
GRANT SELECT ON
  agent_acbr_profile,
  agent_acbr_profile_receipt_rule
TO agent_acbr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acbr_profile TO agent_acbr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acbr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acbr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acbr_profile FROM PUBLIC;

CREATE INDEX agent_acbr_session_work_idx ON agent_acbr_session (
  account_id,
  status
);
CREATE INDEX agent_acbr_session_profile_idx ON agent_acbr_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acbr_head_consumer_idx ON agent_acbr_binding_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acbr_nomination_session_idx ON agent_acbr_observation_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acbr_certificate_session_idx ON agent_acbr_receipt_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acbr_decision_cert_idx ON agent_acbr_receipt_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acbr_receipt_consumer_idx ON agent_acbr_binding_receipt (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acbr_receipt_reader_idx ON agent_acbr_binding_receipt (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acbr_perception_day_idx ON agent_acbr_receipt_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acbr_intent_work_idx ON agent_acbr_receipt_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acbr_audit_time_idx ON agent_acbr_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acbr_command_expiry_idx ON agent_acbr_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acbr_checkpoint_day_idx ON agent_acbr_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acbr_observation_receipt_day_idx ON agent_acbr_observation_receipt (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acbr_authorization_evidence',
    'agent_acbr_profile',
    'agent_acbr_profile_receipt_rule',
    'agent_acbr_binding_head',
    'agent_acbr_session',
    'agent_acbr_observation_nomination',
    'agent_acbr_observation_receipt',
    'agent_acbr_receipt_compile',
    'agent_acbr_receipt_certificate',
    'agent_acbr_receipt_decision',
    'agent_acbr_binding_receipt',
    'agent_acbr_receipt_perception',
    'agent_acbr_receipt_intent',
    'agent_acbr_budget_ledger',
    'agent_acbr_terminal_record',
    'agent_acbr_command_result',
    'agent_acbr_audit_head',
    'agent_acbr_audit_event',
    'agent_acbr_audit_anchor',
    'agent_acbr_projection_checkpoint'
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
triggers. A successful receipt on a `NOT_BOUND` binding, a trusted key,
a packet scan, a fact body, a tool execution flag, or a nested expiry
flag is rejected. The binding head cannot be updated to launder a
refused binding into a receipted observation. A reader other than the
binding reader is rejected, so the insert does not grant a second
reader.

The reference check executes this schema fence, including
`acbr_session_status`, the triggers, and
`record_agent_acbr_binding_receipt`, as one database session.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcbrAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcbrBindingClass {
  BOUND
  NOT_BOUND
}

enum AcbrReceiptClass {
  RECEIPTED
  NOT_RECEIPTED
}

enum AcbrReceiptReason {
  BOUND_BINDING_RECEIPTED
  NOT_BOUND_BINDING_CANNOT_RECEIPT
}

enum AcbrNextAction {
  RECEIPT_BOUND_BINDING
  STOP_BINDING_RECEIPT
  OMIT_BINDING_RECEIPT
}

enum AcbrKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcbrProfile {
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
  procedureRef: String!
}

type AcbrSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerObservation: Int!
}

type AcbrBindingHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  bindingClass: AcbrBindingClass!
  bindingRecorded: Boolean!
  attestedKeyKind: AcbrKeyKind!
}

type AcbrBindingReceipt {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  bindingReceiptId: ID!
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
  admissionClass: AcbrAdmissionClass!
  bindingClass: AcbrBindingClass!
  receiptClass: AcbrReceiptClass!
  receiptReason: AcbrReceiptReason!
  bindingRecorded: Boolean!
  receiptRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcbrKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcbrNextAction!
}

type AcbrReceiptPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  bindingReceiptCode: String!
  receiptRecorded: Boolean!
  receiptPerceptionBody: JSON!
}

type AcbrAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcbrProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcbrProfile
  agentAcbrSession(accountId: ID!, sessionId: ID!): AcbrSession
  agentAcbrBindingHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcbrBindingHead
  agentAcbrBindingReceipt(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcbrBindingReceipt
  agentAcbrReceiptPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcbrReceiptPerception
  agentAcbrAuditEvents(accountId: ID!, utcDay: String!): [AcbrAuditEvent!]!
}

type Mutation {
  createAgentAcbrProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcbrProfile!
  approveAgentAcbrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcbrProfile!
  revokeAgentAcbrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcbrProfile!
  openAgentAcbrSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcbrSession!
  nominateAgentAcbrObservation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  recordAgentAcbrBindingReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    bindingReceiptCode: String!
  ): AcbrBindingReceipt!
  appendAgentAcbrReceiptIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcbrAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Observation and receipt reads also take
a non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool. Resolvers
must call `reject_agent_acbr_unscoped_scan` before planning when
either the account or the observation key is missing. A receipt read
is one primary-key lookup. It does not join a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-binding-receipt`. The
instruction payload on the receipt rule is deterministic JSON:

- point-look up one binding by
  `(account_id, utc_day, consumer_principal_id)`;
- record the single `allowed_binding_receipt_code` for the binding
  reader only when `binding_recorded` is true, the binding reason is
  `PERCEIVED_OBSERVATION_BOUND`, and the next action is
  `BIND_PERCEIVED_OBSERVATION`;
- otherwise seal `NOT_BOUND_BINDING_CANNOT_RECEIPT` with null counts;
- never execute the tool inside the receipt;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
binding-receipt code, and the binding reader. It may not rewrite the
instruction by chatting with the engine. Changing the binding-receipt
code is a new profile version that stays `DRAFT` until the authority
fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single
binding-receipt code. Queries must filter `account_id` before topK. A
global ANN index would mix tenants and is rejected. The reference
schema does not build an HNSW index.

```sql
CREATE TABLE agent_acbr_profile_embedding (
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
    REFERENCES agent_acbr_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acbr_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acbr_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acbr_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one observation, and records that profile's one
binding-receipt code for the binding reader. Discovery never writes
`agent_acbr_binding_receipt`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the binding `reader_principal_id` and the one `binding_receipt_code`;
- `receiptRecorded` true only when the three counts are present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on a
  receipted observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`RECEIPT_BOUND_BINDING` as permission to execute the tool or to enroll
the key. `ACKED` on the upstream effect stays an observation. It is
not this receipt, and it is not trust.

## 13. ACID and consistency

The record function is one transaction. The session receipt link,
compile, certificate, decision, binding receipt, perception row,
intent, budget, terminal, and audit commit together or not at all. The
binding head is not updated. Isolation is the tenant RLS predicate on
`account_id`. Durability is the hash-chained audit event
`BINDING_RECEIPT_SEALED`.

Consistency beats a faster but lossy fan-out. A receipt that copied
counts from a `NOT_BOUND` binding would be a durable lie. The engine
would rather seal `NOT_RECEIPTED` with null counts than reconstruct a
reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null binding-receipt code
  is **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected access
  paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one observation. A second nomination is
  rejected.
- The receipt does not execute the tool, does not call the provider,
  and does not open another nested expiry.
- A reader other than the binding reader is rejected, which keeps one
  noisy agent from receipting every principal in the account.
- Budgets cap receipt, vector, and notify units so a retry loop cannot
  spend a neighbor's latency.
- Semantic topK is account-filtered and cannot record a receipt.

These guards keep the 99.99% availability target. An autonomous agent
cannot turn one receipt into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The receipt path does not read a board. It reads one primary key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve the
path lead with `account_id`. There is no predicate that scans every
item on a board, every context packet, or every reader in the account.

Any plan that lacks both `account_id` and the observation key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this plane.
The columnar synopsis stays upstream. This plane does not re-aggregate
it.

## 16. Auditability and replay

Each seal appends `agent_acbr_audit_event` with
`event_kind = BINDING_RECEIPT_SEALED`, a 64-character event hash, and
a previous hash. Replay reads the binding head and the profile
binding-receipt code and must reproduce `receipt_class`,
`receipt_reason`, the reader, and the three counts or their absence.
Replay does not call a model. The binding head and the receipt row are
immutable after insert, so a later agent cannot edit history to make a
refused binding look receipted.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the binding
  reader. The function rejects the call. The binding head reader stays
  unchanged.
- **Forged receipt on a refused binding:** the trigger reads the head
  by primary key and rejects `receipt_recorded` when
  `binding_recorded` is false.
- **Count laundering:** a receipted row whose counts differ from the
  head is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The receipt is
  not a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash` are
  rejected on the head and on the receipt.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane does
  not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are rejected.
- **Steward reuse:** binding-receipt stewards must be distinct from
  the reader, the consumer, the binding stewards, and every upstream
  steward.
- **Cross-tenant read:** forced RLS hides every row whose `account_id`
  does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is rejected.
  Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the receipt transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The receipt transaction performs one primary-key read and a fixed
  set of primary-key writes. It has no board fan-out.
- Counters: receipts recorded, receipts refused, full-scan rejects,
  steward-reuse rejects, second-reader rejects, and tool-execution
  rejects.
- A recorded receipt with null counts, or a refused receipt with any
  count, is a correctness page.
- A binding-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing receipts.
2. Export binding heads for one canary account by primary key. Confirm
   heads are immutable and tenant-scoped.
3. Enable `record_agent_acbr_binding_receipt` for that account.
   Compare recorded counts to the binding head.
4. Watch full-scan rejects and second-reader rejects. A spike means an
   agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW index.
   Do not enable tool execution inside the receipt.

Revocation stops new sessions. It does not rewrite sealed receipts.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one receipt for a bound head with counts 1/1/1
  and lag 3 inside budget 5, leaves that head unchanged, and seals
  `BOUND_BINDING_RECEIPTED` for `principal:reader-1`.
- A not-bound head with lag 8 keeps null counts,
  `NOT_BOUND_BINDING_CANNOT_RECEIPT`, and the denied lag.
- Silence seals `NOT_RECEIPTED` with a null lag and null counts.
- A null day, a second nomination, a foreign binding-receipt code, a
  fact body, a nested expiry, a packet scan, steward reuse, a receipt
  on a not-bound binding, a reader equal to the consumer, counts that
  differ from the head, an ack promoted to trust, tool execution, a
  mutated head, a mutated receipt, a profile inserted as approved, a
  second reader, and an unscoped scan are rejected.
- `npm audit` reports no vulnerabilities in the validation toolchain.

## 21. Product decision

Ship the binding receipt as a deterministic point lookup of an already
sealed binding. The receipt copies the three counts only when
`binding_recorded` is true, names only the binding reader, and leaves
the binding head unchanged. `ACKED` is not trust. The tool does not
run. The plane does not open another nested expiry.

The next increment should record one receipt acknowledgement of one
already `RECEIPTED` receipt by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_RECEIPTED`
receipt cannot be acknowledged as received. The acknowledgement copies
the three counts only when `receipt_recorded` is true. The reader on
the acknowledgement must equal the receipt reader and stay distinct
from the consumer and every steward. The acknowledgement must not scan
context packets, must not inline a fact body, must not promote `ACKED`
to `TRUSTED_ENROLLED`, must not execute the tool, must not grant a
second reader, and must not open another nested expiry plane.
