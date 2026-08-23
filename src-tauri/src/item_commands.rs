use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveItemAggregateInput {
    id: Option<i64>,
    core: ItemCoreInput,
    properties: Vec<ItemPropertyInput>,
    weapon_profile: Option<WeaponProfileInput>,
    armor_profile: Option<ArmorProfileInput>,
    tags: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemCoreInput {
    canonical_id: String,
    name: String,
    catalog_scope: String,
    equipment_group: Option<String>,
    record_type: String,
    family: String,
    category: String,
    subtype: String,
    description: String,
    weight: Option<f64>,
    weight_unit: String,
    size: String,
    durability: Option<f64>,
    credits: Option<f64>,
    price_basis: String,
    parent_item_id: Option<i64>,
    created_by_user_id: Option<i64>,
    source_system: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemPropertyInput {
    property_name: String,
    value: String,
    unit: String,
    related_item_id: Option<i64>,
    related_creature_canonical_id: Option<String>,
    quantity: Option<f64>,
    notes: String,
    sort_order: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeaponProfileInput {
    profile_record_type: String,
    weapon_type: String,
    handedness: String,
    damage_source: String,
    damage: String,
    damage_type: String,
    range: String,
    reach: String,
    ammunition_item_id: Option<i64>,
    compatibility: String,
    capacity: String,
    fire_modes: Vec<String>,
    rate_of_fire: String,
    reload_initiative: String,
    rules_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArmorProfileInput {
    armor_type: String,
    coverage: String,
    base_soak: Option<f64>,
    damage_modifiers_source_text: String,
    damage_modifiers: Vec<ArmorDamageModifierInput>,
    covered_body_location_keys: Vec<String>,
    rules_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArmorDamageModifierInput {
    modifier_text: String,
    damage_type: String,
    modifier: String,
    notes: String,
    sort_order: i64,
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("The local archive path is unavailable: {error}"))?
        .join(DATABASE_FILENAME);
    let connection = Connection::open(database_path)
        .map_err(|error| format!("The local archive could not be opened: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign-key protection could not be enabled: {error}"))?;
    Ok(connection)
}

fn required(value: &str, label: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        Err(format!("{label} is required."))
    } else {
        Ok(value.to_string())
    }
}

fn next_item_canonical_id(transaction: &Transaction<'_>) -> Result<String, String> {
    let mut statement = transaction
        .prepare("SELECT canonical_id FROM items WHERE canonical_id LIKE 'ITEM-%' COLLATE NOCASE")
        .map_err(|error| format!("Item ID availability could not be read: {error}"))?;
    let canonical_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Item IDs could not be scanned: {error}"))?;
    let mut largest = 0_u64;
    for canonical_id in canonical_ids {
        let canonical_id =
            canonical_id.map_err(|error| format!("An Item ID could not be read: {error}"))?;
        let Some(suffix) = canonical_id.get(5..) else {
            continue;
        };
        if !suffix.is_empty() && suffix.chars().all(|character| character.is_ascii_digit()) {
            if let Ok(value) = suffix.parse::<u64>() {
                largest = largest.max(value);
            }
        }
    }
    for sequence in largest.saturating_add(1)..=u64::MAX {
        let candidate = format!("ITEM-{sequence:04}");
        let exists: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM items WHERE canonical_id=?1 COLLATE NOCASE",
                [&candidate],
                |row| row.get(0),
            )
            .map_err(|error| format!("Item ID availability could not be checked: {error}"))?;
        if exists == 0 {
            return Ok(candidate);
        }
    }
    Err("No available canonical Item ID remains.".to_string())
}

#[tauri::command]
pub fn save_item_aggregate(app: AppHandle, input: SaveItemAggregateInput) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    save_item_aggregate_in_connection(&mut connection, input)
}

fn save_item_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveItemAggregateInput,
) -> Result<i64, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Item save transaction could not begin: {error}"))?;
    let name = required(&input.core.name, "Item Name")?;
    let record_type = required(&input.core.record_type, "Record Type")?;
    let family = required(&input.core.family, "Family")?;
    let category = required(&input.core.category, "Category")?;
    let price_basis = required(&input.core.price_basis, "Price Basis")?;
    if input.core.weight.is_some() != !input.core.weight_unit.trim().is_empty() {
        return Err("Weight and Weight Unit must be provided together.".to_string());
    }
    let item_id = if let Some(item_id) = input.id {
        let stored: Option<(String, Option<i64>)> = transaction
            .query_row(
                "SELECT canonical_id,parent_item_id FROM items WHERE id=?1",
                [item_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| format!("The Item identity could not be read: {error}"))?;
        let Some((stored_canonical_id, stored_parent_item_id)) = stored else {
            return Err("The Item no longer exists.".to_string());
        };
        if stored_canonical_id != input.core.canonical_id.trim() {
            return Err(
                "Canonical Item IDs are generated by the system and cannot be changed.".to_string(),
            );
        }
        if stored_parent_item_id != input.core.parent_item_id {
            return Err("Item lineage cannot be changed after creation.".to_string());
        }
        transaction
            .execute(
                "UPDATE items SET name=?1,catalog_scope=?2,equipment_group=?3,record_type=?4,
                 family=?5,category=?6,subtype=?7,description=?8,weight=?9,weight_unit=?10,
                 size=?11,durability=?12,credits=?13,price_basis=?14,created_by_user_id=?15,
                 source_system=?16,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?17",
                params![
                    name,
                    input.core.catalog_scope,
                    input.core.equipment_group,
                    record_type,
                    family,
                    category,
                    input.core.subtype,
                    input.core.description,
                    input.core.weight,
                    input.core.weight_unit,
                    input.core.size,
                    input.core.durability,
                    input.core.credits,
                    price_basis,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    item_id
                ],
            )
            .map_err(|error| format!("The Item core could not be updated: {error}"))?;
        item_id
    } else {
        let canonical_id = next_item_canonical_id(&transaction)?;
        transaction
            .execute(
                "INSERT INTO items (canonical_id,name,catalog_scope,equipment_group,record_type,
                 family,category,subtype,description,weight,weight_unit,size,durability,credits,
                 price_basis,parent_item_id,created_by_user_id,source_system,source_external_id)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,NULL)",
                params![
                    canonical_id,
                    name,
                    input.core.catalog_scope,
                    input.core.equipment_group,
                    record_type,
                    family,
                    category,
                    input.core.subtype,
                    input.core.description,
                    input.core.weight,
                    input.core.weight_unit,
                    input.core.size,
                    input.core.durability,
                    input.core.credits,
                    price_basis,
                    input.core.parent_item_id,
                    input.core.created_by_user_id,
                    input.core.source_system
                ],
            )
            .map_err(|error| format!("The Item core could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    for table in [
        "item_properties",
        "weapon_profiles",
        "item_armor_damage_modifiers",
        "armor_locations",
        "armor_profiles",
        "item_tag_links",
    ] {
        transaction
            .execute(&format!("DELETE FROM {table} WHERE item_id=?1"), [item_id])
            .map_err(|error| {
                format!("Existing Item-owned data in {table} could not be replaced: {error}")
            })?;
    }

    for row in input.properties {
        if row.related_item_id.is_some() && row.related_creature_canonical_id.is_some() {
            return Err("An Item Property cannot link both an Item and a Creature.".to_string());
        }
        transaction.execute(
            "INSERT INTO item_properties (item_id,property_name,value,unit,related_item_id,
             related_creature_canonical_id,quantity,notes,sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![item_id, row.property_name, row.value, row.unit, row.related_item_id,
                row.related_creature_canonical_id, row.quantity, row.notes, row.sort_order],
        ).map_err(|error| format!("An Item Property could not be saved: {error}"))?;
    }
    if let Some(profile) = input.weapon_profile {
        let fire_modes = serde_json::to_string(&profile.fire_modes)
            .map_err(|error| format!("Weapon Fire Modes could not be encoded: {error}"))?;
        transaction.execute(
            "INSERT INTO weapon_profiles (item_id,profile_record_type,weapon_type,handedness,
             damage_source,damage,damage_type,range_text,reach_text,ammunition_item_id,compatibility,
             capacity,fire_modes,rate_of_fire,reload_initiative,rules_text)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
            params![item_id, profile.profile_record_type, profile.weapon_type, profile.handedness,
                profile.damage_source, profile.damage, profile.damage_type, profile.range, profile.reach,
                profile.ammunition_item_id, profile.compatibility, profile.capacity, fire_modes,
                profile.rate_of_fire, profile.reload_initiative, profile.rules_text],
        ).map_err(|error| format!("The Weapon Profile could not be saved: {error}"))?;
    }
    if let Some(profile) = input.armor_profile {
        transaction.execute(
            "INSERT INTO armor_profiles (item_id,armor_type,coverage,base_soak,damage_modifiers_source_text,rules_text)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![item_id, profile.armor_type, profile.coverage, profile.base_soak,
                profile.damage_modifiers_source_text, profile.rules_text],
        ).map_err(|error| format!("The Armor Profile could not be saved: {error}"))?;
        for row in profile.damage_modifiers {
            let modifier_text = if row.modifier_text.trim().is_empty() {
                format!("{} {}", row.damage_type.trim(), row.modifier.trim())
                    .trim()
                    .to_string()
            } else {
                row.modifier_text
            };
            transaction.execute(
                "INSERT INTO item_armor_damage_modifiers (item_id,modifier_text,damage_type,modifier,notes,sort_order)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![item_id, modifier_text, row.damage_type, row.modifier, row.notes, row.sort_order],
            ).map_err(|error| format!("An Armor Damage Modifier could not be saved: {error}"))?;
        }
        for (sort_order, location_code) in
            profile.covered_body_location_keys.into_iter().enumerate()
        {
            transaction.execute(
                "INSERT INTO armor_locations (item_id,location_code,sort_order) VALUES (?1,?2,?3)",
                params![item_id, location_code, sort_order as i64],
            ).map_err(|error| format!("An Armor Location could not be saved: {error}"))?;
        }
    }
    for tag_name in input.tags {
        let tag_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM item_tags_catalog WHERE name=?1 COLLATE NOCASE",
                [&tag_name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("Item Tag {tag_name:?} could not be read: {error}"))?;
        let Some(tag_id) = tag_id else {
            return Err(format!("Item Tag {tag_name:?} is not canonical."));
        };
        transaction
            .execute(
                "INSERT INTO item_tag_links (item_id,tag_id) VALUES (?1,?2)",
                params![item_id, tag_id],
            )
            .map_err(|error| format!("Item Tag {tag_name:?} could not be saved: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("The Item save transaction could not be committed: {error}"))?;
    Ok(item_id)
}

#[tauri::command]
pub fn clone_item_as_variant(
    app: AppHandle,
    parent_item_id: i64,
    variant_name: String,
    user_id: i64,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    clone_item_as_variant_in_connection(&mut connection, parent_item_id, &variant_name, user_id)
}

fn clone_item_as_variant_in_connection(
    connection: &mut Connection,
    parent_item_id: i64,
    variant_name: &str,
    user_id: i64,
) -> Result<i64, String> {
    let variant_name = required(variant_name, "Variant Name")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Item Variant transaction could not begin: {error}"))?;
    let canonical_id = next_item_canonical_id(&transaction)?;
    let created = transaction.execute(
        "INSERT INTO items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,
         subtype,description,weight,weight_unit,size,durability,credits,price_basis,parent_item_id,
         created_by_user_id,source_system,source_external_id)
         SELECT ?1,?2,catalog_scope,equipment_group,record_type,family,category,subtype,description,
                weight,weight_unit,size,durability,credits,price_basis,id,?3,NULL,NULL
         FROM items WHERE id=?4",
        params![canonical_id, variant_name, user_id, parent_item_id],
    ).map_err(|error| format!("The Item Variant could not be created: {error}"))?;
    if created != 1 {
        return Err("The parent Item no longer exists.".to_string());
    }
    let item_id = transaction.last_insert_rowid();
    transaction.execute(
        "INSERT INTO weapon_profiles (item_id,profile_record_type,weapon_type,handedness,damage_source,
         damage,damage_type,range_text,reach_text,ammunition_item_id,compatibility,capacity,fire_modes,
         rate_of_fire,reload_initiative,rules_text)
         SELECT ?1,profile_record_type,weapon_type,handedness,damage_source,damage,damage_type,range_text,
                reach_text,ammunition_item_id,compatibility,capacity,fire_modes,rate_of_fire,reload_initiative,rules_text
         FROM weapon_profiles WHERE item_id=?2",
        params![item_id, parent_item_id],
    ).map_err(|error| format!("Variant Weapon Profile could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO armor_profiles (item_id,armor_type,coverage,base_soak,damage_modifiers_source_text,rules_text)
         SELECT ?1,armor_type,coverage,base_soak,damage_modifiers_source_text,rules_text FROM armor_profiles WHERE item_id=?2",
        params![item_id, parent_item_id],
    ).map_err(|error| format!("Variant Armor Profile could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO item_armor_damage_modifiers (item_id,modifier_text,damage_type,modifier,notes,sort_order)
         SELECT ?1,modifier_text,damage_type,modifier,notes,sort_order FROM item_armor_damage_modifiers WHERE item_id=?2",
        params![item_id, parent_item_id],
    ).map_err(|error| format!("Variant Armor Damage Modifiers could not be copied: {error}"))?;
    transaction
        .execute(
            "INSERT INTO armor_locations (item_id,location_code,sort_order)
         SELECT ?1,location_code,sort_order FROM armor_locations WHERE item_id=?2",
            params![item_id, parent_item_id],
        )
        .map_err(|error| format!("Variant Armor Locations could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO item_properties (item_id,property_name,value,unit,related_item_id,related_creature_canonical_id,quantity,notes,sort_order)
         SELECT ?1,property_name,value,unit,related_item_id,related_creature_canonical_id,quantity,notes,sort_order
         FROM item_properties WHERE item_id=?2",
        params![item_id, parent_item_id],
    ).map_err(|error| format!("Variant Properties could not be copied: {error}"))?;
    transaction.execute(
        "INSERT INTO item_tag_links (item_id,tag_id) SELECT ?1,tag_id FROM item_tag_links WHERE item_id=?2",
        params![item_id, parent_item_id],
    ).map_err(|error| format!("Variant Tags could not be copied: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("The Item Variant could not be committed: {error}"))?;
    Ok(item_id)
}

#[cfg(test)]
mod tests {
    use super::{
        clone_item_as_variant_in_connection, save_item_aggregate_in_connection,
        SaveItemAggregateInput,
    };
    use rusqlite::Connection;

    const ACCOUNTS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const ITEMS: &str = include_str!("../migrations/0013_create_items.sql");
    const ITEM_SEED: &str = include_str!("../migrations/0014_seed_item_catalog.sql");

    fn setup_schema() -> Connection {
        let connection = Connection::open_in_memory().expect("open database");
        connection.execute_batch(ACCOUNTS).expect("accounts");
        connection.execute_batch("CREATE TABLE creatures (id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE, canonical_name TEXT NOT NULL, family TEXT NOT NULL DEFAULT '', creature_type TEXT NOT NULL DEFAULT '');").expect("minimal Creature contract");
        connection.execute_batch(ITEMS).expect("items");
        connection.execute("INSERT INTO users (username,password_hash,password_salt,password_iterations) VALUES ('Owner','hash','salt',1)", []).expect("owner");
        connection
    }

    fn draft(name: &str) -> SaveItemAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core":{"canonicalId":"","name":name,"catalogScope":"inventory","equipmentGroup":null,
              "recordType":"Item","family":"Test","category":"Test","subtype":"","description":"",
              "weight":null,"weightUnit":"","size":"","durability":null,"credits":1,"priceBasis":"each",
              "parentItemId":null,"parentItemName":null,"createdByUserId":1,"sourceSystem":null},
            "properties":[{"propertyName":"Capacity","value":"1","unit":"","quantity":null,"relationKind":"none",
              "relatedItemId":null,"relatedItemName":null,"relatedCreatureCanonicalId":null,"relatedCreatureName":null,
              "notes":"","sortOrder":0}],
            "weaponProfile":{"profileRecordType":"Item","weaponType":"Tool","handedness":"One-Handed","damageSource":"Weapon",
              "damage":"4","damageType":"Bludgeoning","range":"","reach":"5 ft","ammunitionItemId":null,"ammunitionItemName":null,
              "compatibility":"","capacity":"1 charge","fireModes":["Single"],"rateOfFire":"1 use per attack",
              "reloadInitiative":"1 per round","rulesText":""},
            "armorProfile":null,"tags":[],"variants":[]
        })).expect("draft")
    }

    #[test]
    fn canonical_seed_reconciles_and_preserves_cross_system_examples() {
        let connection = setup_schema();
        for canonical_id in ["CR-CAMEL", "CR-CAT", "CR-DOG", "CR-FALCON", "CR-HORSE"] {
            connection
                .execute(
                    "INSERT INTO creatures (canonical_id,canonical_name) VALUES (?1,?1)",
                    [canonical_id],
                )
                .expect("Creature reference");
        }
        connection
            .execute_batch(ITEM_SEED)
            .expect("canonical Item seed");
        let counts: (i64,i64,i64,i64,i64,i64,i64,i64,i64) = connection.query_row(
            "SELECT (SELECT COUNT(*) FROM items),(SELECT COUNT(*) FROM items WHERE catalog_scope='equipment'),
             (SELECT COUNT(*) FROM items WHERE catalog_scope='inventory'),(SELECT COUNT(*) FROM weapon_profiles),
             (SELECT COUNT(*) FROM armor_profiles),(SELECT COUNT(*) FROM item_properties),
             (SELECT COUNT(*) FROM item_tag_links),(SELECT COUNT(*) FROM armor_locations),
             (SELECT COUNT(*) FROM item_armor_damage_modifiers)", [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?,row.get(7)?,row.get(8)?)),
        ).expect("counts");
        assert_eq!(counts, (1007, 494, 513, 221, 47, 252, 1242, 204, 128));
        let ammunition_inventory: i64 = connection.query_row(
            "SELECT COUNT(*) FROM items item JOIN weapon_profiles profile ON profile.item_id=item.id WHERE item.catalog_scope='inventory' AND item.record_type='Ammunition'", [], |row| row.get(0)
        ).expect("ammunition");
        assert_eq!(ammunition_inventory, 17);
    }

    #[test]
    fn saves_atomically_with_program_id_and_clones_complete_variant() {
        let mut connection = setup_schema();
        let parent_id =
            save_item_aggregate_in_connection(&mut connection, draft("Test Tool")).expect("save");
        let parent_canonical: String = connection
            .query_row(
                "SELECT canonical_id FROM items WHERE id=?1",
                [parent_id],
                |row| row.get(0),
            )
            .expect("id");
        assert_eq!(parent_canonical, "ITEM-0001");
        let variant_id =
            clone_item_as_variant_in_connection(&mut connection, parent_id, "Test Tool Variant", 1)
                .expect("variant");
        let variant: (String,i64,i64,i64) = connection.query_row(
            "SELECT canonical_id,parent_item_id,(SELECT COUNT(*) FROM weapon_profiles WHERE item_id=items.id),(SELECT COUNT(*) FROM item_properties WHERE item_id=items.id) FROM items WHERE id=?1",
            [variant_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)),
        ).expect("variant aggregate");
        assert_eq!(variant, ("ITEM-0002".into(), parent_id, 1, 1));
    }

    #[test]
    fn failed_child_write_rolls_back_the_complete_item_and_identity_is_immutable() {
        let mut connection = setup_schema();
        let item_id = save_item_aggregate_in_connection(&mut connection, draft("Original"))
            .expect("baseline");
        let mut changed = draft("Changed");
        changed.id = Some(item_id);
        changed.core.canonical_id = "ITEM-0001".into();
        changed.tags = vec!["Not A Canonical Tag".into()];
        assert!(save_item_aggregate_in_connection(&mut connection, changed).is_err());
        let stored_name: String = connection
            .query_row("SELECT name FROM items WHERE id=?1", [item_id], |row| {
                row.get(0)
            })
            .expect("stored name");
        assert_eq!(stored_name, "Original");

        let mut changed_identity = draft("Original");
        changed_identity.id = Some(item_id);
        changed_identity.core.canonical_id = "ITEM-9999".into();
        let error = save_item_aggregate_in_connection(&mut connection, changed_identity)
            .expect_err("immutable ID");
        assert!(error.contains("generated by the system"));
    }

    #[test]
    fn saved_item_survives_a_database_reopen_and_schema_has_no_runtime_inventory() {
        let database_path = std::env::temp_dir().join(format!(
            "serrian-tide-item-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let item_id;
        {
            let mut connection = Connection::open(&database_path).expect("open file database");
            connection.execute_batch(ACCOUNTS).expect("accounts");
            connection.execute_batch("CREATE TABLE creatures (id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_id TEXT NOT NULL UNIQUE COLLATE NOCASE, canonical_name TEXT NOT NULL, family TEXT NOT NULL DEFAULT '', creature_type TEXT NOT NULL DEFAULT '');").expect("Creature contract");
            connection.execute_batch(ITEMS).expect("items");
            connection.execute("INSERT INTO users (username,password_hash,password_salt,password_iterations) VALUES ('Owner','hash','salt',1)", []).expect("owner");
            item_id = save_item_aggregate_in_connection(&mut connection, draft("Persistent Item"))
                .expect("save");
            let runtime_tables: i64 = connection.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name LIKE '%owned%' OR name LIKE '%player_inventory%' OR name LIKE '%equipped%' OR name LIKE '%loot%')",
                [], |row| row.get(0),
            ).expect("runtime table audit");
            assert_eq!(runtime_tables, 0);
        }
        {
            let connection = Connection::open(&database_path).expect("reopen file database");
            let stored: (String, String) = connection
                .query_row(
                    "SELECT canonical_id,name FROM items WHERE id=?1",
                    [item_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .expect("persisted Item");
            assert_eq!(stored, ("ITEM-0001".into(), "Persistent Item".into()));
        }
        std::fs::remove_file(&database_path).expect("remove test database");
    }
}
