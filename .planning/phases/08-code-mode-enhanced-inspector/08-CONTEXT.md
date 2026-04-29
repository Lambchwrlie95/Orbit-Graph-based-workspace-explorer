# Phase 8: Code Mode & Enhanced Inspector

**Phase**: 8  
**Milestone**: v2.0 — Desktop Experience  
**Status**: Planning  
**Dependencies**: Phase 7

---

## Purpose

Phase 8 transforms Orbit from a file intelligence tool into a lightweight code IDE. Code Mode integrates Monaco Editor for editing, while Enhanced Inspector adds code analysis (imports/exports), image analysis (dimensions/colors/similarity), and markdown analysis (links/backlinks/headings). This makes Orbit a complete workspace environment where users can browse, understand relationships, and edit—all without leaving the app.

---

## Scope

### In Scope

#### Code Mode

1. **Monaco Editor Integration**:
   - Tabbed editing (multiple files open)
   - Syntax highlighting for common languages
   - Basic editing and save functionality
   - Line numbers and minimap
   - Find/replace within file

2. **Language Support**:
   - TypeScript/JavaScript
   - Python
   - Rust
   - JSON/YAML/TOML (with validation)
   - Markdown (with preview split)

3. **Editor Features**:
   - Auto-save option
   - Unsaved changes indicator
   - Keyboard shortcuts (VS Code compatible where possible)
   - Split view (editor + preview for Markdown)

#### Enhanced Inspector

1. **Code Analysis**:
   - Import detection (ES6, Python, Rust `use`)
   - Export detection (ES6 exports, Python `__all__`)
   - Git status (modified, staged, untracked)
   - Related files suggestion

2. **Image Analysis**:
   - Dimensions (width × height)
   - File size and format
   - Dominant colors (from Phase 7)
   - Similar images (from Phase 7)
   - Files that reference this asset

