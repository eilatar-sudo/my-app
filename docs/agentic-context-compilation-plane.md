# Agentic Context Compilation Plane

## Why this plane matters

mondayDB can become an agentic database only if agents receive useful context without
turning the database engine itself into a probabilistic system. The context
compilation plane is a deterministic boundary that converts row records, columnar
aggregates, vector hits, procedural memory, tool affordances, and policy decisions
into a bounded context packet that an LLM can read.

The core product trade-off is latency versus consistency:

- Low latency requires preflight planning, small bounded source reads, and reuse of
  compiled packets when source watermarks have not changed.
- Strong consistency requires every packet to declare the exact row, columnar,
  vector, and procedural watermarks it was compiled from.
- Enterprise predictability requires the packet to be replayable from deterministic
  inputs, even if the downstream agent uses probabilistic reasoning.

This keeps mondayDB's data layer ACID-compliant and auditable while making the
agent's perception explicit, scoped, and safe for multi-tenant WorkOS scale.

## Product surface

The context compilation plane answers one question:

> "Given this tenant, board/workflow scope, purpose, and budget, what exact context
> may an agent see before it plans or acts?"

It should be invoked before agent planning, semantic retrieval fan-out, tool use, or
write intent creation. The output is not a prompt; it is a database-owned context
packet with stable IDs, source references, visibility decisions, and audit hashes.

## Success criteria

1. Every compiled packet is scoped by `account_id`.
2. Every source read has an indexed tenant predicate or a bounded source reference.
3. Every semantic retrieval path is compatible with pgvector/HNSW and tenant
   partitioning.
4. Every packet carries procedural memory references as instructions, not hidden
   behavior.
5. Every compile decision is auditable with deterministic hashes and source
   watermarks.
6. Expensive recursive agent queries are rejected or degraded before execution.

## TypeScript contracts

```ts
export type ContextSourceKind =
  | "row"
  | "columnar_aggregate"
  | "vector_hit"
  | "procedure_memory"
  | "tool_affordance"
  | "policy_decision"
  | "lineage_anchor"
  | "evidence_packet";

export type ContextBlockKind =
  | "facts"
  | "metrics"
  | "instructions"
  | "constraints"
  | "citations"
  | "tool_options"
  | "redactions";

export type ContextCompileDecision =
  | "compiled"
  | "compiled_degraded"
  | "requires_review"
  | "rejected";

export interface AccountScoped {
  accountId: string;
}

export interface ContextCompileBudget {
  maxRows: number;
  maxColumnarBytes: number;
  maxVectorCandidates: number;
  maxContextTokens: number;
  maxProcedureRefs: number;
  maxToolAffordances: number;
  maxRecursiveDepth: number;
  deadlineMs: number;
}

export interface ContextConsistencyEnvelope {
  rowStoreWatermark: string;
  columnarWatermark: string;
  vectorIndexWatermark: string;
  procedureMemoryWatermark: string;
  policyVersion: string;
  requireReadYourWrites: boolean;
}

export interface ContextSourceRef extends AccountScoped {
  sourceKind: ContextSourceKind;
  sourceId: string;
  boardId?: string;
  itemId?: string;
  columnId?: string;
  procedureId?: string;
  toolName?: string;
  visibilityScope: "agent_visible" | "restricted" | "redacted";
  sourceWatermark: string;
  sourceHash: string;
}

export interface AgentPerceptionMetadata {
  label: string;
  summary: string;
  tags: string[];
  semanticText: string;
  riskLevel: "low" | "medium" | "high";
  freshness: "current" | "bounded_stale" | "stale";
  confidence: "source_verified" | "derived" | "policy_limited";
}

export interface ContextCompileRequest extends AccountScoped {
  requestId: string;
  actorId: string;
  agentId: string;
  purposeId: string;
  boardIds: string[];
  workflowIds: string[];
  promptIntentHash: string;
  requestedSources: ContextSourceKind[];
  semanticQuery?: string;
  filters: Record<string, string | number | boolean | string[]>;
  consistency: ContextConsistencyEnvelope;
  budget: ContextCompileBudget;
  idempotencyKey: string;
  createdAt: string;
}

export interface CompiledContextBlock extends AccountScoped {
  packetId: string;
  blockId: string;
  blockKind: ContextBlockKind;
  ordinal: number;
  text: string;
  tokenEstimate: number;
  sourceRefs: ContextSourceRef[];
  perception: AgentPerceptionMetadata;
  blockHash: string;
}

export interface CompiledContextPacket extends AccountScoped {
  packetId: string;
  requestId: string;
  actorId: string;
  agentId: string;
  purposeId: string;
  decision: ContextCompileDecision;
  rejectionReason?: string;
  blocks: CompiledContextBlock[];
  omittedSourceRefs: ContextSourceRef[];
  consistency: ContextConsistencyEnvelope;
  budgetConsumed: ContextCompileBudget;
  packetHash: string;
  previousAuditHash?: string;
  expiresAt: string;
  createdAt: string;
}
```

