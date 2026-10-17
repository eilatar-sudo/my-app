# mondayDB Agentic Admitted Count Grant Reader Receipt Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-17.v1`

## 1. Why this plane, before how

The 2026-10-16 Admitted Count Citation Grant Plane seals one citation
grant for one already sealed citation card. The grain is
`(account_id, utc_day, consumer_principal_id)`. A `GRANTED` row
copies the three counts, names exactly one reader, and seals
`PUBLISHED_CITATION_GRANT_ISSUED` with next action
`HOLD_CITATION_GRANT`. A `NOT_GRANTED` row seals
`NOT_PUBLISHED_CITATION_CANNOT_GRANT` with null counts. That plane
does not issue a reader receipt.

Without this plane an agent either:

- treats `HOLD_CITATION_GRANT` itself as proof the reader received
  the counts, or
- walks context packets, tool logs, or a board with 1M+ rows to
  invent a delivery (neighbor-harmful, and a miss against the
  99.99% availability target).

The product trade-off is **receipt honesty versus grant isolation**,
and **receipt latency versus a second reader**:

- Honesty: the one reader named on a `GRANTED` grant should receive
  one receipt that copies the three counts already on the grant,
  without opening the grant again.
- Isolation: the database does not call the provider and does not
  execute the tool. Receipting is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or
  recursive tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_GRANTED` grant cannot issue a reader
  receipt. The receipt names the granted reader and no one else. A
  second reader is a new request, and this plane rejects it.
- The citation grant head is not rewritten. Replay of the grant
  stays stable. The receipt is a new row that cites the grant by
  primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does
  not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the receipt is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed receipt plus
the grant id it cites. Neighbor availability stays at the 99.99%
target because an unscoped day walk, a reader list, or a packet
walk is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved receipt profile is procedural memory for "how one
   already sealed citation grant becomes a single-reader receipt."
   The profile names exactly one receipt code and the one grant
   code that receipt may cite. A profile never inlines a fact body,
   never rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one grant key. The receipt then
   reads `agent_acgrr_citation_grant_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB issues a successful receipt only when the head is
   `GRANTED`, `grant_issued` is true, the grant reason is
   `PUBLISHED_CITATION_GRANT_ISSUED`, the next action is
   `HOLD_CITATION_GRANT`, and the requested reader equals the
   granted reader. The copy of the three counts is equality with
   the grant. It does not call a model and it does not execute the
   tool.
4. `NOT_GRANTED` seals `NOT_GRANTED_CITATION_CANNOT_RECEIPT` with
   `receipt_issued = false` and null counts. Silence keeps a null
   lag. There is no successful receipt.
5. The reader equals the granted reader and is distinct from the
   consumer and from every steward, including the two reader-receipt
   stewards. Two reader-receipt stewards witness the receipt. They
   are distinct from the consumer, from the reader, from the grant
   stewards, and from the citation, provider, effect, bind,
   provider-receipt, card, admission, attestation, synopsis, and
   publication stewards.
6. Unscoped grant or board scans are **FULL SCAN REJECTED** before
   planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session receipted the nomination
  and the reader receipt?
- Was the receipt a point lookup of an already sealed grant, and
  what class did that grant have?
- Did a `GRANTED` grant receipt exactly its one reader and seal
  `GRANTED_CITATION_RECEIPT_ISSUED` with the three granted counts?
- Did a `NOT_GRANTED` grant stay unreceipted, with null counts and
  `NOT_GRANTED_CITATION_CANNOT_RECEIPT`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the citation grant head keep the class, the reader, and the
  counts it was exported with?
- Can the receipt be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never issues this
receipt.

## 2. Scope and ownership

The Admitted Count Grant Reader Receipt Plane owns:

1. Immutable approved receipt profiles as procedural memory, each
   naming one receipt code for one citation grant.
2. Tenant-scoped receipt sessions with a hard cap of one nominated
   grant and the one reader already on that grant.
3. Deterministic nomination of that grant, then one point lookup of
   the citation grant head.
4. A reader receipt keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the
   granted `reader_principal_id`.
5. An agent perception row that carries counts only when
   `receipt_issued` is true, which is only when `grant_issued` is
   true.
6. Audit events that cite the receipt hash.

It integrates with, but does not replace:

- **Admitted Count Citation Grant Plane:** supplies the sealed
  grant this plane reads. Exporters copy the grant class, the grant
  reason, `grant_issued`, the one reader, the counts the grant
  actually issued, the next action, and the stewards onto
  `agent_acgrr_citation_grant_head`. This plane does not re-grant
  the card, does not recover withheld counts, and does not promote
  `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, receipt, vector,
  and notify units. A refused grant is a sealed non-receipt, not a
  scan of the packet log. The receipt does not run the tool and
  does not call the provider.

### Non-goals

- Letting an LLM choose which reader a grant may receipt.
- Executing the tool, calling the provider, or compiling a board
  query inside `receipt_agent_acgrr_reader`.
- Receipting any receipt code other than the single code on the
  approved profile.
- Copying counts onto a receipt whose grant is `NOT_GRANTED`.
- Rewriting the citation grant head so a refused grant becomes a
  successful receipt.
- Naming a reader other than the granted reader. That would grant
  a second reader, and this plane rejects it.
- Recomputing receipts by scanning a board, a packet log, or a
  reader ledger.
- Cross-account receipts or global nearest-neighbor receipting.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the receipt.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because
  the effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this receipt.
- Acknowledging the receipt as received. That is the next plane,
  and only for an already `ISSUED` receipt.

## 3. Product contract

### 3.1 Receipt profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the grant must already carry
  (one token, no list);
- the single `allowed_effect_code` the head must already carry
  (one token, no list);
- the single `allowed_provider_code` the head must already carry
  (one token, no list);
- the single `allowed_citation_code` the head must already carry
  (one token, no list);
- the single `allowed_grant_code` the head must already carry
  (one token, no list);
- the single `allowed_receipt_code` this plane may seal (one token,
  no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- receipt threshold (distinct reader-receipt stewards, minimum 2),
  max grants per session (exactly 1), max nominated grants
  (exactly 1), and max readers per grant (exactly 1);
- receipt policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `RECEIPT_NEVER_EXECUTES_TOOL`, `RECEIPT_NEVER_INLINES_BODY`,
  `RECEIPT_NEVER_CONFIRMS`, `ONE_GRANT_PER_SESSION`,
  `ONE_RECEIPT_PER_GRANT`, `GRANTED_READER_ONLY`,
  `POINT_LOOKUP_ONLY`, `GRANTED_GRANT_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `COUNTS_ONLY_WHEN_GRANT_ISSUED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_RECEIPT`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest receipt reason is
