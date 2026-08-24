PRAGMA foreign_keys = ON;

-- Spellcraft, Talismanism, and Faith use the same canonical Sphere catalog.
-- The relationship is shared; Character allocations remain branch-specific
-- through campaign_character_skill_allocations.parent_allocation_id.
INSERT OR IGNORE INTO skill_relationships (
    skill_id,
    related_skill_id,
    relationship_type,
    sort_order
)
SELECT
    sphere.id,
    access_skill.id,
    'parent',
    existing_relationship.sort_order
FROM skills sphere
JOIN skill_relationships existing_relationship
  ON existing_relationship.skill_id = sphere.id
 AND existing_relationship.relationship_type = 'parent' COLLATE NOCASE
JOIN skills spellcraft
  ON spellcraft.id = existing_relationship.related_skill_id
 AND spellcraft.source_system = 'serrian-tide-core'
 AND spellcraft.name = 'Spellcraft' COLLATE NOCASE
JOIN skills access_skill
  ON access_skill.source_system = 'serrian-tide-core'
 AND access_skill.name IN ('Talismanism', 'Faith')
WHERE sphere.source_system = 'serrian-tide-core'
  AND sphere.classification = 'sphere' COLLATE NOCASE
  AND sphere.tier = 2;
