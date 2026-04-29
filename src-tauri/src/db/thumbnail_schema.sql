-- Thumbnail metadata storage
CREATE TABLE IF NOT EXISTS thumbnails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    size INTEGER NOT NULL, -- 128, 256, or 512
    path TEXT NOT NULL, -- relative path from thumbnail base dir
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_modified_at TIMESTAMP, -- for cache invalidation
    width INTEGER, -- actual thumbnail width
    height INTEGER, -- actual thumbnail height
    UNIQUE(file_id, size)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_thumbnails_file_id ON thumbnails(file_id);
CREATE INDEX IF NOT EXISTS idx_thumbnails_size ON thumbnails(size);

-- Perceptual hash table (for 07-03)
CREATE TABLE IF NOT EXISTS perceptual_hashes (
    file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    phash BLOB NOT NULL, -- 64-bit hash stored as 8 bytes
    algorithm TEXT DEFAULT 'phash',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset tags tables (for 07-02)
CREATE TABLE IF NOT EXISTS asset_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366F1', -- default indigo
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_asset_tags (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES asset_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_file_asset_tags_tag_id ON file_asset_tags(tag_id);
