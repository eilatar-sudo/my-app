# mondayDB Agentic Grant Graph Visibility Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-09.v1`

## 1. Why this plane, before how

A sealed citation share grant proves one hop of purpose-attenuated reuse between
a donor session and a recipient. It does not decide how **multi-hop** grant
graphs may be perceived: which transitive bindings are visible, at what hop
depth, under which further-narrowed attenuation hash, and without walking every
edge in an account.

Without a grant-graph visibility plane, agents either:

- recursively expand every outbound share edge from every recipient session
  (neighbor-harmful on boards with 1M+ rows and dense share graphs), or
- materialize sticky transitive citation copies without hop-bounded envelopes,
  so a two-hop incident share silently becomes a workspace-wide lateral view.

The product trade-off is **transitive reuse fluency versus hop-bounded purpose
isolation**:

- Letting every agent freely walk the grant graph maximizes fluency and reduces
  re-grounding cost, but creates purpose amplification across hops, unbounded
  recursive expansion, and unauditable lateral visibility.
- Compiling a sealed visibility envelope under an approved hop profile, seed
  edge point lookups, and hop budgets adds one bounded compilation transaction
  and short-lived envelope storage.
- Semantic similarity may discover visibility profiles, but it must never decide
  whether an edge may be seeded, expanded, sealed into an envelope, or refreshed.

The recommended model keeps the data plane deterministic:

1. An approved visibility profile defines max hops, allowed edge kinds, and how
   purpose must attenuate further at each hop.
2. A visibility session opens under purpose, budget, and authorization fences,
   and only seeds sealed share-binding edges by point lookup.
3. mondayDB expands hops under budget, then seals a visibility envelope binding
   `viewer_ref + purpose_hash + member_set_hash + hop_watermark`.
4. Edge invalidation marks envelopes stale; refresh intents may become
   `UNKNOWN_EFFECT` until acknowledged.
5. Unscoped graph walks are **FULL SCAN REJECTED**.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"expand every related grant forever" loops are rejectable before they scan
boards with 1M+ rows.

### Product outcome

For any grant-graph visibility compilation, mondayDB can answer:

- Which profile, principal, and session authorized the envelope?
- Which seed edges, hop depths, and attenuated purposes were bound?
- Is the envelope still current, invalidated, or awaiting refresh?
- Did async envelope refresh become `UNKNOWN_EFFECT`?
- Can the visibility history be replayed without invoking an LLM?

## 2. Scope and ownership

The Grant Graph Visibility Plane owns:

1. Immutable approved visibility profiles as procedural memory of "how an agent
   may compile multi-hop grant visibility under hop and attenuation fences."
2. Tenant-scoped visibility sessions with purpose and budget fences.
3. Deterministic seeding of sealed share-binding edges by point lookup — never
   donor-session or full grant-graph scans.
4. Hop expansion receipts and sealed visibility envelopes / members.
5. Invalidation and refresh intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded hop budgets.

It integrates with, but does not replace:

- **Citation Sharing / Materialization:** supply sealed share-binding edge IDs
  and invalidation events.
- **Fact Consumption / Grounding:** constrain what a visible binding may expose.
- **Working Set / Decision Memory:** may consume sealed envelopes, not raw
  transitive grant walks.
- **Transaction Intent / Effect Saga:** may execute envelope refresh under
  `UNKNOWN_EFFECT` honesty.
- **Query Governor / Budgets:** reserves seed, expand, vector, and refresh units.
- **Emergency Containment:** can freeze profiles or quarantine sessions.

### Non-goals

- Letting an LLM decide envelope membership or the "best" hop path.
- Reconstructing authoritative envelopes from columnar or vector projections.
- Cross-account grant visibility or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external refresh consumers.
- Unbounded recursive hop expansion across boards with 1M+ rows.

## 3. Product contract

### 3.1 Visibility profile contract

A visibility profile version is immutable after approval. It defines:

- allowed edge kinds (`SHARE_BINDING`, `MATERIALIZATION_REF`,
  `DECISION_MEMORY_REF`);
- max hop depth and max members per envelope;
- purpose attenuation rules (narrowing only; never amplification across hops);
- refresh policy after edge invalidation;
- optional procedural refs for "how to present hop-bounded visibility."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
sessions; in-flight sessions follow the captured revocation policy.

### 3.2 Session contract

Opening a session requires
`(account_id, principal_id, profile_id, version, purpose, budgets,
idempotency_key)`. The service validates authorization, captures policy and ACL
revisions, and reserves budgets.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Envelope contract

Seeding a sealed share-binding edge returns a seed receipt. Expanding a hop
binds parent edge, child edge, hop depth, and further attenuation hash. Sealing
a visibility envelope binds `viewer_ref`, `purpose_hash`, `member_set_hash`, and
`hop_watermark`. Envelope members never mutate identity; invalidation or
refresh creates a new state transition and optional refresh intent.

### 3.4 Invalidation and refresh contract

Invalidations bind envelopes to upstream edge revocation. Refresh intents start
as `PREPARED`, may become `UNKNOWN_EFFECT` when the refresh consumer does not
acknowledge, and never invent success from silence.

### 3.5 Availability contract

Visibility control-plane APIs target 99.99% availability for open, seed,
expand, seal, and perception reads. External refresh side-effects are
best-effort and surfaced as uncertainty rather than silent success.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; resolvers set `app.account_id` before
   query.
