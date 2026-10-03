# Repository Workspace / Code Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an owner-only Telegram repository workspace that can open an eligible text file, create a durable draft, show the exact diff, and create exactly one approval-gated GitHub branch commit without mutating `main`.

**Architecture:** Keep workspace state in a dedicated owner-scoped Cloudflare Durable Object and keep GitHub provider mutation behind the existing Action Policy, HMAC approval, durable replay guard and audit boundary. New path-safe navigation uses short Durable Object references rather than putting repository paths or source content in Telegram callback data. The commit engine uses Git Data blobs/trees/commits/refs with a sealed immutable commit intent and deterministic commit metadata so retries reconcile to one branch commit and later multi-file workspaces can reuse the same engine.

**Tech Stack:** JavaScript ES modules, Node 22 test runner (`node --test`), Cloudflare Workers + SQLite-backed Durable Objects, Telegram Bot API, GitHub REST API 2022-11-28.

**Spec:** `docs/superpowers/specs/2026-10-03-repository-workspace-editor-design.md`

## Global Constraints

- Only the configured Telegram owner may access repository/workspace data.
- Existing provider `READ` remains owner-only; provider `WRITE` / `DESTRUCTIVE` remains Safe-Approval gated.
- Phase 1 never commits directly to `main` or another repository default branch.
- No GitHub Git Data write may start before the approval token is consumed successfully.
- Draft/source text must never be placed in Telegram callback data, audit logs, or error logs.
- Approval callback data must remain within Telegram's 64-byte limit; existing `ApprovalService.maxTokenLength=56` remains the token ceiling.
- Workspace IDs and navigation refs are random non-secret handles; every store operation is owner-scoped.
- Workspace draft TTL is 30 minutes; navigation-ref TTL is 15 minutes; existing approval TTL remains 120 seconds.
- Phase 1 editable content is UTF-8 text with a maximum of 3,000 Unicode characters and 12,000 UTF-8 bytes; over-limit content remains readable but the Edit control is disabled with an explicit reason.
- Reject editor writes for Git LFS pointer content and sensitive paths matching `.env`, `.env.*`, `id_rsa`, `id_ed25519`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`, or `service-account*.json` case-insensitively.
- Generated target branch is `nexa/edit-<workspaceId>` and Phase 1 fails closed if that ref already exists unexpectedly.
- No automatic rebase, merge, conflict resolution, shell execution, binary/LFS editing, or direct-default-branch mutation.
- Workspace audit metadata may include IDs, paths, SHAs, counts and digests, but never full source/draft text, provider tokens, Telegram secrets, signing secrets or signed approval tokens.
- Every durable implementation checkpoint updates `PROJECT_MEMORY.md`; anything not actually verified is recorded as `NOT VERIFIED`.
- Cloudflare configuration keeps the existing declarative Durable Object `exports` model; add `WorkspaceStore` to `exports` with `storage: "sqlite"` and do not add a legacy `migrations` array alongside it.

## Review Focus

1. **Multibyte/oversized Telegram input:** UTF-8 byte limits and Unicode-character limits are both enforced; input is rejected rather than silently truncated. Task 1 and Task 4 tests pin this.
2. **Late or duplicate Telegram draft input:** pending-input mode is consumed exactly once and only for the owning workspace; a second message cannot mutate the draft unexpectedly. Task 2 and Task 4 tests pin this.
3. **Base branch changes between review and confirmation:** the GitHub write sequence stops before blob/tree/commit creation and marks the intent stale. Task 6 tests pin this.
4. **Ambiguous provider result around ref creation:** Nexa re-reads the target ref and treats it as success only when it points to the deterministic expected commit SHA; otherwise it fails closed. Task 5 and Task 6 tests pin this.
5. **Target branch already exists or moved:** Phase 1 never overwrites/force-updates it; only an already-reconciled ref pointing to the exact expected commit is accepted. Task 5 and Task 6 tests pin this.

---

## File Structure

### New files
- `src/core/workspace-policy.js` — editable-file validation, bounded text normalization, digest helpers and bounded exact line diff.
- `src/core/workspace-store.js` — owner-scoped client for the `WORKSPACE_STORE` Durable Object.
- `src/durable/workspace-store.js` — durable navigation refs, workspaces, pending-input state, immutable commit intents and committed result state.
- `src/plugins/github/workspace.js` — path-safe file/workspace views, local draft routes and approval-gated commit orchestration.
- `test/workspace-policy.test.js` — policy/diff bounds and sensitive-file coverage.
- `test/workspace-store.test.js` — Durable Object/client ownership, TTL, pending-input and intent-state coverage.
- `test/github-workspace-ui.test.js` — navigation, draft, input, diff and ready-to-commit Telegram flow.
- `test/github-workspace-provider.test.js` — Git Data read/write request construction and error/reconciliation behavior.
- `test/github-workspace-approval.test.js` — compact workspace approval codec and pre-approval no-write contract.
- `test/github-workspace-integration.test.js` — end-to-end in-memory draft -> diff -> approval -> one branch commit flow.

### Modified files
- `src/index.js` — export `WorkspaceStore` alongside `ApprovalReplayGuard`.
- `wrangler.jsonc` — bind `WORKSPACE_STORE` to `WorkspaceStore` and declare it as SQLite storage in `exports`.
- `src/github.js` — add path-at-ref reads, branch/ref snapshot reads and Git Data write primitives.
- `src/plugins/github/manifest.js` — declare workspace actions and increment plugin manifest version.
- `src/plugins/github/plugin.js` — route root file browsing and short workspace callbacks to the workspace controller while retaining legacy callbacks for old Telegram messages.
- `src/core/router.js` — add message dispatch through the same policy/audit boundary and optional sanitized route audit metadata.
- `src/core/approval.js` — add compact workspace commit-intent codec while preserving rerun/cancel codecs and 56-character ceiling.
- `src/bot.js` — provide owner identity/workspace client to the plugin, route pending editor text, and generalize approval rendering/source reconstruction beyond workflow-run IDs.
- `PROJECT_MEMORY.md` — record each verified TDD/CI/deploy/runtime checkpoint.

---

### Task 1: Workspace Policy, Digests and Diff

**Files:**
- Create: `src/core/workspace-policy.js`
- Create: `test/workspace-policy.test.js`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Produces: `validateEditableFile({ path, text, byteLength? }) -> { editable, reason, text, charLength, byteLength }`.
- Produces: `normalizeCommitMessage(value) -> string` with non-empty, single bounded message <= 120 characters.
- Produces: `makeTargetBranch(workspaceId) -> string` returning `nexa/edit-<workspaceId>` after safe-handle validation.
- Produces: `digestText(value) -> Promise<string>` returning lowercase 64-hex SHA-256.
- Produces: `buildUnifiedDiff({ path, before, after, maxChars = 2600 }) -> { text, additions, deletions, truncated }` with exact line counts and bounded rendered text.

- [ ] **Step 1: Write policy RED tests**

Add tests named:
- `editable file policy accepts bounded UTF-8 text`.
- `editable file policy rejects sensitive paths binary markers LFS and both size ceilings`.
- `editable file policy counts multibyte UTF-8 bytes instead of JavaScript characters`.
- `commit message and target branch normalization fail closed on empty or unsafe values`.
- `unified diff reports exact additions deletions escapes no data and marks bounded truncation`.
- `digestText is stable for identical content and changes with content`.

Assert exact limits from Global Constraints, including a multibyte string that is under 3,000 characters but over 12,000 UTF-8 bytes.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/workspace-policy.test.js`

