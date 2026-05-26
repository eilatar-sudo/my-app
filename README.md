# mondayDB Agentic Evolution

This repository contains strategic product and engineering artifacts for
evolving mondayDB from a high-performance WorkOS engine into an agentic database
while preserving deterministic enterprise behavior.

## Artifacts

- [Agentic Freshness and Consistency Plane](docs/agentic-freshness-consistency-plane.md)
  - Defines tenant-scoped freshness envelopes across row, columnar, vector, and
    procedural-memory paths.
  - Includes TypeScript contracts, SQL schemas, GraphQL Open API shape,
    pgvector/HNSW compatibility notes, auditability, and 1M+ row performance
    guardrails.
