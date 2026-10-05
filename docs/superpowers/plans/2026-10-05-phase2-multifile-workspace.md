# Phase 2 Multi-file Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing partially implemented multi-file Workspace so an owner can build, review, seal, approve and atomically publish a bounded multi-file Change Set to a dedicated `nexa/edit-*` branch without weakening the current security gates.

**Architecture:** Reuse the existing schemaVersion 2 Durable Workspace model, multi-file store methods and atomic Git blob/tree/commit orchestration already present on `main`. Finish the user-facing controller/editor/sealing path so every material file is represented in one deterministic immutable intent, and harden reconciliation/security tests around the existing single branch-ref publication point.

**Tech Stack:** JavaScript ES modules, Node built-in test runner, Cloudflare Workers + Durable Objects, Telegram Bot API/Mini App, GitHub Git Data API.

**Spec:** `docs/superpowers/specs/2026-10-05-phase2-multifile-workspace-design.md`

## Global Constraints

- Owner-only Telegram boundary remains mandatory.
- READ stays owner-only; WRITE/DESTRUCTIVE stay behind central Policy and Safe Approval.
- Kill Switch is checked before mutation and mutation fails closed when Kill Switch state is unreadable.
- No direct default-branch mutation, force update, automatic merge/rebase or silent conflict resolution.
- The only publication point is advancing the dedicated `nexa/edit-<workspaceId>` branch ref after all blobs/tree/commit objects exist.
- Source/draft bodies, secrets and signed approval material never enter callbacks, audit, incident data or logs.
- Single-file Workspace remains compatible as a one-entry Change Set.
- Existing size/path/binary/LFS safety policy remains enforced for every file.
- Every implementation change follows RED → GREEN TDD and lands in small reviewable commits.

## Review Focus

- Adding the same normalized path twice must be rejected without changing the Change Set.
- Reordering, adding, removing or editing files after Ready must invalidate the sealed intent and require a fresh approval.
- Mixed changed/unchanged files must seal and publish only a deterministic ordered descriptor set while keeping the aggregate intent stable.
- Failure after Git commit creation but before/around ref creation must reconcile against exact candidate/ref evidence and never publish a different commit.
- Multi-file Editor/API input must remain owner-bound and must never introduce a GitHub provider write path.

---

### Task 1: Complete multi-file Change Set controller and views

**Files:**
- Modify: `src/plugins/github/workspace.js`
- Test: `test/workspace-multifile.test.js`
- Test: `test/workspace-editor-v2.test.js`

**Interfaces:**
- Consumes: `DurableWorkspaceStoreClient.getWorkspace()`, `upsertWorkspaceFile()`, `updateWorkspaceFileDraft()`, `removeWorkspaceFile()`.
- Produces: controller callbacks that render all Change Set files, allow adding a safe repository file to the existing Workspace, remove a non-final file, and preserve the existing one-file UX.

- [ ] **Step 1: Write failing controller tests**
  - Workspace view with two files lists both paths and a bounded file count.
  - A callback for adding a repository file resolves to a READ operation first and performs no provider mutation.
  - Removing a file updates durable state and returns to the same Workspace.
  - Duplicate path addition is surfaced as a validation error.

- [ ] **Step 2: Run focused tests**
  Run: `node --test test/workspace-multifile.test.js test/workspace-editor-v2.test.js`
  Expected: new assertions FAIL because controller/UI only treats the primary file as editable material.

- [ ] **Step 3: Implement bounded multi-file controller behavior**
  Add callback parsing and rendering around existing store methods; keep callback payloads to opaque Workspace/navigation handles and never embed source/draft text.

- [ ] **Step 4: Run focused tests**
  Run: `node --test test/workspace-multifile.test.js test/workspace-editor-v2.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -am "feat(workspace): expose multi-file change set controls"`

### Task 2: Make Mini App editor file-aware without adding provider mutation

**Files:**
- Modify: `src/workspace-editor.js`
- Test: `test/workspace-editor-v2.test.js`
- Test: `test/workspace-editor-worker.test.js`

**Interfaces:**
- Consumes: Workspace `files[]`, `updateWorkspaceFileDraft({ ownerId, workspaceId, path, text, digest })`.
- Produces: GET response containing bounded file metadata and selected file draft; PUT accepting `workspaceId`, `path`, `text`.

- [ ] **Step 1: Write failing editor API tests**
  - GET returns all file paths plus the selected file.
  - PUT for a non-primary path calls only `updateWorkspaceFileDraft`.
  - Invalid/non-member path returns an explicit error.
  - No GitHub/provider object is accepted or invoked.

- [ ] **Step 2: Run focused tests**
  Run: `node --test test/workspace-editor-v2.test.js test/workspace-editor-worker.test.js`
  Expected: FAIL on non-primary selection/save.

- [ ] **Step 3: Implement file selection**
  Extend the editor request/page with a bounded file selector and path-scoped Draft save while preserving Telegram `initData` validation, CSP and existing size limits.

- [ ] **Step 4: Run focused tests**
  Run: `node --test test/workspace-editor-v2.test.js test/workspace-editor-worker.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -am "feat(workspace): make mini app editor file-aware"`

### Task 3: Seal deterministic multi-file Ready intents and aggregate Diff

**Files:**
- Modify: `src/plugins/github/workspace.js`
- Modify: `src/core/workspace-policy.js` only if a focused aggregate helper is needed
- Test: `test/workspace-multifile.test.js`
- Test: `test/workspace-policy.test.js`
- Test: `test/workspace-store.test.js`