2. Profiles start as `DRAFT` and become `APPROVED` only through an authority-
   fenced approval function.
3. Sealed profile definitions and hop rules are immutable.
4. Envelope member identity
   (`edge_id`, `fact_hash`, `attenuation_hash`, `hop_depth`) is immutable after
   seal.
5. Purpose attenuation may only narrow across hops; amplification is rejected.
6. Edge seed uses point lookup by `(account_id, edge_id)` — never full graph
   scans.
7. Refresh intents start as `PREPARED` and may become `UNKNOWN_EFFECT`.
8. Audit events form a hash chain per account.
9. Semantic retrieval discovers profiles only; it never authorizes
   seed/expand/seal/refresh.
10. Plans that require unscoped board, session, or grant-graph scans are
    **FULL SCAN REJECTED**.

## 5. Execution model

### 5.1 Profile sealing

Draft profiles accumulate hop rules. Approval validates definition hash,
requires at least one hop rule, and fences the status transition.

### 5.2 Open session

Open validates an `APPROVED` profile, purpose compatibility, authorization
evidence, and budget reservation. Returns a session at revision 0.

### 5.3 Seed and expand

Seed looks up a sealed share-binding edge by primary key, verifies edge kind
and purpose attenuation, and emits a seed receipt. Expand walks one hop from
an already-seeded or expanded parent under CAS and hop budgets.

### 5.4 Seal envelope

Seal materializes immutable envelope members from accepted expansion steps and
binds `member_set_hash` under the session purpose hash.

### 5.5 Invalidate and refresh

Invalidation marks envelopes stale when upstream edges revoke or supersede.
Optional refresh intents recompile; unresolved external effects become
`UNKNOWN_EFFECT`.

## 6. Lifecycle

### 6.1 Draft profile

Authors create draft profiles and hop rules. No session may open.

### 6.2 Session open

An approved profile opens a visibility session with budgets and fences.

### 6.3 Envelope sealed

Seed + expand produce a sealed visibility envelope with immutable members.

### 6.4 Invalidated / refreshing

Upstream edge moves invalidate the envelope; refresh may be in flight.

### 6.5 Terminal states

Sessions close as `CLOSED`, `EXPIRED`, `CANCELLED`, `FAILED`, `QUARANTINED`,
or `UNKNOWN_EFFECT`.

### 6.6 Retain

Audit anchors and sealed envelopes retain enough to replay visibility without
LLM calls, subject to retention policy.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type ProfileId = string;
type SessionId = string;
type EdgeId = string;
type EnvelopeId = string;
type MemberId = string;
type Sha256 = string;
type Timestamp = string;
type ViewerRef = string;

type TrustedNextAction =
  | "SEED_GRANT_EDGE"
  | "EXPAND_HOP"
  | "SEAL_VISIBILITY_ENVELOPE"
  | "INVALIDATE_ENVELOPE"
  | "PREPARE_ENVELOPE_REFRESH"
  | "RESOLVE_REFRESH_UNCERTAINTY"
  | "CLOSE_SESSION";

type VisibilityBlockedReason =
  | "PROFILE_INACTIVE"
  | "PURPOSE_DENIED"
  | "ATTENUATION_DENIED"
  | "BUDGET_EXHAUSTED"
  | "EDGE_MISSING"
  | "HASH_MISMATCH"
  | "HOP_LIMIT_EXCEEDED"
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
  | "SEEDING"
  | "EXPANDING"
  | "ACTIVE"
  | "REFRESHING"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED"
  | "QUARANTINED"
  | "UNKNOWN_EFFECT";

type MemberStatus =
  | "SEALED"
  | "INVALIDATED"
  | "REFRESHING"
  | "SUPERSEDED_REF"
  | "UNKNOWN_EFFECT";

type EdgeKind = "SHARE_BINDING" | "MATERIALIZATION_REF" | "DECISION_MEMORY_REF";
type RefreshIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface GrantGraphVisibilityBudget {
  readonly seedUnits: number;
  readonly expandUnits: number;
  readonly vectorUnits: number;
  readonly sealUnits: number;
  readonly refreshUnits: number;
  readonly maxWallTimeMs: number;
  readonly maxHopDepth: number;
  readonly maxMembersPerEnvelope: number;
}

