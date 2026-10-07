# mondayDB Agentic Attachment-Receipt Outcome Synopsis Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-07.v1`

## 1. Why this plane, before how

The 2026-10-06 Invalidated Context-Packet Attachment Receipt
Plane can record exactly one sealed invalidated context
packet as one attachment receipt by point lookup of
`(account_id, packet_id)`. That receipt repeats membership
`OMITTED`, citation `DROPPED`, and catalog status
`INVALIDATED` as `UNTRUSTED_METADATA`. `ACKED` stays an
effect observation. The disputed fact stays
`DISPUTED_HELD`. The body stays off the receipt. Silence
stays `UNKNOWN_EFFECT`.

A product lead still cannot see, for one account and one
UTC day, how many of those publications sealed, how many
were denied, and how many remained `UNKNOWN_EFFECT`
without a second read path. Without this plane an agent
either:

- scans context packets, perception cards, or the receipt
  row store across a board with 1M+ rows to count outcomes
  (neighbor-harmful, and a miss against the 99.99%
  availability target), or
- inlines a disputed fact and reads `ACKED` as
  `TRUSTED_ENROLLED` so the daily total "explains" the
  holds by revealing them.

The product trade-off is **analytical freshness versus
citation integrity and neighbor latency**:

- Counting receipts by walking context packets maximizes
  prompt fluency and hides the hold. It also puts a 1M+
  row walk on the primary path.
- Publishing one columnar synopsis per `(account_id,
  utc_day)` from the receipt publication watermark adds
  one bounded fold. The fold lags the watermark on
  purpose. The receipt write path stays a point lookup.
  The synopsis repeats counts only. `ACKED` inside the
  sealed bucket stays an effect observation. The key
  stays `AWAITING_CONFIRMATION`. The body stays omitted.
  Silence stays `UNKNOWN_EFFECT`.
- Semantic similarity may discover synopsis profiles. It
  must never decide whether a day may be nominated, a
  watermark bound, a fold evaluated, a synopsis sealed,
  a synopsis published, or a consumer notified.

Latency for receipt publication stays on the primary key.
Consistency of the daily grain is the sealed synopsis row
plus the watermark cursor it cites, not an eventually
consistent guess that an omitted packet "probably belongs
in the prompt." Neighbor availability stays at the 99.99%
target because an unscoped day walk or packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved synopsis profile is procedural memory for
   "how one UTC day of receipt publications is folded into
   sealed, denied, and `UNKNOWN_EFFECT` counts." A profile
   **never** inlines a fact body, **never** rewrites
   `ACKED` as `TRUSTED_ENROLLED`, and **never** opens
   another nested expiry plane.
2. A session nominates exactly one `utc_day` by point
   lookup. The fold then reads a closed publication-watermark
   range for that day. It does not discover the day by
   scanning context packets.
3. mondayDB evaluates the fold as a pure function of the
   watermark rows already labeled `SEALED`, `DENIED`, or
   `UNKNOWN_EFFECT`. Counts are additive. They do not
   promote a key, restore a fact, or reopen a citation.
4. Sealing binds `consumer_ref + utc_day + watermark_high +
   source_watermark_hash + synopsis_steward_a +
   synopsis_steward_b`. Synopsis stewards are distinct
   from each other and from the publication stewards who
   wrote the watermark. The synopsis **must not** emit a
   fact body and **must not** emit `TRUSTED_ENROLLED`.
5. Publishing the synopsis is a second point lookup of
   `(account_id, utc_day)`. Notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not enrollment and not a fact restore.
6. Unscoped watermark, context-packet, or board scans are
   **FULL SCAN REJECTED** before planning.

### Product outcome

For any account and UTC day, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, watermark bind, fold, seal, publication, or
  notify dispatch?
- Which closed publication-watermark range was folded, and
  what were `sealed_count`, `denied_count`, and
  `unknown_effect_count`?
- Did `ACKED` stay inside the sealed bucket as an effect
  observation while the synopsis key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did async notify become `UNKNOWN_EFFECT`?
- Can the synopsis be replayed without invoking an LLM?

HNSW profile discovery stays account-scoped and never
authorizes this fold.

## 2. Scope and ownership

The Attachment-Receipt Outcome Synopsis Plane owns:

1. Immutable approved synopsis profiles as procedural
   memory of "how one UTC day of attachment-receipt
   publications is folded into sealed, denied, and
   `UNKNOWN_EFFECT` counts without inlining a disputed
   fact, treating `ACKED` as `TRUSTED_ENROLLED`, scanning
   context packets, or opening another nested expiry."
2. Tenant-scoped synopsis sessions with purpose and budget
   fences, and a hard cap of one nominated UTC day per
   session.
3. Deterministic nomination of that day, then a bounded
   read of `agent_arosyn_publication_watermark` by
   `(account_id, utc_day, publication_watermark)`.
4. A columnar synopsis grain keyed by `(account_id,
   utc_day)` that stores counts, the watermark cursor, and
   untrusted metadata. It does not store a fact body.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the sealed synopsis, audit replay,
   and bounded fold budgets.

It integrates with, but does not replace:

- **Invalidated Context-Packet Attachment Receipt Plane:**
  supplies the publication watermark this plane folds.
  Exporters copy outcome, effect observation, and hashes
  onto `agent_arosyn_publication_watermark` by point
  lookup of the publication record. This plane never reads
  the context-packet catalog, never puts a packet back,
  and never promotes `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  fold, vector, publish, and notify units. A day whose
  watermark range exceeds `max_publications_per_fold` is
  rejected instead of scanned.

### Non-goals

- Letting an LLM decide that a sealed count "probably
  means the held facts are true enough to show."
- Discovering which day to fold by scanning a board, a
  context-packet table, or a citation ledger.
- Reconstructing authoritative receipts from the columnar
  grain. The row-store watermark remains the source.
- Cross-account synopsis folds or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, packet bodies,
  or fact bodies on the synopsis.
- Claiming distributed atomicity with external notify
  providers. Provider silence remains `UNKNOWN_EFFECT`.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because a sealed bucket contained `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this synopsis.

## 3. Product contract

### 3.1 Synopsis profile contract

A profile version is immutable after approval. It defines:

- allowed outcomes (`SEALED`, `DENIED`, `UNKNOWN_EFFECT`);
- fold threshold (distinct synopsis stewards, minimum 2),
  max days per session (exactly 1), max nominated days
  (exactly 1), and `max_publications_per_fold`;
- fold policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `SYNOPSIS_NEVER_RESTORES_FACTS`,
  `SYNOPSIS_NEVER_INLINES_BODY`,
  `SYNOPSIS_NEVER_CONFIRMS`, `ONE_DAY_PER_SESSION`,
  `POINT_LOOKUP_ONLY`, `WATERMARK_RANGE_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_FOLD`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest compile
kind is `FOLD_RECEIPT_OUTCOMES` (21 bytes). The longest
denial reason is `RECEIPT_AS_RESTORE_DENIED` (25 bytes).

Approval and revocation require the authority fence
`approve_agent_arosyn_profile` /
`revoke_agent_arosyn_profile`, owned by
`agent_arosyn_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, fold, vector, publish, and notify units, plus wall
time. `max_days_per_session` and `max_nominated_days` are
both exactly 1. A second day nomination in the same
session is rejected before it can fan out into a recursive
retrieval.

### 3.3 Watermark and nomination contract

Upstream receipt publication exports one watermark row per
publication. The row is keyed by `(account_id,
publication_id)` and carries `utc_day` plus
`publication_watermark`. It copies outcome `SEALED`,
`DENIED`, or `UNKNOWN_EFFECT`. It does not copy a fact
body, a context packet, or a trusted key.

`nominate_agent_arosyn_day(account_id, session_id,
utc_day, nomination_id, nomination_hash)` nominates that
day. A null `utc_day` is **FULL SCAN REJECTED**. The
access path is `POINT_LOOKUP`. `DAY_SCAN` and
`PACKET_SCAN` are rejected.

### 3.4 Fold and columnar synopsis contract

`fold_agent_arosyn_day` is the only compile that writes a
columnar synopsis. It requires:

- a nomination of the same `(account_id, utc_day)`;
- a closed watermark range `[expected_low, expected_high]`
  whose width stays within `max_publications_per_fold`;
- every watermark row in that range already stored with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, and
  `ack_promoted_to_trust = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` on every
  folded row (`TRUSTED_ENROLLED` is rejected);
- an `ACKED` effect observation only when `outcome = SEALED`
  and the key is still `AWAITING_CONFIRMATION`;
- synopsis stewards distinct from each other and from both
  publication stewards on the watermark.

The synopsis grain is `(account_id, utc_day)`. It stores
`sealed_count`, `denied_count`, `unknown_effect_count`,
`watermark_low`, `watermark_high`, and `synopsis_body`.
`synopsis_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` increments `sealed_count`. It
does not write `TRUSTED_ENROLLED`.

A day with more than one non-zero bucket seals as
`MIXED`. `MIXED` is a count rollup, not a trusted fact.

### 3.5 Notify and publication contract

`publish_agent_arosyn_synopsis` point-looks up
`(account_id, utc_day)` and appends one publication with
reason `ATTACHMENT_RECEIPT_OUTCOMES_FOLDED`. Effect intents
start as `PREPARED`. Provider silence stays
`UNKNOWN_EFFECT`. An acknowledgement does not enroll a
key, restore a fact, or inline a body.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`. RLS policy
   `tenant_isolation` is forced on every table.
