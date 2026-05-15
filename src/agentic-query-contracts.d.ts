export type AgenticOperationKind =
  | "aggregation"
  | "procedural_memory_write"
  | "row_read"
  | "semantic_search"
  | "tool_invocation";

export type AgenticActorType = "agent" | "human" | "system";

export interface AgenticActor {
  id: string;
  type: AgenticActorType;
  runId?: string;
}

export interface SemanticRetrievalSpec {
  embeddingModel: string;
  embeddingDimensions: number;
  hnswEfSearch?: number;
  metadataTags: string[];
  topK: number;
}

export interface ProceduralMemoryRecord {
  accountId: string;
  memoryId: string;
  namespace: string;
  instruction: string;
  metadataTags: string[];
  source: {
    actorId: string;
    actorType: AgenticActorType;
    operationId: string;
  };
  version: number;
}

export interface AgenticOperation {
  id: string;
  kind: AgenticOperationKind;
  predicateColumns: string[];
  estimatedRowsScanned?: number;
  fullTableScan?: boolean;
  semanticTopK?: number;
  usesVectorIndex?: boolean;
  toolDepth?: number;
  fanout?: number;
  semanticRetrieval?: SemanticRetrievalSpec;
}

export interface AgenticQueryEnvelope {
  accountId: string;
  actor: AgenticActor;
  operation: AgenticOperation;
  idempotencyKey?: string;
}

export interface AgenticGuardrailPolicy {
  requireAccountScope: boolean;
  maxEstimatedRowsScanned: number;
  maxSemanticTopK: number;
  maxToolDepth: number;
  maxFanout: number;
  allowFullTableScan: boolean;
}

export interface AgenticGuardrailDecision {
  allowed: boolean;
  reasons: readonly string[];
  enforcedAccountId: string | null;
  policyHash: string;
}

export interface AgenticAuditTrace {
  auditDigest: string;
  accountId: string | null;
  actor: {
    id: string | null;
    type: AgenticActorType | null;
    runId: string | null;
  };
  operationKind: AgenticOperationKind | null;
  operationId: string | null;
  allowed: boolean;
  reasons: string[];
  policyHash: string;
  occurredAt?: string;
}

export const DEFAULT_AGENTIC_GUARDRAIL_POLICY: Readonly<AgenticGuardrailPolicy>;

export const GuardrailReason: Readonly<Record<string, string>>;

export function validateAgenticQueryEnvelope(
  envelope: AgenticQueryEnvelope,
  policyOverrides?: Partial<AgenticGuardrailPolicy>
): AgenticGuardrailDecision;

export function createAgenticAuditTrace(
  envelope: AgenticQueryEnvelope,
  decision: AgenticGuardrailDecision,
  occurredAt?: string
): AgenticAuditTrace;
