# mondayDB Agentic Admitted Count Citation Grant Plane

**Status:** Proposed
**Decision owner:** mondayDB Product and Engineering
**Contract version:** `2026-10-16.v1`

## 1. Why this plane, before how

The 2026-10-15 Admitted Count Citation Card Plane seals one citation
card for one already sealed provider receipt. The grain is
`(account_id, utc_day, consumer_principal_id)`. A `PUBLISHED` card
copies the three granted counts and names `HOLD_CITATION_CARD`. A
`NOT_PUBLISHED` card seals `NOT_RECEIVED_RECEIPT_CANNOT_CITE` with
null counts. That plane does not grant the card to a reader.

Without this plane an agent either:

- treats `HOLD_CITATION_CARD` itself as permission for every
  principal in the account, or
- walks context packets, tool logs, or a board with 1M+ rows to
  invent a reader list (neighbor-harmful, and a miss against the
  99.99% availability target).

The product trade-off is **grant honesty versus card isolation**,
and **grant latency versus reader fan-out**:

- Honesty: a consumer whose card is `PUBLISHED` should be able to
  grant that card to exactly one reader, copying the three counts
  already on the card, without opening the card again.
- Isolation: the database does not call the provider and does not
  execute the tool. Granting is a deterministic seal. A
  probabilistic agent stays outside the engine, so a slow or
  recursive tool cannot spend neighbor latency inside the ACID path.
- Least privilege: a `NOT_PUBLISHED` card cannot be granted. One
  card grants at most one reader. A second reader is a new request,
  and this plane rejects it.
- The citation card head is not rewritten. Replay of the card stays
  stable. The grant is a new row that cites the card by primary key.
- `ACKED` stays an effect observation. The key stays
  `AWAITING_CONFIRMATION`. The body stays omitted. This plane does
  not promote `ACKED` to `TRUSTED_ENROLLED`.

Latency for the grant is one primary-key read of
`(account_id, utc_day, consumer_principal_id)` and one primary-key
write of that same grain plus the one reader. Consistency is the
sealed grant plus the card id it cites. Neighbor availability stays
at the 99.99% target because an unscoped day walk, a reader list,
or a packet walk is **FULL SCAN REJECTED** before it touches a
board.

The recommended model keeps the data plane deterministic:

1. An approved grant profile is procedural memory for "how one
   already sealed citation card becomes a single-reader grant."
   The profile names exactly one grant code and the one citation
   code that grant may cite. A profile never inlines a fact body,
   never rewrites `ACKED` as `TRUSTED_ENROLLED`, and never opens
   another nested expiry plane.
2. A session nominates exactly one card key. The grant then reads
   `agent_accg_citation_card_head` by
   `(account_id, utc_day, consumer_principal_id)`. It does not scan
   packets.
3. mondayDB issues a successful grant only when the head is
   `PUBLISHED`, `citation_published` is true, the citation reason
   is `RECEIVED_RECEIPT_CITATION_PUBLISHED`, the next action is
   `HOLD_CITATION_CARD`, and the requested grant code equals the
   profile grant code. The copy of the three counts is equality
   with the card. It does not call a model and it does not execute
   the tool.
4. `NOT_PUBLISHED` seals `NOT_PUBLISHED_CITATION_CANNOT_GRANT` with
   `grant_issued = false` and null counts. Silence keeps a null
   lag. There is no successful grant.
5. The reader is distinct from the consumer and from every steward,
   including the two grant stewards. Two grant stewards witness the
   grant. They are distinct from the consumer, from the reader, and
   from the citation, provider, effect, bind, receipt, card,
   admission, attestation, synopsis, and publication stewards.
6. Unscoped card or board scans are **FULL SCAN REJECTED** before
   planning.

### Product outcome

For any account, UTC day, and consumer, mondayDB can answer:

- Which profile, principal, and session granted the nomination and
  the citation grant?
- Was the grant a point lookup of an already sealed card, and what
  class did that card have?
- Did a `PUBLISHED` card grant exactly one reader and seal
  `PUBLISHED_CITATION_GRANT_ISSUED` with the three granted counts?
- Did a `NOT_PUBLISHED` card stay ungranted, with null counts and
  `NOT_PUBLISHED_CITATION_CANNOT_GRANT`?
- Did `ACKED` stay an effect observation while the key stayed
  `AWAITING_CONFIRMATION` and the body stayed omitted?
- Did the citation card head keep the class and counts it was
  exported with?
- Can the grant be replayed without invoking an LLM, and without
  executing the tool?

HNSW profile discovery stays account-scoped and never issues this
grant.

## 2. Scope and ownership

The Admitted Count Citation Grant Plane owns:

1. Immutable approved grant profiles as procedural memory, each
   naming one grant code for one citation card.
2. Tenant-scoped grant sessions with a hard cap of one nominated
   card and one reader.
3. Deterministic nomination of that card, then one point lookup of
   the citation card head.
4. A citation grant keyed by
   `(account_id, utc_day, consumer_principal_id)` and naming
   exactly one `reader_principal_id`.
5. An agent perception row that carries counts only when
   `grant_issued` is true, which is only when `citation_published`
   is true.
6. Audit events that cite the grant hash.

It integrates with, but does not replace:

- **Admitted Count Citation Card Plane:** supplies the sealed card
  this plane reads. Exporters copy the citation class, the citation
  reason, `citation_published`, the counts the card actually
  published, the next action, and the stewards onto
  `agent_accg_citation_card_head`. This plane does not re-publish
  the card, does not recover withheld counts, and does not promote
  `ACKED` to `TRUSTED_ENROLLED`.
- **Query Governor / Budgets:** reserves nominate, grant, vector,
  and notify units. A refused card is a sealed non-grant, not a
  scan of the packet log. The grant does not run the tool and does
  not call the provider.

### Non-goals

- Letting an LLM choose which reader a card may grant.
- Executing the tool, calling the provider, or compiling a board
  query inside `grant_agent_accg_citation`.
- Granting any grant code other than the single code on the
  approved profile.
- Copying counts onto a grant whose card is `NOT_PUBLISHED`.
- Rewriting the citation card head so a refused card becomes a
  successful grant.
- Recomputing grants by scanning a board, a packet log, or a reader
  ledger.
- Cross-account grants or global nearest-neighbor granting.
- Storing raw private keys, tool payloads, packet bodies, or fact
  bodies on the grant.
- Promoting `AWAITING_CONFIRMATION` to `TRUSTED_ENROLLED` because
  the effect observation was `ACKED`.
- Opening another nested expiry, containment, review, or resolution
  plane from this grant.
- Issuing a reader receipt for the granted counts. That is the next
  plane, and only for an already `GRANTED` grant.

## 3. Product contract

### 3.1 Grant profile contract

A profile version is immutable after approval. It defines:

- the single `allowed_purpose` code the card must already carry
  (one token, no list);
- the single `allowed_effect_code` the head must already carry
  (one token, no list);
- the single `allowed_provider_code` the head must already carry
  (one token, no list);
- the single `allowed_citation_code` the head must already carry
  (one token, no list);
- the single `allowed_grant_code` this plane may seal (one token,
  no list);
- allowed admission classes the exporter may present (`ADMITTED`,
  `DENIED`, `UNKNOWN_EFFECT`);
- grant threshold (distinct grant stewards, minimum 2), max cards
  per session (exactly 1), max nominated cards (exactly 1), and max
  readers per card (exactly 1);
- grant policy (`HISTORY_NEVER_REWRITTEN`, `ACK_NEVER_TRUST`,
  `GRANT_NEVER_EXECUTES_TOOL`, `GRANT_NEVER_INLINES_BODY`,
  `GRANT_NEVER_CONFIRMS`, `ONE_CARD_PER_SESSION`,
  `ONE_GRANT_PER_CARD`, `ONE_READER_PER_CARD`, `POINT_LOOKUP_ONLY`,
  `PUBLISHED_CARD_ONLY`, `NESTED_EXPIRY_NEVER_OPENS`,
  `PACKET_NEVER_SCANNED`, `COUNTS_ONLY_WHEN_PUBLISHED`);
- semantic tags and an optional procedure ref;
- revocation policy (`ALLOW_IN_FLIGHT`, `STOP_BEFORE_GRANT`,
  `REQUIRE_REVIEW`).

Every enum label in this contract is at most 63 bytes so
PostgreSQL `CREATE TYPE` accepts it. The longest grant reason is
`NOT_PUBLISHED_CITATION_CANNOT_GRANT` (35 bytes). The success
reason is `PUBLISHED_CITATION_GRANT_ISSUED` (31 bytes).

Approval and revocation require the authority fence
`approve_agent_accg_profile` / `revoke_agent_accg_profile`, owned
by `agent_accg_profile_authority`. A profile cannot be inserted
as `APPROVED`.

### 3.2 Session and budget contract

A session is tenant-scoped by `account_id` and idempotent on
`(account_id, idempotency_key)`. Budgets cap nominate, grant,
vector, and notify units, plus wall time.
`max_cards_per_session`, `max_nominated_cards`, and
`max_readers_per_card` are all exactly 1. A second card nomination
in the same session is rejected before it can fan out into a
recursive reader walk.

The session principal is the only consumer that session may grant.
A grant for a different consumer is rejected. The reader is a
separate principal and cannot be the consumer.

### 3.3 Citation card head and nomination contract

Upstream card export writes one citation card head per
`(account_id, utc_day, consumer_principal_id)`. The head copy
includes `citation_class`, `citation_reason`, `citation_published`,
`trusted_next_action`, the three counts when they were published,
and the stewards. It does not include a fact body and it does not
include withheld counts. The head is immutable. This plane does
not advance it and does not reclassify it.

`nominate_agent_accg_card(account_id, session_id, utc_day,
consumer_principal_id, nomination_id, nomination_hash)` nominates
that card. A null `utc_day`, a null `account_id`, a null consumer,
or a null grant code is **FULL SCAN REJECTED**. The access path is
`POINT_LOOKUP`. `DAY_SCAN`, `PACKET_SCAN`, and `WATERMARK_SCAN`
are rejected.

### 3.4 Citation grant contract

`grant_agent_accg_citation` is the only compile that writes a
citation grant. It requires:

- a nomination of the same
  `(account_id, utc_day, consumer_principal_id)`;
