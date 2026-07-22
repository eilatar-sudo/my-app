# mondayDB Multi-Agent Coordination Plane

Status: strategic design proposal  
Owners: mondayDB Product, Transactions, Agent Platform, Open API, Security  
Primary SLO: coordination must not reduce the existing 99.99% data-plane availability target

## 1. Why this plane, before how

mondayDB can authenticate an autonomous workload, deliver a change, retrieve memory, verify a plan, and prepare a transaction. It still needs a deterministic answer when two valid agents observe the same change and both decide to act.

The product trade-off is **duplicate prevention and conflict safety versus coordination latency and availability**:

- Long distributed locks reduce overlap but create head-of-line blocking, abandoned-lock recovery, and a new availability dependency.
- Uncoordinated optimistic writes preserve throughput but allow duplicate notifications, repeated tool calls, and last-writer-wins loss.
- Global agent queues simplify ordering but violate tenant isolation and create noisy-neighbor hot spots.

The recommended model is **short tenant-local work claims plus optimistic revision fences**. A claim establishes who may attempt work; a fence proves that the resource is still at the version the agent observed. Claims never replace mondayDB transactions. Row mutations remain ACID, while external tool effects use a transactional outbox and stable idempotency key because a database cannot truthfully guarantee exactly-once behavior in an external system.

This keeps the database deterministic:

1. Agents propose targets and actions.
2. mondayDB assigns policy-controlled queue positions and fencing tokens.
3. mondayDB admits or rejects claims using current durable state.
4. Every protected write compares tenant, claim generation, resource revision, and policy fences in one transaction.
5. Probabilistic semantic retrieval may find a coordination procedure, but it never decides claim ownership.

### Product outcome

For any protected resource, mondayDB can answer:

- Which verified agent currently owns the right to act?
- Which resource revision did that agent observe?
- Has an equivalent action already been accepted?
- Which deterministic rule admitted, queued, conflicted, expired, or rejected the work?
- Can the decision be replayed without invoking an LLM?

## 2. Scope and ownership

The Coordination Plane owns:

- tenant-scoped work claims for board, item, workflow-step, automation, and tool-target conflict domains;
- deterministic single- and multi-resource claim acquisition;
- short leases and monotonically increasing fencing tokens;
- optimistic revision checks at prepare and commit;
- duplicate-action admission and result receipts;
- transactional external-delivery outbox records;
- deterministic contention packets for agent perception;
- bounded retrieval of approved coordination procedures;
- hash-chained audit evidence.

It integrates with, but does not replace:

- **Workload Identity:** proves which non-human principal and session is acting;
- **Purpose, Access, Consent, and Runtime Envelopes:** constrain what it may do;
- **Change Watch:** supplies the source cursor and observed revision;
- **Transaction Intent:** owns ACID prepare and commit of row mutations;
- **Query Governor:** reserves and charges row, columnar, vector, and tool budgets;
- **Tool Execution:** dispatches external effects from a durable outbox;
- **Procedure Memory:** stores reviewed retry, escalation, and compensation instructions.

### Non-goals

- Cross-account claims or global nearest-neighbor arbitration.
- Consensus between independent databases or regions.
- Holding a database transaction open while an LLM reasons or a tool executes.
- Treating a lease as authorization; all existing authorization fences still apply.
- Claiming exactly-once delivery to arbitrary external APIs.
- Letting agents invent priority, lease duration, conflict domains, or lock compatibility.
- Semantic matching of live resource IDs. Conflict identity is exact and canonical.
- Claiming a resource that does not yet exist. Version 1 coordinates creation through an existing parent workflow/item resource and registers the child revision atomically.

## 3. Product contract

### 3.1 Claim contract

A protected operation must carry:

- `accountId`;
- verified `sessionId` and `principalId`;
- compiled access, purpose, delegation, runtime, and policy hashes;
- an immutable typed transaction or tool intent ID from which mondayDB derives one bounded exact target set, expected authoritative revisions, and a trusted effect-occurrence ID;
- an idempotency key; the server derives the deterministic action digest from that intent;
- a source change cursor when the work was triggered by Change Watch.

Claim acquisition returns exactly one durable state:

| State | Meaning | Agent instruction |
|---|---|---|
| `GRANTED` | The request owns every requested target until its lease expires. | Prepare promptly with the returned fences. |
| `QUEUED` | An earlier compatible policy-ranked request blocks at least one target. | Retry only after `retryAfter` or a new change signal. |
| `DEDUPLICATED` | The same action digest was already accepted. | Do not execute again; reuse receipt metadata only if current authorization permits it. |
| `CONFLICTED` | The observed revision or source cursor is stale. | Refresh bounded context and re-plan. |
| `REJECTED` | Policy, budget, identity, scope, or shape failed. | Stop; only deterministic reason codes are actionable. |

The API never returns a partially granted multi-resource request. Either every target is granted in one transaction or none is.

### 3.2 Completion contract

For row-store mutations, acquisition binds a server-owned immutable Transaction Intent. Claim preparation and execution of that intent commit in the same mondayDB transaction. The commit:

1. verifies the active session and authorization fence epochs;
2. verifies claim ownership, generation, lease, and policy hash;
3. compares every resource revision;
4. reserves the action digest;
5. performs business writes;
6. advances resource revisions;
7. records a result receipt and coordination audit event;
8. releases or completes the claim.

For external tools, acquisition binds an immutable Tool Intent containing the encrypted payload reference and connector target. Steps 1–4 atomically consume the source cursor or advance the protected workflow revision, then create a durable outbox record and receipt. Before dispatch, Tool Execution atomically rechecks authorization fences, increments and owns the outbox lease generation, and issues a short-lived delivery-release token bound to that generation. That commit is the authorization point of no return; no database lock is held during network I/O. Revocation before release marks the outbox and receipt `CANCELLED`; revocation after release triggers best-effort compensation, not rollback. Dispatch may occur more than once. Every attempt carries the same idempotency key, and acknowledgement/retry transitions compare-and-swap the current lease generation.

### 3.3 Availability behavior

- Existing human and non-agent writes do not acquire claims. Once a product opts a conflict domain into coordination, however, **every** writer uses the shared mutation primitive that advances its authoritative resource revision in the same transaction.
- Protected autonomous writes and tool actions fail closed when durable claim state cannot be verified.
- Unprotected reads may continue in degraded mode, but their packets state `coordinationStatus: UNVERIFIED` and cannot authorize a write.
- Lease expiry uses current mondayDB database time after locks are acquired, never an agent clock or transaction-start timestamp.
- Each tenant has one fenced write region. Regional promotion requires quorum-synchronous RPO=0 state, increments a durable leadership epoch, and fails closed until the old writer is fenced.
- Claim renewal is optional for correctness. An expired worker can never commit with its old fencing token.

The revision primitive is co-located with the authoritative business row path; it does not call the queue, vector index, tool dispatcher, or LLM. Its protected-domain budget is one indexed revision update and at most 2 ms p99 internal overhead, measured separately from the business write. A tenant kill switch stops new autonomous grants while human writes continue advancing revisions. If the authoritative revision cannot commit, that resource's write fails closed because allowing it would make subsequent agent fences unsafe.

## 4. Deterministic invariants

1. **Tenant first:** every key, foreign key, unique constraint, queue, cache key, and lookup starts with `account_id`.
2. **Trusted tenant context:** GraphQL `accountId` is matched against an extension-protected connection context; clients cannot set that context.
3. **Verified actor:** only an active workload session bound to the same account and principal may acquire, renew, prepare, commit, or release a claim.
4. **Authorization remains live:** access, purpose, delegation, runtime, consent, and policy fence epochs are rechecked at result release.
5. **Exact conflict identity:** `resource_type` and canonical `resource_key` determine conflict. Embeddings never determine ownership.
6. **Bounded target set:** one request has at most 16 targets by default and at most the policy ceiling.
7. **Atomic target set:** multi-resource claims are all-or-none.
8. **Canonical lock order:** resource rows are locked by `(resource_type, resource_key_hash, resource_key)` to prevent deadlocks.
9. **Monotonic fence:** every successful exclusive grant increments the resource fencing token. Tokens are never reused.
10. **Short lease:** policy supplies lease duration and renewal count. An agent cannot request a larger value.
11. **Revision fence:** every human, legacy, and autonomous mutation of an opted-in resource advances one authoritative revision; a protected mutation fails if any expected revision differs at commit.
12. **Deterministic queue:** priority comes from an approved policy class; ties use durable per-resource queue sequence then request ID.
13. **No partial progress:** a queued multi-target request cannot retain a subset of claims.
14. **Duplicate suppression:** `(account_id, action_digest)` has one durable acceptance receipt for the declared dedupe window.
15. **No false exactly-once claim:** external delivery is at-least-once with stable idempotency and deterministic reconciliation.
16. **No LLM in admission:** claim compatibility, ordering, expiry, revision comparison, and dedupe are ordinary deterministic code.
17. **Auditable transition:** every state transition appends an immutable event chained to a tenant-local audit head.
18. **No scan fallback:** missing indexes, stale semantic manifests, or exhausted budgets reject or queue; they never trigger a full-board scan.

## 5. Coordination model

### 5.1 Conflict domains

Each product defines canonical resources and compatibility in a versioned policy:

| Resource type | Example canonical key | Typical mode |
|---|---|---|
| `BOARD` | `board/123` | shared planning, rare exclusive schema change |
| `ITEM` | `board/123/item/456` | exclusive mutation |
| `WORKFLOW_STEP` | `workflow/88/run/99/step/3` | exclusive execution |
| `AUTOMATION` | `automation/77/trigger/abc` | exclusive trigger handling |
| `TOOL_TARGET` | `connector/slack/channel/C1/action/post` | policy-defined |
| `CUSTOM` | registered namespace plus opaque ID | policy-defined |

Canonicalization is server-owned. A raw user label, prompt, or embedding is never a resource key. Resource IDs may be stored in an opaque canonical form; logs expose hashes unless support policy permits otherwise.

### 5.2 Claim modes

- `SHARED_READ`: bounded cooperative inspection where no mutation right is implied.
- `EXCLUSIVE_WRITE`: one owner may prepare a mutation or external effect.

Version 1 intentionally omits arbitrary reader/writer matrices, upgrades, and nested claims. A worker that needs to write releases shared claims and submits a new exclusive request. This avoids upgrade deadlocks and hidden recursion.

### 5.3 Queue and fairness

Policies map authenticated workload classes to a fixed integer priority. Agents cannot submit priority. On request insertion, each target resource allocates a monotonic `queue_sequence`. A request is grantable only when:

- it is the earliest compatible waiter for every target;
- no incompatible active claim exists;
- tenant and principal concurrency ceilings have capacity;
- the request's deadline and source cursor remain valid;
- the Query Governor reservation remains valid.

This creates deterministic FIFO behavior inside a policy class without a global claim-table count. Acquisition reserves one preallocated tenant-global capacity slot and updates one tenant-global principal counter. Capacity is intentionally global across policies and versions, so a policy rollout cannot multiply either ceiling. Query Governor separately reserves policy-specific execution cost. A large board cannot block unrelated resources, and one tenant cannot affect another tenant's sequence.

Starvation controls are policy-owned:

- bounded queue age;
- bounded retries and renewals;
- optional deterministic aging between predefined priority classes;
- a maximum active-claim share per principal;
- no work stealing across accounts.

Compatibility is phase-fair. A contiguous prefix of shared readers may grant together, but once an exclusive waiter is earliest in `(request_rank, queue_sequence, request_id)` order, no later shared request may pass it. After that writer completes or expires, the next contiguous shared prefix may grant. Deterministic aging can change only the predefined rank at a persisted threshold; it cannot reorder within a rank.

### 5.4 Fencing and lease expiry

