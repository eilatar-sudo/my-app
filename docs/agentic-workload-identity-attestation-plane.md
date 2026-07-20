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

The active-session admission SLI is the fraction of otherwise valid requests that complete the local identity fence within the platform latency budget; its availability objective is at least mondayDB's 99.99% service objective. Session opening has a separate SLI because it depends on external evidence. Regional verifier replicas, locally pinned trust bundles, and pre-warmed policy artifacts keep that path highly available without weakening fail-closed behavior. Error budgets are separate so an issuer outage cannot be hidden inside database availability.

## 4. Deterministic invariants

1. `account_id` comes from extension-protected backend context established by the authenticated proxy, never a custom GUC, GraphQL input, or agent claim.
2. Every primary key, foreign key, index, cache key, HNSW partition key, and audit shard begins with `account_id`.
3. A string-valued `agent_id` is metadata, not authority.
4. A principal remains stable across routine key rotation; key generations are subordinate records.
5. Sessions use one mandatory proof-of-possession profile: a server challenge bound into an attestation plus an mTLS- or DPoP-bound session token. Replayable bearer-only sessions are rejected.
6. A session pins the exact principal, issuer, key generation, artifact digest, trust and verifier epochs, delegation evaluation, access decision, purpose decision, and runtime contract.
7. Effective session expiry is the minimum of credential, attestation, delegation, runtime contract, and policy expiries.
8. Emergency revocation advances a monotonic tenant-local epoch. A stale session can never become valid again.
9. A retired key cannot open a session. An emergency-revoked key fences already open sessions.
10. Writes lock the account fence, issuer, principal, key, and session in a fixed order inside the transaction that commits the mutation, attribution, audit reference, and outbox entry. Revocation updates the same rows in the same order.
11. Verification uses canonical evidence, fixed algorithms, versioned trust material, and a persisted evaluation instant.
12. Missing, stale, ambiguous, or unverifiable evidence fails closed.
13. Each operation has one immutable admission record and at most one separately immutable completion record under a tenant-scoped request ID.
14. Request idempotency is payload-aware: reusing an idempotency key with a different canonical input hash is rejected.
15. Raw credentials, bearer tokens, certificates, hardware evidence, and private claims never enter GraphQL arguments, logs, vectors, or audit payloads.
16. Semantic retrieval may locate a rotation or recovery runbook, but a retrieved instruction can never alter identity acceptance rules.

## 5. Request lifecycle

### 5.1 Register

A tenant administrator first completes a dedicated enrollment challenge. The verifier creates a short-lived, single-use `enrollment_id` containing the issuer, a versioned tenant-keyed HMAC of its canonical subject, proposed proof key, artifact, administrator identity, and signed envelope reference. The GraphQL registration transaction consumes that enrollment while atomically creating the principal and initial key; it does not require a pre-existing principal or session challenge.

The raw subject and a plain guessable hash are not stored. The same issuer subject in two accounts produces two unlinkable principal bindings.

Public key bindings contain only thumbprints and key generations. Private keys remain in a workload identity system, KMS, HSM, or cloud provider.

### 5.2 Challenge and verify

mondayDB first issues a 256-bit random, single-use challenge with an audience and short expiry. The attestation statement binds that challenge, the tenant-specific audience, issuer subject, software artifact, and proof key. The mandatory request profile validates DPoP `jti`, `iat`, audience, method, URI, canonical GraphQL operation and variables hash, or the equivalent mTLS exporter binding. GraphQL batching is prohibited for session exchange; every later logical operation has its own proof and replay reservation.

The gateway sends bounded canonical evidence to an isolated deterministic verifier over a dedicated binary endpoint excluded from access logs, tracing, and APM capture. The verifier accepts only allowlisted asymmetric algorithms, key types, curves, critical headers, issuers, audiences, and attestation profiles. It emits a signed canonical decision envelope containing:

- schema/profile and verifier key IDs;
- audience, challenge, evidence, claims, and policy-artifact hashes;
- issuer subject HMAC, proof-key thumbprint, artifact digest, and verified instance measurement;
- trust-bundle and verifier-policy versions and monotonic epochs;
- credential and attestation expiries, evaluation instant, clock-leeway decision, and reason code.

mondayDB verifies the envelope signature and freshness locally, then independently resolves the tenant, principal, and current epochs. It stores accepted and rejected decision envelopes or durable encrypted content references for the configured evidence-retention period. The verifier result is data, not a database mutation, and no network call occurs while a row-store transaction holds locks.

### 5.3 Open session

In one row-store transaction, mondayDB:

1. derives `account_id` from extension-protected connection context;
2. locks the issuer, principal, and current key binding in that order;
3. rechecks status, artifact, key, credential, policy, verifier, and minimum trust epochs;
4. point-reads authoritative tenant-scoped delegation, access, purpose, and runtime decision IDs and derives their hashes and expiries server-side;
5. consumes the server-issued challenge and checks payload-aware idempotency;
6. persists the immutable verification decision, attestation, short-lived session, and central-audit event reference.

If rotation wins the race between external verification and transaction commit, session creation retries against the new epoch or rejects.

The response contains an out-of-band session credential with only `sid`, `aud`, `exp`, and a `cnf` proof-key thumbprint. Each DPoP request supplies a unique `jti` and `ath` token hash plus method, URI, and canonical operation/body hash. mondayDB atomically inserts the tenant/session-scoped replay reservation before admission and retains its HMAC tombstone through the maximum proof replay window.

Access, Purpose, Consent, and Runtime planes synchronously advance the principal or account aggregate authorization fence in the same authoritative row-store transaction that revokes a decision. The aggregate is deliberately coarse: it may force unrelated sessions to reopen, but it prevents stale authorization without adding four remote checks to every write.

### 5.4 Admit operation

The gateway proves possession for the session and atomically reserves the DPoP `jti` or mTLS exporter request binding. The planner derives a canonical operation hash. Storage admission creates an immutable operation-admission row containing the ingress proof receipt, query-governor scan-risk decision, session and decision hashes, audience, deadline, and query plan.

For row mutations, the locked fence, data mutation, admission, central-audit reference, and outbox record commit atomically. Columnar and vector reads persist admission before dispatch and insert a distinct bounded completion record afterward; neither record is updated in place.

### 5.5 Revoke and rotate

Routine rotation creates a single-use rotation authorization that binds old- and new-key verification IDs, the proposed thumbprint, expected credential epoch, validity, and approvers. Activation consumes its `rotation_id` atomically with the key state change. Recovery without old-key proof creates the same durable record through a distinct step-up or multi-party approval mode. It may preserve a bounded overlap for availability. Emergency compromise increments an account authorization, principal authorization, credential, minimum trust, or minimum session epoch, immediately fencing older sessions without scanning them.

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
  issuerUriHmac: Sha256;
  trustBundleVersion: string;
  trustBundleEpoch: bigint;
  minTrustBundleEpoch: bigint;
  verifierPolicyVersion: string;
  verifierPolicyEpoch: bigint;
  minVerifierPolicyEpoch: bigint;
  acceptedAlgorithms: readonly string[];
  maxEvidenceAgeMs: number;
  status: "ACTIVE" | "SUSPENDED";
  policyEpoch: bigint;
}

