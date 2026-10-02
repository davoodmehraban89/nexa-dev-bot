# Nexa Dev Bot Plugin Foundation v1 Implementation Plan

> **Execution method:** superpowers `executing-plans` + TDD, on branch `feat/plugin-foundation-v1` and PR #14.

**Goal:** Introduce a small plugin kernel with explicit action risk policy and redacted auditing, then route existing GitHub behavior through a GitHub plugin without changing Telegram UX.

**Architecture:** Focused core modules provide registry, policy, audit, and routing. The existing `GitHubService` and `MenuManager` remain the provider/data/view implementation; the GitHub plugin is an adapter around those existing capabilities.

**Spec:** `docs/superpowers/specs/2026-10-03-nexa-plugin-foundation-design.md`

## Global Constraints

- Bot remains owner-only.
- No secret, token, authorization header, or private key may appear in audit output, repository files, or Telegram output.
- Existing callback navigation continues to edit the same Telegram message.
- Missing credentials fail closed.
- Every declared plugin action must pass central policy evaluation before provider/view execution.
- `WRITE` and `DESTRUCTIVE` actions are never auto-executed in Foundation v1.
- Worker remains stateless.
- AI, Browser QA, Supabase, Sentry, Linear, Notion, Mini App, and full Cloudflare operator integrations are out of scope.

## Implemented Structure

New core:
- `src/core/plugin-registry.js`
- `src/core/action-policy.js`
- `src/core/audit.js`
- `src/core/router.js`

GitHub plugin:
- `src/plugins/github/manifest.js`
- `src/plugins/github/plugin.js`

New tests:
- `test/plugin-registry.test.js`
- `test/action-policy.test.js`
- `test/audit.test.js`
- `test/plugin-router.test.js`
- `test/github-plugin.test.js`

Modified:
- `src/bot.js`
- `test/bot.test.js`
- `PROJECT_MEMORY.md`

## Security-Critical Router Contract

The implemented contract is deliberately stricter than the initial draft:

```text
resolve route -> identify declared action -> evaluate policy -> audit decision -> execute provider/view code
```

A plugin resolver returns either `null` or:

```js
{
  actionId: 'github.repos.list',
  execute: async () => view
}
```

`resolveCommand()` and `resolveCallback()` must be side-effect-free. Network/provider/menu work belongs inside the deferred `execute()` function. This guarantees `WRITE`, `DESTRUCTIVE`, undeclared, and denied actions cannot run before policy evaluation.

## Task 1 — Plugin Registry

- [x] RED test added: valid registration, duplicate plugin ID, duplicate action ID, invalid risk, lookup behavior.
- [x] RED CI confirmed: commit `2460b0854f6dbd99a80cfb9561850fdd23f1ac0e`, run `37069219176` failed for the missing module.
- [x] `PluginRegistry` implemented: commit `3f644caef41a9136cb5f0a78b0c66798238a257d`.
- [x] GREEN CI: `37069339637`.

## Task 2 — Action Policy + Redacted Audit

- [x] Policy RED commit `77efe66f008fcb417b0b66f22b186885d3fecdd3`; run `37069430240` failed as expected.
- [x] `ActionPolicy` implementation commit `cbdba6b1b70342d6325d229cec1725c05862a537`; GREEN run `37069629741`.
- [x] Audit RED commit `a6f9735185f7a0ce45fe744b9a13b1fa3d885681`; run `37069736330` failed as expected.
- [x] `AuditLogger` implementation commit `92dfcba318f5199e6c9e54da5fbba91a15122ca3`; GREEN run `37069824796`.
- [x] Recursive redaction covers nested strings, arrays, and objects; sink failures cannot break user actions.

## Task 3 — Policy-Enforcing Plugin Router

- [x] RED commit `4e3fca87139310c24c3c83a5181fc638f887882d`; run `37069955642` failed as expected.
- [x] Router implementation commit `00fcd1041e2f8074dc34727635395896eace0cba`.
- [x] GREEN CI `37070015843`.
- [x] Tests prove undeclared actions never execute.
- [x] Tests prove `WRITE` and `DESTRUCTIVE` actions return approval-required results and never invoke `execute()`.
- [x] Audit attempt/result events are emitted around allowed READ execution.

## Task 4 — GitHub Plugin Adapter

- [x] RED commit `ae6829729779c2f656e99958a379c805eb1bebc4`; run `37070181121` failed as expected.
- [x] Manifest + adapter implementation completed; final adapter commit `c9aed93bc1a3bd8ac047a3639722633bcd9c624e`.
- [x] GREEN CI `37070481981`.
- [x] `/repos`, `menu:repos`, `repo:`, `files:`, `tree:`, `blob:`, `pr:`, `commits:`, `status:` map to declared GitHub READ actions.
- [x] Non-GitHub commands/callbacks are not consumed by the plugin.

## Task 5 — NexaDevBot Integration Without UX Regression

- [x] Migration RED tests added in commit `f1ee926320dc918d0d0c8b21d60710077a9d119b`; run `37070633843` failed as expected before integration.
- [x] `src/bot.js` integration commit `d628a4ed0b07dfa4c748b6161515565b1eef3073`.
- [x] `/repos` and GitHub callbacks route through the plugin kernel.
- [x] `/start`, `/status`, and non-GitHub menu routes keep compatibility behavior.
- [x] Callback acknowledgement remains best-effort and cannot block rendering.
- [x] Same-message callback editing remains covered.
- [x] PR CI run `37070778956` passed the merge result with **12 test files, 52 tests, 52 pass, 0 fail, 0 skip**.

## Task 6 — Final Review, Merge, Deploy, Runtime Verification

- [x] Full PR diff reviewed for Foundation v1 scope; no provider expansion or secret value added.
- [x] Fresh PR CI evidence inspected, including test discovery and full `npm test` output.
- [ ] Final documentation commit PR CI green.
- [ ] PR #14 marked ready and merged to `main`.
- [ ] Post-merge `main` CI green.
- [ ] Cloudflare deploy workflow green and latest Worker deployment verified at 100% traffic.
- [ ] Production Telegram webhook telemetry on the new Worker version returns HTTP 200 / outcome `ok` with no new plugin-kernel error.
- [ ] Owner-device post-Foundation smoke recorded as VERIFIED or NOT VERIFIED.

## Definition of Done

Foundation v1 is complete only when all Task 6 runtime/deploy gates above are satisfied. Until then, implementation may be code-complete but is not marked production-complete.
