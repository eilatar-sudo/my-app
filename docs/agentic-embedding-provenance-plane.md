# mondayDB Agentic Embedding Provenance Plane

**Status:** Strategic design proposal  
**Audience:** mondayDB Product, Storage, Search, Open API, Security, and SRE  
**Decision scope:** Deterministic production, migration, retrieval, and audit of semantic embeddings

## 1. Why this plane exists

Semantic retrieval becomes an enterprise liability when a vector has no durable answer to:

- Which tenant-owned source fields produced it?
- Which redaction and normalization rules were applied?
- Which model, dimensions, distance metric, and chunking recipe were used?
- Which source watermark was current when it was generated?
- Can a query vector be compared with it safely?
- What changed during a model migration, and can the result be replayed?

The product trade-off is **retrieval quality and model agility versus consistency, availability, and explainability**. Re-embedding immediately on every row update gives fresher recall but adds latency to the ACID write path and couples WorkOS availability to an embedding provider. Delayed, unconstrained re-embedding protects writes but allows stale or incompatible vectors to influence an agent.

mondayDB should therefore keep vector generation off the transaction path while making its inputs and outputs deterministic database records. The row transaction commits an immutable outbox event. An asynchronous worker applies a pinned embedding manifest and publishes the vector only after compatibility, tenant, watermark, and policy checks pass.

The database does not infer which fields are meaningful, silently select a model, or automatically broaden a search. Those are explicit, versioned product decisions. The probabilistic model produces bytes; mondayDB deterministically governs where those bytes came from, where they may be searched, and how every decision is audited.

## 2. Product decision

Introduce an **Embedding Provenance Plane** with five first-class concepts:

1. **Projection manifest** — the allowlisted source fields, redaction profile, canonicalization, chunking recipe, purpose, and retention policy.
2. **Embedding version** — immutable model identity, dimensions, distance metric, normalization, compatibility key, and serving state.
3. **Embedding artifact** — a tenant-scoped vector plus source watermark and hashes of every deterministic input.
4. **Migration cohort** — a bounded dual-write, shadow-read, cutover, and rollback plan between embedding versions.
5. **Query envelope** — an immutable, budgeted instruction describing exactly which compatible artifacts a request may search.

This is a control plane over the existing row, columnar, and vector data paths. It does not put model inference in the storage engine.

## 3. Non-negotiable invariants

1. Every durable record and every lookup includes `account_id`; no global artifact lookup is valid.
2. An embedding version is immutable after activation. Corrections create a new version.
3. A vector is searchable only when its source projection, model version, dimensions, metric, purpose, and tenant partition match the compiled query envelope.
4. The source row mutation and outbox event commit in one ACID transaction. Vector generation is asynchronous and never blocks the row write.
5. An older source watermark can never replace a newer artifact.
6. Raw restricted fields are never copied into provenance or audit events. Audits retain hashes, identifiers, policy decisions, and watermarks.
7. Model migrations are explicit state machines with bounded cohorts; there is no account-wide implicit re-embedding.
8. Query-time recursive expansion, `topK`, candidate count, partitions, and wall time are capped before vector execution.
9. Missing or quarantined vectors are visible to the caller. mondayDB never silently claims complete semantic coverage.
10. Every publication, query, migration transition, rejection, and rollback produces a deterministic hash-chained audit event.

## 4. TypeScript contracts

