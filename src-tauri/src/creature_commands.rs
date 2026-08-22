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
    variants: Vec<CreatureVariantInput>,
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
    variant_canonical_id: Option<String>,
    attribute_key: String,
    value: Option<f64>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureMovementInput {
    variant_canonical_id: Option<String>,
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
    variant_canonical_id: Option<String>,
    pool_name: String,
    hp_percentage: Option<f64>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureHitLocationInput {
    variant_canonical_id: Option<String>,
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
    variant_canonical_id: Option<String>,
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
    variant_canonical_id: Option<String>,
    skill_id: i64,
    rank: Option<String>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureAbilityInput {
    canonical_id: String,
    variant_canonical_id: Option<String>,
    ability_name: String,
    ability_type: String,
    activation: String,
    requirements: String,
    uses_recharge: String,
    description: String,
    mechanical_effect: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureDefenseInput {
    seed_identity: Option<String>,
    variant_canonical_id: Option<String>,
    defense_type: String,
    against: String,
    value: Option<String>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureUseInput {
    seed_identity: Option<String>,
    variant_canonical_id: Option<String>,
    use_name: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureVariantInput {
    canonical_id: String,
    variant_name: String,
    variant_type: String,
    size_override: Option<String>,
    challenge_rating_override: Option<i64>,
    kill_xp_override: Option<i64>,
    description: String,
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

fn variant_id(
    transaction: &Transaction<'_>,
    creature_id: i64,
    canonical_id: &Option<String>,
) -> Result<Option<i64>, String> {
    let Some(canonical_id) = canonical_id else {
        return Ok(None);
    };
    transaction.query_row(
        "SELECT id FROM creature_variants WHERE creature_id = ?1 AND canonical_id = ?2 COLLATE NOCASE",
        params![creature_id, canonical_id], |row| row.get(0),
    ).optional().map_err(|error| format!("The Variant reference could not be read: {error}"))?
        .ok_or_else(|| format!("Variant {canonical_id:?} does not belong to this Creature."))
        .map(Some)
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
    for variant in &mut input.variants {
        if let Some(size) = variant.size_override.as_ref() {
            variant.size_override = Some(normalize_size(size)?);
        }
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Creature save transaction could not begin: {error}"))?;

    let creature_id = if let Some(creature_id) = input.id {
        let affected = transaction.execute(
            "UPDATE creatures SET canonical_id=?1, canonical_name=?2, family=?3, creature_type=?4,
             size=?5, challenge_rating=?6, kill_xp=?7, description=?8, typical_behavior=?9,
             habitat_ecology=?10, notes=?11, created_by_user_id=?12, source_system=?13,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?14",
            params![input.core.canonical_id, input.core.canonical_name, input.core.family, input.core.creature_type,
                input.core.size, input.core.challenge_rating, input.core.kill_xp, input.core.description,
                input.core.typical_behavior, input.core.habitat_ecology, input.core.notes,
                input.core.created_by_user_id, input.core.source_system, creature_id],
        ).map_err(|error| format!("The Creature record could not be updated: {error}"))?;
        if affected == 0 {
            return Err("The selected Creature no longer exists.".to_string());
        }
        creature_id
    } else {
        transaction.execute(
            "INSERT INTO creatures (canonical_id, canonical_name, family, creature_type, size,
             challenge_rating, kill_xp, description, typical_behavior, habitat_ecology, notes,
             created_by_user_id, source_system) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![input.core.canonical_id, input.core.canonical_name, input.core.family, input.core.creature_type,
                input.core.size, input.core.challenge_rating, input.core.kill_xp, input.core.description,
                input.core.typical_behavior, input.core.habitat_ecology, input.core.notes,
                input.core.created_by_user_id, input.core.source_system],
        ).map_err(|error| format!("The Creature record could not be created: {error}"))?;
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
        "creature_variants",
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

    for row in input.variants {
        transaction.execute(
            "INSERT INTO creature_variants (canonical_id, creature_id, variant_name, variant_type,
             size_override, challenge_rating_override, kill_xp_override, description, notes, sort_order)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![row.canonical_id, creature_id, row.variant_name, row.variant_type, row.size_override,
                row.challenge_rating_override, row.kill_xp_override, row.description, row.notes, row.sort_order],
        ).map_err(|error| format!("A Creature Variant could not be saved: {error}"))?;
    }
    for row in input.attributes {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
            params![creature_id, variant_id, row.attribute_key, row.value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Attribute could not be saved: {error}"))?;
    }
    for row in input.movement {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![creature_id, variant_id, row.movement_mode, row.movement_value, row.initiative, row.requirements, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Movement row could not be saved: {error}"))?;
    }
    for row in input.hp_pools {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_hp_pools (canonical_id, creature_id, variant_id, pool_name, hp_percentage, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![row.canonical_id, creature_id, variant_id, row.pool_name, row.hp_percentage, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature HP Pool could not be saved: {error}"))?;
    }
    for row in input.hit_locations {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        let pool_id = hp_pool_id(&transaction, creature_id, &row.hp_pool_canonical_id)?;
        if let Some(pool_id) = pool_id {
            let pool_variant: Option<i64> = transaction
                .query_row(
                    "SELECT variant_id FROM creature_hp_pools WHERE id=?1",
                    [pool_id],
                    |result| result.get(0),
                )
                .map_err(|error| {
                    format!("The Hit Location HP Pool could not be checked: {error}")
                })?;
            if pool_variant != variant_id {
                return Err("A Hit Location and its HP Pool must belong to the same base Creature or Variant.".to_string());
            }
        }
        transaction.execute("INSERT INTO creature_hit_locations (creature_id, variant_id, hit_location_number, location_name, body_parts_included, hp_pool_id, natural_armor, soak, location_effect, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![creature_id, variant_id, row.hit_location_number, row.location_name, row.body_parts_included, pool_id, row.natural_armor, row.soak, row.location_effect, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Hit Location could not be saved: {error}"))?;
    }
    for row in input.attacks {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_attacks (canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage, damage_type, range_reach, required_anatomy, requirements, uses_recharge, special_effect, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![row.canonical_id, creature_id, variant_id, row.attack_name, row.attack_percentage, row.damage, row.damage_type, row.range_reach, row.required_anatomy, row.requirements, row.uses_recharge, row.special_effect, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Attack could not be saved: {error}"))?;
    }
    for row in input.skill_links {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
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
            params![creature_id, variant_id, row.skill_id, row.rank, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Skill link could not be saved: {error}"))?;
    }
    for row in input.abilities {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_abilities (canonical_id, creature_id, variant_id, ability_name, ability_type, activation, requirements, uses_recharge, description, mechanical_effect, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![row.canonical_id, creature_id, variant_id, row.ability_name, row.ability_type, row.activation, row.requirements, row.uses_recharge, row.description, row.mechanical_effect, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Ability could not be saved: {error}"))?;
    }
    for row in input.defenses {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_defenses (seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![row.seed_identity, creature_id, variant_id, row.defense_type, row.against, row.value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Defense could not be saved: {error}"))?;
    }
    for row in input.uses {
        let variant_id = variant_id(&transaction, creature_id, &row.variant_canonical_id)?;
        transaction.execute("INSERT INTO creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
            params![row.seed_identity, creature_id, variant_id, row.use_name, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Use could not be saved: {error}"))?;
    }
    transaction.commit().map_err(|error| {
        format!("The Creature save transaction could not be committed: {error}")
    })?;
    Ok(creature_id)
}

#[cfg(test)]
mod tests {
    use super::{save_creature_aggregate_in_connection, SaveCreatureAggregateInput};
    use rusqlite::Connection;
    const ACCOUNTS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS: &str = include_str!("../migrations/0002_create_skills.sql");
    const CREATURES: &str = include_str!("../migrations/0007_create_creatures.sql");
    const DROP_PROVENANCE: &str =
        include_str!("../migrations/0009_drop_creature_ip_provenance.sql");

    fn setup() -> Connection {
        let connection = Connection::open_in_memory().expect("open test database");
        connection.execute_batch(ACCOUNTS).expect("accounts");
        connection.execute_batch(SKILLS).expect("skills");
        connection.execute_batch(CREATURES).expect("creatures");
        connection
            .execute_batch(DROP_PROVENANCE)
            .expect("final Creature schema");
        connection
            .execute(
                "INSERT INTO challenge_rating_reference (challenge_rating) VALUES (1),(8)",
                [],
            )
            .expect("CR rows");
        connection.execute("INSERT INTO skills (name, classification, source_system, source_external_id) VALUES ('Tracking','standard','serrian-tide-core','skill-tracking')", []).expect("Skill");
        connection
    }

    fn input() -> SaveCreatureAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core":{"canonicalId":"CR-TEST","canonicalName":"Test Beast","family":"Test","creatureType":"Animal","size":"Medium","challengeRating":8,"killXp":3,"description":"","typicalBehavior":"","habitatEcology":"","notes":"PROPOSED","createdByUserId":null,"sourceSystem":null},
            "attributes":[{"variantCanonicalId":null,"attributeKey":"Strength","value":0,"notes":"","sortOrder":0}],
            "movement":[{"variantCanonicalId":null,"movementMode":"Land","movementValue":0,"initiative":0,"requirements":"","notes":"","sortOrder":0}],
            "hpPools":[{"canonicalId":"HP-TEST-BODY","variantCanonicalId":null,"poolName":"Body","hpPercentage":100,"notes":"","sortOrder":0}],
            "hitLocations":[{"variantCanonicalId":null,"hitLocationNumber":0,"locationName":"Body","bodyPartsIncluded":"Body","hpPoolCanonicalId":"HP-TEST-BODY","naturalArmor":null,"soak":0,"locationEffect":"","notes":"","sortOrder":0},{"variantCanonicalId":null,"hitLocationNumber":1,"locationName":"Body","bodyPartsIncluded":"Body","hpPoolCanonicalId":"HP-TEST-BODY","naturalArmor":0,"soak":null,"locationEffect":"","notes":"","sortOrder":1}],
            "attacks":[{"canonicalId":"ATK-TEST-BITE","variantCanonicalId":null,"attackName":"Bite","attackPercentage":50,"damage":null,"damageType":"Piercing","rangeReach":"Short","requiredAnatomy":"Jaws","requirements":"","usesRecharge":"","specialEffect":"","notes":"","sortOrder":0}],
            "skillLinks":[],
            "abilities":[],"defenses":[],"uses":[],
            "variants":[{"canonicalId":"VAR-TEST-LARGE","variantName":"Large Form","variantType":"Biological","sizeOverride":null,"challengeRatingOverride":null,"killXpOverride":null,"description":"","notes":"","sortOrder":0}]
        })).expect("input")
    }

    #[test]
    fn aggregate_save_preserves_null_zero_shared_pools_and_blank_variant_overrides() {
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
        let overrides: (Option<String>, Option<i64>, Option<i64>) = connection.query_row(
            "SELECT size_override, challenge_rating_override, kill_xp_override FROM creature_variants WHERE creature_id=?1",
            [creature_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).expect("overrides");
        assert_eq!(overrides, (None, None, None));
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
    fn deleting_creature_cascades_and_variant_deletion_cannot_orphan_children() {
        let mut connection = setup();
        let creature_id =
            save_creature_aggregate_in_connection(&mut connection, input()).expect("save");
        connection
            .execute("DELETE FROM creatures WHERE id=?1", [creature_id])
            .expect("delete");
        for table in [
            "creature_variants",
            "creature_attributes",
            "creature_hp_pools",
            "creature_hit_locations",
            "creature_attacks",
        ] {
            let count: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .expect("count");
            assert_eq!(count, 0, "{table} should not retain orphaned rows");
        }
    }
}
