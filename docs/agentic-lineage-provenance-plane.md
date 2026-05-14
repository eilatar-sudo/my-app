# Agentic Lineage and Provenance Plane

## Why this matters

Agents can only be trusted in enterprise workflows when every answer, tool call, and memory update can be traced back to deterministic mondayDB facts. The product trade-off is **explainability vs. hot-path latency**: forcing every row, columnar, vector, and tool operation to synchronously materialize a full lineage graph would add user-visible latency, but letting agents cite opaque context would weaken auditability and tenant trust.

The Agentic Lineage and Provenance Plane solves this by writing a small deterministic provenance hash synchronously with each committed action, then enriching the full lineage graph asynchronously from immutable events. The database engine stays deterministic; probabilistic agents only consume bounded, tenant-scoped provenance views.

## Design goals

- **Multi-tenant isolation:** every lineage read and write is scoped by `account_id`, and every index starts with `account_id`.
- **Auditability:** each event carries a deterministic hash and optional previous hash for replayable audit chains.
- **Procedural memory:** lineage events can point to the approved procedure or instruction set that caused the action.
- **Semantic retrieval:** high-value provenance summaries can be embedded for pgvector/HNSW search without making vector search authoritative.
- **Predictable guardrails:** provenance traversal has explicit depth, fan-out, cost, and timeout limits to prevent expensive recursive agent queries.
- **API-first access:** every capability is exposed through monday.com Open API GraphQL contracts.

## Conceptual model

The plane stores lineage as a tenant-scoped directed acyclic event graph:

1. A user, automation, or agent performs a deterministic action.
2. mondayDB commits the action in the row/columnar/vector/tool subsystem.
3. The commit path emits a compact `LineageAnchor` containing stable identifiers, watermarks, and hashes.
4. An async enrichment worker expands the anchor into an `AgenticLineageEvent` with semantic tags, citations, and optional embedding references.
5. Agents retrieve bounded provenance packets for answers, tool preflights, memory compaction, or human review.

The synchronous contract is intentionally small so OLTP writes remain fast. The richer agent-facing view is eventually enriched but never changes the committed facts.

## TypeScript contracts

```ts
export type LineageEventKind =
  | "row_mutation"
  | "columnar_query"
  | "vector_retrieval"
  | "memory_read"
  | "memory_write"
  | "tool_invocation"
  | "semantic_cache_hit"
  | "plan_verification"
  | "policy_decision";

export type ActorKind = "user" | "automation" | "agent" | "system";

export interface TenantScoped {
  accountId: string;
}

export interface LineageAnchor extends TenantScoped {
  eventId: string;
  rootTraceId: string;
  parentEventIds: string[];
  eventKind: LineageEventKind;
  actorKind: ActorKind;
  actorId: string;
  boardId?: string;
  itemId?: string;
  columnId?: string;
  dataWatermark: string;
  inputDigest: string;
  outputDigest: string;
  deterministicHash: string;
  previousHash?: string;
  createdAt: string;
}

export interface AgenticLineageEvent extends LineageAnchor {
  procedureMemoryRef?: string;
  semanticTags: string[];
  queryFingerprint?: string;
  sourceRefs: LineageSourceRef[];
  outputRefs: LineageOutputRef[];
  embeddingRef?: string;
  estimatedCostUnits: number;
  retentionClass: "hot" | "warm" | "cold";
}

export interface LineageSourceRef {
  sourceKind: "row" | "columnar_segment" | "vector_index" | "tool" | "memory" | "cache";
  sourceId: string;
  accountId: string;
  boardId?: string;
  watermark: string;
  digest: string;
}

export interface LineageOutputRef {
  outputKind: "answer" | "mutation" | "tool_result" | "memory_capsule" | "audit_packet";
  outputId: string;
  digest: string;
}

export interface ProvenanceQuery extends TenantScoped {
  rootTraceId?: string;
  eventId?: string;
  boardId?: string;
  semanticTags?: string[];
  maxDepth: number;
  maxFanout: number;
  limit: number;
  asOfWatermark?: string;
}

export interface ProvenancePacket extends TenantScoped {
  packetId: string;
  query: ProvenanceQuery;
  events: AgenticLineageEvent[];
  truncated: boolean;
  truncationReason?: "depth_limit" | "fanout_limit" | "cost_limit" | "timeout";
  packetHash: string;
  generatedAt: string;
}

export interface LineageGuardrailEnvelope extends TenantScoped {
  maxDepth: number;
  maxFanout: number;
  maxEvents: number;
  maxCostUnits: number;
  timeoutMs: number;
  requireBoardPredicateForBoardScopedReads: boolean;
}
```

