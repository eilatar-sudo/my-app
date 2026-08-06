# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-fact-consumption-plane.md`](docs/agentic-fact-consumption-plane.md)
defines how mondayDB resolves published facts into agent-safe citations with
dependency invalidation, refresh uncertainty, account-scoped semantic profile
discovery, and neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
