# mondayDB Agentic Admitted Count Tool Effect Outcome Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-13.v1`

## 1. Why this plane, before how

The 2026-10-12 Admitted Count Tool Purpose Bind Plane seals
one purpose grant for one already recorded count-read
receipt. The grain is `(account_id, utc_day,
consumer_principal_id)`. An `AUTHORIZED` bind copies the
three acknowledged counts and names
`INVOKE_BOUND_PURPOSE`. A `NOT_AUTHORIZED` bind seals
`RECEIPT_CANNOT_AUTHORIZE_TOOL` with null counts. That
plane does not record whether the purpose produced an
effect.

Without this plane an agent either:

- treats `INVOKE_BOUND_PURPOSE` itself as a completed
  effect, or
- walks context packets, tool logs, or a board with 1M+
  rows to invent an outcome (neighbor-harmful, and a miss
  against the 99.99% availability target).

The product trade-off is **effect completeness versus
execution isolation**, and **record latency versus
outcome fan-out**:

- Completeness: a consumer whose bind is `AUTHORIZED`
  should be able to record exactly one tool-effect
  outcome that cites the three counts already on the
  bind, without opening the bind again.
- Isolation: the database does not execute the tool.
  Recording is a deterministic seal. A probabilistic
  agent stays outside the engine, so a slow or recursive
  tool cannot spend neighbor latency inside the ACID
  path.
- Least privilege: a `NOT_AUTHORIZED` bind cannot record
  a successful tool effect. One bind records at most one
  outcome. A second outcome is a new request, and this
  plane rejects it.
- The recorded bind head is not rewritten. Replay of the
  grant stays stable. The outcome is a new row that cites
  the bind by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This
  plane does not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the record is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one
primary-key write of that same grain. Consistency is the
sealed outcome plus the bind id it cites. Neighbor
availability stays at the 99.99% target because an
unscoped day walk, an effect list, or a packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved effect profile is procedural memory for
   "how one already sealed purpose bind becomes a single
   tool-effect outcome." The profile names exactly one
   effect code and the one purpose that code may cite. A
   profile never inlines a fact body, never rewrites
   `ACKED` as `TRUSTED_ENROLLED`, and never opens another
   nested expiry plane.
2. A session nominates exactly one bind key. The record
   then reads `agent_acte_recorded_bind_head` by
   `(account_id, utc_day, consumer_principal_id)`. It
   does not scan packets.
3. mondayDB records a successful effect only when the
   head is `AUTHORIZED`, the bind reason is
   `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND`, the next action
   is `INVOKE_BOUND_PURPOSE`, and the requested effect
   code equals the profile effect code. The copy of the
   three counts is equality with the bind. It does not
   call a model and it does not execute the tool.
4. `NOT_AUTHORIZED` seals
   `UNAUTHORIZED_BIND_CANNOT_SUCCEED` with
   `tool_effect_recorded = false` and null counts.
   Silence keeps a null lag. There is no successful
   effect.
5. Two effect stewards witness the outcome. They are
   distinct from the consumer, from the bind stewards,
   and from the receipt, card, admission, attestation,
   synopsis, and publication stewards.
6. Unscoped bind or board scans are **FULL SCAN REJECTED**
   before planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session recorded the
  nomination and the outcome?
- Was the outcome a point lookup of an already sealed
  bind, and what class did that bind have?
- Did an `AUTHORIZED` bind record exactly one effect and
  seal `AUTHORIZED_PURPOSE_EFFECT_RECORDED` with the
  three granted counts?
- Did a `NOT_AUTHORIZED` bind stay unsuccessful, with
  null counts and `UNAUTHORIZED_BIND_CANNOT_SUCCEED`?
- Did `ACKED` stay an effect observation while the key
  stayed `AWAITING_CONFIRMATION` and the body stayed
  omitted?
- Did the recorded bind head keep the class and counts
  it was exported with?
- Can the outcome be replayed without invoking an LLM,
  and without executing the tool?

HNSW profile discovery stays account-scoped and never
records this outcome.

## 2. Scope and ownership

The Admitted Count Tool Effect Outcome Plane owns:

1. Immutable approved effect profiles as procedural
   memory, each naming one effect code for one purpose.
2. Tenant-scoped effect sessions with a hard cap of one
   nominated bind.
3. Deterministic nomination of that bind, then one point
   lookup of the recorded bind head.
4. A tool-effect outcome keyed by
   `(account_id, utc_day, consumer_principal_id)`.
5. An agent perception row that carries counts only when
   `tool_effect_recorded` is true.
6. Audit events that cite the outcome hash.

It integrates with, but does not replace:

- **Admitted Count Tool Purpose Bind Plane:** supplies
  the sealed bind this plane reads. Exporters copy the
  bind class, the bind reason, the counts the bind
  actually granted, the next action, and the stewards
  onto `agent_acte_recorded_bind_head`. This plane does
  not re-bind the purpose, does not recover withheld
  counts, and does not promote `ACKED` to
  `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate,
  record, vector, and notify units. A refused bind is a
  sealed non-effect, not a scan of the packet log. The
  record does not run the tool.

### Non-goals

- Letting an LLM choose which effect a bind may record.
- Executing the tool, or compiling a board query, inside
  `record_agent_acte_tool_effect`.
- Recording any effect code other than the single code
  on the approved profile.
- Copying counts onto an outcome whose bind is
  `NOT_AUTHORIZED`.
- Rewriting the recorded bind head so a refused grant
  becomes a successful effect.
- Recomputing tool runs by scanning a board, a packet
  log, or a citation ledger.
- Cross-account outcomes or global nearest-neighbor
  recording.
- Storing raw private keys, tool payloads, packet
  bodies, or fact bodies on the outcome.
- Promoting `AWAITING_CONFIRMATION` to
  `TRUSTED_ENROLLED` because the bind effect was
  `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this outcome.
- Publishing a separate provider receipt for the
  recorded effect. That is the next plane, and only for
  an already `RECORDED` outcome.

## 3. Product contract

### 3.1 Effect profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the bind must
  already carry (one token, no list);
- the single `allowed_effect_code` this plane may
  record (one token, no list);
- allowed admission classes the exporter may present
  (`ADMITTED`, `DENIED`, `UNKNOWN_EFFECT`);
- effect threshold (distinct effect stewards, minimum
  2), max binds per session (exactly 1), and max
  nominated binds (exactly 1);
