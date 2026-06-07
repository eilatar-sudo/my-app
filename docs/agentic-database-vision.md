# mondayDB Agentic Database Vision

## Executive thesis

The product opportunity is to make mondayDB the deterministic substrate that
agents can trust, not a probabilistic database engine. Agents may reason,
summarize, and select tools probabilistically, but mondayDB should expose
bounded, auditable, tenant-scoped primitives for retrieval, memory, and action
preflight.

The main trade-off is latency versus certainty. Direct vector retrieval gives an
agent fast context, but enterprise customers need proof that every retrieved
fact was scoped to the correct `account_id`, derived from a known data
watermark, and admitted under predictable workload budgets. The proposed design
keeps the row store authoritative for transactions, uses the columnar layer for
large aggregations, and adds deterministic agent control planes around semantic
indexes and procedural memory.

## Product principles

1. **Deterministic core, probabilistic edge.** LLMs can consume mondayDB
   context, but mondayDB only stores deterministic records, watermarks, budget
   decisions, and audit hashes.
2. **Tenant scope is part of every key.** Every table, vector namespace,
   GraphQL resolver, and cache key is prefixed by `account_id`.
3. **Memory is data, not magic.** Procedural memory records are versioned
   instructions with owners, scopes, and review state. Semantic memory records
   are source-grounded embeddings with replayable provenance.
4. **No unbounded agent loops.** Recursive retrieval, tool use, and query
   expansion are admitted by explicit budgets before execution.
5. **Open API first.** The same GraphQL contracts available to monday.com apps
   should expose agent memory, retrieval envelopes, and audit packets.

## Architecture overview

```
Agent / LLM
    |
    v
Open API GraphQL
    |
    v
Agentic Control Plane
    |-- retrieval envelope planner
    |-- procedure memory resolver
    |-- query budget ledger
    |-- audit and replay ledger
    |
    v
mondayDB Execution Plane
    |-- row store for ACID writes and current item state
    |-- columnar store for aggregates and scans
    |-- tenant-partitioned vector index for semantic recall
```

This keeps mondayDB compatible with decoupled storage and compute. Compute
workers can build context packets near the query path, while storage keeps
immutable audit and memory records partitioned by tenant.

## Core concepts

### 1. Agent context packet

**Why:** Agents need compact context that feels like memory, but WorkOS queries
must remain predictable. A context packet freezes the exact rows, columnar
aggregates, semantic hits, and procedural instructions that an agent is allowed
to see for a single turn.

**How:** The packet is created after policy checks, budget admission, and
freshness selection. It is immutable and replayable.

```ts
export interface AgentContextPacket {
  account_id: string;
  packet_id: string;
  actor_id: string;
  agent_id: string;
  board_ids: string[];
  purpose: "answer" | "plan" | "write_preflight" | "automation_review";
  row_refs: RowReference[];
  columnar_refs: ColumnarReference[];
  semantic_refs: SemanticReference[];
  procedure_refs: ProcedureReference[];
  freshness: FreshnessEnvelope;
  budget_receipt_id: string;
  audit_hash: string;
  created_at: string;
  expires_at: string;
}

export interface RowReference {
  board_id: string;
  item_id: string;
  column_ids: string[];
  row_version: string;
}

export interface ColumnarReference {
  board_id: string;
  metric: string;
  filter_hash: string;
  aggregate_watermark: string;
}

export interface SemanticReference {
  memory_id: string;
  vector_namespace: string;
  score: number;
  source_watermark: string;
  metadata_tags: string[];
}

export interface ProcedureReference {
  procedure_id: string;
  procedure_version: number;
  applicability_score: number;
}

export interface FreshnessEnvelope {
  row_watermark: string;
  columnar_watermark: string;
  vector_watermark: string;
  max_staleness_ms: number;
}
```

### 2. Agent memory record

**Why:** Long-term memory is useful only if it is source-grounded and reviewable.
The database should store "what an agent may remember" without letting an LLM
silently mutate business truth.

**How:** Memory records are derived asynchronously from deterministic events,
manual reviews, or approved procedure changes. Semantic embeddings are attached
to records, but the record text and provenance remain canonical.

```ts
export interface AgentMemoryRecord {
  account_id: string;
  memory_id: string;
  memory_type: "semantic_fact" | "procedural_instruction" | "preference" | "policy_hint";
  source_type: "board_item" | "doc" | "automation_run" | "human_review" | "system_policy";
  source_ref: string;
  board_id?: string;
  title: string;
  body: string;
  metadata_tags: string[];
  embedding_model: string;
  vector_namespace: string;
  vector_id: string;
  review_state: "draft" | "approved" | "deprecated";
  owner_actor_id: string;
  source_watermark: string;
  audit_hash: string;
  created_at: string;
  updated_at: string;
}
```

