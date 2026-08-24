PRAGMA foreign_keys = ON;

ALTER TABLE campaign_character_profiles
    ADD COLUMN creation_completed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_character_profiles_creation_completed
    ON campaign_character_profiles (creation_completed_at, character_id);
