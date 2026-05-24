# Agentic Retrieval Router Plane

## Why before how

mondayDB needs agents to find the right context without giving them an
unbounded path across row, columnar, and vector storage. The product trade-off
is recall versus predictability: broad semantic retrieval can improve answer
quality, but every additional candidate expansion increases latency, cost, and
neighbor-impact risk. The Retrieval Router Plane makes the retrieval choice
explicit and deterministic before any expensive scan or vector search runs.

The goal is not to let an LLM decide how mondayDB queries data. The agent may
describe intent and provide embeddings, but mondayDB selects an approved
retrieval route from tenant-scoped metadata, current budgets, index coverage,
and plan verification. This keeps the database engine deterministic while
making the returned context easier for agents to perceive and use.

## Design goals

- Route agent retrieval requests across row, columnar, vector, and hybrid paths
  with deterministic cost and tenant checks.
- Preserve multi-tenant isolation by requiring `account_id` on every route,
  candidate set, semantic index, and audit record.
- Support procedural memory by attaching agent-readable route instructions,
  required predicates, and escalation rules to each retrieval surface.
- Keep semantic retrieval compatible with pgvector/HNSW while avoiding global
  vector traversal.
- Expose the full control surface through the monday.com Open API GraphQL
  contract.
- Prevent recursive or exploratory agent loops from degrading 1M+ row boards.

## Non-goals

- No direct LLM-generated SQL or hidden query rewrites in the data layer.
- No retrieval route that can bypass access policies, query budgets, or plan
  verification.
- No cross-account vector index, cache, or candidate set.
- No implicit write, tool call, or procedure execution from retrieval results.
- No full-board fallback when metadata is missing; missing route metadata fails
  closed and emits an audit event.

## Core model

The Retrieval Router Plane has four deterministic records:

1. `agent_retrieval_routes`: named tenant-scoped retrieval strategies.
2. `agent_retrieval_route_versions`: immutable instructions, predicates,
   route limits, and audit hashes.
3. `agent_retrieval_requests`: each agent retrieval attempt, including the
   selected route, budget reservation, plan hash, and outcome.
4. `agent_retrieval_candidates`: bounded result references returned to the
   agent with source metadata and perception tags.

Routes are selected before execution. A request can be served by a row lookup,
columnar aggregation, vector search, or hybrid sequence, but every step must
prove `account_id` filtering, budget availability, and index coverage.

## TypeScript contracts

```ts
export type RetrievalRouteKind = "row" | "columnar" | "vector" | "hybrid";

export type RetrievalRouteStatus = "draft" | "active" | "deprecated" | "blocked";

export type RetrievalPurpose =
  | "task_context"
  | "procedure_selection"
  | "semantic_memory"
  | "analytics_summary"
  | "support_replay";

export interface RetrievalPredicateContract {
  requiredAccountPredicate: true;
  requiredBoardPredicate: boolean;
  allowedBoardIds: string[];
  allowedColumnIds: string[];
  allowedEntityTypes: Array<"item" | "update" | "doc" | "procedure" | "audit_event">;
  requiredTimeWindow?: {
    maxLookbackDays: number;
    defaultLookbackDays: number;
  };
}

export interface RetrievalBudgetContract {
  maxEstimatedRows: number;
  maxEstimatedCostUnits: number;
  maxVectorTopK: number;
  maxHybridFanout: number;
  timeoutMs: number;
  allowColumnarFallback: boolean;
}

export interface AgentRetrievalRoute {
  routeId: string;
  accountId: string;
  namespace: string;
  slug: string;
  status: RetrievalRouteStatus;
  routeKind: RetrievalRouteKind;
  purpose: RetrievalPurpose;
  ownerUserId: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalRouteStep {
  stepId: string;
  source: "row_store" | "columnar_store" | "vector_index" | "cache";
  instruction: string;
  requiredInputs: string[];
  producedRefs: Array<"row_ref" | "columnar_metric" | "semantic_ref" | "procedure_ref">;
  requiredIndexes: string[];
  maxFanout: number;
}

export interface AgentRetrievalRouteVersion {
  versionId: string;
  routeId: string;
  accountId: string;
  versionNumber: number;
  summary: string;
  predicateContract: RetrievalPredicateContract;
  budgetContract: RetrievalBudgetContract;
  steps: RetrievalRouteStep[];
  semanticTags: string[];
  perceptionHints: {
    preferredSummaryFields: string[];
    confidenceSignals: string[];
    staleAfterSeconds: number;
  };
  embeddingRef?: {
    model: string;
    dimensions: number;
    embeddingId: string;
  };
  auditHash: string;
  previousAuditHash?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface AgentRetrievalRequest {
  requestId: string;
  accountId: string;
  routeId: string;
  versionId: string;
  actorUserId: string;
  agentId: string;
  purpose: RetrievalPurpose;
  boardIds: string[];
  queryChecksum: string;
  queryEmbeddingRef?: string;
  budgetReservationId: string;
  planHash: string;
  status: "accepted" | "rejected" | "completed" | "timed_out";
  rejectionReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RetrievalCandidate {
  candidateId: string;
  requestId: string;
  accountId: string;
  source: "row_store" | "columnar_store" | "vector_index" | "cache";
  entityType: "item" | "update" | "doc" | "procedure" | "audit_event" | "metric";
  entityId: string;
  boardId?: string;
  columnId?: string;
  rank: number;
  score?: number;
  perceptionTags: string[];
  sourceWatermark: string;
  auditHash: string;
}
```

