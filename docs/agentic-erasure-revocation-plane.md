# Agentic Erasure and Revocation Plane

## Why this belongs in mondayDB

An agentic database creates more durable derivatives than a traditional row store:
embeddings, HNSW nodes, context packets, semantic caches, compacted memories,
procedures, and tool traces. Deleting the source row without governing those
derivatives lets an agent retrieve knowledge that a user believes is gone.

The product trade-off is immediate safety versus immediate physical deletion.
Synchronously rewriting every columnar segment and HNSW graph would increase write
latency and couple ACID availability to asynchronous systems. mondayDB should instead:

1. commit a **revocation fence** with the source transaction;
2. make every read path enforce that fence immediately and deterministically; and
3. physically purge derivatives asynchronously, with a bounded and auditable SLA.

This preserves row-store availability while giving enterprise customers a precise
guarantee: data becomes ineligible for agent perception at the committed revocation
epoch, even if encrypted bytes remain in a compaction backlog.

### Product guarantees

- **No tenant leakage:** every key, lookup, index partition, worker lease, and audit
  event is scoped by `account_id`.
- **Deterministic denial:** the same principal, policy version, source watermark, and
  revocation epoch produce the same visibility decision.
- **ACID safety boundary:** the request, fence, epoch increment, and first audit event
  commit in one row-store transaction.
- **No resurrection:** delayed embedding or compaction jobs cannot publish artifacts
  built before the fence.
- **Queryable proof:** the Open API returns a receipt containing target states,
  watermarks, deadlines, and hashes, but never deleted content.
- **Predictable load:** purge workers use indexed locators, fixed batches, tenant
  quotas, and workload admission. They never discover derivatives with table scans.

## Scope and terminology

An **erasure request** names an exact source object, object set, principal, or
retention cohort. A **revocation fence** is the synchronous visibility barrier. A
**derivation locator** maps a source identity to every materialized derivative. A
**purge target** tracks physical removal from one storage layer.

The first release should support exact object and principal scopes. Predicate-based
erasure is deliberately excluded: an open-ended predicate can become a hidden full
scan and its membership can change between retries. Cohort erasure is accepted only
when membership was materialized by a bounded retention workflow.

## TypeScript contracts

IDs are opaque strings at the API boundary. Epochs, row estimates, and byte estimates
are decimal strings because GraphQL and JavaScript cannot safely represent all 64-bit
integers.

```ts
type ErasureScope =
  | {
      kind: "OBJECT";
      objectType: "BOARD_ITEM" | "UPDATE" | "FILE" | "MEMORY" | "PROCEDURE";
      objectId: string;
    }
  | {
      kind: "PRINCIPAL";
      principalType: "USER" | "AGENT";
      principalId: string;
    }
  | {
      kind: "MATERIALIZED_COHORT";
      cohortId: string;
      membershipWatermark: string;
    };

type ErasureReason =
  | "USER_REQUEST"
  | "RETENTION_EXPIRY"
  | "POLICY_REVOCATION"
  | "SECURITY_RESPONSE"
  | "SOURCE_DELETED";

interface AgenticErasureRequest {
  accountId: string;
  requestId: string;
  idempotencyKey: string;
  scope: ErasureScope;
  reason: ErasureReason;
  requestedByPrincipalId: string;
  policyVersion: string;
  state: "PENDING" | "REVOKED" | "PURGING" | "PURGED" | "FAILED";
  revocationEpoch?: string;
  purgeDeadlineAt: string;
  createdAt: string;
  updatedAt: string;
}

interface RevocationFence {
  accountId: string;
  fenceId: string;
  requestId: string;
  sourceKeyHash: string;
  revokedAtEpoch: string;
  sourceWatermark: string;
  policyVersion: string;
  decisionHash: string;
  createdAt: string;
}

type ErasureTargetKind =
  | "ROW"
  | "COLUMNAR"
  | "VECTOR"
  | "SEMANTIC_CACHE"
  | "CONTEXT_PACKET"
  | "MEMORY_CAPSULE"
  | "PROCEDURE"
  | "TOOL_TRACE"
  | "OBJECT_STORE"
  | "BACKUP";

interface ErasureTargetState {
  accountId: string;
  requestId: string;
  targetKind: ErasureTargetKind;
  physicalPartition: string;
  artifactCount: string;
  estimatedBytes: string;
  state: "DISCOVERED" | "LEASED" | "PURGED" | "COMPACTED" | "FAILED";
  attempts: number;
  targetWatermark?: string;
  lastErrorCode?: string;
  updatedAt: string;
}

interface ErasurePerceptionCard {
  requestId: string;
  scopeKind: ErasureScope["kind"];
  visibility: "REVOKED";
  revocationEpoch: string;
  physicalPurgeState: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "DELAYED";
  completedTargets: ErasureTargetKind[];
  pendingTargets: ErasureTargetKind[];
  omissionReasons: string[];
  forbiddenActions: Array<
    | "RETRIEVE_CONTENT"
    | "RECONSTRUCT_FROM_DERIVATIVES"
    | "REEMBED"
    | "RETRY_TOOL_WITH_REVOKED_CONTEXT"
  >;
  nextStatusCheckAfter: string;
  receiptHash: string;
}
```

