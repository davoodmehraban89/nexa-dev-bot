# CP7 Automation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable resumable developer workflows that pause safely at WRITE/DESTRUCTIVE steps.

**Architecture:** Use a dedicated Durable Object store for versioned workflow state machines. READ steps execute through existing adapters; mutation steps emit approval intents and pause. Resume validates the matching one-time approval and idempotency key before execution. Initial recipes compose existing CP3–CP6 capabilities only.

**Tech Stack:** Cloudflare Durable Objects, Node.js ESM, existing Plugin/Policy/Approval layer, Telegram, node:test.

**Spec:** docs/superpowers/specs/2026-10-05-control-plane-completion-design.md

## Global Constraints
- No new provider bypass path.
- Every mutation remains centrally policy checked and approval bound.
- Durable checkpoints before/after side effects.
- Idempotency prevents duplicate provider mutations.
- Cancellation/terminal failure are explicit and recoverable.

## Review Focus
- Worker restart between steps resumes correctly.
- Approval replay cannot advance workflow twice.
- Crash after provider success before checkpoint reconciles safely.
- Cancelled workflow never resumes mutation.
- Versioned recipe/state migration fails explicitly when unsupported.

---

### Task 1: State machine core
**Files:** create `src/core/automation.js`, create `test/automation.test.js`

- [ ] RED tests for step transitions, pause, resume, cancel, fail and idempotency.
- [ ] Implement pure state transition engine.
- [ ] GREEN and commit.

### Task 2: Durable automation store
**Files:** create `src/durable/automation-store.js`, create `src/core/automation-store.js`, modify Worker exports/config, tests.

- [ ] RED persistence/resume/version/owner-scope tests.
- [ ] Implement versioned DO API.
- [ ] GREEN and commit.

### Task 3: Policy-aware executor
**Files:** create `src/core/automation-runner.js`, modify `src/bot.js`/router, tests.

- [ ] RED tests: READ auto-run; WRITE/DESTRUCTIVE pause; exact matching approval resumes; replay/expiry/cancel fail closed.
- [ ] Implement runner using existing plugin actions and approval service.
- [ ] GREEN and commit.

### Task 4: Initial bounded recipes and UI
**Files:** create `src/plugins/automation/manifest.js`, `src/plugins/automation/plugin.js`, menu/registry/guide, tests.

- [ ] RED tests for recipe: diagnose failed CI -> propose existing recovery action -> approval -> execute -> verify; plus cancellation/retry.
- [ ] Implement only recipes composed of existing capabilities.
- [ ] GREEN and commit.

### Task 5: CP7 release gate
- [ ] Full `npm test`; whole-branch security review.
- [ ] Docs/Guide/PROJECT_MEMORY.
- [ ] PR/CI/Preview binding verification/locked-head merge/main CI/deploy.
- [ ] Production smoke proving durable resume and approval pause without destructive test mutation.