`NOT_GRANTED_CITATION_CANNOT_RECEIPT` (36 bytes). The success
reason is `GRANTED_CITATION_RECEIPT_ISSUED` (32 bytes).

Approval and revocation require the authority fence
`approve_agent_acgrr_profile` / `revoke_agent_acgrr_profile`, owned
by `agent_acgrr_profile_authority`. A profile cannot be inserted
as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, receipt,
vector, and notify units, plus wall time.
`max_grants_per_session`, `max_nominated_grants`, and
`max_readers_per_grant` are all exactly 1. A second grant
nomination in the same session is rejected before it can fan out
into a recursive reader walk.

The session principal is the only consumer that session may
receipt. A receipt for a different consumer is rejected. The reader
on the receipt is the reader already stored on the grant. It cannot
be the consumer, and it cannot be replaced.

### 3.3 Citation grant head and nomination contract

Upstream grant export writes one citation grant head per
`(account_id, utc_day, consumer_principal_id)`. The head copy
includes `grant_class`, `grant_reason`, `grant_issued`,
`reader_principal_id`, `trusted_next_action`, the three counts when
they were issued, and the stewards. It does not include a fact body
and it does not include withheld counts. The head is immutable.
This plane does not advance it and does not reclassify it.

`nominate_agent_acgrr_grant(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates
that grant. A null `utc_day`, a null `account_id`, a null consumer,
or a null receipt code is **FULL SCAN REJECTED**. The access path is
`POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN`
are rejected.

### 3.4 Reader receipt contract

`receipt_agent_acgrr_reader` is the only compile that writes a
reader receipt. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one citation grant head for that key, with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `receipt_code` equal to the profile's `allowed_receipt_code`,
  and `grant_code` equal to the head grant and the profile grant,
  each matching `^[a-z0-9:_-]{1,64}$` (one token, not a list and
  not a query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the grant
  head, and distinct from the consumer, from both reader-receipt
  stewards, and from every grant, citation, provider, effect, bind,
  provider-receipt, card, admission, attestation, synopsis, and
  publication steward;
- reader-receipt stewards distinct from each other and from those
  same principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That
grain holds one receipt and therefore the one granted reader.
Projection is:

- `ISSUED` when the head grant class is `GRANTED`, `grant_issued`
  is true, the grant reason is `PUBLISHED_CITATION_GRANT_ISSUED`,
  and the next action is `HOLD_CITATION_GRANT`. The receipt copies
  `sealed_count`, `denied_count`, and `unknown_effect_count`.
  `receipt_issued` is true. `receipt_reason` is
  `GRANTED_CITATION_RECEIPT_ISSUED`. `trusted_next_action` is
  `HOLD_READER_RECEIPT`. The action holds the receipt for that one
  reader. It does not run the tool, it does not inline a fact body,
  and it does not open another nested expiry.
- `NOT_ISSUED` when the head next action is `STOP_CITATION_GRANT`.
  Counts stay null. `receipt_reason` is
  `NOT_GRANTED_CITATION_CANNOT_RECEIPT`. `receipt_issued` is false.
  `trusted_next_action` is `STOP_READER_RECEIPT`. The denied lag is
  copied and is not cleared.
- `NOT_ISSUED` when the head admission class is `UNKNOWN_EFFECT`
  or the next action is `OMIT_CITATION_GRANT`. Counts stay null.
  The receipt lag stays null. `receipt_reason` is
  `NOT_GRANTED_CITATION_CANNOT_RECEIPT`. `receipt_issued` is false.
  `trusted_next_action` is `OMIT_READER_RECEIPT`.

A `NOT_GRANTED` grant cannot issue a reader receipt. The three
counts are copied only when `grant_issued` is true. `receipt_body`
rejects `factBody`, `fact_body`, and `resolvedFactHash`. `ACKED`
is copied as `effect_observation` when the head observed it. It
does not write `TRUSTED_ENROLLED`. The citation grant head is not
updated. A second receipt for the same consumer and day is
rejected. A reader other than the granted reader is rejected, so
this plane does not grant a second reader. A forged issued row
whose counts differ from the head is rejected. A forged issued row
on a `NOT_GRANTED` head is rejected. A forged non-receipt that
carries any count, or that sets `receipt_issued`, is rejected. A
receipt code other than the profile code is rejected before a row
is sealed, so the caller can retry the one allowed code. A null
receipt code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acgrr_receipt_perception` for
the agent. Counts appear there only when `receipt_issued` is true.
The perception names `receipt_code`, the granted reader, and
whether the receipt was issued. Receipt intents start as
`PREPARED`. Provider silence stays `UNKNOWN_EFFECT`. An
acknowledgement of the notify is not enrollment, not a fact
restore, not a tool execution, and not a second reader. This plane
does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads
   with `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null receipt code, or a
   null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one grant. The access path is
   `POINT_LOOKUP`. One grant receipts its one reader.
4. The citation grant head is immutable. The receipt does not
   rewrite it and does not change its reader.
5. A successful reader receipt is issued only from a `GRANTED`
   head whose grant reason is `PUBLISHED_CITATION_GRANT_ISSUED`,
   whose `grant_issued` is true, and whose next action is
   `HOLD_CITATION_GRANT`, and only for the profile's single
   receipt code and the granted reader.
6. `NOT_GRANTED` receipts store null counts and
   `receipt_issued = false`. Silence stores a null lag. A
   `NOT_GRANTED` grant cannot issue a reader receipt. Counts are
   copied only when `grant_issued` is true.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`,
   and `executes_tool` stay false. The receipt does not execute
   the tool.
9. The reader equals the granted reader. The reader, the consumer,
   the reader-receipt stewards, the grant stewards, and the
   upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never issues a
    receipt.
11. The engine does not call a model. Replay is a pure function of
    the citation grant head, the consumer id, the granted reader,
    and the profile receipt code.

## 5. Execution model

```text
approved profile (one allowed_receipt_code)
  -> open session (one grant budget, the granted reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read citation grant head by primary key
  -> require reader = granted reader
  -> project ISSUED or NOT_ISSUED
  -> append receipt + perception + audit
  -> leave the citation grant head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `RECEIPT_GRANTED_CITATION` for both receipts. The
class on the receipt, not a second plane, distinguishes an issued
receipt from a refusal. Notify dispatch is a later receipt intent
and may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one
   provider code, one citation code, one grant code, and one
   receipt code, and add one dual-control receipt rule.
2. Approve it through `agent_acgrr_profile_authority`.
3. Export one citation grant head per consumer and day. The export
   is a point copy of the citation grant, not a packet walk.
4. Open a session and nominate one grant key.
5. Receipt the profile receipt code to the granted reader. Granted
   grants copy the counts and seal
   `GRANTED_CITATION_RECEIPT_ISSUED`. Other grants seal a
   non-receipt with null counts.
6. The agent reads the perception row. A withheld perception has
   no count fields and `receiptIssued: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite receipts already sealed.
