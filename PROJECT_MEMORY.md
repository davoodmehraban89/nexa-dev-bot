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
- Cloudflare Observability issue summary after deploy showed 0 active issues and 0 active occurrences.

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

### Owner-device production smoke findings
- Owner exercised the new Advanced READ menu on Telegram after production deploy; most tested paths rendered and navigated as expected.
- `Issues` failed live with GitHub `403 Resource not accessible by personal access token`.
- Cloudflare production audit confirmed `github.issues.list` passed central READ policy and then failed only at the GitHub provider boundary with that 403.
- Root cause: the existing fine-grained PAT does not currently grant Repository permissions -> Issues -> Read. Existing visible permissions include Metadata Read plus Actions/Code/Pull requests Read and Write.
- `Releases` did not fail: a direct GitHub releases read returned an empty list `[]`, proving this repository currently has no GitHub Releases. The old Telegram empty-state wording was merely ambiguous.

## Current Work — PR #20 Live-Smoke Findings Hardening
- Branch: `fix/issues-permission-release-empty-ux`.
- Draft PR #20: `fix: clarify Issues permission and empty Releases state`.
- Scope is UI/error-guidance only; no new provider mutation is added.
- Issues 403 feedback now tells the owner the exact least-privilege setting required: Fine-grained token -> Repository permissions -> Issues -> Read.
- Empty Releases view now explicitly says that no GitHub Release is published for the repository instead of presenting an ambiguous not-found message.

### TDD evidence
- RED CI #173 / run `37106220231`: 23 test files, 99 tests total, 97 pass / exactly 2 expected failures for the live Issues-permission guidance and empty Releases wording.
- GREEN CI #175 / run `37106470008` at implementation head `d779c746dd4c0dadb652f9d2375ba7765ff5803b`: 23 test files, 99/99 pass, 0 fail/skip/cancelled.
- A fresh final CI is still required after this memory checkpoint because this documentation commit moves the PR head.

### Not yet production-accepted
- PR #20 is not merged/deployed at this checkpoint.
- Exact post-merge `main` CI and Cloudflare deployment for PR #20 are NOT VERIFIED.
- Issues live success remains NOT VERIFIED until the owner adds only `Issues: Read` to the existing fine-grained token and repeats the Telegram Issues read.
- Releases source-backed empty state is verified at the GitHub API boundary, but the revised Telegram wording is NOT VERIFIED on the owner device until PR #20 is deployed.

## Next Executable Actions
1. Run fresh final PR #20 CI after this checkpoint; review the exact diff and secret patterns.
2. Mark PR #20 ready and squash-merge only the exact reviewed green head.
3. Verify exact post-merge `main` CI, deploy, active Cloudflare version and production runtime/telemetry.
4. Owner adds only `Repository permissions -> Issues -> Read` to the existing fine-grained GitHub token; do not regenerate or rotate the token unnecessarily.
5. Owner repeats Telegram `Issues` and `Releases`; verify production audit records provider success for both reads.
6. Close GitHub Advanced READ production acceptance only after that owner-device/runtime verification.
7. Then implement remaining GitHub Advanced WRITE items only where operationally useful and always through Safe Approval, followed by Cloudflare Ops.

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
