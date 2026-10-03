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
- Owner-scoped Repository Workspace storage via `WORKSPACE_STORE` / `WorkspaceStore` on the implementation branch; production deployment is still NOT VERIFIED.
- GitHub plugin in `src/plugins/github/`; provider adapter in `src/github.js`.
- Exact-commit CI/deploy workflows under `.github/workflows/`.

## Security / Data-Trust Invariants
- Non-owner Telegram updates are ignored before private-data access.
- `READ` is owner-only; `WRITE` / `DESTRUCTIVE` require verified owner approval.
- Approval is owner/action/risk/target/expiry-bound and one-time consumed through Durable Object storage.
- Provider mutation never executes before policy approval.
- Provider errors are explicit; no fabricated success or fallback data.
- Secrets, source/draft text and signed approval callback tokens must not appear in logs/docs.
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

## Repository Workspace / Code Editor Phase 1 — PR #21 IN PROGRESS
- Design spec: `docs/superpowers/specs/2026-10-03-repository-workspace-editor-design.md`.
- Implementation plan: `docs/superpowers/plans/2026-10-03-repository-workspace-editor.md`.
- Implementation branch: `spec/repository-workspace-editor`.
- PR #21 targets `main` and now contains implementation work; it is no longer design-only.
- Phase 1 remains branch-first only: no direct default-branch mutation, no force update, no automatic merge/rebase/conflict resolution.

### Locked implementation constraints
- Owner-scoped short navigation refs; raw long paths never appear in callback data.
- Editable Phase-1 text ceiling: 3,000 Unicode code points and 12,000 UTF-8 bytes; overflow is rejected, never silently truncated.
- Sensitive/private-key-like paths, binary-like content and Git LFS pointers are not editable.
- Navigation/workspace handles are 10 URL-safe chars; commit-intent IDs are exactly 8 URL-safe chars.
- Target branch is `nexa/edit-<workspaceId>`.
- Draft/source content is never placed in callback data or audit metadata.
- Repeated Ready on unchanged material reuses the existing immutable intent.
- Provider Git commit creation remains NOT VERIFIED live until Task 6 is completed and owner-device production acceptance passes.

### Task 1 — Workspace policy/diff primitives: COMPLETE
- `src/core/workspace-policy.js` implements editable-file policy, commit-message normalization, target-branch normalization, SHA-256 digests and bounded unified diff with exact full-content counts.
- RED evidence was captured before implementation.
- GREEN checkpoint CI #185 completed with 105/105 passing at that task head.

### Task 2 — Durable owner-scoped Workspace Store: COMPLETE
- Added `WORKSPACE_STORE` / `WorkspaceStore` client + Durable Object state machine.
- Owner isolation, navigation/workspace expiry, one-shot pending input, READY invalidation/reuse, COMMITTING/COMMITTED state and cancellation are covered by tests.
- GREEN checkpoint CI #192 completed with 113/113 passing at that task head.
- Production deployment of the new binding/class: NOT VERIFIED.

### Task 3 — Path-safe repository browser/editor entry: COMPLETE
- Workspace file navigation uses short Durable refs after policy; legacy tree/blob/path-bearing callbacks remain compatible.
- Eligible file preview exposes Edit; sensitive/LFS/oversized files remain readable with edit disabled.
- `wedit` pins current default-branch HEAD/tree and exact file/blob/content before creating a durable local draft.
- Archived repositories cannot create editable drafts.
- GREEN checkpoint CI #200 / run `37112677199`, job `111173499300`: 121/121 pass, 0 fail/skip/cancelled.

### Task 4 — Telegram Draft Input, Diff and Sealed Intent UX: COMPLETE
- RED CI #201 / run `37113613413`, job `111176071940`: 126 tests total, 121 pass / 5 expected failures for missing message routing and `wtext`/`wmsg`/`wdiff`/`wready` behavior.
- Added policy-routed `dispatchMessage`; source text is not audit metadata.
- Bot preserves `/start`/`/menu`/`/repos`/`/status` precedence, then owner pending workspace text is routed with the exact untrimmed message body.
- Pending draft/message input is one-shot; rejected draft input does not mutate the prior draft.
- Diff is HTML escaped and bounded while additions/deletions are computed over complete content.
- READY requires changed content + normalized commit message, binds stable digests/base/path/branch/timestamp, reuses unchanged intent and emits only short `wscommit:<repoId>:<intentId>` callback data.
- GREEN CI #207 / run `37114230736`, job `111177792978`: 27 test files, 127/127 pass, 0 fail/skip/cancelled.

### Task 5 — GitHub Git Data commit primitives: COMPLETE
- RED CI #209 / run `37114394075`, job `111178254379`: 132 tests total, 127 pass / 5 expected failures for missing Git Data primitives.
- `requestJson` now supports opt-in `allowNotFound`; only HTTP 404 may return `null`, while 403/409/422 and other provider errors remain explicit.
- Added `getGitRef`, `createGitBlob`, multi-file-capable `createGitTree`, deterministic `createGitCommit`, and create-only `createGitBranchRef`.
- Branch paths containing `/` are safely encoded for ref reads; every provider/object SHA is full 40-hex validated.
- Commit author/committer identity and timestamp are deterministic, making ambiguous Git object creation retries material-stable.
- Phase 1 intentionally exposes no update-ref/force-ref primitive.
- GREEN CI #210 / run `37114509763`, job `111178575800`: 28 test files, 132/132 pass, 0 fail/skip/cancelled.
- These Git Data writes are verified only against mocked provider contracts; live GitHub branch commit remains NOT VERIFIED.

### Remaining implementation tasks
- Task 6: compact workspace Safe Approval codec + idempotent commit orchestration + safe audit metadata.
- Task 7: whole-branch review, merge, exact post-merge CI/deploy, Cloudflare binding verification and owner-device production acceptance.

## Next Executable Actions
1. Execute Task 6 RED -> GREEN for Safe Approval/idempotent branch commit orchestration; no provider WRITE before approval.
2. Run Task 7 exact whole-branch verification and secret-pattern scan; review PR #21 against the approved spec.
3. Merge only a reviewed green head, verify exact `main` CI and Cloudflare deployment/bindings, then perform owner-device pre-approval and approved-commit smoke.
4. Do not call Repository Workspace Phase 1 production-accepted until Telegram, GitHub and Cloudflare runtime evidence agree.

## Remaining Roadmap
1. Repository Workspace / Code Editor Phase 1, then multi-file expansion.
2. Remaining useful GitHub Advanced WRITE actions, always through Safe Approval.
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
