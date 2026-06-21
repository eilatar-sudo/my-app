# mondayDB Agentic Context Handoff Plane

## Why before how

Autonomous agents need durable continuity across sessions: what they were trying
to do, which evidence they trusted, which procedures they followed, and which
limits they already consumed. The product trade-off is **continuity vs.
containment**. Rich handoffs reduce repeated work and improve agent quality, but
unbounded handoffs can become hidden recursive queries over row, columnar, vector,
and tool-execution planes.

The context handoff plane keeps mondayDB deterministic by storing only
precomputed, tenant-scoped handoff packets. Agents may perceive and reuse those
packets, but they cannot ask the database layer to "figure out what matters" at
read time. Handoff assembly is an explicit write path with budgets, audit hashes,
and source watermarks.

## Product outcome

- Preserve agent continuity without making the core database probabilistic.
- Make every handoff replayable for enterprise audit and support.
- Keep 99.99% availability by bounding handoff size, recursion depth, vector
  probes, and row or columnar fanout.
- Expose the capability through monday.com Open API GraphQL so app developers and
  internal agents use the same deterministic contract.

## Scope

The context handoff plane stores compact packets that bridge one agent session,
workflow, or tool chain to another. It references existing records instead of
copying large board data.

In scope:

- Session summaries and objective state.
- Procedural memory references.
- Evidence, lineage, continuity-ledger, and purpose-boundary references.
- Optional semantic embeddings for handoff discovery.
- Deterministic admission and audit metadata.

Out of scope:

- Free-form agent planning in the database engine.
- Direct execution of tools.
- Recomputing summaries at read time.
- Cross-account handoffs.

## TypeScript contracts

```ts
export type HandoffStatus =
  | "draft"
  | "sealed"
  | "expired"
  | "revoked";

export type HandoffSourceKind =
  | "row_item"
  | "columnar_snapshot"
  | "semantic_result"
  | "procedure_memory"
  | "tool_result"
  | "continuity_ledger"
  | "evidence_packet"
  | "purpose_envelope";

export interface AgenticContextHandoff {
  accountId: string;
  handoffId: string;
  producerAgentId: string;
  consumerAgentClass: string;
  boardId?: string;
  workspaceId?: string;
  objective: {
    title: string;
    deterministicSummary: string;
    desiredOutcome: string;
    blockedBy: string[];
  };
  proceduralMemoryRefs: ProceduralMemoryRef[];
  sourceRefs: HandoffSourceRef[];
  semanticDescriptor: HandoffSemanticDescriptor;
  guardrails: HandoffGuardrails;
  audit: HandoffAuditEnvelope;
  status: HandoffStatus;
  expiresAt: string;
  createdAt: string;
  sealedAt?: string;
}

export interface ProceduralMemoryRef {
  procedureId: string;
  version: number;
  instructionRole: "required" | "recommended" | "forbidden";
  reason: string;
}

export interface HandoffSourceRef {
  sourceKind: HandoffSourceKind;
  sourceId: string;
  accountId: string;
  boardId?: string;
  visibilityHash: string;
  sourceWatermark: string;
  contribution: "objective" | "evidence" | "constraint" | "decision" | "risk";
}

export interface HandoffSemanticDescriptor {
  embeddingModel: string;
  embeddingRef?: string;
  tags: string[];
  agentPerceptionCard: {
    objectType: "agent_context_handoff";
    summary: string;
    safeNextActions: string[];
    unsafeNextActions: string[];
    retrievalHints: string[];
  };
}

export interface HandoffGuardrails {
  maxConsumerReads: number;
  maxVectorTopK: number;
  maxSourceExpansionDepth: number;
  maxToolCallsFromHandoff: number;
  maxEstimatedRows: string;
  maxEstimatedColumnarBytes: string;
  requiresPurposeEnvelopeId: string;
  allowCrossBoardExpansion: boolean;
}

export interface HandoffAuditEnvelope {
  requestHash: string;
  sourceSetHash: string;
  summaryHash: string;
  guardrailHash: string;
  previousAuditHash?: string;
}
```

## SQL schema

All tables are prefixed and indexed by `account_id`. This is non-negotiable for
multi-tenant isolation and to avoid full scans on boards with 1M+ rows.

