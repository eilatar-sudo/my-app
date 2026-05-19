# Agentic Working Set Plane

## Why: bounded autonomy before broad autonomy

Autonomous agents need enough context to act, but mondayDB cannot let every agent
repeatedly rediscover that context by scanning large boards, replaying full
histories, or issuing recursive semantic searches. The working set plane gives
agents a deterministic, tenant-scoped bundle of row, columnar, semantic, and
procedural references that can be reused across a task without weakening
multi-tenant isolation or ACID write paths.

The product trade-off is **latency and predictability vs. freshness**:

- Reusing a bounded working set gives "blink-of-an-eye" agent reads because the
  planner can resolve a compact set of references instead of searching billions
  of rows.
- The bundle can become stale, so each working set records source watermarks,
  validity windows, and refresh policy. Agents receive deterministic staleness
  metadata instead of hidden AI "magic."
- Writes still flow through mondayDB transaction intent and normal row storage;
  the working set is a read/control-plane artifact, not a bypass around ACID.

## Design goals

1. Scope every record and query by `account_id`.
2. Store agent instructions as procedural memory with explicit versioning.
3. Make semantic references compatible with pgvector/HNSW-style retrieval.
4. Keep working set expansion deterministic and budgeted.
5. Preserve a replayable audit chain for creation, refresh, consumption, and
   retirement events.
6. Prevent full table scans on boards with 1M+ rows by requiring anchored
   predicates and bounded reference expansion.

## Core model

A working set is a versioned bundle assembled from deterministic inputs:

- row references from board/item/column predicates;
- columnar aggregate references for analytics summaries;
- vector references for semantically relevant memories or items;
- procedural instructions that describe how an agent may use the bundle;
- guardrail budgets that cap expansion, recursion, and tool calls.

The agent perceives the bundle as a compact, tagged context object:

```ts
export interface AgenticWorkingSet {
  accountId: string;
  workingSetId: string;
  version: number;
  status: "draft" | "active" | "refresh_required" | "retired";
  objective: string;
  tags: string[];
  sourceWatermarks: WorkingSetWatermark[];
  rowRefs: WorkingSetRowRef[];
  columnarRefs: WorkingSetColumnarRef[];
  semanticRefs: WorkingSetSemanticRef[];
  proceduralMemory: WorkingSetProcedure[];
  guardrails: WorkingSetGuardrails;
  audit: WorkingSetAuditPointer;
  createdAt: string;
  expiresAt: string;
}

export interface WorkingSetWatermark {
  sourceType: "board" | "view" | "memory" | "semantic_index" | "tool_registry";
  sourceId: string;
  highWatermark: string;
  freshnessPolicy: "strict" | "bounded_staleness" | "snapshot";
  maxStalenessMs: number;
}

export interface WorkingSetRowRef {
  boardId: string;
  itemId: string;
  columnIds: string[];
  predicateHash: string;
  lastObservedVersion: string;
}

export interface WorkingSetColumnarRef {
  boardId: string;
  cubeId: string;
  measureIds: string[];
  dimensionIds: string[];
  aggregateWatermark: string;
}

export interface WorkingSetSemanticRef {
  semanticRefId: string;
  sourceType: "item" | "update" | "doc" | "memory" | "procedure";
  sourceId: string;
  embeddingModel: string;
  vectorIndexId: string;
  hnswEfSearch: number;
  similarityScore: number;
  metadataTags: string[];
}

export interface WorkingSetProcedure {
  procedureId: string;
  version: number;
  intent: string;
  allowedTools: string[];
  prohibitedActions: string[];
  instructionChecksum: string;
}

export interface WorkingSetGuardrails {
  maxRowRefs: number;
  maxSemanticRefs: number;
  maxExpansionDepth: number;
  maxToolCalls: number;
  maxEstimatedReadRows: number;
  maxVectorCandidates: number;
  timeoutMs: number;
  requireHumanReviewForWrites: boolean;
}

export interface WorkingSetAuditPointer {
  auditChainId: string;
  lastEventHash: string;
}
```

## SQL schema

The SQL shape assumes decoupled storage and compute: hot metadata remains in the
row path, high-volume analytics stay in the columnar path, and embeddings remain
in a tenant-partitioned vector index.

