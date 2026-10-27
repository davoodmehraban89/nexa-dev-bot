# Mini App primary entry correction

Owner correction: the application must start in the Telegram Mini App. The deployed cc7772d only had an embedded editor; chat navigation was not the requested entry. Continue autonomously on the existing Worker and owner-only access. This correction does not accept G0 or claim the full PAT/onboarding/G1 gate is complete.

1. Add real authenticated owner APIs for home, complete repositories, directory navigation, pinned Workspace creation, editing, Diff, commit message and requesting the existing signed Telegram Approval. Provider writes stay exclusively in the existing Approval consumer/intent/Kill Switch flow.
2. Add atomic per-file revisions and conditional saves so the new editor cannot silently overwrite concurrent edits. Existing legacy routes remain compatible and invalidate stale new-editor revisions.
3. Build the Persian RTL Mini App in web/ using Vite/React/TypeScript/CodeMirror6, with literal source rendering, real loading/errors/empty states, file tabs, review and an explicit safe-approval handoff. No placeholder connection wizard or invented data.
4. Serve actual Static Assets on the same Worker at /studio/, with nonce-based CodeMirror styles, external scripts/styles, no unsafe-inline and no authenticated data in cached HTML. Existing /workspace routes remain compatible.
5. Make /start and the primary bot entry offer Nexa Studio immediately; configure the owner's chat menu button through the runtime Telegram client. Telegram requires a user gesture to launch; do not claim automatic forced opening.
6. Run focused RED/GREEN, independent security/UI review, Node22 typecheck/lint/format/full tests and web/Worker builds; verify exact-head GitHub/Cloudflare checks. Publish the corrected entry within the owner's requested active-bot correction, preserving runtime secrets and all existing namespaces. Record exact code/asset identity and rollback metadata; never fabricate device evidence or G0 acceptance.
