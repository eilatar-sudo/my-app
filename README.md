# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-split-resolution-plane.md`](docs/agentic-split-resolution-plane.md)
defines how mondayDB resolves REQUIRE_HUMAN_ON_SPLIT quorum outcomes under
dual-control human assent into sealed resolution certificates with purpose
attenuation, refresh uncertainty, account-scoped semantic profile discovery,
and neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
