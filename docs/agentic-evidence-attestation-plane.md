# Agentic Evidence Attestation Plane

## Why this plane matters

Agents can summarize, recommend, and act, but enterprise users need to know
which mondayDB facts the agent relied on. The Evidence Attestation Plane creates
deterministic, tenant-scoped evidence packets that bind row, columnar, vector,
tool, and procedural-memory reads into a replayable trace.

The product trade-off is latency versus trust. Persisting an attestation packet
adds write amplification after an agentic read path, but it prevents "magic" AI
answers by making every cited fact reproducible through mondayDB snapshots,
watermarks, and audit hashes. The database remains deterministic; probabilistic
LLM reasoning happens above this plane and receives only bounded evidence
handles.

## Design goals

- Keep every evidence packet scoped by `account_id`.
- Capture exactly what an agent was allowed to perceive, not the full board.
- Support row store, columnar aggregates, vector retrieval, tool execution, and
  procedural memory citations in one replayable envelope.
- Expose the packet through the monday.com Open API GraphQL surface.
- Avoid full table scans on boards with 1M+ rows by requiring bounded source
  references, planner estimates, and pre-verified retrieval routes.
- Preserve auditability through deterministic canonical hashes.

## TypeScript contracts

```ts
export type EvidenceSourceKind =
  | "row_item"
  | "columnar_aggregate"
  | "semantic_chunk"
  | "procedure_memory"
  | "tool_observation"
  | "lineage_anchor";

export type EvidenceVisibility = "agent_visible" | "human_visible" | "redacted";

export interface EvidenceAttestationPacket {
  account_id: string;
  packet_id: string;
  board_id?: string;
  agent_run_id: string;
  plan_verification_id: string;
  retrieval_route_id: string;
  snapshot_watermark: string;
  created_at: string;
  expires_at?: string;
  source_count: number;
  source_digest: string;
  packet_hash: string;
  previous_packet_hash?: string;
  guardrail_result: EvidenceGuardrailResult;
  perception_tags: AgentPerceptionTag[];
}

export interface EvidenceSourceRef {
  account_id: string;
  packet_id: string;
  source_id: string;
  source_kind: EvidenceSourceKind;
  visibility: EvidenceVisibility;
  board_id?: string;
  item_id?: string;
  column_id?: string;
  semantic_chunk_id?: string;
  procedure_id?: string;
  tool_lease_id?: string;
  lineage_anchor_id?: string;
  source_watermark: string;
  source_hash: string;
  excerpt_hash: string;
  rank?: number;
  score?: number;
  metadata: Record<string, string | number | boolean>;
}

export interface EvidenceGuardrailResult {
  account_id: string;
  packet_id: string;
  max_sources: number;
  max_vector_top_k: number;
  max_columnar_groups: number;
  estimated_row_reads: number;
  estimated_vector_candidates: number;
  estimated_columnar_cells: number;
  recursion_depth: number;
  admitted: boolean;
  denial_reason?: string;
}

export interface AgentPerceptionTag {
  account_id: string;
  packet_id: string;
  tag: string;
  confidence_source: "deterministic_rule" | "human_label" | "schema_contract";
}
```

`packet_hash` is computed over a canonical JSON form of the packet header,
ordered source references, guardrail result, and `previous_packet_hash`.
Generated prose, model logits, or hidden chain-of-thought are never inputs to
the hash. This keeps replay deterministic even when agents are probabilistic.

## SQL schema