The claim lease is a liveness mechanism, not the safety boundary. The fencing token is the safety boundary.

When exclusive ownership changes:

1. mondayDB locks the tenant-local resource row;
2. it verifies the tenant's current write-region leadership epoch and increments `fence_token`;
3. it writes the new claim generation and lease;
4. it commits before returning the claim.

Every protected mutation supplies `(account_id, claim_id, claim_generation, leadership_epoch, resource_key, fence_token, expected_revision)`. The write path compares the complete target set under canonically ordered row locks. A delayed worker with an expired token or prior-region epoch is rejected even if it resumes after a network partition.

### 5.5 Revisions

`resource_revision` is a non-negative signed 64-bit value represented as a decimal string at the GraphQL and TypeScript boundaries. Once a conflict domain is opted in, the authoritative business write primitive advances it for **every** mutation, including human and legacy writes. Deployments must alert and stop before signed `bigint` exhaustion.

Agents receive revisions through Change Watch or bounded reads. They cannot use vector-index timestamps, wall clocks, or cached summaries as revision evidence.

For commutative updates, a policy may declare a server-implemented merge operator such as `SET_ADD` or `NUMERIC_INCREMENT`. The operator and operands are still revisioned and audited. LLM-generated merge code is prohibited.

### 5.6 Duplicate actions

The server computes:

```text
action_digest = SHA256(
  canonical_version ||
  account_id ||
  trusted_effect_occurrence_id ||
  action_kind ||
  canonical_target_set ||
  server_normalized_immutable_intent ||
  source_change_cursor
)
```

Actor identity, authorization purpose, trace IDs, timestamps, model prose, claim IDs, and client-supplied hashes are excluded. The trusted effect-occurrence ID is shared by agents racing on one workflow-run/step or trigger receipt, but differs for two intentional repetitions of the same content. This makes duplicate suppression effect-scoped across authorized agents without suppressing a later intentional action. mondayDB loads the immutable intent, canonicalizes typed fields server-side, and stores the canonicalization version with the receipt; it never trusts a client assertion of the business-input hash. Authorization-context hashes remain on the request and audit event, separate from dedupe identity.

The dedupe boundary is exact, not semantic. Similar embeddings can suggest that an operator review two actions, but they cannot suppress an action.

## 6. Request lifecycle

### 6.1 Preflight

1. Resolve trusted tenant and verified workload session.
2. Load the versioned coordination policy by exact tenant and policy ID.
3. Load the immutable intent, derive its trusted occurrence and exact targets, join each target to the tenant's authoritative business-resource catalog, then validate target count, namespaces, modes, deadline, and source cursor.
4. Resolve current resource revisions through indexed point lookups.
5. Compute action digest and check the durable receipt index.
6. Ask Query Governor for an estimate-only admissibility decision; preflight does not retain an active-claim slot or execution budget.
7. Return a deterministic plan containing expected lock count, queue state, and reason codes.

Preflight is advisory. Acquisition repeats all safety checks transactionally.

### 6.2 Acquire

1. Insert or reuse the idempotent claim request.
2. Materialize missing resource coordination rows from a server-sorted input relation in the same canonical order used for locks.
3. Lock all target rows in canonical order.
4. Expire old claims under the same locks.
5. Allocate per-resource queue sequence numbers and insert bounded live-waiter rows.
6. Evaluate policy compatibility and revision fences. Only the grant branch atomically reserves and consumes a free account capacity slot, updates the locked principal counter, and consumes a fresh Query Governor execution reservation; queue/reject retains none, and promotion repeats admission.
7. Grant all targets and increment exclusive fence tokens, or queue/reject the entire request.
8. Append the audit event and commit.

### 6.3 Renew

Renewal succeeds only when:

- the same verified session and principal own the claim;
- every target still points to the same claim generation;
- no authorization or policy fence changed;
- no earlier incompatible waiter exceeded its fairness threshold;
- the policy renewal limit and budget remain;
- the lease has not passed the non-renewable grace boundary.

Renewal never changes a fencing token.

### 6.4 Prepare

Prepare rechecks the complete claim, current revisions, source cursor, action digest, and transaction intent. It returns a short-lived preparation hash:

```text
preparation_hash = SHA256(
  claim_snapshot_hash ||
  transaction_intent_hash ||
  current_revision_vector ||
  authorization_fence_vector ||
  budget_reservation_hash
)
```

An agent cannot alter targets or business input after preparation. Any change creates a new request and digest.

The preparation stores its own expiry and immutable intent ID. Commit checks both the preparation expiry and claim lease against current database wall time after every target lock is held.

### 6.5 Commit

Row mutations and resource revision updates commit atomically. External effects atomically create an outbox record. The result receipt becomes the durable answer for retries.

### 6.6 Release, expiry, and cancellation

- `COMPLETED`: accepted result or outbox record exists.
- `RELEASED`: owner voluntarily stopped before acceptance.
- `EXPIRED`: mondayDB time passed the lease and a transaction materialized expiry.
- `CANCELLED`: policy owner or authorized operator fenced the claim.
- `CONFLICTED`: revision, cursor, immutable intent, or action identity changed before prepare/commit.

Expiry is logically effective at `lease_expires_at`; cleanup may be asynchronous. The resource row tracks `next_holder_expiry_at`. Indexed acquisition touches expiry state only when that timestamp is due and inspects at most the policy's bounded live-holder ceiling (default 64, hard ceiling 256) through the resource-expiry index. A separate account-leading expiry index drives sweepers in fixed-size batches, so neither acquisition nor cleanup scans holder history.

Queued work remains a claim **request**, not a partially initialized claim. It has a durable `requestId`, can be inspected or cancelled idempotently, and is promoted atomically only when it is the earliest compatible waiter on every target. Change Watch emits a wakeup hint; the database remains the authority when promotion is attempted.

Every state-changing command—acquire, renew, prepare, complete, release, cancel, and promote—first inserts or locks an account/principal/operation/idempotency-key ledger row. The `PENDING` row, state transition, durable result, and `COMPLETED` ledger result commit in the same transaction; an abort leaves none of them. Reusing a key with the same request hash returns the recorded result; reusing it with different input is rejected. Full results remain replayable through the published replay window. Afterward, a key/request/result-hash tombstone remains through the complete receipt, lease, retry, and external-side-effect horizon, so key reuse cannot cause a duplicate transition. This prevents a lost renewal response from consuming an additional renewal or extending the lease twice.

## 7. TypeScript contracts

All scalar wrappers are branded to discourage accidental cross-tenant or numeric coercion. `NonNegativeInt64String` values are decimal strings in `0..2^63-1` and must never pass through JavaScript `number`.

```ts
export type AccountId = string & { readonly __brand: "AccountId" };
export type PrincipalId = string & { readonly __brand: "PrincipalId" };
export type SessionId = string & { readonly __brand: "SessionId" };
export type ClaimId = string & { readonly __brand: "ClaimId" };
export type ClaimRequestId = string & { readonly __brand: "ClaimRequestId" };
export type PolicyId = string & { readonly __brand: "CoordinationPolicyId" };
export type ReceiptId = string & { readonly __brand: "ActionReceiptId" };
export type IntentId = string & { readonly __brand: "ImmutableIntentId" };
export type Sha256 = string & { readonly __brand: "Sha256Hex" };
export type NonNegativeInt64String = string & {
  readonly __brand: "NonNegativeInt64String";
};
export type DateTimeString = string & { readonly __brand: "DateTimeString" };

export type CoordinationResourceType =
  | "BOARD"
  | "ITEM"
  | "WORKFLOW_STEP"
  | "AUTOMATION"
  | "TOOL_TARGET"
  | "CUSTOM";

export type ClaimMode = "SHARED_READ" | "EXCLUSIVE_WRITE";

export type ClaimState =
  | "GRANTED"
  | "PREPARED"
  | "COMPLETED"
  | "RELEASED"
  | "EXPIRED"
  | "CANCELLED"
  | "CONFLICTED"
  | "REJECTED";

export type ClaimRequestState =
  | "PENDING"
  | "QUEUED"
  | "GRANTED"
  | "DEDUPLICATED"
  | "CONFLICTED"
  | "CANCELLED"
  | "REJECTED";

export type CoordinationDecision =
  | "GRANTED"
  | "QUEUED"
  | "DEDUPLICATED"
  | "CONFLICTED"
  | "REJECTED";

export type CoordinationReasonCode =
  | "GRANTED_ALL_TARGETS"
  | "ACTION_ALREADY_ACCEPTED"
  | "INCOMPATIBLE_ACTIVE_CLAIM"
  | "EARLIER_WAITER"
  | "RESOURCE_REVISION_CHANGED"
  | "SOURCE_CURSOR_STALE"
  | "CLAIM_EXPIRED"
  | "FENCE_TOKEN_MISMATCH"
  | "TARGET_LIMIT_EXCEEDED"
  | "TARGET_NOT_CANONICAL"
  | "POLICY_NOT_FOUND"
  | "POLICY_FENCE_CHANGED"
  | "IDENTITY_SESSION_INVALID"
  | "AUTHORIZATION_FENCE_CHANGED"
  | "BUDGET_NOT_RESERVED"
  | "PRINCIPAL_CONCURRENCY_EXCEEDED"
  | "ACCOUNT_CONCURRENCY_EXCEEDED"
  | "RENEWAL_LIMIT_EXCEEDED"
  | "DEADLINE_EXPIRED"
  | "UNBOUNDED_REQUEST_REJECTED";

export interface AuthorizationFenceVector {
  workloadIdentityEpoch: NonNegativeInt64String;
  accessPolicyEpoch: NonNegativeInt64String;
  purposePolicyEpoch: NonNegativeInt64String;
  delegationEpoch: NonNegativeInt64String;
  runtimeContractEpoch: NonNegativeInt64String;
  consentEpoch?: NonNegativeInt64String;
}

export interface ImmutableIntentCoordinationTarget {
  resourceType: CoordinationResourceType;
  /** Server-registered namespace plus opaque identifier. */
  resourceKey: string;
  mode: ClaimMode;
  expectedRevision: NonNegativeInt64String;
}

export interface CoordinationTargetFence {
  resourceType: CoordinationResourceType;
  resourceKeyHash: Sha256;
  mode: ClaimMode;
  expectedRevision: NonNegativeInt64String;
  observedRevision: NonNegativeInt64String;
  leadershipEpoch: NonNegativeInt64String;
  fenceToken: NonNegativeInt64String;
  queueSequence: NonNegativeInt64String;
}

export interface CoordinationPolicySnapshot {
  policyId: PolicyId;
  policyVersion: NonNegativeInt64String;
  policyHash: Sha256;
  maxTargets: number;
  maxLeaseMs: number;
  maxRenewals: number;
  maxQueueMs: number;
  effectiveGlobalPrincipalConcurrencyLimit: number;
  effectiveGlobalAccountConcurrencyLimit: number;
  priorityClass: number;
  dedupeWindowMs: number;
}

export interface AcquireWorkClaimInput {
  accountId: AccountId;
  sessionId: SessionId;
  policyId: PolicyId;
  idempotencyKey: string;
  intentId: IntentId;
  sourceChangeCursor?: string;
  deadline: DateTimeString;
}

export interface WorkClaimRequest {
  accountId: AccountId;
  requestId: ClaimRequestId;
  principalId: PrincipalId;
  state: ClaimRequestState;
  actionDigest: Sha256;
  targetSetHash: Sha256;
  queuedAt?: DateTimeString;
  retryAfter?: DateTimeString;
}

export interface WorkClaim {
  accountId: AccountId;
  claimId: ClaimId;
  requestId: ClaimRequestId;
  principalId: PrincipalId;
  sessionId: SessionId;
  state: ClaimState;
  generation: NonNegativeInt64String;
  actionDigest: Sha256;
  intentId: IntentId;
  policy: CoordinationPolicySnapshot;
  authorizationFences: AuthorizationFenceVector;
  targets: readonly CoordinationTargetFence[];
  grantedAt: DateTimeString;
  leaseExpiresAt: DateTimeString;
  renewalCount: number;
  claimSnapshotHash: Sha256;
}

export interface ClaimBlocker {
  resourceType: CoordinationResourceType;
  resourceKeyHash: Sha256;
  reasonCode: CoordinationReasonCode;
  /** Opaque; never reveals another tenant or raw principal identity. */
  blockingClaimRef?: string;
  retryAfter?: DateTimeString;
}

export interface ActionReceipt {
  accountId: AccountId;
  receiptId: ReceiptId;
  actionDigest: Sha256;
  actionKind: string;
  status:
    | "RESERVED"
    | "COMMITTED"
    | "OUTBOXED"
    | "ACKNOWLEDGED"
    | "CANCELLED"
    | "FAILED_FINAL";
  claimId: ClaimId;
  claimGeneration: NonNegativeInt64String;
  acceptanceGeneration: NonNegativeInt64String;
  resultHash?: Sha256;
  externalIdempotencyKey?: string;
  sourceChangeCursor?: string;
  committedRevisionVectorHash?: Sha256;
  acceptedAt: DateTimeString;
  expiresAt?: DateTimeString;
  receiptHash: Sha256;
}

export interface CoordinationPerceptionCard {
  kind: "MONDAYDB_COORDINATION";
  request: WorkClaimRequest;
  decision: CoordinationDecision;
  reasonCodes: readonly CoordinationReasonCode[];
  claim?: WorkClaim;
  existingReceipt?: ActionReceipt;
  receiptVisible: boolean;
  blockers: readonly ClaimBlocker[];
  retryPolicyRef?: string;
  refreshRequired: boolean;
  coordinationDepth: number;
  remainingCoordinationDepth: number;
  allowedNextActions: readonly (
    | "PREPARE"
    | "RENEW"
    | "RELEASE"
    | "WAIT_FOR_SIGNAL"
    | "REFRESH_CONTEXT"
    | "REUSE_RECEIPT"
    | "STOP"
  )[];
  auditEventId: string;
  packetHash: Sha256;
}

export interface PrepareCoordinatedActionInput {
  accountId: AccountId;
  sessionId: SessionId;
  claimId: ClaimId;
  claimGeneration: NonNegativeInt64String;
  intentId: IntentId;
  idempotencyKey: string;
  targetFences: readonly Pick<
    CoordinationTargetFence,
    | "resourceType"
    | "resourceKeyHash"
    | "expectedRevision"
    | "leadershipEpoch"
    | "fenceToken"
  >[];
}

export interface CompleteCoordinatedActionInput {
  accountId: AccountId;
  sessionId: SessionId;
  claimId: ClaimId;
  claimGeneration: NonNegativeInt64String;
  preparationHash: Sha256;
  idempotencyKey: string;
}

export interface CoordinationProcedureMetadata {
  accountId: AccountId;
  procedureId: string;
  version: NonNegativeInt64String;
  title: string;
  appliesToResourceTypes: readonly CoordinationResourceType[];
  reasonCodes: readonly CoordinationReasonCode[];
  instructionSummary: string;
  riskClass: "LOW" | "MEDIUM" | "HIGH";
  reviewStatus: "APPROVED" | "REVOKED";
  contentHash: Sha256;
  embeddingManifestId?: string;
}
```

