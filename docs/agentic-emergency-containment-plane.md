# mondayDB Agentic Emergency Containment Plane

Status: strategic design proposal  
Owners: mondayDB Product, Transactions, Agent Platform, Open API, Security, SRE  
Primary SLO: containment must preserve the existing 99.99% data-plane availability target while preventing newly fenced autonomous effects

## 1. Why this plane, before how

As mondayDB gives agents durable memory, semantic retrieval, workload identities, and permission to act, an enterprise needs a precise answer to a harder question: **how do we stop an autonomous workload safely after it has already started?**

The product trade-off is **containment latency versus availability and completion guarantees**:

- A global database kill switch is fast to explain but turns one tenant's incident into a shared outage.
- Asynchronously cancelling every active task preserves normal request paths, but fan-out may take minutes and misses paused workers that resume later.
- Rolling back every effect sounds safe, but a database cannot roll back an email, payment, webhook, or already-observed external API call.
- Failing all reads closed minimizes uncertainty but can prevent operators and recovery agents from diagnosing the incident.

The recommended model is a **tenant-local monotonic containment epoch plus exact scoped fences**. Activating any directive advances the tenant epoch in the same ACID transaction that materializes its effective fences. Every new autonomous operation, mutation commit, result release, and external-tool release must prove that it evaluated the current epoch. A stale operation cannot proceed merely because a cancellation worker has not reached it yet.

This is a prevention boundary, not time travel:

1. Effects serialized before activation remain committed.
2. New writes and tool releases serialized after activation are rejected when their scope is fenced.
3. In-flight external effects that crossed their provider point of no return become `OUTCOME_UNKNOWN` until reconciled.
4. Cleanup, cancellation, quarantine, and compensation run asynchronously from bounded queues.
5. Every decision is deterministic and replayable without invoking an LLM.

### Product outcome

For any incident, mondayDB can answer:

- Which tenant-local directive was effective at a given operation checkpoint?
- Which exact principals, sessions, workflows, resources, connectors, or tool capabilities were fenced?
- Was an effect committed before or after the containment serialization point?
- Which pending work was prevented, cancelled, drained, quarantined, or released?
- Which external outcomes require reconciliation or approved compensation?
- Can an auditor reproduce the decision from durable policy, epoch, fence, and evidence records?

## 2. Scope and ownership

The Emergency Containment Plane owns:

- tenant-local containment epochs and exact effective fences;
- deterministic directive activation, extension, supersession, and release;
- operation checkpoint evaluation;
- bounded cancellation and quarantine work queues;
- safe-state and external-outcome receipts;
- incident-facing perception cards;
- immutable, hash-chained containment audit evidence.

It integrates with, but does not replace:

- **Workload Identity:** authenticates principals, sessions, and operator signatures;
- **Access, Purpose, Consent, Delegation, and Runtime Contracts:** define ordinary authorization;
- **Query Governor and Reliability Governor:** enforce cost and neighbor-impact budgets;
- **Multi-Agent Coordination:** fences ownership and duplicate effects;
- **Transaction Intent:** owns ACID business mutations;
- **Tool Execution:** owns transactional outbox release and delivery;
- **Change Watch:** wakes cancellation and recovery workers;
- **Procedure Memory:** stores approved incident, reconciliation, and compensation runbooks;
- **Audit and Evidence Planes:** retain replayable proofs.

Containment is an additional deny boundary. It can remove authority but never grant authority that another policy denies.

### Non-goals

- Cross-account directives or globally shared tenant state.
- Arbitrary prompt matching to decide whether work is dangerous.
- Synchronous enumeration of every active task before activation returns.
- Pretending to undo committed row transactions or external effects.
- Letting an autonomous workload activate account-wide or principal-wide containment.
- Using vector similarity for authorization, scope identity, or fence evaluation.
- Holding a database transaction open while a tool, model, or human responds.
- Treating expiry as automatic proof that an incident is resolved.

## 3. Product contract

### 3.1 Containment scopes

Version 1 supports exact, server-canonicalized scopes:

| Scope | Canonical example | Typical use |
|---|---|---|
| `ACCOUNT` | the trusted `account_id` | Stop all new autonomous effects for one tenant |
| `PRINCIPAL` | workload principal ID | Contain a compromised agent identity |
| `SESSION` | verified workload session ID | Stop one suspicious execution session |
| `WORKFLOW` | `workflow/88/run/99` | Freeze one automation run |
| `RESOURCE` | `board/123/item/456` | Protect an affected item or board |
| `CONNECTOR` | connector installation ID | Stop dispatch through one integration |
| `TOOL_CAPABILITY` | `slack.message.create` | Disable one tool action class |
| `OPERATION` | durable operation ID | Cancel or quarantine one exact operation |

Scope keys come from trusted catalogs. Raw labels, prompts, model output, and embeddings are never fence keys.

### 3.2 Deterministic actions

A directive compiles to one or more action bits:

| Action | Meaning |
|---|---|
| `DENY_NEW_OPERATIONS` | Reject matching autonomous operation admission |
| `DENY_MUTATION_COMMIT` | Reject matching autonomous row-store commits |
| `DENY_TOOL_RELEASE` | Reject creation or consumption of a tool delivery-release token |
| `CANCEL_PENDING` | Enqueue matching non-started operations for deterministic cancellation |
| `DRAIN_ACTIVE` | Allow only policy-declared safe checkpoints; no new side effects |
| `QUARANTINE_RESULTS` | Store matching outputs but do not publish them to agents, users, caches, or indexes |
| `REQUIRE_REAUTH` | Require a new workload session and current policy compilation |
| `REQUIRE_HUMAN_RELEASE` | Prevent automatic directive release or result publication |

`CANCEL_PENDING`, `DRAIN_ACTIVE`, and `QUARANTINE_RESULTS` are workflow instructions. The deny bits are the immediate safety boundary.

### 3.3 Activation guarantee

Activation has one linearizable serialization point in the tenant's fenced write region. The transaction:

1. verifies the operator, approval policy, incident, and idempotency key;
2. locks the tenant containment head;
3. allocates the next non-negative 64-bit containment epoch;
4. inserts the immutable directive revision and exact targets;
5. recomputes only the affected effective fence rows;
6. updates the tenant head to the new epoch;
7. appends the audit event and bounded cancellation work;
8. commits before returning `ACTIVE`.

The returned `effectiveEpoch` means the directive is visible to every subsequent durable checkpoint in that account. It does **not** mean all workers have stopped or all external outcomes are known.

### 3.4 Checkpoint guarantee

Every autonomous envelope carries the last evaluated containment epoch and a hash of the exact scope vector. Before admission, mutation commit, result publication, semantic-index publication, or tool release:

1. read the account head by `account_id`;
2. if the epoch is unchanged, verify envelope expiry and continue;
3. if the epoch changed, evaluate the bounded exact scope vector;
4. persist the deterministic decision and refreshed snapshot;
5. deny, drain, quarantine, or continue according to effective action bits.

Mutation commit and tool release recheck the durable head in their authorization transaction. A cache hit is not sufficient for a side effect.

### 3.5 Release guarantee

Release is a new directive revision, never deletion. It requires:

- the same tenant and incident;
- an authorized operator and any required second approval;
- a deterministic release reason;
- safe-state evidence for every policy-required scope;
- no unresolved mandatory reconciliation task;
- a fresh containment epoch.

Expiry transitions a directive to `EXPIRED_PENDING_REVIEW`; it does not silently restore write or tool authority. Policy may allow low-risk observation-only directives to expire automatically, but deny directives default to explicit release.

### 3.6 Availability behavior

- Human reads and writes follow their existing authorization path unless an independent human-safety policy applies.
- Autonomous writes and tool releases fail closed when the current containment head cannot be durably verified.
- Bounded autonomous reads may fail open only under a precompiled policy that marks them `SAFE_READ`; returned packets state `containmentStatus: UNVERIFIED`, cannot authorize a later effect, and are not written to long-term memory.
- An account-specific activation never acquires a global tenant lock and never touches another account's row, queue, or cache key.
- Regional promotion requires RPO=0 replication for the tenant containment head and increments the regional leadership epoch before autonomous effects resume.

## 4. Deterministic invariants

