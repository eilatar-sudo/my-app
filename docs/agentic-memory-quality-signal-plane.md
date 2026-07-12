# Agentic Memory Quality Signal Plane

## Why before how

Agents need long-term memory, but not all memory deserves equal trust. A stale
procedure, a rarely confirmed semantic summary, or a memory derived from a
low-confidence tool observation can mislead an autonomous workflow even when the
underlying database remains correct. The product trade-off is confidence versus
latency: mondayDB should help agents find the best memories quickly, but it must
not introduce "magic" AI ranking into the storage engine or allow unbounded
rescoring jobs to affect neighboring tenants.

The Memory Quality Signal Plane stores deterministic, tenant-scoped quality
signals for semantic and procedural memories. It gives agents explicit,
auditable metadata about freshness, provenance, confirmation, conflict pressure,
and operational cost. The engine remains predictable: quality scores are derived
from declared inputs and versioned formulas, while LLMs only consume the
resulting perception cards.

## Product promise

- **Trust-calibrated memory:** Agents can distinguish authoritative procedures
  from weak hints without asking the model to guess.
- **Stable retrieval latency:** Quality metadata is joined through bounded
  memory IDs and account-partitioned vector indexes, not through full board
  scans.
- **Enterprise auditability:** Every quality score has deterministic inputs,
  formula versions, source watermarks, and hash-chained audit events.
- **Multi-tenant safety:** Every record, index, API resolver, and async scoring
  job is scoped by `account_id`.
- **No probabilistic database behavior:** The database stores quality facts and
  score outputs. Model interpretation happens outside the core engine.

## Core invariants

1. Every table primary key and secondary index begins with `account_id`.
2. A quality score is recomputable from immutable inputs and a formula version.
3. Quality scoring never reads raw board cells unless a bounded source reference
   was already materialized by an admitted memory pipeline.
4. Semantic retrieval may use pgvector/HNSW only after account and visibility
   filters are applied.
5. Agents cannot recursively expand from "low quality" to "find better memory"
   without a new query budget reservation.
6. Audit hashes are computed from canonical JSON inputs, formula IDs, result
   refs, and watermarks; model-generated explanations are excluded.
7. Stale quality scores degrade retrieval rank, but never delete or mutate the
   underlying memory record.

## Architecture

```text
Immutable memory events
        |
        v
Memory quality signal collector
        |
        +--> confirmation / conflict / freshness / cost signals
        |
        v
Deterministic scorer
        |
        +--> quality score snapshot
        +--> account-partitioned HNSW metadata embedding
        +--> audit hash event
        |
        v
GraphQL memory quality perception cards
        |
        v
Agent planner / retrieval router / plan verifier
```

The collector subscribes to existing memory lifecycle, feedback, conflict,
semantic drift, and workload telemetry events. It materializes compact signal
rows keyed by account, memory, signal type, and source watermark. The scorer
runs asynchronously, produces immutable score snapshots, and marks the active
snapshot pointer for retrieval. The row store handles transactional signal
ingestion; the columnar layer provides bounded aggregate windows for historical
quality analytics; vector metadata indexes help discover related quality
patterns without scanning memory tables.

## TypeScript contracts

