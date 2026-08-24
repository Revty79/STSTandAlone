-- Characters completed before the full readiness rule existed must remain
-- editable until Identity, Story, point budgets, and starting Equipment are done.
UPDATE campaign_character_profiles AS profile
SET creation_completed_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE profile.creation_completed_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM campaign_characters character
    JOIN campaigns campaign ON campaign.id = character.campaign_id
    WHERE character.id = profile.character_id
      AND (
        length(trim(character.name)) = 0
        OR lower(trim(character.name)) = 'new character'
        OR profile.race_id IS NULL
        OR profile.age IS NULL
        OR profile.age < 0
        OR length(trim(profile.sex)) = 0
        OR COALESCE(profile.height_feet, 0) * 12 + COALESCE(profile.height_inches, 0) <= 0
        OR profile.weight IS NULL
        OR profile.weight <= 0
        OR length(trim(profile.skin_color)) = 0
        OR length(trim(profile.eye_color)) = 0
        OR length(trim(profile.hair_color)) = 0
        OR length(trim(profile.deity)) = 0
        OR length(trim(profile.defining_marks)) = 0
        OR length(trim(profile.personality)) = 0
        OR length(trim(profile.goals)) = 0
        OR length(trim(profile.secrets)) = 0
        OR length(trim(profile.backstory)) = 0
        OR length(trim(profile.motivations)) = 0
        OR abs(COALESCE((
          SELECT SUM(attribute.value)
          FROM campaign_character_attributes attribute
          WHERE attribute.character_id = character.id
        ), 0) - campaign.attribute_points) > 0.000001
        OR abs(COALESCE((
          SELECT SUM(skill.points)
          FROM campaign_character_skill_allocations skill
          WHERE skill.character_id = character.id
        ), 0) - campaign.skill_points) > 0.000001
        OR NOT EXISTS (
          SELECT 1
          FROM campaign_character_items owned
          JOIN items item ON item.id = owned.item_id
          WHERE owned.character_id = character.id
            AND item.catalog_scope = 'equipment' COLLATE NOCASE
            AND owned.quantity > 0
        )
      )
  );