1. **Tenant first:** every primary key, foreign key, unique constraint, index, queue, and cache key starts with `account_id`.
2. **Trusted tenant context:** GraphQL `accountId` must match an extension-protected connection context that clients cannot set.
3. **Monotonic epoch:** every activation, target change, policy-significant extension, supersession, and release advances the account epoch; epochs are never reused.
4. **Deny-only composition:** effective actions are the bitwise union of all active matching directives.
5. **Exact scope identity:** canonical typed keys determine matches; semantic similarity never does.
6. **Bounded scope vector:** an operation has one account, principal, session, workflow, connector, capability, operation, and at most 16 resource scopes by default.
7. **No stale side effects:** mutation commit, result publication, vector publication, and tool release compare the current durable epoch.
8. **No broad agent authority:** agents may request self-cancellation; only approved human or service operators may activate broader directives.
9. **No false rollback:** committed or provider-accepted effects are classified and reconciled, not relabeled as cancelled.
10. **No synchronous fan-out:** activation cost depends on directive target count, not active-operation or board-row count.
11. **Idempotent transitions:** an operation key plus canonical request hash returns one durable result.
12. **Current authorization:** containment release never bypasses access, consent, purpose, delegation, runtime, or identity checks.
13. **No scan fallback:** missing indexes, stale snapshots, or exhausted budgets reject or queue; they never trigger a board scan.
14. **Audited decision:** every state transition and checkpoint result is hash chained in tenant order.
15. **Database determinism:** no LLM decides scope, action composition, activation, checkpoint outcome, safe state, or release.

## 5. Containment model

### 5.1 Tenant head and invalidation

`agent_containment_account_head` is one small row per account. It stores:

- `containment_epoch`: invalidates stale autonomous envelopes;
- `regional_leadership_epoch`: fences a former write region;
- `account_action_mask`: the effective account-wide actions;
- `policy_version` and `audit_head_hash`;
- the latest update timestamp from database time.

Advancing the epoch invalidates snapshots only inside the affected tenant. It does not require a cache broadcast to be safe: cache invalidation improves latency, while the durable comparison protects effects.

### 5.2 Effective fences

An effective fence is materialized at:

`(account_id, scope_type, scope_key_hash, scope_key)`

It contains the union action mask, highest source directive generation, active-directive count, and evidence hash. Activation locks and recomputes only explicitly targeted fence rows. The server sorts targets canonically before locking to avoid deadlocks.

Hash is an index accelerator, not identity. Equality compares both hash and canonical key.

### 5.3 Scope evaluation

The server derives an operation scope vector from immutable trusted records:

```text
account
principal
session
workflow?
connector?
tool capability?
operation
resource[0..policy.maxResources]
```

Evaluation performs one account-head lookup plus one indexed lookup per present scope. Effective actions are:

```text
account_action_mask OR all(matched_fence.action_mask)
```

An operation cannot omit a resource, connector, or capability used by its immutable intent. If scope derivation exceeds the policy ceiling, admission rejects with `SCOPE_VECTOR_TOO_LARGE`; it never truncates.

### 5.4 Checkpoint classes

| Checkpoint | Required consistency | On matching deny |
|---|---|---|
| `ADMISSION` | linearizable head and exact fences | reject before allocating execution budget |
| `READ_REFRESH` | policy-bounded; durable on epoch change | stop, or return non-actionable safe read |
| `MUTATION_PREPARE` | linearizable | invalidate preparation |
| `MUTATION_COMMIT` | same ACID transaction as business write | abort mutation |
| `RESULT_PUBLISH` | linearizable | retain encrypted result in quarantine |
| `VECTOR_PUBLISH` | linearizable | prevent index visibility |
| `TOOL_RELEASE` | same ACID transaction as outbox release token | cancel or hold delivery |
| `PROCEDURE_STEP` | durable on every side-effect boundary | drain or stop |

Long-running columnar and vector reads poll at fixed work-unit boundaries. They may finish local compute after a fence, but cannot publish, cache, index, or use the result to authorize an effect without a current checkpoint.

### 5.5 External point of no return

Tool Execution has explicit phases:

1. `PENDING`: durable outbox exists; no provider call.
2. `RELEASED`: a short-lived, generation-bound release token was issued after containment check.
3. `DISPATCH_STARTED`: worker is entering the provider call.
4. `ACKNOWLEDGED`: provider supplied a durable success identifier.
5. `OUTCOME_UNKNOWN`: timeout or containment raced after dispatch started.
6. `COMPENSATION_PENDING` or `RECONCILED`.

Containment before `RELEASED` prevents dispatch. After `DISPATCH_STARTED`, cancellation is best effort. Provider idempotency, status lookup, and reviewed compensation procedures resolve uncertainty; mondayDB never claims that revoking a token retracts bytes already received by a provider.

### 5.6 Safe-state evidence

Safe state is a deterministic conjunction of policy-required checks, such as:

- no releasable outbox entries for the fenced scope;
- all matching operations are terminal, drained, or quarantined;
- all `OUTCOME_UNKNOWN` effects have reconciliation dispositions;
- compromised sessions are revoked;
- replacement credentials have passed workload attestation;
- required compensation tasks are completed or explicitly risk-accepted.

Each check records a typed evidence reference, source watermark, evaluator version, result, and hash. Free-form incident prose may accompany evidence but cannot satisfy a release predicate.

## 6. Lifecycle

### 6.1 Propose

An agent, detector, operator, or SRE system may submit a proposal containing observed signals and exact candidate targets. Proposal creation has no authority effect. Semantic retrieval may suggest an approved runbook, but cannot choose or expand targets.

### 6.2 Approve

Policy defines approval class by scope and action:

- `SELF_OPERATION`: a workload may cancel its own operation.
- `SINGLE_OPERATOR`: narrow session, operation, or resource containment.
- `TWO_PERSON`: account, principal, connector, or tool-capability containment.
- `AUTOMATED_BREAK_GLASS`: a preauthorized detector may activate a fixed deny-only template; human review is immediately required.

Approvers must be distinct verified identities where two-person approval is required. Approval signatures bind the exact canonical proposal hash and expire quickly.

### 6.3 Activate

Activation validates approvals and executes the transaction in section 3.3. It returns an immutable perception card with epoch, action mask, scope hashes, reason codes, and next allowed actions. Raw sensitive scope keys are omitted unless the caller has support visibility.

### 6.4 Contain and reconcile

The epoch blocks stale checkpoints immediately. Bounded workers then:

- cancel pending operation rows through account-leading scope indexes;
- revoke workload sessions through identity indexes;
- hold unreleased tool outbox entries;
- quarantine unpublished outputs and embeddings;
- mark dispatched-but-unacknowledged effects for reconciliation;
- emit Change Watch notifications.

Workers claim fixed-size batches with `FOR UPDATE SKIP LOCKED`, carry directive generation, and compare it before each transition. Old workers cannot apply work after supersession or release.

### 6.5 Extend or supersede

Changing scope, action mask, expiry, or required evidence creates a new directive revision and epoch. Extensions never mutate historical meaning. A broader directive may supersede a narrower one for operator clarity, but the narrower record remains active until the superseding transaction materializes equivalent effective fences.

### 6.6 Release

Release compiles safe-state evidence, verifies approvals, updates affected effective fences, advances the epoch, and appends audit evidence atomically. Existing operations do not regain authority: they must reacquire a session/runtime envelope and pass current admission.

## 7. TypeScript contracts

All 64-bit counters are decimal strings and must never pass through JavaScript `number`.