- effect policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `RECORD_NEVER_EXECUTES_TOOL`,
  `RECORD_NEVER_INLINES_BODY`, `RECORD_NEVER_CONFIRMS`,
  `ONE_BIND_PER_SESSION`, `ONE_EFFECT_PER_BIND`,
  `POINT_LOOKUP_ONLY`, `RECORDED_BIND_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `RECORD_ONLY_WHEN_AUTHORIZED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PUBLISH`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest outcome
reason is `AUTHORIZED_PURPOSE_EFFECT_RECORDED` (34
bytes). The longest refusal reason is
`UNAUTHORIZED_BIND_CANNOT_SUCCEED` (32 bytes).

Approval and revocation require the authority fence
`approve_agent_acte_profile` /
`revoke_agent_acte_profile`, owned by
`agent_acte_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
record, vector, and notify units, plus wall time.
`max_binds_per_session` and `max_nominated_binds` are
both exactly 1. A second bind nomination in the same
session is rejected before it can fan out into a
recursive tool walk.

The session principal is the only consumer that session
may record. An outcome for a different principal is
rejected.

### 3.3 Recorded bind head and nomination contract

Upstream bind export writes one recorded bind head per
`(account_id, utc_day, consumer_principal_id)`. The head
copy includes `bind_class`, `bind_reason`,
`tool_authorized`, `trusted_next_action`, the three
counts when they were granted, and the stewards. It does
not include a fact body and it does not include withheld
counts. The head is immutable. This plane does not
advance it and does not reclassify it.

`nominate_agent_acte_bind(account_id, session_id,
utc_day, consumer_principal_id, nomination_id,
nomination_hash)` nominates that bind. A null `utc_day`,
a null `account_id`, a null consumer, or a null effect
code is **FULL SCAN REJECTED**. The access path is
`POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` are rejected.

### 3.4 Tool effect outcome contract

`record_agent_acte_tool_effect` is the only compile that
writes a tool-effect outcome. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one recorded bind head for that key, with
  `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`,
  `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and
  `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `effect_code` equal to the profile's
  `allowed_effect_code`, and `purpose_code` equal to
  the head purpose and the profile purpose, each
  matching `^[a-z0-9:_-]{1,64}$` (one token, not a list
  and not a query);
- a consumer principal equal to the session principal,
  distinct from both effect stewards, and distinct from
  every bind, receipt, card, admission, attestation,
  synopsis, and publication steward;
- effect stewards distinct from each other and from
  those same upstream stewards.

The grain is `(account_id, utc_day, consumer_principal_id)`.
That grain holds one outcome. Projection is:

- `RECORDED` when the head bind class is `AUTHORIZED`,
  the bind reason is `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND`,
  `tool_authorized` is true, and the next action is
  `INVOKE_BOUND_PURPOSE`. The outcome copies
  `sealed_count`, `denied_count`, and
  `unknown_effect_count`. `tool_effect_recorded` is
  true. `outcome_reason` is
  `AUTHORIZED_PURPOSE_EFFECT_RECORDED`.
  `trusted_next_action` is `CITE_RECORDED_EFFECT`. The
  action names the citation. It does not run the tool
  and it does not inline a fact body.
- `NOT_RECORDED` when the head bind class is
  `NOT_AUTHORIZED` and the next action is
  `STOP_TOOL_PURPOSE`. Counts stay null.
  `outcome_reason` is `UNAUTHORIZED_BIND_CANNOT_SUCCEED`.
  `tool_effect_recorded` is false.
  `trusted_next_action` is `STOP_EFFECT_RECORD`. The
  denied lag is copied and is not cleared.
- `NOT_RECORDED` when the head admission class is
  `UNKNOWN_EFFECT` or the next action is
  `OMIT_TOOL_PURPOSE`. Counts stay null. The outcome lag
  stays null. `outcome_reason` is
  `UNAUTHORIZED_BIND_CANNOT_SUCCEED`.
  `tool_effect_recorded` is false.
  `trusted_next_action` is `OMIT_EFFECT_RECORD`.

A `NOT_AUTHORIZED` bind cannot record a successful tool
effect. `outcome_body` rejects `factBody`, `fact_body`,
and `resolvedFactHash`. `ACKED` is copied as
`effect_observation` when the head observed it. It does
not write `TRUSTED_ENROLLED`. The recorded bind head is
not updated. A second outcome for the same consumer and
day is rejected. A forged recorded outcome whose counts
differ from the head is rejected. A forged recorded
outcome on a `NOT_AUTHORIZED` head is rejected. A forged
non-record that carries any count, or that sets
`tool_effect_recorded`, is rejected. An effect code
other than the profile code is rejected before a row is
sealed, so the caller can retry the one allowed code. A
null effect code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_acte_effect_perception`
for the agent. Counts appear there only when
`tool_effect_recorded` is true. The perception names
`effect_code` and whether the effect was recorded.
Effect intents start as `PREPARED`. Provider silence
stays `UNKNOWN_EFFECT`. An acknowledgement of the notify
is not enrollment, not a fact restore, not a tool
execution, and not a second outcome. This plane does not
open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant
   index leads with `account_id`. Row level security is
   forced.
2. A null `utc_day`, a null consumer, a null effect
   code, or a null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one bind. The access path is
   `POINT_LOOKUP`. One bind records one effect.
4. The recorded bind head is immutable. The outcome does
   not rewrite it.
5. A successful tool effect is recorded only from an
   `AUTHORIZED` head whose bind reason is
   `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND` and whose next
   action is `INVOKE_BOUND_PURPOSE`, and only for the
   profile's single effect code.
6. `NOT_AUTHORIZED` outcomes store null counts and
   `tool_effect_recorded = false`. Silence stores a null
   lag. A `NOT_AUTHORIZED` bind cannot record a
   successful tool effect.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`,
   `packet_scan_used`, and `executes_tool` stay false.
   The outcome does not execute the tool.
9. Effect stewards, the consumer, bind stewards, and
   upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never
    records an effect.
11. The engine does not call a model. Replay is a pure
    function of the recorded bind head, the consumer
    id, and the profile effect code.

## 5. Execution model

```text
approved profile (one allowed_effect_code)
  -> open session (one bind budget)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read recorded bind head by primary key
  -> project RECORDED or NOT_RECORDED
  -> append outcome + perception + audit
  -> leave the bind head unchanged
  -> do not execute the tool
```

