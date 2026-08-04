# mondayDB Agentic Grounding Assertion Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-08-04.v1`

## 1. Why this plane, before how

An agent can retrieve evidence, run a saga, and still invent a conclusion.
mondayDB already stores citations, watermarks, redaction envelopes, and
decision receipts. What it still lacks is a deterministic gate that answers:

> Is this exact claim closed over authorized, non-revoked, freshness-bounded
> evidence that the current principal may see — before the claim can mutate a
> board, promote memory, or become a user-visible fact?

The product trade-off is **strict citation closure versus agent fluency**:

- Accepting free-form agent conclusions maximizes autonomy and latency, but
  allows hallucinated writes, stale memory promotion, and unauditable "facts."
- Requiring every assertive claim to bind a closed evidence set, verify
  freshness fences, and mint a grounding certificate adds one verification
  round trip and bounded storage.
- Semantic similarity may help discover claim templates, but it must never
  decide whether a claim is grounded.

The recommended model keeps the data plane deterministic and the agent
probabilistic:

1. The agent proposes a typed assertion against an approved claim template.
2. mondayDB binds exact evidence packet references in one tenant-scoped draft.
3. A deterministic verifier checks closure, visibility, redaction, revocation,
   purpose, and freshness inside ACID transactions.
4. Only a sealed grounding certificate may authorize writeback, memory
   promotion, or conclusion publication.
5. Under-grounded claims are rejected with machine-readable gaps, not silent
   partial trust.

The trade-off buys enterprise trust and 99.99% neighbor protection: expensive
recursive "find more evidence" loops are budgeted, fenced, and rejectable
before they scan boards with 1M+ rows.

### Product outcome

For any assertive agent claim, mondayDB can answer:

- Which template and principal proposed it?
- Which exact evidence packets closed the claim?
- Were those packets visible, unrevoked, and within the declared watermark?
- Did verification succeed, fail, or become `UNKNOWN_EFFECT` when an external
  evidence source timed out?
- Can the decision be replayed without invoking an LLM?

## 2. Scope and ownership

The Grounding Assertion Plane owns:

1. Immutable approved claim templates as procedural memory of "what may be
   asserted."
2. Tenant-scoped assertion drafts and sealed evidence bindings.
3. Deterministic verification runs with freshness fences and revocation checks.
4. Grounding certificates that authorize downstream effects.
5. Writeback and memory-promotion gates that consume certificates.
6. Agent perception cards, audit replay, and bounded gap remediation budgets.

It integrates with, but does not replace:

- **Evidence Attestation:** produces immutable evidence packets.
- **Temporal Grounding / Freshness:** supplies watermarks and bitemporal
  validity.
- **Redaction Perception:** projects what an agent may cite.
- **Decision Memory:** may store grounded conclusions only after certification.
- **Effect Saga / Tool Execution:** may require certificates before side
  effects that depend on a claim.
- **Emergency Containment:** can deny new assertions or quarantine certificates.
- **Query Governor / Budgets:** reserves verification and retrieval units.

### Non-goals

- Letting an LLM decide grounding success.
- Reconstructing grounding state from columnar or vector projections.
- Cross-account evidence closure or global nearest-neighbor authorization.
- Storing raw secrets, unrestricted tool payloads, or redacted plaintext in
  assertion rows.
- Claiming distributed atomicity with external evidence providers.
- Unbounded recursive evidence gathering across boards with 1M+ rows.

## 3. Product contract

### 3.1 Claim template contract

A claim template version is immutable after approval. It defines:

- a typed claim schema;
- required predicate identifiers;
- allowed evidence kinds and maximum binding cardinality;
- freshness policy (`LINEARIZABLE`, `SNAPSHOT`, `BOUNDED_STALENESS`);
- purpose and capability prerequisites;
- max remediation depth and verification budgets;
- optional procedural refs for "how to gather missing evidence."

Only `APPROVED` versions are discoverable or executable. Revocation blocks new
assertions; in-flight drafts follow the captured revocation policy.

### 3.2 Assertion contract

Creating an assertion requires
`(account_id, principal_id, template_id, version, idempotency_key, claim,
purpose, budgets, evidence_bindings)`. The service validates current
authorization, canonicalizes the claim itself, records policy and ACL
revisions, and stores bindings as an immutable set for that draft revision.

Every mutation supplies `expected_revision` and a command idempotency key.
State advances by compare-and-swap on `state_revision`.

### 3.3 Verification contract

Verification is deterministic and local to mondayDB state plus trusted evidence
packet metadata. It never asks a model "does this seem true?" It checks:

1. template approval and predicate coverage;
2. every binding exists in-account and is visible under the redaction envelope;
3. no bound evidence is revoked or fenced by erasure;
4. source watermarks satisfy the freshness policy;
5. purpose, consent, and runtime envelopes still allow the claim;
6. estimated and remaining budgets cover the verification path.

External evidence refresh, when required, uses the same honest effect model as
sagas: after dispatch, missing proof is `UNKNOWN_EFFECT`, never silent failure.

### 3.4 Certificate contract

A grounding certificate is append-only, hash-sealed, and short-lived. It
authorizes specific downstream operations (`WRITEBACK`, `MEMORY_PROMOTE`,
`PUBLISH_CONCLUSION`, `TOOL_PRECONDITION`). Consuming a certificate is an ACID
compare-and-swap that marks it `CONSUMED` or leaves it `EXPIRED` /
`REVOKED`. Certificates are not ambient authority and never outlive their
freshness fence without re-verification.

### 3.5 Availability contract

No network call occurs inside a mondayDB grounding transaction. Workers use
short leases and generation tokens for optional external refresh. Reads expose
the latest row-store revision immediately; analytics and semantic projections
expose explicit watermarks. Neighbor isolation remains first-class so one
agent's remediation loop cannot degrade the shared 99.99% data plane.

## 4. Deterministic invariants

1. `account_id` is the first column of every table, foreign key, primary key,
   unique key, and ordinary access-path index.
2. The authenticated account must exactly equal the GraphQL `accountId`.
3. An assertion references a template version and evidence packets in the same
   account only.
4. Approved template bytes and definition hash never change.
5. A tenant idempotency key identifies exactly one immutable create request.
6. State changes use compare-and-swap on `state_revision`.
7. Evidence bindings for a sealed draft are immutable; adding evidence creates
   a new draft revision.
8. Verification decisions are derived from stored hashes and metadata, not from
   model judgment.
9. Post-dispatch external refresh timeout is `UNKNOWN_EFFECT`, not `FAILED`.
10. Certificates authorize only declared operations and expire by fence.
11. Semantic retrieval returns template candidates only; admission verifies
    tenant, approval, version, policy, and budgets.
12. Runtime state is never reconstructed from columnar or vector layers.
13. Audit sequence, canonical bodies, and hashes are contiguous per assertion
    and periodically anchored.
14. Nested or recursive remediation depth, wall time, topK, and scan estimates
    are bounded; full board scans are rejected.
15. A completed, failed, cancelled, or expired assertion cannot return to an
    active drafting state without a new idempotent create.

## 5. Execution model

### 5.1 Template sealing

The compiler canonicalizes predicates, evidence kind allowlists, freshness
policy, and remediation instructions; validates cardinality and acyclicity of
procedural remediation refs; computes worst-case verification units; and hashes
the canonical result. Approval stores that hash and an authorization snapshot.

