# mondayDB Agentic Admitted Count Tool Purpose Bind Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-12.v1`

## 1. Why this plane, before how

The 2026-10-11 Admitted Count Read Receipt Plane records that
one consumer read one already published count card. The grain
is `(account_id, utc_day, consumer_principal_id)`. An
`ACKNOWLEDGED` receipt copies the three published counts and
seals `ADMITTED_COUNT_READ_RECORDED`. A `NOT_ACKNOWLEDGED`
receipt seals `COUNTS_NOT_ACKNOWLEDGED` with null counts.
That plane does not authorize a tool.

Without this plane an agent either:

- treats the receipt itself as permission to call any tool, or
- walks context packets, tool logs, or a board with 1M+ rows
  to invent a purpose (neighbor-harmful, and a miss against
  the 99.99% availability target).

The product trade-off is **authorization completeness versus
least privilege**, and **bind latency versus purpose fan-out**:

- Completeness: a consumer who acknowledged an admitted count
  card should be able to cite those counts through one
  pre-approved tool, without opening the card again.
- Least privilege: a `NOT_ACKNOWLEDGED` receipt must not
  become a tool grant. One receipt authorizes at most one
  purpose. A second purpose is a new request, and this plane
  rejects it.
- The database seals the grant. It does not execute the tool.
  Execution inside the ACID path would let a probabilistic
  agent run open-ended work and threaten neighbor latency.
- The recorded receipt head is not rewritten. Replay of the
  read stays stable. Authorization is a new row that cites
  the receipt by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This
  plane does not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the bind is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one
primary-key write of that same grain. Consistency is the
sealed bind plus the receipt id it cites. Neighbor
availability stays at the 99.99% target because an unscoped
day walk, a purpose list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved bind profile is procedural memory for "how
   one already recorded count-read receipt becomes a single
   tool-purpose grant." The profile names exactly one
   purpose code. A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one receipt key. The bind
   then reads `agent_actp_recorded_receipt_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does
   not scan packets.
3. mondayDB authorizes the profile's purpose only when the
   head is `ACKNOWLEDGED`, the receipt reason is
   `ADMITTED_COUNT_READ_RECORDED`, and the requested purpose
   equals the profile purpose. The copy of the three counts
   is equality with the receipt. It does not call a model.
4. `NOT_ACKNOWLEDGED` seals `RECEIPT_CANNOT_AUTHORIZE_TOOL`
   with `tool_authorized = false` and null counts. Silence
   keeps a null lag. There is no grant.
5. Two bind stewards witness the grant. They are distinct
   from the consumer, from the receipt stewards, and from
   the card, admission, attestation, synopsis, and
   publication stewards.
6. Unscoped receipt or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination and the bind?
- Was the bind a point lookup of an already recorded
  receipt, and what class did that receipt have?
- Did an `ACKNOWLEDGED` receipt bind exactly one purpose
  and seal `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND` with the
  three acknowledged counts?
- Did a `NOT_ACKNOWLEDGED` receipt stay unauthorized, with
  null counts and `RECEIPT_CANNOT_AUTHORIZE_TOOL`?
- Did `ACKED` stay an effect observation while the key
  stayed `AWAITING_CONFIRMATION` and the body stayed
  omitted?
- Did the recorded receipt head keep the class and counts
  it was exported with?
- Can the bind be replayed without invoking an LLM, and
  without executing the tool?

HNSW profile discovery stays account-scoped and never
authorizes this bind.

## 2. Scope and ownership

The Admitted Count Tool Purpose Bind Plane owns:

1. Immutable approved bind profiles as procedural memory,
   each naming one tool purpose.
2. Tenant-scoped bind sessions with a hard cap of one
   nominated receipt.
3. Deterministic nomination of that receipt, then one
   point lookup of the recorded receipt head.
4. A tool-purpose bind keyed by
   `(account_id, utc_day, consumer_principal_id)`.
5. An agent perception row that carries counts only when
   `tool_authorized` is true.
6. Audit events that cite the bind hash.

It integrates with, but does not replace:

- **Admitted Count Read Receipt Plane:** supplies the
  recorded receipt this plane reads. Exporters copy the
  receipt class, the receipt reason, the counts the receipt
  actually acknowledged, and the stewards onto
  `agent_actp_recorded_receipt_head`. This plane does not
  re-record the receipt, does not recover withheld counts,
  and does not promote `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  receipt, vector, and notify units. A refused receipt is
  a sealed non-grant, not a scan of the packet log. The
  bind does not run the tool.

### Non-goals

- Letting an LLM choose which tool a receipt may call.
- Executing the tool, or compiling a board query, inside
  `bind_agent_actp_tool_purpose`.
- Authorizing any purpose other than the single code on
  the approved profile.
- Copying counts onto a bind whose receipt is
  `NOT_ACKNOWLEDGED`.
- Rewriting the recorded receipt head so a refused read
  becomes a grant.
- Recomputing readers or tool runs by scanning a board, a
  packet log, or a citation ledger.
- Cross-account binds or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, packet bodies,
  or fact bodies on the bind.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because the receipt effect was `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this bind.
- Recording the tool's effect outcome. That is the next
  plane, and only for an already `AUTHORIZED` bind.

## 3. Product contract

### 3.1 Bind profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code (one token, no list);
- allowed receipt classes the exporter may present
  (`ADMITTED`, `DENIED`, `UNKNOWN_EFFECT` on the parent
  admission; the bind itself keys off receipt class);
- bind threshold (distinct bind stewards, minimum 2),
  max receipts per session (exactly 1), and max nominated
  receipts (exactly 1);
- bind policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `BIND_NEVER_EXECUTES_TOOL`,
  `BIND_NEVER_INLINES_BODY`, `BIND_NEVER_CONFIRMS`,
  `ONE_RECEIPT_PER_SESSION`, `ONE_PURPOSE_PER_RECEIPT`,
  `POINT_LOOKUP_ONLY`, `RECORDED_RECEIPT_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `AUTHORIZE_ONLY_WHEN_ACKNOWLEDGED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PUBLISH`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest bind
reason is `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND` (34 bytes).
The longest refusal reason is
`RECEIPT_CANNOT_AUTHORIZE_TOOL` (29 bytes).

