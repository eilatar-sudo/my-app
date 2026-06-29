# Agentic Vector Transaction Journal Plane

## Why this matters

mondayDB can become an agentic database without putting probabilistic embedding
work on the critical ACID write path. The trade-off is explicit: row and
columnar writes stay strongly consistent and low latency, while semantic
retrieval becomes visible through deterministic journal watermarks. Agents get
fresh-enough memory with replayable provenance instead of "magic" vector state
that may or may not match the latest board mutation.

The Vector Transaction Journal is a tenant-scoped, append-only bridge between
the hybrid row/columnar engine and pgvector/HNSW-compatible semantic indexes. A
row update, formula change, file extraction, or automation outcome emits a
small deterministic journal entry inside the same transaction as the source
change. Async workers later materialize embeddings and HNSW updates from that
journal, but every retrieval request must declare the visibility watermark it is
willing to accept.

## Product trade-off: latency vs. semantic freshness

- **ACID writes win over synchronous embeddings.** Synchronous embedding would
  increase p99 write latency and create availability coupling to model or vector
  workers. The journal keeps the source-of-truth commit path deterministic.
- **Semantic retrieval becomes bounded-stale, not ambiguous.** GraphQL callers
  can ask for `requireSemanticWatermark >= boardMutationWatermark` when they
  need read-your-write semantic consistency, or accept a lower watermark for
  faster agent exploration.
- **Enterprise audit improves.** Every embedding and vector index mutation can
  be traced back to an immutable journal row, source row version, policy
  envelope, and deterministic hash.

## Goals

1. Give agents durable semantic memory over board rows, updates, automations,
   docs, and prior outcomes.
2. Preserve 99.99% availability for row/transaction paths by avoiding hard
   dependency on vector workers.
3. Enforce multi-tenant isolation with `account_id` as the leading key on every
   table, queue, index, and GraphQL resolver.
4. Make vector freshness and retrieval cost predictable through declared
   watermarks, budgets, and recursion limits.
5. Support pgvector/HNSW-compatible indexing without binding mondayDB to one
   embedding model or ANN implementation.

## Non-goals

- The journal does not let LLMs mutate data directly. Agents still use
  deterministic write intents, policy envelopes, and audited tool execution.
- The journal does not infer hidden business meaning in the database engine.
  It stores source payloads, metadata, embedding inputs, and deterministic
  hashes. Probabilistic interpretation remains outside the core data layer.
- The journal is not a replacement for row or columnar storage. It is a semantic
  materialization log.

## Architecture

```text
ACID source transaction
  - row store mutation
  - columnar invalidation marker
  - vector journal entry, same account_id and commit_lsn

Async semantic workers
  - claim tenant-scoped journal slices
  - build embedding input from deterministic source refs
  - write vector chunks and visibility watermarks
  - append audit events

GraphQL retrieval
  - requires account_id from auth context
  - checks visibility watermark and budget envelope
  - executes tenant-partitioned HNSW search
  - returns source refs, watermarks, and perception metadata
```

## TypeScript contracts

```ts
export type VectorJournalSourceKind =
  | "board_row"
  | "item_update"
  | "automation_run"
  | "doc_block"
  | "file_extraction"
  | "procedure_memory"
  | "tool_outcome";

export type VectorJournalOperation =
  | "upsert_embedding"
  | "delete_embedding"
  | "redact_embedding"
  | "rebuild_embedding";

export interface VectorJournalEntry {
  accountId: string;
  journalId: string;
  boardId?: string;
  workspaceId?: string;
  sourceKind: VectorJournalSourceKind;
  sourceId: string;
  sourceVersion: string;
  operation: VectorJournalOperation;
  commitLsn: string;
  rowWatermark: string;
  columnarWatermark?: string;
  embeddingPolicyId: string;
  purposeBoundaryId: string;
  visibilityPolicyHash: string;
  payloadHash: string;
  agentTags: string[];
  procedureMemoryRefs: string[];
  createdAt: string;
}

export interface VectorMaterializationRecord {
  accountId: string;
  journalId: string;
  embeddingId: string;
  modelId: string;
  embeddingVersion: string;
  vectorDimensions: number;
  hnswPartitionKey: string;
  materializedWatermark: string;
  sourcePayloadHash: string;
  vectorHash: string;
  status: "pending" | "materialized" | "redacted" | "failed_retryable" | "failed_final";
  auditHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgenticVectorRetrievalRequest {
  accountId: string; // Resolved from auth context; clients cannot override it.
  boardIds?: string[];
  sourceKinds?: VectorJournalSourceKind[];
  queryEmbeddingId?: string;
  naturalLanguageQuery?: string;
  requireSemanticWatermark?: string;
  maxVectorTopK: number;
  maxExpansionDepth: number;
  deadlineMs: number;
  budgetToken: string;
  purposeBoundaryId: string;
}

export interface AgenticVectorRetrievalHit {
  accountId: string;
  embeddingId: string;
  sourceKind: VectorJournalSourceKind;
  sourceId: string;
  sourceVersion: string;
  score: number;
  materializedWatermark: string;
  perceptionCard: {
    label: string;
    agentTags: string[];
    procedureMemoryRefs: string[];
    riskTags: string[];
    forbiddenActions: string[];
  };
}
```

