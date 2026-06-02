# mondayDB Agentic Memory Promotion Plane

## Why this plane exists

mondayDB already stores the work graph: boards, items, updates, automations,
files, and activity streams. Agents need a stable way to learn from that graph
without turning the database engine into a probabilistic system.

The memory promotion plane defines how tenant-scoped operational signals become
durable semantic or procedural memory. It keeps row writes fast and ACID-safe by
promoting memory asynchronously from deterministic change events, while still
giving agents fresher context than periodic offline exports.

The core product trade-off is freshness versus write-path stability:

- Synchronous promotion would give agents the newest possible memory, but it
  would add embedding, policy, and review latency to user-facing writes.
- Asynchronous promotion introduces bounded lag, but preserves mondayDB's
  low-latency transaction path and gives enterprise customers replayable,
  inspectable decisions.

This plane chooses asynchronous deterministic promotion with explicit
watermarks, review states, and audit hashes.

## Scope

In scope:

- Capture candidate memories from tenant-scoped row, columnar, event, tool, and
  feedback sources.
- Classify candidates as semantic, procedural, policy, or evidence memory.
- Produce pgvector/HNSW-compatible embedding records without mixing tenants.
- Expose every candidate, review, and commit through the monday.com Open API
  GraphQL surface.
- Guard agents from repeatedly promoting, retrieving, or acting on the same
  high-cost signal loop.

Out of scope:

- Replacing the row store, columnar store, or transaction manager.
- Letting an LLM mutate mondayDB state without deterministic preflight and audit.
- Global cross-account memory pools.

## Core invariants

1. Every persisted row includes `account_id`; every API resolver derives it from
   the authenticated tenant context.
2. Promotion starts from immutable source references and source watermarks, not
   from ad hoc board scans.
3. Extractor versions, model versions, policy versions, and reviewer decisions
   are part of the promoted record.
4. A candidate can be promoted only through a deterministic state transition.
5. Embeddings are secondary indexes over deterministic memory text, never the
   source of truth.
6. Promotion jobs run behind workload budgets so a noisy agent cannot consume
   neighbor capacity.
7. Audit hashes are deterministic and chained per account.

## TypeScript contracts

```ts
type MemoryKind =
  | "semantic_fact"
  | "procedural_instruction"
  | "policy_hint"
  | "evidence_packet";

type PromotionState =
  | "candidate"
  | "needs_review"
  | "approved"
  | "rejected"
  | "promoted"
  | "expired";

type SourceKind =
  | "board_item"
  | "board_update"
  | "activity_event"
  | "automation_run"
  | "tool_result"
  | "feedback_event";

interface MemoryPromotionSourceRef {
  accountId: string;
  sourceKind: SourceKind;
  boardId?: string;
  itemId?: string;
  updateId?: string;
  eventId: string;
  sourceVersion: string;
  sourceWatermark: string;
  visibilityScope: "account" | "board" | "item" | "private";
}

interface PromotionSignal {
  accountId: string;
  signalId: string;
  sourceRef: MemoryPromotionSourceRef;
  extractorVersion: string;
  signalType:
    | "repeated_resolution"
    | "stable_preference"
    | "approved_workflow"
    | "verified_fact"
    | "tool_success_pattern"
    | "agent_failure_pattern";
  deterministicScore: number;
  evidenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface MemoryPromotionCandidate {
  accountId: string;
  candidateId: string;
  memoryKind: MemoryKind;
  state: PromotionState;
  sourceRefs: MemoryPromotionSourceRef[];
  canonicalText: string;
  metadataTags: string[];
  language: string;
  deterministicFingerprint: string;
  extractorVersion: string;
  policyVersion: string;
  modelVersion?: string;
  confidenceBasis: {
    signalIds: string[];
    evidenceCount: number;
    reviewerRequired: boolean;
    promotionReason: string;
  };
  createdAt: string;
  expiresAt?: string;
}

interface PromotionPolicy {
  accountId: string;
  policyId: string;
  policyVersion: string;
  memoryKind: MemoryKind;
  boardId?: string;
  minEvidenceCount: number;
  minDeterministicScore: number;
  requiresHumanReview: boolean;
  maxPromotionsPerHour: number;
  ttlSeconds?: number;
  allowedSourceKinds: SourceKind[];
  blockedMetadataTags: string[];
}

interface PromotionReviewDecision {
  accountId: string;
  candidateId: string;
  decisionId: string;
  reviewerUserId?: string;
  reviewerAgentId?: string;
  decision: "approve" | "reject" | "request_changes";
  reasonCode: string;
  deterministicDecisionHash: string;
  decidedAt: string;
}

interface PromotedMemoryRecord {
  accountId: string;
  memoryId: string;
  candidateId: string;
  memoryKind: MemoryKind;
  canonicalText: string;
  metadataTags: string[];
  sourceRefs: MemoryPromotionSourceRef[];
  embeddingRef?: {
    vectorId: string;
    embeddingModel: string;
    hnswPartition: string;
  };
  procedureRef?: {
    procedureId: string;
    procedureVersion: string;
    preconditions: string[];
    expectedOutputs: string[];
  };
  sourceWatermark: string;
  auditHash: string;
  promotedAt: string;
}

interface MemoryPromotionAuditEvent {
  accountId: string;
  auditEventId: string;
  candidateId: string;
  transition:
    | "signal_created"
    | "candidate_created"
    | "policy_evaluated"
    | "review_recorded"
    | "memory_promoted"
    | "candidate_expired";
  actorType: "system" | "user" | "agent";
  actorId: string;
  inputHash: string;
  outputHash: string;
  previousAuditHash?: string;
  createdAt: string;
}
```

