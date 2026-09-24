# mondayDB Agentic Strategy

Daily strategy contracts that move mondayDB from a WorkOS engine toward a deterministic Agentic Database.

This increment ships the **Tool-Read Receipt Attestation Plane**: dual-control certificates bind a sealed `ALLOW_TOOL_READ` decision to a provider receipt. Silence stays `UNKNOWN_EFFECT`. An attested receipt is not `TRUSTED_ENROLLED`, not a fact restore, and not a body read.

```bash
npm install
npm run validate
```
