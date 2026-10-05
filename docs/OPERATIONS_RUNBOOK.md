# Nexa Dev Bot — Production Operations Runbook

## Release gate
1. Identify the exact candidate commit SHA.
2. Require successful PR CI.
3. Merge only the reviewed head.
4. Require successful post-merge CI on the exact `main` SHA.
5. Deploy only that verified SHA through the repository deployment workflow.
6. Verify production runtime independently before acceptance.

## Runtime incident path
Treat failed CI/deploy, provider errors, Worker runtime degradation, approval/replay failures, and GitHub/Cloudflare evidence mismatch as explicit failures. Preserve bounded non-secret evidence: exact SHA, workflow/run/job IDs, deployment/version IDs, action ID, outcome and timestamp. Never persist tokens, secret values, source/draft bodies or signed approval callbacks.

## Rollback
Rollback only to a known-good deployed version. Any Cloudflare operation changing deployed code remains DESTRUCTIVE and must use owner-bound Safe Approval with durable one-time replay protection. After rollback, independently verify active version/traffic/runtime state and record the evidence.

## Workspace safety
Workspace mutations remain Draft → Diff → Commit Message → Ready → Safe Approval → branch commit. The target is `nexa/edit-*`; direct `main` mutation, force update and silent conflict resolution are prohibited.

## Security regression gate
Before accepting a release, verify owner-only Telegram boundary, central action policy, HMAC approval verification, durable replay guard, owner-scoped Workspace state, explicit provider failures, bounded Telegram rendering, minimal public `/status`, and Production/Preview isolation.

## Recovery
When a provider or validation action fails, keep the failure visible and preserve a bounded recovery path. Never report a retry as successful until fresh provider/runtime evidence confirms it.
