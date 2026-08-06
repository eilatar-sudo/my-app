# mondayDB Agentic Fact Consumption Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-06.v1`

## 1. Why this plane, before how

A published ledger entry and current pointer prove that a conclusion is
enterprise-visible. They do not decide how agents may **resolve, cite, cache,
or depend on** that fact without scanning boards or silently retaining stale
truth after supersession or retraction.

Without a consumption plane, agents either:

- re-scan ledger history for every surface key (neighbor-harmful on boards with
  1M+ rows), or
- sticky-cache fact bodies without binding to `fact_hash` / ledger identity,
  so superseded conclusions keep driving tools and writebacks.

The product trade-off is **citation freshness versus agent fluency**:

- Letting every agent freely read current pointers maximizes autonomy and
  reduces round-trips, but creates unauditable citations, unbounded related-fact
  fan-out, and stale decisions after supersession.
- Requiring a sealed consumption session, immutable citation bindings, purpose
  fences, and deterministic invalidation adds one bounded transaction and
  short-lived subscription storage.
- Semantic similarity may discover consumption profiles, but it must never
  decide whether a fact may be cited, refreshed, or expanded.

The recommended model keeps the data plane deterministic:

1. An approved consumption profile defines which surfaces an agent may resolve
   and how citations must be bound.
2. A consumption session opens under purpose, budget, and authorization fences.
3. mondayDB resolves current facts through account-scoped pointers (never ledger
   table scans) and seals citation bindings to `ledger_entry_id + fact_hash`.
4. Dependency subscriptions emit invalidation when pointers move; refresh may
   become `UNKNOWN_EFFECT` until the new current fact is resolved.
5. Related-fact expansion is depth- and fan-out-capped; unscoped plans are
   **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"cite everything related" loops are budgeted and rejectable before they scan
boards with 1M+ rows.

### Product outcome

For any agent citation of a published fact, mondayDB can answer:

- Which profile, principal, and session authorized the citation?
- Which ledger entry and `fact_hash` were bound at seal time?
- Is the citation still current, invalidated, or awaiting refresh?
- Did async refresh become `UNKNOWN_EFFECT`?
- Can the consumption history be replayed without invoking an LLM?

## 2. Scope and ownership

The Fact Consumption Plane owns:

1. Immutable approved consumption profiles as procedural memory of "how an agent
   may resolve and cite published facts."
2. Tenant-scoped consumption sessions with purpose and budget fences.
3. Deterministic current-fact resolution via account-scoped pointers.
4. Immutable citation bindings and dependency subscriptions.
5. Invalidation and refresh intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded related-fact expansion.

It integrates with, but does not replace:

- **Fact Publication:** supplies ledger entries, current pointers, and
  supersession/retraction events.
- **Grounding Assertion / Evidence:** constrain what a citation may expose.
- **Decision Memory / Working Set:** may attach sealed citations, not raw
  pointer peeks.
- **Change Watch:** may deliver invalidation envelopes to subscribers.
- **Query Governor / Budgets:** reserves resolve, vector, expand, and refresh
  units.
- **Emergency Containment:** can freeze profiles or quarantine sessions.

### Non-goals

- Letting an LLM decide citation validity or "best" current fact.
- Reconstructing authoritative citations from columnar or vector projections.
- Cross-account fact consumption or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external refresh consumers.
- Unbounded recursive related-fact expansion across boards with 1M+ rows.

## 3. Product contract

### 3.1 Consumption profile contract

A consumption profile version is immutable after approval. It defines:

- allowed surface-key patterns and required ledger statuses;
- citation mode (`PIN_HASH` or `FOLLOW_CURRENT` with explicit refresh rules);
- max related fan-out and recursion depth;
- purpose defaults and redaction requirements;
- optional procedural refs for "how to phrase and route citations."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
sessions; in-flight sessions follow the captured revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures policy and ACL
revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Citation contract

Resolving a surface key returns a resolution receipt. Sealing a citation binds
`ledger_entry_id`, `fact_hash`, and the receipt hash. Citations never mutate;
invalidation creates a new state transition and optional refresh intent.

### 3.4 Subscription and refresh contract