```sql
CREATE TABLE agentic_working_sets (
  account_id            BIGINT NOT NULL,
  working_set_id        UUID NOT NULL,
  version               BIGINT NOT NULL,
  status                TEXT NOT NULL CHECK (
    status IN ('draft', 'active', 'refresh_required', 'retired')
  ),
  objective             TEXT NOT NULL,
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  source_watermarks     JSONB NOT NULL,
  guardrails            JSONB NOT NULL,
  audit_chain_id        UUID NOT NULL,
  last_event_hash       BYTEA NOT NULL,
  created_by_agent_id   UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, working_set_id, version)
);

CREATE INDEX idx_working_sets_account_status_expiry
  ON agentic_working_sets (account_id, status, expires_at);

CREATE TABLE agentic_working_set_row_refs (
  account_id            BIGINT NOT NULL,
  working_set_id        UUID NOT NULL,
  version               BIGINT NOT NULL,
  board_id              BIGINT NOT NULL,
  item_id               BIGINT NOT NULL,
  column_ids            BIGINT[] NOT NULL,
  predicate_hash        BYTEA NOT NULL,
  last_observed_version BIGINT NOT NULL,
  PRIMARY KEY (account_id, working_set_id, version, board_id, item_id)
);

CREATE INDEX idx_working_set_row_refs_item_lookup
  ON agentic_working_set_row_refs (account_id, board_id, item_id);

CREATE TABLE agentic_working_set_columnar_refs (
  account_id            BIGINT NOT NULL,
  working_set_id        UUID NOT NULL,
  version               BIGINT NOT NULL,
  board_id              BIGINT NOT NULL,
  cube_id               UUID NOT NULL,
  measure_ids           TEXT[] NOT NULL,
  dimension_ids         TEXT[] NOT NULL,
  aggregate_watermark   BIGINT NOT NULL,
  PRIMARY KEY (account_id, working_set_id, version, board_id, cube_id)
);

CREATE TABLE agentic_working_set_semantic_refs (
  account_id            BIGINT NOT NULL,
  working_set_id        UUID NOT NULL,
  version               BIGINT NOT NULL,
  semantic_ref_id       UUID NOT NULL,
  source_type           TEXT NOT NULL CHECK (
    source_type IN ('item', 'update', 'doc', 'memory', 'procedure')
  ),
  source_id             TEXT NOT NULL,
  embedding_model       TEXT NOT NULL,
  vector_index_id       UUID NOT NULL,
  similarity_score      REAL NOT NULL,
  metadata_tags         TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, working_set_id, version, semantic_ref_id)
);

CREATE INDEX idx_working_set_semantic_source
  ON agentic_working_set_semantic_refs (account_id, source_type, source_id);

CREATE TABLE agentic_working_set_procedures (
  account_id             BIGINT NOT NULL,
  working_set_id         UUID NOT NULL,
  version                BIGINT NOT NULL,
  procedure_id           UUID NOT NULL,
  procedure_version      BIGINT NOT NULL,
  intent                 TEXT NOT NULL,
  allowed_tools          TEXT[] NOT NULL,
  prohibited_actions     TEXT[] NOT NULL,
  instruction_checksum   BYTEA NOT NULL,
  PRIMARY KEY (account_id, working_set_id, version, procedure_id)
);

CREATE TABLE agentic_working_set_audit_events (
  account_id        BIGINT NOT NULL,
  audit_chain_id    UUID NOT NULL,
  event_id          UUID NOT NULL,
  event_type        TEXT NOT NULL CHECK (
    event_type IN ('created', 'activated', 'refreshed', 'consumed', 'retired')
  ),
  working_set_id    UUID NOT NULL,
  version           BIGINT NOT NULL,
  request_hash      BYTEA NOT NULL,
  previous_hash     BYTEA,
  event_hash        BYTEA NOT NULL,
  actor_type        TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id          UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_chain_id, event_id)
);

CREATE INDEX idx_working_set_audit_replay
  ON agentic_working_set_audit_events (
    account_id, working_set_id, version, created_at
  );
```

### Vector index compatibility

Semantic references should point to vectors stored in a tenant-partitioned index:

```sql
CREATE TABLE agentic_semantic_objects (
  account_id          BIGINT NOT NULL,
  semantic_object_id  UUID NOT NULL,
  source_type         TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  metadata_tags       TEXT[] NOT NULL DEFAULT '{}',
  embedding_model     TEXT NOT NULL,
  embedding           VECTOR(1536) NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, semantic_object_id)
);

CREATE INDEX idx_semantic_objects_hnsw
  ON agentic_semantic_objects
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX idx_semantic_objects_tenant_source
  ON agentic_semantic_objects (account_id, source_type, source_id);
```

