# mondayDB Agentic Fact Publication Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-05.v1`

## 1. Why this plane, before how

A grounding certificate proves that a claim is closed over authorized evidence.
It does not decide whether that claim should become an enterprise-visible fact
that other agents, automations, and humans may cite as organizational truth.

Without a publication plane, agents either:

- write board cells and hope observers infer the conclusion, or
- promote free-form memory that other agents treat as fact without supersession,
  purpose bounds, or dual-control for high-impact statements.

The product trade-off is **durable canonical publication versus agent fluency**:

- Letting every grounded claim become an immediate fact maximizes autonomy and
  reduces latency, but creates contradictory "truths," unauditable supersession,
  and neighbor-harmful fan-out when agents chase every new conclusion.
- Requiring a sealed publication draft, certificate consumption for
  `PUBLISH_CONCLUSION`, purpose-bound visibility, and deterministic supersession
  adds one bounded transaction and short-lived ledger storage.
- Semantic similarity may discover publication templates, but it must never
  decide whether a fact may be published, superseded, or retracted.

The recommended model keeps the data plane deterministic:

1. An approved fact-surface template defines what may be published and how it
   may be superseded.
2. A publication draft binds an active grounding certificate whose allowed
   operations include `PUBLISH_CONCLUSION`.
3. mondayDB verifies certificate liveness, purpose, redaction, dual-control when
   required, and budget fences inside ACID transactions.
4. Only a sealed ledger entry becomes the tenant's current fact for a surface
   key; supersession and retraction are first-class, hash-chained transitions.
5. External notification of publication is an outboxed intent that may become
   `UNKNOWN_EFFECT`, never a silent success.

The trade-off buys enterprise trust and 99.99% neighbor protection: recursive
"publish everything related" loops are budgeted and rejectable before they scan
boards with 1M+ rows (**FULL SCAN REJECTED**).

### Product outcome

For any published agent conclusion, mondayDB can answer:

- Which template, principal, and grounding certificate authorized it?
- What is the current fact for a surface key, and which entry did it supersede?
- Was publication visible under the declared purpose and redaction envelope?
- Did external notify become `UNKNOWN_EFFECT` after dispatch?
- Can the publication history be replayed without invoking an LLM?

## 2. Scope and ownership

The Fact Publication Plane owns:

1. Immutable approved fact-surface templates as procedural memory of "what may
   become an enterprise fact."
2. Tenant-scoped publication drafts bound to grounding certificates.
3. Deterministic publication, supersession, retraction, and quarantine.
4. Dual-control approvals for high-impact surfaces.
5. Outboxed notify intents with honest uncertainty.
6. Agent perception cards, audit replay, and bounded related-fact budgets.

It integrates with, but does not replace:

- **Grounding Assertion:** supplies certificates with `PUBLISH_CONCLUSION`.
- **Evidence Attestation / Redaction:** constrain what a published fact may cite.
- **Decision Memory:** may reference published ledger entries, not drafts.
- **Effect Saga / Tool Execution:** may notify external systems after publish.
- **Emergency Containment:** can freeze publication or quarantine ledger entries.
- **Query Governor / Budgets:** reserves publish, vector, and notify units.
- **Multi-Agent Coordination:** claims exclusive publication of a surface key.

### Non-goals

- Letting an LLM decide publication success or supersession winners.
- Reconstructing publication state from columnar or vector projections.
- Cross-account fact surfaces or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext.
- Claiming distributed atomicity with external notification providers.
- Unbounded recursive related-fact expansion across boards with 1M+ rows.

## 3. Product contract

### 3.1 Fact-surface template contract

A surface template version is immutable after approval. It defines:

- a typed fact schema and canonical surface key expression;
- required grounding certificate operations;
- supersession policy (`REPLACE`, `VERSIONED_CHAIN`, `APPEND_ONLY`);
- dual-control requirements and impact class;
- visibility defaults and max related-fact fan-out;
- notify affordances and budgets;
- optional procedural refs for "how to phrase and route publication."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
publications; in-flight drafts follow the captured revocation policy.

### 3.2 Publication contract

Creating a publication requires
`(account_id, principal_id, template_id, version, grounding_certificate_id,
idempotency_key, fact_body, purpose, budgets)`. The service validates current
authorization, canonicalizes the fact body, binds the certificate hash, and
records policy and ACL revisions.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Ledger contract

Publication commits mint an immutable ledger entry and optionally supersede the
previous current entry for the same `(account_id, surface_key)`. Currentness is
a deterministic pointer, not an LLM ranking. Retraction never deletes history;
it marks the entry non-citable and records a reason code.

### 3.4 Notify contract

External notify is prepared in the same ACID transaction as publication when
requested, then dispatched asynchronously. A timeout after dispatch is
`UNKNOWN_EFFECT`. Compensation or retry uses a new generation with the same
provider idempotency key policy.

### 3.5 Availability contract

Publication work must not hold row-store transactions open across external
provider calls. Budgets, deadlines, and admission protect 99.99% availability
for neighboring tenants and human interactive queries.

## 4. Deterministic invariants

1. Every row is scoped by `account_id`; RLS is forced on all plane tables.
2. Template approval and revocation occur only through security-definer
   authority functions owned by a dedicated `NOLOGIN` role.
3. Publications may start only as `DRAFT` and may bind only an `ACTIVE`
   grounding certificate that allows `PUBLISH_CONCLUSION`.
4. Certificate consumption for publication is recorded before the ledger entry
   becomes `CURRENT`.
5. Surface keys are unique for current facts within a tenant; supersession is
   linearizable per surface key.
6. Sealed publication bodies, certificate hashes, and ledger identity fields are
   immutable.
7. Notify intents must insert as `PREPARED`; identity fields cannot change after
   prepare.
