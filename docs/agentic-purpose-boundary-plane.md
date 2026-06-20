# mondayDB Agentic Purpose Boundary Plane

## Why this matters

Autonomous agents need broader context than a human clicking through a board, but mondayDB cannot let
"helpful" agents turn open-ended goals into unbounded data access. The purpose boundary plane makes
every agentic read, vector lookup, aggregation, and tool action carry a deterministic business purpose
before the planner admits work.

The product trade-off is **latency vs. explainable containment**. A small preflight check adds one
planner hop, but it prevents cross-purpose data expansion, runaway retrieval loops, and expensive
neighbor-impacting scans. The database remains deterministic: mondayDB stores and evaluates declared
purpose, compiled bounds, and audit hashes. LLMs may propose intent, but the engine only executes the
compiled purpose envelope.

## Goals

- Scope every agentic workload by `account_id`, actor, declared purpose, and data domain.
- Bind semantic retrieval, procedural memory, row reads, columnar analytics, and tool execution to the
  same purpose envelope.
- Give the monday.com Open API a first-class GraphQL contract for declaring, inspecting, and replaying
  purpose-bound workloads.
- Avoid full table scans on boards with 1M+ rows by requiring indexed board, item, time, or semantic
  entry-point constraints before admission.
- Produce deterministic audit traces suitable for enterprise compliance and support replay.

## Non-goals

- The plane does not decide whether an LLM's natural-language goal is "good." Product policy and app
  permissions own that judgment.
- The plane does not replace row-level ACLs, access policies, or budget ledgers. It compiles purpose
  into constraints that those systems can evaluate consistently.
- The plane does not perform embedding generation inline with user transactions. Semantic enrichment
  stays asynchronous to preserve write latency and ACID behavior.

## Core model

```ts
export type AgenticPurposeKind =
  | "customer_support_resolution"
  | "sales_pipeline_insight"
  | "project_risk_detection"
  | "workflow_automation"
  | "audit_replay"
  | "custom";

export type AgenticAccessPath = "row" | "columnar" | "vector" | "tool" | "hybrid";

export interface AgenticPurposeDeclaration {
  account_id: string;
  purpose_id: string;
  actor_id: string;
  actor_kind: "user" | "app" | "agent";
  kind: AgenticPurposeKind;
  natural_language_goal: string;
  allowed_access_paths: AgenticAccessPath[];
  board_scope: {
    board_ids: string[];
    item_id_ranges?: Array<{ board_id: string; min_item_id: string; max_item_id: string }>;
    column_ids?: string[];
  };
  temporal_scope: {
    created_after?: string;
    updated_after?: string;
    updated_before?: string;
    max_window_days: number;
  };
  semantic_scope?: {
    namespace: "board_items" | "updates" | "docs" | "procedures";
    metadata_filters: Record<string, string | number | boolean>;
    top_k: number;
    min_score: number;
  };
  procedural_memory_refs: string[];
  max_estimated_rows: number;
  max_estimated_vector_candidates: number;
  max_recursive_expansions: number;
  expires_at: string;
  idempotency_key: string;
}

export interface CompiledPurposeEnvelope {
  account_id: string;
  envelope_id: string;
  purpose_id: string;
  planner_version: string;
  deterministic_constraints: {
    required_predicates: Array<"account_id" | "board_id" | "item_id_range" | "updated_at" | "vector_namespace">;
    denied_access_paths: AgenticAccessPath[];
    max_rows_per_step: number;
    max_vector_top_k: number;
    max_tool_calls: number;
    max_depth: number;
  };
  retrieval_metadata: {
    embedding_model?: string;
    hnsw_partition_key?: "account_id" | "account_id_board_id";
    allowed_context_tags: string[];
  };
  audit: {
    declaration_hash: string;
    constraint_hash: string;
    previous_audit_hash?: string;
  };
  created_at: string;
  expires_at: string;
}
```

## Storage schema

The schema is written for a decoupled row/columnar mondayDB deployment. Row storage owns ACID state and
admission decisions. Columnar replicas can project immutable purpose dimensions for analytics.

