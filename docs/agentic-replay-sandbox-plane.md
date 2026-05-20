# Agentic Replay Sandbox Plane

## Why before how

Autonomous agents need a safe place to rehearse plans before mondayDB lets them touch live boards. The trade-off is **deterministic reproducibility vs. freshest possible context**:

- Replaying against a pinned snapshot can be slightly stale, but it gives enterprise customers a stable, auditable answer to "what would this agent have done?"
- Running directly against live row, columnar, vector, and tool state reduces context lag, but it makes failures harder to explain and increases the chance that an exploratory agent plan creates noisy load for neighboring tenants.

The replay sandbox keeps the core database deterministic. Probabilistic agents may propose plans, but mondayDB records the exact input snapshot, budget envelope, retrieved memories, tool dry-runs, and simulated writes so the result can be verified, compared, and replayed without side effects.

## Product surface

The sandbox is an account-scoped execution lane for:

1. **Plan rehearsal:** Verify whether an agent plan would pass policy, budget, and transaction-intent checks.
2. **Procedural memory validation:** Test stored instructions against historical board states before promoting them to production capability records.
3. **Regression protection:** Re-run previously approved agent workflows after schema, index, or model changes.
4. **Enterprise audit review:** Produce deterministic replay packets for admins, compliance teams, and support engineers.

This complements the existing planes:

- Context snapshots provide the point-in-time data envelope.
- Plan verification estimates cost and policy compatibility.
- Transaction intents describe proposed writes.
- Evaluation regression suites compare observed behavior across engine versions.
- Workload isolation ensures replay traffic cannot starve live tenant queries.

## Deterministic invariants

- Every row, query, and API input is scoped by `account_id`.
- Replays never mutate primary row storage, columnar projections, vector indexes, tool ledgers, or memory records.
- Every replay reads from explicit `snapshot_id` and `source_watermark` values.
- Any LLM-generated text is stored as input data only; replay decisions are deterministic functions of persisted plan steps, policies, budgets, and snapshot references.
- Audit hashes are computed from canonical JSON with stable key ordering.

## TypeScript schema