interface GrantGraphVisibilityProfile {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly name: string;
  readonly status: ProfileStatus;
  readonly definitionHash: Sha256;
  readonly maxHopDepth: number;
  readonly maxMembersPerEnvelope: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface GrantGraphVisibilitySession {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly status: SessionStatus;
  readonly stateRevision: bigint;
  readonly purpose: string;
  readonly budget: GrantGraphVisibilityBudget;
  readonly consumed: Omit<
    GrantGraphVisibilityBudget,
    "maxWallTimeMs" | "maxHopDepth" | "maxMembersPerEnvelope"
  >;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
}

interface GrantEdgeSeedReceipt {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly edgeId: EdgeId;
  readonly edgeKind: EdgeKind;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly seedHash: Sha256;
  readonly seededAt: Timestamp;
}

interface VisibilityEnvelopeMember {
  readonly accountId: AccountId;
  readonly memberId: MemberId;
  readonly envelopeId: EnvelopeId;
  readonly sessionId: SessionId;
  readonly edgeId: EdgeId;
  readonly edgeKind: EdgeKind;
  readonly hopDepth: number;
  readonly status: MemberStatus;
  readonly factHash: Sha256;
  readonly attenuationHash: Sha256;
  readonly sealedAt: Timestamp;
}

interface VisibilityEnvelope {
  readonly accountId: AccountId;
  readonly envelopeId: EnvelopeId;
  readonly sessionId: SessionId;
  readonly viewerRef: ViewerRef;
  readonly purposeHash: Sha256;
  readonly memberSetHash: Sha256;
  readonly hopWatermark: number;
  readonly sealedAt: Timestamp;
}

interface RefreshObservation {
  readonly refreshId: string;
  readonly status: RefreshIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentGrantGraphVisibilityPerceptionCard {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly summary: UntrustedText;
  readonly sealedMemberCount: number;
  readonly invalidatedMemberCount: number;
  readonly uncertainRefreshs: readonly RefreshObservation[];
  readonly remainingBudget: Omit<
    GrantGraphVisibilityBudget,
    "maxWallTimeMs" | "maxHopDepth" | "maxMembersPerEnvelope"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly VisibilityBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateGrantGraphVisibilitySessionInput {
  readonly accountId: AccountId;
  readonly profileId: ProfileId;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
  readonly budget: GrantGraphVisibilityBudget;
}

interface SeedGrantEdgeInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly edgeId: EdgeId;
  readonly expectedFactHash: Sha256;
  readonly idempotencyKey: string;
}

interface ExpandGrantHopInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly parentEdgeId: EdgeId;
  readonly childEdgeId: EdgeId;
  readonly expectedChildFactHash: Sha256;
  readonly expectedAttenuationHash: Sha256;
  readonly idempotencyKey: string;
}

interface SealVisibilityEnvelopeInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly viewerRef: ViewerRef;
  readonly expectedPurposeHash: Sha256;
  readonly expectedMemberSetHash: Sha256;
  readonly idempotencyKey: string;
}

interface InvalidateVisibilityEnvelopeInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly envelopeId: EnvelopeId;
  readonly edgeId: EdgeId;
  readonly idempotencyKey: string;
}

interface PrepareEnvelopeRefreshInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly envelopeId: EnvelopeId;
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
    | "REJECT_ENVELOPE"
    | "REQUIRE_HUMAN";
  readonly idempotencyKey: string;
}