Draft rows are writable only through the compiler role. Database triggers make
approved/revoked template and predicate records immutable, except the single
`APPROVED -> REVOKED` transition with unchanged definition bytes. Approval and
revocation use security-definer procedures owned by a dedicated `NOLOGIN`
authority.

### 5.2 Draft and bind

Create locks no board rows. It inserts the assertion, immutable bindings,
budget reservation, and audit event in one transaction. Bindings store only
evidence identifiers, packet hashes, redaction envelope ids, and role in the
claim — never raw cited text when redacted.

### 5.3 Verify

The verifier:

1. locks the assertion by tenant composite key;
2. checks revision, lease generation, template status, and budgets;
3. point-looks up each binding by `(account_id, evidence_packet_id)`;
4. evaluates predicate closure and freshness fences;
5. writes a verification run, certificate or rejection gaps, perception
   snapshot, and audit event;
6. increments revision and commits.

Any failure rolls back the verification decision. Point lookups and keyset
cursors are mandatory; planners reject estimated full scans.

### 5.4 External refresh

When a freshness policy requires provider confirmation, preparation commits an
immutable refresh intent plus outbox message. After the point of no return,
timeout becomes `UNKNOWN_EFFECT`. Retry uses the same provider idempotency key
or an authorized human resolution.

### 5.5 Consume certificate

Writeback, memory promotion, and conclusion publication must present a live
certificate id and expected hash. The consuming transaction CASes the
certificate to `CONSUMED`, records the consumer operation id, and only then
performs the downstream mutation. Stale, expired, revoked, or already-consumed
certificates are rejected.

## 6. Lifecycle

### 6.1 Draft

`DRAFT` holds an unbound or partially bound claim. Binding may continue until
`SEAL_BINDINGS` freezes the evidence set for verification.

### 6.2 Verify

`VERIFYING` means a leased worker owns the deterministic checks. Success moves
to `GROUNDED` and mints a certificate. Failure moves to `REJECTED` with gap
codes. External refresh waits in `WAITING_REFRESH`; timeout yields
`UNKNOWN_EFFECT`.

### 6.3 Remediate

`NEEDS_EVIDENCE` exposes missing predicate gaps and approved procedural
memory refs. Remediation increments depth and consumes budget. Exceeding depth
or budget transitions to `REJECTED` or `NEEDS_HUMAN`.

### 6.4 Certify and consume

`GROUNDED` certificates may be consumed once per authorized operation class,
or re-issued after re-verification when fences expire.

### 6.5 Terminal states

`REJECTED`, `CANCELLED`, `EXPIRED`, and `FAILED` are terminal for that
assertion id. New work requires a new idempotent create.

### 6.6 Retain

Terminal assertions, certificates, and audit anchors retain according to the
account retention policy. Vector projections of templates remain watermarked
and account-owned.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type AssertionId = string;
type TemplateId = string;
type EvidencePacketId = string;
type CertificateId = string;
type Sha256 = string;
type Timestamp = string;
type PredicateId = string;

type TrustedNextAction =
  | "BIND_EVIDENCE"
  | "SEAL_BINDINGS"
  | "VERIFY"
  | "REQUEST_REFRESH"
  | "REMEDIATE"
  | "REQUEST_HUMAN_RESOLUTION"
  | "CONSUME_CERTIFICATE"
  | "CANCEL";

type AssertionBlockedReason =
  | "MISSING_EVIDENCE"
  | "FRESHNESS_FENCE"
  | "REDACTION_DENY"
  | "REVOKED_EVIDENCE"
  | "BUDGET_EXHAUSTED"
  | "POLICY_DENIED"
  | "WAITING_REFRESH"
  | "HUMAN_RESOLUTION_REQUIRED"
  | "UNKNOWN_EFFECT";

interface UntrustedText {
  readonly value: string;
  readonly provenance: "USER_INPUT" | "BOARD_VALUE" | "PROVIDER_VALUE" | "AGENT_DRAFT";
  readonly trust: "UNTRUSTED_CONTENT";
}

type TemplateStatus = "DRAFT" | "APPROVED" | "REVOKED";
type AssertionStatus =
  | "DRAFT"
  | "BINDINGS_SEALED"
  | "VERIFYING"
  | "WAITING_REFRESH"
  | "GROUNDED"
  | "REJECTED"
  | "NEEDS_EVIDENCE"
  | "NEEDS_HUMAN"
  | "UNKNOWN_EFFECT"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

type FreshnessPolicy =
  | "LINEARIZABLE"
  | "SNAPSHOT"
  | "BOUNDED_STALENESS";

type CertificateOperation =
  | "WRITEBACK"
  | "MEMORY_PROMOTE"
  | "PUBLISH_CONCLUSION"
  | "TOOL_PRECONDITION";

type CertificateStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "EXPIRED"
  | "REVOKED";

interface GroundingBudget {
  readonly readUnits: number;
  readonly verifyUnits: number;
  readonly vectorUnits: number;
  readonly toolUnits: number;
  readonly maxWallTimeMs: number;
  readonly maxRemediationDepth: number;
}

interface ClaimTemplate {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly version: number;
  readonly name: string;
  readonly status: TemplateStatus;
  readonly definitionHash: Sha256;
  readonly freshnessPolicy: FreshnessPolicy;
  readonly maxBindings: number;
  readonly predicates: readonly ClaimPredicate[];
  readonly allowedOperations: readonly CertificateOperation[];
}

interface ClaimPredicate {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly predicateId: PredicateId;
  readonly ordinal: number;
  readonly evidenceKinds: readonly string[];
  readonly minBindings: number;
  readonly maxBindings: number;
  readonly required: boolean;
  readonly instruction: Readonly<Record<string, unknown>>;
}

interface EvidenceBinding {
  readonly accountId: AccountId;
  readonly assertionId: AssertionId;
  readonly evidencePacketId: EvidencePacketId;
  readonly packetHash: Sha256;
  readonly predicateId: PredicateId;
  readonly redactionEnvelopeId: string;
  readonly role: "SUPPORTS" | "CONTRADICTS" | "CONTEXT";
}

