# PROJECT_MEMORY.md

## Project Identity
- Name: Nexa Dev Bot
- Repository: `davoodmehraban89/nexa-dev-bot`
- Canonical branch: `main`
- Visibility: private
- Purpose: personal Telegram developer console for GitHub repository visibility and operations.
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
Build a secure, professional, mobile-first Telegram control surface for GitHub projects with clean hierarchical navigation, minimal chat clutter, trustworthy live data, auditability and later developer automation.

## Repository / Workspace
- Repository: `davoodmehraban89/nexa-dev-bot`
- Default branch: `main`
- Verified GitHub integration permissions available to the connected tool: admin/read/write.
- Verified main head at reconciliation: `2f55a22d9ca8c9dfec42ce7021ccc355bad49b92` (`Add files via upload`, 2026-10-02).
- Existing feature branch `feat/telegram-main-inline-menu` is behind main by 6 commits and no longer represents the newest implementation baseline.

## Architecture
Verified current source layout on `main`:
- `src/index.js` — Cloudflare Worker entrypoint / HTTP handler.
- `src/bot.js` — Telegram update router and callback handling.
- `src/telegram.js` — Telegram Bot API client.
- `src/github.js` — GitHub API reader with fallback data.
- `src/menu.js` — hierarchical inline-menu renderer and callback router.
- `src/config.js` — static default repositories/service/security display configuration.
- `.github/workflows/ci.yml` — Node CI.
- `test/` — test files, including security and navigation regression tests.

## Technology Stack
- JavaScript ES modules
- Node.js test runner
- Telegram Bot API
- GitHub REST API
- Cloudflare Workers / Wrangler
- GitHub Actions

## Environments & Integrations
Verified in repository:
- Cloudflare Worker configuration exists in `wrangler.jsonc`, main entry `src/index.js`, `workers_dev: true`, observability enabled.
- Telegram Bot API integration exists.
- GitHub API integration exists.
- CI workflow exists.
Not verified in this reconciliation:
- Current live Cloudflare deployment contents.
- Current live Telegram webhook configuration.
- Current production secret values.

## Current Production State
**NOT VERIFIED.** Do not infer live deployment correctness from repository contents or CI alone.

## Completed Work (Repository-Verified)
- Continuity system exists.
- Current `main` contains a modular redesign (`bot.js`, `menu.js`, `telegram.js`, `github.js`, `config.js`).
- Inline hierarchical menu views exist for main menu, repositories, repo detail, files, commits, pull requests, service status, tools, settings and security.
- Callback handling uses Telegram `editMessageText` for in-place menu navigation.
- Main menu includes Repositories, Status, Tools, Settings and Security.
- Breadcrumb-style path text and explicit back buttons are present.
- Latest GitHub Actions run inspected: run `37047035443` for head `2f55a22...` concluded `success`.

## Critical Verification Finding
The latest CI success is **not a valid test pass**. `package.json` runs:
`node --test tests/*.test.js`
while the repository test directory is `test/` (singular). GitHub Actions run `37047035443` therefore executed **0 tests** (`# tests 0`, `# pass 0`, `# fail 0`) and still exited successfully.

## Security Regression — VERIFIED BY SOURCE INSPECTION
The modular uploaded implementation on current `main` removed security boundaries present in the older worker implementation/tests:
- `src/index.js` currently accepts POST requests without validating `X-Telegram-Bot-Api-Secret-Token`.
- `src/index.js` does not restrict POST handling to `/telegram/webhook`.
- `src/bot.js` currently does not enforce `OWNER_TELEGRAM_ID` before handling messages/callbacks.
- Existing `test/security.test.js` explicitly expects fail-closed webhook secret validation and owner-only behavior, but those tests are currently not executed because of the CI path bug.

Status: **BLOCKING — NOT SAFE TO CALL PRODUCTION-READY.**

## Data-Trust / Correctness Findings
Current `src/github.js` silently falls back to static/default data when GitHub calls fail. This can make unavailable or failed integrations look successful and conflicts with the project requirement to never present fabricated/demo data as live operational truth.
Current `src/config.js` contains static status claims such as `100% SLA`, connected/operational services and security state; these are display defaults, not verified runtime telemetry.
The Tools view includes hard-coded success outputs (for example a fixed ping latency) rather than measured operations.
Status: **IMPLEMENTED UI, NOT TRUSTWORTHY RUNTIME TELEMETRY YET.**

## UX/UI State
Implemented direction on current main:
- hierarchical inline keyboards;
- one-message in-place callback navigation after the initial message;
- parent back buttons;
- breadcrumbs.
Important gap relative to owner preference:
- this is an Inline Keyboard design attached to messages, not a persistent Telegram Reply Keyboard replacing the phone keyboard.
- `/start`, `/repos`, `/status` still create a new message because they are command entry points; navigation after callback uses message editing.

## GitHub Reader State
Repository code includes views/services for:
- repositories;
- files;
- commits;
- pull requests;
- workflow/status.
Previously observed Telegram tests from the owner confirmed repository/files/commits/PR/status reading before the uploaded redesign.
**Regression of those live flows after the new uploaded architecture is NOT VERIFIED.**

## Current Work / Last Checkpoint
WHERE WE WERE:
- Owner requested Nexa Dev UX redesign to hierarchical menus, back navigation and reduced message spam.

WHAT CHANGED:
- Three `Add files via upload` commits (`65a8fbec...`, `453c0ddf...`, `2f55a22d...`) placed a modular menu redesign directly on `main`.
- `src/index.js` is now only the Worker entrypoint and imports `NexaDevBot`; the old monolithic implementation is no longer the main source shape.