interface CloseGrantGraphVisibilitySessionInput {
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

type GrantGraphVisibilityDecision =
  | { readonly decision: "ALLOWED"; readonly session: GrantGraphVisibilitySession;
      readonly envelope?: VisibilityEnvelope; readonly member?: VisibilityEnvelopeMember;
      readonly receipt?: GrantEdgeSeedReceipt;
      readonly perception: AgentGrantGraphVisibilityPerceptionCard;
      readonly auditHash: Sha256 }
  | { readonly decision: "REJECTED"; readonly code: VisibilityBlockedReason;
      readonly retryable: boolean; readonly reason: string;
      readonly perception?: AgentGrantGraphVisibilityPerceptionCard;
      readonly auditHash: Sha256 };
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production binding may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE gv_profile_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE gv_session_status AS ENUM (
  'OPEN', 'SEEDING', 'EXPANDING', 'ACTIVE', 'REFRESHING', 'CLOSED', 'EXPIRED',
  'CANCELLED', 'FAILED', 'QUARANTINED', 'UNKNOWN_EFFECT'
);
CREATE TYPE gv_member_status AS ENUM (
  'SEALED', 'INVALIDATED', 'REFRESHING', 'SUPERSEDED_REF', 'UNKNOWN_EFFECT'
);
CREATE TYPE gv_edge_kind AS ENUM (
  'SHARE_BINDING', 'MATERIALIZATION_REF', 'DECISION_MEMORY_REF'
);
CREATE TYPE gv_refresh_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE gv_edge_status AS ENUM (
  'SEALED', 'INVALIDATED', 'SUPERSEDED_REF', 'RETRACTED_REF', 'UNKNOWN_EFFECT'
);

CREATE ROLE agent_gv_profile_authority NOLOGIN;

CREATE TABLE agent_gv_authorization_evidence (
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

CREATE TABLE agent_gv_profile (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  name TEXT NOT NULL,
  status gv_profile_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  max_hop_depth SMALLINT NOT NULL
    CHECK (max_hop_depth BETWEEN 1 AND 8),
  max_members_per_envelope SMALLINT NOT NULL
    CHECK (max_members_per_envelope BETWEEN 1 AND 256),
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_EXPAND', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_gv_authorization_evidence (account_id, evidence_id),
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

CREATE TABLE agent_gv_profile_hop_rule (
  account_id BIGINT NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  allowed_edge_kinds TEXT[] NOT NULL,
  max_hop_depth SMALLINT NOT NULL CHECK (max_hop_depth BETWEEN 1 AND 8),
  require_refresh BOOLEAN NOT NULL,
  attenuation_instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, profile_id, profile_version, rule_id),
  UNIQUE (account_id, profile_id, profile_version, ordinal),
  FOREIGN KEY (account_id, profile_id, profile_version)
    REFERENCES agent_gv_profile (account_id, profile_id, profile_version)
);

CREATE TABLE agent_gv_edge_catalog (
  account_id BIGINT NOT NULL,
  edge_id UUID NOT NULL,
  share_binding_id UUID NOT NULL,
  donor_session_id UUID NOT NULL,
  recipient_ref TEXT NOT NULL,
  edge_kind gv_edge_kind NOT NULL,
  status gv_edge_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, edge_id),
  UNIQUE (account_id, share_binding_id, edge_kind)
);

CREATE TABLE agent_gv_session (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  profile_version INTEGER NOT NULL,
  status gv_session_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  budget_seed_units BIGINT NOT NULL CHECK (budget_seed_units >= 0),
  budget_expand_units BIGINT NOT NULL CHECK (budget_expand_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_seal_units BIGINT NOT NULL CHECK (budget_seal_units >= 0),
  budget_refresh_units BIGINT NOT NULL CHECK (budget_refresh_units >= 0),
  consumed_seed_units BIGINT NOT NULL CHECK (consumed_seed_units >= 0),
  consumed_expand_units BIGINT NOT NULL CHECK (consumed_expand_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_seal_units BIGINT NOT NULL CHECK (consumed_seal_units >= 0),
  consumed_refresh_units BIGINT NOT NULL CHECK (consumed_refresh_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  max_hop_depth SMALLINT NOT NULL
    CHECK (max_hop_depth BETWEEN 1 AND 8),
  max_members_per_envelope SMALLINT NOT NULL
    CHECK (max_members_per_envelope BETWEEN 1 AND 256),
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
    REFERENCES agent_gv_profile (account_id, profile_id, profile_version),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_gv_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_seed_units <= budget_seed_units),
  CHECK (consumed_expand_units <= budget_expand_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_seal_units <= budget_seal_units),
  CHECK (consumed_refresh_units <= budget_refresh_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_gv_seed_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  edge_id UUID NOT NULL,
  edge_kind gv_edge_kind NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  seed_hash CHAR(64) NOT NULL CHECK (length(seed_hash) = 64),
  seeded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, session_id, edge_id, seed_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id),
  FOREIGN KEY (account_id, edge_id)
    REFERENCES agent_gv_edge_catalog (account_id, edge_id)
);

CREATE TABLE agent_gv_expansion_step (
  account_id BIGINT NOT NULL,
  step_id UUID NOT NULL,
  session_id UUID NOT NULL,
  parent_edge_id UUID NOT NULL,
  child_edge_id UUID NOT NULL,
  hop_depth SMALLINT NOT NULL CHECK (hop_depth BETWEEN 1 AND 8),
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  expansion_hash CHAR(64) NOT NULL CHECK (length(expansion_hash) = 64),
  expanded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, step_id),
  UNIQUE (account_id, session_id, parent_edge_id, child_edge_id, hop_depth),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id),
  FOREIGN KEY (account_id, parent_edge_id)
    REFERENCES agent_gv_edge_catalog (account_id, edge_id),
  FOREIGN KEY (account_id, child_edge_id)
    REFERENCES agent_gv_edge_catalog (account_id, edge_id)
);

CREATE TABLE agent_gv_envelope (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  session_id UUID NOT NULL,
  viewer_ref TEXT NOT NULL,
  purpose_hash CHAR(64) NOT NULL CHECK (length(purpose_hash) = 64),
  member_set_hash CHAR(64) NOT NULL CHECK (length(member_set_hash) = 64),
  hop_watermark SMALLINT NOT NULL CHECK (hop_watermark BETWEEN 0 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id),
  UNIQUE (account_id, session_id, viewer_ref, sealed_revision),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id)
);

CREATE TABLE agent_gv_envelope_member (
  account_id BIGINT NOT NULL,
  member_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  session_id UUID NOT NULL,
  edge_id UUID NOT NULL,
  edge_kind gv_edge_kind NOT NULL,
  hop_depth SMALLINT NOT NULL CHECK (hop_depth BETWEEN 0 AND 8),
  status gv_member_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  attenuation_hash CHAR(64) NOT NULL CHECK (length(attenuation_hash) = 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  sealed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, member_id),
  UNIQUE (account_id, envelope_id, edge_id, hop_depth, sealed_revision),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_gv_envelope (account_id, envelope_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id),
  FOREIGN KEY (account_id, edge_id)
    REFERENCES agent_gv_edge_catalog (account_id, edge_id)
);

CREATE TABLE agent_gv_invalidation (
  account_id BIGINT NOT NULL,
  invalidation_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  edge_id UUID NOT NULL,
  prior_fact_hash CHAR(64) NOT NULL CHECK (length(prior_fact_hash) = 64),
  next_fact_hash CHAR(64),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('SUPERSEDED', 'RETRACTED', 'QUARANTINED', 'EDGE_REVOKED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, invalidation_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_gv_envelope (account_id, envelope_id),
  FOREIGN KEY (account_id, edge_id)
    REFERENCES agent_gv_edge_catalog (account_id, edge_id)
);

CREATE TABLE agent_gv_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  session_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  intent_status gv_refresh_status NOT NULL,
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
    REFERENCES agent_gv_session (account_id, session_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_gv_envelope (account_id, envelope_id)
);

CREATE TABLE agent_gv_budget_ledger (
  account_id BIGINT NOT NULL,
  session_id UUID NOT NULL,
  entry_sequence BIGINT NOT NULL CHECK (entry_sequence >= 0),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('SEED', 'EXPAND', 'VECTOR', 'SEAL', 'REFRESH')
  ),
  units BIGINT NOT NULL CHECK (units > 0),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, session_id, entry_sequence),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id)
);