## SQL schema

All primary and secondary indexes lead with `account_id`. This is not optional:
tenant isolation and predictable partition pruning depend on it.

```sql
CREATE TABLE agentic_vector_journal_entries (
  account_id              BIGINT       NOT NULL,
  journal_id              UUID         NOT NULL,
  board_id                BIGINT,
  workspace_id            BIGINT,
  source_kind             TEXT         NOT NULL,
  source_id               TEXT         NOT NULL,
  source_version          TEXT         NOT NULL,
  operation               TEXT         NOT NULL,
  commit_lsn              NUMERIC(38,0) NOT NULL,
  row_watermark           NUMERIC(38,0) NOT NULL,
  columnar_watermark      NUMERIC(38,0),
  embedding_policy_id     UUID         NOT NULL,
  purpose_boundary_id     UUID         NOT NULL,
  visibility_policy_hash  CHAR(64)     NOT NULL,
  payload_hash            CHAR(64)     NOT NULL,
  agent_tags              TEXT[]       NOT NULL DEFAULT '{}',
  procedure_memory_refs   UUID[]       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, journal_id)
);

CREATE INDEX agentic_vector_journal_by_source
  ON agentic_vector_journal_entries (
    account_id,
    source_kind,
    source_id,
    commit_lsn DESC
  );

CREATE INDEX agentic_vector_journal_pending
  ON agentic_vector_journal_entries (
    account_id,
    commit_lsn
  );

CREATE TABLE agentic_vector_materializations (
  account_id              BIGINT       NOT NULL,
  journal_id              UUID         NOT NULL,
  embedding_id            UUID         NOT NULL,
  model_id                TEXT         NOT NULL,
  embedding_version       TEXT         NOT NULL,
  vector_dimensions       INTEGER      NOT NULL,
  hnsw_partition_key      TEXT         NOT NULL,
  materialized_watermark  NUMERIC(38,0) NOT NULL,
  source_payload_hash     CHAR(64)     NOT NULL,
  vector_hash             CHAR(64)     NOT NULL,
  status                  TEXT         NOT NULL,
  audit_hash              CHAR(64)     NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id),
  FOREIGN KEY (account_id, journal_id)
    REFERENCES agentic_vector_journal_entries (account_id, journal_id)
);

CREATE INDEX agentic_vector_materializations_watermark
  ON agentic_vector_materializations (
    account_id,
    hnsw_partition_key,
    materialized_watermark DESC
  );

-- Example pgvector-compatible table. In production this can be sharded by
-- account hash and source kind so HNSW never mixes tenants.
CREATE TABLE agentic_vector_embeddings (
  account_id              BIGINT       NOT NULL,
  embedding_id            UUID         NOT NULL,
  hnsw_partition_key      TEXT         NOT NULL,
  source_kind             TEXT         NOT NULL,
  source_id               TEXT         NOT NULL,
  source_version          TEXT         NOT NULL,
  materialized_watermark  NUMERIC(38,0) NOT NULL,
  embedding               vector(1536) NOT NULL,
  metadata_hash           CHAR(64)     NOT NULL,
  PRIMARY KEY (account_id, embedding_id)
);

CREATE INDEX agentic_vector_embeddings_hnsw
  ON agentic_vector_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX agentic_vector_embeddings_tenant_filter
  ON agentic_vector_embeddings (
    account_id,
    hnsw_partition_key,
    source_kind,
    materialized_watermark DESC
  );

CREATE TABLE agentic_vector_visibility_watermarks (
  account_id              BIGINT       NOT NULL,
  hnsw_partition_key      TEXT         NOT NULL,
  max_committed_lsn       NUMERIC(38,0) NOT NULL,
  max_materialized_lsn    NUMERIC(38,0) NOT NULL,
  pending_count           BIGINT       NOT NULL,
  oldest_pending_at       TIMESTAMPTZ,
  audit_hash              CHAR(64)     NOT NULL,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, hnsw_partition_key)
);
```

