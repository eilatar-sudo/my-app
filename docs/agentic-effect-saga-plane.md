# mondayDB Agentic Effect Saga Plane

**Status:** Proposed  
**Decision owner:** mondayDB Product and Engineering  
**Contract version:** `2026-07-24.v1`

## 1. Why this plane, before how

An agent workflow rarely ends at a database boundary. It may update a board,
send an email, create a ticket, wait for a payment provider, and then update the
board again. mondayDB can make its own writes ACID, but it cannot atomically
commit another vendor's API. Claiming otherwise would turn timeouts and retries
into duplicate external actions and unauditable state.

The product choice is **durable, deterministic orchestration over imaginary
distributed atomicity**:

- Local mondayDB steps remain serializable and low latency.
- External effects use durable intents, transactional outbox dispatch,
  idempotency keys, signed receipts, and explicit uncertainty.
- A timeout after dispatch is `UNKNOWN_EFFECT`, never silently "failed."
- Compensation is a new authorized effect, not rollback theater.
- Every transition is tenant-scoped, revision-fenced, budgeted, and replayable.

The trade-off is a small orchestration latency and storage cost in exchange for
correct recovery after process, network, region, or provider failure. This
protects 99.99% availability because a slow external tool cannot hold a
mondayDB transaction or compute slot open.

### Product outcome

Agents can execute useful multi-step work while users and operators can answer:
what was intended, what committed, what may have happened externally, why a
compensation ran, who resolved uncertainty, and which exact procedure version
governed the workflow.

## 2. Scope and ownership

The plane owns:

1. Immutable, approved saga templates as procedural memory.
2. Bounded saga instances and step dependency scheduling.
3. Tenant-local budget reservation and workload admission.
4. Atomic local steps and transactional external-effect intents.
5. Outbox dispatch, inbox deduplication, receipts, and uncertainty.
6. Explicit compensation and human-resolution records.
7. Agent perception cards and deterministic audit replay.

The row store owns authoritative runtime state. Columnar storage receives
asynchronous, watermark-bound projections for analytics. Vector storage only
discovers approved templates; it never decides whether an effect may execute.
Tool adapters own provider-specific transport but cannot mutate saga state
except through fenced service APIs.

### Non-goals

- Two-phase commit with external SaaS providers.
- Automatic invention of compensation logic by an LLM.
- Nested sagas, unbounded DAGs, recursive workflow generation, or arbitrary SQL.
- Storing provider credentials, raw secrets, or unrestricted tool responses.
- Using semantic similarity as authorization or as a transition predicate.

## 3. Product contract

### 3.1 Template contract

A template version is immutable after approval. It defines a bounded DAG of at
most 32 steps, explicit dependencies, preconditions, capability identifiers,
timeouts, retry limits, estimates, and optional compensation steps. Approval
validates acyclicity, capability grants, idempotency support, and budget fit.

Only `APPROVED` versions are discoverable or executable. Revocation prevents
new instances; existing instances follow the revocation policy captured at
start. Editing creates a new version and definition hash.

### 3.2 Runtime contract

Starting a saga requires `(account_id, principal_id, delegated_scope,
resource_scope, template_id, version, idempotency_key, input, purpose,
budgets)`. The service validates the principal's current board, target,
capability, and operation permissions, canonicalizes the input itself, and
records the authorization revision. The unique tenant idempotency key returns
the existing instance when all immutable fields match and rejects conflicting
reuse.

Every mutation supplies `expected_revision` and a command idempotency key. The
row-store transaction locks the instance, verifies revision, current delegated
authorization, resource ACL versions, budget, dependencies, and leases, writes
state plus audit event and a replayable command result, increments revision,
and commits once. Human resolution and compensation require separate privileged
scopes.

### 3.3 Effect contract

An external step has four distinct boundaries:

1. **Prepared:** intent and outbox message committed in mondayDB.
2. **Dispatched:** a generation-fenced adapter crossed the point of no return.
3. **Observed:** a trusted receipt or deterministic verification was recorded.
4. **Resolved:** succeeded, failed-before-effect, compensated, or explicitly
   accepted by an authorized human.

After boundary 2, missing evidence produces `UNKNOWN_EFFECT`. Retrying is
forbidden until the adapter proves the provider idempotency key is safe or an
authorized resolution chooses a deterministic action.

### 3.4 Compensation contract

Compensation is defined in the approved template and rechecks current policy,
purpose, budget, and capability. It has its own idempotency key and receipt.
Irreversible effects must declare `compensation_step_id = null`; if later work
fails, the saga enters `NEEDS_HUMAN` instead of fabricating a rollback.

### 3.5 Availability contract

No network call occurs inside a mondayDB transaction. Workers use short leases
and generation tokens. Region failover may delay dispatch but cannot authorize
two generations. Reads expose the latest row-store revision immediately;
analytics and semantic projections expose explicit watermarks.

## 4. Deterministic invariants

1. `account_id` is the first column of every table, foreign key, primary key,
   unique key, and ordinary access-path index.
2. The authenticated account must exactly equal the GraphQL `accountId`; this
   tenant check never substitutes for principal, board, target, or operation
   authorization.
3. A saga references a template version and resource scope in the same account.
4. Approved template bytes and definition hash never change.
5. A tenant idempotency key identifies exactly one immutable start request.
6. State changes use compare-and-swap on `state_revision`.
7. A step is claimable only when every dependency is terminal-successful.
8. A lease generation is monotonic; stale workers cannot commit or dispatch.
9. Local writes and their saga/audit transitions share one ACID transaction.
10. Effect intent and outbox message share one ACID transaction.
11. Each dispatch generation has one durable send authorization. A stable
    provider idempotency key—not a database claim of network exactly-once—
    protects ambiguous transport retries.
12. Post-dispatch timeout is `UNKNOWN_EFFECT`, not `FAILED`.
13. Compensation is append-only, authorized, budgeted, and independently
    observable.
14. Semantic retrieval returns candidates only; deterministic admission
    verifies tenant, approval, version, policy, and budgets.
15. Runtime state is never reconstructed from the columnar or vector layer.
16. Audit sequence, canonical transition bodies, and hashes are contiguous per
    saga and periodically anchored outside the mutable database.
17. A completed saga cannot transition back to an active state.
18. Nested saga creation is rejected; attempts, wall time, parallelism, and tool
    units are bounded.

## 5. Execution model

### 5.1 Template sealing

The compiler canonicalizes step and edge records, confirms a DAG, resolves
capabilities, verifies every compensation reference, computes worst-case units,
and hashes the canonical result. Approval stores that hash and an authorization
snapshot. The runtime does not reinterpret free-form instructions.

Draft rows are writable only through the compiler role. Database triggers make
approved/revoked template, step, and edge records immutable, except the single
`APPROVED -> REVOKED` transition with unchanged definition bytes. Approval
uses a separate security-definer procedure unavailable to the draft-writer
role. The trusted compiler recomputes the canonical hash, and the procedure
locks the draft, requires that exact hash, recounts steps, rejects graph cycles
or invalid compensation links, installs a transaction-local approval fence, and
seals the row. Direct status-column updates are revoked.

### 5.2 Ready-step calculation

Each instance materializes a dependency counter per step. A successful terminal
transition decrements direct dependents in the same transaction. A step becomes
`READY` at zero. This avoids repeatedly scanning all historical step runs.
At most eight steps can be ready concurrently, further clamped by account
admission.

### 5.3 Local transaction step

The executor submits a typed mutation plan, not SQL text. The transaction:

1. locks the saga and current step run by tenant composite key;
2. verifies revision, lease generation, policy, source versions, and budget;
3. applies board writes with their normal `account_id` predicates;
4. writes budget ledger, step result digest, dependency changes, and audit;
5. increments saga revision and commits.

Any failure rolls back all five operations.

### 5.4 External effect step

Preparation reserves units and commits an immutable effect intent plus outbox
message. A dispatcher claims the message briefly, obtains a monotonically
increasing generation, and calls only the declared capability with a request
derived from the sealed intent. Immediately before send it CASes that generation
into a single durable authorization record. The adapter stores no authority of
its own. A stale generation cannot commit a result, but mondayDB does not claim
it can retract packets already sent on a failed network path.

The provider idempotency key is
`HMAC(account_key, saga_id || step_id || run_no || effect_id)`. It is stable for
the logical effect and opaque outside the account boundary.

Encrypted request references are server-minted capabilities bound to
`(account_id, saga_id, effect_id, request_hash, KMS context, expiry)`. Adapters
reject caller-created or mismatched object references.

### 5.5 Observation and uncertainty

Receipts are normalized into `SUCCEEDED`, `FAILED_BEFORE_EFFECT`,
`FAILED_AFTER_EFFECT`, or `UNKNOWN_EFFECT`. Receipt ingestion is an
adapter-authenticated internal service, not a caller-authored GraphQL mutation.
The service derives the account/effect mapping, verifies the provider
signature, and computes outcome plus digest. Untrusted evidence is audited in a
separate security stream and cannot advance a saga. A provider response body is
stored in an encrypted object store; mondayDB stores a content digest,
allowlisted metadata, provider event identifier, and verified trust state.

`UNKNOWN_EFFECT` blocks dependent and compensating steps that could cause a
duplicate or unsafe inverse. Verification may turn uncertainty into an observed
outcome. Otherwise a separately authorized human records `RETRY_SAME_KEY`,
`ACCEPT_AS_SUCCEEDED`, `MARK_FAILED_NO_EFFECT`, or `REQUIRE_COMPENSATION`.
Late trusted receipts are always appended: an unresolved effect follows the
receipt, while a conflicting post-resolution receipt enters `NEEDS_HUMAN` and
never rewrites history.

Outcome and occurrence are separate dimensions. `FAILED_BEFORE_EFFECT` is
known-unapplied and may follow ordinary failure policy. Both `SUCCEEDED` and
`FAILED_AFTER_EFFECT` are known-applied; the latter blocks forward dependencies
and must enter sealed compensation or `NEEDS_HUMAN`. `UNKNOWN_EFFECT` is
possibly-applied and remains contained until verified or resolved.