export interface AgentWorkloadPrincipal {
  accountId: UUID;
  principalId: UUID;
  issuerId: UUID;
  externalSubjectHmac: Sha256;
  displayName: string;
  status: WorkloadPrincipalStatus;
  credentialEpoch: bigint;
  minSessionEpoch: bigint;
  policyEpoch: bigint;
  authorizationFenceEpoch: bigint;
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

export interface AgentWorkloadChallenge {
  accountId: UUID;
  challengeId: UUID;
  principalId: UUID;
  challengeHash: Sha256;
  audience: string;
  issuedAt: Instant;
  expiresAt: Instant;
  consumedAt?: Instant;
}

export interface VerifiedAttestationDecision {
  accountId: UUID;
  verificationId: UUID;
  challengeId: UUID;
  verifierKeyId: string;
  verifierBuildId: string;
  profile: string;
  audience: string;
  challengeHash: Sha256;
  issuerId: UUID;
  externalSubjectHmac: Sha256;
  proofKeyThumbprint: Sha256;
  artifactDigest: Sha256;
  verifiedInstanceMeasurement: Sha256;
  evidenceHash: Sha256;
  claimsHash: Sha256;
  policyArtifactHash: Sha256;
  trustBundleVersion: string;
  trustBundleEpoch: bigint;
  verifierPolicyVersion: string;
  verifierPolicyEpoch: bigint;
  credentialEpoch: bigint;
  evaluatedAt: Instant;
  credentialExpiresAt: Instant;
  attestationExpiresAt: Instant;
  decision: VerificationDecision;
  reasonCode: string;
  signedEnvelopeHash: Sha256;
  encryptedEnvelopeRef: string;
}

export interface OpenAgentWorkloadSessionCommand {
  challengeId: UUID;
  verificationId: UUID;
  runtimeContractId: UUID;
  delegationEvaluationId: UUID;
  accessDecisionId: UUID;
  purposeDecisionId: UUID;
  idempotencyKey: string;
}

export interface AgentWorkloadSession {
  accountId: UUID;
  sessionId: UUID;
  principalId: UUID;
  verifiedInstanceMeasurement: Sha256;
  issuerId: UUID;
  attestationId: UUID;
  keyGeneration: bigint;
  credentialEpoch: bigint;
  sessionEpoch: bigint;
  issuerPolicyEpoch: bigint;
  principalPolicyEpoch: bigint;
  accountAuthorizationFenceEpoch: bigint;
  principalAuthorizationFenceEpoch: bigint;
  trustBundleEpoch: bigint;
  verifierPolicyEpoch: bigint;
  proofKeyThumbprint: Sha256;
  artifactDigest: Sha256;
  delegationEvaluationId: UUID;
  delegationEvaluationHash: Sha256;
  runtimeContractId: UUID;
  runtimeContractHash: Sha256;
  accessDecisionId: UUID;
  accessDecisionHash: Sha256;
  purposeDecisionId: UUID;
  purposeDecisionHash: Sha256;
  credentialExpiresAt: Instant;
  attestationExpiresAt: Instant;
  delegationExpiresAt: Instant;
  accessExpiresAt: Instant;
  purposeExpiresAt: Instant;
  runtimeExpiresAt: Instant;
  status: SessionStatus;
  openedAt: Instant;
  effectiveExpiresAt: Instant;
}

export interface AgentSessionCredentialClaims {
  sessionId: UUID;
  audience: string;
  expiresAt: Instant;
  confirmationKeyThumbprint: Sha256;
}

export interface AgentRequestProof {
  sessionId: UUID;
  jti: string;
  audience: string;
  issuedAt: Instant;
  httpMethod: string;
  canonicalUriHash: Sha256;
  canonicalBodyHash: Sha256;
  sessionTokenHash: Sha256;
}

export type AgentOperationKind =
  | "ROW_READ"
  | "ROW_WRITE"
  | "COLUMNAR_QUERY"
  | "VECTOR_SEARCH"
  | "HYBRID_QUERY"
  | "TOOL_INTENT";

export type ScanRiskWarning =
  | "NONE"
  | "ESTIMATED_ROWS_GE_1M"
  | "FULL_SCAN_REJECTED";

export interface AgentOperationAdmission {
  accountId: UUID;
  requestId: UUID;
  sessionId: UUID;
  principalId: UUID;
  verifiedInstanceMeasurement: Sha256;
  artifactDigest: Sha256;
  operationKind: AgentOperationKind;
  operationHash: Sha256;
  queryPlanHash: Sha256;
  delegationEvaluationHash: Sha256;
  runtimeContractHash: Sha256;
  accessDecisionHash: Sha256;
  purposeDecisionHash: Sha256;
  ingressProofReceiptHash: Sha256;
  scanRiskDecisionHash: Sha256;
  scanRiskWarning: ScanRiskWarning;
  estimatedRows: bigint;
  audience: string;
  deadlineAt: Instant;
  auditEventId: UUID;
  admissionHash: Sha256;
  admittedAt: Instant;
}

export interface AgentOperationCompletion {
  accountId: UUID;
  requestId: UUID;
  sourceWatermarkHash?: Sha256;
  rowsExamined: bigint;
  vectorCandidatesExamined: bigint;
  toolIntentId?: UUID;
  auditEventId: UUID;
  outcomeCode: string;
  completionHash: Sha256;
  completedAt: Instant;
}

export interface AgentWorkloadIdentityCard {
  principalId: UUID;
  verifiedInstanceMeasurement: Sha256;
  principalStatus: WorkloadPrincipalStatus;
  artifactDigest: Sha256;
  verifierPolicyVersion: string;
  sessionExpiresAt: Instant;
  proofOfPossessionBound: true;
  deterministicWarnings: readonly (
    | "KEY_ROTATION_DUE"
    | "ATTESTATION_EXPIRING"
    | "TRUST_BUNDLE_RETIRING"
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

The identity card is how an agent perceives its database identity. It exposes only deterministic identity facts and warnings, not permissions, runbook applicability, raw claims, or a generated narrative. The Runtime Contract plane may compose this card with authorization and budget cards into a separate admission card. An LLM can explain either card, but it cannot change their status.

## 7. SQL schema

This reference schema uses PostgreSQL syntax for the authoritative row store. Identity owns verification, session, admission, and completion records; the central Audit plane owns hash-chain heads and checkpoints. Append-heavy operation tables use account-hash partitioning only, preserving tenant-leading global uniqueness. Bounded account-local archival moves old immutable rows to columnar storage; time subpartitioning is deliberately avoided because it would weaken `(account_id, request_id)` uniqueness.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS mondaydb;

CREATE TYPE mondaydb.agent_workload_principal_status AS ENUM (
  'ACTIVE', 'SUSPENDED', 'REVOKED'
);
CREATE TYPE mondaydb.agent_workload_key_status AS ENUM (
  'PENDING', 'ACTIVE', 'RETIRING', 'REVOKED'
);
CREATE TYPE mondaydb.agent_workload_session_status AS ENUM (
  'ACTIVE', 'CLOSED', 'EXPIRED'
);
CREATE TYPE mondaydb.agent_operation_kind AS ENUM (
  'ROW_READ', 'ROW_WRITE', 'COLUMNAR_QUERY',
  'VECTOR_SEARCH', 'HYBRID_QUERY', 'TOOL_INTENT'
);
CREATE TYPE mondaydb.agent_verification_decision AS ENUM (
  'VERIFIED', 'INVALID_SIGNATURE', 'INVALID_PROOF', 'UNKNOWN_ISSUER',
  'SUBJECT_MISMATCH', 'ARTIFACT_REJECTED', 'STALE_EVIDENCE',
  'EPOCH_MISMATCH'
);

CREATE FUNCTION mondaydb.current_account_id()
RETURNS uuid
AS 'mondaydb_identity', 'verified_account_id'
LANGUAGE C
STABLE
PARALLEL RESTRICTED;

CREATE TABLE agent_workload_account_fences (
  account_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  authorization_fence_epoch bigint NOT NULL DEFAULT 1
    CHECK (authorization_fence_epoch > 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id)
);

CREATE TABLE agent_workload_issuers (
  account_id uuid NOT NULL,
  issuer_id uuid NOT NULL,
  issuer_uri_hmac bytea NOT NULL CHECK (octet_length(issuer_uri_hmac) = 32),
  trust_bundle_version text NOT NULL,
  trust_bundle_epoch bigint NOT NULL CHECK (trust_bundle_epoch > 0),
  min_trust_bundle_epoch bigint NOT NULL CHECK (min_trust_bundle_epoch > 0),
  verifier_policy_version text NOT NULL,
  verifier_policy_epoch bigint NOT NULL CHECK (verifier_policy_epoch > 0),
  min_verifier_policy_epoch bigint NOT NULL
    CHECK (min_verifier_policy_epoch > 0),
  accepted_algorithms jsonb NOT NULL
    CHECK (jsonb_typeof(accepted_algorithms) = 'array'),
  max_evidence_age_ms integer NOT NULL CHECK (max_evidence_age_ms > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  policy_epoch bigint NOT NULL DEFAULT 1 CHECK (policy_epoch > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, issuer_id),
  UNIQUE (account_id, issuer_uri_hmac),
  CHECK (min_trust_bundle_epoch <= trust_bundle_epoch),
  CHECK (min_verifier_policy_epoch <= verifier_policy_epoch)
);

CREATE TABLE agent_workload_principals (
  account_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  issuer_id uuid NOT NULL,
  external_subject_hmac bytea NOT NULL
    CHECK (octet_length(external_subject_hmac) = 32),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  status mondaydb.agent_workload_principal_status NOT NULL,
  credential_epoch bigint NOT NULL DEFAULT 1 CHECK (credential_epoch > 0),
  min_session_epoch bigint NOT NULL DEFAULT 1 CHECK (min_session_epoch > 0),
  policy_epoch bigint NOT NULL DEFAULT 1 CHECK (policy_epoch > 0),
  authorization_fence_epoch bigint NOT NULL DEFAULT 1
    CHECK (authorization_fence_epoch > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, principal_id),
  UNIQUE (account_id, principal_id, issuer_id),
  UNIQUE (account_id, issuer_id, external_subject_hmac),
  FOREIGN KEY (account_id, issuer_id)
    REFERENCES agent_workload_issuers (account_id, issuer_id)
);

CREATE TABLE agent_workload_key_bindings (
  account_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  key_generation bigint NOT NULL CHECK (key_generation > 0),
  rotation_id uuid,
  rotation_status text,
  rotation_expires_at timestamptz,
  proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proof_key_thumbprint) = 32),
  status mondaydb.agent_workload_key_status NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, principal_id, key_generation),
  UNIQUE (account_id, principal_id, proof_key_thumbprint),
  UNIQUE (
    account_id, principal_id, key_generation, proof_key_thumbprint
  ),
  FOREIGN KEY (account_id, principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id),
  CHECK (valid_until > valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  CHECK (
    (
      key_generation = 1
      AND
      rotation_id IS NULL
      AND rotation_status IS NULL
      AND rotation_expires_at IS NULL
    )
    OR (
      key_generation > 1
      AND
      rotation_id IS NOT NULL
      AND rotation_status = 'CONSUMED'
      AND rotation_expires_at IS NOT NULL
      AND created_at <= rotation_expires_at
    )
  )
);

CREATE TABLE agent_workload_challenges (
  account_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  challenge_hash bytea NOT NULL CHECK (octet_length(challenge_hash) = 32),
  audience text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  session_input_hash bytea
    CHECK (session_input_hash IS NULL OR octet_length(session_input_hash) = 32),
  idempotency_key_hmac bytea
    CHECK (
      idempotency_key_hmac IS NULL OR octet_length(idempotency_key_hmac) = 32
    ),
  PRIMARY KEY (account_id, challenge_id),
  UNIQUE (account_id, challenge_id, principal_id),
  UNIQUE (
    account_id, challenge_id, principal_id, challenge_hash, audience
  ),
  UNIQUE (account_id, principal_id, challenge_hash),
  UNIQUE (account_id, principal_id, idempotency_key_hmac),
  FOREIGN KEY (account_id, principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id),
  CHECK (expires_at > issued_at),
  CHECK (
    (consumed_at IS NULL AND session_input_hash IS NULL)
    OR
    (consumed_at IS NOT NULL AND session_input_hash IS NOT NULL)
  )
);

CREATE TABLE agent_workload_verification_decisions (
  account_id uuid NOT NULL,
  verification_id uuid NOT NULL,
  challenge_id uuid,
  resolved_issuer_id uuid,
  resolved_principal_id uuid,
  verifier_key_id text NOT NULL,
  verifier_build_id text NOT NULL,
  profile text NOT NULL,
  audience text NOT NULL,
  challenge_hash bytea NOT NULL CHECK (octet_length(challenge_hash) = 32),
  issuer_subject_hmac bytea
    CHECK (
      issuer_subject_hmac IS NULL OR octet_length(issuer_subject_hmac) = 32
    ),
  proof_key_thumbprint bytea
    CHECK (
      proof_key_thumbprint IS NULL OR octet_length(proof_key_thumbprint) = 32
    ),
  artifact_digest bytea
    CHECK (artifact_digest IS NULL OR octet_length(artifact_digest) = 32),
  verified_instance_measurement bytea
    CHECK (
      verified_instance_measurement IS NULL
      OR octet_length(verified_instance_measurement) = 32
    ),
  evidence_hash bytea NOT NULL CHECK (octet_length(evidence_hash) = 32),
  claims_hash bytea NOT NULL CHECK (octet_length(claims_hash) = 32),
  policy_artifact_hash bytea NOT NULL
    CHECK (octet_length(policy_artifact_hash) = 32),
  trust_bundle_version text NOT NULL,
  trust_bundle_epoch bigint NOT NULL CHECK (trust_bundle_epoch > 0),
  verifier_policy_version text NOT NULL,
  verifier_policy_epoch bigint NOT NULL CHECK (verifier_policy_epoch > 0),
  credential_epoch bigint,
  evaluated_at timestamptz NOT NULL,
  credential_expires_at timestamptz,
  attestation_expires_at timestamptz,
  decision mondaydb.agent_verification_decision NOT NULL,
  reason_code text NOT NULL,
  signed_envelope_hash bytea NOT NULL
    CHECK (octet_length(signed_envelope_hash) = 32),
  encrypted_envelope_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, verification_id),
  UNIQUE (account_id, signed_envelope_hash),
  UNIQUE (
    account_id, verification_id, decision,
    resolved_principal_id, proof_key_thumbprint
  ),
  UNIQUE (
    account_id, verification_id, decision, challenge_id,
    resolved_issuer_id, resolved_principal_id, challenge_hash, audience,
    proof_key_thumbprint, artifact_digest, verified_instance_measurement,
    evidence_hash, claims_hash, trust_bundle_version, trust_bundle_epoch,
    verifier_policy_version, verifier_policy_epoch, credential_epoch,
    credential_expires_at, attestation_expires_at
  ),
  FOREIGN KEY (
    account_id, challenge_id, resolved_principal_id, challenge_hash, audience
  )
    REFERENCES agent_workload_challenges (
      account_id, challenge_id, principal_id, challenge_hash, audience
    ),
  FOREIGN KEY (
    account_id, resolved_principal_id, resolved_issuer_id
  )
    REFERENCES agent_workload_principals (
      account_id, principal_id, issuer_id
    ),
  CHECK (
    decision <> 'VERIFIED'
    OR (
      challenge_id IS NOT NULL
      AND resolved_issuer_id IS NOT NULL
      AND resolved_principal_id IS NOT NULL
      AND proof_key_thumbprint IS NOT NULL
      AND artifact_digest IS NOT NULL
      AND verified_instance_measurement IS NOT NULL
      AND credential_epoch IS NOT NULL
      AND credential_expires_at > evaluated_at
      AND attestation_expires_at > evaluated_at
    )
  )
);

CREATE TABLE agent_workload_enrollments (
  account_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  issuer_id uuid NOT NULL,
  external_subject_hmac bytea NOT NULL
    CHECK (octet_length(external_subject_hmac) = 32),
  proposed_proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proposed_proof_key_thumbprint) = 32),
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  administrator_actor_id uuid NOT NULL,
  signed_envelope_hash bytea NOT NULL
    CHECK (octet_length(signed_envelope_hash) = 32),
  encrypted_envelope_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_principal_id uuid,
  consumed_at timestamptz,
  PRIMARY KEY (account_id, enrollment_id),
  UNIQUE (account_id, signed_envelope_hash),
  FOREIGN KEY (account_id, issuer_id)
    REFERENCES agent_workload_issuers (account_id, issuer_id),
  FOREIGN KEY (account_id, consumed_principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id),
  CHECK (expires_at > issued_at),
  CHECK (
    (status = 'CONSUMED' AND consumed_principal_id IS NOT NULL
      AND consumed_at IS NOT NULL)
    OR
    (status <> 'CONSUMED' AND consumed_principal_id IS NULL
      AND consumed_at IS NULL)
  )
);

