# Workspace Mini App Editor — Design Lock

## Goal
Replace the primary Telegram chat/ForceReply whole-file paste flow with a real, owner-only Mini App editor while preserving the existing branch-first Workspace, Diff, immutable Ready intent, Safe Approval, replay protection and provider-write invariants.

## Confirmed root causes
- `README.md` is not rejected because it is Markdown. The current generic editable-text policy rejects it because the Phase 1 ceiling is 3,000 Unicode code points; the repository README is larger than that ceiling.
- Telegram Bot API reply/inline keyboards do not provide an arbitrary multiline textarea. A Telegram Mini App/Web App is the supported mechanism for a custom HTML5 input UI.
- The persistent bottom keyboard can appear to disappear when the old ForceReply input takes over the composer. Removing ForceReply from the primary Draft edit path avoids that UX conflict.

## Locked behavior
1. Workspace view exposes `🧑‍💻 Editor` as an `InlineKeyboardButton.web_app` URL scoped only by the opaque 10-character Workspace ID.
2. Source/Draft content is never placed in the Web App URL, Telegram callback data, logs or audit metadata.
3. The editor shell is served by the same Cloudflare Worker at `/workspace/editor`.
4. Editor API is same-origin at `/workspace/api/editor`.
5. Every editor API request must carry `Telegram.WebApp.initData` and backend validation must:
   - verify Telegram HMAC-SHA-256 integrity using the bot token and `WebAppData` derivation;
   - reject stale `auth_date` values;
   - parse the Telegram user and require the configured owner ID.
6. GET loads only the durable Workspace metadata/current Draft needed by the editor.
7. PUT updates only the durable Draft after the same editable-file safety policy and digest calculation. It never calls GitHub and never creates a branch/commit.
8. GitHub mutation remains exclusively `Ready -> Safe Approval -> branch-only commit` in the existing Telegram flow.
9. New bounded editor ceiling: 20,000 Unicode code points and 65,536 UTF-8 bytes. Sensitive paths, binary-like content and Git LFS pointers remain rejected.
10. File upload remains a secondary Draft input and uses the same expanded byte ceiling. Legacy `wtext:*` callbacks may remain compatible for old Telegram messages but are no longer exposed as the primary Workspace action.

## Acceptance criteria
- Repository `README.md` preview exposes Edit and can create a Workspace.
- Workspace shows a Web App editor button, not the old primary Paste button.
- Mini App displays current Draft in a multiline monospace textarea with character/byte counters.
- Save persists exact Draft bytes/text to `WORKSPACE_STORE`; no GitHub provider write occurs.
- Missing/tampered/stale/non-owner Mini App init data is rejected.
- Existing Diff, Commit Message, Ready, Safe Approval, replay protection and branch-only commit tests remain green.
- Production deploy keeps both Durable Object bindings active and owner-device smoke confirms Editor -> Save Draft -> Diff -> Commit behavior.
