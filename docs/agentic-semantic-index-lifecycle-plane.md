# mondayDB Agentic Semantic Index Lifecycle Plane

## Why before how

Agentic mondayDB needs semantic retrieval, but vector search cannot become hidden
database behavior. Agents may be probabilistic, while mondayDB must stay
deterministic, auditable, tenant-scoped, and predictable under load.

The Semantic Index Lifecycle Plane makes embedding creation, HNSW indexing, and
retrieval readiness explicit product surfaces. It solves four trade-offs:

- **Freshness vs. transaction latency:** item writes stay ACID in the row store.
  Embeddings are built asynchronously from committed change events, so user writes
  are not blocked by model latency.
- **Recall vs. tenant isolation:** vector candidates are only searched inside a
  tenant-scoped shard or partition. Cross-account HNSW graphs are not allowed,
  even when embeddings share the same model.
- **Semantic power vs. deterministic auditability:** generated embeddings are
  derived artifacts with content hashes, model versions, and reproducible job
  inputs. The engine never invents data at query time.
- **Low latency vs. write amplification:** columnar and vector indexes are updated
  in bounded lifecycle batches, with degraded-but-correct behavior when a source
  has not reached `ready` state.

Agents perceive this plane as a catalog of "meaning-bearing records": item text,
updates, docs, board procedures, automation recipes, and approved procedural
memory. Each record carries tags and policy metadata that tell an LLM what the
record is, whether it is instruction-like, and which tools may safely consume it.

## Product contract

Semantic indexing is an explicit Open API capability. Product teams can opt boards,
workspaces, or memory namespaces into indexing policies, observe index freshness,
and request bounded semantic search.

Core contract:

1. Every semantic source belongs to exactly one `account_id`.
2. Every indexed chunk is derived from a committed mondayDB version and a stable
   `content_hash`.
3. Every embedding records `embedding_model`, `embedding_version`, and
   `embedding_dimensions`.
4. HNSW search runs inside a tenant-scoped physical partition or shard key.
5. ACL filters are evaluated before returning results; inaccessible candidates
   are discarded and counted in audit metadata.
6. Expensive retrieval plans are rejected before execution when they exceed query
   budget, vector neighbor, recursion, or timeout limits.
7. No semantic query may fall back to a full table scan on 1M+ row boards.

Lifecycle states:

```text
source_changed -> queued -> embedding -> indexed -> ready
                         \-> quarantined
ready -> stale -> queued
ready -> retired
```

`ready` means the semantic chunk is searchable for its tenant and authorization
scope. `stale` means the row-store source changed after the current embedding was
created. `quarantined` means the source or embedding job failed policy validation
and requires deterministic remediation.

## TypeScript interfaces

