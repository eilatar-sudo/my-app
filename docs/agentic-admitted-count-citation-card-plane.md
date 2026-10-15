# mondayDB Agentic Admitted Count Citation Card Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-15.v1`

## 1. Why this plane, before how

The 2026-10-14 Admitted Count Provider Receipt Plane seals one
provider receipt for one already sealed tool effect. The grain is
`(account_id, utc_day, consumer_principal_id)`. A `RECEIVED` receipt
copies the three granted counts and names `CITE_PROVIDER_RECEIPT`.
A `NOT_RECEIVED` receipt seals `NOT_RECORDED_EFFECT_CANNOT_RECEIVE`
with null counts. That plane does not publish a citation card.

Without this plane an agent either:

- treats `CITE_PROVIDER_RECEIPT` itself as the published card, or
- walks context packets, tool logs, or a board with 1M+ rows to
  invent a citation (neighbor-harmful, and a miss against the
  99.99% availability target).

The product trade-off is **citation honesty versus receipt
isolation**, and **citation latency versus receipt fan-out**:

- Honesty: a consumer whose receipt is `RECEIVED` should be able to
  publish exactly one citation card that cites the three counts
  already on the receipt, without opening the receipt again.
- Isolation: the database does not call the provider and does not
  execute the tool. Publishing is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or
  recursive tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_RECEIVED` receipt cannot publish a
  successful citation. One receipt publishes at most one card. A
  second card is a new request, and this plane rejects it.
- The received receipt head is not rewritten. Replay of the receipt
  stays stable. The card is a new row that cites the receipt by
  primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does
  not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the card is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain. Consistency is the sealed card plus the
receipt id it cites. Neighbor availability stays at the 99.99%
target because an unscoped day walk, a citation list, or a packet
walk is **FULL SCAN REJECTED** before it touches a board.

The recommended model keeps the data plane deterministic:

1. An approved citation profile is procedural memory for "how one
   already sealed provider receipt becomes a single citation card."
   The profile names exactly one citation code and the one provider
   code that card may cite. A profile never inlines a fact body,
   never rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one receipt key. The publish then
   reads `agent_accc_received_receipt_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB publishes a successful card only when the head is
   `RECEIVED`, `provider_receipt_recorded` is true, the receipt
   reason is `RECORDED_EFFECT_PROVIDER_RECEIVED`, the next action is
   `CITE_PROVIDER_RECEIPT`, and the requested citation code equals
   the profile citation code. The copy of the three counts is
   equality with the receipt. It does not call a model and it does
   not execute the tool.
4. `NOT_RECEIVED` seals `NOT_RECEIVED_RECEIPT_CANNOT_CITE` with
   `citation_published = false` and null counts. Silence keeps a
   null lag. There is no successful citation.
5. Two citation stewards witness the card. They are distinct from
   the consumer, from the provider stewards, and from the effect,
   bind, receipt, card, admission, attestation, synopsis, and
   publication stewards.
6. Unscoped receipt or board scans are **FULL SCAN REJECTED** before
   planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session published the nomination
  and the citation card?
- Was the card a point lookup of an already sealed receipt, and
  what class did that receipt have?
- Did a `RECEIVED` receipt publish exactly one card and seal
  `RECEIVED_RECEIPT_CITATION_PUBLISHED` with the three granted
  counts?
- Did a `NOT_RECEIVED` receipt stay unsuccessful, with null counts
  and `NOT_RECEIVED_RECEIPT_CANNOT_CITE`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the received receipt head keep the class and counts it was
  exported with?
- Can the card be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never publishes
this card.

## 2. Scope and ownership

The Admitted Count Citation Card Plane owns:

1. Immutable approved citation profiles as procedural memory, each
   naming one citation code for one provider receipt.
2. Tenant-scoped citation sessions with a hard cap of one
   nominated receipt.
3. Deterministic nomination of that receipt, then one point lookup
   of the received receipt head.
4. A citation card keyed by
   `(account_id, utc_day, consumer_principal_id)`.
5. An agent perception row that carries counts only when
   `citation_published` is true.
6. Audit events that cite the card hash.

It integrates with, but does not replace:

- **Admitted Count Provider Receipt Plane:** supplies the sealed
  receipt this plane reads. Exporters copy the receipt class, the
  receipt reason, the counts the receipt actually recorded, the
  next action, and the stewards onto
  `agent_accc_received_receipt_head`. This plane does not
  re-record the receipt, does not recover withheld counts, and
  does not promote `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, publish, vector,
  and notify units. A refused receipt is a sealed non-citation,
  not a scan of the packet log. The publish does not run the tool
  and does not call the provider.

### Non-goals

- Letting an LLM choose which citation a receipt may publish.
- Executing the tool, calling the provider, or compiling a board
  query inside `publish_agent_accc_citation_card`.
- Publishing any citation code other than the single code on the
  approved profile.
- Copying counts onto a card whose receipt is `NOT_RECEIVED`.
- Rewriting the received receipt head so a refused receipt becomes
  a successful citation.
- Recomputing citations by scanning a board, a packet log, or a
  citation ledger.
- Cross-account cards or global nearest-neighbor publishing.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the card.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because
  the effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this card.
- Granting the published card to a second reader principal. That
  is the next plane, and only for an already `PUBLISHED` card.

## 3. Product contract

### 3.1 Citation profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the receipt must already carry
  (one token, no list);
- the single `allowed_effect_code` the head must already carry
  (one token, no list);
- the single `allowed_provider_code` the head must already carry
  (one token, no list);
- the single `allowed_citation_code` this plane may publish (one
  token, no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- citation threshold (distinct citation stewards, minimum 2), max
  receipts per session (exactly 1), and max nominated receipts
  (exactly 1);
- citation policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `CARD_NEVER_EXECUTES_TOOL`, `CARD_NEVER_INLINES_BODY`,
  `CARD_NEVER_CONFIRMS`, `ONE_RECEIPT_PER_SESSION`,
  `ONE_CARD_PER_RECEIPT`, `POINT_LOOKUP_ONLY`,
  `RECEIVED_RECEIPT_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `CARD_ONLY_WHEN_RECEIVED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_PUBLISH`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest citation reason
is `RECEIVED_RECEIPT_CITATION_PUBLISHED` (36 bytes). The refusal
reason is `NOT_RECEIVED_RECEIPT_CANNOT_CITE` (33 bytes).

