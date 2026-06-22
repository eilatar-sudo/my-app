# mondayDB Agentic Consent and Delegation Plane

## Why this matters

Autonomous agents need durable permission to retrieve context, remember decisions, and invoke tools on behalf of a user. If mondayDB treats that permission as a loose prompt instruction, the product gains flexibility but loses enterprise predictability: a model could over-retrieve, chain tools recursively, or infer authority from stale context. The consent and delegation plane makes authority a deterministic mondayDB concept that can be evaluated before row, columnar, vector, or tool work begins.

The product trade-off is latency versus control. A preflight consent check adds a small admission step to every agentic workload, but it protects 99.99% availability, tenant isolation, audit replay, and customer trust. The check must be simple, account-partitioned, and cacheable so it does not become the new bottleneck for "blink-of-an-eye" query paths.

## Design goals

1. Scope every delegation by `account_id`; no consent record is valid outside its tenant.
2. Keep mondayDB deterministic: LLMs can propose action, but consent evaluation is pure policy over persisted records.
3. Support procedural memory by attaching explicit agent instructions to each delegation.
4. Support semantic retrieval by embedding consent summaries and purpose tags in an account-partitioned pgvector/HNSW index.
5. Protect neighbor performance with budgets, recursion ceilings, topK caps, and planner estimates before execution.
6. Expose the full lifecycle through the monday.com Open API GraphQL layer.

## Core concepts

### Consent scope

A consent scope records who delegated what, to which agent class, for which purpose, and against which mondayDB surfaces.

```ts
export type ConsentPrincipalType = "user" | "automation" | "service_account";
export type ConsentTargetType = "board" | "item" | "workspace" | "view" | "memory_namespace";
export type ConsentAction =
  | "read_rows"
  | "aggregate_columnar"
  | "semantic_search"
  | "write_intent"
  | "tool_invoke"
  | "memory_promote";

export interface AgenticConsentScope {
  account_id: string;
  consent_scope_id: string;
  delegator_principal_type: ConsentPrincipalType;
  delegator_principal_id: string;
  agent_class_id: string;
  purpose_id: string;
  target_type: ConsentTargetType;
  target_id: string;
  allowed_actions: ConsentAction[];
  denied_actions: ConsentAction[];
  expires_at: string;
  max_recursion_depth: number;
  max_vector_top_k: number;
  max_estimated_row_reads: number;
  max_estimated_columnar_cells: number;
  max_tool_invocations: number;
  procedural_instruction_ref?: string;
  semantic_purpose_tags: string[];
  embedding_ref?: string;
  status: "active" | "paused" | "revoked" | "expired";
  created_at: string;
  updated_at: string;
  audit_hash: string;
}
```

### Delegation evaluation

An evaluation is the deterministic decision packet produced before an agentic plan enters the query planner, vector retrieval layer, or tool executor.

```ts
export interface DelegationEvaluation {
  account_id: string;
  evaluation_id: string;
  agent_run_id: string;
  consent_scope_ids: string[];
  requested_actions: ConsentAction[];
  target_refs: Array<{
    target_type: ConsentTargetType;
    target_id: string;
  }>;
  decision: "allow" | "allow_with_degraded_limits" | "queue_for_review" | "deny";
  effective_limits: {
    recursion_depth: number;
    vector_top_k: number;
    estimated_row_reads: number;
    estimated_columnar_cells: number;
    tool_invocations: number;
    timeout_ms: number;
  };
  denied_reasons: string[];
  planner_estimate_hash: string;
  previous_audit_hash?: string;
  audit_hash: string;
  evaluated_at: string;
}
```

### Agent perception card

The LLM should perceive consent as structured metadata, not hidden system behavior. A context packet can expose a compact card:

```ts
export interface ConsentPerceptionCard {
  purpose_label: string;
  allowed_actions: ConsentAction[];
  forbidden_actions: ConsentAction[];
  visible_targets: string[];
  memory_instruction_summary: string;
  retrieval_limits: {
    max_top_k: number;
    max_depth: number;
  };
  user_visible_explanation: string;
}
```

