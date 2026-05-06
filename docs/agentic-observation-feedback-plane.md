# Agentic Observation Feedback Plane

## Why

mondayDB can help agents improve without letting probabilistic behavior leak into the
database engine. The product trade-off is **learning quality vs. determinism**:
agents need feedback from prior actions, but enterprise customers need every stored
fact to be tenant-scoped, replayable, and explainable.

This plane stores deterministic observations about agent runs, retrieval results,
user corrections, and outcome signals. It does not train models inline, rewrite
procedures automatically, or change query planning behavior. Instead, it gives
agents bounded "experience cards" that can be retrieved semantically and inspected
through the Open API.

## Product shape

The plane has four record types:

1. **Agent observation**: immutable event describing what an agent perceived,
   decided, retrieved, or executed.
2. **Outcome signal**: deterministic rating of result quality, latency, cost, user
   acceptance, or rollback.
3. **Feedback summary**: compact, tenant-scoped aggregate built asynchronously from
   observations and outcomes.
4. **Procedure candidate**: human-reviewable suggested change to procedural memory.

Agents perceive these as metadata-tagged cards:

- "This board usually rejects mass updates without manager approval."
- "Similar automation failed because retrieval missed archived status context."
- "This tool chain exceeded row-read budget on boards over 1M items."

The core database remains deterministic. LLMs may interpret cards probabilistically,
but mondayDB stores only explicit events, hashes, and bounded derived summaries.

## TypeScript schema

```ts
export type AgentObservationKind =
  | "retrieval_hit"
  | "tool_invocation"
  | "tool_result"
  | "user_correction"
  | "budget_denial"
  | "policy_denial"
  | "rollback"
  | "latency_sample";

export type AgentOutcomeSignalKind =
  | "accepted"
  | "rejected"
  | "edited"
  | "rolled_back"
  | "timed_out"
  | "cost_exceeded"
  | "sla_violation";

export interface AgentScopeRef {
  scopeType: "account" | "workspace" | "board" | "item" | "automation" | "integration";
  scopeId: string;
}

export interface AgentObservation {
  accountId: string;
  observationId: string;
  requestId: string;
  runId: string;
  actorId: string;
  kind: AgentObservationKind;
  scope: AgentScopeRef;
  sourceType: "agent_run" | "open_api" | "automation" | "system_guardrail";
  sourceId: string;
  contentText: string;
  metadataTags: string[];
  embeddingModel?: string;
  embeddingVector?: number[];
  estimatedRowsRead: number;
  vectorTopK: number;
  latencyMs: number;
  createdAt: string;
  previousAuditHash?: string;
  deterministicHash: string;
}

export interface AgentOutcomeSignal {
  accountId: string;
  signalId: string;
  observationId: string;
  requestId: string;
  actorId: string;
  kind: AgentOutcomeSignalKind;
  score: number;
  reasonCode:
    | "correct"
    | "stale_context"
    | "missing_permission"
    | "expensive_query"
    | "wrong_scope"
    | "unsafe_tool"
    | "manual_override";
  explanationText?: string;
  createdAt: string;
  deterministicHash: string;
}

export interface AgentFeedbackSummary {
  accountId: string;
  summaryId: string;
  scope: AgentScopeRef;
  windowStart: string;
  windowEnd: string;
  metadataTags: string[];
  positiveSignalCount: number;
  negativeSignalCount: number;
  maxEstimatedRowsRead: number;
  p95LatencyMs: number;
  summaryText: string;
  embeddingModel: string;
  embeddingVector: number[];
  generatedFromHash: string;
  deterministicHash: string;
}

export interface AgentProcedureCandidate {
  accountId: string;
  candidateId: string;
  summaryId: string;
  targetProcedureId?: string;
  targetScope: AgentScopeRef;
  proposedInstructionMarkdown: string;
  evidenceObservationIds: string[];
  evidenceSignalIds: string[];
  status: "pending_review" | "approved" | "rejected" | "superseded";
  reviewerActorId?: string;
  createdAt: string;
  deterministicHash: string;
}
```

## SQL schema

