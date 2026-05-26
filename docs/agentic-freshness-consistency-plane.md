# Agentic Freshness and Consistency Plane

## Why this matters

Autonomous agents need fast retrieval, but enterprise users need to know when the
retrieved context is stale. The product trade-off is latency versus consistency:
forcing every row, columnar, and vector read to be strongly consistent would make
agent workflows feel slow, while unbounded eventual consistency would let agents
act on outdated board state. The freshness and consistency plane gives agents a
deterministic contract: every context packet declares the exact source
watermarks, freshness budget, and consistency level used to assemble it.

This keeps mondayDB deterministic while letting LLMs reason about uncertainty at
the metadata layer. The engine returns facts plus freshness metadata; the agent
decides whether to ask for a stricter read, wait for indexes to catch up, or
degrade to a lower-risk action.

## Design goals

- Scope every freshness contract by `account_id`; no cross-tenant watermarks or
  vector probes are shared.
- Track row-store, columnar-store, vector-index, and procedural-memory freshness
  independently because each path has a different replication and indexing lag.
- Make stale reads explicit in the Open API so agents can see and cite them.
- Reject or downgrade recursive agent plans when their accumulated freshness risk
  exceeds a deterministic budget.
- Avoid full table scans on boards with 1M+ rows by requiring board-scoped,
  account-prefixed indexes and bounded vector `topK`.

## TypeScript contracts

```ts
export type ConsistencyMode =
  | "strong_row"
  | "bounded_staleness"
  | "snapshot"
  | "eventual_vector";

export type FreshnessSource = "row" | "columnar" | "vector" | "procedure_memory";

export interface FreshnessEnvelope {
  account_id: string;
  envelope_id: string;
  board_id?: string;
  mode: ConsistencyMode;
  max_staleness_ms: number;
  created_at: string;
  expires_at: string;
  source_watermarks: FreshnessWatermark[];
  recursive_depth_limit: number;
  estimated_scan_rows: number;
  audit_hash: string;
}

export interface FreshnessWatermark {
  account_id: string;
  envelope_id: string;
  source: FreshnessSource;
  partition_id: string;
  commit_lsn: string;
  indexed_lsn?: string;
  observed_at: string;
  lag_ms: number;
}

export interface AgentContextFreshnessDecision {
  account_id: string;
  decision_id: string;
  envelope_id: string;
  agent_id: string;
  requested_mode: ConsistencyMode;
  granted_mode: ConsistencyMode;
  decision: "allow" | "downgrade" | "block";
  reason_codes: string[];
  deterministic_plan_hash: string;
  audit_hash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_freshness_envelopes (
  account_id            BIGINT NOT NULL,
  envelope_id           UUID NOT NULL,
  board_id              BIGINT,
  mode                  TEXT NOT NULL CHECK (
    mode IN ('strong_row', 'bounded_staleness', 'snapshot', 'eventual_vector')
  ),
  max_staleness_ms      INTEGER NOT NULL CHECK (max_staleness_ms >= 0),
  recursive_depth_limit INTEGER NOT NULL CHECK (recursive_depth_limit BETWEEN 0 AND 8),
  estimated_scan_rows   BIGINT NOT NULL CHECK (estimated_scan_rows >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  audit_hash            BYTEA NOT NULL,
  PRIMARY KEY (account_id, envelope_id)
);

CREATE TABLE agentic_freshness_watermarks (
  account_id     BIGINT NOT NULL,
  envelope_id    UUID NOT NULL,
  source         TEXT NOT NULL CHECK (
    source IN ('row', 'columnar', 'vector', 'procedure_memory')
  ),
  partition_id   TEXT NOT NULL,
  commit_lsn     PG_LSN NOT NULL,
  indexed_lsn    PG_LSN,
  observed_at    TIMESTAMPTZ NOT NULL,
  lag_ms         INTEGER NOT NULL CHECK (lag_ms >= 0),
  PRIMARY KEY (account_id, envelope_id, source, partition_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_freshness_envelopes(account_id, envelope_id)
);

CREATE TABLE agentic_freshness_decisions (
  account_id              BIGINT NOT NULL,
  decision_id             UUID NOT NULL,
  envelope_id             UUID NOT NULL,
  agent_id                TEXT NOT NULL,
  requested_mode          TEXT NOT NULL,
  granted_mode            TEXT NOT NULL,
  decision                TEXT NOT NULL CHECK (decision IN ('allow', 'downgrade', 'block')),
  reason_codes            TEXT[] NOT NULL,
  deterministic_plan_hash BYTEA NOT NULL,
  audit_hash              BYTEA NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, decision_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_freshness_envelopes(account_id, envelope_id)
);

CREATE INDEX agentic_freshness_envelopes_board_idx
  ON agentic_freshness_envelopes (account_id, board_id, created_at DESC);

CREATE INDEX agentic_freshness_watermarks_source_lag_idx
  ON agentic_freshness_watermarks (account_id, source, lag_ms, observed_at DESC);
```

