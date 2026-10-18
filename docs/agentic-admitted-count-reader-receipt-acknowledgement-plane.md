# mondayDB Agentic Admitted Count Reader Receipt Acknowledgement Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-18.v1`

## 1. Why this plane, before how

The 2026-10-17 Admitted Count Grant Reader Receipt Plane seals one
reader receipt for one already sealed citation grant. The grain is
`(account_id, utc_day, consumer_principal_id)`. An `ISSUED` row
copies the three counts, names exactly one reader, and seals
`GRANTED_CITATION_RECEIPT_ISSUED` with next action
`HOLD_READER_RECEIPT`. A `NOT_ISSUED` row seals
`NOT_GRANTED_CITATION_CANNOT_RECEIPT` with null counts. That plane
does not record an acknowledgement observation.

Without this plane an agent either:

- treats `HOLD_READER_RECEIPT` itself as proof the reader
  acknowledged the counts, or
- walks context packets, tool logs, or a board with 1M+ rows to
  invent an acknowledgement (neighbor-harmful, and a miss against
  the 99.99% availability target).

The product trade-off is **acknowledgement honesty versus receipt
isolation**, and **acknowledgement latency versus a second reader**:

- Honesty: the one reader named on an `ISSUED` receipt should have
  one acknowledgement observation that copies the three counts
  already on the receipt, without opening the receipt again.
- Isolation: the database does not call the provider and does not
  execute the tool. Acknowledging is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or
  recursive tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_ISSUED` receipt cannot be acknowledged as
  received. The observation names the receipt reader and no one
  else. A second reader is a new request, and this plane rejects it.
- The reader receipt head is not rewritten. Replay of the receipt
  stays stable. The observation is a new row that cites the receipt
  by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does
  not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the observation is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed observation plus
the receipt id it cites. Neighbor availability stays at the 99.99%
target because an unscoped day walk, a reader list, or a packet
walk is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved acknowledgement profile is procedural memory for
   "how one already sealed reader receipt becomes a single
   acknowledgement observation." The profile names exactly one
   acknowledgement code and the one receipt code that observation
   may cite. A profile never inlines a fact body, never rewrites
   `ACKED` as `TRUSTED_ENROLLED`, and never opens another nested
   expiry plane.
2. A session nominates exactly one receipt key. The observation
   then reads `agent_acrra_reader_receipt_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB records a successful acknowledgement only when the head
   is `ISSUED`, `receipt_issued` is true, the receipt reason is
   `GRANTED_CITATION_RECEIPT_ISSUED`, the next action is
   `HOLD_READER_RECEIPT`, and the requested reader equals the
   receipt reader. The copy of the three counts is equality with
   the receipt. It does not call a model and it does not execute
   the tool.
4. `NOT_ISSUED` seals `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE` with
   `acknowledgement_recorded = false` and null counts. Silence
   keeps a null lag. There is no successful acknowledgement.
5. The reader equals the receipt reader and is distinct from the
   consumer and from every steward, including the two
   acknowledgement stewards and the two reader-receipt stewards.
   Two acknowledgement stewards witness the observation. They are
   distinct from the consumer, from the reader, from the
   reader-receipt stewards, and from the grant, citation, provider,
   effect, bind, provider-receipt, card, admission, attestation,
   synopsis, and publication stewards.
6. Unscoped receipt or board scans are **FULL SCAN REJECTED** before
   planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the nomination
  and the acknowledgement observation?
- Was the observation a point lookup of an already sealed receipt,
  and what class did that receipt have?
- Did an `ISSUED` receipt acknowledge exactly its one reader and
  seal `ISSUED_READER_RECEIPT_ACKNOWLEDGED` with the three receipt
  counts?
- Did a `NOT_ISSUED` receipt stay unacknowledged, with null counts
  and `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the reader receipt head keep the class, the reader, and the
  counts it was exported with?
- Can the observation be replayed without invoking an LLM, and
  without executing the tool?

HNSW profile discovery stays account-scoped and never records this
acknowledgement.

## 2. Scope and ownership

The Admitted Count Reader Receipt Acknowledgement Plane owns:

1. Immutable approved acknowledgement profiles as procedural
   memory, each naming one acknowledgement code for one reader
   receipt.
2. Tenant-scoped acknowledgement sessions with a hard cap of one
   nominated receipt and the one reader already on that receipt.
3. Deterministic nomination of that receipt, then one point lookup
   of the reader receipt head.
4. An acknowledgement observation keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the
   receipt `reader_principal_id`.
5. An agent perception row that carries counts only when
   `acknowledgement_recorded` is true, which is only when
   `receipt_issued` is true.
6. Audit events that cite the acknowledgement hash.

It integrates with, but does not replace:

- **Admitted Count Grant Reader Receipt Plane:** supplies the
  sealed receipt this plane reads. Exporters copy the receipt
  class, the receipt reason, `receipt_issued`, the one reader, the
  counts the receipt actually copied, the next action, and the
  stewards onto `agent_acrra_reader_receipt_head`. This plane does
  not re-receipt the grant, does not recover withheld counts, and
  does not promote `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, acknowledge,
  vector, and notify units. A refused receipt is a sealed
  non-acknowledgement, not a scan of the packet log. The
  observation does not run the tool and does not call the provider.

### Non-goals

- Letting an LLM choose which reader a receipt may acknowledge.
- Executing the tool, calling the provider, or compiling a board
  query inside `acknowledge_agent_acrra_receipt`.
- Acknowledging any acknowledgement code other than the single
  code on the approved profile.
- Copying counts onto an observation whose receipt is `NOT_ISSUED`.
- Rewriting the reader receipt head so a refused receipt becomes a
  successful acknowledgement.
- Naming a reader other than the receipt reader. That would grant
  a second reader, and this plane rejects it.
- Recomputing acknowledgements by scanning a board, a packet log,
  or a reader ledger.
- Cross-account acknowledgements or global nearest-neighbor
  acknowledgement.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the observation.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because
  the effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this observation.
- Holding the acknowledgement as a consumer-visible card. That is
  the next plane, and only for an already `ACKNOWLEDGED`
  observation.

## 3. Product contract

### 3.1 Acknowledgement profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the receipt must already carry
  (one token, no list);
- the single `allowed_effect_code` the head must already carry
  (one token, no list);
- the single `allowed_provider_code` the head must already carry
  (one token, no list);
- the single `allowed_citation_code` the head must already carry
  (one token, no list);
- the single `allowed_grant_code` the head must already carry
  (one token, no list);
- the single `allowed_receipt_code` the head must already carry
  (one token, no list);
