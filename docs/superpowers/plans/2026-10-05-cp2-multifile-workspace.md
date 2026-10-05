# CP2 Multi-file Repository Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing branch-only Workspace to atomically edit a bounded set of text files.

**Architecture:** Version the durable Workspace schema, represent files as an ordered bounded collection, seal immutable multi-file Ready intents, and reuse the existing Git Data commit path to create one tree/commit on `nexa/edit-*`. Preserve single-file compatibility and fail closed on stale base/material.

**Tech Stack:** Node.js ESM, Cloudflare Workers/Durable Objects, Telegram Bot API, GitHub Git Data API, node:test.

**Spec:** docs/superpowers/specs/2026-10-05-control-plane-completion-design.md

## Global Constraints
- Never mutate `main` directly.
- Owner-only; WRITE requires Safe Approval and durable replay protection.
- Per-file existing text/binary/sensitive/LFS policy remains authoritative.
- Callback data <=64 UTF-8 bytes; Telegram text <=4096 chars.
- No draft/source content in audit metadata.

## Review Focus
- Existing single-file records migrate/read without corruption.
- Duplicate/renamed paths cannot create ambiguous tree entries.
- Aggregate payload limit fails explicitly before persistence.
- Base SHA changes invalidate sealed intent.
- Retry after provider partial failure is idempotent.

---

### Task 1: Versioned multi-file Workspace model
**Files:**
- Modify: `src/durable/workspace-store.js`
- Modify: `src/core/workspace-store.js`
- Test: `test/workspace-store.test.js`
- Test: `test/workspace-store-file-input.test.js`

**Interfaces:**
- Consumes: existing owner-scoped workspace ID and single-file records.
- Produces: `files[]` records with path/baseSha/baseText/draftText and schemaVersion.

- [ ] Write failing tests for legacy-read migration, add/update/remove file, duplicate path rejection and aggregate bound.
- [ ] Run targeted tests and confirm RED.
- [ ] Implement minimal versioned storage and migration.
- [ ] Run targeted tests and confirm GREEN.
- [ ] Commit.

### Task 2: Multi-file policy, diff and immutable Ready intent
**Files:**
- Modify: `src/core/workspace-policy.js`
- Modify: `src/plugins/github/workspace.js`
- Test: `test/workspace-policy.test.js`
- Test: `test/workspace-editor-v2.test.js`

**Interfaces:**
- Consumes: versioned workspace files.
- Produces: aggregate diff summary and immutable intent containing ordered file descriptors.

- [ ] Add RED tests for per-file policy, aggregate diff, unchanged workspace, stale material/base and intent reuse.
- [ ] Implement bounded aggregate validation/diff and intent sealing.
- [ ] Run targeted tests GREEN and commit.

### Task 3: Atomic multi-file Git tree commit
**Files:**
- Modify: `src/plugins/github/workspace-commit.js`
- Modify: `src/github.js`
- Test: `test/workspace-approved-recovery.test.js`
- Test: `test/workspace-recovery-validation.test.js`

**Interfaces:**
- Consumes: approved immutable multi-file intent.
- Produces: exactly one branch commit/tree on `nexa/edit-<workspaceId>`.

- [ ] Add RED tests for one atomic tree, stale base rejection, partial-failure retry and reconciliation.
- [ ] Implement minimal multi-blob/tree orchestration reusing current Git Data primitives.
- [ ] Run targeted tests GREEN and commit.

### Task 4: Telegram/Mini App multi-file UX and recovery
**Files:**
- Modify: `src/workspace-editor.js`
- Modify: `src/plugins/github/plugin.js`
- Modify: `src/bot.js`
- Test: `test/telegram-menu-e2e.test.js`
- Test: `test/workspace-editor-worker.test.js`

**Interfaces:**
- Consumes: workspace file collection and aggregate diff.
- Produces: bounded add/select/remove/diff/ready/recovery views.

- [ ] Add RED navigation/callback-limit/recovery tests.
- [ ] Implement views without embedding raw long paths in callback data.
- [ ] Run targeted tests GREEN and commit.

### Task 5: CP2 release gate
- [ ] Run full `npm test`; expect zero failures/skips caused by CP2.
- [ ] Review diff for direct-main mutation, sensitive logging and callback overflow.
- [ ] Update README/Guide/PROJECT_MEMORY for multi-file behavior.
- [ ] PR, CI, Preview, locked-head merge, post-merge CI, exact-SHA deploy and production smoke.
