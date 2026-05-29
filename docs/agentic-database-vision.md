# mondayDB Agentic Database Vision

## Why this matters

mondayDB already serves the core WorkOS promise: reliable transactions,
low-latency board reads, high-scale aggregations, and tenant isolation across
schemaless customer data. The agentic era adds a different workload shape.
Agents need to retrieve semantically, reuse procedural instructions, prepare
tool calls, and iterate on plans without a human pacing every request.

The product trade-off is not "add AI to the database." It is how to make
mondayDB legible to probabilistic agents while keeping the database engine
deterministic:

- **Latency vs. semantic depth:** Vector retrieval improves relevance, but HNSW
  candidate generation and reranking must be bounded so online board queries
  still feel instantaneous.
- **Consistency vs. memory freshness:** Procedural and semantic memory should be
  available quickly, but ACID row-store commits remain the source of truth.
  Embeddings, columnar projections, and memory compactions are derived from
  committed versions with explicit freshness metadata.
- **Autonomy vs. neighbor safety:** Agents can issue recursive searches and tool
  preparations. mondayDB should admit this work only through deterministic
  budgets, recursion limits, and tenant-scoped cost accounting.
- **Agent usefulness vs. enterprise predictability:** LLMs can synthesize plans,
  but mondayDB should expose facts, instructions, permissions, and audit traces
  through schemas that replay the same way every time.

The north star is an **agentic database control plane** around mondayDB's
existing row, columnar, and API-first architecture: every agent-facing feature
is tenant scoped by `account_id`, exposed through the monday.com Open API, and
audited with deterministic hashes.

## Product capabilities

### 1. Tenant-scoped semantic retrieval

Agents need a way to ask, "What board items, docs, automations, or procedures
are relevant to this goal?" mondayDB should provide semantic retrieval over
board records and metadata without allowing similarity search to bypass
permissions.

- `account_id` is the leading scope on every logical record and query.
- HNSW/pgvector indexes generate candidates inside tenant-aware partitions.
- Permission checks, board/workspace filters, and app scopes are deterministic
  predicates applied before results are returned to an agent.
- Responses include perception metadata so an LLM can cite sources and
  distinguish facts from instructions.

### 2. Procedural memory as first-class data

An agent should not infer operational rules from raw board contents on every
run. mondayDB can store reusable procedures such as renewal playbooks,
escalation rules, incident triage steps, or customer-specific update policies.

- Procedures are versioned, statused, and audit hashed.
- Procedures are retrievable semantically, but execution remains separately
  authorized through tool scopes and guardrail policies.
- Agents perceive procedures as instructions with provenance, not as hidden
  model behavior.

### 3. Agentic workload admission

Agent-originated work should carry intent and budget before it touches shared
compute. The admission plane decides whether to allow, deny, or degrade a plan.

- Every request includes `agent_run_id`, intent, maximum rows, vector candidate
  budget, recursion depth, and timeout.
- The budget ledger accumulates cost across row, columnar, vector, and tool
  preparation steps.
- Queries that risk full scans on 1M+ row boards are rejected for online paths
  unless they include selective indexed predicates or are routed to offline jobs.

### 4. Deterministic evidence and auditability

Enterprise customers need to know what the agent could see, why a result was
returned, and which guardrail approved or denied the next step.

- Retrieval, procedure selection, budget reservation, and write preparation emit
  immutable audit events.
- Audit events include plan fingerprints, request hashes, content hashes, and
  prior event hashes for replayable chains.
- Semantic scores are stored as evidence metadata, never as authorization facts.

## Reference architecture

```text
monday.com Open API (GraphQL)
  |
  |-- auth context: account_id, user_id, app_id
  |-- agent context: agent_run_id, intent, budgets
  v
Agentic Admission Plane
  |-- tenant-scope verification
  |-- policy lookup and budget reservation
  |-- recursion and fanout guardrails
  |-- deterministic audit event creation
  v
mondayDB Query Router
  |-- row store: ACID item state and writes
  |-- columnar store: analytics and aggregations
  |-- vector sidecar: tenant-aware pgvector/HNSW candidates
  |-- procedure memory: versioned instructions
  v
Deterministic Result Envelope
  |-- records and source versions
  |-- perception metadata for agents
  |-- visibility decisions
  |-- cost summary and remaining budget
  |-- audit event ids
```

