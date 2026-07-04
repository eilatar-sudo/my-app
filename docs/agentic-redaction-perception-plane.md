# Agentic Redaction and Perception Plane

## Why this plane exists

The product trade-off is richer agent context versus enterprise privacy guarantees.
Agents become more useful when mondayDB can expose row, columnar, semantic, and
procedural memory together, but the database must never leak sensitive fields into
LLM prompts, embeddings, tool inputs, logs, or cross-tenant vector neighborhoods.

The redaction and perception plane makes data minimization a deterministic database
contract. It compiles tenant-scoped policy into explicit redaction envelopes before
agent context assembly or vector materialization. Probabilistic models may consume
the resulting perception cards, but the database decides what is visible using
auditable rules, stable source watermarks, and account-scoped indexes.

## Scope

This plane covers:

- Deterministic field, cell, entity, and procedure-memory redaction.
- Safe projections for pgvector/HNSW indexing and retrieval-augmented generation.
- Agent perception cards that expose bounded metadata instead of raw planner or
  policy internals.
- Audit records that prove which data was hidden, transformed, or allowed.
- Guardrails that reject recursive or expensive agent requests before they scan
  1M+ row boards.

This plane does not make model-based sensitivity decisions. Classification signals
may be inputs, but policy evaluation is deterministic and replayable.

## Architecture fit

mondayDB remains a decoupled storage and compute system:

1. Row storage is the transactional source of truth for board items and cell
   updates.
2. Columnar storage serves analytics and aggregation projections.
3. Vector indexes store safe, tenant-partitioned semantic projections only.
4. Agentic compute reads through a compiled redaction envelope before assembling
   context, procedural instructions, or tool arguments.

Every contract below carries `account_id`. Composite keys and indexes lead with
`account_id` to preserve multi-tenant isolation and predictable planning.

## Deterministic policy model

Policy evaluation uses a stable precedence order:

1. Tenant isolation: reject if the request `account_id` does not match every
   source reference.
2. Legal hold and explicit deny rules.
3. Purpose boundary constraints.
4. Role, app, integration, and agent capability scopes.
5. Field-level and semantic-tag redaction rules.
6. Budget, recursion, and neighbor-impact guardrails.
7. Allow rules.

If two rules conflict, the more restrictive rule wins. A missing policy is not an
implicit allow for agentic surfaces.

## TypeScript contracts

```ts
type AccountId = string;
type BoardId = string;
type ItemId = string;
type ColumnId = string;
type ProcedureId = string;
type AgentId = string;
type PolicyId = string;
type PurposeBoundaryId = string;
type AuditHash = string;

type SourceKind =
  | "ROW_CELL"
  | "COLUMNAR_PROJECTION"
  | "VECTOR_MEMORY"
  | "PROCEDURE_MEMORY"
  | "TOOL_RESULT";

type RedactionDecision =
  | "ALLOW"
  | "MASK"
  | "DROP"
  | "HASH"
  | "RANGE_BUCKET"
  | "EMBEDDING_EXCLUDE"
  | "SAFE_SUMMARY_ONLY"
  | "REJECT";

type SensitivityTag =
  | "PII"
  | "FINANCIAL"
  | "HEALTH"
  | "CUSTOMER_SECRET"
  | "INTERNAL_NOTE"
  | "LOW_RISK";

interface AgenticRedactionPolicy {
  account_id: AccountId;
  policy_id: PolicyId;
  version: number;
  name: string;
  status: "DRAFT" | "ACTIVE" | "DISABLED";
  purpose_boundary_id: PurposeBoundaryId;
  applies_to_agent_ids: AgentId[];
  applies_to_board_ids: BoardId[];
  default_decision: RedactionDecision;
  max_vector_top_k: number;
  max_expansion_depth: number;
  max_visible_fields_per_entity: number;
  rules: AgenticRedactionRule[];
  created_at: string;
  updated_at: string;
  audit_hash: AuditHash;
}

interface AgenticRedactionRule {
  account_id: AccountId;
  policy_id: PolicyId;
  rule_id: string;
  priority: number;
  source_kind: SourceKind;
  board_id?: BoardId;
  column_id?: ColumnId;
  sensitivity_tags: SensitivityTag[];
  decision: RedactionDecision;
  replacement_label?: string;
  allow_embedding: boolean;
  allow_prompt_context: boolean;
  allow_tool_argument: boolean;
  reason_code: string;
}

interface AgenticSourceRef {
  account_id: AccountId;
  source_kind: SourceKind;
  board_id?: BoardId;
  item_id?: ItemId;
  column_id?: ColumnId;
  procedure_id?: ProcedureId;
  source_version: string;
  source_watermark: string;
  sensitivity_tags: SensitivityTag[];
}

interface AgenticRedactionEnvelope {
  account_id: AccountId;
  envelope_id: string;
  request_id: string;
  agent_id: AgentId;
  purpose_boundary_id: PurposeBoundaryId;
  policy_id: PolicyId;
  policy_version: number;
  budget_token_hash: string;
  source_refs: AgenticSourceRef[];
  decisions: AgenticFieldDecision[];
  source_watermark_floor: string;
  vector_watermark_floor?: string;
  max_vector_top_k: number;
  max_expansion_depth: number;
  expires_at: string;
  request_hash: AuditHash;
  envelope_hash: AuditHash;
  previous_audit_hash?: AuditHash;
}

interface AgenticFieldDecision {
  account_id: AccountId;
  source_ref_hash: string;
  field_path: string;
  decision: RedactionDecision;
  reason_code: string;
  visible_to_prompt: boolean;
  visible_to_embedding: boolean;
  visible_to_tool: boolean;
  transformed_value_hash?: string;
}

interface AgenticPerceptionCard {
  account_id: AccountId;
  perception_card_id: string;
  envelope_id: string;
  entity_label: string;
  entity_tags: string[];
  risk_tags: string[];
  visible_summary: string;
  redacted_field_count: number;
  omitted_source_count: number;
  procedure_memory_refs: ProcedureId[];
  suggested_actions: string[];
  forbidden_actions: string[];
  source_watermarks: string[];
  audit_hash: AuditHash;
}

interface AgenticVectorSafeProjection {
  account_id: AccountId;
  projection_id: string;
  envelope_id: string;
  source_ref_hashes: string[];
  embedding_namespace: string;
  embedding_text: string;
  metadata_tags: string[];
  excluded_sensitivity_tags: SensitivityTag[];
  source_watermark_floor: string;
  projection_hash: AuditHash;
}
```

