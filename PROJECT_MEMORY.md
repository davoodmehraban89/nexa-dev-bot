# PROJECT_MEMORY.md

## Latest implementation checkpoint — 2026-10-25
- Primary-entry correction (2026-10-26/27): owner requires the real Mini App from `/start`. `web/` React/TypeScript/CodeMirror app, authenticated Studio repository/tree/Workspace APIs, conditional saves/review+message CAS and existing Telegram Approval handoff implemented; see `docs/roadmap/MINIAPP_PRIMARY_ENTRY.md`. Node22 full492 tests/type/lint/format/web+Worker dry-run passed; actual local workerd/SQLite and Chromium mobile/desktop passed with provider stubs, not real owner-device evidence. Existing live cc7772d deployment remains historical until the PR records the corrected entry rollout. Full PAT/G1 and gate acceptance remain incomplete.
- Follow-up code head `515333d224a5cd9133023a479512fa0a458f9f25`: C-30 token deletion/revocation warning (new/edited text/captions), no Telegram Paste/upload source input, durable one-use TOTP steps across distinct Approvals, validated own-environment Editor links. Full Node22 suite **390 passed**, zero failures/skips; lint zero errors/13 existing warnings, formatting/dry-run pass. Actual local workerd/SQLite full Phase1 + signed Approval against outbound stubs passed across restart; not real owner/provider evidence. See latest section of the hardening report. Wrong-TOTP attempt increments remain an explicitly recorded P2 follow-up.
- Owner requested continued implementation in this environment. Delivery branch remains `feat/studio-g0-foundation`, PR #65; main baseline remains `5d1c083d326db327cc3973a9d3adecc1d8092c91`.
- Code head `e02e9fb976f11167aa04a842f881dedb3e11a3ef`: bounded exact Diff, durable Automation claims/CAS, transactional Incident updates, active-runtime/SHA correlation and workflow tagging, metadata-only Telegram source views plus authenticated read-only Mini App file/Diff reading.
- Full local Node 22 suite: 353 pass, zero fail/skip/cancel; lint zero errors (13 existing warnings), formatting and Worker dry-run pass. Actual local workerd/SQLite concurrency/restart smoke and jsdom read-only rendering smoke pass.
- Cloudflare Preview failure was confirmed as error10067 /100DO namespace Free limit. Only the G0 branch trigger was changed reversibly to `npm run build:check`; no namespace deletion, paid upgrade or production deploy.
- Full details and remaining R-07/G0/device/approval/ambiguous-effect limits: `docs/roadmap/G0_HARDENING_2026_10_25.md`. Historical checkpoints below are not current blockers or gate acceptance.

## Project Identity
- Name: Nexa Dev Bot
- Repository: `davoodmehraban89/nexa-dev-bot`
- Canonical branch: `main`
- Visibility: public (live API confirmed 2026-10-25; historical private/billing notes below are stale)
- Purpose: owner-only Telegram developer console for GitHub visibility and controlled developer operations.
- This file is the continuity source of truth; live repository/runtime evidence overrides stale text.

## AI Handoff Protocol
1. Verify live `main`, recent CI/deploy and relevant runtime evidence before changes.
2. Prefer live evidence over chat memory.
3. Keep durable checkpoints here and never store secrets/tokens/private keys.
4. Do not call a phase production-accepted from CI alone; deployment and owner-device/runtime evidence are separate gates.
5. Production WRITE / DESTRUCTIVE provider actions must remain behind Safe Approval and durable one-time replay protection.

## Latest checkpoint — 2026-10-24, PR #63 verification recovery
- Live `main` at investigation: `5d1c083d326db327cc3973a9d3adecc1d8092c91`; PR #63 remains on `fix/editor-safe-file-options`.
- Actions CI run `40100142480`, job/check `120890430470`, on candidate `18f663c2962478f2016dfb309034277c18239e12` never received a runner and had zero steps. Its failure annotation explicitly reports failed recent account payments or a spending limit needing increase. This is an account billing blocker, not evidence that tests failed.
- The original candidate's full suite passed locally on Node `22.23.4`: **268 tests, 0 failures/cancelled/skipped**. Wrangler `4.152.0` on Node 22 also completed `deploy --dry-run` with all five Durable Object bindings and no upload. Local checks do not replace PR/main CI or runtime verification.
- A separate local jsdom `26.1.0` smoke executed the generated page with markup-shaped, quoted, entity and Unicode filenames. Exact option labels/values/count, selection, authenticated draft-save payload and absence of injected script execution were verified. This is DOM emulation, not owner-device browser/Telegram acceptance.
- Three independent AI-agent reviews covered security, test behavior and release operations for that candidate. No blocking code regression was found; these are not submitted GitHub or human approvals. Reviewers recommended behavioral coverage beyond the two original source-pattern tests.
- Recovery changes replace regex-only coverage with four executed-script behavior tests plus one construction guard: literal filename labels/values and selection, authenticated draft saving, legacy single-file fallback and navigation/reload. Final local Node 22 suite: **271 tests, 0 failures/cancelled/skipped**. Test mutations mangling option values or labels correctly failed the behavioral tests; no production source was edited for mutation checks.
- The option DOM construction is defense in depth. No exploitable XSS was demonstrated in the previous correctly escaped interpolation; avoid claiming a proven vulnerability.
- Cloudflare reported a failed PR Preview build for `18f663c`; its build log was not available, so the cause remains unverified and separate from Actions billing.
- Recovery procedure: `docs/OPERATIONS_RUNBOOK.md`, “Actions job fails before checkout”. PR #63 remains draft and unmerged. Account owner must resolve GitHub Billing, then obtain fresh CI on the final reviewed head before merge and exact-main CI/deploy/runtime checks afterward. No production deployment or direct-main write was performed in this recovery session.