Approval and revocation require the authority fence
`approve_agent_accc_profile` / `revoke_agent_accc_profile`, owned
by `agent_accc_profile_authority`. A profile cannot be inserted
as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, publish,
vector, and notify units, plus wall time.
`max_receipts_per_session` and `max_nominated_receipts` are both
exactly 1. A second receipt nomination in the same session is
rejected before it can fan out into a recursive citation walk.

The session principal is the only consumer that session may cite.
A card for a different principal is rejected.

### 3.3 Received receipt head and nomination contract

Upstream receipt export writes one received receipt head per
`(account_id, utc_day, consumer_principal_id)`. The head copy
includes `receipt_class`, `receipt_reason`,
`provider_receipt_recorded`, `trusted_next_action`, the three
counts when they were recorded, and the stewards. It does not
include a fact body and it does not include withheld counts. The
head is immutable. This plane does not advance it and does not
reclassify it.

`nominate_agent_accc_receipt(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates
that receipt. A null `utc_day`, a null `account_id`, a null
consumer, or a null citation code is **FULL SCAN REJECTED**. The
access path is `POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and
`WATERMARK_SCAN` are rejected.

### 3.4 Citation card contract

`publish_agent_accc_citation_card` is the only compile that writes
a citation card. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one received receipt head for that key, with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `citation_code` equal to the profile's `allowed_citation_code`,
  and `provider_code` equal to the head provider and the profile
  provider, each matching `^[a-z0-9:_-]{1,64}$` (one token, not a
  list and not a query);
- a consumer principal equal to the session principal, distinct
  from both citation stewards, and distinct from every provider,
  effect, bind, receipt, card, admission, attestation, synopsis,
  and publication steward;
- citation stewards distinct from each other and from those same
  upstream stewards.

The grain is `(account_id, utc_day, consumer_principal_id)`. That
grain holds one card. Projection is:

- `PUBLISHED` when the head receipt class is `RECEIVED`,
  `provider_receipt_recorded` is true, the receipt reason is
  `RECORDED_EFFECT_PROVIDER_RECEIVED`, and the next action is
  `CITE_PROVIDER_RECEIPT`. The card copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`.
  `citation_published` is true. `citation_reason` is
  `RECEIVED_RECEIPT_CITATION_PUBLISHED`. `trusted_next_action` is
  `HOLD_CITATION_CARD`. The action holds the card. It does not run
  the tool, it does not inline a fact body, and it does not open
  another nested expiry.
- `NOT_PUBLISHED` when the head next action is
  `STOP_PROVIDER_RECEIPT`. Counts stay null. `citation_reason` is
  `NOT_RECEIVED_RECEIPT_CANNOT_CITE`. `citation_published` is
  false. `trusted_next_action` is `STOP_CITATION_CARD`. The denied
  lag is copied and is not cleared.
- `NOT_PUBLISHED` when the head admission class is `UNKNOWN_EFFECT`
  or the next action is `OMIT_PROVIDER_RECEIPT`. Counts stay null.
  The card lag stays null. `citation_reason` is
  `NOT_RECEIVED_RECEIPT_CANNOT_CITE`. `citation_published` is
  false. `trusted_next_action` is `OMIT_CITATION_CARD`.

A `NOT_RECEIVED` receipt cannot publish a successful citation.
`citation_body` rejects `factBody`, `fact_body`, and
`resolvedFactHash`. `ACKED` is copied as `effect_observation` when
the head observed it. It does not write `TRUSTED_ENROLLED`. The
received receipt head is not updated. A second card for the same
consumer and day is rejected. A forged published card whose counts
differ from the head is rejected. A forged published card on a
`NOT_RECEIVED` head is rejected. A forged non-citation that carries
any count, or that sets `citation_published`, is rejected. A
citation code other than the profile code is rejected before a row
is sealed, so the caller can retry the one allowed code. A null
citation code is **FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_accc_citation_perception` for
the agent. Counts appear there only when `citation_published` is
true. The perception names `citation_code` and whether the card
was published. Citation intents start as `PREPARED`. Provider
silence stays `UNKNOWN_EFFECT`. An acknowledgement of the notify
is not enrollment, not a fact restore, not a tool execution, and
not a second card. This plane does not open another nested expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads
   with `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null citation code, or a
   null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one receipt. The access path is
   `POINT_LOOKUP`. One receipt publishes one card.
4. The received receipt head is immutable. The card does not
   rewrite it.
5. A successful citation card is published only from a `RECEIVED`
   head whose receipt reason is
   `RECORDED_EFFECT_PROVIDER_RECEIVED` and whose next action is
   `CITE_PROVIDER_RECEIPT`, and only for the profile's single
   citation code.
6. `NOT_RECEIVED` cards store null counts and
   `citation_published = false`. Silence stores a null lag. A
   `NOT_RECEIVED` receipt cannot publish a successful citation.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`,
   and `executes_tool` stay false. The card does not execute the
   tool.
9. Citation stewards, the consumer, provider stewards, and
   upstream stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never publishes a
    card.
11. The engine does not call a model. Replay is a pure function of
    the received receipt head, the consumer id, and the profile
    citation code.

## 5. Execution model

```text
approved profile (one allowed_citation_code)
  -> open session (one receipt budget)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read received receipt head by primary key
  -> project PUBLISHED or NOT_PUBLISHED
  -> append card + perception + audit
  -> leave the receipt head unchanged
  -> do not execute the tool
```

Compile kind is `PUBLISH_RECEIVED_RECEIPT_CITATION` for both cards.
The class on the card, not a second plane, distinguishes a
published citation from a refusal. Notify dispatch is a later
citation intent and may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one
   provider code, and one citation code, and add one dual-control
   citation rule.
2. Approve it through `agent_accc_profile_authority`.
3. Export one received receipt head per consumer and day. The
   export is a point copy of the provider receipt, not a packet
   walk.
4. Open a session and nominate one receipt key.
5. Publish the profile citation code. Received receipts copy the
   counts and seal `RECEIVED_RECEIPT_CITATION_PUBLISHED`. Other
   receipts seal a non-citation with null counts.
