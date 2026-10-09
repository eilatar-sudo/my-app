# mondayDB Agentic Synopsis Lag Admission Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-09.v1`

## 1. Why this plane, before how

The 2026-10-08 Synopsis Freshness Attestation Plane records,
for one `(account_id, utc_day)`, the gap
`lag_publications = newest_receipt_publication_cursor - watermark_high`.
It classifies that gap as `CURRENT`, `LAGGING`, or
`UNKNOWN_EFFECT`. It does not say whether an agent may use
the sealed synopsis.

Without this plane an agent either:

- walks context packets, receipt rows, or a board with
  1M+ rows to decide whether a lag of 3 is "small enough"
  (neighbor-harmful, and a miss against the 99.99%
  availability target), or
- treats `ACKED` inside the sealed bucket as
  `TRUSTED_ENROLLED` and inlines the disputed fact so the
  synopsis "looks current enough to use."

The product trade-off is **admission strictness versus
agent usefulness and neighbor latency**:

- A budget of zero admits only `CURRENT` synopses. Agents
  wait for a new seal, and a lagging but still useful
  daily card stays dark.
- An unbounded budget lets any sealed synopsis drive tool
  use, including one whose receipt cursor has run far
  ahead of `watermark_high`.
- This plane point-looks up one freshness attestation by
  `(account_id, utc_day)` and compares `lag_publications`
  with the approved profile's `max_lag_budget`. Lag within
  the budget, inclusive, is `ADMITTED`. Lag above the
  budget is `DENIED`. Silence and a null lag stay
  `UNKNOWN_EFFECT` and are not an admission. The
  attestation row is not rewritten. `ACKED` stays an
  effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted.

Semantic similarity may discover admission profiles. It
must never nominate a day, bind an attestation, seal an
admission, publish it, or notify a consumer.

Latency for the freshness attestation stays on its primary
key. Consistency of the decision is the sealed admission
plus the attestation cursor it cites. Neighbor availability
stays at the 99.99% target because an unscoped day walk
or packet walk is **FULL SCAN REJECTED** before it touches
a board.

The recommended model keeps the data plane deterministic:

1. An approved admission profile is procedural memory for
   "how one freshness attestation is compared with a lag
   budget." A profile never inlines a fact body, never
   rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one `utc_day` by point
   lookup. The decision then reads
   `agent_synad_freshness_head` by `(account_id, utc_day)`.
   It does not recompute the lag by scanning receipts.
3. mondayDB compares the attested `lag_publications` with
   `max_lag_budget`. The comparison is integer inequality.
   It does not call a model.
4. Sealing binds the attested lag, the budget, and two
   admission stewards. Those stewards are distinct from
   each other, from the attestation stewards, from the
   synopsis stewards, and from the publication stewards.
   The admission must not emit a fact body and must not
   emit `TRUSTED_ENROLLED`.
5. Publishing the admission is a second point lookup of
   `(account_id, utc_day)`. Notify intents may become
   `UNKNOWN_EFFECT` until acknowledged. A notify
   acknowledgement is not enrollment, not a fact restore,
   and not a second admission.
6. Unscoped attestation or board scans are
   **FULL SCAN REJECTED** before planning.

### Product outcome

For any account and UTC day, mondayDB can answer:

- Which profile, principal, and session authorized the
  nomination, attestation bind, admission, publication, or
  notify dispatch?
- What were `lag_publications`, `max_lag_budget`, and
  `admission_class`?
- Did a lag within budget admit use of the sealed counts
  while a lag above budget deny that use?
- Did silence stay `UNKNOWN_EFFECT` with a null lag?
- Did `ACKED` stay an effect observation while the key
  stayed `AWAITING_CONFIRMATION` and the body stayed
  omitted?
- Did the freshness head keep the lag it was exported
  with?
- Can the admission be replayed without invoking an LLM?

HNSW profile discovery stays account-scoped and never
authorizes this admission.

## 2. Scope and ownership

The Synopsis Lag Admission Plane owns:

1. Immutable approved admission profiles as procedural
   memory of "how one freshness attestation is admitted or
   denied against a lag budget without inlining a disputed
   fact, treating `ACKED` as `TRUSTED_ENROLLED`, scanning
   context packets, or opening another nested expiry."
2. Tenant-scoped admission sessions with purpose and
   budget fences, and a hard cap of one nominated UTC day
   per session.
3. Deterministic nomination of that day, then one point
   lookup of the freshness head.
4. An admission grain keyed by `(account_id, utc_day)`
   that stores the attested lag, the profile lag budget,
   and the class `ADMITTED`, `DENIED`, or
   `UNKNOWN_EFFECT`.
5. Publication records and notify intents with honest
   uncertainty.
6. Agent perception of the admission. Sealed counts are
   present on the perception card only when the class is
   `ADMITTED`.

It integrates with, but does not replace:

- **Synopsis Freshness Attestation Plane:** supplies the
  sealed attestation this plane reads. Exporters copy
  `lag_publications`, `freshness_class`, the cursors, the
  three counts, the stewards, and the untrusted metadata
  onto `agent_synad_freshness_head` by point lookup of
  `(account_id, utc_day)`. This plane never re-attests
  the cursors and never promotes `ACKED` to
  `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, bind,
  decide, vector, publish, and notify units. A lag above
  `max_lag_budget` is a `DENIED` decision, not a scan of
  the receipt log.

### Non-goals

- Letting an LLM decide that a lag "feels" inside budget.
- Rewriting `lag_publications` on the freshness head so
  an over-budget day becomes admissible.
- Showing sealed counts to an agent when the decision is
  `DENIED` or `UNKNOWN_EFFECT`. The audit row still stores
  the counts for steward replay. The perception card does
  not.
- Discovering which day to admit by scanning a board, a
  receipt log, or a citation ledger.
- Cross-account admissions or global nearest-neighbor
  authorization.
- Storing raw private keys, tool payloads, packet bodies,
  or fact bodies on the admission.
- Claiming distributed atomicity with external notify
  providers. Provider silence remains `UNKNOWN_EFFECT`.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED`
  because the synopsis effect was `ACKED`.
- Opening another nested expiry, containment, review, or
  resolution plane from this admission.

## 3. Product contract

### 3.1 Admission profile contract

A profile version is immutable after approval. It defines:

- allowed admission classes (`ADMITTED`, `DENIED`,
  `UNKNOWN_EFFECT`);
- admit threshold (distinct admission stewards, minimum
  2), max days per session (exactly 1), max nominated
  days (exactly 1), and `max_lag_budget`;
