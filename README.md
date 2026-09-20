# mondayDB Agentic Strategy

Daily strategy contracts that move mondayDB from a WorkOS engine toward a deterministic Agentic Database.

This increment ships the **Cycle-Bound Terminal Plane**: a hard stop after a bounded number of first-enrollment governance cycles. Once `cycle_count >= max_cycle_count`, mondayDB dual-control seals `REQUIRE_HUMAN` or `PERMANENT_QUARANTINE`. It does not start another nested expiry-containment-review-resolution plane, and it never rewrites cycle silence as `TRUSTED_ENROLLED`.

```bash
npm install
npm run validate
```
