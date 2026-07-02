# Agentic Memory Lifecycle Governance Plane

## Why this plane exists

mondayDB becomes an Agentic Database when agents can reuse durable context:
project decisions, board operating procedures, successful tool sequences, and
semantic summaries of prior work. Durable memory creates a product tension:
agents need context to be useful, but enterprises need memory to remain scoped,
auditable, revocable, and cheap to retrieve across billions of records.

The Agentic Memory Lifecycle Governance Plane makes that tension explicit:

- **Recall vs. latency:** promoted memories are indexed for bounded pgvector/HNSW
  retrieval, but lifecycle decisions are made from deterministic metadata,
  source watermarks, and policy hashes rather than open-ended semantic scans.
- **Persistence vs. enterprise control:** long-lived procedural and semantic
  memories can help agents act consistently, but every memory has an owner,
  purpose boundary, retention policy, revocation state, and audit chain.
- **Automation vs. predictability:** agents may propose memory promotion,
  compaction, or expiry. mondayDB only applies the change after deterministic
  governance evaluation with tenant-scoped budgets and replayable evidence.

The database engine remains deterministic even if the agent that suggested a
memory change is probabilistic. Given the same `account_id`, policy version,
source watermarks, memory metadata, and request hash, the lifecycle decision must
be identical.

## Scope

This plane governs the lifecycle of agent-readable memory records:

1. **Candidate promotion** from row-store events, updates, docs, automations,
   tool outcomes, and human-approved observations.
2. **Versioned procedural memory** that stores instructions an agent may follow.
3. **Semantic memory indexing** for RAG via account-partitioned pgvector/HNSW.
4. **Retention, compaction, expiry, and revocation** of memory records.
5. **Audit replay** for enterprise support, compliance, and incident response.

It does not let an LLM mutate memory directly. It exposes lifecycle proposals,
deterministic evaluations, and committed memory states through monday.com Open
API GraphQL so product surfaces and agent runtimes can request, inspect, and
explain memory changes.

## TypeScript contracts