### Resolver requirements

- Generate TypeScript and GraphQL contracts from one versioned coordination IDL; CI rejects drift.
- Never derive trusted actor identity from GraphQL input.
- Compare `accountId` with trusted request context before any storage call.
- Reject duplicate target keys, unknown namespaces, and non-canonical ordering.
- Return reason codes and perception fields from durable decisions, not generated prose.
- Apply response-size limits to blockers and target fences.
- Redact raw resource keys and other principals from contention responses.
- Derive parent action digest, ancestry hash, and coordination depth from trusted runtime/change/tool causation context; ignore client attempts to supply them.
- Reauthorize receipt visibility against the current principal, purpose, access, and source object. If denied, return `DEDUPLICATED`, `receiptVisible: false`, and no receipt fields.

## 8. SQL row-store schema

The following schema is a logical contract. Physical deployment should hash-partition high-volume tables by `account_id`; every child partition retains the same tenant-leading constraints and RLS policy.

```sql
CREATE TYPE coordination_resource_type AS ENUM (
  'BOARD', 'ITEM', 'WORKFLOW_STEP', 'AUTOMATION', 'TOOL_TARGET', 'CUSTOM'
);

CREATE TYPE coordination_claim_mode AS ENUM (
  'SHARED_READ', 'EXCLUSIVE_WRITE'
);

CREATE TYPE coordination_claim_state AS ENUM (
  'GRANTED', 'PREPARED', 'COMPLETED', 'RELEASED',
  'EXPIRED', 'CANCELLED', 'CONFLICTED', 'REJECTED'
);

CREATE TYPE coordination_request_state AS ENUM (
  'PENDING', 'QUEUED', 'GRANTED', 'DEDUPLICATED',
  'CONFLICTED', 'CANCELLED', 'REJECTED'
);

CREATE TYPE coordination_receipt_status AS ENUM (
  'RESERVED', 'COMMITTED', 'OUTBOXED', 'ACKNOWLEDGED', 'CANCELLED', 'FAILED_FINAL'
);

CREATE TYPE coordination_actor_kind AS ENUM (
  'WORKLOAD', 'HUMAN_OPERATOR', 'PLATFORM_SERVICE'
);

CREATE TABLE agent_coordination_policy (
  account_id                 bigint NOT NULL,
  policy_id                  uuid NOT NULL,
  policy_version             bigint NOT NULL CHECK (policy_version > 0),
  policy_hash                bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  enabled                    boolean NOT NULL DEFAULT true,
  resource_types             coordination_resource_type[] NOT NULL,
  max_targets                smallint NOT NULL CHECK (max_targets BETWEEN 1 AND 64),
  max_lease_ms               integer NOT NULL CHECK (max_lease_ms BETWEEN 1000 AND 300000),
  max_renewals               smallint NOT NULL CHECK (max_renewals BETWEEN 0 AND 20),
  max_queue_ms               integer NOT NULL CHECK (max_queue_ms BETWEEN 0 AND 3600000),
  max_shared_per_resource    smallint NOT NULL CHECK (max_shared_per_resource BETWEEN 1 AND 256),
  priority_class             smallint NOT NULL CHECK (priority_class BETWEEN 0 AND 31),
  dedupe_window_ms           bigint NOT NULL CHECK (dedupe_window_ms BETWEEN 1000 AND 2592000000),
  allowed_merge_operators    text[] NOT NULL DEFAULT '{}',
  policy_document            jsonb NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  retired_at                 timestamptz,
  PRIMARY KEY (account_id, policy_id, policy_version),
  UNIQUE (account_id, policy_id, policy_hash)
);

CREATE TABLE agent_coordination_global_limit (
  account_id                 bigint NOT NULL,
  limit_version              bigint NOT NULL CHECK (limit_version > 0),
  max_active_per_account     integer NOT NULL CHECK (max_active_per_account BETWEEN 1 AND 1000000),
  max_active_per_principal   integer NOT NULL CHECK (max_active_per_principal BETWEEN 1 AND 10000),
  provisioned_slot_count     integer NOT NULL CHECK (provisioned_slot_count >= 0),
  retirement_pending_count  integer NOT NULL DEFAULT 0 CHECK (retirement_pending_count >= 0),
  limit_hash                 bytea NOT NULL CHECK (octet_length(limit_hash) = 32),
  activated_at               timestamptz NOT NULL,
  PRIMARY KEY (account_id),
  UNIQUE (account_id, limit_version),
  UNIQUE (account_id, limit_hash)
);

CREATE TABLE agent_tenant_write_leadership (
  account_id                 bigint NOT NULL,
  leadership_epoch           bigint NOT NULL CHECK (leadership_epoch >= 0),
  writer_region              text NOT NULL,
  promotion_evidence_hash    bytea NOT NULL CHECK (octet_length(promotion_evidence_hash) = 32),
  prior_writer_fenced_at     timestamptz NOT NULL,
  activated_at               timestamptz NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_coordination_resource (
  account_id                 bigint NOT NULL,
  resource_type              coordination_resource_type NOT NULL,
  resource_key               text NOT NULL,
  resource_key_hash          bytea NOT NULL CHECK (octet_length(resource_key_hash) = 32),
  resource_revision          bigint NOT NULL DEFAULT 0 CHECK (resource_revision >= 0),
  leadership_epoch           bigint NOT NULL CHECK (leadership_epoch >= 0),
  fence_token                bigint NOT NULL DEFAULT 0 CHECK (fence_token >= 0),
  next_queue_sequence        bigint NOT NULL DEFAULT 1 CHECK (next_queue_sequence > 0),
  active_shared_count        integer NOT NULL DEFAULT 0 CHECK (active_shared_count >= 0),
  active_exclusive_claim_id  uuid,
  next_holder_expiry_at      timestamptz,
  latest_change_cursor       text,
  policy_id                  uuid NOT NULL,
  policy_version             bigint NOT NULL,
  updated_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, resource_type, resource_key),
  UNIQUE (account_id, resource_type, resource_key_hash, resource_key),
  FOREIGN KEY (account_id, policy_id, policy_version)
    REFERENCES agent_coordination_policy (account_id, policy_id, policy_version),
  CHECK (resource_key <> '' AND octet_length(resource_key) <= 1024),
  CHECK (active_exclusive_claim_id IS NULL OR active_shared_count = 0)
);

CREATE TABLE agent_coordination_capacity_reservation (
  account_id                 bigint NOT NULL,
  reservation_id            uuid NOT NULL,
  principal_id               uuid NOT NULL,
  policy_id                  uuid NOT NULL,
  policy_version             bigint NOT NULL,
  reservation_generation    bigint NOT NULL CHECK (reservation_generation > 0),
  slot_id                    integer NOT NULL CHECK (slot_id >= 0),
  reservation_state         text NOT NULL CHECK (
    reservation_state IN ('RESERVED', 'CONSUMED', 'RELEASED', 'EXPIRED')
  ),
  reservation_hash          bytea NOT NULL CHECK (octet_length(reservation_hash) = 32),
  expires_at                timestamptz NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, reservation_id),
  UNIQUE (account_id, policy_id, policy_version, slot_id, reservation_id),
  FOREIGN KEY (account_id, policy_id, policy_version)
    REFERENCES agent_coordination_policy (account_id, policy_id, policy_version)
);

CREATE TABLE agent_coordination_capacity_slot (
  account_id                 bigint NOT NULL,
  slot_id                    integer NOT NULL CHECK (slot_id >= 0),
  slot_state                 text NOT NULL CHECK (
    slot_state IN ('FREE', 'RESERVED', 'ACTIVE', 'RETIRED')
  ),
  retire_on_release          boolean NOT NULL DEFAULT false,
  reservation_id            uuid,
  principal_id               uuid,
  policy_id                  uuid,
  policy_version             bigint,
  expires_at                 timestamptz,
  PRIMARY KEY (account_id, slot_id),
  UNIQUE (account_id, reservation_id),
  FOREIGN KEY (account_id, policy_id, policy_version)
    REFERENCES agent_coordination_policy (account_id, policy_id, policy_version),
  CHECK (
    (
      slot_state = 'FREE'
      AND retire_on_release = false
      AND reservation_id IS NULL
      AND principal_id IS NULL
      AND policy_id IS NULL
      AND policy_version IS NULL
    )
    OR (
      slot_state IN ('RESERVED', 'ACTIVE')
      AND reservation_id IS NOT NULL
      AND principal_id IS NOT NULL
      AND policy_id IS NOT NULL
      AND policy_version IS NOT NULL
    )
    OR (
      slot_state = 'RETIRED'
      AND retire_on_release = false
      AND reservation_id IS NULL
      AND principal_id IS NULL
      AND policy_id IS NULL
      AND policy_version IS NULL
    )
  )
);

CREATE INDEX agent_coordination_free_slot_idx
  ON agent_coordination_capacity_slot
  (account_id, slot_state, slot_id);

CREATE INDEX agent_coordination_slot_expiry_idx
  ON agent_coordination_capacity_slot
  (account_id, slot_state, expires_at, slot_id)
  WHERE slot_state IN ('RESERVED', 'ACTIVE');

CREATE TABLE agent_coordination_principal_capacity (
  account_id                 bigint NOT NULL,
  principal_id               uuid NOT NULL,
  reserved_count             integer NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  active_count               integer NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  updated_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, principal_id)
);

CREATE INDEX agent_coordination_capacity_principal_idx
  ON agent_coordination_capacity_reservation
  (account_id, principal_id, reservation_state, expires_at, reservation_id);

CREATE TABLE agent_claim_request (
  account_id                 bigint NOT NULL,
  request_id                 uuid NOT NULL,
  principal_id               uuid NOT NULL,
  session_id                 uuid NOT NULL,
  policy_id                  uuid NOT NULL,
  policy_version             bigint NOT NULL,
  idempotency_key_hash       bytea NOT NULL CHECK (octet_length(idempotency_key_hash) = 32),
  intent_id                  uuid NOT NULL,
  immutable_intent_hash      bytea NOT NULL CHECK (octet_length(immutable_intent_hash) = 32),
  effect_occurrence_id       uuid NOT NULL,
  action_digest              bytea NOT NULL CHECK (octet_length(action_digest) = 32),
  action_kind                text NOT NULL,
  source_change_cursor       text,
  parent_action_digest       bytea CHECK (
    parent_action_digest IS NULL OR octet_length(parent_action_digest) = 32
  ),
  ancestry_hash              bytea NOT NULL CHECK (octet_length(ancestry_hash) = 32),
  coordination_depth         smallint NOT NULL CHECK (coordination_depth BETWEEN 0 AND 16),
  target_count               smallint NOT NULL CHECK (target_count BETWEEN 1 AND 64),
  priority_class             smallint NOT NULL CHECK (priority_class BETWEEN 0 AND 31),
  request_state              coordination_request_state NOT NULL DEFAULT 'PENDING',
  deadline_at                timestamptz NOT NULL,
  requested_at               timestamptz NOT NULL DEFAULT transaction_timestamp(),
  decision_at                timestamptz,
  reason_codes               text[] NOT NULL DEFAULT '{}',
  access_policy_hash         bytea NOT NULL CHECK (octet_length(access_policy_hash) = 32),
  purpose_envelope_hash      bytea NOT NULL CHECK (octet_length(purpose_envelope_hash) = 32),
  delegation_hash            bytea NOT NULL CHECK (octet_length(delegation_hash) = 32),
  runtime_contract_hash      bytea NOT NULL CHECK (octet_length(runtime_contract_hash) = 32),
  capacity_reservation_id    uuid NOT NULL,
  budget_reservation_hash    bytea NOT NULL CHECK (octet_length(budget_reservation_hash) = 32),
  request_hash               bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, principal_id, idempotency_key_hash),
  FOREIGN KEY (account_id, policy_id, policy_version)
    REFERENCES agent_coordination_policy (account_id, policy_id, policy_version),
  FOREIGN KEY (account_id, capacity_reservation_id)
    REFERENCES agent_coordination_capacity_reservation (account_id, reservation_id),
  CHECK (deadline_at > requested_at)
);

CREATE TABLE agent_claim_request_target (
  account_id                 bigint NOT NULL,
  request_id                 uuid NOT NULL,
  resource_type              coordination_resource_type NOT NULL,
  resource_key               text NOT NULL,
  mode                       coordination_claim_mode NOT NULL,
  expected_revision          bigint NOT NULL CHECK (expected_revision >= 0),
  request_rank               smallint NOT NULL CHECK (request_rank BETWEEN 0 AND 31),
  queue_sequence             bigint NOT NULL CHECK (queue_sequence > 0),
  target_ordinal             smallint NOT NULL CHECK (target_ordinal BETWEEN 0 AND 63),
  PRIMARY KEY (account_id, request_id, resource_type, resource_key),
  UNIQUE (account_id, request_id, target_ordinal),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_claim_request (account_id, request_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, resource_type, resource_key)
    REFERENCES agent_coordination_resource (account_id, resource_type, resource_key)
);

CREATE TABLE agent_live_claim_waiter (
  account_id                 bigint NOT NULL,
  resource_type              coordination_resource_type NOT NULL,
  resource_key               text NOT NULL,
  request_rank               smallint NOT NULL CHECK (request_rank BETWEEN 0 AND 31),
  queue_sequence             bigint NOT NULL CHECK (queue_sequence > 0),
  request_id                 uuid NOT NULL,
  mode                       coordination_claim_mode NOT NULL,
  deadline_at                timestamptz NOT NULL,
  PRIMARY KEY (
    account_id, resource_type, resource_key,
    request_rank, queue_sequence, request_id
  ),
  UNIQUE (account_id, request_id, resource_type, resource_key),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_claim_request (account_id, request_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, resource_type, resource_key)
    REFERENCES agent_coordination_resource (account_id, resource_type, resource_key)
);

CREATE INDEX agent_live_waiter_request_idx
  ON agent_live_claim_waiter (account_id, request_id, resource_type, resource_key);

CREATE TABLE agent_work_claim (
  account_id                 bigint NOT NULL,
  claim_id                   uuid NOT NULL,
  request_id                 uuid NOT NULL,
  principal_id               uuid NOT NULL,
  session_id                 uuid NOT NULL,
  claim_state                coordination_claim_state NOT NULL,
  generation                 bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  granted_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  lease_expires_at           timestamptz NOT NULL,
  renewal_count              smallint NOT NULL DEFAULT 0 CHECK (renewal_count >= 0),
  prepared_at                timestamptz,
  preparation_expires_at     timestamptz,
  completed_at               timestamptz,
  intent_id                  uuid NOT NULL,
  preparation_hash           bytea CHECK (
    preparation_hash IS NULL OR octet_length(preparation_hash) = 32
  ),
  claim_snapshot_hash        bytea NOT NULL CHECK (octet_length(claim_snapshot_hash) = 32),
  policy_hash                bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  authorization_fence_hash   bytea NOT NULL CHECK (octet_length(authorization_fence_hash) = 32),
  last_transition_event_id   uuid NOT NULL,
  PRIMARY KEY (account_id, claim_id),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_claim_request (account_id, request_id),
  CHECK (lease_expires_at > granted_at),
  CHECK (
    (claim_state <> 'PREPARED' OR (
      preparation_hash IS NOT NULL
      AND preparation_expires_at IS NOT NULL
      AND preparation_expires_at > prepared_at
    ))
    AND (completed_at IS NULL OR claim_state IN (
      'COMPLETED', 'RELEASED', 'EXPIRED', 'CANCELLED', 'CONFLICTED', 'REJECTED'
    ))
  )
);

CREATE TABLE agent_work_claim_target (
  account_id                 bigint NOT NULL,
  claim_id                   uuid NOT NULL,
  resource_type              coordination_resource_type NOT NULL,
  resource_key               text NOT NULL,
  mode                       coordination_claim_mode NOT NULL,
  expected_revision          bigint NOT NULL CHECK (expected_revision >= 0),
  granted_revision           bigint NOT NULL CHECK (granted_revision >= 0),
  leadership_epoch           bigint NOT NULL CHECK (leadership_epoch >= 0),
  fence_token                bigint NOT NULL CHECK (fence_token >= 0),
  queue_sequence             bigint NOT NULL CHECK (queue_sequence > 0),
  PRIMARY KEY (account_id, claim_id, resource_type, resource_key),
  FOREIGN KEY (account_id, claim_id)
    REFERENCES agent_work_claim (account_id, claim_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, resource_type, resource_key)
    REFERENCES agent_coordination_resource (account_id, resource_type, resource_key)
);

CREATE TABLE agent_live_claim_holder (
  account_id                 bigint NOT NULL,
  resource_type              coordination_resource_type NOT NULL,
  resource_key               text NOT NULL,
  claim_id                   uuid NOT NULL,
  mode                       coordination_claim_mode NOT NULL,
  claim_generation           bigint NOT NULL CHECK (claim_generation > 0),
  leadership_epoch           bigint NOT NULL CHECK (leadership_epoch >= 0),
  fence_token                bigint NOT NULL CHECK (fence_token >= 0),
  lease_expires_at           timestamptz NOT NULL,
  PRIMARY KEY (account_id, resource_type, resource_key, claim_id),
  FOREIGN KEY (account_id, claim_id)
    REFERENCES agent_work_claim (account_id, claim_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, resource_type, resource_key)
    REFERENCES agent_coordination_resource (account_id, resource_type, resource_key)
);

CREATE INDEX agent_live_holder_claim_idx
  ON agent_live_claim_holder (account_id, claim_id, resource_type, resource_key);

CREATE INDEX agent_live_holder_resource_expiry_idx
  ON agent_live_claim_holder
  (account_id, resource_type, resource_key, lease_expires_at, claim_id);

CREATE INDEX agent_live_holder_account_expiry_idx
  ON agent_live_claim_holder
  (account_id, lease_expires_at, resource_type, resource_key, claim_id);

CREATE UNIQUE INDEX agent_one_live_exclusive_holder_uq
  ON agent_live_claim_holder (account_id, resource_type, resource_key)
  WHERE mode = 'EXCLUSIVE_WRITE';

CREATE TABLE agent_action_receipt (
  account_id                       bigint NOT NULL,
  receipt_id                       uuid NOT NULL,
  action_digest                    bytea NOT NULL CHECK (octet_length(action_digest) = 32),
  canonicalization_version         smallint NOT NULL CHECK (canonicalization_version > 0),
  action_kind                      text NOT NULL,
  receipt_status                   coordination_receipt_status NOT NULL,
  claim_id                         uuid NOT NULL,
  claim_generation                 bigint NOT NULL CHECK (claim_generation > 0),
  acceptance_generation            bigint NOT NULL CHECK (acceptance_generation > 0),
  source_change_cursor             text,
  result_hash                      bytea CHECK (result_hash IS NULL OR octet_length(result_hash) = 32),
  committed_revision_vector_hash   bytea CHECK (
    committed_revision_vector_hash IS NULL
    OR octet_length(committed_revision_vector_hash) = 32
  ),
  external_idempotency_key         text,
  accepted_at                      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at                       timestamptz,
  receipt_hash                     bytea NOT NULL CHECK (octet_length(receipt_hash) = 32),
  PRIMARY KEY (account_id, receipt_id),
  UNIQUE (account_id, action_digest, acceptance_generation),
  FOREIGN KEY (account_id, claim_id)
    REFERENCES agent_work_claim (account_id, claim_id),
  CHECK (expires_at IS NULL OR expires_at > accepted_at)
);

CREATE INDEX agent_action_receipt_status_idx
  ON agent_action_receipt (account_id, receipt_status, accepted_at, receipt_id);

CREATE TABLE agent_active_action_dedupe (
  account_id                 bigint NOT NULL,
  action_digest              bytea NOT NULL CHECK (octet_length(action_digest) = 32),
  acceptance_generation      bigint NOT NULL CHECK (acceptance_generation > 0),
  receipt_id                 uuid NOT NULL,
  dedupe_expires_at          timestamptz NOT NULL,
  intent_hash                bytea NOT NULL CHECK (octet_length(intent_hash) = 32),
  PRIMARY KEY (account_id, action_digest),
  UNIQUE (account_id, receipt_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_action_receipt (account_id, receipt_id)
);

CREATE TABLE agent_coordination_command (
  account_id                 bigint NOT NULL,
  principal_id               uuid NOT NULL,
  command_kind               text NOT NULL CHECK (
    command_kind IN (
      'ACQUIRE', 'RENEW', 'PREPARE', 'COMPLETE',
      'RELEASE', 'CANCEL_REQUEST', 'PROMOTE_REQUEST'
    )
  ),
  idempotency_key_hash       bytea NOT NULL CHECK (octet_length(idempotency_key_hash) = 32),
  command_request_hash       bytea NOT NULL CHECK (octet_length(command_request_hash) = 32),
  command_state              text NOT NULL CHECK (command_state IN ('PENDING', 'COMPLETED')),
  result_kind                text,
  result_ref                 uuid,
  result_hash                bytea CHECK (result_hash IS NULL OR octet_length(result_hash) = 32),
  created_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  replay_until               timestamptz NOT NULL,
  tombstone_until            timestamptz NOT NULL,
  PRIMARY KEY (account_id, principal_id, command_kind, idempotency_key_hash),
  CHECK (replay_until > created_at),
  CHECK (tombstone_until >= replay_until),
  CHECK (
    command_state <> 'COMPLETED'
    OR (result_kind IS NOT NULL AND result_ref IS NOT NULL AND result_hash IS NOT NULL)
  )
);

CREATE TABLE agent_tool_delivery_outbox (
  account_id                 bigint NOT NULL,
  delivery_id                uuid NOT NULL,
  receipt_id                 uuid NOT NULL,
  connector_id               uuid NOT NULL,
  external_idempotency_key   text NOT NULL,
  encrypted_payload_ref      text NOT NULL,
  payload_hash               bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  delivery_state             text NOT NULL CHECK (
    delivery_state IN (
      'PENDING', 'LEASED', 'HANDOFF', 'ACKNOWLEDGED',
      'RETRYABLE', 'CANCELLED', 'FAILED_FINAL'
    )
  ),
  lease_generation           bigint NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_owner_id             text,
  attempt_count              integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at               timestamptz NOT NULL DEFAULT transaction_timestamp(),
  lease_expires_at           timestamptz,
  last_error_code            text,
  created_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, delivery_id),
  UNIQUE (account_id, connector_id, external_idempotency_key),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_action_receipt (account_id, receipt_id),
  CHECK (
    delivery_state NOT IN ('LEASED', 'HANDOFF')
    OR (
      lease_generation > 0
      AND lease_owner_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
  )
);

CREATE INDEX agent_tool_outbox_dispatch_idx
  ON agent_tool_delivery_outbox
  (account_id, delivery_state, available_at, delivery_id)
  WHERE delivery_state IN ('PENDING', 'RETRYABLE');

CREATE INDEX agent_tool_outbox_lease_expiry_idx
  ON agent_tool_delivery_outbox
  (account_id, lease_expires_at, delivery_id)
  WHERE delivery_state IN ('LEASED', 'HANDOFF');

CREATE TABLE agent_tool_delivery_release (
  account_id                 bigint NOT NULL,
  delivery_id                uuid NOT NULL,
  lease_generation           bigint NOT NULL CHECK (lease_generation > 0),
  dispatcher_id              text NOT NULL,
  authorization_fence_hash   bytea NOT NULL CHECK (octet_length(authorization_fence_hash) = 32),
  release_hash               bytea NOT NULL CHECK (octet_length(release_hash) = 32),
  issued_at                  timestamptz NOT NULL,
  expires_at                 timestamptz NOT NULL,
  lease_expires_at           timestamptz NOT NULL,
  handed_off_at              timestamptz,
  PRIMARY KEY (account_id, delivery_id, lease_generation),
  FOREIGN KEY (account_id, delivery_id)
    REFERENCES agent_tool_delivery_outbox (account_id, delivery_id),
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= lease_expires_at),
  CHECK (handed_off_at IS NULL OR handed_off_at <= expires_at)
);

CREATE TABLE agent_coordination_audit_head (
  account_id                 bigint NOT NULL,
  stream_shard               smallint NOT NULL CHECK (stream_shard BETWEEN 0 AND 255),
  last_sequence              bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  genesis_hash               bytea NOT NULL CHECK (octet_length(genesis_hash) = 32),
  last_event_hash            bytea NOT NULL CHECK (octet_length(last_event_hash) = 32),
  updated_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, stream_shard)
);

CREATE TABLE agent_coordination_event (
  account_id                 bigint NOT NULL,
  stream_shard               smallint NOT NULL CHECK (stream_shard BETWEEN 0 AND 255),
  event_sequence             bigint NOT NULL CHECK (event_sequence > 0),
  event_id                   uuid NOT NULL,
  audit_schema_version       smallint NOT NULL CHECK (audit_schema_version > 0),
  previous_event_sequence    bigint NOT NULL CHECK (previous_event_sequence >= 0),
  request_id                 uuid,
  claim_id                   uuid,
  receipt_id                 uuid,
  actor_kind                 coordination_actor_kind NOT NULL,
  actor_subject_id           text NOT NULL,
  actor_session_id           uuid,
  initiator_principal_id     uuid,
  initiator_session_id       uuid,
  causation_hash             bytea NOT NULL CHECK (octet_length(causation_hash) = 32),
  event_type                 text NOT NULL,
  reason_codes               text[] NOT NULL DEFAULT '{}',
  resource_set_hash          bytea NOT NULL CHECK (octet_length(resource_set_hash) = 32),
  decision_input_hash        bytea NOT NULL CHECK (octet_length(decision_input_hash) = 32),
  previous_event_hash        bytea NOT NULL CHECK (octet_length(previous_event_hash) = 32),
  event_hash                 bytea NOT NULL CHECK (octet_length(event_hash) = 32),
  event_payload              jsonb NOT NULL,
  occurred_at                timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, stream_shard, event_sequence),
  UNIQUE (account_id, event_id),
  FOREIGN KEY (account_id, stream_shard)
    REFERENCES agent_coordination_audit_head (account_id, stream_shard),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_claim_request (account_id, request_id),
  FOREIGN KEY (account_id, claim_id)
    REFERENCES agent_work_claim (account_id, claim_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES agent_action_receipt (account_id, receipt_id),
  CHECK (actor_kind <> 'WORKLOAD' OR actor_session_id IS NOT NULL)
);

CREATE INDEX agent_coordination_event_claim_idx
  ON agent_coordination_event (account_id, claim_id, occurred_at, event_sequence)
  WHERE claim_id IS NOT NULL;

CREATE INDEX agent_coordination_event_time_idx
  ON agent_coordination_event (account_id, occurred_at, stream_shard, event_sequence);

CREATE TABLE agent_coordination_audit_checkpoint (
  account_id                 bigint NOT NULL,
  checkpoint_id              uuid NOT NULL,
  through_event_vector_hash  bytea NOT NULL CHECK (octet_length(through_event_vector_hash) = 32),
  signer_key_id              text NOT NULL,
  checkpoint_signature       bytea NOT NULL,
  immutable_archive_ref      text NOT NULL,
  signed_at                  timestamptz NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  UNIQUE (account_id, through_event_vector_hash)
);

CREATE TABLE agent_coordination_procedure_manifest (
  account_id                 bigint NOT NULL,
  manifest_id                uuid NOT NULL,
  procedure_id               uuid NOT NULL,
  procedure_version          bigint NOT NULL CHECK (procedure_version > 0),
  procedure_hash             bytea NOT NULL CHECK (octet_length(procedure_hash) = 32),
  embedding_model_id         text NOT NULL,
  embedding_dimension        smallint NOT NULL CHECK (embedding_dimension BETWEEN 1 AND 4096),
  embedding_metric           text NOT NULL CHECK (embedding_metric IN ('COSINE', 'L2', 'INNER_PRODUCT')),
  embedding_artifact_id      uuid NOT NULL,
  index_generation           bigint NOT NULL CHECK (index_generation > 0),
  source_watermark           bigint NOT NULL CHECK (source_watermark >= 0),
  access_policy_hash         bytea NOT NULL CHECK (octet_length(access_policy_hash) = 32),
  purpose_policy_hash        bytea NOT NULL CHECK (octet_length(purpose_policy_hash) = 32),
  applies_to_resource_types  coordination_resource_type[] NOT NULL,
  applies_to_reason_codes    text[] NOT NULL,
  review_status              text NOT NULL CHECK (review_status IN ('APPROVED', 'REVOKED')),
  valid_from                 timestamptz NOT NULL,
  valid_to                   timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (account_id, manifest_id),
  UNIQUE (account_id, procedure_id, procedure_version),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX agent_coordination_procedure_filter_idx
  ON agent_coordination_procedure_manifest
  (
    account_id, review_status, embedding_model_id, embedding_dimension,
    embedding_metric, index_generation, valid_from
  );
```

