# mondayDB Agentic SLO Admission Telemetry Plane

## Why this plane exists

mondayDB's agentic roadmap increases the number of autonomous reads, vector
probes, memory lookups, aggregations, and tool preflights that can be issued on
behalf of a user or app. Those operations are valuable only if they preserve the
core WorkOS promise: fast board interactions, ACID writes, strict tenant
isolation, and predictable availability at enterprise scale.

The product trade-off is explicit:

- **Agent capability vs. 99.99% availability:** agents need exploratory
  retrieval and iterative planning, but those workloads must be admitted through
  deterministic SLO envelopes before they touch row, columnar, vector, or tool
  execution paths.
- **Low latency vs. complete context:** a smaller context packet may answer in
  the blink of an eye, while a broader packet may require asynchronous
  enrichment or human review. The data layer should return the admitted scope,
  not silently expand work after execution starts.
- **Semantic power vs. neighbor protection:** pgvector/HNSW search, long-term
  memory, and recursive tool chains are powerful access paths. Every one of
  them must consume tenant-scoped budgets and produce an audit trace so one
  autonomous agent cannot degrade another tenant's board.

This plane turns agentic SLO management into first-class deterministic records:
admission decisions, live telemetry windows, saturation signals, and replayable
audit hashes.

## Design principles

1. **Admission before execution.** Every agentic operation compiles into an
   SLO envelope with estimated row reads, columnar bytes, vector probes, memory
   expansions, tool calls, and runtime bounds.
2. **Tenant-first data shape.** `account_id` is the leading key for every table,
   resolver, index, telemetry rollup, and audit event.
3. **Telemetry is factual, not probabilistic.** LLMs may perceive telemetry
   summaries, but mondayDB stores deterministic counters, window boundaries,
   budget decisions, and hash-linked evidence.
4. **Core paths fail protected.** If the SLO plane is saturated or unavailable,
   new agentic expansions fail closed while normal row-store reads and ACID
   writes continue through their existing enterprise path.
5. **Semantic retrieval is budgeted like any other query.** HNSW probes are
   bounded by namespace, `top_k`, ef_search class, source watermarks, and
   account-local admission tokens.

## Architecture overview

```text
Agent / App
    |
    | Open API GraphQL
    v
Agentic Gateway
    |
    +--> SLO Admission Compiler
    |       - estimates row, columnar, vector, memory, and tool cost
    |       - reserves tenant-scoped SLO tokens
    |       - emits deterministic admission decision
    |
    +--> mondayDB Execution Surfaces
    |       - Row store for ACID point reads and writes
    |       - Columnar store for bounded analytics
    |       - Vector store for account-partitioned HNSW retrieval
    |       - Tool preflight for governed external actions
    |
    +--> Telemetry + Audit Ledger
            - records actual cost, saturation, watermarks, and hash chain
```

The gateway returns an `AgenticSloEnvelope` to the caller. The envelope tells the
agent which surfaces were admitted, which memory and semantic paths are safe to
use, and which follow-up work must be deferred or reviewed.

## TypeScript contracts