```ts
export type AgenticMemoryKind =
  | "semantic_summary"
  | "procedural_instruction"
  | "tool_outcome"
  | "decision_record"
  | "schema_hint";

export type MemoryLifecycleAction =
  | "promote"
  | "compact"
  | "refresh_embedding"
  | "expire"
  | "revoke"
  | "restore";

export type MemoryLifecycleDecision =
  | "admit"
  | "admit_with_review"
  | "queue"
  | "reject";

export interface AgenticMemoryLifecycleRequest {
  account_id: string;
  actor_user_id: string;
  agent_session_id?: string;
  purpose_boundary_id: string;
  action: MemoryLifecycleAction;
  memory_kind: AgenticMemoryKind;
  source_refs: AgenticMemorySourceRef[];
  proposed_memory_id?: string;
  proposed_body_hash: string;
  proposed_metadata: AgenticMemoryMetadata;
  requested_retention: AgenticMemoryRetentionRequest;
  semantic_index_request?: AgenticSemanticIndexRequest;
  budget_token: string;
  deadline_ms: number;
  idempotency_key: string;
}

export interface AgenticMemorySourceRef {
  account_id: string;
  source_kind: "board_item" | "update" | "doc" | "automation" | "tool" | "memory";
  source_id: string;
  board_id?: string;
  source_version: string;
  watermark: string;
}

export interface AgenticMemoryMetadata {
  title: string;
  summary: string;
  entity_tags: string[];
  risk_tags: string[];
  visibility_scope: "private_user" | "board" | "workspace" | "account";
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  procedure_steps?: AgenticProcedureStep[];
  suggested_actions: string[];
  forbidden_actions: string[];
}

export interface AgenticProcedureStep {
  step_number: number;
  instruction_hash: string;
  instruction_text: string;
  required_tool_scope?: string;
  deterministic_precondition: string;
  rollback_instruction?: string;
}

export interface AgenticMemoryRetentionRequest {
  retain_until?: string;
  ttl_days?: number;
  legal_hold_id?: string;
  compaction_group_key?: string;
  revocation_reason?: string;
}

export interface AgenticSemanticIndexRequest {
  embedding_model: string;
  embedding_dimensions: number;
  vector_namespace: "agent_memory" | "procedure_memory" | "schema_contract";
  max_vector_top_k: number;
  max_expansion_depth: number;
  metadata_filter_hash: string;
}

export interface AgenticMemoryLifecycleEvaluation {
  account_id: string;
  evaluation_id: string;
  request_hash: string;
  policy_version: number;
  decision: MemoryLifecycleDecision;
  rejection_reason?: string;
  requires_human_review: boolean;
  estimated_source_reads: number;
  estimated_vector_writes: number;
  estimated_compaction_inputs: number;
  estimated_cost_units: number;
  full_scan_risk: boolean;
  recursive_expansion_risk: boolean;
  source_watermark_min: string;
  source_watermark_max: string;
  audit_hash: string;
}

export interface AgenticMemoryRecord {
  account_id: string;
  memory_id: string;
  memory_version: number;
  memory_kind: AgenticMemoryKind;
  lifecycle_state: "active" | "pending_review" | "expired" | "revoked";
  purpose_boundary_id: string;
  source_refs: AgenticMemorySourceRef[];
  body_hash: string;
  metadata: AgenticMemoryMetadata;
  retention: AgenticCommittedRetention;
  semantic_ref?: AgenticMemorySemanticRef;
  created_by_actor_user_id: string;
  created_at: string;
  updated_at: string;
  audit_hash: string;
}

export interface AgenticCommittedRetention {
  retain_until: string;
  legal_hold_id?: string;
  expires_at?: string;
  revoked_at?: string;
  revocation_reason_hash?: string;
}

export interface AgenticMemorySemanticRef {
  embedding_id: string;
  embedding_model: string;
  vector_namespace: string;
  vector_partition_key: string;
  materialized_watermark: string;
  embedding_hash: string;
}

export interface AgenticMemoryPerceptionCard {
  account_id: string;
  memory_id: string;
  label: string;
  summary: string;
  memory_kind: AgenticMemoryKind;
  lifecycle_state: AgenticMemoryRecord["lifecycle_state"];
  entity_tags: string[];
  risk_tags: string[];
  procedure_memory_refs: string[];
  suggested_actions: string[];
  forbidden_actions: string[];
  source_watermarks: string[];
  audit_hash: string;
}
```

## SQL schema

All persisted tables and indexes lead with `account_id`. This is the hard
multi-tenant isolation invariant for row-store lookups, columnar projections,
vector routing metadata, and audit replay.

