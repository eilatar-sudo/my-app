# mondayDB Agentic Memory Retrieval Plane

## Why this matters

mondayDB can become agent-ready without making the database engine probabilistic. The product trade-off is to give agents durable procedural memory and semantic retrieval while preserving the properties enterprise customers already depend on: tenant isolation, deterministic reads and writes, predictable cost, and auditability.

This design keeps AI behavior at the edge of mondayDB. The core engine stores facts, instructions, embeddings, policy metadata, and audit traces as deterministic records. Agents may use those records for reasoning, but mondayDB only executes bounded, account-scoped retrieval plans.

## Goals

- Store agent procedural memory as versioned, auditable instructions.
- Store semantic memory as tenant-scoped chunks compatible with pgvector or HNSW-backed indexes.
- Expose all memory operations through the monday.com Open API GraphQL surface.
- Prevent autonomous agents from issuing recursive or unbounded retrieval that causes noisy-neighbor impact.
- Preserve hybrid row and columnar strengths: row storage for transactional memory updates, columnar projections for analytics and governance reporting.

## Non-goals

- Letting LLMs generate arbitrary SQL against mondayDB.
- Making embedding generation part of the transactional commit path.
- Returning hidden or implicit AI-enriched results that cannot be replayed.
- Sharing vector indexes across accounts without an explicit tenant boundary.

## Data model

### SQL schema

```sql
CREATE TYPE agent_memory_kind AS ENUM (
  'procedural_instruction',
  'semantic_fact',
  'tool_contract',
  'user_preference'
);

CREATE TABLE agent_memory_records (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  kind agent_memory_kind NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  visibility_policy JSONB NOT NULL,
  embedding_model TEXT,
  embedding VECTOR(1536),
  content_hash BYTEA NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agent_memory_lookup_idx
  ON agent_memory_records (account_id, board_id, item_id, kind)
  WHERE deleted_at IS NULL;

CREATE INDEX agent_memory_metadata_gin_idx
  ON agent_memory_records USING GIN (metadata jsonb_path_ops)
  WHERE deleted_at IS NULL;

-- pgvector-compatible shape. In a distributed deployment, shard or partition by account_id
-- before building per-partition HNSW indexes so tenant isolation remains physical as well as logical.
CREATE INDEX agent_memory_embedding_hnsw_idx
  ON agent_memory_records
  USING hnsw (embedding vector_cosine_ops)
  WHERE deleted_at IS NULL AND embedding IS NOT NULL;

CREATE TABLE agent_memory_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  actor_user_id BIGINT,
  actor_agent_id TEXT,
  action TEXT NOT NULL,
  request_hash BYTEA NOT NULL,
  before_hash BYTEA,
  after_hash BYTEA,
  retrieval_plan JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agent_memory_audit_lookup_idx
  ON agent_memory_audit_events (account_id, memory_id, created_at DESC);
```

### TypeScript interfaces

```ts
export type AgentMemoryKind =
  | "procedural_instruction"
  | "semantic_fact"
  | "tool_contract"
  | "user_preference";

export interface AgentMemoryRecord {
  accountId: number;
  memoryId: string;
  boardId?: number;
  itemId?: number;
  kind: AgentMemoryKind;
  title: string;
  body: string;
  metadata: AgentMemoryMetadata;
  visibilityPolicy: AgentMemoryVisibilityPolicy;
  embeddingModel?: string;
  contentHash: string;
  version: number;
  createdByUserId?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AgentMemoryMetadata {
  tags: string[];
  source: "item_update" | "doc" | "automation" | "integration" | "manual";
  language?: string;
  confidence?: number;
  toolName?: string;
  procedureName?: string;
  expiresAt?: string;
}

export interface AgentMemoryVisibilityPolicy {
  accountId: number;
  boardIds?: number[];
  workspaceIds?: number[];
  allowedRoleIds?: number[];
  piiClass?: "none" | "low" | "moderate" | "restricted";
}

export interface AgentRetrievalPlan {
  accountId: number;
  queryHash: string;
  kinds: AgentMemoryKind[];
  boardIds?: number[];
  itemIds?: number[];
  topK: number;
  maxVectorCandidates: number;
  maxDepth: number;
  timeoutMs: number;
  estimatedCostUnits: number;
}
```

## GraphQL API shape

Every resolver must derive `account_id` from the authenticated monday.com context. Client-provided account IDs are useful for typed contracts, but they must not override auth context.

