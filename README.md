# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-grounding-assertion-plane.md`](docs/agentic-grounding-assertion-plane.md)
defines how mondayDB verifies that agent-proposed claims are closed over
authorized, non-revoked, freshness-bounded evidence before those claims can
authorize board writes, memory promotion, or user-visible conclusions.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
