# mondayDB Agentic Admitted Count Provider Receipt Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-14.v1`

## 1. Why this plane, before how

The 2026-10-13 Admitted Count Tool Effect Outcome Plane
seals one tool-effect outcome for one already sealed
purpose bind. The grain is `(account_id, utc_day,
consumer_principal_id)`. A `RECORDED` outcome copies the
three granted counts and names `CITE_RECORDED_EFFECT`.
A `NOT_RECORDED` outcome seals
`UNAUTHORIZED_BIND_CANNOT_SUCCEED` with null counts.
That plane does not record whether a provider accepted
the effect.

Without this plane an agent either:

- treats `CITE_RECORDED_EFFECT` itself as a provider
  receipt, or
- walks context packets, tool logs, or a board with 1M+
  rows to invent a receipt (neighbor-harmful, and a miss
  against the 99.99% availability target).

The product trade-off is **receipt honesty versus
provider isolation**, and **receipt latency versus
outcome fan-out**:

- Honesty: a consumer whose effect is `RECORDED` should
  be able to record exactly one provider receipt that
  cites the three counts already on the outcome, without
  opening the outcome again.
- Isolation: the database does not call the provider and
  does not execute the tool. Recording is a deterministic
  seal. A probabilistic agent stays outside the engine,
  so a slow or recursive provider cannot spend neighbor
  latency inside the ACID path.
- Least privilege: a `NOT_RECORDED` outcome cannot
  receive a successful provider receipt. One outcome
  records at most one receipt. A second receipt is a new
  request, and this plane rejects it.
- The recorded effect head is not rewritten. Replay of
  the effect stays stable. The receipt is a new row that
  cites the outcome by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This
  plane does not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the receipt is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one
primary-key write of that same grain. Consistency is the
sealed receipt plus the outcome id it cites. Neighbor
availability stays at the 99.99% target because an
unscoped day walk, a provider list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved receipt profile is procedural memory for
   "how one already sealed tool effect becomes a single
   provider receipt." The profile names exactly one
   provider code and the one effect code that receipt
   may cite. A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never
   opens another nested expiry plane.
2. A session nominates exactly one effect key. The
   record then reads `agent_acpr_recorded_effect_head`
   by `(account_id, utc_day, consumer_principal_id)`.
   It does not scan packets.
3. mondayDB records a successful receipt only when the
   head is `RECORDED`, `tool_effect_recorded` is true,
   the outcome reason is
   `AUTHORIZED_PURPOSE_EFFECT_RECORDED`, the next action
   is `CITE_RECORDED_EFFECT`, and the requested provider
   code equals the profile provider code. The copy of
   the three counts is equality with the effect. It does
   not call a model and it does not execute the tool.
4. `NOT_RECORDED` seals
   `NOT_RECORDED_EFFECT_CANNOT_RECEIVE` with
   `provider_receipt_recorded = false` and null counts.
   Silence keeps a null lag. There is no successful
   receipt.
5. Two provider stewards witness the receipt. They are
   distinct from the consumer, from the effect stewards,
   and from the bind, read-receipt, card, admission,
   attestation, synopsis, and publication stewards.
6. Unscoped effect or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the
  nomination and the provider receipt?
- Was the receipt a point lookup of an already sealed
  effect, and what class did that effect have?
- Did a `RECORDED` effect record exactly one receipt and
  seal `RECORDED_EFFECT_PROVIDER_RECEIVED` with the
  three granted counts?
- Did a `NOT_RECORDED` effect stay unsuccessful, with
  null counts and `NOT_RECORDED_EFFECT_CANNOT_RECEIVE`?
- Did `ACKED` stay an effect observation while the key
  stayed `AWAITING_CONFIRMATION` and the body stayed
  omitted?
- Did the recorded effect head keep the class and counts
  it was exported with?
- Can the receipt be replayed without invoking an LLM,
  and without executing the tool?

HNSW profile discovery stays account-scoped and never
records this receipt.

## 2. Scope and ownership

The Admitted Count Provider Receipt Plane owns:

1. Immutable approved receipt profiles as procedural
   memory, each naming one provider code for one effect.
2. Tenant-scoped receipt sessions with a hard cap of one
   nominated effect.
3. Deterministic nomination of that effect, then one
   point lookup of the recorded effect head.
4. A provider receipt keyed by
   `(account_id, utc_day, consumer_principal_id)`.
5. An agent perception row that carries counts only when
   `provider_receipt_recorded` is true.
6. Audit events that cite the receipt hash.

It integrates with, but does not replace:

- **Admitted Count Tool Effect Outcome Plane:** supplies
  the sealed effect this plane reads. Exporters copy the
  outcome class, the outcome reason, the counts the
  effect actually recorded, the next action, and the
  stewards onto `agent_acpr_recorded_effect_head`. This
  plane does not re-record the effect, does not recover
  withheld counts, and does not promote `ACKED` to
  `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate,
  record, vector, and notify units. A refused effect is
  a sealed non-receipt, not a scan of the packet log.
  The record does not run the tool and does not call
  the provider.

### Non-goals

- Letting an LLM choose which provider a effect may
  cite.
- Executing the tool, calling the provider, or compiling
  a board query inside `record_agent_acpr_provider_receipt`.
- Recording any provider code other than the single code
  on the approved profile.
- Copying counts onto a receipt whose effect is
  `NOT_RECORDED`.
- Rewriting the recorded effect head so a refused effect
  becomes a successful receipt.
- Recomputing provider calls by scanning a board, a
  packet log, or a citation ledger.
- Cross-account receipts or global nearest-neighbor
  recording.
- Storing raw private keys, tool payloads, packet
  bodies, or fact bodies on the receipt.
- Promoting `AWAITING_CONFIRMATION` to
  `TRUSTED_ENROLLED` because the effect observation was
  `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this receipt.
- Publishing a separate citation card for the received
  receipt. That is the next plane, and only for an
  already `RECEIVED` receipt.

## 3. Product contract

### 3.1 Receipt profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the effect must
  already carry (one token, no list);
- the single `allowed_effect_code` the head must
  already carry (one token, no list);
- the single `allowed_provider_code` this plane may
  record (one token, no list);
- allowed admission classes the exporter may present
  (`ADMITTED`, `DENIED`, `UNKNOWN_EFFECT`);
- receipt threshold (distinct provider stewards,
  minimum 2), max effects per session (exactly 1), and
  max nominated effects (exactly 1);
