# mondayDB Agentic Admitted Count Card Synopsis Plane

Contract `2026-10-26.v1`. Prefix `accs`. This plane publishes one
columnar daily synopsis of already sealed ack-hold cards. It does not
seal another acknowledgement, hold, receipt, or expiry. Reviewed
2026-10-28 without a version bump: awaiting freshness is the
unprojected card count on the day counter, not a new watermark.
Reviewed 2026-10-29 without a version bump. The sealed increment on
that counter is the card-insert trigger, one card at a time. Publish,
projection, and card insert share one tenant-day advisory lock from
the counter read through the synopsis write.

## 1. Why this plane, before how

An agent that wants to know how the day went can do one of three
things. It can open every ack-hold card, which grants it the card
reader's view and copies observation counts it does not need. It can
ask the engine to aggregate a board, which becomes a full table scan
once that board passes 1M rows and steals latency from neighboring
tenants. Or it can read three counters that were folded, one card at a
time, into a columnar segment keyed by `(account_id, utc_day, bucket)`.

The product choice is latency over live completeness. The publish path
is a primary-key read of the day counter and the three tally rows. It
stays a blink-of-an-eye lookup while cards are still arriving, and it
answers `AWAITING_PROJECTION` instead of scanning the cards that have
not been folded. A day whose sealed-card counter exceeds the profile
budget publishes no tallies at all. A partial fold must not look like
the day. After a `COMPLETE` publish, the day is frozen: a late card is
rejected rather than rewriting a tally an agent has already read.

The row store keeps each sealed card immutable and transactional. The
columnar segment keeps at most three narrow rows per tenant-day. The
engine stays deterministic. The agent may be probabilistic. The
database does not call a model, does not execute a tool, and does not
invent a bucket.

Availability stays on the card-seal path. A failed or lagging
projection does not take the row store down. The synopsis is derived
state. That is how this read path can target 99.99% availability for
board traffic while still refusing an unbounded analytical scan.

## 2. Scope and ownership

The source grain is the ack-hold card head
`(account_id, utc_day, consumer_principal_id)` already sealed by the
ack-hold card plane. This plane reads that head by primary key. It
does not rewrite it, does not join the hold head, and does not reopen
`HOLD_ACKNOWLEDGED_RECEIPT`. That next action remains on the hold. By
the time a card is `HOLD_PERCEIVED`, the hold plane has already
required it.

Synopsis stewards are `principal:accs-a` and `principal:accs-b`. They
are not `principal:rah-a`, `principal:rah-b`, `principal:ahc-a`, or
`principal:ahc-b`, and they are not the card reader. The published
synopsis does not carry `reader_principal_id` or a consumer list.

### Non-goals

- No second reader of a sealed card.
- No fact body, context packet, or board row in this schema.
- No tool execution and no provider call.
- No nested expiry plane.
- No promotion of `ACKED` to `TRUSTED_ENROLLED`.
- No cross-tenant index and no global HNSW index.
- No model call inside the engine.

## 3. Product contract

### 3.1 What is counted

The synopsis counts cards, not the historical 1/1/1 observation
triple. Each sealed card folds into exactly one bucket.

| Card shape | Bucket |
| --- | --- |
| `hold_card_recorded`, `HOLD_PERCEIVED`, `ACK_HELD_HOLD_PERCEIVED`, `PERCEIVE_ACK_HELD_HOLD`, `ACK_HELD`, `ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD`, effect `ACKED` | `ADMITTED` |
| `STOP_ACK_HOLD_CARD` or `NOT_HOLD_PERCEIVED` that is not an omit | `REFUSED` |
| `OMIT_ACK_HOLD_CARD` or effect `UNKNOWN_EFFECT` | `OMITTED` |

`UNKNOWN_EFFECT` is an omit. It is not a refused card and not an
admitted card. `NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD` and
`NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE` stay on the source card. They are
not re-sealed here. A shape the table cannot store is rejected before
a tally moves.

### 3.2 Publication

Publish reads the day counter. It does not `COUNT` the card table.

- `sealed_card_count > max_cards_per_day` seals `REFUSED_OVER_BUDGET`,
  `NOT_PUBLISHED`, `DAY_OVER_CARD_BUDGET`, next action
  `STOP_CARD_DAY_SYNOPSIS`, null tallies.
- Otherwise, if `projected_count` differs from `sealed_card_count`,
  the row is `AWAITING_PROJECTION`, `NOT_PUBLISHED`,
  `PROJECTION_INCOMPLETE`, next action `AWAIT_CARD_PROJECTION`, null
  tallies. Partial columnar counters stay off the agent read.
- Otherwise the row is `COMPLETE`, `PUBLISHED`, `SEALED_CARDS_TALLIED`,
  next action `READ_CARD_DAY_SYNOPSIS`, and the three tallies sum to
  `sealed_card_count`. A day with no cards publishes zeros.

`max_cards_per_day` is greater than 0 and less than 1,000,000. The
budget cannot be widened into a million-row fold.

### 3.3 Replay

Projecting the same card again returns the original bucket and does
not increment a tally or a session budget. Publishing a `COMPLETE` day
again returns the same digest. A `REFUSED_OVER_BUDGET` day may refresh
its sealed-card count and digest, and it may not grow tallies or
become `COMPLETE`.

## 4. Deterministic invariants

Classification is a pure function of the card columns. The same card
always yields the same bucket. The digest is MD5 of the canonical
string `account_id|utc_day|profile_id|profile_version|completeness|admitted|refused|omitted|sealed`,
with null tallies written as `null`. No clock and no model output
enters the digest.

The plane does not open another nested expiry. `opens_nested_expiry`
is stored only so a true value can be rejected. `executes_tool`,
`inlines_fact_body`, `packet_scan_used`, and `ack_promoted_to_trust`
are rejected the same way. `attested_key_kind` stays
`AWAITING_CONFIRMATION`. `TRUSTED_ENROLLED` is rejected.
`body_visibility` is `OMITTED`. Metadata tags are
`UNTRUSTED_METADATA`: they describe the row, they do not authorize it.

A card whose reader or consumer is `principal:accs-a` or
`principal:accs-b` is not projected. That collision would make a
synopsis steward a second reader of the card.

## 5. Execution model

1. Upstream inserts one immutable sealed card. The insert takes the
   tenant-day advisory lock, then increments
   `agent_accs_day_counter.sealed_card_count` by 1. It does not scan
   siblings.
2. `project_agent_accs_card` takes that same lock, point-looks up that
   card, appends one ledger row, and adds 1 to one columnar bucket.
3. `publish_agent_accs_day_synopsis` takes that same lock, point-looks
   up the counter, and, only when the day is complete, copies the three
   tallies onto the synopsis row.
4. `read_agent_accs_rollup` returns those synopsis tallies only when
   the synopsis is `COMPLETE`. It does not read the card table.

There is no recursive CTE, no join, and no board iterator. A plan
whose estimated board cardinality is 1,000,000 or greater, or which
arrives without an account key and a day key, is `FULL SCAN REJECTED`.

## 6. Lifecycle

Profiles start `DRAFT` and become `APPROVED` only when the definition
hash matches. Approved budgets, stewards, and the procedure ref are
immutable. A session copies the budget at open. Projection consumes
one budget unit per new card. The ledger is insert-only. A `COMPLETE`
synopsis rejects later cards for that tenant-day with
`SYNOPSIS ALREADY SEALED`. The next day is a new key.

## 7. TypeScript contracts

