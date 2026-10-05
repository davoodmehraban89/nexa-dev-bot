# Nexa Dev Bot — V2.1 Acceptance Record

This record closes the bounded acceptance scope for Repository Workspace Phase 1, the exhaustive Telegram menu audit, Guide/README synchronization, and security hardening.

## Repository Workspace — PRODUCTION ACCEPTED

Production owner-device evidence exists for the complete branch-only write path. The Bot-created branch `nexa/edit-b4Od3BIMYd` resolves to commit `0b7c796efb3d77ac2c225d5fe6d1cacaaf4eabe2`; the smoke changed only `README.md` on that branch and left `main` unchanged. The Workspace path remains Draft → Diff → Commit Message → Ready → Safe Approval → Confirm → `nexa/edit-*` branch commit. Direct Workspace mutation of `main` is prohibited.

The current regression suite verifies owner-scoped durable Workspace state, exact Diff behavior, immutable Ready intents, stale-material/base rejection, branch-only Git Data orchestration, idempotent reconciliation, explicit provider failures, recovery after validation/provider errors, Mini App owner-bound `initData`, and zero provider write from Draft save.

## Telegram Menu Audit — COMPLETE

`test/telegram-menu-e2e.test.js` and the surrounding navigation/ops/plugin tests cover the reachable static menu graph plus representative dynamic repository, file, commit, PR, CI, branch, issue, release, Workspace, Cloudflare, Status, Tools, Security, Configuration and Guide routes. Reports are required to be source-backed, non-empty, recoverable and explicit on provider failure. Commit, Issue and Release lists have actionable drill-down. No production button is intentionally left as a misleading placeholder.

Telegram rendering remains bounded: message text must stay within 4096 characters and `callback_data` within 64 UTF-8 bytes.

## Guide / README — SYNCHRONIZED

The in-app Guide is V2.1 and documents the operational console, live/source-backed status, Security Center, read-only Configuration Center, Workspace Editor, complete file-edit path, Safe Approval, Production/Preview isolation and the public status boundary. `test/help-guide.test.js` enforces the Guide chapters, controls and Telegram limits.

`README.md` reflects the deployed V2.1 architecture, persistent quick menu, `WORKSPACE_STORE`, Mini App Editor, Ops/Security/Configuration surfaces, Cloudflare Preview isolation and branch-only `nexa/edit-*` Workspace writes.

## Security Hardening — COMPLETE FOR V2.1 SCOPE

The verified invariants are:

- Telegram private operations are owner-only.
- READ is owner-only; WRITE and DESTRUCTIVE require central policy approval.
- Safe Approval is owner/action/risk/target/expiry-bound, HMAC-signed and one-time.
- Replay protection is durable and fail-closed through `APPROVAL_REPLAY_GUARD`.
- Workspace state is owner-scoped through `WORKSPACE_STORE`.
- GitHub provider mutation never executes before approval.
- PR merge is DESTRUCTIVE and bound to repository, PR number and exact head SHA.
- Source, Draft, Secret values and signed approval tokens are excluded from audit/diagnostic output.
- Provider errors are explicit; fake success/fallback data is forbidden.
- Public `/status` remains minimal health-only; owner diagnostics remain inside Telegram.
- Production and Preview Durable Object state are isolated.

## Verification Gate

Acceptance is valid only while the full CI suite remains green. Any future change to Workspace mutation, Approval, owner boundary, public `/status`, Durable Object bindings or Telegram callback construction must preserve these invariants and add regression coverage before production code changes.
