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
- `.github/workflows/ci.yml` — Node 22 project test runtime, Node-24-based official GitHub Actions, non-zero test-discovery guard.
- `test/` — security, worker, navigation, menu, GitHub and Telegram regression coverage.

## Runtime Configuration
Required names:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_ID`
- `GITHUB_TOKEN`
- optional `GITHUB_OWNER`

## Verified Security / Data Trust
- Webhook only at `POST /telegram/webhook`.
- Missing webhook secret, owner ID or bot token fails closed.
- Wrong Telegram secret returns 403.
- Non-owner updates are ignored before private-data access.
- GitHub token absence and GitHub API failures are explicit errors; no fabricated fallback data.
- Telegram network/API failures propagate; fake transport success is prohibited.
- Temporary setup/diagnostic exposure is disabled.
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

## GitHub Actions Runtime Upgrade — Current Slice
- Branch: `chore/actions-node24-runtime`
- PR: `#9`
- Change commit: `a04b7230afc75262d3c15ab9b7f2f9a79179d6d3`.
- `actions/checkout` upgraded from v4 to v7.
- `actions/setup-node` upgraded from v4 to v7.
- Project test Node version remains 22.
- `package-manager-cache: false` is explicit to preserve prior no-cache CI behavior.
- PR CI run `37055691513` passed 29/29 tests.
- The prior GitHub Actions Node-20-runtime deprecation warning is absent from this green run.
- This documentation commit must receive its own green CI before PR #9 is merged.

## Current Work / Last Checkpoint
WHERE WE ARE:
- Security, data trust, one-message navigation and deep repository file browsing are implemented and automated-verified on `main`.
- PR #9 contains the verified official GitHub Actions runtime upgrade.
- Live Cloudflare verification is still blocked from the current execution environment by DNS resolution failure for the workers.dev hostname.
- Real Telegram mobile smoke is NOT VERIFIED.

WHAT REMAINS:
1. Verify CI for this PROJECT_MEMORY commit on PR #9; merge only if green.
2. Verify post-merge CI on `main`.
3. Verify live Cloudflare root/health/status endpoints from an environment that can resolve workers.dev.
4. Owner-device Telegram smoke: `/start → Repositories → repository → Files → folder → file preview → root → project → Commits/PR/Status → Back → Main`.
5. Confirm callbacks create no extra bot messages.
6. Confirm a non-owner Telegram account receives no private bot response.

## Acceptance Rules
A checkpoint is complete only after:
`IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED`
Minimum automated gates:
- Non-zero discovered test files.
- Security tests green.
- Navigation/bot/menu/index tests green.
- GitHub fail-closed/data-trust tests green.
- Telegram missing-token/API-error tests green.

## Known Gaps / Technical Debt
- Live Cloudflare deployment content is not verified in this environment.
- Real mobile Telegram smoke is not verified yet.
- Persistent navigation/session storage is not required for current stateless callback flow.

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
- `wrangler.jsonc`

## Next Executable Action
Verify PR #9 CI for this docs commit; if green, fast-forward `main`, verify PR merged state and post-merge `main` CI, then continue to the remaining live/mobile verification boundary.