```ts
type AccountId = string;
type BoardId = string;
type ManifestId = string;
type EmbeddingVersionId = string;
type ArtifactId = string;
type MigrationId = string;
type QueryEnvelopeId = string;
type ProcedureMemoryId = string;
type ISO8601 = string;
type Sha256 = string;

type EmbeddingPurpose =
  | "RAG_CONTEXT"
  | "PROCEDURE_DISCOVERY"
  | "ENTITY_MATCH"
  | "MEMORY_RECALL";

type DistanceMetric = "COSINE" | "INNER_PRODUCT" | "L2";
type VectorNormalization = "NONE" | "L2_UNIT";
type ServingState =
  | "DRAFT"
  | "SHADOW"
  | "ACTIVE"
  | "DRAINING"
  | "QUARANTINED"
  | "RETIRED";

interface SourceFieldRule {
  fieldId: string;
  valueType: "TEXT" | "NUMBER" | "DATE" | "STATUS" | "PERSON" | "JSON";
  order: number;
  required: boolean;
  maxUtf8Bytes: number;
  canonicalizer:
    | "UTF8_NFC"
    | "LOWERCASE_UTF8_NFC"
    | "ISO_8601_UTC"
    | "DECIMAL_CANONICAL"
    | "SORTED_JSON";
  redactionAction: "INCLUDE" | "TOKENIZE" | "MASK" | "DROP";
}

interface ChunkingRecipe {
  algorithm: "FIELD_BOUNDARY_V1" | "TOKEN_WINDOW_V1" | "NO_CHUNKING";
  maxInputTokens: number;
  overlapTokens: number;
  maxChunksPerObject: number;
  preserveFieldBoundaries: boolean;
}

interface EmbeddingProjectionManifest {
  accountId: AccountId;
  manifestId: ManifestId;
  boardId: BoardId;
  namespace: string;
  purpose: EmbeddingPurpose;
  schemaVersion: number;
  sourceFields: readonly SourceFieldRule[];
  redactionProfileId: string;
  purposeBoundaryId: string;
  retentionPolicyId: string;
  chunking: ChunkingRecipe;
  procedureMemoryRefs: readonly ProcedureMemoryId[];
  manifestHash: Sha256;
  createdBy: string;
  createdAt: ISO8601;
}

interface EmbeddingVersion {
  accountId: AccountId;
  embeddingVersionId: EmbeddingVersionId;
  manifestId: ManifestId;
  provider: string;
  modelName: string;
  modelRevision: string;
  dimensions: number;
  distanceMetric: DistanceMetric;
  normalization: VectorNormalization;
  tokenizerRevision: string;
  compatibilityKey: Sha256;
  servingState: ServingState;
  activatedAt?: ISO8601;
  stateHash: Sha256;
}

interface SourceWatermark {
  rowCommitSequence: string;
  schemaRevision: number;
  redactionPolicyRevision: number;
}

interface EmbeddingArtifact {
  accountId: AccountId;
  artifactId: ArtifactId;
  embeddingVersionId: EmbeddingVersionId;
  manifestId: ManifestId;
  boardId: BoardId;
  objectId: string;
  chunkOrdinal: number;
  sourceWatermark: SourceWatermark;
  sourceProjectionHash: Sha256;
  vectorHash: Sha256;
  compatibilityKey: Sha256;
  state: "PENDING" | "SEARCHABLE" | "STALE" | "QUARANTINED" | "DELETED";
  generatedAt: ISO8601;
  publishedAt?: ISO8601;
  expiresAt?: ISO8601;
}

interface EmbeddingGenerationJob {
  accountId: AccountId;
  jobId: string;
  idempotencyKey: string;
  manifestId: ManifestId;
  embeddingVersionId: EmbeddingVersionId;
  boardId: BoardId;
  objectId: string;
  expectedSourceWatermark: SourceWatermark;
  attempt: number;
  maxAttempts: number;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "SUPERSEDED" | "FAILED";
  nextAttemptAt?: ISO8601;
}

interface EmbeddingQueryBudget {
  maxTopK: number;
  maxCandidates: number;
  maxPartitions: number;
  maxVectorVersions: number;
  maxExpansionDepth: number;
  maxWallTimeMs: number;
  maxQueryVectorTokens: number;
}

interface EmbeddingQueryEnvelope {
  accountId: AccountId;
  queryEnvelopeId: QueryEnvelopeId;
  purposeBoundaryId: string;
  boardIds: readonly BoardId[];
  namespace: string;
  embeddingVersionIds: readonly EmbeddingVersionId[];
  compatibilityKeys: readonly Sha256[];
  sourceWatermarkFloor?: string;
  freshnessMode: "STRICT" | "BOUNDED_STALE" | "BEST_EFFORT";
  queryArtifactId: ArtifactId;
  allowedMetadataPredicates: Readonly<Record<string, string | number | boolean>>;
  budget: EmbeddingQueryBudget;
  procedureMemoryRefs: readonly ProcedureMemoryId[];
  requestHash: Sha256;
  expiresAt: ISO8601;
}

type MigrationState =
  | "PLANNED"
  | "BACKFILLING"
  | "SHADOW_READING"
  | "CUTOVER_READY"
  | "ACTIVE"
  | "ROLLED_BACK"
  | "COMPLETED"
  | "FAILED";

interface EmbeddingMigrationCohort {
  accountId: AccountId;
  migrationId: MigrationId;
  manifestId: ManifestId;
  fromVersionId: EmbeddingVersionId;
  toVersionId: EmbeddingVersionId;
  boardIds: readonly BoardId[];
  deterministicSampleBasisPoints: number;
  state: MigrationState;
  maxRowsPerMinute: number;
  maxConcurrentJobs: number;
  minCoverageBasisPoints: number;
  maxRecallRegressionBasisPoints: number;
  maxP95LatencyRegressionBasisPoints: number;
  sourceWatermarkFloor: string;
  rollbackVersionId: EmbeddingVersionId;
  cohortHash: Sha256;
}

interface EmbeddingPerceptionCard {
  accountId: AccountId;
  queryEnvelopeId: QueryEnvelopeId;
  purpose: EmbeddingPurpose;
  searchableVersionIds: readonly EmbeddingVersionId[];
  coverageBasisPoints: number;
  staleArtifactCount: number;
  quarantinedArtifactCount: number;
  sourceWatermark: string;
  freshnessMode: EmbeddingQueryEnvelope["freshnessMode"];
  instructions: readonly string[];
  forbiddenActions: readonly string[];
  omittedReasonCodes: readonly (
    | "NO_COMPATIBLE_VECTOR"
    | "STALE_SOURCE"
    | "POLICY_REDACTED"
    | "QUARANTINED"
    | "BUDGET_EXHAUSTED"
  )[];
  auditDecisionHash: Sha256;
}

interface EmbeddingAuditEvent {
  accountId: AccountId;
  eventId: string;
  eventType:
    | "MANIFEST_CREATED"
    | "VERSION_TRANSITIONED"
    | "ARTIFACT_PUBLISHED"
    | "ARTIFACT_QUARANTINED"
    | "QUERY_COMPILED"
    | "QUERY_EXECUTED"
    | "QUERY_REJECTED"
    | "MIGRATION_TRANSITIONED"
    | "MIGRATION_ROLLED_BACK";
  subjectId: string;
  requestHash: Sha256;
  decisionHash: Sha256;
  previousEventHash?: Sha256;
  eventHash: Sha256;
  actorId: string;
  occurredAt: ISO8601;
}
```

