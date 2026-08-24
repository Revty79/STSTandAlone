PRAGMA foreign_keys = ON;

ALTER TABLE campaign_character_profiles
    ADD COLUMN height_feet INTEGER;

ALTER TABLE campaign_character_profiles
    ADD COLUMN height_inches INTEGER;

-- The former unlabelled height value has no trustworthy unit, so existing
-- drafts intentionally require feet and inches to be entered explicitly.