6. The agent reads the perception row. A withheld perception has
   no count fields and `citationPublished: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite cards already sealed.
8. This plane does not open another nested expiry. It does not run
   the tool.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type CitationCardId = string;
export type UtcDay = string;
export type CitationCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type ReceiptClass = "RECEIVED" | "NOT_RECEIVED";
export type ReceiptReason =
  | "RECORDED_EFFECT_PROVIDER_RECEIVED"
  | "NOT_RECORDED_EFFECT_CANNOT_RECEIVE";
export type ReceiptNextAction =
  | "CITE_PROVIDER_RECEIPT"
  | "STOP_PROVIDER_RECEIPT"
  | "OMIT_PROVIDER_RECEIPT";
export type CitationClass = "PUBLISHED" | "NOT_PUBLISHED";
export type CitationReason =
  | "RECEIVED_RECEIPT_CITATION_PUBLISHED"
  | "NOT_RECEIVED_RECEIPT_CANNOT_CITE";
export type CitationNextAction =
  | "HOLD_CITATION_CARD"
  | "STOP_CITATION_CARD"
  | "OMIT_CITATION_CARD";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const CITATION_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface ReceivedReceiptHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly receiptReason: ReceiptReason;
  readonly providerReceiptRecorded: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: ReceiptNextAction;
}

export interface CitationCard {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly citationCardId: CitationCardId;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: CitationCode;
  readonly admissionClass: AdmissionClass;
  readonly receiptClass: ReceiptClass;
  readonly citationClass: CitationClass;
  readonly citationReason: CitationReason;
  readonly citationPublished: boolean;
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
  readonly trustedNextAction: CitationNextAction;
}

export function projectCitationCard(
  head: ReceivedReceiptHead,
  citationCardId: CitationCardId,
  citationCode: CitationCode,
): CitationCard {
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    citationCardId,
    consumerPrincipalId: head.consumerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode,
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
  const singleCitation = CITATION_TOKEN.test(citationCode);

  if (
    singleCitation &&
    head.receiptClass === "RECEIVED" &&
    head.receiptReason === "RECORDED_EFFECT_PROVIDER_RECEIVED" &&
    head.providerReceiptRecorded &&
    head.trustedNextAction === "CITE_PROVIDER_RECEIPT" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      citationClass: "PUBLISHED",
      citationReason: "RECEIVED_RECEIPT_CITATION_PUBLISHED",
      citationPublished: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "HOLD_CITATION_CARD",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_PROVIDER_RECEIPT";

  return {
    ...shared,
    citationClass: "NOT_PUBLISHED",
    citationReason: "NOT_RECEIVED_RECEIPT_CANNOT_CITE",
    citationPublished: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_CITATION_CARD" : "STOP_CITATION_CARD",
  };
}
```

```ts
export function perceptionOmitsSuccessfulCitation(card: CitationCard): boolean {
  return (
    card.citationPublished === false &&
    card.citationClass === "NOT_PUBLISHED" &&
    card.sealedCount === null &&
    card.deniedCount === null &&
    card.unknownEffectCount === null &&
    card.ackPromotedToTrust === false &&
    card.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    card.executesTool === false
  );
}
```

`projectCitationCard` is the procedural projection an agent runtime
must match. It never returns `TRUSTED_ENROLLED`. It never copies
counts off a `NOT_RECEIVED` receipt. It never executes the tool. A
citation token that is not a single code projects to
`NOT_PUBLISHED`. The database additionally requires the token to
equal the approved profile citation code before it seals
`PUBLISHED`.

## 8. SQL row-store schema

