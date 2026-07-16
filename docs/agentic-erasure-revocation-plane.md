# Agentic Erasure and Revocation Plane

## Why this belongs in mondayDB

An agentic database creates more durable derivatives than a traditional row store:
embeddings, HNSW nodes, context packets, semantic caches, compacted memories,
procedures, and tool traces. Deleting the source row without governing those
derivatives lets an agent retrieve knowledge that a user believes is gone.

The product trade-off is immediate safety versus immediate physical deletion.
Synchronously rewriting every columnar segment and HNSW graph would increase write
latency and couple ACID availability to asynchronous systems. mondayDB should instead:

1. commit a **revocation fence** with the erasure request transaction;
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
- **ACID safety boundary:** the pending request and closing barrier commit together;
  after lease drain, the immutable fence, epoch, revoked state, audit event, and first
  receipt commit together.
- **No resurrection:** delayed embedding or compaction jobs cannot publish artifacts
  built before the fence.
- **Queryable proof:** the Open API returns a receipt containing target states,
  watermarks, deadlines, and hashes, but never deleted content.
- **Predictable load:** purge workers use indexed locators, fixed batches, tenant
  quotas, and workload admission. They never discover derivatives with table scans.

## Scope and terminology

An **erasure request** initially names one exact source object. A **revocation fence**
is the synchronous visibility barrier. A **derivation locator** maps a source identity
to every materialized derivative. A **purge target** tracks physical removal from one
storage layer. Principal and cohort scopes use the same model only after the broader
subject-tag prerequisites described below are available.

The first release supports exact object scope only. Predicate-based erasure is
deliberately excluded: an open-ended predicate can become a hidden full scan and its
membership can change between retries. Principal and cohort erasure are later
capabilities, gated on precomputed subject tags and indexed membership snapshots so a
single scope fence can match every artifact synchronously.

## TypeScript contracts

IDs are opaque strings at the API boundary. Epochs, row estimates, and byte estimates
are decimal strings because GraphQL and JavaScript cannot safely represent all 64-bit
integers.

