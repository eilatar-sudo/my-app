# mondayDB Agentic Continuity Ledger Plane

## Why this matters

Autonomous agents need continuity: they must remember which board objects, procedures,
tool outcomes, and semantic facts shaped a prior decision. The product trade-off is
latency versus deterministic trust. Reading directly from every historical row,
columnar aggregate, vector match, and tool trace would maximize freshness, but it
would also create unpredictable fan-out on large boards. The continuity ledger gives
agents a bounded, tenant-scoped record of what they are allowed to remember and cite,
while mondayDB keeps ACID mutations, multi-tenant isolation, and low-latency serving
paths deterministic.

The ledger is not an AI reasoning engine. It stores replayable continuity entries,
retrieval pointers, and procedural instructions that probabilistic agents may consume.
Every entry is scoped by `account_id`, versioned by source watermarks, and chained
with deterministic audit hashes so support, compliance, and regression systems can
reconstruct why an agent perceived a task in a specific way.

## Product goals

1. **Continuity without magic:** preserve agent memory as explicit data records,
   not hidden model state.
2. **Semantic retrieval readiness:** expose embeddings and metadata compatible with
   account-partitioned pgvector/HNSW indexes.
3. **Enterprise guardrails:** require deterministic admission, budget reservation,
   loop containment, and audit trails before an agent expands continuity context.
4. **Scale safety:** avoid full table scans for boards with 1M+ rows by limiting
   expansion through indexed source pointers, watermarks, and bounded `topK`.

## TypeScript contracts

```ts
export type ContinuityEntryKind =
  | "row_snapshot"
  | "columnar_signal"
  | "semantic_memory"
  | "procedure_instruction"
  | "tool_outcome"
  | "policy_decision";

export type ContinuitySourcePath = "row" | "columnar" | "vector" | "tool" | "policy";

export interface ContinuityLedgerEntry {
  accountId: string;
  entryId: string;
  boardId: string;
  itemId?: string;
  kind: ContinuityEntryKind;
  sourcePath: ContinuitySourcePath;
  sourceRef: {
    objectId: string;
    objectVersion: string;
    rowWatermark?: string;
    columnarWatermark?: string;
    vectorIndexVersion?: string;
  };
  agentPerception: {
    title: string;
    summary: string;
    tags: string[];
    riskLabels: Array<"pii" | "external_tool" | "destructive_action" | "high_cost">;
    proceduralHintIds: string[];
  };
  semanticRef?: {
    embeddingModel: string;
    embeddingVersion: string;
    vectorId: string;
    hnswPartition: string;
  };
  guardrails: {
    maxExpansionDepth: number;
    maxVectorTopK: number;
    maxColumnarWindows: number;
    budgetTokenEstimate: number;
    expiresAt: string;
  };
  audit: {
    createdBy: "system" | "user" | "agent";
    idempotencyKey: string;
    previousAuditHash?: string;
    auditHash: string;
    createdAt: string;
  };
}

export interface ContinuityReplayPacket {
  accountId: string;
  replayId: string;
  rootEntryIds: string[];
  entryHashes: string[];
  sourceWatermarks: {
    row: string;
    columnar: string;
    vector: string;
  };
  deterministicPlanHash: string;
  generatedAt: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_continuity_ledger (
  account_id              BIGINT NOT NULL,
  entry_id                UUID NOT NULL,
  board_id                BIGINT NOT NULL,
  item_id                 BIGINT,
  kind                    TEXT NOT NULL,
  source_path             TEXT NOT NULL,
  source_object_id        TEXT NOT NULL,
  source_object_version   TEXT NOT NULL,
  row_watermark           TEXT,
  columnar_watermark      TEXT,
  vector_index_version    TEXT,
  perception_title        TEXT NOT NULL,
  perception_summary      TEXT NOT NULL,
  perception_tags         TEXT[] NOT NULL DEFAULT '{}',
  risk_labels             TEXT[] NOT NULL DEFAULT '{}',
  procedural_hint_ids     UUID[] NOT NULL DEFAULT '{}',
  embedding_model         TEXT,
  embedding_version       TEXT,
  vector_id               UUID,
  hnsw_partition          TEXT,
  max_expansion_depth     INT NOT NULL DEFAULT 1,
  max_vector_top_k        INT NOT NULL DEFAULT 20,
  max_columnar_windows    INT NOT NULL DEFAULT 2,
  budget_token_estimate   INT NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  created_by              TEXT NOT NULL,
  idempotency_key         TEXT NOT NULL,
  previous_audit_hash     BYTEA,
  audit_hash              BYTEA NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, entry_id),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX idx_continuity_board_kind_created
  ON agentic_continuity_ledger (account_id, board_id, kind, created_at DESC);

CREATE INDEX idx_continuity_source
  ON agentic_continuity_ledger
  (account_id, source_path, source_object_id, source_object_version);

CREATE INDEX idx_continuity_item_created
  ON agentic_continuity_ledger (account_id, board_id, item_id, created_at DESC)
  WHERE item_id IS NOT NULL;

-- The embedding table is physically partitioned by account hash before HNSW build.
CREATE TABLE agentic_continuity_embeddings (
  account_id          BIGINT NOT NULL,
  vector_id           UUID NOT NULL,
  entry_id            UUID NOT NULL,
  board_id            BIGINT NOT NULL,
  embedding_model     TEXT NOT NULL,
  embedding_version   TEXT NOT NULL,
  embedding           vector(1536) NOT NULL,
  hnsw_partition      TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, vector_id),
  FOREIGN KEY (account_id, entry_id)
    REFERENCES agentic_continuity_ledger (account_id, entry_id)
);

CREATE INDEX idx_continuity_embedding_lookup
  ON agentic_continuity_embeddings (account_id, board_id, embedding_model);

-- Build per account-hash partition, never globally across tenants.
CREATE INDEX idx_continuity_embedding_hnsw
  ON agentic_continuity_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

## Open API GraphQL shape

```graphql
type ContinuityLedgerEntry {
  accountId: ID!
  entryId: ID!
  boardId: ID!
  itemId: ID
  kind: String!
  sourcePath: String!
  perceptionTitle: String!
  perceptionSummary: String!
  perceptionTags: [String!]!
  riskLabels: [String!]!
  proceduralHintIds: [ID!]!
  auditHash: String!
  createdAt: String!
}

