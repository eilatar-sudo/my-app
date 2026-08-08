# mondayDB Agentic Citation Sharing Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-08.v1`

## 1. Why this plane, before how

A sealed citation and a purpose-attenuated materialization prove that one agent
session bound enterprise truth under a fence. They do not decide how a **second
agent session** may reuse that citation without scanning donor sessions,
amplifying purpose, or sticky-exposing revoked grants.

Without a citation sharing plane, agents either:

- re-resolve and re-materialize the same surface key in every session
  (neighbor-harmful on boards with 1M+ rows), or
- copy citation IDs / board text across sessions without attenuation receipts,
  so a narrow incident-response purpose silently widens into a broader workspace
  purpose.

The product trade-off is **cross-session reuse fluency versus purpose isolation**:

- Letting every agent freely read another session's sealed citations maximizes
  fluency and reduces duplicate grounding cost, but creates purpose
  amplification, unauditable lateral movement, and sticky exposure after
  revocation.
- Requiring an approved sharing profile, sealed share grants, recipient-scoped
  attenuation receipts, and deterministic sync/notify adds one bounded
  transaction and short-lived grant storage.
- Semantic similarity may discover sharing profiles, but it must never decide
  whether a citation may be offered, accepted, synced, or notified across
  sessions.

The recommended model keeps the data plane deterministic:

1. An approved sharing profile defines which sealed citation surfaces may be
   offered to which recipient kinds and how purpose must attenuate further.
2. A sharing session opens under purpose, budget, and authorization fences, and
   only offers sealed citation IDs (or sealed materialization placements) by
   point lookup.
3. mondayDB seals a share grant binding to
   `citation_id + fact_hash + recipient_ref + attenuation_hash`.
4. Sync subscriptions emit invalidation when the source citation moves;
   recipient notify may become `UNKNOWN_EFFECT` until acknowledged.
5. Fan-out across recipients is budgeted; unscoped plans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"share every related citation with every agent" loops are rejectable before they
scan boards with 1M+ rows.

### Product outcome

For any cross-session citation share, mondayDB can answer:

- Which profile, principal, and session authorized the share grant?
- Which citation, fact hash, recipient, and attenuated purpose were bound?
- Is the grant still current, invalidated, revoked, or awaiting notify?
- Did async recipient notify become `UNKNOWN_EFFECT`?
- Can the sharing history be replayed without invoking an LLM?

## 2. Scope and ownership

The Citation Sharing Plane owns:

1. Immutable approved sharing profiles as procedural memory of "how an
   agent may offer sealed citations to other sessions or memory recipients."
2. Tenant-scoped sharing sessions with purpose and budget fences.
3. Deterministic offer of sealed citations (or sealed materialization
   placements) by point lookup — never donor-session or ledger table scans.
4. Purpose attenuation receipts and sealed share grants / recipient bindings.
5. Sync invalidation and recipient notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded recipient fan-out.

It integrates with, but does not replace:

- **Fact Consumption / Citation Materialization:** supply sealed citation and
  placement IDs plus invalidation events.
- **Fact Publication / Grounding:** constrain what a shared citation may expose.
- **Working Set / Decision Memory:** may receive sealed share bindings, not raw
  citation peeks from another session.