```ts
interface ObjectErasureScope {
  kind: "OBJECT";
  objectType: "BOARD_ITEM" | "UPDATE" | "FILE" | "MEMORY" | "PROCEDURE";
  objectId: string;
}

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
  scope: ObjectErasureScope;
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
  sourceIdentityId: string;
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
  tenantPartitionId: string;
  artifactCount: string;
  estimatedBytes: string;
  state: "DISCOVERED" | "LEASED" | "PURGED" | "COMPACTED" | "FAILED";
  attempts: number;
  targetWatermark?: string;
  purgeCursorArtifactKeyHash?: string;
  purgedArtifactCount: string;
  purgedBytes: string;
  backupExpiresAt?: string;
  keyDestructionState?: "NOT_APPLICABLE" | "PENDING" | "DESTROYED";
  restoreSuppressionPolicyVersion?: string;
  lastErrorCode?: string;
  updatedAt: string;
}

interface ErasurePerceptionCard {
  requestId: string;
  scopeKind: ObjectErasureScope["kind"];
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
tables to its hybrid row/columnar implementation. Source aliases are versioned HMACs
with tenant-specific keys, not unhashed user identifiers. A stable random
`source_identity_id` survives HMAC rotation; rotation adds an alias instead of
changing the identity carried by fences and artifacts.

First-party source rows store `source_identity_id` directly. The normal
`(account_id, object_type, object_id)` point lookup is the authority that resolves an
API selector; aliases are secondary pseudonymous lookup keys. During key rotation,
the resolver computes the new HMAC from the raw selector presented to the source
service and inserts it against the row's existing identity. It never attempts to
derive a new HMAC from an old HMAC. Integrations that cannot provide either an
authoritative source lookup or the raw selector are not eligible for alias rotation
and cannot publish agentic derivatives.

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

CREATE TABLE agentic_erasure_policy_artifact (
  account_id            BIGINT NOT NULL,
  policy_version        TEXT NOT NULL,
  policy_schema_version SMALLINT NOT NULL,
  canonical_policy      JSONB NOT NULL,
  policy_artifact_hash  BYTEA NOT NULL,
  hash_algorithm        TEXT NOT NULL,
  signer_key_id         TEXT NOT NULL,
  signature             BYTEA NOT NULL,
  valid_from             TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, policy_version),
  CHECK (jsonb_typeof(canonical_policy) = 'object')
);

CREATE TABLE agentic_source_identity (
  account_id            BIGINT NOT NULL,
  source_identity_id    UUID NOT NULL,
  object_type           TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_identity_id)
);

CREATE TABLE agentic_source_identity_alias (
  account_id            BIGINT NOT NULL,
  source_key_version    SMALLINT NOT NULL,
  canonicalization_version TEXT NOT NULL,
  source_key_hash       BYTEA NOT NULL,
  source_identity_id    UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_key_version, source_key_hash),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id)
);

CREATE INDEX agentic_source_identity_alias_identity_idx
  ON agentic_source_identity_alias
  (account_id, source_identity_id, source_key_version);

CREATE TABLE agentic_tenant_partition (
  account_id            BIGINT NOT NULL,
  tenant_partition_id   UUID NOT NULL,
  target_kind           TEXT NOT NULL,
  storage_namespace     TEXT NOT NULL,
  placement_binding_hash BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, tenant_partition_id),
  UNIQUE (account_id, tenant_partition_id, target_kind),
  UNIQUE (account_id, target_kind, storage_namespace)
);

CREATE TABLE agentic_erasure_request (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  idempotency_key       TEXT NOT NULL,
  source_identity_id    UUID NOT NULL,
  object_type           TEXT NOT NULL,
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
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id),
  FOREIGN KEY (account_id, policy_version)
    REFERENCES agentic_erasure_policy_artifact (account_id, policy_version),
  CHECK (
    (state = 'PENDING' AND revocation_epoch IS NULL) OR
    (state <> 'PENDING' AND revocation_epoch IS NOT NULL)
  )
);

CREATE INDEX agentic_erasure_request_status_idx
  ON agentic_erasure_request
  (account_id, state, purge_deadline_at, request_id);

CREATE TABLE agentic_visibility_barrier (
  account_id            BIGINT NOT NULL,
  source_identity_id    UUID NOT NULL,
  state                 TEXT NOT NULL,
  generation            BIGINT NOT NULL,
  closing_request_id    UUID,
  revoked_at_epoch      BIGINT,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_identity_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id),
  FOREIGN KEY (account_id, closing_request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  CHECK (state IN ('OPEN', 'CLOSING', 'REVOKED')),
  CHECK (
    (state = 'OPEN' AND closing_request_id IS NULL AND revoked_at_epoch IS NULL) OR
    (state = 'CLOSING' AND closing_request_id IS NOT NULL
      AND revoked_at_epoch IS NULL) OR
    (state = 'REVOKED' AND closing_request_id IS NOT NULL
      AND revoked_at_epoch IS NOT NULL)
  )
);

CREATE TABLE agentic_visibility_lease (
  account_id            BIGINT NOT NULL,
  source_identity_id    UUID NOT NULL,
  lease_id              UUID NOT NULL,
  barrier_generation    BIGINT NOT NULL,
  operation_class       TEXT NOT NULL,
  capability_hash       BYTEA NOT NULL,
  issued_at              TIMESTAMPTZ NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  released_at            TIMESTAMPTZ,
  PRIMARY KEY (account_id, source_identity_id, lease_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_visibility_barrier (account_id, source_identity_id),
  CHECK (expires_at > issued_at)
);

CREATE INDEX agentic_visibility_lease_drain_idx
  ON agentic_visibility_lease
  (
    account_id,
    source_identity_id,
    barrier_generation,
    released_at,
    expires_at,
    lease_id
  );

CREATE TABLE agentic_visibility_drain_snapshot (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  source_identity_id    UUID NOT NULL,
  drained_generation    BIGINT NOT NULL,
  closing_generation    BIGINT NOT NULL,
  active_lease_count    INTEGER NOT NULL,
  ordered_lease_root    BYTEA NOT NULL,
  completed_at           TIMESTAMPTZ,
  final_attestation_root BYTEA,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id),
  CHECK (active_lease_count BETWEEN 0 AND 256),
  CHECK (closing_generation = drained_generation + 1)
);

CREATE TABLE agentic_visibility_drain_member (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  ordinal               SMALLINT NOT NULL,
  source_identity_id    UUID NOT NULL,
  lease_id              UUID NOT NULL,
  barrier_generation    BIGINT NOT NULL,
  capability_hash       BYTEA NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id, ordinal),
  UNIQUE (account_id, request_id, lease_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_visibility_drain_snapshot (account_id, request_id),
  FOREIGN KEY (account_id, source_identity_id, lease_id)
    REFERENCES agentic_visibility_lease
      (account_id, source_identity_id, lease_id),
  CHECK (ordinal BETWEEN 0 AND 255)
);

CREATE TABLE agentic_revocation_fence (
  account_id            BIGINT NOT NULL,
  source_identity_id    UUID NOT NULL,
  fence_id              UUID NOT NULL,
  revoked_at_epoch      BIGINT NOT NULL,
  source_watermark      BIGINT NOT NULL,
  policy_version        TEXT NOT NULL,
  decision_hash         BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_identity_id),
  UNIQUE (account_id, fence_id),
  UNIQUE (
    account_id,
    fence_id,
    source_identity_id,
    revoked_at_epoch
  ),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id),
  FOREIGN KEY (account_id, policy_version)
    REFERENCES agentic_erasure_policy_artifact (account_id, policy_version)
);

CREATE INDEX agentic_revocation_fence_epoch_idx
  ON agentic_revocation_fence
  (account_id, revoked_at_epoch, source_identity_id);

CREATE TABLE agentic_erasure_request_fence (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  fence_id              UUID NOT NULL,
  source_identity_id    UUID NOT NULL,
  revoked_at_epoch      BIGINT NOT NULL,
  linked_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  FOREIGN KEY (
    account_id,
    fence_id,
    source_identity_id,
    revoked_at_epoch
  ) REFERENCES agentic_revocation_fence (
    account_id,
    fence_id,
    source_identity_id,
    revoked_at_epoch
  )
);

CREATE TABLE agentic_derivation_locator (
  account_id            BIGINT NOT NULL,
  source_identity_id    UUID NOT NULL,
  target_kind           TEXT NOT NULL,
  tenant_partition_id   UUID NOT NULL,
  artifact_key_hash     BYTEA NOT NULL,
  artifact_epoch        BIGINT NOT NULL,
  source_watermark      BIGINT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id,
    source_identity_id,
    target_kind,
    tenant_partition_id,
    artifact_key_hash
  ),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id),
  FOREIGN KEY (account_id, tenant_partition_id, target_kind)
    REFERENCES agentic_tenant_partition
      (account_id, tenant_partition_id, target_kind)
);

CREATE INDEX agentic_derivation_locator_artifact_idx
  ON agentic_derivation_locator
  (account_id, target_kind, tenant_partition_id, artifact_key_hash);

CREATE TABLE agentic_erasure_discovery_progress (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  last_target_kind      TEXT,
  last_tenant_partition_id UUID,
  last_artifact_key_hash BYTEA,
  discovered_artifacts  BIGINT NOT NULL,
  discovered_bytes      BIGINT NOT NULL,
  state                 TEXT NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  CHECK (discovered_artifacts >= 0),
  CHECK (discovered_bytes >= 0)
);

CREATE TABLE agentic_erasure_target (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  target_kind           TEXT NOT NULL,
  tenant_partition_id   UUID NOT NULL,
  artifact_count        BIGINT NOT NULL,
  estimated_bytes       BIGINT NOT NULL,
  state                 TEXT NOT NULL,
  lease_owner           TEXT,
  lease_expires_at      TIMESTAMPTZ,
  attempts              INTEGER NOT NULL DEFAULT 0,
  target_watermark      BIGINT,
  purge_cursor_artifact_key_hash BYTEA,
  purged_artifact_count BIGINT NOT NULL DEFAULT 0,
  purged_bytes          BIGINT NOT NULL DEFAULT 0,
  backup_expires_at     TIMESTAMPTZ,
  key_destruction_state TEXT,
  restore_policy_version TEXT,
  last_error_code       TEXT,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id, target_kind, tenant_partition_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  FOREIGN KEY (account_id, tenant_partition_id, target_kind)
    REFERENCES agentic_tenant_partition
      (account_id, tenant_partition_id, target_kind),
  CHECK (artifact_count >= 0),
  CHECK (estimated_bytes >= 0),
  CHECK (purged_artifact_count BETWEEN 0 AND artifact_count),
  CHECK (purged_bytes >= 0),
  CHECK (attempts >= 0)
);

CREATE INDEX agentic_erasure_target_worker_idx
  ON agentic_erasure_target
  (
    account_id,
    state,
    lease_expires_at,
    updated_at,
    request_id,
    target_kind,
    tenant_partition_id
  );

CREATE TABLE agentic_visibility_attestation (
  account_id            BIGINT NOT NULL,
  attestation_id        UUID NOT NULL,
  source_identity_id    UUID NOT NULL,
  request_id            UUID,
  operation_class       TEXT NOT NULL,
  decision_code         TEXT NOT NULL,
  barrier_generation    BIGINT NOT NULL,
  policy_version        TEXT NOT NULL,
  policy_artifact_hash  BYTEA NOT NULL,
  capability_hash       BYTEA,
  payload_schema_version SMALLINT NOT NULL,
  canonical_payload     JSONB NOT NULL,
  canonical_payload_hash BYTEA NOT NULL,
  signer_key_id         TEXT NOT NULL,
  signature             BYTEA NOT NULL,
  occurred_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, attestation_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_source_identity (account_id, source_identity_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  FOREIGN KEY (account_id, policy_version)
    REFERENCES agentic_erasure_policy_artifact (account_id, policy_version),
  CHECK (jsonb_typeof(canonical_payload) = 'object')
);

CREATE INDEX agentic_visibility_attestation_source_idx
  ON agentic_visibility_attestation
  (account_id, source_identity_id, occurred_at, attestation_id);

CREATE TABLE agentic_erasure_audit_head (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  next_sequence_no      BIGINT NOT NULL,
  current_event_hash    BYTEA,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id)
);

CREATE TABLE agentic_erasure_audit_event (
  account_id            BIGINT NOT NULL,
  event_id              UUID NOT NULL,
  request_id            UUID NOT NULL,
  sequence_no           BIGINT NOT NULL,
  event_type            TEXT NOT NULL,
  policy_version        TEXT NOT NULL,
  revocation_epoch      BIGINT NOT NULL,
  payload_schema_version SMALLINT NOT NULL,
  canonical_payload     JSONB NOT NULL,
  canonical_payload_hash BYTEA NOT NULL,
  hash_algorithm        TEXT NOT NULL,
  previous_event_hash   BYTEA,
  event_hash            BYTEA NOT NULL,
  occurred_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id),
  UNIQUE (account_id, request_id, sequence_no),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  CHECK (jsonb_typeof(canonical_payload) = 'object')
);

CREATE INDEX agentic_erasure_audit_request_idx
  ON agentic_erasure_audit_event
  (account_id, request_id, sequence_no);

CREATE TABLE agentic_erasure_receipt (
  account_id            BIGINT NOT NULL,
  request_id            UUID NOT NULL,
  receipt_version       BIGINT NOT NULL,
  receipt_schema_version SMALLINT NOT NULL,
  canonical_receipt     JSONB NOT NULL,
  receipt_hash          BYTEA NOT NULL,
  hash_algorithm        TEXT NOT NULL,
  audit_chain_head_hash BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id, receipt_version),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_erasure_request (account_id, request_id),
  CHECK (jsonb_typeof(canonical_receipt) = 'object')
);
```