Expected: FAIL because `src/core/workspace-policy.js` and exported functions do not exist.

- [ ] **Step 3: Implement the pure policy module**

Implement the signatures above without third-party dependencies. `buildUnifiedDiff` operates on line arrays, counts the full before/after change exactly, and bounds only the rendered diff text; it never truncates input before calculating counts/digest.

- [ ] **Step 4: Run focused + full regression tests**

Run: `node --test test/workspace-policy.test.js && npm test`

Expected: workspace tests PASS and all existing tests PASS with 0 fail/skip/cancelled.

- [ ] **Step 5: Record checkpoint and commit**

Update `PROJECT_MEMORY.md` with Task 1 RED/GREEN evidence and `NOT VERIFIED` production status.

Commit: `feat: add workspace edit policy and diff`

---

### Task 2: Durable Owner-Scoped Workspace Store

**Files:**
- Create: `src/core/workspace-store.js`
- Create: `src/durable/workspace-store.js`
- Create: `test/workspace-store.test.js`
- Modify: `src/index.js`
- Modify: `wrangler.jsonc`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- `DurableWorkspaceStoreClient({ namespace, now? })` scopes one Durable Object by `namespace.idFromName(ownerId)`.
- `isConfigured() -> boolean`.
- `createNavigationRefs({ ownerId, refs, ttlMs = 900000 }) -> [{ refId }]` where each stored ref contains only `repoId`, `path`, `type`, `sha` and expiry.
- `resolveNavigationRef({ ownerId, refId }) -> ref | null`.
- `createWorkspace({ ownerId, repoId, repoFullName, baseBranch, baseHeadSha, baseTreeSha, path, blobSha, originalText, originalDigest, expiresAt }) -> workspace`.
- `getWorkspace({ ownerId, workspaceId }) -> workspace | null`.
- `updateDraft({ ownerId, workspaceId, text, digest }) -> workspace` and invalidates any previously sealed pending intent for later approval.
- `setPendingInput({ ownerId, workspaceId, mode })`, `getPendingInput({ ownerId })`, `consumePendingInput({ ownerId, workspaceId, mode })` where mode is `draft` or `commit_message` and consume is one-time.
- `setCommitMessage({ ownerId, workspaceId, message, digest }) -> workspace`.
- `sealIntent({ ownerId, workspaceId, intent }) -> intent` creates immutable `intent:<intentId>` and moves workspace to `READY`.
- `getIntent({ ownerId, intentId }) -> intent | null`.
- `beginCommit({ ownerId, intentId }) -> { disposition: 'start'|'resume'|'committed', intent }` atomically moves `READY -> COMMITTING`, returns `resume` for existing `COMMITTING`, and returns recorded result for `COMMITTED`.
- `setCandidateCommit({ ownerId, intentId, commitSha })`.
- `completeCommit({ ownerId, intentId, commitSha, branch }) -> intent` atomically records `COMMITTED`.
- `markStale({ ownerId, intentId, reason })`.
- `cancelWorkspace({ ownerId, workspaceId })`.