The query planner must apply `account_id` and candidate caps before vector
expansion. If the vector backend cannot enforce tenant partition pruning before
HNSW traversal, use physically partitioned indexes by account shard.

## Open API GraphQL surface

Every API requires `accountId`; server-side auth still derives the effective
tenant scope and rejects mismatches.

```graphql
input AgenticWorkingSetCreateInput {
  accountId: ID!
  objective: String!
  tags: [String!]!
  boardAnchors: [BoardAnchorInput!]!
  semanticQuery: SemanticWorkingSetQueryInput
  procedureIds: [ID!]!
  guardrails: WorkingSetGuardrailsInput!
  expiresAt: DateTime!
}

input BoardAnchorInput {
  boardId: ID!
  itemIds: [ID!]
  columnIds: [ID!]!
  predicateHash: String
}

input SemanticWorkingSetQueryInput {
  queryText: String!
  metadataTags: [String!]!
  topK: Int!
  efSearch: Int
}

input WorkingSetGuardrailsInput {
  maxRowRefs: Int!
  maxSemanticRefs: Int!
  maxExpansionDepth: Int!
  maxToolCalls: Int!
  maxEstimatedReadRows: Int!
  maxVectorCandidates: Int!
  timeoutMs: Int!
  requireHumanReviewForWrites: Boolean!
}

type AgenticWorkingSet {
  accountId: ID!
  workingSetId: ID!
  version: Int!
  status: String!
  objective: String!
  tags: [String!]!
  rowRefCount: Int!
  semanticRefCount: Int!
  guardrails: WorkingSetGuardrails!
  sourceWatermarks: [WorkingSetWatermark!]!
  auditChainId: ID!
  lastEventHash: String!
  createdAt: DateTime!
  expiresAt: DateTime!
}

type Mutation {
  createAgenticWorkingSet(input: AgenticWorkingSetCreateInput!): AgenticWorkingSet!
  refreshAgenticWorkingSet(accountId: ID!, workingSetId: ID!): AgenticWorkingSet!
  retireAgenticWorkingSet(accountId: ID!, workingSetId: ID!): AgenticWorkingSet!
}

type Query {
  agenticWorkingSet(accountId: ID!, workingSetId: ID!): AgenticWorkingSet
  agenticWorkingSetRefs(
    accountId: ID!
    workingSetId: ID!
    first: Int!
    after: String
  ): AgenticWorkingSetRefConnection!
}
```

## Creation flow

1. **Authorize tenant scope**: resolve the caller's effective `account_id` and
   reject any input mismatch.
2. **Compile anchors**: require at least one deterministic board, item, view, or
   memory anchor. A free-text semantic query alone cannot create a working set.
3. **Estimate cost**: use board cardinality, column selectivity, vector `topK`,
   and expansion depth to compute estimated rows and candidates.
4. **Apply guardrails**: reject plans exceeding tenant budgets or system caps.
5. **Materialize references**: store references, not copied row payloads, so
   transaction reads continue to use mondayDB row storage.
6. **Attach procedures**: bind versioned instructions by checksum.
7. **Write audit event**: hash canonical request, estimates, references, and
   previous chain hash.

## Refresh flow

Working sets can refresh synchronously only when the estimated delta is below the
tenant's interactive threshold. Larger refreshes run through background compute
and transition status to `refresh_required` until a new version is available.

Refresh is deterministic:

- source watermarks define the exact delta window;
- semantic refresh uses the stored embedding model and query parameters;
- procedures are re-bound only when the caller requests a version change;
- audit events include both old and new reference counts.

## Agentic guardrails

| Risk | Guardrail |
| --- | --- |
| Recursive context expansion | `maxExpansionDepth` defaults to 1 for interactive agents and cannot exceed a tenant policy cap. |
| Expensive semantic fan-out | `topK`, `efSearch`, and `maxVectorCandidates` are bounded before vector search runs. |
| Cross-tenant leakage | All primary keys and indexes start with `account_id`; GraphQL rejects account mismatches. |
| Hidden write behavior | Working sets are read/control-plane artifacts; writes require transaction intents and optional human review. |
| Neighbor performance impact | Working set creation consumes workload-isolated agent budget, separate from user-facing board reads. |
| Non-replayable agent decisions | Every create, refresh, consume, and retire event records deterministic request and event hashes. |

