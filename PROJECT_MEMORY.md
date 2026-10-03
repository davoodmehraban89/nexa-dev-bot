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
6. Never call a phase production-accepted from CI alone; deployment and live-runtime evidence are separate gates.

## Current Architecture
- `src/index.js` — Cloudflare Worker HTTP boundary; webhook-secret/owner checks, health/status, redacted runtime diagnostics, and named export of `ApprovalReplayGuard`.
- `src/bot.js` — Telegram update/callback coordinator and Safe Actions confirmation lifecycle.
- `src/core/plugin-registry.js` — plugin/action manifest validation.
- `src/core/action-policy.js` — central `READ` / `WRITE` / `DESTRUCTIVE` policy.
- `src/core/audit.js` — structured best-effort audit with recursive redaction.
- `src/core/router.js` — security-critical `resolve -> policy -> execute` router; provider work must remain deferred until policy allows it.
- `src/core/approval.js` — compact HMAC approval tokens, owner/action/risk/expiry binding, and fail-closed consume.
- `src/core/durable-replay-store.js` — Worker-side adapter for persistent approval consume semantics.
- `src/durable/approval-replay-guard.js` — Durable Object atomic one-time consume + expiry cleanup.
- `src/plugins/github/manifest.js` — GitHub action/risk declarations.
- `src/plugins/github/plugin.js` — GitHub repository/file/Actions UI and safe workflow controls.
- `src/github.js` — authenticated GitHub REST client; read APIs plus controlled Actions write APIs.
- `src/telegram.js` — Telegram Bot API client with explicit error propagation and Cloudflare-safe fetch invocation.
- `src/menu.js` — bounded stateless inline views and file browser.
- `.github/workflows/ci.yml` — Node 22 test gate with non-zero test-discovery guard.
- `.github/workflows/deploy.yml` — exact-commit Cloudflare deployment after successful `main` CI.
- `wrangler.jsonc` — Worker config plus SQLite Durable Object binding `APPROVAL_REPLAY_GUARD` -> `ApprovalReplayGuard`.

## Runtime Configuration
Worker runtime names:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_ID`
- `GITHUB_TOKEN`
- optional `GITHUB_OWNER`
- optional `APPROVAL_SIGNING_SECRET`; approval falls back to `TELEGRAM_WEBHOOK_SECRET` when absent
- `APPROVAL_REPLAY_GUARD` Durable Object binding from Wrangler config

GitHub Actions deployment secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Security / Data-Trust Invariants
- Telegram webhook is `POST /telegram/webhook`; missing required security/transport configuration fails closed.
- Non-owner updates are ignored before private-data access.
- Missing GitHub token/provider failures are explicit; no fabricated fallback data or fabricated success.
- Runtime diagnostics and audit records must not disclose Telegram/GitHub/webhook/approval signing secrets or signed approval callback tokens.
- Plugin route resolution must be side-effect-free; provider/view work happens only inside deferred `execute()` after policy evaluation.
- `READ` executes for the authorized owner.
- `WRITE` and `DESTRUCTIVE` do not execute on the first request; they require a verified owner-bound approval.
- Approval token is short-lived, HMAC-signed, action-bound, owner-bound and target-bound.
- Approval consume fails closed without persistent replay protection.
- `(ownerId, nonce)` is consumed atomically through the Durable Object, preventing cross-isolate replay.
- GitHub workflow write endpoints never run before approval.

## Telegram / GitHub Capabilities
Existing READ navigation remains backward compatible:
- `/start`, `/menu`, `/repos`, `/status`
- repository detail, files/tree/blob preview, PRs, commits, status
- same-message callback navigation via `editMessageText`
- stale `answerCallbackQuery` failure does not block navigation

Safe GitHub Operator additions in PR #15:
- repository -> `🧪 CI / Actions`
- list workflow runs
- inspect workflow run status/branch/SHA/event
- inspect jobs and steps
- request `Re-run failed jobs`
- request `Cancel workflow run`
- both WRITE actions render explicit Confirm/Cancel UI before provider mutation
- malformed/expired/wrong-owner/mismatched/replayed approval fails closed

## Historical Accepted Milestones
### Runtime incident fixes — 2026-10-02
- PR #11 added redacted diagnostics; squash merge `cfd7a0b4803b13c76646b71666e7e0c66e023c99`.
- PR #12 fixed Cloudflare `fetch` receiver / `Illegal invocation`; squash merge `bd01d8ede44331f50e1115d569095fb12246331d`.
- PR #13 hardened callback resilience and documentation; squash merge `6c90cbb8384c9591ba89367b48e4ce7e785ce72f`.
- Production telemetry after the fix showed current-version Telegram webhook HTTP 200 / outcome `ok`.

### Plugin Foundation v1 — Production Accepted 2026-10-03
- Design: `docs/superpowers/specs/2026-10-03-nexa-plugin-foundation-design.md`.
- Plan: `docs/superpowers/plans/2026-10-03-nexa-plugin-foundation.md`.
- PR #14 squash merge: `9d95a18659cead269ffa98af08d6bbf041c6135f`.
- Post-merge CI `37071695354` succeeded.
- Verified suite at acceptance: 12 test files, 52/52 pass, 0 fail/skip.
- Deploy `37071717251` succeeded; later documentation checkpoint also passed CI/deploy.
- Owner-device production smoke completed.
- Smoke telemetry on Worker version `425d7418-1efa-498e-8615-1718596943d9`: 35 webhook events, zero observed webhook errors, sampled HTTP 200/outcome `ok`, 22 redacted GitHub READ audit events.

## Safe Actions + GitHub Advanced — PR #15 Pre-Merge Checkpoint 2026-10-03
### Scope
- Branch: `feat/safe-github-ops`
- PR: `#15` — `feat: add safe GitHub operator foundation`
- Design: `docs/superpowers/specs/2026-10-03-safe-github-ops-design.md`
- Plan: `docs/superpowers/plans/2026-10-03-safe-github-ops.md`