interface GroundingAssertion {
  readonly accountId: AccountId;
  readonly assertionId: AssertionId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly status: AssertionStatus;
  readonly stateRevision: bigint;
  readonly purpose: UntrustedText;
  readonly claim: Readonly<Record<string, unknown>>;
  readonly claimHash: Sha256;
  readonly budget: GroundingBudget;
  readonly consumed: Omit<GroundingBudget, "maxWallTimeMs" | "maxRemediationDepth">;
  readonly remediationDepth: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

type RefreshObservation =
  | {
      readonly state: "NOT_DISPATCHED";
      readonly evidencePacketId: EvidencePacketId;
    }
  | {
      readonly state: "DISPATCHED_UNOBSERVED";
      readonly evidencePacketId: EvidencePacketId;
      readonly generation: bigint;
      readonly dispatchedAt: Timestamp;
    }
  | {
      readonly state: "OBSERVED";
      readonly evidencePacketId: EvidencePacketId;
      readonly packetHash: Sha256;
      readonly watermark: string;
    }
  | {
      readonly state: "UNKNOWN_EFFECT";
      readonly evidencePacketId: EvidencePacketId;
      readonly nextSafeActions: readonly (
        | "VERIFY"
        | "RETRY_SAME_KEY"
        | "HUMAN_RESOLUTION"
      )[];
    };

interface GroundingCertificate {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly assertionId: AssertionId;
  readonly status: CertificateStatus;
  readonly certificateHash: Sha256;
  readonly allowedOperations: readonly CertificateOperation[];
  readonly freshnessFence: string;
  readonly expiresAt: Timestamp;
  readonly consumedOperationId: string | null;
}

interface GroundingGap {
  readonly predicateId: PredicateId;
  readonly code:
    | "MISSING_BINDING"
    | "KIND_MISMATCH"
    | "REDACTED"
    | "REVOKED"
    | "STALE"
    | "CONTRADICTION"
    | "BUDGET"
    | "POLICY";
  readonly message: UntrustedText;
  readonly procedureRef: string | null;
}

interface AgentGroundingPerceptionCard {
  readonly accountId: AccountId;
  readonly assertionId: AssertionId;
  readonly revision: bigint;
  readonly status: AssertionStatus;
  readonly purpose: UntrustedText;
  readonly templateDefinitionHash: Sha256;
  readonly policyRevision: bigint;
  readonly grounded: boolean;
  readonly gaps: readonly GroundingGap[];
  readonly activeCertificateId: CertificateId | null;
  readonly uncertainRefreshes: readonly RefreshObservation[];
  readonly remainingBudget: Omit<
    GroundingBudget,
    "maxWallTimeMs" | "maxRemediationDepth"
  >;
  readonly remediationDepth: number;
  readonly maxRemediationDepth: number;
  readonly sourceWatermark: string;
  readonly deadlineAt: Timestamp;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly AssertionBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface CreateGroundingAssertionInput {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly idempotencyKey: string;
  readonly purpose: string;
  readonly claim: Readonly<Record<string, unknown>>;
  readonly budget: GroundingBudget;
  readonly bindings: readonly Omit<EvidenceBinding, "accountId" | "assertionId">[];
}

interface SealGroundingBindingsInput {
  readonly accountId: AccountId;
  readonly assertionId: AssertionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface VerifyGroundingAssertionInput {
  readonly accountId: AccountId;
  readonly assertionId: AssertionId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface ConsumeGroundingCertificateInput {
  readonly accountId: AccountId;
  readonly certificateId: CertificateId;
  readonly expectedCertificateHash: Sha256;
  readonly operation: CertificateOperation;
  readonly consumerOperationId: string;
  readonly idempotencyKey: string;
}

type GroundingMutationDecision =
  | "ACCEPTED"
  | "IDEMPOTENT_REPLAY"
  | "REJECTED"
  | "CONFLICT"
  | "UNKNOWN_EFFECT";

interface GroundingMutationResult {
  readonly decision: GroundingMutationDecision;
  readonly assertion?: GroundingAssertion;
  readonly certificate?: GroundingCertificate;
  readonly perception?: AgentGroundingPerceptionCard;
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
CREATE TYPE grounding_template_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE grounding_assertion_status AS ENUM (
  'DRAFT', 'BINDINGS_SEALED', 'VERIFYING', 'WAITING_REFRESH', 'GROUNDED',
  'REJECTED', 'NEEDS_EVIDENCE', 'NEEDS_HUMAN', 'UNKNOWN_EFFECT',
  'CANCELLED', 'EXPIRED', 'FAILED'
);
CREATE TYPE grounding_freshness_policy AS ENUM (
  'LINEARIZABLE', 'SNAPSHOT', 'BOUNDED_STALENESS'
);
CREATE TYPE grounding_binding_role AS ENUM (
  'SUPPORTS', 'CONTRADICTS', 'CONTEXT'
);
CREATE TYPE grounding_certificate_status AS ENUM (
  'ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED'
);
CREATE TYPE grounding_certificate_operation AS ENUM (
  'WRITEBACK', 'MEMORY_PROMOTE', 'PUBLISH_CONCLUSION', 'TOOL_PRECONDITION'
);
CREATE TYPE grounding_gap_code AS ENUM (
  'MISSING_BINDING', 'KIND_MISMATCH', 'REDACTED', 'REVOKED', 'STALE',
  'CONTRADICTION', 'BUDGET', 'POLICY'
);

CREATE ROLE agent_grounding_template_authority NOLOGIN;

CREATE TABLE agent_grounding_authorization_evidence (
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

CREATE TABLE agent_grounding_claim_template (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  name TEXT NOT NULL,
  status grounding_template_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  freshness_policy grounding_freshness_policy NOT NULL,
  max_bindings SMALLINT NOT NULL CHECK (max_bindings BETWEEN 1 AND 64),
  max_remediation_depth SMALLINT NOT NULL
    CHECK (max_remediation_depth BETWEEN 0 AND 8),
  allowed_operations grounding_certificate_operation[] NOT NULL,
  claim_schema JSONB NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_IN_FLIGHT', 'STOP_BEFORE_VERIFY', 'REQUIRE_CONTAINMENT'
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
    REFERENCES agent_grounding_authorization_evidence (account_id, evidence_id),
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
  CHECK (cardinality(allowed_operations) BETWEEN 1 AND 4)
);

CREATE TABLE agent_grounding_claim_template_predicate (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  predicate_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 32),
  evidence_kinds TEXT[] NOT NULL,
  min_bindings SMALLINT NOT NULL CHECK (min_bindings BETWEEN 0 AND 32),
  max_bindings SMALLINT NOT NULL CHECK (max_bindings BETWEEN 1 AND 32),
  required BOOLEAN NOT NULL,
  instruction JSONB NOT NULL,
  procedure_ref TEXT,
  PRIMARY KEY (account_id, template_id, template_version, predicate_id),
  UNIQUE (account_id, template_id, template_version, ordinal),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_grounding_claim_template (
      account_id, template_id, template_version
    ),
  CHECK (min_bindings <= max_bindings),
  CHECK (cardinality(evidence_kinds) BETWEEN 1 AND 16)
);

CREATE TABLE agent_grounding_evidence_catalog (
  account_id BIGINT NOT NULL,
  evidence_packet_id UUID NOT NULL,
  packet_hash CHAR(64) NOT NULL CHECK (length(packet_hash) = 64),
  evidence_kind TEXT NOT NULL,
  redaction_envelope_id TEXT NOT NULL,
  visibility_ok BOOLEAN NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  source_watermark TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, evidence_packet_id),
  UNIQUE (account_id, evidence_packet_id, packet_hash)
);

CREATE TABLE agent_grounding_assertion (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  status grounding_assertion_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  claim_hash CHAR(64) NOT NULL CHECK (length(claim_hash) = 64),
  claim_body JSONB NOT NULL,
  budget_read_units BIGINT NOT NULL CHECK (budget_read_units >= 0),
  budget_verify_units BIGINT NOT NULL CHECK (budget_verify_units >= 0),
  budget_vector_units BIGINT NOT NULL CHECK (budget_vector_units >= 0),
  budget_tool_units BIGINT NOT NULL CHECK (budget_tool_units >= 0),
  consumed_read_units BIGINT NOT NULL CHECK (consumed_read_units >= 0),
  consumed_verify_units BIGINT NOT NULL CHECK (consumed_verify_units >= 0),
  consumed_vector_units BIGINT NOT NULL CHECK (consumed_vector_units >= 0),
  consumed_tool_units BIGINT NOT NULL CHECK (consumed_tool_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  max_remediation_depth SMALLINT NOT NULL
    CHECK (max_remediation_depth BETWEEN 0 AND 8),
  remediation_depth SMALLINT NOT NULL DEFAULT 0
    CHECK (remediation_depth >= 0),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL,
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL,
  bindings_sealed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  terminal_outcome_hash CHAR(64),
  PRIMARY KEY (account_id, assertion_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, assertion_id, template_id, template_version),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_grounding_claim_template (
      account_id, template_id, template_version
    ),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_grounding_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_read_units <= budget_read_units),
  CHECK (consumed_verify_units <= budget_verify_units),
  CHECK (consumed_vector_units <= budget_vector_units),
  CHECK (consumed_tool_units <= budget_tool_units),
  CHECK (remediation_depth <= max_remediation_depth),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_grounding_evidence_binding (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  evidence_packet_id UUID NOT NULL,
  packet_hash CHAR(64) NOT NULL CHECK (length(packet_hash) = 64),
  predicate_id TEXT NOT NULL,
  redaction_envelope_id TEXT NOT NULL,
  binding_role grounding_binding_role NOT NULL,
  binding_ordinal SMALLINT NOT NULL CHECK (binding_ordinal BETWEEN 1 AND 64),
  sealed_revision BIGINT NOT NULL CHECK (sealed_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id, evidence_packet_id, predicate_id),
  UNIQUE (account_id, assertion_id, binding_ordinal),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  FOREIGN KEY (account_id, evidence_packet_id, packet_hash)
    REFERENCES agent_grounding_evidence_catalog (
      account_id, evidence_packet_id, packet_hash
    )
);

CREATE TABLE agent_grounding_verification_run (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  run_no SMALLINT NOT NULL CHECK (run_no BETWEEN 1 AND 16),
  status TEXT NOT NULL CHECK (
    status IN (
      'RUNNING', 'GROUNDED', 'REJECTED', 'NEEDS_EVIDENCE',
      'WAITING_REFRESH', 'UNKNOWN_EFFECT', 'FAILED'
    )
  ),
  lease_generation BIGINT NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  result_hash CHAR(64),
  freshness_fence TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, assertion_id, run_no),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id)
);

CREATE TABLE agent_grounding_gap (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  run_no SMALLINT NOT NULL,
  gap_ordinal SMALLINT NOT NULL CHECK (gap_ordinal BETWEEN 1 AND 64),
  predicate_id TEXT NOT NULL,
  gap_code grounding_gap_code NOT NULL,
  message TEXT NOT NULL,
  procedure_ref TEXT,
  PRIMARY KEY (account_id, assertion_id, run_no, gap_ordinal),
  FOREIGN KEY (account_id, assertion_id, run_no)
    REFERENCES agent_grounding_verification_run (
      account_id, assertion_id, run_no
    )
);

CREATE TABLE agent_grounding_certificate (
  account_id BIGINT NOT NULL,
  certificate_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  run_no SMALLINT NOT NULL,
  status grounding_certificate_status NOT NULL,
  certificate_hash CHAR(64) NOT NULL CHECK (length(certificate_hash) = 64),
  allowed_operations grounding_certificate_operation[] NOT NULL,
  freshness_fence TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_operation_id TEXT,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, certificate_id),
  UNIQUE (account_id, assertion_id, run_no),
  FOREIGN KEY (account_id, assertion_id, run_no)
    REFERENCES agent_grounding_verification_run (
      account_id, assertion_id, run_no
    ),
  CHECK (
    (status = 'CONSUMED' AND consumed_operation_id IS NOT NULL
      AND consumed_at IS NOT NULL) OR
    (status <> 'CONSUMED' AND consumed_operation_id IS NULL
      AND consumed_at IS NULL)
  ),
  CHECK (cardinality(allowed_operations) BETWEEN 1 AND 4)
);

CREATE TABLE agent_grounding_freshness_fence (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  fence_id UUID NOT NULL,
  policy grounding_freshness_policy NOT NULL,
  row_watermark TEXT NOT NULL,
  columnar_watermark TEXT NOT NULL,
  vector_watermark TEXT NOT NULL,
  fence_hash CHAR(64) NOT NULL CHECK (length(fence_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id, fence_id),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id)
);

CREATE TABLE agent_grounding_refresh_intent (
  account_id BIGINT NOT NULL,
  refresh_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  evidence_packet_id UUID NOT NULL,
  intent_status TEXT NOT NULL CHECK (
    intent_status IN (
      'PREPARED', 'DISPATCHED', 'OBSERVED', 'UNKNOWN_EFFECT', 'CANCELLED'
    )
  ),
  provider_idempotency_key TEXT NOT NULL,
  generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
  canonical_request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, refresh_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  FOREIGN KEY (account_id, evidence_packet_id)
    REFERENCES agent_grounding_evidence_catalog (
      account_id, evidence_packet_id
    ),
  CHECK (length(canonical_request_hash) = 64)
);

CREATE TABLE agent_grounding_budget_ledger (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
  entry_kind TEXT NOT NULL CHECK (
    entry_kind IN ('RESERVE', 'CONSUME', 'RELEASE', 'ADJUST')
  ),
  read_units BIGINT NOT NULL,
  verify_units BIGINT NOT NULL,
  vector_units BIGINT NOT NULL,
  tool_units BIGINT NOT NULL,
  balance_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id, ledger_sequence),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id)
);

