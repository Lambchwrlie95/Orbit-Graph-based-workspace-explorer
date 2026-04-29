# Phase 7: Asset Mode

**Phase**: 7  
**Milestone**: v2.0 — Desktop Experience  
**Status**: Planning  
**Dependencies**: Phase 6

---

## Purpose

Phase 7 implements Asset Mode: a specialized view for visual asset management. Unlike the general-purpose Explorer Mode, Asset Mode is optimized for images, icons, themes, and design assets. It provides thumbnail grids, color extraction, duplicate detection, and asset-specific workflows that make Orbit especially useful for designers, developers customizing Linux desktops, and anyone managing visual assets.

---

## Scope

### In Scope

1. **Thumbnail Grid View**:
   - Large thumbnail display (128px - 256px)
   - Fast scrolling through hundreds of images
   - Virtual scrolling for performance
   - Multi-select with visual feedback
   - Drag selection (marquee)

2. **Image Analysis**:
   - Dimension extraction (width × height)
   - Dominant color extraction (top 5 colors)
   - Color palette generation
   - Format detection

3. **Duplicate Detection**:
   - Perceptual hash-based detection
   - Exact duplicate detection (file hash)
   - Similar image grouping
   - Batch duplicate review UI

4. **Asset Collections/Tags**:
   - Tag assets with labels
   - Filter by tag
   - Smart collections (e.g., "All PNGs > 1000px")

5. **Asset Actions**:
   - Copy path
   - Copy color (hex value)
   - Open externally
   - Show in folder
   - Copy/move to collection

### Out of Scope (Deferred)

- Image editing (crop, resize, filters)
- Cloud asset sync
- Version control for assets
- AI-powered auto-tagging

---

## User Experience

### Asset Mode Layout

```
┌─────────────────────────────────────────────────────┐
│ [Graph] [Explorer] [Search] [Assets*] [Code]        │
├──────────┬──────────────────────────────────────────┤
│ Filters  │  Thumbnail Grid                          │
│          │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│ 🏷️ Tags   │  │ 🖼️ │ │ 🖼️ │ │ 🖼️ │ │ 🖼️ │ │ 🖼️ │   │
│   Red    │  │1920│ │1280│ │3840│ │ 800│ │ 640│   │
│   Blue   │  │x1080│x720│x2160│x600│x480│   │
│   Icons  │  └────┘ └────┘ └────┘ └────┘ └────┘   │
│          │  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│ 📁 Folders│  │ 🖼️ │ │ 🖼️ │ │ 🖼️ │ │ 🖼️ │          │
│   /icons │  │128 │ │256 │ │512 │ │1024│          │
│   /themes│  └────┘ └────┘ └────┘ └────┘          │
│          │                                            │
│ 🔍 Search│  [Load more...]                          │
│   [____] │                                            │
│          ├──────────────────────────────────────────┤
│ 🔴 Colors│  Inspector (when image selected)         │
│  #FF5733 │  - Dimensions: 1920×1080                 │
│  #33FF57 │  - Format: PNG                           │
│  #3357FF │  - Colors: [🔴] [🟢] [🔵] [⚪] [⚫]       │
│          │  - Duplicates: 2 similar found           │
│ 📊 Stats │  - Tags: [wallpaper] [background]        │
│  1,247   │                                            │
│  images  │                                            │
└──────────┴──────────────────────────────────────────┘
```

### Duplicate Detection UI

```
┌─────────────────────────────────────────────────────┐
│ Duplicate Groups (3 groups found)                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📁 Group 1 - 3 duplicates (2.4 MB wasted)          │
│ ┌────┐ ┌────┐ ┌────┐                               │
│ │ 🖼️ │ │ 🖼️ │ │ 🖼️ │  99% match                   │
│ │wall│ │wall│ │wall│                               │
│ │.png│ │.jpg│ │(2).│                               │
│ └────┘ └────┘ └────┘                               │
│ [Keep first] [Review] [Delete others]              │
│                                                     │
│ 📁 Group 2 - 2 duplicates (850 KB wasted)          │
│ ┌────┐ ┌────┐                                      │
│ │ 🖼️ │ │ 🖼️ │  100% match (exact)                 │
│ │logo│ │logo│                                      │
│ │.svg│ │.svg│                                      │
│ └────┘ └────┘                                      │
│ [Keep first] [Review] [Delete others]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Asset Mode (React)                      │
├──────────────┬──────────────────────────┬───────────────────┤
│  Thumbnail   │     Image Analysis       │   Duplicate       │
│    Grid      │                          │   Detection       │
├──────────────┼──────────────────────────┼───────────────────┤
│VirtualScroll │  ┌──────────────────┐    │  ┌─────────────┐  │
│MultiSelect   │  │ Rust Backend     │    │  │ Perceptual  │  │
│DragSelect    │  │ - Image metadata │    │  │ Hash (pHash)│  │
│              │  │ - Color extraction│   │  │ - Hamming   │  │
│              │  │ - Thumbnail gen  │    │  │   distance  │  │
│              │  └──────────────────┘    │  │ - Grouping  │  │
│              │                          │  └─────────────┘  │
├──────────────┴──────────────────────────┴───────────────────┤
│                      SQLite Storage                         │
│  - file_records (has dimensions, color_data)                │
│  - thumbnails (path, size, generated_at)                    │
│  - perceptual_hashes (file_id, hash, algorithm)             │
│  - tags (id, name, color)                                   │
│  - file_tags (file_id, tag_id)                              │
└─────────────────────────────────────────────────────────────┘
```

