# Agentic Memory Contract for mondayDB

## Why this contract exists

mondayDB can become agent-ready without making the database engine
probabilistic. The product trade-off is to accept a small amount of write-path
latency for deterministic audit events, then run semantic enrichment
asynchronously. This keeps ACID board mutations predictable while giving agents
low-latency retrieval over the same tenant-scoped source of truth.

The contract separates three concerns:

1. **Procedural memory:** explicit instructions and tool constraints an agent
   may use when acting on monday.com data.
2. **Semantic retrieval:** embeddings derived from immutable events and curated
   memory records, indexed with HNSW-style approximate nearest neighbor search.
3. **Agentic guardrails:** deterministic budgets that stop recursive or
   high-cardinality retrieval from impacting neighboring tenants.

## Schema design

All tables place `account_id` in the primary key. Tenant-scoped B-tree indexes
begin with `account_id`; specialized GIN and HNSW indexes must be paired with
query planning guardrails because they cannot always use the same prefix shape.
The API layer derives `account_id` from the authenticated session rather than
trusting client input.

```sql
CREATE TABLE agent_memory_records (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  item_id BIGINT,
  memory_kind TEXT NOT NULL CHECK (
    memory_kind IN ('procedural', 'semantic', 'episodic', 'guardrail')
  ),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sensitivity TEXT GENERATED ALWAYS AS (metadata->>'sensitivity') STORED,
  source TEXT GENERATED ALWAYS AS (metadata->>'source') STORED,
  instruction_checksum BYTEA NOT NULL,
  source_event_id UUID NOT NULL,
  created_by_actor_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agent_memory_records_board_kind_idx
  ON agent_memory_records (account_id, board_id, memory_kind, updated_at DESC);

CREATE INDEX agent_memory_records_item_idx
  ON agent_memory_records (account_id, board_id, item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX agent_memory_records_policy_idx
  ON agent_memory_records (account_id, sensitivity, source, updated_at DESC);

CREATE INDEX agent_memory_records_metadata_gin_idx
  ON agent_memory_records USING GIN (metadata jsonb_path_ops);
```

```sql
CREATE TABLE agent_memory_embeddings (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version INTEGER NOT NULL,
  -- Use vector(1536) or the deployment-standard dimension for pgvector.
  embedding VECTOR(1536) NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, embedding_model, embedding_version),
  FOREIGN KEY (account_id, memory_id)
    REFERENCES agent_memory_records (account_id, memory_id)
    ON DELETE CASCADE
) PARTITION BY HASH (account_id);

CREATE INDEX agent_memory_embeddings_hnsw_idx
  ON agent_memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Hash partitioning keeps HNSW search bounded to tenant partitions selected by
`account_id`. The planner must reject vector retrieval if partition pruning is
not possible.

```sql
CREATE TABLE agent_query_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  request_hash BYTEA NOT NULL,
  plan_hash BYTEA NOT NULL,
  guardrail_decision TEXT NOT NULL CHECK (
    guardrail_decision IN ('allow', 'allow_with_limits', 'deny')
  ),
  estimated_row_count BIGINT NOT NULL,
  estimated_vector_probes INTEGER NOT NULL,
  max_depth INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agent_query_audit_events_actor_idx
  ON agent_query_audit_events (account_id, actor_id, created_at DESC);
```

### TypeScript API contract

```ts
export type AgentMemoryKind =
  | "procedural"
  | "semantic"
  | "episodic"
  | "guardrail";

