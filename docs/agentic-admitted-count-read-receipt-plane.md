# mondayDB Agentic Admitted Count Read Receipt Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-11.v1`

## 1. Why this plane, before how

The 2026-10-10 Admitted Count Perception Card Plane publishes one
card per `(account_id, utc_day)`. `ADMITTED` copies
`sealed_count`, `denied_count`, and `unknown_effect_count`.
`DENIED` seals `STOP_SYNOPSIS_USE` with null counts.
`UNKNOWN_EFFECT` seals `OMIT_COUNTS` with a null lag and null
counts. That plane does not record that a consumer read the card.

Without this plane an agent either:

- treats publication as proof that a particular principal
  perceived the counts, or
- walks context packets, receipt logs, or a board with 1M+
  rows to reconstruct who read the card (neighbor-harmful, and
  a miss against the 99.99% availability target).

The product trade-off is **acknowledgement completeness versus
count confidentiality**, and **read latency versus trust
inflation**:

- A receipt that re-decides the lag budget would let a later
  profile edit change what the consumer is allowed to
  acknowledge. This plane does not re-decide. It point-looks
  up the already published card.
- Acknowledging counts on `DENIED` or `UNKNOWN_EFFECT` would
  invent counts the card withheld.
- Leaving an admitted read unrecorded forces the next tool
  call to open the card again, or to scan for a witness.
- Recording the read must not promote `ACKED` to
  `TRUSTED_ENROLLED`. The key stays `AWAITING_CONFIRMATION`.
  The body stays omitted.

Latency for the receipt is one primary-key read of
`(account_id, utc_day)` and one primary-key write of
`(account_id, utc_day, consumer_principal_id)`. Consistency
is the sealed receipt plus the publication id it cites. The
published card head is not rewritten. Neighbor availability
stays at the 99.99% target because an unscoped day walk or
packet walk is **FULL SCAN REJECTED** before it touches a
board.

The recommended model keeps the data plane deterministic:

1. An approved receipt profile is procedural memory for "how
   one already published count card becomes a consumer read
   receipt." A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one `utc_day`. The record
   then reads `agent_acrr_published_card_head` by
   `(account_id, utc_day)`. It does not scan packets.
3. mondayDB acknowledges counts only when the head is
   `ADMITTED`, the publication reason is
   `ADMITTED_COUNT_PERCEPTION_PUBLISHED`, and
   `counts_published` is true. The copy is equality with the
   published counts. It does not call a model.
4. `DENIED` and `UNKNOWN_EFFECT` seal
   `COUNTS_NOT_ACKNOWLEDGED` with null counts. Silence keeps
   a null lag. There are no counts to acknowledge.
5. Two receipt stewards witness the read. They are distinct
   from the consumer and from the card, admission,
   attestation, synopsis, and publication stewards.
6. Unscoped card or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination and the receipt?
- Was the receipt a point lookup of an already published
  card, and what class did that card have?
- Did an `ADMITTED` day record
  `ADMITTED_COUNT_READ_RECORDED` with the three published
  counts?
- Did `DENIED` and `UNKNOWN_EFFECT` stay
  `COUNTS_NOT_ACKNOWLEDGED` with null counts?
- Did `ACKED` stay an effect observation while the key
  stayed `AWAITING_CONFIRMATION` and the body stayed
  omitted?
- Did the published card head keep the counts it was
  exported with?
- Can the receipt be replayed without invoking an LLM?

HNSW profile discovery stays account-scoped and never
authorizes this receipt.

## 2. Scope and ownership

The Admitted Count Read Receipt Plane owns:

1. Immutable approved receipt profiles as procedural memory.
2. Tenant-scoped receipt sessions with a hard cap of one
   nominated UTC day.
3. Deterministic nomination of that day, then one point
   lookup of the published card head.
4. A read receipt keyed by
   `(account_id, utc_day, consumer_principal_id)`.
5. An agent perception row that carries counts only when
   the receipt class is `ACKNOWLEDGED`.
6. Audit events that cite the receipt hash.

It integrates with, but does not replace:

- **Admitted Count Perception Card Plane:** supplies the
  published card this plane reads. Exporters copy the class,
  the publication reason, the counts the card actually
  published, and the stewards onto
  `agent_acrr_published_card_head`. This plane does not
  re-publish the card, does not recover withheld replay
  counts, and does not promote `ACKED` to
  `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  receipt, vector, and notify units. A denied day is a
  refusal with null counts, not a scan of the packet log.

### Non-goals

- Letting an LLM decide that a denied day's hidden replay
  counts are safe to acknowledge.
- Rewriting the published card head so a denied day becomes
  acknowledged.
- Copying counts onto a `NOT_ACKNOWLEDGED` receipt.
- Recomputing readers by scanning a board, a packet log, or
  a citation ledger.
- Cross-account receipts or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, packet bodies,
  or fact bodies on the receipt.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because the synopsis effect was `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this receipt.
- Binding the receipt to a tool-use purpose. That is the
  next plane, and only for an already `ACKNOWLEDGED` row.

## 3. Product contract

### 3.1 Receipt profile contract

A profile version is immutable after approval. It defines:

- allowed classes (`ADMITTED`, `DENIED`, `UNKNOWN_EFFECT`);
- receipt threshold (distinct receipt stewards, minimum 2),
  max days per session (exactly 1), and max nominated days
  (exactly 1);
- receipt policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `RECEIPT_NEVER_RESTORES_FACTS`,
  `RECEIPT_NEVER_INLINES_BODY`, `RECEIPT_NEVER_CONFIRMS`,
  `ONE_DAY_PER_SESSION`, `POINT_LOOKUP_ONLY`,
  `PUBLISHED_CARD_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `COUNTS_ONLY_WHEN_ADMITTED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PUBLISH`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest publication
reason is `ADMITTED_COUNT_PERCEPTION_PUBLISHED` (35 bytes).
The longest receipt reason is
`ADMITTED_COUNT_READ_RECORDED` (28 bytes).

Approval and revocation require the authority fence
`approve_agent_acrr_profile` /
`revoke_agent_acrr_profile`, owned by
`agent_acrr_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, receipt, vector, and notify units, plus wall time.
`max_days_per_session` and `max_nominated_days` are both
exactly 1. A second day nomination in the same session is
rejected before it can fan out into a recursive retrieval.