Subscriptions watch surface keys or citation IDs. On supersession/retraction,
mondayDB appends an invalidation event and may prepare a refresh intent. After
dispatch to an external consumer, uncertainty is explicit `UNKNOWN_EFFECT`.

### 3.5 Availability contract

Interactive resolve and citation seal paths target blink-of-an-eye latency on
account-scoped indexes. Autonomous expand/refresh work is admitted separately
so neighbor interactive traffic retains 99.99% availability.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; RLS is forced on all tables.
2. Profile definition bytes are immutable after approval.
3. Citation identity (`ledger_entry_id`, `fact_hash`, `resolution_hash`) is
   immutable after seal.
4. Current-fact resolution uses `agent_fc_current_pointer` (or an imported
   publication pointer catalog), never a ledger scan.
5. Related expansion cannot exceed profile `max_related_fan_out` or session
   remaining expand budget.
6. Refresh intents start as `PREPARED`; non-prepared inserts are rejected.
7. Semantic similarity never authorizes resolve, cite, expand, or refresh.
8. Plans without leading `account_id` predicates are **FULL SCAN REJECTED**.
9. Audit events form a per-tenant hash chain.
10. `UNKNOWN_EFFECT` is a first-class refresh outcome, never silent success.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accept surface rules. Approval fences validate definition hash
and require at least one surface rule. Revocation uses a distinct authority
fence.

### 5.2 Open session

Create a session under purpose/budget fences. Capture authorization evidence
and resource scope hash. No citations exist yet.

### 5.3 Resolve and cite

Resolve surface keys through current pointers. Seal citation bindings with
compare-and-swap. Optionally subscribe for invalidation.

### 5.4 Expand related

Expand only along declared related edges within depth and fan-out caps. Each
edge consumes expand budget units.

### 5.5 Invalidate and refresh

Pointer moves append invalidation events. Refresh intents may be prepared and
dispatched; external acknowledgment may leave `UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Profiles start `DRAFT` with mutable surface rules.

### 6.2 Session open

Sessions start `OPEN` after budget reservation.

### 6.3 Binding

Citations move from `RESOLVED` receipts to `SEALED` bindings.

### 6.4 Invalidated / refreshing

Sealed citations may become `INVALIDATED` or `REFRESHING`. Refresh may enter
`UNKNOWN_EFFECT`.

### 6.5 Terminal states

`CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, and `QUARANTINED` are terminal for
sessions. Citations may remain `SEALED`, `INVALIDATED`, `SUPERSEDED_REF`, or
`UNKNOWN_EFFECT` for audit.

### 6.6 Retain

Citations, invalidations, audit, and perception snapshots are retained per
enterprise policy. Columnar projections are watermarked and non-authoritative.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type CitationId = string;
type LedgerEntryId = string;
type SubscriptionId = string;
type Sha256 = string;
type Timestamp = string;
type SurfaceKey = string;

type TrustedNextAction =
  | "RESOLVE_SURFACE"
  | "SEAL_CITATION"
  | "SUBSCRIBE"
  | "EXPAND_RELATED"
  | "REFRESH_CITATION"
  | "RESOLVE_REFRESH"
  | "CLOSE_SESSION";

type ConsumptionBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "REDACTION_DENY"
  | "BUDGET_EXHAUSTED"
  | "POINTER_MISSING"
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
  | "BINDING"
  | "ACTIVE"
  | "REFRESHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type CitationStatus =
  | "SEALED"
  | "INVALIDATED"
  | "REFRESHING"
  | "SUPERSEDED_REF"
  | "RETRACTED_REF"
  | "UNKNOWN_EFFECT";

type CitationMode = "PIN_HASH" | "FOLLOW_CURRENT";
type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface FactConsumptionBudget {
  readonly resolveUnits: number;
  readonly citeUnits: number;
  readonly vectorUnits: number;
  readonly expandUnits: number;
  readonly refreshUnits: number;
  readonly maxWallTimeMs: number;
  readonly maxRelatedFanOut: number;
  readonly maxExpandDepth: number;
}

