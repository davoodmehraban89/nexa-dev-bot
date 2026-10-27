# Nexa Studio primary Mini App entry

Owner correction, 2026-10-26/27: the app should start in the Mini App. The previous cc7772d release provided only an editor behind Telegram navigation. This change makes a real owner-only application entry on the same Worker; it is not full G1 acceptance.

## Delivered behavior

- `/start`, `/menu` and the main entry show a primary Nexa Studio Mini App button. `/start` removes the old keyboard and configures the validated owner's private-chat menu. Telegram requires a user gesture to open it; forced auto-launch is not claimed.
- Real repository list with complete GitHub pagination; owner-scoped directory refs and pinned Workspace creation; Persian RTL React/TypeScript UI and CodeMirror6 with LTR source, tabs, search, undo/redo, sizing and actual server limits.
- Authenticated draft editing, per-file revision/If-Match, explicit conflict choices, Diff and commit message inside the Mini App. No source or credential in local storage; recovery stores one opaque Workspace ID and revalidates owner access before displaying any state.
- Approval request uses the existing signed Telegram Approval consumer and existing Kill Switch / replay / immutable intent. No GitHub mutation happens from browsing, saving or requesting approval.
- Review binds exact base, file paths/revisions and displayed commit message at atomic seal time. Concurrent replacement requires fresh review. Approval issuance uses the exact sealed intent, not a later replacement.
- DO transactions enforce file/state limits, prevent writes to committing/committed workspaces, and stop removed/readded path revisions from reusing stale values. Legacy editor calls advance revisions while retaining their existing API compatibility.
- Actual Static Assets at `/studio/`, on the existing Worker, with fresh nonce for CodeMirror styles, external scripts/styles and no `unsafe-inline`. All Studio APIs validate fresh signed owner initData before provider/store access; responses and errors are bounded and metadata-safe.

## Verification and evidence

RED/GREEN reproduced missing entry/API/assets, conditional-save races, atomic size/count limits, stale review and commit-message substitution, cross-file client CAS and loss of recovery after closing the Mini App. Final integrated counts, exact SHA, CI and runtime/deployment identifiers are recorded on PR65 after final verification.

Real local workerd/SQLite and Chromium checks use synthetic signed owners and intercepted local provider stubs. They are not Telegram owner-device recordings. No fake provider commit or owner acceptance may be inferred from them.

Final integrated verification on Node 22.23.4: `npm ci`, lint zero errors / 13 existing warnings, Prettier, **492 tests passed with zero failed/skipped/cancelled**, TypeScript, production Vite and Wrangler 4.152.0 dry-run all passed. Two old `/start` integration fixtures were updated to the real private-chat shape and the new Studio entry expectations; authorization was not weakened.

Actual local workerd/SQLite smoke passed: complete Studio API flow, revision and commit-message CAS, signed Approval, zero GitHub stub writes before approval, one branch-only commit through four local GitHubService requests, default branch unchanged, replay rejected before/after runtime restart. Chromium 154 exercised the built app against actual local Worker APIs at 390×844 and 1440×1000: zero CSP violations, page or console errors; CodeMirror nonce styles and typography worked; hostile-shaped source remained literal text; both layouts fit the viewport. No real provider/device evidence is claimed.

Tested Worker bundle: 449,403 bytes; SHA-256 `e456cfe9b4052ca73e0f9e1d4506962aa95ca18e7460dbe8e44c168b49a30a1c`. Four Static Assets were built under `web/dist/studio`. Exact source commit, final CI, asset hashes and rollout identifiers are recorded on PR65 after push/deployment, avoiding a commit solely to record its own checks.

## Explicit remaining scope

This entry uses the owner's current runtime GitHub credential. Encrypted PAT onboarding/owner credential migration, multi-user sessions/grants/invites, per-user encrypted TOTP, D1 activity, complete G1 autosave/TTL requirements and the remaining gate evidence are not delivered by this entry correction. No placeholder cards or fake onboarding flow are exposed. The historical wrong-TOTP attempt-counter P2 follow-up remains separate.

The original G0 device/real-Approval acceptance requirement and written gate decision remain pending. Main must stay unchanged. Live rollout, when recorded on PR65, is the correction to the already owner-authorized active bot, not permission to merge main or claim gate acceptance.
