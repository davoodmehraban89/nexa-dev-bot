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

## Emergency Kill Switch
The global Kill Switch has two durable states: `NORMAL` and `LOCKED`. In `LOCKED`, READ remains available for diagnosis, but every WRITE and DESTRUCTIVE action is denied before provider mutation. Automation execution/resume must also pause while locked. If the durable Kill Switch state cannot be read, WRITE/DESTRUCTIVE and Automation fail closed.

Lock and unlock are owner-only sensitive controls and must not bypass the central Policy/Safe Approval boundary. Unlock must never be inferred from a restart, deploy or missing state. The durable store is the authority. Audit may record state/action/outcome/timestamp but never secret, source/draft body or signed approval material.

## Rollback
Rollback only to a known-good deployed version. Any Cloudflare operation changing deployed code remains DESTRUCTIVE and must use owner-bound Safe Approval with durable one-time replay protection. After rollback, independently verify active version/traffic/runtime state and record the evidence.

## Workspace safety
Workspace mutations remain Draft → Diff → Commit Message → Ready → Safe Approval → branch commit. The target is `nexa/edit-*`; direct `main` mutation, force update and silent conflict resolution are prohibited.

## DESTRUCTIVE second factor
Every DESTRUCTIVE action requires two independent checks: the existing owner-bound Safe Approval and a six-digit TOTP generated from the separately provisioned `DESTRUCTIVE_TOTP_SECRET`. If the TOTP secret, durable pending state, approval token or TOTP code is unavailable/invalid/expired, the operation fails closed and performs no provider mutation. Five invalid TOTP attempts cancel the pending second-factor challenge and require a fresh Approval. TOTP codes, the TOTP secret and signed Approval tokens must never be written to audit, incident or application logs.

Provision the TOTP secret as a Cloudflare Worker secret before deploying this release. Enroll the same Base32 secret in the owner's authenticator application out-of-band. Do not place the secret in Git, Telegram messages, README examples or tickets.

## Security regression gate
Before accepting a release, verify owner-only Telegram boundary, central action policy, HMAC approval verification, DESTRUCTIVE TOTP second factor, durable replay guard, Emergency Kill Switch, owner-scoped Workspace state, explicit provider failures, bounded Telegram rendering, minimal public `/status`, and Production/Preview isolation.

## Recovery
When a provider or validation action fails, keep the failure visible and preserve a bounded recovery path. Never report a retry as successful until fresh provider/runtime evidence confirms it.