### Mandatory tenant access pattern

Application roles must not issue unscoped SQL. The data service binds `account_id`
from the authenticated principal, not from agent-generated text. Defense in depth
should include row-level security or an equivalent storage policy:

```sql
ALTER TABLE agentic_erasure_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_erasure_request FORCE ROW LEVEL SECURITY;

CREATE POLICY erasure_request_tenant_policy
  ON agentic_erasure_request
  USING (account_id = current_setting('monday.account_id')::BIGINT)
  WITH CHECK (account_id = current_setting('monday.account_id')::BIGINT);
```

The equivalent `ENABLE`, `FORCE`, and policy statements are required on every table
above. Migration and break-glass roles are separate, audited, and unavailable to
serving processes. Foreign keys include `account_id` so an artifact from one tenant
cannot be attached to another tenant's request.

Workers never accept `storage_namespace` from an API request or locator. They exchange
`tenant_partition_id` for a short-lived, account-bound capability at the trusted
placement service. The vector/object store validates the capability's `account_id`,
target kind, namespace, expiry, and `placement_binding_hash` on every read or delete.
This binds logical RLS to physical storage isolation instead of trusting a text
partition name.

## Deterministic lifecycle

### 1. Admit and revoke

Revocation uses a durable two-transaction barrier. It never commits a `REVOKED`
request that still depends on best-effort gateway publication.

