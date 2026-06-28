# Agentic Reasoning Cell Plane for mondayDB

## Why this plane exists

mondayDB can become an Agentic Database without making the storage engine
probabilistic by introducing a deterministic **reasoning cell** abstraction. A
reasoning cell is a tenant-scoped, replayable bundle of row references,
columnar summaries, semantic entry points, procedural memory, and execution
budgets that an agent can inspect before it plans or acts.

The product trade-off is **latency versus consistency**. Agents want rich,
low-latency context, but mondayDB must preserve ACID row writes, predictable
analytics, 99.99% availability, and multi-tenant isolation. The reasoning cell
keeps writes on the row layer, aggregations on the columnar layer, and vector
lookup in an asynchronous semantic sidecar. The cell records watermarks for
each path so the agent can see whether it is reading fresh transactional data,
eventually consistent semantic context, or a bounded analytical snapshot.

## Design goals

- **Deterministic core:** Cell assembly is rule-based and hashable; LLM prompts
  and model outputs are never stored as hidden control flow in mondayDB.
- **Tenant isolation:** Every record, index, GraphQL resolver, and audit event is
  scoped by `account_id` before any board, workflow, or vector predicate.
- **Agent-ready perception:** Agents receive compact, tagged context cards that
  describe entities, allowed actions, freshness, and procedural instructions.
- **Guarded retrieval:** pgvector/HNSW lookup and recursive expansion require
  explicit budgets, depth limits, and planner estimates before execution.
- **Scale-aware access:** Queries on boards with 1M+ rows must use account-first
  partitioning, bounded `top_k`, indexed object references, and precomputed
  columnar summaries.

## Conceptual flow

1. A client or agent asks the Open API for a reasoning cell around a board item,
   update thread, workflow run, or saved view.
2. The planner validates `account_id`, purpose, access policy, recursion depth,
   vector budget, and estimated row/columnar cost.
3. mondayDB reads authoritative row references from the row layer and analytical
   summary pointers from the columnar layer.
4. The semantic sidecar performs account-partitioned HNSW retrieval against
   approved embeddings and returns deterministic reference IDs, scores, and
   index watermarks.
5. The cell is sealed with a deterministic audit hash and returned with agent
   perception metadata.

## TypeScript contracts

```ts
export type ReasoningCellStatus =
  | "draft"
  | "admitted"
  | "sealed"
  | "expired"
  | "rejected";

export interface ReasoningCell {
  accountId: string;
  cellId: string;
  purposeId: string;
  principalId: string;
  status: ReasoningCellStatus;
  anchor: ReasoningCellAnchor;
  rowRefs: ReasoningCellRowRef[];
  columnarRefs: ReasoningCellColumnarRef[];
  semanticRefs: ReasoningCellSemanticRef[];
  procedureRefs: ReasoningCellProcedureRef[];
  guardrails: ReasoningCellGuardrails;
  watermarks: ReasoningCellWatermarks;
  perception: ReasoningCellPerceptionCard;
  audit: ReasoningCellAudit;
  createdAt: string;
  expiresAt: string;
}

export interface ReasoningCellAnchor {
  objectKind: "board" | "item" | "update" | "workflow_run" | "view";
  boardId?: string;
  objectId: string;
  deterministicKey: string;
}

export interface ReasoningCellRowRef {
  boardId: string;
  itemId: string;
  columnIds: string[];
  rowVersion: string;
  visibilityScope: "full" | "redacted" | "metadata_only";
}

export interface ReasoningCellColumnarRef {
  boardId: string;
  summaryId: string;
  metricNames: string[];
  partitionKey: string;
  snapshotWatermark: string;
}

export interface ReasoningCellSemanticRef {
  embeddingId: string;
  sourceKind: "item" | "update" | "doc" | "procedure" | "schema_contract";
  sourceId: string;
  hnswPartition: string;
  score: number;
  indexWatermark: string;
  metadataTags: string[];
}

export interface ReasoningCellProcedureRef {
  procedureId: string;
  version: number;
  instructionDigest: string;
  allowedToolScopes: string[];
  maxToolCalls: number;
}

export interface ReasoningCellGuardrails {
  maxRowRefs: number;
  maxColumnarRefs: number;
  maxSemanticRefs: number;
  maxExpansionDepth: number;
  maxVectorTopK: number;
  estimatedRowReads: number;
  estimatedColumnarBytes: number;
  estimatedVectorProbes: number;
  deadlineMs: number;
  rejectIfFullScan: boolean;
}

export interface ReasoningCellWatermarks {
  rowCommitLsn: string;
  columnarSnapshotId: string;
  vectorIndexVersion: string;
  procedureCatalogVersion: string;
}

export interface ReasoningCellPerceptionCard {
  title: string;
  summary: string;
  entityTags: string[];
  riskTags: Array<"large_board" | "stale_vector_index" | "tool_limited" | "pii_redacted">;
  suggestedNextActions: string[];
  forbiddenActions: string[];
}

export interface ReasoningCellAudit {
  requestHash: string;
  admissionHash: string;
  sealedCellHash: string;
  previousAuditHash?: string;
}
```