```ts
export const FULL_SCAN_ROW_THRESHOLD = 1_000_000;

export type SynopsisBucket = "ADMITTED" | "REFUSED" | "OMITTED";

export interface SealedAckHoldCardHead {
  accountId: string;
  utcDay: string;
  consumerPrincipalId: string;
  ackHoldCardId: string;
  holdCardClass: "HOLD_PERCEIVED" | "NOT_HOLD_PERCEIVED";
  holdCardReason:
    | "ACK_HELD_HOLD_PERCEIVED"
    | "NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE";
  holdCardRecorded: boolean;
  trustedNextAction:
    | "PERCEIVE_ACK_HELD_HOLD"
    | "STOP_ACK_HOLD_CARD"
    | "OMIT_ACK_HOLD_CARD";
  ackHoldClass: "ACK_HELD" | "NOT_ACK_HELD";
  ackHoldReason:
    | "ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD"
    | "NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD";
  ackHoldRecorded: boolean;
  effectObservation: "ACKED" | "UNKNOWN_EFFECT";
  attestedKeyKind: "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";
  inlinesFactBody: boolean;
  executesTool: boolean;
  opensNestedExpiry: boolean;
  packetScanUsed: boolean;
  ackPromotedToTrust: boolean;
  readerPrincipalId: string;
}

export function classifySealedCard(
  card: SealedAckHoldCardHead,
): SynopsisBucket | "REJECT" {
  if (
    card.inlinesFactBody ||
    card.executesTool ||
    card.opensNestedExpiry ||
    card.packetScanUsed ||
    card.ackPromotedToTrust ||
    card.attestedKeyKind === "TRUSTED_ENROLLED"
  ) {
    return "REJECT";
  }
  if (
    card.holdCardRecorded &&
    card.holdCardClass === "HOLD_PERCEIVED" &&
    card.holdCardReason === "ACK_HELD_HOLD_PERCEIVED" &&
    card.trustedNextAction === "PERCEIVE_ACK_HELD_HOLD" &&
    card.ackHoldRecorded &&
    card.ackHoldClass === "ACK_HELD" &&
    card.ackHoldReason === "ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD" &&
    card.effectObservation === "ACKED"
  ) {
    return "ADMITTED";
  }
  if (
    card.trustedNextAction === "OMIT_ACK_HOLD_CARD" ||
    card.effectObservation === "UNKNOWN_EFFECT"
  ) {
    return "OMITTED";
  }
  if (
    card.trustedNextAction === "STOP_ACK_HOLD_CARD" ||
    card.holdCardClass === "NOT_HOLD_PERCEIVED"
  ) {
    return "REFUSED";
  }
  return "REJECT";
}

export interface DayFold {
  sealedCardCount: number;
  projectedCount: number;
  maxCardsPerDay: number;
  admittedTally: number;
  refusedTally: number;
  omittedTally: number;
}

export interface SynopsisDecision {
  completeness: "COMPLETE" | "REFUSED_OVER_BUDGET" | "AWAITING_PROJECTION";
  synopsisClass: "PUBLISHED" | "NOT_PUBLISHED";
  reason:
    | "SEALED_CARDS_TALLIED"
    | "DAY_OVER_CARD_BUDGET"
    | "PROJECTION_INCOMPLETE";
  nextAction:
    | "READ_CARD_DAY_SYNOPSIS"
    | "STOP_CARD_DAY_SYNOPSIS"
    | "AWAIT_CARD_PROJECTION";
  admittedTally: number | null;
  refusedTally: number | null;
  omittedTally: number | null;
}

export function decideSynopsis(fold: DayFold): SynopsisDecision {
  if (fold.maxCardsPerDay >= FULL_SCAN_ROW_THRESHOLD) {
    throw new Error("FULL SCAN REJECTED");
  }
  if (fold.sealedCardCount > fold.maxCardsPerDay) {
    return {
      completeness: "REFUSED_OVER_BUDGET",
      synopsisClass: "NOT_PUBLISHED",
      reason: "DAY_OVER_CARD_BUDGET",
      nextAction: "STOP_CARD_DAY_SYNOPSIS",
      admittedTally: null,
      refusedTally: null,
      omittedTally: null,
    };
  }
  if (fold.projectedCount !== fold.sealedCardCount) {
    return {
      completeness: "AWAITING_PROJECTION",
      synopsisClass: "NOT_PUBLISHED",
      reason: "PROJECTION_INCOMPLETE",
      nextAction: "AWAIT_CARD_PROJECTION",
      admittedTally: null,
      refusedTally: null,
      omittedTally: null,
    };
  }
  if (
    fold.admittedTally + fold.refusedTally + fold.omittedTally !==
    fold.sealedCardCount
  ) {
    throw new Error("SYNOPSIS DRIFT REJECTED");
  }
  return {
    completeness: "COMPLETE",
    synopsisClass: "PUBLISHED",
    reason: "SEALED_CARDS_TALLIED",
    nextAction: "READ_CARD_DAY_SYNOPSIS",
    admittedTally: fold.admittedTally,
    refusedTally: fold.refusedTally,
    omittedTally: fold.omittedTally,
  };
}
```

```ts
export interface AgentSynopsisPerception {
  accountId: string;
  utcDay: string;
  admittedTally: number | null;
  refusedTally: number | null;
  omittedTally: number | null;
  completeness: SynopsisDecision["completeness"];
  synopsisClass: SynopsisDecision["synopsisClass"];
  nextAction: SynopsisDecision["nextAction"];
  bodyVisibility: "OMITTED";
  secondReaderPrincipalId: null;
  executesTool: false;
  inlinesFactBody: false;
  opensNestedExpiry: false;
  accessPath: "COLUMN_PRUNE";
  proceduralMemoryRef: "procedure:fold-admitted-count-card-day";
  semanticTags: [
    "plane:admitted-count-card-synopsis",
    "grain:account-day",
    "tallies:admitted-refused-omitted",
  ];
  metadataTrust: "UNTRUSTED_METADATA";
}

export function perceiveSynopsis(
  decision: SynopsisDecision,
  scope: { accountId: string; utcDay: string },
): AgentSynopsisPerception {
  return {
    accountId: scope.accountId,
    utcDay: scope.utcDay,
    admittedTally: decision.admittedTally,
    refusedTally: decision.refusedTally,
    omittedTally: decision.omittedTally,
    completeness: decision.completeness,
    synopsisClass: decision.synopsisClass,
    nextAction: decision.nextAction,
    bodyVisibility: "OMITTED",
    secondReaderPrincipalId: null,
    executesTool: false,
    inlinesFactBody: false,
    opensNestedExpiry: false,
    accessPath: "COLUMN_PRUNE",
    proceduralMemoryRef: "procedure:fold-admitted-count-card-day",
    semanticTags: [
      "plane:admitted-count-card-synopsis",
      "grain:account-day",
      "tallies:admitted-refused-omitted",
    ],
    metadataTrust: "UNTRUSTED_METADATA",
  };
}

export function rejectUnscopedBoardScan(input: {
  accountId: string;
  utcDay: string;
  boardRowEstimate: number;
}): "FULL SCAN REJECTED" | "COLUMN_PRUNE" {
  if (
    input.accountId.length === 0 ||
    input.utcDay.length === 0 ||
    input.boardRowEstimate >= FULL_SCAN_ROW_THRESHOLD
  ) {
    return "FULL SCAN REJECTED";
  }
  return "COLUMN_PRUNE";
}
```

An agent perceives `AgentSynopsisPerception`. The TypeScript classifier
is the contract twin of `project_agent_accs_card`. It does not return
`readerPrincipalId`. `perceiveSynopsis` copies tallies only from a
`SynopsisDecision`, so an awaiting or refused day cannot leak a
partial columnar count into the perception card.

## 8. SQL row and columnar schema

The card table is the row store. `agent_accs_day_column` is the
columnar segment: one row per bucket, at most three per tenant-day.
`agent_accs_day_counter` is the O(1) cardinality gate. The reference
check executes this schema, including `accs_bucket` and
`publish_agent_accs_day_synopsis`, as one database session.