2. Day nomination and synopsis publication use point
   lookup. A missing `account_id` or `utc_day` is
   **FULL SCAN REJECTED**.
3. The fold reads only
   `agent_arosyn_publication_watermark` for one
   `(account_id, utc_day)` and one closed watermark range.
   There is no context-packet table in this plane.
4. `ACKED` is an effect observation inside `sealed_count`.
   It never writes `TRUSTED_ENROLLED` or
   `TRUSTED_WITHIN_SKEW`.
5. `RESTORED`, `INCLUDED`, and `BODY_VISIBLE` are rejected.
6. `synopsis_body` and `outcome_payload` never contain a
   fact body.
7. `opens_nested_expiry` is rejected. This plane does not
   start another expiry, containment, review, or resolution
   cycle.
8. `PACKET_SCAN` and `DAY_SCAN` are rejected.
9. Synopsis stewards are distinct from each other and from
   the publication stewards copied onto the watermark.
10. Profile approval and revocation go through the
    authority fence. Sealed profiles and sealed fold rules
    are immutable.
11. One session nominates one UTC day and writes one
    synopsis.
12. Silence is not `ACKED`. A synopsis hash is not a fact
    hash.
13. The database engine stays deterministic. Agents above
    it may be probabilistic. Similarity never nominates a
    day and never authorizes a fold.
14. `watermark_high` is monotonic for a day. A fold cannot
    cite a cursor behind a watermark row it counted.

## 5. Execution model

The receipt publication row store remains the authority for
individual receipts. This plane's row store is the
publication watermark plus the sealed synopsis. The
columnar grain is that synopsis: one row per
`(account_id, utc_day)`, built asynchronously from the
watermark so the receipt write path does not wait for the
aggregate.

The fold reads one index range and writes one compile, one
certificate, one decision, and one synopsis in the same
transaction. Publication is a second point lookup that
appends history without rewriting the counts. Notify
dispatch is outside the ACID boundary and starts at
`PREPARED`.

An agent perceives the synopsis, not the facts behind the
sealed bucket. The synopsis is procedural evidence that
the day's receipt publications were counted without
restoring a citation.

## 6. Lifecycle

### 6.1 Draft and approve

A profile is inserted as `DRAFT` with at least one
dual-control fold rule. `approve_agent_arosyn_profile`
checks the definition hash and sets
`app.arosyn_profile_approval` before the status becomes
`APPROVED`.

### 6.2 Open and nominate

A session opens under an approved profile.
`nominate_agent_arosyn_day` requires a non-null
`utc_day`. A null day is **FULL SCAN REJECTED**.

### 6.3 Bind and evaluate

Watermark binding records the closed cursor the fold will
read. Evaluation is a pure function of the watermark rows
in that range. It cannot inline a body, promote `ACKED`,
or open a nested expiry.

### 6.4 Seal

Dual-control synopsis stewards seal the certificate.
Publication stewards are excluded. The decision row
`FOLD_RECEIPT_OUTCOMES` and the columnar synopsis commit
together.

### 6.5 Publish and notify

`publish_agent_arosyn_synopsis` appends
`ATTACHMENT_RECEIPT_OUTCOMES_FOLDED`. Notify may remain
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

The session closes. Audit events stay hash-chained.
Revocation with `STOP_BEFORE_FOLD` blocks new nominations.
In-flight sealed synopses remain replayable.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type SynopsisId = string & { readonly brand: "SynopsisId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type PublicationId = string & { readonly brand: "PublicationId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };
type UtcDay = string & { readonly brand: "UtcDay" };

type TrustedNextAction =
  | "NOMINATE_UTC_DAY"
  | "BIND_PUBLICATION_WATERMARK"
  | "EVALUATE_OUTCOME_FOLD"
  | "SEAL_OUTCOME_SYNOPSIS"
  | "PUBLISH_OUTCOME_SYNOPSIS"
  | "PREPARE_SYNOPSIS_NOTIFY"
  | "SYNOPSIS_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type AttachmentReceiptOutcomeSynopsisBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "BUDGET_EXHAUSTED"
  | "DAY_MISSING"
  | "WATERMARK_NOT_READY"
  | "HISTORY_REWRITE_DENIED"
  | "ACK_AS_TRUST_DENIED"
  | "SILENCE_AS_ACK_DENIED"
  | "SYNOPSIS_AS_CONFIRMATION_DENIED"
  | "SYNOPSIS_AS_RESTORE_DENIED"
  | "BODY_INLINE_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "PUBLICATION_STEWARD_EXCLUSION_DENIED"
  | "PACKET_SCAN_DENIED"
  | "DAY_SCAN_DENIED"
  | "WATERMARK_REGRESSION_DENIED"
  | "HASH_MISMATCH"
  | "FOLD_THRESHOLD_NOT_MET"
  | "POLICY_DENIED"
  | "UNKNOWN_EFFECT";

interface UntrustedText {
  readonly value: string;
  readonly provenance: "USER_INPUT" | "BOARD_VALUE" | "PROVIDER_VALUE" | "AGENT_DRAFT";
  readonly trust: "UNTRUSTED_CONTENT";
}

type ProfileStatus = "DRAFT" | "APPROVED" | "REVOKED";
type SessionStatus =
  | "OPEN"
  | "NOMINATING"
  | "FOLDING"
  | "SEALED"
  | "DISPATCHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type OutcomeBucket = "SEALED" | "DENIED" | "UNKNOWN_EFFECT";
type RollupStatus = "SEALED" | "DENIED" | "UNKNOWN_EFFECT" | "MIXED";
type AccessPath = "POINT_LOOKUP" | "DAY_SCAN" | "PACKET_SCAN";
type AttestedKeyKind =
  | "AWAITING_CONFIRMATION"
  | "TRUSTED_ENROLLED"
  | "TRUSTED_WITHIN_SKEW"
  | "REGRESSED"
  | "SILENCE"
  | "UNKNOWN_EFFECT";
type FactDisposition =
  | "DISPUTED_HELD"
  | "HALTED"
  | "QUARANTINE_OMITTED"
  | "RESTORED"
  | "UNKNOWN_EFFECT";
type BodyVisibility = "ENVELOPE_ONLY" | "BODY_VISIBLE" | "OMITTED";
type EffectObservation = "ACKED" | "FAILED" | "DISPATCHED" | "SILENCE" | "UNKNOWN_EFFECT";
type MetadataTrust = "UNTRUSTED_METADATA";
type EffectIntentStatus = "PREPARED" | "DISPATCHED" | "ACKED" | "FAILED" | "UNKNOWN_EFFECT";
type DenialReason =
  | "PACKET_SCAN_DENIED"
  | "BODY_INLINE_DENIED"
  | "ACK_AS_TRUST_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "RECEIPT_AS_RESTORE_DENIED";
type CompileKind =
  | "FOLD_RECEIPT_OUTCOMES"
  | "HOLD_UNKNOWN_EFFECT"
  | "DENY_ACK_AS_TRUST"
  | "DENY_BODY_INLINE"
  | "DENY_PACKET_SCAN"
  | "DENY_NESTED_EXPIRY"
  | "UNKNOWN_EFFECT";

interface AttachmentReceiptOutcomeSynopsisBudget {
  readonly nominateUnits: number;
  readonly bindUnits: number;
  readonly foldUnits: number;
  readonly vectorUnits: number;
  readonly publishUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly foldThreshold: number;
  readonly maxDaysPerSession: 1;
  readonly maxNominatedDays: 1;
  readonly maxPublicationsPerFold: number;
}

interface AttachmentReceiptOutcomeSynopsisProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly foldThreshold: number;
  readonly maxDaysPerSession: 1;
  readonly maxNominatedDays: 1;
  readonly maxPublicationsPerFold: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface AttachmentReceiptOutcomeSynopsisSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: AttachmentReceiptOutcomeSynopsisBudget;
  readonly consumed: Omit<
    AttachmentReceiptOutcomeSynopsisBudget,
    | "maxWallTimeMs"
    | "foldThreshold"
    | "maxDaysPerSession"
    | "maxNominatedDays"
    | "maxPublicationsPerFold"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface PublicationWatermark {
  readonly accountId: AccountId;
  readonly publicationId: PublicationId;
  readonly utcDay: UtcDay;
  readonly publicationWatermark: number;
  readonly outcome: OutcomeBucket;
  readonly denialReason: DenialReason | null;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly factDisposition: FactDisposition;
  readonly bodyVisibility: BodyVisibility;
  readonly metadataTrust: MetadataTrust;
  readonly accessPath: AccessPath;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly ackPromotedToTrust: false;
  readonly silenceInferred: boolean;
  readonly publicationStewardA: string;
  readonly publicationStewardB: string;
  readonly sourcePublicationHash: Sha256;
}

interface OutcomeFoldCompileRecord {
  readonly accountId: AccountId;
  readonly compileId: CompileId;
  readonly sessionId: SessionId;
  readonly utcDay: UtcDay;
  readonly sealedCount: number;
  readonly deniedCount: number;
  readonly unknownEffectCount: number;
  readonly watermarkLow: number;
  readonly watermarkHigh: number;
  readonly foldHash: Sha256;
  readonly compiledAt: Timestamp;
}

interface OutcomeSynopsisCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly utcDay: UtcDay;
  readonly purposeHash: Sha256;
  readonly watermarkHigh: number;
  readonly sourceWatermarkHash: Sha256;
  readonly synopsisStewardA: string;
  readonly synopsisStewardB: string;
  readonly publicationStewardA: string;
  readonly publicationStewardB: string;
  readonly sealedAt: Timestamp;
}

interface OutcomeSynopsisDecision {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly certificateId: CertificateId;
  readonly sessionId: SessionId;
  readonly utcDay: UtcDay;
  readonly compileKind: CompileKind;
  readonly rollupStatus: RollupStatus;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly factDisposition: FactDisposition;
  readonly bodyVisibility: BodyVisibility;
  readonly accessPath: AccessPath;
  readonly metadataTrust: MetadataTrust;
  readonly opensNestedExpiry: boolean;
  readonly inlinesFactBody: boolean;
  readonly ackPromotedToTrust: boolean;
  readonly packetScanUsed: boolean;
  readonly sealedCount: number;
  readonly deniedCount: number;
  readonly unknownEffectCount: number;
  readonly watermarkHigh: number;
  readonly foldHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface SynopsisNotifyObservation {
  readonly effectId: string;
  readonly status: EffectIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentAttachmentReceiptOutcomeSynopsis {
  readonly accountId: AccountId;
  readonly synopsisId: SynopsisId;
  readonly sessionId: SessionId;
  readonly utcDay: UtcDay;
  readonly rollupStatus: RollupStatus;
  readonly summary: UntrustedText;
  readonly sealedCount: number;
  readonly deniedCount: number;
  readonly unknownEffectCount: number;
  readonly watermarkLow: number;
  readonly watermarkHigh: number;
  readonly sourceWatermarkHash: Sha256;
  readonly metadataTrust: MetadataTrust;
  readonly attestedKeyKind: AttestedKeyKind;
  readonly effectObservation: EffectObservation;
  readonly factDisposition: FactDisposition;
  readonly bodyVisibility: BodyVisibility;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly ackPromotedToTrust: false;
  readonly packetScanUsed: false;
  readonly uncertainNotifyIntents: readonly SynopsisNotifyObservation[];
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly AttachmentReceiptOutcomeSynopsisBlockedReason[];
  readonly synopsisHash: Sha256;
}
```

```ts
interface CreateAttachmentReceiptOutcomeSynopsisSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: AttachmentReceiptOutcomeSynopsisBudget;
}

interface NominateAttachmentReceiptOutcomeDayInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly utcDay: UtcDay;
  readonly idempotencyKey: string;
}

interface BindAttachmentReceiptOutcomeWatermarkInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly utcDay: UtcDay;
  readonly watermarkLow: number;
  readonly watermarkHigh: number;
  readonly idempotencyKey: string;
}

interface EvaluateAttachmentReceiptOutcomeFoldInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly utcDay: UtcDay;
  readonly expectedWatermarkLow: number;
  readonly expectedWatermarkHigh: number;
  readonly idempotencyKey: string;
}

interface SealAttachmentReceiptOutcomeSynopsisInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly compileId: CompileId;
  readonly consumerRef: ConsumerRef;
  readonly synopsisStewardA: string;
  readonly synopsisStewardB: string;
  readonly idempotencyKey: string;
}

interface PublishAttachmentReceiptOutcomeSynopsisInput {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly synopsisId: SynopsisId;
  readonly idempotencyKey: string;
}

interface PrepareAttachmentReceiptOutcomeNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly certificateId: CertificateId;
  readonly idempotencyKey: string;
}

interface AttachmentReceiptOutcomeNotifyUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly effectId: string;
  readonly promotion: "RETRY_SAME_SYNOPSIS" | "ACCEPT_OBSERVATION" | "REJECT_SYNOPSIS" | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseAttachmentReceiptOutcomeSynopsisSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface AdvanceAttachmentReceiptOutcomeWatermarkInput {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly watermarkHigh: number;
  readonly idempotencyKey: string;
}

type AttachmentReceiptOutcomeSynopsisDecisionResult =
  | {
      readonly decision: "ALLOWED";
      readonly session: AttachmentReceiptOutcomeSynopsisSession;
      readonly certificate?: OutcomeSynopsisCertificate;
      readonly synopsisDecision?: OutcomeSynopsisDecision;
      readonly watermark?: PublicationWatermark;
      readonly compile?: OutcomeFoldCompileRecord;
      readonly synopsis: AgentAttachmentReceiptOutcomeSynopsis;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "REJECTED";
      readonly code: AttachmentReceiptOutcomeSynopsisBlockedReason;
      readonly retryable: boolean;
      readonly reason: string;
      readonly synopsis?: AgentAttachmentReceiptOutcomeSynopsis;
      readonly auditHash: Sha256;
    };