- [ ] **Step 1: Write Durable Object/client RED tests**

Cover:
- owner A cannot resolve owner B refs/workspaces;
- expired refs/workspaces read as missing and cleanup is scheduled;
- pending input is consumed once and duplicate/late messages are rejected;
- updateDraft invalidates old READY intent state;
- sealIntent is immutable;
- beginCommit is atomic and returns `committed` after success;
- committed result retains exact SHA/branch for idempotent retries;
- missing `WORKSPACE_STORE` fails closed.

- [ ] **Step 2: Run RED test**

Run: `node --test test/workspace-store.test.js`

Expected: FAIL because store/client/binding do not exist.

- [ ] **Step 3: Implement client + Durable Object**

Use one owner-named Durable Object instance. Store keys as `ref:<id>`, `ws:<id>`, `intent:<id>`, and one `pending` record. Generate navigation/workspace/intent handles with `crypto.getRandomValues`; do not use source text in IDs. Alarm cleanup removes expired refs/workspaces while retaining committed intent metadata for 24 hours to support reconciliation/idempotent retry.

- [ ] **Step 4: Wire Worker configuration**

Export `WorkspaceStore` from `src/index.js`. In `wrangler.jsonc`, add binding `{ "name": "WORKSPACE_STORE", "class_name": "WorkspaceStore" }` and declarative export `"WorkspaceStore": { "type": "durable-object", "storage": "sqlite" }`. Keep the existing `exports` lifecycle model; do not add `migrations`.

- [ ] **Step 5: Run focused + full tests**

Run: `node --test test/workspace-store.test.js && npm test`

Expected: 0 failures.

- [ ] **Step 6: Record checkpoint and commit**

Update `PROJECT_MEMORY.md` with RED/GREEN evidence and note that the new binding is `NOT VERIFIED` in production until deployment.

Commit: `feat: add durable repository workspace store`

---

### Task 3: Path-Safe File Navigation and Draft Creation

**Files:**
- Create: `src/plugins/github/workspace.js`
- Create: `test/github-workspace-ui.test.js`
- Modify: `src/github.js`
- Modify: `src/plugins/github/manifest.js`
- Modify: `src/plugins/github/plugin.js`
- Modify: `src/bot.js`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Extend `GitHubService.listFiles(repoRef, path = '', { ref } = {})` without breaking existing callers.
- Add `getBranchSnapshot(repoRef, branch) -> { branch, headSha, treeSha }`.
- Add `getFileAtRef(repoRef, path, ref) -> { path, sha, size, encoding, content }` using the Contents API at the pinned ref.
- Add `createWorkspaceController({ github, workspaces })` returning route helpers used by `plugin.js`.
- New callback families remain <=64 bytes: `wnav:<refId>`, `wedit:<refId>`, `ws:<workspaceId>`, `wtext:<workspaceId>`, `wmsg:<workspaceId>`, `wdiff:<workspaceId>`, `wready:<workspaceId>`, `wcancel:<workspaceId>`.
- `plugin.resolveCallback(data, context)` consumes `context.ownerId` for workspace routes; no workspace/provider read happens before central policy evaluation.

