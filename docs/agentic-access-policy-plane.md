# Agentic Access Policy Plane for mondayDB

## Why before how: deterministic trust before autonomous reach

mondayDB can become an agentic database only if agents can safely retrieve context,
remember procedures, and trigger tools without turning the data layer into a
probabilistic authorization system. The access policy plane keeps the database
deterministic: an LLM may propose an action, but mondayDB admits, budgets, and
audits that action through explicit tenant-scoped policy records.

The core trade-off is **latency vs. consistency of control**:

- Hot paths need blink-of-an-eye reads, semantic retrieval, and tool readiness.
- Enterprise customers need deterministic proof that autonomous agents only saw
  and changed data allowed by policy at that point in time.

The design below compiles policy into a small, cacheable execution envelope while
keeping writes, approvals, and audit state ACID in the row store. Vector and
columnar engines can consume the envelope, but they never become the security
boundary.

## Product promise

An agent gets a bounded view of mondayDB:

1. Which boards, items, columns, memories, and tools it may use.
2. Which semantic retrieval searches it may run and with what `topK` and filters.
3. Which recursive or high-cost plans must be rejected or routed to review.
4. Which deterministic audit hash proves the decision path.

This makes agentic behavior powerful but predictable: no magic access expansion,
no cross-tenant retrieval, and no unbounded exploration on large boards.

## Core concepts

### 1. Agent access policy

A versioned policy describes what an agent is allowed to do inside one account.
It combines procedural memory permissions, semantic retrieval limits, and tool
execution budgets.

```ts
export type AgentPolicyAction =
  | "READ_ITEM"
  | "SEARCH_SEMANTIC_MEMORY"
  | "WRITE_ITEM"
  | "EXECUTE_TOOL"
  | "PROPOSE_PROCEDURE";

export interface AgentAccessPolicy {
  accountId: string;
  policyId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "DISABLED";
  name: string;
  subjectKind: "AGENT" | "AUTOMATION" | "APP" | "API_TOKEN";
  subjectRef: string;
  allowedActions: AgentPolicyAction[];
  scope: AgentPolicyScope;
  semanticLimits: SemanticRetrievalLimits;
  toolLimits: ToolExecutionLimits;
  metadataTags: string[];
  validFrom: string;
  validUntil?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  policyHash: string;
}

export interface AgentPolicyScope {
  boardIds: string[];
  columnIds?: string[];
  itemIdPrefixes?: string[];
  memoryNamespaces: string[];
  deniedColumnKinds: Array<"MIRROR" | "FORMULA" | "INTEGRATION_SECRET">;
}

export interface SemanticRetrievalLimits {
  maxTopK: number;
  maxCandidateRows: number;
  allowedEmbeddingSpaces: string[];
  requireMetadataTags: string[];
  denyUnfilteredVectorSearch: boolean;
}

export interface ToolExecutionLimits {
  maxToolCallsPerRequest: number;
  maxRecursionDepth: number;
  maxEstimatedRowsTouched: number;
  maxPlannerCostUnits: number;
  requireHumanReviewAboveCost: number;
}
```

### 2. Compiled execution envelope

At request time, mondayDB resolves active policies into a compact envelope. The
planner passes this envelope to row, columnar, vector, and tool execution paths.

```ts
export interface AgentExecutionEnvelope {
  accountId: string;
  requestId: string;
  subjectRef: string;
  policyIds: string[];
  policyHash: string;
  allowedActions: AgentPolicyAction[];
  scopedBoardIds: string[];
  scopedColumnIds?: string[];
  memoryNamespaces: string[];
  semanticTopK: number;
  maxCandidateRows: number;
  maxToolCalls: number;
  maxRecursionDepth: number;
  maxPlannerCostUnits: number;
  expiresAt: string;
  auditSeedHash: string;
}
```

The envelope is intentionally not a token that can grant access by itself. It is
a deterministic planner input derived from ACID policy records and request
context. Services may cache it briefly by `(account_id, subject_ref, policy_hash)`
to reduce latency, but every cache hit must preserve account scoping.

### 3. Decision log

Every allow, deny, or review-required decision emits an append-only record.

```ts
export interface AgentPolicyDecisionLog {
  accountId: string;
  decisionId: string;
  requestId: string;
  subjectRef: string;
  decision: "ALLOW" | "DENY" | "REQUIRE_REVIEW";
  reasonCode:
    | "POLICY_MATCH"
    | "NO_ACTIVE_POLICY"
    | "ACTION_NOT_ALLOWED"
    | "SCOPE_MISMATCH"
    | "SEMANTIC_LIMIT_EXCEEDED"
    | "TOOL_BUDGET_EXCEEDED"
    | "PLANNER_COST_EXCEEDED";
  policyHash: string;
  requestHash: string;
  plannerEstimateHash: string;
  previousDecisionHash?: string;
  decisionHash: string;
  createdAt: string;
}
```

## SQL schema