```ts
export type AccountId = string & { readonly __brand: "AccountId" };
export type PrincipalId = string & { readonly __brand: "PrincipalId" };
export type SessionId = string & { readonly __brand: "SessionId" };
export type OperationId = string & { readonly __brand: "OperationId" };
export type IncidentId = string & { readonly __brand: "IncidentId" };
export type DirectiveId = string & { readonly __brand: "DirectiveId" };
export type ProposalId = string & { readonly __brand: "ProposalId" };
export type EvidenceId = string & { readonly __brand: "EvidenceId" };
export type Sha256 = string & { readonly __brand: "Sha256Hex" };
export type DateTimeString = string & { readonly __brand: "DateTimeString" };
export type NonNegativeInt64String = string & {
  readonly __brand: "NonNegativeInt64String";
};

export type ContainmentScopeType =
  | "ACCOUNT"
  | "PRINCIPAL"
  | "SESSION"
  | "WORKFLOW"
  | "RESOURCE"
  | "CONNECTOR"
  | "TOOL_CAPABILITY"
  | "OPERATION";

export type ContainmentAction =
  | "DENY_NEW_OPERATIONS"
  | "DENY_MUTATION_COMMIT"
  | "DENY_TOOL_RELEASE"
  | "CANCEL_PENDING"
  | "DRAIN_ACTIVE"
  | "QUARANTINE_RESULTS"
  | "REQUIRE_REAUTH"
  | "REQUIRE_HUMAN_RELEASE";

export type DirectiveState =
  | "PROPOSED"
  | "APPROVAL_PENDING"
  | "ACTIVE"
  | "SUPERSEDED"
  | "EXPIRED_PENDING_REVIEW"
  | "RELEASED"
  | "REJECTED";

export type CheckpointKind =
  | "ADMISSION"
  | "READ_REFRESH"
  | "MUTATION_PREPARE"
  | "MUTATION_COMMIT"
  | "RESULT_PUBLISH"
  | "VECTOR_PUBLISH"
  | "TOOL_RELEASE"
  | "PROCEDURE_STEP";

export type CheckpointDecision =
  | "ALLOW"
  | "DENY"
  | "DRAIN"
  | "QUARANTINE"
  | "REAUTH_REQUIRED"
  | "UNVERIFIED_SAFE_READ";

export interface ContainmentTarget {
  readonly scopeType: ContainmentScopeType;
  readonly canonicalScopeKey: string;
  readonly scopeKeyHash: Sha256;
}

export interface ContainmentProposal {
  readonly accountId: AccountId;
  readonly proposalId: ProposalId;
  readonly incidentId: IncidentId;
  readonly requestedActions: readonly ContainmentAction[];
  readonly targets: readonly ContainmentTarget[];
  readonly reasonCode: string;
  readonly evidenceRefs: readonly EvidenceId[];
  readonly requestedExpiresAt?: DateTimeString;
  readonly canonicalRequestHash: Sha256;
  readonly createdAt: DateTimeString;
}

export interface ContainmentApproval {
  readonly accountId: AccountId;
  readonly proposalId: ProposalId;
  readonly approverPrincipalId: PrincipalId;
  readonly approvalClass:
    | "SELF_OPERATION"
    | "SINGLE_OPERATOR"
    | "TWO_PERSON"
    | "AUTOMATED_BREAK_GLASS";
  readonly proposalHash: Sha256;
  readonly signatureRef: string;
  readonly expiresAt: DateTimeString;
}

export interface ContainmentDirective {
  readonly accountId: AccountId;
  readonly directiveId: DirectiveId;
  readonly revision: NonNegativeInt64String;
  readonly incidentId: IncidentId;
  readonly state: DirectiveState;
  readonly actions: readonly ContainmentAction[];
  readonly actionMask: NonNegativeInt64String;
  readonly targets: readonly ContainmentTarget[];
  readonly effectiveEpoch?: NonNegativeInt64String;
  readonly activatesAt?: DateTimeString;
  readonly expiresAt?: DateTimeString;
  readonly requiresHumanRelease: boolean;
  readonly policyVersion: NonNegativeInt64String;
  readonly directiveHash: Sha256;
}

export interface OperationScopeVector {
  readonly accountId: AccountId;
  readonly principalId: PrincipalId;
  readonly sessionId: SessionId;
  readonly operationId: OperationId;
  readonly workflowKey?: string;
  readonly connectorKey?: string;
  readonly toolCapabilityKey?: string;
  readonly resourceKeys: readonly string[];
  readonly scopeVectorHash: Sha256;
}

export interface ContainmentSnapshot {
  readonly accountId: AccountId;
  readonly operationId: OperationId;
  readonly containmentEpoch: NonNegativeInt64String;
  readonly regionalLeadershipEpoch: NonNegativeInt64String;
  readonly scopeVectorHash: Sha256;
  readonly effectiveActionMask: NonNegativeInt64String;
  readonly matchedDirectiveHashes: readonly Sha256[];
  readonly evaluatedAt: DateTimeString;
  readonly expiresAt: DateTimeString;
  readonly snapshotHash: Sha256;
}

export interface CheckpointRequest {
  readonly accountId: AccountId;
  readonly operationId: OperationId;
  readonly checkpoint: CheckpointKind;
  readonly priorSnapshotHash?: Sha256;
  readonly immutableIntentHash: Sha256;
  readonly idempotencyKey: string;
}

export interface CheckpointResult {
  readonly accountId: AccountId;
  readonly operationId: OperationId;
  readonly checkpoint: CheckpointKind;
  readonly decision: CheckpointDecision;
  readonly reasonCodes: readonly string[];
  readonly effectiveActions: readonly ContainmentAction[];
  readonly snapshot: ContainmentSnapshot;
  readonly quarantineRef?: string;
  readonly retryable: boolean;
  readonly decisionHash: Sha256;
}

export type ExternalEffectState =
  | "PENDING"
  | "RELEASED"
  | "DISPATCH_STARTED"
  | "ACKNOWLEDGED"
  | "OUTCOME_UNKNOWN"
  | "COMPENSATION_PENDING"
  | "RECONCILED"
  | "CANCELLED";

export interface ExternalEffectReceipt {
  readonly accountId: AccountId;
  readonly operationId: OperationId;
  readonly outboxId: string;
  readonly state: ExternalEffectState;
  readonly releaseGeneration: NonNegativeInt64String;
  readonly releaseContainmentEpoch?: NonNegativeInt64String;
  readonly providerIdempotencyKey: string;
  readonly providerReceiptRef?: string;
  readonly reconciliationEvidenceRef?: EvidenceId;
  readonly receiptHash: Sha256;
}

export interface SafeStateCheck {
  readonly accountId: AccountId;
  readonly directiveId: DirectiveId;
  readonly checkCode: string;
  readonly evaluatorVersion: string;
  readonly sourceWatermark: NonNegativeInt64String;
  readonly passed: boolean;
  readonly evidenceRefs: readonly EvidenceId[];
  readonly checkHash: Sha256;
}

export interface ContainmentPerceptionCard {
  readonly accountId: AccountId;
  readonly incidentId: IncidentId;
  readonly containmentEpoch: NonNegativeInt64String;
  readonly status: "ACTIVE" | "REVIEW_REQUIRED" | "SAFE_TO_RELEASE" | "RELEASED";
  readonly effectiveActions: readonly ContainmentAction[];
  readonly targetTypeCounts: Readonly<
    Partial<Record<ContainmentScopeType, number>>
  >;
  readonly blockedOperationCount: NonNegativeInt64String;
  readonly quarantinedResultCount: NonNegativeInt64String;
  readonly unknownExternalOutcomeCount: NonNegativeInt64String;
  readonly reasonCodes: readonly string[];
  readonly nextAllowedActions: readonly (
    | "INSPECT_EVIDENCE"
    | "RECONCILE_EFFECTS"
    | "EXTEND"
    | "REQUEST_RELEASE"
    | "WAIT"
  )[];
  readonly cardHash: Sha256;
}
```

### Resolver requirements

- Derive `accountId`, principal, session, canonical scope keys, and operation intents from trusted context.
- Reject unknown action bits, duplicate targets, oversized target sets, and non-canonical keys.
- Sort targets by `(scopeType, scopeKeyHash, canonicalScopeKey)` before locking.
- Represent every `bigint` as a validated decimal string.
- Return stable reason codes; prose is display-only.
- Never hydrate a board to evaluate a directive.

## 8. SQL row-store schema

The schema uses ordinary PostgreSQL types. mondayDB may map them to equivalent distributed row-store primitives while preserving keys and transactional invariants.

