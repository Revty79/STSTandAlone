use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";
const CAMPAIGN_SYSTEMS: [&str; 9] = [
    "Tier 1",
    "Tier 2",
    "Tier 3",
    "Spellcraft",
    "Talismanism",
    "Faith",
    "Psyonics",
    "Special Abilities",
    "Bardic Resonance",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCampaignAggregateInput {
    id: Option<i64>,
    core: CampaignCoreInput,
    derived_currencies: Vec<DerivedCurrencyInput>,
    allowed_systems: Vec<String>,
    allowed_race_ids: Vec<i64>,
    inventory_genre_names: Vec<String>,
    inventory_item_ids: Vec<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CampaignCoreInput {
    name: String,
    attribute_points: f64,
    skill_points: f64,
    max_starting_skill: f64,
    points_to_unlock_next_tier: f64,
    max_points_in_skill: f64,
    starting_credit_amount: f64,
    currency_system: String,
    created_by_user_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DerivedCurrencyInput {
    name: String,
    description: String,
    credits_per_unit: f64,
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

fn non_negative(value: f64, label: &str) -> Result<f64, String> {
    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(format!("{label} must be a finite number zero or greater."))
    }
}

fn ensure_unique_i64(values: &[i64], label: &str) -> Result<(), String> {
    let mut seen = HashSet::new();
    if values
        .iter()
        .any(|value| *value <= 0 || !seen.insert(*value))
    {
        return Err(format!("{label} must contain unique saved IDs."));
    }
    Ok(())
}

fn ensure_unique_text(values: &[String], label: &str) -> Result<(), String> {
    let mut seen = HashSet::new();
    for value in values {
        let value = required(value, label)?;
        if !seen.insert(value.to_lowercase()) {
            return Err(format!("{label} cannot contain duplicates."));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_campaign_aggregate(
    app: AppHandle,
    input: SaveCampaignAggregateInput,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    save_campaign_aggregate_in_connection(&mut connection, input)
}

fn save_campaign_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveCampaignAggregateInput,
) -> Result<i64, String> {
    let name = required(&input.core.name, "Campaign Name")?;
    let attribute_points = non_negative(input.core.attribute_points, "Attribute Points")?;
    let skill_points = non_negative(input.core.skill_points, "Skill Points")?;
    let max_starting_skill = non_negative(input.core.max_starting_skill, "Max Starting Skill")?;
    let points_to_unlock_next_tier = non_negative(
        input.core.points_to_unlock_next_tier,
        "Needed to Unlock Next Tier",
    )?;
    let max_points_in_skill =
        non_negative(input.core.max_points_in_skill, "Max Points in a Skill")?;
    let starting_credit_amount =
        non_negative(input.core.starting_credit_amount, "Starting Credit Amount")?;
    if !matches!(
        input.core.currency_system.as_str(),
        "Credits" | "Derived Currency"
    ) {
        return Err("Currency System must be Credits or Derived Currency.".to_string());
    }
    if input.core.created_by_user_id <= 0 {
        return Err("Campaign creator must reference a saved user.".to_string());
    }
    if input.core.currency_system == "Derived Currency" && input.derived_currencies.is_empty() {
        return Err("Derived Currency requires at least one currency entry.".to_string());
    }
    if input.core.currency_system == "Credits" && !input.derived_currencies.is_empty() {
        return Err("Credits campaigns cannot store Derived Currency entries.".to_string());
    }
    ensure_unique_text(&input.allowed_systems, "Allowed Systems")?;
    ensure_unique_i64(&input.allowed_race_ids, "Allowed Races")?;
    ensure_unique_text(&input.inventory_genre_names, "Inventory Genres")?;
    ensure_unique_i64(&input.inventory_item_ids, "Campaign Inventory Items")?;
    for system in &input.allowed_systems {
        if !CAMPAIGN_SYSTEMS.contains(&system.trim()) {
            return Err(format!("Allowed System {system:?} is not supported."));
        }
    }

    let mut normalized_currencies = Vec::with_capacity(input.derived_currencies.len());
    let mut currency_names = HashSet::new();
    for (index, currency) in input.derived_currencies.into_iter().enumerate() {
        let currency_name = required(&currency.name, &format!("Currency {} Name", index + 1))?;
        let description = required(
            &currency.description,
            &format!("Currency {} Description", index + 1),
        )?;
        if !currency.credits_per_unit.is_finite() || currency.credits_per_unit <= 0.0 {
            return Err(format!(
                "Currency {} Credit Value must be a finite number greater than zero.",
                index + 1
            ));
        }
        if !currency_names.insert(currency_name.to_lowercase()) {
            return Err(format!("Currency {currency_name:?} cannot be added twice."));
        }
        normalized_currencies.push((currency_name, description, currency.credits_per_unit));
    }

    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Campaign save transaction could not begin: {error}"))?;
    let campaign_id = if let Some(campaign_id) = input.id {
        let stored_creator: Option<i64> = transaction
            .query_row(
                "SELECT created_by_user_id FROM campaigns WHERE id=?1",
                [campaign_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("The Campaign identity could not be read: {error}"))?;
        let Some(stored_creator) = stored_creator else {
            return Err("The Campaign no longer exists.".to_string());
        };
        if stored_creator != input.core.created_by_user_id {
            return Err("Campaign ownership cannot be changed after creation.".to_string());
        }
        transaction
            .execute(
                "UPDATE campaigns SET name=?1,attribute_points=?2,skill_points=?3,
                 max_starting_skill=?4,points_to_unlock_next_tier=?5,max_points_in_skill=?6,
                 starting_credit_amount=?7,currency_system=?8,
                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?9",
                params![
                    name,
                    attribute_points,
                    skill_points,
                    max_starting_skill,
                    points_to_unlock_next_tier,
                    max_points_in_skill,
                    starting_credit_amount,
                    input.core.currency_system,
                    campaign_id,
                ],
            )
            .map_err(|error| format!("The Campaign core could not be updated: {error}"))?;
        campaign_id
    } else {
        transaction
            .execute(
                "INSERT INTO campaigns (name,attribute_points,skill_points,max_starting_skill,
                 points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
                 currency_system,created_by_user_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    name,
                    attribute_points,
                    skill_points,
                    max_starting_skill,
                    points_to_unlock_next_tier,
                    max_points_in_skill,
                    starting_credit_amount,
                    input.core.currency_system,
                    input.core.created_by_user_id,
                ],
            )
            .map_err(|error| format!("The Campaign core could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    for table in [
        "campaign_derived_currencies",
        "campaign_allowed_systems",
        "campaign_allowed_races",
        "campaign_inventory_tags",
        "campaign_inventory_items",
    ] {
        transaction
            .execute(
                &format!("DELETE FROM {table} WHERE campaign_id=?1"),
                [campaign_id],
            )
            .map_err(|error| {
                format!("Existing Campaign-owned data in {table} could not be replaced: {error}")
            })?;
    }

    for (sort_order, (currency_name, description, credits_per_unit)) in
        normalized_currencies.into_iter().enumerate()
    {
        transaction
            .execute(
                "INSERT INTO campaign_derived_currencies
                 (campaign_id,name,description,credits_per_unit,sort_order)
                 VALUES (?1,?2,?3,?4,?5)",
                params![
                    campaign_id,
                    currency_name,
                    description,
                    credits_per_unit,
                    sort_order as i64
                ],
            )
            .map_err(|error| format!("A Derived Currency could not be saved: {error}"))?;
    }
    for (sort_order, system) in input.allowed_systems.into_iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO campaign_allowed_systems (campaign_id,system_name,sort_order)
                 VALUES (?1,?2,?3)",
                params![campaign_id, system.trim(), sort_order as i64],
            )
            .map_err(|error| format!("An Allowed System could not be saved: {error}"))?;
    }
    for (sort_order, race_id) in input.allowed_race_ids.into_iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO campaign_allowed_races (campaign_id,race_id,sort_order)
                 VALUES (?1,?2,?3)",
                params![campaign_id, race_id, sort_order as i64],
            )
            .map_err(|error| format!("An Allowed Race could not be saved: {error}"))?;
    }
    for (sort_order, tag_name) in input.inventory_genre_names.into_iter().enumerate() {
        let tag_id: Option<i64> = transaction
            .query_row(
                "SELECT id FROM item_tags_catalog WHERE name=?1 COLLATE NOCASE",
                [tag_name.trim()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("Inventory Genre {tag_name:?} could not be read: {error}"))?;
        let Some(tag_id) = tag_id else {
            return Err(format!("Inventory Genre {tag_name:?} is not canonical."));
        };
        transaction
            .execute(
                "INSERT INTO campaign_inventory_tags (campaign_id,tag_id,sort_order)
                 VALUES (?1,?2,?3)",
                params![campaign_id, tag_id, sort_order as i64],
            )
            .map_err(|error| format!("An Inventory Genre could not be linked: {error}"))?;
    }
    for (sort_order, item_id) in input.inventory_item_ids.into_iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO campaign_inventory_items (campaign_id,item_id,sort_order)
                 VALUES (?1,?2,?3)",
                params![campaign_id, item_id, sort_order as i64],
            )
            .map_err(|error| format!("A Campaign Inventory Item could not be linked: {error}"))?;
    }

    transaction.commit().map_err(|error| {
        format!("The Campaign save transaction could not be committed: {error}")
    })?;
    Ok(campaign_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const USERS_MIGRATION: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const RACES_MIGRATION: &str = include_str!("../migrations/0005_create_races.sql");
    const ITEMS_MIGRATION: &str = include_str!("../migrations/0013_create_items.sql");
    const CAMPAIGNS_MIGRATION: &str = include_str!("../migrations/0015_create_campaigns.sql");
    const CAMPAIGN_PLAYERS_MIGRATION: &str =
        include_str!("../migrations/0016_create_campaign_players.sql");
    const CAMPAIGN_CHARACTERS_MIGRATION: &str =
        include_str!("../migrations/0017_create_campaign_characters.sql");

    fn setup() -> (Connection, i64, i64, i64) {
        let connection = Connection::open_in_memory().expect("open database");
        connection
            .execute_batch(USERS_MIGRATION)
            .expect("create users");
        connection
            .execute_batch(RACES_MIGRATION)
            .expect("create races");
        connection
            .execute_batch(ITEMS_MIGRATION)
            .expect("create items");
        connection
            .execute_batch(CAMPAIGNS_MIGRATION)
            .expect("create campaigns");
        connection
            .execute_batch(CAMPAIGN_PLAYERS_MIGRATION)
            .expect("create campaign players");
        connection
            .execute_batch(CAMPAIGN_CHARACTERS_MIGRATION)
            .expect("create campaign characters");
        connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Owner','hash','salt',1)",
                [],
            )
            .expect("insert user");
        let user_id = connection.last_insert_rowid();
        connection
            .execute("INSERT INTO races (name) VALUES ('Human')", [])
            .expect("insert race");
        let race_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO items (canonical_id,name,catalog_scope,equipment_group,record_type,
                 family,category,price_basis) VALUES
                 ('ITEM-0001','Travel Pack','inventory',NULL,'Item','Pack','Gear','each')",
                [],
            )
            .expect("insert item");
        let item_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO item_tags_catalog (canonical_id,name,tag_group,description)
                 VALUES ('TAG-FANTASY','Fantasy','Genre Pack','Fantasy inventory.')",
                [],
            )
            .expect("insert tag");
        (connection, user_id, race_id, item_id)
    }

    fn input(user_id: i64, race_id: i64, item_id: i64) -> SaveCampaignAggregateInput {
        SaveCampaignAggregateInput {
            id: None,
            core: CampaignCoreInput {
                name: "Tidefall".to_string(),
                attribute_points: 50.0,
                skill_points: 100.0,
                max_starting_skill: 35.0,
                points_to_unlock_next_tier: 25.0,
                max_points_in_skill: 75.0,
                starting_credit_amount: 200.0,
                currency_system: "Derived Currency".to_string(),
                created_by_user_id: user_id,
            },
            derived_currencies: vec![
                DerivedCurrencyInput {
                    name: "Penny".to_string(),
                    description: "A copper coin.".to_string(),
                    credits_per_unit: 0.01,
                },
                DerivedCurrencyInput {
                    name: "Dollar".to_string(),
                    description: "Paper currency.".to_string(),
                    credits_per_unit: 1.0,
                },
            ],
            allowed_systems: vec!["Tier 1".to_string(), "Spellcraft".to_string()],
            allowed_race_ids: vec![race_id],
            inventory_genre_names: vec!["Fantasy".to_string()],
            inventory_item_ids: vec![item_id],
        }
    }

    #[test]
    fn saves_and_replaces_the_complete_campaign_in_one_transaction() {
        let (mut connection, user_id, race_id, item_id) = setup();
        let campaign_id = save_campaign_aggregate_in_connection(
            &mut connection,
            input(user_id, race_id, item_id),
        )
        .expect("save campaign");

        for (table, expected) in [
            ("campaigns", 1),
            ("campaign_derived_currencies", 2),
            ("campaign_allowed_systems", 2),
            ("campaign_allowed_races", 1),
            ("campaign_inventory_tags", 1),
            ("campaign_inventory_items", 1),
        ] {
            let count: i64 = connection
                .query_row(
                    &format!("SELECT COUNT(*) FROM {table} WHERE campaign_id=?1"),
                    [campaign_id],
                    |row| row.get(0),
                )
                .or_else(|_| {
                    connection.query_row(
                        "SELECT COUNT(*) FROM campaigns WHERE id=?1",
                        [campaign_id],
                        |row| row.get(0),
                    )
                })
                .expect("count linked rows");
            assert_eq!(count, expected, "unexpected row count for {table}");
        }

        let mut updated = input(user_id, race_id, item_id);
        updated.id = Some(campaign_id);
        updated.core.name = "Tidefall Revised".to_string();
        updated.derived_currencies.truncate(1);
        updated.allowed_systems = vec!["Bardic Resonance".to_string()];
        save_campaign_aggregate_in_connection(&mut connection, updated).expect("update campaign");

        let stored_name: String = connection
            .query_row(
                "SELECT name FROM campaigns WHERE id=?1",
                [campaign_id],
                |row| row.get(0),
            )
            .expect("read campaign");
        let currency_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM campaign_derived_currencies WHERE campaign_id=?1",
                [campaign_id],
                |row| row.get(0),
            )
            .expect("count currencies");
        assert_eq!(stored_name, "Tidefall Revised");
        assert_eq!(currency_count, 1);
    }

    #[test]
    fn rolls_back_the_campaign_when_any_reference_is_invalid() {
        let (mut connection, user_id, race_id, item_id) = setup();
        let mut invalid = input(user_id, race_id, item_id);
        invalid.inventory_item_ids = vec![999_999];
        let error = save_campaign_aggregate_in_connection(&mut connection, invalid)
            .expect_err("reject invalid item link");
        assert!(error.contains("Campaign Inventory Item"));
        let campaign_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM campaigns", [], |row| row.get(0))
            .expect("count campaigns");
        assert_eq!(
            campaign_count, 0,
            "failed aggregate must be fully rolled back"
        );
    }

    #[test]
    fn campaign_players_are_unique_persistent_profile_links() {
        let (mut connection, user_id, race_id, item_id) = setup();
        let campaign_id = save_campaign_aggregate_in_connection(
            &mut connection,
            input(user_id, race_id, item_id),
        )
        .expect("save campaign");
        connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Player Two','hash','salt',1)",
                [],
            )
            .expect("insert second profile");
        let player_id = connection.last_insert_rowid();

        connection
            .execute(
                "INSERT INTO campaign_players (campaign_id,user_id) VALUES (?1,?2)",
                params![campaign_id, player_id],
            )
            .expect("link player to campaign");
        assert!(
            connection
                .execute(
                    "INSERT INTO campaign_players (campaign_id,user_id) VALUES (?1,?2)",
                    params![campaign_id, player_id],
                )
                .is_err(),
            "a profile can only be added to a Campaign once"
        );

        let linked_username: String = connection
            .query_row(
                "SELECT profile.username FROM campaign_players link
                 JOIN users profile ON profile.id=link.user_id
                 WHERE link.campaign_id=?1 AND link.user_id=?2",
                params![campaign_id, player_id],
                |row| row.get(0),
            )
            .expect("reload linked profile");
        assert_eq!(linked_username, "Player Two");

        connection
            .execute("DELETE FROM campaigns WHERE id=?1", [campaign_id])
            .expect("delete campaign");
        let remaining_links: i64 = connection
            .query_row("SELECT COUNT(*) FROM campaign_players", [], |row| {
                row.get(0)
            })
            .expect("count links");
        let remaining_profile: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM users WHERE id=?1",
                [player_id],
                |row| row.get(0),
            )
            .expect("count profiles");
        assert_eq!(remaining_links, 0, "Campaign membership must cascade");
        assert_eq!(remaining_profile, 1, "the profile itself must remain");
    }

    #[test]
    fn a_campaign_player_can_own_multiple_linked_characters() {
        let (mut connection, user_id, race_id, item_id) = setup();
        let campaign_id = save_campaign_aggregate_in_connection(
            &mut connection,
            input(user_id, race_id, item_id),
        )
        .expect("save campaign");
        connection
            .execute(
                "INSERT INTO campaign_players (campaign_id,user_id) VALUES (?1,?2)",
                params![campaign_id, user_id],
            )
            .expect("link player");

        for _ in 0..2 {
            connection
                .execute(
                    "INSERT INTO campaign_characters (campaign_id,player_user_id)
                     VALUES (?1,?2)",
                    params![campaign_id, user_id],
                )
                .expect("create linked character");
        }
        let character_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM campaign_characters
                 WHERE campaign_id=?1 AND player_user_id=?2",
                params![campaign_id, user_id],
                |row| row.get(0),
            )
            .expect("count linked characters");
        assert_eq!(character_count, 2);
        let placeholder_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM campaign_characters
                 WHERE campaign_id=?1 AND player_user_id=?2 AND name='New Character'",
                params![campaign_id, user_id],
                |row| row.get(0),
            )
            .expect("count placeholder Characters");
        assert_eq!(
            placeholder_count, 2,
            "multiple placeholder Characters are allowed"
        );

        connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Not A Campaign Player','hash','salt',1)",
                [],
            )
            .expect("insert unassigned profile");
        let unassigned_profile_id = connection.last_insert_rowid();
        assert!(
            connection
                .execute(
                    "INSERT INTO campaign_characters (campaign_id,player_user_id,name)
                     VALUES (?1,?2,'Unlinked')",
                    params![campaign_id, unassigned_profile_id],
                )
                .is_err(),
            "a Character must belong to a Player assigned to that Campaign"
        );

        connection
            .execute(
                "DELETE FROM campaign_players WHERE campaign_id=?1 AND user_id=?2",
                params![campaign_id, user_id],
            )
            .expect("remove Campaign Player");
        let remaining_characters: i64 = connection
            .query_row("SELECT COUNT(*) FROM campaign_characters", [], |row| {
                row.get(0)
            })
            .expect("count remaining Characters");
        assert_eq!(
            remaining_characters, 0,
            "Characters follow Campaign membership"
        );
    }
}
