# mondayDB Agentic Loop Containment Plane

## Why this plane exists

Autonomous agents do not usually overload a database with one obviously
expensive request. They overload it through a sequence: retrieve context, call a
tool, inspect the result, retry with a broader filter, retrieve again, and repeat.
Each individual step can look valid, tenant-scoped, and budget-compliant while
the loop as a whole burns shared row, columnar, vector, and tool capacity.

The product trade-off is **agent autonomy vs. enterprise predictability**:

- Letting agents iterate freely improves task completion and reduces user
  intervention.
- Deterministic loop containment preserves 99.99% availability, keeps noisy
  tenants from impacting neighbors, and produces a replayable audit trail.

The Loop Containment Plane adds a deterministic, account-scoped control layer
that detects repeated agent execution patterns before they become recursive
database pressure. It does not decide whether an agent's reasoning is "good."
It only records and enforces observable invariants: request fingerprints, depth,
fanout, repeated semantic intent, cost deltas, and policy thresholds.

## Design goals

1. **Deterministic guardrails:** every allow, degrade, or block decision is
   derived from stable inputs and a versioned policy.
2. **Tenant isolation:** every record, index, and API path is scoped by
   `account_id`.
3. **Hybrid-path awareness:** loops are measured across row, columnar, vector,
   and tool execution steps instead of treating each subsystem in isolation.
4. **Agent-readable feedback:** blocked agents receive a bounded, structured
   explanation they can use to narrow scope or ask for human approval.
5. **Replayable auditability:** decisions can be reconstructed from immutable
   events, policy versions, and hash-linked ledgers.

## Where it fits

```text
Agent / App
    |
    | GraphQL request, vector search, tool call, or transaction intent
    v
Open API Gateway
    |
    v
Agentic Loop Containment Plane
    |-- reads: loop policy, recent loop ledger, query estimates
    |-- emits: containment decision, deterministic audit event
    |
    +--> allow: row / columnar / vector / tool execution
    +--> degrade: lower topK, require narrower filters, async-only execution
    +--> block: return structured remediation packet
```

This plane complements, but does not replace:

- Query budgets: total cost and quota accounting.
- Workload isolation: fair scheduling and admission control.
- Plan verification: static preflight checks for a proposed plan.
- Access policies: authorization and visibility envelopes.

Loop containment is sequence-aware. It asks: "Is this agent repeating or
expanding an execution pattern in a way that risks shared performance?"

## TypeScript contracts

```ts
export type AgenticExecutionPath =
  | "row"
  | "columnar"
  | "vector"
  | "tool"
  | "transaction"
  | "hybrid";

export type LoopContainmentAction =
  | "allow"
  | "degrade"
  | "block"
  | "require_human_review";

export interface AgenticLoopPolicy {
  accountId: string;
  policyId: string;
  version: number;
  name: string;
  enabled: boolean;

  // Procedural memory for agents and planners. These are instructions, not
  // hidden model behavior, and are returned through Open API introspection.
  procedureHints: {
    safeRetryInstructions: string[];
    narrowingInstructions: string[];
    escalationInstructions: string[];
  };

  thresholds: {
    maxDepth: number;
    maxRepeatedFingerprints: number;
    maxFanoutPerRoot: number;
    maxEstimatedRowsScanned: number;
    maxVectorTopKPerStep: number;
    maxToolCallsPerRoot: number;
    maxCostDeltaRatio: number;
  };

  degradation: {
    vectorTopKCap: number;
    rowLimitCap: number;
    columnarAsyncOnly: boolean;
    requireIndexedFilters: boolean;
  };

  audit: {
    createdBy: string;
    createdAt: string;
    reason: string;
  };
}

export interface AgenticLoopStep {
  accountId: string;
  rootExecutionId: string;
  stepId: string;
  parentStepId?: string;
  agentId: string;
  actorUserId?: string;
  path: AgenticExecutionPath;

  // Stable hash over normalized GraphQL operation, filters, selected board IDs,
  // tool name, vector index ID, and visible policy version.
  requestFingerprint: string;

  // Optional semantic fingerprint supports pgvector/HNSW comparison of
  // "same intent, different wording" retries without making enforcement
  // probabilistic. Enforcement uses persisted nearest-neighbor result IDs and
  // distance bands captured at decision time.
  semanticFingerprintRef?: {
    embeddingId: string;
    modelVersion: string;
    vectorIndexId: string;
    distanceBand: "exact" | "near" | "related";
  };

  estimates: {
    estimatedRowsScanned: number;
    estimatedBytesRead: number;
    estimatedVectorCandidates: number;
    estimatedToolCostUnits: number;
    timeoutMs: number;
  };

  observed?: {
    actualRowsScanned: number;
    actualBytesRead: number;
    actualDurationMs: number;
    resultCount: number;
  };

  createdAt: string;
}

export interface AgenticLoopDecision {
  accountId: string;
  rootExecutionId: string;
  stepId: string;
  policyId: string;
  policyVersion: number;
  action: LoopContainmentAction;
  reasonCode:
    | "within_policy"
    | "max_depth"
    | "repeated_fingerprint"
    | "semantic_retry_loop"
    | "fanout_exceeded"
    | "estimated_scan_too_large"
    | "vector_topk_too_large"
    | "tool_call_loop"
    | "cost_delta_spike";
  deterministicInputsHash: string;
  previousDecisionHash?: string;

  remediation: {
    message: string;
    suggestedFilters: string[];
    suggestedTopK?: number;
    requireHumanReview: boolean;
  };

  createdAt: string;
}
```

