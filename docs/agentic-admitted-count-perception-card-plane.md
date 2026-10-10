# mondayDB Agentic Admitted Count Perception Card Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-10.v1`

## 1. Why this plane, before how

The 2026-10-09 Synopsis Lag Admission Plane seals one
`(account_id, utc_day)` as `ADMITTED`, `DENIED`, or
`UNKNOWN_EFFECT`. Its admission row keeps
`replay_sealed_count`, `replay_denied_count`, and
`replay_unknown_effect_count` for steward replay on every
class. It does not publish a separate count-perception
card for a day that is already admitted.

Without this plane an agent either:

- reads the admission grain and sees steward replay counts
  on a `DENIED` or `UNKNOWN_EFFECT` day, then treats those
  counts as permission to use the synopsis, or
- walks context packets, receipt rows, or a board with
  1M+ rows to recompute the three counts (neighbor-harmful,
  and a miss against the 99.99% availability target).

The product trade-off is **citation stability versus
budget freshness**, and **perception usefulness versus
count confidentiality**:

- Re-comparing `lag_publications` with a live profile
  budget would let a later profile edit hide or reveal
  counts after the admission sealed. This plane does not
  re-decide. It point-looks up the sealed admission and
  cites that class.
- Publishing the three counts for every class would make
  a denied or silent day look like a usable synopsis.
- Publishing nothing for an admitted day forces the agent
  back onto the steward grain or into a packet walk.
- This plane point-looks up one admission head by
  `(account_id, utc_day)`. `ADMITTED` copies the three
  replay counts onto a count-perception card.
  `DENIED` seals `STOP_SYNOPSIS_USE` with null counts.
  `UNKNOWN_EFFECT` seals `OMIT_COUNTS` with a null lag
  and null counts. The admission head is not rewritten.
  `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted.

Semantic similarity may discover card profiles. It must
never nominate a day, bind an admission, seal a card,
publish it, or notify a consumer.

Latency for the card is one primary-key read and one
primary-key write. Consistency is the sealed card plus
the admission id it cites. Neighbor availability stays at
the 99.99% target because an unscoped day walk or packet
walk is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved card profile is procedural memory for
   "how one already sealed admission becomes a count
   card." A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one `utc_day` by point
   lookup. The publish then reads
   `agent_acpc_admission_head` by `(account_id, utc_day)`.
   It does not recompute counts by scanning packets.
3. mondayDB copies counts only when `admission_class` is
   `ADMITTED`. The copy is equality with the replay
   counts. It does not call a model.
4. Sealing binds the class and two card stewards. Those
   stewards are distinct from each other, from the
   admission stewards, from the attestation stewards,
   from the synopsis stewards, and from the publication
   stewards. The card must not emit a fact body and must
   not emit `TRUSTED_ENROLLED`.
5. Publishing the card record is a second point lookup of
   `(account_id, utc_day)`. An admitted card appends
   `ADMITTED_COUNT_PERCEPTION_PUBLISHED`. Any other class
   appends `COUNT_PERCEPTION_WITHHELD` with null counts.
   Notify intents may become `UNKNOWN_EFFECT` until
   acknowledged. A notify acknowledgement is not
   enrollment, not a fact restore, and not a second
   admission.
6. Unscoped admission or board scans are
   **FULL SCAN REJECTED** before planning.

### Product outcome

For any account and UTC day, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, admission bind, card seal, publication, or
  notify dispatch?
- Was the card a point lookup of an already sealed
  admission, and what class did that admission have?
- Did an `ADMITTED` day publish `sealed_count`,
  `denied_count`, and `unknown_effect_count`?
- Did `DENIED` and `UNKNOWN_EFFECT` stay without counts?
- Did silence stay `UNKNOWN_EFFECT` with a null lag?
- Did `ACKED` stay an effect observation while the key
  stayed `AWAITING_CONFIRMATION` and the body stayed
  omitted?
- Did the admission head keep the replay counts it was
  exported with?
- Can the card be replayed without invoking an LLM?

HNSW profile discovery stays account-scoped and never
authorizes this card.

## 2. Scope and ownership

The Admitted Count Perception Card Plane owns:

1. Immutable approved card profiles as procedural memory
   of "how one sealed admission is shown to an agent
   without inlining a disputed fact, treating `ACKED` as
   `TRUSTED_ENROLLED`, scanning context packets, or
   opening another nested expiry."
2. Tenant-scoped card sessions with purpose and budget
   fences, and a hard cap of one nominated UTC day per
   session.
3. Deterministic nomination of that day, then one point
   lookup of the admission head.
4. A count-perception card keyed by `(account_id, utc_day)`
   that publishes the three counts only when the sealed
   class is `ADMITTED`.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the card. Counts are present only
   when `counts_published` is true.

It integrates with, but does not replace:

- **Synopsis Lag Admission Plane:** supplies the sealed
  admission this plane reads. Exporters copy the class,
  the lag, the budget, the three replay counts, the
  stewards, and the untrusted metadata onto
  `agent_acpc_admission_head` by point lookup of
  `(account_id, utc_day)`. This plane never re-admits the
  day and never promotes `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  publish, vector, and notify units. A denied day is a
  withheld card, not a scan of the packet log.

### Non-goals

- Letting an LLM decide that a denied day's replay counts
  are "safe enough to show."
- Rewriting `admission_class` or the replay counts on the
  admission head so a denied day becomes visible.
- Showing sealed counts to an agent when the class is
  `DENIED` or `UNKNOWN_EFFECT`. The admission head still
  stores the replay counts for steward replay. The card
  does not.
- Recomputing counts by scanning a board, a receipt log,
  or a citation ledger.
- Cross-account cards or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, packet bodies,
  or fact bodies on the card.
- Claiming distributed atomicity with external notify
  providers. Provider silence remains `UNKNOWN_EFFECT`.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because the synopsis effect was `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this card.

## 3. Product contract

### 3.1 Card profile contract

A profile version is immutable after approval. It defines:

- allowed classes (`ADMITTED`, `DENIED`, `UNKNOWN_EFFECT`);
- publish threshold (distinct card stewards, minimum 2),
  max days per session (exactly 1), and max nominated
  days (exactly 1);
- publish policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `CARD_NEVER_RESTORES_FACTS`,
  `CARD_NEVER_INLINES_BODY`, `CARD_NEVER_CONFIRMS`,
  `ONE_DAY_PER_SESSION`, `POINT_LOOKUP_ONLY`,
  `ADMISSION_HEAD_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `COUNTS_ONLY_WHEN_ADMITTED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_PUBLISH`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest compile
kind is `PUBLISH_COUNT_PERCEPTION_CARD` (30 bytes). The
longest publication reason is
`ADMITTED_COUNT_PERCEPTION_PUBLISHED` (35 bytes).

Approval and revocation require the authority fence
`approve_agent_acpc_profile` /
`revoke_agent_acpc_profile`, owned by
`agent_acpc_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, publish, vector, and notify units, plus wall time.
`max_days_per_session` and `max_nominated_days` are both
exactly 1. A second day nomination in the same session is
rejected before it can fan out into a recursive retrieval.

### 3.3 Admission head and nomination contract

Upstream admission export writes one admission head per
`(account_id, utc_day)`. The head copy includes
`admission_class`, `lag_publications`, `max_lag_budget`,
`freshness_class`, the three replay counts, and the
stewards. It does not include a fact body. The head is
immutable. This plane does not advance it and does not
reclassify it.

`nominate_agent_acpc_day(account_id, session_id, utc_day,
nomination_id, nomination_hash)` nominates that day. A
null `utc_day` is **FULL SCAN REJECTED**. The access path
is `POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` are rejected.

### 3.4 Publish and count-card contract

`publish_agent_acpc_count_card` is the only compile that
writes a count-perception card. It requires:

- a nomination of the same `(account_id, utc_day)`;
- one admission head for that key, with
  `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`,
  `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, and
  `packet_scan_used = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- card stewards distinct from each other and from both
  admission stewards, both attestation stewards, both
  synopsis stewards, and both publication stewards.

The grain is `(account_id, utc_day)`. Projection is:

- `UNKNOWN_EFFECT` when the head is silent or
  `lag_publications` is null. The card lag stays null.
  Counts stay null. `trusted_next_action` is
  `OMIT_COUNTS`. `counts_published` is false.
- `DENIED` when the sealed class is `DENIED`. Counts stay
  null. `trusted_next_action` is `STOP_SYNOPSIS_USE`.
  `counts_published` is false. The head's replay counts
  stay on the head.
- `ADMITTED` when the sealed class is `ADMITTED` and
  `lag_publications` is less than or equal to
  `max_lag_budget`. The card copies
  `replay_sealed_count`, `replay_denied_count`, and
  `replay_unknown_effect_count`. `counts_published` is
  true. `trusted_next_action` is `USE_SEALED_COUNTS`.

`card_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as
`effect_observation`. It does not write
`TRUSTED_ENROLLED`. The admission head row is not updated.
A forged `ADMITTED` card whose counts differ from the
head is rejected. A forged withheld card that carries any
count is rejected.

