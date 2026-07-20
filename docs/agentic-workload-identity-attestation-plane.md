# mondayDB Agent Workload Identity and Attestation Plane

**Status:** Proposed  
**Audience:** mondayDB Product, Open API, Security, Identity, Storage, and Agent Platform teams  
**Decision:** Make verified non-human workload identity a deterministic admission primitive. Do not treat a caller-supplied `agent_id`, an embedding match, or an LLM assertion as identity.

## 1. Why this plane, before how

mondayDB's existing agentic controls can answer what an agent may read, which tools it may call, why it is acting, and how much work it may consume. Those decisions are only credible when the executing workload is genuinely the principal named in the request.

The missing binding is:

> cryptographically verified workload → software artifact → proof-of-possession key → tenant-local principal → fenced session → attributed database or tool operation

Without that binding, a stolen bearer token or forged `agent_id` can inherit valid purpose, delegation, runtime, and tool envelopes. Audit records would then be deterministic but attributed to the wrong actor.

The main product trade-off is **revocation strength versus availability**:

- Checking an external identity provider on every query gives fresh revocation but puts mondayDB availability and latency behind another control plane.
- Trusting a long-lived bearer token avoids that dependency but extends compromise blast radius and weakens attribution.
- The proposed design verifies external evidence when opening a short-lived session, then uses tenant-local point lookups and monotonic epochs on every admitted operation. Existing sessions remain usable during a verifier outage until their persisted expiry, while new sessions fail closed.

This preserves the deterministic database boundary. mondayDB verifies signed evidence through a versioned verifier and persists the exact result; it does not ask an LLM whether a workload “looks trusted.”

## 2. Scope and ownership

This plane has one narrow responsibility:

> Bind an authenticated non-human workload, its software artifact, key generation, and credential epoch to every admitted mondayDB operation.

| Question | Owning plane |
|---|---|
| Is this workload the claimed principal? | Workload Identity and Attestation |
| Is this the attested artifact and proof key? | Workload Identity and Attestation |
| Who delegated authority? | Consent and Delegation |
| Is the operation allowed? | Access Policy and Purpose Boundary |
| What limits and consistency apply? | Runtime Contract and Query Governor |
| How is an external effect executed? | Governed Action and Tool Execution |
| Is a semantic or procedural candidate relevant? | Retrieval Router and Procedure Memory |
| What happened and can it be replayed? | Workload Identity receipt plus Audit |

The identity plane verifies the identities on a delegation chain and binds a previously computed `delegation_evaluation_id` and hash. It does not reinterpret consent.

### Non-goals

- mondayDB is not a certificate authority and never stores private keys.
- Attestation does not prove that software is correct, safe, or non-malicious.
- Identity does not grant board access by itself.
- HNSW similarity is never authentication, authorization, or attestation evidence.
- Hardware claims are not converted into a probabilistic “trust score.”
- This plane does not promise distributed ACID across an identity provider, mondayDB, and an external tool.

## 3. Product contract

Every agent-originated request carries five separately attributable roles:

```text
executed_by    = workload principal + workload instance
on_behalf_of   = user or service represented by a delegation evaluation
software       = immutable artifact digest + verifier policy version
authorized_by  = access, purpose, delegation, and runtime decision hashes
performed_as   = canonical query plan, mutation intent, or tool-call hash
```

Collapsing those roles into one `actor_id` is prohibited. Support, compliance, and incident response must be able to distinguish a compromised build from an over-broad delegation or a bad query plan.

### Availability behavior

| Dependency state | Existing valid session | New session | Write/tool effect |
|---|---|---|---|
| All control planes healthy | Allow after local fence check | Verify and open | Allow after local fence check |
| External verifier unavailable | Allow until persisted effective expiry | Reject | Allow only if session remains valid |
| Tenant policy epoch advanced | Reject | Re-evaluate | Reject |
| Key or credential epoch advanced | Reject | Require current key | Reject |
| Attestation expired | Reject | Require fresh evidence | Reject |
| Audit append unavailable | Reject mutation | Reject | Reject |

Reads may use a separately approved degraded-mode policy, but degraded mode never bypasses account, session, expiry, or revocation fences.

## 4. Deterministic invariants

1. `account_id` comes from trusted resolver or transaction context, never GraphQL input or an agent claim.
2. Every primary key, foreign key, index, cache key, HNSW partition key, and audit shard begins with `account_id`.
3. A string-valued `agent_id` is metadata, not authority.
4. A principal remains stable across routine key rotation; key generations are subordinate records.
5. Sessions are proof-of-possession bound with mTLS, DPoP, or an equivalent `cnf` key. Replayable bearer-only sessions are rejected.
6. A session pins the exact principal, key generation, artifact digest, trust bundle, verifier policy, delegation evaluation, runtime contract, and authorization policy epochs.
7. Effective session expiry is the minimum of credential, attestation, delegation, runtime contract, and policy expiries.
8. Emergency revocation advances a monotonic tenant-local epoch. A stale session can never become valid again.
9. A retired key cannot open a session. An emergency-revoked key fences already open sessions.
10. Writes and tool effects recheck the session fence inside the same transaction that commits the intent or outbox entry.
11. Verification uses canonical evidence, fixed algorithms, versioned trust material, and a persisted evaluation instant.
12. Missing, stale, ambiguous, or unverifiable evidence fails closed.
13. Each admitted operation has exactly one tenant-scoped request ID and immutable attribution receipt.
14. Request idempotency is payload-aware: reusing an idempotency key with a different canonical input hash is rejected.
15. Raw credentials, bearer tokens, certificates, hardware evidence, and private claims never enter GraphQL arguments, logs, vectors, or audit payloads.
16. Semantic retrieval may locate a rotation or recovery runbook, but a retrieved instruction can never alter identity acceptance rules.