- receipt policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `RECEIPT_NEVER_EXECUTES_TOOL`,
  `RECEIPT_NEVER_INLINES_BODY`, `RECEIPT_NEVER_CONFIRMS`,
  `ONE_EFFECT_PER_SESSION`, `ONE_RECEIPT_PER_EFFECT`,
  `POINT_LOOKUP_ONLY`, `RECORDED_EFFECT_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `RECEIPT_ONLY_WHEN_RECORDED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PUBLISH`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest receipt
reason is `NOT_RECORDED_EFFECT_CANNOT_RECEIVE` (34
bytes). The success reason is
`RECORDED_EFFECT_PROVIDER_RECEIVED` (33 bytes).

Approval and revocation require the authority fence
`approve_agent_acpr_profile` /
`revoke_agent_acpr_profile`, owned by
`agent_acpr_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
record, vector, and notify units, plus wall time.
`max_effects_per_session` and `max_nominated_effects`
are both exactly 1. A second effect nomination in the
same session is rejected before it can fan out into a
recursive provider walk.

The session principal is the only consumer that session
may receipt. A receipt for a different principal is
rejected.

### 3.3 Recorded effect head and nomination contract

Upstream effect export writes one recorded effect head
per `(account_id, utc_day, consumer_principal_id)`. The
head copy includes `outcome_class`, `outcome_reason`,
`tool_effect_recorded`, `trusted_next_action`, the three
counts when they were recorded, and the stewards. It
does not include a fact body and it does not include
withheld counts. The head is immutable. This plane does
not advance it and does not reclassify it.

`nominate_agent_acpr_effect(account_id, session_id,
utc_day, consumer_principal_id, nomination_id,
nomination_hash)` nominates that effect. A null
`utc_day`, a null `account_id`, a null consumer, or a
null provider code is **FULL SCAN REJECTED**. The access
path is `POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` are rejected.

### 3.4 Provider receipt contract

`record_agent_acpr_provider_receipt` is the only compile
that writes a provider receipt. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one recorded effect head for that key, with
  `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`,
  `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and
  `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `provider_code` equal to the profile's
  `allowed_provider_code`, and `effect_code` equal to
  the head effect and the profile effect, each matching
  `^[a-z0-9:_-]{1,64}$` (one token, not a list and not
  a query);
- a consumer principal equal to the session principal,
  distinct from both provider stewards, and distinct
  from every effect, bind, read-receipt, card,
  admission, attestation, synopsis, and publication
  steward;
- provider stewards distinct from each other and from
  those same upstream stewards.

The grain is `(account_id, utc_day, consumer_principal_id)`.
That grain holds one receipt. Projection is:

- `RECEIVED` when the head outcome class is `RECORDED`,
  `tool_effect_recorded` is true, the outcome reason is
  `AUTHORIZED_PURPOSE_EFFECT_RECORDED`, and the next
  action is `CITE_RECORDED_EFFECT`. The receipt copies
  `sealed_count`, `denied_count`, and
  `unknown_effect_count`. `provider_receipt_recorded`
  is true. `receipt_reason` is
  `RECORDED_EFFECT_PROVIDER_RECEIVED`.
  `trusted_next_action` is `CITE_PROVIDER_RECEIPT`. The
  action names the citation. It does not run the tool
  and it does not inline a fact body.
- `NOT_RECEIVED` when the head next action is
  `STOP_EFFECT_RECORD`. Counts stay null.
  `receipt_reason` is
  `NOT_RECORDED_EFFECT_CANNOT_RECEIVE`.
  `provider_receipt_recorded` is false.
  `trusted_next_action` is `STOP_PROVIDER_RECEIPT`. The
  denied lag is copied and is not cleared.
- `NOT_RECEIVED` when the head admission class is
  `UNKNOWN_EFFECT` or the next action is
  `OMIT_EFFECT_RECORD`. Counts stay null. The receipt
  lag stays null. `receipt_reason` is
  `NOT_RECORDED_EFFECT_CANNOT_RECEIVE`.
  `provider_receipt_recorded` is false.
  `trusted_next_action` is `OMIT_PROVIDER_RECEIPT`.

A `NOT_RECORDED` outcome cannot receive a successful
provider receipt. `receipt_body` rejects `factBody`,
`fact_body`, and `resolvedFactHash`. `ACKED` is copied
as `effect_observation` when the head observed it. It
does not write `TRUSTED_ENROLLED`. The recorded effect
head is not updated. A second receipt for the same
consumer and day is rejected. A forged received receipt
whose counts differ from the head is rejected. A forged
received receipt on a `NOT_RECORDED` head is rejected. A
forged non-receipt that carries any count, or that sets
`provider_receipt_recorded`, is rejected. A provider
code other than the profile code is rejected before a
row is sealed, so the caller can retry the one allowed
code. A null provider code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acpr_receipt_perception`
for the agent. Counts appear there only when
`provider_receipt_recorded` is true. The perception names
`provider_code` and whether the receipt was recorded.
Receipt intents start as `PREPARED`. Provider silence
stays `UNKNOWN_EFFECT`. An acknowledgement of the notify
is not enrollment, not a fact restore, not a tool
execution, and not a second receipt. This plane does not
open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant
   index leads with `account_id`. Row level security is
   forced.
2. A null `utc_day`, a null consumer, a null provider
   code, or a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one effect. The access path is
   `POINT_LOOKUP`. One effect records one receipt.
4. The recorded effect head is immutable. The receipt
   does not rewrite it.
5. A successful provider receipt is recorded only from a
   `RECORDED` head whose outcome reason is
   `AUTHORIZED_PURPOSE_EFFECT_RECORDED` and whose next
   action is `CITE_RECORDED_EFFECT`, and only for the
   profile's single provider code.
6. `NOT_RECORDED` receipts store null counts and
   `provider_receipt_recorded = false`. Silence stores a
   null lag. A `NOT_RECORDED` outcome cannot receive a
   successful provider receipt.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`,
   `packet_scan_used`, and `executes_tool` stay false.
   The receipt does not execute the tool.
9. Provider stewards, the consumer, effect stewards, and
   upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never
    records a receipt.
11. The engine does not call a model. Replay is a pure
    function of the recorded effect head, the consumer
    id, and the profile provider code.

## 5. Execution model

```text
approved profile (one allowed_provider_code)
  -> open session (one effect budget)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read recorded effect head by primary key
  -> project RECEIVED or NOT_RECEIVED
  -> append receipt + perception + audit
  -> leave the effect head unchanged
  -> do not execute the tool
```

