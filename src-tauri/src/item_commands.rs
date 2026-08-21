use rusqlite::{params, Connection, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveItemAggregateInput {
    id: Option<i64>,
    core: ItemCoreInput,
    genre_tags: Vec<String>,
    weapon_profile: Option<WeaponProfileInput>,
    armor_profile: Option<ArmorProfileInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemCoreInput {
    name: String,
    catalog_scope: String,
    timeline_tag: String,
    cost_credits: f64,
    category: String,
    subtype: String,
    weight: f64,
    effect_description: String,
    narrative_variant_notes: String,
    created_by_user_id: Option<i64>,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeaponProfileInput {
    weapon_role: String,
    weapon_category: String,
    handedness: String,
    damage_type: String,
    range_type: String,
    range_text: String,
    damage: f64,
    weapon_effect_description: String,
    weapon_narrative_notes: String,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArmorProfileInput {
    area_covered: String,
    soak: f64,
    armor_category: String,
    armor_type: String,
    encumbrance_penalty: f64,
    armor_effect_description: String,
    armor_narrative_notes: String,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[tauri::command]
pub fn save_item_aggregate(app: AppHandle, input: SaveItemAggregateInput) -> Result<i64, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("The local archive path is unavailable: {error}"))?
        .join(DATABASE_FILENAME);
    save_item_aggregate_at_path(&database_path, input)
}

fn save_item_aggregate_at_path(
    database_path: &Path,
    input: SaveItemAggregateInput,
) -> Result<i64, String> {
    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("The local archive could not be opened: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign-key protection could not be enabled: {error}"))?;
    save_item_aggregate_in_connection(&mut connection, input)
}

fn save_item_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveItemAggregateInput,
) -> Result<i64, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Item save transaction could not begin: {error}"))?;

    let item_id = if let Some(item_id) = input.id {
        let rows_affected = transaction
            .execute(
                "UPDATE items SET
                   name = ?1, catalog_scope = ?2, timeline_tag = ?3,
                   cost_credits = ?4, category = ?5, subtype = ?6, weight = ?7,
                   effect_description = ?8, narrative_variant_notes = ?9,
                   created_by_user_id = ?10, source_system = ?11, source_external_id = ?12,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?13",
                params![
                    input.core.name,
                    input.core.catalog_scope,
                    input.core.timeline_tag,
                    input.core.cost_credits,
                    input.core.category,
                    input.core.subtype,
                    input.core.weight,
                    input.core.effect_description,
                    input.core.narrative_variant_notes,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                    item_id,
                ],
            )
            .map_err(|error| format!("The Item record could not be updated: {error}"))?;
        if rows_affected == 0 {
            return Err("The selected Item no longer exists.".to_string());
        }
        item_id
    } else {
        transaction
            .execute(
                "INSERT INTO items (
                   name, catalog_scope, timeline_tag, cost_credits, category, subtype,
                   weight, effect_description, narrative_variant_notes, created_by_user_id,
                   source_system, source_external_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    input.core.name,
                    input.core.catalog_scope,
                    input.core.timeline_tag,
                    input.core.cost_credits,
                    input.core.category,
                    input.core.subtype,
                    input.core.weight,
                    input.core.effect_description,
                    input.core.narrative_variant_notes,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                ],
            )
            .map_err(|error| format!("The Item record could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    transaction
        .execute("DELETE FROM item_genre_tags WHERE item_id = ?1", [item_id])
        .map_err(|error| format!("Existing Item Genre Tags could not be replaced: {error}"))?;
    for (sort_order, genre_tag) in input.genre_tags.into_iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO item_genre_tags (item_id, genre_tag, sort_order)
                 VALUES (?1, ?2, ?3)",
                params![item_id, genre_tag, sort_order as i64],
            )
            .map_err(|error| format!("An Item Genre Tag could not be saved: {error}"))?;
    }

    transaction
        .execute("DELETE FROM item_weapon_profiles WHERE item_id = ?1", [item_id])
        .map_err(|error| format!("The existing Weapon Profile could not be replaced: {error}"))?;
    if let Some(profile) = input.weapon_profile {
        transaction
            .execute(
                "INSERT INTO item_weapon_profiles (
                   item_id, weapon_role, weapon_category, handedness, damage_type,
                   range_type, range_text, damage, weapon_effect_description,
                   weapon_narrative_notes, source_system, source_external_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    item_id,
                    profile.weapon_role,
                    profile.weapon_category,
                    profile.handedness,
                    profile.damage_type,
                    profile.range_type,
                    profile.range_text,
                    profile.damage,
                    profile.weapon_effect_description,
                    profile.weapon_narrative_notes,
                    profile.source_system,
                    profile.source_external_id,
                ],
            )
            .map_err(|error| format!("The Weapon Profile could not be saved: {error}"))?;
    }

    transaction
        .execute("DELETE FROM item_armor_profiles WHERE item_id = ?1", [item_id])
        .map_err(|error| format!("The existing Armor Profile could not be replaced: {error}"))?;
    if let Some(profile) = input.armor_profile {
        transaction
            .execute(
                "INSERT INTO item_armor_profiles (
                   item_id, area_covered, soak, armor_category, armor_type,
                   encumbrance_penalty, armor_effect_description, armor_narrative_notes,
                   source_system, source_external_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    item_id,
                    profile.area_covered,
                    profile.soak,
                    profile.armor_category,
                    profile.armor_type,
                    profile.encumbrance_penalty,
                    profile.armor_effect_description,
                    profile.armor_narrative_notes,
                    profile.source_system,
                    profile.source_external_id,
                ],
            )
            .map_err(|error| format!("The Armor Profile could not be saved: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("The Item save transaction could not be committed: {error}"))?;
    Ok(item_id)
}

#[cfg(test)]
mod tests {
    use super::{save_item_aggregate_in_connection, SaveItemAggregateInput};
    use rusqlite::Connection;

    const ACCOUNT_MIGRATION: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const ITEM_MIGRATION: &str = include_str!("../migrations/0007_create_item_catalog.sql");

    fn setup() -> Connection {
        let connection = Connection::open_in_memory().expect("open Item test database");
        connection.execute_batch(ACCOUNT_MIGRATION).expect("apply accounts");
        connection.execute_batch(ITEM_MIGRATION).expect("apply Item schema");
        connection
    }

    fn input(name: &str) -> SaveItemAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core": {
                "name": name,
                "catalogScope": "equipment",
                "timelineTag": "Universal",
                "costCredits": 25,
                "category": "Tool",
                "subtype": "Utility",
                "weight": 5,
                "effectDescription": "+5% utility",
                "narrativeVariantNotes": "A durable field tool.",
                "createdByUserId": null,
                "sourceSystem": null,
                "sourceExternalId": null
            },
            "genreTags": ["Universal", "Post-Apoc"],
            "weaponProfile": {
                "weaponRole": "improvised",
                "weaponCategory": "Club",
                "handedness": "1h",
                "damageType": "Bludgeoning",
                "rangeType": "Melee",
                "rangeText": "Close",
                "damage": 6,
                "weaponEffectDescription": "Tool that doubles as weapon.",
                "weaponNarrativeNotes": "Heavy steel.",
                "sourceSystem": null,
                "sourceExternalId": null
            },
            "armorProfile": {
                "areaCovered": "Arms",
                "soak": 2,
                "armorCategory": "Shield",
                "armorType": "Steel",
                "encumbrancePenalty": -1,
                "armorEffectDescription": "Block +10%",
                "armorNarrativeNotes": "Can protect or strike.",
                "sourceSystem": null,
                "sourceExternalId": null
            }
        }))
        .expect("deserialize Item input")
    }

    #[test]
    fn aggregate_save_supports_duplicate_names_both_profiles_and_profile_removal() {
        let mut connection = setup();
        let first_id = save_item_aggregate_in_connection(&mut connection, input("Field Tool"))
            .expect("create Item with both profiles");
        let second_id = save_item_aggregate_in_connection(&mut connection, input("Field Tool"))
            .expect("duplicate display name remains valid");
        assert_ne!(first_id, second_id);

        let counts: (i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM items WHERE name = 'Field Tool'),
                   (SELECT COUNT(*) FROM item_genre_tags WHERE item_id = ?1),
                   (SELECT COUNT(*) FROM item_weapon_profiles WHERE item_id = ?1),
                   (SELECT COUNT(*) FROM item_armor_profiles WHERE item_id = ?1)",
                [first_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("count saved Item aggregate");
        assert_eq!(counts, (2, 2, 1, 1));

        let mut update = input("Field Tool Revised");
        update.id = Some(first_id);
        update.core.catalog_scope = "inventory".to_string();
        update.weapon_profile = None;
        save_item_aggregate_in_connection(&mut connection, update).expect("remove Weapon Profile");
        let after: (String, i64, i64) = connection
            .query_row(
                "SELECT i.catalog_scope,
                   (SELECT COUNT(*) FROM item_weapon_profiles WHERE item_id = i.id),
                   (SELECT COUNT(*) FROM item_armor_profiles WHERE item_id = i.id)
                 FROM items i WHERE i.id = ?1",
                [first_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("reload Item after profile removal");
        assert_eq!(after, ("inventory".to_string(), 0, 1));
    }

    #[test]
    fn aggregate_save_rolls_back_every_change_when_a_child_write_fails() {
        let mut connection = setup();
        let item_id = save_item_aggregate_in_connection(&mut connection, input("Stable Item"))
            .expect("create stable Item");
        let mut invalid = input("Should Roll Back");
        invalid.id = Some(item_id);
        invalid.genre_tags = vec!["Fantasy".to_string(), "fantasy".to_string()];
        assert!(save_item_aggregate_in_connection(&mut connection, invalid).is_err());

        let preserved: String = connection
            .query_row("SELECT name FROM items WHERE id = ?1", [item_id], |row| row.get(0))
            .expect("reload rolled-back Item");
        let preserved_profiles: (i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM item_weapon_profiles WHERE item_id = ?1),
                   (SELECT COUNT(*) FROM item_armor_profiles WHERE item_id = ?1)",
                [item_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("count preserved profiles");
        assert_eq!(preserved, "Stable Item");
        assert_eq!(preserved_profiles, (1, 1));
    }

    #[test]
    fn deleting_an_item_cascades_profiles_and_genres_only() {
        let mut connection = setup();
        let item_id = save_item_aggregate_in_connection(&mut connection, input("Disposable Item"))
            .expect("create disposable Item");
        connection.execute("DELETE FROM items WHERE id = ?1", [item_id]).expect("delete Item");
        let children: (i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM item_genre_tags WHERE item_id = ?1),
                   (SELECT COUNT(*) FROM item_weapon_profiles WHERE item_id = ?1),
                   (SELECT COUNT(*) FROM item_armor_profiles WHERE item_id = ?1)",
                [item_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("count cascaded Item children");
        assert_eq!(children, (0, 0, 0));
    }
}