## 5. Request lifecycle

### 5.1 Register

A tenant administrator maps an external issuer and subject hash to a tenant-local workload principal. The mapping is explicit; the same issuer subject in two accounts produces two independent principals.

Public key bindings contain only thumbprints and key generations. Private keys remain in a workload identity system, KMS, HSM, or cloud provider.

### 5.2 Verify

The gateway validates proof of possession and sends canonical evidence to an isolated deterministic verifier. The verifier emits a signed result containing:

- evidence and claims hashes;
- issuer, subject, proof-key thumbprint, and artifact digest;
- trust-bundle and verifier-policy versions;
- credential and attestation expiries;
- evaluation instant and deterministic decision code.

The verifier result is data, not a database mutation. No network call occurs while a row-store transaction holds locks.

### 5.3 Open session

In one row-store transaction, mondayDB:

1. derives `account_id` from trusted context;
2. locks the tenant-local principal and current key binding;
3. rechecks principal, key, credential, policy, and trust-bundle epochs;
4. validates delegation and runtime decision hashes supplied by their owning planes;
5. consumes the client nonce and checks payload-aware idempotency;
6. persists the immutable attestation, short-lived session, and audit event.

If rotation wins the race between external verification and transaction commit, session creation retries against the new epoch or rejects.

### 5.4 Admit operation

The gateway proves possession for the session. The planner derives a canonical operation hash. Storage admission performs tenant-scoped point lookups for the session and principal epochs before dispatch.

For row mutations, the fence check, data mutation, attribution receipt, audit append, and outbox record commit atomically. Columnar and vector reads persist admission before dispatch and append a bounded result receipt after completion.

### 5.5 Revoke and rotate

Routine rotation activates a new key generation and may preserve a bounded overlap for availability. Emergency compromise increments `min_credential_epoch` or `min_session_epoch`, immediately fencing all older sessions without scanning them.

Closing millions of session rows is asynchronous hygiene; correctness comes from the epoch comparison, not bulk updates.

## 6. TypeScript contracts

The following interfaces are API and storage-neutral. All hashes are SHA-256 over canonical CBOR with a domain separator unless a field says otherwise.

