# Agentic Plan Verification Plane for mondayDB

## Why before how: autonomy needs a deterministic preflight

mondayDB can let agents read context, retrieve memories, and invoke tools only if
the database can prove that an agent plan is safe before it runs. The product
trade-off is **latency vs. certainty**:

- Agents need fast "blink-of-an-eye" iterations and cannot wait for every plan to
  execute just to learn it is too expensive.
- Enterprise customers need deterministic guardrails, account isolation, and an
  audit trail that explains why the plan was allowed, denied, or sent to review.
- mondayDB must not hide probabilistic planning inside the storage engine. LLMs
  may propose a plan, but mondayDB verifies that plan through explicit budgets,
  policy envelopes, row estimates, and replayable hashes.

The plan verification plane introduces a tenant-scoped preflight contract between
agent planners and mondayDB execution paths. It does not execute mutations or
tools. It compiles the proposed row, columnar, vector, and tool steps into a
bounded execution proof that can be replayed, audited, and invalidated when the
underlying data or policy changes.

## Product promise

Before an autonomous agent can run a multi-step workflow, mondayDB returns a
deterministic answer:

1. **ALLOW** with a short-lived verification token and execution envelope.
2. **DENY** with exact reason codes and the step that exceeded policy or cost.
3. **REQUIRE_REVIEW** with a stable review packet for a human or admin policy.

This lets product teams expose agentic automation without giving agents open-ended
database access. The agent experiences plan verification as a "dry run with proof"
rather than a hidden AI safety layer.

## Core concepts

### 1. Agent plan draft

A plan draft is the agent's proposed procedural memory for the next action. It is
accepted only as data; mondayDB does not infer missing steps or silently broaden
scope.

```ts
export type AgentPlanIntent =
  | "ANSWER_QUESTION"
  | "UPDATE_ITEMS"
  | "RUN_ANALYSIS"
  | "EXECUTE_WORKFLOW"
  | "PROPOSE_PROCEDURE";

export type AgentPlanStepKind =
  | "ROW_READ"
  | "ROW_WRITE"
  | "COLUMNAR_AGGREGATION"
  | "SEMANTIC_RETRIEVAL"
  | "TOOL_EXECUTION"
  | "MEMORY_WRITE";

export interface AgentPlanDraft {
  accountId: string;
  planId: string;
  requestId: string;
  subjectRef: string;
  intent: AgentPlanIntent;
  policyHash: string;
  budgetId: string;
  boardIds: string[];
  metadataTags: string[];
  steps: AgentPlanStep[];
  createdAt: string;
  planHash: string;
}

export interface AgentPlanStep {
  stepId: string;
  sequence: number;
  kind: AgentPlanStepKind;
  boardId?: string;
  itemIds?: string[];
  columnIds?: string[];
  memoryNamespace?: string;
  toolRef?: string;
  semanticQueryRef?: SemanticQueryRef;
  declaredInputs: Record<string, string>;
  declaredOutputs: string[];
  maxRowsTouched: number;
  maxPlannerCostUnits: number;
  dependsOnStepIds: string[];
  metadataTags: string[];
}

export interface SemanticQueryRef {
  embeddingSpace: string;
  queryTextHash: string;
  topK: number;
  requiredMetadataTags: string[];
  hnswEfSearch?: number;
}
```

The draft shape makes procedural memory explicit. An LLM or automation describes
instructions as ordered steps with cost ceilings and dependency edges. mondayDB
validates those instructions; it does not improvise them.

### 2. Deterministic verification result

Verification resolves access policy, query budget, planner estimates, semantic
retrieval bounds, and tool leases into one result.