- **Transaction Intent / Effect Saga:** may execute recipient notifications
  under `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves share, sync, vector, and notify units.
- **Emergency Containment:** can freeze profiles or quarantine sessions.

### Non-goals

- Letting an LLM decide share validity or the "best" recipient session.
- Reconstructing authoritative share grants from columnar or vector projections.
- Cross-account citation sharing or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external notify consumers.
- Unbounded recursive share fan-out across boards with 1M+ rows.

## 3. Product contract

### 3.1 Sharing profile contract

A sharing profile version is immutable after approval. It defines:

- allowed citation surface-key patterns and recipient kinds
  (`AGENT_SESSION`, `WORKING_SET`, `DECISION_MEMORY`);
- purpose attenuation rules (narrowing only; never amplification across
  sessions);
- max recipient fan-out per session and per citation;
- sync and notify policies;
- optional procedural refs for "how to route and phrase shared citations."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
sessions; in-flight sessions follow the captured revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures policy and ACL
revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Share grant contract

Offering a sealed citation returns an offer/acceptance receipt. Sealing a
share grant binds `citation_id`, `fact_hash`, `recipient_ref`, and
`attenuation_hash` under further purpose narrowing. Share bindings never
mutate identity; invalidation or revocation creates a new state transition and
optional notify intent.

### 3.4 Sync and notify contract

Subscriptions bind share grants to citation invalidation. Notify intents start
as `PREPARED`, may become `UNKNOWN_EFFECT` when the recipient consumer does
not acknowledge, and never invent success from silence.

### 3.5 Availability contract

ShareGrant control-plane APIs recipient 99.99% availability for open, accept,
seal, sync, and perception reads. External board notifications are best-effort and
surfaced as uncertainty rather than silent success.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and recipient rules are immutable.
4. Binding identity
   (`citation_id`, `fact_hash`, `recipient_ref`, `attenuation_hash`) is immutable
   after seal.
5. Purpose attenuation may only narrow the donor and session purposes;
   amplification across sessions is rejected.
6. Citation offer uses point lookup by
   `(account_id, citation_id)` — never donor-session scans.
7. Notify intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   offer/share/sync/notify.
10. Plans that require unscoped board, session, or citation scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate recipient rules. Approval validates definition hash,
requires at least one recipient rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Offer and seal

Offer looks up a sealed citation by primary key, verifies surface pattern and
further purpose attenuation, and emits an offer receipt. Seal binds the share
grant to recipient and attenuation hash under CAS.

### 5.4 Sync

Subscribe attaches the share grant to citation invalidation. Fan-out across
recipients is budget-capped.

### 5.5 Invalidate and notify

Invalidation marks share bindings stale. Optional notify intents alert
recipients; unresolved external effects become `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and recipient rules. No session may open.

### 6.2 Session open

Session moves `OPEN` -> `ACCEPTING` -> `ACTIVE` as citations are accepted.

### 6.3 Share grant

Seal share grant creates an immutable recipient binding.

### 6.4 Invalidated / syncing

Citation invalidation moves bindings to `INVALIDATED` or `SYNCING` with
optional notify.

### 6.5 Terminal states

Sessions end as `CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`,
or `UNKNOWN_EFFECT`.

### 6.6 Retain

Audit anchors and sealed bindings retain for enterprise replay; physical
purge follows the erasure plane.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CitationId = string;
type ShareGrantId = string;
type BindingId = string;
type Sha256 = string;
type Timestamp = string;
type SurfaceKey = string;
type RecipientRef = string;

type TrustedNextAction =
  | "OFFER_CITATION_SHARE"
  | "SEAL_SHARE_GRANT"
  | "SUBSCRIBE_GRANT_SYNC"
  | "FAN_OUT_SHARE_GRANTS"
  | "PREPARE_RECIPIENT_NOTIFY"
  | "RESOLVE_NOTIFY_UNCERTAINTY"
  | "CLOSE_SESSION";

type ShareGrantBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "CITATION_MISSING"
  | "HASH_MISMATCH"
  | "FAN_OUT_EXCEEDED"
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
  | "ACCEPTING"
  | "ACTIVE"
  | "SYNCING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type BindingStatus =
  | "SEALED"
  | "INVALIDATED"
  | "SYNCING"
  | "NOTIFY_PENDING"
  | "SUPERSEDED_REF"
  | "UNKNOWN_EFFECT";

type RecipientKind = "AGENT_SESSION" | "WORKING_SET" | "DECISION_MEMORY";
type NotifyIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface CitationSharingBudget {
  readonly acceptUnits: number;
  readonly shareUnits: number;
  readonly vectorUnits: number;
  readonly syncUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly maxRecipientFanOut: number;
  readonly maxRecipientsPerCitation: number;
}

interface CitationSharingProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly maxRecipientFanOut: number;
  readonly maxRecipientsPerCitation: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface CitationSharingSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: CitationSharingBudget;
  readonly consumed: Omit<
    CitationSharingBudget,
    "maxWallTimeMs" | "maxRecipientFanOut" | "maxRecipientsPerCitation"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface CitationAcceptanceReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly surfaceKey: SurfaceKey;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly acceptanceHash: Sha256;
  readonly acceptedAt: Timestamp;
}