### 3.5 Notify and publication contract

`publish_agent_acpc_card_record` point-looks up
`(account_id, utc_day)` and appends one publication.
`ADMITTED` uses reason
`ADMITTED_COUNT_PERCEPTION_PUBLISHED` and copies the three
counts. `DENIED` and `UNKNOWN_EFFECT` use reason
`COUNT_PERCEPTION_WITHHELD` and store null counts. The
publication does not change the class. Effect intents
start as `PREPARED`. Provider silence stays
`UNKNOWN_EFFECT`. An acknowledgement does not enroll a
key, restore a fact, inline a body, or reveal withheld
counts.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`. RLS policy
   `tenant_isolation` is forced on every table.
2. Day nomination and card publication use point lookup.
   A missing `account_id` or `utc_day` is
   **FULL SCAN REJECTED**.
3. The card reads only the admission head for one
   `(account_id, utc_day)`. There is no context-packet
   table and no receipt-log scan in this plane.
4. `ACKED` is the effect observation copied onto the
   card. It never writes `TRUSTED_ENROLLED` or
   `TRUSTED_WITHIN_SKEW`.
5. `RESTORED` and `BODY_VISIBLE` are rejected.
6. `card_body` and `admission_body` never contain a fact
   body.
7. `opens_nested_expiry` is rejected. This plane does not
   start another expiry, containment, review, or
   resolution cycle.
8. `PACKET_SCAN`, `DAY_SCAN`, and `WATERMARK_SCAN` are
   rejected.
9. Card stewards are distinct from each other, from the
   admission stewards, from the attestation stewards,
   from the synopsis stewards, and from the publication
   stewards.
10. Profile approval and revocation go through the
    authority fence. Sealed profiles and sealed publish
    rules are immutable.
11. One session nominates one UTC day and writes one
    card.
12. Silence is not a lag of zero and is not `ADMITTED`.
    A card hash is not a fact hash.
13. The database engine stays deterministic. Agents above
    it may be probabilistic. Similarity never nominates a
    day and never authorizes a card.
14. The admission head is immutable. The card does not
    shrink a lag, rewrite a class, or clear replay counts.
15. Counts are published only for `ADMITTED`, and those
    counts must equal the head's replay counts. `DENIED`
    and `UNKNOWN_EFFECT` stay without counts.

## 5. Execution model

The admission head remains the authority for the sealed
class and the steward replay counts. This plane's row
store holds that exported head plus the sealed card. The
columnar grain is the card: one row per
`(account_id, utc_day)`, with counts populated only for
`ADMITTED`.

The publish reads one primary key and writes one binding,
one compile, one certificate, one decision, one card, and
one audit event in the same transaction. Publication is a
second point lookup that appends history without
rewriting the class or filling in withheld counts. Notify
dispatch is outside the ACID boundary and starts at
`PREPARED`.

An agent perceives the class, the lag, and the budget. It
perceives the three counts only when the class is
`ADMITTED`. It does not perceive the facts behind the
sealed synopsis, and it does not perceive replay counts
on a denied or silent day.

## 6. Lifecycle

### 6.1 Draft and approve

A profile is inserted as `DRAFT` with at least one
dual-control publish rule. `approve_agent_acpc_profile`
checks the definition hash and sets
`app.acpc_profile_approval` before the status becomes
`APPROVED`.

### 6.2 Open and nominate

A session opens under an approved profile.
`nominate_agent_acpc_day` requires a non-null `utc_day`.
A null day is **FULL SCAN REJECTED**.

### 6.3 Bind and project

Admission binding records the head the card will cite:
admission id, class, lag, and budget. Projection copies
counts only for `ADMITTED`. It cannot inline a body,
promote `ACKED`, or open a nested expiry. Silence yields
`UNKNOWN_EFFECT`, a null lag, and null counts.

### 6.4 Seal

Dual-control card stewards seal the certificate.
Admission, attestation, synopsis, and publication
stewards are excluded. The decision row
`PUBLISH_COUNT_PERCEPTION_CARD`, the card grain, and the
audit event commit together. The admission head stays
unchanged.

### 6.5 Publish and notify

`publish_agent_acpc_card_record` appends either
`ADMITTED_COUNT_PERCEPTION_PUBLISHED` or
`COUNT_PERCEPTION_WITHHELD`. Notify may remain
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

The session closes. Audit events stay hash-chained.
Revocation with `STOP_BEFORE_PUBLISH` blocks new
nominations. In-flight sealed cards remain replayable.
Withheld counts are not backfilled.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type AdmissionId = string & { readonly brand: "AdmissionId" };
type CardId = string & { readonly brand: "CardId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type PublicationId = string & { readonly brand: "PublicationId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };
type UtcDay = string & { readonly brand: "UtcDay" };

type TrustedNextAction =
  | "USE_SEALED_COUNTS"
  | "STOP_SYNOPSIS_USE"
  | "OMIT_COUNTS";

type CountCardBlockedReason =
  | "NULL_DAY_SCAN_DENIED"
  | "PACKET_SCAN_DENIED"
  | "FACT_BODY_INLINE_DENIED"
  | "ACK_AS_TRUST_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "STEWARD_REUSE_DENIED"
  | "ADMISSION_HEAD_MISSED"
  | "COUNTS_ON_WITHHELD_CARD"
  | "COUNTS_DRIFT_FROM_HEAD";

type ProfileStatus = "DRAFT" | "APPROVED" | "REVOKED";
type SessionStatus =
  | "OPEN"
  | "NOMINATING"
  | "PUBLISHING"
  | "SEALED"
  | "DISPATCHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
type FreshnessClass = "CURRENT" | "LAGGING" | "UNKNOWN_EFFECT";
type AccessPath = "POINT_LOOKUP" | "DAY_SCAN" | "PACKET_SCAN" | "WATERMARK_SCAN";
type AttestedKeyKind =
  | "AWAITING_CONFIRMATION"
  | "TRUSTED_ENROLLED"
  | "TRUSTED_WITHIN_SKEW"
  | "UNKNOWN_EFFECT";
type FactDisposition = "DISPUTED_HELD" | "RESTORED" | "UNKNOWN_EFFECT";
type BodyVisibility = "ENVELOPE_ONLY" | "BODY_VISIBLE" | "OMITTED";
type EffectObservation = "ACKED" | "FAILED" | "DISPATCHED" | "SILENCE" | "UNKNOWN_EFFECT";
type MetadataTrust = "UNTRUSTED_METADATA";
type EffectIntentStatus = "PREPARED" | "DISPATCHED" | "ACKED" | "FAILED" | "UNKNOWN_EFFECT";
type CompileKind =
  | "PUBLISH_COUNT_PERCEPTION_CARD"
  | "PUBLISH_CARD_RECORD"
  | "NOMINATE_DAY";
type PublicationReason =
  | "ADMITTED_COUNT_PERCEPTION_PUBLISHED"
  | "COUNT_PERCEPTION_WITHHELD";

interface CountCardProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly publishThreshold: number;
  readonly maxDaysPerSession: 1;
  readonly maxNominatedDays: 1;
  readonly procedureRef: string;
  readonly revocationPolicy: "ALLOW_IN_FLIGHT" | "STOP_BEFORE_PUBLISH" | "REQUIRE_REVIEW";
}

interface AdmissionHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly admissionId: AdmissionId;
  readonly admissionClass: AdmissionClass;
  readonly freshnessClass: FreshnessClass;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly silenceObserved: boolean;
  readonly replaySealedCount: number;
  readonly replayDeniedCount: number;
  readonly replayUnknownEffectCount: number;
  readonly countsVisible: boolean;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: "AWAITING_CONFIRMATION";
  readonly factDisposition: "DISPUTED_HELD";
  readonly bodyVisibility: "OMITTED";
  readonly metadataTrust: MetadataTrust;
  readonly ackPromotedToTrust: false;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly packetScanUsed: false;
  readonly accessPath: "POINT_LOOKUP";
}

function countsPublishedFor(admissionClass: AdmissionClass): boolean {
  return admissionClass === "ADMITTED";
}

export type {
  AccountId,
  AdmissionClass,
  AdmissionHead,
  AdmissionId,
  CardId,
  CompileKind,
  CountCardBlockedReason,
  CountCardProfile,
  FreshnessClass,
  PublicationReason,
  TrustedNextAction,
};
export { countsPublishedFor };
```