3. **Markdown Analysis**:
   - Links (outbound) with validation
   - Backlinks (inbound references)
   - Heading outline
   - Tag extraction (#tag syntax)
   - Rendered preview toggle

### Out of Scope (Deferred)

- Language Server Protocol (LSP) integration
- Debugging capabilities
- Git diff/merge UI
- Advanced refactoring
- IntelliSense/code completion (Monaco basic only)

---

## User Experience

### Code Mode Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Graph] [Explorer] [Search] [Assets] [Code*]                        │
├──────────────────────────────────────────────────────────────────────┤
│ File Tabs                                                            │
│ [main.rs ✓] [lib.rs ●] [config.toml ✓] [readme.md ✓] [+⋯]          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                                                            │     │
│  │  Monaco Editor                                             │     │
│  │                                                            │     │
│  │  use std::path::PathBuf;                                   │     │
│  │                                                            │     │
│  │  pub struct Workspace {                                    │     │
│  │      pub root: PathBuf,                                    │     │
│  │      pub files: Vec<FileEntry>,                            │     │
│  │  }                                                         │     │
│  │                                                            │     │
│  │  impl Workspace {                                          │     │
│  │      pub fn open(path: PathBuf) -> Result<Self> {          │     │
│  │          // ...                                            │     │
│  │      }                                                     │     │
│  │  }                                                         │     │
│  │                                                            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Status: Saved · Rust · UTF-8 · Ln 12, Col 34                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Markdown Split View

```
┌──────────────────────────────────────────────────────────────────────┐
│ [main.rs ✓] [readme.md ●] [Split ▼] [Preview] [Editor] [Both*]     │
├───────────────────────────┬──────────────────────────────────────────┤
│                           │                                          │
│  # My Project             │   ┌───────────────────────────────────┐ │
│                           │   │      My Project                   │ │
│  This is a **test**       │   │                                   │ │
│  project.                 │   │  This is a test project.          │ │
│                           │   │                                   │ │
│  ## Features              │   │  Features                         │ │
│                           │   │                                   │ │
│  - Fast                   │   │  • Fast                           │ │
│  - Reliable               │   │  • Reliable                       │ │
│  - Graph-based            │   │  • Graph-based                    │ │
│                           │   │                                   │ │
│  [Link](other.md)         │   │                                   │ │
│                           │   └───────────────────────────────────┘ │
│                           │                                          │
└───────────────────────────┴──────────────────────────────────────────┘
```

### Enhanced Inspector: Code File

```
┌────────────────────────────────────────┐
│ Inspector: main.rs                     │
├────────────────────────────────────────┤
│ 📄 main.rs                             │
│ Type: Rust Source                      │
│ Size: 2.4 KB                           │
│ Modified: 2 min ago                    │
├────────────────────────────────────────┤
│ 📝 Code Analysis                       │
│                                        │
│ Imports (4):                           │
│ • std::path::PathBuf                   │
│ • std::fs                              │
│ • crate::workspace::Workspace          │
│ • crate::scanner::Scanner              │
│                                        │
│ Exports (2):                           │
│ • fn main()                            │
│ • struct AppState                      │
│                                        │
│ 🔀 Git Status                          │
│ Modified (unstaged changes)            │
│ +12 lines, -3 lines                    │
│                                        │
│ 🔗 Related Files                       │
│ • workspace.rs (imported)              │
│ • scanner.rs (imported)                │
│ • Cargo.toml (dependency def)          │
├────────────────────────────────────────┤
│ [Open] [Edit] [Copy Path]              │
└────────────────────────────────────────┘
```

### Enhanced Inspector: Image File

```
┌────────────────────────────────────────┐
│ Inspector: wallpaper.png               │
├────────────────────────────────────────┤
│ 🖼️ wallpaper.png                      │
│ Type: PNG Image                        │
│ Size: 2.4 MB                           │
│ Modified: 3 days ago                   │
├────────────────────────────────────────┤
│ 📐 Dimensions                          │
│ 3840 × 2160 (4K UHD)                   │
│ Aspect Ratio: 16:9                     │
│                                        │
│ 🎨 Dominant Colors                     │
│ [🔴 #1a1a2e] [🟣 #16213e]             │
│ [🔵 #0f3460] [⚪ #e94560]             │
│                                        │
│ 🔄 Similar Images (3)                  │
│ ┌────┐ ┌────┐ ┌────┐                  │
│ │ 🖼️ │ │ 🖼️ │ │ 🖼️ │                  │
│ │wall│ │bg1 │ │bg2 │                  │
│ └────┘ └────┘ └────┘                  │
│                                        │
│ 📎 Referenced By                       │
│ • readme.md                            │
│ • docs/screenshots.md                  │
├────────────────────────────────────────┤
│ [Open] [Copy Path] [Copy Color #1a1a2e]│
└────────────────────────────────────────┘
```

### Enhanced Inspector: Markdown File

```
┌────────────────────────────────────────┐
│ Inspector: architecture.md             │
├────────────────────────────────────────┤
│ 📄 architecture.md                     │
│ Type: Markdown                         │
│ Size: 12.4 KB                          │
│ Modified: 1 hour ago                   │
├────────────────────────────────────────┤
│ 📋 Outline                             │
│ 1. Overview                            │
│ 2. System Architecture                 │
│    2.1 Backend (Rust)                  │
│    2.2 Frontend (React)                │
│ 3. Data Flow                           │
│ 4. Performance Considerations          │
│                                        │
│ 🔗 Links (5)                           │
│ • [Database Schema](schema.md) ✓       │
│ • [API Reference](api.md) ✓            │
│ • [Contributing](../CONTRIBUTING.md) ✓ │
│ • [Old Design](old.md) ⚠️ (not found)  │
│ • https://example.com 🌐               │
│                                        │
│ 🔙 Backlinks (3)                       │
│ • readme.md                            │
│ • setup.md                             │
│ • faq.md                               │
│                                        │
│ 🏷️ Tags                                │
│ #documentation #architecture #v2.0     │
├────────────────────────────────────────┤
│ [Open] [Edit] [Preview]                │
└────────────────────────────────────────┘
```

---

## Technical Design

### Monaco Editor Integration

**Package**: `@monaco-editor/react` or direct Monaco webpack integration

**Architecture**:
```
CodeMode
├── TabBar (open files, close, reorder)
├── EditorArea
│   ├── MonacoEditor (active file)
│   ├── MarkdownPreview (split view)
│   └── EmptyState (no file open)
├── StatusBar (language, encoding, position)
└── Actions (save, find, replace)
```

**File Management**:
- Track open files in React state
- Track modified state per file
- Auto-save timer (optional)
- Unload confirmation if unsaved

**Tauri Commands Needed**:
```rust
// Read file for editing
#[tauri::command]
async fn read_file_for_edit(path: String) -> Result<String, String>

// Save file
#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String>

// Check if file changed on disk
#[tauri::command]
async fn get_file_mtime(path: String) -> Result<u64, String>
```

### Code Analysis

**Import Detection** (Regex + Parser hybrid):

```rust
// ES6 imports
const ES6_IMPORT: &str = r"import\s+(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s+from\s+['\"]([^'\"]+)['\"]";

// Python imports
const PYTHON_IMPORT: &str = r"^(?:from\s+(\S+)\s+)?import\s+(.+)$";

// Rust use statements
const RUST_USE: &str = r"^use\s+(.+);$";
```

**Storage**:
```sql
CREATE TABLE code_analysis (
    file_id INTEGER PRIMARY KEY,
    imports JSON,        -- ["module", "path", ...]
    exports JSON,        -- ["name", "type", ...]
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Git Status Integration

**Approach**: Use `git2` crate or shell out to `git`

```rust
use git2::{Repository, StatusOptions};

fn get_file_status(repo_path: &Path, file_path: &Path) -> Option<FileStatus> {
    let repo = Repository::open(repo_path)?;
    let status = repo.status_file(file_path.strip_prefix(repo_path).ok()?)?;
    Some(status.into())
}
```

### Markdown Analysis

**Link Extraction**:
```rust
// Regex for markdown links
const MD_LINK: &str = r"\[([^\]]+)\]\(([^)]+)\)";

// Regex for wiki-style links (Obsidian style)
const WIKI_LINK: &str = r"\[\[([^\]]+)\]\]";

// Tag extraction
const MD_TAG: &str = r"#(\w+)";
```

**Backlink Index**:
```sql
CREATE TABLE markdown_links (
    id INTEGER PRIMARY KEY,
    source_file_id INTEGER,
    target_path TEXT,        -- Can be file or URL
    link_text TEXT,
    link_type TEXT,          -- 'markdown', 'wiki', 'url'
    line_number INTEGER,
    FOREIGN KEY (source_file_id) REFERENCES files(id)
);

CREATE INDEX idx_md_links_target ON markdown_links(target_path);
```

---

## User Decisions Required

| Decision | Options | Default | Impact |
|----------|---------|---------|--------|
| Auto-save | On / Off | Off | Affects file safety |
| Tab limit | 5 / 10 / 20 / Unlimited | 10 | Memory usage |
| Word wrap | On / Off | On | Editor behavior |
| Font size | 10-20px | 14px | Editor appearance |
| Minimap | Show / Hide | Show | Editor chrome |

---

## Dependencies

- **Phase 1-7**: All prior foundation
- **Frontend**:
  - `@monaco-editor/react` — Monaco wrapper
  - `monaco-editor` — Core editor
  - `remark` / `marked` — Markdown parsing
- **Backend**:
  - `regex` — Pattern matching for imports/links
  - `git2` — Git integration (optional)
  - `pulldown-cmark` — Markdown parsing (Rust)

---

## Success Criteria

### Code Mode

1. **Monaco Loads**: Editor appears and is interactive
2. **Syntax Highlighting**: Code has proper coloring
3. **Tabs Work**: Can open multiple files in tabs
4. **Save Works**: Changes save to disk
5. **Unsaved Indicator**: Shows ● for modified files
6. **Find/Replace**: Works within current file
7. **Markdown Preview**: Split view shows rendered markdown

### Enhanced Inspector

1. **Code Imports**: Shows imports for JS/Python/Rust files
2. **Code Exports**: Shows exported symbols
3. **Git Status**: Shows modified/staged/untracked status
4. **Image Dimensions**: Shows width × height
5. **Image Colors**: Shows dominant colors
6. **Markdown Links**: Lists all outbound links with validation
7. **Markdown Backlinks**: Shows files that link to this one
8. **Markdown Outline**: Shows heading structure

---

## Requirements Mapping

| Requirement | Phase 8 Coverage |
|-------------|------------------|
| **CODE-01** (Monaco tabs) | ✅ Code Mode primary deliverable |
| **CODE-02** (Edit and save) | ✅ Core editor functionality |
| **CODE-03** (Markdown preview) | ✅ Split view feature |
| **CODE-04** (Imports/exports) | ✅ Code analysis feature |
| **RELA-01** (Markdown links/backlinks) | ✅ Markdown analysis |
| **RELA-02** (Code imports) | ✅ Code analysis |
| INSP enhancements | ✅ All three analysis types |

---

## Phase 8 Plan Structure

### Plan 08-01: Monaco Editor Integration
- Monaco Editor React component integration
- Tab system for multiple files
- File read/save Tauri commands
- Unsaved changes tracking
- Editor settings (font size, theme, word wrap)

### Plan 08-02: Code Analysis and Git Status
- Import/export detection (JS/Python/Rust)
- Code analysis storage in SQLite
- Git status detection
- Enhanced inspector code panel
- Related files suggestion

### Plan 08-03: Markdown Analysis
- Markdown link extraction
- Backlink indexing
- Heading outline extraction
- Tag detection
- Link validation (file exists check)
- Enhanced inspector markdown panel

### Plan 08-04: Image Analysis in Inspector
- Image dimensions display
- Color swatches from Phase 7
- Similar images from Phase 7
- Asset reference detection
- Enhanced inspector image panel

---

*Phase 8 Context created: 2026-04-29*  
*Milestone: v2.0 — Desktop Experience*
