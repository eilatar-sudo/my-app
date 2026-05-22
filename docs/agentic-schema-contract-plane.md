# Agentic Schema Contract Plane

## Why this plane exists

mondayDB is intentionally schemaless at the product layer, which keeps WorkOS boards flexible and fast to evolve. Autonomous agents need a more explicit contract: they must know which fields are identifiers, which columns are safe filters, which values encode workflow state, and which procedures are allowed before they generate queries or writes.

The Agentic Schema Contract Plane adds a deterministic metadata layer over boards, columns, views, entity graph nodes, memory capsules, and tool affordances. It does not make the storage engine probabilistic. Instead, it gives agents a tenant-scoped, auditable map of "what this data means" and "how it may be used" so mondayDB can support semantic retrieval and procedural memory without sacrificing ACID behavior, isolation, or predictable query planning.

### Product trade-off

- **Flexibility vs. predictability:** Teams can keep schemaless boards, but agent-facing workflows rely on versioned contracts instead of runtime guessing.
- **Latency vs. freshness:** Contract publishing is asynchronous from board metadata changes, but each query plan reads one immutable contract version so planning remains low latency and replayable.
- **Semantic power vs. tenant safety:** Contract summaries can be embedded for HNSW search, but every vector and row lookup is prefixed by `account_id` and constrained by explicit board and contract scopes.

## Contract lifecycle

1. **Draft:** A product, admin, or policy automation proposes a contract from board metadata, known procedures, and historical lineage anchors.
2. **Validate:** Deterministic validators confirm tenant scope, indexed access paths, field cardinality, allowed operations, and policy compatibility.
3. **Publish:** A contract version becomes immutable and receives a deterministic `contract_hash`.
4. **Bind:** Agent plans, memory retrieval, and tool execution reference the published contract version by ID.
5. **Deprecate:** New versions can supersede old contracts, but old versions remain replayable for audit and support investigations.

Agents do not infer hidden schema from sampled rows. They consume published contracts and may request a new draft when the metadata is insufficient.

## TypeScript interfaces

```ts
export type ContractStatus = "draft" | "published" | "deprecated";
export type FieldRole =
  | "identity"
  | "state"
  | "owner"
  | "date"
  | "metric"
  | "relationship"
  | "free_text"
  | "embedding_source"
  | "procedure_hint";

export type AccessPathKind = "row_store" | "columnar" | "vector_hnsw" | "entity_graph";
export type OperationKind = "filter" | "sort" | "aggregate" | "join" | "semantic_search" | "write";

export interface AgenticSchemaContract {
  account_id: string;
  contract_id: string;
  contract_version: number;
  status: ContractStatus;
  board_id: string;
  name: string;
  description: string;
  field_contracts: AgenticFieldContract[];
  procedural_contracts: AgenticProcedureContract[];
  semantic_contract: AgenticSemanticContract;
  guardrail_contract: AgenticSchemaGuardrailContract;
  created_by: string;
  created_at: string;
  published_at?: string;
  supersedes_contract_id?: string;
  contract_hash: string;
}

export interface AgenticFieldContract {
  account_id: string;
  contract_id: string;
  field_id: string;
  board_id: string;
  column_id?: string;
  role: FieldRole;
  value_type: "string" | "number" | "boolean" | "date" | "enum" | "person" | "file" | "json";
  nullable: boolean;
  pii_classification: "none" | "internal" | "confidential" | "regulated";
  cardinality_hint: "low" | "medium" | "high" | "unknown";
  allowed_operations: OperationKind[];
  required_predicates: string[];
  access_paths: AgenticAccessPath[];
  semantic_tags: string[];
  agent_description: string;
}

export interface AgenticAccessPath {
  kind: AccessPathKind;
  index_name: string;
  prefix_columns: ["account_id", ...string[]];
  supports_covering_read: boolean;
  estimated_selectivity: "high" | "medium" | "low" | "unknown";
}

export interface AgenticProcedureContract {
  account_id: string;
  contract_id: string;
  procedure_id: string;
  title: string;
  intent: string;
  preconditions: string[];
  deterministic_steps: string[];
  allowed_tool_capability_ids: string[];
  write_intent_required: boolean;
  review_required_when: string[];
  agent_prompt_hint: string;
}

export interface AgenticSemanticContract {
  account_id: string;
  contract_id: string;
  embedding_scope: "metadata_only" | "metadata_and_approved_values";
  embedding_model_id: string;
  embedding_vector_ref?: string;
  hnsw_namespace: string;
  semantic_summary: string;
  retrieval_filters: {
    account_id: string;
    board_id: string;
    contract_id: string;
    status: "published";
  };
}

export interface AgenticSchemaGuardrailContract {
  account_id: string;
  contract_id: string;
  max_rows_per_agent_step: number;
  max_columns_per_projection: number;
  max_semantic_top_k: number;
  max_graph_expansion_depth: number;
  require_budget_reservation: boolean;
  reject_unindexed_filters: boolean;
  reject_unknown_fields: boolean;
  require_human_review_for_pii: boolean;
}
```