### 3.3 Published card head and nomination contract

Upstream card export writes one published card head per
`(account_id, utc_day)`. The head copy includes
`admission_class`, `publication_reason`, `counts_published`,
the three counts when they were published, and the
stewards. It does not include a fact body and it does not
include withheld replay counts. The head is immutable.
This plane does not advance it and does not reclassify it.

`nominate_agent_acrr_day(account_id, session_id, utc_day,
nomination_id, nomination_hash)` nominates that day. A
null `utc_day` is **FULL SCAN REJECTED**. The access path
is `POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` are rejected.

### 3.4 Read receipt contract

`record_agent_acrr_read_receipt` is the only compile that
writes a read receipt. It requires:

- a nomination of the same `(account_id, utc_day)`;
- one published card head for that key, with
  `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`,
  `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, and
  `packet_scan_used = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- a consumer principal distinct from both receipt stewards
  and from every card, admission, attestation, synopsis,
  and publication steward;
- receipt stewards distinct from each other and from those
  same upstream stewards.

The grain is `(account_id, utc_day, consumer_principal_id)`.
Projection is:

- `ACKNOWLEDGED` when the head class is `ADMITTED`, the
  publication reason is
  `ADMITTED_COUNT_PERCEPTION_PUBLISHED`, and counts were
  published. The receipt copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`.
  `counts_acknowledged` is true. `receipt_reason` is
  `ADMITTED_COUNT_READ_RECORDED`. `trusted_next_action` is
  `CITE_READ_RECEIPT`.
- `NOT_ACKNOWLEDGED` when the head class is `DENIED`.
  Counts stay null. `receipt_reason` is
  `COUNTS_NOT_ACKNOWLEDGED`. `trusted_next_action` is
  `STOP_COUNT_ACK`.
- `NOT_ACKNOWLEDGED` when the head class is
  `UNKNOWN_EFFECT`. Counts stay null. The receipt lag stays
  null. `receipt_reason` is `COUNTS_NOT_ACKNOWLEDGED`.
  `trusted_next_action` is `OMIT_COUNT_ACK`.

`receipt_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as
`effect_observation` when the head observed it. It does
not write `TRUSTED_ENROLLED`. The published card head is
not updated. A second receipt for the same consumer and
day is rejected. A forged acknowledged receipt whose
counts differ from the head is rejected. A forged
not-acknowledged receipt that carries any count is
rejected.

### 3.5 Perception and notify contract

The same transaction writes
`agent_acrr_receipt_perception` for the agent. Counts
appear there only when `counts_acknowledged` is true.
Effect intents start as `PREPARED`. Provider silence stays
`UNKNOWN_EFFECT`. An acknowledgement of the notify is not
enrollment, not a fact restore, and not a second card
publication. This plane does not open another nested
expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index
   leads with `account_id`. Row level security is forced.
2. A null `utc_day` or a null `account_id` is
   **FULL SCAN REJECTED**.
3. One session nominates one UTC day. The access path is
   `POINT_LOOKUP`.
4. The published card head is immutable. The receipt does
   not rewrite it.
5. Counts move onto a receipt only from an `ADMITTED`
   head whose publication reason is
   `ADMITTED_COUNT_PERCEPTION_PUBLISHED`.
6. `DENIED` and `UNKNOWN_EFFECT` receipts store null
   counts. Silence stores a null lag.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, and
   `packet_scan_used` stay false.
9. Receipt stewards, the consumer, and upstream stewards
   are pairwise distinct.
10. Semantic retrieval may rank profiles. It never records
    a receipt.
11. The engine does not call a model. Replay is a pure
    function of the published head and the consumer id.

## 5. Execution model

```text
approved profile
  -> open session (one utc day budget)
  -> nominate (account_id, utc_day) POINT_LOOKUP
  -> read published card head by primary key
  -> project ACKNOWLEDGED or NOT_ACKNOWLEDGED
  -> append receipt + perception + audit
  -> leave the card head unchanged
```

Compile kind is `RECORD_COUNT_READ_RECEIPT` for both
outcomes. The class on the receipt, not a second plane,
distinguishes acknowledgement from refusal. Notify dispatch
is a later effect intent and may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile and one dual-control receipt rule.
2. Approve it through `agent_acrr_profile_authority`.
3. Export one published card head per day. The export is
   a point copy of the count card, not a packet walk.
4. Open a session and nominate one `utc_day`.
5. Record the receipt. Admitted days acknowledge the
   published counts. Other classes refuse with null counts.
6. The agent reads the perception row. A withheld
   perception has no count fields.
7. Revocation stops a later session from nominating. It
   does not rewrite receipts already sealed.
8. This plane does not open another nested expiry.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type ReceiptId = string;
export type UtcDay = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type PublicationReason =
  | "ADMITTED_COUNT_PERCEPTION_PUBLISHED"
  | "COUNT_PERCEPTION_WITHHELD";
export type ReceiptClass = "ACKNOWLEDGED" | "NOT_ACKNOWLEDGED";
export type ReceiptReason =
  | "ADMITTED_COUNT_READ_RECORDED"
  | "COUNTS_NOT_ACKNOWLEDGED";
export type NextAction =
  | "CITE_READ_RECEIPT"
  | "STOP_COUNT_ACK"
  | "OMIT_COUNT_ACK";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

export interface PublishedCardHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly admissionClass: AdmissionClass;
  readonly publicationReason: PublicationReason;
  readonly countsPublished: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
}