## SQL schema

The schema is shown with PostgreSQL syntax and pgvector compatibility. In
mondayDB, the same logical records can be split across row storage for hot
transactions and columnar storage for analytics over containment outcomes.

```sql
CREATE TABLE agentic_loop_policies (
  account_id              BIGINT NOT NULL,
  policy_id               UUID NOT NULL,
  version                 INTEGER NOT NULL,
  name                    TEXT NOT NULL,
  enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  procedure_hints_json    JSONB NOT NULL,
  thresholds_json         JSONB NOT NULL,
  degradation_json        JSONB NOT NULL,
  created_by              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason                  TEXT NOT NULL,
  policy_hash             BYTEA NOT NULL,
  PRIMARY KEY (account_id, policy_id, version)
);

CREATE TABLE agentic_loop_steps (
  account_id                    BIGINT NOT NULL,
  root_execution_id             UUID NOT NULL,
  step_id                       UUID NOT NULL,
  parent_step_id                UUID,
  agent_id                      TEXT NOT NULL,
  actor_user_id                 TEXT,
  path                          TEXT NOT NULL,
  request_fingerprint           BYTEA NOT NULL,
  semantic_embedding_id         UUID,
  semantic_model_version        TEXT,
  semantic_vector_index_id      UUID,
  semantic_distance_band        TEXT,
  estimated_rows_scanned        BIGINT NOT NULL,
  estimated_bytes_read          BIGINT NOT NULL,
  estimated_vector_candidates   INTEGER NOT NULL,
  estimated_tool_cost_units     INTEGER NOT NULL,
  timeout_ms                    INTEGER NOT NULL,
  actual_rows_scanned           BIGINT,
  actual_bytes_read             BIGINT,
  actual_duration_ms            INTEGER,
  result_count                  INTEGER,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, root_execution_id, step_id)
);

CREATE INDEX agentic_loop_steps_account_root_created_idx
  ON agentic_loop_steps (account_id, root_execution_id, created_at DESC);

CREATE INDEX agentic_loop_steps_account_fingerprint_idx
  ON agentic_loop_steps (
    account_id,
    root_execution_id,
    request_fingerprint,
    created_at DESC
  );

CREATE TABLE agentic_loop_decisions (
  account_id                 BIGINT NOT NULL,
  root_execution_id          UUID NOT NULL,
  step_id                    UUID NOT NULL,
  policy_id                  UUID NOT NULL,
  policy_version             INTEGER NOT NULL,
  action                     TEXT NOT NULL,
  reason_code                TEXT NOT NULL,
  deterministic_inputs_hash  BYTEA NOT NULL,
  previous_decision_hash     BYTEA,
  remediation_json           JSONB NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, root_execution_id, step_id),
  FOREIGN KEY (account_id, policy_id, policy_version)
    REFERENCES agentic_loop_policies (account_id, policy_id, version)
);

CREATE INDEX agentic_loop_decisions_account_action_created_idx
  ON agentic_loop_decisions (account_id, action, created_at DESC);

-- Optional semantic retry discovery. This is not the source of truth for
-- authorization or enforcement; it helps identify similar retry intent.
CREATE TABLE agentic_loop_semantic_fingerprints (
  account_id          BIGINT NOT NULL,
  embedding_id        UUID NOT NULL,
  root_execution_id   UUID NOT NULL,
  step_id             UUID NOT NULL,
  model_version       TEXT NOT NULL,
  embedding           vector(1536) NOT NULL,
  metadata_json       JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id)
);

CREATE INDEX agentic_loop_semantic_hnsw_idx
  ON agentic_loop_semantic_fingerprints
  USING hnsw (embedding vector_cosine_ops);
```

