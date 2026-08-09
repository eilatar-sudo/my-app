# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-grant-graph-visibility-plane.md`](docs/agentic-grant-graph-visibility-plane.md)
defines how mondayDB compiles hop-bounded visibility envelopes over multi-hop
citation share grants with further purpose attenuation, refresh uncertainty,
account-scoped semantic profile discovery, and neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