CREATE TABLE agent_grounding_write_authorization (
  account_id BIGINT NOT NULL,
  authorization_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  operation grounding_certificate_operation NOT NULL,
  consumer_operation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, authorization_id),
  UNIQUE (account_id, consumer_operation_id),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_grounding_certificate (account_id, certificate_id)
);

CREATE TABLE agent_grounding_memory_gate (
  account_id BIGINT NOT NULL,
  gate_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  memory_target_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('AUTHORIZED', 'PROMOTED', 'DENIED', 'EXPIRED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, gate_id),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  FOREIGN KEY (account_id, certificate_id)
    REFERENCES agent_grounding_certificate (account_id, certificate_id)
);

CREATE TABLE agent_grounding_human_resolution (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  refresh_id UUID,
  decision TEXT NOT NULL CHECK (
    decision IN (
      'RETRY_SAME_KEY', 'ACCEPT_PACKET', 'REJECT_ASSERTION',
      'REQUIRE_NEW_EVIDENCE'
    )
  ),
  actor_id TEXT NOT NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id)
);

CREATE TABLE agent_grounding_command_result (
  account_id BIGINT NOT NULL,
  principal_id TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL,
  result_hash CHAR(64) NOT NULL,
  encrypted_result_ref TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id, principal_id, operation_name, idempotency_key
  )
);

CREATE TABLE agent_grounding_audit_head (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  head_sequence BIGINT NOT NULL CHECK (head_sequence >= 0),
  head_hash CHAR(64) NOT NULL CHECK (length(head_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id)
);

CREATE TABLE agent_grounding_audit_event (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  event_sequence BIGINT NOT NULL CHECK (event_sequence > 0),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  assertion_revision BIGINT NOT NULL,
  canonical_payload_hash CHAR(64) NOT NULL,
  previous_event_hash CHAR(64) NOT NULL,
  event_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id, event_sequence),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  CHECK (length(canonical_payload_hash) = 64),
  CHECK (length(previous_event_hash) = 64),
  CHECK (length(event_hash) = 64)
);