### Implemented
- HMAC approval service with compact Telegram-safe callback tokens.
- Policy support for verified approved WRITE/DESTRUCTIVE execution.
- Router approved context while preserving `resolve -> policy -> execute`.
- Persistent cross-isolate replay prevention with SQLite Durable Object.
- Fail-closed behavior if `APPROVAL_REPLAY_GUARD` is unavailable.
- Approval lifecycle audit events without signed token leakage.
- GitHub Actions read APIs: runs, run detail, jobs/steps.
- GitHub Actions controlled write APIs: rerun failed jobs, cancel run.
- Telegram Confirm/Cancel workflow and second approved dispatch.
- `npm start` now uses Wrangler local Worker development rather than `node src/index.js`.
- README/spec/plan aligned to durable replay architecture.

### TDD / verification evidence
- Earlier RED/GREEN cycles covered approval token semantics, policy, router, GitHub service, plugin views and Telegram approval flow.
- Durable replay tests cover missing namespace fail-closed, owner+nonce scoping, duplicate rejection, expiry cleanup, and Wrangler export/binding contract.
- A deliberate config/export RED run `37094233142` had 73 tests with exactly 1 expected failure for missing production binding/export.
- Export and Wrangler SQLite Durable Object config then fixed that failure.
- PR CI `37094394332`: **15 test files; 78 tests; 78 pass; 0 fail; 0 skipped/cancelled**.
- Final documentation-aligned head `53a766ac9a2fab49a2bde29d0c5ae9b586f4c555` passed fresh PR CI `37094713808`.
- Fresh PR patch reviewed after documentation corrections; no out-of-scope provider mutations were added.
- Secret-pattern scan found no `ghp_` or `github_pat_` token material; no production secret values are intentionally stored in the patch.

### Not yet production-accepted
- PR #15 is not yet merged at this checkpoint.
- Post-merge `main` CI is not yet verified.
- Cloudflare deployment of the Durable Object binding is not yet verified.
- Active-production `APPROVAL_REPLAY_GUARD`/SQLite class is not yet verified through Cloudflare runtime evidence.
- Owner-device production READ path `/start -> Repositories -> project -> CI / Actions` is not yet smoke-tested on the new deployment.
- Live GitHub WRITE provider smoke is **NOT VERIFIED** and must only occur through an actual owner confirmation in Telegram; no secret rotation is performed automatically.

## Acceptance Rules
A phase is complete only after `IMPLEMENTED -> VERIFIED -> FIXED IF NEEDED -> RE-VERIFIED`.
Minimum gates:
- Non-zero discovered tests and security regressions green.
- Plugin/policy/audit/router tests green.
- Telegram navigation and Cloudflare fetch-receiver regressions green.
- PR review clean and secrets not leaked.
- Merge exact reviewed head.
- Post-merge `main` CI green.
- Exact-commit Cloudflare deploy green.
- Production telemetry confirms successful webhook behavior on current version.
- Any external WRITE smoke requires the Safe Actions confirmation path; anything not actually executed is explicitly `NOT VERIFIED`.

## Current Work / Last Checkpoint
WHERE WE ARE:
- Foundation v1 remains production-accepted.
- Safe Actions + GitHub Advanced implementation is complete on PR #15 and final PR CI is green at head `53a766ac9a2fab49a2bde29d0c5ae9b586f4c555` / run `37094713808`.
- Durable replay protection is implemented in code/config and tested, but production deployment verification is still pending.

NEXT EXECUTABLE ACTIONS:
1. Run CI once more if this memory checkpoint changes PR head.
2. Mark PR #15 ready for review and squash-merge only if the new head is green and mergeable.
3. Verify exact post-merge `main` CI.
4. Verify Cloudflare deploy and active Durable Object binding/version.
5. Inspect current-version Cloudflare telemetry.
6. Request owner-device READ smoke only if live external interaction is still needed for acceptance.
7. Do not perform GitHub workflow WRITE smoke without the owner pressing the Telegram Confirm button.

## Remaining Roadmap After PR #15 Acceptance
Proceed as separate verified vertical slices, not one mega-PR:
1. Cloudflare Ops plugin: deployments, versions, logs, health and safe rollback controls.
2. Broader CI/CD control and release acceptance orchestration.
3. AI Copilot adapter: code/PR/log/CI analysis, test/fix proposals; no autonomous production mutation.
4. Browser QA: real DOM smoke, screenshots and production-flow checks behind explicit runtime configuration.
5. Monitoring + Incident Manager.
6. Automation Engine with approval-aware durable workflows.
7. Telegram Mini App control center.
8. Plugin ecosystem adapters as useful: Supabase, Sentry, Notion, Linear/Jira, Railway/Render; no cross-project assumptions.
9. Multi-project control plane.
10. Final hardening: permission penetration tests, rate limiting, replay/idempotency drills, rollback/recovery drill, documentation and release/versioning.

## Project Boundaries
- Nexa Dev Bot is independent from Finora / Factor-easy unless a future explicit multi-project adapter is added.
- Do not mix Supabase state/migrations from other projects into Nexa by default.
- Keep secrets out of code, logs and documentation.