Approval and revocation require the authority fence
`approve_agent_actp_profile` /
`revoke_agent_actp_profile`, owned by
`agent_actp_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, receipt, vector, and notify units, plus wall time.
`max_receipts_per_session` and `max_nominated_receipts`
are both exactly 1. A second receipt nomination in the
same session is rejected before it can fan out into a
recursive tool walk.

The session principal is the only consumer that session
may bind. A bind for a different principal is rejected.

### 3.3 Recorded receipt head and nomination contract

Upstream receipt export writes one recorded receipt head
per `(account_id, utc_day, consumer_principal_id)`. The
head copy includes `receipt_class`, `receipt_reason`,
`counts_acknowledged`, the three counts when they were
acknowledged, and the stewards. It does not include a
fact body and it does not include withheld counts. The
head is immutable. This plane does not advance it and
does not reclassify it.

`nominate_agent_actp_receipt(account_id, session_id,
utc_day, consumer_principal_id, nomination_id,
nomination_hash)` nominates that receipt. A null
`utc_day`, a null `account_id`, or a null consumer is
**FULL SCAN REJECTED**. The access path is `POINT_LOOKUP`.
`DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN` are
rejected.

### 3.4 Tool purpose bind contract

`bind_agent_actp_tool_purpose` is the only compile that
writes a tool-purpose bind. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one recorded receipt head for that key, with
  `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`,
  `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, and
  `packet_scan_used = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `purpose_code` equal to the profile's `allowed_purpose`,
  matching `^[a-z0-9:_-]{1,64}$` (one token, not a list
  and not a query);
- a consumer principal equal to the session principal,
  distinct from both bind stewards, and distinct from
  every receipt, card, admission, attestation, synopsis,
  and publication steward;
- bind stewards distinct from each other and from those
  same upstream stewards.

The grain is `(account_id, utc_day, consumer_principal_id)`.
That grain holds one purpose. Projection is:

- `AUTHORIZED` when the head receipt class is
  `ACKNOWLEDGED`, the receipt reason is
  `ADMITTED_COUNT_READ_RECORDED`, and counts were
  acknowledged. The bind copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`.
  `tool_authorized` is true. `bind_reason` is
  `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND`.
  `trusted_next_action` is `INVOKE_BOUND_PURPOSE`.
  The action names the grant. It does not run the tool.
- `NOT_AUTHORIZED` when the head receipt class is
  `NOT_ACKNOWLEDGED` and the admission class is `DENIED`.
  Counts stay null. `bind_reason` is
  `RECEIPT_CANNOT_AUTHORIZE_TOOL`. `tool_authorized` is
  false. `trusted_next_action` is `STOP_TOOL_PURPOSE`.
- `NOT_AUTHORIZED` when the head admission class is
  `UNKNOWN_EFFECT`. Counts stay null. The bind lag stays
  null. `bind_reason` is `RECEIPT_CANNOT_AUTHORIZE_TOOL`.
  `tool_authorized` is false. `trusted_next_action` is
  `OMIT_TOOL_PURPOSE`.

`NOT_ACKNOWLEDGED` receipts cannot authorize a tool.
`bind_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as
`effect_observation` when the head observed it. It does
not write `TRUSTED_ENROLLED`. The recorded receipt head
is not updated. A second bind for the same consumer and
day is rejected. A forged authorized bind whose counts
differ from the head is rejected. A forged unauthorized
bind that carries any count, or that sets
`tool_authorized`, is rejected. A purpose other than the
profile purpose is rejected before a row is sealed, so
the caller can retry the one allowed purpose. A null
purpose is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_actp_bind_perception`
for the agent. Counts appear there only when
`tool_authorized` is true. The perception names
`purpose_code` and whether the tool was authorized.
Effect intents start as `PREPARED`. Provider silence stays
`UNKNOWN_EFFECT`. An acknowledgement of the notify is not
enrollment, not a fact restore, not a tool execution, and
not a second receipt. This plane does not open another
nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index
   leads with `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null purpose, or
   a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one receipt. The access path is
   `POINT_LOOKUP`. One receipt binds one purpose.
4. The recorded receipt head is immutable. The bind does
   not rewrite it.
5. A tool is authorized only from an `ACKNOWLEDGED` head
   whose receipt reason is `ADMITTED_COUNT_READ_RECORDED`,
   and only for the profile's single purpose code.
6. `NOT_ACKNOWLEDGED` binds store null counts and
   `tool_authorized = false`. Silence stores a null lag.
   `NOT_ACKNOWLEDGED` receipts cannot authorize a tool.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, and
   `packet_scan_used` stay false. The bind does not
   execute the tool.
9. Bind stewards, the consumer, receipt stewards, and
   upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never binds
    a purpose.
11. The engine does not call a model. Replay is a pure
    function of the recorded receipt head, the consumer
    id, and the profile purpose.

## 5. Execution model

```text
approved profile (one allowed_purpose)
  -> open session (one receipt budget)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read recorded receipt head by primary key
  -> project AUTHORIZED or NOT_AUTHORIZED
  -> append bind + perception + audit
  -> leave the receipt head unchanged
  -> do not execute the tool
```

Compile kind is `BIND_RECEIPT_TOOL_PURPOSE` for both
outcomes. The class on the bind, not a second plane,
distinguishes a grant from a refusal. Notify dispatch is
a later effect intent and may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, and add one
   dual-control bind rule.
2. Approve it through `agent_actp_profile_authority`.
3. Export one recorded receipt head per consumer and day.
   The export is a point copy of the read receipt, not a
   packet walk.
4. Open a session and nominate one receipt key.
5. Bind the profile purpose. Acknowledged receipts
   authorize that one purpose and copy the counts. Other
   receipts seal a non-grant with null counts.
6. The agent reads the perception row. A withheld
   perception has no count fields and
   `toolAuthorized: false`.
7. Revocation stops a later session from nominating. It
   does not rewrite binds already sealed.
8. This plane does not open another nested expiry. It
   does not run the tool.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type BindId = string;
export type UtcDay = string;
export type PurposeCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type ReceiptClass = "ACKNOWLEDGED" | "NOT_ACKNOWLEDGED";
export type ReceiptReason =
  | "ADMITTED_COUNT_READ_RECORDED"
  | "COUNTS_NOT_ACKNOWLEDGED";
export type BindClass = "AUTHORIZED" | "NOT_AUTHORIZED";
export type BindReason =
  | "ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND"
  | "RECEIPT_CANNOT_AUTHORIZE_TOOL";
export type NextAction =
  | "INVOKE_BOUND_PURPOSE"
  | "STOP_TOOL_PURPOSE"
  | "OMIT_TOOL_PURPOSE";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const PURPOSE_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface RecordedReceiptHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly countsAcknowledged: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
}

export interface ToolPurposeBind {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly bindId: BindId;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: PurposeCode;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly bindClass: BindClass;
  readonly bindReason: BindReason;
  readonly toolAuthorized: boolean;
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
  readonly trustedNextAction: NextAction;
}

export function projectToolPurposeBind(
  head: RecordedReceiptHead,
  bindId: BindId,
  purposeCode: PurposeCode,
): ToolPurposeBind {
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    bindId,
    consumerPrincipalId: head.consumerPrincipalId,
    purposeCode,
    admissionClass: head.admissionClass,
    receiptClass: head.receiptClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singlePurpose = PURPOSE_TOKEN.test(purposeCode);

  if (
    singlePurpose &&
    head.receiptClass === "ACKNOWLEDGED" &&
    head.receiptReason === "ADMITTED_COUNT_READ_RECORDED" &&
    head.admissionClass === "ADMITTED" &&
    head.countsAcknowledged &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      bindClass: "AUTHORIZED",
      bindReason: "ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND",
      toolAuthorized: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "INVOKE_BOUND_PURPOSE",
    };
  }

  return {
    ...shared,
    bindClass: "NOT_AUTHORIZED",
    bindReason: "RECEIPT_CANNOT_AUTHORIZE_TOOL",
    toolAuthorized: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: head.admissionClass === "UNKNOWN_EFFECT" ? null : head.lagPublications,
    trustedNextAction:
      head.admissionClass === "UNKNOWN_EFFECT" ? "OMIT_TOOL_PURPOSE" : "STOP_TOOL_PURPOSE",
  };
}
```