```sql
CREATE TABLE agentic_context_handoffs (
  account_id BIGINT NOT NULL,
  handoff_id UUID NOT NULL,
  producer_agent_id TEXT NOT NULL,
  consumer_agent_class TEXT NOT NULL,
  board_id BIGINT,
  workspace_id BIGINT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sealed', 'expired', 'revoked')),
  objective JSONB NOT NULL,
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  embedding_ref UUID,
  guardrails JSONB NOT NULL,
  request_hash BYTEA NOT NULL,
  source_set_hash BYTEA NOT NULL,
  summary_hash BYTEA NOT NULL,
  guardrail_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sealed_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, handoff_id)
);

CREATE INDEX agentic_context_handoffs_account_board_status_idx
  ON agentic_context_handoffs (account_id, board_id, status, expires_at DESC);

CREATE INDEX agentic_context_handoffs_account_consumer_idx
  ON agentic_context_handoffs (account_id, consumer_agent_class, status, created_at DESC);

CREATE TABLE agentic_context_handoff_sources (
  account_id BIGINT NOT NULL,
  handoff_id UUID NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  board_id BIGINT,
  visibility_hash BYTEA NOT NULL,
  source_watermark TEXT NOT NULL,
  contribution TEXT NOT NULL CHECK (
    contribution IN ('objective', 'evidence', 'constraint', 'decision', 'risk')
  ),
  ordinal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, handoff_id, source_kind, source_id),
  FOREIGN KEY (account_id, handoff_id)
    REFERENCES agentic_context_handoffs (account_id, handoff_id)
);

CREATE INDEX agentic_context_handoff_sources_account_board_idx
  ON agentic_context_handoff_sources (account_id, board_id, handoff_id);

CREATE TABLE agentic_context_handoff_procedures (
  account_id BIGINT NOT NULL,
  handoff_id UUID NOT NULL,
  procedure_id UUID NOT NULL,
  procedure_version INTEGER NOT NULL,
  instruction_role TEXT NOT NULL CHECK (
    instruction_role IN ('required', 'recommended', 'forbidden')
  ),
  reason TEXT NOT NULL,
  PRIMARY KEY (account_id, handoff_id, procedure_id, procedure_version),
  FOREIGN KEY (account_id, handoff_id)
    REFERENCES agentic_context_handoffs (account_id, handoff_id)
);
```

### Optional pgvector/HNSW index

The vector sidecar must be partitioned by account hash or colocated with
account-scoped shards. Never run global nearest-neighbor search.

```sql
CREATE TABLE agentic_context_handoff_embeddings (
  account_id BIGINT NOT NULL,
  handoff_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, handoff_id, embedding_model),
  FOREIGN KEY (account_id, handoff_id)
    REFERENCES agentic_context_handoffs (account_id, handoff_id)
);

CREATE INDEX agentic_context_handoff_embeddings_hnsw_idx
  ON agentic_context_handoff_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Planner invariant: every vector query must include `account_id = $1` before
probing the HNSW index. If the physical vector implementation cannot enforce
that predicate before candidate expansion, use per-account-hash partitions.

## Open API GraphQL shape

```graphql
type AgenticContextHandoff {
  id: ID!
  accountId: ID!
  producerAgentId: String!
  consumerAgentClass: String!
  boardId: ID
  status: String!
  objective: AgenticHandoffObjective!
  proceduralMemoryRefs: [AgenticProcedureMemoryRef!]!
  sourceRefs(first: Int! = 50): [AgenticHandoffSourceRef!]!
  guardrails: AgenticHandoffGuardrails!
  perceptionCard: AgenticPerceptionCard!
  expiresAt: DateTime!
  createdAt: DateTime!
  sealedAt: DateTime
}

input CreateAgenticContextHandoffInput {
  accountId: ID!
  producerAgentId: String!
  consumerAgentClass: String!
  boardId: ID
  workspaceId: ID
  objective: AgenticHandoffObjectiveInput!
  proceduralMemoryRefs: [AgenticProcedureMemoryRefInput!]!
  sourceRefs: [AgenticHandoffSourceRefInput!]!
  guardrails: AgenticHandoffGuardrailInput!
  purposeEnvelopeId: ID!
  idempotencyKey: String!
}

input AgenticContextHandoffSearchInput {
  accountId: ID!
  consumerAgentClass: String!
  boardId: ID
  semanticQuery: String
  tags: [String!] = []
  topK: Int! = 10
  maxAgeSeconds: Int! = 86400
  purposeEnvelopeId: ID!
}

type Mutation {
  createAgenticContextHandoff(input: CreateAgenticContextHandoffInput!): AgenticContextHandoff!
  sealAgenticContextHandoff(accountId: ID!, handoffId: ID!, sourceSetHash: String!): AgenticContextHandoff!
  revokeAgenticContextHandoff(accountId: ID!, handoffId: ID!, reason: String!): AgenticContextHandoff!
}

