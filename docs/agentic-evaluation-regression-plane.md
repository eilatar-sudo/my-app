# mondayDB Agentic Evaluation and Regression Plane

## Why this matters before the how

Autonomous agents will only be trusted on mondayDB if their behavior can be
tested, replayed, and bounded before production execution. The product trade-off
is latency versus assurance:

- **Latency:** every pre-production evaluation adds planner, retrieval, and
  simulation work before an agent can act.
- **Consistency and trust:** deterministic evaluation catches unsafe plans,
  tenant-scope violations, retrieval drift, and recursive query explosions before
  they affect live boards.

The recommended boundary is a dedicated **Agentic Evaluation and Regression
Plane**. It does not make probabilistic decisions inside the database engine.
Instead, it stores deterministic test cases, expected retrieval contracts, plan
budgets, replay inputs, and audit hashes that agents and GraphQL clients can use
to validate new procedures, prompts, tool policies, and semantic indexes.

## Design goals

1. **Tenant isolation by construction:** every record is scoped by `account_id`
   and indexes are prefixed by `account_id`.
2. **Deterministic replay:** each evaluation run references immutable source
   watermarks, input hashes, model metadata, and expected database effects.
3. **Vector-compatible regression suites:** semantic fixtures can be embedded and
   searched with pgvector/HNSW without mixing tenants.
4. **No magic in the engine:** the database stores contracts and results; LLMs
   may interpret them, but mondayDB admission, planning, and audit decisions stay
   deterministic.
5. **Production safety:** evaluation workloads are budgeted separately from live
   row, columnar, and vector paths so recursive agent tests cannot starve
   neighboring tenants.

## Logical model

```ts
type EvaluationStatus =
  | "draft"
  | "active"
  | "archived";

type EvaluationRunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "blocked";

type EvaluationTarget =
  | "retrieval"
  | "plan_verification"
  | "tool_execution"
  | "transaction_intent"
  | "memory_compaction";

interface AgenticEvaluationSuite {
  accountId: string;
  suiteId: string;
  name: string;
  status: EvaluationStatus;
  targets: EvaluationTarget[];
  ownerUserId: string;
  boardIds: string[];
  procedureMemoryRefs: string[];
  semanticTags: string[];
  maxRunBudgetMs: number;
  maxVectorTopK: number;
  maxRecursiveDepth: number;
  createdAt: string;
  updatedAt: string;
}

interface AgenticEvaluationCase {
  accountId: string;
  suiteId: string;
  caseId: string;
  target: EvaluationTarget;
  naturalLanguageGoal: string;
  deterministicInputHash: string;
  sourceWatermark: {
    rowStoreLsn: string;
    columnarSnapshotId?: string;
    vectorIndexVersion?: string;
  };
  requiredPredicates: {
    accountId: string;
    boardIds: string[];
    itemIds?: string[];
  };
  expectedPlanShape: {
    allowedOperators: string[];
    forbiddenOperators: string[];
    maxEstimatedRows: number;
    maxEstimatedCostUnits: number;
  };
  expectedRetrieval?: {
    minPrecisionAtK: number;
    maxTopK: number;
    requiredContextRefs: string[];
    forbiddenContextRefs: string[];
  };
  expectedWriteIntent?: {
    allowedMutationTypes: string[];
    maxRowsTouched: number;
    requiresHumanReview: boolean;
  };
  semanticMetadata: {
    embeddingRef?: string;
    tags: string[];
    agentReadableSummary: string;
  };
  createdAt: string;
}

interface AgenticEvaluationRun {
  accountId: string;
  suiteId: string;
  runId: string;
  status: EvaluationRunStatus;
  triggeredByUserId: string;
  agentProfileId: string;
  modelFingerprint: string;
  caseResults: AgenticEvaluationCaseResult[];
  budgetLedgerRef: string;
  auditHash: string;
  previousAuditHash?: string;
  startedAt: string;
  completedAt?: string;
}

interface AgenticEvaluationCaseResult {
  caseId: string;
  status: "passed" | "failed" | "blocked";
  observedPlanHash: string;
  observedRetrievalRefs: string[];
  observedEstimatedRows: number;
  observedCostUnits: number;
  guardrailViolations: string[];
  deterministicDiff: Record<string, unknown>;
}
```

