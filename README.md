# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-refresh-quorum-plane.md`](docs/agentic-refresh-quorum-plane.md)
defines how mondayDB tallies conflicting FOLLOW_CURRENT refresh outcomes across
shared recipients into sealed quorum certificates with purpose attenuation,
refresh uncertainty, account-scoped semantic profile discovery, and
neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