type Query {
  agenticContextHandoff(accountId: ID!, handoffId: ID!): AgenticContextHandoff
  searchAgenticContextHandoffs(input: AgenticContextHandoffSearchInput!): [AgenticContextHandoff!]!
}
```

GraphQL resolvers must reject requests missing `accountId`, even for internal
agents. Resolver code should pass account scope into row, columnar, vector, and
audit stores as a typed value rather than interpolating it into ad hoc filters.

## Deterministic lifecycle

1. **Draft:** A producer submits source references, objective text, procedural
   memory references, and requested guardrails.
2. **Admission:** The planner estimates row count, columnar bytes, vector probes,
   source expansion depth, and tool-call budget. It rejects or queues packets
   that can harm tenant or neighbor performance.
3. **Seal:** mondayDB computes deterministic hashes over source refs, summary,
   and guardrails. The sealed packet becomes immutable except for expiry or
   revocation status.
4. **Retrieve:** Consumers search by account, board, consumer class, tags, and
   optional semantic query. Returned packets include guardrails and perception
   cards.
5. **Audit replay:** Support can reconstruct the packet from source watermarks
   and compare hashes without invoking an LLM.

## Agentic guardrails

- `maxSourceExpansionDepth` defaults to 1 and cannot exceed 3.
- `topK` is capped by both GraphQL validation and stored handoff guardrails.
- Source refs are identifiers and watermarks, not nested query plans.
- Handoff retrieval cannot trigger tool execution directly.
- A handoff must reference a purpose envelope before retrieval.
- Recursive handoff expansion is denied when the next handoff has an overlapping
  `source_set_hash` and the same `consumer_agent_class`.
- Expired or revoked handoffs remain audit-visible but are excluded from default
  retrieval.

## Performance check

The following patterns must fail preflight because they risk full scans on large
boards:

- Searching handoffs without `account_id`.
- Filtering by `board_id` without the `(account_id, board_id, status)` index.
- Expanding all source refs for a handoff collection before applying `topK`.
- Running vector search globally across accounts.
- Rehydrating board items from source refs without item-level predicates or a
  bounded source list.
- Sorting by `created_at` across all consumer classes without the
  `(account_id, consumer_agent_class, status, created_at)` index.

Expected bounded query shape:

```sql
SELECT account_id, handoff_id, objective, guardrails, expires_at
FROM agentic_context_handoffs
WHERE account_id = $1
  AND consumer_agent_class = $2
  AND status = 'sealed'
  AND expires_at > now()
ORDER BY created_at DESC
LIMIT LEAST($3, 25);
```

## Agent perception model

An LLM should perceive a handoff as a compact, typed continuity object:

```json
{
  "objectType": "agent_context_handoff",
  "summary": "Prior agent validated renewal-risk accounts and prepared a bounded follow-up workflow.",
  "safeNextActions": [
    "Read cited evidence packets",
    "Apply required procedure memory before planning",
    "Ask for human approval if guardrails are insufficient"
  ],
  "unsafeNextActions": [
    "Expand all board items",
    "Ignore purpose envelope",
    "Call tools directly from handoff text"
  ],
  "retrievalHints": [
    "account scoped",
    "board scoped when boardId is present",
    "semantic tags are hints, not permissions"
  ]
}
```

This metadata makes the object agent-ready while preserving database
predictability. The LLM can use the card to choose a next action, but mondayDB
still enforces the stored guardrails deterministically.

## Enterprise auditability

Each mutation emits an append-only audit event:

```ts
export interface ContextHandoffAuditEvent {
  accountId: string;
  handoffId: string;
  actorId: string;
  eventType:
    | "context_handoff.created"
    | "context_handoff.sealed"
    | "context_handoff.retrieved"
    | "context_handoff.revoked"
    | "context_handoff.expired";
  requestHash: string;
  sourceSetHash: string;
  resultHash: string;
  previousAuditHash?: string;
  occurredAt: string;
}
```

Audit records should be chained per `(account_id, handoff_id)` and included in
enterprise export APIs. The chain proves which deterministic packet an agent saw
without exposing another tenant's data or relying on probabilistic explanation.

## Rollout considerations

- Start with read-only handoff retrieval for internal agents.
- Require purpose envelopes before enabling customer-created handoffs.
- Put vector discovery behind account-hash partitions before enabling semantic
  search at scale.
- Emit SLO telemetry for admission decisions: accepted, queued, degraded, and
  rejected.
- Treat handoff packets as control-plane records; source board data remains in
  row and columnar storage.