```ts
export type AgentPlanVerificationStatus =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_REVIEW"
  | "STALE_POLICY";

export type AgentPlanDenialReason =
  | "MISSING_ACCOUNT_SCOPE"
  | "POLICY_HASH_MISMATCH"
  | "BOARD_OUT_OF_SCOPE"
  | "COLUMN_OUT_OF_SCOPE"
  | "UNBOUNDED_VECTOR_SEARCH"
  | "TOP_K_EXCEEDED"
  | "RECURSION_DEPTH_EXCEEDED"
  | "TOOL_BUDGET_EXCEEDED"
  | "ROW_ESTIMATE_EXCEEDED"
  | "PLANNER_COST_EXCEEDED"
  | "FULL_SCAN_RISK"
  | "WRITE_CONFLICT_RISK";

export interface AgentPlanVerificationResult {
  accountId: string;
  planId: string;
  verificationId: string;
  status: AgentPlanVerificationStatus;
  reasonCodes: AgentPlanDenialReason[];
  verifiedEnvelope?: AgentVerifiedExecutionEnvelope;
  stepEstimates: AgentPlanStepEstimate[];
  reviewPacketId?: string;
  auditHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface AgentPlanStepEstimate {
  stepId: string;
  kind: AgentPlanStepKind;
  estimatedRowsTouched: number;
  estimatedColumnarSegments: number;
  estimatedVectorCandidates: number;
  estimatedToolCalls: number;
  plannerCostUnits: number;
  requiresHumanReview: boolean;
  denialReasons: AgentPlanDenialReason[];
  estimateHash: string;
}

export interface AgentVerifiedExecutionEnvelope {
  accountId: string;
  planId: string;
  verificationId: string;
  requestId: string;
  subjectRef: string;
  policyHash: string;
  budgetReservationId: string;
  scopedBoardIds: string[];
  maxRowsTouched: number;
  maxVectorCandidates: number;
  maxToolCalls: number;
  maxRecursionDepth: number;
  allowedUntil: string;
  verificationTokenHash: string;
}
```

The execution envelope is a short-lived proof, not a bearer permission to bypass
runtime checks. Execution services must still enforce `account_id`, policy hash,
and budget reservation before running the plan.

### 3. Review packet

Plans that are safe enough to inspect but too expensive or sensitive to execute
automatically are routed to deterministic review.

```ts
export interface AgentPlanReviewPacket {
  accountId: string;
  reviewPacketId: string;
  planId: string;
  verificationId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reviewerRef?: string;
  reasonCodes: AgentPlanDenialReason[];
  summarizedProcedure: string;
  affectedBoardIds: string[];
  affectedColumnIds: string[];
  estimatedRowsTouched: number;
  estimatedPlannerCostUnits: number;
  semanticEvidenceRefs: string[];
  planHash: string;
  verificationHash: string;
  decisionHash?: string;
  expiresAt: string;
  createdAt: string;
}
```

Review packets give admins an explainable object. They can see what the agent
intends, which memory or semantic evidence it used, and exactly which bounds would
be granted if approved.

## SQL schema

The row store is the source of truth for plan drafts, verification results, review
packets, and audit events. Every primary key and operational index starts with
`account_id` to preserve tenant isolation.