This lets an agent reason over "what I am allowed to do" without granting authority from the model's reasoning. The database still enforces the compiled evaluation.

## SQL schema

```sql
CREATE TABLE agentic_consent_scopes (
  account_id BIGINT NOT NULL,
  consent_scope_id UUID NOT NULL,
  delegator_principal_type TEXT NOT NULL CHECK (
    delegator_principal_type IN ('user', 'automation', 'service_account')
  ),
  delegator_principal_id BIGINT NOT NULL,
  agent_class_id TEXT NOT NULL,
  purpose_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (
    target_type IN ('board', 'item', 'workspace', 'view', 'memory_namespace')
  ),
  target_id TEXT NOT NULL,
  allowed_actions TEXT[] NOT NULL,
  denied_actions TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  max_recursion_depth INTEGER NOT NULL CHECK (max_recursion_depth BETWEEN 0 AND 8),
  max_vector_top_k INTEGER NOT NULL CHECK (max_vector_top_k BETWEEN 1 AND 200),
  max_estimated_row_reads BIGINT NOT NULL CHECK (max_estimated_row_reads >= 0),
  max_estimated_columnar_cells BIGINT NOT NULL CHECK (max_estimated_columnar_cells >= 0),
  max_tool_invocations INTEGER NOT NULL CHECK (max_tool_invocations BETWEEN 0 AND 50),
  procedural_instruction_ref UUID,
  semantic_purpose_tags TEXT[] NOT NULL DEFAULT '{}',
  embedding_ref UUID,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, consent_scope_id)
);

CREATE INDEX agentic_consent_scope_lookup_idx
  ON agentic_consent_scopes (
    account_id,
    agent_class_id,
    purpose_id,
    target_type,
    target_id,
    status,
    expires_at
  );

CREATE INDEX agentic_consent_delegator_idx
  ON agentic_consent_scopes (
    account_id,
    delegator_principal_type,
    delegator_principal_id,
    status,
    updated_at DESC
  );

CREATE TABLE agentic_delegation_evaluations (
  account_id BIGINT NOT NULL,
  evaluation_id UUID NOT NULL,
  agent_run_id UUID NOT NULL,
  consent_scope_ids UUID[] NOT NULL,
  requested_actions TEXT[] NOT NULL,
  target_refs JSONB NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('allow', 'allow_with_degraded_limits', 'queue_for_review', 'deny')
  ),
  effective_limits JSONB NOT NULL,
  denied_reasons TEXT[] NOT NULL DEFAULT '{}',
  planner_estimate_hash BYTEA NOT NULL,
  previous_audit_hash BYTEA,
  audit_hash BYTEA NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, evaluation_id)
);

CREATE INDEX agentic_delegation_run_idx
  ON agentic_delegation_evaluations (
    account_id,
    agent_run_id,
    evaluated_at DESC
  );
```

### Optional semantic index

Consent summaries are useful for discovery ("which permissions explain this action?") but cannot be the source of authorization. Use a tenant-partitioned vector table for retrieval only.

```sql
CREATE TABLE agentic_consent_embeddings (
  account_id BIGINT NOT NULL,
  consent_scope_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  purpose_tags TEXT[] NOT NULL,
  source_audit_hash BYTEA NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, consent_scope_id, embedding_model)
);

CREATE INDEX agentic_consent_embeddings_hnsw_idx
  ON agentic_consent_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Operational requirement: the vector search must include `account_id = $1` before result materialization. If the underlying vector engine cannot physically partition by account, route through account-hash shards or per-tenant posting lists before HNSW candidate expansion.

## GraphQL Open API shape

```graphql
enum AgenticConsentAction {
  READ_ROWS
  AGGREGATE_COLUMNAR
  SEMANTIC_SEARCH
  WRITE_INTENT
  TOOL_INVOKE
  MEMORY_PROMOTE
}

