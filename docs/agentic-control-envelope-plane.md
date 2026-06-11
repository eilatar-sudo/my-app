# mondayDB Agentic Control Envelope Plane

## Why this matters

mondayDB already optimizes for high-scale WorkOS workloads: low-latency row
updates, columnar analytics, schemaless board flexibility, and strict tenant
isolation. The agentic era adds a new pressure: agents need memory, semantic
retrieval, and tool-use context, but enterprise customers still need predictable
queries, ACID writes, auditability, and no noisy-neighbor regressions.

The control envelope plane is a deterministic contract that wraps every
agent-initiated read, retrieval, aggregation, and tool action before it reaches
the row store, columnar store, vector index, or execution service. It does not
make decisions with an LLM. Instead, it records the agent's declared intent,
approved data scopes, retrieval budgets, freshness requirements, and procedural
memory references in a replayable structure that the mondayDB planner can
verify.

### Product trade-off: latency vs. consistency

- **Low latency:** agents should retrieve the right board context in the blink
  of an eye, especially for interactive automations and Copilot-style flows.
- **Consistency:** agents must not act on stale or cross-tenant data when the
  task requires transactional certainty.
- **Resolution:** the envelope makes freshness explicit per step. Fast semantic
  recall can use asynchronous vector indexes when `freshness_mode = EVENTUAL`,
  while writes and sensitive reads require row-store watermarks and ACID
  verification with `freshness_mode = STRONG`.

This keeps probabilistic agent planning outside the database engine while
making database execution deterministic, bounded, and auditable.

## Design goals

1. **Agentic capabilities:** expose procedural memory, semantic retrieval, and
   tool-readiness metadata as first-class, tenant-scoped records.
2. **Enterprise stability:** require `account_id` on every envelope, step,
   vector lookup, and audit event.
3. **Scale and performance:** reject unbounded recursion, unscoped vector
   searches, and columnar scans that would degrade boards with 1M+ rows.
4. **Open API first:** every lifecycle action must be available through the
   monday.com GraphQL API.
5. **Predictability:** every accepted plan receives a deterministic
   `execution_hash` and a stable audit chain.

## Agent perception model

Agents should perceive mondayDB data as bounded, labeled context rather than as
an infinite query surface.

```ts
export interface AgentPerceptionMetadata {
  accountId: string;
  boardId?: string;
  workspaceId?: string;
  objectKind:
    | "board"
    | "item"
    | "column"
    | "view"
    | "automation"
    | "procedure"
    | "tool";
  semanticTags: string[];
  proceduralTags: string[];
  sensitivity: "public" | "internal" | "restricted" | "regulated";
  freshnessMode: "EVENTUAL" | "BOUNDED_STALENESS" | "STRONG";
  maxStalenessMs?: number;
  sourceWatermark: string;
}
```

The tags are metadata for retrieval and planning. They never override ACLs,
board permissions, or tenant scoping.

## TypeScript contracts

```ts
export type AgenticStepKind =
  | "ROW_LOOKUP"
  | "COLUMNAR_AGGREGATION"
  | "VECTOR_RETRIEVAL"
  | "PROCEDURE_MEMORY_READ"
  | "TOOL_PREPARE"
  | "TOOL_EXECUTE";

export interface AgenticControlEnvelope {
  accountId: string;
  envelopeId: string;
  actorId: string;
  agentId: string;
  requestId: string;
  declaredIntent: string;
  freshnessMode: "EVENTUAL" | "BOUNDED_STALENESS" | "STRONG";
  maxEstimatedRows: number;
  maxVectorTopK: number;
  maxRecursionDepth: number;
  maxToolCalls: number;
  budgetCents: number;
  sourceWatermark: string;
  proceduralMemoryRefs: ProceduralMemoryRef[];
  semanticRetrievalRefs: SemanticRetrievalRef[];
  steps: AgenticEnvelopeStep[];
  status: "DRAFT" | "VERIFIED" | "REJECTED" | "EXECUTED" | "EXPIRED";
  executionHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ProceduralMemoryRef {
  accountId: string;
  procedureId: string;
  version: number;
  purpose: "INSTRUCTION" | "POLICY" | "ESCALATION" | "TOOL_USAGE";
  required: boolean;
}

export interface SemanticRetrievalRef {
  accountId: string;
  embeddingNamespace: string;
  vectorIndexName: string;
  queryEmbeddingHash: string;
  topK: number;
  hnswEfSearch: number;
  filters: {
    boardIds?: string[];
    workspaceIds?: string[];
    objectKinds?: AgentPerceptionMetadata["objectKind"][];
    sensitivityAtMost: AgentPerceptionMetadata["sensitivity"];
  };
}

export interface AgenticEnvelopeStep {
  accountId: string;
  envelopeId: string;
  stepId: string;
  parentStepId?: string;
  kind: AgenticStepKind;
  deterministicPlan: Record<string, unknown>;
  estimatedRows: number;
  estimatedVectorCandidates: number;
  estimatedCostCents: number;
  timeoutMs: number;
  requiresHumanApproval: boolean;
}

export interface AgenticEnvelopeAuditEvent {
  accountId: string;
  auditEventId: string;
  envelopeId: string;
  eventKind:
    | "CREATED"
    | "VERIFIED"
    | "REJECTED"
    | "EXECUTED"
    | "TOOL_DISPATCHED"
    | "EXPIRED";
  deterministicPayloadHash: string;
  previousAuditHash?: string;
  auditHash: string;
  actorId: string;
  createdAt: string;
}
```