- [ ] **Step 1: Write navigation/draft RED tests**

Cover:
- `files:<repoId>` is routed after policy to the new path-safe browser;
- visible file/directory buttons contain short refs, never raw long paths;
- a nested directory resolves through `wnav:<refId>` and still preserves full path server-side;
- an eligible text file view shows `✏️ Edit`;
- oversized/sensitive/LFS file view stays readable but gives the exact edit-disabled reason;
- `wedit:<refId>` pins current default-branch HEAD/tree and file blob/content before durable draft creation;
- archived repositories cannot create editable drafts;
- callbacks remain <=64 bytes;
- old `tree:`/`blob:` Telegram callbacks continue to render through the legacy MenuManager path.

- [ ] **Step 2: Run RED tests**

Run: `node --test test/github-workspace-ui.test.js`

Expected: FAIL on missing workspace routes/provider readers.

- [ ] **Step 3: Implement provider read helpers**

`getBranchSnapshot` reads `git/ref/heads/<branch>` then the referenced Git commit to obtain `tree.sha`. `getFileAtRef` requests `/contents/<path>?ref=<full head SHA>` and rejects directory/non-file responses. Preserve raw blob SHA and decode only after editable-file validation.

- [ ] **Step 4: Implement path-safe browser/controller**

After the READ policy is allowed, list the directory by path, batch-store short navigation refs in `WORKSPACE_STORE`, and render `wnav` callbacks. File views resolve refs only after policy. Draft creation fetches the latest default-branch snapshot and exact file at that full SHA, then stores the original text/digest in the workspace; no GitHub write occurs.

- [ ] **Step 5: Wire owner context and manifest**

Pass `{ isOwner: true, ownerId: String(ownerId) }` from `NexaDevBot` callback dispatch. Register workspace navigation/create/view/diff/local-draft action IDs as owner-only `READ` risk because they do not mutate GitHub. Increment GitHub plugin manifest version.

- [ ] **Step 6: Run focused + full tests**

Run: `node --test test/github-workspace-ui.test.js && npm test`

Expected: 0 failures and existing legacy file-browser tests remain green.

- [ ] **Step 7: Record checkpoint and commit**

Update `PROJECT_MEMORY.md` with RED/GREEN evidence.

Commit: `feat: add path-safe editor workspace entry`

---

### Task 4: Telegram Draft Input, Diff and Sealed Intent UX

**Files:**
- Modify: `src/core/router.js`
- Modify: `src/plugins/github/workspace.js`
- Modify: `src/plugins/github/plugin.js`
- Modify: `src/bot.js`
- Modify: `test/github-workspace-ui.test.js`
- Create: `test/github-workspace-integration.test.js`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Add `PluginRouter.dispatchMessage(payload, context = {})` using plugin resolver name `resolveMessage` and the same policy/audit path as commands/callbacks.
- `plugin.resolveMessage({ pending, text }, context)` owns only pending workspace input modes.
- `wtext:<workspaceId>` sets pending mode `draft`; the next owner text replaces the whole Phase-1 draft exactly if it satisfies the 3,000-char/12,000-byte bounds.
- `wmsg:<workspaceId>` sets pending mode `commit_message`; next owner text passes `normalizeCommitMessage`.
- `wdiff:<workspaceId>` returns bounded exact diff with additions/deletions and no provider mutation.
- `wready:<workspaceId>` requires non-empty changed draft + commit message, computes/stores content/message/intent digests, fixed commit timestamp, target branch and immutable intent, then renders `✅ تأیید و Commit` with `wscommit:<repoId>:<intentId>`.

- [ ] **Step 1: Extend RED tests for text input and ready state**