### 5.6 Recovery

Expired claims become claimable at a higher generation. Recovery inspects the
last durable boundary:

- no intent: rerun deterministic preparation;
- intent but no dispatch: dispatch the existing intent;
- dispatch started and no receipt: verify, then mark `UNKNOWN_EFFECT`; never
  create a new logical effect or key;
- receipt committed: continue dependency scheduling;
- compensation dispatched: apply the same uncertainty rules.

## 6. Lifecycle

### 6.1 Start

`startAgentSaga` checks template approval, purpose, effective policy, input
schema, worst-case budget, tenant concurrency, and idempotency. It creates the
instance, step counters, budget reservation, first audit event, and initial
perception snapshot atomically.

### 6.2 Run

Workers claim ready steps with short leases. Claims are fair within an account
and weighted across accounts. The account admission governor controls active
local, vector, and tool slots separately.

### 6.3 Wait

Waiting for a provider consumes no compute lease. A durable receipt or timer
event wakes the saga. Polling adapters have bounded intervals, attempts, and
tool units.

### 6.4 Compensate

A terminal forward failure computes the reverse topological set of
known-applied effects—both `SUCCEEDED` and `FAILED_AFTER_EFFECT`—that declare
compensation. The set and order are sealed into a
compensation plan header and hash before execution. Every append-only plan row
foreign-keys that header/hash and binds the original effect, reverse ordinal,
approved compensation step, and one-time resulting compensation effect.
Triggers freeze plan identity and permit only declared status transitions. The
inverse request derives its target from the original tenant-HMAC alias; callers
cannot redirect it. Failed or uncertain compensation follows the same receipt
rules and requires privileged human resolution.

### 6.5 Complete

`SUCCEEDED`, `FAILED`, and `CANCELLED` require no ready, claimed, pending,
uncertain, or compensating step. Finalization stores a deterministic outcome
hash and watermark. Cancellation never erases effects already dispatched.

### 6.6 Retain

Runtime rows follow account retention policy. Audit evidence and externally
required receipts may have longer legal retention. Erasure replaces sensitive
payload references with tombstones while retaining non-sensitive proof hashes.

## 7. TypeScript contracts

These interfaces are the service boundary. IDs are opaque; resolvers validate
formats and never infer `accountId` from an object identifier.

```ts
type AccountId = string;
type SagaId = string;
type TemplateId = string;
type StepId = string;
type EffectId = string;
type Sha256 = string;
type Timestamp = string;
type TrustedNextAction =
  | "CLAIM_READY_STEP"
  | "REQUEST_VERIFICATION"
  | "REQUEST_COMPENSATION"
  | "REQUEST_HUMAN_RESOLUTION"
  | "CANCEL";
type SagaBlockedReason =
  | "WAIT_FOR_RECEIPT"
  | "HUMAN_RESOLUTION_REQUIRED"
  | "BUDGET_EXHAUSTED"
  | "POLICY_DENIED"
  | "NO_READY_STEP";

interface UntrustedText {
  readonly value: string;
  readonly provenance: "USER_INPUT" | "BOARD_VALUE" | "PROVIDER_VALUE";
  readonly trust: "UNTRUSTED_CONTENT";
}

type TemplateStatus = "DRAFT" | "APPROVED" | "REVOKED";
type StepKind =
  | "LOCAL_TRANSACTION"
  | "EXTERNAL_EFFECT"
  | "VERIFY_EFFECT"
  | "COMPENSATION";
type SagaStatus =
  | "READY"
  | "RUNNING"
  | "WAITING_EFFECT"
  | "COMPENSATING"
  | "NEEDS_HUMAN"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";
type StepRunStatus =
  | "BLOCKED"
  | "READY"
  | "CLAIMED"
  | "DISPATCH_PENDING"
  | "WAITING_RECEIPT"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN_EFFECT"
  | "COMPENSATING"
  | "COMPENSATED"
  | "SKIPPED"
  | "NEEDS_HUMAN";

interface SagaBudget {
  readonly readUnits: number;
  readonly writeUnits: number;
  readonly toolUnits: number;
  readonly maxWallTimeMs: number;
}

interface SagaTemplate {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly version: number;
  readonly name: string;
  readonly status: TemplateStatus;
  readonly definitionHash: Sha256;
  readonly maxSteps: number;
  readonly maxParallelism: number;
  readonly steps: readonly SagaTemplateStep[];
  readonly edges: readonly SagaTemplateEdge[];
}

interface SagaTemplateStep {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly stepId: StepId;
  readonly ordinal: number;
  readonly kind: StepKind;
  readonly capability: string | null;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly idempotencyRequired: boolean;
  readonly compensationStepId: StepId | null;
  readonly instruction: Readonly<Record<string, unknown>>;
  readonly precondition: Readonly<Record<string, unknown>>;
  readonly estimate: Omit<SagaBudget, "maxWallTimeMs">;
}

interface SagaTemplateEdge {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly fromStepId: StepId;
  readonly toStepId: StepId;
}

interface SagaInstance {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly status: SagaStatus;
  readonly stateRevision: bigint;
  readonly purpose: UntrustedText;
  readonly budget: SagaBudget;
  readonly consumed: Omit<SagaBudget, "maxWallTimeMs">;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

type ExternalEffectObservation =
  | {
      readonly state: "NOT_DISPATCHED";
      readonly effectId: EffectId;
      readonly intentHash: Sha256;
    }
  | {
      readonly state: "DISPATCHED_UNOBSERVED";
      readonly effectId: EffectId;
      readonly generation: bigint;
      readonly dispatchedAt: Timestamp;
    }
  | {
      readonly state: "OBSERVED";
      readonly effectId: EffectId;
      readonly outcome:
        | "SUCCEEDED"
        | "FAILED_BEFORE_EFFECT"
        | "FAILED_AFTER_EFFECT";
      readonly receiptHash: Sha256;
      readonly signatureVerified: boolean;
    }
  | {
      readonly state: "UNKNOWN_EFFECT";
      readonly effectId: EffectId;
      readonly nextSafeActions: readonly (
        | "VERIFY"
        | "RETRY_SAME_KEY"
        | "HUMAN_RESOLUTION"
      )[];
    };

interface AgentSagaPerceptionCard {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly revision: bigint;
  readonly status: SagaStatus;
  readonly purpose: UntrustedText;
  readonly templateDefinitionHash: Sha256;
  readonly policyRevision: bigint;
  readonly currentStepIds: readonly StepId[];
  readonly uncertainEffects: readonly ExternalEffectObservation[];
  readonly remainingBudget: Omit<SagaBudget, "maxWallTimeMs">;
  readonly sourceWatermark: string;
  readonly deadlineAt: Timestamp;
  readonly remainingWallTimeMs: number;
  readonly procedureTags: readonly string[];
  readonly allowedNextActions: readonly TrustedNextAction[];
  readonly blockedReasons: readonly SagaBlockedReason[];
  readonly cardHash: Sha256;
}
```

Mutation contracts keep transition decisions deterministic and explicit:

```ts
interface RequestContext {
  readonly authenticatedAccountId: AccountId;
  readonly principalId: string;
  readonly requestId: string;
  readonly policyRevision: bigint;
  readonly delegatedScopes: readonly string[];
  readonly resourceAclRevision: bigint;
}

interface StartSagaCommand {
  readonly accountId: AccountId;
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  readonly idempotencyKey: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly purpose: string;
  readonly budget: SagaBudget;
}

interface ClaimStepCommand {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly stepId: StepId;
  readonly expectedRevision: bigint;
  readonly leaseMs: number;
  readonly idempotencyKey: string;
}

interface PrepareEffectCommand {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly stepId: StepId;
  readonly runNo: number;
  readonly expectedRevision: bigint;
  readonly claimToken: string;
  readonly typedRequest: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}

interface TrustedAdapterContext {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly authenticatedProvider: string;
  readonly requestId: string;
}

interface RecordTrustedReceiptCommand {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly effectId: EffectId;
  readonly expectedRevision: bigint;
  readonly providerEventId: string;
  readonly signedProviderPayload: string;
}

interface ResolveUncertaintyCommand {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly effectId: EffectId;
  readonly expectedRevision: bigint;
  readonly resolution:
    | "RETRY_SAME_KEY"
    | "ACCEPT_AS_SUCCEEDED"
    | "MARK_FAILED_NO_EFFECT"
    | "REQUIRE_COMPENSATION";
  readonly evidenceRef: string;
  readonly justification: string;
  readonly idempotencyKey: string;
}

interface VerifyEffectCommand {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly effectId: EffectId;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
}

interface RetryStepCommand {
  readonly accountId: AccountId;
  readonly sagaId: SagaId;
  readonly stepId: StepId;
  readonly failedRunNo: number;
  readonly expectedRevision: bigint;
  readonly idempotencyKey: string;
  readonly reason: string;
}

interface StepClaimCapability {
  readonly stepId: StepId;
  readonly runNo: number;
  readonly claimToken: string;
  readonly leaseGeneration: bigint;
  readonly leaseExpiresAt: Timestamp;
}

type TransitionDecision =
  | {
      readonly decision: "COMMITTED";
      readonly sagaId: SagaId;
      readonly newRevision: bigint;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "CLAIMED";
      readonly sagaId: SagaId;
      readonly newRevision: bigint;
      readonly claim: StepClaimCapability;
      readonly auditHash: Sha256;
    }
  | {
      readonly decision: "IDEMPOTENT_REPLAY";
      readonly sagaId: SagaId;
      readonly currentRevision: bigint;
      readonly originalRequestId: string;
      readonly originalDecision: "COMMITTED" | "CLAIMED";
      readonly claim: StepClaimCapability | null;
    }
  | {
      readonly decision: "REJECTED";
      readonly code:
        | "ACCOUNT_MISMATCH"
        | "STALE_REVISION"
        | "POLICY_DENIED"
        | "BUDGET_EXCEEDED"
        | "LEASE_EXPIRED"
        | "DEPENDENCY_BLOCKED"
        | "UNSAFE_EFFECT_RETRY"
        | "TERMINAL_STATE";
      readonly retryable: boolean;
      readonly reason: string;
    };

interface AgentSagaService {
  start(
    context: RequestContext,
    command: StartSagaCommand,
  ): Promise<TransitionDecision>;
  claim(
    context: RequestContext,
    command: ClaimStepCommand,
  ): Promise<TransitionDecision>;
  prepareEffect(
    context: RequestContext,
    command: PrepareEffectCommand,
  ): Promise<TransitionDecision>;
  recordReceipt(
    context: TrustedAdapterContext,
    command: RecordTrustedReceiptCommand,
  ): Promise<TransitionDecision>;
  resolveUncertainty(
    context: RequestContext,
    command: ResolveUncertaintyCommand,
  ): Promise<TransitionDecision>;
  requestVerification(
    context: RequestContext,
    command: VerifyEffectCommand,
  ): Promise<TransitionDecision>;
  retryStep(
    context: RequestContext,
    command: RetryStepCommand,
  ): Promise<TransitionDecision>;
}
```

