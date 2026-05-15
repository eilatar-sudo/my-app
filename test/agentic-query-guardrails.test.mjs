import test from "node:test";
import assert from "node:assert/strict";

import {
  GuardrailReason,
  createAgenticAuditTrace,
  validateAgenticQueryEnvelope
} from "../src/agentic-query-guardrails.js";

const baseEnvelope = Object.freeze({
  accountId: "acc_123",
  actor: {
    id: "agent_456",
    type: "agent",
    runId: "run_789"
  },
  operation: {
    id: "op_001",
    kind: "semantic_search",
    predicateColumns: ["account_id", "namespace"],
    estimatedRowsScanned: 10_000,
    semanticTopK: 10,
    usesVectorIndex: true,
    toolDepth: 1,
    fanout: 1
  }
});

test("allows scoped semantic retrieval within deterministic budgets", () => {
  const decision = validateAgenticQueryEnvelope(baseEnvelope);

  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, [GuardrailReason.ALLOWED]);
  assert.equal(decision.enforcedAccountId, "acc_123");
  assert.match(decision.policyHash, /^[a-f0-9]{64}$/);
});

test("denies high-risk operations that omit an account_id predicate", () => {
  const decision = validateAgenticQueryEnvelope({
    ...baseEnvelope,
    operation: {
      ...baseEnvelope.operation,
      predicateColumns: ["namespace"]
    }
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes(GuardrailReason.MISSING_ACCOUNT_PREDICATE));
});

test("denies semantic retrieval without HNSW-compatible vector index usage", () => {
  const decision = validateAgenticQueryEnvelope({
    ...baseEnvelope,
    operation: {
      ...baseEnvelope.operation,
      usesVectorIndex: false
    }
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, [GuardrailReason.VECTOR_INDEX_REQUIRED]);
});

test("denies expensive recursive tool fanout before database execution", () => {
  const decision = validateAgenticQueryEnvelope({
    ...baseEnvelope,
    operation: {
      ...baseEnvelope.operation,
      kind: "tool_invocation",
      estimatedRowsScanned: 250_000,
      toolDepth: 9,
      fanout: 16
    }
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes(GuardrailReason.SCAN_BUDGET_EXCEEDED));
  assert.ok(decision.reasons.includes(GuardrailReason.TOOL_DEPTH_EXCEEDED));
  assert.ok(decision.reasons.includes(GuardrailReason.FANOUT_EXCEEDED));
});

test("creates deterministic audit digests for the same envelope and decision", () => {
  const decision = validateAgenticQueryEnvelope(baseEnvelope);
  const firstTrace = createAgenticAuditTrace(
    baseEnvelope,
    decision,
    "2026-05-15T00:00:00.000Z"
  );
  const secondTrace = createAgenticAuditTrace(
    baseEnvelope,
    decision,
    "2026-05-15T00:00:00.000Z"
  );

  assert.equal(firstTrace.auditDigest, secondTrace.auditDigest);
  assert.match(firstTrace.auditDigest, /^[a-f0-9]{64}$/);
});
