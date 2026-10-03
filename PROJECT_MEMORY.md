# PROJECT_MEMORY.md

## Project Identity
- Name: Nexa Dev Bot
- Repository: `davoodmehraban89/nexa-dev-bot`
- Canonical branch: `main`
- Visibility: private
- Purpose: owner-only Telegram developer console for GitHub visibility and controlled developer operations.
- This file is the continuity source of truth; live repository/runtime evidence overrides stale text.

## AI Handoff Protocol
1. Verify live `main`, recent CI/deploy and relevant runtime evidence before changes.
2. Prefer live evidence over chat memory.
3. Keep durable checkpoints here and never store secrets/tokens/private keys.
4. Do not call a phase production-accepted from CI alone; deployment and owner-device/runtime evidence are separate gates.
5. Production WRITE actions must remain behind Safe Approval and durable one-time replay protection.

## Current Architecture
- Cloudflare Worker webhook boundary in `src/index.js`.
- Telegram coordinator and Safe Approval lifecycle in `src/bot.js`.
- Plugin Registry + central Action Policy + Audit Logger + Plugin Router in `src/core/`.
- HMAC approval tokens in `src/core/approval.js`.
- Durable Object replay guard via `APPROVAL_REPLAY_GUARD` / `ApprovalReplayGuard`.
- GitHub plugin in `src/plugins/github/`; provider adapter in `src/github.js`.
- Exact-commit CI/deploy workflows under `.github/workflows/`.

## Security / Data-Trust Invariants
- Non-owner Telegram updates are ignored before private-data access.
- `READ` is owner-only; `WRITE` / `DESTRUCTIVE` require verified owner approval.
- Approval is owner/action/risk/target/expiry-bound and one-time consumed through Durable Object storage.
- Provider mutation never executes before policy approval.
- Provider errors are explicit; no fabricated success or fallback data.
- Secrets and signed approval callback tokens must not appear in logs/docs.

## Production-Accepted Foundation
### Plugin Foundation v1
- PR #14 squash merge `9d95a18659cead269ffa98af08d6bbf041c6135f`.
- Owner-device READ smoke and Cloudflare runtime telemetry accepted.

### Safe Actions / GitHub Operator foundation
- PR #15 merged to `main` at `59f0b431b8af86d3aa2b9acb4f5889911972e71a`.
- Post-merge CI run `37095115793` succeeded with 78/78 tests.
- Deploy run `37095129406` succeeded; production Durable Object binding verified.
- CI/Actions pagination subsequently landed on `main` at `074033f5a067283727a38e034a6d19436fcce475`.

### Approval rejection UX hardening
- PR #17 merged at `2c131ea5fc564faae20cd7aff1ac00831f7fe185`.
- Main CI #149 / run `37098697859` succeeded.
- Deploy #84 / run `37098710348` succeeded on the exact merge SHA.
- Active Cloudflare version after deploy: `e7182388-ca16-4aeb-b144-6d5f0fc63043` at 100% traffic.
- Expired/replayed approvals now visibly update the Telegram message instead of appearing silent.

## Live GitHub WRITE Smoke — 2026-10-03
Target:
- CI run #134, Actions run ID `37094321256`.

Observed on production version `e7182388-ca16-4aeb-b144-6d5f0fc63043`:
1. Owner requested `github.workflow.run.rerun_failed`.
2. Audit: `approval_required` -> `approval_issued`.
3. Owner pressed Confirm.
4. Audit: `approval_verified` -> approved `action_attempt`.
5. Provider result: `error` with `403 Resource not accessible by personal access token`.
6. Owner pressed the same approval again; Durable replay guard rejected it as `Approval token already used`.
7. GitHub run #134 remains `run_attempt=1`; therefore no rerun was accepted by GitHub.

Conclusion:
- Owner-bound approval path in production: VERIFIED.
- Durable one-time replay protection in production: VERIFIED.
- GitHub WRITE provider authorization: BLOCKED by current Worker `GITHUB_TOKEN` permissions.
- For a fine-grained PAT, GitHub Actions repository permission must be `write` for rerun/cancel endpoints. A classic PAT requires appropriate private-repository `repo` scope.
- Do not rotate or expose `GITHUB_TOKEN` automatically. Permission/credential change requires owner action.

## Current Work
### PR #18 — provider WRITE error feedback
- Branch: `fix/provider-write-error-feedback`.
- Purpose: after a valid approval, provider failures must visibly replace the approval message rather than silently return an error.
- RED CI #150 / run `37099120240`: 18 test files, 82 tests, 81 pass / 1 expected failure in the new provider-error UI regression.
- Implementation commit `75c9e540192ae3b42931329035002a95819f7163` adds Telegram feedback for approved provider failures while preserving one-time approval consumption.
- CI #152 proved the implementation behavior but exposed a false-positive Persian test regex (`ناموفق` contains `موفق`).
- Test correction commit `354f79c6f6f0b4372d85f30cf4ad8ece3e26944d` narrowed the success assertion.
- CI #153 / run `37099346636`: 18 test files, 82 tests, 82 pass, 0 fail/skip/cancelled.
- This file records the live permission blocker and current recovery path.

## Next Executable Actions
1. Review PR #18, squash-merge, verify exact `main` CI/deploy and active Cloudflare version.
2. Owner must update the Worker GitHub credential so `nexa-dev-bot` has GitHub Actions WRITE on the target repository; never paste the token into repository/docs/logs.
3. Re-run the owner-device WRITE smoke through Telegram on run #134 (or another safe failed run).
4. Acceptance requires: approval verified, provider POST accepted, `run_attempt` increases/new attempt appears, result visible in Telegram, replay still rejected.
5. Only after provider WRITE smoke is green, continue the broader roadmap in verified vertical slices.

## Remaining Roadmap
1. GitHub Advanced: logs, failed-step log view, artifacts metadata, branches/compare, PR detail/diff/checks, issues, releases, workflow dispatch where useful, bounded pagination.
2. Cloudflare Ops plugin: deployments, versions, bindings, health, telemetry/runtime errors and approval-gated rollback/deploy operations.
3. CI/CD Control Plane and release acceptance orchestration.
4. Monitoring + Incident Manager.
5. Automation Engine with resumable/idempotent approval-aware workflows.
6. AI Copilot with no direct production mutation.
7. Browser QA real production smoke.
8. Telegram Mini App backed by real APIs.
9. Plugin ecosystem and multi-project control plane.
10. Final hardening, recovery drills, docs and versioning.

## Project Boundaries
- Nexa Dev Bot is independent from Finora / Factor-easy unless an explicit adapter is added.
- Do not mix other projects' Supabase/database state into Nexa by default.
- Keep secrets out of code, logs and documentation.
