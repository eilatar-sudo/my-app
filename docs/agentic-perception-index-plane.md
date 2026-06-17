# mondayDB Agentic Perception Index Plane

## Why this matters

mondayDB can become an agentic database only if agents can understand boards, columns, items, automations, and prior outcomes without guessing from raw schemaless rows. The Perception Index Plane provides deterministic metadata packets that describe how an autonomous agent should perceive a workspace object, what procedural memory applies, which semantic vectors can be searched, and which query guardrails must be enforced before execution.

The product trade-off is latency versus correctness. Precomputing perception packets adds write-side enrichment and storage overhead, but it keeps read-time agent planning fast and predictable. mondayDB should not let an LLM infer schema meaning by scanning millions of item values; instead, the database exposes audited, account-scoped perception records that can be retrieved with bounded row, columnar, and vector paths.

## Design principles

1. **Deterministic core, probabilistic edge:** The database stores perception metadata, embeddings, constraints, and audit hashes. LLM interpretation happens outside the storage engine.
2. **Tenant-first indexing:** Every persisted record, index, GraphQL resolver, and audit event is scoped by `account_id`.
3. **Hybrid storage alignment:** Row storage owns transactional perception packet updates; columnar storage supports aggregate perception health and drift analytics.
4. **Semantic retrieval readiness:** Perception summaries are compatible with pgvector/HNSW and can be routed into RAG workflows without requiring full board scans.
5. **Guardrailed agent planning:** Each packet includes cost limits, recursive expansion limits, and query shape constraints that downstream planners must honor.

## Core concept

A perception packet is a deterministic, versioned description of how an agent may view a mondayDB object.

Examples:

- A board packet states that a board represents renewal risk tracking, lists trusted join anchors, and references allowed aggregation paths.
- A column packet states that a status column is an enum-like decision signal, not free-form text.
- A procedure packet states that a customer escalation workflow requires human approval before bulk mutation.
- A relationship packet states that item links may be expanded at depth 2 but not recursively traversed without a budget reservation.

The packet does not execute any AI behavior. It gives agents a bounded map of meaning, constraints, and retrieval hints.

## TypeScript contracts