```sql
CREATE TABLE agentic_evidence_packets (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  board_id BIGINT,
  agent_run_id UUID NOT NULL,
  plan_verification_id UUID NOT NULL,
  retrieval_route_id UUID NOT NULL,
  snapshot_watermark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  source_count INTEGER NOT NULL CHECK (source_count >= 0),
  source_digest BYTEA NOT NULL,
  packet_hash BYTEA NOT NULL,
  previous_packet_hash BYTEA,
  guardrail_admitted BOOLEAN NOT NULL,
  guardrail_denial_reason TEXT,
  PRIMARY KEY (account_id, packet_id)
);

CREATE INDEX agentic_evidence_packets_run_idx
  ON agentic_evidence_packets (account_id, agent_run_id, created_at DESC);

CREATE INDEX agentic_evidence_packets_board_idx
  ON agentic_evidence_packets (account_id, board_id, created_at DESC)
  WHERE board_id IS NOT NULL;

CREATE TABLE agentic_evidence_source_refs (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  source_id UUID NOT NULL,
  source_kind TEXT NOT NULL CHECK (
    source_kind IN (
      'row_item',
      'columnar_aggregate',
      'semantic_chunk',
      'procedure_memory',
      'tool_observation',
      'lineage_anchor'
    )
  ),
  visibility TEXT NOT NULL CHECK (
    visibility IN ('agent_visible', 'human_visible', 'redacted')
  ),
  board_id BIGINT,
  item_id BIGINT,
  column_id TEXT,
  semantic_chunk_id UUID,
  procedure_id UUID,
  tool_lease_id UUID,
  lineage_anchor_id UUID,
  source_watermark TEXT NOT NULL,
  source_hash BYTEA NOT NULL,
  excerpt_hash BYTEA NOT NULL,
  rank INTEGER,
  score DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (account_id, packet_id, source_id),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agentic_evidence_packets (account_id, packet_id)
);

CREATE INDEX agentic_evidence_source_board_item_idx
  ON agentic_evidence_source_refs (account_id, board_id, item_id)
  WHERE board_id IS NOT NULL AND item_id IS NOT NULL;

CREATE INDEX agentic_evidence_source_semantic_idx
  ON agentic_evidence_source_refs (account_id, semantic_chunk_id)
  WHERE semantic_chunk_id IS NOT NULL;

CREATE INDEX agentic_evidence_source_procedure_idx
  ON agentic_evidence_source_refs (account_id, procedure_id)
  WHERE procedure_id IS NOT NULL;

CREATE TABLE agentic_evidence_perception_tags (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  tag TEXT NOT NULL,
  confidence_source TEXT NOT NULL CHECK (
    confidence_source IN (
      'deterministic_rule',
      'human_label',
      'schema_contract'
    )
  ),
  PRIMARY KEY (account_id, packet_id, tag),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agentic_evidence_packets (account_id, packet_id)
);

CREATE INDEX agentic_evidence_tags_lookup_idx
  ON agentic_evidence_perception_tags (account_id, tag, packet_id);
```

All primary and secondary indexes start with `account_id` to preserve
multi-tenant isolation and planner locality. Any query that omits `account_id`
must be rejected by the Open API resolver and internal service boundary before
it reaches row, columnar, or vector execution.

## Optional vector compatibility

Evidence packets can be embedded for later discovery, but the embedding is only
a summary pointer. It does not replace the deterministic source references.

```sql
CREATE TABLE agentic_evidence_packet_embeddings (
  account_id BIGINT NOT NULL,
  packet_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  embedding_source_hash BYTEA NOT NULL,
  PRIMARY KEY (account_id, packet_id, embedding_model),
  FOREIGN KEY (account_id, packet_id)
    REFERENCES agentic_evidence_packets (account_id, packet_id)
);

CREATE INDEX agentic_evidence_packet_embedding_hnsw_idx
  ON agentic_evidence_packet_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The vector search resolver must still filter by `account_id` and apply a
bounded `topK`. For large tenants, prefer tenant-partitioned or shard-local HNSW
indexes so an evidence lookup cannot scan unrelated accounts.

## Open API GraphQL shape

```graphql
input EvidenceSourceRefInput {
  sourceId: ID!
  sourceKind: EvidenceSourceKind!
  visibility: EvidenceVisibility!
  boardId: ID
  itemId: ID
  columnId: String
  semanticChunkId: ID
  procedureId: ID
  toolLeaseId: ID
  lineageAnchorId: ID
  sourceWatermark: String!
  sourceHash: String!
  excerptHash: String!
  rank: Int
  score: Float
  metadata: JSON
}

input CreateEvidencePacketInput {
  accountId: ID!
  boardId: ID
  agentRunId: ID!
  planVerificationId: ID!
  retrievalRouteId: ID!
  snapshotWatermark: String!
  previousPacketHash: String
  sources: [EvidenceSourceRefInput!]!
  perceptionTags: [String!]!
}

type EvidencePacket {
  accountId: ID!
  packetId: ID!
  boardId: ID
  agentRunId: ID!
  planVerificationId: ID!
  retrievalRouteId: ID!
  snapshotWatermark: String!
  createdAt: DateTime!
  sourceCount: Int!
  sourceDigest: String!
  packetHash: String!
  previousPacketHash: String
  guardrail: EvidenceGuardrailResult!
  perceptionTags: [String!]!
  sources(first: Int!, after: String): EvidenceSourceConnection!
}