```sql
CREATE TYPE containment_scope_type AS ENUM (
  'ACCOUNT',
  'PRINCIPAL',
  'SESSION',
  'WORKFLOW',
  'RESOURCE',
  'CONNECTOR',
  'TOOL_CAPABILITY',
  'OPERATION'
);

CREATE TYPE containment_directive_state AS ENUM (
  'PROPOSED',
  'APPROVAL_PENDING',
  'ACTIVE',
  'SUPERSEDED',
  'EXPIRED_PENDING_REVIEW',
  'RELEASED',
  'REJECTED'
);

CREATE TYPE containment_checkpoint_kind AS ENUM (
  'ADMISSION',
  'READ_REFRESH',
  'MUTATION_PREPARE',
  'MUTATION_COMMIT',
  'RESULT_PUBLISH',
  'VECTOR_PUBLISH',
  'TOOL_RELEASE',
  'PROCEDURE_STEP'
);

CREATE TYPE containment_checkpoint_decision AS ENUM (
  'ALLOW',
  'DENY',
  'DRAIN',
  'QUARANTINE',
  'REAUTH_REQUIRED',
  'UNVERIFIED_SAFE_READ'
);

CREATE TYPE containment_work_state AS ENUM (
  'READY',
  'CLAIMED',
  'COMPLETED',
  'CANCELLED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL'
);

CREATE TABLE agent_containment_account_head (
  account_id bigint NOT NULL,
  containment_epoch bigint NOT NULL DEFAULT 0
    CHECK (containment_epoch >= 0),
  regional_leadership_epoch bigint NOT NULL
    CHECK (regional_leadership_epoch >= 0),
  account_action_mask bigint NOT NULL DEFAULT 0
    CHECK (account_action_mask >= 0),
  policy_version bigint NOT NULL
    CHECK (policy_version >= 0),
  audit_sequence bigint NOT NULL DEFAULT 0
    CHECK (audit_sequence >= 0),
  audit_head_hash bytea NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_containment_incident (
  account_id bigint NOT NULL,
  incident_id uuid NOT NULL,
  incident_key text NOT NULL,
  severity smallint NOT NULL CHECK (severity BETWEEN 0 AND 5),
  state text NOT NULL CHECK (
    state IN ('OPEN', 'CONTAINED', 'RECOVERING', 'RESOLVED')
  ),
  opened_by_principal_id uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  resolved_at timestamptz,
  incident_hash bytea NOT NULL,
  PRIMARY KEY (account_id, incident_id),
  UNIQUE (account_id, incident_key),
  CHECK ((state = 'RESOLVED') = (resolved_at IS NOT NULL))
);

CREATE TABLE agent_containment_proposal (
  account_id bigint NOT NULL,
  proposal_id uuid NOT NULL,
  incident_id uuid NOT NULL,
  requested_action_mask bigint NOT NULL
    CHECK (requested_action_mask > 0),
  reason_code text NOT NULL,
  requested_expires_at timestamptz,
  canonical_request_hash bytea NOT NULL,
  proposer_principal_id uuid NOT NULL,
  proposer_session_id uuid,
  state text NOT NULL CHECK (
    state IN ('PENDING', 'APPROVED', 'ACTIVATED', 'REJECTED', 'EXPIRED')
  ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, proposal_id),
  UNIQUE (account_id, canonical_request_hash),
  FOREIGN KEY (account_id, incident_id)
    REFERENCES agent_containment_incident (account_id, incident_id)
);

CREATE TABLE agent_containment_proposal_target (
  account_id bigint NOT NULL,
  proposal_id uuid NOT NULL,
  target_ordinal smallint NOT NULL CHECK (target_ordinal >= 0),
  scope_type containment_scope_type NOT NULL,
  scope_key_hash bytea NOT NULL,
  canonical_scope_key text NOT NULL,
  PRIMARY KEY (account_id, proposal_id, target_ordinal),
  UNIQUE (
    account_id,
    proposal_id,
    scope_type,
    scope_key_hash,
    canonical_scope_key
  ),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES agent_containment_proposal (account_id, proposal_id)
);

CREATE INDEX agent_containment_proposal_target_scope_idx
  ON agent_containment_proposal_target (
    account_id,
    scope_type,
    scope_key_hash,
    canonical_scope_key,
    proposal_id
  );

CREATE TABLE agent_containment_approval (
  account_id bigint NOT NULL,
  proposal_id uuid NOT NULL,
  approver_principal_id uuid NOT NULL,
  approval_class text NOT NULL CHECK (
    approval_class IN (
      'SELF_OPERATION',
      'SINGLE_OPERATOR',
      'TWO_PERSON',
      'AUTOMATED_BREAK_GLASS'
    )
  ),
  proposal_hash bytea NOT NULL,
  signature_ref text NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (account_id, proposal_id, approver_principal_id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES agent_containment_proposal (account_id, proposal_id),
  CHECK (expires_at > approved_at)
);

CREATE INDEX agent_containment_approval_live_idx
  ON agent_containment_approval (
    account_id,
    proposal_id,
    expires_at,
    approver_principal_id
  )
  WHERE revoked_at IS NULL;

CREATE TABLE agent_containment_directive (
  account_id bigint NOT NULL,
  directive_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  incident_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  state containment_directive_state NOT NULL,
  action_mask bigint NOT NULL CHECK (action_mask > 0),
  effective_epoch bigint CHECK (effective_epoch >= 0),
  policy_version bigint NOT NULL CHECK (policy_version >= 0),
  requires_human_release boolean NOT NULL,
  activates_at timestamptz,
  expires_at timestamptz,
  supersedes_directive_id uuid,
  supersedes_revision bigint,
  directive_hash bytea NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, directive_id, revision),
  UNIQUE (account_id, directive_hash),
  FOREIGN KEY (account_id, incident_id)
    REFERENCES agent_containment_incident (account_id, incident_id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES agent_containment_proposal (account_id, proposal_id),
  FOREIGN KEY (
    account_id,
    supersedes_directive_id,
    supersedes_revision
  ) REFERENCES agent_containment_directive (
    account_id,
    directive_id,
    revision
  ),
  CHECK (
    (state IN ('ACTIVE', 'SUPERSEDED', 'EXPIRED_PENDING_REVIEW', 'RELEASED'))
    = (effective_epoch IS NOT NULL)
  ),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (
    (supersedes_directive_id IS NULL) =
    (supersedes_revision IS NULL)
  )
);

CREATE UNIQUE INDEX agent_containment_directive_active_revision_idx
  ON agent_containment_directive (account_id, directive_id)
  WHERE state IN ('ACTIVE', 'EXPIRED_PENDING_REVIEW');

CREATE INDEX agent_containment_directive_incident_idx
  ON agent_containment_directive (
    account_id,
    incident_id,
    state,
    effective_epoch,
    directive_id
  );

CREATE INDEX agent_containment_directive_expiry_idx
  ON agent_containment_directive (
    account_id,
    expires_at,
    directive_id,
    revision
  )
  WHERE state = 'ACTIVE' AND expires_at IS NOT NULL;

CREATE TABLE agent_containment_directive_target (
  account_id bigint NOT NULL,
  directive_id uuid NOT NULL,
  directive_revision bigint NOT NULL,
  target_ordinal smallint NOT NULL CHECK (target_ordinal >= 0),
  scope_type containment_scope_type NOT NULL,
  scope_key_hash bytea NOT NULL,
  canonical_scope_key text NOT NULL,
  PRIMARY KEY (
    account_id,
    directive_id,
    directive_revision,
    target_ordinal
  ),
  UNIQUE (
    account_id,
    directive_id,
    directive_revision,
    scope_type,
    scope_key_hash,
    canonical_scope_key
  ),
  FOREIGN KEY (account_id, directive_id, directive_revision)
    REFERENCES agent_containment_directive (
      account_id,
      directive_id,
      revision
    )
);

CREATE INDEX agent_containment_directive_target_scope_idx
  ON agent_containment_directive_target (
    account_id,
    scope_type,
    scope_key_hash,
    canonical_scope_key,
    directive_id,
    directive_revision
  );

CREATE TABLE agent_containment_effective_fence (
  account_id bigint NOT NULL,
  scope_type containment_scope_type NOT NULL,
  scope_key_hash bytea NOT NULL,
  canonical_scope_key text NOT NULL,
  action_mask bigint NOT NULL CHECK (action_mask > 0),
  active_directive_count integer NOT NULL
    CHECK (active_directive_count > 0),
  highest_epoch bigint NOT NULL CHECK (highest_epoch >= 0),
  fence_generation bigint NOT NULL CHECK (fence_generation > 0),
  evidence_hash bytea NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (
    account_id,
    scope_type,
    scope_key_hash,
    canonical_scope_key
  )
);

CREATE INDEX agent_containment_effective_fence_epoch_idx
  ON agent_containment_effective_fence (
    account_id,
    highest_epoch,
    scope_type,
    scope_key_hash
  );

CREATE TABLE agent_containment_operation (
  account_id bigint NOT NULL,
  operation_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  session_id uuid NOT NULL,
  workflow_key_hash bytea,
  workflow_key text,
  connector_key_hash bytea,
  connector_key text,
  tool_capability_key_hash bytea,
  tool_capability_key text,
  state text NOT NULL CHECK (
    state IN (
      'ADMITTED',
      'RUNNING',
      'DRAINING',
      'QUARANTINED',
      'COMPLETED',
      'CANCELLED',
      'FAILED'
    )
  ),
  scope_vector_hash bytea NOT NULL,
  evaluated_containment_epoch bigint NOT NULL
    CHECK (evaluated_containment_epoch >= 0),
  snapshot_hash bytea NOT NULL,
  next_checkpoint_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  terminal_at timestamptz,
  PRIMARY KEY (account_id, operation_id),
  CHECK ((state IN ('COMPLETED', 'CANCELLED', 'FAILED')) =
         (terminal_at IS NOT NULL)),
  CHECK ((workflow_key_hash IS NULL) = (workflow_key IS NULL)),
  CHECK ((connector_key_hash IS NULL) = (connector_key IS NULL)),
  CHECK (
    (tool_capability_key_hash IS NULL) =
    (tool_capability_key IS NULL)
  )
);

CREATE INDEX agent_containment_operation_principal_idx
  ON agent_containment_operation (
    account_id,
    principal_id,
    state,
    operation_id
  );

CREATE INDEX agent_containment_operation_session_idx
  ON agent_containment_operation (
    account_id,
    session_id,
    state,
    operation_id
  );

CREATE INDEX agent_containment_operation_workflow_idx
  ON agent_containment_operation (
    account_id,
    workflow_key_hash,
    workflow_key,
    state,
    operation_id
  )
  WHERE workflow_key_hash IS NOT NULL;

CREATE INDEX agent_containment_operation_connector_idx
  ON agent_containment_operation (
    account_id,
    connector_key_hash,
    connector_key,
    state,
    operation_id
  )
  WHERE connector_key_hash IS NOT NULL;

CREATE INDEX agent_containment_operation_capability_idx
  ON agent_containment_operation (
    account_id,
    tool_capability_key_hash,
    tool_capability_key,
    state,
    operation_id
  )
  WHERE tool_capability_key_hash IS NOT NULL;

CREATE INDEX agent_containment_operation_checkpoint_idx
  ON agent_containment_operation (
    account_id,
    next_checkpoint_at,
    operation_id
  )
  WHERE state IN ('ADMITTED', 'RUNNING', 'DRAINING');

CREATE TABLE agent_containment_operation_resource (
  account_id bigint NOT NULL,
  operation_id uuid NOT NULL,
  resource_ordinal smallint NOT NULL CHECK (resource_ordinal >= 0),
  resource_key_hash bytea NOT NULL,
  canonical_resource_key text NOT NULL,
  PRIMARY KEY (account_id, operation_id, resource_ordinal),
  UNIQUE (
    account_id,
    operation_id,
    resource_key_hash,
    canonical_resource_key
  ),
  FOREIGN KEY (account_id, operation_id)
    REFERENCES agent_containment_operation (account_id, operation_id)
);

CREATE INDEX agent_containment_operation_resource_scope_idx
  ON agent_containment_operation_resource (
    account_id,
    resource_key_hash,
    canonical_resource_key,
    operation_id
  );

CREATE TABLE agent_containment_checkpoint (
  account_id bigint NOT NULL,
  operation_id uuid NOT NULL,
  checkpoint_sequence bigint NOT NULL CHECK (checkpoint_sequence > 0),
  checkpoint_kind containment_checkpoint_kind NOT NULL,
  containment_epoch bigint NOT NULL CHECK (containment_epoch >= 0),
  regional_leadership_epoch bigint NOT NULL
    CHECK (regional_leadership_epoch >= 0),
  effective_action_mask bigint NOT NULL
    CHECK (effective_action_mask >= 0),
  decision containment_checkpoint_decision NOT NULL,
  scope_vector_hash bytea NOT NULL,
  matched_directive_set_hash bytea NOT NULL,
  snapshot_hash bytea NOT NULL,
  decision_hash bytea NOT NULL,
  evaluated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, operation_id, checkpoint_sequence),
  UNIQUE (account_id, operation_id, decision_hash),
  FOREIGN KEY (account_id, operation_id)
    REFERENCES agent_containment_operation (account_id, operation_id),
  CHECK (expires_at > evaluated_at)
);

CREATE INDEX agent_containment_checkpoint_epoch_idx
  ON agent_containment_checkpoint (
    account_id,
    containment_epoch,
    operation_id,
    checkpoint_sequence
  );

CREATE TABLE agent_containment_command_ledger (
  account_id bigint NOT NULL,
  actor_principal_id uuid NOT NULL,
  operation_kind text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash bytea NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING', 'COMPLETED')),
  result_ref text,
  result_hash bytea,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (
    account_id,
    actor_principal_id,
    operation_kind,
    idempotency_key
  ),
  CHECK (
    (state = 'COMPLETED') =
    (
      result_ref IS NOT NULL AND
      result_hash IS NOT NULL AND
      completed_at IS NOT NULL
    )
  )
);

CREATE TABLE agent_containment_work_item (
  account_id bigint NOT NULL,
  work_id uuid NOT NULL,
  directive_id uuid NOT NULL,
  directive_revision bigint NOT NULL,
  directive_epoch bigint NOT NULL CHECK (directive_epoch >= 0),
  scope_type containment_scope_type NOT NULL,
  scope_key_hash bytea NOT NULL,
  canonical_scope_key text NOT NULL,
  work_kind text NOT NULL CHECK (
    work_kind IN (
      'CANCEL_PENDING',
      'DRAIN_ACTIVE',
      'QUARANTINE_RESULTS',
      'REVOKE_SESSION',
      'HOLD_OUTBOX',
      'RECONCILE_EFFECT'
    )
  ),
  state containment_work_state NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  lease_generation bigint NOT NULL DEFAULT 0
    CHECK (lease_generation >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL,
  last_error_code text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (account_id, work_id),
  FOREIGN KEY (account_id, directive_id, directive_revision)
    REFERENCES agent_containment_directive (
      account_id,
      directive_id,
      revision
    ),
  CHECK (
    (lease_owner IS NULL) =
    (lease_expires_at IS NULL)
  ),
  CHECK (
    (state = 'COMPLETED') =
    (completed_at IS NOT NULL)
  )
);

CREATE INDEX agent_containment_work_ready_idx
  ON agent_containment_work_item (
    account_id,
    state,
    next_attempt_at,
    work_id
  )
  WHERE state IN ('READY', 'FAILED_RETRYABLE');

CREATE INDEX agent_containment_work_scope_idx
  ON agent_containment_work_item (
    account_id,
    scope_type,
    scope_key_hash,
    canonical_scope_key,
    state,
    work_id
  );

CREATE TABLE agent_containment_quarantine (
  account_id bigint NOT NULL,
  quarantine_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  artifact_type text NOT NULL CHECK (
    artifact_type IN (
      'AGENT_RESULT',
      'TOOL_RESULT',
      'MEMORY_CANDIDATE',
      'VECTOR_ARTIFACT'
    )
  ),
  encrypted_artifact_ref text NOT NULL,
  content_hash bytea NOT NULL,
  containment_epoch bigint NOT NULL CHECK (containment_epoch >= 0),
  state text NOT NULL CHECK (
    state IN ('HELD', 'RELEASED', 'DESTROYED')
  ),
  created_at timestamptz NOT NULL,
  dispositioned_at timestamptz,
  PRIMARY KEY (account_id, quarantine_id),
  UNIQUE (
    account_id,
    operation_id,
    artifact_type,
    content_hash
  ),
  FOREIGN KEY (account_id, operation_id)
    REFERENCES agent_containment_operation (account_id, operation_id),
  CHECK ((state = 'HELD') = (dispositioned_at IS NULL))
);

CREATE INDEX agent_containment_quarantine_state_idx
  ON agent_containment_quarantine (
    account_id,
    state,
    containment_epoch,
    quarantine_id
  );

CREATE TABLE agent_containment_safe_state_check (
  account_id bigint NOT NULL,
  directive_id uuid NOT NULL,
  directive_revision bigint NOT NULL,
  check_code text NOT NULL,
  evaluator_version text NOT NULL,
  source_watermark bigint NOT NULL CHECK (source_watermark >= 0),
  passed boolean NOT NULL,
  evidence_set_hash bytea NOT NULL,
  check_hash bytea NOT NULL,
  evaluated_at timestamptz NOT NULL,
  PRIMARY KEY (
    account_id,
    directive_id,
    directive_revision,
    check_code
  ),
  UNIQUE (account_id, check_hash),
  FOREIGN KEY (account_id, directive_id, directive_revision)
    REFERENCES agent_containment_directive (
      account_id,
      directive_id,
      revision
    )
);

CREATE TABLE agent_containment_external_effect (
  account_id bigint NOT NULL,
  outbox_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  state text NOT NULL CHECK (
    state IN (
      'PENDING',
      'RELEASED',
      'DISPATCH_STARTED',
      'ACKNOWLEDGED',
      'OUTCOME_UNKNOWN',
      'COMPENSATION_PENDING',
      'RECONCILED',
      'CANCELLED'
    )
  ),
  release_generation bigint NOT NULL DEFAULT 0
    CHECK (release_generation >= 0),
  release_containment_epoch bigint
    CHECK (release_containment_epoch >= 0),
  provider_idempotency_key text NOT NULL,
  provider_receipt_ref text,
  reconciliation_evidence_hash bytea,
  receipt_hash bytea NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, outbox_id),
  UNIQUE (account_id, provider_idempotency_key),
  FOREIGN KEY (account_id, operation_id)
    REFERENCES agent_containment_operation (account_id, operation_id),
  CHECK (
    (state IN (
      'RELEASED',
      'DISPATCH_STARTED',
      'ACKNOWLEDGED',
      'OUTCOME_UNKNOWN',
      'COMPENSATION_PENDING',
      'RECONCILED'
    )) = (release_containment_epoch IS NOT NULL)
  )
);

CREATE INDEX agent_containment_external_effect_state_idx
  ON agent_containment_external_effect (
    account_id,
    state,
    updated_at,
    outbox_id
  );

CREATE TABLE agent_containment_audit_event (
  account_id bigint NOT NULL,
  audit_sequence bigint NOT NULL CHECK (audit_sequence > 0),
  incident_id uuid NOT NULL,
  directive_id uuid,
  directive_revision bigint,
  operation_id uuid,
  event_type text NOT NULL,
  actor_principal_id uuid NOT NULL,
  containment_epoch bigint NOT NULL CHECK (containment_epoch >= 0),
  canonical_event_hash bytea NOT NULL,
  previous_event_hash bytea NOT NULL,
  event_hash bytea NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, audit_sequence),
  UNIQUE (account_id, event_hash),
  FOREIGN KEY (account_id, incident_id)
    REFERENCES agent_containment_incident (account_id, incident_id),
  FOREIGN KEY (account_id, operation_id)
    REFERENCES agent_containment_operation (account_id, operation_id),
  CHECK (
    (directive_id IS NULL) =
    (directive_revision IS NULL)
  )
);

CREATE INDEX agent_containment_audit_incident_idx
  ON agent_containment_audit_event (
    account_id,
    incident_id,
    audit_sequence
  );

CREATE INDEX agent_containment_audit_operation_idx
  ON agent_containment_audit_event (
    account_id,
    operation_id,
    audit_sequence
  )
  WHERE operation_id IS NOT NULL;
```

