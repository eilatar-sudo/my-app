# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-effect-saga-plane.md`](docs/agentic-effect-saga-plane.md)
defines how autonomous workflows coordinate ACID mondayDB changes with
non-transactional external tool effects without pretending that distributed
atomicity exists.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```