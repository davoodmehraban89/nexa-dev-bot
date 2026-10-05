# CP4 Cloudflare Ops Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Cloudflare READ foundation into a safe operational plugin with verified rollback/redeploy.

**Architecture:** Keep Cloudflare API mechanics in the existing service, expose source-backed bounded views in the plugin, and route rollback/redeploy through central DESTRUCTIVE approval bound to an exact known version/deployment. Secret values are never read into UI/audit.

**Tech Stack:** Cloudflare Workers REST API, Node.js ESM, Telegram, Safe Approval, node:test.

**Spec:** docs/superpowers/specs/2026-10-05-control-plane-completion-design.md

## Global Constraints
- Production/Preview must be visibly distinguished.
- Never expose secret values; bindings show name/type only.
- Deployment-changing actions are DESTRUCTIVE.
- Post-action verification must independently re-read active deployment/version.

## Review Focus
- Unknown version cannot be targeted.
- Traffic split must be shown accurately rather than assumed 100%.
- Provider API failure cannot produce success text.
- Preview state never verifies Production.
- Runtime error summaries redact query/token/source material.

---

### Task 1: Complete Cloudflare READ service
**Files:** `src/plugins/cloudflare/service.js`, tests under `test/cloudflare*.test.js`

- [ ] RED tests for deployments, versions, binding metadata, observability and bounded runtime error summaries.
- [ ] Implement only documented API reads and redaction.
- [ ] GREEN and commit.

### Task 2: Ops views and navigation
**Files:** `src/plugins/cloudflare/plugin.js`, `src/plugins/cloudflare/manifest.js`, `src/cloudflare-menu.js`, `src/ops-menu.js`

- [ ] RED source-backed/recovery/callback-limit tests.
- [ ] Implement deployments/versions/bindings/health/errors drill-down.
- [ ] GREEN and commit.

### Task 3: Exact-target rollback/redeploy approval
**Files:** service/plugin/manifest, `src/core/approval.js`, `src/bot.js`

- [ ] RED tests for DESTRUCTIVE classification, exact version binding, stale/unknown version, replay and no pre-approval mutation.
- [ ] Implement provider deployment mutation and approval route.
- [ ] GREEN and commit.

### Task 4: Independent verification
- [ ] RED/GREEN tests requiring post-mutation re-read to match target version/traffic.
- [ ] Full `npm test`, docs, PR, CI, merge, deploy.
- [ ] Verify active version/deployment/bindings directly through Cloudflare API.