## 8. SQL row-store schema

The reference DDL is executable PostgreSQL. Production placement may shard by
`account_id`, but logical keys and constraints remain unchanged.

```sql
CREATE TYPE saga_status AS ENUM (
  'READY', 'RUNNING', 'WAITING_EFFECT', 'COMPENSATING',
  'NEEDS_HUMAN', 'SUCCEEDED', 'FAILED', 'CANCELLED'
);
CREATE TYPE saga_template_status AS ENUM ('DRAFT', 'APPROVED', 'REVOKED');
CREATE TYPE saga_step_kind AS ENUM (
  'LOCAL_TRANSACTION', 'EXTERNAL_EFFECT', 'VERIFY_EFFECT',
  'COMPENSATION'
);
CREATE TYPE saga_step_run_status AS ENUM (
  'BLOCKED', 'READY', 'CLAIMED', 'DISPATCH_PENDING', 'WAITING_RECEIPT',
  'SUCCEEDED', 'FAILED', 'UNKNOWN_EFFECT', 'COMPENSATING',
  'COMPENSATED', 'SKIPPED', 'NEEDS_HUMAN'
);
CREATE TYPE saga_effect_outcome AS ENUM (
  'SUCCEEDED', 'FAILED_BEFORE_EFFECT', 'FAILED_AFTER_EFFECT', 'UNKNOWN_EFFECT'
);
CREATE TYPE saga_consistency_mode AS ENUM (
  'LINEARIZABLE', 'SNAPSHOT', 'BOUNDED_STALENESS'
);

CREATE TABLE agent_saga_authorization_evidence (
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

CREATE TABLE agent_saga_template (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  name TEXT NOT NULL,
  status saga_template_status NOT NULL,
  definition_hash CHAR(64) NOT NULL CHECK (length(definition_hash) = 64),
  canonicalization_version TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  approval_validation_hash CHAR(64),
  authorization_evidence_id UUID NOT NULL,
  authorization_snapshot_hash CHAR(64) NOT NULL,
  revocation_policy TEXT NOT NULL CHECK (
    revocation_policy IN (
      'ALLOW_RUNNING', 'STOP_BEFORE_NEXT_EFFECT', 'REQUIRE_CONTAINMENT'
    )
  ),
  input_schema JSONB NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  max_steps SMALLINT NOT NULL CHECK (max_steps BETWEEN 1 AND 32),
  max_parallelism SMALLINT NOT NULL CHECK (max_parallelism BETWEEN 1 AND 8),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, template_id, template_version),
  UNIQUE (account_id, template_id, template_version, definition_hash),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_saga_authorization_evidence (account_id, evidence_id),
  CHECK (
    (status = 'DRAFT' AND approved_at IS NULL
      AND approval_validation_hash IS NULL) OR
    (status IN ('APPROVED', 'REVOKED') AND approved_at IS NOT NULL
      AND approval_validation_hash IS NOT NULL)
  ),
  CHECK (length(authorization_snapshot_hash) = 64)
);

CREATE TABLE agent_saga_template_step (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 32),
  step_kind saga_step_kind NOT NULL,
  capability TEXT,
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 100 AND 300000),
  max_attempts SMALLINT NOT NULL CHECK (max_attempts BETWEEN 1 AND 5),
  idempotency_required BOOLEAN NOT NULL,
  compensation_step_id TEXT,
  instruction JSONB NOT NULL,
  precondition JSONB NOT NULL,
  estimated_read_units INTEGER NOT NULL CHECK (estimated_read_units >= 0),
  estimated_write_units INTEGER NOT NULL CHECK (estimated_write_units >= 0),
  estimated_tool_units INTEGER NOT NULL CHECK (estimated_tool_units >= 0),
  PRIMARY KEY (account_id, template_id, template_version, step_id),
  UNIQUE (account_id, template_id, template_version, ordinal),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_saga_template (
      account_id, template_id, template_version
    ),
  FOREIGN KEY (
    account_id, template_id, template_version, compensation_step_id
  ) REFERENCES agent_saga_template_step (
    account_id, template_id, template_version, step_id
  ) DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (step_kind IN ('EXTERNAL_EFFECT', 'VERIFY_EFFECT', 'COMPENSATION')
      AND capability IS NOT NULL) OR
    (step_kind = 'LOCAL_TRANSACTION' AND capability IS NULL)
  ),
  CHECK (
    step_kind <> 'EXTERNAL_EFFECT' OR idempotency_required
  )
);

CREATE TABLE agent_saga_template_edge (
  account_id BIGINT NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  from_step_id TEXT NOT NULL,
  to_step_id TEXT NOT NULL,
  PRIMARY KEY (
    account_id, template_id, template_version, from_step_id, to_step_id
  ),
  FOREIGN KEY (
    account_id, template_id, template_version, from_step_id
  ) REFERENCES agent_saga_template_step (
    account_id, template_id, template_version, step_id
  ),
  FOREIGN KEY (
    account_id, template_id, template_version, to_step_id
  ) REFERENCES agent_saga_template_step (
    account_id, template_id, template_version, step_id
  ),
  CHECK (from_step_id <> to_step_id)
);

CREATE TABLE agent_saga_instance (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  status saga_status NOT NULL,
  state_revision BIGINT NOT NULL CHECK (state_revision >= 0),
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_hash CHAR(64) NOT NULL CHECK (length(input_hash) = 64),
  budget_read_units BIGINT NOT NULL CHECK (budget_read_units >= 0),
  budget_write_units BIGINT NOT NULL CHECK (budget_write_units >= 0),
  budget_tool_units BIGINT NOT NULL CHECK (budget_tool_units >= 0),
  consumed_read_units BIGINT NOT NULL CHECK (consumed_read_units >= 0),
  consumed_write_units BIGINT NOT NULL CHECK (consumed_write_units >= 0),
  consumed_tool_units BIGINT NOT NULL CHECK (consumed_tool_units >= 0),
  budget_max_wall_time_ms BIGINT NOT NULL
    CHECK (budget_max_wall_time_ms BETWEEN 1000 AND 86400000),
  deadline_at TIMESTAMPTZ NOT NULL,
  consistency_mode saga_consistency_mode NOT NULL,
  started_by TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL,
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_scope_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  terminal_outcome_hash CHAR(64),
  PRIMARY KEY (account_id, saga_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, saga_id, template_id, template_version),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agent_saga_template (
      account_id, template_id, template_version
    ),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_saga_authorization_evidence (account_id, evidence_id),
  CHECK (consumed_read_units <= budget_read_units),
  CHECK (consumed_write_units <= budget_write_units),
  CHECK (consumed_tool_units <= budget_tool_units),
  CHECK (deadline_at > created_at),
  CHECK (length(delegated_scope_hash) = 64),
  CHECK (length(resource_scope_hash) = 64)
);

CREATE TABLE agent_saga_step_run (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  run_no SMALLINT NOT NULL CHECK (run_no BETWEEN 1 AND 5),
  status saga_step_run_status NOT NULL,
  claim_token UUID,
  lease_generation BIGINT NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_expires_at TIMESTAMPTZ,
  planned_input_hash CHAR(64) NOT NULL,
  result_hash CHAR(64),
  error_class TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, saga_id, step_id, run_no),
  FOREIGN KEY (
    account_id, saga_id, template_id, template_version
  ) REFERENCES agent_saga_instance (
    account_id, saga_id, template_id, template_version
  ),
  FOREIGN KEY (account_id, template_id, template_version, step_id)
    REFERENCES agent_saga_template_step (
      account_id, template_id, template_version, step_id
    ),
  CHECK (
    (status = 'CLAIMED' AND claim_token IS NOT NULL
      AND lease_expires_at IS NOT NULL) OR status <> 'CLAIMED'
  )
);

CREATE TABLE agent_saga_dependency_counter (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  remaining_dependencies SMALLINT NOT NULL
    CHECK (remaining_dependencies BETWEEN 0 AND 31),
  counter_revision BIGINT NOT NULL CHECK (counter_revision >= 0),
  PRIMARY KEY (account_id, saga_id, step_id),
  FOREIGN KEY (
    account_id, saga_id, template_id, template_version
  ) REFERENCES agent_saga_instance (
    account_id, saga_id, template_id, template_version
  ),
  FOREIGN KEY (account_id, template_id, template_version, step_id)
    REFERENCES agent_saga_template_step (
      account_id, template_id, template_version, step_id
    )
);

CREATE TABLE agent_saga_budget_ledger (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
  step_id TEXT,
  entry_kind TEXT NOT NULL CHECK (
    entry_kind IN ('RESERVE', 'CONSUME', 'RELEASE', 'ADJUST')
  ),
  read_units BIGINT NOT NULL,
  write_units BIGINT NOT NULL,
  tool_units BIGINT NOT NULL,
  balance_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, saga_id, ledger_sequence),
  FOREIGN KEY (account_id, saga_id)
    REFERENCES agent_saga_instance (account_id, saga_id)
);

CREATE TABLE agent_saga_effect_intent (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  saga_id UUID NOT NULL,
  step_id TEXT NOT NULL,
  run_no SMALLINT NOT NULL,
  capability TEXT NOT NULL,
  target_ref_hmac CHAR(64) NOT NULL,
  canonical_request_hash CHAR(64) NOT NULL,
  encrypted_request_ref TEXT NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  delegated_scope_hash CHAR(64) NOT NULL,
  authorization_revision BIGINT NOT NULL CHECK (authorization_revision >= 0),
  resource_acl_revision BIGINT NOT NULL CHECK (resource_acl_revision >= 0),
  intent_status TEXT NOT NULL CHECK (
    intent_status IN (
      'PREPARED', 'DISPATCHING', 'OBSERVED', 'UNKNOWN_EFFECT', 'RESOLVED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, effect_id),
  UNIQUE (account_id, provider_idempotency_key),
  UNIQUE (account_id, saga_id, step_id, run_no),
  UNIQUE (account_id, saga_id, effect_id),
  UNIQUE (account_id, saga_id, effect_id, step_id),
  FOREIGN KEY (account_id, saga_id, step_id, run_no)
    REFERENCES agent_saga_step_run (
      account_id, saga_id, step_id, run_no
    ),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_saga_authorization_evidence (account_id, evidence_id)
);

CREATE TABLE agent_saga_dispatch_outbox (
  account_id BIGINT NOT NULL,
  message_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  dispatch_generation BIGINT NOT NULL DEFAULT 0
    CHECK (dispatch_generation >= 0),
  status TEXT NOT NULL CHECK (
    status IN ('PENDING', 'CLAIMED', 'DISPATCHED', 'DEAD_LETTER')
  ),
  not_before TIMESTAMPTZ NOT NULL,
  claim_token UUID,
  claim_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, message_id),
  UNIQUE (account_id, effect_id),
  FOREIGN KEY (account_id, effect_id)
    REFERENCES agent_saga_effect_intent (account_id, effect_id)
);

CREATE TABLE agent_saga_effect_attempt (
  account_id BIGINT NOT NULL,
  effect_id UUID NOT NULL,
  dispatch_generation BIGINT NOT NULL CHECK (dispatch_generation > 0),
  attempt_no SMALLINT NOT NULL CHECK (attempt_no BETWEEN 1 AND 5),
  dispatcher_region TEXT NOT NULL,
  dispatch_token_hash CHAR(64) NOT NULL,
  point_of_no_return_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  transport_status TEXT NOT NULL CHECK (
    transport_status IN (
      'STARTED', 'NOT_SENT', 'SENT', 'TIMED_OUT', 'RESPONSE_RECEIVED'
    )
  ),
  PRIMARY KEY (account_id, effect_id, dispatch_generation),
  FOREIGN KEY (account_id, effect_id)
    REFERENCES agent_saga_effect_intent (account_id, effect_id)
);

CREATE TABLE agent_saga_effect_receipt (
  account_id BIGINT NOT NULL,
  receipt_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  provider_event_id TEXT NOT NULL,
  outcome saga_effect_outcome NOT NULL,
  receipt_hash CHAR(64) NOT NULL,
  signature_verified BOOLEAN NOT NULL,
  encrypted_payload_ref TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, effect_id, provider_event_id),
  FOREIGN KEY (account_id, effect_id)
    REFERENCES agent_saga_effect_intent (account_id, effect_id),
  CHECK (signature_verified)
);

CREATE TABLE agent_saga_compensation_plan (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  plan_hash CHAR(64) NOT NULL,
  authorization_evidence_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'NEEDS_HUMAN')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, saga_id, plan_id),
  UNIQUE (account_id, saga_id, plan_id, plan_hash),
  FOREIGN KEY (
    account_id, saga_id, template_id, template_version
  ) REFERENCES agent_saga_instance (
    account_id, saga_id, template_id, template_version
  ),
  FOREIGN KEY (account_id, authorization_evidence_id)
    REFERENCES agent_saga_authorization_evidence (account_id, evidence_id),
  CHECK (length(plan_hash) = 64)
);

CREATE TABLE agent_saga_compensation_run (
  account_id BIGINT NOT NULL,
  compensation_id UUID NOT NULL,
  saga_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  original_effect_id UUID NOT NULL,
  compensation_effect_id UUID,
  compensation_step_id TEXT NOT NULL,
  reverse_ordinal SMALLINT NOT NULL CHECK (reverse_ordinal BETWEEN 1 AND 32),
  status TEXT NOT NULL CHECK (
    status IN (
      'PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED',
      'UNKNOWN_EFFECT', 'NEEDS_HUMAN'
    )
  ),
  plan_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, compensation_id),
  UNIQUE (account_id, saga_id, original_effect_id),
  UNIQUE (account_id, saga_id, reverse_ordinal),
  UNIQUE (account_id, compensation_effect_id),
  FOREIGN KEY (account_id, saga_id, plan_id, plan_hash)
    REFERENCES agent_saga_compensation_plan (
      account_id, saga_id, plan_id, plan_hash
    ),
  FOREIGN KEY (
    account_id, saga_id, template_id, template_version
  ) REFERENCES agent_saga_instance (
    account_id, saga_id, template_id, template_version
  ),
  FOREIGN KEY (
    account_id, template_id, template_version, compensation_step_id
  ) REFERENCES agent_saga_template_step (
    account_id, template_id, template_version, step_id
  ),
  FOREIGN KEY (account_id, saga_id, original_effect_id)
    REFERENCES agent_saga_effect_intent (account_id, saga_id, effect_id),
  FOREIGN KEY (
    account_id, saga_id, compensation_effect_id, compensation_step_id
  ) REFERENCES agent_saga_effect_intent (
    account_id, saga_id, effect_id, step_id
  ),
  CHECK (
    (status = 'PLANNED' AND compensation_effect_id IS NULL) OR
    (status <> 'PLANNED' AND compensation_effect_id IS NOT NULL)
  )
);

CREATE TABLE agent_saga_human_resolution (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  saga_id UUID NOT NULL,
  effect_id UUID NOT NULL,
  resolution_sequence SMALLINT NOT NULL
    CHECK (resolution_sequence BETWEEN 1 AND 5),
  resolution TEXT NOT NULL CHECK (
    resolution IN (
      'RETRY_SAME_KEY', 'ACCEPT_AS_SUCCEEDED',
      'MARK_FAILED_NO_EFFECT', 'REQUIRE_COMPENSATION'
    )
  ),
  evidence_hash CHAR(64) NOT NULL,
  justification TEXT NOT NULL,
  resolved_by TEXT NOT NULL,
  authorization_revision BIGINT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, resolution_id),
  UNIQUE (account_id, effect_id, resolution_sequence),
  FOREIGN KEY (account_id, saga_id, effect_id)
    REFERENCES agent_saga_effect_intent (account_id, saga_id, effect_id)
);

CREATE TABLE agent_saga_inbox_dedupe (
  account_id BIGINT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  signature_verified BOOLEAN NOT NULL,
  effect_id UUID,
  received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, provider_name, provider_event_id),
  FOREIGN KEY (account_id, effect_id)
    REFERENCES agent_saga_effect_intent (account_id, effect_id),
  CHECK (signature_verified)
);

CREATE TABLE agent_saga_command_result (
  account_id BIGINT NOT NULL,
  principal_id TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  redacted_request JSONB NOT NULL,
  encrypted_request_ref TEXT,
  request_hash CHAR(64) NOT NULL,
  redacted_response JSONB NOT NULL,
  encrypted_response_ref TEXT,
  response_hash CHAR(64) NOT NULL,
  saga_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id, principal_id, operation_name, idempotency_key
  ),
  FOREIGN KEY (account_id, saga_id)
    REFERENCES agent_saga_instance (account_id, saga_id),
  CHECK (expires_at > created_at),
  CHECK (length(request_hash) = 64),
  CHECK (length(response_hash) = 64)
);

CREATE TABLE agent_saga_audit_head (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  last_sequence BIGINT NOT NULL CHECK (last_sequence >= 0),
  last_event_hash CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, saga_id),
  FOREIGN KEY (account_id, saga_id)
    REFERENCES agent_saga_instance (account_id, saga_id)
);

CREATE TABLE agent_saga_audit_event (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  event_sequence BIGINT NOT NULL CHECK (event_sequence > 0),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (
    actor_type IN ('HUMAN', 'AGENT', 'SERVICE', 'PROVIDER')
  ),
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  saga_revision BIGINT NOT NULL,
  canonicalization_version TEXT NOT NULL,
  canonical_payload JSONB NOT NULL,
  canonical_payload_hash CHAR(64) NOT NULL,
  previous_event_hash CHAR(64) NOT NULL,
  event_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, saga_id, event_sequence),
  UNIQUE (account_id, saga_id, event_hash),
  UNIQUE (account_id, saga_id, event_sequence, event_hash),
  FOREIGN KEY (account_id, saga_id)
    REFERENCES agent_saga_instance (account_id, saga_id)
);

CREATE TABLE agent_saga_audit_anchor (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  event_sequence BIGINT NOT NULL,
  event_hash CHAR(64) NOT NULL,
  anchor_batch_id UUID NOT NULL,
  immutable_archive_receipt_hash CHAR(64) NOT NULL,
  anchored_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, saga_id, event_sequence),
  UNIQUE (account_id, anchor_batch_id, saga_id),
  FOREIGN KEY (account_id, saga_id, event_sequence, event_hash)
    REFERENCES agent_saga_audit_event (
      account_id, saga_id, event_sequence, event_hash
    )
);

CREATE TABLE agent_saga_perception_snapshot (
  account_id BIGINT NOT NULL,
  saga_id UUID NOT NULL,
  saga_revision BIGINT NOT NULL,
  status saga_status NOT NULL,
  card JSONB NOT NULL,
  card_hash CHAR(64) NOT NULL,
  source_watermark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, saga_id, saga_revision),
  FOREIGN KEY (account_id, saga_id)
    REFERENCES agent_saga_instance (account_id, saga_id)
);

CREATE TABLE agent_saga_projection_checkpoint (
  account_id BIGINT NOT NULL,
  projection_name TEXT NOT NULL,
  shard_id INTEGER NOT NULL CHECK (shard_id >= 0),
  source_sequence BIGINT NOT NULL CHECK (source_sequence >= 0),
  source_hash CHAR(64) NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, projection_name, shard_id)
);

CREATE FUNCTION agent_saga_guard_template_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'sealed saga templates are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'DRAFT' THEN
    IF NEW.status = 'DRAFT' THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'APPROVED'
       AND NEW.approved_by IS NOT NULL
       AND NEW.approved_at IS NOT NULL
       AND NEW.approval_validation_hash IS NOT NULL
       AND NEW.approval_validation_hash = NEW.definition_hash
       AND current_setting('app.saga_template_approval', true)
         = concat(
           NEW.template_id::TEXT, ':',
           NEW.template_version::TEXT, ':',
           NEW.definition_hash
         )
       AND (
         to_jsonb(NEW)
           - 'status' - 'approved_by' - 'approved_at'
           - 'approval_validation_hash'
       ) = (
         to_jsonb(OLD)
           - 'status' - 'approved_by' - 'approved_at'
           - 'approval_validation_hash'
       ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'invalid saga template approval transition';
  END IF;

  IF OLD.status = 'APPROVED'
     AND NEW.status = 'REVOKED'
     AND NEW.revoked_at IS NOT NULL
     AND (to_jsonb(NEW) - 'status' - 'revoked_at')
       = (to_jsonb(OLD) - 'status' - 'revoked_at') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sealed saga templates are immutable';
END
$guard$;

CREATE FUNCTION agent_saga_guard_template_child()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
DECLARE
  parent_status saga_template_status;
  new_parent_status saga_template_status;
  tenant BIGINT;
  parent_template UUID;
  parent_version INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    tenant := NEW.account_id;
    parent_template := NEW.template_id;
    parent_version := NEW.template_version;
  ELSE
    tenant := OLD.account_id;
    parent_template := OLD.template_id;
    parent_version := OLD.template_version;
  END IF;

  SELECT status INTO parent_status
  FROM agent_saga_template
  WHERE account_id = tenant
    AND template_id = parent_template
    AND template_version = parent_version
  FOR UPDATE;

  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'sealed saga template children are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT status INTO new_parent_status
  FROM agent_saga_template
  WHERE account_id = NEW.account_id
    AND template_id = NEW.template_id
    AND template_version = NEW.template_version
  FOR UPDATE;

  IF new_parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'new saga template parent must be a draft';
  END IF;
  RETURN NEW;
END
$guard$;

CREATE FUNCTION agent_saga_validate_compensation_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
DECLARE
  compensation_kind saga_step_kind;
  declared_compensation_step TEXT;
BEGIN
  SELECT step_kind INTO compensation_kind
  FROM agent_saga_template_step
  WHERE account_id = NEW.account_id
    AND template_id = NEW.template_id
    AND template_version = NEW.template_version
    AND step_id = NEW.compensation_step_id;

  SELECT template_step.compensation_step_id
    INTO declared_compensation_step
  FROM agent_saga_effect_intent AS effect
  JOIN agent_saga_step_run AS run
    ON run.account_id = effect.account_id
   AND run.saga_id = effect.saga_id
   AND run.step_id = effect.step_id
   AND run.run_no = effect.run_no
  JOIN agent_saga_template_step AS template_step
    ON template_step.account_id = run.account_id
   AND template_step.template_id = run.template_id
   AND template_step.template_version = run.template_version
   AND template_step.step_id = run.step_id
  WHERE effect.account_id = NEW.account_id
    AND effect.saga_id = NEW.saga_id
    AND effect.effect_id = NEW.original_effect_id;

  IF compensation_kind IS DISTINCT FROM 'COMPENSATION'
     OR declared_compensation_step IS DISTINCT FROM NEW.compensation_step_id THEN
    RAISE EXCEPTION 'compensation plan does not match sealed procedure';
  END IF;
  RETURN NEW;
END
$guard$;

CREATE FUNCTION agent_saga_guard_effect_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'effect intents are immutable';
  END IF;
  IF (to_jsonb(NEW) - 'intent_status')
     <> (to_jsonb(OLD) - 'intent_status') THEN
    RAISE EXCEPTION 'effect intent identity is immutable';
  END IF;
  IF NEW.intent_status = OLD.intent_status
     OR (OLD.intent_status = 'PREPARED'
       AND NEW.intent_status = 'DISPATCHING')
     OR (OLD.intent_status = 'DISPATCHING'
       AND NEW.intent_status IN ('OBSERVED', 'UNKNOWN_EFFECT'))
     OR (OLD.intent_status = 'UNKNOWN_EFFECT'
       AND NEW.intent_status IN ('DISPATCHING', 'OBSERVED', 'RESOLVED'))
     OR (OLD.intent_status = 'OBSERVED'
       AND NEW.intent_status = 'RESOLVED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid effect intent status transition';
END
$guard$;

CREATE FUNCTION agent_saga_guard_compensation_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compensation plans are immutable';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at')
     <> (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'compensation plan identity is immutable';
  END IF;
  IF NEW.status = OLD.status
     OR (OLD.status = 'PLANNED'
       AND NEW.status IN ('RUNNING', 'NEEDS_HUMAN'))
     OR (OLD.status = 'RUNNING'
       AND NEW.status IN ('SUCCEEDED', 'FAILED', 'NEEDS_HUMAN')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid compensation plan status transition';
END
$guard$;

CREATE FUNCTION agent_saga_guard_compensation_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compensation plan rows are immutable';
  END IF;
  IF (
    to_jsonb(NEW) - 'status' - 'updated_at' - 'compensation_effect_id'
  ) <> (
    to_jsonb(OLD) - 'status' - 'updated_at' - 'compensation_effect_id'
  ) THEN
    RAISE EXCEPTION 'compensation plan row identity is immutable';
  END IF;
  IF OLD.compensation_effect_id IS NOT NULL
     AND NEW.compensation_effect_id IS DISTINCT FROM OLD.compensation_effect_id THEN
    RAISE EXCEPTION 'compensation effect binding is immutable';
  END IF;
  IF NEW.status = OLD.status
     OR (OLD.status = 'PLANNED'
       AND NEW.status IN ('RUNNING', 'NEEDS_HUMAN'))
     OR (OLD.status = 'RUNNING'
       AND NEW.status IN (
         'SUCCEEDED', 'FAILED', 'UNKNOWN_EFFECT', 'NEEDS_HUMAN'
       ))
     OR (OLD.status = 'UNKNOWN_EFFECT'
       AND NEW.status IN ('RUNNING', 'NEEDS_HUMAN')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid compensation row status transition';
END
$guard$;

CREATE FUNCTION agent_saga_reject_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $guard$
BEGIN
  RAISE EXCEPTION 'immutable saga evidence cannot be changed';
END
$guard$;

CREATE TRIGGER agent_saga_template_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_template
  FOR EACH ROW EXECUTE FUNCTION agent_saga_guard_template_update();
CREATE TRIGGER agent_saga_template_step_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON agent_saga_template_step
  FOR EACH ROW EXECUTE FUNCTION agent_saga_guard_template_child();
CREATE TRIGGER agent_saga_template_edge_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON agent_saga_template_edge
  FOR EACH ROW EXECUTE FUNCTION agent_saga_guard_template_child();
CREATE TRIGGER agent_saga_compensation_plan_valid
  BEFORE INSERT OR UPDATE ON agent_saga_compensation_run
  FOR EACH ROW EXECUTE FUNCTION agent_saga_validate_compensation_plan();
CREATE TRIGGER agent_saga_effect_intent_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_effect_intent
  FOR EACH ROW EXECUTE FUNCTION agent_saga_guard_effect_intent();
CREATE TRIGGER agent_saga_compensation_plan_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_compensation_plan
  FOR EACH ROW EXECUTE FUNCTION agent_saga_guard_compensation_plan();
CREATE TRIGGER agent_saga_compensation_run_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_compensation_run
  FOR EACH ROW EXECUTE FUNCTION agent_saga_guard_compensation_run();
CREATE TRIGGER agent_saga_authorization_evidence_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_authorization_evidence
  FOR EACH ROW EXECUTE FUNCTION agent_saga_reject_evidence_mutation();
CREATE TRIGGER agent_saga_receipt_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_effect_receipt
  FOR EACH ROW EXECUTE FUNCTION agent_saga_reject_evidence_mutation();
CREATE TRIGGER agent_saga_audit_event_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_audit_event
  FOR EACH ROW EXECUTE FUNCTION agent_saga_reject_evidence_mutation();
CREATE TRIGGER agent_saga_audit_anchor_immutable
  BEFORE UPDATE OR DELETE ON agent_saga_audit_anchor
  FOR EACH ROW EXECUTE FUNCTION agent_saga_reject_evidence_mutation();

CREATE FUNCTION approve_agent_saga_template(
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
  stored_status saga_template_status;
  configured_max_steps SMALLINT;
  actual_steps INTEGER;
BEGIN
  SELECT definition_hash, status, max_steps
    INTO stored_hash, stored_status, configured_max_steps
  FROM agent_saga_template
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version
  FOR UPDATE;

  IF length(validated_definition_hash) <> 64
     OR stored_status IS DISTINCT FROM 'DRAFT'
     OR stored_hash IS DISTINCT FROM validated_definition_hash THEN
    RAISE EXCEPTION 'template approval hash or state mismatch';
  END IF;

  SELECT count(*)::INTEGER INTO actual_steps
  FROM agent_saga_template_step
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;
  IF actual_steps NOT BETWEEN 1 AND configured_max_steps THEN
    RAISE EXCEPTION 'template step count is outside sealed bounds';
  END IF;

  IF EXISTS (
    WITH RECURSIVE reachable(from_step_id, to_step_id) AS (
      SELECT from_step_id, to_step_id
      FROM agent_saga_template_edge
      WHERE account_id = tenant_id
        AND template_id = target_template_id
        AND template_version = target_template_version
      UNION
      SELECT reachable.from_step_id, edge.to_step_id
      FROM reachable
      JOIN agent_saga_template_edge AS edge
        ON edge.account_id = tenant_id
       AND edge.template_id = target_template_id
       AND edge.template_version = target_template_version
       AND edge.from_step_id = reachable.to_step_id
    )
    SELECT 1 FROM reachable WHERE from_step_id = to_step_id
  ) THEN
    RAISE EXCEPTION 'template graph must be acyclic';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agent_saga_template_step AS forward_step
    LEFT JOIN agent_saga_template_step AS compensation_step
      ON compensation_step.account_id = forward_step.account_id
     AND compensation_step.template_id = forward_step.template_id
     AND compensation_step.template_version = forward_step.template_version
     AND compensation_step.step_id = forward_step.compensation_step_id
    WHERE forward_step.account_id = tenant_id
      AND forward_step.template_id = target_template_id
      AND forward_step.template_version = target_template_version
      AND forward_step.compensation_step_id IS NOT NULL
      AND compensation_step.step_kind IS DISTINCT FROM 'COMPENSATION'
  ) THEN
    RAISE EXCEPTION 'declared compensation step is invalid';
  END IF;

  PERFORM set_config(
    'app.saga_template_approval',
    concat(
      target_template_id::TEXT, ':',
      target_template_version::TEXT, ':',
      validated_definition_hash
    ),
    true
  );

  UPDATE agent_saga_template
  SET status = 'APPROVED',
      approved_by = approver_id,
      approved_at = clock_timestamp(),
      approval_validation_hash = validated_definition_hash
  WHERE account_id = tenant_id
    AND template_id = target_template_id
    AND template_version = target_template_version;
END
$approve$;

REVOKE ALL ON FUNCTION approve_agent_saga_template(
  BIGINT, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE UPDATE (
  status, approved_by, approved_at, approval_validation_hash
) ON agent_saga_template FROM PUBLIC;

CREATE INDEX agent_saga_instance_work_idx ON agent_saga_instance (
  account_id, status, updated_at, saga_id
);
CREATE INDEX agent_saga_instance_template_idx ON agent_saga_instance (
  account_id, template_id, template_version, created_at DESC
);
CREATE INDEX agent_saga_step_ready_idx ON agent_saga_step_run (
  account_id, status, lease_expires_at, saga_id, step_id
) WHERE status IN ('READY', 'CLAIMED');
CREATE INDEX agent_saga_dependency_ready_idx ON agent_saga_dependency_counter (
  account_id, remaining_dependencies, saga_id, step_id
);
CREATE INDEX agent_saga_outbox_claim_idx ON agent_saga_dispatch_outbox (
  account_id, status, not_before, claim_expires_at, message_id
) WHERE status IN ('PENDING', 'CLAIMED');
CREATE INDEX agent_saga_effect_saga_idx ON agent_saga_effect_intent (
  account_id, saga_id, step_id, run_no
);
CREATE INDEX agent_saga_attempt_recovery_idx ON agent_saga_effect_attempt (
  account_id, transport_status, point_of_no_return_at, effect_id
) WHERE transport_status IN ('STARTED', 'SENT', 'TIMED_OUT');
CREATE INDEX agent_saga_receipt_effect_idx ON agent_saga_effect_receipt (
  account_id, effect_id, observed_at DESC
);
CREATE INDEX agent_saga_compensation_work_idx ON agent_saga_compensation_run (
  account_id, status, updated_at, saga_id
) WHERE status IN ('PLANNED', 'RUNNING', 'UNKNOWN_EFFECT', 'NEEDS_HUMAN');
CREATE INDEX agent_saga_compensation_plan_work_idx
  ON agent_saga_compensation_plan (
  account_id, status, updated_at, saga_id, plan_id
) WHERE status IN ('PLANNED', 'RUNNING', 'NEEDS_HUMAN');
CREATE INDEX agent_saga_audit_time_idx ON agent_saga_audit_event (
  account_id, occurred_at, saga_id, event_sequence
);
CREATE INDEX agent_saga_perception_status_idx ON agent_saga_perception_snapshot (
  account_id, status, created_at DESC, saga_id
);
CREATE INDEX agent_saga_command_expiry_idx ON agent_saga_command_result (
  account_id, expires_at, operation_name, principal_id
);

DO $tenant_isolation$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_saga_authorization_evidence',
    'agent_saga_template',
    'agent_saga_template_step',
    'agent_saga_template_edge',
    'agent_saga_instance',
    'agent_saga_step_run',
    'agent_saga_dependency_counter',
    'agent_saga_budget_ledger',
    'agent_saga_effect_intent',
    'agent_saga_dispatch_outbox',
    'agent_saga_effect_attempt',
    'agent_saga_effect_receipt',
    'agent_saga_compensation_plan',
    'agent_saga_compensation_run',
    'agent_saga_human_resolution',
    'agent_saga_inbox_dedupe',
    'agent_saga_command_result',
    'agent_saga_audit_head',
    'agent_saga_audit_event',
    'agent_saga_audit_anchor',
    'agent_saga_perception_snapshot',
    'agent_saga_projection_checkpoint'
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

- Start: instance, counters, budget reservation, audit head/event, command
  result, and perception.

Command replay rows retain hashes and allowlisted redactions in SQL. Full board
values or tool requests are encrypted under server-minted tenant-bound object
references, so idempotency does not create a second plaintext data store.
- Local step: board mutation, step transition, budget, dependencies, audit,
  command result, and perception revision.
- Effect prepare: effect intent, outbox, budget reservation, audit, command
  result, and perception revision.
- Receipt: inbox dedupe, trusted receipt, intent/step transition, dependencies,
  audit, and perception revision.
- Resolution: human decision, resulting transition, command result, audit, and
  perception revision.

Every boundary locks `(account_id, saga_id)` and checks `state_revision`.
Dispatch performs no business-state mutation; it only generation-CASes the
outbox and appends an attempt before the adapter crosses its point of no return.

### 8.2 Tenant isolation

The gateway sets `app.account_id` from verified authentication in a
transaction-local setting. Forced RLS is defense in depth; services also issue
tenant-leading predicates. Composite foreign keys make cross-account references
structurally invalid. Background workers claim work for one explicit account,
never from a global unscoped queue.

Authorization evidence is not hash-only: each decision references an immutable,
encrypted canonical scope/ACL snapshot in cross-region archival storage plus a
redacted SQL summary and content hash. Replay can therefore establish the exact
delegation and resource revision even after the live policy system advances.

## 9. Open API GraphQL contract

All functionality is available through the monday.com Open API. Long-running
mutations return durable state, not a synchronous provider promise.

```graphql
scalar DateTime
scalar Long
scalar JSON
scalar SHA256

