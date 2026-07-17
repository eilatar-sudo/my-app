# Agentic Temporal Grounding Plane

## Why this belongs in mondayDB

Agents routinely collapse three different questions into one:

1. what is true now;
2. what was true at a business-effective time; and
3. what mondayDB knew when an earlier decision was made.

That ambiguity is dangerous. A retroactive status correction can make an old decision
look irrational, a future-dated procedure can be applied too early, and a stale
embedding can present superseded instructions as current. Prompt text cannot repair
this reliably because the missing distinction is a data contract.

The product trade-off is write amplification versus trustworthy temporal reads.
Keeping only the latest value gives the lowest write cost, but destroys the evidence
needed to replay an agent decision. Copying full board snapshots on every write
preserves evidence, but is too expensive for million-row boards. mondayDB should use
**bitemporal facts** instead:

- **valid time** says when a fact or instruction applies in the business domain;
- **system time** says when a tenant partition committed or superseded that version;
- immutable snapshot manifests pin system-time watermarks across row, columnar, vector,
  and procedural-memory paths; and
- bounded grounding packets expose the distinction explicitly to an agent.

This keeps the engine deterministic. An LLM may propose a date or semantic query, but
mondayDB compiles it into a typed, tenant-scoped, budgeted temporal read. The database
never infers validity from prose.

### Product guarantees

- **No tenant leakage:** `account_id` leads every relational key, foreign key, and
  index. HNSW indexes live only inside account-bound physical graph artifacts; snapshot
  members, worker leases, and audit chains are tenant-scoped.
- **Deterministic relational as-of reads:** the same typed selectors, valid time,
  dependency-closed snapshot, policy artifact, and execution envelope produce the same
  fact-version set. ANN discovery is a signed, replay-verifiable decision, not a claim
  that a mutable HNSW graph will reproduce an identical traversal forever.
- **ACID current state:** a timeline correction, supersession metadata, outbox event,
  and audit event commit in one row-store transaction.
- **Replayable historical state:** an earlier snapshot continues to see the versions
  visible at its partition watermarks, including facts corrected later.
- **No temporal magic:** the engine never asks an LLM to infer whether a record is
  current, historical, corrected, scheduled, or unknown.
- **Predictable load:** point reads, bounded fan-out, ANN retrieval, and history
  pagination use account-leading access paths. Broad temporal analytics run only on
  admitted columnar plans.
- **Explicit incompleteness:** lag, retention, authorization, underfilled ANN results,
  and budget exhaustion appear as typed omission codes rather than silent fallback.

## Scope and semantics

A **timeline** is one typed attribute of one tenant object, such as an item's status or
a procedure's instruction body. A **fact version** is a value attached to a half-open
valid-time interval `[valid_from, valid_to)`. A **system interval** is the local commit
sequence range during which a partition considered that fact version visible.

A **temporal snapshot** is an immutable, dependency-closed manifest issued by mondayDB's
ACID snapshot authority. It binds one global read epoch to a row-store applied prefix
for each tenant partition touched by a request and to the durable coordinator decision
root that proves multi-partition transactions are all-visible or all-absent. It is
represented externally by a signed, opaque token. It is not a wall-clock timestamp.
This matters because decoupled compute and storage cannot safely reconstruct a
distributed ACID snapshot by independently sampling partitions or from client time.

A **grounding packet** is the bounded, policy-filtered set of facts, procedures, source
references, semantic matches, watermarks, and omission codes released to an agent. It
is evidence for planning, not authorization to act. Tool calls and writes still pass
through their own deterministic policy and transaction-intent checks.

Version 1 supports:

- exact object-and-attribute point reads;
- bounded fan-out over at most 256 exact objects;
- indexed typed predicates approved by a board contract;
- tenant-partitioned temporal semantic retrieval; and
- columnar aggregates with preflight byte and row estimates.

Version 1 rejects natural-language predicates, unbounded timeline expansion, and
arbitrary retroactive corrections that would split more intervals than the correction
envelope allows.

## TypeScript contracts

IDs and signed tokens are opaque strings at the API boundary. Sequences, row counts,
byte counts, and exact decimal facts are canonical decimal strings because JavaScript
and GraphQL cannot safely carry all 64-bit integers or arbitrary decimal values.
`DateTime` values normalize to UTC RFC 3339 with exactly six fractional digits; hashes
never depend on a client's timezone spelling. JSON numbers are forbidden inside
canonical fact values: contracts encode integral and decimal values as typed strings.

```ts
type TemporalObjectType =
  | "BOARD"
  | "BOARD_ITEM"
  | "UPDATE"
  | "WORKFLOW"
  | "MEMORY"
  | "PROCEDURE";

interface TemporalObjectRef {
  accountId: string;
  objectType: TemporalObjectType;
  objectId: string;
  boardId?: string;
}

interface ValidTimeRange {
  fromInclusive: string;
  toExclusive?: string;
}

interface TemporalFactVersion {
  accountId: string;
  timelineId: string;
  factVersionId: string;
  object: TemporalObjectRef;
  attributeKey: string;
  valueType:
    | "BOOLEAN"
    | "NUMBER"
    | "STRING"
    | "DATE_TIME"
    | "OBJECT_REF"
    | "JSON";
  canonicalValue: unknown;
  validTime: ValidTimeRange;
  tenantPartitionId: string;
  systemFromSequence: string;
  systemToSequence?: string;
  sourceEventId: string;
  sourceWatermark: string;
  policyVersion: string;
  valueHash: string;
  createdAt: string;
}

interface TemporalSnapshotPartition {
  tenantPartitionId: string;
  visibleCommitSequence: string;
  appliedDecisionPrefix: string;
  decisionMembershipProofHash: string;
  rowWatermark: string;
  columnarManifestId?: string;
  columnarManifestHash?: string;
  columnarAppliedPrefix?: string;
  vectorManifestId?: string;
  vectorManifestHash?: string;
  vectorAppliedPrefix?: string;
  procedureManifestId?: string;
  procedureManifestHash?: string;
  procedureAppliedPrefix?: string;
}

interface TemporalSnapshot {
  accountId: string;
  snapshotId: string;
  snapshotToken: string;
  consistency: "LATEST_COMMITTED" | "PINNED";
  authorityCheckpointId: string;
  authorityReadEpoch: string;
  coordinatorDecisionRoot: string;
  evaluationTime: string;
  selectionVisibilityEpoch: string;
  partitions: TemporalSnapshotPartition[];
  policyVersion: string;
  expiresAt: string;
  manifestHash: string;
}

type TemporalSelector =
  | {
      kind: "EXACT";
      object: TemporalObjectRef;
      attributeKeys: string[];
    }
  | {
      kind: "EXACT_SET";
      objects: TemporalObjectRef[];
      attributeKeys: string[];
    }
  | {
      kind: "CONTRACT_FILTER";
      boardId: string;
      contractId: string;
      filterAst: DeterministicTemporalFilter;
      projectedAttributeKeys: string[];
    };

interface DeterministicTemporalFilter {
  operator: "AND" | "OR" | "EQ" | "IN" | "RANGE";
  attributeKey?: string;
  typedValues?: Array<
    | { type: "BOOLEAN"; value: boolean }
    | { type: "DECIMAL"; canonicalValue: string }
    | { type: "STRING"; value: string }
    | { type: "DATE_TIME"; canonicalUtcValue: string }
    | { type: "OBJECT_ID"; value: string }
  >;
  children?: DeterministicTemporalFilter[];
}

interface CompiledTemporalSemanticRoute {
  indexId: string;
  embeddingModelVersion: string;
  queryEmbeddingHash: string;
  graphArtifacts: Array<{
    graphArtifactId: string;
    graphArtifactHash: string;
    validTimeBucketId: string;
  }>;
  distanceMetric: "COSINE";
  efSearch: number;
  topK: number;
  maxCandidates: number;
  validTimeBucketIds: string[];
  metadataFilterHash: string;
  orderedCandidateAttestationHash: string;
}

interface TemporalGroundingRequest {
  accountId: string;
  requestId: string;
  principalId: string;
  purposeId: string;
  validAt: string;
  snapshotToken?: string;
  selectors: TemporalSelector[];
  semanticRoute?: CompiledTemporalSemanticRoute;
  procedureScopes: string[];
  completeness: "REQUIRE_COMPLETE" | "ALLOW_PARTIAL";
  policyVersion: string;
  idempotencyKey: string;
  canonicalRequestHash: string;
}

type TemporalRelation =
  | "CURRENT_AT_SNAPSHOT"
  | "HISTORICAL_AT_SNAPSHOT"
  | "SCHEDULED_AT_SNAPSHOT";

interface TemporalPerceptionFact {
  factVersionId: string;
  objectType: TemporalObjectType;
  objectId: string;
  attributeKey: string;
  canonicalValue: unknown;
  validTime: ValidTimeRange;
  temporalRelation: TemporalRelation;
  sourceWatermark: string;
  citationHash: string;
}

type TemporalOmissionCode =
  | "NOT_AUTHORIZED"
  | "NOT_RECORDED"
  | "OUTSIDE_RETENTION"
  | "COLUMNAR_LAG"
  | "VECTOR_LAG"
  | "PROCEDURE_LAG"
  | "ANN_UNDERFILLED"
  | "BUDGET_EXHAUSTED"
  | "PARTITION_UNAVAILABLE";

interface TemporalGroundingPacket {
  accountId: string;
  packetId: string;
  requestId: string;
  validAt: string;
  observedAtSnapshotToken: string;
  facts: TemporalPerceptionFact[];
  procedures: TemporalProcedureRef[];
  semanticMatches: TemporalSemanticMatch[];
  sourceCitationHashes: string[];
  omissions: Array<{
    code: TemporalOmissionCode;
    selectorHash: string;
    detailCode?: string;
  }>;
  hasMore: boolean;
  nextCursor?: string;
  executionEnvelopeHash: string;
  policyVersion: string;
  releaseVisibilityEpoch: string;
  packetHash: string;
  releaseAuditEventHash: string;
}

interface TemporalProcedureRef {
  procedureId: string;
  procedureVersionId: string;
  instructionHash: string;
  validTime: ValidTimeRange;
  preconditionHash: string;
  requiredContractId: string;
  temporalRelation: TemporalRelation;
  artifact: TemporalProcedureArtifact;
}

interface TemporalProcedureArtifact {
  canonicalInstructions: unknown;
  canonicalPreconditions: unknown;
  allowedToolScopes: string[];
  budget: {
    maxSteps: number;
    maxToolCalls: number;
    maxRows: string;
    maxWallTimeMs: number;
  };
  artifactHash: string;
  signingKeyVersion: number;
  signature: string;
}

interface TemporalSemanticMatch {
  rank: number;
  canonicalScore: string;
  factVersionId?: string;
  procedureVersionId?: string;
  graphArtifactId: string;
  graphArtifactHash: string;
  candidateAttestationHash: string;
}

interface TemporalMutationRequest {
  accountId: string;
  sourceEventId: string;
  idempotencyKey: string;
  object: TemporalObjectRef;
  attributeKey: string;
  valueType: TemporalFactVersion["valueType"];
  canonicalValue: unknown;
  validTime: ValidTimeRange;
  correctionReasonCode?: string;
  canonicalMutationHash: string;
}

interface TemporalPageCursor {
  version: 1;
  accountId: string;
  principalId: string;
  scopeHash: string;
  snapshotId: string;
  validTimeHash: string;
  lastSortTuple: string[];
  envelopeHash: string;
  expiresAt: string;
}

interface TemporalExecutionEnvelope {
  accountId: string;
  requestId: string;
  maxExactObjects: number;
  maxAttributeKeys: number;
  maxFacts: number;
  maxHistoryVersionsPerTimeline: number;
  maxTemporalPartitions: number;
  maxColumnarRows: string;
  maxColumnarBytes: string;
  maxAggregateGroups: number;
  maxResultBytes: string;
  maxVectorCandidates: number;
  maxTopK: number;
  maxValidTimeBuckets: number;
  maxProcedureVersions: number;
  maxCorrectionSplits: number;
  maxWallTimeMs: number;
  allowColdHistory: boolean;
  consistency: "ROW_STRONG" | "PINNED_CROSS_LAYER";
  envelopeHash: string;
}
```

