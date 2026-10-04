# Cloudflare Ops READ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, source-backed Cloudflare READ plugin and Telegram operational views for the production Worker.

**Architecture:** A focused Cloudflare service normalizes API reads; a plugin exposes READ-only actions through the existing registry/router; Ops UI links to those actions without changing the public status boundary. Provider credentials stay runtime-only and errors are redacted.

**Tech Stack:** Cloudflare Workers JavaScript, Telegram Bot API views, existing PluginRegistry/PluginRouter/ActionPolicy, Node 22 test runner.

**Spec:** `docs/superpowers/specs/2026-10-04-cloudflare-ops-read-design.md`

## Global Constraints
- Phase 1 is READ-only; no deploy/redeploy/rollback/settings mutation.
- Owner-only routing and existing central policy remain authoritative.
- Never render, persist, audit, or document secret values.
- Public `/status` stays minimal health-only.
- Explicit provider failure is required; no synthetic healthy state.
- Telegram text <= 4096 characters and callback_data <= 64 bytes.

## Review Focus
- Missing Cloudflare token/account/worker config must show unavailable, not success.
- Cloudflare non-2xx/API error payloads must not leak authorization material.
- Empty deployments/versions must render a valid explicit empty state.
- Unexpected/missing binding or observability fields must not crash Telegram rendering.
- Existing GitHub and public `/status` behavior must remain unchanged.

---

### Task 1: Cloudflare provider normalization

**Files:**
- Create: `src/plugins/cloudflare/service.js`
- Create: `test/cloudflare-service.test.js`

**Interfaces:**
- Produces: `CloudflareService({ token, accountId, workerName, fetchImpl? })`; `isConfigured()`; `getWorkerSnapshot()`.

- [ ] Write failing tests for configured/missing config, deployments, versions, settings/bindings/observability, empty responses, and redacted provider failures.
- [ ] Run `node --test test/cloudflare-service.test.js` and verify RED.
- [ ] Implement the minimal service using Cloudflare API v4 Worker script endpoints and normalized return data.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit provider + tests.

### Task 2: READ-only Cloudflare plugin and Telegram views

**Files:**
- Create: `src/plugins/cloudflare/plugin.js`
- Create: `test/cloudflare-plugin.test.js`

**Interfaces:**
- Consumes: `CloudflareService.getWorkerSnapshot()`.
- Produces: plugin manifest id `cloudflare`; READ action `cloudflare.worker.status`; callback `cf:status` with refresh/back navigation.

- [ ] Write failing tests for manifest risk, owner routing contract, source-backed rendering, empty/unavailable state, escaping, callback size, and 4096-byte-safe text.
- [ ] Verify RED.
- [ ] Implement minimal plugin/view.
- [ ] Verify focused tests GREEN.
- [ ] Commit plugin + tests.

### Task 3: Runtime registration and operational navigation

**Files:**
- Modify: `src/bot.js`
- Modify: `src/ops-menu.js` or the current operational menu owner
- Modify: `test/ops-console.test.js`
- Modify/add bot integration test as required.

**Interfaces:**
- Consumes: Cloudflare plugin/service.
- Produces: registered Cloudflare plugin and an owner-only operational entry to `cf:status`.

- [ ] Write failing integration tests proving registry registration/navigation and missing-config behavior.
- [ ] Verify RED.
- [ ] Wire runtime config and plugin into `PluginRegistry`; add operational navigation without exposing credentials.
- [ ] Verify focused tests GREEN.
- [ ] Commit integration.

### Task 4: Security boundary and documentation sync

**Files:**
- Modify: `test/status-security.test.js` or existing public status boundary test.
- Modify: `src/guide-menu.js`
- Modify: `README.md`
- Modify: `PROJECT_MEMORY.md` only where current project checkpoint conventions require it.

**Interfaces:**
- Public HTTP `/status` remains unchanged/minimal.
- Guide/README describe Cloudflare READ capability and required config by name only.

- [ ] Add/confirm regression test that public `/status` contains no Cloudflare operational diagnostics.
- [ ] Update Guide/README without secret values or ephemeral version IDs.
- [ ] Run documentation/message/callback limit tests.
- [ ] Commit security/docs sync.

### Task 5: Full verification and delivery

**Files:** No product scope expansion.

- [ ] Run `npm test`; require zero failures.
- [ ] Review complete branch diff for secret leakage, accidental WRITE endpoints, callback/message limits, and unrelated changes.
- [ ] Open PR; verify exact-head GitHub CI and Cloudflare Preview.
- [ ] Merge with expected-head lock only after green checks.
- [ ] Verify post-merge main CI and Deploy both target exact merge SHA.
- [ ] Independently verify Cloudflare active deployment/version, 100% traffic, bindings, and observability.
- [ ] Record the completed checkpoint and report factual results.