### 8.1 Tenant isolation

Application SQL must bind tenant context before any query:

```sql
SELECT set_config(
  'monday.account_id',
  :trusted_account_id,
  true
);
```

Production tables require row-level security or the equivalent storage-layer tenant predicate. Foreign keys deliberately repeat `account_id`; an ID from one tenant cannot reference another tenant's proposal, directive, operation, incident, or evidence.

### 8.2 Activation transaction

Conceptual activation pseudocode:

```sql
BEGIN;

SELECT containment_epoch, regional_leadership_epoch
FROM agent_containment_account_head
WHERE account_id = :account_id
FOR UPDATE;

-- Verify proposal, unexpired approvals, policy, target count, and
-- idempotency ledger using account-leading point/range lookups.

-- next_epoch is checked for signed bigint exhaustion.
-- Insert the immutable directive revision and targets.
-- Lock affected effective-fence rows in canonical target order.
-- Recompute only those rows from active exact-target directives.
-- Insert bounded follow-up work items and the audit event.

UPDATE agent_containment_account_head
SET containment_epoch = :next_epoch,
    account_action_mask = :effective_account_action_mask,
    audit_sequence = :next_audit_sequence,
    audit_head_hash = :event_hash,
    updated_at = clock_timestamp()
WHERE account_id = :account_id
  AND containment_epoch = :prior_epoch
  AND regional_leadership_epoch = :leadership_epoch;

COMMIT;
```

