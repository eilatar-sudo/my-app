# mondayDB Agentic Operating Model

## Why this exists

mondayDB can become an agentic database without turning the database engine into a
probabilistic system. The product trade-off is clear: agents need semantic memory,
tool-use context, and procedural guidance, while enterprise customers need
predictable latency, ACID writes, tenant isolation, and auditable outcomes.

The operating model below keeps mondayDB deterministic by compiling every
agent-facing request into an explicit, tenant-scoped operating envelope before
row, columnar, vector, or tool workloads are admitted. The envelope is the contract
an agent can perceive and the database can enforce.

## Product position

### The "why" before the "how"

1. **Latency vs. consistency**
   - Agents benefit from broad context, but broad context can create slow fan-out
     reads across row, columnar, and vector paths.
   - mondayDB should default to bounded, fresh-enough context for read planning,
     then require explicit stronger consistency for ACID write preparation.

2. **Semantic recall vs. tenant isolation**
   - Vector search unlocks retrieval-augmented generation, but embeddings become
     another data surface that must never cross account boundaries.
   - Every vector index, cache key, and retrieval route must be partitioned or
     filtered by `account_id` before semantic similarity is evaluated.

3. **Autonomy vs. neighbor performance**
   - Autonomous agents can recursively inspect boards, retry tools, and expand
     retrieval queries.
   - mondayDB should admit agent workloads only after deterministic budget checks
     for row scans, columnar reads, vector `topK`, recursion depth, and tool calls.

4. **Procedural memory vs. "magic" behavior**
   - Agents need reusable instructions, but the database must not infer hidden
     behavior from prompts.
   - Procedures should be versioned data records referenced by ID, visible through
     the Open API, and included in audit hashes.

## Core abstraction: Agent Operating Envelope

An **Agent Operating Envelope** is a deterministic, account-scoped contract that
binds an agent request to:

- the tenant and actor scope,
- the business purpose,
- row, columnar, vector, and tool permissions,
- procedural memory versions,
- budget and recursion limits,
- consistency requirements,
- audit hash inputs,
- the compact perception packet exposed to the agent.

The agent can use the envelope as its "map" of what it may do. The database can
use the same envelope to enforce predictable execution.

## TypeScript contracts

```ts
export type AgentWorkloadKind =
  | "row_read"
  | "row_write"
  | "columnar_aggregation"
  | "vector_retrieval"
  | "hybrid_context"
  | "tool_execution";

export type ConsistencyLevel =
  | "snapshot"
  | "read_committed"
  | "serializable_prepare"
  | "committed_write";

export interface AgentOperatingEnvelope {
  envelopeId: string;
  accountId: string;
  boardIds: string[];
  actorUserId: string;
  agentId: string;
  purposeId: string;
  workloadKinds: AgentWorkloadKind[];
  consistency: ConsistencyLevel;
  budget: AgentBudget;
  memoryScope: AgentMemoryScope;
  retrievalRoutes: SemanticRetrievalRoute[];
  toolScopes: AgentToolScope[];
  guardrails: AgentGuardrailPolicy;
  perception: AgentPerceptionCard;
  sourceWatermarks: SourceWatermark[];
  audit: AgentAuditEnvelope;
  createdAt: string;
  expiresAt: string;
}

export interface AgentBudget {
  maxEstimatedRows: number;
  maxColumnarPartitions: number;
  maxVectorTopK: number;
  maxExpansionDepth: number;
  maxToolCalls: number;
  maxWallClockMs: number;
  budgetTokenHash: string;
}

export interface AgentMemoryScope {
  proceduralMemoryRefs: VersionedMemoryRef[];
  semanticMemoryRefs: VersionedMemoryRef[];
  allowMemoryPromotion: boolean;
  memoryPromotionReview: "disabled" | "human_review" | "policy_auto";
}

export interface VersionedMemoryRef {
  memoryId: string;
  version: number;
  accountId: string;
  tags: string[];
  summary: string;
}

export interface SemanticRetrievalRoute {
  routeId: string;
  accountId: string;
  sourceKind: "item" | "update" | "file" | "procedure" | "audit_event";
  embeddingIndex: string;
  metadataFilters: Record<string, string | number | boolean>;
  minScore: number;
  topK: number;
  hnswEfSearch: number;
}

export interface AgentToolScope {
  toolName: string;
  allowedActions: string[];
  maxCalls: number;
  argumentPolicyId: string;
  requiresWriteIntent: boolean;
}

export interface AgentGuardrailPolicy {
  rejectUnscopedAccountQueries: true;
  rejectFullBoardScanAboveRows: number;
  rejectUnboundedVectorSearch: true;
  rejectRecursiveExpansionAboveDepth: number;
  requireExplainBeforeWrite: true;
  requireAuditHash: true;
}

export interface AgentPerceptionCard {
  cardId: string;
  accountId: string;
  visibleSummary: string;
  entityTags: string[];
  riskTags: string[];
  suggestedActions: string[];
  forbiddenActions: string[];
  proceduralHints: string[];
  freshnessSummary: string;
  auditHash: string;
}

export interface SourceWatermark {
  source: "row_store" | "columnar_store" | "vector_index" | "tool_ledger";
  watermark: string;
  observedAt: string;
}

export interface AgentAuditEnvelope {
  requestHash: string;
  envelopeHash: string;
  plannerVersion: string;
  policyVersion: string;
  previousAuditHash?: string;
}
```

