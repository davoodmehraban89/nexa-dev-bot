# PROJECT_MEMORY.md

## Project Identity
- Name: Nexa Dev Bot
- Repository: `davoodmehraban89/nexa-dev-bot`
- Canonical branch: `main`
- Visibility: private
- Purpose: personal, owner-only Telegram developer console for GitHub repository visibility and controlled developer operations.
- This file is the Single Source of Truth for AI continuity. Repository/runtime evidence overrides stale text here.

## AI HANDOFF PROTOCOL
1. Read this file completely before making changes.
2. Verify the real repository head, recent commits, CI, source and runtime evidence.
3. Prefer repository/runtime evidence over previous chat claims or stale memory.
4. If this file is stale, repair it before implementation.
5. Continue from `Current Work / Last Checkpoint`.
6. After each durable checkpoint, update this file with evidence and remaining work.
7. Never store passwords, tokens, API secrets, webhook secrets or private keys here.

## Product Vision
Build a secure, professional, mobile-first Telegram control surface for GitHub projects with hierarchical navigation, minimal chat clutter, trustworthy live data, auditability and later developer automation.

## Repository / Workspace
- Repository: `davoodmehraban89/nexa-dev-bot`
- Default branch: `main`
- Connected GitHub integration has repository read/write access.
- Former branch `feat/telegram-main-inline-menu` is stale and is not the implementation baseline.
- Current implementation baseline is `main`.
- Latest code checkpoint before this memory-only commit: `e3fb9e9e34e4fa01e6aa24aded01d00c22680a51`.
- Hardening PR: `#7` merged into `main` on 2026-10-02.

## Architecture
Current source layout:
- `src/index.js` — Cloudflare Worker HTTP boundary, webhook authentication, owner authorization and required Telegram transport configuration checks.
- `src/bot.js` — Telegram update router and callback handling.
- `src/telegram.js` — Telegram Bot API client with explicit fail-closed behavior and API error propagation.
- `src/github.js` — authenticated GitHub REST reader; fails explicitly instead of returning fabricated fallback data.
- `src/menu.js` — hierarchical inline-menu renderer and callback router.
- `src/config.js` — minimal non-secret static configuration.
- `.github/workflows/ci.yml` — Node.js CI with explicit zero-test discovery guard.
- `test/` — security, navigation, bot, menu, worker, GitHub and Telegram client regression tests.

## Technology Stack
- JavaScript ES modules
- Node.js 22 test runner
- Telegram Bot API
- GitHub REST API
- Cloudflare Workers / Wrangler
- GitHub Actions