- admit policy (`HISTORY_NEVER_REWRITTEN`,
  `ACK_NEVER_TRUST`, `ADMISSION_NEVER_RESTORES_FACTS`,
  `ADMISSION_NEVER_INLINES_BODY`,
  `ADMISSION_NEVER_CONFIRMS`, `ONE_DAY_PER_SESSION`,
  `POINT_LOOKUP_ONLY`, `ATTESTATION_HEAD_ONLY`,
  `NESTED_EXPIRY_NEVER_OPENS`, `PACKET_NEVER_SCANNED`,
  `LAG_BUDGET_INCLUSIVE`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`,
  `STOP_BEFORE_DECIDE`, `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest compile
kind is `DECIDE_SYNOPSIS_ADMISSION` (25 bytes). The
longest denial reason is `ATTESTATION_HEAD_MISSED` (23
bytes).

`max_lag_budget` is an inclusive upper bound. Lag equal
to the budget is `ADMITTED`. Lag greater than the budget
is `DENIED`.

Approval and revocation require the authority fence
`approve_agent_synad_profile` /
`revoke_agent_synad_profile`, owned by
`agent_synad_profile_authority`. A profile cannot be
inserted as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent
on `(account_id, idempotency_key)`. Budgets cap nominate,
bind, decide, vector, publish, and notify units, plus wall
time. `max_days_per_session` and `max_nominated_days` are
both exactly 1. The session copies `max_lag_budget` from
the approved profile. A copied budget that drifts from the
profile is rejected. A second day nomination in the same
session is rejected before it can fan out into a recursive
retrieval.

### 3.3 Freshness head and nomination contract

Upstream attestation export writes one freshness head per
`(account_id, utc_day)`. The head copy includes
`lag_publications`, `freshness_class`, the two cursors,
the three counts, and the stewards. It does not include a
fact body. The head is immutable. This plane does not
advance it.

`nominate_agent_synad_day(account_id, session_id,
utc_day, nomination_id, nomination_hash)` nominates that
day. A null `utc_day` is **FULL SCAN REJECTED**. The
access path is `POINT_LOOKUP`. `DAY_SCAN`,
`WATERMARK_SCAN`, and `PACKET_SCAN` are rejected.

### 3.4 Decide and admission grain contract

`decide_agent_synad_admission` is the only compile that
writes an admission. It requires:

- a nomination of the same `(account_id, utc_day)`;
- one freshness head for that key, with
  `access_path = POINT_LOOKUP`,
  `inlines_fact_body = false`,
  `opens_nested_expiry = false`,
  `ack_promoted_to_trust = false`, and
  `packet_scan_used = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- admission stewards distinct from each other and from
  both attestation stewards, both synopsis stewards, and
  both publication stewards;
- a session lag budget equal to the approved profile
  budget.

The grain is `(account_id, utc_day)`. Classification is:

- `UNKNOWN_EFFECT` when the head is silent, the freshness
  class is `UNKNOWN_EFFECT`, or `lag_publications` is
  null. The admission lag stays null. Counts are not
  shown to the agent.
- `DENIED` when `lag_publications` is greater than
  `max_lag_budget`. Counts are not shown to the agent.
- `ADMITTED` when `lag_publications` is less than or
  equal to `max_lag_budget`. The perception card may
  show `sealed_count`, `denied_count`, and
  `unknown_effect_count`.

`admission_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as
`synopsis_effect_observation`. It does not write
`TRUSTED_ENROLLED`. The freshness head row is not updated.

### 3.5 Notify and publication contract

`publish_agent_synad_admission` point-looks up
`(account_id, utc_day)` and appends one publication with
reason `SYNOPSIS_LAG_ADMISSION_DECIDED`. The publication
copies `admission_class`. It does not change it. Effect
intents start as `PREPARED`. Provider silence stays
`UNKNOWN_EFFECT`. An acknowledgement does not enroll a
key, restore a fact, inline a body, or rewrite the lag.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`. RLS policy
   `tenant_isolation` is forced on every table.
2. Day nomination and admission publication use point
   lookup. A missing `account_id` or `utc_day` is
   **FULL SCAN REJECTED**.
3. The decision reads only the freshness head for one
   `(account_id, utc_day)`. There is no context-packet
   table and no receipt-log scan in this plane.
4. `ACKED` is the synopsis effect observation copied onto
   the admission. It never writes `TRUSTED_ENROLLED` or
   `TRUSTED_WITHIN_SKEW`.
5. `RESTORED` and `BODY_VISIBLE` are rejected.
6. `admission_body`, `attestation_body`, and `card_body`
   never contain a fact body.
7. `opens_nested_expiry` is rejected. This plane does not
   start another expiry, containment, review, or
   resolution cycle.
8. `PACKET_SCAN`, `DAY_SCAN`, and `WATERMARK_SCAN` are
   rejected.
9. Admission stewards are distinct from each other, from
   the attestation stewards, from the synopsis stewards,
   and from the publication stewards.
10. Profile approval and revocation go through the
    authority fence. Sealed profiles and sealed admit
    rules are immutable.
11. One session nominates one UTC day and writes one
    admission.
12. Silence is not a lag of zero and is not `ADMITTED`.
    An admission hash is not a fact hash.
13. The database engine stays deterministic. Agents above
    it may be probabilistic. Similarity never nominates a
    day and never authorizes an admission.
14. The freshness head is immutable. Admission does not
    shrink `lag_publications` to fit the budget.
15. `ADMITTED` requires `lag_publications <= max_lag_budget`.
    `DENIED` requires `lag_publications > max_lag_budget`.
    A forged class is rejected.

## 5. Execution model

The freshness head remains the authority for the attested
lag. This plane's row store holds that exported head plus
the sealed admission. The columnar grain is the admission:
one row per `(account_id, utc_day)`.

The decide reads one primary key and writes one binding,
one compile, one certificate, one decision, one admission,
and one perception card in the same transaction.
Publication is a second point lookup that appends history
without rewriting the class. Notify dispatch is outside
the ACID boundary and starts at `PREPARED`.

An agent perceives the admission class, the lag, and the
budget. It perceives the three sealed counts only when
the class is `ADMITTED`. It does not perceive the facts
behind the sealed synopsis.

## 6. Lifecycle

### 6.1 Draft and approve

A profile is inserted as `DRAFT` with at least one
dual-control admit rule. `approve_agent_synad_profile`
checks the definition hash and sets
`app.synad_profile_approval` before the status becomes
`APPROVED`.

### 6.2 Open and nominate

A session opens under an approved profile.
`nominate_agent_synad_day` requires a non-null
`utc_day`. A null day is **FULL SCAN REJECTED**.

### 6.3 Bind and evaluate

Attestation binding records the head the admission will
cite: attestation id, lag, freshness class, and budget.
Evaluation is integer comparison of the attested lag and
the profile budget. It cannot inline a body, promote
`ACKED`, or open a nested expiry. Silence yields
`UNKNOWN_EFFECT` and a null lag.

### 6.4 Seal

Dual-control admission stewards seal the certificate.
Attestation, synopsis, and publication stewards are
excluded. The decision row `DECIDE_SYNOPSIS_ADMISSION`,
the admission grain, and the perception card commit
together. The freshness head stays unchanged.

### 6.5 Publish and notify

`publish_agent_synad_admission` appends
`SYNOPSIS_LAG_ADMISSION_DECIDED`. Notify may remain
`UNKNOWN_EFFECT`.

### 6.6 Close and retain

The session closes. Audit events stay hash-chained.
Revocation with `STOP_BEFORE_DECIDE` blocks new
nominations. In-flight sealed admissions remain
replayable.

## 7. TypeScript contracts

```ts
type AccountId = number & { readonly brand: "AccountId" };
type ProfileId = string & { readonly brand: "ProfileId" };
type SessionId = string & { readonly brand: "SessionId" };
type AdmissionId = string & { readonly brand: "AdmissionId" };
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
  | "UNKNOWN_EFFECT";

type SynopsisAdmissionBlockedReason =
  | "NULL_DAY_SCAN_DENIED"
  | "PACKET_SCAN_DENIED"
  | "CURSOR_REGRESSION_DENIED"
  | "FACT_BODY_INLINE_DENIED"
  | "ACK_AS_TRUST_DENIED"
  | "NESTED_EXPIRY_DENIED"
  | "STEWARD_REUSE_DENIED"
  | "ATTESTATION_HEAD_MISSED"
  | "ADMISSION_CLASS_FORGED";

type ProfileStatus = "DRAFT" | "APPROVED" | "REVOKED";
type SessionStatus =
  | "OPEN"
  | "NOMINATING"
  | "DECIDING"
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
type CompileKind = "DECIDE_SYNOPSIS_ADMISSION" | "PUBLISH_ADMISSION" | "NOMINATE_DAY";

interface AdmissionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly admitThreshold: number;
  readonly maxDaysPerSession: 1;
  readonly maxNominatedDays: 1;
  readonly maxLagBudget: number;
  readonly procedureRef: string;
  readonly revocationPolicy: "ALLOW_IN_FLIGHT" | "STOP_BEFORE_DECIDE" | "REQUIRE_REVIEW";
}

interface FreshnessHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly freshnessClass: FreshnessClass;
  readonly lagPublications: number | null;
  readonly synopsisWatermarkHigh: number;
  readonly newestReceiptPublicationCursor: number | null;
  readonly silenceObserved: boolean;
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
  readonly accessPath: "POINT_LOOKUP";
}

