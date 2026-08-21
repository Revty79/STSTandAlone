PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    catalog_section TEXT NOT NULL CHECK (length(trim(catalog_section)) > 0),
    timeline_tag TEXT NOT NULL DEFAULT '',
    cost_credits REAL,
    category TEXT NOT NULL DEFAULT '',
    subtype TEXT NOT NULL DEFAULT '',
    weight REAL,
    effect_description TEXT NOT NULL DEFAULT '',
    narrative_variant_notes TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER,
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_items_name
    ON items (name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_catalog_section
    ON items (catalog_section COLLATE NOCASE, category COLLATE NOCASE, subtype COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_created_by_user
    ON items (created_by_user_id, name COLLATE NOCASE, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_identity
    ON items (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS item_genre_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    genre_tag TEXT NOT NULL CHECK (length(trim(genre_tag)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (item_id, genre_tag),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_genre_tags_lookup
    ON item_genre_tags (genre_tag COLLATE NOCASE, item_id, sort_order, id);

CREATE TABLE IF NOT EXISTS item_weapon_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE,
    weapon_role TEXT NOT NULL DEFAULT '',
    weapon_category TEXT NOT NULL DEFAULT '',
    handedness TEXT NOT NULL DEFAULT '',
    damage_type TEXT NOT NULL DEFAULT '',
    range_type TEXT NOT NULL DEFAULT '',
    range_text TEXT NOT NULL DEFAULT '',
    damage REAL,
    weapon_effect_description TEXT NOT NULL DEFAULT '',
    weapon_narrative_notes TEXT NOT NULL DEFAULT '',
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_weapon_profiles_role
    ON item_weapon_profiles (weapon_role COLLATE NOCASE, weapon_category COLLATE NOCASE, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_weapon_profiles_source_identity
    ON item_weapon_profiles (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS item_armor_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE,
    area_covered TEXT NOT NULL DEFAULT '',
    soak REAL,
    armor_category TEXT NOT NULL DEFAULT '',
    armor_type TEXT NOT NULL DEFAULT '',
    encumbrance_penalty REAL,
    armor_effect_description TEXT NOT NULL DEFAULT '',
    armor_narrative_notes TEXT NOT NULL DEFAULT '',
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_armor_profiles_category
    ON item_armor_profiles (armor_category COLLATE NOCASE, armor_type COLLATE NOCASE, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_armor_profiles_source_identity
    ON item_armor_profiles (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS item_creature_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    creature_id INTEGER NOT NULL,
    relationship TEXT NOT NULL CHECK (length(trim(relationship)) > 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (item_id, creature_id, relationship),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_item_creature_links_item
    ON item_creature_links (item_id, relationship, creature_id, id);
CREATE INDEX IF NOT EXISTS idx_item_creature_links_creature
    ON item_creature_links (creature_id, relationship, item_id, id);
