# mondayDB Agentic Evolution

This repository captures product and engineering design notes for evolving
mondayDB from a high-performance WorkOS engine into an enterprise-grade
agentic database.

## Architecture notes

- [Agentic Working Set Plane](docs/agentic-working-set-plane.md): deterministic,
  tenant-scoped context bundles for autonomous agents, including procedural
  memory, semantic retrieval references, GraphQL API shape, audit hash chains,
  and guardrails for 1M+ row boards.