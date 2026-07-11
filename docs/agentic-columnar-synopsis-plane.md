# Agentic Columnar Synopsis Plane

## Why before how

Agents need to ask analytical questions such as "which customer workspaces are
showing delivery risk?" or "what changed in this board since yesterday?" The
danger is that a probabilistic agent may express these as broad natural-language
questions that compile into full board scans, recursive vector expansion, or
high-cardinality aggregations over millions of rows. That threatens neighbor
latency and makes results hard to replay.

The Columnar Synopsis Plane gives mondayDB an agent-readable analytical memory
layer built from deterministic columnar summaries. The trade-off is deliberate:
agents receive bounded, low-latency perception cards first, while exact row-level
answers require an explicit follow-up plan, budget reservation, and audit trail.
This keeps mondayDB deterministic and predictable even when the caller is an
LLM.

## Product promise

- **Blink-of-an-eye perception:** Answer common analytical orientation questions
  from precomputed columnar synopsis records instead of scanning hot row storage.
- **Enterprise trust:** Every synopsis is tenant-scoped, source-watermarked, and
  reproducible from immutable row or columnar events.
- **Agentic readiness:** Synopses carry procedural instructions, semantic tags,
  and GraphQL-accessible perception cards so agents can understand what they may
  safely ask next.
- **No magic in the engine:** The database stores deterministic summaries and
  routing metadata. Any probabilistic interpretation remains outside the storage
  engine.

## Core invariants

1. Every persisted record and API path includes `account_id` / `accountId`.
2. A synopsis is derived from a declared source range, not an implicit scan.
3. Vector embeddings describe synopsis metadata and safe labels, never raw
   sensitive cell values.
4. Freshness is explicit through source watermarks and build transaction IDs.
5. Agents cannot recursively expand from synopsis to row scan without a new
   admission decision.
6. Audit hashes are computed from canonical JSON inputs and deterministic result
   references, not from model-generated prose.

## Architecture

```text
Row updates / transaction log
        |
        v
Immutable change events -----> Columnar projection
        |                             |
        |                             v
        |                    Synopsis builder
        |                             |
        v                             v
Audit event chain <----- Agentic columnar synopsis catalog
                                      |
                                      v
                         GraphQL perception cards
                                      |
                                      v
                         Agent planner / retrieval router
```

The synopsis builder runs asynchronously from immutable change events and
columnar projection watermarks. It writes compact summaries by account, board,
time window, dimension set, measure set, and visibility scope. Agents discover
these summaries through GraphQL and, optionally, an account-partitioned
pgvector/HNSW metadata index.

## TypeScript contracts

