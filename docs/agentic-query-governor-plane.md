# Agentic Query Governor Plane

## Why this plane exists

mondayDB can let agents reason over boards, docs, updates, automations, and
semantic memory only if the database keeps deterministic control over what each
agent is allowed to read, expand, aggregate, and mutate. The Agentic Query
Governor is the tenant-scoped preflight and admission layer for autonomous
queries. It turns probabilistic agent intent into a bounded, auditable execution
envelope before the row store, columnar store, vector index, or tool runtime does
work.

The product trade-off is latency versus consistency and neighbor safety:

- **Low latency:** small, indexed row lookups and bounded vector retrieval can be
  admitted immediately with strict deadlines.
- **Consistent enterprise behavior:** write-adjacent or ACID-sensitive plans must
  declare source watermarks and transaction boundaries before execution.
- **Neighbor protection:** expensive recursive expansions, broad aggregations,
  and unbounded semantic searches are rejected or queued before they impact other
  tenants.

This keeps AI behavior outside the storage engine. The database remains
predictable: the same tenant, policy, budget, watermarks, and plan hash always
produce the same admission decision.

## Scope

The governor covers agent-issued:

1. row-store point reads, updates, and transactional lookups;
2. columnar aggregations and analytics scans;
3. pgvector/HNSW semantic retrieval over board objects, memory records, and
   procedure metadata;
4. hybrid plans that combine row, columnar, vector, and tool-use steps; and
5. recursive expansions where one result can request more database work.

Every request must be scoped by `account_id`. Board-level, workspace-level, and
user-level permissions are compiled into the envelope, but `account_id` is the
leading isolation key for every persisted record and index.

## TypeScript contracts

```ts
export type AgenticQueryPath = "row" | "columnar" | "vector" | "hybrid" | "tool";

export type AgenticAdmissionDecision =
  | "admit"
  | "admit_degraded"
  | "queue"
  | "reject";

export interface AgenticQueryIntent {
  accountId: string;
  boardId?: string;
  actorUserId: string;
  agentSessionId: string;
  purposeBoundaryId: string;
  idempotencyKey: string;
  requestedPaths: AgenticQueryPath[];
  naturalLanguageGoalHash: string;
  structuredPlanHash: string;
  requiredConsistency: "read_your_write" | "bounded_stale" | "eventual";
  maxEstimatedRows: number;
  maxVectorTopK: number;
  maxExpansionDepth: number;
  deadlineMs: number;
  toolCallBudget?: number;
  sourceWatermarks: AgenticSourceWatermark[];
  semanticHints: AgenticSemanticHint[];
  proceduralMemoryRefs: AgenticProcedureRef[];
}

export interface AgenticSourceWatermark {
  sourceKind: "row" | "columnar" | "vector" | "memory" | "tool";
  sourceId: string;
  minVersion?: string;
  maxStalenessMs?: number;
}

export interface AgenticSemanticHint {
  accountId: string;
  namespace: "board_object" | "procedure_memory" | "agent_memory" | "schema_contract";
  tags: string[];
  embeddingModel: string;
  vectorIndexPartition: string;
}

export interface AgenticProcedureRef {
  accountId: string;
  procedureId: string;
  version: number;
  instructionHash: string;
}

export interface AgenticQueryEstimate {
  accountId: string;
  intentId: string;
  path: AgenticQueryPath;
  estimatedRows: number;
  estimatedColumnarBytes: bigint;
  estimatedVectorCandidates: number;
  estimatedToolCalls: number;
  estimatedCostUnits: number;
  requiresFullScan: boolean;
  missingTenantPredicate: boolean;
  missingBoardPredicate: boolean;
  recursiveRiskScore: number;
  neighborImpactScore: number;
}

export interface AgenticExecutionEnvelope {
  accountId: string;
  envelopeId: string;
  intentId: string;
  decision: AgenticAdmissionDecision;
  admittedPaths: AgenticQueryPath[];
  deniedPaths: AgenticQueryPath[];
  rowLimit: number;
  vectorTopK: number;
  expansionDepth: number;
  deadlineMs: number;
  reservedBudgetUnits: number;
  consistencyContract: "read_your_write" | "bounded_stale" | "eventual";
  compiledPolicyHash: string;
  estimateHash: string;
  auditHash: string;
  expiresAt: string;
  perceptionCard: AgenticQueryPerceptionCard;
}

export interface AgenticQueryPerceptionCard {
  accountId: string;
  envelopeId: string;
  agentReadableSummary: string;
  visibleEntities: string[];
  semanticTags: string[];
  riskTags: Array<"full_scan" | "recursive_expansion" | "stale_vector" | "tool_side_effect">;
  suggestedActions: string[];
  forbiddenActions: string[];
  evidenceRefs: string[];
}
```