```ts
export type SemanticSourceType =
  | "board_item"
  | "update"
  | "document"
  | "automation"
  | "procedure"
  | "feedback"
  | "tool_result";

export type SemanticLifecycleState =
  | "queued"
  | "embedding"
  | "indexed"
  | "ready"
  | "stale"
  | "retired"
  | "quarantined";

export type ProceduralRole =
  | "none"
  | "instruction"
  | "constraint"
  | "example"
  | "tool_affordance"
  | "rollback_hint";

export interface AgenticSemanticSource {
  account_id: string;
  source_id: string;
  source_type: SemanticSourceType;
  board_id?: string;
  item_id?: string;
  column_id?: string;
  namespace_id?: string;
  stable_version: string;
  content_hash: string;
  visibility_hash: string;
  lifecycle_state: SemanticLifecycleState;
  procedural_role: ProceduralRole;
  semantic_tags: string[];
  index_policy_id: string;
  updated_at: string;
  created_at: string;
  audit_hash: string;
}

export interface AgenticSemanticChunk {
  account_id: string;
  chunk_id: string;
  source_id: string;
  chunk_ordinal: number;
  chunk_hash: string;
  text_ref: string;
  token_count: number;
  metadata_tags: string[];
  procedural_role: ProceduralRole;
  embedding_model: string;
  embedding_version: string;
  embedding_dimensions: number;
  hnsw_partition_key: string;
  embedded_at?: string;
  ready_at?: string;
}

export interface SemanticEmbeddingJob {
  account_id: string;
  job_id: string;
  source_id: string;
  requested_by: "change_event" | "api" | "rebuild" | "policy";
  input_hash: string;
  model_policy_id: string;
  lifecycle_state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  retry_count: number;
  cost_units_reserved: number;
  error_code?: string;
  created_at: string;
  completed_at?: string;
}

export interface SemanticIndexBuild {
  account_id: string;
  build_id: string;
  hnsw_partition_key: string;
  embedding_model: string;
  embedding_version: string;
  source_watermark: string;
  lifecycle_state: "planned" | "building" | "ready" | "failed" | "retired";
  indexed_chunk_count: number;
  ef_construction: number;
  m: number;
  created_at: string;
  ready_at?: string;
}

export interface SemanticRetrievalRequest {
  account_id: string;
  request_id: string;
  actor_user_id: string;
  actor_agent_id?: string;
  query_text: string;
  board_ids?: string[];
  namespace_ids?: string[];
  semantic_tags?: string[];
  procedural_roles?: ProceduralRole[];
  top_k: number;
  ef_search: number;
  max_candidate_count: number;
  timeout_ms: number;
  require_ready_index: boolean;
}

export interface SemanticRetrievalResult {
  account_id: string;
  request_id: string;
  chunk_id: string;
  source_id: string;
  score: number;
  source_type: SemanticSourceType;
  procedural_role: ProceduralRole;
  metadata_tags: string[];
  stable_version: string;
  visibility_hash: string;
}

export interface SemanticGuardrailDecision {
  account_id: string;
  request_id: string;
  decision: "allow" | "deny" | "degrade";
  reason_code:
    | "within_budget"
    | "missing_account_scope"
    | "unbounded_top_k"
    | "partition_too_large"
    | "recursive_query_budget_exceeded"
    | "stale_index_only"
    | "acl_candidate_overflow";
  estimated_vector_reads: number;
  estimated_row_reads: number;
  max_allowed_vector_reads: number;
  timeout_ms: number;
}

export interface SemanticIndexAuditEvent {
  account_id: string;
  event_id: string;
  subject_id: string;
  subject_type: "source" | "chunk" | "job" | "build" | "query";
  action:
    | "source_registered"
    | "embedding_queued"
    | "embedding_completed"
    | "index_ready"
    | "query_allowed"
    | "query_denied"
    | "source_retired"
    | "source_quarantined";
  actor_type: "user" | "agent" | "system";
  actor_id: string;
  request_hash: string;
  result_hash?: string;
  previous_event_hash?: string;
  created_at: string;
}
```

## SQL schema

This schema assumes pgvector-compatible storage. Production deployments should
partition `agentic_semantic_chunks` by `hnsw_partition_key` or map that key to a
tenant-scoped vector shard. A single global HNSW graph across tenants is forbidden.

