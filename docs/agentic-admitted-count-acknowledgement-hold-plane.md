# mondayDB Agentic Admitted Count Acknowledgement Hold Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-19.v1`

## 1. Why this plane, before how

The 2026-10-18 Admitted Count Reader Receipt Acknowledgement Plane seals
one acknowledgement observation for one already sealed reader receipt.
The grain is `(account_id, utc_day, consumer_principal_id)`. An
`ACKNOWLEDGED` row copies the three counts, names exactly the receipt
reader, and seals `ISSUED_READER_RECEIPT_ACKNOWLEDGED` with next action
`HOLD_RECEIPT_ACKNOWLEDGEMENT`. A `NOT_ACKNOWLEDGED` row seals
`NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE` with null counts. That plane
does not record a consumer-visible hold.

Without this plane an agent either:

- treats `HOLD_RECEIPT_ACKNOWLEDGEMENT` itself as proof the consumer
  can see the counts, or
- walks context packets, tool logs, or a board with 1M+ rows to invent
  a hold (neighbor-harmful, and a miss against the 99.99% availability
  target).

The product trade-off is **hold honesty versus acknowledgement
isolation**, and **hold latency versus a second reader**:

- Honesty: the consumer named on an `ACKNOWLEDGED` observation should
  have one consumer-visible hold that copies the three counts already
  on that observation, without opening the observation again.
- Isolation: the database does not call the provider and does not
  execute the tool. Holding is a deterministic seal. A probabilistic
  agent stays outside the engine, so a slow or recursive tool cannot
  spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_ACKNOWLEDGED` observation cannot be held as
  received. The hold names the observation reader and no one else. A
  second reader is a new request, and this plane rejects it.
- The acknowledgement head is not rewritten. Replay of the observation
  stays stable. The hold is a new row that cites the observation by
  primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does not
  promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the hold is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed hold plus the
acknowledgement id it cites. Neighbor availability stays at the 99.99%
target because an unscoped day walk, a reader list, or a packet walk
is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved hold profile is procedural memory for "how one already
   sealed acknowledgement observation becomes a single consumer-visible
   hold." The profile names exactly one hold code and the one
   acknowledgement code that hold may cite. A profile never inlines a
   fact body, never rewrites `ACKED` as `TRUSTED_ENROLLED`, and never
   opens another nested expiry plane.
2. A session nominates exactly one observation key. The hold then
   reads `agent_acrah_acknowledgement_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB records a successful hold only when the head is
   `ACKNOWLEDGED`, `acknowledgement_recorded` is true, the
   acknowledgement reason is `ISSUED_READER_RECEIPT_ACKNOWLEDGED`, the
   next action is `HOLD_RECEIPT_ACKNOWLEDGEMENT`, and the requested
   reader equals the observation reader. The copy of the three counts
   is equality with the observation. It does not call a model and it
   does not execute the tool.
4. `NOT_ACKNOWLEDGED` seals
   `NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD` with
   `hold_recorded = false` and null counts. Silence keeps a null lag.
   There is no successful hold.
5. The reader equals the observation reader and is distinct from the
   consumer and from every steward, including the two hold stewards
   and the two acknowledgement stewards. Two hold stewards witness the
   hold. They are distinct from the consumer, from the reader, from
   the acknowledgement stewards, and from the reader-receipt, grant,
   citation, provider, effect, bind, provider-receipt, card, admission,
   attestation, synopsis, and publication stewards.
6. Unscoped observation or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the nomination and
  the consumer-visible hold?
- Was the hold a point lookup of an already sealed acknowledgement,
  and what class did that observation have?
- Did an `ACKNOWLEDGED` observation hold exactly its one reader and
  seal `ACKNOWLEDGED_OBSERVATION_HELD` with the three observation
  counts?
- Did a `NOT_ACKNOWLEDGED` observation stay unheld, with null counts
  and `NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the acknowledgement head keep the class, the reader, and the
  counts it was exported with?
- Can the hold be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never records this
hold.

## 2. Scope and ownership

The Admitted Count Acknowledgement Hold Plane owns:

1. Immutable approved hold profiles as procedural memory, each naming
   one hold code for one acknowledgement observation.
2. Tenant-scoped hold sessions with a hard cap of one nominated
   observation and the one reader already on that observation.
3. Deterministic nomination of that observation, then one point lookup
   of the acknowledgement head.
4. A consumer-visible hold keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming the
   observation `reader_principal_id`.
5. An agent perception row that carries counts only when
   `hold_recorded` is true, which is only when
   `acknowledgement_recorded` is true.
6. Audit events that cite the hold hash.

It integrates with, but does not replace:

- **Admitted Count Reader Receipt Acknowledgement Plane:** supplies
  the sealed observation this plane reads. Exporters copy the
  acknowledgement class, the acknowledgement reason,
  `acknowledgement_recorded`, the one reader, the counts the
  observation actually copied, the next action, and the stewards onto
  `agent_acrah_acknowledgement_head`. This plane does not
  re-acknowledge the receipt, does not recover withheld counts, and
  does not promote `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, hold, vector, and
  notify units. A refused observation is a sealed non-hold, not a
  scan of the packet log. The hold does not run the tool and does not
  call the provider.

### Non-goals

- Letting an LLM choose which reader an observation may hold.
- Executing the tool, calling the provider, or compiling a board
  query inside `hold_agent_acrah_acknowledgement`.
- Holding any hold code other than the single code on the approved
  profile.
- Copying counts onto a hold whose observation is `NOT_ACKNOWLEDGED`.
- Rewriting the acknowledgement head so a refused observation becomes
  a successful hold.
- Naming a reader other than the observation reader. That would grant
  a second reader, and this plane rejects it.
- Recomputing holds by scanning a board, a packet log, or a reader
  ledger.
- Cross-account holds or global nearest-neighbor hold.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the hold.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because the
  effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this hold.
- Publishing a separate consumer perception card of the hold. That is
  the next plane, and only for an already `HELD` observation.

## 3. Product contract

### 3.1 Hold profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the observation must already carry
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
- the single `allowed_acknowledgement_code` the head must already
  carry (one token, no list);
