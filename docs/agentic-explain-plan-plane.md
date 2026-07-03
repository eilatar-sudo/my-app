# Agentic Explain Plan Plane

## Why before how

Autonomous agents need to understand what mondayDB will read, retrieve, aggregate, or trigger before they execute. Traditional `EXPLAIN` output is useful to engineers, but not sufficient for the agentic era: it does not describe procedural memory usage, vector recall boundaries, tenant guardrails, or neighbor-impact risk in a way that can be audited and safely exposed through the monday.com Open API.

The product trade-off is latency versus predictability. Building an explain packet adds a small deterministic preflight cost, but it prevents unbounded agent plans from reaching row, columnar, vector, or tool execution paths. For enterprise customers, that preflight cost is justified when it protects 99.99% availability, keeps ACID writes deterministic, and creates a replayable trace of why an agent was allowed, degraded, queued, or rejected.

The Agentic Explain Plan Plane makes every autonomous workload explainable without moving probabilistic behavior into the database engine. LLMs may propose an intent, but mondayDB compiles a deterministic, tenant-scoped explain packet that includes operator estimates, semantic retrieval bounds, procedural memory references, budget decisions, and audit hashes.

## Design goals

- Scope every explain request by `account_id`; no cross-tenant plan fragments or vector candidates are ever visible.
- Keep mondayDB deterministic: explain packets are compiled from stable planner metadata, source watermarks, policy versions, and request hashes.
- Expose the feature through the Open API GraphQL surface so agents and admin tools can preflight the same workload.
- Represent semantic retrieval as bounded, HNSW-compatible candidate generation followed by deterministic row or columnar verification.
- Encode procedural memory as explicit instructions and constraints, not hidden prompts.
- Reject or degrade any plan that could full-scan a board with 1M+ rows or recursively expand without a bounded depth.

## TypeScript contracts

