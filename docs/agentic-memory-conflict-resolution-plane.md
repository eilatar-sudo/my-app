# Agentic Memory Conflict Resolution Plane

## Why: usefulness versus deterministic trust

Agentic mondayDB needs long-term memory and reusable procedure memory so agents can
answer with context instead of relearning a board on every task. The trade-off is
that memory improves latency and usefulness only when the database can reconcile
stale, overlapping, or contradictory memories without surprising the tenant.

This plane keeps conflict handling deterministic. mondayDB stores the facts,
candidate conflicts, precedence decisions, and audit hashes; LLMs can perceive
the resolved memory state, but they do not decide which memory wins inside the
database engine.

## Product surface

- Detect contradictory semantic, procedural, and operational memories that apply
  to the same account, board, entity, purpose boundary, or tool scope.
- Compile a deterministic resolution envelope before memories are used by
  retrieval, plan verification, or tool execution.
- Expose the envelope through the monday.com Open API so apps and agents can
  explain why one memory was active, suppressed, expired, or sent to review.
- Preserve 99.99% availability goals by moving expensive detection into bounded
  async jobs and keeping request-path resolution index-backed.

## Scope and invariants

Every stored row and API resolver is scoped by `account_id`. Cross-account conflict detection is invalid by construction, including vector-neighbor scans, async sweeps, GraphQL pagination, and audit replay.

Required invariants:

1. `account_id` is the leading key in every primary key, foreign key, and
   request-path lookup index; GIN and HNSW support indexes must be local to
   account-hash partitions or reached only after tenant pruning.
2. A memory can be active for agent context only through a compiled
   `MemoryResolutionEnvelope`.
3. Resolution is replayable from input memory hashes, policy version, watermarks,
   and deterministic precedence rules.
4. Raw redacted values are never embedded in conflict summaries or audit hashes.
5. Any board with 1M+ rows must use account/board/entity predicates or an
   approved semantic candidate set; unbounded conflict sweeps are rejected.

## TypeScript contracts