```sql
CREATE TABLE agent_observations (
  account_id BIGINT NOT NULL,
  observation_id UUID NOT NULL,
  request_id UUID NOT NULL,
  run_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  embedding_model TEXT,
  embedding_vector vector(1536),
  estimated_rows_read BIGINT NOT NULL DEFAULT 0,
  vector_top_k INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_audit_hash BYTEA,
  deterministic_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, observation_id)
)
PARTITION BY HASH (account_id);

CREATE INDEX agent_observations_request_idx
  ON agent_observations (account_id, request_id, created_at);

CREATE INDEX agent_observations_scope_idx
  ON agent_observations (account_id, scope_type, scope_id, kind, created_at DESC);

CREATE INDEX agent_observations_tags_idx
  ON agent_observations USING gin (metadata_tags);

CREATE INDEX agent_observations_hnsw_idx
  ON agent_observations
  USING hnsw (embedding_vector vector_cosine_ops)
  WHERE embedding_vector IS NOT NULL;

CREATE TABLE agent_outcome_signals (
  account_id BIGINT NOT NULL,
  signal_id UUID NOT NULL,
  observation_id UUID NOT NULL,
  request_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  score NUMERIC(4, 3) NOT NULL,
  reason_code TEXT NOT NULL,
  explanation_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deterministic_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, signal_id),
  FOREIGN KEY (account_id, observation_id)
    REFERENCES agent_observations (account_id, observation_id)
);

CREATE INDEX agent_outcome_signals_observation_idx
  ON agent_outcome_signals (account_id, observation_id, created_at DESC);

CREATE INDEX agent_outcome_signals_request_idx
  ON agent_outcome_signals (account_id, request_id, reason_code, created_at DESC);

CREATE TABLE agent_feedback_summaries (
  account_id BIGINT NOT NULL,
  summary_id UUID NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  positive_signal_count INTEGER NOT NULL,
  negative_signal_count INTEGER NOT NULL,
  max_estimated_rows_read BIGINT NOT NULL,
  p95_latency_ms INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_vector vector(1536) NOT NULL,
  generated_from_hash BYTEA NOT NULL,
  deterministic_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, summary_id)
)
PARTITION BY HASH (account_id);

CREATE INDEX agent_feedback_summaries_scope_idx
  ON agent_feedback_summaries (account_id, scope_type, scope_id, window_end DESC);

CREATE INDEX agent_feedback_summaries_hnsw_idx
  ON agent_feedback_summaries
  USING hnsw (embedding_vector vector_cosine_ops);

CREATE TABLE agent_procedure_candidates (
  account_id BIGINT NOT NULL,
  candidate_id UUID NOT NULL,
  summary_id UUID NOT NULL,
  target_procedure_id UUID,
  target_scope_type TEXT NOT NULL,
  target_scope_id TEXT NOT NULL,
  proposed_instruction_markdown TEXT NOT NULL,
  evidence_observation_ids UUID[] NOT NULL,
  evidence_signal_ids UUID[] NOT NULL,
  status TEXT NOT NULL,
  reviewer_actor_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deterministic_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, candidate_id),
  FOREIGN KEY (account_id, summary_id)
    REFERENCES agent_feedback_summaries (account_id, summary_id)
);

CREATE INDEX agent_procedure_candidates_review_idx
  ON agent_procedure_candidates
  (account_id, target_scope_type, target_scope_id, status, created_at DESC);
```

## Open API GraphQL shape

`account_id` is always derived from authenticated monday.com context. The API must
not accept tenant identity from caller input.

```graphql
type AgentScopeRef {
  scopeType: String!
  scopeId: ID!
}

type AgentObservation {
  observationId: ID!
  requestId: ID!
  runId: ID!
  actorId: ID!
  kind: String!
  scope: AgentScopeRef!
  sourceType: String!
  sourceId: ID!
  contentText: String!
  metadataTags: [String!]!
  estimatedRowsRead: Float!
  vectorTopK: Int!
  latencyMs: Int!
  createdAt: String!
  deterministicHash: String!
}

type AgentOutcomeSignal {
  signalId: ID!
  observationId: ID!
  requestId: ID!
  actorId: ID!
  kind: String!
  score: Float!
  reasonCode: String!
  explanationText: String
  createdAt: String!
  deterministicHash: String!
}

type AgentFeedbackSummary {
  summaryId: ID!
  scope: AgentScopeRef!
  windowStart: String!
  windowEnd: String!
  metadataTags: [String!]!
  positiveSignalCount: Int!
  negativeSignalCount: Int!
  maxEstimatedRowsRead: Float!
  p95LatencyMs: Int!
  summaryText: String!
  generatedFromHash: String!
  deterministicHash: String!
}

type AgentProcedureCandidate {
  candidateId: ID!
  summaryId: ID!
  targetProcedureId: ID
  targetScope: AgentScopeRef!
  proposedInstructionMarkdown: String!
  evidenceObservationIds: [ID!]!
  evidenceSignalIds: [ID!]!
  status: String!
  reviewerActorId: ID
  createdAt: String!
  deterministicHash: String!
}

input AgentScopeRefInput {
  scopeType: String!
  scopeId: ID!
}

input AgentObservationFilterInput {
  scope: AgentScopeRefInput
  kind: String
  metadataTags: [String!]
  since: String
  limit: Int = 50
}

input AgentFeedbackSearchInput {
  scope: AgentScopeRefInput!
  query: String!
  metadataTags: [String!]
  topK: Int = 10
  maxEstimatedRowsRead: Float = 50000
  deadlineMs: Int = 200
}

input AgentOutcomeSignalInput {
  observationId: ID!
  requestId: ID!
  kind: String!
  score: Float!
  reasonCode: String!
  explanationText: String
}

extend type Query {
  agentObservations(filter: AgentObservationFilterInput!): [AgentObservation!]!
  agentFeedbackSearch(input: AgentFeedbackSearchInput!): [AgentFeedbackSummary!]!
  agentProcedureCandidates(scope: AgentScopeRefInput!, status: String = "pending_review"): [AgentProcedureCandidate!]!
}

extend type Mutation {
  createAgentOutcomeSignal(input: AgentOutcomeSignalInput!): AgentOutcomeSignal!
}
```

