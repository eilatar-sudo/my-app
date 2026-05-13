# Agentic Semantic Cache Plane for mondayDB

## Why before how: latency needs deterministic freshness

mondayDB can become the premier agentic database only if agents can retrieve
context repeatedly without paying the full cost of row reads, columnar scans, and
HNSW searches on every turn. The product trade-off is **latency vs.
freshness**:

- Agents need sub-second repeated context loads while they plan, verify, and
  execute workflows.
- Enterprise customers need deterministic answers, tenant isolation, audit
  replay, and clear invalidation when source data changes.
- mondayDB must not let probabilistic agents create unbounded semantic caches
  that hide stale or over-broad data access.

The agentic semantic cache plane stores short-lived, tenant-scoped retrieval
bundles that are produced from verified query plans and immutable source
watermarks. It improves "blink-of-an-eye" agent loops without changing the
database engine's deterministic contract: cache hits are allowed only when
`account_id`, policy hash, source watermark, budget envelope, and semantic query
hash all match.

## Product promise

For repeated agent requests, mondayDB can answer:

1. **CACHE_HIT** with a deterministic bundle of memory, row, columnar, and vector
   references that was previously verified.
2. **CACHE_MISS** with explicit miss reasons and the safe path to recompute.
3. **CACHE_STALE** when source events, policies, embeddings, or budget envelopes
   have advanced beyond the cached watermark.

This gives agents a fast context layer while preserving enterprise-grade
predictability. An LLM perceives the cache as a bounded "working context packet"
with metadata tags and procedural hints, not as permission to bypass query
planning, access policy, or audit.

## Core concepts

### 1. Semantic cache key

The cache key is deterministic. It never stores raw prompt text as a lookup key;
instead it stores hashes of normalized intent, query text, policy, and plan
inputs.

```ts
export type AgenticCachePurpose =
  | "ANSWER_CONTEXT"
  | "PLAN_CONTEXT"
  | "TOOL_CONTEXT"
  | "MEMORY_RECALL"
  | "VERIFICATION_CONTEXT";

export interface AgenticSemanticCacheKey {
  accountId: string;
  cacheKeyId: string;
  purpose: AgenticCachePurpose;
  subjectRef: string;
  boardIds: string[];
  actorRef: string;
  policyHash: string;
  budgetEnvelopeHash: string;
  normalizedIntentHash: string;
  semanticQueryHash: string;
  requiredMetadataTags: string[];
  embeddingSpace: string;
  embeddingModel: string;
  embeddingDimensions: number;
  topK: number;
  maxRecursiveHops: number;
  hnswEfSearch: number;
  createdAt: string;
}
```

The key makes procedural memory explicit by binding a cache entry to a purpose,
policy, budget, and bounded retrieval shape. mondayDB does not infer that a cache
created for answer context is also valid for writes or tool execution.

### 2. Retrieval bundle

A retrieval bundle stores references and compact snippets, not an unbounded copy
of board data. Each reference is scoped by `account_id` and tied to the source
watermark used at creation time.