```sql
CREATE TYPE accs_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE accs_session_status AS ENUM ('OPEN', 'SEALED');
CREATE TYPE accs_bucket AS ENUM ('ADMITTED', 'REFUSED', 'OMITTED');
CREATE TYPE accs_hold_card_class AS ENUM ('HOLD_PERCEIVED', 'NOT_HOLD_PERCEIVED');
CREATE TYPE accs_hold_card_reason AS ENUM (
  'ACK_HELD_HOLD_PERCEIVED',
  'NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE'
);
CREATE TYPE accs_hold_card_next AS ENUM (
  'PERCEIVE_ACK_HELD_HOLD',
  'STOP_ACK_HOLD_CARD',
  'OMIT_ACK_HOLD_CARD'
);
CREATE TYPE accs_ack_hold_class AS ENUM ('ACK_HELD', 'NOT_ACK_HELD');
CREATE TYPE accs_ack_hold_reason AS ENUM (
  'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD',
  'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
);
CREATE TYPE accs_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE accs_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE accs_body_visibility AS ENUM ('OMITTED');
CREATE TYPE accs_access_path AS ENUM ('POINT_LOOKUP', 'COLUMN_PRUNE', 'BOARD_SCAN');
CREATE TYPE accs_completeness AS ENUM (
  'COMPLETE',
  'REFUSED_OVER_BUDGET',
  'AWAITING_PROJECTION'
);
CREATE TYPE accs_synopsis_class AS ENUM ('PUBLISHED', 'NOT_PUBLISHED');
CREATE TYPE accs_synopsis_reason AS ENUM (
  'SEALED_CARDS_TALLIED',
  'DAY_OVER_CARD_BUDGET',
  'PROJECTION_INCOMPLETE'
);
CREATE TYPE accs_synopsis_next AS ENUM (
  'READ_CARD_DAY_SYNOPSIS',
  'STOP_CARD_DAY_SYNOPSIS',
  'AWAIT_CARD_PROJECTION'
);
CREATE TYPE accs_metadata_trust AS ENUM ('UNTRUSTED_METADATA');

CREATE TABLE agent_accs_authorization_evidence (
  account_id BIGINT NOT NULL,
  evidence_id UUID NOT NULL,
  principal_id TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evidence_id),
  CHECK (char_length(evidence_digest) = 32)
);

CREATE TABLE agent_accs_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status accs_profile_status NOT NULL,
  definition_hash TEXT NOT NULL,
  max_cards_per_day INTEGER NOT NULL,
  budget_project_units INTEGER NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  procedure_ref TEXT NOT NULL,
  evidence_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, evidence_id)
    REFERENCES agent_accs_authorization_evidence (account_id, evidence_id),
  CHECK (profile_version > 0),
  CHECK (char_length(definition_hash) = 32),
  CHECK (max_cards_per_day > 0 AND max_cards_per_day < 1000000),
  CHECK (budget_project_units > 0 AND budget_project_units < 1000000),
  CHECK (synopsis_steward_a = 'principal:accs-a'),
  CHECK (synopsis_steward_b = 'principal:accs-b'),
  CHECK (procedure_ref = 'procedure:fold-admitted-count-card-day'),
  CHECK (
    (status = 'DRAFT' AND approved_at IS NULL)
    OR (status = 'APPROVED' AND approved_at IS NOT NULL)
    OR status = 'REVOKED'
  )
);

CREATE TABLE agent_accs_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status accs_session_status NOT NULL,
  budget_project_units INTEGER NOT NULL,
  consumed_project_units INTEGER NOT NULL,
  max_cards_per_day INTEGER NOT NULL,
  opened_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_accs_profile (account_id, profile_id, profile_version),
  CHECK (consumed_project_units >= 0),
  CHECK (consumed_project_units <= budget_project_units),
  CHECK (max_cards_per_day > 0 AND max_cards_per_day < 1000000),
  CHECK (char_length(opened_by) > 0)
);

CREATE TABLE agent_accs_sealed_card (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  ack_hold_card_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  source_plane TEXT NOT NULL DEFAULT 'ack-hold-card',
  hold_card_class accs_hold_card_class NOT NULL,
  hold_card_reason accs_hold_card_reason NOT NULL,
  hold_card_recorded BOOLEAN NOT NULL,
  trusted_next_action accs_hold_card_next NOT NULL,
  ack_hold_class accs_ack_hold_class NOT NULL,
  ack_hold_reason accs_ack_hold_reason NOT NULL,
  ack_hold_recorded BOOLEAN NOT NULL,
  effect_observation accs_effect_observation NOT NULL,
  attested_key_kind accs_key_kind NOT NULL,
  body_visibility accs_body_visibility NOT NULL,
  access_path accs_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  CHECK (source_plane = 'ack-hold-card'),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (inlines_fact_body = FALSE),
  CHECK (executes_tool = FALSE),
  CHECK (opens_nested_expiry = FALSE),
  CHECK (packet_scan_used = FALSE),
  CHECK (ack_promoted_to_trust = FALSE),
  CHECK (
    (
      hold_card_class = 'HOLD_PERCEIVED'
      AND hold_card_recorded
      AND hold_card_reason = 'ACK_HELD_HOLD_PERCEIVED'
      AND trusted_next_action = 'PERCEIVE_ACK_HELD_HOLD'
      AND ack_hold_class = 'ACK_HELD'
      AND ack_hold_recorded
      AND ack_hold_reason = 'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD'
      AND effect_observation = 'ACKED'
    )
    OR (
      trusted_next_action = 'OMIT_ACK_HOLD_CARD'
      AND hold_card_class = 'NOT_HOLD_PERCEIVED'
      AND NOT hold_card_recorded
      AND hold_card_reason = 'NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE'
      AND ack_hold_class = 'NOT_ACK_HELD'
      AND NOT ack_hold_recorded
      AND ack_hold_reason = 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
    )
    OR (
      trusted_next_action = 'STOP_ACK_HOLD_CARD'
      AND hold_card_class = 'NOT_HOLD_PERCEIVED'
      AND NOT hold_card_recorded
      AND hold_card_reason = 'NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE'
      AND ack_hold_class = 'NOT_ACK_HELD'
      AND NOT ack_hold_recorded
      AND ack_hold_reason = 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
      AND effect_observation = 'ACKED'
    )
  )
);

CREATE TABLE agent_accs_projection_ledger (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  ack_hold_card_id UUID NOT NULL,
  bucket accs_bucket NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accs_sealed_card (account_id, utc_day, consumer_principal_id)
);

CREATE TABLE agent_accs_day_column (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  bucket accs_bucket NOT NULL,
  tally BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, bucket),
  CHECK (tally > 0)
);

CREATE TABLE agent_accs_day_counter (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  sealed_card_count BIGINT NOT NULL,
  projected_count BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  CHECK (sealed_card_count >= 0),
  CHECK (projected_count >= 0),
  CHECK (projected_count <= sealed_card_count)
);

CREATE TABLE agent_accs_synopsis (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  synopsis_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  admitted_tally BIGINT,
  refused_tally BIGINT,
  omitted_tally BIGINT,
  sealed_card_count BIGINT NOT NULL,
  projected_count BIGINT NOT NULL,
  max_cards_per_day INTEGER NOT NULL,
  completeness accs_completeness NOT NULL,
  synopsis_class accs_synopsis_class NOT NULL,
  synopsis_reason accs_synopsis_reason NOT NULL,
  trusted_next_action accs_synopsis_next NOT NULL,
  body_visibility accs_body_visibility NOT NULL,
  access_path accs_access_path NOT NULL,
  metadata_trust accs_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  second_reader_granted BOOLEAN NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  digest TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  CHECK (char_length(digest) = 32),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (access_path = 'COLUMN_PRUNE'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = FALSE),
  CHECK (executes_tool = FALSE),
  CHECK (opens_nested_expiry = FALSE),
  CHECK (packet_scan_used = FALSE),
  CHECK (second_reader_granted = FALSE),
  CHECK (synopsis_steward_a = 'principal:accs-a'),
  CHECK (synopsis_steward_b = 'principal:accs-b'),
  CHECK (max_cards_per_day > 0 AND max_cards_per_day < 1000000),
  CHECK (
    (
      completeness = 'COMPLETE'
      AND synopsis_class = 'PUBLISHED'
      AND synopsis_reason = 'SEALED_CARDS_TALLIED'
      AND trusted_next_action = 'READ_CARD_DAY_SYNOPSIS'
      AND admitted_tally IS NOT NULL
      AND refused_tally IS NOT NULL
      AND omitted_tally IS NOT NULL
      AND projected_count = sealed_card_count
      AND sealed_card_count <= max_cards_per_day
      AND admitted_tally + refused_tally + omitted_tally = sealed_card_count
    )
    OR (
      completeness = 'REFUSED_OVER_BUDGET'
      AND synopsis_class = 'NOT_PUBLISHED'
      AND synopsis_reason = 'DAY_OVER_CARD_BUDGET'
      AND trusted_next_action = 'STOP_CARD_DAY_SYNOPSIS'
      AND admitted_tally IS NULL
      AND refused_tally IS NULL
      AND omitted_tally IS NULL
      AND sealed_card_count > max_cards_per_day
    )
    OR (
      completeness = 'AWAITING_PROJECTION'
      AND synopsis_class = 'NOT_PUBLISHED'
      AND synopsis_reason = 'PROJECTION_INCOMPLETE'
      AND trusted_next_action = 'AWAIT_CARD_PROJECTION'
      AND admitted_tally IS NULL
      AND refused_tally IS NULL
      AND omitted_tally IS NULL
      AND projected_count < sealed_card_count
      AND sealed_card_count <= max_cards_per_day
    )
  )
);

CREATE TABLE agent_accs_audit_event (
  account_id BIGINT NOT NULL,
  seq BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  prev_digest TEXT,
  digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, seq),
  CHECK (seq > 0),
  CHECK (char_length(digest) = 32),
  CHECK (event_kind IN ('CARD_PROJECTED', 'SYNOPSIS_PUBLISHED'))
);

CREATE TABLE agent_accs_scan_rejection (
  account_id BIGINT NOT NULL,
  rejection_id UUID NOT NULL,
  board_row_estimate BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, rejection_id),
  CHECK (reason = 'FULL SCAN REJECTED')
);

CREATE TABLE agent_accs_second_reader_rejection (
  account_id BIGINT NOT NULL,
  rejection_id UUID NOT NULL,
  requested_reader_principal_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, rejection_id),
  CHECK (reason = 'SECOND READER REJECTED'),
  CHECK (char_length(requested_reader_principal_id) > 0)
);

CREATE TABLE agent_accs_procedure (
  account_id BIGINT NOT NULL,
  procedure_ref TEXT NOT NULL,
  procedure_version INTEGER NOT NULL,
  instruction_text TEXT NOT NULL,
  instruction_digest TEXT NOT NULL,
  engine_executes_instruction BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, procedure_ref, procedure_version),
  CHECK (procedure_ref = 'procedure:fold-admitted-count-card-day'),
  CHECK (char_length(instruction_digest) = 32),
  CHECK (engine_executes_instruction = FALSE)
);

CREATE FUNCTION accs_synopsis_digest(
  p_account_id BIGINT,
  p_utc_day DATE,
  p_profile_id UUID,
  p_profile_version INTEGER,
  p_completeness accs_completeness,
  p_admitted BIGINT,
  p_refused BIGINT,
  p_omitted BIGINT,
  p_sealed BIGINT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(
    p_account_id::TEXT || '|' || p_utc_day::TEXT || '|' || p_profile_id::TEXT || '|' ||
    p_profile_version::TEXT || '|' || p_completeness::TEXT || '|' ||
    COALESCE(p_admitted::TEXT, 'null') || '|' ||
    COALESCE(p_refused::TEXT, 'null') || '|' ||
    COALESCE(p_omitted::TEXT, 'null') || '|' ||
    p_sealed::TEXT
  );
$$;

CREATE FUNCTION accs_require_tenant(p_account_id BIGINT) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_account_id IS DISTINCT FROM NULLIF(current_setting('app.account_id', true), '')::BIGINT THEN
    RAISE EXCEPTION 'TENANT SCOPE REJECTED';
  END IF;
END;
$$;

CREATE FUNCTION accs_append_audit(
  p_account_id BIGINT,
  p_utc_day DATE,
  p_event_kind TEXT,
  p_entity_key TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev TEXT;
  v_seq BIGINT;
  v_digest TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_account_id);
  SELECT digest INTO v_prev
  FROM agent_accs_audit_event
  WHERE account_id = p_account_id
  ORDER BY seq DESC
  LIMIT 1;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
  FROM agent_accs_audit_event
  WHERE account_id = p_account_id;
  v_digest := md5(COALESCE(v_prev, 'genesis') || '|' || p_event_kind || '|' || p_entity_key || '|' || v_seq::TEXT);
  INSERT INTO agent_accs_audit_event (
    account_id, seq, utc_day, event_kind, entity_key, prev_digest, digest, created_at
  ) VALUES (
    p_account_id, v_seq, p_utc_day, p_event_kind, p_entity_key, v_prev, v_digest, clock_timestamp()
  );
  RETURN v_digest;
END;
$$;

CREATE FUNCTION protect_agent_accs_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'PROFILE MUST START DRAFT';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
      NULL;
    ELSIF OLD.status = 'APPROVED' AND NEW.status = 'REVOKED' THEN
      NULL;
    ELSIF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED' THEN
      IF OLD.definition_hash IS DISTINCT FROM NEW.definition_hash
         OR OLD.max_cards_per_day IS DISTINCT FROM NEW.max_cards_per_day
         OR OLD.budget_project_units IS DISTINCT FROM NEW.budget_project_units
         OR OLD.synopsis_steward_a IS DISTINCT FROM NEW.synopsis_steward_a
         OR OLD.synopsis_steward_b IS DISTINCT FROM NEW.synopsis_steward_b
         OR OLD.procedure_ref IS DISTINCT FROM NEW.procedure_ref
         OR OLD.evidence_id IS DISTINCT FROM NEW.evidence_id THEN
        RAISE EXCEPTION 'APPROVED PROFILE IMMUTABLE';
      END IF;
    ELSE
      RAISE EXCEPTION 'PROFILE TRANSITION REJECTED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_agent_accs_profile_row
  BEFORE INSERT OR UPDATE ON agent_accs_profile
  FOR EACH ROW EXECUTE FUNCTION protect_agent_accs_profile();

CREATE FUNCTION bump_agent_accs_day_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('accs.sealing', 'on', true);
  INSERT INTO agent_accs_day_counter AS c (
    account_id, utc_day, sealed_card_count, projected_count, created_at, updated_at
  ) VALUES (
    NEW.account_id, NEW.utc_day, 1, 0, clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (account_id, utc_day)
  DO UPDATE SET
    sealed_card_count = c.sealed_card_count + 1,
    updated_at = clock_timestamp();
  PERFORM set_config('accs.sealing', 'off', true);
  RETURN NEW;
END;
$$;

CREATE FUNCTION accs_lock_tenant_day(p_account_id BIGINT, p_utc_day DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('accs-day'),
    hashtext(p_account_id::TEXT || '|' || p_utc_day::TEXT)
  );
END;
$$;

CREATE FUNCTION protect_agent_accs_sealed_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SEALED CARD IMMUTABLE';
  END IF;
  IF current_setting('accs.publishing', true) = 'on' THEN
    RAISE EXCEPTION 'SYNOPSIS PUBLISH IN PROGRESS';
  END IF;
  PERFORM accs_lock_tenant_day(NEW.account_id, NEW.utc_day);
  IF NEW.inlines_fact_body OR NEW.executes_tool OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used OR NEW.ack_promoted_to_trust THEN
    RAISE EXCEPTION 'UNSAFE CARD REJECTED';
  END IF;
  IF NEW.attested_key_kind = 'TRUSTED_ENROLLED' THEN
    RAISE EXCEPTION 'TRUSTED ENROLLMENT REJECTED';
  END IF;
  IF NEW.access_path <> 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM agent_accs_synopsis AS s
    WHERE s.account_id = NEW.account_id
      AND s.utc_day = NEW.utc_day
      AND s.completeness = 'COMPLETE'
  ) THEN
    RAISE EXCEPTION 'SYNOPSIS ALREADY SEALED';
  END IF;
  IF NEW.hold_card_class = 'HOLD_PERCEIVED' THEN
    IF NEW.hold_card_recorded IS NOT TRUE
       OR NEW.hold_card_reason <> 'ACK_HELD_HOLD_PERCEIVED'
       OR NEW.trusted_next_action <> 'PERCEIVE_ACK_HELD_HOLD'
       OR NEW.ack_hold_class <> 'ACK_HELD'
       OR NEW.ack_hold_reason <> 'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD'
       OR NEW.ack_hold_recorded IS NOT TRUE
       OR NEW.effect_observation <> 'ACKED' THEN
      RAISE EXCEPTION 'ADMITTED CARD SHAPE REJECTED';
    END IF;
  ELSIF NEW.trusted_next_action = 'OMIT_ACK_HOLD_CARD' THEN
    IF NEW.hold_card_class <> 'NOT_HOLD_PERCEIVED'
       OR NEW.hold_card_recorded
       OR NEW.hold_card_reason <> 'NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE'
       OR NEW.ack_hold_class <> 'NOT_ACK_HELD'
       OR NEW.ack_hold_recorded
       OR NEW.ack_hold_reason <> 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD' THEN
      RAISE EXCEPTION 'OMITTED CARD SHAPE REJECTED';
    END IF;
  ELSIF NEW.trusted_next_action = 'STOP_ACK_HOLD_CARD' THEN
    IF NEW.hold_card_class <> 'NOT_HOLD_PERCEIVED'
       OR NEW.hold_card_recorded
       OR NEW.hold_card_reason <> 'NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE'
       OR NEW.ack_hold_class <> 'NOT_ACK_HELD'
       OR NEW.ack_hold_recorded
       OR NEW.ack_hold_reason <> 'NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD'
       OR NEW.effect_observation <> 'ACKED' THEN
      RAISE EXCEPTION 'REFUSED CARD SHAPE REJECTED';
    END IF;
  ELSE
    RAISE EXCEPTION 'UNCLASSIFIED CARD REJECTED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_agent_accs_sealed_card_row
  BEFORE INSERT OR UPDATE OR DELETE ON agent_accs_sealed_card
  FOR EACH ROW EXECUTE FUNCTION protect_agent_accs_sealed_card();

CREATE TRIGGER bump_agent_accs_day_counter_row
  AFTER INSERT ON agent_accs_sealed_card
  FOR EACH ROW EXECUTE FUNCTION bump_agent_accs_day_counter();

CREATE FUNCTION protect_agent_accs_day_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DAY COUNTER IMMUTABLE';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF current_setting('accs.sealing', true) IS DISTINCT FROM 'on'
       OR NEW.sealed_card_count <> 1
       OR NEW.projected_count <> 0 THEN
      RAISE EXCEPTION 'DAY COUNTER IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.account_id IS DISTINCT FROM OLD.account_id
       OR NEW.utc_day IS DISTINCT FROM OLD.utc_day THEN
      RAISE EXCEPTION 'DAY COUNTER IMMUTABLE';
    END IF;
    IF NEW.sealed_card_count IS DISTINCT FROM OLD.sealed_card_count THEN
      IF current_setting('accs.sealing', true) IS DISTINCT FROM 'on'
         OR NEW.sealed_card_count <> OLD.sealed_card_count + 1 THEN
        RAISE EXCEPTION 'DAY COUNTER IMMUTABLE';
      END IF;
    END IF;
    IF NEW.projected_count IS DISTINCT FROM OLD.projected_count THEN
      IF current_setting('accs.projecting', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'COLUMN TALLY REJECTED';
      END IF;
      IF NEW.projected_count <> OLD.projected_count + 1 THEN
        RAISE EXCEPTION 'COLUMN TALLY REJECTED';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_agent_accs_day_counter_row
  BEFORE INSERT OR UPDATE OR DELETE ON agent_accs_day_counter
  FOR EACH ROW EXECUTE FUNCTION protect_agent_accs_day_counter();

CREATE FUNCTION protect_agent_accs_day_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('accs.projecting', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'COLUMN TALLY REJECTED';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COLUMN TALLY REJECTED';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.tally <> 1 THEN
      RAISE EXCEPTION 'COLUMN TALLY REJECTED';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tally <> OLD.tally + 1 THEN
      RAISE EXCEPTION 'COLUMN TALLY REJECTED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_agent_accs_day_column_row
  BEFORE INSERT OR UPDATE OR DELETE ON agent_accs_day_column
  FOR EACH ROW EXECUTE FUNCTION protect_agent_accs_day_column();

CREATE FUNCTION protect_agent_accs_projection_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PROJECTION LEDGER IMMUTABLE';
  END IF;
  IF current_setting('accs.projecting', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'PROJECTION LEDGER REJECTED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_agent_accs_projection_ledger_row
  BEFORE INSERT OR UPDATE OR DELETE ON agent_accs_projection_ledger
  FOR EACH ROW EXECUTE FUNCTION protect_agent_accs_projection_ledger();

CREATE FUNCTION protect_agent_accs_synopsis()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('accs.publishing', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SYNOPSIS WRITE REJECTED';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SYNOPSIS IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.completeness = 'COMPLETE' THEN
    IF NEW.digest IS DISTINCT FROM OLD.digest
       OR NEW.completeness IS DISTINCT FROM 'COMPLETE'
       OR NEW.admitted_tally IS DISTINCT FROM OLD.admitted_tally
       OR NEW.refused_tally IS DISTINCT FROM OLD.refused_tally
       OR NEW.omitted_tally IS DISTINCT FROM OLD.omitted_tally THEN
      RAISE EXCEPTION 'SYNOPSIS DRIFT REJECTED';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.completeness = 'REFUSED_OVER_BUDGET' THEN
    IF NEW.completeness IS DISTINCT FROM 'REFUSED_OVER_BUDGET'
       OR NEW.admitted_tally IS NOT NULL
       OR NEW.refused_tally IS NOT NULL
       OR NEW.omitted_tally IS NOT NULL THEN
      RAISE EXCEPTION 'SYNOPSIS DRIFT REJECTED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_agent_accs_synopsis_row
  BEFORE INSERT OR UPDATE OR DELETE ON agent_accs_synopsis
  FOR EACH ROW EXECUTE FUNCTION protect_agent_accs_synopsis();

CREATE FUNCTION approve_agent_accs_profile(
  p_account_id BIGINT,
  p_profile_id UUID,
  p_profile_version INTEGER,
  p_definition_hash TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_profile agent_accs_profile%ROWTYPE;
  v_instruction TEXT := 'Point-look up one sealed ack-hold card by (account_id, utc_day, consumer_principal_id). Fold it into exactly one columnar bucket: ADMITTED, REFUSED, or OMITTED. Publish the day only from the three columnar tallies. FULL SCAN REJECTED when a board walk would touch 1000000 rows. Do not scan a board. Do not inline a fact body. Do not execute the tool. Do not grant a second reader. This plane does not open another nested expiry.';
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  IF char_length(p_definition_hash) <> 32 THEN
    RAISE EXCEPTION 'DEFINITION HASH REJECTED';
  END IF;
  SELECT * INTO v_profile
  FROM agent_accs_profile
  WHERE account_id = p_account_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
  IF NOT FOUND OR v_profile.status <> 'DRAFT' OR v_profile.definition_hash IS DISTINCT FROM p_definition_hash THEN
    RAISE EXCEPTION 'DEFINITION HASH REJECTED';
  END IF;
  UPDATE agent_accs_profile
  SET status = 'APPROVED', approved_at = clock_timestamp()
  WHERE account_id = p_account_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
  INSERT INTO agent_accs_procedure (
    account_id, procedure_ref, procedure_version, instruction_text,
    instruction_digest, engine_executes_instruction, created_at
  ) VALUES (
    p_account_id, v_profile.procedure_ref, p_profile_version, v_instruction,
    md5(v_instruction), FALSE, clock_timestamp()
  )
  ON CONFLICT (account_id, procedure_ref, procedure_version) DO NOTHING;
END;
$$;

CREATE FUNCTION open_agent_accs_session(
  p_account_id BIGINT,
  p_session_id UUID,
  p_profile_id UUID,
  p_profile_version INTEGER,
  p_opened_by TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_profile agent_accs_profile%ROWTYPE;
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  SELECT * INTO v_profile
  FROM agent_accs_profile
  WHERE account_id = p_account_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
  IF NOT FOUND OR v_profile.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'PROFILE REJECTED';
  END IF;
  INSERT INTO agent_accs_session (
    account_id, session_id, profile_id, profile_version, status,
    budget_project_units, consumed_project_units, max_cards_per_day,
    opened_by, created_at
  ) VALUES (
    p_account_id, p_session_id, p_profile_id, p_profile_version, 'OPEN',
    v_profile.budget_project_units, 0, v_profile.max_cards_per_day,
    p_opened_by, clock_timestamp()
  );
END;
$$;

CREATE FUNCTION project_agent_accs_card(
  p_account_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing TEXT;
  v_session agent_accs_session%ROWTYPE;
  v_profile agent_accs_profile%ROWTYPE;
  v_counter agent_accs_day_counter%ROWTYPE;
  v_card agent_accs_sealed_card%ROWTYPE;
  v_bucket accs_bucket;
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  IF current_setting('accs.publishing', true) = 'on' THEN
    RAISE EXCEPTION 'SYNOPSIS PUBLISH IN PROGRESS';
  END IF;
  PERFORM accs_lock_tenant_day(p_account_id, p_utc_day);
  SELECT bucket::TEXT INTO v_existing
  FROM agent_accs_projection_ledger
  WHERE account_id = p_account_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_session
  FROM agent_accs_session
  WHERE account_id = p_account_id AND session_id = p_session_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'OPEN' THEN
    RAISE EXCEPTION 'SESSION REJECTED';
  END IF;

  SELECT * INTO v_profile
  FROM agent_accs_profile
  WHERE account_id = p_account_id
    AND profile_id = v_session.profile_id
    AND profile_version = v_session.profile_version;
  IF NOT FOUND OR v_profile.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'PROFILE REJECTED';
  END IF;

  SELECT * INTO v_counter
  FROM agent_accs_day_counter
  WHERE account_id = p_account_id AND utc_day = p_utc_day
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEALED CARD MISSING';
  END IF;
  IF v_counter.sealed_card_count > v_session.max_cards_per_day THEN
    RAISE EXCEPTION 'DAY OVER CARD BUDGET';
  END IF;
  IF v_session.consumed_project_units >= v_session.budget_project_units THEN
    RAISE EXCEPTION 'PROJECT BUDGET EXCEEDED';
  END IF;

  SELECT * INTO v_card
  FROM agent_accs_sealed_card
  WHERE account_id = p_account_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEALED CARD MISSING';
  END IF;
  IF v_card.inlines_fact_body OR v_card.executes_tool OR v_card.opens_nested_expiry
     OR v_card.packet_scan_used OR v_card.ack_promoted_to_trust
     OR v_card.attested_key_kind = 'TRUSTED_ENROLLED' THEN
    RAISE EXCEPTION 'UNSAFE CARD REJECTED';
  END IF;
  IF v_card.reader_principal_id IN (v_profile.synopsis_steward_a, v_profile.synopsis_steward_b)
     OR v_card.consumer_principal_id IN (v_profile.synopsis_steward_a, v_profile.synopsis_steward_b) THEN
    RAISE EXCEPTION 'SECOND READER REJECTED';
  END IF;

  IF v_card.hold_card_recorded
     AND v_card.hold_card_class = 'HOLD_PERCEIVED'
     AND v_card.hold_card_reason = 'ACK_HELD_HOLD_PERCEIVED'
     AND v_card.trusted_next_action = 'PERCEIVE_ACK_HELD_HOLD'
     AND v_card.ack_hold_recorded
     AND v_card.ack_hold_class = 'ACK_HELD'
     AND v_card.ack_hold_reason = 'ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD'
     AND v_card.effect_observation = 'ACKED' THEN
    v_bucket := 'ADMITTED';
  ELSIF v_card.trusted_next_action = 'OMIT_ACK_HOLD_CARD'
     OR v_card.effect_observation = 'UNKNOWN_EFFECT' THEN
    v_bucket := 'OMITTED';
  ELSIF v_card.trusted_next_action = 'STOP_ACK_HOLD_CARD'
     OR v_card.hold_card_class = 'NOT_HOLD_PERCEIVED' THEN
    v_bucket := 'REFUSED';
  ELSE
    RAISE EXCEPTION 'UNCLASSIFIED CARD REJECTED';
  END IF;

  PERFORM set_config('accs.projecting', 'on', true);
  INSERT INTO agent_accs_projection_ledger (
    account_id, utc_day, consumer_principal_id, ack_hold_card_id, bucket, projected_at
  ) VALUES (
    p_account_id, p_utc_day, p_consumer_principal_id, v_card.ack_hold_card_id,
    v_bucket, clock_timestamp()
  );
  INSERT INTO agent_accs_day_column (
    account_id, utc_day, bucket, tally, updated_at
  ) VALUES (
    p_account_id, p_utc_day, v_bucket, 1, clock_timestamp()
  )
  ON CONFLICT (account_id, utc_day, bucket)
  DO UPDATE SET tally = agent_accs_day_column.tally + 1, updated_at = EXCLUDED.updated_at;
  UPDATE agent_accs_day_counter
  SET projected_count = projected_count + 1, updated_at = clock_timestamp()
  WHERE account_id = p_account_id AND utc_day = p_utc_day;
  UPDATE agent_accs_session
  SET consumed_project_units = consumed_project_units + 1
  WHERE account_id = p_account_id AND session_id = p_session_id;
  PERFORM accs_append_audit(
    p_account_id, p_utc_day, 'CARD_PROJECTED',
    p_consumer_principal_id || '|' || v_bucket::TEXT
  );
  RETURN v_bucket::TEXT;
END;
$$;

CREATE FUNCTION publish_agent_accs_day_synopsis(
  p_account_id BIGINT,
  p_profile_id UUID,
  p_profile_version INTEGER,
  p_utc_day DATE,
  p_synopsis_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_profile agent_accs_profile%ROWTYPE;
  v_existing agent_accs_synopsis%ROWTYPE;
  v_sealed BIGINT := 0;
  v_projected BIGINT := 0;
  v_admitted BIGINT;
  v_refused BIGINT;
  v_omitted BIGINT;
  v_completeness accs_completeness;
  v_class accs_synopsis_class;
  v_reason accs_synopsis_reason;
  v_next accs_synopsis_next;
  v_digest TEXT;
  v_found BOOLEAN := FALSE;
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  SELECT * INTO v_profile
  FROM agent_accs_profile
  WHERE account_id = p_account_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
  IF NOT FOUND OR v_profile.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'PROFILE REJECTED';
  END IF;

  PERFORM accs_lock_tenant_day(p_account_id, p_utc_day);
  PERFORM set_config('accs.publishing', 'on', true);
  SELECT sealed_card_count, projected_count INTO v_sealed, v_projected
  FROM agent_accs_day_counter
  WHERE account_id = p_account_id AND utc_day = p_utc_day
  FOR UPDATE;
  IF NOT FOUND THEN
    v_sealed := 0;
    v_projected := 0;
  END IF;

  IF v_sealed > v_profile.max_cards_per_day THEN
    v_completeness := 'REFUSED_OVER_BUDGET';
    v_class := 'NOT_PUBLISHED';
    v_reason := 'DAY_OVER_CARD_BUDGET';
    v_next := 'STOP_CARD_DAY_SYNOPSIS';
    v_admitted := NULL;
    v_refused := NULL;
    v_omitted := NULL;
  ELSIF v_projected IS DISTINCT FROM v_sealed THEN
    v_completeness := 'AWAITING_PROJECTION';
    v_class := 'NOT_PUBLISHED';
    v_reason := 'PROJECTION_INCOMPLETE';
    v_next := 'AWAIT_CARD_PROJECTION';
    v_admitted := NULL;
    v_refused := NULL;
    v_omitted := NULL;
  ELSE
    SELECT
      COALESCE(MAX(tally) FILTER (WHERE bucket = 'ADMITTED'), 0),
      COALESCE(MAX(tally) FILTER (WHERE bucket = 'REFUSED'), 0),
      COALESCE(MAX(tally) FILTER (WHERE bucket = 'OMITTED'), 0)
    INTO v_admitted, v_refused, v_omitted
    FROM agent_accs_day_column
    WHERE account_id = p_account_id AND utc_day = p_utc_day;
    IF v_admitted + v_refused + v_omitted IS DISTINCT FROM v_sealed THEN
      RAISE EXCEPTION 'SYNOPSIS DRIFT REJECTED';
    END IF;
    v_completeness := 'COMPLETE';
    v_class := 'PUBLISHED';
    v_reason := 'SEALED_CARDS_TALLIED';
    v_next := 'READ_CARD_DAY_SYNOPSIS';
  END IF;

  v_digest := accs_synopsis_digest(
    p_account_id, p_utc_day, p_profile_id, p_profile_version,
    v_completeness, v_admitted, v_refused, v_omitted, v_sealed
  );

  SELECT * INTO v_existing
  FROM agent_accs_synopsis
  WHERE account_id = p_account_id AND utc_day = p_utc_day
  FOR UPDATE;
  v_found := FOUND;
  IF v_found AND (
    v_existing.profile_id IS DISTINCT FROM p_profile_id
    OR v_existing.profile_version IS DISTINCT FROM p_profile_version
  ) THEN
    RAISE EXCEPTION 'SYNOPSIS PROFILE REJECTED';
  END IF;
  IF v_found AND v_existing.completeness = 'COMPLETE' AND v_existing.digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'SYNOPSIS DRIFT REJECTED';
  END IF;
  IF v_found AND v_existing.digest = v_digest THEN
    PERFORM set_config('accs.publishing', 'off', true);
    RETURN v_existing.digest;
  END IF;

  IF v_found THEN
    UPDATE agent_accs_synopsis
    SET
      admitted_tally = v_admitted,
      refused_tally = v_refused,
      omitted_tally = v_omitted,
      sealed_card_count = v_sealed,
      projected_count = v_projected,
      max_cards_per_day = v_profile.max_cards_per_day,
      completeness = v_completeness,
      synopsis_class = v_class,
      synopsis_reason = v_reason,
      trusted_next_action = v_next,
      digest = v_digest,
      published_at = clock_timestamp()
    WHERE account_id = p_account_id AND utc_day = p_utc_day;
  ELSE
    INSERT INTO agent_accs_synopsis (
      account_id, utc_day, synopsis_id, profile_id, profile_version,
      admitted_tally, refused_tally, omitted_tally, sealed_card_count,
      projected_count, max_cards_per_day, completeness, synopsis_class,
      synopsis_reason, trusted_next_action, body_visibility, access_path,
      metadata_trust, inlines_fact_body, executes_tool, opens_nested_expiry,
      packet_scan_used, second_reader_granted, synopsis_steward_a,
      synopsis_steward_b, digest, published_at
    ) VALUES (
      p_account_id, p_utc_day, p_synopsis_id, p_profile_id, p_profile_version,
      v_admitted, v_refused, v_omitted, v_sealed, v_projected,
      v_profile.max_cards_per_day, v_completeness, v_class, v_reason, v_next,
      'OMITTED', 'COLUMN_PRUNE', 'UNTRUSTED_METADATA', FALSE, FALSE, FALSE,
      FALSE, FALSE, v_profile.synopsis_steward_a, v_profile.synopsis_steward_b,
      v_digest, clock_timestamp()
    );
  END IF;
  PERFORM accs_append_audit(
    p_account_id, p_utc_day, 'SYNOPSIS_PUBLISHED',
    p_utc_day::TEXT || '|' || v_completeness::TEXT || '|' || v_digest
  );
  PERFORM set_config('accs.publishing', 'off', true);
  RETURN v_digest;
END;
$$;

CREATE FUNCTION read_agent_accs_rollup(
  p_account_id BIGINT,
  p_utc_day DATE
) RETURNS TABLE (bucket accs_bucket, tally BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row agent_accs_synopsis%ROWTYPE;
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  SELECT * INTO v_row
  FROM agent_accs_synopsis
  WHERE account_id = p_account_id AND utc_day = p_utc_day;
  IF NOT FOUND OR v_row.completeness <> 'COMPLETE' THEN
    RETURN;
  END IF;
  bucket := 'ADMITTED';
  tally := v_row.admitted_tally;
  RETURN NEXT;
  bucket := 'REFUSED';
  tally := v_row.refused_tally;
  RETURN NEXT;
  bucket := 'OMITTED';
  tally := v_row.omitted_tally;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION reject_agent_accs_board_scan(
  p_account_id BIGINT,
  p_board_row_estimate BIGINT,
  p_has_account BOOLEAN,
  p_has_day BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  IF p_has_account IS DISTINCT FROM TRUE
     OR p_has_day IS DISTINCT FROM TRUE
     OR p_board_row_estimate >= 1000000 THEN
    INSERT INTO agent_accs_scan_rejection (
      account_id, rejection_id, board_row_estimate, reason, created_at
    ) VALUES (
      p_account_id, gen_random_uuid(), p_board_row_estimate,
      'FULL SCAN REJECTED', clock_timestamp()
    );
    RETURN 'FULL SCAN REJECTED';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION reject_agent_accs_second_reader(
  p_account_id BIGINT,
  p_requested_reader_principal_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM accs_require_tenant(p_account_id);
  INSERT INTO agent_accs_second_reader_rejection (
    account_id, rejection_id, requested_reader_principal_id, reason, created_at
  ) VALUES (
    p_account_id, gen_random_uuid(), p_requested_reader_principal_id,
    'SECOND READER REJECTED', clock_timestamp()
  );
  RETURN 'SECOND READER REJECTED';
END;
$$;

CREATE UNIQUE INDEX agent_accs_card_id_idx ON agent_accs_sealed_card (
  account_id,
  ack_hold_card_id
);
CREATE INDEX agent_accs_session_profile_idx ON agent_accs_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_accs_profile_status_idx ON agent_accs_profile (
  account_id,
  status
);
CREATE INDEX agent_accs_ledger_card_idx ON agent_accs_projection_ledger (
  account_id,
  ack_hold_card_id
);
CREATE INDEX agent_accs_audit_day_idx ON agent_accs_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_accs_synopsis_class_idx ON agent_accs_synopsis (
  account_id,
  synopsis_class
);
CREATE INDEX agent_accs_scan_reason_idx ON agent_accs_scan_rejection (
  account_id,
  reason
);
CREATE INDEX agent_accs_second_reader_reason_idx ON agent_accs_second_reader_rejection (
  account_id,
  reason
);
CREATE INDEX agent_accs_evidence_principal_idx ON agent_accs_authorization_evidence (
  account_id,
  principal_id
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_accs_authorization_evidence',
    'agent_accs_profile',
    'agent_accs_session',
    'agent_accs_sealed_card',
    'agent_accs_projection_ledger',
    'agent_accs_day_column',
    'agent_accs_day_counter',
    'agent_accs_synopsis',
    'agent_accs_audit_event',
    'agent_accs_scan_rejection',
    'agent_accs_second_reader_rejection',
    'agent_accs_procedure'
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

Direct writes that skip the functions still pass through the triggers.
A fact body, a tool flag, a packet scan, a trusted key, or a nested
expiry flag is rejected. A board access path is `FULL SCAN REJECTED`.
A second reader is not a column on the ledger, the columnar segment,
or the synopsis. The ledger key is the fold identity, not a grant.

## 9. Open API GraphQL contract

Every operation takes `accountId`. Resolvers set `app.account_id` from
the authenticated session, then pass that same account into SQL.
The agent does not choose the tenant setting. `admittedCountCardRollup`
is the `COMPLETE` synopsis only. It is not a board aggregate.
`rejectAdmittedCountSecondReader` has no success arm that grants a
reader.

```graphql
scalar Date

