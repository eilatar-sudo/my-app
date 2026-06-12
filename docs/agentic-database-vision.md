# mondayDB Agentic Database Vision

## Why this plane exists

mondayDB already optimizes for high-scale WorkOS workloads: schemaless boards,
low-latency operational reads, transactional updates, and analytical scans over
large tenants. The agentic era adds a new access pattern: autonomous systems
need to perceive context, retrieve durable memory, and propose tool actions
without turning probabilistic planning into nondeterministic database behavior.

The product trade-off is intentional:

- **Latency vs. consistency:** agent context can include asynchronously enriched
  semantic memory, but every response must declare the row, columnar, and vector
  watermarks used. Agents may tolerate slightly stale memory for retrieval, while
  transactional writes still require ACID row-store validation.
- **Agent capability vs. tenant isolation:** richer retrieval increases the risk
  of cross-board or cross-account leakage. Every physical table, API resolver,
  vector index, and audit event is scoped by `account_id` first.
- **Exploration vs. predictability:** agents can ask broad questions, but the
  planner must compile them into bounded retrieval envelopes with deterministic
  cost estimates, recursion limits, and audit hashes.

This document defines an agentic control surface that keeps mondayDB
deterministic while giving LLMs structured, metadata-rich context.

## Product principles

1. **The database stores facts, constraints, and procedural memory; it does not
   improvise.** LLMs may rank or summarize outside the core engine, but mondayDB
   returns replayable records and deterministic guardrail decisions.
2. **Semantic retrieval is an indexed access path, not a bypass.** pgvector/HNSW
   compatible indexes are tenant-partitioned and joined back to source records
   using `account_id`, `board_id`, and stable object identifiers.
3. **Every agent-visible packet is auditable.** Context assembly, budget
   reservation, retrieval, tool preflight, and write intent events are chained by
   deterministic hashes.
4. **No unbounded agent loops.** Recursive retrieval, tool execution, and
   aggregation fan-out are capped before execution, not after resource use.

## Architecture overview

```text
Agent / LLM
    |
    | Open API GraphQL
    v
Agentic Gateway
    - authenticates account/user/app
    - compiles deterministic execution envelope
    - reserves query/tool/vector budget
    |
    +--> Row Store: ACID board updates and point reads
    +--> Columnar Store: tenant-scoped analytics and aggregations
    +--> Vector Store: account-partitioned HNSW semantic retrieval
    +--> Audit Ledger: immutable replay and cost trace
```

The gateway is the only agent-facing entry point. It translates agent intent
into bounded database operations and returns an explicit perception packet rather
than hidden prompt magic.

## Enterprise stability requirements

- **Availability:** agentic retrieval, enrichment, and tool preflight must fail
  closed without impacting core board reads and writes. The row store remains
  the source of truth for ACID operations required to maintain 99.99%
  availability targets.
- **Isolation:** compute admission is scoped per `account_id` and per workload
  surface, so vector probes or columnar scans from one tenant cannot exhaust
  neighbor capacity.
- **Replayability:** every accepted or rejected plan records the same input
  packet, deterministic plan hash, budget reservation, and source watermarks
  needed for support and compliance replay.
- **Schemaless compatibility:** agent-facing schema hints describe board
  semantics without requiring a blocking migration of existing schemaless board
  data.

## TypeScript contracts

```ts
export type AgenticSurface = "row" | "columnar" | "vector" | "tool";

export interface AgentContextPacket {
  account_id: string;
  packet_id: string;
  actor_user_id: string;
  app_id?: string;
  board_ids: string[];
  objective: string;
  surfaces: AgenticSurface[];
  row_watermark: string;
  columnar_watermark: string;
  vector_watermark: string;
  procedural_memory_refs: ProceduralMemoryRef[];
  retrieval_envelope: RetrievalEnvelope;
  guardrail_decision: GuardrailDecision;
  audit_hash: string;
  created_at: string;
}

export interface ProceduralMemoryRef {
  account_id: string;
  memory_id: string;
  version: number;
  title: string;
  instruction_kind: "workflow" | "policy" | "schema_hint" | "tool_usage";
  applies_to_board_ids: string[];
  semantic_tags: string[];
  source_event_hash: string;
}

export interface RetrievalEnvelope {
  account_id: string;
  envelope_id: string;
  query_text: string;
  top_k: number;
  min_score: number;
  allowed_board_ids: string[];
  allowed_column_ids: string[];
  hnsw_namespace: string;
  max_expanded_rows: number;
  max_columnar_partitions: number;
  recursion_depth: number;
  estimated_cost_units: number;
}

export interface GuardrailDecision {
  account_id: string;
  decision_id: string;
  status: "approved" | "requires_review" | "rejected";
  reasons: string[];
  max_runtime_ms: number;
  max_tool_calls: number;
  max_vector_queries: number;
  max_row_reads: number;
  max_columnar_scan_bytes: number;
  deterministic_plan_hash: string;
}
```

Agent perception metadata lives beside the data returned to the LLM. The model
can see why each object was included, which memory or policy applies, and which
surfaces are safe to use next.