```ts
export type SynopsisExactness = "exact_snapshot" | "bounded_approximation";
export type SynopsisStatus = "building" | "ready" | "stale" | "superseded" | "failed";

export interface ColumnarSynopsisKey {
  accountId: string;
  boardId: string;
  synopsisId: string;
  version: number;
}

export interface SynopsisSourceRange {
  accountId: string;
  boardId: string;
  columnarProjectionId: string;
  fromEventSeq: string;
  toEventSeq: string;
  snapshotTxnId: string;
  sourceWatermark: string;
}

export interface SynopsisDimension {
  columnId: string;
  normalizedType: "status" | "person" | "date" | "number" | "text" | "mirror" | "formula";
  cardinalityBucket: "low" | "medium" | "high";
  safeSemanticLabel: string;
}

export interface SynopsisMeasure {
  measureId: string;
  columnId: string;
  operation: "count" | "sum" | "avg" | "min" | "max" | "percentile" | "top_k";
  exactness: SynopsisExactness;
  valueRef: string;
}

export interface AgenticColumnarSynopsis {
  key: ColumnarSynopsisKey;
  status: SynopsisStatus;
  source: SynopsisSourceRange;
  dimensions: SynopsisDimension[];
  measures: SynopsisMeasure[];
  rowCountCovered: string;
  visibilityScopeId: string;
  procedureMemoryRefs: string[];
  semanticTags: string[];
  embeddingRef?: {
    model: string;
    vectorId: string;
    dimensions: number;
    hnswPartition: string;
  };
  guardrails: {
    maxFollowupRows: string;
    maxFollowupColumnarBytes: string;
    maxVectorCandidates: number;
    maxRecursiveDepth: number;
    requiresExactPlanForWrites: true;
  };
  audit: {
    buildHash: string;
    previousAuditHash?: string;
    createdAt: string;
  };
}

export interface SynopsisPerceptionCard {
  accountId: string;
  boardId: string;
  synopsisId: string;
  title: string;
  safeSummary: string;
  freshness: {
    sourceWatermark: string;
    stalenessMs: number;
  };
  canAnswer: string[];
  cannotAnswerWithoutPreflight: string[];
  recommendedProcedures: string[];
  plannerHints: {
    preferredPath: "columnar_synopsis";
    avoidPaths: Array<"row_full_scan" | "global_vector_scan" | "unbounded_recursive_expand">;
    indexedPredicates: string[];
  };
}

export interface SynopsisIntentRequest {
  accountId: string;
  boardId: string;
  naturalLanguageIntent: string;
  requiredFreshnessMs: number;
  maxSynopses: number;
  purposeEnvelopeId: string;
  callerAuditRef: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_columnar_synopses (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  synopsis_id UUID NOT NULL,
  version BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('building', 'ready', 'stale', 'superseded', 'failed')),
  columnar_projection_id UUID NOT NULL,
  from_event_seq BIGINT NOT NULL,
  to_event_seq BIGINT NOT NULL,
  snapshot_txn_id BIGINT NOT NULL,
  source_watermark TIMESTAMPTZ NOT NULL,
  visibility_scope_id UUID NOT NULL,
  dimensions_json JSONB NOT NULL,
  measures_json JSONB NOT NULL,
  row_count_covered BIGINT NOT NULL CHECK (row_count_covered >= 0),
  exactness TEXT NOT NULL CHECK (exactness IN ('exact_snapshot', 'bounded_approximation')),
  procedure_memory_refs UUID[] NOT NULL DEFAULT '{}',
  semantic_tags TEXT[] NOT NULL DEFAULT '{}',
  hnsw_partition TEXT,
  embedding_vector_id UUID,
  guardrails_json JSONB NOT NULL,
  build_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, board_id, synopsis_id, version)
);

CREATE INDEX agentic_columnar_synopses_ready_idx
  ON agentic_columnar_synopses (account_id, board_id, status, source_watermark DESC)
  WHERE status = 'ready';

CREATE INDEX agentic_columnar_synopses_tags_idx
  ON agentic_columnar_synopses USING GIN (semantic_tags);

CREATE TABLE agentic_columnar_synopsis_embeddings (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  synopsis_id UUID NOT NULL,
  version BIGINT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, board_id, synopsis_id, version),
  FOREIGN KEY (account_id, board_id, synopsis_id, version)
    REFERENCES agentic_columnar_synopses (account_id, board_id, synopsis_id, version)
);

-- Deploy the HNSW index per account-hash partition, never as one global
-- cross-tenant graph.
CREATE INDEX agentic_columnar_synopsis_embeddings_hnsw_idx
  ON agentic_columnar_synopsis_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE agentic_columnar_synopsis_audit_events (
  account_id BIGINT NOT NULL,
  audit_event_id UUID NOT NULL,
  board_id BIGINT NOT NULL,
  synopsis_id UUID NOT NULL,
  version BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  canonical_input_hash BYTEA NOT NULL,
  deterministic_result_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_event_id)
);

CREATE INDEX agentic_columnar_synopsis_audit_chain_idx
  ON agentic_columnar_synopsis_audit_events
  (account_id, board_id, synopsis_id, created_at DESC);
```

## Open API GraphQL shape

```graphql
input AgenticSynopsisIntentInput {
  accountId: ID!
  boardId: ID!
  naturalLanguageIntent: String!
  requiredFreshnessMs: Int!
  maxSynopses: Int! = 5
  purposeEnvelopeId: ID!
  callerAuditRef: ID!
}

type AgenticSynopsisFreshness {
  sourceWatermark: String!
  stalenessMs: Int!
}

type AgenticSynopsisPlannerHints {
  preferredPath: String!
  avoidPaths: [String!]!
  indexedPredicates: [String!]!
}

type AgenticSynopsisPerceptionCard {
  accountId: ID!
  boardId: ID!
  synopsisId: ID!
  title: String!
  safeSummary: String!
  freshness: AgenticSynopsisFreshness!
  canAnswer: [String!]!
  cannotAnswerWithoutPreflight: [String!]!
  recommendedProcedures: [ID!]!
  plannerHints: AgenticSynopsisPlannerHints!
  auditHash: String!
}

type AgenticSynopsisIntentResult {
  accountId: ID!
  boardId: ID!
  admitted: Boolean!
  rejectionReason: String
  cards: [AgenticSynopsisPerceptionCard!]!
  nextRequiredPreflight: String
  auditHash: String!
}

extend type Query {
  agenticColumnarSynopses(input: AgenticSynopsisIntentInput!): AgenticSynopsisIntentResult!
}
```

The resolver must reject calls where `accountId` is absent, mismatched with the
auth context, or omitted from the downstream storage predicates.

## Query flow

1. **Compile intent:** Convert the user or agent request into a deterministic
   `SynopsisIntentRequest` with purpose, board, freshness, and budget fields.
2. **Preflight:** Estimate synopsis lookup cost, candidate count, HNSW probes,
   and follow-up risk. Reject unbounded intents before touching storage.
