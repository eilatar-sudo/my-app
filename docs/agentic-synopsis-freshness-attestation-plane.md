# mondayDB Agentic Synopsis Freshness Attestation Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-08.v1`

## 1. Why this plane, before how

The 2026-10-07 Attachment-Receipt Outcome Synopsis Plane can
fold one UTC day of receipt publications into
`sealed_count`, `denied_count`, and `unknown_effect_count`,
and it seals that grain at `watermark_high`. After the
seal, new receipt publications can advance the day's
receipt cursor. A product lead still cannot see, for one
account and one UTC day, how far the sealed synopsis has
fallen behind that cursor.

Without this plane an agent either:

- walks receipt rows, context packets, or a board with
  1M+ rows to discover the newest publication cursor
  (neighbor-harmful, and a miss against the 99.99%
  availability target), or
- treats `ACKED` inside the sealed bucket as
  `TRUSTED_ENROLLED` and inlines the disputed fact so the
  lag "explains itself."

The product trade-off is **attestation lag versus citation
integrity and neighbor latency**:

- Chasing every new receipt into the sealed synopsis
  keeps the daily card current and puts a repeated
  aggregate on the primary path.
- Publishing one freshness attestation per
  `(account_id, utc_day)` reads two point-lookup heads:
  the sealed synopsis cursor and the receipt-publication
  cursor head. `lag_publications` is
  `newest_receipt_publication_cursor - watermark_high`.
  The synopsis row is not rewritten. `ACKED` stays an
  effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted.
  Silence on the cursor head stays `UNKNOWN_EFFECT` and
  does not invent a lag.
- Semantic similarity may discover attestation profiles.
  It must never nominate a day, bind a cursor, seal an
  attestation, publish it, or notify a consumer.

Latency for receipt publication and for the synopsis fold
stays on their primary keys. Consistency of the lag is
the sealed attestation plus the two cursors it cites.
Neighbor availability stays at the 99.99% target because
an unscoped day walk, watermark walk, or packet walk is
**FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved attestation profile is procedural memory
   for "how one UTC day of a sealed synopsis is compared
   with the receipt cursor head." A profile never inlines
   a fact body, never rewrites `ACKED` as
   `TRUSTED_ENROLLED`, and never opens another nested
   expiry plane.
2. A session nominates exactly one `utc_day` by point
   lookup. The attestation then reads
   `agent_synfr_sealed_synopsis` and
   `agent_synfr_receipt_cursor_head` by
   `(account_id, utc_day)`. It does not discover the day
   by scanning receipts.
3. mondayDB evaluates the lag as a pure subtraction of
   the two cursors already stored. A cursor behind
   `watermark_high` is a regression and is rejected. A
   lag above `max_recordable_lag` is rejected instead of
   summarized from a scan.
4. Sealing binds the two cursors, the lag, and two
   attestation stewards. Those stewards are distinct from
   each other, from the synopsis stewards, and from the
   publication stewards. The attestation must not emit a
   fact body and must not emit `TRUSTED_ENROLLED`.
5. Publishing the attestation is a second point lookup of
   `(account_id, utc_day)`. Notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not enrollment and not a fact restore.
6. Unscoped cursor, synopsis, or board scans are
   **FULL SCAN REJECTED** before planning.

### Product outcome

For any account and UTC day, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, cursor bind, attestation, publication, or
  notify dispatch?
- What were `synopsis_watermark_high`,
  `newest_receipt_publication_cursor`, and
  `lag_publications`?
- Did the sealed synopsis stay at its original
  `watermark_high` while the receipt cursor head moved?
- Did `ACKED` stay an effect observation while the
  attestation key stayed `AWAITING_CONFIRMATION` and the
  body stayed omitted?
- Did cursor-head silence stay `UNKNOWN_EFFECT`?
- Can the attestation be replayed without invoking an LLM?

HNSW profile discovery stays account-scoped and never
authorizes this attestation.

## 2. Scope and ownership

The Synopsis Freshness Attestation Plane owns:

1. Immutable approved attestation profiles as procedural
   memory of "how one sealed synopsis day is compared with
   the receipt cursor head without inlining a disputed
   fact, treating `ACKED` as `TRUSTED_ENROLLED`, scanning
   receipts or context packets, or opening another nested
   expiry."
2. Tenant-scoped attestation sessions with purpose and
   budget fences, and a hard cap of one nominated UTC day
   per session.
3. Deterministic nomination of that day, then two point
   lookups: the sealed synopsis and the receipt cursor
   head.
4. A freshness grain keyed by `(account_id, utc_day)`
   that stores the two cursors, the lag, and the class
   `CURRENT`, `LAGGING`, or `UNKNOWN_EFFECT`.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the sealed attestation, audit
   replay, and a hard cap on recordable lag.

It integrates with, but does not replace:

- **Attachment-Receipt Outcome Synopsis Plane:** supplies
  the sealed synopsis head this plane reads. Exporters
  copy `watermark_high`, the three counts, the stewards,
  and the untrusted metadata onto
  `agent_synfr_sealed_synopsis` by point lookup of
  `(account_id, utc_day)`. This plane never re-folds the
  watermark range and never promotes `ACKED` to
  `TRUSTED_ENROLLED`.
- **Receipt publication:** advances
  `agent_synfr_receipt_cursor_head` by a primary-key
  upsert of the newest cursor. The head is one row per
  day. Maintaining it does not scan the publication log.
- **Query Governor / Budgets:** reserves nominate, bind,
  attest, vector, publish, and notify units. A lag above
  `max_recordable_lag` is rejected instead of accepted as
  a scanned total.

### Non-goals

- Letting an LLM decide that a small lag means the held
  facts are current enough to show.
- Admitting or denying agent use of a stale synopsis.
  This plane records the lag. A later lag-budget
  admission decision consumes it.
- Discovering which day to attest by scanning a board, a
  receipt log, or a citation ledger.
- Rewriting `watermark_high` on the sealed synopsis so
  the lag becomes zero.
- Cross-account attestations or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, packet bodies,
  or fact bodies on the attestation.
- Claiming distributed atomicity with external notify
  providers. Provider silence remains `UNKNOWN_EFFECT`.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because the synopsis effect was `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this attestation.

## 3. Product contract

### 3.1 Attestation profile contract

A profile version is immutable after approval. It defines:

- allowed freshness classes (`CURRENT`, `LAGGING`,
  `UNKNOWN_EFFECT`);
- attest threshold (distinct attestation stewards,
  minimum 2), max days per session (exactly 1), max
  nominated days (exactly 1), and `max_recordable_lag`;
- attest policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `ATTESTATION_NEVER_RESTORES_FACTS`,
  `ATTESTATION_NEVER_INLINES_BODY`,
  `ATTESTATION_NEVER_CONFIRMS`, `ONE_DAY_PER_SESSION`,
  `POINT_LOOKUP_ONLY`, `CURSOR_HEAD_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_ATTEST`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest compile
kind is `ATTEST_SYNOPSIS_FRESHNESS` (25 bytes). The
longest denial reason is `CURSOR_REGRESSION_DENIED` (25
bytes).

Approval and revocation require the authority fence
`approve_agent_synfr_profile` /
`revoke_agent_synfr_profile`, owned by
`agent_synfr_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, attest, vector, publish, and notify units, plus wall
time. `max_days_per_session` and `max_nominated_days` are
both exactly 1. A second day nomination in the same
session is rejected before it can fan out into a recursive
retrieval.

### 3.3 Cursor head and nomination contract

Upstream synopsis export writes one sealed synopsis row
per `(account_id, utc_day)`. Upstream receipt publication
upserts one cursor head per `(account_id, utc_day)` with
`newest_publication_cursor`. The head copy does not
include a fact body. A cursor update that moves backward
is rejected.