The row store remains the source of truth for policy and audit records. Every
primary key and index begins with `account_id` to preserve tenant isolation.

```sql
CREATE TABLE agent_access_policies (
  account_id             BIGINT       NOT NULL,
  policy_id              UUID         NOT NULL,
  version                INTEGER      NOT NULL,
  status                 TEXT         NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED')),
  name                   TEXT         NOT NULL,
  subject_kind           TEXT         NOT NULL CHECK (subject_kind IN ('AGENT', 'AUTOMATION', 'APP', 'API_TOKEN')),
  subject_ref            TEXT         NOT NULL,
  allowed_actions        TEXT[]       NOT NULL,
  scope                  JSONB        NOT NULL,
  semantic_limits        JSONB        NOT NULL,
  tool_limits            JSONB        NOT NULL,
  metadata_tags          TEXT[]       NOT NULL DEFAULT '{}',
  valid_from             TIMESTAMPTZ  NOT NULL,
  valid_until            TIMESTAMPTZ,
  created_by             TEXT         NOT NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  policy_hash            BYTEA        NOT NULL,
  PRIMARY KEY (account_id, policy_id, version)
);

CREATE INDEX agent_access_policies_active_subject_idx
  ON agent_access_policies (account_id, subject_ref, status, valid_from DESC);

CREATE INDEX agent_access_policies_tags_idx
  ON agent_access_policies USING GIN (metadata_tags);

CREATE TABLE agent_policy_decision_logs (
  account_id             BIGINT       NOT NULL,
  decision_id            UUID         NOT NULL,
  request_id             UUID         NOT NULL,
  subject_ref            TEXT         NOT NULL,
  decision               TEXT         NOT NULL CHECK (decision IN ('ALLOW', 'DENY', 'REQUIRE_REVIEW')),
  reason_code            TEXT         NOT NULL,
  policy_hash            BYTEA        NOT NULL,
  request_hash           BYTEA        NOT NULL,
  planner_estimate_hash  BYTEA        NOT NULL,
  previous_decision_hash BYTEA,
  decision_hash          BYTEA        NOT NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, decision_id)
);

CREATE INDEX agent_policy_decision_logs_request_idx
  ON agent_policy_decision_logs (account_id, request_id, created_at DESC);

CREATE INDEX agent_policy_decision_logs_subject_idx
  ON agent_policy_decision_logs (account_id, subject_ref, created_at DESC);
```

### Optional semantic policy hints

Policy descriptions can be embedded so agents and admins can search for the
right policy by intent. These hints are not used as the authorization source.

```sql
CREATE TABLE agent_policy_semantic_hints (
  account_id       BIGINT       NOT NULL,
  policy_id        UUID         NOT NULL,
  version          INTEGER      NOT NULL,
  embedding_space  TEXT         NOT NULL,
  hint_text        TEXT         NOT NULL,
  embedding        vector(1536) NOT NULL,
  metadata_tags    TEXT[]       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, policy_id, version, embedding_space)
);

CREATE INDEX agent_policy_semantic_hints_scope_idx
  ON agent_policy_semantic_hints (account_id, embedding_space, policy_id);

CREATE INDEX agent_policy_semantic_hints_hnsw_idx
  ON agent_policy_semantic_hints
  USING hnsw (embedding vector_cosine_ops);
```

For large tenants, partition semantic hints by `account_id` shard before relying
on HNSW. A global vector index must never be queried without an account filter.

## Open API GraphQL shape

Every field requires `accountId` in resolver context. Mutations must also emit
decision log entries for audit replay.

```graphql
enum AgentPolicyAction {
  READ_ITEM
  SEARCH_SEMANTIC_MEMORY
  WRITE_ITEM
  EXECUTE_TOOL
  PROPOSE_PROCEDURE
}

type AgentAccessPolicy {
  accountId: ID!
  policyId: ID!
  version: Int!
  status: String!
  name: String!
  subjectKind: String!
  subjectRef: String!
  allowedActions: [AgentPolicyAction!]!
  metadataTags: [String!]!
  policyHash: String!
}

input AgentPolicyScopeInput {
  boardIds: [ID!]!
  columnIds: [ID!]
  memoryNamespaces: [String!]!
  deniedColumnKinds: [String!]!
}

input SemanticRetrievalLimitsInput {
  maxTopK: Int!
  maxCandidateRows: Int!
  allowedEmbeddingSpaces: [String!]!
  requireMetadataTags: [String!]!
  denyUnfilteredVectorSearch: Boolean!
}

input ToolExecutionLimitsInput {
  maxToolCallsPerRequest: Int!
  maxRecursionDepth: Int!
  maxEstimatedRowsTouched: Int!
  maxPlannerCostUnits: Int!
  requireHumanReviewAboveCost: Int!
}

type AgentExecutionEnvelope {
  accountId: ID!
  requestId: ID!
  subjectRef: String!
  policyIds: [ID!]!
  policyHash: String!
  scopedBoardIds: [ID!]!
  semanticTopK: Int!
  maxCandidateRows: Int!
  maxToolCalls: Int!
  maxRecursionDepth: Int!
  expiresAt: String!
  auditSeedHash: String!
}

extend type Query {
  agentAccessPolicies(subjectRef: String!, status: String): [AgentAccessPolicy!]!
  compileAgentExecutionEnvelope(subjectRef: String!, requestedActions: [AgentPolicyAction!]!): AgentExecutionEnvelope!
}

extend type Mutation {
  createAgentAccessPolicy(
    name: String!
    subjectKind: String!
    subjectRef: String!
    allowedActions: [AgentPolicyAction!]!
    scope: AgentPolicyScopeInput!
    semanticLimits: SemanticRetrievalLimitsInput!
    toolLimits: ToolExecutionLimitsInput!
    metadataTags: [String!]!
  ): AgentAccessPolicy!

  disableAgentAccessPolicy(policyId: ID!, version: Int!, reason: String!): AgentAccessPolicy!
}
```