## Current Architecture
- Cloudflare Worker webhook boundary in `src/index.js`.
- Telegram coordinator and Safe Approval lifecycle in `src/bot.js`.
- Plugin Registry + central Action Policy + Audit Logger + Plugin Router in `src/core/`.
- HMAC approval tokens in `src/core/approval.js`.
- Durable Object replay guard via `APPROVAL_REPLAY_GUARD` / `ApprovalReplayGuard`.
- Owner-scoped Repository Workspace storage via production `WORKSPACE_STORE` / `WorkspaceStore` Durable Object.
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

## Repository Workspace / Code Editor Phase 1 — DEPLOYED, FINAL WRITE ACCEPTANCE PENDING
- Design spec: `docs/superpowers/specs/2026-10-03-repository-workspace-editor-design.md`.
- Implementation plan: `docs/superpowers/plans/2026-10-03-repository-workspace-editor.md`.
- Phase 1 is branch-first only: no direct default-branch mutation, no force update, no automatic merge/rebase/conflict resolution.
- PR #21 merged to `main` at `5bbd943891189609dd85d40fd02fcb065bbe5c58`.
- Post-merge CI #224 / run `37116152691` succeeded on that exact SHA with 31 test files and 142/142 tests passing, 0 fail/skip/cancelled.
- Deploy #160 / run `37116164087` succeeded after checking out that exact SHA.
- Cloudflare version resources independently verified both `APPROVAL_REPLAY_GUARD` / `ApprovalReplayGuard` and `WORKSPACE_STORE` / `WorkspaceStore` bindings/classes active in production.

### Locked implementation constraints
- Owner-scoped short navigation refs; raw long paths never appear in callback data.
- Editable text ceiling: 3,000 Unicode code points and 12,000 UTF-8 bytes; overflow is rejected, never silently truncated.
- Sensitive/private-key-like paths, binary-like content and Git LFS pointers are not editable.
- Navigation/workspace handles are 10 URL-safe chars; commit-intent IDs are exactly 8 URL-safe chars.
- Target branch is `nexa/edit-<workspaceId>`.
- Draft/source content is never placed in callback data or audit metadata.
- Repeated Ready on unchanged material reuses the existing immutable intent.

### Implementation verification summary
- Task 1 policy/diff primitives: GREEN CI #185, 105/105.
- Task 2 Durable Workspace Store: GREEN CI #192, 113/113.
- Task 3 path-safe browser/editor entry: GREEN CI #200 / run `37112677199`, 121/121.
- Task 4 Draft input/diff/sealed intent: RED CI #201 121/126; GREEN CI #207 / run `37114230736`, 127/127.
- Task 5 Git Data primitives: RED CI #209 127/132; GREEN CI #210 / run `37114509763`, 132/132.
- Task 6 Safe Approval/idempotent commit orchestration: GREEN CI #219 / run `37115479051`, 141/141.
- Whole-branch provider-error hardening: RED CI #220 141/142; GREEN CI #221 / run `37115965768`, 142/142.
- Final PR head CI #223 succeeded before merge; post-merge exact-main CI #224 confirmed 142/142.

## Repository Workspace Upload + Telegram Input UX — PR #22 / PR #24 DEPLOYED
### PR #22 Upload File
- PR #22 merged to `main` at `290b416b511dc2cd6b77037ab7a65d275e3227c3`.
- Post-merge CI #234 succeeded with 151/151 tests.
- Deploy #170 succeeded and production version became `027572e8-d2c7-4866-ba88-2569e3cd1a79` at 100% traffic.
- Telegram document upload is a bounded UTF-8 whole-file Draft input; selected repository path remains authoritative and uploaded filename is transport metadata only.
- Owner-device smoke successfully uploaded an 85-byte text Draft for `.gitignore`; Diff showed exactly +1/-0 and no provider write had occurred.