The composite `account_id` prefix is mandatory for tenant isolation and query
planning. Any API path that cannot bind `account_id` before touching these tables
must be rejected at verification time.

## Open API GraphQL shape

```graphql
enum AgenticConsistencyMode {
  STRONG_ROW
  BOUNDED_STALENESS
  SNAPSHOT
  EVENTUAL_VECTOR
}

input AgenticFreshnessEnvelopeInput {
  accountId: ID!
  boardId: ID
  requestedMode: AgenticConsistencyMode!
  maxStalenessMs: Int!
  recursiveDepthLimit: Int!
  estimatedScanRows: String!
}

type AgenticFreshnessWatermark {
  source: String!
  partitionId: String!
  commitLsn: String!
  indexedLsn: String
  lagMs: Int!
  observedAt: String!
}

type AgenticFreshnessEnvelope {
  accountId: ID!
  envelopeId: ID!
  boardId: ID
  mode: AgenticConsistencyMode!
  maxStalenessMs: Int!
  expiresAt: String!
  sourceWatermarks: [AgenticFreshnessWatermark!]!
  auditHash: String!
}

type AgenticFreshnessDecision {
  decisionId: ID!
  decision: String!
  grantedMode: AgenticConsistencyMode!
  reasonCodes: [String!]!
  auditHash: String!
}

extend type Mutation {
  createAgenticFreshnessEnvelope(
    input: AgenticFreshnessEnvelopeInput!
  ): AgenticFreshnessEnvelope!

  verifyAgenticContextFreshness(
    envelopeId: ID!
    deterministicPlanHash: String!
  ): AgenticFreshnessDecision!
}
```

## Lifecycle

1. A planner requests an envelope with an `accountId`, target board, consistency
   mode, staleness budget, depth limit, and estimated scan rows.
2. mondayDB captures deterministic watermarks from row partitions, columnar
   projections, vector indexes, and procedure memory.
3. The verifier compares observed lag against the requested budget and emits an
   allow, downgrade, or block decision.
4. Retrieval, tool execution, and write-intent APIs attach the envelope ID to
   their audit events.
5. Downstream evidence packets cite the envelope so support and enterprise audit
   teams can replay what the agent knew at decision time.

## Semantic retrieval compatibility

The freshness plane does not embed operational rows directly. Instead, it stores
metadata that can be attached to pgvector/HNSW retrieval results:

```ts
export interface AgentPerceivedFreshnessMetadata {
  envelope_id: string;
  consistency_mode: ConsistencyMode;
  max_staleness_ms: number;
  vector_lag_ms: number;
  row_lag_ms: number;
  columnar_lag_ms: number;
  procedure_memory_lag_ms: number;
  recommended_agent_action: "act" | "ask_for_refresh" | "use_read_only_mode";
}
```

An LLM perceives this as retrieval provenance, not as hidden magic. Prompted
context can say: "This answer used bounded staleness of 2,000 ms; vector index
lag was 850 ms; use read-only mode if the action is destructive."

## Agentic guardrails

- Block recursive plans when `recursive_depth_limit` is exceeded or when a child
  plan requests a weaker consistency mode than its parent.
- Cap `estimated_scan_rows` per account and board before any row, columnar, or
  vector query is admitted.
- Require `topK`, `boardId`, and `accountId` for vector retrieval; unbounded HNSW
  scans are not valid agent plans.
- Downgrade to read-only mode when vector lag exceeds the staleness budget but
  row watermarks are current enough for deterministic display.
- Emit a deterministic audit hash over sorted watermarks, plan hash, decision,
  and reason codes so the same inputs replay to the same decision.

## Performance check

Risky pattern for 1M+ row boards:

```sql
SELECT *
FROM agentic_freshness_envelopes
WHERE board_id = $1
ORDER BY created_at DESC;
```

This can scan across tenants and should be rejected because it does not bind
`account_id`. The safe form is:

```sql
SELECT *
FROM agentic_freshness_envelopes
WHERE account_id = $1
  AND board_id = $2
ORDER BY created_at DESC
LIMIT 50;
```

The safe query uses `agentic_freshness_envelopes_board_idx` and bounds the result
set. For vector-aware flows, freshness metadata should be joined by envelope ID
after candidate retrieval, never used to fan out across all historical envelopes.

## Enterprise audit behavior

Every envelope and decision writes an immutable audit event:

```ts
export interface FreshnessAuditEvent {
  account_id: string;
  event_id: string;
  envelope_id: string;
  actor_type: "agent" | "human" | "system";
  actor_id: string;
  event_type: "envelope_created" | "freshness_verified" | "freshness_expired";
  previous_audit_hash?: string;
  audit_hash: string;
  created_at: string;
}
```

The audit log is deterministic and replayable. It should not include prompt text
unless that text is already stored under the account's governed retention policy;
instead, store `deterministic_plan_hash` and citations to evidence packets.