## SQL schema

The schema uses account-leading primary keys and secondary indexes so partition
pruning happens before board or session filters.

```sql
CREATE TABLE agentic_query_intents (
  account_id BIGINT NOT NULL,
  intent_id UUID NOT NULL,
  board_id BIGINT,
  actor_user_id BIGINT NOT NULL,
  agent_session_id UUID NOT NULL,
  purpose_boundary_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  requested_paths TEXT[] NOT NULL,
  natural_language_goal_hash TEXT NOT NULL,
  structured_plan_hash TEXT NOT NULL,
  required_consistency TEXT NOT NULL
    CHECK (required_consistency IN ('read_your_write', 'bounded_stale', 'eventual')),
  max_estimated_rows INTEGER NOT NULL CHECK (max_estimated_rows BETWEEN 1 AND 100000),
  max_vector_top_k INTEGER NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_expansion_depth INTEGER NOT NULL CHECK (max_expansion_depth BETWEEN 0 AND 4),
  deadline_ms INTEGER NOT NULL CHECK (deadline_ms BETWEEN 50 AND 30000),
  tool_call_budget INTEGER CHECK (tool_call_budget BETWEEN 0 AND 50),
  source_watermarks JSONB NOT NULL,
  semantic_hints JSONB NOT NULL,
  procedural_memory_refs JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, intent_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX agentic_query_intents_account_board_created_idx
  ON agentic_query_intents (account_id, board_id, created_at DESC);

CREATE TABLE agentic_query_estimates (
  account_id BIGINT NOT NULL,
  intent_id UUID NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('row', 'columnar', 'vector', 'hybrid', 'tool')),
  estimated_rows BIGINT NOT NULL,
  estimated_columnar_bytes BIGINT NOT NULL,
  estimated_vector_candidates INTEGER NOT NULL,
  estimated_tool_calls INTEGER NOT NULL,
  estimated_cost_units INTEGER NOT NULL,
  requires_full_scan BOOLEAN NOT NULL,
  missing_tenant_predicate BOOLEAN NOT NULL,
  missing_board_predicate BOOLEAN NOT NULL,
  recursive_risk_score INTEGER NOT NULL CHECK (recursive_risk_score BETWEEN 0 AND 100),
  neighbor_impact_score INTEGER NOT NULL CHECK (neighbor_impact_score BETWEEN 0 AND 100),
  estimate_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, intent_id, path),
  FOREIGN KEY (account_id, intent_id)
    REFERENCES agentic_query_intents (account_id, intent_id)
);

CREATE INDEX agentic_query_estimates_rejection_scan_idx
  ON agentic_query_estimates (account_id, requires_full_scan, neighbor_impact_score DESC);

CREATE TABLE agentic_execution_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  intent_id UUID NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('admit', 'admit_degraded', 'queue', 'reject')),
  admitted_paths TEXT[] NOT NULL,
  denied_paths TEXT[] NOT NULL,
  row_limit INTEGER NOT NULL,
  vector_top_k INTEGER NOT NULL,
  expansion_depth INTEGER NOT NULL,
  deadline_ms INTEGER NOT NULL,
  reserved_budget_units INTEGER NOT NULL,
  consistency_contract TEXT NOT NULL
    CHECK (consistency_contract IN ('read_your_write', 'bounded_stale', 'eventual')),
  compiled_policy_hash TEXT NOT NULL,
  estimate_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  audit_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id),
  UNIQUE (account_id, intent_id),
  FOREIGN KEY (account_id, intent_id)
    REFERENCES agentic_query_intents (account_id, intent_id)
);

CREATE INDEX agentic_execution_envelopes_account_decision_idx
  ON agentic_execution_envelopes (account_id, decision, created_at DESC);
```

### pgvector/HNSW compatibility

The governor does not embed arbitrary query text into a global index. It writes a
small, tenant-scoped semantic routing record for admitted envelopes:

```sql
CREATE TABLE agentic_query_semantic_routes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  namespace TEXT NOT NULL,
  board_id BIGINT,
  embedding_model TEXT NOT NULL,
  route_embedding vector(1536) NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  source_watermark_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id, namespace),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_execution_envelopes (account_id, envelope_id)
);

CREATE INDEX agentic_query_semantic_routes_hnsw_idx
  ON agentic_query_semantic_routes
  USING hnsw (route_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Operationally, HNSW searches must route through an account/board partition key
before vector comparison. A global HNSW search filtered after the fact is not
acceptable because it can leak timing information and create noisy-neighbor
load.

## Open API GraphQL shape

Every feature is exposed through monday.com Open API primitives. The GraphQL
contract separates deterministic admission from execution.

```graphql
enum AgenticQueryPath {
  ROW
  COLUMNAR
  VECTOR
  HYBRID
  TOOL
}

enum AgenticAdmissionDecision {
  ADMIT
  ADMIT_DEGRADED
  QUEUE
  REJECT
}

input AgenticQueryIntentInput {
  accountId: ID!
  boardId: ID
  actorUserId: ID!
  agentSessionId: ID!
  purposeBoundaryId: ID!
  idempotencyKey: String!
  requestedPaths: [AgenticQueryPath!]!
  naturalLanguageGoalHash: String!
  structuredPlanHash: String!
  requiredConsistency: String!
  maxEstimatedRows: Int!
  maxVectorTopK: Int!
  maxExpansionDepth: Int!
  deadlineMs: Int!
  toolCallBudget: Int
  sourceWatermarks: JSON!
  semanticHints: JSON!
  proceduralMemoryRefs: JSON!
}

type AgenticQueryPerceptionCard {
  accountId: ID!
  envelopeId: ID!
  agentReadableSummary: String!
  visibleEntities: [String!]!
  semanticTags: [String!]!
  riskTags: [String!]!
  suggestedActions: [String!]!
  forbiddenActions: [String!]!
  evidenceRefs: [String!]!
}

type AgenticExecutionEnvelope {
  accountId: ID!
  envelopeId: ID!
  intentId: ID!
  decision: AgenticAdmissionDecision!
  admittedPaths: [AgenticQueryPath!]!
  deniedPaths: [AgenticQueryPath!]!
  rowLimit: Int!
  vectorTopK: Int!
  expansionDepth: Int!
  deadlineMs: Int!
  reservedBudgetUnits: Int!
  consistencyContract: String!
  compiledPolicyHash: String!
  estimateHash: String!
  auditHash: String!
  expiresAt: ISO8601DateTime!
  perceptionCard: AgenticQueryPerceptionCard!
}

type Mutation {
  prepareAgenticQuery(input: AgenticQueryIntentInput!): AgenticExecutionEnvelope!
  renewAgenticQueryEnvelope(envelopeId: ID!, accountId: ID!): AgenticExecutionEnvelope!
}