```ts
export type PerceptionSubjectType =
  | "board"
  | "column"
  | "item"
  | "view"
  | "automation"
  | "integration"
  | "procedure"
  | "relationship";

export type PerceptionSignalKind =
  | "schema_hint"
  | "semantic_tag"
  | "procedure_ref"
  | "policy_ref"
  | "relationship_anchor"
  | "freshness_watermark"
  | "cost_guardrail";

export interface AgenticPerceptionPacket {
  account_id: string;
  packet_id: string;
  subject_type: PerceptionSubjectType;
  subject_id: string;
  board_id?: string;
  version: number;
  status: "active" | "superseded" | "quarantined";
  display_name: string;
  deterministic_summary: string;
  semantic_tags: string[];
  procedural_memory_refs: ProceduralMemoryRef[];
  retrieval_profile: PerceptionRetrievalProfile;
  guardrail_profile: PerceptionGuardrailProfile;
  source_watermark: SourceWatermark;
  audit: PerceptionAuditStamp;
  created_at: string;
  updated_at: string;
}

export interface ProceduralMemoryRef {
  procedure_id: string;
  procedure_version: number;
  applies_when: string;
  requires_human_approval: boolean;
  max_tool_calls: number;
}

export interface PerceptionRetrievalProfile {
  embedding_ref?: string;
  hnsw_namespace: string;
  allowed_paths: Array<"row" | "columnar" | "vector" | "hybrid">;
  required_predicates: string[];
  max_top_k: number;
  max_context_bytes: number;
  freshness_policy: "latest_committed" | "bounded_staleness" | "snapshot";
}

export interface PerceptionGuardrailProfile {
  max_recursive_depth: number;
  max_estimated_rows: number;
  max_estimated_columnar_segments: number;
  max_vector_candidates: number;
  requires_budget_reservation: boolean;
  deny_full_board_scan: boolean;
  expensive_query_policy: "reject" | "queue" | "degrade";
}

export interface SourceWatermark {
  row_commit_lsn: string;
  columnar_snapshot_id?: string;
  vector_index_epoch?: string;
  procedure_memory_epoch?: string;
}

export interface PerceptionAuditStamp {
  actor_type: "user" | "system" | "agent" | "backfill";
  actor_id: string;
  request_id: string;
  previous_hash?: string;
  payload_hash: string;
  decision_hash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_perception_packets (
  account_id              BIGINT NOT NULL,
  packet_id               UUID NOT NULL,
  subject_type            TEXT NOT NULL,
  subject_id              TEXT NOT NULL,
  board_id                BIGINT,
  version                 INTEGER NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'quarantined')),
  display_name            TEXT NOT NULL,
  deterministic_summary   TEXT NOT NULL,
  semantic_tags           TEXT[] NOT NULL DEFAULT '{}',
  procedural_memory_refs  JSONB NOT NULL DEFAULT '[]',
  retrieval_profile       JSONB NOT NULL,
  guardrail_profile       JSONB NOT NULL,
  source_watermark        JSONB NOT NULL,
  payload_hash            BYTEA NOT NULL,
  previous_hash           BYTEA,
  decision_hash           BYTEA NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id),
  UNIQUE (account_id, subject_type, subject_id, version)
);

CREATE INDEX agentic_perception_subject_active_idx
  ON agentic_perception_packets (account_id, subject_type, subject_id, status, version DESC);

CREATE INDEX agentic_perception_board_idx
  ON agentic_perception_packets (account_id, board_id, subject_type, status)
  WHERE board_id IS NOT NULL;

CREATE INDEX agentic_perception_tags_gin_idx
  ON agentic_perception_packets USING GIN (semantic_tags);

CREATE TABLE agentic_perception_embeddings (
  account_id          BIGINT NOT NULL,
  packet_id           UUID NOT NULL,
  embedding_epoch     BIGINT NOT NULL,
  embedding_model     TEXT NOT NULL,
  embedding_vector    VECTOR(1536) NOT NULL,
  source_payload_hash BYTEA NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, packet_id, embedding_epoch),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agentic_perception_packets (account_id, packet_id)
)
PARTITION BY HASH (account_id);

CREATE TABLE agentic_perception_embeddings_p00
  PARTITION OF agentic_perception_embeddings
  FOR VALUES WITH (MODULUS 64, REMAINDER 0);

-- Create the same HNSW index on each tenant hash partition.
CREATE INDEX agentic_perception_embedding_p00_hnsw_idx
  ON agentic_perception_embeddings_p00
  USING hnsw (embedding_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 96);

CREATE TABLE agentic_perception_audit_events (
  account_id       BIGINT NOT NULL,
  event_id         UUID NOT NULL,
  packet_id        UUID NOT NULL,
  event_type       TEXT NOT NULL,
  actor_type       TEXT NOT NULL,
  actor_id         TEXT NOT NULL,
  request_id       TEXT NOT NULL,
  previous_hash    BYTEA,
  payload_hash     BYTEA NOT NULL,
  decision_hash    BYTEA NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);
```

### Indexing notes

- All btree indexes start with `account_id` to prevent cross-tenant leakage and to keep tenant-local lookups bounded.
- The GIN tag index is useful only after an `account_id` predicate is applied by the resolver or planner.
- HNSW indexes are built per tenant hash partition so vector search does not traverse a single global graph for every account.

## Open API GraphQL shape