`canonicalValue` is validated against the board or procedure contract before storage;
it is not arbitrary agent-generated JSON. A contract fixes allowed attribute keys,
value types, canonicalization rules, temporal behavior, and indexed filter operators.

The perception packet labels time explicitly. The relation is computed from a fact's
valid range against the snapshot's pinned `evaluationTime`: a range containing that
instant is current, one whose exclusive upper bound is less than or equal to it is
historical, and one whose inclusive lower bound is greater than it is scheduled.
`validAt` chooses the fact; `evaluationTime` labels it. Neither uses the
gateway's later wall clock, and a pinned packet never compares against latest state.

## SQL control-plane schema

The following PostgreSQL-compatible DDL describes the logical contract. Production
mondayDB may map it to its hybrid row/columnar storage. `btree_gist` is shown for the
active-interval invariant; a native mondayDB implementation may enforce the same
constraint in its timeline transaction coordinator.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE temporal_object_type AS ENUM
  ('BOARD', 'BOARD_ITEM', 'UPDATE', 'WORKFLOW', 'MEMORY', 'PROCEDURE');

CREATE TYPE temporal_value_type AS ENUM
  ('BOOLEAN', 'NUMBER', 'STRING', 'DATE_TIME', 'OBJECT_REF', 'JSON');

CREATE TYPE temporal_snapshot_consistency AS ENUM
  ('LATEST_COMMITTED', 'PINNED');

CREATE TYPE temporal_grounding_state AS ENUM
  ('ADMITTED', 'RUNNING', 'COMPLETE', 'PARTIAL', 'CANCELLED', 'REJECTED', 'FAILED');

CREATE TABLE agentic_tenant_partition (
  account_id              BIGINT NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  placement_binding_hash  BYTEA NOT NULL CHECK (octet_length(placement_binding_hash) = 32),
  state                   TEXT NOT NULL CHECK (state IN ('ACTIVE', 'DRAINING', 'RETIRED')),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, tenant_partition_id)
);

CREATE TABLE agentic_temporal_visibility_epoch (
  account_id              BIGINT NOT NULL,
  current_epoch           BIGINT NOT NULL CHECK (current_epoch > 0),
  updated_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agentic_temporal_visibility_epoch_event (
  account_id              BIGINT NOT NULL,
  visibility_epoch       BIGINT NOT NULL CHECK (visibility_epoch > 0),
  event_root              BYTEA NOT NULL CHECK (octet_length(event_root) = 32),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, visibility_epoch)
);

ALTER TABLE agentic_temporal_visibility_epoch
  ADD CONSTRAINT current_visibility_epoch_event_fk
  FOREIGN KEY (account_id, current_epoch)
  REFERENCES agentic_temporal_visibility_epoch_event
    (account_id, visibility_epoch);

CREATE TABLE agentic_temporal_source_identity (
  account_id              BIGINT NOT NULL,
  source_identity_id      UUID NOT NULL,
  object_type             temporal_object_type NOT NULL,
  object_id_hash          BYTEA NOT NULL CHECK (octet_length(object_id_hash) = 32),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_identity_id),
  UNIQUE (account_id, object_type, object_id_hash)
);

CREATE TABLE agentic_temporal_revocation_fence (
  account_id              BIGINT NOT NULL,
  source_identity_id      UUID NOT NULL,
  revoked_at_epoch        BIGINT NOT NULL CHECK (revoked_at_epoch > 0),
  fence_hash              BYTEA NOT NULL CHECK (octet_length(fence_hash) = 32),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_identity_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_temporal_source_identity (account_id, source_identity_id),
  FOREIGN KEY (account_id, revoked_at_epoch)
    REFERENCES agentic_temporal_visibility_epoch_event
      (account_id, visibility_epoch)
);

CREATE TABLE agentic_temporal_transaction_decision (
  account_id              BIGINT NOT NULL,
  transaction_id          UUID NOT NULL,
  authority_commit_epoch  BIGINT NOT NULL CHECK (authority_commit_epoch > 0),
  participant_root        BYTEA NOT NULL CHECK (octet_length(participant_root) = 32),
  decision                TEXT NOT NULL CHECK (decision IN ('COMMITTED', 'ABORTED')),
  decided_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, transaction_id),
  UNIQUE (account_id, authority_commit_epoch)
);

CREATE TABLE agentic_temporal_transaction_participant (
  account_id              BIGINT NOT NULL,
  transaction_id          UUID NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  local_commit_sequence   BIGINT NOT NULL CHECK (local_commit_sequence > 0),
  effects_root            BYTEA NOT NULL CHECK (octet_length(effects_root) = 32),
  last_outbox_ordinal     INTEGER NOT NULL CHECK (last_outbox_ordinal >= 0),
  PRIMARY KEY (account_id, transaction_id, tenant_partition_id),
  UNIQUE (
    account_id, tenant_partition_id, local_commit_sequence, transaction_id
  ),
  FOREIGN KEY (account_id, transaction_id)
    REFERENCES agentic_temporal_transaction_decision (account_id, transaction_id),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id)
);

CREATE TABLE agentic_temporal_partition_apply_ledger (
  account_id              BIGINT NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  local_commit_sequence   BIGINT NOT NULL CHECK (local_commit_sequence > 0),
  transaction_id          UUID NOT NULL,
  effects_root            BYTEA NOT NULL CHECK (octet_length(effects_root) = 32),
  apply_state             TEXT NOT NULL
    CHECK (apply_state IN ('PENDING', 'APPLIED', 'ABORT_SKIPPED', 'GAP')),
  applied_at              TIMESTAMPTZ,
  PRIMARY KEY (account_id, tenant_partition_id, local_commit_sequence),
  UNIQUE (
    account_id, tenant_partition_id, local_commit_sequence, transaction_id
  ),
  FOREIGN KEY (
    account_id, tenant_partition_id, local_commit_sequence, transaction_id
  ) REFERENCES agentic_temporal_transaction_participant (
    account_id, tenant_partition_id, local_commit_sequence, transaction_id
  )
);

CREATE TABLE agentic_temporal_authority_checkpoint (
  account_id              BIGINT NOT NULL,
  checkpoint_id           UUID NOT NULL,
  authority_read_epoch    BIGINT NOT NULL CHECK (authority_read_epoch > 0),
  ordered_decision_root   BYTEA NOT NULL CHECK (octet_length(ordered_decision_root) = 32),
  signing_key_version     INTEGER NOT NULL,
  signature               BYTEA NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  UNIQUE (account_id, authority_read_epoch, ordered_decision_root),
  UNIQUE (account_id, checkpoint_id, ordered_decision_root)
);

CREATE TABLE agentic_temporal_source_event_receipt (
  account_id                BIGINT NOT NULL,
  source_event_id           UUID NOT NULL,
  idempotency_key_hash      BYTEA NOT NULL CHECK (octet_length(idempotency_key_hash) = 32),
  canonical_mutation_hash   BYTEA NOT NULL CHECK (octet_length(canonical_mutation_hash) = 32),
  state                     TEXT NOT NULL CHECK (state IN ('CLAIMED', 'FINALIZED', 'FAILED')),
  transaction_id            UUID,
  result_root               BYTEA,
  created_at                TIMESTAMPTZ NOT NULL,
  finalized_at              TIMESTAMPTZ,
  PRIMARY KEY (account_id, source_event_id),
  UNIQUE (account_id, idempotency_key_hash),
  FOREIGN KEY (account_id, transaction_id)
    REFERENCES agentic_temporal_transaction_decision (account_id, transaction_id),
  CHECK (result_root IS NULL OR octet_length(result_root) = 32),
  CHECK (
    (state = 'CLAIMED' AND transaction_id IS NULL AND result_root IS NULL)
    OR (state = 'FINALIZED' AND transaction_id IS NOT NULL AND result_root IS NOT NULL)
    OR state = 'FAILED'
  )
);

CREATE TABLE agentic_temporal_mutation_job (
  account_id                BIGINT NOT NULL,
  source_event_id           UUID NOT NULL,
  state                     TEXT NOT NULL
    CHECK (state IN ('ADMITTED_FOR_REVIEW', 'RUNNING', 'COMMITTED', 'CANCELLED', 'REJECTED', 'FAILED')),
  progress_permille         INTEGER NOT NULL CHECK (progress_permille BETWEEN 0 AND 1000),
  next_interval_cursor      BYTEA,
  cancellation_requested_at TIMESTAMPTZ,
  result_root               BYTEA,
  updated_at                TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_event_id),
  FOREIGN KEY (account_id, source_event_id)
    REFERENCES agentic_temporal_source_event_receipt (account_id, source_event_id),
  CHECK (result_root IS NULL OR octet_length(result_root) = 32)
);

CREATE TABLE agentic_temporal_mutation_batch (
  account_id              BIGINT NOT NULL,
  source_event_id         UUID NOT NULL,
  batch_sequence         INTEGER NOT NULL CHECK (batch_sequence > 0),
  transaction_id          UUID NOT NULL,
  interval_cursor_hash    BYTEA NOT NULL CHECK (octet_length(interval_cursor_hash) = 32),
  result_hash             BYTEA NOT NULL CHECK (octet_length(result_hash) = 32),
  committed_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, source_event_id, batch_sequence),
  FOREIGN KEY (account_id, source_event_id)
    REFERENCES agentic_temporal_mutation_job (account_id, source_event_id),
  FOREIGN KEY (account_id, transaction_id)
    REFERENCES agentic_temporal_transaction_decision (account_id, transaction_id)
);

CREATE TABLE agentic_temporal_enrichment_outbox (
  account_id              BIGINT NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  commit_sequence         BIGINT NOT NULL CHECK (commit_sequence > 0),
  outbox_ordinal          INTEGER NOT NULL CHECK (outbox_ordinal >= 0),
  transaction_id          UUID NOT NULL,
  event_type              TEXT NOT NULL,
  canonical_payload       JSONB NOT NULL,
  payload_hash            BYTEA NOT NULL CHECK (octet_length(payload_hash) = 32),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    account_id, tenant_partition_id, commit_sequence, outbox_ordinal
  ),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id),
  FOREIGN KEY (account_id, transaction_id)
    REFERENCES agentic_temporal_transaction_decision (account_id, transaction_id)
);