```sql
CREATE TABLE agentic_memory_lifecycle_requests (
  account_id                  BIGINT       NOT NULL,
  lifecycle_request_id         UUID         NOT NULL,
  actor_user_id                BIGINT       NOT NULL,
  agent_session_id             UUID,
  purpose_boundary_id          UUID         NOT NULL,
  action                       TEXT         NOT NULL CHECK (action IN (
    'promote', 'compact', 'refresh_embedding', 'expire', 'revoke', 'restore'
  )),
  memory_kind                  TEXT         NOT NULL CHECK (memory_kind IN (
    'semantic_summary',
    'procedural_instruction',
    'tool_outcome',
    'decision_record',
    'schema_hint'
  )),
  proposed_memory_id           UUID,
  proposed_body_hash           CHAR(64)     NOT NULL,
  proposed_metadata_json       JSONB        NOT NULL,
  requested_retention_json     JSONB        NOT NULL,
  semantic_index_request_json  JSONB,
  budget_token_hash            CHAR(64)     NOT NULL,
  deadline_ms                  INTEGER      NOT NULL CHECK (deadline_ms BETWEEN 50 AND 30000),
  idempotency_key              TEXT         NOT NULL,
  request_hash                 CHAR(64)     NOT NULL,
  created_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, lifecycle_request_id),
  UNIQUE (account_id, idempotency_key),
  UNIQUE (account_id, request_hash)
);

CREATE INDEX idx_memory_lifecycle_requests_actor
  ON agentic_memory_lifecycle_requests (
    account_id,
    actor_user_id,
    created_at DESC
  );

CREATE TABLE agentic_memory_source_refs (
  account_id             BIGINT       NOT NULL,
  lifecycle_request_id    UUID         NOT NULL,
  source_kind             TEXT         NOT NULL CHECK (source_kind IN (
    'board_item', 'update', 'doc', 'automation', 'tool', 'memory'
  )),
  source_id               TEXT         NOT NULL,
  board_id                BIGINT,
  source_version          TEXT         NOT NULL,
  watermark               TEXT         NOT NULL,
  source_ref_hash         CHAR(64)     NOT NULL,
  PRIMARY KEY (account_id, lifecycle_request_id, source_ref_hash),
  FOREIGN KEY (account_id, lifecycle_request_id)
    REFERENCES agentic_memory_lifecycle_requests (account_id, lifecycle_request_id)
);

CREATE INDEX idx_memory_source_refs_board
  ON agentic_memory_source_refs (
    account_id,
    board_id,
    source_kind,
    source_id
  );

CREATE TABLE agentic_memory_lifecycle_evaluations (
  account_id                    BIGINT       NOT NULL,
  evaluation_id                 UUID         NOT NULL,
  lifecycle_request_id           UUID         NOT NULL,
  policy_version                INTEGER      NOT NULL,
  decision                      TEXT         NOT NULL CHECK (decision IN (
    'admit', 'admit_with_review', 'queue', 'reject'
  )),
  rejection_reason              TEXT,
  requires_human_review          BOOLEAN      NOT NULL,
  estimated_source_reads         BIGINT       NOT NULL,
  estimated_vector_writes        BIGINT       NOT NULL,
  estimated_compaction_inputs    BIGINT       NOT NULL,
  estimated_cost_units           BIGINT       NOT NULL,
  full_scan_risk                 BOOLEAN      NOT NULL,
  recursive_expansion_risk       BOOLEAN      NOT NULL,
  source_watermark_min           TEXT         NOT NULL,
  source_watermark_max           TEXT         NOT NULL,
  evaluation_hash                CHAR(64)     NOT NULL,
  previous_audit_hash            CHAR(64),
  audit_hash                     CHAR(64)     NOT NULL,
  created_at                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, evaluation_id),
  FOREIGN KEY (account_id, lifecycle_request_id)
    REFERENCES agentic_memory_lifecycle_requests (account_id, lifecycle_request_id)
);

CREATE INDEX idx_memory_lifecycle_evaluations_request
  ON agentic_memory_lifecycle_evaluations (
    account_id,
    lifecycle_request_id,
    created_at DESC
  );

CREATE TABLE agentic_memory_records (
  account_id                  BIGINT       NOT NULL,
  memory_id                   UUID         NOT NULL,
  memory_version              INTEGER      NOT NULL,
  memory_kind                 TEXT         NOT NULL,
  lifecycle_state             TEXT         NOT NULL CHECK (lifecycle_state IN (
    'active', 'pending_review', 'expired', 'revoked'
  )),
  purpose_boundary_id          UUID         NOT NULL,
  body_hash                   CHAR(64)     NOT NULL,
  metadata_json               JSONB        NOT NULL,
  retain_until                TIMESTAMPTZ  NOT NULL,
  legal_hold_id               UUID,
  expires_at                  TIMESTAMPTZ,
  revoked_at                  TIMESTAMPTZ,
  revocation_reason_hash      CHAR(64),
  source_watermark_min        TEXT         NOT NULL,
  source_watermark_max        TEXT         NOT NULL,
  created_by_actor_user_id    BIGINT       NOT NULL,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  previous_audit_hash         CHAR(64),
  audit_hash                  CHAR(64)     NOT NULL,
  PRIMARY KEY (account_id, memory_id, memory_version)
);

CREATE INDEX idx_agentic_memory_records_active_kind
  ON agentic_memory_records (
    account_id,
    lifecycle_state,
    memory_kind,
    purpose_boundary_id,
    updated_at DESC
  );

CREATE INDEX idx_agentic_memory_records_retention
  ON agentic_memory_records (
    account_id,
    lifecycle_state,
    retain_until,
    expires_at
  );

CREATE TABLE agentic_memory_embeddings (
  account_id                BIGINT       NOT NULL,
  embedding_id              UUID         NOT NULL,
  memory_id                 UUID         NOT NULL,
  memory_version            INTEGER      NOT NULL,
  vector_namespace           TEXT         NOT NULL CHECK (vector_namespace IN (
    'agent_memory', 'procedure_memory', 'schema_contract'
  )),
  embedding_model           TEXT         NOT NULL,
  embedding_dimensions       INTEGER      NOT NULL,
  vector_partition_key       TEXT         NOT NULL,
  embedding_hash            CHAR(64)     NOT NULL,
  materialized_watermark     TEXT         NOT NULL,
  metadata_filter_hash       CHAR(64)     NOT NULL,
  embedding                  vector(1536) NOT NULL,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id),
  FOREIGN KEY (account_id, memory_id, memory_version)
    REFERENCES agentic_memory_records (account_id, memory_id, memory_version)
);

CREATE INDEX idx_agentic_memory_embeddings_hnsw
  ON agentic_memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_agentic_memory_embeddings_route
  ON agentic_memory_embeddings (
    account_id,
    vector_namespace,
    vector_partition_key,
    materialized_watermark
  );

CREATE TABLE agentic_memory_audit_events (
  account_id              BIGINT       NOT NULL,
  audit_event_id           UUID         NOT NULL,
  memory_id                UUID,
  lifecycle_request_id      UUID,
  evaluation_id            UUID,
  event_type               TEXT         NOT NULL,
  actor_user_id            BIGINT       NOT NULL,
  purpose_boundary_id      UUID         NOT NULL,
  event_payload_hash       CHAR(64)     NOT NULL,
  previous_audit_hash      CHAR(64),
  audit_hash               CHAR(64)     NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX idx_agentic_memory_audit_chain
  ON agentic_memory_audit_events (
    account_id,
    memory_id,
    created_at
  );
```