export interface ReadReceipt {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly receiptId: ReceiptId;
  readonly consumerPrincipalId: PrincipalId;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly countsAcknowledged: boolean;
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
  readonly trustedNextAction: NextAction;
}

export function projectReadReceipt(
  head: PublishedCardHead,
  receiptId: ReceiptId,
  consumerPrincipalId: PrincipalId,
): ReadReceipt {
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    receiptId,
    consumerPrincipalId,
    admissionClass: head.admissionClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
  };

  if (
    head.admissionClass === "ADMITTED" &&
    head.publicationReason === "ADMITTED_COUNT_PERCEPTION_PUBLISHED" &&
    head.countsPublished &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      receiptClass: "ACKNOWLEDGED",
      receiptReason: "ADMITTED_COUNT_READ_RECORDED",
      countsAcknowledged: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "CITE_READ_RECEIPT",
    };
  }

  return {
    ...shared,
    receiptClass: "NOT_ACKNOWLEDGED",
    receiptReason: "COUNTS_NOT_ACKNOWLEDGED",
    countsAcknowledged: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: head.admissionClass === "UNKNOWN_EFFECT" ? null : head.lagPublications,
    trustedNextAction:
      head.admissionClass === "UNKNOWN_EFFECT" ? "OMIT_COUNT_ACK" : "STOP_COUNT_ACK",
  };
}
```

```ts
export function perceptionOmitsCounts(receipt: ReadReceipt): boolean {
  return (
    receipt.countsAcknowledged === false &&
    receipt.sealedCount === null &&
    receipt.deniedCount === null &&
    receipt.unknownEffectCount === null &&
    receipt.ackPromotedToTrust === false &&
    receipt.attestedKeyKind === "AWAITING_CONFIRMATION"
  );
}
```

`projectReadReceipt` is the procedural projection an agent
runtime must match. It never returns `TRUSTED_ENROLLED`.
It never copies counts off a withheld publication.

## 8. SQL row-store schema

```sql
CREATE TYPE acrr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acrr_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acrr_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acrr_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acrr_publication_reason AS ENUM (
  'ADMITTED_COUNT_PERCEPTION_PUBLISHED',
  'COUNT_PERCEPTION_WITHHELD'
);
CREATE TYPE acrr_receipt_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE acrr_receipt_reason AS ENUM (
  'ADMITTED_COUNT_READ_RECORDED',
  'COUNTS_NOT_ACKNOWLEDGED'
);
CREATE TYPE acrr_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acrr_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acrr_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acrr_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acrr_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acrr_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acrr_effect_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acrr_compile_kind AS ENUM ('RECORD_COUNT_READ_RECEIPT');
CREATE TYPE acrr_terminal_kind AS ENUM (
  'RECEIPT_RECORDED',
  'RECEIPT_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acrr_next_action AS ENUM (
  'CITE_READ_RECEIPT',
  'STOP_COUNT_ACK',
  'OMIT_COUNT_ACK'
);
CREATE TYPE acrr_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_PUBLISH',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acrr_profile_authority NOLOGIN;

CREATE TABLE agent_acrr_authorization_evidence (
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

CREATE TABLE agent_acrr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acrr_profile_status NOT NULL,
  definition_hash TEXT NOT NULL CHECK (char_length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash TEXT,
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash TEXT NOT NULL CHECK (char_length(authorization_snapshot_hash) = 64),
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_days_per_session INTEGER NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days INTEGER NOT NULL CHECK (max_nominated_days = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acrr_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrr_profile_receipt_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acrr_admission_class[] NOT NULL,
  receipt_threshold INTEGER NOT NULL CHECK (receipt_threshold >= 2),
  max_days_per_session INTEGER NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days INTEGER NOT NULL CHECK (max_nominated_days = 1),
  require_dual_control_receipt BOOLEAN NOT NULL,
  receipt_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acrr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acrr_published_card_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  card_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  publication_reason acrr_publication_reason NOT NULL,
  admission_class acrr_admission_class NOT NULL,
  freshness_class acrr_freshness_class NOT NULL,
  counts_published BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrr_effect_observation NOT NULL,
  attested_key_kind acrr_key_kind NOT NULL,
  fact_disposition acrr_fact_disposition NOT NULL,
  body_visibility acrr_body_visibility NOT NULL,
  metadata_trust acrr_metadata_trust NOT NULL,
  access_path acrr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
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
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, card_id)
);

CREATE TABLE agent_acrr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acrr_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_bind_units INTEGER NOT NULL,
  budget_receipt_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_bind_units INTEGER NOT NULL,
  consumed_receipt_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  receipt_threshold INTEGER NOT NULL,
  max_days_per_session INTEGER NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days INTEGER NOT NULL CHECK (max_nominated_days = 1),
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
    REFERENCES agent_acrr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acrr_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acrr_day_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  access_path acrr_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE TABLE agent_acrr_card_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  card_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  admission_class acrr_admission_class NOT NULL,
  publication_reason acrr_publication_reason NOT NULL,
  counts_published BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_acrr_published_card_head (account_id, utc_day)
);

CREATE TABLE agent_acrr_receipt_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  admission_class acrr_admission_class NOT NULL,
  receipt_class acrr_receipt_class NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE TABLE agent_acrr_receipt_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  purpose_hash TEXT NOT NULL CHECK (char_length(purpose_hash) = 64),
  admission_class acrr_admission_class NOT NULL,
  receipt_class acrr_receipt_class NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
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
    REFERENCES agent_acrr_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acrr_receipt_compile (account_id, compile_id)
);

