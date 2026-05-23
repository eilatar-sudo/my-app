# Agentic Procedure Memory Plane

## Why before how

mondayDB can let agents remember repeatable procedures without letting an LLM
invent database behavior at execution time. The product trade-off is latency
versus predictability: a direct LLM-to-query loop may feel fast for a single
request, but it risks non-deterministic retries, recursive scans, and noisy
neighbor impact. The Procedure Memory Plane moves reusable instructions into
tenant-scoped, versioned records that can be retrieved semantically but executed
only after deterministic verification.

The goal is to make agents better operators of mondayDB, not to make mondayDB
probabilistic. Agents may propose which procedure to use. mondayDB decides
whether that procedure is visible, current, affordable, and safe for the
requesting account.

## Design goals

- Store procedural memory as explicit, reviewable instructions for agents.
- Support semantic retrieval through pgvector/HNSW without cross-tenant leakage.
- Require deterministic guardrails before a procedure can issue row, columnar,
  vector, or tool calls.
- Preserve ACID writes and auditability by recording immutable procedure
  versions and execution decisions.
- Keep Open API access first-class through GraphQL types, queries, and
  mutations.

## Non-goals

- No autonomous execution from vector similarity alone.
- No implicit escalation from a read procedure to a write or tool procedure.
- No unbounded board scans, recursive procedure calls, or account-wide semantic
  searches.
- No hidden prompt mutation in the database layer.

## Core model

Procedure memory is split into two deterministic surfaces:

1. `agent_procedures`: current metadata, tenant scope, risk class, and budget
   bounds.
2. `agent_procedure_versions`: immutable instruction payloads, semantic tags,
   verification contracts, and audit hashes.

Agents retrieve candidates by account, namespace, task metadata, and optional
embedding similarity. The selected version then enters plan verification before
any database or tool operation runs.

## TypeScript contracts

```ts
export type ProcedureRiskClass = "read_only" | "bounded_write" | "tool_use" | "restricted";

export type ProcedureStatus = "draft" | "active" | "deprecated" | "blocked";

export interface AgentProcedure {
  procedureId: string;
  accountId: string;
  namespace: string;
  slug: string;
  status: ProcedureStatus;
  riskClass: ProcedureRiskClass;
  ownerUserId: string;
  currentVersionId?: string;
  allowedBoardIds: string[];
  allowedCapabilityIds: string[];
  maxRecursiveDepth: number;
  maxRowsTouched: number;
  maxVectorTopK: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureStep {
  stepId: string;
  title: string;
  instruction: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  allowedOperations: Array<"row_read" | "row_write" | "columnar_read" | "vector_read" | "tool_call">;
  preconditions: string[];
  rollbackHint?: string;
}

export interface AgentProcedureVersion {
  versionId: string;
  procedureId: string;
  accountId: string;
  versionNumber: number;
  summary: string;
  steps: ProcedureStep[];
  semanticTags: string[];
  embeddingRef?: {
    model: string;
    dimensions: number;
    embeddingId: string;
  };
  verificationContract: {
    requiredAccountPredicate: true;
    requiredBoardPredicate: boolean;
    maxEstimatedRows: number;
    maxEstimatedCostUnits: number;
    requiresHumanApproval: boolean;
  };
  promptChecksum: string;
  auditHash: string;
  previousAuditHash?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface ProcedureExecutionEnvelope {
  accountId: string;
  procedureId: string;
  versionId: string;
  actorUserId: string;
  agentId: string;
  requestId: string;
  boardIds: string[];
  inputChecksum: string;
  allowedOperations: ProcedureStep["allowedOperations"];
  budgetReservationId: string;
  expiresAt: string;
}
```

## SQL schema

