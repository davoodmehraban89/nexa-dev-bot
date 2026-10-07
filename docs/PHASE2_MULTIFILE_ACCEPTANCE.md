# Phase 2 Multi-file Workspace Acceptance

## Contract
Phase 2 extends Repository Workspace to a bounded **multi-file Change Set** while preserving **single-file compatibility** as a one-entry Change Set. Every Change Set is pinned to an **exact base SHA**, uses one commit message, renders aggregate/per-file Diff, seals deterministic file descriptors/digests, and publishes only to `nexa/edit-*`.

Provider mutation remains behind central Policy, **Safe Approval**, durable replay protection and the global **Kill Switch**. There is **no direct `main` mutation**, force update, automatic merge/rebase or silent conflict resolution. Source/draft bodies, secrets and signed approval material are excluded from callbacks, audit, incident records and logs.

## Production implementation evidence
- Core Phase 2 merge SHA: `c2aafc36950e39f06e11c940d29a1692d527c526`; PR #54, head `ec64e8386288416a4315b6aff8867704190cfc68`.
- Add-file callback routing hotfix: PR #56, head `33b2b15883a7dd43fecf1ba308040f954d201d18`, exact-head CI run `37537654452` success, merge `ad7d3b3f8ab993c8fed9b1f3dc8dbc6876c5e2dc`.
- Main-menu local callback fallback: PR #57, head `de1b32ec82458c866614fb6b33036a1a23f54d7f`, exact-head CI `37571808790` success, merge `fd6ea8492b65fc2e983f5d4caf32ad29fe167e67`, post-merge CI `37571849725` success, deploy `37571878439` success.
- Durable workspace navigation refs / pinned file picker: PR #58; owner-device add-file smoke passed after production deployment.
- Per-file workspace editor controls: PR #59; owner-device editing of both Change Set files passed after production deployment.
- Multi-file Ready summary: PR #60, head `5e60da97f909c6ccc25e0b492bec180a551a81a4`, exact-head CI `37664886234` success, merge `e354ff4c09f29f4e7db2878ab17205805261f87b`, post-merge CI `37664960688` success, deploy `37664996112` success.
- Current Cloudflare deployment after PR #60: `6732f7e5-c190-4f39-9ba8-46a6241e17d7`, version `417f0e54-da05-4c69-8187-241b4a5afe4a`, 100% traffic.

## Owner-device production smoke — PASS
- Target repository: `davoodmehraban89/nexa-dev-bot`.
- Exact base/main SHA before publication: `c6d457b56b8527a26c1ca97ace82a3b622e586fa`.
- Change Set: `README.md` and `PROJECT_MEMORY.md`; both edited and durably saved.
- Aggregate Diff observed on owner device: 2 changed files, +2/-2; each file +1/-1.
- Ready generated target branch `nexa/edit-BwJEIIY3PW` and remained mutation-free before Safe Approval; GitHub independently returned the target branch as absent before approval and `main` remained at the exact base SHA.
- Safe Approval was completed on the authorized owner device. No TOTP was required because branch commit publication is WRITE, not DESTRUCTIVE.
- Resulting branch: `nexa/edit-BwJEIIY3PW`.
- Resulting commit: `612e4bcecf39547d331174bfa15860ea06832cc1`.
- Commit parent: `c6d457b56b8527a26c1ca97ace82a3b622e586fa` (the exact pinned base).
- Independent GitHub verification of commit contents: exactly the intended two modified files, `README.md` (+1/-1) and `PROJECT_MEMORY.md` (+1/-1), in the same commit.
- Independent GitHub verification immediately after publication: `main` remained `c6d457b56b8527a26c1ca97ace82a3b622e586fa`; no direct-main write occurred.
- Owner-device smoke completed 2026-10-07 (production Telegram runtime).

## Acceptance result
**PASS.** The real production path demonstrated: add second file -> independently edit/save both files -> aggregate/per-file Diff -> one commit message -> Ready -> no pre-approval provider mutation -> Safe Approval -> exactly one multi-file commit on a new `nexa/edit-*` branch -> `main` unchanged.

The editor Mini App does not mutate an already-rendered Telegram Workspace message in place after Save; reopening/rerendering Workspace reflects the durable count. This is a presentation refresh limitation, not a persistence or publication failure, and does not alter the accepted security/write contract.