interface CitationBinding {
  readonly accountId: AccountId;
  readonly bindingId: BindingId;
  readonly shareGrantId: ShareGrantId;
  readonly sessionId: SessionId;
  readonly citationId: CitationId;
  readonly recipientKind: RecipientKind;
  readonly recipientRef: RecipientRef;
  readonly status: BindingStatus;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface NotifyObservation {
  readonly notifyId: string;
  readonly status: NotifyIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentCitationSharingPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedBindingCount: number;
  readonly invalidatedBindingCount: number;
  readonly uncertainNotifys: readonly NotifyObservation[];
  readonly remainingBudget: Omit<
    CitationSharingBudget,
    "maxWallTimeMs" | "maxRecipientFanOut" | "maxRecipientsPerCitation"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ShareGrantBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateCitationSharingSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: CitationSharingBudget;
}

interface OfferSealedCitationShareInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly expectedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealCitationShareGrantInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly recipientKind: RecipientKind;
  readonly recipientRef: RecipientRef;
  readonly expectedFactHash: Sha256;
  readonly expectedAcceptanceHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SubscribeShareGrantSyncInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly bindingId: BindingId;
  readonly idempotencyKey: string;
}

interface FanOutCitationShareGrantsInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly maxFanOut: number;
  readonly idempotencyKey: string;
}

interface PrepareRecipientNotifyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly bindingId: BindingId;
  readonly idempotencyKey: string;
}