### Vector partitioning requirement

The HNSW index is only safe when the planner routes through tenant metadata
before vector search. Physical deployments should hash partition
`agentic_memory_embeddings` by `account_id`, then route by
`(account_id, vector_namespace, vector_partition_key)`. A vector search without
an `account_id` equality predicate is invalid, even if the embedding index could
technically return nearest neighbors.

## Open API GraphQL shape

GraphQL field names follow monday.com Open API style, while resolvers compile
them into `account_id`-leading storage operations. Every mutation and query
requires `accountId`.

```graphql
enum AgenticMemoryKind {
  SEMANTIC_SUMMARY
  PROCEDURAL_INSTRUCTION
  TOOL_OUTCOME
  DECISION_RECORD
  SCHEMA_HINT
}

enum MemoryLifecycleAction {
  PROMOTE
  COMPACT
  REFRESH_EMBEDDING
  EXPIRE
  REVOKE
  RESTORE
}

enum MemoryLifecycleDecision {
  ADMIT
  ADMIT_WITH_REVIEW
  QUEUE
  REJECT
}

input AgenticMemorySourceRefInput {
  accountId: ID!
  sourceKind: String!
  sourceId: ID!
  boardId: ID
  sourceVersion: String!
  watermark: String!
}

input AgenticProcedureStepInput {
  stepNumber: Int!
  instructionHash: String!
  instructionText: String!
  requiredToolScope: String
  deterministicPrecondition: String!
  rollbackInstruction: String
}

input AgenticMemoryMetadataInput {
  title: String!
  summary: String!
  entityTags: [String!]!
  riskTags: [String!]!
  visibilityScope: String!
  sensitivity: String!
  procedureSteps: [AgenticProcedureStepInput!]
  suggestedActions: [String!]!
  forbiddenActions: [String!]!
}

input AgenticMemoryRetentionInput {
  retainUntil: String
  ttlDays: Int
  legalHoldId: ID
  compactionGroupKey: String
  revocationReason: String
}

input AgenticSemanticIndexRequestInput {
  embeddingModel: String!
  embeddingDimensions: Int!
  vectorNamespace: String!
  maxVectorTopK: Int!
  maxExpansionDepth: Int!
  metadataFilterHash: String!
}

input AgenticMemoryLifecycleRequestInput {
  accountId: ID!
  actorUserId: ID!
  agentSessionId: ID
  purposeBoundaryId: ID!
  action: MemoryLifecycleAction!
  memoryKind: AgenticMemoryKind!
  sourceRefs: [AgenticMemorySourceRefInput!]!
  proposedMemoryId: ID
  proposedBodyHash: String!
  proposedMetadata: AgenticMemoryMetadataInput!
  requestedRetention: AgenticMemoryRetentionInput!
  semanticIndexRequest: AgenticSemanticIndexRequestInput
  budgetToken: String!
  deadlineMs: Int!
  idempotencyKey: String!
}

type AgenticMemoryLifecycleEvaluation {
  accountId: ID!
  evaluationId: ID!
  requestHash: String!
  policyVersion: Int!
  decision: MemoryLifecycleDecision!
  rejectionReason: String
  requiresHumanReview: Boolean!
  estimatedSourceReads: String!
  estimatedVectorWrites: String!
  estimatedCompactionInputs: String!
  estimatedCostUnits: String!
  fullScanRisk: Boolean!
  recursiveExpansionRisk: Boolean!
  sourceWatermarkMin: String!
  sourceWatermarkMax: String!
  auditHash: String!
}

type AgenticMemoryPerceptionCard {
  accountId: ID!
  memoryId: ID!
  label: String!
  summary: String!
  memoryKind: AgenticMemoryKind!
  lifecycleState: String!
  entityTags: [String!]!
  riskTags: [String!]!
  procedureMemoryRefs: [ID!]!
  suggestedActions: [String!]!
  forbiddenActions: [String!]!
  sourceWatermarks: [String!]!
  auditHash: String!
}

type AgenticMemoryRecord {
  accountId: ID!
  memoryId: ID!
  memoryVersion: Int!
  memoryKind: AgenticMemoryKind!
  lifecycleState: String!
  purposeBoundaryId: ID!
  bodyHash: String!
  perceptionCard: AgenticMemoryPerceptionCard!
  retainUntil: String!
  expiresAt: String
  materializedWatermark: String
  auditHash: String!
}

type AgenticMemoryLifecyclePayload {
  evaluation: AgenticMemoryLifecycleEvaluation!
  memory: AgenticMemoryRecord
}

extend type Mutation {
  evaluateAgenticMemoryLifecycle(
    input: AgenticMemoryLifecycleRequestInput!
  ): AgenticMemoryLifecyclePayload!

  commitAgenticMemoryLifecycle(
    accountId: ID!
    evaluationId: ID!
    idempotencyKey: String!
  ): AgenticMemoryLifecyclePayload!
}

extend type Query {
  agenticMemory(
    accountId: ID!
    memoryId: ID!
    version: Int
  ): AgenticMemoryRecord

  agenticMemoryPerceptionCards(
    accountId: ID!
    purposeBoundaryId: ID!
    memoryKind: AgenticMemoryKind
    entityTags: [String!]
    limit: Int! = 25
  ): [AgenticMemoryPerceptionCard!]!
}
```