```ts
export type UUID = string;
export type Instant = string;
export type Sha256 = string;

export type WorkloadPrincipalStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type KeyBindingStatus = "PENDING" | "ACTIVE" | "RETIRING" | "REVOKED";
export type SessionStatus = "ACTIVE" | "CLOSED" | "EXPIRED";
export type VerificationDecision =
  | "VERIFIED"
  | "INVALID_SIGNATURE"
  | "INVALID_PROOF"
  | "UNKNOWN_ISSUER"
  | "SUBJECT_MISMATCH"
  | "ARTIFACT_REJECTED"
  | "STALE_EVIDENCE"
  | "EPOCH_MISMATCH";

export interface AgentWorkloadIssuer {
  accountId: UUID;
  issuerId: UUID;
  issuerUriHash: Sha256;
  trustBundleVersion: string;
  verifierPolicyVersion: string;
  acceptedAlgorithms: readonly string[];
  maxEvidenceAgeMs: number;
  status: "ACTIVE" | "SUSPENDED";
  policyEpoch: bigint;
}

export interface AgentWorkloadPrincipal {
  accountId: UUID;
  principalId: UUID;
  issuerId: UUID;
  externalSubjectHash: Sha256;
  displayName: string;
  status: WorkloadPrincipalStatus;
  credentialEpoch: bigint;
  minSessionEpoch: bigint;
  policyEpoch: bigint;
  createdAt: Instant;
}

export interface AgentWorkloadKeyBinding {
  accountId: UUID;
  principalId: UUID;
  keyGeneration: bigint;
  proofKeyThumbprint: Sha256;
  status: KeyBindingStatus;
  validFrom: Instant;
  validUntil: Instant;
  revokedAt?: Instant;
}

export interface VerifiedAttestationResult {
  accountId: UUID;
  issuerId: UUID;
  externalSubjectHash: Sha256;
  proofKeyThumbprint: Sha256;
  artifactDigest: Sha256;
  evidenceHash: Sha256;
  claimsHash: Sha256;
  trustBundleVersion: string;
  verifierPolicyVersion: string;
  credentialEpoch: bigint;
  evaluatedAt: Instant;
  credentialExpiresAt: Instant;
  attestationExpiresAt: Instant;
  decision: VerificationDecision;
  verifierReceipt: string;
}

export interface OpenAgentWorkloadSessionCommand {
  runtimeContractId: UUID;
  runtimeContractHash: Sha256;
  runtimeContractExpiresAt: Instant;
  delegationEvaluationId: UUID;
  delegationEvaluationHash: Sha256;
  delegationExpiresAt: Instant;
  authorizationDecisionHash: Sha256;
  authorizationExpiresAt: Instant;
  clientNonce: string;
  idempotencyKey: string;
}

export interface AgentWorkloadSession {
  accountId: UUID;
  sessionId: UUID;
  principalId: UUID;
  workloadInstanceId: UUID;
  attestationId: UUID;
  keyGeneration: bigint;
  credentialEpoch: bigint;
  sessionEpoch: bigint;
  proofKeyThumbprint: Sha256;
  artifactDigest: Sha256;
  trustBundleVersion: string;
  verifierPolicyVersion: string;
  delegationEvaluationId: UUID;
  delegationEvaluationHash: Sha256;
  runtimeContractId: UUID;
  runtimeContractHash: Sha256;
  authorizationDecisionHash: Sha256;
  status: SessionStatus;
  openedAt: Instant;
  effectiveExpiresAt: Instant;
}

export type AgentOperationKind =
  | "ROW_READ"
  | "ROW_WRITE"
  | "COLUMNAR_QUERY"
  | "VECTOR_SEARCH"
  | "HYBRID_QUERY"
  | "TOOL_INTENT";

export interface AgentOperationAttribution {
  accountId: UUID;
  requestId: UUID;
  sessionId: UUID;
  principalId: UUID;
  workloadInstanceId: UUID;
  artifactDigest: Sha256;
  operationKind: AgentOperationKind;
  operationHash: Sha256;
  queryPlanHash: Sha256;
  delegationEvaluationHash: Sha256;
  runtimeContractHash: Sha256;
  authorizationDecisionHash: Sha256;
  sourceWatermarkHash?: Sha256;
  rowsExamined: bigint;
  vectorCandidatesExamined: bigint;
  toolIntentId?: UUID;
  auditEventId: UUID;
  previousReceiptHash: Sha256;
  receiptHash: Sha256;
  occurredAt: Instant;
}

export interface AgentWorkloadIdentityCard {
  principalId: UUID;
  workloadInstanceId: UUID;
  principalStatus: WorkloadPrincipalStatus;
  artifactDigest: Sha256;
  verifierPolicyVersion: string;
  sessionExpiresAt: Instant;
  proofOfPossessionBound: true;
  delegationEvaluationId: UUID;
  runtimeContractId: UUID;
  allowedOperationKinds: readonly AgentOperationKind[];
  operatorRunbookRefs: readonly UUID[];
  deterministicWarnings: readonly (
    | "KEY_ROTATION_DUE"
    | "ATTESTATION_EXPIRING"
    | "DELEGATION_EXPIRING"
    | "RUNTIME_CONTRACT_EXPIRING"
  )[];
}

export interface IdentityAdmissionBudgets {
  maxDelegationHops: number;
  maxEvidenceBytes: number;
  maxClaimsBytes: number;
  maxSessionLifetimeMs: number;
  maxGraphqlPageSize: number;
  maxAttributionRowsExamined: number;
}
```

The identity card is how an agent perceives its database identity. It exposes deterministic facts and warnings, not raw claims or a generated narrative. An LLM can explain the card, but it cannot change its status.

## 7. SQL schema

This reference schema uses PostgreSQL syntax for the authoritative row store. Production tables are hash partitioned by `account_id`; append-heavy receipt and audit partitions are additionally rolled by time.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE agent_workload_principal_status AS ENUM (
  'ACTIVE', 'SUSPENDED', 'REVOKED'
);
CREATE TYPE agent_workload_key_status AS ENUM (
  'PENDING', 'ACTIVE', 'RETIRING', 'REVOKED'
);
CREATE TYPE agent_workload_session_status AS ENUM (
  'ACTIVE', 'CLOSED', 'EXPIRED'
);
CREATE TYPE agent_operation_kind AS ENUM (
  'ROW_READ', 'ROW_WRITE', 'COLUMNAR_QUERY',
  'VECTOR_SEARCH', 'HYBRID_QUERY', 'TOOL_INTENT'
);

CREATE SCHEMA IF NOT EXISTS mondaydb;

CREATE FUNCTION mondaydb.current_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('mondaydb.account_id', true), '')::uuid
$$;

CREATE TABLE agent_workload_issuers (
  account_id uuid NOT NULL,
  issuer_id uuid NOT NULL,
  issuer_uri_hash bytea NOT NULL CHECK (octet_length(issuer_uri_hash) = 32),
  trust_bundle_version text NOT NULL,
  verifier_policy_version text NOT NULL,
  accepted_algorithms jsonb NOT NULL
    CHECK (jsonb_typeof(accepted_algorithms) = 'array'),
  max_evidence_age_ms integer NOT NULL CHECK (max_evidence_age_ms > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  policy_epoch bigint NOT NULL DEFAULT 1 CHECK (policy_epoch > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, issuer_id),
  UNIQUE (account_id, issuer_uri_hash)
);

CREATE TABLE agent_workload_principals (
  account_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  issuer_id uuid NOT NULL,
  external_subject_hash bytea NOT NULL
    CHECK (octet_length(external_subject_hash) = 32),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  status agent_workload_principal_status NOT NULL,
  credential_epoch bigint NOT NULL DEFAULT 1 CHECK (credential_epoch > 0),
  min_session_epoch bigint NOT NULL DEFAULT 1 CHECK (min_session_epoch > 0),
  policy_epoch bigint NOT NULL DEFAULT 1 CHECK (policy_epoch > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, principal_id),
  UNIQUE (account_id, issuer_id, external_subject_hash),
  FOREIGN KEY (account_id, issuer_id)
    REFERENCES agent_workload_issuers (account_id, issuer_id)
);

CREATE TABLE agent_workload_key_bindings (
  account_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  key_generation bigint NOT NULL CHECK (key_generation > 0),
  proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proof_key_thumbprint) = 32),
  status agent_workload_key_status NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, principal_id, key_generation),
  UNIQUE (account_id, principal_id, proof_key_thumbprint),
  FOREIGN KEY (account_id, principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id),
  CHECK (valid_until > valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= valid_from)
);