interface ResolveNotifyUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly notifyId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_RECEIPT"
    | "REJECT_SHAREMENT"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseCitationSharingSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type CitationSharingDecision =
  | { readonly decision: "ALLOWED"; readonly session: CitationSharingSession;
      readonly binding?: CitationBinding; readonly receipt?: CitationAcceptanceReceipt;
      readonly perception: AgentCitationSharingPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ShareGrantBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentCitationSharingPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production binding may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE cs_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE cs_session_status AS ENUM (
  'OPEN', 'ACCEPTING', 'ACTIVE', 'SYNCING', 'CLOSED', 'EXPIRED',
  'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cs_binding_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SYNCING', 'NOTIFY_PENDING',
  'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE cs_recipient_kind AS ENUM (
  'AGENT_SESSION', 'WORKING_SET', 'DECISION_MEMORY'
);
CREATE TYPE cs_notify_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE cs_citation_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF',
  'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_cs_profile_authority NOLOGIN;

CREATE TABLE agent_cs_authorization_evidence (
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

CREATE TABLE agent_cs_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status cs_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  max_recipient_fan_out SMALLINT NOT NULL
    CHECK (max_recipient_fan_out BETWEEN 0 AND 32),
  max_recipients_per_citation SMALLINT NOT NULL
    CHECK (max_recipients_per_citation BETWEEN 1 AND 16),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_ACCEPT', 'REQUIRE_CONTAINMENT'
    )
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
    REFERENCES agent_cs_authorization_evidence (account_id, evidence_id),
  CHECK (
    (status = 'DRAFT' AND approved_at IS NULL
      AND approval_validation_hash IS NULL) OR
    (status IN ('APPROVED', 'REVOKED') AND approved_at IS NOT NULL
      AND approval_validation_hash IS NOT NULL)
  ),
  CHECK (
    (status <> 'REVOKED' AND revoked_by IS NULL AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CHECK (length(authorization_snapshot_hash) = 64)
);

CREATE TABLE agent_cs_profile_recipient_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  surface_key_pattern TEXT NOT NULL,
  allowed_recipient_kinds TEXT[] NOT NULL,
  require_sync BOOLEAN NOT NULL,
  attenuation_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cs_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_cs_citation_catalog (
  account_id BIGINT NOT NULL,
  citation_id UUID NOT NULL,
  consumption_session_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  status cs_citation_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  ledger_entry_id UUID NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, citation_id),
  UNIQUE (account_id, consumption_session_id, citation_id)
);

CREATE TABLE agent_cs_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status cs_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_accept_units BIGINT NOT NULL CHECK (budget_accept_units >= 0),
  budget_share_units BIGINT NOT NULL CHECK (budget_share_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_sync_units BIGINT NOT NULL CHECK (budget_sync_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_accept_units BIGINT NOT NULL CHECK (consumed_accept_units >= 0),
  consumed_share_units BIGINT NOT NULL CHECK (consumed_share_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_sync_units BIGINT NOT NULL CHECK (consumed_sync_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  max_recipient_fan_out SMALLINT NOT NULL
    CHECK (max_recipient_fan_out BETWEEN 0 AND 32),
  max_recipients_per_citation SMALLINT NOT NULL
    CHECK (max_recipients_per_citation BETWEEN 1 AND 16),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL,
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  terminal_outcome_hash CHAR(64),
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, session_id, profile_id, profile_version),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_cs_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_cs_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_accept_units <= budget_accept_units),
  CHECK (consumed_share_units <= budget_share_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_sync_units <= budget_sync_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_cs_acceptance_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  acceptance_hash CHAR(64) NOT NULL CHECK (length(acceptance_hash) = 64),
  accepted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, citation_id, acceptance_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cs_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cs_share_grant (
  account_id BIGINT NOT NULL,
  share_grant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, share_grant_id),
  UNIQUE (account_id, session_id, citation_id, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cs_citation_catalog (account_id, citation_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_cs_acceptance_receipt (account_id, receipt_id)
);

CREATE TABLE agent_cs_binding (
  account_id BIGINT NOT NULL,
  binding_id UUID NOT NULL,
  share_grant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  recipient_kind cs_recipient_kind NOT NULL,
  recipient_ref TEXT NOT NULL,
  status cs_binding_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, binding_id),
  UNIQUE (account_id, session_id, citation_id, recipient_ref, sealed_revision),
  FOREIGN KEY (account_id, share_grant_id)
    REFERENCES agent_cs_share_grant (account_id, share_grant_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cs_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cs_sync_subscription (
  account_id BIGINT NOT NULL,
  subscription_id UUID NOT NULL,
  session_id UUID NOT NULL,
  binding_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, subscription_id),
  UNIQUE (account_id, session_id, binding_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id),
  FOREIGN KEY (account_id, binding_id)
    REFERENCES agent_cs_binding (account_id, binding_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cs_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cs_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  binding_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  prior_fact_hash CHAR(64) NOT NULL CHECK (length(prior_fact_hash) = 64),
  next_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'CITATION_MOVED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, subscription_id)
    REFERENCES agent_cs_sync_subscription (account_id, subscription_id),
  FOREIGN KEY (account_id, binding_id)
    REFERENCES agent_cs_binding (account_id, binding_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_cs_citation_catalog (account_id, citation_id)
);

CREATE TABLE agent_cs_notify_intent (
  account_id BIGINT NOT NULL,
  notify_id UUID NOT NULL,
  session_id UUID NOT NULL,
  binding_id UUID NOT NULL,
  intent_status cs_notify_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL
    CHECK (length(canonical_request_hash) = 64),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, notify_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id),
  FOREIGN KEY (account_id, binding_id)
    REFERENCES agent_cs_binding (account_id, binding_id)
);

CREATE TABLE agent_cs_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('ACCEPT', 'SHARE', 'VECTOR', 'SYNC', 'NOTIFY')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id)
);

CREATE TABLE agent_cs_conflict_record (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  left_binding_id UUID,
  right_recipient_ref TEXT,
  conflict_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id)
);

CREATE TABLE agent_cs_human_resolution (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  session_id UUID NOT NULL,
  notify_id UUID,
  conflict_id UUID,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id)
);

CREATE TABLE agent_cs_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
  session_id UUID,
  operation_name TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL,
  result_hash CHAR(64) NOT NULL CHECK (length(result_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, command_id),
  UNIQUE (account_id, operation_name, principal_id, idempotency_key)
);

CREATE TABLE agent_cs_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_cs_audit_event (
  account_id BIGINT NOT NULL,
  event_sequence BIGINT NOT NULL CHECK (event_sequence >= 0),
  session_id UUID,
  event_type TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL CHECK (length(payload_hash) = 64),
  prev_hash CHAR(64) NOT NULL CHECK (length(prev_hash) = 64),
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_sequence)
);

CREATE TABLE agent_cs_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_cs_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status cs_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_cs_session (account_id, session_id)
);