### 8.1 Tenant isolation

Every table enables and forces row-level security:

```sql
ALTER TABLE agent_work_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_work_claim FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_work_claim_tenant_policy ON agent_work_claim
  USING (account_id = mondaydb_trusted_account_id())
  WITH CHECK (account_id = mondaydb_trusted_account_id());
```

The same policy is mandatory for every table and every physical partition. `mondaydb_trusted_account_id()` reads extension-protected transaction context. Application roles receive no direct table DML; security-definer functions validate the verified session and pin a safe `search_path`.

RLS is defense in depth. Resolver and repository APIs must still require `account_id`, and all SQL templates must include an explicit account predicate so a planner cannot scan all partitions before filtering.

### 8.2 Acquisition transaction

The acquisition function:

```sql
-- Pseudocode: all values are already validated and tenant-scoped.
BEGIN;

SELECT leadership_epoch
FROM agent_tenant_write_leadership
WHERE account_id = :account_id
FOR SHARE;

-- server_claim_targets is derived only from the immutable intent and an exact
-- join to the tenant's authoritative business-resource catalog. GraphQL does
-- not supply this relation. It is cardinality-capped and sorted before use.
INSERT INTO agent_coordination_resource (...)
SELECT ...
FROM server_claim_targets
WHERE account_id = :account_id
ORDER BY resource_type, resource_key_hash, resource_key
ON CONFLICT (account_id, resource_type, resource_key) DO NOTHING;

SELECT 1
FROM agent_coordination_resource
WHERE account_id = :account_id
  AND (resource_type, resource_key) IN (:bounded_canonical_targets)
ORDER BY resource_type, resource_key_hash, resource_key
FOR UPDATE;

-- Materialize expiry, allocate queue tickets, compare revisions, check
-- bounded live-holder/live-waiter rows, fixed policy limits, and the active
-- action-dedupe locator.
-- Only inside the GRANTED branch, lock and consume an unexpired local capacity
-- reservation bound to account, principal, policy, generation, and request.
-- QUEUED/REJECTED release it; promotion must reserve again.
-- Insert either the complete granted claim or a durable queued decision.

COMMIT;
```

