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
- `src/index.js` — Cloudflare Worker HTTP boundary; webhook secret, owner authorization and required Telegram transport checks.
- `src/bot.js` — Telegram update/callback router.
- `src/telegram.js` — Telegram Bot API client; explicit error propagation and fail-closed token handling.
- `src/github.js` — authenticated GitHub REST reader; explicit errors, numeric repository-id resolution, tree/blob access.
- `src/menu.js` — hierarchical inline menus, one-message editing, repository/file browser.
- `src/config.js` — non-secret static config.
- `.github/workflows/ci.yml` — Node 22 project test runtime, official GitHub Actions on Node-24-based v7 releases, non-zero test-discovery guard.
- `.github/workflows/deploy.yml` — production Cloudflare Worker deploy after successful CI on `main`; deploys the exact verified commit.
- `test/` — security, worker, navigation, menu, GitHub and Telegram regression coverage.

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
- Temporary setup/diagnostic exposure is disabled in source/tests.
- Operational UI does not invent SLA, latency or external health claims.

## Telegram UX / GitHub Reader
- `/start` creates the initial menu message.
- Callback navigation uses `editMessageText` on the same Telegram message.
- Main sections: Repositories, Status, Tools, Settings, Security.
- Repository sections: Files, Pull Requests, Commits, Actions status, Back.
- Back navigation and breadcrumb-style text exist.
- Repository callbacks use numeric GitHub repository IDs.
- Folder navigation uses `tree:<repoId>:<sha>` and file previews use `blob:<repoId>:<sha>`.
- Tree/blob SHA input is validated.
- File previews are HTML-escaped and bounded; oversized/non-base64 blobs are not rendered directly.
- Directory interactive entries are capped at 30 and omitted counts are disclosed.

## Deep File Browser — Verified/Merged 2026-10-02
- PR `#8` merged to `main` at commit `b2a2b61ffb92dc14508e16a19c6221a805445c76`.
- Regression-first RED evidence: 29 tests / 25 pass / 4 expected fail before implementation.
- PR green CI: run `37055283770` = 29/29 pass.
- Post-merge `main` CI: run `37055466988` = 29/29 pass.
- Deep folder/file browsing remains single-message navigation.

## GitHub Actions Runtime Upgrade — Verified/Merged 2026-10-02
- PR `#9` merged to `main` at commit `7574fb1a373c3ab7b81f3f6857452059287cd44e`.
- `actions/checkout` upgraded from v4 to v7.
- `actions/setup-node` upgraded from v4 to v7.
- Project test runtime remains Node 22.
- `package-manager-cache: false` preserves prior no-cache behavior.
- PR code CI run `37055691513` = 29/29 pass.
- PR documentation-head CI run `37055861886` = 29/29 pass.
- Post-merge `main` CI run `37056086860` = 29/29 pass.
- The prior GitHub Actions Node-20-runtime deprecation warning is absent from the verified PR and post-merge runs.

## Production Deploy Automation — Verified 2026-10-02
- Real Telegram screenshot first exposed a stale/unresponsive production Worker relative to current source.
- Root cause in repository: CI had no Cloudflare deploy step, so green/merged `main` did not guarantee Worker deployment.
- PR `#10` added `.github/workflows/deploy.yml` and was fast-forwarded to `main` at commit `c86b86ec8f5678b9223b7bcb6a73e0377116e670`.
- PR CI run `37057306685` passed.
- Post-merge `main` CI run `37057386587` passed.
- Initial deployment workflow run `37057406559` failed before deploy because GitHub Actions Cloudflare credentials were absent.
- Repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were then configured by the owner.
- Failed jobs for workflow run `37057406559` were re-run; credential preflight passed and the Cloudflare deploy step completed successfully.
- Cloudflare API verification after the successful deploy shows latest deployment `b2f47b95-277f-423b-aab5-1d7020e60501`, created `2026-10-02T20:45:26.729642Z`.
- Latest active Worker version is `51`, version id `dc70c38f-d84e-40f5-8db1-8ae909dae6d7`, receiving 100% of traffic.
- Worker subdomain remains enabled. Direct public HTTP probing of the workers.dev hostname from the assistant web environment is unavailable, so Telegram/mobile smoke remains the final runtime acceptance gate.

## Current Work / Last Checkpoint
WHERE WE ARE:
- Source, tests, security gates, one-message navigation, deep file browsing and CI are green on `main`.
- Production deploy automation exists and has successfully deployed through GitHub Actions using repository secrets.
- Cloudflare confirms Worker version 51 is active at 100% traffic.
- Real Telegram mobile smoke after this successful deployment is still NOT VERIFIED.

WHAT REMAINS:
1. Repeat owner-device Telegram smoke on the freshly deployed Worker: `/start → Repositories → repository → Files → folder → file preview → root → project → Commits/PR/Status → Back → Main`.
2. Confirm callbacks edit the same Telegram message and create no extra bot-message flood.
3. Confirm `/start` returns the new main menu instead of the stale repository-button view.
4. Confirm a non-owner Telegram account receives no private bot response.
5. If desired later, tighten the Cloudflare CI token scope from the official `Edit Cloudflare Workers` template to a least-privilege Worker-scoped token.

## Acceptance Rules
A checkpoint is complete only after:
`IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED`
Minimum automated gates:
- Non-zero discovered test files.
- Security tests green.
- Navigation/bot/menu/index tests green.
- GitHub fail-closed/data-trust tests green.
- Telegram missing-token/API-error tests green.
- Production deploy workflow green before live behavior is called verified.

## Known Gaps / Technical Debt
- Real mobile Telegram smoke must be repeated after successful production deploy.
- Direct workers.dev health probing is unavailable from the current assistant web environment; Cloudflare control-plane deployment state is verified instead.
- Persistent navigation/session storage is not required for the current stateless callback flow.

## Project Boundaries
- Nexa Dev Bot is independent from Finora / Factor-easy and has no Supabase requirement in this project.
- Do not mix state or migrations from other projects.
- Keep secrets out of code, logs and documentation.

## Important Paths
- `PROJECT_MEMORY.md`
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
Run `/start` on the owner Telegram account and complete the mobile navigation smoke against the freshly deployed Worker version 51.