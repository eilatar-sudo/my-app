# mondayDB Agentic Reliability Governor Plane

## Why this plane exists

mondayDB can become an agentic database without making the storage engine
probabilistic. The product trade-off is to let agents ask richer questions while
keeping the database deterministic, tenant-isolated, and predictable under
enterprise load. The Agentic Reliability Governor is a control plane that sits
before row, columnar, vector, and tool-execution paths. It decides whether an
agent request is safe to run now, must be narrowed, should be queued, or should
be rejected with an explainable reason.

This favors slightly higher planning latency over protecting 99.99% availability
and neighbor performance. For interactive workloads, the governor should add a
small bounded preflight step rather than allowing autonomous agents to discover
cost by recursively querying production boards.

## Product principles

1. **Deterministic database, probabilistic clients.** LLMs can propose plans, but
   mondayDB only accepts compiled, auditable execution envelopes.
2. **Tenant isolation first.** Every governor decision, budget entry, vector
   lookup, and audit record is scoped by `account_id`.
3. **Memory as instructions, not magic.** Procedural memory records describe
   approved workflows, cost envelopes, and escalation rules that agents can cite.
4. **Semantic retrieval with bounded blast radius.** Vector search is useful for
   agent perception, but HNSW probes, `topK`, recursion, and fallback scans are
   capped before execution.
5. **Enterprise explainability.** Every admission decision returns stable reason
   codes, deterministic hashes, and enough metadata for audit replay.

## Where it fits in mondayDB

```text
Agent / Open API
      |
      v
Agentic Reliability Governor
      |-- policy + procedural memory retrieval
      |-- cost and neighbor-impact forecast
      |-- deterministic execution envelope
      |-- audit hash emission
      |
      +--> Row store       (transactions and updates)
      +--> Columnar store  (analytics and aggregations)
      +--> Vector index    (semantic retrieval, pgvector/HNSW compatible)
      +--> Tool runtime    (bounded external/action side effects)
```

The governor does not replace existing ACID or storage-layer controls. It
provides a deterministic admission layer for autonomous traffic that can
otherwise multiply query volume through planning loops.

## TypeScript contracts

```ts
export type AgenticWorkloadKind =
  | "row_read"
  | "row_write"
  | "columnar_aggregation"
  | "semantic_retrieval"
  | "hybrid_retrieval"
  | "tool_execution";

export type GovernorDecision =
  | "allow"
  | "allow_with_limits"
  | "queue"
  | "require_human_review"
  | "reject";

export interface AgenticReliabilityRequest {
  accountId: string;
  actorId: string;
  agentId: string;
  sessionId: string;
  requestId: string;
  workloadKind: AgenticWorkloadKind;
  boardIds: string[];
  objective: string;
  requestedAt: string;
  planDraftHash: string;
  semanticQuery?: {
    embeddingModel: string;
    embeddingHash: string;
    topK: number;
    efSearch?: number;
    filters: Record<string, string | number | boolean>;
  };
  proceduralMemoryRefs: string[];
  proposedLimits: {
    maxRowsRead: number;
    maxColumnarPartitions: number;
    maxVectorCandidates: number;
    maxToolCalls: number;
    maxRecursionDepth: number;
    timeoutMs: number;
  };
}

export interface AgenticReliabilityEnvelope {
  accountId: string;
  envelopeId: string;
  requestId: string;
  decision: GovernorDecision;
  reasonCodes: string[];
  validUntil: string;
  compiledLimits: {
    maxRowsRead: number;
    maxColumnarPartitions: number;
    maxVectorCandidates: number;
    maxToolCalls: number;
    maxRecursionDepth: number;
    timeoutMs: number;
    queuePriority: "interactive" | "background" | "bulk";
  };
  requiredPredicates: {
    accountId: string;
    boardIds: string[];
    itemIdRange?: { min: string; max: string };
    updatedAtWatermark?: string;
  };
  memoryInstructions: AgentProcedureInstruction[];
  audit: {
    decisionHash: string;
    previousAuditHash?: string;
    policyVersion: string;
    costForecastHash: string;
  };
}

export interface AgentProcedureInstruction {
  accountId: string;
  memoryId: string;
  version: number;
  title: string;
  allowedWorkloadKinds: AgenticWorkloadKind[];
  instructionSummary: string;
  requiredCitations: string[];
  escalationRule: "none" | "human_review" | "admin_approval";
  maxObservedCostUnits: number;
  semanticTags: string[];
}
```

## SQL schema

The schema keeps all mutable operational state tenant-prefixed. The vector table
is compatible with pgvector-style embeddings and can be implemented with
account-partitioned HNSW indexes.