### Deterministic hash rules

All hashes use SHA-256 over canonical JSON:

- keys sorted lexicographically;
- UTF-8 NFC strings;
- timestamps normalized to UTC with millisecond precision;
- decimal numbers encoded as strings;
- arrays preserved in declared order;
- absent optional fields omitted, never encoded as `undefined`;
- raw vector bytes hashed in canonical little-endian float32 form.

`compatibilityKey` is the hash of:

```text
manifest_hash
model provider + model name + immutable model revision
dimensions + distance metric + normalization
tokenizer revision + chunking recipe
redaction profile revision + purpose boundary
```

Two artifacts with different compatibility keys must not share one similarity score domain.

## 5. SQL schema

The following PostgreSQL-compatible schema illustrates the metadata plane. Production mondayDB may map it to its schemaless row layer, but the tenant and index invariants remain mandatory.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embedding_projection_manifests (
  account_id                 BIGINT NOT NULL,
  manifest_id                UUID NOT NULL,
  board_id                   BIGINT NOT NULL,
  namespace                  TEXT NOT NULL,
  purpose                    TEXT NOT NULL CHECK (
    purpose IN ('RAG_CONTEXT', 'PROCEDURE_DISCOVERY', 'ENTITY_MATCH', 'MEMORY_RECALL')
  ),
  schema_version             INTEGER NOT NULL CHECK (schema_version > 0),
  source_field_rules         JSONB NOT NULL,
  redaction_profile_id       UUID NOT NULL,
  purpose_boundary_id        UUID NOT NULL,
  retention_policy_id        UUID NOT NULL,
  chunking_recipe            JSONB NOT NULL,
  procedure_memory_refs      UUID[] NOT NULL DEFAULT '{}',
  manifest_hash              BYTEA NOT NULL CHECK (octet_length(manifest_hash) = 32),
  created_by                 TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, manifest_id),
  UNIQUE (account_id, board_id, namespace, schema_version),
  UNIQUE (account_id, manifest_hash)
);

CREATE INDEX embedding_manifests_board_lookup
  ON embedding_projection_manifests
  (account_id, board_id, namespace, schema_version DESC);

CREATE TABLE embedding_versions (
  account_id                 BIGINT NOT NULL,
  embedding_version_id       UUID NOT NULL,
  manifest_id                UUID NOT NULL,
  provider                   TEXT NOT NULL,
  model_name                 TEXT NOT NULL,
  model_revision             TEXT NOT NULL,
  dimensions                 INTEGER NOT NULL CHECK (dimensions BETWEEN 64 AND 4096),
  distance_metric            TEXT NOT NULL CHECK (
    distance_metric IN ('COSINE', 'INNER_PRODUCT', 'L2')
  ),
  normalization              TEXT NOT NULL CHECK (
    normalization IN ('NONE', 'L2_UNIT')
  ),
  tokenizer_revision         TEXT NOT NULL,
  compatibility_key          BYTEA NOT NULL CHECK (octet_length(compatibility_key) = 32),
  serving_state              TEXT NOT NULL CHECK (
    serving_state IN (
      'DRAFT', 'SHADOW', 'ACTIVE', 'DRAINING', 'QUARANTINED', 'RETIRED'
    )
  ),
  state_hash                 BYTEA NOT NULL CHECK (octet_length(state_hash) = 32),
  activated_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, embedding_version_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES embedding_projection_manifests (account_id, manifest_id),
  UNIQUE (account_id, compatibility_key)
);

CREATE INDEX embedding_versions_serving_lookup
  ON embedding_versions
  (account_id, manifest_id, serving_state, created_at DESC);