```ts
export type ReplayStatus =
  | "queued"
  | "running"
  | "completed"
  | "blocked"
  | "failed";

export type ReplayMode =
  | "plan_preflight"
  | "procedure_validation"
  | "regression_case"
  | "support_audit";

export interface AgenticReplaySandbox {
  account_id: string;
  sandbox_id: string;
  mode: ReplayMode;
  requested_by_user_id: string;
  agent_id: string;
  plan_id: string;
  snapshot_id: string;
  source_watermark: string;
  semantic_manifest_id?: string;
  budget_envelope_id: string;
  policy_envelope_id: string;
  status: ReplayStatus;
  max_step_count: number;
  max_vector_top_k: number;
  max_simulated_write_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface AgenticReplayStep {
  account_id: string;
  sandbox_id: string;
  step_seq: number;
  step_type:
    | "row_read"
    | "columnar_read"
    | "semantic_search"
    | "tool_dry_run"
    | "transaction_intent_simulation"
    | "policy_check";
  deterministic_input_hash: string;
  deterministic_output_hash: string;
  estimated_row_count: number;
  estimated_vector_candidates: number;
  estimated_cost_units: number;
  blocked_reason?: string;
  created_at: string;
}

export interface AgenticReplayPacket {
  account_id: string;
  sandbox_id: string;
  result_hash: string;
  plan_hash: string;
  snapshot_hash: string;
  semantic_manifest_hash?: string;
  audit_chain_head: string;
  observed_policy_violations: string[];
  simulated_transaction_intent_ids: string[];
  agent_perception_tags: string[];
  completed_at: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_replay_sandboxes (
  account_id BIGINT NOT NULL,
  sandbox_id UUID NOT NULL,
  mode TEXT NOT NULL CHECK (
    mode IN (
      'plan_preflight',
      'procedure_validation',
      'regression_case',
      'support_audit'
    )
  ),
  requested_by_user_id BIGINT NOT NULL,
  agent_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  source_watermark TEXT NOT NULL,
  semantic_manifest_id UUID,
  budget_envelope_id UUID NOT NULL,
  policy_envelope_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'completed', 'blocked', 'failed')
  ),
  max_step_count INTEGER NOT NULL CHECK (max_step_count > 0 AND max_step_count <= 256),
  max_vector_top_k INTEGER NOT NULL CHECK (max_vector_top_k > 0 AND max_vector_top_k <= 200),
  max_simulated_write_count INTEGER NOT NULL CHECK (
    max_simulated_write_count >= 0 AND max_simulated_write_count <= 10000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, sandbox_id)
);

CREATE INDEX agentic_replay_sandboxes_account_status_created_idx
  ON agentic_replay_sandboxes (account_id, status, created_at DESC);

CREATE INDEX agentic_replay_sandboxes_account_plan_idx
  ON agentic_replay_sandboxes (account_id, plan_id, created_at DESC);

CREATE TABLE agentic_replay_steps (
  account_id BIGINT NOT NULL,
  sandbox_id UUID NOT NULL,
  step_seq INTEGER NOT NULL CHECK (step_seq >= 0),
  step_type TEXT NOT NULL CHECK (
    step_type IN (
      'row_read',
      'columnar_read',
      'semantic_search',
      'tool_dry_run',
      'transaction_intent_simulation',
      'policy_check'
    )
  ),
  deterministic_input_hash BYTEA NOT NULL,
  deterministic_output_hash BYTEA NOT NULL,
  estimated_row_count BIGINT NOT NULL CHECK (estimated_row_count >= 0),
  estimated_vector_candidates INTEGER NOT NULL CHECK (estimated_vector_candidates >= 0),
  estimated_cost_units BIGINT NOT NULL CHECK (estimated_cost_units >= 0),
  blocked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, sandbox_id, step_seq),
  FOREIGN KEY (account_id, sandbox_id)
    REFERENCES agentic_replay_sandboxes (account_id, sandbox_id)
    ON DELETE CASCADE
);

CREATE INDEX agentic_replay_steps_account_type_idx
  ON agentic_replay_steps (account_id, step_type, created_at DESC);

CREATE TABLE agentic_replay_packets (
  account_id BIGINT NOT NULL,
  sandbox_id UUID NOT NULL,
  result_hash BYTEA NOT NULL,
  plan_hash BYTEA NOT NULL,
  snapshot_hash BYTEA NOT NULL,
  semantic_manifest_hash BYTEA,
  audit_chain_head BYTEA NOT NULL,
  observed_policy_violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulated_transaction_intent_ids UUID[] NOT NULL DEFAULT '{}',
  agent_perception_tags TEXT[] NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, sandbox_id),
  FOREIGN KEY (account_id, sandbox_id)
    REFERENCES agentic_replay_sandboxes (account_id, sandbox_id)
    ON DELETE CASCADE
);

CREATE INDEX agentic_replay_packets_account_completed_idx
  ON agentic_replay_packets (account_id, completed_at DESC);
```

## Semantic retrieval compatibility

Replay sandboxes should not create a separate source of truth for embeddings. They reference a `semantic_manifest_id` that pins the vector corpus, embedding model version, HNSW build parameters, and source watermarks used during replay.

Recommended manifest fields:

```ts
export interface ReplaySemanticManifest {
  account_id: string;
  semantic_manifest_id: string;
  vector_index_id: string;
  embedding_model_version: string;
  hnsw_m: number;
  hnsw_ef_construction: number;
  query_ef_search: number;
  source_watermark: string;
  allowed_memory_namespaces: string[];
  created_at: string;
}
```

HNSW searches must be filtered by `account_id` before candidate expansion. If the vector backend cannot guarantee pre-filtered tenant isolation, the query must be rejected rather than post-filtered.

## Open API GraphQL shape