8. Dual-control surfaces cannot reach `PUBLISHED` without a distinct approver.
9. Audit events form a per-tenant hash chain; perception cards never embed
   redacted plaintext.
10. Vector retrieval discovers templates only and never authorizes publication.
11. Planner rejects unscoped or unindexed access paths as **FULL SCAN REJECTED**.
12. Recursion depth for related-fact expansion is capped by template and budget.

## 5. Execution model

### 5.1 Template sealing

Authors create `DRAFT` templates and field definitions. Approval validates
schema, surface-key expression, dual-control rules, and budget ceilings, then
seals the definition hash.

### 5.2 Draft and bind

Agents create a publication draft with a fact body and grounding certificate
reference. mondayDB checks certificate status, operation allow-list, purpose
compatibility, and redaction envelopes, then seals bindings.

### 5.3 Dual-control and publish

If the surface impact class requires dual control, a distinct principal must
approve. Publish consumes the certificate operation slot, mints a ledger entry,
updates the current pointer, and optionally prepares notify intents.

### 5.4 Supersede and retract

Supersession creates a new ledger entry that points at the prior entry.
Retraction marks an entry non-citable. Both are revision-fenced and audited.

### 5.5 External notify

Dispatchers claim prepared intents with generation fences. Receipts or
`UNKNOWN_EFFECT` are recorded without mutating ledger identity.

## 6. Lifecycle

### 6.1 Draft

Publication exists, bindings may be edited until sealed.

### 6.2 Awaiting approval

Dual-control surfaces wait for a distinct approver.

### 6.3 Publish

Certificate consumption and ledger mint occur atomically.

### 6.4 Notify

Optional external fan-out may become `UNKNOWN_EFFECT`.

### 6.5 Terminal states

`PUBLISHED`, `SUPERSEDED`, `RETRACTED`, `REJECTED`, `CANCELLED`, `EXPIRED`,
`FAILED`, and `UNKNOWN_EFFECT` (for notify-bound publications awaiting
resolution) are terminal or holding states with explicit next actions.

### 6.6 Retain

Ledger, audit, and perception snapshots are retained per enterprise policy.
Columnar projections are watermarked and non-authoritative.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type PublicationId = string;
type TemplateId = string;
type CertificateId = string;
type LedgerEntryId = string;
type Sha256 = string;
type Timestamp = string;
type SurfaceKey = string;

type TrustedNextAction =
  | "SEAL_BINDINGS"
  | "REQUEST_DUAL_CONTROL"
  | "PUBLISH"
  | "SUPERSEDE"
  | "RETRACT"
  | "RESOLVE_NOTIFY"
  | "CANCEL";

type PublicationBlockedReason =
  | "CERTIFICATE_INACTIVE"
  | "OPERATION_DENIED"
  | "DUAL_CONTROL_REQUIRED"
  | "PURPOSE_DENIED"
  | "REDACTION_DENY"
  | "BUDGET_EXHAUSTED"
  | "SURFACE_CONFLICT"
  | "POLICY_DENIED"
  | "UNKNOWN_EFFECT";

interface UntrustedText {
  readonly value: string;
  readonly provenance: "USER_INPUT" | "BOARD_VALUE" | "PROVIDER_VALUE" | "AGENT_DRAFT";
  readonly trust: "UNTRUSTED_CONTENT";
}

type TemplateStatus = "DRAFT" | "APPROVED" | "REVOKED";
type PublicationStatus =
  | "DRAFT"
  | "BINDINGS_SEALED"
  | "AWAITING_DUAL_CONTROL"
  | "PUBLISHING"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "RETRACTED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

type SupersessionPolicy = "REPLACE" | "VERSIONED_CHAIN" | "APPEND_ONLY";
type ImpactClass = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type LedgerStatus = "CURRENT" | "SUPERSEDED" | "RETRACTED" | "QUARANTINED";
type NotifyIntentStatus =
  | "PREPARED"
  | "DISPATCHED"
  | "ACKED"
  | "FAILED"
  | "UNKNOWN_EFFECT";

interface FactPublicationBudget {
  readonly readUnits: number;
  readonly publishUnits: number;
  readonly vectorUnits: number;
  readonly notifyUnits: number;
  readonly maxWallTimeMs: number;
  readonly maxRelatedFanOut: number;
}

interface FactSurfaceTemplate {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly name: string;
  readonly status: TemplateStatus;
  readonly definitionHash: Sha256;
  readonly supersessionPolicy: SupersessionPolicy;
  readonly impactClass: ImpactClass;
  readonly requiresDualControl: boolean;
  readonly maxRelatedFanOut: number;
  readonly semanticTags: readonly string[];
  readonly procedureRef: string | null;
}

interface FactPublication {
  readonly accountId: AccountId;
  readonly publicationId: PublicationId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly status: PublicationStatus;
  readonly stateRevision: bigint;
  readonly surfaceKey: SurfaceKey;
  readonly groundingCertificateId: CertificateId;
  readonly certificateHash: Sha256;
  readonly purpose: string;
  readonly factHash: Sha256;
  readonly factBody: Readonly<Record<string, unknown>>;
  readonly budget: FactPublicationBudget;
  readonly consumed: Omit<FactPublicationBudget, "maxWallTimeMs" | "maxRelatedFanOut">;
  readonly principalId: string;
  readonly deadlineAt: Timestamp;
  readonly ledgerEntryId: LedgerEntryId | null;
}

interface FactLedgerEntry {
  readonly accountId: AccountId;
  readonly ledgerEntryId: LedgerEntryId;
  readonly publicationId: PublicationId;
  readonly surfaceKey: SurfaceKey;
  readonly status: LedgerStatus;
  readonly factHash: Sha256;
  readonly supersedesEntryId: LedgerEntryId | null;
  readonly publishedAt: Timestamp;
  readonly citationCountBudget: number;
}

