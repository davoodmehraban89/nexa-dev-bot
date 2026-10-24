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

## Tool and quota diagnosis (follow-up)
- **Desktop Commander**: the connected Windows device remains paired, but its service explicitly returned: monthly Desktop Commander usage reached; remote commands paused. This is the *Desktop Commander service quota*, not a GitHub, Cloudflare, Node.js, Windows or project subscription failure. Its response explicitly says not to retry or reconnect.
- **No-cost substitute for remote terminal**: use GitHub repository read/write connector for controlled branch work; use local Node.js `node --test test/*.test.js` on an authorized local clone or an available isolated container after acquiring repository source; GitHub Actions CI only when runnable. Do not attempt to bypass Desktop Commander usage accounting.
- **GitHub Actions**: PR #62 run [40098803148](https://github.com/davoodmehraban89/nexa-dev-bot/actions/runs/40098803148), head `58ada82ed0e29aba02dfa0eb73d89ed9d8aaaf6b`, ended **failure** about four seconds after creation. Job `120886517292` reports failure with **zero returned steps**. The log download returned GitHub blob 404. Thus root cause is **not yet proven**; billing/minutes, runner provisioning, action restrictions and transient failure remain possibilities. Check GitHub Actions run annotations/billing settings from the owner account, not guess a cause. Do not claim tests ran or failed until step evidence exists.
- **Free CI alternatives**: run Node.js 22 tests locally from a verified clone, or a permitted free runner with private-repository access and no leaked credentials; capture exact SHA and logs. Public runners and public forks are inappropriate for private code/secrets. Keep GitHub Actions as optional verification when available, not a required paid upgrade.
- **Design tools**: Figma/Canva/MagicPath are optional; the product can be designed and built with open-source UI components and local design files without a paid tier. Independent reviewers cannot be invented; three manual review reports can be solicited without any agent subscription.
- **Safety**: no secrets copied to alternative providers; no private repository made public; no production change or merge until verification gates pass.

## GitHub Actions failure reproduction — 2026-10-24
- A second attempt was explicitly triggered via GitHub Actions rerun on CI run [40099289147](https://github.com/davoodmehraban89/nexa-dev-bot/actions/runs/40099289147). API returned success for the rerun request.
- Attempt **2** transitioned from queued to completed/failure within seconds; latest job `120888859813` returned **no steps**. Thus the failure reproduces **before test execution**, not an observed `npm test` failure.
- A previous CI run `40098803148` exhibited the same zero-step failure; deploy workflows triggered from these failed CI runs were skipped as designed. Earlier October 7 runs were successful, so this is a changed GitHub Actions execution environment/account state, not proof of bad source code.
- The Actions job-log endpoint returned a storage 404; no reliable root-cause message is available through the connected GitHub tools. A GitHub account administrator should inspect the workflow UI annotations, Actions billing/spending limit, account payment status, runner availability and repository Actions policies. **No paid upgrade is recommended without evidence.**
- Keep GitHub Actions CI workflow unchanged until a confirmed cause is available. Do not weaken checks, expose private code or trigger production deployment to bypass CI.
- Free fallback remains a verified local Node 22 test environment or a permitted free private runner, with captured logs and exact commit SHA. Desktop Commander is **permanently removed from the project's execution toolchain** per owner instruction, not retried at quota reset.