CREATE TABLE agentic_temporal_timeline (
  account_id              BIGINT NOT NULL,
  timeline_id             UUID NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  object_type             temporal_object_type NOT NULL,
  object_id               TEXT NOT NULL,
  board_id                BIGINT,
  attribute_key           TEXT NOT NULL,
  value_type              temporal_value_type NOT NULL,
  contract_id             UUID NOT NULL,
  next_timeline_sequence  BIGINT NOT NULL DEFAULT 1 CHECK (next_timeline_sequence > 0),
  latest_value_hash       BYTEA,
  policy_version          TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL,
  updated_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, timeline_id),
  UNIQUE (account_id, object_type, object_id, attribute_key),
  UNIQUE (account_id, timeline_id, tenant_partition_id),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id),
  CHECK (octet_length(object_id) BETWEEN 1 AND 512),
  CHECK (octet_length(attribute_key) BETWEEN 1 AND 256)
);

CREATE INDEX temporal_timeline_board_lookup
  ON agentic_temporal_timeline
  (account_id, board_id, object_id, attribute_key, timeline_id)
  WHERE board_id IS NOT NULL;

CREATE TABLE agentic_temporal_fact_version (
  account_id              BIGINT NOT NULL,
  fact_version_id         UUID NOT NULL,
  timeline_id             UUID NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  source_identity_id      UUID NOT NULL,
  timeline_sequence       BIGINT NOT NULL CHECK (timeline_sequence > 0),
  valid_range             TSTZRANGE NOT NULL,
  system_from_sequence    BIGINT NOT NULL CHECK (system_from_sequence > 0),
  system_to_sequence      BIGINT,
  system_from_transaction_id UUID NOT NULL,
  system_to_transaction_id UUID,
  system_range            INT8RANGE GENERATED ALWAYS AS
    (int8range(system_from_sequence, system_to_sequence, '[)')) STORED,
  canonical_value         JSONB NOT NULL,
  value_hash              BYTEA NOT NULL CHECK (octet_length(value_hash) = 32),
  source_event_id         UUID NOT NULL,
  source_watermark        TEXT NOT NULL,
  policy_version          TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, fact_version_id),
  UNIQUE (account_id, timeline_id, timeline_sequence),
  UNIQUE (
    account_id, fact_version_id, timeline_id, tenant_partition_id
  ),
  FOREIGN KEY (account_id, timeline_id, tenant_partition_id)
    REFERENCES agentic_temporal_timeline
      (account_id, timeline_id, tenant_partition_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_temporal_source_identity
      (account_id, source_identity_id),
  FOREIGN KEY (
    account_id, tenant_partition_id, system_from_sequence,
    system_from_transaction_id
  ) REFERENCES agentic_temporal_transaction_participant (
    account_id, tenant_partition_id, local_commit_sequence, transaction_id
  ),
  FOREIGN KEY (account_id, system_to_transaction_id)
    REFERENCES agentic_temporal_transaction_decision
      (account_id, transaction_id),
  CHECK (NOT isempty(valid_range)),
  CHECK (lower_inc(valid_range) AND NOT upper_inc(valid_range)),
  CHECK (
    system_to_sequence IS NULL
    OR system_to_sequence > system_from_sequence
  ),
  CHECK (
    (system_to_sequence IS NULL AND system_to_transaction_id IS NULL)
    OR (system_to_sequence IS NOT NULL AND system_to_transaction_id IS NOT NULL)
  )
);

ALTER TABLE agentic_temporal_fact_version
  ADD CONSTRAINT no_overlapping_bitemporal_fact_intervals
  EXCLUDE USING GIST (
    account_id WITH =,
    timeline_id WITH =,
    valid_range WITH &&,
    system_range WITH &&
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX temporal_fact_current_point
  ON agentic_temporal_fact_version
  USING GIST (account_id, timeline_id, valid_range)
  WHERE system_to_sequence IS NULL;

CREATE INDEX temporal_fact_bitemporal_point
  ON agentic_temporal_fact_version
  USING GIST (
    account_id, tenant_partition_id, timeline_id, valid_range, system_range
  );

CREATE INDEX temporal_fact_history_page
  ON agentic_temporal_fact_version
  (account_id, timeline_id, timeline_sequence DESC, fact_version_id);

CREATE TABLE agentic_temporal_columnar_manifest (
  account_id              BIGINT NOT NULL,
  manifest_id             UUID NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  applied_decision_prefix BIGINT NOT NULL CHECK (applied_decision_prefix > 0),
  artifact_root           BYTEA NOT NULL CHECK (octet_length(artifact_root) = 32),
  manifest_hash           BYTEA NOT NULL CHECK (octet_length(manifest_hash) = 32),
  state                   TEXT NOT NULL CHECK (state IN ('ACTIVE', 'RETAINED', 'RETIRED')),
  retain_until            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, manifest_id),
  UNIQUE (account_id, manifest_id, tenant_partition_id, manifest_hash),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id)
);

CREATE TABLE agentic_temporal_columnar_manifest_member (
  account_id              BIGINT NOT NULL,
  manifest_id             UUID NOT NULL,
  member_ordinal          INTEGER NOT NULL CHECK (member_ordinal >= 0),
  artifact_id             UUID NOT NULL,
  artifact_hash           BYTEA NOT NULL CHECK (octet_length(artifact_hash) = 32),
  source_identity_root    BYTEA NOT NULL CHECK (octet_length(source_identity_root) = 32),
  PRIMARY KEY (account_id, manifest_id, member_ordinal),
  UNIQUE (account_id, manifest_id, artifact_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES agentic_temporal_columnar_manifest (account_id, manifest_id)
);

CREATE TABLE agentic_temporal_vector_manifest (
  account_id              BIGINT NOT NULL,
  manifest_id             UUID NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  applied_decision_prefix BIGINT NOT NULL CHECK (applied_decision_prefix > 0),
  artifact_root           BYTEA NOT NULL CHECK (octet_length(artifact_root) = 32),
  manifest_hash           BYTEA NOT NULL CHECK (octet_length(manifest_hash) = 32),
  state                   TEXT NOT NULL CHECK (state IN ('ACTIVE', 'RETAINED', 'RETIRED')),
  retain_until            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, manifest_id),
  UNIQUE (account_id, manifest_id, tenant_partition_id, manifest_hash),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id)
);

CREATE TABLE agentic_temporal_procedure_manifest (
  account_id              BIGINT NOT NULL,
  manifest_id             UUID NOT NULL,
  tenant_partition_id     UUID NOT NULL,
  applied_decision_prefix BIGINT NOT NULL CHECK (applied_decision_prefix > 0),
  artifact_root           BYTEA NOT NULL CHECK (octet_length(artifact_root) = 32),
  manifest_hash           BYTEA NOT NULL CHECK (octet_length(manifest_hash) = 32),
  state                   TEXT NOT NULL CHECK (state IN ('ACTIVE', 'RETAINED', 'RETIRED')),
  retain_until            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, manifest_id),
  UNIQUE (account_id, manifest_id, tenant_partition_id, manifest_hash),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id)
);

CREATE TABLE agentic_temporal_procedure_manifest_member (
  account_id              BIGINT NOT NULL,
  manifest_id             UUID NOT NULL,
  member_ordinal          INTEGER NOT NULL CHECK (member_ordinal >= 0),
  procedure_version_id    UUID NOT NULL,
  artifact_hash           BYTEA NOT NULL CHECK (octet_length(artifact_hash) = 32),
  source_identity_id      UUID NOT NULL,
  PRIMARY KEY (account_id, manifest_id, member_ordinal),
  UNIQUE (account_id, manifest_id, procedure_version_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES agentic_temporal_procedure_manifest (account_id, manifest_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_temporal_source_identity
      (account_id, source_identity_id)
);

CREATE TABLE agentic_temporal_snapshot (
  account_id              BIGINT NOT NULL,
  snapshot_id             UUID NOT NULL,
  consistency             temporal_snapshot_consistency NOT NULL,
  authority_checkpoint_id UUID NOT NULL,
  authority_read_epoch    BIGINT NOT NULL CHECK (authority_read_epoch > 0),
  coordinator_decision_root BYTEA NOT NULL
    CHECK (octet_length(coordinator_decision_root) = 32),
  evaluation_time         TIMESTAMPTZ NOT NULL,
  selection_visibility_epoch BIGINT NOT NULL
    CHECK (selection_visibility_epoch > 0),
  principal_id            UUID NOT NULL,
  purpose_id              UUID NOT NULL,
  policy_version          TEXT NOT NULL,
  manifest_hash           BYTEA NOT NULL CHECK (octet_length(manifest_hash) = 32),
  token_key_version       INTEGER NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, snapshot_id),
  FOREIGN KEY (
    account_id, authority_checkpoint_id, coordinator_decision_root
  )
    REFERENCES agentic_temporal_authority_checkpoint
      (account_id, checkpoint_id, ordered_decision_root),
  FOREIGN KEY (account_id, selection_visibility_epoch)
    REFERENCES agentic_temporal_visibility_epoch_event
      (account_id, visibility_epoch)
);

CREATE TABLE agentic_temporal_snapshot_partition (
  account_id                BIGINT NOT NULL,
  snapshot_id               UUID NOT NULL,
  tenant_partition_id       UUID NOT NULL,
  visible_commit_sequence   BIGINT NOT NULL CHECK (visible_commit_sequence > 0),
  applied_decision_prefix   BIGINT NOT NULL CHECK (applied_decision_prefix > 0),
  decision_membership_proof BYTEA NOT NULL,
  decision_membership_proof_hash BYTEA NOT NULL
    CHECK (octet_length(decision_membership_proof_hash) = 32),
  row_watermark             TEXT NOT NULL,
  columnar_manifest_id      UUID,
  columnar_manifest_hash    BYTEA,
  columnar_applied_prefix   BIGINT,
  vector_manifest_id        UUID,
  vector_manifest_hash      BYTEA,
  vector_applied_prefix     BIGINT,
  procedure_manifest_id     UUID,
  procedure_manifest_hash   BYTEA,
  procedure_applied_prefix  BIGINT,
  member_hash               BYTEA NOT NULL CHECK (octet_length(member_hash) = 32),
  PRIMARY KEY (account_id, snapshot_id, tenant_partition_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agentic_temporal_snapshot (account_id, snapshot_id),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id),
  FOREIGN KEY (
    account_id, columnar_manifest_id, tenant_partition_id,
    columnar_manifest_hash
  ) REFERENCES agentic_temporal_columnar_manifest (
    account_id, manifest_id, tenant_partition_id, manifest_hash
  ),
  FOREIGN KEY (
    account_id, vector_manifest_id, tenant_partition_id,
    vector_manifest_hash
  ) REFERENCES agentic_temporal_vector_manifest (
    account_id, manifest_id, tenant_partition_id, manifest_hash
  ),
  FOREIGN KEY (
    account_id, procedure_manifest_id, tenant_partition_id,
    procedure_manifest_hash
  ) REFERENCES agentic_temporal_procedure_manifest (
    account_id, manifest_id, tenant_partition_id, manifest_hash
  ),
  CHECK (
    (columnar_manifest_id IS NULL AND columnar_manifest_hash IS NULL
      AND columnar_applied_prefix IS NULL)
    OR (columnar_manifest_id IS NOT NULL AND columnar_manifest_hash IS NOT NULL
      AND columnar_applied_prefix IS NOT NULL)
  ),
  CHECK (
    (vector_manifest_id IS NULL AND vector_manifest_hash IS NULL
      AND vector_applied_prefix IS NULL)
    OR (vector_manifest_id IS NOT NULL AND vector_manifest_hash IS NOT NULL
      AND vector_applied_prefix IS NOT NULL)
  ),
  CHECK (
    (procedure_manifest_id IS NULL AND procedure_manifest_hash IS NULL
      AND procedure_applied_prefix IS NULL)
    OR (procedure_manifest_id IS NOT NULL AND procedure_manifest_hash IS NOT NULL
      AND procedure_applied_prefix IS NOT NULL)
  ),
  CHECK (
    columnar_manifest_hash IS NULL
    OR octet_length(columnar_manifest_hash) = 32
  ),
  CHECK (
    vector_manifest_hash IS NULL OR octet_length(vector_manifest_hash) = 32
  ),
  CHECK (
    procedure_manifest_hash IS NULL
    OR octet_length(procedure_manifest_hash) = 32
  )
);

CREATE TABLE agentic_temporal_grounding_request (
  account_id              BIGINT NOT NULL,
  request_id              UUID NOT NULL,
  snapshot_id             UUID NOT NULL,
  principal_id            UUID NOT NULL,
  purpose_id              UUID NOT NULL,
  valid_at                TIMESTAMPTZ NOT NULL,
  canonical_selector_ast  JSONB NOT NULL,
  selector_hash           BYTEA NOT NULL CHECK (octet_length(selector_hash) = 32),
  canonical_request_hash  BYTEA NOT NULL CHECK (octet_length(canonical_request_hash) = 32),
  envelope_hash           BYTEA NOT NULL CHECK (octet_length(envelope_hash) = 32),
  completeness            TEXT NOT NULL
    CHECK (completeness IN ('REQUIRE_COMPLETE', 'ALLOW_PARTIAL')),
  policy_version          TEXT NOT NULL,
  idempotency_key_hash    BYTEA NOT NULL CHECK (octet_length(idempotency_key_hash) = 32),
  state                   temporal_grounding_state NOT NULL,
  rejection_code          TEXT,
  created_at              TIMESTAMPTZ NOT NULL,
  completed_at            TIMESTAMPTZ,
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, principal_id, idempotency_key_hash),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agentic_temporal_snapshot (account_id, snapshot_id)
);