- one citation card head for that key, with
  `access_path = POINT_LOOKUP`, `inlines_fact_body = false`,
  `opens_nested_expiry = false`, `ack_promoted_to_trust = false`,
  `packet_scan_used = false`, and `executes_tool = false`;
- `attested_key_kind = AWAITING_CONFIRMATION`
  (`TRUSTED_ENROLLED` is rejected);
- `grant_code` equal to the profile's `allowed_grant_code`, and
  `citation_code` equal to the head citation and the profile
  citation, each matching `^[a-z0-9:_-]{1,64}$` (one token, not a
  list and not a query);
- a consumer principal equal to the session principal;
- a reader principal distinct from the consumer, from both grant
  stewards, and from every citation, provider, effect, bind,
  receipt, card, admission, attestation, synopsis, and publication
  steward;
- grant stewards distinct from each other and from those same
  principals.

The grain is `(account_id, utc_day, consumer_principal_id)`. That
grain holds one grant and therefore one reader. Projection is:

- `GRANTED` when the head citation class is `PUBLISHED`,
  `citation_published` is true, the citation reason is
  `RECEIVED_RECEIPT_CITATION_PUBLISHED`, and the next action is
  `HOLD_CITATION_CARD`. The grant copies `sealed_count`,
  `denied_count`, and `unknown_effect_count`. `grant_issued` is
  true. `grant_reason` is `PUBLISHED_CITATION_GRANT_ISSUED`.
  `trusted_next_action` is `HOLD_CITATION_GRANT`. The action holds
  the grant for that one reader. It does not run the tool, it does
  not inline a fact body, and it does not open another nested
  expiry.
- `NOT_GRANTED` when the head next action is `STOP_CITATION_CARD`.
  Counts stay null. `grant_reason` is
  `NOT_PUBLISHED_CITATION_CANNOT_GRANT`. `grant_issued` is false.
  `trusted_next_action` is `STOP_CITATION_GRANT`. The denied lag
  is copied and is not cleared.
- `NOT_GRANTED` when the head admission class is `UNKNOWN_EFFECT`
  or the next action is `OMIT_CITATION_CARD`. Counts stay null.
  The grant lag stays null. `grant_reason` is
  `NOT_PUBLISHED_CITATION_CANNOT_GRANT`. `grant_issued` is false.
  `trusted_next_action` is `OMIT_CITATION_GRANT`.

A `NOT_PUBLISHED` card cannot be granted. The three counts are
copied only when `citation_published` is true. `grant_body`
rejects `factBody`, `fact_body`, and `resolvedFactHash`. `ACKED`
is copied as `effect_observation` when the head observed it. It
does not write `TRUSTED_ENROLLED`. The citation card head is not
updated. A second grant for the same consumer and day is rejected,
including a second reader. A forged granted row whose counts
differ from the head is rejected. A forged granted row on a
`NOT_PUBLISHED` head is rejected. A forged non-grant that carries
any count, or that sets `grant_issued`, is rejected. A grant code
other than the profile code is rejected before a row is sealed, so
the caller can retry the one allowed code. A null grant code is
**FULL SCAN REJECTED**.

### 3.5 Perception and notify contract

The same transaction writes `agent_accg_grant_perception` for the
agent. Counts appear there only when `grant_issued` is true. The
perception names `grant_code`, the one reader, and whether the
grant was issued. Grant intents start as `PREPARED`. Provider
silence stays `UNKNOWN_EFFECT`. An acknowledgement of the notify
is not enrollment, not a fact restore, not a tool execution, and
not a second reader. This plane does not open another nested
expiry.

## 4. Deterministic invariants

1. Every table leads with `account_id`. Every tenant index leads
   with `account_id`. Row level security is forced.
2. A null `utc_day`, a null consumer, a null grant code, or a
   null `account_id` is **FULL SCAN REJECTED**.
3. One session nominates one card. The access path is
   `POINT_LOOKUP`. One card grants one reader.
4. The citation card head is immutable. The grant does not rewrite
   it.
5. A successful citation grant is issued only from a `PUBLISHED`
   head whose citation reason is
   `RECEIVED_RECEIPT_CITATION_PUBLISHED`, whose `citation_published`
   is true, and whose next action is `HOLD_CITATION_CARD`, and only
   for the profile's single grant code.
6. `NOT_PUBLISHED` grants store null counts and
   `grant_issued = false`. Silence stores a null lag. A
   `NOT_PUBLISHED` card cannot be granted. Counts are copied only
   when `citation_published` is true.
7. `ACKED` stays an effect observation.
   `AWAITING_CONFIRMATION` stays the key kind.
   `ack_promoted_to_trust` stays false.
8. `inlines_fact_body`, `opens_nested_expiry`, `packet_scan_used`,
   and `executes_tool` stay false. The grant does not execute the
   tool.
9. The reader, the consumer, the grant stewards, and the upstream
   stewards are pairwise distinct.
10. Semantic retrieval may rank profiles. It never issues a grant.
11. The engine does not call a model. Replay is a pure function of
    the citation card head, the consumer id, the reader id, and the
    profile grant code.

## 5. Execution model

```text
approved profile (one allowed_grant_code)
  -> open session (one card budget, one reader)
  -> nominate (account_id, utc_day, consumer_principal_id)
  -> read citation card head by primary key
  -> project GRANTED or NOT_GRANTED
  -> append grant + perception + audit
  -> leave the citation card head unchanged
  -> do not execute the tool
```

Compile kind is `GRANT_PUBLISHED_CITATION` for both grants. The
class on the grant, not a second plane, distinguishes an issued
grant from a refusal. Notify dispatch is a later grant intent and
may remain `UNKNOWN_EFFECT`.

## 6. Lifecycle

1. Draft the profile, name one purpose, one effect code, one
   provider code, one citation code, and one grant code, and add
   one dual-control grant rule.
2. Approve it through `agent_accg_profile_authority`.
3. Export one citation card head per consumer and day. The export
   is a point copy of the citation card, not a packet walk.
4. Open a session and nominate one card key.
5. Grant the profile grant code to one reader. Published cards copy
   the counts and seal `PUBLISHED_CITATION_GRANT_ISSUED`. Other
   cards seal a non-grant with null counts.
6. The agent reads the perception row. A withheld perception has
   no count fields and `grantIssued: false`.
7. Revocation stops a later session from nominating. It does not
   rewrite grants already sealed.
8. This plane does not open another nested expiry. It does not run
   the tool.

## 7. TypeScript contracts

```ts
export type AccountId = string;
export type PrincipalId = string;
export type CitationGrantId = string;
export type UtcDay = string;
export type GrantCode = string;

export type AdmissionClass = "ADMITTED" | "DENIED" | "UNKNOWN_EFFECT";
export type CitationClass = "PUBLISHED" | "NOT_PUBLISHED";
export type CitationReason =
  | "RECEIVED_RECEIPT_CITATION_PUBLISHED"
  | "NOT_RECEIVED_RECEIPT_CANNOT_CITE";
export type CitationNextAction =
  | "HOLD_CITATION_CARD"
  | "STOP_CITATION_CARD"
  | "OMIT_CITATION_CARD";
export type GrantClass = "GRANTED" | "NOT_GRANTED";
export type GrantReason =
  | "PUBLISHED_CITATION_GRANT_ISSUED"
  | "NOT_PUBLISHED_CITATION_CANNOT_GRANT";
export type GrantNextAction =
  | "HOLD_CITATION_GRANT"
  | "STOP_CITATION_GRANT"
  | "OMIT_CITATION_GRANT";
export type EffectObservation = "ACKED" | "UNKNOWN_EFFECT";
export type KeyKind = "AWAITING_CONFIRMATION" | "TRUSTED_ENROLLED";

const GRANT_TOKEN = /^[a-z0-9:_-]{1,64}$/;

export interface CitationCardHead {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly consumerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly admissionClass: AdmissionClass;
  readonly citationClass: CitationClass;
  readonly citationReason: CitationReason;
  readonly citationPublished: boolean;
  readonly sealedCount: number | null;
  readonly deniedCount: number | null;
  readonly unknownEffectCount: number | null;
  readonly lagPublications: number | null;
  readonly maxLagBudget: number;
  readonly effectObservation: EffectObservation;
  readonly attestedKeyKind: KeyKind;
  readonly trustedNextAction: CitationNextAction;
}

export interface CitationGrant {
  readonly accountId: AccountId;
  readonly utcDay: UtcDay;
  readonly citationGrantId: CitationGrantId;
  readonly consumerPrincipalId: PrincipalId;
  readonly readerPrincipalId: PrincipalId;
  readonly purposeCode: string;
  readonly effectCode: string;
  readonly providerCode: string;
  readonly citationCode: string;
  readonly grantCode: GrantCode;
  readonly admissionClass: AdmissionClass;
  readonly citationClass: CitationClass;
  readonly grantClass: GrantClass;
  readonly grantReason: GrantReason;
  readonly citationPublished: boolean;
  readonly grantIssued: boolean;
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
  readonly trustedNextAction: GrantNextAction;
}

export function projectCitationGrant(
  head: CitationCardHead,
  citationGrantId: CitationGrantId,
  readerPrincipalId: PrincipalId,
  grantCode: GrantCode,
): CitationGrant {
  const readerIsDistinct = readerPrincipalId !== head.consumerPrincipalId;
  const shared = {
    accountId: head.accountId,
    utcDay: head.utcDay,
    citationGrantId,
    consumerPrincipalId: head.consumerPrincipalId,
    readerPrincipalId,
    purposeCode: head.purposeCode,
    effectCode: head.effectCode,
    providerCode: head.providerCode,
    citationCode: head.citationCode,
    grantCode,
    admissionClass: head.admissionClass,
    citationClass: head.citationClass,
    citationPublished: head.citationPublished,
    effectObservation: head.effectObservation,
    attestedKeyKind: "AWAITING_CONFIRMATION" as const,
    ackPromotedToTrust: false as const,
    inlinesFactBody: false as const,
    opensNestedExpiry: false as const,
    packetScanUsed: false as const,
    executesTool: false as const,
  };
  const singleGrant = GRANT_TOKEN.test(grantCode);

  if (
    readerIsDistinct &&
    singleGrant &&
    head.citationClass === "PUBLISHED" &&
    head.citationReason === "RECEIVED_RECEIPT_CITATION_PUBLISHED" &&
    head.citationPublished &&
    head.trustedNextAction === "HOLD_CITATION_CARD" &&
    head.admissionClass === "ADMITTED" &&
    head.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    head.sealedCount !== null &&
    head.deniedCount !== null &&
    head.unknownEffectCount !== null
  ) {
    return {
      ...shared,
      grantClass: "GRANTED",
      grantReason: "PUBLISHED_CITATION_GRANT_ISSUED",
      grantIssued: true,
      sealedCount: head.sealedCount,
      deniedCount: head.deniedCount,
      unknownEffectCount: head.unknownEffectCount,
      lagPublications: head.lagPublications,
      trustedNextAction: "HOLD_CITATION_GRANT",
    };
  }

  const omit =
    head.admissionClass === "UNKNOWN_EFFECT" ||
    head.trustedNextAction === "OMIT_CITATION_CARD";

  return {
    ...shared,
    citationPublished: false,
    grantClass: "NOT_GRANTED",
    grantReason: "NOT_PUBLISHED_CITATION_CANNOT_GRANT",
    grantIssued: false,
    sealedCount: null,
    deniedCount: null,
    unknownEffectCount: null,
    lagPublications: omit ? null : head.lagPublications,
    trustedNextAction: omit ? "OMIT_CITATION_GRANT" : "STOP_CITATION_GRANT",
  };
}
```

