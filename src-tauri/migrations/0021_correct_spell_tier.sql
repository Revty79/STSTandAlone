PRAGMA foreign_keys = ON;

-- This canonical Spell was seeded without its Tier even though it is a child
-- of the Tier 2 Death Sphere. Preserve user-authored Skills and correct only
-- the stable Serrian Tide source identity.
UPDATE skills
SET tier = 3,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE source_system = 'serrian-tide-core'
  AND source_external_id = 'skill-386c592f2009be1807e6645fb730ea2f21c4b607fa0b9e21473bec9603863ca7'
  AND classification = 'spell' COLLATE NOCASE
  AND tier IS NULL;