CREATE TABLE embedding_artifact_metadata (
  account_id                 BIGINT NOT NULL,
  artifact_id                UUID NOT NULL,
  account_shard              SMALLINT NOT NULL,
  embedding_version_id       UUID NOT NULL,
  manifest_id                UUID NOT NULL,
  board_id                   BIGINT NOT NULL,
  object_id                  TEXT NOT NULL,
  chunk_ordinal              SMALLINT NOT NULL CHECK (chunk_ordinal >= 0),
  row_commit_sequence        BIGINT NOT NULL,
  schema_revision            INTEGER NOT NULL,
  redaction_policy_revision  INTEGER NOT NULL,
  source_projection_hash     BYTEA NOT NULL CHECK (octet_length(source_projection_hash) = 32),
  vector_hash                BYTEA NOT NULL CHECK (octet_length(vector_hash) = 32),
  compatibility_key          BYTEA NOT NULL CHECK (octet_length(compatibility_key) = 32),
  artifact_state             TEXT NOT NULL CHECK (
    artifact_state IN ('PENDING', 'SEARCHABLE', 'STALE', 'QUARANTINED', 'DELETED')
  ),
  generated_at               TIMESTAMPTZ NOT NULL,
  published_at               TIMESTAMPTZ,
  expires_at                 TIMESTAMPTZ,
  PRIMARY KEY (account_id, artifact_id),
  FOREIGN KEY (account_id, embedding_version_id)
    REFERENCES embedding_versions (account_id, embedding_version_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES embedding_projection_manifests (account_id, manifest_id),
  UNIQUE (
    account_id,
    embedding_version_id,
    board_id,
    object_id,
    chunk_ordinal,
    row_commit_sequence
  )
) PARTITION BY HASH (account_id);

CREATE INDEX embedding_artifacts_object_watermark
  ON embedding_artifact_metadata
  (
    account_id,
    board_id,
    object_id,
    embedding_version_id,
    row_commit_sequence DESC
  );

CREATE INDEX embedding_artifacts_generation_queue
  ON embedding_artifact_metadata
  (account_id, artifact_state, generated_at)
  WHERE artifact_state IN ('PENDING', 'STALE');

CREATE INDEX embedding_artifacts_expiry
  ON embedding_artifact_metadata
  (account_id, expires_at)
  WHERE artifact_state = 'SEARCHABLE' AND expires_at IS NOT NULL;
```

### Physical vector families

pgvector columns have fixed dimensions. Do not use one untyped or JSON vector column for every model. Operate a small allowlisted family per dimension/metric, with account hash partitions and an identical metadata key.

```sql
-- Example physical family for cosine-normalized 1536-dimensional artifacts.
CREATE TABLE embedding_vectors_cosine_1536 (
  account_id             BIGINT NOT NULL,
  account_shard          SMALLINT NOT NULL,
  artifact_id            UUID NOT NULL,
  embedding_version_id   UUID NOT NULL,
  board_id               BIGINT NOT NULL,
  compatibility_key      BYTEA NOT NULL,
  embedding              vector(1536) NOT NULL,
  PRIMARY KEY (account_id, artifact_id),
  FOREIGN KEY (account_id, artifact_id)
    REFERENCES embedding_artifact_metadata (account_id, artifact_id)
) PARTITION BY HASH (account_id);

-- Create one child table per controlled account hash range before its HNSW index.
CREATE INDEX embedding_vectors_cosine_1536_hnsw
  ON embedding_vectors_cosine_1536
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 96);

CREATE INDEX embedding_vectors_cosine_1536_route
  ON embedding_vectors_cosine_1536
  (account_id, embedding_version_id, board_id, compatibility_key);
```

In production, the query router must prune to the tenant’s physical hash partition before entering HNSW. A SQL predicate on `account_id` is required but is not, by itself, sufficient if the implementation traverses a shared global graph and filters afterward.

### Generation jobs, migrations, and audit

```sql
CREATE TABLE embedding_generation_jobs (
  account_id                 BIGINT NOT NULL,
  job_id                     UUID NOT NULL,
  idempotency_key            TEXT NOT NULL,
  manifest_id                UUID NOT NULL,
  embedding_version_id       UUID NOT NULL,
  board_id                   BIGINT NOT NULL,
  object_id                  TEXT NOT NULL,
  expected_commit_sequence   BIGINT NOT NULL,
  attempt                    SMALLINT NOT NULL DEFAULT 0,
  max_attempts               SMALLINT NOT NULL CHECK (max_attempts BETWEEN 1 AND 20),
  job_status                 TEXT NOT NULL CHECK (
    job_status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'SUPERSEDED', 'FAILED')
  ),
  next_attempt_at             TIMESTAMPTZ,
  lease_expires_at            TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, job_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX embedding_jobs_claim
  ON embedding_generation_jobs
  (account_id, job_status, next_attempt_at, created_at)
  WHERE job_status IN ('QUEUED', 'FAILED');

CREATE TABLE embedding_migration_cohorts (
  account_id                            BIGINT NOT NULL,
  migration_id                         UUID NOT NULL,
  manifest_id                          UUID NOT NULL,
  from_version_id                      UUID NOT NULL,
  to_version_id                        UUID NOT NULL,
  board_ids                            BIGINT[] NOT NULL,
  deterministic_sample_basis_points    INTEGER NOT NULL CHECK (
    deterministic_sample_basis_points BETWEEN 0 AND 10000
  ),
  migration_state                      TEXT NOT NULL CHECK (
    migration_state IN (
      'PLANNED', 'BACKFILLING', 'SHADOW_READING', 'CUTOVER_READY',
      'ACTIVE', 'ROLLED_BACK', 'COMPLETED', 'FAILED'
    )
  ),
  max_rows_per_minute                   INTEGER NOT NULL CHECK (max_rows_per_minute > 0),
  max_concurrent_jobs                   INTEGER NOT NULL CHECK (max_concurrent_jobs > 0),
  min_coverage_basis_points             INTEGER NOT NULL CHECK (
    min_coverage_basis_points BETWEEN 0 AND 10000
  ),
  max_recall_regression_basis_points    INTEGER NOT NULL CHECK (
    max_recall_regression_basis_points BETWEEN 0 AND 10000
  ),
  max_p95_regression_basis_points       INTEGER NOT NULL CHECK (
    max_p95_regression_basis_points BETWEEN 0 AND 10000
  ),
  source_watermark_floor                BIGINT NOT NULL,
  rollback_version_id                   UUID NOT NULL,
  cohort_hash                           BYTEA NOT NULL CHECK (octet_length(cohort_hash) = 32),
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, migration_id)
);