### Partitioning and tenancy

All primary and secondary indexes begin with `account_id` where the access path
is tenant-facing. For high-volume tenants, `agentic_loop_steps` and
`agentic_loop_decisions` should be physically partitioned by `(account_id,
created_at)` or routed into tenant shards that preserve account-local scans.
Vector indexes must be tenant-filtered before HNSW candidate expansion or
maintained as tenant/account-class partitions.

## Open API GraphQL shape

Every field is deterministic. Semantic search returns persisted candidate IDs,
distances, and model versions rather than hidden decisions.

```graphql
enum AgenticLoopAction {
  ALLOW
  DEGRADE
  BLOCK
  REQUIRE_HUMAN_REVIEW
}

input AgenticLoopStepInput {
  accountId: ID!
  rootExecutionId: ID!
  stepId: ID!
  parentStepId: ID
  agentId: String!
  path: String!
  normalizedOperationHash: String!
  selectedBoardIds: [ID!]!
  estimatedRowsScanned: BigInt!
  estimatedBytesRead: BigInt!
  estimatedVectorCandidates: Int!
  estimatedToolCostUnits: Int!
  timeoutMs: Int!
}

type AgenticLoopRemediation {
  message: String!
  suggestedFilters: [String!]!
  suggestedTopK: Int
  requireHumanReview: Boolean!
}

type AgenticLoopDecision {
  accountId: ID!
  rootExecutionId: ID!
  stepId: ID!
  action: AgenticLoopAction!
  reasonCode: String!
  policyVersion: Int!
  deterministicInputsHash: String!
  remediation: AgenticLoopRemediation!
  createdAt: ISO8601DateTime!
}

type Mutation {
  preflightAgenticLoopStep(input: AgenticLoopStepInput!): AgenticLoopDecision!
  recordAgenticLoopObservation(input: AgenticLoopObservationInput!): Boolean!
}

type Query {
  agenticLoopPolicy(accountId: ID!, policyId: ID!): AgenticLoopPolicy!
  agenticLoopDecisions(
    accountId: ID!
    rootExecutionId: ID!
    limit: Int = 50
  ): [AgenticLoopDecision!]!
}
```

## Deterministic decision flow

1. Normalize the operation into a stable request fingerprint.
2. Load the active policy by `(account_id, policy_id, version)`.
3. Read recent steps by `(account_id, root_execution_id)` with a bounded limit.
4. Compare depth, fanout, repeated fingerprints, estimates, and cost deltas.
5. Optionally resolve persisted semantic retry candidates from the tenant-scoped
   vector index.
6. Produce one action:
   - `allow` when all thresholds pass.
   - `degrade` when safe caps can reduce blast radius.
   - `block` when execution would exceed hard safety limits.
   - `require_human_review` when policy demands explicit approval.
7. Write the step and decision in the same transaction as a hash-linked audit
   record.

No large language model is part of this decision path.

## Procedural memory for agents

The plane stores explicit instructions that agents can retrieve and follow:

```json
{
  "safeRetryInstructions": [
    "Do not retry the same board query more than twice without adding an indexed filter.",
    "If vector retrieval returns low-confidence results, reduce topK before expanding board scope."
  ],
  "narrowingInstructions": [
    "Prefer account_id + board_id + updated_at windows for row reads.",
    "Use schema contract fields before free-form JSON predicates."
  ],
  "escalationInstructions": [
    "Request human review when a blocked step needs more than 1000000 estimated rows.",
    "Attach the deterministicInputsHash to support tickets and audit views."
  ]
}
```

Agents perceive this as a capability envelope: what paths are available, how to
retry safely, and when to stop. This keeps behavior predictable while still
giving an LLM actionable feedback.

## Semantic retrieval compatibility

Semantic fingerprints can be embedded for RAG-style loop detection:

- Text to embed: normalized intent summary, visible board/schema tags, tool
  name, and retrieval purpose.
- Metadata tags: `account_id`, `root_execution_id`, `step_id`, `path`,
  `board_ids`, `policy_version`, and `created_at`.
- HNSW usage: nearest-neighbor lookup finds similar retry intent within the
  same tenant and root execution.

Enforcement must not depend on an unbounded vector search. The query always
contains `account_id`, `root_execution_id`, a capped `topK`, and a max distance
band recorded in the decision. For large tenants, use per-tenant or per-shard
HNSW indexes to avoid cross-tenant candidate expansion.

## Performance check for boards with 1M+ rows

The following patterns must be rejected or degraded:

- Missing `account_id` in any loop step, policy, decision, or vector lookup.
- Board row reads without `board_id` or another indexed narrowing predicate.
- JSON predicates that are not backed by schema contracts or materialized
  indexes.
- Vector searches with unbounded `topK` or without tenant-local filtering.
- Columnar aggregations triggered repeatedly from the same root execution when
  estimates keep increasing.
- Tool loops that read broad board context after every tool result.

Required safeguards:

- `agentic_loop_steps_account_root_created_idx` keeps recent-loop reads bounded.
- `agentic_loop_steps_account_fingerprint_idx` avoids scanning all steps to
  detect repeated requests.
- Decision queries must include `(account_id, root_execution_id)` or
  `(account_id, action, created_at)`.
- Analytics over containment outcomes should run from columnar replicas or
  pre-aggregated rollups, not hot transactional tables.

Any query over loop history that filters only by `created_at` risks a full table
scan across tenants and must be blocked in production paths.

## Audit model

Each decision emits an immutable audit event:

```ts
export interface AgenticLoopAuditEvent {
  accountId: string;
  eventId: string;
  rootExecutionId: string;
  stepId: string;
  policyId: string;
  policyVersion: number;
  action: LoopContainmentAction;
  reasonCode: string;
  deterministicInputsHash: string;
  previousDecisionHash?: string;
  decisionHash: string;
  createdAt: string;
}
```

`decisionHash` is computed from:

- Account ID.
- Root execution ID and step ID.
- Normalized request fingerprint.
- Policy ID and version.
- Threshold values used.
- Prior matching step IDs and fingerprints.
- Optional semantic candidate IDs and distance bands.
- Final action and remediation payload.

This lets support, compliance, and customers replay why an agent was blocked
without needing model traces.

## Rollout strategy

1. **Observe-only:** write loop steps and decisions with `allow` actions, but do
   not enforce blocks. Validate estimates against actuals.
2. **Soft degradation:** cap `topK`, row limits, and sync columnar execution for
   high-confidence loops.
3. **Hard containment:** block repeated fingerprints, excessive fanout, and
   policy-defined recursive tool patterns.
4. **Customer controls:** expose policy thresholds and decision history through
   Open API and admin audit views.

## Success metrics

- Reduction in repeated agent requests per root execution.
- Lower p95 and p99 latency variance for tenants with active agents.
- Fewer row and vector reads from blocked recursive patterns.
- Zero cross-tenant loop-decision reads in audit sampling.
- High remediation success: agents complete tasks after narrowing scope rather
  than repeatedly hitting hard blocks.