```ts
interface CountPerceptionCard {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly cardId: CardId;
  readonly admissionId: AdmissionId;
  readonly admissionClass: AdmissionClass;
  readonly freshnessClass: FreshnessClass;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly countsPublished: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly attestedKeyKind: "AWAITING_CONFIRMATION";
  readonly metadataTrust: MetadataTrust;
  readonly factDisposition: "DISPUTED_HELD";
  readonly bodyVisibility: "OMITTED";
  readonly effectObservation: EffectObservation;
  readonly ackPromotedToTrust: false;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly packetScanUsed: false;
  readonly trustedNextAction: TrustedNextAction;
  readonly publicationReason: PublicationReason;
}

interface CountCardDecisionResult {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly compileKind: "PUBLISH_COUNT_PERCEPTION_CARD";
  readonly card: CountPerceptionCard;
  readonly blockedReason: CountCardBlockedReason | null;
}

function projectCountCard(head: AdmissionHead, cardId: CardId): CountPerceptionCard {
  const admitted = head.admissionClass === "ADMITTED";
  const trustedNextAction: TrustedNextAction =
    head.admissionClass === "ADMITTED"
      ? "USE_SEALED_COUNTS"
      : head.admissionClass === "DENIED"
        ? "STOP_SYNOPSIS_USE"
        : "OMIT_COUNTS";
  return {
    accountId: head.accountId,
    utcDay: head.utcDay,
    cardId,
    admissionId: head.admissionId,
    admissionClass: head.admissionClass,
    freshnessClass: head.freshnessClass,
    lagPublications: head.admissionClass === "UNKNOWN_EFFECT" ? null : head.lagPublications,
    maxLagBudget: head.maxLagBudget,
    countsPublished: admitted,
    sealedCount: admitted ? head.replaySealedCount : null,
    deniedCount: admitted ? head.replayDeniedCount : null,
    unknownEffectCount: admitted ? head.replayUnknownEffectCount : null,
    attestedKeyKind: "AWAITING_CONFIRMATION",
    metadataTrust: "UNTRUSTED_METADATA",
    factDisposition: "DISPUTED_HELD",
    bodyVisibility: "OMITTED",
    effectObservation: head.effectObservation,
    ackPromotedToTrust: false,
    inlinesFactBody: false,
    opensNestedExpiry: false,
    packetScanUsed: false,
    trustedNextAction,
    publicationReason: admitted
      ? "ADMITTED_COUNT_PERCEPTION_PUBLISHED"
      : "COUNT_PERCEPTION_WITHHELD",
  };
}

function countCardDecision(
  head: AdmissionHead,
  cardId: CardId,
  decisionId: DecisionId,
): CountCardDecisionResult {
  return {
    accountId: head.accountId,
    decisionId,
    compileKind: "PUBLISH_COUNT_PERCEPTION_CARD",
    card: projectCountCard(head, cardId),
    blockedReason: null,
  };
}

export type { CountCardDecisionResult, CountPerceptionCard };
export { countCardDecision, projectCountCard };
```

## 8. SQL row-store schema

