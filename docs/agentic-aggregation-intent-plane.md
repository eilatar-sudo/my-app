# mondayDB Agentic Aggregation Intent Plane

## Why before how

Autonomous agents will ask mondayDB broad analytical questions such as "which customers are likely blocked?" or "summarize risky projects by owner." Those questions are valuable only when they can cross transactional rows, columnar aggregates, semantic context, and procedural memory without harming neighboring tenants. The product trade-off is **agent autonomy vs. query predictability**: mondayDB should let agents compose useful analytics, but the database must remain deterministic, tenant-scoped, auditable, and able to reject work that would become a full scan on boards with 1M+ rows.

The Agentic Aggregation Intent Plane turns an agent's analytical request into a bounded, replayable aggregation contract. It does not let the model execute SQL directly. Instead, the engine records a deterministic intent, resolves approved semantic and procedural references, estimates row/columnar/vector cost, reserves budget, and then executes only a compiled plan whose predicates include `account_id`.

## Goals

- Preserve 99.99% availability by admitting only aggregations that fit tenant, board, and workload budgets.
- Keep ACID writes isolated from analytical agent workloads by routing read-heavy aggregation to the columnar layer when freshness permits.
- Provide every capability through the monday.com Open API GraphQL surface.
- Make aggregation plans visible to agents as metadata-rich packets, not opaque SQL strings.
- Ensure every state transition leaves an audit hash that support, security, and customers can replay.

## Non-goals

- No probabilistic query rewriting inside the database engine.
- No cross-account aggregate learning or shared vector neighborhoods.
- No unbounded recursive aggregation expansion from agent tool calls.
- No direct SQL execution through Open API.

## Control flow

1. Agent submits an aggregation intent with `account_id`, board scope, freshness target, semantic hints, and requested measures.
2. mondayDB resolves procedural memory and semantic metadata within the same account partition.
3. The planner compiles a candidate aggregation plan with explicit row, columnar, and vector operators.
4. Admission control estimates scanned rows, HNSW probes, columnar segments, recursion depth, and expected latency.
5. If accepted, a budget reservation and audit event are written before execution.
6. The aggregation executes against columnar storage unless the intent requires transactionally fresh row data.
7. The response returns aggregate values, evidence references, cost telemetry, and agent-readable perception metadata.

## TypeScript contracts

