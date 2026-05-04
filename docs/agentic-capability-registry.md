# Agentic Capability Registry for mondayDB

## Why: make agents useful without making the engine magical

mondayDB can become an agentic database by exposing deterministic, tenant-scoped
records that describe what an agent may know, retrieve, and do. The product
trade-off is latency versus consistency:

- Agent planning needs low-latency semantic lookup across instructions, tools,
  and board context.
- Enterprise customers need ACID writes, replayable audits, and predictable
  behavior when autonomous agents touch production boards.

The registry below keeps probabilistic LLM decisions outside the database
engine. mondayDB stores capability facts, procedural memory, vector metadata,
budgets, and audit trails. Agents perceive these records as grounded context,
but every query, write, and tool invocation remains deterministic and scoped by
`account_id`.

## Concept: tenant-scoped capability registry

Each capability describes one safe unit of agent behavior: an instruction set,
retrieval target, or tool affordance. The registry is schemaless-friendly for
feature evolution, but uses stable indexed fields for multi-tenancy, audit, and
cost control.

```ts
export type AgenticCapabilityKind =
  | "procedural_memory"
  | "semantic_context"
  | "tool_affordance"
  | "query_template";

export type AgenticCapabilityStatus = "draft" | "active" | "disabled";

export interface AgenticCapability {
  account_id: string;
  capability_id: string;
  board_id?: string;
  kind: AgenticCapabilityKind;
  status: AgenticCapabilityStatus;
  name: string;
  description: string;

  /**
   * Deterministic instructions. LLMs can read this, but mondayDB only stores
   * and versions it; no probabilistic behavior runs in the storage layer.
   */
  procedure: {
    version: number;
    steps: Array<{
      step_id: string;
      instruction: string;
      allowed_tool_ids: string[];
      max_rows_read: number;
      max_rows_written: number;
    }>;
  };

  retrieval: {
    embedding_ref?: string;
    embedding_model: string;
    hnsw_namespace: string;
    metadata_tags: string[];
    top_k_default: number;
    top_k_max: number;
  };

  guardrails: {
    max_query_cost_units: number;
    max_recursion_depth: number;
    timeout_ms: number;
    require_human_approval_for_writes: boolean;
  };

  audit: {
    created_by_user_id: string;
    created_at: string;
    updated_at: string;
    procedure_hash: string;
    previous_audit_hash?: string;
  };
}
```

## SQL storage shape

The row path owns transactional updates and the columnar path can project
read-heavy fields for analytics and observability.

```sql
CREATE TABLE agentic_capabilities (
  account_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  board_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  procedure_json JSONB NOT NULL,
  retrieval_json JSONB NOT NULL,
  guardrails_json JSONB NOT NULL,
  procedure_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, capability_id)
);

CREATE INDEX agentic_capabilities_board_idx
  ON agentic_capabilities (account_id, board_id, status, kind);

CREATE INDEX agentic_capabilities_tags_gin_idx
  ON agentic_capabilities
  USING GIN ((retrieval_json -> 'metadata_tags'));
```

Vector data remains tenant-partitioned and compatible with pgvector/HNSW.

```sql
CREATE TABLE agentic_capability_embeddings (
  account_id TEXT NOT NULL,
  embedding_ref TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  board_id TEXT,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, embedding_ref),
  FOREIGN KEY (account_id, capability_id)
    REFERENCES agentic_capabilities (account_id, capability_id)
);

CREATE INDEX agentic_capability_embeddings_hnsw_idx
  ON agentic_capability_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX agentic_capability_embeddings_scope_idx
  ON agentic_capability_embeddings (account_id, board_id, embedding_model);
```

## Open API GraphQL surface

Every resolver must require `account_id` from authenticated context and reject
cross-account IDs before query planning.

```graphql
type AgenticCapability {
  accountId: ID!
  capabilityId: ID!
  boardId: ID
  kind: AgenticCapabilityKind!
  status: AgenticCapabilityStatus!
  name: String!
  description: String!
  procedure: AgenticProcedure!
  retrieval: AgenticRetrievalConfig!
  guardrails: AgenticGuardrails!
  audit: AgenticAudit!
}

input AgenticCapabilityFilter {
  boardId: ID
  kind: AgenticCapabilityKind
  status: AgenticCapabilityStatus = active
  metadataTags: [String!]
}

input AgenticSemanticSearchInput {
  boardId: ID
  query: String!
  metadataTags: [String!]
  topK: Int = 8
  maxQueryCostUnits: Int = 100
}

type Query {
  agenticCapabilities(filter: AgenticCapabilityFilter!, limit: Int = 50): [AgenticCapability!]!
  agenticCapabilitySearch(input: AgenticSemanticSearchInput!): [AgenticCapability!]!
}

type Mutation {
  upsertAgenticCapability(input: UpsertAgenticCapabilityInput!): AgenticCapability!
  disableAgenticCapability(capabilityId: ID!): AgenticCapability!
}
```

## Query guardrails

1. Require `account_id` in every physical query and prefix every primary index
   with `account_id`.
2. Clamp `topK` to `top_k_max` from the stored capability policy.
3. Reject recursive agent retrieval when `max_recursion_depth` is exhausted.
4. Estimate cost before vector lookup and before row hydration.
5. Split vector candidate retrieval from row hydration:
   - HNSW returns bounded `(account_id, embedding_ref, distance)` candidates.
   - Row store hydrates only matching `(account_id, capability_id)` keys.
6. Emit deterministic audit events for create, update, disable, search, and
   denied execution.

```ts
export interface AgenticCapabilityAuditEvent {
  account_id: string;
  event_id: string;
  capability_id: string;
  event_type:
    | "capability.created"
    | "capability.updated"
    | "capability.disabled"
    | "capability.search"
    | "capability.denied";
  actor_user_id?: string;
  actor_agent_id?: string;
  request_hash: string;
  result_hash: string;
  previous_audit_hash?: string;
  created_at: string;
}
```

## Performance checks for 1M+ row boards

Potential full table scan risks:

- Filtering by `metadata_tags` without `account_id` and `status`.
- Hydrating semantic search results by `capability_id` alone.
- Allowing unbounded `topK` from LLM-generated input.
- JSONB predicates on `procedure_json` without promoted indexed fields.
- Cross-board semantic search that omits `board_id` for large tenants.

Required mitigations:

- Keep `account_id` mandatory in resolver context and physical plans.
- Promote high-cardinality filters from JSON into typed columns before GA.
- Use bounded HNSW candidate counts, then hydrate by composite primary key.
- Add per-account query budgets so one autonomous agent cannot degrade neighbor
  performance.
- Project registry events into columnar storage for audit analytics instead of
  scanning transactional rows.

## Agent perception model

An LLM or autonomous agent should see each capability as tagged, versioned
context:

```ts
export interface AgentContextCard {
  capability_id: string;
  title: string;
  summary: string;
  metadata_tags: string[];
  allowed_tool_ids: string[];
  budget: {
    max_query_cost_units: number;
    max_recursion_depth: number;
    timeout_ms: number;
  };
  audit_ref: {
    procedure_hash: string;
    previous_audit_hash?: string;
  };
}
```

The card gives agents enough procedural memory to act, enough semantic metadata
for RAG, and enough guardrail data to stop expensive or unsafe plans before they
reach mondayDB execution.