CREATE TABLE agent_workload_rotation_authorizations (
  account_id uuid NOT NULL,
  rotation_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  old_key_generation bigint,
  old_key_verification_id uuid,
  old_key_verification_decision mondaydb.agent_verification_decision,
  old_proof_key_thumbprint bytea
    CHECK (
      old_proof_key_thumbprint IS NULL
      OR octet_length(old_proof_key_thumbprint) = 32
    ),
  new_key_verification_id uuid NOT NULL,
  new_key_verification_decision mondaydb.agent_verification_decision NOT NULL
    CHECK (new_key_verification_decision = 'VERIFIED'),
  proposed_proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proposed_proof_key_thumbprint) = 32),
  approval_mode text NOT NULL
    CHECK (approval_mode IN ('DUAL_PROOF', 'STEP_UP_RECOVERY', 'MULTI_PARTY')),
  expected_credential_epoch bigint NOT NULL
    CHECK (expected_credential_epoch > 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
  approved_by_actor_ids jsonb NOT NULL
    CHECK (jsonb_typeof(approved_by_actor_ids) = 'array'),
  recovery_approval_id uuid,
  recovery_approval_hash bytea
    CHECK (
      recovery_approval_hash IS NULL
      OR octet_length(recovery_approval_hash) = 32
    ),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_key_generation bigint,
  consumed_at timestamptz,
  PRIMARY KEY (account_id, rotation_id),
  UNIQUE (
    account_id, rotation_id, principal_id, proposed_proof_key_thumbprint
  ),
  UNIQUE (
    account_id, rotation_id, principal_id, proposed_proof_key_thumbprint,
    consumed_key_generation, status, expires_at
  ),
  FOREIGN KEY (account_id, principal_id)
    REFERENCES agent_workload_principals (account_id, principal_id),
  FOREIGN KEY (
    account_id, principal_id, old_key_generation, old_proof_key_thumbprint
  )
    REFERENCES agent_workload_key_bindings (
      account_id, principal_id, key_generation, proof_key_thumbprint
    ),
  FOREIGN KEY (
    account_id, old_key_verification_id, old_key_verification_decision,
    principal_id, old_proof_key_thumbprint
  )
    REFERENCES agent_workload_verification_decisions (
      account_id, verification_id, decision,
      resolved_principal_id, proof_key_thumbprint
    ),
  FOREIGN KEY (
    account_id, new_key_verification_id, new_key_verification_decision,
    principal_id, proposed_proof_key_thumbprint
  )
    REFERENCES agent_workload_verification_decisions (
      account_id, verification_id, decision,
      resolved_principal_id, proof_key_thumbprint
    ),
  CHECK (expires_at > issued_at),
  CHECK (
    (
      approval_mode = 'DUAL_PROOF'
      AND old_key_generation IS NOT NULL
      AND old_key_verification_id IS NOT NULL
      AND old_key_verification_decision = 'VERIFIED'
      AND old_proof_key_thumbprint IS NOT NULL
      AND recovery_approval_id IS NULL
      AND recovery_approval_hash IS NULL
    )
    OR (
      approval_mode IN ('STEP_UP_RECOVERY', 'MULTI_PARTY')
      AND old_key_generation IS NULL
      AND old_key_verification_id IS NULL
      AND old_key_verification_decision IS NULL
      AND old_proof_key_thumbprint IS NULL
      AND recovery_approval_id IS NOT NULL
      AND recovery_approval_hash IS NOT NULL
    )
  ),
  CHECK (
    (status = 'CONSUMED' AND consumed_key_generation IS NOT NULL
      AND consumed_at IS NOT NULL)
    OR
    (status <> 'CONSUMED' AND consumed_key_generation IS NULL
      AND consumed_at IS NULL)
  )
);