### 3. Retrieval envelope

**Why:** Semantic retrieval can accidentally become an expensive recursive
workflow: vector search leads to row hydration, which leads to broader searches,
which leads to more hydration. The retrieval envelope converts that behavior
into an explicit, deterministic plan.

**How:** Before execution, the planner estimates vector probes, row lookups,
columnar scans, and tool calls. The envelope is rejected or downgraded when it
would exceed tenant, board, or agent budgets.

```ts
export interface RetrievalEnvelope {
  account_id: string;
  envelope_id: string;
  agent_id: string;
  intent_hash: string;
  allowed_board_ids: string[];
  vector_top_k: number;
  max_row_hydrations: number;
  max_columnar_partitions: number;
  max_recursive_depth: number;
  max_tool_calls: number;
  estimated_cost_units: number;
  consistency_mode: "latest_row" | "bounded_staleness" | "snapshot";
  decision: "admit" | "admit_with_limits" | "reject";
  decision_reason: string;
  audit_hash: string;
  created_at: string;
}
```

### 4. Agentic audit event

**Why:** Enterprise buyers need deterministic traceability: what context was
shown, why it was allowed, and what changed afterward. Auditability is also the
safety valve for agent autonomy.

**How:** Each context packet, memory write, retrieval envelope, and action
preflight emits an immutable event hash chained per account.

```ts
export interface AgenticAuditEvent {
  account_id: string;
  event_id: string;
  event_type:
    | "memory_created"
    | "memory_approved"
    | "retrieval_envelope_decided"
    | "context_packet_created"
    | "agent_action_preflighted"
    | "agent_action_committed";
  actor_id: string;
  agent_id?: string;
  object_id: string;
  object_version?: string;
  request_hash: string;
  result_hash: string;
  previous_event_hash: string;
  audit_hash: string;
  created_at: string;
}
```

## SQL storage model

The examples below use PostgreSQL-style DDL with `pgvector` notation for
clarity. In mondayDB, the same constraints should map to the decoupled storage
and compute architecture: row-oriented metadata for transactional updates,
columnar projections for reporting, and account-partitioned vector namespaces
for HNSW search.

```sql
CREATE TABLE agent_memory_records (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  memory_type TEXT NOT NULL CHECK (
    memory_type IN (
      'semantic_fact',
      'procedural_instruction',
      'preference',
      'policy_hint'
    )
  ),
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  board_id BIGINT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_tags JSONB NOT NULL DEFAULT '[]',
  embedding_model TEXT NOT NULL,
  vector_namespace TEXT NOT NULL,
  vector_id UUID NOT NULL,
  review_state TEXT NOT NULL CHECK (
    review_state IN ('draft', 'approved', 'deprecated')
  ),
  owner_actor_id BIGINT NOT NULL,
  source_watermark TEXT NOT NULL,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agent_memory_records_board_idx
  ON agent_memory_records (account_id, board_id, review_state, updated_at DESC);

CREATE INDEX agent_memory_records_tags_idx
  ON agent_memory_records
  USING GIN (metadata_tags)
  WHERE review_state = 'approved';

CREATE TABLE agent_memory_vectors (
  account_id BIGINT NOT NULL,
  vector_namespace TEXT NOT NULL,
  vector_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  source_watermark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, vector_namespace, vector_id)
);

CREATE INDEX agent_memory_vectors_hnsw_idx
  ON agent_memory_vectors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE agent_context_packets (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  board_ids BIGINT[] NOT NULL,
  row_refs JSONB NOT NULL,
  columnar_refs JSONB NOT NULL,
  semantic_refs JSONB NOT NULL,
  procedure_refs JSONB NOT NULL,
  freshness JSONB NOT NULL,
  budget_receipt_id UUID NOT NULL,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, packet_id)
);

CREATE INDEX agent_context_packets_actor_idx
  ON agent_context_packets (account_id, actor_id, created_at DESC);

CREATE TABLE agent_retrieval_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  allowed_board_ids BIGINT[] NOT NULL,
  vector_top_k INT NOT NULL,
  max_row_hydrations INT NOT NULL,
  max_columnar_partitions INT NOT NULL,
  max_recursive_depth INT NOT NULL,
  max_tool_calls INT NOT NULL,
  estimated_cost_units BIGINT NOT NULL,
  consistency_mode TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('admit', 'admit_with_limits', 'reject')
  ),
  decision_reason TEXT NOT NULL,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE INDEX agent_retrieval_envelopes_agent_idx
  ON agent_retrieval_envelopes (account_id, agent_id, created_at DESC);

CREATE TABLE agentic_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id BIGINT NOT NULL,
  agent_id TEXT,
  object_id TEXT NOT NULL,
  object_version TEXT,
  request_hash TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  previous_event_hash TEXT NOT NULL,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_audit_events_object_idx
  ON agentic_audit_events (account_id, object_id, created_at DESC);
```