## SQL schema

The row store owns the immutable contract records. The columnar layer can mirror published contracts for analytics about adoption and failures, but agent planning must read from the row-store source of truth.

```sql
CREATE TABLE agentic_schema_contracts (
  account_id            BIGINT NOT NULL,
  contract_id           UUID NOT NULL,
  contract_version      INTEGER NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('draft', 'published', 'deprecated')),
  board_id              BIGINT NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  semantic_summary      TEXT NOT NULL,
  guardrail_config      JSONB NOT NULL,
  created_by            BIGINT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at          TIMESTAMPTZ,
  supersedes_contract_id UUID,
  contract_hash         BYTEA NOT NULL,
  PRIMARY KEY (account_id, contract_id, contract_version)
);

CREATE INDEX asc_published_board_idx
  ON agentic_schema_contracts (account_id, board_id, status, contract_version DESC)
  WHERE status = 'published';

CREATE TABLE agentic_field_contracts (
  account_id              BIGINT NOT NULL,
  contract_id             UUID NOT NULL,
  contract_version        INTEGER NOT NULL,
  field_id                UUID NOT NULL,
  board_id                BIGINT NOT NULL,
  column_id               TEXT,
  role                    TEXT NOT NULL,
  value_type              TEXT NOT NULL,
  nullable                BOOLEAN NOT NULL,
  pii_classification      TEXT NOT NULL,
  cardinality_hint        TEXT NOT NULL,
  allowed_operations      TEXT[] NOT NULL,
  required_predicates     TEXT[] NOT NULL,
  access_paths            JSONB NOT NULL,
  semantic_tags           TEXT[] NOT NULL,
  agent_description       TEXT NOT NULL,
  PRIMARY KEY (account_id, contract_id, contract_version, field_id),
  FOREIGN KEY (account_id, contract_id, contract_version)
    REFERENCES agentic_schema_contracts (account_id, contract_id, contract_version)
);

CREATE INDEX afc_column_lookup_idx
  ON agentic_field_contracts (account_id, board_id, column_id, contract_id, contract_version);

CREATE TABLE agentic_procedure_contracts (
  account_id                BIGINT NOT NULL,
  contract_id               UUID NOT NULL,
  contract_version          INTEGER NOT NULL,
  procedure_id              UUID NOT NULL,
  title                     TEXT NOT NULL,
  intent                    TEXT NOT NULL,
  preconditions             TEXT[] NOT NULL,
  deterministic_steps       JSONB NOT NULL,
  allowed_tool_capability_ids UUID[] NOT NULL,
  write_intent_required     BOOLEAN NOT NULL,
  review_required_when      TEXT[] NOT NULL,
  agent_prompt_hint         TEXT NOT NULL,
  PRIMARY KEY (account_id, contract_id, contract_version, procedure_id),
  FOREIGN KEY (account_id, contract_id, contract_version)
    REFERENCES agentic_schema_contracts (account_id, contract_id, contract_version)
);

CREATE TABLE agentic_schema_contract_embeddings (
  account_id          BIGINT NOT NULL,
  contract_id         UUID NOT NULL,
  contract_version    INTEGER NOT NULL,
  board_id            BIGINT NOT NULL,
  embedding_model_id  TEXT NOT NULL,
  embedding           vector(1536) NOT NULL,
  source_hash         BYTEA NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, contract_id, contract_version, embedding_model_id)
);

CREATE INDEX asce_hnsw_idx
  ON agentic_schema_contract_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX asce_tenant_scope_idx
  ON agentic_schema_contract_embeddings (account_id, board_id, contract_id, contract_version);

CREATE TABLE agentic_schema_contract_audit (
  account_id          BIGINT NOT NULL,
  audit_id            UUID NOT NULL,
  contract_id         UUID NOT NULL,
  contract_version    INTEGER NOT NULL,
  actor_id            BIGINT NOT NULL,
  action              TEXT NOT NULL,
  request_hash        BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  audit_hash          BYTEA NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, audit_id)
);
```