## SQL schema

All primary and secondary access paths are prefixed by `account_id` to preserve
multi-tenant isolation and avoid accidental global scans.

```sql
CREATE TABLE agentic_control_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  declared_intent TEXT NOT NULL,
  freshness_mode TEXT NOT NULL CHECK (
    freshness_mode IN ('EVENTUAL', 'BOUNDED_STALENESS', 'STRONG')
  ),
  max_estimated_rows BIGINT NOT NULL CHECK (max_estimated_rows >= 0),
  max_vector_top_k INT NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_recursion_depth INT NOT NULL CHECK (max_recursion_depth BETWEEN 0 AND 8),
  max_tool_calls INT NOT NULL CHECK (max_tool_calls BETWEEN 0 AND 25),
  budget_cents INT NOT NULL CHECK (budget_cents >= 0),
  source_watermark TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'VERIFIED', 'REJECTED', 'EXECUTED', 'EXPIRED')
  ),
  execution_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, envelope_id),
  UNIQUE (account_id, request_id)
);

CREATE TABLE agentic_envelope_steps (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  step_id UUID NOT NULL,
  parent_step_id UUID,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'ROW_LOOKUP',
      'COLUMNAR_AGGREGATION',
      'VECTOR_RETRIEVAL',
      'PROCEDURE_MEMORY_READ',
      'TOOL_PREPARE',
      'TOOL_EXECUTE'
    )
  ),
  deterministic_plan JSONB NOT NULL,
  estimated_rows BIGINT NOT NULL CHECK (estimated_rows >= 0),
  estimated_vector_candidates BIGINT NOT NULL CHECK (
    estimated_vector_candidates >= 0
  ),
  estimated_cost_cents INT NOT NULL CHECK (estimated_cost_cents >= 0),
  timeout_ms INT NOT NULL CHECK (timeout_ms BETWEEN 1 AND 30000),
  requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, envelope_id, step_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_control_envelopes (account_id, envelope_id)
);

CREATE INDEX agentic_envelope_steps_kind_idx
  ON agentic_envelope_steps (account_id, kind, envelope_id);

CREATE TABLE agentic_procedural_memory_refs (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  procedure_id UUID NOT NULL,
  version INT NOT NULL CHECK (version > 0),
  purpose TEXT NOT NULL CHECK (
    purpose IN ('INSTRUCTION', 'POLICY', 'ESCALATION', 'TOOL_USAGE')
  ),
  required BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (account_id, envelope_id, procedure_id, version),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_control_envelopes (account_id, envelope_id)
);

CREATE TABLE agentic_semantic_retrieval_refs (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  retrieval_ref_id UUID NOT NULL,
  embedding_namespace TEXT NOT NULL,
  vector_index_name TEXT NOT NULL,
  query_embedding_hash BYTEA NOT NULL,
  top_k INT NOT NULL CHECK (top_k BETWEEN 1 AND 200),
  hnsw_ef_search INT NOT NULL CHECK (hnsw_ef_search BETWEEN 8 AND 512),
  filters JSONB NOT NULL,
  PRIMARY KEY (account_id, envelope_id, retrieval_ref_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_control_envelopes (account_id, envelope_id)
);

CREATE INDEX agentic_semantic_retrieval_refs_index_idx
  ON agentic_semantic_retrieval_refs (
    account_id,
    embedding_namespace,
    vector_index_name
  );

CREATE TABLE agentic_control_envelope_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  event_kind TEXT NOT NULL CHECK (
    event_kind IN (
      'CREATED',
      'VERIFIED',
      'REJECTED',
      'EXECUTED',
      'TOOL_DISPATCHED',
      'EXPIRED'
    )
  ),
  deterministic_payload_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  audit_hash BYTEA NOT NULL,
  actor_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_control_envelopes (account_id, envelope_id)
);

CREATE INDEX agentic_control_envelope_audit_chain_idx
  ON agentic_control_envelope_audit_events (
    account_id,
    envelope_id,
    created_at,
    audit_event_id
  );
```

