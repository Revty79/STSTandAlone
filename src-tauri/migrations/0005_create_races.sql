PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    legacy_description TEXT NOT NULL DEFAULT '',
    physical_characteristics TEXT NOT NULL DEFAULT '',
    physical_description TEXT NOT NULL DEFAULT '',
    age_range_text TEXT NOT NULL DEFAULT '',
    age_min INTEGER CHECK (age_min IS NULL OR age_min >= 0),
    age_max INTEGER CHECK (age_max IS NULL OR age_max >= 0),
    size TEXT NOT NULL DEFAULT '',
    base_magic REAL,
    racial_quirk_name TEXT NOT NULL DEFAULT '',
    quirk_success_effect TEXT NOT NULL DEFAULT '',
    quirk_failure_effect TEXT NOT NULL DEFAULT '',
    common_languages_known TEXT NOT NULL DEFAULT '',
    common_archetypes TEXT NOT NULL DEFAULT '',
    genre_examples TEXT NOT NULL DEFAULT '',
    cultural_mindset TEXT NOT NULL DEFAULT '',
    outlook_on_magic TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER,
    source_system TEXT,
    source_external_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (age_min IS NULL OR age_max IS NULL OR age_min <= age_max),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_races_name
    ON races (name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_races_size
    ON races (size COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_races_created_by_user
    ON races (created_by_user_id, name COLLATE NOCASE, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_races_source_identity
    ON races (source_system, source_external_id)
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS race_attribute_caps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    attribute_key TEXT NOT NULL CHECK (length(trim(attribute_key)) > 0),
    max_value REAL NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (race_id) REFERENCES races (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_race_attribute_caps_unique
    ON race_attribute_caps (race_id, attribute_key COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_race_attribute_caps_race
    ON race_attribute_caps (race_id, sort_order, id);

CREATE TABLE IF NOT EXISTS race_movement_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    movement_mode TEXT NOT NULL CHECK (length(trim(movement_mode)) > 0),
    base_value REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (race_id) REFERENCES races (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_race_movement_modes_race
    ON race_movement_modes (race_id, sort_order, id);

CREATE TABLE IF NOT EXISTS race_skill_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    link_type TEXT NOT NULL CHECK (length(trim(link_type)) > 0),
    value REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (race_id, skill_id, link_type),
    FOREIGN KEY (race_id) REFERENCES races (id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_race_skill_links_race
    ON race_skill_links (race_id, link_type, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_race_skill_links_skill
    ON race_skill_links (skill_id, link_type, race_id, id);
