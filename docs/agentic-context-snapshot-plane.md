# mondayDB Agentic Context Snapshot Plane

## Why before how

Autonomous agents need rich board context before choosing tools, writing updates, or
retrieving procedural memory. Letting each agent rebuild that context with ad hoc live
queries creates three risks:

- **Latency vs. freshness:** always-live context is freshest, but can fan out into slow
  scans across items, updates, files, automations, and activity logs.
- **Consistency vs. creativity:** agents can reason probabilistically, but mondayDB must
  expose deterministic inputs that can be replayed during audits.
- **Tenant isolation vs. reuse:** cached context lowers cost, but every snapshot must be
  scoped to one `account_id` and one authorization envelope.

The Context Snapshot Plane creates deterministic, tenant-scoped, point-in-time context
records. Agents perceive these as stable "scene graphs" for a board or workflow, with
semantic tags and vector references for retrieval. The database remains predictable:
snapshot construction is bounded, audited, and costed before execution.

## Product contract

The product exposes context snapshots as an explicit Open API feature, not hidden AI
magic. An agent can ask for a snapshot of a board, item cohort, or workflow boundary,
then use the returned `snapshot_id` in later retrieval, planning, or tool calls.

Core trade-off:

- **Default mode:** consistent snapshot from committed mondayDB state, optimized for
  repeatable agent plans.
- **Fresh mode:** includes latest committed changes after the snapshot request starts,
  but carries a higher query budget cost and stricter timeout.
- **Cached mode:** reuses a recent compatible snapshot when policy allows, trading
  staleness for lower latency.

No mode may bypass account scoping, ACL evaluation, cost budgets, or audit emission.

## TypeScript interfaces

```ts
export type ContextSnapshotMode = "consistent" | "fresh" | "cached";

export type ContextSubjectType =
  | "board"
  | "item_cohort"
  | "workflow"
  | "automation"
  | "procedure";

export interface AgenticContextSnapshot {
  account_id: string;
  snapshot_id: string;
  subject_type: ContextSubjectType;
  subject_id: string;
  mode: ContextSnapshotMode;
  requested_by_user_id: string;
  requested_by_agent_id?: string;
  authz_scope_hash: string;
  source_watermark: string;
  expires_at: string;
  created_at: string;
  metadata_tags: string[];
  semantic_ref_ids: string[];
  budget: ContextSnapshotBudget;
  audit_hash: string;
}

export interface ContextSnapshotBudget {
  max_items: number;
  max_columns: number;
  max_updates: number;
  max_files: number;
  max_vector_neighbors: number;
  estimated_row_reads: number;
  estimated_vector_reads: number;
  timeout_ms: number;
}

export interface ContextSnapshotEntity {
  account_id: string;
  snapshot_id: string;
  entity_type: "board" | "group" | "item" | "column" | "update" | "file" | "automation";
  entity_id: string;
  stable_version: string;
  visibility_hash: string;
  payload_ref: string;
  semantic_label?: string;
  ordinal: number;
}

export interface ContextSnapshotAuditEvent {
  account_id: string;
  event_id: string;
  snapshot_id: string;
  actor_type: "user" | "agent" | "system";
  actor_id: string;
  action: "requested" | "created" | "reused" | "expired" | "denied";
  request_hash: string;
  result_hash?: string;
  previous_event_hash?: string;
  created_at: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_context_snapshots (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (
    subject_type IN ('board', 'item_cohort', 'workflow', 'automation', 'procedure')
  ),
  subject_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('consistent', 'fresh', 'cached')),
  requested_by_user_id BIGINT NOT NULL,
  requested_by_agent_id UUID,
  authz_scope_hash BYTEA NOT NULL,
  source_watermark TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  semantic_ref_ids UUID[] NOT NULL DEFAULT '{}',
  max_items INTEGER NOT NULL,
  max_columns INTEGER NOT NULL,
  max_updates INTEGER NOT NULL,
  max_files INTEGER NOT NULL,
  max_vector_neighbors INTEGER NOT NULL,
  estimated_row_reads BIGINT NOT NULL,
  estimated_vector_reads BIGINT NOT NULL,
  timeout_ms INTEGER NOT NULL,
  audit_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, snapshot_id)
);

CREATE INDEX agentic_context_snapshots_subject_idx
  ON agentic_context_snapshots (account_id, subject_type, subject_id, created_at DESC);

CREATE INDEX agentic_context_snapshots_expiry_idx
  ON agentic_context_snapshots (account_id, expires_at);

CREATE TABLE agentic_context_snapshot_entities (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('board', 'group', 'item', 'column', 'update', 'file', 'automation')
  ),
  entity_id TEXT NOT NULL,
  stable_version TEXT NOT NULL,
  visibility_hash BYTEA NOT NULL,
  payload_ref TEXT NOT NULL,
  semantic_label TEXT,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (account_id, snapshot_id, entity_type, entity_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES agentic_context_snapshots (account_id, snapshot_id)
);

CREATE INDEX agentic_context_snapshot_entities_order_idx
  ON agentic_context_snapshot_entities (account_id, snapshot_id, ordinal);

CREATE TABLE agentic_context_snapshot_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  snapshot_id UUID NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('requested', 'created', 'reused', 'expired', 'denied')
  ),
  request_hash BYTEA NOT NULL,
  result_hash BYTEA,
  previous_event_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_context_snapshot_audit_chain_idx
  ON agentic_context_snapshot_audit_events (account_id, snapshot_id, created_at);
```

## Open API GraphQL shape

