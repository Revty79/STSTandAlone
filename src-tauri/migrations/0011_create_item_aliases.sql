PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS item_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    source_reference TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (item_id, alias COLLATE NOCASE),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_aliases_lookup
    ON item_aliases (alias COLLATE NOCASE, item_id, sort_order, id);
