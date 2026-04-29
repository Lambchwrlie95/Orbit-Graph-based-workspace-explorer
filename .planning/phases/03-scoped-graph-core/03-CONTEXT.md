# Phase 3 Context: Scoped Graph Core

## Phase Boundary

Render the active workspace or selected folder as an interactive graph. The graph must stay explicitly scoped by root and scope path, enforce a node cap, and integrate with shared selection/inspector flows.

## Decisions

- Use Graphology for in-memory graph data and Sigma.js for rendering.
- Backend graph requests carry root path, scope path, mode, and limit together.
- Oversized scopes are capped and reported instead of rendered fully.