```

## 8. SQL row-store schema

```sql
CREATE TYPE arosyn_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE arosyn_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'FOLDING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE arosyn_outcome AS ENUM ('SEALED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE arosyn_denial_reason AS ENUM (
  'PACKET_SCAN_DENIED', 'BODY_INLINE_DENIED', 'ACK_AS_TRUST_DENIED',
  'NESTED_EXPIRY_DENIED', 'RECEIPT_AS_RESTORE_DENIED'
);
CREATE TYPE arosyn_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE arosyn_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW',
  'REGRESSED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE arosyn_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'HALTED', 'QUARANTINE_OMITTED', 'RESTORED', 'UNKNOWN_EFFECT'
);
CREATE TYPE arosyn_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE arosyn_access_path AS ENUM ('POINT_LOOKUP', 'DAY_SCAN', 'PACKET_SCAN');
CREATE TYPE arosyn_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE arosyn_catalog_status AS ENUM ('INVALIDATED', 'LIVE', 'UNKNOWN_EFFECT');
CREATE TYPE arosyn_membership_state AS ENUM ('OMITTED', 'INCLUDED', 'UNKNOWN_EFFECT');
CREATE TYPE arosyn_citation_state AS ENUM ('DROPPED', 'ATTACHED', 'UNKNOWN_EFFECT');
CREATE TYPE arosyn_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE arosyn_rollup_status AS ENUM ('SEALED', 'DENIED', 'UNKNOWN_EFFECT', 'MIXED');
CREATE TYPE arosyn_compile_kind AS ENUM (
  'FOLD_RECEIPT_OUTCOMES', 'HOLD_UNKNOWN_EFFECT', 'DENY_ACK_AS_TRUST',
  'DENY_BODY_INLINE', 'DENY_PACKET_SCAN', 'DENY_NESTED_EXPIRY', 'UNKNOWN_EFFECT'
);
CREATE TYPE arosyn_terminal_kind AS ENUM (
  'REQUIRE_HUMAN', 'HOLD_UNKNOWN', 'REJECT_NESTED_EXPIRY', 'SKIP', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_arosyn_profile_authority NOLOGIN;

CREATE TABLE agent_arosyn_authorization_evidence (
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

CREATE TABLE agent_arosyn_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status arosyn_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  fold_threshold SMALLINT NOT NULL CHECK (fold_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_publications_per_fold INTEGER NOT NULL
    CHECK (max_publications_per_fold BETWEEN 1 AND 100000),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN ('ALLOW_IN_FLIGHT', 'STOP_BEFORE_FOLD', 'REQUIRE_REVIEW')
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
    REFERENCES agent_arosyn_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_arosyn_profile_fold_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_outcomes TEXT[] NOT NULL,
  fold_threshold SMALLINT NOT NULL CHECK (fold_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_publications_per_fold INTEGER NOT NULL
    CHECK (max_publications_per_fold BETWEEN 1 AND 100000),
  require_dual_control_fold BOOLEAN NOT NULL,
  fold_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_arosyn_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_arosyn_publication_watermark (
  account_id BIGINT NOT NULL,
  publication_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  publication_watermark BIGINT NOT NULL CHECK (publication_watermark >= 0),
  outcome arosyn_outcome NOT NULL,
  denial_reason arosyn_denial_reason,
  effect_observation arosyn_effect_observation NOT NULL,
  attested_key_kind arosyn_attested_key_kind NOT NULL,
  fact_disposition arosyn_fact_disposition NOT NULL,
  body_visibility arosyn_body_visibility NOT NULL,
  catalog_status arosyn_catalog_status NOT NULL,
  membership_state arosyn_membership_state NOT NULL,
  citation_state arosyn_citation_state NOT NULL,
  metadata_trust arosyn_metadata_trust NOT NULL,
  access_path arosyn_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  silence_inferred BOOLEAN NOT NULL,
  source_publication_hash CHAR(64) NOT NULL CHECK (length(source_publication_hash) = 64),
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  outcome_payload JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, publication_id),
  UNIQUE (account_id, utc_day, publication_watermark),
  CHECK (publication_steward_a <> publication_steward_b),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility <> 'BODY_VISIBLE'),
  CHECK (membership_state <> 'INCLUDED'),
  CHECK (
    (outcome = 'DENIED' AND denial_reason IS NOT NULL) OR
    (outcome <> 'DENIED' AND denial_reason IS NULL)
  ),
  CHECK (
    effect_observation <> 'ACKED' OR (
      outcome = 'SEALED'
      AND attested_key_kind = 'AWAITING_CONFIRMATION'
      AND silence_inferred = false
      AND fact_disposition = 'DISPUTED_HELD'
    )
  ),
  CHECK (outcome <> 'UNKNOWN_EFFECT' OR effect_observation = 'UNKNOWN_EFFECT'),
  CHECK (NOT (outcome_payload ? 'factBody')),
  CHECK (NOT (outcome_payload ? 'fact_body')),
  CHECK (NOT (outcome_payload ? 'resolvedFactHash')),
  CHECK (outcome_payload->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED')
);

CREATE TABLE agent_arosyn_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status arosyn_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_fold_units BIGINT NOT NULL CHECK (budget_fold_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_publish_units BIGINT NOT NULL CHECK (budget_publish_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_fold_units BIGINT NOT NULL CHECK (consumed_fold_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_publish_units BIGINT NOT NULL CHECK (consumed_publish_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  fold_threshold SMALLINT NOT NULL CHECK (fold_threshold BETWEEN 2 AND 8),
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
    REFERENCES agent_arosyn_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_arosyn_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_fold_units <= budget_fold_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at)
);

CREATE TABLE agent_arosyn_day_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  access_path arosyn_access_path NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  nominated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  CHECK (access_path = 'POINT_LOOKUP')
);

CREATE TABLE agent_arosyn_watermark_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  watermark_low BIGINT NOT NULL CHECK (watermark_low >= 0),
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= watermark_low),
  source_watermark_hash CHAR(64) NOT NULL CHECK (length(source_watermark_hash) = 64),
  metadata_trust arosyn_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (inlines_fact_body = false)
);

CREATE TABLE agent_arosyn_fold_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  watermark_low BIGINT NOT NULL CHECK (watermark_low >= 0),
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= watermark_low),
  fold_hash CHAR(64) NOT NULL CHECK (length(fold_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id)
);

CREATE TABLE agent_arosyn_synopsis_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  utc_day DATE NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= 0),
  source_watermark_hash CHAR(64) NOT NULL CHECK (length(source_watermark_hash) = 64),
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_arosyn_fold_compile (account_id, compile_id),
  CHECK (synopsis_steward_a <> synopsis_steward_b),
  CHECK (publication_steward_a <> publication_steward_b)
);

CREATE TABLE agent_arosyn_synopsis_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  compile_kind arosyn_compile_kind NOT NULL,
  rollup_status arosyn_rollup_status NOT NULL,
  effect_observation arosyn_effect_observation NOT NULL,
  attested_key_kind arosyn_attested_key_kind NOT NULL,
  fact_disposition arosyn_fact_disposition NOT NULL,
  body_visibility arosyn_body_visibility NOT NULL,
  access_path arosyn_access_path NOT NULL,
  metadata_trust arosyn_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= 0),
  fold_hash CHAR(64) NOT NULL CHECK (length(fold_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_arosyn_synopsis_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  CHECK (attested_key_kind NOT IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')),
  CHECK (fact_disposition <> 'RESTORED'),
  CHECK (body_visibility <> 'BODY_VISIBLE'),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (compile_kind = 'FOLD_RECEIPT_OUTCOMES')
);

CREATE TABLE agent_arosyn_columnar_synopsis (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  synopsis_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  rollup_status arosyn_rollup_status NOT NULL,
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  publication_count BIGINT NOT NULL CHECK (publication_count >= 0),
  watermark_low BIGINT NOT NULL CHECK (watermark_low >= 0),
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= watermark_low),
  source_watermark_hash CHAR(64) NOT NULL CHECK (length(source_watermark_hash) = 64),
  synopsis_hash CHAR(64) NOT NULL CHECK (length(synopsis_hash) = 64),
  metadata_trust arosyn_metadata_trust NOT NULL,
  attested_key_kind arosyn_attested_key_kind NOT NULL,
  effect_observation arosyn_effect_observation NOT NULL,
  fact_disposition arosyn_fact_disposition NOT NULL,
  body_visibility arosyn_body_visibility NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  synopsis_body JSONB NOT NULL,
  folded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, synopsis_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_arosyn_synopsis_certificate (account_id, certificate_id),
  CHECK (sealed_count + denied_count + unknown_effect_count = publication_count),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (packet_scan_used = false),
  CHECK (NOT (synopsis_body ? 'factBody')),
  CHECK (NOT (synopsis_body ? 'fact_body')),
  CHECK (NOT (synopsis_body ? 'resolvedFactHash')),
  CHECK (synopsis_body->>'attestedKeyKind' = 'AWAITING_CONFIRMATION'),
  CHECK (synopsis_body->>'ackPromotedToTrust' = 'false'),
  CHECK (synopsis_body->>'metadataTrust' = 'UNTRUSTED_METADATA')
);

CREATE TABLE agent_arosyn_synopsis_publication (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  synopsis_id UUID NOT NULL,
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= 0),
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  reason_code TEXT NOT NULL CHECK (
    reason_code = 'ATTACHMENT_RECEIPT_OUTCOMES_FOLDED'
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, utc_day),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_arosyn_columnar_synopsis (account_id, utc_day)
);

CREATE TABLE agent_arosyn_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status arosyn_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL CHECK (length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_arosyn_synopsis_certificate (account_id, certificate_id)
);

CREATE TABLE agent_arosyn_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units BIGINT NOT NULL CHECK (units >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id)
);

CREATE TABLE agent_arosyn_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  terminal_kind arosyn_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_arosyn_session (account_id, session_id),
  CHECK (terminal_kind <> 'REJECT_NESTED_EXPIRY')
);

