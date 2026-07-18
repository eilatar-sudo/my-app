# Agentic Decision Memory and Revalidation Plane

## Why this belongs in mondayDB

Agents need to remember more than facts and instructions. They also need to answer:

- What did an earlier agent decide?
- Which exact evidence, policy, procedure, and model artifacts supported it?
- Is that decision still valid now?
- May this principal reuse the result, or must the decision be recomputed?

Treating a prior answer as ordinary long-term memory is unsafe. A semantically similar
decision may have been made under an older access policy, against superseded board
values, or with a procedure that has since been revoked. Re-running every decision is
safer but wastes compute and increases latency. Blind caching is fast but turns stale
reasoning into an enterprise correctness risk.

The product trade-off is therefore **reuse latency versus current validity**. mondayDB
should store immutable **decision receipts** and make reuse depend on a deterministic,
bounded revalidation step. The receipt records what happened; it never grants current
authority. A fresh evaluator compares exact dependency heads, current policy, and the
new caller's scope before releasing any prior result.

This is a database feature, not a request to put probabilistic reasoning in the engine.
An LLM can produce a proposed decision and a structured explanation. mondayDB only:

1. validates a typed dependency closure;
2. commits the receipt and its audit evidence atomically;
3. indexes a redacted perception card for discovery;
4. deterministically evaluates whether reuse is safe; and
5. forces action-producing decisions through a fresh preflight and transaction intent.

### Product guarantees

- **No tenant leakage:** `account_id` leads every persisted key, foreign key, unique
  constraint, lookup, queue claim, and physical vector partition.
- **Immutable history:** a committed receipt, dependency edge, evidence hash, or
  outcome observation is append-only. Corrections create new records.
- **Fresh authorization:** old permissions, consent, leases, and capability tokens are
  evidence about the past, never authority for a new request.
- **Deterministic reuse:** identical typed input, dependency heads, policy version,
  purpose, and reuse envelope produce the same eligibility result.
- **ACID evidence capture:** receipt, dependencies, audit event, and outbox event commit
  in one row-store transaction.
- **Bounded cost:** dependency validation is a bounded set of composite-key point reads.
  Semantic search can discover candidates but cannot make one reusable.
- **Explicit uncertainty:** stale, revoked, unauthorized, incomplete, underfilled, and
  budget-exhausted states are typed results rather than silent fallbacks.
- **No action replay:** a prior write or tool decision can contribute a reusable plan
  template, but its authorization and side effects are never replayed from the receipt.

## Scope and semantics

A **decision receipt** is the immutable record of one completed decision computation.
It binds a canonical intent to a point-in-time evidence packet, dependency set,
procedure and policy versions, decision class, result hash, and audit root.

A **dependency head** is the current authoritative version or revocation token for one
tenant-scoped dependency. Revalidation compares the captured token in a receipt with
the current head using composite-key point reads.

A **reuse evaluation** is an immutable answer to a specific request to reuse a
receipt. It includes the current principal, purpose, policy version, dependency-head
root, decision, reason codes, and budget consumption. It is not a mutable status flag
on the original receipt.

A **decision template** is procedural memory: versioned instructions for how to make a
class of decision. It may be discovered semantically, but exact applicability,
preconditions, tool scopes, and budgets are checked before use.

A **perception card** is a redacted, bounded summary that helps an agent understand a
receipt or template. Its embedding is an entry point for discovery, not proof that two
decisions are interchangeable.

Version 1 supports:

- exact receipt lookup;
- bounded semantic discovery of decision receipts and templates;
- revalidation of at most 128 exact dependencies;
- deterministic reuse of informational results;
- plan-template reuse for tool or mutation decisions, followed by fresh preflight;
- append-only outcome observations; and
- background proactive revalidation for high-value receipts.

Version 1 rejects:

- recursive reuse where one evaluation invokes another reuse evaluation;
- wildcard dependency sets;
- natural-language predicates in the database engine;
- reuse of authorization, consent, leases, transaction reservations, or tool outputs;
- exact vector fallback scans; and
- synchronous fan-out invalidation over all dependent receipts.

## TypeScript contracts

Opaque IDs and hashes are strings. Counts, byte values, sequence numbers, and
durations that may exceed JavaScript's safe integer range use canonical decimal
strings.