No query in activation joins active operations, board rows, columnar segments, embeddings, or outbox history.

### 8.3 Mutation commit predicate

The autonomous business mutation transaction must lock the account head and verify the current scope before changing business data:

```sql
SELECT containment_epoch, regional_leadership_epoch, account_action_mask
FROM agent_containment_account_head
WHERE account_id = :account_id
FOR KEY SHARE;

SELECT scope_type, canonical_scope_key, action_mask, fence_generation
FROM agent_containment_effective_fence
WHERE account_id = :account_id
  AND (
    (scope_type = 'PRINCIPAL' AND
     scope_key_hash = :principal_hash AND
     canonical_scope_key = :principal_key)
    OR
    (scope_type = 'SESSION' AND
     scope_key_hash = :session_hash AND
     canonical_scope_key = :session_key)
    OR
    (scope_type = 'OPERATION' AND
     scope_key_hash = :operation_hash AND
     canonical_scope_key = :operation_key)
  );

-- Resource targets are supplied as a bounded server-owned relation and
-- joined to the primary key. If any effective action contains
-- DENY_MUTATION_COMMIT, or the leadership epoch is stale, abort.
-- Persist the checkpoint and business mutation in the same transaction.
```

Production code must not build unbounded `OR` expressions. It joins a server-owned bounded values relation to the full effective-fence primary key and rejects above the policy target ceiling.

### 8.4 Physical layout

- Hash-partition large tables by `account_id`; preserve `account_id` as the first logical key inside every partition.
- Keep account heads and effective fences in the tenant's fenced write region.
- Store immutable audit history in row storage first, then asynchronously copy sealed segments to columnar storage.
- Separate live work indexes from historical work attempts.
- Apply retention to proposals, checkpoints, and completed work only after the audit/evidence horizon; retain hash tombstones where idempotency requires them.
- Do not co-partition tenants into a shared vector graph.

## 9. Open API GraphQL contract

Every feature is reachable through monday.com's Open API. `accountId` is explicit for observability but must match authenticated context.

```graphql
scalar DateTime
scalar LongString
scalar SHA256

enum ContainmentScopeType {
  ACCOUNT
  PRINCIPAL
  SESSION
  WORKFLOW
  RESOURCE
  CONNECTOR
  TOOL_CAPABILITY
  OPERATION
}

enum ContainmentAction {
  DENY_NEW_OPERATIONS
  DENY_MUTATION_COMMIT
  DENY_TOOL_RELEASE
  CANCEL_PENDING
  DRAIN_ACTIVE
  QUARANTINE_RESULTS
  REQUIRE_REAUTH
  REQUIRE_HUMAN_RELEASE
}

enum ContainmentDirectiveState {
  PROPOSED
  APPROVAL_PENDING
  ACTIVE
  SUPERSEDED
  EXPIRED_PENDING_REVIEW
  RELEASED
  REJECTED
}

enum ContainmentCheckpointKind {
  ADMISSION
  READ_REFRESH
  MUTATION_PREPARE
  MUTATION_COMMIT
  RESULT_PUBLISH
  VECTOR_PUBLISH
  TOOL_RELEASE
  PROCEDURE_STEP
}

enum ContainmentCheckpointDecision {
  ALLOW
  DENY
  DRAIN
  QUARANTINE
  REAUTH_REQUIRED
  UNVERIFIED_SAFE_READ
}

type ContainmentTarget {
  scopeType: ContainmentScopeType!
  scopeKeyHash: SHA256!
  displayRef: String
}

type ContainmentProposal {
  accountId: ID!
  proposalId: ID!
  incidentId: ID!
  requestedActions: [ContainmentAction!]!
  targets: [ContainmentTarget!]!
  reasonCode: String!
  canonicalRequestHash: SHA256!
  state: String!
  createdAt: DateTime!
}

type ContainmentDirective {
  accountId: ID!
  directiveId: ID!
  revision: LongString!
  incidentId: ID!
  state: ContainmentDirectiveState!
  actions: [ContainmentAction!]!
  targets: [ContainmentTarget!]!
  effectiveEpoch: LongString
  activatesAt: DateTime
  expiresAt: DateTime
  requiresHumanRelease: Boolean!
  directiveHash: SHA256!
}

type ContainmentCheckpoint {
  accountId: ID!
  operationId: ID!
  checkpoint: ContainmentCheckpointKind!
  decision: ContainmentCheckpointDecision!
  reasonCodes: [String!]!
  effectiveActions: [ContainmentAction!]!
  containmentEpoch: LongString!
  snapshotHash: SHA256!
  retryable: Boolean!
}

type SafeStateCheck {
  checkCode: String!
  evaluatorVersion: String!
  sourceWatermark: LongString!
  passed: Boolean!
  evidenceRefs: [ID!]!
  checkHash: SHA256!
  evaluatedAt: DateTime!
}

type ContainmentPerceptionCard {
  accountId: ID!
  incidentId: ID!
  containmentEpoch: LongString!
  status: String!
  effectiveActions: [ContainmentAction!]!
  blockedOperationCount: LongString!
  quarantinedResultCount: LongString!
  unknownExternalOutcomeCount: LongString!
  reasonCodes: [String!]!
  nextAllowedActions: [String!]!
  cardHash: SHA256!
}

type ContainmentDirectiveConnection {
  nodes: [ContainmentDirective!]!
  nextCursor: String
}

type ContainmentAuditEvent {
  sequence: LongString!
  eventType: String!
  incidentId: ID!
  directiveId: ID
  operationId: ID
  containmentEpoch: LongString!
  eventHash: SHA256!
  previousEventHash: SHA256!
  occurredAt: DateTime!
}

type ContainmentAuditConnection {
  nodes: [ContainmentAuditEvent!]!
  nextCursor: String
}

input ContainmentTargetInput {
  scopeType: ContainmentScopeType!
  scopeRef: ID!
}

input ProposeContainmentInput {
  accountId: ID!
  incidentId: ID!
  actions: [ContainmentAction!]!
  targets: [ContainmentTargetInput!]!
  reasonCode: String!
  evidenceRefs: [ID!]!
  requestedExpiresAt: DateTime
  idempotencyKey: String!
}

input ApproveContainmentInput {
  accountId: ID!
  proposalId: ID!
  proposalHash: SHA256!
  signatureRef: String!
  idempotencyKey: String!
}

input ActivateContainmentInput {
  accountId: ID!
  proposalId: ID!
  proposalHash: SHA256!
  idempotencyKey: String!
}

input EvaluateContainmentCheckpointInput {
  accountId: ID!
  operationId: ID!
  checkpoint: ContainmentCheckpointKind!
  immutableIntentHash: SHA256!
  priorSnapshotHash: SHA256
  idempotencyKey: String!
}

input ReleaseContainmentInput {
  accountId: ID!
  directiveId: ID!
  expectedRevision: LongString!
  expectedEpoch: LongString!
  evidenceRefs: [ID!]!
  reasonCode: String!
  approvalSignatureRefs: [String!]!
  idempotencyKey: String!
}

type ProposeContainmentPayload {
  proposal: ContainmentProposal!
  requiredApprovalClass: String!
  requiredApprovalCount: Int!
}

type ActivateContainmentPayload {
  directive: ContainmentDirective!
  perception: ContainmentPerceptionCard!
}

type ReleaseContainmentPayload {
  directive: ContainmentDirective!
  perception: ContainmentPerceptionCard!
}

type Query {
  containmentDirective(
    accountId: ID!
    directiveId: ID!
    revision: LongString
  ): ContainmentDirective

  containmentDirectives(
    accountId: ID!
    incidentId: ID
    state: ContainmentDirectiveState
    first: Int!
    after: String
  ): ContainmentDirectiveConnection!

  containmentPerception(
    accountId: ID!
    incidentId: ID!
  ): ContainmentPerceptionCard!

  containmentSafeState(
    accountId: ID!
    directiveId: ID!
    revision: LongString!
  ): [SafeStateCheck!]!

  containmentAudit(
    accountId: ID!
    incidentId: ID!
    first: Int!
    after: String
  ): ContainmentAuditConnection!
}

type Mutation {
  proposeContainment(
    input: ProposeContainmentInput!
  ): ProposeContainmentPayload!

  approveContainment(
    input: ApproveContainmentInput!
  ): ContainmentProposal!

  activateContainment(
    input: ActivateContainmentInput!
  ): ActivateContainmentPayload!

  evaluateContainmentCheckpoint(
    input: EvaluateContainmentCheckpointInput!
  ): ContainmentCheckpoint!

  releaseContainment(
    input: ReleaseContainmentInput!
  ): ReleaseContainmentPayload!
}
```

