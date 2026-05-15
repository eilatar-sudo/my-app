import { createHash } from "node:crypto";

const ACCOUNT_ID_COLUMN = "account_id";
const HIGH_RISK_OPERATION_KINDS = new Set([
  "aggregation",
  "row_read",
  "semantic_search",
  "tool_invocation"
]);

export const DEFAULT_AGENTIC_GUARDRAIL_POLICY = Object.freeze({
  requireAccountScope: true,
  maxEstimatedRowsScanned: 100_000,
  maxSemanticTopK: 50,
  maxToolDepth: 4,
  maxFanout: 8,
  allowFullTableScan: false
});

export const GuardrailReason = Object.freeze({
  ALLOWED: "ALLOWED",
  MISSING_ACCOUNT_ID: "MISSING_ACCOUNT_ID",
  MISSING_ACCOUNT_PREDICATE: "MISSING_ACCOUNT_PREDICATE",
  FULL_TABLE_SCAN: "FULL_TABLE_SCAN",
  SCAN_BUDGET_EXCEEDED: "SCAN_BUDGET_EXCEEDED",
  SEMANTIC_TOP_K_EXCEEDED: "SEMANTIC_TOP_K_EXCEEDED",
  VECTOR_INDEX_REQUIRED: "VECTOR_INDEX_REQUIRED",
  TOOL_DEPTH_EXCEEDED: "TOOL_DEPTH_EXCEEDED",
  FANOUT_EXCEEDED: "FANOUT_EXCEEDED"
});

export function validateAgenticQueryEnvelope(envelope, policyOverrides = {}) {
  const policy = {
    ...DEFAULT_AGENTIC_GUARDRAIL_POLICY,
    ...policyOverrides
  };
  const operation = envelope?.operation ?? {};
  const predicateColumns = normalizeColumns(operation.predicateColumns);
  const reasons = [];

  if (policy.requireAccountScope && !isNonEmptyString(envelope?.accountId)) {
    reasons.push(GuardrailReason.MISSING_ACCOUNT_ID);
  }

  if (
    policy.requireAccountScope &&
    HIGH_RISK_OPERATION_KINDS.has(operation.kind) &&
    !predicateColumns.has(ACCOUNT_ID_COLUMN)
  ) {
    reasons.push(GuardrailReason.MISSING_ACCOUNT_PREDICATE);
  }

  if (
    operation.fullTableScan === true &&
    policy.allowFullTableScan !== true
  ) {
    reasons.push(GuardrailReason.FULL_TABLE_SCAN);
  }

  if (
    Number.isFinite(operation.estimatedRowsScanned) &&
    operation.estimatedRowsScanned > policy.maxEstimatedRowsScanned
  ) {
    reasons.push(GuardrailReason.SCAN_BUDGET_EXCEEDED);
  }

  if (operation.kind === "semantic_search") {
    if (
      Number.isFinite(operation.semanticTopK) &&
      operation.semanticTopK > policy.maxSemanticTopK
    ) {
      reasons.push(GuardrailReason.SEMANTIC_TOP_K_EXCEEDED);
    }

    if (operation.usesVectorIndex !== true) {
      reasons.push(GuardrailReason.VECTOR_INDEX_REQUIRED);
    }
  }

  if (
    Number.isFinite(operation.toolDepth) &&
    operation.toolDepth > policy.maxToolDepth
  ) {
    reasons.push(GuardrailReason.TOOL_DEPTH_EXCEEDED);
  }

  if (
    Number.isFinite(operation.fanout) &&
    operation.fanout > policy.maxFanout
  ) {
    reasons.push(GuardrailReason.FANOUT_EXCEEDED);
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons.length === 0 ? [GuardrailReason.ALLOWED] : reasons),
    enforcedAccountId: envelope?.accountId ?? null,
    policyHash: digestStable(policy)
  });
}

export function createAgenticAuditTrace(envelope, decision, occurredAt) {
  const trace = {
    accountId: envelope?.accountId ?? null,
    actor: {
      id: envelope?.actor?.id ?? null,
      type: envelope?.actor?.type ?? null,
      runId: envelope?.actor?.runId ?? null
    },
    operationKind: envelope?.operation?.kind ?? null,
    operationId: envelope?.operation?.id ?? null,
    allowed: decision.allowed,
    reasons: [...decision.reasons],
    policyHash: decision.policyHash,
    occurredAt
  };

  return Object.freeze({
    ...trace,
    auditDigest: digestStable({
      ...trace,
      occurredAt: occurredAt ?? null
    })
  });
}

function normalizeColumns(columns) {
  if (!Array.isArray(columns)) {
    return new Set();
  }

  return new Set(
    columns
      .filter(isNonEmptyString)
      .map((column) => column.trim().toLowerCase())
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function digestStable(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