The **prepare transaction**:

1. authenticates the principal and resolves `account_id` server-side;
2. resolves the exact object row and its stable `source_identity_id`;
3. verifies the immutable policy artifact and idempotency key;
4. creates a `PENDING` request;
5. locks `agentic_visibility_barrier`;
6. reads at most 256 unexpired active leases for the open generation through the
   generation-leading drain index and persists each member plus their ordered root
   and count; and
7. changes the barrier from `OPEN` to `CLOSING`, increments its generation, and
   records `closing_request_id`.

If the locked barrier is already `REVOKED`, the transaction instead creates a
`REVOKED` request, links the existing immutable fence and epoch, emits its audit event
and receipt, and commits without changing the barrier or account epoch. If it is
`CLOSING` for another request, no new request is committed.

Visibility gateways grant leases with a linearizable read/write transaction against
this same barrier table. They do not grant from cached barrier state. Once `CLOSING`
commits, no new lease can be issued; if the authority is unavailable, lease issuance
fails closed. Admission caps unexpired leases at 256 per source (tenants may configure
a lower limit), and each lease has a policy-bounded expiry. The closing transaction
holds the barrier lock while snapshotting, so the persisted set is complete.

After all older leases are released or expired, the **final transaction** locks the
barrier and verifies its generation, request ID, and every member in the bounded drain
snapshot by direct lease key. It stores the signed final attestation root and
completion time, then:

1. increments `account_revocation_epoch.current_epoch`;
2. inserts the immutable source fence;
3. links the request to the exact fence ID and original fence epoch;
4. appends canonical audit and visibility attestations;
5. writes the first versioned receipt;
6. sets both request and barrier to `REVOKED`; and
7. commits.

That final commit is the revocation linearization point and requires no follow-up
publication. The mutation acknowledges success only after it can read that committed
state from the same quorum-backed visibility authority.

If the same idempotency key has the same canonical request hash, return the original
receipt only when the request is already `REVOKED`; a `PENDING` retry resumes drain
and finalization. If the hash differs, return `IDEMPOTENCY_CONFLICT`. A request for an
already-revoked source links to the existing immutable fence and reuses its original
epoch without advancing the account epoch. Thus repeated requests retain independent
request/audit provenance without mutating fence history. A competing request that
finds `CLOSING` receives `SOURCE_REVOCATION_IN_PROGRESS` and may retry after the first
request reaches a terminal state.

Physical target discovery is not part of either availability-critical transaction.
An abandoned `CLOSING` request remains fail-closed and is safely resumable by its
idempotency key or a policy-authorized recovery worker.

### 2. Discover exact derivatives

A worker performs an indexed lookup on:

```sql
WHERE account_id = $1
  AND source_identity_id = $2
  AND (target_kind, tenant_partition_id, artifact_key_hash) > ($3, $4, $5)
ORDER BY target_kind, tenant_partition_id, artifact_key_hash
LIMIT $6
```

`$6` is clamped by the execution envelope. The worker groups only that page into
target records and atomically advances `agentic_erasure_discovery_progress` with the
last composite key, counts, and bytes. An initial cursor uses typed minimum sentinels;
retries repeat the upsert and cursor transaction idempotently. A source with millions
of derivatives therefore creates many admitted pages, never one unbounded range
scan. Object locators must be emitted transactionally when each derivative is
published; purge time is too late to rediscover lineage reliably.

### 3. Purge and compact

Workers acquire leases with compare-and-swap updates, then purge at most the compiled
limits for artifacts, bytes, wall time, and partitions. A target is `PURGED` after
logical deletion and `COMPACTED` after physical reclamation where the storage layer
distinguishes them.

Each target has an independent artifact cursor. A purge batch reads the retained
locator index with exact account, source, target kind, and tenant partition predicates:

```sql
WHERE account_id = $1
  AND source_identity_id = $2
  AND target_kind = $3
  AND tenant_partition_id = $4
  AND artifact_key_hash > $5
ORDER BY artifact_key_hash
LIMIT $6
```

After idempotent cross-store deletes succeed, one transaction advances
`purge_cursor_artifact_key_hash`, `purged_artifact_count`, and `purged_bytes`. A crash
before that transaction may repeat a bounded idempotent delete; it never skips an
artifact. Locators remain until the target is terminal and its receipt is durable, so
retries neither rescan the prefix nor depend on deleted target contents. One source
or partition with 1M artifacts is therefore handled as envelope-capped pages.

Backups are not rewritten in place. Backup targets persist `backup_expires_at`,
`key_destruction_state`, and `restore_policy_version`. Any restore must replay the
revocation ledger and verify the restore suppression policy before serving reads.

### 4. Prove completion

The request becomes `PURGED` only when every mandatory target reaches its policy-
defined terminal state. The receipt hash covers the canonical scope hash, policy
version, revocation epoch, target states, watermarks, and audit chain head. It never
covers raw erased content. Every state transition appends a sanitized canonical audit
payload and an immutable receipt version, so an auditor can reconstruct—not merely
compare—the receipt shown at any point in time.

## Read-path enforcement

Every row, columnar, vector, cache, memory, procedure, and tool-context artifact carries:

- `account_id`;
- `source_identity_id` or a bounded set of source identities;
- `artifact_epoch`;
- `source_watermark`; and
- `policy_version`.

At request compilation, mondayDB pins an `observed_revocation_epoch`. Before releasing
a bounded result packet, publishing an artifact, or authorizing a tool side effect,
the gateway acquires a short-lived **visibility lease** over the packet's source
identities. The lease service and fence writer share the same linearizable per-source
barrier:

- a lease is granted and recorded only while the locked barrier state is `OPEN`;
- a committed `CLOSING` or `REVOKED` barrier denies every new lease;
- final fence commit occurs only after bounded older leases drain;
- the gateway holds the lease through response release or the tool's authorization
  linearization point; and
- queued or retried tool work must reacquire a lease rather than reuse context.

The successful mutation response therefore linearizes after earlier releases and
before every later release. This closes the epoch-check/return time-of-check race. A
lease has a hard maximum lifetime; an unresponsive gateway loses authority and its
downstream capability expires. Cross-store content reads without a valid gateway
capability fail closed.

Derived artifacts with multiple sources are revoked if any mandatory source is
revoked. They may be rebuilt only from the remaining allowed sources under a new
artifact ID, epoch, provenance hash, and audit event. Redaction by mutating an existing
embedding is forbidden because vector subtraction is not a reliable erasure operation.

## Vector and HNSW behavior

Vectors are physically partitioned by a stable account hash and logically filtered by
`account_id`; global cross-tenant ANN search is forbidden. Every vector label points
to a locator carrying its stable source identity and artifact epoch. The trusted
placement binding prevents a tenant capability from naming another tenant's graph.

HNSW deletion can lag while graph maintenance runs. Therefore:

- the source identity is added to a tenant-scoped deny sidecar before fence commit is
  acknowledged; target discovery may later add concrete vector IDs for compaction;
- ANN candidates are post-filtered against the pinned fence snapshot;
- bounded oversampling may compensate for filtered candidates;
- underfilled results return fewer matches with `REVOKED_CANDIDATES_FILTERED`;
- the engine never widens partitions, removes filters, or falls back to an exact
  full-table distance scan; and
- background graph rebuilds are published only through the fenced placement gateway.

Embedding jobs carry the source watermark and their admitted epoch. Publish uses a
visibility lease and an atomic placement-manifest compare-and-swap:

```text
publish(graph_or_vector, source_identity_id, lease_token)
only when lease_token is current at the manifest swap,
source_watermark is still current,
source remains visible under the pinned policy version,
and the locator is committed with the artifact
```

The manifest swap is the publication linearization point. A revocation either commits
first and causes publication to fail, or publication commits first and is immediately
covered by the subsequent fence. Graph rebuilds also retain the deny sidecar as a
serving overlay, so an old label cannot become visible during compaction. This closes
the common resurrection race in which an embedding computed before deletion arrives
after the fence.

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
from inputs because the service derives it from authentication. `DecimalLong`
serializes as a base-10 JSON string and rejects JSON numbers.

```graphql
scalar DateTime
scalar DecimalLong

enum AgenticErasureScopeKind {
  OBJECT
}

enum AgenticErasureObjectType {
  BOARD_ITEM
  UPDATE
  FILE
  MEMORY
  PROCEDURE
}

enum AgenticErasureReason {
  USER_REQUEST
  RETENTION_EXPIRY
  POLICY_REVOCATION
  SECURITY_RESPONSE
  SOURCE_DELETED
}

enum AgenticErasureState {
  PENDING
  REVOKED
  PURGING
  PURGED
  FAILED
}

enum AgenticErasureTargetKind {
  ROW
  COLUMNAR
  VECTOR
  SEMANTIC_CACHE
  CONTEXT_PACKET
  MEMORY_CAPSULE
  PROCEDURE
  TOOL_TRACE
  OBJECT_STORE
  BACKUP
}

enum AgenticErasureTargetState {
  DISCOVERED
  LEASED
  PURGED
  COMPACTED
  FAILED
}

enum AgenticPhysicalPurgeState {
  PENDING
  IN_PROGRESS
  COMPLETE
  DELAYED
}

enum AgenticErasureVisibility {
  REVOKED
}

enum AgenticKeyDestructionState {
  NOT_APPLICABLE
  PENDING
  DESTROYED
}

enum AgenticErasureOmissionReason {
  TARGET_DISCOVERY_PENDING
  PHYSICAL_PURGE_DELAYED
  BACKUP_RETENTION_ACTIVE
  REVOKED_CANDIDATES_FILTERED
}

enum AgenticErasureForbiddenAction {
  RETRIEVE_CONTENT
  RECONSTRUCT_FROM_DERIVATIVES
  REEMBED
  RETRY_TOOL_WITH_REVOKED_CONTEXT
}

input AgenticErasureScopeInput {
  objectType: AgenticErasureObjectType!
  objectId: ID!
}

input RequestAgenticErasureInput {
  idempotencyKey: String!
  scope: AgenticErasureScopeInput!
  reason: AgenticErasureReason!
  expectedPolicyVersion: String!
}

type AgenticErasureTargetSummary {
  kind: AgenticErasureTargetKind!
  physicalPurgeState: AgenticPhysicalPurgeState!
  partitionCount: DecimalLong!
  completedPartitionCount: DecimalLong!
  artifactCount: DecimalLong!
  estimatedBytes: DecimalLong!
}

type AgenticErasureTarget {
  tenantPartitionId: ID!
  kind: AgenticErasureTargetKind!
  state: AgenticErasureTargetState!
  artifactCount: DecimalLong!
  purgedArtifactCount: DecimalLong!
  estimatedBytes: DecimalLong!
  purgedBytes: DecimalLong!
  targetWatermark: DecimalLong
  backupExpiresAt: DateTime
  keyDestructionState: AgenticKeyDestructionState
  restoreSuppressionPolicyVersion: String
  lastErrorCode: String
}

type AgenticErasureTargetEdge {
  cursor: String!
  node: AgenticErasureTarget!
}

type AgenticErasureTargetConnection {
  edges: [AgenticErasureTargetEdge!]!
  endCursor: String
  hasNextPage: Boolean!
}

type AgenticErasureReceipt {
  requestId: ID!
  state: AgenticErasureState!
  scopeKind: AgenticErasureScopeKind!
  revocationEpoch: DecimalLong!
  visibility: AgenticErasureVisibility!
  purgeDeadlineAt: DateTime!
  targetSummaries: [AgenticErasureTargetSummary!]!
  omissionReasons: [AgenticErasureOmissionReason!]!
  forbiddenActions: [AgenticErasureForbiddenAction!]!
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
  agenticErasureTargets(
    requestId: ID!
    first: Int! = 50
    after: String
  ): AgenticErasureTargetConnection!
}
```