Compile kind is `RECORD_RECORDED_EFFECT_RECEIPT` for both
receipts. The class on the receipt, not a second plane,
distinguishes a received provider receipt from a refusal.
Notify dispatch is a later receipt intent and may remain
`UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code,
   and one provider code, and add one dual-control
   receipt rule.
2. Approve it through `agent_acpr_profile_authority`.
3. Export one recorded effect head per consumer and day.
   The export is a point copy of the tool-effect
   outcome, not a packet walk.
4. Open a session and nominate one effect key.
5. Record the profile provider code. Recorded effects
   copy the counts and seal
   `RECORDED_EFFECT_PROVIDER_RECEIVED`. Other effects
   seal a non-receipt with null counts.
6. The agent reads the perception row. A withheld
   perception has no count fields and
   `providerReceiptRecorded: false`.
7. Revocation stops a later session from nominating. It
   does not rewrite receipts already sealed.
8. This plane does not open another nested expiry. It
   does not run the tool.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type ReceiptId = string;
export type UtcDay = string;
export type ProviderCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type OutcomeClass = "RECORDED" | "NOT_RECORDED";
export type OutcomeReason =
  | "AUTHORIZED_PURPOSE_EFFECT_RECORDED"
  | "UNAUTHORIZED_BIND_CANNOT_SUCCEED";
export type OutcomeNextAction =
  | "CITE_RECORDED_EFFECT"
  | "STOP_EFFECT_RECORD"
  | "OMIT_EFFECT_RECORD";
export type ReceiptClass = "RECEIVED" | "NOT_RECEIVED";
export type ReceiptReason =
  | "RECORDED_EFFECT_PROVIDER_RECEIVED"
  | "NOT_RECORDED_EFFECT_CANNOT_RECEIVE";
export type ReceiptNextAction =
  | "CITE_PROVIDER_RECEIPT"
  | "STOP_PROVIDER_RECEIPT"
  | "OMIT_PROVIDER_RECEIPT";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const PROVIDER_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface RecordedEffectHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly admissionClass: AdmissionClass;
  readonly outcomeClass: OutcomeClass;
  readonly outcomeReason: OutcomeReason;
  readonly toolEffectRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: OutcomeNextAction;
}

export interface ProviderReceipt {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly receiptId: ReceiptId;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: ProviderCode;
  readonly admissionClass: AdmissionClass;
  readonly outcomeClass: OutcomeClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly providerReceiptRecorded: boolean;
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

export function projectProviderReceipt(
  head: RecordedEffectHead,
  receiptId: ReceiptId,
  providerCode: ProviderCode,
): ProviderReceipt {
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    receiptId,
    consumerPrincipalId: head.consumerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode,
    admissionClass: head.admissionClass,
    outcomeClass: head.outcomeClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleProvider = PROVIDER_TOKEN.test(providerCode);

  if (
    singleProvider &&
    head.outcomeClass === "RECORDED" &&
    head.outcomeReason === "AUTHORIZED_PURPOSE_EFFECT_RECORDED" &&
    head.toolEffectRecorded &&
    head.trustedNextAction === "CITE_RECORDED_EFFECT" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      receiptClass: "RECEIVED",
      receiptReason: "RECORDED_EFFECT_PROVIDER_RECEIVED",
      providerReceiptRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "CITE_PROVIDER_RECEIPT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_EFFECT_RECORD";

  return {
    ...shared,
    receiptClass: "NOT_RECEIVED",
    receiptReason: "NOT_RECORDED_EFFECT_CANNOT_RECEIVE",
    providerReceiptRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_PROVIDER_RECEIPT" : "STOP_PROVIDER_RECEIPT",
  };
}
```

```ts
export function perceptionOmitsSuccessfulReceipt(receipt: ProviderReceipt): boolean {
  return (
    receipt.providerReceiptRecorded === false &&
    receipt.receiptClass === "NOT_RECEIVED" &&
    receipt.sealedCount === null &&
    receipt.deniedCount === null &&
    receipt.unknownEffectCount === null &&
    receipt.ackPromotedToTrust === false &&
    receipt.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    receipt.executesTool === false
  );
}
```

`projectProviderReceipt` is the procedural projection an
agent runtime must match. It never returns
`TRUSTED_ENROLLED`. It never copies counts off a
`NOT_RECORDED` effect. It never executes the tool. A
provider token that is not a single code projects to
`NOT_RECEIVED`. The database additionally requires the
token to equal the approved profile provider code before
it seals `RECEIVED`.

## 8. SQL row-store schema

