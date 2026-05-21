# Agentic Entity Graph Plane

## Why before how

Agents need to understand how work is connected before they can safely plan
actions across boards, items, docs, updates, automations, and long-term memory.
The product trade-off is context richness vs. predictable latency:

- **Context richness:** a graph of entities and relationships lets an agent see
  dependencies, owners, blockers, procedures, and semantic neighbors without
  asking broad natural-language questions against raw board data.
- **Predictable latency:** unbounded graph expansion can become an expensive
  recursive query, especially on accounts with boards above 1M rows.

The **Agentic Entity Graph Plane** gives mondayDB a deterministic, tenant-scoped
relationship layer that agents can retrieve from without changing the core
database engine into a probabilistic system. The row store remains the source of
truth for transactional data, the columnar store remains the source of truth for
analytics, and this plane stores derived, audited graph facts plus optional
semantic embeddings that are safe for pgvector/HNSW retrieval.

## Product boundary

This plane answers: "What related, permissioned context should an agent inspect
before planning?" It does not answer: "What should the agent do next?"

That separation preserves enterprise predictability:

1. mondayDB deterministically extracts and indexes entity facts.
2. Agents retrieve bounded graph neighborhoods through GraphQL.
3. Plan verification, workload isolation, and transaction intents decide whether
   any follow-up read or write is safe.

## Scope

- Build tenant-scoped graph nodes for boards, items, columns, docs, updates,
  automations, procedures, tools, and memory capsules.
- Build deterministic graph edges from source events, procedure declarations,
  explicit user links, dependency columns, mirror/connect-board columns, and
  approved semantic enrichment jobs.
- Store agent-readable summaries and metadata tags for each node and edge.
- Support pgvector/HNSW-compatible semantic lookup of graph entry points.
- Expose graph search, expansion, and audit inspection through the monday.com
  Open API GraphQL surface.
- Prevent autonomous agents from triggering unbounded recursive expansions or
  full scans on large boards.

## TypeScript contracts

```ts
export type AgenticEntityKind =
  | "board"
  | "item"
  | "column"
  | "doc"
  | "update"
  | "automation"
  | "procedure"
  | "tool"
  | "memory_capsule";

export type AgenticEdgeKind =
  | "belongs_to"
  | "depends_on"
  | "blocks"
  | "mentions"
  | "owned_by"
  | "generated_by"
  | "procedure_step"
  | "tool_affordance"
  | "semantic_neighbor"
  | "mirrors"
  | "connects_to";

export type AgenticGraphSource =
  | "row_event"
  | "columnar_snapshot"
  | "procedure_memory"
  | "semantic_enrichment"
  | "user_assertion"
  | "tool_registry";

export type AgenticGraphVisibility = "private" | "account" | "board" | "team";

export interface AgenticEntityNode {
  account_id: string;
  node_id: string;
  entity_kind: AgenticEntityKind;
  source_entity_id: string;
  board_id?: string;
  workspace_id?: string;
  visibility: AgenticGraphVisibility;
  title_hash: string;
  redacted_title_ref: string;
  agent_readable_summary: string;
  semantic_tags: string[];
  procedure_memory_refs: string[];
  source_watermark: {
    row_store_lsn?: string;
    columnar_snapshot_id?: string;
    vector_index_version?: string;
  };
  embedding_ref?: string;
  metadata_hash: string;
  audit_hash: string;
  previous_audit_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface AgenticEntityEdge {
  account_id: string;
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_kind: AgenticEdgeKind;
  source: AgenticGraphSource;
  board_id?: string;
  weight: number;
  confidence_basis:
    | "deterministic_column"
    | "explicit_link"
    | "procedure_contract"
    | "approved_embedding_match";
  agent_instruction?: string;
  metadata_tags: string[];
  source_event_ids: string[];
  source_watermark: {
    row_store_lsn?: string;
    columnar_snapshot_id?: string;
    vector_index_version?: string;
  };
  audit_hash: string;
  previous_audit_hash?: string;
  created_at: string;
  expires_at?: string;
}

export interface AgenticGraphExpansionRequest {
  account_id: string;
  actor_id: string;
  agent_id: string;
  seed_node_ids: string[];
  board_ids: string[];
  allowed_edge_kinds: AgenticEdgeKind[];
  max_hops: number;
  max_nodes: number;
  max_edges: number;
  max_vector_top_k: number;
  require_procedure_refs: boolean;
  workload_decision_id: string;
  request_hash: string;
}

export interface AgenticGraphExpansionResult {
  account_id: string;
  expansion_id: string;
  request_hash: string;
  nodes: AgenticEntityNode[];
  edges: AgenticEntityEdge[];
  truncated: boolean;
  truncation_reason?:
    | "max_hops"
    | "max_nodes"
    | "max_edges"
    | "budget_exhausted"
    | "policy_denied";
  source_watermark: {
    row_store_lsn?: string;
    columnar_snapshot_id?: string;
    vector_index_version?: string;
  };
  estimate_hash: string;
  audit_hash: string;
  created_at: string;
}

export interface AgenticGraphAuditEvent {
  account_id: string;
  audit_event_id: string;
  subject_type: "node" | "edge" | "expansion" | "semantic_entrypoint";
  subject_id: string;
  actor_id: string;
  agent_id?: string;
  operation:
    | "extract"
    | "upsert"
    | "expire"
    | "expand"
    | "semantic_search"
    | "policy_deny";
  deterministic_input_hash: string;
  output_hash: string;
  previous_audit_hash?: string;
  audit_hash: string;
  created_at: string;
}
```