**Interfaces:**
- Consumes: ordered `workspace.files[]`, `digestText()`, existing `sealIntent()`.
- Produces: immutable intent with `files: [{ path, sourceBlobSha, contentDigest }]`, aggregate deterministic `intentDigest`, one `commitMessageDigest`, target branch and exact base SHA/tree SHA.

- [ ] **Step 1: Write failing sealing/diff tests**
  - Two changed files produce one aggregate view and one ordered `files[]` intent.
  - File order/list/material change alters the intent digest and invalidates prior Ready.
  - Unchanged Change Set cannot Ready.
  - Single-file intent stays compatible.

- [ ] **Step 2: Run focused tests**
  Run: `node --test test/workspace-multifile.test.js test/workspace-policy.test.js test/workspace-store.test.js`
  Expected: FAIL because current controller seals only legacy primary-file fields.

- [ ] **Step 3: Implement deterministic Change Set material**
  Use the durable `files[]` order, validate every file against existing policy, include only bounded descriptors/digests in the sealed intent, and render per-file plus aggregate Diff without exposing draft bodies outside the normal bounded UI.

- [ ] **Step 4: Run focused tests**
  Run: `node --test test/workspace-multifile.test.js test/workspace-policy.test.js test/workspace-store.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -am "feat(workspace): seal deterministic multi-file intents"`

### Task 4: Harden atomic publication, reconciliation and security gates

**Files:**
- Modify: `src/plugins/github/workspace-commit.js`
- Modify: `src/plugins/github/workspace.js` only for evidence output
- Test: `test/workspace-multifile-commit.test.js`
- Test: `test/kill-switch.test.js`
- Test: `test/approval-flow.test.js`
- Test: `test/audit.test.js`

**Interfaces:**
- Consumes: existing GitHub `createGitBlob`, `createGitTree`, `createGitCommit`, `createGitBranchRef`, `getGitRef`, exact sealed intent and durable commit state.
- Produces: one deterministic candidate commit and one branch-ref publication result with bounded evidence.

- [ ] **Step 1: Write failing negative tests**
  - Partial blob/tree/commit failure never calls `createGitBranchRef`.
  - Ambiguous ref-create failure reconciles only when observed ref equals exact candidate SHA.
  - Existing unexpected target ref fails explicitly.
  - Changed file list/order/digest after Ready is stale.
  - Kill Switch locked/unreadable blocks provider mutation.
  - Audit result contains descriptors/digests/SHA only, never source/draft content or approval token.

- [ ] **Step 2: Run focused tests**
  Run: `node --test test/workspace-multifile-commit.test.js test/kill-switch.test.js test/approval-flow.test.js test/audit.test.js`
  Expected: any uncovered contract FAILS before production code is changed.

- [ ] **Step 3: Implement minimal reconciliation/security fixes**
  Preserve the branch ref as the only publication point; do not add compensating writes, force updates or default-branch mutation.

- [ ] **Step 4: Run focused tests**
  Run: `node --test test/workspace-multifile-commit.test.js test/kill-switch.test.js test/approval-flow.test.js test/audit.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -am "fix(workspace): harden atomic multi-file publication"`

### Task 5: Whole-phase regression, docs and production acceptance gate

**Files:**
- Modify: `README.md`
- Modify: `docs/OPERATIONS_RUNBOOK.md`
- Modify: `PROJECT_MEMORY.md`
- Create: `docs/PHASE2_MULTIFILE_ACCEPTANCE.md`
- Test: `test/final-acceptance-contract.test.js` or a focused new `test/phase2-multifile-acceptance.test.js`

**Interfaces:**
- Consumes: all prior task behavior.
- Produces: permanent regression contract and production acceptance record.

- [ ] **Step 1: Add documentation contract test**
  Assert docs state: multi-file Change Set, branch-only publication, exact base SHA, Safe Approval, Kill Switch, no direct `main` mutation, evidence requirements and single-file compatibility.

- [ ] **Step 2: Run full suite**
  Run: `npm test`
  Expected: all tests PASS with zero fail/skip/cancelled.

- [ ] **Step 3: Update operational docs**
  Document the multi-file user flow, failure recovery, stale/reseal behavior and production smoke procedure without storing source bodies or secrets.

- [ ] **Step 4: Re-run full suite**
  Run: `npm test`
  Expected: all tests PASS.

- [ ] **Step 5: Commit**
  `git commit -am "docs(workspace): record phase 2 multi-file acceptance gate"`

- [ ] **Step 6: PR and production verification**
  Open one Phase 2 PR from the implementation branch. Require exact-head green CI, review the exact diff, merge with expected-head locking, then verify post-merge exact-SHA CI and Cloudflare deploy/runtime evidence.

- [ ] **Step 7: Owner-device production smoke**
  On a safe repository text change set with at least two files: confirm exact aggregate/per-file Diff, enter one commit message, Ready, Safe Approval, verify no provider mutation before approval, then approve and verify one `nexa/edit-*` branch commit contains both intended changes while `main` remains unchanged.

- [ ] **Step 8: Close acceptance**
  Record exact merge SHA, CI run, deploy/version evidence, target branch, resulting commit SHA and owner-device/runtime outcome in `docs/PHASE2_MULTIFILE_ACCEPTANCE.md`. Only then mark Phase 2 complete.