## SQL schema

```sql
CREATE TABLE mondaydb_reasoning_cells (
  account_id BIGINT NOT NULL,
  cell_id UUID NOT NULL,
  purpose_id UUID NOT NULL,
  principal_id BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'admitted', 'sealed', 'expired', 'rejected')),
  anchor_object_kind TEXT NOT NULL,
  anchor_board_id BIGINT,
  anchor_object_id TEXT NOT NULL,
  anchor_deterministic_key TEXT NOT NULL,
  guardrails JSONB NOT NULL,
  watermarks JSONB NOT NULL,
  perception JSONB NOT NULL,
  request_hash BYTEA NOT NULL,
  admission_hash BYTEA NOT NULL,
  sealed_cell_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, cell_id)
);

CREATE INDEX reasoning_cells_anchor_idx
  ON mondaydb_reasoning_cells (account_id, anchor_object_kind, anchor_board_id, anchor_object_id, created_at DESC);

CREATE TABLE mondaydb_reasoning_cell_refs (
  account_id BIGINT NOT NULL,
  cell_id UUID NOT NULL,
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('row', 'columnar', 'semantic', 'procedure')),
  board_id BIGINT,
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  metadata JSONB NOT NULL,
  ordinal INT NOT NULL,
  PRIMARY KEY (account_id, cell_id, ref_kind, ordinal),
  FOREIGN KEY (account_id, cell_id)
    REFERENCES mondaydb_reasoning_cells (account_id, cell_id)
    ON DELETE CASCADE
);

CREATE INDEX reasoning_cell_refs_source_idx
  ON mondaydb_reasoning_cell_refs (account_id, ref_kind, board_id, source_id);

CREATE TABLE mondaydb_reasoning_cell_embeddings (
  account_id BIGINT NOT NULL,
  embedding_id UUID NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  board_id BIGINT,
  metadata_tags TEXT[] NOT NULL,
  embedding vector(1536) NOT NULL,
  index_watermark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_id)
);

-- Use account-hash partitioning before HNSW so cross-tenant candidates are
-- physically impossible during approximate nearest-neighbor search.
CREATE INDEX reasoning_cell_embeddings_hnsw_idx
  ON mondaydb_reasoning_cell_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

The HNSW index must be created per `account_id` hash partition or equivalent
tenant shard. If a deployment uses a shared vector table, the query planner must
apply an immutable `account_id` partition constraint before vector search.

## Open API GraphQL shape

```graphql
input CreateReasoningCellInput {
  accountId: ID!
  purposeId: ID!
  anchorObjectKind: ReasoningCellAnchorKind!
  anchorBoardId: ID
  anchorObjectId: ID!
  maxExpansionDepth: Int! = 1
  maxVectorTopK: Int! = 20
  deadlineMs: Int! = 250
}

