# Phase 2 Multi-file Workspace Design

## Goal
Extend the production-accepted owner-only Repository Workspace from one-file intents to bounded atomic multi-file Change Sets without weakening branch-first, Safe Approval, replay protection, Kill Switch, fail-closed behavior, or evidence requirements.

## Scope
Phase 2 adds a multi-file Change Set model and the minimum useful GitHub WRITE orchestration needed to commit that set to a dedicated `nexa/edit-*` branch. It does not add direct default-branch writes, automatic merge/rebase/conflict resolution, RBAC, Level-C autonomy, or AI-driven mutation.

## User flow
1. Owner opens a repository Workspace at an exact base SHA.
2. Owner adds/edits multiple bounded text files. Each file remains subject to the existing path/content safety policy.
3. Nexa persists drafts owner-scoped in Durable Object state; source/draft bodies never enter callback data, logs, incidents, or audit metadata.
4. Nexa renders per-file and aggregate Diff plus the exact base SHA.
5. Owner supplies one commit message for the complete Change Set.
6. Ready seals an immutable intent containing repository, base SHA, target branch, ordered file descriptors/digests, aggregate digest and commit message digest.
7. Safe Approval binds to that immutable intent. Any material change invalidates Ready and requires a fresh approval.
8. After approval, Nexa revalidates base/material, checks Kill Switch, creates Git objects for all files, builds one tree and one commit, and advances only the dedicated `nexa/edit-*` branch.
9. Nexa verifies the resulting branch/commit and reports evidence. `main` is never mutated by this flow.

## Atomicity and idempotency
The provider orchestration constructs blobs/tree/commit before the final branch-ref mutation. The branch ref is the single publication point. If any pre-publication operation fails, the branch must not advance. Reconciliation after ambiguous provider/network failure reads the target ref and commit/tree evidence before deciding whether to retry. Repeating the same sealed intent must converge to the same accepted result or an explicit conflict; it must not create a second logical mutation.

## State model
A Workspace owns a Change Set with bounded file entries. Each entry records path, base blob identity/digest, draft digest and state; bodies remain only in durable Workspace storage. A sealed Ready Intent is immutable and stores only bounded metadata/digests needed for approval and reconciliation. Existing single-file state is migrated/read compatibly rather than discarded.

## Security invariants
- Telegram private operations remain owner-only.
- READ is owner-only; WRITE/DESTRUCTIVE stay behind central Policy and Safe Approval.
- Kill Switch is evaluated before every provider mutation and fails closed on unreadable durable state.
- Approval remains owner/action/risk/target/expiry-bound and one-time through durable replay protection.
- No direct `main` mutation, force update, auto-merge, auto-rebase, or silent conflict resolution.
- Stale base, changed draft, changed file list/order, changed target or changed commit message invalidates the sealed intent.
- Sensitive paths, binary-like content, Git LFS pointers and configured size ceilings remain rejected.
- Secret/source/draft bodies/signed approval material never enter logs, audit, incident records or callback payloads.

## Failure and recovery
Validation failures are explicit and preserve the durable Change Set. Provider failures are explicit and never reported as success without fresh evidence. Stale-base or target collision returns the owner to review/reseal rather than mutating around the conflict. A consumed approval is never reused after failure. Recovery routes preserve owner context and offer retry only when the operation can be safely reconciled.

## Evidence
Every successful WRITE result records bounded non-secret evidence: repository, sealed intent ID/digest, exact base SHA, target branch, resulting commit SHA, action outcome and timestamp. Production acceptance requires exact-SHA CI, deployment evidence, runtime evidence and an owner-device multi-file smoke proving the branch changed as intended while `main` remained unchanged.

## TDD acceptance
Negative tests must prove: no mutation before approval; Kill Switch blocks mutation; non-owner cannot access; replay fails; stale base fails; changed material after Ready fails; partial provider failure does not advance branch; ambiguous failure reconciles before retry; sensitive/binary/oversized file rejection applies per file; callback/log/audit redaction holds; and `main` is never the target. Positive tests must prove two-or-more-file Change Sets produce one branch commit/tree with all intended file changes and deterministic idempotent reconciliation.

## Compatibility
Single-file Workspace behavior remains a one-entry Change Set and existing production flows continue to work. Existing Durable Object namespaces and approval semantics are reused; no destructive migration is required.

## Out of scope
Multi-user RBAC, full multi-project control plane, automatic PR merge, natural-language change requests, browser QA execution, marketplace, Level-C autonomy and broad self-healing remain deferred.