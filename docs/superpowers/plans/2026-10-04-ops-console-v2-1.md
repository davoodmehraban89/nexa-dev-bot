# Nexa Ops Console V2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shallow top-level Tools, Service Status, Security and Settings views with source-backed operational views that expose real diagnostics without adding unsafe provider mutations.

**Architecture:** Add a small `RuntimeDiagnostics` service that inspects only configuration presence, registered plugin metadata, Durable Object client configuration and a bounded live GitHub READ probe. Add `OpsMenuManager` on top of the existing guide-aware menu so operational callbacks stay isolated from GitHub plugin WRITE paths. Keep configuration read-only in V2.1 and rename the misleading Settings surface to Configuration; secrets are never displayed.

**Tech Stack:** JavaScript, Node test runner, Telegram Bot API UI, Cloudflare Workers, existing GitHubService/PluginRegistry/Durable Object clients.

**Spec:** User-approved completion of the currently shallow top-level menus in the active Nexa Dev Bot V2 product.

## Global Constraints

- READ diagnostics remain owner-only through the existing webhook boundary.
- No new provider WRITE or DESTRUCTIVE operation is introduced.
- Safe Approval, ActionPolicy and Workspace commit orchestration are not bypassed or modified.
- Never render secret/token values; only configured/not-configured state is allowed.
- Never fabricate latency, uptime, SLA, Cloudflare deployment state or external-service health.
- Telegram messages remain <=4096 characters and callback data <=64 UTF-8 bytes.

## Review Focus

- Missing production bindings must render as explicit failures, not success.
- GitHub provider errors must remain visible without claiming connectivity.
- Secret values supplied in env must never appear in diagnostics output.
- Existing Guide and Workspace routing must remain intact.
- Operational callbacks must be READ-only and cannot reach provider mutation paths.

---

### Task 1: Runtime diagnostics service

**Files:**
- Create: `src/core/runtime-diagnostics.js`
- Create: `test/ops-console.test.js`

**Interfaces:**
- Produces: `RuntimeDiagnostics.getSnapshot()`, `getPluginSummary()`, `probeGitHub()`, `runSelfCheck()`.

- [ ] Write failing diagnostics tests for configuration presence, secret redaction, plugin/action counts, GitHub success and GitHub failure.
- [ ] Run CI and verify RED for the missing diagnostics module.
- [ ] Implement the minimum diagnostics service.
- [ ] Run tests and verify GREEN.

### Task 2: Operational menu surfaces

**Files:**
- Create: `src/ops-menu.js`
- Modify: `src/guide-bot.js`
- Modify: `src/index.js`
- Modify: `test/ops-console.test.js`

**Interfaces:**
- Consumes: `RuntimeDiagnostics`.
- Produces: live `menu:status`, useful `menu:tools`, `menu:security`, and read-only `menu:settings`/Configuration views plus bounded drill-down callbacks.

- [ ] Add failing tests for Tools, live Status, Security Center, Configuration Center and callback limits.
- [ ] Verify RED.
- [ ] Implement `OpsMenuManager` and wire it into `GuidedNexaDevBot`; await live status in `/status`.
- [ ] Verify GREEN and the full suite.

### Task 3: Guide and continuity update

**Files:**
- Modify: `src/guide-menu.js`
- Modify: `test/help-guide.test.js`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Guide describes the operational menus that actually exist after Task 2.

- [ ] Add failing guide assertions for diagnostics/configuration/security subviews.
- [ ] Verify RED.
- [ ] Update the in-app guide and continuity checkpoint.
- [ ] Verify full suite GREEN.

### Task 4: Review, merge and production verification

- [ ] Review exact branch diff for accidental WRITE paths, secret exposure and Telegram transport limits.
- [ ] Run final CI on exact PR head.
- [ ] Merge with expected-head locking.
- [ ] Verify exact main CI and deployment SHA.
- [ ] Verify active Cloudflare Worker deployment/bindings without exposing secrets.