```ts
export function perceptionOmitsToolGrant(bind: ToolPurposeBind): boolean {
  return (
    bind.toolAuthorized === false &&
    bind.bindClass === "NOT_AUTHORIZED" &&
    bind.sealedCount === null &&
    bind.deniedCount === null &&
    bind.unknownEffectCount === null &&
    bind.ackPromotedToTrust === false &&
    bind.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    bind.executesTool === false
  );
}
```

`projectToolPurposeBind` is the procedural projection an
agent runtime must match. It never returns
`TRUSTED_ENROLLED`. It never copies counts off a
`NOT_ACKNOWLEDGED` receipt. It never executes the tool.
A purpose token that is not a single code projects to
`NOT_AUTHORIZED`. The database additionally requires the
token to equal the approved profile purpose before it
seals `AUTHORIZED`.

## 8. SQL row-store schema

```sql
CREATE TYPE actp_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE actp_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE actp_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE actp_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE actp_receipt_class AS ENUM ('ACKNOWLEDGED', 'NOT_ACKNOWLEDGED');
CREATE TYPE actp_receipt_reason AS ENUM (
  'ADMITTED_COUNT_READ_RECORDED',
  'COUNTS_NOT_ACKNOWLEDGED'
);
CREATE TYPE actp_bind_class AS ENUM ('AUTHORIZED', 'NOT_AUTHORIZED');
CREATE TYPE actp_bind_reason AS ENUM (
  'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND',
  'RECEIPT_CANNOT_AUTHORIZE_TOOL'
);
CREATE TYPE actp_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE actp_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE actp_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE actp_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE actp_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE actp_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE actp_effect_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE actp_compile_kind AS ENUM ('BIND_RECEIPT_TOOL_PURPOSE');
CREATE TYPE actp_terminal_kind AS ENUM (
  'BIND_RECORDED',
  'BIND_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE actp_next_action AS ENUM (
  'INVOKE_BOUND_PURPOSE',
  'STOP_TOOL_PURPOSE',
  'OMIT_TOOL_PURPOSE'
);
CREATE TYPE actp_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_PUBLISH',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_actp_profile_authority NOLOGIN;

CREATE TABLE agent_actp_authorization_evidence (
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

CREATE TABLE agent_actp_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status actp_profile_status NOT NULL,
  definition_hash TEXT NOT NULL CHECK (char_length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash TEXT,
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash TEXT NOT NULL CHECK (char_length(authorization_snapshot_hash) = 64),
  allowed_purpose TEXT NOT NULL CHECK (allowed_purpose ~ '^[a-z0-9:_-]{1,64}$'),
  bind_threshold INTEGER NOT NULL CHECK (bind_threshold >= 2),
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy actp_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_actp_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_actp_profile_bind_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes actp_admission_class[] NOT NULL,
  bind_threshold INTEGER NOT NULL CHECK (bind_threshold >= 2),
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  require_dual_control_bind BOOLEAN NOT NULL,
  bind_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_actp_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_actp_recorded_receipt_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_id UUID NOT NULL,
  card_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  admission_class actp_admission_class NOT NULL,
  receipt_class actp_receipt_class NOT NULL,
  receipt_reason actp_receipt_reason NOT NULL,
  freshness_class actp_freshness_class NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation actp_effect_observation NOT NULL,
  attested_key_kind actp_key_kind NOT NULL,
  fact_disposition actp_fact_disposition NOT NULL,
  body_visibility actp_body_visibility NOT NULL,
  metadata_trust actp_metadata_trust NOT NULL,
  access_path actp_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
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
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, receipt_id),
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
  CHECK (NOT (receipt_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_actp_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status actp_session_status NOT NULL,
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
  bind_threshold INTEGER NOT NULL,
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
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
    REFERENCES agent_actp_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_actp_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_actp_receipt_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path actp_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE TABLE agent_actp_receipt_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  receipt_id UUID NOT NULL,
  admission_class actp_admission_class NOT NULL,
  receipt_class actp_receipt_class NOT NULL,
  counts_acknowledged BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_actp_recorded_receipt_head (account_id, utc_day, consumer_principal_id)
);

CREATE TABLE agent_actp_purpose_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  admission_class actp_admission_class NOT NULL,
  bind_class actp_bind_class NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
  bind_hash TEXT NOT NULL CHECK (char_length(bind_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE TABLE agent_actp_purpose_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  purpose_code TEXT NOT NULL,
  purpose_hash TEXT NOT NULL CHECK (char_length(purpose_hash) = 64),
  admission_class actp_admission_class NOT NULL,
  bind_class actp_bind_class NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
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
    REFERENCES agent_actp_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_actp_purpose_compile (account_id, compile_id)
);

CREATE TABLE agent_actp_purpose_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  compile_kind actp_compile_kind NOT NULL,
  admission_class actp_admission_class NOT NULL,
  receipt_class actp_receipt_class NOT NULL,
  bind_class actp_bind_class NOT NULL,
  freshness_class actp_freshness_class NOT NULL,
  effect_observation actp_effect_observation NOT NULL,
  attested_key_kind actp_key_kind NOT NULL,
  fact_disposition actp_fact_disposition NOT NULL,
  body_visibility actp_body_visibility NOT NULL,
  access_path actp_access_path NOT NULL,
  metadata_trust actp_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  bind_hash TEXT NOT NULL CHECK (char_length(bind_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_actp_purpose_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE TABLE agent_actp_tool_purpose_bind (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  bind_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class actp_admission_class NOT NULL,
  receipt_class actp_receipt_class NOT NULL,
  bind_class actp_bind_class NOT NULL,
  bind_reason actp_bind_reason NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation actp_effect_observation NOT NULL,
  attested_key_kind actp_key_kind NOT NULL,
  fact_disposition actp_fact_disposition NOT NULL,
  body_visibility actp_body_visibility NOT NULL,
  metadata_trust actp_metadata_trust NOT NULL,
  access_path actp_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action actp_next_action NOT NULL,
  bind_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, bind_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_actp_purpose_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_actp_recorded_receipt_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (bind_body ? 'factBody')),
  CHECK (NOT (bind_body ? 'fact_body')),
  CHECK (NOT (bind_body ? 'resolvedFactHash')),
  CHECK (
    (tool_authorized = true AND bind_class = 'AUTHORIZED'
      AND bind_body ? 'sealedCount'
      AND bind_body ? 'deniedCount'
      AND bind_body ? 'unknownEffectCount')
    OR (tool_authorized = false AND bind_class = 'NOT_AUTHORIZED'
      AND NOT (bind_body ? 'sealedCount')
      AND NOT (bind_body ? 'deniedCount')
      AND NOT (bind_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_actp_bind_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  bind_id UUID NOT NULL,
  purpose_code TEXT NOT NULL,
  bind_class actp_bind_class NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind actp_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action actp_next_action NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_actp_tool_purpose_bind (account_id, utc_day, consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_actp_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status actp_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_actp_purpose_certificate (account_id, certificate_id)
);

CREATE TABLE agent_actp_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE TABLE agent_actp_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind actp_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE TABLE agent_actp_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE TABLE agent_actp_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_actp_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_actp_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_actp_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_actp_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_actp_profile()
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
      IF current_setting('app.actp_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.actp_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_actp_profile_protect
BEFORE INSERT OR UPDATE ON agent_actp_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_profile();

CREATE FUNCTION protect_agent_actp_bind_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status actp_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_actp_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed bind rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_actp_bind_rule_protect
BEFORE UPDATE ON agent_actp_profile_bind_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_bind_rule();

CREATE FUNCTION protect_agent_actp_recorded_receipt_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed recorded receipt head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.receipt_body ? 'factBody'
     OR NEW.receipt_body ? 'fact_body'
     OR NEW.receipt_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.receipt_class = 'ACKNOWLEDGED' THEN
    IF NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.receipt_reason IS DISTINCT FROM 'ADMITTED_COUNT_READ_RECORDED'
       OR NEW.counts_acknowledged IS DISTINCT FROM TRUE
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.receipt_body ? 'sealedCount') THEN
      RAISE EXCEPTION 'acknowledged head must publish the sealed counts';
    END IF;
  ELSIF NEW.receipt_reason IS DISTINCT FROM 'COUNTS_NOT_ACKNOWLEDGED'
     OR NEW.counts_acknowledged
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.receipt_body ? 'sealedCount'
     OR NEW.receipt_body ? 'deniedCount'
     OR NEW.receipt_body ? 'unknownEffectCount' THEN
    RAISE EXCEPTION 'not-acknowledged head cannot carry counts';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT'
     AND NEW.lag_publications IS NOT NULL THEN
    RAISE EXCEPTION 'silence is not an acknowledged receipt';
  ELSIF NEW.admission_class = 'DENIED'
     AND (NEW.lag_publications IS NULL OR NEW.lag_publications <= NEW.max_lag_budget) THEN
    RAISE EXCEPTION 'denied head must sit above the lag budget';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_actp_recorded_receipt_head_protect
BEFORE INSERT OR UPDATE ON agent_actp_recorded_receipt_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_recorded_receipt_head();

CREATE FUNCTION protect_agent_actp_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.bind_hash IS DISTINCT FROM NEW.bind_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'tool purpose decision identity is immutable';
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
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.bind_class = 'AUTHORIZED' AND NEW.tool_authorized IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'authorized bind must grant the tool purpose';
  END IF;

  IF NEW.bind_class = 'NOT_AUTHORIZED' AND NEW.tool_authorized THEN
    RAISE EXCEPTION 'not-acknowledged receipt cannot authorize a tool';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_actp_decision_protect
BEFORE INSERT OR UPDATE ON agent_actp_purpose_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_decision();

CREATE FUNCTION protect_agent_actp_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.bind_steward_a = NEW.bind_steward_b
     OR NEW.consumer_principal_id IN (NEW.bind_steward_a, NEW.bind_steward_b)
     OR NEW.bind_steward_a IN (
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.bind_steward_b IN (
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.consumer_principal_id IN (
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
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

CREATE TRIGGER agent_actp_certificate_protect
BEFORE INSERT OR UPDATE ON agent_actp_purpose_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_certificate();

CREATE FUNCTION protect_agent_actp_effect_intent()
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

CREATE TRIGGER agent_actp_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_actp_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_effect_intent();

CREATE FUNCTION protect_agent_actp_tool_purpose_bind()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_bind$
DECLARE
  v_head agent_actp_recorded_receipt_head%ROWTYPE;
  v_allowed TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed tool purpose bind is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.bind_body ? 'factBody'
     OR NEW.bind_body ? 'fact_body'
     OR NEW.bind_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'tool purpose bind fence';
  END IF;

  IF NEW.purpose_code IS NULL OR NEW.purpose_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_actp_recorded_receipt_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded receipt head point lookup missed';
  END IF;

  SELECT p.allowed_purpose INTO v_allowed
  FROM agent_actp_session AS s
  JOIN agent_actp_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_allowed IS NULL OR NEW.purpose_code IS DISTINCT FROM v_allowed THEN
    RAISE EXCEPTION 'tool purpose is not the profile purpose';
  END IF;

  IF v_head.receipt_id IS DISTINCT FROM NEW.receipt_id
     OR v_head.admission_class IS DISTINCT FROM NEW.admission_class
     OR v_head.receipt_class IS DISTINCT FROM NEW.receipt_class THEN
    RAISE EXCEPTION 'bind drifted from the recorded receipt head';
  END IF;

  IF v_head.receipt_class IS DISTINCT FROM 'ACKNOWLEDGED' AND NEW.tool_authorized THEN
    RAISE EXCEPTION 'not-acknowledged receipt cannot authorize a tool';
  END IF;

  IF NEW.bind_class = 'AUTHORIZED' THEN
    IF v_head.receipt_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR v_head.receipt_reason IS DISTINCT FROM 'ADMITTED_COUNT_READ_RECORDED'
       OR v_head.counts_acknowledged IS DISTINCT FROM TRUE
       OR NEW.tool_authorized IS DISTINCT FROM TRUE
       OR NEW.bind_reason IS DISTINCT FROM 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND'
       OR NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.executes_tool THEN
      RAISE EXCEPTION 'authorized bind must copy the acknowledged counts';
    END IF;
  ELSIF NEW.tool_authorized
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.bind_reason IS DISTINCT FROM 'RECEIPT_CANNOT_AUTHORIZE_TOOL'
     OR NEW.bind_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not-acknowledged receipt cannot authorize a tool';
  END IF;

  IF v_head.admission_class = 'UNKNOWN_EFFECT' AND NEW.lag_publications IS NOT NULL THEN
    RAISE EXCEPTION 'silence is not a tool grant';
  END IF;

  RETURN NEW;
END
$protect_bind$;

CREATE TRIGGER agent_actp_tool_purpose_bind_protect
BEFORE INSERT OR UPDATE ON agent_actp_tool_purpose_bind
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_tool_purpose_bind();

CREATE FUNCTION protect_agent_actp_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed bind perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.bind_class = 'NOT_AUTHORIZED'
     AND (NEW.tool_authorized
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'unauthorized perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_actp_perception_protect
BEFORE INSERT OR UPDATE ON agent_actp_bind_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_actp_perception();

CREATE FUNCTION approve_agent_actp_profile(
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
  stored_status actp_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_actp_profile
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
  FROM agent_actp_profile_bind_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_bind IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control bind rule';
  END IF;

  PERFORM set_config(
    'app.actp_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_actp_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_actp_profile(
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
  stored_status actp_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_actp_profile
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
    'app.actp_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_actp_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_actp_receipt(
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
  v_session_status actp_session_status;
  v_profile_status actp_profile_status;
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
    FROM agent_actp_receipt_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one receipt per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_actp_session AS s
  JOIN agent_actp_profile AS pr
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

  INSERT INTO agent_actp_receipt_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION bind_agent_actp_tool_purpose(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_purpose_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_bind_id UUID,
  p_bind_digest TEXT,
  p_bind_steward_a TEXT,
  p_bind_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $bind_purpose$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status actp_session_status;
  v_profile_status actp_profile_status;
  v_allowed_purpose TEXT;
  v_principal TEXT;
  v_head agent_actp_recorded_receipt_head%ROWTYPE;
  v_bind_class actp_bind_class;
  v_reason actp_bind_reason;
  v_authorized BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next actp_next_action;
  v_terminal actp_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_purpose_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_bind_digest) <> 64 THEN
    RAISE EXCEPTION 'bind digest must be 64 hex characters';
  END IF;

  IF p_purpose_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_actp_receipt_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'tool purpose bind requires a nominated receipt point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_principal
  FROM agent_actp_session AS s
  JOIN agent_actp_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'bind requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_purpose_code IS DISTINCT FROM v_allowed_purpose THEN
    RAISE EXCEPTION 'tool purpose is not the profile purpose';
  END IF;

  SELECT * INTO v_head
  FROM agent_actp_recorded_receipt_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded receipt head point lookup missed';
  END IF;

  IF v_head.inlines_fact_body
     OR v_head.opens_nested_expiry
     OR v_head.ack_promoted_to_trust
     OR v_head.packet_scan_used
     OR v_head.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_head.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR v_head.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR v_head.body_visibility IS DISTINCT FROM 'OMITTED'
     OR v_head.receipt_body ? 'factBody'
     OR v_head.receipt_body ? 'fact_body'
     OR v_head.receipt_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'tool purpose bind fence';
  END IF;

  IF p_bind_steward_a = p_bind_steward_b
     OR p_consumer_principal IN (p_bind_steward_a, p_bind_steward_b)
     OR p_bind_steward_a IN (
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_bind_steward_b IN (
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_consumer_principal IN (
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
    FROM agent_actp_tool_purpose_bind
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'tool purpose bind already recorded';
  END IF;

  IF v_head.receipt_class = 'ACKNOWLEDGED'
     AND v_head.receipt_reason = 'ADMITTED_COUNT_READ_RECORDED'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.counts_acknowledged THEN
    v_bind_class := 'AUTHORIZED';
    v_reason := 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND';
    v_authorized := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'INVOKE_BOUND_PURPOSE';
    v_terminal := 'BIND_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT' THEN
    v_bind_class := 'NOT_AUTHORIZED';
    v_reason := 'RECEIPT_CANNOT_AUTHORIZE_TOOL';
    v_authorized := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_TOOL_PURPOSE';
    v_terminal := 'BIND_REFUSED';
  ELSE
    v_bind_class := 'NOT_AUTHORIZED';
    v_reason := 'RECEIPT_CANNOT_AUTHORIZE_TOOL';
    v_authorized := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_TOOL_PURPOSE';
    v_terminal := 'BIND_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'purposeCode', p_purpose_code,
    'admissionClass', v_head.admission_class,
    'receiptClass', v_head.receipt_class,
    'bindClass', v_bind_class,
    'bindReason', v_reason,
    'toolAuthorized', v_authorized,
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
  IF v_authorized THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_actp_receipt_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    receipt_id, admission_class, receipt_class, counts_acknowledged,
    bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    v_head.receipt_id, v_head.admission_class, v_head.receipt_class,
    v_head.counts_acknowledged, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_actp_purpose_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    purpose_code, admission_class, bind_class, tool_authorized, bind_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_purpose_code, v_head.admission_class, v_bind_class, v_authorized,
    p_bind_digest, clock_timestamp()
  );

  INSERT INTO agent_actp_purpose_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    utc_day, purpose_code, purpose_hash, admission_class, bind_class, tool_authorized,
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
    p_utc_day, p_purpose_code, p_bind_digest, v_head.admission_class, v_bind_class,
    v_authorized,
    p_bind_steward_a, p_bind_steward_b,
    v_head.receipt_steward_a, v_head.receipt_steward_b,
    v_head.card_steward_a, v_head.card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_actp_purpose_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, purpose_code, compile_kind, admission_class, receipt_class,
    bind_class, freshness_class, effect_observation, attested_key_kind, fact_disposition,
    body_visibility, access_path, metadata_trust, opens_nested_expiry,
    inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    tool_authorized, executes_tool, lag_publications, max_lag_budget, bind_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_purpose_code, 'BIND_RECEIPT_TOOL_PURPOSE',
    v_head.admission_class, v_head.receipt_class, v_bind_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_authorized, false, v_lag, v_head.max_lag_budget, p_bind_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_actp_tool_purpose_bind (
    account_id, utc_day, consumer_principal_id, bind_id, session_id,
    certificate_id, receipt_id, purpose_code, admission_class, receipt_class,
    bind_class, bind_reason, tool_authorized, sealed_count, denied_count,
    unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust,
    access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, executes_tool, trusted_next_action, bind_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_bind_id, p_session_id,
    p_certificate_id, v_head.receipt_id, p_purpose_code, v_head.admission_class,
    v_head.receipt_class, v_bind_class, v_reason, v_authorized, v_sealed, v_denied,
    v_unknown, v_lag, v_head.max_lag_budget, v_head.effect_observation,
    'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA',
    'POINT_LOOKUP', false, false, false, false, false, v_next, v_body,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_actp_bind_perception (
    account_id, utc_day, consumer_principal_id, bind_id, purpose_code, bind_class,
    tool_authorized, sealed_count, denied_count, unknown_effect_count,
    attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_bind_id, p_purpose_code,
    v_bind_class, v_authorized, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_actp_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_bind_id, p_session_id, 'BIND', 1, clock_timestamp()
  );

  INSERT INTO agent_actp_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_actp_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'TOOL_PURPOSE_BIND_SEALED',
    p_bind_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_actp_session
  SET consumed_bind_units = consumed_bind_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$bind_purpose$;

CREATE FUNCTION reject_agent_actp_unscoped_scan(
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

ALTER FUNCTION approve_agent_actp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_actp_profile_authority;
ALTER FUNCTION revoke_agent_actp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_actp_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_actp_profile_authority;
GRANT SELECT ON
  agent_actp_profile,
  agent_actp_profile_bind_rule
TO agent_actp_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_actp_profile TO agent_actp_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_actp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_actp_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_actp_profile FROM PUBLIC;

CREATE INDEX agent_actp_session_work_idx ON agent_actp_session (
  account_id,
  status
);
CREATE INDEX agent_actp_session_profile_idx ON agent_actp_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_actp_head_consumer_idx ON agent_actp_recorded_receipt_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_actp_nomination_session_idx ON agent_actp_receipt_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_actp_certificate_session_idx ON agent_actp_purpose_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_actp_decision_cert_idx ON agent_actp_purpose_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_actp_bind_consumer_idx ON agent_actp_tool_purpose_bind (
  account_id,
  consumer_principal_id,
  utc_day
);
CREATE INDEX agent_actp_bind_class_idx ON agent_actp_tool_purpose_bind (
  account_id,
  bind_class
);
CREATE INDEX agent_actp_perception_day_idx ON agent_actp_bind_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_actp_effect_work_idx ON agent_actp_effect_intent (
  account_id,
  session_id
);
CREATE INDEX agent_actp_audit_time_idx ON agent_actp_audit_event (
  account_id,
  created_at
);
CREATE INDEX agent_actp_command_expiry_idx ON agent_actp_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_actp_checkpoint_day_idx ON agent_actp_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_actp_binding_day_idx ON agent_actp_receipt_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_actp_authorization_evidence',
    'agent_actp_profile',
    'agent_actp_profile_bind_rule',
    'agent_actp_recorded_receipt_head',
    'agent_actp_session',
    'agent_actp_receipt_nomination',
    'agent_actp_receipt_binding',
    'agent_actp_purpose_compile',
    'agent_actp_purpose_certificate',
    'agent_actp_purpose_decision',
    'agent_actp_tool_purpose_bind',
    'agent_actp_bind_perception',
    'agent_actp_effect_intent',
    'agent_actp_budget_ledger',
    'agent_actp_terminal_record',
    'agent_actp_command_result',
    'agent_actp_audit_head',
    'agent_actp_audit_event',
    'agent_actp_audit_anchor',
    'agent_actp_projection_checkpoint'
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

Direct inserts that skip the bind function still pass through
the triggers. A grant on a `NOT_ACKNOWLEDGED` receipt, a
trusted key, a packet scan, a fact body, a tool execution
flag, or a nested expiry flag is rejected. The recorded
receipt head cannot be updated to launder a refused read
into a tool purpose.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum ActpAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum ActpReceiptClass {
  ACKNOWLEDGED
  NOT_ACKNOWLEDGED
}

enum ActpBindClass {
  AUTHORIZED
  NOT_AUTHORIZED
}

enum ActpBindReason {
  ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND
  RECEIPT_CANNOT_AUTHORIZE_TOOL
}

enum ActpNextAction {
  INVOKE_BOUND_PURPOSE
  STOP_TOOL_PURPOSE
  OMIT_TOOL_PURPOSE
}

enum ActpKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type ActpProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  allowedPurpose: String!
  procedureRef: String!
}

type ActpSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReceiptsPerSession: Int!
}

type ActpRecordedReceiptHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  receiptClass: ActpReceiptClass!
  countsAcknowledged: Boolean!
  attestedKeyKind: ActpKeyKind!
}

type ActpToolPurposeBind {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  bindId: ID!
  purposeCode: String!
  admissionClass: ActpAdmissionClass!
  receiptClass: ActpReceiptClass!
  bindClass: ActpBindClass!
  bindReason: ActpBindReason!
  toolAuthorized: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: ActpKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: ActpNextAction!
}

type ActpBindPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  purposeCode: String!
  toolAuthorized: Boolean!
  perceptionBody: JSON!
}

type ActpAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentActpProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): ActpProfile
  agentActpSession(accountId: ID!, sessionId: ID!): ActpSession
  agentActpRecordedReceiptHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): ActpRecordedReceiptHead
  agentActpToolPurposeBind(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): ActpToolPurposeBind
  agentActpBindPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): ActpBindPerception
  agentActpAuditEvents(accountId: ID!, utcDay: String!): [ActpAuditEvent!]!
}

type Mutation {
  createAgentActpProfile(accountId: ID!, profileId: ID!, definitionHash: String!): ActpProfile!
  approveAgentActpProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): ActpProfile!
  revokeAgentActpProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): ActpProfile!
  openAgentActpSession(accountId: ID!, sessionId: ID!, profileId: ID!): ActpSession!
  nominateAgentActpReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  bindAgentActpToolPurpose(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    purposeCode: String!
  ): ActpToolPurposeBind!
  appendAgentActpEffectIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentActpAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Receipt and bind reads also
take a non-null `utcDay` and `consumerPrincipalId`. The
schema has no list-all-receipts field and no field that
executes a tool. Resolvers must call
`reject_agent_actp_unscoped_scan` before planning when
either the account or the receipt key is missing. A bind
read is one primary-key lookup. It does not join a packet
catalog.

## 10. Procedural memory

The approved profile is the instruction the database will
follow. `procedure_ref` is
`proc:admitted-count-tool-purpose-bind`. The instruction
payload on the bind rule is deterministic JSON:

- point-look up one recorded receipt by
  `(account_id, utc_day, consumer_principal_id)`;
- authorize the single `allowed_purpose` only when the
  receipt reason is `ADMITTED_COUNT_READ_RECORDED`;
- otherwise seal `RECEIPT_CANNOT_AUTHORIZE_TOOL` with
  null counts;
- never execute the tool inside the bind;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version,
and the one purpose code. It may not rewrite the
instruction by chatting with the engine. Changing the
purpose is a new profile version that stays `DRAFT` until
the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash,
which covers the single purpose code. Queries must filter
`account_id` before topK. A global ANN index would mix
tenants and is rejected. The reference schema does not
build an HNSW index.

```sql
CREATE TABLE agent_actp_profile_embedding (
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
    REFERENCES agent_actp_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_actp_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actp_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_actp_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: an HNSW index belongs only inside an
-- account-partitioned segment. Never build one global ANN index
-- across tenants. Reference validation intentionally omits that DDL.
-- ANN queries must include account_id equality before topK.
-- Unscoped receipt or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one receipt, and binds that profile's
one purpose under dual control. Similarity never
authorizes a tool and never restores a fact.

## 12. Agent perception

The agent reads `agent_actp_bind_perception`, not the
steward columns on the recorded receipt head.

Metadata tags on an authorized perception:

- `grain:account_id,utc_day,consumer_principal_id`
- `bindClass:AUTHORIZED`
- `purposeCode:<the one profile purpose>`
- `toolAuthorized:true`
- `executesTool:false`
- `attestedKeyKind:AWAITING_CONFIRMATION`
- `ackPromotedToTrust:false`
- `accessPath:POINT_LOOKUP`
- `next:INVOKE_BOUND_PURPOSE`

`INVOKE_BOUND_PURPOSE` tells the agent which purpose was
granted. The database has not called it. A later effect
intent, outside this transaction, may attempt that one
purpose. The agent must not fan the grant out to other
tools and must not walk a board to discover more.

Metadata tags on an unauthorized perception:

- `bindClass:NOT_AUTHORIZED`
- `bindReason:RECEIPT_CANNOT_AUTHORIZE_TOOL`
- `toolAuthorized:false`
- `next:STOP_TOOL_PURPOSE` or `next:OMIT_TOOL_PURPOSE`

The perception body for a refused receipt has no
`sealedCount`, `deniedCount`, or `unknownEffectCount`.
An LLM that sees `NOT_AUTHORIZED` has no counts to cite
and must not call the tool. `NOT_ACKNOWLEDGED` receipts
cannot authorize a tool. `ACKED` on the parent receipt is
an effect observation. It is not enrollment and it is not
permission to open a nested expiry plane.

## 13. ACID and consistency

`bind_agent_actp_tool_purpose` writes the binding,
compile, certificate, decision, bind, perception, budget
debit, terminal row, and audit event in one transaction.
The recorded receipt head is not in the write set, so a
bind cannot change what the consumer acknowledged.
If any steward check or purpose check fails, the
transaction rolls back and no partial grant remains.

Idempotency is rejection, not upsert. A second bind for
the same `(account_id, utc_day, consumer_principal_id)`
raises `tool purpose bind already recorded`. Callers
point-look up the existing bind. They do not rewrite it
and they do not attach a second purpose.

Notify delivery stays outside this transaction. Provider
silence is `UNKNOWN_EFFECT` on the effect intent. That
status does not flip `tool_authorized` and does not
execute the tool.

## 14. Guardrails and neighbor protection

The bind function reads one recorded receipt head primary
key. It does not join a packet catalog, a board, or a
watermark range. `DAY_SCAN`, `WATERMARK_SCAN`, and
`PACKET_SCAN` fail closed. `executes_tool` fails closed
so this transaction cannot start a recursive query.

Budgets cap bind units per session. One nominated receipt
prevents a recursive agent from turning one purpose into
a walk of every reader on a 1M+ row board. A null day, a
null consumer, or a null purpose is **FULL SCAN REJECTED**
in the database, not only in the client. A purpose string
that contains a comma, a space, or a wildcard is rejected
because it is not a single purpose token.

Bind stewards are distinct from the consumer, so a single
principal cannot witness their own grant. They are also
distinct from the stewards who recorded the receipt, so
the receipt witness cannot mint the tool authorization.

This plane does not open another nested expiry. Refusal
is a row with `tool_authorized = false` and null counts,
not a new lifecycle of review and containment.

## 15. Performance check for boards with 1M+ rows

Safe access paths:

- `agent_actp_recorded_receipt_head` primary key
  `(account_id, utc_day, consumer_principal_id)`;
- `agent_actp_tool_purpose_bind` primary key
  `(account_id, utc_day, consumer_principal_id)`;
- `agent_actp_receipt_nomination` unique
  `(account_id, session_id)`.

**FULL SCAN REJECTED** before planning:

- a bind command with a null `utc_day`, a null consumer,
  or a null purpose;
- `DAY_SCAN`, `WATERMARK_SCAN`, or `PACKET_SCAN`;
- any predicate that lacks `account_id`;
- a request to recompute readers or tool runs from item
  rows, updates, or context packets on a board with 1M+
  rows;
- a request to execute the tool as part of the bind;
- an HNSW query that does not equality-filter
  `account_id` first.

The bind write is one index lookup plus a handful of
primary-key inserts. It does not rewrite the receipt
head, so it does not create a hot-row update on the
receipt. Neighbor tenants stay inside the 99.99%
availability budget because the governor drops the
unscoped plan.

## 16. Auditability and replay

Each bind appends `TOOL_PURPOSE_BIND_SEALED` with the
bind digest and a previous hash. The digest covers the
purpose code, the class, the reason, and, only when
authorized, the three counts. Replay calls
`projectToolPurposeBind` on the immutable head and checks
the purpose against the approved profile. If the
recomputed class, purpose, or counts differ from the
sealed bind, the audit anchor is withheld.

Denied and silent receipts replay to
`RECEIPT_CANNOT_AUTHORIZE_TOOL` with null counts even if
a steward later wishes the receipt had acknowledged
counts. The head update path is closed. Replay does not
call the tool and does not call a model.

## 17. Threat and failure analysis

- **Grant laundering.** A caller inserts an authorized
  bind on a `NOT_ACKNOWLEDGED` receipt, or copies
  non-null counts onto `NOT_AUTHORIZED`. The bind
  trigger rejects it. `NOT_ACKNOWLEDGED` receipts cannot
  authorize a tool.
- **Purpose fan-out.** A caller passes a second purpose,
  a comma-separated list, or a purpose other than
  `allowed_purpose`. The bind function rejects it. The
  primary key admits only one bind per receipt.
- **Trust inflation.** A caller sets `TRUSTED_ENROLLED`
  or `ack_promoted_to_trust` because the effect was
  `ACKED`. The decision trigger rejects it.
- **Fact restore.** A receipt export or bind body carries
  `factBody`. The head and bind triggers reject it.
- **Tool execution inside the seal.** `executes_tool`
  is rejected. The grant is data. The call is not.
- **Nested expiry.** `opens_nested_expiry` is rejected.
  This plane does not open another nested expiry.
- **Packet walk.** `PACKET_SCAN` is rejected as
  **FULL SCAN REJECTED**.
- **Steward collusion.** Reusing a receipt steward, or
  letting the consumer witness the bind, is rejected.
- **Head rewrite.** Updating class or counts on the
  recorded receipt head is rejected, so a bind cannot be
  justified after the fact by editing the receipt.
- **Duplicate grant.** A second bind for the same
  consumer and day is rejected. The first seal stands.
- **Cross-tenant read.** Forced row level security ties
  every policy to `app.account_id`.

## 18. Observability and SLOs

- Availability target: 99.99% for bind point lookups.
  Unscoped scans are rejected and do not consume neighbor
  CPU.
- Latency budget: one primary-key read and one
  primary-key write, excluding client time. Tool
  execution is outside this budget.
- Correctness SLO: 100% of `NOT_AUTHORIZED` binds have
  null counts and `tool_authorized = false`. 100% of
  `AUTHORIZED` binds match the acknowledged receipt
  counts and the profile's one purpose.
- Trust SLO: 0 binds with `TRUSTED_ENROLLED`,
  `ack_promoted_to_trust = true`, or `executes_tool = true`.
- Audit SLO: every sealed bind has one
  `TOOL_PURPOSE_BIND_SEALED` event.

Alerts fire when a planner would have chosen a sequential
scan, when an unauthorized perception contains a count
key, when a bind names more than one purpose, or when
bind latency leaves the point-lookup budget.

## 19. Rollout

1. Ship the schema and governor rejection dark, with no
   GraphQL exposure.
2. Export recorded receipt heads for one internal
   account. Confirm `NOT_ACKNOWLEDGED` exports cannot
   store counts.
3. Enable `bindAgentActpToolPurpose` for that account.
   Fixture: lag 3 budget 5 class `ADMITTED` counts 1/1/1
   binds `tool:cite-admitted-counts` as
   `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND`. Lag 8 budget 5
   class `DENIED` seals `RECEIPT_CANNOT_AUTHORIZE_TOOL`
   with null counts. Silence seals `OMIT_TOOL_PURPOSE`
   with a null lag. The receipt head lag on the admitted
   day stays 3.
4. Watch the trust SLO and the unauthorized-count SLO.
5. Open the perception read to agent runtimes. HNSW
   discovery stays non-authorizing. Runtimes must treat
   `INVOKE_BOUND_PURPOSE` as a grant for that one code,
   not as a completed call.
6. Do not record a tool-effect outcome in this rollout.
   That outcome is a separate contract.

Rollback is disablement of the mutation. Sealed binds
stay immutable. No nested expiry worker is deployed by
this plane, and no tool runner is deployed by this plane.

## 20. Ship criteria

- TypeScript projection compiles under strict settings.
- GraphQL schema builds with 6 queries and 8 mutations.
- PGlite applies the row store, forced tenant policies,
  and the pgvector profile table.
- Fixture acknowledged receipt authorizes
  `tool:cite-admitted-counts` with counts 1/1/1 and
  leaves the receipt head lag at 3.
- Fixture denied receipt and silent receipt store null
  counts and do not authorize a tool.
- Negative checks reject null-receipt nomination, a
  second receipt, trust promotion, fact-body inline,
  nested expiry, packet scan, steward reuse, a grant on
  a not-acknowledged receipt, head mutation, bind
  mutation, a profile inserted as approved, a duplicate
  bind, and an unscoped scan.
- `npm audit` reports no new dependency advisory that
  this validation toolchain must accept blindly. The
  engine path itself does not fetch model weights.

## 21. Product decision

Ship the tool-purpose bind as a deterministic point
lookup of an already recorded read receipt.

An acknowledged receipt can authorize one profile-named
purpose, once, with the three counts copied from that
receipt. The bind does not execute the tool. A denied or
silent receipt seals `RECEIPT_CANNOT_AUTHORIZE_TOOL` and
stores no counts. `NOT_ACKNOWLEDGED` receipts cannot
authorize a tool. `ACKED` remains an effect observation.
The key remains `AWAITING_CONFIRMATION`. The body remains
omitted. The recorded receipt head is not rewritten. The
plane does not scan context packets, does not inline a
fact body, does not promote `ACKED` to `TRUSTED_ENROLLED`,
and does not open another nested expiry.

The next increment should record one tool-effect outcome
for an already `AUTHORIZED` purpose bind by point lookup
of `(account_id, utc_day, consumer_principal_id)`. A
`NOT_AUTHORIZED` bind cannot record a successful tool
effect. The outcome must not scan context packets, must
not inline a fact body, must not promote `ACKED` to
`TRUSTED_ENROLLED`, and must not open another nested
expiry plane.