## SQL schema

```sql
CREATE TABLE agentic_redaction_policies (
  account_id BIGINT NOT NULL,
  policy_id UUID NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED')),
  purpose_boundary_id UUID NOT NULL,
  applies_to_agent_ids UUID[] NOT NULL DEFAULT '{}',
  applies_to_board_ids BIGINT[] NOT NULL DEFAULT '{}',
  default_decision TEXT NOT NULL,
  max_vector_top_k INTEGER NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_expansion_depth INTEGER NOT NULL CHECK (max_expansion_depth BETWEEN 0 AND 5),
  max_visible_fields_per_entity INTEGER NOT NULL CHECK (max_visible_fields_per_entity BETWEEN 1 AND 200),
  rule_count INTEGER NOT NULL DEFAULT 0,
  audit_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id, version)
);

CREATE INDEX agentic_redaction_policies_active_idx
  ON agentic_redaction_policies (account_id, purpose_boundary_id, status, updated_at DESC);

CREATE TABLE agentic_redaction_rules (
  account_id BIGINT NOT NULL,
  policy_id UUID NOT NULL,
  policy_version INTEGER NOT NULL,
  rule_id UUID NOT NULL,
  priority INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  board_id BIGINT,
  column_id TEXT,
  sensitivity_tags TEXT[] NOT NULL DEFAULT '{}',
  decision TEXT NOT NULL,
  replacement_label TEXT,
  allow_embedding BOOLEAN NOT NULL DEFAULT false,
  allow_prompt_context BOOLEAN NOT NULL DEFAULT false,
  allow_tool_argument BOOLEAN NOT NULL DEFAULT false,
  reason_code TEXT NOT NULL,
  PRIMARY KEY (account_id, policy_id, policy_version, rule_id),
  FOREIGN KEY (account_id, policy_id, policy_version)
    REFERENCES agentic_redaction_policies (account_id, policy_id, version)
);

CREATE INDEX agentic_redaction_rules_match_idx
  ON agentic_redaction_rules (
    account_id,
    policy_id,
    policy_version,
    source_kind,
    board_id,
    column_id,
    priority
  );

CREATE TABLE agentic_redaction_envelopes (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  request_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  purpose_boundary_id UUID NOT NULL,
  policy_id UUID NOT NULL,
  policy_version INTEGER NOT NULL,
  budget_token_hash BYTEA NOT NULL,
  source_watermark_floor TEXT NOT NULL,
  vector_watermark_floor TEXT,
  max_vector_top_k INTEGER NOT NULL,
  max_expansion_depth INTEGER NOT NULL,
  request_hash BYTEA NOT NULL,
  envelope_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, envelope_id)
);

CREATE INDEX agentic_redaction_envelopes_request_idx
  ON agentic_redaction_envelopes (account_id, request_id, created_at DESC);

CREATE TABLE agentic_redaction_decisions (
  account_id BIGINT NOT NULL,
  envelope_id UUID NOT NULL,
  source_ref_hash BYTEA NOT NULL,
  field_path TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  visible_to_prompt BOOLEAN NOT NULL,
  visible_to_embedding BOOLEAN NOT NULL,
  visible_to_tool BOOLEAN NOT NULL,
  transformed_value_hash BYTEA,
  PRIMARY KEY (account_id, envelope_id, source_ref_hash, field_path),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_redaction_envelopes (account_id, envelope_id)
);

CREATE INDEX agentic_redaction_decisions_visibility_idx
  ON agentic_redaction_decisions (
    account_id,
    envelope_id,
    visible_to_embedding,
    visible_to_prompt,
    visible_to_tool
  );

CREATE TABLE agentic_vector_safe_projections (
  account_id BIGINT NOT NULL,
  projection_id UUID NOT NULL,
  envelope_id UUID NOT NULL,
  embedding_namespace TEXT NOT NULL,
  embedding_text TEXT NOT NULL,
  metadata_tags TEXT[] NOT NULL DEFAULT '{}',
  excluded_sensitivity_tags TEXT[] NOT NULL DEFAULT '{}',
  source_watermark_floor TEXT NOT NULL,
  projection_hash BYTEA NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, projection_id),
  FOREIGN KEY (account_id, envelope_id)
    REFERENCES agentic_redaction_envelopes (account_id, envelope_id)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_vector_safe_projections_p0
  PARTITION OF agentic_vector_safe_projections
  FOR VALUES WITH (MODULUS 64, REMAINDER 0);

CREATE INDEX agentic_vector_safe_projection_route_idx
  ON agentic_vector_safe_projections (
    account_id,
    embedding_namespace,
    source_watermark_floor,
    created_at DESC
  );

-- Deploy HNSW per account hash partition or per large tenant namespace partition.
-- The query planner must first route by account_id and embedding_namespace.
CREATE INDEX agentic_vector_safe_projection_hnsw_idx
  ON agentic_vector_safe_projections
  USING hnsw (embedding vector_cosine_ops);
```

