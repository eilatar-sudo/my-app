# Agentic Workload Isolation Plane

## Why before how

Agentic retrieval turns mondayDB from a deterministic WorkOS engine into an
execution substrate for autonomous systems. The product trade-off is latency vs.
neighbor safety: an agent wants broad semantic context, recursive tool use, and
large result windows, while enterprise customers expect predictable latency,
ACID-safe updates, and strict tenant isolation. The workload isolation plane
keeps the database deterministic by admitting, shaping, and auditing agentic
queries before they touch row, columnar, vector, or tool-execution paths.

This plane does not decide what an agent should do. It decides whether a
proposed operation is safe to run for a specific `account_id`, board scope,
budget, and isolation class. Probabilistic reasoning remains outside the
database; mondayDB only evaluates deterministic envelopes, estimates, and
ledgered limits.

## Scope

- Gate semantic retrieval, procedural-memory reads, tool calls, and analytical
  fan-out behind tenant-scoped workload classes.
- Protect 99.99% availability by bounding agent recursion, vector fan-out,
  columnar scans, and transactional write pressure.
- Preserve Open API access through explicit GraphQL mutations and queries.
- Leave a replayable audit trace for every admission decision and limit update.

## Workload classes

| Class | Intended use | Default behavior |
| --- | --- | --- |
| `interactive_agent` | User-facing agent action in a board or item view | Low latency, strict token and row caps |
| `background_enrichment` | Async embedding, compaction, and metadata tagging | Queueable, preemptible, watermark-bound |
| `bulk_tool_execution` | Approved multi-step tool workflows | Lease-based, low concurrency, human review hooks |
| `semantic_analytics` | RAG over large board slices or historical memory | Columnar-first, sampled previews before full scans |

## TypeScript contracts

```ts
export type AgenticWorkloadClass =
  | "interactive_agent"
  | "background_enrichment"
  | "bulk_tool_execution"
  | "semantic_analytics";

export type IsolationDecision = "admit" | "shape" | "defer" | "reject";

export interface AgenticWorkloadPolicy {
  account_id: string;
  policy_id: string;
  workload_class: AgenticWorkloadClass;
  enabled: boolean;
  max_concurrent_requests: number;
  max_recursion_depth: number;
  max_vector_top_k: number;
  max_rows_scanned: number;
  max_columnar_bytes: number;
  max_tool_calls: number;
  max_wall_time_ms: number;
  require_board_scope: boolean;
  require_procedure_id: boolean;
  audit_salt_ref: string;
  created_at: string;
  updated_at: string;
}

export interface AgenticWorkloadAdmissionRequest {
  account_id: string;
  actor_id: string;
  agent_id: string;
  workload_class: AgenticWorkloadClass;
  board_ids: string[];
  procedure_id?: string;
  semantic_query_hash?: string;
  requested_vector_top_k: number;
  requested_row_limit: number;
  requested_tool_calls: number;
  requested_recursion_depth: number;
  estimated_rows_scanned: number;
  estimated_columnar_bytes: number;
  estimated_write_count: number;
  source_watermark: string;
  request_hash: string;
}

export interface AgenticWorkloadAdmissionDecision {
  account_id: string;
  decision_id: string;
  request_hash: string;
  decision: IsolationDecision;
  shaped_vector_top_k: number;
  shaped_row_limit: number;
  shaped_tool_calls: number;
  shaped_recursion_depth: number;
  retry_after_ms?: number;
  rejection_reason?: string;
  policy_snapshot_hash: string;
  estimate_hash: string;
  audit_hash: string;
  decided_at: string;
}
```

## SQL schema

All tables are prefixed by `account_id` to make tenant isolation a physical
indexing property, not just an application convention.

