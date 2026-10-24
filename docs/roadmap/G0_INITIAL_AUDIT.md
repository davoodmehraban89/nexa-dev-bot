# G0 baseline audit — initial evidence (2026-10-24)

**Status: PARTIAL / NOT G0 ACCEPTED.** Source inspected via connected GitHub read API at main `5d1c083d326db327cc3973a9d3adecc1d8092c91`. No claim of a full-file audit, new test run, or real-device smoke.

## Verified findings
- `package.json`: version `1.1.1`; `README.md`: current product described as V2.1; `src/index.js` health payload hardcodes `1.1.1`. A single version source is preferable, but changes must preserve Worker packaging constraints.
- `src/core/workspace-policy.js`: current limits are **20,000 Unicode code points**, **65,536 UTF-8 bytes**, **8 files**, **131,072 aggregate bytes**. The supplied booklet's 3,000/12,000 documentation mismatch requires locating the actual referenced documentation before modification.
- `src/workspace-editor.js`: current editor API authenticates Telegram initData on each request and is bound to one `ownerId`; migration to short-lived multi-user sessions needs new isolation tests and a compatibility path.
- `src/index.js`: public GET /health, /, /status; webhook requires secret and owner. Multi-user mode must not simply remove owner gating without server-side tenant authorization.
- `wrangler.jsonc`: existing five Durable Object bindings; no D1 binding or static-assets config. Migration requires staged bindings, schema and rollback plan.
- `.github/workflows/ci.yml` and `deploy.yml` exist; not yet verified in full in this audit.
- Phase 2 acceptance document reports real owner-device smoke and 266 tests on previous changes; these are **historical evidence**, not test results for this roadmap branch.

## Risks and next safe actions
1. **HIGH**: Multi-tenant permission and credential isolation is not implemented; do not invite other users yet.
2. **HIGH**: PAT onboarding requires a threat model, encryption/key rotation and no token logging before any credential is collected.
3. **HIGH**: Existing owner-only API and callback paths must be inventoried comprehensively before widening access.
4. **MEDIUM**: Cloudflare D1 and static assets are not provisioned in current configuration; stage schema/bindings and verify migration.
5. **MEDIUM**: Source/README/version drift and min/max editor limit claims require regression tests, not broad text replacements.
6. **MEDIUM**: Remote device command execution was unavailable due to Desktop Commander monthly usage cap. No local test run, video or build is claimed. GitHub API read and separate documentation branch were used as a safe alternative.

## Verification gates outstanding
- Full R-27 inventory, exact tests and red/green evidence, three independent actual reviewer reports, CI on implementation SHA, production staging smoke, iOS/Android proof, Iran access test and owner approval. None is asserted complete.