Compile kind is `RECORD_AUTHORIZED_TOOL_EFFECT` for both
outcomes. The class on the outcome, not a second plane,
distinguishes a recorded effect from a refusal. Notify
dispatch is a later effect intent and may remain
`UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose and one effect
   code, and add one dual-control effect rule.
2. Approve it through `agent_acte_profile_authority`.
3. Export one recorded bind head per consumer and day.
   The export is a point copy of the purpose bind, not a
   packet walk.
4. Open a session and nominate one bind key.
5. Record the profile effect. Authorized binds copy the
   counts and seal `AUTHORIZED_PURPOSE_EFFECT_RECORDED`.
   Other binds seal a non-effect with null counts.
6. The agent reads the perception row. A withheld
   perception has no count fields and
   `toolEffectRecorded: false`.
7. Revocation stops a later session from nominating. It
   does not rewrite outcomes already sealed.
8. This plane does not open another nested expiry. It
   does not run the tool.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type OutcomeId = string;
export type UtcDay = string;
export type EffectCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type BindClass = "AUTHORIZED" | "NOT_AUTHORIZED";
export type BindReason =
  | "ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND"
  | "RECEIPT_CANNOT_AUTHORIZE_TOOL";
export type BindNextAction =
  | "INVOKE_BOUND_PURPOSE"
  | "STOP_TOOL_PURPOSE"
  | "OMIT_TOOL_PURPOSE";
export type OutcomeClass = "RECORDED" | "NOT_RECORDED";
export type OutcomeReason =
  | "AUTHORIZED_PURPOSE_EFFECT_RECORDED"
  | "UNAUTHORIZED_BIND_CANNOT_SUCCEED";
export type OutcomeNextAction =
  | "CITE_RECORDED_EFFECT"
  | "STOP_EFFECT_RECORD"
  | "OMIT_EFFECT_RECORD";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const EFFECT_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface RecordedBindHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly admissionClass: AdmissionClass;
  readonly bindClass: BindClass;
  readonly bindReason: BindReason;
  readonly toolAuthorized: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: BindNextAction;
}

export interface ToolEffectOutcome {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly outcomeId: OutcomeId;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: EffectCode;
  readonly admissionClass: AdmissionClass;
  readonly bindClass: BindClass;
  readonly outcomeClass: OutcomeClass;
  readonly outcomeReason: OutcomeReason;
  readonly toolEffectRecorded: boolean;
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
  readonly trustedNextAction: OutcomeNextAction;
}

export function projectToolEffectOutcome(
  head: RecordedBindHead,
  outcomeId: OutcomeId,
  effectCode: EffectCode,
): ToolEffectOutcome {
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    outcomeId,
    consumerPrincipalId: head.consumerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode,
    admissionClass: head.admissionClass,
    bindClass: head.bindClass,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleEffect = EFFECT_TOKEN.test(effectCode);

  if (
    singleEffect &&
    head.bindClass === "AUTHORIZED" &&
    head.bindReason === "ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND" &&
    head.toolAuthorized &&
    head.trustedNextAction === "INVOKE_BOUND_PURPOSE" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      outcomeClass: "RECORDED",
      outcomeReason: "AUTHORIZED_PURPOSE_EFFECT_RECORDED",
      toolEffectRecorded: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "CITE_RECORDED_EFFECT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_TOOL_PURPOSE";

  return {
    ...shared,
    outcomeClass: "NOT_RECORDED",
    outcomeReason: "UNAUTHORIZED_BIND_CANNOT_SUCCEED",
    toolEffectRecorded: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_EFFECT_RECORD" : "STOP_EFFECT_RECORD",
  };
}
```

```ts
export function perceptionOmitsSuccessfulEffect(outcome: ToolEffectOutcome): boolean {
  return (
    outcome.toolEffectRecorded === false &&
    outcome.outcomeClass === "NOT_RECORDED" &&
    outcome.sealedCount === null &&
    outcome.deniedCount === null &&
    outcome.unknownEffectCount === null &&
    outcome.ackPromotedToTrust === false &&
    outcome.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    outcome.executesTool === false
  );
}
```

`projectToolEffectOutcome` is the procedural projection
an agent runtime must match. It never returns
`TRUSTED_ENROLLED`. It never copies counts off a
`NOT_AUTHORIZED` bind. It never executes the tool. An
effect token that is not a single code projects to
`NOT_RECORDED`. The database additionally requires the
token to equal the approved profile effect code before
it seals `RECORDED`.

## 8. SQL row-store schema