type Mutation {
  createReasoningCell(input: CreateReasoningCellInput!): ReasoningCell!
  sealReasoningCell(accountId: ID!, cellId: ID!): ReasoningCell!
  expireReasoningCell(accountId: ID!, cellId: ID!): ReasoningCell!
}

type Query {
  reasoningCell(accountId: ID!, cellId: ID!): ReasoningCell
  reasoningCellsByAnchor(
    accountId: ID!
    anchorObjectKind: ReasoningCellAnchorKind!
    anchorBoardId: ID
    anchorObjectId: ID!
    limit: Int! = 20
  ): [ReasoningCell!]!
}
```

Resolvers must reject requests when `accountId` is absent, mismatched with the
caller's tenant, or not the leading predicate for row, columnar, and vector
lookups.

## Guardrails for autonomous agents

- **Recursive expansion:** `maxExpansionDepth` defaults to `1` and cannot exceed
  the tenant policy. Each expansion consumes a ledger entry keyed by
  `(account_id, cell_id, depth, source_id)`.
- **Vector budget:** `maxVectorTopK` is capped per request and multiplied by the
  number of semantic routes before admission. Requests that exceed the vector
  probe budget are rejected or queued.
- **Tool readiness:** Procedure refs expose allowed tool scopes and call limits,
  but they do not execute tools. Tool execution must happen through a separate
  governed action plane using the cell hash as input evidence.
- **Neighbor protection:** Admission compares estimated row reads, columnar bytes,
  and vector probes against tenant and shard-level budgets before any expensive
  operation starts.
- **Auditability:** The request hash, admission hash, and sealed cell hash make
  the exact context replayable for support, compliance, and regression testing.

## Performance check for 1M+ row boards

Potential full-scan risks:

1. Looking up cells by `anchor_object_id` without `(account_id, anchor_object_kind,
   anchor_board_id)` will scan historical cells across tenants or boards.
2. Expanding row refs by JSON metadata filters instead of indexed
   `(account_id, ref_kind, board_id, source_id)` can scan every ref in a large
   board.
3. Running HNSW without tenant partitioning can return cross-tenant candidates
   before filtering, which is both unsafe and unpredictable.
4. Building columnar summaries synchronously during cell creation can shift an
   agent request from low-latency context assembly to expensive analytics.

Mitigations:

- Require `account_id` as the leading key for every primary key, foreign key, and
  secondary index.
- Precompute columnar summaries and store only summary references in the cell.
- Bound `limit`, `maxVectorTopK`, `maxExpansionDepth`, and `deadlineMs` in the
  GraphQL schema and tenant policy.
- Store semantic metadata tags as indexed arrays or normalized tag rows when
  filtering is required; do not rely on unindexed JSONB scans for admission.

## How an agent perceives the cell

An LLM should not infer hidden database behavior. It should see an explicit
perception card:

```json
{
  "title": "Renewal-risk context for Enterprise Board item 123",
  "summary": "Fresh row data, columnar renewal metrics at snapshot c-8821, and 12 semantic refs from approved customer updates.",
  "entityTags": ["customer:acme", "workflow:renewal", "risk:blocked"],
  "riskTags": ["large_board", "tool_limited"],
  "suggestedNextActions": [
    "compare renewal blockers against approved procedure proc_renewal_triage@4",
    "ask for human approval before writing status changes"
  ],
  "forbiddenActions": [
    "unbounded board scan",
    "tool call outside crm.readonly"
  ]
}
```

This keeps the agent's mental model grounded in deterministic metadata:
freshness, allowed procedures, bounded semantic evidence, and explicit
prohibitions.

## Rollout posture

Start with read-only cell creation for high-value workflows such as support
triage, renewal risk, and project health. Once admission, audit replay, and
budget ledgers are stable, the same sealed cell hash can become the evidence
input for governed writes and tool execution. This preserves mondayDB's
enterprise predictability while giving agents a first-class context primitive.