CREATE TABLE agent_grounding_audit_anchor (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  anchor_sequence BIGINT NOT NULL CHECK (anchor_sequence > 0),
  covered_through_sequence BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL,
  immutable_archive_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id, anchor_sequence),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  CHECK (length(merkle_root) = 64)
);

CREATE TABLE agent_grounding_perception_snapshot (
  account_id BIGINT NOT NULL,
  assertion_id UUID NOT NULL,
  revision BIGINT NOT NULL,
  status grounding_assertion_status NOT NULL,
  card_hash CHAR(64) NOT NULL,
  grounded_card JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, assertion_id, revision),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES agent_grounding_assertion (account_id, assertion_id),
  CHECK (length(card_hash) = 64)
);

CREATE TABLE agent_grounding_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projection_name TEXT NOT NULL,
  watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projection_name)
);

CREATE FUNCTION protect_agent_grounding_template()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_template$
DECLARE
  approval_fence TEXT;
  revocation_fence TEXT;
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
       NEW.definition_hash IS DISTINCT FROM OLD.definition_hash OR
       NEW.claim_schema IS DISTINCT FROM OLD.claim_schema OR
       NEW.freshness_policy IS DISTINCT FROM OLD.freshness_policy OR
       NEW.max_bindings IS DISTINCT FROM OLD.max_bindings OR
       NEW.allowed_operations IS DISTINCT FROM OLD.allowed_operations OR
       NEW.authorization_snapshot_hash
         IS DISTINCT FROM OLD.authorization_snapshot_hash
     ) THEN
    RAISE EXCEPTION 'approved grounding template is immutable';
  END IF;

  IF OLD.status = 'APPROVED' AND NEW.status = 'REVOKED' THEN
    revocation_fence := current_setting(
      'app.grounding_template_revocation', true
    );
    IF revocation_fence IS DISTINCT FROM concat(
      OLD.template_id::TEXT, ':',
      OLD.template_version::TEXT, ':',
      OLD.definition_hash
    ) THEN
      RAISE EXCEPTION 'template revocation requires authority fence';
    END IF;
    IF NEW.definition_hash IS DISTINCT FROM OLD.definition_hash THEN
      RAISE EXCEPTION 'revocation cannot alter definition hash';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
    approval_fence := current_setting(
      'app.grounding_template_approval', true
    );
    IF approval_fence IS DISTINCT FROM concat(
      OLD.template_id::TEXT, ':',
      OLD.template_version::TEXT, ':',
      NEW.definition_hash
    ) THEN
      RAISE EXCEPTION 'template approval requires authority fence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'illegal grounding template status transition';
  END IF;

  IF OLD.status IN ('APPROVED', 'REVOKED') THEN
    RAISE EXCEPTION 'sealed grounding template cannot be mutated';
  END IF;

  RETURN NEW;
END
$protect_template$;

CREATE TRIGGER agent_grounding_claim_template_protect
BEFORE INSERT OR UPDATE ON agent_grounding_claim_template
FOR EACH ROW EXECUTE FUNCTION protect_agent_grounding_template();

CREATE FUNCTION protect_agent_grounding_template_predicate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_predicate$
DECLARE
  template_status grounding_template_status;
BEGIN
  SELECT status INTO template_status
  FROM agent_grounding_claim_template
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND template_id = COALESCE(NEW.template_id, OLD.template_id)
    AND template_version = COALESCE(
      NEW.template_version, OLD.template_version
    );

  IF template_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed template predicates are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$protect_predicate$;

CREATE TRIGGER agent_grounding_claim_template_predicate_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_grounding_claim_template_predicate
FOR EACH ROW EXECUTE FUNCTION protect_agent_grounding_template_predicate();

CREATE FUNCTION protect_agent_grounding_bindings()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_bindings$
DECLARE
  sealed BOOLEAN;
BEGIN
  SELECT bindings_sealed INTO sealed
  FROM agent_grounding_assertion
  WHERE account_id = COALESCE(NEW.account_id, OLD.account_id)
    AND assertion_id = COALESCE(NEW.assertion_id, OLD.assertion_id);

  IF sealed THEN
    RAISE EXCEPTION 'sealed evidence bindings are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$protect_bindings$;

CREATE TRIGGER agent_grounding_evidence_binding_protect
BEFORE INSERT OR UPDATE OR DELETE ON agent_grounding_evidence_binding
FOR EACH ROW EXECUTE FUNCTION protect_agent_grounding_bindings();

CREATE FUNCTION protect_agent_grounding_certificate()
RETURNS trigger
LANGUAGE plpgsql
AS $protect_certificate$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'certificates must be inserted as ACTIVE';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'ACTIVE' AND NEW.status IN ('CONSUMED', 'EXPIRED', 'REVOKED') THEN
    IF NEW.certificate_hash IS DISTINCT FROM OLD.certificate_hash
       OR NEW.assertion_id IS DISTINCT FROM OLD.assertion_id
       OR NEW.allowed_operations IS DISTINCT FROM OLD.allowed_operations
       OR NEW.freshness_fence IS DISTINCT FROM OLD.freshness_fence THEN
      RAISE EXCEPTION 'certificate identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'illegal certificate transition';
END
$protect_certificate$;

CREATE TRIGGER agent_grounding_certificate_protect
BEFORE INSERT OR UPDATE ON agent_grounding_certificate
FOR EACH ROW EXECUTE FUNCTION protect_agent_grounding_certificate();

CREATE FUNCTION protect_agent_grounding_refresh_intent()
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
     OR OLD.evidence_packet_id IS DISTINCT FROM NEW.evidence_packet_id THEN
    RAISE EXCEPTION 'prepared refresh identity is immutable';
  END IF;

  RETURN NEW;
END
$protect_refresh$;

CREATE TRIGGER agent_grounding_refresh_intent_protect
BEFORE INSERT OR UPDATE ON agent_grounding_refresh_intent
FOR EACH ROW EXECUTE FUNCTION protect_agent_grounding_refresh_intent();