CREATE TABLE agent_arosyn_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  result_hash CHAR(64) NOT NULL CHECK (length(result_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  UNIQUE (account_id, idempotency_key, operation_name)
);

CREATE TABLE agent_arosyn_audit_head (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  last_sequence BIGINT NOT NULL CHECK (last_sequence >= 0),
  last_hash CHAR(64) NOT NULL CHECK (length(last_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id)
);

CREATE TABLE agent_arosyn_audit_event (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  event_sequence BIGINT NOT NULL CHECK (event_sequence >= 0),
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  prior_hash CHAR(64) NOT NULL CHECK (length(prior_hash) = 64),
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, event_sequence)
);

CREATE TABLE agent_arosyn_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  anchor_hash CHAR(64) NOT NULL CHECK (length(anchor_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_arosyn_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= 0),
  synopsis_hash CHAR(64) NOT NULL CHECK (length(synopsis_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id)
);

CREATE FUNCTION protect_agent_arosyn_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_profile$
DECLARE
  expected TEXT;
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
    expected := concat(
      NEW.profile_id::TEXT, ':',
      NEW.profile_version::TEXT, ':',
      NEW.definition_hash
    );
    IF NEW.status = 'APPROVED' THEN
      IF current_setting('app.arosyn_profile_approval', true) IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.arosyn_profile_revocation', true) IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'profile revocation requires the authority fence';
      END IF;
    ELSE
      RAISE EXCEPTION 'profile status transition is not allowed';
    END IF;
  END IF;

  RETURN NEW;
END
$protect_profile$;

CREATE TRIGGER agent_arosyn_profile_protect
BEFORE INSERT OR UPDATE ON agent_arosyn_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_profile();

CREATE FUNCTION protect_agent_arosyn_fold_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status arosyn_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_arosyn_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed fold rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_arosyn_fold_rule_protect
BEFORE UPDATE ON agent_arosyn_profile_fold_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_fold_rule();

CREATE FUNCTION protect_agent_arosyn_watermark()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_watermark$
BEGIN
  IF NEW.inlines_fact_body OR NEW.body_visibility = 'BODY_VISIBLE'
     OR NEW.fact_disposition = 'RESTORED'
     OR NEW.outcome_payload ? 'factBody'
     OR NEW.outcome_payload ? 'fact_body'
     OR NEW.outcome_payload ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')
     OR NEW.outcome_payload->>'attestedKeyKind' = 'TRUSTED_ENROLLED' THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF NEW.effect_observation = 'ACKED'
     AND (
       NEW.outcome IS DISTINCT FROM 'SEALED'
       OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
       OR NEW.silence_inferred
     ) THEN
    RAISE EXCEPTION 'ack-as-trust fence';
  END IF;

  RETURN NEW;
END
$protect_watermark$;

CREATE TRIGGER agent_arosyn_watermark_protect
BEFORE INSERT OR UPDATE ON agent_arosyn_publication_watermark
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_watermark();

CREATE FUNCTION protect_agent_arosyn_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.fold_hash IS DISTINCT FROM NEW.fold_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'synopsis decision identity is immutable';
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

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_arosyn_decision_protect
BEFORE INSERT OR UPDATE ON agent_arosyn_synopsis_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_decision();

CREATE FUNCTION protect_agent_arosyn_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.synopsis_steward_a = NEW.synopsis_steward_b
     OR NEW.synopsis_steward_a IN (NEW.publication_steward_a, NEW.publication_steward_b)
     OR NEW.synopsis_steward_b IN (NEW.publication_steward_a, NEW.publication_steward_b) THEN
    RAISE EXCEPTION 'publication steward reuse';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_arosyn_certificate_protect
BEFORE INSERT OR UPDATE ON agent_arosyn_synopsis_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_certificate();

CREATE FUNCTION protect_agent_arosyn_effect_intent()
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

CREATE TRIGGER agent_arosyn_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_arosyn_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_effect_intent();

CREATE FUNCTION protect_agent_arosyn_synopsis()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_synopsis$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed synopsis grain is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.synopsis_body ? 'factBody'
     OR NEW.synopsis_body ? 'fact_body'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'synopsis fence';
  END IF;
  RETURN NEW;
END
$protect_synopsis$;

CREATE TRIGGER agent_arosyn_synopsis_protect
BEFORE INSERT OR UPDATE ON agent_arosyn_columnar_synopsis
FOR EACH ROW EXECUTE FUNCTION protect_agent_arosyn_synopsis();

CREATE FUNCTION approve_agent_arosyn_profile(
  tenant_id BIGINT,
  recipient_profile_id UUID,
  recipient_profile_version INTEGER,
  validated_definition_hash TEXT,
  approver_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $approve$
DECLARE
  stored_hash CHAR(64);
  stored_status arosyn_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_arosyn_profile
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'profile approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO rule_count
  FROM agent_arosyn_profile_fold_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
    AND require_dual_control_fold IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control fold rule';
  END IF;

  PERFORM set_config(
    'app.arosyn_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_arosyn_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_arosyn_profile(
  tenant_id BIGINT,
  recipient_profile_id UUID,
  recipient_profile_version INTEGER,
  expected_definition_hash TEXT,
  revoker_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $revoke$
DECLARE
  stored_hash CHAR(64);
  stored_status arosyn_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_arosyn_profile
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version
  FOR UPDATE;

  IF length(expected_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM expected_definition_hash THEN
    RAISE EXCEPTION 'profile revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.arosyn_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_arosyn_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_arosyn_day(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_utc_day DATE,
  recipient_nomination_id UUID,
  nomination_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $nominate$
BEGIN
  IF recipient_utc_day IS NULL OR tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  INSERT INTO agent_arosyn_day_nomination (
    account_id, nomination_id, session_id, utc_day,
    access_path, nomination_hash, nominated_at
  ) VALUES (
    tenant_id, recipient_nomination_id, recipient_session_id,
    recipient_utc_day, 'POINT_LOOKUP', nomination_digest, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION fold_agent_arosyn_day(
  tenant_id BIGINT,
  recipient_session_id UUID,
  recipient_utc_day DATE,
  recipient_synopsis_id UUID,
  recipient_certificate_id UUID,
  recipient_compile_id UUID,
  recipient_decision_id UUID,
  fold_digest TEXT,
  synopsis_steward_a TEXT,
  synopsis_steward_b TEXT,
  expected_low BIGINT,
  expected_high BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $fold$
DECLARE
  nominated_day DATE;
  sealed_count BIGINT;
  denied_count BIGINT;
  unknown_count BIGINT;
  found_low BIGINT;
  found_high BIGINT;
  publication_count BIGINT;
  steward_a_min TEXT;
  steward_b_min TEXT;
  steward_a_max TEXT;
  steward_b_max TEXT;
  rollup arosyn_rollup_status;
  rollup_effect arosyn_effect_observation;
  max_fold INTEGER;
  purpose_digest CHAR(64);
BEGIN
  IF recipient_utc_day IS NULL OR tenant_id IS NULL
     OR expected_low IS NULL OR expected_high IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF expected_high < expected_low THEN
    RAISE EXCEPTION 'watermark regression';
  END IF;

  IF length(fold_digest) <> 64 THEN
    RAISE EXCEPTION 'fold digest must be 64 hex characters';
  END IF;

  SELECT utc_day INTO nominated_day
  FROM agent_arosyn_day_nomination
  WHERE account_id = tenant_id
    AND session_id = recipient_session_id;

  IF nominated_day IS DISTINCT FROM recipient_utc_day THEN
    RAISE EXCEPTION 'fold requires a nominated utc_day point lookup';
  END IF;

  SELECT p.max_publications_per_fold INTO max_fold
  FROM agent_arosyn_session AS s
  JOIN agent_arosyn_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = tenant_id
    AND s.session_id = recipient_session_id;

  IF max_fold IS NULL THEN
    RAISE EXCEPTION 'session point lookup missed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_arosyn_publication_watermark
    WHERE account_id = tenant_id
      AND utc_day = recipient_utc_day
      AND publication_watermark BETWEEN expected_low AND expected_high
      AND (
        inlines_fact_body
        OR opens_nested_expiry
        OR ack_promoted_to_trust
        OR access_path IS DISTINCT FROM 'POINT_LOOKUP'
        OR attested_key_kind IN ('TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW')
        OR outcome_payload ? 'factBody'
        OR outcome_payload ? 'fact_body'
      )
  ) THEN
    RAISE EXCEPTION 'watermark fence';
  END IF;

  SELECT
    count(*) FILTER (WHERE outcome = 'SEALED'),
    count(*) FILTER (WHERE outcome = 'DENIED'),
    count(*) FILTER (WHERE outcome = 'UNKNOWN_EFFECT'),
    min(publication_watermark),
    max(publication_watermark),
    count(*),
    min(publication_steward_a),
    min(publication_steward_b),
    max(publication_steward_a),
    max(publication_steward_b)
  INTO
    sealed_count, denied_count, unknown_count,
    found_low, found_high, publication_count,
    steward_a_min, steward_b_min, steward_a_max, steward_b_max
  FROM agent_arosyn_publication_watermark
  WHERE account_id = tenant_id
    AND utc_day = recipient_utc_day
    AND publication_watermark BETWEEN expected_low AND expected_high;

  IF publication_count IS NULL OR publication_count = 0 THEN
    RAISE EXCEPTION 'watermark point lookup missed';
  END IF;

  IF publication_count > max_fold THEN
    RAISE EXCEPTION 'fold budget exceeded';
  END IF;

  IF steward_a_min IS DISTINCT FROM steward_a_max
     OR steward_b_min IS DISTINCT FROM steward_b_max THEN
    RAISE EXCEPTION 'mixed publication stewards';
  END IF;

  IF synopsis_steward_a = synopsis_steward_b
     OR synopsis_steward_a IN (steward_a_min, steward_b_min)
     OR synopsis_steward_b IN (steward_a_min, steward_b_min) THEN
    RAISE EXCEPTION 'publication steward reuse';
  END IF;

  IF (sealed_count > 0)::INT + (denied_count > 0)::INT + (unknown_count > 0)::INT > 1 THEN
    rollup := 'MIXED';
  ELSIF sealed_count > 0 THEN
    rollup := 'SEALED';
  ELSIF denied_count > 0 THEN
    rollup := 'DENIED';
  ELSE
    rollup := 'UNKNOWN_EFFECT';
  END IF;

  IF unknown_count > 0 THEN
    rollup_effect := 'UNKNOWN_EFFECT';
  ELSIF sealed_count > 0 THEN
    rollup_effect := 'ACKED';
  ELSE
    rollup_effect := 'FAILED';
  END IF;

  purpose_digest := repeat('a', 64);

  INSERT INTO agent_arosyn_fold_compile (
    account_id, compile_id, session_id, utc_day,
    sealed_count, denied_count, unknown_effect_count,
    watermark_low, watermark_high, fold_hash, compiled_at
  ) VALUES (
    tenant_id, recipient_compile_id, recipient_session_id, recipient_utc_day,
    sealed_count, denied_count, unknown_count,
    found_low, found_high, fold_digest, clock_timestamp()
  );

  INSERT INTO agent_arosyn_synopsis_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_ref,
    utc_day, purpose_hash, watermark_high, source_watermark_hash,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    tenant_id, recipient_certificate_id, recipient_session_id, recipient_compile_id,
    'consumer:synopsis-agent', recipient_utc_day, purpose_digest, found_high, fold_digest,
    synopsis_steward_a, synopsis_steward_b, steward_a_min, steward_b_min,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_arosyn_synopsis_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    compile_kind, rollup_status, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust,
    packet_scan_used, sealed_count, denied_count, unknown_effect_count,
    watermark_high, fold_hash, sealed_at, created_at
  ) VALUES (
    tenant_id, recipient_decision_id, recipient_certificate_id, recipient_session_id,
    recipient_utc_day, 'FOLD_RECEIPT_OUTCOMES', rollup, rollup_effect,
    'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
    'UNTRUSTED_METADATA', false, false, false, false,
    sealed_count, denied_count, unknown_count, found_high, fold_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_arosyn_columnar_synopsis (
    account_id, utc_day, synopsis_id, session_id, certificate_id,
    rollup_status, sealed_count, denied_count, unknown_effect_count,
    publication_count, watermark_low, watermark_high, source_watermark_hash,
    synopsis_hash, metadata_trust, attested_key_kind, effect_observation,
    fact_disposition, body_visibility, inlines_fact_body, opens_nested_expiry,
    ack_promoted_to_trust, packet_scan_used, synopsis_body, folded_at, created_at
  ) VALUES (
    tenant_id, recipient_utc_day, recipient_synopsis_id, recipient_session_id,
    recipient_certificate_id, rollup, sealed_count, denied_count, unknown_count,
    publication_count, found_low, found_high, fold_digest, fold_digest,
    'UNTRUSTED_METADATA', 'AWAITING_CONFIRMATION', rollup_effect,
    'DISPUTED_HELD', 'OMITTED', false, false, false, false,
    jsonb_build_object(
      'utcDay', recipient_utc_day,
      'sealedCount', sealed_count,
      'deniedCount', denied_count,
      'unknownEffectCount', unknown_count,
      'rollupStatus', rollup,
      'metadataTrust', 'UNTRUSTED_METADATA',
      'attestedKeyKind', 'AWAITING_CONFIRMATION',
      'ackPromotedToTrust', false,
      'inlinesFactBody', false,
      'opensNestedExpiry', false,
      'packetScanUsed', false
    ),
    clock_timestamp(), clock_timestamp()
  );
END
$fold$;

CREATE FUNCTION publish_agent_arosyn_synopsis(
  tenant_id BIGINT,
  recipient_utc_day DATE,
  recipient_synopsis_id UUID,
  recipient_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  grain agent_arosyn_columnar_synopsis%ROWTYPE;
BEGIN
  IF recipient_utc_day IS NULL OR tenant_id IS NULL OR recipient_synopsis_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO grain
  FROM agent_arosyn_columnar_synopsis
  WHERE account_id = tenant_id
    AND utc_day = recipient_utc_day;

  IF NOT FOUND
     OR grain.synopsis_id IS DISTINCT FROM recipient_synopsis_id
     OR grain.inlines_fact_body
     OR grain.ack_promoted_to_trust
     OR grain.opens_nested_expiry
     OR grain.packet_scan_used
     OR grain.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'synopsis publication requires a sealed day point lookup';
  END IF;

  INSERT INTO agent_arosyn_synopsis_publication (
    account_id, record_id, utc_day, synopsis_id, watermark_high,
    sealed_count, denied_count, unknown_effect_count, reason_code, created_at
  ) VALUES (
    tenant_id, recipient_record_id, recipient_utc_day, recipient_synopsis_id,
    grain.watermark_high, grain.sealed_count, grain.denied_count,
    grain.unknown_effect_count, 'ATTACHMENT_RECEIPT_OUTCOMES_FOLDED', clock_timestamp()
  );
END
$publish$;

CREATE FUNCTION reject_agent_arosyn_unscoped_scan(
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

ALTER FUNCTION approve_agent_arosyn_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_arosyn_profile_authority;
ALTER FUNCTION revoke_agent_arosyn_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_arosyn_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_arosyn_profile_authority;
GRANT SELECT ON
  agent_arosyn_profile,
  agent_arosyn_profile_fold_rule
TO agent_arosyn_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_arosyn_profile TO agent_arosyn_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_arosyn_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_arosyn_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_arosyn_profile FROM PUBLIC;

CREATE INDEX agent_arosyn_session_work_idx ON agent_arosyn_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_arosyn_session_profile_idx ON agent_arosyn_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_arosyn_watermark_day_idx ON agent_arosyn_publication_watermark (
  account_id, utc_day, publication_watermark, publication_id
);
CREATE INDEX agent_arosyn_watermark_outcome_idx ON agent_arosyn_publication_watermark (
  account_id, utc_day, outcome, publication_id
);
CREATE INDEX agent_arosyn_nomination_session_idx ON agent_arosyn_day_nomination (
  account_id, session_id, nominated_at DESC, nomination_id
);
CREATE INDEX agent_arosyn_certificate_session_idx ON agent_arosyn_synopsis_certificate (
  account_id, session_id, sealed_at DESC, certificate_id
);
CREATE INDEX agent_arosyn_decision_cert_idx ON agent_arosyn_synopsis_decision (
  account_id, certificate_id, sealed_at DESC, decision_id
);
CREATE INDEX agent_arosyn_synopsis_id_idx ON agent_arosyn_columnar_synopsis (
  account_id, synopsis_id, folded_at DESC
);
CREATE INDEX agent_arosyn_publication_day_idx ON agent_arosyn_synopsis_publication (
  account_id, utc_day, created_at DESC, record_id
);
CREATE INDEX agent_arosyn_effect_work_idx ON agent_arosyn_effect_intent (
  account_id, intent_status, updated_at, effect_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_arosyn_audit_time_idx ON agent_arosyn_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_arosyn_command_expiry_idx ON agent_arosyn_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_arosyn_checkpoint_day_idx ON agent_arosyn_projection_checkpoint (
  account_id, utc_day, created_at DESC, checkpoint_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_arosyn_authorization_evidence',
    'agent_arosyn_profile',
    'agent_arosyn_profile_fold_rule',
    'agent_arosyn_publication_watermark',
    'agent_arosyn_session',
    'agent_arosyn_day_nomination',
    'agent_arosyn_watermark_binding',
    'agent_arosyn_fold_compile',
    'agent_arosyn_synopsis_certificate',
    'agent_arosyn_synopsis_decision',
    'agent_arosyn_columnar_synopsis',
    'agent_arosyn_synopsis_publication',
    'agent_arosyn_effect_intent',
    'agent_arosyn_budget_ledger',
    'agent_arosyn_terminal_record',
    'agent_arosyn_command_result',
    'agent_arosyn_audit_head',
    'agent_arosyn_audit_event',
    'agent_arosyn_audit_anchor',
    'agent_arosyn_projection_checkpoint'
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

Day nomination, watermark binding, fold evaluation, and the
columnar synopsis commit or roll back together when they
run in one command transaction. The reference fold writes
the compile, certificate, decision, and synopsis in one
function body. Publication is its own append. Notify
dispatch is not part of the database transaction.
`state_revision` is the compare-and-swap token for session
commands.

### 8.2 Tenant isolation

`account_id` is the first column of every table and every
index. `FORCE ROW LEVEL SECURITY` applies
`tenant_isolation` using `app.account_id`. Cross-tenant
reads and writes fail closed. There is no global watermark
and no context-packet catalog in this plane.

## 9. Open API GraphQL contract

```graphql
scalar DateTime
scalar Date
scalar Long
scalar JSON
scalar SHA256

enum AgentArosynSessionStatus {
  OPEN
  NOMINATING
  FOLDING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentArosynOutcome {
  SEALED
  DENIED
  UNKNOWN_EFFECT
}

enum AgentArosynRollupStatus {
  SEALED
  DENIED
  UNKNOWN_EFFECT
  MIXED
}

type AgentArosynProfile {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  procedureRef: String
  semanticTags: [String!]!
}

type AgentArosynSession {
  accountId: Long!
  sessionId: ID!
  status: AgentArosynSessionStatus!
  purpose: String!
  stateRevision: Long!
}

type AgentArosynSynopsis {
  accountId: Long!
  utcDay: Date!
  synopsisId: ID!
  rollupStatus: AgentArosynRollupStatus!
  sealedCount: Long!
  deniedCount: Long!
  unknownEffectCount: Long!
  watermarkHigh: Long!
  sourceWatermarkHash: SHA256!
  synopsisHash: SHA256!
  metadataTrust: String!
  attestedKeyKind: String!
  ackPromotedToTrust: Boolean!
  inlinesFactBody: Boolean!
  opensNestedExpiry: Boolean!
  packetScanUsed: Boolean!
  synopsisBody: JSON!
}

type AgentArosynWatermark {
  accountId: Long!
  publicationId: ID!
  utcDay: Date!
  outcome: AgentArosynOutcome!
  publicationWatermark: Long!
  effectObservation: String!
  attestedKeyKind: String!
}

type AgentArosynAuditEvent {
  accountId: Long!
  eventSequence: Long!
  synopsisHash: SHA256!
  occurredAt: DateTime!
}

type AgentArosynProfileMatch {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  score: Float!
}

input CreateAgentArosynSessionInput {
  accountId: Long!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
}

type AgentArosynDecisionResult {
  decision: String!
  auditHash: SHA256!
  synopsis: AgentArosynSynopsis
}

type Query {
  agentArosynProfile(accountId: Long!, profileId: ID!, profileVersion: Int!): AgentArosynProfile
  agentArosynSession(accountId: Long!, sessionId: ID!): AgentArosynSession
  agentArosynSynopsis(accountId: Long!, utcDay: Date!): AgentArosynSynopsis
  agentArosynPublicationWatermark(accountId: Long!, publicationId: ID!): AgentArosynWatermark
  agentArosynSynopsisAudit(accountId: Long!, utcDay: Date!, eventSequence: Long!): AgentArosynAuditEvent
  agentArosynProfileMatches(accountId: Long!, queryHash: SHA256!, topK: Int!): [AgentArosynProfileMatch!]!
}

type Mutation {
  createAgentArosynSession(input: CreateAgentArosynSessionInput!): AgentArosynDecisionResult!
  nominateAgentArosynDay(accountId: Long!, sessionId: ID!, utcDay: Date!, idempotencyKey: String!): AgentArosynDecisionResult!
  bindAgentArosynWatermark(accountId: Long!, sessionId: ID!, utcDay: Date!, watermarkHigh: Long!, idempotencyKey: String!): AgentArosynDecisionResult!
  evaluateAgentArosynFold(accountId: Long!, sessionId: ID!, utcDay: Date!, idempotencyKey: String!): AgentArosynDecisionResult!
  sealAgentArosynSynopsis(accountId: Long!, sessionId: ID!, utcDay: Date!, synopsisStewardA: String!, synopsisStewardB: String!, idempotencyKey: String!): AgentArosynDecisionResult!
  publishAgentArosynSynopsis(accountId: Long!, utcDay: Date!, synopsisId: ID!, idempotencyKey: String!): AgentArosynDecisionResult!
  prepareAgentArosynNotify(accountId: Long!, sessionId: ID!, certificateId: ID!, idempotencyKey: String!): AgentArosynDecisionResult!
  recordAgentArosynNotifyUncertainty(accountId: Long!, effectId: ID!, idempotencyKey: String!): AgentArosynDecisionResult!
  closeAgentArosynSession(accountId: Long!, sessionId: ID!, idempotencyKey: String!): AgentArosynDecisionResult!
  advanceAgentArosynWatermark(accountId: Long!, utcDay: Date!, watermarkHigh: Long!, idempotencyKey: String!): AgentArosynDecisionResult!
}
```

### GraphQL limits

The schema exposes 6 point-lookup queries and 10 mutations.
Every operation takes `accountId`. There is no unbounded
list of context packets or UTC days. Resolvers that would
scan a board with 1M+ rows, or fold a day without a closed
watermark range, are **FULL SCAN REJECTED** before
planning. `agentArosynSynopsis` reads one grain by
`(accountId, utcDay)`. `agentArosynProfileMatches` is
discovery only and cannot authorize a fold.

## 10. Procedural memory

The approved profile is the instruction an agent may
follow. `fold_instruction` records that one fold publishes
one `(account_id, utc_day)` synopsis from the receipt
publication watermark, with sealed, denied, and
`UNKNOWN_EFFECT` counts, and never treats `ACKED` as
trust. `procedureRef` points at that profile version.
Agents do not store a second hidden policy. If the profile
is revoked with `STOP_BEFORE_FOLD`, new nominations stop.
In-flight synopses remain replayable.

Semantic tags (`incident`, `attachment-receipt-synopsis`)
are for discovery. They are not authorization.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_arosyn_profile_embedding (
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
    REFERENCES agent_arosyn_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_arosyn_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_arosyn_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_arosyn_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped watermark, context-packet, or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one `utc_day`, and folds a closed
watermark range under dual control. Similarity never
publishes a synopsis and never restores a fact.

## 12. Agent perception

Agents receive one synopsis card per `(account_id, utc_day)`.
The card exposes `sealedCount`, `deniedCount`,
`unknownEffectCount`, `rollupStatus`, `watermarkHigh`,
`metadataTrust`, and `attestedKeyKind`. Summary text is
`UntrustedText`. The card also exposes whether a fact body
was inlined (always false), whether `ACKED` was promoted
(always false), and whether a nested expiry was opened
(always false). It never embeds raw private keys, tool
payloads, fact bodies, packet ids, or a winning fact hash.
`synopsisHash` makes the grain replayable.

An LLM should read the card as: "For this account and UTC
day, the receipt publication watermark folded into these
three counts. `ACKED` publications sit in `sealedCount` as
effect observations. The key remains
`AWAITING_CONFIRMATION`. Unknown notify stays
`UNKNOWN_EFFECT`. The disputed facts stay held and omitted."
It should not read the card as "the sealed facts are now
true," "the fact bodies are available," or "the signing
key is `TRUSTED_ENROLLED`." Metadata tags that keep that
reading stable are `metadataTrust=UNTRUSTED_METADATA`,
`attestedKeyKind=AWAITING_CONFIRMATION`,
`factDisposition=DISPUTED_HELD`, `bodyVisibility=OMITTED`,
`ackPromotedToTrust=false`, `inlinesFactBody=false`, and
`opensNestedExpiry=false`.

A `MIXED` rollup means more than one bucket is non-zero.
It is not a blended fact and not permission to inline the
sealed bucket.

## 13. ACID and consistency

### Row store

The publication watermark is append-only. Nomination and
fold commit or roll back together inside
`fold_agent_arosyn_day`. Compare-and-swap on
`state_revision` rejects lost updates of the session.
Decision identity and the sealed synopsis grain are
immutable. The synopsis does not rewrite a receipt.

### Columnar store

The columnar store in this plane is the synopsis grain
itself: one row per `(account_id, utc_day)` with additive
counts and a watermark cursor. It lags receipt publication
until the fold runs. A synopsis cannot authorize a new
receipt, restore an omitted packet, or outrun
`watermark_high`. Agents that need a newer count wait for
the next closed range. They do not scan the board.

### Vector store

Embeddings track approved profile versions. A revoked
profile's vector may remain discoverable until the next
projection, but discovery never nominates a day. Account
predicates are applied before HNSW topK.

### External tools

Notify providers sit outside the ACID boundary. Silence and
ambiguous responses stay `UNKNOWN_EFFECT`. A notify
acknowledgement cannot inline a fact body or promote
`ACKED` to `TRUSTED_ENROLLED`.

## 14. Guardrails and neighbor protection

Fold budgets cap nominate, bind, fold, vector, publish,
and notify units per session. The one-day cap rejects a
second nomination before it can fan out into recursive
retrieval. `max_publications_per_fold` rejects an unbounded
day. A synopsis cannot schedule another compile of itself
and cannot open a nested expiry. `PACKET_SCAN`, `DAY_SCAN`,
missing `account_id`, and a missing `utc_day` are
**FULL SCAN REJECTED** by `reject_agent_arosyn_unscoped_scan`
before the planner touches a board with 1M+ rows. Vector
discovery is capped by `budget_vector_units` and cannot
authorize seal.

The fold runs off the receipt write path. A slow aggregate
cannot consume the neighbor's receipt transaction budget,
which is what keeps the 99.99% availability target intact
while the analytical grain catches up.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing every context packet or attachment receipt for
  an account to count sealed, denied, and unknown outcomes.
- Joining those receipts to board items to recover a fact
  body for the daily card.
- Folding a UTC day without a closed
  `[watermark_low, watermark_high]` range.
- Building one global HNSW index and authorizing a fold
  from the nearest profile.

Each of those plans is **FULL SCAN REJECTED**. The primary
path is one index range on `(account_id, utc_day,
publication_watermark)` bounded by the caller's cursor,
then one primary-key read of the synopsis grain. That
stays selective on boards with 1M+ rows because the board
table is not in the plan at all.

### Required access paths

- Day nomination: the caller supplies `utc_day`. A null
  day is rejected before planning.
- Watermark fold: `(account_id, utc_day,
  publication_watermark)` between the closed bounds.
- Synopsis read and publication: primary key
  `(account_id, utc_day)`.
- Session and audit reads: `(account_id, session_id)`.
- Profile discovery: `account_id` equality, then HNSW topK
  inside that partition.

### Planner enforcement

`nominate_agent_arosyn_day`, `fold_agent_arosyn_day`, and
`publish_agent_arosyn_synopsis` raise **FULL SCAN REJECTED**
when `account_id` or `utc_day` is missing. The fold also
rejects a range wider than `max_publications_per_fold`.
There is no SQL path in this plane that selects from a
context-packet table.

## 16. Auditability and replay

Each fold binds `fold_hash` to the counts and the watermark
cursor. Certificate stewards, decision identity, and the
synopsis grain are append-only. Publication records cite
`ATTACHMENT_RECEIPT_OUTCOMES_FOLDED` plus the same counts.
Replay reads `(account_id, utc_day)` and does not call an
LLM. A changed count requires a new synopsis id, which the
immutable grain rejects until a future explicit advance
contract exists. This version seals one grain per day.

Audit head, audit event, and audit anchor tables keep a
hash chain available for the session. They are tenant
scoped and are not derived from fact bodies.

## 17. Threat and failure analysis

- **Ack-as-trust.** A watermark or decision with
  `TRUSTED_ENROLLED` is rejected. `ACKED` may increment
  `sealed_count` only while the key stays
  `AWAITING_CONFIRMATION`.
- **Body inline.** `factBody`, `fact_body`, and
  `resolvedFactHash` are rejected on watermark payloads
  and on `synopsis_body`.
- **Packet or day scan.** `PACKET_SCAN` and `DAY_SCAN`
  are rejected. The fold has no packet table to walk.
- **Nested expiry.** `opens_nested_expiry` is rejected.
  This synopsis does not start another expiry plane.
- **Steward reuse.** Synopsis stewards cannot be the
  publication stewards who wrote the watermark.
- **Cross-tenant fold.** RLS and the leading `account_id`
  predicate keep watermarks apart.
- **Watermark regression.** `expected_high < expected_low`
  is rejected. Counts cannot cite a cursor they did not
  read.
- **Provider silence.** Notify stays `PREPARED` until a
  real observation, and silence is `UNKNOWN_EFFECT`, not
  `ACKED`.
- **Profile bypass.** Direct insert as `APPROVED`, direct
  revocation, and edits to a sealed definition or fold
  rule are rejected.

## 18. Observability and SLOs

The plane exposes:

- fold latency and publications folded per
  `(account_id, utc_day)`;
- lag between the newest receipt publication watermark
  and `watermark_high` on the sealed synopsis;
- rates of fence denials (`ACK_AS_TRUST_DENIED`,
  `BODY_INLINE_DENIED`, `PACKET_SCAN_DENIED`,
  `NESTED_EXPIRY_DENIED`);
- notify intents still at `UNKNOWN_EFFECT`.

The receipt write path keeps its own 99.99% availability
target. Synopsis lag is an analytical SLO, not a reason to
fold synchronously inside a receipt transaction. An alert
fires when lag exceeds the account's configured window.
The alert cites the watermark cursor. It does not scan a
board.

## 19. Rollout

### Phase 1: shadow folds

Export watermarks and fold synopses without serving them
to agents. Compare counts to a sampled point-lookup audit.
No board scans.

### Phase 2: deny-only

Serve the synopsis card with counts, and keep seal
available only for operators. Agents may not treat
`sealedCount` as trust.

### Phase 3: one day

Open the GraphQL read for one UTC day per session under
an approved profile.

### Phase 4: publish and notify uncertainty

Publish `ATTACHMENT_RECEIPT_OUTCOMES_FOLDED` and allow
notify. Silence remains `UNKNOWN_EFFECT`.

### Phase 5: broad availability

Enable the grain for every account. Keep
`max_publications_per_fold`, dual control, and the
packet-scan fence in the default profile.

## 20. Ship criteria

### Contract validation

`npm run validate` typechecks the TypeScript contracts,
builds the GraphQL schema (6 queries, 10 mutations), and
executes the SQL schema on PGlite with pgvector.

### Behavioral validation

- A day with one sealed `ACKED` watermark, one denied
  watermark, and one `UNKNOWN_EFFECT` watermark folds to
  counts 1, 1, and 1, rollup `MIXED`, key
  `AWAITING_CONFIRMATION`, and no fact body.
- A null `utc_day` is **FULL SCAN REJECTED**.
- `TRUSTED_ENROLLED`, fact-body payloads, nested expiry,
  packet scan, publication-steward reuse, direct profile
  approval, and sealed-rule edits are rejected.
- The publication record reason is
  `ATTACHMENT_RECEIPT_OUTCOMES_FOLDED`.

### Scale and failure validation

Explain plans for the fold use
`(account_id, utc_day, publication_watermark)`. A range
above `max_publications_per_fold` is rejected. No plan
reads a context-packet or board table. Notify failure
leaves the synopsis sealed and the intent
`UNKNOWN_EFFECT`.

## 21. Product decision

Ship the columnar synopsis as the analytical perception of
attachment-receipt outcomes. Receipt publication stays the
transactional authority. The synopsis is a deterministic,
tenant-scoped, watermark-bounded aggregate. It is allowed
to be slightly stale. It is not allowed to scan a board,
inline a fact, promote `ACKED` to `TRUSTED_ENROLLED`, or
open another nested expiry plane.

The next increment should publish one freshness attestation
for a sealed synopsis: a point lookup of `(account_id,
utc_day)` that records the lag between `watermark_high`
and the newest receipt publication cursor. That attestation
must not scan context packets, must not inline a fact body,
must not promote `ACKED` to `TRUSTED_ENROLLED`, and must
not open another nested expiry plane.