```sql
CREATE TYPE acpr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acpr_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acpr_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acpr_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acpr_outcome_class AS ENUM ('RECORDED', 'NOT_RECORDED');
CREATE TYPE acpr_outcome_reason AS ENUM (
  'AUTHORIZED_PURPOSE_EFFECT_RECORDED',
  'UNAUTHORIZED_BIND_CANNOT_SUCCEED'
);
CREATE TYPE acpr_outcome_next AS ENUM (
  'CITE_RECORDED_EFFECT',
  'STOP_EFFECT_RECORD',
  'OMIT_EFFECT_RECORD'
);
CREATE TYPE acpr_receipt_class AS ENUM ('RECEIVED', 'NOT_RECEIVED');
CREATE TYPE acpr_receipt_reason AS ENUM (
  'RECORDED_EFFECT_PROVIDER_RECEIVED',
  'NOT_RECORDED_EFFECT_CANNOT_RECEIVE'
);
CREATE TYPE acpr_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acpr_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acpr_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acpr_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acpr_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acpr_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acpr_receipt_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acpr_compile_kind AS ENUM ('RECORD_RECORDED_EFFECT_RECEIPT');
CREATE TYPE acpr_terminal_kind AS ENUM (
  'RECEIPT_RECORDED',
  'RECEIPT_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acpr_next_action AS ENUM (
  'CITE_PROVIDER_RECEIPT',
  'STOP_PROVIDER_RECEIPT',
  'OMIT_PROVIDER_RECEIPT'
);
CREATE TYPE acpr_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_PUBLISH',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acpr_profile_authority NOLOGIN;

CREATE TABLE agent_acpr_authorization_evidence (
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

CREATE TABLE agent_acpr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acpr_profile_status NOT NULL,
  definition_hash TEXT NOT NULL CHECK (char_length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash TEXT,
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash TEXT NOT NULL CHECK (char_length(authorization_snapshot_hash) = 64),
  allowed_purpose TEXT NOT NULL CHECK (allowed_purpose ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_effect_code TEXT NOT NULL CHECK (allowed_effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_provider_code TEXT NOT NULL CHECK (allowed_provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_effects_per_session INTEGER NOT NULL CHECK (max_effects_per_session = 1),
  max_nominated_effects INTEGER NOT NULL CHECK (max_nominated_effects = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acpr_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acpr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acpr_profile_receipt_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acpr_admission_class[] NOT NULL,
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_effects_per_session INTEGER NOT NULL CHECK (max_effects_per_session = 1),
  max_nominated_effects INTEGER NOT NULL CHECK (max_nominated_effects = 1),
  require_dual_control_receipt BOOLEAN NOT NULL,
  receipt_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acpr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acpr_recorded_effect_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  outcome_id UUID NOT NULL,
  bind_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acpr_admission_class NOT NULL,
  bind_class TEXT NOT NULL,
  outcome_class acpr_outcome_class NOT NULL,
  outcome_reason acpr_outcome_reason NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
  freshness_class acpr_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acpr_effect_observation NOT NULL,
  attested_key_kind acpr_key_kind NOT NULL,
  fact_disposition acpr_fact_disposition NOT NULL,
  body_visibility acpr_body_visibility NOT NULL,
  metadata_trust acpr_metadata_trust NOT NULL,
  access_path acpr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acpr_outcome_next NOT NULL,
  effect_steward_a TEXT NOT NULL,
  effect_steward_b TEXT NOT NULL,
  bind_steward_a TEXT NOT NULL,
  bind_steward_b TEXT NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
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
  effect_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, outcome_id),
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
  CHECK (NOT (effect_body ? 'factBody')),
  CHECK (NOT (effect_body ? 'fact_body')),
  CHECK (NOT (effect_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acpr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acpr_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_record_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_record_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  receipt_threshold INTEGER NOT NULL,
  max_effects_per_session INTEGER NOT NULL CHECK (max_effects_per_session = 1),
  max_nominated_effects INTEGER NOT NULL CHECK (max_nominated_effects = 1),
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
    REFERENCES agent_acpr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acpr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acpr_effect_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acpr_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE TABLE agent_acpr_effect_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  outcome_id UUID NOT NULL,
  admission_class acpr_admission_class NOT NULL,
  outcome_class acpr_outcome_class NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acpr_recorded_effect_head (account_id, utc_day, consumer_principal_id)
);

CREATE TABLE agent_acpr_receipt_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  admission_class acpr_admission_class NOT NULL,
  receipt_class acpr_receipt_class NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE TABLE agent_acpr_receipt_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  provider_code TEXT NOT NULL,
  effect_code TEXT NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  admission_class acpr_admission_class NOT NULL,
  receipt_class acpr_receipt_class NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  provider_steward_a TEXT NOT NULL,
  provider_steward_b TEXT NOT NULL,
  effect_steward_a TEXT NOT NULL,
  effect_steward_b TEXT NOT NULL,
  bind_steward_a TEXT NOT NULL,
  bind_steward_b TEXT NOT NULL,
  receipt_steward_a TEXT NOT NULL,
  receipt_steward_b TEXT NOT NULL,
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
    REFERENCES agent_acpr_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acpr_receipt_compile (account_id, compile_id)
);

CREATE TABLE agent_acpr_receipt_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  compile_kind acpr_compile_kind NOT NULL,
  admission_class acpr_admission_class NOT NULL,
  outcome_class acpr_outcome_class NOT NULL,
  receipt_class acpr_receipt_class NOT NULL,
  freshness_class acpr_freshness_class NOT NULL,
  effect_observation acpr_effect_observation NOT NULL,
  attested_key_kind acpr_key_kind NOT NULL,
  fact_disposition acpr_fact_disposition NOT NULL,
  body_visibility acpr_body_visibility NOT NULL,
  access_path acpr_access_path NOT NULL,
  metadata_trust acpr_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE TABLE agent_acpr_provider_receipt (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  provider_receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  outcome_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acpr_admission_class NOT NULL,
  outcome_class acpr_outcome_class NOT NULL,
  receipt_class acpr_receipt_class NOT NULL,
  receipt_reason acpr_receipt_reason NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acpr_effect_observation NOT NULL,
  attested_key_kind acpr_key_kind NOT NULL,
  fact_disposition acpr_fact_disposition NOT NULL,
  body_visibility acpr_body_visibility NOT NULL,
  metadata_trust acpr_metadata_trust NOT NULL,
  access_path acpr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acpr_next_action NOT NULL,
  provider_steward_a TEXT NOT NULL,
  provider_steward_b TEXT NOT NULL,
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, provider_receipt_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acpr_recorded_effect_head (account_id, utc_day, consumer_principal_id),
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
    (provider_receipt_recorded = true AND receipt_class = 'RECEIVED'
      AND trusted_next_action = 'CITE_PROVIDER_RECEIPT'
      AND receipt_body ? 'sealedCount'
      AND receipt_body ? 'deniedCount'
      AND receipt_body ? 'unknownEffectCount')
    OR (provider_receipt_recorded = false AND receipt_class = 'NOT_RECEIVED'
      AND trusted_next_action IN ('STOP_PROVIDER_RECEIPT', 'OMIT_PROVIDER_RECEIPT')
      AND NOT (receipt_body ? 'sealedCount')
      AND NOT (receipt_body ? 'deniedCount')
      AND NOT (receipt_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acpr_receipt_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  provider_receipt_id UUID NOT NULL,
  provider_code TEXT NOT NULL,
  receipt_class acpr_receipt_class NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acpr_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acpr_next_action NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acpr_provider_receipt (account_id, utc_day, consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acpr_receipt_intent (
  account_id BIGINT NOT NULL,
  receipt_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acpr_receipt_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpr_receipt_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acpr_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE TABLE agent_acpr_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acpr_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE TABLE agent_acpr_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE TABLE agent_acpr_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acpr_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acpr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acpr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpr_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_acpr_profile()
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
      IF current_setting('app.acpr_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acpr_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acpr_profile_protect
BEFORE INSERT OR UPDATE ON agent_acpr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_profile();

CREATE FUNCTION protect_agent_acpr_receipt_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acpr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acpr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed receipt rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acpr_receipt_rule_protect
BEFORE UPDATE ON agent_acpr_profile_receipt_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_receipt_rule();

CREATE FUNCTION protect_agent_acpr_recorded_effect_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed recorded effect head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.effect_body ? 'factBody'
     OR NEW.effect_body ? 'fact_body'
     OR NEW.effect_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.outcome_class = 'RECORDED' THEN
    IF NEW.tool_effect_recorded IS DISTINCT FROM TRUE
       OR NEW.outcome_reason IS DISTINCT FROM 'AUTHORIZED_PURPOSE_EFFECT_RECORDED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'CITE_RECORDED_EFFECT'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.bind_class IS DISTINCT FROM 'AUTHORIZED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.effect_body ? 'sealedCount') THEN
      RAISE EXCEPTION 'recorded effect head must carry the granted counts';
    END IF;
  ELSIF NEW.tool_effect_recorded
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.outcome_reason IS DISTINCT FROM 'UNAUTHORIZED_BIND_CANNOT_SUCCEED'
     OR NEW.outcome_class IS DISTINCT FROM 'NOT_RECORDED'
     OR NEW.effect_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not recorded effect head cannot carry a provider grant';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_EFFECT_RECORD' THEN
      RAISE EXCEPTION 'silence is not a recorded provider receipt';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_EFFECT_RECORD' THEN
      RAISE EXCEPTION 'denied effect head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'effect head class is not receivable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acpr_recorded_effect_head_protect
BEFORE INSERT OR UPDATE ON agent_acpr_recorded_effect_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_recorded_effect_head();

CREATE FUNCTION protect_agent_acpr_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.receipt_hash IS DISTINCT FROM NEW.receipt_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'provider receipt decision identity is immutable';
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

  IF NEW.receipt_class = 'RECEIVED' AND NEW.provider_receipt_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'received receipt must copy the recorded counts';
  END IF;

  IF NEW.receipt_class = 'NOT_RECEIVED' AND NEW.provider_receipt_recorded THEN
    RAISE EXCEPTION 'not recorded effect cannot receive a successful provider receipt';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acpr_decision_protect
BEFORE INSERT OR UPDATE ON agent_acpr_receipt_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_decision();

CREATE FUNCTION protect_agent_acpr_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.provider_steward_a = NEW.provider_steward_b
     OR NEW.consumer_principal_id IN (NEW.provider_steward_a, NEW.provider_steward_b)
     OR NEW.provider_steward_a IN (
       NEW.effect_steward_a, NEW.effect_steward_b,
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.provider_steward_b IN (
       NEW.effect_steward_a, NEW.effect_steward_b,
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.consumer_principal_id IN (
       NEW.effect_steward_a, NEW.effect_steward_b,
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.effect_steward_a = NEW.effect_steward_b
     OR NEW.bind_steward_a = NEW.bind_steward_b
     OR NEW.receipt_steward_a = NEW.receipt_steward_b
     OR NEW.card_steward_a = NEW.card_steward_b
     OR NEW.admission_steward_a = NEW.admission_steward_b
     OR NEW.attestation_steward_a = NEW.attestation_steward_b
     OR NEW.synopsis_steward_a = NEW.synopsis_steward_b
     OR NEW.publication_steward_a = NEW.publication_steward_b THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acpr_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acpr_receipt_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_certificate();

CREATE FUNCTION protect_agent_acpr_receipt_intent()
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
     OR OLD.provider_idempotency_key IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared receipt identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_acpr_receipt_intent_protect
BEFORE INSERT OR UPDATE ON agent_acpr_receipt_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_receipt_intent();

CREATE FUNCTION protect_agent_acpr_provider_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_receipt$
DECLARE
  v_head agent_acpr_recorded_effect_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed provider receipt is immutable';
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
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'provider receipt fence';
  END IF;

  IF NEW.provider_code IS NULL OR NEW.provider_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acpr_recorded_effect_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded effect head point lookup missed';
  END IF;

  IF NEW.receipt_class = 'RECEIVED' OR NEW.provider_receipt_recorded THEN
    IF v_head.outcome_class IS DISTINCT FROM 'RECORDED'
       OR v_head.tool_effect_recorded IS DISTINCT FROM TRUE
       OR v_head.outcome_reason IS DISTINCT FROM 'AUTHORIZED_PURPOSE_EFFECT_RECORDED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'CITE_RECORDED_EFFECT' THEN
      RAISE EXCEPTION 'not recorded effect cannot receive a successful provider receipt';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.receipt_reason IS DISTINCT FROM 'RECORDED_EFFECT_PROVIDER_RECEIVED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'CITE_PROVIDER_RECEIPT'
       OR NEW.outcome_id IS DISTINCT FROM v_head.outcome_id THEN
      RAISE EXCEPTION 'received receipt must copy the recorded counts';
    END IF;
  ELSE
    IF v_head.outcome_class IS DISTINCT FROM 'NOT_RECORDED' OR v_head.tool_effect_recorded THEN
      RAISE EXCEPTION 'recorded effect must receive the granted counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.receipt_body ? 'sealedCount'
       OR NEW.provider_receipt_recorded
       OR NEW.receipt_reason IS DISTINCT FROM 'NOT_RECORDED_EFFECT_CANNOT_RECEIVE' THEN
      RAISE EXCEPTION 'not received receipt cannot carry counts';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_EFFECT_RECORD' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_PROVIDER_RECEIPT' THEN
        RAISE EXCEPTION 'silence cannot receive a provider receipt';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_PROVIDER_RECEIPT'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused receipt must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code
    INTO v_effect, v_purpose, v_provider
  FROM agent_acpr_session AS s
  JOIN agent_acpr_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_provider IS NULL
     OR NEW.provider_code IS DISTINCT FROM v_provider
     OR NEW.effect_code IS DISTINCT FROM v_effect
     OR NEW.purpose_code IS DISTINCT FROM v_purpose
     OR NEW.effect_code IS DISTINCT FROM v_head.effect_code
     OR NEW.purpose_code IS DISTINCT FROM v_head.purpose_code THEN
    RAISE EXCEPTION 'provider code is not the profile provider';
  END IF;

  RETURN NEW;
END
$protect_receipt$;

CREATE TRIGGER agent_acpr_provider_receipt_protect
BEFORE INSERT OR UPDATE ON agent_acpr_provider_receipt
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_provider_receipt();

CREATE FUNCTION protect_agent_acpr_perception()
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
     OR NEW.perception_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.receipt_class = 'NOT_RECEIVED'
     AND (NEW.provider_receipt_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not received perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acpr_perception_protect
BEFORE INSERT OR UPDATE ON agent_acpr_receipt_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpr_perception();

CREATE FUNCTION approve_agent_acpr_profile(
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
  stored_status acpr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acpr_profile
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
  FROM agent_acpr_profile_receipt_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_receipt IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control receipt rule';
  END IF;

  PERFORM set_config(
    'app.acpr_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acpr_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acpr_profile(
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
  stored_status acpr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acpr_profile
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
    'app.acpr_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acpr_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acpr_effect(
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
  v_session_status acpr_session_status;
  v_profile_status acpr_profile_status;
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
    FROM agent_acpr_effect_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one effect per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acpr_session AS s
  JOIN agent_acpr_profile AS pr
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

  INSERT INTO agent_acpr_effect_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION record_agent_acpr_provider_receipt(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_provider_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_receipt_id UUID,
  p_receipt_digest TEXT,
  p_provider_steward_a TEXT,
  p_provider_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $record_receipt$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acpr_session_status;
  v_profile_status acpr_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_principal TEXT;
  v_head agent_acpr_recorded_effect_head%ROWTYPE;
  v_class acpr_receipt_class;
  v_reason acpr_receipt_reason;
  v_recorded BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acpr_next_action;
  v_terminal acpr_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_provider_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_receipt_digest) <> 64 THEN
    RAISE EXCEPTION 'receipt digest must be 64 hex characters';
  END IF;

  IF p_provider_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acpr_effect_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'provider receipt requires a nominated effect point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_principal
  FROM agent_acpr_session AS s
  JOIN agent_acpr_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'record requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_provider_code IS DISTINCT FROM v_allowed_provider THEN
    RAISE EXCEPTION 'provider code is not the profile provider';
  END IF;

  SELECT * INTO v_head
  FROM agent_acpr_recorded_effect_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded effect head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect THEN
    RAISE EXCEPTION 'effect code is not the profile effect';
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
     OR v_head.effect_body ? 'factBody'
     OR v_head.effect_body ? 'fact_body'
     OR v_head.effect_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'provider receipt fence';
  END IF;

  IF p_provider_steward_a = p_provider_steward_b
     OR p_consumer_principal IN (p_provider_steward_a, p_provider_steward_b)
     OR p_provider_steward_a IN (
       v_head.effect_steward_a, v_head.effect_steward_b,
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_provider_steward_b IN (
       v_head.effect_steward_a, v_head.effect_steward_b,
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_consumer_principal IN (
       v_head.effect_steward_a, v_head.effect_steward_b,
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     ) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acpr_provider_receipt
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'provider receipt already recorded';
  END IF;

  IF v_head.outcome_class = 'RECORDED'
     AND v_head.outcome_reason = 'AUTHORIZED_PURPOSE_EFFECT_RECORDED'
     AND v_head.tool_effect_recorded
     AND v_head.trusted_next_action = 'CITE_RECORDED_EFFECT'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.bind_class = 'AUTHORIZED' THEN
    v_class := 'RECEIVED';
    v_reason := 'RECORDED_EFFECT_PROVIDER_RECEIVED';
    v_recorded := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'CITE_PROVIDER_RECEIPT';
    v_terminal := 'RECEIPT_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_EFFECT_RECORD' THEN
    v_class := 'NOT_RECEIVED';
    v_reason := 'NOT_RECORDED_EFFECT_CANNOT_RECEIVE';
    v_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_PROVIDER_RECEIPT';
    v_terminal := 'RECEIPT_REFUSED';
  ELSE
    v_class := 'NOT_RECEIVED';
    v_reason := 'NOT_RECORDED_EFFECT_CANNOT_RECEIVE';
    v_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_PROVIDER_RECEIPT';
    v_terminal := 'RECEIPT_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'purposeCode', v_head.purpose_code,
    'effectCode', v_head.effect_code,
    'providerCode', p_provider_code,
    'admissionClass', v_head.admission_class,
    'outcomeClass', v_head.outcome_class,
    'receiptClass', v_class,
    'receiptReason', v_reason,
    'providerReceiptRecorded', v_recorded,
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

  INSERT INTO agent_acpr_effect_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    outcome_id, admission_class, outcome_class, tool_effect_recorded, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    v_head.outcome_id, v_head.admission_class, v_head.outcome_class,
    v_head.tool_effect_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpr_receipt_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    provider_code, admission_class, receipt_class, provider_receipt_recorded,
    receipt_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_provider_code, v_head.admission_class, v_class, v_recorded,
    p_receipt_digest, clock_timestamp()
  );

  INSERT INTO agent_acpr_receipt_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    utc_day, provider_code, effect_code, receipt_hash, admission_class, receipt_class,
    provider_receipt_recorded, provider_steward_a, provider_steward_b,
    effect_steward_a, effect_steward_b,
    bind_steward_a, bind_steward_b,
    receipt_steward_a, receipt_steward_b,
    card_steward_a, card_steward_b,
    admission_steward_a, admission_steward_b,
    attestation_steward_a, attestation_steward_b,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_certificate_id, p_session_id, p_compile_id, p_consumer_principal,
    p_utc_day, p_provider_code, v_head.effect_code, p_receipt_digest,
    v_head.admission_class, v_class, v_recorded,
    p_provider_steward_a, p_provider_steward_b,
    v_head.effect_steward_a, v_head.effect_steward_b,
    v_head.bind_steward_a, v_head.bind_steward_b,
    v_head.receipt_steward_a, v_head.receipt_steward_b,
    v_head.card_steward_a, v_head.card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpr_receipt_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, provider_code, compile_kind, admission_class, outcome_class,
    receipt_class, freshness_class, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    provider_receipt_recorded, executes_tool, lag_publications, max_lag_budget, receipt_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_provider_code, 'RECORD_RECORDED_EFFECT_RECEIPT',
    v_head.admission_class, v_head.outcome_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_recorded, false, v_lag, v_head.max_lag_budget, p_receipt_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpr_provider_receipt (
    account_id, utc_day, consumer_principal_id, provider_receipt_id, session_id,
    certificate_id, outcome_id, purpose_code, effect_code, provider_code, admission_class,
    outcome_class, receipt_class, receipt_reason, provider_receipt_recorded, sealed_count,
    denied_count, unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust,
    access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, executes_tool, trusted_next_action, provider_steward_a,
    provider_steward_b, receipt_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_receipt_id, p_session_id,
    p_certificate_id, v_head.outcome_id, v_head.purpose_code, v_head.effect_code,
    p_provider_code, v_head.admission_class, v_head.outcome_class, v_class, v_reason,
    v_recorded, v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false, v_next,
    p_provider_steward_a, p_provider_steward_b, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpr_receipt_perception (
    account_id, utc_day, consumer_principal_id, provider_receipt_id, provider_code,
    receipt_class, provider_receipt_recorded, sealed_count, denied_count, unknown_effect_count,
    attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_receipt_id, p_provider_code,
    v_class, v_recorded, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acpr_receipt_intent (
    account_id, receipt_intent_id, session_id, certificate_id, intent_status,
    provider_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, p_certificate_id, 'PREPARED',
    p_receipt_id::TEXT, 1, p_receipt_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpr_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, 'RECORD', 1, clock_timestamp()
  );

  INSERT INTO agent_acpr_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acpr_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'PROVIDER_RECEIPT_SEALED',
    p_receipt_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acpr_session
  SET consumed_record_units = consumed_record_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$record_receipt$;

CREATE FUNCTION reject_agent_acpr_unscoped_scan(
  has_account BOOLEAN,
  has_effect_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_effect_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_acpr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acpr_profile_authority;
ALTER FUNCTION revoke_agent_acpr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acpr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acpr_profile_authority;
GRANT SELECT ON
  agent_acpr_profile,
  agent_acpr_profile_receipt_rule
TO agent_acpr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acpr_profile TO agent_acpr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acpr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acpr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acpr_profile FROM PUBLIC;

CREATE INDEX agent_acpr_session_work_idx ON agent_acpr_session (
  account_id,
  status
);
CREATE INDEX agent_acpr_session_profile_idx ON agent_acpr_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acpr_head_consumer_idx ON agent_acpr_recorded_effect_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acpr_nomination_session_idx ON agent_acpr_effect_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acpr_certificate_session_idx ON agent_acpr_receipt_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acpr_decision_cert_idx ON agent_acpr_receipt_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acpr_receipt_consumer_idx ON agent_acpr_provider_receipt (
  account_id,
  consumer_principal_id,
  utc_day
);
CREATE INDEX agent_acpr_receipt_class_idx ON agent_acpr_provider_receipt (
  account_id,
  receipt_class
);
CREATE INDEX agent_acpr_perception_day_idx ON agent_acpr_receipt_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acpr_intent_work_idx ON agent_acpr_receipt_intent (
  account_id,
  session_id
);
CREATE INDEX agent_acpr_audit_time_idx ON agent_acpr_audit_event (
  account_id,
  created_at
);
CREATE INDEX agent_acpr_command_expiry_idx ON agent_acpr_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acpr_checkpoint_day_idx ON agent_acpr_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acpr_binding_day_idx ON agent_acpr_effect_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acpr_authorization_evidence',
    'agent_acpr_profile',
    'agent_acpr_profile_receipt_rule',
    'agent_acpr_recorded_effect_head',
    'agent_acpr_session',
    'agent_acpr_effect_nomination',
    'agent_acpr_effect_binding',
    'agent_acpr_receipt_compile',
    'agent_acpr_receipt_certificate',
    'agent_acpr_receipt_decision',
    'agent_acpr_provider_receipt',
    'agent_acpr_receipt_perception',
    'agent_acpr_receipt_intent',
    'agent_acpr_budget_ledger',
    'agent_acpr_terminal_record',
    'agent_acpr_command_result',
    'agent_acpr_audit_head',
    'agent_acpr_audit_event',
    'agent_acpr_audit_anchor',
    'agent_acpr_projection_checkpoint'
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

Direct inserts that skip the record function still pass
through the triggers. A successful receipt on a
`NOT_RECORDED` effect, a trusted key, a packet scan, a
fact body, a tool execution flag, or a nested expiry flag
is rejected. The recorded effect head cannot be updated
to launder a refused effect into a provider receipt.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcprAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcprOutcomeClass {
  RECORDED
  NOT_RECORDED
}

enum AcprReceiptClass {
  RECEIVED
  NOT_RECEIVED
}

enum AcprReceiptReason {
  RECORDED_EFFECT_PROVIDER_RECEIVED
  NOT_RECORDED_EFFECT_CANNOT_RECEIVE
}

enum AcprNextAction {
  CITE_PROVIDER_RECEIPT
  STOP_PROVIDER_RECEIPT
  OMIT_PROVIDER_RECEIPT
}

enum AcprKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcprProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  allowedPurpose: String!
  allowedEffectCode: String!
  allowedProviderCode: String!
  procedureRef: String!
}

type AcprSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxEffectsPerSession: Int!
}

type AcprRecordedEffectHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  outcomeClass: AcprOutcomeClass!
  toolEffectRecorded: Boolean!
  attestedKeyKind: AcprKeyKind!
}

type AcprProviderReceipt {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  providerReceiptId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  admissionClass: AcprAdmissionClass!
  outcomeClass: AcprOutcomeClass!
  receiptClass: AcprReceiptClass!
  receiptReason: AcprReceiptReason!
  providerReceiptRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcprKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcprNextAction!
}

type AcprReceiptPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  providerCode: String!
  providerReceiptRecorded: Boolean!
  perceptionBody: JSON!
}

type AcprAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcprProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcprProfile
  agentAcprSession(accountId: ID!, sessionId: ID!): AcprSession
  agentAcprRecordedEffectHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcprRecordedEffectHead
  agentAcprProviderReceipt(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcprProviderReceipt
  agentAcprReceiptPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcprReceiptPerception
  agentAcprAuditEvents(accountId: ID!, utcDay: String!): [AcprAuditEvent!]!
}

type Mutation {
  createAgentAcprProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcprProfile!
  approveAgentAcprProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcprProfile!
  revokeAgentAcprProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcprProfile!
  openAgentAcprSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcprSession!
  nominateAgentAcprEffect(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  recordAgentAcprProviderReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    providerCode: String!
  ): AcprProviderReceipt!
  appendAgentAcprReceiptIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcprAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Effect and receipt reads
also take a non-null `utcDay` and `consumerPrincipalId`.
The schema has no list-all-effects field and no field
that executes a tool. Resolvers must call
`reject_agent_acpr_unscoped_scan` before planning when
either the account or the effect key is missing. A
receipt read is one primary-key lookup. It does not join
a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will
follow. `procedure_ref` is
`proc:admitted-count-provider-receipt`. The instruction
payload on the receipt rule is deterministic JSON:

- point-look up one recorded effect by
  `(account_id, utc_day, consumer_principal_id)`;
- record the single `allowed_provider_code` only when
  the outcome reason is
  `AUTHORIZED_PURPOSE_EFFECT_RECORDED` and the next
  action is `CITE_RECORDED_EFFECT`;
- otherwise seal `NOT_RECORDED_EFFECT_CANNOT_RECEIVE`
  with null counts;
- never execute the tool inside the record;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version,
and the one provider code. It may not rewrite the
instruction by chatting with the engine. Changing the
provider code is a new profile version that stays
`DRAFT` until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash,
which covers the single provider code. Queries must
filter `account_id` before topK. A global ANN index
would mix tenants and is rejected. The reference schema
does not build an HNSW index.

```sql
CREATE TABLE agent_acpr_profile_embedding (
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
    REFERENCES agent_acpr_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acpr_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acpr_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acpr_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens
a session, nominates one effect, and records that
profile's one provider code under dual control.
Similarity never records a receipt and never restores a
fact.

## 12. Agent perception

The agent reads `agent_acpr_receipt_perception`, not the
steward columns on the recorded effect head.

Metadata tags on a received perception:

- `grain:account_id,utc_day,consumer_principal_id`
- `receiptClass:RECEIVED`
- `providerCode:<the one profile provider>`
- `providerReceiptRecorded:true`
- `executesTool:false`
- `attestedKeyKind:AWAITING_CONFIRMATION`
- `ackPromotedToTrust:false`
- `accessPath:POINT_LOOKUP`
- `next:CITE_PROVIDER_RECEIPT`

`CITE_PROVIDER_RECEIPT` tells the agent which receipt was
sealed. The database has not called the provider and has
not called the tool again. A later citation card,
outside this transaction, may publish that one receipt.
The agent must not fan the receipt out to other tools,
other days, or a board scan.

A `NOT_RECEIVED` perception omits `sealedCount`,
`deniedCount`, and `unknownEffectCount`. Tags are
`providerReceiptRecorded:false` and either
`next:STOP_PROVIDER_RECEIPT` or
`next:OMIT_PROVIDER_RECEIPT`. The agent must treat those
tags as absence of a receipt. It must not fill the
counts from memory, from a packet, or from a model.

## 13. ACID and consistency

The record function writes the binding, compile,
certificate, decision, receipt, perception, intent,
ledger, terminal, and audit event in one transaction.
The effect head is read and not updated. A crash before
commit leaves no receipt. A commit is the only durable
record of the provider receipt.

Consistency choice: the receipt is sealed at the
effect's counts. It does not wait for a later columnar
refresh and it does not recompute the counts. Stale
analytics cannot change a sealed receipt. The hybrid row
store owns the transaction. Columnar storage may later
project the receipt for aggregation, but only by the
same primary key, and only after the row commit.

`UNKNOWN_EFFECT` on the parent admission stays a
non-receipt with a null lag. Silence is not rewritten
into a successful receipt to make a dashboard look
complete.

## 14. Guardrails and neighbor protection

- One effect per session. A second nomination is
  rejected.
- One receipt per effect. A second record is rejected.
- `executes_tool` is forced false. The ACID path cannot
  call out to a tool or a provider.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are
  rejected access paths.
- Null account, day, consumer, or provider code is
  **FULL SCAN REJECTED** before planning.
- Provider stewards cannot be the consumer or any
  upstream steward, so one principal cannot witness its
  own receipt.
- Notify intents start `PREPARED`. Provider silence
  stays `UNKNOWN_EFFECT` and does not enroll the key.
- This plane does not open another nested expiry.

These guards keep a recursive agent from turning one
admitted-count citation into a board-sized walk that
would miss the 99.99% availability target for neighbors.

## 15. Performance check for boards with 1M+ rows

The hot path is a primary-key read and a primary-key
write on `(account_id, utc_day, consumer_principal_id)`.
It does not filter a board, a packet log, or a provider
history. Indexes that serve sessions, certificates, and
audit reads all lead with `account_id`.

A planner that sees a missing account or a missing
effect key must call `reject_agent_acpr_unscoped_scan`
and stop. That is **FULL SCAN REJECTED**. It is a
refusal before a sequential scan. Boards with 1M+ rows
are not inputs to this plane.

HNSW, when a deployment adds it inside an
account-partitioned segment, ranks profiles only. It is
not on the record path. The reference schema omits the
index so a global ANN scan cannot leak across tenants.

## 16. Auditability and replay

Each record appends `agent_acpr_audit_event` with the
receipt digest and a previous hash. The event kind is
`PROVIDER_RECEIPT_SEALED`. Anchors are a separate
mutation and do not rewrite the receipt. Replay reads
the recorded effect head and the profile provider code
and re-runs `projectProviderReceipt`. The engine does
not call a model. The same head and the same provider
code always produce the same class, the same counts, and
the same next action.

## 17. Threat and failure analysis

- A caller who sets `RECEIVED` on a `NOT_RECORDED` head
  is rejected. The refusal cannot be laundered into a
  success.
- A caller who copies different counts than the effect
  head is rejected. The receipt cannot invent a larger
  citation.
- A caller who inlines `factBody` is rejected. The body
  stays omitted.
- A caller who sets `TRUSTED_ENROLLED` or
  `ack_promoted_to_trust` is rejected. `ACKED` stays an
  observation.
- A caller who sets `PACKET_SCAN` or `executes_tool` is
  rejected. The record does not walk packets and does
  not run the tool.
- A caller who reuses an effect steward as a provider
  steward is rejected.
- A caller who updates a sealed head or a sealed receipt
  is rejected.
- A caller who inserts a profile as `APPROVED` is
  rejected. Approval goes through the authority fence.
- Cross-tenant rows fail the forced `account_id`
  policy.

## 18. Observability and SLOs

- Record latency target: one primary-key read plus one
  primary-key write, p99 under 20 ms inside the tenant
  partition. This budget excludes provider calls and
  tool execution, which stay outside the database.
- Availability target: 99.99% for neighbor queries.
  Rejected scans must not become background work.
- Correctness counters: `received_receipts`,
  `refused_receipts`, `full_scan_rejected`,
  `not_recorded_success_rejected`,
  `fact_body_rejected`.
- A refused receipt is a successful seal of
  `NOT_RECEIVED`, not an error budget burn, unless the
  function itself fails.
- `UNKNOWN_EFFECT` seals are counted separately from
  `DENIED` so silence is visible.

## 19. Rollout

1. Ship the schema and the record function dark, behind
   the profile authority role.
2. Export recorded effect heads for one internal account
   by primary key. Do not backfill from a board scan.
3. Approve one profile whose provider code is
   `provider:receipt-cited-admitted-counts`, whose
   effect code is `effect:cited-admitted-counts`, and
   whose purpose is `tool:cite-admitted-counts`.
4. Record receipts for that account. Compare the sealed
   counts to the effect head.
5. Enable the GraphQL mutations for that account.
6. Expand account by account. Revocation stops new
   sessions and leaves sealed receipts in place.

No step opens another nested expiry plane.

## 20. Ship criteria

- `npm run validate` passes TypeScript strict compile,
  GraphQL schema build (6 queries, 8 mutations), and
  PGlite plus pgvector DDL execution.
- Fixture: lag 3, budget 5, class `RECORDED`, counts
  1/1/1, provider `provider:receipt-cited-admitted-counts`
  received; lag 8, budget 5, class `NOT_RECORDED` with
  counts omitted and the effect head lag still 8;
  silence class `UNKNOWN_EFFECT` with null lag and null
  counts.
- A `NOT_RECORDED` outcome cannot receive a successful
  provider receipt.
- The receipt does not scan context packets, does not
  inline a fact body, does not promote `ACKED` to
  `TRUSTED_ENROLLED`, does not execute the tool, and
  does not open another nested expiry.
- Every table and tenant index leads with `account_id`.
- `npm audit` reports no vulnerabilities for this
  package's direct dependency tree at ship time.

## 21. Product decision

Ship the Admitted Count Provider Receipt Plane as the
deterministic record of one provider receipt for one
already sealed tool effect. The database seals the
receipt. It does not run the tool and it does not call
the provider. Agents perceive a single perception row
keyed by account, UTC day, and consumer.
`CITE_PROVIDER_RECEIPT` is a citation handle.
`STOP_PROVIDER_RECEIPT` and `OMIT_PROVIDER_RECEIPT` are
refusals. Neither handle is permission to scan a board.

The next increment should publish one citation card for
an already `RECEIVED` provider receipt by point lookup
of `(account_id, utc_day, consumer_principal_id)`. A
`NOT_RECEIVED` receipt cannot publish a successful
citation. The card must not scan context packets, must
not inline a fact body, must not promote `ACKED` to
`TRUSTED_ENROLLED`, must not execute the tool, and must
not open another nested expiry plane.