```sql
CREATE TABLE agentic_semantic_sources (
  account_id BIGINT NOT NULL,
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'board_item',
      'update',
      'document',
      'automation',
      'procedure',
      'feedback',
      'tool_result'
    )
  ),
  board_id BIGINT,
  item_id BIGINT,
  column_id TEXT,
  namespace_id UUID,
  stable_version TEXT NOT NULL,
  content_hash BYTEA NOT NULL,
  visibility_hash BYTEA NOT NULL,
  lifecycle_state TEXT NOT NULL CHECK (
    lifecycle_state IN (
      'queued',
      'embedding',
      'indexed',
      'ready',
      'stale',
      'retired',
      'quarantined'
    )
  ),
  procedural_role TEXT NOT NULL CHECK (
    procedural_role IN (
      'none',
      'instruction',
      'constraint',
      'example',
      'tool_affordance',
      'rollback_hint'
    )
  ),
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  index_policy_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, source_id)
);

CREATE INDEX agentic_semantic_sources_board_idx
  ON agentic_semantic_sources (account_id, board_id, lifecycle_state, updated_at DESC);

CREATE INDEX agentic_semantic_sources_item_idx
  ON agentic_semantic_sources (account_id, item_id, updated_at DESC)
  WHERE item_id IS NOT NULL;

CREATE INDEX agentic_semantic_sources_namespace_idx
  ON agentic_semantic_sources (account_id, namespace_id, lifecycle_state)
  WHERE namespace_id IS NOT NULL;

CREATE INDEX agentic_semantic_sources_tags_idx
  ON agentic_semantic_sources USING gin (semantic_tags);

CREATE TABLE agentic_semantic_chunks (
  account_id BIGINT NOT NULL,
  chunk_id UUID NOT NULL,
  source_id UUID NOT NULL,
  chunk_ordinal INTEGER NOT NULL,
  chunk_hash BYTEA NOT NULL,
  text_ref TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK (token_count > 0),
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  procedural_role TEXT NOT NULL CHECK (
    procedural_role IN (
      'none',
      'instruction',
      'constraint',
      'example',
      'tool_affordance',
      'rollback_hint'
    )
  ),
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  embedding vector(1536) NOT NULL,
  hnsw_partition_key TEXT NOT NULL,
  embedded_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, hnsw_partition_key, chunk_id),
  FOREIGN KEY (account_id, source_id)
    REFERENCES agentic_semantic_sources (account_id, source_id)
)
PARTITION BY LIST (hnsw_partition_key);

CREATE UNIQUE INDEX agentic_semantic_chunks_source_ordinal_idx
  ON agentic_semantic_chunks (
    account_id,
    hnsw_partition_key,
    source_id,
    chunk_ordinal
  );

CREATE INDEX agentic_semantic_chunks_partition_idx
  ON agentic_semantic_chunks (
    account_id,
    hnsw_partition_key,
    embedding_model,
    embedding_version,
    ready_at DESC
  );

CREATE INDEX agentic_semantic_chunks_tags_idx
  ON agentic_semantic_chunks USING gin (metadata_tags);

-- Create this index only on tenant-scoped partitions or shards, never on a
-- mixed-tenant global heap. Tune m and ef_construction through index policy.
CREATE INDEX agentic_semantic_chunks_embedding_hnsw_idx
  ON agentic_semantic_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE agentic_semantic_embedding_jobs (
  account_id BIGINT NOT NULL,
  job_id UUID NOT NULL,
  source_id UUID NOT NULL,
  requested_by TEXT NOT NULL CHECK (
    requested_by IN ('change_event', 'api', 'rebuild', 'policy')
  ),
  input_hash BYTEA NOT NULL,
  model_policy_id UUID NOT NULL,
  lifecycle_state TEXT NOT NULL CHECK (
    lifecycle_state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  retry_count INTEGER NOT NULL DEFAULT 0,
  cost_units_reserved BIGINT NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, job_id),
  FOREIGN KEY (account_id, source_id)
    REFERENCES agentic_semantic_sources (account_id, source_id)
);

CREATE INDEX agentic_semantic_embedding_jobs_queue_idx
  ON agentic_semantic_embedding_jobs (
    account_id,
    lifecycle_state,
    created_at
  );

CREATE TABLE agentic_semantic_index_builds (
  account_id BIGINT NOT NULL,
  build_id UUID NOT NULL,
  hnsw_partition_key TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL CHECK (
    lifecycle_state IN ('planned', 'building', 'ready', 'failed', 'retired')
  ),
  indexed_chunk_count BIGINT NOT NULL DEFAULT 0,
  ef_construction INTEGER NOT NULL,
  m INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, build_id)
);

CREATE INDEX agentic_semantic_index_builds_ready_idx
  ON agentic_semantic_index_builds (
    account_id,
    hnsw_partition_key,
    lifecycle_state,
    ready_at DESC
  );

CREATE TABLE agentic_semantic_query_audits (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  actor_agent_id UUID,
  query_hash BYTEA NOT NULL,
  filter_hash BYTEA NOT NULL,
  top_k INTEGER NOT NULL,
  ef_search INTEGER NOT NULL,
  max_candidate_count INTEGER NOT NULL,
  estimated_vector_reads BIGINT NOT NULL,
  estimated_row_reads BIGINT NOT NULL,
  returned_count INTEGER NOT NULL,
  acl_discarded_count INTEGER NOT NULL,
  guardrail_decision TEXT NOT NULL CHECK (
    guardrail_decision IN ('allow', 'deny', 'degrade')
  ),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id)
);

CREATE INDEX agentic_semantic_query_audits_actor_idx
  ON agentic_semantic_query_audits (account_id, actor_user_id, created_at DESC);

CREATE TABLE agentic_semantic_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (
    subject_type IN ('source', 'chunk', 'job', 'build', 'query')
  ),
  action TEXT NOT NULL CHECK (
    action IN (
      'source_registered',
      'embedding_queued',
      'embedding_completed',
      'index_ready',
      'query_allowed',
      'query_denied',
      'source_retired',
      'source_quarantined'
    )
  ),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  request_hash BYTEA NOT NULL,
  result_hash BYTEA,
  previous_event_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_semantic_audit_events_chain_idx
  ON agentic_semantic_audit_events (account_id, subject_type, subject_id, created_at);
```

### Storage layout

- **Row store:** source metadata, lifecycle state, audit rows, and job ledgers.
- **Columnar store:** aggregate freshness metrics by account, board, source type,
  lifecycle state, model version, and policy.
- **Vector store:** chunk embeddings partitioned by `hnsw_partition_key`.
- **Object storage:** chunk text payloads addressed by `text_ref`, with content hash
  validation before serving to retrieval callers.

