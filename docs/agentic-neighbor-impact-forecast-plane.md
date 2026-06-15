# Agentic Neighbor Impact Forecast Plane

## Why this plane exists

mondayDB can become an Agentic Database only if autonomous workloads are safe
neighbors. Agents will ask for semantic retrieval, recursive planning, broad
aggregations, and tool-triggered writes. Those workloads are valuable, but they
can also amplify cost faster than a human-driven workflow. The product trade-off
is direct:

- **Agentic capability vs. tenant predictability:** richer context retrieval
  improves answer quality, but only if the database can bound the blast radius
  before execution.
- **Low latency vs. strong isolation:** fast admission decisions must use
  deterministic estimates and recent telemetry, not probabilistic model
  judgments.
- **Freshness vs. stability:** a forecast may reject or degrade a request when
  columnar or vector indexes are behind freshness targets, preserving 99.99%
  availability over best-effort agent exploration.

The Agentic Neighbor Impact Forecast Plane is a deterministic preflight layer
that predicts whether an agentic workload could affect adjacent tenants,
boards, or SLO classes before mondayDB executes row, columnar, vector, or tool
paths.

## Product contract

Every autonomous workload receives a forecast before admission. The forecast is
not an LLM recommendation; it is a replayable database decision built from
account-scoped metadata, query plans, watermarks, budgets, and workload telemetry.

```text
agent plan -> forecast request -> deterministic impact envelope
           -> admit | degrade | queue | reject
           -> audit event with replay hash
```

### Success criteria

1. Every forecast is scoped by `account_id`.
2. Every admitted workload includes a maximum cost envelope.
3. Every degraded or rejected workload exposes an Open API explanation that an
   agent can use to choose a narrower next step.
4. No forecast path performs a full scan on boards with 1M+ rows.
5. Every forecast decision is auditable and replayable from deterministic inputs.

## TypeScript schema

```ts
export type AgenticWorkloadPath =
  | "row_lookup"
  | "row_mutation"
  | "columnar_aggregation"
  | "semantic_vector_search"
  | "hybrid_retrieval"
  | "tool_execution";

export type NeighborImpactDecision =
  | "admit"
  | "admit_degraded"
  | "queue"
  | "reject";

export interface ForecastSubject {
  account_id: string;
  board_id?: string;
  workspace_id?: string;
  actor_id: string;
  agent_id: string;
  request_id: string;
  plan_id: string;
  recursive_depth: number;
}

export interface ForecastStepEstimate {
  step_id: string;
  path: AgenticWorkloadPath;
  estimated_rows_read: number;
  estimated_rows_written: number;
  estimated_vector_candidates: number;
  estimated_columnar_segments: number;
  estimated_cpu_ms: number;
  estimated_memory_mb: number;
  estimated_io_bytes: number;
  estimated_lock_ms: number;
  requires_freshness_watermark: string;
  uses_account_partition: boolean;
  uses_selective_index: boolean;
  full_scan_risk: "none" | "possible" | "blocked";
}

export interface NeighborImpactForecast {
  forecast_id: string;
  subject: ForecastSubject;
  steps: ForecastStepEstimate[];
  total_estimated_cpu_ms: number;
  total_estimated_io_bytes: number;
  total_estimated_memory_mb: number;
  total_estimated_lock_ms: number;
  tenant_budget_remaining_ms: number;
  neighbor_pressure_score: number;
  decision: NeighborImpactDecision;
  deterministic_reason_codes: string[];
  max_runtime_ms: number;
  max_result_rows: number;
  max_vector_top_k: number;
  created_at: string;
  expires_at: string;
  input_hash: string;
  decision_hash: string;
  previous_audit_hash?: string;
}

export interface AgentPerceptionHint {
  label: string;
  description: string;
  next_safe_action: string;
  semantic_tags: string[];
  procedure_memory_refs: string[];
  evidence_refs: string[];
}
```

## SQL schema

The tables are tenant-partitioned and append-only for replayability. The
forecast tables should live in the control plane, not in the hot row-write path.

