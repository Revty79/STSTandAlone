use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";
const SIZE_SCALE_JSON: &str = include_str!("../../src/data/sizeScale.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCreatureAggregateInput {
    id: Option<i64>,
    core: CreatureCoreInput,
    attributes: Vec<CreatureAttributeInput>,
    movement: Vec<CreatureMovementInput>,
    hp_pools: Vec<CreatureHpPoolInput>,
    hit_locations: Vec<CreatureHitLocationInput>,
    attacks: Vec<CreatureAttackInput>,
    skill_links: Vec<CreatureSkillLinkInput>,
    abilities: Vec<CreatureAbilityInput>,
    defenses: Vec<CreatureDefenseInput>,
    uses: Vec<CreatureUseInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureCoreInput {
    canonical_id: String,
    canonical_name: String,
    family: String,
    creature_type: String,
    size: String,
    challenge_rating: Option<i64>,
    kill_xp: Option<i64>,
    parent_creature_id: Option<i64>,
    calculated_challenge_rating: Option<i64>,
    challenge_rating_adjustment: i64,
    challenge_rating_adjustment_reason: String,
    description: String,
    typical_behavior: String,
    habitat_ecology: String,
    notes: String,
    created_by_user_id: Option<i64>,
    source_system: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureAttributeInput {
    attribute_key: String,
    value: Option<f64>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureMovementInput {
    movement_mode: String,
    movement_value: Option<f64>,
    initiative: Option<f64>,
    requirements: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureHpPoolInput {
    canonical_id: String,
    pool_name: String,
    hp_percentage: Option<f64>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureHitLocationInput {
    hit_location_number: i64,
    location_name: String,
    body_parts_included: String,
    hp_pool_canonical_id: Option<String>,
    natural_armor: Option<f64>,
    soak: Option<f64>,
    location_effect: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureAttackInput {
    canonical_id: String,
    attack_name: String,
    attack_percentage: Option<f64>,
    damage: Option<String>,
    damage_type: String,
    range_reach: String,
    required_anatomy: String,
    requirements: String,
    uses_recharge: String,
    special_effect: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureSkillLinkInput {
    skill_id: i64,
    rank: Option<String>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureAbilityInput {
    canonical_id: String,
    ability_name: String,
    ability_type: String,
    activation: String,
    requirements: String,
    uses_recharge: String,
    description: String,
    mechanical_effect: String,
    notes: String,
    sort_order: i64,
    cr_impact: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureDefenseInput {
    seed_identity: Option<String>,
    defense_type: String,
    against: String,
    value: Option<String>,
    notes: String,
    sort_order: i64,
    cr_impact: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureUseInput {
    seed_identity: Option<String>,
    use_name: String,
    notes: String,
    sort_order: i64,
}
#[tauri::command]
pub fn save_creature_aggregate(
    app: AppHandle,
    input: SaveCreatureAggregateInput,
) -> Result<i64, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("The local archive path is unavailable: {error}"))?
        .join(DATABASE_FILENAME);
    save_creature_aggregate_at_path(&database_path, input)
}

fn save_creature_aggregate_at_path(
    database_path: &Path,
    input: SaveCreatureAggregateInput,
) -> Result<i64, String> {
    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("The local archive could not be opened: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign-key protection could not be enabled: {error}"))?;
    save_creature_aggregate_in_connection(&mut connection, input)
}

fn hp_pool_id(
    transaction: &Transaction<'_>,
    creature_id: i64,
    canonical_id: &Option<String>,
) -> Result<Option<i64>, String> {
    let Some(canonical_id) = canonical_id else {
        return Ok(None);
    };
    transaction.query_row(
        "SELECT id FROM creature_hp_pools WHERE creature_id = ?1 AND canonical_id = ?2 COLLATE NOCASE",
        params![creature_id, canonical_id], |row| row.get(0),
    ).optional().map_err(|error| format!("The HP Pool reference could not be read: {error}"))?
        .ok_or_else(|| format!("HP Pool {canonical_id:?} does not belong to this Creature."))
        .map(Some)
}

fn normalize_size(value: &str) -> Result<String, String> {
    let size = value.trim();
    let size_scale: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(SIZE_SCALE_JSON)
            .map_err(|error| format!("The canonical Size scale is invalid: {error}"))?;
    if !size_scale.contains_key(size) {
        return Err(format!(
            "Creature Size {size:?} is not in the shared canonical Size scale."
        ));
    }
    Ok(size.to_string())
}

fn save_creature_aggregate_in_connection(
    connection: &mut Connection,
    mut input: SaveCreatureAggregateInput,
) -> Result<i64, String> {
    input.core.size = normalize_size(&input.core.size)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Creature save transaction could not begin: {error}"))?;

    let calculated_rating = input
        .core
        .calculated_challenge_rating
        .ok_or_else(|| "The calculated Challenge Rating is required.".to_string())?;
    if !(1..=50).contains(&calculated_rating) {
        return Err("The calculated Challenge Rating must be from 1 through 50.".to_string());
    }
    if !(-49..=49).contains(&input.core.challenge_rating_adjustment) {
        return Err("The Challenge Rating adjustment must be from -49 through 49.".to_string());
    }
    if input.core.challenge_rating_adjustment != 0
        && input
            .core
            .challenge_rating_adjustment_reason
            .trim()
            .is_empty()
    {
        return Err("A Challenge Rating adjustment requires a reason.".to_string());
    }
    let final_rating = (calculated_rating + input.core.challenge_rating_adjustment).clamp(1, 50);
    if input.core.challenge_rating != Some(final_rating) {
        return Err("The final Challenge Rating does not match the calculated rating and documented adjustment.".to_string());
    }
    let canonical_kill_xp: i64 = transaction
        .query_row(
            "SELECT kill_xp FROM challenge_rating_reference WHERE challenge_rating=?1",
            [final_rating],
            |row| row.get(0),
        )
        .map_err(|error| {
            format!("Kill XP could not be resolved from Challenge Rating {final_rating}: {error}")
        })?;
    if input.core.kill_xp != Some(canonical_kill_xp) {
        return Err("Kill XP must match the canonical Challenge Rating reference.".to_string());
    }

    for impact in input
        .abilities
        .iter()
        .map(|row| row.cr_impact.as_str())
        .chain(input.defenses.iter().map(|row| row.cr_impact.as_str()))
    {
        if !matches!(impact, "None" | "Minor" | "Moderate" | "Major" | "Extreme") {
            return Err(format!("Unknown Creature CR Impact {impact:?}."));
        }
    }

    let creature_id = if let Some(creature_id) = input.id {
        let (stored_parent, stored_canonical_id): (Option<i64>, String) = transaction
            .query_row(
                "SELECT parent_creature_id, canonical_id FROM creatures WHERE id=?1",
                [creature_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| format!("The Creature lineage could not be checked: {error}"))?
            .ok_or_else(|| "The selected Creature no longer exists.".to_string())?;
        if stored_parent != input.core.parent_creature_id {
            return Err("Creature lineage is immutable after creation.".to_string());
        }
        if let Some(parent_id) = stored_parent {
            if stored_canonical_id != input.core.canonical_id.trim() {
                return Err(
                    "A derived Creature ID is generated by the system and cannot be changed."
                        .to_string(),
                );
            }
            let same_family: i64 = transaction
                .query_row(
                    "SELECT COUNT(*) FROM creatures parent WHERE parent.id=?1 AND parent.family=?2 COLLATE NOCASE",
                    params![parent_id, input.core.family.trim()],
                    |row| row.get(0),
                )
                .map_err(|error| format!("The parent Creature family could not be checked: {error}"))?;
            if same_family != 1 {
                return Err(
                    "A derived Creature must remain in its parent Creature's family.".to_string(),
                );
            }
        }
        let affected = transaction.execute(
            "UPDATE creatures SET canonical_id=?1, canonical_name=?2, family=?3, creature_type=?4,
             size=?5, challenge_rating=?6, kill_xp=?7, description=?8, typical_behavior=?9,
             habitat_ecology=?10, notes=?11, created_by_user_id=?12, source_system=?13,
             calculated_challenge_rating=?14, challenge_rating_adjustment=?15,
             challenge_rating_adjustment_reason=?16,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?17",
            params![input.core.canonical_id, input.core.canonical_name, input.core.family, input.core.creature_type,
                input.core.size, input.core.challenge_rating, input.core.kill_xp, input.core.description,
                input.core.typical_behavior, input.core.habitat_ecology, input.core.notes,
                input.core.created_by_user_id, input.core.source_system, calculated_rating,
                input.core.challenge_rating_adjustment, input.core.challenge_rating_adjustment_reason,
                creature_id],
        ).map_err(|error| format!("The Creature record could not be updated: {error}"))?;
        if affected == 0 {
            return Err("The selected Creature no longer exists.".to_string());
        }
        creature_id
    } else {
        if input.core.parent_creature_id.is_some() {
            return Err("Derived Creatures must be created through Create Variant.".to_string());
        }
        transaction
            .execute(
                "INSERT INTO creatures (canonical_id, canonical_name, family, creature_type, size,
             challenge_rating, kill_xp, description, typical_behavior, habitat_ecology, notes,
             created_by_user_id, source_system, parent_creature_id, calculated_challenge_rating,
             challenge_rating_adjustment, challenge_rating_adjustment_reason)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL,?14,?15,?16)",
                params![
                    input.core.canonical_id,
                    input.core.canonical_name,
                    input.core.family,
                    input.core.creature_type,
                    input.core.size,
                    input.core.challenge_rating,
                    input.core.kill_xp,
                    input.core.description,
                    input.core.typical_behavior,
                    input.core.habitat_ecology,
                    input.core.notes,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    calculated_rating,
                    input.core.challenge_rating_adjustment,
                    input.core.challenge_rating_adjustment_reason
                ],
            )
            .map_err(|error| format!("The Creature record could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    for table in [
        "creature_hit_locations",
        "creature_skill_links",
        "creature_attributes",
        "creature_movement",
        "creature_attacks",
        "creature_abilities",
        "creature_defenses",
        "creature_uses",
        "creature_hp_pools",
    ] {
        transaction
            .execute(
                &format!("DELETE FROM {table} WHERE creature_id = ?1"),
                [creature_id],
            )
            .map_err(|error| {
                format!("Existing Creature data in {table} could not be replaced: {error}")
            })?;
    }

    for row in input.attributes {
        transaction.execute("INSERT INTO creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
            params![creature_id, Option::<i64>::None, row.attribute_key, row.value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Attribute could not be saved: {error}"))?;
    }
    for row in input.movement {
        transaction.execute("INSERT INTO creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![creature_id, Option::<i64>::None, row.movement_mode, row.movement_value, row.initiative, row.requirements, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Movement row could not be saved: {error}"))?;
    }
    for row in input.hp_pools {
        transaction.execute("INSERT INTO creature_hp_pools (canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![row.canonical_id, creature_id, Option::<i64>::None, row.pool_name, row.hp_percentage, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature HP Pool could not be saved: {error}"))?;
    }
    for row in input.hit_locations {
        let pool_id = hp_pool_id(&transaction, creature_id, &row.hp_pool_canonical_id)?;
        transaction.execute("INSERT INTO creature_hit_locations (creature_id, variant_id, hit_location_number, location_name, body_parts_included, hp_pool_id, natural_armor, soak, location_effect, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![creature_id, Option::<i64>::None, row.hit_location_number, row.location_name, row.body_parts_included, pool_id, row.natural_armor, row.soak, row.location_effect, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Hit Location could not be saved: {error}"))?;
    }
    for row in input.attacks {
        transaction.execute("INSERT INTO creature_attacks (canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage, damage_type, range_reach, required_anatomy, requirements, uses_recharge, special_effect, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![row.canonical_id, creature_id, Option::<i64>::None, row.attack_name, row.attack_percentage, row.damage, row.damage_type, row.range_reach, row.required_anatomy, row.requirements, row.uses_recharge, row.special_effect, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Attack could not be saved: {error}"))?;
    }
    for row in input.skill_links {
        let canonical_skill: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE id=?1 AND source_system='serrian-tide-core'",
                [row.skill_id],
                |result| result.get(0),
            )
            .map_err(|error| format!("The Creature Skill could not be checked: {error}"))?;
        if canonical_skill != 1 {
            return Err(
                "Creature Skills must reference an existing canonical Serrian Tide Skill."
                    .to_string(),
            );
        }
        transaction.execute("INSERT INTO creature_skill_links (creature_id, variant_id, skill_id, rank, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
            params![creature_id, Option::<i64>::None, row.skill_id, row.rank, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Skill link could not be saved: {error}"))?;
    }
    for row in input.abilities {
        transaction.execute("INSERT INTO creature_abilities (canonical_id, creature_id, variant_id, ability_name, ability_type, activation, requirements, uses_recharge, description, mechanical_effect, notes, sort_order, cr_impact) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![row.canonical_id, creature_id, Option::<i64>::None, row.ability_name, row.ability_type, row.activation, row.requirements, row.uses_recharge, row.description, row.mechanical_effect, row.notes, row.sort_order, row.cr_impact])
            .map_err(|error| format!("A Creature Ability could not be saved: {error}"))?;
    }
    for row in input.defenses {
        transaction.execute("INSERT INTO creature_defenses (seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order, cr_impact) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![row.seed_identity, creature_id, Option::<i64>::None, row.defense_type, row.against, row.value, row.notes, row.sort_order, row.cr_impact])
            .map_err(|error| format!("A Creature Defense could not be saved: {error}"))?;
    }
    for row in input.uses {
        transaction.execute("INSERT INTO creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
            params![row.seed_identity, creature_id, Option::<i64>::None, row.use_name, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Use could not be saved: {error}"))?;
    }
    transaction.commit().map_err(|error| {
        format!("The Creature save transaction could not be committed: {error}")
    })?;
    Ok(creature_id)
}

fn canonical_token(value: &str) -> String {
    let without_prefix = value
        .strip_prefix("CR-")
        .or_else(|| value.strip_prefix("VAR-"))
        .unwrap_or(value);
    let mut token = String::new();
    let mut previous_dash = false;
    for character in without_prefix.chars() {
        if character.is_ascii_alphanumeric() {
            token.push(character.to_ascii_uppercase());
            previous_dash = false;
        } else if !previous_dash && !token.is_empty() {
            token.push('-');
            previous_dash = true;
        }
    }
    token.trim_matches('-').to_string()
}

fn next_variant_canonical_id(
    transaction: &Transaction<'_>,
    parent_creature_id: i64,
) -> Result<String, String> {
    let mut current_id = parent_creature_id;
    let root_canonical_id = loop {
        let (canonical_id, parent_id): (String, Option<i64>) = transaction
            .query_row(
                "SELECT canonical_id, parent_creature_id FROM creatures WHERE id=?1",
                [current_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| format!("The parent Creature lineage could not be read: {error}"))?;
        match parent_id {
            Some(parent_id) => current_id = parent_id,
            None => break canonical_id,
        }
    };
    let token = canonical_token(&root_canonical_id);
    if token.is_empty() {
        return Err("The parent Creature ID cannot produce a Variant ID.".to_string());
    }
    for sequence in 1..=9999 {
        let candidate = format!("VAR-{token}-{sequence:03}");
        let exists: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM creatures WHERE canonical_id=?1 COLLATE NOCASE",
                [&candidate],
                |row| row.get(0),
            )
            .map_err(|error| format!("Variant ID availability could not be checked: {error}"))?;
        if exists == 0 {
            return Ok(candidate);
        }
    }
    Err("No available Variant ID remains for this Creature family.".to_string())
}

#[tauri::command]
pub fn clone_creature_as_variant(
    app: AppHandle,
    parent_creature_id: i64,
    variant_name: String,
    user_id: i64,
) -> Result<i64, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("The local archive path is unavailable: {error}"))?
        .join(DATABASE_FILENAME);
    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("The local archive could not be opened: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign-key protection could not be enabled: {error}"))?;
    clone_creature_as_variant_in_connection(
        &mut connection,
        parent_creature_id,
        &variant_name,
        user_id,
    )
}

fn clone_creature_as_variant_in_connection(
    connection: &mut Connection,
    parent_creature_id: i64,
    variant_name: &str,
    user_id: i64,
) -> Result<i64, String> {
    let variant_name = variant_name.trim();
    if variant_name.is_empty() {
        return Err("Variant Name is required.".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Variant creation transaction could not begin: {error}"))?;
    let canonical_id = next_variant_canonical_id(&transaction, parent_creature_id)?;
    let created = transaction
        .execute(
            "INSERT INTO creatures (
           canonical_id, canonical_name, family, creature_type, size,
           challenge_rating, kill_xp, description, typical_behavior,
           habitat_ecology, notes, created_by_user_id, source_system,
           parent_creature_id, calculated_challenge_rating,
           challenge_rating_adjustment, challenge_rating_adjustment_reason
         )
         SELECT ?1, ?2, family, creature_type, size, challenge_rating, kill_xp,
                description, typical_behavior, habitat_ecology, notes, ?3, NULL,
                id, calculated_challenge_rating, challenge_rating_adjustment,
                challenge_rating_adjustment_reason
         FROM creatures WHERE id=?4",
            params![canonical_id, variant_name, user_id, parent_creature_id],
        )
        .map_err(|error| format!("The derived Creature could not be created: {error}"))?;
    if created != 1 {
        return Err("The parent Creature no longer exists.".to_string());
    }
    let creature_id = transaction.last_insert_rowid();
    let token = canonical_token(&canonical_id);

    transaction.execute(
        "INSERT INTO creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order)
         SELECT ?1, NULL, attribute_key, value, notes, sort_order
         FROM creature_attributes WHERE creature_id=?2 AND variant_id IS NULL",
        params![creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Attributes could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order)
         SELECT ?1, NULL, movement_mode, movement_value, initiative, requirements, notes, sort_order
         FROM creature_movement WHERE creature_id=?2 AND variant_id IS NULL",
        params![creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Movement could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_hp_pools (canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order)
         SELECT 'HP-' || ?1 || '-' || printf('%04d', id), ?2, NULL, pool_name, hp_percentage, notes, sort_order
         FROM creature_hp_pools WHERE creature_id=?3 AND variant_id IS NULL",
        params![token, creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant HP Pools could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_hit_locations (creature_id, variant_id, hit_location_number, location_name, body_parts_included, hp_pool_id, natural_armor, soak, location_effect, notes, sort_order)
         SELECT ?1, NULL, source.hit_location_number, source.location_name,
                source.body_parts_included,
                CASE WHEN source.hp_pool_id IS NULL THEN NULL ELSE (
                  SELECT copied.id FROM creature_hp_pools copied
                  WHERE copied.creature_id=?1
                    AND copied.canonical_id='HP-' || ?2 || '-' || printf('%04d', source.hp_pool_id)
                ) END,
                source.natural_armor, source.soak, source.location_effect,
                source.notes, source.sort_order
         FROM creature_hit_locations source
         WHERE source.creature_id=?3 AND source.variant_id IS NULL",
        params![creature_id, token, parent_creature_id],
    ).map_err(|error| format!("Variant Hit Locations could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_attacks (canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage, damage_type, range_reach, required_anatomy, requirements, uses_recharge, special_effect, notes, sort_order)
         SELECT 'ATK-' || ?1 || '-' || printf('%04d', id), ?2, NULL, attack_name,
                attack_percentage, damage, damage_type, range_reach, required_anatomy,
                requirements, uses_recharge, special_effect, notes, sort_order
         FROM creature_attacks WHERE creature_id=?3 AND variant_id IS NULL",
        params![token, creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Attacks could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_skill_links (creature_id, variant_id, skill_id, rank, notes, sort_order)
         SELECT ?1, NULL, skill_id, rank, notes, sort_order
         FROM creature_skill_links WHERE creature_id=?2 AND variant_id IS NULL",
        params![creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Skills could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_abilities (canonical_id, creature_id, variant_id, ability_name, ability_type, activation, requirements, uses_recharge, description, mechanical_effect, notes, sort_order, cr_impact)
         SELECT 'ABL-' || ?1 || '-' || printf('%04d', id), ?2, NULL, ability_name,
                ability_type, activation, requirements, uses_recharge, description,
                mechanical_effect, notes, sort_order, cr_impact
         FROM creature_abilities WHERE creature_id=?3 AND variant_id IS NULL",
        params![token, creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Abilities could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_defenses (seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order, cr_impact)
         SELECT NULL, ?1, NULL, defense_type, against, value, notes, sort_order, cr_impact
         FROM creature_defenses WHERE creature_id=?2 AND variant_id IS NULL",
        params![creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Defenses could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order)
         SELECT NULL, ?1, NULL, use_name, notes, sort_order
         FROM creature_uses WHERE creature_id=?2 AND variant_id IS NULL",
        params![creature_id, parent_creature_id],
    ).map_err(|error| format!("Variant Uses could not be copied: {error}"))?;

    transaction
        .commit()
        .map_err(|error| format!("The derived Creature could not be committed: {error}"))?;
    Ok(creature_id)
}

#[cfg(test)]
mod tests {
    use super::{
        clone_creature_as_variant_in_connection, save_creature_aggregate_in_connection,
        SaveCreatureAggregateInput,
    };
    use rusqlite::Connection;
    const ACCOUNTS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS: &str = include_str!("../migrations/0002_create_skills.sql");
    const CREATURES: &str = include_str!("../migrations/0007_create_creatures.sql");
    const DROP_PROVENANCE: &str =
        include_str!("../migrations/0009_drop_creature_ip_provenance.sql");
    const DERIVED_CREATURES: &str =
        include_str!("../migrations/0012_create_derived_creatures_and_cr.sql");

    fn setup() -> Connection {
        let connection = Connection::open_in_memory().expect("open test database");
        connection.execute_batch(ACCOUNTS).expect("accounts");
        connection.execute_batch(SKILLS).expect("skills");
        connection.execute_batch(CREATURES).expect("creatures");
        connection
            .execute_batch(DROP_PROVENANCE)
            .expect("drop provenance");
        connection
            .execute_batch(DERIVED_CREATURES)
            .expect("derived Creature schema");
        connection
            .execute(
                "INSERT INTO challenge_rating_reference (challenge_rating, kill_xp) VALUES (1,1),(8,3)",
                [],
            )
            .expect("CR rows");
        connection.execute("INSERT INTO users (username,password_hash,password_salt,password_iterations) VALUES ('Owner','hash','salt',1)", []).expect("owner");
        connection.execute("INSERT INTO skills (name, classification, source_system, source_external_id) VALUES ('Tracking','standard','serrian-tide-core','skill-tracking')", []).expect("Skill");
        connection
    }

    fn input() -> SaveCreatureAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core":{"canonicalId":"CR-TEST","canonicalName":"Test Beast","family":"Test","creatureType":"Animal","size":"Medium","challengeRating":8,"killXp":3,"parentCreatureId":null,"calculatedChallengeRating":8,"challengeRatingAdjustment":0,"challengeRatingAdjustmentReason":"","description":"","typicalBehavior":"","habitatEcology":"","notes":"Note","createdByUserId":null,"sourceSystem":null},
            "attributes":[{"attributeKey":"Strength","value":0,"notes":"","sortOrder":0}],
            "movement":[{"movementMode":"Land","movementValue":0,"initiative":0,"requirements":"","notes":"","sortOrder":0}],
            "hpPools":[{"canonicalId":"HP-TEST-BODY","poolName":"Body","hpPercentage":100,"notes":"","sortOrder":0}],
            "hitLocations":[{"hitLocationNumber":0,"locationName":"Body","bodyPartsIncluded":"Body","hpPoolCanonicalId":"HP-TEST-BODY","naturalArmor":null,"soak":0,"locationEffect":"","notes":"","sortOrder":0},{"hitLocationNumber":1,"locationName":"Body","bodyPartsIncluded":"Body","hpPoolCanonicalId":"HP-TEST-BODY","naturalArmor":0,"soak":null,"locationEffect":"","notes":"","sortOrder":1}],
            "attacks":[{"canonicalId":"ATK-TEST-BITE","attackName":"Bite","attackPercentage":50,"damage":null,"damageType":"Piercing","rangeReach":"Short","requiredAnatomy":"Jaws","requirements":"","usesRecharge":"","specialEffect":"","notes":"","sortOrder":0}],
            "skillLinks":[],
            "abilities":[],"defenses":[],"uses":[]
        })).expect("input")
    }

    #[test]
    fn aggregate_save_preserves_null_zero_shared_pools_and_canonical_xp() {
        let mut connection = setup();
        let creature_id =
            save_creature_aggregate_in_connection(&mut connection, input()).expect("save Creature");
        let values: (Option<f64>, Option<f64>, Option<String>, i64) = connection.query_row(
            "SELECT (SELECT natural_armor FROM creature_hit_locations WHERE creature_id=?1 AND hit_location_number=0),
                    (SELECT soak FROM creature_hit_locations WHERE creature_id=?1 AND hit_location_number=0),
                    (SELECT damage FROM creature_attacks WHERE creature_id=?1),
                    (SELECT COUNT(DISTINCT hp_pool_id) FROM creature_hit_locations WHERE creature_id=?1)",
            [creature_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))).expect("values");
        assert_eq!(values, (None, Some(0.0), None, 1));
        let rating: (i64, i64, i64) = connection.query_row(
            "SELECT calculated_challenge_rating, challenge_rating, kill_xp FROM creatures WHERE id=?1",
            [creature_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).expect("rating");
        assert_eq!(rating, (8, 8, 3));
    }

    #[test]
    fn invalid_child_rolls_back_the_complete_aggregate() {
        let mut connection = setup();
        let creature_id =
            save_creature_aggregate_in_connection(&mut connection, input()).expect("baseline");
        let mut changed = input();
        changed.id = Some(creature_id);
        changed.core.canonical_name = "Changed".to_string();
        changed.hit_locations[0].hp_pool_canonical_id = Some("HP-MISSING".to_string());
        assert!(save_creature_aggregate_in_connection(&mut connection, changed).is_err());
        let name: String = connection
            .query_row(
                "SELECT canonical_name FROM creatures WHERE id=?1",
                [creature_id],
                |row| row.get(0),
            )
            .expect("name");
        assert_eq!(name, "Test Beast");
    }

    #[test]
    fn cloning_creates_a_complete_independent_creature_with_immutable_lineage() {
        let mut connection = setup();
        let parent_id =
            save_creature_aggregate_in_connection(&mut connection, input()).expect("save");
        let child_id =
            clone_creature_as_variant_in_connection(&mut connection, parent_id, "Ember Horse", 1)
                .expect("clone");
        let child: (String, String, i64, String) = connection.query_row(
            "SELECT canonical_id, canonical_name, parent_creature_id, family FROM creatures WHERE id=?1",
            [child_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))).expect("child");
        assert_eq!(
            child,
            (
                "VAR-TEST-001".into(),
                "Ember Horse".into(),
                parent_id,
                "Test".into()
            )
        );
        let mut changed_identity = input();
        changed_identity.id = Some(child_id);
        changed_identity.core.parent_creature_id = Some(parent_id);
        changed_identity.core.canonical_id = "VAR-MANUAL-ID".into();
        let identity_error =
            save_creature_aggregate_in_connection(&mut connection, changed_identity)
                .expect_err("derived ID must be immutable");
        assert!(identity_error.contains("generated by the system"));
        let copied: (i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
               (SELECT COUNT(*) FROM creature_attributes WHERE creature_id=?1),
               (SELECT COUNT(*) FROM creature_hp_pools WHERE creature_id=?1),
               (SELECT COUNT(*) FROM creature_hit_locations WHERE creature_id=?1),
               (SELECT COUNT(*) FROM creature_attacks WHERE creature_id=?1)",
                [child_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("copies");
        assert_eq!(copied, (1, 1, 2, 1));

        connection
            .execute(
                "UPDATE creature_attributes SET value=50 WHERE creature_id=?1",
                [child_id],
            )
            .expect("change child");
        let parent_strength: f64 = connection
            .query_row(
                "SELECT value FROM creature_attributes WHERE creature_id=?1",
                [parent_id],
                |row| row.get(0),
            )
            .expect("parent strength");
        assert_eq!(
            parent_strength, 0.0,
            "child edits must not mutate the parent"
        );
        assert!(
            connection
                .execute("DELETE FROM creatures WHERE id=?1", [parent_id])
                .is_err(),
            "a parent with derived Creatures must retain its lineage"
        );

        connection
            .execute("DELETE FROM creatures WHERE id=?1", [child_id])
            .expect("delete child");
        for table in [
            "creature_attributes",
            "creature_hp_pools",
            "creature_hit_locations",
            "creature_attacks",
        ] {
            let count: i64 = connection
                .query_row(
                    &format!("SELECT COUNT(*) FROM {table} WHERE creature_id={child_id}"),
                    [],
                    |row| row.get(0),
                )
                .expect("count");
            assert_eq!(count, 0, "{table} should not retain orphaned rows");
        }
    }
}
