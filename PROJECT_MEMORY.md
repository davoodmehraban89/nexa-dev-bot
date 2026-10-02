# PROJECT_MEMORY.md

## Project Identity
- Name: Nexa Dev Bot
- Repository: `davoodmehraban89/nexa-dev-bot`
- Canonical branch: `main`
- Visibility: private
- Purpose: owner-only Telegram developer console for GitHub visibility and controlled developer operations.
- This file is the continuity source of truth; live repository/runtime evidence overrides stale text.

## AI Handoff Protocol
1. Read this file before changes.
2. Verify repository head, recent commits, CI and relevant runtime evidence.
3. Prefer live evidence over chat memory.
4. Keep durable checkpoints documented here.
5. Never store secrets, tokens or private keys in the repository.

## Architecture
- `src/index.js` — Cloudflare Worker HTTP boundary; webhook secret, owner authorization, required Telegram transport checks and redacted runtime diagnostics.
- `src/bot.js` — Telegram update/callback coordinator; constructs the plugin kernel, keeps callback acknowledgement best-effort, routes GitHub operations through policy, and retains compatibility paths for non-GitHub menus.
- `src/core/plugin-registry.js` — validates plugin/action manifests and rejects duplicate IDs or invalid risk values.
- `src/core/action-policy.js` — central `READ` / `WRITE` / `DESTRUCTIVE` policy evaluation.
- `src/core/audit.js` — best-effort structured action audit with recursive secret redaction.
- `src/core/router.js` — policy-enforcing plugin router using the security-critical `resolve -> policy -> execute` flow.
- `src/plugins/github/manifest.js` — GitHub plugin capability/action declarations.
- `src/plugins/github/plugin.js` — GitHub plugin adapter around existing `GitHubService` and `MenuManager` behavior.
- `src/telegram.js` — Telegram Bot API client; explicit error propagation, fail-closed token handling and Cloudflare-safe default `fetch` invocation.
- `src/github.js` — authenticated GitHub REST reader; explicit errors, numeric repository-id resolution, tree/blob access.
- `src/menu.js` — hierarchical stateless inline menus, one-message editing, repository/file browser.
- `src/config.js` — non-secret static config.
- `.github/workflows/ci.yml` — Node 22 tests, official GitHub Actions v7 releases and non-zero test-discovery guard.
- `.github/workflows/deploy.yml` — production Cloudflare Worker deploy after successful CI on `main`; deploys the exact verified commit.
- `wrangler.jsonc` — Worker configuration; `keep_vars: true`, workers.dev enabled and observability enabled.

## Runtime Configuration
Worker runtime names:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_ID`
- `GITHUB_TOKEN`
- optional `GITHUB_OWNER`

GitHub Actions deployment secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Verified Security / Data Trust
- Webhook only at `POST /telegram/webhook`.
- Missing webhook secret, owner ID or bot token fails closed.
- Wrong Telegram secret returns 403.
- Non-owner updates are ignored before private-data access.
- GitHub token absence and GitHub API failures are explicit errors; no fabricated fallback data.
- Telegram network/API failures propagate; fake transport success is prohibited.
- Runtime diagnostic logs redact Telegram, webhook and GitHub secrets.
- Temporary setup/diagnostic exposure is disabled in source/tests.
- Operational UI does not invent SLA, latency or external health claims.
- Plugin manifests must declare action risk as `READ`, `WRITE`, or `DESTRUCTIVE`.
- Undeclared/unknown plugin actions are denied.
- `WRITE` and `DESTRUCTIVE` plugin actions are not executed before an approval flow exists.
- Plugin route resolvers must be side-effect-free; provider/view work is deferred to `execute()` after policy evaluation.

## Telegram UX / GitHub Reader
- `/start` creates the initial menu message.
- Callback navigation uses `editMessageText` on the same Telegram message.
- Callback acknowledgement failure/staleness no longer blocks in-place navigation.
- Main sections: Repositories, Status, Tools, Settings, Security.
- Repository sections: Files, Pull Requests, Commits, Actions status, Back.
- Back navigation and breadcrumb-style text exist.
- Repository callbacks use numeric GitHub repository IDs.
- Folder navigation uses `tree:<repoId>:<sha>` and file previews use `blob:<repoId>:<sha>`.
- Tree/blob SHA input is validated.
- File previews are HTML-escaped and bounded; oversized/non-base64 blobs are not rendered directly.
- Directory interactive entries are capped at 30 and omitted counts are disclosed.

## Production Deploy Automation — Verified 2026-10-02
- PR `#10` added `.github/workflows/deploy.yml` and merged to `main` at `c86b86ec8f5678b9223b7bcb6a73e0377116e670`.
- GitHub repository secrets for Cloudflare deployment are configured.
- Re-run of deployment workflow `37057406559` passed credential preflight and deployed successfully.
- Automatic deploy now runs after successful `main` CI and uses the exact verified commit.