The target list is capped before SQL construction. Production uses an account-scoped temporary input relation or array unnest with a cardinality assertion, never an interpolated unbounded `IN` list. One global lock order covers tenant leadership, canonical resource rows, capacity reservation, active dedupe locator, claim row, and audit shard head. Resource creation and acquisition use the same server-sorted upsert order, so reversed client input cannot deadlock on unique-index insertion.

### 8.3 Protected write predicate

Every coordinated mutation loads the immutable typed intent and its bounded target relation, then invokes an internal assertion equivalent to:

```sql
-- Lock the authoritative tenant leadership row against regional promotion.
SELECT leadership_epoch
FROM agent_tenant_write_leadership
WHERE account_id = :account_id
FOR SHARE;

-- Lock the complete server-derived intent target set in canonical order.
SELECT r.account_id
FROM server_intent_targets AS i
JOIN agent_work_claim_target AS t
  ON t.account_id = i.account_id
 AND t.claim_id = :claim_id
 AND t.resource_type = i.resource_type
 AND t.resource_key = i.resource_key
JOIN agent_coordination_resource AS r
  ON r.account_id = t.account_id
 AND r.resource_type = t.resource_type
 AND r.resource_key = t.resource_key
WHERE i.account_id = :account_id
ORDER BY r.resource_type, r.resource_key_hash, r.resource_key
FOR UPDATE OF r;

-- Under those locks, fail unless the claim is live and bound to this exact
-- immutable intent. clock_timestamp() is intentionally not transaction start.
SELECT 1
FROM agent_work_claim AS c
WHERE c.account_id = :account_id
  AND c.claim_id = :claim_id
  AND c.principal_id = :trusted_principal_id
  AND c.session_id = :trusted_session_id
  AND c.generation = :claim_generation
  AND c.intent_id = :server_loaded_intent_id
  AND c.claim_state = 'PREPARED'
  AND c.lease_expires_at > clock_timestamp()
  AND c.preparation_expires_at > clock_timestamp()
FOR UPDATE;

-- Internal assertion: equal cardinality plus both anti-joins must prove that
-- every intent target, and no extra claim target, is present. Every mutation
-- target requires EXCLUSIVE_WRITE and matching leadership/fence/revision.
SELECT assert_exact_exclusive_target_set(
  account_id            => :account_id,
  claim_id              => :claim_id,
  immutable_intent_id   => :server_loaded_intent_id
);

SELECT assert_live_identity_authorization_policy_fences(
  account_id  => :account_id,
  principal_id => :trusted_principal_id,
  session_id   => :trusted_session_id,
  claim_id     => :claim_id
);

-- Execute the server-owned typed intent, advance every authoritative resource
-- revision, reserve the effect digest, and write receipt/outbox atomically.
SELECT execute_immutable_coordinated_intent(
  :account_id, :claim_id, :server_loaded_intent_id
);
```