```ts
export type AgenticCacheStatus =
  | "ACTIVE"
  | "STALE"
  | "EVICTED"
  | "QUARANTINED";

export type AgenticBundleRefKind =
  | "ROW_ITEM"
  | "COLUMNAR_SEGMENT"
  | "MEMORY_CAPSULE"
  | "PROCEDURE_STEP"
  | "TOOL_OUTCOME"
  | "POLICY_HINT";

export interface AgenticSemanticCacheEntry {
  accountId: string;
  cacheEntryId: string;
  cacheKeyId: string;
  status: AgenticCacheStatus;
  purpose: AgenticCachePurpose;
  subjectRef: string;
  actorRef: string;
  boardIds: string[];
  metadataTags: string[];
  sourceWatermark: AgenticCacheWatermark;
  guardrails: AgenticCacheGuardrails;
  bundle: AgenticRetrievalBundle;
  audit: AgenticCacheAudit;
  expiresAt: string;
  createdAt: string;
  lastHitAt?: string;
}

export interface AgenticRetrievalBundle {
  bundleHash: string;
  summary: string;
  refs: AgenticBundleRef[];
  procedureHints: AgenticProcedureHint[];
  semanticEvidence: AgenticSemanticEvidence[];
  plannerCostUnits: number;
  vectorCandidatesVisited: number;
  rowRefsReturned: number;
  columnarSegmentsTouched: number;
}

export interface AgenticBundleRef {
  kind: AgenticBundleRefKind;
  refId: string;
  boardId?: string;
  itemId?: string;
  columnId?: string;
  memoryNamespace?: string;
  score?: number;
  metadataTags: string[];
  sourceHash: string;
}

export interface AgenticProcedureHint {
  hintId: string;
  instruction: string;
  requiredCapabilityRef?: string;
  maxRowsTouched: number;
  maxToolCalls: number;
  maxRecursiveHops: number;
  confidenceSource: "HUMAN_AUTHORED" | "VERIFIED_OUTCOME" | "COMPACTED_MEMORY";
}

export interface AgenticSemanticEvidence {
  evidenceId: string;
  embeddingId: string;
  embeddingSpace: string;
  score: number;
  sourceRef: string;
  sourceHash: string;
  metadataTags: string[];
}

export interface AgenticCacheWatermark {
  rowEventHighWatermark: string;
  columnarSnapshotId: string;
  memoryCompactionWatermark?: string;
  semanticIndexEpoch: number;
  policyVersion: number;
  sourceHash: string;
}

export interface AgenticCacheGuardrails {
  maxAgeSeconds: number;
  maxRowsTouched: number;
  maxColumnarSegmentsTouched: number;
  maxVectorCandidatesVisited: number;
  maxTopK: number;
  maxRecursiveHops: number;
  maxToolCallsFromHints: number;
  denyIfPolicyChanges: boolean;
}

export interface AgenticCacheAudit {
  requestId: string;
  planId?: string;
  verificationId?: string;
  createdByActorId: string;
  previousAuditHash?: string;
  cacheKeyHash: string;
  bundleHash: string;
  auditHash: string;
}
```

The bundle is agent-ready because it labels each item with metadata tags,
semantic evidence, and procedural hints. It remains deterministic because the
bundle can be replayed from source hashes and watermarks.

### 3. Cache lookup result

Every lookup returns a reasoned decision. The data layer does not silently fall
back to broader reads.

```ts
export type AgenticSemanticCacheDecision =
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "CACHE_STALE"
  | "CACHE_DENIED";

export type AgenticSemanticCacheReason =
  | "NO_ENTRY"
  | "ACCOUNT_SCOPE_REQUIRED"
  | "POLICY_HASH_MISMATCH"
  | "BUDGET_ENVELOPE_MISMATCH"
  | "SOURCE_WATERMARK_ADVANCED"
  | "SEMANTIC_INDEX_EPOCH_ADVANCED"
  | "TOP_K_EXCEEDED"
  | "RECURSION_DEPTH_EXCEEDED"
  | "VECTOR_CANDIDATE_LIMIT_EXCEEDED"
  | "ENTRY_EXPIRED"
  | "ENTRY_QUARANTINED";

export interface AgenticSemanticCacheLookup {
  accountId: string;
  lookupId: string;
  cacheKey: AgenticSemanticCacheKey;
  decision: AgenticSemanticCacheDecision;
  reasons: AgenticSemanticCacheReason[];
  entry?: AgenticSemanticCacheEntry;
  recomputePlan?: AgenticCacheRecomputePlan;
  deterministicTraceId: string;
  auditHash: string;
  createdAt: string;
}

export interface AgenticCacheRecomputePlan {
  accountId: string;
  recomputePlanId: string;
  requiredExecutionEnvelopeRef: string;
  estimatedPlannerCostUnits: number;
  estimatedVectorCandidates: number;
  estimatedRowsTouched: number;
  requiredWatermarkRefresh: boolean;
  reasonCodes: AgenticSemanticCacheReason[];
}
```

## SQL schema

The row store owns cache metadata and audit decisions. Large payloads can be
stored in object storage, but metadata required for invalidation and lookup must
remain in tenant-prefixed relational tables.