interface NotifyObservation {
  readonly notifyId: string;
  readonly status: NotifyIntentStatus;
  readonly providerIdempotencyKey: string;
  readonly generation: number;
  readonly lastErrorCode: string | null;
}

interface AgentFactPerceptionCard {
  readonly accountId: AccountId;
  readonly publicationId: PublicationId;
  readonly status: PublicationStatus;
  readonly surfaceKey: SurfaceKey;
  readonly summary: UntrustedText;
  readonly currentLedgerEntryId: LedgerEntryId | null;
  readonly uncertainNotifies: readonly NotifyObservation[];
  readonly remainingBudget: Omit<
    FactPublicationBudget,
    "maxWallTimeMs" | "maxRelatedFanOut"
  >;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly PublicationBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateFactPublicationInput {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly groundingCertificateId: CertificateId;
  readonly expectedCertificateHash: Sha256;
  readonly idempotencyKey: string;
  readonly purpose: string;
  readonly factBody: Readonly<Record<string, unknown>>;
  readonly budget: FactPublicationBudget;
}

interface SealFactBindingsInput {
  readonly accountId: AccountId;
  readonly publicationId: PublicationId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface ApproveFactDualControlInput {
  readonly accountId: AccountId;
  readonly publicationId: PublicationId;
  readonly expectedRevision: bigint;
  readonly approverPrincipalId: string;
  readonly idempotencyKey: string;
}

interface PublishFactInput {
  readonly accountId: AccountId;
  readonly publicationId: PublicationId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
  readonly notifyExternal: boolean;
}

interface SupersedeFactInput {
  readonly accountId: AccountId;
  readonly surfaceKey: SurfaceKey;
  readonly publicationId: PublicationId;
  readonly expectedCurrentEntryId: LedgerEntryId;
  readonly idempotencyKey: string;
}

interface RetractFactInput {
  readonly accountId: AccountId;
  readonly ledgerEntryId: LedgerEntryId;
  readonly reasonCode: string;
  readonly idempotencyKey: string;
}

type FactMutationDecision =
  | "ACCEPTED"
  | "IDEMPOTENT_REPLAY"
  | "REJECTED"
  | "CONFLICT"
  | "UNKNOWN_EFFECT";

interface FactMutationResult {
  readonly decision: FactMutationDecision;
  readonly publication?: FactPublication;
  readonly ledgerEntry?: FactLedgerEntry;
  readonly perception?: AgentFactPerceptionCard;
  readonly code?: string;
  readonly retryable: boolean;
  readonly reason?: string;
  readonly auditHash?: Sha256;
}
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production placement may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE fact_template_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE fact_publication_status AS ENUM (
  'DRAFT', 'BINDINGS_SEALED', 'AWAITING_DUAL_CONTROL', 'PUBLISHING',
  'PUBLISHED', 'SUPERSEDED', 'RETRACTED', 'REJECTED', 'CANCELLED',
  'EXPIRED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE fact_supersession_policy AS ENUM (
  'REPLACE', 'VERSIONED_CHAIN', 'APPEND_ONLY'
);
CREATE TYPE fact_impact_class AS ENUM (
  'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
);
CREATE TYPE fact_ledger_status AS ENUM (
  'CURRENT', 'SUPERSEDED', 'RETRACTED', 'QUARANTINED'
);
CREATE TYPE fact_notify_status AS ENUM (
  'PREPARED', 'DISPATCHED', 'ACKED', 'FAILED', 'UNKNOWN_EFFECT'
);
CREATE TYPE fact_status AS ENUM (
  'DRAFT', 'APPROVED', 'REVOKED'
);

CREATE ROLE agent_fact_template_authority NOLOGIN;

CREATE TABLE agent_fact_authorization_evidence (
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

CREATE TABLE agent_fact_surface_template (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  name TEXT NOT NULL,
  status fact_template_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  supersession_policy fact_supersession_policy NOT NULL,
  impact_class fact_impact_class NOT NULL,
  requires_dual_control BOOLEAN NOT NULL,
  max_related_fan_out SMALLINT NOT NULL
    CHECK (max_related_fan_out BETWEEN 0 AND 32),
  fact_schema JSONB NOT NULL,
  surface_key_expression TEXT NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  procedure_ref TEXT,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_PUBLISH', 'REQUIRE_CONTAINMENT'
    )
  ),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, template_id, template_version),
  UNIQUE (account_id, template_id, template_version, definition_hash),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_fact_authorization_evidence (account_id, evidence_id),
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
  CHECK (length(authorization_snapshot_hash) = 64),
  CHECK (
    (impact_class IN ('HIGH', 'CRITICAL') AND requires_dual_control)
    OR impact_class IN ('LOW', 'MEDIUM')
  )
);

CREATE TABLE agent_fact_surface_template_field (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  field_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 64),
  field_type TEXT NOT NULL,
  required BOOLEAN NOT NULL,
  citation_required BOOLEAN NOT NULL,
  instruction JSONB NOT NULL,
  PRIMARY KEY (account_id, template_id, template_version, field_id),
  UNIQUE (account_id, template_id, template_version, ordinal),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_fact_surface_template (
      account_id, template_id, template_version
    )
);

CREATE TABLE agent_fact_certificate_catalog (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  certificate_hash CHAR(64) NOT NULL CHECK (length(certificate_hash) = 64),
  assertion_id UUID NOT NULL,
  allows_publish_conclusion BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED')
  ),
  freshness_fence TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, certificate_id, certificate_hash)
);

