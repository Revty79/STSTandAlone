PRAGMA foreign_keys = ON;

-- Variants are complete Creatures. The parent link records lineage while every
-- derived Creature owns an independent, editable aggregate.
ALTER TABLE creatures ADD COLUMN parent_creature_id INTEGER
    REFERENCES creatures (id) ON DELETE RESTRICT;
ALTER TABLE creatures ADD COLUMN calculated_challenge_rating INTEGER
    CHECK (calculated_challenge_rating BETWEEN 1 AND 50);
ALTER TABLE creatures ADD COLUMN challenge_rating_adjustment INTEGER NOT NULL DEFAULT 0
    CHECK (challenge_rating_adjustment BETWEEN -49 AND 49);
ALTER TABLE creatures ADD COLUMN challenge_rating_adjustment_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE creature_abilities ADD COLUMN cr_impact TEXT NOT NULL DEFAULT 'None'
    CHECK (cr_impact IN ('None', 'Minor', 'Moderate', 'Major', 'Extreme'));
ALTER TABLE creature_defenses ADD COLUMN cr_impact TEXT NOT NULL DEFAULT 'None'
    CHECK (cr_impact IN ('None', 'Minor', 'Moderate', 'Major', 'Extreme'));

CREATE INDEX IF NOT EXISTS idx_creatures_parent
    ON creatures (parent_creature_id, canonical_name COLLATE NOCASE, id);

-- Existing authored CR values become the initial calculated baseline. Kill XP
-- is canonical for the final CR and is never independently authored.
UPDATE creatures
SET calculated_challenge_rating = COALESCE(challenge_rating, 1),
    challenge_rating = COALESCE(challenge_rating, 1),
    kill_xp = COALESCE(
        (SELECT reference.kill_xp
         FROM challenge_rating_reference reference
         WHERE reference.challenge_rating = COALESCE(creatures.challenge_rating, 1)),
        1
    );

-- Convert every legacy sparse Variant into a complete derived Creature before
-- retiring its override rows. This keeps its stable canonical Variant ID while
-- giving it an independent Creature identity and aggregate.
INSERT OR IGNORE INTO creatures (
    canonical_id, canonical_name, family, creature_type, size,
    challenge_rating, kill_xp, description, typical_behavior,
    habitat_ecology, notes, created_by_user_id, source_system,
    parent_creature_id, calculated_challenge_rating,
    challenge_rating_adjustment, challenge_rating_adjustment_reason
)
SELECT
    variant.canonical_id,
    variant.variant_name,
    parent.family,
    parent.creature_type,
    COALESCE(variant.size_override, parent.size),
    COALESCE(variant.challenge_rating_override, parent.challenge_rating, 1),
    COALESCE(
        (SELECT reference.kill_xp
         FROM challenge_rating_reference reference
         WHERE reference.challenge_rating = COALESCE(variant.challenge_rating_override, parent.challenge_rating, 1)),
        1
    ),
    CASE WHEN length(trim(variant.description)) > 0 THEN variant.description ELSE parent.description END,
    parent.typical_behavior,
    parent.habitat_ecology,
    variant.notes,
    parent.created_by_user_id,
    parent.source_system,
    parent.id,
    COALESCE(variant.challenge_rating_override, parent.challenge_rating, 1),
    0,
    ''
FROM creature_variants variant
JOIN creatures parent ON parent.id = variant.creature_id;

-- Scalar collections use a Variant-specific row when one exists and otherwise
-- copy the corresponding base row.
INSERT INTO creature_attributes (
    creature_id, variant_id, attribute_key, value, notes, sort_order
)
SELECT derived.id, NULL, source.attribute_key, source.value, source.notes, source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_attributes source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id)
WHERE source.variant_id = variant.id
   OR NOT EXISTS (
       SELECT 1 FROM creature_attributes override
       WHERE override.variant_id = variant.id
         AND override.attribute_key = source.attribute_key
   );

INSERT INTO creature_movement (
    creature_id, variant_id, movement_mode, movement_value, initiative,
    requirements, notes, sort_order
)
SELECT derived.id, NULL, source.movement_mode, source.movement_value, source.initiative,
       source.requirements, source.notes, source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_movement source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id)
WHERE source.variant_id = variant.id
   OR NOT EXISTS (
       SELECT 1 FROM creature_movement override
       WHERE override.variant_id = variant.id
         AND override.movement_mode = source.movement_mode COLLATE NOCASE
   );

-- A Variant-specific anatomy chart replaces the base chart. Otherwise the
-- complete base chart is copied. Generated child IDs remain stable and unique.
INSERT INTO creature_hp_pools (
    canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order
)
SELECT
    'HP-' || replace(variant.canonical_id, 'VAR-', '') || '-' || printf('%04d', source.id),
    derived.id, NULL, source.pool_name, source.hp_percentage, source.notes, source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_hp_pools source
  ON source.creature_id = variant.creature_id
 AND (
      (EXISTS (SELECT 1 FROM creature_hp_pools own WHERE own.variant_id = variant.id)
       AND source.variant_id = variant.id)
      OR
      (NOT EXISTS (SELECT 1 FROM creature_hp_pools own WHERE own.variant_id = variant.id)
       AND source.variant_id IS NULL)
 );