## Open API GraphQL surface

Every field requires `accountId`; server-side execution also derives and validates
the account from the caller identity.

```graphql
enum AgenticRedactionDecision {
  ALLOW
  MASK
  DROP
  HASH
  RANGE_BUCKET
  EMBEDDING_EXCLUDE
  SAFE_SUMMARY_ONLY
  REJECT
}

input AgenticRedactionRuleInput {
  sourceKind: String!
  boardId: ID
  columnId: String
  sensitivityTags: [String!]!
  decision: AgenticRedactionDecision!
  replacementLabel: String
  allowEmbedding: Boolean!
  allowPromptContext: Boolean!
  allowToolArgument: Boolean!
  reasonCode: String!
}

input AgenticRedactionPolicyInput {
  accountId: ID!
  name: String!
  purposeBoundaryId: ID!
  appliesToAgentIds: [ID!]!
  appliesToBoardIds: [ID!]!
  defaultDecision: AgenticRedactionDecision!
  maxVectorTopK: Int!
  maxExpansionDepth: Int!
  maxVisibleFieldsPerEntity: Int!
  rules: [AgenticRedactionRuleInput!]!
}

type AgenticRedactionPolicy {
  accountId: ID!
  policyId: ID!
  version: Int!
  status: String!
  auditHash: String!
  updatedAt: String!
}

type AgenticPerceptionCard {
  accountId: ID!
  perceptionCardId: ID!
  envelopeId: ID!
  entityLabel: String!
  entityTags: [String!]!
  riskTags: [String!]!
  visibleSummary: String!
  redactedFieldCount: Int!
  omittedSourceCount: Int!
  procedureMemoryRefs: [ID!]!
  suggestedActions: [String!]!
  forbiddenActions: [String!]!
  sourceWatermarks: [String!]!
  auditHash: String!
}

type AgenticRedactionEnvelope {
  accountId: ID!
  envelopeId: ID!
  policyId: ID!
  policyVersion: Int!
  maxVectorTopK: Int!
  maxExpansionDepth: Int!
  sourceWatermarkFloor: String!
  vectorWatermarkFloor: String
  envelopeHash: String!
  perceptionCards: [AgenticPerceptionCard!]!
}

type Mutation {
  createAgenticRedactionPolicy(input: AgenticRedactionPolicyInput!): AgenticRedactionPolicy!
  activateAgenticRedactionPolicy(accountId: ID!, policyId: ID!, version: Int!): AgenticRedactionPolicy!
  compileAgenticRedactionEnvelope(
    accountId: ID!
    requestId: ID!
    agentId: ID!
    purposeBoundaryId: ID!
    sourceRefs: [ID!]!
    budgetToken: String!
  ): AgenticRedactionEnvelope!
}

type Query {
  agenticPerceptionCards(
    accountId: ID!
    envelopeId: ID!
    first: Int!
  ): [AgenticPerceptionCard!]!
}
```