enum AccsBucket {
  ADMITTED
  REFUSED
  OMITTED
}

enum AccsCompleteness {
  COMPLETE
  REFUSED_OVER_BUDGET
  AWAITING_PROJECTION
}

enum AccsSynopsisClass {
  PUBLISHED
  NOT_PUBLISHED
}

enum AccsSynopsisNext {
  READ_CARD_DAY_SYNOPSIS
  STOP_CARD_DAY_SYNOPSIS
  AWAIT_CARD_PROJECTION
}

enum AccsRejectionReason {
  FULL_SCAN_REJECTED
  SECOND_READER_REJECTED
}

type AdmittedCountCardSynopsis {
  accountId: ID!
  utcDay: Date!
  admittedTally: Int
  refusedTally: Int
  omittedTally: Int
  completeness: AccsCompleteness!
  synopsisClass: AccsSynopsisClass!
  nextAction: AccsSynopsisNext!
  bodyVisibility: String!
  secondReaderGranted: Boolean!
  digest: String!
}

type AdmittedCountCardRollupBucket {
  accountId: ID!
  utcDay: Date!
  bucket: AccsBucket!
  tally: Int!
}

type AdmittedCountCardProjection {
  accountId: ID!
  utcDay: Date!
  consumerPrincipalId: ID!
  bucket: AccsBucket!
}