Assert:
- pressing draft/message input buttons does not call GitHub;
- one pending input consumes one message and a second late message falls back to normal bot behavior;
- multibyte/oversized input is visibly rejected without mutating the old draft;
- diff HTML is escaped and rendered text is bounded while counts/digest use complete content;
- no-change draft cannot become READY;
- changing draft or commit message after READY invalidates old intent;
- `wready` creates an immutable intent and renders only a short `wscommit` callback.

- [ ] **Step 2: Run RED**

Run: `node --test test/github-workspace-ui.test.js test/github-workspace-integration.test.js`

Expected: FAIL because message dispatch/pending modes/intent sealing are not implemented.

- [ ] **Step 3: Add policy-routed message dispatch**

Add `dispatchMessage` to `PluginRouter`. In `NexaDevBot.handleMessage`, preserve `/start`, `/menu`, `/repos`, `/status` precedence; after commands, read owner pending-input metadata from the local Durable Object and dispatch the message through the plugin router. Source text must not be added to audit metadata.

- [ ] **Step 4: Implement draft/message/diff/ready views**

Keep all workspace rendering in `workspace.js`; return explicit edit limits and state. Seal intent with stable fields: `repoId`, `workspaceId`, `baseBranch`, `baseHeadSha`, `baseTreeSha`, `path`, `sourceBlobSha`, `contentDigest`, `commitMessageDigest`, `targetBranch`, `commitTimestamp`, and one `intentDigest` over the canonical material fields.

- [ ] **Step 5: Run focused + full tests**

Run: `node --test test/github-workspace-ui.test.js test/github-workspace-integration.test.js && npm test`

Expected: 0 failures.

- [ ] **Step 6: Record checkpoint and commit**

Update `PROJECT_MEMORY.md` and explicitly keep provider commit `NOT VERIFIED` because no GitHub mutation exists yet.

Commit: `feat: add workspace draft and diff flow`

---

### Task 5: GitHub Git Data Commit Primitives

**Files:**
- Modify: `src/github.js`
- Create: `test/github-workspace-provider.test.js`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Extend `requestJson(..., { allowNotFound = false })` so only HTTP 404 may return `null` when requested; all other provider errors still throw.
- `getGitRef(repoRef, branch, { allowMissing = false } = {}) -> { branch, sha } | null`.
- `createGitBlob(repoRef, text) -> { sha }` via `POST /git/blobs` with `encoding:'utf-8'`.
- `createGitTree(repoRef, { baseTreeSha, entries }) -> { sha }`, where `entries` is multi-file capable `[{ path, mode:'100644', type:'blob', sha }]`.
- `createGitCommit(repoRef, { message, treeSha, parentSha, timestamp }) -> { sha }` via `POST /git/commits`, with deterministic `author` and `committer` both `{ name:'Nexa Dev Bot', email:'nexa-dev-bot@users.noreply.github.com', date: timestamp }`.
- `createGitBranchRef(repoRef, { branch, sha }) -> { ref, sha }` via `POST /git/refs` with `refs/heads/<branch>`.

- [ ] **Step 1: Write provider RED tests**

Assert exact HTTP method/URL/body for every primitive, including branch names containing `/`, full 40-hex validation, multi-file tree entries, deterministic commit identity/timestamp, 404 missing-ref behavior and normal 403/409/422 propagation.

Add the Review Focus case: a target ref lookup returns an existing different SHA and no update/force endpoint is called.

- [ ] **Step 2: Run RED**

Run: `node --test test/github-workspace-provider.test.js`

Expected: FAIL on missing methods.

- [ ] **Step 3: Implement minimal Git Data methods**

Reuse `getRepositoryContext`, `requestJson`, full-SHA validation and URL path-segment encoding. Do not add a force-update-ref primitive in Phase 1.

- [ ] **Step 4: Verify deterministic retry primitives**

Test that the same parent/tree/message/timestamp produces identical Git commit request bodies, allowing retries to resolve the same Git object SHA from GitHub.

- [ ] **Step 5: Run focused + full tests**

Run: `node --test test/github-workspace-provider.test.js && npm test`

Expected: 0 failures.

- [ ] **Step 6: Record checkpoint and commit**

Update `PROJECT_MEMORY.md` with RED/GREEN evidence; provider writes remain `NOT VERIFIED` live.

Commit: `feat: add github workspace commit primitives`

---

### Task 6: Safe Approval, Idempotent Commit Orchestration and Audit