## Semantic retrieval and HNSW compatibility

Vector indexes must contain only `AgenticVectorSafeProjection.embedding_text`.
Raw cell values tagged as PII, financial, health, customer secret, or internal
note are excluded unless an active policy allows a deterministic transformation
that is safe for embeddings.

HNSW routing requirements:

- Prefix lookup with `account_id` and `embedding_namespace`.
- Route large tenants to account-hash partitions before vector distance search.
- Cap `topK` by the compiled envelope `max_vector_top_k`.
- Persist `source_watermark_floor` and `projection_hash` with each embedding.
- Return perception metadata and source hashes, not hidden raw text.

This preserves RAG usefulness while making stale or unsafe semantic context
explicit to the planner and to audit replay.

## Agentic guardrails

The planner rejects envelope compilation when any of these conditions are true:

- A source reference lacks `account_id` or mixes accounts.
- A query requests `topK` above the active policy cap.
- Expansion depth exceeds `max_expansion_depth`.
- The source set would require a full board scan on boards with 1M+ rows.
- Column filters do not use indexed board, item, column, or sensitivity-tag
  predicates.
- The budget token cannot reserve row, columnar, vector, and redaction CPU cost.
- A tool argument requests a field with `visible_to_tool = false`.
- A procedure memory record asks the agent to bypass redaction or fetch hidden
  fields recursively.

Recursive agent loops are contained by hashing `(account_id, agent_id,
purpose_boundary_id, source_ref_hashes, requested_actions)` and rejecting repeated
expansions that do not introduce new allowed source watermarks.

## Auditability

Each envelope commits:

- Request hash.
- Policy id and version.
- Ordered source reference hashes.
- Ordered field decisions.
- Budget token hash.
- Source and vector watermarks.
- Previous audit hash.
- Envelope hash.

Audit logs must never store raw redacted values. For transformed values, store a
hash of the transformed representation and the deterministic reason code.

## Performance checks

For 1M+ row boards, avoid these full-scan hazards:

- `WHERE account_id = ?` without `board_id`, item ids, source hashes, or indexed
  sensitivity tags.
- Vector search without account/namespace partition routing.
- Redaction rule evaluation against unbounded JSON paths.
- Per-cell policy compilation inside a large aggregation loop.
- Recomputing safe projections synchronously in the write transaction.

Recommended execution shape:

1. Compile policy once per request into an in-memory decision table keyed by
   `(source_kind, board_id, column_id, sensitivity_tag)`.
2. Fetch source refs through account-leading indexes.
3. Apply redaction while assembling context packets.
4. Commit envelope and decisions as append-only audit records.
5. Materialize vector-safe projections asynchronously after source commit.

The only synchronous latency added to agent reads should be bounded policy lookup,
decision-table compilation, and source-ref filtering. Embedding generation and
HNSW insertion stay off the transaction-critical path.

## Agent perception contract

An LLM or agent sees a perception card like:

```json
{
  "entityLabel": "Customer escalation from Board 42",
  "entityTags": ["customer", "escalation", "renewal-risk"],
  "riskTags": ["PII_REDACTED", "TOOL_WRITE_FORBIDDEN"],
  "visibleSummary": "Escalation is open; renewal risk is high; owner is visible.",
  "redactedFieldCount": 3,
  "omittedSourceCount": 1,
  "procedureMemoryRefs": ["proc_triage_escalation_v4"],
  "suggestedActions": ["summarize_status", "draft_owner_update"],
  "forbiddenActions": ["export_raw_customer_email", "write_without_preflight"],
  "sourceWatermarks": ["row:board/42@91723", "vector:customer-memory@552"],
  "auditHash": "sha256:..."
}
```

The card is intentionally explicit: it tells the agent what it can safely do and
what is forbidden without exposing hidden values or relying on magic AI behavior
inside mondayDB.

## Rollout checklist

- Ship policy authoring and activation behind tenant-level feature flags.
- Start with read-only prompt and embedding redaction before tool-argument
  enforcement.
- Backfill sensitivity tags from existing schema contracts and data-classification
  systems.
- Validate projection hashes against replayed source watermarks.
- Add regression suites for PII exclusion, cross-account rejection, vector topK
  limits, and recursive procedure-memory bypass attempts.
- Expose audit packets to enterprise admins through the Open API.
