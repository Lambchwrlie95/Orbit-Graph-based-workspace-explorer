# Research Summary: Orbit

## Key Findings

**Stack:** Tauri 2, Rust, React + TypeScript, SQLite, Graphology, Sigma.js, and Monaco match the desired split between native file intelligence and polished frontend interaction.

**Table stakes:** The MVP must open a folder, scan/index files, browse them normally, search by filename, show a scoped graph, inspect selections, open files externally, and stay fast on large folders.

**Watch out for:** Whole-disk graph rendering, scanner overreach, decorative UI, premature IDE scope, premature Tantivy adoption, root-scoped graph drift, and missing durable diagnostics.

## Recommended v1 Shape

Build a foundation-first v1:

1. Workspace/scanner/database foundation.
2. Explorer, search, inspector, and open actions.
3. Scoped graph rendering with performance limits.
4. Relationship and asset/code intelligence only after the foundation is reliable.

## Roadmap Implications

- Put Rust/SQLite foundation before UI polish.
- Put explorer/search/inspector before advanced graph relationships.
- Make graph scope and node caps non-negotiable requirements.
- Defer Monaco editing, advanced asset intelligence, and Tantivy to v2 unless they become necessary to validate the core value.
- Use `/home/lamb/Projects/graph-file-manager` as a reference for Tauri/Rust/SQLite scanner, watcher, graph builder, preview, and logging patterns.
