# mondayDB Agentic Database Vision

## Why this matters

mondayDB already behaves like a high-performance WorkOS engine: it absorbs
frequent operational updates, supports schemaless board data, and separates
transactional row access from analytical columnar access. The next product leap
is to make mondayDB agent-ready without making the database itself
probabilistic.

The core trade-off is **latency and predictability vs. autonomous breadth**.
Agents want broad context, recursive retrieval, tool access, and long-term
memory. Enterprise customers need bounded latency, ACID writes, strict tenant
isolation, and deterministic audit trails. The product answer is an **Agentic
Control Plane** that compiles every agent request into deterministic envelopes
before it can touch row storage, columnar storage, vector indexes, or tools.

## Product principles

1. **Deterministic database, probabilistic clients**
   - LLMs may propose plans, but mondayDB only executes validated plans.
   - Every accepted plan records input hashes, memory versions, source
     watermarks, budgets, and policy decisions.
2. **Tenant scope is non-negotiable**
   - Every persisted record and every query path is keyed by `account_id`.
   - Vector search uses tenant-aware partitioning or filtered HNSW probes; no
     global nearest-neighbor search is allowed for customer data.
3. **Memory is a first-class data product**
   - Procedural memory stores reusable instructions for agents.
   - Semantic memory stores retrievable context references, not hidden magic.
4. **Guardrails precede execution**
   - Query cost, recursion depth, tool fan-out, vector `topK`, and consistency
     watermarks are checked before work is admitted.
5. **Open API first**
   - Agentic concepts must be expressible through the monday.com GraphQL API so
     customers can inspect, replay, and govern them.

## Core architecture

```text
Agent / App
    |
    v
GraphQL Open API
    |
    v
Agentic Control Plane
    |-- Policy compiler
    |-- Budget and recursion governor
    |-- Memory resolver
    |-- Deterministic plan verifier
    |-- Audit hash writer
    |
    +--> Row store: ACID updates and point reads
    +--> Columnar store: bounded analytics and aggregations
    +--> Vector index: tenant-scoped semantic retrieval
    +--> Tool gateway: leased, audited side-effect execution
```

The control plane does not replace mondayDB's row/columnar split. It routes
agentic workloads to the correct substrate after the request is constrained,
costed, and made auditable.

## TypeScript contracts

```ts
export type AgentWorkloadKind =
  | "row_read"
  | "row_write"
  | "columnar_aggregation"
  | "semantic_retrieval"
  | "hybrid_context"
  | "tool_execution";

export type ConsistencyMode = "strong" | "bounded_staleness" | "snapshot";

export interface AgenticExecutionEnvelope {
  account_id: string;
  envelope_id: string;
  actor_user_id: string;
  agent_id: string;
  purpose: string;
  workload_kind: AgentWorkloadKind;
  consistency_mode: ConsistencyMode;
  source_watermark: string;
  max_estimated_rows: number;
  max_vector_top_k: number;
  max_recursion_depth: number;
  max_tool_calls: number;
  deadline_ms: number;
  semantic_routes: SemanticRouteRef[];
  procedural_memory_refs: ProceduralMemoryRef[];
  audit_hash: string;
  created_at: string;
}

export interface SemanticRouteRef {
  account_id: string;
  route_id: string;
  index_name: string;
  embedding_model: string;
  hnsw_ef_search: number;
  metadata_filter: {
    board_ids?: string[];
    item_ids?: string[];
    visibility_labels?: string[];
    freshness_after_watermark?: string;
  };
}

export interface ProceduralMemoryRef {
  account_id: string;
  memory_id: string;
  version: number;
  instruction_hash: string;
  applies_to_workload: AgentWorkloadKind[];
  required_capabilities: string[];
}

export interface AgentPerceptionCard {
  account_id: string;
  object_id: string;
  object_type: "board" | "item" | "column" | "view" | "automation" | "doc";
  title: string;
  semantic_tags: string[];
  procedural_hints: string[];
  allowed_actions: string[];
  visibility_labels: string[];
  source_watermark: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_execution_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  workload_kind TEXT NOT NULL CHECK (
    workload_kind IN (
      'row_read',
      'row_write',
      'columnar_aggregation',
      'semantic_retrieval',
      'hybrid_context',
      'tool_execution'
    )
  ),
  consistency_mode TEXT NOT NULL CHECK (
    consistency_mode IN ('strong', 'bounded_staleness', 'snapshot')
  ),
  source_watermark TEXT NOT NULL,
  max_estimated_rows BIGINT NOT NULL,
  max_vector_top_k INT NOT NULL,
  max_recursion_depth INT NOT NULL,
  max_tool_calls INT NOT NULL,
  deadline_ms INT NOT NULL,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id)
);

CREATE TABLE agentic_procedural_memories (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  version INT NOT NULL,
  title TEXT NOT NULL,
  instruction_body TEXT NOT NULL,
  instruction_hash TEXT NOT NULL,
  applies_to_workload TEXT[] NOT NULL,
  required_capabilities TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'deprecated')),
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, version)
);

CREATE TABLE agentic_semantic_objects (
  account_id BIGINT NOT NULL,
  semantic_object_id UUID NOT NULL,
  source_object_type TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  board_id BIGINT,
  visibility_labels TEXT[] NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  source_watermark TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, semantic_object_id)
);

CREATE INDEX agentic_semantic_objects_hnsw_idx
  ON agentic_semantic_objects
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX agentic_semantic_objects_scope_idx
  ON agentic_semantic_objects (account_id, board_id, source_object_type);

CREATE TABLE agentic_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_execution_envelopes (account_id, envelope_id)
);
```