type Query {
  agenticQueryEnvelope(accountId: ID!, envelopeId: ID!): AgenticExecutionEnvelope
  agenticQueryAuditTrail(accountId: ID!, intentId: ID!): [AgenticExecutionEnvelope!]!
}
```

`prepareAgenticQuery` is safe to call repeatedly with the same
`(accountId, idempotencyKey)`. The response must be identical while the same
policy hash, plan hash, and watermarks are in effect.

## Deterministic admission rules

The governor evaluates rules in this order:

1. **Tenant scope:** reject if `accountId` is missing or if any nested semantic,
   procedure, source, row, columnar, or tool reference has a different
   `accountId`.
2. **Policy scope:** compile board, workspace, object, tool, and purpose-boundary
   permissions into `compiledPolicyHash`.
3. **Planner estimates:** calculate row count, columnar bytes, vector candidates,
   tool calls, recursion depth, and neighbor impact for each requested path.
4. **Budget reservation:** reserve deterministic cost units before execution.
5. **Consistency contract:** compare requested consistency against source
   watermarks. For `read_your_write`, require row commit version and vector
   materialization watermark if vector results are included.
6. **Envelope sealing:** hash the normalized intent, estimates, compiled policy,
   budget reservation, and previous audit hash into `auditHash`.

No LLM prompt, generated text, or hidden heuristic can override these rules.

## Guardrails for recursive and expensive work

- Reject `maxExpansionDepth > 4` for all tenant workloads.
- Reject vector searches with `maxVectorTopK > 200`, and clamp lower for tenants
  in degraded SLO windows.
- Reject hybrid plans that combine unbounded columnar aggregation with vector
  fan-out.
- Queue rather than admit plans with `neighborImpactScore >= 80` unless the
  request is an interactive user-visible action with remaining priority budget.
- Require a loop-containment fingerprint for repeated agent/session/path
  sequences; reject when the same fingerprint appears more than three times
  within the policy window.
- Require explicit tool budgets for any envelope that can invoke side-effecting
  tools after retrieval.

## Performance check for 1M+ row boards

The following are hard rejections for boards with one million or more rows:

| Risk | Rejection condition | Safer alternative |
| --- | --- | --- |
| Full row scan | Missing `account_id` or board predicate on row path | Use `(account_id, board_id, item_id)` or bounded item ranges |
| Full columnar scan | Aggregation lacks partition, time window, or materialized summary | Use columnar partition pruning and summary tables |
| Vector fan-out | HNSW route is not account/board partitioned before similarity search | Route by `account_id`, `board_id`, and namespace first |
| Recursive expansion | Agent can expand every hit without depth and fan-out limits | Cap expansion depth, per-level fan-out, and deadline |
| Tool cascade | Retrieval result can trigger unbounded tool calls | Require `toolCallBudget` and deterministic tool leases |

Any query estimate with `requiresFullScan = true` must produce
`decision = "reject"` unless a human-admin maintenance purpose boundary
explicitly allows an offline batch job. Interactive agent sessions never get
that bypass.

## Auditability

Each envelope has an audit chain:

```text
auditHash = sha256(
  canonicalJson({
    accountId,
    intentId,
    envelopeId,
    structuredPlanHash,
    compiledPolicyHash,
    estimateHash,
    reservedBudgetUnits,
    consistencyContract,
    sourceWatermarks,
    previousAuditHash
  })
)
```

The audit trail supports deterministic replay for security reviews and customer
support. If the same normalized input produces a different `auditHash`, the
governor must treat it as a regression and block execution until the policy or
planner version difference is explicit.

## Agent perception model

An agent should perceive the envelope as a compact card, not as raw planner
internals. Example:

```json
{
  "accountId": "12345",
  "envelopeId": "4df3b784-30af-41f2-bfd9-5058e3bd6865",
  "agentReadableSummary": "You may retrieve up to 25 tenant-scoped CRM items and 10 semantic memory hits for board 987.",
  "visibleEntities": ["board:987", "group:active-deals", "procedure:crm_follow_up:v3"],
  "semanticTags": ["crm", "renewal", "customer-risk"],
  "riskTags": ["stale_vector"],
  "suggestedActions": ["cite returned evidence refs", "ask for narrower filters before expanding"],
  "forbiddenActions": ["scan all board items", "invoke email tool without a tool lease"],
  "evidenceRefs": ["watermark:row:987:880193", "watermark:vector:987:880100"]
}
```

This representation gives an LLM enough metadata to choose safe next steps while
keeping the data layer deterministic. Procedural memory appears as versioned
references with instruction hashes, so an agent can follow approved instructions
without the database inventing behavior.

## Failure modes and mitigations

- **Stale semantic index:** downgrade to `admit_degraded` when row watermarks are
  fresh but vector materialization is behind the requested bound. The perception
  card must include `stale_vector`.
- **Budget exhaustion:** return `queue` with the next admissible budget window,
  not a partial hidden execution.
- **Policy drift:** reject if the envelope expires or if `compiledPolicyHash`
  changes before execution.
- **Cross-tenant references:** reject the whole intent, even if only one nested
  source reference has a mismatched account.
- **Planner uncertainty:** reject or queue when estimates cannot prove bounded
  access. Do not optimistic-admit agent plans on 1M+ row boards.

## Rollout path

1. Start in audit-only mode for agent sessions that already pass existing API
   permission checks.
2. Enable hard rejection for missing `account_id`, cross-tenant references, and
   unbounded vector `topK`.
3. Add budget reservation and queueing for high neighbor-impact plans.
4. Require sealed envelopes for all autonomous tool-use and write-adjacent
   workflows.
5. Expose perception cards to agents and customer admins through Open API audit
   queries.