```sql
CREATE TABLE agentic_purpose_declarations (
  account_id BIGINT NOT NULL,
  purpose_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'app', 'agent')),
  purpose_kind TEXT NOT NULL,
  natural_language_goal TEXT NOT NULL,
  allowed_access_paths TEXT[] NOT NULL,
  board_ids BIGINT[] NOT NULL,
  column_ids BIGINT[] NULL,
  scope_json JSONB NOT NULL,
  procedural_memory_refs UUID[] NOT NULL DEFAULT '{}',
  max_estimated_rows BIGINT NOT NULL,
  max_estimated_vector_candidates BIGINT NOT NULL,
  max_recursive_expansions INT NOT NULL,
  declaration_hash BYTEA NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, purpose_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX apd_account_actor_created_idx
  ON agentic_purpose_declarations (account_id, actor_id, created_at DESC);

CREATE INDEX apd_account_expires_idx
  ON agentic_purpose_declarations (account_id, expires_at);

CREATE TABLE agentic_purpose_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  purpose_id UUID NOT NULL,
  planner_version TEXT NOT NULL,
  constraint_json JSONB NOT NULL,
  retrieval_metadata_json JSONB NOT NULL,
  declaration_hash BYTEA NOT NULL,
  constraint_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id),
  FOREIGN KEY (account_id, purpose_id)
    REFERENCES agentic_purpose_declarations (account_id, purpose_id)
);

CREATE INDEX ape_account_purpose_created_idx
  ON agentic_purpose_envelopes (account_id, purpose_id, created_at DESC);

CREATE TABLE agentic_purpose_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  step_id TEXT NOT NULL,
  access_path TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('admitted', 'degraded', 'rejected')),
  estimated_rows BIGINT NOT NULL,
  estimated_vector_candidates BIGINT NOT NULL,
  rejection_code TEXT NULL,
  event_hash BYTEA NOT NULL,
  previous_event_hash BYTEA NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX apae_account_envelope_created_idx
  ON agentic_purpose_audit_events (account_id, envelope_id, created_at DESC);
```

### Vector compatibility

Purpose envelopes can be embedded for semantic discovery, but vectors are advisory metadata, not the
source of authorization.

```sql
CREATE TABLE agentic_purpose_embeddings (
  account_id BIGINT NOT NULL,
  purpose_id UUID NOT NULL,
  board_id BIGINT NULL,
  embedding_model TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, purpose_id, embedding_model)
)
PARTITION BY HASH (account_id);

-- Implementation note: create one HNSW index per account-hash partition so approximate search never
-- compares vectors across tenants. If board affinity is high, subpartition by board_id for lower fanout.
CREATE INDEX ape_hnsw_embedding_idx
  ON agentic_purpose_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX ape_account_board_model_idx
  ON agentic_purpose_embeddings (account_id, board_id, embedding_model);
```

## Open API GraphQL shape

Every mutation and query requires `accountId`. Resolvers reject requests when the authenticated account
context does not match the argument. Large planner estimates use `BigInt` because board-scale row and
candidate counts can exceed GraphQL's signed 32-bit `Int` range.

```graphql
scalar BigInt

enum AgenticPurposeKind {
  customer_support_resolution
  sales_pipeline_insight
  project_risk_detection
  workflow_automation
  audit_replay
  custom
}

enum AgenticAccessPath {
  row
  columnar
  vector
  tool
  hybrid
}

input AgenticPurposeScopeInput {
  boardIds: [ID!]!
  columnIds: [ID!]
  updatedAfter: DateTime
  updatedBefore: DateTime
  maxWindowDays: Int!
  semanticNamespace: String
  semanticMetadataFilters: JSON
  semanticTopK: Int
  semanticMinScore: Float
}

input DeclareAgenticPurposeInput {
  accountId: ID!
  actorId: ID!
  actorKind: String!
  kind: AgenticPurposeKind!
  naturalLanguageGoal: String!
  allowedAccessPaths: [AgenticAccessPath!]!
  scope: AgenticPurposeScopeInput!
  proceduralMemoryRefs: [ID!]!
  maxEstimatedRows: BigInt!
  maxEstimatedVectorCandidates: BigInt!
  maxRecursiveExpansions: Int!
  expiresAt: DateTime!
  idempotencyKey: String!
}

type CompiledPurposeEnvelope {
  accountId: ID!
  envelopeId: ID!
  purposeId: ID!
  plannerVersion: String!
  constraintHash: String!
  requiredPredicates: [String!]!
  deniedAccessPaths: [AgenticAccessPath!]!
  maxRowsPerStep: BigInt!
  maxVectorTopK: Int!
  maxToolCalls: Int!
  maxDepth: Int!
  allowedContextTags: [String!]!
  expiresAt: DateTime!
}

type AgenticPurposeAuditEvent {
  accountId: ID!
  eventId: ID!
  envelopeId: ID!
  stepId: String!
  accessPath: AgenticAccessPath!
  decision: String!
  estimatedRows: BigInt!
  estimatedVectorCandidates: BigInt!
  rejectionCode: String
  eventHash: String!
  createdAt: DateTime!
}

type Mutation {
  declareAgenticPurpose(input: DeclareAgenticPurposeInput!): CompiledPurposeEnvelope!
}

type Query {
  agenticPurposeEnvelope(accountId: ID!, envelopeId: ID!): CompiledPurposeEnvelope
  agenticPurposeAuditEvents(accountId: ID!, envelopeId: ID!, first: Int!, after: String): [AgenticPurposeAuditEvent!]!
}
```

## Planner admission flow

1. **Normalize declaration.** Sort board IDs, column IDs, metadata filters, and procedural memory refs so
   `declaration_hash` is stable across retries.
2. **Intersect with permissions.** Apply product ACLs, agent access policies, and data residency rules
   before query planning.