8. This plane does not open another nested expiry. It does not run
   the tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type ReaderReceiptId = string;
export type UtcDay = string;
export type ReceiptCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type GrantClass = "GRANTED" | "NOT_GRANTED";
export type GrantReason =
  | "PUBLISHED_CITATION_GRANT_ISSUED"
  | "NOT_PUBLISHED_CITATION_CANNOT_GRANT";
export type GrantNextAction =
  | "HOLD_CITATION_GRANT"
  | "STOP_CITATION_GRANT"
  | "OMIT_CITATION_GRANT";
export type ReceiptClass = "ISSUED" | "NOT_ISSUED";
export type ReceiptReason =
  | "GRANTED_CITATION_RECEIPT_ISSUED"
  | "NOT_GRANTED_CITATION_CANNOT_RECEIPT";
export type ReceiptNextAction =
  | "HOLD_READER_RECEIPT"
  | "STOP_READER_RECEIPT"
  | "OMIT_READER_RECEIPT";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const RECEIPT_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface CitationGrantHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly admissionClass: AdmissionClass;
  readonly grantClass: GrantClass;
  readonly grantReason: GrantReason;
  readonly grantIssued: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: GrantNextAction;
}

export interface ReaderReceipt {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly readerReceiptId: ReaderReceiptId;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly receiptCode: ReceiptCode;
  readonly admissionClass: AdmissionClass;
  readonly grantClass: GrantClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly grantIssued: boolean;
  readonly receiptIssued: boolean;
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

export function projectReaderReceipt(
  head: CitationGrantHead,
  readerReceiptId: ReaderReceiptId,
  readerPrincipalId: PrincipalId,
  receiptCode: ReceiptCode,
): ReaderReceipt {
  const readerIsGranted = readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    readerReceiptId,
    consumerPrincipalId: head.consumerPrincipalId,
    readerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode: head.citationCode,
    grantCode: head.grantCode,
    receiptCode,
    admissionClass: head.admissionClass,
    grantClass: head.grantClass,
    grantIssued: head.grantIssued,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleReceipt = RECEIPT_TOKEN.test(receiptCode);

  if (
    readerIsGranted &&
    readerIsDistinct &&
    singleReceipt &&
    head.grantClass === "GRANTED" &&
    head.grantReason === "PUBLISHED_CITATION_GRANT_ISSUED" &&
    head.grantIssued &&
    head.trustedNextAction === "HOLD_CITATION_GRANT" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      receiptClass: "ISSUED",
      receiptReason: "GRANTED_CITATION_RECEIPT_ISSUED",
      receiptIssued: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "HOLD_READER_RECEIPT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_CITATION_GRANT";

  return {
    ...shared,
    grantClass: "NOT_GRANTED",
    grantIssued: false,
    receiptClass: "NOT_ISSUED",
    receiptReason: "NOT_GRANTED_CITATION_CANNOT_RECEIPT",
    receiptIssued: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_READER_RECEIPT" : "STOP_READER_RECEIPT",
  };
}
```

```ts
export function perceptionOmitsUnissuedReceipt(receipt: ReaderReceipt): boolean {
  return (
    receipt.receiptIssued === false &&
    receipt.receiptClass === "NOT_ISSUED" &&
    receipt.sealedCount === null &&
    receipt.deniedCount === null &&
    receipt.unknownEffectCount === null &&
    receipt.ackPromotedToTrust === false &&
    receipt.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    receipt.executesTool === false
  );
}
```

`projectReaderReceipt` is the procedural projection an agent runtime
must match. It never returns `TRUSTED_ENROLLED`. It never copies
counts off a grant whose `grant_issued` is false. It never executes
the tool. A receipt token that is not a single code, or a reader
other than the granted reader, projects to `NOT_ISSUED`. The
database additionally requires the token to equal the approved
profile receipt code, requires the reader to equal the granted
reader, and rejects a reader who collides with the consumer or any
steward, before it seals `ISSUED`. A mismatched reader is rejected
rather than sealed, so the plane does not grant a second reader.

## 8. SQL row-store schema

```sql
CREATE TYPE acgrr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acgrr_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acgrr_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acgrr_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acgrr_citation_class AS ENUM ('PUBLISHED', 'NOT_PUBLISHED');
CREATE TYPE acgrr_grant_class AS ENUM ('GRANTED', 'NOT_GRANTED');
CREATE TYPE acgrr_grant_reason AS ENUM (
  'PUBLISHED_CITATION_GRANT_ISSUED',
  'NOT_PUBLISHED_CITATION_CANNOT_GRANT'
);
CREATE TYPE acgrr_grant_next AS ENUM (
  'HOLD_CITATION_GRANT',
  'STOP_CITATION_GRANT',
  'OMIT_CITATION_GRANT'
);
CREATE TYPE acgrr_receipt_class AS ENUM ('ISSUED', 'NOT_ISSUED');
CREATE TYPE acgrr_receipt_reason AS ENUM (
  'GRANTED_CITATION_RECEIPT_ISSUED',
  'NOT_GRANTED_CITATION_CANNOT_RECEIPT'
);
CREATE TYPE acgrr_receipt_next AS ENUM (
  'HOLD_READER_RECEIPT',
  'STOP_READER_RECEIPT',
  'OMIT_READER_RECEIPT'
);
CREATE TYPE acgrr_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acgrr_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acgrr_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acgrr_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acgrr_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acgrr_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acgrr_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acgrr_compile_kind AS ENUM ('RECEIPT_GRANTED_CITATION');
CREATE TYPE acgrr_terminal_kind AS ENUM (
  'RECEIPT_ISSUED',
  'RECEIPT_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acgrr_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_RECEIPT',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acgrr_profile_authority NOLOGIN;

CREATE FUNCTION acgrr_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acgrr_authorization_evidence (
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

CREATE TABLE agent_acgrr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acgrr_profile_status NOT NULL,
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
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_grants_per_session INTEGER NOT NULL CHECK (max_grants_per_session = 1),
  max_nominated_grants INTEGER NOT NULL CHECK (max_nominated_grants = 1),
  max_readers_per_grant INTEGER NOT NULL CHECK (max_readers_per_grant = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acgrr_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acgrr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acgrr_profile_receipt_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acgrr_admission_class[] NOT NULL,
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_grants_per_session INTEGER NOT NULL CHECK (max_grants_per_session = 1),
  max_nominated_grants INTEGER NOT NULL CHECK (max_nominated_grants = 1),
  max_readers_per_grant INTEGER NOT NULL CHECK (max_readers_per_grant = 1),
  require_dual_control_receipt BOOLEAN NOT NULL,
  receipt_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acgrr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acgrr_citation_grant_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_grant_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acgrr_admission_class NOT NULL,
  citation_class acgrr_citation_class NOT NULL,
  grant_class acgrr_grant_class NOT NULL,
  grant_reason acgrr_grant_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  freshness_class acgrr_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acgrr_effect_observation NOT NULL,
  attested_key_kind acgrr_key_kind NOT NULL,
  fact_disposition acgrr_fact_disposition NOT NULL,
  body_visibility acgrr_body_visibility NOT NULL,
  metadata_trust acgrr_metadata_trust NOT NULL,
  access_path acgrr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acgrr_grant_next NOT NULL,
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
  grant_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, citation_grant_id),
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
  CHECK (NOT (grant_body ? 'factBody')),
  CHECK (NOT (grant_body ? 'fact_body')),
  CHECK (NOT (grant_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acgrr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acgrr_session_status NOT NULL,
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
  max_grants_per_session INTEGER NOT NULL CHECK (max_grants_per_session = 1),
  max_nominated_grants INTEGER NOT NULL CHECK (max_nominated_grants = 1),
  max_readers_per_grant INTEGER NOT NULL CHECK (max_readers_per_grant = 1),
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
    REFERENCES agent_acgrr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acgrr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acgrr_grant_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acgrr_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id)
);

CREATE TABLE agent_acgrr_grant_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  citation_grant_id UUID NOT NULL,
  admission_class acgrr_admission_class NOT NULL,
  grant_class acgrr_grant_class NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acgrr_citation_grant_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acgrr_receipt_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_code TEXT NOT NULL,
  admission_class acgrr_admission_class NOT NULL,
  receipt_class acgrr_receipt_class NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acgrr_receipt_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  receipt_code TEXT NOT NULL,
  grant_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  admission_class acgrr_admission_class NOT NULL,
  grant_class acgrr_grant_class NOT NULL,
  receipt_class acgrr_receipt_class NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
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
    REFERENCES agent_acgrr_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acgrr_receipt_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acgrr_receipt_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_code TEXT NOT NULL,
  compile_kind acgrr_compile_kind NOT NULL,
  admission_class acgrr_admission_class NOT NULL,
  grant_class acgrr_grant_class NOT NULL,
  receipt_class acgrr_receipt_class NOT NULL,
  freshness_class acgrr_freshness_class NOT NULL,
  effect_observation acgrr_effect_observation NOT NULL,
  attested_key_kind acgrr_key_kind NOT NULL,
  fact_disposition acgrr_fact_disposition NOT NULL,
  body_visibility acgrr_body_visibility NOT NULL,
  access_path acgrr_access_path NOT NULL,
  metadata_trust acgrr_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acgrr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acgrr_reader_receipt (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  citation_grant_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acgrr_admission_class NOT NULL,
  citation_class acgrr_citation_class NOT NULL,
  grant_class acgrr_grant_class NOT NULL,
  receipt_class acgrr_receipt_class NOT NULL,
  grant_reason acgrr_grant_reason NOT NULL,
  receipt_reason acgrr_receipt_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acgrr_effect_observation NOT NULL,
  attested_key_kind acgrr_key_kind NOT NULL,
  fact_disposition acgrr_fact_disposition NOT NULL,
  body_visibility acgrr_body_visibility NOT NULL,
  metadata_trust acgrr_metadata_trust NOT NULL,
  access_path acgrr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acgrr_receipt_next NOT NULL,
  reader_receipt_steward_a TEXT NOT NULL,
  reader_receipt_steward_b TEXT NOT NULL,
  grant_steward_a TEXT NOT NULL,
  grant_steward_b TEXT NOT NULL,
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, reader_receipt_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acgrr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acgrr_citation_grant_head (account_id, utc_day, consumer_principal_id),
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
    (receipt_issued = true AND receipt_class = 'ISSUED' AND grant_issued = true
      AND grant_class = 'GRANTED'
      AND trusted_next_action = 'HOLD_READER_RECEIPT'
      AND receipt_reason = 'GRANTED_CITATION_RECEIPT_ISSUED'
      AND receipt_body ? 'sealedCount'
      AND receipt_body ? 'deniedCount'
      AND receipt_body ? 'unknownEffectCount')
    OR (receipt_issued = false AND receipt_class = 'NOT_ISSUED' AND grant_issued = false
      AND grant_class = 'NOT_GRANTED'
      AND receipt_reason = 'NOT_GRANTED_CITATION_CANNOT_RECEIPT'
      AND trusted_next_action IN ('STOP_READER_RECEIPT', 'OMIT_READER_RECEIPT')
      AND NOT (receipt_body ? 'sealedCount')
      AND NOT (receipt_body ? 'deniedCount')
      AND NOT (receipt_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acgrr_receipt_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  reader_receipt_id UUID NOT NULL,
  receipt_code TEXT NOT NULL,
  receipt_class acgrr_receipt_class NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acgrr_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acgrr_receipt_next NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acgrr_reader_receipt (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acgrr_receipt_intent (
  account_id BIGINT NOT NULL,
  receipt_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acgrr_intent_status NOT NULL,
  receipt_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acgrr_receipt_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acgrr_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id)
);

CREATE TABLE agent_acgrr_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acgrr_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id)
);

CREATE TABLE agent_acgrr_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id)
);

CREATE TABLE agent_acgrr_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acgrr_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acgrr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acgrr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acgrr_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_acgrr_profile()
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
      IF current_setting('app.acgrr_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acgrr_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acgrr_profile_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_profile();

CREATE FUNCTION protect_agent_acgrr_receipt_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acgrr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acgrr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed receipt rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acgrr_receipt_rule_protect
BEFORE UPDATE ON agent_acgrr_profile_receipt_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_receipt_rule();

CREATE FUNCTION protect_agent_acgrr_citation_grant_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed citation grant head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.grant_body ? 'factBody'
     OR NEW.grant_body ? 'fact_body'
     OR NEW.grant_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NOT acgrr_parties_are_distinct(ARRAY[
       NEW.reader_principal_id, NEW.consumer_principal_id,
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

  IF NEW.grant_class = 'GRANTED' OR NEW.grant_issued OR NEW.citation_published THEN
    IF NEW.grant_issued IS DISTINCT FROM TRUE
       OR NEW.grant_class IS DISTINCT FROM 'GRANTED'
       OR NEW.grant_reason IS DISTINCT FROM 'PUBLISHED_CITATION_GRANT_ISSUED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_CITATION_GRANT'
       OR NEW.citation_published IS DISTINCT FROM TRUE
       OR NEW.citation_class IS DISTINCT FROM 'PUBLISHED'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.grant_body ? 'sealedCount')
       OR NOT (NEW.grant_body ? 'deniedCount')
       OR NOT (NEW.grant_body ? 'unknownEffectCount') THEN
      RAISE EXCEPTION 'granted citation head must carry the granted counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.grant_reason IS DISTINCT FROM 'NOT_PUBLISHED_CITATION_CANNOT_GRANT'
     OR NEW.grant_class IS DISTINCT FROM 'NOT_GRANTED'
     OR NEW.grant_issued
     OR NEW.citation_published
     OR NEW.citation_class IS DISTINCT FROM 'NOT_PUBLISHED'
     OR NEW.grant_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not granted citation head cannot carry a receipt';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_CITATION_GRANT' THEN
      RAISE EXCEPTION 'silence is not an issued reader receipt';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_CITATION_GRANT' THEN
      RAISE EXCEPTION 'denied citation grant head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'citation grant head class is not receiptable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acgrr_citation_grant_head_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_citation_grant_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_citation_grant_head();

CREATE FUNCTION protect_agent_acgrr_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.receipt_hash IS DISTINCT FROM NEW.receipt_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'reader receipt decision identity is immutable';
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

  IF NEW.receipt_class = 'ISSUED' AND NEW.receipt_issued IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'issued receipt must copy the granted counts';
  END IF;

  IF NEW.receipt_class = 'NOT_ISSUED' AND NEW.receipt_issued THEN
    RAISE EXCEPTION 'not granted citation cannot issue a reader receipt';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acgrr_decision_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_receipt_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_decision();

CREATE FUNCTION protect_agent_acgrr_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acgrr_parties_are_distinct(ARRAY[
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
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acgrr_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_receipt_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_certificate();

CREATE FUNCTION protect_agent_acgrr_receipt_intent()
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

CREATE TRIGGER agent_acgrr_receipt_intent_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_receipt_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_receipt_intent();

CREATE FUNCTION protect_agent_acgrr_reader_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_receipt$
DECLARE
  v_head agent_acgrr_citation_grant_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed reader receipt is immutable';
  END IF;

  IF NEW.executes_tool THEN
    RAISE EXCEPTION 'tool execution inside the reader receipt';
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
    RAISE EXCEPTION 'reader receipt fence';
  END IF;

  IF NEW.receipt_code IS NULL OR NEW.receipt_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acgrr_citation_grant_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'citation grant head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the granted reader';
  END IF;

  IF NOT acgrr_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.reader_receipt_steward_a, NEW.reader_receipt_steward_b,
    NEW.grant_steward_a, NEW.grant_steward_b,
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

  IF NEW.grant_steward_a IS DISTINCT FROM v_head.grant_steward_a
     OR NEW.grant_steward_b IS DISTINCT FROM v_head.grant_steward_b
     OR NEW.citation_grant_id IS DISTINCT FROM v_head.citation_grant_id THEN
    RAISE EXCEPTION 'reader receipt must cite the sealed grant';
  END IF;

  IF NEW.receipt_class = 'ISSUED' OR NEW.receipt_issued THEN
    IF v_head.grant_class IS DISTINCT FROM 'GRANTED'
       OR v_head.grant_issued IS DISTINCT FROM TRUE
       OR v_head.grant_reason IS DISTINCT FROM 'PUBLISHED_CITATION_GRANT_ISSUED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'HOLD_CITATION_GRANT' THEN
      RAISE EXCEPTION 'not granted citation cannot issue a reader receipt';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.receipt_reason IS DISTINCT FROM 'GRANTED_CITATION_RECEIPT_ISSUED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_READER_RECEIPT'
       OR NEW.grant_issued IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'ISSUED' THEN
      RAISE EXCEPTION 'issued receipt must copy the granted counts';
    END IF;
  ELSE
    IF v_head.grant_class IS DISTINCT FROM 'NOT_GRANTED' OR v_head.grant_issued THEN
      RAISE EXCEPTION 'granted citation must receipt the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.receipt_body ? 'sealedCount'
       OR NEW.receipt_issued
       OR NEW.grant_issued
       OR NEW.receipt_reason IS DISTINCT FROM 'NOT_GRANTED_CITATION_CANNOT_RECEIPT' THEN
      RAISE EXCEPTION 'not granted citation cannot issue a reader receipt';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_CITATION_GRANT' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_READER_RECEIPT' THEN
        RAISE EXCEPTION 'silence cannot issue a reader receipt';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_READER_RECEIPT'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused receipt must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt
  FROM agent_acgrr_session AS s
  JOIN agent_acgrr_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_receipt IS NULL
     OR NEW.receipt_code IS DISTINCT FROM v_receipt
     OR NEW.grant_code IS DISTINCT FROM v_grant
     OR NEW.provider_code IS DISTINCT FROM v_provider
     OR NEW.effect_code IS DISTINCT FROM v_effect
     OR NEW.purpose_code IS DISTINCT FROM v_purpose
     OR NEW.effect_code IS DISTINCT FROM v_head.effect_code
     OR NEW.purpose_code IS DISTINCT FROM v_head.purpose_code
     OR NEW.provider_code IS DISTINCT FROM v_head.provider_code
     OR NEW.citation_code IS DISTINCT FROM v_head.citation_code
     OR NEW.grant_code IS DISTINCT FROM v_head.grant_code THEN
    RAISE EXCEPTION 'receipt code is not the profile receipt';
  END IF;

  RETURN NEW;
END
$protect_receipt$;

CREATE TRIGGER agent_acgrr_reader_receipt_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_reader_receipt
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_reader_receipt();

CREATE FUNCTION protect_agent_acgrr_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed receipt perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.receipt_class = 'NOT_ISSUED'
     AND (NEW.receipt_issued
          OR NEW.grant_issued
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not issued perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acgrr_perception_protect
BEFORE INSERT OR UPDATE ON agent_acgrr_receipt_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acgrr_perception();

CREATE FUNCTION approve_agent_acgrr_profile(
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
  stored_status acgrr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acgrr_profile
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
  FROM agent_acgrr_profile_receipt_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_receipt IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control receipt rule';
  END IF;

  PERFORM set_config(
    'app.acgrr_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acgrr_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acgrr_profile(
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
  stored_status acgrr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acgrr_profile
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
    'app.acgrr_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acgrr_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acgrr_grant(
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
  v_session_status acgrr_session_status;
  v_profile_status acgrr_profile_status;
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
    FROM agent_acgrr_grant_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one grant per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acgrr_session AS s
  JOIN agent_acgrr_profile AS pr
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

  INSERT INTO agent_acgrr_grant_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION receipt_agent_acgrr_reader(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_receipt_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_receipt_id UUID,
  p_receipt_digest TEXT,
  p_receipt_steward_a TEXT,
  p_receipt_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $receipt_reader$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acgrr_session_status;
  v_profile_status acgrr_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_principal TEXT;
  v_head agent_acgrr_citation_grant_head%ROWTYPE;
  v_class acgrr_receipt_class;
  v_reason acgrr_receipt_reason;
  v_issued BOOLEAN;
  v_grant_issued BOOLEAN;
  v_grant_class acgrr_grant_class;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acgrr_receipt_next;
  v_terminal acgrr_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_receipt_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_receipt_digest) <> 64 THEN
    RAISE EXCEPTION 'receipt digest must be 64 hex characters';
  END IF;

  IF p_receipt_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acgrr_grant_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'reader receipt requires a nominated grant point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_principal
  FROM agent_acgrr_session AS s
  JOIN agent_acgrr_profile AS pr
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

  IF p_receipt_code IS DISTINCT FROM v_allowed_receipt THEN
    RAISE EXCEPTION 'receipt code is not the profile receipt';
  END IF;

  SELECT * INTO v_head
  FROM agent_acgrr_citation_grant_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'citation grant head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation
     OR v_head.grant_code IS DISTINCT FROM v_allowed_grant THEN
    RAISE EXCEPTION 'grant code is not the profile grant';
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
     OR v_head.grant_body ? 'factBody'
     OR v_head.grant_body ? 'fact_body'
     OR v_head.grant_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'reader receipt fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acgrr_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_receipt_steward_a, p_receipt_steward_b,
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
    RAISE EXCEPTION 'reader must equal the granted reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acgrr_reader_receipt
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'reader receipt already issued';
  END IF;

  IF v_head.grant_class = 'GRANTED'
     AND v_head.grant_reason = 'PUBLISHED_CITATION_GRANT_ISSUED'
     AND v_head.grant_issued
     AND v_head.citation_published
     AND v_head.trusted_next_action = 'HOLD_CITATION_GRANT'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.citation_class = 'PUBLISHED' THEN
    v_class := 'ISSUED';
    v_reason := 'GRANTED_CITATION_RECEIPT_ISSUED';
    v_issued := true;
    v_grant_issued := true;
    v_grant_class := 'GRANTED';
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'HOLD_READER_RECEIPT';
    v_terminal := 'RECEIPT_ISSUED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_CITATION_GRANT' THEN
    v_class := 'NOT_ISSUED';
    v_reason := 'NOT_GRANTED_CITATION_CANNOT_RECEIPT';
    v_issued := false;
    v_grant_issued := false;
    v_grant_class := 'NOT_GRANTED';
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_READER_RECEIPT';
    v_terminal := 'RECEIPT_REFUSED';
  ELSE
    v_class := 'NOT_ISSUED';
    v_reason := 'NOT_GRANTED_CITATION_CANNOT_RECEIPT';
    v_issued := false;
    v_grant_issued := false;
    v_grant_class := 'NOT_GRANTED';
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_READER_RECEIPT';
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
    'receiptCode', p_receipt_code,
    'admissionClass', v_head.admission_class,
    'grantClass', v_grant_class,
    'receiptClass', v_class,
    'receiptReason', v_reason,
    'grantIssued', v_grant_issued,
    'receiptIssued', v_issued,
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
  IF v_issued THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acgrr_grant_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, citation_grant_id, admission_class, grant_class,
    grant_issued, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.citation_grant_id, v_head.admission_class,
    v_head.grant_class, v_head.grant_issued, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acgrr_receipt_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, receipt_code, admission_class, receipt_class, receipt_issued,
    receipt_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_receipt_code, v_head.admission_class, v_class, v_issued,
    p_receipt_digest, clock_timestamp()
  );

  INSERT INTO agent_acgrr_receipt_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, receipt_code, grant_code, provider_code, receipt_hash,
    admission_class, grant_class, receipt_class, receipt_issued,
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
    p_reader_principal, p_utc_day, p_receipt_code, v_head.grant_code, v_head.provider_code,
    p_receipt_digest, v_head.admission_class, v_grant_class, v_class, v_issued,
    p_receipt_steward_a, p_receipt_steward_b,
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

  INSERT INTO agent_acgrr_receipt_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, receipt_code, compile_kind,
    admission_class, grant_class, receipt_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    receipt_issued, executes_tool, lag_publications, max_lag_budget, receipt_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_receipt_code, 'RECEIPT_GRANTED_CITATION',
    v_head.admission_class, v_grant_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_issued, false, v_lag, v_head.max_lag_budget, p_receipt_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acgrr_reader_receipt (
    account_id, utc_day, consumer_principal_id, reader_receipt_id, session_id,
    certificate_id, citation_grant_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, receipt_code, admission_class, citation_class,
    grant_class, receipt_class, grant_reason, receipt_reason, citation_published,
    grant_issued, receipt_issued, sealed_count, denied_count, unknown_effect_count,
    lag_publications, max_lag_budget, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, metadata_trust, access_path, inlines_fact_body,
    opens_nested_expiry, ack_promoted_to_trust, packet_scan_used, executes_tool,
    trusted_next_action, reader_receipt_steward_a, reader_receipt_steward_b,
    grant_steward_a, grant_steward_b, receipt_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_receipt_id, p_session_id,
    p_certificate_id, v_head.citation_grant_id, p_reader_principal, v_head.purpose_code,
    v_head.effect_code, v_head.provider_code, v_head.citation_code, v_head.grant_code,
    p_receipt_code, v_head.admission_class, v_head.citation_class, v_grant_class, v_class,
    v_head.grant_reason, v_reason, v_head.citation_published, v_grant_issued, v_issued,
    v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget, v_head.effect_observation,
    'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, false, v_next, p_receipt_steward_a, p_receipt_steward_b,
    v_head.grant_steward_a, v_head.grant_steward_b, v_body,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acgrr_receipt_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, reader_receipt_id,
    receipt_code, receipt_class, grant_issued, receipt_issued, sealed_count, denied_count,
    unknown_effect_count, attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_receipt_id,
    p_receipt_code, v_class, v_grant_issued, v_issued, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acgrr_receipt_intent (
    account_id, receipt_intent_id, session_id, certificate_id, intent_status,
    receipt_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, p_certificate_id, 'PREPARED',
    p_receipt_id::TEXT, 1, p_receipt_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acgrr_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, 'RECEIPT', 1, clock_timestamp()
  );

  INSERT INTO agent_acgrr_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acgrr_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'READER_RECEIPT_SEALED',
    p_receipt_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acgrr_session
  SET consumed_receipt_units = consumed_receipt_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$receipt_reader$;

CREATE FUNCTION reject_agent_acgrr_unscoped_scan(
  has_account BOOLEAN,
  has_grant_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_grant_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_acgrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acgrr_profile_authority;
ALTER FUNCTION revoke_agent_acgrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acgrr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acgrr_profile_authority;
GRANT SELECT ON
  agent_acgrr_profile,
  agent_acgrr_profile_receipt_rule
TO agent_acgrr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acgrr_profile TO agent_acgrr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acgrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acgrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acgrr_profile FROM PUBLIC;

CREATE INDEX agent_acgrr_session_work_idx ON agent_acgrr_session (
  account_id,
  status
);
CREATE INDEX agent_acgrr_session_profile_idx ON agent_acgrr_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acgrr_head_consumer_idx ON agent_acgrr_citation_grant_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acgrr_nomination_session_idx ON agent_acgrr_grant_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acgrr_certificate_session_idx ON agent_acgrr_receipt_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acgrr_decision_cert_idx ON agent_acgrr_receipt_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acgrr_receipt_consumer_idx ON agent_acgrr_reader_receipt (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acgrr_receipt_reader_idx ON agent_acgrr_reader_receipt (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acgrr_perception_day_idx ON agent_acgrr_receipt_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acgrr_intent_work_idx ON agent_acgrr_receipt_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acgrr_audit_time_idx ON agent_acgrr_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acgrr_command_expiry_idx ON agent_acgrr_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acgrr_checkpoint_day_idx ON agent_acgrr_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acgrr_binding_day_idx ON agent_acgrr_grant_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acgrr_authorization_evidence',
    'agent_acgrr_profile',
    'agent_acgrr_profile_receipt_rule',
    'agent_acgrr_citation_grant_head',
    'agent_acgrr_session',
    'agent_acgrr_grant_nomination',
    'agent_acgrr_grant_binding',
    'agent_acgrr_receipt_compile',
    'agent_acgrr_receipt_certificate',
    'agent_acgrr_receipt_decision',
    'agent_acgrr_reader_receipt',
    'agent_acgrr_receipt_perception',
    'agent_acgrr_receipt_intent',
    'agent_acgrr_budget_ledger',
    'agent_acgrr_terminal_record',
    'agent_acgrr_command_result',
    'agent_acgrr_audit_head',
    'agent_acgrr_audit_event',
    'agent_acgrr_audit_anchor',
    'agent_acgrr_projection_checkpoint'
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

Direct inserts that skip the receipt function still pass through the
triggers. A successful receipt on a `NOT_GRANTED` grant, a trusted
key, a packet scan, a fact body, a tool execution flag, or a nested
expiry flag is rejected. The citation grant head cannot be updated
to launder a refused grant into a reader receipt. A reader other
than the granted reader is rejected, so the insert does not grant
a second reader.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcgrrAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcgrrGrantClass {
  GRANTED
  NOT_GRANTED
}

enum AcgrrReceiptClass {
  ISSUED
  NOT_ISSUED
}

enum AcgrrReceiptReason {
  GRANTED_CITATION_RECEIPT_ISSUED
  NOT_GRANTED_CITATION_CANNOT_RECEIPT
}

enum AcgrrNextAction {
  HOLD_READER_RECEIPT
  STOP_READER_RECEIPT
  OMIT_READER_RECEIPT
}

enum AcgrrKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcgrrProfile {
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
  procedureRef: String!
}

type AcgrrSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerGrant: Int!
}

type AcgrrCitationGrantHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  grantClass: AcgrrGrantClass!
  grantIssued: Boolean!
  attestedKeyKind: AcgrrKeyKind!
}

type AcgrrReaderReceipt {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  readerReceiptId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  grantCode: String!
  receiptCode: String!
  admissionClass: AcgrrAdmissionClass!
  grantClass: AcgrrGrantClass!
  receiptClass: AcgrrReceiptClass!
  receiptReason: AcgrrReceiptReason!
  grantIssued: Boolean!
  receiptIssued: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcgrrKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcgrrNextAction!
}

type AcgrrReceiptPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  receiptCode: String!
  receiptIssued: Boolean!
  perceptionBody: JSON!
}

type AcgrrAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcgrrProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcgrrProfile
  agentAcgrrSession(accountId: ID!, sessionId: ID!): AcgrrSession
  agentAcgrrCitationGrantHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcgrrCitationGrantHead
  agentAcgrrReaderReceipt(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcgrrReaderReceipt
  agentAcgrrReceiptPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcgrrReceiptPerception
  agentAcgrrAuditEvents(accountId: ID!, utcDay: String!): [AcgrrAuditEvent!]!
}

type Mutation {
  createAgentAcgrrProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcgrrProfile!
  approveAgentAcgrrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcgrrProfile!
  revokeAgentAcgrrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcgrrProfile!
  openAgentAcgrrSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcgrrSession!
  nominateAgentAcgrrGrant(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  receiptAgentAcgrrReader(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    receiptCode: String!
  ): AcgrrReaderReceipt!
  appendAgentAcgrrReceiptIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcgrrAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Grant and receipt reads also take a
non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool.
Resolvers must call `reject_agent_acgrr_unscoped_scan` before
planning when either the account or the grant key is missing. A
receipt read is one primary-key lookup. It does not join a packet
catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-grant-reader-receipt`. The
instruction payload on the receipt rule is deterministic JSON:

- point-look up one citation grant by
  `(account_id, utc_day, consumer_principal_id)`;
- receipt the single `allowed_receipt_code` to the granted reader
  only when `grant_issued` is true, the grant reason is
  `PUBLISHED_CITATION_GRANT_ISSUED`, and the next action is
  `HOLD_CITATION_GRANT`;
- otherwise seal `NOT_GRANTED_CITATION_CANNOT_RECEIPT` with null
  counts;
- never execute the tool inside the receipt;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
receipt code, and the granted reader. It may not rewrite the
instruction by chatting with the engine. Changing the receipt code
is a new profile version that stays `DRAFT` until the authority
fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash, which
covers the single receipt code. Queries must filter `account_id`
before topK. A global ANN index would mix tenants and is rejected.
The reference schema does not build an HNSW index.

```sql
CREATE TABLE agent_acgrr_profile_embedding (
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
    REFERENCES agent_acgrr_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acgrr_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acgrr_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acgrr_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one grant, and receipts that profile's one
receipt code to the granted reader. Discovery never writes
`agent_acgrr_reader_receipt`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the
  point key;
- the granted `reader_principal_id` and the one `receipt_code`;
- `receiptIssued` true only when the three counts are present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on
  an issued receipt;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not
  treat tags as authorization.

A withheld perception has no count fields. The agent must not
invent them, must not scan a board to recover them, and must not
treat `HOLD_READER_RECEIPT` as permission to execute the tool or
to enroll the key.

## 13. ACID and consistency

The receipt function is one transaction. Binding, compile,
certificate, decision, receipt, perception, intent, budget,
terminal, and audit commit together or not at all. The citation
grant head is not updated. Isolation is the tenant RLS predicate
on `account_id`. Durability is the hash-chained audit event
`READER_RECEIPT_SEALED`.

Consistency beats a faster but lossy fan-out. A receipt that
copied counts from a `NOT_GRANTED` grant would be a durable lie.
The engine would rather seal `NOT_ISSUED` with null counts than
reconstruct a reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null receipt code is
  **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected
  access paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one grant. A second nomination is
  rejected.
- The receipt does not execute the tool, does not call the
  provider, and does not open another nested expiry.
- A reader other than the granted reader is rejected, which keeps
  one noisy agent from receipting every principal in the account.
- Budgets cap receipt, vector, and notify units so a retry loop
  cannot spend a neighbor's latency.
- Semantic topK is account-filtered and cannot issue a receipt.

These guards keep the 99.99% availability target. An autonomous
agent cannot turn one receipt into a recursive board walk.

## 15. Performance check for boards with 1M+ rows

The receipt path does not read a board. It reads one primary key:

`(account_id, utc_day, consumer_principal_id)`

and writes one primary key of that same grain. Indexes that serve
the path lead with `account_id`. There is no predicate that scans
every item on a board, every context packet, or every reader in
the account.

Any plan that lacks both `account_id` and the grant key is
**FULL SCAN REJECTED**. A 1M+ row board is untouched by this
plane. The columnar synopsis stays upstream. This plane does not
re-aggregate it.

## 16. Auditability and replay

Each seal appends `agent_acgrr_audit_event` with
`event_kind = READER_RECEIPT_SEALED`, a 64-character event hash,
and a previous hash. Replay reads the citation grant head and the
profile receipt code and must reproduce `receipt_class`,
`receipt_reason`, the reader, and the three counts or their
absence. Replay does not call a model. The grant head and the
receipt row are immutable after insert, so a later agent cannot
edit history to make a refused grant look issued.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the
  granted reader. The function rejects the call. The grant head
  reader stays unchanged.
- **Forged issued receipt on a refused grant:** the trigger reads
  the head by primary key and rejects `receipt_issued` when
  `grant_issued` is false.
- **Count laundering:** an issued receipt whose counts differ from
  the head is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The receipt
  is not a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash`
  are rejected on the head and on the receipt.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane
  does not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are
  rejected.
- **Steward reuse:** reader-receipt stewards must be distinct from
  the reader, the consumer, the grant stewards, and every upstream
  steward.
- **Cross-tenant read:** forced RLS hides every row whose
  `account_id` does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is
  rejected. Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the receipt transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The receipt transaction performs one primary-key read and a
  fixed set of primary-key writes. It has no board fan-out.
- Counters: receipts issued, receipts refused, full-scan rejects,
  steward-reuse rejects, second-reader rejects, and tool-execution
  rejects.
- An issued receipt with null counts, or a refused receipt with
  any count, is a correctness page.
- A grant-head update after seal is a correctness page.
- Notify intents may remain `UNKNOWN_EFFECT`. That state is not
  enrollment and is not a failed availability SLO.

## 19. Rollout

1. Ship the schema and the authority role dark, with no GraphQL
   resolver writing receipts.
2. Export citation grant heads for one canary account by primary
   key. Confirm heads are immutable and tenant-scoped.
3. Enable `receipt_agent_acgrr_reader` for that account. Compare
   issued counts to the grant head.
4. Watch full-scan rejects and second-reader rejects. A spike
   means an agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW
   index. Do not enable tool execution inside the receipt.

Revocation stops new sessions. It does not rewrite sealed
receipts.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector
  table. Every relational table leads with `account_id` and has
  forced row level security.
- The fixture issues one receipt for a granted head with counts
  1/1/1 and lag 3 inside budget 5, leaves that head unchanged, and
  seals `GRANTED_CITATION_RECEIPT_ISSUED` for `principal:reader-1`.
- A not-granted head with lag 8 keeps null counts,
  `NOT_GRANTED_CITATION_CANNOT_RECEIPT`, and the denied lag.
- Silence seals `NOT_ISSUED` with a null lag and null counts.
- A null day, a second nomination, a foreign receipt code, a fact
  body, a nested expiry, a packet scan, steward reuse, an issued
  receipt on a not-granted grant, a reader equal to the consumer,
  counts that differ from the head, an ack promoted to trust, tool
  execution, a mutated head, a mutated receipt, a profile inserted
  as approved, a second reader, and an unscoped scan are rejected.
- `npm audit` reports no vulnerabilities in the validation
  toolchain.

## 21. Product decision

Ship the reader receipt as a deterministic point lookup of an
already sealed citation grant. The receipt copies the three counts
only when `grant_issued` is true, names only the granted reader,
and leaves the grant head unchanged. `ACKED` is not trust. The
tool does not run. The plane does not open another nested expiry.

The next increment should record one acknowledgement observation
of one already `ISSUED` reader receipt by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_ISSUED`
receipt cannot be acknowledged as received. The observation copies
the three counts only when `receipt_issued` is true. The reader on
the observation must equal the receipt reader and stay distinct
from the consumer and every steward. The observation must not scan
context packets, must not inline a fact body, must not promote
`ACKED` to `TRUSTED_ENROLLED`, must not execute the tool, must not
grant a second reader, and must not open another nested expiry
plane.