```sql
CREATE TABLE agentic_semantic_cache_keys (
  account_id                BIGINT       NOT NULL,
  cache_key_id              UUID         NOT NULL,
  purpose                   TEXT         NOT NULL,
  subject_ref               TEXT         NOT NULL,
  actor_ref                 TEXT         NOT NULL,
  policy_hash               TEXT         NOT NULL,
  budget_envelope_hash      TEXT         NOT NULL,
  normalized_intent_hash    TEXT         NOT NULL,
  semantic_query_hash       TEXT         NOT NULL,
  required_metadata_tags    TEXT[]       NOT NULL,
  embedding_space           TEXT         NOT NULL,
  embedding_model           TEXT         NOT NULL,
  embedding_dimensions      INTEGER      NOT NULL,
  top_k                     INTEGER      NOT NULL,
  max_recursive_hops        INTEGER      NOT NULL,
  hnsw_ef_search            INTEGER      NOT NULL,
  board_ids                 BIGINT[]     NOT NULL,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, cache_key_id),
  UNIQUE (
    account_id,
    purpose,
    subject_ref,
    actor_ref,
    policy_hash,
    budget_envelope_hash,
    normalized_intent_hash,
    semantic_query_hash,
    embedding_space,
    top_k,
    max_recursive_hops
  )
);

CREATE TABLE agentic_semantic_cache_entries (
  account_id                         BIGINT       NOT NULL,
  cache_entry_id                     UUID         NOT NULL,
  cache_key_id                       UUID         NOT NULL,
  status                             TEXT         NOT NULL,
  purpose                            TEXT         NOT NULL,
  subject_ref                        TEXT         NOT NULL,
  actor_ref                          TEXT         NOT NULL,
  board_ids                          BIGINT[]     NOT NULL,
  metadata_tags                      TEXT[]       NOT NULL,
  row_event_high_watermark           UUID         NOT NULL,
  columnar_snapshot_id               UUID         NOT NULL,
  memory_compaction_watermark        UUID,
  semantic_index_epoch               BIGINT       NOT NULL,
  policy_version                     BIGINT       NOT NULL,
  source_hash                        TEXT         NOT NULL,
  summary                            TEXT         NOT NULL,
  bundle_hash                        TEXT         NOT NULL,
  bundle_payload_ref                 TEXT         NOT NULL,
  planner_cost_units                 INTEGER      NOT NULL,
  vector_candidates_visited          INTEGER      NOT NULL,
  row_refs_returned                  INTEGER      NOT NULL,
  columnar_segments_touched          INTEGER      NOT NULL,
  max_age_seconds                    INTEGER      NOT NULL,
  max_rows_touched                   INTEGER      NOT NULL,
  max_columnar_segments_touched      INTEGER      NOT NULL,
  max_vector_candidates_visited      INTEGER      NOT NULL,
  max_top_k                          INTEGER      NOT NULL,
  max_recursive_hops                 INTEGER      NOT NULL,
  max_tool_calls_from_hints          INTEGER      NOT NULL,
  deny_if_policy_changes             BOOLEAN      NOT NULL DEFAULT true,
  request_id                         UUID         NOT NULL,
  plan_id                            UUID,
  verification_id                    UUID,
  created_by_actor_id                BIGINT       NOT NULL,
  previous_audit_hash                TEXT,
  cache_key_hash                     TEXT         NOT NULL,
  audit_hash                         TEXT         NOT NULL,
  expires_at                         TIMESTAMPTZ  NOT NULL,
  created_at                         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_hit_at                        TIMESTAMPTZ,
  PRIMARY KEY (account_id, cache_entry_id),
  FOREIGN KEY (account_id, cache_key_id)
    REFERENCES agentic_semantic_cache_keys (account_id, cache_key_id)
);

CREATE TABLE agentic_semantic_cache_refs (
  account_id          BIGINT      NOT NULL,
  cache_entry_id      UUID        NOT NULL,
  ref_id              TEXT        NOT NULL,
  kind                TEXT        NOT NULL,
  board_id            BIGINT,
  item_id             BIGINT,
  column_id           TEXT,
  memory_namespace    TEXT,
  score               DOUBLE PRECISION,
  metadata_tags       TEXT[]      NOT NULL,
  source_hash         TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, cache_entry_id, ref_id),
  FOREIGN KEY (account_id, cache_entry_id)
    REFERENCES agentic_semantic_cache_entries (account_id, cache_entry_id)
);

CREATE TABLE agentic_semantic_cache_audit_events (
  account_id           BIGINT      NOT NULL,
  audit_event_id       UUID        NOT NULL,
  cache_entry_id       UUID,
  lookup_id            UUID,
  event_type           TEXT        NOT NULL,
  reason_codes         TEXT[]      NOT NULL,
  deterministic_trace_id TEXT      NOT NULL,
  previous_audit_hash  TEXT,
  audit_hash           TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);
```

Operational indexes:

```sql
CREATE INDEX idx_agentic_cache_key_lookup
  ON agentic_semantic_cache_keys (
    account_id,
    purpose,
    subject_ref,
    actor_ref,
    policy_hash,
    budget_envelope_hash,
    semantic_query_hash
  );

CREATE INDEX idx_agentic_cache_active_expiry
  ON agentic_semantic_cache_entries (account_id, status, expires_at)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_agentic_cache_watermark
  ON agentic_semantic_cache_entries (
    account_id,
    subject_ref,
    semantic_index_epoch,
    policy_version,
    row_event_high_watermark
  );

CREATE INDEX idx_agentic_cache_ref_board_item
  ON agentic_semantic_cache_refs (
    account_id,
    board_id,
    item_id,
    kind
  );
```

If pgvector is used to support similarity among cache bundles, the vector table
must still partition or prefix by tenant:

```sql
CREATE TABLE agentic_semantic_cache_embeddings (
  account_id       BIGINT       NOT NULL,
  cache_entry_id   UUID         NOT NULL,
  embedding_space  TEXT         NOT NULL,
  embedding        vector(1536) NOT NULL,
  metadata_tags    TEXT[]       NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, cache_entry_id),
  FOREIGN KEY (account_id, cache_entry_id)
    REFERENCES agentic_semantic_cache_entries (account_id, cache_entry_id)
);

CREATE INDEX idx_agentic_cache_embedding_hnsw
  ON agentic_semantic_cache_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The HNSW index is never queried without an `account_id` filter and a bounded
`top_k`. For large tenants, use per-tenant or hash-partitioned vector indexes to
avoid neighbor interference.

## Open API GraphQL surface

Every operation requires `accountId`. The GraphQL layer must reject requests that
omit tenant scope before they reach storage.

```graphql
enum AgenticCachePurpose {
  ANSWER_CONTEXT
  PLAN_CONTEXT
  TOOL_CONTEXT
  MEMORY_RECALL
  VERIFICATION_CONTEXT
}

enum AgenticSemanticCacheDecision {
  CACHE_HIT
  CACHE_MISS
  CACHE_STALE
  CACHE_DENIED
}

input AgenticSemanticCacheLookupInput {
  accountId: ID!
  purpose: AgenticCachePurpose!
  subjectRef: String!
  actorRef: String!
  boardIds: [ID!]!
  policyHash: String!
  budgetEnvelopeHash: String!
  normalizedIntentHash: String!
  semanticQueryHash: String!
  requiredMetadataTags: [String!]!
  embeddingSpace: String!
  embeddingModel: String!
  embeddingDimensions: Int!
  topK: Int!
  maxRecursiveHops: Int!
  hnswEfSearch: Int!
}

type AgenticBundleRef {
  kind: String!
  refId: String!
  boardId: ID
  itemId: ID
  columnId: String
  score: Float
  metadataTags: [String!]!
  sourceHash: String!
}

type AgenticProcedureHint {
  hintId: ID!
  instruction: String!
  requiredCapabilityRef: String
  maxRowsTouched: Int!
  maxToolCalls: Int!
  maxRecursiveHops: Int!
  confidenceSource: String!
}

type AgenticRetrievalBundle {
  bundleHash: String!
  summary: String!
  refs: [AgenticBundleRef!]!
  procedureHints: [AgenticProcedureHint!]!
  plannerCostUnits: Int!
  vectorCandidatesVisited: Int!
  rowRefsReturned: Int!
  columnarSegmentsTouched: Int!
}

type AgenticSemanticCacheLookupResult {
  accountId: ID!
  lookupId: ID!
  decision: AgenticSemanticCacheDecision!
  reasons: [String!]!
  bundle: AgenticRetrievalBundle
  recomputePlanId: ID
  deterministicTraceId: ID!
  auditHash: String!
  createdAt: String!
}

type Query {
  agenticSemanticCacheLookup(
    input: AgenticSemanticCacheLookupInput!
  ): AgenticSemanticCacheLookupResult!
}