## Full Repository Audit + Telegram Runtime Incident — Verified 2026-10-02
Audit scope covered the full recursive repository tree, including workflows, Worker config, all `src/` modules, all tests, README/project memory and package metadata.

### Root cause
- Telegram requests were reaching the production Worker, so webhook registration, secret header and owner gate were not the blocker.
- Production observability showed `POST /telegram/webhook` returning HTTP 400 with `Telegram API sendMessage network failure: Illegal invocation: function called with incorrect this reference`.
- Root defect was in `src/telegram.js`: the platform-global `fetch` had been stored directly as an instance property and later called with the wrong receiver.
- Node unit tests had previously missed this platform-specific semantic difference.

### PR #11 — redacted runtime diagnostics
- RED commit `079f9b7977e1120d1bcdbbcd75d91e6a322e5a49`.
- Implementation commit `2851c7045141aaeff501564d4a6bf8f22e333754`.
- PR CI `37064293599` = 30/30 pass.
- Squash merge `cfd7a0b4803b13c76646b71666e7e0c66e023c99`.
- Post-merge CI `37064405261` and deploy `37064436885` succeeded.

### PR #12 — Cloudflare fetch receiver fix
- RED commit `99cf3468f820eb06390b7001c1d1eb5e5fb4ebbd`.
- Fix commit `c487727c968e4f00aecf0985a38b152f58e3b9b4`.
- Default transport now uses `(...args) => fetch(...args)` instead of storing bare platform `fetch`.
- PR CI `37064953868` = 31/31 pass.
- Squash merge `bd01d8ede44331f50e1115d569095fb12246331d`.
- Post-merge CI `37065054623` and deploy `37065141745` succeeded.
- Cloudflare telemetry showed current-version Telegram webhook requests returning HTTP 200; `Illegal invocation` existed only on the older Worker version.

### PR #13 — callback resilience + documentation alignment
- RED commit `13daeb442d6a2e1189a5cec2148aab9c2ea7c338`.
- Callback fix commit `28e2e6b619c646796600048a34616138fbbc207c`.
- README alignment commit `67b04e04214e334a88aea0ecdc4598bc5fbd027c`.
- PR CI `37065725004` = 32/32 pass.
- Squash merge `6c90cbb8384c9591ba89367b48e4ce7e785ce72f`.
- Post-merge CI `37065832210` and deploy `37065860268` succeeded.
- Cloudflare deployment `13a5abdc-92a0-415f-b30b-ab422ae8b8ce`, version `812c52f7-f0b3-48bf-917c-151f4618dabd`, served 100% traffic.
- Live Telegram webhook on that Worker version returned HTTP 200 / outcome `ok`.

## Plugin Foundation v1 — Implementation Checkpoint 2026-10-03

### Approved design and plan
- Design: `docs/superpowers/specs/2026-10-03-nexa-plugin-foundation-design.md`.
- Design commit on `main`: `adabadefd74de656b20d112c325be4defcbf2103`.
- Plan: `docs/superpowers/plans/2026-10-03-nexa-plugin-foundation.md`.
- Initial plan commit on `main`: `5f9a1991dbc3a1e79f5c04dfbe591c4d35e74a97`.
- Feature branch: `feat/plugin-foundation-v1`.
- PR: `#14`.

### Architecture implemented on PR #14
- Plugin Registry with manifest/action validation.
- Central Action Policy with owner READ allow and WRITE/DESTRUCTIVE approval-required decisions.
- Recursive-redaction Audit Logger.
- Plugin Router enforcing `resolve -> policy -> execute`.
- GitHub manifest and plugin adapter.
- `/repos` and GitHub callbacks migrated through the plugin kernel.
- `/start`, `/status`, tools/settings/security and other non-GitHub menu flows remain compatibility routes in Foundation v1.

### Security-critical design correction during implementation
The initial plan described a handler returning an already-produced view/result. TDD review identified that this could allow provider/view work before policy. The implemented contract is safer: route resolution returns `{ actionId, execute }`; resolution must be side-effect-free, policy is evaluated next, and only then may `execute()` run. Tests prove denied, undeclared, WRITE and DESTRUCTIVE actions do not call `execute()`.