```sql
CREATE TYPE acpc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE acpc_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'PUBLISHING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE acpc_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE acpc_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE acpc_denial_reason AS ENUM (
  'NULL_DAY_SCAN_DENIED',
  'PACKET_SCAN_DENIED',
  'FACT_BODY_INLINE_DENIED',
  'ACK_AS_TRUST_DENIED',
  'NESTED_EXPIRY_DENIED',
  'STEWARD_REUSE_DENIED',
  'ADMISSION_HEAD_MISSED',
  'COUNTS_ON_WITHHELD_CARD',
  'COUNTS_DRIFT_FROM_HEAD'
);
CREATE TYPE acpc_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE acpc_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW', 'UNKNOWN_EFFECT'
);
CREATE TYPE acpc_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'RESTORED', 'UNKNOWN_EFFECT'
);
CREATE TYPE acpc_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE acpc_access_path AS ENUM (
  'POINT_LOOKUP', 'DAY_SCAN', 'PACKET_SCAN', 'WATERMARK_SCAN'
);
CREATE TYPE acpc_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE acpc_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE acpc_compile_kind AS ENUM (
  'PUBLISH_COUNT_PERCEPTION_CARD', 'PUBLISH_CARD_RECORD', 'NOMINATE_DAY'
);
CREATE TYPE acpc_terminal_kind AS ENUM (
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE acpc_next_action AS ENUM (
  'USE_SEALED_COUNTS', 'STOP_SYNOPSIS_USE', 'OMIT_COUNTS'
);
CREATE TYPE acpc_publication_reason AS ENUM (
  'ADMITTED_COUNT_PERCEPTION_PUBLISHED', 'COUNT_PERCEPTION_WITHHELD'
);

CREATE ROLE agent_acpc_profile_authority NOLOGIN;

CREATE TABLE agent_acpc_authorization_evidence (
  account_id BIGINT NOT NULL,
  evidence_id UUID NOT NULL,
  principal_id TEXT NOT NULL,
  policy_revision BIGINT NOT NULL CHECK (policy_revision >= 0),
  resource_acl_revision BIGINT NOT NULL CHECK (resource_acl_revision >= 0),
  redacted_scope_summary JSONB NOT NULL,
  encrypted_evidence_ref TEXT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  immutable_archive_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evidence_id),
  UNIQUE (account_id, evidence_id, evidence_hash),
  CHECK (length(evidence_hash) = 64)
);

CREATE TABLE agent_acpc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status acpc_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  publish_threshold SMALLINT NOT NULL CHECK (publish_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN ('ALLOW_IN_FLIGHT', 'STOP_BEFORE_PUBLISH', 'REQUIRE_REVIEW')
  ),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  UNIQUE (account_id, profile_id, profile_version, definition_hash),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acpc_authorization_evidence (account_id, evidence_id),
  CHECK (
    (status = 'DRAFT' AND approved_at IS NULL AND approval_validation_hash IS NULL) OR
    (status IN ('APPROVED', 'REVOKED') AND approved_at IS NOT NULL
      AND approval_validation_hash IS NOT NULL)
  ),
  CHECK (
    (status <> 'REVOKED' AND revoked_by IS NULL AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CHECK (length(authorization_snapshot_hash) = 64)
);

CREATE TABLE agent_acpc_profile_publish_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_classes TEXT[] NOT NULL,
  publish_threshold SMALLINT NOT NULL CHECK (publish_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  require_dual_control_publish BOOLEAN NOT NULL,
  publish_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acpc_profile (account_id, profile_id, profile_version),
  CHECK (require_dual_control_publish = true)
);

CREATE TABLE agent_acpc_admission_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  admission_id UUID NOT NULL,
  admission_hash CHAR(64) NOT NULL CHECK (length(admission_hash) = 64),
  admission_class acpc_admission_class NOT NULL,
  freshness_class acpc_freshness_class NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT,
  replay_sealed_count BIGINT NOT NULL CHECK (replay_sealed_count >= 0),
  replay_denied_count BIGINT NOT NULL CHECK (replay_denied_count >= 0),
  replay_unknown_effect_count BIGINT NOT NULL CHECK (replay_unknown_effect_count >= 0),
  counts_visible BOOLEAN NOT NULL,
  silence_observed BOOLEAN NOT NULL,
  admission_steward_a TEXT NOT NULL,
  admission_steward_b TEXT NOT NULL,
  attestation_steward_a TEXT NOT NULL,
  attestation_steward_b TEXT NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  effect_observation acpc_effect_observation NOT NULL,
  attested_key_kind acpc_key_kind NOT NULL,
  fact_disposition acpc_fact_disposition NOT NULL,
  body_visibility acpc_body_visibility NOT NULL,
  metadata_trust acpc_metadata_trust NOT NULL,
  access_path acpc_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  admission_body JSONB NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, admission_id),
  CHECK (admission_steward_a <> admission_steward_b),
  CHECK (attestation_steward_a <> attestation_steward_b),
  CHECK (synopsis_steward_a <> synopsis_steward_b),
  CHECK (publication_steward_a <> publication_steward_b),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (NOT (admission_body ? 'factBody')),
  CHECK (NOT (admission_body ? 'fact_body')),
  CHECK (NOT (admission_body ? 'resolvedFactHash')),
  CHECK (admission_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (
    (admission_class = 'ADMITTED' AND silence_observed = false
      AND lag_publications IS NOT NULL AND lag_publications <= max_lag_budget
      AND counts_visible = true AND effect_observation = 'ACKED')
    OR (admission_class = 'DENIED' AND silence_observed = false
      AND lag_publications IS NOT NULL AND lag_publications > max_lag_budget
      AND counts_visible = false AND effect_observation = 'ACKED')
    OR (admission_class = 'UNKNOWN_EFFECT' AND silence_observed = true
      AND lag_publications IS NULL AND counts_visible = false
      AND newest_receipt_publication_cursor IS NULL
      AND effect_observation = 'UNKNOWN_EFFECT')
  ),
  CHECK (
    (freshness_class = 'CURRENT' AND lag_publications = 0)
    OR (freshness_class = 'LAGGING' AND lag_publications > 0)
    OR (freshness_class = 'UNKNOWN_EFFECT' AND lag_publications IS NULL)
  )
);

CREATE TABLE agent_acpc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status acpc_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_publish_units BIGINT NOT NULL CHECK (budget_publish_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_publish_units BIGINT NOT NULL CHECK (consumed_publish_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  publish_threshold SMALLINT NOT NULL CHECK (publish_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL CHECK (length(delegated_scope_hash) = 64),
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL CHECK (length(resource_scope_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, idempotency_key),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_acpc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_acpc_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_notify_units <= budget_notify_units)
);

CREATE TABLE agent_acpc_day_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  access_path acpc_access_path NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id),
  CHECK (access_path = 'POINT_LOOKUP')
);

CREATE TABLE agent_acpc_admission_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  admission_id UUID NOT NULL,
  admission_class acpc_admission_class NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_acpc_admission_head (account_id, utc_day)
);

CREATE TABLE agent_acpc_card_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  admission_class acpc_admission_class NOT NULL,
  counts_published BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id)
);

CREATE TABLE agent_acpc_card_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  utc_day DATE NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  admission_class acpc_admission_class NOT NULL,
  counts_published BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
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
  sealed_revision INTEGER NOT NULL CHECK (sealed_revision > 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_acpc_card_compile (account_id, compile_id),
  CHECK (card_steward_a <> card_steward_b),
  CHECK (admission_steward_a <> admission_steward_b),
  CHECK (attestation_steward_a <> attestation_steward_b),
  CHECK (synopsis_steward_a <> synopsis_steward_b),
  CHECK (publication_steward_a <> publication_steward_b)
);

CREATE TABLE agent_acpc_card_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  compile_kind acpc_compile_kind NOT NULL,
  admission_class acpc_admission_class NOT NULL,
  freshness_class acpc_freshness_class NOT NULL,
  effect_observation acpc_effect_observation NOT NULL,
  attested_key_kind acpc_key_kind NOT NULL,
  fact_disposition acpc_fact_disposition NOT NULL,
  body_visibility acpc_body_visibility NOT NULL,
  access_path acpc_access_path NOT NULL,
  metadata_trust acpc_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  counts_published BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpc_card_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id)
);

CREATE TABLE agent_acpc_count_perception_card (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  card_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  admission_id UUID NOT NULL,
  admission_class acpc_admission_class NOT NULL,
  freshness_class acpc_freshness_class NOT NULL,
  counts_published BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation acpc_effect_observation NOT NULL,
  attested_key_kind acpc_key_kind NOT NULL,
  fact_disposition acpc_fact_disposition NOT NULL,
  body_visibility acpc_body_visibility NOT NULL,
  metadata_trust acpc_metadata_trust NOT NULL,
  access_path acpc_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  trusted_next_action acpc_next_action NOT NULL,
  card_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, card_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpc_card_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_acpc_admission_head (account_id, utc_day),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (card_body ? 'factBody')),
  CHECK (NOT (card_body ? 'fact_body')),
  CHECK (NOT (card_body ? 'resolvedFactHash')),
  CHECK (
    (counts_published = true AND card_body ? 'sealedCount'
      AND card_body ? 'deniedCount' AND card_body ? 'unknownEffectCount')
    OR (counts_published = false AND NOT (card_body ? 'sealedCount')
      AND NOT (card_body ? 'deniedCount') AND NOT (card_body ? 'unknownEffectCount'))
  ),
  CHECK (
    (admission_class = 'ADMITTED' AND counts_published = true
      AND trusted_next_action = 'USE_SEALED_COUNTS'
      AND sealed_count IS NOT NULL AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL)
    OR (admission_class = 'DENIED' AND counts_published = false
      AND trusted_next_action = 'STOP_SYNOPSIS_USE'
      AND sealed_count IS NULL AND denied_count IS NULL
      AND unknown_effect_count IS NULL)
    OR (admission_class = 'UNKNOWN_EFFECT' AND counts_published = false
      AND trusted_next_action = 'OMIT_COUNTS'
      AND sealed_count IS NULL AND denied_count IS NULL
      AND unknown_effect_count IS NULL
      AND lag_publications IS NULL)
  )
);

CREATE TABLE agent_acpc_card_publication (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  card_id UUID NOT NULL,
  reason_code acpc_publication_reason NOT NULL,
  admission_class acpc_admission_class NOT NULL,
  counts_published BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, utc_day),
  FOREIGN KEY (account_id, card_id)
    REFERENCES agent_acpc_count_perception_card (account_id, card_id)
);

CREATE TABLE agent_acpc_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status acpc_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL CHECK (length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_acpc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_acpc_card_certificate (account_id, certificate_id)
);

CREATE TABLE agent_acpc_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units BIGINT NOT NULL CHECK (units >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id)
);

CREATE TABLE agent_acpc_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  terminal_kind acpc_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id)
);

CREATE TABLE agent_acpc_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  result_hash CHAR(64) NOT NULL CHECK (length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id)
);

CREATE TABLE agent_acpc_audit_head (
  account_id BIGINT NOT NULL,
  head_id UUID NOT NULL,
  latest_hash CHAR(64) NOT NULL CHECK (length(latest_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, head_id)
);

CREATE TABLE agent_acpc_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  previous_hash CHAR(64) NOT NULL CHECK (length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_acpc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  anchor_hash CHAR(64) NOT NULL CHECK (length(anchor_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_acpc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  card_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id)
);

CREATE FUNCTION protect_agent_acpc_profile()
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
      IF current_setting('app.acpc_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.acpc_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_acpc_profile_protect
BEFORE INSERT OR UPDATE ON agent_acpc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_profile();

CREATE FUNCTION protect_agent_acpc_publish_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status acpc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_acpc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed publish rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_acpc_publish_rule_protect
BEFORE UPDATE ON agent_acpc_profile_publish_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_publish_rule();

CREATE FUNCTION protect_agent_acpc_admission_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed admission head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.admission_body ? 'factBody'
     OR NEW.admission_body ? 'fact_body'
     OR NEW.admission_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.admission_class = 'ADMITTED'
     AND (NEW.lag_publications IS NULL OR NEW.lag_publications > NEW.max_lag_budget
          OR NEW.counts_visible IS DISTINCT FROM TRUE) THEN
    RAISE EXCEPTION 'admission class forged above the lag budget';
  END IF;

  IF NEW.admission_class = 'DENIED'
     AND (NEW.counts_visible OR NEW.lag_publications IS NULL
          OR NEW.lag_publications <= NEW.max_lag_budget) THEN
    RAISE EXCEPTION 'denied head must sit above the lag budget without publishing counts';
  END IF;

  IF NEW.admission_class = 'UNKNOWN_EFFECT'
     AND (NEW.lag_publications IS NOT NULL OR NEW.counts_visible OR NOT NEW.silence_observed) THEN
    RAISE EXCEPTION 'silence is not an admission';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_acpc_admission_head_protect
BEFORE INSERT OR UPDATE ON agent_acpc_admission_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_admission_head();

CREATE FUNCTION protect_agent_acpc_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.card_hash IS DISTINCT FROM NEW.card_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'count card decision identity is immutable';
    END IF;
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW') THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.fact_disposition = 'RESTORED'
     OR NEW.body_visibility = 'BODY_VISIBLE' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence';
  END IF;

  IF NEW.packet_scan_used OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.admission_class = 'ADMITTED' AND NEW.counts_published IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'admitted card must publish counts';
  END IF;

  IF NEW.admission_class <> 'ADMITTED' AND NEW.counts_published THEN
    RAISE EXCEPTION 'withheld card cannot carry counts';
  END IF;

  IF NEW.admission_class = 'UNKNOWN_EFFECT' AND NEW.lag_publications IS NOT NULL THEN
    RAISE EXCEPTION 'silence is not a count card';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_acpc_decision_protect
BEFORE INSERT OR UPDATE ON agent_acpc_card_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_decision();

CREATE FUNCTION protect_agent_acpc_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.card_steward_a = NEW.card_steward_b
     OR NEW.card_steward_a IN (
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.card_steward_b IN (
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.admission_steward_a = NEW.admission_steward_b
     OR NEW.attestation_steward_a = NEW.attestation_steward_b
     OR NEW.synopsis_steward_a = NEW.synopsis_steward_b
     OR NEW.publication_steward_a = NEW.publication_steward_b THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_acpc_certificate_protect
BEFORE INSERT OR UPDATE ON agent_acpc_card_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_certificate();

CREATE FUNCTION protect_agent_acpc_effect_intent()
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

CREATE TRIGGER agent_acpc_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_acpc_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_effect_intent();

CREATE FUNCTION protect_agent_acpc_count_card()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_card$
DECLARE
  v_head agent_acpc_admission_head%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed count perception card is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.card_body ? 'factBody'
     OR NEW.card_body ? 'fact_body'
     OR NEW.card_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'count card fence';
  END IF;

  SELECT * INTO v_head
  FROM agent_acpc_admission_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admission head point lookup missed';
  END IF;

  IF v_head.admission_class IS DISTINCT FROM NEW.admission_class
     OR v_head.admission_id IS DISTINCT FROM NEW.admission_id THEN
    RAISE EXCEPTION 'card class drifted from the admission head';
  END IF;

  IF NEW.admission_class = 'ADMITTED' THEN
    IF NEW.counts_published IS DISTINCT FROM TRUE
       OR NEW.sealed_count IS DISTINCT FROM v_head.replay_sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.replay_denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.replay_unknown_effect_count THEN
      RAISE EXCEPTION 'admitted card must copy the replay counts';
    END IF;
  ELSIF NEW.counts_published
     OR NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL THEN
    RAISE EXCEPTION 'withheld card cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_card$;

CREATE TRIGGER agent_acpc_count_card_protect
BEFORE INSERT OR UPDATE ON agent_acpc_count_perception_card
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_count_card();

CREATE FUNCTION protect_agent_acpc_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_publication$
BEGIN
  IF NEW.reason_code = 'ADMITTED_COUNT_PERCEPTION_PUBLISHED' THEN
    IF NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.counts_published IS DISTINCT FROM TRUE
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL THEN
      RAISE EXCEPTION 'published counts require an admitted card';
    END IF;
  ELSIF NEW.reason_code = 'COUNT_PERCEPTION_WITHHELD' THEN
    IF NEW.admission_class = 'ADMITTED'
       OR NEW.counts_published
       OR NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL THEN
      RAISE EXCEPTION 'withheld publication cannot carry counts';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown publication reason';
  END IF;
  RETURN NEW;
END
$protect_publication$;

CREATE TRIGGER agent_acpc_publication_protect
BEFORE INSERT OR UPDATE ON agent_acpc_card_publication
FOR EACH ROW EXECUTE FUNCTION protect_agent_acpc_publication();

CREATE FUNCTION approve_agent_acpc_profile(
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
  stored_hash CHAR(64);
  stored_status acpc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acpc_profile
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
  FOR UPDATE;

  IF length(p_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM p_definition_hash THEN
    RAISE EXCEPTION 'profile approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO rule_count
  FROM agent_acpc_profile_publish_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_publish IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control publish rule';
  END IF;

  PERFORM set_config(
    'app.acpc_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acpc_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_acpc_profile(
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
  stored_hash CHAR(64);
  stored_status acpc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_acpc_profile
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
  FOR UPDATE;

  IF length(p_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM p_definition_hash THEN
    RAISE EXCEPTION 'profile revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.acpc_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_acpc_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_acpc_day(
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
  v_session_status acpc_session_status;
  v_profile_status acpc_profile_status;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF length(p_nomination_hash) <> 64 THEN
    RAISE EXCEPTION 'nomination hash must be 64 hex characters';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_acpc_day_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one utc day per session';
  END IF;

  SELECT s.status, pr.status
    INTO v_session_status, v_profile_status
  FROM agent_acpc_session AS s
  JOIN agent_acpc_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'nomination requires an open session on an approved profile';
  END IF;

  INSERT INTO agent_acpc_day_nomination (
    account_id, nomination_id, session_id, utc_day,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION publish_agent_acpc_count_card(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_card_id UUID,
  p_card_digest TEXT,
  p_card_steward_a TEXT,
  p_card_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish_card$
DECLARE
  v_nominated DATE;
  v_head agent_acpc_admission_head%ROWTYPE;
  v_counts_published BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next acpc_next_action;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF length(p_card_digest) <> 64 THEN
    RAISE EXCEPTION 'card digest must be 64 hex characters';
  END IF;

  SELECT utc_day INTO v_nominated
  FROM agent_acpc_day_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated IS DISTINCT FROM p_utc_day THEN
    RAISE EXCEPTION 'card publish requires a nominated utc_day point lookup';
  END IF;

  SELECT * INTO v_head
  FROM agent_acpc_admission_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admission head point lookup missed';
  END IF;

  IF v_head.inlines_fact_body
     OR v_head.opens_nested_expiry
     OR v_head.ack_promoted_to_trust
     OR v_head.packet_scan_used
     OR v_head.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_head.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR v_head.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR v_head.body_visibility IS DISTINCT FROM 'OMITTED'
     OR v_head.admission_body ? 'factBody'
     OR v_head.admission_body ? 'fact_body'
     OR v_head.admission_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'count card fence';
  END IF;

  IF p_card_steward_a = p_card_steward_b
     OR p_card_steward_a IN (
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_card_steward_b IN (
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     ) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;

  IF v_head.admission_class = 'ADMITTED' THEN
    v_counts_published := true;
    v_sealed := v_head.replay_sealed_count;
    v_denied := v_head.replay_denied_count;
    v_unknown := v_head.replay_unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'USE_SEALED_COUNTS';
  ELSIF v_head.admission_class = 'DENIED' THEN
    v_counts_published := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_SYNOPSIS_USE';
  ELSE
    v_counts_published := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_COUNTS';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'admissionClass', v_head.admission_class,
    'lagPublications', v_lag,
    'maxLagBudget', v_head.max_lag_budget,
    'countsPublished', v_counts_published,
    'metadataTrust', 'UNTRUSTED_METADATA',
    'attestedKeyKind', 'AWAITING_CONFIRMATION',
    'ackPromotedToTrust', false,
    'inlinesFactBody', false,
    'opensNestedExpiry', false,
    'packetScanUsed', false
  );
  IF v_counts_published THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_acpc_admission_binding (
    account_id, binding_id, session_id, utc_day, admission_id,
    admission_class, lag_publications, max_lag_budget, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, v_head.admission_id,
    v_head.admission_class, v_lag, v_head.max_lag_budget,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpc_card_compile (
    account_id, compile_id, session_id, utc_day,
    admission_class, counts_published, lag_publications, max_lag_budget,
    card_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day,
    v_head.admission_class, v_counts_published, v_lag, v_head.max_lag_budget,
    p_card_digest, clock_timestamp()
  );

  INSERT INTO agent_acpc_card_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_ref,
    utc_day, purpose_hash, admission_class, counts_published,
    lag_publications, max_lag_budget,
    card_steward_a, card_steward_b,
    admission_steward_a, admission_steward_b,
    attestation_steward_a, attestation_steward_b,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_certificate_id, p_session_id, p_compile_id,
    'consumer:count-card-agent', p_utc_day, p_card_digest,
    v_head.admission_class, v_counts_published, v_lag, v_head.max_lag_budget,
    p_card_steward_a, p_card_steward_b,
    v_head.admission_steward_a, v_head.admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpc_card_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    compile_kind, admission_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path,
    metadata_trust, opens_nested_expiry, inlines_fact_body,
    ack_promoted_to_trust, packet_scan_used, counts_published,
    lag_publications, max_lag_budget, card_hash, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    'PUBLISH_COUNT_PERCEPTION_CARD', v_head.admission_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
    'OMITTED', 'POINT_LOOKUP', 'UNTRUSTED_METADATA',
    false, false, false, false, v_counts_published,
    v_lag, v_head.max_lag_budget, p_card_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpc_count_perception_card (
    account_id, utc_day, card_id, session_id, certificate_id, admission_id,
    admission_class, freshness_class, counts_published,
    sealed_count, denied_count, unknown_effect_count,
    lag_publications, max_lag_budget, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, metadata_trust, access_path,
    inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, trusted_next_action, card_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_card_id, p_session_id, p_certificate_id, v_head.admission_id,
    v_head.admission_class, v_head.freshness_class, v_counts_published,
    v_sealed, v_denied, v_unknown,
    v_lag, v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, v_next, v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_acpc_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'COUNT_PERCEPTION_CARD_SEALED',
    p_card_digest, repeat('0', 64), clock_timestamp()
  );
END
$publish_card$;

CREATE FUNCTION publish_agent_acpc_card_record(
  p_tenant_id BIGINT,
  p_utc_day DATE,
  p_card_id UUID,
  p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish_record$
DECLARE
  v_card agent_acpc_count_perception_card%ROWTYPE;
  v_reason acpc_publication_reason;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL OR p_card_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_card
  FROM agent_acpc_count_perception_card
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND
     OR v_card.card_id IS DISTINCT FROM p_card_id
     OR v_card.inlines_fact_body
     OR v_card.ack_promoted_to_trust
     OR v_card.opens_nested_expiry
     OR v_card.packet_scan_used
     OR v_card.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'card publication requires a sealed day point lookup';
  END IF;

  IF v_card.counts_published AND v_card.admission_class = 'ADMITTED' THEN
    v_reason := 'ADMITTED_COUNT_PERCEPTION_PUBLISHED';
  ELSE
    v_reason := 'COUNT_PERCEPTION_WITHHELD';
  END IF;

  INSERT INTO agent_acpc_card_publication (
    account_id, record_id, utc_day, card_id, reason_code, admission_class,
    counts_published, sealed_count, denied_count, unknown_effect_count,
    lag_publications, max_lag_budget, created_at
  ) VALUES (
    p_tenant_id, p_record_id, p_utc_day, p_card_id, v_reason, v_card.admission_class,
    v_card.counts_published,
    CASE WHEN v_card.counts_published THEN v_card.sealed_count ELSE NULL END,
    CASE WHEN v_card.counts_published THEN v_card.denied_count ELSE NULL END,
    CASE WHEN v_card.counts_published THEN v_card.unknown_effect_count ELSE NULL END,
    v_card.lag_publications, v_card.max_lag_budget, clock_timestamp()
  );
END
$publish_record$;

CREATE FUNCTION reject_agent_acpc_unscoped_scan(
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

ALTER FUNCTION approve_agent_acpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acpc_profile_authority;
ALTER FUNCTION revoke_agent_acpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_acpc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_acpc_profile_authority;
GRANT SELECT ON
  agent_acpc_profile,
  agent_acpc_profile_publish_rule
TO agent_acpc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acpc_profile TO agent_acpc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_acpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_acpc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_acpc_profile FROM PUBLIC;

CREATE INDEX agent_acpc_session_work_idx ON agent_acpc_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_acpc_session_profile_idx ON agent_acpc_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_acpc_head_day_idx ON agent_acpc_admission_head (
  account_id, utc_day, admission_class
);
CREATE INDEX agent_acpc_nomination_session_idx ON agent_acpc_day_nomination (
  account_id, session_id, utc_day
);
CREATE INDEX agent_acpc_certificate_session_idx ON agent_acpc_card_certificate (
  account_id, session_id, utc_day
);
CREATE INDEX agent_acpc_decision_cert_idx ON agent_acpc_card_decision (
  account_id, certificate_id, decision_id
);
CREATE INDEX agent_acpc_card_class_idx ON agent_acpc_count_perception_card (
  account_id, admission_class, utc_day
);
CREATE INDEX agent_acpc_card_id_idx ON agent_acpc_count_perception_card (
  account_id, card_id
);
CREATE INDEX agent_acpc_publication_day_idx ON agent_acpc_card_publication (
  account_id, utc_day, record_id
);
CREATE INDEX agent_acpc_effect_work_idx ON agent_acpc_effect_intent (
  account_id, intent_status, updated_at, effect_id
);
CREATE INDEX agent_acpc_audit_time_idx ON agent_acpc_audit_event (
  account_id, created_at DESC, event_id
);
CREATE INDEX agent_acpc_command_expiry_idx ON agent_acpc_command_result (
  account_id, expires_at, command_id
);
CREATE INDEX agent_acpc_checkpoint_day_idx ON agent_acpc_projection_checkpoint (
  account_id, utc_day, created_at DESC, checkpoint_id
);
CREATE INDEX agent_acpc_binding_day_idx ON agent_acpc_admission_binding (
  account_id, utc_day, admission_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_acpc_authorization_evidence',
    'agent_acpc_profile',
    'agent_acpc_profile_publish_rule',
    'agent_acpc_admission_head',
    'agent_acpc_session',
    'agent_acpc_day_nomination',
    'agent_acpc_admission_binding',
    'agent_acpc_card_compile',
    'agent_acpc_card_certificate',
    'agent_acpc_card_decision',
    'agent_acpc_count_perception_card',
    'agent_acpc_card_publication',
    'agent_acpc_effect_intent',
    'agent_acpc_budget_ledger',
    'agent_acpc_terminal_record',
    'agent_acpc_command_result',
    'agent_acpc_audit_head',
    'agent_acpc_audit_event',
    'agent_acpc_audit_anchor',
    'agent_acpc_projection_checkpoint'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
       USING (account_id = NULLIF(current_setting(''app.account_id'', true), '''')::BIGINT)
       WITH CHECK (account_id = NULLIF(current_setting(''app.account_id'', true), '''')::BIGINT)',
      table_name
    );
  END LOOP;
END
$tenant_isolation$;
```