## SQL schema

The schema uses `account_id` as the leading key for tenant isolation and query
planning. In production, large tables should be hash-partitioned by `account_id`
or placed in tenant-local shards before adding HNSW indexes.

```sql
CREATE TABLE agentic_memory_promotion_signals (
  account_id BIGINT NOT NULL,
  signal_id UUID NOT NULL,
  source_kind TEXT NOT NULL,
  board_id BIGINT,
  item_id BIGINT,
  update_id BIGINT,
  event_id UUID NOT NULL,
  source_version TEXT NOT NULL,
  source_watermark TEXT NOT NULL,
  visibility_scope TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  deterministic_score NUMERIC(8, 6) NOT NULL,
  evidence_count INTEGER NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, signal_id)
);

CREATE INDEX agentic_memory_signals_source_idx
  ON agentic_memory_promotion_signals (
    account_id,
    source_kind,
    board_id,
    item_id,
    source_watermark
  );

CREATE INDEX agentic_memory_signals_type_idx
  ON agentic_memory_promotion_signals (
    account_id,
    signal_type,
    last_seen_at DESC
  );

CREATE TABLE agentic_memory_promotion_candidates (
  account_id BIGINT NOT NULL,
  candidate_id UUID NOT NULL,
  memory_kind TEXT NOT NULL,
  state TEXT NOT NULL,
  canonical_text TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  language TEXT NOT NULL,
  deterministic_fingerprint BYTEA NOT NULL,
  extractor_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  model_version TEXT,
  confidence_basis JSONB NOT NULL,
  source_refs JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, candidate_id),
  UNIQUE (account_id, deterministic_fingerprint)
);

CREATE INDEX agentic_memory_candidates_state_idx
  ON agentic_memory_promotion_candidates (
    account_id,
    state,
    memory_kind,
    created_at DESC
  );

CREATE INDEX agentic_memory_candidates_tags_idx
  ON agentic_memory_promotion_candidates
  USING GIN (metadata_tags);

CREATE TABLE agentic_memory_promotion_policies (
  account_id BIGINT NOT NULL,
  policy_id UUID NOT NULL,
  policy_version TEXT NOT NULL,
  memory_kind TEXT NOT NULL,
  board_id BIGINT,
  min_evidence_count INTEGER NOT NULL,
  min_deterministic_score NUMERIC(8, 6) NOT NULL,
  requires_human_review BOOLEAN NOT NULL,
  max_promotions_per_hour INTEGER NOT NULL,
  ttl_seconds INTEGER,
  allowed_source_kinds TEXT[] NOT NULL,
  blocked_metadata_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, policy_id, policy_version)
);

CREATE INDEX agentic_memory_policies_lookup_idx
  ON agentic_memory_promotion_policies (
    account_id,
    memory_kind,
    board_id,
    updated_at DESC
  );

CREATE TABLE agentic_memory_promotion_reviews (
  account_id BIGINT NOT NULL,
  candidate_id UUID NOT NULL,
  decision_id UUID NOT NULL,
  reviewer_user_id BIGINT,
  reviewer_agent_id UUID,
  decision TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  deterministic_decision_hash BYTEA NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, candidate_id, decision_id)
);

CREATE INDEX agentic_memory_reviews_decided_idx
  ON agentic_memory_promotion_reviews (
    account_id,
    decision,
    decided_at DESC
  );

CREATE TABLE agentic_promoted_memories (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  memory_kind TEXT NOT NULL,
  canonical_text TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_refs JSONB NOT NULL,
  source_watermark TEXT NOT NULL,
  procedure_id UUID,
  procedure_version TEXT,
  audit_hash BYTEA NOT NULL,
  promoted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, memory_id),
  UNIQUE (account_id, candidate_id)
);

CREATE INDEX agentic_promoted_memories_kind_idx
  ON agentic_promoted_memories (
    account_id,
    memory_kind,
    promoted_at DESC
  );

CREATE INDEX agentic_promoted_memories_tags_idx
  ON agentic_promoted_memories
  USING GIN (metadata_tags);

CREATE TABLE agentic_memory_promotion_audit_log (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  transition TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  input_hash BYTEA NOT NULL,
  output_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agentic_memory_audit_candidate_idx
  ON agentic_memory_promotion_audit_log (
    account_id,
    candidate_id,
    created_at
  );
```