## TypeScript contracts

```ts
export type AgenticObjectKind =
  | "board_item"
  | "column_value"
  | "doc"
  | "automation"
  | "procedure"
  | "tool_contract";

export type AgenticIntent =
  | "semantic_retrieve"
  | "aggregate"
  | "procedure_lookup"
  | "tool_prepare"
  | "write_prepare";

export interface AgenticQueryEnvelope {
  accountId: string;
  userId: string;
  appId?: string;
  agentRunId: string;
  intent: AgenticIntent;
  boardIds?: string[];
  objectKinds: AgenticObjectKind[];
  metadataTags?: string[];
  maxRows: number;
  maxVectorCandidates: number;
  maxRecursionDepth: number;
  timeoutMs: number;
  explainRequired: boolean;
}

export interface AgenticEmbeddingRecord {
  accountId: string;
  boardId?: string;
  objectKind: AgenticObjectKind;
  objectId: string;
  sourceVersion: string;
  embeddingModel: string;
  embeddingDimension: number;
  metadataTags: string[];
  visibilityHash: string;
  contentHash: string;
  freshnessWatermark: string;
  createdAt: string;
}

export interface AgenticProcedureMemory {
  accountId: string;
  procedureId: string;
  version: number;
  title: string;
  objective: string;
  instructionsMarkdown: string;
  requiredToolScopes: string[];
  guardrailPolicyId: string;
  metadataTags: string[];
  status: "draft" | "active" | "deprecated";
  contentHash: string;
  createdByUserId: string;
  createdAt: string;
}

export interface AgenticGuardrailPolicy {
  accountId: string;
  policyId: string;
  maxRows: number;
  maxVectorCandidates: number;
  maxColumnarSegments: number;
  maxRecursionDepth: number;
  maxToolPreparations: number;
  timeoutMs: number;
  requireIndexedPredicate: boolean;
  allowOfflineFallback: boolean;
}

export interface AgenticPerceptionMetadata {
  objectKind: AgenticObjectKind;
  objectId: string;
  sourceVersion: string;
  semanticScore?: number;
  metadataTags: string[];
  visibility: "direct" | "derived" | "redacted";
  reason: string;
  citationLabel: string;
}

export interface AgenticCostSummary {
  rowStoreReads: number;
  columnarSegmentsRead: number;
  vectorCandidatesScanned: number;
  toolPreparations: number;
  recursionDepthUsed: number;
  estimatedCpuMs: number;
  remainingBudgetPercent: number;
}

export interface AgenticResultEnvelope<TRecord> {
  accountId: string;
  agentRunId: string;
  records: TRecord[];
  perception: AgenticPerceptionMetadata[];
  cost: AgenticCostSummary;
  freshnessWatermark: string;
  auditEventIds: string[];
}
```

## SQL schemas

These tables describe the logical contract. Physical deployment can shard or
partition them across mondayDB's decoupled storage and compute layers.