CREATE INDEX temporal_grounding_request_status
  ON agentic_temporal_grounding_request
  (account_id, state, created_at, request_id);

CREATE TABLE agentic_temporal_grounding_packet (
  account_id              BIGINT NOT NULL,
  packet_id               UUID NOT NULL,
  request_id              UUID NOT NULL,
  packet_sequence         INTEGER NOT NULL CHECK (packet_sequence > 0),
  fact_count              INTEGER NOT NULL CHECK (fact_count >= 0),
  procedure_count         INTEGER NOT NULL CHECK (procedure_count >= 0),
  omission_count          INTEGER NOT NULL CHECK (omission_count >= 0),
  has_more                BOOLEAN NOT NULL,
  next_cursor_ciphertext  BYTEA,
  packet_ciphertext       BYTEA NOT NULL,
  sanitized_projection    JSONB NOT NULL,
  content_key_id          UUID NOT NULL,
  ordered_source_root     BYTEA NOT NULL CHECK (octet_length(ordered_source_root) = 32),
  packet_hash             BYTEA NOT NULL CHECK (octet_length(packet_hash) = 32),
  release_visibility_epoch BIGINT NOT NULL CHECK (release_visibility_epoch > 0),
  release_audit_event_hash BYTEA NOT NULL
    CHECK (octet_length(release_audit_event_hash) = 32),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, packet_id),
  UNIQUE (account_id, request_id, packet_sequence),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_temporal_grounding_request (account_id, request_id),
  FOREIGN KEY (account_id, release_visibility_epoch)
    REFERENCES agentic_temporal_visibility_epoch_event
      (account_id, visibility_epoch)
);

CREATE TABLE agentic_temporal_packet_source (
  account_id              BIGINT NOT NULL,
  packet_id               UUID NOT NULL,
  source_ordinal          INTEGER NOT NULL CHECK (source_ordinal >= 0),
  source_identity_id      UUID NOT NULL,
  selected_fact_hash      BYTEA NOT NULL CHECK (octet_length(selected_fact_hash) = 32),
  PRIMARY KEY (account_id, packet_id, source_ordinal),
  UNIQUE (account_id, packet_id, source_identity_id, selected_fact_hash),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agentic_temporal_grounding_packet (account_id, packet_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_temporal_source_identity
      (account_id, source_identity_id)
);

CREATE TABLE agentic_temporal_embedding (
  account_id                BIGINT NOT NULL,
  embedding_id              UUID NOT NULL,
  tenant_partition_id       UUID NOT NULL,
  fact_version_id           UUID NOT NULL,
  timeline_id               UUID NOT NULL,
  source_identity_id        UUID NOT NULL,
  valid_range               TSTZRANGE NOT NULL,
  system_from_sequence      BIGINT NOT NULL,
  system_to_sequence        BIGINT,
  valid_time_bucket_id      TEXT NOT NULL,
  embedding_model_version   TEXT NOT NULL,
  embedding_dimensions      INTEGER NOT NULL,
  embedding                 VECTOR(1536) NOT NULL,
  source_value_hash         BYTEA NOT NULL CHECK (octet_length(source_value_hash) = 32),
  policy_version            TEXT NOT NULL,
  visibility_scope_hash     BYTEA NOT NULL CHECK (octet_length(visibility_scope_hash) = 32),
  visibility_epoch_at_publish BIGINT NOT NULL
    CHECK (visibility_epoch_at_publish > 0),
  published_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, embedding_id),
  UNIQUE (
    account_id, fact_version_id, embedding_model_version, valid_time_bucket_id
  ),
  FOREIGN KEY (
    account_id, fact_version_id, timeline_id, tenant_partition_id
  ) REFERENCES agentic_temporal_fact_version (
    account_id, fact_version_id, timeline_id, tenant_partition_id
  ),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_temporal_source_identity
      (account_id, source_identity_id),
  FOREIGN KEY (account_id, visibility_epoch_at_publish)
    REFERENCES agentic_temporal_visibility_epoch_event
      (account_id, visibility_epoch),
  CHECK (system_from_sequence > 0),
  CHECK (NOT isempty(valid_range)),
  CHECK (lower_inc(valid_range) AND NOT upper_inc(valid_range)),
  CHECK (
    system_to_sequence IS NULL
    OR system_to_sequence > system_from_sequence
  ),
  CHECK (embedding_dimensions = 1536)
) PARTITION BY LIST (account_id);

CREATE INDEX temporal_embedding_metadata
  ON agentic_temporal_embedding
  (account_id, tenant_partition_id, valid_time_bucket_id,
   embedding_model_version, system_from_sequence, system_to_sequence);

-- Trusted placement automation creates an account staging leaf. There is deliberately
-- no DEFAULT partition and no HNSW index on this mutable source table.
CREATE TABLE agentic_temporal_embedding_account_42
  PARTITION OF agentic_temporal_embedding FOR VALUES IN (42);

CREATE TABLE agentic_temporal_vector_graph_artifact (
  account_id                BIGINT NOT NULL,
  graph_artifact_id         UUID NOT NULL,
  tenant_partition_id       UUID NOT NULL,
  embedding_model_version   TEXT NOT NULL,
  valid_time_bucket_id      TEXT NOT NULL,
  implementation_version    TEXT NOT NULL,
  distance_metric           TEXT NOT NULL CHECK (distance_metric = 'COSINE'),
  applied_decision_prefix   BIGINT NOT NULL CHECK (applied_decision_prefix > 0),
  artifact_hash             BYTEA NOT NULL CHECK (octet_length(artifact_hash) = 32),
  ordered_member_root       BYTEA NOT NULL CHECK (octet_length(ordered_member_root) = 32),
  state                     TEXT NOT NULL CHECK (state IN ('BUILDING', 'ACTIVE', 'RETAINED', 'RETIRED')),
  sealing_key_version       INTEGER NOT NULL,
  sealing_signature         BYTEA NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL,
  retain_until              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, graph_artifact_id),
  UNIQUE (account_id, graph_artifact_id, artifact_hash),
  UNIQUE (
    account_id, tenant_partition_id, embedding_model_version,
    valid_time_bucket_id, artifact_hash
  ),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id)
);

CREATE TABLE agentic_temporal_vector_manifest_member (
  account_id              BIGINT NOT NULL,
  manifest_id             UUID NOT NULL,
  member_ordinal          INTEGER NOT NULL CHECK (member_ordinal >= 0),
  graph_artifact_id       UUID NOT NULL,
  graph_artifact_hash     BYTEA NOT NULL CHECK (octet_length(graph_artifact_hash) = 32),
  PRIMARY KEY (account_id, manifest_id, member_ordinal),
  UNIQUE (account_id, manifest_id, graph_artifact_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES agentic_temporal_vector_manifest (account_id, manifest_id),
  FOREIGN KEY (account_id, graph_artifact_id, graph_artifact_hash)
    REFERENCES agentic_temporal_vector_graph_artifact
      (account_id, graph_artifact_id, artifact_hash)
);

-- A graph generation is a separate sealed relation or external pgvector-compatible
-- file. This concrete leaf is loaded only while BUILDING. Publication computes its
-- ordered-member/index hash, signs the artifact, sets ACTIVE, and revokes all mutation
-- privileges before a manifest can reference it.
CREATE TABLE agentic_temporal_graph_a42_v7_2026q3_g17 (
  account_id          BIGINT NOT NULL DEFAULT 42 CHECK (account_id = 42),
  graph_artifact_id   UUID NOT NULL,
  embedding_id        UUID NOT NULL,
  embedding           VECTOR(1536) NOT NULL,
  PRIMARY KEY (account_id, graph_artifact_id, embedding_id),
  FOREIGN KEY (account_id, graph_artifact_id)
    REFERENCES agentic_temporal_vector_graph_artifact
      (account_id, graph_artifact_id),
  FOREIGN KEY (account_id, embedding_id)
    REFERENCES agentic_temporal_embedding (account_id, embedding_id)
);

CREATE INDEX temporal_graph_a42_v7_2026q3_g17_hnsw
  ON agentic_temporal_graph_a42_v7_2026q3_g17
  USING hnsw (embedding vector_cosine_ops);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON agentic_temporal_graph_a42_v7_2026q3_g17
  FROM agentic_vector_serving_role;

CREATE TABLE agentic_temporal_vector_attestation (
  account_id                BIGINT NOT NULL,
  request_id                UUID NOT NULL,
  graph_artifact_id         UUID NOT NULL,
  query_embedding_hash      BYTEA NOT NULL CHECK (octet_length(query_embedding_hash) = 32),
  canonical_parameter_set   JSONB NOT NULL,
  metadata_filter_hash      BYTEA NOT NULL CHECK (octet_length(metadata_filter_hash) = 32),
  ordered_candidates        JSONB NOT NULL,
  candidate_root            BYTEA NOT NULL CHECK (octet_length(candidate_root) = 32),
  attestation_hash          BYTEA NOT NULL CHECK (octet_length(attestation_hash) = 32),
  signing_key_version       INTEGER NOT NULL,
  signature                 BYTEA NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, request_id, graph_artifact_id),
  FOREIGN KEY (account_id, graph_artifact_id)
    REFERENCES agentic_temporal_vector_graph_artifact
      (account_id, graph_artifact_id)
);