CREATE INDEX embedding_migrations_state
  ON embedding_migration_cohorts
  (account_id, migration_state, updated_at);

CREATE TABLE embedding_audit_events (
  account_id             BIGINT NOT NULL,
  event_id               UUID NOT NULL,
  event_type             TEXT NOT NULL,
  subject_id             TEXT NOT NULL,
  request_hash           BYTEA NOT NULL CHECK (octet_length(request_hash) = 32),
  decision_hash          BYTEA NOT NULL CHECK (octet_length(decision_hash) = 32),
  previous_event_hash    BYTEA,
  event_hash             BYTEA NOT NULL CHECK (octet_length(event_hash) = 32),
  actor_id               TEXT NOT NULL,
  occurred_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id),
  UNIQUE (account_id, event_hash)
) PARTITION BY HASH (account_id);

CREATE INDEX embedding_audit_subject_timeline
  ON embedding_audit_events
  (account_id, subject_id, occurred_at DESC, event_id);
```

### Publish transaction

Publication must compare watermarks under lock:

```sql
BEGIN;

SELECT row_commit_sequence
FROM embedding_artifact_metadata
WHERE account_id = :account_id
  AND board_id = :board_id
  AND object_id = :object_id
  AND embedding_version_id = :embedding_version_id
  AND chunk_ordinal = :chunk_ordinal
  AND artifact_state = 'SEARCHABLE'
ORDER BY row_commit_sequence DESC
LIMIT 1
FOR UPDATE;

-- Reject as SUPERSEDED when the stored watermark is newer.
-- Otherwise insert metadata, insert into the compatible physical vector family,
-- transition the artifact to SEARCHABLE, and append its audit event atomically.

COMMIT;
```

The vector family is selected from a static registry keyed by `(dimensions, metric, normalization)`. Table names never come directly from caller input.

## 6. Open API GraphQL contract

Every operation is available through the monday.com Open API. Authentication still establishes the principal, but `accountId` remains explicit and is checked against that principal.

```graphql
scalar DateTime
scalar JSON
scalar Long

enum EmbeddingPurpose {
  RAG_CONTEXT
  PROCEDURE_DISCOVERY
  ENTITY_MATCH
  MEMORY_RECALL
}

enum EmbeddingServingState {
  DRAFT
  SHADOW
  ACTIVE
  DRAINING
  QUARANTINED
  RETIRED
}

enum EmbeddingFreshnessMode {
  STRICT
  BOUNDED_STALE
  BEST_EFFORT
}

input CreateEmbeddingManifestInput {
  accountId: ID!
  boardId: ID!
  namespace: String!
  purpose: EmbeddingPurpose!
  sourceFieldRules: JSON!
  redactionProfileId: ID!
  purposeBoundaryId: ID!
  retentionPolicyId: ID!
  chunkingRecipe: JSON!
  procedureMemoryRefs: [ID!]!
  idempotencyKey: String!
}

input RegisterEmbeddingVersionInput {
  accountId: ID!
  manifestId: ID!
  provider: String!
  modelName: String!
  modelRevision: String!
  dimensions: Int!
  distanceMetric: String!
  normalization: String!
  tokenizerRevision: String!
  idempotencyKey: String!
}

input CompileEmbeddingQueryInput {
  accountId: ID!
  purposeBoundaryId: ID!
  boardIds: [ID!]!
  namespace: String!
  queryText: String!
  freshnessMode: EmbeddingFreshnessMode!
  sourceWatermarkFloor: Long
  metadataPredicates: JSON
  maxTopK: Int!
  maxCandidates: Int!
  maxExpansionDepth: Int!
  maxWallTimeMs: Int!
  idempotencyKey: String!
}

input ExecuteEmbeddingQueryInput {
  accountId: ID!
  queryEnvelopeId: ID!
  topK: Int!
  cursor: String
}

input PlanEmbeddingMigrationInput {
  accountId: ID!
  manifestId: ID!
  fromVersionId: ID!
  toVersionId: ID!
  boardIds: [ID!]!
  deterministicSampleBasisPoints: Int!
  maxRowsPerMinute: Int!
  maxConcurrentJobs: Int!
  minCoverageBasisPoints: Int!
  maxRecallRegressionBasisPoints: Int!
  maxP95LatencyRegressionBasisPoints: Int!
  idempotencyKey: String!
}

type EmbeddingManifest {
  accountId: ID!
  manifestId: ID!
  boardId: ID!
  namespace: String!
  purpose: EmbeddingPurpose!
  schemaVersion: Int!
  manifestHash: String!
  createdAt: DateTime!
}