```sql
CREATE TABLE agentic_embeddings (
  account_id           BIGINT NOT NULL,
  board_id             BIGINT,
  object_kind          TEXT NOT NULL,
  object_id            BIGINT NOT NULL,
  source_version       BIGINT NOT NULL,
  embedding_model      TEXT NOT NULL,
  embedding_dimension  INT NOT NULL,
  embedding            VECTOR(1536) NOT NULL,
  metadata_tags        TEXT[] NOT NULL DEFAULT '{}',
  visibility_hash      BYTEA NOT NULL,
  content_hash         BYTEA NOT NULL,
  freshness_watermark  BIGINT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, object_kind, object_id, source_version)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_embeddings_scope_idx
  ON agentic_embeddings (account_id, board_id, object_kind, created_at DESC);

CREATE INDEX agentic_embeddings_tags_idx
  ON agentic_embeddings USING gin (metadata_tags);

-- Create this HNSW index per account-hash partition so large tenants do not
-- dominate ANN cache residency for smaller tenants.
CREATE INDEX agentic_embeddings_hnsw_idx
  ON agentic_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE agentic_procedure_memories (
  account_id             BIGINT NOT NULL,
  procedure_id           BIGINT NOT NULL,
  version                BIGINT NOT NULL,
  title                  TEXT NOT NULL,
  objective              TEXT NOT NULL,
  instructions_markdown  TEXT NOT NULL,
  required_tool_scopes   TEXT[] NOT NULL DEFAULT '{}',
  guardrail_policy_id    BIGINT NOT NULL,
  metadata_tags          TEXT[] NOT NULL DEFAULT '{}',
  status                 TEXT NOT NULL CHECK (status IN ('draft', 'active', 'deprecated')),
  content_hash           BYTEA NOT NULL,
  created_by_user_id     BIGINT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, procedure_id, version)
);

CREATE INDEX agentic_procedure_active_idx
  ON agentic_procedure_memories (account_id, status, created_at DESC)
  WHERE status = 'active';

CREATE INDEX agentic_procedure_tags_idx
  ON agentic_procedure_memories USING gin (metadata_tags);

CREATE TABLE agentic_guardrail_policies (
  account_id                  BIGINT NOT NULL,
  policy_id                   BIGINT NOT NULL,
  max_rows                    BIGINT NOT NULL,
  max_vector_candidates       INT NOT NULL,
  max_columnar_segments       INT NOT NULL,
  max_recursion_depth         INT NOT NULL,
  max_tool_preparations       INT NOT NULL,
  timeout_ms                  INT NOT NULL,
  require_indexed_predicate   BOOLEAN NOT NULL DEFAULT true,
  allow_offline_fallback      BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id)
);

CREATE TABLE agentic_budget_ledger (
  account_id                  BIGINT NOT NULL,
  agent_run_id                UUID NOT NULL,
  ledger_seq                  BIGINT NOT NULL,
  intent                      TEXT NOT NULL,
  row_store_reads             BIGINT NOT NULL DEFAULT 0,
  columnar_segments_read      BIGINT NOT NULL DEFAULT 0,
  vector_candidates_scanned   BIGINT NOT NULL DEFAULT 0,
  tool_preparations           BIGINT NOT NULL DEFAULT 0,
  recursion_depth_used        INT NOT NULL DEFAULT 0,
  decision                    TEXT NOT NULL CHECK (decision IN ('reserved', 'released', 'denied', 'degraded')),
  reason_code                 TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, agent_run_id, ledger_seq)
);

CREATE INDEX agentic_budget_run_idx
  ON agentic_budget_ledger (account_id, agent_run_id, created_at DESC);

CREATE TABLE agentic_audit_events (
  account_id          BIGINT NOT NULL,
  event_id            BIGINT NOT NULL,
  agent_run_id        UUID NOT NULL,
  event_type          TEXT NOT NULL,
  object_kind         TEXT,
  object_id           BIGINT,
  request_hash        BYTEA NOT NULL,
  plan_fingerprint    BYTEA NOT NULL,
  content_hash        BYTEA,
  previous_event_hash BYTEA,
  decision            TEXT NOT NULL CHECK (decision IN ('allowed', 'denied', 'degraded')),
  reason_code         TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_audit_run_idx
  ON agentic_audit_events (account_id, agent_run_id, created_at DESC);
```

## Open API GraphQL surface

Every resolver derives `account_id` from authentication context. Clients can
request scopes and budgets, but they cannot provide or override tenant scope.