```ts
export type AggregationIntentStatus =
  | "draft"
  | "verified"
  | "budget_reserved"
  | "executed"
  | "rejected"
  | "expired";

export type AggregationFreshnessMode =
  | "transactional_row"
  | "columnar_watermark"
  | "semantic_snapshot";

export interface AgenticAggregationIntent {
  intentId: string;
  accountId: string;
  boardIds: string[];
  actor: {
    userId?: string;
    agentId: string;
    appId?: string;
  };
  naturalLanguageRequest: string;
  deterministicRequestHash: string;
  measures: AggregationMeasure[];
  dimensions: AggregationDimension[];
  filters: AggregationFilter[];
  freshness: {
    mode: AggregationFreshnessMode;
    maxStalenessMs: number;
    requiredWatermark?: string;
  };
  semanticRefs: SemanticAggregationRef[];
  proceduralMemoryRefs: ProceduralMemoryRef[];
  guardrails: AggregationGuardrailEnvelope;
  status: AggregationIntentStatus;
  createdAt: string;
  expiresAt: string;
}

export interface AggregationMeasure {
  name: string;
  sourceColumnId: string;
  function: "count" | "sum" | "avg" | "min" | "max" | "approx_distinct";
  nullHandling: "ignore" | "zero" | "reject";
}

export interface AggregationDimension {
  name: string;
  sourceColumnId: string;
  maxCardinality: number;
  semanticTag?: "owner" | "status" | "date" | "risk" | "custom";
}

export interface AggregationFilter {
  columnId: string;
  operator: "eq" | "in" | "range" | "exists" | "semantic_match";
  valueHash: string;
  // The raw value is stored in encrypted tenant storage; the planner uses hashes for audit replay.
  encryptedValueRef?: string;
}

export interface SemanticAggregationRef {
  refId: string;
  embeddingId: string;
  accountId: string;
  boardId?: string;
  hnswNamespace: string;
  topK: number;
  similarityThreshold: number;
  metadataTags: string[];
}

export interface ProceduralMemoryRef {
  memoryId: string;
  version: number;
  accountId: string;
  instructionTags: string[];
  allowedPlanOperators: string[];
}

export interface AggregationGuardrailEnvelope {
  maxEstimatedRows: number;
  maxColumnarSegments: number;
  maxVectorCandidates: number;
  maxRecursiveExpansions: number;
  maxExecutionMs: number;
  requireAccountPredicate: true;
  requireBoardPredicate: boolean;
  allowRowStoreFallback: boolean;
}

export interface AggregationExecutionResult {
  intentId: string;
  accountId: string;
  status: "executed" | "rejected";
  rows: Array<Record<string, string | number | boolean | null>>;
  evidenceRefs: string[];
  watermark: string;
  costTelemetry: {
    estimatedRows: number;
    actualRowsScanned: number;
    columnarSegmentsRead: number;
    vectorCandidatesRead: number;
    executionMs: number;
    budgetUnitsConsumed: number;
  };
  agentPerception: {
    summaryLabel: string;
    confidenceInputs: string[];
    caveats: string[];
    nextAllowedActions: string[];
  };
  auditHash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_aggregation_intents (
  account_id BIGINT NOT NULL,
  intent_id UUID NOT NULL,
  actor_agent_id UUID NOT NULL,
  actor_user_id BIGINT,
  board_ids BIGINT[] NOT NULL,
  natural_language_request TEXT NOT NULL,
  deterministic_request_hash BYTEA NOT NULL,
  measures JSONB NOT NULL,
  dimensions JSONB NOT NULL,
  filters JSONB NOT NULL,
  freshness_mode TEXT NOT NULL CHECK (
    freshness_mode IN ('transactional_row', 'columnar_watermark', 'semantic_snapshot')
  ),
  max_staleness_ms INTEGER NOT NULL CHECK (max_staleness_ms >= 0),
  required_watermark TEXT,
  semantic_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  procedural_memory_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  guardrails JSONB NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'verified', 'budget_reserved', 'executed', 'rejected', 'expired')
  ),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, intent_id)
);

CREATE INDEX agentic_aggregation_intents_account_status_idx
  ON agentic_aggregation_intents (account_id, status, created_at DESC);

CREATE INDEX agentic_aggregation_intents_account_boards_idx
  ON agentic_aggregation_intents USING GIN (board_ids);

CREATE TABLE agentic_aggregation_budget_reservations (
  account_id BIGINT NOT NULL,
  reservation_id UUID NOT NULL,
  intent_id UUID NOT NULL,
  estimated_rows BIGINT NOT NULL,
  estimated_columnar_segments INTEGER NOT NULL,
  estimated_vector_candidates INTEGER NOT NULL,
  reserved_budget_units INTEGER NOT NULL,
  reservation_hash BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, reservation_id),
  FOREIGN KEY (account_id, intent_id)
    REFERENCES agentic_aggregation_intents (account_id, intent_id)
);

CREATE INDEX agentic_aggregation_budget_intent_idx
  ON agentic_aggregation_budget_reservations (account_id, intent_id);

CREATE TABLE agentic_aggregation_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  intent_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'intent_created',
      'semantic_refs_resolved',
      'plan_verified',
      'budget_reserved',
      'execution_started',
      'execution_completed',
      'execution_rejected'
    )
  ),
  previous_event_hash BYTEA,
  event_payload_hash BYTEA NOT NULL,
  event_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_aggregation_audit_intent_idx
  ON agentic_aggregation_audit_events (account_id, intent_id, created_at ASC);
```

For semantic discovery, embeddings are stored in the existing tenant-partitioned vector plane:

```sql
CREATE TABLE agentic_aggregation_embedding_refs (
  account_id BIGINT NOT NULL,
  embedding_id UUID NOT NULL,
  board_id BIGINT,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('dimension_profile', 'measure_profile', 'procedure_hint', 'result_summary')
  ),
  source_ref_id TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id)
);

CREATE INDEX agentic_aggregation_embedding_hnsw_idx
  ON agentic_aggregation_embedding_refs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The vector index must be physically or logically partitioned by `account_id`. If the vector engine cannot guarantee account-local HNSW traversal, the planner must use per-account namespaces instead of a shared global index.

## Open API GraphQL shape

```graphql
input AgenticAggregationMeasureInput {
  name: String!
  sourceColumnId: ID!
  function: AgenticAggregationFunction!
  nullHandling: AgenticNullHandling!
}