type EmbeddingVersion {
  accountId: ID!
  embeddingVersionId: ID!
  manifestId: ID!
  modelName: String!
  modelRevision: String!
  dimensions: Int!
  compatibilityKey: String!
  servingState: EmbeddingServingState!
}

type EmbeddingQueryEnvelope {
  accountId: ID!
  queryEnvelopeId: ID!
  embeddingVersionIds: [ID!]!
  requestHash: String!
  expiresAt: DateTime!
  perception: EmbeddingPerceptionCard!
}

type EmbeddingPerceptionCard {
  purpose: EmbeddingPurpose!
  searchableVersionIds: [ID!]!
  coverageBasisPoints: Int!
  staleArtifactCount: Long!
  quarantinedArtifactCount: Long!
  sourceWatermark: Long!
  freshnessMode: EmbeddingFreshnessMode!
  instructions: [String!]!
  forbiddenActions: [String!]!
  omittedReasonCodes: [String!]!
  auditDecisionHash: String!
}

type EmbeddingHit {
  artifactId: ID!
  boardId: ID!
  objectId: ID!
  chunkOrdinal: Int!
  score: Float!
  sourceCommitSequence: Long!
  sourceProjectionHash: String!
  embeddingVersionId: ID!
}

type EmbeddingHitConnection {
  nodes: [EmbeddingHit!]!
  nextCursor: String
  perception: EmbeddingPerceptionCard!
  auditDecisionHash: String!
}

type EmbeddingMigration {
  accountId: ID!
  migrationId: ID!
  fromVersionId: ID!
  toVersionId: ID!
  state: String!
  coverageBasisPoints: Int!
  recallDeltaBasisPoints: Int
  p95LatencyDeltaBasisPoints: Int
  cohortHash: String!
}

type Query {
  embeddingManifest(accountId: ID!, manifestId: ID!): EmbeddingManifest
  embeddingVersion(accountId: ID!, embeddingVersionId: ID!): EmbeddingVersion
  embeddingMigration(accountId: ID!, migrationId: ID!): EmbeddingMigration
}

