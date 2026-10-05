# CP3 GitHub Advanced WRITE Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete high-value GitHub WRITE controls without weakening Safe Approval.

**Architecture:** Extend the existing GitHub provider/plugin with workflow dispatch and job rerun only where supported. Every mutation is declared in the manifest, centrally policy-checked, target-bound in approval input, replay-safe and provider-error explicit.

**Tech Stack:** Node.js ESM, GitHub REST API, Telegram, Durable replay guard, node:test.

**Spec:** docs/superpowers/specs/2026-10-05-control-plane-completion-design.md

## Global Constraints
- No provider mutation before approval.
- Keep existing rerun-failed, cancel and exact-head PR merge semantics unchanged.
- WRITE/DESTRUCTIVE risk comes from manifest/policy, never hard-coded UI assumptions.
- Callback <=64 UTF-8 bytes.

## Review Focus
- Unsupported workflow/job states never show misleading buttons.
- Approval token binds immutable repo/action/target.
- Replay/expiry/owner mismatch fails closed.
- 403/404/409 provider errors remain visible.
- Retried callbacks do not duplicate mutation.

---

### Task 1: Provider methods
**Files:** `src/github.js`, `test/github-advanced-read.test.js`, new `test/github-advanced-write-completion.test.js`

- [ ] RED tests for workflow dispatch and job rerun request method/path/body/validation.
- [ ] Implement `dispatchWorkflow(repoRef, workflowId, {ref, inputs})` and `rerunJob(repoRef, jobId)`.
- [ ] GREEN targeted tests and commit.

### Task 2: Manifest, routes and eligibility
**Files:** `src/plugins/github/manifest.js`, `src/plugins/github/plugin.js`, `test/telegram-menu-e2e.test.js`

- [ ] RED tests for declared risk, eligible buttons, callback bounds and no provider call before policy.
- [ ] Implement routes/views; classify mutation risk per spec.
- [ ] GREEN and commit.

### Task 3: Approval binding and execution
**Files:** `src/core/approval.js`, `src/bot.js`, tests for approval/security.

- [ ] RED tests for repo/action/target binding, replay, expiry and owner mismatch.
- [ ] Extend compact codec only if callback budget requires it; preserve old codecs.
- [ ] GREEN and commit.

### Task 4: CP3 release gate
- [ ] Full `npm test`.
- [ ] Security/diff review.
- [ ] Update docs/memory.
- [ ] PR -> CI -> locked-head merge -> main CI -> deploy -> owner/runtime smoke.