```sql
CREATE TABLE agentic_reliability_requests (
  account_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  actor_id BIGINT NOT NULL,
  agent_id UUID NOT NULL,
  session_id UUID NOT NULL,
  workload_kind TEXT NOT NULL,
  board_ids BIGINT[] NOT NULL,
  objective TEXT NOT NULL,
  plan_draft_hash BYTEA NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_limits JSONB NOT NULL,
  PRIMARY KEY (account_id, request_id)
);

CREATE TABLE agentic_reliability_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  request_id UUID NOT NULL,
  decision TEXT NOT NULL,
  reason_codes TEXT[] NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  compiled_limits JSONB NOT NULL,
  required_predicates JSONB NOT NULL,
  policy_version TEXT NOT NULL,
  cost_forecast_hash BYTEA NOT NULL,
  decision_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agentic_reliability_requests (account_id, request_id)
);

CREATE TABLE agentic_procedure_instructions (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  version INT NOT NULL,
  title TEXT NOT NULL,
  allowed_workload_kinds TEXT[] NOT NULL,
  instruction_summary TEXT NOT NULL,
  required_citations TEXT[] NOT NULL,
  escalation_rule TEXT NOT NULL,
  max_observed_cost_units BIGINT NOT NULL,
  semantic_tags TEXT[] NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, memory_id, version)
);

CREATE TABLE agentic_reliability_audit_events (
  account_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  deterministic_payload JSONB NOT NULL,
  payload_hash BYTEA NOT NULL,
  previous_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_id)
);

CREATE INDEX agentic_reliability_requests_board_idx
  ON agentic_reliability_requests (account_id, requested_at DESC)
  INCLUDE (workload_kind, board_ids);

CREATE INDEX agentic_reliability_envelopes_request_idx
  ON agentic_reliability_envelopes (account_id, request_id, created_at DESC);

CREATE INDEX agentic_reliability_audit_envelope_idx
  ON agentic_reliability_audit_events (account_id, envelope_id, created_at);

-- Implementation note: create the HNSW index per account partition or per
-- account hash partition so vector probes never cross tenant boundaries.
-- Example shape:
-- CREATE INDEX agentic_procedure_instruction_embedding_hnsw
--   ON agentic_procedure_instructions_account_42
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
```

## Open API GraphQL shape

Every field requires `accountId` either explicitly or through the authenticated
tenant context. The resolver must reject mismatches between auth context and
input `accountId`.

```graphql
enum AgenticWorkloadKind {
  ROW_READ
  ROW_WRITE
  COLUMNAR_AGGREGATION
  SEMANTIC_RETRIEVAL
  HYBRID_RETRIEVAL
  TOOL_EXECUTION
}

enum GovernorDecision {
  ALLOW
  ALLOW_WITH_LIMITS
  QUEUE
  REQUIRE_HUMAN_REVIEW
  REJECT
}

input AgenticSemanticQueryInput {
  embeddingModel: String!
  embeddingHash: String!
  topK: Int!
  efSearch: Int
  filters: JSON!
}

input AgenticProposedLimitsInput {
  maxRowsRead: Int!
  maxColumnarPartitions: Int!
  maxVectorCandidates: Int!
  maxToolCalls: Int!
  maxRecursionDepth: Int!
  timeoutMs: Int!
}

input AgenticReliabilityRequestInput {
  accountId: ID!
  agentId: ID!
  sessionId: ID!
  requestId: ID!
  workloadKind: AgenticWorkloadKind!
  boardIds: [ID!]!
  objective: String!
  planDraftHash: String!
  semanticQuery: AgenticSemanticQueryInput
  proceduralMemoryRefs: [ID!]!
  proposedLimits: AgenticProposedLimitsInput!
}

type AgentProcedureInstruction {
  memoryId: ID!
  version: Int!
  title: String!
  instructionSummary: String!
  requiredCitations: [String!]!
  escalationRule: String!
  semanticTags: [String!]!
}

type AgenticReliabilityEnvelope {
  accountId: ID!
  envelopeId: ID!
  requestId: ID!
  decision: GovernorDecision!
  reasonCodes: [String!]!
  validUntil: DateTime!
  compiledLimits: JSON!
  requiredPredicates: JSON!
  memoryInstructions: [AgentProcedureInstruction!]!
  decisionHash: String!
}

type Mutation {
  preflightAgenticWorkload(
    input: AgenticReliabilityRequestInput!
  ): AgenticReliabilityEnvelope!
}

type Query {
  agenticReliabilityEnvelope(
    accountId: ID!
    envelopeId: ID!
  ): AgenticReliabilityEnvelope
}
```

## Deterministic admission flow

1. **Authenticate and scope.** Resolve the authenticated `account_id` and require
   every requested board, memory record, vector filter, and tool target to match.
2. **Retrieve procedural memory.** Fetch only active procedure instructions with
   `(account_id, memory_id, version)` or a tenant-partitioned semantic lookup.
3. **Forecast cost.** Produce stable estimates for row reads, columnar
   partitions, vector candidates, tool calls, timeout budget, and recursion
   depth.
