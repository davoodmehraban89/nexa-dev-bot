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
5. Production WRITE / DESTRUCTIVE provider actions must remain behind Safe Approval and durable one-time replay protection.

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
- Telegram callback data and rendered provider text must remain bounded.

## Production-Accepted Foundation
### Plugin Foundation v1
- PR #14 squash merge `9d95a18659cead269ffa98af08d6bbf041c6135f`.
- Owner-device READ smoke and Cloudflare runtime telemetry accepted.

### Safe Actions / GitHub Operator foundation
- PR #15 merged to `main` at `59f0b431b8af86d3aa2b9acb4f5889911972e71a`.
- Post-merge CI run `37095115793` succeeded with 78/78 tests.
- Deploy run `37095129406` succeeded; production Durable Object binding verified.
- CI/Actions pagination subsequently landed on `main` at `074033f5a067283727a38e034a6d19436fcce475`.

### Approval and provider-error UX hardening
- PR #17 merged at `2c131ea5fc564faae20cd7aff1ac00831f7fe185`; expired/replayed approvals now visibly update Telegram.
- PR #18 merged at `a2e8a65763516765d47b535e514990f8698ad2a2`; approved provider failures now visibly update Telegram.
- Main CI #155 / run `37099455730` succeeded with 82/82 tests.
- Deploy #90 / run `37099465363` succeeded on the exact merge SHA.
- Active Cloudflare production version after deploy: `1865c8ac-5d05-40cd-8478-8d9f5473e34b` at 100% traffic.

## Production Safe Approval WRITE Acceptance — 2026-10-03
Target:
- CI run #134, Actions run ID `37094321256`.

Verified sequence:
1. An early owner approval reached the provider but GitHub returned `403 Resource not accessible by personal access token`; the same approval token was then replayed and correctly rejected as already used.
2. The owner updated the existing fine-grained GitHub token permission so Actions has write access; no token value was stored or logged.
3. A fresh owner request produced `approval_required` -> `approval_issued`.
4. Owner pressed Confirm; production audit recorded `approval_verified` -> approved `action_attempt` with `owner_write_approved`.
5. Production audit on Worker version `1865c8ac-5d05-40cd-8478-8d9f5473e34b` recorded `action_result=success` for `github.workflow.run.rerun_failed`.
6. GitHub run #134 moved from `run_attempt=1` to `run_attempt=2`, proving the provider WRITE was accepted.
7. Attempt 2 itself failed only because it reran the historical PR #15 merge ref from before the later Durable Object binding/config fix; this is historical-code behavior, not a current-main regression.

Conclusion:
- Owner-bound production approval: VERIFIED.
- No provider WRITE before approval: VERIFIED.
- Durable one-time replay protection: VERIFIED.
- GitHub Actions WRITE authorization and provider POST: VERIFIED.
- Telegram success feedback after accepted provider WRITE: VERIFIED.

## Current Work — PR #19 GitHub Advanced READ
- Branch: `feat/github-advanced-read`.
- Design: `docs/superpowers/specs/2026-10-03-github-advanced-read-design.md`.
- Plan: `docs/superpowers/plans/2026-10-03-github-advanced-read.md`.
- Scope is READ-only: workflow job detail/log tail, artifacts metadata, branches/compare, PR detail/files/checks, issues, releases and bounded pagination. No new provider mutation is added in this slice.

### TDD evidence
- Provider RED CI #156 / run `37100585034`: 87 tests total, 82 pass / 5 expected failures for missing Advanced provider readers.
- Provider compatibility fix followed after CI #157 exposed two regressions (log clamp and page-1 PR URL compatibility).
- Provider GREEN CI #158 / run `37100892060`: 19 test files, 87/87 pass, 0 fail/skip/cancelled.
- Plugin RED CI #159 / run `37100960176`: 92 tests total, 87 pass / 5 expected failures for undeclared/unimplemented Advanced routes and views.
- Plugin GREEN CI #161 / run `37101099153`: 20 test files, 92/92 pass, 0 fail/skip/cancelled.

### Implemented in PR #19
- Bounded raw workflow-job log tail with HTML escaping and visible truncation state.
- Workflow job detail and per-job drill-down from run jobs.
- Workflow artifact metadata view.
- Branch list and compare-to-default using a validated 40-hex head SHA.
- Advanced PR list/detail/files-diff/checks views.
- Issues and releases views.
- Pagination is clamped to page 1..100 and page size <=20 where list pagination is exposed.
- New READ callbacks resolve without provider calls before central policy evaluation; callback lengths are regression-tested against Telegram limits.

### Not yet production-accepted
- PR #19 is not merged at this checkpoint.
- Exact post-merge `main` CI and Cloudflare deploy are NOT VERIFIED.
- Owner-device production smoke for the new Advanced READ paths is NOT VERIFIED until after deploy.

## Next Executable Actions
1. Review PR #19 for accidental provider writes, secret leakage, callback limits, response bounds and pagination gaps.
2. Run fresh final PR CI, mark ready, squash-merge the exact reviewed head.
3. Verify exact post-merge `main` CI, deploy, active Cloudflare version and current-version telemetry.
4. Perform owner-device READ smoke through Telegram for Branches/Compare, PR detail/files/checks, CI Run/Jobs/failed log/artifacts, Issues and Releases.
5. Then implement remaining GitHub Advanced WRITE items only where useful (workflow dispatch and/or specific-job rerun) as a separate Safe Approval slice.
6. Continue to the Cloudflare Ops plugin and the broader roadmap.

## Remaining Roadmap
1. Finish GitHub Advanced production acceptance; add workflow dispatch/specific-job rerun only if operationally useful and always via Safe Approval.
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