### Production Ready failure root cause
- During owner-device smoke, pressing `✅ آماده Commit` produced a generic read/provider error and broken recovery navigation.
- Cloudflare Workers Observability later proved the underlying runtime error was exactly `Commit message is required` for action `github.workspace.ready`, not a GitHub outage/provider-read failure.
- The defect was therefore UX/error classification plus context recovery: validation was rendered as a provider error and Workspace/Draft navigation was lost.

### PR #24 Persistent menu + focused Paste input
- PR #24 `feat: persistent Telegram quick menu and focused code input` merged to `main` at `bd994b9eb4ba083a28be5d6054eb338c3ef25157`.
- PR-head CI run `37174476067` passed 157/157 tests.
- Post-merge main CI run `37174553422` succeeded on the exact merge SHA.
- Deploy run `37174567477` checked out the exact merge SHA and succeeded.
- Active Cloudflare version after deploy: `e35413ce-b979-409e-a98f-a9bfe1c98061`, 100% traffic; deployment ID `48bfe234-38e3-4aa0-8f5c-8645885ee8e4`.
- `/start` installs a persistent bottom Telegram quick menu for Main / Projects / Status / Tools / Security.
- Persistent-menu text has precedence over pending Draft input so navigation text cannot accidentally become source code.
- `Paste text` uses a focused Telegram ForceReply prompt while preserving raw message text/newlines. Native Bot API does not provide an arbitrary multiline modal/textarea; a true embedded editor belongs in a Telegram Mini App/Web App.

## Workspace Validation + Recovery Hardening — PR #25 IN PROGRESS
- Branch: `fix/workspace-recovery-validation`; PR #25 targets `main`.
- Production telemetry root cause was reproduced first through regression tests.
- RED CI run `37175562475`: 159 total, 157 pass / exactly 2 expected failures for explicit Ready validation and Workspace recovery actions.
- First GREEN CI run `37175910574`: 37 test files, 159/159 pass.
- A second review found that an approved Workspace provider failure still only returned to the Project and lost direct Draft recovery.
- Second RED CI run `37176064626`: 160 total, 159 pass / exactly 1 expected failure because the new approved-failure recovery builder did not yet exist.
- Current implementation recovers Workspace context from Durable `getWorkspace` for ordinary callback failures and Durable `getIntent` for post-approval provider failures; it does not rely on process-memory Maps.
- Validation errors such as missing/oversized Commit message and no Draft change are rendered as validation, not provider-read failures.
- Workspace failure views now provide bounded routes for Retry / Commit Message where relevant / Continue Draft / Project / Main Menu.
- Approved provider failure uses the durable intent to offer a fresh Ready/Safe-Approval path plus Continue Draft / Project / Main Menu; the consumed approval is never reused.
- Code head `13c1dce244cc257ed2c64cca8cd1033ba1952d31` passed CI run `37176281102`: 38 test files, 161/161 pass, 0 fail/skip/cancelled.
- Final documentation head `8964a0811d204d9da313678b358f0e78fee8473c` passed fresh CI run `37176398455`: 38 test files, 161/161 pass, 0 fail/skip/cancelled.
- Exact final PR diff was reviewed after the fresh CI; changed files are limited to `PROJECT_MEMORY.md`, `src/bot.js`, `src/core/callback-failure-view.js`, and the two recovery regression test files.
- Merge/deploy verification remains required.

### Production acceptance status
- Workspace production deployment and Durable Object bindings: VERIFIED.
- Owner-device file upload + exact Diff: VERIFIED.
- Persistent global Telegram quick menu and focused Paste UX: DEPLOYED; owner-device final smoke should be included in the next acceptance pass.
- Live branch-only Workspace provider WRITE: NOT YET VERIFIED on the current production flow because the previous smoke stopped before a valid Commit Message + Safe Approval confirmation.
- Repository Workspace Phase 1 must not be called production-accepted until owner performs the actual Telegram `✅ تأیید و اجرا` on a safe branch-only intent and GitHub + Cloudflare + Telegram evidence agree.

## Next Executable Actions
1. Mark PR #25 ready and merge only final reviewed head `8964a0811d204d9da313678b358f0e78fee8473c` using expected-head locking.
2. Verify exact post-merge `main` CI, deployment SHA, active Cloudflare version and runtime health.
3. Owner-device final Workspace smoke: choose a safe text file, create/update Draft, verify exact Diff, enter Commit Message, press Ready and reach Safe Approval.
4. Before approval, verify no unexpected provider mutation and `main` remains unchanged.
5. Owner presses the actual Telegram `✅ تأیید و اجرا`; verify `nexa/edit-*` branch/commit, branch file content, `main` unchanged, Cloudflare audit success and Telegram success feedback.
6. Only after those runtime gates pass, mark Repository Workspace Phase 1 production-accepted and continue to multi-file Workspace.

## Remaining Roadmap
1. Repository Workspace / Code Editor production acceptance, then multi-file expansion.
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