Any failed assertion aborts the entire business transaction with a stable reason code. `assert_exact_exclusive_target_set` compares the intent and claim target counts, performs anti-joins in both directions, requires `EXCLUSIVE_WRITE`, and checks every target's captured epoch against `agent_tenant_write_leadership.leadership_epoch` as well as its `fence_token` and authoritative `resource_revision`. Regional promotion takes an update lock on the same tenant row, fences the old writer, increments the epoch once, and does not rewrite every resource. The statement and lock timeout must be less than the remaining claim lease; current database time is checked again immediately before business DML. No mutation may check a claim in one transaction and write in another.

### 8.4 Physical layout

- Hash-partition active request, target, claim, receipt, outbox, and event tables by `account_id`.
- Do not time-subpartition a relation whose tenant-local uniqueness key omits time; PostgreSQL cannot enforce that uniqueness across time children.
- Move terminal history through a verified archival transaction into separate account-hash-plus-time archival relations whose keys include archive time. Stable identity rows or validated logical references preserve audit linkage; admission never joins archival relations.
- Keep only live waiters, holders, and dedupe locators in admission tables.
- Store large payloads and tool responses outside hot tables behind content-addressed encrypted references.
- Lock `agent_active_action_dedupe` by exact tenant digest. On expiry, increment `acceptance_generation`, archive the old immutable receipt, and replace the locator atomically.
- Use a small fixed audit shard count derived from exact resource-set hash to avoid one tenant-global audit-head hot row.
- Never move active coordination state into eventually consistent columnar storage.

## 9. Open API GraphQL contract

`accountId` is explicit for API consistency and audit correlation, but the resolver must match it to trusted authentication context.

```graphql
scalar DateTime
scalar NonNegativeInt64
scalar SHA256

enum CoordinationResourceType {
  BOARD
  ITEM
  WORKFLOW_STEP
  AUTOMATION
  TOOL_TARGET
  CUSTOM
}

enum CoordinationClaimMode {
  SHARED_READ
  EXCLUSIVE_WRITE
}

enum CoordinationDecision {
  GRANTED
  QUEUED
  DEDUPLICATED
  CONFLICTED
  REJECTED
}

enum CoordinationCardKind {
  MONDAYDB_COORDINATION
}

enum CoordinationClaimState {
  GRANTED
  PREPARED
  COMPLETED
  RELEASED
  EXPIRED
  CANCELLED
  CONFLICTED
  REJECTED
}

enum CoordinationRequestState {
  PENDING
  QUEUED
  GRANTED
  DEDUPLICATED
  CONFLICTED
  CANCELLED
  REJECTED
}

enum CoordinationReceiptStatus {
  RESERVED
  COMMITTED
  OUTBOXED
  ACKNOWLEDGED
  CANCELLED
  FAILED_FINAL
}

enum CoordinationNextAction {
  PREPARE
  RENEW
  RELEASE
  WAIT_FOR_SIGNAL
  REFRESH_CONTEXT
  REUSE_RECEIPT
  STOP
}

enum CoordinationRiskClass {
  LOW
  MEDIUM
  HIGH
}

enum CoordinationProcedureReviewStatus {
  APPROVED
  REVOKED
}

enum CoordinationEmbeddingMetric {
  COSINE
  L2
  INNER_PRODUCT
}

enum CoordinationStopReason {
  AGENT_STOPPED
  CONTEXT_STALE
  SUPERSEDED
  OPERATOR_CANCELLED
  POLICY_REVOKED
  TENANT_KILL_SWITCH
}

enum CoordinationReasonCode {
  GRANTED_ALL_TARGETS
  ACTION_ALREADY_ACCEPTED
  INCOMPATIBLE_ACTIVE_CLAIM
  EARLIER_WAITER
  RESOURCE_REVISION_CHANGED
  SOURCE_CURSOR_STALE
  CLAIM_EXPIRED
  FENCE_TOKEN_MISMATCH
  TARGET_LIMIT_EXCEEDED
  TARGET_NOT_CANONICAL
  POLICY_NOT_FOUND
  POLICY_FENCE_CHANGED
  IDENTITY_SESSION_INVALID
  AUTHORIZATION_FENCE_CHANGED
  BUDGET_NOT_RESERVED
  PRINCIPAL_CONCURRENCY_EXCEEDED
  ACCOUNT_CONCURRENCY_EXCEEDED
  RENEWAL_LIMIT_EXCEEDED
  DEADLINE_EXPIRED
  UNBOUNDED_REQUEST_REJECTED
}

input AcquireWorkClaimInput {
  accountId: ID!
  sessionId: ID!
  policyId: ID!
  idempotencyKey: String!
  intentId: ID!
  sourceChangeCursor: String
  deadline: DateTime!
}

input CoordinationPreflightInput {
  accountId: ID!
  sessionId: ID!
  policyId: ID!
  intentId: ID!
  sourceChangeCursor: String
  deadline: DateTime!
}

input ClaimTargetFenceInput {
  resourceType: CoordinationResourceType!
  resourceKeyHash: SHA256!
  expectedRevision: NonNegativeInt64!
  leadershipEpoch: NonNegativeInt64!
  fenceToken: NonNegativeInt64!
}

input PrepareCoordinatedActionInput {
  accountId: ID!
  sessionId: ID!
  claimId: ID!
  claimGeneration: NonNegativeInt64!
  intentId: ID!
  idempotencyKey: String!
  targetFences: [ClaimTargetFenceInput!]!
}

input CompleteCoordinatedActionInput {
  accountId: ID!
  sessionId: ID!
  claimId: ID!
  claimGeneration: NonNegativeInt64!
  preparationHash: SHA256!
  idempotencyKey: String!
}

type CoordinationTargetFence {
  resourceType: CoordinationResourceType!
  resourceKeyHash: SHA256!
  mode: CoordinationClaimMode!
  expectedRevision: NonNegativeInt64!
  observedRevision: NonNegativeInt64!
  leadershipEpoch: NonNegativeInt64!
  fenceToken: NonNegativeInt64!
  queueSequence: NonNegativeInt64!
}

type ClaimBlocker {
  resourceType: CoordinationResourceType!
  resourceKeyHash: SHA256!
  reasonCode: CoordinationReasonCode!
  blockingClaimRef: String
  retryAfter: DateTime
}

type WorkClaim {
  claimId: ID!
  requestId: ID!
  state: CoordinationClaimState!
  generation: NonNegativeInt64!
  actionDigest: SHA256!
  intentId: ID!
  targets: [CoordinationTargetFence!]!
  grantedAt: DateTime!
  leaseExpiresAt: DateTime!
  renewalCount: Int!
  claimSnapshotHash: SHA256!
}

type WorkClaimRequest {
  requestId: ID!
  state: CoordinationRequestState!
  actionDigest: SHA256!
  targetSetHash: SHA256!
  queuedAt: DateTime
  retryAfter: DateTime
}

type ActionReceipt {
  receiptId: ID!
  actionDigest: SHA256!
  actionKind: String!
  status: CoordinationReceiptStatus!
  acceptanceGeneration: NonNegativeInt64!
  resultHash: SHA256
  sourceChangeCursor: String
  acceptedAt: DateTime!
  receiptHash: SHA256!
}

type CoordinationPerceptionCard {
  kind: CoordinationCardKind!
  request: WorkClaimRequest!
  decision: CoordinationDecision!
  reasonCodes: [CoordinationReasonCode!]!
  claim: WorkClaim
  existingReceipt: ActionReceipt
  receiptVisible: Boolean!
  blockers: [ClaimBlocker!]!
  retryPolicyRef: ID
  refreshRequired: Boolean!
  coordinationDepth: Int!
  remainingCoordinationDepth: Int!
  allowedNextActions: [CoordinationNextAction!]!
  auditEventId: ID!
  packetHash: SHA256!
}

type CoordinationPreflight {
  admissible: Boolean!
  estimatedLockedResources: Int!
  estimatedWaitersInspected: Int!
  currentRevisionVectorHash: SHA256!
  existingReceipt: ActionReceipt
  reasonCodes: [CoordinationReasonCode!]!
  expiresAt: DateTime!
  preflightHash: SHA256!
}

type CoordinationProcedureCard {
  manifestId: ID!
  procedureId: ID!
  version: NonNegativeInt64!
  title: String!
  instructionSummary: String!
  riskClass: CoordinationRiskClass!
  reviewStatus: CoordinationProcedureReviewStatus!
  embeddingModelId: ID!
  embeddingDimension: Int!
  embeddingMetric: CoordinationEmbeddingMetric!
  indexGeneration: NonNegativeInt64!
  sourceWatermark: NonNegativeInt64!
  accessPolicyHash: SHA256!
  purposePolicyHash: SHA256!
  contentHash: SHA256!
  semanticScore: Float
}

type CoordinationProcedure {
  manifestId: ID!
  procedureId: ID!
  version: NonNegativeInt64!
  title: String!
  instructions: [String!]!
  riskClass: CoordinationRiskClass!
  reviewStatus: CoordinationProcedureReviewStatus!
  contentHash: SHA256!
  sourceWatermark: NonNegativeInt64!
}

type CoordinatedPreparation {
  claimId: ID!
  preparationHash: SHA256!
  expiresAt: DateTime!
  revisionVectorHash: SHA256!
  auditEventId: ID!
}

extend type Query {
  coordinationPreflight(input: CoordinationPreflightInput!): CoordinationPreflight!

  coordinationRequest(
    accountId: ID!
    sessionId: ID!
    requestId: ID!
  ): CoordinationPerceptionCard!

  coordinationProcedures(
    accountId: ID!
    sessionId: ID!
    reasonCodes: [CoordinationReasonCode!]!
    resourceTypes: [CoordinationResourceType!]!
    queryText: String!
    topK: Int! = 5
  ): [CoordinationProcedureCard!]!

  coordinationProcedure(
    accountId: ID!
    sessionId: ID!
    procedureId: ID!
    version: NonNegativeInt64!
    contentHash: SHA256!
  ): CoordinationProcedure
}

extend type Mutation {
  acquireWorkClaim(input: AcquireWorkClaimInput!): CoordinationPerceptionCard!

  renewWorkClaim(
    accountId: ID!
    sessionId: ID!
    claimId: ID!
    claimGeneration: NonNegativeInt64!
    idempotencyKey: String!
  ): CoordinationPerceptionCard!

  prepareCoordinatedAction(
    input: PrepareCoordinatedActionInput!
  ): CoordinatedPreparation!

  completeCoordinatedAction(
    input: CompleteCoordinatedActionInput!
  ): ActionReceipt!

  releaseWorkClaim(
    accountId: ID!
    sessionId: ID!
    claimId: ID!
    claimGeneration: NonNegativeInt64!
    idempotencyKey: String!
    reasonCode: CoordinationStopReason!
    operatorNoteRef: ID
  ): CoordinationPerceptionCard!

  cancelWorkClaimRequest(
    accountId: ID!
    sessionId: ID!
    requestId: ID!
    idempotencyKey: String!
    reasonCode: CoordinationStopReason!
    operatorNoteRef: ID
  ): CoordinationPerceptionCard!

  promoteWorkClaimRequest(
    accountId: ID!
    sessionId: ID!
    requestId: ID!
    idempotencyKey: String!
  ): CoordinationPerceptionCard!
}
```