## SQL storage contract

The row store owns suite definitions and run ledgers because these records are
transactional, auditable, and frequently updated. Columnar projections can serve
fleet-level reporting, while vector indexes support semantic lookup of reusable
test cases.

```sql
CREATE TABLE agentic_evaluation_suites (
  account_id            BIGINT NOT NULL,
  suite_id              UUID NOT NULL,
  name                  TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  targets               TEXT[] NOT NULL,
  owner_user_id         BIGINT NOT NULL,
  board_ids             BIGINT[] NOT NULL,
  procedure_memory_refs UUID[] NOT NULL DEFAULT '{}',
  semantic_tags         TEXT[] NOT NULL DEFAULT '{}',
  max_run_budget_ms     INTEGER NOT NULL CHECK (max_run_budget_ms BETWEEN 100 AND 300000),
  max_vector_top_k      INTEGER NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 100),
  max_recursive_depth   INTEGER NOT NULL CHECK (max_recursive_depth BETWEEN 0 AND 5),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, suite_id)
);

CREATE TABLE agentic_evaluation_cases (
  account_id                 BIGINT NOT NULL,
  suite_id                   UUID NOT NULL,
  case_id                    UUID NOT NULL,
  target                     TEXT NOT NULL,
  natural_language_goal      TEXT NOT NULL,
  deterministic_input_hash   BYTEA NOT NULL,
  source_watermark           JSONB NOT NULL,
  required_predicates        JSONB NOT NULL,
  expected_plan_shape        JSONB NOT NULL,
  expected_retrieval         JSONB,
  expected_write_intent      JSONB,
  semantic_metadata          JSONB NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, suite_id, case_id),
  FOREIGN KEY (account_id, suite_id)
    REFERENCES agentic_evaluation_suites (account_id, suite_id)
);

CREATE TABLE agentic_evaluation_runs (
  account_id          BIGINT NOT NULL,
  suite_id            UUID NOT NULL,
  run_id              UUID NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'blocked')),
  triggered_by_user_id BIGINT NOT NULL,
  agent_profile_id    UUID NOT NULL,
  model_fingerprint   TEXT NOT NULL,
  budget_ledger_ref   UUID NOT NULL,
  audit_hash          BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  PRIMARY KEY (account_id, suite_id, run_id),
  FOREIGN KEY (account_id, suite_id)
    REFERENCES agentic_evaluation_suites (account_id, suite_id)
);

CREATE TABLE agentic_evaluation_case_results (
  account_id              BIGINT NOT NULL,
  suite_id                UUID NOT NULL,
  run_id                  UUID NOT NULL,
  case_id                 UUID NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'blocked')),
  observed_plan_hash      BYTEA NOT NULL,
  observed_retrieval_refs UUID[] NOT NULL DEFAULT '{}',
  observed_estimated_rows BIGINT NOT NULL,
  observed_cost_units     BIGINT NOT NULL,
  guardrail_violations    TEXT[] NOT NULL DEFAULT '{}',
  deterministic_diff      JSONB NOT NULL,
  PRIMARY KEY (account_id, suite_id, run_id, case_id),
  FOREIGN KEY (account_id, suite_id, run_id)
    REFERENCES agentic_evaluation_runs (account_id, suite_id, run_id)
);

CREATE TABLE agentic_evaluation_case_embeddings (
  account_id     BIGINT NOT NULL,
  suite_id       UUID NOT NULL,
  case_id        UUID NOT NULL,
  embedding_ref  UUID NOT NULL,
  embedding      vector(1536) NOT NULL,
  index_version  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, suite_id, case_id),
  FOREIGN KEY (account_id, suite_id, case_id)
    REFERENCES agentic_evaluation_cases (account_id, suite_id, case_id)
);

CREATE INDEX agentic_eval_suites_account_status_idx
  ON agentic_evaluation_suites (account_id, status, updated_at DESC);

CREATE INDEX agentic_eval_cases_account_target_idx
  ON agentic_evaluation_cases (account_id, target, created_at DESC);

CREATE INDEX agentic_eval_runs_account_status_idx
  ON agentic_evaluation_runs (account_id, status, started_at DESC);

CREATE INDEX agentic_eval_case_embeddings_hnsw_idx
  ON agentic_evaluation_case_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Multi-tenant vector guardrail

The HNSW index must be queried only after applying the tenant predicate:

```sql
SELECT case_id, suite_id
FROM agentic_evaluation_case_embeddings
WHERE account_id = $1
ORDER BY embedding <=> $2
LIMIT LEAST($3, 25);
```

If the execution engine cannot guarantee `account_id = $1` before vector
ranking, use account-level partitions or filtered per-tenant index shards for
large tenants.

## Open API GraphQL shape

Every feature is exposed through monday.com Open API semantics. The GraphQL layer
must inject `account_id` from the authenticated token; clients cannot override it.

```graphql
enum AgenticEvaluationTarget {
  RETRIEVAL
  PLAN_VERIFICATION
  TOOL_EXECUTION
  TRANSACTION_INTENT
  MEMORY_COMPACTION
}

