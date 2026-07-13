# mondayDB Agentic Vector Index Residency Plane

## Why this matters

Agentic workloads turn vector search from an occasional enrichment path into a hot
database primitive. The product trade-off is recall and freshness versus latency,
tenant isolation, and predictable cost. Keeping every embedding in the hottest
HNSW tier maximizes recall but creates noisy-neighbor risk during inserts,
rebuilds, and recursive retrieval. Keeping only a small hot set protects core
WorkOS latency but can make agents miss relevant procedural memory.

The vector index residency plane makes placement deterministic and auditable. It
decides which semantic objects, memories, and tool affordance embeddings are hot,
warm, cold, rebuilding, or quarantined for each `account_id`. The data layer stays
predictable: agents may request recall or freshness preferences, but mondayDB
compiles those preferences into explicit residency envelopes, budgets, and audit
records before any vector query runs.

## Design goals

- Preserve multi-tenant isolation by partitioning every index decision by
  `account_id` and an account-derived shard key.
- Keep row-store transactions ACID-safe while vector indexes refresh
  asynchronously from deterministic row/columnar watermarks.
- Support pgvector/HNSW-compatible metadata, including per-partition HNSW build
  parameters and recall tiers.
- Give agents an explicit perception card that explains what memory is searchable,
  stale, cold, or blocked.
- Prevent autonomous agents from recursively widening vector searches until they
  impact neighbor latency.

## TypeScript contracts

