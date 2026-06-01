# mondayDB Agentic Governed Action Plane

## Why this plane exists

mondayDB can become agent-ready only if autonomous actions remain predictable,
auditable, and isolated per tenant. The core product trade-off is autonomy versus
database determinism: agents need enough freedom to plan multi-step work, while
enterprise customers need the database to reject expensive, ambiguous, or
cross-tenant actions before they affect shared performance.

The governed action plane is a deterministic control layer for agent-initiated
reads, writes, vector retrieval, and tool calls. It does not make probabilistic
decisions inside the database engine. Instead, it stores the agent's proposed
intent, compiles a bounded execution envelope, reserves workload budget, emits
audit events, and exposes the full lifecycle through the monday.com Open API.

## Product trade-offs

| Decision | Why | Cost |
| --- | --- | --- |
| Require preflight approval for agent actions | Prevents expensive recursive queries and unsafe writes before execution | Adds one planning round trip before execution |
| Store deterministic action envelopes | Makes replay, audit, and enterprise support possible | Requires versioned schemas and stable hashing |
| Partition all retrieval by `account_id` | Preserves multi-tenant isolation and HNSW locality | Cross-account learning must happen outside tenant data paths |
| Use async semantic enrichment | Keeps OLTP writes low-latency and ACID-safe | Vector search may lag source rows until watermarks catch up |
| Expose GraphQL first | Keeps agentic capabilities available through Open API | Resolver cost estimation must be strict and visible |

## Scope

The plane governs agent actions that touch mondayDB data or database-adjacent
tools:

- Row-store lookups and transactional writes.
- Columnar aggregations and analytical scans.
- Tenant-scoped vector retrieval over semantic metadata.
- Procedure-memory lookup for reusable instructions.
- Tool execution requests that depend on database evidence.

Out of scope:

- LLM prompting strategy.
- Model selection.
- Non-deterministic ranking outside stored embeddings and scores.
- Cross-tenant training or inference over customer data.

## Core invariants

1. Every persisted record includes `account_id`.
2. Every execution request includes an idempotency key.
3. Every compiled step has a deterministic cost estimate before execution.
4. Every vector query is account-partitioned and bounded by `top_k`.
5. Every mutation emits an audit event with an input hash and previous hash.
6. Recursive agent loops are rejected by depth, budget, and semantic fingerprint.
7. The database engine never invents actions; it only validates stored requests.

## TypeScript contracts