## SQL schema

All tables are tenant scoped. Physical deployments should hash-partition by
`account_id` first, then optionally subpartition by `board_id` or time where volume
requires it.

```sql
CREATE TABLE agent_context_compile_requests (
  account_id              BIGINT NOT NULL,
  request_id              UUID NOT NULL,
  actor_id                BIGINT NOT NULL,
  agent_id                TEXT NOT NULL,
  purpose_id              UUID NOT NULL,
  board_ids               BIGINT[] NOT NULL DEFAULT '{}',
  workflow_ids            UUID[] NOT NULL DEFAULT '{}',
  prompt_intent_hash      TEXT NOT NULL,
  requested_sources       TEXT[] NOT NULL,
  semantic_query_hash     TEXT,
  filters_json            JSONB NOT NULL,
  row_store_watermark     TEXT NOT NULL,
  columnar_watermark      TEXT NOT NULL,
  vector_index_watermark  TEXT NOT NULL,
  procedure_watermark     TEXT NOT NULL,
  policy_version          TEXT NOT NULL,
  budget_json             JSONB NOT NULL,
  idempotency_key         TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX agent_context_requests_account_created_idx
  ON agent_context_compile_requests (account_id, created_at DESC);

CREATE TABLE agent_context_packets (
  account_id              BIGINT NOT NULL,
  packet_id               UUID NOT NULL,
  request_id              UUID NOT NULL,
  actor_id                BIGINT NOT NULL,
  agent_id                TEXT NOT NULL,
  purpose_id              UUID NOT NULL,
  decision                TEXT NOT NULL,
  rejection_reason        TEXT,
  packet_hash             TEXT NOT NULL,
  previous_audit_hash     TEXT,
  row_store_watermark     TEXT NOT NULL,
  columnar_watermark      TEXT NOT NULL,
  vector_index_watermark  TEXT NOT NULL,
  procedure_watermark     TEXT NOT NULL,
  budget_consumed_json    JSONB NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_context_compile_requests (account_id, request_id)
);

CREATE INDEX agent_context_packets_account_agent_created_idx
  ON agent_context_packets (account_id, agent_id, created_at DESC);

CREATE INDEX agent_context_packets_account_purpose_created_idx
  ON agent_context_packets (account_id, purpose_id, created_at DESC);

CREATE TABLE agent_context_blocks (
  account_id              BIGINT NOT NULL,
  packet_id               UUID NOT NULL,
  block_id                UUID NOT NULL,
  block_kind              TEXT NOT NULL,
  ordinal                 INTEGER NOT NULL,
  text                    TEXT NOT NULL,
  token_estimate          INTEGER NOT NULL,
  source_refs_json        JSONB NOT NULL,
  perception_json         JSONB NOT NULL,
  block_hash              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id, block_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agent_context_packets (account_id, packet_id)
);

CREATE INDEX agent_context_blocks_account_packet_ordinal_idx
  ON agent_context_blocks (account_id, packet_id, ordinal);

CREATE TABLE agent_context_block_embeddings (
  account_id              BIGINT NOT NULL,
  packet_id               UUID NOT NULL,
  block_id                UUID NOT NULL,
  board_id                BIGINT,
  visibility_scope        TEXT NOT NULL,
  embedding_model         TEXT NOT NULL,
  embedding_watermark     TEXT NOT NULL,
  embedding               vector(1536) NOT NULL,
  metadata_json           JSONB NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id, block_id),
  FOREIGN KEY (account_id, packet_id, block_id)
    REFERENCES agent_context_blocks (account_id, packet_id, block_id)
)
PARTITION BY HASH (account_id);

-- Create HNSW indexes on each account-hash partition operationally.
-- A single global HNSW index without account_id partitioning is not acceptable.
CREATE INDEX agent_context_block_embeddings_hnsw_idx
  ON agent_context_block_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX agent_context_block_embeddings_scope_idx
  ON agent_context_block_embeddings
    (account_id, board_id, visibility_scope, created_at DESC);

CREATE TABLE agent_context_compile_audit_events (
  account_id              BIGINT NOT NULL,
  audit_event_id          UUID NOT NULL,
  packet_id               UUID NOT NULL,
  request_id              UUID NOT NULL,
  event_kind              TEXT NOT NULL,
  event_payload_hash      TEXT NOT NULL,
  previous_audit_hash     TEXT,
  audit_hash              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agent_context_compile_audit_packet_idx
  ON agent_context_compile_audit_events (account_id, packet_id, created_at);
```