## SQL schema

```sql
CREATE TABLE agentic_lineage_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  root_trace_id UUID NOT NULL,
  parent_event_ids UUID[] NOT NULL DEFAULT '{}',
  event_kind TEXT NOT NULL CHECK (
    event_kind IN (
      'row_mutation',
      'columnar_query',
      'vector_retrieval',
      'memory_read',
      'memory_write',
      'tool_invocation',
      'semantic_cache_hit',
      'plan_verification',
      'policy_decision'
    )
  ),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'automation', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  column_id TEXT,
  procedure_memory_ref UUID,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  query_fingerprint BYTEA,
  source_refs JSONB NOT NULL,
  output_refs JSONB NOT NULL,
  embedding_ref UUID,
  estimated_cost_units INTEGER NOT NULL DEFAULT 1 CHECK (estimated_cost_units > 0),
  retention_class TEXT NOT NULL CHECK (retention_class IN ('hot', 'warm', 'cold')),
  data_watermark TEXT NOT NULL,
  input_digest BYTEA NOT NULL,
  output_digest BYTEA NOT NULL,
  deterministic_hash BYTEA NOT NULL,
  previous_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_lineage_trace_idx
  ON agentic_lineage_events (account_id, root_trace_id, created_at DESC);

CREATE INDEX agentic_lineage_board_idx
  ON agentic_lineage_events (account_id, board_id, created_at DESC)
  WHERE board_id IS NOT NULL;

CREATE INDEX agentic_lineage_kind_idx
  ON agentic_lineage_events (account_id, event_kind, created_at DESC);

CREATE INDEX agentic_lineage_tags_idx
  ON agentic_lineage_events USING GIN (semantic_tags);

CREATE TABLE agentic_lineage_embeddings (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  embedding_text_digest BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id),
  FOREIGN KEY (account_id, event_id)
    REFERENCES agentic_lineage_events (account_id, event_id)
);

CREATE INDEX agentic_lineage_embedding_hnsw_idx
  ON agentic_lineage_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

For large multi-tenant deployments, `agentic_lineage_embeddings` should be physically partitioned or sharded by `account_id` before HNSW indexing. The planner must apply the `account_id` filter before vector candidate expansion, either through partition pruning or tenant-local vector indexes.

## GraphQL Open API shape

```graphql
type AgenticLineageEvent {
  accountId: ID!
  eventId: ID!
  rootTraceId: ID!
  parentEventIds: [ID!]!
  eventKind: String!
  actorKind: String!
  actorId: String!
  boardId: ID
  itemId: ID
  columnId: String
  procedureMemoryRef: ID
  semanticTags: [String!]!
  sourceRefs: [LineageSourceRef!]!
  outputRefs: [LineageOutputRef!]!
  estimatedCostUnits: Int!
  deterministicHash: String!
  previousHash: String
  createdAt: DateTime!
}

type ProvenancePacket {
  packetId: ID!
  accountId: ID!
  events: [AgenticLineageEvent!]!
  truncated: Boolean!
  truncationReason: String
  packetHash: String!
  generatedAt: DateTime!
}