```sql
CREATE TABLE agentic_neighbor_impact_forecasts (
  account_id                BIGINT NOT NULL,
  forecast_id               UUID NOT NULL,
  request_id                UUID NOT NULL,
  plan_id                   UUID NOT NULL,
  actor_id                  BIGINT NOT NULL,
  agent_id                  TEXT NOT NULL,
  board_id                  BIGINT,
  workspace_id              BIGINT,
  recursive_depth           INTEGER NOT NULL CHECK (recursive_depth >= 0),
  decision                  TEXT NOT NULL CHECK (
    decision IN ('admit', 'admit_degraded', 'queue', 'reject')
  ),
  total_estimated_cpu_ms    BIGINT NOT NULL CHECK (total_estimated_cpu_ms >= 0),
  total_estimated_io_bytes  BIGINT NOT NULL CHECK (total_estimated_io_bytes >= 0),
  total_estimated_memory_mb BIGINT NOT NULL CHECK (total_estimated_memory_mb >= 0),
  total_estimated_lock_ms   BIGINT NOT NULL CHECK (total_estimated_lock_ms >= 0),
  tenant_budget_remaining_ms BIGINT NOT NULL,
  neighbor_pressure_score   NUMERIC(5, 4) NOT NULL CHECK (
    neighbor_pressure_score >= 0 AND neighbor_pressure_score <= 1
  ),
  max_runtime_ms            BIGINT NOT NULL,
  max_result_rows           INTEGER NOT NULL,
  max_vector_top_k          INTEGER NOT NULL,
  reason_codes              TEXT[] NOT NULL,
  input_hash                BYTEA NOT NULL,
  decision_hash             BYTEA NOT NULL,
  previous_audit_hash       BYTEA,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, forecast_id)
) PARTITION BY HASH (account_id);

CREATE INDEX idx_agentic_neighbor_forecasts_request
  ON agentic_neighbor_impact_forecasts (account_id, request_id, created_at DESC);

CREATE INDEX idx_agentic_neighbor_forecasts_plan
  ON agentic_neighbor_impact_forecasts (account_id, plan_id, created_at DESC);

CREATE TABLE agentic_neighbor_forecast_steps (
  account_id                   BIGINT NOT NULL,
  forecast_id                  UUID NOT NULL,
  step_id                      TEXT NOT NULL,
  path                         TEXT NOT NULL CHECK (
    path IN (
      'row_lookup',
      'row_mutation',
      'columnar_aggregation',
      'semantic_vector_search',
      'hybrid_retrieval',
      'tool_execution'
    )
  ),
  estimated_rows_read          BIGINT NOT NULL CHECK (estimated_rows_read >= 0),
  estimated_rows_written       BIGINT NOT NULL CHECK (estimated_rows_written >= 0),
  estimated_vector_candidates  BIGINT NOT NULL CHECK (estimated_vector_candidates >= 0),
  estimated_columnar_segments  BIGINT NOT NULL CHECK (estimated_columnar_segments >= 0),
  estimated_cpu_ms             BIGINT NOT NULL CHECK (estimated_cpu_ms >= 0),
  estimated_memory_mb          BIGINT NOT NULL CHECK (estimated_memory_mb >= 0),
  estimated_io_bytes           BIGINT NOT NULL CHECK (estimated_io_bytes >= 0),
  estimated_lock_ms            BIGINT NOT NULL CHECK (estimated_lock_ms >= 0),
  requires_freshness_watermark TEXT NOT NULL,
  uses_account_partition       BOOLEAN NOT NULL,
  uses_selective_index         BOOLEAN NOT NULL,
  full_scan_risk               TEXT NOT NULL CHECK (
    full_scan_risk IN ('none', 'possible', 'blocked')
  ),
  reason_codes                 TEXT[] NOT NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, forecast_id, step_id),
  FOREIGN KEY (account_id, forecast_id)
    REFERENCES agentic_neighbor_impact_forecasts (account_id, forecast_id)
);

CREATE INDEX idx_agentic_neighbor_steps_path
  ON agentic_neighbor_forecast_steps (account_id, path, created_at DESC);

CREATE TABLE agentic_neighbor_forecast_embeddings (
  account_id       BIGINT NOT NULL,
  forecast_id      UUID NOT NULL,
  embedding_model  TEXT NOT NULL,
  semantic_tags    TEXT[] NOT NULL,
  summary          TEXT NOT NULL,
  embedding        vector(1536) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, forecast_id),
  FOREIGN KEY (account_id, forecast_id)
    REFERENCES agentic_neighbor_impact_forecasts (account_id, forecast_id)
) PARTITION BY HASH (account_id);

-- Build HNSW indexes per account partition or per shard so ANN search never
-- crosses tenant boundaries.
CREATE INDEX idx_agentic_neighbor_forecast_embeddings_hnsw
  ON agentic_neighbor_forecast_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 96);
```