input AgenticEvaluationCaseInput {
  suiteId: ID!
  target: AgenticEvaluationTarget!
  naturalLanguageGoal: String!
  boardIds: [ID!]!
  expectedPlanShape: AgenticExpectedPlanShapeInput!
  expectedRetrieval: AgenticExpectedRetrievalInput
  expectedWriteIntent: AgenticExpectedWriteIntentInput
  semanticTags: [String!]!
}

type AgenticEvaluationSuite {
  id: ID!
  name: String!
  status: String!
  targets: [AgenticEvaluationTarget!]!
  boardIds: [ID!]!
  semanticTags: [String!]!
  maxRunBudgetMs: Int!
  maxVectorTopK: Int!
  maxRecursiveDepth: Int!
}

type AgenticEvaluationRun {
  id: ID!
  suiteId: ID!
  status: String!
  modelFingerprint: String!
  budgetLedgerRef: ID!
  auditHash: String!
  startedAt: ISO8601DateTime!
  completedAt: ISO8601DateTime
  results: [AgenticEvaluationCaseResult!]!
}

type Mutation {
  createAgenticEvaluationSuite(
    name: String!
    targets: [AgenticEvaluationTarget!]!
    boardIds: [ID!]!
    maxRunBudgetMs: Int!
    maxVectorTopK: Int!
    maxRecursiveDepth: Int!
  ): AgenticEvaluationSuite!

  addAgenticEvaluationCase(
    input: AgenticEvaluationCaseInput!
  ): ID!

  runAgenticEvaluationSuite(
    suiteId: ID!
    agentProfileId: ID!
    modelFingerprint: String!
    sourceWatermark: AgenticSourceWatermarkInput!
  ): AgenticEvaluationRun!
}