CREATE TABLE agentic_temporal_procedure_artifact (
  account_id                BIGINT NOT NULL,
  procedure_version_id      UUID NOT NULL,
  canonical_instructions    JSONB NOT NULL,
  canonical_preconditions   JSONB NOT NULL,
  allowed_tool_scopes       JSONB NOT NULL,
  canonical_budget          JSONB NOT NULL,
  instruction_hash          BYTEA NOT NULL CHECK (octet_length(instruction_hash) = 32),
  precondition_hash         BYTEA NOT NULL CHECK (octet_length(precondition_hash) = 32),
  tool_scope_hash           BYTEA NOT NULL CHECK (octet_length(tool_scope_hash) = 32),
  budget_hash               BYTEA NOT NULL CHECK (octet_length(budget_hash) = 32),
  artifact_hash             BYTEA NOT NULL CHECK (octet_length(artifact_hash) = 32),
  signing_key_version       INTEGER NOT NULL,
  signature                 BYTEA NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, procedure_version_id),
  UNIQUE (
    account_id, procedure_version_id, instruction_hash, precondition_hash
  )
);

ALTER TABLE agentic_temporal_procedure_manifest_member
  ADD CONSTRAINT procedure_manifest_member_artifact_fk
  FOREIGN KEY (account_id, procedure_version_id)
  REFERENCES agentic_temporal_procedure_artifact
    (account_id, procedure_version_id);

CREATE TABLE agentic_temporal_procedure_binding (
  account_id                BIGINT NOT NULL,
  procedure_id              UUID NOT NULL,
  procedure_version_id      UUID NOT NULL,
  tenant_partition_id       UUID NOT NULL,
  source_identity_id        UUID NOT NULL,
  scope_key                 TEXT NOT NULL,
  valid_range               TSTZRANGE NOT NULL,
  system_from_sequence      BIGINT NOT NULL,
  system_to_sequence        BIGINT,
  system_range              INT8RANGE GENERATED ALWAYS AS
    (int8range(system_from_sequence, system_to_sequence, '[)')) STORED,
  instruction_hash          BYTEA NOT NULL CHECK (octet_length(instruction_hash) = 32),
  precondition_hash         BYTEA NOT NULL CHECK (octet_length(precondition_hash) = 32),
  required_contract_id      UUID NOT NULL,
  policy_version            TEXT NOT NULL,
  visibility_epoch_at_publish BIGINT NOT NULL
    CHECK (visibility_epoch_at_publish > 0),
  created_at                TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, procedure_version_id),
  UNIQUE (
    account_id, procedure_id, scope_key, valid_range, system_from_sequence
  ),
  FOREIGN KEY (account_id, tenant_partition_id)
    REFERENCES agentic_tenant_partition (account_id, tenant_partition_id),
  FOREIGN KEY (
    account_id, procedure_version_id, instruction_hash, precondition_hash
  ) REFERENCES agentic_temporal_procedure_artifact (
    account_id, procedure_version_id, instruction_hash, precondition_hash
  ),
  FOREIGN KEY (account_id, source_identity_id)
    REFERENCES agentic_temporal_source_identity
      (account_id, source_identity_id),
  FOREIGN KEY (account_id, visibility_epoch_at_publish)
    REFERENCES agentic_temporal_visibility_epoch_event
      (account_id, visibility_epoch),
  CHECK (system_from_sequence > 0),
  CHECK (NOT isempty(valid_range)),
  CHECK (lower_inc(valid_range) AND NOT upper_inc(valid_range)),
  CHECK (
    system_to_sequence IS NULL
    OR system_to_sequence > system_from_sequence
  )
);

ALTER TABLE agentic_temporal_procedure_binding
  ADD CONSTRAINT no_overlapping_bitemporal_procedure_intervals
  EXCLUDE USING GIST (
    account_id WITH =,
    procedure_id WITH =,
    scope_key WITH =,
    valid_range WITH &&,
    system_range WITH &&
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX temporal_procedure_asof
  ON agentic_temporal_procedure_binding
  USING GIST (
    account_id, tenant_partition_id, scope_key, valid_range, system_range
  );

CREATE TABLE agentic_temporal_audit_head (
  account_id              BIGINT NOT NULL,
  chain_partition         SMALLINT NOT NULL,
  next_sequence_no        BIGINT NOT NULL CHECK (next_sequence_no > 0),
  head_hash               BYTEA NOT NULL CHECK (octet_length(head_hash) = 32),
  updated_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, chain_partition)
);

CREATE TABLE agentic_temporal_audit_event (
  account_id              BIGINT NOT NULL,
  chain_partition         SMALLINT NOT NULL,
  sequence_no            BIGINT NOT NULL,
  request_id              UUID,
  timeline_id             UUID,
  event_type              TEXT NOT NULL,
  payload_schema_version  INTEGER NOT NULL,
  hash_algorithm          TEXT NOT NULL CHECK (hash_algorithm = 'SHA-256'),
  canonical_payload       JSONB NOT NULL,
  canonical_payload_hash  BYTEA NOT NULL CHECK (octet_length(canonical_payload_hash) = 32),
  previous_event_hash     BYTEA NOT NULL CHECK (octet_length(previous_event_hash) = 32),
  event_hash              BYTEA NOT NULL CHECK (octet_length(event_hash) = 32),
  created_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, chain_partition, sequence_no),
  UNIQUE (account_id, chain_partition, event_hash)
);

CREATE TABLE agentic_temporal_audit_checkpoint (
  account_id              BIGINT NOT NULL,
  checkpoint_id           UUID NOT NULL,
  checkpoint_sequence     BIGINT NOT NULL CHECK (checkpoint_sequence > 0),
  canonical_ordered_heads JSONB NOT NULL,
  covered_event_count     BIGINT NOT NULL CHECK (covered_event_count >= 0),
  checkpoint_hash         BYTEA NOT NULL CHECK (octet_length(checkpoint_hash) = 32),
  signing_key_version     INTEGER NOT NULL,
  signature               BYTEA NOT NULL,
  anchored_at             TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  UNIQUE (account_id, checkpoint_sequence)
);
```

Production migrations physically place every table by an account-derived placement
key. The embedding DDL makes the strongest requirement concrete: HNSW has no parent or
default graph, so traversal cannot begin until trusted automation resolves one account
leaf. The placement service returns a short-lived capability bound to `account_id`,
`tenant_partition_id`, storage class, graph artifact, expiry, and policy version. A
caller cannot turn a text partition ID into cross-tenant storage access.

### Mandatory tenant access pattern

The API gateway derives `account_id` from the authenticated principal. It never
accepts tenant scope from agent-generated text. Application roles must also be
protected by row-level security or an equivalent native policy:

```sql
ALTER TABLE agentic_temporal_fact_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_temporal_fact_version FORCE ROW LEVEL SECURITY;

CREATE POLICY temporal_fact_tenant_policy
  ON agentic_temporal_fact_version
  USING (account_id = current_setting('monday.account_id')::BIGINT)
  WITH CHECK (account_id = current_setting('monday.account_id')::BIGINT);