## Request flow

1. API receives an agent request with resolver context containing `account_id`.
2. Policy resolver loads active policies by `(account_id, subject_ref, status)`.
3. Resolver canonicalizes JSON fields and computes `policy_hash`.
4. Planner builds an `AgentExecutionEnvelope` with the tightest limits across
   all matching policies.
5. Query planner estimates rows, vector candidates, recursion depth, and tool
   calls before execution.
6. Planner returns `DENY` or `REQUIRE_REVIEW` if any limit is exceeded.
7. Row, columnar, vector, and tool paths execute with the same envelope.
8. Decision log writes a hash-chained audit record before returning the response.

## Performance checks for 1M+ row boards

Flag or reject plans with any of these properties:

- Missing `account_id` predicate.
- Missing board scope for item or column scans.
- JSON scope filters that cannot be reduced to indexed board or column ids.
- Vector search with `topK > semanticLimits.maxTopK`.
- Vector search without `embedding_space`, `account_id`, and metadata tag filters.
- Planner estimate above `maxEstimatedRowsTouched`.
- Recursive tool plan above `maxRecursionDepth` or `maxToolCallsPerRequest`.
- Columnar aggregation over item history without a bounded board or time range.

Recommended defaults for new policies:

```ts
export const DEFAULT_AGENT_POLICY_LIMITS = {
  semanticLimits: {
    maxTopK: 20,
    maxCandidateRows: 2_000,
    denyUnfilteredVectorSearch: true,
  },
  toolLimits: {
    maxToolCallsPerRequest: 5,
    maxRecursionDepth: 2,
    maxEstimatedRowsTouched: 50_000,
    maxPlannerCostUnits: 10_000,
    requireHumanReviewAboveCost: 7_500,
  },
} as const;
```

These defaults preserve responsiveness while allowing useful RAG and tool-use
workflows. Enterprise accounts can raise limits by policy, but the change is
explicit, versioned, and auditable.

## Agentic guardrails

- **Semantic retrieval:** Apply policy scope before returning vector matches.
  If the vector engine cannot guarantee pre-filtering by account shard, retrieve
  a bounded candidate set and recheck every candidate in the row store before it
  reaches the agent.
- **Procedural memory:** Store allowed procedure namespaces in policy scope.
  Agents may read instructions only from those namespaces.
- **Tool use:** Tool execution receives the same envelope and decrements budget
  deterministically. A tool cannot mint a broader envelope for a nested call.
- **Recursive plans:** Nested calls inherit the parent request id and increment
  depth. Depth over budget is a hard deny, not a best-effort warning.
- **Auditability:** Decision hashes include canonical policy JSON, request
  inputs, planner estimates, and the previous decision hash for the account.

## How an LLM perceives this data

Expose policy summaries to agents as metadata, not hidden magic:

```json
{
  "agent_view": {
    "allowed_actions": ["READ_ITEM", "SEARCH_SEMANTIC_MEMORY", "EXECUTE_TOOL"],
    "allowed_boards": ["board:customer-success"],
    "memory_namespaces": ["playbooks/customer-risk"],
    "semantic_tags": ["customer-risk", "renewal"],
    "top_k": 20,
    "tool_budget": 5,
    "recursion_depth": 2,
    "requires_review_when": "planner_cost_units >= 7500"
  }
}
```

This gives the model a clear operating contract while mondayDB remains the
deterministic enforcer.

## Rollout path

1. Implement policy and decision log records in the row store.
2. Add GraphQL policy CRUD and envelope compilation resolvers.
3. Gate semantic memory retrieval through envelopes before vector execution.
4. Gate tool execution leases through envelopes and deterministic budget
   decrementing.
5. Add admin UI and audit exports after API semantics are stable.

## Non-goals

- Using embeddings to decide whether access should be granted.
- Allowing agents to expand their own board, memory, or tool scopes.
- Treating cached envelopes as durable authorization records.
- Running cross-tenant vector search, even for aggregate analytics.
