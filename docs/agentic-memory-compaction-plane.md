# Agentic Memory Compaction Plane

## Why

mondayDB needs long-term memory for agents, but raw board history is too large and too
mutable for every agent turn to scan directly. The product trade-off is latency vs.
freshness:

- Low-latency agents need compact, vector-searchable memory capsules.
- Enterprise users need deterministic replay, tenant isolation, and clear audit trails.
- mondayDB must not hide probabilistic summarization inside the storage engine.

The memory compaction plane keeps the database deterministic by storing compaction
outputs as versioned records with source watermarks, hashes, and explicit tenant scope.
Probabilistic summarization happens in an async worker. mondayDB accepts or rejects the
result using deterministic validation, cost budgets, and audit chaining.

## How

The plane converts immutable row changes, comments, automations, and tool outcomes into
tenant-scoped "memory capsules." A capsule is a bounded context object that an agent can
retrieve semantically or by metadata without triggering a full board scan.

Core flow:

1. Change events land in the existing durable event stream.
2. A compaction job selects a bounded event range by `account_id`, `board_id`, and
   source watermark.
3. An external summarizer produces deterministic payload fields from a fixed prompt
   version and input event hashes.
4. mondayDB validates size, scope, source coverage, and budget consumption.
5. The capsule, embedding reference, and audit event are committed atomically.

No query in this plane is valid without `account_id`.

## TypeScript schema

```ts
export type MemoryCapsuleKind =
  | "board_state"
  | "item_timeline"
  | "procedure_hint"
  | "tool_outcome"
  | "decision_log";

export type MemoryCapsuleStatus =
  | "pending_compaction"
  | "active"
  | "superseded"
  | "quarantined";

export interface AgenticMemoryCapsule {
  account_id: string;
  capsule_id: string;
  board_id: string;
  item_id?: string;
  kind: MemoryCapsuleKind;
  status: MemoryCapsuleStatus;

  // Procedural memory: instructions an agent may follow, not hidden DB behavior.
  procedure_steps: Array<{
    step_id: string;
    instruction: string;
    required_tool?: string;
    max_estimated_cost_units: number;
  }>;

  summary: string;
  metadata_tags: string[];
  semantic_anchor: {
    embedding_id: string;
    embedding_model: string;
    dimensions: number;
  };

  source_watermark: {
    from_event_id: string;
    to_event_id: string;
    source_event_count: number;
    source_hash: string;
  };

  compaction_recipe: {
    recipe_id: string;
    recipe_version: number;
    prompt_hash: string;
    model_id: string;
  };

  guardrails: {
    max_recursive_hops: number;
    max_tool_calls: number;
    max_rows_touched: number;
    expires_at: string;
  };

  audit: {
    created_by_actor_id: string;
    created_at: string;
    previous_audit_hash?: string;
    audit_hash: string;
  };
}

export interface MemoryRetrievalRequest {
  account_id: string;
  board_id: string;
  query: string;
  kind?: MemoryCapsuleKind[];
  item_id?: string;
  top_k: number;
  max_recursive_hops: number;
  budget_id: string;
}

export interface MemoryRetrievalResult {
  account_id: string;
  capsules: Array<{
    capsule_id: string;
    kind: MemoryCapsuleKind;
    score: number;
    summary: string;
    metadata_tags: string[];
    procedure_steps: AgenticMemoryCapsule["procedure_steps"];
    audit_hash: string;
  }>;
  budget_units_consumed: number;
  deterministic_trace_id: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_memory_capsules (
  account_id            BIGINT       NOT NULL,
  capsule_id            UUID         NOT NULL,
  board_id              BIGINT       NOT NULL,
  item_id               BIGINT,
  kind                  TEXT         NOT NULL,
  status                TEXT         NOT NULL,
  summary               TEXT         NOT NULL,
  procedure_steps_json  JSONB        NOT NULL,
  metadata_tags         TEXT[]       NOT NULL,
  embedding_id          UUID         NOT NULL,
  embedding_model       TEXT         NOT NULL,
  embedding_dimensions  INTEGER      NOT NULL,
  from_event_id         UUID         NOT NULL,
  to_event_id           UUID         NOT NULL,
  source_event_count    INTEGER      NOT NULL,
  source_hash           TEXT         NOT NULL,
  recipe_id             TEXT         NOT NULL,
  recipe_version        INTEGER      NOT NULL,
  prompt_hash           TEXT         NOT NULL,
  model_id              TEXT         NOT NULL,
  max_recursive_hops    INTEGER      NOT NULL DEFAULT 0,
  max_tool_calls        INTEGER      NOT NULL DEFAULT 0,
  max_rows_touched      INTEGER      NOT NULL,
  expires_at            TIMESTAMPTZ  NOT NULL,
  created_by_actor_id   BIGINT       NOT NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  previous_audit_hash   TEXT,
  audit_hash            TEXT         NOT NULL,
  PRIMARY KEY (account_id, capsule_id)
);

CREATE TABLE agentic_memory_embeddings (
  account_id    BIGINT      NOT NULL,
  embedding_id  UUID        NOT NULL,
  board_id      BIGINT      NOT NULL,
  capsule_id    UUID        NOT NULL,
  embedding     vector(1536) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id),
  FOREIGN KEY (account_id, capsule_id)
    REFERENCES agentic_memory_capsules (account_id, capsule_id)
);

CREATE TABLE agentic_memory_audit_events (
  account_id          BIGINT      NOT NULL,
  audit_event_id      UUID        NOT NULL,
  capsule_id          UUID        NOT NULL,
  actor_id            BIGINT      NOT NULL,
  action              TEXT        NOT NULL,
  request_hash        TEXT        NOT NULL,
  result_hash         TEXT        NOT NULL,
  previous_audit_hash TEXT,
  audit_hash          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE TABLE agentic_memory_capsule_tags (
  account_id  BIGINT NOT NULL,
  board_id    BIGINT NOT NULL,
  tag         TEXT   NOT NULL,
  capsule_id  UUID   NOT NULL,
  PRIMARY KEY (account_id, board_id, tag, capsule_id),
  FOREIGN KEY (account_id, capsule_id)
    REFERENCES agentic_memory_capsules (account_id, capsule_id)
);
```