ALTER TABLE agent_workload_key_bindings
  ADD FOREIGN KEY (
    account_id, rotation_id, principal_id, proof_key_thumbprint,
    key_generation, rotation_status, rotation_expires_at
  )
  REFERENCES agent_workload_rotation_authorizations (
    account_id, rotation_id, principal_id, proposed_proof_key_thumbprint,
    consumed_key_generation, status, expires_at
  );

CREATE TABLE agent_workload_attestations (
  account_id uuid NOT NULL,
  attestation_id uuid NOT NULL,
  verification_id uuid NOT NULL,
  verification_decision mondaydb.agent_verification_decision NOT NULL
    CHECK (verification_decision = 'VERIFIED'),
  issuer_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  challenge_hash bytea NOT NULL CHECK (octet_length(challenge_hash) = 32),
  audience text NOT NULL,
  key_generation bigint NOT NULL,
  proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proof_key_thumbprint) = 32),
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  verified_instance_measurement bytea NOT NULL
    CHECK (octet_length(verified_instance_measurement) = 32),
  evidence_hash bytea NOT NULL CHECK (octet_length(evidence_hash) = 32),
  claims_hash bytea NOT NULL CHECK (octet_length(claims_hash) = 32),
  trust_bundle_version text NOT NULL,
  trust_bundle_epoch bigint NOT NULL CHECK (trust_bundle_epoch > 0),
  verifier_policy_version text NOT NULL,
  verifier_policy_epoch bigint NOT NULL CHECK (verifier_policy_epoch > 0),
  verifier_receipt_hash bytea NOT NULL
    CHECK (octet_length(verifier_receipt_hash) = 32),
  credential_epoch bigint NOT NULL CHECK (credential_epoch > 0),
  evaluated_at timestamptz NOT NULL,
  credential_expires_at timestamptz NOT NULL,
  attestation_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, attestation_id),
  UNIQUE (account_id, principal_id, evidence_hash, verifier_policy_version),
  UNIQUE (
    account_id, attestation_id, issuer_id, principal_id, challenge_id,
    key_generation,
    proof_key_thumbprint, artifact_digest, verified_instance_measurement,
    trust_bundle_epoch, verifier_policy_epoch, credential_epoch,
    credential_expires_at, attestation_expires_at
  ),
  FOREIGN KEY (
    account_id, verification_id, verification_decision, challenge_id,
    issuer_id, principal_id, challenge_hash, audience, proof_key_thumbprint,
    artifact_digest, verified_instance_measurement, evidence_hash, claims_hash,
    trust_bundle_version, trust_bundle_epoch, verifier_policy_version,
    verifier_policy_epoch, credential_epoch, credential_expires_at,
    attestation_expires_at
  )
    REFERENCES agent_workload_verification_decisions (
      account_id, verification_id, decision, challenge_id,
      resolved_issuer_id, resolved_principal_id, challenge_hash, audience,
      proof_key_thumbprint, artifact_digest, verified_instance_measurement,
      evidence_hash, claims_hash, trust_bundle_version, trust_bundle_epoch,
      verifier_policy_version, verifier_policy_epoch, credential_epoch,
      credential_expires_at, attestation_expires_at
    ),
  FOREIGN KEY (
    account_id, principal_id, key_generation, proof_key_thumbprint
  )
    REFERENCES agent_workload_key_bindings (
      account_id, principal_id, key_generation, proof_key_thumbprint
    ),
  CHECK (credential_expires_at > evaluated_at),
  CHECK (attestation_expires_at > evaluated_at)
);

CREATE TABLE agent_workload_sessions (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  issuer_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  verified_instance_measurement bytea NOT NULL
    CHECK (octet_length(verified_instance_measurement) = 32),
  attestation_id uuid NOT NULL,
  key_generation bigint NOT NULL,
  credential_epoch bigint NOT NULL CHECK (credential_epoch > 0),
  session_epoch bigint NOT NULL CHECK (session_epoch > 0),
  issuer_policy_epoch bigint NOT NULL CHECK (issuer_policy_epoch > 0),
  principal_policy_epoch bigint NOT NULL CHECK (principal_policy_epoch > 0),
  account_authorization_fence_epoch bigint NOT NULL CHECK (
    account_authorization_fence_epoch > 0
  ),
  principal_authorization_fence_epoch bigint NOT NULL CHECK (
    principal_authorization_fence_epoch > 0
  ),
  trust_bundle_epoch bigint NOT NULL CHECK (trust_bundle_epoch > 0),
  verifier_policy_epoch bigint NOT NULL CHECK (verifier_policy_epoch > 0),
  proof_key_thumbprint bytea NOT NULL
    CHECK (octet_length(proof_key_thumbprint) = 32),
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  delegation_evaluation_id uuid NOT NULL,
  delegation_evaluation_hash bytea NOT NULL
    CHECK (octet_length(delegation_evaluation_hash) = 32),
  runtime_contract_id uuid NOT NULL,
  runtime_contract_hash bytea NOT NULL
    CHECK (octet_length(runtime_contract_hash) = 32),
  access_decision_id uuid NOT NULL,
  access_decision_hash bytea NOT NULL
    CHECK (octet_length(access_decision_hash) = 32),
  purpose_decision_id uuid NOT NULL,
  purpose_decision_hash bytea NOT NULL
    CHECK (octet_length(purpose_decision_hash) = 32),
  credential_expires_at timestamptz NOT NULL,
  attestation_expires_at timestamptz NOT NULL,
  delegation_expires_at timestamptz NOT NULL,
  access_expires_at timestamptz NOT NULL,
  purpose_expires_at timestamptz NOT NULL,
  runtime_expires_at timestamptz NOT NULL,
  status mondaydb.agent_workload_session_status NOT NULL,
  opened_at timestamptz NOT NULL,
  effective_expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  session_hash bytea NOT NULL CHECK (octet_length(session_hash) = 32),
  PRIMARY KEY (account_id, session_id),
  UNIQUE (account_id, challenge_id),
  UNIQUE (
    account_id, session_id, principal_id, verified_instance_measurement,
    artifact_digest, delegation_evaluation_hash, runtime_contract_hash,
    access_decision_hash, purpose_decision_hash
  ),
  FOREIGN KEY (account_id, issuer_id)
    REFERENCES agent_workload_issuers (account_id, issuer_id),
  FOREIGN KEY (account_id, principal_id, issuer_id)
    REFERENCES agent_workload_principals (
      account_id, principal_id, issuer_id
    ),
  FOREIGN KEY (account_id, challenge_id, principal_id)
    REFERENCES agent_workload_challenges (
      account_id, challenge_id, principal_id
    ),
  FOREIGN KEY (
    account_id, attestation_id, issuer_id, principal_id, challenge_id,
    key_generation,
    proof_key_thumbprint, artifact_digest, verified_instance_measurement,
    trust_bundle_epoch, verifier_policy_epoch, credential_epoch,
    credential_expires_at, attestation_expires_at
  )
    REFERENCES agent_workload_attestations (
      account_id, attestation_id, issuer_id, principal_id, challenge_id,
      key_generation,
      proof_key_thumbprint, artifact_digest, verified_instance_measurement,
      trust_bundle_epoch, verifier_policy_epoch, credential_epoch,
      credential_expires_at, attestation_expires_at
    ),
  CHECK (effective_expires_at > opened_at),
  CHECK (
    effective_expires_at <= LEAST(
      credential_expires_at,
      attestation_expires_at,
      delegation_expires_at,
      access_expires_at,
      purpose_expires_at,
      runtime_expires_at
    )
  ),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

CREATE TABLE agent_workload_proof_replay_reservations (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  proof_jti_hmac bytea NOT NULL CHECK (octet_length(proof_jti_hmac) = 32),
  request_id uuid NOT NULL,
  canonical_body_hash bytea NOT NULL
    CHECK (octet_length(canonical_body_hash) = 32),
  exporter_binding_hash bytea
    CHECK (
      exporter_binding_hash IS NULL
      OR octet_length(exporter_binding_hash) = 32
    ),
  audience text NOT NULL,
  reserved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, session_id, proof_jti_hmac),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (account_id, session_id)
    REFERENCES agent_workload_sessions (account_id, session_id),
  CHECK (expires_at > reserved_at)
);