```sql
CREATE TABLE agent_plan_drafts (
  account_id           BIGINT       NOT NULL,
  plan_id              UUID         NOT NULL,
  request_id           UUID         NOT NULL,
  subject_ref          TEXT         NOT NULL,
  intent               TEXT         NOT NULL,
  policy_hash          BYTEA        NOT NULL,
  budget_id            UUID         NOT NULL,
  board_ids            BIGINT[]     NOT NULL,
  metadata_tags        TEXT[]       NOT NULL DEFAULT '{}',
  plan_hash            BYTEA        NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, plan_id)
);

CREATE INDEX agent_plan_drafts_request_idx
  ON agent_plan_drafts (account_id, request_id, created_at DESC);

CREATE INDEX agent_plan_drafts_subject_idx
  ON agent_plan_drafts (account_id, subject_ref, created_at DESC);

CREATE TABLE agent_plan_steps (
  account_id              BIGINT      NOT NULL,
  plan_id                 UUID        NOT NULL,
  step_id                 UUID        NOT NULL,
  sequence                INTEGER     NOT NULL,
  kind                    TEXT        NOT NULL,
  board_id                BIGINT,
  item_ids                BIGINT[],
  column_ids              TEXT[],
  memory_namespace        TEXT,
  tool_ref                TEXT,
  semantic_query_ref      JSONB,
  declared_inputs         JSONB       NOT NULL,
  declared_outputs        TEXT[]      NOT NULL,
  max_rows_touched        BIGINT      NOT NULL,
  max_planner_cost_units  BIGINT      NOT NULL,
  depends_on_step_ids     UUID[]      NOT NULL DEFAULT '{}',
  metadata_tags           TEXT[]      NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, plan_id, step_id),
  FOREIGN KEY (account_id, plan_id)
    REFERENCES agent_plan_drafts (account_id, plan_id)
);

CREATE INDEX agent_plan_steps_order_idx
  ON agent_plan_steps (account_id, plan_id, sequence);

CREATE INDEX agent_plan_steps_board_kind_idx
  ON agent_plan_steps (account_id, board_id, kind, sequence);

CREATE TABLE agent_plan_verifications (
  account_id              BIGINT       NOT NULL,
  verification_id         UUID         NOT NULL,
  plan_id                 UUID         NOT NULL,
  status                  TEXT         NOT NULL CHECK (status IN ('ALLOW', 'DENY', 'REQUIRE_REVIEW', 'STALE_POLICY')),
  reason_codes            TEXT[]       NOT NULL DEFAULT '{}',
  budget_reservation_id   UUID,
  max_rows_touched        BIGINT,
  max_vector_candidates   BIGINT,
  max_tool_calls          INTEGER,
  max_recursion_depth     INTEGER,
  verification_token_hash BYTEA,
  review_packet_id        UUID,
  audit_hash              BYTEA        NOT NULL,
  expires_at              TIMESTAMPTZ  NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, verification_id),
  FOREIGN KEY (account_id, plan_id)
    REFERENCES agent_plan_drafts (account_id, plan_id)
);

CREATE INDEX agent_plan_verifications_plan_idx
  ON agent_plan_verifications (account_id, plan_id, created_at DESC);

CREATE INDEX agent_plan_verifications_status_idx
  ON agent_plan_verifications (account_id, status, expires_at);

CREATE TABLE agent_plan_step_estimates (
  account_id                   BIGINT      NOT NULL,
  verification_id              UUID        NOT NULL,
  step_id                      UUID        NOT NULL,
  kind                         TEXT        NOT NULL,
  estimated_rows_touched       BIGINT      NOT NULL,
  estimated_columnar_segments  BIGINT      NOT NULL,
  estimated_vector_candidates  BIGINT      NOT NULL,
  estimated_tool_calls         INTEGER     NOT NULL,
  planner_cost_units           BIGINT      NOT NULL,
  requires_human_review        BOOLEAN     NOT NULL,
  denial_reasons               TEXT[]      NOT NULL DEFAULT '{}',
  estimate_hash                BYTEA       NOT NULL,
  PRIMARY KEY (account_id, verification_id, step_id),
  FOREIGN KEY (account_id, verification_id)
    REFERENCES agent_plan_verifications (account_id, verification_id)
);

CREATE TABLE agent_plan_review_packets (
  account_id                    BIGINT       NOT NULL,
  review_packet_id              UUID         NOT NULL,
  plan_id                       UUID         NOT NULL,
  verification_id               UUID         NOT NULL,
  status                        TEXT         NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  reviewer_ref                  TEXT,
  reason_codes                  TEXT[]       NOT NULL,
  summarized_procedure          TEXT         NOT NULL,
  affected_board_ids            BIGINT[]     NOT NULL,
  affected_column_ids           TEXT[]       NOT NULL,
  estimated_rows_touched        BIGINT       NOT NULL,
  estimated_planner_cost_units  BIGINT       NOT NULL,
  semantic_evidence_refs        UUID[]       NOT NULL DEFAULT '{}',
  plan_hash                     BYTEA        NOT NULL,
  verification_hash             BYTEA        NOT NULL,
  decision_hash                 BYTEA,
  expires_at                    TIMESTAMPTZ  NOT NULL,
  created_at                    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, review_packet_id)
);

CREATE INDEX agent_plan_review_packets_status_idx
  ON agent_plan_review_packets (account_id, status, expires_at);
```

### Optional semantic plan catalog

Approved plan templates can be embedded for retrieval. These vectors help agents
discover safe procedural patterns, but they are not authority to execute a plan.