4. **Compile limits.** Clamp requested limits to policy maximums and procedural
   memory constraints.
5. **Return an envelope.** Emit `allow`, `allow_with_limits`, `queue`,
   `require_human_review`, or `reject` with reason codes and audit hashes.
6. **Enforce at execution.** Row, columnar, vector, and tool runtimes consume the
   envelope and stop when any compiled limit is reached.

## Semantic retrieval and HNSW compatibility

Procedural instructions and agent perception metadata should be embedded only
after deterministic records are committed. The embedding pipeline must store:

- `account_id`
- source record primary key and version
- embedding model/version
- deterministic source hash
- visibility label
- board and object tags

Recommended HNSW guardrails:

- Partition by `account_id` or account hash before vector indexing.
- Cap `topK` per workload class, with a lower cap for recursive agent calls.
- Cap `efSearch` and expose the compiled value in the envelope.
- Never fallback from vector search to an unbounded SQL scan when embeddings are
  missing; return `REJECT` or `REQUIRE_HUMAN_REVIEW` with reason code
  `SEMANTIC_INDEX_NOT_READY`.
- Require structured filters for board IDs and visibility labels before running
  vector retrieval.

## Performance checks for boards with 1M+ rows

Flag or reject any plan that would cause:

- Row-store reads without `account_id` and board predicates.
- Columnar aggregation without partition pruning on account, board, or time
  watermarks.
- JSON filter predicates that are not backed by a materialized column, inverted
  index, or schema contract.
- Vector retrieval with `topK` multiplied by recursion depth beyond the compiled
  `maxVectorCandidates`.
- Agent loops that repeat similar semantic queries without new evidence,
  updated watermarks, or a different procedure version.
- Tool execution that triggers read-after-write polling without a bounded retry
  plan.

For large boards, the governor should prefer:

- Columnar pre-aggregation over row scans for analytical questions.
- Working-set snapshots over repeated live reads.
- Cursor- or watermark-based pagination over offset pagination.
- Async enrichment for embeddings instead of synchronous embedding generation in
  the transaction path.

## Agentic guardrails

| Risk | Deterministic control |
| --- | --- |
| Recursive agent query loops | `maxRecursionDepth`, semantic fingerprint checks, repeated-plan reason codes |
| Neighbor performance impact | account-level and workload-class token buckets, queue decisions under load |
| Expensive vector probes | tenant-partitioned HNSW, `topK` and `efSearch` caps, no scan fallback |
| Tool side effects | envelope-bound tool leases and idempotency keys |
| Data leakage | mandatory `account_id` predicates and visibility labels |
| Non-auditable AI behavior | decision hashes over plan draft, policy version, limits, and reason codes |

## Auditability

Each envelope emits an audit event with:

- `account_id`
- `request_id`
- `envelope_id`
- normalized request payload hash
- policy version
- cost forecast hash
- compiled limit hash
- previous audit hash

This creates a deterministic trace of why an autonomous workload ran, was
limited, queued, or rejected. The audit payload should avoid storing raw prompts
unless the tenant has enabled prompt retention; store prompt hashes and objective
summaries by default.

## How an agent perceives this data

Agents should see the envelope as a compact "operating contract":

```json
{
  "decision": "allow_with_limits",
  "reasonCodes": ["VECTOR_TOPK_CLAMPED", "COLUMNAR_PATH_REQUIRED"],
  "instructions": [
    "Use columnar aggregation for status counts.",
    "Cite source board IDs and the procedure memory version.",
    "Stop after one semantic expansion unless new evidence is found."
  ],
  "limits": {
    "maxRowsRead": 10000,
    "maxVectorCandidates": 200,
    "maxToolCalls": 0,
    "maxRecursionDepth": 1
  },
  "perceptionTags": [
    "tenant_scoped",
    "requires_citations",
    "columnar_preferred",
    "no_tool_side_effects"
  ]
}
```

The LLM can plan within this contract, but mondayDB remains responsible for
enforcing it.

## Rollout strategy

1. **Observe-only mode.** Generate envelopes and audit hashes without blocking
   execution. Compare forecasts to actual row, columnar, vector, and tool costs.
2. **Limit-only mode.** Enforce compiled limits for autonomous traffic while
   still allowing trusted human-initiated queries through existing paths.
3. **Admission mode.** Queue or reject unsafe autonomous workloads using stable
   reason codes.
4. **Memory-aware mode.** Require approved procedural memory for high-impact
   actions such as bulk updates, cross-board joins, and tool execution.

## Open questions

- What customer-facing language should expose `queue` versus `reject` without
  making agent behavior feel unreliable?
- Which existing mondayDB cost metrics can be reused for vector probes and tool
  calls so the governor avoids a parallel metering system?
- Should prompt retention be opt-in per account, per workspace, or per app
  integration?
- Which Open API mutations should require procedural memory references from day
  one, and which can begin with observe-only envelopes?
