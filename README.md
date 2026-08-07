# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-citation-materialization-plane.md`](docs/agentic-citation-materialization-plane.md)
defines how mondayDB materializes sealed citations onto boards, working sets,
and decision memory with purpose attenuation, sync invalidation, writeback
uncertainty, account-scoped semantic profile discovery, and neighbor-safe
query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