```ts
type DecisionClass =
  | "INFORMATIONAL"
  | "RECOMMENDATION"
  | "TOOL_PLAN"
  | "MUTATION_PLAN";

type DependencyKind =
  | "ROW_OBJECT"
  | "COLUMNAR_MANIFEST"
  | "VECTOR_MANIFEST"
  | "PROCEDURE_VERSION"
  | "POLICY_VERSION"
  | "DATA_CONTRACT_VERSION"
  | "CAPABILITY_VERSION"
  | "TEMPORAL_SNAPSHOT"
  | "EVIDENCE_PACKET";

type ReuseDecision =
  | "REUSE_RESULT"
  | "REUSE_PLAN_ONLY"
  | "RECOMPUTE"
  | "REJECT";

type ReuseReasonCode =
  | "ELIGIBLE"
  | "DEPENDENCY_CHANGED"
  | "DEPENDENCY_REVOKED"
  | "DEPENDENCY_MISSING"
  | "POLICY_CHANGED"
  | "PRINCIPAL_NOT_AUTHORIZED"
  | "PURPOSE_MISMATCH"
  | "PROCEDURE_RETIRED"
  | "SOURCE_VISIBILITY_CHANGED"
  | "RESULT_EXPIRED"
  | "ACTION_REQUIRES_FRESH_PREFLIGHT"
  | "DEPENDENCY_LIMIT_EXCEEDED"
  | "BUDGET_EXHAUSTED"
  | "RECURSIVE_REUSE_FORBIDDEN";

interface AgenticDecisionIntent {
  accountId: string;
  intentType: string;
  targetObjectRefs: Array<{
    accountId: string;
    objectType: "BOARD" | "BOARD_ITEM" | "WORKFLOW" | "DOCUMENT";
    objectId: string;
    boardId?: string;
  }>;
  typedParameters: Record<string, unknown>;
  purposeId: string;
  canonicalIntentHash: string;
}

interface DecisionDependency {
  accountId: string;
  dependencyKind: DependencyKind;
  dependencyId: string;
  capturedVersion: string;
  capturedVersionHash: string;
  visibilityEpoch: string;
  requiredForReuse: boolean;
  evidenceRef?: {
    accountId: string;
    evidencePacketId: string;
    evidenceItemId: string;
  };
}

interface AgenticDecisionReceipt {
  accountId: string;
  decisionId: string;
  requestId: string;
  principalId: string;
  purposeId: string;
  decisionClass: DecisionClass;
  intent: AgenticDecisionIntent;
  temporalSnapshotId: string;
  temporalSnapshotHash: string;
  policyVersion: string;
  procedureRefs: Array<{
    accountId: string;
    procedureId: string;
    procedureVersion: string;
    artifactHash: string;
  }>;
  dependencies: DecisionDependency[];
  resultSchemaId: string;
  encryptedResultRef: string;
  resultHash: string;
  explanationHash?: string;
  modelArtifactRefs: Array<{
    provider: string;
    modelId: string;
    modelVersion: string;
    promptArtifactHash: string;
  }>;
  sourceVisibilityEpoch: string;
  expiresAt?: string;
  auditRootHash: string;
  createdAt: string;
}

interface DecisionReuseBudget {
  maxDependencies: number;
  maxSemanticCandidates: number;
  maxPolicyChecks: number;
  maxEstimatedRowReads: string;
  maxEstimatedBytes: string;
  timeoutMs: number;
}

interface DecisionReuseRequest {
  accountId: string;
  requestId: string;
  principalId: string;
  purposeId: string;
  decisionId: string;
  expectedIntentHash: string;
  allowPlanTemplateReuse: boolean;
  budget: DecisionReuseBudget;
  idempotencyKey: string;
  canonicalRequestHash: string;
}

interface DependencyHeadObservation {
  accountId: string;
  dependencyKind: DependencyKind;
  dependencyId: string;
  currentVersion: string;
  currentVersionHash: string;
  visibilityEpoch: string;
  revoked: boolean;
  observedAtSequence: string;
}

interface DecisionReuseEvaluation {
  accountId: string;
  evaluationId: string;
  requestId: string;
  decisionId: string;
  principalId: string;
  purposeId: string;
  decision: ReuseDecision;
  reasonCodes: ReuseReasonCode[];
  observedDependencyHeadRoot: string;
  currentPolicyVersion: string;
  currentAuthorizationDecisionHash: string;
  resultRef?: string;
  planTemplateRef?: string;
  freshPreflightRequired: boolean;
  consumed: {
    dependencyReads: number;
    policyChecks: number;
    estimatedRowReads: string;
    estimatedBytes: string;
    elapsedMs: number;
  };
  auditEventId: string;
  evaluationHash: string;
  evaluatedAt: string;
}

interface DecisionTemplate {
  accountId: string;
  templateId: string;
  templateVersion: string;
  decisionType: string;
  instructions: Array<{
    stepId: string;
    operation: string;
    typedArguments: Record<string, unknown>;
    onFailure: "STOP" | "REQUEST_REVIEW" | "USE_TYPED_FALLBACK";
  }>;
  preconditionContractId: string;
  allowedPurposeIds: string[];
  requiredCapabilityIds: string[];
  maximumBudget: DecisionReuseBudget;
  outputSchemaId: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED" | "REVOKED";
  artifactHash: string;
  createdAt: string;
}

interface DecisionPerceptionCard {
  accountId: string;
  cardId: string;
  sourceType: "DECISION_RECEIPT" | "DECISION_TEMPLATE";
  sourceId: string;
  sourceVersion: string;
  decisionType: string;
  redactedIntentSummary: string;
  evidenceKinds: DependencyKind[];
  allowedPurposeIds: string[];
  decisionClass?: DecisionClass;
  resultCategory?: string;
  freshness: "CURRENT_AT_INDEX_TIME" | "POSSIBLY_STALE" | "REVOKED";
  sensitivityLabels: string[];
  semanticTextHash: string;
  embeddingModelVersion: string;
  vectorManifestId: string;
  updatedAt: string;
}

interface DecisionSearchRequest {
  accountId: string;
  requestId: string;
  principalId: string;
  purposeId: string;
  sourceTypes: Array<"DECISION_RECEIPT" | "DECISION_TEMPLATE">;
  decisionTypes: string[];
  embeddingModelVersion: string;
  queryEmbeddingHash: string;
  topK: number;
  maxCandidates: number;
  efSearch: number;
  timeoutMs: number;
  metadataFilterHash: string;
}

interface DecisionSearchCandidate {
  accountId: string;
  card: DecisionPerceptionCard;
  distance: number;
  discoveryOnly: true;
  exactEligibilityCheckRequired: true;
  candidateAttestationHash: string;
}

interface DecisionOutcomeObservation {
  accountId: string;
  outcomeId: string;
  decisionId: string;
  observationType:
    | "ACCEPTED"
    | "REJECTED_BY_HUMAN"
    | "ACTION_SUCCEEDED"
    | "ACTION_FAILED"
    | "SUPERSEDED"
    | "ROLLBACK_REQUIRED";
  sourceEventId: string;
  sourceEventHash: string;
  observedValueHash?: string;
  observerPrincipalId: string;
  observedAt: string;
  auditEventId: string;
}
```