input ContinuityLedgerFilterInput {
  boardId: ID!
  itemId: ID
  kinds: [String!]
  perceptionTags: [String!]
  createdAfter: String
}

input ContinuitySearchInput {
  boardId: ID!
  query: String!
  topK: Int = 10
  maxExpansionDepth: Int = 1
  requiredTags: [String!]
}

type ContinuityReplayPacket {
  replayId: ID!
  rootEntryIds: [ID!]!
  entryHashes: [String!]!
  deterministicPlanHash: String!
  generatedAt: String!
}

extend type Query {
  continuityLedgerEntries(filter: ContinuityLedgerFilterInput!, limit: Int = 50): [ContinuityLedgerEntry!]!
  continuitySemanticSearch(input: ContinuitySearchInput!): [ContinuityLedgerEntry!]!
}

extend type Mutation {
  createContinuityReplayPacket(entryIds: [ID!]!): ContinuityReplayPacket!
}
```

All resolvers derive `account_id` from the authenticated monday.com account context.
Clients never provide or override tenant scope.

## Write path

1. A row transaction, columnar materialization, tool result, or policy decision emits
   an immutable source event with `account_id`, source version, and watermarks.
2. The continuity admission worker verifies the event against workload budgets,
   data visibility, and loop-containment state.
3. The worker writes `agentic_continuity_ledger` in the row store with an
   idempotency key and audit hash.
4. If semantic retrieval is enabled, an async enrichment job writes the embedding
   into the account-hash partition for pgvector/HNSW.
5. The Open API exposes the entry only after both the row-store write and audit
   chain are durable. Vector enrichment may lag, but the response includes source
   watermarks so callers can reason about freshness.

## Read path and guardrails

Every read request must satisfy these predicates before execution:

- `account_id = authenticated_account_id`
- `board_id IN authorized_boards`
- `limit <= 100`
- `topK <= guardrails.maxVectorTopK`
- `maxExpansionDepth <= guardrails.maxExpansionDepth`
- estimated row, columnar, vector, and tool expansion cost fits the reserved budget

If an agent asks for recursive continuity expansion, the planner expands breadth
first and stops at the lowest of:

1. the stored entry guardrail,
2. the request guardrail,
3. the tenant workload budget,
4. the SLO admission governor.

Rejected requests return deterministic error codes such as
`CONTINUITY_TOPK_EXCEEDED`, `CONTINUITY_DEPTH_EXCEEDED`, or
`CONTINUITY_BUDGET_REJECTED`. The rejection itself is audit logged.

## Performance check for 1M+ row boards

Risk areas that must be rejected or rewritten:

- Filtering by `perception_tags` without `account_id` and `board_id`.
- Semantic search across global embeddings rather than account-hash partitions.
- Expanding entries by `source_object_id` without `source_path`.
- Allowing `topK` or `limit` to be client-unbounded.
- Joining ledger entries to board items without the `(account_id, board_id, item_id)`
  index.

Safe serving patterns:

- Recent board memory:
  `WHERE account_id = ? AND board_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?`
- Item continuity:
  `WHERE account_id = ? AND board_id = ? AND item_id = ? ORDER BY created_at DESC LIMIT ?`
- Source replay:
  `WHERE account_id = ? AND source_path = ? AND source_object_id = ? AND source_object_version = ?`
- Semantic retrieval:
  search only the account-hash HNSW partition, apply `board_id` metadata filters,
  and cap `topK` before any row-store hydration.

## Agent perception model

An LLM should perceive continuity entries as evidence cards:

```json
{
  "type": "continuity_evidence_card",
  "title": "Customer escalation procedure changed",
  "summary": "Procedure v4 supersedes v3 for board 123 escalation triage.",
  "tags": ["escalation", "procedure", "support"],
  "riskLabels": ["external_tool"],
  "proceduralHintIds": ["7df2f7d1-9e1b-4d41-9bf9-54d7ed0a6e41"],
  "allowedExpansions": {
    "maxDepth": 1,
    "maxVectorTopK": 10
  },
  "citation": {
    "entryId": "4dd6d2a6-1576-4a5b-b73d-69ecb437a903",
    "auditHash": "sha256:..."
  }
}
```

The card tells an agent what the entry means, how risky it is, which procedural
instructions are relevant, and where deterministic citations live. It does not
authorize action by itself; action still requires policy, budget, and transaction
intent verification.

## Auditability and replay

`audit_hash` is computed from a canonical serialization of:

- account, board, item, and source identifiers,
- source watermarks,
- perception metadata,
- guardrail values,
- idempotency key,
- previous hash in the account-scoped continuity chain.

Replay packets snapshot the root entry IDs and source watermarks used by a plan.
If a future replay observes different watermarks or hashes, the system marks the
agent outcome as non-reproducible and routes it through review instead of silently
trusting stale memory.

## Failure modes

- **Vector enrichment lag:** return row-store ledger entries with
  `vector_index_version = null` and deterministic freshness metadata.
- **Budget pressure:** degrade to recent board/item continuity entries before
  rejecting the request.
- **Tenant hot partition:** reduce `topK`, queue enrichment, and preserve ACID row
  writes ahead of optional embeddings.
- **Policy conflict:** return only redacted perception metadata and audit the policy
  decision hash.

## Rollout checklist

1. Start with read-only ledger entries produced from immutable source events.
2. Enforce account-scoped composite keys and resolver-derived tenancy before any
   GraphQL exposure.
3. Enable vector enrichment per account cohort with HNSW partitions and recall tests.
4. Add continuity replay packets to regression suites for agent plans.
5. Monitor SLO admission, rejected recursive expansions, and vector hydration latency.