```graphql
type AgenticPerceptionPacket {
  packet_id: ID!
  subject_type: String!
  subject_id: String!
  board_id: ID
  version: Int!
  status: String!
  display_name: String!
  deterministic_summary: String!
  semantic_tags: [String!]!
  procedural_memory_refs: [ProceduralMemoryRef!]!
  retrieval_profile: PerceptionRetrievalProfile!
  guardrail_profile: PerceptionGuardrailProfile!
  source_watermark: SourceWatermark!
  audit_hash: String!
}

input PerceptionPacketFilter {
  subject_type: String
  subject_id: ID
  board_id: ID
  semantic_tags: [String!]
  status: String = "active"
}

input PerceptionSearchInput {
  account_id: ID!
  query: String!
  board_id: ID
  subject_types: [String!]
  top_k: Int = 10
  max_estimated_rows: Int = 10000
  require_latest_committed: Boolean = false
}

type PerceptionSearchResult {
  packet: AgenticPerceptionPacket!
  score: Float!
  matched_path: String!
  guardrail_decision: String!
}

extend type Query {
  agenticPerceptionPackets(filter: PerceptionPacketFilter!, limit: Int = 50): [AgenticPerceptionPacket!]!
  agenticPerceptionSearch(input: PerceptionSearchInput!): [PerceptionSearchResult!]!
}

input UpsertPerceptionPacketInput {
  account_id: ID!
  subject_type: String!
  subject_id: ID!
  board_id: ID
  deterministic_summary: String!
  semantic_tags: [String!]!
  procedural_memory_refs: [ProceduralMemoryRefInput!]!
  retrieval_profile: PerceptionRetrievalProfileInput!
  guardrail_profile: PerceptionGuardrailProfileInput!
  idempotency_key: String!
}

extend type Mutation {
  upsertAgenticPerceptionPacket(input: UpsertPerceptionPacketInput!): AgenticPerceptionPacket!
  quarantineAgenticPerceptionPacket(account_id: ID!, packet_id: ID!, reason: String!): AgenticPerceptionPacket!
}
```

Resolver requirements:

- `account_id` must come from the authenticated tenant context; client-provided `account_id` is validated against that context and never used alone for authorization.
- `top_k` is capped by the packet's retrieval profile and by account-level workload policy.
- Mutations write audit events in the same transaction as packet version updates.

## Write path

1. A board, column, automation, integration, or approved procedure changes.
2. The row store commits the source change with an immutable event and account-scoped LSN.
3. A deterministic enrichment worker builds or updates the perception packet from explicit metadata, admin-provided descriptions, schema contracts, and approved procedure memory.
4. The packet is stored transactionally with a payload hash and prior hash pointer.
5. Embedding generation runs asynchronously from the committed packet. The vector row references the packet hash so stale embeddings can be detected.
6. Columnar telemetry receives packet metadata for aggregate health reporting, such as percentage of active columns with missing semantic tags.

Embedding lag must not block source transactions. If the vector epoch is stale, GraphQL search can return row-path metadata only or mark vector results as bounded-staleness depending on the freshness policy.

## Read path for agents

1. The agent asks for task context through Open API.
2. The resolver scopes the request by `account_id` and validates board visibility.
3. The retrieval router selects row, columnar, vector, or hybrid lookup based on the packet retrieval profile.
4. Guardrails are evaluated before any expansion:
   - predicted row count
   - vector candidate count
   - recursive relationship depth
   - tool-call budget
   - freshness requirement
5. The agent receives perception packets with semantic tags, procedure references, and guardrail limits.
6. Any follow-up query plan must include the packet IDs and guardrail decision hash used for planning.

This creates deterministic provenance for agent decisions without making mondayDB responsible for the LLM's final reasoning.

## Agent-ready perception metadata

An LLM or agent should perceive each packet as a compact, bounded context card:

```json
{
  "object": "board:78123",
  "meaning": "Enterprise renewal risk workspace",
  "trusted_signals": ["health_status", "renewal_date", "arr_owner"],
  "unsafe_actions": ["bulk_update_without_review", "recursive_item_link_expansion"],
  "procedures": ["renewal_escalation_v4"],
  "retrieval": {
    "paths": ["row", "vector", "columnar"],
    "top_k": 12,
    "freshness": "latest_committed"
  },
  "guardrails": {
    "max_recursive_depth": 2,
    "max_estimated_rows": 25000,
    "requires_budget_reservation": true
  }
}
```

