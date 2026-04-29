# Phase 4 Context: Performance Guardrails

## Phase Boundary

Harden Orbit so large local folders do not overwhelm the UI or backend.

## Decisions

- Cap normal graph payloads at 1,500 nodes by default and clamp requests to 2,000.
- Keep scanning in backend async commands with a DB write lock.
- Avoid pushing full workspace data to React; load children, search results, previews, and graph scopes on demand.
