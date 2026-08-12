# mondayDB Agentic Database Strategy

This repository contains executable product and engineering contracts for
evolving mondayDB into a deterministic, tenant-safe agentic database.

## Current proposal

[`docs/agentic-escalation-authority-plane.md`](docs/agentic-escalation-authority-plane.md)
defines how mondayDB resolves `ESCALATE_ON_DISAGREE` split-resolution outcomes
under a higher-authority tier into sealed escalation certificates with
prior-principal exclusion, purpose attenuation, refresh uncertainty,
account-scoped semantic profile discovery, and neighbor-safe query guardrails.

Validate every TypeScript, SQL, and GraphQL contract in the proposal:

```bash
npm install
npm run validate
```