## SQL schema sketch

```sql
CREATE TABLE agent_context_packets (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  app_id BIGINT,
  objective TEXT NOT NULL,
  board_ids BIGINT[] NOT NULL,
  surfaces TEXT[] NOT NULL,
  row_watermark TEXT NOT NULL,
  columnar_watermark TEXT NOT NULL,
  vector_watermark TEXT NOT NULL,
  guardrail_decision_id UUID NOT NULL,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id)
);

CREATE TABLE agent_procedural_memory (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  version INTEGER NOT NULL,
  instruction_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  applies_to_board_ids BIGINT[] NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  source_event_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, version)
);

CREATE TABLE agent_memory_embeddings (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  version INTEGER NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  hnsw_namespace TEXT NOT NULL,
  vector_watermark TEXT NOT NULL,
  PRIMARY KEY (account_id, memory_id, version)
);

CREATE INDEX agent_memory_embeddings_hnsw
  ON agent_memory_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE agent_guardrail_decisions (
  account_id BIGINT NOT NULL,
  decision_id UUID NOT NULL,
  status TEXT NOT NULL,
  reasons TEXT[] NOT NULL,
  max_runtime_ms INTEGER NOT NULL,
  max_tool_calls INTEGER NOT NULL,
  max_vector_queries INTEGER NOT NULL,
  max_row_reads INTEGER NOT NULL,
  max_columnar_scan_bytes BIGINT NOT NULL,
  deterministic_plan_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, decision_id)
);

CREATE TABLE agent_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  prior_event_hash BYTEA,
  event_kind TEXT NOT NULL,
  packet_id UUID,
  payload_hash BYTEA NOT NULL,
  deterministic_plan_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);
```

In production, HNSW indexes should be physically partitioned by `account_id` or
by an account-derived shard key before applying vector similarity. If the engine
cannot guarantee pre-filtered tenant partitions, vector search must be rejected
for enterprise accounts.

## Open API GraphQL surface

```graphql
input AgentContextRequestInput {
  accountId: ID!
  boardIds: [ID!]!
  objective: String!
  surfaces: [AgenticSurface!]!
  maxRuntimeMs: Int!
  maxToolCalls: Int!
  maxVectorQueries: Int!
  topK: Int!
}

type AgentContextPacket {
  accountId: ID!
  packetId: ID!
  objective: String!
  rowWatermark: String!
  columnarWatermark: String!
  vectorWatermark: String!
  proceduralMemory: [ProceduralMemory!]!
  retrievalEnvelope: RetrievalEnvelope!
  guardrailDecision: GuardrailDecision!
  auditHash: String!
}

type Mutation {
  createAgentContextPacket(input: AgentContextRequestInput!): AgentContextPacket!
}
```

Resolvers must derive `accountId` from the authenticated token and compare it to
the requested value. A mismatch is a deterministic authorization failure and is
written to the audit ledger.

## Performance checks for 1M+ row boards

Any proposal that violates these checks risks full table scans or neighbor
impact:

- Reject requests without an `account_id` equality predicate at the first access
  path.
- Reject vector queries with unbounded `top_k`, missing HNSW namespace, or a
  post-filter-only tenant condition.
- Require `board_id` or a verified schema contract before expanding row-store
  candidates into columnar aggregations.
- Cap `max_expanded_rows` before hydrating semantic hits into full item payloads.
- Charge columnar bytes and vector probes to the same tenant budget ledger so an
  agent cannot evade limits by alternating access paths.
- Stop recursive retrieval when `recursion_depth > 1` unless a reviewed
  procedural memory explicitly grants a higher bound.

## Agent-ready perception packet

An LLM should receive data in a shape like:

```json
{
  "packet_id": "018f...",
  "objective": "Prepare a risk summary for renewal board items",
  "allowed_actions": ["read_rows", "run_bounded_aggregation"],
  "semantic_tags": ["renewal", "risk", "customer_health"],
  "procedural_memory": [
    {
      "title": "Renewal risk triage policy",
      "instruction_kind": "workflow",
      "version": 4,
      "applies_to_board_ids": ["123"]
    }
  ],
  "guardrails": {
    "max_vector_queries": 2,
    "max_row_reads": 500,
    "max_columnar_scan_bytes": 104857600,
    "recursion_depth": 1
  },
  "watermarks": {
    "row": "row-lsn-945",
    "columnar": "col-snapshot-812",
    "vector": "vec-watermark-301"
  }
}
```

This lets an agent understand the boundaries of its context without relying on
hidden system prompts. It also gives support and security teams a replayable
record of what the agent was allowed to perceive.

## Deterministic rollout sequence

1. Ship read-only context packets and guardrail decisions for internal agents.
2. Add procedural memory records sourced from reviewed audit events.
3. Enable account-partitioned semantic retrieval with strict `top_k` and budget
   caps.
4. Expose GraphQL context packet creation to trusted apps.
5. Gate tool execution and write intents behind the same envelope and audit
   hash chain.

Each phase should preserve ACID writes, tenant isolation, and deterministic
auditability before increasing agent autonomy.