## SQL schema

The row store owns route metadata and request audit trails. Vector indexes are
derived projections over immutable route versions and must remain partitioned
by `account_id`. The router never performs a global nearest-neighbor search.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_retrieval_routes (
  account_id BIGINT NOT NULL,
  route_id UUID NOT NULL,
  namespace TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'deprecated', 'blocked')),
  route_kind TEXT NOT NULL CHECK (route_kind IN ('row', 'columnar', 'vector', 'hybrid')),
  purpose TEXT NOT NULL CHECK (
    purpose IN (
      'task_context',
      'procedure_selection',
      'semantic_memory',
      'analytics_summary',
      'support_replay'
    )
  ),
  owner_user_id BIGINT NOT NULL,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, route_id),
  UNIQUE (account_id, namespace, slug)
);

CREATE TABLE agent_retrieval_route_versions (
  account_id BIGINT NOT NULL,
  route_id UUID NOT NULL,
  version_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  predicate_contract JSONB NOT NULL,
  budget_contract JSONB NOT NULL,
  steps JSONB NOT NULL,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  perception_hints JSONB NOT NULL,
  audit_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, version_id),
  UNIQUE (account_id, route_id, version_number),
  FOREIGN KEY (account_id, route_id)
    REFERENCES agent_retrieval_routes (account_id, route_id)
);

CREATE TABLE agent_retrieval_route_embeddings (
  account_id BIGINT NOT NULL,
  route_id UUID NOT NULL,
  version_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, version_id),
  FOREIGN KEY (account_id, version_id)
    REFERENCES agent_retrieval_route_versions (account_id, version_id)
)
PARTITION BY HASH (account_id);

CREATE TABLE agent_retrieval_requests (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  route_id UUID NOT NULL,
  version_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  agent_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  board_ids BIGINT[] NOT NULL DEFAULT '{}',
  query_checksum TEXT NOT NULL,
  query_embedding_ref UUID,
  budget_reservation_id UUID NOT NULL,
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'completed', 'timed_out')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, request_id),
  FOREIGN KEY (account_id, version_id)
    REFERENCES agent_retrieval_route_versions (account_id, version_id)
);

CREATE TABLE agent_retrieval_candidates (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('row_store', 'columnar_store', 'vector_index', 'cache')),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('item', 'update', 'doc', 'procedure', 'audit_event', 'metric')
  ),
  entity_id TEXT NOT NULL,
  board_id BIGINT,
  column_id TEXT,
  rank INTEGER NOT NULL,
  score DOUBLE PRECISION,
  perception_tags TEXT[] NOT NULL DEFAULT '{}',
  source_watermark TEXT NOT NULL,
  audit_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id, candidate_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_retrieval_requests (account_id, request_id)
);

CREATE INDEX agent_retrieval_routes_active_idx
  ON agent_retrieval_routes (account_id, status, purpose, route_kind, namespace);

CREATE INDEX agent_retrieval_versions_route_idx
  ON agent_retrieval_route_versions (account_id, route_id, version_number DESC);

CREATE INDEX agent_retrieval_embeddings_filter_idx
  ON agent_retrieval_route_embeddings (account_id, purpose, embedding_model);

CREATE INDEX agent_retrieval_embeddings_hnsw_idx
  ON agent_retrieval_route_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX agent_retrieval_requests_actor_idx
  ON agent_retrieval_requests (account_id, actor_user_id, created_at DESC);

CREATE INDEX agent_retrieval_candidates_request_rank_idx
  ON agent_retrieval_candidates (account_id, request_id, rank);

CREATE INDEX agent_retrieval_candidates_board_idx
  ON agent_retrieval_candidates (account_id, board_id, entity_type);