## pgvector and HNSW compatibility

The envelope does not store raw embeddings directly. It stores stable hashes and
index references so the vector service can enforce tenant partitioning and
deterministic replay.

Recommended vector index layout:

```sql
CREATE TABLE agentic_context_embeddings (
  account_id BIGINT NOT NULL,
  embedding_namespace TEXT NOT NULL,
  context_object_id UUID NOT NULL,
  object_kind TEXT NOT NULL,
  board_id BIGINT,
  workspace_id BIGINT,
  sensitivity TEXT NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  source_watermark TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  embedding_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, embedding_namespace, context_object_id)
);

CREATE INDEX agentic_context_embeddings_hnsw_idx
  ON agentic_context_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX agentic_context_embeddings_scope_idx
  ON agentic_context_embeddings (
    account_id,
    embedding_namespace,
    board_id,
    object_kind,
    sensitivity
  );
```

Execution requirement:

```sql
-- Required predicate shape for semantic retrieval.
WHERE account_id = :account_id
  AND embedding_namespace = :embedding_namespace
  AND (:board_ids_is_empty OR board_id = ANY(:board_ids))
  AND sensitivity <= :max_sensitivity
ORDER BY embedding <=> :query_embedding
LIMIT :top_k;
```

For very large tenants, use account-partitioned or shard-local HNSW indexes so
`account_id` pruning happens before vector candidate expansion. A shared global
HNSW graph without tenant prefiltering is not acceptable because it risks
cross-tenant candidate leakage and noisy-neighbor latency spikes.

## GraphQL Open API shape

```graphql
enum AgenticFreshnessMode {
  EVENTUAL
  BOUNDED_STALENESS
  STRONG
}

enum AgenticEnvelopeStatus {
  DRAFT
  VERIFIED
  REJECTED
  EXECUTED
  EXPIRED
}

input AgenticSemanticRetrievalInput {
  embeddingNamespace: String!
  vectorIndexName: String!
  queryEmbeddingHash: String!
  topK: Int!
  hnswEfSearch: Int!
  boardIds: [ID!]
  workspaceIds: [ID!]
  objectKinds: [String!]
  sensitivityAtMost: String!
}

input AgenticProcedureMemoryRefInput {
  procedureId: ID!
  version: Int!
  purpose: String!
  required: Boolean!
}

input CreateAgenticControlEnvelopeInput {
  accountId: ID!
  agentId: String!
  requestId: String!
  declaredIntent: String!
  freshnessMode: AgenticFreshnessMode!
  maxEstimatedRows: Int!
  maxVectorTopK: Int!
  maxRecursionDepth: Int!
  maxToolCalls: Int!
  budgetCents: Int!
  sourceWatermark: String!
  proceduralMemoryRefs: [AgenticProcedureMemoryRefInput!]!
  semanticRetrievalRefs: [AgenticSemanticRetrievalInput!]!
}

type AgenticControlEnvelope {
  accountId: ID!
  envelopeId: ID!
  agentId: String!
  requestId: String!
  declaredIntent: String!
  status: AgenticEnvelopeStatus!
  executionHash: String!
  expiresAt: String!
}

type AgenticVerificationResult {
  accepted: Boolean!
  envelope: AgenticControlEnvelope
  rejectionReasons: [String!]!
  estimatedRows: Int!
  estimatedCostCents: Int!
}

extend type Mutation {
  createAgenticControlEnvelope(
    input: CreateAgenticControlEnvelopeInput!
  ): AgenticControlEnvelope!

  verifyAgenticControlEnvelope(
    accountId: ID!
    envelopeId: ID!
  ): AgenticVerificationResult!

  executeVerifiedAgenticEnvelope(
    accountId: ID!
    envelopeId: ID!
    idempotencyKey: String!
  ): AgenticControlEnvelope!
}

extend type Query {
  agenticControlEnvelope(
    accountId: ID!
    envelopeId: ID!
  ): AgenticControlEnvelope
}
```