### Schema constraints

- `account_id` is the leading key in every table and index used by agentic
  workloads.
- Embeddings are stored only for metadata projections that the tenant is
  allowed to expose to agents.
- Audit rows store deterministic hashes and references; they should not store
  raw redacted values.
- Procedural memory is versioned because agents must cite the exact instruction
  set used during execution.

## Open API GraphQL shape

```graphql
type AgenticExecutionEnvelope {
  accountId: ID!
  envelopeId: ID!
  agentId: String!
  purpose: String!
  workloadKind: String!
  consistencyMode: String!
  sourceWatermark: String!
  maxEstimatedRows: Int!
  maxVectorTopK: Int!
  maxRecursionDepth: Int!
  maxToolCalls: Int!
  auditHash: String!
  proceduralMemoryRefs: [ProceduralMemoryRef!]!
  semanticRoutes: [SemanticRouteRef!]!
}

type AgentPerceptionCard {
  accountId: ID!
  objectId: ID!
  objectType: String!
  title: String!
  semanticTags: [String!]!
  proceduralHints: [String!]!
  allowedActions: [String!]!
  visibilityLabels: [String!]!
  sourceWatermark: String!
}

input CreateAgenticEnvelopeInput {
  accountId: ID!
  agentId: String!
  purpose: String!
  workloadKind: String!
  consistencyMode: String!
  maxEstimatedRows: Int!
  maxVectorTopK: Int!
  maxRecursionDepth: Int!
  maxToolCalls: Int!
  deadlineMs: Int!
  boardIds: [ID!]
  requiredCapabilities: [String!]
}

type Query {
  agenticPerceptionCards(
    accountId: ID!
    boardIds: [ID!]
    semanticTags: [String!]
    first: Int!
  ): [AgentPerceptionCard!]!

  agenticExecutionEnvelope(
    accountId: ID!
    envelopeId: ID!
  ): AgenticExecutionEnvelope
}

type Mutation {
  createAgenticExecutionEnvelope(
    input: CreateAgenticEnvelopeInput!
  ): AgenticExecutionEnvelope!
}
```

The GraphQL API exposes what the agent is allowed to perceive and what the
database agreed to execute. It does not expose an unconstrained "ask the DB
anything" endpoint.

## Query admission guardrails

Before execution, the control plane should reject or reshape requests when any
of these checks fail:

| Guardrail | Why | Deterministic rule |
| --- | --- | --- |
| Tenant scope | Prevent data leakage | Require `account_id` in every route, predicate, memory ref, and tool lease |
| Row estimate | Protect 1M+ row boards | Reject row paths whose estimated rows exceed `max_estimated_rows` |
| Vector fan-out | Protect HNSW latency | Clamp `topK`, `ef_search`, and metadata filters per tenant tier |
| Recursion depth | Prevent agent loops | Reject plans above `max_recursion_depth`; record loop fingerprint |
| Tool calls | Bound side effects | Require leased tools and decrement `max_tool_calls` before invocation |
| Freshness | Avoid stale decisions | Compare requested consistency to row, columnar, and vector watermarks |
| Neighbor impact | Maintain availability | Queue or reject when tenant or shard budget is exhausted |

## Performance checks for 1M+ row boards

Any proposal that lacks the following should be treated as a full-table-scan
risk:

- A leading `account_id` predicate.
- A bounded `board_id`, `item_id`, or indexed metadata filter.
- A row estimate produced before execution.
- A columnar path for large aggregations instead of row-store iteration.
- A vector `topK` cap and an HNSW-compatible metadata filter.
- A deadline and cancellation token propagated to all storage layers.

For hybrid retrieval, the preferred plan is:

1. Use tenant-scoped vector search to find a small candidate set.
2. Rehydrate candidates through row storage by `(account_id, item_id)`.
3. Run large aggregations on columnar storage only after candidate bounds are
   known.
4. Return perception cards with source watermarks and audit hashes.

## Agent-ready perception model

Agents should perceive mondayDB as a set of bounded cards rather than raw table
access:

```ts
export interface AgentContextPacket {
  account_id: string;
  envelope_id: string;
  perception_cards: AgentPerceptionCard[];
  memory_instructions: {
    memory_id: string;
    version: number;
    title: string;
    instruction_excerpt: string;
  }[];
  allowed_next_actions: {
    action: string;
    required_capability: string;
    remaining_budget: number;
  }[];
  audit_hash: string;
}
```

This makes the LLM's context explicit. The model can see semantic tags,
procedural hints, allowed actions, and freshness metadata, while mondayDB keeps
policy enforcement outside the prompt.

## Rollout posture

1. **Observe**
   - Emit audit-only envelopes for existing API-driven automations.
   - Measure estimated rows, vector fan-out, tool fan-out, and rejected plan
     rates without changing execution.
2. **Constrain**
   - Require envelopes for semantic retrieval and tool execution.
   - Enforce tenant-scoped vector filters and topK limits.
3. **Transact**
   - Add ACID write intents for agent-initiated mutations.
   - Require deterministic replay packets for support and compliance.
4. **Optimize**
   - Move validated aggregation-heavy workloads to columnar paths.
   - Tune HNSW partitions by account tier and board cardinality.

## Strategic product stance

mondayDB should not market "AI inside the database" as hidden behavior. The
enterprise-safe positioning is stronger: **mondayDB is the deterministic system
of record and control plane that lets agents safely perceive, remember, reason
over, and act on WorkOS data.**

That stance preserves the existing reliability promise while making agentic
capabilities inspectable, governable, and performant at monday.com scale.