The perception card tells an LLM only what it may operationally know. It does not
include the erased value, embedding, free-form reason, or raw identifiers from other
systems. An agent sees an explicit omission reason instead of interpreting missing
context as an invitation to broaden retrieval.

## SQL control-plane schema

The examples use PostgreSQL-compatible DDL. Production mondayDB may map these logical
tables to its hybrid row/columnar implementation. `source_key_hash` is an HMAC with a
tenant-specific key, not an unhashed user identifier.

```sql
CREATE TYPE agentic_erasure_state AS ENUM
  ('PENDING', 'REVOKED', 'PURGING', 'PURGED', 'FAILED');

CREATE TABLE account_revocation_epoch (
  account_id            BIGINT NOT NULL,
  current_epoch         BIGINT NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id),
  CHECK (current_epoch >= 0)
);

CREATE TABLE agentic_erasure_request (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  idempotency_key       TEXT NOT NULL,
  scope_kind            TEXT NOT NULL,
  source_key_hash       BYTEA NOT NULL,
  cohort_watermark      BIGINT,
  reason_code           TEXT NOT NULL,
  requested_by_hash     BYTEA NOT NULL,
  policy_version        TEXT NOT NULL,
  state                 agentic_erasure_state NOT NULL,
  revocation_epoch      BIGINT,
  purge_deadline_at     TIMESTAMPTZ NOT NULL,
  request_hash          BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, idempotency_key),
  CHECK (
    (state = 'PENDING' AND revocation_epoch IS NULL) OR
    (state <> 'PENDING' AND revocation_epoch IS NOT NULL)
  )
);

CREATE INDEX agentic_erasure_request_status_idx
  ON agentic_erasure_request
  (account_id, state, purge_deadline_at, request_id);

CREATE TABLE agentic_revocation_fence (
  account_id            BIGINT NOT NULL,
  source_key_hash       BYTEA NOT NULL,
  request_id            UUID NOT NULL,
  revoked_at_epoch      BIGINT NOT NULL,
  source_watermark      BIGINT NOT NULL,
  policy_version        TEXT NOT NULL,
  decision_hash         BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_key_hash),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id)
);

CREATE INDEX agentic_revocation_fence_epoch_idx
  ON agentic_revocation_fence
  (account_id, revoked_at_epoch, source_key_hash);

CREATE TABLE agentic_derivation_locator (
  account_id            BIGINT NOT NULL,
  source_key_hash       BYTEA NOT NULL,
  target_kind           TEXT NOT NULL,
  physical_partition    TEXT NOT NULL,
  artifact_key_hash     BYTEA NOT NULL,
  artifact_epoch        BIGINT NOT NULL,
  source_watermark      BIGINT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id,
    source_key_hash,
    target_kind,
    physical_partition,
    artifact_key_hash
  )
);

CREATE INDEX agentic_derivation_locator_artifact_idx
  ON agentic_derivation_locator
  (account_id, target_kind, physical_partition, artifact_key_hash);

CREATE TABLE agentic_erasure_target (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  target_kind           TEXT NOT NULL,
  physical_partition    TEXT NOT NULL,
  artifact_count        BIGINT NOT NULL,
  estimated_bytes       BIGINT NOT NULL,
  state                 TEXT NOT NULL,
  lease_owner           TEXT,
  lease_expires_at      TIMESTAMPTZ,
  attempts              INTEGER NOT NULL DEFAULT 0,
  target_watermark      BIGINT,
  last_error_code       TEXT,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id, target_kind, physical_partition),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  CHECK (artifact_count >= 0),
  CHECK (estimated_bytes >= 0),
  CHECK (attempts >= 0)
);

CREATE INDEX agentic_erasure_target_worker_idx
  ON agentic_erasure_target
  (account_id, state, lease_expires_at, updated_at, request_id);

CREATE TABLE agentic_erasure_audit_event (
  account_id            BIGINT NOT NULL,
  event_id              UUID NOT NULL,
  request_id            UUID NOT NULL,
  sequence_no           BIGINT NOT NULL,
  event_type            TEXT NOT NULL,
  policy_version        TEXT NOT NULL,
  revocation_epoch      BIGINT NOT NULL,
  canonical_payload_hash BYTEA NOT NULL,
  previous_event_hash   BYTEA,
  event_hash            BYTEA NOT NULL,
  occurred_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id),
  UNIQUE (account_id, request_id, sequence_no),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id)
);

CREATE INDEX agentic_erasure_audit_request_idx
  ON agentic_erasure_audit_event
  (account_id, request_id, sequence_no);
```