interface FactConsumptionProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly citationMode: CitationMode;
  readonly maxRelatedFanOut: number;
  readonly maxExpandDepth: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface FactConsumptionSession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: FactConsumptionBudget;
  readonly consumed: Omit<
    FactConsumptionBudget,
    "maxWallTimeMs" | "maxRelatedFanOut" | "maxExpandDepth"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface FactResolutionReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly surfaceKey: SurfaceKey;
  readonly ledgerEntryId: LedgerEntryId;
  readonly factHash: Sha256;
  readonly pointerUpdatedAt: Timestamp;
  readonly resolutionHash: Sha256;
  readonly resolvedAt: Timestamp;
}

interface FactCitation {
  readonly accountId: AccountId;
  readonly citationId: CitationId;
  readonly sessionId: SessionId;
  readonly surfaceKey: SurfaceKey;
  readonly status: CitationStatus;
  readonly ledgerEntryId: LedgerEntryId;
  readonly factHash: Sha256;
  readonly resolutionHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface RefreshObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentFactConsumptionPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedCitationCount: number;
  readonly invalidatedCitationCount: number;
  readonly uncertainRefreshes: readonly RefreshObservation[];
  readonly remainingBudget: Omit<
    FactConsumptionBudget,
    "maxWallTimeMs" | "maxRelatedFanOut" | "maxExpandDepth"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly ConsumptionBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateFactConsumptionSessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: FactConsumptionBudget;
}

interface ResolveFactSurfaceInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly surfaceKey: SurfaceKey;
  readonly idempotencyKey: string;
}

interface SealFactCitationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly surfaceKey: SurfaceKey;
  readonly expectedLedgerEntryId: LedgerEntryId;
  readonly expectedFactHash: Sha256;
  readonly expectedResolutionHash: Sha256;
  readonly idempotencyKey: string;
}

interface SubscribeFactDependencyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly idempotencyKey: string;
}

interface ExpandRelatedFactsInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly maxFanOut: number;
  readonly idempotencyKey: string;
}

interface RefreshFactCitationInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly citationId: CitationId;
  readonly idempotencyKey: string;
}

interface ResolveRefreshUncertaintyInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly refreshId: string;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_RECEIPT"
    | "REJECT_CITATION"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseFactConsumptionSessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type FactConsumptionDecision =
  | { readonly decision: "ALLOWED"; readonly session: FactConsumptionSession;
      readonly citation?: FactCitation; readonly receipt?: FactResolutionReceipt;
      readonly perception: AgentFactConsumptionPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: ConsumptionBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentFactConsumptionPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production placement may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE fc_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE fc_session_status AS ENUM (
  'OPEN', 'BINDING', 'ACTIVE', 'REFRESHING', 'CLOSED', 'EXPIRED',
  'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE fc_citation_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF',
  'RETRACTED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE fc_citation_mode AS ENUM ('PIN_HASH', 'FOLLOW_CURRENT');
CREATE TYPE fc_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE fc_ledger_status AS ENUM (
  'CURRENT', 'SUPERSEDED', 'RETRACTED', 'QUARANTINED'
);

CREATE ROLE agent_fc_profile_authority NOLOGIN;

CREATE TABLE agent_fc_authorization_evidence (
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

CREATE TABLE agent_fc_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status fc_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  citation_mode fc_citation_mode NOT NULL,
  max_related_fan_out SMALLINT NOT NULL
    CHECK (max_related_fan_out BETWEEN 0 AND 32),
  max_expand_depth SMALLINT NOT NULL
    CHECK (max_expand_depth BETWEEN 0 AND 8),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_RESOLVE', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_fc_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_fc_profile_surface_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  surface_key_pattern TEXT NOT NULL,
  allowed_ledger_statuses TEXT[] NOT NULL,
  require_subscription BOOLEAN NOT NULL,
  instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_fc_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_fc_current_pointer (
  account_id BIGINT NOT NULL,
  surface_key TEXT NOT NULL,
  ledger_entry_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  ledger_status fc_ledger_status NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, surface_key)
);

CREATE TABLE agent_fc_ledger_catalog (
  account_id BIGINT NOT NULL,
  ledger_entry_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  status fc_ledger_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  fact_body JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_entry_id),
  UNIQUE (account_id, surface_key, ledger_entry_id)
);

CREATE TABLE agent_fc_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status fc_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_resolve_units BIGINT NOT NULL CHECK (budget_resolve_units >= 0),
  budget_cite_units BIGINT NOT NULL CHECK (budget_cite_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_expand_units BIGINT NOT NULL CHECK (budget_expand_units >= 0),
  budget_refresh_units BIGINT NOT NULL CHECK (budget_refresh_units >= 0),
  consumed_resolve_units BIGINT NOT NULL CHECK (consumed_resolve_units >= 0),
  consumed_cite_units BIGINT NOT NULL CHECK (consumed_cite_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_expand_units BIGINT NOT NULL CHECK (consumed_expand_units >= 0),
  consumed_refresh_units BIGINT NOT NULL CHECK (consumed_refresh_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  max_related_fan_out SMALLINT NOT NULL
    CHECK (max_related_fan_out BETWEEN 0 AND 32),
  max_expand_depth SMALLINT NOT NULL
    CHECK (max_expand_depth BETWEEN 0 AND 8),
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
    REFERENCES agent_fc_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_fc_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_resolve_units <= budget_resolve_units),
  CHECK (consumed_cite_units <= budget_cite_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_expand_units <= budget_expand_units),
  CHECK (consumed_refresh_units <= budget_refresh_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_fc_resolution_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  ledger_entry_id UUID NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  resolution_hash CHAR(64) NOT NULL CHECK (length(resolution_hash) = 64),
  pointer_updated_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, surface_key, resolution_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id),
  FOREIGN KEY (account_id, ledger_entry_id)
    REFERENCES agent_fc_ledger_catalog (account_id, ledger_entry_id)
);

CREATE TABLE agent_fc_citation (
  account_id BIGINT NOT NULL,
  citation_id UUID NOT NULL,
  session_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  status fc_citation_status NOT NULL,
  ledger_entry_id UUID NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  resolution_hash CHAR(64) NOT NULL CHECK (length(resolution_hash) = 64),
  receipt_id UUID NOT NULL,
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, citation_id),
  UNIQUE (account_id, session_id, surface_key, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_fc_resolution_receipt (account_id, receipt_id),
  FOREIGN KEY (account_id, ledger_entry_id)
    REFERENCES agent_fc_ledger_catalog (account_id, ledger_entry_id)
);

CREATE TABLE agent_fc_subscription (
  account_id BIGINT NOT NULL,
  subscription_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, subscription_id),
  UNIQUE (account_id, session_id, citation_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_fc_citation (account_id, citation_id)
);

CREATE TABLE agent_fc_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  prior_ledger_entry_id UUID NOT NULL,
  next_ledger_entry_id UUID,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'POINTER_MOVED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, subscription_id)
    REFERENCES agent_fc_subscription (account_id, subscription_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_fc_citation (account_id, citation_id)
);

CREATE TABLE agent_fc_related_edge (
  account_id BIGINT NOT NULL,
  edge_id UUID NOT NULL,
  session_id UUID NOT NULL,
  from_citation_id UUID NOT NULL,
  to_surface_key TEXT NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 1 AND 8),
  expand_ordinal SMALLINT NOT NULL CHECK (expand_ordinal BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, edge_id),
  UNIQUE (account_id, session_id, from_citation_id, to_surface_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id),
  FOREIGN KEY (account_id, from_citation_id)
    REFERENCES agent_fc_citation (account_id, citation_id)
);

CREATE TABLE agent_fc_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  citation_id UUID NOT NULL,
  intent_status fc_refresh_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL
    CHECK (length(canonical_request_hash) = 64),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, refresh_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id),
  FOREIGN KEY (account_id, citation_id)
    REFERENCES agent_fc_citation (account_id, citation_id)
);

CREATE TABLE agent_fc_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('RESOLVE', 'CITE', 'VECTOR', 'EXPAND', 'REFRESH')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id)
);

CREATE TABLE agent_fc_conflict_record (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  session_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  left_citation_id UUID,
  right_ledger_entry_id UUID,
  conflict_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id)
);

CREATE TABLE agent_fc_human_resolution (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  session_id UUID NOT NULL,
  refresh_id UUID,
  conflict_id UUID,
  decision_code TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id)
);