The result body is encrypted and referenced, not copied into vector metadata or audit
events. `explanationHash` proves which explanation accompanied the result without
requiring the database to treat model-generated prose as a correctness proof.

## SQL control-plane schema

The examples use PostgreSQL-compatible DDL and `vector`, but the logical constraints
also apply if mondayDB stores vectors in a separate service. Physical partitions are
derived from an authenticated `account_id`; a client cannot choose one directly.

```sql
CREATE TYPE agentic_decision_class AS ENUM (
  'INFORMATIONAL',
  'RECOMMENDATION',
  'TOOL_PLAN',
  'MUTATION_PLAN'
);

CREATE TYPE agentic_dependency_kind AS ENUM (
  'ROW_OBJECT',
  'COLUMNAR_MANIFEST',
  'VECTOR_MANIFEST',
  'PROCEDURE_VERSION',
  'POLICY_VERSION',
  'DATA_CONTRACT_VERSION',
  'CAPABILITY_VERSION',
  'TEMPORAL_SNAPSHOT',
  'EVIDENCE_PACKET'
);

CREATE TYPE agentic_reuse_decision AS ENUM (
  'REUSE_RESULT',
  'REUSE_PLAN_ONLY',
  'RECOMPUTE',
  'REJECT'
);

CREATE TABLE agentic_decision_receipts (
  account_id              bigint        NOT NULL,
  decision_id             uuid          NOT NULL,
  request_id              uuid          NOT NULL,
  principal_id            bigint        NOT NULL,
  purpose_id              uuid          NOT NULL,
  decision_class          agentic_decision_class NOT NULL,
  decision_type           text          NOT NULL,
  canonical_intent        jsonb         NOT NULL,
  canonical_intent_hash   bytea         NOT NULL,
  temporal_snapshot_id    uuid          NOT NULL,
  temporal_snapshot_hash  bytea         NOT NULL,
  policy_version          text          NOT NULL,
  procedure_set_hash      bytea         NOT NULL,
  result_schema_id        uuid          NOT NULL,
  encrypted_result_ref    text          NOT NULL,
  result_hash             bytea         NOT NULL,
  explanation_hash        bytea,
  model_artifact_set_hash bytea         NOT NULL,
  source_visibility_epoch bigint        NOT NULL,
  expires_at              timestamptz,
  audit_root_hash         bytea         NOT NULL,
  created_at              timestamptz   NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  UNIQUE (account_id, request_id),
  UNIQUE (account_id, principal_id, canonical_intent_hash, decision_id),
  CHECK (jsonb_typeof(canonical_intent) = 'object')
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_receipts_exact_intent_idx
  ON agentic_decision_receipts (
    account_id,
    canonical_intent_hash,
    decision_type,
    created_at DESC,
    decision_id
  );

CREATE INDEX agentic_decision_receipts_expiry_idx
  ON agentic_decision_receipts (account_id, expires_at, decision_id)
  WHERE expires_at IS NOT NULL;

CREATE TABLE agentic_decision_dependencies (
  account_id             bigint        NOT NULL,
  decision_id            uuid          NOT NULL,
  dependency_ordinal     smallint      NOT NULL,
  dependency_kind        agentic_dependency_kind NOT NULL,
  dependency_id          text          NOT NULL,
  captured_version       text          NOT NULL,
  captured_version_hash  bytea         NOT NULL,
  visibility_epoch       bigint        NOT NULL,
  required_for_reuse     boolean       NOT NULL,
  evidence_packet_id     uuid,
  evidence_item_id       text,
  created_at             timestamptz   NOT NULL,
  PRIMARY KEY (account_id, decision_id, dependency_ordinal),
  UNIQUE (
    account_id,
    decision_id,
    dependency_kind,
    dependency_id
  ),
  FOREIGN KEY (account_id, decision_id)
    REFERENCES agentic_decision_receipts (account_id, decision_id),
  CHECK (dependency_ordinal BETWEEN 0 AND 127),
  CHECK (
    (evidence_packet_id IS NULL) = (evidence_item_id IS NULL)
  )
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_dependencies_reverse_idx
  ON agentic_decision_dependencies (
    account_id,
    dependency_kind,
    dependency_id,
    decision_id
  );

CREATE TABLE agentic_dependency_heads (
  account_id            bigint        NOT NULL,
  dependency_kind       agentic_dependency_kind NOT NULL,
  dependency_id         text          NOT NULL,
  current_version       text          NOT NULL,
  current_version_hash  bytea         NOT NULL,
  visibility_epoch      bigint        NOT NULL,
  revoked               boolean       NOT NULL DEFAULT false,
  observed_at_sequence  bigint        NOT NULL,
  updated_at            timestamptz   NOT NULL,
  PRIMARY KEY (account_id, dependency_kind, dependency_id),
  CHECK (observed_at_sequence >= 0),
  CHECK (visibility_epoch >= 0)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_decision_reuse_evaluations (
  account_id                          bigint        NOT NULL,
  evaluation_id                       uuid          NOT NULL,
  request_id                          uuid          NOT NULL,
  idempotency_key                     text          NOT NULL,
  decision_id                         uuid          NOT NULL,
  principal_id                        bigint        NOT NULL,
  purpose_id                          uuid          NOT NULL,
  reuse_decision                      agentic_reuse_decision NOT NULL,
  reason_codes                        text[]        NOT NULL,
  observed_dependency_head_root       bytea         NOT NULL,
  current_policy_version              text          NOT NULL,
  current_authorization_decision_hash bytea         NOT NULL,
  consumed_dependency_reads           smallint      NOT NULL,
  consumed_policy_checks              smallint      NOT NULL,
  consumed_estimated_row_reads        bigint        NOT NULL,
  consumed_estimated_bytes            bigint        NOT NULL,
  consumed_elapsed_ms                 integer       NOT NULL,
  fresh_preflight_required            boolean       NOT NULL,
  audit_event_id                      uuid          NOT NULL,
  evaluation_hash                     bytea         NOT NULL,
  evaluated_at                        timestamptz   NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, principal_id, idempotency_key),
  FOREIGN KEY (account_id, decision_id)
    REFERENCES agentic_decision_receipts (account_id, decision_id),
  CHECK (cardinality(reason_codes) BETWEEN 1 AND 16),
  CHECK (consumed_dependency_reads BETWEEN 0 AND 128),
  CHECK (consumed_policy_checks BETWEEN 0 AND 32),
  CHECK (consumed_estimated_row_reads >= 0),
  CHECK (consumed_estimated_bytes >= 0),
  CHECK (consumed_elapsed_ms >= 0),
  CHECK (
    (reuse_decision IN ('REUSE_PLAN_ONLY', 'RECOMPUTE', 'REJECT'))
    OR NOT fresh_preflight_required
  )
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_reuse_request_idx
  ON agentic_decision_reuse_evaluations (
    account_id,
    request_id,
    evaluated_at DESC
  );

CREATE TABLE agentic_decision_templates (
  account_id                  bigint        NOT NULL,
  template_id                 uuid          NOT NULL,
  template_version            text          NOT NULL,
  decision_type               text          NOT NULL,
  instructions                jsonb         NOT NULL,
  precondition_contract_id    uuid          NOT NULL,
  allowed_purpose_ids         uuid[]        NOT NULL,
  required_capability_ids     uuid[]        NOT NULL,
  maximum_budget              jsonb         NOT NULL,
  output_schema_id            uuid          NOT NULL,
  status                      text          NOT NULL,
  artifact_hash               bytea         NOT NULL,
  supersedes_template_version text,
  created_at                  timestamptz   NOT NULL,
  PRIMARY KEY (account_id, template_id, template_version),
  UNIQUE (account_id, template_id, artifact_hash),
  CHECK (jsonb_typeof(instructions) = 'array'),
  CHECK (jsonb_array_length(instructions) BETWEEN 1 AND 32),
  CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED', 'REVOKED')),
  CHECK (cardinality(allowed_purpose_ids) BETWEEN 1 AND 32),
  CHECK (cardinality(required_capability_ids) <= 32)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_decision_perception_cards (
  account_id               bigint        NOT NULL,
  card_id                  uuid          NOT NULL,
  source_type              text          NOT NULL,
  source_id                uuid          NOT NULL,
  source_version           text          NOT NULL,
  decision_type            text          NOT NULL,
  redacted_intent_summary  text          NOT NULL,
  evidence_kinds           agentic_dependency_kind[] NOT NULL,
  allowed_purpose_ids      uuid[]        NOT NULL,
  decision_class           agentic_decision_class,
  result_category          text,
  freshness                text          NOT NULL,
  sensitivity_labels       text[]        NOT NULL,
  semantic_text_hash       bytea         NOT NULL,
  embedding_model_version  text          NOT NULL,
  vector_manifest_id       uuid          NOT NULL,
  embedding                vector(1536)  NOT NULL,
  updated_at               timestamptz   NOT NULL,
  PRIMARY KEY (account_id, card_id),
  UNIQUE (
    account_id,
    source_type,
    source_id,
    source_version,
    embedding_model_version
  ),
  CHECK (source_type IN ('DECISION_RECEIPT', 'DECISION_TEMPLATE')),
  CHECK (freshness IN ('CURRENT_AT_INDEX_TIME', 'POSSIBLY_STALE', 'REVOKED')),
  CHECK (length(redacted_intent_summary) BETWEEN 1 AND 2048),
  CHECK (cardinality(allowed_purpose_ids) BETWEEN 1 AND 32)
) PARTITION BY HASH (account_id);

-- Build one HNSW graph per physical account bucket, model version, and
-- immutable vector manifest. Query routing derives the bucket from the
-- authenticated account and always applies account_id as an exact filter.
CREATE INDEX agentic_decision_perception_metadata_idx
  ON agentic_decision_perception_cards (
    account_id,
    embedding_model_version,
    vector_manifest_id,
    decision_type,
    source_type,
    freshness,
    updated_at DESC
  );

CREATE TABLE agentic_decision_outcomes (
  account_id             bigint        NOT NULL,
  outcome_id             uuid          NOT NULL,
  decision_id            uuid          NOT NULL,
  observation_type       text          NOT NULL,
  source_event_id        text          NOT NULL,
  source_event_hash      bytea         NOT NULL,
  observed_value_hash    bytea,
  observer_principal_id  bigint        NOT NULL,
  observed_at            timestamptz   NOT NULL,
  audit_event_id         uuid          NOT NULL,
  PRIMARY KEY (account_id, outcome_id),
  UNIQUE (account_id, source_event_id),
  FOREIGN KEY (account_id, decision_id)
    REFERENCES agentic_decision_receipts (account_id, decision_id),
  CHECK (
    observation_type IN (
      'ACCEPTED',
      'REJECTED_BY_HUMAN',
      'ACTION_SUCCEEDED',
      'ACTION_FAILED',
      'SUPERSEDED',
      'ROLLBACK_REQUIRED'
    )
  )
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_outcomes_decision_idx
  ON agentic_decision_outcomes (
    account_id,
    decision_id,
    observed_at DESC,
    outcome_id
  );

CREATE TABLE agentic_decision_revalidation_jobs (
  account_id              bigint        NOT NULL,
  job_id                  uuid          NOT NULL,
  decision_id             uuid          NOT NULL,
  trigger_kind            text          NOT NULL,
  trigger_dependency_kind agentic_dependency_kind,
  trigger_dependency_id   text,
  state                   text          NOT NULL,
  priority                 smallint      NOT NULL,
  lease_generation        bigint        NOT NULL DEFAULT 0,
  lease_owner              text,
  lease_expires_at         timestamptz,
  attempt_count            smallint      NOT NULL DEFAULT 0,
  not_before               timestamptz   NOT NULL,
  created_at               timestamptz   NOT NULL,
  updated_at               timestamptz   NOT NULL,
  PRIMARY KEY (account_id, job_id),
  UNIQUE (
    account_id,
    decision_id,
    trigger_kind,
    trigger_dependency_kind,
    trigger_dependency_id
  ),
  FOREIGN KEY (account_id, decision_id)
    REFERENCES agentic_decision_receipts (account_id, decision_id),
  CHECK (state IN ('QUEUED', 'LEASED', 'COMPLETED', 'DEAD_LETTERED')),
  CHECK (priority BETWEEN 0 AND 100),
  CHECK (attempt_count BETWEEN 0 AND 16),
  CHECK (lease_generation >= 0)
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_revalidation_claim_idx
  ON agentic_decision_revalidation_jobs (
    account_id,
    state,
    priority DESC,
    not_before,
    job_id
  )
  WHERE state = 'QUEUED';

CREATE TABLE agentic_decision_audit_events (
  account_id         bigint        NOT NULL,
  audit_event_id     uuid          NOT NULL,
  decision_id        uuid,
  evaluation_id      uuid,
  event_type         text          NOT NULL,
  actor_principal_id bigint        NOT NULL,
  canonical_payload  jsonb         NOT NULL,
  previous_event_hash bytea,
  event_hash         bytea         NOT NULL,
  created_at         timestamptz   NOT NULL,
  PRIMARY KEY (account_id, audit_event_id),
  UNIQUE (account_id, event_hash),
  CHECK (jsonb_typeof(canonical_payload) = 'object'),
  CHECK (decision_id IS NOT NULL OR evaluation_id IS NOT NULL)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_decision_outbox (
  account_id       bigint        NOT NULL,
  outbox_id        uuid          NOT NULL,
  aggregate_type   text          NOT NULL,
  aggregate_id     uuid          NOT NULL,
  event_type       text          NOT NULL,
  payload_hash     bytea         NOT NULL,
  commit_sequence  bigint        NOT NULL,
  published_at     timestamptz,
  created_at       timestamptz   NOT NULL,
  PRIMARY KEY (account_id, outbox_id),
  UNIQUE (account_id, commit_sequence, outbox_id),
  CHECK (commit_sequence >= 0)
) PARTITION BY HASH (account_id);
```