## Open API GraphQL shape

Every resolver derives `account_id` from the authenticated monday.com context.
Any request-provided `accountId` is ignored or rejected to avoid tenant spoofing.

```graphql
enum VectorJournalSourceKind {
  BOARD_ROW
  ITEM_UPDATE
  AUTOMATION_RUN
  DOC_BLOCK
  FILE_EXTRACTION
  PROCEDURE_MEMORY
  TOOL_OUTCOME
}

type AgenticVectorWatermark {
  hnswPartitionKey: String!
  maxCommittedLsn: String!
  maxMaterializedLsn: String!
  pendingCount: Int!
  oldestPendingAt: String
}

type AgenticVectorPerceptionCard {
  label: String!
  agentTags: [String!]!
  procedureMemoryRefs: [ID!]!
  riskTags: [String!]!
  forbiddenActions: [String!]!
}

type AgenticVectorHit {
  embeddingId: ID!
  sourceKind: VectorJournalSourceKind!
  sourceId: ID!
  sourceVersion: String!
  score: Float!
  materializedWatermark: String!
  perceptionCard: AgenticVectorPerceptionCard!
}

input AgenticVectorRetrievalInput {
  boardIds: [ID!]
  sourceKinds: [VectorJournalSourceKind!]
  naturalLanguageQuery: String
  requireSemanticWatermark: String
  maxVectorTopK: Int! = 20
  maxExpansionDepth: Int! = 1
  deadlineMs: Int! = 250
  budgetToken: ID!
  purposeBoundaryId: ID!
}

type AgenticVectorRetrievalPayload {
  hits: [AgenticVectorHit!]!
  observedWatermark: AgenticVectorWatermark!
  freshnessSatisfied: Boolean!
  auditHash: String!
}

extend type Query {
  agenticVectorWatermark(boardId: ID): AgenticVectorWatermark!
  agenticVectorSearch(input: AgenticVectorRetrievalInput!): AgenticVectorRetrievalPayload!
}
```

## Deterministic write path

1. A source mutation commits in the row store under `(account_id, board_id,
   item_id, version)`.
2. The transaction emits one or more `agentic_vector_journal_entries` rows with
   the same `account_id`, source version, `commit_lsn`, and payload hash.
3. Columnar invalidation and the vector journal entry are committed atomically
   with the source mutation.
4. No embedding model is called in the transaction.
5. If journal emission fails, the source transaction fails. This preserves
   replayability and prevents invisible semantic drift.

## Async materialization path

Workers claim journal ranges by `(account_id, commit_lsn)` and must only process
one tenant partition per lease. Materialization creates deterministic embedding
input from source refs and policy envelopes, calls the embedding service outside
the database transaction, then writes vector rows and updates visibility
watermarks atomically.

Retry behavior is deterministic:

- Retryable model or worker errors leave `status = failed_retryable` with the
  same `journal_id` and next-attempt metadata in the worker queue.
- Policy redactions write `redact_embedding` journal entries rather than
  in-place hidden deletes.
- Rebuilds create new `embedding_version` values so old retrievals remain
  replayable for audit.

## Agentic guardrails

- `maxVectorTopK` is capped by tenant plan, request purpose, and live workload
  admission. Default cap: 20. Hard cap for autonomous agents: 100.
- `maxExpansionDepth` defaults to 1 and must never exceed 3 for autonomous
  workflows. Each expansion step consumes budget from the same ledger token.
