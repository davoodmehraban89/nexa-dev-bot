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
- `src/bot.js` — Telegram update/callback router; callback acknowledgement is best-effort and cannot block menu rendering.
- `src/telegram.js` — Telegram Bot API client; explicit error propagation, fail-closed token handling and Cloudflare-safe default `fetch` invocation.
- `src/github.js` — authenticated GitHub REST reader; explicit errors, numeric repository-id resolution, tree/blob access.
- `src/menu.js` — hierarchical stateless inline menus, one-message editing, repository/file browser.
- `src/config.js` — non-secret static config.
- `.github/workflows/ci.yml` — Node 22 tests, official GitHub Actions v7 releases and non-zero test-discovery guard.
- `.github/workflows/deploy.yml` — production Cloudflare Worker deploy after successful CI on `main`; deploys the exact verified commit.
- `test/` — security, Worker, navigation, menu, GitHub and Telegram regression coverage.
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
- Production observability showed `POST /telegram/webhook` returning HTTP 400 with:
  `Telegram API sendMessage network failure: Illegal invocation: function called with incorrect this reference`.
- Root defect was in `src/telegram.js`: the platform-global `fetch` had been stored directly as an instance property and later called as `this.fetchFn(...)`, which supplied `TelegramClient` as the receiver. Cloudflare Workers rejects that receiver binding.
- Node unit tests had previously missed this platform-specific semantic difference.

### PR #11 — redacted runtime diagnostics
- Added regression-first diagnostics without exposing secrets.
- RED commit: `079f9b7977e1120d1bcdbbcd75d91e6a322e5a49`.
- Implementation commit: `2851c7045141aaeff501564d4a6bf8f22e333754`.
- PR CI run `37064293599` = 30/30 pass.
- Squash-merged to `main` at `cfd7a0b4803b13c76646b71666e7e0c66e023c99`.
- Post-merge CI `37064405261` and deploy `37064436885` succeeded.

### PR #12 — Cloudflare fetch receiver fix
- Added a regression test that reproduces Cloudflare-style illegal receiver invocation.
- RED commit: `99cf3468f820eb06390b7001c1d1eb5e5fb4ebbd`.
- Fix commit: `c487727c968e4f00aecf0985a38b152f58e3b9b4`.
- Fix: default transport now uses `(...args) => fetch(...args)` instead of storing bare platform `fetch`.
- PR CI `37064953868` = 31/31 pass.
- Squash-merged to `main` at `bd01d8ede44331f50e1115d569095fb12246331d`.
- Post-merge CI `37065054623` and deploy `37065141745` succeeded.
- Cloudflare telemetry after this deploy showed current-version Telegram webhook requests returning HTTP 200; the `Illegal invocation` errors existed only on the older Worker version.

### PR #13 — callback resilience + documentation alignment
- Added regression coverage requiring menu editing to continue even if `answerCallbackQuery` is stale/fails.
- RED commit: `13daeb442d6a2e1189a5cec2148aab9c2ea7c338`.
- Callback fix commit: `28e2e6b619c646796600048a34616138fbbc207c`.
- README alignment commit: `67b04e04214e334a88aea0ecdc4598bc5fbd027c`.
- PR CI `37065725004` = 32/32 pass.
- Squash-merged to `main` at `6c90cbb8384c9591ba89367b48e4ce7e785ce72f`.
- Post-merge CI `37065832210` succeeded.
- Post-merge deploy `37065860268` succeeded.
- Cloudflare latest deployment after PR #13: `13a5abdc-92a0-415f-b30b-ab422ae8b8ce`, version `812c52f7-f0b3-48bf-917c-151f4618dabd`, 100% traffic.
- Live Telegram webhook on this exact Worker version returned HTTP 200 with Worker outcome `ok`.
- Observability query found no new `telegram_webhook_error` on fixed/current versions; retained error events were from the old pre-fix version only.

## Current Work / Last Checkpoint
WHERE WE ARE:
- Full repository audit completed.
- The production `/start` failure root cause was identified, reproduced with a regression test, fixed, merged and deployed.
- Main CI and Cloudflare deploy are green.
- Latest production Worker receives Telegram webhook traffic successfully with HTTP 200.
- Callback navigation was additionally hardened against stale callback acknowledgements.
- README now matches the deployed stateless Worker architecture.

WHAT REMAINS:
1. Owner-device visual smoke: confirm the new main menu is visible after `/start`.
2. Exercise `Repositories → repository → Files → folder → file preview → root → project → Commits/PR/Status → Back → Main` and confirm the same Telegram message is edited throughout.
3. Optional non-owner smoke to confirm no private bot response.

## Acceptance Rules
A checkpoint is complete only after:
`IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED`
Minimum automated/runtime gates:
- Non-zero discovered test files.
- Security tests green.
- Navigation/bot/menu/index tests green.
- GitHub fail-closed/data-trust tests green.
- Telegram missing-token/API-error and Cloudflare fetch-receiver regression tests green.
- Production deploy workflow green.
- Cloudflare telemetry must show successful production webhook behavior before runtime is called verified.

## Known Gaps / Low-Priority Technical Debt
- Owner-device visual/interactive smoke remains the final UI acceptance gate.
- `package.json` still has `"start": "node src/index.js"`, which is not a useful local Cloudflare Worker development command; it does not affect production deployment.
- Extremely long path-based refresh callback data could theoretically approach Telegram's 64-byte callback-data limit; normal deep navigation uses SHA-based callbacks and is not affected by the incident fixed here.
- Persistent navigation/session storage is intentionally not required for the current stateless callback flow.

## Project Boundaries
- Nexa Dev Bot is independent from Finora / Factor-easy and has no Supabase requirement in this project.
- Do not mix state or migrations from other projects.
- Keep secrets out of code, logs and documentation.

## Important Paths
- `PROJECT_MEMORY.md`
- `README.md`
- `src/index.js`
- `src/bot.js`
- `src/menu.js`
- `src/telegram.js`
- `src/github.js`
- `src/config.js`
- `test/security.test.js`
- `test/navigation.test.js`
- `test/bot.test.js`
- `test/menu.test.js`
- `test/index.test.js`
- `test/github.test.js`
- `test/telegram.test.js`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `wrangler.jsonc`

## Next Executable Action
Run `/start` on the owner Telegram account. If the main menu renders, complete the one-message navigation smoke and record the result here.