type AdmittedCountCardSynopsisAudit {
  accountId: ID!
  seq: Int!
  digest: String!
  eventKind: String!
}

type AccsRejection {
  accountId: ID!
  reason: AccsRejectionReason!
}

type Query {
  admittedCountCardSynopsis(accountId: ID!, utcDay: Date!): AdmittedCountCardSynopsis
  admittedCountCardRollup(accountId: ID!, utcDay: Date!): [AdmittedCountCardRollupBucket!]!
  admittedCountCardProjection(
    accountId: ID!
    utcDay: Date!
    consumerPrincipalId: ID!
  ): AdmittedCountCardProjection
  admittedCountCardSynopsisAudit(accountId: ID!, seq: Int!): AdmittedCountCardSynopsisAudit
}

type Mutation {
  projectAdmittedCountCard(
    accountId: ID!
    sessionId: ID!
    utcDay: Date!
    consumerPrincipalId: ID!
  ): AdmittedCountCardProjection!
  publishAdmittedCountCardSynopsis(accountId: ID!, utcDay: Date!): AdmittedCountCardSynopsis!
  rejectAdmittedCountBoardScan(accountId: ID!, boardRowEstimate: Int!): AccsRejection
  rejectAdmittedCountSecondReader(
    accountId: ID!
    requestedReaderPrincipalId: ID!
  ): AccsRejection!
  approveAdmittedCountCardSynopsisProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): Boolean!
  openAdmittedCountCardSynopsisSession(
    accountId: ID!
    sessionId: ID!
    profileId: ID!
    profileVersion: Int!
  ): Boolean!
}
```

## 10. Procedural memory

Approval stores one procedural memory row. The ref is
`procedure:fold-admitted-count-card-day`. The instruction text tells
the agent the fold order: point-look up one card, choose one bucket,
publish from the columnar tallies, and stop. `engine_executes_instruction`
is false. The SQL functions are the deterministic implementation. The
engine does not eval the instruction text, and an agent cannot change
the bucket rules by editing that sentence. A new instruction is a new
profile version that stays `DRAFT` until the definition hash is
approved.

The upstream hold next action `HOLD_ACKNOWLEDGED_RECEIPT` is not
stored as an instruction here. This plane does not replay it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery can use pgvector. The embedding stores a fixed tag
vector for the synopsis profile, not a fact body and not a card. The
reference width is 4 so the contract runs without a model call.
Production partitions may use the model width. Queries filter
`account_id` before any topK. A global ANN index would mix tenants.
The reference schema does not build an HNSW index. HNSW, when added
later, is one index per account partition.

```sql
CREATE TABLE agent_accs_profile_embedding (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dims INTEGER NOT NULL,
  embedding vector(4) NOT NULL,
  definition_hash TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_accs_profile (account_id, profile_id, profile_version),
  CHECK (embedding_model = 'reference-synopsis-tags-v1'),
  CHECK (embedding_dims = 4),
  CHECK (char_length(definition_hash) = 32),
  CHECK (source_watermark = 'ack-hold-card-seal')
);