- the single `allowed_hold_code` this plane may seal (one token, no
  list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- hold threshold (distinct hold stewards, minimum 2), max observations
  per session (exactly 1), max nominated observations (exactly 1), and
  max readers per observation (exactly 1);
- hold policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `HOLD_NEVER_EXECUTES_TOOL`, `HOLD_NEVER_INLINES_BODY`,
  `HOLD_NEVER_CONFIRMS`, `ONE_OBSERVATION_PER_SESSION`,
  `ONE_HOLD_PER_OBSERVATION`, `OBSERVATION_READER_ONLY`,
  `POINT_LOOKUP_ONLY`, `ACKNOWLEDGED_OBSERVATION_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `COUNTS_ONLY_WHEN_ACKNOWLEDGEMENT_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_HOLD`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so PostgreSQL
`CREATE TYPE` accepts it. The longest hold reason is
`NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD` (40 bytes). The success
reason is `ACKNOWLEDGED_OBSERVATION_HELD` (30 bytes).

Approval and revocation require the authority fence
`approve_agent_acrah_profile` / `revoke_agent_acrah_profile`, owned by
`agent_acrah_profile_authority`. A profile cannot be inserted as
`APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, hold, vector,
and notify units, plus wall time. `max_observations_per_session`,
`max_nominated_observations`, and `max_readers_per_observation` are
all exactly 1. A second observation nomination in the same session is
rejected before it can fan out into a recursive reader walk.

The session principal is the only consumer that session may hold. A
hold for a different consumer is rejected. The reader on the hold is
the reader already stored on the observation. It cannot be the
consumer, and it cannot be replaced.

### 3.3 Acknowledgement head and nomination contract

Upstream acknowledgement export writes one acknowledgement head per
`(account_id, utc_day, consumer_principal_id)`. The head copy includes
`acknowledgement_class`, `acknowledgement_reason`,
`acknowledgement_recorded`, `reader_principal_id`,
`trusted_next_action`, the three counts when they were recorded, and
the stewards. It does not include a fact body and it does not include
withheld counts. The head is immutable. This plane does not advance it
and does not reclassify it.

`nominate_agent_acrah_observation(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates that
observation. A null `utc_day`, a null `account_id`, a null consumer,
or a null hold code is **FULL SCAN REJECTED**. The access path is
`POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN` are
rejected.

### 3.4 Consumer-visible hold contract

`hold_agent_acrah_acknowledgement` is the only compile that writes a
consumer-visible hold. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one acknowledgement head for that key, with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `hold_code` equal to the profile's `allowed_hold_code`, and
  `acknowledgement_code` equal to the head acknowledgement and the
  profile acknowledgement, each matching `^[a-z0-9:_-]{1,64}$` (one
  token, not a list and not a query);
- a consumer principal equal to the session principal;
- a reader principal equal to `reader_principal_id` on the
  acknowledgement head, and distinct from the consumer, from both
  hold stewards, from both acknowledgement stewards, and from every
  reader-receipt, grant, citation, provider, effect, bind,
  provider-receipt, card, admission, attestation, synopsis, and
  publication steward;
- hold stewards distinct from each other and from those same
  principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That
grain holds one consumer-visible hold and therefore the one
observation reader. Projection is:

- `HELD` when the head acknowledgement class is `ACKNOWLEDGED`,
  `acknowledgement_recorded` is true, the acknowledgement reason is
  `ISSUED_READER_RECEIPT_ACKNOWLEDGED`, and the next action is
  `HOLD_RECEIPT_ACKNOWLEDGEMENT`. The hold copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`. `hold_recorded` is
  true. `hold_reason` is `ACKNOWLEDGED_OBSERVATION_HELD`.
  `trusted_next_action` is `HOLD_ACKNOWLEDGED_OBSERVATION`. The action
  shows the three counts to that consumer for that one reader. It
  does not run the tool, it does not inline a fact body, and it does
  not open another nested expiry.
- `NOT_HELD` when the head next action is `STOP_RECEIPT_ACKNOWLEDGEMENT`.
  Counts stay null. `hold_reason` is
  `NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD`. `hold_recorded` is
  false. `trusted_next_action` is `STOP_ACKNOWLEDGEMENT_HOLD`. The
  denied lag is copied and is not cleared.
- `NOT_HELD` when the head admission class is `UNKNOWN_EFFECT` or the
  next action is `OMIT_RECEIPT_ACKNOWLEDGEMENT`. Counts stay null. The
  hold lag stays null. `hold_reason` is
  `NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD`. `hold_recorded` is
  false. `trusted_next_action` is `OMIT_ACKNOWLEDGEMENT_HOLD`.

A `NOT_ACKNOWLEDGED` observation cannot be held as received. The three
counts are copied only when `acknowledgement_recorded` is true.
`hold_body` rejects `factBody`, `fact_body`, and `resolvedFactHash`.
`ACKED` is copied as `effect_observation` when the head observed it.
It does not write `TRUSTED_ENROLLED`. The acknowledgement head is not
updated. A second hold for the same consumer and day is rejected. A
reader other than the observation reader is rejected, so this plane
does not grant a second reader. A forged held row whose counts differ
from the head is rejected. A forged held row on a `NOT_ACKNOWLEDGED`
head is rejected. A forged non-hold that carries any count, or that
sets `hold_recorded`, is rejected. A hold code other than the profile
code is rejected before a row is sealed, so the caller can retry the
one allowed code. A null hold code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acrah_hold_perception` for the
agent. Counts appear there only when `hold_recorded` is true. The
perception names `hold_code`, the observation reader, and whether the
hold was recorded. Hold intents start as `PREPARED`. Provider silence
stays `UNKNOWN_EFFECT`. A hold of the notify is not enrollment, not a
fact restore, not a tool execution, and not a second reader. This
plane does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads with
   `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null hold code, or a null
   `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one observation. The access path is
   `POINT_LOOKUP`. One observation holds its one reader.
4. The acknowledgement head is immutable. The hold does not rewrite
   it and does not change its reader.
5. A successful hold is recorded only from an `ACKNOWLEDGED` head
   whose acknowledgement reason is
   `ISSUED_READER_RECEIPT_ACKNOWLEDGED`, whose
   `acknowledgement_recorded` is true, and whose next action is
   `HOLD_RECEIPT_ACKNOWLEDGEMENT`, and only for the profile's single
   hold code and the observation reader.
6. `NOT_ACKNOWLEDGED` holds store null counts and
   `hold_recorded = false`. Silence stores a null lag. A
   `NOT_ACKNOWLEDGED` observation cannot be held as received. Counts
   are copied only when `acknowledgement_recorded` is true.
7. `ACKED` stays an effect observation. `AWAITING_CONFIRMATION` stays
   the key kind. `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`, and
   `executes_tool` stay false. The hold does not execute the tool.
9. The reader equals the observation reader. The reader, the consumer,
   the hold stewards, the acknowledgement stewards, and the upstream
   stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never records a hold.
11. The engine does not call a model. Replay is a pure function of the
    acknowledgement head, the consumer id, the observation reader, and
    the profile hold code.

## 5. Execution model

```text
approved profile (one allowed_hold_code)
  -> open session (one observation budget, the observation reader only)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read acknowledgement head by primary key
  -> require reader = observation reader
  -> project HELD or NOT_HELD
  -> append hold + perception + audit
  -> leave the acknowledgement head unchanged
  -> do not execute the tool
  -> do not grant a second reader
```

Compile kind is `HOLD_ACKNOWLEDGED_OBSERVATION` for both holds. The
class on the hold, not a second plane, distinguishes a recorded hold
from a refusal. Notify dispatch is a later hold intent and may remain
`UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one provider
   code, one citation code, one grant code, one receipt code, one
   acknowledgement code, and one hold code, and add one dual-control
   hold rule.
2. Approve it through `agent_acrah_profile_authority`.
3. Export one acknowledgement head per consumer and day. The export
   is a point copy of the acknowledgement observation, not a packet
   walk.
4. Open a session and nominate one observation key.
5. Hold the profile hold code for the observation reader. Acknowledged
   observations copy the counts and seal
   `ACKNOWLEDGED_OBSERVATION_HELD`. Other observations seal a non-hold
   with null counts.
6. The agent reads the perception row. A withheld perception has no
   count fields and `holdRecorded: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite holds already sealed.
8. This plane does not open another nested expiry. It does not run the
   tool. It does not grant a second reader.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type HoldId = string;
export type UtcDay = string;
export type HoldCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type AcknowledgementClass = "ACKNOWLEDGED" | "NOT_ACKNOWLEDGED";
export type AcknowledgementReason =
  | "ISSUED_READER_RECEIPT_ACKNOWLEDGED"
  | "NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE";
export type AcknowledgementNextAction =
  | "HOLD_RECEIPT_ACKNOWLEDGEMENT"
  | "STOP_RECEIPT_ACKNOWLEDGEMENT"
  | "OMIT_RECEIPT_ACKNOWLEDGEMENT";
export type HoldClass = "HELD" | "NOT_HELD";
export type HoldReason =
  | "ACKNOWLEDGED_OBSERVATION_HELD"
  | "NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD";
export type HoldNextAction =
  | "HOLD_ACKNOWLEDGED_OBSERVATION"
  | "STOP_ACKNOWLEDGEMENT_HOLD"
  | "OMIT_ACKNOWLEDGEMENT_HOLD";
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
  readonly acknowledgementCode: string;
  readonly admissionClass: AdmissionClass;
  readonly acknowledgementClass: AcknowledgementClass;
  readonly acknowledgementReason: AcknowledgementReason;
  readonly acknowledgementRecorded: boolean;
  readonly receiptIssued: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: AcknowledgementNextAction;
}

export interface ConsumerVisibleHold {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly holdId: HoldId;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: string;
  readonly receiptCode: string;
  readonly acknowledgementCode: string;
  readonly holdCode: HoldCode;
  readonly admissionClass: AdmissionClass;
  readonly acknowledgementClass: AcknowledgementClass;
  readonly holdClass: HoldClass;
  readonly holdReason: HoldReason;
  readonly acknowledgementRecorded: boolean;
  readonly holdRecorded: boolean;
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
  readonly trustedNextAction: HoldNextAction;
}

export function projectConsumerVisibleHold(
  head: AcknowledgementHead,
  holdId: HoldId,
  readerPrincipalId: PrincipalId,
  holdCode: HoldCode,
): ConsumerVisibleHold {
  const readerIsObservationReader =
    readerPrincipalId === head.readerPrincipalId;
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    holdId,
    consumerPrincipalId: head.consumerPrincipalId,
    readerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode: head.citationCode,
    grantCode: head.grantCode,
    receiptCode: head.receiptCode,
    acknowledgementCode: head.acknowledgementCode,
    holdCode,
    admissionClass: head.admissionClass,
    acknowledgementClass: head.acknowledgementClass,
    acknowledgementRecorded: head.acknowledgementRecorded,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleCode = HOLD_TOKEN.test(holdCode);

  if (
    readerIsObservationReader &&
    readerIsDistinct &&
    singleCode &&
    head.acknowledgementClass === "ACKNOWLEDGED" &&
    head.acknowledgementReason === "ISSUED_READER_RECEIPT_ACKNOWLEDGED" &&
    head.acknowledgementRecorded &&
    head.receiptIssued &&
    head.trustedNextAction === "HOLD_RECEIPT_ACKNOWLEDGEMENT" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      holdClass: "HELD",
      holdReason: "ACKNOWLEDGED_OBSERVATION_HELD",
      holdRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "HOLD_ACKNOWLEDGED_OBSERVATION",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_RECEIPT_ACKNOWLEDGEMENT";

  return {
    ...shared,
    acknowledgementClass: "NOT_ACKNOWLEDGED",
    acknowledgementRecorded: false,
    holdClass: "NOT_HELD",
    holdReason: "NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD",
    holdRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit
      ? "OMIT_ACKNOWLEDGEMENT_HOLD"
      : "STOP_ACKNOWLEDGEMENT_HOLD",
  };
}
```

```ts
export function perceptionOmitsUnheldObservation(
  hold: ConsumerVisibleHold,
): boolean {
  return (
    hold.holdRecorded === false &&
    hold.holdClass === "NOT_HELD" &&
    hold.sealedCount === null &&
    hold.deniedCount === null &&
    hold.unknownEffectCount === null &&
    hold.ackPromotedToTrust === false &&
    hold.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    hold.executesTool === false
  );
}
```

`projectConsumerVisibleHold` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`. It never
copies counts off an observation whose `acknowledgement_recorded` is
false. It never executes the tool. A hold token that is not a single
code, or a reader other than the observation reader, projects to
`NOT_HELD`. The database additionally requires the token to equal the
approved profile hold code, requires the reader to equal the
observation reader, and rejects a reader who collides with the
consumer or any steward, before it seals `HELD`. A mismatched reader
is rejected rather than sealed, so the plane does not grant a second
reader.

## 8. SQL row-store schema

```sql
CREATE TYPE acrah_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acrah_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acrah_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acrah_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acrah_ack_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE acrah_ack_reason AS ENUM (
  'ISSUED_READER_RECEIPT_ACKNOWLEDGED',
  'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE'
);
CREATE TYPE acrah_ack_next AS ENUM (
  'HOLD_RECEIPT_ACKNOWLEDGEMENT',
  'STOP_RECEIPT_ACKNOWLEDGEMENT',
  'OMIT_RECEIPT_ACKNOWLEDGEMENT'
);
CREATE TYPE acrah_hold_class AS ENUM ('HELD', 'NOT_HELD');
CREATE TYPE acrah_hold_reason AS ENUM (
  'ACKNOWLEDGED_OBSERVATION_HELD',
  'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
);
CREATE TYPE acrah_hold_next AS ENUM (
  'HOLD_ACKNOWLEDGED_OBSERVATION',
  'STOP_ACKNOWLEDGEMENT_HOLD',
  'OMIT_ACKNOWLEDGEMENT_HOLD'
);
CREATE TYPE acrah_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acrah_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acrah_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acrah_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acrah_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acrah_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acrah_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acrah_compile_kind AS ENUM ('HOLD_ACKNOWLEDGED_OBSERVATION');
CREATE TYPE acrah_terminal_kind AS ENUM (
  'HOLD_RECORDED',
  'HOLD_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acrah_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_HOLD',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acrah_profile_authority NOLOGIN;

CREATE FUNCTION acrah_parties_are_distinct(parties TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT parties IS NOT NULL
    AND array_position(parties, NULL) IS NULL
    AND cardinality(parties) = (SELECT count(DISTINCT party) FROM unnest(parties) AS party);
$$;

CREATE TABLE agent_acrah_authorization_evidence (
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

CREATE TABLE agent_acrah_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acrah_profile_status NOT NULL,
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
  hold_threshold INTEGER NOT NULL CHECK (hold_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acrah_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrah_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrah_profile_hold_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acrah_admission_class[] NOT NULL,
  hold_threshold INTEGER NOT NULL CHECK (hold_threshold >= 2),
  max_observations_per_session INTEGER NOT NULL CHECK (max_observations_per_session = 1),
  max_nominated_observations INTEGER NOT NULL CHECK (max_nominated_observations = 1),
  max_readers_per_observation INTEGER NOT NULL CHECK (max_readers_per_observation = 1),
  require_dual_control_hold BOOLEAN NOT NULL,
  hold_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acrah_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acrah_acknowledgement_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  acknowledgement_code TEXT NOT NULL CHECK (acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acrah_admission_class NOT NULL,
  acknowledgement_class acrah_ack_class NOT NULL,
  acknowledgement_reason acrah_ack_reason NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  receipt_issued BOOLEAN NOT NULL,
  freshness_class acrah_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrah_effect_observation NOT NULL,
  attested_key_kind acrah_key_kind NOT NULL,
  fact_disposition acrah_fact_disposition NOT NULL,
  body_visibility acrah_body_visibility NOT NULL,
  metadata_trust acrah_metadata_trust NOT NULL,
  access_path acrah_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acrah_ack_next NOT NULL,
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
  acknowledgement_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
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

CREATE TABLE agent_acrah_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acrah_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_hold_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_hold_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  hold_threshold INTEGER NOT NULL,
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
    REFERENCES agent_acrah_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrah_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrah_observation_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acrah_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id)
);

CREATE TABLE agent_acrah_observation_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
  admission_class acrah_admission_class NOT NULL,
  acknowledgement_class acrah_ack_class NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrah_acknowledgement_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrah_hold_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  hold_code TEXT NOT NULL,
  admission_class acrah_admission_class NOT NULL,
  hold_class acrah_hold_class NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  hold_hash TEXT NOT NULL CHECK (char_length(hold_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrah_hold_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  hold_code TEXT NOT NULL,
  acknowledgement_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  hold_hash TEXT NOT NULL CHECK (char_length(hold_hash) = 64),
  admission_class acrah_admission_class NOT NULL,
  acknowledgement_class acrah_ack_class NOT NULL,
  hold_class acrah_hold_class NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
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
    REFERENCES agent_acrah_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acrah_hold_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrah_hold_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  hold_code TEXT NOT NULL,
  compile_kind acrah_compile_kind NOT NULL,
  admission_class acrah_admission_class NOT NULL,
  acknowledgement_class acrah_ack_class NOT NULL,
  hold_class acrah_hold_class NOT NULL,
  freshness_class acrah_freshness_class NOT NULL,
  effect_observation acrah_effect_observation NOT NULL,
  attested_key_kind acrah_key_kind NOT NULL,
  fact_disposition acrah_fact_disposition NOT NULL,
  body_visibility acrah_body_visibility NOT NULL,
  access_path acrah_access_path NOT NULL,
  metadata_trust acrah_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  hold_hash TEXT NOT NULL CHECK (char_length(hold_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrah_hold_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_acrah_consumer_hold (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  consumer_hold_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  receipt_acknowledgement_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_code TEXT NOT NULL CHECK (receipt_code ~ '^[a-z0-9:_-]{1,64}$'),
  acknowledgement_code TEXT NOT NULL CHECK (acknowledgement_code ~ '^[a-z0-9:_-]{1,64}$'),
  hold_code TEXT NOT NULL CHECK (hold_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acrah_admission_class NOT NULL,
  acknowledgement_class acrah_ack_class NOT NULL,
  hold_class acrah_hold_class NOT NULL,
  acknowledgement_reason acrah_ack_reason NOT NULL,
  hold_reason acrah_hold_reason NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrah_effect_observation NOT NULL,
  attested_key_kind acrah_key_kind NOT NULL,
  fact_disposition acrah_fact_disposition NOT NULL,
  body_visibility acrah_body_visibility NOT NULL,
  metadata_trust acrah_metadata_trust NOT NULL,
  access_path acrah_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acrah_hold_next NOT NULL,
  hold_steward_a TEXT NOT NULL,
  hold_steward_b TEXT NOT NULL,
  acknowledgement_steward_a TEXT NOT NULL,
  acknowledgement_steward_b TEXT NOT NULL,
  hold_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, consumer_hold_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrah_hold_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrah_acknowledgement_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (hold_body ? 'resolvedFactHash')),
  CHECK (
    (hold_recorded = true AND hold_class = 'HELD'
      AND acknowledgement_recorded = true AND acknowledgement_class = 'ACKNOWLEDGED'
      AND trusted_next_action = 'HOLD_ACKNOWLEDGED_OBSERVATION'
      AND hold_reason = 'ACKNOWLEDGED_OBSERVATION_HELD'
      AND sealed_count IS NOT NULL
      AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL
      AND hold_body ? 'sealedCount'
      AND hold_body ? 'deniedCount'
      AND hold_body ? 'unknownEffectCount')
    OR (hold_recorded = false AND hold_class = 'NOT_HELD'
      AND acknowledgement_recorded = false AND acknowledgement_class = 'NOT_ACKNOWLEDGED'
      AND hold_reason = 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD'
      AND trusted_next_action IN (
        'STOP_ACKNOWLEDGEMENT_HOLD',
        'OMIT_ACKNOWLEDGEMENT_HOLD'
      )
      AND sealed_count IS NULL
      AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND NOT (hold_body ? 'sealedCount')
      AND NOT (hold_body ? 'deniedCount')
      AND NOT (hold_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acrah_hold_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  consumer_hold_id UUID NOT NULL,
  hold_code TEXT NOT NULL,
  hold_class acrah_hold_class NOT NULL,
  acknowledgement_recorded BOOLEAN NOT NULL,
  hold_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acrah_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acrah_hold_next NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrah_consumer_hold (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acrah_hold_intent (
  account_id BIGINT NOT NULL,
  hold_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acrah_intent_status NOT NULL,
  hold_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, hold_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrah_hold_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acrah_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id)
);

CREATE TABLE agent_acrah_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acrah_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id)
);

CREATE TABLE agent_acrah_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id)
);

CREATE TABLE agent_acrah_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acrah_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acrah_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acrah_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrah_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_acrah_profile()
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
      IF current_setting('app.acrah_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acrah_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acrah_profile_protect
BEFORE INSERT OR UPDATE ON agent_acrah_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_profile();

CREATE FUNCTION protect_agent_acrah_hold_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acrah_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acrah_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed hold rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acrah_hold_rule_protect
BEFORE UPDATE ON agent_acrah_profile_hold_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_hold_rule();

CREATE FUNCTION protect_agent_acrah_acknowledgement_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed acknowledgement head is immutable';
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
     OR NOT acrah_parties_are_distinct(ARRAY[
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

  IF NEW.acknowledgement_class = 'ACKNOWLEDGED'
     OR NEW.acknowledgement_recorded
     OR NEW.receipt_issued THEN
    IF NEW.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR NEW.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR NEW.acknowledgement_reason IS DISTINCT FROM 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_RECEIPT_ACKNOWLEDGEMENT'
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
      RAISE EXCEPTION 'acknowledged observation head must carry the acknowledgement counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.acknowledgement_reason IS DISTINCT FROM 'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE'
     OR NEW.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
     OR NEW.acknowledgement_recorded
     OR NEW.receipt_issued
     OR NEW.acknowledgement_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not acknowledged observation head cannot be held as received';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_RECEIPT_ACKNOWLEDGEMENT' THEN
      RAISE EXCEPTION 'silence is not a held observation';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_RECEIPT_ACKNOWLEDGEMENT' THEN
      RAISE EXCEPTION 'denied observation head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'observation head class is not holdable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acrah_acknowledgement_head_protect
BEFORE INSERT OR UPDATE ON agent_acrah_acknowledgement_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_acknowledgement_head();

CREATE FUNCTION protect_agent_acrah_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.hold_hash IS DISTINCT FROM NEW.hold_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'hold decision identity is immutable';
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

  IF NEW.hold_class = 'HELD' AND NEW.hold_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'held observation must copy the acknowledgement counts';
  END IF;

  IF NEW.hold_class = 'NOT_HELD' AND NEW.hold_recorded THEN
    RAISE EXCEPTION 'not acknowledged observation cannot be held as received';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acrah_decision_protect
BEFORE INSERT OR UPDATE ON agent_acrah_hold_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_decision();

CREATE FUNCTION protect_agent_acrah_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NOT acrah_parties_are_distinct(ARRAY[
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
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acrah_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acrah_hold_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_certificate();

CREATE FUNCTION protect_agent_acrah_hold_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_intent$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'hold intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.hold_idempotency_key IS DISTINCT FROM NEW.hold_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared hold identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acrah_hold_intent_protect
BEFORE INSERT OR UPDATE ON agent_acrah_hold_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_hold_intent();

CREATE FUNCTION protect_agent_acrah_consumer_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_hold$
DECLARE
  v_head agent_acrah_acknowledgement_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
  v_receipt TEXT;
  v_ack TEXT;
  v_hold TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed consumer hold is immutable';
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
     OR NEW.hold_body ? 'factBody'
     OR NEW.hold_body ? 'fact_body'
     OR NEW.hold_body ? 'resolvedFactHash'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'hold fence';
  END IF;

  IF NEW.hold_code IS NULL OR NEW.hold_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrah_acknowledgement_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acknowledgement head point lookup missed';
  END IF;

  IF NEW.reader_principal_id IS DISTINCT FROM v_head.reader_principal_id THEN
    RAISE EXCEPTION 'reader must equal the observation reader';
  END IF;

  IF NOT acrah_parties_are_distinct(ARRAY[
    NEW.reader_principal_id, NEW.consumer_principal_id,
    NEW.hold_steward_a, NEW.hold_steward_b,
    NEW.acknowledgement_steward_a, NEW.acknowledgement_steward_b,
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

  IF NEW.acknowledgement_steward_a IS DISTINCT FROM v_head.acknowledgement_steward_a
     OR NEW.acknowledgement_steward_b IS DISTINCT FROM v_head.acknowledgement_steward_b
     OR NEW.receipt_acknowledgement_id IS DISTINCT FROM v_head.receipt_acknowledgement_id THEN
    RAISE EXCEPTION 'hold must cite the sealed acknowledgement';
  END IF;

  IF NEW.hold_class = 'HELD' OR NEW.hold_recorded THEN
    IF v_head.acknowledgement_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR v_head.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR v_head.acknowledgement_reason IS DISTINCT FROM 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'HOLD_RECEIPT_ACKNOWLEDGEMENT' THEN
      RAISE EXCEPTION 'not acknowledged observation cannot be held as received';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.hold_reason IS DISTINCT FROM 'ACKNOWLEDGED_OBSERVATION_HELD'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_ACKNOWLEDGED_OBSERVATION'
       OR NEW.acknowledgement_recorded IS DISTINCT FROM TRUE
       OR NEW.hold_class IS DISTINCT FROM 'HELD' THEN
      RAISE EXCEPTION 'held observation must copy the acknowledgement counts';
    END IF;
  ELSE
    IF v_head.acknowledgement_class IS DISTINCT FROM 'NOT_ACKNOWLEDGED'
       OR v_head.acknowledgement_recorded THEN
      RAISE EXCEPTION 'acknowledged observation must hold the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.hold_body ? 'sealedCount'
       OR NEW.hold_recorded
       OR NEW.acknowledgement_recorded
       OR NEW.hold_reason IS DISTINCT FROM 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD' THEN
      RAISE EXCEPTION 'not acknowledged observation cannot be held as received';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_RECEIPT_ACKNOWLEDGEMENT' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_ACKNOWLEDGEMENT_HOLD' THEN
        RAISE EXCEPTION 'silence cannot be held as received';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_ACKNOWLEDGEMENT_HOLD'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused hold must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code, p.allowed_receipt_code,
         p.allowed_acknowledgement_code, p.allowed_hold_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant, v_receipt, v_ack, v_hold
  FROM agent_acrah_session AS s
  JOIN agent_acrah_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_hold IS NULL
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
     OR NEW.acknowledgement_code IS DISTINCT FROM v_head.acknowledgement_code THEN
    RAISE EXCEPTION 'hold code is not the profile hold';
  END IF;

  RETURN NEW;
END
$protect_hold$;

CREATE TRIGGER agent_acrah_consumer_hold_protect
BEFORE INSERT OR UPDATE ON agent_acrah_consumer_hold
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_consumer_hold();

CREATE FUNCTION protect_agent_acrah_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed hold perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.hold_class = 'NOT_HELD'
     AND (NEW.hold_recorded
          OR NEW.acknowledgement_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not held perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acrah_perception_protect
BEFORE INSERT OR UPDATE ON agent_acrah_hold_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrah_perception();

CREATE FUNCTION approve_agent_acrah_profile(
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
  stored_status acrah_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrah_profile
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
  FROM agent_acrah_profile_hold_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_hold IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control hold rule';
  END IF;

  PERFORM set_config(
    'app.acrah_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrah_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acrah_profile(
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
  stored_status acrah_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrah_profile
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
    'app.acrah_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrah_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acrah_observation(
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
  v_session_status acrah_session_status;
  v_profile_status acrah_profile_status;
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
    FROM agent_acrah_observation_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one observation per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acrah_session AS s
  JOIN agent_acrah_profile AS pr
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

  INSERT INTO agent_acrah_observation_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION hold_agent_acrah_acknowledgement(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_hold_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_hold_id UUID,
  p_hold_digest TEXT,
  p_hold_steward_a TEXT,
  p_hold_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $hold$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acrah_session_status;
  v_profile_status acrah_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_allowed_receipt TEXT;
  v_allowed_ack TEXT;
  v_allowed_hold TEXT;
  v_principal TEXT;
  v_head agent_acrah_acknowledgement_head%ROWTYPE;
  v_class acrah_hold_class;
  v_ack_class acrah_ack_class;
  v_reason acrah_hold_reason;
  v_recorded BOOLEAN;
  v_ack_recorded BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acrah_hold_next;
  v_terminal acrah_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_hold_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_hold_digest) <> 64 THEN
    RAISE EXCEPTION 'hold digest must be 64 hex characters';
  END IF;

  IF p_hold_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acrah_observation_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'hold requires a nominated observation point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         pr.allowed_receipt_code, pr.allowed_acknowledgement_code, pr.allowed_hold_code,
         s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_allowed_receipt,
         v_allowed_ack, v_allowed_hold, v_principal
  FROM agent_acrah_session AS s
  JOIN agent_acrah_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'hold requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_hold_code IS DISTINCT FROM v_allowed_hold THEN
    RAISE EXCEPTION 'hold code is not the profile hold';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrah_acknowledgement_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acknowledgement head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation
     OR v_head.grant_code IS DISTINCT FROM v_allowed_grant
     OR v_head.receipt_code IS DISTINCT FROM v_allowed_receipt
     OR v_head.acknowledgement_code IS DISTINCT FROM v_allowed_ack THEN
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
    RAISE EXCEPTION 'hold fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR NOT acrah_parties_are_distinct(ARRAY[
       p_reader_principal, p_consumer_principal,
       p_hold_steward_a, p_hold_steward_b,
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
    RAISE EXCEPTION 'reader must equal the observation reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acrah_consumer_hold
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'consumer hold already recorded';
  END IF;

  IF v_head.acknowledgement_class = 'ACKNOWLEDGED'
     AND v_head.acknowledgement_reason = 'ISSUED_READER_RECEIPT_ACKNOWLEDGED'
     AND v_head.acknowledgement_recorded
     AND v_head.receipt_issued
     AND v_head.trusted_next_action = 'HOLD_RECEIPT_ACKNOWLEDGEMENT'
     AND v_head.admission_class = 'ADMITTED' THEN
    v_class := 'HELD';
    v_ack_class := 'ACKNOWLEDGED';
    v_reason := 'ACKNOWLEDGED_OBSERVATION_HELD';
    v_recorded := true;
    v_ack_recorded := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'HOLD_ACKNOWLEDGED_OBSERVATION';
    v_terminal := 'HOLD_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_RECEIPT_ACKNOWLEDGEMENT' THEN
    v_class := 'NOT_HELD';
    v_ack_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_recorded := false;
    v_ack_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_ACKNOWLEDGEMENT_HOLD';
    v_terminal := 'HOLD_REFUSED';
  ELSE
    v_class := 'NOT_HELD';
    v_ack_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD';
    v_recorded := false;
    v_ack_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_ACKNOWLEDGEMENT_HOLD';
    v_terminal := 'HOLD_REFUSED';
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
    'holdCode', p_hold_code,
    'admissionClass', v_head.admission_class,
    'acknowledgementClass', v_ack_class,
    'holdClass', v_class,
    'holdReason', v_reason,
    'acknowledgementRecorded', v_ack_recorded,
    'holdRecorded', v_recorded,
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

  INSERT INTO agent_acrah_observation_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, receipt_acknowledgement_id, admission_class,
    acknowledgement_class, acknowledgement_recorded, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.receipt_acknowledgement_id, v_head.admission_class,
    v_head.acknowledgement_class, v_head.acknowledgement_recorded,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrah_hold_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, hold_code, admission_class, hold_class, hold_recorded,
    hold_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_hold_code, v_head.admission_class, v_class, v_recorded,
    p_hold_digest, clock_timestamp()
  );

  INSERT INTO agent_acrah_hold_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, hold_code, acknowledgement_code, provider_code,
    hold_hash, admission_class, acknowledgement_class, hold_class, hold_recorded,
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
    p_reader_principal, p_utc_day, p_hold_code, v_head.acknowledgement_code,
    v_head.provider_code, p_hold_digest, v_head.admission_class, v_ack_class, v_class,
    v_recorded,
    p_hold_steward_a, p_hold_steward_b,
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

  INSERT INTO agent_acrah_hold_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, hold_code, compile_kind,
    admission_class, acknowledgement_class, hold_class, freshness_class,
    effect_observation, attested_key_kind, fact_disposition, body_visibility,
    access_path, metadata_trust, opens_nested_expiry, inlines_fact_body,
    ack_promoted_to_trust, packet_scan_used, hold_recorded, executes_tool,
    lag_publications, max_lag_budget, hold_hash, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_hold_code,
    'HOLD_ACKNOWLEDGED_OBSERVATION',
    v_head.admission_class, v_ack_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_recorded, false, v_lag, v_head.max_lag_budget, p_hold_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrah_consumer_hold (
    account_id, utc_day, consumer_principal_id, consumer_hold_id, session_id,
    certificate_id, receipt_acknowledgement_id, reader_principal_id, purpose_code,
    effect_code, provider_code, citation_code, grant_code, receipt_code,
    acknowledgement_code, hold_code, admission_class, acknowledgement_class, hold_class,
    acknowledgement_reason, hold_reason, acknowledgement_recorded, hold_recorded,
    sealed_count, denied_count, unknown_effect_count, lag_publications, max_lag_budget,
    effect_observation, attested_key_kind, fact_disposition, body_visibility, metadata_trust,
    access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, executes_tool, trusted_next_action, hold_steward_a, hold_steward_b,
    acknowledgement_steward_a, acknowledgement_steward_b, hold_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_hold_id, p_session_id,
    p_certificate_id, v_head.receipt_acknowledgement_id, p_reader_principal,
    v_head.purpose_code, v_head.effect_code, v_head.provider_code, v_head.citation_code,
    v_head.grant_code, v_head.receipt_code, v_head.acknowledgement_code, p_hold_code,
    v_head.admission_class, v_ack_class, v_class, v_head.acknowledgement_reason, v_reason,
    v_ack_recorded, v_recorded, v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false, v_next,
    p_hold_steward_a, p_hold_steward_b, v_head.acknowledgement_steward_a,
    v_head.acknowledgement_steward_b, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrah_hold_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, consumer_hold_id,
    hold_code, hold_class, acknowledgement_recorded, hold_recorded, sealed_count,
    denied_count, unknown_effect_count, attested_key_kind, ack_promoted_to_trust,
    trusted_next_action, perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_hold_id,
    p_hold_code, v_class, v_ack_recorded, v_recorded, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acrah_hold_intent (
    account_id, hold_intent_id, session_id, certificate_id, intent_status,
    hold_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_hold_id, p_session_id, p_certificate_id, 'PREPARED',
    p_hold_id::TEXT, 1, p_hold_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrah_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_hold_id, p_session_id, 'HOLD', 1, clock_timestamp()
  );

  INSERT INTO agent_acrah_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acrah_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'ACKNOWLEDGEMENT_HOLD_SEALED',
    p_hold_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acrah_session
  SET consumed_hold_units = consumed_hold_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$hold$;

CREATE FUNCTION reject_agent_acrah_unscoped_scan(
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

ALTER FUNCTION approve_agent_acrah_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrah_profile_authority;
ALTER FUNCTION revoke_agent_acrah_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrah_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acrah_profile_authority;
GRANT SELECT ON
  agent_acrah_profile,
  agent_acrah_profile_hold_rule
TO agent_acrah_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrah_profile TO agent_acrah_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acrah_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acrah_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrah_profile FROM PUBLIC;

CREATE INDEX agent_acrah_session_work_idx ON agent_acrah_session (
  account_id,
  status
);
CREATE INDEX agent_acrah_session_profile_idx ON agent_acrah_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acrah_head_consumer_idx ON agent_acrah_acknowledgement_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acrah_nomination_session_idx ON agent_acrah_observation_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acrah_certificate_session_idx ON agent_acrah_hold_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acrah_decision_cert_idx ON agent_acrah_hold_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acrah_hold_consumer_idx ON agent_acrah_consumer_hold (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acrah_hold_reader_idx ON agent_acrah_consumer_hold (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_acrah_perception_day_idx ON agent_acrah_hold_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acrah_intent_work_idx ON agent_acrah_hold_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_acrah_audit_time_idx ON agent_acrah_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_acrah_command_expiry_idx ON agent_acrah_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acrah_checkpoint_day_idx ON agent_acrah_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acrah_binding_day_idx ON agent_acrah_observation_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acrah_authorization_evidence',
    'agent_acrah_profile',
    'agent_acrah_profile_hold_rule',
    'agent_acrah_acknowledgement_head',
    'agent_acrah_session',
    'agent_acrah_observation_nomination',
    'agent_acrah_observation_binding',
    'agent_acrah_hold_compile',
    'agent_acrah_hold_certificate',
    'agent_acrah_hold_decision',
    'agent_acrah_consumer_hold',
    'agent_acrah_hold_perception',
    'agent_acrah_hold_intent',
    'agent_acrah_budget_ledger',
    'agent_acrah_terminal_record',
    'agent_acrah_command_result',
    'agent_acrah_audit_head',
    'agent_acrah_audit_event',
    'agent_acrah_audit_anchor',
    'agent_acrah_projection_checkpoint'
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

Direct inserts that skip the hold function still pass through the
triggers. A successful hold on a `NOT_ACKNOWLEDGED` observation, a
trusted key, a packet scan, a fact body, a tool execution flag, or a
nested expiry flag is rejected. The acknowledgement head cannot be
updated to launder a refused observation into a hold. A reader other
than the observation reader is rejected, so the insert does not grant
a second reader.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcrahAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcrahAcknowledgementClass {
  ACKNOWLEDGED
  NOT_ACKNOWLEDGED
}

enum AcrahHoldClass {
  HELD
  NOT_HELD
}

enum AcrahHoldReason {
  ACKNOWLEDGED_OBSERVATION_HELD
  NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD
}

enum AcrahNextAction {
  HOLD_ACKNOWLEDGED_OBSERVATION
  STOP_ACKNOWLEDGEMENT_HOLD
  OMIT_ACKNOWLEDGEMENT_HOLD
}

enum AcrahKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcrahProfile {
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
  procedureRef: String!
}

type AcrahSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerObservation: Int!
}

type AcrahAcknowledgementHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  acknowledgementClass: AcrahAcknowledgementClass!
  acknowledgementRecorded: Boolean!
  attestedKeyKind: AcrahKeyKind!
}

type AcrahConsumerHold {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  consumerHoldId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  grantCode: String!
  receiptCode: String!
  acknowledgementCode: String!
  holdCode: String!
  admissionClass: AcrahAdmissionClass!
  acknowledgementClass: AcrahAcknowledgementClass!
  holdClass: AcrahHoldClass!
  holdReason: AcrahHoldReason!
  acknowledgementRecorded: Boolean!
  holdRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcrahKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcrahNextAction!
}

type AcrahHoldPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  holdCode: String!
  holdRecorded: Boolean!
  perceptionBody: JSON!
}

type AcrahAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcrahProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcrahProfile
  agentAcrahSession(accountId: ID!, sessionId: ID!): AcrahSession
  agentAcrahAcknowledgementHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrahAcknowledgementHead
  agentAcrahConsumerHold(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrahConsumerHold
  agentAcrahHoldPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrahHoldPerception
  agentAcrahAuditEvents(accountId: ID!, utcDay: String!): [AcrahAuditEvent!]!
}

type Mutation {
  createAgentAcrahProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcrahProfile!
  approveAgentAcrahProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrahProfile!
  revokeAgentAcrahProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrahProfile!
  openAgentAcrahSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcrahSession!
  nominateAgentAcrahObservation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  holdAgentAcrahAcknowledgement(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    holdCode: String!
  ): AcrahConsumerHold!
  appendAgentAcrahHoldIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcrahAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Observation and hold reads also take a
non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool. Resolvers
must call `reject_agent_acrah_unscoped_scan` before planning when
either the account or the observation key is missing. A hold read is
one primary-key lookup. It does not join a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-acknowledgement-hold`. The
instruction payload on the hold rule is deterministic JSON:

- point-look up one acknowledgement observation by
  `(account_id, utc_day, consumer_principal_id)`;
- hold the single `allowed_hold_code` for the observation reader only
  when `acknowledgement_recorded` is true, the acknowledgement reason
  is `ISSUED_READER_RECEIPT_ACKNOWLEDGED`, and the next action is
  `HOLD_RECEIPT_ACKNOWLEDGEMENT`;
- otherwise seal `NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD` with null
  counts;
- never execute the tool inside the hold;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never grant a second reader;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one hold
code, and the observation reader. It may not rewrite the instruction
by chatting with the engine. Changing the hold code is a new profile
version that stays `DRAFT` until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is account-scoped
and stores the approved definition hash, which covers the single hold
code. Queries must filter `account_id` before topK. A global ANN index
would mix tenants and is rejected. The reference schema does not build
an HNSW index.

```sql
CREATE TABLE agent_acrah_profile_embedding (
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
    REFERENCES agent_acrah_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acrah_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acrah_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acrah_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a session,
nominates one observation, and holds that profile's one hold code for
the observation reader. Discovery never writes
`agent_acrah_consumer_hold`.

## 12. Agent perception

The perception row is what an LLM is allowed to see. It carries:

- `account_id`, `utc_day`, and `consumer_principal_id` as the point
  key;
- the observation `reader_principal_id` and the one `hold_code`;
- `holdRecorded` true only when the three counts are present;
- `sealedCount`, `deniedCount`, and `unknownEffectCount` only on a
  held observation;
- `attestedKeyKind = AWAITING_CONFIRMATION` and
  `ackPromotedToTrust = false`;
- `metadataTrust = UNTRUSTED_METADATA`, so the model must not treat
  tags as authorization.

A withheld perception has no count fields. The agent must not invent
them, must not scan a board to recover them, and must not treat
`HOLD_ACKNOWLEDGED_OBSERVATION` as permission to execute the tool or
to enroll the key. `ACKED` on the upstream effect stays an
observation. It is not this hold, and it is not trust.

## 13. ACID and consistency

The hold function is one transaction. Binding, compile, certificate,
decision, hold, perception, intent, budget, terminal, and audit commit
together or not at all. The acknowledgement head is not updated.
Isolation is the tenant RLS predicate on `account_id`. Durability is
the hash-chained audit event `ACKNOWLEDGEMENT_HOLD_SEALED`.

Consistency beats a faster but lossy fan-out. A hold that copied
counts from a `NOT_ACKNOWLEDGED` observation would be a durable lie.
The engine would rather seal `NOT_HELD` with null counts than
reconstruct a reader list.

## 14. Guardrails and neighbor protection

- Null account, null day, null consumer, or null hold code is
  **FULL SCAN REJECTED** before planning.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected access
  paths. The only accepted path is `POINT_LOOKUP`.
- One session nominates one observation. A second nomination is
  rejected.
- The hold does not execute the tool, does not call the provider, and
  does not open another nested expiry.
- A reader other than the observation reader is rejected, which keeps
  one noisy agent from holding every principal in the account.
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

Each seal appends `agent_acrah_audit_event` with
`event_kind = ACKNOWLEDGEMENT_HOLD_SEALED`, a 64-character event hash,
and a previous hash. Replay reads the acknowledgement head and the
profile hold code and must reproduce `hold_class`, `hold_reason`, the
reader, and the three counts or their absence. Replay does not call a
model. The acknowledgement head and the hold row are immutable after
insert, so a later agent cannot edit history to make a refused
observation look held.

## 17. Threat and failure analysis

- **Second reader:** a caller passes a principal other than the
  observation reader. The function rejects the call. The
  acknowledgement head reader stays unchanged.
- **Forged hold on a refused observation:** the trigger reads the head
  by primary key and rejects `hold_recorded` when
  `acknowledgement_recorded` is false.
- **Count laundering:** a held row whose counts differ from the head
  is rejected.
- **Ack promoted to trust:** `TRUSTED_ENROLLED` and
  `ack_promoted_to_trust` are rejected. `ACKED` stays an effect
  observation.
- **Tool execution:** `executes_tool` must stay false. The hold is not
  a tool call.
- **Fact body:** `factBody`, `fact_body`, and `resolvedFactHash` are
  rejected on the head and on the hold.
- **Nested expiry:** `opens_nested_expiry` is rejected. This plane
  does not open another nested expiry.
- **Packet scan:** `PACKET_SCAN` and `packet_scan_used` are rejected.
- **Steward reuse:** hold stewards must be distinct from the reader,
  the consumer, the acknowledgement stewards, and every upstream
  steward.
- **Cross-tenant read:** forced RLS hides every row whose `account_id`
  does not match the session setting.
- **Profile smuggling:** a profile inserted as `APPROVED` is rejected.
  Approval requires the authority fence.

Provider silence stays `UNKNOWN_EFFECT` with a null lag. It is not
retried inside the hold transaction.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- The hold transaction performs one primary-key read and a fixed set
  of primary-key writes. It has no board fan-out.
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
2. Export acknowledgement heads for one canary account by primary
   key. Confirm heads are immutable and tenant-scoped.
3. Enable `hold_agent_acrah_acknowledgement` for that account.
   Compare recorded counts to the acknowledgement head.
4. Watch full-scan rejects and second-reader rejects. A spike means
   an agent is walking a board or inventing readers.
5. Expand account by account. Do not build a cross-tenant HNSW index.
   Do not enable tool execution inside the hold.

Revocation stops new sessions. It does not rewrite sealed holds.

## 20. Ship criteria

- TypeScript contracts compile in strict mode.
- GraphQL exposes 6 queries and 8 mutations, each tenant-scoped.
- PGlite applies the row store and the account-scoped vector table.
  Every relational table leads with `account_id` and has forced row
  level security.
- The fixture records one hold for an acknowledged head with counts
  1/1/1 and lag 3 inside budget 5, leaves that head unchanged, and
  seals `ACKNOWLEDGED_OBSERVATION_HELD` for `principal:reader-1`.
- A not-acknowledged head with lag 8 keeps null counts,
  `NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD`, and the denied lag.
- Silence seals `NOT_HELD` with a null lag and null counts.
- A null day, a second nomination, a foreign hold code, a fact body,
  a nested expiry, a packet scan, steward reuse, a hold on a
  not-acknowledged observation, a reader equal to the consumer, counts
  that differ from the head, an ack promoted to trust, tool execution,
  a mutated head, a mutated hold, a profile inserted as approved, a
  second reader, and an unscoped scan are rejected.
- `npm audit` reports no vulnerabilities in the validation toolchain.

## 21. Product decision

Ship the consumer-visible hold as a deterministic point lookup of an
already sealed acknowledgement observation. The hold copies the three
counts only when `acknowledgement_recorded` is true, names only the
observation reader, and leaves the acknowledgement head unchanged.
`ACKED` is not trust. The tool does not run. The plane does not open
another nested expiry.

The next increment should publish one consumer perception card of one
already `HELD` observation by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_HELD`
observation cannot be shown as received. The card copies the three
counts only when `hold_recorded` is true. The reader on the card must
equal the hold reader and stay distinct from the consumer and every
steward. The card must not scan context packets, must not inline a
fact body, must not promote `ACKED` to `TRUSTED_ENROLLED`, must not
execute the tool, must not grant a second reader, and must not open
another nested expiry plane.