Production DDL must add composite foreign keys from evidence, snapshot, policy,
procedure, vector-manifest, and audit references to their owning control-plane tables.
Those tables are omitted here only because they belong to adjacent mondayDB planes.
No foreign key may reference an object by ID without the same `account_id`.

### Mandatory tenant access pattern

The service derives `account_id` from the authenticated principal and compares it with
the GraphQL argument before planning. Database roles use row-level security as a second
boundary:

```sql
ALTER TABLE agentic_decision_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_dependency_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_reuse_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_perception_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_revalidation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_receipts ON agentic_decision_receipts
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_dependencies ON agentic_decision_dependencies
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_heads ON agentic_dependency_heads
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

-- Apply the identical account policy to every remaining table. Production roles
-- must not own these tables and must not have BYPASSRLS.
```

The query compiler rejects a statement unless its normalized predicate contains
`account_id = :authenticated_account_id`. RLS is defense in depth, not a replacement
for tenant-leading plans.

## Deterministic lifecycle

### 1. Compile and commit a decision receipt

1. Resolve the authenticated account, principal, and purpose.
2. Canonicalize the typed intent. Reject unknown operators and JSON numbers that cannot
   be represented deterministically.
3. Require a sealed temporal snapshot and evidence packet.
4. Resolve exact procedure, policy, data-contract, vector-manifest, and capability
   versions. Dynamic labels such as `latest` are forbidden in a receipt.