### 8.1 Transaction boundaries

Day nomination, admission binding, count projection, and
the card commit or roll back together when they run in
one command transaction. The reference publish writes the
binding, compile, certificate, decision, card, and audit
event in one function body. The publication record is its
own append. Notify dispatch is not part of the card
transaction. Provider silence stays `UNKNOWN_EFFECT` and
does not reveal withheld counts.

### 8.2 Tenant isolation

Every table forces `tenant_isolation`. The policy
compares `account_id` with `app.account_id`. A card
session cannot read another account's admission head,
replay counts, or perception card. Profile approval runs
as `agent_acpc_profile_authority` and still updates only
the caller's account row.

## 9. Open API GraphQL contract

```graphql
scalar DateTime
scalar Date
scalar Long
scalar JSON
scalar SHA256

enum AgentAcpcSessionStatus {
  OPEN
  NOMINATING
  PUBLISHING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentAcpcAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AgentAcpcFreshnessClass {
  CURRENT
  LAGGING
  UNKNOWN_EFFECT
}

enum AgentAcpcKeyKind {
  AWAITING_CONFIRMATION
  UNKNOWN_EFFECT
}

enum AgentAcpcNextAction {
  USE_SEALED_COUNTS
  STOP_SYNOPSIS_USE
  OMIT_COUNTS
}

enum AgentAcpcPublicationReason {
  ADMITTED_COUNT_PERCEPTION_PUBLISHED
  COUNT_PERCEPTION_WITHHELD
}

type AgentAcpcProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  publishThreshold: Int!
  procedureRef: String
}

type AgentAcpcSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  status: AgentAcpcSessionStatus!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentAcpcAdmissionHead {
  accountId: ID!
  utcDay: Date!
  admissionId: ID!
  admissionClass: AgentAcpcAdmissionClass!
  freshnessClass: AgentAcpcFreshnessClass!
  lagPublications: Long
  maxLagBudget: Int!
  silenceObserved: Boolean!
  countsVisible: Boolean!
}

type AgentAcpcCountPerceptionCard {
  accountId: ID!
  utcDay: Date!
  cardId: ID!
  admissionClass: AgentAcpcAdmissionClass!
  countsPublished: Boolean!
  lagPublications: Long
  maxLagBudget: Int!
  sealedCount: Long
  deniedCount: Long
  unknownEffectCount: Long
  trustedNextAction: AgentAcpcNextAction!
  attestedKeyKind: AgentAcpcKeyKind!
}

type AgentAcpcAuditEvent {
  accountId: ID!
  eventId: ID!
  eventKind: String!
  eventHash: SHA256!
  createdAt: DateTime!
}

type AgentAcpcProfileMatch {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  score: Float!
}

type AgentAcpcDayNomination {
  accountId: ID!
  nominationId: ID!
  utcDay: Date!
  accessPath: String!
}

type AgentAcpcAdmissionBinding {
  accountId: ID!
  bindingId: ID!
  utcDay: Date!
  admissionClass: AgentAcpcAdmissionClass!
  lagPublications: Long
}

type AgentAcpcDecisionResult {
  accountId: ID!
  decisionId: ID!
  admissionClass: AgentAcpcAdmissionClass!
  countsPublished: Boolean!
  lagPublications: Long
  blockedReason: String
}

type AgentAcpcCardPublication {
  accountId: ID!
  recordId: ID!
  utcDay: Date!
  reasonCode: AgentAcpcPublicationReason!
  admissionClass: AgentAcpcAdmissionClass!
  countsPublished: Boolean!
  sealedCount: Long
}

type AgentAcpcEffectIntent {
  accountId: ID!
  effectId: ID!
  intentStatus: String!
}

input CreateAgentAcpcProfileInput {
  accountId: ID!
  profileId: ID!
  name: String!
  definitionHash: SHA256!
  procedureRef: String!
}

input ApproveAgentAcpcProfileInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  definitionHash: SHA256!
}

input RevokeAgentAcpcProfileInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  definitionHash: SHA256!
}

input OpenAgentAcpcSessionInput {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
}

input NominateAgentAcpcDayInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  nominationId: ID!
  nominationHash: SHA256!
}

input BindAgentAcpcAdmissionInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  bindingId: ID!
}

input PublishAgentAcpcCountCardInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  cardId: ID!
  cardDigest: SHA256!
  cardStewardA: String!
  cardStewardB: String!
}

input PublishAgentAcpcCardRecordInput {
  accountId: ID!
  utcDay: Date!
  cardId: ID!
  recordId: ID!
}

input RecordAgentAcpcEffectInput {
  accountId: ID!
  effectId: ID!
  sessionId: ID!
  certificateId: ID!
  providerIdempotencyKey: String!
  canonicalRequestHash: SHA256!
}

input CloseAgentAcpcSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
}

type Query {
  agentAcpcProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AgentAcpcProfile
  agentAcpcSession(accountId: ID!, sessionId: ID!): AgentAcpcSession
  agentAcpcAdmissionHead(accountId: ID!, utcDay: Date!): AgentAcpcAdmissionHead
  agentAcpcCountPerceptionCard(accountId: ID!, utcDay: Date!): AgentAcpcCountPerceptionCard
  agentAcpcAuditEvents(accountId: ID!, cardId: ID!): [AgentAcpcAuditEvent!]!
  searchAgentAcpcProfiles(accountId: ID!, semanticQuery: String!, topK: Int!): [AgentAcpcProfileMatch!]!
}

type Mutation {
  createAgentAcpcProfile(input: CreateAgentAcpcProfileInput!): AgentAcpcProfile!
  approveAgentAcpcProfile(input: ApproveAgentAcpcProfileInput!): AgentAcpcProfile!
  revokeAgentAcpcProfile(input: RevokeAgentAcpcProfileInput!): AgentAcpcProfile!
  openAgentAcpcSession(input: OpenAgentAcpcSessionInput!): AgentAcpcSession!
  nominateAgentAcpcDay(input: NominateAgentAcpcDayInput!): AgentAcpcDayNomination!
  bindAgentAcpcAdmission(input: BindAgentAcpcAdmissionInput!): AgentAcpcAdmissionBinding!
  publishAgentAcpcCountCard(input: PublishAgentAcpcCountCardInput!): AgentAcpcDecisionResult!
  publishAgentAcpcCardRecord(input: PublishAgentAcpcCardRecordInput!): AgentAcpcCardPublication!
  recordAgentAcpcEffect(input: RecordAgentAcpcEffectInput!): AgentAcpcEffectIntent!
  closeAgentAcpcSession(input: CloseAgentAcpcSessionInput!): AgentAcpcSession!
}
```