```ts
export type GovernedActionStatus =
  | "draft"
  | "preflight_passed"
  | "preflight_rejected"
  | "budget_reserved"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type GovernedActionKind =
  | "row_read"
  | "row_write"
  | "columnar_aggregation"
  | "semantic_retrieval"
  | "procedure_lookup"
  | "tool_execution";

export type ConsistencyMode =
  | "read_committed"
  | "snapshot"
  | "serializable"
  | "semantic_watermark";

export interface AgentIdentityRef {
  account_id: string;
  actor_user_id: string;
  agent_id: string;
  agent_version: string;
  auth_policy_id: string;
}

export interface AgentPerceptionMetadata {
  title: string;
  summary: string;
  semantic_tags: string[];
  procedure_refs: string[];
  entity_refs: Array<{
    entity_type: "board" | "item" | "column" | "view" | "automation" | "tool";
    entity_id: string;
  }>;
  embedding_ref?: {
    embedding_id: string;
    model_id: string;
    dimensions: number;
    source_watermark: string;
  };
}

export interface GovernedActionDraft {
  account_id: string;
  action_id: string;
  idempotency_key: string;
  kind: GovernedActionKind;
  identity: AgentIdentityRef;
  requested_at: string;
  natural_language_goal: string;
  deterministic_plan_json: Record<string, unknown>;
  perception: AgentPerceptionMetadata;
  max_depth: number;
  max_steps: number;
  max_estimated_rows: number;
  max_vector_top_k: number;
  consistency_mode: ConsistencyMode;
}

export interface GovernedActionStep {
  account_id: string;
  action_id: string;
  step_id: string;
  step_index: number;
  kind: GovernedActionKind;
  target_ref: {
    board_id?: string;
    table_id?: string;
    tool_name?: string;
    semantic_index_id?: string;
  };
  required_predicates: {
    account_id: string;
    board_id?: string;
    item_ids?: string[];
    column_ids?: string[];
    time_range?: { from: string; to: string };
  };
  estimated_cost: {
    estimated_rows: number;
    estimated_cpu_ms: number;
    estimated_memory_bytes: number;
    vector_top_k?: number;
    hnsw_ef_search?: number;
  };
  timeout_ms: number;
  consistency_mode: ConsistencyMode;
}

export interface GovernedActionEnvelope {
  account_id: string;
  action_id: string;
  status: GovernedActionStatus;
  compiled_at: string;
  compiler_version: string;
  plan_hash: string;
  policy_hash: string;
  budget_reservation_id?: string;
  steps: GovernedActionStep[];
  audit_prev_hash?: string;
}

export interface GovernedActionAuditEvent {
  account_id: string;
  audit_event_id: string;
  action_id: string;
  event_type:
    | "draft_created"
    | "preflight_passed"
    | "preflight_rejected"
    | "budget_reserved"
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "action_completed"
    | "action_cancelled";
  event_at: string;
  actor_user_id: string;
  agent_id: string;
  input_hash: string;
  result_hash?: string;
  prev_hash?: string;
  audit_hash: string;
}
```

## SQL schema

The schema below is written in PostgreSQL style because it maps cleanly to
pgvector/HNSW-compatible deployments, but the same entities can be implemented
over mondayDB's decoupled row, columnar, and semantic storage layers.

```sql
CREATE TABLE agentic_governed_actions (
  account_id BIGINT NOT NULL,
  action_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor_user_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  auth_policy_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  compiled_at TIMESTAMPTZ,
  natural_language_goal TEXT NOT NULL,
  deterministic_plan_json JSONB NOT NULL,
  perception_json JSONB NOT NULL,
  max_depth INT NOT NULL CHECK (max_depth BETWEEN 1 AND 8),
  max_steps INT NOT NULL CHECK (max_steps BETWEEN 1 AND 64),
  max_estimated_rows BIGINT NOT NULL CHECK (max_estimated_rows >= 0),
  max_vector_top_k INT NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  consistency_mode TEXT NOT NULL,
  plan_hash BYTEA NOT NULL,
  policy_hash BYTEA NOT NULL,
  audit_prev_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, action_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX agentic_governed_actions_status_idx
  ON agentic_governed_actions (account_id, status, requested_at DESC);

CREATE INDEX agentic_governed_actions_agent_idx
  ON agentic_governed_actions (account_id, agent_id, requested_at DESC);

CREATE TABLE agentic_governed_action_steps (
  account_id BIGINT NOT NULL,
  action_id UUID NOT NULL,
  step_id UUID NOT NULL,
  step_index INT NOT NULL,
  kind TEXT NOT NULL,
  board_id BIGINT,
  table_id TEXT,
  tool_name TEXT,
  semantic_index_id UUID,
  required_predicates_json JSONB NOT NULL,
  estimated_rows BIGINT NOT NULL,
  estimated_cpu_ms BIGINT NOT NULL,
  estimated_memory_bytes BIGINT NOT NULL,
  vector_top_k INT,
  hnsw_ef_search INT,
  timeout_ms INT NOT NULL,
  consistency_mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, action_id, step_id),
  UNIQUE (account_id, action_id, step_index),
  FOREIGN KEY (account_id, action_id)
    REFERENCES agentic_governed_actions (account_id, action_id)
);

CREATE INDEX agentic_action_steps_board_idx
  ON agentic_governed_action_steps (account_id, board_id, step_index)
  WHERE board_id IS NOT NULL;

CREATE INDEX agentic_action_steps_semantic_idx
  ON agentic_governed_action_steps (account_id, semantic_index_id, step_index)
  WHERE semantic_index_id IS NOT NULL;

CREATE TABLE agentic_action_loop_fingerprints (
  account_id BIGINT NOT NULL,
  fingerprint_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  semantic_fingerprint BYTEA NOT NULL,
  action_sequence_hash BYTEA NOT NULL,
  depth INT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  occurrence_count INT NOT NULL,
  PRIMARY KEY (account_id, fingerprint_id)
);

CREATE UNIQUE INDEX agentic_action_loop_fingerprints_unique_idx
  ON agentic_action_loop_fingerprints (
    account_id,
    agent_id,
    semantic_fingerprint,
    action_sequence_hash
  );

CREATE TABLE agentic_governed_action_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  action_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL,
  actor_user_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  input_hash BYTEA NOT NULL,
  result_hash BYTEA,
  prev_hash BYTEA,
  audit_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agentic_action_audit_chain_idx
  ON agentic_governed_action_audit_events (
    account_id,
    action_id,
    event_at,
    audit_event_id
  );
```