`nominate_agent_synfr_day(account_id, session_id,
utc_day, nomination_id, nomination_hash)` nominates that
day. A null `utc_day` is **FULL SCAN REJECTED**. The
access path is `POINT_LOOKUP`. `DAY_SCAN`,
`WATERMARK_SCAN`, and `PACKET_SCAN` are rejected.

### 3.4 Attest and freshness grain contract

`attest_agent_synfr_freshness` is the only compile that
writes a freshness attestation. It requires:

- a nomination of the same `(account_id, utc_day)`;
- one sealed synopsis row and one receipt cursor head for
  that key, both with `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`, `opens_nested_expiry = false`,
  and `ack_promoted_to_trust = false`;
- `attested_key_kind = AWAITING_CONFIRMATION` on the
  synopsis (`TRUSTED_ENROLLED` is rejected);
- publication stewards on the cursor head matching the
  publication stewards copied onto the synopsis;
- attestation stewards distinct from each other and from
  both synopsis stewards and both publication stewards;
- `newest_publication_cursor >= watermark_high`, and
  `lag_publications` within `max_recordable_lag`.

The grain is `(account_id, utc_day)`. It stores
`synopsis_watermark_high`,
`newest_receipt_publication_cursor`, `lag_publications`,
and `freshness_class`. `CURRENT` means lag 0. `LAGGING`
means lag greater than 0. `UNKNOWN_EFFECT` means the
cursor head declared silence, and the lag stays null.
`attestation_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as
`synopsis_effect_observation`. It does not write
`TRUSTED_ENROLLED`.

The sealed synopsis row is not updated. Freshness is the
gap between two immutable observations, not a rewrite of
the fold.

### 3.5 Notify and publication contract

`publish_agent_synfr_attestation` point-looks up
`(account_id, utc_day)` and appends one publication with
reason `SYNOPSIS_FRESHNESS_ATTESTED`. Effect intents start
as `PREPARED`. Provider silence stays `UNKNOWN_EFFECT`.
An acknowledgement does not enroll a key, restore a fact,
inline a body, or admit the synopsis for agent use.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`. RLS policy
   `tenant_isolation` is forced on every table.
2. Day nomination and attestation publication use point
   lookup. A missing `account_id` or `utc_day` is
   **FULL SCAN REJECTED**.
3. The attestation reads only the sealed synopsis head
   and the receipt cursor head for one
   `(account_id, utc_day)`. There is no context-packet
   table and no receipt-log scan in this plane.
4. `ACKED` is the synopsis effect observation copied onto
   the attestation. It never writes `TRUSTED_ENROLLED` or
   `TRUSTED_WITHIN_SKEW`.
5. `RESTORED` and `BODY_VISIBLE` are rejected.
6. `attestation_body`, `synopsis_body`, and
   `cursor_payload` never contain a fact body.
7. `opens_nested_expiry` is rejected. This plane does not
   start another expiry, containment, review, or
   resolution cycle.
8. `PACKET_SCAN`, `DAY_SCAN`, and `WATERMARK_SCAN` are
   rejected.
9. Attestation stewards are distinct from each other,
   from the synopsis stewards, and from the publication
   stewards.
10. Profile approval and revocation go through the
    authority fence. Sealed profiles and sealed attest
    rules are immutable.
11. One session nominates one UTC day and writes one
    attestation.
12. Silence is not a lag of zero. A freshness hash is not
    a fact hash.
13. The database engine stays deterministic. Agents above
    it may be probabilistic. Similarity never nominates a
    day and never authorizes an attestation.
14. `newest_publication_cursor` is monotonic on the cursor
    head. A head cannot move behind a cursor it already
    published. The sealed synopsis `watermark_high` is
    immutable.

## 5. Execution model

The synopsis row store remains the authority for the
folded counts and `watermark_high`. The receipt cursor
head is the authority for the newest publication cursor.
This plane's row store holds those two exported heads
plus the sealed attestation. The columnar grain is that
attestation: one row per `(account_id, utc_day)`.

The attest reads two primary keys and writes one binding,
one compile, one certificate, one decision, and one
attestation in the same transaction. Publication is a
second point lookup that appends history without
rewriting the lag. Notify dispatch is outside the ACID
boundary and starts at `PREPARED`.

An agent perceives the lag and the freshness class, not
the facts behind the sealed synopsis. The attestation is
procedural evidence that the day's synopsis cursor and
receipt cursor were subtracted without restoring a
citation.

## 6. Lifecycle

### 6.1 Draft and approve

A profile is inserted as `DRAFT` with at least one
dual-control attest rule. `approve_agent_synfr_profile`
checks the definition hash and sets
`app.synfr_profile_approval` before the status becomes
`APPROVED`.

### 6.2 Open and nominate

A session opens under an approved profile.
`nominate_agent_synfr_day` requires a non-null
`utc_day`. A null day is **FULL SCAN REJECTED**.

### 6.3 Bind and evaluate

Cursor binding records the two heads the attestation
will cite. Evaluation is subtraction of those cursors.
It cannot inline a body, promote `ACKED`, or open a
nested expiry. Silence yields `UNKNOWN_EFFECT` and a
null lag.

### 6.4 Seal

Dual-control attestation stewards seal the certificate.
Synopsis stewards and publication stewards are excluded.
The decision row `ATTEST_SYNOPSIS_FRESHNESS` and the
freshness grain commit together. The sealed synopsis
row stays unchanged.

### 6.5 Publish and notify

`publish_agent_synfr_attestation` appends
`SYNOPSIS_FRESHNESS_ATTESTED`. Notify may remain
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

The session closes. Audit events stay hash-chained.
Revocation with `STOP_BEFORE_ATTEST` blocks new
nominations. In-flight sealed attestations remain
replayable.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type AttestationId = string & { readonly brand: "AttestationId" };
type CompileId = string & { readonly brand: "CompileId" };
type CertificateId = string & { readonly brand: "CertificateId" };
type DecisionId = string & { readonly brand: "DecisionId" };
type PublicationId = string & { readonly brand: "PublicationId" };
type ConsumerRef = string & { readonly brand: "ConsumerRef" };
type Sha256 = string & { readonly brand: "Sha256" };
type Timestamp = string & { readonly brand: "Timestamp" };
type UtcDay = string & { readonly brand: "UtcDay" };

type TrustedNextAction =
  | "POINT_LOOKUP_FRESHNESS"
  | "STOP_BEFORE_ATTEST"
  | "UNKNOWN_EFFECT";

type SynopsisFreshnessBlockedReason =
  | "NULL_DAY_SCAN_DENIED"
  | "PACKET_SCAN_DENIED"
  | "CURSOR_REGRESSION_DENIED"
  | "FACT_BODY_INLINE_DENIED"
  | "ACK_AS_TRUST_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "STEWARD_REUSE_DENIED"
  | "CURSOR_HEAD_MISSED"
  | "LAG_BUDGET_EXCEEDED";

type ProfileStatus = "DRAFT" | "APPROVED" | "REVOKED";
type SessionStatus =
  | "OPEN"
  | "NOMINATING"
  | "ATTESTING"
  | "SEALED"
  | "DISPATCHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

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
type CompileKind = "ATTEST_SYNOPSIS_FRESHNESS" | "PUBLISH_FRESHNESS" | "NOMINATE_DAY";

interface AttestationProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly attestThreshold: number;
  readonly maxDaysPerSession: 1;
  readonly maxNominatedDays: 1;
  readonly maxRecordableLag: number;
  readonly procedureRef: string;
  readonly revocationPolicy: "ALLOW_IN_FLIGHT" | "STOP_BEFORE_ATTEST" | "REQUIRE_REVIEW";
}