**Files:**
- Modify: `src/core/approval.js`
- Modify: `src/core/router.js`
- Modify: `src/plugins/github/manifest.js`
- Modify: `src/plugins/github/plugin.js`
- Modify: `src/plugins/github/workspace.js`
- Modify: `src/bot.js`
- Create: `test/github-workspace-approval.test.js`
- Modify: `test/github-workspace-integration.test.js`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Add compact codec for `github.workspace.commit_branch` with action code `e`, `repoId` as base36 and exactly 8-character URL-safe `intentId`; preserve existing `r`/`c` codecs and the 56-character token maximum.
- `approvalSourceCallback(payload)` supports workspace input `{ repoId, intentId }` -> `wscommit:<repoId>:<intentId>`.
- Generalize approval UI metadata to accept `cancelCallback`; workflow-run approvals keep their existing Run fallback, workspace approval falls back to `ws:<workspaceId>` via immutable intent metadata resolved before issuing approval.
- Register `github.workspace.commit_branch` as `WRITE`.
- `commitWorkspaceIntent({ github, workspaces, ownerId, repoId, intentId }) -> { commitSha, branch, idempotent }`.
- Plugin route `wscommit:<repoId>:<intentId>` returns approval metadata before execution; provider calls remain deferred until approved dispatch.
- Route may supply sanitized `audit` metadata; Router merges only these safe fields into action attempt/result events.

- [ ] **Step 1: Write approval/orchestration RED tests**

Cover:
- workspace approval token stays <=56 bytes, verifies owner/action/risk/repo/intent, expires and rejects replay;
- clicking `wscommit` before approval performs zero GitHub Git Data writes;
- approval binds the immutable intent ID; changed draft/message causes old intent execution to fail closed;
- approved action re-reads base HEAD and creates zero Git objects when it changed;
- approved action rejects an unexpected existing target branch;
- successful path is exactly blob -> tree -> commit -> branch ref -> durable `COMMITTED` result;
- replayed approval performs zero second writes;
- fresh approval for an already `COMMITTED` intent returns recorded SHA with zero provider writes;
- if create-ref returns an ambiguous/409/422 error, orchestration reads the ref: same expected commit => mark success, different/missing => error;
- `COMMITTING` retry with stored candidate SHA reconciles before any new branch ref creation;
- audit contains workspace/intent/repo/path/digest/SHA metadata but never original/draft source or signed token.

- [ ] **Step 2: Run RED**

Run: `node --test test/github-workspace-approval.test.js test/github-workspace-integration.test.js`

Expected: FAIL on codec, route and commit orchestration.

- [ ] **Step 3: Add compact approval codec without regressing Actions approvals**

Implement a dedicated workspace-intent compact encoding branch rather than expanding generic JSON. Reject malformed/non-8-char intent IDs. Re-run existing `test/approval*.test.js` together with workspace approval tests.

- [ ] **Step 4: Implement commit orchestration**

Algorithm:
1. load immutable owner-scoped intent and call `beginCommit`;
2. return recorded result immediately for `COMMITTED`;
3. re-read base branch snapshot and require exact `baseHeadSha` before object creation;
4. read target ref and fail if it exists unless it already points to the stored deterministic candidate commit;
5. create content blob, tree and deterministic commit; persist candidate commit SHA before ref creation;
6. create target branch ref;
7. on provider ambiguity, re-read ref and accept only exact candidate SHA;
8. persist `COMMITTED` result before returning Telegram success.

No force update, default-branch update or retry with changed material is allowed.

- [ ] **Step 5: Generalize approval UI/fallback and add CI handoff**

Success view shows exact provider commit SHA + branch and buttons for `🧪 CI / Actions` and workspace view. Failure/stale views show explicit reason and never claim commit success.

- [ ] **Step 6: Run all security, approval and integration tests**

Run: `node --test test/approval*.test.js test/security.test.js test/github-workspace-approval.test.js test/github-workspace-integration.test.js && npm test`

Expected: all tests PASS, 0 fail/skip/cancelled.

- [ ] **Step 7: Record checkpoint and commit**

Update `PROJECT_MEMORY.md` with RED/GREEN evidence and mark live GitHub commit as `NOT VERIFIED` until owner-device production smoke.

Commit: `feat: add safe approval gated workspace commits`

---

### Task 7: Whole-Branch Verification, Deployment and Owner-Device Production Acceptance

**Files:**
- Modify: `PROJECT_MEMORY.md`
- Modify: `README.md` only if user-facing workflow documentation is missing after implementation review.