```sql
CREATE TABLE agentic_workload_policies (
  account_id            BIGINT NOT NULL,
  policy_id             UUID NOT NULL,
  workload_class        TEXT NOT NULL CHECK (
    workload_class IN (
      'interactive_agent',
      'background_enrichment',
      'bulk_tool_execution',
      'semantic_analytics'
    )
  ),
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  max_concurrent_requests INTEGER NOT NULL,
  max_recursion_depth   INTEGER NOT NULL,
  max_vector_top_k      INTEGER NOT NULL,
  max_rows_scanned      BIGINT NOT NULL,
  max_columnar_bytes    BIGINT NOT NULL,
  max_tool_calls        INTEGER NOT NULL,
  max_wall_time_ms      INTEGER NOT NULL,
  require_board_scope   BOOLEAN NOT NULL DEFAULT TRUE,
  require_procedure_id  BOOLEAN NOT NULL DEFAULT FALSE,
  audit_salt_ref        TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id),
  UNIQUE (account_id, workload_class)
);

CREATE TABLE agentic_workload_ledger (
  account_id              BIGINT NOT NULL,
  ledger_id               UUID NOT NULL,
  workload_class          TEXT NOT NULL,
  board_id                BIGINT,
  agent_id                UUID NOT NULL,
  request_hash            TEXT NOT NULL,
  admitted_rows_scanned   BIGINT NOT NULL,
  admitted_columnar_bytes BIGINT NOT NULL,
  admitted_vector_top_k   INTEGER NOT NULL,
  admitted_tool_calls     INTEGER NOT NULL,
  admitted_recursion_depth INTEGER NOT NULL,
  wall_time_ms            INTEGER,
  source_watermark        TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (
    status IN ('admitted', 'shaped', 'deferred', 'rejected', 'completed', 'expired')
  ),
  audit_hash              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, ledger_id)
);

CREATE INDEX agentic_workload_ledger_active_idx
  ON agentic_workload_ledger (
    account_id,
    workload_class,
    status,
    expires_at
  );

CREATE INDEX agentic_workload_ledger_board_idx
  ON agentic_workload_ledger (
    account_id,
    board_id,
    created_at DESC
  )
  WHERE board_id IS NOT NULL;

CREATE TABLE agentic_isolation_audit_events (
  account_id          BIGINT NOT NULL,
  event_id            UUID NOT NULL,
  decision_id         UUID NOT NULL,
  actor_id            BIGINT NOT NULL,
  agent_id            UUID NOT NULL,
  workload_class      TEXT NOT NULL,
  board_ids           BIGINT[] NOT NULL,
  request_hash        TEXT NOT NULL,
  policy_snapshot_hash TEXT NOT NULL,
  estimate_hash       TEXT NOT NULL,
  previous_audit_hash TEXT,
  audit_hash          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_isolation_audit_decision_idx
  ON agentic_isolation_audit_events (
    account_id,
    decision_id,
    created_at DESC
  );
```

## Vector and semantic retrieval compatibility

The isolation plane stores workload metadata separately from embeddings, but it
must shape vector retrieval before HNSW execution. mondayDB should avoid a
single global HNSW graph for tenant data; vector storage is partitioned or
sharded by `account_id` hash, with optional board-level partitions for very
large tenants.

```sql
-- Existing semantic memory table pattern, shown for compatibility.
CREATE TABLE agentic_memory_embeddings (
  account_id       BIGINT NOT NULL,
  board_id         BIGINT,
  memory_id        UUID NOT NULL,
  memory_type      TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  embedding        VECTOR(1536) NOT NULL,
  metadata_tags    JSONB NOT NULL,
  PRIMARY KEY (account_id, memory_id)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_memory_embedding_hnsw_idx
  ON agentic_memory_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX agentic_memory_scope_idx
  ON agentic_memory_embeddings (
    account_id,
    board_id,
    memory_type,
    source_watermark
  );
```

Every semantic search must select the tenant partition using `account_id` and
the narrowest available board or memory scope before vector ranking. If the
planner cannot prove the tenant predicate constrains HNSW candidate expansion,
the admission decision is `reject`.

## Open API GraphQL surface

```graphql
enum AgenticWorkloadClass {
  interactive_agent
  background_enrichment
  bulk_tool_execution
  semantic_analytics
}

enum IsolationDecision {
  admit
  shape
  defer
  reject
}

enum AgenticWorkloadLedgerStatus {
  admitted
  shaped
  deferred
  rejected
  completed
  expired
}

input AgenticWorkloadAdmissionInput {
  accountId: ID!
  actorId: ID!
  agentId: ID!
  workloadClass: AgenticWorkloadClass!
  boardIds: [ID!]!
  procedureId: ID
  semanticQueryHash: String
  requestedVectorTopK: Int!
  requestedRowLimit: Int!
  requestedToolCalls: Int!
  requestedRecursionDepth: Int!
  estimatedRowsScanned: BigInt!
  estimatedColumnarBytes: BigInt!
  estimatedWriteCount: Int!
  sourceWatermark: String!
  requestHash: String!
}

type AgenticWorkloadAdmissionDecision {
  accountId: ID!
  decisionId: ID!
  requestHash: String!
  decision: IsolationDecision!
  shapedVectorTopK: Int!
  shapedRowLimit: Int!
  shapedToolCalls: Int!
  shapedRecursionDepth: Int!
  retryAfterMs: Int
  rejectionReason: String
  policySnapshotHash: String!
  estimateHash: String!
  auditHash: String!
  decidedAt: DateTime!
}

type AgenticWorkloadPolicy {
  accountId: ID!
  policyId: ID!
  workloadClass: AgenticWorkloadClass!
  enabled: Boolean!
  maxConcurrentRequests: Int!
  maxRecursionDepth: Int!
  maxVectorTopK: Int!
  maxRowsScanned: BigInt!
  maxColumnarBytes: BigInt!
  maxToolCalls: Int!
  maxWallTimeMs: Int!
  requireBoardScope: Boolean!
  requireProcedureId: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AgenticWorkloadLedger {
  accountId: ID!
  ledgerId: ID!
  workloadClass: AgenticWorkloadClass!
  boardId: ID
  agentId: ID!
  requestHash: String!
  admittedRowsScanned: BigInt!
  admittedColumnarBytes: BigInt!
  admittedVectorTopK: Int!
  admittedToolCalls: Int!
  admittedRecursionDepth: Int!
  status: AgenticWorkloadLedgerStatus!
  auditHash: String!
  createdAt: DateTime!
  expiresAt: DateTime!
}

type AgenticWorkloadLedgerConnection {
  nodes: [AgenticWorkloadLedger!]!
}

extend type Mutation {
  admitAgenticWorkload(
    input: AgenticWorkloadAdmissionInput!
  ): AgenticWorkloadAdmissionDecision!
}

extend type Query {
  agenticWorkloadPolicy(
    accountId: ID!
    workloadClass: AgenticWorkloadClass!
  ): AgenticWorkloadPolicy!

  agenticWorkloadLedger(
    accountId: ID!
    workloadClass: AgenticWorkloadClass
    boardId: ID
    status: AgenticWorkloadLedgerStatus
    first: Int = 50
  ): AgenticWorkloadLedgerConnection!
}
```

