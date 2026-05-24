# mondayDB Agentic Database Evolution

This repository tracks product and engineering artifacts for evolving mondayDB
from a high-performance WorkOS engine into an agent-ready database platform.

The design principle is deterministic infrastructure for probabilistic agents:
LLMs may retrieve context and propose plans, but mondayDB must verify tenant
scope, cost, auditability, and ACID-safe execution before any query, write, or
tool call runs.

## Current artifact

- [Agentic Retrieval Router Plane](docs/agentic-retrieval-router-plane.md)
  defines deterministic route selection across row, columnar, vector, and
  hybrid retrieval paths. It includes TypeScript contracts, SQL schemas, Open
  API GraphQL surfaces, pgvector/HNSW-compatible route discovery, audit hashes,
  procedural-memory hooks, and guardrails against recursive or full-scan agent
  workflows.

## Enterprise invariants

- Every data path is scoped by `account_id`; GraphQL resolvers derive it from
  auth context rather than client input.
- Semantic retrieval can rank visible records, but cannot grant execution
  privileges.
- Retrieval route, plan, and candidate decisions leave deterministic audit
  traces.
- Queries touching boards with 1M+ rows must prove partition pruning and indexed
  predicates before execution.