## Deterministic lifecycle flow

1. **Submit proposal:** an agent, automation, or user submits a lifecycle
   request with source refs, proposed metadata, retention intent, budget, and
   idempotency key.
2. **Normalize and hash:** mondayDB canonicalizes JSON fields, hashes the
   request, and stores source refs with `account_id`-leading keys.
3. **Evaluate policy:** the lifecycle evaluator checks purpose boundaries,
   visibility, sensitivity, retention, legal holds, budget, source watermarks,
   vector write limits, and recursive expansion risk.
4. **Admit or reject:** admitted requests either commit automatically or enter
   human review when sensitivity, retention duration, or procedural authority
   exceeds policy thresholds.
5. **Materialize memory:** the row store commits the memory record in an ACID
   transaction. Embeddings are materialized asynchronously from committed records.
6. **Expose perception:** agents receive compact perception cards with metadata,
   instructions, risk tags, forbidden actions, and audit hashes.
7. **Expire or revoke:** retention jobs and revocation requests update lifecycle
   state deterministically and emit audit events. Vector entries become
   non-routable before physical deletion.

## Procedural memory rules

Procedural memory is dangerous because it can teach an agent how to act, not
just what happened. The governance plane treats it as executable-adjacent data:

- Every procedure step stores an `instruction_hash` and a deterministic
  precondition.