### TDD evidence
- Registry RED `2460b0854f6dbd99a80cfb9561850fdd23f1ac0e` / CI `37069219176`; GREEN `3f644caef41a9136cb5f0a78b0c66798238a257d` / CI `37069339637`.
- Policy RED `77efe66f008fcb417b0b66f22b186885d3fecdd3` / CI `37069430240`; GREEN `cbdba6b1b70342d6325d229cec1725c05862a537` / CI `37069629741`.
- Audit RED `a6f9735185f7a0ce45fe744b9a13b1fa3d885681` / CI `37069736330`; GREEN `92dfcba318f5199e6c9e54da5fbba91a15122ca3` / CI `37069824796`.
- Router RED `4e3fca87139310c24c3c83a5181fc638f887882d` / CI `37069955642`; GREEN `00fcd1041e2f8074dc34727635395896eace0cba` / CI `37070015843`.
- GitHub adapter RED `ae6829729779c2f656e99958a379c805eb1bebc4` / CI `37070181121`; GREEN adapter head `c9aed93bc1a3bd8ac047a3639722633bcd9c624e` / CI `37070481981`.
- Bot migration RED `f1ee926320dc918d0d0c8b21d60710077a9d119b` / CI `37070633843`; GREEN integration `d628a4ed0b07dfa4c748b6161515565b1eef3073` / CI `37070778956`.
- CI `37070778956` inspected in full: 12 test files discovered; 52 tests, 52 pass, 0 fail, 0 skipped/cancelled/todo.

### Current verification state
VERIFIED on PR merge result:
- Plugin registry validation.
- READ/WRITE/DESTRUCTIVE policy semantics.
- Recursive audit redaction and non-breaking sink failure.
- Undeclared and approval-required actions do not execute provider code.
- GitHub callback/command ownership mapping.
- Existing `/start`, same-message navigation, stale callback handling, security gates, GitHub fail-closed behavior and Cloudflare fetch-receiver regression remain green.

NOT YET VERIFIED for Foundation v1:
- Final documentation-head PR CI after this checkpoint commit.
- Merge of PR #14 to `main`.
- Post-merge `main` CI.
- Cloudflare deployment of the merged Foundation revision.
- Production Telegram webhook telemetry on that new Worker version.
- Owner-device visual/interactive smoke after Foundation deploy.

## Current Work / Last Checkpoint
WHERE WE ARE:
- Foundation v1 implementation is on PR #14 and has passed the full automated suite on the pre-documentation head.
- Final documentation alignment is being committed before merge.
- Production is still the previously verified pre-Foundation version until PR #14 is merged and deploy succeeds.

WHAT REMAINS:
1. Verify final PR #14 CI after documentation changes.
2. Mark PR ready and merge after green CI/scope review.
3. Verify post-merge main CI and Cloudflare deploy.
4. Verify current-version Telegram webhook telemetry.
5. Record owner-device smoke for the Foundation build.

## Acceptance Rules
A checkpoint is complete only after `IMPLEMENTED -> VERIFIED -> FIXED IF NEEDED -> RE-VERIFIED`.
Minimum automated/runtime gates:
- Non-zero discovered test files.
- Security tests green.
- Navigation/bot/menu/index tests green.
- Plugin registry/policy/audit/router tests green.
- GitHub plugin/fail-closed/data-trust tests green.
- Telegram missing-token/API-error and Cloudflare fetch-receiver regression tests green.
- Production deploy workflow green.
- Cloudflare telemetry must show successful production webhook behavior before runtime is called verified.

## Known Gaps / Low-Priority Technical Debt
- Post-Foundation owner-device visual/interactive smoke remains a final UI acceptance gate.
- `package.json` still has `"start": "node src/index.js"`, which is not a useful local Cloudflare Worker development command; it does not affect production deployment.
- Extremely long path-based refresh callback data could theoretically approach Telegram's 64-byte callback-data limit; normal deep navigation uses SHA-based callbacks.
- Persistent navigation/session storage is intentionally not required for the current stateless callback flow.
- Foundation v1 establishes approval-required policy results but intentionally does not implement the Telegram confirmation UX; that belongs to the first write-capable plugin phase.

## Project Boundaries
- Nexa Dev Bot is independent from Finora / Factor-easy and has no Supabase requirement in this project.
- Do not mix state or migrations from other projects.
- Keep secrets out of code, logs and documentation.

## Important Paths
- `PROJECT_MEMORY.md`
- `README.md`
- `docs/superpowers/specs/2026-10-03-nexa-plugin-foundation-design.md`
- `docs/superpowers/plans/2026-10-03-nexa-plugin-foundation.md`
- `src/index.js`
- `src/bot.js`
- `src/core/plugin-registry.js`
- `src/core/action-policy.js`
- `src/core/audit.js`
- `src/core/router.js`
- `src/plugins/github/manifest.js`
- `src/plugins/github/plugin.js`
- `src/menu.js`
- `src/telegram.js`
- `src/github.js`
- `test/plugin-registry.test.js`
- `test/action-policy.test.js`
- `test/audit.test.js`
- `test/plugin-router.test.js`
- `test/github-plugin.test.js`
- `test/security.test.js`
- `test/navigation.test.js`
- `test/bot.test.js`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `wrangler.jsonc`

## Next Executable Action
Verify final PR #14 CI after documentation commits; if green, perform final scope/secret review, mark ready, merge, verify main CI/deploy, then verify production telemetry and owner-device smoke.
