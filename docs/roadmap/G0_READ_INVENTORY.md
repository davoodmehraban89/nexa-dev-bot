# G0 R-27 read inventory

Baseline reviewed: main `5d1c083d326db327cc3973a9d3adecc1d8092c91` plus pending PR #63 and PR #64, integrated locally before behavior changes. Three focused audit agents and the coordinator read the required modules and all baseline tests in full. This is an AI-assisted source review, not a human security review, a CI result, or a device smoke.

The list below covers the required files at formatting commit `40e14f7`; additional core/DO files were also reviewed. New implementation tests were read during implementation and review.

```text
.github/workflows/ci.yml
.github/workflows/deploy.yml
src/bot-legacy.js
src/bot.js
src/cloudflare-menu.js
src/core/totp.js
src/core/workspace-policy.js
src/guide-menu.js
src/kill-switch-bot.js
src/menu.js
src/ops-menu.js
src/platform-menu.js
src/plugins/cloudflare/manifest.js
src/plugins/cloudflare/plugin.js
src/plugins/cloudflare/service.js
src/plugins/github/manifest.js
src/plugins/github/plugin-legacy.js
src/plugins/github/plugin.js
src/plugins/github/workspace-commit.js
src/plugins/github/workspace.js
test/action-policy.test.js
test/approval-expiry-ui.test.js
test/approval-flow.test.js
test/approval-provider-error-ui.test.js
test/approval.test.js
test/audit.test.js
test/automation.test.js
test/bot.test.js
test/bounded-json.test.js
test/cicd-control-plane.test.js
test/cloudflare-deploy-config.test.js
test/cloudflare-menu.test.js
test/cloudflare-ops-completion.test.js
test/cloudflare-plugin.test.js
test/cloudflare-service.test.js
test/destructive-second-factor.test.js
test/durable-replay.test.js
test/final-acceptance-contract.test.js
test/final-delivery.test.js
test/github-advanced-plugin.test.js
test/github-advanced-read-error-ui.test.js
test/github-advanced-read.test.js
test/github-advanced-write-completion.test.js
test/github-issues-pagination.test.js
test/github-live-findings.test.js
test/github-pagination.test.js
test/github-plugin.test.js
test/github-pr-merge.test.js
test/github-repository-fallback.test.js
test/github-workspace-approval.test.js
test/github-workspace-bot-approval.test.js
test/github-workspace-file-upload.test.js
test/github-workspace-integration.test.js
test/github-workspace-provider-error-ui.test.js
test/github-workspace-provider.test.js
test/github-workspace-ui.test.js
test/github.test.js
test/help-guide.test.js
test/incidents.test.js
test/index.test.js
test/kill-switch.test.js
test/menu.test.js
test/navigation.test.js
test/ops-console.test.js
test/phase2-controller.test.js
test/phase2-editor-multifile.test.js
test/phase2-multifile-acceptance.test.js
test/phase2-ready.test.js
test/platform-experience.test.js
test/plugin-registry.test.js
test/plugin-router.test.js
test/security.test.js
test/telegram-file-upload.test.js
test/telegram-menu-e2e.test.js
test/telegram-persistent-menu-input.test.js
test/telegram.test.js
test/workspace-approved-recovery.test.js
test/workspace-editor-dom-safety.test.js
test/workspace-editor-v2.test.js
test/workspace-editor-worker.test.js
test/workspace-multifile-commit.test.js
test/workspace-multifile.test.js
test/workspace-policy.test.js
test/workspace-recovery-validation.test.js
test/workspace-store-file-input.test.js
test/workspace-store.test.js
```

Total required baseline files read: **86**.

## Confirmed findings and disposition

- Compressed source: formatted in a separate commit; 116 executable JS ASTs and template values compared unchanged; baseline 282 tests passed before and after.
- Duplicate limit text/defaults: consolidated against WORKSPACE_EDITOR_LIMITS; old 3,000/12,000 values occur in historical Phase 1 plans rather than current policy.
- /health exposed version/runtime metadata and release version was hardcoded: addressed in G0 worker changes.
- Webhook had no update deduplication and returned 400 for handled errors: addressed with durable 24h at-most-once claims and metadata-only logs.
- Sensitive-path file previews leaked source into Telegram: withheld. Ordinary legacy previews/diffs still conflict with the strict full R-07 target and require the Mini App migration; not declared compliant.
- GitHub PR normalization dropped draft state: preserved so existing merge guard applies.
- Async status view was not awaited on text commands; Cloudflare delivery text had unmatched HTML: corrected with regressions.
- Unlock callbacks matched the lock suffix and had no signed Approval/TOTP: disabled fail-closed pending a complete verified unlock protocol; no insecure shortcut enabled.

## Open safety backlog — require focused security review

1. **R-07:** migrate all source/draft/PR patch display from Telegram to the authenticated Mini App; ordinary source/diff messages still exist.
2. **Diff memory:** O(beforeLines × afterLines) allocation can exceed Worker memory for newline-heavy valid drafts. Add bounded diff algorithms/tests before expanding use.
3. **Automation:** step effects precede durable completion with no execution claim; concurrent resumes may repeat effects. Do not enable new write recipes.
4. **Incidents:** nontransactional read/await/write update may lose concurrent records.
5. **Delivery evidence:** current correlation accepts an unrelated runtime version at 100% once CI/deploy SHAs match; require independent version-to-SHA verification.
6. **TOTP/unlock:** per-user encryption and last-step replay protection, plus signed/TOTP unlock, remain R-17/R-25 work.
7. **G1/G2:** shared token/default owner, 20-repository cap, fixed commit identity, no D1/grants/sessions, no If-Match, 30-minute Workspace TTL and inline CSP are future contract gaps.

No one should infer that G0 or later gates passed from this inventory.