```ts
export type AgenticSurface =
  | "row"
  | "columnar"
  | "vector"
  | "procedural_memory"
  | "tool";

export type SloAdmissionStatus =
  | "approved"
  | "degraded"
  | "requires_review"
  | "rejected";

export interface AgenticSloEnvelope {
  account_id: string;
  envelope_id: string;
  actor_user_id: string;
  app_id?: string;
  request_id: string;
  objective: string;
  board_ids: string[];
  admitted_surfaces: AgenticSurface[];
  status: SloAdmissionStatus;
  estimates: AgenticCostEstimate;
  limits: AgenticSloLimits;
  vector_policy?: VectorAdmissionPolicy;
  procedural_memory_refs: ProceduralMemoryRef[];
  telemetry_window: SloTelemetryWindowRef;
  degradation_reasons: string[];
  deterministic_plan_hash: string;
  audit_hash: string;
  created_at: string;
  expires_at: string;
}

export interface AgenticCostEstimate {
  account_id: string;
  estimated_row_reads: number;
  estimated_row_writes: number;
  estimated_columnar_scan_bytes: number;
  estimated_vector_queries: number;
  estimated_hnsw_probes: number;
  estimated_memory_expansions: number;
  estimated_tool_calls: number;
  estimated_runtime_ms: number;
  confidence: "high" | "medium" | "low";
}

export interface AgenticSloLimits {
  account_id: string;
  max_runtime_ms: number;
  max_row_reads: number;
  max_row_writes: number;
  max_columnar_scan_bytes: number;
  max_vector_queries: number;
  max_hnsw_ef_search: number;
  max_memory_expansions: number;
  max_tool_calls: number;
  max_recursion_depth: number;
}

export interface VectorAdmissionPolicy {
  account_id: string;
  hnsw_namespace: string;
  embedding_model: string;
  allowed_board_ids: string[];
  top_k: number;
  min_score: number;
  ef_search_class: "interactive" | "batch" | "review_required";
  vector_watermark: string;
}

export interface ProceduralMemoryRef {
  account_id: string;
  memory_id: string;
  version: number;
  instruction_kind: "workflow" | "policy" | "schema_hint" | "tool_usage";
  semantic_tags: string[];
  applies_to_board_ids: string[];
  source_event_hash: string;
}

export interface SloTelemetryWindowRef {
  account_id: string;
  window_id: string;
  window_started_at: string;
  window_ended_at?: string;
  admission_tier: "interactive" | "background" | "batch";
  saturation_level: "normal" | "guarded" | "throttled" | "blocked";
}

export interface AgenticSloAuditEvent {
  account_id: string;
  event_id: string;
  envelope_id: string;
  event_kind:
    | "admission_requested"
    | "admission_approved"
    | "admission_degraded"
    | "admission_rejected"
    | "execution_completed"
    | "budget_released";
  payload_hash: string;
  prior_event_hash?: string;
  deterministic_plan_hash: string;
  created_at: string;
}
```

LLMs perceive these records as a capability and constraint map. The model can
see the admitted boards, semantic tags, procedural memory references, and safe
follow-up surfaces without inventing hidden database behavior.

## SQL schema sketch

```sql
CREATE TABLE agentic_slo_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  app_id BIGINT,
  request_id UUID NOT NULL,
  objective TEXT NOT NULL,
  board_ids BIGINT[] NOT NULL,
  admitted_surfaces TEXT[] NOT NULL,
  status TEXT NOT NULL,
  degradation_reasons TEXT[] NOT NULL DEFAULT '{}',
  deterministic_plan_hash BYTEA NOT NULL,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE INDEX agentic_slo_envelopes_request_idx
  ON agentic_slo_envelopes (account_id, request_id, created_at DESC);

CREATE TABLE agentic_slo_cost_estimates (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  estimated_row_reads BIGINT NOT NULL,
  estimated_row_writes BIGINT NOT NULL,
  estimated_columnar_scan_bytes BIGINT NOT NULL,
  estimated_vector_queries INTEGER NOT NULL,
  estimated_hnsw_probes BIGINT NOT NULL,
  estimated_memory_expansions INTEGER NOT NULL,
  estimated_tool_calls INTEGER NOT NULL,
  estimated_runtime_ms INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id)
);

CREATE TABLE agentic_slo_limits (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  max_runtime_ms INTEGER NOT NULL,
  max_row_reads BIGINT NOT NULL,
  max_row_writes BIGINT NOT NULL,
  max_columnar_scan_bytes BIGINT NOT NULL,
  max_vector_queries INTEGER NOT NULL,
  max_hnsw_ef_search INTEGER NOT NULL,
  max_memory_expansions INTEGER NOT NULL,
  max_tool_calls INTEGER NOT NULL,
  max_recursion_depth INTEGER NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE TABLE agentic_vector_admission_policies (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  hnsw_namespace TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  allowed_board_ids BIGINT[] NOT NULL,
  top_k INTEGER NOT NULL,
  min_score REAL NOT NULL,
  ef_search_class TEXT NOT NULL,
  vector_watermark TEXT NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE TABLE agentic_slo_telemetry_windows (
  account_id BIGINT NOT NULL,
  window_id UUID NOT NULL,
  admission_tier TEXT NOT NULL,
  saturation_level TEXT NOT NULL,
  admitted_count BIGINT NOT NULL DEFAULT 0,
  rejected_count BIGINT NOT NULL DEFAULT 0,
  actual_row_reads BIGINT NOT NULL DEFAULT 0,
  actual_row_writes BIGINT NOT NULL DEFAULT 0,
  actual_columnar_scan_bytes BIGINT NOT NULL DEFAULT 0,
  actual_vector_queries BIGINT NOT NULL DEFAULT 0,
  actual_hnsw_probes BIGINT NOT NULL DEFAULT 0,
  actual_tool_calls BIGINT NOT NULL DEFAULT 0,
  p95_runtime_ms INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL,
  window_ended_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, window_id)
);

CREATE INDEX agentic_slo_telemetry_windows_time_idx
  ON agentic_slo_telemetry_windows (
    account_id,
    admission_tier,
    window_started_at DESC
  );

CREATE TABLE agentic_slo_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  event_kind TEXT NOT NULL,
  payload_hash BYTEA NOT NULL,
  prior_event_hash BYTEA,
  deterministic_plan_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_slo_audit_envelope_idx
  ON agentic_slo_audit_events (account_id, envelope_id, created_at);
```