CREATE TABLE agent_workload_attestations (
  account_id uuid NOT NULL,
  attestation_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  key_generation bigint NOT NULL,
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  evidence_hash bytea NOT NULL CHECK (octet_length(evidence_hash) = 32),
  claims_hash bytea NOT NULL CHECK (octet_length(claims_hash) = 32),
  trust_bundle_version text NOT NULL,
  verifier_policy_version text NOT NULL,
  verifier_receipt_hash bytea NOT NULL
    CHECK (octet_length(verifier_receipt_hash) = 32),
  credential_epoch bigint NOT NULL CHECK (credential_epoch > 0),
  evaluated_at timestamptz NOT NULL,
  credential_expires_at timestamptz NOT NULL,
  attestation_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, attestation_id),
  UNIQUE (account_id, principal_id, evidence_hash, verifier_policy_version),
  FOREIGN KEY (account_id, principal_id, key_generation)
    REFERENCES agent_workload_key_bindings (
      account_id, principal_id, key_generation
    ),
  CHECK (credential_expires_at > evaluated_at),
  CHECK (attestation_expires_at > evaluated_at)
);

CREATE TABLE agent_workload_sessions (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  workload_instance_id uuid NOT NULL,
  attestation_id uuid NOT NULL,
  key_generation bigint NOT NULL,
  credential_epoch bigint NOT NULL CHECK (credential_epoch > 0),
  session_epoch bigint NOT NULL CHECK (session_epoch > 0),
  proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proof_key_thumbprint) = 32),
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  trust_bundle_version text NOT NULL,
  verifier_policy_version text NOT NULL,
  delegation_evaluation_id uuid NOT NULL,
  delegation_evaluation_hash bytea NOT NULL
    CHECK (octet_length(delegation_evaluation_hash) = 32),
  runtime_contract_id uuid NOT NULL,
  runtime_contract_hash bytea NOT NULL
    CHECK (octet_length(runtime_contract_hash) = 32),
  authorization_decision_hash bytea NOT NULL
    CHECK (octet_length(authorization_decision_hash) = 32),
  status agent_workload_session_status NOT NULL,
  opened_at timestamptz NOT NULL,
  effective_expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  session_hash bytea NOT NULL CHECK (octet_length(session_hash) = 32),
  PRIMARY KEY (account_id, session_id),
  FOREIGN KEY (account_id, principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id),
  FOREIGN KEY (account_id, attestation_id)
    REFERENCES agent_workload_attestations (account_id, attestation_id),
  FOREIGN KEY (account_id, principal_id, key_generation)
    REFERENCES agent_workload_key_bindings (
      account_id, principal_id, key_generation
    ),
  CHECK (effective_expires_at > opened_at),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

CREATE TABLE agent_workload_session_nonces (
  account_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
  idempotency_key_hash bytea NOT NULL
    CHECK (octet_length(idempotency_key_hash) = 32),
  input_hash bytea NOT NULL CHECK (octet_length(input_hash) = 32),
  session_id uuid NOT NULL,
  consumed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, principal_id, nonce_hash),
  UNIQUE (account_id, principal_id, idempotency_key_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_workload_sessions (account_id, session_id),
  CHECK (expires_at > consumed_at)
);

CREATE TABLE agent_workload_attribution_receipts (
  account_id uuid NOT NULL,
  request_id uuid NOT NULL,
  session_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  workload_instance_id uuid NOT NULL,
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  operation_kind agent_operation_kind NOT NULL,
  operation_hash bytea NOT NULL CHECK (octet_length(operation_hash) = 32),
  query_plan_hash bytea NOT NULL CHECK (octet_length(query_plan_hash) = 32),
  delegation_evaluation_hash bytea NOT NULL
    CHECK (octet_length(delegation_evaluation_hash) = 32),
  runtime_contract_hash bytea NOT NULL
    CHECK (octet_length(runtime_contract_hash) = 32),
  authorization_decision_hash bytea NOT NULL
    CHECK (octet_length(authorization_decision_hash) = 32),
  source_watermark_hash bytea
    CHECK (source_watermark_hash IS NULL OR octet_length(source_watermark_hash) = 32),
  rows_examined bigint NOT NULL DEFAULT 0 CHECK (rows_examined >= 0),
  vector_candidates_examined bigint NOT NULL DEFAULT 0
    CHECK (vector_candidates_examined >= 0),
  tool_intent_id uuid,
  audit_event_id uuid NOT NULL,
  previous_receipt_hash bytea NOT NULL
    CHECK (octet_length(previous_receipt_hash) = 32),
  receipt_hash bytea NOT NULL CHECK (octet_length(receipt_hash) = 32),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, receipt_hash),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_workload_sessions (account_id, session_id),
  FOREIGN KEY (account_id, principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id)
) PARTITION BY HASH (account_id);