```ts
export function perceptionOmitsSuccessfulGrant(grant: CitationGrant): boolean {
  return (
    grant.grantIssued === false &&
    grant.grantClass === "NOT_GRANTED" &&
    grant.sealedCount === null &&
    grant.deniedCount === null &&
    grant.unknownEffectCount === null &&
    grant.ackPromotedToTrust === false &&
    grant.attestedKeyKind === "AWAITING_CONFIRMATION" &&
    grant.executesTool === false
  );
}
```

`projectCitationGrant` is the procedural projection an agent runtime
must match. It never returns `TRUSTED_ENROLLED`. It never copies
counts off a card whose `citation_published` is false. It never
executes the tool. A grant token that is not a single code, or a
reader equal to the consumer, projects to `NOT_GRANTED`. The
database additionally requires the token to equal the approved
profile grant code, and rejects a reader who collides with the
consumer or any steward, before it seals `GRANTED`.

## 8. SQL row-store schema

```sql
CREATE TYPE accg_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE accg_session_status AS ENUM ('OPEN', 'SEALED', 'EXPIRED', 'CANCELLED');
CREATE TYPE accg_admission_class AS ENUM ('ADMITTED', 'DENIED', 'UNKNOWN_EFFECT');
CREATE TYPE accg_freshness_class AS ENUM ('CURRENT', 'LAGGING', 'UNKNOWN_EFFECT');
CREATE TYPE accg_receipt_class AS ENUM ('RECEIVED', 'NOT_RECEIVED');
CREATE TYPE accg_citation_class AS ENUM ('PUBLISHED', 'NOT_PUBLISHED');
CREATE TYPE accg_citation_reason AS ENUM (
  'RECEIVED_RECEIPT_CITATION_PUBLISHED',
  'NOT_RECEIVED_RECEIPT_CANNOT_CITE'
);
CREATE TYPE accg_citation_next AS ENUM (
  'HOLD_CITATION_CARD',
  'STOP_CITATION_CARD',
  'OMIT_CITATION_CARD'
);
CREATE TYPE accg_grant_class AS ENUM ('GRANTED', 'NOT_GRANTED');
CREATE TYPE accg_grant_reason AS ENUM (
  'PUBLISHED_CITATION_GRANT_ISSUED',
  'NOT_PUBLISHED_CITATION_CANNOT_GRANT'
);
CREATE TYPE accg_effect_observation AS ENUM ('ACKED', 'UNKNOWN_EFFECT');
CREATE TYPE accg_key_kind AS ENUM ('AWAITING_CONFIRMATION', 'TRUSTED_ENROLLED');
CREATE TYPE accg_fact_disposition AS ENUM ('DISPUTED_HELD', 'RESTORED');
CREATE TYPE accg_body_visibility AS ENUM ('ENVELOPE_ONLY', 'BODY_VISIBLE', 'OMITTED');
CREATE TYPE accg_access_path AS ENUM (
  'POINT_LOOKUP',
  'DAY_SCAN',
  'WATERMARK_SCAN',
  'PACKET_SCAN'
);
CREATE TYPE accg_metadata_trust AS ENUM ('UNTRUSTED_METADATA');
CREATE TYPE accg_intent_status AS ENUM ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT', 'ACKED');
CREATE TYPE accg_compile_kind AS ENUM ('GRANT_PUBLISHED_CITATION');
CREATE TYPE accg_terminal_kind AS ENUM (
  'GRANT_ISSUED',
  'GRANT_REFUSED',
  'SESSION_CLOSED'
);
CREATE TYPE accg_grant_next AS ENUM (
  'HOLD_CITATION_GRANT',
  'STOP_CITATION_GRANT',
  'OMIT_CITATION_GRANT'
);
CREATE TYPE accg_revocation_policy AS ENUM (
  'ALLOW_IN_FLIGHT',
  'STOP_BEFORE_GRANT',
  'REQUIRE_REVIEW'
);

CREATE ROLE agent_accg_profile_authority NOLOGIN;

CREATE TABLE agent_accg_authorization_evidence (
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

CREATE TABLE agent_accg_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status accg_profile_status NOT NULL,
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
  allowed_grant_code TEXT NOT NULL CHECK (allowed_grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_threshold INTEGER NOT NULL CHECK (grant_threshold >= 2),
  max_cards_per_session INTEGER NOT NULL CHECK (max_cards_per_session = 1),
  max_nominated_cards INTEGER NOT NULL CHECK (max_nominated_cards = 1),
  max_readers_per_card INTEGER NOT NULL CHECK (max_readers_per_card = 1),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT NOT NULL,
  revocation_policy accg_revocation_policy NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_accg_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_accg_profile_grant_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  allowed_classes accg_admission_class[] NOT NULL,
  grant_threshold INTEGER NOT NULL CHECK (grant_threshold >= 2),
  max_cards_per_session INTEGER NOT NULL CHECK (max_cards_per_session = 1),
  max_nominated_cards INTEGER NOT NULL CHECK (max_nominated_cards = 1),
  max_readers_per_card INTEGER NOT NULL CHECK (max_readers_per_card = 1),
  require_dual_control_grant BOOLEAN NOT NULL,
  grant_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_accg_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_accg_citation_card_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_card_id UUID NOT NULL,
  provider_receipt_id UUID NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class accg_admission_class NOT NULL,
  receipt_class accg_receipt_class NOT NULL,
  citation_class accg_citation_class NOT NULL,
  citation_reason accg_citation_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  freshness_class accg_freshness_class NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation accg_effect_observation NOT NULL,
  attested_key_kind accg_key_kind NOT NULL,
  fact_disposition accg_fact_disposition NOT NULL,
  body_visibility accg_body_visibility NOT NULL,
  metadata_trust accg_metadata_trust NOT NULL,
  access_path accg_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action accg_citation_next NOT NULL,
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
  citation_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, citation_card_id),
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
  CHECK (NOT (citation_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_accg_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status accg_session_status NOT NULL,
  state_revision INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_nominate_units INTEGER NOT NULL,
  budget_grant_units INTEGER NOT NULL,
  budget_vector_units INTEGER NOT NULL,
  budget_notify_units INTEGER NOT NULL,
  consumed_nominate_units INTEGER NOT NULL,
  consumed_grant_units INTEGER NOT NULL,
  consumed_vector_units INTEGER NOT NULL,
  consumed_notify_units INTEGER NOT NULL,
  budget_max_wall_time_ms INTEGER NOT NULL,
  grant_threshold INTEGER NOT NULL,
  max_cards_per_session INTEGER NOT NULL CHECK (max_cards_per_session = 1),
  max_nominated_cards INTEGER NOT NULL CHECK (max_nominated_cards = 1),
  max_readers_per_card INTEGER NOT NULL CHECK (max_readers_per_card = 1),
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
    REFERENCES agent_accg_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_accg_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_accg_card_nomination (
  account_id BIGINT NOT NULL,
  nomination_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  access_path accg_access_path NOT NULL,
  nomination_hash TEXT NOT NULL CHECK (char_length(nomination_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, nomination_id),
  UNIQUE (account_id, session_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id)
);

CREATE TABLE agent_accg_card_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  citation_card_id UUID NOT NULL,
  admission_class accg_admission_class NOT NULL,
  citation_class accg_citation_class NOT NULL,
  citation_published BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accg_citation_card_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_accg_grant_compile (
  account_id BIGINT NOT NULL,
  compile_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  grant_code TEXT NOT NULL,
  admission_class accg_admission_class NOT NULL,
  grant_class accg_grant_class NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  grant_hash TEXT NOT NULL CHECK (char_length(grant_hash) = 64),
  compiled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compile_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_accg_grant_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  compile_id UUID NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  utc_day DATE NOT NULL,
  grant_code TEXT NOT NULL,
  citation_code TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  grant_hash TEXT NOT NULL CHECK (char_length(grant_hash) = 64),
  admission_class accg_admission_class NOT NULL,
  citation_class accg_citation_class NOT NULL,
  grant_class accg_grant_class NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  grant_steward_a TEXT NOT NULL,
  grant_steward_b TEXT NOT NULL,
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
    REFERENCES agent_accg_session (account_id, session_id),
  FOREIGN KEY (account_id, compile_id)
    REFERENCES agent_accg_grant_compile (account_id, compile_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_accg_grant_decision (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  grant_code TEXT NOT NULL,
  compile_kind accg_compile_kind NOT NULL,
  admission_class accg_admission_class NOT NULL,
  citation_class accg_citation_class NOT NULL,
  grant_class accg_grant_class NOT NULL,
  freshness_class accg_freshness_class NOT NULL,
  effect_observation accg_effect_observation NOT NULL,
  attested_key_kind accg_key_kind NOT NULL,
  fact_disposition accg_fact_disposition NOT NULL,
  body_visibility accg_body_visibility NOT NULL,
  access_path accg_access_path NOT NULL,
  metadata_trust accg_metadata_trust NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  grant_hash TEXT NOT NULL CHECK (char_length(grant_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_accg_grant_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id),
  CHECK (reader_principal_id <> consumer_principal_id)
);

CREATE TABLE agent_accg_citation_grant (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  citation_grant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  citation_card_id UUID NOT NULL,
  reader_principal_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z0-9:_-]{1,64}$'),
  effect_code TEXT NOT NULL CHECK (effect_code ~ '^[a-z0-9:_-]{1,64}$'),
  provider_code TEXT NOT NULL CHECK (provider_code ~ '^[a-z0-9:_-]{1,64}$'),
  citation_code TEXT NOT NULL CHECK (citation_code ~ '^[a-z0-9:_-]{1,64}$'),
  grant_code TEXT NOT NULL CHECK (grant_code ~ '^[a-z0-9:_-]{1,64}$'),
  admission_class accg_admission_class NOT NULL,
  citation_class accg_citation_class NOT NULL,
  grant_class accg_grant_class NOT NULL,
  grant_reason accg_grant_reason NOT NULL,
  citation_published BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  lag_publications BIGINT,
  max_lag_budget INTEGER NOT NULL,
  effect_observation accg_effect_observation NOT NULL,
  attested_key_kind accg_key_kind NOT NULL,
  fact_disposition accg_fact_disposition NOT NULL,
  body_visibility accg_body_visibility NOT NULL,
  metadata_trust accg_metadata_trust NOT NULL,
  access_path accg_access_path NOT NULL,
  inlines_fact_body BOOLEAN NOT NULL,
  opens_nested_expiry BOOLEAN NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  packet_scan_used BOOLEAN NOT NULL,
  executes_tool BOOLEAN NOT NULL,
  trusted_next_action accg_grant_next NOT NULL,
  grant_steward_a TEXT NOT NULL,
  grant_steward_b TEXT NOT NULL,
  grant_body JSONB NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  UNIQUE (account_id, citation_grant_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_accg_grant_certificate (account_id, certificate_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accg_citation_card_head (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
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
  CHECK (NOT (grant_body ? 'factBody')),
  CHECK (NOT (grant_body ? 'fact_body')),
  CHECK (NOT (grant_body ? 'resolvedFactHash')),
  CHECK (
    (grant_issued = true AND grant_class = 'GRANTED'
      AND citation_published = true
      AND trusted_next_action = 'HOLD_CITATION_GRANT'
      AND grant_body ? 'sealedCount'
      AND grant_body ? 'deniedCount'
      AND grant_body ? 'unknownEffectCount')
    OR (grant_issued = false AND grant_class = 'NOT_GRANTED'
      AND citation_published = false
      AND trusted_next_action IN ('STOP_CITATION_GRANT', 'OMIT_CITATION_GRANT')
      AND NOT (grant_body ? 'sealedCount')
      AND NOT (grant_body ? 'deniedCount')
      AND NOT (grant_body ? 'unknownEffectCount'))
  )
);

CREATE TABLE agent_accg_grant_perception (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  consumer_principal_id TEXT NOT NULL,
  reader_principal_id TEXT NOT NULL,
  citation_grant_id UUID NOT NULL,
  grant_code TEXT NOT NULL,
  grant_class accg_grant_class NOT NULL,
  citation_published BOOLEAN NOT NULL,
  grant_issued BOOLEAN NOT NULL,
  sealed_count BIGINT,
  denied_count BIGINT,
  unknown_effect_count BIGINT,
  attested_key_kind accg_key_kind NOT NULL,
  ack_promoted_to_trust BOOLEAN NOT NULL,
  trusted_next_action accg_grant_next NOT NULL,
  perception_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day, consumer_principal_id),
  FOREIGN KEY (account_id, utc_day, consumer_principal_id)
    REFERENCES agent_accg_citation_grant (account_id, utc_day, consumer_principal_id),
  CHECK (reader_principal_id <> consumer_principal_id),
  CHECK (ack_promoted_to_trust = false),
  CHECK (attested_key_kind = 'AWAITING_CONFIRMATION'),
  CHECK (NOT (perception_body ? 'factBody')),
  CHECK (NOT (perception_body ? 'fact_body')),
  CHECK (NOT (perception_body ? 'resolvedFactHash'))
);

CREATE TABLE agent_accg_grant_intent (
  account_id BIGINT NOT NULL,
  grant_intent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  intent_status accg_intent_status NOT NULL,
  grant_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  canonical_request_hash TEXT NOT NULL CHECK (char_length(canonical_request_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, grant_intent_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_accg_grant_certificate (account_id, certificate_id)
);

CREATE TABLE agent_accg_budget_ledger (
  account_id BIGINT NOT NULL,
  ledger_id UUID NOT NULL,
  session_id UUID NOT NULL,
  unit_kind TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id)
);

CREATE TABLE agent_accg_terminal_record (
  account_id BIGINT NOT NULL,
  terminal_id UUID NOT NULL,
  session_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  terminal_kind accg_terminal_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, terminal_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id)
);

CREATE TABLE agent_accg_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID NOT NULL,
  command_kind TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (char_length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id)
);

CREATE TABLE agent_accg_audit_head (
  account_id BIGINT NOT NULL,
  utc_day DATE NOT NULL,
  head_hash TEXT NOT NULL CHECK (char_length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, utc_day)
);

CREATE TABLE agent_accg_audit_event (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  event_kind TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (char_length(event_hash) = 64),
  previous_hash TEXT NOT NULL CHECK (char_length(previous_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE agent_accg_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  anchor_hash TEXT NOT NULL CHECK (char_length(anchor_hash) = 64),
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id)
);

CREATE TABLE agent_accg_projection_checkpoint (
  account_id BIGINT NOT NULL,
  checkpoint_id UUID NOT NULL,
  utc_day DATE NOT NULL,
  session_id UUID NOT NULL,
  checkpoint_hash TEXT NOT NULL CHECK (char_length(checkpoint_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_accg_session (account_id, session_id)
);

CREATE FUNCTION protect_agent_accg_profile()
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
      IF current_setting('app.accg_profile_approval', true) IS DISTINCT FROM concat(
        NEW.profile_id::TEXT, ':', NEW.profile_version::TEXT, ':', NEW.definition_hash
      ) THEN
        RAISE EXCEPTION 'profile approval requires the authority fence';
      END IF;
    ELSIF NEW.status = 'REVOKED' THEN
      IF current_setting('app.accg_profile_revocation', true) IS DISTINCT FROM concat(
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

CREATE TRIGGER agent_accg_profile_protect
BEFORE INSERT OR UPDATE ON agent_accg_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_profile();

CREATE FUNCTION protect_agent_accg_grant_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status accg_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_accg_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed grant rule is immutable';
  END IF;
  RETURN NEW;
END
$protect_rule$;

CREATE TRIGGER agent_accg_grant_rule_protect
BEFORE UPDATE ON agent_accg_profile_grant_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_grant_rule();

CREATE FUNCTION protect_agent_accg_citation_card_head()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_head$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed citation card head is immutable';
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
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP'
     OR NEW.body_visibility IS DISTINCT FROM 'OMITTED'
     OR NEW.fact_disposition IS DISTINCT FROM 'DISPUTED_HELD' THEN
    RAISE EXCEPTION 'fact-body inline fence';
  END IF;

  IF NEW.citation_class = 'PUBLISHED' OR NEW.citation_published THEN
    IF NEW.citation_published IS DISTINCT FROM TRUE
       OR NEW.citation_class IS DISTINCT FROM 'PUBLISHED'
       OR NEW.citation_reason IS DISTINCT FROM 'RECEIVED_RECEIPT_CITATION_PUBLISHED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_CITATION_CARD'
       OR NEW.admission_class IS DISTINCT FROM 'ADMITTED'
       OR NEW.receipt_class IS DISTINCT FROM 'RECEIVED'
       OR NEW.sealed_count IS NULL
       OR NEW.denied_count IS NULL
       OR NEW.unknown_effect_count IS NULL
       OR NEW.lag_publications IS NULL
       OR NEW.lag_publications > NEW.max_lag_budget
       OR NOT (NEW.citation_body ? 'sealedCount') THEN
      RAISE EXCEPTION 'published citation card head must carry the granted counts';
    END IF;
  ELSIF NEW.sealed_count IS NOT NULL
     OR NEW.denied_count IS NOT NULL
     OR NEW.unknown_effect_count IS NOT NULL
     OR NEW.citation_reason IS DISTINCT FROM 'NOT_RECEIVED_RECEIPT_CANNOT_CITE'
     OR NEW.citation_class IS DISTINCT FROM 'NOT_PUBLISHED'
     OR NEW.citation_published
     OR NEW.receipt_class IS DISTINCT FROM 'NOT_RECEIVED'
     OR NEW.citation_body ? 'sealedCount' THEN
    RAISE EXCEPTION 'not published citation card head cannot carry a grant';
  ELSIF NEW.admission_class = 'UNKNOWN_EFFECT' THEN
    IF NEW.lag_publications IS NOT NULL
       OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_CITATION_CARD' THEN
      RAISE EXCEPTION 'silence is not a granted citation card';
    END IF;
  ELSIF NEW.admission_class = 'DENIED' THEN
    IF NEW.lag_publications IS NULL
       OR NEW.lag_publications <= NEW.max_lag_budget
       OR NEW.trusted_next_action IS DISTINCT FROM 'STOP_CITATION_CARD' THEN
      RAISE EXCEPTION 'denied citation card head must sit above the lag budget';
    END IF;
  ELSE
    RAISE EXCEPTION 'citation card head class is not grantable';
  END IF;

  RETURN NEW;
END
$protect_head$;

CREATE TRIGGER agent_accg_citation_card_head_protect
BEFORE INSERT OR UPDATE ON agent_accg_citation_card_head
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_citation_card_head();

CREATE FUNCTION protect_agent_accg_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_decision$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.decision_id IS DISTINCT FROM NEW.decision_id
       OR OLD.grant_hash IS DISTINCT FROM NEW.grant_hash
       OR OLD.utc_day IS DISTINCT FROM NEW.utc_day
       OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'citation grant decision identity is immutable';
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

  IF NEW.grant_class = 'GRANTED' AND NEW.grant_issued IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'granted citation must copy the published counts';
  END IF;

  IF NEW.grant_class = 'NOT_GRANTED' AND NEW.grant_issued THEN
    RAISE EXCEPTION 'not published citation cannot be granted';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'reader must be distinct from the consumer';
  END IF;

  RETURN NEW;
END
$protect_decision$;

CREATE TRIGGER agent_accg_decision_protect
BEFORE INSERT OR UPDATE ON agent_accg_grant_decision
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_decision();

CREATE FUNCTION protect_agent_accg_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF NEW.grant_steward_a = NEW.grant_steward_b
     OR NEW.reader_principal_id = NEW.consumer_principal_id
     OR NEW.consumer_principal_id IN (NEW.grant_steward_a, NEW.grant_steward_b)
     OR NEW.reader_principal_id IN (
       NEW.grant_steward_a, NEW.grant_steward_b,
       NEW.citation_steward_a, NEW.citation_steward_b,
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
     OR NEW.grant_steward_a IN (
       NEW.citation_steward_a, NEW.citation_steward_b,
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
     OR NEW.grant_steward_b IN (
       NEW.citation_steward_a, NEW.citation_steward_b,
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
       NEW.citation_steward_a, NEW.citation_steward_b,
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
     OR NEW.citation_steward_a = NEW.citation_steward_b
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

CREATE TRIGGER agent_accg_certificate_protect
BEFORE INSERT OR UPDATE ON agent_accg_grant_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_certificate();

CREATE FUNCTION protect_agent_accg_grant_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_intent$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'grant intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.grant_idempotency_key IS DISTINCT FROM NEW.grant_idempotency_key
     OR OLD.certificate_id IS DISTINCT FROM NEW.certificate_id THEN
    RAISE EXCEPTION 'prepared grant identity is immutable';
  END IF;
  RETURN NEW;
END
$protect_intent$;

CREATE TRIGGER agent_accg_grant_intent_protect
BEFORE INSERT OR UPDATE ON agent_accg_grant_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_grant_intent();

CREATE FUNCTION protect_agent_accg_citation_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_grant$
DECLARE
  v_head agent_accg_citation_card_head%ROWTYPE;
  v_effect TEXT;
  v_purpose TEXT;
  v_provider TEXT;
  v_citation TEXT;
  v_grant TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed citation grant is immutable';
  END IF;

  IF NEW.inlines_fact_body
     OR NEW.ack_promoted_to_trust
     OR NEW.opens_nested_expiry
     OR NEW.packet_scan_used
     OR NEW.executes_tool
     OR NEW.grant_body ? 'factBody'
     OR NEW.grant_body ? 'fact_body'
     OR NEW.grant_body ? 'resolvedFactHash'
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.access_path IS DISTINCT FROM 'POINT_LOOKUP' THEN
    RAISE EXCEPTION 'citation grant fence';
  END IF;

  IF NEW.grant_code IS NULL OR NEW.grant_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT * INTO v_head
  FROM agent_accg_citation_card_head
  WHERE account_id = NEW.account_id
    AND utc_day = NEW.utc_day
    AND consumer_principal_id = NEW.consumer_principal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'citation card head point lookup missed';
  END IF;

  IF NEW.reader_principal_id = NEW.consumer_principal_id
     OR NEW.reader_principal_id IN (
       NEW.grant_steward_a, NEW.grant_steward_b,
       v_head.citation_steward_a, v_head.citation_steward_b,
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
     OR NEW.grant_steward_a = NEW.grant_steward_b
     OR NEW.consumer_principal_id IN (NEW.grant_steward_a, NEW.grant_steward_b)
     OR NEW.grant_steward_a IN (
       v_head.citation_steward_a, v_head.citation_steward_b,
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
     OR NEW.grant_steward_b IN (
       v_head.citation_steward_a, v_head.citation_steward_b,
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

  IF NEW.grant_class = 'GRANTED' OR NEW.grant_issued THEN
    IF v_head.citation_class IS DISTINCT FROM 'PUBLISHED'
       OR v_head.citation_published IS DISTINCT FROM TRUE
       OR v_head.citation_reason IS DISTINCT FROM 'RECEIVED_RECEIPT_CITATION_PUBLISHED'
       OR v_head.trusted_next_action IS DISTINCT FROM 'HOLD_CITATION_CARD' THEN
      RAISE EXCEPTION 'not published citation cannot be granted';
    END IF;
    IF NEW.sealed_count IS DISTINCT FROM v_head.sealed_count
       OR NEW.denied_count IS DISTINCT FROM v_head.denied_count
       OR NEW.unknown_effect_count IS DISTINCT FROM v_head.unknown_effect_count
       OR NEW.grant_reason IS DISTINCT FROM 'PUBLISHED_CITATION_GRANT_ISSUED'
       OR NEW.trusted_next_action IS DISTINCT FROM 'HOLD_CITATION_GRANT'
       OR NEW.citation_card_id IS DISTINCT FROM v_head.citation_card_id
       OR NEW.citation_published IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'granted citation must copy the published counts';
    END IF;
  ELSE
    IF v_head.citation_class IS DISTINCT FROM 'NOT_PUBLISHED' OR v_head.citation_published THEN
      RAISE EXCEPTION 'published citation must grant the copied counts';
    END IF;
    IF NEW.sealed_count IS NOT NULL
       OR NEW.denied_count IS NOT NULL
       OR NEW.unknown_effect_count IS NOT NULL
       OR NEW.grant_body ? 'sealedCount'
       OR NEW.grant_issued
       OR NEW.citation_published
       OR NEW.grant_reason IS DISTINCT FROM 'NOT_PUBLISHED_CITATION_CANNOT_GRANT' THEN
      RAISE EXCEPTION 'not published citation cannot be granted';
    END IF;
    IF v_head.trusted_next_action = 'OMIT_CITATION_CARD' THEN
      IF NEW.lag_publications IS NOT NULL
         OR NEW.trusted_next_action IS DISTINCT FROM 'OMIT_CITATION_GRANT' THEN
        RAISE EXCEPTION 'silence cannot grant a citation card';
      END IF;
    ELSIF NEW.trusted_next_action IS DISTINCT FROM 'STOP_CITATION_GRANT'
       OR NEW.lag_publications IS DISTINCT FROM v_head.lag_publications THEN
      RAISE EXCEPTION 'refused grant must keep the denied lag';
    END IF;
  END IF;

  SELECT p.allowed_effect_code, p.allowed_purpose, p.allowed_provider_code,
         p.allowed_citation_code, p.allowed_grant_code
    INTO v_effect, v_purpose, v_provider, v_citation, v_grant
  FROM agent_accg_session AS s
  JOIN agent_accg_profile AS p
    ON p.account_id = s.account_id
   AND p.profile_id = s.profile_id
   AND p.profile_version = s.profile_version
  WHERE s.account_id = NEW.account_id
    AND s.session_id = NEW.session_id;

  IF v_grant IS NULL
     OR NEW.grant_code IS DISTINCT FROM v_grant
     OR NEW.citation_code IS DISTINCT FROM v_citation
     OR NEW.provider_code IS DISTINCT FROM v_provider
     OR NEW.effect_code IS DISTINCT FROM v_effect
     OR NEW.purpose_code IS DISTINCT FROM v_purpose
     OR NEW.effect_code IS DISTINCT FROM v_head.effect_code
     OR NEW.purpose_code IS DISTINCT FROM v_head.purpose_code
     OR NEW.provider_code IS DISTINCT FROM v_head.provider_code
     OR NEW.citation_code IS DISTINCT FROM v_head.citation_code THEN
    RAISE EXCEPTION 'grant code is not the profile grant';
  END IF;

  RETURN NEW;
END
$protect_grant$;

CREATE TRIGGER agent_accg_citation_grant_protect
BEFORE INSERT OR UPDATE ON agent_accg_citation_grant
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_citation_grant();

CREATE FUNCTION protect_agent_accg_perception()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_perception$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'sealed grant perception is immutable';
  END IF;

  IF NEW.ack_promoted_to_trust
     OR NEW.attested_key_kind IS DISTINCT FROM 'AWAITING_CONFIRMATION'
     OR NEW.perception_body ? 'factBody'
     OR NEW.perception_body ? 'fact_body'
     OR NEW.perception_body ? 'resolvedFactHash'
     OR NEW.reader_principal_id = NEW.consumer_principal_id THEN
    RAISE EXCEPTION 'perception fence';
  END IF;

  IF NEW.grant_class = 'NOT_GRANTED'
     AND (NEW.grant_issued
          OR NEW.citation_published
          OR NEW.sealed_count IS NOT NULL
          OR NEW.denied_count IS NOT NULL
          OR NEW.unknown_effect_count IS NOT NULL
          OR NEW.perception_body ? 'sealedCount') THEN
    RAISE EXCEPTION 'not granted perception cannot carry counts';
  END IF;

  RETURN NEW;
END
$protect_perception$;

CREATE TRIGGER agent_accg_perception_protect
BEFORE INSERT OR UPDATE ON agent_accg_grant_perception
FOR EACH ROW EXECUTE FUNCTION protect_agent_accg_perception();

CREATE FUNCTION approve_agent_accg_profile(
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
  stored_status accg_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_accg_profile
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
  FROM agent_accg_profile_grant_rule
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version
    AND require_dual_control_grant IS TRUE;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one dual-control grant rule';
  END IF;

  PERFORM set_config(
    'app.accg_profile_approval',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_accg_profile
  SET status = 'APPROVED',
      approved_by = p_approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = p_definition_hash
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_accg_profile(
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
  stored_status accg_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_accg_profile
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
    'app.accg_profile_revocation',
    concat(p_profile_id::TEXT, ':', p_profile_version::TEXT, ':', p_definition_hash),
    true
  );

  UPDATE agent_accg_profile
  SET status = 'REVOKED',
      revoked_by = p_revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND profile_id = p_profile_id
    AND profile_version = p_profile_version;
END
$revoke$;

CREATE FUNCTION nominate_agent_accg_card(
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
  v_session_status accg_session_status;
  v_profile_status accg_profile_status;
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
    FROM agent_accg_card_nomination
    WHERE account_id = p_tenant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'one card per session';
  END IF;

  SELECT s.status, pr.status, s.principal_id
    INTO v_session_status, v_profile_status, v_principal
  FROM agent_accg_session AS s
  JOIN agent_accg_profile AS pr
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

  INSERT INTO agent_accg_card_nomination (
    account_id, nomination_id, session_id, utc_day, consumer_principal_id,
    access_path, nomination_hash, created_at
  ) VALUES (
    p_tenant_id, p_nomination_id, p_session_id, p_utc_day, p_consumer_principal,
    'POINT_LOOKUP', p_nomination_hash, clock_timestamp()
  );
END
$nominate$;

CREATE FUNCTION grant_agent_accg_citation(
  p_tenant_id BIGINT,
  p_session_id UUID,
  p_utc_day DATE,
  p_consumer_principal TEXT,
  p_reader_principal TEXT,
  p_grant_code TEXT,
  p_compile_id UUID,
  p_certificate_id UUID,
  p_decision_id UUID,
  p_grant_id UUID,
  p_grant_digest TEXT,
  p_grant_steward_a TEXT,
  p_grant_steward_b TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $grant_citation$
DECLARE
  v_nominated_day DATE;
  v_nominated_consumer TEXT;
  v_session_status accg_session_status;
  v_profile_status accg_profile_status;
  v_allowed_purpose TEXT;
  v_allowed_effect TEXT;
  v_allowed_provider TEXT;
  v_allowed_citation TEXT;
  v_allowed_grant TEXT;
  v_principal TEXT;
  v_head agent_accg_citation_card_head%ROWTYPE;
  v_class accg_grant_class;
  v_reason accg_grant_reason;
  v_issued BOOLEAN;
  v_published BOOLEAN;
  v_sealed BIGINT;
  v_denied BIGINT;
  v_unknown BIGINT;
  v_lag BIGINT;
  v_next accg_grant_next;
  v_terminal accg_terminal_kind;
  v_body JSONB;
BEGIN
  IF p_utc_day IS NULL
     OR p_tenant_id IS NULL
     OR p_consumer_principal IS NULL
     OR p_reader_principal IS NULL
     OR p_grant_code IS NULL THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  IF char_length(p_grant_digest) <> 64 THEN
    RAISE EXCEPTION 'grant digest must be 64 hex characters';
  END IF;

  IF p_grant_code !~ '^[a-z0-9:_-]{1,64}$' THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;

  SELECT utc_day, consumer_principal_id
    INTO v_nominated_day, v_nominated_consumer
  FROM agent_accg_card_nomination
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;

  IF v_nominated_day IS DISTINCT FROM p_utc_day
     OR v_nominated_consumer IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'citation grant requires a nominated card point lookup';
  END IF;

  SELECT s.status, pr.status, pr.allowed_purpose, pr.allowed_effect_code,
         pr.allowed_provider_code, pr.allowed_citation_code, pr.allowed_grant_code,
         s.principal_id
    INTO v_session_status, v_profile_status, v_allowed_purpose, v_allowed_effect,
         v_allowed_provider, v_allowed_citation, v_allowed_grant, v_principal
  FROM agent_accg_session AS s
  JOIN agent_accg_profile AS pr
    ON pr.account_id = s.account_id
   AND pr.profile_id = s.profile_id
   AND pr.profile_version = s.profile_version
  WHERE s.account_id = p_tenant_id
    AND s.session_id = p_session_id;

  IF v_session_status IS DISTINCT FROM 'OPEN'
     OR v_profile_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'grant requires an open session on an approved profile';
  END IF;

  IF v_principal IS DISTINCT FROM p_consumer_principal THEN
    RAISE EXCEPTION 'consumer must match the session principal';
  END IF;

  IF p_grant_code IS DISTINCT FROM v_allowed_grant THEN
    RAISE EXCEPTION 'grant code is not the profile grant';
  END IF;

  SELECT * INTO v_head
  FROM agent_accg_citation_card_head
  WHERE account_id = p_tenant_id
    AND utc_day = p_utc_day
    AND consumer_principal_id = p_consumer_principal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'citation card head point lookup missed';
  END IF;

  IF v_head.purpose_code IS DISTINCT FROM v_allowed_purpose
     OR v_head.effect_code IS DISTINCT FROM v_allowed_effect
     OR v_head.provider_code IS DISTINCT FROM v_allowed_provider
     OR v_head.citation_code IS DISTINCT FROM v_allowed_citation THEN
    RAISE EXCEPTION 'citation code is not the profile citation';
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
     OR v_head.citation_body ? 'factBody'
     OR v_head.citation_body ? 'fact_body'
     OR v_head.citation_body ? 'resolvedFactHash' THEN
    RAISE EXCEPTION 'citation grant fence';
  END IF;

  IF p_reader_principal = p_consumer_principal
     OR p_grant_steward_a = p_grant_steward_b
     OR p_consumer_principal IN (p_grant_steward_a, p_grant_steward_b)
     OR p_reader_principal IN (
       p_grant_steward_a, p_grant_steward_b,
       v_head.citation_steward_a, v_head.citation_steward_b,
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
     OR p_grant_steward_a IN (
       v_head.citation_steward_a, v_head.citation_steward_b,
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
     OR p_grant_steward_b IN (
       v_head.citation_steward_a, v_head.citation_steward_b,
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
       v_head.citation_steward_a, v_head.citation_steward_b,
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
    RAISE EXCEPTION 'reader must be distinct from the consumer and every steward';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_accg_citation_grant
    WHERE account_id = p_tenant_id
      AND utc_day = p_utc_day
      AND consumer_principal_id = p_consumer_principal
  ) THEN
    RAISE EXCEPTION 'citation grant already issued';
  END IF;

  IF v_head.citation_class = 'PUBLISHED'
     AND v_head.citation_reason = 'RECEIVED_RECEIPT_CITATION_PUBLISHED'
     AND v_head.citation_published
     AND v_head.trusted_next_action = 'HOLD_CITATION_CARD'
     AND v_head.admission_class = 'ADMITTED'
     AND v_head.receipt_class = 'RECEIVED' THEN
    v_class := 'GRANTED';
    v_reason := 'PUBLISHED_CITATION_GRANT_ISSUED';
    v_issued := true;
    v_published := true;
    v_sealed := v_head.sealed_count;
    v_denied := v_head.denied_count;
    v_unknown := v_head.unknown_effect_count;
    v_lag := v_head.lag_publications;
    v_next := 'HOLD_CITATION_GRANT';
    v_terminal := 'GRANT_ISSUED';
  ELSIF v_head.admission_class = 'UNKNOWN_EFFECT'
     OR v_head.trusted_next_action = 'OMIT_CITATION_CARD' THEN
    v_class := 'NOT_GRANTED';
    v_reason := 'NOT_PUBLISHED_CITATION_CANNOT_GRANT';
    v_issued := false;
    v_published := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := NULL;
    v_next := 'OMIT_CITATION_GRANT';
    v_terminal := 'GRANT_REFUSED';
  ELSE
    v_class := 'NOT_GRANTED';
    v_reason := 'NOT_PUBLISHED_CITATION_CANNOT_GRANT';
    v_issued := false;
    v_published := false;
    v_sealed := NULL;
    v_denied := NULL;
    v_unknown := NULL;
    v_lag := v_head.lag_publications;
    v_next := 'STOP_CITATION_GRANT';
    v_terminal := 'GRANT_REFUSED';
  END IF;

  v_body := jsonb_build_object(
    'utcDay', p_utc_day,
    'consumerPrincipalId', p_consumer_principal,
    'readerPrincipalId', p_reader_principal,
    'purposeCode', v_head.purpose_code,
    'effectCode', v_head.effect_code,
    'providerCode', v_head.provider_code,
    'citationCode', v_head.citation_code,
    'grantCode', p_grant_code,
    'admissionClass', v_head.admission_class,
    'citationClass', v_head.citation_class,
    'grantClass', v_class,
    'grantReason', v_reason,
    'citationPublished', v_published,
    'grantIssued', v_issued,
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
  IF v_issued THEN
    v_body := v_body || jsonb_build_object(
      'sealedCount', v_sealed,
      'deniedCount', v_denied,
      'unknownEffectCount', v_unknown
    );
  END IF;

  INSERT INTO agent_accg_card_binding (
    account_id, binding_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, citation_card_id, admission_class, citation_class,
    citation_published, bound_at, created_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, v_head.citation_card_id, v_head.admission_class,
    v_head.citation_class, v_head.citation_published, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accg_grant_compile (
    account_id, compile_id, session_id, utc_day, consumer_principal_id,
    reader_principal_id, grant_code, admission_class, grant_class, grant_issued,
    grant_hash, compiled_at
  ) VALUES (
    p_tenant_id, p_compile_id, p_session_id, p_utc_day, p_consumer_principal,
    p_reader_principal, p_grant_code, v_head.admission_class, v_class, v_issued,
    p_grant_digest, clock_timestamp()
  );

  INSERT INTO agent_accg_grant_certificate (
    account_id, certificate_id, session_id, compile_id, consumer_principal_id,
    reader_principal_id, utc_day, grant_code, citation_code, provider_code, grant_hash,
    admission_class, citation_class, grant_class, grant_issued,
    grant_steward_a, grant_steward_b,
    citation_steward_a, citation_steward_b,
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
    p_reader_principal, p_utc_day, p_grant_code, v_head.citation_code, v_head.provider_code,
    p_grant_digest, v_head.admission_class, v_head.citation_class, v_class, v_issued,
    p_grant_steward_a, p_grant_steward_b,
    v_head.citation_steward_a, v_head.citation_steward_b,
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

  INSERT INTO agent_accg_grant_decision (
    account_id, decision_id, certificate_id, session_id, utc_day,
    consumer_principal_id, reader_principal_id, grant_code, compile_kind,
    admission_class, citation_class, grant_class, freshness_class, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, access_path, metadata_trust,
    opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust, packet_scan_used,
    grant_issued, executes_tool, lag_publications, max_lag_budget, grant_hash,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_certificate_id, p_session_id, p_utc_day,
    p_consumer_principal, p_reader_principal, p_grant_code, 'GRANT_PUBLISHED_CITATION',
    v_head.admission_class, v_head.citation_class, v_class, v_head.freshness_class,
    v_head.effect_observation, 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
    v_issued, false, v_lag, v_head.max_lag_budget, p_grant_digest,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accg_citation_grant (
    account_id, utc_day, consumer_principal_id, citation_grant_id, session_id,
    certificate_id, citation_card_id, reader_principal_id, purpose_code, effect_code,
    provider_code, citation_code, grant_code, admission_class, citation_class, grant_class,
    grant_reason, citation_published, grant_issued, sealed_count, denied_count,
    unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
    attested_key_kind, fact_disposition, body_visibility, metadata_trust, access_path,
    inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
    executes_tool, trusted_next_action, grant_steward_a, grant_steward_b, grant_body,
    sealed_at, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_grant_id, p_session_id,
    p_certificate_id, v_head.citation_card_id, p_reader_principal, v_head.purpose_code,
    v_head.effect_code, v_head.provider_code, v_head.citation_code, p_grant_code,
    v_head.admission_class, v_head.citation_class, v_class, v_reason, v_published, v_issued,
    v_sealed, v_denied, v_unknown, v_lag, v_head.max_lag_budget, v_head.effect_observation,
    'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
    false, false, false, false, false, v_next, p_grant_steward_a, p_grant_steward_b, v_body,
    clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accg_grant_perception (
    account_id, utc_day, consumer_principal_id, reader_principal_id, citation_grant_id,
    grant_code, grant_class, citation_published, grant_issued, sealed_count, denied_count,
    unknown_effect_count, attested_key_kind, ack_promoted_to_trust, trusted_next_action,
    perception_body, created_at
  ) VALUES (
    p_tenant_id, p_utc_day, p_consumer_principal, p_reader_principal, p_grant_id,
    p_grant_code, v_class, v_published, v_issued, v_sealed, v_denied, v_unknown,
    'AWAITING_CONFIRMATION', false, v_next, v_body, clock_timestamp()
  );

  INSERT INTO agent_accg_grant_intent (
    account_id, grant_intent_id, session_id, certificate_id, intent_status,
    grant_idempotency_key, generation, canonical_request_hash, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_grant_id, p_session_id, p_certificate_id, 'PREPARED',
    p_grant_id::TEXT, 1, p_grant_digest, clock_timestamp(), clock_timestamp()
  );

  INSERT INTO agent_accg_budget_ledger (
    account_id, ledger_id, session_id, unit_kind, units, created_at
  ) VALUES (
    p_tenant_id, p_grant_id, p_session_id, 'GRANT', 1, clock_timestamp()
  );

  INSERT INTO agent_accg_terminal_record (
    account_id, terminal_id, session_id, utc_day, terminal_kind, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_session_id, p_utc_day, v_terminal, clock_timestamp()
  );

  INSERT INTO agent_accg_audit_event (
    account_id, event_id, utc_day, event_kind, event_hash, previous_hash, created_at
  ) VALUES (
    p_tenant_id, p_decision_id, p_utc_day, 'CITATION_GRANT_SEALED',
    p_grant_digest, repeat('0', 64), clock_timestamp()
  );

  UPDATE agent_accg_session
  SET consumed_grant_units = consumed_grant_units + 1,
      state_revision = state_revision + 1,
      updated_at = clock_timestamp()
  WHERE account_id = p_tenant_id
    AND session_id = p_session_id;
END
$grant_citation$;

CREATE FUNCTION reject_agent_accg_unscoped_scan(
  has_account BOOLEAN,
  has_card_key BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $reject_scan$
BEGIN
  IF has_account IS DISTINCT FROM TRUE OR has_card_key IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FULL SCAN REJECTED';
  END IF;
END
$reject_scan$;

ALTER FUNCTION approve_agent_accg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_accg_profile_authority;
ALTER FUNCTION revoke_agent_accg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_accg_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_accg_profile_authority;
GRANT SELECT ON
  agent_accg_profile,
  agent_accg_profile_grant_rule
TO agent_accg_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_accg_profile TO agent_accg_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_accg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_accg_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_accg_profile FROM PUBLIC;

CREATE INDEX agent_accg_session_work_idx ON agent_accg_session (
  account_id,
  status
);
CREATE INDEX agent_accg_session_profile_idx ON agent_accg_session (
  account_id,
  profile_id,
  profile_version
);
CREATE INDEX agent_accg_head_consumer_idx ON agent_accg_citation_card_head (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_accg_nomination_session_idx ON agent_accg_card_nomination (
  account_id,
  session_id
);
CREATE INDEX agent_accg_certificate_session_idx ON agent_accg_grant_certificate (
  account_id,
  session_id
);
CREATE INDEX agent_accg_decision_cert_idx ON agent_accg_grant_decision (
  account_id,
  certificate_id
);
CREATE INDEX agent_accg_grant_consumer_idx ON agent_accg_citation_grant (
  account_id,
  utc_day,
  consumer_principal_id
);
CREATE INDEX agent_accg_grant_reader_idx ON agent_accg_citation_grant (
  account_id,
  reader_principal_id
);
CREATE INDEX agent_accg_perception_day_idx ON agent_accg_grant_perception (
  account_id,
  utc_day
);
CREATE INDEX agent_accg_intent_work_idx ON agent_accg_grant_intent (
  account_id,
  intent_status
);
CREATE INDEX agent_accg_audit_time_idx ON agent_accg_audit_event (
  account_id,
  utc_day
);
CREATE INDEX agent_accg_command_expiry_idx ON agent_accg_command_result (
  account_id,
  expires_at
);
CREATE INDEX agent_accg_checkpoint_day_idx ON agent_accg_projection_checkpoint (
  account_id,
  utc_day
);
CREATE INDEX agent_accg_binding_day_idx ON agent_accg_card_binding (
  account_id,
  utc_day
);

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_accg_authorization_evidence',
    'agent_accg_profile',
    'agent_accg_profile_grant_rule',
    'agent_accg_citation_card_head',
    'agent_accg_session',
    'agent_accg_card_nomination',
    'agent_accg_card_binding',
    'agent_accg_grant_compile',
    'agent_accg_grant_certificate',
    'agent_accg_grant_decision',
    'agent_accg_citation_grant',
    'agent_accg_grant_perception',
    'agent_accg_grant_intent',
    'agent_accg_budget_ledger',
    'agent_accg_terminal_record',
    'agent_accg_command_result',
    'agent_accg_audit_head',
    'agent_accg_audit_event',
    'agent_accg_audit_anchor',
    'agent_accg_projection_checkpoint'
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

Direct inserts that skip the grant function still pass through the
triggers. A successful grant on a `NOT_PUBLISHED` card, a trusted
key, a packet scan, a fact body, a tool execution flag, or a nested
expiry flag is rejected. The citation card head cannot be updated
to launder a refused card into a reader grant.

## 9. Open API GraphQL contract

```graphql
scalar JSON