enum AgentSagaStatus {
  READY
  RUNNING
  WAITING_EFFECT
  COMPENSATING
  NEEDS_HUMAN
  SUCCEEDED
  FAILED
  CANCELLED
}

enum AgentSagaStepStatus {
  BLOCKED
  READY
  CLAIMED
  DISPATCH_PENDING
  WAITING_RECEIPT
  SUCCEEDED
  FAILED
  UNKNOWN_EFFECT
  COMPENSATING
  COMPENSATED
  SKIPPED
  NEEDS_HUMAN
}

enum AgentEffectOutcome {
  SUCCEEDED
  FAILED_BEFORE_EFFECT
  FAILED_AFTER_EFFECT
  UNKNOWN_EFFECT
}

enum AgentUncertaintyResolution {
  RETRY_SAME_KEY
  ACCEPT_AS_SUCCEEDED
  MARK_FAILED_NO_EFFECT
  REQUIRE_COMPENSATION
}

enum AgentContentProvenance {
  USER_INPUT
  BOARD_VALUE
  PROVIDER_VALUE
}

enum AgentSagaNextAction {
  CLAIM_READY_STEP
  REQUEST_VERIFICATION
  REQUEST_COMPENSATION
  REQUEST_HUMAN_RESOLUTION
  CANCEL
}

