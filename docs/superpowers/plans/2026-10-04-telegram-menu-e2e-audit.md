# Telegram Menu E2E Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traverse every reachable Nexa Telegram menu path to its terminal views, verify that each report is source-backed, useful, recoverable and within Telegram limits, then replace weak reports with actionable equivalents.

**Architecture:** Treat the production callback graph as the test surface. Add contract tests that enumerate every static menu callback plus representative dynamic GitHub/Workspace routes, then improve only the views/providers whose output lacks operational value. Keep public `/status` minimal and all provider mutation behind existing policy/approval boundaries.

**Tech Stack:** Cloudflare Workers, JavaScript/Node 22, Telegram Bot API, GitHub REST API, Durable Objects, node:test.

**Spec:** Current production menu/source behavior on `main`; user-directed exhaustive audit on 2026-10-04.

## Global Constraints

- Owner-only boundary remains unchanged.
- READ actions do not require Safe Approval; WRITE/DESTRUCTIVE actions do.
- No Secret, token, full source/draft material, or signed approval token enters diagnostics/audit output.
- Public `/status` stays minimal health-only.
- Telegram message text <= 4096 characters; callback_data <= 64 UTF-8 bytes.
- Workspace GitHub writes remain branch-only (`nexa/edit-*`).
- Explicit failure is preferred over fabricated success.

## Review Focus

- Every visible inline/persistent button resolves to a real view/action or is explicitly unavailable.
- Terminal list views expose enough drill-down detail to make the report operationally useful.
- Back/refresh paths do not strand the owner.
- Dynamic GitHub/Workspace callbacks remain within Telegram callback limits.
- Provider failures remain redacted and recoverable.

---

### Task 1: Build exhaustive menu-graph regression coverage

**Files:**
- Create: `test/telegram-menu-e2e.test.js`
- Modify only if RED proves a routing defect.

**Interfaces:**
- Consumes: `GuidedNexaDevBot`, `OpsMenuManager`, GitHub plugin callback routing.
- Produces: regression coverage for all static menu/ops/security/config/help callbacks and representative repository/CI/PR/branch/issue/release/workspace paths.

- [ ] Write tests that traverse visible callbacks recursively with deterministic provider fixtures.
- [ ] Assert every reachable view has useful non-empty text, recovery navigation, <=4096 chars and callback_data <=64 bytes.
- [ ] Assert no unknown/placeholder callback silently falls back to a misleading success view.
- [ ] Run the test and capture RED for any defects found.

### Task 2: Upgrade weak repository reports

**Files:**
- Modify: `src/plugins/github/plugin.js`
- Modify: `src/github.js` only when a missing READ endpoint is required.
- Test: `test/telegram-menu-e2e.test.js`
- Test: relevant GitHub provider tests.

**Interfaces:**
- Consumes: normalized GitHub service methods.
- Produces: actionable repository drill-down views with safe back/refresh navigation.

- [ ] Add RED assertions for list-only terminal reports that lack decision-useful detail.
- [ ] Implement the minimum READ drill-down needed (prioritize Issue detail, Release detail, Commit detail where source data supports it).
- [ ] Preserve pagination and Telegram limits.
- [ ] Verify relevant tests GREEN.

### Task 3: Audit operational/security/configuration reports

**Files:**
- Modify: `src/ops-menu.js` only for source-backed usefulness fixes.
- Modify: `src/core/runtime-diagnostics.js` only if required by a proven gap.
- Test: `test/telegram-menu-e2e.test.js`

**Interfaces:**
- Consumes: runtime diagnostics snapshot/self-check.
- Produces: actionable owner-only operational reports without secret exposure.

- [ ] Verify Status, Tools, Security and Configuration submenus to terminal views.
- [ ] Replace descriptive-only output with source-backed state/action guidance where the current runtime already exposes it.
- [ ] Keep configuration read-only and `/status` public output unchanged.

### Task 4: Guide synchronization

**Files:**
- Modify: `src/guide-menu.js`
- Modify: `README.md` only when behavior changed.
- Test: `test/help-guide.test.js`

**Interfaces:**
- Consumes: final audited menu behavior.
- Produces: Guide text matching actual controls and recovery paths.

- [ ] Add/adjust Guide assertions for changed controls.
- [ ] Update Guide/README to match source truth.
- [ ] Verify Telegram limits.

### Task 5: Full verification and delivery

**Files:** no new production scope.

- [ ] Run relevant tests.
- [ ] Run full `npm test` and verify all discovered test files execute.
- [ ] Review diff for owner boundary, approval, secret-redaction and `/status` regressions.
- [ ] Open PR and verify CI and Cloudflare Preview.
- [ ] Merge with expected-head lock.
- [ ] Verify post-merge main CI and Deploy run target the exact merge SHA.
- [ ] Independently verify active Cloudflare deployment/version, traffic and required bindings.
