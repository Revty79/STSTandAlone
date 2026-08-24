PRAGMA foreign_keys = ON;

ALTER TABLE campaign_players
ADD COLUMN is_npc_controller INTEGER NOT NULL DEFAULT 0
    CHECK (is_npc_controller IN (0, 1));

ALTER TABLE campaign_characters
ADD COLUMN is_npc INTEGER NOT NULL DEFAULT 0
    CHECK (is_npc IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_campaign_characters_npcs
ON campaign_characters (campaign_id, is_npc, name COLLATE NOCASE, id);