CREATE TABLE agent_workload_operation_admissions (
  account_id uuid NOT NULL,
  request_id uuid NOT NULL,
  session_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  verified_instance_measurement bytea NOT NULL
    CHECK (octet_length(verified_instance_measurement) = 32),
  artifact_digest bytea NOT NULL CHECK (octet_length(artifact_digest) = 32),
  operation_kind mondaydb.agent_operation_kind NOT NULL,
  operation_hash bytea NOT NULL CHECK (octet_length(operation_hash) = 32),
  query_plan_hash bytea NOT NULL CHECK (octet_length(query_plan_hash) = 32),
  delegation_evaluation_hash bytea NOT NULL
    CHECK (octet_length(delegation_evaluation_hash) = 32),
  runtime_contract_hash bytea NOT NULL
    CHECK (octet_length(runtime_contract_hash) = 32),
  access_decision_hash bytea NOT NULL
    CHECK (octet_length(access_decision_hash) = 32),
  purpose_decision_hash bytea NOT NULL
    CHECK (octet_length(purpose_decision_hash) = 32),
  ingress_proof_receipt_hash bytea NOT NULL
    CHECK (octet_length(ingress_proof_receipt_hash) = 32),
  scan_risk_decision_hash bytea NOT NULL
    CHECK (octet_length(scan_risk_decision_hash) = 32),
  scan_risk_warning text NOT NULL
    CHECK (
      scan_risk_warning IN (
        'NONE', 'ESTIMATED_ROWS_GE_1M', 'FULL_SCAN_REJECTED'
      )
    ),
  estimated_rows bigint NOT NULL CHECK (estimated_rows >= 0),
  audience text NOT NULL,
  deadline_at timestamptz NOT NULL,
  audit_event_id uuid NOT NULL,
  admission_hash bytea NOT NULL CHECK (octet_length(admission_hash) = 32),
  admitted_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, admission_hash),
  UNIQUE (account_id, request_id, session_id, principal_id),
  FOREIGN KEY (
    account_id, session_id, principal_id, verified_instance_measurement,
    artifact_digest, delegation_evaluation_hash, runtime_contract_hash,
    access_decision_hash, purpose_decision_hash
  )
    REFERENCES agent_workload_sessions (
      account_id, session_id, principal_id, verified_instance_measurement,
      artifact_digest, delegation_evaluation_hash, runtime_contract_hash,
      access_decision_hash, purpose_decision_hash
    ),
  CHECK (deadline_at > admitted_at)
) PARTITION BY HASH (account_id);

CREATE TABLE agent_workload_operation_completions (
  account_id uuid NOT NULL,
  request_id uuid NOT NULL,
  source_watermark_hash bytea
    CHECK (
      source_watermark_hash IS NULL
      OR octet_length(source_watermark_hash) = 32
    ),
  rows_examined bigint NOT NULL CHECK (rows_examined >= 0),
  vector_candidates_examined bigint NOT NULL
    CHECK (vector_candidates_examined >= 0),
  tool_intent_id uuid,
  outcome_code text NOT NULL,
  audit_event_id uuid NOT NULL,
  completion_hash bytea NOT NULL CHECK (octet_length(completion_hash) = 32),
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, completion_hash),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_workload_operation_admissions (account_id, request_id)
) PARTITION BY HASH (account_id);

CREATE TABLE agent_workload_operation_release_claims (
  account_id uuid NOT NULL,
  request_id uuid NOT NULL,
  session_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  claim_kind text NOT NULL
    CHECK (claim_kind IN ('RESULT_RELEASE', 'TOOL_DELIVERY')),
  account_authorization_fence_epoch bigint NOT NULL,
  principal_authorization_fence_epoch bigint NOT NULL,
  credential_epoch bigint NOT NULL,
  session_epoch bigint NOT NULL,
  trust_bundle_epoch bigint NOT NULL,
  verifier_policy_epoch bigint NOT NULL,
  claimed_at timestamptz NOT NULL,
  audit_event_id uuid NOT NULL,
  claim_hash bytea NOT NULL CHECK (octet_length(claim_hash) = 32),
  PRIMARY KEY (account_id, request_id, claim_kind),
  UNIQUE (account_id, claim_hash),
  FOREIGN KEY (account_id, request_id)
    REFERENCES agent_workload_operation_admissions (account_id, request_id),
  FOREIGN KEY (account_id, request_id, session_id, principal_id)
    REFERENCES agent_workload_operation_admissions (
      account_id, request_id, session_id, principal_id
    )
);