```graphql
input CreateAgenticReplaySandboxInput {
  accountId: ID!
  mode: AgenticReplayMode!
  agentId: ID!
  planId: ID!
  snapshotId: ID!
  semanticManifestId: ID
  budgetEnvelopeId: ID!
  policyEnvelopeId: ID!
  maxStepCount: Int = 64
  maxVectorTopK: Int = 50
  maxSimulatedWriteCount: Int = 1000
}

type CreateAgenticReplaySandboxPayload {
  sandboxId: ID!
  status: AgenticReplayStatus!
  auditChainHead: String!
}

type AgenticReplayStep {
  stepSeq: Int!
  stepType: String!
  estimatedRowCount: Int!
  estimatedVectorCandidates: Int!
  estimatedCostUnits: Int!
  blockedReason: String
}

type AgenticReplayPacket {
  sandboxId: ID!
  resultHash: String!
  planHash: String!
  snapshotHash: String!
  semanticManifestHash: String
  auditChainHead: String!
  observedPolicyViolations: [String!]!
  simulatedTransactionIntentIds: [ID!]!
  agentPerceptionTags: [String!]!
  completedAt: String!
}

type Mutation {
  createAgenticReplaySandbox(
    input: CreateAgenticReplaySandboxInput!
  ): CreateAgenticReplaySandboxPayload!

  runAgenticReplaySandbox(accountId: ID!, sandboxId: ID!): AgenticReplayPacket!
}

type Query {
  agenticReplaySandboxSteps(
    accountId: ID!
    sandboxId: ID!
    limit: Int = 100
    afterStepSeq: Int
  ): [AgenticReplayStep!]!

  agenticReplayPacket(accountId: ID!, sandboxId: ID!): AgenticReplayPacket
}
```

GraphQL resolvers must pass `accountId` through to every row, columnar, vector, and audit lookup. The API should not infer tenant scope from `sandboxId` alone.

## Execution flow

1. **Create sandbox:** Validate `account_id`, requested mode, policy envelope, and budget envelope.
2. **Pin context:** Resolve the snapshot, source watermark, and optional semantic manifest.
3. **Reserve replay budget:** Charge against a separate replay lane so dry-runs cannot consume live query capacity.
4. **Execute deterministic steps:** Record each simulated read, semantic search, tool dry-run, and transaction-intent simulation with input and output hashes.
5. **Block unsafe branches:** Stop when recursion depth, fan-out, vector candidates, or simulated write counts exceed the envelope.
6. **Emit replay packet:** Store the result hash, plan hash, snapshot hash, violations, and perception tags for audit and comparison.

## Agentic guardrails

- `max_step_count` prevents recursive agent plans from repeatedly calling the sandbox.
- `max_vector_top_k` caps semantic expansion and must be lower than or equal to the query-budget envelope.
- Tool calls run in dry-run mode with deterministic fixtures or read-only connectors.
- Simulated transaction intents cannot be promoted automatically; a separate verified commit flow must approve them.
- Replays that cross board boundaries require an explicit list of board IDs and policy grants.
- Expired sandboxes become unreadable except through immutable audit packets.

## Performance check for 1M+ row boards

Flag or reject any replay step that would cause:

- A row-store read without `(account_id, board_id)` predicates.
- A columnar scan without partition pruning by `account_id` and board or date range.
- A JSON filter that lacks a generated indexed projection for the filtered field.
- A vector search with unbounded `topK`, missing `account_id`, or post-filtered tenant isolation.
- A simulated write set larger than `max_simulated_write_count`.
- A replay query that requests all steps without cursor pagination.

For large boards, the planner should estimate cost before execution and write a blocked `agentic_replay_steps` row instead of attempting the scan.

## Agent-ready perception model

Agents should perceive a replay packet as a bounded, deterministic memory object:

```ts
export interface AgentReplayPerception {
  kind: "agentic_replay_packet";
  account_id: string;
  sandbox_id: string;
  plan_id: string;
  confidence: "deterministic_replay";
  tags: Array<
    | "safe_to_compare"
    | "requires_human_review"
    | "policy_blocked"
    | "budget_blocked"
    | "procedure_candidate"
    | "regression_signal"
  >;
  summary_ref: string;
  audit_chain_head: string;
}
```

This gives an LLM a compact way to understand whether a procedure is stable enough to reuse, while the database stores only deterministic references, hashes, and scoped metadata.

## Rollout notes

- Start with support-audit and regression-case modes because they are naturally read-only.
- Require explicit admin approval before procedure-validation replays can promote a procedural memory candidate.
- Keep replay storage TTL-based, but preserve compact audit packets for enterprise retention policies.
- Track p95 replay queue wait, p95 step execution latency, blocked replay rate, and replay-to-live cost ratio per account.