3. **Retrieve:** Use `(account_id, board_id, status, source_watermark)` and
   optional tenant-partitioned vector search over metadata.
4. **Assemble cards:** Return bounded perception cards with explicit "can
   answer" and "cannot answer without preflight" boundaries.
5. **Audit:** Hash canonical inputs, selected synopsis IDs, watermarks, and
   guardrail decisions into an append-only audit event.

## Semantic retrieval and HNSW compatibility

Synopsis embeddings make analytical metadata discoverable for RAG:

- Embed safe labels such as board purpose, dimension labels, measure names,
  semantic tags, and procedural hints.
- Exclude raw cell values, private notes, and redacted fields from embedding
  payloads.
- Partition HNSW indexes by `account_id` hash or `(account_id, board_id)` for
  high-volume tenants.
- Always apply tenant, board, visibility, status, and freshness filters before
  returning candidates to an agent.
- Cap `maxSynopses`, HNSW probes, and vector candidates through the query
  governor.

## Guardrails for autonomous agents

- **No recursive free expansion:** A synopsis card may recommend a follow-up
  procedure, but the follow-up must submit a new preflight request with its own
  budget.
- **No write decisions from approximations:** Writes or tool actions require
  `exact_snapshot` evidence or a verified transaction intent.
- **Bounded analytical fanout:** Reject requests whose dimension set would
  produce high-cardinality groupings without a compiled schema contract.
- **Freshness gates:** If `stalenessMs` exceeds the caller's declared bound,
  return a stale result with a refresh option rather than silently scanning rows.
- **Neighbor protection:** Degrade to queued synopsis refresh when columnar bytes
  or HNSW probes exceed tenant workload limits.

## Performance check for 1M+ row boards

Unsafe plans to reject:

- `WHERE board_id = ?` without `account_id = ?`.
- Any agent-generated aggregation over item values without a synopsis,
  columnar projection, or indexed time/window predicate.
- Global vector search over synopsis metadata without tenant partitioning.
- High-cardinality `GROUP BY` over JSON cell payloads on row storage.
- Follow-up expansion from synopsis cards to raw rows where estimated rows exceed
  `maxFollowupRows`.

Expected fast path:

```sql
SELECT synopsis_id, version, source_watermark, dimensions_json, measures_json
FROM agentic_columnar_synopses
WHERE account_id = $1
  AND board_id = $2
  AND status = 'ready'
  AND source_watermark >= $3
ORDER BY source_watermark DESC
LIMIT $4;
```

This path stays on the tenant-scoped ready index and returns compact records
instead of touching the item row store.

## Agent perception example

```json
{
  "accountId": "123",
  "boardId": "456",
  "synopsisId": "8ff7b1c9-7c3e-4d9a-b3e0-9f3f93688a11",
  "title": "Delivery risk by status and owner",
  "safeSummary": "Covers 1,240,812 items through event sequence 9912881. Suitable for trend orientation, not write decisions.",
  "freshness": {
    "sourceWatermark": "2026-07-11T00:00:00Z",
    "stalenessMs": 842
  },
  "canAnswer": [
    "Which status buckets are growing?",
    "Which owner groups have the most overdue items?"
  ],
  "cannotAnswerWithoutPreflight": [
    "Update item owners",
    "Inspect every overdue item",
    "Join with another board"
  ],
  "recommendedProcedures": [
    "procedure://delivery-risk-triage/v3"
  ],
  "plannerHints": {
    "preferredPath": "columnar_synopsis",
    "avoidPaths": [
      "row_full_scan",
      "global_vector_scan",
      "unbounded_recursive_expand"
    ],
    "indexedPredicates": [
      "account_id",
      "board_id",
      "status",
      "source_watermark"
    ]
  }
}
```

An LLM should perceive this as a bounded analytical map: useful for choosing the
next safe question, insufficient for autonomous writes, and always tied to
tenant-scoped evidence.

## Auditability and replay

Each build and read emits an audit event containing:

- `account_id`, `board_id`, `synopsis_id`, and `version`.
- Source event range and columnar projection watermark.
- Canonical intent hash.
- Deterministic selected synopsis IDs and versions.
- Guardrail decision and rejection reason, if any.
- Previous audit hash for chain replay.

Replay never depends on the original model prompt completion. It rehydrates the
same synopsis records and verifies hashes against the source event range.

## Rollout path

1. Start with read-only synopsis cards for high-volume boards.
2. Add tenant-partitioned metadata embeddings after visibility filtering is
   validated.
3. Integrate cards into the retrieval router as the preferred analytical
   orientation path.
4. Require exact preflight for row expansion, joins, writes, and tool actions.
5. Promote commonly used synopsis cards into procedural memory only after human
   review and deterministic audit validation.