### Optional pgvector/HNSW table

The vector table is tenant-partitioned. A global HNSW index without tenant
partitioning is not acceptable because approximate search can otherwise inspect
neighbor vectors from other accounts before filtering.

```sql
CREATE TABLE agentic_promoted_memory_embeddings (
  account_id BIGINT NOT NULL,
  vector_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, vector_id),
  UNIQUE (account_id, memory_id, embedding_model)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_memory_embedding_lookup_idx
  ON agentic_promoted_memory_embeddings (
    account_id,
    memory_id,
    embedding_model
  );

-- Create one HNSW index per account-hash partition or physical tenant shard.
-- The planner must prune partitions by account_id before approximate search.
CREATE INDEX agentic_memory_embedding_hnsw_idx
  ON agentic_promoted_memory_embeddings_p00
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

## Open API GraphQL surface

All resolvers read `account_id` from the auth context. Client-supplied account
identifiers are rejected unless they match the authenticated tenant.

```graphql
enum AgenticMemoryKind {
  SEMANTIC_FACT
  PROCEDURAL_INSTRUCTION
  POLICY_HINT
  EVIDENCE_PACKET
}

enum AgenticPromotionState {
  CANDIDATE
  NEEDS_REVIEW
  APPROVED
  REJECTED
  PROMOTED
  EXPIRED
}

type AgenticMemorySourceRef {
  sourceKind: String!
  boardId: ID
  itemId: ID
  updateId: ID
  eventId: ID!
  sourceVersion: String!
  sourceWatermark: String!
  visibilityScope: String!
}

type AgenticMemoryPromotionCandidate {
  id: ID!
  memoryKind: AgenticMemoryKind!
  state: AgenticPromotionState!
  sourceRefs: [AgenticMemorySourceRef!]!
  canonicalText: String!
  metadataTags: [String!]!
  deterministicFingerprint: String!
  extractorVersion: String!
  policyVersion: String!
  confidenceBasis: JSON!
  createdAt: DateTime!
  expiresAt: DateTime
}

type AgenticPromotedMemory {
  id: ID!
  candidateId: ID!
  memoryKind: AgenticMemoryKind!
  canonicalText: String!
  metadataTags: [String!]!
  sourceRefs: [AgenticMemorySourceRef!]!
  sourceWatermark: String!
  auditHash: String!
  promotedAt: DateTime!
}

input AgenticMemoryPromotionFilter {
  boardId: ID
  itemId: ID
  memoryKind: AgenticMemoryKind
  state: AgenticPromotionState
  metadataTags: [String!]
  createdAfter: DateTime
  limit: Int = 50
}