type Query {
  agenticEvaluationSuite(id: ID!): AgenticEvaluationSuite
  agenticEvaluationRuns(suiteId: ID!, limit: Int = 20): [AgenticEvaluationRun!]!
  searchAgenticEvaluationCases(
    query: String!
    targets: [AgenticEvaluationTarget!]
    topK: Int = 10
  ): [AgenticEvaluationCase!]!
}
```

## Execution flow

1. **Author deterministic cases:** a product owner or platform engineer defines
   expected plan shape, retrieval expectations, and write-intent limits.
2. **Snapshot the source:** the system records row-store LSN, columnar snapshot,
   vector index version, and procedure memory refs.
3. **Reserve evaluation budget:** the query budget plane allocates a non-live
   evaluation budget with stricter defaults than production agent execution.
4. **Run planner and retrieval in simulation:** the agent receives the same
   metadata it would see in production, but side effects are captured as intent
   diffs rather than committed writes.
5. **Compare deterministically:** observed plan hashes, context refs, estimated
   rows, and write-intent envelopes are compared with the case contract.
6. **Append audit event:** the run writes a hash-chained audit event that can be
   replayed without invoking the LLM.

## Agentic guardrails

- Reject any case missing an `account_id`-derived tenant scope at GraphQL
  admission.
- Cap `topK` to `min(requestedTopK, suite.maxVectorTopK, 25)` for semantic case
  search.
- Block recursive evaluation runs when `depth > suite.maxRecursiveDepth`.
- Deny simulated plans with unbounded JSON filters on schemaless column values.
- Require a row estimate before running columnar aggregation checks.
- Route evaluation jobs through a separate workload class so they cannot consume
  live query admission slots.
- Persist `model_fingerprint` and prompt/procedure hashes, but do not let model
  text alter database execution rules.

## Audit event schema

```ts
interface AgenticEvaluationAuditEvent {
  accountId: string;
  suiteId: string;
  runId: string;
  eventType:
    | "suite_created"
    | "case_added"
    | "run_started"
    | "case_passed"
    | "case_failed"
    | "run_completed"
    | "run_blocked";
  actorUserId: string;
  sourceWatermark: {
    rowStoreLsn: string;
    columnarSnapshotId?: string;
    vectorIndexVersion?: string;
  };
  payloadHash: string;
  previousAuditHash?: string;
  auditHash: string;
  occurredAt: string;
}
```

`auditHash` should be computed from a canonical serialization of
`accountId`, `suiteId`, `runId`, `eventType`, `sourceWatermark`, `payloadHash`,
`previousAuditHash`, and `occurredAt`.

## Performance check for 1M+ row boards

This design is unsafe if evaluation cases are allowed to discover fixture rows by
natural-language text alone. On large boards, that can cause full scans across
schemaless values or columnar projections.

Required mitigations:

- Every case must include `boardIds`, and high-risk cases should include
  `itemIds` or indexed column predicates.
- The planner must reject `expectedPlanShape.maxEstimatedRows` above the suite
  budget before running simulation.
- JSONB predicates in `required_predicates` are metadata only; executable
  filters must compile to indexed row-store, columnar, or vector predicates.
- Evaluation dashboards should read from columnar projections partitioned by
  `(account_id, suite_id, started_at)` instead of scanning row-store run tables.
- HNSW searches must be tenant-scoped and bounded by `topK <= 25` unless an
  explicit enterprise evaluation budget raises the limit.

## How an agent perceives this data

An LLM or autonomous agent should see evaluation cases as **procedural memory
with pass/fail contracts**, not as hidden prompts. The agent-readable packet can
be:

```ts
interface AgenticEvaluationPerceptionPacket {
  suiteId: string;
  caseId: string;
  target: EvaluationTarget;
  goal: string;
  allowedTools: string[];
  requiredTenantScope: {
    accountId: string;
    boardIds: string[];
  };
  semanticTags: string[];
  expectedContextRefs: string[];
  forbiddenContextRefs: string[];
  maxEstimatedRows: number;
  maxCostUnits: number;
  auditHash: string;
}
```

The packet tells the agent what success means, what context it may retrieve, and
which budgets constrain its plan. It does not grant additional access; the
runtime still enforces access policies, workload isolation, plan verification,
and transaction-intent guardrails.

## Rollout sequence

1. Start with read-only retrieval and plan-verification suites for internal
   mondayDB agent workflows.
2. Add transaction-intent simulations for write-capable agents after audit
   replay is stable.
3. Project run results into columnar analytics for regression trends by target,
   board size, semantic tag, and model fingerprint.
4. Gate production agent profile promotion on passing active suites for the
   relevant targets and tenant data classes.

## Open questions

- Should enterprise admins be able to require customer-authored evaluation
  suites before enabling write-capable agents?
- What minimum precision-at-K threshold is acceptable for semantic memory
  retrieval across different board templates?
- Should failed evaluation cases automatically pin the vector index version until
  a human reviews retrieval drift?