### GraphQL limits

- Intent-derived targets: default policy ceiling 16, hard product ceiling 64; the client cannot supply or broaden them at acquisition.
- `topK`: default 5, hard ceiling 20.
- `queryText`: 2 KiB after normalization.
- `blockers`: at most 16 redacted records.
- Query depth and complexity are charged before resolver execution.
- Bulk claim acquisition is not exposed in version 1.
- Every mutation requires a unique idempotency key and verified session.
- `promoteWorkClaimRequest` re-evaluates the complete queued request atomically; it never grants a subset. Internal Change Watch wakeups invoke the same command.
- Introspection never exposes raw claim rows from another principal unless support policy explicitly authorizes it.
- Procedure search authorizes purpose/access before embedding. Query text is DLP-screened, sent only to an approved tenant-region model, never written to general logs, and retained only as its request hash.
- Release/cancel accepts only `CoordinationStopReason`; an optional operator note is a pre-authorized, DLP-screened encrypted reference capped by policy, never arbitrary inline prose.

## 10. Procedural memory

Procedural memory stores reviewed instructions for deterministic coordination outcomes, for example:

- refresh an item after `RESOURCE_REVISION_CHANGED`;
- wait for a change signal after `EARLIER_WAITER`;
- reuse a receipt after `ACTION_ALREADY_ACCEPTED`;
- stop and escalate after repeated policy-fence changes;
- reconcile an acknowledged external delivery;
- apply an approved compensation workflow.

Procedure content is versioned, content-addressed, review-gated, and account-scoped. A procedure can recommend the next API call, but cannot:

- create or transfer a claim;
- increase priority, lease, target count, recursion, or budget;
- bypass a revision or authorization fence;
- alter an action digest;
- turn a semantic similarity into a dedupe decision.

The perception card exposes procedure IDs, deterministic reason codes, allowed next actions, and content hashes. An LLM perceives a small explicit state machine rather than inferring ownership from prose.

## 11. Semantic retrieval and HNSW compatibility

Semantic retrieval is useful for finding approved operator runbooks and similar historical contention explanations. It is deliberately outside the live admission path.

Recommended vector object:

```ts
export interface CoordinationProcedureEmbedding {
  accountId: AccountId;
  manifestId: string;
  procedureId: string;
  procedureVersion: NonNegativeInt64String;
  embeddingModelId: string;
  embeddingDimension: number;
  embeddingMetric: "COSINE" | "L2" | "INNER_PRODUCT";
  embeddingArtifactId: string;
  indexGeneration: NonNegativeInt64String;
  reasonCodes: readonly CoordinationReasonCode[];
  resourceTypes: readonly CoordinationResourceType[];
  riskClass: "LOW" | "MEDIUM" | "HIGH";
  reviewStatus: "APPROVED" | "REVOKED";
  sourceWatermark: NonNegativeInt64String;
  accessPolicyHash: Sha256;
  purposePolicyHash: Sha256;
  contentHash: Sha256;
}
```

Retrieval pipeline:

1. Authorize the query before embedding, then require exact `account_id`, approved manifest, model ID, dimension, metric, index generation, reason-code filter, policy hashes, source watermark, and validity interval.
2. Probe only account-owned HNSW partitions.
3. Cap `topK`, `ef_search`, overfetch, wall time, and vector probes through Query Governor.
4. Exact-postfilter every candidate against row-store visibility, review status, current version, purpose, and source watermark.
5. Return metadata and content hashes; fetch procedure bodies through authorized point lookups.
6. Reject on missing or stale account partitions. Never fall back to a global vector search or row scan.

HNSW does not index live resource keys, action digests, ownership, or authorization decisions. Approximate nearest-neighbor results cannot grant, block, deduplicate, renew, or release a claim.

## 12. Agent perception

An agent should perceive coordination as a compact, typed card:

```json
{
  "kind": "MONDAYDB_COORDINATION",
  "request": {
    "requestId": "request:018f…",
    "state": "QUEUED",
    "actionDigest": "sha256:…",
    "targetSetHash": "sha256:…",
    "queuedAt": "2026-07-22T00:02:58Z",
    "retryAfter": "2026-07-22T00:03:00Z"
  },
  "decision": "QUEUED",
  "receiptVisible": false,
  "reasonCodes": ["EARLIER_WAITER"],
  "blockers": [
    {
      "resourceType": "ITEM",
      "resourceKeyHash": "sha256:…",
      "reasonCode": "EARLIER_WAITER",
      "retryAfter": "2026-07-22T00:03:00Z"
    }
  ],
  "refreshRequired": false,
  "coordinationDepth": 0,
  "remainingCoordinationDepth": 2,
  "allowedNextActions": ["WAIT_FOR_SIGNAL", "STOP"],
  "retryPolicyRef": "procedure:coordination-wait:v3",
  "auditEventId": "event:0190…",
  "packetHash": "sha256:…"
}
```

Metadata tags useful to an LLM:

- decision and stable reason codes;
- exact resource type, but only hashed resource identity where disclosure is unnecessary;
- claim lease and generation;
- observed and expected revisions;
- retry-after and whether refresh is required;
- allowed next actions;
- procedure version and content hash;
- source cursor and freshness watermark;
- remaining coordination budget;
- audit event and packet hashes.

The card does not include another agent's prompt, chain of thought, memory, raw identity, or business payload.

## 13. ACID and consistency

### Row store

- Resource revisions, claim grants, fence increments, action receipts, business writes, and outbox insertion use serializable or equivalent explicitly locked transactions.
- A claim is not a substitute for row-level write conflict detection.
- Every human, legacy, and autonomous writer to an opted-in resource invokes the same revision-advancing business mutation primitive.
- The exact write path is linearizable at transaction commit for the claimed resource.
- Multi-resource acquisition locks a bounded, canonically ordered set.
- Tenant writes route to one leader region. Promotion requires quorum-synchronous RPO=0 recovery, fences the prior leader, and increments `leadership_epoch` before claims resume; split-brain uncertainty fails protected writes closed.

### Columnar store

- Columnar projections are not claim authorities.
- Analytical agents may coordinate on a row-store snapshot watermark, then query columnar data at or after the required freshness envelope.
- A columnar result cannot prove that an item remains writable.
- High-fanout analytical work uses Query Governor and workload isolation rather than claims on every row.

### Vector store

- Vector search discovers context or procedures; exact row-store postchecks establish visibility and revision.
- HNSW lag is surfaced as metadata and never hidden by a claim.
- A vector result cannot create a conflict domain from approximate similarity.

### External tools

- The row transaction accepts one action digest and creates one outbox record.
- Acceptance also atomically consumes the triggering cursor or advances the protected workflow revision, so a later different claim cannot repeat the same source effect.
- Dispatch is at-least-once.
- Connector adapters must propagate stable external idempotency keys where supported.
- In one transaction before each connector attempt, Tool Execution rechecks identity, access, purpose, delegation, consent, and runtime fence epochs, increments the outbox lease generation, records the dispatcher owner, and issues a release token bound to that generation; failure deterministically cancels undelivered work.
- Release-token commit is the authorization point of no return, and token expiry is never later than its owning lease expiry. The connector gateway must first compare-and-swap the current generation from `LEASED` to `HANDOFF`, persist `handed_off_at` while both token and lease are live, commit, and then begin I/O; no database lock or transaction remains open during I/O.
- Reconciliation records provider acknowledgement IDs and hashes.
- Provider acceptance is the physical-effect point of no return. Release-token commit is the authorization point; later revocation may trigger a policy-approved compensation, but cannot rewrite the historical receipt.
- Crashed delivery leases are reclaimed through the account-leading lease-expiry index in fixed-size batches. Reclamation increments the generation before another owner may send; stale workers cannot enter `HANDOFF` or record acknowledgement/retry because every transition compare-and-swaps `(account_id, delivery_id, lease_generation, lease_owner_id)`. Expired `HANDOFF` attempts are reconciled before retry, and retries keep the same provider idempotency key.
- For providers without idempotency support, policy may require human confirmation or a read-before-retry compensator. mondayDB must not advertise exactly-once.

## 14. Guardrails and neighbor protection

### Admission budgets

Each request has deterministic ceilings for:

- target count;
- active claims per account and principal;
- queued requests per resource and account;
- lease duration and renewals;
- resources locked per transaction;
- waiters inspected per target;
- transaction wall time;
- claim acquisition retries;
- recursive procedure/tool depth;
- tool calls and external retries;
- semantic `topK`, overfetch, `ef_search`, and probe count;
- response bytes and blocker count.

Budgets use integer counters and decimal-string 64-bit values at API boundaries. No floating-point estimate authorizes work.

Account capacity is represented by preallocated tenant-global slot rows, and principal capacity by one tenant-global account-leading counter row. `agent_coordination_global_limit` is authoritative across every policy and version; policy-specific isolation is enforced by Query Governor cost budgets, not another claim-count ceiling. Reservation locks the principal counter, claims the lowest indexed `FREE` slot with `FOR UPDATE SKIP LOCKED`, binds the active policy/version to that slot, and increments `reserved_count`. Only a complete grant converts the slot/counter to active; queue/reject returns the slot in the same transaction. Release/expiry returns it and decrements `active_count`; promotion repeats admission. A limit reduction locks the global-limit row, marks free excess slots `RETIRED`, sets `retire_on_release` on enough occupied slots to drain the remainder, and persists `retirement_pending_count`; those slots become `RETIRED`, not `FREE`, when released. Admission therefore enforces reductions without counting history. Increases provision new slots before publishing the higher limit.

### Recursive-agent containment

- A procedure-triggered claim increments `coordinationDepth`.
- Default maximum depth is 2; hard ceiling is policy-owned.
- A child action carries its parent action digest and ancestry hash.
- Repeated `(action_digest, resource_set_hash)` in one ancestry is rejected.
- Claims cannot recursively acquire broader resource scopes.
- An agent cannot renew while waiting for itself or a descendant.
- Tool callbacks cannot bypass the original purpose and runtime envelopes.

Parent digest, ancestry hash, and depth are derived from trusted runtime causation, persisted on `agent_claim_request`, included in `request_hash`, and checked transactionally before queue insertion. The client never supplies this lineage. The perception card exposes only depth and remaining depth, not another agent's ancestry.