Vector indexes remain source-specific and account-partitioned. The SLO plane
does not store embeddings for every operation; it stores the deterministic
policy that allowed a vector access path to execute.

```sql
CREATE TABLE agentic_slo_policy_embeddings (
  account_id BIGINT NOT NULL,
  policy_id UUID NOT NULL,
  policy_version INTEGER NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  hnsw_namespace TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id, policy_version)
);

CREATE INDEX agentic_slo_policy_embeddings_hnsw
  ON agentic_slo_policy_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

## Open API GraphQL shape

```graphql
enum AgenticSurface {
  ROW
  COLUMNAR
  VECTOR
  PROCEDURAL_MEMORY
  TOOL
}

enum SloAdmissionStatus {
  APPROVED
  DEGRADED
  REQUIRES_REVIEW
  REJECTED
}

input AgenticSloAdmissionInput {
  accountId: ID!
  boardIds: [ID!]!
  objective: String!
  requestedSurfaces: [AgenticSurface!]!
  maxRuntimeMs: Int
  maxRecursionDepth: Int
  requestedTopK: Int
  toolNames: [String!]
  idempotencyKey: String!
}

type AgenticCostEstimate {
  estimatedRowReads: BigInt!
  estimatedRowWrites: BigInt!
  estimatedColumnarScanBytes: BigInt!
  estimatedVectorQueries: Int!
  estimatedHnswProbes: BigInt!
  estimatedMemoryExpansions: Int!
  estimatedToolCalls: Int!
  estimatedRuntimeMs: Int!
  confidence: String!
}

type AgenticSloLimits {
  maxRuntimeMs: Int!
  maxRowReads: BigInt!
  maxRowWrites: BigInt!
  maxColumnarScanBytes: BigInt!
  maxVectorQueries: Int!
  maxHnswEfSearch: Int!
  maxMemoryExpansions: Int!
  maxToolCalls: Int!
  maxRecursionDepth: Int!
}

type VectorAdmissionPolicy {
  hnswNamespace: String!
  embeddingModel: String!
  allowedBoardIds: [ID!]!
  topK: Int!
  minScore: Float!
  efSearchClass: String!
  vectorWatermark: String!
}

type ProceduralMemoryRef {
  memoryId: ID!
  version: Int!
  instructionKind: String!
  semanticTags: [String!]!
  appliesToBoardIds: [ID!]!
  sourceEventHash: String!
}

type AgenticSloEnvelope {
  accountId: ID!
  envelopeId: ID!
  requestId: ID!
  objective: String!
  boardIds: [ID!]!
  admittedSurfaces: [AgenticSurface!]!
  status: SloAdmissionStatus!
  estimates: AgenticCostEstimate!
  limits: AgenticSloLimits!
  vectorPolicy: VectorAdmissionPolicy
  proceduralMemoryRefs: [ProceduralMemoryRef!]!
  degradationReasons: [String!]!
  deterministicPlanHash: String!
  auditHash: String!
  expiresAt: DateTime!
}

type Mutation {
  requestAgenticSloAdmission(
    input: AgenticSloAdmissionInput!
  ): AgenticSloEnvelope!
}