input ProvenanceQueryInput {
  accountId: ID!
  rootTraceId: ID
  eventId: ID
  boardId: ID
  semanticTags: [String!]
  maxDepth: Int! = 3
  maxFanout: Int! = 50
  limit: Int! = 200
  asOfWatermark: String
}

extend type Query {
  agenticProvenance(query: ProvenanceQueryInput!): ProvenancePacket!
  agenticLineageEvent(accountId: ID!, eventId: ID!): AgenticLineageEvent
}
```

## Retrieval and memory behavior

Agents should perceive lineage as **evidence**, not as instructions. The agent-facing packet should expose:

- `semanticTags` such as `["budget-risk", "customer-escalation", "schema-change"]` for RAG filtering.
- `procedureMemoryRef` to connect an action to approved procedural memory.
- `sourceRefs` and `outputRefs` for citations in generated answers.
- `deterministicHash` and `packetHash` so an answer can be replayed against the same evidence set.

Semantic search is useful for finding similar historical traces, but it must never replace exact lineage lookup for audit. Exact lookup uses `(account_id, event_id)` or `(account_id, root_trace_id)`. HNSW search is only a discovery path that returns candidate event IDs for deterministic re-read.

## Guardrails for recursive agent queries

The provenance API must reject or truncate queries that exceed the tenant envelope:

```ts
export const DEFAULT_LINEAGE_GUARDRAIL: LineageGuardrailEnvelope = {
  accountId: "resolved-at-request-time",
  maxDepth: 3,
  maxFanout: 50,
  maxEvents: 200,
  maxCostUnits: 1_000,
  timeoutMs: 750,
  requireBoardPredicateForBoardScopedReads: true,
};
```

Rules:

1. `accountId` is mandatory and cannot be inferred from agent-supplied text.
2. Recursive traversal stops when `maxDepth`, `maxFanout`, `maxEvents`, `maxCostUnits`, or `timeoutMs` is reached.
3. Board-scoped reads on boards with more than 1M rows require `boardId` and an indexed time, trace, or event predicate.
4. Vector discovery must use a bounded `topK` and then re-read exact events with `account_id`.
5. Cross-account parent references are invalid, even if an agent supplies a matching event ID.

## Performance check

Potential full table scan risks:

- Querying by `semanticTags` without `account_id`.
- Traversing parent events without anchoring on `(account_id, root_trace_id)` or `(account_id, event_id)`.
- Asking for all lineage on a high-volume board without a `created_at`, `root_trace_id`, or `event_kind` predicate.
- Running HNSW vector search on a global embedding table before tenant pruning.
- Expanding unbounded `parent_event_ids` arrays for long-running automations.

Mitigations:

- Partition lineage tables by `account_id` and time/retention tier.
- Store compact hot lineage for recent traces and move older expanded payloads to cold object storage with indexed digests.
- Keep `source_refs` and `output_refs` bounded; large payloads belong behind digest-addressed object references.
- Use async enrichment so row-store commits only write the compact anchor and deterministic hash.
- Expose `truncated` and `truncationReason` instead of silently issuing larger recursive reads.

## Audit replay

Replay starts from an immutable `root_trace_id`:

1. Load events by `(account_id, root_trace_id, created_at)`.
2. Verify each `deterministic_hash` from canonicalized event fields.
3. Verify `previous_hash` when a chain exists.
4. Recompute `packetHash` from the returned event IDs and hashes.
5. Compare source and output digests with row, columnar, vector, memory, or tool subsystem audit records.

This keeps the audit trail deterministic even when the original agent used probabilistic reasoning.

## Rollout notes

- Start with lineage anchors for agent plan verification, tool invocation, semantic cache hits, and memory writes.
- Add row and columnar source refs for high-risk board mutations before expanding to all reads.
- Keep retention classes explicit so enterprise customers can configure hot audit windows without bloating OLTP storage.
- Surface provenance packets in the Open API before allowing agents to cite lineage in customer-visible answers.