input AgenticPromotionReviewInput {
  candidateId: ID!
  decision: String!
  reasonCode: String!
  expectedFingerprint: String!
}

type AgenticMemoryPromotionMutationPayload {
  candidate: AgenticMemoryPromotionCandidate!
  auditHash: String!
}

extend type Query {
  agenticMemoryPromotionCandidates(
    filter: AgenticMemoryPromotionFilter!
  ): [AgenticMemoryPromotionCandidate!]!

  agenticPromotedMemories(
    memoryKind: AgenticMemoryKind
    metadataTags: [String!]
    queryText: String
    topK: Int = 10
  ): [AgenticPromotedMemory!]!
}

extend type Mutation {
  reviewAgenticMemoryPromotion(
    input: AgenticPromotionReviewInput!
  ): AgenticMemoryPromotionMutationPayload!

  expireAgenticPromotedMemory(
    memoryId: ID!
    reasonCode: String!
  ): AgenticMemoryPromotionMutationPayload!
}
```

GraphQL resolver rules:

- `limit` is capped at 100 for candidates and 25 for semantic retrieval.
- `topK` is capped per account plan and defaults to 10.
- `metadataTags` must use indexed tag filters when present.
- `queryText` retrieval requires an embedding budget reservation.
- Candidate queries without `boardId`, `itemId`, `state`, or `createdAfter` are
  rejected for accounts with large boards.

## Promotion flow

1. **Capture source event**
   - The row store commits the user or automation write.
   - The change feed records immutable source refs and account-scoped
     watermarks.
   - No embedding or LLM call runs in the transaction path.

2. **Extract deterministic signals**
   - A versioned extractor reads bounded event windows by `(account_id,
     source_watermark)`.
   - Signals are produced from deterministic rules, such as repeated successful
     resolutions or approved workflow patterns.
   - LLM-assisted summarization can propose `canonical_text`, but the extractor
     version, prompt version, input hash, and output hash are persisted.

3. **Evaluate promotion policy**
   - The policy engine evaluates evidence counts, scores, allowed source kinds,
     blocked tags, and hourly caps.
   - Candidates that affect tool execution, permissions, or policy hints require
     human review by default.

4. **Generate semantic index payload**
   - Approved candidates are embedded from `canonical_text` plus selected
     metadata tags.
   - The embedding payload includes account, visibility, source watermark,
     memory kind, and expiry metadata.

5. **Commit promoted memory**
   - The promoted record is written transactionally with its embedding ref,
     procedure ref when applicable, and audit hash.
   - Vector indexes remain secondary. If vector indexing lags, agents can still
     read the promoted memory by ID or deterministic filters.

## Performance check for 1M+ row boards

Potential full-scan risks and required mitigations:

- **Risk:** Backfilling all board items to find memory candidates.
  - **Mitigation:** Use change-feed watermarks and bounded event windows by
    `account_id`, `board_id`, and `source_watermark`.
- **Risk:** Candidate review pages over all states.
  - **Mitigation:** Require `account_id` plus `state`, `memory_kind`, or
    `createdAfter`; serve from `agentic_memory_candidates_state_idx`.
- **Risk:** Unbounded semantic retrieval over promoted memories.
  - **Mitigation:** Cap `topK`, prune by account partition before HNSW, and
    prefilter by visibility and metadata tags where possible.
- **Risk:** GIN tag filters becoming a substitute for tenant filters.
  - **Mitigation:** Resolvers must always include `account_id`; tag-only scans
    are rejected in the planner.
- **Risk:** Re-embedding all memory after a model upgrade.
  - **Mitigation:** Re-embed by `(account_id, embedding_model, source_watermark)`
    batches and reserve workload budget before each batch.

Any query plan that cannot prove an `account_id` predicate before touching row,
columnar, or vector storage fails closed.

## Agentic guardrails

- **Promotion budget:** Each account has a maximum number of extraction,
  embedding, and promotion jobs per minute.
- **Loop containment:** Repeated attempts to promote the same deterministic
  fingerprint are coalesced into one candidate with incremented evidence.
- **Recursive query cap:** Agents cannot trigger promotion jobs from memories
  that were themselves created by the same agent run unless the plan verifier
  grants an explicit recursion budget.
- **Tool readiness:** Procedural memories that imply tool execution are marked
  `needs_review` until an access policy and transaction intent envelope exist.
- **Expiry discipline:** Low-confidence or transient facts receive TTLs so stale
  context does not become durable agent behavior.
- **Neighbor protection:** Embedding and extraction jobs run in the agentic
  workload class, separate from user writes and interactive board reads.

## Procedural memory integration

Procedural candidates are instructions for future agents, not hidden database
behavior. A promoted procedural memory must include:

- Preconditions the agent can verify deterministically.
- Required permissions and policy references.
- Expected outputs and failure modes.
- Source examples that justify the procedure.
- A versioned procedure reference used by plan verification.

Example procedural memory text:

```text
When an item in board 4812 has tag "blocked-by-vendor" and the latest update
contains an approved vendor ETA, draft a customer-facing status update before
changing item status. Do not execute the status change without a transaction
intent review.
```

An agent perceives this as a tagged instruction card:

```json
{
  "kind": "procedural_instruction",
  "tags": ["board:4812", "vendor", "customer-update", "requires-intent-review"],
  "preconditions": ["tag=blocked-by-vendor", "approved_vendor_eta.exists"],
  "allowedTools": ["draft_update"],
  "blockedTools": ["change_status_without_review"],
  "sourceWatermark": "account-91:events:0000009182"
}
```

## Semantic retrieval compatibility

The promotion plane is compatible with pgvector/HNSW by separating:

- `canonical_text`: deterministic memory text and the source of truth.
- `embedding`: approximate retrieval projection.
- `metadata_tags`: deterministic filters for visibility, board, item, workflow,
  and memory kind.
- `source_watermark`: freshness and invalidation anchor.

Retrieval should use this shape:

```sql
SELECT m.memory_id, m.canonical_text, m.metadata_tags, m.source_watermark
FROM agentic_promoted_memory_embeddings e
JOIN agentic_promoted_memories m USING (account_id, memory_id)
WHERE e.account_id = $1
  AND e.embedding_model = $2
  AND m.metadata_tags && $3