```ts
type MemoryKind =
  | "semantic_fact"
  | "procedure_step"
  | "tool_preference"
  | "operational_feedback";

type ConflictType =
  | "contradictory_fact"
  | "procedure_order_mismatch"
  | "tool_scope_overlap"
  | "stale_source_watermark"
  | "policy_boundary_mismatch";

type ResolutionState =
  | "active"
  | "suppressed"
  | "expired"
  | "requires_human_review";

interface AgenticMemoryRecord {
  account_id: string;
  memory_id: string;
  board_id?: string;
  entity_ref?: string;
  purpose_boundary_id: string;
  memory_kind: MemoryKind;
  source_event_id: string;
  source_watermark: string;
  sensitivity_tags: string[];
  semantic_tags: string[];
  procedure_memory_refs: string[];
  embedding_ref?: {
    account_partition: string;
    vector_id: string;
    embedding_model: string;
    hnsw_namespace: string;
  };
  deterministic_summary: string;
  memory_hash: string;
  created_at: string;
  expires_at?: string;
}

interface MemoryConflictCandidate {
  account_id: string;
  conflict_id: string;
  candidate_memory_ids: string[];
  board_id?: string;
  entity_ref?: string;
  conflict_type: ConflictType;
  detection_path: "indexed_exact" | "bounded_vector" | "event_watermark";
  detection_watermark: string;
  evidence_hashes: string[];
  estimated_rows_scanned: number;
  estimated_vector_candidates: number;
}

interface MemoryResolutionEnvelope {
  account_id: string;
  resolution_id: string;
  conflict_id: string;
  policy_version: string;
  precedence_rule_ids: string[];
  decisions: Array<{
    memory_id: string;
    state: ResolutionState;
    reason_code:
      | "newer_source_watermark"
      | "higher_specificity"
      | "human_approved"
      | "expired"
      | "purpose_boundary_denied"
      | "insufficient_evidence";
  }>;
  active_memory_ids: string[];
  suppressed_memory_ids: string[];
  requires_review: boolean;
  audit_hash: string;
  compiled_at: string;
}

interface AgentMemoryConflictCard {
  account_id: string;
  resolution_id: string;
  visible_summary: string;
  active_memory_count: number;
  suppressed_memory_count: number;
  omitted_sensitive_source_count: number;
  semantic_tags: string[];
  procedure_memory_refs: string[];
  suggested_agent_behavior: string[];
  forbidden_agent_behavior: string[];
  audit_hash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_memory_records (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  board_id BIGINT,
  entity_ref TEXT,
  purpose_boundary_id UUID NOT NULL,
  memory_kind TEXT NOT NULL,
  source_event_id UUID NOT NULL,
  source_watermark TEXT NOT NULL,
  sensitivity_tags TEXT[] NOT NULL DEFAULT '{}',
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  procedure_memory_refs UUID[] NOT NULL DEFAULT '{}',
  embedding_vector_id UUID,
  embedding_model TEXT,
  hnsw_namespace TEXT,
  deterministic_summary TEXT NOT NULL,
  memory_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, memory_id)
);

CREATE INDEX agentic_memory_records_lookup_idx
  ON agentic_memory_records (
    account_id,
    purpose_boundary_id,
    board_id,
    entity_ref,
    memory_kind,
    source_watermark DESC
  );

-- Support index inside account-hash partitions; request-path queries must first
-- prune by account_id/purpose/board through agentic_memory_records_lookup_idx.
CREATE INDEX agentic_memory_records_tags_partition_idx
  ON agentic_memory_records
  USING GIN (semantic_tags);

CREATE TABLE agentic_memory_conflict_candidates (
  account_id BIGINT NOT NULL,
  conflict_id UUID NOT NULL,
  board_id BIGINT,
  entity_ref TEXT,
  conflict_type TEXT NOT NULL,
  detection_path TEXT NOT NULL,
  detection_watermark TEXT NOT NULL,
  candidate_memory_ids UUID[] NOT NULL,
  evidence_hashes BYTEA[] NOT NULL,
  estimated_rows_scanned BIGINT NOT NULL,
  estimated_vector_candidates INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, conflict_id)
);

CREATE INDEX agentic_memory_conflicts_resolution_idx
  ON agentic_memory_conflict_candidates (
    account_id,
    board_id,
    entity_ref,
    conflict_type,
    detection_watermark DESC
  );

CREATE TABLE agentic_memory_resolution_envelopes (
  account_id BIGINT NOT NULL,
  resolution_id UUID NOT NULL,
  conflict_id UUID NOT NULL,
  policy_version TEXT NOT NULL,
  precedence_rule_ids TEXT[] NOT NULL,
  active_memory_ids UUID[] NOT NULL,
  suppressed_memory_ids UUID[] NOT NULL,
  requires_review BOOLEAN NOT NULL,
  decisions JSONB NOT NULL,
  audit_hash BYTEA NOT NULL,
  compiled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, resolution_id),
  FOREIGN KEY (account_id, conflict_id)
    REFERENCES agentic_memory_conflict_candidates (account_id, conflict_id)
);

CREATE INDEX agentic_memory_resolution_conflict_idx
  ON agentic_memory_resolution_envelopes (
    account_id,
    conflict_id,
    compiled_at DESC
  );
```

### pgvector/HNSW compatibility

Embedding storage should live in the tenant-partitioned semantic index used by
the retrieval router:

```sql
-- Logical shape; physical storage can remain in mondayDB's vector sidecar.
CREATE TABLE agentic_memory_embeddings (
  account_id BIGINT NOT NULL,
  vector_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  purpose_boundary_id UUID NOT NULL,
  board_id BIGINT,
  embedding_model TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL,
  PRIMARY KEY (account_id, vector_id)
)
PARTITION BY HASH (account_id);

-- Created on each account-hash partition, not as a global cross-tenant index.
CREATE INDEX agentic_memory_embeddings_hnsw_partition_idx
  ON agentic_memory_embeddings_account_p00
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The HNSW path must still apply an `account_id` partition filter before returning
candidates. Candidate generation is capped by `maxVectorTopK`, `maxExpansionDepth`,
and `maxCandidateMemoriesPerConflict`; it is never a tenant-wide brute-force
semantic comparison.

## Open API GraphQL shape

```graphql
type AgentMemoryConflictCard {
  accountId: ID!
  resolutionId: ID!
  visibleSummary: String!
  activeMemoryCount: Int!
  suppressedMemoryCount: Int!
  omittedSensitiveSourceCount: Int!
  semanticTags: [String!]!
  procedureMemoryRefs: [ID!]!
  suggestedAgentBehavior: [String!]!
  forbiddenAgentBehavior: [String!]!
  auditHash: String!
}

input ResolveAgenticMemoryConflictsInput {
  accountId: ID!
  boardId: ID
  entityRef: String
  purposeBoundaryId: ID!
  memoryKinds: [String!]!
  maxVectorTopK: Int = 20
  maxCandidateMemoriesPerConflict: Int = 50
  requireHumanReviewForToolScopeOverlap: Boolean = true
}