3. **Compile deterministic constraints.** Convert purpose scope into required predicates for row,
   columnar, vector, and tool paths.
4. **Estimate cost.** Ask row, columnar, and vector planners for bounded estimates under the compiled
   predicates.
5. **Admit, degrade, or reject.** Degrade by lowering `top_k`, shortening time windows, or removing
   optional access paths. Reject when `account_id` or another required predicate is missing.
6. **Write audit event.** Persist the decision and hash chain before the workload executes.

## Agentic guardrails

- **Mandatory tenant predicate:** every compiled step includes `account_id = ?`; missing tenant scope is
  a hard rejection, not a degraded mode.
- **Purpose-to-path binding:** a vector result cannot trigger a row fetch unless its metadata carries the
  same `account_id`, allowed board, and context tag from the envelope.
- **Recursive query cap:** `max_recursive_expansions` limits follow-up retrieval, board expansion, and
  tool-call fanout. The audit chain records each depth increment.
- **Budget handoff:** admitted envelopes reserve cost in the query budget ledger before execution. If
  reservation fails, the purpose envelope is rejected without touching user data.
- **Tool-use readiness:** tool actions receive an envelope reference and may only operate on cited row,
  columnar, or semantic references already admitted by the planner.
- **No semantic authorization:** HNSW nearest-neighbor matches can suggest context, but authorization is
  based only on deterministic predicates and policy intersections.

## Performance checks for 1M+ row boards

Any proposal using this plane must be rejected or degraded if it would cause one of these scans:

- `board_ids` is empty or contains a wildcard for a board with more than 1M active rows.
- `updated_after` is absent and the planner cannot use an item ID range, partition watermark, or
  precomputed columnar segment.
- `semanticTopK` exceeds the envelope cap or vector metadata lacks `(account_id, board_id, namespace)`.
- JSON metadata filters are applied without a selective account-prefixed index or precomputed segment.
- A recursive expansion attempts to add boards not present in the original declaration.

Recommended planner limits:

| Workload path | Default cap | Required indexed predicate |
| --- | ---: | --- |
| Row lookup | 10,000 estimated rows per step | `(account_id, board_id, item_id)` or `(account_id, board_id, updated_at)` |
| Columnar aggregation | 50 million estimated cells | `(account_id, board_id, column_id, segment_watermark)` |
| Vector retrieval | `top_k <= 50`, candidates <= 5,000 | HNSW partition plus `(account_id, board_id, namespace)` metadata |
| Tool execution | 25 cited records per call | Envelope-cited row or semantic references |
| Recursive expansion | depth <= 3 | Parent audit event and unchanged `account_id` |

## Auditability and replay

Audit records are hash chained per `(account_id, envelope_id)`.

```ts
export interface PurposeAuditReplayPacket {
  account_id: string;
  envelope_id: string;
  declaration_hash: string;
  constraint_hash: string;
  ordered_events: Array<{
    event_id: string;
    step_id: string;
    access_path: AgenticAccessPath;
    decision: "admitted" | "degraded" | "rejected";
    estimated_rows: number;
    estimated_vector_candidates: number;
    rejection_code?: string;
    event_hash: string;
    previous_event_hash?: string;
  }>;
}
```

Replay validates that the same declaration, planner version, policy inputs, and catalog statistics produce
the same envelope hash. If statistics have changed, support can still prove what the engine knew at
admission time because the original estimates are immutable audit facts.

## How an agent perceives this data

An LLM should see the envelope as a compact, non-authoritative perception card:

```json
{
  "purpose": "project_risk_detection",
  "allowed_context_tags": ["risk", "status", "blocked", "timeline"],
  "allowed_boards": ["board:123", "board:456"],
  "retrieval_instruction": "Search only admitted board item summaries; cite every item before proposing an action.",
  "limits": {
    "semantic_top_k": 25,
    "max_depth": 2,
    "max_tool_calls": 5
  }
}
```

This card helps the agent plan, but mondayDB enforces the compiled envelope. If the agent asks for data
outside the card, the planner rejects the step and records the rejection.

## Rollout path

1. **Shadow mode:** accept declarations, compile envelopes, and emit audit decisions without blocking
   existing agent flows.
2. **Degraded enforcement:** enforce `account_id`, board scope, vector `top_k`, and recursion caps while
   only logging narrower time-window suggestions.
3. **Strict enforcement:** require a valid envelope for all autonomous row, columnar, vector, and tool
   workloads.
4. **Open API exposure:** make GraphQL declaration and audit queries available to apps so enterprise
   admins can inspect why an agent accessed data.

## Open questions

- Should product-level purpose kinds be centrally managed, or can apps register tenant-local custom
  purpose kinds with admin approval?
- Which catalog statistics must be snapshotted in the audit packet to make replay sufficiently
  deterministic without bloating the row store?
- Should purpose envelopes be reusable across sessions, or should every autonomous task declare a fresh
  purpose for stronger support traceability?