## Deterministic admission flow

1. Validate `account_id`, actor authorization, and board membership.
2. Load the `(account_id, workload_class)` policy using a point lookup.
3. Require board scope when `require_board_scope = true`.
4. Require a `procedure_id` for workloads allowed to call tools or recurse.
5. Hash the request, policy snapshot, and planner estimate.
6. Compare requested cost against policy caps and active ledger usage.
7. Return one of:
   - `admit`: request fits caps and concurrency.
   - `shape`: lower topK, row limits, tool calls, or recursion depth.
   - `defer`: tenant budget is healthy but currently saturated.
   - `reject`: missing scope, unsafe estimate, or unavailable proof of
     tenant-first filtering.
8. Insert ledger and audit rows in the same transaction as the decision.

No random sampling or model confidence is used in admission. If a sampling step
is needed for semantic analytics, the sampled plan is submitted as a new,
hash-addressed request.

## Guardrails for recursive agent queries

- Recursion depth is explicit in the request and decreased on every nested plan.
- Nested plans inherit the parent `account_id`, board scope, workload class, and
  source watermark.
- Tool calls consume ledger units before execution, not after success.
- Semantic cache hits still consume a small read budget so agents cannot bypass
  tenant quotas through cache amplification.
- A parent request cannot spawn children whose summed shaped limits exceed the
  parent envelope.

## Performance check for 1M+ row boards

Potential full-scan risks and mitigations:

- Missing `account_id` predicate: reject at admission because tenant isolation
  cannot be proven.
- Empty `board_ids` on an interactive request: reject unless the policy is an
  approved account-wide background workload.
- Unbounded vector `topK`: shape to `max_vector_top_k`; reject if the requested
  value is required for correctness.
- JSON metadata filters without indexed tags: require an indexed metadata tag or
  route to background enrichment.
- Columnar aggregation over hot transactional rows: use source watermarks and
  row-store delta limits before merging columnar results.
- Recursive tool fan-out: reserve child envelopes from the parent budget before
  any child query starts.

For boards with more than 1M rows, `estimated_rows_scanned` must come from the
planner before admission. Unknown estimates are treated as unsafe for
interactive workloads.

## Agent-ready perception

Agents should perceive this plane as a deterministic capability boundary:

```json
{
  "capability": "agentic_workload_isolation",
  "account_id": "12345",
  "workload_class": "interactive_agent",
  "permitted_scope": {
    "board_ids": ["98765"],
    "max_vector_top_k": 25,
    "max_recursion_depth": 2,
    "max_tool_calls": 3
  },
  "planner_hint": "Submit a narrower board-scoped semantic query before requesting analytics fan-out.",
  "audit_hash": "sha256:..."
}
```

This metadata lets an LLM understand available affordances without learning any
cross-tenant data. The agent sees shaped limits and procedural hints; mondayDB
keeps the underlying enforcement deterministic and auditable.

## Auditability

Audit hashes are computed from canonical JSON:

```ts
export interface AgenticIsolationAuditPayload {
  account_id: string;
  decision_id: string;
  actor_id: string;
  agent_id: string;
  workload_class: AgenticWorkloadClass;
  board_ids: string[];
  request_hash: string;
  policy_snapshot_hash: string;
  estimate_hash: string;
  previous_audit_hash?: string;
  created_at: string;
}
```

`audit_hash = sha256(canonical_json(payload))`. Hash chaining by `account_id`
and `decision_id` supports deterministic replay without exposing prompt text,
semantic query bodies, or tool arguments in the hot ledger.

## Operational invariants

- Every admission request includes `account_id`.
- Every database lookup uses an index beginning with `account_id`.
- Every vector search is shaped before HNSW candidate expansion.
- Every recursive child plan inherits and consumes the parent budget.
- Every decision writes a ledger entry and an audit event in one transaction.
- Every Open API response returns shaped limits so agents can plan within
  explicit boundaries.
