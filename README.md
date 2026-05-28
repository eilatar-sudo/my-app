# mondayDB Agentic Database Vision

This repository contains product and engineering artifacts for evolving
mondayDB from a high-performance WorkOS engine into an enterprise-grade
agentic database platform.

The guiding principle is deterministic infrastructure for probabilistic agents:
mondayDB should expose semantic retrieval, procedural memory, and tool-use
readiness through tenant-scoped, auditable, and cost-bounded contracts.

## Current artifact

- [mondayDB Agentic Database Vision](docs/agentic-database-vision.md) defines
  the core agentic control and data planes, including TypeScript contracts, SQL
  schemas, GraphQL Open API surfaces, pgvector/HNSW compatibility, multi-tenant
  guardrails, performance checks, and agent perception metadata.

## Enterprise invariants

- Every query and audit event is scoped by `account_id`.
- Semantic retrieval can rank records, but cannot grant permissions.
- Agent-originated work must declare budgets for rows, vector candidates,
  recursion depth, and timeout.
- ACID writes remain deterministic; embeddings and columnar projections are
  derived from committed row-store versions.
- Queries that risk full scans on boards with 1M+ rows must be rejected,
  degraded, or routed to an offline job class.