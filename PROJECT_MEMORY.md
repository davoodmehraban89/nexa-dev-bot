# PROJECT_MEMORY.md

## Project Identity
- Name: Nexa Dev Bot
- Repository: davoodmehraban89/nexa-dev-bot
- Purpose: Telegram-based development assistant for GitHub repository management.
- Memory status: Created as Single Source of Truth for future AI handoff.

## AI HANDOFF PROTOCOL
1. Read this file completely before making changes.
2. Verify the real repository state, runtime evidence, integrations and deployments.
3. Prefer repository evidence over stale memory or previous claims.
4. Update this file when memory becomes stale.
5. Continue from Last Checkpoint only after verification.
6. After every checkpoint, update this file with real evidence.

## Product Vision
Create a professional Telegram interface for secure development operations, GitHub visibility and future automation workflows.

## Repository / Workspace
- Repository: davoodmehraban89/nexa-dev-bot
- Default branch: main
- Visibility: private
- Current verified access: repository read/write available through GitHub integration.

## Architecture
Verified current architecture:
- Telegram Bot API webhook
- Cloudflare Worker style runtime (source indicates Worker fetch handler)
- GitHub API integration
- Environment secrets/configuration outside this file

## Technology Stack
- JavaScript
- Telegram Bot API
- GitHub REST API
- Cloudflare Worker runtime pattern

## Environments & Integrations
Verified:
- GitHub repository connection: available
- Telegram integration code exists
Not verified in this memory creation:
- Production deployment state
- Cloudflare deployment state
- Runtime monitoring
- External secret values

## Current Production State
Unknown. Must be verified from deployment/runtime evidence before claiming production readiness.

## Completed Work (Verified)
- Repository inspection completed.
- Existing Telegram webhook architecture identified.
- Existing GitHub repository browsing, commits and pull request reading flows were previously tested through Telegram according to conversation evidence.
- Continuity memory file created.

## Unverified / Planned
- New persistent Telegram menu implementation.
- editMessageText navigation architecture.
- PR creation for menu redesign.
- Automated tests.

## Current Work / Last Checkpoint
Checkpoint: Telegram UX redesign.

WHERE WE WERE:
Existing implementation uses multiple sendMessage calls for navigation.

WHAT CHANGED:
Continuity system added.

WHERE WE ARE NOW:
Memory baseline created. Menu redesign not implemented.

WHAT REMAINS:
Refactor navigation to one-message inline menu flow.

## Master Roadmap
Phase 1: Stable Telegram navigation core.
Phase 2: Repository submenu and state management.
Phase 3: Development tools and operations.
Phase 4: Security hardening and auditability.
Phase 5: QA, release validation and documentation.

## Requirements
- Avoid message spam during navigation.
- Prefer single editable menu messages.
- Maintain secure secret handling.
- Preserve auditability.

## User Decisions
- Prefer professional multi-level Telegram menus.
- Prefer execution based workflow over conversational explanations.
- Require verification before claiming completion.

## Architecture Decisions
- PROJECT_MEMORY.md is the primary continuity document.
- Credentials must never be stored here.

## UX/UI Decisions
Approved direction:
- Hierarchical Telegram navigation.
- Main menu concepts: Repos, Status, Tools, Settings.
- Use editable menu messages where technically appropriate.

## Data Model
No persistent application database model verified yet.

## Security Rules
- Never store tokens, passwords or secrets in repository memory files.
- Verify permissions before sensitive operations.

## Testing & Acceptance Criteria
Completed means:
IMPLEMENTED → VERIFIED → FIXED IF NEEDED → RE-VERIFIED

Required future verification:
- Telegram user flow test.
- Runtime test.
- Regression test for existing GitHub operations.

## Known Issues
- Current navigation sends separate messages instead of editing one menu message.
- State management for nested menus is not implemented.

## Technical Debt
- Add automated tests.
- Add structured state handling.
- Improve deployment documentation.

## Deployment / Release State
Not verified.

## Important File Paths
- Source entry: src/index.js
- Main memory: PROJECT_MEMORY.md
- Future documentation: docs/project-memory/
- Future assets: docs/project-memory/assets/

## Reference Assets
No project design assets were available for repository storage at memory creation time.
Status: Missing Asset.

## Change Log
- Initial PROJECT_MEMORY.md created.

## Next Executable Action
Inspect current source files and implement Telegram menu refactor only after confirming full code context.