Recommended indexes:

```sql
CREATE INDEX agentic_memory_capsules_board_active_idx
  ON agentic_memory_capsules (account_id, board_id, status, kind, expires_at DESC);

CREATE INDEX agentic_memory_capsules_item_idx
  ON agentic_memory_capsules (account_id, board_id, item_id, status, expires_at DESC)
  WHERE item_id IS NOT NULL;

CREATE INDEX agentic_memory_capsule_tags_lookup_idx
  ON agentic_memory_capsule_tags (account_id, board_id, tag, capsule_id);

CREATE INDEX agentic_memory_embeddings_hnsw_idx
  ON agentic_memory_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

Deployment note: the HNSW index should be built per account-hash or shard partition,
not as a single global index, so `account_id` pruning happens before vector search.

## Open API GraphQL surface

```graphql
type AgenticMemoryCapsule {
  accountId: ID!
  capsuleId: ID!
  boardId: ID!
  itemId: ID
  kind: String!
  status: String!
  summary: String!
  metadataTags: [String!]!
  procedureSteps: [AgenticProcedureStep!]!
  auditHash: String!
  expiresAt: String!
}

type AgenticProcedureStep {
  stepId: ID!
  instruction: String!
  requiredTool: String
  maxEstimatedCostUnits: Int!
}

type AgenticMemoryRetrievalResult {
  accountId: ID!
  capsules: [AgenticMemoryCapsule!]!
  budgetUnitsConsumed: Int!
  deterministicTraceId: ID!
}

input AgenticMemorySearchInput {
  accountId: ID!
  boardId: ID!
  query: String!
  itemId: ID
  kinds: [String!]
  topK: Int! = 8
  maxRecursiveHops: Int! = 0
  budgetId: ID!
}

extend type Query {
  agenticMemorySearch(input: AgenticMemorySearchInput!): AgenticMemoryRetrievalResult!
}
```

Mutation access should be restricted to trusted compaction services:

```graphql
input CommitAgenticMemoryCapsuleInput {
  accountId: ID!
  boardId: ID!
  itemId: ID
  kind: String!
  summary: String!
  procedureStepsJson: JSON!
  metadataTags: [String!]!
  embeddingId: ID!
  sourceHash: String!
  fromEventId: ID!
  toEventId: ID!
  recipeId: String!
  recipeVersion: Int!
  promptHash: String!
  modelId: String!
}

extend type Mutation {
  commitAgenticMemoryCapsule(input: CommitAgenticMemoryCapsuleInput!): AgenticMemoryCapsule!
}
```

## Guardrails

- Require `account_id`, `board_id`, and `budget_id` for every retrieval.
- Clamp `top_k` to a platform maximum, for example 20.
- Default `max_recursive_hops` to 0. Allow 1 only for approved internal agents.
- Reject capsule commits where source event ranges cross accounts or boards.
- Enforce `max_rows_touched` before running metadata filters.
- Charge vector search, metadata filtering, and capsule hydration to the query budget
  ledger before returning results.
- Quarantine capsules whose source events were deleted, permission-revoked, or moved to
  another tenant boundary.

## Performance check

Queries that can full-scan boards with 1M+ rows:

- Searching capsules by `metadata_tags` without `account_id` and `board_id`.
- Hydrating source events from `from_event_id` to `to_event_id` without a bounded event
  count.
- Running vector search against a global HNSW index that cannot prune by account shard.
- Letting agents increase `top_k` or recursive hops after seeing partial results.

Required mitigations:

- Partition memory capsules and embeddings by account hash or tenant shard.
- Keep `account_id` as the first key in every primary key and lookup index.
- Store compact summaries and procedure steps directly on the capsule to avoid source
  replay during normal retrieval.
- Run compaction incrementally from event watermarks instead of scanning board rows.
- Use columnar analytics only for offline quality metrics, not online agent turns.

## Agent-ready perception

An LLM sees each capsule as a small, typed memory object:

- `kind` tells the agent whether the capsule is board state, timeline, procedure, tool
  outcome, or decision log.
- `metadata_tags` expose stable retrieval hints such as `owner-change`, `blocked-risk`,
  `sla-policy`, or `automation-failure`.
- `procedure_steps` are explicit instructions with tool and cost limits.
- `audit_hash` lets the agent cite the exact deterministic record used for a decision.
- `expires_at` tells the agent when memory should be treated as stale.

This keeps agent behavior explainable: the agent may reason over memory, but mondayDB
stores only deterministic records, hashes, indexes, and budget decisions.

## Rollout checkpoints

1. Ship read-only GraphQL search for internal agents on a small tenant partition.
2. Add compaction commits from trusted workers with audit hash validation.
3. Enable per-board memory quality metrics from columnar snapshots.
4. Expose customer controls for retention, quarantine, and memory deletion.
5. Gate external agent access behind query budgets and recursive-hop limits.
