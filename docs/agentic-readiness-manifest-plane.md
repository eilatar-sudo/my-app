# Agentic Readiness Manifest Plane

## Why before how: deterministic readiness beats runtime guesswork

mondayDB can become agent-ready without letting probabilistic systems decide how
the database behaves. The trade-off is to precompute a deterministic readiness
manifest for each board, workspace, or workflow before an agent acts. That adds a
small freshness lag, but it keeps query planning predictable, preserves ACID row
updates, protects neighbor tenants, and lets agents understand which semantic,
procedural, and tool-use affordances are safe to use.

The manifest is not an AI model output. It is a tenant-scoped control-plane
record compiled from schema contracts, row and columnar watermarks, semantic
index coverage, procedural memory references, purpose boundaries, and workload
budgets. Agents can perceive the manifest as a compact "operating manual" for a
board, while mondayDB still executes deterministic plans against row, columnar,
and vector paths.

## Product surface

- **For agents:** discover whether a board can support autonomous reads,
  semantic retrieval, aggregation, or tool-triggered writes before issuing an
  expensive plan.
- **For admins:** expose why a board is or is not agent-ready with deterministic
  reasons, stale indexes, missing schema contracts, and budget limits.
- **For the Open API:** provide a GraphQL-first manifest lookup and compile
  mutation so every readiness signal is available outside the UI.
- **For SRE and enterprise trust:** record audit hashes and planner decisions
  without storing prompts or relying on non-deterministic model behavior.

## TypeScript contracts

```ts
export type AgenticActionClass =
  | "READ_ROWS"
  | "SEMANTIC_RETRIEVAL"
  | "COLUMNAR_AGGREGATION"
  | "TOOL_INVOCATION"
  | "WRITE_INTENT";

export interface AgenticReadinessManifest {
  accountId: string;
  boardId: string;
  manifestId: string;
  manifestVersion: number;
  status: "READY" | "DEGRADED" | "BLOCKED";
  compiledAt: string;
  validUntil: string;
  sourceWatermarks: ReadinessWatermarks;
  allowedActionClasses: AgenticActionClass[];
  semanticCoverage: SemanticCoverage;
  proceduralMemoryRefs: ProceduralMemoryRef[];
  guardrailEnvelope: ReadinessGuardrailEnvelope;
  perceptionCard: AgentPerceptionCard;
  audit: ReadinessAuditEnvelope;
}

export interface ReadinessWatermarks {
  rowCommitLsn: string;
  columnarSnapshotId: string;
  semanticIndexVersion: number;
  schemaContractVersion: number;
  policyEnvelopeVersion: number;
}

export interface SemanticCoverage {
  embeddingModelId: string;
  vectorIndexId: string;
  hnswIndexVersion: number;
  coveredItemCount: number;
  indexedColumnIds: string[];
  freshnessState: "CURRENT" | "STALE" | "REBUILDING";
  missingCoverageReasons: string[];
}

export interface ProceduralMemoryRef {
  procedureId: string;
  procedureVersion: number;
  actionClass: AgenticActionClass;
  instructionSummary: string;
  requiredPurposeRefs: string[];
}

export interface ReadinessGuardrailEnvelope {
  maxRowsScanned: number;
  maxColumnarPartitions: number;
  maxVectorTopK: number;
  maxVectorCandidateReads: number;
  maxRecursiveExpansions: number;
  maxToolCalls: number;
  requiredPredicates: Array<"account_id" | "board_id" | "purpose_ref">;
  blockedIfEstimateExceeds: boolean;
}

export interface AgentPerceptionCard {
  title: string;
  description: string;
  tags: string[];
  safeDefaultAction: AgenticActionClass;
  retrievalHints: string[];
  humanEscalationReasons: string[];
}

export interface ReadinessAuditEnvelope {
  auditEventId: string;
  previousAuditHash: string;
  manifestHash: string;
  compilerVersion: string;
  deterministicInputsHash: string;
}
```

## SQL schema

```sql
CREATE TABLE agentic_readiness_manifests (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  manifest_id UUID NOT NULL,
  manifest_version BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY', 'DEGRADED', 'BLOCKED')),
  allowed_action_classes TEXT[] NOT NULL,
  row_commit_lsn TEXT NOT NULL,
  columnar_snapshot_id TEXT NOT NULL,
  semantic_index_version BIGINT NOT NULL,
  schema_contract_version BIGINT NOT NULL,
  policy_envelope_version BIGINT NOT NULL,
  guardrail_envelope JSONB NOT NULL,
  perception_card JSONB NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  compiled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_audit_hash BYTEA NOT NULL,
  manifest_hash BYTEA NOT NULL,
  deterministic_inputs_hash BYTEA NOT NULL,
  compiler_version TEXT NOT NULL,
  PRIMARY KEY (account_id, board_id, manifest_version),
  UNIQUE (account_id, manifest_id)
);

CREATE INDEX agentic_readiness_latest_idx
  ON agentic_readiness_manifests
  (account_id, board_id, manifest_version DESC);

CREATE INDEX agentic_readiness_status_idx
  ON agentic_readiness_manifests
  (account_id, status, compiled_at DESC);

CREATE TABLE agentic_readiness_semantic_refs (
  account_id BIGINT NOT NULL,
  board_id BIGINT NOT NULL,
  manifest_id UUID NOT NULL,
  vector_index_id UUID NOT NULL,
  embedding_model_id TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  covered_item_count BIGINT NOT NULL,
  indexed_column_ids BIGINT[] NOT NULL,
  hnsw_index_version BIGINT NOT NULL,
  freshness_state TEXT NOT NULL CHECK (
    freshness_state IN ('CURRENT', 'STALE', 'REBUILDING')
  ),
  PRIMARY KEY (account_id, board_id, manifest_id),
  FOREIGN KEY (account_id, manifest_id)
    REFERENCES agentic_readiness_manifests (account_id, manifest_id)
);

-- Create the HNSW index per account-hash shard or physical tenant partition.
-- The account_id predicate must be applied before vector ranking.
CREATE INDEX agentic_readiness_semantic_hnsw_idx
  ON agentic_readiness_semantic_refs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 96);
```

