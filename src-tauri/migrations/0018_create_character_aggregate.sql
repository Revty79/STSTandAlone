PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaign_character_profiles (
    character_id INTEGER PRIMARY KEY,
    race_id INTEGER,
    age INTEGER CHECK (age IS NULL OR age >= 0),
    sex TEXT NOT NULL DEFAULT '',
    height REAL CHECK (height IS NULL OR height >= 0),
    weight REAL CHECK (weight IS NULL OR weight >= 0),
    skin_color TEXT NOT NULL DEFAULT '',
    eye_color TEXT NOT NULL DEFAULT '',
    hair_color TEXT NOT NULL DEFAULT '',
    deity TEXT NOT NULL DEFAULT '',
    defining_marks TEXT NOT NULL DEFAULT '',
    personality TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    secrets TEXT NOT NULL DEFAULT '',
    backstory TEXT NOT NULL DEFAULT '',
    motivations TEXT NOT NULL DEFAULT '',
    fame REAL NOT NULL DEFAULT 0,
    experience REAL NOT NULL DEFAULT 0,
    total_experience REAL NOT NULL DEFAULT 0,
    quintessence REAL NOT NULL DEFAULT 0,
    total_quintessence REAL NOT NULL DEFAULT 0,
    credits_remaining REAL NOT NULL DEFAULT 0 CHECK (credits_remaining >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE,
    FOREIGN KEY (race_id) REFERENCES races (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_character_profiles_race
    ON campaign_character_profiles (race_id, character_id);

CREATE TABLE IF NOT EXISTS campaign_character_attributes (
    character_id INTEGER NOT NULL,
    attribute_key TEXT NOT NULL
        CHECK (attribute_key IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR')),
    value REAL NOT NULL DEFAULT 25 CHECK (value >= 0),
    PRIMARY KEY (character_id, attribute_key),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_character_skill_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    parent_allocation_id INTEGER,
    points REAL NOT NULL CHECK (points > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (id, character_id),
    UNIQUE (character_id, skill_id, parent_allocation_id),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE RESTRICT,
    FOREIGN KEY (parent_allocation_id, character_id)
        REFERENCES campaign_character_skill_allocations (id, character_id)
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_skill_root
    ON campaign_character_skill_allocations (character_id, skill_id)
    WHERE parent_allocation_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_character_skill_parent
    ON campaign_character_skill_allocations (character_id, parent_allocation_id, skill_id);
CREATE INDEX IF NOT EXISTS idx_character_skill_catalog
    ON campaign_character_skill_allocations (skill_id, character_id);

CREATE TABLE IF NOT EXISTS campaign_character_items (
    character_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost_credits REAL NOT NULL CHECK (unit_cost_credits >= 0),
    acquired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (character_id, item_id),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_character_items_catalog
    ON campaign_character_items (item_id, character_id);

-- Existing lightweight Characters become complete editable drafts.
INSERT OR IGNORE INTO campaign_character_profiles (
    character_id,
    credits_remaining
)
SELECT character.id, campaign.starting_credit_amount
FROM campaign_characters character
JOIN campaigns campaign ON campaign.id = character.campaign_id;

INSERT OR IGNORE INTO campaign_character_attributes (character_id, attribute_key, value)
SELECT character.id, attribute.attribute_key, 25
FROM campaign_characters character
CROSS JOIN (
    SELECT 'STR' AS attribute_key
    UNION ALL SELECT 'DEX'
    UNION ALL SELECT 'CON'
    UNION ALL SELECT 'INT'
    UNION ALL SELECT 'WIS'
    UNION ALL SELECT 'CHR'
) attribute;