type Mutation {
  createEmbeddingManifest(
    input: CreateEmbeddingManifestInput!
  ): EmbeddingManifest!

  registerEmbeddingVersion(
    input: RegisterEmbeddingVersionInput!
  ): EmbeddingVersion!

  compileEmbeddingQuery(
    input: CompileEmbeddingQueryInput!
  ): EmbeddingQueryEnvelope!

  executeEmbeddingQuery(
    input: ExecuteEmbeddingQueryInput!
  ): EmbeddingHitConnection!

  planEmbeddingMigration(
    input: PlanEmbeddingMigrationInput!
  ): EmbeddingMigration!
}
```

`compileEmbeddingQuery` calls a pinned embedding service and stores the resulting query vector as a short-lived artifact. Retries with the same tenant and idempotency key return the same envelope and query artifact. `executeEmbeddingQuery` cannot change its model, purpose, boards, predicates, or budget; it may only request a `topK` at or below the compiled maximum.

Administrative state transitions should use separate privileged mutations with expected-state hashes. They are omitted above to keep the public discovery path concise, not because transitions may happen implicitly.

## 7. End-to-end flows

### 7.1 Source mutation to searchable artifact

1. The row engine commits the source mutation and an outbox event in the same transaction.
2. The projector loads the tenant-scoped manifest and reads only allowlisted source fields.
3. Redaction and canonicalization run before text leaves mondayDB’s trusted boundary.
4. The projector chunks the canonical projection and computes `sourceProjectionHash`.
5. A generation job is claimed under account-level rate and concurrency limits.
6. The pinned model revision returns vectors; workers verify dimensions, finite values, normalization, and vector hashes.
7. Publication locks the current object/version/chunk watermark.
8. A stale completion becomes `SUPERSEDED`; it never overwrites newer data.
9. Compatible metadata and vector rows publish atomically with an audit event.

### 7.2 Bounded semantic query

1. Authorization validates `accountId`, boards, purpose boundary, and metadata predicates.
2. The compiler resolves one active compatible version by default. During a migration it may resolve two, never an unbounded set.
3. Admission reserves vector candidates, partition count, CPU time, and wall time from the tenant workload ledger.
4. The pinned query model creates a short-lived query artifact.
5. The router selects the physical vector family and tenant hash partitions before HNSW traversal.
6. Indexed board/version filters narrow candidates; visibility and freshness checks run before results leave the engine.
7. Results include provenance hashes, watermarks, omissions, and an agent perception card.
8. The audit event records request, plan, candidate, omission, and decision hashes without query text or raw vector bytes.

### 7.3 Zero-downtime model migration

1. Create a new immutable version in `SHADOW`.
2. Backfill deterministic cohorts selected by `hash(account_id, board_id, object_id)`.
3. Dual-write new source changes to old and new versions within explicit generation budgets.
4. Shadow-read an evaluation sample. Do not merge similarity scores across versions.
5. Compare recall, empty-result rate, freshness coverage, p95/p99 latency, and HNSW resource cost.
6. Move to `CUTOVER_READY` only when stored thresholds pass for a complete evaluation window.
7. Atomically switch the manifest’s active serving pointer; retain the old version in `DRAINING`.
8. Roll back by switching the pointer to `rollbackVersionId`; no row or vector rewrite is required.
9. Retire and delete old artifacts only after rollback and retention windows expire.

## 8. Procedural memory

The manifest’s `procedureMemoryRefs` stores instructions that an agent can retrieve alongside semantic results, for example:

```json
{
  "procedure": "customer-risk-summary-v4",
  "instructions": [
    "Use only RAG_CONTEXT hits with source watermarks at or above the envelope floor.",
    "Cite boardId, objectId, sourceCommitSequence, and sourceProjectionHash.",
    "If coverage is below 9500 basis points, state that semantic coverage is incomplete.",
    "Do not retry with broader boards, another model version, or a larger topK.",
    "Request human review when all matching evidence is quarantined or redacted."
  ]
}
```

Procedure retrieval is semantic only for discovery. The selected procedure version, applicability rules, and allowed actions are resolved deterministically before execution.

## 9. How an agent perceives this data

An LLM should not receive HNSW internals or raw policy documents. It receives a compact perception card:

```json
{
  "purpose": "RAG_CONTEXT",
  "searchableVersionIds": ["ev_2026_07_15_a"],
  "coverageBasisPoints": 9820,
  "staleArtifactCount": 17,
  "quarantinedArtifactCount": 2,
  "sourceWatermark": "88421091",
  "freshnessMode": "BOUNDED_STALE",
  "instructions": [
    "Cite each sourceProjectionHash",
    "Disclose incomplete coverage"
  ],
  "forbiddenActions": [
    "increase topK",
    "change embedding version",
    "search another account",
    "inspect quarantined content"
  ],
  "omittedReasonCodes": ["POLICY_REDACTED"],
  "auditDecisionHash": "sha256:..."
}
```

This makes uncertainty explicit without allowing the agent to modify the compiled envelope. Metadata tags such as purpose, entity type, lifecycle state, risk class, source watermark, and procedure version help an agent reason about evidence quality while remaining deterministic.

## 10. Guardrails and neighbor protection

### Admission defaults

| Control | Default | Hard behavior |
|---|---:|---|
| `maxTopK` | 25 | Reject values above the envelope |
| `maxCandidates` | 2,000 | Stop HNSW expansion at reservation |
| `maxPartitions` | 4 | Reject cross-partition fan-out |
| `maxVectorVersions` | 1 | Permit 2 only for approved migration cohorts |
| `maxExpansionDepth` | 0 | A follow-up must compile a new envelope |
| `maxWallTimeMs` | 250 | Cancel vector work and return an audited partial/error status |
| `maxQueryVectorTokens` | 2,048 | Reject before model inference |
| `maxChunksPerObject` | 16 | Quarantine over-limit projections |

Enterprise plans may receive larger values, but no caller—including an autonomous agent—can increase a compiled envelope at runtime.

### Recursive query containment

- The request hash includes parent request ID and expansion depth.
- Repeated `(account_id, purpose, normalized-query-hash, board-set, version-set)` fingerprints within a workflow consume one loop budget.
- The engine never auto-retries by increasing `topK`, HNSW `ef_search`, board scope, freshness tolerance, or model count.
- A timeout returns a stable reason code. It does not fall back to a full row scan.
- Tool calls generated from hits are charged to a separate tool budget and retain the originating query decision hash.

### Availability behavior

- If the embedding provider is unavailable, row writes continue and generation jobs remain queued.
- If vector search is degraded, `STRICT` requests fail closed with a retryable status.
- `BOUNDED_STALE` requests may use an explicitly approved older active artifact above the watermark floor.
- `BEST_EFFORT` still respects purpose, account, policy, compatibility, and hard budgets.
- Quarantining one version changes an immutable serving pointer; it does not rebuild indexes synchronously.

## 11. Performance check for 1M+ row boards

The following patterns can cause a full scan or unbounded vector work and must be rejected by planning:

| Risk | Why it fails at scale | Required mitigation |
|---|---|---|
| Missing `account_id` | Cross-tenant scan and data leakage risk | Require tenant-bound plan token and leading composite keys |
| Board filter after HNSW | Traverses irrelevant neighbors | Route by account partition and use indexed board/version candidate constraints |
| JSON field filtering after vector search | Over-fetches candidates and destabilizes latency | Compile allowlisted predicates into typed indexed metadata |
| Querying all model versions | Multiplies graph traversal and incomparable scores | Resolve one version; allow two only in migration shadow reads |
| Re-embedding on reads | Couples latency to model inference and row volume | Generate asynchronously from outbox watermarks |
| Offset pagination | Repeats and expands scans | Use opaque cursor over score, artifact ID, version, and watermark |
| Counting exact coverage at read time | Scans artifact metadata | Maintain asynchronous per-account/board/version synopsis counters |
| Account-wide migration | Saturates compute, queues, and HNSW writes | Deterministic cohorts with rows/minute and concurrency reservations |
| Global HNSW rebuild | Impacts every tenant and risks availability | Build new physical partitions side by side and switch serving pointers |
| Recursive `topK` broadening | Allows an agent to amplify cost | Compile hard caps and require a separately admitted follow-up |

For a 1M-row board, planner acceptance requires:

- one `account_id`;
- an allowlisted board set;
- one physical vector family;
- no more than one active embedding version outside migration evaluation;
- bounded `topK`, candidate count, partitions, and wall time;
- typed prefilters covered by indexes;
- a precomputed coverage synopsis rather than `COUNT(*)`;
- cursor pagination;
- no row-store fallback.

## 12. Consistency and ACID semantics

The row record remains the source of truth. Embeddings are derived indexes with explicit watermarks.

- **Row write consistency:** strong; source mutation and outbox event are atomic.
- **Artifact freshness:** eventual; represented by commit sequence and freshness mode.
- **Artifact publication:** atomic across metadata, vector family, and audit event.
- **Query repeatability:** the envelope pins version, query vector hash, filters, budgets, and watermark floor. Identical envelopes return a deterministic candidate domain, although approximate HNSW ordering may change after index maintenance; the result audit captures the actual candidate/result hashes.
- **Migration cutover:** compare-and-swap on expected state hash and active version pointer.
- **Deletion:** tombstone metadata and remove vector bytes under the lifecycle policy; audit retains non-sensitive hashes and reason codes.

This separates transactional correctness from semantic freshness instead of pretending they are the same consistency guarantee.

## 13. Security and multi-tenant isolation

1. Derive the authorized account set from the principal and require exact equality with input `accountId`.
2. Prefix primary, foreign, unique, lookup, queue, and audit keys with `account_id`.
3. Partition physical vector graphs by account hash; high-isolation tenants may receive dedicated partitions.
4. Apply redaction before embedding generation, not after retrieval.
5. Never log canonical source text, query text, raw vectors, or removed values.
6. Bind query artifacts and envelopes to account, principal, purpose, and short expiry.
7. Reject metadata predicates not declared in the projection manifest.
8. Prevent cross-purpose reuse even when model and dimensions match; purpose is part of `compatibilityKey`.
9. Encrypt model request payloads in transit and prohibit providers from retaining tenant content.
10. Verify all worker leases and publish requests against tenant-scoped capability tokens.

## 14. Audit replay

An auditor can replay a decision with:

- principal and account;
- manifest and state hashes;
- model revision and compatibility key;
- source projection and vector hashes;
- source watermark;
- compiled filter and budget hashes;
- migration cohort hash, when applicable;
- candidate and returned-artifact hashes;
- omission reason codes;
- previous and current audit event hashes.

Replay proves that a recorded vector and policy state led to the recorded bounded candidate domain. It does not claim that regenerating an embedding through an external provider will always produce bit-identical bytes; the originally stored `vectorHash` is the evidence boundary.

## 15. Rollout

### Phase 1 — Provenance metadata

- Require manifests and immutable versions for new semantic indexes.
- Add source/vector hashes and watermarks to artifacts.
- Emit coverage and stale/quarantine perception fields.
- Reject new unversioned vectors.

### Phase 2 — Governed query envelopes

- Compile tenant, purpose, model, filters, freshness, and budgets before HNSW.
- Add query-vector artifacts, idempotency, and audit hashes.
- Enforce physical tenant partition routing.

### Phase 3 — Safe model migration

- Add bounded cohorts, dual-write, shadow evaluation, cutover, and rollback.
- Integrate recall regression suites and workload admission.
- Migrate legacy vectors; quarantine artifacts with unknown provenance.

### Phase 4 — Enterprise controls

- Dedicated index partitions for regulated or high-volume tenants.
- Customer-visible provenance and migration reports.
- Policy-driven retention, erasure, legal hold, and provider residency controls.

## 16. Success metrics

| Dimension | Metric |
|---|---|
| Isolation | Zero vector results whose `account_id` differs from the query envelope |
| Auditability | 100% of searchable artifacts have manifest, compatibility, vector, and source hashes |
| Freshness | p99 source-commit-to-searchable latency by tenant tier |
| Availability | Row-write SLO unchanged during embedding provider or vector-plane incidents |
| Predictability | 100% of vector queries admitted with explicit candidate, partition, and wall-time budgets |
| Migration safety | 100% of cutovers satisfy stored coverage, quality, and latency thresholds |
| Scale | No planner-approved full row scan for semantic queries on 1M+ row boards |
| Agent trust | 100% of responses expose coverage, watermark, omission reasons, and audit decision hash |

## 17. Open decisions

1. Which model providers can guarantee immutable revision identifiers and no payload retention?
2. Which fixed dimension/metric families should mondayDB support initially to avoid physical index sprawl?
3. Should high-isolation tenants receive one partition per account or a dedicated account range?
4. What bounded staleness defaults should apply by purpose: RAG, procedure discovery, entity matching, and memory recall?
5. Which offline evaluation sets authorize model cutover without exposing customer content?
6. How long should short-lived query vectors remain available for audit replay?

## 18. Recommendation

Build provenance and query envelopes before broadening semantic capabilities. Vector search without immutable manifests and compatibility boundaries may appear faster to ship, but it creates silent model mixing, weak deletion guarantees, unrepeatable migrations, and tenant-isolation risk. This plane preserves mondayDB’s deterministic enterprise core while giving agents high-quality semantic perception, explicit procedural instructions, and bounded tool-ready context.