input AgenticAggregationDimensionInput {
  name: String!
  sourceColumnId: ID!
  maxCardinality: Int!
  semanticTag: String
}

input AgenticAggregationFilterInput {
  columnId: ID!
  operator: AgenticAggregationFilterOperator!
  encryptedValueRef: String
  valueHash: String!
}

input AgenticAggregationGuardrailInput {
  maxEstimatedRows: Int!
  maxColumnarSegments: Int!
  maxVectorCandidates: Int!
  maxRecursiveExpansions: Int!
  maxExecutionMs: Int!
  requireBoardPredicate: Boolean!
  allowRowStoreFallback: Boolean!
}

input CreateAgenticAggregationIntentInput {
  accountId: ID!
  boardIds: [ID!]!
  naturalLanguageRequest: String!
  deterministicRequestHash: String!
  measures: [AgenticAggregationMeasureInput!]!
  dimensions: [AgenticAggregationDimensionInput!]!
  filters: [AgenticAggregationFilterInput!]!
  freshnessMode: AgenticAggregationFreshnessMode!
  maxStalenessMs: Int!
  guardrails: AgenticAggregationGuardrailInput!
  semanticHintIds: [ID!]
  proceduralMemoryIds: [ID!]
}

type AgenticAggregationIntent {
  accountId: ID!
  intentId: ID!
  status: AgenticAggregationIntentStatus!
  boardIds: [ID!]!
  freshnessMode: AgenticAggregationFreshnessMode!
  estimatedRows: Int
  estimatedColumnarSegments: Int
  estimatedVectorCandidates: Int
  rejectionReason: String
  auditHash: String!
}

type AgenticAggregationResult {
  accountId: ID!
  intentId: ID!
  rows: JSON!
  evidenceRefs: [ID!]!
  watermark: String!
  costTelemetry: AgenticAggregationCostTelemetry!
  agentPerception: AgenticAggregationPerception!
  auditHash: String!
}

type Mutation {
  createAgenticAggregationIntent(
    input: CreateAgenticAggregationIntentInput!
  ): AgenticAggregationIntent!

  verifyAgenticAggregationIntent(
    accountId: ID!
    intentId: ID!
  ): AgenticAggregationIntent!

  executeAgenticAggregationIntent(
    accountId: ID!
    intentId: ID!
  ): AgenticAggregationResult!
}

type Query {
  agenticAggregationIntent(accountId: ID!, intentId: ID!): AgenticAggregationIntent!
}
```

The resolver must derive `accountId` from the authenticated token and reject mismatches with the input value. The explicit field remains useful for deterministic audit replay and for Open API clients that operate across multiple authorized accounts.

## Planner and execution rules

- Every compiled plan must include `account_id = $account_id` as the first partition predicate.
- Plans that touch board items must include either a bounded `board_id IN (...)` predicate or a verified working-set reference.
- `semantic_match` filters must resolve to bounded candidate item IDs before aggregation begins.
- Columnar execution is preferred for aggregates when the requested freshness can be satisfied by the columnar watermark.
- Row-store fallback is allowed only when `allowRowStoreFallback` is true and the estimated row count is below the tenant's interactive threshold.
- Approximate functions such as `approx_distinct` must state their error bounds in `agentPerception.caveats`.
- Recursive expansions are counted across GraphQL resolver calls, vector retrieval, tool invocations, and follow-up aggregation intents.

## Performance checks for 1M+ row boards

Flag or reject a plan before execution if any of these are true:

- The filter set lacks a selective board, group, date, status, owner, working-set, or semantic candidate predicate.
- `maxEstimatedRows` exceeds the tenant's admitted analytics threshold.
- The requested dimension has no cardinality cap or its observed cardinality exceeds `maxCardinality`.
- `semantic_match.topK` multiplied by recursive expansions exceeds `maxVectorCandidates`.
- A JSON column filter cannot be mapped to a columnar projection, dictionary, or precomputed inverted index.
- The plan would require row-store reads for more than the configured transactional fallback threshold.
- A columnar watermark is too stale and the intent requests `transactional_row` freshness without enough budget.

For large boards, the safe path is:

```sql
SELECT dimension_key, SUM(measure_value)
FROM columnar_board_items
WHERE account_id = $1
  AND board_id = ANY($2)
  AND columnar_watermark >= $3
  AND item_id = ANY($4) -- optional bounded semantic/working-set candidates