CREATE TABLE agent_cs_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_cs_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_profile$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'profiles must start as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM 'DRAFT'
     AND (
       NEW.definition_hash IS DISTINCT FROM OLD.definition_hash
       OR NEW.max_recipient_fan_out IS DISTINCT FROM OLD.max_recipient_fan_out
       OR NEW.max_recipients_per_citation
         IS DISTINCT FROM OLD.max_recipients_per_citation
       OR NEW.semantic_tags IS DISTINCT FROM OLD.semantic_tags
       OR NEW.procedure_ref IS DISTINCT FROM OLD.procedure_ref
       OR NEW.revocation_policy IS DISTINCT FROM OLD.revocation_policy
       OR NEW.authorization_evidence_id
         IS DISTINCT FROM OLD.authorization_evidence_id
       OR NEW.authorization_snapshot_hash
         IS DISTINCT FROM OLD.authorization_snapshot_hash
     ) THEN
    RAISE EXCEPTION 'sealed profile definition is immutable';
  END IF;

  IF OLD.status = 'APPROVED' AND NEW.status = 'REVOKED' THEN
    IF current_setting('app.cs_profile_revocation', true) IS DISTINCT FROM
       concat(
         OLD.profile_id::TEXT, ':',
         OLD.profile_version::TEXT, ':',
         OLD.definition_hash
       ) THEN
      RAISE EXCEPTION 'profile revocation requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
    IF current_setting('app.cs_profile_approval', true) IS DISTINCT FROM
       concat(
         OLD.profile_id::TEXT, ':',
         OLD.profile_version::TEXT, ':',
         OLD.definition_hash
       ) THEN
      RAISE EXCEPTION 'profile approval requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status = 'DRAFT' AND NEW.status = 'APPROVED')
       OR (OLD.status = 'APPROVED' AND NEW.status = 'REVOKED')
     ) THEN
    RAISE EXCEPTION 'illegal profile status transition';
  END IF;

  RETURN NEW;
END
$protect_profile$;

CREATE TRIGGER agent_cs_profile_protect
BEFORE INSERT OR UPDATE ON agent_cs_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_cs_profile();

CREATE FUNCTION protect_agent_cs_profile_recipient_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status cs_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_cs_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile recipient rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_cs_profile_recipient_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_cs_profile_recipient_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_cs_profile_recipient_rule();

CREATE FUNCTION protect_agent_cs_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.citation_id IS DISTINCT FROM OLD.citation_id
       OR NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.recipient_ref IS DISTINCT FROM OLD.recipient_ref
       OR NEW.recipient_kind IS DISTINCT FROM OLD.recipient_kind
       OR NEW.share_grant_id IS DISTINCT FROM OLD.share_grant_id THEN
      RAISE EXCEPTION 'binding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_binding$;

CREATE TRIGGER agent_cs_binding_protect
BEFORE UPDATE ON agent_cs_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_cs_binding();

CREATE FUNCTION protect_agent_cs_notify_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_notify$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'notify intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.provider_idempotency_key
       IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.binding_id IS DISTINCT FROM NEW.binding_id THEN
    RAISE EXCEPTION 'prepared notify identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_notify$;

CREATE TRIGGER agent_cs_notify_intent_protect
BEFORE INSERT OR UPDATE ON agent_cs_notify_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_cs_notify_intent();