The row store owns the source of truth. Vector indexes are projections from
immutable procedure versions and must keep `account_id` as the first partition
and filter key. In production, `agent_procedure_embeddings` is deployed as
hash partitions by `account_id`; each partition owns its local HNSW index so a
single account cannot force global vector traversal.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE agent_procedures (
  account_id BIGINT NOT NULL,
  procedure_id UUID NOT NULL,
  namespace TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'deprecated', 'blocked')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('read_only', 'bounded_write', 'tool_use', 'restricted')),
  owner_user_id BIGINT NOT NULL,
  current_version_id UUID,
  allowed_board_ids BIGINT[] NOT NULL DEFAULT '{}',
  allowed_capability_ids UUID[] NOT NULL DEFAULT '{}',
  max_recursive_depth INTEGER NOT NULL DEFAULT 0,
  max_rows_touched BIGINT NOT NULL DEFAULT 1000,
  max_vector_top_k INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, procedure_id),
  UNIQUE (account_id, namespace, slug)
);

CREATE TABLE agent_procedure_versions (
  account_id BIGINT NOT NULL,
  procedure_id UUID NOT NULL,
  version_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  steps JSONB NOT NULL,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  verification_contract JSONB NOT NULL,
  prompt_checksum TEXT NOT NULL,
  audit_hash TEXT NOT NULL,
  previous_audit_hash TEXT,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, version_id),
  UNIQUE (account_id, procedure_id, version_number),
  FOREIGN KEY (account_id, procedure_id)
    REFERENCES agent_procedures (account_id, procedure_id)
);

CREATE TABLE agent_procedure_embeddings (
  account_id BIGINT NOT NULL,
  namespace TEXT NOT NULL,
  procedure_id UUID NOT NULL,
  version_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, version_id),
  FOREIGN KEY (account_id, version_id)
    REFERENCES agent_procedure_versions (account_id, version_id)
)
PARTITION BY HASH (account_id);

CREATE INDEX agent_procedures_account_status_idx
  ON agent_procedures (account_id, status, risk_class, namespace);

CREATE INDEX agent_procedure_versions_account_proc_idx
  ON agent_procedure_versions (account_id, procedure_id, version_number DESC);

CREATE INDEX agent_procedure_embeddings_filter_idx
  ON agent_procedure_embeddings (account_id, namespace, embedding_model);

CREATE INDEX agent_procedure_embeddings_hnsw_idx
  ON agent_procedure_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Query shape for semantic retrieval

```sql
SELECT
  e.account_id,
  e.procedure_id,
  e.version_id,
  1 - (e.embedding <=> :query_embedding) AS similarity
FROM agent_procedure_embeddings e
JOIN agent_procedures p
  ON p.account_id = e.account_id
 AND p.procedure_id = e.procedure_id
WHERE e.account_id = :account_id
  AND e.namespace = :namespace
  AND p.status = 'active'
  AND p.risk_class = ANY(:allowed_risk_classes)
  AND e.semantic_tags && :semantic_tags
ORDER BY e.embedding <=> :query_embedding
LIMIT :top_k;
```

Performance check: this query is not allowed unless `account_id`, `namespace`,
and a bounded `top_k <= 50` are present. On boards with 1M+ rows, the retrieved
procedure can only touch board data after plan verification proves indexed
`account_id` and `board_id` predicates for each row or columnar step.

## Open API GraphQL surface

```graphql
enum AgentProcedureRiskClass {
  READ_ONLY
  BOUNDED_WRITE
  TOOL_USE
  RESTRICTED
}

type AgentProcedure {
  procedureId: ID!
  namespace: String!
  slug: String!
  status: String!
  riskClass: AgentProcedureRiskClass!
  currentVersionId: ID
  semanticTags: [String!]!
  maxRecursiveDepth: Int!
  maxRowsTouched: Int!
  maxVectorTopK: Int!
}

input AgentProcedureStepInput {
  title: String!
  instruction: String!
  requiredInputs: [String!]!
  expectedOutputs: [String!]!
  allowedOperations: [String!]!
  preconditions: [String!]!
  rollbackHint: String
}

input RegisterAgentProcedureInput {
  namespace: String!
  slug: String!
  riskClass: AgentProcedureRiskClass!
  allowedBoardIds: [ID!]!
  allowedCapabilityIds: [ID!]!
  semanticTags: [String!]!
  steps: [AgentProcedureStepInput!]!
  maxRowsTouched: Int!
  maxVectorTopK: Int!
}

type AgentProcedureCandidate {
  procedure: AgentProcedure!
  versionId: ID!
  similarity: Float
  verificationRequired: Boolean!
}

type Query {
  agentProcedureCandidates(
    namespace: String!
    taskSummary: String!
    semanticTags: [String!]!
    allowedRiskClasses: [AgentProcedureRiskClass!]!
    topK: Int = 10
  ): [AgentProcedureCandidate!]!
}

type Mutation {
  registerAgentProcedure(input: RegisterAgentProcedureInput!): AgentProcedure!
  activateAgentProcedureVersion(procedureId: ID!, versionId: ID!): AgentProcedure!
}
```