## SQL schema

The schema is intentionally `account_id` leading. That keeps planner choices
tenant-scoped and makes accidental cross-tenant access structurally harder.

```sql
CREATE TABLE agent_operating_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  actor_user_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  purpose_id TEXT NOT NULL,
  board_ids BIGINT[] NOT NULL,
  workload_kinds TEXT[] NOT NULL,
  consistency_level TEXT NOT NULL,
  budget_token_hash TEXT NOT NULL,
  max_estimated_rows BIGINT NOT NULL,
  max_columnar_partitions INTEGER NOT NULL,
  max_vector_top_k INTEGER NOT NULL,
  max_expansion_depth INTEGER NOT NULL,
  max_tool_calls INTEGER NOT NULL,
  max_wall_clock_ms INTEGER NOT NULL,
  planner_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  source_watermarks JSONB NOT NULL,
  perception_card JSONB NOT NULL,
  request_hash TEXT NOT NULL,
  envelope_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE INDEX agent_operating_envelopes_actor_idx
  ON agent_operating_envelopes (account_id, actor_user_id, created_at DESC);

CREATE INDEX agent_operating_envelopes_purpose_idx
  ON agent_operating_envelopes (account_id, purpose_id, created_at DESC);

CREATE TABLE agent_envelope_memory_refs (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  memory_version INTEGER NOT NULL,
  memory_kind TEXT NOT NULL CHECK (memory_kind IN ('procedural', 'semantic')),
  tags TEXT[] NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id, memory_id, memory_version),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_operating_envelopes (account_id, envelope_id)
);

CREATE INDEX agent_envelope_memory_refs_kind_idx
  ON agent_envelope_memory_refs (account_id, memory_kind, memory_id);

CREATE TABLE agent_semantic_routes (
  account_id BIGINT NOT NULL,
  route_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  source_kind TEXT NOT NULL,
  embedding_index TEXT NOT NULL,
  metadata_filters JSONB NOT NULL,
  min_score DOUBLE PRECISION NOT NULL,
  top_k INTEGER NOT NULL,
  hnsw_ef_search INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, route_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_operating_envelopes (account_id, envelope_id)
);

CREATE INDEX agent_semantic_routes_envelope_idx
  ON agent_semantic_routes (account_id, envelope_id, source_kind);

CREATE TABLE agent_envelope_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  event_kind TEXT NOT NULL,
  deterministic_payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agent_operating_envelopes (account_id, envelope_id)
);

CREATE INDEX agent_envelope_audit_events_envelope_idx
  ON agent_envelope_audit_events (account_id, envelope_id, created_at DESC);
```