### Partitioning and index notes

- Hash partition large contract and embedding tables by `account_id` to preserve tenant isolation and predictable maintenance windows.
- Keep every B-tree lookup prefixed by `account_id`; GraphQL resolvers must reject requests that do not carry account scope from auth context.
- HNSW indexes should be deployed per tenant shard or filtered through a tenant-aware vector gateway. A global unfiltered HNSW index risks cross-tenant recall and noisy-neighbor latency.
- Do not embed raw item values by default. Start with metadata, semantic tags, and approved enum labels; require an explicit privacy review before embedding sampled free text.

## Open API GraphQL shape

```graphql
type AgenticSchemaContract {
  accountId: ID!
  contractId: ID!
  contractVersion: Int!
  status: ContractStatus!
  boardId: ID!
  name: String!
  description: String!
  fields: [AgenticFieldContract!]!
  procedures: [AgenticProcedureContract!]!
  semanticSummary: String!
  guardrails: AgenticSchemaGuardrails!
  contractHash: String!
  publishedAt: ISO8601DateTime
}

type AgenticFieldContract {
  fieldId: ID!
  columnId: String
  role: String!
  valueType: String!
  piiClassification: String!
  allowedOperations: [String!]!
  requiredPredicates: [String!]!
  semanticTags: [String!]!
  agentDescription: String!
}

input AgenticSchemaContractDraftInput {
  boardId: ID!
  name: String!
  description: String!
  fieldOverrides: [AgenticFieldContractOverrideInput!]
  procedureHints: [AgenticProcedureContractInput!]
}

input AgenticSchemaContractSearchInput {
  boardId: ID
  query: String!
  topK: Int = 5
  requiredRoles: [String!]
}

type Query {
  agenticSchemaContract(boardId: ID!, contractId: ID, version: Int): AgenticSchemaContract!
  searchAgenticSchemaContracts(input: AgenticSchemaContractSearchInput!): [AgenticSchemaContract!]!
}

type Mutation {
  draftAgenticSchemaContract(input: AgenticSchemaContractDraftInput!): AgenticSchemaContract!
  publishAgenticSchemaContract(contractId: ID!, version: Int!): AgenticSchemaContract!
  deprecateAgenticSchemaContract(contractId: ID!, version: Int!, reason: String!): AgenticSchemaContract!
}
```

Resolver requirements:

- Derive `account_id` only from the authenticated monday.com account context; never accept it as a user-supplied argument.
- Cap `topK` at the published contract guardrail value, with a platform maximum of 25.
- Require `boardId` for non-admin searches on accounts with more than a configured number of published contracts.
- Return `contractHash` in every response so agent plans can include deterministic references.

## Planner integration

Before an agent plan can run, the plan verifier loads the latest published contract version for each board and checks:

1. Every referenced field exists in the contract.
2. Every filter, sort, aggregate, join, semantic search, or write is in `allowed_operations`.
3. Every query includes the field's `required_predicates`, especially `account_id`, `board_id`, and high-cardinality partition keys.
4. The selected access path is compatible with the operation and row estimate.
5. PII-classified fields are not projected into prompts unless the access policy and procedure contract allow it.

The verifier emits a deterministic decision packet:

```ts
export interface SchemaContractVerificationDecision {
  account_id: string;
  plan_id: string;
  contract_refs: Array<{
    contract_id: string;
    contract_version: number;
    contract_hash: string;
  }>;
  accepted: boolean;
  rejected_reasons: string[];
  selected_access_paths: AgenticAccessPath[];
  estimated_rows_read: number;
  verification_hash: string;
}
```

## Procedural memory

Procedure contracts act as procedural memory that agents can retrieve and execute only through bounded systems:

- Preconditions are deterministic predicates, not natural-language wishes.
- Steps reference tool capability IDs and write intent requirements.
- Prompt hints are descriptive metadata; they never override policy, budget, or access-path checks.
- Procedure retrieval uses contract embeddings and tags, then validates the selected procedure against the published contract hash.

Example agent perception:

```json
{
  "contract": "Renewal workflow v3",
  "field_perception": {
    "status": "workflow state; low-cardinality enum; safe filter and aggregate",
    "renewal_date": "date boundary; indexed for range filters",
    "owner": "person field; requires account and board predicates",
    "notes": "free text; prompt projection requires PII review"
  },
  "safe_actions": [
    "filter renewal_date by bounded range",
    "aggregate count by status in columnar storage",
    "prepare write intent before changing status"
  ]
}
```

## Semantic retrieval and pgvector/HNSW compatibility

Contract embeddings should represent stable metadata:

- board purpose and semantic summary
- field roles and allowed operations
- enum labels that passed privacy review
- procedure titles and deterministic step summaries
- semantic tags such as `renewal`, `risk`, `sla`, or `dependency`

The retrieval pipeline:

1. Resolve tenant and policy envelope from auth context.
2. Apply B-tree prefilters: `account_id`, optional `board_id`, `status = published`.
3. Run HNSW search with bounded `topK` and tenant-aware namespace.
4. Re-rank by deterministic filters: contract version, policy compatibility, board membership, and required roles.
5. Return contract IDs and hashes, not raw item values.

## Guardrails for expensive or recursive agent behavior

- Reject plans that reference a field absent from the contract.
- Reject unindexed filters when estimated board size exceeds 1M rows.
- Reject wildcard projections that exceed `max_columns_per_projection`.
- Require columnar paths for large aggregations and row-store paths for transactional writes.
- Require vector searches to specify `contract_id` or `board_id` once the account has many contracts.
- Limit graph expansion from schema relationships to `max_graph_expansion_depth`.
- Prevent recursive schema discovery loops: an agent may request one contract-draft operation per plan, and that operation cannot execute user-data queries.
- Reserve workload budget before running plan verification that touches row, columnar, vector, or graph subsystems.

## Auditability

Every lifecycle action appends a hash-chained audit event:

```ts
export interface AgenticSchemaContractAuditEvent {
  account_id: string;
  audit_id: string;
  contract_id: string;
  contract_version: number;
  actor_id: string;
  action: "drafted" | "validated" | "published" | "deprecated" | "verification_failed";
  request_hash: string;
  contract_hash: string;
  previous_audit_hash?: string;
  audit_hash: string;
  created_at: string;
}
```

`contract_hash` is computed over canonical JSON with sorted keys and excludes mutable audit timestamps. Replay tooling can prove that a historical agent plan saw the same schema contract that production used at execution time.

## Performance check

This plane can cause full table scans if implemented loosely. The following are release blockers:

- `agenticSchemaContract` without `(account_id, board_id)` lookup.
- `searchAgenticSchemaContracts` that performs vector search before tenant and board prefilters.
- Contract validators that sample item values across a 1M+ row board without using column statistics or bounded indexed ranges.
- Planner checks that scan all field contracts for an account instead of using `(account_id, contract_id, contract_version)`.
- Embedding refresh jobs that rebuild all contracts after one board metadata change instead of using contract-source hashes.

For boards above 1M rows, validators should use catalog metadata, columnar statistics, and existing index manifests. Sampling live rows should require an explicit budget reservation and an upper-bounded row count.

## Relationship to existing planes

- **Access Policy Plane:** decides who can see or use the contract.
- **Plan Verification Plane:** consumes published contracts and rejects unsafe plans.
- **Semantic Index Lifecycle Plane:** owns embedding generation and HNSW maintenance.
- **Memory Compaction Plane:** can reference contract hashes when summarizing long-term procedures.
- **Entity Graph Plane:** uses field roles and relationship contracts to expose safe graph entry points.
- **Transaction Intent Plane:** uses write-related field contracts to validate autonomous mutations before commit.

## Success metrics

- Fewer rejected plans caused by unknown fields or invented board semantics.
- Lower p95 agent planning latency from direct contract lookup instead of row sampling.
- Zero cross-tenant contract or embedding retrieval incidents.
- Reduced support time for replaying agent decisions because each plan carries contract hashes.
- No increase in full-scan query warnings on 1M+ row boards.
