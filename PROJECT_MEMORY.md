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

## GitHub Advanced READ Rollout — PR #19
- Design: `docs/superpowers/specs/2026-10-03-github-advanced-read-design.md`.
- Plan: `docs/superpowers/plans/2026-10-03-github-advanced-read.md`.
- Scope is READ-only: workflow job detail/log tail, artifacts metadata, branches/compare, PR detail/files/checks, issues, releases and bounded pagination. No new provider mutation was added in this slice.
- PR #19 merged to `main` at `ff270005fca1eda601df0a615ca81033c7340b3a`.
- Post-merge CI #172 / run `37102293956` succeeded on that exact SHA with 22 test files and 97/97 tests passing, 0 fail/skip/cancelled.
- Deploy #108 / run `37102308006` succeeded from that exact SHA.
- Active Cloudflare production version after deploy: `bc23d9e5-1490-429c-9369-4e751f173df5` at 100% traffic.

### TDD evidence
- Provider RED CI #156 / run `37100585034`: 87 tests total, 82 pass / 5 expected failures for missing Advanced provider readers.
- Provider compatibility fix followed after CI #157 exposed two regressions (log clamp and page-1 PR URL compatibility).
- Provider GREEN CI #158 / run `37100892060`: 19 test files, 87/87 pass, 0 fail/skip/cancelled.
- Plugin RED CI #159 / run `37100960176`: 92 tests total, 87 pass / 5 expected failures for undeclared/unimplemented Advanced routes and views.
- Plugin GREEN CI #161 / run `37101099153`: 20 test files, 92/92 pass, 0 fail/skip/cancelled.
- Review hardening RED CI #164 / run `37101390354`: 95 tests total, 92 pass / 3 expected failures for artifact pagination, PR diff pagination and visible READ-provider errors.
- Review hardening GREEN CI #166 / run `37101635682`: 21 test files, 95/95 pass, 0 fail/skip/cancelled.
- Mixed Issue/PR pagination RED CI #167 / run `37101783124`: 97 tests total, 95 pass / 2 expected failures.
- Final pre-merge GREEN CI #170 / run `37102060845`: 22 test files, 97/97 pass, 0 fail/skip/cancelled.

### Implemented in PR #19
- Bounded raw workflow-job log tail with HTML escaping and visible truncation state.
- Workflow job detail and per-job drill-down from run jobs.
- Workflow artifact metadata view with bounded pagination.
- Branch list and compare-to-default using a validated 40-hex head SHA.
- Advanced PR list/detail/files-diff/checks views; PR diff page size matches rendered page size so files are not silently skipped.
- Issues and releases views; Issue pagination preserves GitHub raw-page continuation even when PR entries are filtered out.
- Pagination is clamped to page 1..100 and page size <=20 where list pagination is exposed.
- New READ callbacks resolve without provider calls before central policy evaluation; callback lengths are regression-tested against Telegram limits.
- READ provider failures visibly update Telegram instead of appearing silent.

## GitHub Advanced READ Production Acceptance — PR #20
- Live owner-device smoke found two gaps: Issues returned GitHub 403 due missing `Issues: Read`, while Releases successfully returned an empty source-backed list.
- PR #20 `fix: clarify Issues permission and empty Releases state` merged to `main` at `7c0df4c8616c6859a2dfc4c35b0e22d6e47215bc`.
- Post-merge CI #177 / run `37106715317` completed successfully on that exact SHA with 23 test files and 99/99 tests passing, 0 fail/skip/cancelled.
- Deploy #113 / run `37106727515` completed successfully after checking out that exact SHA.
- Active Cloudflare production version after deploy: `5741faa0-720f-48d5-9e76-64726a5f5167` at 100% traffic.
- Owner updated the existing fine-grained PAT to add only Repository permissions -> Issues -> Read-only; token value was not rotated/stored/logged.
- Owner-device Telegram smoke after that permission change showed Issues no longer returns 403 and Releases renders the explicit no-published-release state.
- Cloudflare production telemetry on version `5741faa0-720f-48d5-9e76-64726a5f5167` recorded `github.issues.list` with `outcome=success` and `github.releases.list` with `outcome=success` for the owner-device interactions.