5. Deduplicate dependencies by `(kind, id)`, sort by that tuple, and reject more than
   128 dependencies.
6. Verify every dependency belongs to the same account and is visible at the snapshot.
7. Hash the ordered dependency set, result schema, encrypted result reference, result,
   explanation, and model artifacts.
8. In one serializable row-store transaction, insert the receipt, dependency rows,
   audit event, and outbox event. A repeated `(account_id, request_id)` must return the
   same receipt or an idempotency conflict.
9. Asynchronously create a redacted perception card from policy-approved fields.

The LLM's chain-of-thought is not required and should not be stored. The receipt keeps
structured evidence references, the disclosed explanation hash, and the final result
hash needed for replay without retaining hidden reasoning or sensitive prompt content.

### 2. Evaluate reuse

The release path is exact and bounded:

1. Read the receipt by `(account_id, decision_id)`.
2. Verify `expected_intent_hash`, purpose compatibility, expiry, source visibility
   epoch, and the request's idempotency key.
3. Re-evaluate current authorization for the new principal. Never copy the receipt's
   old authorization result.
4. Read at most 128 dependencies from
   `agentic_decision_dependencies` and batch-read their current rows from
   `agentic_dependency_heads` by full composite keys.
5. Canonically sort the observations and compute `observed_dependency_head_root`.
6. Compare required captured hashes and visibility epochs with current heads.
7. Apply the deterministic decision table:

| Condition | Result |
| --- | --- |
| Unauthorized principal or purpose | `REJECT` |
| Missing, revoked, or hidden dependency | `REJECT` |
| Required dependency changed | `RECOMPUTE` |
| Receipt expired or policy changed | `RECOMPUTE` |
| Informational/recommendation receipt, all checks pass | `REUSE_RESULT` |
| Tool/mutation plan, all checks pass, plan reuse allowed | `REUSE_PLAN_ONLY` |
| Tool/mutation plan, plan reuse not allowed | `RECOMPUTE` |

