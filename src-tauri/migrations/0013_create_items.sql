PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (length(trim(canonical_id)) > 0),
    name TEXT NOT NULL COLLATE NOCASE
        CHECK (length(trim(name)) > 0),
    catalog_scope TEXT NOT NULL
        CHECK (catalog_scope IN ('equipment', 'inventory')),
    equipment_group TEXT
        CHECK (equipment_group IS NULL OR equipment_group IN ('weapon', 'armor', 'general')),
    record_type TEXT NOT NULL CHECK (length(trim(record_type)) > 0),
    family TEXT NOT NULL CHECK (length(trim(family)) > 0),
    category TEXT NOT NULL CHECK (length(trim(category)) > 0),
    subtype TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    weight REAL CHECK (weight IS NULL OR weight >= 0),
    weight_unit TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    durability REAL CHECK (durability IS NULL OR durability >= 0),
    credits REAL CHECK (credits IS NULL OR credits >= 0),
    price_basis TEXT NOT NULL CHECK (length(trim(price_basis)) > 0),
    parent_item_id INTEGER,
    created_by_user_id INTEGER,
    source_system TEXT,
    source_external_id TEXT COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        (catalog_scope = 'inventory' AND equipment_group IS NULL)
        OR
        (catalog_scope = 'equipment' AND equipment_group IN ('weapon', 'armor', 'general'))
    ),
    CHECK (
        (weight IS NULL AND length(trim(weight_unit)) = 0)
        OR
        (weight IS NOT NULL AND length(trim(weight_unit)) > 0)
    ),
    CHECK (parent_item_id IS NULL OR parent_item_id <> id),
    FOREIGN KEY (parent_item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_items_library
    ON items (catalog_scope, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_equipment_group
    ON items (catalog_scope, equipment_group, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_record_type
    ON items (catalog_scope, record_type COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_family
    ON items (family COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_category
    ON items (catalog_scope, category COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_size
    ON items (size COLLATE NOCASE, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_items_source
    ON items (source_system, source_external_id);
CREATE INDEX IF NOT EXISTS idx_items_parent
    ON items (parent_item_id, name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS weapon_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE,
    profile_record_type TEXT NOT NULL DEFAULT '',
    weapon_type TEXT NOT NULL DEFAULT '',
    handedness TEXT NOT NULL DEFAULT '',
    damage_source TEXT NOT NULL DEFAULT '',
    damage TEXT NOT NULL DEFAULT '',
    damage_type TEXT NOT NULL DEFAULT '',
    range_text TEXT NOT NULL DEFAULT '',
    reach_text TEXT NOT NULL DEFAULT '',
    ammunition_item_id INTEGER,
    compatibility TEXT NOT NULL DEFAULT '',
    capacity TEXT NOT NULL DEFAULT '',
    fire_modes TEXT NOT NULL DEFAULT '[]',
    rate_of_fire TEXT NOT NULL DEFAULT '',
    reload_initiative TEXT NOT NULL DEFAULT '',
    rules_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (json_valid(fire_modes) AND json_type(fire_modes) = 'array'),
    CHECK (ammunition_item_id IS NULL OR ammunition_item_id <> item_id),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
    FOREIGN KEY (ammunition_item_id) REFERENCES items (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_weapon_profiles_type
    ON weapon_profiles (weapon_type COLLATE NOCASE, item_id);
CREATE INDEX IF NOT EXISTS idx_weapon_profiles_damage_type
    ON weapon_profiles (damage_type COLLATE NOCASE, item_id);
CREATE INDEX IF NOT EXISTS idx_weapon_profiles_ammunition
    ON weapon_profiles (ammunition_item_id, item_id);

CREATE TABLE IF NOT EXISTS armor_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL UNIQUE,
    armor_type TEXT NOT NULL DEFAULT '',
    coverage TEXT NOT NULL DEFAULT '',
    base_soak REAL CHECK (base_soak IS NULL OR base_soak >= 0),
    damage_modifiers_source_text TEXT NOT NULL DEFAULT '',
    rules_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_armor_profiles_type
    ON armor_profiles (armor_type COLLATE NOCASE, item_id);

CREATE TABLE IF NOT EXISTS item_armor_damage_modifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    modifier_text TEXT NOT NULL DEFAULT '',
    damage_type TEXT NOT NULL CHECK (length(trim(damage_type)) > 0),
    modifier TEXT NOT NULL CHECK (length(trim(modifier)) > 0),
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (item_id, sort_order),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_armor_modifiers_item
    ON item_armor_damage_modifiers (item_id, sort_order, id);

CREATE TABLE IF NOT EXISTS armor_location_reference (
    location_code TEXT PRIMARY KEY COLLATE NOCASE,
    location_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    sort_order INTEGER NOT NULL UNIQUE,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS armor_locations (
    item_id INTEGER NOT NULL,
    location_code TEXT NOT NULL COLLATE NOCASE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, location_code),
    UNIQUE (item_id, sort_order),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
    FOREIGN KEY (location_code) REFERENCES armor_location_reference (location_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_armor_locations_location
    ON armor_locations (location_code, item_id);

CREATE TABLE IF NOT EXISTS item_properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    property_name TEXT NOT NULL CHECK (length(trim(property_name)) > 0),
    value TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    related_item_id INTEGER,
    related_creature_canonical_id TEXT COLLATE NOCASE,
    quantity REAL CHECK (quantity IS NULL OR quantity > 0),
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (related_item_id IS NULL OR related_creature_canonical_id IS NULL),
    UNIQUE (item_id, sort_order),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
    FOREIGN KEY (related_item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (related_creature_canonical_id) REFERENCES creatures (canonical_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_item_properties_item
    ON item_properties (item_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_item_properties_name
    ON item_properties (property_name COLLATE NOCASE, item_id);
CREATE INDEX IF NOT EXISTS idx_item_properties_related_item
    ON item_properties (related_item_id, item_id);
CREATE INDEX IF NOT EXISTS idx_item_properties_related_creature
    ON item_properties (related_creature_canonical_id, item_id);

CREATE TABLE IF NOT EXISTS item_tags_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_id TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (length(trim(canonical_id)) > 0),
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (length(trim(name)) > 0),
    tag_group TEXT NOT NULL CHECK (length(trim(tag_group)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_catalog_group
    ON item_tags_catalog (tag_group COLLATE NOCASE, name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS item_tag_links (
    item_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES item_tags_catalog (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_item_tag_links_tag
    ON item_tag_links (tag_id, item_id);

CREATE TABLE IF NOT EXISTS item_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (length(trim(rule_id)) > 0),
    rule_name TEXT NOT NULL CHECK (length(trim(rule_name)) > 0),
    rule_text TEXT NOT NULL CHECK (length(trim(rule_text)) > 0),
    implementation_guidance TEXT NOT NULL CHECK (length(trim(implementation_guidance)) > 0),
    status TEXT NOT NULL CHECK (length(trim(status)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_item_rules_status
    ON item_rules (status COLLATE NOCASE, rule_id);