### Thumbnail Generation

**Backend (Rust)**:
- Use `image` crate for resizing
- Generate thumbnails async/background
- Store in `~/.local/share/orbit/thumbnails/`
- Cache: 128px, 256px, 512px sizes

**Process**:
```rust
// Pseudo-code
async fn generate_thumbnail(file_path: &Path, size: u32) -> Result<PathBuf> {
    let img = image::open(file_path)?;
    let thumbnail = img.resize(size, size, FilterType::Lanczos3);
    let thumb_path = get_thumb_path(file_path, size);
    thumbnail.save(&thumb_path)?;
    Ok(thumb_path)
}
```

### Color Extraction

**Algorithm Options**:
1. **K-means clustering** on pixel samples
2. **Color quantization** (reduced palette)
3. **Dominant color** (most frequent)

**Implementation**:
```rust
// Use color-thief crate or implement k-means
fn extract_colors(image: &DynamicImage, color_count: u8) -> Vec<Color> {
    // Sample pixels
    // Run k-means
    // Return top N colors with percentages
}
```

### Duplicate Detection

**Perceptual Hash (pHash)**:
1. Resize image to 32x32
2. Convert to grayscale
3. Apply DCT (Discrete Cosine Transform)
4. Take top-left 8x8 frequencies (low frequencies)
5. Compare to median, create 64-bit hash
6. Hamming distance between hashes determines similarity

**Thresholds**:
- Distance 0-5: Exact/near-exact match
- Distance 6-10: Very similar
- Distance 11-20: Similar composition

**Storage**:
```sql
CREATE TABLE perceptual_hashes (
    file_id INTEGER PRIMARY KEY,
    phash BLOB NOT NULL,  -- 64-bit hash
    algorithm TEXT DEFAULT 'phash',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast hamming distance comparison
CREATE INDEX idx_phash ON perceptual_hashes(phash);
```

---

## User Decisions Required

| Decision | Options | Default | Impact |
|----------|---------|---------|--------|
| Thumbnail quality | Low / Medium / High | Medium | Affects generation speed vs quality |
| Auto-detect duplicates | Yes / No | Yes | Background task on scan |
| Similarity threshold | 0-20 (Hamming) | 10 | Affects duplicate grouping |

---

## Dependencies

- **Phase 1-4**: Core file system, database, scanning
- **Phase 5-6**: Desktop integration, Explorer foundations
- **Rust Crates**:
  - `image` — Image processing
  - `color-thief` or custom k-means — Color extraction
  - Optional: `img_hash` — Perceptual hashing

---

## Success Criteria

1. **Thumbnail Grid**: Smooth scrolling through 1000+ images
2. **Thumbnails Generated**: Images show previews in Asset Mode
3. **Dimensions Shown**: Each thumbnail shows width × height
4. **Colors Extracted**: Dominant colors displayed in inspector
5. **Duplicates Found**: System detects and groups similar images
6. **Tag System**: User can tag and filter by tags
7. **Copy Color**: User can copy hex values from color swatches
8. **Performance**: Grid loads within 2 seconds for 500 images

---

## Requirements Mapping

| Requirement | Phase 7 Coverage |
|-------------|------------------|
| **ASET-01** (Thumbnail grid) | ✅ Phase 7 primary deliverable |
| **ASET-02** (Dimensions, colors) | ✅ Image analysis features |
| **ASET-03** (Duplicate detection) | ✅ Perceptual hash implementation |
| **ASET-04** (Copy path/color) | ✅ Asset actions |

---

## Phase 7 Plan Structure

### Plan 07-01: Thumbnail System
- Thumbnail generation backend (Rust)
- Thumbnail storage and caching
- Thumbnail API endpoints
- Asset Mode shell and mode switching

### Plan 07-02: Asset Grid and Image Analysis
- Thumbnail grid component with virtual scrolling
- Image metadata extraction (dimensions, format)
- Dominant color extraction
- Color display in inspector
- Tag system backend and UI

### Plan 07-03: Duplicate Detection
- Perceptual hash generation (Rust)
- Hash storage in SQLite
- Similarity comparison algorithm
- Duplicate groups UI
- Batch duplicate management

---

*Phase 7 Context created: 2026-04-29*  
*Milestone: v2.0 — Desktop Experience*