**Interfaces:**
- Consumes all prior tasks.
- Produces production-acceptance evidence; no new product interface should be invented in this task.

- [ ] **Step 1: Run fresh full local/CI-equivalent verification**

Run: `npm test`

Expected: every discovered `test/*.test.js` passes; 0 fail/skip/cancelled.

Run static secret-pattern checks over changed source/docs for `ghp_`, `github_pat_`, Telegram bot-token patterns and accidental signed `approve:` payload logging. Expected: no secrets.

- [ ] **Step 2: Review exact branch diff against the spec and acceptance criteria**

Verify line-by-line that Phase 1 includes: owner isolation, path-safe file navigation, eligible-file policy, durable draft, exact diff, branch-first target, stale-base protection, no pre-approval Git write, one-time approval, idempotent committed result, visible provider errors, exact SHA feedback and CI handoff. Anything missing returns to the owning task before merge.

- [ ] **Step 3: Merge only a reviewed green head and verify exact post-merge CI**

After the plan-approved implementation branch is reviewed, merge the exact head to `main`. Record main merge SHA and post-merge CI run ID in `PROJECT_MEMORY.md`. Do not treat PR CI alone as production acceptance.

- [ ] **Step 4: Verify Cloudflare deploy and new Durable Object binding**

Verify deploy checked out the exact main merge SHA. Verify active Worker version at 100% traffic and confirm both `APPROVAL_REPLAY_GUARD` and `WORKSPACE_STORE` bindings/classes are present. If binding/class deployment fails, stop before owner smoke and fix the configuration.

- [ ] **Step 5: Owner-device pre-approval smoke on a safe branch-only edit**

Use Telegram to open `davoodmehraban89/nexa-dev-bot` -> Files -> an eligible harmless text file (recommended `README.md`) -> Edit. Replace a tiny bounded portion so the diff is unmistakable; set a commit message such as `test: verify nexa mobile editor`.

Before pressing Confirm, verify from GitHub that `nexa/edit-<workspaceId>` does not exist and `main` is unchanged. Verify Cloudflare audit shows draft/diff/approval-issued metadata only and no `github.workspace.commit_branch` success/provider mutation.

- [ ] **Step 6: Owner confirms Safe Approval and verify one provider commit**

Owner presses `✅ تأیید و Commit` while the 120-second approval is valid. Verify GitHub target branch now exists with exactly one new commit parented to the pinned base HEAD, the changed path/diff matches the reviewed draft, and `main` remains unchanged. Verify Telegram shows the same commit SHA/branch that GitHub reports.

- [ ] **Step 7: Verify replay and fresh-retry idempotency**

Reusing the same approval callback must be rejected by `APPROVAL_REPLAY_GUARD`. Re-opening the already committed workspace and requesting a fresh confirmation for the unchanged intent must return the recorded commit SHA without a second commit/ref movement. Compare GitHub branch history before/after.

- [ ] **Step 8: Verify Cloudflare runtime/audit agreement**

Telemetry must show the same workspace/intent/action lifecycle and resulting commit SHA without full source/draft contents or secrets. Check for runtime exceptions around the smoke window.

- [ ] **Step 9: Close production acceptance in project memory**

Update `PROJECT_MEMORY.md` with exact merge SHA, CI/deploy run IDs, active Cloudflare version, owner-device evidence, branch/commit SHA, replay/idempotency evidence and every item still `NOT VERIFIED`.

Commit the checkpoint through the normal reviewed branch/PR flow; do not mutate production docs directly without CI.

---

## Execution Order and Stop Conditions

1. Tasks 1-2 establish pure policy + durable state and may not call GitHub WRITE.
2. Tasks 3-4 establish a complete mobile draft/diff flow with no provider mutation.
3. Task 5 adds provider primitives but does not expose them to Telegram.
4. Task 6 is the only task that connects those primitives to an approval-gated provider WRITE.
5. Task 7 is the only production-acceptance gate.

Stop and fail closed if any of these occur:
- source/path/workspace ownership cannot be proven;
- `WORKSPACE_STORE` is missing or unhealthy;
- base HEAD changed;
- target branch exists at a different SHA;
- draft or commit message changed after intent sealing;
- approval token is missing/expired/replayed/mismatched;
- provider result cannot be reconciled to the exact expected commit/ref;
- full source/draft content appears in audit logs;
- exact deployed main SHA cannot be proven.