CREATE TABLE agent_gv_conflict_record (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  session_id UUID NOT NULL,
  edge_id UUID NOT NULL,
  left_member_id UUID,
  right_hop_depth SMALLINT,
  conflict_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id)
);

CREATE TABLE agent_gv_human_resolution (
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
    REFERENCES agent_gv_session (account_id, session_id)
);

CREATE TABLE agent_gv_command_result (
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

CREATE TABLE agent_gv_audit_head (
  account_id BIGINT NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_gv_audit_event (
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

CREATE TABLE agent_gv_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (to_sequence >= from_sequence)
);

CREATE TABLE agent_gv_perception_snapshot (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  session_id UUID NOT NULL,
  status gv_session_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_gv_session (account_id, session_id)
);

CREATE TABLE agent_gv_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projector_name TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projector_name)
);

CREATE FUNCTION protect_agent_gv_profile()
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
       OR NEW.max_hop_depth IS DISTINCT FROM OLD.max_hop_depth
       OR NEW.max_members_per_envelope
         IS DISTINCT FROM OLD.max_members_per_envelope
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
    IF current_setting('app.gv_profile_revocation', true) IS DISTINCT FROM
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
    IF current_setting('app.gv_profile_approval', true) IS DISTINCT FROM
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

CREATE TRIGGER agent_gv_profile_protect
BEFORE INSERT OR UPDATE ON agent_gv_profile
FOR EACH ROW EXECUTE FUNCTION protect_agent_gv_profile();

CREATE FUNCTION protect_agent_gv_profile_hop_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_rule$
DECLARE
  profile_status gv_profile_status;
BEGIN
  SELECT status INTO profile_status
  FROM agent_gv_profile
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND profile_id = COALESCE(NEW.profile_id, OLD.profile_id)
    AND profile_version = COALESCE(NEW.profile_version, OLD.profile_version);

  IF profile_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed profile hop rules are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_rule$;

CREATE TRIGGER agent_gv_profile_hop_rule_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_gv_profile_hop_rule
FOR EACH ROW EXECUTE FUNCTION protect_agent_gv_profile_hop_rule();

CREATE FUNCTION protect_agent_gv_envelope_member()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_member$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.edge_id IS DISTINCT FROM OLD.edge_id
       OR NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.attenuation_hash IS DISTINCT FROM OLD.attenuation_hash
       OR NEW.hop_depth IS DISTINCT FROM OLD.hop_depth
       OR NEW.edge_kind IS DISTINCT FROM OLD.edge_kind
       OR NEW.envelope_id IS DISTINCT FROM OLD.envelope_id THEN
      RAISE EXCEPTION 'envelope member identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_member$;

CREATE TRIGGER agent_gv_envelope_member_protect
BEFORE UPDATE ON agent_gv_envelope_member
FOR EACH ROW EXECUTE FUNCTION protect_agent_gv_envelope_member();

CREATE FUNCTION protect_agent_gv_refresh_intent()
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
     OR OLD.envelope_id IS DISTINCT FROM NEW.envelope_id THEN
    RAISE EXCEPTION 'prepared refresh identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_refresh$;

CREATE TRIGGER agent_gv_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_gv_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_gv_refresh_intent();