### Mandatory tenant access pattern

Application roles must not issue unscoped SQL. The data service binds `account_id`
from the authenticated principal, not from agent-generated text. Defense in depth
should include row-level security or an equivalent storage policy:

```sql
ALTER TABLE agentic_erasure_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY erasure_request_tenant_policy
  ON agentic_erasure_request
  USING (account_id = current_setting('monday.account_id')::BIGINT)
  WITH CHECK (account_id = current_setting('monday.account_id')::BIGINT);
```

The equivalent policy is required on every table above. Foreign keys include
`account_id` so an artifact from one tenant cannot be attached to another tenant's
request.

## Deterministic lifecycle

### 1. Admit and revoke

Within one serializable row-store transaction:

1. authenticate the principal and resolve `account_id` server-side;
2. canonicalize the exact scope and calculate `source_key_hash`;
3. enforce the account's erasure policy and idempotency key;
4. increment `account_revocation_epoch.current_epoch`;
5. write the request, revocation fence, and hash-chained audit event; and
6. commit.

If the same idempotency key has the same canonical request hash, return the original
receipt. If the hash differs, return `IDEMPOTENCY_CONFLICT`. Concurrent requests for
the same source converge on the existing fence and the highest committed epoch.

From commit onward, all retrieval and tool-context paths deny artifacts whose source
matches the fence. Physical target discovery is not part of the availability-critical
transaction.

### 2. Discover exact derivatives

A worker performs an indexed lookup on:

```sql
WHERE account_id = $1 AND source_key_hash = $2
```

It groups locator rows into bounded target partitions and writes target records.
Object and principal locators must be emitted when each derivative is created; purge
time is too late to rediscover lineage reliably.

For materialized cohorts, the worker walks a precomputed membership list using
`(account_id, cohort_id, member_sequence)` keyset pagination. It never reevaluates a
business predicate.

### 3. Purge and compact

Workers acquire leases with compare-and-swap updates, then purge at most the compiled
limits for artifacts, bytes, wall time, and partitions. A target is `PURGED` after
logical deletion and `COMPACTED` after physical reclamation where the storage layer
distinguishes them.

Backups are not rewritten in place. The receipt records backup expiry, key-destruction
state, and restore-time suppression rules. Any restore must replay the revocation
ledger before serving reads.

### 4. Prove completion

The request becomes `PURGED` only when every mandatory target reaches its policy-
defined terminal state. The receipt hash covers the canonical scope hash, policy
version, revocation epoch, target states, watermarks, and audit chain head. It never
covers raw erased content.

## Read-path enforcement

Every row, columnar, vector, cache, memory, procedure, and tool-context artifact carries:

- `account_id`;
- `source_key_hash` or a bounded set of source hashes;
- `artifact_epoch`;
- `source_watermark`; and
- `policy_version`.

At request compilation, mondayDB pins an `observed_revocation_epoch`. Results are
eligible only if they pass both tenant policy and revocation filtering at that epoch.
Before returning a context packet or invoking a tool, the gateway checks whether the
account epoch advanced during execution. If it did, the gateway refreshes fences and
re-filters; it never returns a packet compiled against an older epoch.

Derived artifacts with multiple sources are revoked if any mandatory source is
revoked. They may be rebuilt only from the remaining allowed sources under a new
artifact ID, epoch, provenance hash, and audit event. Redaction by mutating an existing
embedding is forbidden because vector subtraction is not a reliable erasure operation.

## Vector and HNSW behavior

Vectors are physically partitioned by a stable account hash and logically filtered by
`account_id`; global cross-tenant ANN search is forbidden. Every vector label points
to a locator carrying its source hash and artifact epoch.

HNSW deletion can lag while graph maintenance runs. Therefore:

- the vector ID is added to a tenant-scoped deny sidecar at fence commit or target
  discovery;