All primary and secondary access paths begin with `account_id` to preserve
multi-tenant isolation. The vector table stores manifest-level embeddings only;
item-level embeddings remain in the semantic index lifecycle plane.

## Open API GraphQL shape

```graphql
enum AgenticReadinessStatus {
  READY
  DEGRADED
  BLOCKED
}

input AgenticReadinessCompileInput {
  accountId: ID!
  boardId: ID!
  purposeRef: ID!
  requestedActionClasses: [AgenticActionClass!]!
  maxVectorTopK: Int = 50
  maxRecursiveExpansions: Int = 2
}

type AgenticReadinessManifest {
  accountId: ID!
  boardId: ID!
  manifestId: ID!
  manifestVersion: Int!
  status: AgenticReadinessStatus!
  allowedActionClasses: [AgenticActionClass!]!
  semanticCoverage: SemanticCoverage!
  proceduralMemoryRefs: [ProceduralMemoryRef!]!
  guardrailEnvelope: ReadinessGuardrailEnvelope!
  perceptionCard: AgentPerceptionCard!
  audit: ReadinessAuditEnvelope!
}

type Query {
  agenticReadinessManifest(
    accountId: ID!
    boardId: ID!
    purposeRef: ID!
  ): AgenticReadinessManifest
}

type Mutation {
  compileAgenticReadinessManifest(
    input: AgenticReadinessCompileInput!
  ): AgenticReadinessManifest!
}
```

## Deterministic compile flow

1. Validate `account_id`, `board_id`, and `purpose_ref` before reading any
   board metadata.
2. Load schema contracts, policy envelopes, row watermarks, columnar snapshots,
   and semantic index state using account-scoped indexes.
3. Estimate each requested action class with deterministic planner statistics:
   row count, columnar partition count, vector candidate reads, recursive
   expansion depth, and tool call budget.
4. Return `BLOCKED` when a required predicate is missing, a semantic index is
   rebuilding for a requested semantic action, or the estimated plan exceeds the
   guardrail envelope.
5. Hash canonical JSON inputs into `deterministic_inputs_hash`, then hash the
   manifest with the previous audit hash to produce `manifest_hash`.

No LLM prompt, completion, or model score participates in readiness status. An
agent may read the manifest, but it cannot change planner admission semantics.

## Semantic retrieval and HNSW compatibility

The manifest can be embedded as a compact metadata document:

```json
{
  "account_id": "123",
  "board_id": "456",
  "tags": ["crm", "renewals", "agent-ready"],
  "safe_actions": ["READ_ROWS", "SEMANTIC_RETRIEVAL"],
  "procedures": ["summarize-renewal-risk@3"],
  "freshness": "CURRENT"
}
```

An agent searching for usable boards performs tenant-filtered retrieval:

```sql
SELECT manifest_id, board_id, vector_index_id
FROM agentic_readiness_semantic_refs
WHERE account_id = $1
ORDER BY embedding <=> $2
LIMIT LEAST($3, 50);
```

The `account_id = $1` predicate is mandatory and enforced by the retrieval
router before vector ranking. A request with `topK > 50` is clamped or rejected
based on the caller's workload envelope.

## Performance checks for 1M+ row boards

- Do not compile readiness by scanning board items. Use maintained row-count
  statistics, columnar snapshot metadata, semantic index manifests, and schema
  contract versions.
- Reject row or aggregation action classes when the candidate plan lacks both
  `account_id` and `board_id` predicates.
- Mark manifests `DEGRADED` rather than `READY` when semantic coverage is stale;
  do not trigger synchronous reindexing from the lookup path.
- Keep recursive expansion bounded by `maxRecursiveExpansions`; each expansion
  must reserve budget before issuing additional row, columnar, vector, or tool
  calls.
- Store perception cards as manifest metadata so agents avoid probing multiple
  large boards to learn their purpose.

## Agentic guardrails

- **No cross-tenant perception:** every manifest, semantic reference, audit
  event, and GraphQL resolver is scoped by `account_id`.
- **No unbounded autonomy:** action classes are enumerated, not free-form; tool
  invocation requires both a readiness manifest and a separate tool lease.
- **No hidden magic:** readiness is a deterministic compiler result. Agents can
  explain it to users, but cannot override it with a probabilistic rationale.
- **No expensive recursion:** recursive query plans must carry the manifest ID,
  depth counter, budget reservation, and prior step hash.

## Agent perception model

An LLM should see the readiness manifest as an affordance map:

- `perceptionCard.title` and `description` explain what the board represents.
- `tags` and `retrievalHints` improve semantic routing without exposing rows.
- `proceduralMemoryRefs` tell the agent which approved instructions to follow.
- `humanEscalationReasons` make blocked or degraded states actionable for users.

This keeps mondayDB deterministic while making database objects legible to
agents that need long-term memory, retrieval, and safe tool use.
