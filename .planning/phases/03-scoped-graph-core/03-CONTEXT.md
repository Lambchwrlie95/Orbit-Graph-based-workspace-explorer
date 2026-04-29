# Phase 3 Context: Scoped Graph Core

## Phase Boundary

Render the active workspace or selected folder as an interactive graph. The graph must stay explicitly scoped by root and scope path, enforce a node cap of 200 visible nodes, and integrate with shared selection/inspector flows.

## Decisions

- Use Graphology for in-memory graph data and Sigma.js for rendering
- Backend graph requests carry root path, scope path, mode, and limit together
- Node cap of 200 prevents UI overload while maintaining usefulness
- Folder clustering activates when a folder would show >50 children
- Double-click interactions: files open externally, folders navigate deeper
- Scope validation ensures graph never escapes workspace root

## Technical Stack

- Backend: Rust with rusqlite for graph queries
- Frontend: React + TypeScript
- Graph Data: Graphology
- Rendering: Sigma.js v3 beta
- Styling: CSS with dark glassy theme

## Key Metrics

- Max visible nodes: 200
- Folder clustering threshold: 50 children
- Query limit range: 100-2000 (configurable, default 200)

## Integration Points

- GraphView receives `onSelectPath` callback for inspector updates
- GraphView receives `onOpenPath` callback for external file opening
- GraphView receives `onFocusFolder` callback for folder navigation
- Main App component manages mode state and path navigation