interface SealedSynopsisHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly watermarkHigh: number;
  readonly sealedCount: number;
  readonly deniedCount: number;
  readonly unknownEffectCount: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: "AWAITING_CONFIRMATION";
  readonly factDisposition: "DISPUTED_HELD";
  readonly bodyVisibility: "OMITTED";
  readonly metadataTrust: MetadataTrust;
  readonly ackPromotedToTrust: false;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly packetScanUsed: false;
}

interface ReceiptCursorHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly newestPublicationCursor: number;
  readonly silenceObserved: boolean;
  readonly accessPath: "POINT_LOOKUP";
}

interface FreshnessAttestation {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly attestationId: AttestationId;
  readonly freshnessClass: FreshnessClass;
  readonly synopsisWatermarkHigh: number;
  readonly newestReceiptPublicationCursor: number | null;
  readonly lagPublications: number | null;
  readonly synopsisEffectObservation: EffectObservation;
  readonly attestedKeyKind: "AWAITING_CONFIRMATION";
  readonly metadataTrust: MetadataTrust;
  readonly factDisposition: "DISPUTED_HELD";
  readonly bodyVisibility: "OMITTED";
  readonly ackPromotedToTrust: false;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly packetScanUsed: false;
}

function lagPublications(
  synopsisWatermarkHigh: number,
  newestReceiptPublicationCursor: number,
  maxRecordableLag: number,
): number {
  if (
    !Number.isInteger(synopsisWatermarkHigh) ||
    !Number.isInteger(newestReceiptPublicationCursor) ||
    !Number.isInteger(maxRecordableLag)
  ) {
    throw new Error("FULL SCAN REJECTED");
  }
  if (newestReceiptPublicationCursor < synopsisWatermarkHigh) {
    throw new Error("CURSOR_REGRESSION_DENIED");
  }
  const lag = newestReceiptPublicationCursor - synopsisWatermarkHigh;
  if (lag > maxRecordableLag) {
    throw new Error("LAG_BUDGET_EXCEEDED");
  }
  return lag;
}

function classifyFreshness(lag: number | null, silenceObserved: boolean): FreshnessClass {
  if (silenceObserved || lag === null) {
    return "UNKNOWN_EFFECT";
  }
  if (lag === 0) {
    return "CURRENT";
  }
  return "LAGGING";
}

export type {
  AccountId,
  AttestationProfile,
  CompileKind,
  FreshnessAttestation,
  FreshnessClass,
  ReceiptCursorHead,
  SealedSynopsisHead,
  SynopsisFreshnessBlockedReason,
  TrustedNextAction,
};
export { classifyFreshness, lagPublications };
```

```ts
interface FreshnessPerceptionCard {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly freshnessClass: FreshnessClass;
  readonly lagPublications: number | null;
  readonly synopsisWatermarkHigh: number;
  readonly newestReceiptPublicationCursor: number | null;
  readonly attestedKeyKind: "AWAITING_CONFIRMATION";
  readonly metadataTrust: MetadataTrust;
  readonly factDisposition: "DISPUTED_HELD";
  readonly bodyVisibility: "OMITTED";
  readonly synopsisEffectObservation: EffectObservation;
  readonly ackPromotedToTrust: false;
  readonly inlinesFactBody: false;
  readonly opensNestedExpiry: false;
  readonly packetScanUsed: false;
  readonly trustedNextAction: TrustedNextAction;
}

interface AttestationDecisionResult {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly compileKind: "ATTEST_SYNOPSIS_FRESHNESS";
  readonly card: FreshnessPerceptionCard;
  readonly blockedReason: SynopsisFreshnessBlockedReason | null;
}

function perceiveFreshness(attestation: FreshnessAttestation): FreshnessPerceptionCard {
  return {
    accountId: attestation.accountId,
    utcDay: attestation.utcDay,
    freshnessClass: attestation.freshnessClass,
    lagPublications: attestation.lagPublications,
    synopsisWatermarkHigh: attestation.synopsisWatermarkHigh,
    newestReceiptPublicationCursor: attestation.newestReceiptPublicationCursor,
    attestedKeyKind: "AWAITING_CONFIRMATION",
    metadataTrust: "UNTRUSTED_METADATA",
    factDisposition: "DISPUTED_HELD",
    bodyVisibility: "OMITTED",
    synopsisEffectObservation: attestation.synopsisEffectObservation,
    ackPromotedToTrust: false,
    inlinesFactBody: false,
    opensNestedExpiry: false,
    packetScanUsed: false,
    trustedNextAction:
      attestation.freshnessClass === "UNKNOWN_EFFECT"
        ? "UNKNOWN_EFFECT"
        : "POINT_LOOKUP_FRESHNESS",
  };
}

function attestationDecision(
  attestation: FreshnessAttestation,
  decisionId: DecisionId,
): AttestationDecisionResult {
  return {
    accountId: attestation.accountId,
    decisionId,
    compileKind: "ATTEST_SYNOPSIS_FRESHNESS",
    card: perceiveFreshness(attestation),
    blockedReason: null,
  };
}

