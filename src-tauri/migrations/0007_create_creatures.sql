PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS creatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    challenge_rating REAL,
    encounter_scale TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    description_short TEXT NOT NULL DEFAULT '',
    hp_total REAL,
    initiative REAL,
    armor_soak REAL,
    magic_resonance_interaction TEXT NOT NULL DEFAULT '',
    behavior_tactics TEXT NOT NULL DEFAULT '',
    habitat TEXT NOT NULL DEFAULT '',
    diet TEXT NOT NULL DEFAULT '',
    loot_harvest TEXT NOT NULL DEFAULT '',
    story_hooks TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER,
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_creatures_name
    ON creatures (name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_creatures_filters
    ON creatures (type COLLATE NOCASE, role COLLATE NOCASE, size COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_creatures_created_by_user
    ON creatures (created_by_user_id, name COLLATE NOCASE, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creatures_source_identity
    ON creatures (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS creature_alt_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    alt_name TEXT NOT NULL CHECK (length(trim(alt_name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_alt_names_unique
    ON creature_alt_names (creature_id, alt_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_creature_alt_names_creature
    ON creature_alt_names (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_genre_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    genre_tag TEXT NOT NULL CHECK (length(trim(genre_tag)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_genre_tags_unique
    ON creature_genre_tags (creature_id, genre_tag COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_creature_genre_tags_lookup
    ON creature_genre_tags (genre_tag COLLATE NOCASE, creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    attribute_key TEXT NOT NULL CHECK (length(trim(attribute_key)) > 0),
    value REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_attributes_unique
    ON creature_attributes (creature_id, attribute_key COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_creature_attributes_creature
    ON creature_attributes (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_movement_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    movement_mode TEXT NOT NULL CHECK (length(trim(movement_mode)) > 0),
    base_value REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creature_movement_modes_creature
    ON creature_movement_modes (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_hp_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    location_name TEXT NOT NULL CHECK (length(trim(location_name)) > 0),
    hp_value REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creature_hp_locations_creature
    ON creature_hp_locations (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_attacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    damage REAL,
    range_text TEXT NOT NULL DEFAULT '',
    effect TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creature_attacks_creature
    ON creature_attacks (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_skill_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    link_type TEXT NOT NULL CHECK (length(trim(link_type)) > 0),
    value REAL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (creature_id, skill_id, link_type),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creature_skill_links_creature
    ON creature_skill_links (creature_id, link_type, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_creature_skill_links_skill
    ON creature_skill_links (skill_id, link_type, creature_id, id);

CREATE TABLE IF NOT EXISTS creature_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    use_type TEXT NOT NULL CHECK (length(trim(use_type)) > 0),
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_uses_unique
    ON creature_uses (creature_id, use_type COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_creature_uses_creature
    ON creature_uses (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creature_variants_creature
    ON creature_variants (creature_id, sort_order, id);
