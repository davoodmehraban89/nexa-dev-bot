# Repository Workspace / Code Editor Design

Date: 2026-10-03
Status: Proposed for implementation after owner review
Owner intent: let the repository owner browse a repository from Telegram, open a text file, edit it safely, inspect the exact diff, and commit the change back to GitHub. The architecture must support multi-file workspaces later without weakening approval, audit, branch, or conflict-safety rules.

## 1. Goals

The feature must let the owner:

1. Select any repository already visible through Nexa.
2. Browse to a text file and open a bounded preview.
3. Start an edit workspace without writing anything to GitHub.
4. Change file content or a bounded line range.
5. Review a source-backed before/after diff.
6. Provide a commit message.
7. Commit only after Safe Approval.
8. Receive the resulting commit SHA and continue into CI / Actions monitoring.
9. Later edit multiple files in one workspace and commit them atomically.

The central product goal is to make Nexa a real mobile developer control plane, not only a repository viewer.

## 2. Delivery Strategy

### Phase 1 — Safe single-file workspace

Ship one-file editing first, but build the data model and commit engine so multi-file workspaces do not require a redesign.

Phase 1 supports:
- owner-only text-file editing;
- branch-first commits;
- bounded file preview and editing payloads;
- exact diff before approval;
- conflict detection against the original base HEAD;
- Safe Approval before the GitHub mutation;
- idempotent commit intent tracking;
- commit SHA feedback and CI handoff.

Phase 1 does not support:
- binary files;
- Git LFS objects;
- automatic merge/conflict resolution;
- arbitrary shell execution;
- direct commits to `main`;
- editing likely-secret/private-key files;
- multi-user collaboration.

### Phase 2 — Multi-file workspace

Reuse the same workspace and commit engine to stage several changed files and create one atomic tree/commit.

### Phase 3 — Rich editor surface

A Telegram Mini App can later use the same workspace API for larger files, syntax-aware editing, multi-file tabs, search and richer diff presentation. The Telegram chat UI remains the safe control and approval surface.

## 3. User Flow

### Open and edit

`/start -> Repositories -> <repo> -> Files -> <file> -> Edit`

The file view shows:
- path;
- branch/ref;
- blob SHA;
- file size;
- bounded text preview;
- `Edit` only when the file passes editable-file policy.

Pressing `Edit` creates a local Nexa workspace. This is not a GitHub WRITE.

### Draft

The workspace records:
- owner id;
- repository id/full name;
- base branch;
- base HEAD SHA;
- source path;
- source blob SHA;
- original content digest;
- draft content/digest;
- commit message/digest when supplied;
- target branch when supplied/generated;
- created/updated timestamps;
- expiration time;
- workspace state.

The owner submits replacement text or a bounded line-range edit. Nexa validates size, UTF-8 encoding, source path, workspace ownership and configured input bounds before accepting it. Commit messages and branch names are normalized and bounded; branch names must satisfy Git ref safety rules.

### Review

Nexa renders a bounded unified diff and summary:
- repository;
- base branch;
- planned target branch;
- file path;
- additions/deletions;
- original blob/base HEAD;
- proposed content digest;
- commit message.

No provider mutation happens during preview.

### Commit

The default path is:

`draft -> review diff -> Safe Approval -> Git Data commit flow -> target branch ref -> return SHA -> monitor CI`

The approval target binds at least:
- repository;
- workspace id / commit-intent id;
- base HEAD SHA;
- target branch;
- changed path(s);
- proposed content/tree digest;
- commit message digest;
- action id;
- owner;
- expiry.

If anything material changes after approval is issued, Nexa must require a new approval.

## 4. Branch Policy

### Default: branch-first

Phase 1 never commits directly to `main`.

Nexa generates or accepts a safe branch name such as:

`nexa/edit-<short-workspace-id>`

The final approved composite action creates Git objects and then the target branch ref. This keeps drafts local and avoids a visible provider branch write before final confirmation.

### Direct-main future mode

Direct commits to the default branch are deferred. If added later they must be explicitly enabled, clearly marked high-risk, respect branch protection/rulesets, and use a stronger confirmation UX. Nexa must never bypass GitHub protection rules.

## 5. Commit Engine

The implementation should use GitHub Git Data primitives rather than designing around one-file Contents API behavior:

1. Read and pin the base HEAD commit/tree.
2. After approval is consumed, re-check staleness/conflicts.
3. Create blob(s) for staged content.
4. Create a new tree from the pinned base tree.
5. Create one commit pointing to that tree.
6. Create or fast-forward the approved target branch ref.
7. Persist the provider result into the workspace before returning success to Telegram.

All GitHub Git Data writes (blob/tree/commit/ref) occur only after Safe Approval has been successfully consumed. Provider object creation is considered part of the approved composite WRITE even if a later ref update fails.

This is slightly more work for the first single-file version, but it gives the correct atomic file-set foundation for Phase 2 multi-file commits.

No branch ref may be moved if the repository state no longer matches the conflict checks described below.

## 6. Conflict and Staleness Safety

A workspace is optimistic-concurrency controlled.

Before final mutation Nexa re-reads the relevant branch state.

Rules:
- If the base branch HEAD no longer matches the workspace base HEAD, the commit is blocked as stale before GitHub object creation.
- Nexa does not silently rebase, merge or overwrite.
- The owner is shown the conflict/staleness reason and can refresh the workspace from the new base.
- If a target branch already exists unexpectedly or moved since approval, the action fails closed.
- A provider 409/422 or protection error is surfaced to Telegram and audited; success is never fabricated.

## 7. Idempotency and Ambiguous Provider Outcomes

Approval replay protection alone is not enough. A provider call can succeed while the Telegram response fails, and the owner may then try again with a fresh approval.

Each ready-to-commit workspace therefore gets a stable commit-intent digest derived from repository, base SHA, target branch, path(s), content/tree digest and commit-message digest.

Workspace state transitions are monotonic, for example:

`DRAFT -> READY -> COMMITTING -> COMMITTED | FAILED | STALE`

Rules:
- once `COMMITTED`, the workspace returns the recorded commit SHA and must not create another commit for the same intent;
- the resulting commit SHA/target ref are persisted before Nexa reports success to Telegram;
- if the provider result is ambiguous (timeout/network failure after a possible ref update), Nexa reconciles the target branch/ref against the expected commit intent before permitting a retry;
- a fresh approval cannot bypass an already-committed workspace intent;
- changing draft content, branch or commit message creates a new intent and invalidates any prior pending approval.

This protects against duplicate commits even when the first successful provider result was not visible to the owner.

## 8. Workspace Storage

Draft content must not be stored in Telegram callback data or process memory.

Use a dedicated owner-scoped durable workspace store, preferably a separate Durable Object namespace/class such as `WORKSPACE_STORE` / `WorkspaceStore`.

Properties:
- workspace id is random and non-secret;
- every operation checks owner identity;
- data is scoped by owner + workspace id;
- TTL cleanup removes abandoned drafts;
- committed result metadata is retained long enough to support idempotent retry/reconciliation;
- no GitHub token, Telegram token or signing secret is stored in the workspace;
- audit logs store metadata/digests, not full sensitive file contents;
- draft state is never treated as a provider commit.

The existing `APPROVAL_REPLAY_GUARD` remains dedicated to one-time approval consumption.

## 9. Editable File Policy

Phase 1 accepts UTF-8 text only.

Reject or disable edit for:
- binary/non-UTF-8 content;
- files above the configured edit-size ceiling;
- Git LFS pointers when unsafe to edit as normal text;
- probable private-key/credential files such as common `.pem`, `id_rsa`, and committed environment-secret patterns;
- generated files identified by explicit project policy when available.

Reads may remain available where already allowed, but the editor should fail closed for risky write targets.

All rendered file content and diff text must be HTML-escaped and bounded for Telegram. Editable input must never be silently truncated.

## 10. Telegram UX

New controls should fit naturally into the existing GitHub plugin:

File view:
- `✏️ Edit`
- existing navigation/back controls

Workspace view:
- path + base ref
- draft status
- `📝 تغییر متن`
- `🔍 مشاهده Diff`
- `💬 پیام Commit`
- `✅ آماده Commit`
- `🗑 لغو Draft`

Ready-to-commit view:
- exact change summary;
- bounded diff;
- target branch;
- commit message;
- `✅ تأیید و Commit` through Safe Approval;
- cancel/back.

After commit:
- resulting SHA;
- branch;
- `🧪 CI / Actions`;
- optional later `Create PR` action, separately approval-gated.

For content too large to edit comfortably in chat, Phase 1 explains the limit rather than truncating editable input silently. The richer Mini App editor is the planned expansion path.