### Vector partitioning note

The HNSW index must never be queried without an `account_id` filter and a
tenant-specific `vector_namespace`. For very large accounts, split namespaces by
board family or product domain, for example:

```
account:{account_id}:board:{board_id}:memory:v1
account:{account_id}:workspace:{workspace_id}:procedures:v1
```

This prevents semantic recall from blending tenants and lets compute route
queries to the smallest useful graph.

## Open API GraphQL shape

Every concept should be exposed via monday.com Open API so first-party and
third-party agents use the same deterministic contracts.

```graphql
type AgentMemoryRecord {
  accountId: ID!
  memoryId: ID!
  memoryType: AgentMemoryType!
  sourceType: String!
  sourceRef: String!
  boardId: ID
  title: String!
  body: String!
  metadataTags: [String!]!
  reviewState: AgentMemoryReviewState!
  sourceWatermark: String!
  auditHash: String!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AgentContextPacket {
  accountId: ID!
  packetId: ID!
  agentId: String!
  purpose: AgentContextPurpose!
  boardIds: [ID!]!
  semanticRefs: [SemanticReference!]!
  procedureRefs: [ProcedureReference!]!
  budgetReceiptId: ID!
  auditHash: String!
  expiresAt: DateTime!
}

type RetrievalEnvelopeDecision {
  envelopeId: ID!
  decision: RetrievalDecision!
  decisionReason: String!
  vectorTopK: Int!
  maxRowHydrations: Int!
  maxRecursiveDepth: Int!
  estimatedCostUnits: Int!
  auditHash: String!
}

input CreateAgentMemoryInput {
  accountId: ID!
  memoryType: AgentMemoryType!
  sourceType: String!
  sourceRef: String!
  boardId: ID
  title: String!
  body: String!
  metadataTags: [String!]!
}

input PlanRetrievalEnvelopeInput {
  accountId: ID!
  agentId: String!
  intent: String!
  boardIds: [ID!]!
  requestedTopK: Int!
  requestedConsistencyMode: ConsistencyMode!
}

input BuildAgentContextPacketInput {
  accountId: ID!
  envelopeId: ID!
  purpose: AgentContextPurpose!
}

type Query {
  agentMemories(
    accountId: ID!
    boardId: ID
    memoryType: AgentMemoryType
    tags: [String!]
    first: Int = 25
  ): [AgentMemoryRecord!]!

  agentContextPacket(accountId: ID!, packetId: ID!): AgentContextPacket
}

type Mutation {
  createAgentMemory(input: CreateAgentMemoryInput!): AgentMemoryRecord!
  approveAgentMemory(accountId: ID!, memoryId: ID!): AgentMemoryRecord!
  planRetrievalEnvelope(
    input: PlanRetrievalEnvelopeInput!
  ): RetrievalEnvelopeDecision!
  buildAgentContextPacket(
    input: BuildAgentContextPacketInput!
  ): AgentContextPacket!
}
```

Resolver invariants:

- Reject requests where `accountId` does not match the authenticated tenant.
- Require board authorization before retrieval or packet creation.
- Enforce `first <= 100` for list queries and `requestedTopK <= 50` for semantic
  retrieval unless an enterprise policy grants higher limits.
- Emit `agentic_audit_events` for every mutation and every admitted context
  packet.

## Query planning and guardrails

### Admission rules

1. **Tenant isolation:** Every logical plan starts with
   `WHERE account_id = :account_id`.
2. **Board scope:** Agent prompts cannot discover boards by semantic expansion
   unless the user or policy has already supplied an authorized board set.
3. **Budget reservation:** Vector probes, row hydrations, columnar partitions,
   and tool calls consume a budget receipt before execution.
4. **Depth limits:** Retrieval recursion defaults to depth `1`. Increasing to
   depth `2` requires a stricter top-k cap and an explicit audit reason.
5. **Freshness declaration:** Each packet states whether it is based on latest
   row state, bounded staleness, or a snapshot.

### Cost model sketch

```ts
export interface AgenticCostEstimate {
  account_id: string;
  vector_probe_count: number;
  vector_top_k: number;
  row_hydration_count: number;
  columnar_partition_count: number;
  recursive_depth: number;
  tool_call_count: number;
  estimated_cost_units: number;
  full_scan_risk: "none" | "possible" | "likely";
}

export function estimateAgenticCost(input: {
  vectorProbeCount: number;
  vectorTopK: number;
  rowHydrationCount: number;
  columnarPartitionCount: number;
  recursiveDepth: number;
  toolCallCount: number;
}): number {
  return (
    input.vectorProbeCount * Math.max(input.vectorTopK, 1) +
    input.rowHydrationCount * 2 +
    input.columnarPartitionCount * 10 +
    input.recursiveDepth * 25 +
    input.toolCallCount * 50
  );
}
```