CREATE TABLE agent_workload_audit_heads (
  account_id uuid NOT NULL,
  shard smallint NOT NULL CHECK (shard BETWEEN 0 AND 63),
  last_sequence bigint NOT NULL CHECK (last_sequence >= 0),
  last_event_hash bytea NOT NULL CHECK (octet_length(last_event_hash) = 32),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, shard)
);

CREATE TABLE agent_workload_audit_events (
  account_id uuid NOT NULL,
  shard smallint NOT NULL CHECK (shard BETWEEN 0 AND 63),
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_id uuid NOT NULL,
  event_kind text NOT NULL,
  principal_id uuid,
  session_id uuid,
  canonical_payload_hash bytea NOT NULL
    CHECK (octet_length(canonical_payload_hash) = 32),
  previous_event_hash bytea NOT NULL
    CHECK (octet_length(previous_event_hash) = 32),
  event_hash bytea NOT NULL CHECK (octet_length(event_hash) = 32),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, shard, sequence),
  UNIQUE (account_id, event_id),
  UNIQUE (account_id, shard, event_hash)
) PARTITION BY HASH (account_id);

CREATE INDEX agent_workload_keys_active_idx
  ON agent_workload_key_bindings (
    account_id, principal_id, status, key_generation DESC
  );
CREATE INDEX agent_workload_attestations_principal_idx
  ON agent_workload_attestations (
    account_id, principal_id, evaluated_at DESC, attestation_id
  );
CREATE INDEX agent_workload_sessions_principal_idx
  ON agent_workload_sessions (
    account_id, principal_id, opened_at DESC, session_id
  );
CREATE INDEX agent_workload_sessions_expiry_idx
  ON agent_workload_sessions (
    account_id, effective_expires_at, session_id
  ) WHERE status = 'ACTIVE';
CREATE INDEX agent_workload_receipts_principal_idx
  ON agent_workload_attribution_receipts (
    account_id, principal_id, occurred_at DESC, request_id
  );
CREATE INDEX agent_workload_receipts_session_idx
  ON agent_workload_attribution_receipts (
    account_id, session_id, occurred_at DESC, request_id
  );
CREATE INDEX agent_workload_audit_event_id_idx
  ON agent_workload_audit_events (account_id, event_id);