ALTER TABLE agent_accs_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_accs_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_accs_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An embedding hit returns a profile id. The caller still opens a
session and projects one card at a time. Discovery never writes
`agent_accs_day_column`.

## 12. Agent perception

The perception card is the only payload an LLM should see for this
plane:

- `account_id` and `utc_day`
- `admitted_tally`, `refused_tally`, `omitted_tally` (null unless the
  synopsis is `COMPLETE`)
- `completeness`, `synopsis_class`, `trusted_next_action`
- `body_visibility = OMITTED`
- `second_reader_granted = false`
- semantic tags `plane:admitted-count-card-synopsis`,
  `grain:account-day`, `tallies:admitted-refused-omitted`
- procedural memory ref `procedure:fold-admitted-count-card-day`
- `metadata_trust = UNTRUSTED_METADATA`

The card does not include a consumer list, a reader principal, a fact
body, the upstream observation triple, or the unprojected card count.
A tag is not an authorization decision. Operators may read that gap
from `agent_accs_day_counter` by primary key. The perception card
must not copy it into a tally.

## 13. ACID and consistency

Card insert, counter bump, and the later projection each run in a
transaction. The projection writes the ledger, the columnar tally, the
counter, the session budget, and the audit event together. A conflict
rolls all five back, so a tally cannot move without a ledger row.

