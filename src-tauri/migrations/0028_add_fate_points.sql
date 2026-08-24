PRAGMA foreign_keys = ON;

ALTER TABLE campaigns
ADD COLUMN fate_point_method TEXT NOT NULL DEFAULT 'Assigned'
    CHECK (fate_point_method IN ('Assigned', 'Rolled'));

ALTER TABLE campaigns
ADD COLUMN assigned_fate_points INTEGER DEFAULT 0
    CHECK (assigned_fate_points IS NULL OR assigned_fate_points >= 0);

ALTER TABLE campaign_character_profiles
ADD COLUMN fate_points INTEGER
    CHECK (fate_points IS NULL OR fate_points >= 0);

UPDATE campaign_character_profiles
SET fate_points = 0
WHERE fate_points IS NULL;