GROUP BY dimension_key
LIMIT $5;
```

The unsafe path is any aggregate over `columnar_board_items` or row-store item data that omits `account_id`, omits `board_id` or an equivalent bounded candidate set, or groups on unbounded schemaless JSON values.

## Agentic guardrails

- **Budget reservation:** Verification writes `agentic_aggregation_budget_reservations` before execution starts.
- **Loop containment:** Repeated intents with the same `deterministicRequestHash`, semantic refs, and filter hashes consume an increasing budget multiplier.
- **Tool-use readiness:** Tool calls can consume `AgenticAggregationResult`, but they cannot issue follow-up aggregations unless the remaining execution envelope permits it.
- **Tenant isolation:** HNSW search, procedural memory resolution, audit reads, and aggregation execution all require the same `account_id`.
- **Deterministic rejection:** Rejection reasons are stable enums such as `missing_account_scope`, `estimated_rows_exceeded`, `vector_candidate_budget_exceeded`, and `watermark_too_stale`.
- **Auditability:** Each state transition appends an audit event whose hash includes the previous hash, intent ID, account ID, planner version, and canonicalized payload hash.

## How an agent perceives the data

Agents receive a structured perception packet rather than raw planner internals:

```ts
export interface AggregationPerceptionPacket {
  accountId: string;
  intentId: string;
  humanReadableSummary: string;
  semanticTags: string[];
  proceduralInstructions: Array<{
    memoryId: string;
    version: number;
    instruction: string;
  }>;
  evidenceRefs: string[];
  freshnessLabel: "live" | "watermarked" | "snapshot";
  caveats: string[];
  allowedFollowUps: Array<{
    action: "drill_down" | "refresh" | "export" | "create_update" | "stop";
    requiredBudgetUnits: number;
  }>;
}
```

This makes the result legible to an LLM while keeping mondayDB deterministic. The model can reason over labels, caveats, evidence refs, and allowed follow-ups, but it cannot bypass the verifier or mutate the plan after admission.

## Operational metrics

- `agentic_aggregation_intents_created_total{account_id,status}`
- `agentic_aggregation_rejections_total{account_id,reason}`
- `agentic_aggregation_estimated_rows{account_id,board_size_bucket}`
- `agentic_aggregation_actual_rows_scanned{account_id,storage_layer}`
- `agentic_aggregation_vector_candidates{account_id,hnsw_namespace}`
- `agentic_aggregation_budget_units_consumed{account_id,agent_id}`
- `agentic_aggregation_watermark_lag_ms{account_id,board_id}`

Metrics with `account_id` labels should be protected behind tenant-aware observability controls or internally remapped to tenant-safe identifiers.

## Rollout strategy

1. Start in verify-only mode and return deterministic rejection/admission decisions without executing plans.
2. Enable execution for columnar-watermarked aggregates on small and medium boards.
3. Add bounded semantic candidate filters after account-partitioned HNSW enforcement is validated.
4. Permit transactional row fallback only for low-cardinality, low-row-count intents.
5. Expose drill-down follow-ups once loop containment and budget multipliers are active.

## Enterprise readiness checklist

- [x] `account_id` is part of every primary key and query contract.
- [x] All Open API operations include deterministic audit identifiers.
- [x] Vector retrieval is compatible with pgvector/HNSW only under tenant-local traversal.
- [x] Procedural memory references are versioned and account-scoped.
- [x] Full-scan risks on 1M+ row boards are explicitly rejected before execution.
- [x] The database remains deterministic; agents consume metadata and envelopes rather than generating executable database plans.