CREATE FUNCTION approve_agent_gv_profile(
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
  stored_status gv_profile_status;
  rule_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_gv_profile
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
  FROM agent_gv_profile_hop_rule
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;

  IF rule_count < 1 THEN
    RAISE EXCEPTION 'profile requires at least one hop rule';
  END IF;

  PERFORM set_config(
    'app.gv_profile_approval',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_gv_profile
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$approve$;

CREATE FUNCTION revoke_agent_gv_profile(
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
  stored_status gv_profile_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_gv_profile
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
    'app.gv_profile_revocation',
    concat(
      recipient_profile_id::TEXT, ':',
      recipient_profile_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_gv_profile
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND profile_id = recipient_profile_id
    AND profile_version = recipient_profile_version;
END
$revoke$;

ALTER FUNCTION approve_agent_gv_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_gv_profile_authority;
ALTER FUNCTION revoke_agent_gv_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_gv_profile_authority;

GRANT USAGE ON SCHEMA public TO agent_gv_profile_authority;
GRANT SELECT ON
  agent_gv_profile,
  agent_gv_profile_hop_rule
TO agent_gv_profile_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_gv_profile TO agent_gv_profile_authority;

REVOKE ALL ON FUNCTION approve_agent_gv_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_gv_profile(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_gv_profile FROM PUBLIC;

CREATE INDEX agent_gv_session_work_idx ON agent_gv_session (
  account_id, status, updated_at, session_id
);
CREATE INDEX agent_gv_session_profile_idx ON agent_gv_session (
  account_id, profile_id, profile_version, created_at DESC
);
CREATE INDEX agent_gv_member_envelope_idx ON agent_gv_envelope_member (
  account_id, envelope_id, sealed_at DESC, member_id
);
CREATE INDEX agent_gv_member_edge_idx ON agent_gv_envelope_member (
  account_id, edge_id, sealed_at DESC, member_id
);
CREATE INDEX agent_gv_edge_recipient_idx ON agent_gv_edge_catalog (
  account_id, recipient_ref, sealed_at DESC, edge_id
);
CREATE INDEX agent_gv_edge_binding_idx ON agent_gv_edge_catalog (
  account_id, share_binding_id, sealed_at DESC, edge_id
);
CREATE INDEX agent_gv_expansion_session_idx ON agent_gv_expansion_step (
  account_id, session_id, hop_depth, expanded_at DESC
);
CREATE INDEX agent_gv_refresh_work_idx ON agent_gv_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_gv_audit_time_idx ON agent_gv_audit_event (
  account_id, occurred_at, session_id, event_sequence
);
CREATE INDEX agent_gv_perception_status_idx ON agent_gv_perception_snapshot (
  account_id, status, created_at DESC, session_id
);
CREATE INDEX agent_gv_command_expiry_idx ON agent_gv_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_gv_conflict_edge_idx ON agent_gv_conflict_record (
  account_id, edge_id, created_at DESC, conflict_id
);
CREATE INDEX agent_gv_invalidation_envelope_idx ON agent_gv_invalidation (
  account_id, envelope_id, created_at DESC, invalidation_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_gv_authorization_evidence',
    'agent_gv_profile',
    'agent_gv_profile_hop_rule',
    'agent_gv_edge_catalog',
    'agent_gv_session',
    'agent_gv_seed_receipt',
    'agent_gv_expansion_step',
    'agent_gv_envelope',
    'agent_gv_envelope_member',
    'agent_gv_invalidation',
    'agent_gv_refresh_intent',
    'agent_gv_budget_ledger',
    'agent_gv_conflict_record',
    'agent_gv_human_resolution',
    'agent_gv_command_result',
    'agent_gv_audit_head',
    'agent_gv_audit_event',
    'agent_gv_audit_anchor',
    'agent_gv_perception_snapshot',
    'agent_gv_projection_checkpoint'
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

Open session, seed+receipt, expand hop, seal envelope/members, invalidate,
prepare refresh, and audit-chain append commit in one ACID transaction per
command. External refresh acknowledgement is out of band.

### 8.2 Tenant isolation

Forced RLS on every table. Resolvers must `set_config('app.account_id', ...)`
before any read or write. Composite indexes all lead with `account_id`.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
refresh work returns durable state, not a synchronous board promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentGvSessionStatus {
  OPEN
  SEEDING
  EXPANDING
  ACTIVE
  REFRESHING
  CLOSED
  EXPIRED
  CANCELLED
  FAILED
  QUARANTINED
  UNKNOWN_EFFECT
}

enum AgentGvMemberStatus {
  SEALED
  INVALIDATED
  REFRESHING
  SUPERSEDED_REF
  UNKNOWN_EFFECT
}

enum AgentGvEdgeKind {
  SHARE_BINDING
  MATERIALIZATION_REF
  DECISION_MEMORY_REF
}

enum AgentGvRefreshStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentGvNextAction {
  SEED_GRANT_EDGE
  EXPAND_HOP
  SEAL_VISIBILITY_ENVELOPE
  INVALIDATE_ENVELOPE
  PREPARE_ENVELOPE_REFRESH
  RESOLVE_REFRESH_UNCERTAINTY
  CLOSE_SESSION
}

enum AgentGvBlockedReason {
  PROFILE_INACTIVE
  PURPOSE_DENIED
  ATTENUATION_DENIED
  BUDGET_EXHAUSTED
  EDGE_MISSING
  HASH_MISMATCH
  HOP_LIMIT_EXCEEDED
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentGvUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_ENVELOPE
  REQUIRE_HUMAN
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentGvBudget {
  seedUnits: Long!
  expandUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  maxHopDepth: Int!
  maxMembersPerEnvelope: Int!
}

type AgentGvProfile {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  maxHopDepth: Int!
  maxMembersPerEnvelope: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentGvSession {
  accountId: ID!
  sessionId: ID!
  profileId: ID!
  profileVersion: Int!
  status: AgentGvSessionStatus!
  stateRevision: Long!
  purpose: String!
  budget: AgentGvBudget!
  principalId: ID!
  deadlineAt: DateTime!
}

type AgentGvSeedReceipt {
  accountId: ID!
  sessionId: ID!
  edgeId: ID!
  edgeKind: AgentGvEdgeKind!
  factHash: SHA256!
  attenuationHash: SHA256!
  seedHash: SHA256!
  seededAt: DateTime!
}

type AgentGvEnvelope {
  accountId: ID!
  envelopeId: ID!
  sessionId: ID!
  viewerRef: String!
  purposeHash: SHA256!
  memberSetHash: SHA256!
  hopWatermark: Int!
  sealedAt: DateTime!
}

type AgentGvMember {
  accountId: ID!
  memberId: ID!
  envelopeId: ID!
  sessionId: ID!
  edgeId: ID!
  edgeKind: AgentGvEdgeKind!
  hopDepth: Int!
  status: AgentGvMemberStatus!
  factHash: SHA256!
  attenuationHash: SHA256!
  sealedAt: DateTime!
}

type AgentGvRefreshObservation {
  refreshId: ID!
  status: AgentGvRefreshStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentGvPerceptionCard {
  accountId: ID!
  sessionId: ID!
  status: AgentGvSessionStatus!
  summary: AgentUntrustedText!
  sealedMemberCount: Int!
  invalidatedMemberCount: Int!
  uncertainRefreshs: [AgentGvRefreshObservation!]!
  remainingBudget: AgentGvBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentGvNextAction!]!
  blockedReasons: [AgentGvBlockedReason!]!
  cardHash: SHA256!
}

type AgentGvMutationResult {
  decision: String!
  session: AgentGvSession
  envelope: AgentGvEnvelope
  member: AgentGvMember
  receipt: AgentGvSeedReceipt
  perception: AgentGvPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentGvBudgetInput {
  seedUnits: Long!
  expandUnits: Long!
  vectorUnits: Long!
  sealUnits: Long!
  refreshUnits: Long!
  maxWallTimeMs: Long!
  maxHopDepth: Int!
  maxMembersPerEnvelope: Int!
}

input CreateGrantGraphVisibilitySessionInput {
  accountId: ID!
  profileId: ID!
  profileVersion: Int!
  purpose: String!
  idempotencyKey: String!
  budget: AgentGvBudgetInput!
}

input SeedGrantEdgeInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  edgeId: ID!
  expectedFactHash: SHA256!
  idempotencyKey: String!
}

input ExpandGrantHopInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  parentEdgeId: ID!
  childEdgeId: ID!
  expectedChildFactHash: SHA256!
  expectedAttenuationHash: SHA256!
  idempotencyKey: String!
}

input SealVisibilityEnvelopeInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  viewerRef: String!
  expectedPurposeHash: SHA256!
  expectedMemberSetHash: SHA256!
  idempotencyKey: String!
}

input InvalidateVisibilityEnvelopeInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  envelopeId: ID!
  edgeId: ID!
  idempotencyKey: String!
}

input PrepareEnvelopeRefreshInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  envelopeId: ID!
  idempotencyKey: String!
}

input ResolveRefreshUncertaintyInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  refreshId: ID!
  resolution: AgentGvUncertaintyResolution!
  idempotencyKey: String!
}

input CloseGrantGraphVisibilitySessionInput {
  accountId: ID!
  sessionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input AgentGvProfileSearchInput {
  accountId: ID!
  queryText: String!
  topK: Int!
}

type Query {
  agentGvProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
  ): AgentGvProfile
  agentGvSession(accountId: ID!, sessionId: ID!): AgentGvSession
  agentGvEnvelope(accountId: ID!, envelopeId: ID!): AgentGvEnvelope
  agentGvPerceptionCard(accountId: ID!, sessionId: ID!): AgentGvPerceptionCard
  agentGvSeededEdge(
    accountId: ID!
    sessionId: ID!
    edgeId: ID!
  ): AgentGvSeedReceipt
  agentGvSearchProfiles(input: AgentGvProfileSearchInput!): [AgentGvProfile!]!
}

type Mutation {
  createGrantGraphVisibilitySession(
    input: CreateGrantGraphVisibilitySessionInput!
  ): AgentGvMutationResult!
  seedGrantEdge(input: SeedGrantEdgeInput!): AgentGvMutationResult!
  expandGrantHop(
    input: ExpandGrantHopInput!
  ): AgentGvMutationResult!
  sealVisibilityEnvelope(
    input: SealVisibilityEnvelopeInput!
  ): AgentGvMutationResult!
  invalidateVisibilityEnvelope(
    input: InvalidateVisibilityEnvelopeInput!
  ): AgentGvMutationResult!
  prepareEnvelopeRefresh(
    input: PrepareEnvelopeRefreshInput!
  ): AgentGvMutationResult!
  resolveRefreshUncertainty(
    input: ResolveRefreshUncertaintyInput!
  ): AgentGvMutationResult!
  closeGrantGraphVisibilitySession(
    input: CloseGrantGraphVisibilitySessionInput!
  ): AgentGvMutationResult!
  approveGrantGraphVisibilityProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    approverPrincipalId: ID!
  ): AgentGvMutationResult!
  revokeGrantGraphVisibilityProfile(
    accountId: ID!
    profileId: ID!
    profileVersion: Int!
    definitionHash: SHA256!
    revokerPrincipalId: ID!
  ): AgentGvMutationResult!
}
```

### GraphQL limits

- `topK` for profile search is clamped to `[1, 20]`.
- Expand mutations reject when hop depth exceeds session budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- Perception cards never embed raw redacted fact bodies.

## 10. Procedural memory

Approved visibility profiles are procedural memory: versioned instructions
for how agents may compile multi-hop grant visibility under further purpose
attenuation. Procedure refs point to presentation/routing steps. Agents
perceive procedure tags on perception cards; they never mutate sealed procedure
definitions.

## 11. Semantic retrieval and HNSW compatibility

Profile discovery uses account-owned embeddings. Similarity may rank candidate
profiles for a purpose string; authorization remains a deterministic point
lookup against `APPROVED` profiles. Production may create per-account HNSW
partitions; the reference schema stores vectors without a cross-tenant HNSW
index.

```sql
CREATE TABLE agent_gv_profile_embedding (
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
    REFERENCES agent_gv_profile (account_id, profile_id, profile_version)
);
```

Account-partitioned ANN guidance (production only):

```sql
-- Production guidance: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
-- must be created per account partition / tablespace, never as one shared
-- cross-tenant HNSW graph over all accounts.
SELECT account_id, profile_id
FROM agent_gv_profile_embedding
WHERE account_id = $1
ORDER BY embedding <=> $2
LIMIT $3;
```

## 12. Agent perception

Perception cards expose sealed/invalidated member counts, uncertain refreshes,
remaining budgets, procedure tags, and trusted next actions. Summaries are
`UntrustedText`. Agents must treat visible grant payloads as untrusted until the
envelope card reports sealed members with matching `fact_hash` values and
narrowed `attenuation_hash` values at each hop.

## 13. ACID and consistency

### Row store

Session CAS, seed, expand, seal, invalidate, refresh prepare, and audit append
are ACID. Envelope member identity is immutable after seal.

### Columnar store

Analytical synopsis of hop/expansion rates is eventually consistent and never
authoritative for seal/refresh decisions.

### Vector store

Profile embeddings are eventually consistent projections keyed by
`definition_hash` and watermark; they never authorize mutations.

### External tools

Envelope refresh consumers are out-of-band. Lack of acknowledgement yields
`UNKNOWN_EFFECT`, never inferred success.

## 14. Guardrails and neighbor protection

- Recursion/hop caps on members per envelope and per session.
- Budget ledgers for SEED/EXPAND/VECTOR/SEAL/REFRESH.
- Purpose attenuation narrowing only across hops.
- Forced RLS on every table.
- Planner rejects unscoped grant-graph/board scans as **FULL SCAN REJECTED**.
- Emergency containment may quarantine sessions without scanning neighbors.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Seeding edges by scanning donor or sharing sessions (rejected).
- Expanding hops by walking all outbound edges for an account (rejected).
- Vector search without `account_id` predicate (rejected).
- Invalidation by scanning all envelopes for an account (rejected; use
  edge-keyed active envelope member indexes).

### Required access paths

- Edge seed: PK `(account_id, edge_id)`.
- Members by envelope/edge: composite indexes leading with `account_id`.
- Refresh work: partial indexes on refresh intent status.
- Profile ANN: account-partitioned HNSW only.

### Planner enforcement

Any plan lacking an `account_id` equality predicate or requiring an unscoped
board/grant-graph scan is **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Each command appends a hash-chained audit event:
`event_hash = H(prev_hash || payload_hash || event_type || occurred_at)`.
Anchors Merkle-seal ranges for offline replay. Replay reconstructs session and
envelope state without LLM calls.

## 17. Threat and failure analysis

- Cross-tenant envelope via forged IDs: blocked by forced RLS and PK scope.
- Purpose amplification across hops: attenuation hash must narrow relative to
  parent and child purposes.
- Sticky transitive citation copies after supersession: invalidation +
  refresh uncertainty + profile revocation.
- Silent refresh success: `UNKNOWN_EFFECT` until ACK.
- Recursive hop storms: budget and **FULL SCAN REJECTED**.
- LLM-invented profile approval: authority-fenced approve/revoke only.

## 18. Observability and SLOs

- Open/seed/expand/seal/perception p99 latency budgets for 99.99% control-plane
  availability.
- Refresh ACK lag and `UNKNOWN_EFFECT` rate as first-class metrics.
- Hop-limit rejection and full-scan rejection counters per account.
- Audit chain gap alerts.

## 19. Rollout

### Phase 1: shadow compilation

Compile profiles and validate hop attenuation without durable envelopes.

### Phase 2: single-hop envelopes only

Allow sealed envelopes for hop depth 0–1 from seeded share bindings.

### Phase 3: multi-hop expand

Enable budgeted hop expansion under approved profiles.

### Phase 4: refresh uncertainty

Enable envelope refresh intents with `UNKNOWN_EFFECT` reconciliation.

### Phase 5: broad availability

Open approved profiles to autonomous agents under neighbor budgets.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service interfaces.
- GraphQL schema build with 6 queries and 10 mutations.
- PGlite + pgvector executable DDL with forced RLS.
- Negative invariant tests for approval, immutability, and refresh start
  state.

### Behavioral validation

- Seed requires sealed edge point lookup and hash match.
- Expand binds further attenuation and hop depth under budget.
- Seal binds immutable envelope members under member-set hash.
- Refresh silence becomes `UNKNOWN_EFFECT`.

### Scale and failure validation

- 1M+ row boards: no seed/expand path performs a full table scan.
- Neighbor budget exhaustion rejects before execution.
- Audit replay reconstructs sealed envelopes after process restart.

## 21. Product decision

Ship the Grant Graph Visibility Plane as the deterministic bridge from sealed
share bindings to hop-bounded, purpose-attenuated multi-hop visibility
envelopes. Keep semantic retrieval advisory for profile discovery only. Prefer
short-lived envelope refresh and honest `UNKNOWN_EFFECT` over sticky
unattenuated transitive citation copies. Reject unscoped grant-graph walks on
boards with 1M+ rows as **FULL SCAN REJECTED**, preserving 99.99% neighbor
isolation while making agent grant visibility procedural-memory-driven,
auditable, and replayable.