## Environments & Integrations
Repository-verified:
- Cloudflare Worker configuration exists in `wrangler.jsonc` with `src/index.js` as entrypoint.
- Telegram Bot API integration exists.
- GitHub API integration exists.
- CI workflow exists.
Runtime configuration required by code:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_ID`
- `GITHUB_TOKEN`
- optional `GITHUB_OWNER`
Secret values must never be committed to this file or the repository.

## Current Production State
- Source and automated CI state are verified as described below.
- Live Cloudflare deployment contents after the latest hardening: **NOT VERIFIED IN THIS CHECKPOINT**.
- Live Telegram mobile behavior after the latest hardening: **NOT VERIFIED IN THIS CHECKPOINT**.

## Completed Work — Verified
### Telegram UX
- Hierarchical Inline Keyboard navigation exists.
- `/start` creates the initial menu message.
- Callback navigation uses `editMessageText` on the same message.
- Main menu sections: Repositories, Status, Tools, Settings, Security.
- Repository submenu: Files, Pull Requests, Commits, Status/Tests, Back.
- Explicit Back navigation and breadcrumb-style path text are present.

### Security boundary
Implemented and automated-test verified:
- Telegram webhook processing is restricted to `POST /telegram/webhook`.
- Missing `TELEGRAM_WEBHOOK_SECRET` fails closed with 503.
- Wrong `X-Telegram-Bot-Api-Secret-Token` is rejected with 403.
- Missing `OWNER_TELEGRAM_ID` fails closed.
- Message and callback senders must match `OWNER_TELEGRAM_ID`.
- Unauthorized senders are ignored without private-data access.
- Missing `TELEGRAM_BOT_TOKEN` now fails closed with 503 at the webhook boundary.
- `TelegramClient` itself also throws if `TELEGRAM_BOT_TOKEN` is missing, preventing fake transport success.
- Temporary setup and diagnostic behavior remains disabled.

### Data trust
- `src/github.js` no longer returns sample/default operational data when GitHub fails.
- Missing `GITHUB_TOKEN` is an explicit error.
- GitHub HTTP failures are surfaced as errors.
- Repository discovery uses authenticated `/user/repos`.
- Repository detail, PRs, commits, files and workflow status are source-backed.
- Hard-coded service health, `100% SLA`, fixed latency and fake security/token status claims were removed.
- GitHub-derived menu content is HTML-escaped before Telegram HTML rendering.

### Telegram API correctness
- `TelegramClient` throws for missing bot token, network errors, HTTP-level Telegram API failures and Telegram `{ok:false}` responses.
- `message is not modified` can be handled deliberately by the callback layer rather than silently treated as success.

### CI integrity
- Test discovery corrected from `tests/*.test.js` to `test/*.test.js`.
- CI now has an explicit `Verify test discovery` step that fails if no `test/*.test.js` files exist.
- The guard currently discovers exactly 7 test files.
- TDD RED evidence was observed during the missing-token hardening: first the worker returned 400 where the new test required 503; the implementation was then corrected.
- Fresh GREEN evidence on merged `main`: GitHub Actions run `37053715526`, commit `e3fb9e9e34e4fa01e6aa24aded01d00c22680a51`.
- Exact result: `28` tests, `28` passed, `0` failed, `0` skipped/cancelled.

## Current Work / Last Checkpoint
WHERE WE WERE:
- The menu redesign and earlier security/data-trust repairs were present, but two hardening gaps remained: CI could theoretically regress to zero discovered tests, and a missing Telegram bot token could still be represented as a fake successful transport call.

WHAT CHANGED:
- Added CI zero-test discovery guard.
- Added regression test requiring `TelegramClient` to fail closed without `TELEGRAM_BOT_TOKEN`.
- Removed mock success behavior from `TelegramClient`.
- Added Worker-level required-token check returning 503 before Telegram update processing.
- Updated worker tests to use a mocked Telegram transport only for the authorized test path.
- PR `#7` merged into `main`.
- Post-merge CI run `37053715526` passed 28/28 tests.

WHERE WE ARE NOW:
- Repository-level security, transport integrity, data-trust and navigation gates are green.
- `main` contains the hardening changes.
- Live deployment/runtime and real-phone Telegram smoke remain the outstanding verification boundary.

WHAT REMAINS:
1. Verify the live Cloudflare root/health endpoint is serving current code.
2. Verify the live webhook rejects missing/wrong secrets and missing required runtime configuration as expected.
3. On the real Telegram owner account, smoke-test: `/start → Repositories → repository → Files/Commits/PR/Status → Back → Main`.
4. Confirm callback navigation edits the same menu message and does not create message spam.
5. Confirm a non-owner Telegram account receives no bot response.
6. Decide separately whether to keep Inline Keyboard as the final UX or later add a persistent Reply Keyboard shell; not required for current in-place navigation.

## Master Roadmap
Phase 1 — Secure Telegram navigation core: **IMPLEMENTED + AUTOMATED-VERIFIED; LIVE MOBILE VERIFICATION PENDING**.
Phase 2 — Trustworthy GitHub repository browsing/status: **IMPLEMENTED + AUTOMATED-VERIFIED; LIVE TOKEN/RUNTIME SMOKE PENDING**.
Phase 3 — Developer tools and controlled write operations: planned.
Phase 4 — Security hardening, auditability and observability: ongoing after live verification.
Phase 5 — Mobile QA, release validation and documentation: current next checkpoint.

## Requirements
- Owner-only personal bot.
- Fail closed if webhook authentication, owner configuration or Telegram transport configuration is absent/wrong.
- No secret values committed to repository.
- No fabricated operational success/status.
- Minimal chat spam.
- Hierarchical navigation with reliable Back behavior.
- Preserve GitHub Reader functionality.
- Mobile-first Telegram usability.
- Completion claims require implemented + tested + re-verified evidence.

## User Decisions
- Nexa Dev Bot is independent from Finora / Factor-easy application development; do not mix project state or Supabase requirements from those projects into this repository.
- Canonical repository: `davoodmehraban89/nexa-dev-bot`.
- Professional layered menus are desired.
- User prefers execution over explanatory chat.
- Before saying a task is complete, verify from Execution, Architecture/Quality and QA/User perspectives.

## Architecture Decisions
- `PROJECT_MEMORY.md` is the canonical continuity file.
- Keep the modular source architecture; do not revert to the old monolithic Worker implementation.
- Security enforcement belongs at the Worker/update boundary.
- External integration failures must be explicit rather than replaced with plausible mock data.
- Callback navigation edits the current Telegram message rather than sending a new message.
- Runtime client abstractions must fail closed when required credentials are missing; test doubles belong in tests, not production semantics.

## Data Model
No persistent application database is required or verified for the current read-only GitHub/menu scope.

## Security Rules
- Never commit Telegram token, GitHub token, webhook secret or private keys.
- Validate webhook secret before processing Telegram updates.
- Enforce `OWNER_TELEGRAM_ID` for messages and callbacks.
- Require `TELEGRAM_BOT_TOKEN` before processing owner updates.
- Unauthorized callers must not receive private repository data.
- Do not reintroduce temporary diagnostic/setup endpoints without a bounded need and explicit cleanup.
- Do not display secret values or infer that a token is valid from static configuration text.

## Testing & Acceptance Criteria
A checkpoint is complete only after:
`IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED`
Automated minimum gates:
- CI discovers at least one test file and fails if it discovers zero.
- Security tests pass.
- Navigation/bot/menu/index tests pass.
- GitHub fail-closed/data-trust tests pass.
- Telegram missing-token/API-error propagation tests pass.
Current automated evidence: run `37053715526` = 28 pass / 0 fail.
Final release gate still required:
- live Cloudflare smoke;
- real Telegram mobile smoke of complete menu/back flow.

## Known Issues / Remaining Gaps
- Live Cloudflare deployment after the latest hardening is not yet verified here.
- Real Telegram mobile smoke after the latest hardening is not yet verified.
- Current files view is source-backed but deep interactive folder/file browsing remains limited in the modular UI.
- Service Status intentionally avoids claiming external uptime/latency without measured telemetry.
- GitHub Actions currently reports a deprecation warning for actions using Node 20 internals; builds still pass under the current runner.

## Risks
- If Cloudflare has not deployed current `main`, runtime may differ from repository state.
- Missing runtime secrets now intentionally cause fail-closed behavior and service errors rather than silent fake success.
- Future GitHub write operations require explicit permission scoping and stronger audit/confirmation rules than current read-only flows.

## Technical Debt
- Verify and document production deployment/runtime state.
- Add deeper interactive folder navigation if required.
- Consider durable navigation/session storage only if future flows require cross-message/session state.
- Track GitHub Actions runtime deprecation warnings and upgrade actions when appropriate.

## Deployment / Release State
- GitHub `main` code checkpoint: `e3fb9e9e34e4fa01e6aa24aded01d00c22680a51`.
- Hardening PR `#7`: merged.
- GitHub Actions post-merge run: `37053715526` = 28/28 passing.
- Cloudflare live deployment: NOT VERIFIED in this checkpoint.
- Telegram live/mobile: NOT VERIFIED in this checkpoint.

## Important File Paths
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

## Reference Assets
No canonical Nexa Dev UI image asset is currently stored under `docs/project-memory/assets/`.
Status: Missing Asset.

## Change Log
- 2026-10-02: Initial continuity memory created.
- 2026-10-02: Reconciled modular redesign and recorded false-green CI/security/data-trust regressions.
- 2026-10-02: Repaired test discovery, webhook/owner security, GitHub fail-closed behavior, non-fabricated status screens and Telegram API error handling.
- 2026-10-02: Hardening PR #7 added zero-test CI guard and fail-closed Telegram token handling; merged to `main`; post-merge CI `37053715526` passed 28/28.

## Next Executable Action
Verify the live Cloudflare deployment against current `main`, then run the final owner-device Telegram smoke flow. Do not change the architecture unless live evidence exposes a defect.