export interface AgentMemoryRecord {
  accountId: string;
  memoryId: string;
  boardId: string;
  itemId?: string;
  memoryKind: AgentMemoryKind;
  title: string;
  body: string;
  metadata: {
    tags: string[];
    source: "board_item" | "automation" | "integration" | "admin_policy";
    toolNames?: string[];
    expiresAt?: string;
    sensitivity: "public_board" | "private_board" | "restricted";
  };
  instructionChecksum: string;
  sourceEventId: string;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRetrievalRequest {
  accountId: string;
  actorId: string;
  boardIds: string[];
  queryText: string;
  includeKinds: AgentMemoryKind[];
  topK: number;
  maxDepth: number;
  toolBudget: {
    maxToolCalls: number;
    maxEstimatedRows: number;
    timeoutMs: number;
  };
}

export interface AgentRetrievalResult {
  auditEventId: string;
  guardrailDecision: "allow" | "allow_with_limits" | "deny";
  appliedTopK: number;
  records: Array<{
    memory: AgentMemoryRecord;
    similarityScore: number;
    reason: "vector_match" | "metadata_filter" | "procedural_pin";
  }>;
}
```

## Open API shape

Expose the contract through GraphQL without letting clients bypass tenant
scoping:

```graphql
type AgentMemory {
  id: ID!
  boardId: ID!
  itemId: ID
  kind: AgentMemoryKind!
  title: String!
  body: String!
  tags: [String!]!
  sensitivity: AgentMemorySensitivity!
  updatedAt: ISO8601DateTime!
}

input AgentMemorySearchInput {
  boardIds: [ID!]!
  queryText: String!
  includeKinds: [AgentMemoryKind!]!
  topK: Int = 10
  maxDepth: Int = 1
}

type AgentMemorySearchPayload {
  auditEventId: ID!
  guardrailDecision: AgentGuardrailDecision!
  appliedTopK: Int!
  memories: [AgentMemorySearchHit!]!
}
```

The resolver must derive `account_id` and `actor_id` from the authenticated
session. Both values are excluded from the public input so cross-tenant probing
cannot be expressed by the API.

## Query pattern

Retrieval should first restrict by tenant, boards, memory kind, and policy, then
apply vector ranking inside that candidate set:

```sql
WITH scoped_memory AS (
  SELECT r.account_id, r.memory_id, r.board_id, r.memory_kind, r.metadata
  FROM agent_memory_records r
  WHERE r.account_id = $1
    AND r.board_id = ANY($2)
    AND r.memory_kind = ANY($3)
    AND (r.metadata->>'sensitivity') <> 'restricted'
)
SELECT r.*, e.embedding <=> $4 AS distance
FROM scoped_memory s
JOIN agent_memory_records r
  ON r.account_id = s.account_id
 AND r.memory_id = s.memory_id
JOIN agent_memory_embeddings e
  ON e.account_id = r.account_id
 AND e.memory_id = r.memory_id
WHERE e.embedding_model = $5
  AND e.embedding_version = $6
ORDER BY e.embedding <=> $4
LIMIT $7;
```

## Performance checks

- **Full table scan risk:** a vector query that omits `account_id` or board
  filters can scan memories across all tenants. Reject these plans before
  execution.
- **1M+ row boards:** require `topK <= 50`, `maxDepth <= 2`, and a finite
  `boardIds` list. Use an estimated row count guardrail before reaching HNSW.
- **Metadata filters:** avoid arbitrary JSON path predicates in hot retrieval.
  Promote common metadata keys such as `sensitivity` or `source` to generated
  columns if they become high-cardinality filters.
- **Embedding freshness:** embeddings are eventually consistent. Agents should
  see `embedded_at` and `source_event_id` so they can explain stale context
  rather than inventing missing state.

## Agent perception model

An LLM should receive memory records as structured context, not raw table rows:

```json
{
  "memory_kind": "procedural",
  "title": "Escalation rule for enterprise accounts",
  "tags": ["sla", "enterprise", "support"],
  "tool_names": ["create_update", "assign_owner"],
  "source_event_id": "7b9f7c2a-1d1b-4a1b-95db-1f9db62b1b30",
  "instruction_checksum": "sha256:...",
  "body": "If account tier is enterprise and severity is high, create an update and assign the incident owner."
}
```

The checksum makes procedural instructions auditable and replayable. Agents may
rank or summarize this context, but they must not mutate mondayDB state without
creating an audit event that records the deterministic request and plan hashes.