```ts
export type MemoryKind = "semantic" | "procedural" | "tool_observation" | "context_packet";

export type QualitySignalType =
  | "freshness"
  | "confirmation"
  | "conflict"
  | "semantic_drift"
  | "procedure_success"
  | "tool_cost"
  | "human_review";

export type QualityScoreStatus = "active" | "stale" | "superseded" | "quarantined";

export interface MemoryQualityKey {
  accountId: string;
  memoryId: string;
  memoryKind: MemoryKind;
  scoreVersion: number;
}

export interface QualitySignalSource {
  accountId: string;
  sourcePlane:
    | "memory_lifecycle"
    | "observation_feedback"
    | "semantic_drift"
    | "conflict_resolution"
    | "workload_isolation"
    | "human_review";
  sourceEventId: string;
  sourceWatermark: string;
  visibilityScopeId: string;
}

export interface QualitySignal {
  accountId: string;
  memoryId: string;
  signalId: string;
  signalType: QualitySignalType;
  source: QualitySignalSource;
  value: string;
  valueScale: "zero_to_one" | "count" | "cost_units" | "age_seconds";
  observedAt: string;
  expiresAt?: string;
  canonicalInputHash: string;
}

export interface QualityFormulaRef {
  formulaId: string;
  formulaVersion: number;
  deterministicExpressionHash: string;
  weights: {
    freshness: number;
    confirmation: number;
    conflict: number;
    semanticDrift: number;
    procedureSuccess: number;
    toolCost: number;
    humanReview: number;
  };
}

export interface MemoryQualityScore {
  key: MemoryQualityKey;
  status: QualityScoreStatus;
  formula: QualityFormulaRef;
  score: {
    trust: number;
    freshness: number;
    usefulness: number;
    risk: number;
    retrievalBoost: number;
  };
  sourceSignalRefs: string[];
  sourceWatermark: string;
  visibilityScopeId: string;
  procedureMemoryRefs: string[];
  semanticTags: string[];
  embeddingRef?: {
    model: string;
    dimension: number;
    vectorRef: string;
    hnswPartition: string;
  };
  audit: {
    scoreHash: string;
    previousScoreHash?: string;
    createdAt: string;
    createdBy: "quality_scorer";
  };
}

export interface MemoryQualityPerceptionCard {
  accountId: string;
  memoryId: string;
  memoryKind: MemoryKind;
  trustLabel: "high" | "medium" | "low" | "quarantined";
  freshnessLabel: "current" | "aging" | "stale";
  agentInstruction: string;
  safeNextActions: Array<"retrieve" | "verify" | "ask_human" | "ignore" | "refresh_embedding">;
  guardrails: {
    maxRecursiveRetrievalDepth: number;
    requiresPlanVerification: boolean;
    maxTopKExpansion: number;
    budgetClass: "interactive" | "background" | "blocked";
  };
  citationRefs: string[];
  scoreHash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_memory_quality_signal (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  signal_id UUID NOT NULL,
  signal_type TEXT NOT NULL,
  source_plane TEXT NOT NULL,
  source_event_id UUID NOT NULL,
  source_watermark TEXT NOT NULL,
  visibility_scope_id UUID NOT NULL,
  value_numeric NUMERIC(18, 8) NOT NULL,
  value_scale TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  canonical_input_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, signal_id)
);

CREATE INDEX idx_memory_quality_signal_type
  ON agentic_memory_quality_signal (
    account_id,
    signal_type,
    observed_at DESC,
    memory_id
  );

CREATE INDEX idx_memory_quality_signal_source
  ON agentic_memory_quality_signal (
    account_id,
    source_plane,
    source_event_id
  );

CREATE TABLE agentic_memory_quality_score (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  memory_kind TEXT NOT NULL,
  score_version BIGINT NOT NULL,
  status TEXT NOT NULL,
  formula_id TEXT NOT NULL,
  formula_version INTEGER NOT NULL,
  deterministic_expression_hash BYTEA NOT NULL,
  trust_score NUMERIC(9, 6) NOT NULL,
  freshness_score NUMERIC(9, 6) NOT NULL,
  usefulness_score NUMERIC(9, 6) NOT NULL,
  risk_score NUMERIC(9, 6) NOT NULL,
  retrieval_boost NUMERIC(9, 6) NOT NULL,
  source_signal_refs UUID[] NOT NULL,
  source_watermark TEXT NOT NULL,
  visibility_scope_id UUID NOT NULL,
  procedure_memory_refs UUID[] NOT NULL DEFAULT '{}',
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  score_hash BYTEA NOT NULL,
  previous_score_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, score_version)
);

CREATE UNIQUE INDEX idx_memory_quality_active_score
  ON agentic_memory_quality_score (account_id, memory_id)
  WHERE status = 'active';

CREATE INDEX idx_memory_quality_retrieval
  ON agentic_memory_quality_score (
    account_id,
    visibility_scope_id,
    status,
    retrieval_boost DESC,
    trust_score DESC,
    memory_id
  );

CREATE TABLE agentic_memory_quality_embedding (
  account_id BIGINT NOT NULL,
  memory_id UUID NOT NULL,
  score_version BIGINT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  hnsw_partition TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  embedding_input_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id, score_version, embedding_model)
);

CREATE INDEX idx_memory_quality_embedding_hnsw
  ON agentic_memory_quality_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The HNSW table must be physically or logically partitioned by `account_id` hash
before vector search. If the database engine cannot guarantee partition pruning,
the retrieval router must reject the vector path and use a bounded row-store
lookup by explicit memory IDs.

## Deterministic scoring formula

Quality scoring is intentionally simple and versioned:

```text
trust =
  (freshness_weight * freshness_score)
