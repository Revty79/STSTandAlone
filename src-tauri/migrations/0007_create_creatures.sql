PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS challenge_rating_reference (
    challenge_rating INTEGER PRIMARY KEY CHECK (challenge_rating BETWEEN 1 AND 50),
    threat_band TEXT NOT NULL DEFAULT '',
    attack_target_guidance TEXT NOT NULL DEFAULT '',
    damage_guidance TEXT NOT NULL DEFAULT '',
    initiative_guidance TEXT NOT NULL DEFAULT '',
    soak_guidance TEXT NOT NULL DEFAULT '',
    hp_toughness_guidance TEXT NOT NULL DEFAULT '',
    kill_xp INTEGER,
    current_creature_example TEXT NOT NULL DEFAULT '',
    example_notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS creatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(canonical_id)) > 0),
    canonical_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(canonical_name)) > 0),
    family TEXT NOT NULL DEFAULT '',
    creature_type TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL CHECK (size IN ('Minuscule', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal')),
    challenge_rating INTEGER CHECK (challenge_rating IS NULL OR challenge_rating BETWEEN 1 AND 50),
    kill_xp INTEGER CHECK (kill_xp IS NULL OR kill_xp >= 0),
    description TEXT NOT NULL DEFAULT '',
    typical_behavior TEXT NOT NULL DEFAULT '',
    habitat_ecology TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER,
    source_system TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (challenge_rating) REFERENCES challenge_rating_reference (challenge_rating),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_creatures_library
    ON creatures (canonical_name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_creatures_family
    ON creatures (family COLLATE NOCASE, canonical_name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_creatures_type
    ON creatures (creature_type COLLATE NOCASE, canonical_name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_creatures_size
    ON creatures (size COLLATE NOCASE, canonical_name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_creatures_cr
    ON creatures (challenge_rating, canonical_name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS creature_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(canonical_id)) > 0),
    creature_id INTEGER NOT NULL,
    variant_name TEXT NOT NULL CHECK (length(trim(variant_name)) > 0),
    variant_type TEXT NOT NULL DEFAULT '',
    size_override TEXT CHECK (size_override IS NULL OR size_override IN ('Minuscule', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal')),
    challenge_rating_override INTEGER CHECK (challenge_rating_override IS NULL OR challenge_rating_override BETWEEN 1 AND 50),
    kill_xp_override INTEGER CHECK (kill_xp_override IS NULL OR kill_xp_override >= 0),
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (id, creature_id),
    UNIQUE (creature_id, variant_name COLLATE NOCASE),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (challenge_rating_override) REFERENCES challenge_rating_reference (challenge_rating)
);

CREATE INDEX IF NOT EXISTS idx_creature_variants_creature
    ON creature_variants (creature_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    attribute_key TEXT NOT NULL CHECK (attribute_key IN ('Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma')),
    value REAL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_attributes_base_unique
    ON creature_attributes (creature_id, attribute_key)
    WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_attributes_variant_unique
    ON creature_attributes (creature_id, variant_id, attribute_key)
    WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creature_attributes_creature
    ON creature_attributes (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_movement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    movement_mode TEXT NOT NULL CHECK (length(trim(movement_mode)) > 0),
    movement_value REAL,
    initiative REAL,
    requirements TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_movement_base_unique
    ON creature_movement (creature_id, movement_mode COLLATE NOCASE)
    WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_movement_variant_unique
    ON creature_movement (creature_id, variant_id, movement_mode COLLATE NOCASE)
    WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creature_movement_creature
    ON creature_movement (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_hp_pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(canonical_id)) > 0),
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    pool_name TEXT NOT NULL CHECK (length(trim(pool_name)) > 0),
    hp_percentage REAL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (id, creature_id, variant_id),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creature_hp_pools_creature
    ON creature_hp_pools (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_hit_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    hit_location_number INTEGER NOT NULL CHECK (hit_location_number BETWEEN 0 AND 9),
    location_name TEXT NOT NULL DEFAULT '',
    body_parts_included TEXT NOT NULL DEFAULT '',
    hp_pool_id INTEGER,
    natural_armor REAL,
    soak REAL,
    location_effect TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE,
    FOREIGN KEY (hp_pool_id) REFERENCES creature_hp_pools (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_hit_locations_base_unique
    ON creature_hit_locations (creature_id, hit_location_number)
    WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_hit_locations_variant_unique
    ON creature_hit_locations (creature_id, variant_id, hit_location_number)
    WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creature_hit_locations_creature
    ON creature_hit_locations (creature_id, variant_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_creature_hit_locations_pool
    ON creature_hit_locations (hp_pool_id, creature_id, id);

CREATE TABLE IF NOT EXISTS creature_attacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(canonical_id)) > 0),
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    attack_name TEXT NOT NULL CHECK (length(trim(attack_name)) > 0),
    attack_percentage REAL,
    damage TEXT,
    damage_type TEXT NOT NULL DEFAULT '',
    range_reach TEXT NOT NULL DEFAULT '',
    required_anatomy TEXT NOT NULL DEFAULT '',
    requirements TEXT NOT NULL DEFAULT '',
    uses_recharge TEXT NOT NULL DEFAULT '',
    special_effect TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creature_attacks_creature
    ON creature_attacks (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_skill_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    skill_id INTEGER NOT NULL,
    rank TEXT,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_skill_links_base_unique
    ON creature_skill_links (creature_id, skill_id)
    WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_creature_skill_links_variant_unique
    ON creature_skill_links (creature_id, variant_id, skill_id)
    WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creature_skill_links_creature
    ON creature_skill_links (creature_id, variant_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_creature_skill_links_skill
    ON creature_skill_links (skill_id, creature_id, id);

CREATE TABLE IF NOT EXISTS creature_abilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(canonical_id)) > 0),
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    ability_name TEXT NOT NULL CHECK (length(trim(ability_name)) > 0),
    ability_type TEXT NOT NULL DEFAULT '',
    activation TEXT NOT NULL DEFAULT '',
    requirements TEXT NOT NULL DEFAULT '',
    uses_recharge TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    mechanical_effect TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creature_abilities_creature
    ON creature_abilities (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_defenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_identity TEXT UNIQUE,
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    defense_type TEXT NOT NULL CHECK (length(trim(defense_type)) > 0),
    against TEXT NOT NULL DEFAULT '',
    value TEXT,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creature_defenses_creature
    ON creature_defenses (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_identity TEXT UNIQUE,
    creature_id INTEGER NOT NULL,
    variant_id INTEGER,
    use_name TEXT NOT NULL CHECK (length(trim(use_name)) > 0),
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, creature_id) REFERENCES creature_variants (id, creature_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creature_uses_creature
    ON creature_uses (creature_id, variant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS creature_ip_provenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creature_id INTEGER NOT NULL UNIQUE,
    canonical_name TEXT NOT NULL DEFAULT '',
    basis_category TEXT NOT NULL DEFAULT '',
    source_tradition TEXT NOT NULL DEFAULT '',
    copyright_ip_note TEXT NOT NULL DEFAULT '',
    review_status TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE CASCADE
);