8. Persist the evaluation and audit event before releasing the result reference.
9. For `REUSE_PLAN_ONLY`, issue no side effect. Submit the plan to fresh policy,
   neighbor-impact, budget, tool-lease, and transaction-intent preflight.

The engine does not recursively look for another reusable receipt when this evaluation
returns `RECOMPUTE`. The caller may submit one new decision request; its control
envelope carries a reuse depth of zero.

### 3. React to dependency changes

Source transactions update their exact dependency head and append an outbox event.
Consumers may use the reverse dependency index to enqueue proactive revalidation, but
they must page by `(account_id, dependency_kind, dependency_id, decision_id)` and obey
per-tenant budgets.

Synchronous writes never update every dependent receipt. That would turn one board
change into an unbounded invalidation transaction. Correctness instead comes from the
authoritative dependency-head comparison on release. Background jobs reduce future
latency and refresh perception-card freshness labels; they are an optimization only.

Queue workers claim jobs with compare-and-swap on `lease_generation`. Completion is
accepted only from the current lease generation, making a delayed worker unable to
overwrite a newer result.

### 4. Attach outcomes without rewriting history

Observed outcomes are append-only facts. They can help an agent assess how similar
templates performed, but they do not mutate the original decision or prove causality.
A later `ACTION_FAILED` observation does not mean every similar recommendation is
invalid; it becomes typed evidence for a new decision.

Outcome-derived analytics run in the columnar layer. Promotion of a successful pattern
into a decision template requires an explicit review workflow and creates a new,
versioned procedural artifact. mondayDB never converts correlations into instructions
automatically.

## Semantic retrieval and HNSW behavior

Decision search is useful when an agent asks, “Have we handled a similar escalation?”
It is not an eligibility mechanism.

1. The embedding pipeline consumes only the policy-approved perception-card projection.
2. Each vector artifact is sealed for one account bucket, embedding model version, and
   manifest generation. Cross-account HNSW graphs are forbidden.
3. The router requires exact `account_id`, model version, purpose, source type, and
   freshness metadata before ANN traversal.
4. `topK <= 50`, `maxCandidates <= 500`, and `efSearch <= 256`.
5. Results include an ordered candidate attestation hash and the vector manifest hash.
6. Underfilled ANN results remain underfilled. The engine does not scan receipt text or
   compute exact distance over all vectors.
7. Every receipt candidate must pass exact intent, authorization, and dependency
   revalidation before a result can be reused.
8. Every template candidate must pass exact status, purpose, precondition-contract,
   capability, and budget checks before its instructions are exposed.

HNSW traversal can change when a graph is rebuilt. Auditability therefore binds the
request to the immutable graph artifact and signed ordered candidate list. mondayDB
does not falsely promise bit-for-bit ANN traversal across different graph generations.

## Open API GraphQL contract

All functionality is available through typed Open API fields. `AccountID`, `BigInt`,
`Hash`, and `DateTime` are canonical string scalars. The gateway validates that every
input `accountId` equals the authenticated account.