- ANN candidates are post-filtered against the pinned fence snapshot;
- bounded oversampling may compensate for filtered candidates;
- underfilled results return fewer matches with `REVOKED_CANDIDATES_FILTERED`;
- the engine never widens partitions, removes filters, or falls back to an exact
  full-table distance scan; and
- background graph rebuilds must read the latest revocation epoch before publish.

Embedding jobs carry the source watermark and their admitted epoch. Publish uses a
compare-and-swap guard:

```text
publish only when admitted_epoch >= current_source_fence_epoch
and source_watermark is still current
and source remains visible under the pinned policy version
```

This closes the common resurrection race in which an embedding computed before
deletion arrives after the fence.

Semantic search over erasure requests themselves is not supported. It could disclose
that a sensitive subject existed. Agents may semantically retrieve sanitized,
versioned **erasure procedures** (for example, how to request deletion), using
account-partitioned HNSW and metadata filters:

```ts
interface ErasureProcedureMemory {
  accountId: string;
  procedureId: string;
  version: number;
  applicabilityTags: string[];
  instructionSteps: string[];
  forbiddenActions: string[];
  policyVersion: string;
  embeddingModel: string;
  embedding: number[]; // fixed dimension per model family
  contentHash: string;
}
```

Procedure instructions are plans for an agent, never authority. The deterministic
policy compiler still validates every requested scope, budget, and tool action.

## Open API GraphQL contract

The API uses exact selectors rather than free-form predicates. `accountId` is absent
from inputs because the service derives it from authentication.

```graphql
scalar DateTime
scalar Long

enum AgenticErasureScopeKind {
  OBJECT
  PRINCIPAL
  MATERIALIZED_COHORT
}

enum AgenticErasureReason {
  USER_REQUEST
  RETENTION_EXPIRY
  POLICY_REVOCATION
  SECURITY_RESPONSE
  SOURCE_DELETED
}

input AgenticErasureScopeInput {
  kind: AgenticErasureScopeKind!
  objectType: String
  objectId: ID
  principalType: String
  principalId: ID
  cohortId: ID
  membershipWatermark: Long
}

input RequestAgenticErasureInput {
  idempotencyKey: String!
  scope: AgenticErasureScopeInput!
  reason: AgenticErasureReason!
  expectedPolicyVersion: String!
}

type AgenticErasureTarget {
  kind: String!
  state: String!
  artifactCount: Long!
  estimatedBytes: Long!
  targetWatermark: Long
  lastErrorCode: String
}

type AgenticErasureReceipt {
  requestId: ID!
  state: String!
  scopeKind: AgenticErasureScopeKind!
  revocationEpoch: Long!
  visibility: String!
  purgeDeadlineAt: DateTime!
  targets: [AgenticErasureTarget!]!
  omissionReasons: [String!]!
  forbiddenActions: [String!]!
  nextStatusCheckAfter: DateTime!
  receiptHash: String!
}

type RequestAgenticErasurePayload {
  receipt: AgenticErasureReceipt!
  auditEventId: ID!
}

extend type Mutation {
  requestAgenticErasure(
    input: RequestAgenticErasureInput!
  ): RequestAgenticErasurePayload!
}

extend type Query {
  agenticErasureReceipt(requestId: ID!): AgenticErasureReceipt!
}
```

GraphQL resolvers enforce a maximum target page size and use keyset pagination for
internal target details. The public receipt aggregates target counts from the small
control table; it does not join against deleted source data.

## Agentic guardrails and admission

An erasure request compiles to an immutable execution envelope:

```ts
interface ErasureExecutionEnvelope {
  accountId: string;
  requestId: string;
  policyVersion: string;
  maxObjects: string;
  maxArtifactsPerBatch: number;
  maxBytesPerBatch: string;
  maxPartitionsPerBatch: number;
  maxWallTimeMs: number;
  maxRetries: number;
  maxStatusPollsPerMinute: number;
  allowedTargetKinds: ErasureTargetKind[];
  compiledAtRevocationEpoch: string;
  envelopeHash: string;
}
```

The compiler rejects:

- wildcard or natural-language scopes;
- selectors without an indexed tenant-leading access path;
- recursive discovery through arbitrary entity edges;
- agent-proposed increases to object, partition, retry, or wall-time limits;
- vector fallback to another account partition;
- re-embedding, summarizing, or exporting content after revocation; and
- status polling that exceeds a tenant and principal quota.

Purge work runs in a separate workload class from interactive traffic. Admission uses
per-account and global token buckets for rows, bytes, vector graph mutations, and
columnar compactions. Under pressure, physical purge is queued; the logical fence
remains effective. Security-response requests may receive higher purge priority but
cannot bypass read-path isolation or global reliability floors.

