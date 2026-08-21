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
    aliases: Vec<ItemAliasInput>,
    weapon_profile: Option<WeaponProfileInput>,
    armor_profile: Option<ArmorProfileInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemAliasInput {
    alias: String,
    notes: String,
    source_reference: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemCoreInput {
    name: String,
    catalog_section: String,
    timeline_tag: String,
    cost_credits: Option<f64>,
    category: String,
    subtype: String,
    weight: Option<f64>,
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
    damage: Option<f64>,
    weapon_effect_description: String,
    weapon_narrative_notes: String,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArmorProfileInput {
    area_covered: String,
    soak: Option<f64>,
    armor_category: String,
    armor_type: String,
    encumbrance_penalty: Option<f64>,
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
        let changed = transaction
            .execute(
                "UPDATE items SET
                   name = ?1, catalog_section = ?2, timeline_tag = ?3, cost_credits = ?4,
                   category = ?5, subtype = ?6, weight = ?7, effect_description = ?8,
                   narrative_variant_notes = ?9, created_by_user_id = ?10,
                   source_system = ?11, source_external_id = ?12,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?13",
                params![
                    input.core.name,
                    input.core.catalog_section,
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
        if changed == 0 {
            return Err("The selected Item no longer exists.".to_string());
        }
        item_id
    } else {
        transaction
            .execute(
                "INSERT INTO items (
                   name, catalog_section, timeline_tag, cost_credits, category, subtype,
                   weight, effect_description, narrative_variant_notes, created_by_user_id,
                   source_system, source_external_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    input.core.name,
                    input.core.catalog_section,
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
                "INSERT INTO item_genre_tags (item_id, genre_tag, sort_order) VALUES (?1, ?2, ?3)",
                params![item_id, genre_tag, sort_order as i64],
            )
            .map_err(|error| format!("An Item Genre Tag could not be saved: {error}"))?;
    }

    transaction
        .execute("DELETE FROM item_aliases WHERE item_id = ?1", [item_id])
        .map_err(|error| format!("Existing Item aliases could not be replaced: {error}"))?;
    for (sort_order, alias) in input.aliases.into_iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO item_aliases (item_id, alias, sort_order, notes, source_reference) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![item_id, alias.alias, sort_order as i64, alias.notes, alias.source_reference],
            )
            .map_err(|error| format!("An Item alias could not be saved: {error}"))?;
    }

    transaction
        .execute(
            "DELETE FROM item_weapon_profiles WHERE item_id = ?1",
            [item_id],
        )
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
        .execute(
            "DELETE FROM item_armor_profiles WHERE item_id = ?1",
            [item_id],
        )
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

    const ACCOUNTS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS: &str = include_str!("../migrations/0002_create_skills.sql");
    const CREATURES: &str = include_str!("../migrations/0007_create_creatures.sql");
    const ITEMS: &str = include_str!("../migrations/0008_create_item_catalog.sql");
    const ITEM_ALIASES: &str = include_str!("../migrations/0011_create_item_aliases.sql");

    fn setup() -> Connection {
        let connection = Connection::open_in_memory().expect("open Item test database");
        connection.execute_batch(ACCOUNTS).expect("accounts");
        connection.execute_batch(SKILLS).expect("skills");
        connection.execute_batch(CREATURES).expect("creatures");
        connection.execute_batch(ITEMS).expect("items");
        connection.execute_batch(ITEM_ALIASES).expect("Item aliases");
        connection
    }

    fn input(name: &str) -> SaveItemAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core": {
                "name": name, "catalogSection": "Equipment", "timelineTag": "Universal",
                "costCredits": null, "category": "Tool", "subtype": "Utility", "weight": 0,
                "effectDescription": "", "narrativeVariantNotes": "", "createdByUserId": null,
                "sourceSystem": null, "sourceExternalId": null
            },
            "genreTags": ["Universal", "Post-Apoc"],
            "aliases": [{ "alias": "Field Implement", "notes": "Alternate name", "sourceReference": "test" }],
            "weaponProfile": {
                "weaponRole": "Improvised", "weaponCategory": "Club", "handedness": "1h",
                "damageType": "Bludgeoning", "rangeType": "Melee", "rangeText": "Close",
                "damage": null, "weaponEffectDescription": "", "weaponNarrativeNotes": "",
                "sourceSystem": null, "sourceExternalId": null
            },
            "armorProfile": {
                "areaCovered": "Arms", "soak": 0, "armorCategory": "Shield", "armorType": "Steel",
                "encumbrancePenalty": null, "armorEffectDescription": "", "armorNarrativeNotes": "",
                "sourceSystem": null, "sourceExternalId": null
            }
        }))
        .expect("deserialize Item")
    }

    #[test]
    fn aggregate_save_allows_duplicate_names_both_profiles_and_null_distinct_from_zero() {
        let mut connection = setup();
        let first =
            save_item_aggregate_in_connection(&mut connection, input("Field Tool")).expect("first");
        let second = save_item_aggregate_in_connection(&mut connection, input("Field Tool"))
            .expect("duplicate");
        assert_ne!(first, second);
        let values: (Option<f64>, f64, Option<f64>, f64, Option<f64>) = connection
            .query_row(
                "SELECT i.cost_credits, i.weight, weapon.damage, armor.soak, armor.encumbrance_penalty
                 FROM items i JOIN item_weapon_profiles weapon ON weapon.item_id = i.id
                 JOIN item_armor_profiles armor ON armor.item_id = i.id WHERE i.id = ?1",
                [first],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            ).expect("nullable values");
        assert_eq!(values, (None, 0.0, None, 0.0, None));
    }

    #[test]
    fn aggregate_save_rolls_back_on_a_child_failure_and_can_remove_profiles() {
        let mut connection = setup();
        let id = save_item_aggregate_in_connection(&mut connection, input("Stable Item"))
            .expect("baseline");
        let mut invalid = input("Changed");
        invalid.id = Some(id);
        invalid.genre_tags = vec!["Fantasy".into(), "Fantasy".into()];
        assert!(save_item_aggregate_in_connection(&mut connection, invalid).is_err());
        let preserved: String = connection
            .query_row("SELECT name FROM items WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .expect("preserved");
        assert_eq!(preserved, "Stable Item");

        let mut update = input("Stable Item");
        update.id = Some(id);
        update.weapon_profile = None;
        save_item_aggregate_in_connection(&mut connection, update).expect("remove profile");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM item_weapon_profiles WHERE item_id = ?1",
                [id],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(count, 0);
    }

    #[test]
    fn source_identity_is_unique_while_display_names_are_not() {
        let mut connection = setup();
        let mut first = input("Canonical Name");
        first.core.source_system = Some("test".into());
        first.core.source_external_id = Some("item:one".into());
        save_item_aggregate_in_connection(&mut connection, first).expect("canonical first");
        let mut duplicate_identity = input("Different Name");
        duplicate_identity.core.source_system = Some("test".into());
        duplicate_identity.core.source_external_id = Some("item:one".into());
        assert!(save_item_aggregate_in_connection(&mut connection, duplicate_identity).is_err());
    }
}