```graphql
scalar AccountID
scalar BigInt
scalar DateTime
scalar Hash
scalar JSON

enum AgenticDecisionClass {
  INFORMATIONAL
  RECOMMENDATION
  TOOL_PLAN
  MUTATION_PLAN
}

enum AgenticReuseDecision {
  REUSE_RESULT
  REUSE_PLAN_ONLY
  RECOMPUTE
  REJECT
}

enum AgenticDecisionSourceType {
  DECISION_RECEIPT
  DECISION_TEMPLATE
}

input AgenticObjectRefInput {
  accountId: AccountID!
  objectType: String!
  objectId: ID!
  boardId: ID
}

input AgenticDecisionIntentInput {
  accountId: AccountID!
  intentType: String!
  targetObjectRefs: [AgenticObjectRefInput!]!
  typedParameters: JSON!
  purposeId: ID!
  canonicalIntentHash: Hash!
}

input AgenticDecisionDependencyInput {
  accountId: AccountID!
  dependencyKind: String!
  dependencyId: ID!
  capturedVersion: String!
  capturedVersionHash: Hash!
  visibilityEpoch: BigInt!
  requiredForReuse: Boolean!
  evidencePacketId: ID
  evidenceItemId: ID
}

input RecordAgenticDecisionInput {
  accountId: AccountID!
  requestId: ID!
  principalId: ID!
  purposeId: ID!
  decisionClass: AgenticDecisionClass!
  intent: AgenticDecisionIntentInput!
  temporalSnapshotToken: String!
  policyVersion: String!
  procedureArtifactHashes: [Hash!]!
  dependencies: [AgenticDecisionDependencyInput!]!
  resultSchemaId: ID!
  encryptedResultRef: String!
  resultHash: Hash!
  explanationHash: Hash
  modelArtifactHashes: [Hash!]!
  expiresAt: DateTime
  idempotencyKey: String!
}

input AgenticReuseBudgetInput {
  maxDependencies: Int!
  maxSemanticCandidates: Int!
  maxPolicyChecks: Int!
  maxEstimatedRowReads: BigInt!
  maxEstimatedBytes: BigInt!
  timeoutMs: Int!
}

input EvaluateAgenticDecisionReuseInput {
  accountId: AccountID!
  requestId: ID!
  principalId: ID!
  purposeId: ID!
  decisionId: ID!
  expectedIntentHash: Hash!
  allowPlanTemplateReuse: Boolean!
  budget: AgenticReuseBudgetInput!
  idempotencyKey: String!
  canonicalRequestHash: Hash!
}

input SearchAgenticDecisionsInput {
  accountId: AccountID!
  requestId: ID!
  principalId: ID!
  purposeId: ID!
  sourceTypes: [AgenticDecisionSourceType!]!
  decisionTypes: [String!]!
  embeddingModelVersion: String!
  queryEmbeddingHash: Hash!
  topK: Int!
  maxCandidates: Int!
  efSearch: Int!
  timeoutMs: Int!
  metadataFilterHash: Hash!
}

type AgenticDecisionReceipt {
  accountId: AccountID!
  decisionId: ID!
  requestId: ID!
  principalId: ID!
  purposeId: ID!
  decisionClass: AgenticDecisionClass!
  decisionType: String!
  canonicalIntentHash: Hash!
  temporalSnapshotId: ID!
  temporalSnapshotHash: Hash!
  policyVersion: String!
  resultSchemaId: ID!
  resultHash: Hash!
  explanationHash: Hash
  sourceVisibilityEpoch: BigInt!
  expiresAt: DateTime
  auditRootHash: Hash!
  createdAt: DateTime!
}

type AgenticReuseConsumption {
  dependencyReads: Int!
  policyChecks: Int!
  estimatedRowReads: BigInt!
  estimatedBytes: BigInt!
  elapsedMs: Int!
}

type AgenticDecisionReuseEvaluation {
  accountId: AccountID!
  evaluationId: ID!
  requestId: ID!
  decisionId: ID!
  decision: AgenticReuseDecision!
  reasonCodes: [String!]!
  observedDependencyHeadRoot: Hash!
  currentPolicyVersion: String!
  currentAuthorizationDecisionHash: Hash!
  resultRef: String
  planTemplateRef: String
  freshPreflightRequired: Boolean!
  consumed: AgenticReuseConsumption!
  auditEventId: ID!
  evaluationHash: Hash!
  evaluatedAt: DateTime!
}

type AgenticDecisionPerceptionCard {
  accountId: AccountID!
  cardId: ID!
  sourceType: AgenticDecisionSourceType!
  sourceId: ID!
  sourceVersion: String!
  decisionType: String!
  redactedIntentSummary: String!
  evidenceKinds: [String!]!
  allowedPurposeIds: [ID!]!
  decisionClass: AgenticDecisionClass
  resultCategory: String
  freshness: String!
  sensitivityLabels: [String!]!
  semanticTextHash: Hash!
  embeddingModelVersion: String!
  vectorManifestId: ID!
  updatedAt: DateTime!
}

type AgenticDecisionSearchCandidate {
  accountId: AccountID!
  card: AgenticDecisionPerceptionCard!
  distance: Float!
  discoveryOnly: Boolean!
  exactEligibilityCheckRequired: Boolean!
  candidateAttestationHash: Hash!
}

type AgenticDecisionSearchConnection {
  candidates: [AgenticDecisionSearchCandidate!]!
  vectorManifestHash: Hash!
  orderedCandidateAttestationHash: Hash!
  omissionCodes: [String!]!
}

type AgenticDecisionMutationPayload {
  receipt: AgenticDecisionReceipt
  accepted: Boolean!
  reasonCodes: [String!]!
  auditEventId: ID!
}

extend type Query {
  agenticDecision(
    accountId: AccountID!
    decisionId: ID!
  ): AgenticDecisionReceipt

  agenticDecisionReuseEvaluation(
    accountId: AccountID!
    evaluationId: ID!
  ): AgenticDecisionReuseEvaluation

  searchAgenticDecisions(
    input: SearchAgenticDecisionsInput!
  ): AgenticDecisionSearchConnection!
}

extend type Mutation {
  recordAgenticDecision(
    input: RecordAgenticDecisionInput!
  ): AgenticDecisionMutationPayload!

  evaluateAgenticDecisionReuse(
    input: EvaluateAgenticDecisionReuseInput!
  ): AgenticDecisionReuseEvaluation!
}
```

Receipt lookup intentionally omits the encrypted result reference. Result release is
available only through `evaluateAgenticDecisionReuse`; otherwise an API client could
bypass current authorization and dependency checks by reading an old receipt directly.
The reuse input also omits a claimed “current” policy version: the service resolves the
authoritative version after authenticating the account, so a caller cannot pin an old
policy to make a stale receipt appear eligible.
Outcome registration should use the existing typed event-ingestion API so callers
cannot invent an outcome without an auditable source event.

## Agentic guardrails and admission

Every request compiles into an execution envelope with:

- authenticated `account_id`, principal, and purpose;
- operation class: record, exact lookup, semantic discovery, or reuse evaluation;
- maximum dependency reads, policy checks, ANN candidates, row reads, bytes, and time;
- reuse depth, fixed at zero for version 1;
- required consistency and source visibility epoch;
- current policy and contract versions;
- normalized plan hash; and
- idempotency key and audit-chain predecessor.

Admission rejects:

- missing or conflicting account scope;
- more than 128 dependencies or duplicate dependency keys;
- a dependency whose owning account cannot be proven;
- `topK > 50`, `maxCandidates > 500`, or `efSearch > 256`;
- recursive reuse, cyclic template expansion, or more than 32 procedure steps;
- wildcard board scans or unindexed JSON predicates;
- action-result reuse without fresh preflight;
- a request whose estimates exceed its tenant budget; and
- fallback from ANN to exact vector or text scan.

Workload classes have separate pools. Exact reuse checks use a small reserved control
pool; semantic discovery uses a vector pool; proactive revalidation uses a lower
priority background pool. One tenant exhausting revalidation capacity cannot consume
another tenant's reserved interactive capacity.

## Performance check for boards with 1M+ rows

### Safe paths

- Receipt lookup: one point read on `(account_id, decision_id)`.
- Dependency validation: at most 128 receipt dependencies plus 128 composite-key head
  reads. Complexity depends on the decision closure, not board size.