type Mutation {
  createEvidencePacket(input: CreateEvidencePacketInput!): EvidencePacket!
}

type Query {
  evidencePacket(accountId: ID!, packetId: ID!): EvidencePacket
  evidencePacketsByRun(
    accountId: ID!
    agentRunId: ID!
    first: Int!
    after: String
  ): EvidencePacketConnection!
  searchEvidencePackets(
    accountId: ID!
    query: String!
    topK: Int!
    tags: [String!]
  ): [EvidencePacket!]!
}
```

Resolvers must derive authorization from the caller's account context and check
that `input.accountId` matches it. Pagination arguments are required for source
lists to avoid returning an unbounded evidence payload.

## Write path

1. The agent plan verifier emits a bounded source budget:
   `max_sources`, `max_vector_top_k`, `max_columnar_groups`, and
   `max_estimated_row_reads`.
2. The retrieval router returns source references from row, columnar, vector,
   tool, and procedural-memory paths. Each reference includes a source
   watermark and hash.
3. The evidence service sorts sources by `(source_kind, rank, source_id)` and
   computes `source_digest`.
4. Guardrails compare actual source counts and planner estimates against the
   verified budget.
5. The packet and source refs are committed in one ACID transaction.
6. An immutable audit event records `account_id`, `packet_id`, `packet_hash`,
   `source_digest`, and `previous_packet_hash`.

If a guardrail fails, the service can still persist a denied packet with
`guardrail_admitted = false`. This gives support teams a deterministic trace of
why an agent response was blocked without exposing unapproved evidence to the
agent.

## Read path for agents

Agents should perceive evidence packets as citations, not as raw database
authority. A packet gives the LLM:

- stable source handles,
- short deterministic excerpts approved for visibility,
- perception tags such as `customer_risk`, `renewal_blocker`, or
  `automation_recipe`,
- source ranks and scores from the retrieval path,
- procedure-memory IDs that explain how the evidence should be used.

The agent should never infer tenant scope, access rights, or freshness on its
own. Those are explicit fields supplied by the packet and enforced by mondayDB.

## Performance check for 1M+ row boards

High-risk patterns:

- Creating a packet from a board query that lacks `(account_id, board_id)`.
- Allowing `sources` to be larger than the plan verifier's `max_sources`.
- Expanding all rows that contributed to a columnar aggregate.
- Running semantic evidence search with unbounded `topK`.
- Filtering `metadata JSONB` without a selective account-prefixed index.

Required mitigations:

- Reject packet creation when any source lacks `account_id`.
- Require row sources to identify `board_id` and `item_id`; batch lookups must
  use `(account_id, board_id, item_id)`.
- Store aggregate evidence as a bounded aggregate source plus optional sampled
  row refs, not as every contributing row.
- Enforce `topK <= max_vector_top_k` from the verified plan.
- Cap packet source pagination and default to `first <= 100`.
- Use retrieval route estimates to deny packet creation before materializing
  expensive recursive evidence expansions.

## Audit event

```ts
export interface EvidenceAttestationAuditEvent {
  account_id: string;
  event_id: string;
  packet_id: string;
  agent_run_id: string;
  actor_id: string;
  event_type:
    | "evidence_packet_created"
    | "evidence_packet_denied"
    | "evidence_packet_replayed";
  source_digest: string;
  packet_hash: string;
  previous_packet_hash?: string;
  occurred_at: string;
}
```

The audit stream is append-only. Replaying a packet recomputes hashes from the
stored source references and compares them with the audit event. Any mismatch is
a deterministic integrity failure, not an LLM confidence issue.

## Enterprise guardrails

- Multi-tenancy: every table key, index, mutation, and query starts with
  `account_id`.
- ACID: packet header and source refs commit atomically.
- Availability: evidence embedding is asynchronous; packet creation does not
  wait for HNSW indexing.
- Predictability: packet hashes exclude generated natural language.
- Cost isolation: packet creation consumes the agent run's existing query budget
  and cannot mint a new recursive retrieval budget.
- Data minimization: redacted sources preserve hashes and metadata needed for
  replay without exposing sensitive excerpts to the agent.

## Open questions

- Whether evidence packet retention should follow board retention, audit-log
  retention, or a separate enterprise compliance policy.
- Whether `source_hash` should be computed at the storage layer only, or also by
  API resolvers for external tool observations.
- How much excerpt text should be stored inline versus fetched through a
  short-lived signed evidence URL for large files.