CREATE TABLE agent_fact_publication (
  account_id BIGINT NOT NULL,
  publication_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  status fact_publication_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  surface_key TEXT NOT NULL,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  grounding_certificate_id UUID NOT NULL,
  certificate_hash CHAR(64) NOT NULL CHECK (length(certificate_hash) = 64),
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  fact_body JSONB NOT NULL,
  budget_read_units BIGINT NOT NULL CHECK (budget_read_units >= 0),
  budget_publish_units BIGINT NOT NULL CHECK (budget_publish_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_notify_units BIGINT NOT NULL CHECK (budget_notify_units >= 0),
  consumed_read_units BIGINT NOT NULL CHECK (consumed_read_units >= 0),
  consumed_publish_units BIGINT NOT NULL CHECK (consumed_publish_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_notify_units BIGINT NOT NULL CHECK (consumed_notify_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  max_related_fan_out SMALLINT NOT NULL
    CHECK (max_related_fan_out BETWEEN 0 AND 32),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL,
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL,
  bindings_sealed BOOLEAN NOT NULL DEFAULT FALSE,
  dual_control_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ledger_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  terminal_outcome_hash CHAR(64),
  PRIMARY KEY (account_id, publication_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, publication_id, template_id, template_version),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_fact_surface_template (
      account_id, template_id, template_version
    ),
  FOREIGN KEY (account_id, grounding_certificate_id)
    REFERENCES agent_fact_certificate_catalog (account_id, certificate_id),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_fact_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_read_units <= budget_read_units),
  CHECK (consumed_publish_units <= budget_publish_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_notify_units <= budget_notify_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_fact_publication_binding (
  account_id BIGINT NOT NULL,
  publication_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  certificate_hash CHAR(64) NOT NULL CHECK (length(certificate_hash) = 64),
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 1 AND 8),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, publication_id, certificate_id),
  UNIQUE (account_id, publication_id, binding_ordinal),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_fact_certificate_catalog (account_id, certificate_id)
);

CREATE TABLE agent_fact_ledger_entry (
  account_id BIGINT NOT NULL,
  ledger_entry_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  status fact_ledger_status NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  fact_body JSONB NOT NULL,
  supersedes_entry_id UUID,
  citation_count_budget INTEGER NOT NULL
    CHECK (citation_count_budget BETWEEN 0 AND 1000000),
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_entry_id),
  UNIQUE (account_id, publication_id),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id),
  FOREIGN KEY (account_id, supersedes_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id)
);

CREATE TABLE agent_fact_current_pointer (
  account_id BIGINT NOT NULL,
  surface_key TEXT NOT NULL,
  ledger_entry_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  fact_hash CHAR(64) NOT NULL CHECK (length(fact_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, surface_key),
  FOREIGN KEY (account_id, ledger_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id)
);

CREATE TABLE agent_fact_supersession (
  account_id BIGINT NOT NULL,
  supersession_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  prior_entry_id UUID NOT NULL,
  next_entry_id UUID NOT NULL,
  reason_code TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, supersession_id),
  UNIQUE (account_id, next_entry_id),
  FOREIGN KEY (account_id, prior_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id),
  FOREIGN KEY (account_id, next_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id)
);

CREATE TABLE agent_fact_retraction (
  account_id BIGINT NOT NULL,
  retraction_id UUID NOT NULL,
  ledger_entry_id UUID NOT NULL,
  reason_code TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, retraction_id),
  UNIQUE (account_id, ledger_entry_id),
  FOREIGN KEY (account_id, ledger_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id)
);

CREATE TABLE agent_fact_dual_control_approval (
  account_id BIGINT NOT NULL,
  publication_id UUID NOT NULL,
  approver_principal_id TEXT NOT NULL,
  approval_hash CHAR(64) NOT NULL CHECK (length(approval_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, publication_id, approver_principal_id),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id)
);

CREATE TABLE agent_fact_notify_intent (
  account_id BIGINT NOT NULL,
  notify_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  ledger_entry_id UUID NOT NULL,
  intent_status fact_notify_status NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL
    CHECK (length(canonical_request_hash) = 64),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, notify_id),
  UNIQUE (account_id, provider_idempotency_key, generation),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id),
  FOREIGN KEY (account_id, ledger_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id)
);

CREATE TABLE agent_fact_budget_ledger (
  account_id BIGINT NOT NULL,
  publication_id UUID NOT NULL,
  sequence_no BIGINT NOT NULL CHECK (sequence_no >= 0),
  read_delta BIGINT NOT NULL,
  publish_delta BIGINT NOT NULL,
  vector_delta BIGINT NOT NULL,
  notify_delta BIGINT NOT NULL,
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, publication_id, sequence_no),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id)
);

CREATE TABLE agent_fact_visibility_grant (
  account_id BIGINT NOT NULL,
  ledger_entry_id UUID NOT NULL,
  grantee_principal_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  redaction_envelope_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_entry_id, grantee_principal_id, purpose),
  FOREIGN KEY (account_id, ledger_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id)
);

CREATE TABLE agent_fact_conflict_record (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  surface_key TEXT NOT NULL,
  left_entry_id UUID NOT NULL,
  right_entry_id UUID NOT NULL,
  conflict_code TEXT NOT NULL,
  resolution_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, conflict_id),
  FOREIGN KEY (account_id, left_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id),
  FOREIGN KEY (account_id, right_entry_id)
    REFERENCES agent_fact_ledger_entry (account_id, ledger_entry_id)
);

CREATE TABLE agent_fact_human_resolution (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  publication_id UUID NOT NULL,
  resolver_principal_id TEXT NOT NULL,
  resolution_code TEXT NOT NULL,
  notes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id)
);

