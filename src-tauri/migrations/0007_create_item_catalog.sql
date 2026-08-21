PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    catalog_scope TEXT NOT NULL CHECK (length(trim(catalog_scope)) > 0),
    timeline_tag TEXT NOT NULL DEFAULT '',
    cost_credits REAL NOT NULL DEFAULT 0 CHECK (cost_credits >= 0),
    category TEXT NOT NULL DEFAULT '',
    subtype TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 0 CHECK (weight >= 0),
    effect_description TEXT NOT NULL DEFAULT '',
    narrative_variant_notes TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER,
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        (source_system IS NULL AND source_external_id IS NULL)
        OR (length(trim(source_system)) > 0 AND length(trim(source_external_id)) > 0)
    ),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_identity
    ON items (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_scope_name
    ON items (catalog_scope, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_scope_category
    ON items (catalog_scope, category COLLATE NOCASE, subtype COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS item_genre_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    genre_tag TEXT NOT NULL CHECK (length(trim(genre_tag)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (item_id, genre_tag COLLATE NOCASE),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_genre_tags_item
    ON item_genre_tags (item_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_item_genre_tags_filter
    ON item_genre_tags (genre_tag COLLATE NOCASE, item_id);

CREATE TABLE IF NOT EXISTS item_weapon_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE,
    weapon_role TEXT NOT NULL DEFAULT 'primary' CHECK (length(trim(weapon_role)) > 0),
    weapon_category TEXT NOT NULL DEFAULT '',
    handedness TEXT NOT NULL DEFAULT '',
    damage_type TEXT NOT NULL DEFAULT '',
    range_type TEXT NOT NULL DEFAULT '',
    range_text TEXT NOT NULL DEFAULT '',
    damage REAL NOT NULL DEFAULT 0 CHECK (damage >= 0),
    weapon_effect_description TEXT NOT NULL DEFAULT '',
    weapon_narrative_notes TEXT NOT NULL DEFAULT '',
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        (source_system IS NULL AND source_external_id IS NULL)
        OR (length(trim(source_system)) > 0 AND length(trim(source_external_id)) > 0)
    ),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_weapon_profiles_source_identity
    ON item_weapon_profiles (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_weapon_profiles_library
    ON item_weapon_profiles (weapon_role COLLATE NOCASE, weapon_category COLLATE NOCASE, item_id);
CREATE INDEX IF NOT EXISTS idx_item_weapon_profiles_damage_type
    ON item_weapon_profiles (damage_type COLLATE NOCASE, item_id);

CREATE TABLE IF NOT EXISTS item_armor_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE,
    area_covered TEXT NOT NULL DEFAULT '',
    soak REAL NOT NULL DEFAULT 0 CHECK (soak >= 0),
    armor_category TEXT NOT NULL DEFAULT '',
    armor_type TEXT NOT NULL DEFAULT '',
    encumbrance_penalty REAL NOT NULL DEFAULT 0,
    armor_effect_description TEXT NOT NULL DEFAULT '',
    armor_narrative_notes TEXT NOT NULL DEFAULT '',
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        (source_system IS NULL AND source_external_id IS NULL)
        OR (length(trim(source_system)) > 0 AND length(trim(source_external_id)) > 0)
    ),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_armor_profiles_source_identity
    ON item_armor_profiles (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_armor_profiles_library
    ON item_armor_profiles (armor_category COLLATE NOCASE, armor_type COLLATE NOCASE, item_id);