- Steps that reference tools must name a required tool scope; the query governor
  or tool execution plane must verify that scope before the agent acts.
- Procedures include `forbidden_actions` so an LLM sees explicit boundaries in
  the same packet as helpful instructions.
- Procedure versions are immutable. Updates create a new `(account_id,
  memory_id, memory_version)` tuple with a new audit hash.
- High-sensitivity or account-wide procedures default to `admit_with_review`.

This stores reusable instructions without letting the data layer invent hidden
behavior at read time.

## Semantic retrieval compatibility

Memory records are compatible with RAG through `agentic_memory_embeddings`, but
retrieval is constrained:

- The vector namespace is explicit: `agent_memory`, `procedure_memory`, or
  `schema_contract`.
- HNSW search is routed by `account_id` and `vector_partition_key` before nearest
  neighbor expansion.
- `max_vector_top_k` and `max_expansion_depth` are supplied in the lifecycle
  request and clamped by policy.
- Results must be rechecked against row-store memory state so expired or revoked
  memories cannot appear only because their vector entries still exist.
- Responses include `materialized_watermark`, `source_watermark_min`, and
  `source_watermark_max` so agents can reason about freshness.

## Guardrails for autonomous agents

- **Tenant isolation:** reject any request, query, or embedding route that lacks
  `account_id` equality.
- **Recursive containment:** reject promotion/compaction proposals whose source
  refs include more than the policy's allowed memory-to-memory expansion depth.
- **Budget admission:** require a valid budget token for source reads, vector
  writes, compaction inputs, and review queue load.
- **Tool-use readiness:** procedural memories expose required tool scopes but do
  not grant them. Tool execution must perform a separate deterministic check.
- **Revocation precedence:** revoked memory state wins over vector similarity,
  cached perception cards, and compaction outputs.
- **Deterministic replay:** lifecycle request hash, evaluation hash, and audit
  hash chain must be enough to replay why a memory was promoted, expired, or
  revoked.

## Performance checks for 1M+ row boards

Any lifecycle request touching a board with more than 1M rows is rejected or
queued unless all of these are true:

1. Source refs contain `account_id` and a bounded `board_id` or explicit source
   IDs.
2. Metadata filters map to indexed columns or precomputed columnar projections.
3. `estimated_source_reads` is below the tenant budget for the requested
   deadline.
4. Compaction inputs are preselected by `compaction_group_key` or exact memory
   IDs, not discovered by scanning all memory records.
5. Vector writes are bounded by policy and routed to the tenant partition.
6. Retention jobs page by `(account_id, lifecycle_state, retain_until,
   expires_at)` rather than scanning memory bodies or arbitrary JSON.

Full table scan risk must set `full_scan_risk = true` in the evaluation and
produce `decision = 'reject'` unless an offline maintenance budget explicitly
queues the operation.

## Agent perception contract

Agents should perceive memory as a bounded evidence card, not as hidden database
magic. A perception card contains:

- a concise label and summary;
- memory kind and lifecycle state;
- entity tags for semantic routing;
- risk tags for safety and compliance;
- procedure memory references and immutable instruction hashes;
- suggested actions and forbidden actions;
- source watermarks and audit hash.

The agent can use this packet to plan, but mondayDB does not infer additional
steps. If the agent wants to act, it must submit a plan to the relevant
verification, consent, query, or tool execution plane.

## Auditability and availability

Every committed change emits an `agentic_memory_audit_events` row in the same
transaction as the row-store lifecycle state change. Embedding materialization is
asynchronous and may lag, but the semantic reference includes a materialized
watermark and embedding hash for replay.

This protects enterprise availability:

- row-store ACID commits remain short and deterministic;
- vector writes are moved out of the critical transaction path;
- revocation updates flip deterministic routing state before physical vector
  cleanup;
- audit replay does not depend on the vector index;
- failed embedding jobs can retry idempotently from committed memory state.

The trade-off is that semantic retrieval can be bounded-stale. Enterprise users
can request stricter read-your-write behavior only when the planner can satisfy
it from row-store memory state or freshly materialized embeddings within budget.