+ (confirmation_weight * confirmation_score)
+ (procedure_success_weight * procedure_success_score)
+ (human_review_weight * human_review_score)
- (conflict_weight * conflict_score)
- (semantic_drift_weight * drift_score)
- (tool_cost_weight * normalized_cost_score)
```

Each component is clamped to `[0, 1]` and rounded with a fixed decimal policy.
The scorer records the formula ID, formula version, weights, input hashes, and
source watermarks. If product teams later tune weights, previous scores remain
replayable because they reference their original formula version.

## Open API GraphQL shape

```graphql
enum MemoryQualityTrustLabel {
  high
  medium
  low
  quarantined
}

input MemoryQualityFilterInput {
  accountId: ID!
  memoryIds: [ID!]
  boardId: ID
  visibilityScopeId: ID!
  minTrustScore: Float
  includeStale: Boolean = false
  limit: Int = 50
}

type MemoryQualityScore {
  accountId: ID!
  memoryId: ID!
  memoryKind: String!
  scoreVersion: Int!
  status: String!
  trustScore: Float!
  freshnessScore: Float!
  usefulnessScore: Float!
  riskScore: Float!
  retrievalBoost: Float!
  sourceWatermark: String!
  scoreHash: String!
}

type MemoryQualityPerceptionCard {
  accountId: ID!
  memoryId: ID!
  trustLabel: MemoryQualityTrustLabel!
  freshnessLabel: String!
  agentInstruction: String!
  safeNextActions: [String!]!
  maxRecursiveRetrievalDepth: Int!
  requiresPlanVerification: Boolean!
  maxTopKExpansion: Int!
  budgetClass: String!
  citationRefs: [ID!]!
  scoreHash: String!
}

type Query {
  agenticMemoryQualityScores(filter: MemoryQualityFilterInput!): [MemoryQualityScore!]!
  agenticMemoryQualityPerceptionCards(filter: MemoryQualityFilterInput!): [MemoryQualityPerceptionCard!]!
}