### Optional semantic index

Action summaries can be embedded for later procedural-memory retrieval, support
analysis, and regression evaluation. The vector table must remain tenant-scoped.
In production, deploy this table as `account_id` partitions or tenant-local
shards so each HNSW graph is built over an authorized tenant slice.

```sql
CREATE TABLE agentic_governed_action_embeddings (
  account_id BIGINT NOT NULL,
  embedding_id UUID NOT NULL,
  action_id UUID NOT NULL,
  source_watermark TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimensions INT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json JSONB NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id),
  FOREIGN KEY (account_id, action_id)
    REFERENCES agentic_governed_actions (account_id, action_id)
);

CREATE INDEX agentic_governed_action_embeddings_hnsw_idx
  ON agentic_governed_action_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

Operational rule: the vector search resolver must always apply `account_id` and
an allowed `source_watermark` before returning records to an agent. If the vector
backend cannot physically partition by tenant, route through a tenant-aware
filtering layer and enforce a small `top_k` ceiling.

## Open API GraphQL surface

```graphql
enum GovernedActionKind {
  ROW_READ
  ROW_WRITE
  COLUMNAR_AGGREGATION
  SEMANTIC_RETRIEVAL
  PROCEDURE_LOOKUP
  TOOL_EXECUTION
}

enum GovernedActionStatus {
  DRAFT
  PREFLIGHT_PASSED
  PREFLIGHT_REJECTED
  BUDGET_RESERVED
  EXECUTING
  SUCCEEDED
  FAILED
  CANCELLED
}

input AgentEntityRefInput {
  entityType: String!
  entityId: ID!
}

input AgentEmbeddingRefInput {
  embeddingId: ID!
  modelId: String!
  dimensions: Int!
  sourceWatermark: String!
}

input AgentPerceptionMetadataInput {
  title: String!
  summary: String!
  semanticTags: [String!]!
  procedureRefs: [ID!]!
  entityRefs: [AgentEntityRefInput!]!
  embeddingRef: AgentEmbeddingRefInput
}

input GovernedActionDraftInput {
  accountId: ID!
  idempotencyKey: String!
  kind: GovernedActionKind!
  naturalLanguageGoal: String!
  deterministicPlanJson: JSON!
  perception: AgentPerceptionMetadataInput!
  maxDepth: Int!
  maxSteps: Int!
  maxEstimatedRows: Int!
  maxVectorTopK: Int!
  consistencyMode: String!
}

type GovernedActionEnvelope {
  accountId: ID!
  actionId: ID!
  status: GovernedActionStatus!
  compiledAt: DateTime
  compilerVersion: String!
  planHash: String!
  policyHash: String!
  budgetReservationId: ID
  steps: [GovernedActionStep!]!
}