### GraphQL limits

- `targets`: default 16, hard ceiling 64 for operator-only account incidents.
- `actions`: maximum 8 known enum values; duplicates reject.
- `first`: default 50, hard ceiling 200.
- cursors bind `account_id`, filters, sort key, policy version, and expiry.
- list queries require account-leading indexed filters; no offset pagination.
- checkpoint evaluation is for integration testing and orchestration. Internal mutation and tool paths invoke the same primitive transactionally and cannot trust a prior GraphQL result.
- `scopeRef` is resolved through a trusted typed catalog and never accepted as an arbitrary canonical key.

## 10. Procedural memory

Containment procedures are reviewed, versioned instructions for operators and recovery agents:

```ts
export interface ContainmentProcedureMemory {
  readonly accountId: AccountId;
  readonly procedureId: string;
  readonly version: NonNegativeInt64String;
  readonly incidentClass: string;
  readonly allowedScopeTypes: readonly ContainmentScopeType[];
  readonly requiredActionMask: NonNegativeInt64String;
  readonly preconditions: readonly string[];
  readonly evidenceCheckCodes: readonly string[];
  readonly reconciliationSteps: readonly string[];
  readonly compensationCapabilityIds: readonly string[];
  readonly maximumToolCalls: number;
  readonly maximumDepth: number;
  readonly humanApprovalClass: "SINGLE_OPERATOR" | "TWO_PERSON";
  readonly contentHash: Sha256;
}
```

An LLM perceives a procedure as bounded typed steps, preconditions, permitted tools, expected evidence, and stop conditions. It does not receive executable SQL or authority to widen scope. Procedure execution still passes access, purpose, budget, containment, and tool-release checks at every side-effect step.

## 11. Semantic retrieval and HNSW compatibility

Semantic search helps an operator find relevant incident runbooks and prior redacted incident summaries. It does not participate in live fence evaluation.

Store one embedding per approved procedure version:

```sql
CREATE TABLE agent_containment_procedure_embedding (
  account_id bigint NOT NULL,
  procedure_id uuid NOT NULL,
  procedure_version bigint NOT NULL CHECK (procedure_version > 0),
  embedding_model_id text NOT NULL,
  embedding_dimensions integer NOT NULL
    CHECK (embedding_dimensions > 0),
  embedding vector(1536) NOT NULL,
  metadata_hash bytea NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  PRIMARY KEY (
    account_id,
    procedure_id,
    procedure_version,
    embedding_model_id
  ),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
```

Production vector indexes are physically owned by one account or by an account-hash partition with a mandatory exact `account_id` prefilter before graph traversal. Recommended HNSW search constraints:

- exact `account_id`, approved state, model ID, dimensions, and policy compatibility filters;
- `topK <= 20`, `ef_search <= 128`, timeout, memory, and visited-node budgets;
- no cross-account fallback when a tenant segment is cold or unavailable;
- no brute-force fallback when an HNSW manifest is stale;
- retrieval results carry procedure version, content hash, score, and index watermark;
- the score ranks candidates only; deterministic policy validates the selected procedure.

Incident descriptions must be redacted before embedding. Credentials, raw payloads, unapproved customer content, and canonical sensitive scope keys never enter the vector index.

## 12. Agent perception

Agents receive a small deterministic card rather than raw directive tables:

```json
{
  "incidentId": "inc_01",
  "containmentEpoch": "204",
  "status": "ACTIVE",
  "effectiveActions": [
    "DENY_MUTATION_COMMIT",
    "DENY_TOOL_RELEASE",
    "CANCEL_PENDING",
    "QUARANTINE_RESULTS"
  ],
  "targetTypeCounts": {
    "PRINCIPAL": 1,
    "CONNECTOR": 1
  },
  "blockedOperationCount": "37",
  "quarantinedResultCount": "4",
  "unknownExternalOutcomeCount": "1",
  "reasonCodes": [
    "WORKLOAD_CREDENTIAL_SUSPECTED",
    "EXTERNAL_OUTCOME_RECONCILIATION_REQUIRED"
  ],
  "nextAllowedActions": [
    "INSPECT_EVIDENCE",
    "RECONCILE_EFFECTS",
    "WAIT"
  ],
  "cardHash": "sha256:..."
}
```

Agent interpretation rules:

- Counts are bounded columnar summaries, not permission to enumerate hidden objects.
- `ACTIVE` means stop matching side effects, not that every worker has terminated.
- `OUTCOME_UNKNOWN > 0` means do not claim rollback or completion.
- Only `nextAllowedActions` are valid transitions; generated prose has no authority.
- Scope display references are visibility-filtered and may be hashes.
- A card is advisory after its epoch or expiry; every effect rechecks durable state.

## 13. ACID and consistency

### Row store

- Directive activation/release, effective-fence updates, account-head epoch, command ledger, and audit event commit atomically.
- Autonomous mutation checkpoint and business write commit atomically.
- Database wall time determines approval, lease, snapshot, and directive expiry.
- Serializability is required for overlapping activation/release target sets; unrelated tenants proceed independently.

### Columnar store

- Audit, incident, and safe-state summaries copy asynchronously from immutable row events.
- Every summary carries a source watermark and lag.
- Columnar data can inform operators but cannot authorize release unless a policy check binds an accepted watermark and then revalidates row-store deltas.
- Long analytical scans are cancellable at segment boundaries and cannot publish under a stale epoch.

### Vector store

- Procedure embeddings are asynchronous discovery aids.
- Vector results carry index manifests and watermarks.
- Quarantined outputs are invisible to HNSW publication.
- Vector availability never gates exact containment decisions.

### External tools

- Outbox creation remains ACID with the source transaction.
- Tool release is ACID with the containment checkpoint and release-token generation.
- Provider delivery is not ACID. It is at-least-once with stable idempotency where supported.
- Unknown outcomes require reconciliation; compensation is a separate authorized effect.

## 14. Guardrails and neighbor protection

### Admission budgets

Recommended defaults:

| Budget | Default | Hard ceiling |
|---|---:|---:|
| directive targets | 16 | 64 |
| operation resource scopes | 16 | 64 |
| exact fence lookups/checkpoint | 24 | 72 |
| cancellation worker batch | 100 | 500 |
| safe-state checks/directive | 20 | 64 |
| semantic `topK` | 10 | 20 |
| procedure depth | 4 | 8 |
| recovery tool calls | 10 | policy-defined maximum 50 |

Budgets are server policy, not client suggestions. Exhaustion returns a stable rejection or continuation cursor.

### Recursive-agent containment

- One incident workflow carries a fixed depth and tool-call budget.
- A containment proposal cannot recursively activate another proposal.
- A recovery procedure cannot release the directive that authorized it.
- Compensation actions create fresh immutable intents and pass ordinary containment; policy may allow only a dedicated recovery principal.
- Repeated identical proposal hashes deduplicate.
- Repeated reason/target/action cycles trigger loop containment and human review.