```

The migration generator enumerates every catalog relation containing `account_id`,
including `agentic_tenant_partition`, all `agentic_temporal_*` tables, and account leaves,
emits equivalent `ENABLE`, `FORCE`, `USING`, and `WITH CHECK` statements, and fails the
migration if any table with `account_id` lacks a forced policy. CI verifies that list
against the catalog rather than relying on this one representative statement.
Serving, vector, columnar, compaction, and audit roles receive separate capabilities.
Table owners never serve requests; `BYPASSRLS` is prohibited. Migration and break-glass
roles are unavailable to serving processes and emit independently anchored events.

## Deterministic write and correction lifecycle

### 1. Compile the temporal mutation

The compiler resolves the object and attribute through its versioned data contract,
derives `account_id` and placement server-side, canonicalizes the typed value, and
validates the half-open valid range. If the producer omits `valid_from`, the server
uses the transaction's recorded effective time and persists that choice in the
canonical event. It never asks a model to fill a missing date.

The request must carry a unique source event ID and idempotency key. The service first
claims `agentic_temporal_source_event_receipt` by both account-scoped keys with state
`CLAIMED` and the canonical mutation hash; transaction/result fields remain null.
After commit, finalization binds the durable coordinator decision and result root.
Replaying either key with the same hash returns the claim, job, or final result.
Reusing either key with any different object, range, value, or hash returns
`SOURCE_EVENT_CONFLICT`; changing timeline or valid range cannot bypass idempotency.

### 2. Commit one timeline atomically

The row transaction:

1. locks `(account_id, timeline_id)` through `agentic_temporal_timeline`;
2. allocates a fenced local partition sequence and coordinator transaction ID;
3. reads only current fact versions whose indexed valid ranges overlap the correction;
4. rejects or queues the mutation if overlap would exceed `maxCorrectionSplits`;
5. sets each replaced row's `system_to_sequence` exactly once;
6. inserts the replacement and any left/right carry-forward intervals needed to keep
   the current valid-time timeline non-overlapping;
7. advances `next_timeline_sequence` and `latest_value_hash`;
8. finalizes the claimed source receipt and appends the canonical audit event and one
   or more transactional enrichment outbox records; and
9. commits.

Only system-interval closure metadata is mutable, once, through a stored procedure that
checks `OLD.system_to_sequence IS NULL`; serving roles have no direct `UPDATE` grant.
Canonical values, valid ranges, source events, and hashes on an existing fact version
never change. A correction creates new fact versions. The deferred two-dimensional
exclusion constraint proves that no versions overlap in both valid and system time,
including historical versions.

Transactions changing multiple attributes use mondayDB's coordinator. The durable
decision record binds a global authority commit epoch to the ordered participant root.
Each participant exposes a **gap-free applied decision prefix**: it cannot advance past
an undecided transaction, a missing outbox ordinal, or a committed transaction whose
local effects and tombstones are not durable. A committed multi-partition transaction
becomes snapshot-visible only when every participant named by its decision is included
in a dependency-closed frontier. An aborted transaction is skipped only after its
durable abort decision.

The coordinator and participant sequence allocators are quorum-replicated and fenced
by term. Failover may leave unused sequence gaps but cannot reuse a sequence or expose
an undecided transaction. Timeline locks have an envelope-bounded hold time; a
coordinator or audit-partition outage aborts the write before acknowledgement. This
keeps the audit/outbox work in the row transaction's existing failure domain instead
of adding vector or columnar availability to the write path.

A correction exceeding the synchronous split cap creates
`agentic_temporal_mutation_job`. Reviewed batches use keyset interval cursors and
append `agentic_temporal_mutation_batch` rows. Status and cancellation are available by
source event through GraphQL. Cancellation prevents the next batch but does not undo
committed child transactions; the final result root covers their ordered hashes.

### 3. Publish derived layers by watermark

The outbox publishes columnar segments, temporal embeddings, cache invalidations, and
procedure bindings asynchronously. Every derivative carries:

- `account_id` and trusted placement binding;
- source fact-version ID and value hash;
- valid range and system interval;
- source and partition watermarks;
- model or compiler version; and
- policy and visibility-scope hashes.

A worker can publish only if the source fact is visible at the declared watermark and
the source value hash matches. A derived-layer applied prefix is contiguous: sequence
`N` is advertised only after every applicable outbox ordinal at or below `N`, including
supersession tombstones, is durable. Durable gap records block advancement and trigger
repair. Delayed work for a superseded fact may publish a historical derivative, but
cannot mark it current. Manifest swaps atomically bind the gap-free prefix and artifact
hash. A partially built HNSW graph or columnar segment is never queryable.

Columnar, vector, and procedure snapshot fields reference immutable retained manifests,
not opaque “latest” watermarks. Each header binds a gap-free applied prefix, ordered
artifact root, manifest hash, and retention deadline; member rows identify the exact
segments, sealed graphs, or signed procedure artifacts. All-null/all-present checks and
composite foreign keys prevent a snapshot from mixing IDs, hashes, and partitions.

Embedding publication is available only through a security-definer procedure that
joins the authoritative fact by `(account_id, fact_version_id)` and copies—not trusts—
its timeline, partition, source identity, valid range, system interval, and value hash.
It rejects any caller-provided mismatch. Procedure publication follows the same rule
against the signed procedure artifact. Direct derivative inserts are revoked.

## Deterministic read lifecycle

### 1. Parse typed intent

The GraphQL layer accepts dates, exact IDs, contract-defined filters, and bounded
semantic parameters. Natural language may be converted to this input by an agent, but
the submitted typed structure is the only database instruction. The compiler verifies
attribute types, indexed operators, purpose, principal policy, and all envelope caps.

### 2. Acquire or verify a snapshot

Without a token, mondayDB asks the quorum-backed snapshot authority for a global read
epoch. The authority reads durable coordinator decisions at or below that epoch and
selects a dependency-closed participant frontier. It atomically persists the snapshot
header, ordered participant members, coordinator decision root, evaluation time, and
selection visibility epoch before signing the token. If a participant is unavailable
or has not reached a frontier that preserves all-or-none visibility, acquisition fails
or uses an explicitly requested older frontier; it never independently samples
partitions.

Each snapshot member carries a proof against the signed authority checkpoint.
Transaction-participant rows bind each local sequence to a coordinator decision and
effects root; the apply ledger proves the contiguous frontier and exposes durable gaps.
Snapshot replay verifies these leaves before trusting `appliedDecisionPrefix`.

With a token, mondayDB verifies the signature, account, principal delegation, purpose,
policy, expiry, decision root, visibility epoch, and requested partition set. Adding a
partition creates a new authority-issued snapshot; it never mutates an existing
manifest.

Snapshot creation is bounded by `maxTemporalPartitions`. A request that would fan out
further is split into independently identified jobs or rejected; split jobs do not
pretend to share one snapshot. Snapshot tokens contain only an opaque snapshot ID, key
version, expiry, and signature—not raw storage watermarks. An admitted asynchronous
job acquires a server-side snapshot lease before client-token expiry; the lease can be
renewed only within policy retention and cannot change the manifest.

### 3. Select row facts

For an exact timeline, the as-of predicate is:

```sql
SELECT f.fact_version_id, f.valid_range, f.canonical_value,
       f.value_hash, f.source_watermark
FROM agentic_temporal_fact_version AS f
WHERE f.account_id = $1
  AND f.tenant_partition_id = $2
  AND f.timeline_id = $3
  AND f.valid_range @> $4::TIMESTAMPTZ
  AND f.system_range @> $5::BIGINT
LIMIT 2;
```

`$5` is read from the verified, dependency-closed snapshot member, never supplied by
the agent. The all-version bitemporal GiST index supports both range predicates; the
timeline invariant means this returns zero or one row. Two rows indicate corruption;
the gateway fails closed, emits an integrity event, and releases neither value.

Exact-set reads first resolve at most 256 objects through the account-leading timeline
index. They do not construct an unbounded `IN` list. Pages use the stable tuple
`(object_id, attribute_key, timeline_id)` as an encrypted cursor.

### 4. Route analytics to columnar storage

Typed predicates and aggregates over many objects run against temporal columnar
segments clustered by `(account_id, board_id, valid_time_bucket, attribute_key)`.
Segment metadata includes min/max valid time, system watermark, typed value synopses,
row count, and bytes. The planner prunes segments before admission and verifies that
their published watermark satisfies the snapshot.

If the requested snapshot is newer than the columnar watermark, policy chooses one of
three explicit outcomes:

- read a bounded row-store delta and merge deterministically;
- return `COLUMNAR_LAG`; or
- queue an asynchronous grounding job.

It never silently answer from a stale aggregate or scan the entire row store.

### 5. Build and release the packet

Before release, the gateway revalidates snapshot lease, policy, and current source
revocation. Historical **selection** is fixed by the snapshot; content **release**
authorization is evaluated at a separately recorded `releaseVisibilityEpoch`. Thus an
erasure can withhold content selected by an old snapshot without rewriting history.
Replay can verify sealed fact and packet hashes while returning `NOT_AUTHORIZED` or
`OUTSIDE_RETENTION` instead of the erased value.

`agentic_temporal_visibility_epoch` is the quorum-backed monotonic authority.
Revocation atomically advances it and writes the source fence. Every fact, embedding,
procedure, vector attestation, packet-source link, and derived manifest is traceable to
a stable `source_identity_id`; serving paths compare all packet sources with fences at
the release epoch before decryption. Packet values are envelope-encrypted, while
`sanitized_projection` contains only hashes, counts, and omission codes. Erasure
revokes or destroys the content key and retains the sealed projection and audit hashes,
so stored `packet_ciphertext` cannot bypass immediate suppression.

The gateway canonicalizes facts in selector/object/attribute/version order, appends
omission codes, computes citation and packet hashes, commits the release audit event,
and returns the packet with that event hash. Cursor pages retain the same snapshot,
valid time, release policy, and original budget reservation.

The packet never substitutes latest data for missing historical data. “Not recorded”
is different from “not authorized” and “outside retention,” although policy may map
sensitive omission codes to a less revealing public code.

## Temporal vector and HNSW behavior

Semantic retrieval is useful for questions such as “find procedures that addressed a
similar escalation at that time.” It is not a temporal truth oracle. Vector similarity
discovers candidate fact or procedure versions; bitemporal predicates and policy
determine eligibility.

Each HNSW graph is a physical account leaf plus one model/time-bucket partial index,
exactly as in the DDL. There is no global or default graph and no post-traversal tenant
filter standing in for isolation. Every query:

1. resolves `account_id` and placement through an account-bound capability;
2. allows only model versions declared by the data contract;
3. selects at most `maxValidTimeBuckets`;
4. clamps `topK`, candidate count, `ef_search`, and wall time;
5. filters candidates by valid range, snapshot partition watermark, visibility scope,
   source revocation, and policy;
6. records graph artifact ID/hash, implementation version, distance metric,
   `ef_search`, ordered candidate IDs and canonical distance strings, eligibility
   filter hash, and deterministic `(distance, embedding_id)` tie-break order;
7. deduplicates split intervals by fact-version ID; and
8. returns an underfilled result with `ANN_UNDERFILLED` rather than exact-scan fallback.

Physical infrastructure may co-locate account leaves, but their graph files, access
capabilities, caches, and workload quotas remain account-bound. Future and historical
versions never share an unfiltered global graph. The raw query or stored embedding is
never returned through GraphQL.

Time buckets are routing hints, not truth. A long-lived fact is represented by one
embedding graph-member row per eligible bucket, enforced by the fact/model/bucket
unique key; validity is still checked against the authoritative range.
Embedding publication and supersession update a tenant-scoped eligibility sidecar
atomically with manifest publication. If the sidecar watermark is behind the requested
snapshot, the route returns `VECTOR_LAG`; it does not broaden the search.

HNSW traversal itself is not promised to be reproducible after a graph rebuild. Packet
pages pin an immutable retained graph generation. Long-term replay verifies the signed
candidate attestation, graph hash, parameters, scores, tie-break order, and selected
fact eligibility. It does not need raw query text or claim to rerun a retired graph.
The snapshot member's vector manifest is the ordered set of eligible graph artifact
IDs/hashes for that partition and applied prefix; a route may pin several bucket
artifacts without overloading one generation field.

Procedural memory follows the same rule. Semantic search returns a versioned procedure
reference with an instruction hash and valid range. It never invokes the procedure.
Plan verification must re-read the exact version at the pinned snapshot and validate
its preconditions, tool scopes, budget, and current authorization.

## Open API GraphQL contract

`accountId` appears on returned objects for explicit tenant provenance, but is not an
input. The API derives it from the authenticated monday.com principal. IDs, sequence
counts, and estimates use opaque strings or a decimal-string scalar.

```graphql
scalar DateTime
scalar CanonicalJSON
scalar BigIntString
scalar DecimalString

directive @oneOf on INPUT_OBJECT

enum TemporalObjectType {
  BOARD
  BOARD_ITEM
  UPDATE
  WORKFLOW
  MEMORY
  PROCEDURE
}

enum TemporalSnapshotConsistency {
  LATEST_COMMITTED
  PINNED
}

enum TemporalRelation {
  CURRENT_AT_SNAPSHOT
  HISTORICAL_AT_SNAPSHOT
  SCHEDULED_AT_SNAPSHOT
}

enum TemporalGroundingState {
  ADMITTED
  RUNNING
  COMPLETE
  PARTIAL
  CANCELLED
  REJECTED
  FAILED
}

enum TemporalMutationState {
  COMMITTED
  ADMITTED_FOR_REVIEW
  RUNNING
  CANCELLED
  REJECTED
  FAILED
}

enum TemporalCompleteness {
  REQUIRE_COMPLETE
  ALLOW_PARTIAL
}

enum TemporalFilterOperator {
  AND
  OR
  EQ
  IN
  RANGE
}

enum TemporalValueType {
  BOOLEAN
  NUMBER
  STRING
  DATE_TIME
  OBJECT_REF
  JSON
}

enum TemporalAggregateOperator {
  COUNT
  SUM
  MIN
  MAX
  AVG
}

enum TemporalOmissionCode {
  NOT_AUTHORIZED
  NOT_RECORDED
  OUTSIDE_RETENTION
  COLUMNAR_LAG
  VECTOR_LAG
  PROCEDURE_LAG
  ANN_UNDERFILLED
  BUDGET_EXHAUSTED
  PARTITION_UNAVAILABLE
}

input TemporalObjectRefInput {
  objectType: TemporalObjectType!
  objectId: ID!
  boardId: ID
}

input TemporalExactSelectorInput {
  object: TemporalObjectRefInput!
  attributeKeys: [String!]!
}

input TemporalExactSetSelectorInput {
  objects: [TemporalObjectRefInput!]!
  attributeKeys: [String!]!
}

