PRAGMA foreign_keys = ON;

ALTER TABLE campaign_characters
ADD COLUMN npc_kind TEXT NOT NULL DEFAULT 'race'
    CHECK (npc_kind IN ('race', 'creature'));

CREATE INDEX IF NOT EXISTS idx_campaign_characters_npc_kind
ON campaign_characters (campaign_id, is_npc, npc_kind, name COLLATE NOCASE, id);

CREATE TABLE IF NOT EXISTS campaign_creature_npc_profiles (
    character_id INTEGER PRIMARY KEY,
    creature_id INTEGER NOT NULL,
    personality TEXT NOT NULL DEFAULT '',
    instance_notes TEXT NOT NULL DEFAULT '',
    hp_adjustment REAL NOT NULL DEFAULT 0,
    baseline_snapshot_json TEXT NOT NULL CHECK (json_valid(baseline_snapshot_json)),
    current_snapshot_json TEXT NOT NULL CHECK (json_valid(current_snapshot_json)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (character_id) REFERENCES campaign_characters (id) ON DELETE CASCADE,
    FOREIGN KEY (creature_id) REFERENCES creatures (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_campaign_creature_npcs_template
ON campaign_creature_npc_profiles (creature_id, character_id);