enum AccgAdmissionClass {
  ADMITTED
  DENIED
  UNKNOWN_EFFECT
}

enum AccgCitationClass {
  PUBLISHED
  NOT_PUBLISHED
}

enum AccgGrantClass {
  GRANTED
  NOT_GRANTED
}

enum AccgGrantReason {
  PUBLISHED_CITATION_GRANT_ISSUED
  NOT_PUBLISHED_CITATION_CANNOT_GRANT
}

enum AccgNextAction {
  HOLD_CITATION_GRANT
  STOP_CITATION_GRANT
  OMIT_CITATION_GRANT
}

enum AccgKeyKind {
  AWAITING_CONFIRMATION
  TRUSTED_ENROLLED
}

type AccgProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  status: String!
  allowedPurpose: String!
  allowedEffectCode: String!
  allowedProviderCode: String!
  allowedCitationCode: String!
  allowedGrantCode: String!
  procedureRef: String!
}

type AccgSession {
  accountId: ID!
  sessionId: ID!
  status: String!
  maxReadersPerCard: Int!
}

type AccgCitationCardHead {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  citationClass: AccgCitationClass!
  citationPublished: Boolean!
  attestedKeyKind: AccgKeyKind!
}

type AccgCitationGrant {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  citationGrantId: ID!
  purposeCode: String!
  effectCode: String!
  providerCode: String!
  citationCode: String!
  grantCode: String!
  admissionClass: AccgAdmissionClass!
  citationClass: AccgCitationClass!
  grantClass: AccgGrantClass!
  grantReason: AccgGrantReason!
  citationPublished: Boolean!
  grantIssued: Boolean!
  sealedCount: Int
  deniedCount: Int
  unknownEffectCount: Int
  attestedKeyKind: AccgKeyKind!
  ackPromotedToTrust: Boolean!
  executesTool: Boolean!
  trustedNextAction: AccgNextAction!
}