enum AgentSagaBlockedReason {
  WAIT_FOR_RECEIPT
  HUMAN_RESOLUTION_REQUIRED
  BUDGET_EXHAUSTED
  POLICY_DENIED
  NO_READY_STEP
}

type AgentUntrustedText {
  value: String!
  provenance: AgentContentProvenance!
  trust: String!
}

type AgentSagaTemplate {
  accountId: ID!
  templateId: ID!
  version: Int!
  name: String!
  status: String!
  definitionHash: SHA256!
  maxSteps: Int!
  maxParallelism: Int!
  semanticScore: Float
}

type AgentSagaStepRun {
  stepId: ID!
  runNo: Int!
  status: AgentSagaStepStatus!
  leaseGeneration: Long!
  resultHash: SHA256
  errorClass: String
}

type AgentExternalEffect {
  effectId: ID!
  stepId: ID!
  capability: String!
  state: String!
  outcome: AgentEffectOutcome
  receiptHash: SHA256
  signatureVerified: Boolean
}

type AgentSaga {
  accountId: ID!
  sagaId: ID!
  templateId: ID!
  templateVersion: Int!
  status: AgentSagaStatus!
  stateRevision: Long!
  purpose: AgentUntrustedText!
  steps: [AgentSagaStepRun!]!
  effects: [AgentExternalEffect!]!
  createdAt: DateTime!
  updatedAt: DateTime!
  terminalOutcomeHash: SHA256
}

