# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-fact-publication-plane.md`](docs/agentic-fact-publication-plane.md)
defines how mondayDB publishes grounding certificates as enterprise-visible,
supersedable facts with dual-control, notify uncertainty, account-scoped
semantic template discovery, and neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
