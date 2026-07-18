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
- deterministic reuse of informational and recommendation results;
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
  decisionType: string;
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
  encryptedResultArtifactId: string;
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
  minimumVisibilityCheckpointToken?: string;
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
  authorityCheckpointSequence: string;
}

interface DecisionVisibilityCheckpoint {
  accountId: string;
  checkpointId: string;
  checkpointSequence: string;
  dependencyHeadAppliedSequence: string;
  policyAppliedSequence: string;
  authorizationAppliedSequence: string;
  sourceVisibilityEpoch: string;
  revocationFenceEpoch: string;
  checkpointHash: string;
  signedToken: string;
  expiresAt: string;
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
  visibilityCheckpointId: string;
  visibilityCheckpointHash: string;
  currentPolicyVersion: string;
  currentAuthorizationDecisionHash: string;
  authorizationAttestationHash: string;
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

interface DecisionReuseRelease {
  accountId: string;
  evaluation: DecisionReuseEvaluation;
  releaseCapability?: string;
  releaseCapabilityExpiresAt?: string;
  releaseKind?: "RESULT" | "PLAN_TEMPLATE";
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
  supersedesTemplateVersion?: string;
  createdAt: string;
}

interface DecisionTemplateApplicabilityRequest {
  accountId: string;
  requestId: string;
  principalId: string;
  purposeId: string;
  templateId: string;
  templateVersion: string;
  contextSnapshotToken: string;
  targetObjectRefs: AgenticDecisionIntent["targetObjectRefs"];
  budget: DecisionReuseBudget;
  idempotencyKey: string;
  canonicalRequestHash: string;
}

interface DecisionTemplateApplicabilityEvaluation {
  accountId: string;
  evaluationId: string;
  templateId: string;
  templateVersion: string;
  applicable: boolean;
  reasonCodes: string[];
  visibilityCheckpointId: string;
  authorizationAttestationHash: string;
  preconditionEvaluationHash: string;
  capabilityEvaluationHash: string;
  budgetEvaluationHash: string;
  auditEventId: string;
}

interface DecisionTemplateEvaluationRelease {
  accountId: string;
  evaluation: DecisionTemplateApplicabilityEvaluation;
  instructionReleaseCapability?: string;
  releaseCapabilityExpiresAt?: string;
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
  queryEmbeddingRef: {
    accountId: string;
    embeddingId: string;
    embeddingHash: string;
  };
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
  candidatePolicyDecisionHash: string;
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

CREATE TYPE agentic_reuse_reason AS ENUM (
  'ELIGIBLE',
  'DEPENDENCY_CHANGED',
  'DEPENDENCY_REVOKED',
  'DEPENDENCY_MISSING',
  'POLICY_CHANGED',
  'PRINCIPAL_NOT_AUTHORIZED',
  'PURPOSE_MISMATCH',
  'PROCEDURE_RETIRED',
  'SOURCE_VISIBILITY_CHANGED',
  'RESULT_EXPIRED',
  'ACTION_REQUIRES_FRESH_PREFLIGHT',
  'DEPENDENCY_LIMIT_EXCEEDED',
  'BUDGET_EXHAUSTED',
  'RECURSIVE_REUSE_FORBIDDEN'
);

CREATE TABLE agentic_decision_idempotency_records (
  account_id             bigint        NOT NULL,
  operation              text          NOT NULL,
  principal_id           bigint        NOT NULL,
  idempotency_key        text          NOT NULL,
  canonical_request_hash bytea         NOT NULL,
  response_type          text          NOT NULL,
  response_id            uuid          NOT NULL,
  response_version       text,
  response_identity_hash bytea         NOT NULL,
  created_at             timestamptz   NOT NULL,
  PRIMARY KEY (account_id, operation, principal_id, idempotency_key),
  CHECK (
    operation IN (
      'RECORD_DECISION',
      'EVALUATE_REUSE',
      'REGISTER_TEMPLATE',
      'EVALUATE_TEMPLATE',
      'REGISTER_OUTCOME'
    )
  )
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_decision_receipts (
  account_id              bigint        NOT NULL,
  decision_id             uuid          NOT NULL,
  request_id              uuid          NOT NULL,
  principal_id            bigint        NOT NULL,
  idempotency_key         text          NOT NULL,
  canonical_request_hash  bytea         NOT NULL,
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
  encrypted_result_artifact_id uuid      NOT NULL,
  result_hash             bytea         NOT NULL,
  explanation_hash        bytea,
  model_artifact_set_hash bytea         NOT NULL,
  source_visibility_epoch bigint        NOT NULL,
  expires_at              timestamptz,
  audit_root_hash         bytea         NOT NULL,
  created_at              timestamptz   NOT NULL,
  PRIMARY KEY (account_id, decision_id),
  UNIQUE (account_id, request_id),
  UNIQUE (account_id, principal_id, idempotency_key),
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

CREATE TABLE agentic_decision_procedure_refs (
  account_id         bigint        NOT NULL,
  decision_id        uuid          NOT NULL,
  procedure_ordinal  smallint      NOT NULL,
  procedure_id       uuid          NOT NULL,
  procedure_version  text          NOT NULL,
  artifact_hash      bytea         NOT NULL,
  created_at         timestamptz   NOT NULL,
  PRIMARY KEY (account_id, decision_id, procedure_ordinal),
  UNIQUE (account_id, decision_id, procedure_id, procedure_version),
  FOREIGN KEY (account_id, decision_id)
    REFERENCES agentic_decision_receipts (account_id, decision_id),
  CHECK (procedure_ordinal BETWEEN 0 AND 31)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_decision_visibility_checkpoints (
  account_id                       bigint        NOT NULL,
  checkpoint_id                    uuid          NOT NULL,
  checkpoint_sequence              bigint        NOT NULL,
  dependency_head_applied_sequence bigint        NOT NULL,
  policy_applied_sequence          bigint        NOT NULL,
  authorization_applied_sequence   bigint        NOT NULL,
  source_visibility_epoch          bigint        NOT NULL,
  revocation_fence_epoch           bigint        NOT NULL,
  checkpoint_hash                  bytea         NOT NULL,
  authority_signature              bytea         NOT NULL,
  expires_at                       timestamptz   NOT NULL,
  created_at                       timestamptz   NOT NULL,
  PRIMARY KEY (account_id, checkpoint_id),
  UNIQUE (account_id, checkpoint_sequence),
  CHECK (dependency_head_applied_sequence >= checkpoint_sequence),
  CHECK (policy_applied_sequence >= checkpoint_sequence),
  CHECK (authorization_applied_sequence >= checkpoint_sequence),
  CHECK (source_visibility_epoch >= 0),
  CHECK (revocation_fence_epoch >= 0)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_dependency_heads (
  account_id            bigint        NOT NULL,
  dependency_kind       agentic_dependency_kind NOT NULL,
  dependency_id         text          NOT NULL,
  current_version       text          NOT NULL,
  current_version_hash  bytea         NOT NULL,
  visibility_epoch      bigint        NOT NULL,
  revoked               boolean       NOT NULL DEFAULT false,
  observed_at_sequence  bigint        NOT NULL,
  authority_checkpoint_sequence bigint NOT NULL,
  updated_at            timestamptz   NOT NULL,
  PRIMARY KEY (account_id, dependency_kind, dependency_id),
  CHECK (observed_at_sequence >= 0),
  CHECK (authority_checkpoint_sequence >= observed_at_sequence),
  CHECK (visibility_epoch >= 0)
) PARTITION BY HASH (account_id);

CREATE TABLE agentic_decision_reuse_evaluations (
  account_id                          bigint        NOT NULL,
  evaluation_id                       uuid          NOT NULL,
  request_id                          uuid          NOT NULL,
  idempotency_key                     text          NOT NULL,
  canonical_request_hash              bytea         NOT NULL,
  decision_id                         uuid          NOT NULL,
  principal_id                        bigint        NOT NULL,
  purpose_id                          uuid          NOT NULL,
  reuse_decision                      agentic_reuse_decision NOT NULL,
  reason_codes                        agentic_reuse_reason[] NOT NULL,
  observed_dependency_head_root       bytea         NOT NULL,
  visibility_checkpoint_id            uuid          NOT NULL,
  visibility_checkpoint_hash          bytea         NOT NULL,
  current_policy_version              text          NOT NULL,
  current_authorization_decision_hash bytea         NOT NULL,
  authorization_attestation_hash      bytea         NOT NULL,
  decision_table_version              text          NOT NULL,
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
  FOREIGN KEY (account_id, visibility_checkpoint_id)
    REFERENCES agentic_decision_visibility_checkpoints (
      account_id,
      checkpoint_id
    ),
  CHECK (cardinality(reason_codes) BETWEEN 1 AND 16),
  CHECK (consumed_dependency_reads BETWEEN 0 AND 128),
  CHECK (consumed_policy_checks BETWEEN 0 AND 32),
  CHECK (consumed_estimated_row_reads >= 0),
  CHECK (consumed_estimated_bytes >= 0),
  CHECK (consumed_elapsed_ms >= 0),
  CHECK (
    (reuse_decision = 'REUSE_PLAN_ONLY') = fresh_preflight_required
  )
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_reuse_request_idx
  ON agentic_decision_reuse_evaluations (
    account_id,
    request_id,
    evaluated_at DESC
  );

CREATE TABLE agentic_decision_reuse_observations (
  account_id                    bigint        NOT NULL,
  evaluation_id                 uuid          NOT NULL,
  dependency_ordinal            smallint      NOT NULL,
  dependency_kind               agentic_dependency_kind NOT NULL,
  dependency_id                 text          NOT NULL,
  observed_version              text          NOT NULL,
  observed_version_hash         bytea         NOT NULL,
  observed_visibility_epoch     bigint        NOT NULL,
  observed_at_sequence          bigint        NOT NULL,
  authority_checkpoint_sequence bigint        NOT NULL,
  revoked                       boolean       NOT NULL,
  observation_hash              bytea         NOT NULL,
  PRIMARY KEY (account_id, evaluation_id, dependency_ordinal),
  UNIQUE (account_id, evaluation_id, dependency_kind, dependency_id),
  FOREIGN KEY (account_id, evaluation_id)
    REFERENCES agentic_decision_reuse_evaluations (account_id, evaluation_id),
  CHECK (dependency_ordinal BETWEEN 0 AND 127),
  CHECK (authority_checkpoint_sequence >= observed_at_sequence)
) PARTITION BY HASH (account_id);

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

CREATE TABLE agentic_decision_template_evaluations (
  account_id                       bigint        NOT NULL,
  evaluation_id                    uuid          NOT NULL,
  request_id                       uuid          NOT NULL,
  principal_id                     bigint        NOT NULL,
  purpose_id                       uuid          NOT NULL,
  template_id                      uuid          NOT NULL,
  template_version                 text          NOT NULL,
  visibility_checkpoint_id         uuid          NOT NULL,
  applicable                       boolean       NOT NULL,
  reason_codes                     text[]        NOT NULL,
  authorization_attestation_hash   bytea         NOT NULL,
  precondition_evaluation_hash     bytea         NOT NULL,
  capability_evaluation_hash       bytea         NOT NULL,
  budget_evaluation_hash           bytea         NOT NULL,
  audit_event_id                   uuid          NOT NULL,
  evaluation_hash                  bytea         NOT NULL,
  evaluated_at                     timestamptz   NOT NULL,
  PRIMARY KEY (account_id, evaluation_id),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (account_id, template_id, template_version)
    REFERENCES agentic_decision_templates (
      account_id,
      template_id,
      template_version
    ),
  FOREIGN KEY (account_id, visibility_checkpoint_id)
    REFERENCES agentic_decision_visibility_checkpoints (
      account_id,
      checkpoint_id
    ),
  CHECK (cardinality(reason_codes) BETWEEN 1 AND 16)
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

-- This relation is an authoritative staging catalog, not a shared HNSW graph.
-- The vector publisher exports one sealed graph object per exact account,
-- model version, and immutable manifest into an account-authorized namespace.
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
  UNIQUE NULLS NOT DISTINCT (
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
  account_id          bigint        NOT NULL,
  audit_event_id      uuid          NOT NULL,
  audit_shard         smallint      NOT NULL,
  event_sequence      bigint        NOT NULL,
  commit_sequence     bigint        NOT NULL,
  aggregate_type      text          NOT NULL,
  aggregate_id        uuid          NOT NULL,
  decision_id         uuid,
  evaluation_id       uuid,
  event_type          text          NOT NULL,
  actor_principal_id  bigint        NOT NULL,
  checkpoint_id       uuid          NOT NULL,
  canonical_payload   jsonb         NOT NULL,
  retained_attestation_artifact_id uuid NOT NULL,
  retained_attestation_hash bytea   NOT NULL,
  previous_event_hash bytea,
  event_hash          bytea         NOT NULL,
  created_at          timestamptz   NOT NULL,
  PRIMARY KEY (account_id, audit_event_id),
  UNIQUE (account_id, event_hash),
  UNIQUE (account_id, audit_shard, event_sequence),
  CHECK (jsonb_typeof(canonical_payload) = 'object'),
  CHECK (audit_shard BETWEEN 0 AND 63),
  CHECK (event_sequence >= 0),
  CHECK (commit_sequence >= 0),
  CHECK (
    aggregate_type IN (
      'DECISION',
      'REUSE_EVALUATION',
      'DECISION_TEMPLATE',
      'DECISION_OUTCOME'
    )
  )
) PARTITION BY HASH (account_id);

CREATE INDEX agentic_decision_audit_aggregate_idx
  ON agentic_decision_audit_events (
    account_id,
    aggregate_type,
    aggregate_id,
    event_sequence
  );

CREATE UNIQUE INDEX agentic_decision_audit_predecessor_idx
  ON agentic_decision_audit_events (
    account_id,
    audit_shard,
    previous_event_hash
  )
  WHERE previous_event_hash IS NOT NULL;

CREATE TABLE agentic_decision_audit_heads (
  account_id          bigint        NOT NULL,
  audit_shard         smallint      NOT NULL,
  head_event_sequence bigint        NOT NULL,
  head_event_hash     bytea         NOT NULL,
  lease_generation    bigint        NOT NULL,
  updated_at          timestamptz   NOT NULL,
  PRIMARY KEY (account_id, audit_shard),
  CHECK (audit_shard BETWEEN 0 AND 63),
  CHECK (head_event_sequence >= 0),
  CHECK (lease_generation >= 0)
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

CREATE INDEX agentic_decision_outbox_unpublished_idx
  ON agentic_decision_outbox (
    account_id,
    commit_sequence,
    outbox_id
  )
  WHERE published_at IS NULL;
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
ALTER TABLE agentic_decision_idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_procedure_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_visibility_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_dependency_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_reuse_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_reuse_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_template_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_perception_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_revalidation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_audit_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_decision_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agentic_decision_idempotency_records
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_receipts
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_dependencies
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_procedure_refs
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_visibility_checkpoints
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_dependency_heads
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_reuse_evaluations
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_reuse_observations
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_templates
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_template_evaluations
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_perception_cards
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_outcomes
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_revalidation_jobs
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_audit_events
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_audit_heads
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);

CREATE POLICY tenant_isolation ON agentic_decision_outbox
  USING (account_id = current_setting('monday.account_id')::bigint)
  WITH CHECK (account_id = current_setting('monday.account_id')::bigint);
```

The query compiler rejects a statement unless its normalized predicate contains
`account_id = :authenticated_account_id`. RLS is defense in depth, not a replacement
for tenant-leading plans. Production roles do not own these tables and do not have
`BYPASSRLS`.

### Consistency checkpoint and release fence

The tenant control cell issues a signed visibility checkpoint only after its quorum has
applied source commits, dependency heads, policy, authorization, and revocation
prefixes through the checkpoint sequence. These applied-prefix fields use the same
tenant-global commit-sequence domain and must each be greater than or equal to the
issued checkpoint sequence. A reuse evaluation reads all of those authorities from one
MVCC snapshot at that checkpoint. If a client supplies a minimum checkpoint token for
read-your-writes, the service may advance it but never select an older checkpoint.

The evaluation commit is the linearization point for ordinary source changes. A
subsequent edit does not retroactively change a read that already linearized. Safety
revocations are stricter: any result capability carries the checkpoint and
`revocation_fence_epoch`, and the encrypted artifact service compares that epoch with
its linearizable revocation head immediately before release. A concurrent fetch and
revocation therefore orders before or after the revocation; it cannot silently use an
old evaluation after the fence closes.

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
7. Hash the ordered dependency set, result schema, tenant-bound encrypted result
   artifact, result,
   explanation, and model artifacts.
8. In one serializable row-store transaction, insert the receipt, dependency and
   procedure-reference rows, sharded audit event/head, idempotency tuple, and outbox
   event.
9. Asynchronously create a redacted perception card from policy-approved fields.

The idempotency tuple is `(account_id, operation, principal_id, idempotency_key,
canonical_request_hash, response_type, response_id, response_version,
response_identity_hash)`. A retry with the same key and hash returns the same response.
The same key with a different hash is rejected; uniqueness alone is not treated as
sufficient idempotency. The server canonicalizes the typed input and recomputes the
request hash; the client field is only an assertion. The versioned response identity
lets a template be recovered without ambiguity.

The LLM's chain-of-thought is not required and should not be stored. The receipt keeps
structured evidence references, the disclosed explanation hash, and the final result
hash needed for replay without retaining hidden reasoning or sensitive prompt content.

### 2. Evaluate reuse

The release path is exact and bounded:

1. Authenticate the account and obtain a signed tenant visibility checkpoint no older
   than the optional minimum supplied by the caller.
2. At one checkpoint-bound MVCC snapshot, read the receipt by
   `(account_id, decision_id)`.
3. Verify `expected_intent_hash`, purpose compatibility, expiry, source visibility
   epoch, and the request's idempotency tuple.
4. Resolve the authoritative current policy and re-evaluate authorization for the new
   principal at the same checkpoint. Never trust a caller's policy version or copy the
   receipt's old authorization result.
5. Read at most 128 dependencies from
   `agentic_decision_dependencies` and batch-read their current rows from
   `agentic_dependency_heads` by full composite keys.
6. Require every head's authority checkpoint sequence to be covered by the signed
   checkpoint. Canonically sort and persist the observations, then compute
   `observed_dependency_head_root`.
7. Compare required captured hashes and visibility epochs with current heads.
8. Apply the deterministic decision table:

| Condition | Result |
| --- | --- |
| Unauthorized principal or purpose | `REJECT` |
| Missing, revoked, or hidden dependency | `REJECT` |
| Required dependency changed | `RECOMPUTE` |
| Receipt expired or policy changed | `RECOMPUTE` |
| Informational/recommendation receipt, all checks pass | `REUSE_RESULT` |
| Tool/mutation plan, all checks pass, plan reuse allowed | `REUSE_PLAN_ONLY` |
| Tool/mutation plan, plan reuse not allowed | `RECOMPUTE` |

9. In one control-cell transaction, persist the evaluation, exact observation rows,
   retained authorization attestation hash, audit event/head, idempotency tuple, and
   outbox event.
10. If eligible, mint a short-lived release capability bound to the account, principal,
    purpose, evaluation, checkpoint, artifact, and revocation fence. The artifact
    service validates it immediately before fetch. Historical evaluation reads never
    return this capability.
11. For `REUSE_PLAN_ONLY`, issue no side effect. Submit the plan to fresh policy,
   neighbor-impact, budget, tool-lease, and transaction-intent preflight.

The engine does not recursively look for another reusable receipt when this evaluation
returns `RECOMPUTE`. The caller may submit one new decision request; its control
envelope carries a reuse depth of zero.

### 3. Evaluate a decision template

An exact template lookup returns metadata, never instructions. Template evaluation
acquires the same signed visibility checkpoint as receipt reuse, resolves the active
immutable template version, and checks current authorization and purpose. It evaluates
the versioned precondition contract against the supplied context snapshot and exact
target refs, resolves current capability heads, and clamps the requested budget to the
template, tenant, principal, and workload limits.

The service persists the template evaluation, retained attestations, audit event/head,
idempotency tuple, and outbox event before minting a short-lived instruction-release
capability. The capability is account-, principal-, purpose-, template-version-,
checkpoint-, and revocation-fence-bound. Fetching instructions cannot invoke tools,
query another template, or extend the capability; the resulting plan still enters the
ordinary plan-verification path.

### 4. React to dependency changes

For row-store facts, the authoritative source mutation, exact dependency-head advance,
audit event, and outbox event commit in the same ACID transaction. For columnar,
vector, procedure, policy, contract, and capability artifacts, the head advances in
the tenant control cell only after the immutable artifact is sealed and the coordinator
has committed its visibility record. An asynchronous consumer may request publication
but cannot authoritatively advance a head.

Head updates use compare-and-set:

```sql
UPDATE agentic_dependency_heads
SET current_version = :version,
    current_version_hash = :version_hash,
    visibility_epoch = :visibility_epoch,
    revoked = :revoked,
    observed_at_sequence = :sequence,
    authority_checkpoint_sequence = :checkpoint_sequence,
    updated_at = :updated_at
WHERE account_id = :account_id
  AND dependency_kind = :dependency_kind
  AND dependency_id = :dependency_id
  AND observed_at_sequence < :sequence;
```

Zero updated rows means duplicate, stale, or conflicting publication and must be
resolved against the stored hash; a `CHECK` constraint alone does not prove monotonic
updates. Consumers may use the reverse dependency index to enqueue proactive
revalidation, but they page by
`(account_id, dependency_kind, dependency_id, decision_id)` and obey per-tenant
budgets.

Synchronous writes never update every dependent receipt. That would turn one board
change into an unbounded invalidation transaction. Correctness instead comes from the
authoritative dependency-head comparison on release. Background jobs reduce future
latency and refresh perception-card freshness labels; they are an optimization only.

Queue workers claim jobs with compare-and-swap on `lease_generation`. Completion is
accepted only from the current lease generation, making a delayed worker unable to
overwrite a newer result.

### 5. Attach outcomes without rewriting history

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
2. The SQL hash partition is staging storage, not a shared ANN graph. The vector
   publisher builds a sealed HNSW object for exactly one `account_id`, embedding model
   version, and manifest generation. Small accounts may share hosts, but never a graph
   object, access key, cache namespace, or candidate list.
3. The query uses a server-minted embedding reference scoped by `(account_id,
   embedding_id, embedding_hash)`. A hash alone is not accepted as a query vector.
4. The router authenticates the exact account and model before ANN traversal. Purpose
   and object visibility are checked against a strongly consistent sidecar for each
   bounded candidate before any card is returned. Sensitive purpose domains may use
   separate per-account graph objects; the system never relies on a stale
   `allowed_purpose_ids` array as authorization.
5. `topK <= 50`, `maxCandidates <= 500`, and `efSearch <= 256`.
6. Results include an ordered candidate attestation hash, per-candidate policy decision
   hashes, and the vector manifest hash. Rejected candidates are omitted, not exposed
   with redacted fields.
7. Underfilled ANN results remain underfilled. The engine does not scan receipt text or
   compute exact distance over all vectors.
8. Every receipt candidate must pass exact intent, authorization, and dependency
   revalidation before a result can be reused.
9. Every template candidate must pass exact status, purpose, precondition-contract,
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

enum AgenticReuseReason {
  ELIGIBLE
  DEPENDENCY_CHANGED
  DEPENDENCY_REVOKED
  DEPENDENCY_MISSING
  POLICY_CHANGED
  PRINCIPAL_NOT_AUTHORIZED
  PURPOSE_MISMATCH
  PROCEDURE_RETIRED
  SOURCE_VISIBILITY_CHANGED
  RESULT_EXPIRED
  ACTION_REQUIRES_FRESH_PREFLIGHT
  DEPENDENCY_LIMIT_EXCEEDED
  BUDGET_EXHAUSTED
  RECURSIVE_REUSE_FORBIDDEN
}

enum AgenticDecisionSourceType {
  DECISION_RECEIPT
  DECISION_TEMPLATE
}

enum AgenticDecisionTemplateStatus {
  DRAFT
  ACTIVE
  RETIRED
  REVOKED
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

input AgenticDecisionProcedureRefInput {
  accountId: AccountID!
  procedureId: ID!
  procedureVersion: String!
  artifactHash: Hash!
}

input RecordAgenticDecisionInput {
  accountId: AccountID!
  requestId: ID!
  principalId: ID!
  purposeId: ID!
  decisionClass: AgenticDecisionClass!
  decisionType: String!
  intent: AgenticDecisionIntentInput!
  temporalSnapshotToken: String!
  expectedPolicyVersion: String!
  procedureRefs: [AgenticDecisionProcedureRefInput!]!
  dependencies: [AgenticDecisionDependencyInput!]!
  resultSchemaId: ID!
  encryptedResultArtifactId: ID!
  resultHash: Hash!
  explanationHash: Hash
  modelArtifactHashes: [Hash!]!
  expiresAt: DateTime
  idempotencyKey: String!
  canonicalRequestHash: Hash!
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
  minimumVisibilityCheckpointToken: String
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
  queryEmbeddingId: ID!
  queryEmbeddingHash: Hash!
  topK: Int!
  maxCandidates: Int!
  efSearch: Int!
  timeoutMs: Int!
  metadataFilterHash: Hash!
}

input RegisterAgenticDecisionTemplateInput {
  accountId: AccountID!
  requestId: ID!
  principalId: ID!
  templateId: ID!
  templateVersion: String!
  decisionType: String!
  instructions: JSON!
  preconditionContractId: ID!
  allowedPurposeIds: [ID!]!
  requiredCapabilityIds: [ID!]!
  maximumBudget: AgenticReuseBudgetInput!
  outputSchemaId: ID!
  status: AgenticDecisionTemplateStatus!
  artifactHash: Hash!
  supersedesTemplateVersion: String
  idempotencyKey: String!
  canonicalRequestHash: Hash!
}

input EvaluateAgenticDecisionTemplateInput {
  accountId: AccountID!
  requestId: ID!
  principalId: ID!
  purposeId: ID!
  templateId: ID!
  templateVersion: String!
  contextSnapshotToken: String!
  targetObjectRefs: [AgenticObjectRefInput!]!
  budget: AgenticReuseBudgetInput!
  idempotencyKey: String!
  canonicalRequestHash: Hash!
}

type AgenticDecisionProcedureRef {
  accountId: AccountID!
  procedureId: ID!
  procedureVersion: String!
  artifactHash: Hash!
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
  procedureRefs: [AgenticDecisionProcedureRef!]!
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
  principalId: ID!
  purposeId: ID!
  decision: AgenticReuseDecision!
  reasonCodes: [AgenticReuseReason!]!
  observedDependencyHeadRoot: Hash!
  visibilityCheckpointId: ID!
  visibilityCheckpointHash: Hash!
  currentPolicyVersion: String!
  currentAuthorizationDecisionHash: Hash!
  authorizationAttestationHash: Hash!
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
  candidatePolicyDecisionHash: Hash!
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

type AgenticDecisionReusePayload {
  evaluation: AgenticDecisionReuseEvaluation!
  releaseCapability: String
  releaseCapabilityExpiresAt: DateTime
  releaseKind: String
}

type AgenticReuseBudget {
  maxDependencies: Int!
  maxSemanticCandidates: Int!
  maxPolicyChecks: Int!
  maxEstimatedRowReads: BigInt!
  maxEstimatedBytes: BigInt!
  timeoutMs: Int!
}

type AgenticDecisionTemplateMetadata {
  accountId: AccountID!
  templateId: ID!
  templateVersion: String!
  decisionType: String!
  preconditionContractId: ID!
  allowedPurposeIds: [ID!]!
  requiredCapabilityIds: [ID!]!
  maximumBudget: AgenticReuseBudget!
  outputSchemaId: ID!
  status: AgenticDecisionTemplateStatus!
  artifactHash: Hash!
  supersedesTemplateVersion: String
  createdAt: DateTime!
}

type AgenticDecisionTemplateMutationPayload {
  template: AgenticDecisionTemplateMetadata
  accepted: Boolean!
  reasonCodes: [String!]!
  auditEventId: ID!
}

type AgenticDecisionTemplateEvaluationPayload {
  template: AgenticDecisionTemplateMetadata!
  evaluationId: ID!
  applicable: Boolean!
  reasonCodes: [String!]!
  visibilityCheckpointId: ID!
  authorizationAttestationHash: Hash!
  preconditionEvaluationHash: Hash!
  capabilityEvaluationHash: Hash!
  budgetEvaluationHash: Hash!
  instructionReleaseCapability: String
  releaseCapabilityExpiresAt: DateTime
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

  agenticDecisionTemplate(
    accountId: AccountID!
    principalId: ID!
    purposeId: ID!
    templateId: ID!
    templateVersion: String!
  ): AgenticDecisionTemplateMetadata

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
  ): AgenticDecisionReusePayload!

  registerAgenticDecisionTemplate(
    input: RegisterAgenticDecisionTemplateInput!
  ): AgenticDecisionTemplateMutationPayload!

  evaluateAgenticDecisionTemplate(
    input: EvaluateAgenticDecisionTemplateInput!
  ): AgenticDecisionTemplateEvaluationPayload!
}
```

Receipt and historical evaluation lookups intentionally omit result references.
`evaluateAgenticDecisionReuse` may return only a short-lived, principal-, purpose-,
account-, checkpoint-, and revocation-fence-bound release capability. The encrypted
artifact service rechecks the capability and current revocation fence at fetch time.
It never accepts an evaluation ID as authority. This prevents an API client from
bypassing current authorization and dependency checks by reading old metadata.
The exact template query likewise returns metadata only. Instructions are released
only through `evaluateAgenticDecisionTemplate` after current status, purpose,
authorization, context-snapshot preconditions, capabilities, and effective budget are
checked and audited. Its short-lived instruction capability uses the same account and
revocation fencing as result release.
The reuse input also omits a claimed “current” policy version: the service resolves the
authoritative version after authenticating the account, so a caller cannot pin an old
policy to make a stale receipt appear eligible.
`encryptedResultArtifactId` and `queryEmbeddingId` must be server-minted handles whose
owning artifact rows have composite `(account_id, artifact_id)` keys. The gateway
rejects a handle whose account differs before any blob or vector service call.
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
- Template applicability: one exact template-version read plus bounded point checks for
  its declared preconditions and at most 32 capabilities; no template instructions are
  released before those checks.
- Outcome history: cursor pagination on
  `(account_id, decision_id, observed_at, outcome_id)`.
- Semantic discovery: account-bound HNSW traversal with bounded candidates and no exact
  fallback.
- Proactive invalidation: cursor pagination through the reverse dependency index under
  a background tenant budget.
- Unpublished outbox work: partial index on
  `(account_id, commit_sequence, outbox_id) WHERE published_at IS NULL`.
- Audit append: point compare-and-swap on `(account_id, audit_shard)` followed by an
  account- and shard-leading event insert.
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

Exact observation rows remain in the row store for the enterprise replay window. The
retained, tenant-bound attestation artifact contains the signed authorization inputs,
checkpoint, normalized request, budget, dependency observations, and decision-table
version. The audit event stores its artifact ID and hash, so archival of row details
does not break proof verification.

Audit appends cannot race on a shared predecessor. A stable hash of the aggregate ID
selects one of 64 tenant audit shards. The transaction locks or compare-and-swaps
`agentic_decision_audit_heads`, inserts exactly the next sequence with the previous
head hash, and advances the head. The unique sequence and predecessor indexes reject a
fork. Signed periodic Merkle checkpoints combine the 64 shard heads into one tenant
audit root; external audit export consumes the transactional outbox asynchronously.

Mutable HNSW traversal is not replayed as though it were deterministic. Semantic audit
stores the sealed graph artifact hash and signed ordered candidate attestation. A
different graph generation is a new search, not a replay.

## Availability, consistency, and failure behavior

- Receipt commits use the strongly consistent row path. Perception cards, embeddings,
  columnar outcomes, and proactive revalidation are asynchronous derived layers.
- A receipt is durable only when receipt, dependencies, procedure references,
  idempotency tuple, local audit event/head, and outbox record commit together.
- A dependency-head update is monotonic by `observed_at_sequence`; stale consumers
  cannot restore an older head.
- If current authorization, a required dependency head, checkpoint quorum, local audit
  commit, or result-fence check is unavailable, reuse fails closed. An old result is
  never returned “for availability.” External audit export is not synchronous.
- If vector search is unavailable, exact receipt lookup and exact reuse evaluation
  remain available. The API returns a typed vector-layer omission.
- If the proactive queue is delayed, release-time checks remain correct. Only the
  probability of a fast successful reuse decreases.
- Encrypted result retention may be shorter than receipt retention. An expired result
  artifact yields `RECOMPUTE`; the hash-only receipt remains auditable.
- Multi-region reads must observe a signed dependency-head checkpoint at least as new
  as the request's required visibility epoch. A lagging region returns
  `SOURCE_VISIBILITY_CHANGED` or retries within the bounded timeout.

Exact reuse runs inside the tenant's multi-AZ control cell: row data, dependency heads,
policy snapshots, authorization snapshots, local audit, and revocation fences use
quorum replication and bounded failover. Vector, columnar, proactive queue, and
external audit-export outages are outside this synchronous path. Before general
availability, mondayDB must allocate the 99.99% error budget across every synchronous
dependency and prove the composed SLI with fault injection; this design reduces the
dependency set but does not claim that a schema alone guarantees the SLO.

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
