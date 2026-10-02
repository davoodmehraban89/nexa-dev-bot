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
- The former branch `feat/telegram-main-inline-menu` is stale and is not the implementation baseline.
- Current implementation baseline is `main`.

## Architecture
Current source layout:
- `src/index.js` — Cloudflare Worker HTTP boundary, webhook authentication and owner authorization.
- `src/bot.js` — Telegram update router and callback handling.
- `src/telegram.js` — Telegram Bot API client with explicit error propagation.
- `src/github.js` — authenticated GitHub REST reader; fails explicitly instead of returning fabricated fallback data.
- `src/menu.js` — hierarchical inline-menu renderer and callback router.
- `src/config.js` — minimal non-secret static configuration.
- `.github/workflows/ci.yml` — Node.js CI.
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
Runtime configuration names required by the code:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_ID`
- `GITHUB_TOKEN`
- optional `GITHUB_OWNER`
Secret values must never be committed to this file or the repository.

## Current Production State
- Source and automated CI state are verified as described below.
- Live Cloudflare deployment contents after the latest security/quality repair: **NOT YET VERIFIED IN THIS CHECKPOINT**.
- Live Telegram mobile behavior after the latest repair: **NOT YET VERIFIED IN THIS CHECKPOINT**.

## Completed Work — Verified
### Telegram UX
- Hierarchical Inline Keyboard navigation exists.
- `/start` creates the initial menu message.
- Callback navigation uses `editMessageText` on the same message.
- Main menu sections: Repositories, Status, Tools, Settings, Security.
- Repository submenu: Files, Pull Requests, Commits, Status/Tests, Back.
- Explicit Back navigation is present.
- Breadcrumb-style path text is present.

### Security boundary
Implemented and test-verified in `src/index.js`:
- Telegram webhook processing is restricted to `POST /telegram/webhook`.
- Missing `TELEGRAM_WEBHOOK_SECRET` fails closed with 503.
- Wrong `X-Telegram-Bot-Api-Secret-Token` is rejected with 403.
- Missing `OWNER_TELEGRAM_ID` fails closed.
- Message and callback senders must match `OWNER_TELEGRAM_ID`.
- Unauthorized senders are ignored without Telegram/GitHub network calls.
- Temporary `/telegram/setup` route remains disabled.
- Temporary diagnostic behavior does not expose Telegram ID/authorization details.

### Data trust
- `src/github.js` no longer returns sample/default operational data when GitHub fails.
- Missing `GITHUB_TOKEN` is an explicit error.
- GitHub HTTP failures are surfaced as errors.
- Repository discovery uses the authenticated `/user/repos` endpoint so private accessible repositories can be returned.
- Repository detail uses live repository metadata.
- PRs, commits, files and GitHub Actions status are source-backed.
- Hard-coded service health, `100% SLA`, fixed latency and fake security/token status claims were removed.
- GitHub-derived menu content is HTML-escaped before Telegram HTML rendering.

### Telegram API correctness
- `TelegramClient` now throws for network errors, HTTP-level Telegram API failures and Telegram `{ok:false}` responses.
- `message is not modified` can therefore be handled deliberately by the bot callback layer rather than silently treated as success.

### CI
- Test discovery corrected from the wrong `tests/*.test.js` path to `test/*.test.js`.
- TDD RED evidence was captured after enabling the real suite and during Telegram error-propagation work.
- Fresh GREEN evidence: GitHub Actions run `37050047446`, commit `40e31294950ba6e3d85744728476e81cc239fbe9`.
- Exact result: `26` tests, `26` passed, `0` failed, `0` skipped/cancelled.

## Current Work / Last Checkpoint
WHERE WE WERE:
- A modular menu redesign had been uploaded to `main`, but CI ran zero tests, webhook/owner security had regressed, GitHub failures could silently turn into fake data, and status screens contained fabricated operational claims.

WHAT CHANGED:
- Real CI test discovery restored.
- Fail-closed webhook authentication and owner-only authorization restored.
- GitHub fallback/sample operational data removed.
- Status/security/tool screens made non-fabricated.
- Navigation tests rewritten for the current one-message architecture.
- Telegram API failures now propagate correctly.
- Full automated suite is green: run `37050047446`, 26/26 passing.

WHERE WE ARE NOW:
- Repository-level security, data-trust and navigation regression gates are green.
- The source implements the requested one-message hierarchical Inline Keyboard flow.
- Live deployment and real-phone Telegram smoke after this latest repair remain the final verification gap.

WHAT REMAINS:
1. Verify the live Cloudflare root/health endpoint is serving the latest application version.
2. Verify `/telegram/setup` remains unavailable in live runtime.
3. On the real Telegram bot/mobile client, smoke-test: `/start → Repositories → repository → Files/Commits/PR/Status → Back → Main`.
4. Confirm callback navigation edits the same menu message and does not create message spam.
5. Decide separately whether to keep Inline Keyboard as the final UX or add a persistent Reply Keyboard shell; this is not required for the current in-place navigation implementation.

## Master Roadmap
Phase 1 — Secure Telegram navigation core: **IMPLEMENTED + AUTOMATED-VERIFIED; LIVE MOBILE VERIFICATION PENDING**.
Phase 2 — Trustworthy GitHub repository browsing/status: **IMPLEMENTED + AUTOMATED-VERIFIED; LIVE TOKEN/RUNTIME SMOKE PENDING**.
Phase 3 — Developer tools and controlled write operations: planned.
Phase 4 — Security hardening, auditability and observability: ongoing after live verification.
Phase 5 — Mobile QA, release validation and documentation: current next checkpoint.

## Requirements
- Owner-only personal bot.
- Fail closed if webhook authentication/owner configuration is absent or wrong.
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
- Before saying a task is complete, verify from three perspectives: Execution, Architecture/Quality, QA/User.

## Architecture Decisions
- `PROJECT_MEMORY.md` is the canonical continuity file.
- Keep the modular source architecture; do not revert to the old monolithic Worker implementation.
- Security enforcement belongs at the Worker/update boundary.
- External integration failures must be explicit rather than replaced with plausible mock data.
- Callback navigation edits the current Telegram message rather than sending a new message.
- Initial command entry (`/start`, `/repos`, `/status`) may create an entry message; callback navigation must remain in-place.

## Data Model
No persistent application database is required or verified for the current read-only GitHub/menu scope.

## Security Rules
- Never commit Telegram token, GitHub token, webhook secret or private keys.
- Validate webhook secret before processing Telegram updates.
- Enforce `OWNER_TELEGRAM_ID` for messages and callbacks.
- Unauthorized callers must not receive private repository data.
- Do not reintroduce temporary diagnostic/setup endpoints without a bounded need and explicit cleanup.
- Do not display secret values or infer that a token is valid from static configuration text.

## Testing & Acceptance Criteria
A checkpoint is complete only after:
`IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED`
Automated minimum gates:
- CI executes a non-zero test count.
- Security tests pass.
- Navigation/bot/menu/index tests pass.
- GitHub fail-closed/data-trust tests pass.
- Telegram API error propagation tests pass.
Current automated evidence: run `37050047446` = 26 pass / 0 fail.
Final release gate still required:
- live Cloudflare smoke;
- real Telegram mobile smoke of complete menu/back flow.

## Known Issues / Remaining Gaps
- Live Cloudflare deployment after the latest repair is not yet verified in this checkpoint.
- Real Telegram mobile smoke after the latest repair is not yet verified.
- The current files view is a source-backed listing but does not yet provide full deep folder/file browsing buttons in the new modular UI.
- Service Status intentionally avoids claiming external uptime/latency without measured telemetry.

## Risks
- If Cloudflare has not deployed current `main`, runtime may temporarily differ from repository state.
- A runtime secret/configuration mismatch can make the secure webhook fail closed; this is preferable to unauthorized access.
- Future GitHub write operations require explicit permission scoping and stronger audit/confirmation rules than current read-only flows.

## Technical Debt
- Add measured deployment/runtime telemetry if desired rather than static service claims.
- Add deeper interactive folder navigation to the modular files view if required.
- Consider a durable navigation/session store only if future flows require cross-message/session state; current callback data is sufficient for the existing hierarchy.
- Track GitHub Actions deprecation warning for older action runtimes and upgrade actions when appropriate.

## Deployment / Release State
- GitHub Actions: green on verified code checkpoint `40e31294950ba6e3d85744728476e81cc239fbe9`, run `37050047446`, 26/26 tests passing.
- Cloudflare live deployment: pending direct runtime verification after this memory update.
- Telegram live/mobile: pending owner smoke test after runtime verification.

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
- 2026-10-02: Reconciled memory after modular menu redesign upload and recorded false-green CI/security/data-trust regressions.
- 2026-10-02: Repaired real test discovery, webhook/owner security, GitHub fail-closed behavior, non-fabricated UI status, current navigation coverage and Telegram API failure handling. Automated verification reached 26/26 green in run `37050047446`.

## Next Executable Action
Verify the live Cloudflare deployment against current `main`, then run the final owner-device Telegram smoke flow without changing architecture unless that live test exposes a defect.