For large enterprise accounts, `hnsw_partition_key` should include account and
semantic locality, for example `acct_123:board_456:model_text_v3`. For smaller
accounts, multiple boards can share an account-local partition, but never a
cross-account one.

## Open API GraphQL shape

```graphql
enum SemanticSourceType {
  board_item
  update
  document
  automation
  procedure
  feedback
  tool_result
}

enum ProceduralRole {
  none
  instruction
  constraint
  example
  tool_affordance
  rollback_hint
}

input RegisterSemanticSourceInput {
  account_id: ID!
  source_type: SemanticSourceType!
  board_id: ID
  item_id: ID
  column_id: String
  namespace_id: ID
  stable_version: String!
  content_hash: String!
  visibility_hash: String!
  procedural_role: ProceduralRole = none
  semantic_tags: [String!] = []
  index_policy_id: ID!
}

input RequestSemanticReindexInput {
  account_id: ID!
  source_ids: [ID!]!
  reason: String!
  max_cost_units: Int!
}

input SemanticSearchInput {
  account_id: ID!
  query_text: String!
  board_ids: [ID!] = []
  namespace_ids: [ID!] = []
  semantic_tags: [String!] = []
  procedural_roles: [ProceduralRole!] = []
  top_k: Int = 10
  ef_search: Int = 40
  max_candidate_count: Int = 200
  timeout_ms: Int = 500
  require_ready_index: Boolean = true
}

type SemanticSource {
  account_id: ID!
  source_id: ID!
  source_type: SemanticSourceType!
  board_id: ID
  item_id: ID
  namespace_id: ID
  stable_version: String!
  lifecycle_state: String!
  procedural_role: ProceduralRole!
  semantic_tags: [String!]!
  updated_at: String!
}

type SemanticSearchResult {
  account_id: ID!
  request_id: ID!
  source_id: ID!
  chunk_id: ID!
  source_type: SemanticSourceType!
  procedural_role: ProceduralRole!
  score: Float!
  stable_version: String!
  semantic_tags: [String!]!
  text_ref: String!
}

type SemanticGuardrailReport {
  decision: String!
  reason_code: String!
  estimated_vector_reads: Int!
  estimated_row_reads: Int!
  max_allowed_vector_reads: Int!
  timeout_ms: Int!
}

type SemanticSearchPayload {
  request_id: ID!
  results: [SemanticSearchResult!]!
  guardrail: SemanticGuardrailReport!
  index_watermark: String!
}

type Mutation {
  registerSemanticSource(input: RegisterSemanticSourceInput!): SemanticSource!
  requestSemanticReindex(input: RequestSemanticReindexInput!): Boolean!
}

type Query {
  semanticSearch(input: SemanticSearchInput!): SemanticSearchPayload!
  semanticSource(account_id: ID!, source_id: ID!): SemanticSource
}
```

## Deterministic lifecycle flow

1. A committed mondayDB change event records `account_id`, source locator,
   `stable_version`, `content_hash`, and `visibility_hash`.
2. The source registry upserts one `agentic_semantic_sources` row. If the content
   hash changed, state becomes `queued`; if ACL changed, `visibility_hash` changes
   and prior chunks are treated as stale for that authorization envelope.
3. The embedding scheduler reserves budget in the query budget plane before
   creating `agentic_semantic_embedding_jobs`.
4. The embedding worker reads source content by stable version, validates
   `content_hash`, chunks deterministically, and writes chunk rows.
5. The vector index builder adds chunks to the tenant-scoped HNSW partition.
6. The builder advances the source to `ready` only after the partition watermark
   includes all source chunks.
7. Audit events hash the request and result for every state transition.

If embedding service output changes for the same model name, mondayDB treats it as
a new `embedding_version`. Existing vectors remain queryable until the rebuild
policy retires them.

## Semantic retrieval plan

Retrieval is a bounded two-phase plan:

1. **Candidate generation:** run HNSW search inside the tenant partition with
   explicit `top_k`, `ef_search`, and `max_candidate_count`.
2. **Deterministic hydration:** join candidates back to source metadata using
   `(account_id, source_id)`, apply board filters, namespace filters, lifecycle
   state, and ACL checks before returning `text_ref` values.

Example planner pseudocode:

```ts
export function planSemanticSearch(input: SemanticRetrievalRequest): SemanticGuardrailDecision {
  if (!input.account_id) {
    return deny(input, "missing_account_scope");
  }

  if (input.top_k < 1 || input.top_k > 50) {
    return deny(input, "unbounded_top_k");
  }

  const maxCandidateCount = Math.min(input.max_candidate_count, input.top_k * 20);
  const estimatedVectorReads = input.ef_search * partitionFanout(input);
  const estimatedRowReads = maxCandidateCount;

  if (estimatedVectorReads > budgetFor(input.account_id).max_vector_reads) {
    return deny(input, "partition_too_large");
  }

  if (input.timeout_ms > budgetFor(input.account_id).max_semantic_timeout_ms) {
    return deny(input, "recursive_query_budget_exceeded");
  }

  return {
    account_id: input.account_id,
    request_id: input.request_id,
    decision: "allow",
    reason_code: "within_budget",
    estimated_vector_reads: estimatedVectorReads,
    estimated_row_reads: estimatedRowReads,
    max_allowed_vector_reads: budgetFor(input.account_id).max_vector_reads,
    timeout_ms: input.timeout_ms,
  };
}
```

## Agentic guardrails

- Require `account_id` at GraphQL boundary and in internal planner contracts.
- Cap `top_k`, `ef_search`, `max_candidate_count`, and `timeout_ms` by account
  tier and current cluster pressure.
- Reject recursive retrieval when an agent tries to use semantic search results to
  issue more semantic searches beyond configured depth.
- Require `procedural_role` filters for procedure retrieval so agents do not treat
  arbitrary updates as executable instructions.
- Separate "read for context" retrieval from "tool-use readiness" retrieval. Tool
  calls require capability registry approval and audit linkage.
- Emit audit rows for denied searches; denial is part of deterministic trace.
- Prefer stale-but-ready results only when caller sets `require_ready_index = false`
  and policy allows degraded retrieval.
- Never expand from vector candidates into unbounded board joins. Hydration joins
  must use candidate IDs and tenant-prefixed indexes.

## Performance check

Full table scan risks on boards with 1M+ rows:

- Missing `account_id` in source, chunk, job, build, or audit query predicates.
- Searching a global HNSW index shared by multiple accounts.
- Filtering by `board_id`, `namespace_id`, or `semantic_tags` after retrieving an
  unbounded candidate set.
- Allowing `top_k` or `ef_search` to be agent-controlled without budget caps.
- Rebuilding embeddings synchronously in user write transactions.
- Rehydrating candidate chunks by `source_id` without `(account_id, source_id)`.
- Running semantic search against `stale` sources unless degraded mode is explicit.

Mitigations:

- Prefix all B-tree indexes with `account_id`.
- Partition vector indexes by `hnsw_partition_key`.
- Maintain columnar freshness summaries so index status pages avoid scanning
  source tables.
- Use deterministic chunk ordinals and content hashes for idempotent rebuilds.
- Precompute board and namespace partition routing from source metadata.
- Enforce planner estimates before vector execution and record actuals after
  execution.

## Auditability and replay

Every lifecycle transition emits an audit event. Hash inputs should include:

- `account_id`
- source locator
- stable source version
- content hash
- visibility hash
- chunking policy version
- embedding model and version
- index policy ID
- previous event hash

Query audits hash the query text, filters, guardrail decision, model version,
partition key, and ordered result IDs. Replay can prove that a returned result came
from committed mondayDB state and a specific embedding/index build, without
requiring model calls during the audit.

## Agent perception model

An LLM should see semantic records as structured context, not raw database magic:

```ts
export interface AgentVisibleSemanticRecord {
  source_id: string;
  chunk_id: string;
  source_type: SemanticSourceType;
  procedural_role: ProceduralRole;
  stable_version: string;
  semantic_tags: string[];
  score: number;
  text_ref: string;
  guardrail_reason: string;
}
```

Recommended tags:

- `customer_signal`
- `project_status`
- `risk`
- `decision`
- `instruction`
- `automation_recipe`
- `rollback`
- `compliance`
- `blocked`

Agents should prioritize records with `procedural_role = instruction` or
`constraint` only when the capability registry authorizes that role for the current
tool. Otherwise, retrieved text is context, not permission.

## Rollout strategy

1. Start with read-only indexing for docs, updates, and approved procedures.
2. Enable semantic search in the Open API with small default budgets.
3. Add freshness dashboards backed by columnar summaries.
4. Connect retrieval outputs to context snapshots and tool leases through explicit
   IDs, not implicit prompt injection.
5. Expand to tool results and feedback records after audit dashboards prove stable
   replay and tenant isolation.

Success metrics:

- p95 semantic search latency by account tier and partition size.
- Embedding freshness lag from committed change event to `ready`.
- ACL discarded candidate rate.
- Denied expensive query count by reason code.
- HNSW recall benchmark by source type and model version.
- Audit replay success rate.
