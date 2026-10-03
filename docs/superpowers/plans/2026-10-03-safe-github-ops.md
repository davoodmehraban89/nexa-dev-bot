# Safe GitHub Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable Telegram approvals and safe GitHub workflow operations on top of the production-accepted plugin foundation.

**Architecture:** Keep the existing `resolve -> policy -> execute` boundary. Add an HMAC-backed approval service between the first approval-required dispatch and a second approved dispatch, then extend the existing GitHub plugin/service/menu with workflow read/write actions. No new external dependency is required.

**Tech Stack:** JavaScript ES modules, Node test runner, Cloudflare Workers Web Crypto, Telegram Bot API, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-10-03-safe-github-ops-design.md`

## Global Constraints
- Owner-only authorization remains enforced at the Worker boundary.
- `READ` executes immediately; `WRITE` and `DESTRUCTIVE` require verified approval.
- Approval tokens use HMAC-SHA-256 and never appear in audit logs.
- No new paid service/resource is enabled.
- Existing GitHub repository/file UX remains backward compatible.
- Provider failures remain explicit; no fabricated success.

## Review Focus
- Tampered/expired/wrong-owner approval callback must never reach provider execution.
- Telegram callback-data size overflow must fail closed before rendering an unusable button.
- GitHub token 401/403/409/422 responses must surface as failures, not success.
- Duplicate approval callback must not intentionally execute provider code twice in the same Worker isolate.
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

- [ ] Write failing tests for valid issue/verify, tamper, expiry, wrong owner, wrong action, oversize and replay.
- [ ] Run targeted tests and verify RED.
- [ ] Implement minimal approval service using Web Crypto HMAC-SHA-256 and bounded base64url payloads.
- [ ] Extend policy to allow approved owner WRITE/DESTRUCTIVE actions.
- [ ] Run targeted tests and verify GREEN.

### Task 2: Router approved dispatch and audit lifecycle

**Files:**
- Modify: `src/core/router.js`
- Test: `test/plugin-router.test.js`
- Test: `test/audit.test.js`

**Interfaces:**
- Consumes: `context.approved === true` after approval verification.
- Produces: policy-enforced execution and approval lifecycle audit records without signed tokens.

- [ ] Add failing tests proving unapproved write does not execute and approved write does.
- [ ] Verify RED.
- [ ] Pass `approved` into policy and add safe audit fields.
- [ ] Verify GREEN and full router/audit tests.

### Task 3: GitHub workflow REST service

**Files:**
- Modify: `src/github.js`
- Test: `test/github.test.js`

**Interfaces:**
- Produces: `listWorkflowRuns`, `getWorkflowRun`, `listWorkflowJobs`, `rerunFailedWorkflowRun`, `cancelWorkflowRun`.

- [ ] Add failing path/method/body/error tests.
- [ ] Verify RED.
- [ ] Implement minimal authenticated REST methods through existing request helper/repository resolver.
- [ ] Verify GREEN including 401/403/404/409/422 failure handling.

### Task 4: GitHub plugin actions and workflow views

**Files:**
- Modify: `src/plugins/github/manifest.js`
- Modify: `src/plugins/github/plugin.js`
- Modify: `src/menu.js`
- Test: `test/github-plugin.test.js`
- Test: `test/navigation.test.js`

**Interfaces:**
- Produces READ actions for workflow runs/jobs and WRITE actions for rerun/cancel.
- Produces compact Telegram views and callback IDs using repository/run/job IDs.

- [ ] Add failing route/view/risk tests.
- [ ] Verify RED.
- [ ] Add manifest actions, callback resolvers and bounded workflow views.
- [ ] Verify GREEN and existing navigation regression suite.

### Task 5: Telegram confirmation flow

**Files:**
- Modify: `src/bot.js`
- Test: `test/bot.test.js`

**Interfaces:**
- Consumes router `requiresApproval` response.
- Produces `approve:<token>` and `cancel:<token>` callbacks and a second approved dispatch.

- [ ] Add failing tests for confirmation rendering, cancel, verified approval, malformed/expired token and duplicate consume.
- [ ] Verify RED.
- [ ] Integrate `ApprovalService` with bot callback flow; never log token.
- [ ] Verify GREEN and existing `/start`, `/repos`, stale callback tests.

### Task 6: Local runtime command and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Produces `npm start` -> `wrangler dev` for local Worker development.

- [ ] Change local start command without altering production deploy workflow.
- [ ] Document safe operations and provider permission requirement.
- [ ] Update project checkpoint with exact test/PR/deploy evidence after verification.

### Task 7: PR, CI, deployment and runtime verification

**Files:** none unless fixes are required.

- [ ] Run full CI through PR and inspect logs for discovered test count/pass/fail/skip.
- [ ] Review complete PR diff for scope and secret leakage.
- [ ] Merge only after green CI.
- [ ] Verify post-merge main CI and exact-commit Cloudflare deployment.
- [ ] Verify owner-device READ navigation telemetry on current version.
- [ ] Attempt a write smoke only if the existing runtime GitHub token already permits the chosen operation; otherwise record provider-permission smoke as `NOT VERIFIED` without rotating secrets automatically.