- the single `allowed_acknowledgement_code` this plane may seal
  (one token, no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- acknowledgement threshold (distinct acknowledgement stewards,
  minimum 2), max receipts per session (exactly 1), max nominated
  receipts (exactly 1), and max readers per receipt (exactly 1);
- acknowledgement policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `ACKNOWLEDGEMENT_NEVER_EXECUTES_TOOL`,
  `ACKNOWLEDGEMENT_NEVER_INLINES_BODY`,
  `ACKNOWLEDGEMENT_NEVER_CONFIRMS`, `ONE_RECEIPT_PER_SESSION`,
  `ONE_ACKNOWLEDGEMENT_PER_RECEIPT`, `RECEIPT_READER_ONLY`,
  `POINT_LOOKUP_ONLY`, `ISSUED_RECEIPT_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `COUNTS_ONLY_WHEN_RECEIPT_ISSUED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_ACKNOWLEDGEMENT`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest acknowledgement
reason is `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE` (37 bytes). The
success reason is `ISSUED_READER_RECEIPT_ACKNOWLEDGED` (34 bytes).

Approval and revocation require the authority fence
`approve_agent_acrra_profile` / `revoke_agent_acrra_profile`, owned
by `agent_acrra_profile_authority`. A profile cannot be inserted
as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, acknowledge,
vector, and notify units, plus wall time.
`max_receipts_per_session`, `max_nominated_receipts`, and
`max_readers_per_receipt` are all exactly 1. A second receipt
nomination in the same session is rejected before it can fan out
into a recursive reader walk.

The session principal is the only consumer that session may
acknowledge. An observation for a different consumer is rejected.
The reader on the observation is the reader already stored on the
receipt. It cannot be the consumer, and it cannot be replaced.

### 3.3 Reader receipt head and nomination contract

Upstream receipt export writes one reader receipt head per
`(account_id, utc_day, consumer_principal_id)`. The head copy
includes `receipt_class`, `receipt_reason`, `receipt_issued`,
`reader_principal_id`, `trusted_next_action`, the three counts when
they were issued, and the stewards. It does not include a fact body
and it does not include withheld counts. The head is immutable.
This plane does not advance it and does not reclassify it.

`nominate_agent_acrra_receipt(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates
that receipt. A null `utc_day`, a null `account_id`, a null
consumer, or a null acknowledgement code is **FULL SCAN REJECTED**.
The access path is `POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` are rejected.

### 3.4 Acknowledgement observation contract

`acknowledge_agent_acrra_receipt` is the only compile that writes
an acknowledgement observation. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one reader receipt head for that key, with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `acknowledgement_code` equal to the profile's
  `allowed_acknowledgement_code`, and `receipt_code` equal to the
  head receipt and the profile receipt, each matching
  `^[a-z0-9:_-]{1,64}$` (one token, not a list and not a query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the receipt
  head, and distinct from the consumer, from both acknowledgement
  stewards, from both reader-receipt stewards, and from every
  grant, citation, provider, effect, bind, provider-receipt, card,
  admission, attestation, synopsis, and publication steward;
- acknowledgement stewards distinct from each other and from those
  same principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That
grain holds one observation and therefore the one receipt reader.
Projection is:

- `ACKNOWLEDGED` when the head receipt class is `ISSUED`,
  `receipt_issued` is true, the receipt reason is
  `GRANTED_CITATION_RECEIPT_ISSUED`, and the next action is
  `HOLD_READER_RECEIPT`. The observation copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`.
  `acknowledgement_recorded` is true. `acknowledgement_reason` is
  `ISSUED_READER_RECEIPT_ACKNOWLEDGED`. `trusted_next_action` is
  `HOLD_RECEIPT_ACKNOWLEDGEMENT`. The action holds the observation
  for that one reader. It does not run the tool, it does not inline
  a fact body, and it does not open another nested expiry.
- `NOT_ACKNOWLEDGED` when the head next action is
  `STOP_READER_RECEIPT`. Counts stay null. `acknowledgement_reason`
  is `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE`.
  `acknowledgement_recorded` is false. `trusted_next_action` is
  `STOP_RECEIPT_ACKNOWLEDGEMENT`. The denied lag is copied and is
  not cleared.
- `NOT_ACKNOWLEDGED` when the head admission class is
  `UNKNOWN_EFFECT` or the next action is `OMIT_READER_RECEIPT`.
  Counts stay null. The observation lag stays null.
  `acknowledgement_reason` is
  `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE`.
  `acknowledgement_recorded` is false. `trusted_next_action` is
  `OMIT_RECEIPT_ACKNOWLEDGEMENT`.

A `NOT_ISSUED` receipt cannot be acknowledged as received. The
three counts are copied only when `receipt_issued` is true.
`acknowledgement_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as `effect_observation` when
the head observed it. It does not write `TRUSTED_ENROLLED`. The
reader receipt head is not updated. A second observation for the
same consumer and day is rejected. A reader other than the receipt
reader is rejected, so this plane does not grant a second reader.
A forged acknowledged row whose counts differ from the head is
rejected. A forged acknowledged row on a `NOT_ISSUED` head is
rejected. A forged non-acknowledgement that carries any count, or
that sets `acknowledgement_recorded`, is rejected. An
acknowledgement code other than the profile code is rejected
before a row is sealed, so the caller can retry the one allowed
code. A null acknowledgement code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acrra_acknowledgement_perception`
for the agent. Counts appear there only when
`acknowledgement_recorded` is true. The perception names
`acknowledgement_code`, the receipt reader, and whether the
observation was recorded. Acknowledgement intents start as
`PREPARED`. Provider silence stays `UNKNOWN_EFFECT`. An
acknowledgement of the notify is not enrollment, not a fact
restore, not a tool execution, and not a second reader. This plane
does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads
   with `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null acknowledgement code,
   or a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one receipt. The access path is
   `POINT_LOOKUP`. One receipt acknowledges its one reader.
4. The reader receipt head is immutable. The observation does not
   rewrite it and does not change its reader.
5. A successful acknowledgement is recorded only from an `ISSUED`
   head whose receipt reason is `GRANTED_CITATION_RECEIPT_ISSUED`,
   whose `receipt_issued` is true, and whose next action is
   `HOLD_READER_RECEIPT`, and only for the profile's single
   acknowledgement code and the receipt reader.
6. `NOT_ISSUED` observations store null counts and
   `acknowledgement_recorded = false`. Silence stores a null lag.
   A `NOT_ISSUED` receipt cannot be acknowledged as received.
   Counts are copied only when `receipt_issued` is true.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`,
   and `executes_tool` stay false. The observation does not execute
   the tool.
9. The reader equals the receipt reader. The reader, the consumer,
   the acknowledgement stewards, the reader-receipt stewards, and
   the upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never records an
    acknowledgement.
11. The engine does not call a model. Replay is a pure function of
    the reader receipt head, the consumer id, the receipt reader,
    and the profile acknowledgement code.

## 5. Execution model

```text
approved profile (one allowed_acknowledgement_code)
  -> open session (one receipt budget, the receipt reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read reader receipt head by primary key
  -> require reader = receipt reader
  -> project ACKNOWLEDGED or NOT_ACKNOWLEDGED
  -> append observation + perception + audit
  -> leave the reader receipt head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `ACKNOWLEDGE_ISSUED_RECEIPT` for both observations.
The class on the observation, not a second plane, distinguishes a
recorded acknowledgement from a refusal. Notify dispatch is a later
acknowledgement intent and may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one
   provider code, one citation code, one grant code, one receipt
   code, and one acknowledgement code, and add one dual-control
   acknowledgement rule.
2. Approve it through `agent_acrra_profile_authority`.
3. Export one reader receipt head per consumer and day. The export
   is a point copy of the reader receipt, not a packet walk.
4. Open a session and nominate one receipt key.
5. Acknowledge the profile acknowledgement code for the receipt
   reader. Issued receipts copy the counts and seal
   `ISSUED_READER_RECEIPT_ACKNOWLEDGED`. Other receipts seal a
   non-acknowledgement with null counts.
6. The agent reads the perception row. A withheld perception has
   no count fields and `acknowledgementRecorded: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite observations already sealed.
8. This plane does not open another nested expiry. It does not run
   the tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type AcknowledgementId = string;
export type UtcDay = string;
export type AcknowledgementCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type ReceiptClass = "ISSUED" | "NOT_ISSUED";
export type ReceiptReason =
  | "GRANTED_CITATION_RECEIPT_ISSUED"
  | "NOT_GRANTED_CITATION_CANNOT_RECEIPT";
export type ReceiptNextAction =
  | "HOLD_READER_RECEIPT"
  | "STOP_READER_RECEIPT"
  | "OMIT_READER_RECEIPT";
export type AcknowledgementClass = "ACKNOWLEDGED" | "NOT_ACKNOWLEDGED";
export type AcknowledgementReason =
  | "ISSUED_READER_RECEIPT_ACKNOWLEDGED"
  | "NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE";
export type AcknowledgementNextAction =
  | "HOLD_RECEIPT_ACKNOWLEDGEMENT"
  | "STOP_RECEIPT_ACKNOWLEDGEMENT"
  | "OMIT_RECEIPT_ACKNOWLEDGEMENT";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const ACKNOWLEDGEMENT_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface ReaderReceiptHead {
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
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly receiptIssued: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: ReceiptNextAction;
}

export interface ReceiptAcknowledgement {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly acknowledgementId: AcknowledgementId;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly receiptCode: string;
  readonly acknowledgementCode: AcknowledgementCode;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly acknowledgementClass: AcknowledgementClass;
  readonly acknowledgementReason: AcknowledgementReason;
  readonly receiptIssued: boolean;
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

export function projectReceiptAcknowledgement(
  head: ReaderReceiptHead,
  acknowledgementId: AcknowledgementId,
  readerPrincipalId: PrincipalId,
  acknowledgementCode: AcknowledgementCode,
): ReceiptAcknowledgement {
  const readerIsReceiptReader = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    acknowledgementId,
    consumerPrincipalId: head.consumerPrincipalId,
    readerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode: head.citationCode,
    grantCode: head.grantCode,
    receiptCode: head.receiptCode,
    acknowledgementCode,
    admissionClass: head.admissionClass,
    receiptClass: head.receiptClass,
    receiptIssued: head.receiptIssued,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = ACKNOWLEDGEMENT_TOKEN.test(acknowledgementCode);

  if (
    readerIsReceiptReader &&
    readerIsDistinct &&
    singleCode &&
    head.receiptClass === "ISSUED" &&
    head.receiptReason === "GRANTED_CITATION_RECEIPT_ISSUED" &&
    head.receiptIssued &&
    head.trustedNextAction === "HOLD_READER_RECEIPT" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      acknowledgementClass: "ACKNOWLEDGED",
      acknowledgementReason: "ISSUED_READER_RECEIPT_ACKNOWLEDGED",
      acknowledgementRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "HOLD_RECEIPT_ACKNOWLEDGEMENT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_READER_RECEIPT";

  return {
    ...shared,
    receiptClass: "NOT_ISSUED",
    receiptIssued: false,
    acknowledgementClass: "NOT_ACKNOWLEDGED",
    acknowledgementReason: "NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE",
    acknowledgementRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit
      ? "OMIT_RECEIPT_ACKNOWLEDGEMENT"
      : "STOP_RECEIPT_ACKNOWLEDGEMENT",
  };
}
```

```ts
export function perceptionOmitsUnacknowledgedReceipt(
  observation: ReceiptAcknowledgement,
): boolean {
  return (
    observation.acknowledgementRecorded === false &&
    observation.acknowledgementClass === "NOT_ACKNOWLEDGED" &&
    observation.sealedCount === null &&
    observation.deniedCount === null &&
    observation.unknownEffectCount === null &&
    observation.ackPromotedToTrust === false &&
    observation.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    observation.executesTool === false
  );
}
```

`projectReceiptAcknowledgement` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`. It never
copies counts off a receipt whose `receipt_issued` is false. It
never executes the tool. An acknowledgement token that is not a
single code, or a reader other than the receipt reader, projects to
`NOT_ACKNOWLEDGED`. The database additionally requires the token to
equal the approved profile acknowledgement code, requires the reader
to equal the receipt reader, and rejects a reader who collides with
the consumer or any steward, before it seals `ACKNOWLEDGED`. A
mismatched reader is rejected rather than sealed, so the plane does
not grant a second reader.
## 8. SQL row-store schema

```sql
CREATE TYPE acrra_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acrra_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acrra_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acrra_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acrra_citation_class AS ENUM ('PUBLISHED', 'NOT_PUBLISHED');
CREATE TYPE acrra_grant_class AS ENUM ('GRANTED', 'NOT_GRANTED');
CREATE TYPE acrra_grant_reason AS ENUM (
  'PUBLISHED_CITATION_GRANT_ISSUED',
  'NOT_PUBLISHED_CITATION_CANNOT_GRANT'
);
CREATE TYPE acrra_receipt_class AS ENUM ('ISSUED', 'NOT_ISSUED');
CREATE TYPE acrra_receipt_reason AS ENUM (
  'GRANTED_CITATION_RECEIPT_ISSUED',
  'NOT_GRANTED_CITATION_CANNOT_RECEIPT'
);
CREATE TYPE acrra_receipt_next AS ENUM (
  'HOLD_READER_RECEIPT',
  'STOP_READER_RECEIPT',
  'OMIT_READER_RECEIPT'
);
CREATE TYPE acrra_ack_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE acrra_ack_reason AS ENUM (
  'ISSUED_READER_RECEIPT_ACKNOWLEDGED',
  'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE'
);
CREATE TYPE acrra_ack_next AS ENUM (
  'HOLD_RECEIPT_ACKNOWLEDGEMENT',
  'STOP_RECEIPT_ACKNOWLEDGEMENT',
  'OMIT_RECEIPT_ACKNOWLEDGEMENT'
);
CREATE TYPE acrra_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acrra_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acrra_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acrra_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acrra_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acrra_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acrra_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acrra_compile_kind AS ENUM ('ACKNOWLEDGE_ISSUED_RECEIPT');
CREATE TYPE acrra_terminal_kind AS ENUM (
  'ACKNOWLEDGEMENT_RECORDED',
  'ACKNOWLEDGEMENT_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acrra_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_ACKNOWLEDGEMENT',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acrra_profile_authority NOLOGIN;

CREATE FUNCTION acrra_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acrra_authorization_evidence (
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

CREATE TABLE agent_acrra_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acrra_profile_status NOT NULL,
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
  acknowledgement_threshold INTEGER NOT NULL CHECK (acknowledgement_threshold >= 2),
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  max_readers_per_receipt INTEGER NOT NULL CHECK (max_readers_per_receipt = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acrra_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrra_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrra_profile_acknowledgement_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acrra_admission_class[] NOT NULL,
  acknowledgement_threshold INTEGER NOT NULL CHECK (acknowledgement_threshold >= 2),
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  max_readers_per_receipt INTEGER NOT NULL CHECK (max_readers_per_receipt = 1),
  require_dual_control_acknowledgement BOOLEAN NOT NULL,
  acknowledgement_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acrra_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acrra_reader_receipt_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_receipt_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acrra_admission_class NOT NULL,
  citation_class acrra_citation_class NOT NULL,
  grant_class acrra_grant_class NOT NULL,
  receipt_class acrra_receipt_class NOT NULL,
  grant_reason acrra_grant_reason NOT NULL,
  receipt_reason acrra_receipt_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  freshness_class acrra_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrra_effect_observation NOT NULL,
  attested_key_kind acrra_key_kind NOT NULL,
  fact_disposition acrra_fact_disposition NOT NULL,
  body_visibility acrra_body_visibility NOT NULL,
  metadata_trust acrra_metadata_trust NOT NULL,
  access_path acrra_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acrra_receipt_next NOT NULL,
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
  UNIQUE (account_id, reader_receipt_id),
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

CREATE TABLE agent_acrra_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acrra_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_acknowledge_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_acknowledge_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  acknowledgement_threshold INTEGER NOT NULL,
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  max_readers_per_receipt INTEGER NOT NULL CHECK (max_readers_per_receipt = 1),
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
    REFERENCES agent_acrra_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrra_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrra_receipt_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acrra_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id)
);

CREATE TABLE agent_acrra_receipt_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  reader_receipt_id UUID NOT NULL,
  admission_class acrra_admission_class NOT NULL,
  receipt_class acrra_receipt_class NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrra_reader_receipt_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrra_acknowledgement_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  acknowledgement_code TEXT NOT NULL,
  admission_class acrra_admission_class NOT NULL,
  acknowledgement_class acrra_ack_class NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  acknowledgement_hash TEXT NOT NULL CHECK (char_length(acknowledgement_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrra_acknowledgement_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  acknowledgement_code TEXT NOT NULL,
  receipt_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  acknowledgement_hash TEXT NOT NULL CHECK (char_length(acknowledgement_hash) = 64),
  admission_class acrra_admission_class NOT NULL,
  receipt_class acrra_receipt_class NOT NULL,
  acknowledgement_class acrra_ack_class NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
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
    REFERENCES agent_acrra_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acrra_acknowledgement_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrra_acknowledgement_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  acknowledgement_code TEXT NOT NULL,
  compile_kind acrra_compile_kind NOT NULL,
  admission_class acrra_admission_class NOT NULL,
  receipt_class acrra_receipt_class NOT NULL,
  acknowledgement_class acrra_ack_class NOT NULL,
  freshness_class acrra_freshness_class NOT NULL,
  effect_observation acrra_effect_observation NOT NULL,
  attested_key_kind acrra_key_kind NOT NULL,
  fact_disposition acrra_fact_disposition NOT NULL,
  body_visibility acrra_body_visibility NOT NULL,
  access_path acrra_access_path NOT NULL,
  metadata_trust acrra_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  acknowledgement_hash TEXT NOT NULL CHECK (char_length(acknowledgement_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrra_acknowledgement_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrra_receipt_acknowledgement (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  reader_receipt_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  acknowledgement_code TEXT NOT NULL CHECK (acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acrra_admission_class NOT NULL,
  citation_class acrra_citation_class NOT NULL,
  grant_class acrra_grant_class NOT NULL,
  receipt_class acrra_receipt_class NOT NULL,
  acknowledgement_class acrra_ack_class NOT NULL,
  receipt_reason acrra_receipt_reason NOT NULL,
  acknowledgement_reason acrra_ack_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrra_effect_observation NOT NULL,
  attested_key_kind acrra_key_kind NOT NULL,
  fact_disposition acrra_fact_disposition NOT NULL,
  body_visibility acrra_body_visibility NOT NULL,
  metadata_trust acrra_metadata_trust NOT NULL,
  access_path acrra_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acrra_ack_next NOT NULL,
  acknowledgement_steward_a TEXT NOT NULL,
  acknowledgement_steward_b TEXT NOT NULL,
  reader_receipt_steward_a TEXT NOT NULL,
  reader_receipt_steward_b TEXT NOT NULL,
  acknowledgement_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, receipt_acknowledgement_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrra_acknowledgement_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrra_reader_receipt_head (account_id, utc_day, consumer_principal_id),
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
    (acknowledgement_recorded = true AND acknowledgement_class = 'ACKNOWLEDGED'
      AND receipt_issued = true AND receipt_class = 'ISSUED'
      AND trusted_next_action = 'HOLD_RECEIPT_ACKNOWLEDGEMENT'
      AND acknowledgement_reason = 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
      AND acknowledgement_body ? 'sealedCount'
      AND acknowledgement_body ? 'deniedCount'
      AND acknowledgement_body ? 'unknownEffectCount')
    OR (acknowledgement_recorded = false AND acknowledgement_class = 'NOT_ACKNOWLEDGED'
      AND receipt_issued = false AND receipt_class = 'NOT_ISSUED'
      AND acknowledgement_reason = 'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE'
      AND trusted_next_action IN (
        'STOP_RECEIPT_ACKNOWLEDGEMENT',
        'OMIT_RECEIPT_ACKNOWLEDGEMENT'
      )
      AND NOT (acknowledgement_body ? 'sealedCount')
      AND NOT (acknowledgement_body ? 'deniedCount')
      AND NOT (acknowledgement_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acrra_acknowledgement_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
  acknowledgement_code TEXT NOT NULL,
  acknowledgement_class acrra_ack_class NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acrra_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acrra_ack_next NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrra_receipt_acknowledgement (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acrra_acknowledgement_intent (
  account_id BIGINT NOT NULL,
  acknowledgement_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acrra_intent_status NOT NULL,
  acknowledgement_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, acknowledgement_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrra_acknowledgement_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acrra_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id)
);

CREATE TABLE agent_acrra_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acrra_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id)
);

CREATE TABLE agent_acrra_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id)
);

CREATE TABLE agent_acrra_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acrra_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acrra_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acrra_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrra_session (account_id, session_id)
);
CREATE FUNCTION protect_agent_acrra_profile()
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
      IF current_setting('app.acrra_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acrra_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acrra_profile_protect
BEFORE INSERT OR UPDATE ON agent_acrra_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_profile();

CREATE FUNCTION protect_agent_acrra_acknowledgement_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acrra_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acrra_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed acknowledgement rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acrra_acknowledgement_rule_protect
BEFORE UPDATE ON agent_acrra_profile_acknowledgement_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_acknowledgement_rule();

CREATE FUNCTION protect_agent_acrra_reader_receipt_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed reader receipt head is immutable';
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
     OR NOT acrra_parties_are_distinct(ARRAY[
       NEW.reader_principal_id, NEW.consumer_principal_id,
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

  IF NEW.receipt_class = 'ISSUED' OR NEW.receipt_issued OR NEW.grant_issued THEN
    IF NEW.receipt_issued IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'ISSUED'
       OR NEW.receipt_reason IS DISTINCT FROM 'GRANTED_CITATION_RECEIPT_ISSUED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_READER_RECEIPT'
       OR NEW.grant_issued IS DISTINCT FROM TRUE
       OR NEW.grant_class IS DISTINCT FROM 'GRANTED'
       OR NEW.grant_reason IS DISTINCT FROM 'PUBLISHED_CITATION_GRANT_ISSUED'
       OR NEW.citation_published IS DISTINCT FROM TRUE
       OR NEW.citation_class IS DISTINCT FROM 'PUBLISHED'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.receipt_body ? 'sealedCount')
       OR NOT (NEW.receipt_body ? 'deniedCount')
       OR NOT (NEW.receipt_body ? 'unknownEffectCount') THEN
      RAISE EXCEPTION 'issued receipt head must carry the receipt counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.receipt_reason IS DISTINCT FROM 'NOT_GRANTED_CITATION_CANNOT_RECEIPT'
     OR NEW.receipt_class IS DISTINCT FROM 'NOT_ISSUED'
     OR NEW.receipt_issued
     OR NEW.grant_issued
     OR NEW.grant_class IS DISTINCT FROM 'NOT_GRANTED'
     OR NEW.grant_reason IS DISTINCT FROM 'NOT_PUBLISHED_CITATION_CANNOT_GRANT'
     OR NEW.citation_published
     OR NEW.citation_class IS DISTINCT FROM 'NOT_PUBLISHED'
     OR NEW.receipt_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not issued receipt head cannot carry an acknowledgement';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_READER_RECEIPT' THEN
      RAISE EXCEPTION 'silence is not an acknowledged receipt';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_READER_RECEIPT' THEN
      RAISE EXCEPTION 'denied receipt head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'receipt head class is not acknowledgeable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acrra_reader_receipt_head_protect
BEFORE INSERT OR UPDATE ON agent_acrra_reader_receipt_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_reader_receipt_head();

CREATE FUNCTION protect_agent_acrra_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.acknowledgement_hash IS DISTINCT FROM NEW.acknowledgement_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'acknowledgement decision identity is immutable';
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

  IF NEW.acknowledgement_class = 'ACKNOWLEDGED'
     AND NEW.acknowledgement_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'acknowledged observation must copy the receipt counts';
  END IF;

  IF NEW.acknowledgement_class = 'NOT_ACKNOWLEDGED' AND NEW.acknowledgement_recorded THEN
    RAISE EXCEPTION 'not issued receipt cannot be acknowledged as received';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acrra_decision_protect
BEFORE INSERT OR UPDATE ON agent_acrra_acknowledgement_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_decision();

CREATE FUNCTION protect_agent_acrra_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acrra_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
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

CREATE TRIGGER agent_acrra_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acrra_acknowledgement_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_certificate();

CREATE FUNCTION protect_agent_acrra_acknowledgement_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_intent$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'acknowledgement intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.acknowledgement_idempotency_key IS DISTINCT FROM NEW.acknowledgement_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared acknowledgement identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acrra_acknowledgement_intent_protect
BEFORE INSERT OR UPDATE ON agent_acrra_acknowledgement_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_acknowledgement_intent();

CREATE FUNCTION protect_agent_acrra_receipt_acknowledgement()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_ack$
DECLARE
  v_head agent_acrra_reader_receipt_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
  v_ack TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt acknowledgement is immutable';
  END IF;

  IF NEW.executes_tool THEN
    RAISE EXCEPTION 'tool execution inside the acknowledgement';
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
    RAISE EXCEPTION 'acknowledgement fence';
  END IF;

  IF NEW.acknowledgement_code IS NULL
     OR NEW.acknowledgement_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrra_reader_receipt_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reader receipt head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the receipt reader';
  END IF;

  IF NOT acrra_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.acknowledgement_steward_a, NEW.acknowledgement_steward_b,
    NEW.reader_receipt_steward_a, NEW.reader_receipt_steward_b,
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

  IF NEW.reader_receipt_steward_a IS DISTINCT FROM v_head.reader_receipt_steward_a
     OR NEW.reader_receipt_steward_b IS DISTINCT FROM v_head.reader_receipt_steward_b
     OR NEW.reader_receipt_id IS DISTINCT FROM v_head.reader_receipt_id THEN
    RAISE EXCEPTION 'acknowledgement must cite the sealed receipt';
  END IF;

  IF NEW.acknowledgement_class = 'ACKNOWLEDGED' OR NEW.acknowledgement_recorded THEN
    IF v_head.receipt_class IS DISTINCT FROM 'ISSUED'
       OR v_head.receipt_issued IS DISTINCT FROM TRUE
       OR v_head.receipt_reason IS DISTINCT FROM 'GRANTED_CITATION_RECEIPT_ISSUED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'HOLD_READER_RECEIPT' THEN
      RAISE EXCEPTION 'not issued receipt cannot be acknowledged as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_RECEIPT_ACKNOWLEDGEMENT'
       OR NEW.receipt_issued IS DISTINCT FROM TRUE
       OR NEW.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED' THEN
      RAISE EXCEPTION 'acknowledged observation must copy the receipt counts';
    END IF;
  ELSE
    IF v_head.receipt_class IS DISTINCT FROM 'NOT_ISSUED' OR v_head.receipt_issued THEN
      RAISE EXCEPTION 'issued receipt must acknowledge the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.acknowledgement_body ? 'sealedCount'
       OR NEW.acknowledgement_recorded
       OR NEW.receipt_issued
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE' THEN
      RAISE EXCEPTION 'not issued receipt cannot be acknowledged as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_READER_RECEIPT' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_RECEIPT_ACKNOWLEDGEMENT' THEN
        RAISE EXCEPTION 'silence cannot be acknowledged as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_RECEIPT_ACKNOWLEDGEMENT'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused acknowledgement must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_acknowledgement_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt, v_ack
  FROM agent_acrra_session AS s
  JOIN agent_acrra_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_ack IS NULL
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
     OR NEW.receipt_code IS DISTINCT FROM v_head.receipt_code THEN
    RAISE EXCEPTION 'acknowledgement code is not the profile acknowledgement';
  END IF;

  RETURN NEW;
END
$protect_ack$;

CREATE TRIGGER agent_acrra_receipt_acknowledgement_protect
BEFORE INSERT OR UPDATE ON agent_acrra_receipt_acknowledgement
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_receipt_acknowledgement();

CREATE FUNCTION protect_agent_acrra_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed acknowledgement perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.acknowledgement_class = 'NOT_ACKNOWLEDGED'
     AND (NEW.acknowledgement_recorded
          OR NEW.receipt_issued
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not acknowledged perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acrra_perception_protect
BEFORE INSERT OR UPDATE ON agent_acrra_acknowledgement_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrra_perception();

CREATE FUNCTION approve_agent_acrra_profile(
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
  stored_status acrra_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrra_profile
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
  FROM agent_acrra_profile_acknowledgement_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_acknowledgement IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control acknowledgement rule';
  END IF;

  PERFORM set_config(
    'app.acrra_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrra_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acrra_profile(
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
  stored_status acrra_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrra_profile
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
    'app.acrra_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrra_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acrra_receipt(
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
  v_session_status acrra_session_status;
  v_profile_status acrra_profile_status;
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
    FROM agent_acrra_receipt_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one receipt per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acrra_session AS s
  JOIN agent_acrra_profile AS pr
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

  INSERT INTO agent_acrra_receipt_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;
CREATE FUNCTION acknowledge_agent_acrra_receipt(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_acknowledgement_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_acknowledgement_id UUID,
  p_acknowledgement_digest TEXT,
  p_ack_steward_a TEXT,
  p_ack_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $acknowledge$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acrra_session_status;
  v_profile_status acrra_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_allowed_ack TEXT;
  v_principal TEXT;
  v_head agent_acrra_reader_receipt_head%ROWTYPE;
  v_class acrra_ack_class;
  v_reason acrra_ack_reason;
  v_recorded BOOLEAN;
  v_receipt_issued BOOLEAN;
  v_receipt_class acrra_receipt_class;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acrra_ack_next;
  v_terminal acrra_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_acknowledgement_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_acknowledgement_digest) <> 64 THEN
    RAISE EXCEPTION 'acknowledgement digest must be 64 hex characters';
  END IF;

  IF p_acknowledgement_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acrra_receipt_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'acknowledgement requires a nominated receipt point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, pr.allowed_acknowledgement_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_ack, v_principal
  FROM agent_acrra_session AS s
  JOIN agent_acrra_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'acknowledgement requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_acknowledgement_code IS DISTINCT FROM v_allowed_ack THEN
    RAISE EXCEPTION 'acknowledgement code is not the profile acknowledgement';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrra_reader_receipt_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reader receipt head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation
     OR v_head.grant_code IS DISTINCT FROM v_allowed_grant
     OR v_head.receipt_code IS DISTINCT FROM v_allowed_receipt THEN
    RAISE EXCEPTION 'receipt code is not the profile receipt';
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
    RAISE EXCEPTION 'acknowledgement fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acrra_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_ack_steward_a, p_ack_steward_b,
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
    FROM agent_acrra_receipt_acknowledgement
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'receipt acknowledgement already recorded';
  END IF;

  IF v_head.receipt_class = 'ISSUED'
     AND v_head.receipt_reason = 'GRANTED_CITATION_RECEIPT_ISSUED'
     AND v_head.receipt_issued
     AND v_head.grant_issued
     AND v_head.trusted_next_action = 'HOLD_READER_RECEIPT'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.citation_class = 'PUBLISHED' THEN
    v_class := 'ACKNOWLEDGED';
    v_reason := 'ISSUED_READER_RECEIPT_ACKNOWLEDGED';
    v_recorded := true;
    v_receipt_issued := true;
    v_receipt_class := 'ISSUED';
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'HOLD_RECEIPT_ACKNOWLEDGEMENT';
    v_terminal := 'ACKNOWLEDGEMENT_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_READER_RECEIPT' THEN
    v_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE';
    v_recorded := false;
    v_receipt_issued := false;
    v_receipt_class := 'NOT_ISSUED';
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_RECEIPT_ACKNOWLEDGEMENT';
    v_terminal := 'ACKNOWLEDGEMENT_REFUSED';
  ELSE
    v_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE';
    v_recorded := false;
    v_receipt_issued := false;
    v_receipt_class := 'NOT_ISSUED';
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_RECEIPT_ACKNOWLEDGEMENT';
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
    'acknowledgementCode', p_acknowledgement_code,
    'admissionClass', v_head.admission_class,
    'receiptClass', v_receipt_class,
    'acknowledgementClass', v_class,
    'acknowledgementReason', v_reason,
    'receiptIssued', v_receipt_issued,
    'acknowledgementRecorded', v_recorded,
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

  INSERT INTO agent_acrra_receipt_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, reader_receipt_id, admission_class, receipt_class,
    receipt_issued, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.reader_receipt_id, v_head.admission_class,
    v_head.receipt_class, v_head.receipt_issued, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrra_acknowledgement_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, acknowledgement_code, admission_class, acknowledgement_class,
    acknowledgement_recorded, acknowledgement_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_acknowledgement_code, v_head.admission_class, v_class,
    v_recorded, p_acknowledgement_digest, clock_timestamp()
  );

  INSERT INTO agent_acrra_acknowledgement_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, acknowledgement_code, receipt_code, provider_code,
    acknowledgement_hash, admission_class, receipt_class, acknowledgement_class,
    acknowledgement_recorded,
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
    p_reader_principal, p_utc_day, p_acknowledgement_code, v_head.receipt_code,
    v_head.provider_code, p_acknowledgement_digest, v_head.admission_class,
    v_receipt_class, v_class, v_recorded,
    p_ack_steward_a, p_ack_steward_b,
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

  INSERT INTO agent_acrra_acknowledgement_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, acknowledgement_code, compile_kind,
    admission_class, receipt_class, acknowledgement_class, freshness_class,
    effect_observation, attested_key_kind, fact_disposition, body_visibility,
    access_path, metadata_trust, opens_nested_expiry, inlines_fact_body,
    ack_promoted_to_trust, packet_scan_used, acknowledgement_recorded, executes_tool,
    lag_publications, max_lag_budget, acknowledgement_hash, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_acknowledgement_code,
    'ACKNOWLEDGE_ISSUED_RECEIPT',
    v_head.admission_class, v_receipt_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_recorded, false, v_lag, v_head.max_lag_budget, p_acknowledgement_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrra_receipt_acknowledgement (
    account_id, utc_day, consumer_principal_id, receipt_acknowledgement_id, session_id,
    certificate_id, reader_receipt_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, acknowledgement_code,
    admission_class, citation_class, grant_class, receipt_class, acknowledgement_class,
    receipt_reason, acknowledgement_reason, citation_published, grant_issued,
    receipt_issued, acknowledgement_recorded, sealed_count, denied_count,
    unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust, access_path,
    inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
    executes_tool, trusted_next_action, acknowledgement_steward_a, acknowledgement_steward_b,
    reader_receipt_steward_a, reader_receipt_steward_b, acknowledgement_body,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_acknowledgement_id, p_session_id,
    p_certificate_id, v_head.reader_receipt_id, p_reader_principal, v_head.purpose_code,
    v_head.effect_code, v_head.provider_code, v_head.citation_code, v_head.grant_code,
    v_head.receipt_code, p_acknowledgement_code, v_head.admission_class,
    v_head.citation_class, v_head.grant_class, v_receipt_class, v_class,
    v_head.receipt_reason, v_reason, v_head.citation_published, v_head.grant_issued,
    v_receipt_issued, v_recorded, v_sealed, v_denied, v_unknown, v_lag,
    v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, false, v_next, p_ack_steward_a, p_ack_steward_b,
    v_head.reader_receipt_steward_a, v_head.reader_receipt_steward_b, v_body,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrra_acknowledgement_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id,
    receipt_acknowledgement_id, acknowledgement_code, acknowledgement_class,
    receipt_issued, acknowledgement_recorded, sealed_count, denied_count,
    unknown_effect_count, attested_key_kind, ack_promoted_to_trust,
    trusted_next_action, perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal,
    p_acknowledgement_id, p_acknowledgement_code, v_class, v_receipt_issued,
    v_recorded, v_sealed, v_denied, v_unknown, 'AWAITING_CONFIRMATION', false,
    v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acrra_acknowledgement_intent (
    account_id, acknowledgement_intent_id, session_id, certificate_id, intent_status,
    acknowledgement_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_acknowledgement_id, p_session_id, p_certificate_id, 'PREPARED',
    p_acknowledgement_id::TEXT, 1, p_acknowledgement_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrra_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_acknowledgement_id, p_session_id, 'ACKNOWLEDGE', 1, clock_timestamp()
  );

  INSERT INTO agent_acrra_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acrra_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'RECEIPT_ACKNOWLEDGEMENT_SEALED',
    p_acknowledgement_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acrra_session
  SET consumed_acknowledge_units = consumed_acknowledge_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$acknowledge$;

CREATE FUNCTION reject_agent_acrra_unscoped_scan(
  has_account BOOLEAN,
  has_receipt_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_receipt_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_acrra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrra_profile_authority;
ALTER FUNCTION revoke_agent_acrra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrra_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acrra_profile_authority;
GRANT SELECT ON
  agent_acrra_profile,
  agent_acrra_profile_acknowledgement_rule
TO agent_acrra_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrra_profile TO agent_acrra_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acrra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acrra_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrra_profile FROM PUBLIC;

CREATE INDEX agent_acrra_session_work_idx ON agent_acrra_session (
  account_id,
  status
);
CREATE INDEX agent_acrra_session_profile_idx ON agent_acrra_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acrra_head_consumer_idx ON agent_acrra_reader_receipt_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acrra_nomination_session_idx ON agent_acrra_receipt_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acrra_certificate_session_idx ON agent_acrra_acknowledgement_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acrra_decision_cert_idx ON agent_acrra_acknowledgement_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acrra_ack_consumer_idx ON agent_acrra_receipt_acknowledgement (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acrra_ack_reader_idx ON agent_acrra_receipt_acknowledgement (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acrra_perception_day_idx ON agent_acrra_acknowledgement_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acrra_intent_work_idx ON agent_acrra_acknowledgement_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acrra_audit_time_idx ON agent_acrra_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acrra_command_expiry_idx ON agent_acrra_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acrra_checkpoint_day_idx ON agent_acrra_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acrra_binding_day_idx ON agent_acrra_receipt_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acrra_authorization_evidence',
    'agent_acrra_profile',
    'agent_acrra_profile_acknowledgement_rule',
    'agent_acrra_reader_receipt_head',
    'agent_acrra_session',
    'agent_acrra_receipt_nomination',
    'agent_acrra_receipt_binding',
    'agent_acrra_acknowledgement_compile',
    'agent_acrra_acknowledgement_certificate',
    'agent_acrra_acknowledgement_decision',
    'agent_acrra_receipt_acknowledgement',
    'agent_acrra_acknowledgement_perception',
    'agent_acrra_acknowledgement_intent',
    'agent_acrra_budget_ledger',
    'agent_acrra_terminal_record',
    'agent_acrra_command_result',
    'agent_acrra_audit_head',
    'agent_acrra_audit_event',
    'agent_acrra_audit_anchor',
    'agent_acrra_projection_checkpoint'
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

Direct inserts that skip the acknowledgement function still pass
through the triggers. A successful acknowledgement on a `NOT_ISSUED`
receipt, a trusted key, a packet scan, a fact body, a tool execution
flag, or a nested expiry flag is rejected. The reader receipt head
cannot be updated to launder a refused receipt into an
acknowledgement. A reader other than the receipt reader is rejected,
so the insert does not grant a second reader.
## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcrraAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcrraReceiptClass {
  ISSUED
  NOT_ISSUED
}

enum AcrraAcknowledgementClass {
  ACKNOWLEDGED
  NOT_ACKNOWLEDGED
}

enum AcrraAcknowledgementReason {
  ISSUED_READER_RECEIPT_ACKNOWLEDGED
  NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE
}

enum AcrraNextAction {
  HOLD_RECEIPT_ACKNOWLEDGEMENT
  STOP_RECEIPT_ACKNOWLEDGEMENT
  OMIT_RECEIPT_ACKNOWLEDGEMENT
}

enum AcrraKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcrraProfile {
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
  procedureRef: String!
}

type AcrraSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerReceipt: Int!
}

type AcrraReaderReceiptHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptClass: AcrraReceiptClass!
  receiptIssued: Boolean!
  attestedKeyKind: AcrraKeyKind!
}

type AcrraReceiptAcknowledgement {
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
  acknowledgementCode: String!
  admissionClass: AcrraAdmissionClass!
  receiptClass: AcrraReceiptClass!
  acknowledgementClass: AcrraAcknowledgementClass!
  acknowledgementReason: AcrraAcknowledgementReason!
  receiptIssued: Boolean!
  acknowledgementRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcrraKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcrraNextAction!
}

type AcrraAcknowledgementPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  acknowledgementCode: String!
  acknowledgementRecorded: Boolean!
  perceptionBody: JSON!
}

type AcrraAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcrraProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcrraProfile
  agentAcrraSession(accountId: ID!, sessionId: ID!): AcrraSession
  agentAcrraReaderReceiptHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrraReaderReceiptHead
  agentAcrraReceiptAcknowledgement(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrraReceiptAcknowledgement
  agentAcrraAcknowledgementPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrraAcknowledgementPerception
  agentAcrraAuditEvents(accountId: ID!, utcDay: String!): [AcrraAuditEvent!]!
}

type Mutation {
  createAgentAcrraProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcrraProfile!
  approveAgentAcrraProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrraProfile!
  revokeAgentAcrraProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrraProfile!
  openAgentAcrraSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcrraSession!
  nominateAgentAcrraReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  acknowledgeAgentAcrraReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    acknowledgementCode: String!
  ): AcrraReceiptAcknowledgement!
  appendAgentAcrraAcknowledgementIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcrraAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Receipt and acknowledgement reads also
take a non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool. Resolvers
must call `reject_agent_acrra_unscoped_scan` before planning when
either the account or the receipt key is missing. An acknowledgement
read is one primary-key lookup. It does not join a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is
`proc:admitted-count-reader-receipt-acknowledgement`. The instruction
payload on the acknowledgement rule is deterministic JSON:

- point-look up one reader receipt by
  `(account_id, utc_day, consumer_principal_id)`;
- acknowledge the single `allowed_acknowledgement_code` for the
  receipt reader only when `receipt_issued` is true, the receipt
  reason is `GRANTED_CITATION_RECEIPT_ISSUED`, and the next action
  is `HOLD_READER_RECEIPT`;
- otherwise seal `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE` with null
  counts;
- never execute the tool inside the observation;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
acknowledgement code, and the receipt reader. It may not rewrite the
instruction by chatting with the engine. Changing the acknowledgement
code is a new profile version that stays `DRAFT` until the authority
fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single
acknowledgement code. Queries must filter `account_id` before topK.
A global ANN index would mix tenants and is rejected. The reference
schema does not build an HNSW index.

```sql
CREATE TABLE agent_acrra_profile_embedding (
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
    REFERENCES agent_acrra_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acrra_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acrra_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acrra_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one receipt, and acknowledges that profile's one
acknowledgement code for the receipt reader. Discovery never writes
`agent_acrra_receipt_acknowledgement`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the receipt `reader_principal_id` and the one
  `acknowledgement_code`;
- `acknowledgementRecorded` true only when the three counts are
  present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on an
  acknowledged observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`HOLD_RECEIPT_ACKNOWLEDGEMENT` as permission to execute the tool or
to enroll the key. `ACKED` on the upstream effect stays an
observation. It is not this acknowledgement, and it is not trust.

## 13. ACID and consistency

The acknowledgement function is one transaction. Binding, compile,
certificate, decision, observation, perception, intent, budget,
terminal, and audit commit together or not at all. The reader receipt
head is not updated. Isolation is the tenant RLS predicate on
`account_id`. Durability is the hash-chained audit event
`RECEIPT_ACKNOWLEDGEMENT_SEALED`.

Consistency beats a faster but lossy fan-out. An observation that
copied counts from a `NOT_ISSUED` receipt would be a durable lie.
The engine would rather seal `NOT_ACKNOWLEDGED` with null counts than
reconstruct a reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null acknowledgement
  code is **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected
  access paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one receipt. A second nomination is
  rejected.
- The observation does not execute the tool, does not call the
  provider, and does not open another nested expiry.
- A reader other than the receipt reader is rejected, which keeps
  one noisy agent from acknowledging every principal in the account.
- Budgets cap acknowledge, vector, and notify units so a retry loop
  cannot spend a neighbor's latency.
- Semantic topK is account-filtered and cannot record an
  acknowledgement.

These guards keep the 99.99% availability target. An autonomous
agent cannot turn one acknowledgement into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The acknowledgement path does not read a board. It reads one primary
key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve
the path lead with `account_id`. There is no predicate that scans
every item on a board, every context packet, or every reader in the
account.

Any plan that lacks both `account_id` and the receipt key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this plane.
The columnar synopsis stays upstream. This plane does not
re-aggregate it.

## 16. Auditability and replay

Each seal appends `agent_acrra_audit_event` with
`event_kind = RECEIPT_ACKNOWLEDGEMENT_SEALED`, a 64-character event
hash, and a previous hash. Replay reads the reader receipt head and
the profile acknowledgement code and must reproduce
`acknowledgement_class`, `acknowledgement_reason`, the reader, and
the three counts or their absence. Replay does not call a model.
The receipt head and the observation row are immutable after insert,
so a later agent cannot edit history to make a refused receipt look
acknowledged.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the
  receipt reader. The function rejects the call. The receipt head
  reader stays unchanged.
- **Forged acknowledgement on a refused receipt:** the trigger reads
  the head by primary key and rejects `acknowledgement_recorded`
  when `receipt_issued` is false.
- **Count laundering:** an acknowledged observation whose counts
  differ from the head is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The
  observation is not a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash`
  are rejected on the head and on the observation.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane
  does not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are
  rejected.
- **Steward reuse:** acknowledgement stewards must be distinct from
  the reader, the consumer, the reader-receipt stewards, and every
  upstream steward.
- **Cross-tenant read:** forced RLS hides every row whose
  `account_id` does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is
  rejected. Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the acknowledgement transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The acknowledgement transaction performs one primary-key read and
  a fixed set of primary-key writes. It has no board fan-out.
- Counters: acknowledgements recorded, acknowledgements refused,
  full-scan rejects, steward-reuse rejects, second-reader rejects,
  and tool-execution rejects.
- A recorded acknowledgement with null counts, or a refused
  acknowledgement with any count, is a correctness page.
- A receipt-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing acknowledgements.
2. Export reader receipt heads for one canary account by primary
   key. Confirm heads are immutable and tenant-scoped.
3. Enable `acknowledge_agent_acrra_receipt` for that account.
   Compare recorded counts to the receipt head.
4. Watch full-scan rejects and second-reader rejects. A spike means
   an agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW
   index. Do not enable tool execution inside the observation.

Revocation stops new sessions. It does not rewrite sealed
observations.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one acknowledgement for an issued head with
  counts 1/1/1 and lag 3 inside budget 5, leaves that head
  unchanged, and seals `ISSUED_READER_RECEIPT_ACKNOWLEDGED` for
  `principal:reader-1`.
- A not-issued head with lag 8 keeps null counts,
  `NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE`, and the denied lag.
- Silence seals `NOT_ACKNOWLEDGED` with a null lag and null counts.
- A null day, a second nomination, a foreign acknowledgement code,
  a fact body, a nested expiry, a packet scan, steward reuse, an
  acknowledgement on a not-issued receipt, a reader equal to the
  consumer, counts that differ from the head, an ack promoted to
  trust, tool execution, a mutated head, a mutated observation, a
  profile inserted as approved, a second reader, and an unscoped
  scan are rejected.
- `npm audit` reports no vulnerabilities in the validation
  toolchain.

## 21. Product decision

Ship the acknowledgement observation as a deterministic point
lookup of an already sealed reader receipt. The observation copies
the three counts only when `receipt_issued` is true, names only the
receipt reader, and leaves the receipt head unchanged. `ACKED` is
not trust. The tool does not run. The plane does not open another
nested expiry.

The next increment should record one consumer-visible hold of one
already `ACKNOWLEDGED` observation by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_ACKNOWLEDGED`
observation cannot be held as received. The hold copies the three
counts only when `acknowledgement_recorded` is true. The reader on
the hold must equal the observation reader and stay distinct from
the consumer and every steward. The hold must not scan context
packets, must not inline a fact body, must not promote `ACKED` to
`TRUSTED_ENROLLED`, must not execute the tool, must not grant a
second reader, and must not open another nested expiry plane.