## SQL schema

The schema intentionally prefixes every primary and secondary access path with
`account_id`. Graph records can be sharded by account and colocated with
existing row-store partitions while embeddings can live in a tenant-aware vector
index.

```sql
CREATE TABLE agentic_entity_nodes (
  account_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  board_id TEXT,
  workspace_id TEXT,
  visibility TEXT NOT NULL,
  title_hash TEXT NOT NULL,
  redacted_title_ref TEXT NOT NULL,
  agent_readable_summary TEXT NOT NULL,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  procedure_memory_refs TEXT[] NOT NULL DEFAULT '{}',
  row_store_lsn TEXT,
  columnar_snapshot_id TEXT,
  vector_index_version TEXT,
  embedding_ref TEXT,
  metadata_hash TEXT NOT NULL,
  audit_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, node_id)
);

CREATE INDEX agentic_entity_nodes_by_source
  ON agentic_entity_nodes (account_id, entity_kind, source_entity_id);

CREATE INDEX agentic_entity_nodes_by_board
  ON agentic_entity_nodes (account_id, board_id, entity_kind, updated_at DESC)
  WHERE board_id IS NOT NULL;

CREATE INDEX agentic_entity_nodes_by_tags
  ON agentic_entity_nodes USING GIN (semantic_tags);

CREATE TABLE agentic_entity_edges (
  account_id TEXT NOT NULL,
  edge_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  edge_kind TEXT NOT NULL,
  source TEXT NOT NULL,
  board_id TEXT,
  weight DOUBLE PRECISION NOT NULL,
  confidence_basis TEXT NOT NULL,
  agent_instruction TEXT,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  source_event_ids TEXT[] NOT NULL DEFAULT '{}',
  row_store_lsn TEXT,
  columnar_snapshot_id TEXT,
  vector_index_version TEXT,
  audit_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, edge_id),
  FOREIGN KEY (account_id, from_node_id)
    REFERENCES agentic_entity_nodes (account_id, node_id),
  FOREIGN KEY (account_id, to_node_id)
    REFERENCES agentic_entity_nodes (account_id, node_id)
);

CREATE INDEX agentic_entity_edges_from
  ON agentic_entity_edges
  (account_id, from_node_id, edge_kind, weight DESC, created_at DESC)
  WHERE expires_at IS NULL;

CREATE INDEX agentic_entity_edges_to
  ON agentic_entity_edges
  (account_id, to_node_id, edge_kind, weight DESC, created_at DESC)
  WHERE expires_at IS NULL;

CREATE INDEX agentic_entity_edges_by_board
  ON agentic_entity_edges (account_id, board_id, edge_kind, created_at DESC)
  WHERE board_id IS NOT NULL AND expires_at IS NULL;

CREATE TABLE agentic_entity_embeddings (
  account_id TEXT NOT NULL,
  embedding_ref TEXT NOT NULL,
  node_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector_index_version TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, embedding_ref),
  FOREIGN KEY (account_id, node_id)
    REFERENCES agentic_entity_nodes (account_id, node_id)
);

CREATE INDEX agentic_entity_embeddings_hnsw
  ON agentic_entity_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE agentic_graph_audit_events (
  account_id TEXT NOT NULL,
  audit_event_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  agent_id TEXT,
  operation TEXT NOT NULL,
  deterministic_input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agentic_graph_audit_by_subject
  ON agentic_graph_audit_events
  (account_id, subject_type, subject_id, created_at DESC);
```

### Vector partitioning note

The HNSW index must be queried through an `account_id` filter and, where
available, a `board_id` filter resolved from the node table. If physical
partitioning is available, partition `agentic_entity_embeddings` by
`hash(account_id)` before applying HNSW indexes per partition. That prevents one
large tenant or agent workload from degrading neighbor recall latency.