CREATE TABLE agent_fc_command_result (
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

CREATE TABLE agent_fc_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_fc_audit_event (
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

CREATE TABLE agent_fc_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_fc_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status fc_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_fc_session (account_id, session_id)
);

CREATE TABLE agent_fc_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_fc_profile()
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
       OR NEW.citation_mode IS DISTINCT FROM OLD.citation_mode
       OR NEW.max_related_fan_out IS DISTINCT FROM OLD.max_related_fan_out
       OR NEW.max_expand_depth IS DISTINCT FROM OLD.max_expand_depth
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
    IF current_setting('app.fc_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.fc_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_fc_profile_protect
BEFORE INSERT OR UPDATE ON agent_fc_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_fc_profile();

CREATE FUNCTION protect_agent_fc_profile_surface_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status fc_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_fc_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile surface rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_fc_profile_surface_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_fc_profile_surface_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_fc_profile_surface_rule();

CREATE FUNCTION protect_agent_fc_citation()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_citation$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ledger_entry_id IS DISTINCT FROM OLD.ledger_entry_id
       OR NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.resolution_hash IS DISTINCT FROM OLD.resolution_hash
       OR NEW.surface_key IS DISTINCT FROM OLD.surface_key
       OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id THEN
      RAISE EXCEPTION 'citation identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_citation$;

CREATE TRIGGER agent_fc_citation_protect
BEFORE UPDATE ON agent_fc_citation
FOR EACH ROW EXECUTE FUNCTION protect_agent_fc_citation();

CREATE FUNCTION protect_agent_fc_refresh_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_refresh$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.intent_status IS DISTINCT FROM 'PREPARED' THEN
      RAISE EXCEPTION 'refresh intents must start as PREPARED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash
     OR OLD.provider_idempotency_key
       IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.citation_id IS DISTINCT FROM NEW.citation_id THEN
    RAISE EXCEPTION 'prepared refresh identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_refresh$;

CREATE TRIGGER agent_fc_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_fc_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_fc_refresh_intent();

CREATE FUNCTION approve_agent_fc_profile(
  tenant_id BIGINT,
  target_profile_id UUID,
  target_profile_version INTEGER,
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
  stored_status fc_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_fc_profile
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'profile approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO rule_count
  FROM agent_fc_profile_surface_rule
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one surface rule';
  END IF;

  PERFORM set_config(
    'app.fc_profile_approval',
    concat(
      target_profile_id::TEXT, ':',
      target_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_fc_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_fc_profile(
  tenant_id BIGINT,
  target_profile_id UUID,
  target_profile_version INTEGER,
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
  stored_status fc_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_fc_profile
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version
  FOR UPDATE;

  IF length(expected_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM expected_definition_hash THEN
    RAISE EXCEPTION 'profile revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.fc_profile_revocation',
    concat(
      target_profile_id::TEXT, ':',
      target_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_fc_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = target_profile_id
    AND profile_version = target_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_fc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_fc_profile_authority;
ALTER FUNCTION revoke_agent_fc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_fc_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_fc_profile_authority;
GRANT SELECT ON
  agent_fc_profile,
  agent_fc_profile_surface_rule
TO agent_fc_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_fc_profile TO agent_fc_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_fc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_fc_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_fc_profile FROM PUBLIC;

CREATE INDEX agent_fc_session_work_idx ON agent_fc_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_fc_session_profile_idx ON agent_fc_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_fc_citation_session_idx ON agent_fc_citation (
  account_id, session_id, sealed_at DESC, citation_id
);
CREATE INDEX agent_fc_citation_surface_idx ON agent_fc_citation (
  account_id, surface_key, sealed_at DESC, citation_id
);
CREATE INDEX agent_fc_pointer_updated_idx ON agent_fc_current_pointer (
  account_id, updated_at DESC, surface_key
);
CREATE INDEX agent_fc_ledger_surface_idx ON agent_fc_ledger_catalog (
  account_id, surface_key, published_at DESC, ledger_entry_id
);
CREATE INDEX agent_fc_subscription_active_idx ON agent_fc_subscription (
  account_id, active, surface_key, subscription_id
) WHERE active;
CREATE INDEX agent_fc_refresh_work_idx ON agent_fc_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_fc_audit_time_idx ON agent_fc_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_fc_perception_status_idx ON agent_fc_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_fc_command_expiry_idx ON agent_fc_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_fc_conflict_surface_idx ON agent_fc_conflict_record (
  account_id, surface_key, created_at DESC, conflict_id
);
CREATE INDEX agent_fc_invalidation_citation_idx ON agent_fc_invalidation (
  account_id, citation_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_fc_authorization_evidence',
    'agent_fc_profile',
    'agent_fc_profile_surface_rule',
    'agent_fc_current_pointer',
    'agent_fc_ledger_catalog',
    'agent_fc_session',
    'agent_fc_resolution_receipt',
    'agent_fc_citation',
    'agent_fc_subscription',
    'agent_fc_invalidation',
    'agent_fc_related_edge',
    'agent_fc_refresh_intent',
    'agent_fc_budget_ledger',
    'agent_fc_conflict_record',
    'agent_fc_human_resolution',
    'agent_fc_command_result',
    'agent_fc_audit_head',
    'agent_fc_audit_event',
    'agent_fc_audit_anchor',
    'agent_fc_perception_snapshot',
    'agent_fc_projection_checkpoint'
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

Open session, resolve+receipt, seal citation, subscribe, expand, prepare
refresh, and audit-chain append commit in one ACID transaction per command.
Pointer catalog ingestion from publication is separately watermarked.

### 8.2 Tenant isolation

Every table enables and forces RLS. Policies compare `account_id` to
`app.account_id`. Resolvers must set the GUC before query execution.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
refresh work returns durable state, not a synchronous consumer promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentFcSessionStatus {
  OPEN
  BINDING
  ACTIVE
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentFcCitationStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  RETRACTED_REF
  UNKNOWN_EFFECT
}

enum AgentFcCitationMode {
  PIN_HASH
  FOLLOW_CURRENT
}

enum AgentFcRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentFcNextAction {
  RESOLVE_SURFACE
  SEAL_CITATION
  SUBSCRIBE
  EXPAND_RELATED
  REFRESH_CITATION
  RESOLVE_REFRESH
  CLOSE_SESSION
}

enum AgentFcBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  REDACTION_DENY
  BUDGET_EXHAUSTED
  POINTER_MISSING
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

enum AgentFcUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_CITATION
  REQUIRE_HUMAN
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentFcBudget {
  resolveUnits: Long!
  citeUnits: Long!
  vectorUnits: Long!
  expandUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  maxRelatedFanOut: Int!
  maxExpandDepth: Int!
}

type AgentFcProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  citationMode: AgentFcCitationMode!
  maxRelatedFanOut: Int!
  maxExpandDepth: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentFcSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentFcSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentFcBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentFcResolutionReceipt {
  accountId: ID!
  sessionId: ID!
  surfaceKey: String!
  ledgerEntryId: ID!
  factHash: SHA256!
  pointerUpdatedAt: DateTime!
  resolutionHash: SHA256!
  resolvedAt: DateTime!
}

type AgentFcCitation {
  accountId: ID!
  citationId: ID!
  sessionId: ID!
  surfaceKey: String!
  status: AgentFcCitationStatus!
  ledgerEntryId: ID!
  factHash: SHA256!
  resolutionHash: SHA256!
  sealedAt: DateTime!
}

type AgentFcRefreshObservation {
  refreshId: ID!
  status: AgentFcRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentFcPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentFcSessionStatus!
  summary: AgentUntrustedText!
  sealedCitationCount: Int!
  invalidatedCitationCount: Int!
  uncertainRefreshes: [AgentFcRefreshObservation!]!
  remainingBudget: AgentFcBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentFcNextAction!]!
  blockedReasons: [AgentFcBlockedReason!]!
  cardHash: SHA256!
}

type AgentFcMutationResult {
  decision: String!
  session: AgentFcSession
  citation: AgentFcCitation
  receipt: AgentFcResolutionReceipt
  perception: AgentFcPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentFcBudgetInput {
  resolveUnits: Long!
  citeUnits: Long!
  vectorUnits: Long!
  expandUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  maxRelatedFanOut: Int!
  maxExpandDepth: Int!
}

input CreateFactConsumptionSessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentFcBudgetInput!
}

input ResolveFactSurfaceInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  surfaceKey: String!
  idempotencyKey: String!
}

input SealFactCitationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  surfaceKey: String!
  expectedLedgerEntryId: ID!
  expectedFactHash: SHA256!
  expectedResolutionHash: SHA256!
  idempotencyKey: String!
}

input SubscribeFactDependencyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  idempotencyKey: String!
}

input ExpandRelatedFactsInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  maxFanOut: Int!
  idempotencyKey: String!
}

input RefreshFactCitationInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  citationId: ID!
  idempotencyKey: String!
}

input ResolveRefreshUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentFcUncertaintyResolution!
  idempotencyKey: String!
}

input CloseFactConsumptionSessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentFcProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentFcProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentFcProfile
  agentFcSession(accountId: ID!, sessionId: ID!): AgentFcSession
  agentFcCitation(accountId: ID!, citationId: ID!): AgentFcCitation
  agentFcPerceptionCard(accountId: ID!, sessionId: ID!): AgentFcPerceptionCard
  agentFcCurrentFact(
    accountId: ID!
    surfaceKey: String!
  ): AgentFcResolutionReceipt
  agentFcSearchProfiles(input: AgentFcProfileSearchInput!): [AgentFcProfile!]!
}

type Mutation {
  createFactConsumptionSession(
    input: CreateFactConsumptionSessionInput!
  ): AgentFcMutationResult!
  resolveFactSurface(input: ResolveFactSurfaceInput!): AgentFcMutationResult!
  sealFactCitation(input: SealFactCitationInput!): AgentFcMutationResult!
  subscribeFactDependency(
    input: SubscribeFactDependencyInput!
  ): AgentFcMutationResult!
  expandRelatedFacts(input: ExpandRelatedFactsInput!): AgentFcMutationResult!
  refreshFactCitation(input: RefreshFactCitationInput!): AgentFcMutationResult!
  resolveRefreshUncertainty(
    input: ResolveRefreshUncertaintyInput!
  ): AgentFcMutationResult!
  closeFactConsumptionSession(
    input: CloseFactConsumptionSessionInput!
  ): AgentFcMutationResult!
  approveFactConsumptionProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    approverPrincipalId: ID!
  ): AgentFcMutationResult!
  revokeFactConsumptionProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentFcMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is capped (default 8, max 32).
- Expand mutations require `maxFanOut` <= remaining session fan-out.
- `agentFcCurrentFact` is a pointer lookup, not a ledger scan API.
- All root fields require explicit `accountId`.

## 10. Procedural memory

Approved consumption profiles are procedural memory: durable instructions for
how an agent may resolve, cite, subscribe, expand, and refresh published facts.
Surface-rule instructions and `procedure_ref` values tell agents which purpose
tags and citation modes are required. The engine executes only sealed profile
versions; models may propose drafts but cannot mutate approved procedure bytes.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery may use account-owned pgvector segments. The reference schema
stores embeddings with leading `account_id` and does not create a shared HNSW
index across tenants. Production builds one HNSW segment per account (or
account hash partition). Similarity never authorizes consumption.

```sql
CREATE TABLE agent_fc_profile_embedding (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dims INTEGER NOT NULL CHECK (embedding_dims > 0),
  embedding vector(1536) NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  source_watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, embedding_model),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_fc_profile (account_id, profile_id, profile_version)
);
```

Account-local HNSW guidance (not applied in the shared reference schema):

```sql
-- Production per-tenant segment only:
-- CREATE INDEX agent_fc_profile_embedding_hnsw
--   ON agent_fc_profile_embedding
--   USING hnsw (embedding vector_cosine_ops)
--   WHERE account_id = $<tenant>;
```

## 12. Agent perception

Agents receive perception cards, not raw ledger dumps. Cards expose session
status, sealed/invalidated citation counts, allowed next actions, blocked
reasons, uncertain refreshes, and budget remainders. Summaries are tagged
`UNTRUSTED_CONTENT` with provenance. Card hashes make UI and tool views
replayable.

## 13. ACID and consistency

### Row store

Authoritative session, citation, subscription, refresh prepare, and audit-chain
updates commit together for a single mutation.

### Columnar store

Async projections support analytics of citation churn and invalidation rates.
They are watermarked and never authoritative for citation identity.

### Vector store

Profile embeddings are eventually consistent with approved definition hashes.
Stale embeddings are ignored when `definition_hash` mismatches.

### External tools

Refresh consumers are outside ACID. After dispatch, uncertainty is explicit
`UNKNOWN_EFFECT` until receipt or human resolution.

## 14. Guardrails and neighbor protection

- Recursion depth / related fan-out caps prevent cite storms.
- Budget ledgers meter resolve, cite, vector, expand, and refresh units.
- Citation identity is immutable; refresh creates new receipts.
- Query admission rejects unscoped board scans (**FULL SCAN REJECTED**).
- Emergency containment can freeze profiles and quarantine sessions.
- Workload isolation keeps autonomous expand/refresh off interactive pools.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing sessions without `account_id` + status/time predicates.
- Resolving current facts by scanning all ledger catalog rows for a board.
- Semantic search without account partition predicates.
- Related-fact expansion without fan-out and depth caps.
- Audit replay without sequence bounds.

### Required access paths

All tenant indexes lead with `account_id`. Current facts use
`agent_fc_current_pointer`. Work queues use partial status indexes. Vector
search is account-segmented.

### Planner enforcement

Plans lacking a leading `account_id` predicate or attempting board-wide
unindexed JSON filters are rejected as **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Every profile approval, session open, resolve, citation seal, subscription,
invalidation, refresh transition, and human resolution appends to a per-tenant
hash chain with optional Merkle anchors. Replay reconstructs perception cards
and citation bindings without model calls.

## 17. Threat and failure analysis

- Prompt injection into surface keys: authorization uses profile rules and
  pointer identity, not natural language ranking.
- Cross-tenant embedding leakage: no shared HNSW; account_id leads storage.
- Stale citation reuse: PIN_HASH bindings detect `fact_hash` mismatch;
  FOLLOW_CURRENT requires explicit refresh.
- Refresh consumer timeout: intent becomes `UNKNOWN_EFFECT`, not false failure.
- Neighbor DoS via recursive related expand: budgets and fan-out caps.
- Pointer missing after retraction: resolve returns POINTER_MISSING; no scan
  fallback.

## 18. Observability and SLOs

- Resolve p99 latency via current-pointer lookup.
- Citation seal p99 commit latency.
- Invalidation lag from pointer move to subscriber event.
- Refresh `UNKNOWN_EFFECT` rate and time-to-resolution.
- Admission reject rate for FULL SCAN REJECTED.
- Availability target remains 99.99% for interactive tenant traffic.

## 19. Rollout

### Phase 1: shadow compilation

Compile profiles and validate pointer lookups without sealing citations.

### Phase 2: memory-only citations

Seal citations into decision-memory / working-set refs without tool writeback.

### Phase 3: subscribed invalidation

Enable dependency subscriptions and invalidation envelopes for low-impact
profiles.

### Phase 4: refresh uncertainty

Enable FOLLOW_CURRENT refresh intents with Open API uncertainty resolution.

### Phase 5: broad availability

Expose profile search, perception cards, and operator replay generally.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service contracts.
- GraphQL schema build with required queries and mutations.
- PostgreSQL DDL + pgvector embedding table execute under PGlite.
- Forced RLS on every relational table.

### Behavioral validation

- Reject duplicate idempotency keys.
- Reject sealed profile mutation and direct approval/revocation bypasses.
- Reject citation identity mutation and non-prepared refresh inserts.
- Reject mutation of sealed surface rules after approval.

### Scale and failure validation

- Prove account-leading indexes for 1M+ row boards.
- Prove refresh uncertainty path records `UNKNOWN_EFFECT`.
- Prove FULL SCAN REJECTED on unscoped plans.

## 21. Product decision

Adopt the Fact Consumption Plane as the deterministic bridge from published
ledger pointers to agent-safe citations and dependency invalidation. Keep
probabilistic generation in agents; keep resolve, cite, subscribe, expand,
refresh uncertainty, audit replay, and neighbor guardrails in mondayDB. Ship
the Open API GraphQL surface so every feature is automatable without privileged
UI-only paths.