type AccgGrantPerception {
  accountId: ID!
  utcDay: String!
  consumerPrincipalId: ID!
  readerPrincipalId: ID!
  grantCode: String!
  grantIssued: Boolean!
  perceptionBody: JSON!
}

type AccgAuditEvent {
  accountId: ID!
  eventId: ID!
  utcDay: String!
  eventKind: String!
  eventHash: String!
}

type Query {
  agentAccgProfile(accountId: ID!, profileId: ID!, profileVersion: Int!): AccgProfile
  agentAccgSession(accountId: ID!, sessionId: ID!): AccgSession
  agentAccgCitationCardHead(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AccgCitationCardHead
  agentAccgCitationGrant(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AccgCitationGrant
  agentAccgGrantPerception(
    accountId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): AccgGrantPerception
  agentAccgAuditEvents(accountId: ID!, utcDay: String!): [AccgAuditEvent!]!
}

type Mutation {
  createAgentAccgProfile(accountId: ID!, profileId: ID!, definitionHash: String!): AccgProfile!
  approveAgentAccgProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AccgProfile!
  revokeAgentAccgProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: String!
  ): AccgProfile!
  openAgentAccgSession(accountId: ID!, sessionId: ID!, profileId: ID!): AccgSession!
  nominateAgentAccgCard(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
  ): Boolean!
  grantAgentAccgCitation(
    accountId: ID!
    sessionId: ID!
    utcDay: String!
    consumerPrincipalId: ID!
    readerPrincipalId: ID!
    grantCode: String!
  ): AccgCitationGrant!
  appendAgentAccgGrantIntent(
    accountId: ID!
    sessionId: ID!
    certificateId: ID!
    idempotencyKey: String!
  ): Boolean!
  anchorAgentAccgAudit(accountId: ID!, utcDay: String!, anchorHash: String!): Boolean!
}
```

Every read takes `accountId`. Card and grant reads also take a
non-null `utcDay` and `consumerPrincipalId`. The schema has no
list-all-readers field and no field that executes a tool.
Resolvers must call `reject_agent_accg_unscoped_scan` before
planning when either the account or the card key is missing. A
grant read is one primary-key lookup. It does not join a packet
catalog.

## 10. Procedural memory

The approved profile is the instruction the database will follow.
`procedure_ref` is `proc:admitted-count-citation-grant`. The
instruction payload on the grant rule is deterministic JSON:

- point-look up one citation card by
  `(account_id, utc_day, consumer_principal_id)`;
- grant the single `allowed_grant_code` to exactly one reader only
  when `citation_published` is true, the citation reason is
  `RECEIVED_RECEIPT_CITATION_PUBLISHED`, and the next action is
  `HOLD_CITATION_CARD`;
- otherwise seal `NOT_PUBLISHED_CITATION_CANNOT_GRANT` with null
  counts;
- never execute the tool inside the grant;
- never inline a fact body;
- never promote `ACKED` to `TRUSTED_ENROLLED`;
- never scan context packets;
- never open another nested expiry.

An agent may quote `procedure_ref`, the profile version, the one
grant code, and the one reader. It may not rewrite the instruction
by chatting with the engine. Changing the grant code is a new
profile version that stays `DRAFT` until the authority fence
approves it.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses pgvector. The embedding row is
account-scoped and stores the approved definition hash, which
covers the single grant code. Queries must filter `account_id`
before topK. A global ANN index would mix tenants and is rejected.
The reference schema does not build an HNSW index.

```sql
CREATE TABLE agent_accg_profile_embedding (
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
    REFERENCES agent_accg_profile (account_id, profile_id, profile_version)
);

ALTER TABLE agent_accg_profile_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_accg_profile_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_accg_profile_embedding
  USING (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT)
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), '')::BIGINT);
```

An HNSW hit returns a profile id. The caller still opens a
session, nominates one card, and grants that profile's one grant
code to one reader under dual control. Similarity never issues a
grant and never restores a fact.

## 12. Agent perception

The agent reads `agent_accg_grant_perception`, not the steward
columns on the citation card head.

Metadata tags on a granted perception:

- `grain:account_id,utc_day,consumer_principal_id`
- `grantClass:GRANTED`
- `grantCode:<the one profile grant>`
- `readerPrincipalId:<the one reader>`
- `grantIssued:true`
- `citationPublished:true`
- `executesTool:false`
- `attestedKeyKind:AWAITING_CONFIRMATION`
- `ackPromotedToTrust:false`
- `accessPath:POINT_LOOKUP`
- `next:HOLD_CITATION_GRANT`

`HOLD_CITATION_GRANT` tells the agent which reader received the
three counts. The database has not called the provider and has not
called the tool. The hold does not open another nested expiry. The
agent must not fan the grant out to a second reader, other days,
or a board scan.

A `NOT_GRANTED` perception omits `sealedCount`, `deniedCount`, and
`unknownEffectCount`. Tags are `grantIssued:false` and either
`next:STOP_CITATION_GRANT` or `next:OMIT_CITATION_GRANT`. The agent
must treat those tags as absence of a grant. It must not fill the
counts from memory, from a packet, or from a model.

## 13. ACID and consistency

The grant function writes the binding, compile, certificate,
decision, grant, perception, intent, ledger, terminal, and audit
event in one transaction. The citation card head is read and not
updated. A crash before commit leaves no grant. A commit is the
only durable record of the citation grant.

Consistency choice: the grant is sealed at the card's counts. It
does not wait for a later columnar refresh and it does not
recompute the counts. Stale analytics cannot change a sealed
grant. The hybrid row store owns the transaction. Columnar storage
may later project the grant for aggregation, but only by the same
primary key, and only after the row commit.

`UNKNOWN_EFFECT` on the parent admission stays a non-grant with a
null lag. Silence is not rewritten into a successful grant to make
a dashboard look complete.

## 14. Guardrails and neighbor protection

- One card per session. A second nomination is rejected.
- One reader per card. A second grant is rejected.
- `executes_tool` is forced false. The ACID path cannot call out
  to a tool or a provider.
- `DAY_SCAN`, `WATERMARK_SCAN`, and `PACKET_SCAN` are rejected
  access paths.
- Null account, day, consumer, reader, or grant code is **FULL SCAN
  REJECTED** before planning.
- The reader and the grant stewards cannot be the consumer or any
  upstream steward, so one principal cannot witness its own grant.
- Notify intents start `PREPARED`. Provider silence stays
  `UNKNOWN_EFFECT` and does not enroll the key.
- This plane does not open another nested expiry.

These guards keep a recursive agent from turning one admitted-count
grant into a board-sized walk that would miss the 99.99%
availability target for neighbors.

## 15. Performance check for boards with 1M+ rows

The hot path is a primary-key read and a primary-key write on
`(account_id, utc_day, consumer_principal_id)`. It does not filter
a board, a packet log, or a reader history. Indexes that serve
sessions, certificates, and audit reads all lead with
`account_id`.

A planner that sees a missing account or a missing card key must
call `reject_agent_accg_unscoped_scan` and stop. That is
**FULL SCAN REJECTED**. It is a refusal before a sequential scan.
Boards with 1M+ rows are not inputs to this plane.

HNSW, when a deployment adds it inside an account-partitioned
segment, ranks profiles only. It is not on the grant path. The
reference schema omits the index so a global ANN scan cannot leak
across tenants.

## 16. Auditability and replay

Each grant appends `agent_accg_audit_event` with the grant digest
and a previous hash. The event kind is `CITATION_GRANT_SEALED`.
Anchors are a separate mutation and do not rewrite the grant.
Replay reads the citation card head, the reader id, and the
profile grant code and re-runs `projectCitationGrant`. The engine
does not call a model. The same head, the same reader, and the
same grant code always produce the same class, the same counts,
and the same next action.

## 17. Threat and failure analysis

- A caller who sets `GRANTED` on a `NOT_PUBLISHED` head is
  rejected. The refusal cannot be laundered into a success.
- A caller who copies different counts than the citation card head
  is rejected. The grant cannot invent a larger citation.
- A caller who inlines `factBody` is rejected. The body stays
  omitted.
- A caller who sets `TRUSTED_ENROLLED` or `ack_promoted_to_trust`
  is rejected. `ACKED` stays an observation.
- A caller who sets `PACKET_SCAN` or `executes_tool` is rejected.
  The grant does not walk packets and does not run the tool.
- A caller who reuses a citation steward as a grant steward, or
  who names the consumer as the reader, is rejected.
- A caller who updates a sealed head or a sealed grant is rejected.
- A caller who inserts a profile as `APPROVED` is rejected.
  Approval goes through the authority fence.
- Cross-tenant rows fail the forced `account_id` policy.

## 18. Observability and SLOs

- Grant latency target: one primary-key read plus one primary-key
  write, p99 under 20 ms inside the tenant partition. This budget
  excludes provider calls and tool execution, which stay outside
  the database.
- Availability target: 99.99% for neighbor queries. Rejected scans
  must not become background work.
- Correctness counters: `issued_grants`, `refused_grants`,
  `full_scan_rejected`, `not_published_success_rejected`,
  `fact_body_rejected`.
- A refused grant is a successful seal of `NOT_GRANTED`, not an
  error budget burn, unless the function itself fails.
- `UNKNOWN_EFFECT` seals are counted separately from `DENIED` so
  silence is visible.

## 19. Rollout

1. Ship the schema and the grant function dark, behind the profile
   authority role.
2. Export citation card heads for one internal account by primary
   key. Do not backfill from a board scan.
3. Approve one profile whose grant code is
   `grant:reader-cited-admitted-counts`, whose citation code is
   `citation:card-cited-admitted-counts`, whose provider code is
   `provider:receipt-cited-admitted-counts`, whose effect code is
   `effect:cited-admitted-counts`, and whose purpose is
   `tool:cite-admitted-counts`.
4. Grant cards for that account to one reader. Compare the sealed
   counts to the citation card head.
5. Enable the GraphQL mutations for that account.
6. Expand account by account. Revocation stops new sessions and
   leaves sealed grants in place.

No step opens another nested expiry plane.

## 20. Ship criteria

- `npm run validate` passes TypeScript strict compile, GraphQL
  schema build (6 queries, 8 mutations), and PGlite plus pgvector
  DDL execution.
- Fixture: lag 3, budget 5, class `PUBLISHED`, counts 1/1/1, grant
  `grant:reader-cited-admitted-counts` issued to one reader; lag 8,
  budget 5, class `NOT_PUBLISHED` with counts omitted and the card
  head lag still 8; silence class `UNKNOWN_EFFECT` with null lag
  and null counts.
- A `NOT_PUBLISHED` card cannot be granted. Counts are copied only
  when `citation_published` is true.
- The reader is distinct from the consumer and from every steward.
- The grant does not scan context packets, does not inline a fact
  body, does not promote `ACKED` to `TRUSTED_ENROLLED`, does not
  execute the tool, and does not open another nested expiry.
- Every table and tenant index leads with `account_id`.
- `npm audit` reports no vulnerabilities for this package's direct
  dependency tree at ship time.

## 21. Product decision

Ship the Admitted Count Citation Grant Plane as the deterministic
grant of one already `PUBLISHED` citation card to exactly one
reader principal. The database seals the grant. It does not run
the tool and it does not call the provider. Agents perceive a
single perception row keyed by account, UTC day, and consumer, and
tagged with that one reader. `HOLD_CITATION_GRANT` is a hold
handle. `STOP_CITATION_GRANT` and `OMIT_CITATION_GRANT` are
refusals. Neither handle is permission to scan a board. This plane
does not open another nested expiry.

The next increment should issue one reader receipt for one already
`GRANTED` citation grant by point lookup of
`(account_id, utc_day, consumer_principal_id)`. A `NOT_GRANTED`
grant cannot issue a reader receipt. The receipt copies the three
counts only when `grant_issued` is true. The reader on the receipt
must equal the granted reader and stay distinct from the consumer
and every steward. The receipt must not scan context packets, must
not inline a fact body, must not promote `ACKED` to
`TRUSTED_ENROLLED`, must not execute the tool, must not grant a
second reader, and must not open another nested expiry plane.
