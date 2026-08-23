PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE
        CHECK (length(trim(name)) > 0),
    attribute_points REAL NOT NULL CHECK (attribute_points >= 0),
    skill_points REAL NOT NULL CHECK (skill_points >= 0),
    max_starting_skill REAL NOT NULL CHECK (max_starting_skill >= 0),
    points_to_unlock_next_tier REAL NOT NULL CHECK (points_to_unlock_next_tier >= 0),
    max_points_in_skill REAL NOT NULL CHECK (max_points_in_skill >= 0),
    starting_credit_amount REAL NOT NULL CHECK (starting_credit_amount >= 0),
    currency_system TEXT NOT NULL
        CHECK (currency_system IN ('Credits', 'Derived Currency')),
    created_by_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_campaigns_owner
    ON campaigns (created_by_user_id, name COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS idx_campaigns_library
    ON campaigns (name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS campaign_derived_currencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE
        CHECK (length(trim(name)) > 0),
    description TEXT NOT NULL
        CHECK (length(trim(description)) > 0),
    credits_per_unit REAL NOT NULL CHECK (credits_per_unit > 0),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_currencies_campaign
    ON campaign_derived_currencies (campaign_id, sort_order, id);

CREATE TABLE IF NOT EXISTS campaign_allowed_systems (
    campaign_id INTEGER NOT NULL,
    system_name TEXT NOT NULL
        CHECK (system_name IN (
            'Tier 1', 'Tier 2', 'Tier 3', 'Spellcraft', 'Talismanism',
            'Faith', 'Psyonics', 'Special Abilities', 'Bardic Resonance'
        )),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (campaign_id, system_name),
    UNIQUE (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_allowed_races (
    campaign_id INTEGER NOT NULL,
    race_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (campaign_id, race_id),
    UNIQUE (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
    FOREIGN KEY (race_id) REFERENCES races (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_campaign_allowed_races_race
    ON campaign_allowed_races (race_id, campaign_id);

CREATE TABLE IF NOT EXISTS campaign_inventory_tags (
    campaign_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (campaign_id, tag_id),
    UNIQUE (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES item_tags_catalog (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_campaign_inventory_tags_tag
    ON campaign_inventory_tags (tag_id, campaign_id);

CREATE TABLE IF NOT EXISTS campaign_inventory_items (
    campaign_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (campaign_id, item_id),
    UNIQUE (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_campaign_inventory_items_item
    ON campaign_inventory_items (item_id, campaign_id);
