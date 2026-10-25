# G0 hardening continuation — 2026-10-25

Owner instruction: continue implementation in this execution environment; do not stop at another chat handoff. This report supplements the historical G0 report; it is not gate acceptance.

## Implemented code

| Change | Commit | Evidence |
| --- | --- | --- |
| Bounded exact Diff | `77c7894` | Intercepted the old 800,160,008-byte allocation safely in RED. Ordinary LCS capped at 65,536 cells; large sparse diff uses bounded Myers/banded reconstruction, max distance 64, max band 1,000,000 bytes, max work 2,000,000. Preserves exact insertion-first ties/counts. 540 randomized oracle comparisons and maximum newline/sparse/adversarial cases. |
| Durable automation claims / atomic incidents | `a9a082b` | Claim before real router dispatch, persistent revision/CAS and claim-token completion; concurrent/stale/terminal calls do not repeat effects. Incident body parsed before transactional upsert/resolve. RED reproduced duplicate effects, stale authorization and lost rows/counts. |
| Runtime/SHA evidence | `ace882c` | Actual active version selected from deployment traffic; detail fetched when omitted from latest list or lacking markers. Success requires active ID plus full matching documented `workers/commit_sha` or SHA-valued `workers/tag`. Missing proof stays UNKNOWN, mismatch stays MISMATCH. Workflow pins Wrangler and tags exact verified checkout SHA. Tightened an old false-positive test and fixed the plugin's short-SHA adapter. |
| Source boundary / authenticated reader | `e02e9fb` | Telegram file, workspace Diff, PR patch and raw job-log views no longer forward their source fields. File and Diff content is available in the existing owner-authenticated Mini App via opaque owner-scoped refs and workspace IDs, read-only with Save hidden/disabled. Sensitive files/expired refs/nonowners rejected. Raw provider error strings do not escape the new preview API. Raw job logs remain accessible on GitHub. |

## Verification on code head e02e9fb976f11167aa04a842f881dedb3e11a3ef

- Node **22.23.4**, full `npm test`: **353 passed, zero failed/cancelled/skipped/todo**.
- ESLint: zero errors, 13 existing warnings. Prettier and `git diff --check` pass.
- Wrangler **4.152.0** `deploy --dry-run` passes with the five existing bindings; no upload.
- Actual local workerd/SQLite smoke: exactly one of eight Automation claims wins; exactly one of eight completion attempts succeeds; completed state survives full runtime restart; twelve concurrent identical Incident updates produce one record with count twelve.
- Actual jsdom parsing: authenticated read-only file/Diff views render hostile-shaped content literally, expose no Save action and issue no save/provider request when Save is invoked programmatically.
- Independent focused AI reviews checked source/owner boundaries, durable concurrency, bounded Diff and runtime evidence. No implementation blocker remained. These are not human security or device acceptance.
- One full-run integration fixture lacked the newly required active-version detail response; it was updated to return real-shaped untagged version metadata. No production check was weakened.

The concurrent incoming PR-patch privacy regression was preserved by merge `9cca87e`. The merged candidate was checked again on Node 22: **354 tests passed**, with the same zero lint errors / 13 existing warnings; formatting and the pinned Wrangler dry-run also passed. Final remote checks are recorded on PR #65.

## Cloudflare build blocker: confirmed and addressed for this branch

The earlier failing Workers build `cea884d0-9e1c-477d-b390-264a64722268` on commit `4ddab54f8faf27ad1be571e7ae50e2da4f3b15db` ran `npx wrangler preview` and returned Cloudflare error **10067**: the account reached the Free plan's **100 Durable Object namespaces** limit. This was a preview provisioning quota, not a compilation/test error.

After reading the trigger's live configuration, changed only trigger `30efc160-813b-4c61-b588-532cd74fbbfa`, whose branch filter is exactly `feat/studio-g0-foundation`, from `npx wrangler preview` to **`npm run build:check`**. Read-back confirmed the command and branch filter at `2026-10-25T07:12:14.657Z`. This reversible branch build validates the bundle without deploying previews or creating more namespaces; it also follows D-10's exclusion of Preview Environment from the current product scope. No production trigger, secret, deployment, stored namespace or paid plan was changed.

The account quota itself is not increased and no namespaces were deleted. A future staging deployment may still require an owner-reviewed resource inventory/cleanup decision. Rollback of this trigger-only configuration is restoring its prior command; doing so would resume preview attempts and can reproduce the quota failure.

GitHub and Cloudflare exact-head results are linked in PR #65 after pushing the final candidate; avoid creating another documentation commit merely to record its own CI.

## Limits and unresolved gate work

- These changes harden existing G0 paths. They do not constitute G1, multi-user access, CodeMirror, D1, encrypted PAT onboarding, sessions/grants or secure signed/TOTP unlock.
- Very complex valid edits can be refused with `DIFF_COMPLEXITY_LIMIT` (Mini App HTTP 422 with a Persian next step). No approximate diff/counts or silent success is returned. Splitting changes may be necessary; editor content ceilings are unchanged.
- An interrupted automation effect leaves **step_unresolved** indefinitely. No expiring automatic claim/retry is allowed because a provider effect may already have happened. Cancellation/reset PUTs while unresolved return conflict instead of pretending the effect was revoked. Manual reconciliation is still needed; exactly-once external execution is not claimed.
- Runtime commit markers are authenticated Cloudflare metadata, not cryptographic source attestations. Untagged or ambiguous deployments remain unverified. A latest-list entry carrying only a non-SHA human tag may cause a conservative UNKNOWN until metadata is enriched.
- The known outbound source-bearing fields are covered by sentinel regression tests. Legacy owner-initiated Telegram Paste/upload compatibility and arbitrary user-entered metadata still exist. Do not claim the full contract's source/token lifecycle or C-30 token interception is implemented; those need the remaining migration/security work.
- R-26 still needs fresh owner-produced device/Approval/GitHub/Cloudflare evidence. No recording, owner click, human review or provider test commit was fabricated. Existing main/production revision has not been merged or deployed by this continuation.
- G0 acceptance and permission to cross into G1 remain pending the contract's evidence and written owner decision.
