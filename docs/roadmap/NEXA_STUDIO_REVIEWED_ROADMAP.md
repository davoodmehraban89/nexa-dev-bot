# Nexa Studio — reviewed roadmap (draft for implementation)

Status: **PROPOSED / NOT YET APPROVED OR DEPLOYED**  
Source: owner-supplied “کتابچه اجرایی Nexa Studio — نسخه ۲٫۰.docx” (the document body calls itself v3.0).  
Baseline: main `5d1c083d326db327cc3973a9d3adecc1d8092c91`; existing Phase 2 accepted, 266 tests reported passing.  
This roadmap is a review of the supplied specification, **not an unconditional adoption of every requirement**. Production stays unchanged pending tested PRs and owner approval at gates.

## Goals and preserved invariants
- Evolve the existing Cloudflare Worker, Telegram bot, Durable Objects and Safe Approval; no rewrite.
- Owner-first M0, invite-only M1 (up to 10 users), public M2 only after independent security, operational, legal and availability reviews.
- Real GitHub permissions; tenant isolation; no access based on a pasted repository URL; no secrets/source/draft text in logs, callbacks, approval payloads or audit.
- Keep default-branch writes and force-push disabled; approval-bound writes on new branches only.
- Railway excluded. MVP stack proposed: Cloudflare Workers + Static Assets + D1 + Durable Objects; validate availability from Iran, cost, and operational recovery before commitment.

## Review corrections / design decisions requiring resolution
1. **Version discrepancy:** uploaded filename says v2.0 while document title says v3.0. Track as owner-supplied revision pending confirmation; preserve original, do not silently re-label.
2. **PAT risk:** Fine-grained PAT is an explicitly requested M0 option, but is a high-value bearer credential. Prefer GitHub App user authorization for broader rollout; PAT must be encrypted at rest, never returned to client, limited in repository scope, and revoked by user on GitHub. Do not treat regex prefix, token-expiration header or token metadata as proof of fine-grained permissions; verify actual API authorization and handle absent headers safely. Validate GitHub's currently supported token format and expiry metadata before coding.
3. **Connection write test:** creating/deleting a branch is a real remote write, not a harmless read. Require explicit, narrowly scoped Safe Approval; provide a read-only onboarding path, no forced mutation just to establish identity. Ensure cleanup failure is visible and auditable.
4. **GitHub identity:** do not conflate a GitHub account with a repository owner or organization. Organization access and collaborator scenarios require explicit grant and authorization checks. GitHub App user token vs installation token must be selected according to GitHub permissions and intended audit identity, not blanket assumptions.
5. **Audit/retention:** retain metadata necessary for security investigations without logging secrets, source or draft text; specify deletion and incident-retention policy before multi-user launch.
6. **Author attribution:** GitHub commit author/co-author must not impersonate the user; use verified identity and an explicitly consented attribution policy. Do not insert an invented Nexa Studio co-author email.
7. **Version, webhook, editor limit:** audit current implementation and tests before asserting any mismatch. Webhook dedupe and response semantics must preserve Telegram retry behavior and avoid acknowledging unpersisted work.
8. **Security requirements:** binding approvals to actor/action/repo/base/digest, key rotation, revision-based concurrency, per-user quotas, session handling, and tenant authorization are mandatory before multi-user writes.
9. **Design tools:** Figma/Canva/MagicPath are optional design-time tools, not runtime dependencies. No need to attach users' design accounts to Nexa. Verify each connection and its permissions before actual design use.
10. **No fabricated verification:** test recordings, production smoke, external agent approvals and availability in Iran must be recorded only after actual execution.

## Gate G0 — baseline audit and safe refactor
- Read in full: `src/bot.js` or actual bot entrypoints, legacy/menu modules, GitHub/Cloudflare plugins, TOTP, workspace policy, workflows and tests; inventory real paths and bindings.
- Record actual test counts, deployed version, Worker routes, Telegram Mini App auth, webhook handling, current secrets references, and Phase 2 regression baseline.
- Establish regression tests before behavioral changes; resolve inconsistent editor limits/version/health only when demonstrated.
- Add formatter/linter in isolated non-functional change; avoid sweeping formatting without review.
- Produce evidence report: requirement IDs, test outputs, PR, exact SHA, CI and operational risk.

## Gate G1 — owner-only Mini App MVP
- Mobile-first Persian RTL UI with LTR CodeMirror 6 editor, file tabs, Diff, draft state, revision/If-Match 409 and clear conflict UX.
- Owner-only Telegram auth verified server-side, short-lived session, CSRF and replay protections, CSP without unsafe-inline where practical.
- GitHub connection center: scoped fine-grained PAT onboarding if approved after threat review; encrypted server-side storage, masked display, explicit repo opt-in grants, token rotation/disconnect, user-visible errors.
- No stale save counters: UI reflects successful server persistence immediately.
- Keep old bot workflow operational; staging first; real iOS and Android smoke before gate sign-off.

## Gate G2 — tenant-safe invited accounts
- D1 schema migrations + rollback, per-user grants, invitations, connection ownership, audit metadata and usage limits.
- Test account A/B isolation and negative IDOR cases, revocation, expiry, replay, concurrent edit conflicts, rate limits and secret redaction.
- GitHub App user authorization flow with state/refresh/webhook validation; do not expose until end-to-end tested.
- Two real GitHub accounts and isolated private repositories required for acceptance.

## Gate G3 — controlled beta
- Up to 10 invited users, 4 weeks, monitored operational costs and security events, independent **human** security review, recovery test, and documented availability testing on Iranian networks.
- Collect usability feedback and repeat-usage evidence; do not add unrelated AI/Billing/Marketplace features.

## Gate G4 — public launch decision
- Written owner approval only after cost, legal/terms, sanctions, data protection, security and reliability evidence. No automatic launch.

## Immediate implementation order
1. Audit repository and produce G0 evidence + risk register.
2. Submit narrowly scoped G0 test/refactor PR; wait for CI and review.
3. Implement G1 incrementally behind feature flag; no production token migration until user-approved cutover.
4. Gate reports must distinguish tested, untested, blocked and owner-required decisions.

## Acceptance minimum
- No cross-user repository or workspace reads/writes; approval replay produces no second effect.
- No plaintext tokens in client responses, logs, D1, URLs, callback data or Telegram messages.
- No direct default-branch write, force-push or auto-merge.
- Revoked connection blocks subsequent actions; expired sessions fail closed.
- Workspace edits preserve content under concurrent updates; stale revisions return 409.
- Real-device smoke and exact-SHA CI/deploy evidence before calling a phase complete.