enum AgenticDelegationDecision {
  ALLOW
  ALLOW_WITH_DEGRADED_LIMITS
  QUEUE_FOR_REVIEW
  DENY
}

input AgenticConsentScopeInput {
  accountId: ID!
  agentClassId: String!
  purposeId: ID!
  targetType: String!
  targetId: ID!
  allowedActions: [AgenticConsentAction!]!
  deniedActions: [AgenticConsentAction!]
  expiresAt: ISO8601DateTime!
  maxRecursionDepth: Int!
  maxVectorTopK: Int!
  maxEstimatedRowReads: BigInt!
  maxEstimatedColumnarCells: BigInt!
  maxToolInvocations: Int!
  proceduralInstructionRef: ID
  semanticPurposeTags: [String!]!
}

type AgenticConsentScope {
  accountId: ID!
  consentScopeId: ID!
  agentClassId: String!
  purposeId: ID!
  targetType: String!
  targetId: ID!
  allowedActions: [AgenticConsentAction!]!
  deniedActions: [AgenticConsentAction!]!
  expiresAt: ISO8601DateTime!
  status: String!
  semanticPurposeTags: [String!]!
  auditHash: String!
}

type AgenticDelegationEvaluation {
  accountId: ID!
  evaluationId: ID!
  agentRunId: ID!
  decision: AgenticDelegationDecision!
  consentScopeIds: [ID!]!
  deniedReasons: [String!]!
  auditHash: String!
}

extend type Mutation {
  createAgenticConsentScope(input: AgenticConsentScopeInput!): AgenticConsentScope!
  pauseAgenticConsentScope(accountId: ID!, consentScopeId: ID!): AgenticConsentScope!
  revokeAgenticConsentScope(accountId: ID!, consentScopeId: ID!, reason: String!): AgenticConsentScope!
  evaluateAgenticDelegation(input: AgenticDelegationEvaluationInput!): AgenticDelegationEvaluation!
}