## 11. Action Model and Risk

New actions should be explicit in the GitHub plugin manifest.

READ examples:
- `github.workspace.view`
- `github.workspace.diff`

Local/draft actions do not call GitHub and remain owner-only.

Provider WRITE examples:
- `github.workspace.commit_branch`
- later `github.pr.create_from_workspace`

Every provider WRITE must pass through the existing Action Policy, HMAC approval, durable replay guard and audit lifecycle.

The GitHub Git Data write sequence must not begin until approval is successfully consumed.

## 12. Audit Requirements

Audit events must let us reconstruct the control-plane decision without leaking source contents.

Record metadata such as:
- workspace id;
- commit-intent digest;
- repo id;
- base SHA;
- target branch;
- paths changed;
- count of files;
- additions/deletions when available;
- proposed tree/content digest;
- action/policy/approval outcome;
- resulting commit SHA on success;
- reconciliation outcome after ambiguous provider failures;
- provider error category on failure.

Do not log:
- full file contents;
- tokens/secrets;
- signed approval callback tokens.

## 13. Testing Strategy

Implementation must be TDD and include:

### Unit / provider
- editable-file validation;
- workspace owner isolation;
- TTL/stale workspace behavior;
- text/diff bounds and escaping;
- branch/commit-message validation and bounds;
- blob/tree/commit/ref request construction;
- multi-file-capable tree construction even if UI initially stages one file;
- GitHub error propagation.

### Policy / security
- no GitHub WRITE before approval;
- approval target binds repo/workspace/base/branch/path/content digest;
- replay rejected;
- expired approval rejected;
- stale base HEAD blocks mutation before object creation;
- unexpected target-branch movement blocks mutation;
- non-owner cannot read or mutate workspace;
- sensitive-file policy fails closed.

### Idempotency
- committed workspace returns recorded SHA on retry without another provider write;
- fresh approval cannot duplicate an already-committed intent;
- ambiguous provider timeout reconciles expected target ref before retry;
- content/branch/message change invalidates prior approval and produces a new intent.

### Integration
- create draft -> edit -> diff -> approve -> branch commit;
- provider failure visibly updates Telegram;
- successful commit persists exact SHA before Telegram success feedback;
- successful commit returns exact SHA and CI navigation.

### Production acceptance
CI alone is insufficient. Acceptance requires an owner-device smoke on a safe test file/branch proving:
1. draft creation does not change GitHub;
2. diff matches the proposed edit;
3. no GitHub write occurs before approval;
4. confirmation creates exactly one commit on the intended branch;
5. replay does not create a second commit;
6. re-opening/retrying a committed workspace returns the same SHA without a duplicate commit;
7. GitHub and Cloudflare audit/runtime evidence agree on the same operation.

## 14. Acceptance Criteria

Phase 1 is complete only when all are true:

- owner can open an eligible text file from Telegram;
- owner can create/edit a durable draft;
- exact bounded diff is visible before commit;
- `main` is not directly mutated;
- stale-base conflicts fail closed;
- final GitHub mutation is Safe-Approval gated and one-time;
- a committed workspace is idempotent across Telegram/network retries;
- resulting commit SHA/branch are shown from provider evidence;
- CI handoff is available;
- audit does not expose full draft/source contents or secrets;
- automated tests pass;
- exact production deployment is verified;
- owner-device production smoke passes.

## 15. Roadmap Placement

Updated order:

1. GitHub Advanced READ production acceptance — completed.
2. Repository Workspace / Code Editor — this design.
3. Remaining useful GitHub Advanced WRITE operations (for example workflow dispatch or specific-job rerun) through Safe Approval.
4. Cloudflare Ops plugin.
5. CI/CD Control Plane and release acceptance orchestration.
6. Monitoring + Incident Manager.
7. Automation Engine.
8. AI Copilot with no direct production mutation.
9. Browser QA.
10. Telegram Mini App using the same workspace/control-plane APIs.
11. Plugin ecosystem, multi-project control plane and final hardening.

## 16. Key Architecture Decision

The editor is not a special bypass around GitHub controls. It is a first-class GitHub WRITE workflow built on the same policy, approval, replay-protection and audit boundary already proven in production.

The initial UI is deliberately small, but the underlying durable workspace + idempotent Git Data commit model is designed for later multi-file atomic commits and a richer editor without changing the security contract.