type Mutation {
  agenticSemanticCacheCommit(
    accountId: ID!
    verificationId: ID!
    cacheKeyId: ID!
    bundleHash: String!
    bundlePayloadRef: String!
    sourceHash: String!
    expiresAt: String!
  ): AgenticSemanticCacheLookupResult!

  agenticSemanticCacheInvalidate(
    accountId: ID!
    subjectRef: String!
    reason: String!
    rowEventHighWatermark: ID
    semanticIndexEpoch: Int
    policyVersion: Int
  ): AgenticSemanticCacheLookupResult!
}
```

## Deterministic lookup flow

1. Validate `account_id`, `top_k`, recursion depth, HNSW `ef_search`, and budget
   envelope before reading cache rows.
2. Build the normalized cache key from structured inputs. Do not include raw LLM
   prompts except as hashes.
3. Read `agentic_semantic_cache_keys` by tenant-prefixed unique key.
4. Read active entries by `(account_id, cache_key_id, status)` and compare
   expiration, policy version, semantic index epoch, and row-event watermark.
5. Return a hit only if bundle guardrails are at least as strict as the request.
6. Write an audit event for hit, miss, stale, denied, commit, and invalidation.

Cache hits should be read-only. Any write, tool call, or recursive retrieval must
pass through plan verification again using the bundle as evidence, not authority.

## Invalidation model

Invalidation is deterministic and source-driven:

- Row updates advance `row_event_high_watermark` for the affected account, board,
  item, or subject reference.
- Columnar compaction creates a new `columnar_snapshot_id`; cache entries bound
  to older snapshots become stale for analytic answers.
- Memory compaction advances `memory_compaction_watermark`; procedural hints from
  older capsules are stale unless explicitly pinned by policy.
- Semantic reindexing increments `semantic_index_epoch`; HNSW-derived cache
  entries from prior epochs become stale.
- Access-policy changes increment `policy_version`; entries with
  `deny_if_policy_changes = true` are denied rather than served stale.

No invalidation rule relies on an LLM deciding that content "seems related."

## Performance check for 1M+ row boards

Potential full-scan risks and mitigations:

- **Risk: cache lookup by prompt text.** Use hashed structured keys and the
  tenant-prefixed unique index instead of scanning summaries or payload refs.
- **Risk: invalidating all entries for a board on every item update.** Track
  source refs in `agentic_semantic_cache_refs` and invalidate by
  `(account_id, board_id, item_id, kind)` where possible.
- **Risk: vector search across tenants.** Partition cache embeddings by
  `account_id` or enforce a tenant prefilter before HNSW candidate expansion.
- **Risk: unbounded repeated misses.** Return a recompute plan with budget
  estimates and rate-limit by `(account_id, actor_ref, semantic_query_hash)`.
- **Risk: stale cache hiding expensive context.** Store
  `vector_candidates_visited`, `row_refs_returned`, and
  `columnar_segments_touched`; deny hits whose recorded cost exceeds the current
  budget envelope.

The planner should reject any cache lookup or invalidation that lacks an
`account_id` predicate. On boards with more than 1M rows, do not evaluate
metadata tag filters over raw bundle JSON; index tags in relational columns or a
tenant-scoped inverted index.

## Agentic guardrails

- Require `request.top_k <= guardrails.max_top_k` and
  `request.max_recursive_hops <= guardrails.max_recursive_hops` before serving a
  cache hit.
- Cap HNSW `ef_search` per tenant budget to prevent one agent from expanding too
  many vector candidates.
- Do not let a cache bundle trigger another cache lookup unless the verified plan
  contains an explicit recursion budget.
- Treat procedure hints as suggestions that must be re-verified before execution.
- Quarantine entries whose source hashes fail replay, whose policy hash no longer
  matches, or whose bundle payload cannot be fetched deterministically.

## Auditability

Each audit hash should be computed from stable fields:

```text
audit_hash = sha256(
  account_id ||
  event_type ||
  cache_key_hash ||
  bundle_hash ||
  source_hash ||
  reason_codes ||
  deterministic_trace_id ||
  previous_audit_hash
)
```

This lets enterprise admins replay why a cached context was served, denied, or
marked stale. The audit event should reference the plan verification id when the
cache was created from a verified agent plan.

## Rollout path

1. Start with read-through caching for semantic memory retrieval only.
2. Add row and columnar refs after cache hit auditing proves deterministic replay.
3. Enable cache-bundle embeddings for repeated context packets with strict
   tenant partitioning.
4. Expose GraphQL lookup and invalidation in the monday.com Open API behind
   policy-controlled agent scopes.
5. Promote procedure hints only when they originate from human-authored
   capabilities or verified outcomes.

This sequence prioritizes enterprise stability over hidden intelligence. It
lowers agent latency while keeping mondayDB deterministic, auditable, and safe
for multi-tenant scale.