Open API calls must derive `accountId` from the authenticated monday.com
context and verify that a supplied `accountId` matches that context. The explicit
field remains useful for replay, audit lookup, and tenant-prefixed indexing.

## Planner verification rules

Before an envelope can move from `DRAFT` to `VERIFIED`, the planner must reject
plans that violate any of these rules:

1. Every step has the same `account_id` as the envelope.
2. Every row, columnar, vector, and tool plan includes an `account_id`
   predicate or tenant-bound execution token.
3. `max_vector_top_k` is no larger than the smallest retrieval ref `top_k`
   limit and never exceeds 200.
4. Recursive expansion depth is bounded by `max_recursion_depth`.
5. Total estimated rows across all row and columnar steps is less than or equal
   to `max_estimated_rows`.
6. Tool execution steps require a preceding `TOOL_PREPARE` step with the same
   tenant and idempotency key.
7. `STRONG` freshness plans must read from row-store watermarks that are at
   least as fresh as `source_watermark`.
8. `EVENTUAL` freshness plans may use vector or columnar projections, but the
   response must expose the watermark used for retrieval.
9. Any step marked `requires_human_approval` cannot execute until an explicit
   approval audit event is attached.

## Guardrails for expensive recursive queries

Agents are prone to loops such as "retrieve similar items, expand each board,
retrieve related automations, repeat." The control envelope makes those loops
bounded and visible:

- **Depth budget:** `max_recursion_depth` caps parent-child step expansion.
- **Cost ledger:** every step reserves `estimated_cost_cents` before execution.
- **Candidate cap:** vector retrieval limits `top_k` and `hnsw_ef_search`.
- **Timeout partitioning:** each step receives a bounded `timeout_ms`; the
  envelope has a shorter interactive SLA than background compaction jobs.
- **Loop fingerprinting:** the planner hashes `(agent_id, declared_intent,
  step kind, filters, retrieval refs)` to reject repeated plans within a short
  tenant-local window.
- **Human escalation:** plans that combine broad vector recall, columnar
  aggregation, and tool execution require approval for regulated data.

## Performance checks for 1M+ row boards

The following proposal patterns must be rejected or rewritten because they can
cause full table scans or noisy-neighbor latency:

| Pattern | Risk | Required mitigation |
| --- | --- | --- |
| Missing `account_id` in any predicate | Cross-tenant scan and data leakage | Tenant prefix on every key and query plan |
| `board_id` filter only inside JSONB | Full scan on large schemaless rows | Promote `board_id` to indexed column or generated column |
| Unbounded semantic `topK` | HNSW candidate explosion | Cap `topK <= 200` and `hnsw_ef_search <= 512` |
| Columnar aggregation without partition pruning | 1M+ row board scan | Require `account_id`, board/workspace filters, and watermark range |
| Recursive expansion without depth | Agent loop can starve neighbors | Enforce `max_recursion_depth` and cost reservations |
| Tool execution after broad retrieval | Accidental mass action | Require prepared tool scope and approval threshold |

For hybrid row/columnar storage, the planner should route:

- point reads and transactional writes to the row layer;
- analytics and rollups to columnar projections with tenant and board pruning;
- semantic recall to tenant-partitioned vector indexes;
- agent actions to deterministic tool leases after verification.

## Auditability and replay

Every envelope transition appends an audit event with:

1. a canonical JSON payload;
2. `deterministic_payload_hash = sha256(canonical_payload)`;
3. `audit_hash = sha256(previous_audit_hash || deterministic_payload_hash)`;
4. the authenticated `actor_id`;
5. the tenant `account_id`.

This gives support, security, and enterprise admins a deterministic trace of
what an agent was allowed to see, why a plan was accepted or rejected, and which
tool actions were dispatched.

## Rollout strategy

1. **Observe:** create envelopes in shadow mode for agentic features, record
   estimates, but do not block existing execution.
2. **Verify:** require envelopes for semantic retrieval and procedural memory
   reads; reject plans missing tenant scope or budgets.
3. **Enforce:** require verified envelopes before tool execution or write
   intents.
4. **Optimize:** tune HNSW partitioning, columnar pruning, and budget defaults
   based on audit ledger data.

## Open questions

- Should `max_vector_top_k` default differ between interactive Copilot flows and
  background automation repair jobs?
- Which sensitivity levels require human approval before a verified envelope can
  execute a tool?
- Should enterprise admins be able to define account-level caps lower than the
  platform defaults for regulated workspaces?