WHERE WE ARE NOW:
- Menu redesign is materially present in source.
- CI is false-green because zero tests run.
- Critical webhook/owner security checks are missing from current main implementation.
- Runtime/mobile behavior after this redesign is NOT VERIFIED.

WHAT REMAINS:
1. Restore fail-closed Telegram webhook secret validation and owner-only authorization without breaking modular navigation.
2. Restrict webhook processing to the intended endpoint.
3. Fix `package.json` test glob from `tests/*.test.js` to `test/*.test.js` (or equivalent reliable test discovery).
4. Run the real security/navigation/bot/menu/index tests; fix failures and re-run.
5. Remove or clearly label mock/static fallback data; failures must not masquerade as verified live GitHub/service state.
6. Re-verify `/start → Repos → Repo → Files/Commits/PR/Status → Back` on the real Telegram bot/mobile runtime.
7. Decide whether the final main menu should remain Inline Keyboard or move to the owner's preferred persistent Reply Keyboard shell.

## Master Roadmap
Phase 1 — Secure Telegram navigation core.
Phase 2 — Trustworthy GitHub repository browsing and status telemetry.
Phase 3 — Developer tools and controlled operations.
Phase 4 — Security hardening, auditability and observability.
Phase 5 — Mobile QA, release validation and documentation.

## Requirements
- Owner-only personal bot.
- Fail closed if webhook authentication configuration is missing or wrong.
- No secret values committed to repository.
- No fabricated operational success/status.
- Minimal chat spam.
- Hierarchical navigation with reliable Back behavior.
- Preserve working GitHub Reader flows.
- Mobile-first Telegram usability.
- Completion claims require implemented + tested + re-verified evidence.

## User Decisions
- Nexa Dev Bot is independent from Finora / Factor-easy application development; do not mix project state or Supabase requirements from those projects into this repository.
- GitHub repository: `davoodmehraban89/nexa-dev-bot`.
- Professional layered menus are desired.
- User strongly prefers execution over explanatory chat.
- User requires verification from execution, architecture/quality and QA/user perspectives before saying work is complete.

## Architecture Decisions
- `PROJECT_MEMORY.md` is the canonical continuity file for this project.
- Modular source files are now the current main architecture; do not revert to the old monolithic file merely because an older branch contains it.
- Security enforcement belongs at the Worker/update boundary and must not rely on display-only configuration.
- Runtime failures must be explicit rather than silently replaced with plausible mock data.

## Data Model
No persistent application database is verified or required for the current menu/read-only GitHub scope.

## Security Rules
- Never store Telegram bot token, GitHub token, webhook secret or credentials in committed files.
- Validate Telegram webhook secret before parsing/processing privileged updates.
- Enforce `OWNER_TELEGRAM_ID` for both message and callback flows.
- Unauthorized callers must not receive private repository data.
- Temporary diagnostic/setup endpoints must remain disabled unless explicitly reintroduced for a bounded setup operation and removed afterward.

## Testing & Acceptance Criteria
Completed means:
`IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED`
Required minimum gates for the navigation/security slice:
- CI must execute a non-zero test count.
- Security tests pass.
- Navigation tests pass.
- Bot/menu/index tests pass.
- Live Telegram mobile smoke confirms one-message callback navigation and working Back path.
- GitHub read paths return real data or explicit errors; no silent fake success.

## Known Issues
- CI run `37047035443` is false-green with 0 tests because of the wrong test directory glob.
- Current main lacks webhook-secret validation.
- Current main lacks owner authorization enforcement.
- Static/mock fallback data can be presented as if live.
- Several service/security/ping status strings are hard-coded and not runtime measurements.
- Live Cloudflare/Telegram state after the uploaded redesign is not verified.

## Risks
- Unauthorized Telegram user could exercise bot flows if current main is deployed as-is.
- A forged POST to the Worker could be processed because the webhook secret is not checked.
- False-green CI can allow regressions to reach main.
- Mock fallback data can mislead operational decisions.

## Technical Debt
- Correct test discovery and add a non-zero-test assertion/gate.
- Make Telegram API client throw/propagate API `ok:false` failures instead of treating JSON responses as success by default.
- Replace hard-coded service telemetry with measured/unknown states.
- Add robust HTML escaping for GitHub-derived titles/names displayed with Telegram HTML parse mode.
- Add folder/file navigation buttons if full tree browsing is required; current files view primarily renders a textual listing with refresh/back controls.

## Deployment / Release State
- GitHub Actions CI exists and latest inspected run is green but invalid as a quality gate due to 0 executed tests.
- Cloudflare live deployment: NOT VERIFIED in this reconciliation.

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
- `.github/workflows/ci.yml`
- `wrangler.jsonc`

## Reference Assets
No canonical UI image asset for Nexa Dev Bot is currently verified in `docs/project-memory/assets/`.
Status: Missing Asset.

## Change Log
- 2026-10-02: Initial continuity memory created.
- 2026-10-02: Reconciled memory after modular menu redesign uploads. Recorded current architecture, false-green zero-test CI, verified source-level security regressions, data-trust issues and exact repair sequence.

## Next Executable Action
Create a bounded security/CI repair slice from current `main`: restore webhook secret + owner authorization, fix test discovery, run the real test suite, fix regressions, re-run, then verify the live Telegram mobile menu flow before declaring the redesign complete.