```ts
export type AgenticExplainDecision = "ALLOW" | "DEGRADE" | "QUEUE" | "REJECT";
export type AgenticOperatorKind =
  | "ROW_POINT_LOOKUP"
  | "ROW_RANGE_SCAN"
  | "COLUMNAR_AGGREGATION"
  | "VECTOR_HNSW_SEARCH"
  | "SEMANTIC_JOIN_VERIFY"
  | "PROCEDURE_MEMORY_LOOKUP"
  | "TOOL_PREFLIGHT"
  | "WRITE_INTENT_PREPARE";

export interface AgenticExplainRequest {
  account_id: string;
  board_id?: string;
  actor_user_id?: string;
  agent_session_id: string;
  purpose_boundary_id: string;
  idempotency_key: string;
  requested_consistency: "READ_YOUR_WRITE" | "BOUNDED_STALE" | "ANALYTICS";
  max_vector_top_k: number;
  max_expansion_depth: number;
  deadline_ms: number;
  budget_token_hash: string;
  intent_summary: string;
  proposed_operations: AgenticProposedOperation[];
}

export interface AgenticProposedOperation {
  operation_id: string;
  operator_kind: AgenticOperatorKind;
  target_ref: {
    board_id?: string;
    item_id?: string;
    column_id?: string;
    memory_namespace?: string;
    tool_name?: string;
  };
  filters: Record<string, unknown>;
  requested_fields: string[];
  semantic_query?: {
    embedding_model_id: string;
    namespace: string;
    query_text_hash: string;
    top_k: number;
  };
}

export interface AgenticExplainPacket {
  explain_plan_id: string;
  account_id: string;
  agent_session_id: string;
  purpose_boundary_id: string;
  decision: AgenticExplainDecision;
  decision_reason_codes: string[];
  source_watermarks: {
    row_store_lsn: string;
    columnar_snapshot_id?: string;
    vector_materialized_lsn?: string;
    procedure_memory_version?: string;
  };
  operator_estimates: AgenticOperatorEstimate[];
  semantic_routes: AgenticSemanticRoute[];
  procedure_memory_refs: AgenticProcedureMemoryRef[];
  guardrail_evaluations: AgenticGuardrailEvaluation[];
  perception_card: AgenticExplainPerceptionCard;
  audit: AgenticExplainAuditEnvelope;
}

export interface AgenticOperatorEstimate {
  operation_id: string;
  operator_kind: AgenticOperatorKind;
  estimated_rows_read: bigint;
  estimated_rows_returned: bigint;
  estimated_vector_candidates?: number;
  estimated_cpu_ms: number;
  estimated_io_bytes: bigint;
  uses_account_id_prefix: boolean;
  uses_board_id_prefix: boolean;
  index_name?: string;
  full_scan_risk: "NONE" | "SMALL_BOARD_ONLY" | "REJECT_ON_1M_PLUS_ROWS";
}

export interface AgenticSemanticRoute {
  operation_id: string;
  account_id: string;
  namespace: string;
  vector_partition_key: string;
  hnsw_index_name: string;
  top_k: number;
  ef_search_cap: number;
  verification_operator_id: string;
}

export interface AgenticProcedureMemoryRef {
  memory_id: string;
  version: number;
  instruction_hash: string;
  applies_to_operation_ids: string[];
  required_guardrails: string[];
}

export interface AgenticGuardrailEvaluation {
  guardrail_id: string;
  result: "PASS" | "WARN" | "FAIL";
  reason_code: string;
  deterministic_input_hash: string;
}

export interface AgenticExplainPerceptionCard {
  title: string;
  entity_tags: string[];
  risk_tags: string[];
  suggested_actions: string[];
  forbidden_actions: string[];
  human_readable_summary: string;
}

export interface AgenticExplainAuditEnvelope {
  request_hash: string;
  plan_hash: string;
  policy_version: string;
  previous_audit_hash?: string;
  audit_hash: string;
  created_at: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_explain_plans (
  account_id BIGINT NOT NULL,
  explain_plan_id UUID NOT NULL,
  agent_session_id UUID NOT NULL,
  purpose_boundary_id UUID NOT NULL,
  actor_user_id BIGINT,
  board_id BIGINT,
  decision TEXT NOT NULL CHECK (decision IN ('ALLOW', 'DEGRADE', 'QUEUE', 'REJECT')),
  decision_reason_codes JSONB NOT NULL,
  requested_consistency TEXT NOT NULL,
  max_vector_top_k INTEGER NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 100),
  max_expansion_depth INTEGER NOT NULL CHECK (max_expansion_depth BETWEEN 0 AND 4),
  deadline_ms INTEGER NOT NULL CHECK (deadline_ms BETWEEN 1 AND 30000),
  budget_token_hash BYTEA NOT NULL,
  source_watermarks JSONB NOT NULL,
  perception_card JSONB NOT NULL,
  request_hash BYTEA NOT NULL,
  plan_hash BYTEA NOT NULL,
  policy_version TEXT NOT NULL,
  previous_audit_hash BYTEA,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, explain_plan_id)
);

CREATE TABLE agentic_explain_operator_estimates (
  account_id BIGINT NOT NULL,
  explain_plan_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  operator_kind TEXT NOT NULL,
  board_id BIGINT,
  estimated_rows_read BIGINT NOT NULL,
  estimated_rows_returned BIGINT NOT NULL,
  estimated_vector_candidates INTEGER,
  estimated_cpu_ms INTEGER NOT NULL,
  estimated_io_bytes BIGINT NOT NULL,
  uses_account_id_prefix BOOLEAN NOT NULL,
  uses_board_id_prefix BOOLEAN NOT NULL,
  index_name TEXT,
  full_scan_risk TEXT NOT NULL CHECK (
    full_scan_risk IN ('NONE', 'SMALL_BOARD_ONLY', 'REJECT_ON_1M_PLUS_ROWS')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, explain_plan_id, operation_id),
  FOREIGN KEY (account_id, explain_plan_id)
    REFERENCES agentic_explain_plans (account_id, explain_plan_id)
);

CREATE TABLE agentic_explain_semantic_routes (
  account_id BIGINT NOT NULL,
  explain_plan_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  namespace TEXT NOT NULL,
  vector_partition_key TEXT NOT NULL,
  hnsw_index_name TEXT NOT NULL,
  top_k INTEGER NOT NULL CHECK (top_k BETWEEN 1 AND 100),
  ef_search_cap INTEGER NOT NULL CHECK (ef_search_cap BETWEEN 10 AND 500),
  verification_operation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, explain_plan_id, operation_id),
  FOREIGN KEY (account_id, explain_plan_id, operation_id)
    REFERENCES agentic_explain_operator_estimates (account_id, explain_plan_id, operation_id)
);

CREATE INDEX idx_agentic_explain_plans_account_session
  ON agentic_explain_plans (account_id, agent_session_id, created_at DESC);

CREATE INDEX idx_agentic_explain_plans_account_board
  ON agentic_explain_plans (account_id, board_id, created_at DESC)
  WHERE board_id IS NOT NULL;

CREATE INDEX idx_agentic_explain_estimates_account_board_risk
  ON agentic_explain_operator_estimates (account_id, board_id, full_scan_risk)
  WHERE board_id IS NOT NULL;
```

Vector indexes stay tenant-routed rather than global:

```sql
-- Example physical partition naming; each partition is account-hash scoped.
CREATE INDEX hnsw_agentic_explain_memory_account_042
  ON agentic_memory_embedding_account_042
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

## Open API GraphQL shape

```graphql
input AgenticExplainInput {
  accountId: ID!
  boardId: ID
  agentSessionId: ID!
  purposeBoundaryId: ID!
  idempotencyKey: String!
  requestedConsistency: AgenticConsistency!
  maxVectorTopK: Int!
  maxExpansionDepth: Int!
  deadlineMs: Int!
  budgetTokenHash: String!
  intentSummary: String!
  proposedOperations: [AgenticProposedOperationInput!]!
}