Conclusion:
- GitHub Advanced READ production acceptance: VERIFIED.
- Issues least-privilege provider authorization: VERIFIED.
- Releases source-backed empty state: VERIFIED.
- Telegram owner-device/runtime evidence: VERIFIED.

## Current Design Work — Repository Workspace / Code Editor
- Owner explicitly requires the future ability to open a file in any accessible repository, edit it from the Nexa mobile control plane, review the change, commit it, and send it back to GitHub.
- Owner approved the architectural direction: branch-first, diff-first, no provider commit without Safe Approval, single-file first with a multi-file-capable architecture.
- Design spec path: `docs/superpowers/specs/2026-10-03-repository-workspace-editor-design.md`.
- Design branch: `spec/repository-workspace-editor`.
- This is an architectural subsystem and is not yet implementation-approved until the owner reviews the written spec.

### Approved design direction captured in the spec
- Phase 1: durable owner-scoped single-file text workspace, exact diff, conflict/staleness checks, branch-first GitHub commit, Safe Approval, commit SHA + CI handoff.
- Commit engine is based on Git Data blobs/trees/commits/refs so Phase 2 can atomically commit multiple files without redesign.
- Draft content is stored outside Telegram callback data/process memory, preferably in a dedicated `WORKSPACE_STORE` Durable Object; existing `APPROVAL_REPLAY_GUARD` remains dedicated to approval replay protection.
- Direct writes to `main` are out of scope for Phase 1 and may be added later only as an explicitly enabled high-risk path that respects GitHub protection rules.
- Binary/LFS, automatic conflict resolution, secret/private-key-like files and arbitrary shell execution are out of scope for Phase 1.
- Production acceptance requires owner-device evidence proving draft-only behavior before approval, exact diff, one approved commit, replay rejection, and GitHub/Cloudflare evidence agreement.

### Not yet implementation-complete
- Written spec requires owner review/approval before implementation planning.
- No workspace storage binding/class has been added yet.
- No editor WRITE action has been added yet.
- No new GitHub commit mutation has been added yet.
- No production editor smoke has been run yet.

## Next Executable Actions
1. Owner reviews `docs/superpowers/specs/2026-10-03-repository-workspace-editor-design.md` and approves or requests changes.
2. After written-spec approval, create the implementation plan via the required planning workflow.
3. Implement with TDD in vertical slices: workspace storage -> edit/diff UX -> Git Data commit engine -> Safe Approval integration -> CI handoff -> production smoke.
4. Only after Repository Workspace Phase 1 production acceptance, continue remaining useful GitHub Advanced WRITE operations and then Cloudflare Ops.

## Remaining Roadmap
1. Repository Workspace / Code Editor Phase 1, then multi-file expansion.
2. Remaining useful GitHub Advanced WRITE actions (for example workflow dispatch/specific-job rerun), always through Safe Approval.
3. Cloudflare Ops plugin: deployments, versions, bindings, health, telemetry/runtime errors and approval-gated rollback/deploy operations.
4. CI/CD Control Plane and release acceptance orchestration.
5. Monitoring + Incident Manager.
6. Automation Engine with resumable/idempotent approval-aware workflows.
7. AI Copilot with no direct production mutation.
8. Browser QA real production smoke.
9. Telegram Mini App backed by the same workspace/control-plane APIs.
10. Plugin ecosystem and multi-project control plane.
11. Final hardening, recovery drills, docs and versioning.

## Project Boundaries
- Nexa Dev Bot is independent from Finora / Factor-easy unless an explicit adapter is added.
- Do not mix other projects' Supabase/database state into Nexa by default.
- Keep secrets out of code, logs and documentation.