### Contention controls

- Requests beyond per-resource waiter limits are rejected before insertion.
- Compatibility reads `active_shared_count` and `active_exclusive_claim_id` from the locked resource row; grant/release/expiry updates those summaries and live-holder rows atomically. A partial unique index independently forbids two live exclusive holders.
- Agents receive `retryAfter` and must not poll faster than policy permits.
- Change Watch should wake queued work; GraphQL polling is the fallback.
- Lease holders that repeatedly expire lose concurrency capacity through deterministic policy, not model judgment.
- Hot resources may move to a dedicated tenant-local queue shard; never to a global queue.
- Support cancellation increments a fence before exposing success.

### Rejected query shapes

Reject before execution:

- missing or wildcard `account_id`;
- non-canonical or prompt-derived resource keys;
- target lists above the policy limit;
- requests without expected revisions for writes;
- unbounded queue history or claim-history exports;
- arbitrary JSONPath filters on hot claim tables;
- semantic dedupe or vector ownership checks;
- global HNSW search;
- GraphQL aliases used to multiply claim mutations;
- nested claim acquisition from a resolver;
- any fallback that scans a board to discover claim targets.

## 15. Performance check for boards with 1M+ rows

### Full-table-scan risks

The following proposals are unsafe and must be blocked:

1. Discovering targets by scanning items that match an LLM-generated predicate.
2. Acquiring one claim per row for an analytical aggregation.
3. Looking for duplicates by comparing JSON payloads without an action digest index.
4. Listing all claims for a board without a bounded cursor and time range.
5. Expiring claims with an account-wide synchronous sweep on every request.
6. Searching procedures without an account-partitioned HNSW route and exact filters.
7. Joining claim state to a schemaless board value through an unindexed JSON expression.

### Required access paths

| Operation | Required leading access path | Complexity target |
|---|---|---|
| Resource lookup | `(account_id, resource_type, resource_key)` | bounded point lookup |
| Waiter order | live table `(account_id, resource_type, resource_key, request_rank, queue_sequence)` | bounded range |
| Active compatibility | resource PK summary plus exclusive-holder partial unique index | point lookup |
| Account capacity | indexed free tenant-global slot | bounded `LIMIT 1` lock |
| Principal capacity | `(account_id, principal_id)` counter | point lock |
| Dedupe | active locator PK `(account_id, action_digest)` | point lookup |
| Outbox dispatch | `(account_id, delivery_state, available_at)` | bounded cursor |
| Claim audit | `(account_id, claim_id, occurred_at, event_sequence)` | bounded cursor |
| Procedure retrieval | account-owned HNSW partition plus exact postfilter | bounded ANN |

For a million-row board, coordination cost scales with the requested target count and local contention, not board cardinality. Aggregations use columnar snapshots and one workflow-level claim or revision watermark, not a million item claims.

### Planner enforcement

- Prepared statements include explicit `account_id`.
- CI inspects representative `EXPLAIN (FORMAT JSON)` plans.
- Ship gates reject sequential scans on active coordination tables for production query templates.
- Partition pruning and row estimates are tested for large and skewed tenants.
- Runtime cancels any plan whose inspected rows exceed its reservation.
- Statistics are maintained per account hash partition and hot-resource index.

## 16. Auditability and replay

Each event hash is:

```text
event_hash = SHA256(
  audit_schema_version ||
  account_id ||
  stream_shard ||
  event_sequence ||
  event_id ||
  previous_event_sequence ||
  request_id ||
  claim_id ||
  receipt_id ||
  event_type ||
  actor_kind ||
  actor_subject_id ||
  actor_session_id ||
  initiator_principal_id ||
  initiator_session_id ||
  causation_hash ||
  resource_set_hash ||
  decision_input_hash ||
  reason_codes ||
  canonical_event_payload ||
  previous_event_hash ||
  occurred_at
)
```

Each shard starts from a versioned tenant genesis hash. `previous_event_sequence` must equal `event_sequence - 1` and `previous_event_hash` must equal the locked head before append. Application roles have no `UPDATE` or `DELETE` privilege on events, heads, or checkpoints; a narrowly scoped append function is the only writer. mondayDB periodically signs the vector of tenant shard heads with a rotated platform key and writes the checkpoint to immutable/WORM storage. This does not make a database superuser harmless, but it makes retroactive rewriting detectable against an independently anchored checkpoint.

`actor_kind` distinguishes verified workloads, human operators, and platform services. Expiry and internal wakeup use a named platform-service subject; support cancellation uses the operator subject; delegated automation also records initiator and causation hashes. A synthetic workload UUID is never used to hide a system transition.

Replay requires:

- policy version and hash;
- trusted identity and authorization fence vector;
- canonical target set and expected revisions;
- per-resource queue sequences;
- active-claim snapshots considered;
- resource fence tokens;
- budget reservation hash;
- source cursor;
- action digest and canonicalization version;
- transaction or outbox receipt;
- event chain.

Replay recomputes the decision without contacting an LLM, embedding model, or external provider. Tool acknowledgement is evidence, not a condition that changes the historical admission decision.

Audit payloads contain hashes or encrypted references for prompts, business values, tool payloads, and resource keys. They do not store chain of thought. Cryptographic erasure destroys payload-reference keys while retaining versioned non-identifying tombstones, predecessor hashes, and checkpoint continuity where legally permitted; relational history is archived as a chain-preserving unit rather than deleted through broken foreign keys.

## 17. Threat and failure analysis

| Failure or attack | Deterministic response |
|---|---|
| Two agents observe the same item revision | Only one exclusive grant wins; the other queues or conflicts. |
| Expired worker resumes | Current resource fencing token rejects its commit. |
| Agent retries after response loss | Idempotency key returns the existing claim decision or receipt. |
| Two different requests encode the same effect | Unique tenant action digest returns one receipt. |
| Two intentional repeats have identical content | Distinct trusted effect-occurrence IDs produce distinct digests. |
| Action digest collision attempt | SHA-256 plus canonical version; conflicting payload hash is a security event and fails closed. |
| Agent submits fake high priority | Priority is loaded from policy, never input. |
| Agent claims another tenant's resource ID | Trusted tenant match, account-leading lookup, RLS, and tenant FK reject it. |
| Agent claims broad wildcard scope | Canonical exact target validation rejects it. |
| Multi-target deadlock | Bounded canonical row-lock order. |
| Claim holder crashes | Lease enables progress; fencing token preserves safety. |
| Database failover or split-brain risk | Single-writer routing, quorum-synchronous RPO=0 recovery, old-leader fencing, and a new leadership epoch precede claim resumption; uncertainty fails closed. |
| Authorization revoked during lease | Result release rechecks fence epochs and rejects. |
| Queue polling storm | Retry-after, Query Governor charge, aliases/complexity limits, Change Watch wakeup. |
| Poisoned procedural memory | Only approved versioned manifests; exact postfilter; procedures cannot grant. |
| Stale vector partition | Retrieval rejects or omits hints; coordination still uses row state. |
| External provider times out after success | Stable idempotency key and reconciliation; no false exactly-once claim. |
| Malicious blocker enumeration | Redacted opaque blocker refs and bounded responses. |
| Audit-head hot spot | Tenant-local deterministic stream sharding. |
| One hot board starves neighbors | Per-resource queues, tenant budgets, workload isolation, bounded lock time. |

## 18. Observability and SLOs

Metrics are labeled by account hash bucket, policy, resource type, decision, and reason code. Raw account IDs, resource keys, prompts, and payloads are excluded from general telemetry.

Required metrics:

- acquisition latency p50/p95/p99;
- granted, queued, deduplicated, conflicted, and rejected rates;
- local queue depth and oldest waiter age;
- lease expiry and renewal rates;
- stale-fence commit attempts;
- revision-conflict rate;
- action-receipt reuse rate;
- outbox age, retries, and final failures;
- rows inspected and lock wait per acquisition;
- semantic procedure retrieval latency and postfilter rejection;
- audit append latency and chain verification failures.
- opted-in human-write revision overhead and kill-switch state.

Initial objectives:

- no cross-tenant decision or index probe;
- no accepted write with stale fence or revision;
- p99 point-target preflight within the interactive query budget;
- claim acquisition lock hold bounded independently of model/tool latency;
- coordination failures do not reduce unprotected human data-plane availability;
- opted-in human writes retain 99.99% availability, add at most 2 ms p99 internal revision overhead, and continue under the autonomous-grant kill switch;
- zero full-board scans in production coordination templates.

## 19. Rollout

### Phase 1: shadow decisions

- Compute action digests, canonical targets, revisions, and predicted contention.
- Do not block existing agent writes.
- Compare predicted duplicate/conflict decisions with actual outcomes.
- Verify account-leading plans, RLS, audit chains, and SLO cost.

### Phase 2: duplicate receipts and single-item fencing

- Enforce action receipts and `EXCLUSIVE_WRITE` claims for idempotent internal actions.
- Start with one item target and short leases.
- Integrate Change Watch source cursors and Transaction Intent.
- Require stable tool idempotency keys for selected connectors.

### Phase 3: bounded multi-resource coordination

- Enable all-or-none claims up to a small target ceiling.
- Enforce canonical lock order, fairness, revision vectors, and principal capacity.
- Add approved procedural retrieval and contention perception cards.
- Run adversarial expiry, failover, and retry tests.

### Phase 4: Open API

- Expose tenant-admin policy management separately from runtime claim APIs.
- Publish GraphQL complexity, rate, target, lease, and retention limits.
- Require workload identity attestation for autonomous mutations.
- Keep unsupported providers and conflict domains fail closed.

## 20. Ship criteria

### Contract validation

- TypeScript contracts compile in strict mode without numeric coercion of 64-bit values.
- GraphQL SDL builds with the monday.com Open API schema.
- SQL parses and executes on the supported PostgreSQL-compatible row engine.
- Every table, partition, PK, FK, unique constraint, and production index is account-leading.
- Every relation and partition has `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- Application roles cannot set trusted tenant context or directly mutate coordination tables.

### Behavioral validation

- Simultaneous exclusive requests produce one winner and one queued/conflicted decision.
- Simultaneous identical actions produce one receipt.
- Expired and cancelled fence tokens cannot commit.
- Revision changes between acquire and prepare, and prepare and commit, abort atomically.
- Multi-target requests grant all or none and do not deadlock under reversed input order.
- Lost GraphQL responses are safely replayed through idempotency.
- Authorization revocation during a lease blocks result release.
- Lost responses for renew, prepare, complete, release, cancel, and promote replay one durable command result without duplicate transitions.
- Tool timeout-after-success reconciles without changing the action digest.
- Queue fairness and capacity limits are deterministic under load.
- Audit replay reproduces every decision without AI or external calls.

### Scale and failure validation

- Explain plans for 1M+ row boards use tenant-leading point/range indexes.
- No acquisition path performs account-wide expiry cleanup.
- Hot-resource load cannot exhaust another account's workers, connections, vector probes, or audit heads.
- Regional failover preserves monotonic fence tokens and accepted receipts.
- Tenant leadership promotion invalidates every prior-epoch claim without scanning or rewriting resource rows.
- HNSW outage affects only optional procedure discovery.
- Database, security, API, and SRE reviewers approve the threat model and failure behavior.

## 21. Product decision

Ship multi-agent coordination as a **deterministic tenant-local claim and fencing service inside mondayDB's transactional control plane**, not as agent-to-agent negotiation and not as a global lock manager.

The key product promise is precise: mondayDB prevents stale or duplicate autonomous acceptance at its own transaction boundary, provides stable idempotency for external effects, and makes every decision replayable. It does not pretend that probabilistic agents or arbitrary external tools become exactly-once systems.