Publish holds the tenant-day lock from the counter read through the
synopsis write. Card insert and projection take that lock first. A
card inserted in the publish transaction raises
`SYNOPSIS PUBLISH IN PROGRESS` and rolls back with the publish. The
lock key is one account and one day. Board reads do not take it, and
another account's day uses another key. Writers of that tenant-day
wait so a `COMPLETE` tally cannot tear. That wait is the consistency
side of the trade. The consistency choice is closed-day stability.
`COMPLETE` does not move. Callers that still expect cards leave the
synopsis in `AWAITING_PROJECTION`. That is a fresher answer withheld on purpose,
so two agents cannot observe different tallies for a day that was
already published. The row store that serves board writes is not
waiting on this publish, which is the availability side of the same
trade. The 99.99% target applies to that row path. Synopsis lag is
visible as `AWAITING_PROJECTION` rather than as a timeout on a
neighbor's board query.

## 14. Guardrails and neighbor protection

- Tenant scope: `accs_require_tenant` compares the argument with
  `app.account_id`. A mismatch raises `TENANT SCOPE REJECTED` before
  any read of another tenant's cards.
- Session projection budget: one unit per new card. The unit cap is
  below 1,000,000.
- Day card budget: a day over the cap is `DAY OVER CARD BUDGET` on
  project and `REFUSED_OVER_BUDGET` on publish. Tallies stay null.
