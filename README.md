# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-citation-sharing-plane.md`](docs/agentic-citation-sharing-plane.md)
defines how mondayDB shares sealed citations across agent sessions with further
purpose attenuation, sync invalidation, recipient-notify uncertainty,
account-scoped semantic profile discovery, and neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