### Vector index compatibility

For pgvector/HNSW-compatible retrieval, embeddings should be stored in a
tenant-partitioned relation or an account-hash partitioned relation:

```sql
CREATE TABLE agent_semantic_embeddings (
  account_id BIGINT NOT NULL,
  account_hash_bucket INTEGER NOT NULL,
  object_id UUID NOT NULL,
  object_kind TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL,
  source_watermark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, object_id)
);

CREATE INDEX agent_semantic_embeddings_hnsw_idx
  ON agent_semantic_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX agent_semantic_embeddings_scope_idx
  ON agent_semantic_embeddings
  (account_id, object_kind, account_hash_bucket);
```

Any query using the HNSW index must include `account_id` and bounded `topK`.
If the planner cannot prove tenant scope before vector similarity evaluation,
the request should be rejected instead of degraded.

## Open API GraphQL surface

Every capability must be available through monday.com's Open API. The GraphQL
shape below exposes envelope compilation, perception lookup, and audit replay
without exposing hidden prompts or raw planner internals.

```graphql
input CompileAgentOperatingEnvelopeInput {
  accountId: ID!
  boardIds: [ID!]!
  actorUserId: ID!
  agentId: ID!
  purposeId: ID!
  workloadKinds: [AgentWorkloadKind!]!
  consistency: ConsistencyLevel!
  requestedBudget: AgentBudgetInput!
  proceduralMemoryIds: [ID!]!
  semanticRouteHints: [SemanticRouteHintInput!]!
  toolNames: [String!]!
}

type Mutation {
  compileAgentOperatingEnvelope(
    input: CompileAgentOperatingEnvelopeInput!
  ): AgentOperatingEnvelope!
}

type Query {
  agentOperatingEnvelope(
    accountId: ID!
    envelopeId: ID!
  ): AgentOperatingEnvelope

  agentPerceptionCard(
    accountId: ID!
    envelopeId: ID!
  ): AgentPerceptionCard

  agentEnvelopeAuditTrail(
    accountId: ID!
    envelopeId: ID!
    limit: Int = 100
  ): [AgentAuditEvent!]!
}

type AgentOperatingEnvelope {
  envelopeId: ID!
  accountId: ID!
  boardIds: [ID!]!
  purposeId: ID!
  workloadKinds: [AgentWorkloadKind!]!
  consistency: ConsistencyLevel!
  budget: AgentBudget!
  memoryRefs: [AgentMemoryRef!]!
  semanticRoutes: [SemanticRetrievalRoute!]!
  toolScopes: [AgentToolScope!]!
  guardrails: AgentGuardrailPolicy!
  perception: AgentPerceptionCard!
  auditHash: String!
  expiresAt: String!
}
```

## Execution flow

1. **Compile**
   - Validate `account_id`, actor, board scope, purpose, and requested workload.
   - Resolve procedural memory versions and semantic route hints.
   - Produce deterministic request and envelope hashes.

2. **Plan**
   - Estimate row count, columnar partition count, vector `topK`, tool calls, and
     recursion depth.
   - Select row store for transactional point reads/writes, columnar store for
     bounded aggregations, and vector routes for semantic context.

3. **Admit or reject**
   - Admit only if all estimates fit the envelope budget.
   - Reject requests with missing `account_id`, unbounded vector search, recursive
     expansion beyond the limit, or full-board scan risk.

4. **Retrieve and act**
   - Provide the agent with perception cards and allowed references, not raw
     hidden data surfaces.
   - Require write-intent preparation before any ACID mutation.

5. **Audit**
   - Append audit events with deterministic payload hashes.
   - Include policy version, planner version, memory versions, route IDs, and
     previous audit hashes for replay.

## Performance checks for 1M+ row boards

Flag or reject any envelope when the planner detects:

- no `account_id` predicate on row, columnar, vector, memory, or audit tables;
- board filters that cannot use `(account_id, board_id, item_id)` or equivalent
  composite indexes;