type Mutation {
  agenticExplainPlan(input: AgenticExplainInput!): AgenticExplainPacket!
}

type Query {
  agenticExplainPlan(accountId: ID!, explainPlanId: ID!): AgenticExplainPacket
  agenticExplainPlansForSession(accountId: ID!, agentSessionId: ID!, first: Int!): AgenticExplainPlanConnection!
}
```

GraphQL resolvers must require `accountId` and apply it as the leading predicate on every row-store, columnar metadata, vector-route, and audit lookup. The API returns explain packets only; it does not execute the proposed workload.

## Deterministic compile flow

1. Hash the normalized GraphQL input, actor identity, purpose boundary, and policy version into `request_hash`.
2. Resolve account-scoped board metadata, row-store indexes, columnar snapshots, vector partitions, and procedure memory versions.
3. Compile each proposed operation into an operator estimate using deterministic planner statistics and source watermarks.
4. Build semantic routes only when the request includes `account_id`, a bounded namespace, `top_k <= max_vector_top_k`, and a deterministic verification operator.
5. Evaluate guardrails for recursion depth, budget, deadline, consistency, tool scopes, write intent safety, and neighbor-impact risk.
6. Derive `decision` from guardrail results using a fixed precedence: `FAIL -> REJECT`, capacity pressure -> `QUEUE`, stale vector materialization -> `DEGRADE`, otherwise `ALLOW`.
7. Hash the final packet into `plan_hash`, chain it with `previous_audit_hash`, and persist the explain record.

## Performance checks for 1M+ row boards

- Reject row operators where `uses_account_id_prefix = false`; this is a multi-tenancy bug, not a performance warning.
- Reject board-scoped row scans on boards with 1M+ rows unless `uses_board_id_prefix = true` and an indexed predicate narrows the candidate set.
- Reject vector routes without an account-hash partition key, bounded namespace, and `top_k <= 100`.
- Reject semantic joins where `estimated_vector_candidates * estimated_rows_returned` exceeds the account budget or lacks a verification index.
- Degrade columnar aggregations to queued execution when the requested snapshot is unavailable and the row-store fallback would scan more than the board threshold.
- Cap `max_expansion_depth` at 4 and treat recursive explain compilation as a new budgeted operation with its own loop-containment fingerprint.
- Store estimates as `BIGINT`/`bigint` to avoid overflow when boards approach billions of rows.

## Agentic guardrails

- **Procedural memory:** Procedure references are versioned and hashed. Agents receive instructions such as "verify semantic hits through operation `op_7`" rather than free-form hidden prompts.
- **Semantic retrieval:** HNSW is used only for candidate discovery. Every semantic hit must route through an account-scoped deterministic verification operator before it can influence a write, tool call, or evidence packet.
- **Tool readiness:** Tool preflight operators expose scope, idempotency, and budget requirements without invoking the tool.
- **Recursive containment:** Explain packets include `max_expansion_depth`, loop fingerprints, and forbidden actions so an agent cannot recursively ask for broader plans until neighbor-impact limits are exhausted.
- **Auditability:** `request_hash`, `plan_hash`, and `audit_hash` allow deterministic replay of the preflight decision using the same planner statistics and policy version.

## How an agent perceives the packet

An LLM should receive a compact perception card, not raw planner internals:

```json
{
  "title": "Explain plan for updating overdue renewal items",
  "entity_tags": ["board:renewals", "workflow:customer-success", "memory:renewal-playbook"],
  "risk_tags": ["columnar_snapshot_stale", "tool_write_requires_preflight"],
  "suggested_actions": [
    "Use bounded semantic route semantic_op_2 with top_k=20",
    "Verify item IDs through row lookup op_3 before preparing writes"
  ],
  "forbidden_actions": [
    "Do not increase maxExpansionDepth",
    "Do not run row-store fallback aggregation on the full board"
  ],
  "human_readable_summary": "The plan is degraded because the vector index is current but the columnar snapshot is behind the requested watermark. Writes require a separate transaction intent."
}
```

This keeps the database predictable while giving agents enough metadata to plan responsibly.

## Rollout considerations

- Start in observe-only mode for agent sessions, returning explain packets without gating execution.
- Promote to enforcement for tool and write-intent paths first, because blast radius is highest.
- Add admin analytics for rejected reason codes by account, board size, operator kind, and vector namespace.
- Use explain packets as training and regression fixtures for agent evaluations, but never let model feedback mutate planner decisions directly.
