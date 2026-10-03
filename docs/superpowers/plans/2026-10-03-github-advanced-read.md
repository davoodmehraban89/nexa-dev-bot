# GitHub Advanced READ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, owner-only GitHub Advanced READ navigation for logs, artifacts, branches/compare, PR detail/checks, issues, and releases.

**Architecture:** Extend the existing GitHub provider adapter with bounded readers, including a text reader for job logs, then expose them through the existing GitHub plugin and central READ policy. Keep callbacks compact and stateless; do not add provider writes in this slice.

**Tech Stack:** Cloudflare Workers, Node.js 22 tests, GitHub REST API, Telegram inline callbacks.

**Spec:** `docs/superpowers/specs/2026-10-03-github-advanced-read-design.md`

## Global Constraints
- Preserve `resolve -> policy -> execute` and owner-only READ policy.
- No new WRITE/DESTRUCTIVE provider call in this slice.
- Clamp growing list pagination to page 1..100 and page size <=20.
- Bound logs/diff text before rendering to Telegram.
- Keep callback_data compact and under Telegram limits.

## Review Focus
- Raw log responses that are not JSON must remain explicit and bounded.
- Malformed numeric IDs / compare SHAs must fail closed at route resolution or provider validation.
- Empty artifacts/issues/releases/checks render useful empty-state views.
- Long branch/issue/release/patch text must not produce unbounded Telegram output.
- New callbacks must not trigger GitHub calls before policy evaluation.

---

### Task 1: Provider READ APIs
**Files:**
- Modify: `src/github.js`
- Test: `test/github-advanced-read.test.js`

**Produces:** bounded methods for job detail/logs, artifacts, branches, compare, PR detail/files/checks, issues, and releases.

- [ ] Write failing endpoint/mapping/bounds tests.
- [ ] Run CI and confirm the new test fails before implementation.
- [ ] Implement minimal provider readers plus `requestText`.
- [ ] Run tests and require green.

### Task 2: Plugin routes and views
**Files:**
- Modify: `src/plugins/github/manifest.js`
- Modify: `src/plugins/github/plugin.js`
- Test: `test/github-advanced-plugin.test.js`

**Consumes:** Task 1 provider methods.
**Produces:** compact READ callbacks and bounded Telegram views.

- [ ] Write failing route/manifest/navigation/rendering tests.
- [ ] Run tests and confirm RED.
- [ ] Implement repository advanced navigation, job/log/artifact, branch/compare, PR detail/checks, issue and release views.
- [ ] Run full suite and require green.

### Task 3: Durable checkpoint and review
**Files:**
- Modify: `PROJECT_MEMORY.md`

- [ ] Record the successful production WRITE smoke: run #134 attempt 1 -> 2 and Cloudflare `action_result=success`.
- [ ] Record current branch scope and anything NOT VERIFIED.
- [ ] Review diff for secret leakage, accidental provider writes, callback bounds, and out-of-scope changes.
- [ ] Run fresh full CI, merge reviewed head, verify exact main CI/deploy and active Cloudflare version.