### GraphQL limits

Every field above is scoped by `accountId`. `utcDay` is
required on admission-head and count-card reads. A missing
day is **FULL SCAN REJECTED** at the resolver before
planning. `searchAgentAcpcProfiles` returns profile ids
only. A match does not nominate a day and does not publish
a card. `topK` is capped by the session vector budget.
`AgentAcpcCountPerceptionCard.sealedCount` is null unless
`countsPublished` is true, which requires `admissionClass`
`ADMITTED`. `AgentAcpcAdmissionHead` does not expose the
replay counts. Those stay on the steward grain.

## 10. Procedural memory

The approved profile is the instruction an agent can
read without guessing:

- nominate one `utc_day`;
- point-look up the sealed admission head;
- if the class is `ADMITTED`, copy the three replay
  counts onto the card;
- if the class is `DENIED`, seal `STOP_SYNOPSIS_USE`
  with null counts;
- if the class is `UNKNOWN_EFFECT`, seal `OMIT_COUNTS`
  with a null lag and null counts;
- leave `ACKED` as an effect observation;
- leave the key at `AWAITING_CONFIRMATION`;
- leave the fact body omitted;
- leave nested expiry closed;
- leave the admission head unchanged.

`publish_instruction` on the rule row is that procedure
in canonical JSON. The database evaluates the procedure.
The agent does not.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected. The reference
schema does not build an HNSW index.