## Open API GraphQL shape

Every resolver must derive or require `accountId` from the authenticated tenant
context. Passing a packet ID without tenant scope must never be sufficient.

```graphql
enum AgentContextSourceKind {
  ROW
  COLUMNAR_AGGREGATE
  VECTOR_HIT
  PROCEDURE_MEMORY
  TOOL_AFFORDANCE
  POLICY_DECISION
  LINEAGE_ANCHOR
  EVIDENCE_PACKET
}

enum AgentContextCompileDecision {
  COMPILED
  COMPILED_DEGRADED
  REQUIRES_REVIEW
  REJECTED
}

input AgentContextCompileBudgetInput {
  maxRows: Int!
  maxColumnarBytes: BigInt!
  maxVectorCandidates: Int!
  maxContextTokens: Int!
  maxProcedureRefs: Int!
  maxToolAffordances: Int!
  maxRecursiveDepth: Int!
  deadlineMs: Int!
}

input AgentContextCompileInput {
  accountId: ID!
  agentId: ID!
  purposeId: ID!
  boardIds: [ID!]!
  workflowIds: [ID!]!
  promptIntentHash: String!
  requestedSources: [AgentContextSourceKind!]!
  semanticQuery: String
  filters: JSON!
  budget: AgentContextCompileBudgetInput!
  idempotencyKey: String!
}

type AgentContextSourceRef {
  accountId: ID!
  sourceKind: AgentContextSourceKind!
  sourceId: ID!
  boardId: ID
  itemId: ID
  columnId: ID
  visibilityScope: String!
  sourceWatermark: String!
  sourceHash: String!
}

type AgentPerceptionMetadata {
  label: String!
  summary: String!
  tags: [String!]!
  semanticText: String!
  riskLevel: String!
  freshness: String!
  confidence: String!
}

type AgentContextBlock {
  blockId: ID!
  blockKind: String!
  ordinal: Int!
  text: String!
  tokenEstimate: Int!
  sourceRefs: [AgentContextSourceRef!]!
  perception: AgentPerceptionMetadata!
  blockHash: String!
}

type AgentContextPacket {
  accountId: ID!
  packetId: ID!
  requestId: ID!
  agentId: ID!
  purposeId: ID!
  decision: AgentContextCompileDecision!
  rejectionReason: String
  blocks: [AgentContextBlock!]!
  packetHash: String!
  expiresAt: DateTime!
  createdAt: DateTime!
}

type Mutation {
  compileAgentContext(input: AgentContextCompileInput!): AgentContextPacket!
}

type Query {
  agentContextPacket(accountId: ID!, packetId: ID!): AgentContextPacket
  agentContextPackets(
    accountId: ID!
    agentId: ID
    purposeId: ID
    limit: Int! = 25
  ): [AgentContextPacket!]!
}
```

## Deterministic compilation flow

1. Authenticate the actor and bind the request to exactly one `account_id`.
2. Normalize filters, board IDs, workflow IDs, requested source kinds, and budget
   fields into a canonical JSON representation.
3. Preflight row, columnar, vector, procedure, policy, and tool paths against the
   budget and current SLO admission state.
4. Reject any source path that lacks an indexed `account_id` predicate, bounded
   source reference, or tenant-partitioned vector filter.
5. Resolve procedural memory records as explicit instruction blocks with source
   hashes, not as hidden execution behavior.
6. Retrieve semantic candidates from account-partitioned HNSW indexes with
   bounded `top_k`, visibility filters, and source watermarks.
7. Compile context blocks in deterministic ordinal order:
   policy constraints, instructions, facts, metrics, citations, tool options, and
   redactions.
