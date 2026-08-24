PRAGMA foreign_keys = OFF;

-- A zero-point row is a structural parent anchor only. It lets a free racial
-- bonus unlock and own a descendant without copying the Race's bonus value
-- into the Character record. Purchased points remain stored in `points`.
CREATE TABLE campaign_character_skill_allocations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    parent_allocation_id INTEGER,
    points REAL NOT NULL CHECK (points >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (id, character_id),
    UNIQUE (character_id, skill_id, parent_allocation_id),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE RESTRICT,
    FOREIGN KEY (parent_allocation_id, character_id)
        REFERENCES campaign_character_skill_allocations_new (id, character_id)
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

INSERT INTO campaign_character_skill_allocations_new (
    id, character_id, skill_id, parent_allocation_id, points, created_at, updated_at
)
SELECT id, character_id, skill_id, parent_allocation_id, points, created_at, updated_at
FROM campaign_character_skill_allocations;

DROP TABLE campaign_character_skill_allocations;
ALTER TABLE campaign_character_skill_allocations_new
    RENAME TO campaign_character_skill_allocations;

CREATE UNIQUE INDEX idx_character_skill_root
    ON campaign_character_skill_allocations (character_id, skill_id)
    WHERE parent_allocation_id IS NULL;
CREATE INDEX idx_character_skill_parent
    ON campaign_character_skill_allocations (character_id, parent_allocation_id, skill_id);
CREATE INDEX idx_character_skill_catalog
    ON campaign_character_skill_allocations (skill_id, character_id);

PRAGMA foreign_keys = ON;