```ts
export type VectorResidencyTier =
  | "hot"
  | "warm"
  | "cold"
  | "rebuilding"
  | "quarantined";

export type VectorObjectKind =
  | "semantic_memory"
  | "procedural_memory"
  | "tool_affordance"
  | "board_item"
  | "columnar_synopsis"
  | "context_packet";

export interface VectorResidencyPolicy {
  accountId: string;
  policyId: string;
  objectKind: VectorObjectKind;
  defaultTier: VectorResidencyTier;
  hotRetentionDays: number;
  warmRetentionDays: number;
  maxHotVectors: number;
  maxWarmVectors: number;
  maxQueryTopK: number;
  maxRecursiveExpansions: number;
  minQualityScore: number;
  minFreshnessScore: number;
  hnsw: {
    partitionKey: "account_hash" | "account_board_hash";
    m: number;
    efConstruction: number;
    efSearchHot: number;
    efSearchWarm: number;
  };
  proceduralMemoryRefs: string[];
  createdAt: string;
  createdBy: "system" | "admin" | "policy_import";
}

export interface VectorResidencyAssignment {
  accountId: string;
  vectorId: string;
  objectKind: VectorObjectKind;
  objectId: string;
  boardId?: string;
  accountShard: number;
  tier: VectorResidencyTier;
  qualityScore: number;
  freshnessScore: number;
  lastAccessedAt?: string;
  sourceWatermark: {
    rowVersion: string;
    columnarSnapshotId?: string;
    embeddingModelVersion: string;
  };
  placementReason:
    | "policy_default"
    | "recent_access"
    | "procedure_pinned"
    | "quality_demoted"
    | "freshness_demoted"
    | "rebuild_in_progress"
    | "compliance_quarantine";
  assignmentHash: string;
  assignedAt: string;
}

export interface VectorResidencyQueryEnvelope {
  accountId: string;
  requesterId: string;
  purposeId: string;
  allowedTiers: VectorResidencyTier[];
  objectKinds: VectorObjectKind[];
  topK: number;
  maxEstimatedVectorReads: number;
  maxRecursiveExpansions: number;
  requireFreshnessAfter?: string;
  policyHash: string;
}

export interface VectorResidencyPerceptionCard {
  accountId: string;
  envelopeId: string;
  searchableTiers: VectorResidencyTier[];
  searchableObjectKinds: VectorObjectKind[];
  estimatedRecall: "high" | "bounded" | "degraded";
  staleVectorCount: number;
  quarantinedVectorCount: number;
  agentInstructions: string[];
  auditHash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_vector_residency_policies (
  account_id BIGINT NOT NULL,
  policy_id UUID NOT NULL,
  object_kind TEXT NOT NULL,
  default_tier TEXT NOT NULL CHECK (
    default_tier IN ('hot', 'warm', 'cold', 'rebuilding', 'quarantined')
  ),
  hot_retention_days INTEGER NOT NULL CHECK (hot_retention_days >= 0),
  warm_retention_days INTEGER NOT NULL CHECK (warm_retention_days >= 0),
  max_hot_vectors BIGINT NOT NULL CHECK (max_hot_vectors > 0),
  max_warm_vectors BIGINT NOT NULL CHECK (max_warm_vectors > 0),
  max_query_top_k INTEGER NOT NULL CHECK (max_query_top_k BETWEEN 1 AND 200),
  max_recursive_expansions INTEGER NOT NULL CHECK (max_recursive_expansions BETWEEN 0 AND 5),
  min_quality_score NUMERIC(5, 4) NOT NULL CHECK (min_quality_score BETWEEN 0 AND 1),
  min_freshness_score NUMERIC(5, 4) NOT NULL CHECK (min_freshness_score BETWEEN 0 AND 1),
  hnsw_partition_key TEXT NOT NULL CHECK (
    hnsw_partition_key IN ('account_hash', 'account_board_hash')
  ),
  hnsw_m INTEGER NOT NULL CHECK (hnsw_m BETWEEN 8 AND 64),
  hnsw_ef_construction INTEGER NOT NULL CHECK (hnsw_ef_construction BETWEEN 32 AND 512),
  hnsw_ef_search_hot INTEGER NOT NULL CHECK (hnsw_ef_search_hot BETWEEN 16 AND 512),
  hnsw_ef_search_warm INTEGER NOT NULL CHECK (hnsw_ef_search_warm BETWEEN 16 AND 256),
  procedural_memory_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  PRIMARY KEY (account_id, policy_id)
);

CREATE TABLE agentic_vector_residency_assignments (
  account_id BIGINT NOT NULL,
  vector_id UUID NOT NULL,
  object_kind TEXT NOT NULL,
  object_id TEXT NOT NULL,
  board_id BIGINT,
  account_shard INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (
    tier IN ('hot', 'warm', 'cold', 'rebuilding', 'quarantined')
  ),
  quality_score NUMERIC(5, 4) NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  freshness_score NUMERIC(5, 4) NOT NULL CHECK (freshness_score BETWEEN 0 AND 1),
  last_accessed_at TIMESTAMPTZ,
  row_version TEXT NOT NULL,
  columnar_snapshot_id TEXT,
  embedding_model_version TEXT NOT NULL,
  placement_reason TEXT NOT NULL,
  assignment_hash BYTEA NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, vector_id)
);

CREATE INDEX agentic_vector_residency_hot_lookup_idx
  ON agentic_vector_residency_assignments (
    account_id,
    account_shard,
    tier,
    object_kind,
    freshness_score DESC,
    quality_score DESC
  )
  WHERE tier IN ('hot', 'warm');

CREATE INDEX agentic_vector_residency_board_lookup_idx
  ON agentic_vector_residency_assignments (
    account_id,
    board_id,
    tier,
    object_kind,
    assigned_at DESC
  )
  WHERE board_id IS NOT NULL;

CREATE TABLE agentic_vector_residency_audit (
  account_id BIGINT NOT NULL,
  audit_id UUID NOT NULL,
  vector_id UUID,
  policy_id UUID,
  action TEXT NOT NULL CHECK (
    action IN (
      'policy_created',
      'tier_assigned',
      'tier_demoted',
      'tier_promoted',
      'rebuild_started',
      'rebuild_completed',
      'query_envelope_compiled',
      'query_rejected'
    )
  ),
  actor_id TEXT NOT NULL,
  input_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_id)
);
```

Vector payloads remain in the existing embedding store, such as pgvector-backed
tables or service-owned vector partitions. These residency tables only determine
which vectors can be searched and how expensive the search may be.

## Open API GraphQL surface

```graphql
enum VectorResidencyTier {
  HOT
  WARM
  COLD
  REBUILDING
  QUARANTINED
}

enum VectorObjectKind {
  SEMANTIC_MEMORY
  PROCEDURAL_MEMORY
  TOOL_AFFORDANCE
  BOARD_ITEM
  COLUMNAR_SYNOPSIS
  CONTEXT_PACKET
}

type VectorResidencyPolicy {
  accountId: ID!
  policyId: ID!
  objectKind: VectorObjectKind!
  defaultTier: VectorResidencyTier!
  maxHotVectors: BigInt!
  maxWarmVectors: BigInt!
  maxQueryTopK: Int!
  maxRecursiveExpansions: Int!
  minQualityScore: Float!
  minFreshnessScore: Float!
  proceduralMemoryRefs: [ID!]!
  createdAt: ISO8601DateTime!
}

type VectorResidencyPerceptionCard {
  accountId: ID!
  envelopeId: ID!
  searchableTiers: [VectorResidencyTier!]!
  searchableObjectKinds: [VectorObjectKind!]!
  estimatedRecall: String!
  staleVectorCount: BigInt!
  quarantinedVectorCount: BigInt!
  agentInstructions: [String!]!
  auditHash: String!
}

input CompileVectorResidencyEnvelopeInput {
  accountId: ID!
  requesterId: ID!
  purposeId: ID!
  objectKinds: [VectorObjectKind!]!
  requestedTiers: [VectorResidencyTier!]!
  topK: Int!
  requireFreshnessAfter: ISO8601DateTime
}

type Mutation {
  compileVectorResidencyEnvelope(
    input: CompileVectorResidencyEnvelopeInput!
  ): VectorResidencyPerceptionCard!
}
```

