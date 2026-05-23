# mondayDB Agentic Database Evolution

This repository tracks product and engineering artifacts for evolving mondayDB
from a high-performance WorkOS engine into an agent-ready database platform.

The design principle is deterministic infrastructure for probabilistic agents:
LLMs may retrieve context and propose plans, but mondayDB must verify tenant
scope, cost, auditability, and ACID-safe execution before any query, write, or
tool call runs.

## Current artifact

- [Agentic Procedure Memory Plane](docs/agentic-procedure-memory-plane.md)
  defines tenant-scoped, versioned procedure memory for reusable agent
  instructions. It includes TypeScript contracts, SQL schemas, Open API
  GraphQL surfaces, pgvector/HNSW-compatible retrieval, deterministic audit
  hashes, and guardrails against recursive or full-scan agent workflows.

## Enterprise invariants

- Every data path is scoped by `account_id`; GraphQL resolvers derive it from
  auth context rather than client input.
- Semantic retrieval can rank visible records, but cannot grant execution
  privileges.
- Procedure, plan, and tool execution decisions leave deterministic audit
  traces.
- Queries touching boards with 1M+ rows must prove partition pruning and indexed
  predicates before execution.