The card is metadata, not instruction execution. Procedural memory references must be resolved through the plan verification and policy planes before any mutation or tool use.

## Performance checks for 1M+ row boards

| Risk | Failure mode | Required mitigation |
| --- | --- | --- |
| Missing `account_id` predicate | Cross-tenant scan or leakage | Reject query at resolver and planner validation |
| Semantic tag filter without subject or board bound | GIN-assisted but still broad tenant scan | Require `board_id`, `subject_type`, or vector prefilter for large tenants |
| Unbounded `top_k` vector search | Large HNSW candidate expansion | Cap `top_k`, `ef_search`, and candidate rerank count per workload class |
| Recursive relationship expansion | Neighbor-impact spike from graph traversal | Enforce `max_recursive_depth` and budget reservation before expansion |
| Stale embedding over fresh row metadata | Agent sees obsolete meaning | Compare vector epoch against packet payload hash and freshness policy |
| LLM-generated filters over schemaless values | Full board item scan | Require schema contract predicates or columnar pre-aggregation |

No query over perception packets should require scanning item rows to infer meaning at read time. If a packet is missing, the agent should receive an explicit "unknown perception" state rather than triggering exploratory scans.

## Enterprise stability and auditability

- **ACID compliance:** Packet version updates and audit events commit atomically in the row store.
- **99.99% availability posture:** Vector enrichment is asynchronous and degradable; row-path packet retrieval remains available if embedding workers lag.
- **Multi-tenant isolation:** Authorization, partitioning, indexes, and audit events are all keyed by `account_id`.
- **Deterministic replay:** `payload_hash`, `previous_hash`, and `decision_hash` allow support and compliance teams to reconstruct what the agent saw.
- **No magic behavior:** The packet summarizes explicit metadata and approved procedural memory only; it does not invent hidden schema semantics.

## Guardrails for autonomous workloads

Perception packets must integrate with admission control before they are used to plan expensive work:

```ts
export interface PerceptionAdmissionDecision {
  account_id: string;
  packet_ids: string[];
  request_id: string;
  decision: "allow" | "degrade" | "queue" | "reject";
  reasons: string[];
  reserved_budget_units: number;
  max_runtime_ms: number;
  max_recursive_depth: number;
  audit_decision_hash: string;
}
```

Guardrail examples:

- Reject plans that combine vector search, columnar aggregation, and recursive item-link expansion without a budget reservation.
- Degrade to packet-only metadata when `require_latest_committed` is false and vector enrichment is behind.
- Queue low-priority agent workloads if neighbor-impact forecasts predict SLO risk.
- Require human approval when a procedural memory ref marks the action as mutation-sensitive.

## Operating metrics

Track these metrics per account and workload class:

- `perception_packet_lookup_p95_ms`
- `perception_vector_search_p95_ms`
- `perception_embedding_lag_seconds`
- `perception_unknown_subject_rate`
- `perception_guardrail_reject_count`
- `perception_full_scan_prevented_count`
- `perception_packet_audit_chain_gap_count`

Columnar analytics can aggregate these metrics without touching live row transactions.

## Rollout path

1. Start with board and column packets for high-value enterprise boards.
2. Add procedure and relationship packets for approved automation workflows.
3. Enable vector search over packet summaries with conservative `top_k` limits.
4. Integrate admission decisions with existing query-budget and workload-isolation planes.
5. Expose packet retrieval and search through monday.com Open API GraphQL.
6. Expand packet health analytics to show admins which objects lack agent-ready metadata.

## Summary

The Agentic Perception Index Plane turns mondayDB metadata into deterministic, tenant-scoped context that agents can safely retrieve and cite. It preserves mondayDB's enterprise stability by keeping AI inference outside the engine, protects scale through precomputed perception and bounded HNSW retrieval, and gives product teams an Open API surface for agent-ready experiences without introducing unpredictable database behavior.