## Performance checks for 1M+ row boards

Do not allow these requests to execute:

```sql
-- Full-scan risk: board predicate is not anchored by item, view, or indexed column.
SELECT item_id
FROM board_items
WHERE account_id = $1
  AND board_id = $2;

-- Full-scan risk: JSON predicate is not backed by a compiled column index.
SELECT item_id
FROM board_items
WHERE account_id = $1
  AND board_id = $2
  AND column_values @> $3;
```

Require one of these bounded patterns instead:

```sql
-- Direct item anchors.
SELECT item_id, version
FROM board_items
WHERE account_id = $1
  AND board_id = $2
  AND item_id = ANY($3)
LIMIT $4;

-- Indexed view anchors.
SELECT item_id, version
FROM board_view_memberships
WHERE account_id = $1
  AND board_id = $2
  AND view_id = $3
  AND item_id > $4
ORDER BY item_id
LIMIT $5;

-- Compiled column predicate with cardinality cap.
SELECT item_id, version
FROM board_column_value_index
WHERE account_id = $1
  AND board_id = $2
  AND column_id = $3
  AND normalized_value = $4
ORDER BY item_id
LIMIT $5;
```

For boards above 1M rows, creation should fail closed unless the estimator can
prove:

- `estimatedReadRows <= guardrails.maxEstimatedReadRows`;
- every predicate has an index or precomputed view membership;
- pagination is deterministic and ordered;
- vector search has tenant partitioning and `topK <= guardrails.maxSemanticRefs`;
- refresh deltas use watermarks instead of rescanning the full board.

## Audit hash contract

Use canonical JSON serialization and a stable hash function:

```ts
export interface WorkingSetAuditEventPayload {
  accountId: string;
  auditChainId: string;
  eventId: string;
  eventType: "created" | "activated" | "refreshed" | "consumed" | "retired";
  workingSetId: string;
  version: number;
  requestHash: string;
  previousHash?: string;
  referenceCounts: {
    rowRefs: number;
    columnarRefs: number;
    semanticRefs: number;
    procedures: number;
  };
  actor: {
    actorType: "user" | "agent" | "system";
    actorId: string;
  };
  createdAt: string;
}
```

`eventHash = sha256(canonicalJson(payloadWithoutEventHash))`.

This keeps the database deterministic while still letting probabilistic agents
consume the result. If two agents submit the same request against the same
watermarks, mondayDB can produce the same request hash and equivalent reference
set.

## LLM perception contract

Agents should receive a compact manifest instead of raw database internals:

```json
{
  "kind": "mondaydb.agenticWorkingSet",
  "account_id": "123",
  "working_set_id": "8b7e2ab9-21e7-4e9f-a2e3-9e5f53a20c31",
  "objective": "Prepare renewal-risk summary for enterprise accounts",
  "tags": ["renewal", "risk", "crm"],
  "freshness": {
    "policy": "bounded_staleness",
    "max_staleness_ms": 300000
  },
  "available_context": {
    "row_refs": 250,
    "semantic_refs": 40,
    "procedures": ["summarize-risk@3", "draft-update@2"]
  },
  "guardrails": {
    "max_expansion_depth": 1,
    "max_tool_calls": 5,
    "requires_human_review_for_writes": true
  }
}
```

The LLM sees what it may use, how fresh it is, and which procedures are
available. It does not receive authority to expand indefinitely or bypass
transaction and access-policy checks.

## Failure modes and deterministic outcomes

- **Stale source watermark**: return `refresh_required` with the exact source
  that changed; do not silently refresh inside a write transaction.
- **Budget exceeded**: return a typed error with estimated rows, vector
  candidates, and the violated guardrail.
- **Procedure checksum mismatch**: reject activation and require an explicit
  procedure version update.
- **Vector index unavailable**: create row/columnar refs only if the request
  marks semantic refs optional; otherwise fail closed.
- **Tenant policy changed**: retire active working sets that exceed the new
  policy and emit an audit event.

## Enterprise rollout posture

Start with read-only agent workflows such as summarization, risk review, and
support triage. Add write workflows only after transaction intents, human-review
policy, and audit replay are enabled for the tenant. This preserves enterprise
predictability while giving agents a practical memory substrate that is fast,
bounded, and explainable.