- Exact-intent lookup: bounded by
  `(account_id, canonical_intent_hash, decision_type, created_at)`.
- Outcome history: cursor pagination on
  `(account_id, decision_id, observed_at, outcome_id)`.
- Semantic discovery: account-bound HNSW traversal with bounded candidates and no exact
  fallback.
- Proactive invalidation: cursor pagination through the reverse dependency index under
  a background tenant budget.
- Broad outcome analytics: admitted columnar query over partition-pruned data, never
  interactive row-store aggregation.

### Full-scan risks and required behavior

| Risk | Why it scans | Required behavior |
| --- | --- | --- |
| “Find any reusable decision for this board” | No exact intent or bounded object key | Reject; require intent hash or bounded HNSW discovery |
| Querying receipt JSON with arbitrary paths | Unindexed schemaless predicate | Reject unless declared in a versioned data contract with an index |
| Eagerly invalidating all receipts after one edit | Unbounded reverse-edge fan-out | Commit one dependency head; page background work |
| Exact vector fallback after underfilled ANN | Computes distance over a large tenant corpus | Return underfilled with omission code |
| Revalidating all dependencies transitively | Hidden recursive expansion | Validate the captured closure only; recompute to form a new closure |
| Reading all outcomes to estimate success | Row-store aggregation grows with history | Route an admitted aggregate to columnar storage |
| Searching without `account_id` | Cross-tenant partition and leakage risk | Reject before planning; RLS also denies rows |

The planner must expose `estimatedRows`, `estimatedBytes`, `dependencyReads`,
`vectorCandidates`, `partitionCount`, and `fullScanReason`. Interactive plans with a
non-null `fullScanReason` are rejected, not merely warned.

## Auditability and replay

Canonical hashing uses versioned field ordering, UTF-8 NFC strings, UTC timestamps,
canonical decimal strings, sorted dependency tuples, and explicit nulls. Raw secrets,
unredacted evidence, embeddings, and encrypted result bodies never enter audit
payloads.

For a receipt, replay verifies:

1. canonical intent hash;
2. temporal snapshot and evidence roots;
3. ordered dependency-set hash;
4. procedure, policy, contract, capability, vector, and model artifact hashes;
5. result schema, result, and disclosed explanation hashes;
6. transaction commit sequence and outbox payload hash; and
7. the tenant audit-chain predecessor.

For reuse, replay uses the recorded current authorization decision, exact ordered
dependency-head observations, policy version, purpose, budget, decision table version,
and evaluation hash. It can prove why reuse was allowed or denied without asking the
model to reproduce its reasoning.

Mutable HNSW traversal is not replayed as though it were deterministic. Semantic audit
stores the sealed graph artifact hash and signed ordered candidate attestation. A
different graph generation is a new search, not a replay.

## Availability, consistency, and failure behavior

- Receipt commits use the strongly consistent row path. Perception cards, embeddings,
  columnar outcomes, and proactive revalidation are asynchronous derived layers.
- A receipt is durable only when receipt, dependencies, audit event, and outbox record
  commit together.
- A dependency-head update is monotonic by `observed_at_sequence`; stale consumers
  cannot restore an older head.
- If current authorization, a required dependency head, or the audit sink is
  unavailable, reuse fails closed. An old result is never returned “for availability.”
- If vector search is unavailable, exact receipt lookup and exact reuse evaluation
  remain available. The API returns a typed vector-layer omission.
- If the proactive queue is delayed, release-time checks remain correct. Only the
  probability of a fast successful reuse decreases.
- Encrypted result retention may be shorter than receipt retention. An expired result
  reference yields `RECOMPUTE`; the hash-only receipt remains auditable.
- Multi-region reads must observe a signed dependency-head checkpoint at least as new
  as the request's required visibility epoch. A lagging region returns
  `SOURCE_VISIBILITY_CHANGED` or retries within the bounded timeout.

This design protects the 99.99% availability target by keeping exact operational paths
independent of vector and columnar layers, while refusing to trade correctness or
tenant isolation for stale-result availability.

## Rollout sequence

1. **Observe only:** write receipts, dependencies, and audit roots for selected
   informational decisions; do not expose reuse.
2. **Shadow revalidation:** evaluate eligibility in parallel with recomputation and
   compare result hashes, latency, stale-hit rate, and policy-denial rate.
3. **Informational reuse:** release exact informational results for opt-in accounts
   after deterministic checks; maintain a kill switch per tenant and decision type.
4. **Semantic discovery:** publish redacted perception cards into sealed account-bound
   vector manifests; keep every candidate discovery-only.
5. **Plan-template reuse:** allow `TOOL_PLAN` and `MUTATION_PLAN` templates to feed
   fresh preflight, never direct execution.
6. **Outcome analytics:** expose reviewed columnar metrics for template quality and
   drift; do not auto-promote templates.

SLOs should include reuse-evaluation p50/p99 latency, dependency-head read count,
recompute rate by reason, unauthorized release count (target zero), cross-tenant
candidate count (target zero), stale-result escapes (target zero), queue lag, semantic
underfill rate, and per-tenant neighbor-impact budget consumption.

## Decision

mondayDB should add a Decision Memory and Revalidation Plane, but it should not market
old model answers as durable truth. The durable product is the receipt: a deterministic,
tenant-scoped link between intent, evidence, policy, procedure, result, and time.

An agent perceives these records as compact cards:

- **similar prior decision** for semantic orientation;
- **evidence and procedure versions** for grounded planning;
- **freshness and sensitivity labels** for risk awareness;
- **outcome observations** as non-causal feedback; and
- **exact revalidation required** as an explicit affordance.

That distinction lets mondayDB provide useful long-term decision memory without moving
probabilistic behavior, stale authorization, or unbounded recursive work into the
database engine.