- JSON filters without a compiled schema contract or generated indexed column;
- vector retrieval without account partitioning and bounded `topK`;
- recursive expansion where `estimatedRows * expansionDepth` exceeds budget;
- columnar aggregations that cross too many partitions without pre-aggregation;
- tool loops that can re-enter the same query route without a loop key;
- memory promotion jobs that scan historical events without source watermarks.

For large boards, degradation should be explicit:

- reduce vector `topK`;
- switch from exact freshness to snapshot freshness for read-only context;
- use pre-aggregated columnar summaries;
- require human review for write intents;
- reject the request with explainable reason codes when safety cannot be proven.

## Agentic guardrails

| Risk | Deterministic guardrail | Agent perception |
| --- | --- | --- |
| Recursive query loop | `max_expansion_depth` and route loop keys | "Expansion limit reached; ask for narrower scope." |
| Neighbor impact | Row, columnar, vector, and tool budgets | "Request queued, degraded, or rejected due to capacity." |
| Cross-tenant leakage | `account_id`-leading keys and partition checks | "Only account-scoped context is visible." |
| Unbounded RAG | `topK`, score threshold, and source filters | "Retrieved bounded semantic references." |
| Unsafe write | Write-intent prepare and explain requirement | "Mutation requires verified write intent." |
| Hidden AI behavior | Versioned procedural memory refs | "Using procedure X at version Y." |

## Auditability model

Audit records should be deterministic and replayable:

```ts
export interface AgentAuditEvent {
  accountId: string;
  auditEventId: string;
  envelopeId: string;
  eventKind:
    | "compiled"
    | "planned"
    | "admitted"
    | "degraded"
    | "rejected"
    | "retrieved"
    | "tool_called"
    | "write_prepared"
    | "write_committed";
  deterministicPayload: Record<string, unknown>;
  payloadHash: string;
  previousAuditHash?: string;
  createdAt: string;
}
```

Do not audit raw redacted values, prompts, or embeddings. Audit stable IDs,
policy decisions, watermarks, version numbers, reason codes, and hashes.

## Agent-ready perception

An LLM should perceive mondayDB through compact, deterministic metadata instead
of raw database internals:

```json
{
  "cardId": "card_123",
  "accountId": "acct_456",
  "visibleSummary": "You may answer questions about board 111 using snapshot context.",
  "entityTags": ["board:111", "workflow:renewals", "object:item"],
  "riskTags": ["large_board", "bounded_vector_top_k", "write_requires_intent"],
  "suggestedActions": ["retrieve_semantic_context", "ask_for_narrower_scope"],
  "forbiddenActions": ["cross_account_search", "unbounded_board_scan"],
  "proceduralHints": ["procedure:onboarding-triage@7"],
  "freshnessSummary": "Row snapshot at r:88421; vector index at v:88400.",
  "auditHash": "sha256:..."
}
```

This makes the system agent-ready without allowing agents to invent database
capabilities or bypass deterministic controls.

## Engineering acceptance criteria

- All persisted records and API calls are scoped by `account_id`.
- Envelope compilation is deterministic for the same request, policy version,
  planner version, memory versions, and source watermarks.
- Vector retrieval is compatible with pgvector/HNSW and bounded by tenant,
  metadata filters, and `topK`.
- ACID writes require explicit write-intent preparation and audit events.
- Planner rejection paths include reason codes suitable for Open API clients.
- No agent route can trigger unbounded recursive queries or full table scans on
  boards with 1M+ rows.
- Perception cards expose useful metadata to LLMs while hiding raw sensitive
  values, prompts, and engine internals.

## Strategic outcome

The operating envelope lets mondayDB evolve from a high-performance WorkOS
engine into an agentic database by making autonomy explicit, deterministic, and
bounded. Product teams get a clear API surface for agent features. Platform teams
retain predictable query planning, isolation, and audit replay. Agents receive a
structured perception layer that tells them what context exists, what actions are
allowed, and where the guardrails are.