```sql
CREATE TYPE acte_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acte_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE acte_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acte_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acte_bind_class AS ENUM ('AUTHORIZED', 'NOT_AUTHORIZED');
CREATE TYPE acte_bind_reason AS ENUM (
  'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND',
  'RECEIPT_CANNOT_AUTHORIZE_TOOL'
);
CREATE TYPE acte_bind_next_action AS ENUM (
  'INVOKE_BOUND_PURPOSE',
  'STOP_TOOL_PURPOSE',
  'OMIT_TOOL_PURPOSE'
);
CREATE TYPE acte_outcome_class AS ENUM ('RECORDED', 'NOT_RECORDED');
CREATE TYPE acte_outcome_reason AS ENUM (
  'AUTHORIZED_PURPOSE_EFFECT_RECORDED',
  'UNAUTHORIZED_BIND_CANNOT_SUCCEED'
);
CREATE TYPE acte_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE acte_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE acte_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE acte_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acte_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE acte_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acte_effect_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE acte_compile_kind AS ENUM ('RECORD_AUTHORIZED_TOOL_EFFECT');
CREATE TYPE acte_terminal_kind AS ENUM (
  'EFFECT_RECORDED',
  'EFFECT_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE acte_next_action AS ENUM (
  'CITE_RECORDED_EFFECT',
  'STOP_EFFECT_RECORD',
  'OMIT_EFFECT_RECORD'
);
CREATE TYPE acte_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_PUBLISH',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_acte_profile_authority NOLOGIN;

CREATE TABLE agent_acte_authorization_evidence (
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

CREATE TABLE agent_acte_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status acte_profile_status NOT NULL,
  definition_hash TEXT NOT NULL CHECK (char_length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash TEXT,
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash TEXT NOT NULL CHECK (char_length(authorization_snapshot_hash) = 64),
  allowed_purpose TEXT NOT NULL CHECK (allowed_purpose ~ '^[a-z0-9:_-]{1,64}$'),
  allowed_effect_code TEXT NOT NULL CHECK (allowed_effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_threshold INTEGER NOT NULL CHECK (effect_threshold >= 2),
  max_binds_per_session INTEGER NOT NULL CHECK (max_binds_per_session = 1),
  max_nominated_binds INTEGER NOT NULL CHECK (max_nominated_binds = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy acte_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acte_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acte_profile_effect_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes acte_admission_class[] NOT NULL,
  effect_threshold INTEGER NOT NULL CHECK (effect_threshold >= 2),
  max_binds_per_session INTEGER NOT NULL CHECK (max_binds_per_session = 1),
  max_nominated_binds INTEGER NOT NULL CHECK (max_nominated_binds = 1),
  require_dual_control_effect BOOLEAN NOT NULL,
  effect_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acte_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_acte_recorded_bind_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  bind_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acte_admission_class NOT NULL,
  receipt_class TEXT NOT NULL,
  bind_class acte_bind_class NOT NULL,
  bind_reason acte_bind_reason NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
  freshness_class acte_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acte_effect_observation NOT NULL,
  attested_key_kind acte_key_kind NOT NULL,
  fact_disposition acte_fact_disposition NOT NULL,
  body_visibility acte_body_visibility NOT NULL,
  metadata_trust acte_metadata_trust NOT NULL,
  access_path acte_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acte_bind_next_action NOT NULL,
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
  bind_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, bind_id),
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
  CHECK (NOT (bind_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acte_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acte_session_status NOT NULL,
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
  effect_threshold INTEGER NOT NULL,
  max_binds_per_session INTEGER NOT NULL CHECK (max_binds_per_session = 1),
  max_nominated_binds INTEGER NOT NULL CHECK (max_nominated_binds = 1),
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
    REFERENCES agent_acte_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acte_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_acte_bind_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path acte_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE TABLE agent_acte_bind_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  bind_id UUID NOT NULL,
  admission_class acte_admission_class NOT NULL,
  bind_class acte_bind_class NOT NULL,
  tool_authorized BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acte_recorded_bind_head (account_id, utc_day, consumer_principal_id)
);

CREATE TABLE agent_acte_effect_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  effect_code TEXT NOT NULL,
  admission_class acte_admission_class NOT NULL,
  outcome_class acte_outcome_class NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
  outcome_hash TEXT NOT NULL CHECK (char_length(outcome_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE TABLE agent_acte_effect_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  effect_code TEXT NOT NULL,
  effect_hash TEXT NOT NULL CHECK (char_length(effect_hash) = 64),
  admission_class acte_admission_class NOT NULL,
  outcome_class acte_outcome_class NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
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
    REFERENCES agent_acte_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acte_effect_compile (account_id, compile_id)
);

CREATE TABLE agent_acte_effect_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  effect_code TEXT NOT NULL,
  compile_kind acte_compile_kind NOT NULL,
  admission_class acte_admission_class NOT NULL,
  bind_class acte_bind_class NOT NULL,
  outcome_class acte_outcome_class NOT NULL,
  freshness_class acte_freshness_class NOT NULL,
  effect_observation acte_effect_observation NOT NULL,
  attested_key_kind acte_key_kind NOT NULL,
  fact_disposition acte_fact_disposition NOT NULL,
  body_visibility acte_body_visibility NOT NULL,
  access_path acte_access_path NOT NULL,
  metadata_trust acte_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  outcome_hash TEXT NOT NULL CHECK (char_length(outcome_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acte_effect_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE TABLE agent_acte_tool_effect_outcome (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  outcome_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  bind_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class acte_admission_class NOT NULL,
  bind_class acte_bind_class NOT NULL,
  outcome_class acte_outcome_class NOT NULL,
  outcome_reason acte_outcome_reason NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acte_effect_observation NOT NULL,
  attested_key_kind acte_key_kind NOT NULL,
  fact_disposition acte_fact_disposition NOT NULL,
  body_visibility acte_body_visibility NOT NULL,
  metadata_trust acte_metadata_trust NOT NULL,
  access_path acte_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action acte_next_action NOT NULL,
  effect_steward_a TEXT NOT NULL,
  effect_steward_b TEXT NOT NULL,
  outcome_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, outcome_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acte_effect_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acte_recorded_bind_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (outcome_body ? 'factBody')),
  CHECK (NOT (outcome_body ? 'fact_body')),
  CHECK (NOT (outcome_body ? 'resolvedFactHash')),
  CHECK (
    (tool_effect_recorded = true AND outcome_class = 'RECORDED'
      AND trusted_next_action = 'CITE_RECORDED_EFFECT'
      AND outcome_body ? 'sealedCount'
      AND outcome_body ? 'deniedCount'
      AND outcome_body ? 'unknownEffectCount')
    OR (tool_effect_recorded = false AND outcome_class = 'NOT_RECORDED'
      AND trusted_next_action IN ('STOP_EFFECT_RECORD', 'OMIT_EFFECT_RECORD')
      AND NOT (outcome_body ? 'sealedCount')
      AND NOT (outcome_body ? 'deniedCount')
      AND NOT (outcome_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_acte_effect_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  outcome_id UUID NOT NULL,
  effect_code TEXT NOT NULL,
  outcome_class acte_outcome_class NOT NULL,
  tool_effect_recorded BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind acte_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action acte_next_action NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_acte_tool_effect_outcome (account_id, utc_day, consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_acte_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acte_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acte_effect_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acte_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE TABLE agent_acte_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind acte_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE TABLE agent_acte_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE TABLE agent_acte_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_acte_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acte_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acte_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acte_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_acte_profile()
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
      IF current_setting('app.acte_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acte_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acte_profile_protect
BEFORE INSERT OR UPDATE ON agent_acte_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_profile();

CREATE FUNCTION protect_agent_acte_effect_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acte_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acte_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed effect rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acte_effect_rule_protect
BEFORE UPDATE ON agent_acte_profile_effect_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_effect_rule();

CREATE FUNCTION protect_agent_acte_recorded_bind_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed recorded bind head is immutable';
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
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.bind_class = 'AUTHORIZED' THEN
    IF NEW.tool_authorized IS DISTINCT FROM TRUE
       OR NEW.bind_reason IS DISTINCT FROM 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND'
       OR NEW.trusted_next_action IS DISTINCT FROM 'INVOKE_BOUND_PURPOSE'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.receipt_class IS DISTINCT FROM 'ACKNOWLEDGED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.bind_body ? 'sealedCount') THEN
      RAISE EXCEPTION 'authorized bind head must carry the granted counts';
    END IF;
  ELSIF NEW.tool_authorized
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.bind_reason IS DISTINCT FROM 'RECEIPT_CANNOT_AUTHORIZE_TOOL'
     OR NEW.bind_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'unauthorized bind head cannot carry a tool grant';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_TOOL_PURPOSE' THEN
      RAISE EXCEPTION 'silence is not a recorded tool effect';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_TOOL_PURPOSE' THEN
      RAISE EXCEPTION 'denied bind head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'bind head class is not recordable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acte_recorded_bind_head_protect
BEFORE INSERT OR UPDATE ON agent_acte_recorded_bind_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_recorded_bind_head();

CREATE FUNCTION protect_agent_acte_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.outcome_hash IS DISTINCT FROM NEW.outcome_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'tool effect decision identity is immutable';
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

  IF NEW.outcome_class = 'RECORDED' AND NEW.tool_effect_recorded IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'recorded effect must copy the authorized counts';
  END IF;

  IF NEW.outcome_class = 'NOT_RECORDED' AND NEW.tool_effect_recorded THEN
    RAISE EXCEPTION 'unauthorized bind cannot record a successful tool effect';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acte_decision_protect
BEFORE INSERT OR UPDATE ON agent_acte_effect_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_decision();

CREATE FUNCTION protect_agent_acte_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.effect_steward_a = NEW.effect_steward_b
     OR NEW.consumer_principal_id IN (NEW.effect_steward_a, NEW.effect_steward_b)
     OR NEW.effect_steward_a IN (
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.effect_steward_b IN (
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.consumer_principal_id IN (
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
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

CREATE TRIGGER agent_acte_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acte_effect_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_certificate();

CREATE FUNCTION protect_agent_acte_effect_intent()
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

CREATE TRIGGER agent_acte_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_acte_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_effect_intent();

CREATE FUNCTION protect_agent_acte_tool_effect_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_outcome$
DECLARE
  v_head agent_acte_recorded_bind_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed tool effect outcome is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.outcome_body ? 'factBody'
     OR NEW.outcome_body ? 'fact_body'
     OR NEW.outcome_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'tool effect outcome fence';
  END IF;

  IF NEW.effect_code IS NULL OR NEW.effect_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_acte_recorded_bind_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded bind head point lookup missed';
  END IF;

  IF NEW.outcome_class = 'RECORDED' OR NEW.tool_effect_recorded THEN
    IF v_head.bind_class IS DISTINCT FROM 'AUTHORIZED'
       OR v_head.tool_authorized IS DISTINCT FROM TRUE
       OR v_head.bind_reason IS DISTINCT FROM 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND'
       OR v_head.trusted_next_action IS DISTINCT FROM 'INVOKE_BOUND_PURPOSE' THEN
      RAISE EXCEPTION 'unauthorized bind cannot record a successful tool effect';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.outcome_reason IS DISTINCT FROM 'AUTHORIZED_PURPOSE_EFFECT_RECORDED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'CITE_RECORDED_EFFECT'
       OR NEW.bind_id IS DISTINCT FROM v_head.bind_id THEN
      RAISE EXCEPTION 'recorded effect must copy the authorized counts';
    END IF;
  ELSE
    IF v_head.bind_class IS DISTINCT FROM 'NOT_AUTHORIZED' OR v_head.tool_authorized THEN
      RAISE EXCEPTION 'authorized bind must record the granted counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.outcome_body ? 'sealedCount'
       OR NEW.tool_effect_recorded
       OR NEW.outcome_reason IS DISTINCT FROM 'UNAUTHORIZED_BIND_CANNOT_SUCCEED' THEN
      RAISE EXCEPTION 'unauthorized outcome cannot carry counts';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_TOOL_PURPOSE' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_EFFECT_RECORD' THEN
        RAISE EXCEPTION 'silence cannot record a tool effect';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_EFFECT_RECORD'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused effect must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose
    INTO v_effect, v_purpose
  FROM agent_acte_session AS s
  JOIN agent_acte_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_effect IS NULL
     OR NEW.effect_code IS DISTINCT FROM v_effect
     OR NEW.purpose_code IS DISTINCT FROM v_purpose
     OR NEW.purpose_code IS DISTINCT FROM v_head.purpose_code THEN
    RAISE EXCEPTION 'effect code is not the profile effect';
  END IF;

  RETURN NEW;
END
$protect_outcome$;

CREATE TRIGGER agent_acte_tool_effect_outcome_protect
BEFORE INSERT OR UPDATE ON agent_acte_tool_effect_outcome
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_tool_effect_outcome();

CREATE FUNCTION protect_agent_acte_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed effect perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.outcome_class = 'NOT_RECORDED'
     AND (NEW.tool_effect_recorded
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'unauthorized perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_acte_perception_protect
BEFORE INSERT OR UPDATE ON agent_acte_effect_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_acte_perception();

CREATE FUNCTION approve_agent_acte_profile(
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
  stored_status acte_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acte_profile
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
  FROM agent_acte_profile_effect_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_effect IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control effect rule';
  END IF;

  PERFORM set_config(
    'app.acte_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acte_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acte_profile(
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
  stored_status acte_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acte_profile
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
    'app.acte_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acte_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acte_bind(
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
  v_session_status acte_session_status;
  v_profile_status acte_profile_status;
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
    FROM agent_acte_bind_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one bind per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_acte_session AS s
  JOIN agent_acte_profile AS pr
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

  INSERT INTO agent_acte_bind_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION record_agent_acte_tool_effect(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_effect_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_outcome_id UUID,
  p_outcome_digest TEXT,
  p_effect_steward_a TEXT,
  p_effect_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $record_effect$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status acte_session_status;
  v_profile_status acte_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_principal TEXT;
  v_head agent_acte_recorded_bind_head%ROWTYPE;
  v_class acte_outcome_class;
  v_reason acte_outcome_reason;
  v_recorded BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acte_next_action;
  v_terminal acte_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_effect_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_outcome_digest) <> 64 THEN
    RAISE EXCEPTION 'outcome digest must be 64 hex characters';
  END IF;

  IF p_effect_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_acte_bind_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'tool effect record requires a nominated bind point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect, v_principal
  FROM agent_acte_session AS s
  JOIN agent_acte_profile AS pr
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

  IF p_effect_code IS DISTINCT FROM v_allowed_effect THEN
    RAISE EXCEPTION 'effect code is not the profile effect';
  END IF;

  SELECT * INTO v_head
  FROM agent_acte_recorded_bind_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recorded bind head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose THEN
    RAISE EXCEPTION 'bind purpose is not the profile purpose';
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
     OR v_head.bind_body ? 'factBody'
     OR v_head.bind_body ? 'fact_body'
     OR v_head.bind_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'tool effect record fence';
  END IF;

  IF p_effect_steward_a = p_effect_steward_b
     OR p_consumer_principal IN (p_effect_steward_a, p_effect_steward_b)
     OR p_effect_steward_a IN (
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_effect_steward_b IN (
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_consumer_principal IN (
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
    FROM agent_acte_tool_effect_outcome
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'tool effect outcome already recorded';
  END IF;

  IF v_head.bind_class = 'AUTHORIZED'
     AND v_head.bind_reason = 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND'
     AND v_head.tool_authorized
     AND v_head.trusted_next_action = 'INVOKE_BOUND_PURPOSE'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.receipt_class = 'ACKNOWLEDGED' THEN
    v_class := 'RECORDED';
    v_reason := 'AUTHORIZED_PURPOSE_EFFECT_RECORDED';
    v_recorded := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'CITE_RECORDED_EFFECT';
    v_terminal := 'EFFECT_RECORDED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_TOOL_PURPOSE' THEN
    v_class := 'NOT_RECORDED';
    v_reason := 'UNAUTHORIZED_BIND_CANNOT_SUCCEED';
    v_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_EFFECT_RECORD';
    v_terminal := 'EFFECT_REFUSED';
  ELSE
    v_class := 'NOT_RECORDED';
    v_reason := 'UNAUTHORIZED_BIND_CANNOT_SUCCEED';
    v_recorded := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_EFFECT_RECORD';
    v_terminal := 'EFFECT_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'purposeCode', v_head.purpose_code,
    'effectCode', p_effect_code,
    'admissionClass', v_head.admission_class,
    'bindClass', v_head.bind_class,
    'outcomeClass', v_class,
    'outcomeReason', v_reason,
    'toolEffectRecorded', v_recorded,
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

  INSERT INTO agent_acte_bind_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    bind_id, admission_class, bind_class, tool_authorized, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    v_head.bind_id, v_head.admission_class, v_head.bind_class,
    v_head.tool_authorized, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acte_effect_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    effect_code, admission_class, outcome_class, tool_effect_recorded,
    outcome_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_effect_code, v_head.admission_class, v_class, v_recorded,
    p_outcome_digest, clock_timestamp()
  );

  INSERT INTO agent_acte_effect_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    utc_day, effect_code, effect_hash, admission_class, outcome_class,
    tool_effect_recorded, effect_steward_a, effect_steward_b,
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
    p_utc_day, p_effect_code, p_outcome_digest, v_head.admission_class, v_class,
    v_recorded, p_effect_steward_a, p_effect_steward_b,
    v_head.bind_steward_a, v_head.bind_steward_b,
    v_head.receipt_steward_a, v_head.receipt_steward_b,
    v_head.card_steward_a, v_head.card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acte_effect_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, effect_code, compile_kind, admission_class, bind_class,
    outcome_class, freshness_class, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    tool_effect_recorded, executes_tool, lag_publications, max_lag_budget, outcome_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_effect_code, 'RECORD_AUTHORIZED_TOOL_EFFECT',
    v_head.admission_class, v_head.bind_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_recorded, false, v_lag, v_head.max_lag_budget, p_outcome_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acte_tool_effect_outcome (
    account_id, utc_day, consumer_principal_id, outcome_id, session_id,
    certificate_id, bind_id, purpose_code, effect_code, admission_class, bind_class,
    outcome_class, outcome_reason, tool_effect_recorded, sealed_count, denied_count,
    unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust,
    access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, executes_tool, trusted_next_action, effect_steward_a,
    effect_steward_b, outcome_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_outcome_id, p_session_id,
    p_certificate_id, v_head.bind_id, v_head.purpose_code, p_effect_code,
    v_head.admission_class, v_head.bind_class, v_class, v_reason, v_recorded,
    v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false, v_next,
    p_effect_steward_a, p_effect_steward_b, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acte_effect_perception (
    account_id, utc_day, consumer_principal_id, outcome_id, effect_code, outcome_class,
    tool_effect_recorded, sealed_count, denied_count, unknown_effect_count,
    attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_outcome_id, p_effect_code,
    v_class, v_recorded, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_acte_effect_intent (
    account_id, effect_id, session_id, certificate_id, intent_status,
    provider_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_outcome_id, p_session_id, p_certificate_id, 'PREPARED',
    p_outcome_id::TEXT, 1, p_outcome_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acte_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_outcome_id, p_session_id, 'RECORD', 1, clock_timestamp()
  );

  INSERT INTO agent_acte_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_acte_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'TOOL_EFFECT_OUTCOME_SEALED',
    p_outcome_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_acte_session
  SET consumed_record_units = consumed_record_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$record_effect$;

CREATE FUNCTION reject_agent_acte_unscoped_scan(
  has_account BOOLEAN,
  has_bind_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_bind_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_acte_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acte_profile_authority;
ALTER FUNCTION revoke_agent_acte_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acte_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acte_profile_authority;
GRANT SELECT ON
  agent_acte_profile,
  agent_acte_profile_effect_rule
TO agent_acte_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acte_profile TO agent_acte_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acte_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acte_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acte_profile FROM PUBLIC;

CREATE INDEX agent_acte_session_work_idx ON agent_acte_session (
  account_id,
  status
);
CREATE INDEX agent_acte_session_profile_idx ON agent_acte_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_acte_head_consumer_idx ON agent_acte_recorded_bind_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_acte_nomination_session_idx ON agent_acte_bind_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_acte_certificate_session_idx ON agent_acte_effect_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_acte_decision_cert_idx ON agent_acte_effect_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_acte_outcome_consumer_idx ON agent_acte_tool_effect_outcome (
  account_id,
  consumer_principal_id,
  utc_day
);
CREATE INDEX agent_acte_outcome_class_idx ON agent_acte_tool_effect_outcome (
  account_id,
  outcome_class
);
CREATE INDEX agent_acte_perception_day_idx ON agent_acte_effect_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_acte_effect_work_idx ON agent_acte_effect_intent (
  account_id,
  session_id
);
CREATE INDEX agent_acte_audit_time_idx ON agent_acte_audit_event (
  account_id,
  created_at
);
CREATE INDEX agent_acte_command_expiry_idx ON agent_acte_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_acte_checkpoint_day_idx ON agent_acte_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_acte_binding_day_idx ON agent_acte_bind_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_acte_authorization_evidence',
    'agent_acte_profile',
    'agent_acte_profile_effect_rule',
    'agent_acte_recorded_bind_head',
    'agent_acte_session',
    'agent_acte_bind_nomination',
    'agent_acte_bind_binding',
    'agent_acte_effect_compile',
    'agent_acte_effect_certificate',
    'agent_acte_effect_decision',
    'agent_acte_tool_effect_outcome',
    'agent_acte_effect_perception',
    'agent_acte_effect_intent',
    'agent_acte_budget_ledger',
    'agent_acte_terminal_record',
    'agent_acte_command_result',
    'agent_acte_audit_head',
    'agent_acte_audit_event',
    'agent_acte_audit_anchor',
    'agent_acte_projection_checkpoint'
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
through the triggers. A successful effect on a
`NOT_AUTHORIZED` bind, a trusted key, a packet scan, a
fact body, a tool execution flag, or a nested expiry flag
is rejected. The recorded bind head cannot be updated to
launder a refused grant into a tool effect.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum ActeAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum ActeBindClass {
  AUTHORIZED
  NOT_AUTHORIZED
}

enum ActeOutcomeClass {
  RECORDED
  NOT_RECORDED
}

enum ActeOutcomeReason {
  AUTHORIZED_PURPOSE_EFFECT_RECORDED
  UNAUTHORIZED_BIND_CANNOT_SUCCEED
}

enum ActeNextAction {
  CITE_RECORDED_EFFECT
  STOP_EFFECT_RECORD
  OMIT_EFFECT_RECORD
}

enum ActeKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type ActeProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  allowedPurpose: String!
  allowedEffectCode: String!
  procedureRef: String!
}

type ActeSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxBindsPerSession: Int!
}

type ActeRecordedBindHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  bindClass: ActeBindClass!
  toolAuthorized: Boolean!
  attestedKeyKind: ActeKeyKind!
}

type ActeToolEffectOutcome {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  outcomeId: ID!
  purposeCode: String!
  effectCode: String!
  admissionClass: ActeAdmissionClass!
  bindClass: ActeBindClass!
  outcomeClass: ActeOutcomeClass!
  outcomeReason: ActeOutcomeReason!
  toolEffectRecorded: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: ActeKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: ActeNextAction!
}

type ActeEffectPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  effectCode: String!
  toolEffectRecorded: Boolean!
  perceptionBody: JSON!
}

type ActeAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentActeProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): ActeProfile
  agentActeSession(accountId: ID!, sessionId: ID!): ActeSession
  agentActeRecordedBindHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): ActeRecordedBindHead
  agentActeToolEffectOutcome(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): ActeToolEffectOutcome
  agentActeEffectPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): ActeEffectPerception
  agentActeAuditEvents(accountId: ID!, utcDay: String!): [ActeAuditEvent!]!
}

type Mutation {
  createAgentActeProfile(accountId: ID!, profileId: ID!, definitionHash: String!): ActeProfile!
  approveAgentActeProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): ActeProfile!
  revokeAgentActeProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): ActeProfile!
  openAgentActeSession(accountId: ID!, sessionId: ID!, profileId: ID!): ActeSession!
  nominateAgentActeBind(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  recordAgentActeToolEffect(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    effectCode: String!
  ): ActeToolEffectOutcome!
  appendAgentActeEffectIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentActeAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Bind and outcome reads
also take a non-null `utcDay` and `consumerPrincipalId`.
The schema has no list-all-binds field and no field that
executes a tool. Resolvers must call
`reject_agent_acte_unscoped_scan` before planning when
either the account or the bind key is missing. An
outcome read is one primary-key lookup. It does not join
a packet catalog.

## 10. Procedural memory

The approved profile is the instruction the database will
follow. `procedure_ref` is
`proc:admitted-count-tool-effect-outcome`. The
instruction payload on the effect rule is deterministic
JSON:

- point-look up one recorded bind by
  `(account_id, utc_day, consumer_principal_id)`;
- record the single `allowed_effect_code` only when the
  bind reason is `ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND`
  and the next action is `INVOKE_BOUND_PURPOSE`;
- otherwise seal `UNAUTHORIZED_BIND_CANNOT_SUCCEED`
  with null counts;
- never execute the tool inside the record;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version,
and the one effect code. It may not rewrite the
instruction by chatting with the engine. Changing the
effect code is a new profile version that stays `DRAFT`
until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash,
which covers the single effect code. Queries must filter
`account_id` before topK. A global ANN index would mix
tenants and is rejected. The reference schema does not
build an HNSW index.

```sql
CREATE TABLE agent_acte_profile_embedding (
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
    REFERENCES agent_acte_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acte_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acte_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acte_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens
a session, nominates one bind, and records that
profile's one effect code under dual control. Similarity
never records an effect and never restores a fact.

## 12. Agent perception

The agent reads `agent_acte_effect_perception`, not the
steward columns on the recorded bind head.

Metadata tags on a recorded perception:

- `grain:account_id,utc_day,consumer_principal_id`
- `outcomeClass:RECORDED`
- `effectCode:<the one profile effect>`
- `toolEffectRecorded:true`
- `executesTool:false`
- `attestedKeyKind:AWAITING_CONFIRMATION`
- `ackPromotedToTrust:false`
- `accessPath:POINT_LOOKUP`
- `next:CITE_RECORDED_EFFECT`

`CITE_RECORDED_EFFECT` tells the agent which effect was
sealed. The database has not called the tool again. A
later provider receipt, outside this transaction, may
attest that one effect. The agent must not fan the
outcome out to other tools, other days, or a board scan.

A `NOT_RECORDED` perception omits `sealedCount`,
`deniedCount`, and `unknownEffectCount`. Tags are
`toolEffectRecorded:false` and either
`next:STOP_EFFECT_RECORD` or `next:OMIT_EFFECT_RECORD`.
The agent must treat those tags as absence of an effect.
It must not fill the counts from memory, from a packet,
or from a model.

## 13. ACID and consistency

The record function writes the binding, compile,
certificate, decision, outcome, perception, intent,
ledger, terminal, and audit event in one transaction.
The bind head is read and not updated. A crash before
commit leaves no outcome. A commit is the only durable
record of the effect.

Consistency choice: the outcome is sealed at the bind's
counts. It does not wait for a later columnar refresh
and it does not recompute the counts. Stale analytics
cannot change a sealed effect. The hybrid row store owns
the transaction. Columnar storage may later project the
outcome for aggregation, but only by the same primary
key, and only after the row commit.

`UNKNOWN_EFFECT` on the parent admission stays a
non-record with a null lag. Silence is not rewritten
into a successful effect to make a dashboard look
complete.

## 14. Guardrails and neighbor protection

- One bind per session. A second nomination is rejected.
- One effect per bind. A second record is rejected.
- `executes_tool` is forced false. The ACID path cannot
  call out to a tool.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are
  rejected access paths.
- Null account, day, consumer, or effect code is
  **FULL SCAN REJECTED** before planning.
- Effect stewards cannot be the consumer or any upstream
  steward, so one principal cannot witness its own
  effect.
- Notify intents start `PREPARED`. Provider silence
  stays `UNKNOWN_EFFECT` and does not enroll the key.
- This plane does not open another nested expiry.

These guards keep a recursive agent from turning one
admitted-count citation into a board-sized walk that
would miss the 99.99% availability target for neighbors.

## 15. Performance check for boards with 1M+ rows

The hot path is a primary-key read and a primary-key
write on `(account_id, utc_day, consumer_principal_id)`.
It does not filter a board, a packet log, or an effect
history. Indexes that serve sessions, certificates, and
audit reads all lead with `account_id`.

A planner that sees a missing account or a missing bind
key must call `reject_agent_acte_unscoped_scan` and stop.
That is **FULL SCAN REJECTED**. It is not a sequential
scan with a later `account_id` predicate. Boards with
1M+ rows are not inputs to this plane.

HNSW, when a deployment adds it inside an
account-partitioned segment, ranks profiles only. It is
not on the record path. The reference schema omits the
index so a global ANN scan cannot leak across tenants.

## 16. Auditability and replay

Each record appends `agent_acte_audit_event` with the
outcome digest and a previous hash. The event kind is
`TOOL_EFFECT_OUTCOME_SEALED`. Anchors are a separate
mutation and do not rewrite the outcome. Replay reads
the recorded bind head and the profile effect code and
re-runs `projectToolEffectOutcome`. The engine does not
call a model. The same head and the same effect code
always produce the same class, the same counts, and the
same next action.

## 17. Threat and failure analysis

- A caller who sets `RECORDED` on a `NOT_AUTHORIZED`
  head is rejected. The refusal cannot be laundered
  into a success.
- A caller who copies different counts than the bind
  head is rejected. The effect cannot invent a larger
  citation.
- A caller who inlines `factBody` is rejected. The body
  stays omitted.
- A caller who sets `TRUSTED_ENROLLED` or
  `ack_promoted_to_trust` is rejected. `ACKED` stays an
  observation.
- A caller who sets `PACKET_SCAN` or `executes_tool` is
  rejected. The record does not walk packets and does
  not run the tool.
- A caller who reuses a bind steward as an effect
  steward is rejected.
- A caller who updates a sealed head or a sealed
  outcome is rejected.
- A caller who inserts a profile as `APPROVED` is
  rejected. Approval goes through the authority fence.
- Cross-tenant rows fail the forced `account_id`
  policy.

## 18. Observability and SLOs

- Record latency target: one primary-key read plus one
  primary-key write, p99 under 20 ms inside the tenant
  partition. This budget excludes tool execution, which
  is outside the database.
- Availability target: 99.99% for neighbor queries.
  Rejected scans must not become background work.
- Correctness counters: `recorded_effects`,
  `refused_effects`, `full_scan_rejected`,
  `unauthorized_success_rejected`,
  `fact_body_rejected`.
- A refused effect is a successful seal of
  `NOT_RECORDED`, not an error budget burn, unless the
  function itself fails.
- `UNKNOWN_EFFECT` seals are counted separately from
  `DENIED` so silence is visible.

## 19. Rollout

1. Ship the schema and the record function dark, behind
   the profile authority role.
2. Export recorded bind heads for one internal account
   by primary key. Do not backfill from a board scan.
3. Approve one profile whose effect code is
   `effect:cited-admitted-counts` and whose purpose is
   `tool:cite-admitted-counts`.
4. Record outcomes for that account. Compare the sealed
   counts to the bind head.
5. Enable the GraphQL mutations for that account.
6. Expand account by account. Revocation stops new
   sessions and leaves sealed outcomes in place.

No step opens another nested expiry plane.

## 20. Ship criteria

- `npm run validate` passes TypeScript strict compile,
  GraphQL schema build (6 queries, 8 mutations), and
  PGlite plus pgvector DDL execution.
- Fixture: lag 3, budget 5, class `AUTHORIZED`, counts
  1/1/1, effect `effect:cited-admitted-counts` recorded;
  lag 8, budget 5, class `NOT_AUTHORIZED` with counts
  omitted and the bind head lag still 8; silence class
  `UNKNOWN_EFFECT` with null lag and null counts.
- A `NOT_AUTHORIZED` bind cannot record a successful
  tool effect.
- The outcome does not scan context packets, does not
  inline a fact body, does not promote `ACKED` to
  `TRUSTED_ENROLLED`, does not execute the tool, and
  does not open another nested expiry.
- Every table and tenant index leads with `account_id`.
- `npm audit` reports no vulnerabilities for this
  package's direct dependency tree at ship time.

## 21. Product decision

Ship the Admitted Count Tool Effect Outcome Plane as the
deterministic record of one tool effect for one already
sealed purpose bind. The database seals the outcome. It
does not run the tool. Agents perceive a single
perception row keyed by account, UTC day, and consumer.
`CITE_RECORDED_EFFECT` is a citation handle.
`STOP_EFFECT_RECORD` and `OMIT_EFFECT_RECORD` are
refusals. Neither handle is permission to scan a board.

The next increment should record one provider receipt
for an already `RECORDED` tool effect by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A
`NOT_RECORDED` outcome cannot receive a successful
provider receipt. The receipt must not scan context
packets, must not inline a fact body, must not promote
`ACKED` to `TRUSTED_ENROLLED`, must not execute the
tool, and must not open another nested expiry plane.