```sql
CREATE TABLE agent_acpc_profile_embedding (
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
    REFERENCES agent_acpc_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_acpc_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_acpc_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_acpc_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: an HNSW index belongs only inside an
-- account-partitioned segment. Never build one global ANN index
-- across tenants. Reference validation intentionally omits that DDL.
-- ANN queries must include account_id equality before topK.
-- Unscoped admission or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one `utc_day`, and publishes that day's
card under dual control. Similarity never publishes counts
and never restores a fact.

## 12. Agent perception

Agents receive one count-perception card per
`(account_id, utc_day)`. The card exposes `admissionClass`,
`lagPublications`, `maxLagBudget`, `countsPublished`, and
`trustedNextAction`. It repeats
`attestedKeyKind = AWAITING_CONFIRMATION`,
`metadataTrust = UNTRUSTED_METADATA`, and
`bodyVisibility = OMITTED`.

When `countsPublished` is true the card also exposes
`sealedCount`, `deniedCount`, and `unknownEffectCount`.
Those three numbers are the only count surface an agent
may read. They appear only for `ADMITTED`.

`DENIED` is perceived as `STOP_SYNOPSIS_USE` with the
count fields absent. `UNKNOWN_EFFECT` is perceived as
`OMIT_COUNTS` with a null lag and the count fields absent.
Replay counts remain on the admission head for stewards.
The agent-facing GraphQL head type does not return them.

The card does not include a fact body, a resolved fact
hash, or a packet id. An agent that needs the underlying
items must use an already authorized item point lookup.
It must not scan the board to reconstruct the counts.

## 13. ACID and consistency

### Row store

Nomination, binding, certificate, decision, card, and the
audit event commit atomically. A failed steward check
rolls the card back. The admission head is not a write
target of this transaction.

### Columnar store

The columnar projection is one card per
`(account_id, utc_day)`. Counts are null unless
`counts_published` is true. Analysts do not backfill
withheld counts from the row-store head in the agent
serving path. Steward replay of the head is a separate
authorized point lookup.

### Vector store

Embeddings identify profiles. They are not citations of
counts. A vector hit cannot set `counts_published`.

### External tools

Notify providers sit outside the database transaction.
Until a provider acknowledges, the intent stays
`PREPARED` or becomes `UNKNOWN_EFFECT`. Acknowledgement
does not enroll a key and does not copy withheld counts
onto the card.

## 14. Guardrails and neighbor protection

Recursive agent loops are stopped at the session fence:
one UTC day, one card, and a fixed unit budget. A null
day, a day scan, a watermark scan, or a packet scan is
**FULL SCAN REJECTED** before planning. The publish
function reads one admission head primary key. It does
not join items, updates, or context packets.

Card stewards cannot be the admission, attestation,
synopsis, or publication stewards. That split keeps the
principal who sealed the admission from also deciding
that the counts are safe to show.

`ACKED` cannot become `TRUSTED_ENROLLED`. Nested expiry
cannot open. A withheld card cannot be updated later to
fill in counts, because the card row is immutable.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Nominating a day without `utc_day` would walk every
  admission head for the account. Rejected.
- Recomputing `sealed_count` from item or packet rows on
  a board with 1M+ rows would sequential-scan the board.
  Rejected. Counts are copied from the admission head.
- Listing every withheld card for an account without
  `account_id` plus a selective predicate would fan out
  across tenants. The serving path is one primary key.
- A global HNSW search without `account_id` would mix
  tenants. Rejected.

### Required access paths

- Admission head: primary key `(account_id, utc_day)`.
- Count card: primary key `(account_id, utc_day)`.
- Publication: unique `(account_id, utc_day)`.
- Profile embedding: equality on `account_id` before any
  topK.

### Planner enforcement

`reject_agent_acpc_unscoped_scan` refuses a plan that
lacks both `account_id` and `utc_day`. Resolvers call it
before opening a table. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` cannot be stored on a nomination or a
card.

