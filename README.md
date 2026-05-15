# mondayDB Agentic Contracts

This repository captures the first deterministic contracts for evolving mondayDB from a high-performance WorkOS engine into an agent-ready database surface.

## Why this exists

Agentic workloads need semantic retrieval and procedural memory, but mondayDB still has to protect enterprise guarantees: tenant isolation, predictable execution, auditability, and low-latency queries on very large boards. The code in this repo keeps AI behavior outside the database engine and gives the engine deterministic envelopes it can validate before executing work.

## What is included

- `src/agentic-query-guardrails.js` - deterministic guardrail validation for tenant scope, scan budgets, vector index usage, semantic `topK`, recursive tool depth, and fanout.
- `src/agentic-query-contracts.d.ts` - TypeScript interfaces for agentic query envelopes, procedural memory, semantic retrieval, guardrail decisions, and audit traces.
- `sql/agentic_memory.sql` - SQL schema for account-scoped semantic/procedural memory and audit traces, including pgvector HNSW indexing.
- `graphql/agentic-memory.graphql` - Open API GraphQL SDL for memory upsert and semantic search.
- `docs/mondaydb-agentic-database-blueprint.md` - product and engineering rationale, performance notes, and agent-readiness guidance.

## Local checks

```sh
npm test
npm run check
```