```

### Route discovery query

Route discovery is scoped by tenant and purpose before optional semantic
ranking. The HNSW index is entered only after `account_id`, `purpose`, and
`embedding_model` prune the candidate partition.

```sql
SELECT
  e.account_id,
  e.route_id,
  e.version_id,
  1 - (e.embedding <=> :query_embedding) AS similarity
FROM agent_retrieval_route_embeddings e
JOIN agent_retrieval_routes r
  ON r.account_id = e.account_id
 AND r.route_id = e.route_id
WHERE e.account_id = :account_id
  AND e.purpose = :purpose
  AND e.embedding_model = :embedding_model
  AND r.status = 'active'
ORDER BY e.embedding <=> :query_embedding
LIMIT LEAST(:top_k, 20);
```

### Candidate materialization query

Candidates are materialized by request so downstream agent context assembly can
paginate and audit by `(account_id, request_id)` without re-running the
underlying retrieval.

```sql
SELECT
  candidate_id,
  source,
  entity_type,
  entity_id,
  board_id,
  rank,
  score,
  perception_tags,
  source_watermark
FROM agent_retrieval_candidates
WHERE account_id = :account_id
  AND request_id = :request_id
ORDER BY rank
LIMIT LEAST(:first, 100);
```

## Open API GraphQL surface

Resolvers derive `accountId` from authentication context. Client-provided
`accountId` is ignored or rejected to prevent tenant confusion.

```graphql
enum AgentRetrievalRouteKind {
  ROW
  COLUMNAR
  VECTOR
  HYBRID
}

enum AgentRetrievalPurpose {
  TASK_CONTEXT
  PROCEDURE_SELECTION
  SEMANTIC_MEMORY
  ANALYTICS_SUMMARY
  SUPPORT_REPLAY
}

type AgentRetrievalRoute {
  id: ID!
  namespace: String!
  slug: String!
  status: String!
  routeKind: AgentRetrievalRouteKind!
  purpose: AgentRetrievalPurpose!
  currentVersion: AgentRetrievalRouteVersion
  updatedAt: ISO8601DateTime!
}

type AgentRetrievalRouteVersion {
  id: ID!
  versionNumber: Int!
  summary: String!
  semanticTags: [String!]!
  predicateContract: JSON!
  budgetContract: JSON!
  perceptionHints: JSON!
  auditHash: String!
  createdAt: ISO8601DateTime!
}

input AgentRetrievalRequestInput {
  routeId: ID!
  purpose: AgentRetrievalPurpose!
  boardIds: [ID!]!
  queryChecksum: String!
  queryEmbeddingRef: ID
  budgetReservationId: ID!
  planHash: String!
}

type AgentRetrievalRequest {
  id: ID!
  route: AgentRetrievalRoute!
  status: String!
  rejectionReason: String
  planHash: String!
  candidates(first: Int = 20, after: String): AgentRetrievalCandidateConnection!
  createdAt: ISO8601DateTime!
  completedAt: ISO8601DateTime
}

type AgentRetrievalCandidate {
  id: ID!
  source: String!
  entityType: String!
  entityId: ID!
  boardId: ID
  rank: Int!
  score: Float
  perceptionTags: [String!]!
  sourceWatermark: String!
  auditHash: String!
}

type Query {
  agentRetrievalRoutes(
    namespace: String
    purpose: AgentRetrievalPurpose!
    routeKind: AgentRetrievalRouteKind
    first: Int = 20
  ): [AgentRetrievalRoute!]!

  agentRetrievalRequest(id: ID!): AgentRetrievalRequest
}

