# GitHub Advanced READ Design

## Goal
Complete the READ side of the GitHub Advanced roadmap without weakening the existing owner-only policy or Safe Approval boundary.

## Scope
Owner-only Telegram views for:
- workflow job detail and bounded failed-job logs
- workflow run artifact metadata
- branches and compare-to-default
- pull request detail, changed-file summary, and checks
- issues
- releases
- bounded pagination where list size can grow

## Non-goals
- No new provider mutation in this slice.
- Workflow dispatch and specific-job rerun remain separate WRITE slices behind Safe Approval.
- No secret, token, binary artifact download, or full unbounded log/diff rendering.

## Architecture
Extend `GitHubService` with bounded REST readers and a text-response helper for job logs. Extend the GitHub plugin with compact numeric/SHA callbacks and Telegram views. All callbacks resolve to declared `READ` actions before provider calls, preserving `resolve -> policy -> execute`.

## Bounds and safety
- List pages: 10-20 items, page clamped to 1..100.
- Logs: keep a bounded tail and escape HTML; never emit raw binary.
- PR file patches: summarize/truncate per file; do not dump full diffs.
- Compare callbacks carry a 40-hex commit SHA rather than arbitrary branch text to stay under Telegram callback limits.
- Provider failures remain explicit.

## Acceptance
- New service/API tests cover endpoint shapes, pagination bounds, text log handling, and invalid identifiers.
- Plugin tests prove side-effect-free route resolution, manifest risk declarations, compact callbacks, bounded rendering, and repository navigation.
- Full CI green, reviewed PR merged, exact main CI/deploy green, production Cloudflare version verified.
- Owner-device smoke for READ navigation is required before calling the slice production-accepted.