## GraphQL Open API surface

```graphql
enum AgenticEntityKind {
  board
  item
  column
  doc
  update
  automation
  procedure
  tool
  memory_capsule
}

enum AgenticEdgeKind {
  belongs_to
  depends_on
  blocks
  mentions
  owned_by
  generated_by
  procedure_step
  tool_affordance
  semantic_neighbor
  mirrors
  connects_to
}

input AgenticGraphSemanticSearchInput {
  account_id: ID!
  query_text: String!
  board_ids: [ID!]!
  entity_kinds: [AgenticEntityKind!]
  semantic_tags: [String!]
  top_k: Int!
  workload_decision_id: ID!
}

input AgenticGraphExpansionInput {
  account_id: ID!
  seed_node_ids: [ID!]!
  board_ids: [ID!]!
  allowed_edge_kinds: [AgenticEdgeKind!]!
  max_hops: Int!
  max_nodes: Int!
  max_edges: Int!
  max_vector_top_k: Int!
  require_procedure_refs: Boolean!
  workload_decision_id: ID!
}

type AgenticEntityNode {
  account_id: ID!
  node_id: ID!
  entity_kind: AgenticEntityKind!
  source_entity_id: ID!
  board_id: ID
  workspace_id: ID
  agent_readable_summary: String!
  semantic_tags: [String!]!
  procedure_memory_refs: [ID!]!
  embedding_ref: ID
  audit_hash: String!
  updated_at: String!
}

type AgenticEntityEdge {
  account_id: ID!
  edge_id: ID!
  from_node_id: ID!
  to_node_id: ID!
  edge_kind: AgenticEdgeKind!
  weight: Float!
  agent_instruction: String
  metadata_tags: [String!]!
  audit_hash: String!
  created_at: String!
}

type AgenticGraphExpansionResult {
  account_id: ID!
  expansion_id: ID!
  nodes: [AgenticEntityNode!]!
  edges: [AgenticEntityEdge!]!
  truncated: Boolean!
  truncation_reason: String
  estimate_hash: String!
  audit_hash: String!
  created_at: String!
}

type Query {
  agentic_graph_semantic_search(
    input: AgenticGraphSemanticSearchInput!
  ): [AgenticEntityNode!]!

  agentic_graph_expand(
    input: AgenticGraphExpansionInput!
  ): AgenticGraphExpansionResult!
}
```

## Deterministic extraction flow

1. **Capture immutable source events.** Row-store writes, dependency column
   updates, connect-board changes, doc mentions, automation changes, and tool
   registry changes emit immutable source event ids.
2. **Build extraction batches by account.** Each batch is scoped to one
   `account_id`, one source watermark range, and an explicit set of board ids.
3. **Derive graph facts.** Extraction rules convert events into nodes and edges.
   Examples:
   - an item creates an `item` node and a `belongs_to` edge to its board;
   - a dependency column creates a `depends_on` edge;
   - procedure memory creates ordered `procedure_step` edges;
   - approved tool registry entries create `tool_affordance` edges.
4. **Hash and upsert.** The batch writes nodes and edges with
   `metadata_hash`, `audit_hash`, and optional `previous_audit_hash`.
5. **Enrich asynchronously.** Embeddings are generated from redacted summaries
   and tags, never from raw unscoped board scans. The graph is usable before
   embedding completion because deterministic edges are first-class records.

## Agent-ready perception model

Agents should perceive each node as a compact, permissioned context card:

```json
{
  "node_id": "node_item_123",
  "entity_kind": "item",
  "agent_readable_summary": "Renewal task for Acme account with a blocked legal review.",
  "semantic_tags": ["renewal", "legal_blocker", "customer_risk"],
  "procedure_memory_refs": ["proc_renewal_escalation"],
  "safe_next_edges": ["depends_on", "owned_by", "procedure_step"]
}
```

Agents should perceive each edge as an instruction or constraint, not as hidden
intent:

```json
{
  "edge_kind": "procedure_step",
  "agent_instruction": "Before updating renewal status, verify legal approval item is done.",
  "confidence_basis": "procedure_contract",
  "audit_hash": "sha256:..."
}
```

This gives LLMs useful context while keeping the database behavior
deterministic. The model may choose how to reason over the card; mondayDB only
returns bounded, audited facts.

## Guardrails against expensive recursive queries

Every graph expansion must pass workload admission before execution. The
expansion operator enforces:

- `account_id` is required and cannot be inferred from a token alone.
- `board_ids` are required for item, column, update, dependency, mirror, and
  connect-board expansion.
- `max_hops` defaults to 2 and has a hard cap of 4 for interactive agents.
- `max_nodes`, `max_edges`, and `max_vector_top_k` are enforced before fetching.
- Edge expansion is breadth-first with deterministic ordering by edge kind,
  weight, and edge id.
- Semantic entry-point search returns seed nodes only; it cannot directly launch
  recursive expansion without a second audited request.
- `semantic_neighbor` edges are excluded by default from recursive expansion to
  avoid embedding-driven fan-out loops.
- Repeated expansion requests with the same `request_hash` and source watermark
  reuse the cached result or replay the same deterministic output.

## Performance check for 1M+ row boards

Flag and reject any proposal that would cause one of these access patterns:

```sql
-- Unsafe: no tenant scope and no seed node.
SELECT *
FROM agentic_entity_edges
WHERE edge_kind = 'depends_on';

-- Unsafe: semantic search without account filter.
SELECT node_id
FROM agentic_entity_embeddings
ORDER BY embedding <=> $1
LIMIT 100;
```

Required access patterns:

```sql
-- Safe edge expansion from bounded seeds.
SELECT *
FROM agentic_entity_edges
WHERE account_id = $1
  AND from_node_id = ANY($2)
  AND edge_kind = ANY($3)
  AND expires_at IS NULL
ORDER BY weight DESC, edge_id
LIMIT $4;

-- Safe semantic entry-point retrieval.
SELECT e.node_id
FROM agentic_entity_embeddings e
JOIN agentic_entity_nodes n
  ON n.account_id = e.account_id
 AND n.node_id = e.node_id
WHERE e.account_id = $1
  AND n.board_id = ANY($2)
  AND n.entity_kind = ANY($3)
ORDER BY e.embedding <=> $4
LIMIT $5;
```

For boards above 1M rows, interactive graph retrieval must use:

- bounded seed nodes from direct ids or top-k semantic entry points;
- `agentic_entity_edges_from` or `agentic_entity_edges_to` indexes;
- precomputed node summaries, not raw item payload scans;
- columnar rollups only for aggregate counts after the graph expansion result is
  already bounded.

## Auditability and replay

Audit hashes are computed from deterministic inputs:

```txt
node_audit_hash = sha256(
  account_id ||
  node_id ||
  entity_kind ||
  source_entity_id ||
  metadata_hash ||
  source_watermark ||
  previous_audit_hash
)

edge_audit_hash = sha256(
  account_id ||
  edge_id ||
  from_node_id ||
  to_node_id ||
  edge_kind ||
  confidence_basis ||
  source_event_ids ||
  source_watermark ||
  previous_audit_hash
)

expansion_audit_hash = sha256(
  account_id ||
  request_hash ||
  sorted_node_ids ||
  sorted_edge_ids ||
  source_watermark ||
  estimate_hash
)
```

Support and compliance teams can replay an expansion by loading the same source
watermarks, request hash, workload decision, and graph records. If semantic
entry-point search was used, the vector index version and embedding content
hashes are part of the replay packet.

## Integration with existing mondayDB planes

- **Memory retrieval:** procedure and memory capsule nodes give retrieval a
  structured entry point before vector search broadens context.
- **Query budget:** graph expansion consumes row, vector, and recursive-hop
  budgets from the existing budget ledger.
- **Access policy:** visibility and board scope are checked before a node or
  edge is returned.
- **Plan verification:** proposed agent plans can require specific node and edge
  evidence before write intents are accepted.
- **Replay sandbox:** graph expansion packets can be replayed against a sandbox
  to validate that a procedure still finds the same required context.

## Rollout sequence

1. Start with deterministic edges from boards, items, dependency columns,
   connect-board columns, and procedure memory.
2. Add semantic entry-point embeddings for node summaries after redaction and
   permission checks are stable.
3. Add `tool_affordance` and `semantic_neighbor` edges behind workload policies.
4. Expose GraphQL read APIs with strict `account_id`, board scope, hop, node,
   edge, and top-k caps.
5. Feed graph evidence into plan verification and transaction intent review.

## Success metrics

- P95 graph expansion latency for interactive agents stays within the same
  workload class target as semantic retrieval.
- Zero graph queries execute without an `account_id` predicate.
- Less than 1 percent of interactive expansions are truncated because of policy
  limits after procedures are tuned.
- Retrieval precision improves for multi-board workflows because agents start
  from explicit entity relationships instead of broad vector-only search.
- Audit replay reproduces the same node and edge set for a fixed request hash
  and source watermark.