type AgentSagaPerception {
  accountId: ID!
  sagaId: ID!
  revision: Long!
  status: AgentSagaStatus!
  purpose: AgentUntrustedText!
  templateDefinitionHash: SHA256!
  policyRevision: Long!
  currentStepIds: [ID!]!
  uncertainEffectIds: [ID!]!
  remainingReadUnits: Long!
  remainingWriteUnits: Long!
  remainingToolUnits: Long!
  deadlineAt: DateTime!
  remainingWallTimeMs: Long!
  sourceWatermark: String!
  procedureTags: [String!]!
  allowedNextActions: [AgentSagaNextAction!]!
  blockedReasons: [AgentSagaBlockedReason!]!
  cardHash: SHA256!
}

type AgentSagaAuditEvent {
  sequence: Long!
  eventType: String!
  actorType: String!
  actorId: String!
  requestId: String!
  sagaRevision: Long!
  canonicalPayloadHash: SHA256!
  previousEventHash: SHA256!
  eventHash: SHA256!
  occurredAt: DateTime!
}

type AgentSagaAuditConnection {
  events: [AgentSagaAuditEvent!]!
  nextCursor: String
  chainHeadHash: SHA256!
}

type AgentSagaMutationResult {
  decision: String!
  saga: AgentSaga
  claim: AgentSagaStepClaim
  code: String
  retryable: Boolean!
  reason: String
  auditHash: SHA256
}