CREATE TABLE agent_workload_operation_archive_locators (
  account_id uuid NOT NULL,
  request_id uuid NOT NULL,
  storage_tier text NOT NULL CHECK (storage_tier IN ('HOT', 'COLUMNAR')),
  archive_bucket integer,
  archive_object_key_hash bytea
    CHECK (
      archive_object_key_hash IS NULL
      OR octet_length(archive_object_key_hash) = 32
    ),
  archive_checksum bytea
    CHECK (archive_checksum IS NULL OR octet_length(archive_checksum) = 32),
  admission_hash bytea NOT NULL CHECK (octet_length(admission_hash) = 32),
  completion_hash bytea
    CHECK (completion_hash IS NULL OR octet_length(completion_hash) = 32),
  central_audit_checkpoint_id uuid,
  state text NOT NULL
    CHECK (state IN ('HOT', 'COPYING', 'VERIFIED', 'ARCHIVED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  operation_terminal_at timestamptz,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, request_id),
  CHECK (
    storage_tier = 'HOT'
    OR (
      archive_bucket IS NOT NULL
      AND archive_object_key_hash IS NOT NULL
      AND archive_checksum IS NOT NULL
      AND central_audit_checkpoint_id IS NOT NULL
    )
  ),
  CHECK (
    state = 'HOT'
    OR operation_terminal_at IS NOT NULL
  )
) PARTITION BY HASH (account_id);

CREATE TABLE awo_admission_p00 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE awo_admission_p01 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE awo_admission_p02 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE awo_admission_p03 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE awo_admission_p04 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE awo_admission_p05 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE awo_admission_p06 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE awo_admission_p07 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE awo_admission_p08 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE awo_admission_p09 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE awo_admission_p10 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE awo_admission_p11 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE awo_admission_p12 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE awo_admission_p13 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE awo_admission_p14 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE awo_admission_p15 PARTITION OF agent_workload_operation_admissions
  FOR VALUES WITH (MODULUS 16, REMAINDER 15);

CREATE TABLE awo_completion_p00 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE awo_completion_p01 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE awo_completion_p02 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE awo_completion_p03 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE awo_completion_p04 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE awo_completion_p05 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE awo_completion_p06 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE awo_completion_p07 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE awo_completion_p08 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE awo_completion_p09 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE awo_completion_p10 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE awo_completion_p11 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE awo_completion_p12 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE awo_completion_p13 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE awo_completion_p14 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE awo_completion_p15 PARTITION OF agent_workload_operation_completions
  FOR VALUES WITH (MODULUS 16, REMAINDER 15);

CREATE TABLE awo_locator_p00 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE awo_locator_p01 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE awo_locator_p02 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE awo_locator_p03 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE awo_locator_p04 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE awo_locator_p05 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE awo_locator_p06 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE awo_locator_p07 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE awo_locator_p08 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE awo_locator_p09 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE awo_locator_p10 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE awo_locator_p11 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE awo_locator_p12 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE awo_locator_p13 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE awo_locator_p14 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE awo_locator_p15 PARTITION OF agent_workload_operation_archive_locators
  FOR VALUES WITH (MODULUS 16, REMAINDER 15);

CREATE INDEX agent_workload_keys_active_idx
  ON agent_workload_key_bindings (
    account_id, principal_id, status, key_generation DESC
  );
CREATE INDEX agent_workload_keys_rotation_fk_idx
  ON agent_workload_key_bindings (
    account_id, rotation_id, principal_id
  );
CREATE INDEX agent_workload_attestations_principal_idx
  ON agent_workload_attestations (
    account_id, principal_id, evaluated_at DESC, attestation_id
  );
CREATE INDEX agent_workload_attestations_verification_fk_idx
  ON agent_workload_attestations (
    account_id, verification_id
  );
CREATE INDEX agent_workload_attestations_key_fk_idx
  ON agent_workload_attestations (
    account_id, principal_id, key_generation, proof_key_thumbprint
  );
CREATE INDEX agent_workload_sessions_principal_idx
  ON agent_workload_sessions (
    account_id, principal_id, opened_at DESC, session_id
  );
CREATE INDEX agent_workload_sessions_expiry_idx
  ON agent_workload_sessions (
    account_id, effective_expires_at, session_id
  ) WHERE status = 'ACTIVE';
CREATE INDEX agent_workload_sessions_attestation_fk_idx
  ON agent_workload_sessions (
    account_id, attestation_id
  );
CREATE INDEX agent_workload_sessions_issuer_fk_idx
  ON agent_workload_sessions (
    account_id, issuer_id, session_id
  );
CREATE INDEX agent_workload_challenges_expiry_idx
  ON agent_workload_challenges (
    account_id, expires_at, challenge_id
  );
CREATE INDEX agent_workload_verifications_principal_idx
  ON agent_workload_verification_decisions (
    account_id, resolved_principal_id, evaluated_at DESC, verification_id
  );
CREATE INDEX agent_workload_verifications_challenge_fk_idx
  ON agent_workload_verification_decisions (
    account_id, challenge_id, verification_id
  );
CREATE INDEX agent_workload_enrollments_expiry_idx
  ON agent_workload_enrollments (
    account_id, expires_at, enrollment_id
  );
CREATE INDEX agent_workload_enrollments_issuer_fk_idx
  ON agent_workload_enrollments (
    account_id, issuer_id, enrollment_id
  );
CREATE INDEX agent_workload_enrollments_principal_fk_idx
  ON agent_workload_enrollments (
    account_id, consumed_principal_id, enrollment_id
  );
CREATE INDEX agent_workload_rotations_expiry_idx
  ON agent_workload_rotation_authorizations (
    account_id, expires_at, rotation_id
  );
CREATE INDEX agent_workload_rotations_old_verification_fk_idx
  ON agent_workload_rotation_authorizations (
    account_id, old_key_verification_id, rotation_id
  );
CREATE INDEX agent_workload_rotations_new_verification_fk_idx
  ON agent_workload_rotation_authorizations (
    account_id, new_key_verification_id, rotation_id
  );
CREATE INDEX agent_workload_rotations_principal_fk_idx
  ON agent_workload_rotation_authorizations (
    account_id, principal_id, rotation_id
  );
CREATE INDEX agent_workload_rotations_old_key_fk_idx
  ON agent_workload_rotation_authorizations (
    account_id, principal_id, old_key_generation, old_proof_key_thumbprint
  );
CREATE INDEX agent_workload_replay_expiry_idx
  ON agent_workload_proof_replay_reservations (
    account_id, expires_at, session_id, proof_jti_hmac
  );
CREATE INDEX agent_workload_admissions_principal_idx
  ON agent_workload_operation_admissions (
    account_id, principal_id, admitted_at DESC, request_id
  );
CREATE INDEX agent_workload_admissions_session_idx
  ON agent_workload_operation_admissions (
    account_id, session_id, admitted_at DESC, request_id
  );
CREATE INDEX agent_workload_completions_time_idx
  ON agent_workload_operation_completions (
    account_id, completed_at DESC, request_id
  );
CREATE INDEX agent_workload_archive_state_idx
  ON agent_workload_operation_archive_locators (
    account_id, state, updated_at, request_id
  );

ALTER TABLE agent_workload_account_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_account_fences FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_account_fences_tenant_policy
  ON agent_workload_account_fences
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

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

ALTER TABLE agent_workload_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_challenges_tenant_policy
  ON agent_workload_challenges
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_verification_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_verification_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_verification_decisions_tenant_policy
  ON agent_workload_verification_decisions
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_enrollments_tenant_policy
  ON agent_workload_enrollments
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_rotation_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_rotation_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_rotation_authorizations_tenant_policy
  ON agent_workload_rotation_authorizations
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

ALTER TABLE agent_workload_proof_replay_reservations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_proof_replay_reservations
  FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_proof_replay_reservations_tenant_policy
  ON agent_workload_proof_replay_reservations
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_operation_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_operation_admissions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_operation_admissions_tenant_policy
  ON agent_workload_operation_admissions
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_operation_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_operation_completions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_operation_completions_tenant_policy
  ON agent_workload_operation_completions
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_operation_release_claims
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_operation_release_claims
  FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_operation_release_claims_tenant_policy
  ON agent_workload_operation_release_claims
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());

ALTER TABLE agent_workload_operation_archive_locators
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workload_operation_archive_locators
  FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_workload_operation_archive_locators_tenant_policy
  ON agent_workload_operation_archive_locators
  USING (account_id = mondaydb.current_account_id())
  WITH CHECK (account_id = mondaydb.current_account_id());
```

`mondaydb.current_account_id()` is supplied by a trusted extension that reads backend-private authenticated proxy state; it cannot be changed with `SET` or `SET LOCAL`. Application roles have no direct table or child-partition grants, do not own these objects, and never receive `BYPASSRLS`. Fixed-`search_path` privileged routines are the only mutation surface. RLS is defense in depth, and adversarial tests explicitly attempt custom-GUC spoofing and direct child-partition access.

### Session fence used by every write path

```sql
CREATE FUNCTION mondaydb.assert_agent_workload_session(
  p_account_id uuid,
  p_session_id uuid
)
RETURNS TABLE (
  principal_id uuid,
  verified_instance_measurement bytea,
  artifact_digest bytea,
  delegation_evaluation_hash bytea,
  runtime_contract_hash bytea,
  access_decision_hash bytea,
  purpose_decision_hash bytea,
  evaluated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_issuer_id uuid;
  v_principal_id uuid;
  v_key_generation bigint;
  v_evaluated_at timestamptz;
BEGIN
  IF p_account_id IS DISTINCT FROM mondaydb.current_account_id() THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT s.issuer_id, s.principal_id, s.key_generation
    INTO v_issuer_id, v_principal_id, v_key_generation
  FROM public.agent_workload_sessions AS s
  WHERE s.account_id = p_account_id
    AND s.session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent workload session rejected' USING ERRCODE = '28000';
  END IF;

  -- Revocation uses the same account → issuer → principal → key → session order.
  PERFORM 1
  FROM public.agent_workload_account_fences AS a
  WHERE a.account_id = p_account_id
  FOR SHARE;

  PERFORM 1
  FROM public.agent_workload_issuers AS i
  WHERE i.account_id = p_account_id
    AND i.issuer_id = v_issuer_id
  FOR SHARE;

  PERFORM 1
  FROM public.agent_workload_principals AS p
  WHERE p.account_id = p_account_id
    AND p.principal_id = v_principal_id
  FOR SHARE;

  PERFORM 1
  FROM public.agent_workload_key_bindings AS k
  WHERE k.account_id = p_account_id
    AND k.principal_id = v_principal_id
    AND k.key_generation = v_key_generation
  FOR SHARE;

  PERFORM 1
  FROM public.agent_workload_sessions AS s
  WHERE s.account_id = p_account_id
    AND s.session_id = p_session_id
  FOR SHARE;

  -- Capture time after lock waits so an expired session cannot be revived.
  v_evaluated_at := clock_timestamp();

  RETURN QUERY
  SELECT
    s.principal_id,
    s.verified_instance_measurement,
    s.artifact_digest,
    s.delegation_evaluation_hash,
    s.runtime_contract_hash,
    s.access_decision_hash,
    s.purpose_decision_hash,
    v_evaluated_at
  FROM public.agent_workload_sessions AS s
  JOIN public.agent_workload_account_fences AS a
    ON a.account_id = s.account_id
  JOIN public.agent_workload_issuers AS i
    ON i.account_id = s.account_id
   AND i.issuer_id = s.issuer_id
  JOIN public.agent_workload_principals AS p
    ON p.account_id = s.account_id
   AND p.principal_id = s.principal_id
  JOIN public.agent_workload_key_bindings AS k
    ON k.account_id = s.account_id
   AND k.principal_id = s.principal_id
   AND k.key_generation = s.key_generation
  WHERE s.account_id = p_account_id
    AND s.session_id = p_session_id
    AND s.status = 'ACTIVE'
    AND a.status = 'ACTIVE'
    AND i.status = 'ACTIVE'
    AND p.status = 'ACTIVE'
    AND k.status IN ('ACTIVE', 'RETIRING')
    AND s.issuer_policy_epoch = i.policy_epoch
    AND s.principal_policy_epoch = p.policy_epoch
    AND s.account_authorization_fence_epoch = a.authorization_fence_epoch
    AND s.principal_authorization_fence_epoch = p.authorization_fence_epoch
    AND s.trust_bundle_epoch >= i.min_trust_bundle_epoch
    AND s.trust_bundle_epoch <= i.trust_bundle_epoch
    AND s.verifier_policy_epoch >= i.min_verifier_policy_epoch
    AND s.verifier_policy_epoch <= i.verifier_policy_epoch
    AND s.credential_epoch = p.credential_epoch
    AND s.session_epoch >= p.min_session_epoch
    AND v_evaluated_at >= s.opened_at
    AND v_evaluated_at < s.effective_expires_at
    AND v_evaluated_at >= k.valid_from
    AND v_evaluated_at < k.valid_until;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent workload session rejected' USING ERRCODE = '28000';
  END IF;
END;
$$;
```

The function derives the evaluation instant from the database and returns it for the immutable admission record. Its shared locks linearize the protected write before or after a revocation that updates the same rows. Transactions have a strict duration cap; tool workers re-run the fence immediately before claim and delivery. Proof-of-possession validation occurs at ingress, and a short-lived signed hop envelope binds account, request, session, audience, deadline, upstream service identity, and operation hash. Storage executors match that envelope to the operation-admission row before releasing data or committing effects.

## 8. Open API GraphQL

Every lifecycle feature is available through monday.com's Open API. Bounded raw attestation and enrollment exchange uses a dedicated binary endpoint with mTLS, envelope encryption, and mandatory log/tracing suppression; GraphQL receives only a non-secret, administrator- and proof-bound `verificationId`, `enrollmentId`, or `rotationId`. Credentials, subject-binding tokens, and evidence are never ordinary GraphQL values, so persisted operations and variables cannot become credential stores.

```graphql
scalar DateTime
scalar BigInt
scalar Hash256
scalar OpaqueToken

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
}

type AgentWorkloadSession {
  id: ID!
  identity: AgentWorkloadIdentity!
  verifiedInstanceMeasurement: Hash256!
  artifactDigest: Hash256!
  verifierPolicyVersion: String!
  delegationEvaluationId: ID!
  runtimeContractId: ID!
  status: AgentWorkloadSessionStatus!
  openedAt: DateTime!
  effectiveExpiresAt: DateTime!
}

type AgentWorkloadIdentityCard {
  identityId: ID!
  verifiedInstanceMeasurement: Hash256!
  principalStatus: AgentWorkloadPrincipalStatus!
  artifactDigest: Hash256!
  verifierPolicyVersion: String!
  sessionExpiresAt: DateTime!
  proofOfPossessionBound: Boolean!
  deterministicWarnings: [String!]!
}

type AgentOperationAdmission {
  requestId: ID!
  identityId: ID!
  sessionId: ID!
  verifiedInstanceMeasurement: Hash256!
  artifactDigest: Hash256!
  operationKind: AgentOperationKind!
  operationHash: Hash256!
  queryPlanHash: Hash256!
  scanRiskWarning: String!
  estimatedRows: BigInt!
  auditEventId: ID!
  admissionHash: Hash256!
  admittedAt: DateTime!
}

type AgentOperationCompletion {
  rowsExamined: BigInt!
  vectorCandidatesExamined: BigInt!
  toolIntentId: ID
  outcomeCode: String!
  auditEventId: ID!
  completionHash: Hash256!
  completedAt: DateTime!
}

type AgentAttributionReceipt {
  admission: AgentOperationAdmission!
  completion: AgentOperationCompletion
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
  challengeId: ID!
  verificationId: ID!
  runtimeContractId: ID!
  delegationEvaluationId: ID!
  accessDecisionId: ID!
  purposeDecisionId: ID!
  idempotencyKey: String!
}

type AgentWorkloadChallenge {
  id: ID!
  audience: String!
  challenge: OpaqueToken!
  expiresAt: DateTime!
}

input IssueAgentWorkloadChallengeInput {
  identityId: ID!
  audience: String!
  idempotencyKey: String!
}

type OpenAgentWorkloadSessionPayload {
  session: AgentWorkloadSession!
  identityCard: AgentWorkloadIdentityCard!
  auditEventId: ID!
}

input CloseAgentWorkloadSessionInput {
  sessionId: ID!
  expectedSessionHash: Hash256!
  idempotencyKey: String!
}

input RegisterAgentWorkloadIdentityInput {
  enrollmentId: ID!
  displayName: String!
  idempotencyKey: String!
}

input StageAgentWorkloadKeyInput {
  identityId: ID!
  rotationId: ID!
  validFrom: DateTime!
  validUntil: DateTime!
  expectedCredentialEpoch: BigInt!
  idempotencyKey: String!
}

input ActivateAgentWorkloadKeyInput {
  identityId: ID!
  rotationId: ID!
  keyGeneration: BigInt!
  expectedCredentialEpoch: BigInt!
  idempotencyKey: String!
}

input AuthorizeAgentWorkloadRotationInput {
  identityId: ID!
  oldKeyVerificationId: ID!
  newKeyVerificationId: ID!
  expectedCredentialEpoch: BigInt!
  idempotencyKey: String!
}

input AuthorizeAgentWorkloadRecoveryInput {
  identityId: ID!
  newKeyVerificationId: ID!
  recoveryApprovalId: ID!
  expectedCredentialEpoch: BigInt!
  idempotencyKey: String!
}

type AgentWorkloadRotationAuthorization {
  id: ID!
  identityId: ID!
  approvalMode: String!
  expiresAt: DateTime!
}

input RevokeAgentWorkloadSessionsInput {
  identityId: ID!
  expectedMinSessionEpoch: BigInt!
  reasonCode: String!
  idempotencyKey: String!
}

input RevokeAgentWorkloadKeyInput {
  identityId: ID!
  keyGeneration: BigInt!
  expectedCredentialEpoch: BigInt!
  reasonCode: String!
  idempotencyKey: String!
}

input SuspendAgentWorkloadIdentityInput {
  identityId: ID!
  expectedPolicyEpoch: BigInt!
  reasonCode: String!
  idempotencyKey: String!
}

input SuspendAgentWorkloadIssuerInput {
  issuerId: ID!
  expectedPolicyEpoch: BigInt!
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
  receiptHash: Hash256!
}

type AgentWorkloadControlMutationPayload {
  objectId: ID!
  objectKind: String!
  newPolicyEpoch: BigInt!
  effectiveAt: DateTime!
  auditEventId: ID!
  receiptHash: Hash256!
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
  issueAgentWorkloadChallenge(
    input: IssueAgentWorkloadChallengeInput!
  ): AgentWorkloadChallenge!

  openAgentWorkloadSession(
    input: OpenAgentWorkloadSessionInput!
  ): OpenAgentWorkloadSessionPayload!

  closeAgentWorkloadSession(
    input: CloseAgentWorkloadSessionInput!
  ): AgentWorkloadSession!

  registerAgentWorkloadIdentity(
    input: RegisterAgentWorkloadIdentityInput!
  ): AgentWorkloadIdentity!

  authorizeAgentWorkloadRotation(
    input: AuthorizeAgentWorkloadRotationInput!
  ): AgentWorkloadRotationAuthorization!

  authorizeAgentWorkloadRecovery(
    input: AuthorizeAgentWorkloadRecoveryInput!
  ): AgentWorkloadRotationAuthorization!

  stageAgentWorkloadKey(
    input: StageAgentWorkloadKeyInput!
  ): AgentWorkloadKeyMutationPayload!

  activateAgentWorkloadKey(
    input: ActivateAgentWorkloadKeyInput!
  ): AgentWorkloadKeyMutationPayload!

  revokeAgentWorkloadKey(
    input: RevokeAgentWorkloadKeyInput!
  ): AgentWorkloadKeyMutationPayload!

  revokeAgentWorkloadSessions(
    input: RevokeAgentWorkloadSessionsInput!
  ): AgentWorkloadRevocationReceipt!

  suspendAgentWorkloadIdentity(
    input: SuspendAgentWorkloadIdentityInput!
  ): AgentWorkloadControlMutationPayload!

  suspendAgentWorkloadIssuer(
    input: SuspendAgentWorkloadIssuerInput!
  ): AgentWorkloadControlMutationPayload!
}
```

Resolvers enforce:

- tenant identity from server context, with no public `accountId` argument;
- persisted operations for administrative mutations;
- `first <= 100`, signed keyset cursors, fixed indexed sort orders, and no offsets;
- opaque authoritative decision IDs on session opening; resolvers derive decision hashes, bindings, and expiries with tenant-scoped point reads;
- strict `Hash256` and opaque-token parsing, plus expected epochs for compare-and-set administrative mutations;
- separate administrator authorization for issuer, principal, key, and revocation operations;
- object- and field-level scopes for sessions, artifact references, epochs, key metadata, and attribution; persisted operations reduce attack surface but never replace authorization;
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

The Procedure Memory plane, not the identity card, exposes applicable runbook IDs. A procedure still requires deterministic applicability checks, plan verification, administrator capabilities, and governed actions. Retrieval output is untrusted and cannot populate tenant, issuer, subject, key, challenge, verifier, trust-policy, or epoch fields. A typed canonical administrative plan must be independently validated against current epochs and explicitly approved before a privileged identity routine can run.

### Semantic retrieval

Runbook summaries may be embedded and indexed only through the existing Procedure Memory contract. That plane owns vector dimensions, distance operator class, embedding model/version compatibility, and sealed index manifests:

```text
partition = hash(account_id)
manifest = embedding_model + dimensions + distance_opclass + sealed_epoch
filter   = account_id + procedure_kind + active_version + capability_scope
topK      = bounded by runtime contract
overfetch = bounded; no exact full-scan fallback
postcheck = exact account, policy, status, and applicability predicates
```

Principal names, external subjects, keys, certificates, claims, evidence, session tokens, and delegation chains are never embedded. HNSW cannot find or authenticate an identity. Exact point lookup is both safer and faster.

## 10. ACID and consistency model

### Row mutations

The following commit in one ACID transaction:

1. issuer, principal, key, and session lock/fence revalidation;
2. target row mutation or transaction intent;
3. immutable operation admission;
4. central Audit-plane event append and event reference;
5. outbox record for asynchronous projections or external effects.

Serializable isolation is not required for every data mutation. The shared fence locks conflict with revocation updates and establish one linearization order; the target operation retains its established mondayDB isolation level. Revocation is effective when its epoch update commits. Operations whose fence transaction committed first are before revocation; later operations fail.

### Vector and columnar reads

These paths cannot share a transaction with decoupled compute:

1. persist admission and pinned identity/session hashes;
2. revalidate the authoritative epoch immediately before data access and dispatch a bounded query with authenticated internal metadata;
3. require compute to echo request, account, session, and operation hashes;
4. under the shared account/issuer/principal/key/session locks, atomically insert `RESULT_RELEASE` claim with current fence epochs;
5. release results only after that claim commits;
6. insert immutable completion counters and source watermarks;
7. flag missing completion records for reconciliation.

Admission is durable and deterministic even when compute fails. A completion receipt says what was observed; it does not pretend the distributed read was ACID.

### External tools

Tool execution is a saga:

- commit an identity-fenced tool intent and outbox row;
- under the shared fence locks, atomically insert `TOOL_DELIVERY` claim before delivering an undelivered intent;
- deliver with a stable tenant-scoped idempotency key;
- verify the tool worker's own workload identity;
- record its signed receipt;
- compensate where a compensating action is defined.

“Exactly once external effect” is not a supported claim.

The release/delivery claim is the linearization point. The claim and its central Audit event commit atomically and contain request, session, principal, claim kind, all pinned fence epochs, database timestamp, and claim hash. Claim and revocation events share the account/principal audit sequence, so support can prove their order. Revocation prevents claims that have not committed; work whose claim committed first is explicitly classified as pre-revocation and may finish. Already begun external effects require reconciliation or compensation.

## 11. Auditability and replay

The central Audit plane owns chain heads, sequence allocation, immutable events, and signed checkpoints. Identity owns canonical verification, session, admission, and completion payloads and stores the returned `audit_event_id`. Privileged routines append the central event and identity row in one row-store transaction; direct application DML is denied. This avoids a second, incompatible audit chain.

Replay inputs include:

- trust-bundle, verifier-policy, parser, and verifier-build versions;
- signed decision envelope or durable encrypted reference, challenge, evidence, claims, artifact, policy-artifact, and verifier-receipt hashes;
- principal, key, credential, session, and policy epochs;
- explicit evaluation instant;
- delegation, runtime, access, purpose, operation, scan-risk, and query-plan hashes;
- deterministic decision code.

Raw secrets and sensitive attestation evidence are deliberately absent from normal rows. Authorized incident tooling can fetch encrypted evidence from its dedicated vault by content reference and retention policy. During that retention window, support can cryptographically reverify a decision; afterward, it can reconstruct the signed decision trace and prove integrity but cannot claim fresh re-verification of deleted evidence. Rejected attempts are retained with the same safe envelope metadata even when no issuer or principal resolved.

## 12. Performance and 1M+ row safety

Identity admission must be independent of board size. A board with one million or one billion rows adds zero identity rows to the hot-path lookup.

| Operation | Required access path | Bound |
|---|---|---|
| Resolve external subject | `(account_id, issuer_id, external_subject_hmac)` | One principal |
| Validate key | `(account_id, principal_id, key_generation)` | One key |
| Validate session | `(account_id, session_id)` plus issuer/principal/key PKs | Four point reads |
| Find request receipt | `(account_id, request_id)` | One admission and optional completion |
| List principal receipts | `(account_id, principal_id, admitted_at DESC, request_id)` | `first <= 100` |
| Revoke all sessions | Increment principal epoch | One principal update |
| Challenge cleanup | `(account_id, expires_at, challenge_id)` | Bounded account batch |
| Session cleanup | `(account_id, effective_expires_at, session_id)` | Bounded account batch |

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

The Query Governor emits a deterministic `ESTIMATED_ROWS_GE_1M` warning or `FULL_SCAN_REJECTED` decision before identity creates an operation admission. Identity binds that decision hash but never estimates board cardinality itself.

Admission, completion, and locator tables have a complete 16-leaf account-hash layout in the reference DDL; deployment may choose a benchmarked modulus before first write. Changing the modulus requires a controlled repartition migration. Every admission transaction creates a versioned `HOT` locator. Completion and release routines lock that locator and reject any state other than `HOT`. Archival is allowed only after the operation is terminal or its release deadline has expired: the worker locks the locator, compare-and-sets `HOT → COPYING`, and thereby blocks late children before taking the copy snapshot. It copies the admission, optional completion, and release claim; verifies the object checksum and central-audit checkpoint; then atomically marks the locator `ARCHIVED` and deletes claim, completion, and admission children in referential order. A crash before the final CAS is retryable from `COPYING` and never exposes an unverified object.

The locator is a narrow directory, not a duplicate receipt. Capacity approval includes bytes per locator, B-tree amplification, WAL, replicas, and a measured `(account_id, request_id)` point plan at one billion simulated entries. If the benchmarked row-store directory cannot meet the latency/storage objective, the same SQL contract is backed by mondayDB's tenant-partitioned durable KV layer before archival launches. Archive queries require explicit time bounds and a separate analytical budget.

Global cleanup never scans a tenant-leading index. The maintenance scheduler enumerates account partitions and issues bounded per-account ranges for sessions, challenges, and idempotency tombstones. Foreign-key support and retention access paths are verified from real `EXPLAIN` plans before launch.

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
| Stale worker after revocation | Authoritative epoch check fences storage, result release, and undelivered outbox work |
| Key rotation race | Compare expected epoch; reject or retry |
| Verifier outage | Existing sessions continue to persisted expiry; new sessions fail |
| Issuer compromise | Suspend tenant issuer and advance its minimum trust/verifier epoch in one transaction |
| Build pipeline compromise | Valid attestation still does not imply safe code; policy may deny digest |
| Cross-tenant subject collision | Tenant-local principal key and FORCE RLS prevent reuse |
| Request replay | Server challenge, DPoP `jti`, canonical body hash, and atomic replay reservation reject replay |
| Receipt tampering | Immutable row hash plus central Audit event and signed checkpoint expose mutation or truncation |
| Semantic poisoning | Vectors cannot enter the identity decision path |
| Retry storm | Admission and session limits plus payload-aware idempotency |
| Audit subsystem unavailable | Fail writes and tool intents closed |
| Session cache stale | Cache is only a hint; authoritative leader epoch is checked for writes, release, and delivery |
| Internal identity substitution | Each hop echoes and signs account, request, session, and operation hashes |

Effects already linearized or begun before revocation cannot be described as revoked; they are reconciled or compensated through Governed Action. Attestation creates new operational risks: issuer-root compromise, clock skew, privacy leakage, and false confidence in signed software. The design minimizes those risks with short claims, tenant-keyed HMACs, encrypted evidence references, explicit evaluation time, versioned trust material, and the rule that identity is necessary but never sufficient for authorization.

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
- All identity tables, keys, foreign keys, indexes, caches, and central-audit references are account-leading.
- FORCE RLS, no-direct-DML grants, child-partition grants, extension-protected tenant context, malicious `SET LOCAL`, and cross-tenant IDs are tested adversarially.
- Session creation is server-challenge, DPoP/mTLS proof, signed-envelope, epoch, authoritative-decision, and payload-idempotency bound.
- Emergency revocation is a point update and linearly fences stale writes, result release, and undelivered tool effects.
- Enrollment and rotation consume single-use durable authorizations; self-rotation proves both keys and recovery requires step-up or multi-party approval.
- DPoP `jti` or mTLS exporter replay reservations are unique per tenant/session and retained through the replay window.
- Open API schema compiles and every connection is keyset-paginated and bounded.
- TypeScript contracts compile in strict mode.
- SQL parses; all hash leaves exist; relational copies are composite-FK bound; and every hot path has a measured tenant-scoped plan.
- HNSW is absent from authentication and authorization paths.
- Procedural memories are discoverable but cannot mutate identity state without governed authorization.
- During evidence retention, replay cryptographically reverifies every acceptance or rejection; afterward, signed trace reconstruction makes the reduced guarantee explicit.
- Load tests show identity admission latency is independent of board row count.
- Billion-entry locator sizing and hot/archive point plans meet the storage and latency budget before archival is enabled.
- Active-session admission meets mondayDB's 99.99% objective under verifier outage; session-opening SLI and its external dependency errors are reported separately.
- Failure tests cover verifier outage, audit outage, key rotation race, epoch revocation, stale cache, challenge/DPoP replay, cross-tenant IDs, malicious tenant-context changes, and internal context substitution.

The result is not “AI-powered authentication.” It is deterministic database attribution strong enough that probabilistic agents can safely operate on top of mondayDB.