ALTER TABLE agent_workload_issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_issuers FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_issuers_tenant_policy
  ON agent_workload_issuers
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_principals FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_principals_tenant_policy
  ON agent_workload_principals
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_key_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_key_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_key_bindings_tenant_policy
  ON agent_workload_key_bindings
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_attestations FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_attestations_tenant_policy
  ON agent_workload_attestations
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_sessions_tenant_policy
  ON agent_workload_sessions
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_session_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_session_nonces FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_session_nonces_tenant_policy
  ON agent_workload_session_nonces
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_attribution_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_attribution_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_attribution_receipts_tenant_policy
  ON agent_workload_attribution_receipts
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_audit_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_audit_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_audit_heads_tenant_policy
  ON agent_workload_audit_heads
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_audit_events_tenant_policy
  ON agent_workload_audit_events
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());
```

The database role used by application resolvers must not be able to set arbitrary tenant context. A trusted transaction wrapper sets `mondaydb.account_id` after authenticating the request, and the application role cannot bypass RLS.

### Session fence used by every write path

```sql
CREATE FUNCTION mondaydb.assert_agent_workload_session(
  p_account_id uuid,
  p_session_id uuid,
  p_evaluated_at timestamptz
)
RETURNS TABLE (
  principal_id uuid,
  workload_instance_id uuid,
  artifact_digest bytea,
  delegation_evaluation_hash bytea,
  runtime_contract_hash bytea,
  authorization_decision_hash bytea
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_account_id IS DISTINCT FROM mondaydb.current_account_id() THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.principal_id,
    s.workload_instance_id,
    s.artifact_digest,
    s.delegation_evaluation_hash,
    s.runtime_contract_hash,
    s.authorization_decision_hash
  FROM agent_workload_sessions AS s
  JOIN agent_workload_principals AS p
    ON p.account_id = s.account_id
   AND p.principal_id = s.principal_id
  JOIN agent_workload_key_bindings AS k
    ON k.account_id = s.account_id
   AND k.principal_id = s.principal_id
   AND k.key_generation = s.key_generation
  WHERE s.account_id = p_account_id
    AND s.session_id = p_session_id
    AND s.status = 'ACTIVE'
    AND p.status = 'ACTIVE'
    AND k.status IN ('ACTIVE', 'RETIRING')
    AND s.credential_epoch = p.credential_epoch
    AND s.session_epoch >= p.min_session_epoch
    AND p_evaluated_at >= s.opened_at
    AND p_evaluated_at < s.effective_expires_at
    AND p_evaluated_at >= k.valid_from
    AND p_evaluated_at < k.valid_until;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent workload session rejected' USING ERRCODE = '28000';
  END IF;
END;
$$;
```

The caller passes a persisted transaction evaluation instant. Proof-of-possession validation occurs at ingress, and its request binding is propagated in authenticated internal metadata. Storage executors reject a different request ID or operation hash.

## 8. Open API GraphQL

Every feature is available through monday.com's Open API, but credentials and raw attestation documents are transported in authenticated HTTP/mTLS context and are not ordinary GraphQL values. This prevents operation logs, persisted queries, and variables from becoming credential stores.

```graphql
scalar DateTime
scalar BigInt

enum AgentWorkloadPrincipalStatus {
  ACTIVE
  SUSPENDED
  REVOKED
}

enum AgentWorkloadKeyStatus {
  PENDING
  ACTIVE
  RETIRING
  REVOKED
}

enum AgentWorkloadSessionStatus {
  ACTIVE
  CLOSED
  EXPIRED
}

enum AgentOperationKind {
  ROW_READ
  ROW_WRITE
  COLUMNAR_QUERY
  VECTOR_SEARCH
  HYBRID_QUERY
  TOOL_INTENT
}

type AgentWorkloadIdentity {
  id: ID!
  displayName: String!
  status: AgentWorkloadPrincipalStatus!
  credentialEpoch: BigInt!
  policyEpoch: BigInt!
  activeKeyGenerations: [BigInt!]!
}

type AgentWorkloadSession {
  id: ID!
  identity: AgentWorkloadIdentity!
  workloadInstanceId: ID!
  artifactDigest: String!
  verifierPolicyVersion: String!
  delegationEvaluationId: ID!
  runtimeContractId: ID!
  status: AgentWorkloadSessionStatus!
  openedAt: DateTime!
  effectiveExpiresAt: DateTime!
}

type AgentWorkloadIdentityCard {
  identityId: ID!
  workloadInstanceId: ID!
  principalStatus: AgentWorkloadPrincipalStatus!
  artifactDigest: String!
  verifierPolicyVersion: String!
  sessionExpiresAt: DateTime!
  proofOfPossessionBound: Boolean!
  delegationEvaluationId: ID!
  runtimeContractId: ID!
  allowedOperationKinds: [AgentOperationKind!]!
  operatorRunbookIds: [ID!]!
  deterministicWarnings: [String!]!
}

type AgentAttributionReceipt {
  requestId: ID!
  identityId: ID!
  sessionId: ID!
  workloadInstanceId: ID!
  artifactDigest: String!
  operationKind: AgentOperationKind!
  operationHash: String!
  queryPlanHash: String!
  rowsExamined: BigInt!
  vectorCandidatesExamined: BigInt!
  toolIntentId: ID
  auditEventId: ID!
  receiptHash: String!
  occurredAt: DateTime!
}

type AgentAttributionReceiptEdge {
  cursor: String!
  node: AgentAttributionReceipt!
}

type AgentAttributionReceiptConnection {
  edges: [AgentAttributionReceiptEdge!]!
  pageInfo: PageInfo!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

input OpenAgentWorkloadSessionInput {
  runtimeContractId: ID!
  runtimeContractHash: String!
  delegationEvaluationId: ID!
  delegationEvaluationHash: String!
  authorizationDecisionHash: String!
  clientNonce: String!
  idempotencyKey: String!
}

type OpenAgentWorkloadSessionPayload {
  session: AgentWorkloadSession!
  identityCard: AgentWorkloadIdentityCard!
  auditEventId: ID!
}

input CloseAgentWorkloadSessionInput {
  sessionId: ID!
  expectedSessionHash: String!
  idempotencyKey: String!
}

input RegisterAgentWorkloadIdentityInput {
  issuerId: ID!
  externalSubjectHash: String!
  displayName: String!
  initialProofKeyThumbprint: String!
  idempotencyKey: String!
}

input StageAgentWorkloadKeyInput {
  identityId: ID!
  proofKeyThumbprint: String!
  validFrom: DateTime!
  validUntil: DateTime!
  expectedCredentialEpoch: BigInt!
  idempotencyKey: String!
}

input ActivateAgentWorkloadKeyInput {
  identityId: ID!
  keyGeneration: BigInt!
  expectedCredentialEpoch: BigInt!
  idempotencyKey: String!
}

input RevokeAgentWorkloadSessionsInput {
  identityId: ID!
  expectedMinSessionEpoch: BigInt!
  reasonCode: String!
  idempotencyKey: String!
}

type AgentWorkloadKeyMutationPayload {
  identity: AgentWorkloadIdentity!
  keyGeneration: BigInt!
  keyStatus: AgentWorkloadKeyStatus!
  auditEventId: ID!
}

type AgentWorkloadRevocationReceipt {
  identityId: ID!
  previousMinSessionEpoch: BigInt!
  newMinSessionEpoch: BigInt!
  effectiveAt: DateTime!
  auditEventId: ID!
  receiptHash: String!
}

type Query {
  currentAgentWorkloadIdentity: AgentWorkloadIdentityCard!

  agentWorkloadSession(id: ID!): AgentWorkloadSession

  agentOperationAttribution(requestId: ID!): AgentAttributionReceipt

  agentAttributionReceipts(
    identityId: ID!
    first: Int! = 50
    after: String
  ): AgentAttributionReceiptConnection!
}

type Mutation {
  openAgentWorkloadSession(
    input: OpenAgentWorkloadSessionInput!
  ): OpenAgentWorkloadSessionPayload!

  closeAgentWorkloadSession(
    input: CloseAgentWorkloadSessionInput!
  ): AgentWorkloadSession!

  registerAgentWorkloadIdentity(
    input: RegisterAgentWorkloadIdentityInput!
  ): AgentWorkloadIdentity!

  stageAgentWorkloadKey(
    input: StageAgentWorkloadKeyInput!
  ): AgentWorkloadKeyMutationPayload!

  activateAgentWorkloadKey(
    input: ActivateAgentWorkloadKeyInput!
  ): AgentWorkloadKeyMutationPayload!

  revokeAgentWorkloadSessions(
    input: RevokeAgentWorkloadSessionsInput!
  ): AgentWorkloadRevocationReceipt!
}
```

Resolvers enforce:

- tenant identity from server context, with no public `accountId` argument;
- persisted operations for administrative mutations;
- `first <= 100`, signed keyset cursors, fixed indexed sort orders, and no offsets;
- exact hashes and expected epochs for compare-and-set mutation semantics;
- separate administrator authorization for issuer, principal, key, and revocation operations;
- payload-aware idempotency on every mutation;
- GraphQL depth, alias, and complexity limits before resolver execution.

## 9. Procedural memory and semantic retrieval

Identity is one area where “agent-ready” must not mean “AI decides.”

### Procedural memory

Versioned procedural memories may describe:

- routine key rotation;
- emergency credential revocation;
- issuer outage response;
- artifact rollback;
- attestation policy migration;
- attribution investigation.

Each identity card exposes only applicable runbook IDs. A procedure still requires deterministic applicability checks, plan verification, administrator capabilities, and governed actions. Its instructions cannot modify an issuer, key, epoch, or session directly.

### Semantic retrieval

Runbook summaries may be embedded and indexed in the existing procedure-memory HNSW segments:

```text
partition = hash(account_id)
filter    = account_id + procedure_kind + active_version + capability_scope
topK      = bounded by runtime contract
postcheck = exact account, policy, status, and applicability predicates
```

Principal names, external subjects, keys, certificates, claims, evidence, session tokens, and delegation chains are never embedded. HNSW cannot find or authenticate an identity. Exact point lookup is both safer and faster.

## 10. ACID and consistency model

### Row mutations

The following commit in one ACID transaction:

1. session and epoch revalidation;
2. target row mutation or transaction intent;
3. attribution receipt;
4. audit-chain append using compare-and-set shard head;
5. outbox record for asynchronous projections or external effects.

Serializable isolation is not required for every data mutation. The session/principal fence uses a row version or lock where revocation races matter, and the target operation retains its established mondayDB isolation level.

### Vector and columnar reads

These paths cannot share a transaction with decoupled compute:

1. persist admission and pinned identity/session hashes;
2. dispatch a bounded query with authenticated internal metadata;
3. require compute to echo request, account, session, and operation hashes;
4. persist completion counters and source watermarks;
5. flag missing completion receipts for reconciliation.

Admission is durable and deterministic even when compute fails. A completion receipt says what was observed; it does not pretend the distributed read was ACID.

### External tools

Tool execution is a saga:

- commit an identity-fenced tool intent and outbox row;
- deliver with a stable tenant-scoped idempotency key;
- verify the tool worker's own workload identity;
- record its signed receipt;
- compensate where a compensating action is defined.

“Exactly once external effect” is not a supported claim.

## 11. Auditability and replay

Each event uses canonical CBOR and a domain-separated hash:

```text
event_hash = SHA-256(
  "mondaydb.agent-workload-identity.event.v1" ||
  account_id ||
  shard ||
  sequence ||
  event_id ||
  event_kind ||
  canonical_payload_hash ||
  previous_event_hash
)
```

The transaction locks one `(account_id, shard)` audit head, verifies its expected sequence and hash, inserts the event, and advances the head. Periodic signed checkpoints make truncation or fork detection independent of the primary database.

Replay inputs include:

- trust-bundle and verifier-policy versions;
- evidence, claims, artifact, and verifier-receipt hashes;
- principal, key, credential, session, and policy epochs;
- explicit evaluation instant;
- delegation, runtime, authorization, operation, and query-plan hashes;
- deterministic decision code.

Raw secrets and sensitive attestation evidence are deliberately absent. Authorized incident tooling can fetch encrypted evidence from its dedicated vault by hash and retention policy.

## 12. Performance and 1M+ row safety

Identity admission must be independent of board size. A board with one million or one billion rows adds zero identity rows to the hot-path lookup.

| Operation | Required access path | Bound |
|---|---|---|
| Resolve external subject | `(account_id, issuer_id, external_subject_hash)` | One principal |
| Validate key | `(account_id, principal_id, key_generation)` | One key |
| Validate session | `(account_id, session_id)` plus principal PK | One session and principal |
| Find request receipt | `(account_id, request_id)` | One receipt |
| List principal receipts | `(account_id, principal_id, occurred_at DESC, request_id)` | `first <= 100` |
| Revoke all sessions | Increment principal epoch | One principal update |
| Expiry cleanup | `(account_id, effective_expires_at, session_id)` | Bounded maintenance batch |

### Queries rejected before execution

- missing `account_id` or use of an account supplied by an agent;
- arbitrary JSON claim filters;
- offset pagination;
- unbounded receipt or audit ranges;
- joins from identity tables into board rows without a verified point/range key;
- “list all sessions across accounts” in a tenant API;
- recursive delegation traversal above the configured hop limit;
- exact-vector fallback or semantic identity lookup;
- bulk session invalidation that scans sessions instead of advancing an epoch;
- GraphQL aliases that multiply identity or receipt reads past complexity limits.

Attribution and audit tables are account-hash partitioned and time-retained. Recent point reads stay in the row store; immutable older receipts move to columnar storage with signed checkpoints. Archive queries require explicit time bounds and a separate analytical budget.

## 13. Agentic guardrails

An admitted session inherits the intersection of all budgets:

```text
effective budget =
  tenant maximum
  ∩ principal policy
  ∩ delegation evaluation
  ∩ purpose envelope
  ∩ runtime contract
  ∩ query governor
  ∩ tool policy
```

Identity cannot increase a budget. It only binds the budget decisions to an authenticated workload.

Required hard limits include:

- delegation hops;
- evidence and claims bytes;
- proof attempts and nonce reuse;
- session lifetime and concurrent sessions per principal;
- GraphQL depth, aliases, page size, and receipt rows examined;
- row, vector-candidate, tool-call, recursion, and wall-clock budgets from the runtime contract;
- key generations in overlap;
- administrative key or revocation mutations per control-plane window.

Retry budgets decrease monotonically. Reopening a session does not reset query, workflow, or tool budgets because budget ledgers are bound to the delegation and runtime contract, not only the session ID.

## 14. Threat and failure analysis

| Failure | Deterministic response |
|---|---|
| Bearer token theft | Reject sessions lacking proof-of-possession binding |
| Stale worker after revocation | Epoch mismatch fences storage and outbox commit |
| Key rotation race | Compare expected epoch; reject or retry |
| Verifier outage | Existing sessions continue to persisted expiry; new sessions fail |
| Issuer compromise | Suspend tenant issuer and advance affected credential epochs |
| Build pipeline compromise | Valid attestation still does not imply safe code; policy may deny digest |
| Cross-tenant subject collision | Tenant-local principal key and FORCE RLS prevent reuse |
| Request replay | Nonce consumption and operation-bound proof reject replay |
| Receipt tampering | Hash chain and signed checkpoint expose mutation or truncation |
| Semantic poisoning | Vectors cannot enter the identity decision path |
| Retry storm | Admission and session limits plus payload-aware idempotency |
| Audit subsystem unavailable | Fail writes and tool intents closed |
| Session cache stale | Cache entry includes credential/session/policy epochs |
| Internal identity substitution | Each hop echoes and signs account, request, session, and operation hashes |

Attestation creates new operational risks: issuer-root compromise, clock skew, privacy leakage, and false confidence in signed software. The design minimizes those risks with short claims, hashes instead of raw evidence, explicit evaluation time, versioned trust material, and the rule that identity is necessary but never sufficient for authorization.

## 15. Rollout

### Phase 1: shadow attribution

- Verify evidence and produce receipts without changing admission.
- Compare supplied `agent_id` with verified principal.
- Measure verifier latency, false rejection causes, key rotation races, and missing internal propagation.
- Block all raw credential or evidence fields from logs and vectors.

### Phase 2: enforced writes and tools

- Require valid workload sessions for autonomous row mutations and tool intents.
- Commit session fence, intent, attribution, audit, and outbox atomically.
- Exercise emergency epoch revocation and verifier-outage behavior.

### Phase 3: all agentic reads

- Bind row, columnar, vector, and hybrid reads to session and operation hashes.
- Enforce bounded completion receipts and reconciliation.
- Reject unverified `agent_id` as authority everywhere.

### Phase 4: external Open API administration

- Expose principal registration, public-key rotation, revocation, session inspection, and attribution through persisted GraphQL operations.
- Keep private key material and raw evidence outside mondayDB.
- Publish tenant-visible signed audit checkpoints and retention controls.

## 16. Ship criteria

- No public mutation accepts `account_id`, private key material, bearer credentials, or raw attestation evidence.
- All identity tables, keys, foreign keys, indexes, caches, and audit shards are account-leading.
- FORCE RLS is enabled and tested with adversarial tenant contexts.
- Session creation is proof-of-possession, nonce, epoch, and payload-idempotency bound.
- Emergency revocation is a point update and fences stale writes and tool effects.
- Open API schema compiles and every connection is keyset-paginated and bounded.
- TypeScript contracts compile in strict mode.
- SQL parses and every hot path has an indexed tenant-scoped plan.
- HNSW is absent from authentication and authorization paths.
- Procedural memories are discoverable but cannot mutate identity state without governed authorization.
- Audit replay reproduces every acceptance or rejection from persisted hashes, versions, epochs, and evaluation time.
- Load tests show identity admission latency is independent of board row count.
- Failure tests cover verifier outage, audit outage, key rotation race, epoch revocation, stale cache, nonce replay, cross-tenant IDs, and internal context substitution.

The result is not “AI-powered authentication.” It is deterministic database attribution strong enough that probabilistic agents can safely operate on top of mondayDB.