type AgentSagaStepClaim {
  stepId: ID!
  runNo: Int!
  claimToken: ID!
  leaseGeneration: Long!
  leaseExpiresAt: DateTime!
}

input AgentSagaBudgetInput {
  readUnits: Long!
  writeUnits: Long!
  toolUnits: Long!
  maxWallTimeMs: Int!
}

input StartAgentSagaInput {
  accountId: ID!
  templateId: ID!
  templateVersion: Int!
  idempotencyKey: String!
  input: JSON!
  purpose: String!
  budget: AgentSagaBudgetInput!
}

input ClaimAgentSagaStepInput {
  accountId: ID!
  sagaId: ID!
  stepId: ID!
  expectedRevision: Long!
  leaseMs: Int!
  idempotencyKey: String!
}

input AgentSagaBoardMutationInput {
  boardId: ID!
  itemId: ID!
  expectedItemVersion: Long!
  operation: String!
  valuesSchemaVersion: String!
  values: JSON!
}

input CommitAgentSagaLocalStepInput {
  accountId: ID!
  sagaId: ID!
  stepId: ID!
  runNo: Int!
  expectedRevision: Long!
  claimToken: ID!
  mutations: [AgentSagaBoardMutationInput!]!
  idempotencyKey: String!
}

input PrepareAgentSagaEffectInput {
  accountId: ID!
  sagaId: ID!
  stepId: ID!
  runNo: Int!
  expectedRevision: Long!
  claimToken: ID!
  requestSchemaVersion: String!
  typedRequest: JSON!
  idempotencyKey: String!
}

input RequestAgentSagaVerificationInput {
  accountId: ID!
  sagaId: ID!
  effectId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
}

input ResolveAgentSagaUncertaintyInput {
  accountId: ID!
  sagaId: ID!
  effectId: ID!
  expectedRevision: Long!
  resolution: AgentUncertaintyResolution!
  evidenceRef: ID!
  justification: String!
  idempotencyKey: String!
}

input AgentSagaTransitionInput {
  accountId: ID!
  sagaId: ID!
  expectedRevision: Long!
  idempotencyKey: String!
  reason: String!
}

input RetryAgentSagaStepInput {
  accountId: ID!
  sagaId: ID!
  stepId: ID!
  failedRunNo: Int!
  expectedRevision: Long!
  idempotencyKey: String!
  reason: String!
}

type Query {
  agentSagaTemplate(
    accountId: ID!
    templateId: ID!
    version: Int
  ): AgentSagaTemplate

  agentSaga(accountId: ID!, sagaId: ID!): AgentSaga

  agentSagaPerception(accountId: ID!, sagaId: ID!): AgentSagaPerception

  agentSagaAudit(
    accountId: ID!
    sagaId: ID!
    afterSequence: Long
    first: Int! = 100
  ): AgentSagaAuditConnection!

  agentSagaTemplates(
    accountId: ID!
    semanticQuery: String!
    topK: Int! = 10
    requiredCapabilities: [String!]! = []
  ): [AgentSagaTemplate!]!
}

type Mutation {
  startAgentSaga(input: StartAgentSagaInput!): AgentSagaMutationResult!
  claimAgentSagaStep(
    input: ClaimAgentSagaStepInput!
  ): AgentSagaMutationResult!
  commitAgentSagaLocalStep(
    input: CommitAgentSagaLocalStepInput!
  ): AgentSagaMutationResult!
  prepareAgentSagaEffect(
    input: PrepareAgentSagaEffectInput!
  ): AgentSagaMutationResult!
  requestAgentSagaVerification(
    input: RequestAgentSagaVerificationInput!
  ): AgentSagaMutationResult!
  requestAgentSagaCompensation(
    input: AgentSagaTransitionInput!
  ): AgentSagaMutationResult!
  resolveAgentSagaUncertainty(
    input: ResolveAgentSagaUncertaintyInput!
  ): AgentSagaMutationResult!
  cancelAgentSaga(
    input: AgentSagaTransitionInput!
  ): AgentSagaMutationResult!
  retryAgentSagaStep(
    input: RetryAgentSagaStepInput!
  ): AgentSagaMutationResult!
}
```

### GraphQL limits

`first` is 1–200, `topK` is 1–20, and audit pagination is keyset-based.
Mutation payloads are size-limited and canonicalized before hashing. The
resolver rejects omitted or mismatched `accountId`, introspection does not
expose hidden capability configuration, and subscriptions consume a separate
bounded change stream rather than polling the saga table.

The gateway also caps depth, aliases, batched operations, total complexity,
semantic-query length, and per-principal request rate. Sensitive mutations use
allowlisted persisted operations. Every resolver checks delegated operation,
board, template, target, and audit scopes in addition to account membership.
`requestAgentSagaVerification` asks a trusted adapter to inspect a provider; it
does not let a GraphQL caller submit a receipt or choose an outcome.
Claim fields are returned only to principals with the worker-execution scope;
tokens are short-lived, single-step capabilities and are redacted from audit
and ordinary saga reads. An idempotent replay by the same authenticated
principal decrypts and returns the original claim capability from the encrypted
command result; after lease expiry it remains historical evidence and a new
claim requires a new idempotency key.

## 10. Procedural memory

The approved template is procedural memory: it stores explicit, versioned
instructions an agent may follow. Each step has:

- an allowlisted machine capability, never arbitrary code;
- typed input projection and deterministic precondition;
- expected source freshness and consistency;
- retry and timeout policy;
- budget estimates;
- explicit compensation or an irreversible marker;
- human-readable purpose and semantic tags.

An LLM may retrieve and propose a template, populate typed inputs, and explain
the plan. It may not alter the sealed graph or transition rules at runtime.
Template promotion requires offline evaluation, owner approval, and a new hash.

## 11. Semantic retrieval and HNSW compatibility

Only approved template summaries and capability metadata are embedded. Runtime
requests, receipts, secrets, customer values, and unresolved effect payloads
are excluded. Every vector row belongs to one account-owned semantic segment.

```sql
CREATE TABLE agent_saga_template_embedding (
  account_id BIGINT NOT NULL,
  semantic_segment_id UUID NOT NULL,
  template_id UUID NOT NULL,
  template_version INTEGER NOT NULL,
  embedding_model_id TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  embedded_content_hash CHAR(64) NOT NULL,
  definition_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id, semantic_segment_id, template_id,
    template_version, embedding_model_id
  ),
  FOREIGN KEY (
    account_id, template_id, template_version, definition_hash
  ) REFERENCES agent_saga_template (
    account_id, template_id, template_version, definition_hash
  )
);

ALTER TABLE agent_saga_template_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_saga_template_embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_saga_template_embedding
  USING (
    account_id =
      NULLIF(current_setting('app.account_id', true), '')::BIGINT
  )
  WITH CHECK (
    account_id =
      NULLIF(current_setting('app.account_id', true), '')::BIGINT
  );
```

There is deliberately no global HNSW index in the reference DDL. The vector
control plane provisions one physical table and local HNSW index per
`(account_id, semantic_segment_id, embedding_model_id)`, and stores the segment
binding in an account-scoped catalog. The router includes `account_id` in every
segment and cache key and resolves that tuple before opening an index; routing
failure is closed, not retried against a shared graph. This ensures one tenant's
graph is never traversed for another tenant's query. The `VECTOR(1536)` contract
is executable pgvector schema; segment provisioning and isolation receive
separate integration tests.

A bounded retrieval shape is:

```sql
SELECT
  account_id,
  template_id,
  template_version,
  definition_hash,
  1 - (embedding <=> $3::vector) AS semantic_score
FROM agent_saga_template_embedding
WHERE account_id = $1
  AND semantic_segment_id = $2
  AND embedding_model_id = $4
