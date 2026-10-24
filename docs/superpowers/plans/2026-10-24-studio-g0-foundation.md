# Nexa Studio G0 foundation and handoff plan

> **For agentic workers:** Use the existing project skills for implementation and verification. Check off work only with recorded evidence.

**Goal:** Make the existing owner-only bot maintainable and implement G0's demonstrated baseline corrections before handing routine work to another chat.

**Architecture:** Keep the existing Worker, Durable Objects, approval and branch-only publication. Use the existing Replay Guard namespace with a distinct webhook identity domain for 24-hour update deduplication; add no infrastructure. Keep staging/deployment and real-device acceptance separate from local tests.

**Tech Stack:** JavaScript ESM, Node 22, Cloudflare Workers/DO, Prettier, ESLint.

**Spec:** `docs/contract/NEXA_STUDIO_V3.md` and its unchanged source DOCX.

## Global constraints
- No rewrite, direct default-branch writes, force pushes, secret/source logging or fabricated evidence.
- Existing owner boundary, immutable intent, Safe Approval, replay guard, TOTP and Kill Switch must remain effective.
- G0 scope: R-10 through R-13, R-26 and R-27. Do not claim G1 or cross its acceptance gate.
- Preserve existing behavior unless a regression test demonstrates the intended correction.
- Keep formatting in a separate commit, with no logic changes.
- User requested autonomous progress plus a concise, reusable handoff; no repeated design interviews.

## Review focus
- Concurrent duplicate Telegram deliveries: exactly one processing attempt, separate from approval keys.
- Durable storage failure: retryable non-2xx and no bot/provider execution.
- Handler/provider failures: log fixed metadata only and acknowledge an already claimed update without replaying effects.
- Editor limits: one server reference drives API, page, upload instructions and boundary behavior.
- Formatting: executable ASTs and template literal bytes unchanged.

## Tasks
1. [ ] Read every R-27 module and test, record exact file inventory, findings and future-phase gaps.
2. [ ] Integrate pending tested editor safety PRs locally, preserve original v3 booklet and record baseline tests.
3. [ ] R-10: pin formatter/linter and lockfile; format JS/config/workflows in a dedicated commit. Compare pre/post executable ASTs, including template literals; run existing tests. Configure lint to catch real undefined references, not enforce a new product design.
4. [ ] R-11: write failing tests for page policy consumption and upload guidance; derive all current editor ceilings from workspace-policy.js. Preserve 20,000 code points / 65,536 bytes / 8 files / 131,072 aggregate bytes; mark older specs as historical.
5. [ ] R-12: write failing /health and version tests; make /health return only `ok` and derive product release version from package.json. Keep /status shape compatible.
6. [ ] R-13: write failing worker/DO tests for duplicate/concurrent updates, 24-hour expiry, storage failure, malformed/unauthorized updates, handled errors and log redaction. Deduplicate before effects through existing Replay Guard, using a bot-specific separate domain. No update bodies stored. Document at-most-once processing and crash recovery limits.
7. [ ] Fix only confirmed baseline operational bugs with RED/GREEN tests if found during R-27.
8. [ ] Run Node 22 full tests, lint, format check and pinned Wrangler dry-run. Review changes independently. Push a draft PR with exact test/SHA/CI evidence; no automatic main merge or deployment.
9. [ ] Record R-26 historical evidence and pending fresh owner-device/runtime proof; G0 acceptance remains pending required evidence/owner approval.
10. [ ] Create `docs/handoff/START_HERE.md` and a copyable Persian prompt with branch/PR, commands, requirement status, next safe tasks and triggers for security review. A chat without execution tools must produce patches/checklists rather than claim implementation.

## Implementation interfaces
- `WORKSPACE_EDITOR_LIMITS`: existing immutable policy object remains the reference.
- `consumeTelegramUpdate({ namespace, botId, updateId, now })`: `Promise<boolean>`; false only for a known duplicate, throws on missing/unhealthy storage.
- Worker retains `fetch(request, env)`. Public `/health` contains no version or diagnostics; `/status` obtains version from package metadata.
- Webhook dedupe contains update ID and expiry only, never source, token or Telegram body. A server-side bot identifier is derived without storing the token.

## Scope limits
G1 connection wizard, D1, sessions, CodeMirror and multi-user access are not built in this pass. Staging, exact-SHA GitHub CI and device/runtime acceptance must not be inferred from local verification. A 24-hour at-most-once marker prevents repeated side effects but is not a durable queue or exactly-once execution guarantee.