### SQL invariants

- `account_id` is present in every primary key and foreign key.
- Forecast reads must use `(account_id, request_id)` or `(account_id, plan_id)`.
- HNSW indexes are partitioned by `account_id` before ANN search.
- Forecast rows are immutable; corrections are new forecasts chained through
  `previous_audit_hash`.

## Open API GraphQL surface

Every capability is available through the monday.com Open API, allowing agents
to inspect deterministic limits before attempting expensive work.

```graphql
enum NeighborImpactDecision {
  ADMIT
  ADMIT_DEGRADED
  QUEUE
  REJECT
}

enum AgenticWorkloadPath {
  ROW_LOOKUP
  ROW_MUTATION
  COLUMNAR_AGGREGATION
  SEMANTIC_VECTOR_SEARCH
  HYBRID_RETRIEVAL
  TOOL_EXECUTION
}

input AgenticForecastStepInput {
  stepId: ID!
  path: AgenticWorkloadPath!
  boardId: ID
  estimatedTopK: Int
  requestedColumns: [String!]
  filterFingerprint: String!
  freshnessWatermark: String
}

input CreateNeighborImpactForecastInput {
  accountId: ID!
  requestId: ID!
  planId: ID!
  agentId: String!
  actorId: ID!
  recursiveDepth: Int!
  steps: [AgenticForecastStepInput!]!
}

type NeighborImpactStepEstimate {
  stepId: ID!
  path: AgenticWorkloadPath!
  estimatedRowsRead: BigInt!
  estimatedRowsWritten: BigInt!
  estimatedVectorCandidates: BigInt!
  estimatedColumnarSegments: BigInt!
  estimatedCpuMs: BigInt!
  estimatedIoBytes: BigInt!
  fullScanRisk: String!
  reasonCodes: [String!]!
}

type AgentPerceptionHint {
  label: String!
  description: String!
  nextSafeAction: String!
  semanticTags: [String!]!
  procedureMemoryRefs: [ID!]!
  evidenceRefs: [ID!]!
}

type NeighborImpactForecast {
  forecastId: ID!
  accountId: ID!
  planId: ID!
  decision: NeighborImpactDecision!
  maxRuntimeMs: BigInt!
  maxResultRows: Int!
  maxVectorTopK: Int!
  neighborPressureScore: Float!
  reasonCodes: [String!]!
  steps: [NeighborImpactStepEstimate!]!
  perceptionHint: AgentPerceptionHint!
  inputHash: String!
  decisionHash: String!
  expiresAt: ISO8601DateTime!
}

type Mutation {
  createNeighborImpactForecast(
    input: CreateNeighborImpactForecastInput!
  ): NeighborImpactForecast!
}

type Query {
  neighborImpactForecast(
    accountId: ID!
    forecastId: ID!
  ): NeighborImpactForecast

  neighborImpactForecastsByPlan(
    accountId: ID!
    planId: ID!
    limit: Int = 20
  ): [NeighborImpactForecast!]!
}
```

## Deterministic admission algorithm

```ts
export function decideNeighborImpact(
  forecast: NeighborImpactForecast,
  limits: {
    maxCpuMs: number;
    maxIoBytes: number;
    maxMemoryMb: number;
    maxLockMs: number;
    maxRecursiveDepth: number;
    maxNeighborPressureScore: number;
  },
): NeighborImpactDecision {
  if (forecast.subject.recursive_depth > limits.maxRecursiveDepth) {
    return "reject";
  }

  if (forecast.steps.some((step) => !step.uses_account_partition)) {
    return "reject";
  }

  if (forecast.steps.some((step) => step.full_scan_risk === "blocked")) {
    return "reject";
  }

  if (forecast.neighbor_pressure_score > limits.maxNeighborPressureScore) {
    return "queue";
  }

  if (
    forecast.total_estimated_cpu_ms > limits.maxCpuMs ||
    forecast.total_estimated_io_bytes > limits.maxIoBytes ||
    forecast.total_estimated_memory_mb > limits.maxMemoryMb ||
    forecast.total_estimated_lock_ms > limits.maxLockMs
  ) {
    return "admit_degraded";
  }

  return "admit";
}
```

The algorithm is intentionally simple and deterministic. Model-generated plans
can supply intent, but only mondayDB estimators and policy limits decide
admission.

## Forecast inputs by storage path

### Row storage