Resolvers derive `account_id` and actor identity from the auth context. Clients
must not provide an `accountId` argument.

## Deterministic execution flow

1. The agent asks for procedure candidates with task metadata and bounded
   `topK`.
2. mondayDB retrieves candidates inside the tenant partition and returns
   metadata only, not executable privileges.
3. The agent selects a candidate and submits a plan draft referencing
   `procedureId` and `versionId`.
4. Plan verification expands the procedure steps, estimates row counts, checks
   allowed operations, reserves budget, and produces an execution envelope.
5. Row-store writes use ACID transactions and idempotency keys. Columnar,
   vector, and analytics projections update asynchronously from committed
   events.
6. Every activation and execution decision appends a hash-chained audit event.

## Agentic guardrails

- `account_id` is mandatory in every table, index prefix, resolver context, and
  audit event.
- `max_recursive_depth` defaults to zero. Recursive procedure calls require an
  explicit non-zero value and a plan-verification budget reservation.
- `max_rows_touched` and `max_vector_top_k` are stored on the procedure and
  copied into the execution envelope so later mutations cannot silently broaden
  an approved run.
- `restricted` procedures require human approval even if retrieval confidence is
  high.
- Tool-use procedures must reference allowed capability IDs from the capability
  registry; free-form tool names are rejected.
- Semantic retrieval cannot grant access. It can only rank visible procedure
  versions already allowed by policy.

## Audit events

```ts
export interface ProcedureAuditEvent {
  accountId: string;
  eventId: string;
  eventType:
    | "procedure.registered"
    | "procedure.version_created"
    | "procedure.activated"
    | "procedure.candidate_retrieved"
    | "procedure.execution_envelope_issued"
    | "procedure.execution_rejected";
  procedureId: string;
  versionId?: string;
  actorUserId: string;
  agentId?: string;
  requestId: string;
  deterministicInputsHash: string;
  decisionHash: string;
  previousAuditHash?: string;
  createdAt: string;
}
```

The audit hash is computed from canonical JSON containing `accountId`,
`procedureId`, `versionId`, request metadata, verification result, and budget
reservation. Embedding vectors are not hashed directly; their model, dimensions,
source text checksum, and embedding ID are hashed for deterministic replay.

## Agent-ready perception

Agents perceive a procedure as a compact affordance, not as raw schema access:

```json
{
  "kind": "agent_procedure",
  "namespace": "board.workflow",
  "slug": "triage-stale-items",
  "riskClass": "read_only",
  "semanticTags": ["triage", "stale-items", "board-health"],
  "inputs": ["board_id", "staleness_window_days"],
  "outputs": ["candidate_item_ids", "recommended_next_step"],
  "guardrails": {
    "maxRowsTouched": 5000,
    "maxVectorTopK": 10,
    "maxRecursiveDepth": 0
  }
}
```

This metadata lets an LLM choose an appropriate procedure while making the
database contract explicit enough for deterministic verification.

## Rollout path

1. Start with read-only procedures for retrieval, summarization, and diagnostics.
2. Add bounded-write procedures only after plan verification and query budgets
   are enforced.
3. Enable tool-use procedures through the capability registry with explicit
   leases and audit events.
4. Promote high-value procedures into shared templates, but instantiate them per
   account so tenant policy and board scope remain isolated.

## Full-scan risks to reject

- Missing `account_id` in any procedure, embedding, or audit query.
- Procedure steps that filter item values only through unindexed JSON paths.
- GraphQL requests with `topK > 50` or no namespace filter.
- Columnar aggregation procedures without account and board partition pruning.
- Recursive procedure chains whose cumulative estimated rows exceed the
  reserved budget.
