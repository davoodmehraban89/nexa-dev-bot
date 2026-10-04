# Workspace Editor v2 — Deep Audit Checkpoint — 2026-10-04

## Scope
- Repository: `davoodmehraban89/nexa-dev-bot`
- Branch: `fix/workspace-editor-flow-v2`
- PR: #26 `feat: add Telegram Mini App workspace editor`
- Baseline main at start: `dc6643abea7a7d0b4d54b0abbe1a87a7ab489c1b` (PR #25 merge)

## Four-source audit
- GitHub: source, tests, PR/CI and Safe Approval boundaries reviewed.
- Cloudflare: production Worker, active version/deployment, observability and both Durable Object bindings verified before implementation.
- Notion: no Nexa-specific project page was found in the connected workspace during this audit; no source-of-truth data was invented.
- Context7: current Telegram Mini App documentation confirmed that a true custom multiline editor belongs in a Web App/Mini App and that `Telegram.WebApp.initData` must be backend-validated.

## Root causes closed
1. README-sized files were blocked by the original 3,000-code-point / 12,000-byte editor ceiling even when otherwise safe text.
2. The primary Paste path was still a Telegram chat/ForceReply input, not a real embedded code editor.
3. The Mini App path initially lacked a restrictive Content-Security-Policy; security RED #268 caught it before merge.
4. The document-upload route still used the legacy 12,000-byte ceiling after the editor policy was expanded.

## Locked implementation
- Primary Workspace edit UX: Telegram `web_app` button -> `/workspace/editor`.
- URL carries only the opaque 10-character Workspace ID; source/draft text is not placed in URL or callback data.
- Editor API: `/workspace/api/editor`.
- Every API request validates Telegram `initData` using HMAC-SHA-256, configured owner identity and bounded `auth_date` freshness.
- GET reads only the owner-scoped Durable Workspace draft.
- PUT validates text, recomputes its digest and updates only the Durable Draft.
- Editor API contains no GitHub provider mutation path.
- GitHub WRITE remains `Diff -> Ready -> Safe Approval -> branch-only commit` with durable one-time replay protection.
- Expanded bounded editor policy: 20,000 Unicode code points AND 65,536 UTF-8 bytes; sensitive paths, binary-like content and Git LFS pointers remain blocked.
- Telegram file upload is secondary input and uses the same 65,536-byte ceiling.
- CSP is restrictive: default deny; only Telegram Web App script and same-origin API connection are allowed, with no-store/nosniff/no-referrer headers.

## TDD / verification evidence
- Initial RED CI #256 / run `37186491614`: 165 total, 161 pass / exactly 4 expected failures (README ceiling, missing Web App button, missing initData validator, missing editor HTTP handler).
- Security RED CI #268 / run `37187440040`: 167 total, 166 pass / exactly 1 expected failure (missing CSP).
- Final GREEN before this documentation checkpoint: CI #269 / run `37187539023`, job `111392581870`, head `887583216f51417e5d69a768245f5dd86854c8d4`: 40 test files, 167/167 pass, 0 fail/cancelled/skipped.
- Existing Safe Approval, stale-base, target-branch collision, provider ordering, idempotent reconciliation, replay rejection and audit-redaction tests all remained green in that run.
- A fresh full CI is required on this documentation head before merge.

## Acceptance status
- Source implementation + automated regression/security verification: VERIFIED on the code head above.
- Merge to main + exact deploy/runtime verification: pending fresh CI on this checkpoint and merge.
- Owner-device Mini App + branch-only Safe Approval smoke: still required before calling Repository Workspace production-accepted.