input TemporalTypedValueInput @oneOf {
  booleanValue: Boolean
  decimalValue: DecimalString
  stringValue: String
  dateTimeValue: DateTime
  objectIdValue: ID
}

input DeterministicTemporalFilterInput {
  operator: TemporalFilterOperator!
  attributeKey: String
  typedValues: [TemporalTypedValueInput!]
  children: [DeterministicTemporalFilterInput!]
}

input TemporalContractFilterInput {
  boardId: ID!
  contractId: ID!
  filter: DeterministicTemporalFilterInput!
  projectedAttributeKeys: [String!]!
}

input TemporalSelectorInput @oneOf {
  exact: TemporalExactSelectorInput
  exactSet: TemporalExactSetSelectorInput
  contractFilter: TemporalContractFilterInput
}

input TemporalSemanticSearchInput {
  indexId: ID!
  embeddingModelVersion: String!
  queryText: String!
  topK: Int!
  maxCandidates: Int!
}

input TemporalAggregateInput {
  boardId: ID!
  contractId: ID!
  filter: DeterministicTemporalFilterInput!
  operator: TemporalAggregateOperator!
  attributeKey: String
  groupByAttributeKeys: [String!]!
}

input CompileTemporalGroundingInput {
  idempotencyKey: String!
  purposeId: ID!
  validAt: DateTime!
  snapshotToken: String
  selectors: [TemporalSelectorInput!]!
  semantic: TemporalSemanticSearchInput
  aggregate: TemporalAggregateInput
  procedureScopes: [String!]!
  completeness: TemporalCompleteness!
}

input RecordTemporalFactInput {
  idempotencyKey: String!
  sourceEventId: ID!
  object: TemporalObjectRefInput!
  attributeKey: String!
  valueType: TemporalValueType!
  canonicalValue: CanonicalJSON!
  validFrom: DateTime!
  validTo: DateTime
  expectedCurrentValueHash: String
}

input RequestTemporalCorrectionInput {
  idempotencyKey: String!
  sourceEventId: ID!
  object: TemporalObjectRefInput!
  attributeKey: String!
  valueType: TemporalValueType!
  canonicalValue: CanonicalJSON!
  validFrom: DateTime!
  validTo: DateTime
  correctionReasonCode: String!
  reviewTicketId: ID
}

type TemporalSnapshotPartition {
  tenantPartitionId: ID!
  visibleCommitSequence: BigIntString!
  appliedDecisionPrefix: BigIntString!
  decisionMembershipProofHash: String!
  rowWatermark: String!
  columnarManifestId: ID
  columnarManifestHash: String
  columnarAppliedPrefix: BigIntString
  vectorManifestId: ID
  vectorManifestHash: String
  vectorAppliedPrefix: BigIntString
  procedureManifestId: ID
  procedureManifestHash: String
  procedureAppliedPrefix: BigIntString
}

type TemporalSnapshot {
  accountId: ID!
  snapshotId: ID!
  token: String!
  consistency: TemporalSnapshotConsistency!
  authorityCheckpointId: ID!
  authorityReadEpoch: BigIntString!
  coordinatorDecisionRoot: String!
  evaluationTime: DateTime!
  selectionVisibilityEpoch: BigIntString!
  partitions: [TemporalSnapshotPartition!]!
  policyVersion: String!
  expiresAt: DateTime!
  manifestHash: String!
}

type TemporalFact {
  factVersionId: ID!
  objectType: TemporalObjectType!
  objectId: ID!
  attributeKey: String!
  canonicalValue: CanonicalJSON!
  validFrom: DateTime!
  validTo: DateTime
  temporalRelation: TemporalRelation!
  sourceWatermark: String!
  citationHash: String!
}

type TemporalOmission {
  code: TemporalOmissionCode!
  selectorHash: String!
  detailCode: String
}

type TemporalProcedureRef {
  procedureId: ID!
  procedureVersionId: ID!
  instructionHash: String!
  validFrom: DateTime!
  validTo: DateTime
  preconditionHash: String!
  requiredContractId: ID!
  temporalRelation: TemporalRelation!
  artifact: TemporalProcedureArtifact!
}

type TemporalProcedureArtifact {
  canonicalInstructions: CanonicalJSON!
  canonicalPreconditions: CanonicalJSON!
  allowedToolScopes: [String!]!
  canonicalBudget: CanonicalJSON!
  artifactHash: String!
  signingKeyVersion: Int!
  signature: String!
}

type TemporalSemanticMatch {
  rank: Int!
  canonicalScore: DecimalString!
  factVersionId: ID
  procedureVersionId: ID
  graphArtifactId: ID!
  graphArtifactHash: String!
  candidateAttestationHash: String!
}

type TemporalGroundingPacket {
  accountId: ID!
  packetId: ID!
  requestId: ID!
  validAt: DateTime!
  observedAtSnapshotToken: String!
  facts: [TemporalFact!]!
  procedures: [TemporalProcedureRef!]!
  semanticMatches: [TemporalSemanticMatch!]!
  sourceCitationHashes: [String!]!
  omissions: [TemporalOmission!]!
  hasMore: Boolean!
  nextCursor: String
  executionEnvelopeHash: String!
  policyVersion: String!
  releaseVisibilityEpoch: BigIntString!
  packetHash: String!
  releaseAuditEventHash: String!
}

type TemporalAggregateCell {
  groupKey: CanonicalJSON!
  value: DecimalString!
}

type TemporalAggregateResult {
  operator: TemporalAggregateOperator!
  cells: [TemporalAggregateCell!]!
  returnedGroups: Int!
  hasMore: Boolean!
  nextCursor: String
  scannedRows: BigIntString!
  scannedBytes: BigIntString!
  resultHash: String!
}

type TemporalGroundingStatus {
  accountId: ID!
  requestId: ID!
  state: TemporalGroundingState!
  progressPermille: Int!
  snapshot: TemporalSnapshot
  packet: TemporalGroundingPacket
  aggregate: TemporalAggregateResult
  rejectionCode: String
  failureCode: String
  cancellable: Boolean!
}

type TemporalMutationReceipt {
  accountId: ID!
  sourceEventId: ID!
  state: TemporalMutationState!
  transactionId: ID
  resultRoot: String
  progressPermille: Int!
  rejectionCode: String
  failureCode: String
  cancellable: Boolean!
}

type TemporalTimelinePage {
  accountId: ID!
  object: TemporalFactObject!
  attributeKey: String!
  versions: [TemporalFact!]!
  nextCursor: String
  snapshot: TemporalSnapshot!
}

type TemporalFactObject {
  objectType: TemporalObjectType!
  objectId: ID!
}

type Query {
  agenticTemporalGroundingStatus(
    requestId: ID!
    resultCursor: String
  ): TemporalGroundingStatus!

  agenticTemporalMutationStatus(
    sourceEventId: ID!
  ): TemporalMutationReceipt!

  agenticTemporalTimeline(
    object: TemporalObjectRefInput!
    attributeKey: String!
    validFrom: DateTime
    validTo: DateTime
    snapshotToken: String
    first: Int!
    after: String
  ): TemporalTimelinePage!

  agenticTemporalProcedureVersion(
    procedureVersionId: ID!
    snapshotToken: String!
  ): TemporalProcedureRef
}

type Mutation {
  compileAgenticTemporalGrounding(
    input: CompileTemporalGroundingInput!
  ): TemporalGroundingStatus!

  recordAgenticTemporalFact(
    input: RecordTemporalFactInput!
  ): TemporalMutationReceipt!

  requestAgenticTemporalCorrection(
    input: RequestTemporalCorrectionInput!
  ): TemporalMutationReceipt!

  cancelAgenticTemporalGrounding(requestId: ID!): TemporalGroundingStatus!
  cancelAgenticTemporalCorrection(sourceEventId: ID!): TemporalMutationReceipt!
}
```

The `@oneOf` selector and typed recursive filter are validated before planning; leaf
operators and child operators have closed arity rules. `CanonicalJSON` rejects
uncontracted keys and numeric JSON tokens. `queryText` is normalized by a versioned
server compiler and embedded only by the model fixed in the contract and envelope. The
compiler derives bucket IDs and metadata filters, pins the immutable graph artifact,
and produces `CompiledTemporalSemanticRoute`. Audit stores a tenant-keyed query HMAC,
embedding hash, signed candidate attestation, and route—not raw sensitive prompt text.
Introspection and errors never expose physical placement or another tenant's existence.

`agenticTemporalTimeline.first` is clamped to the policy maximum and uses keyset
pagination. The authenticated encrypted cursor contains the version, account and
principal, request/scope hash, snapshot ID, valid-time hash, last complete sort tuple,
envelope hash, and expiry. A missing, expired, or mismatched cursor fails; it never
falls back to `OFFSET` or widens scope.

Fact mutations are ordinary typed Open API writes. Small corrections compile and
commit synchronously; large corrections enter `ADMITTED` for reviewed, budgeted
execution. Status exposes progress, completion, cancellation, typed aggregate output,
and a nullable packet. Cancelling stops future admitted batches but never rolls back
already committed fact versions. Exact procedure reads return the hash, range,
precondition, and contract needed for independent plan verification; retrieval never
executes the procedure.

## Agentic guardrails and admission

Every request compiles to an immutable `TemporalExecutionEnvelope`. The compiler
rejects:

- a missing authenticated account scope;
- unknown attributes or operators outside the versioned data contract;
- more than 256 exact objects or a policy-lower tenant cap;
- unindexed JSON-path, regex, substring, or natural-language filters;
- a valid-time range without a finite bounded history page;
- a snapshot spanning more tenant partitions than the envelope allows;
- `ALLOW_PARTIAL` where the signed purpose policy requires complete evidence;
- `topK`, HNSW candidates, `ef_search`, or time buckets above policy;
- aggregate group estimates or serialized result bytes above the envelope;
- vector fallback to another account or to an exact distance scan;
- recursive expansion from a fact to arbitrary related objects;
- procedure execution during retrieval;
- agent-proposed increases to row, byte, tool, correction, or wall-time budgets; and
- estimates that overflow 64-bit saturating arithmetic or lack safe upper bounds.

Grounding requests and temporal enrichment run in workload classes separate from
interactive transactions. Admission uses per-account and global token buckets for row
reads, columnar bytes, HNSW candidates, cold-history I/O, and correction splits.
Interactive writes retain reserved capacity. Under pressure, broad grounding queues or
returns a typed rejection; it cannot consume the reliability reserve.

Loop containment fingerprints the tuple:

```text
(account_id, principal_id, purpose_id, valid_at_bucket, snapshot_id,
 selector_hash, semantic_query_hash, procedure_scope_hash)