- Retrieval must include `purposeBoundaryId`; vector hits outside the compiled
  purpose envelope are filtered before scoring is returned.
- Workers and GraphQL resolvers reject cross-account source refs even if a
  malformed journal entry or vector row exists.
- Recursive retrieval requires loop containment fingerprints over
  `(account_id, purpose_boundary_id, query_hash, source_kind, source_id)`.
- Requests missing `budgetToken` or `deadlineMs` are rejected instead of falling
  back to unlimited search.

## Performance check for 1M+ row boards

Potential full table scan risks and mitigations:

| Risk | Mitigation |
| --- | --- |
| Searching vectors without account partition | Require `account_id` from auth context and route to account-hash HNSW partitions. |
| Filtering `board_id` after ANN search across a tenant | Include `hnsw_partition_key = account_id:board_id:source_kind` for large boards. |
| Replaying all journal rows for a board | Resume by `(account_id, commit_lsn)` and persist worker checkpoints. |
| Unbounded semantic expansion from one hit to many source rows | Enforce `maxExpansionDepth`, `maxVectorTopK`, and per-step budget charges. |
| Waiting for latest semantic watermark on hot boards | Return `freshnessSatisfied = false` with the observed watermark unless the caller explicitly requires blocking semantics. |
| Redaction scans across embeddings | Emit source-scoped `redact_embedding` entries and index `(account_id, source_kind, source_id, commit_lsn)`. |

For boards over 1M rows, the planner should reject any vector search that does
not have at least one of:

- `boardIds` narrowed to tenant-visible boards,
- `sourceKinds` narrowed to a small source set,
- a purpose envelope that maps to a bounded `hnsw_partition_key`,
- or an approved offline analytics budget.

## Agent perception model

An LLM should perceive vector hits as bounded evidence cards, not raw database
authority. The perception card tells the agent:

- what entity or memory was found,
- which procedure memory refs explain how to use it,
- why the hit may be risky,
- which actions are explicitly forbidden,
- and what semantic watermark proves its freshness.

Example:

```json
{
  "label": "Escalation policy for enterprise incident board",
  "agentTags": ["incident", "enterprise", "sla"],
  "procedureMemoryRefs": ["6e3e3f10-4e83-4dd8-8f1a-151f0ddaa201"],
  "riskTags": ["customer_visible", "requires_human_approval"],
  "forbiddenActions": ["send_external_email_without_review"]
}
```

## Auditability

Each retrieval returns an `auditHash` derived from:

```text
sha256(
  account_id ||
  query_hash ||
  purpose_boundary_id ||
  budget_token ||
  require_semantic_watermark ||
  observed_watermark ||
  ordered_embedding_ids ||
  ordered_source_versions
)
```

Each materialization record stores a separate `audit_hash` over the journal row,
embedding model, embedding input hash, vector hash, and materialized watermark.
This gives support, compliance, and regression systems a deterministic path from
agent answer back to source data.

## Operational SLOs

- Row write p99 should not regress from semantic indexing because journal rows
  are small and committed in the existing transaction boundary.
- Vector materialization lag should be tracked per `(account_id,
  hnsw_partition_key)`.
- Tenant noisy-neighbor controls should admit, queue, or degrade vector
  materialization independently from transactional writes.
- GraphQL vector search should have explicit timeout partitioning: embedding
  query construction, ANN search, source hydration, and audit packet assembly.

## Rollout plan

1. Start with read-only materialization for item updates and doc blocks.
2. Expose `agenticVectorWatermark` so clients can observe semantic lag before
   relying on retrieval.
3. Add `agenticVectorSearch` behind workload admission and purpose envelopes.
4. Add procedure memory and tool outcome source kinds after audit replay proves
   deterministic for row/doc sources.
5. Gate autonomous write workflows on required semantic watermarks only when the
   product experience truly needs read-your-write semantic consistency.

## Success metrics

- Source write latency unchanged within agreed p99 guardrails.
- Materialization lag visible per tenant and bounded by workload class.
- 100% of vector hits returned through Open API include source version,
  materialized watermark, purpose boundary, and audit hash.
- Zero vector queries execute without `account_id`-scoped partition routing.
- Full-scan rejections are observable and explainable to enterprise admins.