- Require point lookups, bounded row ranges, or indexed predicates.
- Estimate lock time for write intents and transactional updates.
- Reject agent-generated filters that omit `account_id`.
- Reject mutations without idempotency keys and audit subjects.

### Columnar storage

- Estimate segment count from board, group, column, and time pruning metadata.
- Require aggregation predicates to include account and board scopes.
- Degrade to sampled or pre-aggregated answers only when the API response marks
  the result as degraded.

### Vector storage

- Require account-partitioned HNSW search.
- Cap `topK`, `ef_search`, candidate expansion, and rerank set size.
- Record embedding model, vector index watermark, and semantic tags.
- Reject cross-account vector joins; they are product features, not database
  fallbacks.

### Tool execution

- Treat each tool call as a workload step with its own CPU, IO, lock, and
  recursion budget.
- Require a forecast renewal before a tool can trigger another forecasted plan.
- Attach procedure memory references so an agent can understand allowed
  operational patterns.

## Performance check for 1M+ row boards

Any proposal that cannot satisfy these checks risks a full table scan and should
be blocked before execution:

1. `account_id` must be a leading key in every forecast lookup.
2. `board_id` or an equivalent partition key is required for board item scans.
3. JSON/schemaless column filters must resolve to a selective index, materialized
   columnar projection, or bounded row id set.
4. Vector search must execute inside an account partition before reranking.
5. Recursive agent depth must be bounded by policy and included in the forecast.
6. Open-ended GraphQL pagination is not allowed; `limit` and cost ceilings are
   mandatory.
7. Columnar aggregations must prove segment pruning; otherwise the forecast is
   `reject` or `admit_degraded` against a pre-aggregate.

## Agent perception model

Agents perceive forecast responses as operational metadata, not hidden magic.
The `AgentPerceptionHint` gives the LLM a safe next action without allowing it
to override the database decision.

Example:

```json
{
  "label": "Aggregation too broad for live execution",
  "description": "The requested board aggregation would scan unpruned columnar segments.",
  "nextSafeAction": "Add a date range or use the approved monthly pre-aggregate.",
  "semanticTags": [
    "neighbor-impact",
    "columnar-aggregation",
    "full-scan-risk"
  ],
  "procedureMemoryRefs": [
    "procedure://analytics/use-pre-aggregates-for-large-boards"
  ],
  "evidenceRefs": [
    "forecast_step:segment-pruning-check"
  ]
}
```

This lets an LLM explain the rejection and reformulate a safer plan while the
database remains deterministic.

## Auditability

Each forecast writes a deterministic audit event:

```ts
export interface NeighborImpactAuditEvent {
  account_id: string;
  forecast_id: string;
  event_type:
    | "forecast_created"
    | "decision_admitted"
    | "decision_degraded"
    | "decision_queued"
    | "decision_rejected";
  actor_id: string;
  agent_id: string;
  request_id: string;
  plan_id: string;
  reason_codes: string[];
  canonical_input_json: string;
  input_hash: string;
  decision_hash: string;
  previous_audit_hash?: string;
  created_at: string;
}
```

Replay requires the estimator version, policy version, telemetry watermark, and
canonical request body. If any input changes, the forecast must produce a new
hash and a new audit event.

## Guardrails against expensive recursion

- `recursive_depth` is required and monotonically increases for agent-triggered
  follow-up plans.
- Forecast renewal is mandatory before any tool-triggered query.
- Repeated semantic fingerprints within a short window receive higher neighbor
  pressure scores.
- A degraded forecast can lower `maxVectorTopK`, reduce result columns, or force
  pre-aggregates, but it cannot silently change write semantics.
- Rejections include procedure memory references that teach agents how to narrow
  the request.

## Rollout metrics

- Forecast p95 latency by workload path.
- Percentage of agentic workloads admitted, degraded, queued, and rejected.
- False-positive reject rate from human-reviewed support cases.
- Tenant budget exhaustion avoided by forecast decisions.
- Vector candidate expansion before and after degradation.
- 1M+ row board full-scan attempts blocked.
- Audit replay success rate across estimator and policy versions.

## Engineering notes

- Keep estimators deterministic and versioned.
- Do not embed probabilistic model confidence in admission decisions.
- Store semantic summaries only as retrieval aids; never use ANN results to
  bypass `account_id` or workload policy checks.
- Prefer degraded deterministic answers over unbounded live scans.
- Make reason codes stable enough for agents, support teams, and customers to
  build procedural memory around them.