```sql
CREATE TABLE agent_plan_semantic_catalog (
  account_id        BIGINT       NOT NULL,
  template_id       UUID         NOT NULL,
  embedding_space   TEXT         NOT NULL,
  embedding         VECTOR(1536) NOT NULL,
  procedure_summary TEXT         NOT NULL,
  metadata_tags     TEXT[]       NOT NULL DEFAULT '{}',
  plan_template_hash BYTEA       NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, template_id)
);

CREATE INDEX agent_plan_semantic_catalog_hnsw_idx
  ON agent_plan_semantic_catalog
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX agent_plan_semantic_catalog_tags_idx
  ON agent_plan_semantic_catalog USING GIN (metadata_tags);
```

Vector searches against this catalog must include `account_id`, `embedding_space`,
and bounded metadata tags before HNSW candidate expansion. If the platform cannot
guarantee tenant-local vector partitions, keep one physical index partition per
account shard or per `(account_id, embedding_space)` shard.

## Open API GraphQL shape

Every operation requires `accountId`. The API returns deterministic reason codes
instead of model-written explanations as the source of truth.

```graphql
enum AgentPlanVerificationStatus {
  ALLOW
  DENY
  REQUIRE_REVIEW
  STALE_POLICY
}

input AgentPlanStepInput {
  stepId: ID!
  sequence: Int!
  kind: AgentPlanStepKind!
  boardId: ID
  itemIds: [ID!]
  columnIds: [String!]
  memoryNamespace: String
  toolRef: String
  semanticQueryRef: SemanticQueryRefInput
  declaredInputs: JSON!
  declaredOutputs: [String!]!
  maxRowsTouched: Int!
  maxPlannerCostUnits: Int!
  dependsOnStepIds: [ID!]!
  metadataTags: [String!]!
}

input VerifyAgentPlanInput {
  accountId: ID!
  requestId: ID!
  subjectRef: String!
  intent: AgentPlanIntent!
  policyHash: String!
  budgetId: ID!
  boardIds: [ID!]!
  metadataTags: [String!]!
  steps: [AgentPlanStepInput!]!
}

type AgentPlanStepEstimate {
  stepId: ID!
  kind: AgentPlanStepKind!
  estimatedRowsTouched: Int!
  estimatedColumnarSegments: Int!
  estimatedVectorCandidates: Int!
  estimatedToolCalls: Int!
  plannerCostUnits: Int!
  requiresHumanReview: Boolean!
  denialReasons: [String!]!
  estimateHash: String!
}

type AgentPlanVerification {
  accountId: ID!
  planId: ID!
  verificationId: ID!
  status: AgentPlanVerificationStatus!
  reasonCodes: [String!]!
  stepEstimates: [AgentPlanStepEstimate!]!
  verificationTokenHash: String
  reviewPacketId: ID
  auditHash: String!
  expiresAt: ISO8601DateTime!
}

extend type Mutation {
  verifyAgentPlan(input: VerifyAgentPlanInput!): AgentPlanVerification!
  approveAgentPlanReview(accountId: ID!, reviewPacketId: ID!, reviewerRef: String!): AgentPlanVerification!
  rejectAgentPlanReview(accountId: ID!, reviewPacketId: ID!, reviewerRef: String!, reason: String!): AgentPlanVerification!
}

extend type Query {
  agentPlanVerification(accountId: ID!, verificationId: ID!): AgentPlanVerification
  agentPlanReviewPacket(accountId: ID!, reviewPacketId: ID!): AgentPlanReviewPacket
}
```

The Open API should expose only plan hashes, reason codes, estimates, and bounded
summaries. Raw prompt text and full semantic query text should be stored as hashes
or redacted references unless the customer opts into expanded audit retention.

## Verification flow

1. **Normalize the draft.** Canonicalize step ordering, dependency edges, board
   scopes, tags, and declared budgets. Compute `plan_hash`.
2. **Resolve control inputs.** Load the active access policy, query budget,
   memory namespaces, and tool leases by `account_id`.
3. **Estimate each step.**
   - Row reads and writes use row-store indexes and MVCC conflict windows.
   - Columnar aggregations use segment metadata and board partition statistics.
   - Semantic retrieval checks `(account_id, embedding_space, metadata_tags)` and
     caps HNSW candidates.
   - Tool execution checks lease availability, recursion depth, and downstream
     cost declarations.