CREATE TABLE agent_acrr_receipt_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  compile_kind acrr_compile_kind NOT NULL,
  admission_class acrr_admission_class NOT NULL,
  receipt_class acrr_receipt_class NOT NULL,
  freshness_class acrr_freshness_class NOT NULL,
  effect_observation acrr_effect_observation NOT NULL,
  attested_key_kind acrr_key_kind NOT NULL,
  fact_disposition acrr_fact_disposition NOT NULL,
  body_visibility acrr_body_visibility NOT NULL,
  access_path acrr_access_path NOT NULL,
  metadata_trust acrr_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  receipt_hash TEXT NOT NULL CHECK (char_length(receipt_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE TABLE agent_acrr_read_receipt (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  card_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  admission_class acrr_admission_class NOT NULL,
  receipt_class acrr_receipt_class NOT NULL,
  receipt_reason acrr_receipt_reason NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acrr_effect_observation NOT NULL,
  attested_key_kind acrr_key_kind NOT NULL,
  fact_disposition acrr_fact_disposition NOT NULL,
  body_visibility acrr_body_visibility NOT NULL,
  metadata_trust acrr_metadata_trust NOT NULL,
  access_path acrr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  trusted_next_action acrr_next_action NOT NULL,
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, receipt_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrr_receipt_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_acrr_published_card_head (account_id, utc_day),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (receipt_body ? 'factBody')),
  CHECK (NOT (receipt_body ? 'fact_body')),
  CHECK (NOT (receipt_body ? 'resolvedFactHash')),
  CHECK (
    (counts_acknowledged = true AND receipt_body ? 'sealedCount'
      AND receipt_body ? 'deniedCount' AND receipt_body ? 'unknownEffectCount')
    OR (counts_acknowledged = false AND NOT (receipt_body ? 'sealedCount')
      AND NOT (receipt_body ? 'deniedCount')
      AND NOT (receipt_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acrr_receipt_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_id UUID NOT NULL,
  receipt_class acrr_receipt_class NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acrr_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acrr_next_action NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acrr_read_receipt (account_id, utc_day, consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acrr_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acrr_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acrr_receipt_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acrr_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE TABLE agent_acrr_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acrr_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE TABLE agent_acrr_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE TABLE agent_acrr_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acrr_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acrr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acrr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acrr_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_acrr_profile()
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
      IF current_setting('app.acrr_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acrr_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acrr_profile_protect
BEFORE INSERT OR UPDATE ON agent_acrr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_profile();

CREATE FUNCTION protect_agent_acrr_receipt_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acrr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acrr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed receipt rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acrr_receipt_rule_protect
BEFORE UPDATE ON agent_acrr_profile_receipt_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_receipt_rule();

CREATE FUNCTION protect_agent_acrr_published_card_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed published card head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.card_body ? 'factBody'
     OR NEW.card_body ? 'fact_body'
     OR NEW.card_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.admission_class = 'ADMITTED' THEN
    IF NEW.publication_reason IS DISTINCT FROM 'ADMITTED_COUNT_PERCEPTION_PUBLISHED'
       OR NEW.counts_published IS DISTINCT FROM TRUE
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.card_body ? 'sealedCount') THEN
      RAISE EXCEPTION 'admitted head must publish the sealed counts';
    END IF;
  ELSIF NEW.publication_reason IS DISTINCT FROM 'COUNT_PERCEPTION_WITHHELD'
     OR NEW.counts_published
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.card_body ? 'sealedCount'
     OR NEW.card_body ? 'deniedCount'
     OR NEW.card_body ? 'unknownEffectCount' THEN
    RAISE EXCEPTION 'withheld head cannot carry counts';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT'
     AND NEW.lag_publications IS NOT NULL THEN
    RAISE EXCEPTION 'silence is not a published count card';
  ELSIF NEW.admission_class = 'DENIED'
     AND (NEW.lag_publications IS NULL OR NEW.lag_publications <= NEW.max_lag_budget) THEN
    RAISE EXCEPTION 'denied head must sit above the lag budget';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acrr_published_card_head_protect
BEFORE INSERT OR UPDATE ON agent_acrr_published_card_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_published_card_head();

CREATE FUNCTION protect_agent_acrr_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.receipt_hash IS DISTINCT FROM NEW.receipt_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'read receipt decision identity is immutable';
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

  IF NEW.packet_scan_used OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.receipt_class = 'ACKNOWLEDGED' AND NEW.counts_acknowledged IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'acknowledged receipt must carry counts';
  END IF;

  IF NEW.receipt_class = 'NOT_ACKNOWLEDGED' AND NEW.counts_acknowledged THEN
    RAISE EXCEPTION 'withheld receipt cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acrr_decision_protect
BEFORE INSERT OR UPDATE ON agent_acrr_receipt_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_decision();

CREATE FUNCTION protect_agent_acrr_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.receipt_steward_a = NEW.receipt_steward_b
     OR NEW.consumer_principal_id IN (NEW.receipt_steward_a, NEW.receipt_steward_b)
     OR NEW.receipt_steward_a IN (
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.receipt_steward_b IN (
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.consumer_principal_id IN (
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
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

CREATE TRIGGER agent_acrr_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acrr_receipt_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_certificate();

CREATE FUNCTION protect_agent_acrr_effect_intent()
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
     OR OLD.provider_idempotency_key IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared effect identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_effect$;

CREATE TRIGGER agent_acrr_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_acrr_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_effect_intent();

CREATE FUNCTION protect_agent_acrr_read_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_receipt$
DECLARE
  v_head agent_acrr_published_card_head%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed read receipt is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.receipt_body ? 'factBody'
     OR NEW.receipt_body ? 'fact_body'
     OR NEW.receipt_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'read receipt fence';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrr_published_card_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'published card head point lookup missed';
  END IF;

  IF v_head.admission_class IS DISTINCT FROM NEW.admission_class
     OR v_head.card_id IS DISTINCT FROM NEW.card_id
     OR v_head.publication_id IS DISTINCT FROM NEW.publication_id THEN
    RAISE EXCEPTION 'receipt drifted from the published card head';
  END IF;

  IF NEW.receipt_class = 'ACKNOWLEDGED' THEN
    IF v_head.admission_class IS DISTINCT FROM 'ADMITTED'
       OR v_head.publication_reason IS DISTINCT FROM 'ADMITTED_COUNT_PERCEPTION_PUBLISHED'
       OR v_head.counts_published IS DISTINCT FROM TRUE
       OR NEW.counts_acknowledged IS DISTINCT FROM TRUE
       OR NEW.receipt_reason IS DISTINCT FROM 'ADMITTED_COUNT_READ_RECORDED'
       OR NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count THEN
      RAISE EXCEPTION 'acknowledged receipt must copy the published admitted counts';
    END IF;
  ELSIF NEW.counts_acknowledged
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.receipt_reason IS DISTINCT FROM 'COUNTS_NOT_ACKNOWLEDGED'
     OR NEW.receipt_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'withheld receipt cannot carry counts';
  END IF;

  IF v_head.admission_class = 'UNKNOWN_EFFECT' AND NEW.lag_publications IS NOT NULL THEN
    RAISE EXCEPTION 'silence is not a count acknowledgement';
  END IF;

  RETURN NEW;
END
$protect_receipt$;

CREATE TRIGGER agent_acrr_read_receipt_protect
BEFORE INSERT OR UPDATE ON agent_acrr_read_receipt
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_read_receipt();

CREATE FUNCTION protect_agent_acrr_perception()
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

  IF NEW.receipt_class = 'NOT_ACKNOWLEDGED'
     AND (NEW.counts_acknowledged
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'withheld perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acrr_perception_protect
BEFORE INSERT OR UPDATE ON agent_acrr_receipt_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acrr_perception();

CREATE FUNCTION approve_agent_acrr_profile(
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
  stored_status acrr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrr_profile
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
  FROM agent_acrr_profile_receipt_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_receipt IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control receipt rule';
  END IF;

  PERFORM set_config(
    'app.acrr_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrr_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acrr_profile(
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
  stored_status acrr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acrr_profile
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
    'app.acrr_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acrr_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acrr_day(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_nomination_id UUID,
  p_nomination_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
DECLARE
  v_session_status acrr_session_status;
  v_profile_status acrr_profile_status;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_nomination_hash) <> 64 THEN
    RAISE EXCEPTION 'nomination hash must be 64 hex characters';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acrr_day_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one utc day per session';
  END IF;

  SELECT s.status, pr.status
    INTO v_session_status, v_profile_status
  FROM agent_acrr_session AS s
  JOIN agent_acrr_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'nomination requires an open session on an approved profile';
  END IF;

  INSERT INTO agent_acrr_day_nomination (
    account_id, nomination_id, session_id, utc_day,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION record_agent_acrr_read_receipt(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
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
AS $record_receipt$
DECLARE
  v_nominated DATE;
  v_head agent_acrr_published_card_head%ROWTYPE;
  v_receipt_class acrr_receipt_class;
  v_reason acrr_receipt_reason;
  v_counts BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acrr_next_action;
  v_terminal acrr_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL OR p_consumer_principal IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_receipt_digest) <> 64 THEN
    RAISE EXCEPTION 'receipt digest must be 64 hex characters';
  END IF;

  SELECT utc_day INTO v_nominated
  FROM agent_acrr_day_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated IS DISTINCT FROM p_utc_day THEN
    RAISE EXCEPTION 'read receipt requires a nominated utc_day point lookup';
  END IF;

  SELECT * INTO v_head
  FROM agent_acrr_published_card_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'published card head point lookup missed';
  END IF;

  IF v_head.inlines_fact_body
     OR v_head.opens_nested_expiry
     OR v_head.ack_promoted_to_trust
     OR v_head.packet_scan_used
     OR v_head.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_head.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR v_head.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR v_head.body_visibility IS DISTINCT FROM 'OMITTED'
     OR v_head.card_body ? 'factBody'
     OR v_head.card_body ? 'fact_body'
     OR v_head.card_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'read receipt fence';
  END IF;

  IF p_receipt_steward_a = p_receipt_steward_b
     OR p_consumer_principal IN (p_receipt_steward_a, p_receipt_steward_b)
     OR p_receipt_steward_a IN (
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_receipt_steward_b IN (
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_consumer_principal IN (
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
    FROM agent_acrr_read_receipt
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'read receipt already recorded';
  END IF;

  IF v_head.admission_class = 'ADMITTED'
     AND v_head.publication_reason = 'ADMITTED_COUNT_PERCEPTION_PUBLISHED'
     AND v_head.counts_published THEN
    v_receipt_class := 'ACKNOWLEDGED';
    v_reason := 'ADMITTED_COUNT_READ_RECORDED';
    v_counts := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'CITE_READ_RECEIPT';
    v_terminal := 'RECEIPT_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT' THEN
    v_receipt_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'COUNTS_NOT_ACKNOWLEDGED';
    v_counts := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_COUNT_ACK';
    v_terminal := 'RECEIPT_REFUSED';
  ELSE
    v_receipt_class := 'NOT_ACKNOWLEDGED';
    v_reason := 'COUNTS_NOT_ACKNOWLEDGED';
    v_counts := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_COUNT_ACK';
    v_terminal := 'RECEIPT_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'admissionClass', v_head.admission_class,
    'receiptClass', v_receipt_class,
    'receiptReason', v_reason,
    'lagPublications', v_lag,
    'maxLagBudget', v_head.max_lag_budget,
    'countsAcknowledged', v_counts,
    'metadataTrust', 'UNTRUSTED_METADATA',
    'attestedKeyKind', 'AWAITING_CONFIRMATION',
    'ackPromotedToTrust', false,
    'inlinesFactBody', false,
    'opensNestedExpiry', false,
    'packetScanUsed', false
  );
  IF v_counts THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acrr_card_binding (
    account_id, binding_id, session_id, utc_day, card_id, publication_id,
    admission_class, publication_reason, counts_published, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, v_head.card_id,
    v_head.publication_id, v_head.admission_class, v_head.publication_reason,
    v_head.counts_published, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrr_receipt_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    admission_class, receipt_class, counts_acknowledged, receipt_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    v_head.admission_class, v_receipt_class, v_counts, p_receipt_digest,
    clock_timestamp()
  );

  INSERT INTO agent_acrr_receipt_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    utc_day, purpose_hash, admission_class, receipt_class, counts_acknowledged,
    receipt_steward_a, receipt_steward_b,
    card_steward_a, card_steward_b,
    admission_steward_a, admission_steward_b,
    attestation_steward_a, attestation_steward_b,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_certificate_id, p_session_id, p_compile_id, p_consumer_principal,
    p_utc_day, p_receipt_digest, v_head.admission_class, v_receipt_class, v_counts,
    p_receipt_steward_a, p_receipt_steward_b,
    v_head.card_steward_a, v_head.card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrr_receipt_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, compile_kind, admission_class, receipt_class,
    freshness_class, effect_observation, attested_key_kind, fact_disposition,
    body_visibility, access_path, metadata_trust, opens_nested_expiry,
    inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    counts_acknowledged, lag_publications, max_lag_budget, receipt_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, 'RECORD_COUNT_READ_RECEIPT', v_head.admission_class,
    v_receipt_class, v_head.freshness_class, v_head.effect_observation,
    'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
    'UNTRUSTED_METADATA', false, false, false, false, v_counts,
    v_lag, v_head.max_lag_budget, p_receipt_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrr_read_receipt (
    account_id, utc_day, consumer_principal_id, receipt_id, session_id,
    certificate_id, card_id, publication_id, admission_class, receipt_class,
    receipt_reason, counts_acknowledged, sealed_count, denied_count,
    unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust,
    access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, trusted_next_action, receipt_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_receipt_id, p_session_id,
    p_certificate_id, v_head.card_id, v_head.publication_id, v_head.admission_class,
    v_receipt_class, v_reason, v_counts, v_sealed, v_denied, v_unknown, v_lag,
    v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, v_next, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acrr_receipt_perception (
    account_id, utc_day, consumer_principal_id, receipt_id, receipt_class,
    counts_acknowledged, sealed_count, denied_count, unknown_effect_count,
    attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_receipt_id, v_receipt_class,
    v_counts, v_sealed, v_denied, v_unknown, 'AWAITING_CONFIRMATION', false,
    v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acrr_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_receipt_id, p_session_id, 'RECEIPT', 1, clock_timestamp()
  );

  INSERT INTO agent_acrr_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acrr_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'COUNT_READ_RECEIPT_SEALED',
    p_receipt_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acrr_session
  SET consumed_receipt_units = consumed_receipt_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$record_receipt$;

CREATE FUNCTION reject_agent_acrr_unscoped_scan(
  has_account BOOLEAN,
  has_day BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_day IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_acrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrr_profile_authority;
ALTER FUNCTION revoke_agent_acrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acrr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acrr_profile_authority;
GRANT SELECT ON
  agent_acrr_profile,
  agent_acrr_profile_receipt_rule
TO agent_acrr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrr_profile TO agent_acrr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acrr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acrr_profile FROM PUBLIC;

CREATE INDEX agent_acrr_session_work_idx ON agent_acrr_session (
  account_id,
  status
);
CREATE INDEX agent_acrr_session_profile_idx ON agent_acrr_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acrr_head_day_idx ON agent_acrr_published_card_head (
  account_id,
  utc_day
);
CREATE INDEX agent_acrr_nomination_session_idx ON agent_acrr_day_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acrr_certificate_session_idx ON agent_acrr_receipt_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acrr_decision_cert_idx ON agent_acrr_receipt_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acrr_receipt_consumer_idx ON agent_acrr_read_receipt (
  account_id,
  consumer_principal_id,
  utc_day
);
CREATE INDEX agent_acrr_receipt_class_idx ON agent_acrr_read_receipt (
  account_id,
  receipt_class
);
CREATE INDEX agent_acrr_perception_day_idx ON agent_acrr_receipt_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acrr_effect_work_idx ON agent_acrr_effect_intent (
  account_id,
  session_id
);
CREATE INDEX agent_acrr_audit_time_idx ON agent_acrr_audit_event (
  account_id,
  created_at
);
CREATE INDEX agent_acrr_command_expiry_idx ON agent_acrr_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acrr_checkpoint_day_idx ON agent_acrr_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acrr_binding_day_idx ON agent_acrr_card_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acrr_authorization_evidence',
    'agent_acrr_profile',
    'agent_acrr_profile_receipt_rule',
    'agent_acrr_published_card_head',
    'agent_acrr_session',
    'agent_acrr_day_nomination',
    'agent_acrr_card_binding',
    'agent_acrr_receipt_compile',
    'agent_acrr_receipt_certificate',
    'agent_acrr_receipt_decision',
    'agent_acrr_read_receipt',
    'agent_acrr_receipt_perception',
    'agent_acrr_effect_intent',
    'agent_acrr_budget_ledger',
    'agent_acrr_terminal_record',
    'agent_acrr_command_result',
    'agent_acrr_audit_head',
    'agent_acrr_audit_event',
    'agent_acrr_audit_anchor',
    'agent_acrr_projection_checkpoint'
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

Direct inserts that skip the record function still pass through
the triggers. A withheld receipt with a count, a trusted key,
a packet scan, a fact body, or a nested expiry flag is
rejected. The card head cannot be updated to launder a denied
day into an acknowledgement.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcrrAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcrrReceiptClass {
  ACKNOWLEDGED
  NOT_ACKNOWLEDGED
}

enum AcrrReceiptReason {
  ADMITTED_COUNT_READ_RECORDED
  COUNTS_NOT_ACKNOWLEDGED
}

enum AcrrNextAction {
  CITE_READ_RECEIPT
  STOP_COUNT_ACK
  OMIT_COUNT_ACK
}

enum AcrrKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcrrProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  procedureRef: String!
}

type AcrrSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxDaysPerSession: Int!
}

type AcrrPublishedCardHead {
  accountId: ID!
  utcDay: String!
  admissionClass: AcrrAdmissionClass!
  countsPublished: Boolean!
  attestedKeyKind: AcrrKeyKind!
}

type AcrrReadReceipt {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  receiptId: ID!
  admissionClass: AcrrAdmissionClass!
  receiptClass: AcrrReceiptClass!
  receiptReason: AcrrReceiptReason!
  countsAcknowledged: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcrrKeyKind!
  ackPromotedToTrust: Boolean!
  trustedNextAction: AcrrNextAction!
}

type AcrrReceiptPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  countsAcknowledged: Boolean!
  perceptionBody: JSON!
}

type AcrrAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcrrProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcrrProfile
  agentAcrrSession(accountId: ID!, sessionId: ID!): AcrrSession
  agentAcrrPublishedCardHead(accountId: ID!, utcDay: String!): AcrrPublishedCardHead
  agentAcrrReadReceipt(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrrReadReceipt
  agentAcrrReceiptPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrrReceiptPerception
  agentAcrrAuditEvents(accountId: ID!, utcDay: String!): [AcrrAuditEvent!]!
}

type Mutation {
  createAgentAcrrProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcrrProfile!
  approveAgentAcrrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrrProfile!
  revokeAgentAcrrProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcrrProfile!
  openAgentAcrrSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcrrSession!
  nominateAgentAcrrDay(accountId: ID!, sessionId: ID!, utcDay: String!): Boolean!
  recordAgentAcrrReadReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcrrReadReceipt!
  appendAgentAcrrEffectIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcrrAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId` and, where the grain is a day,
a non-null `utcDay`. The schema has no list-all-days field.
Resolvers must call `reject_agent_acrr_unscoped_scan` before
planning when either argument is missing. A receipt read is
one primary-key lookup. It does not join a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will
follow. `procedure_ref` is
`proc:admitted-count-read-receipt`. The instruction payload
on the receipt rule is deterministic JSON:

- point-look up one published card by `(account_id, utc_day)`;
- acknowledge counts only when the publication reason is
  `ADMITTED_COUNT_PERCEPTION_PUBLISHED`;
- otherwise seal `COUNTS_NOT_ACKNOWLEDGED` with null counts;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never open another nested expiry.

An agent may quote `procedure_ref` and the profile version.
It may not rewrite the instruction by chatting with the
engine. Changing the instruction is a new profile version
that stays `DRAFT` until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected. The reference
schema does not build an HNSW index.

```sql
CREATE TABLE agent_acrr_profile_embedding (
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
    REFERENCES agent_acrr_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acrr_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acrr_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acrr_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: an HNSW index belongs only inside an
-- account-partitioned segment. Never build one global ANN index
-- across tenants. Reference validation intentionally omits that DDL.
-- ANN queries must include account_id equality before topK.
-- Unscoped card or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one `utc_day`, and records that day's
receipt under dual control. Similarity never acknowledges
counts and never restores a fact.

## 12. Agent perception

The agent reads `agent_acrr_receipt_perception`, not the
steward columns on the published card head.

Metadata tags on an acknowledged perception:

- `grain:account_id,utc_day,consumer_principal_id`
- `receiptClass:ACKNOWLEDGED`
- `countsAcknowledged:true`
- `attestedKeyKind:AWAITING_CONFIRMATION`
- `ackPromotedToTrust:false`
- `accessPath:POINT_LOOKUP`
- `next:CITE_READ_RECEIPT`

Metadata tags on a withheld perception:

- `receiptClass:NOT_ACKNOWLEDGED`
- `receiptReason:COUNTS_NOT_ACKNOWLEDGED`
- `countsAcknowledged:false`
- `next:STOP_COUNT_ACK` or `next:OMIT_COUNT_ACK`

The perception body for a withheld day has no
`sealedCount`, `deniedCount`, or `unknownEffectCount`.
An LLM that sees `NOT_ACKNOWLEDGED` has no counts to cite
and must not invent them. `ACKED` on the parent head is an
effect observation. It is not enrollment and it is not
permission to open a nested expiry plane.

## 13. ACID and consistency

`record_agent_acrr_read_receipt` writes the binding,
compile, certificate, decision, receipt, perception,
budget debit, terminal row, and audit event in one
transaction. The published card head is not in the write
set, so a receipt cannot change citation stability of the
card. If any steward check fails, the transaction rolls
back and no partial receipt remains.

Idempotency is rejection, not upsert. A second record for
the same `(account_id, utc_day, consumer_principal_id)`
raises `read receipt already recorded`. Callers point-look
up the existing receipt. They do not rewrite it.

Notify delivery stays outside this transaction. Provider
silence is `UNKNOWN_EFFECT` on the effect intent. That
status does not flip `counts_acknowledged`.

## 14. Guardrails and neighbor protection

The record function reads one published card head primary
key. It does not join a packet catalog, a board, or a
watermark range. `DAY_SCAN`, `WATERMARK_SCAN`, and
`PACKET_SCAN` fail closed.

Budgets cap receipt units per session. One nominated day
prevents a recursive agent from turning one purpose into
a walk of every day on a 1M+ row board. A null day is
**FULL SCAN REJECTED** in the database, not only in the
client.

Receipt stewards are distinct from the consumer, so a
single principal cannot witness their own read. They are
also distinct from the stewards who published the card, so
the publisher cannot mint the acknowledgement.

This plane does not open another nested expiry. Refusal
is a row with null counts, not a new lifecycle of review
and containment.

## 15. Performance check for boards with 1M+ rows

Safe access paths:

- `agent_acrr_published_card_head` primary key
  `(account_id, utc_day)`;
- `agent_acrr_read_receipt` primary key
  `(account_id, utc_day, consumer_principal_id)`;
- `agent_acrr_day_nomination` unique
  `(account_id, session_id)`.

**FULL SCAN REJECTED** before planning:

- a receipt command with a null `utc_day`;
- `DAY_SCAN`, `WATERMARK_SCAN`, or `PACKET_SCAN`;
- any predicate that lacks `account_id`;
- a request to recompute readers from item rows, updates,
  or context packets on a board with 1M+ rows;
- an HNSW query that does not equality-filter
  `account_id` first.

The receipt write is one index lookup plus a handful of
primary-key inserts. It does not rewrite the card head, so
it does not create a hot-row update on the published card.
Neighbor tenants stay inside the 99.99% availability
budget because the governor drops the unscoped plan.

## 16. Auditability and replay

Each receipt appends `COUNT_READ_RECEIPT_SEALED` with the
receipt digest and a previous hash. The digest covers the
class, the reason, and, only when acknowledged, the three
counts. Replay calls `projectReadReceipt` on the immutable
head. If the recomputed class or counts differ from the
sealed receipt, the audit anchor is withheld.

Denied and silent days replay to `COUNTS_NOT_ACKNOWLEDGED`
with null counts even if a steward later wishes the card
had published counts. The head update path is closed.

## 17. Threat and failure analysis

- **Count laundering.** A caller inserts an acknowledged
  receipt on a denied day, or copies non-null counts onto
  `NOT_ACKNOWLEDGED`. The receipt trigger rejects it.
- **Trust inflation.** A caller sets
  `TRUSTED_ENROLLED` or `ack_promoted_to_trust` because
  the effect was `ACKED`. The decision trigger rejects it.
- **Fact restore.** A card export or receipt body carries
  `factBody`. The head and receipt triggers reject it.
- **Nested expiry.** `opens_nested_expiry` is rejected.
  This plane does not open another nested expiry.
- **Packet walk.** `PACKET_SCAN` is rejected as
  **FULL SCAN REJECTED**.
- **Steward collusion.** Reusing a card steward, or
  letting the consumer witness the receipt, is rejected.
- **Head rewrite.** Updating lag or counts on the
  published card head is rejected, so a receipt cannot be
  justified after the fact by editing the card.
- **Duplicate perception.** A second record for the same
  consumer and day is rejected. The first seal stands.
- **Cross-tenant read.** Forced row level security ties
  every policy to `app.account_id`.

## 18. Observability and SLOs

- Availability target: 99.99% for receipt point lookups.
  Unscoped scans are rejected and do not consume neighbor
  CPU.
- Latency budget: one primary-key read and one
  primary-key write, excluding client time.
- Correctness SLO: 100% of `NOT_ACKNOWLEDGED` receipts
  have null counts. 100% of `ACKNOWLEDGED` receipts match
  the published card counts.
- Trust SLO: 0 receipts with `TRUSTED_ENROLLED` or
  `ack_promoted_to_trust = true`.
- Audit SLO: every sealed receipt has one
  `COUNT_READ_RECEIPT_SEALED` event.

Alerts fire when a planner would have chosen a sequential
scan, when a withheld perception contains a count key, or
when receipt latency leaves the point-lookup budget.

## 19. Rollout

1. Ship the schema and governor rejection dark, with no
   GraphQL exposure.
2. Export published card heads for one internal account.
   Confirm denied exports cannot store counts.
3. Enable `recordAgentAcrrReadReceipt` for that account.
   Fixture: lag 3 budget 5 class `ADMITTED` counts 1/1/1
   records `ADMITTED_COUNT_READ_RECORDED`. Lag 8 budget 5
   class `DENIED` records `COUNTS_NOT_ACKNOWLEDGED` with
   null counts. Silence records `OMIT_COUNT_ACK` with a
   null lag.
4. Watch the trust SLO and the withheld-count SLO.
5. Open the perception read to agent runtimes. HNSW
   discovery stays non-authorizing.
6. Do not enable a tool-purpose bind in this rollout.
   That bind is a separate contract.

Rollback is disablement of the mutation. Sealed receipts
stay immutable. No nested expiry worker is deployed by
this plane.

## 20. Ship criteria

- TypeScript projection compiles under strict settings.
- GraphQL schema builds with 6 queries and 8 mutations.
- PGlite applies the row store, forced tenant policies,
  and the pgvector profile table.
- Fixture admitted day acknowledges counts 1/1/1 and
  leaves the head lag at 3.
- Fixture denied day and silent day store null counts.
- Negative checks reject null-day nomination, a second
  day, trust promotion, fact-body inline, nested expiry,
  packet scan, steward reuse, counts on a withheld
  receipt, head mutation, receipt mutation, a profile
  inserted as approved, a duplicate receipt, and an
  unscoped scan.
- `npm audit` reports no new dependency advisory that
  this validation toolchain must accept blindly. The
  engine path itself does not fetch model weights.

## 21. Product decision

Ship the read receipt as a deterministic point lookup.

An admitted published card can be acknowledged once per
consumer, with the three counts copied from that card. A
denied or silent card records `COUNTS_NOT_ACKNOWLEDGED`
and stores no counts. `ACKED` remains an effect
observation. The key remains `AWAITING_CONFIRMATION`.
The body remains omitted. The published card head is not
rewritten. The plane does not scan context packets, does
not inline a fact body, does not promote `ACKED` to
`TRUSTED_ENROLLED`, and does not open another nested
expiry.

The next increment should bind one already recorded
`ACKNOWLEDGED` read receipt to a single tool-use purpose
by point lookup of
`(account_id, utc_day, consumer_principal_id)`.
`NOT_ACKNOWLEDGED` receipts cannot authorize a tool. The
bind must not scan context packets, must not inline a
fact body, must not promote `ACKED` to `TRUSTED_ENROLLED`,
and must not open another nested expiry plane.
