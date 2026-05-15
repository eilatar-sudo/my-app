# mondayDB Agentic Database Blueprint

## Why before how

The strategic trade-off is latency and predictability versus agent flexibility. Agents benefit from broad semantic search and long-term memory, but mondayDB cannot let probabilistic planning leak into the storage engine. The database should expose deterministic contracts: every agent request declares tenant scope, estimated scan cost, vector-search shape, and tool recursion depth before compute is allocated.

This preserves the WorkOS promise:

- **Consistency:** procedural memories are versioned records with deterministic audit traces.
- **Isolation:** every read/write contract carries `account_id` and database rows are protected by row-level security.
- **Performance:** semantic retrieval is allowed only through an indexed vector path with bounded `topK`, not unbounded scans over board data.

## Schema design

### TypeScript contract

The exported TypeScript surface is in `src/agentic-query-contracts.d.ts`. The core envelope is:

```ts
export interface AgenticQueryEnvelope {
  accountId: string;
  actor: AgenticActor;
  operation: AgenticOperation;
  idempotencyKey?: string;
}
```

The product intent is that agents do not submit raw free-form database intents. They submit a typed envelope that the API layer can validate, audit, and map to row/columnar execution plans.

### SQL storage

The SQL schema in `sql/agentic_memory.sql` introduces:

- `mondaydb_agentic_memories` for semantic and procedural memory.
- `mondaydb_agentic_audit_traces` for deterministic traceability.
- A pgvector HNSW index for retrieval-augmented generation workloads.
- Account-scoped primary keys and row-level security policies.

### GraphQL API

The SDL in `graphql/agentic-memory.graphql` exposes:

- `upsertAgenticMemory(input: UpsertAgenticMemoryInput!)`
- `searchAgenticMemory(input: SearchAgenticMemoryInput!)`

Both inputs require `accountId`. In a production monday.com Open API implementation, this should also be cross-checked against auth context and account membership.

## Guardrail policy

`src/agentic-query-guardrails.js` denies requests that violate deterministic constraints:

- Missing `accountId`.
- Missing `account_id` predicate for high-risk reads, aggregations, semantic search, or tool invocation.
- Full table scans unless explicitly enabled by policy.
- Estimated row scans above budget.
- Semantic search without vector index usage.
- Semantic `topK` above policy.
- Recursive tool depth or fanout above policy.

The default scan budget is intentionally conservative at 100,000 estimated rows. Boards with 1M+ rows must not rely on this layer alone; query planning should still require selective account/board/item predicates and row/columnar statistics before execution.

## Performance check

Flag any proposal that:

- Searches memory or board data without `account_id`.
- Performs vector search without HNSW/IVFFlat-style index support.
- Applies metadata filters only after vector retrieval when the candidate set can cross tenant or board boundaries.
- Runs aggregations on the row store when a columnar projection can answer the request.
- Lets an agent recursively call tools without a bounded depth and fanout budget.

The HNSW index is suitable for semantic retrieval, but tenant isolation still depends on the enforced `account_id` predicate and row-level security. For very large tenants, consider per-account or per-shard vector partitions to reduce post-index filtering.

## How an agent perceives this data

Agents should see memory records as tagged, versioned context rather than hidden magic. Recommended metadata tags:

- `board:<board_id>`
- `workflow:<workflow_id>`
- `tool:<tool_name>`
- `policy:<policy_name>`
- `freshness:<ttl_bucket>`
- `sensitivity:<classification>`

Procedural memory stores instructions such as "when creating a quarterly planning board, apply the finance approval workflow." Semantic memory stores retrievable context such as prior decisions, summaries, and embeddings. Both are auditable and scoped to an account.

## Determinism boundary

LLMs may choose which memory to request, but mondayDB should deterministically decide whether the request is safe and how it is executed. The audit digest produced by `createAgenticAuditTrace` gives the same hash for the same envelope, decision, policy, and timestamp, making investigations reproducible.