type Mutation {
  requestAgenticMemoryQualityRefresh(
    accountId: ID!
    memoryIds: [ID!]!
    reason: String!
    idempotencyKey: String!
  ): Boolean!
}
```

Resolver requirements:

- Reject any request without `accountId` and `visibilityScopeId`.
- Clamp `limit` to 100 for interactive calls and 1,000 for background admitted
  jobs.
- If `memoryIds` is absent, require a selective indexed predicate such as
  board/workflow scope plus `minTrustScore`; otherwise reject the query for
  1M+ row boards.
- Return perception cards from active score snapshots only unless
  `includeStale` is explicitly true and the caller has audit permissions.

## Semantic retrieval and HNSW compatibility

The quality embedding describes metadata such as:

- memory kind and safe semantic tags;
- source plane names and review status;
- trust, freshness, and risk buckets;
- procedure reference names, not raw procedure bodies;
- conflict classes and remediation hints.

The embedding must not include raw board cell values, secrets, or redacted
content. Vector search runs in this order:

1. Resolve `account_id` and `visibility_scope_id`.
2. Select the tenant HNSW partition.
3. Apply `status = 'active'` and visibility filters.
4. Run bounded vector search with `topK <= 50` for interactive calls.
5. Re-rank deterministically by retrieval boost, trust score, risk score, and
   source watermark.

This allows RAG systems to find high-quality memories while preserving
deterministic ordering for the same inputs.

## Procedural memory integration

Quality cards should be readable as instructions:

```json
{
  "memoryId": "7c8c8e3a-8d2e-4d8b-9188-60f9f8d6c501",
  "trustLabel": "medium",
  "freshnessLabel": "aging",
  "agentInstruction": "Use this procedure only after verifying the current board schema contract.",
  "safeNextActions": ["verify", "retrieve"],
  "guardrails": {
    "maxRecursiveRetrievalDepth": 1,
    "requiresPlanVerification": true,
    "maxTopKExpansion": 10,
    "budgetClass": "interactive"
  }
}
```

An LLM perceives the card as a deterministic confidence boundary: it may cite the
memory, but it must verify dependencies before using it for writes, tool calls,
or broad analytical retrieval.

## Agentic guardrails

- **Recursive retrieval cap:** A memory quality lookup may fan out to related
  memories only once unless a plan verifier grants another budget.
- **Cost-aware refresh:** Agents can request score refreshes, but refresh jobs
  run in background admission lanes and are deduplicated by idempotency key.
- **Low-trust quarantine:** Quarantined memories remain auditable but are hidden
  from default retrieval routes.
- **Neighbor protection:** Quality recomputation uses bounded signal windows and
  columnar aggregates; it cannot scan all memory events for an account during an
  interactive query.
- **Tool-use readiness:** Tool execution planners must reject autonomous actions
  based only on low-trust or stale procedural memories.

## Performance check for 1M+ row boards

Potential full-scan risks and mitigations:

| Risk | Why it hurts | Required mitigation |
| --- | --- | --- |
| Filtering quality by free-form `semantic_tags` alone | Can scan all tenant memory rows | Require `account_id`, visibility scope, status, and either memory IDs or board/workflow scope |
| Recomputing scores during GraphQL reads | Turns retrieval into a fan-out over signals | Serve immutable score snapshots; recompute asynchronously |
| Vector search across global HNSW index | Risks tenant leakage and noisy latency | Partition by `account_id` hash before HNSW search |
| Unbounded "find better memory" loops | Recursive retrieval can exhaust budgets | Enforce topK, depth, and plan verification |
| Joining to raw board rows for explanations | May hit row store for millions of items | Use source refs and watermarks; require separate admitted evidence query |

The normal read path is `account_id + visibility_scope_id + status + retrieval
rank`, which stays index-backed and avoids row-store scans.

## Audit model

Each scoring run emits an audit event:

```ts
export interface MemoryQualityAuditEvent {
  accountId: string;
  eventId: string;
  memoryId: string;
  scoreVersion: number;
  formulaId: string;
  formulaVersion: number;
  sourceSignalRefs: string[];
  sourceWatermark: string;
  canonicalInputHash: string;
  scoreHash: string;
  previousScoreHash?: string;
  emittedAt: string;
}
```

The audit chain lets enterprise admins answer:

- Why did an agent trust this memory?
- Which formula version produced the score?
- Which source events confirmed or degraded the memory?
- Was the score current at the time of an autonomous action?

## Rollout plan

1. Start with procedural memory and semantic memory records only.
2. Materialize freshness, human review, and conflict signals before adding
   cost-derived signals.
3. Expose GraphQL perception cards as read-only.
4. Add refresh mutations behind workload admission and idempotency controls.
5. Integrate score labels into retrieval router ranking and plan verification.
6. Enable columnar analytics for quality trends after interactive paths are
   stable.

## Success metrics

- P95 quality-card lookup latency remains within interactive retrieval SLOs.
- Zero quality queries execute without `account_id`.
- Retrieval routes show lower use of stale procedural memories.
- Autonomous write plans cite high-trust or freshly verified memories.
- Audit replay can reproduce score snapshots byte-for-byte from stored inputs.

## Failure modes and deterministic responses

- **Signal backlog:** Mark affected score snapshots `stale` and lower retrieval
  boost; do not block unrelated row transactions.
- **Formula regression:** Freeze the previous formula version, supersede only new
  snapshots, and preserve replayability for old actions.
- **Embedding outage:** Continue row-store lookups by explicit memory IDs and
  disable semantic quality discovery.
- **Conflict spike:** Quarantine impacted memories until human review or a
  deterministic conflict-resolution plane emits a clearing signal.
- **Tenant partition mismatch:** Reject vector search and emit an audit event;
  never fall back to a global HNSW query.

## Strategic fit

The Memory Quality Signal Plane turns long-term memory into an enterprise-grade
asset rather than an unbounded prompt cache. Agents get clear signals about what
to trust, when to verify, and when to ask for help. mondayDB preserves its core
identity as a deterministic, multi-tenant, low-latency WorkOS engine while adding
the perception metadata agents need for safe autonomous work.
