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
- `.github/workflows/ci.yml` — Node 22 CI with non-zero test-discovery guard.
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

## Telegram UX
- `/start` creates the initial menu message.
- Callback navigation uses `editMessageText` on the same Telegram message.
- Main sections: Repositories, Status, Tools, Settings, Security.
- Repository sections: Files, Pull Requests, Commits, Actions status, Back.
- Back navigation and breadcrumb-style text exist.

## Deep File Browser — 2026-10-02
Branch/PR checkpoint:
- Branch: `feat/deep-file-browser`
- PR: `#8`
- Red test commit: `f5a1a75180344b306c000b3db580cd55c06abc67`
- Implementation head before this docs commit: `7a81ca8adf2594b2478b0c9d8f7d308ec6121ba8`
- PR CI run: `37055098355`
- Exact result: `29` tests, `29` passed, `0` failed, `0` skipped/cancelled.

Implemented:
- Repository menu callbacks now use numeric GitHub repository IDs returned by `/user/repos`.
- Numeric IDs keep callback payloads short and allow repositories outside the configured default owner to resolve correctly.
- Legacy name-based repository references remain supported.
- Folder navigation uses Git tree SHA callbacks: `tree:<repoId>:<sha>`.
- File preview uses Git blob SHA callbacks: `blob:<repoId>:<sha>`.
- Tree/blob SHA input is validated as 40-char hexadecimal.
- File/folder navigation remains in the same Telegram message.
- File previews are HTML-escaped; oversized/non-base64 blobs are not rendered directly.
- Directory views cap interactive entries at 30 and disclose omitted counts.
- Root/project return buttons are always provided.

TDD evidence:
- New tests were committed first and CI failed with 4 expected navigation failures (`29 total / 25 pass / 4 fail`).
- Implementation then changed `src/github.js` and `src/menu.js`.
- Re-run CI passed `29/29`.

## Current Work / Last Checkpoint
WHERE WE ARE:
- Deep interactive file/folder browsing is implemented and automated-test verified on PR #8.
- PR #8 still requires the final docs-triggered CI re-run and merge to `main`.
- Live Cloudflare verification remains blocked from the current execution environment by DNS resolution failure for the workers.dev hostname.
- Real Telegram mobile smoke is still NOT VERIFIED.

WHAT REMAINS:
1. Verify CI for this documentation commit and merge PR #8 into `main` only if green.
2. Verify post-merge CI on `main`.
3. Verify the live Cloudflare root/health/status endpoints from an environment that can resolve the workers.dev hostname.
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
- GitHub Actions emits a Node-20-runtime deprecation warning for `actions/checkout@v4` and `actions/setup-node@v4`; current CI still passes, but action upgrades should be handled in a separate verified slice.
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
Wait for the PR #8 CI run for this docs commit; if green, merge to `main`, verify `main` CI, then continue to live/mobile validation or the next independent hardening slice.