The scope input is structurally exact: its enum and required ID cannot express mixed
or incomplete selector variants. GraphQL resolvers cap `first` at 100 and use an
HMAC-signed keyset cursor over `(target_kind, tenant_partition_id)`. The receipt's
summary list has at most one entry per closed target kind; partition details and
backup proof fields are paginated. `first` must be between 1 and 100, cursors are at
most 512 bytes, IDs and policy versions are at most 256 bytes, and idempotency keys
are at most 128 bytes. Omission and forbidden-action lists are deduplicated subsets of
closed enums, so their cardinality is schema-bounded. Neither path joins against
deleted source data.

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
- Derivative discovery: envelope-capped locator pages keyed by
  `(account_id, source_identity_id, target_kind, tenant_partition_id, artifact_key_hash)`
  with durable progress.
- Worker scheduling: indexed state/deadline access with request, target kind, and
  partition tie-breakers for unique keyset pagination.
- Purge execution: per-target artifact-key cursor with an envelope-capped limit and
  idempotent deletes.
- Vector suppression: bounded ANN candidate filtering plus a tenant deny sidecar.
- Receipt lookup: point query by `(account_id, request_id)`.

### Full-scan risks and required responses

| Risk | Why it is dangerous | Required behavior |
| --- | --- | --- |
| Predicate erasure such as "all items mentioning X" | Scans mutable schemaless values and yields unstable membership | Reject; require a materialized cohort created by an admitted job |
| Missing derivation locators | Forces search across vector, cache, and object stores | Block publication of unlocatable derivatives; never scan at purge time |
| Unindexed JSON scope matching | Becomes a tenant-wide row scan | Compile only typed selectors with account-leading indexes |
| Exact vector fallback after HNSW filtering | Can evaluate distance across millions of vectors | Return an underfilled result with an omission reason |
| Principal or cohort scope without artifact subject tags | A single fence cannot synchronously match members and discovery may scan millions of rows | Reject in v1; later require precomputed subject tags plus `(account_id, subject_identity_id, member_sequence)` snapshots |
| In-place columnar rewrite per request | Causes write amplification and noisy-neighbor latency | Apply delete vectors, then compact in admitted batches |
| Recursive lineage traversal | Cycles can multiply work and cross workload budgets | Use emitted direct locators; reject recursive discovery |

Planner estimates use 64-bit integers and saturating arithmetic. An estimate overflow
is a rejection, not permission to execute. Plans that lack cardinality statistics use
the tenant's conservative maximum, which normally queues or rejects them.

## Auditability and replay

Audit payloads use canonical serialization with explicit field ordering and versioned
hash algorithms:

```text
event_hash = HASH(hash_algorithm,
  account_id ||
  request_id ||
  sequence_no ||
  event_type ||
  policy_version ||
  revocation_epoch ||
  payload_schema_version ||
  canonical_payload_hash ||
  previous_event_hash
)
```