interface SynopsisAdmission {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly admissionId: AdmissionId;
  readonly admissionClass: AdmissionClass;
  readonly freshnessClass: FreshnessClass;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly synopsisWatermarkHigh: number;
  readonly sealedCount: number;
  readonly deniedCount: number;
  readonly unknownEffectCount: number;
  readonly countsVisible: boolean;
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

function decideSynopsisAdmission(
  lagPublications: number | null,
  maxLagBudget: number,
  silenceObserved: boolean,
): AdmissionClass {
  if (!Number.isInteger(maxLagBudget) || maxLagBudget < 0) {
    throw new Error("FULL SCAN REJECTED");
  }
  if (silenceObserved || lagPublications === null) {
    return "UNKNOWN_EFFECT";
  }
  if (!Number.isInteger(lagPublications) || lagPublications < 0) {
    throw new Error("CURSOR_REGRESSION_DENIED");
  }
  if (lagPublications > maxLagBudget) {
    return "DENIED";
  }
  return "ADMITTED";
}

export type {
  AccountId,
  AdmissionClass,
  AdmissionId,
  AdmissionProfile,
  CompileKind,
  FreshnessClass,
  FreshnessHead,
  SynopsisAdmission,
  SynopsisAdmissionBlockedReason,
  TrustedNextAction,
};
export { decideSynopsisAdmission };
```

```ts
interface AdmissionPerceptionCard {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly admissionClass: AdmissionClass;
  readonly freshnessClass: FreshnessClass;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
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

interface AdmissionDecisionResult {
  readonly accountId: AccountId;
  readonly decisionId: DecisionId;
  readonly compileKind: "DECIDE_SYNOPSIS_ADMISSION";
  readonly card: AdmissionPerceptionCard;
  readonly blockedReason: SynopsisAdmissionBlockedReason | null;
}

function perceiveAdmission(admission: SynopsisAdmission): AdmissionPerceptionCard {
  const admitted = admission.admissionClass === "ADMITTED";
  const trustedNextAction: TrustedNextAction =
    admission.admissionClass === "ADMITTED"
      ? "USE_SEALED_COUNTS"
      : admission.admissionClass === "DENIED"
        ? "STOP_SYNOPSIS_USE"
        : "UNKNOWN_EFFECT";
  return {
    accountId: admission.accountId,
    utcDay: admission.utcDay,
    admissionClass: admission.admissionClass,
    freshnessClass: admission.freshnessClass,
    lagPublications: admission.lagPublications,
    maxLagBudget: admission.maxLagBudget,
    sealedCount: admitted ? admission.sealedCount : null,
    deniedCount: admitted ? admission.deniedCount : null,
    unknownEffectCount: admitted ? admission.unknownEffectCount : null,
    attestedKeyKind: "AWAITING_CONFIRMATION",
    metadataTrust: "UNTRUSTED_METADATA",
    factDisposition: "DISPUTED_HELD",
    bodyVisibility: "OMITTED",
    synopsisEffectObservation: admission.synopsisEffectObservation,
    ackPromotedToTrust: false,
    inlinesFactBody: false,
    opensNestedExpiry: false,
    packetScanUsed: false,
    trustedNextAction,
  };
}

function admissionDecision(
  admission: SynopsisAdmission,
  decisionId: DecisionId,
): AdmissionDecisionResult {
  return {
    accountId: admission.accountId,
    decisionId,
    compileKind: "DECIDE_SYNOPSIS_ADMISSION",
    card: perceiveAdmission(admission),
    blockedReason: null,
  };
}

export type { AdmissionDecisionResult, AdmissionPerceptionCard };
export { admissionDecision, perceiveAdmission };
```

## 8. SQL row-store schema

```sql
CREATE TYPE synad_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE synad_session_status AS ENUM (
  'OPEN', 'NOMINATING', 'DECIDING', 'SEALED', 'DISPATCHING',
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synad_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE synad_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE synad_denial_reason AS ENUM (
  'NULL_DAY_SCAN_DENIED',
  'PACKET_SCAN_DENIED',
  'CURSOR_REGRESSION_DENIED',
  'FACT_BODY_INLINE_DENIED',
  'ACK_AS_TRUST_DENIED',
  'NESTED_EXPIRY_DENIED',
  'STEWARD_REUSE_DENIED',
  'ATTESTATION_HEAD_MISSED',
  'ADMISSION_CLASS_FORGED'
);
CREATE TYPE synad_effect_observation AS ENUM (
  'ACKED', 'FAILED', 'DISPATCHED', 'SILENCE', 'UNKNOWN_EFFECT'
);
CREATE TYPE synad_attested_key_kind AS ENUM (
  'AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED', 'TRUSTED_WITHIN_SKEW', 'UNKNOWN_EFFECT'
);
CREATE TYPE synad_fact_disposition AS ENUM (
  'DISPUTED_HELD', 'RESTORED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synad_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE synad_access_path AS ENUM (
  'POINT_LOOKUP', 'DAY_SCAN', 'PACKET_SCAN', 'WATERMARK_SCAN'
);
CREATE TYPE synad_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE synad_effect_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synad_compile_kind AS ENUM (
  'DECIDE_SYNOPSIS_ADMISSION', 'PUBLISH_ADMISSION', 'NOMINATE_DAY'
);
CREATE TYPE synad_terminal_kind AS ENUM (
  'CLOSED', 'EXPIRED', 'CANCELLED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE synad_next_action AS ENUM (
  'USE_SEALED_COUNTS', 'STOP_SYNOPSIS_USE', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_synad_profile_authority NOLOGIN;

CREATE TABLE agent_synad_authorization_evidence (
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

CREATE TABLE agent_synad_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status synad_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  admit_threshold SMALLINT NOT NULL CHECK (admit_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN ('ALLOW_IN_FLIGHT', 'STOP_BEFORE_DECIDE', 'REQUIRE_REVIEW')
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
    REFERENCES agent_synad_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_synad_profile_admit_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_classes TEXT[] NOT NULL,
  admit_threshold SMALLINT NOT NULL CHECK (admit_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  require_dual_control_admit BOOLEAN NOT NULL,
  admit_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_synad_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_synad_freshness_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  attestation_id UUID NOT NULL,
  attestation_hash CHAR(64) NOT NULL CHECK (length(attestation_hash) = 64),
  freshness_class synad_freshness_class NOT NULL,
  lag_publications BIGINT,
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT,
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  silence_observed BOOLEAN NOT NULL,
  attestation_steward_a TEXT NOT NULL,
  attestation_steward_b TEXT NOT NULL,
  synopsis_steward_a TEXT NOT NULL,
  synopsis_steward_b TEXT NOT NULL,
  publication_steward_a TEXT NOT NULL,
  publication_steward_b TEXT NOT NULL,
  effect_observation synad_effect_observation NOT NULL,
  attested_key_kind synad_attested_key_kind NOT NULL,
  fact_disposition synad_fact_disposition NOT NULL,
  body_visibility synad_body_visibility NOT NULL,
  metadata_trust synad_metadata_trust NOT NULL,
  access_path synad_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  attestation_body JSONB NOT NULL,
  attested_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, attestation_id),
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
  CHECK (NOT (attestation_body ? 'factBody')),
  CHECK (NOT (attestation_body ? 'fact_body')),
  CHECK (NOT (attestation_body ? 'resolvedFactHash')),
  CHECK (attestation_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (
    effect_observation <> 'ACKED' OR ack_promoted_to_trust = false
  ),
  CHECK (
    (freshness_class = 'CURRENT' AND silence_observed = false AND lag_publications = 0
      AND newest_receipt_publication_cursor = synopsis_watermark_high)
    OR (freshness_class = 'LAGGING' AND silence_observed = false AND lag_publications > 0
      AND newest_receipt_publication_cursor = synopsis_watermark_high + lag_publications)
    OR (freshness_class = 'UNKNOWN_EFFECT' AND silence_observed = true
      AND lag_publications IS NULL AND newest_receipt_publication_cursor IS NULL)
  )
);

CREATE TABLE agent_synad_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status synad_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units BIGINT NOT NULL CHECK (budget_nominate_units >= 0),
  budget_bind_units BIGINT NOT NULL CHECK (budget_bind_units >= 0),
  budget_decide_units BIGINT NOT NULL CHECK (budget_decide_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_publish_units BIGINT NOT NULL CHECK (budget_publish_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_nominate_units BIGINT NOT NULL CHECK (consumed_nominate_units >= 0),
  consumed_bind_units BIGINT NOT NULL CHECK (consumed_bind_units >= 0),
  consumed_decide_units BIGINT NOT NULL CHECK (consumed_decide_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_publish_units BIGINT NOT NULL CHECK (consumed_publish_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  admit_threshold SMALLINT NOT NULL CHECK (admit_threshold BETWEEN 2 AND 8),
  max_days_per_session SMALLINT NOT NULL CHECK (max_days_per_session = 1),
  max_nominated_days SMALLINT NOT NULL CHECK (max_nominated_days = 1),
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
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
    REFERENCES agent_synad_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_synad_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_nominate_units <= budget_nominate_units),
  CHECK (consumed_bind_units <= budget_bind_units),
  CHECK (consumed_decide_units <= budget_decide_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_notify_units <= budget_notify_units)
);

CREATE TABLE agent_synad_day_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  access_path synad_access_path NOT NULL,
  nomination_hash CHAR(64) NOT NULL CHECK (length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id),
  CHECK (access_path = 'POINT_LOOKUP')
);

CREATE TABLE agent_synad_attestation_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  attestation_id UUID NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  freshness_class synad_freshness_class NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, session_id, utc_day),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id)
);

CREATE TABLE agent_synad_admit_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  admission_class synad_admission_class NOT NULL,
  freshness_class synad_freshness_class NOT NULL,
  admit_hash CHAR(64) NOT NULL CHECK (length(admit_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id),
  CHECK (
    (admission_class = 'ADMITTED' AND lag_publications IS NOT NULL
      AND lag_publications <= max_lag_budget)
    OR (admission_class = 'DENIED' AND lag_publications IS NOT NULL
      AND lag_publications > max_lag_budget)
    OR (admission_class = 'UNKNOWN_EFFECT' AND lag_publications IS NULL)
  )
);

CREATE TABLE agent_synad_admission_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_ref TEXT NOT NULL,
  utc_day DATE NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  admission_class synad_admission_class NOT NULL,
  admission_steward_a TEXT NOT NULL,
  admission_steward_b TEXT NOT NULL,
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
    REFERENCES agent_synad_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_synad_admit_compile (account_id, compile_id)
);

CREATE TABLE agent_synad_admission_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  compile_kind synad_compile_kind NOT NULL,
  admission_class synad_admission_class NOT NULL,
  freshness_class synad_freshness_class NOT NULL,
  effect_observation synad_effect_observation NOT NULL,
  attested_key_kind synad_attested_key_kind NOT NULL,
  fact_disposition synad_fact_disposition NOT NULL,
  body_visibility synad_body_visibility NOT NULL,
  access_path synad_access_path NOT NULL,
  metadata_trust synad_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  admit_hash CHAR(64) NOT NULL CHECK (length(admit_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_synad_admission_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id)
);

CREATE TABLE agent_synad_synopsis_admission (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  admission_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  admission_class synad_admission_class NOT NULL,
  freshness_class synad_freshness_class NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  synopsis_watermark_high BIGINT NOT NULL CHECK (synopsis_watermark_high >= 0),
  newest_receipt_publication_cursor BIGINT,
  sealed_count BIGINT NOT NULL CHECK (sealed_count >= 0),
  denied_count BIGINT NOT NULL CHECK (denied_count >= 0),
  unknown_effect_count BIGINT NOT NULL CHECK (unknown_effect_count >= 0),
  counts_visible BOOLEAN NOT NULL,
  synopsis_effect_observation synad_effect_observation NOT NULL,
  attested_key_kind synad_attested_key_kind NOT NULL,
  fact_disposition synad_fact_disposition NOT NULL,
  body_visibility synad_body_visibility NOT NULL,
  metadata_trust synad_metadata_trust NOT NULL,
  access_path synad_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  admission_body JSONB NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  UNIQUE (account_id, admission_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_synad_admission_certificate (account_id, certificate_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (packet_scan_used = false),
  CHECK (access_path = 'POINT_LOOKUP'),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (fact_disposition = 'DISPUTED_HELD'),
  CHECK (body_visibility = 'OMITTED'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (admission_body ? 'factBody')),
  CHECK (NOT (admission_body ? 'fact_body')),
  CHECK (NOT (admission_body ? 'resolvedFactHash')),
  CHECK (admission_body->>'attestedKeyKind' IS DISTINCT FROM 'TRUSTED_ENROLLED'),
  CHECK (
    (admission_class = 'ADMITTED' AND counts_visible = true
      AND lag_publications IS NOT NULL AND lag_publications <= max_lag_budget
      AND freshness_class IN ('CURRENT', 'LAGGING'))
    OR (admission_class = 'DENIED' AND counts_visible = false
      AND lag_publications IS NOT NULL AND lag_publications > max_lag_budget
      AND freshness_class = 'LAGGING')
    OR (admission_class = 'UNKNOWN_EFFECT' AND counts_visible = false
      AND lag_publications IS NULL AND freshness_class = 'UNKNOWN_EFFECT')
  ),
  CHECK (
    synopsis_effect_observation <> 'ACKED' OR (
      attested_key_kind = 'AWAITING_CONFIRMATION' AND ack_promoted_to_trust = false
    )
  )
);

CREATE TABLE agent_synad_perception_card (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  admission_id UUID NOT NULL,
  admission_class synad_admission_class NOT NULL,
  freshness_class synad_freshness_class NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  trusted_next_action synad_next_action NOT NULL,
  attested_key_kind synad_attested_key_kind NOT NULL,
  metadata_trust synad_metadata_trust NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_synad_synopsis_admission (account_id, utc_day),
  CHECK (ack_promoted_to_trust = false),
  CHECK (inlines_fact_body = false),
  CHECK (opens_nested_expiry = false),
  CHECK (packet_scan_used = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (metadata_trust = 'UNTRUSTED_METADATA'),
  CHECK (NOT (card_body ? 'factBody')),
  CHECK (NOT (card_body ? 'fact_body')),
  CHECK (NOT (card_body ? 'resolvedFactHash')),
  CHECK (
    (admission_class = 'ADMITTED' AND trusted_next_action = 'USE_SEALED_COUNTS'
      AND sealed_count IS NOT NULL AND denied_count IS NOT NULL
      AND unknown_effect_count IS NOT NULL)
    OR (admission_class = 'DENIED' AND trusted_next_action = 'STOP_SYNOPSIS_USE'
      AND sealed_count IS NULL AND denied_count IS NULL
      AND unknown_effect_count IS NULL)
    OR (admission_class = 'UNKNOWN_EFFECT' AND trusted_next_action = 'UNKNOWN_EFFECT'
      AND sealed_count IS NULL AND denied_count IS NULL
      AND unknown_effect_count IS NULL)
  )
);

CREATE TABLE agent_synad_admission_publication (
  account_id BIGINT NOT NULL,
  record_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  admission_id UUID NOT NULL,
  reason_code TEXT NOT NULL,
  admission_class synad_admission_class NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL CHECK (max_lag_budget BETWEEN 0 AND 100000),
  freshness_class synad_freshness_class NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, record_id),
  UNIQUE (account_id, utc_day, admission_id),
  FOREIGN KEY (account_id, utc_day)
    REFERENCES agent_synad_synopsis_admission (account_id, utc_day),
  CHECK (reason_code = 'SYNOPSIS_LAG_ADMISSION_DECIDED')
);

CREATE TABLE agent_synad_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status synad_effect_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL CHECK (length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_synad_admission_certificate (account_id, certificate_id)
);

CREATE TABLE agent_synad_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units BIGINT NOT NULL CHECK (units >= 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id)
);

CREATE TABLE agent_synad_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  terminal_kind synad_terminal_kind NOT NULL,
  reason_code TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id)
);

CREATE TABLE agent_synad_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash CHAR(64) NOT NULL CHECK (length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_synad_session (account_id, session_id)
);

CREATE TABLE agent_synad_audit_head (
  account_id BIGINT NOT NULL,
  head_id UUID NOT NULL,
  chain_hash CHAR(64) NOT NULL CHECK (length(chain_hash) = 64),
  event_count BIGINT NOT NULL CHECK (event_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, head_id)
);

CREATE TABLE agent_synad_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  session_id UUID,
  prev_hash CHAR(64) NOT NULL CHECK (length(prev_hash) = 64),
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  event_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_synad_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  chain_hash CHAR(64) NOT NULL CHECK (length(chain_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_synad_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  admission_id UUID,
  cursor_high BIGINT NOT NULL CHECK (cursor_high >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id)
);

CREATE FUNCTION protect_agent_synad_profile()
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
      IF current_setting('app.synad_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.synad_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_synad_profile_protect
BEFORE INSERT OR UPDATE ON agent_synad_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_profile();

CREATE FUNCTION protect_agent_synad_admit_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status synad_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_synad_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed admit rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_synad_admit_rule_protect
BEFORE UPDATE ON agent_synad_profile_admit_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_admit_rule();

CREATE FUNCTION protect_agent_synad_freshness_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed freshness head is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.attestation_body ? 'factBody'
     OR NEW.attestation_body ? 'fact_body'
     OR NEW.attestation_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;
  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_synad_freshness_head_protect
BEFORE INSERT OR UPDATE ON agent_synad_freshness_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_freshness_head();

CREATE FUNCTION protect_agent_synad_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.admit_hash IS DISTINCT FROM NEW.admit_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'admission decision identity is immutable';
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

  IF NEW.admission_class = 'ADMITTED'
     AND (NEW.lag_publications IS NULL OR NEW.lag_publications > NEW.max_lag_budget) THEN
    RAISE EXCEPTION 'admission class forged above the lag budget';
  END IF;

  IF NEW.admission_class = 'UNKNOWN_EFFECT' AND NEW.lag_publications IS NOT NULL THEN
    RAISE EXCEPTION 'silence is not an admission';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_synad_decision_protect
BEFORE INSERT OR UPDATE ON agent_synad_admission_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_decision();

CREATE FUNCTION protect_agent_synad_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.admission_steward_a = NEW.admission_steward_b
     OR NEW.admission_steward_a IN (
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.admission_steward_b IN (
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.attestation_steward_a = NEW.attestation_steward_b
     OR NEW.synopsis_steward_a = NEW.synopsis_steward_b
     OR NEW.publication_steward_a = NEW.publication_steward_b THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;
  RETURN NEW;
END
$protect_certificate$;

CREATE TRIGGER agent_synad_certificate_protect
BEFORE INSERT OR UPDATE ON agent_synad_admission_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_certificate();

CREATE FUNCTION protect_agent_synad_effect_intent()
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

CREATE TRIGGER agent_synad_effect_intent_protect
BEFORE INSERT OR UPDATE ON agent_synad_effect_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_effect_intent();

CREATE FUNCTION protect_agent_synad_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_admission$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed synopsis admission is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.admission_body ? 'factBody'
     OR NEW.admission_body ? 'fact_body'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'admission fence';
  END IF;

  IF NEW.admission_class = 'ADMITTED'
     AND (NEW.lag_publications IS NULL OR NEW.lag_publications > NEW.max_lag_budget) THEN
    RAISE EXCEPTION 'admission class forged above the lag budget';
  END IF;

  RETURN NEW;
END
$protect_admission$;

CREATE TRIGGER agent_synad_admission_protect
BEFORE INSERT OR UPDATE ON agent_synad_synopsis_admission
FOR EACH ROW EXECUTE FUNCTION protect_agent_synad_admission();

CREATE FUNCTION approve_agent_synad_profile(
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
  stored_status synad_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_synad_profile
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
  FROM agent_synad_profile_admit_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_admit IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control admit rule';
  END IF;

  PERFORM set_config(
    'app.synad_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_synad_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_synad_profile(
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
  stored_status synad_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_synad_profile
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
    'app.synad_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_synad_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_synad_day(
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
  v_session_status synad_session_status;
  v_profile_status synad_profile_status;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF length(p_nomination_hash) <> 64 THEN
    RAISE EXCEPTION 'nomination hash must be 64 hex characters';
  END IF;

  SELECT s.status, pr.status
    INTO v_session_status, v_profile_status
  FROM agent_synad_session AS s
  JOIN agent_synad_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'nomination requires an open session on an approved profile';
  END IF;

  INSERT INTO agent_synad_day_nomination (
    account_id, nomination_id, session_id, utc_day,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION decide_agent_synad_admission(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_admission_id UUID,
  p_admit_digest TEXT,
  p_admission_steward_a TEXT,
  p_admission_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $decide$
DECLARE
  v_nominated DATE;
  v_profile_budget INTEGER;
  v_session_budget INTEGER;
  v_head agent_synad_freshness_head%ROWTYPE;
  v_lag BIGINT;
  v_class synad_admission_class;
  v_next synad_next_action;
  v_counts_visible BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_body JSONB;
  v_card JSONB;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF length(p_admit_digest) <> 64 THEN
    RAISE EXCEPTION 'admit digest must be 64 hex characters';
  END IF;

  SELECT utc_day INTO v_nominated
  FROM agent_synad_day_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated IS DISTINCT FROM p_utc_day THEN
    RAISE EXCEPTION 'decide requires a nominated utc_day point lookup';
  END IF;

  SELECT p.max_lag_budget, s.max_lag_budget
    INTO v_profile_budget, v_session_budget
  FROM agent_synad_session AS s
  JOIN agent_synad_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id
    AND p.status = 'APPROVED';

  IF v_profile_budget IS NULL THEN
    RAISE EXCEPTION 'session point lookup missed';
  END IF;

  IF v_session_budget IS DISTINCT FROM v_profile_budget THEN
    RAISE EXCEPTION 'session lag budget drifted from the approved profile';
  END IF;

  SELECT * INTO v_head
  FROM agent_synad_freshness_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'freshness head point lookup missed';
  END IF;

  IF v_head.inlines_fact_body
     OR v_head.opens_nested_expiry
     OR v_head.ack_promoted_to_trust
     OR v_head.packet_scan_used
     OR v_head.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR v_head.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR v_head.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD'
     OR v_head.body_visibility IS DISTINCT FROM 'OMITTED'
     OR v_head.attestation_body ? 'factBody'
     OR v_head.attestation_body ? 'fact_body'
     OR v_head.attestation_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'admission fence';
  END IF;

  IF p_admission_steward_a = p_admission_steward_b
     OR p_admission_steward_a IN (
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_admission_steward_b IN (
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     ) THEN
    RAISE EXCEPTION 'steward reuse';
  END IF;

  IF v_head.silence_observed OR v_head.freshness_class = 'UNKNOWN_EFFECT' THEN
    v_class := 'UNKNOWN_EFFECT';
    v_lag := NULL;
    v_counts_visible := false;
    v_next := 'UNKNOWN_EFFECT';
  ELSE
    v_lag := v_head.lag_publications;
    IF v_lag IS NULL OR v_lag < 0 THEN
      RAISE EXCEPTION 'cursor regression';
    END IF;
    IF v_lag > v_profile_budget THEN
      v_class := 'DENIED';
      v_counts_visible := false;
      v_next := 'STOP_SYNOPSIS_USE';
    ELSE
      v_class := 'ADMITTED';
      v_counts_visible := true;
      v_next := 'USE_SEALED_COUNTS';
    END IF;
  END IF;

  IF v_class = 'ADMITTED' THEN
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
  ELSE
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'lagPublications', v_lag,
    'maxLagBudget', v_profile_budget,
    'admissionClass', v_class,
    'freshnessClass', v_head.freshness_class,
    'metadataTrust', 'UNTRUSTED_METADATA',
    'attestedKeyKind', 'AWAITING_CONFIRMATION',
    'ackPromotedToTrust', false,
    'inlinesFactBody', false,
    'opensNestedExpiry', false,
    'packetScanUsed', false,
    'countsVisible', v_counts_visible
  );
  v_card := v_body;
  IF v_class = 'ADMITTED' THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_head.sealed_count,
      'deniedCount', v_head.denied_count,
      'unknownEffectCount', v_head.unknown_effect_count
    );
    v_card := v_body;
  END IF;

  INSERT INTO agent_synad_attestation_binding (
    account_id, binding_id, session_id, utc_day, attestation_id,
    lag_publications, max_lag_budget, freshness_class, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, v_head.attestation_id,
    v_lag, v_profile_budget, v_head.freshness_class,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synad_admit_compile (
    account_id, compile_id, session_id, utc_day,
    lag_publications, max_lag_budget, admission_class, freshness_class,
    admit_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day,
    v_lag, v_profile_budget, v_class, v_head.freshness_class,
    p_admit_digest, clock_timestamp()
  );

  INSERT INTO agent_synad_admission_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_ref,
    utc_day, purpose_hash, lag_publications, max_lag_budget, admission_class,
    admission_steward_a, admission_steward_b,
    attestation_steward_a, attestation_steward_b,
    synopsis_steward_a, synopsis_steward_b,
    publication_steward_a, publication_steward_b,
    sealed_revision, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_certificate_id, p_session_id, p_compile_id,
    'consumer:admission-agent', p_utc_day, p_admit_digest,
    v_lag, v_profile_budget, v_class,
    p_admission_steward_a, p_admission_steward_b,
    v_head.attestation_steward_a, v_head.attestation_steward_b,
    v_head.synopsis_steward_a, v_head.synopsis_steward_b,
    v_head.publication_steward_a, v_head.publication_steward_b,
    1, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synad_admission_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    compile_kind, admission_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path,
    metadata_trust, opens_nested_expiry, inlines_fact_body,
    ack_promoted_to_trust, packet_scan_used, lag_publications, max_lag_budget,
    admit_hash, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    'DECIDE_SYNOPSIS_ADMISSION', v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
    'OMITTED', 'POINT_LOOKUP', 'UNTRUSTED_METADATA',
    false, false, false, false,
    v_lag, v_profile_budget, p_admit_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synad_synopsis_admission (
    account_id, utc_day, admission_id, session_id, certificate_id,
    admission_class, freshness_class, lag_publications, max_lag_budget,
    synopsis_watermark_high, newest_receipt_publication_cursor,
    sealed_count, denied_count, unknown_effect_count, counts_visible,
    synopsis_effect_observation, attested_key_kind, fact_disposition,
    body_visibility, metadata_trust, access_path, inlines_fact_body,
    opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
    admission_body, decided_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_admission_id, p_session_id, p_certificate_id,
    v_class, v_head.freshness_class, v_lag, v_profile_budget,
    v_head.synopsis_watermark_high,
    CASE WHEN v_class = 'UNKNOWN_EFFECT' THEN NULL ELSE v_head.newest_receipt_publication_cursor END,
    v_head.sealed_count, v_head.denied_count, v_head.unknown_effect_count,
    v_counts_visible, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false,
    v_body, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_synad_perception_card (
    account_id, utc_day, admission_id, admission_class, freshness_class,
    lag_publications, max_lag_budget, sealed_count, denied_count,
    unknown_effect_count, trusted_next_action, attested_key_kind,
    metadata_trust, ack_promoted_to_trust, inlines_fact_body,
    opens_nested_expiry, packet_scan_used, card_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_admission_id, v_class, v_head.freshness_class,
    v_lag, v_profile_budget, v_sealed, v_denied, v_unknown, v_next,
    'AWAITING_CONFIRMATION', 'UNTRUSTED_METADATA',
    false, false, false, false,
    v_card, clock_timestamp()
  );
END
$decide$;

CREATE FUNCTION publish_agent_synad_admission(
  p_tenant_id BIGINT,
  p_utc_day DATE,
  p_admission_id UUID,
  p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish$
DECLARE
  v_grain agent_synad_synopsis_admission%ROWTYPE;
BEGIN
  IF p_utc_day IS NULL OR p_tenant_id IS NULL OR p_admission_id IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_grain
  FROM agent_synad_synopsis_admission
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day;

  IF NOT FOUND
     OR v_grain.admission_id IS DISTINCT FROM p_admission_id
     OR v_grain.inlines_fact_body
     OR v_grain.ack_promoted_to_trust
     OR v_grain.opens_nested_expiry
     OR v_grain.packet_scan_used
     OR v_grain.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION' THEN
    RAISE EXCEPTION 'admission publication requires a sealed day point lookup';
  END IF;

  INSERT INTO agent_synad_admission_publication (
    account_id, record_id, utc_day, admission_id, reason_code,
    admission_class, lag_publications, max_lag_budget, freshness_class, created_at
  ) VALUES (
    p_tenant_id, p_record_id, p_utc_day, p_admission_id,
    'SYNOPSIS_LAG_ADMISSION_DECIDED',
    v_grain.admission_class, v_grain.lag_publications, v_grain.max_lag_budget,
    v_grain.freshness_class, clock_timestamp()
  );
END
$publish$;

CREATE FUNCTION reject_agent_synad_unscoped_scan(
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

ALTER FUNCTION approve_agent_synad_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_synad_profile_authority;
ALTER FUNCTION revoke_agent_synad_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_synad_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_synad_profile_authority;
GRANT SELECT ON
  agent_synad_profile,
  agent_synad_profile_admit_rule
TO agent_synad_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_synad_profile TO agent_synad_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_synad_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_synad_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_synad_profile FROM PUBLIC;

CREATE INDEX agent_synad_session_work_idx ON agent_synad_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_synad_session_profile_idx ON agent_synad_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_synad_freshness_day_idx ON agent_synad_freshness_head (
  account_id, utc_day, lag_publications
);
CREATE INDEX agent_synad_nomination_session_idx ON agent_synad_day_nomination (
  account_id, session_id, utc_day
);
CREATE INDEX agent_synad_certificate_session_idx ON agent_synad_admission_certificate (
  account_id, session_id, utc_day
);
CREATE INDEX agent_synad_decision_cert_idx ON agent_synad_admission_decision (
  account_id, certificate_id, decision_id
);
CREATE INDEX agent_synad_admission_class_idx ON agent_synad_synopsis_admission (
  account_id, admission_class, utc_day
);
CREATE INDEX agent_synad_admission_id_idx ON agent_synad_synopsis_admission (
  account_id, admission_id
);
CREATE INDEX agent_synad_publication_day_idx ON agent_synad_admission_publication (
  account_id, utc_day, record_id
);
CREATE INDEX agent_synad_effect_work_idx ON agent_synad_effect_intent (
  account_id, intent_status, updated_at, effect_id
);
CREATE INDEX agent_synad_audit_time_idx ON agent_synad_audit_event (
  account_id, created_at DESC, event_id
);
CREATE INDEX agent_synad_command_expiry_idx ON agent_synad_command_result (
  account_id, expires_at, command_id
);
CREATE INDEX agent_synad_checkpoint_day_idx ON agent_synad_projection_checkpoint (
  account_id, utc_day, created_at DESC, checkpoint_id
);
CREATE INDEX agent_synad_perception_day_idx ON agent_synad_perception_card (
  account_id, utc_day, admission_class
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_synad_authorization_evidence',
    'agent_synad_profile',
    'agent_synad_profile_admit_rule',
    'agent_synad_freshness_head',
    'agent_synad_session',
    'agent_synad_day_nomination',
    'agent_synad_attestation_binding',
    'agent_synad_admit_compile',
    'agent_synad_admission_certificate',
    'agent_synad_admission_decision',
    'agent_synad_synopsis_admission',
    'agent_synad_perception_card',
    'agent_synad_admission_publication',
    'agent_synad_effect_intent',
    'agent_synad_budget_ledger',
    'agent_synad_terminal_record',
    'agent_synad_command_result',
    'agent_synad_audit_head',
    'agent_synad_audit_event',
    'agent_synad_audit_anchor',
    'agent_synad_projection_checkpoint'
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

Day nomination, attestation binding, lag comparison, and
the admission commit or roll back together when they run
in one command transaction. The reference decide writes
the binding, compile, certificate, decision, admission,
and perception card in one function body. Publication is
its own append. Notify dispatch is not part of the
database transaction. `state_revision` is the
compare-and-swap token for session commands.

### 8.2 Tenant isolation

`account_id` is the first column of every table and every
index. `FORCE ROW LEVEL SECURITY` applies
`tenant_isolation` using `app.account_id`. Cross-tenant
reads and writes fail closed. There is no global freshness
head and no context-packet catalog in this plane.

## 9. Open API GraphQL contract

```graphql
scalar DateTime
scalar Date
scalar Long
scalar JSON
scalar SHA256

enum AgentSynadSessionStatus {
  OPEN
  NOMINATING
  DECIDING
  SEALED
  DISPATCHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentSynadAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AgentSynadFreshnessClass {
  CURRENT
  LAGGING
  UNKNOWN_EFFECT
}

enum AgentSynadKeyKind {
  AWAITING_CONFIRMATION
  UNKNOWN_EFFECT
}

enum AgentSynadNextAction {
  USE_SEALED_COUNTS
  STOP_SYNOPSIS_USE
  UNKNOWN_EFFECT
}

type AgentSynadProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  maxLagBudget: Int!
  procedureRef: String
}

type AgentSynadSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  status: AgentSynadSessionStatus!
  purpose: String!
  maxLagBudget: Int!
  deadlineAt: DateTime!
}

type AgentSynadFreshnessHead {
  accountId: ID!
  utcDay: Date!
  attestationId: ID!
  freshnessClass: AgentSynadFreshnessClass!
  lagPublications: Long
  synopsisWatermarkHigh: Long!
  silenceObserved: Boolean!
}

type AgentSynadAdmission {
  accountId: ID!
  utcDay: Date!
  admissionId: ID!
  admissionClass: AgentSynadAdmissionClass!
  freshnessClass: AgentSynadFreshnessClass!
  lagPublications: Long
  maxLagBudget: Int!
  synopsisEffectObservation: String!
  attestedKeyKind: AgentSynadKeyKind!
  metadataTrust: String!
  factDisposition: String!
  bodyVisibility: String!
  ackPromotedToTrust: Boolean!
  inlinesFactBody: Boolean!
  countsVisible: Boolean!
}

type AgentSynadPerceptionCard {
  accountId: ID!
  utcDay: Date!
  admissionClass: AgentSynadAdmissionClass!
  lagPublications: Long
  maxLagBudget: Int!
  sealedCount: Long
  deniedCount: Long
  unknownEffectCount: Long
  trustedNextAction: AgentSynadNextAction!
  attestedKeyKind: AgentSynadKeyKind!
}

type AgentSynadAuditEvent {
  accountId: ID!
  eventId: ID!
  eventKind: String!
  eventHash: SHA256!
  createdAt: DateTime!
}

type AgentSynadProfileMatch {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  score: Float!
}

type AgentSynadDayNomination {
  accountId: ID!
  nominationId: ID!
  utcDay: Date!
  accessPath: String!
}

type AgentSynadAttestationBinding {
  accountId: ID!
  bindingId: ID!
  utcDay: Date!
  lagPublications: Long
  maxLagBudget: Int!
}

type AgentSynadDecisionResult {
  accountId: ID!
  decisionId: ID!
  admissionClass: AgentSynadAdmissionClass!
  lagPublications: Long
  maxLagBudget: Int!
  blockedReason: String
}

type AgentSynadAdmissionPublication {
  accountId: ID!
  recordId: ID!
  utcDay: Date!
  reasonCode: String!
  admissionClass: AgentSynadAdmissionClass!
  lagPublications: Long
}

type AgentSynadEffectIntent {
  accountId: ID!
  effectId: ID!
  intentStatus: String!
}

input CreateAgentSynadProfileInput {
  accountId: ID!
  profileId: ID!
  name: String!
  definitionHash: SHA256!
  maxLagBudget: Int!
  procedureRef: String!
}

input ApproveAgentSynadProfileInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  definitionHash: SHA256!
}

input RevokeAgentSynadProfileInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  definitionHash: SHA256!
}

input OpenAgentSynadSessionInput {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
}

input NominateAgentSynadDayInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  nominationId: ID!
  nominationHash: SHA256!
}

input BindAgentSynadAttestationInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  bindingId: ID!
}

input DecideAgentSynadAdmissionInput {
  accountId: ID!
  sessionId: ID!
  utcDay: Date!
  admissionId: ID!
  admitDigest: SHA256!
  admissionStewardA: String!
  admissionStewardB: String!
}

input PublishAgentSynadAdmissionInput {
  accountId: ID!
  utcDay: Date!
  admissionId: ID!
  recordId: ID!
}

input RecordAgentSynadEffectInput {
  accountId: ID!
  effectId: ID!
  sessionId: ID!
  certificateId: ID!
  providerIdempotencyKey: String!
  canonicalRequestHash: SHA256!
}

input CloseAgentSynadSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
}

type Query {
  agentSynadProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AgentSynadProfile
  agentSynadSession(accountId: ID!, sessionId: ID!): AgentSynadSession
  agentSynadAdmission(accountId: ID!, utcDay: Date!): AgentSynadAdmission
  agentSynadFreshnessHead(accountId: ID!, utcDay: Date!): AgentSynadFreshnessHead
  agentSynadAuditEvents(accountId: ID!, admissionId: ID!): [AgentSynadAuditEvent!]!
  searchAgentSynadProfiles(accountId: ID!, semanticQuery: String!, topK: Int!): [AgentSynadProfileMatch!]!
}

type Mutation {
  createAgentSynadProfile(input: CreateAgentSynadProfileInput!): AgentSynadProfile!
  approveAgentSynadProfile(input: ApproveAgentSynadProfileInput!): AgentSynadProfile!
  revokeAgentSynadProfile(input: RevokeAgentSynadProfileInput!): AgentSynadProfile!
  openAgentSynadSession(input: OpenAgentSynadSessionInput!): AgentSynadSession!
  nominateAgentSynadDay(input: NominateAgentSynadDayInput!): AgentSynadDayNomination!
  bindAgentSynadAttestation(input: BindAgentSynadAttestationInput!): AgentSynadAttestationBinding!
  decideAgentSynadAdmission(input: DecideAgentSynadAdmissionInput!): AgentSynadDecisionResult!
  publishAgentSynadAdmission(input: PublishAgentSynadAdmissionInput!): AgentSynadAdmissionPublication!
  recordAgentSynadEffect(input: RecordAgentSynadEffectInput!): AgentSynadEffectIntent!
  closeAgentSynadSession(input: CloseAgentSynadSessionInput!): AgentSynadSession!
}
```

### GraphQL limits

Every field above is scoped by `accountId`. `utcDay` is
required on admission and freshness reads. A missing day
is **FULL SCAN REJECTED** at the resolver before planning.
`searchAgentSynadProfiles` returns profile ids only. A
match does not nominate a day and does not publish an
admission. `topK` is capped by the session vector budget.
`AgentSynadPerceptionCard.sealedCount` is null unless
`admissionClass` is `ADMITTED`.

## 10. Procedural memory

The approved profile is the instruction an agent can
read without guessing:

- nominate one `utc_day`;
- point-look up the freshness attestation;
- compare `lag_publications` with `max_lag_budget`;
- seal `ADMITTED`, `DENIED`, or `UNKNOWN_EFFECT`;
- show sealed counts only when `ADMITTED`;
- leave `ACKED` as an effect observation;
- leave the key at `AWAITING_CONFIRMATION`;
- leave the fact body omitted;
- leave nested expiry closed;
- leave the freshness head unchanged.

`admit_instruction` on the rule row is that procedure in
canonical JSON. The database evaluates the procedure. The
agent does not.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash.
Queries must filter `account_id` before topK. A global ANN
index would mix tenants and is rejected.

```sql
CREATE TABLE agent_synad_profile_embedding (
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
    REFERENCES agent_synad_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_synad_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_synad_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_synad_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

```sql
-- Production guidance: build an HNSW index with vector_cosine_ops
-- only inside an account-partitioned table or segment. Never build one
-- global ANN index across tenants. Reference validation intentionally
-- omits that DDL. ANN queries must include account_id equality before topK.
-- Unscoped attestation or board walks are FULL SCAN REJECTED.
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one `utc_day`, and decides that day's
attestation under dual control. Similarity never publishes
an admission and never restores a fact.

## 12. Agent perception

Agents receive one admission card per `(account_id, utc_day)`.
The card exposes `admissionClass`, `lagPublications`,
`maxLagBudget`, and `freshnessClass`. It repeats
`attestedKeyKind = AWAITING_CONFIRMATION`,
`metadataTrust = UNTRUSTED_METADATA`,
`factDisposition = DISPUTED_HELD`, and
`bodyVisibility = OMITTED`. `ACKED` appears only as
`synopsisEffectObservation`.

`trustedNextAction` is `USE_SEALED_COUNTS` when the class
is `ADMITTED`, `STOP_SYNOPSIS_USE` when the class is
`DENIED`, and `UNKNOWN_EFFECT` when the lag is unknown.
`sealedCount`, `deniedCount`, and `unknownEffectCount`
are populated only for `USE_SEALED_COUNTS`. The card has
no fact body and no `TRUSTED_ENROLLED` bit.

A retrieval agent can rank profiles by the embedding.
It cannot treat a similar profile as permission to inline
a held fact or to ignore `max_lag_budget`.

## 13. ACID and consistency

### Row store

Profile approval, nomination, admission, and publication
are transactional. The freshness head is read with
primary-key equality inside the decide transaction. A
forged `ADMITTED` above the budget fails the transaction.
The freshness head is not updated, so the attested lag
stays the lag the freshness plane sealed.

### Columnar store

The admission grain is one row per `(account_id, utc_day)`.
It is written in the same transaction as the decision.
Readers never assemble the decision by scanning receipts
or context packets.

### Vector store

Embeddings are updated when a profile version is approved.
They are not updated when a lag changes. A stale embedding
can still point at the right profile; it cannot change
the budget comparison.

### External tools

Notify providers sit outside the database transaction.
Their silence is `UNKNOWN_EFFECT`. An ack of the notify
does not change `attested_key_kind`, does not set
`ack_promoted_to_trust`, and does not flip `DENIED` to
`ADMITTED`.

## 14. Guardrails and neighbor protection

- One session, one UTC day, one admission.
- `max_lag_budget` is a comparison against one attested
  integer. It is not a license to scan a large receipt
  log and stuff a new total into the decision.
- `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN` fail
  closed.
- Admission stewards cannot reuse attestation, synopsis,
  or publication stewards, so the authors of the lag
  cannot certify that their own lag is inside budget.
- Effect intents start at `PREPARED`. A prepared request
  hash is immutable, so a retry cannot retarget the
  admission.
- Budgets cap nominate, bind, decide, vector, publish,
  and notify units, plus wall time. A recursive agent
  that keeps re-deciding the same day hits the session
  cap of one nomination.
- Perception cards for `DENIED` and `UNKNOWN_EFFECT` omit
  the sealed counts, so a rejected synopsis cannot be
  used by reading the card.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Recomputing `lag_publications` by `max(publication_watermark)`
  across a day with millions of receipts is a range read
  this plane does not do. The freshness head is one row.
- Joining admissions to context packets, perception
  histories, or board items to "explain" a denial is a
  1M+ row walk and is **FULL SCAN REJECTED**.
- A null `utc_day` in `nominate_agent_synad_day`,
  `decide_agent_synad_admission`, or
  `publish_agent_synad_admission` would plan a day scan.
  Those functions reject it before the read.
- Building one global HNSW index over profile embeddings
  would read every tenant. The reference schema does not
  create that index.

### Required access paths

- Freshness head: primary key `(account_id, utc_day)`.
- Synopsis admission: primary key `(account_id, utc_day)`.
- Perception card: primary key `(account_id, utc_day)`.
- Publication: unique `(account_id, utc_day, admission_id)`.
- Session idempotency: unique `(account_id, idempotency_key)`.

### Planner enforcement

`reject_agent_synad_unscoped_scan` is the explicit guard
the SQL tests call. Resolvers call it when `account_id`
or `utc_day` is missing. The decide function itself reads
only equality predicates on those two columns.

## 16. Auditability and replay

`agent_synad_audit_event` stores `prev_hash` and
`event_hash`. `agent_synad_audit_head` stores the chain
tip. `agent_synad_audit_anchor` freezes a tip for an
external timestamp. Replay reads the admission row and
recompares `lag_publications` with `max_lag_budget`.
Replay does not call an embedding model and does not read
a fact body. The audit row keeps the three counts even
when the perception card hides them, so a steward can
explain a denial without handing the counts back to the
agent.

A publication record with reason
`SYNOPSIS_LAG_ADMISSION_DECIDED` is the deterministic
trace that the class was published. The trace cites the
lag and the budget. It does not cite a fact hash.

## 17. Threat and failure analysis

- An attestation steward who also seals the admission can
  hide a stale synopsis inside the budget. The certificate
  trigger rejects that steward reuse.
- A payload that smuggles `factBody` onto the freshness
  head would turn admission into disclosure. The head
  trigger rejects those keys.
- Writing `TRUSTED_ENROLLED` because the synopsis effect
  was `ACKED` would launder an effect observation into
  enrollment. The decision trigger rejects that key.
- Setting `opens_nested_expiry` would start another
  expiry cycle from a budget comparison. The decision
  trigger rejects it.
- `PACKET_SCAN` would walk neighbor rows to recompute a
  lag. The decision trigger rejects it.
- Inserting `ADMITTED` when `lag_publications` is above
  `max_lag_budget` would bypass the comparison. The
  decision trigger and the admission trigger reject it.
- Inserting a profile as `APPROVED` skips the dual-control
  rule check. The profile trigger rejects it.
- Provider silence that is stored as `ACKED` would look
  like a successful notify. Effect intents cannot be
  inserted as anything other than `PREPARED`.
- Updating the freshness head after a denial would shrink
  the lag and invite a second, looser admission. The head
  trigger rejects every update.

## 18. Observability and SLOs

- Availability target for the point-lookup path: 99.99%.
- Decide reads one primary key and writes six rows. It
  does not scale with the number of receipts in the day.
- Publish is one primary-key read and one insert.
- Alert when `admission_class = DENIED`. That alert is
  the budget decision. It is not a cue to scan packets.
- Alert when new admissions are `UNKNOWN_EFFECT` because
  freshness heads are silent.
- Alert when `reject_agent_synad_unscoped_scan` fires.
  A spike means an agent is requesting an unbounded day.

## 19. Rollout

### Phase 1: shadow decisions

Write admissions for one internal account. Do not publish
them to the Open API. Compare the class with an offline
sample of attested lags and the profile budget.

### Phase 2: deny-only

Enable the fences: fact body, `TRUSTED_ENROLLED`, nested
expiry, packet scan, null day, steward reuse, and forged
`ADMITTED`. No consumer notification.

### Phase 3: one day

Allow one nominated UTC day per session for a single
design partner. `max_lag_budget` stays at the profile cap.
Perception cards omit counts unless the class is
`ADMITTED`.

### Phase 4: publish and notify uncertainty

Publish `SYNOPSIS_LAG_ADMISSION_DECIDED`. Notify stays
`UNKNOWN_EFFECT` until the provider acks. The ack does
not enroll a key and does not change the class.

### Phase 5: broad availability

Open the six queries and ten mutations on the monday.com
Open API. Keep HNSW account-partitioned. Keep count
perception for denied days out of the agent card.

## 20. Ship criteria

### Contract validation

`npm run validate` typechecks the TypeScript contracts,
builds the GraphQL schema (6 queries, 10 mutations), and
executes the DDL on PGlite with pgvector.

### Behavioral validation

A fixture day whose freshness head records
`lag_publications = 3`, `freshness_class = LAGGING`,
watermark 12, and receipt cursor 15 is admitted when
`max_lag_budget = 5`. The synopsis effect `ACKED` is
copied. The key stays `AWAITING_CONFIRMATION`. The
perception card shows counts 1/1/1 and
`USE_SEALED_COUNTS`. The freshness head lag stays 3.
Publication reason is `SYNOPSIS_LAG_ADMISSION_DECIDED`.

A second day with lag 8 against the same budget is
`DENIED`. Its perception card uses `STOP_SYNOPSIS_USE`
and omits the counts. A silent day stays
`UNKNOWN_EFFECT` with a null lag and
`UNKNOWN_EFFECT` as the next action.

The same fixture rejects a null day, an unscoped scan,
a duplicate idempotency key, a sealed-rule edit, an
inserted-as-approved profile, a decision-hash edit, a
direct revocation, a non-prepared effect, a prepared
effect hash edit, a sealed definition edit, an
ack-as-trust decision, a fact-body head payload, a
nested-expiry decision, a packet-scan decision, a
certificate that reuses a publication steward, a forged
`ADMITTED` above budget, and an update of the freshness
head.

### Scale and failure validation

Explain plans for the decide path show primary-key
equality on `(account_id, utc_day)` for the freshness
head. A day with 1M receipts still reads one head.
A null day fails before planning.

## 21. Product decision

Ship the lag admission as a point lookup of one freshness
attestation. Compare `lag_publications` with the profile
`max_lag_budget`. Admit inclusive of the budget. Deny
above it. Keep silence as `UNKNOWN_EFFECT`. Keep `ACKED`
as an effect observation. Keep the key at
`AWAITING_CONFIRMATION`. Keep the body omitted. Keep the
freshness head immutable. Show sealed counts on the
perception card only when the class is `ADMITTED`. Reject
scans, fact bodies, trust promotion, and nested expiry.

The next increment should publish a count-perception card
for one already `ADMITTED` day by point lookup of
`(account_id, utc_day)` on this admission. `DENIED` and
`UNKNOWN_EFFECT` stay without counts. That card must not
scan context packets, must not inline a fact body, must
not promote `ACKED` to `TRUSTED_ENROLLED`, and must not
open another nested expiry plane.