```sql
CREATE TYPE accc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE accc_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE accc_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE accc_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE accc_receipt_class AS ENUM ('RECEIVED', 'NOT_RECEIVED');
CREATE TYPE accc_receipt_reason AS ENUM (
  'RECORDED_EFFECT_PROVIDER_RECEIVED',
  'NOT_RECORDED_EFFECT_CANNOT_RECEIVE'
);
CREATE TYPE accc_receipt_next AS ENUM (
  'CITE_PROVIDER_RECEIPT',
  'STOP_PROVIDER_RECEIPT',
  'OMIT_PROVIDER_RECEIPT'
);
CREATE TYPE accc_citation_class AS ENUM ('PUBLISHED', 'NOT_PUBLISHED');
CREATE TYPE accc_citation_reason AS ENUM (
  'RECEIVED_RECEIPT_CITATION_PUBLISHED',
  'NOT_RECEIVED_RECEIPT_CANNOT_CITE'
);
CREATE TYPE accc_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE accc_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE accc_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE accc_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE accc_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE accc_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE accc_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE accc_compile_kind AS ENUM ('PUBLISH_RECEIVED_RECEIPT_CITATION');
CREATE TYPE accc_terminal_kind AS ENUM (
  'CITATION_PUBLISHED',
  'CITATION_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE accc_citation_next AS ENUM (
  'HOLD_CITATION_CARD',
  'STOP_CITATION_CARD',
  'OMIT_CITATION_CARD'
);
CREATE TYPE accc_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_PUBLISH',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_accc_profile_authority NOLOGIN;

CREATE TABLE agent_accc_authorization_evidence (
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

CREATE TABLE agent_accc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status accc_profile_status NOT NULL,
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
  citation_threshold INTEGER NOT NULL CHECK (citation_threshold >= 2),
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy accc_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_accc_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_accc_profile_citation_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes accc_admission_class[] NOT NULL,
  citation_threshold INTEGER NOT NULL CHECK (citation_threshold >= 2),
  max_receipts_per_session INTEGER NOT NULL CHECK (max_receipts_per_session = 1),
  max_nominated_receipts INTEGER NOT NULL CHECK (max_nominated_receipts = 1),
  require_dual_control_citation BOOLEAN NOT NULL,
  citation_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_accc_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_accc_received_receipt_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  provider_receipt_id UUID NOT NULL,
  outcome_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class accc_admission_class NOT NULL,
  outcome_class TEXT NOT NULL,
  receipt_class accc_receipt_class NOT NULL,
  receipt_reason accc_receipt_reason NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  freshness_class accc_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation accc_effect_observation NOT NULL,
  attested_key_kind accc_key_kind NOT NULL,
  fact_disposition accc_fact_disposition NOT NULL,
  body_visibility accc_body_visibility NOT NULL,
  metadata_trust accc_metadata_trust NOT NULL,
  access_path accc_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action accc_receipt_next NOT NULL,
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
  receipt_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, provider_receipt_id),
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
  CHECK (NOT (receipt_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_accc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status accc_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_publish_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_publish_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  citation_threshold INTEGER NOT NULL,
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
    REFERENCES agent_accc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_accc_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_accc_receipt_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path accc_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE TABLE agent_accc_receipt_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  provider_receipt_id UUID NOT NULL,
  admission_class accc_admission_class NOT NULL,
  receipt_class accc_receipt_class NOT NULL,
  provider_receipt_recorded BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accc_received_receipt_head (account_id, utc_day, consumer_principal_id)
);

CREATE TABLE agent_accc_citation_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_code TEXT NOT NULL,
  admission_class accc_admission_class NOT NULL,
  citation_class accc_citation_class NOT NULL,
  citation_published BOOLEAN NOT NULL,
  citation_hash TEXT NOT NULL CHECK (char_length(citation_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE TABLE agent_accc_citation_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  citation_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  citation_hash TEXT NOT NULL CHECK (char_length(citation_hash) = 64),
  admission_class accc_admission_class NOT NULL,
  citation_class accc_citation_class NOT NULL,
  citation_published BOOLEAN NOT NULL,
  citation_steward_a TEXT NOT NULL,
  citation_steward_b TEXT NOT NULL,
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
    REFERENCES agent_accc_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_accc_citation_compile (account_id, compile_id)
);

CREATE TABLE agent_accc_citation_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_code TEXT NOT NULL,
  compile_kind accc_compile_kind NOT NULL,
  admission_class accc_admission_class NOT NULL,
  receipt_class accc_receipt_class NOT NULL,
  citation_class accc_citation_class NOT NULL,
  freshness_class accc_freshness_class NOT NULL,
  effect_observation accc_effect_observation NOT NULL,
  attested_key_kind accc_key_kind NOT NULL,
  fact_disposition accc_fact_disposition NOT NULL,
  body_visibility accc_body_visibility NOT NULL,
  access_path accc_access_path NOT NULL,
  metadata_trust accc_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  citation_published BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  citation_hash TEXT NOT NULL CHECK (char_length(citation_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_accc_citation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE TABLE agent_accc_citation_card (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_card_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  provider_receipt_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class accc_admission_class NOT NULL,
  receipt_class accc_receipt_class NOT NULL,
  citation_class accc_citation_class NOT NULL,
  citation_reason accc_citation_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation accc_effect_observation NOT NULL,
  attested_key_kind accc_key_kind NOT NULL,
  fact_disposition accc_fact_disposition NOT NULL,
  body_visibility accc_body_visibility NOT NULL,
  metadata_trust accc_metadata_trust NOT NULL,
  access_path accc_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action accc_citation_next NOT NULL,
  citation_steward_a TEXT NOT NULL,
  citation_steward_b TEXT NOT NULL,
  citation_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, citation_card_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_accc_citation_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accc_received_receipt_head (account_id, utc_day, consumer_principal_id),
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
  CHECK (NOT (citation_body ? 'factBody')),
  CHECK (NOT (citation_body ? 'fact_body')),
  CHECK (NOT (citation_body ? 'resolvedFactHash')),
  CHECK (
    (citation_published = true AND citation_class = 'PUBLISHED'
      AND trusted_next_action = 'HOLD_CITATION_CARD'
      AND citation_body ? 'sealedCount'
      AND citation_body ? 'deniedCount'
      AND citation_body ? 'unknownEffectCount')
    OR (citation_published = false AND citation_class = 'NOT_PUBLISHED'
      AND trusted_next_action IN ('STOP_CITATION_CARD', 'OMIT_CITATION_CARD')
      AND NOT (citation_body ? 'sealedCount')
      AND NOT (citation_body ? 'deniedCount')
      AND NOT (citation_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_accc_citation_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_card_id UUID NOT NULL,
  citation_code TEXT NOT NULL,
  citation_class accc_citation_class NOT NULL,
  citation_published BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind accc_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action accc_citation_next NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accc_citation_card (account_id, utc_day, consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_accc_citation_intent (
  account_id BIGINT NOT NULL,
  citation_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status accc_intent_status NOT NULL,
  citation_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, citation_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_accc_citation_certificate (account_id, certificate_id)
);

CREATE TABLE agent_accc_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE TABLE agent_accc_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind accc_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE TABLE agent_accc_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE TABLE agent_accc_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_accc_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_accc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_accc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accc_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_accc_profile()
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
      IF current_setting('app.accc_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.accc_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_accc_profile_protect
BEFORE INSERT OR UPDATE ON agent_accc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_profile();

CREATE FUNCTION protect_agent_accc_citation_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status accc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_accc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed citation rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_accc_citation_rule_protect
BEFORE UPDATE ON agent_accc_profile_citation_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_citation_rule();

CREATE FUNCTION protect_agent_accc_received_receipt_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed received receipt head is immutable';
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
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.receipt_class = 'RECEIVED' OR NEW.provider_receipt_recorded THEN
    IF NEW.provider_receipt_recorded IS DISTINCT FROM TRUE
       OR NEW.receipt_class IS DISTINCT FROM 'RECEIVED'
       OR NEW.receipt_reason IS DISTINCT FROM 'RECORDED_EFFECT_PROVIDER_RECEIVED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'CITE_PROVIDER_RECEIPT'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.outcome_class IS DISTINCT FROM 'RECORDED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.receipt_body ? 'sealedCount') THEN
      RAISE EXCEPTION 'received receipt head must carry the granted counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.receipt_reason IS DISTINCT FROM 'NOT_RECORDED_EFFECT_CANNOT_RECEIVE'
     OR NEW.receipt_class IS DISTINCT FROM 'NOT_RECEIVED'
     OR NEW.outcome_class IS DISTINCT FROM 'NOT_RECORDED'
     OR NEW.receipt_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not received receipt head cannot carry a citation grant';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_PROVIDER_RECEIPT' THEN
      RAISE EXCEPTION 'silence is not a published citation card';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_PROVIDER_RECEIPT' THEN
      RAISE EXCEPTION 'denied receipt head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'receipt head class is not citable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_accc_received_receipt_head_protect
BEFORE INSERT OR UPDATE ON agent_accc_received_receipt_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_received_receipt_head();

CREATE FUNCTION protect_agent_accc_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.citation_hash IS DISTINCT FROM NEW.citation_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'citation card decision identity is immutable';
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

  IF NEW.citation_class = 'PUBLISHED' AND NEW.citation_published IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'published citation must copy the received counts';
  END IF;

  IF NEW.citation_class = 'NOT_PUBLISHED' AND NEW.citation_published THEN
    RAISE EXCEPTION 'not received receipt cannot publish a successful citation';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_accc_decision_protect
BEFORE INSERT OR UPDATE ON agent_accc_citation_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_decision();

CREATE FUNCTION protect_agent_accc_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.citation_steward_a = NEW.citation_steward_b
     OR NEW.consumer_principal_id IN (NEW.citation_steward_a, NEW.citation_steward_b)
     OR NEW.citation_steward_a IN (
       NEW.provider_steward_a, NEW.provider_steward_b,
       NEW.effect_steward_a, NEW.effect_steward_b,
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.citation_steward_b IN (
       NEW.provider_steward_a, NEW.provider_steward_b,
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
       NEW.provider_steward_a, NEW.provider_steward_b,
       NEW.effect_steward_a, NEW.effect_steward_b,
       NEW.bind_steward_a, NEW.bind_steward_b,
       NEW.receipt_steward_a, NEW.receipt_steward_b,
       NEW.card_steward_a, NEW.card_steward_b,
       NEW.admission_steward_a, NEW.admission_steward_b,
       NEW.attestation_steward_a, NEW.attestation_steward_b,
       NEW.synopsis_steward_a, NEW.synopsis_steward_b,
       NEW.publication_steward_a, NEW.publication_steward_b
     )
     OR NEW.provider_steward_a = NEW.provider_steward_b
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

CREATE TRIGGER agent_accc_certificate_protect
BEFORE INSERT OR UPDATE ON agent_accc_citation_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_certificate();

CREATE FUNCTION protect_agent_accc_citation_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_intent$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'citation intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.citation_idempotency_key IS DISTINCT FROM NEW.citation_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared citation identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_accc_citation_intent_protect
BEFORE INSERT OR UPDATE ON agent_accc_citation_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_citation_intent();

CREATE FUNCTION protect_agent_accc_citation_card()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_card$
DECLARE
  v_head agent_accc_received_receipt_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed citation card is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.citation_body ? 'factBody'
     OR NEW.citation_body ? 'fact_body'
     OR NEW.citation_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'citation card fence';
  END IF;

  IF NEW.citation_code IS NULL OR NEW.citation_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_accc_received_receipt_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'received receipt head point lookup missed';
  END IF;

  IF NEW.citation_class = 'PUBLISHED' OR NEW.citation_published THEN
    IF v_head.receipt_class IS DISTINCT FROM 'RECEIVED'
       OR v_head.provider_receipt_recorded IS DISTINCT FROM TRUE
       OR v_head.receipt_reason IS DISTINCT FROM 'RECORDED_EFFECT_PROVIDER_RECEIVED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'CITE_PROVIDER_RECEIPT' THEN
      RAISE EXCEPTION 'not received receipt cannot publish a successful citation';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.citation_reason IS DISTINCT FROM 'RECEIVED_RECEIPT_CITATION_PUBLISHED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_CITATION_CARD'
       OR NEW.provider_receipt_id IS DISTINCT FROM v_head.provider_receipt_id THEN
      RAISE EXCEPTION 'published citation must copy the received counts';
    END IF;
  ELSE
    IF v_head.receipt_class IS DISTINCT FROM 'NOT_RECEIVED' OR v_head.provider_receipt_recorded THEN
      RAISE EXCEPTION 'received receipt must publish the granted counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.citation_body ? 'sealedCount'
       OR NEW.citation_published
       OR NEW.citation_reason IS DISTINCT FROM 'NOT_RECEIVED_RECEIPT_CANNOT_CITE' THEN
      RAISE EXCEPTION 'not published citation cannot carry counts';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_PROVIDER_RECEIPT' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_CITATION_CARD' THEN
        RAISE EXCEPTION 'silence cannot publish a citation card';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_CITATION_CARD'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused citation must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code, p.allowed_citation_code
    INTO v_effect, v_purpose, v_provider, v_citation
  FROM agent_accc_session AS s
  JOIN agent_accc_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_citation IS NULL
     OR NEW.citation_code IS DISTINCT FROM v_citation
     OR NEW.provider_code IS DISTINCT FROM v_provider
     OR NEW.effect_code IS DISTINCT FROM v_effect
     OR NEW.purpose_code IS DISTINCT FROM v_purpose
     OR NEW.effect_code IS DISTINCT FROM v_head.effect_code
     OR NEW.purpose_code IS DISTINCT FROM v_head.purpose_code
     OR NEW.provider_code IS DISTINCT FROM v_head.provider_code THEN
    RAISE EXCEPTION 'citation code is not the profile citation';
  END IF;

  RETURN NEW;
END
$protect_card$;

CREATE TRIGGER agent_accc_citation_card_protect
BEFORE INSERT OR UPDATE ON agent_accc_citation_card
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_citation_card();

CREATE FUNCTION protect_agent_accc_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed citation perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.citation_class = 'NOT_PUBLISHED'
     AND (NEW.citation_published
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not published perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_accc_perception_protect
BEFORE INSERT OR UPDATE ON agent_accc_citation_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_accc_perception();

CREATE FUNCTION approve_agent_accc_profile(
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
  stored_status accc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_accc_profile
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
  FROM agent_accc_profile_citation_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_citation IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control citation rule';
  END IF;

  PERFORM set_config(
    'app.accc_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_accc_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_accc_profile(
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
  stored_status accc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_accc_profile
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
    'app.accc_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_accc_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_accc_receipt(
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
  v_session_status accc_session_status;
  v_profile_status accc_profile_status;
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
    FROM agent_accc_receipt_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one receipt per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_accc_session AS s
  JOIN agent_accc_profile AS pr
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

  INSERT INTO agent_accc_receipt_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION publish_agent_accc_citation_card(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_citation_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_card_id UUID,
  p_card_digest TEXT,
  p_citation_steward_a TEXT,
  p_citation_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $publish_card$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status accc_session_status;
  v_profile_status accc_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_principal TEXT;
  v_head agent_accc_received_receipt_head%ROWTYPE;
  v_class accc_citation_class;
  v_reason accc_citation_reason;
  v_published BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next accc_citation_next;
  v_terminal accc_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_citation_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_card_digest) <> 64 THEN
    RAISE EXCEPTION 'citation digest must be 64 hex characters';
  END IF;

  IF p_citation_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_accc_receipt_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'citation card requires a nominated receipt point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_principal
  FROM agent_accc_session AS s
  JOIN agent_accc_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'publish requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_citation_code IS DISTINCT FROM v_allowed_citation THEN
    RAISE EXCEPTION 'citation code is not the profile citation';
  END IF;

  SELECT * INTO v_head
  FROM agent_accc_received_receipt_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'received receipt head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider THEN
    RAISE EXCEPTION 'provider code is not the profile provider';
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
     OR v_head.receipt_body ? 'factBody'
     OR v_head.receipt_body ? 'fact_body'
     OR v_head.receipt_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'citation card fence';
  END IF;

  IF p_citation_steward_a = p_citation_steward_b
     OR p_consumer_principal IN (p_citation_steward_a, p_citation_steward_b)
     OR p_citation_steward_a IN (
       v_head.provider_steward_a, v_head.provider_steward_b,
       v_head.effect_steward_a, v_head.effect_steward_b,
       v_head.bind_steward_a, v_head.bind_steward_b,
       v_head.receipt_steward_a, v_head.receipt_steward_b,
       v_head.card_steward_a, v_head.card_steward_b,
       v_head.admission_steward_a, v_head.admission_steward_b,
       v_head.attestation_steward_a, v_head.attestation_steward_b,
       v_head.synopsis_steward_a, v_head.synopsis_steward_b,
       v_head.publication_steward_a, v_head.publication_steward_b
     )
     OR p_citation_steward_b IN (
       v_head.provider_steward_a, v_head.provider_steward_b,
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
       v_head.provider_steward_a, v_head.provider_steward_b,
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
    FROM agent_accc_citation_card
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'citation card already published';
  END IF;

  IF v_head.receipt_class = 'RECEIVED'
     AND v_head.receipt_reason = 'RECORDED_EFFECT_PROVIDER_RECEIVED'
     AND v_head.provider_receipt_recorded
     AND v_head.trusted_next_action = 'CITE_PROVIDER_RECEIPT'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.outcome_class = 'RECORDED' THEN
    v_class := 'PUBLISHED';
    v_reason := 'RECEIVED_RECEIPT_CITATION_PUBLISHED';
    v_published := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'HOLD_CITATION_CARD';
    v_terminal := 'CITATION_PUBLISHED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_PROVIDER_RECEIPT' THEN
    v_class := 'NOT_PUBLISHED';
    v_reason := 'NOT_RECEIVED_RECEIPT_CANNOT_CITE';
    v_published := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_CITATION_CARD';
    v_terminal := 'CITATION_REFUSED';
  ELSE
    v_class := 'NOT_PUBLISHED';
    v_reason := 'NOT_RECEIVED_RECEIPT_CANNOT_CITE';
    v_published := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_CITATION_CARD';
    v_terminal := 'CITATION_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'purposeCode', v_head.purpose_code,
    'effectCode', v_head.effect_code,
    'providerCode', v_head.provider_code,
    'citationCode', p_citation_code,
    'admissionClass', v_head.admission_class,
    'receiptClass', v_head.receipt_class,
    'citationClass', v_class,
    'citationReason', v_reason,
    'citationPublished', v_published,
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
  IF v_published THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_accc_receipt_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    provider_receipt_id, admission_class, receipt_class, provider_receipt_recorded,
    bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    v_head.provider_receipt_id, v_head.admission_class, v_head.receipt_class,
    v_head.provider_receipt_recorded, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accc_citation_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    citation_code, admission_class, citation_class, citation_published,
    citation_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_citation_code, v_head.admission_class, v_class, v_published,
    p_card_digest, clock_timestamp()
  );

  INSERT INTO agent_accc_citation_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    utc_day, citation_code, provider_code, citation_hash, admission_class, citation_class,
    citation_published, citation_steward_a, citation_steward_b,
    provider_steward_a, provider_steward_b,
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
    p_utc_day, p_citation_code, v_head.provider_code, p_card_digest,
    v_head.admission_class, v_class, v_published,
    p_citation_steward_a, p_citation_steward_b,
    v_head.provider_steward_a, v_head.provider_steward_b,
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

  INSERT INTO agent_accc_citation_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, citation_code, compile_kind, admission_class, receipt_class,
    citation_class, freshness_class, effect_observation, attested_key_kind,
    fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    citation_published, executes_tool, lag_publications, max_lag_budget, citation_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_citation_code, 'PUBLISH_RECEIVED_RECEIPT_CITATION',
    v_head.admission_class, v_head.receipt_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_published, false, v_lag, v_head.max_lag_budget, p_card_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accc_citation_card (
    account_id, utc_day, consumer_principal_id, citation_card_id, session_id,
    certificate_id, provider_receipt_id, purpose_code, effect_code, provider_code,
    citation_code, admission_class, receipt_class, citation_class, citation_reason,
    citation_published, sealed_count, denied_count, unknown_effect_count, lag_publications,
    max_lag_budget, effect_observation, attested_key_kind, fact_disposition, body_visibility,
    metadata_trust, access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
    packet_scan_used, executes_tool, trusted_next_action, citation_steward_a,
    citation_steward_b, citation_body, sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_card_id, p_session_id,
    p_certificate_id, v_head.provider_receipt_id, v_head.purpose_code, v_head.effect_code,
    v_head.provider_code, p_citation_code, v_head.admission_class, v_head.receipt_class,
    v_class, v_reason, v_published, v_sealed, v_denied, v_unknown, v_lag,
    v_head.max_lag_budget, v_head.effect_observation, 'AWAITING_CONFIRMATION',
    'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false,
    false, false, v_next, p_citation_steward_a, p_citation_steward_b, v_body,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accc_citation_perception (
    account_id, utc_day, consumer_principal_id, citation_card_id, citation_code,
    citation_class, citation_published, sealed_count, denied_count, unknown_effect_count,
    attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_card_id, p_citation_code,
    v_class, v_published, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_accc_citation_intent (
    account_id, citation_intent_id, session_id, certificate_id, intent_status,
    citation_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_card_id, p_session_id, p_certificate_id, 'PREPARED',
    p_card_id::TEXT, 1, p_card_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accc_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_card_id, p_session_id, 'PUBLISH', 1, clock_timestamp()
  );

  INSERT INTO agent_accc_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_accc_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'CITATION_CARD_SEALED',
    p_card_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_accc_session
  SET consumed_publish_units = consumed_publish_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$publish_card$;

CREATE FUNCTION reject_agent_accc_unscoped_scan(
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

ALTER FUNCTION approve_agent_accc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_accc_profile_authority;
ALTER FUNCTION revoke_agent_accc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_accc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_accc_profile_authority;
GRANT SELECT ON
  agent_accc_profile,
  agent_accc_profile_citation_rule
TO agent_accc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_accc_profile TO agent_accc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_accc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_accc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_accc_profile FROM PUBLIC;

CREATE INDEX agent_accc_session_work_idx ON agent_accc_session (
  account_id,
  status
);
CREATE INDEX agent_accc_session_profile_idx ON agent_accc_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_accc_head_consumer_idx ON agent_accc_received_receipt_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_accc_nomination_session_idx ON agent_accc_receipt_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_accc_certificate_session_idx ON agent_accc_citation_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_accc_decision_cert_idx ON agent_accc_citation_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_accc_card_consumer_idx ON agent_accc_citation_card (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_accc_card_class_idx ON agent_accc_citation_card (
  account_id,
  citation_class
);
CREATE INDEX agent_accc_perception_day_idx ON agent_accc_citation_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_accc_intent_work_idx ON agent_accc_citation_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_accc_audit_time_idx ON agent_accc_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_accc_command_expiry_idx ON agent_accc_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_accc_checkpoint_day_idx ON agent_accc_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_accc_binding_day_idx ON agent_accc_receipt_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_accc_authorization_evidence',
    'agent_accc_profile',
    'agent_accc_profile_citation_rule',
    'agent_accc_received_receipt_head',
    'agent_accc_session',
    'agent_accc_receipt_nomination',
    'agent_accc_receipt_binding',
    'agent_accc_citation_compile',
    'agent_accc_citation_certificate',
    'agent_accc_citation_decision',
    'agent_accc_citation_card',
    'agent_accc_citation_perception',
    'agent_accc_citation_intent',
    'agent_accc_budget_ledger',
    'agent_accc_terminal_record',
    'agent_accc_command_result',
    'agent_accc_audit_head',
    'agent_accc_audit_event',
    'agent_accc_audit_anchor',
    'agent_accc_projection_checkpoint'
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

Direct inserts that skip the publish function still pass through
the triggers. A successful citation on a `NOT_RECEIVED` receipt, a
trusted key, a packet scan, a fact body, a tool execution flag, or
a nested expiry flag is rejected. The received receipt head cannot
be updated to launder a refused receipt into a citation card.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AcccAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AcccReceiptClass {
  RECEIVED
  NOT_RECEIVED
}

enum AcccCitationClass {
  PUBLISHED
  NOT_PUBLISHED
}

enum AcccCitationReason {
  RECEIVED_RECEIPT_CITATION_PUBLISHED
  NOT_RECEIVED_RECEIPT_CANNOT_CITE
}

enum AcccNextAction {
  HOLD_CITATION_CARD
  STOP_CITATION_CARD
  OMIT_CITATION_CARD
}

enum AcccKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AcccProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  allowedPurpose: String!
  allowedEffectCode: String!
  allowedProviderCode: String!
  allowedCitationCode: String!
  procedureRef: String!
}

type AcccSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReceiptsPerSession: Int!
}

type AcccReceivedReceiptHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  receiptClass: AcccReceiptClass!
  providerReceiptRecorded: Boolean!
  attestedKeyKind: AcccKeyKind!
}

type AcccCitationCard {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  citationCardId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  admissionClass: AcccAdmissionClass!
  receiptClass: AcccReceiptClass!
  citationClass: AcccCitationClass!
  citationReason: AcccCitationReason!
  citationPublished: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AcccKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AcccNextAction!
}

type AcccCitationPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  citationCode: String!
  citationPublished: Boolean!
  perceptionBody: JSON!
}

type AcccAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAcccProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AcccProfile
  agentAcccSession(accountId: ID!, sessionId: ID!): AcccSession
  agentAcccReceivedReceiptHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcccReceivedReceiptHead
  agentAcccCitationCard(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcccCitationCard
  agentAcccCitationPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AcccCitationPerception
  agentAcccAuditEvents(accountId: ID!, utcDay: String!): [AcccAuditEvent!]!
}

type Mutation {
  createAgentAcccProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AcccProfile!
  approveAgentAcccProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcccProfile!
  revokeAgentAcccProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AcccProfile!
  openAgentAcccSession(accountId: ID!, sessionId: ID!, profileId: ID!): AcccSession!
  nominateAgentAcccReceipt(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  publishAgentAcccCitationCard(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    citationCode: String!
  ): AcccCitationCard!
  appendAgentAcccCitationIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAcccAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Receipt and card reads also take a
non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-receipts field and no field that executes a tool.
Resolvers must call `reject_agent_accc_unscoped_scan` before
planning when either the account or the receipt key is missing. A
card read is one primary-key lookup. It does not join a packet
catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-citation-card`. The
instruction payload on the citation rule is deterministic JSON:

