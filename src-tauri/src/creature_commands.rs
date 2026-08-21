use rusqlite::{params, Connection, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCreatureAggregateInput {
    id: Option<i64>,
    core: CreatureCoreInput,
    alt_names: Vec<AltNameInput>,
    genre_tags: Vec<GenreTagInput>,
    attributes: Vec<AttributeInput>,
    movement_modes: Vec<MovementInput>,
    hp_locations: Vec<HpLocationInput>,
    attacks: Vec<AttackInput>,
    skill_links: Vec<SkillLinkInput>,
    uses: Vec<UseInput>,
    variants: Vec<VariantInput>,
    purchase_item_links: Vec<PurchaseItemLinkInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureCoreInput {
    name: String,
    challenge_rating: Option<f64>,
    encounter_scale: String,
    r#type: String,
    role: String,
    size: String,
    description_short: String,
    hp_total: Option<f64>,
    initiative: Option<f64>,
    armor_soak: Option<f64>,
    magic_resonance_interaction: String,
    behavior_tactics: String,
    habitat: String,
    diet: String,
    loot_harvest: String,
    story_hooks: String,
    notes: String,
    created_by_user_id: Option<i64>,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AltNameInput {
    alt_name: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenreTagInput {
    genre_tag: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttributeInput {
    attribute_key: String,
    value: f64,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MovementInput {
    movement_mode: String,
    base_value: f64,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HpLocationInput {
    location_name: String,
    hp_value: f64,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttackInput {
    name: String,
    damage: Option<f64>,
    range_text: String,
    effect: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillLinkInput {
    skill_id: i64,
    link_type: String,
    value: Option<f64>,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UseInput {
    use_type: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VariantInput {
    name: String,
    description: String,
    notes: String,
    sort_order: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PurchaseItemLinkInput {
    item_id: i64,
    relationship: String,
    notes: String,
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

fn save_creature_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveCreatureAggregateInput,
) -> Result<i64, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Creature save transaction could not begin: {error}"))?;

    let creature_id = if let Some(creature_id) = input.id {
        let changed = transaction
            .execute(
                "UPDATE creatures SET name = ?1, challenge_rating = ?2, encounter_scale = ?3,
             type = ?4, role = ?5, size = ?6, description_short = ?7, hp_total = ?8,
             initiative = ?9, armor_soak = ?10, magic_resonance_interaction = ?11,
             behavior_tactics = ?12, habitat = ?13, diet = ?14, loot_harvest = ?15,
             story_hooks = ?16, notes = ?17, created_by_user_id = ?18,
             source_system = ?19, source_external_id = ?20,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?21",
                params![
                    input.core.name,
                    input.core.challenge_rating,
                    input.core.encounter_scale,
                    input.core.r#type,
                    input.core.role,
                    input.core.size,
                    input.core.description_short,
                    input.core.hp_total,
                    input.core.initiative,
                    input.core.armor_soak,
                    input.core.magic_resonance_interaction,
                    input.core.behavior_tactics,
                    input.core.habitat,
                    input.core.diet,
                    input.core.loot_harvest,
                    input.core.story_hooks,
                    input.core.notes,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                    creature_id
                ],
            )
            .map_err(|error| format!("The Creature record could not be updated: {error}"))?;
        if changed == 0 {
            return Err("The selected Creature no longer exists.".to_string());
        }
        creature_id
    } else {
        transaction.execute(
            "INSERT INTO creatures (name, challenge_rating, encounter_scale, type, role, size,
             description_short, hp_total, initiative, armor_soak, magic_resonance_interaction,
             behavior_tactics, habitat, diet, loot_harvest, story_hooks, notes,
             created_by_user_id, source_system, source_external_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![input.core.name, input.core.challenge_rating, input.core.encounter_scale,
                input.core.r#type, input.core.role, input.core.size, input.core.description_short,
                input.core.hp_total, input.core.initiative, input.core.armor_soak,
                input.core.magic_resonance_interaction, input.core.behavior_tactics,
                input.core.habitat, input.core.diet, input.core.loot_harvest,
                input.core.story_hooks, input.core.notes, input.core.created_by_user_id,
                input.core.source_system, input.core.source_external_id],
        ).map_err(|error| format!("The Creature record could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    transaction
        .execute(
            "DELETE FROM creature_alt_names WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Alt Names could not be replaced: {error}"))?;
    for row in input.alt_names {
        transaction.execute("INSERT INTO creature_alt_names (creature_id, alt_name, sort_order) VALUES (?1, ?2, ?3)", params![creature_id, row.alt_name, row.sort_order])
            .map_err(|error| format!("A Creature Alt Name could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_genre_tags WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Genre Tags could not be replaced: {error}"))?;
    for row in input.genre_tags {
        transaction.execute("INSERT INTO creature_genre_tags (creature_id, genre_tag, sort_order) VALUES (?1, ?2, ?3)", params![creature_id, row.genre_tag, row.sort_order])
            .map_err(|error| format!("A Creature Genre Tag could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_attributes WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Attributes could not be replaced: {error}"))?;
    for row in input.attributes {
        transaction.execute("INSERT INTO creature_attributes (creature_id, attribute_key, value, notes, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)", params![creature_id, row.attribute_key, row.value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Attribute could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_movement_modes WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Movement could not be replaced: {error}"))?;
    for row in input.movement_modes {
        transaction.execute("INSERT INTO creature_movement_modes (creature_id, movement_mode, base_value, notes, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)", params![creature_id, row.movement_mode, row.base_value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Movement row could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_hp_locations WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature HP Locations could not be replaced: {error}"))?;
    for row in input.hp_locations {
        transaction.execute("INSERT INTO creature_hp_locations (creature_id, location_name, hp_value, notes, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)", params![creature_id, row.location_name, row.hp_value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature HP Location could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_attacks WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Attacks could not be replaced: {error}"))?;
    for row in input.attacks {
        transaction.execute("INSERT INTO creature_attacks (creature_id, name, damage, range_text, effect, notes, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![creature_id, row.name, row.damage, row.range_text, row.effect, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Attack could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_skill_links WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Skill links could not be replaced: {error}"))?;
    for row in input.skill_links {
        if row.link_type.eq_ignore_ascii_case("granted") {
            let classification: String = transaction
                .query_row(
                    "SELECT classification FROM skills WHERE id = ?1",
                    [row.skill_id],
                    |result| result.get(0),
                )
                .map_err(|error| {
                    format!("The granted Creature Skill could not be verified: {error}")
                })?;
            if !classification.eq_ignore_ascii_case("special ability") {
                return Err(
                    "Granted / Special Abilities must reference a Special Ability Skill."
                        .to_string(),
                );
            }
        }
        transaction.execute("INSERT INTO creature_skill_links (creature_id, skill_id, link_type, value, notes, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![creature_id, row.skill_id, row.link_type, row.value, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Skill link could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_uses WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Uses could not be replaced: {error}"))?;
    for row in input.uses {
        transaction.execute("INSERT INTO creature_uses (creature_id, use_type, notes, sort_order) VALUES (?1, ?2, ?3, ?4)", params![creature_id, row.use_type, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Use could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM creature_variants WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Variants could not be replaced: {error}"))?;
    for row in input.variants {
        transaction.execute("INSERT INTO creature_variants (creature_id, name, description, notes, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)", params![creature_id, row.name, row.description, row.notes, row.sort_order])
            .map_err(|error| format!("A Creature Variant could not be saved: {error}"))?;
    }
    transaction
        .execute(
            "DELETE FROM item_creature_links WHERE creature_id = ?1",
            [creature_id],
        )
        .map_err(|error| format!("Creature Purchase links could not be replaced: {error}"))?;
    for row in input.purchase_item_links {
        let catalog_section: String = transaction
            .query_row(
                "SELECT catalog_section FROM items WHERE id = ?1",
                [row.item_id],
                |result| result.get(0),
            )
            .map_err(|error| format!("The linked Inventory Item could not be verified: {error}"))?;
        if !catalog_section.eq_ignore_ascii_case("inventory") {
            return Err("Creature Purchase links must reference Inventory Items.".to_string());
        }
        transaction.execute("INSERT INTO item_creature_links (item_id, creature_id, relationship, notes) VALUES (?1, ?2, ?3, ?4)", params![row.item_id, creature_id, row.relationship, row.notes])
            .map_err(|error| format!("A Creature Purchase link could not be saved: {error}"))?;
    }

    transaction.commit().map_err(|error| {
        format!("The Creature save transaction could not be committed: {error}")
    })?;
    Ok(creature_id)
}

#[cfg(test)]
mod tests {
    use super::{save_creature_aggregate_in_connection, SaveCreatureAggregateInput};
    use rusqlite::{params, Connection};

    const ACCOUNTS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS: &str = include_str!("../migrations/0002_create_skills.sql");
    const CREATURES: &str = include_str!("../migrations/0007_create_creatures.sql");
    const ITEMS: &str = include_str!("../migrations/0008_create_item_catalog.sql");

    fn setup() -> (Connection, i64, i64, i64, i64) {
        let connection = Connection::open_in_memory().expect("open Creature test database");
        connection.execute_batch(ACCOUNTS).expect("accounts");
        connection.execute_batch(SKILLS).expect("skills");
        connection.execute_batch(CREATURES).expect("creatures");
        connection.execute_batch(ITEMS).expect("items");
        connection
            .execute(
                "INSERT INTO skills (name, classification) VALUES ('Tracking', 'standard')",
                [],
            )
            .expect("skill");
        let skill_id = connection.last_insert_rowid();
        connection.execute("INSERT INTO skills (name, classification) VALUES ('Keen Scent', 'special ability')", []).expect("ability");
        let ability_id = connection.last_insert_rowid();
        connection.execute("INSERT INTO items (name, catalog_section, cost_credits) VALUES ('Riding Horse', 'Inventory', 500)", []).expect("item one");
        let first_item = connection.last_insert_rowid();
        connection.execute("INSERT INTO items (name, catalog_section, cost_credits) VALUES ('War-Trained Horse', 'Inventory', 900)", []).expect("item two");
        let second_item = connection.last_insert_rowid();
        (connection, skill_id, ability_id, first_item, second_item)
    }

    fn input(
        name: &str,
        skill_id: i64,
        ability_id: i64,
        item_ids: &[i64],
    ) -> SaveCreatureAggregateInput {
        let purchase_links: Vec<_> = item_ids.iter().map(|id| serde_json::json!({
            "itemId": id, "itemName": "display only", "costCredits": null, "category": "Mount",
            "subtype": "", "genreTags": [], "relationship": "Purchase", "notes": ""
        })).collect();
        serde_json::from_value(serde_json::json!({
            "core": {
                "name": name, "challengeRating": null, "encounterScale": "", "type": "Animal",
                "role": "", "size": "", "descriptionShort": "", "hpTotal": null,
                "initiative": 0, "armorSoak": null, "magicResonanceInteraction": "",
                "behaviorTactics": "", "habitat": "", "diet": "", "lootHarvest": "",
                "storyHooks": "", "notes": "", "createdByUserId": null,
                "sourceSystem": null, "sourceExternalId": null
            },
            "altNames": [{"altName": "Equine", "sortOrder": 0}],
            "genreTags": [{"genreTag": "Fantasy", "sortOrder": 0}],
            "attributes": [{"attributeKey": "ENERGON", "value": 4, "notes": "", "sortOrder": 0}],
            "movementModes": [{"movementMode": "Land", "baseValue": 12, "notes": "", "sortOrder": 0}],
            "hpLocations": [{"locationName": "Torso", "hpValue": 20, "notes": "", "sortOrder": 0}],
            "attacks": [
                {"name": "Kick", "damage": 0, "rangeText": "Close", "effect": "", "notes": "", "sortOrder": 0},
                {"name": "Bite", "damage": null, "rangeText": "Close", "effect": "", "notes": "", "sortOrder": 1}
            ],
            "skillLinks": [
                {"skillId": skill_id, "skillName": "Tracking", "skillClassification": "standard", "linkType": "Skill", "value": null, "notes": "", "sortOrder": 0},
                {"skillId": ability_id, "skillName": "Keen Scent", "skillClassification": "special ability", "linkType": "Granted", "value": null, "notes": "", "sortOrder": 0}
            ],
            "uses": [{"useType": "Mount", "notes": "", "sortOrder": 0}],
            "variants": [{"name": "Draft", "description": "", "notes": "", "sortOrder": 0}],
            "purchaseItemLinks": purchase_links
        })).expect("deserialize Creature")
    }

    #[test]
    fn aggregate_save_supports_every_child_nullable_stats_and_duplicate_names() {
        let (mut connection, skill, ability, first_item, second_item) = setup();
        let first = save_creature_aggregate_in_connection(
            &mut connection,
            input("Horse", skill, ability, &[first_item, second_item]),
        )
        .expect("first Horse");
        let second = save_creature_aggregate_in_connection(
            &mut connection,
            input("Horse", skill, ability, &[]),
        )
        .expect("duplicate Horse");
        assert_ne!(first, second);
        let counts: (i64, i64, i64, i64, i64, i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM creature_alt_names WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_genre_tags WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_attributes WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_movement_modes WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_hp_locations WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_attacks WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_skill_links WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_uses WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM creature_variants WHERE creature_id = ?1),
             (SELECT COUNT(*) FROM item_creature_links WHERE creature_id = ?1)",
                [first],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                        row.get(9)?,
                    ))
                },
            )
            .expect("counts");
        assert_eq!(counts, (1, 1, 1, 1, 1, 2, 2, 1, 1, 2));
        let null_and_zero: (Option<f64>, f64, Option<f64>) = connection
            .query_row(
                "SELECT c.hp_total,
             (SELECT damage FROM creature_attacks WHERE creature_id = c.id AND name = 'Kick'),
             (SELECT damage FROM creature_attacks WHERE creature_id = c.id AND name = 'Bite')
             FROM creatures c WHERE c.id = ?1",
                [first],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("null and zero");
        assert_eq!(null_and_zero, (None, 0.0, None));
    }

    #[test]
    fn purchase_relationships_are_independent_and_cascade_only_from_the_deleted_parent() {
        let (mut connection, skill, ability, first_item, second_item) = setup();
        let creature = save_creature_aggregate_in_connection(
            &mut connection,
            input("Horse", skill, ability, &[first_item, second_item]),
        )
        .expect("Horse");
        connection
            .execute(
                "UPDATE creatures SET hp_total = 40 WHERE id = ?1",
                [creature],
            )
            .expect("creature mechanics");
        let prices: (f64, f64) = connection.query_row("SELECT (SELECT cost_credits FROM items WHERE id = ?1), (SELECT cost_credits FROM items WHERE id = ?2)", [first_item, second_item], |row| Ok((row.get(0)?, row.get(1)?))).expect("prices");
        assert_eq!(prices, (500.0, 900.0));
        connection
            .execute(
                "UPDATE items SET cost_credits = 550 WHERE id = ?1",
                [first_item],
            )
            .expect("price");
        let hp: f64 = connection
            .query_row(
                "SELECT hp_total FROM creatures WHERE id = ?1",
                [creature],
                |row| row.get(0),
            )
            .expect("hp");
        assert_eq!(hp, 40.0);

        let mut unlink = input("Horse", skill, ability, &[]);
        unlink.id = Some(creature);
        unlink.core.hp_total = Some(40.0);
        save_creature_aggregate_in_connection(&mut connection, unlink).expect("unlink");
        let parents: (i64, i64, i64) = connection.query_row("SELECT (SELECT COUNT(*) FROM item_creature_links), (SELECT COUNT(*) FROM creatures WHERE id = ?1), (SELECT COUNT(*) FROM items WHERE id IN (?2, ?3))", params![creature, first_item, second_item], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).expect("parents");
        assert_eq!(parents, (0, 1, 2));

        let mut relink = input("Horse", skill, ability, &[first_item]);
        relink.id = Some(creature);
        save_creature_aggregate_in_connection(&mut connection, relink).expect("relink");
        connection
            .execute("DELETE FROM items WHERE id = ?1", [first_item])
            .expect("delete Item");
        let after_item_delete: (i64, i64) = connection.query_row("SELECT (SELECT COUNT(*) FROM item_creature_links), (SELECT COUNT(*) FROM creatures WHERE id = ?1)", [creature], |row| Ok((row.get(0)?, row.get(1)?))).expect("item cascade");
        assert_eq!(after_item_delete, (0, 1));
        connection
            .execute("DELETE FROM creatures WHERE id = ?1", [creature])
            .expect("delete Creature");
        let remaining_items: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM items WHERE id = ?1",
                [second_item],
                |row| row.get(0),
            )
            .expect("remaining Item");
        assert_eq!(remaining_items, 1);
    }

    #[test]
    fn aggregate_save_rolls_back_when_a_child_is_invalid() {
        let (mut connection, skill, ability, first_item, _) = setup();
        let id = save_creature_aggregate_in_connection(
            &mut connection,
            input("Stable", skill, ability, &[first_item]),
        )
        .expect("baseline");
        let mut invalid = input("Changed", skill, ability, &[first_item]);
        invalid.id = Some(id);
        invalid.attributes.push(serde_json::from_value(serde_json::json!({"attributeKey": "energon", "value": 8, "notes": "", "sortOrder": 1})).expect("duplicate attribute"));
        assert!(save_creature_aggregate_in_connection(&mut connection, invalid).is_err());
        let name: String = connection
            .query_row("SELECT name FROM creatures WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .expect("preserved");
        assert_eq!(name, "Stable");
    }
}