type Mutation {
  createAgentRetrievalRequest(input: AgentRetrievalRequestInput!): AgentRetrievalRequest!
}
```

## Routing lifecycle

1. **Intent normalization:** Convert the agent request into deterministic
   fields: purpose, board IDs, query checksum, optional embedding reference,
   requested route, and budget reservation.
2. **Tenant and policy check:** Verify the route, current version, access
   policy, and budget reservation all share the same `account_id`.
3. **Predicate proof:** Ensure required board, column, entity, and time-window
   predicates are present before building the physical plan.
4. **Index proof:** Confirm every route step names an available row, columnar,
   vector, or cache index. Missing proof rejects the request.
5. **Cost proof:** Compare estimated rows, vector `topK`, hybrid fanout, and
   timeout against the immutable route version.
6. **Execution:** Run the approved route under workload isolation and write the
   bounded candidate set.
7. **Audit:** Chain request, candidate, and route-version hashes so support can
   replay why an agent saw specific context.

## Agentic guardrails

- `maxHybridFanout` limits vector-to-row or row-to-vector expansion.
- `maxVectorTopK` is capped by route version and by tenant budget. Client input
  can reduce it but never raise it.
- Recursive retrieval is denied unless a procedure memory contract explicitly
  allows one nested request with a separate budget reservation.
- Query timeouts are per route step, not only per request, so one slow vector
  search cannot consume the entire tenant workload window.
- Missing `account_id`, unbounded board lists, and empty predicate contracts are
  hard rejections with deterministic `rejection_reason` values.
- Candidate materialization is append-only for a request; reranking creates a
  new request rather than mutating historical perception.

## Procedural memory integration

Routes are procedural memory entry points for retrieval. A procedure can refer
to a route by `(account_id, namespace, slug, version_id)` and include
instructions such as:

```json
{
  "instruction": "Use this route to gather recent blocked-deal context before proposing status updates.",
  "requiredInputs": ["board_id", "date_window", "query_checksum"],
  "expectedOutputs": ["ranked_item_refs", "confidence_signals"],
  "disallowedFollowups": ["recursive_global_search", "unbounded_column_scan"]
}
```

The agent sees the instruction as context. mondayDB enforces the route version
as policy.

## Semantic retrieval compatibility

The route embedding is metadata about when a route is useful, not an embedding
of customer data. Customer content embeddings stay in tenant-scoped semantic
indexes with their own watermarks and visibility filters. This separation lets
agents discover the right retrieval strategy without leaking or mixing data
across accounts.

For pgvector/HNSW:

- Hash partition by `account_id`.
- Include `purpose` and `embedding_model` in the prefilter index.
- Use bounded `LIMIT` values; default `topK` should be 10 and maximum should be
  20 unless an enterprise tenant has an explicit budget contract.
- Store embedding model and dimensions on the route version so reindexing is
  deterministic and auditable.

## Performance check for 1M+ row boards

Any route touching a board with 1M+ rows must prove at least one of:

- Primary-key or item-id lookup in the row store.
- `(account_id, board_id, updated_at)` or equivalent time-window index.
- Columnar aggregate using partition-pruned board and account segments.
- Vector search with tenant partition, bounded `topK`, and row-store hydration
  limited to returned entity IDs.
- Cache hit with source watermarks newer than the route's freshness contract.

The router must reject:

- `WHERE board_id = :board_id` without `account_id = :account_id`.
- JSON/column filters that lack an indexed projection on large boards.
- Hybrid plans where `vector_top_k * row_hydration_fanout` exceeds the route
  version's `maxHybridFanout`.
- Columnar fallback for interactive requests when the route version sets
  `allowColumnarFallback = false`.

## Auditability

Each request writes deterministic hashes:

- `route_version.audit_hash`: immutable route definition.
- `request.plan_hash`: normalized physical plan and estimates.
- `candidate.audit_hash`: selected entity reference, rank, score, source
  watermark, and previous candidate hash.

Support can replay a retrieval decision by loading the route version, budget
reservation, access decision, source watermarks, and candidate hashes for a
single `(account_id, request_id)` pair.

## Agent perception metadata

Candidates carry `perception_tags` so an LLM can understand why context was
returned without inferring hidden database behavior. Suggested tags include:

- `source:row-store`
- `source:columnar-summary`
- `source:tenant-vector-index`
- `freshness:current`
- `freshness:stale-but-allowed`
- `confidence:exact-id-match`
- `confidence:semantic-neighbor`
- `guardrail:bounded-top-k`
- `guardrail:time-windowed`

These tags are descriptive only. They cannot expand permissions or budgets.

## Failure modes and deterministic responses

| Failure | Deterministic response |
| --- | --- |
| Route not active | Reject with `ROUTE_NOT_ACTIVE` |
| Account mismatch | Reject with `TENANT_SCOPE_MISMATCH` and security audit |
| Missing board predicate | Reject with `MISSING_BOARD_PREDICATE` |
| Missing index proof | Reject with `INDEX_PROOF_REQUIRED` |
| Budget exhausted | Reject with `BUDGET_RESERVATION_EXHAUSTED` |
| Vector topK too high | Clamp if lower route still useful; otherwise reject with `TOP_K_LIMIT_EXCEEDED` |
| Step timeout | Mark request `timed_out`, keep partial candidates only if route permits partial results |

## Rollout plan

1. Add route metadata for read-only task-context retrieval on internal boards.
2. Enable vector route discovery for reviewed route versions only.
3. Add hybrid vector-to-row hydration with strict fanout limits.
4. Expose GraphQL request and candidate APIs to selected enterprise tenants.
5. Require route selection for all autonomous agent context retrieval.

## Open questions

- Should interactive agents receive partial candidates on timeout, or should
  partial delivery be limited to support replay workflows?
- Which route purposes require human approval before activation?
- Should enterprise tenants be able to configure `maxVectorTopK` above 20 when
  their workload isolation envelope has reserved capacity?
