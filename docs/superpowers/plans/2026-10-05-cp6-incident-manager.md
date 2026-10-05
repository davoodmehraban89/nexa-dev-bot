# CP6 Monitoring & Incident Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist, deduplicate and resolve source-backed operational incidents without leaking sensitive data.

**Architecture:** Add a dedicated Durable Object incident store, a pure fingerprint/redaction layer, and an owner-only incident plugin/view fed by CP5/Cloudflare/GitHub failure evidence. Remediation links delegate to existing approved actions.

**Tech Stack:** Cloudflare Durable Objects, Node.js ESM, Telegram, node:test.

**Spec:** docs/superpowers/specs/2026-10-05-control-plane-completion-design.md

## Global Constraints
- Dedicated binding/class; never reuse approval/workspace storage.
- Persist only redacted summaries and stable evidence references.
- No automatic mutation during incident creation.
- Public status remains minimal.

## Review Focus
- Duplicate event updates existing incident.
- Different repo/SHA/provider failures do not collide.
- Token/source/query material is redacted.
- Provider outage is representable without fake root cause.
- Resolve/reopen transitions are deterministic.

---

### Task 1: Incident domain and redaction
**Files:** create `src/core/incidents.js`, create `test/incidents.test.js`

- [ ] RED tests for fingerprint, severity, redact, dedupe semantics.
- [ ] Implement pure domain helpers.
- [ ] GREEN and commit.

### Task 2: Durable incident store
**Files:** create `src/durable/incident-store.js`, create `src/core/incident-store.js`, modify `src/index.js`/Wrangler config, tests.

- [ ] RED CRUD/dedupe/resolve/reopen/owner-scope tests.
- [ ] Implement versioned DO API.
- [ ] GREEN and commit.

### Task 3: Evidence ingestion and Telegram UI
**Files:** `src/ops-menu.js`, plugin registry/menu files, integration tests.

- [ ] RED tests for failed CI/deploy/runtime evidence ingestion and recovery.
- [ ] Implement owner-only list/detail/resolve views; remediation delegates to CP3/CP4.
- [ ] GREEN and commit.

### Task 4: CP6 release gate
- [ ] Full test and migration/binding review.
- [ ] Docs/memory.
- [ ] PR/CI/Preview DO isolation/merge/deploy.
- [ ] Production verification of binding and dedupe behavior with non-destructive evidence.
