# mondayDB Agentic Database Artifacts

This repository contains architecture artifacts for evolving mondayDB from a
high-performance WorkOS database into an enterprise-grade agentic database.

## Current artifacts

- [Agentic Loop Containment Plane](docs/agentic-loop-containment-plane.md) -
  deterministic, tenant-scoped guardrails for detecting and containing repeated
  agent query, vector retrieval, and tool-use loops before they impact shared
  performance.