type GovernedActionStep {
  stepId: ID!
  stepIndex: Int!
  kind: GovernedActionKind!
  boardId: ID
  tableId: String
  toolName: String
  semanticIndexId: ID
  estimatedRows: Int!
  estimatedCpuMs: Int!
  estimatedMemoryBytes: Int!
  timeoutMs: Int!
  consistencyMode: String!
}

type GovernedActionPreflightResult {
  actionId: ID!
  accepted: Boolean!
  envelope: GovernedActionEnvelope
  rejectionReasons: [String!]!
  estimatedRows: Int!
  estimatedCpuMs: Int!
  estimatedMemoryBytes: Int!
}

type GovernedActionConnection {
  nodes: [GovernedActionEnvelope!]!
  nextCursor: String
}

extend type Mutation {
  createGovernedActionDraft(input: GovernedActionDraftInput!): GovernedActionEnvelope!
  preflightGovernedAction(accountId: ID!, actionId: ID!): GovernedActionPreflightResult!
  reserveGovernedActionBudget(accountId: ID!, actionId: ID!): GovernedActionEnvelope!
  executeGovernedAction(accountId: ID!, actionId: ID!): GovernedActionEnvelope!
  cancelGovernedAction(accountId: ID!, actionId: ID!, reason: String!): GovernedActionEnvelope!
}