export type { AttestationDecisionResult, FreshnessPerceptionCard };
export { attestationDecision, perceiveFreshness };
```

## 8. SQL row-store schema

```sql
CREATE TYPE synfr_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE synfr_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'ATTESTING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synfr_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE synfr_denial_reason AS ENUM (
  'NULL_DAY_SCAN_DENIED',
  'PACKET_SCAN_DENIED',
  'CURSOR_REGRESSION_DENIED',
  'FACT_BODY_INLINE_DENIED',
  'ACK_AS_TRUST_DENIED',
  'NESTED_EXPIRY_DENIED',
  'STEWARD_REUSE_DENIED',
  'CURSOR_HEAD_MISSED'
);
CREATE TYPE synfr_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE synfr_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW', 'UNKNOWN_EFFECT'
);
CREATE TYPE synfr_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'RESTORED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synfr_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE synfr_access_path AS ENUM (
  'POINT_LOOKUP', 'DAY_SCAN', 'PACKET_SCAN', 'WATERMARK_SCAN'
);
CREATE TYPE synfr_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE synfr_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synfr_compile_kind AS ENUM (
  'ATTEST_SYNOPSIS_FRESHNESS', 'PUBLISH_FRESHNESS', 'NOMINATE_DAY'
);
CREATE TYPE synfr_terminal_kind AS ENUM (
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_synfr_profile_authority NOLOGIN;

CREATE TABLE agent_synfr_authorization_evidence (
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

CREATE TABLE agent_synfr_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status synfr_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  attest_threshold SMALLINT NOT NULL CHECK (attest_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_recordable_lag INTEGER NOT NULL CHECK (max_recordable_lag BETWEEN 0 AND 100000),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN ('ALLOW_IN_FLIGHT', 'STOP_BEFORE_ATTEST', 'REQUIRE_REVIEW')
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
    REFERENCES agent_synfr_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_synfr_profile_attest_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_classes TEXT[] NOT NULL,
  attest_threshold SMALLINT NOT NULL CHECK (attest_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_recordable_lag INTEGER NOT NULL CHECK (max_recordable_lag BETWEEN 0 AND 100000),
  require_dual_control_attest BOOLEAN NOT NULL,
  attest_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_synfr_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_synfr_sealed_synopsis (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  synopsis_id UUID NOT NULL,
  synopsis_hash CHAR(64) NOT NULL CHECK (length(synopsis_hash) = 64),
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  watermark_high BIGINT NOT NULL CHECK (watermark_high >= 0),
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  effect_observation synfr_effect_observation NOT NULL,
  attested_key_kind synfr_attested_key_kind NOT NULL,
  fact_disposition synfr_fact_disposition NOT NULL,
  body_visibility synfr_body_visibility NOT NULL,
  metadata_trust synfr_metadata_trust NOT NULL,
  access_path synfr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  synopsis_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, synopsis_id),
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
  CHECK (NOT (synopsis_body ? 'factBody')),
  CHECK (NOT (synopsis_body ? 'fact_body')),
  CHECK (NOT (synopsis_body ? 'resolvedFactHash')),
  CHECK (
    effect_observation <> 'ACKED' OR ack_promoted_to_trust = false
  )
);

CREATE TABLE agent_synfr_receipt_cursor_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  newest_publication_cursor BIGINT NOT NULL CHECK (newest_publication_cursor >= 0),
  cursor_hash CHAR(64) NOT NULL CHECK (length(cursor_hash) = 64),
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  silence_observed BOOLEAN NOT NULL,
  access_path synfr_access_path NOT NULL,
  metadata_trust synfr_metadata_trust NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  cursor_payload JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  CHECK (publication_steward_a <> publication_steward_b),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (ack_promoted_to_trust = false),
  CHECK (NOT (cursor_payload ? 'factBody')),
  CHECK (NOT (cursor_payload ? 'fact_body')),
  CHECK (NOT (cursor_payload ? 'resolvedFactHash')),
  CHECK (cursor_payload->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED')
);

CREATE TABLE agent_synfr_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status synfr_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_attest_units BIGINT NOT NULL CHECK (budget_attest_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_publish_units BIGINT NOT NULL CHECK (budget_publish_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_attest_units BIGINT NOT NULL CHECK (consumed_attest_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_publish_units BIGINT NOT NULL CHECK (consumed_publish_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  attest_threshold SMALLINT NOT NULL CHECK (attest_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_recordable_lag INTEGER NOT NULL CHECK (max_recordable_lag BETWEEN 0 AND 100000),
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
    REFERENCES agent_synfr_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_synfr_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_attest_units <= budget_attest_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_notify_units <= budget_notify_units)
);

CREATE TABLE agent_synfr_day_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  access_path synfr_access_path NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id),
  CHECK (access_path = 'POINT_LOOKUP')
);

CREATE TABLE agent_synfr_cursor_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT NOT NULL CHECK (newest_receipt_publication_cursor >= 0),
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, session_id, utc_day),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id)
);

CREATE TABLE agent_synfr_attest_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT,
  lag_publications BIGINT,
  freshness_class synfr_freshness_class NOT NULL,
  attest_hash CHAR(64) NOT NULL CHECK (length(attest_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id),
  CHECK (
    (freshness_class = 'CURRENT' AND lag_publications = 0)
    OR (freshness_class = 'LAGGING' AND lag_publications > 0)
    OR (freshness_class = 'UNKNOWN_EFFECT' AND lag_publications IS NULL)
  )
);

CREATE TABLE agent_synfr_attestation_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  utc_day DATE NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT,
  lag_publications BIGINT,
  attestation_steward_a TEXT NOT NULL,
  attestation_steward_b TEXT NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision > 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_synfr_attest_compile (account_id, compile_id)
);

CREATE TABLE agent_synfr_attestation_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  compile_kind synfr_compile_kind NOT NULL,
  freshness_class synfr_freshness_class NOT NULL,
  effect_observation synfr_effect_observation NOT NULL,
  attested_key_kind synfr_attested_key_kind NOT NULL,
  fact_disposition synfr_fact_disposition NOT NULL,
  body_visibility synfr_body_visibility NOT NULL,
  access_path synfr_access_path NOT NULL,
  metadata_trust synfr_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  synopsis_watermark_high BIGINT NOT NULL,
  newest_receipt_publication_cursor BIGINT,
  lag_publications BIGINT,
  attest_hash CHAR(64) NOT NULL CHECK (length(attest_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_synfr_attestation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id)
);

CREATE TABLE agent_synfr_freshness_attestation (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  attestation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  freshness_class synfr_freshness_class NOT NULL,
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT,
  lag_publications BIGINT,
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  synopsis_effect_observation synfr_effect_observation NOT NULL,
  attested_key_kind synfr_attested_key_kind NOT NULL,
  fact_disposition synfr_fact_disposition NOT NULL,
  body_visibility synfr_body_visibility NOT NULL,
  metadata_trust synfr_metadata_trust NOT NULL,
  access_path synfr_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  attestation_body JSONB NOT NULL,
  attested_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, attestation_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_synfr_attestation_certificate (account_id, certificate_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (packet_scan_used = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (attestation_body ? 'factBody')),
  CHECK (NOT (attestation_body ? 'fact_body')),
  CHECK (NOT (attestation_body ? 'resolvedFactHash')),
  CHECK (attestation_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (
    (freshness_class = 'CURRENT' AND lag_publications = 0
      AND newest_receipt_publication_cursor = synopsis_watermark_high)
    OR (freshness_class = 'LAGGING' AND lag_publications > 0
      AND newest_receipt_publication_cursor = synopsis_watermark_high + lag_publications)
    OR (freshness_class = 'UNKNOWN_EFFECT' AND lag_publications IS NULL)
  ),
  CHECK (
    synopsis_effect_observation <> 'ACKED' OR (
      attested_key_kind = 'AWAITING_CONFIRMATION' AND ack_promoted_to_trust = false
    )
  )
);

CREATE TABLE agent_synfr_attestation_publication (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  attestation_id UUID NOT NULL,
  reason_code TEXT NOT NULL,
  lag_publications BIGINT,
  synopsis_watermark_high BIGINT NOT NULL,
  newest_receipt_publication_cursor BIGINT,
  freshness_class synfr_freshness_class NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, utc_day, attestation_id),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_synfr_freshness_attestation (account_id, utc_day),
  CHECK (reason_code = 'SYNOPSIS_FRESHNESS_ATTESTED')
);

CREATE TABLE agent_synfr_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status synfr_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL CHECK (length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_synfr_attestation_certificate (account_id, certificate_id)
);

CREATE TABLE agent_synfr_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units BIGINT NOT NULL CHECK (units >= 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id)
);

CREATE TABLE agent_synfr_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  terminal_kind synfr_terminal_kind NOT NULL,
  reason_code TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id)
);

CREATE TABLE agent_synfr_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash CHAR(64) NOT NULL CHECK (length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synfr_session (account_id, session_id)
);

CREATE TABLE agent_synfr_audit_head (
  account_id BIGINT NOT NULL,
  head_id UUID NOT NULL,
  chain_hash CHAR(64) NOT NULL CHECK (length(chain_hash) = 64),
  event_count BIGINT NOT NULL CHECK (event_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, head_id)
);