- point-look up one received receipt by
  `(account_id, utc_day, consumer_principal_id)`;
- publish the single `allowed_citation_code` only when the receipt
  reason is `RECORDED_EFFECT_PROVIDER_RECEIVED` and the next action
  is `CITE_PROVIDER_RECEIPT`;
- otherwise seal `NOT_RECEIVED_RECEIPT_CANNOT_CITE` with null
  counts;
- never execute the tool inside the publish;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, and the
one citation code. It may not rewrite the instruction by chatting
with the engine. Changing the citation code is a new profile
version that stays `DRAFT` until the authority fence approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash, which
covers the single citation code. Queries must filter `account_id`
before topK. A global ANN index would mix tenants and is rejected.
The reference schema does not build an HNSW index.

```sql
CREATE TABLE agent_accc_profile_embedding (
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
    REFERENCES agent_accc_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_accc_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_accc_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_accc_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one receipt, and publishes that profile's one
citation code under dual control. Similarity never publishes a
card and never restores a fact.

## 12. Agent perception

The agent reads `agent_accc_citation_perception`, not the steward
columns on the received receipt head.

Metadata tags on a published perception:

- `grain:account_id,utc_day,consumer_principal_id`
- `citationClass:PUBLISHED`
- `citationCode:<the one profile citation>`
- `citationPublished:true`
- `executesTool:false`
- `attestedKeyKind:AWAITING_CONFIRMATION`
- `ackPromotedToTrust:false`
- `accessPath:POINT_LOOKUP`
- `next:HOLD_CITATION_CARD`

`HOLD_CITATION_CARD` tells the agent which card was sealed. The
database has not called the provider and has not called the tool.
The hold does not open another nested expiry. The agent must not
fan the card out to other tools, other days, or a board scan.

A `NOT_PUBLISHED` perception omits `sealedCount`, `deniedCount`,
and `unknownEffectCount`. Tags are `citationPublished:false` and
either `next:STOP_CITATION_CARD` or `next:OMIT_CITATION_CARD`. The
agent must treat those tags as absence of a citation. It must not
fill the counts from memory, from a packet, or from a model.

## 13. ACID and consistency

The publish function writes the binding, compile, certificate,
decision, card, perception, intent, ledger, terminal, and audit
event in one transaction. The receipt head is read and not
updated. A crash before commit leaves no card. A commit is the
only durable record of the citation card.

Consistency choice: the card is sealed at the receipt's counts. It
does not wait for a later columnar refresh and it does not
recompute the counts. Stale analytics cannot change a sealed card.
The hybrid row store owns the transaction. Columnar storage may
later project the card for aggregation, but only by the same
primary key, and only after the row commit.

`UNKNOWN_EFFECT` on the parent admission stays a non-citation with
a null lag. Silence is not rewritten into a successful citation to
make a dashboard look complete.

## 14. Guardrails and neighbor protection

- One receipt per session. A second nomination is rejected.
- One card per receipt. A second publish is rejected.
- `executes_tool` is forced false. The ACID path cannot call out
  to a tool or a provider.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected
  access paths.
- Null account, day, consumer, or citation code is **FULL SCAN
  REJECTED** before planning.
- Citation stewards cannot be the consumer or any upstream
  steward, so one principal cannot witness its own card.
- Notify intents start `PREPARED`. Provider silence stays
  `UNKNOWN_EFFECT` and does not enroll the key.
- This plane does not open another nested expiry.

These guards keep a recursive agent from turning one admitted-count
citation into a board-sized walk that would miss the 99.99%
availability target for neighbors.

## 15. Performance check for boards with 1M+ rows

The hot path is a primary-key read and a primary-key write on
`(account_id, utc_day, consumer_principal_id)`. It does not filter
a board, a packet log, or a citation history. Indexes that serve
sessions, certificates, and audit reads all lead with
`account_id`.

A planner that sees a missing account or a missing receipt key
must call `reject_agent_accc_unscoped_scan` and stop. That is
**FULL SCAN REJECTED**. It is a refusal before a sequential scan.
Boards with 1M+ rows are not inputs to this plane.

HNSW, when a deployment adds it inside an account-partitioned
segment, ranks profiles only. It is not on the publish path. The
reference schema omits the index so a global ANN scan cannot leak
across tenants.

## 16. Auditability and replay

Each publish appends `agent_accc_audit_event` with the card digest
and a previous hash. The event kind is `CITATION_CARD_SEALED`.
Anchors are a separate mutation and do not rewrite the card.
Replay reads the received receipt head and the profile citation
code and re-runs `projectCitationCard`. The engine does not call a
model. The same head and the same citation code always produce the
same class, the same counts, and the same next action.

## 17. Threat and failure analysis

- A caller who sets `PUBLISHED` on a `NOT_RECEIVED` head is
  rejected. The refusal cannot be laundered into a success.
- A caller who copies different counts than the receipt head is
  rejected. The card cannot invent a larger citation.
- A caller who inlines `factBody` is rejected. The body stays
  omitted.
- A caller who sets `TRUSTED_ENROLLED` or `ack_promoted_to_trust`
  is rejected. `ACKED` stays an observation.
- A caller who sets `PACKET_SCAN` or `executes_tool` is rejected.
  The publish does not walk packets and does not run the tool.
- A caller who reuses a provider steward as a citation steward is
  rejected.
- A caller who updates a sealed head or a sealed card is rejected.
- A caller who inserts a profile as `APPROVED` is rejected.
  Approval goes through the authority fence.
- Cross-tenant rows fail the forced `account_id` policy.

## 18. Observability and SLOs

- Publish latency target: one primary-key read plus one
  primary-key write, p99 under 20 ms inside the tenant partition.
  This budget excludes provider calls and tool execution, which
  stay outside the database.
- Availability target: 99.99% for neighbor queries. Rejected scans
  must not become background work.
- Correctness counters: `published_citations`,
  `refused_citations`, `full_scan_rejected`,
  `not_received_success_rejected`, `fact_body_rejected`.
- A refused citation is a successful seal of `NOT_PUBLISHED`, not
  an error budget burn, unless the function itself fails.
- `UNKNOWN_EFFECT` seals are counted separately from `DENIED` so
  silence is visible.

## 19. Rollout

1. Ship the schema and the publish function dark, behind the
   profile authority role.
2. Export received receipt heads for one internal account by
   primary key. Do not backfill from a board scan.
3. Approve one profile whose citation code is
   `citation:card-cited-admitted-counts`, whose provider code is
   `provider:receipt-cited-admitted-counts`, whose effect code is
   `effect:cited-admitted-counts`, and whose purpose is
   `tool:cite-admitted-counts`.
4. Publish cards for that account. Compare the sealed counts to
   the receipt head.
5. Enable the GraphQL mutations for that account.
6. Expand account by account. Revocation stops new sessions and
   leaves sealed cards in place.

No step opens another nested expiry plane.

## 20. Ship criteria

- `npm run validate` passes TypeScript strict compile, GraphQL
  schema build (6 queries, 8 mutations), and PGlite plus pgvector
  DDL execution.
- Fixture: lag 3, budget 5, class `RECEIVED`, counts 1/1/1,
  citation `citation:card-cited-admitted-counts` published; lag 8,
  budget 5, class `NOT_RECEIVED` with counts omitted and the
  receipt head lag still 8; silence class `UNKNOWN_EFFECT` with
  null lag and null counts.
- A `NOT_RECEIVED` receipt cannot publish a successful citation.
- The card does not scan context packets, does not inline a fact
  body, does not promote `ACKED` to `TRUSTED_ENROLLED`, does not
  execute the tool, and does not open another nested expiry.
- Every table and tenant index leads with `account_id`.
- `npm audit` reports no vulnerabilities for this package's direct
  dependency tree at ship time.

## 21. Product decision

Ship the Admitted Count Citation Card Plane as the deterministic
publication of one citation card for one already sealed provider
receipt. The database seals the card. It does not run the tool and
it does not call the provider. Agents perceive a single perception
row keyed by account, UTC day, and consumer.
`HOLD_CITATION_CARD` is a hold handle. `STOP_CITATION_CARD` and
`OMIT_CITATION_CARD` are refusals. Neither handle is permission to
scan a board. This plane does not open another nested expiry.

The next increment should grant one already `PUBLISHED` citation
card to exactly one reader principal by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_PUBLISHED`
card cannot be granted. The grant copies the three counts only
when `citation_published` is true. The reader must be distinct
from the consumer and from every steward. The grant must not scan
context packets, must not inline a fact body, must not promote
`ACKED` to `TRUSTED_ENROLLED`, must not execute the tool, and must
not open another nested expiry plane.