type Query {
  agenticSloEnvelope(accountId: ID!, envelopeId: ID!): AgenticSloEnvelope!
}
```

Every resolver must derive `accountId` from the authenticated monday.com
context and compare it to the supplied value. A mismatch rejects before query
planning to avoid accidental cross-tenant reads.

## Admission lifecycle

1. **Compile request:** normalize requested boards, surfaces, semantic tags,
   memory hints, and tool affordances into a deterministic request packet.
2. **Estimate cost:** use board statistics, columnar partition metadata, vector
   namespace cardinality, and tool-policy metadata to estimate resource use.
3. **Reserve budget:** debit tenant-scoped SLO tokens for the selected admission
   tier. Interactive board activity receives priority over agentic background
   expansion.
4. **Emit envelope:** return approved, degraded, review-required, or rejected
   status with explicit limits and a hash-linked audit event.
5. **Measure actuals:** execution surfaces report actual reads, bytes, probes,
   and runtime into the telemetry window.
6. **Release or settle:** unused budget is released and overage signals update
   future admission thresholds.

The lifecycle is deterministic and replayable: the same request packet,
statistics snapshot, policy version, and saturation window must produce the same
admission decision.

## Performance check for 1M+ row boards

The following patterns are high risk and should be rejected or degraded before
execution:

- Missing `account_id` or `board_id` predicates on row, columnar, vector, or
  telemetry reads.
- Columnar aggregation over a 1M+ row board without partition pruning,
  pre-aggregates, or a declared scan-byte cap.
- Vector search where `top_k` is unbounded, `ef_search` is elevated for an
  interactive request, or the HNSW namespace is shared across accounts.
- Recursive retrieval that can expand from semantic memory to board rows and
  back to semantic memory without a decreasing recursion budget.
- Tool chains that perform read-after-write polling without a runtime or call
  cap.
- Telemetry dashboards that query raw audit events instead of
  `agentic_slo_telemetry_windows` rollups.

Safe execution requires composite indexes beginning with `account_id`, bounded
board sets, and planner-visible limits before any storage engine scan starts.

## Agentic guardrails

- **Recursive query cap:** each envelope carries `max_recursion_depth`; every
  memory expansion, vector follow-up, and tool callback decrements it.
- **Vector probe cap:** `estimated_hnsw_probes` and `max_hnsw_ef_search` are
  reserved before the HNSW path runs.
- **Tool-use readiness:** tool calls are admitted only when the envelope
  includes tool names, call limits, idempotency keys, and policy-compatible
  procedural memory.
- **Degraded mode:** when saturation is guarded, the compiler can reduce
  `top_k`, remove columnar surfaces, or defer tool calls while still returning a
  useful context packet.
- **Audit hash chain:** admission request, decision, execution actuals, and
  budget release are linked by `prior_event_hash`.

## Agent perception metadata

Agents should receive a compact perception block alongside business data:

```json
{
  "agent_perception": {
    "status": "DEGRADED",
    "safe_next_surfaces": ["ROW", "PROCEDURAL_MEMORY"],
    "blocked_surfaces": ["COLUMNAR", "TOOL"],
    "semantic_tags": ["sales_pipeline", "renewal_risk"],
    "procedural_memory_refs": ["mem_123:v4", "mem_456:v2"],
    "reason": "Columnar scan budget is saturated for this account window.",
    "retry_after_window_id": "018fd2f0-8d2c-7c21-a345-1d7b0f5c1140"
  }
}
```

This tells the LLM how to adapt without granting it authority to override the
database planner. The model can choose a narrower follow-up request, but mondayDB
remains the deterministic source of admission truth.

## Operational rollout

1. Start with shadow-mode estimates for agentic GraphQL requests and compare
   estimates against actual row reads, columnar bytes, vector probes, and tool
   calls.
2. Enable hard admission for vector and tool surfaces first, because recursive
   fan-out is highest there.
3. Add degraded-mode responses for interactive requests so agents can still
   receive safe procedural memory and point-read context during saturation.
4. Promote telemetry windows to enterprise audit exports so customers can see
   how autonomous workloads were controlled.

This rollout protects existing mondayDB workloads while making agentic behavior
observable, bounded, and enterprise-ready.