```graphql
enum AgentMemoryKind {
  PROCEDURAL_INSTRUCTION
  SEMANTIC_FACT
  TOOL_CONTRACT
  USER_PREFERENCE
}

input AgentMemoryInput {
  boardId: ID
  itemId: ID
  kind: AgentMemoryKind!
  title: String!
  body: String!
  metadata: JSON!
  visibilityPolicy: JSON!
}

input AgentMemorySearchInput {
  boardIds: [ID!]
  itemIds: [ID!]
  kinds: [AgentMemoryKind!]!
  query: String!
  topK: Int = 10
  maxDepth: Int = 1
}

type AgentMemory {
  id: ID!
  boardId: ID
  itemId: ID
  kind: AgentMemoryKind!
  title: String!
  body: String!
  metadata: JSON!
  version: Int!
  contentHash: String!
  updatedAt: ISO8601DateTime!
}

type AgentMemorySearchResult {
  memory: AgentMemory!
  score: Float!
  retrievalPlanHash: String!
}

extend type Query {
  agentMemorySearch(input: AgentMemorySearchInput!): [AgentMemorySearchResult!]!
}

extend type Mutation {
  upsertAgentMemory(input: AgentMemoryInput!): AgentMemory!
  deleteAgentMemory(id: ID!): Boolean!
}
```

## Retrieval execution path

1. Resolve `account_id`, user permissions, and board access from the authenticated request.
2. Normalize the search input into an `AgentRetrievalPlan`.
3. Reject the request if the plan exceeds guardrails before touching row or vector storage.
4. Run semantic retrieval only against rows where `account_id = auth.account_id` and `deleted_at IS NULL`.
5. Re-rank candidates with deterministic metadata filters and permission checks.
6. Write an audit event containing request hash, plan hash, selected IDs, and cost counters.
7. Return records and scores. Do not return hidden prompts, inferred facts, or model-private state.

## Guardrails for autonomous agents

| Guardrail | Default | Why |
| --- | ---: | --- |
| `topK` | 10, max 50 | Prevents broad memory dumps and token amplification. |
| `maxVectorCandidates` | 200 | Caps HNSW candidate expansion before metadata filters. |
| `maxDepth` | 1 | Blocks recursive agent retrieval loops by default. |
| `timeoutMs` | 250 | Keeps retrieval in the interactive path budget. |
| `estimatedCostUnits` | account-tier based | Allows predictable throttling per tenant. |
| Required scope | account plus board/item/workspace filter for large accounts | Avoids accidental account-wide scans. |

Requests that exceed these values should fail with a deterministic GraphQL error such as `AGENT_RETRIEVAL_BUDGET_EXCEEDED`, including the violated limit and a stable `retrievalPlanHash` for supportability.

## Performance check

Potential full table scan risks on boards with 1M+ rows:

- Missing `account_id` in any row, vector, or audit query predicate.
- JSON metadata filters without a supporting GIN index or a precomputed columnar projection.
- Account-wide vector search without board, workspace, item, kind, or time window constraints.
- Sorting audit events without `(account_id, memory_id, created_at DESC)`.
- Re-embedding synchronous with item writes, which would extend transaction latency and reduce availability.

Mitigations:

- Make `(account_id, memory_id)` the primary key and prefix every secondary lookup with `account_id`.
- Partition large vector indexes by account or account bucket, then apply HNSW inside the partition.
- Write memory rows transactionally, but generate embeddings asynchronously from immutable change events.
- Project governance fields (`kind`, `source`, `piiClass`, `toolName`) to columnar storage for analytics.
- Enforce a query planner rule: no agent memory query is valid unless tenant scope is known before planning.

## Agent perception model

An LLM or agent should perceive memory records as bounded, typed context:

- `procedural_instruction`: "How work should be done" for a board, workspace, or automation.
- `semantic_fact`: "What is known" from items, docs, integrations, or prior user-approved summaries.
- `tool_contract`: "Which tools are available and what arguments are safe."
- `user_preference`: "How this account or user prefers outputs and workflows."

Metadata tags let agents select the right context without scanning raw board data. Example:

```json
{
  "tags": ["sales-pipeline", "renewal-risk", "approved-playbook"],
  "source": "doc",
  "language": "en",
  "confidence": 0.92,
  "procedureName": "enterprise_renewal_review",
  "expiresAt": "2026-12-31T00:00:00Z"
}
```

## Enterprise auditability

Audit events must be append-only and deterministic. The `request_hash`, `before_hash`, and `after_hash` fields allow support teams to replay what changed without storing model reasoning. The `retrieval_plan` stores bounded execution facts: filters, limits, candidate counts, selected IDs, timeout, and cost units.

For compliance exports, columnar projections should include:

- account ID
- memory kind
- actor user or agent ID
- action
- timestamp
- PII class
- retrieval plan hash

## Open questions

- Should HNSW indexes be physically per-account for enterprise tenants and bucketed for smaller tenants?
- Which account tiers can use account-wide semantic search without requiring board or workspace filters?
- What is the canonical embedding dimension if mondayDB supports multiple embedding providers?
- Should procedural memory require admin approval before becoming visible to automations?