Version 1 permits only `SHA-256`; adding an algorithm requires a new payload schema
version and dual verification during migration. The closed version-1 event schemas
are:

| Event | Required canonical fields |
| --- | --- |
| `REQUEST_PREPARED` | request hash, source identity, object type, policy artifact hash, barrier generation |
| `BARRIER_DRAINED` | drained/closing generations, bounded lease count, ordered snapshot root, final attestation root, drain watermark |
| `FENCE_COMMITTED` | fence ID, immutable revocation epoch, source watermark, decision hash |
| `FENCE_REUSED` | request ID, existing fence ID, source identity, original immutable epoch, original decision hash |
| `TARGET_TRANSITIONED` | target kind, tenant partition ID, prior/new state, counts, bytes, watermark |
| `PUBLISH_DECIDED` | visibility attestation ID, capability hash, placement binding hash, decision code |
| `RECEIPT_EMITTED` | receipt schema/version/hash, audit chain head, target-summary hash |

The immutable `canonical_payload` stores only source identity IDs, hashes, counts,
target states, decision codes, watermarks, and transition timestamps—not erased
values. Its schema is versioned, and its calculated hash must match
`canonical_payload_hash`. Each transaction locks `agentic_erasure_audit_head`, inserts
exactly `next_sequence_no` with the current head as predecessor, and advances the head.
Serving roles have `INSERT` through that stored procedure only; `UPDATE` and `DELETE`
are revoked and blocked by an append-only trigger. Periodic chain heads are signed and
anchored in a separate audit account so a database operator cannot silently rewrite
and rehash history.

Policy authorization is replayable against the signed, immutable
`agentic_erasure_policy_artifact`, not a version label alone. The visibility authority
emits a signed `agentic_visibility_attestation` for every context release, tool
authorization, artifact manifest swap, and denial. It binds the policy artifact hash,
barrier generation, capability hash, decision, and sanitized payload. Active lease
rows may be compacted only after the signed attestation is durable; attestations move
to tenant-partitioned columnar storage under the audit retention policy.

`agentic_erasure_receipt.canonical_receipt` is a sanitized materialized replay result,
not merely a digest. A verifier can regenerate every receipt version from the
canonical events, compare it with the stored JSON, verify `receipt_hash`, and bind it
to `audit_chain_head_hash`. The receipt schema fixes the exact fields shown by
GraphQL: request/state/scope, immutable epoch, purge deadline, bounded target
summaries, omission codes, forbidden-action codes, next-check time, and audit head.
Its schema version and hash algorithm prevent ambiguous replay. With the policy
artifact, authority public keys, canonical events, and attestations, replay verifies:

1. the request was authorized under the recorded policy;
2. the epoch advanced exactly once when the source's fence was first created, while
   repeated requests linked to that immutable epoch;
3. every recorded context release, tool authorization, or artifact publication
   referenced a valid visibility lease;
4. each target transitioned through allowed states;
5. late publishers were denied; and
6. completion met the applicable purge policy.

Operator overrides are new signed audit events; history is append-only. `FAILED` does
not restore visibility. Retrying physical purge reuses the request and fence.

## Availability, consistency, and SLOs

Recommended product SLOs:

- revocation fence commit: same availability class as mondayDB row writes;
- visibility denial: linearizable at the successful mutation response;
- request receipt lookup: interactive read SLO;
- derivative target discovery: measured lag with a fixed enterprise objective;
- physical purge: policy-specific deadline, reported per target;
- stale artifact resurrection: zero tolerated events;
- cross-account visibility: zero tolerated events.

If vector, columnar, or object storage is unavailable, revocation still commits. The
request reports delayed physical targets while all serving gateways deny matching
sources; a recovering store cannot serve without a current visibility capability. If
the row control plane or visibility-authority quorum is unavailable, the mutation fails
closed and does not claim success. This deliberately prefers an explicit failed
request over a false erasure receipt.

## Rollout sequence

1. **Inventory:** require stable source identities, epochs, and direct locators on
   newly created vector, cache, context, memory, procedure, and tool-trace artifacts.
2. **Read enforcement:** deploy source visibility leases and account-bound storage
   capabilities in shadow mode, compare decisions, then fail closed for artifacts
   missing provenance.
3. **Write path:** enable transactional requests, account epochs, receipts, and audit
   chains for exact objects.
4. **Physical purge:** add bounded workers by target kind with per-tenant admission.
5. **Broader scopes:** add principal and cohort workflows only after every relevant
   artifact carries a precomputed subject identity and membership is materialized in
   an account-leading `(account_id, subject_identity_id, member_sequence)` index.
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