type ResolveAgenticMemoryConflictsPayload {
  resolutionIds: [ID!]!
  cards: [AgentMemoryConflictCard!]!
  rejected: Boolean!
  rejectionReason: String
  auditHash: String!
}

extend type Mutation {
  resolveAgenticMemoryConflicts(
    input: ResolveAgenticMemoryConflictsInput!
  ): ResolveAgenticMemoryConflictsPayload!
}

extend type Query {
  agenticMemoryConflictCard(
    accountId: ID!
    resolutionId: ID!
  ): AgentMemoryConflictCard
}
```

Resolvers must reject requests without `accountId` and `purposeBoundaryId`.
For boards above 1M rows, `boardId`, `entityRef`, or a bounded semantic candidate
set is mandatory.

## Deterministic resolution algorithm

1. Build a candidate set from indexed exact matches first:
   `(account_id, purpose_boundary_id, board_id, entity_ref, memory_kind)`.
2. Optionally expand with tenant-partitioned HNSW neighbors when the caller
   provides semantic tags or a vector query and the budget allows it.
3. Sort candidate memories by deterministic precedence:
   - human-approved override;
   - purpose-boundary specificity;
   - entity specificity over board-level memory;
   - freshest source watermark;
   - lowest memory UUID as a final stable tie-breaker.
4. Mark losers as `suppressed`, expired records as `expired`, and unsafe
   tool-scope overlaps as `requires_human_review`.
5. Hash the ordered input memory hashes, policy version, precedence rule IDs,
   source watermarks, and decisions into `audit_hash`.

No LLM call participates in the winning decision. An LLM may summarize the
already-compiled card for user experience, but the stored `visible_summary`
must be generated from deterministic templates.

## Guardrails for autonomous agents

- `maxConflictDetectionDepth`: default 1, hard cap 2. A conflict resolution job
  cannot recursively trigger another unbounded conflict resolution job.
- `maxVectorTopK`: default 20, hard cap 100 per request.
- `maxCandidateMemoriesPerConflict`: default 50, hard cap 200.
- `estimated_rows_scanned` over the tenant budget rejects the mutation before
  row, columnar, or vector work is scheduled.
- Tool-related memories require an active purpose boundary and consent envelope
  before they can be marked `active`.
- Conflict cards include forbidden behaviors, such as "do not invoke bulk board
  mutations" or "ask for human approval before using this tool scope."

## Auditability

Each resolution emits an append-only audit event:

```ts
interface MemoryConflictAuditEvent {
  account_id: string;
  audit_event_id: string;
  resolution_id: string;
  actor_type: "system" | "user" | "service";
  policy_version: string;
  ordered_input_memory_hashes: string[];
  decision_hashes: string[];
  previous_audit_hash?: string;
  audit_hash: string;
  emitted_at: string;
}
```

Audit hashes intentionally exclude raw redacted values and embeddings. They
include stable references and policy versions so enterprise support can replay
why an agent saw one instruction while another was suppressed.

## Performance check

Potential full-table-scan risks and mitigations:

- Conflict detection by `semantic_tags` alone can scan too broadly. Require
  `account_id`, `purpose_boundary_id`, and either `board_id`, `entity_ref`, or a
  bounded HNSW candidate set.
- GIN tag filters must not be used as the first tenant filter. Apply the
  account/purpose/board lookup index before tag intersection.
- Async sweeps over memory records must shard by `(account_id, board_id)` and
  source watermarks; never run a global memory comparison job.
- GraphQL pagination must use `(account_id, conflict_id)` or
  `(account_id, compiled_at, resolution_id)` cursors, not offset scans.

## Agent perception

Agents should perceive memory conflicts as compact, explainable cards:

```json
{
  "resolutionId": "res_123",
  "visibleSummary": "Use the Q3 renewal procedure; an older Q2 procedure was suppressed because its source watermark is stale.",
  "semanticTags": ["renewal", "enterprise-account"],
  "procedureMemoryRefs": ["proc_q3_renewal"],
  "suggestedAgentBehavior": ["follow active procedure", "cite suppressed memory count when explaining uncertainty"],
  "forbiddenAgentBehavior": ["do not use suppressed procedure steps", "do not call bulk_update without review"],
  "auditHash": "sha256:..."
}
```

This lets an LLM reason over the safe, active instruction set without guessing
which memory is authoritative.