CREATE TABLE agent_fact_command_result (
  account_id BIGINT NOT NULL,
  command_id UUID NOT NULL,
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

CREATE TABLE agent_fact_audit_head (
  account_id BIGINT NOT NULL,
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  event_sequence BIGINT NOT NULL CHECK (event_sequence >= 0),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_fact_audit_event (
  account_id BIGINT NOT NULL,
  event_sequence BIGINT NOT NULL CHECK (event_sequence >= 0),
  event_type TEXT NOT NULL,
  publication_id UUID,
  ledger_entry_id UUID,
  prev_hash CHAR(64) NOT NULL CHECK (length(prev_hash) = 64),
  event_hash CHAR(64) NOT NULL CHECK (length(event_hash) = 64),
  canonical_body JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_sequence)
);

CREATE TABLE agent_fact_audit_anchor (
  account_id BIGINT NOT NULL,
  anchor_id UUID NOT NULL,
  from_sequence BIGINT NOT NULL,
  to_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL CHECK (length(merkle_root) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, anchor_id),
  CHECK (from_sequence <= to_sequence)
);

CREATE TABLE agent_fact_perception_snapshot (
  account_id BIGINT NOT NULL,
  publication_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  status fact_publication_status NOT NULL,
  card_hash CHAR(64) NOT NULL CHECK (length(card_hash) = 64),
  card_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, publication_id, snapshot_id),
  FOREIGN KEY (account_id, publication_id)
    REFERENCES agent_fact_publication (account_id, publication_id)
);

CREATE TABLE agent_fact_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projection_name TEXT NOT NULL,
  watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projection_name)
);

CREATE FUNCTION protect_agent_fact_surface_template()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_template$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'templates must be inserted as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'APPROVED'
     AND NEW.status = 'APPROVED'
     AND (
       NEW.definition_hash IS DISTINCT FROM OLD.definition_hash
       OR NEW.fact_schema IS DISTINCT FROM OLD.fact_schema
       OR NEW.surface_key_expression IS DISTINCT FROM OLD.surface_key_expression
       OR NEW.supersession_policy IS DISTINCT FROM OLD.supersession_policy
       OR NEW.impact_class IS DISTINCT FROM OLD.impact_class
       OR NEW.requires_dual_control IS DISTINCT FROM OLD.requires_dual_control
     ) THEN
    RAISE EXCEPTION 'sealed template procedure is immutable';
  END IF;

  IF OLD.status = 'APPROVED' AND NEW.status = 'REVOKED' THEN
    IF current_setting('app.fact_template_revocation', true) IS DISTINCT FROM
       concat(
         OLD.template_id::TEXT, ':',
         OLD.template_version::TEXT, ':',
         OLD.definition_hash
       ) THEN
      RAISE EXCEPTION 'template revocation requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
    IF current_setting('app.fact_template_approval', true) IS DISTINCT FROM
       concat(
         OLD.template_id::TEXT, ':',
         OLD.template_version::TEXT, ':',
         OLD.definition_hash
       ) THEN
      RAISE EXCEPTION 'template approval requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status = 'DRAFT' AND NEW.status = 'APPROVED')
       OR (OLD.status = 'APPROVED' AND NEW.status = 'REVOKED')
     ) THEN
    RAISE EXCEPTION 'illegal template status transition';
  END IF;

  RETURN NEW;
END
$protect_template$;

CREATE TRIGGER agent_fact_surface_template_protect
BEFORE INSERT OR UPDATE ON agent_fact_surface_template
FOR EACH ROW EXECUTE FUNCTION protect_agent_fact_surface_template();

CREATE FUNCTION protect_agent_fact_surface_template_field()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_field$
DECLARE
  template_status fact_template_status;
BEGIN
  SELECT status INTO template_status
  FROM agent_fact_surface_template
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND template_id = COALESCE(NEW.template_id, OLD.template_id)
    AND template_version = COALESCE(NEW.template_version, OLD.template_version);

  IF template_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed template fields are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_field$;

CREATE TRIGGER agent_fact_surface_template_field_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_fact_surface_template_field
FOR EACH ROW EXECUTE FUNCTION protect_agent_fact_surface_template_field();

CREATE FUNCTION protect_agent_fact_publication_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_binding$
DECLARE
  sealed BOOLEAN;
BEGIN
  SELECT bindings_sealed INTO sealed
  FROM agent_fact_publication
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND publication_id = COALESCE(NEW.publication_id, OLD.publication_id);

  IF sealed THEN
    RAISE EXCEPTION 'sealed publication bindings are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$protect_binding$;

CREATE TRIGGER agent_fact_publication_binding_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_fact_publication_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_fact_publication_binding();

CREATE FUNCTION protect_agent_fact_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_ledger$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.fact_hash IS DISTINCT FROM OLD.fact_hash
       OR NEW.fact_body IS DISTINCT FROM OLD.fact_body
       OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
       OR NEW.surface_key IS DISTINCT FROM OLD.surface_key THEN
      RAISE EXCEPTION 'ledger identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END
$protect_ledger$;

CREATE TRIGGER agent_fact_ledger_entry_protect
BEFORE UPDATE ON agent_fact_ledger_entry
FOR EACH ROW EXECUTE FUNCTION protect_agent_fact_ledger_entry();

CREATE FUNCTION protect_agent_fact_notify_intent()
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
     OR OLD.ledger_entry_id IS DISTINCT FROM NEW.ledger_entry_id THEN
    RAISE EXCEPTION 'prepared notify identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_notify$;

CREATE TRIGGER agent_fact_notify_intent_protect
BEFORE INSERT OR UPDATE ON agent_fact_notify_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_fact_notify_intent();