CREATE FUNCTION approve_agent_grounding_template(
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
  stored_status grounding_template_status;
  predicate_count INTEGER;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_grounding_claim_template
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'template approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO predicate_count
  FROM agent_grounding_claim_template_predicate
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;

  IF predicate_count < 1 THEN
    RAISE EXCEPTION 'template requires at least one predicate';
  END IF;

  PERFORM set_config(
    'app.grounding_template_approval',
    concat(
      target_template_id::TEXT, ':',
      target_template_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_grounding_claim_template
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;
END
$approve$;

CREATE FUNCTION revoke_agent_grounding_template(
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
  stored_status grounding_template_status;
BEGIN
  SELECT definition_hash, status
    INTO stored_hash, stored_status
  FROM agent_grounding_claim_template
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
    'app.grounding_template_revocation',
    concat(
      target_template_id::TEXT, ':',
      target_template_version::TEXT, ':',
      expected_definition_hash
    ),
    true
  );

  UPDATE agent_grounding_claim_template
  SET status = 'REVOKED',
      revoked_by = revoker_id,
      revoked_at = clock_timestamp()
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;
END
$revoke$;

ALTER FUNCTION approve_agent_grounding_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_grounding_template_authority;
ALTER FUNCTION revoke_agent_grounding_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) OWNER TO agent_grounding_template_authority;

GRANT USAGE ON SCHEMA public TO agent_grounding_template_authority;
GRANT SELECT ON
  agent_grounding_claim_template,
  agent_grounding_claim_template_predicate
TO agent_grounding_template_authority;
GRANT UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_grounding_claim_template TO agent_grounding_template_authority;

REVOKE ALL ON FUNCTION approve_agent_grounding_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_agent_grounding_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash,
  revoked_by, revoked_at
) ON agent_grounding_claim_template FROM PUBLIC;

CREATE INDEX agent_grounding_assertion_work_idx ON agent_grounding_assertion (
  account_id, status, updated_at, assertion_id
);
CREATE INDEX agent_grounding_assertion_template_idx
  ON agent_grounding_assertion (
  account_id, template_id, template_version, created_at DESC
);
CREATE INDEX agent_grounding_binding_packet_idx
  ON agent_grounding_evidence_binding (
  account_id, evidence_packet_id, assertion_id
);
CREATE INDEX agent_grounding_verification_work_idx
  ON agent_grounding_verification_run (
  account_id, status, started_at, assertion_id
) WHERE status IN ('RUNNING', 'WAITING_REFRESH', 'UNKNOWN_EFFECT');
CREATE INDEX agent_grounding_certificate_active_idx
  ON agent_grounding_certificate (
  account_id, status, expires_at, certificate_id
) WHERE status = 'ACTIVE';
CREATE INDEX agent_grounding_refresh_work_idx
  ON agent_grounding_refresh_intent (
  account_id, intent_status, updated_at, refresh_id
) WHERE intent_status IN ('PREPARED', 'DISPATCHED', 'UNKNOWN_EFFECT');
CREATE INDEX agent_grounding_evidence_kind_idx
  ON agent_grounding_evidence_catalog (
  account_id, evidence_kind, observed_at DESC, evidence_packet_id
);
CREATE INDEX agent_grounding_audit_time_idx ON agent_grounding_audit_event (
  account_id, occurred_at, assertion_id, event_sequence
);
CREATE INDEX agent_grounding_perception_status_idx
  ON agent_grounding_perception_snapshot (
  account_id, status, created_at DESC, assertion_id
);
CREATE INDEX agent_grounding_command_expiry_idx
  ON agent_grounding_command_result (
  account_id, expires_at, operation_name, principal_id
);
CREATE INDEX agent_grounding_memory_gate_status_idx
  ON agent_grounding_memory_gate (
  account_id, status, created_at DESC, gate_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_grounding_authorization_evidence',
    'agent_grounding_claim_template',
    'agent_grounding_claim_template_predicate',
    'agent_grounding_evidence_catalog',
    'agent_grounding_assertion',
    'agent_grounding_evidence_binding',
    'agent_grounding_verification_run',
    'agent_grounding_gap',
    'agent_grounding_certificate',
    'agent_grounding_freshness_fence',
    'agent_grounding_refresh_intent',
    'agent_grounding_budget_ledger',
    'agent_grounding_write_authorization',
    'agent_grounding_memory_gate',
    'agent_grounding_human_resolution',
    'agent_grounding_command_result',
    'agent_grounding_audit_head',
    'agent_grounding_audit_event',
    'agent_grounding_audit_anchor',
    'agent_grounding_perception_snapshot',
    'agent_grounding_projection_checkpoint'
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

Create, seal, verify, certify, consume, cancel, and human-resolution commands
each commit in one ACID transaction that updates assertion state, ledger,
audit head/event, and command result together. External refresh preparation
commits intent rows without holding board locks across the network. Certificate
consumption and the authorized downstream mutation share one transaction when
the consumer is a mondayDB write; external tool preconditions mint a short-lived
release token instead of holding an open DB transaction.

### 8.2 Tenant isolation

Every table leads with `account_id`, enables forced RLS, and compares against
`app.account_id`. Foreign keys never cross accounts. GraphQL resolvers still
enforce principal, board, template, certificate, and operation scopes after the
tenant check.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
refresh work returns durable state, not a synchronous provider promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentGroundingAssertionStatus {
  DRAFT
  BINDINGS_SEALED
  VERIFYING
  WAITING_REFRESH
  GROUNDED
  REJECTED
  NEEDS_EVIDENCE
  NEEDS_HUMAN
  UNKNOWN_EFFECT
  CANCELLED
  EXPIRED
  FAILED
}

enum AgentGroundingFreshnessPolicy {
  LINEARIZABLE
  SNAPSHOT
  BOUNDED_STALENESS
}

enum AgentGroundingCertificateOperation {
  WRITEBACK
  MEMORY_PROMOTE
  PUBLISH_CONCLUSION
  TOOL_PRECONDITION
}

enum AgentGroundingCertificateStatus {
  ACTIVE
  CONSUMED
  EXPIRED
  REVOKED
}

enum AgentGroundingGapCode {
  MISSING_BINDING
  KIND_MISMATCH
  REDACTED
  REVOKED
  STALE
  CONTRADICTION
  BUDGET
  POLICY
}

enum AgentGroundingNextAction {
  BIND_EVIDENCE
  SEAL_BINDINGS
  VERIFY
  REQUEST_REFRESH
  REMEDIATE
  REQUEST_HUMAN_RESOLUTION
  CONSUME_CERTIFICATE
  CANCEL
}

enum AgentGroundingBlockedReason {
  MISSING_EVIDENCE
  FRESHNESS_FENCE
  REDACTION_DENY
  REVOKED_EVIDENCE
  BUDGET_EXHAUSTED
  POLICY_DENIED
  WAITING_REFRESH
  HUMAN_RESOLUTION_REQUIRED
  UNKNOWN_EFFECT
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
  AGENT_DRAFT
}

enum AgentGroundingUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_PACKET
  REJECT_ASSERTION
  REQUIRE_NEW_EVIDENCE
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentGroundingTemplate {
  accountId: ID!
  templateId: ID!
  version: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  freshnessPolicy: AgentGroundingFreshnessPolicy!
  maxBindings: Int!
  maxRemediationDepth: Int!
  allowedOperations: [AgentGroundingCertificateOperation!]!
  semanticScore: Float
}

type AgentGroundingGap {
  predicateId: ID!
  code: AgentGroundingGapCode!
  message: AgentUntrustedText!
  procedureRef: String
}

type AgentGroundingCertificate {
  certificateId: ID!
  assertionId: ID!
  status: AgentGroundingCertificateStatus!
  certificateHash: SHA256!
  allowedOperations: [AgentGroundingCertificateOperation!]!
  freshnessFence: String!
  expiresAt: DateTime!
  consumedOperationId: String
}

type AgentGroundingAssertion {
  accountId: ID!
  assertionId: ID!
  templateId: ID!
  templateVersion: Int!
  status: AgentGroundingAssertionStatus!
  stateRevision: Long!
  purpose: AgentUntrustedText!
  claimHash: SHA256!
  remediationDepth: Int!
  maxRemediationDepth: Int!
  activeCertificate: AgentGroundingCertificate
  gaps: [AgentGroundingGap!]!
  createdAt: DateTime!
  updatedAt: DateTime!
  terminalOutcomeHash: SHA256
}

type AgentGroundingPerception {
  accountId: ID!
  assertionId: ID!
  revision: Long!
  status: AgentGroundingAssertionStatus!
  purpose: AgentUntrustedText!
  templateDefinitionHash: SHA256!
  policyRevision: Long!
  grounded: Boolean!
  gapCodes: [AgentGroundingGapCode!]!
  activeCertificateId: ID
  remainingReadUnits: Long!
  remainingVerifyUnits: Long!
  remainingVectorUnits: Long!
  remainingToolUnits: Long!
  remediationDepth: Int!
  maxRemediationDepth: Int!
  deadlineAt: DateTime!
  sourceWatermark: String!
  procedureTags: [String!]!
  allowedNextActions: [AgentGroundingNextAction!]!
  blockedReasons: [AgentGroundingBlockedReason!]!
  cardHash: SHA256!
}

type AgentGroundingAuditEvent {
  sequence: Long!
  eventType: String!
  actorType: String!
  actorId: String!
  requestId: String!
  assertionRevision: Long!
  canonicalPayloadHash: SHA256!
  previousEventHash: SHA256!
  eventHash: SHA256!
  occurredAt: DateTime!
}

type AgentGroundingAuditConnection {
  events: [AgentGroundingAuditEvent!]!
  nextCursor: String
  chainHeadHash: SHA256!
}

type AgentGroundingMutationResult {
  decision: String!
  assertion: AgentGroundingAssertion
  certificate: AgentGroundingCertificate
  perception: AgentGroundingPerception
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

type AgentGroundingTemplateMutationResult {
  decision: String!
  template: AgentGroundingTemplate
  code: String
  reason: String
  auditHash: SHA256
}

input AgentGroundingBudgetInput {
  readUnits: Long!
  verifyUnits: Long!
  vectorUnits: Long!
  toolUnits: Long!
  maxWallTimeMs: Int!
  maxRemediationDepth: Int!
}

input AgentGroundingBindingInput {
  evidencePacketId: ID!
  packetHash: SHA256!
  predicateId: ID!
  redactionEnvelopeId: ID!
  role: String!
}

input CreateAgentGroundingAssertionInput {
  accountId: ID!
  templateId: ID!
  templateVersion: Int!
  idempotencyKey: String!
  purpose: String!
  claim: JSON!
  budget: AgentGroundingBudgetInput!
  bindings: [AgentGroundingBindingInput!]!
}

input AgentGroundingTransitionInput {
  accountId: ID!
  assertionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
  reason: String!
}

input VerifyAgentGroundingAssertionInput {
  accountId: ID!
  assertionId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input ConsumeAgentGroundingCertificateInput {
  accountId: ID!
  certificateId: ID!
  expectedCertificateHash: SHA256!
  operation: AgentGroundingCertificateOperation!
  consumerOperationId: String!
  idempotencyKey: String!
}

input ResolveAgentGroundingUncertaintyInput {
  accountId: ID!
  assertionId: ID!
  refreshId: ID!
  expectedRevision: Long!
  resolution: AgentGroundingUncertaintyResolution!
  justification: String!
  idempotencyKey: String!
}

input AgentGroundingTemplateLifecycleInput {
  accountId: ID!
  templateId: ID!
  templateVersion: Int!
  expectedDefinitionHash: SHA256!
  validationEvidenceRef: ID!
  idempotencyKey: String!
  reason: String!
}

type Query {
  agentGroundingTemplate(
    accountId: ID!
    templateId: ID!
    version: Int
  ): AgentGroundingTemplate

  agentGroundingAssertion(
    accountId: ID!
    assertionId: ID!
  ): AgentGroundingAssertion

  agentGroundingPerception(
    accountId: ID!
    assertionId: ID!
  ): AgentGroundingPerception

  agentGroundingCertificate(
    accountId: ID!
    certificateId: ID!
  ): AgentGroundingCertificate

  agentGroundingAudit(
    accountId: ID!
    assertionId: ID!
    afterSequence: Long
    first: Int! = 100
  ): AgentGroundingAuditConnection!

  agentGroundingTemplates(
    accountId: ID!
    semanticQuery: String!
    topK: Int! = 10
    requiredOperations: [AgentGroundingCertificateOperation!]! = []
  ): [AgentGroundingTemplate!]!
}

type Mutation {
  approveAgentGroundingTemplate(
    input: AgentGroundingTemplateLifecycleInput!
  ): AgentGroundingTemplateMutationResult!
  revokeAgentGroundingTemplate(
    input: AgentGroundingTemplateLifecycleInput!
  ): AgentGroundingTemplateMutationResult!
  createAgentGroundingAssertion(
    input: CreateAgentGroundingAssertionInput!
  ): AgentGroundingMutationResult!
  sealAgentGroundingBindings(
    input: AgentGroundingTransitionInput!
  ): AgentGroundingMutationResult!
  verifyAgentGroundingAssertion(
    input: VerifyAgentGroundingAssertionInput!
  ): AgentGroundingMutationResult!
  requestAgentGroundingRefresh(
    input: AgentGroundingTransitionInput!
  ): AgentGroundingMutationResult!
  remediateAgentGroundingAssertion(
    input: AgentGroundingTransitionInput!
  ): AgentGroundingMutationResult!
  consumeAgentGroundingCertificate(
    input: ConsumeAgentGroundingCertificateInput!
  ): AgentGroundingMutationResult!
  resolveAgentGroundingUncertainty(
    input: ResolveAgentGroundingUncertaintyInput!
  ): AgentGroundingMutationResult!
  cancelAgentGroundingAssertion(
    input: AgentGroundingTransitionInput!
  ): AgentGroundingMutationResult!
}
```

### GraphQL limits

`first` is 1–200, `topK` is 1–20, and audit pagination is keyset-based.
Mutation payloads are size-limited and canonicalized before hashing. The
resolver rejects omitted or mismatched `accountId`. Gateway caps depth,
aliases, batched operations, total complexity, semantic-query length, and
per-principal request rate. Sensitive mutations use allowlisted persisted
operations. Every resolver checks delegated operation, board, template,
certificate, and audit scopes in addition to account membership.

## 10. Procedural memory

Approved claim templates are procedural memory for assertive work. Predicate
`instruction` and `procedure_ref` values tell an agent how to gather missing
evidence without inventing closure rules. Remediation procedures are versioned,
account-scoped, and discoverable only when the template remains approved.

Agents perceive procedures as opaque refs plus short tags on the perception
card. The database never executes natural-language instructions; workers execute
typed verification and refresh plans derived from sealed template bytes.

## 11. Semantic retrieval and HNSW compatibility

Vector search may help an agent find an approved claim template. It must not
authorize grounding. Embeddings are account-owned, watermarked, and partitioned
so approximate nearest neighbor never crosses tenants.

```sql
CREATE TABLE agent_grounding_claim_template_embedding (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dims INTEGER NOT NULL CHECK (embedding_dims > 0),
  embedding vector(1536) NOT NULL,
  definition_hash CHAR(64) NOT NULL,
  source_watermark TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, template_id, template_version, embedding_model),
  FOREIGN KEY (account_id, template_id, template_version, definition_hash)
    REFERENCES agent_grounding_claim_template (
      account_id, template_id, template_version, definition_hash
    )
);

CREATE INDEX agent_grounding_claim_template_embedding_account_idx
  ON agent_grounding_claim_template_embedding (
    account_id, updated_at DESC, template_id
  );
```

Production may create one HNSW segment per account hash partition after the
account predicate is fixed by the planner. The reference schema intentionally
omits a global `USING hnsw` index so validation fails closed on cross-tenant
vector indexes.

```sql
-- Production guidance only; not part of the executable reference schema:
-- CREATE INDEX agent_grounding_template_hnsw_pNN
--   ON agent_grounding_claim_template_embedding_pNN
--   USING hnsw (embedding vector_cosine_ops)
--   WHERE account_id BETWEEN $partition_start AND $partition_end;
```

## 12. Agent perception

Agents receive a perception card, not raw tables. The card states whether the
claim is grounded, which gap codes remain, which certificate is active, which
refresh is `UNKNOWN_EFFECT`, remaining budgets, remediation depth, allowed next
actions, and blocked reasons. All free-text fields are marked
`UNTRUSTED_CONTENT`. The `cardHash` binds the visible projection for audit.

LLMs should treat `allowedNextActions` as the only safe verbs. Semantic tags
help retrieval of procedures; they never override `GROUNDED` / `REJECTED`.

## 13. ACID and consistency

### Row store

Assertion state, bindings, verification runs, certificates, budget ledger,
write authorizations, memory gates, and audit events are authoritative in the
row store under serializable or equivalent tenant-fenced transactions.

### Columnar store

Columnar projections support analytics on grounding rates, gap codes, and
latency. They are watermarked and never used for authorization.

### Vector store

Vector indexes discover approved templates. Admission always re-reads row-store
approval, policy, and budget state.

### External tools

Evidence refresh adapters may observe provider state. After dispatch, absence of
proof is `UNKNOWN_EFFECT`. Human resolution is explicit and audited.

## 14. Guardrails and neighbor protection

1. Cap bindings (64), predicates (32), remediation depth (8), and topK (20).
2. Reserve verify/read/vector/tool units before work; reject on exhaustion.
3. Fingerprint repeated verify/remediate loops and trip containment when
   recursive patterns exceed policy.
4. Reject planner estimates that imply a full board or unbounded evidence scan.
5. Keep refresh network I/O off the transactional path.
6. Isolate HNSW segments by account partition.
7. Apply emergency containment deny bits before create/verify/consume.
8. Clamp wall-time deadlines and expire certificates aggressively.

These guardrails protect shared compute so autonomous grounding cannot erode
the 99.99% availability target for interactive users.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

| Anti-pattern | Risk | Mitigation |
| --- | --- | --- |
| Verify by scanning all evidence packets | FULL SCAN REJECTED on 1M+ boards | Point lookup by `(account_id, evidence_packet_id)` only |
| Semantic search without account predicate | Cross-tenant leakage and huge HNSW probes | Require account partition + topK ≤ 20 |
| Remediation that re-reads entire board history | Latency cliff and noisy neighbor | Procedural refs must use keyed cursors and budgets |
| Audit pagination with OFFSET | Degrading deep pages | Keyset on `(account_id, assertion_id, event_sequence)` |
| Unbounded contradiction search | Quadratic binding checks | Predicate-local binding cardinalities |

### Required access paths

- `(account_id, assertion_id)` for assertion CAS
- `(account_id, evidence_packet_id)` for binding validation
- `(account_id, status, updated_at, assertion_id)` for worker polls
- `(account_id, status, expires_at, certificate_id)` for active certificates
- `(account_id, template_id, template_version)` for sealed templates

### Planner enforcement

If estimated rows examined for verification exceed policy, the API returns
`FULL SCAN REJECTED` with a machine-readable code. Agents must narrow evidence
bindings or use synopsis/perception indexes rather than board scans.

## 16. Auditability and replay

Every create, seal, verify, refresh, remediate, certify, consume, cancel, and
human resolution appends a hash-chained audit event. Canonical payload hashes
cover claim bytes, binding sets, fence hashes, and decisions. Periodic Merkle
anchors copy chain heads to immutable storage. Support can replay whether a
user-visible conclusion was certified without re-invoking an LLM.

## 17. Threat and failure analysis

| Threat / failure | Deterministic response |
| --- | --- |
| Hallucinated claim with no evidence | Reject with `MISSING_BINDING` gaps |
| Cite revoked or redacted packet | Reject with `REVOKED` / `REDACTED` |
| Stale watermark under freshness policy | Reject or refresh; never soft-pass |
| Cross-tenant evidence id guessing | RLS + FK + resolver account equality |
| Template approval bypass via INSERT | Draft-only insert trigger + authority UDF |
| Certificate reuse after consume | CAS to `CONSUMED`; replay returns prior result |
| Provider timeout on refresh | `UNKNOWN_EFFECT` until verify/human resolution |
| Recursive remediate storm | Depth, budget, loop fingerprint, containment |
| Vector similarity as authorization | Candidates only; row-store admission decides |

## 18. Observability and SLOs

Emit tenant-scoped metrics for create latency, verify latency, ground rate,
reject rate by gap code, certificate consume latency, refresh `UNKNOWN_EFFECT`
rate, budget exhaustion, and full-scan rejections. SLOs:

- verify p99 ≤ interactive budget for ≤ 64 bindings;
- no cross-tenant grounding decision under fault injection;
- audit chain completeness = 100% for terminal assertions;
- grounding control plane must not reduce the 99.99% data-plane availability
  target.

## 19. Rollout

### Phase 1: shadow compilation

Compile claim templates and run verify in shadow mode without gating writes.

### Phase 2: memory promotion gate

Require certificates only for procedural/semantic memory promotion.

### Phase 3: writeback gate

Require certificates for agent board writeback on selected boards.

### Phase 4: tool preconditions and Open API

Expose GraphQL broadly; allow tools to demand `TOOL_PRECONDITION` certificates.

### Phase 5: broad availability

Default-on for assertive agent conclusions with account policy overrides.

## 20. Ship criteria

### Contract validation

- TypeScript strict compile of public contracts
- GraphQL schema build and validation
- Executable PostgreSQL/pgvector DDL with account-leading keys
- Forced RLS on every table
- Template approval/revocation authority fences

### Behavioral validation

- Grounded path mints one active certificate
- Missing/revoked/redacted/stale evidence produces stable gap codes
- Sealed bindings reject mutation
- Certificate consume is exactly-once per consumer operation id
- Refresh timeout surfaces `UNKNOWN_EFFECT`

### Scale and failure validation

- 1M+ evidence catalog point lookups stay on primary key paths
- FULL SCAN REJECTED when planner estimates unbounded reads
- Neighbor workloads retain interactive p99 under remediation load
- Audit anchors verify after process crash and region failover

## 21. Product decision

Ship the Grounding Assertion Plane as the deterministic gate between
probabilistic agent conclusions and enterprise-visible side effects. Accept the
extra verification hop to preserve citation closure, multi-tenant isolation,
audit replay, and neighbor-safe performance. Keep mondayDB deterministic:
agents may propose claims; only sealed evidence closure may certify them.