extend type Query {
  agenticConsentScopes(
    accountId: ID!
    agentClassId: String
    purposeId: ID
    targetType: String
    targetId: ID
    status: String
    limit: Int! = 50
  ): [AgenticConsentScope!]!
}
```

Every resolver must derive or validate `accountId` from the authenticated monday.com tenant context. Client-provided `accountId` is a routing hint, not a security boundary.

## Deterministic evaluation flow

1. Normalize the proposed agent plan into requested actions, target refs, recursion depth, vector topK, tool count, and planner estimates.
2. Fetch active consent scopes by `(account_id, agent_class_id, purpose_id, target_type, target_id, status, expires_at)`.
3. Intersect allowed actions and subtract denied actions.
4. Clamp requested budgets to the strictest matching consent scope.
5. Return `deny` if no scope matches, if any required action is denied, or if the plan references a target outside the account.
6. Return `allow_with_degraded_limits` if the action is allowed only after reducing topK, recursion depth, row reads, or tool invocations.
7. Persist an immutable evaluation with a hash over the normalized plan, matched scope ids, limits, decision, and previous audit hash.

No model output participates in this flow except as input to normalization. The same persisted plan and consent scopes must produce the same decision.

## Procedural memory integration

Consent scopes can point to procedural instructions such as:

- "Summarize board status only from the current sprint view."
- "For write intents, create a draft and request approval before commit."
- "When retrieval confidence is low, stop and ask for clarification instead of widening scope."

The procedure is agent-readable memory, but the consent limits remain engine-enforced. A procedure can reduce authority, never expand it beyond the compiled scope.

## Semantic retrieval integration

Consent scopes should emit short, embedded descriptions:

```json
{
  "account_id": "12345",
  "consent_scope_id": "6d774b6d-2cb4-45c7-8d37-32a3aa6c88b6",
  "summary": "Sales pipeline assistant may read rows and run bounded semantic search on Q3 enterprise pipeline board for weekly forecast preparation.",
  "tags": ["forecasting", "sales-pipeline", "read-only", "weekly-review"],
  "authority": ["read_rows", "semantic_search"],
  "not_authority": ["write_intent", "tool_invoke"]
}
```

This helps an LLM retrieve the correct operating context for a task. Authorization still comes from `agentic_consent_scopes`, not from semantic similarity.

## Performance check for 1M+ row boards

Risk areas that could cause full scans or neighbor impact:

- Querying consent scopes without `account_id` and target filters. Mitigation: composite lookup index starts with `account_id` and exact target dimensions.
- Expanding vector search before tenant filtering. Mitigation: account-hash partitioned HNSW, per-tenant posting lists, or enforced pre-filter routing.
- Allowing unbounded `semanticPurposeTags` filters over JSON/arrays. Mitigation: use exact scope lookup first; semantic tags are secondary retrieval hints.
- Evaluating a plan after running row or columnar work. Mitigation: delegation evaluation must happen before planner admission.
- Recursive agent repair loops that repeatedly widen retrieval. Mitigation: `max_recursion_depth`, `max_vector_top_k`, and loop-containment fingerprints are evaluated together.

Planner admission should reject or degrade any proposed plan whose estimate exceeds `max_estimated_row_reads` or `max_estimated_columnar_cells`. For boards with more than 1M rows, aggregation requests should prefer columnar segments with account and board predicates, never schemaless row scans over unbounded column values.

## Auditability

Audit hashes should be deterministic:

```ts
export interface ConsentAuditMaterial {
  account_id: string;
  entity_type: "consent_scope" | "delegation_evaluation";
  entity_id: string;
  canonical_payload_hash: string;
  previous_audit_hash?: string;
  actor_principal_id: string;
  actor_principal_type: ConsentPrincipalType;
  event_type: "created" | "paused" | "revoked" | "evaluated";
  occurred_at: string;
}
```

The canonical payload should sort arrays, normalize timestamps, and include the tenant id. This allows support, compliance, and customer admins to replay why an agent could or could not act.

## Guardrails for autonomous agents

- Require a fresh delegation evaluation for each agent run and any material plan change.
- Reject cross-account target refs even when the semantic text appears relevant.
- Cap vector `topK` and HNSW `ef_search` by consent scope and workload class.
- Reserve query budget before invoking row, columnar, vector, or tool work.
- Treat tool invocation as a separate action; read consent does not imply tool consent.
- Queue for human review when a write intent touches high-impact columns or exceeds deterministic estimates.
- Store denied decisions too, so repeated failed attempts can trigger loop containment.

## Enterprise operating model

| Requirement | Design response |
| --- | --- |
| Multi-tenancy | Primary keys, indexes, audit material, and vector metadata all start with `account_id`. |
| ACID compliance | Consent writes and evaluation records are transactional row-store records. Downstream vector embeddings are asynchronous read aids. |
| 99.99% availability | Evaluation is a narrow indexed lookup with bounded payloads; expensive work is admitted only after limits are known. |
| Determinism | The same normalized plan and consent state produce the same decision and audit hash. |
| API first | Scope management and evaluation are exposed through Open API GraphQL mutations and queries. |
| Agent readiness | Perception cards, procedural refs, and semantic tags describe authority to agents without making the model the enforcer. |

## Rollout path

1. Add consent scopes for read-only semantic retrieval on selected boards.
2. Integrate delegation evaluation into the plan verification and query budget planes.
3. Attach procedural memory refs for customer-configurable agent instructions.
4. Add tool and write-intent actions only after audit replay and denial telemetry are stable.
5. Promote consent embeddings for discovery and support workflows, not runtime authorization.

This sequence favors enterprise stability before broader autonomy: agents gain useful memory and retrieval, while mondayDB preserves deterministic control over who can do what, where, and at what cost.
