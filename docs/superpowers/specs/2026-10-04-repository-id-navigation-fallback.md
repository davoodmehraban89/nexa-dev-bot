# Repository ID Navigation Fallback

## Problem

Production telemetry recorded `github.repo.detail` failing with `GitHub repository failed: 404 Not Found` when a Telegram `repo:<id>` navigation callback was used from an error/recovery screen. The UI then remained on the error screen, so the visible “Back to project” control appeared broken.

## Root cause

Repository navigation uses numeric GitHub repository IDs. `GitHubService.getRepositoryContext()` resolves numeric refs through `GET /repositories/{id}`. In production this endpoint returned 404 for an accessible private repository, even though the repository remained accessible through authenticated repository listings and its canonical `owner/name` endpoint.

## Required behavior

For numeric repository refs:

1. Try the direct numeric lookup first.
2. Only when it returns 404, enumerate repositories accessible to the authenticated token and find an exact numeric ID match.
3. Resolve that match through its canonical `owner/name` endpoint.
4. Do not fall back for non-404 provider failures.
5. Keep all existing owner-only, policy, Safe Approval, and audit behavior unchanged.

## Acceptance

- A focused test reproduces the private numeric-ID 404 and fails before implementation.
- The fallback test passes after implementation.
- Existing test suite remains green.
- PR CI is green before merge.
- Post-merge main CI and Cloudflare deployment are verified on the exact merge SHA.