4. **Classify the plan.** Return `ALLOW`, `DENY`, `REQUIRE_REVIEW`, or
   `STALE_POLICY` with deterministic reason codes.
5. **Reserve budget.** For allowed plans, atomically reserve query/tool budget and
   store a short-lived `verification_token_hash`.
6. **Audit.** Chain the verification hash to the plan hash, policy hash, estimate
   hashes, and previous account audit hash.

## Performance checks for 1M+ row boards

The verifier must reject or review any plan that risks a full table scan:

- Missing `account_id` on any row, columnar, vector, memory, or tool lookup.
- `ROW_READ` or `ROW_WRITE` steps that omit `board_id` and an indexed item or
  column predicate.
- Columnar aggregations whose segment metadata cannot prune by `(account_id,
  board_id, column_id, time_bucket)` before scanning.
- Semantic retrieval without `topK`, with `topK` above policy, or without
  metadata tags when the account has shared embedding spaces.
- Recursive plans where `dependsOnStepIds` form cycles or exceed the policy's
  `maxRecursionDepth`.
- Tool plans whose downstream row estimates are unknown or declared as
  unbounded.

For large boards, estimates should be conservative. If statistics are stale or a
planner cannot prove index coverage, return `REQUIRE_REVIEW` or `DENY` with
`FULL_SCAN_RISK` rather than trying the query.

## Agentic guardrails

- **No cross-tenant inference:** All joins, vector probes, and catalog lookups are
  rejected unless the first key is `account_id`.
- **No hidden retries:** A denied plan cannot be automatically rewritten by the
  database. The agent may submit a new draft with a new `plan_hash`.
- **Budget reservation:** Allowed plans reserve cost before execution so recursive
  agents cannot race each other into overspending.
- **Short-lived proof:** Verification tokens expire quickly and are invalidated
  when policy hash, board schema hash, tool lease state, or budget state changes.
- **Cycle detection:** Dependency graphs are validated before any estimates are
  accepted.
- **Deterministic audit:** The same draft, policy hash, statistics snapshot, and
  budget state must produce the same status and reason codes.

## Audit model

```ts
export interface AgentPlanVerificationAuditEvent {
  accountId: string;
  auditEventId: string;
  planId: string;
  verificationId: string;
  requestId: string;
  subjectRef: string;
  status: AgentPlanVerificationStatus;
  reasonCodes: AgentPlanDenialReason[];
  planHash: string;
  policyHash: string;
  budgetStateHash: string;
  plannerStatsSnapshotHash: string;
  stepEstimateHashes: string[];
  previousAuditHash?: string;
  auditHash: string;
  createdAt: string;
}
```

The audit hash should be calculated from canonical JSON with stable key ordering.
This keeps replay deterministic even if an LLM produced the original draft.

## Agent-ready perception

An LLM should perceive each verified plan as a tagged procedural object:

```json
{
  "kind": "agent_plan_verification",
  "account_id": "12345",
  "plan_id": "plan_9",
  "status": "ALLOW",
  "intent": "UPDATE_ITEMS",
  "metadata_tags": ["crm", "renewal-risk", "approved-template"],
  "safe_to_execute_until": "2026-05-12T00:10:00Z",
  "agent_instruction": "Execute only the verified steps in sequence. Do not add boards, columns, vector searches, or tools not present in the envelope.",
  "retrieval_tags": ["procedure:update-items", "guardrail:bounded-cost"]
}
```

For RAG, embed only the procedure summary, tags, and approved plan template. Keep
the verification token hash, raw prompts, and customer data out of shared semantic
indexes. The LLM can retrieve "how similar safe plans were structured" without
receiving permission to run them.

## Rollout strategy

1. Start in advisory mode for read-only semantic retrieval and columnar
   aggregations. Return estimates and reason codes without blocking.
2. Enforce verification for tool execution and memory writes.
3. Enforce verification for row writes and high-cost columnar aggregations.
4. Promote frequently approved review packets into tenant-scoped plan templates
   only after deterministic admin approval.

## Non-goals

- The verifier does not choose the best plan for the agent.
- The verifier does not summarize customer data except through explicitly stored
  review packet summaries.
- The verifier does not replace row-level authorization, query budgets, access
  policies, or tool leases; it composes their hashes into one preflight proof.