```graphql
type AgenticPerception {
  objectKind: String!
  objectId: ID!
  sourceVersion: String!
  semanticScore: Float
  metadataTags: [String!]!
  visibility: String!
  reason: String!
  citationLabel: String!
}

type AgenticCostSummary {
  rowStoreReads: Int!
  columnarSegmentsRead: Int!
  vectorCandidatesScanned: Int!
  toolPreparations: Int!
  recursionDepthUsed: Int!
  estimatedCpuMs: Int!
  remainingBudgetPercent: Float!
}

type AgenticSearchResult {
  recordsJson: JSON!
  perception: [AgenticPerception!]!
  cost: AgenticCostSummary!
  freshnessWatermark: String!
  auditEventIds: [ID!]!
}

input AgenticSearchInput {
  query: String!
  boardIds: [ID!]
  objectKinds: [String!]!
  metadataTags: [String!]
  maxRows: Int = 50
  maxVectorCandidates: Int = 200
  maxRecursionDepth: Int = 3
  timeoutMs: Int = 1500
  agentRunId: ID!
  intent: String!
  explainRequired: Boolean = true
}

type AgenticProcedure {
  procedureId: ID!
  version: Int!
  title: String!
  objective: String!
  instructionsMarkdown: String!
  requiredToolScopes: [String!]!
  guardrailPolicyId: ID!
  metadataTags: [String!]!
  contentHash: String!
}

input AgenticProcedureLookupInput {
  query: String!
  boardIds: [ID!]
  metadataTags: [String!]
  maxProcedures: Int = 5
  agentRunId: ID!
}

extend type Query {
  agenticSearch(input: AgenticSearchInput!): AgenticSearchResult!
  agenticProcedureLookup(input: AgenticProcedureLookupInput!): [AgenticProcedure!]!
}
```

## Execution invariants

1. **Tenant scope first**
   - The first logical predicate is always `account_id = auth.account_id`.
   - Vector lookup, procedure lookup, budget reservation, and audit writes all
     use the same account scope.

2. **Authorization after similarity, before exposure**
   - HNSW similarity can rank candidates, but it cannot grant access.
   - Visibility checks over boards, workspaces, users, teams, and app scopes are
     deterministic predicates in the result envelope.

3. **No unbounded agent scans**
   - Online agent requests for boards with 1M+ rows require at least one
     selective indexed predicate beyond `account_id`: `board_id`, item ids,
     object kind, metadata tag, partition timestamp, or a precomputed working
     set id.
   - Tenant-wide semantic discovery is an offline or precomputed workflow, not
     an online GraphQL resolver path.

4. **ACID writes stay in the row store**
   - Agent-generated writes use the same transaction path as human writes.
   - Embeddings, procedure recommendations, and columnar projections are derived
     asynchronously from committed row-store versions.

5. **Recursive loops are budgeted**
   - The budget ledger accumulates cost per `agent_run_id`.
   - The admission plane denies the next retrieval or tool preparation when a
     run exceeds recursion, vector candidate, row read, segment read, or timeout
     limits.

6. **Audit replay is deterministic**
   - Request hashes, plan fingerprints, content hashes, and prior event hashes
     allow support and compliance teams to reconstruct what happened without
     invoking an LLM.

## Performance checks

- **Full-scan risk:** `agenticSearch` with no `boardIds`, broad
  `objectKinds`, and no `metadataTags` can degrade into a tenant-wide vector
  scan. Reject it for online requests on large accounts.
- **Columnar fanout risk:** Aggregations over many boards should require
  partition pruning and segment statistics before reading columnar blocks.
- **HNSW cache risk:** Partition or shard vector indexes by tenant hash and
  object kind so one enterprise account cannot evict hot candidate layers for
  neighboring tenants.
- **Reranking risk:** Cross-encoder or LLM reranking must run after deterministic
  candidate caps and visibility filters; never rerank thousands of raw matches
  synchronously in GraphQL.
- **Freshness risk:** Return `sourceVersion` and `freshnessWatermark` so an
  agent can decide whether to continue with retrieved memory or request fresh
  row-store reads.
- **Budget bypass risk:** Tool preparation and retrieval must debit the same
  `agent_run_id` ledger. Separate ledgers invite recursive loops that look cheap
  in isolation.

## Agent perception model

Agents should perceive mondayDB records as cited evidence and explicit
instructions:

- `objectKind` and `objectId` identify what the agent is seeing.
- `sourceVersion` and `freshnessWatermark` signal whether the record reflects
  the latest committed state.
- `metadataTags` such as `["renewal", "finance", "procedure"]` guide planning
  without requiring a full board scan.
- `semanticScore` is relevance evidence, explicitly non-authoritative.
- `visibility` and `reason` explain redaction or derived access without leaking
  neighboring tenant data.
- `auditEventIds` connect the agent's next tool call to the retrieval and
  policy decision that justified it.

This keeps mondayDB predictable for enterprise operators while making its data,
procedures, and guardrails understandable to LLM-based agents.