CREATE TABLE agent_synfr_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  session_id UUID,
  prev_hash CHAR(64) NOT NULL CHECK (length(prev_hash) = 64),
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  event_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_synfr_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  chain_hash CHAR(64) NOT NULL CHECK (length(chain_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_synfr_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  attestation_id UUID,
  cursor_high BIGINT NOT NULL CHECK (cursor_high >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id)
);

CREATE FUNCTION protect_agent_synfr_profile()
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
      IF current_setting('app.synfr_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.synfr_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_synfr_profile_protect
BEFORE INSERT OR UPDATE ON agent_synfr_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_profile();

CREATE FUNCTION protect_agent_synfr_attest_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status synfr_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_synfr_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed attest rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_synfr_attest_rule_protect
BEFORE UPDATE ON agent_synfr_profile_attest_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_attest_rule();

CREATE FUNCTION protect_agent_synfr_synopsis()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_synopsis$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed synopsis head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.synopsis_body ? 'factBody'
     OR NEW.synopsis_body ? 'fact_body'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'synopsis fence';
  END IF;
  RETURN NEW;
END
$protect_synopsis$;

CREATE TRIGGER agent_synfr_synopsis_protect
BEFORE INSERT OR UPDATE ON agent_synfr_sealed_synopsis
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_synopsis();

CREATE FUNCTION protect_agent_synfr_cursor()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_cursor$
BEGIN
  IF NEW.inlines_fact_body
     OR NEW.cursor_payload ? 'factBody'
     OR NEW.cursor_payload ? 'fact_body'
     OR NEW.cursor_payload ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.opens_nested_expiry THEN
    RAISE EXCEPTION 'nested-expiry fence';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.cursor_payload->>'attestedKeyKind' = 'TRUSTED_ENROLLED' THEN
    RAISE EXCEPTION 'ack-as-trust fence blocks promoting ACKED to TRUSTED_ENROLLED';
  END IF;

  IF NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.newest_publication_cursor < OLD.newest_publication_cursor THEN
      RAISE EXCEPTION 'cursor regression';
    END IF;
    IF OLD.account_id IS DISTINCT FROM NEW.account_id
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day THEN
      RAISE EXCEPTION 'cursor head identity is immutable';
    END IF;
  END IF;

  RETURN NEW;
END
$protect_cursor$;

CREATE TRIGGER agent_synfr_cursor_protect
BEFORE INSERT OR UPDATE ON agent_synfr_receipt_cursor_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_cursor();

CREATE FUNCTION protect_agent_synfr_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.attest_hash IS DISTINCT FROM NEW.attest_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'attestation decision identity is immutable';
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

CREATE TRIGGER agent_synfr_decision_protect
BEFORE INSERT OR UPDATE ON agent_synfr_attestation_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_decision();

CREATE FUNCTION protect_agent_synfr_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.attestation_steward_a = NEW.attestation_steward_b
     OR NEW.attestation_steward_a IN (
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.attestation_steward_b IN (
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.synopsis_steward_a = NEW.synopsis_steward_b
     OR NEW.publication_steward_a = NEW.publication_steward_b THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_synfr_certificate_protect
BEFORE INSERT OR UPDATE ON agent_synfr_attestation_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_certificate();

CREATE FUNCTION protect_agent_synfr_effect_intent()
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

CREATE TRIGGER agent_synfr_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_synfr_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_effect_intent();

CREATE FUNCTION protect_agent_synfr_attestation()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_attestation$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed freshness attestation is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.attestation_body ? 'factBody'
     OR NEW.attestation_body ? 'fact_body'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'attestation fence';
  END IF;
  RETURN NEW;
END
$protect_attestation$;

CREATE TRIGGER agent_synfr_attestation_protect
BEFORE INSERT OR UPDATE ON agent_synfr_freshness_attestation
FOR EACH ROW EXECUTE FUNCTION protect_agent_synfr_attestation();

CREATE FUNCTION approve_agent_synfr_profile(
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
  stored_status synfr_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_synfr_profile
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
  FROM agent_synfr_profile_attest_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_attest IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control attest rule';
  END IF;

  PERFORM set_config(
    'app.synfr_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_synfr_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_synfr_profile(
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
  stored_status synfr_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_synfr_profile
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
    'app.synfr_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_synfr_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_synfr_day(
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
  v_session_status synfr_session_status;
  v_profile_status synfr_profile_status;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF length(p_nomination_hash) <> 64 THEN
    RAISE EXCEPTION 'nomination hash must be 64 hex characters';
  END IF;

  SELECT s.status, pr.status
    INTO v_session_status, v_profile_status
  FROM agent_synfr_session AS s
  JOIN agent_synfr_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'nomination requires an open session on an approved profile';
  END IF;

  INSERT INTO agent_synfr_day_nomination (
    account_id, nomination_id, session_id, utc_day,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION attest_agent_synfr_freshness(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_attestation_id UUID,
  p_attest_digest TEXT,
  p_attestation_steward_a TEXT,
  p_attestation_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $attest$
DECLARE
  v_nominated DATE;
  v_max_lag INTEGER;
  v_synopsis agent_synfr_sealed_synopsis%ROWTYPE;
  v_cursor agent_synfr_receipt_cursor_head%ROWTYPE;
  v_lag BIGINT;
  v_class synfr_freshness_class;
  v_effect synfr_effect_observation;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF length(p_attest_digest) <> 64 THEN
    RAISE EXCEPTION 'attest digest must be 64 hex characters';
  END IF;

  SELECT utc_day INTO v_nominated
  FROM agent_synfr_day_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated IS DISTINCT FROM p_utc_day THEN
    RAISE EXCEPTION 'attest requires a nominated utc_day point lookup';
  END IF;

  SELECT p.max_recordable_lag INTO v_max_lag
  FROM agent_synfr_session AS s
  JOIN agent_synfr_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id
    AND p.status = 'APPROVED';

  IF v_max_lag IS NULL THEN
    RAISE EXCEPTION 'session point lookup missed';
  END IF;

  SELECT * INTO v_synopsis
  FROM agent_synfr_sealed_synopsis
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sealed synopsis point lookup missed';
  END IF;

  SELECT * INTO v_cursor
  FROM agent_synfr_receipt_cursor_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'receipt cursor head point lookup missed';
  END IF;

  IF v_synopsis.inlines_fact_body
     OR v_synopsis.opens_nested_expiry
     OR v_synopsis.ack_promoted_to_trust
     OR v_synopsis.packet_scan_used
     OR v_synopsis.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_synopsis.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR v_synopsis.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR v_synopsis.body_visibility IS DISTINCT FROM 'OMITTED'
     OR v_synopsis.synopsis_body ? 'factBody'
     OR v_synopsis.synopsis_body ? 'fact_body'
     OR v_cursor.inlines_fact_body
     OR v_cursor.opens_nested_expiry
     OR v_cursor.ack_promoted_to_trust
     OR v_cursor.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_cursor.cursor_payload ? 'factBody'
     OR v_cursor.cursor_payload ? 'fact_body'
     OR v_cursor.cursor_payload ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'freshness fence';
  END IF;

  IF v_cursor.publication_steward_a IS DISTINCT FROM v_synopsis.publication_steward_a
     OR v_cursor.publication_steward_b IS DISTINCT FROM v_synopsis.publication_steward_b THEN
    RAISE EXCEPTION 'publication steward mismatch';
  END IF;

  IF p_attestation_steward_a = p_attestation_steward_b
     OR p_attestation_steward_a IN (
       v_synopsis.synopsis_steward_a, v_synopsis.synopsis_steward_b,
       v_synopsis.publication_steward_a, v_synopsis.publication_steward_b
     )
     OR p_attestation_steward_b IN (
       v_synopsis.synopsis_steward_a, v_synopsis.synopsis_steward_b,
       v_synopsis.publication_steward_a, v_synopsis.publication_steward_b
     ) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;

  IF v_cursor.silence_observed THEN
    v_class := 'UNKNOWN_EFFECT';
    v_lag := NULL;
    v_effect := 'UNKNOWN_EFFECT';
  ELSE
    IF v_cursor.newest_publication_cursor < v_synopsis.watermark_high THEN
      RAISE EXCEPTION 'cursor regression';
    END IF;
    v_lag := v_cursor.newest_publication_cursor - v_synopsis.watermark_high;
    IF v_lag > v_max_lag THEN
      RAISE EXCEPTION 'lag exceeds recordable budget';
    END IF;
    IF v_lag = 0 THEN
      v_class := 'CURRENT';
    ELSE
      v_class := 'LAGGING';
    END IF;
    v_effect := v_synopsis.effect_observation;
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'lagPublications', v_lag,
    'freshnessClass', v_class,
    'synopsisWatermarkHigh', v_synopsis.watermark_high,
    'newestReceiptPublicationCursor', CASE
      WHEN v_class = 'UNKNOWN_EFFECT' THEN NULL
      ELSE v_cursor.newest_publication_cursor
    END,
    'metadataTrust', 'UNTRUSTED_METADATA',
    'attestedKeyKind', 'AWAITING_CONFIRMATION',
    'ackPromotedToTrust', false,
    'inlinesFactBody', false,
    'opensNestedExpiry', false,
    'packetScanUsed', false
  );

  INSERT INTO agent_synfr_cursor_binding (
    account_id, binding_id, session_id, utc_day,
    synopsis_watermark_high, newest_receipt_publication_cursor,
    bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day,
    v_synopsis.watermark_high, v_cursor.newest_publication_cursor,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synfr_attest_compile (
    account_id, compile_id, session_id, utc_day,
    synopsis_watermark_high, newest_receipt_publication_cursor,
    lag_publications, freshness_class, attest_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day,
    v_synopsis.watermark_high,
    CASE WHEN v_class = 'UNKNOWN_EFFECT' THEN NULL ELSE v_cursor.newest_publication_cursor END,
    v_lag, v_class, p_attest_digest, clock_timestamp()
  );

  INSERT INTO agent_synfr_attestation_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_ref,
    utc_day, purpose_hash, synopsis_watermark_high,
    newest_receipt_publication_cursor, lag_publications,
    attestation_steward_a, attestation_steward_b,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_certificate_id, p_session_id, p_compile_id,
    'consumer:freshness-agent', p_utc_day, p_attest_digest,
    v_synopsis.watermark_high,
    CASE WHEN v_class = 'UNKNOWN_EFFECT' THEN NULL ELSE v_cursor.newest_publication_cursor END,
    v_lag,
    p_attestation_steward_a, p_attestation_steward_b,
    v_synopsis.synopsis_steward_a, v_synopsis.synopsis_steward_b,
    v_synopsis.publication_steward_a, v_synopsis.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synfr_attestation_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    compile_kind, freshness_class, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust,
    packet_scan_used, synopsis_watermark_high,
    newest_receipt_publication_cursor, lag_publications,
    attest_hash, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    'ATTEST_SYNOPSIS_FRESHNESS', v_class, v_effect,
    'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
    'UNTRUSTED_METADATA', false, false, false, false,
    v_synopsis.watermark_high,
    CASE WHEN v_class = 'UNKNOWN_EFFECT' THEN NULL ELSE v_cursor.newest_publication_cursor END,
    v_lag, p_attest_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synfr_freshness_attestation (
    account_id, utc_day, attestation_id, session_id, certificate_id,
    freshness_class, synopsis_watermark_high, newest_receipt_publication_cursor,
    lag_publications, sealed_count, denied_count, unknown_effect_count,
    synopsis_effect_observation, attested_key_kind, fact_disposition,
    body_visibility, metadata_trust, access_path, inlines_fact_body,
    opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
    attestation_body, attested_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_attestation_id, p_session_id, p_certificate_id,
    v_class, v_synopsis.watermark_high,
    CASE WHEN v_class = 'UNKNOWN_EFFECT' THEN NULL ELSE v_cursor.newest_publication_cursor END,
    v_lag, v_synopsis.sealed_count, v_synopsis.denied_count, v_synopsis.unknown_effect_count,
    v_effect, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
    'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP', false,
    false, false, false,
    v_body, clock_timestamp(), clock_timestamp()
  );
END
$attest$;

CREATE FUNCTION publish_agent_synfr_attestation(
  p_tenant_id BIGINT,
  p_utc_day DATE,
  p_attestation_id UUID,
  p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_grain agent_synfr_freshness_attestation%ROWTYPE;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL OR p_attestation_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_grain
  FROM agent_synfr_freshness_attestation
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND
     OR v_grain.attestation_id IS DISTINCT FROM p_attestation_id
     OR v_grain.inlines_fact_body
     OR v_grain.ack_promoted_to_trust
     OR v_grain.opens_nested_expiry
     OR v_grain.packet_scan_used
     OR v_grain.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'attestation publication requires a sealed day point lookup';
  END IF;

  INSERT INTO agent_synfr_attestation_publication (
    account_id, record_id, utc_day, attestation_id, reason_code,
    lag_publications, synopsis_watermark_high,
    newest_receipt_publication_cursor, freshness_class, created_at
  ) VALUES (
    p_tenant_id, p_record_id, p_utc_day, p_attestation_id,
    'SYNOPSIS_FRESHNESS_ATTESTED',
    v_grain.lag_publications, v_grain.synopsis_watermark_high,
    v_grain.newest_receipt_publication_cursor, v_grain.freshness_class,
    clock_timestamp()
  );
END
$publish$;

CREATE FUNCTION reject_agent_synfr_unscoped_scan(
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

ALTER FUNCTION approve_agent_synfr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_synfr_profile_authority;
ALTER FUNCTION revoke_agent_synfr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_synfr_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_synfr_profile_authority;
GRANT SELECT ON
  agent_synfr_profile,
  agent_synfr_profile_attest_rule
TO agent_synfr_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_synfr_profile TO agent_synfr_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_synfr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_synfr_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_synfr_profile FROM PUBLIC;

CREATE INDEX agent_synfr_session_work_idx ON agent_synfr_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_synfr_session_profile_idx ON agent_synfr_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_synfr_synopsis_day_idx ON agent_synfr_sealed_synopsis (
  account_id, utc_day, watermark_high
);
CREATE INDEX agent_synfr_cursor_day_idx ON agent_synfr_receipt_cursor_head (
  account_id, utc_day, newest_publication_cursor
);
CREATE INDEX agent_synfr_nomination_session_idx ON agent_synfr_day_nomination (
  account_id, session_id, utc_day
);
CREATE INDEX agent_synfr_certificate_session_idx ON agent_synfr_attestation_certificate (
  account_id, session_id, utc_day
);
CREATE INDEX agent_synfr_decision_cert_idx ON agent_synfr_attestation_decision (
  account_id, certificate_id, decision_id
);
CREATE INDEX agent_synfr_attestation_id_idx ON agent_synfr_freshness_attestation (
  account_id, attestation_id
);
CREATE INDEX agent_synfr_publication_day_idx ON agent_synfr_attestation_publication (
  account_id, utc_day, record_id
);
CREATE INDEX agent_synfr_effect_work_idx ON agent_synfr_effect_intent (
  account_id, intent_status, updated_at, effect_id
);
CREATE INDEX agent_synfr_audit_time_idx ON agent_synfr_audit_event (
  account_id, created_at DESC, event_id
);
CREATE INDEX agent_synfr_command_expiry_idx ON agent_synfr_command_result (
  account_id, expires_at, command_id
);
CREATE INDEX agent_synfr_checkpoint_day_idx ON agent_synfr_projection_checkpoint (
  account_id, utc_day, created_at DESC, checkpoint_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_synfr_authorization_evidence',
    'agent_synfr_profile',
    'agent_synfr_profile_attest_rule',
    'agent_synfr_sealed_synopsis',
    'agent_synfr_receipt_cursor_head',
    'agent_synfr_session',
    'agent_synfr_day_nomination',
    'agent_synfr_cursor_binding',
    'agent_synfr_attest_compile',
    'agent_synfr_attestation_certificate',
    'agent_synfr_attestation_decision',
    'agent_synfr_freshness_attestation',
    'agent_synfr_attestation_publication',
    'agent_synfr_effect_intent',
    'agent_synfr_budget_ledger',
    'agent_synfr_terminal_record',
    'agent_synfr_command_result',
    'agent_synfr_audit_head',
    'agent_synfr_audit_event',
    'agent_synfr_audit_anchor',
    'agent_synfr_projection_checkpoint'
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

Day nomination, cursor binding, lag evaluation, and the
freshness attestation commit or roll back together when
they run in one command transaction. The reference attest
writes the binding, compile, certificate, decision, and
attestation in one function body. Publication is its own
append. Notify dispatch is not part of the database
transaction. `state_revision` is the compare-and-swap
token for session commands.

### 8.2 Tenant isolation

`account_id` is the first column of every table and every
index. `FORCE ROW LEVEL SECURITY` applies
`tenant_isolation` using `app.account_id`. Cross-tenant
reads and writes fail closed. There is no global cursor
head and no context-packet catalog in this plane.

## 9. Open API GraphQL contract

```graphql
scalar DateTime
scalar Date
scalar Long
scalar JSON
scalar SHA256

enum AgentSynfrSessionStatus {
  OPEN
  NOMINATING
  ATTESTING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentSynfrFreshnessClass {
  CURRENT
  LAGGING
  UNKNOWN_EFFECT
}

enum AgentSynfrKeyKind {
  AWAITING_CONFIRMATION
  UNKNOWN_EFFECT
}

type AgentSynfrProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  maxRecordableLag: Int!
  procedureRef: String
}

type AgentSynfrSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  status: AgentSynfrSessionStatus!
  purpose: String!
  deadlineAt: DateTime!
}

type AgentSynfrFreshnessAttestation {
  accountId: ID!
  utcDay: Date!
  attestationId: ID!
  freshnessClass: AgentSynfrFreshnessClass!
  synopsisWatermarkHigh: Long!
  newestReceiptPublicationCursor: Long
  lagPublications: Long
  synopsisEffectObservation: String!
  attestedKeyKind: AgentSynfrKeyKind!
  metadataTrust: String!
  factDisposition: String!
  bodyVisibility: String!
  ackPromotedToTrust: Boolean!
  inlinesFactBody: Boolean!
}

type AgentSynfrReceiptCursor {
  accountId: ID!
  utcDay: Date!
  newestPublicationCursor: Long!
  silenceObserved: Boolean!
}

type AgentSynfrAuditEvent {
  accountId: ID!
  eventId: ID!
  eventKind: String!
  eventHash: SHA256!
  createdAt: DateTime!
}

type AgentSynfrProfileMatch {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  score: Float!
}

type AgentSynfrDayNomination {
  accountId: ID!
  nominationId: ID!
  utcDay: Date!
  accessPath: String!
}

type AgentSynfrCursorBinding {
  accountId: ID!
  bindingId: ID!
  utcDay: Date!
  synopsisWatermarkHigh: Long!
  newestReceiptPublicationCursor: Long!
}

type AgentSynfrDecisionResult {
  accountId: ID!
  decisionId: ID!
  freshnessClass: AgentSynfrFreshnessClass!
  lagPublications: Long
  blockedReason: String
}

type AgentSynfrAttestationPublication {
  accountId: ID!
  recordId: ID!
  utcDay: Date!
  reasonCode: String!
  lagPublications: Long
}

type AgentSynfrEffectIntent {
  accountId: ID!
  effectId: ID!
  intentStatus: String!
}

input CreateAgentSynfrProfileInput {
  accountId: ID!
  profileId: ID!
  name: String!
  definitionHash: SHA256!
  maxRecordableLag: Int!
  procedureRef: String!
}

input ApproveAgentSynfrProfileInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  definitionHash: SHA256!
}

input RevokeAgentSynfrProfileInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  definitionHash: SHA256!
}

input OpenAgentSynfrSessionInput {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
}

input NominateAgentSynfrDayInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  nominationId: ID!
  nominationHash: SHA256!
}

input BindAgentSynfrCursorsInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  bindingId: ID!
}

input AttestAgentSynfrFreshnessInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  attestationId: ID!
  attestDigest: SHA256!
  attestationStewardA: String!
  attestationStewardB: String!
}

input PublishAgentSynfrAttestationInput {
  accountId: ID!
  utcDay: Date!
  attestationId: ID!
  recordId: ID!
}

input RecordAgentSynfrEffectInput {
  accountId: ID!
  effectId: ID!
  sessionId: ID!
  certificateId: ID!
  providerIdempotencyKey: String!
  canonicalRequestHash: SHA256!
}

input CloseAgentSynfrSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
}

type Query {
  agentSynfrProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AgentSynfrProfile
  agentSynfrSession(accountId: ID!, sessionId: ID!): AgentSynfrSession
  agentSynfrFreshnessAttestation(accountId: ID!, utcDay: Date!): AgentSynfrFreshnessAttestation
  agentSynfrReceiptCursor(accountId: ID!, utcDay: Date!): AgentSynfrReceiptCursor
  agentSynfrAuditEvents(accountId: ID!, attestationId: ID!): [AgentSynfrAuditEvent!]!
  searchAgentSynfrProfiles(accountId: ID!, semanticQuery: String!, topK: Int!): [AgentSynfrProfileMatch!]!
}

type Mutation {
  createAgentSynfrProfile(input: CreateAgentSynfrProfileInput!): AgentSynfrProfile!
  approveAgentSynfrProfile(input: ApproveAgentSynfrProfileInput!): AgentSynfrProfile!
  revokeAgentSynfrProfile(input: RevokeAgentSynfrProfileInput!): AgentSynfrProfile!
  openAgentSynfrSession(input: OpenAgentSynfrSessionInput!): AgentSynfrSession!
  nominateAgentSynfrDay(input: NominateAgentSynfrDayInput!): AgentSynfrDayNomination!
  bindAgentSynfrCursors(input: BindAgentSynfrCursorsInput!): AgentSynfrCursorBinding!
  attestAgentSynfrFreshness(input: AttestAgentSynfrFreshnessInput!): AgentSynfrDecisionResult!
  publishAgentSynfrAttestation(input: PublishAgentSynfrAttestationInput!): AgentSynfrAttestationPublication!
  recordAgentSynfrEffect(input: RecordAgentSynfrEffectInput!): AgentSynfrEffectIntent!
  closeAgentSynfrSession(input: CloseAgentSynfrSessionInput!): AgentSynfrSession!
}
```

### GraphQL limits

Every field above is scoped by `accountId`. `utcDay` is
required on attestation and cursor reads. A missing day is
**FULL SCAN REJECTED** at the resolver before planning.
`searchAgentSynfrProfiles` returns profile ids only.
A match does not nominate a day and does not publish an
attestation. `topK` is capped by the session vector budget.

## 10. Procedural memory

The approved profile is the instruction an agent can
read without guessing:

- nominate one `utc_day`;
- point-look up the sealed synopsis and the receipt
  cursor head;
- subtract the cursors;
- seal `CURRENT`, `LAGGING`, or `UNKNOWN_EFFECT`;
- leave `ACKED` as an effect observation;
- leave the key at `AWAITING_CONFIRMATION`;
- leave the fact body omitted;
- leave nested expiry closed.

`attest_instruction` on the rule row is that procedure in
canonical JSON. The database evaluates the procedure. The
agent does not.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_synfr_profile_embedding (
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
    REFERENCES agent_synfr_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_synfr_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_synfr_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_synfr_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped cursor, synopsis, or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one `utc_day`, and attests that day's
two heads under dual control. Similarity never publishes
an attestation and never restores a fact.

## 12. Agent perception

Agents receive one freshness card per `(account_id, utc_day)`.
The card exposes `freshnessClass`, `lagPublications`,
`synopsisWatermarkHigh`, and `newestReceiptPublicationCursor`.
It repeats `attestedKeyKind = AWAITING_CONFIRMATION`,
`metadataTrust = UNTRUSTED_METADATA`,
`factDisposition = DISPUTED_HELD`, and
`bodyVisibility = OMITTED`. `ACKED` appears only as
`synopsisEffectObservation`. The card has no fact body
and no `TRUSTED_ENROLLED` bit.

A retrieval agent can rank profiles by the embedding.
It cannot treat a low lag as permission to inline a held
fact or to skip the later lag-budget admission decision.

## 13. ACID and consistency

### Row store

Profile approval, nomination, attestation, and publication
are transactional. The two source heads are read with
primary-key equality inside the attest transaction. A
cursor regression fails the transaction. The sealed
synopsis head is not updated, so the fold's
`watermark_high` stays the cursor the synopsis actually
sealed.

### Columnar store

The freshness grain is one row per `(account_id, utc_day)`.
It is written in the same transaction as the decision.
Readers never assemble the lag by scanning the receipt log.

### Vector store

Embeddings are updated when a profile version is approved.
They are not updated when a lag changes. A stale embedding
can still point at the right profile; it cannot change
the lag.

### External tools

Notify providers sit outside the database transaction.
Their silence is `UNKNOWN_EFFECT`. An ack of the notify
does not change `attested_key_kind` and does not set
`ack_promoted_to_trust`.

## 14. Guardrails and neighbor protection

- One session, one UTC day, one attestation.
- `max_recordable_lag` rejects a cursor gap that would
  otherwise be explained by scanning a large receipt log
  and stuffing the total into one row.
- `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN` fail
  closed.
- Attestation stewards cannot reuse synopsis or
  publication stewards, so the fold's authors cannot
  certify their own freshness.
- Effect intents start at `PREPARED`. A prepared request
  hash is immutable, so a retry cannot retarget the
  attestation.
- Budgets cap nominate, bind, attest, vector, publish,
  and notify units, plus wall time. A recursive agent
  that keeps re-attesting the same day hits the session
  cap of one nomination.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Selecting the newest receipt by `max(publication_watermark)`
  across a day with millions of receipts is a range read
  this plane does not do. The cursor head is one row.
- Joining attestations to context packets, perception
  cards, or board items to "explain" a lag is a 1M+ row
  walk and is **FULL SCAN REJECTED**.
- A null `utc_day` in `nominate_agent_synfr_day` or
  `publish_agent_synfr_attestation` would plan a day
  scan. Both functions reject it before the read.
- Building one global HNSW index over profile embeddings
  would read every tenant. The reference schema does not
  create that index.

### Required access paths

- Sealed synopsis: primary key `(account_id, utc_day)`.
- Receipt cursor head: primary key `(account_id, utc_day)`.
- Freshness attestation: primary key `(account_id, utc_day)`.
- Publication: unique `(account_id, utc_day, attestation_id)`.
- Session idempotency: unique `(account_id, idempotency_key)`.

### Planner enforcement

`reject_agent_synfr_unscoped_scan` is the explicit guard
the SQL tests call. Resolvers call it when `account_id`
or `utc_day` is missing. The attest function itself reads
only equality predicates on those two columns.

## 16. Auditability and replay

`agent_synfr_audit_event` stores `prev_hash` and
`event_hash`. `agent_synfr_audit_head` stores the chain
tip. `agent_synfr_audit_anchor` freezes a tip for an
external timestamp. Replay reads the attestation row and
recomputes `lag_publications` from the two cursors copied
onto the certificate. Replay does not call an embedding
model and does not read a fact body.

A publication record with reason
`SYNOPSIS_FRESHNESS_ATTESTED` is the deterministic trace
that the lag was published. The trace cites the cursors.
It does not cite a fact hash.

## 17. Threat and failure analysis

- A publication steward who also seals the attestation
  can hide a stale synopsis. The certificate trigger
  rejects that steward reuse.
- A payload that smuggles `factBody` onto the cursor head
  would turn freshness into disclosure. The cursor
  trigger rejects those keys.
- Writing `TRUSTED_ENROLLED` because the synopsis effect
  was `ACKED` would launder an effect observation into
  enrollment. The decision trigger rejects that key.
- Setting `opens_nested_expiry` would start another
  expiry cycle from a lag measurement. The decision
  trigger rejects it.
- `PACKET_SCAN` would walk neighbor rows to compute a
  cursor. The decision trigger rejects it.
- Inserting a profile as `APPROVED` skips the dual-control
  rule check. The profile trigger rejects it.
- Provider silence that is stored as `ACKED` would look
  like a successful notify. Effect intents cannot be
  inserted as anything other than `PREPARED`.
- A cursor that moves backward would shrink the lag after
  publication. The cursor trigger rejects regression.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- Attest reads two primary keys and writes five rows.
  It does not scale with the number of receipts in the day.
- Publish is one primary-key read and one insert.
- Alert when `freshness_class = LAGGING` and
  `lag_publications` is above the account's product
  threshold. That alert is an observation. It is not the
  admission decision.
- Alert when new attestations are `UNKNOWN_EFFECT`
  because cursor heads are silent.
- Alert when `reject_agent_synfr_unscoped_scan` fires.
  A spike means an agent is requesting an unbounded day.

## 19. Rollout

### Phase 1: shadow attestations

Write attestations for one internal account. Do not
publish them to the Open API. Compare lag with an
offline sample of cursor heads.

### Phase 2: deny-only

Enable the fences: fact body, `TRUSTED_ENROLLED`,
nested expiry, packet scan, null day, steward reuse.
No consumer notification.

### Phase 3: one day

Allow one nominated UTC day per session for a single
design partner. `max_recordable_lag` stays at the
profile cap.

### Phase 4: publish and notify uncertainty

Publish `SYNOPSIS_FRESHNESS_ATTESTED`. Notify stays
`UNKNOWN_EFFECT` until the provider acks. The ack does
not enroll a key.

### Phase 5: broad availability

Open the six queries and ten mutations on the monday.com
Open API. Keep HNSW account-partitioned. Keep the
admission decision out of this plane until the next
increment ships.

## 20. Ship criteria

### Contract validation

`npm run validate` typechecks the TypeScript contracts,
builds the GraphQL schema (6 queries, 10 mutations), and
executes the DDL on PGlite with pgvector.

### Behavioral validation

A fixture day whose synopsis sealed at cursor 12 and
whose receipt head sits at cursor 15 attests
`lag_publications = 3` and `freshness_class = LAGGING`.
The synopsis effect `ACKED` is copied. The key stays
`AWAITING_CONFIRMATION`. Counts stay 1/1/1. The body
has no fact. Publication reason is
`SYNOPSIS_FRESHNESS_ATTESTED`.

The same fixture rejects a null day, an unscoped scan,
a duplicate idempotency key, a sealed-rule edit, an
inserted-as-approved profile, a decision-hash edit, a
direct revocation, a non-prepared effect, a prepared
effect hash edit, a sealed definition edit, an
ack-as-trust decision, a fact-body cursor payload, a
nested-expiry decision, a packet-scan decision, and a
certificate that reuses a publication steward.

### Scale and failure validation

Explain plans for the attest path show primary-key
equality on `(account_id, utc_day)` for both heads.
A day with 1M receipts still reads one cursor head.
Cursor regression and lag above `max_recordable_lag`
fail the transaction.

## 21. Product decision

Ship the freshness attestation as a point lookup of one
sealed synopsis and one receipt cursor head. Record the
lag. Keep `ACKED` as an effect observation. Keep the key
at `AWAITING_CONFIRMATION`. Keep the body omitted. Keep
silence as `UNKNOWN_EFFECT`. Reject scans, fact bodies,
trust promotion, and nested expiry.

The next increment should admit or deny agent use of one
sealed synopsis by point lookup of `(account_id, utc_day)`
on this attestation, comparing `lag_publications` with a
profile lag budget. That admission decision must not scan
context packets, must not inline a fact body, must not
promote `ACKED` to `TRUSTED_ENROLLED`, and must not open
another nested expiry plane.