## Resolver and guardrail contract

```ts
export interface AgentFeedbackGuardrails {
  accountId: string;
  actorId: string;
  maxTopK: number;
  maxEstimatedRowsRead: number;
  maxRecursiveFeedbackReads: number;
  deadlineMs: number;
  allowedScopeTypes: AgentScopeRef["scopeType"][];
}

export interface AgentFeedbackSearchPlan {
  accountId: string;
  scope: AgentScopeRef;
  metadataTags: string[];
  topK: number;
  estimatedRowsRead: number;
  useVectorIndex: true;
  deterministicPlanHash: string;
}
```

Resolver rules:

- Require `account_id` from auth context and include it in every SQL predicate.
- Reject `topK` above tenant or account plan limits.
- Reject unscoped feedback search. `scope_type` and `scope_id` are required.
- Stop recursive agent reads at `maxRecursiveFeedbackReads`; default is `1`.
- Compute `deterministicPlanHash` from normalized GraphQL input, actor, scope,
  budget, and selected indexes before query execution.
- Write one audit event for every denied, truncated, or successful retrieval.
- Never let a negative outcome signal mutate procedural memory directly. It can
  only contribute to a `pending_review` procedure candidate.

## Semantic retrieval compatibility

Feedback summaries and high-value observations are embedding-ready:

- `embedding_vector vector(1536)` is compatible with pgvector and HNSW.
- Metadata tags make retrieval legible to agents, for example:
  - `scope:board`
  - `failure:expensive_query`
  - `tool:change_column_value`
  - `policy:manager_approval_required`
  - `scale:1m_plus_items`
- The resolver should prefilter by `account_id`, scope, tags, and time window
  before vector ranking when the engine supports filtered ANN.
- If filtered ANN is unavailable for a partition, route to an account-scoped
  HNSW shard rather than scanning global embeddings.

## Performance check for 1M+ row boards

Potential full table scan risks:

- `agentObservations` with no `scope`, no `kind`, and broad `since`.
- `agentFeedbackSearch` with unbounded `topK` or no metadata tag prefilter.
- Aggregating raw observations synchronously during GraphQL reads.
- Joining observations to signals without `(account_id, observation_id)`.
- Searching JSON-like text in `content_text` instead of normalized tags.

Mitigations:

- Store raw observations as append-only row records partitioned by `account_id`.
- Build `agent_feedback_summaries` asynchronously from immutable events.
- Keep read paths on composite indexes prefixed by `account_id`.
- Cap default `limit` at `50`, `topK` at `10`, and deadline at `200ms`.
- Use columnar rollups for latency and outcome aggregates; avoid recomputing p95
  from raw rows at request time.
- Drop or archive raw low-value observations after retention windows while keeping
  deterministic summary hashes for audit.

## Multi-tenancy and auditability

- Every primary key begins with `account_id`.
- Foreign keys include `account_id` to prevent cross-tenant joins.
- Open API callers never pass `account_id`; resolvers inject it.
- `previous_audit_hash` and `deterministic_hash` form a per-request hash chain.
- Outcome signals are immutable. Corrections create new signals instead of updates.
- Procedure candidates require reviewer identity before becoming active memory.

## Agent-ready usage example

An agent planning a bulk status update asks for feedback cards:

```graphql
query {
  agentFeedbackSearch(input: {
    scope: { scopeType: "board", scopeId: "12345" }
    query: "bulk status update risk for overdue enterprise accounts"
    metadataTags: ["tool:change_column_value", "scale:1m_plus_items"]
    topK: 5
    maxEstimatedRowsRead: 25000
    deadlineMs: 150
  }) {
    summaryId
    summaryText
    negativeSignalCount
    maxEstimatedRowsRead
    p95LatencyMs
    deterministicHash
  }
}
```

The agent sees deterministic context, such as:

> Prior bulk status runs on this board were rejected when they touched more than
> 25,000 rows without manager approval. Use dry-run preview and require explicit
> approval before write tools.

The database does not decide whether to proceed. It returns scoped evidence and
enforces budgets. The agent or application layer makes the next deterministic API
call.