The exact coefficients should be tuned from production telemetry, but the
important product behavior is stable: agents see deterministic "admitted",
"admitted with limits", or "rejected" decisions before work begins.

## Performance checks for boards with 1M+ rows

Flag and reject or rewrite any proposal with these properties:

- Missing `account_id` equality predicate.
- Missing board, workspace, or namespace bound before vector retrieval.
- `topK > 50` without a pre-approved enterprise policy.
- JSON metadata filters that are not backed by an account-prefixed GIN or
  materialized projection index.
- Row hydration after vector search that exceeds the envelope's
  `max_row_hydrations`.
- Columnar aggregate requests without partition pruning by account, board, time
  window, or indexed status dimension.
- Recursive retrieval where the output of one vector query becomes the prompt
  for another without a new budget receipt.
- Procedure memory lookup that searches all approved procedures across an
  account instead of a bounded workspace, board family, or tag namespace.

The safe default for large boards is:

```sql
-- Safe shape: tenant, board, review state, and bounded vector namespace.
SELECT m.account_id, m.memory_id, m.title, m.body, v.source_watermark
FROM agent_memory_vectors v
JOIN agent_memory_records m
  ON m.account_id = v.account_id
 AND m.memory_id = v.memory_id
WHERE v.account_id = :account_id
  AND v.vector_namespace = :vector_namespace
  AND m.board_id = :board_id
  AND m.review_state = 'approved'
ORDER BY v.embedding <=> :query_embedding
LIMIT :top_k;
```

## Agent perception model

An LLM should not perceive mondayDB as a raw table dump. It should perceive a
bounded, typed context bundle:

```json
{
  "tenant_scope": "account:123",
  "purpose": "write_preflight",
  "freshness": {
    "row_watermark": "row_wm_2026_06_07_0001",
    "vector_watermark": "vec_wm_2026_06_07_0000"
  },
  "semantic_memories": [
    {
      "title": "Escalation workflow for enterprise renewals",
      "tags": ["procedure", "renewal", "enterprise"],
      "source": "automation_run:9981",
      "score": 0.91
    }
  ],
  "procedures": [
    {
      "title": "Before changing a renewal date",
      "version": 4,
      "steps": [
        "Check account owner approval",
        "Verify no active billing hold",
        "Create a write intent before committing"
      ]
    }
  ],
  "limits": {
    "max_row_hydrations_remaining": 20,
    "max_tool_calls_remaining": 2,
    "recursive_depth_remaining": 0
  }
}
```

This metadata tagging makes RAG safer: the agent receives facts, procedures,
freshness, and limits as first-class data rather than hidden prompt text.

## Rollout path

### Phase 1: Read-only agent context

- Add approved memory records and tenant-partitioned vector namespaces.
- Expose `planRetrievalEnvelope` and `buildAgentContextPacket` over GraphQL.
- Emit audit events for retrieval decisions and packet creation.
- Limit use cases to answer generation and automation review.

### Phase 2: Procedural memory and preflight

- Add versioned procedural instructions and approval workflow.
- Bind procedure memory to board families, workspaces, or capability tags.
- Require action preflight packets before any agent-initiated write.

### Phase 3: Governed writes

- Introduce write intents that reserve budget and validate permissions.
- Commit through existing ACID row-store paths only.
- Attach context packet IDs and audit hashes to every agent-originated write.

### Phase 4: Optimization

- Materialize columnar projections for high-volume memory analytics.
- Tune HNSW namespace partitioning from production recall and latency metrics.
- Add semantic cache entries only when source watermarks and policy hashes match.

## Success metrics

- **Safety:** 100% of agent context packets include `account_id`,
  authorization scope, budget receipt, and audit hash.
- **Predictability:** P99 retrieval envelope planning stays below the internal
  interactive latency budget before any vector or row hydration work starts.
- **Recall quality:** Approved semantic memory retrieval improves accepted agent
  answer rate without increasing unauthorized access denials.
- **Cost control:** Recursive retrieval rejections and downgraded top-k decisions
  are visible in tenant-level admin telemetry.
- **Enterprise trust:** Support can replay any agent action from audit events,
  context packet, source watermarks, and row versions.

## Bottom line

mondayDB becomes an agentic database by making memory, retrieval, and tool-use
readiness explicit database products. The database should not "think" for the
agent. It should deterministically decide what the agent may see, what it may
remember, how much work it may trigger, and how every decision can be audited.