ORDER BY embedding <=> $3::vector
LIMIT LEAST($5, 20);
```

Candidates are joined by the composite tenant key to `APPROVED` templates and
then checked against current capabilities and purpose. Similarity is never an
authorization decision.

## 12. Agent perception

The perception card gives an LLM a compact, deterministic view instead of raw
operational tables:

- `status` and exact `revision`;
- currently actionable steps;
- effect state grouped as unprepared, dispatched, observed, or uncertain;
- remaining read/write/tool budget;
- source and policy watermarks;
- procedure tags and capabilities;
- allowlisted next actions;
- machine-readable blockers such as `WAIT_FOR_RECEIPT`,
  `HUMAN_RESOLUTION_REQUIRED`, or `BUDGET_EXHAUSTED`;
- a card hash for citation and replay.

Every state transition writes the card for the new revision in the same
transaction, including policy revision, template definition hash, deadline, and
evidence trust. Purpose and customer-authored labels are separately marked
`UNTRUSTED_CONTENT`; they never share the instruction channel. Every proposed
next action must still reauthorize against `expectedRevision`.

Raw provider payloads, credentials, target identifiers, internal lease tokens,
and cross-tenant aggregate statistics are never placed in agent context.
Target references are represented as stable tenant-HMAC aliases.

## 13. ACID and consistency

### Row store

Saga authority, board writes, budgets, and audit transitions use the row store.
Write steps use serializable isolation or explicit board-row/version locks and
recheck every authorization and business predicate inside the commit
transaction. Read-only local steps may use snapshot consistency according to
their sealed contract. Saga revision CAS prevents lost saga updates but is not
presented as protection from board-level write skew between different sagas.

### Columnar store

Saga analytics are append-projected with account and source sequence. Dashboards
show `projectedThrough` and cannot drive runtime transitions. Lag does not block
the row path.

### Vector store

Template discovery is eventually consistent and carries model plus definition
hashes. A stale candidate is rejected when its hash does not match the current
approved row-store record.

### External tools

External providers are not ACID participants. mondayDB guarantees durable
intent and at-least-once delivery attempts under a stable idempotency key; the
adapter contract determines whether this yields effectively-once effects.
Version one rejects external capabilities whose provider contract does not
enforce the supplied idempotency key. A future at-most-one-send mode would need
a separate step kind and explicit lost-liveness product contract; it is not
silently represented as an idempotent effect.

## 14. Guardrails and neighbor protection

Admission reserves four dimensions: row read units, row write units, external
tool units, and wall time. Vector discovery has its own top-K and distance-work
budget. Account and global governors clamp:

- 32 steps per template;
- 8 parallel steps per saga;
- 5 attempts per step;
- 20 semantic candidates;
- 100 audit events per page;
- 5-minute step timeout and 24-hour saga wall-time default;
- per-account active-saga, dispatch, verification, and compensation slots.

Nested saga creation and recursive template references are rejected. Repeated
plan/effect fingerprints trip loop containment and enter `NEEDS_HUMAN`.

The dispatcher uses weighted fair queues and circuit breakers per provider and
account. A degraded provider reduces that capability's slots without consuming
row-query capacity. Compensation traffic has reserved capacity but remains
tenant-budgeted.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

The following receive the planner outcome **FULL SCAN REJECTED**:

1. A board mutation or precondition without `account_id` and an indexed board
   selector.
2. Discovery without a resolved account-owned semantic segment.
3. Polling all `WAITING_EFFECT` sagas instead of claiming the outbox index.
4. Recomputing dependencies from all historical step runs.
5. Audit pagination by offset.
6. JSON-path filtering on `instruction`, `precondition`, perception, or receipt
   metadata without an approved derived index.
7. Compensation discovery by scanning every saga or effect.
8. Columnar analytics used synchronously to authorize a row-store transition.

### Required access paths

- Runtime lookup: `(account_id, saga_id)`.
- Tenant work claim: `(account_id, status, updated_at, saga_id)`.
- Ready step: `(account_id, status, lease_expires_at, saga_id, step_id)`.
- Outbox: `(account_id, status, not_before, claim_expires_at, message_id)`.
- Effect: `(account_id, effect_id)` or tenant saga index.
- Receipt dedupe: `(account_id, effect_id, provider_event_id)`.
- Audit: `(account_id, saga_id, event_sequence)`.
- Semantic: pre-routed account-owned HNSW segment with bounded top-K.

Dependency counters make scheduling O(out-degree), not O(saga history). A
million-row board precondition must compile to a selective existing board
index. A watermark-bound columnar synopsis may estimate admission cost or
suggest candidates, but the exact predicate is rechecked through a selective
row-store index inside the write transaction; otherwise admission rejects it.

### Planner enforcement

Bound-parameter custom `EXPLAIN` estimates are normalized into integer units.
Any disallowed plan node, row path over the tenant threshold, unbounded
recursive expansion, or JSON filter without an approved index is rejected.
Allowed index identities and estimates are hashed into the audit preflight.
Statement timeout, rows-touched caps, and executor unit interrupts stop an
overrun inside the current step; the next step cannot silently borrow from
neighboring tenants.

## 16. Auditability and replay

Each event stores the versioned canonical transition body and all
nondeterministic decision inputs: generated IDs, exact policy/resource
revisions, source versions, timer instant, estimates, budget deltas, and
evidence references. Its hash uses domain-separated, length-prefixed encoding:

`SHA256("mondaydb:saga-event:v1" || LP(account_id) || LP(saga_id) ||
LP(sequence) || LP(canonical_event_bytes) || LP(previous_event_hash))`.

The audit append locks `agent_saga_audit_head`, requires the next sequence and
previous hash, inserts the event, and advances the head in the same transaction
as the state change. Provider evidence includes payload digest, signature
result, adapter version, capability version, and point-of-no-return timestamp.
Anchor workers periodically sign chain heads into a cross-region immutable
archive and store the archive receipt. Deleting or recomputing database rows
therefore cannot conceal divergence.

Replay starts from the immutable template hash and start input hash, applies
events in sequence, and must reproduce every revision, budget balance,
dependency counter, effect state, and final outcome hash. Payload references
that were legally erased replay as explicit tombstones, not fabricated values.

## 17. Threat and failure analysis

| Threat or failure | Deterministic response |
|---|---|
| Cross-tenant object ID | Composite FK, explicit predicate, and forced RLS reject |
| Duplicate start | Tenant idempotency unique key returns same immutable request |
| Worker dies before local commit | Transaction rolls back; lease expires |
| Worker dies after local commit | State and audit exist; replay returns committed revision |
| Worker dies before dispatch | Existing outbox intent is reclaimed |
| Timeout after dispatch | Mark `UNKNOWN_EFFECT`; do not blind retry |
| Duplicate provider webhook | Tenant inbox primary key deduplicates |
| Forged webhook | Adapter ingress rejects it; public GraphQL cannot author receipts |
| Stale worker after failover | Higher generation rejects stale commit; stable provider key deduplicates a packet already sent |
| Provider lacks idempotency | Template approval rejects the capability |
| LLM invents compensation | Not present in sealed template; reject |
| Nested/recursive saga request | Version-one runtime rejects it before start |
| Budget race | Saga-row lock and ledger sequence serialize consumption |
| Stale vector candidate | Row-store approval and definition hash reject |
| Audit tampering | Hash-chain replay and immutable archive detect |
| Provider outage | Circuit breaker; no held DB transactions |

An attacker cannot use vector similarity, target aliases, or provider errors to
bypass the tenant boundary. Error surfaces are normalized and do not reveal
whether an object exists in another account. Capacity partitioning, padded
negative responses, and tenant-bound caches reduce timing leakage; isolation
tests measure the remaining side channel rather than claiming it is impossible.

## 18. Observability and SLOs

Tenant-safe metrics:

- start and transition p50/p95/p99 latency;
- ready-to-claim and outbox dispatch lag;
- receipt latency by capability and provider;
- `UNKNOWN_EFFECT` and human-resolution rate;
- duplicate dispatch suppression;
- compensation success and uncertainty;
- budget rejection and runtime overrun;
- stale claim/generation rejection;
- row, columnar, and vector watermark lag;
- audit replay mismatch count;
- per-account queue fairness without exposing tenant names.

Targets:

- row-store transition availability: 99.99%;
- no acknowledged local transition without matching audit event;
- zero accepted cross-account references;
- p99 local transition under the normal interactive budget;
- bounded provider degradation with no row-query pool starvation;
- 100% of post-dispatch ambiguity represented as `UNKNOWN_EFFECT`;
- zero approved external capability without provider-enforced idempotency.

Alerts use error-budget burn, not raw tenant size. High-cardinality IDs stay in
traces with access control and retention limits, not metric labels.

## 19. Rollout

### Phase 1: shadow compilation

Compile existing automations into templates, calculate cycles and worst-case
budgets, and compare inferred effects with observed actions. Dispatch remains
unchanged.

### Phase 2: local-only sagas

Enable immutable templates, revision CAS, budgets, audit replay, and perception
for selected internal local transactions. Verify deterministic recovery.

### Phase 3: idempotent tools

Enable outbox dispatch for providers with strong idempotency and signed
receipts. Shadow `UNKNOWN_EFFECT` classification before enforcement.

### Phase 4: compensation and Open API

Enable approved compensation, human resolution, semantic template discovery,
and all GraphQL operations for opted-in accounts. Maintain provider-specific
kill switches and account quotas.

### Phase 5: broad availability

Require disaster recovery, multi-region generation fencing, replay conformance,
provider outage tests, and million-row board load evidence before broad
availability.

## 20. Ship criteria

### Contract validation

- TypeScript compiles under strict mode.
- GraphQL builds and validates.
- PostgreSQL plus pgvector DDL executes.
- Every relational table and ordinary index is tenant-leading.
- Executable tests reject cross-account references and duplicate idempotency.

### Behavioral validation

- Crash before and after each durable boundary and recover without duplicates.
- Prove local board mutation and saga transition are one transaction.
- Prove effect intent and outbox are one transaction.
- Force timeout after point of no return and observe `UNKNOWN_EFFECT`.
- Replay signed receipt and webhook duplicates idempotently.
- Reject stale revision, lease, policy, and dispatch generation.
- Verify compensation ordering and irreversible-effect escalation.
- Replay audit chain to the same terminal hash.

### Scale and failure validation

- Run selective local steps on 1M+ row boards with no full scan.
- Saturate one account and one provider without harming neighbor p99.
- Fail row, columnar, vector, dispatcher, and provider paths independently.
- Restore from regional failover without dual dispatch generations.
- Measure HNSW recall and latency only inside account-owned segments.
- Verify 99.99% row transition objective under provider outage.

## 21. Product decision

Build the Effect Saga Plane as the only supported way for agents to coordinate
mondayDB writes with external side effects. Keep the database deterministic:
LLMs may select an approved procedure and propose typed inputs, but mondayDB
owns authorization, transition rules, budgets, leases, idempotency, uncertainty,
compensation, and audit.

This deliberately favors truthful partial-state reporting over a simpler
"success/failure" API. That honesty is the foundation for safe autonomous work:
agents get durable procedural memory and semantic discovery, enterprises keep
ACID local state and tenant isolation, and external failures cannot become
unbounded retries or hidden data corruption.
