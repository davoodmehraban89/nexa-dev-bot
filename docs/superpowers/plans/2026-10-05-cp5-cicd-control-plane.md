# CP5 CI/CD Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correlate exact-commit GitHub CI/deploy evidence with active Cloudflare runtime state in one owner-only control plane.

**Architecture:** Add a pure correlation layer that consumes existing GitHub and Cloudflare adapters and emits explicit pending/failed/success/mismatch states. UI actions delegate to CP3/CP4 routes; the correlator never mutates providers.

**Tech Stack:** Node.js ESM, GitHub Actions API, Cloudflare service, Telegram, node:test.

**Spec:** docs/superpowers/specs/2026-10-05-control-plane-completion-design.md

## Global Constraints
- Exact SHA correlation is mandatory.
- A green CI run alone is not deployment success.
- No invented timing/SLA.
- Correlator is READ-only.

## Review Focus
- CI success + wrong active version => mismatch.
- Deploy pending => pending, not success.
- Multiple deployments/traffic splits are represented.
- Missing provider evidence is unknown, not failure/success.
- Stale workflow runs are not mistaken for current SHA.

---

### Task 1: Correlation model
**Files:** create `src/core/cicd-control-plane.js`, create `test/cicd-control-plane.test.js`

- [ ] RED table tests for pending/failed/success/mismatch/unknown.
- [ ] Implement pure `correlateDeliveryState(input)`.
- [ ] GREEN and commit.

### Task 2: Provider aggregation
**Files:** `src/ops-menu.js`, GitHub/Cloudflare plugins as needed, new integration test.

- [ ] RED tests for exact-SHA reads and no mutation.
- [ ] Implement owner-only aggregate loader.
- [ ] GREEN and commit.

### Task 3: Telegram view
- [ ] RED tests for drill-down, recovery and callback limits.
- [ ] Implement state view with links/actions delegating to CP3/CP4.
- [ ] GREEN and commit.

### Task 4: CP5 release gate
- [ ] Full test, diff review, docs/memory.
- [ ] PR/CI/merge/deploy and production evidence showing exact SHA correlation.