Every resolver must require `accountId`; server-side authorization must reject
requests when the caller account does not match the `accountId` argument.

## Deterministic residency algorithm

1. Read the active `VectorResidencyPolicy` for `(account_id, object_kind)`.
2. Join only tenant-scoped quality and freshness snapshots by `(account_id,
   vector_id)`.
3. Demote vectors below `minQualityScore` or `minFreshnessScore` to `cold` or
   `quarantined` using a stable reason code.
4. Promote the highest scoring, most recently accessed vectors until
   `maxHotVectors` and `maxWarmVectors` are reached.
5. Emit an immutable audit row with `input_hash`, `previous_audit_hash`, and
   `audit_hash`.
6. Compile query envelopes from the resulting assignments; never let the agent
   override tier, `topK`, or recursion caps at execution time.

This can run asynchronously from row-store change events and columnar snapshot
watermarks. Query execution reads only the latest completed assignment set, so a
rebuild does not compromise ACID writes or user-facing transaction latency.

## pgvector/HNSW compatibility

- Partition HNSW indexes by `account_hash` for small accounts and
  `account_board_hash` for high-volume accounts to keep graph traversal bounded.
- Store residency tier and object kind as indexed metadata filters before vector
  distance ordering.
- Use higher `ef_search` for `hot` partitions and lower `ef_search` for `warm`
  partitions; `cold` partitions should require explicit preflight admission.
- Rebuilds must be shard-local. A single account's rebuild cannot lock global
  vector search or degrade unrelated accounts.

## Agentic guardrails

- Reject envelopes with `topK > maxQueryTopK` before vector execution.
- Clamp recursive vector expansion to `maxRecursiveExpansions`, and record each
  expansion in the budget ledger.
- Disallow `cold` tier search unless the caller has an approved purpose envelope
  and a separate slow-lane budget reservation.
- Treat `quarantined` vectors as invisible to agents. Return a count and reason
  class in the perception card, not raw content.
- Require deterministic metadata filters (`account_id`, `tier`, `object_kind`,
  optional `board_id`) before vector distance ranking.

## Performance checks for 1M+ row boards

Risky pattern | Impact | Mitigation
--- | --- | ---
Vector search without `account_id` | Cross-tenant leakage and global HNSW traversal | Hard reject in resolver and planner.
Filtering by free-form JSON tags after vector search | Full partition scans under broad prompts | Compile tags into indexed perception facets.
Searching `cold` vectors by default | Slow graph traversal and cache churn | Require explicit cold-tier admission and slow-lane budget.
Read-time recomputation of quality/freshness | Latency spikes on hot queries | Use immutable score snapshots and async residency assignment.
Global rebuild after embedding model change | Neighbor-impact incident | Rebuild by account shard with SLO admission.
Recursive agent expansion with unbounded `topK` | Multiplicative vector reads | Clamp `topK`, recursion depth, and estimated vector reads.

## Agent perception model

An LLM should perceive residency as capability metadata, not as hidden magic. A
perception card can say:

```json
{
  "searchableTiers": ["hot", "warm"],
  "estimatedRecall": "bounded",
  "agentInstructions": [
    "Use hot procedural memories first.",
    "Ask for cold-tier admission before broad historical retrieval.",
    "Do not retry with wider topK after a query_rejected audit event."
  ],
  "staleVectorCount": 1842,
  "quarantinedVectorCount": 17
}
```

This helps agents make safer plans while preserving deterministic database
behavior. The model can reason about available memory, but mondayDB remains the
source of truth for the compiled envelope.

## Auditability and availability

Residency changes are append-only audit events chained by hash. A support or
compliance workflow can replay why a vector was searchable, stale, demoted, or
quarantined at a specific point in time. Because assignments are separate from
the transactional row store, mondayDB can maintain 99.99% availability: if the
residency compiler is degraded, queries continue using the last completed
assignment set with a `degraded` perception card and stricter `topK` caps.
