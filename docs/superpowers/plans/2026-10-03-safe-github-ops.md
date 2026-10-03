# Safe GitHub Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable Telegram approvals and safe GitHub workflow operations on top of the production-accepted plugin foundation.

**Architecture:** Keep the existing `resolve -> policy -> execute` boundary. Add an HMAC-backed approval service between the first approval-required dispatch and a second approved dispatch, persist one-time consume semantics through a SQLite Cloudflare Durable Object, then extend the existing GitHub plugin/service/menu with workflow read/write actions.

**Tech Stack:** JavaScript ES modules, Node test runner, Cloudflare Workers Web Crypto, Cloudflare Durable Objects with SQLite storage, Telegram Bot API, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-10-03-safe-github-ops-design.md`

## Global Constraints
- Owner-only authorization remains enforced at the Worker boundary.
- `READ` executes immediately; `WRITE` and `DESTRUCTIVE` require verified approval.
- Approval tokens use HMAC-SHA-256 and never appear in audit logs.
- One-time approval consumption is persisted through `APPROVAL_REPLAY_GUARD`; missing replay protection fails closed.
- No optional AI/browser/third-party paid service is enabled in this phase; the Durable Object namespace is part of the required security architecture for replay protection.
- Existing GitHub repository/file UX remains backward compatible.
- Provider failures remain explicit; no fabricated success.

## Review Focus
- Tampered/expired/wrong-owner approval callback must never reach provider execution.
- Telegram callback-data size overflow must fail closed before rendering an unusable button.
- GitHub token 401/403/409/422 responses must surface as failures, not success.
- Duplicate approval callback must not execute provider code twice even across Worker isolates.
- Missing Durable Object binding must fail closed for approved WRITE execution.
- Existing READ navigation and Cloudflare fetch regression must remain green.

---

### Task 1: Approval service and policy semantics

**Files:**
- Create: `src/core/approval.js`
- Modify: `src/core/action-policy.js`
- Test: `test/approval.test.js`
- Test: `test/action-policy.test.js`

**Interfaces:**
- Produces: `ApprovalService.issue(payload) -> token`, `ApprovalService.verify(token, expectations) -> payload`, `ApprovalService.consume(token, expectations) -> payload`.
- Produces: `ActionPolicy.evaluate({ action, isOwner, approved })`.

- [x] Write failing tests for valid issue/verify, tamper, expiry, wrong owner, wrong action, oversize and replay.
- [x] Run targeted tests and verify RED.
- [x] Implement minimal approval service using Web Crypto HMAC-SHA-256 and bounded base64url payloads.
- [x] Extend policy to allow approved owner WRITE/DESTRUCTIVE actions.
- [x] Run targeted tests and verify GREEN.

### Task 2: Router approved dispatch and audit lifecycle

**Files:**
- Modify: `src/core/router.js`
- Test: `test/plugin-router.test.js`
- Test: `test/audit.test.js`

**Interfaces:**
- Consumes: `context.approved === true` after approval verification.
- Produces: policy-enforced execution and approval lifecycle audit records without signed tokens.

- [x] Add failing tests proving unapproved write does not execute and approved write does.
- [x] Verify RED.
- [x] Pass `approved` into policy and add safe audit fields.
- [x] Verify GREEN and full router/audit tests.

### Task 3: GitHub workflow REST service

**Files:**
- Modify: `src/github.js`
- Test: `test/github.test.js`

**Interfaces:**
- Produces: `listWorkflowRuns`, `getWorkflowRun`, `listWorkflowJobs`, `rerunFailedWorkflowRun`, `cancelWorkflowRun`.

- [x] Add failing path/method/body/error tests.
- [x] Verify RED.
- [x] Implement minimal authenticated REST methods through existing request helper/repository resolver.
- [x] Verify GREEN including 401/403/404/409/422 failure handling.

### Task 4: GitHub plugin actions and workflow views

**Files:**
- Modify: `src/plugins/github/manifest.js`
- Modify: `src/plugins/github/plugin.js`
- Test: `test/github-plugin.test.js`
- Test: `test/navigation.test.js`

**Interfaces:**
- Produces READ actions for workflow runs/jobs and WRITE actions for rerun/cancel.
- Produces compact Telegram views and callback IDs using repository/run IDs.

- [x] Add failing route/view/risk tests.
- [x] Verify RED.
- [x] Add manifest actions, callback resolvers and bounded workflow views.
- [x] Verify GREEN and existing navigation regression suite.

### Task 5: Telegram confirmation flow and durable replay protection

**Files:**
- Modify: `src/bot.js`
- Modify: `src/index.js`
- Create: `src/core/durable-replay-store.js`
- Create: `src/durable/approval-replay-guard.js`
- Modify: `wrangler.jsonc`
- Test: `test/approval-flow.test.js`
- Test: `test/durable-replay.test.js`

**Interfaces:**
- Consumes router `requiresApproval` response.
- Produces `approve:<token>` and `cancel:<token>` callbacks and a second approved dispatch.
- Persists nonce consumption through `APPROVAL_REPLAY_GUARD` so a token cannot be consumed again from another Worker isolate.

- [x] Add failing tests for confirmation rendering, cancel, verified approval, malformed/expired token and duplicate consume.
- [x] Verify RED.
- [x] Integrate `ApprovalService` with bot callback flow; never log token.
- [x] Add Durable Object replay adapter/guard and fail closed when the binding is unavailable.
- [x] Export `ApprovalReplayGuard` and declare its SQLite Durable Object binding in Wrangler.
- [x] Verify GREEN and existing `/start`, `/repos`, stale callback tests.

### Task 6: Local runtime command and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Produces `npm start` -> `wrangler dev` for local Worker development.

- [x] Change local start command without altering production deploy workflow.
- [x] Document safe operations, Durable Object replay guard and provider permission requirement.
- [ ] Update project checkpoint with exact test/PR/deploy evidence after verification.

### Task 7: PR, CI, deployment and runtime verification

**Files:** none unless fixes are required.

- [x] Run full PR CI and inspect logs: run `37094394332`, 15 test files, 78/78 tests passed, 0 failed/skipped.
- [ ] Review complete PR diff for scope and secret leakage.
- [ ] Merge only after green CI.
- [ ] Verify post-merge main CI and exact-commit Cloudflare deployment.
- [ ] Verify the `APPROVAL_REPLAY_GUARD` binding and SQLite Durable Object on the active Cloudflare deployment.
- [ ] Verify owner-device READ navigation telemetry on current version.
- [ ] Attempt a write smoke only if the configured runtime GitHub token already permits the chosen operation and the owner explicitly confirms it in Telegram; otherwise record provider-permission smoke as `NOT VERIFIED` without rotating secrets automatically.