```

Repeated requests charge the same budget ledger, even if prompt wording changes.
Cursors cannot increase scope. Each page spends from the original reservation and
retains the original snapshot, purpose, valid time, and envelope.

The idempotency record binds `(account_id, principal_id, idempotency_key_hash)` to the
canonical request hash and original snapshot. The same hash returns the original
status or packet and does not reacquire a newer snapshot. A different hash returns
`IDEMPOTENCY_CONFLICT`. Records live at least as long as packet and retry retention.
`REQUIRE_COMPLETE` releases no packet if any required selector, procedure, or derived
layer is omitted; `ALLOW_PARTIAL` releases typed omissions and sets state `PARTIAL`.

Aggregate contracts permit only declared low-cardinality group keys and maintain
cardinality statistics. The compiler clamps `maxAggregateGroups` and `maxResultBytes`;
unknown or excessive cardinality queues an asynchronous job or rejects. Materialized
result cells are sorted by canonical group key and paged through the same authenticated
cursor contract. Scan admission never implies an unbounded GraphQL response.

## Performance check for boards with 1M+ rows

### Safe paths

- **Current/as-of point read:** account and timeline lookup followed by GiST valid-range
  containment and a partition-watermark predicate.
- **Bounded exact set:** at most 256 account-scoped object IDs with keyset pagination.
- **Timeline history:** `(account_id, timeline_id, timeline_sequence DESC)` with a
  fixed `first` cap and encrypted keyset cursor.
- **Temporal ANN:** account-bound HNSW placement, bounded time buckets and candidates,
  authoritative post-filtering, and no exact fallback.
- **Typed aggregate:** pruned columnar segments with valid-time and watermark metadata,
  admitted row/byte estimates, and a bounded row-delta merge.
- **Snapshot lookup:** point lookup by `(account_id, snapshot_id)` and bounded partition
  members.

### Full-scan risks and required behavior

| Risk | Why it is dangerous at 1M+ rows | Required behavior |
| --- | --- | --- |
| “What changed on this board?” without a time range or indexed selector | Reads every timeline and version | Reject; require a bounded interval plus indexed change feed or asynchronous admitted export |
| Arbitrary JSON temporal predicates | Schemaless values defeat segment and index pruning | Compile only contract-approved typed attributes and operators |
| Reconstructing a board snapshot from all row histories | Multiplies rows by version count | Use watermark-compatible columnar snapshots or an asynchronous materialization job |
| `OFFSET` history pagination | Re-reads all preceding versions | Require encrypted keyset cursors |
| One HNSW graph across accounts and all time | Leaks placement and expands candidate work | Partition by account placement/model/time bucket and enforce account metadata |
| ANN post-filter followed by exact fallback | Can calculate distance over millions of vectors | Return `ANN_UNDERFILLED` |
| Retroactive update spanning thousands of intervals | Creates lock time and write amplification | Cap synchronous splits; queue a reviewed correction job with its own budget |
| Snapshot token extended to new partitions | Produces a temporal chimera | Create a new immutable snapshot manifest |
| Row-store aggregate used to hide columnar lag | Steals transactional capacity | Permit only a bounded delta merge; otherwise return lag or queue |
| High-cardinality aggregate group-by | Can create millions of GraphQL cells after a bounded scan | Require contract-declared low-cardinality keys, estimate groups/result bytes, and page materialized cells |
| Recursive entity expansion from temporal facts | Cycles multiply reads and blur snapshot scope | Require explicit selectors and a maximum depth of zero in v1 |

Some legitimate analytics must touch a large share of a million-row board. They are
not mislabeled as “blink-of-an-eye” interactive queries. They run as admitted columnar
jobs with byte caps, progress, cancellation, and a pinned snapshot. The API returns an
admission state rather than holding an interactive worker indefinitely.

Planner estimates use 64-bit integers with saturating addition and multiplication. An
overflow is a rejection. Missing statistics use a conservative partition maximum,
which ordinarily queues or rejects the plan.

## Auditability and replay

Audit payloads use RFC 8785 JSON Canonicalization Scheme after contract-level
normalization of timestamps and decimals. Stored `JSONB` is a query representation,
not the bytes hashed; verifiers regenerate canonical UTF-8 bytes. Packet hashing
excludes `packetHash` and `releaseAuditEventHash`. The release event binds the packet
hash and pre-event head; the packet then carries the resulting event hash, avoiding a
cycle.

```text
event_hash = HASH(hash_algorithm,
  "mondaydb.agentic-temporal-audit/v1" ||
  hash_algorithm ||
  account_id ||
  chain_partition ||
  sequence_no ||
  event_type ||
  payload_schema_version ||
  canonical_payload_hash ||
  previous_event_hash
)
```

Version 1 permits SHA-256. Algorithm, domain, and schema versions are part of the
preimage. Tenant audit-chain partitions are selected by a stable hash of
`timeline_id` for mutations or `request_id` for reads, avoiding one global account
hotspot while preserving deterministic ordering. Serving roles append only through a
stored procedure that locks one head, inserts exactly `next_sequence_no`, and advances
it; direct `UPDATE`/`DELETE` is revoked and blocked by an append-only trigger.

A signed checkpoint periodically stores the complete ordered chain-partition/head set,
coverage count, checkpoint hash, signing-key version, and signature in an external
audit account. Public verification keys remain available for the longest audit
retention. A new key creates a new checkpoint version; it never rewrites history.

Closed event types include:

| Event | Required canonical fields |
| --- | --- |
| `FACT_VERSION_COMMITTED` | timeline, fact version, valid range, system-from sequence, value hash, source event, contract and policy hashes |
| `FACT_VERSION_SUPERSEDED` | old/new fact-version IDs, system-to sequence, correction reason code, source event |
| `SNAPSHOT_ACQUIRED` | snapshot ID, authority read epoch, coordinator decision root, ordered dependency-closed member root, evaluation time, selection visibility epoch, purpose, policy, expiry, manifest hash |
| `GROUNDING_ADMITTED` | canonical request hash, selector hash, valid time, snapshot, completeness, envelope and reservation hashes |
| `VECTOR_ROUTE_DECIDED` | graph artifact/build hashes, implementation, model, metric, buckets, `ef_search`, candidate caps, ordered candidate/score root, eligibility filter and decision code |
| `GROUNDING_RELEASED` | ordered citation root, omission root, procedure refs, release visibility epoch, packet hash, previous event hash |
| `GROUNDING_REJECTED` | request hash, estimate summary, deterministic rejection code |
| `CORRUPTION_DETECTED` | timeline, snapshot member hash, invariant code, sanitized evidence hash |

The audit payload never stores raw embeddings, secrets, or unrestricted prompt text.
Canonical values may remain in the source fact under its normal access and retention
policy; audit uses hashes and typed reason codes.

Replay loads the signed policy and contract artifacts, dependency-closed snapshot
manifest, immutable fact versions, procedure bindings, signed vector attestation,
envelope, and hash chain. It can verify:

1. the request was authorized and tenant-scoped;
2. each selected fact was valid at `validAt` and visible at its partition watermark;
3. later corrections did not alter the historical packet;
4. columnar and procedure layers met gap-free applied prefixes and the recorded vector
   candidates came from the pinned graph artifact and eligibility filter;
5. every omission and pagination boundary followed policy;
6. relational citation order and packet hash are deterministic, while the recorded ANN
   decision is verifiable without promising to reproduce a retired graph traversal;
7. no budget or recursive expansion limit was increased by the agent.

Audit retention must be at least as long as packet replay retention. If source values
expire earlier, replay proves selection and hashes but returns `OUTSIDE_RETENTION`
rather than fabricating content.

## Availability, consistency, and retention

Recommended service objectives:

- current point writes and reads remain in the existing row-store availability class;
- snapshot acquisition uses the existing ACID snapshot authority and fails closed if
  a coherent manifest cannot be obtained;
- point grounding targets interactive latency;
- broad columnar and cold-history grounding have separate asynchronous objectives;
- cross-account fact or vector visibility tolerates zero events;
- overlapping current intervals tolerate zero events; and
- packet replay mismatch tolerates zero events.

These are release requirements, not a claim that the document alone proves 99.99%.
The snapshot authority, coordinator-decision store, participant sequence allocator,
timeline row store, and local audit shard must each fit the existing transactional
error budget, run with quorum replication across failure domains, and support
term-fenced failover. Vector, columnar, and procedure publishers remain outside the
write acknowledgement path. Lock duration, participant count, outbox bytes, and audit
payload bytes are envelope-capped; saturation rejects before opening a transaction.

If vector or columnar storage is unavailable, row transactions continue. Grounding
returns typed lag/unavailability omissions when policy permits partial packets, or a
deterministic failure when completeness is required. It never weakens the requested
consistency silently.

If the snapshot authority or any required row participant is unavailable, a new
cross-partition snapshot fails closed; a still-valid pinned snapshot may continue only
when every referenced participant and current release-visibility authority can be
verified. If a local audit shard or transaction coordinator loses quorum, affected
writes fail before acknowledgement. Retries use source-event and request idempotency
records, so failover cannot duplicate corrections or silently select a newer snapshot.

Snapshot tokens have finite lifetimes. Expiry prevents indefinite pinning of storage
and policy state, but does not delete the audit evidence. Enterprise retention policies
define how long immutable fact values, columnar history, embeddings, packets, and audit
hashes remain available. Erasure fences override retention and must suppress every
temporal derivative immediately even for old snapshots.

## Rollout sequence

1. **Contract foundation:** classify temporal attributes, canonical value types, valid-
   time rules, and indexed filter operators. Non-temporal fields remain latest-only.
2. **Row timelines:** commit current-value changes, temporal fact versions, and outbox
   events in the same transaction; project only columnar/vector/procedure derivatives
   from the outbox, and verify current values against existing board reads.
3. **Snapshot manifests:** expose signed partition-watermark tokens and replay tests
   before allowing cross-layer packets.
4. **Grounding API:** launch exact point and bounded exact-set reads with perception
   metadata, omissions, budgets, and audit chains.
5. **Columnar history:** add watermark-aware temporal segments and bounded delta merge;
   load-test typed filters and aggregates on boards above 1M rows.
6. **Semantic and procedural time:** publish versioned embeddings and instruction
   bindings into account-partitioned HNSW placements; never auto-invoke a match.
7. **Retroactive corrections:** enable bounded synchronous splits, then reviewed
   asynchronous correction jobs with tenant workload isolation.

Release gates include cross-tenant property tests, concurrent correction/snapshot
races, DST and timezone boundary tests, half-open interval tests, idempotent source
event replay, columnar/vector lag tests, HNSW underfill tests, snapshot expiry tests,
erasure-over-historical-snapshot tests, and 1M+ row load tests. General availability
requires deterministic packet replay from a pinned manifest. High-churn timeline tests
must capture `EXPLAIN (ANALYZE, BUFFERS)` evidence that bitemporal point lookups use the
all-version GiST path rather than scanning version history. Failure-injection tests
must cover undecided multi-partition transactions, missing outbox ordinals, fenced
coordinator failover, and audit-shard quorum loss.

## Decision

mondayDB should add a **bitemporal grounding plane**, not a generic “time-aware AI”
feature. Valid time and system time become explicit data contracts; snapshot manifests
bind decoupled stores to coherent evidence; and agents receive small, labeled,
auditable packets rather than ambiguous history dumps.

The extra version rows and asynchronous derivative work are deliberate costs. They buy
replayability without full snapshots and keep tenant isolation structural. General
availability remains gated on a composed failure-domain model and fault-injection
evidence showing the end-to-end transactional path meets mondayDB's 99.99% target; the
design does not manufacture that number from component aspirations. The result
prevents probabilistic agents from deciding what the database means by “then.”
