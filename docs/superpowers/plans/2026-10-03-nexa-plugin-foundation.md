# Nexa Dev Bot Plugin Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a small plugin kernel with explicit action risk policy and redacted auditing, then route existing GitHub behavior through a GitHub plugin without changing Telegram UX.

**Architecture:** Add focused core modules for registry, policy, audit, and routing. Wrap the existing `GitHubService`/`MenuManager` behavior in a GitHub plugin adapter so existing UI and transport remain stable while future integrations gain a common extension contract.

**Tech Stack:** JavaScript ES modules, Node.js 22 test runner, Cloudflare Workers, Telegram Bot API, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-10-03-nexa-plugin-foundation-design.md`

## Global Constraints

- Bot remains owner-only.
- No secret, token, authorization header, or private key may appear in audit output, repository files, or Telegram output.
- Existing callback navigation continues to edit the same Telegram message.
- Callback payloads remain within Telegram's 64-byte limit.
- Missing credentials fail closed.
- Every declared plugin action must pass central policy evaluation before execution.
- `WRITE` and `DESTRUCTIVE` actions are not automatically executed in Foundation v1.
- Worker remains stateless.
- No AI, Browser QA, Supabase, Sentry, Linear, Notion, Mini App, or full Cloudflare operator implementation in this phase.

## File Structure

New:
- `src/core/plugin-registry.js` — validates and indexes plugin manifests/actions.
- `src/core/action-policy.js` — evaluates `READ` / `WRITE` / `DESTRUCTIVE` actions.
- `src/core/audit.js` — best-effort structured audit with secret redaction.
- `src/core/router.js` — resolves commands/callbacks to one plugin and enforces policy before execution.
- `src/plugins/github/manifest.js` — GitHub plugin manifest/action declarations.
- `src/plugins/github/plugin.js` — adapter over current `GitHubService` and `MenuManager` GitHub routes.
- `test/plugin-registry.test.js`
- `test/action-policy.test.js`
- `test/audit.test.js`
- `test/plugin-router.test.js`
- `test/github-plugin.test.js`

Modified:
- `src/bot.js` — construct registry/router, route GitHub command/callbacks through plugin kernel, retain compatibility paths for non-GitHub menus.
- `PROJECT_MEMORY.md` — record request, implementation evidence, CI/deploy/runtime status.

## Review Focus

1. Duplicate plugin/action identifiers must fail fast instead of silently shadowing an existing route.
2. Unknown risk values or undeclared actions must be denied and must never invoke plugin code.
3. Audit serialization must redact secrets even when they occur inside nested error/message values.
4. A plugin returning `null` must not consume a route; the router must continue/fall back deterministically without dispatching two plugins.
5. Callback acknowledgement failure must still not block GitHub plugin rendering/editing after migration.

---

### Task 1: Plugin Registry

**Files:**
- Create: `src/core/plugin-registry.js`
- Create: `test/plugin-registry.test.js`

**Interfaces:**
- Produces: `PluginRegistry`, constructor `new PluginRegistry(plugins = [])`
- Produces: `registry.getPlugins()`, `registry.getAction(actionId)`, `registry.getPlugin(pluginId)`
- Manifest actions use `{ [actionId]: { risk: 'READ'|'WRITE'|'DESTRUCTIVE' } }`

- [ ] **Step 1: Write failing registry tests**

Cover valid registration, duplicate plugin ID, duplicate action ID, invalid risk, and lookup behavior.

- [ ] **Step 2: Run registry test and confirm RED**

Run: `node --test test/plugin-registry.test.js`
Expected: FAIL because `src/core/plugin-registry.js` does not exist.

- [ ] **Step 3: Implement `PluginRegistry` minimally**

Validate plugin `manifest.id`, `manifest.actions`, and allowed risk values. Store immutable lookup maps sufficient for later router/policy tasks.

- [ ] **Step 4: Run registry test and confirm GREEN**

Run: `node --test test/plugin-registry.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add plugin registry`

### Task 2: Action Policy and Redacted Audit

**Files:**
- Create: `src/core/action-policy.js`
- Create: `src/core/audit.js`
- Create: `test/action-policy.test.js`
- Create: `test/audit.test.js`

**Interfaces:**
- Consumes: action descriptors returned by `PluginRegistry.getAction(actionId)`
- Produces: `ActionPolicy.evaluate({ action, isOwner }) -> { allowed, requiresApproval, risk, reason }`
- Produces: `AuditLogger` with `log(event)` and shared redaction over configured secret values

- [ ] **Step 1: Write failing policy tests**

Assert owner `READ` is allowed without approval; `WRITE` and `DESTRUCTIVE` require approval and are not auto-executed; non-owner and missing/unknown action are denied.

- [ ] **Step 2: Run policy test and confirm RED**

Run: `node --test test/action-policy.test.js`
Expected: FAIL because module is missing.

- [ ] **Step 3: Implement `ActionPolicy` minimally**

Use exact risks `READ`, `WRITE`, `DESTRUCTIVE`; return deterministic reason strings and deny unknown/missing actions.

- [ ] **Step 4: Write failing audit tests**

Assert nested strings containing bot/webhook/GitHub secrets are emitted redacted and that logging exceptions do not escape to the caller.

- [ ] **Step 5: Run audit test and confirm RED**

Run: `node --test test/audit.test.js`
Expected: FAIL because module is missing.

- [ ] **Step 6: Implement `AuditLogger` minimally**

Accept secret values at construction, recursively sanitize string values, then emit structured events through an injectable sink defaulting to `console.log`; sink failure is swallowed after best-effort safe error logging.

- [ ] **Step 7: Run policy + audit tests and confirm GREEN**

Run: `node --test test/action-policy.test.js test/audit.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: add action policy and redacted audit`

### Task 3: Policy-Enforcing Plugin Router

**Files:**
- Create: `src/core/router.js`
- Create: `test/plugin-router.test.js`

**Interfaces:**
- Consumes: `PluginRegistry`, `ActionPolicy`, `AuditLogger`
- Produces: `PluginRouter.dispatchCommand(command, context)` and `PluginRouter.dispatchCallback(data, context)`
- Plugin handler result shape: `null` for no ownership, otherwise `{ actionId, view }` or `{ actionId, result }`

- [ ] **Step 1: Write failing router tests**

Assert exactly one matching plugin handles a route; `null` continues; unknown route returns `null`; declared `READ` runs; undeclared/denied action never reaches execution; WRITE/DESTRUCTIVE produce an approval-required normalized result without executing provider code; audit attempt/result events are emitted.

- [ ] **Step 2: Run router test and confirm RED**

Run: `node --test test/plugin-router.test.js`
Expected: FAIL because router module is missing.

- [ ] **Step 3: Implement `PluginRouter` minimally**

Resolve handlers in registry order, require the returned `actionId` to be declared by that plugin, evaluate policy, audit the decision, and only return/execute an already-produced read view when policy allows. For approval-required actions, return a normalized non-executed result.

- [ ] **Step 4: Run router test and confirm GREEN**

Run: `node --test test/plugin-router.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add policy enforcing plugin router`

### Task 4: GitHub Plugin Adapter

**Files:**
- Create: `src/plugins/github/manifest.js`
- Create: `src/plugins/github/plugin.js`
- Create: `test/github-plugin.test.js`

**Interfaces:**
- Consumes: existing `GitHubService` and `MenuManager`
- Produces: `createGitHubPlugin({ github, menu })`
- Manifest id: `github`
- Commands: `/repos`
- Callback ownership prefixes: `menu:repos`, `repo:`, `files:`, `tree:`, `blob:`, `pr:`, `commits:`, `status:`
- All Foundation v1 GitHub actions are `READ`

- [ ] **Step 1: Write failing GitHub plugin tests**

Assert `/repos` and each GitHub callback family map to a declared READ action and preserve the exact existing view objects returned by `MenuManager`; unrelated commands/callbacks return `null`.

- [ ] **Step 2: Run GitHub plugin test and confirm RED**

Run: `node --test test/github-plugin.test.js`
Expected: FAIL because plugin modules are missing.

- [ ] **Step 3: Implement GitHub manifest and adapter minimally**

Delegate rendering to current menu methods. Do not move GitHub API logic or rewrite menu copy.

- [ ] **Step 4: Run GitHub plugin test and confirm GREEN**

Run: `node --test test/github-plugin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add github plugin adapter`

### Task 5: Integrate Kernel into NexaDevBot Without UX Regression

**Files:**
- Modify: `src/bot.js`
- Modify: `test/bot.test.js`
- Modify: `test/navigation.test.js`
- Modify: `test/security.test.js` only if a new explicit policy assertion belongs there

**Interfaces:**
- Consumes: `PluginRegistry`, `ActionPolicy`, `AuditLogger`, `PluginRouter`, `createGitHubPlugin`
- Preserves: public behavior of `NexaDevBot.handleUpdate`, `handleMessage`, `handleCallbackQuery`

- [ ] **Step 1: Add failing migration regression tests**

Assert `/repos` and GitHub callback paths are dispatched through the plugin router, existing `/start`, `/status`, tools/settings/security compatibility paths remain unchanged, callback edits remain in-place, and callback acknowledgement failure still cannot block render/edit.

- [ ] **Step 2: Run focused migration tests and confirm RED**

Run: `node --test test/bot.test.js test/navigation.test.js`
Expected: at least the new plugin-routing assertions FAIL before integration.

- [ ] **Step 3: Integrate kernel into `NexaDevBot`**

Construct the GitHub plugin from the existing `github` and `menu` instances. Route `/repos` and GitHub callbacks through `PluginRouter`; keep `/start`, `/status`, and non-GitHub menu callbacks on existing compatibility paths for Foundation v1.

- [ ] **Step 4: Run focused migration tests and confirm GREEN**

Run: `node --test test/bot.test.js test/navigation.test.js`
Expected: PASS.

- [ ] **Step 5: Run complete suite**

Run: `npm test`
Expected: all existing and new tests PASS with zero failures/skips.

- [ ] **Step 6: Commit**

Commit message: `refactor: route github through plugin kernel`

### Task 6: Documentation, PR, CI, Deploy, Runtime Verification

**Files:**
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Consumes: completed implementation and CI/deploy evidence
- Produces: durable checkpoint with SHAs/run IDs and explicit NOT VERIFIED items

- [ ] **Step 1: Update `PROJECT_MEMORY.md`**

Record Foundation v1 architecture, files, test counts, PR/commit evidence, and deployment state. Do not mark owner-device smoke verified until observed.

- [ ] **Step 2: Run full suite one final time on branch**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Open PR to `main` and verify CI**

Expected: PR CI success; inspect logs for actual discovered test count and zero failures.

- [ ] **Step 4: Review PR diff for secrets and scope drift**

Expected: only Foundation v1 files; no tokens/secrets; no unrelated provider integrations.

- [ ] **Step 5: Merge only after CI is green**

Expected: squash/merge commit on `main`.

- [ ] **Step 6: Verify post-merge `main` CI and deploy workflow**

Expected: both success; Cloudflare latest deployment serves the exact merged revision at 100% traffic.

- [ ] **Step 7: Verify production runtime telemetry**

Expected: Telegram webhook events on current Worker version return HTTP 200 with outcome `ok`, with no new plugin-kernel-related runtime errors.

- [ ] **Step 8: Record owner-device smoke as VERIFIED or NOT VERIFIED**

Minimum smoke: `/start -> Repositories -> project -> Files -> folder/file -> project -> PR/Commits/Status -> Back -> Main`, preserving one-message callback navigation.