extend type Query {
  governedAction(accountId: ID!, actionId: ID!): GovernedActionEnvelope
  governedActions(
    accountId: ID!
    status: GovernedActionStatus
    agentId: String
    limit: Int! = 50
    cursor: String
  ): GovernedActionConnection!
}
```

Resolver requirements:

- Reject requests where `accountId` does not match the authenticated account.
- Cap `limit` at a small deterministic maximum, such as 100.
- Require `accountId` on every resolver call, including nested connections.
- Return cost estimates and rejection reasons before any execution mutation.
- Emit audit events for rejected preflight attempts as well as successful runs.

## Preflight algorithm

1. Load the draft by `(account_id, action_id)`.
2. Verify actor, agent, and policy bindings.
3. Canonicalize `deterministic_plan_json` and compute `plan_hash`.
4. Compile each step into row, columnar, vector, procedure, or tool operations.
5. Validate required predicates:
   - `account_id` is mandatory.
   - `board_id` is mandatory for board item access.
   - `item_ids`, indexed column filters, or bounded time ranges are mandatory
     when estimated board cardinality exceeds 1M rows.
6. Estimate cost using row statistics, columnar segment metadata, vector index
   metadata, and tool budget tables.
7. Reject if estimated cost exceeds the action envelope or tenant budget.
8. Check loop fingerprints for repeated action sequences.
9. Persist the compiled envelope and audit event.

## Performance check for 1M+ row boards

The following proposals are unsafe unless the planner can prove index or segment
pruning:

- Filtering board items by unindexed JSON fields.
- Columnar aggregation without `account_id`, `board_id`, or time partition.
- Semantic retrieval with `top_k` above the tenant policy limit.
- Joining vector results back to row-store records without bounded item ids.
- Recursive procedure lookup where each result can trigger another retrieval.

Required mitigations:

- Composite row indexes begin with `(account_id, board_id)`.
- Columnar manifests store min/max statistics per `(account_id, board_id,
  partition_id)`.
- Vector indexes are tenant-partitioned or tenant-filtered before result
  hydration.
- The planner rejects any step with `estimated_rows > max_estimated_rows`.
- Resolvers use cursor pagination and stable ordering.

## Agentic guardrails

### Loop containment

Each action stores a semantic fingerprint of:

- The canonical plan hash.
- Procedure-memory references.
- Tool names.
- Vector query embedding hash.
- Target board or entity ids.

If the same agent repeats a materially equivalent sequence above the tenant
threshold, the preflight step returns a deterministic rejection reason:

```json
{
  "code": "AGENTIC_LOOP_CONTAINED",
  "message": "Equivalent action sequence exceeded depth or occurrence budget",
  "maxDepth": 4,
  "occurrenceCount": 5
}
```

### Budget containment

Budget reservations are required before execution. A reservation includes:

- Estimated row reads and writes.
- Estimated columnar segment reads.
- Vector `top_k` and `ef_search`.
- Tool timeout and retry budget.
- Per-step timeout.

### Consistency containment

Agents can request consistency modes, but policy decides the maximum allowed
mode per action kind. For example:

- `row_write` can require `serializable`.
- `columnar_aggregation` can run at a stable analytical watermark.
- `semantic_retrieval` must disclose its `source_watermark`.

## Procedural memory integration

The action plane turns approved behavior into reusable procedural memory without
letting agents self-modify database behavior.

Candidate procedure records should include:

```ts
export interface GovernedProcedureCandidate {
  account_id: string;
  candidate_id: string;
  source_action_id: string;
  title: string;
  deterministic_steps: GovernedActionStep[];
  success_criteria: string[];
  risk_tags: Array<
    | "writes_data"
    | "uses_vector_search"
    | "uses_columnar_scan"
    | "calls_external_tool"
    | "requires_human_review"
  >;
  required_policy_ids: string[];
  source_audit_hash: string;
  review_status: "pending" | "approved" | "rejected";
}
```

Human review remains mandatory before a procedure candidate becomes reusable
memory. This keeps the database deterministic while allowing agents to perceive
prior successful patterns.

## Semantic retrieval compatibility

The plane is compatible with pgvector/HNSW when action summaries and procedure
candidates are embedded as tenant-scoped metadata:

- Include `account_id` in the primary key and lookup path.
- Store `source_watermark` for freshness decisions.
- Keep embeddings as hints, not authority; hydrate and authorize source records
  before returning them to an agent.
- Use bounded `top_k`; default to 10 and cap by tenant policy.
- Keep HNSW parameters policy-controlled so agents cannot raise `ef_search`
  enough to degrade neighbor performance.

## Auditability

Audit hashes should be computed from canonical JSON:

```text
audit_hash = sha256(
  account_id ||
  action_id ||
  event_type ||
  canonical_input_json ||
  canonical_result_json ||
  prev_hash
)
```

This creates a deterministic chain that support, security, and enterprise admins
can replay without invoking an LLM. Rejected actions are as important as
successful actions because they demonstrate guardrail behavior.

## Agent perception model

An LLM should perceive each governed action as a bounded capability, not as raw
database access. The metadata exposed to agents should be concise:

```json
{
  "capability": "Summarize overdue enterprise-risk items",
  "allowedTargets": ["board:456", "column:status", "column:due_date"],
  "requiresPreflight": true,
  "maxEstimatedRows": 25000,
  "semanticTags": ["risk", "status-report", "customer-success"],
  "freshness": {
    "rowWatermark": "2026-06-01T00:00:00Z",
    "semanticWatermark": "2026-05-31T23:55:00Z"
  },
  "guardrails": ["account-scoped", "no-unindexed-json-filter", "max-depth-4"]
}
```

This makes the data layer legible to agents while preserving strict execution
boundaries.

## Rollout strategy

1. Add GraphQL draft and preflight APIs in read-only mode.
2. Enable budget reservation for semantic retrieval and columnar aggregation.
3. Add transactional write execution after audit replay and idempotency tests.
4. Emit procedure candidates only from successful, reviewed actions.
5. Tune tenant-level caps using production planner metrics.

## Success metrics

- Zero cross-tenant action reads or writes.
- Preflight rejection rate for unsafe plans is visible by account and agent.
- P99 preflight latency stays below the product threshold for interactive use.
- 100 percent of executed actions have replayable audit hash chains.
- No full table scans on boards above 1M rows without an explicit approved
  analytical policy.