## Performance check for boards with 1M+ rows

### Safe paths

- Exact object revocation: point writes and lookups on account-leading composite keys.
- Derivative discovery: locator lookup by `(account_id, source_key_hash)`.
- Worker scheduling: indexed state/deadline/lease access with keyset pagination.
- Vector suppression: bounded ANN candidate filtering plus a tenant deny sidecar.
- Receipt lookup: point query by `(account_id, request_id)`.

### Full-scan risks and required responses

| Risk | Why it is dangerous | Required behavior |
| --- | --- | --- |
| Predicate erasure such as "all items mentioning X" | Scans mutable schemaless values and yields unstable membership | Reject; require a materialized cohort created by an admitted job |
| Missing derivation locators | Forces search across vector, cache, and object stores | Block publication of unlocatable derivatives; never scan at purge time |
| Unindexed JSON scope matching | Becomes a tenant-wide row scan | Compile only typed selectors with account-leading indexes |
| Exact vector fallback after HNSW filtering | Can evaluate distance across millions of vectors | Return an underfilled result with an omission reason |
| Unbounded principal erasure | A prolific actor may own millions of artifacts | Snapshot membership and process bounded keyset pages under a purge SLA |
| In-place columnar rewrite per request | Causes write amplification and noisy-neighbor latency | Apply delete vectors, then compact in admitted batches |
| Recursive lineage traversal | Cycles can multiply work and cross workload budgets | Use emitted direct locators; reject recursive discovery |

Planner estimates use 64-bit integers and saturating arithmetic. An estimate overflow
is a rejection, not permission to execute. Plans that lack cardinality statistics use
the tenant's conservative maximum, which normally queues or rejects them.

## Auditability and replay

Audit payloads use canonical serialization with explicit field ordering and versioned
hash algorithms:

```text
event_hash = SHA-256(
  account_id ||
  request_id ||
  sequence_no ||
  event_type ||
  policy_version ||
  revocation_epoch ||
  canonical_payload_hash ||
  previous_event_hash
)
```

The payload stores hashes, counts, target states, decision codes, and watermarks—not
the erased values. Replay verifies:

1. the request was authorized under the recorded policy;
2. the epoch advanced exactly once for the canonical request;
3. every visible result was compiled at a valid revocation epoch;
4. each target transitioned through allowed states;
5. late publishers were denied; and
6. completion met the applicable purge policy.

Operator overrides are new signed audit events; history is append-only. `FAILED` does
not restore visibility. Retrying physical purge reuses the request and fence.

## Availability, consistency, and SLOs

Recommended product SLOs:

- revocation fence commit: same availability class as mondayDB row writes;
- visibility denial: effective immediately after successful commit;
- request receipt lookup: interactive read SLO;
- derivative target discovery: measured lag with a fixed enterprise objective;
- physical purge: policy-specific deadline, reported per target;
- stale artifact resurrection: zero tolerated events;
- cross-account visibility: zero tolerated events.

If vector, columnar, or object storage is unavailable, revocation still commits. The
request reports delayed physical targets while all serving gateways deny matching
sources. If the row control plane itself is unavailable, the mutation fails closed
and does not claim success.

## Rollout sequence

1. **Inventory:** require source hashes, epochs, and direct locators on newly created
   vector, cache, context, memory, procedure, and tool-trace artifacts.
2. **Read enforcement:** deploy fence checks in shadow mode, compare decisions, then
   fail closed for artifacts missing provenance.
3. **Write path:** enable transactional requests, account epochs, receipts, and audit
   chains for exact objects.
4. **Physical purge:** add bounded workers by target kind with per-tenant admission.
5. **Broader scopes:** add principal and pre-materialized cohort workflows only after
   cardinality and SLA evidence is available.
6. **Restore drills:** prove that backup restoration replays fences before any query,
   context compilation, vector retrieval, or tool execution is served.

Release gates should include cross-tenant property tests, concurrent delete/publish
race tests, stale gateway epoch tests, HNSW underfill tests, restore drills, and load
tests on 1M+ row boards. A feature is not generally available until an auditor can
reconstruct a receipt from the hash chain without access to erased content.

## Decision

mondayDB should make **logical revocation synchronous and physical erasure
asynchronous**. This is not eventual privacy: visibility denial is strongly
consistent at the control-plane boundary, while storage reclamation is an observable
workflow. The separation keeps the deterministic database reliable and fast, gives
agents explicit safe omissions, and makes every derived memory accountable to an
exact tenant-scoped source.