```graphql
enum ContextSnapshotMode {
  consistent
  fresh
  cached
}

input CreateContextSnapshotInput {
  account_id: ID!
  subject_type: String!
  subject_id: ID!
  mode: ContextSnapshotMode!
  metadata_tags: [String!] = []
  max_items: Int = 1000
  max_updates: Int = 200
  max_files: Int = 50
  max_vector_neighbors: Int = 20
  timeout_ms: Int = 1500
}

type ContextSnapshotBudget {
  max_items: Int!
  max_updates: Int!
  max_files: Int!
  max_vector_neighbors: Int!
  estimated_row_reads: Int!
  estimated_vector_reads: Int!
  timeout_ms: Int!
}

type ContextSnapshot {
  account_id: ID!
  snapshot_id: ID!
  subject_type: String!
  subject_id: ID!
  mode: ContextSnapshotMode!
  source_watermark: String!
  expires_at: String!
  metadata_tags: [String!]!
  semantic_ref_ids: [ID!]!
  budget: ContextSnapshotBudget!
  audit_hash: String!
}

extend type Mutation {
  create_context_snapshot(input: CreateContextSnapshotInput!): ContextSnapshot!
}

extend type Query {
  context_snapshot(account_id: ID!, snapshot_id: ID!): ContextSnapshot
}
```

Every resolver must require `account_id` and verify that the authenticated principal can
read the subject under the same ACL envelope represented by `authz_scope_hash`.

## Snapshot build flow

1. **Authorize:** compute deterministic `authz_scope_hash` from account, user, agent,
   board permissions, column restrictions, and app scopes.
2. **Estimate:** ask row and columnar planners for bounded read counts before touching
   entity payloads.
3. **Admit or deny:** reject requests that exceed tenant budget, requested limits, or
   recursive depth policy.
4. **Materialize refs:** write entity references and payload pointers, not large mutable
   blobs, so storage remains compact.
5. **Tag for agents:** attach deterministic metadata like `board:crm`,
   `workflow:renewal`, `risk:customer-visible`, or `procedure:approval-required`.
6. **Audit:** emit hash-chained audit events for request, decision, and result.

## Semantic retrieval compatibility

Snapshots do not need to own embeddings. They point at tenant-scoped semantic records
that can be indexed by pgvector/HNSW or an equivalent vector service:

```sql
CREATE TABLE agentic_context_snapshot_embeddings (
  account_id BIGINT NOT NULL,
  snapshot_id UUID NOT NULL,
  semantic_ref_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, snapshot_id, semantic_ref_id)
);

CREATE INDEX agentic_context_snapshot_embeddings_hnsw_idx
  ON agentic_context_snapshot_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX agentic_context_snapshot_embeddings_tenant_idx
  ON agentic_context_snapshot_embeddings (account_id, snapshot_id);
```

Vector retrieval must first filter by `account_id` and an allowed snapshot set. If the
vector backend cannot pre-filter by tenant, mondayDB must use a physically separate
tenant shard, tenant partition, or post-filter plus strict over-fetch cap with leakage
tests.

## Procedural memory

Agents can store repeatable instructions against snapshot tags, not against unstable
natural language prompts:

```ts
export interface SnapshotProcedureHint {
  account_id: string;
  procedure_id: string;
  applies_to_tags: string[];
  required_snapshot_subject_type: ContextSubjectType;
  instruction_digest: string;
  tool_sequence_template_ids: string[];
  human_review_required: boolean;
}
```

Example: `["board:enterprise-renewals", "risk:customer-visible"]` can resolve to a
procedure requiring human approval before sending renewal emails.

## Agentic guardrails

- Require `account_id` in every snapshot, entity, embedding, and audit query.
- Cap recursive snapshot creation with `max_snapshot_depth` and reject agent loops that
  request snapshots from snapshots without a new human or scheduler boundary.
- Charge row, columnar, and vector reads to the same deterministic query budget ledger.
- Bound `max_items`, `max_updates`, `max_files`, and `max_vector_neighbors` at API and
  planner layers.
- Deny snapshot creation when ACL scope changes between estimate and materialization.
- Expire snapshots quickly for high-churn boards and never reuse them across principals
  with different `authz_scope_hash` values.

## Performance check for 1M+ row boards

Danger patterns that can cause full scans:

- `subject_type = 'board'` without indexed `account_id, board_id` predicates.
- JSON metadata filters on item payloads without columnar projections or precomputed
  filter indexes.
- Unbounded update or file inclusion for every item in a large board.
- Vector search across all account memory without narrowing to snapshot-compatible
  semantic refs.

Required mitigations:

- Use composite indexes that start with `account_id`.
- Build snapshots from board partitions and columnar projections, not raw item scans.
- Require cursor-based pagination for large entity sets.
- Default to top-K semantic summaries for large cohorts, then let agents request
  narrower follow-up snapshots.
- Emit planner estimates in the API response so expensive agent behavior is visible.

## Auditability and determinism

`audit_hash` should be computed from canonical JSON:

```text
sha256(canonical_json({
  account_id,
  snapshot_id,
  subject_type,
  subject_id,
  mode,
  authz_scope_hash,
  source_watermark,
  budget,
  entity_stable_versions,
  previous_event_hash
}))
```

The hash excludes probabilistic agent commentary. An LLM may interpret a snapshot, but
mondayDB only records deterministic inputs, limits, decisions, and tool-visible outputs.

## LLM perception model

An agent should perceive a context snapshot as:

- a stable board/workflow scene,
- a bounded list of visible entities,
- semantic tags for retrieval,
- procedural hints for safe tool use,
- a budget envelope showing what it may ask next.

This keeps the agent useful without letting it turn mondayDB into an unbounded recursive
query engine.