8. Hash each block, hash the packet, and append a hash-chained audit event.
9. Return a packet or a deterministic rejection reason.

## Guardrails for autonomous agents

- `account_id` is mandatory in every storage, vector, and GraphQL access path.
- `maxRecursiveDepth` defaults to `0` unless an explicit purpose envelope permits
  expansion.
- Semantic retrieval must cap `top_k`, candidate expansion, and metadata fan-out.
- Columnar reads must declare byte estimates before execution.
- Row reads must target indexed tenant + board/item predicates or bounded source
  refs.
- Tool affordances are listed as options; execution requires a separate governed
  action or tool lease.
- A packet must be degraded or rejected if source watermarks are too stale for the
  requested consistency envelope.
- Packet reuse is allowed only when request hash, policy version, source
  watermarks, and visibility scope match.

## Performance check for 1M+ row boards

The following patterns must be rejected in preflight because they can cause full
table scans or noisy-neighbor impact:

```sql
-- Bad: no account_id predicate.
SELECT * FROM board_items WHERE board_id = $1;

-- Bad: account scoped but no board/item/window bound on a large board.
SELECT * FROM board_items WHERE account_id = $1;

-- Bad: JSON filter without an indexed generated column or contract-backed path.
SELECT * FROM board_items
WHERE account_id = $1
  AND column_values->>'status' = 'stuck';

-- Bad: vector search without tenant partition or bounded candidate count.
SELECT block_id
FROM agent_context_block_embeddings
ORDER BY embedding <=> $1
LIMIT 10000;
```

Acceptable alternatives:

```sql
-- Row path with tenant + board + indexed column predicate.
SELECT item_id, name, updated_at
FROM board_items
WHERE account_id = $1
  AND board_id = $2
  AND status_column_value = $3
ORDER BY updated_at DESC
LIMIT 200;

-- Vector path with tenant scope, board scope, visibility, and bounded top_k.
SELECT block_id, metadata_json
FROM agent_context_block_embeddings
WHERE account_id = $1
  AND board_id = $2
  AND visibility_scope = 'agent_visible'
ORDER BY embedding <=> $3
LIMIT 32;
```

For boards above 1M rows, compilation should prefer source refs, precomputed
columnar aggregates, schema contracts, and semantic summaries over raw item scans.

## Agent-ready perception

An LLM should perceive a packet as a set of labeled cards:

```json
{
  "label": "Q3 renewal risk context",
  "summary": "This packet contains verified risk facts, relevant procedures, and allowed CRM tools for account 123.",
  "tags": ["renewal", "risk", "crm", "procedure:renewal-playbook"],
  "semanticText": "Renewal risk facts and approved next actions for enterprise CRM workflow.",
  "riskLevel": "medium",
  "freshness": "current",
  "confidence": "source_verified"
}
```

The card is agent-friendly but not magical. It is a deterministic projection of
source refs, policy decisions, and procedural memory. If an agent later acts on the
packet, the action must cite the packet ID and relevant block hashes.

## Auditability and replay

Audit replay requires the following stable inputs:

- Canonical compile request JSON.
- Actor, agent, purpose, and account scope.
- Policy version and visibility decisions.
- Source refs with watermarks and hashes.
- Budget request and budget consumed.
- Block hashes in ordinal order.
- Previous audit hash.

The database should be able to recompute `packetHash` without invoking a model.
Embedding generation may be asynchronous, but the packet's source text and
visibility metadata must be frozen before embedding.

## Enterprise operating model

- Availability: context compilation must degrade gracefully by omitting low-priority
  blocks before it blocks high-priority transactional workloads.
- ACID: packet rows and audit rows are committed atomically with a single
  idempotency key.
- Isolation: packet reads and vector searches are account scoped and permission
  filtered before returning data to an agent.
- Predictability: rejection reasons are deterministic enum values with explicit
  budget and policy evidence.
- Observability: emit SLO counters for compile latency, rejected source paths,
  degraded packets, vector candidate counts, and estimated scan rows.

## Open questions for implementation

1. Should packet TTL be tied to source watermarks, explicit policy settings, or both?
2. Which context block kinds should be eligible for cross-session reuse?
3. Should procedure memory blocks be embedded together with facts, or kept in a
   separate HNSW namespace to prevent instruction/fact confusion?
4. Which GraphQL limits should be tenant configurable versus platform fixed?