CREATE FUNCTION approve_agent_cs_profile(
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
  stored_status cs_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cs_profile
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
  FROM agent_cs_profile_recipient_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one recipient rule';
  END IF;

  PERFORM set_config(
    'app.cs_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_cs_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_cs_profile(
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
  stored_status cs_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_cs_profile
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
    'app.cs_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_cs_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_cs_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cs_profile_authority;
ALTER FUNCTION revoke_agent_cs_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_cs_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_cs_profile_authority;
GRANT SELECT ON
  agent_cs_profile,
  agent_cs_profile_recipient_rule
TO agent_cs_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cs_profile TO agent_cs_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_cs_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_cs_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_cs_profile FROM PUBLIC;

CREATE INDEX agent_cs_session_work_idx ON agent_cs_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_cs_session_profile_idx ON agent_cs_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_cs_binding_session_idx ON agent_cs_binding (
  account_id, session_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_cs_binding_citation_idx ON agent_cs_binding (
  account_id, citation_id, sealed_at DESC, binding_id
);
CREATE INDEX agent_cs_binding_recipient_idx ON agent_cs_binding (
  account_id, recipient_kind, recipient_ref, sealed_at DESC
);
CREATE INDEX agent_cs_citation_surface_idx ON agent_cs_citation_catalog (
  account_id, surface_key, sealed_at DESC, citation_id
);
CREATE INDEX agent_cs_sync_active_idx ON agent_cs_sync_subscription (
  account_id, active, citation_id, subscription_id
) WHERE active;
CREATE INDEX agent_cs_notify_work_idx ON agent_cs_notify_intent (
  account_id, intent_status, updated_at, notify_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_cs_audit_time_idx ON agent_cs_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_cs_perception_status_idx ON agent_cs_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_cs_command_expiry_idx ON agent_cs_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_cs_conflict_citation_idx ON agent_cs_conflict_record (
  account_id, citation_id, created_at DESC, conflict_id
);
CREATE INDEX agent_cs_invalidation_binding_idx ON agent_cs_invalidation (
  account_id, binding_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_cs_authorization_evidence',
    'agent_cs_profile',
    'agent_cs_profile_recipient_rule',
    'agent_cs_citation_catalog',
    'agent_cs_session',
    'agent_cs_acceptance_receipt',
    'agent_cs_share_grant',
    'agent_cs_binding',
    'agent_cs_sync_subscription',
    'agent_cs_invalidation',
    'agent_cs_notify_intent',
    'agent_cs_budget_ledger',
    'agent_cs_conflict_record',
    'agent_cs_human_resolution',
    'agent_cs_command_result',
    'agent_cs_audit_head',
    'agent_cs_audit_event',
    'agent_cs_audit_anchor',
    'agent_cs_perception_snapshot',
    'agent_cs_projection_checkpoint'
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

Open session, accept+receipt, seal share grant/binding, subscribe, fan-out,
prepare notify, and audit-chain append commit in one ACID transaction per
command. Citation catalog ingestion from consumption is separately watermarked.

### 8.2 Tenant isolation

Every table enables and forces RLS. Policies compare `account_id` to
`app.account_id`. Resolvers must set the GUC before query execution.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
notify work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentCsSessionStatus {
  OPEN
  ACCEPTING
  ACTIVE
  SYNCING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentCsBindingStatus {
  SEALED
  INVALIDATED
  SYNCING
  NOTIFY_PENDING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentCsRecipientKind {
  AGENT_SESSION
  WORKING_SET
  DECISION_MEMORY
}

enum AgentCsNotifyStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentCsNextAction {
  OFFER_CITATION_SHARE
  SEAL_SHARE_GRANT
  SUBSCRIBE_GRANT_SYNC
  FAN_OUT_SHARE_GRANTS
  PREPARE_RECIPIENT_NOTIFY
  RESOLVE_NOTIFY_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentCsBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  CITATION_MISSING
  HASH_MISMATCH
  FAN_OUT_EXCEEDED
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentCsUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_SHAREMENT
  REQUIRE_HUMAN
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentCsBudget {
  acceptUnits: Long!
  shareUnits: Long!
  vectorUnits: Long!
  syncUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  maxRecipientFanOut: Int!
  maxRecipientsPerCitation: Int!
}

type AgentCsProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  maxRecipientFanOut: Int!
  maxRecipientsPerCitation: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentCsSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentCsSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentCsBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentCsAcceptanceReceipt {
  accountId: ID!
  sessionId: ID!
  citationId: ID!
  surfaceKey: String!
  factHash: SHA256!
  attenuationHash: SHA256!
  acceptanceHash: SHA256!
  acceptedAt: DateTime!
}

type AgentCsBinding {
  accountId: ID!
  bindingId: ID!
  shareGrantId: ID!
  sessionId: ID!
  citationId: ID!
  recipientKind: AgentCsRecipientKind!
  recipientRef: String!
  status: AgentCsBindingStatus!
  factHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentCsNotifyObservation {
  notifyId: ID!
  status: AgentCsNotifyStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentCsPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentCsSessionStatus!
  summary: AgentUntrustedText!
  sealedBindingCount: Int!
  invalidatedBindingCount: Int!
  uncertainNotifys: [AgentCsNotifyObservation!]!
  remainingBudget: AgentCsBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentCsNextAction!]!
  blockedReasons: [AgentCsBlockedReason!]!
  cardHash: SHA256!
}

type AgentCsMutationResult {
  decision: String!
  session: AgentCsSession
  binding: AgentCsBinding
  receipt: AgentCsAcceptanceReceipt
  perception: AgentCsPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentCsBudgetInput {
  acceptUnits: Long!
  shareUnits: Long!
  vectorUnits: Long!
  syncUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  maxRecipientFanOut: Int!
  maxRecipientsPerCitation: Int!
}

input CreateCitationSharingSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentCsBudgetInput!
}

input OfferSealedCitationShareInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  expectedFactHash: SHA256!
  idempotencyKey: String!
}

input SealCitationShareGrantInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  recipientKind: AgentCsRecipientKind!
  recipientRef: String!
  expectedFactHash: SHA256!
  expectedAcceptanceHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SubscribeShareGrantSyncInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  bindingId: ID!
  idempotencyKey: String!
}

input FanOutCitationShareGrantsInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  maxFanOut: Int!
  idempotencyKey: String!
}

input PrepareRecipientNotifyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  bindingId: ID!
  idempotencyKey: String!
}

input ResolveNotifyUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  notifyId: ID!
  resolution: AgentCsUncertaintyResolution!
  idempotencyKey: String!
}

input CloseCitationSharingSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentCsProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentCsProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentCsProfile
  agentCsSession(accountId: ID!, sessionId: ID!): AgentCsSession
  agentCsBinding(accountId: ID!, bindingId: ID!): AgentCsBinding
  agentCsPerceptionCard(accountId: ID!, sessionId: ID!): AgentCsPerceptionCard
  agentCsAcceptedCitation(
    accountId: ID!
    sessionId: ID!
    citationId: ID!
  ): AgentCsAcceptanceReceipt
  agentCsSearchProfiles(input: AgentCsProfileSearchInput!): [AgentCsProfile!]!
}

type Mutation {
  createCitationSharingSession(
    input: CreateCitationSharingSessionInput!
  ): AgentCsMutationResult!
  offerSealedCitationShare(input: OfferSealedCitationShareInput!): AgentCsMutationResult!
  sealCitationShareGrant(
    input: SealCitationShareGrantInput!
  ): AgentCsMutationResult!
  subscribeShareGrantSync(
    input: SubscribeShareGrantSyncInput!
  ): AgentCsMutationResult!
  fanOutCitationShareGrants(
    input: FanOutCitationShareGrantsInput!
  ): AgentCsMutationResult!
  prepareRecipientNotify(
    input: PrepareRecipientNotifyInput!
  ): AgentCsMutationResult!
  resolveNotifyUncertainty(
    input: ResolveNotifyUncertaintyInput!
  ): AgentCsMutationResult!
  closeCitationSharingSession(
    input: CloseCitationSharingSessionInput!
  ): AgentCsMutationResult!
  approveCitationSharingProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    approverPrincipalId: ID!
  ): AgentCsMutationResult!
  revokeCitationSharingProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentCsMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Fan-out mutations reject when `maxFanOut` exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.

## 10. Procedural memory

Approved sharing profiles are procedural memory: versioned instructions
for how agents may offer sealed citations to other sessions under further
purpose attenuation. Procedure refs
point to render/routing steps. Agents perceive procedure tags on perception
cards; they never mutate sealed procedure definitions.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses account-owned embeddings. Similarity may rank candidate
profiles for a purpose string; authorization remains a deterministic point
lookup against `APPROVED` profiles. Production may create per-account HNSW
partitions; the reference schema stores vectors without a cross-tenant HNSW
index.

```sql
CREATE TABLE agent_cs_profile_embedding (
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
    REFERENCES agent_cs_profile (account_id, profile_id, profile_version)
);
```

Account-partitioned ANN guidance (production only):

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- must be created per account partition / tablespace, never as one shared
-- cross-tenant HNSW graph over all accounts.
SELECT account_id, profile_id
FROM agent_cs_profile_embedding
WHERE account_id = $1
ORDER BY embedding <=> $2
LIMIT $3;
```

## 12. Agent perception

Perception cards expose sealed/invalidated binding counts, uncertain
notifications, remaining budgets, procedure tags, and trusted next actions.
Summaries are `UntrustedText`. Agents must treat shared citation payloads as untrusted until the share
binding card reports `SEALED` with matching `fact_hash` and a narrowed
`attenuation_hash`.

## 13. ACID and consistency

### Row store

Session CAS, acceptance, seal, sync, notify prepare, and audit append are
ACID. Binding identity is immutable after seal.

### Columnar store

Analytical synopsis of binding rates is eventually consistent and never
authoritative for seal/sync decisions.

### Vector store

Profile embeddings are eventually consistent projections keyed by
`definition_hash` and watermark; they never authorize mutations.

### External tools

Board notifications are out-of-band. Lack of acknowledgement yields
`UNKNOWN_EFFECT`, never inferred success.

## 14. Guardrails and neighbor protection

- Recursion/fan-out caps on bindings per citation and per session.
- Budget ledgers for OFFER/SHARE/VECTOR/SYNC/NOTIFY.
- Purpose attenuation narrowing only.
- Forced RLS on every table.
- Planner rejects unscoped citation/board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Offering citations by scanning donor or consumption sessions (rejected).
- Listing all agent sessions to fan-out without recipient refs (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all bindings for an account (rejected; use
  citation-keyed active subscription indexes).

### Required access paths

- Citation offer: PK `(account_id, citation_id)`.
- Binding by session/recipient: composite indexes leading with `account_id`.
- Sync work: partial indexes on active subscriptions and notify status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/citation scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session and
binding state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant binding via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification across sessions: attenuation hash must narrow relative to both donor and recipient purposes.
- Sticky lateral citation copies after supersession: sync invalidation +
  notify uncertainty + grant revocation.
- Silent notify success: `UNKNOWN_EFFECT` until ACK.
- Recursive fan-out storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/accept/seal/perception p99 latency budgets for 99.99% control-plane
  availability.
- Notify ACK lag and `UNKNOWN_EFFECT` rate as first-class metrics.
- Fan-out rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow compilation

Compile profiles and validate attenuation without durable bindings.

### Phase 2: working-set recipients only

Allow share bindings onto working sets and decision memory, not live agent sessions.

### Phase 3: subscribed sync

Enable citation invalidation subscriptions for sealed bindings.

### Phase 4: recipient notify uncertainty

Enable recipient notify intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, and notify start
  state.

### Behavioral validation

- Offer requires sealed citation point lookup and hash match.
- Seal binds further attenuation and recipient immutably.
- Sync invalidation moves bindings without mutating identity.
- Notify silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no accept/place path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed bindings after process restart.

## 21. Product decision

Ship the Citation Sharing Plane as the deterministic bridge from sealed
citations (and sealed materializations) to cross-session, purpose-attenuated
reuse. Keep semantic retrieval advisory for profile discovery only. Prefer
short-lived grant sync and honest `UNKNOWN_EFFECT` recipient notify over sticky
unattenuated lateral citation copies. Reject unscoped sharing plans on boards
with 1M+ rows as **FULL SCAN REJECTED**, preserving 99.99% neighbor isolation
while making agent citation sharing procedural-memory-driven, auditable, and
replayable.