- Board gate: `reject_agent_accs_board_scan` records `FULL SCAN REJECTED`
  and returns that reason. It does not start a scan.
- Second reader: `reject_agent_accs_second_reader` records the attempt
  and returns `SECOND READER REJECTED`. There is no grant function.
- Recursive expansion is not representable. The SQL has no recursive
  common table expression and no join.
- Tool execution, fact bodies, packet scans, trusted enrollment, and
  nested expiry are rejected at the card boundary.
- Advisory lock on audit append serializes one tenant's hash chain
  without locking another tenant's rows.
- Tenant-day lock: `accs_lock_tenant_day` serializes card insert,
  projection, and publish for one `(account_id, utc_day)`. It uses the
  two-integer advisory namespace, so the audit chain keeps the
  one-integer lock. Another account waits on its own key.

## 15. Performance check for boards with 1M+ rows

`FULL SCAN REJECTED` is the planned outcome for an unscoped board walk
or an estimate of 1,000,000 rows or more. Publish and rollup read
`agent_accs_synopsis` and `agent_accs_day_counter` by
`(account_id, utc_day)`. The columnar segment primary key is
`(account_id, utc_day, bucket)`, so a complete day touches at most
three tally rows. Projection reads one sealed card by
`(account_id, utc_day, consumer_principal_id)`.

The card table can grow with consumers. The publish path never walks
it and never issues `COUNT` against it. The tenant-day gate is an
advisory lock on `(account_id, utc_day)`. Publish still reads the
counter and at most three tally rows by primary key. The counter is
maintained on insert. A tenant that seals more cards than `max_cards_per_day` still
pays one index update per insert, then one point read that refuses the
day. Neighbor board queries do not share that fold. Indexes in this
schema lead with `account_id`.

## 16. Auditability and replay

Every new projection and every synopsis insert or transition appends
`agent_accs_audit_event`. The digest chains to the previous digest for
that `account_id` only. The entity key is the consumer id plus bucket,
or the day plus completeness plus synopsis digest. It is not a fact
body. Replaying `project_agent_accs_card` does not append a second
event. Replaying a `COMPLETE` publish does not append a second event
and does not change the digest. An auditor recomputes
`accs_synopsis_digest` from the synopsis columns.

## 17. Threat and failure analysis

| Failure | Result |
| --- | --- |
| Account argument disagrees with the session setting | `TENANT SCOPE REJECTED` |
| Card enables a fact body, tool, packet scan, trusted key, or nested expiry | `UNSAFE CARD REJECTED` or `TRUSTED ENROLLMENT REJECTED` |
| Card access path is a board scan | `FULL SCAN REJECTED` |
| Reader or consumer is a synopsis steward | `SECOND READER REJECTED` |
| Explicit second-reader request | row in `agent_accs_second_reader_rejection`, no grant |
| Day cardinality over budget | null tallies, `STOP_CARD_DAY_SYNOPSIS` |
| Direct tally or synopsis write | `COLUMN TALLY REJECTED` or `SYNOPSIS WRITE REJECTED` |
| Direct day-counter insert or sealed increment | `DAY COUNTER IMMUTABLE` |
| Card insert while publish holds the day | `SYNOPSIS PUBLISH IN PROGRESS` |
| Card inserted after `COMPLETE` | `SYNOPSIS ALREADY SEALED` |
| Approved budget mutated | `APPROVED PROFILE IMMUTABLE` |

A stolen agent prompt cannot widen `app.account_id`. The resolver sets
that value from the credential. The prompt can still ask for a scan.
The scan function refuses it and leaves a tenant-scoped rejection row.

## 18. Observability and SLOs

Count `AWAITING_PROJECTION` days, `REFUSED_OVER_BUDGET` days, scan
rejections, and second-reader rejections per `account_id`. Alert on
those counts. Do not alert by running a board scan, and do not alert
on a wall-clock age of an awaiting row. `published_at` on an
`AWAITING_PROJECTION` row is the time publish was attempted, not how
far the fold is behind. Awaiting freshness is the integer unprojected
card count, `sealed_card_count - projected_count`, on
`agent_accs_day_counter`, read by primary key `(account_id, utc_day)`.
That gap is stable under replay. It is the operator watermark already
stored on the counter. It is not an agent field.
`admittedCountCardSynopsis` does not expose `projectedCount`,
`sealedCardCount`, or the unprojected card count. The synopsis row
copies `projected_count` only when the digest changes, so a later
projection that leaves the day awaiting does not move that copy.
Operators read the counter. The sealed increment is the card-insert
trigger, and it adds one. A direct insert or a direct change of
`sealed_card_count` is `DAY COUNTER IMMUTABLE`. The gap stays the
number of inserted cards minus the number of projected cards.

The board path's availability target is 99.99%. The timestamp delta
from `agent_accs_day_counter.updated_at` to
`agent_accs_synopsis.published_at` applies for COMPLETE rows only.

## 19. Rollout

Ship the tables and functions dark. Approve one profile per tenant.
Project from the existing sealed-card stream one primary key at a
time. Publish when the operator closes the day. Point the agent read
API at `admittedCountCardSynopsis` only after a tenant has a
`COMPLETE` digest that replays. Keep the ack-hold card plane's own
reader path unchanged. This synopsis does not replace that point
lookup.

## 20. Ship criteria

- `npm run validate` executes the SQL, the GraphQL schema, and the
  TypeScript contracts.
- A four-card day publishes admitted 2, refused 1, omitted 1, and the
  digest replays.
- An empty day publishes zeros.
- An unprojected day publishes null tallies and `AWAITING_PROJECTION`.
- A day over budget publishes null tallies.
- A second project does not double-count.
- A second reader, a board scan of 1,000,000 rows, a fact body, a tool
  flag, and a nested expiry flag are rejected.
- A reader role under row-level security sees only its `account_id`.

## 21. Product decision

Ship the columnar day synopsis as the agent-facing summary of sealed
ack-hold cards. Do not wrap this synopsis in another acknowledgement,
hold, perception seal, expiry, or watermark plane. Reviewed
2026-10-28: operators do not need a new freshness watermark. Awaiting
freshness is the unprojected card count already stored on
`agent_accs_day_counter`. `admittedCountCardSynopsis` does not expose
that gap. This contract does not add a table, a GraphQL field, or a
plane to answer it. The engine remains deterministic, tenant scoped,
and unwilling to scan a 1M-row board to answer a daily tally.