CREATE FUNCTION approve_agent_fact_template(
  tenant_id BIGINT,
  target_template_id UUID,
  target_template_version INTEGER,
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
  stored_status fact_template_status;
  field_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_fact_surface_template
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'template approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO field_count
  FROM agent_fact_surface_template_field
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;

  IF field_count < 1 THEN
    RAISE EXCEPTION 'template requires at least one field';
  END IF;

  PERFORM set_config(
    'app.fact_template_approval',
    concat(
      target_template_id::TEXT, ':',
      target_template_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_fact_surface_template
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;
END
$approve$;

CREATE FUNCTION revoke_agent_fact_template(
  tenant_id BIGINT,
  target_template_id UUID,
  target_template_version INTEGER,
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
  stored_status fact_template_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_fact_surface_template
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version
  FOR UPDATE;

  IF length(expected_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'APPROVED'
     OR stored_hash IS DISTINCT FROM expected_definition_hash THEN
    RAISE EXCEPTION 'template revocation hash or state mismatch';
  END IF;

  PERFORM set_config(
    'app.fact_template_revocation',
    concat(
      target_template_id::TEXT, ':',
      target_template_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_fact_surface_template
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;
END
$revoke$;

ALTER FUNCTION approve_agent_fact_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_fact_template_authority;
ALTER FUNCTION revoke_agent_fact_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_fact_template_authority;

GRANT USAGE ON SCHEMA public TO agent_fact_template_authority;
GRANT SELECT ON
  agent_fact_surface_template,
  agent_fact_surface_template_field
TO agent_fact_template_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_fact_surface_template TO agent_fact_template_authority;

REVOKE ALL ON FUNCTION approve_agent_fact_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_fact_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_fact_surface_template FROM PUBLIC;

CREATE INDEX agent_fact_publication_work_idx ON agent_fact_publication (
  account_id, status, updated_at, publication_id
);
CREATE INDEX agent_fact_publication_template_idx
  ON agent_fact_publication (
  account_id, template_id, template_version, created_at DESC
);
CREATE INDEX agent_fact_publication_surface_idx
  ON agent_fact_publication (
  account_id, surface_key, created_at DESC, publication_id
);
CREATE INDEX agent_fact_ledger_surface_idx ON agent_fact_ledger_entry (
  account_id, surface_key, published_at DESC, ledger_entry_id
);
CREATE INDEX agent_fact_ledger_status_idx ON agent_fact_ledger_entry (
  account_id, status, published_at DESC, ledger_entry_id
);
CREATE INDEX agent_fact_notify_work_idx ON agent_fact_notify_intent (
  account_id, intent_status, updated_at, notify_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_fact_certificate_active_idx
  ON agent_fact_certificate_catalog (
  account_id, status, expires_at, certificate_id
) WHERE status = 'ACTIVE';
CREATE INDEX agent_fact_audit_time_idx ON agent_fact_audit_event (
  account_id, occurred_at, publication_id, event_sequence
);
CREATE INDEX agent_fact_perception_status_idx
  ON agent_fact_perception_snapshot (
  account_id, status, created_at DESC, publication_id
);
CREATE INDEX agent_fact_command_expiry_idx ON agent_fact_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_fact_conflict_surface_idx ON agent_fact_conflict_record (
  account_id, surface_key, created_at DESC, conflict_id
);
CREATE INDEX agent_fact_visibility_grantee_idx
  ON agent_fact_visibility_grant (
  account_id, grantee_principal_id, purpose, ledger_entry_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_fact_authorization_evidence',
    'agent_fact_surface_template',
    'agent_fact_surface_template_field',
    'agent_fact_certificate_catalog',
    'agent_fact_publication',
    'agent_fact_publication_binding',
    'agent_fact_ledger_entry',
    'agent_fact_current_pointer',
    'agent_fact_supersession',
    'agent_fact_retraction',
    'agent_fact_dual_control_approval',
    'agent_fact_notify_intent',
    'agent_fact_budget_ledger',
    'agent_fact_visibility_grant',
    'agent_fact_conflict_record',
    'agent_fact_human_resolution',
    'agent_fact_command_result',
    'agent_fact_audit_head',
    'agent_fact_audit_event',
    'agent_fact_audit_anchor',
    'agent_fact_perception_snapshot',
    'agent_fact_projection_checkpoint'
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

Publish, supersede, retract, dual-control approval, and notify prepare each run
in a single serializable (or equivalent tenant-fenced) transaction. External
provider I/O occurs only after commit of a `PREPARED` notify intent.

### 8.2 Tenant isolation

Every table leads with `account_id`, every access index leads with
`account_id`, and RLS is forced. Cross-tenant reads are impossible even for
security-definer helpers that forget an explicit predicate, because force-RLS
remains on.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
notify work returns durable state, not a synchronous provider promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentFactPublicationStatus {
  DRAFT
  BINDINGS_SEALED
  AWAITING_DUAL_CONTROL
  PUBLISHING
  PUBLISHED
  SUPERSEDED
  RETRACTED
  REJECTED
  CANCELLED
  EXPIRED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentFactSupersessionPolicy {
  REPLACE
  VERSIONED_CHAIN
  APPEND_ONLY
}

enum AgentFactImpactClass {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum AgentFactLedgerStatus {
  CURRENT
  SUPERSEDED
  RETRACTED
  QUARANTINED
}

enum AgentFactNotifyStatus {
  PREPARED
  DISPATCHED
  ACKED
  FAILED
  UNKNOWN_EFFECT
}

enum AgentFactNextAction {
  SEAL_BINDINGS
  REQUEST_DUAL_CONTROL
  PUBLISH
  SUPERSEDE
  RETRACT
  RESOLVE_NOTIFY
  CANCEL
}

enum AgentFactBlockedReason {
  CERTIFICATE_INACTIVE
  OPERATION_DENIED
  DUAL_CONTROL_REQUIRED
  PURPOSE_DENIED
  REDACTION_DENY
  BUDGET_EXHAUSTED
  SURFACE_CONFLICT
  POLICY_DENIED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentFactUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_RECEIPT
  REJECT_PUBLICATION
  REQUIRE_HUMAN
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentFactBudget {
  readUnits: Long!
  publishUnits: Long!
  vectorUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  maxRelatedFanOut: Int!
}

type AgentFactSurfaceTemplate {
  accountId: ID!
  templateId: ID!
  templateVersion: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  supersessionPolicy: AgentFactSupersessionPolicy!
  impactClass: AgentFactImpactClass!
  requiresDualControl: Boolean!
  maxRelatedFanOut: Int!
  semanticTags: [String!]!
  procedureRef: String
}

type AgentFactPublication {
  accountId: ID!
  publicationId: ID!
  templateId: ID!
  templateVersion: Int!
  status: AgentFactPublicationStatus!
  stateRevision: Long!
  surfaceKey: String!
  purpose: String!
  groundingCertificateId: ID!
  certificateHash: SHA256!
  factHash: SHA256!
  factBody: JSON!
  budget: AgentFactBudget!
  principalId: ID!
  deadlineAt: DateTime!
  ledgerEntryId: ID
}

type AgentFactLedgerEntry {
  accountId: ID!
  ledgerEntryId: ID!
  publicationId: ID!
  surfaceKey: String!
  status: AgentFactLedgerStatus!
  factHash: SHA256!
  supersedesEntryId: ID
  publishedAt: DateTime!
  citationCountBudget: Int!
}

type AgentFactNotifyObservation {
  notifyId: ID!
  status: AgentFactNotifyStatus!
  providerIdempotencyKey: String!
  generation: Int!
  lastErrorCode: String
}

type AgentFactPerceptionCard {
  accountId: ID!
  publicationId: ID!
  status: AgentFactPublicationStatus!
  surfaceKey: String!
  summary: AgentUntrustedText!
  currentLedgerEntryId: ID
  uncertainNotifies: [AgentFactNotifyObservation!]!
  remainingBudget: AgentFactBudget!
  procedureTags: [String!]!
  allowedNextActions: [AgentFactNextAction!]!
  blockedReasons: [AgentFactBlockedReason!]!
  cardHash: SHA256!
}

type AgentFactMutationResult {
  decision: String!
  publication: AgentFactPublication
  ledgerEntry: AgentFactLedgerEntry
  perception: AgentFactPerceptionCard
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

input AgentFactBudgetInput {
  readUnits: Long!
  publishUnits: Long!
  vectorUnits: Long!
  notifyUnits: Long!
  maxWallTimeMs: Long!
  maxRelatedFanOut: Int!
}

input CreateFactPublicationInput {
  accountId: ID!
  templateId: ID!
  templateVersion: Int!
  groundingCertificateId: ID!
  expectedCertificateHash: SHA256!
  idempotencyKey: String!
  purpose: String!
  factBody: JSON!
  budget: AgentFactBudgetInput!
}

input SealFactBindingsInput {
  accountId: ID!
  publicationId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input ApproveFactDualControlInput {
  accountId: ID!
  publicationId: ID!
  expectedRevision: Long!
  approverPrincipalId: ID!
  idempotencyKey: String!
}

input PublishFactInput {
  accountId: ID!
  publicationId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
  notifyExternal: Boolean!
}

input SupersedeFactInput {
  accountId: ID!
  surfaceKey: String!
  publicationId: ID!
  expectedCurrentEntryId: ID!
  idempotencyKey: String!
}

input RetractFactInput {
  accountId: ID!
  ledgerEntryId: ID!
  reasonCode: String!
  idempotencyKey: String!
}

input ResolveFactNotifyInput {
  accountId: ID!
  notifyId: ID!
  resolution: AgentFactUncertaintyResolution!
  idempotencyKey: String!
}

type Query {
  agentFactSurfaceTemplate(
    accountId: ID!
    templateId: ID!
    templateVersion: Int!
  ): AgentFactSurfaceTemplate
  agentFactPublication(
    accountId: ID!
    publicationId: ID!
  ): AgentFactPublication
  agentFactCurrent(
    accountId: ID!
    surfaceKey: String!
  ): AgentFactLedgerEntry
  agentFactLedgerEntry(
    accountId: ID!
    ledgerEntryId: ID!
  ): AgentFactLedgerEntry
  agentFactPerceptionCard(
    accountId: ID!
    publicationId: ID!
  ): AgentFactPerceptionCard
  agentFactTemplateSearch(
    accountId: ID!
    queryText: String!
    topK: Int!
  ): [AgentFactSurfaceTemplate!]!
}

type Mutation {
  createFactPublication(
    input: CreateFactPublicationInput!
  ): AgentFactMutationResult!
  sealFactBindings(
    input: SealFactBindingsInput!
  ): AgentFactMutationResult!
  approveFactDualControl(
    input: ApproveFactDualControlInput!
  ): AgentFactMutationResult!
  publishFact(
    input: PublishFactInput!
  ): AgentFactMutationResult!
  supersedeFact(
    input: SupersedeFactInput!
  ): AgentFactMutationResult!
  retractFact(
    input: RetractFactInput!
  ): AgentFactMutationResult!
  resolveFactNotify(
    input: ResolveFactNotifyInput!
  ): AgentFactMutationResult!
  cancelFactPublication(
    accountId: ID!
    publicationId: ID!
    expectedRevision: Long!
    idempotencyKey: String!
  ): AgentFactMutationResult!
  approveFactSurfaceTemplate(
    accountId: ID!
    templateId: ID!
    templateVersion: Int!
    definitionHash: SHA256!
  ): AgentFactSurfaceTemplate!
  revokeFactSurfaceTemplate(
    accountId: ID!
    templateId: ID!
    templateVersion: Int!
    definitionHash: SHA256!
  ): AgentFactSurfaceTemplate!
}
```

### GraphQL limits

- Every field requires explicit `accountId`.
- `agentFactTemplateSearch.topK` is capped (default 8, max 32).
- Related-fact fan-out is capped by template and remaining budget.
- Mutations are idempotent by `(accountId, operation, principal, key)`.
- List APIs are cursor-based; offset scans over 1M+ row boards are rejected.

## 10. Procedural memory

Approved fact-surface templates are procedural memory: durable instructions for
how an agent may publish, supersede, and retract conclusions. Field
instructions and `procedure_ref` values tell agents which evidence citations and
routing steps are required. The engine executes only sealed template versions;
models may propose drafts but cannot mutate approved procedure bytes.

## 11. Semantic retrieval and HNSW compatibility

Template discovery may use account-owned pgvector segments. The reference schema
stores embeddings with leading `account_id` and does not create a shared HNSW
index across tenants. Production builds one HNSW segment per account (or
account hash partition). Similarity never authorizes publication.

```sql
CREATE TABLE agent_fact_surface_template_embedding (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dims INTEGER NOT NULL CHECK (embedding_dims > 0),
  embedding vector(1536) NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  source_watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, template_id, template_version, embedding_model),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_fact_surface_template (
      account_id, template_id, template_version
    )
);
```

Account-local HNSW guidance (not applied in the shared reference schema):

```sql
-- Production per-tenant segment only:
-- CREATE INDEX agent_fact_template_embedding_hnsw
--   ON agent_fact_surface_template_embedding
--   USING hnsw (embedding vector_cosine_ops)
--   WHERE account_id = $<tenant>;
```

## 12. Agent perception

Agents receive perception cards, not raw ledger dumps. Cards expose status,
surface key, allowed next actions, blocked reasons, uncertain notifies, and
budget remainders. Summaries are tagged `UNTRUSTED_CONTENT` with provenance.
Card hashes make UI and tool views replayable.

## 13. ACID and consistency

### Row store

Authoritative publication, ledger, pointer, dual-control, notify prepare, and
audit-chain updates commit together for a single mutation.

### Columnar store

Async projections support analytics of publication rates and supersession
churn. They are watermarked and never authoritative for current facts.

### Vector store

Template embeddings are eventually consistent with approved definition hashes.
Stale embeddings are ignored when `definition_hash` mismatches.

### External tools

Notify providers are outside ACID. After dispatch, uncertainty is explicit
`UNKNOWN_EFFECT` until receipt or human resolution.

## 14. Guardrails and neighbor protection

- Recursion depth / related fan-out caps prevent publish storms.
- Budget ledgers meter read, publish, vector, and notify units.
- Dual-control blocks silent high-impact publication.
- Certificate consumption is single-use per publication path.
- Query admission rejects unscoped board scans (**FULL SCAN REJECTED**).
- Emergency containment can freeze templates and quarantine current pointers.
- Workload isolation keeps autonomous publication off interactive compute pools.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

- Listing publications without `account_id` + status/time predicates.
- Resolving current facts by scanning all ledger rows for a board.
- Semantic search without account partition predicates.
- Related-fact expansion without fan-out and depth caps.
- Audit replay without sequence bounds.

### Required access paths

All tenant indexes lead with `account_id`. Current facts use
`agent_fact_current_pointer`. Work queues use partial status indexes. Vector
search is account-segmented.

### Planner enforcement

Plans lacking a leading `account_id` predicate or attempting board-wide
unindexed JSON filters are rejected as **FULL SCAN REJECTED** before execution.

## 16. Auditability and replay

Every template approval, publication, supersession, retraction, dual-control
approval, notify transition, and human resolution appends to a per-tenant hash
chain with optional Merkle anchors. Replay reconstructs perception cards and
ledger pointers without model calls.

## 17. Threat and failure analysis

- Prompt injection into fact bodies: stored as untrusted content; authorization
  uses certificate and template hashes, not natural language.
- Cross-tenant embedding leakage: no shared HNSW; account_id leads storage.
- Certificate replay: consumption and publication idempotency keys prevent
  double publish.
- Dual-control bypass: distinct approver required; self-approval rejected.
- Provider timeout: notify becomes `UNKNOWN_EFFECT`, not false failure.
- Neighbor DoS via recursive related publish: budgets and fan-out caps.

## 18. Observability and SLOs

- Publish p99 commit latency excluding external notify.
- Dual-control wait time and abandonment rate.
- Supersession rate and conflict rate per surface.
- Notify `UNKNOWN_EFFECT` rate and time-to-resolution.
- Admission reject rate for FULL SCAN REJECTED.
- Availability target remains 99.99% for interactive tenant traffic.

## 19. Rollout

### Phase 1: shadow compilation

Compile templates and validate certificate bindings without ledger writes.

### Phase 2: memory-only publication

Publish to decision-memory citations without board-visible surfaces.

### Phase 3: low-impact surfaces

Enable `LOW`/`MEDIUM` surfaces with REPLACE supersession.

### Phase 4: dual-control high impact

Enable `HIGH`/`CRITICAL` with dual-control and Open API notify.

### Phase 5: broad availability

Expose template search, perception cards, and operator replay generally.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of service contracts.
- GraphQL schema build with required queries and mutations.
- PostgreSQL DDL + pgvector embedding table execute under PGlite.
- Forced RLS on every relational table.

### Behavioral validation

- Reject duplicate idempotency keys.
- Reject sealed template mutation and direct approval/revocation bypasses.
- Reject sealed binding mutation and non-prepared notify inserts.
- Reject ledger identity mutation after publish.

### Scale and failure validation

- Prove account-leading indexes for 1M+ row boards.
- Prove notify uncertainty path records `UNKNOWN_EFFECT`.
- Prove FULL SCAN REJECTED on unscoped plans.

## 21. Product decision

Adopt the Fact Publication Plane as the deterministic bridge from grounding
certificates to enterprise-visible, supersedable facts. Keep probabilistic
generation in agents; keep publication, supersession, dual-control, notify
uncertainty, audit replay, and neighbor guardrails in mondayDB. Ship the Open
API GraphQL surface so every feature is automatable without privileged UI-only
paths.