### Abuse controls

- Broad directives require stronger approval than narrow ones.
- Break-glass templates are fixed, deny-only, short-lived, and immediately visible to SRE.
- Proposal APIs have per-account and per-principal rate limits.
- One tenant cannot consume another tenant's cancellation workers or semantic index budget.
- Directive churn is limited by epoch-rate and active-directive ceilings; emergency activation reserves capacity outside normal agent workloads.
- Attackers cannot use scope-cardinality counts to infer unauthorized object identities.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

The following query shapes are prohibited:

- finding affected operations by joining directives to board items without an exact resource index;
- scanning every active operation synchronously during activation;
- scanning outbox history to decide whether release is safe;
- filtering directives only by JSON metadata or free-form reason text;
- vector searching incident prose to decide whether a fence matches;
- offset-paginating audit history;
- rebuilding all effective fences after one target changes;
- falling back to all board rows when a scope key is missing.

### Required access paths

| Operation | Required path | Complexity |
|---|---|---|
| current tenant epoch | account-head PK | `O(1)` |
| exact scoped fence | effective-fence PK | `O(log tenant fences)` |
| operation checkpoint | account head + bounded scope PK joins | `O(scope count)` |
| activation | proposal PK + bounded target fence rows | `O(target count)` |
| affected principal/session work | account/principal or account/session index | bounded page |
| affected resources | account/resource hash/key index | bounded page |
| pending work | account/state/next-attempt index | bounded page |
| external reconciliation | account/state/update index | bounded page |
| incident audit | account/incident/sequence index | cursor page |

For an operation touching 16 resources, checkpoint cost is independent of whether the board has 10 rows or 10 million rows. A board-wide `RESOURCE` directive targets the canonical board resource, not every item. Product write paths must declare board ancestry in the immutable scope vector when board-level containment should cover item effects.

### Planner enforcement

The planner rejects any containment query that lacks:

- one trusted `account_id` equality;
- an approved account-leading access path;
- a bounded target relation or cursor page;
- an estimated row/segment/vector-visit count within policy;
- a timeout and memory reservation;
- a current regional leadership epoch for side effects.

`EXPLAIN` regression fixtures must cover 1M-, 100M-, and 1B-row tenant distributions with skewed hot principals and connectors. A sequential scan on an operation, outbox, fence, or board relation is a release blocker.

## 16. Auditability and replay

Canonical event hashing:

```text
event_hash = SHA256(
  canonical_version ||
  account_id ||
  audit_sequence ||
  incident_id ||
  directive_id? ||
  directive_revision? ||
  operation_id? ||
  event_type ||
  actor_principal_id ||
  containment_epoch ||
  canonical_event_hash ||
  previous_event_hash ||
  occurred_at_database_time
)
```

The audit stream records:

- proposal, approval, rejection, activation, extension, supersession, expiry, and release;
- exact target-set and action-mask hashes;
- operator identity and signature references;
- epoch and regional leadership transitions;
- every denied, drained, quarantined, or reauthenticated checkpoint;
- cancellation work claims and terminal dispositions;
- external release, dispatch, acknowledgement, unknown outcome, reconciliation, and compensation;
- safe-state evidence and release decisions.

Replay uses immutable policy versions, canonicalization versions, target hashes, exact fence generations, scope-vector hashes, database timestamps, and source watermarks. Replay never reruns an LLM or vector search. Semantic procedure retrieval is recorded as evidence but is not required to reproduce the authorization result.

## 17. Threat and failure analysis

| Failure or attack | Deterministic response |
|---|---|
| Agent omits a dangerous resource | Server derives scopes from immutable intent; mismatch rejects |
| Stale worker resumes after containment | Epoch mismatch forces exact reevaluation before effect |
| Former region continues writes | Regional leadership epoch rejects stale commits/releases |
| Cache misses an invalidation | Durable side-effect checkpoint still reads account head |
| Activation response is lost | Idempotency ledger returns the committed directive and epoch |
| Two operators activate overlapping directives | Canonical locks serialize; action masks union |
| Release races a new directive | Account-head lock and expected epoch serialize decisions |
| Cancellation worker runs after supersession | Directive revision/generation comparison rejects stale work |
| Provider times out after receiving request | Mark `OUTCOME_UNKNOWN`; reconcile by stable idempotency key |
| Malicious agent requests account shutdown | Proposal has no authority; approval policy rejects |
| Compromised operator attempts release | Separate identity, approval, safe-state, and audit checks apply |
| HNSW returns another tenant's procedure | Exact tenant ownership filter rejects before result exposure |
| Board has millions of items | Board scope is one canonical resource; no item enumeration |
| Epoch nears bigint exhaustion | Alert and stop before overflow; never wrap or reuse |

## 18. Observability and SLOs

Per-tenant and aggregate metrics:

- activation transaction p50/p95/p99 by target count;
- durable epoch propagation and cache invalidation lag;
- checkpoint latency by kind and scope count;
- prevented mutation commits and tool releases;
- active, draining, cancelled, and quarantined operations;
- cancellation queue age and retry count;
- external `OUTCOME_UNKNOWN` age;
- safe-state check freshness;
- directive churn and active-directive count;
- sequential-scan rejection count;
- cross-tenant predicate violation count, which must remain zero.

Initial objectives:

- account-head point lookup p99 under 2 ms inside the write region;
- 16-scope checkpoint p99 under 10 ms excluding business work;
- 16-target activation p99 under 100 ms under normal control-plane load;
- stale envelope rejection at the first post-activation side-effect checkpoint: 100%;
- cross-tenant fence or evidence exposure: 0;
- no reduction of the 99.99% core data-plane availability objective.

Containment effectiveness and asynchronous cleanup have separate SLOs. Reporting a fast activation must not imply that unknown provider outcomes are already reconciled.

## 19. Rollout

### Phase 1: shadow checkpoints

- Build account head, exact scope derivation, and audit records.
- Evaluate checkpoints without denying effects.
- Compare scope completeness against immutable transaction and tool intents.
- Alert on any path that can publish without a checkpoint.

### Phase 2: narrow enforcement

- Enforce `OPERATION`, `SESSION`, and `TOOL_CAPABILITY` directives.
- Hold unreleased outbox entries and quarantine outputs.
- Require human release and reconciliation evidence.

### Phase 3: principal and resource enforcement

- Add principal, workflow, connector, and resource fences.
- Enable bounded cancellation workers and safe-state compilation.
- Load test hot tenants and large-board scope ancestry.

### Phase 4: account break glass and Open API

- Enable two-person and fixed automated break-glass activation.
- Publish GraphQL proposal, approval, activation, checkpoint, evidence, release, and audit APIs.
- Complete regional failover, disaster recovery, and external-outcome exercises.

## 20. Ship criteria

### Contract validation

- TypeScript contracts compile in strict mode.
- GraphQL schema builds with all custom scalars registered by the API layer.
- SQL DDL executes on the supported PostgreSQL-compatible validation engine.
- Every PK, FK, unique constraint, index, cursor, and queue starts with `account_id`.
- Every mutable transition has idempotency and expected epoch/revision checks.

### Behavioral validation

- Activate overlapping directives and prove deterministic action union.
- Prove an operation serialized before activation can be classified while one after activation is denied.
- Resume a stale worker and prove it cannot commit or release a tool.
- Lose activation and release responses and prove idempotent replay.
- Race activation, expiry, supersession, and release.
- Prove quarantined output never enters caches, Change Watch context, memory, or HNSW.
- Exercise provider acknowledgement, timeout, duplicate delivery, unknown outcome, reconciliation, and compensation.
- Attempt cross-tenant IDs at every GraphQL and storage boundary.

### Scale and failure validation

- Use tenants with 1M+ board rows and high operation/outbox cardinality.
- Verify activation touches only account head, bounded targets, work seeds, and audit rows.
- Verify checkpoint cost scales with declared scopes, not board size.
- Fail cache invalidation, cancellation workers, vector search, columnar replication, and one region independently.
- Promote the write region and prove stale leadership epochs cannot publish effects.
- Demonstrate no unapproved sequential scan or brute-force vector fallback.

## 21. Product decision

Build the Emergency Containment Plane as a first-class mondayDB control plane, not as best-effort task cancellation.

The strategic boundary is:

- **deterministic core:** tenant epoch, exact fences, checkpoint decisions, quarantine, external-effect states, safe-state predicates, idempotency, and audit;
- **probabilistic edge:** anomaly detection, incident summarization, and semantic discovery of approved runbooks;
- **hard safety rule:** probabilistic output may propose containment, but only deterministic policy and verified approvals can activate or release it.

This gives enterprise customers a credible stop mechanism without sacrificing tenant isolation, ACID semantics, or query predictability—and without making the false promise that a database can erase an effect that has already left it.