ORDER BY e.embedding <=> $4
LIMIT LEAST($5, 25);
```

For very large accounts, tenant-local vector shards or account-hash partitions
must be pruned before HNSW search. Post-filtering by `account_id` after a global
nearest-neighbor search is not sufficient for isolation or predictable latency.

## Auditability

Each transition writes an audit event with:

- Canonical JSON input hash.
- Canonical JSON output hash.
- Previous audit hash for the account/candidate chain.
- Actor identity.
- Extractor, policy, model, and reviewer versions.

This gives support, security, and enterprise admins a replayable answer to:

- Why did this become memory?
- Which source events supported it?
- Which policy allowed it?
- Was a human reviewer required?
- Which agents retrieved or used it later?

## Agent perception model

Agents should not see promoted memories as vague knowledge. They should see
bounded, typed, cited cards:

- `memoryKind`: tells the agent whether the card is a fact, instruction, policy
  hint, or evidence packet.
- `metadataTags`: connect memory to boards, items, teams, workflows, and
  permissions.
- `sourceRefs`: provide citations and support evidence-aware responses.
- `sourceWatermark`: lets the agent reason about freshness.
- `procedureRef`: links instructions to deterministic plan verification.
- `auditHash`: allows enterprise replay and deterministic support tooling.

This model makes memory useful for LLM context windows while keeping mondayDB's
engine deterministic and auditable.

## Rollout strategy

1. Start with read-only semantic facts from low-risk activity and feedback
   events.
2. Add human-reviewed procedural memories for approved workflows.
3. Enable policy hints only after access-policy and plan-verification planes can
   enforce them.
4. Add customer-facing GraphQL review and expiry APIs.
5. Expand to automated promotion only for policies with stable evidence counts,
   bounded TTLs, and low blast radius.

## Success metrics

- Promotion candidate generation does not add latency to row writes.
- 99th percentile candidate review queries remain bounded with account and
  state filters.
- Vector retrieval never searches across tenant partitions.
- Duplicate promotion attempts collapse by deterministic fingerprint.
- Enterprise audit replay can reproduce every promoted memory decision.
- Agents cite promoted memories with source refs in customer-visible actions.