## 16. Auditability and replay

Each sealed card appends `COUNT_PERCEPTION_CARD_SEALED`
with the card digest and a previous hash. The digest
covers the class, the lag, the budget, and whether counts
were published. It does not cover a fact body. Replay
re-reads the card and the admission head by primary key.
It does not call a model and does not recompute counts
from packets. The head's replay counts remain available
to stewards after the card withholds them.

## 17. Threat and failure analysis

- **Count leakage:** a direct insert of counts on a
  `DENIED` card fails the projection trigger. The
  publication trigger rejects the same shape.
- **Count drift:** an `ADMITTED` card whose counts differ
  from the head fails closed.
- **History rewrite:** updating the admission head or the
  card fails closed. A later profile edit cannot change
  a sealed class.
- **Trust upgrade:** storing `TRUSTED_ENROLLED` because
  the effect was `ACKED` fails the decision trigger.
- **Fact restore:** `factBody` on the head or the card
  fails closed. `RESTORED` and `BODY_VISIBLE` fail closed.
- **Nested expiry:** `opens_nested_expiry` fails closed.
  This plane does not start another cycle.
- **Packet walk:** `PACKET_SCAN` fails closed.
- **Steward collusion:** a card steward who also sealed
  the admission fails the certificate trigger.
- **Cross-tenant read:** forced RLS hides heads and cards
  when `app.account_id` does not match.
- **Provider silence:** the effect stays `UNKNOWN_EFFECT`.
  Silence does not publish counts.

## 18. Observability and SLOs

Availability target for the card point lookup is 99.99%.
The serving SLO is one primary-key read of the card.
Publish SLO is one primary-key read of the head plus the
single-row writes in the seal transaction. Alerts fire
on `FULL SCAN REJECTED`, on withheld cards that somehow
report `counts_published`, and on card digests that do
not match the sealed decision. They do not page on an
agent choosing not to use an admitted card.

## 19. Rollout

### Phase 1: shadow cards

Publish cards in shadow for one internal account. Agents
still use the previous admission perception. Compare
admitted counts with the head's replay counts.

### Phase 2: withhold denied

Serve `DENIED` and `UNKNOWN_EFFECT` cards with null
counts to agents. Keep replay counts on the steward
head. Confirm no packet scans appear in the plan log.

### Phase 3: one admitted day

Serve `sealedCount`, `deniedCount`, and
`unknownEffectCount` for one `ADMITTED` day. Dual-control
card stewards are required.

### Phase 4: publish and notify uncertainty

Append `ADMITTED_COUNT_PERCEPTION_PUBLISHED` or
`COUNT_PERCEPTION_WITHHELD`. Notify may remain
`UNKNOWN_EFFECT`.

### Phase 5: broad availability

Enable the card for every account that already has a
sealed admission head. Do not backfill counts for
withheld days.

## 20. Ship criteria

### Contract validation

TypeScript contracts compile in strict mode. The GraphQL
schema builds with 6 queries and 10 mutations. SQL
creates the row store and the account-scoped embedding
table. Every table and tenant index leads with
`account_id`.

### Behavioral validation

- Lag 3 against budget 5, class `ADMITTED`, freshness
  `LAGGING`: the card publishes counts 1, 1, and 1.
  `counts_published` is true. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted.
- Lag 8 against budget 5, class `DENIED`: the card's
  counts are null and the next action is
  `STOP_SYNOPSIS_USE`. The head replay counts stay 4, 2,
  and 1.
- Silence, class `UNKNOWN_EFFECT`: the card lag is null,
  the counts are null, and the next action is
  `OMIT_COUNTS`.
- The admitted head's lag stays 3 after the card seals.
- A null day, a packet scan, a fact body, an
  `ACKED`-to-`TRUSTED_ENROLLED` write, a nested expiry, a
  steward collision, a count on a withheld card, a
  forged admitted head above the budget, and an unscoped
  scan are rejected.
- Effect intents that do not start as `PREPARED`, and
  edits to a sealed profile, head, card, or effect
  identity, are rejected.

### Scale and failure validation

The planner rejects a missing `utc_day` on a board with
1M+ rows. Publish touches one head key and writes one
card key. Provider silence stays `UNKNOWN_EFFECT` and
does not fill in counts.

## 21. Product decision

Ship the admitted count-perception card as the only
agent-readable count surface for a sealed synopsis day.
Keep the database deterministic: the class was already
decided, and this plane only projects it. Cite the sealed
admission instead of re-evaluating the lag budget, so a
later profile edit cannot rewrite who was allowed to see
counts. Keep replay counts on the admission head for
stewards, and keep them off the card unless the class is
`ADMITTED`.

This card does not open another nested expiry plane.
The next increment, if the product lead wants one, is a
consumer read receipt for one already published
`ADMITTED` card, by point lookup of `(account_id, utc_day)`.
`DENIED` and `UNKNOWN_EFFECT` still have no counts to
acknowledge. That receipt must not scan context packets,
must not inline a fact body, must not promote `ACKED` to
`TRUSTED_ENROLLED`, and must not open another nested
expiry plane.