INSERT INTO creature_hit_locations (
    creature_id, variant_id, hit_location_number, location_name,
    body_parts_included, hp_pool_id, natural_armor, soak,
    location_effect, notes, sort_order
)
SELECT
    derived.id,
    NULL,
    source.hit_location_number,
    source.location_name,
    source.body_parts_included,
    CASE WHEN source.hp_pool_id IS NULL THEN NULL ELSE (
        SELECT copied_pool.id
        FROM creature_hp_pools copied_pool
        WHERE copied_pool.creature_id = derived.id
          AND copied_pool.canonical_id =
              'HP-' || replace(variant.canonical_id, 'VAR-', '') || '-' || printf('%04d', source.hp_pool_id)
        LIMIT 1
    ) END,
    source.natural_armor,
    source.soak,
    source.location_effect,
    source.notes,
    source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_hit_locations source
  ON source.creature_id = variant.creature_id
 AND (
      (EXISTS (SELECT 1 FROM creature_hit_locations own WHERE own.variant_id = variant.id)
       AND source.variant_id = variant.id)
      OR
      (NOT EXISTS (SELECT 1 FROM creature_hit_locations own WHERE own.variant_id = variant.id)
       AND source.variant_id IS NULL)
 );

-- Additive collections inherit the base rows and retain Variant-specific rows.
INSERT INTO creature_attacks (
    canonical_id, creature_id, variant_id, attack_name, attack_percentage,
    damage, damage_type, range_reach, required_anatomy, requirements,
    uses_recharge, special_effect, notes, sort_order
)
SELECT
    'ATK-' || replace(variant.canonical_id, 'VAR-', '') || '-' || printf('%04d', source.id),
    derived.id, NULL, source.attack_name, source.attack_percentage,
    source.damage, source.damage_type, source.range_reach, source.required_anatomy,
    source.requirements, source.uses_recharge, source.special_effect,
    source.notes, source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_attacks source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id);

INSERT INTO creature_skill_links (
    creature_id, variant_id, skill_id, rank, notes, sort_order
)
SELECT derived.id, NULL, source.skill_id, source.rank, source.notes, source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_skill_links source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id)
WHERE source.variant_id = variant.id
   OR NOT EXISTS (
       SELECT 1 FROM creature_skill_links override
       WHERE override.variant_id = variant.id
         AND override.skill_id = source.skill_id
   );

INSERT INTO creature_abilities (
    canonical_id, creature_id, variant_id, ability_name, ability_type,
    activation, requirements, uses_recharge, description,
    mechanical_effect, notes, sort_order, cr_impact
)
SELECT
    'ABL-' || replace(variant.canonical_id, 'VAR-', '') || '-' || printf('%04d', source.id),
    derived.id, NULL, source.ability_name, source.ability_type,
    source.activation, source.requirements, source.uses_recharge,
    source.description, source.mechanical_effect, source.notes,
    source.sort_order, source.cr_impact
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_abilities source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id);

INSERT INTO creature_defenses (
    seed_identity, creature_id, variant_id, defense_type, against,
    value, notes, sort_order, cr_impact
)
SELECT NULL, derived.id, NULL, source.defense_type, source.against,
       source.value, source.notes, source.sort_order, source.cr_impact
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_defenses source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id);

INSERT INTO creature_uses (
    seed_identity, creature_id, variant_id, use_name, notes, sort_order
)
SELECT NULL, derived.id, NULL, source.use_name, source.notes, source.sort_order
FROM creature_variants variant
JOIN creatures derived ON derived.canonical_id = variant.canonical_id COLLATE NOCASE
JOIN creature_uses source
  ON source.creature_id = variant.creature_id
 AND (source.variant_id IS NULL OR source.variant_id = variant.id);

-- The old override shells are now redundant. Remove their child rows in an
-- order that respects HP Pool references, then remove the shells themselves.
DELETE FROM creature_hit_locations WHERE variant_id IS NOT NULL;
DELETE FROM creature_skill_links WHERE variant_id IS NOT NULL;
DELETE FROM creature_attributes WHERE variant_id IS NOT NULL;
DELETE FROM creature_movement WHERE variant_id IS NOT NULL;
DELETE FROM creature_attacks WHERE variant_id IS NOT NULL;
DELETE FROM creature_abilities WHERE variant_id IS NOT NULL;
DELETE FROM creature_defenses WHERE variant_id IS NOT NULL;
DELETE FROM creature_uses WHERE variant_id IS NOT NULL;
DELETE FROM creature_hp_pools WHERE variant_id IS NOT NULL;
DELETE FROM creature_variants;

