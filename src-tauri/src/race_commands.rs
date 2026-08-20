use rusqlite::{params, Connection, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRaceAggregateInput {
    id: Option<i64>,
    core: RaceCoreInput,
    attribute_caps: Vec<RaceAttributeCapInput>,
    movement_modes: Vec<RaceMovementModeInput>,
    skill_links: Vec<RaceSkillLinkInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RaceCoreInput {
    name: String,
    legacy_description: String,
    physical_characteristics: String,
    physical_description: String,
    age_range_text: String,
    age_min: Option<i64>,
    age_max: Option<i64>,
    size: String,
    base_magic: Option<f64>,
    racial_quirk_name: String,
    quirk_success_effect: String,
    quirk_failure_effect: String,
    common_languages_known: String,
    common_archetypes: String,
    genre_examples: String,
    cultural_mindset: String,
    outlook_on_magic: String,
    created_by_user_id: Option<i64>,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RaceAttributeCapInput {
    attribute_key: String,
    max_value: f64,
    sort_order: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RaceMovementModeInput {
    movement_mode: String,
    base_value: f64,
    notes: String,
    sort_order: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RaceSkillLinkInput {
    skill_id: i64,
    link_type: String,
    value: Option<f64>,
    sort_order: i64,
}

#[tauri::command]
pub fn save_race_aggregate(app: AppHandle, input: SaveRaceAggregateInput) -> Result<i64, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("The local archive path is unavailable: {error}"))?
        .join(DATABASE_FILENAME);
    save_race_aggregate_at_path(&database_path, input)
}

fn save_race_aggregate_at_path(
    database_path: &Path,
    input: SaveRaceAggregateInput,
) -> Result<i64, String> {
    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("The local archive could not be opened: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign-key protection could not be enabled: {error}"))?;
    save_race_aggregate_in_connection(&mut connection, input)
}

fn save_race_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveRaceAggregateInput,
) -> Result<i64, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Race save transaction could not begin: {error}"))?;

    let race_id = if let Some(race_id) = input.id {
        let rows_affected = transaction
            .execute(
                "UPDATE races SET
                   name = ?1, legacy_description = ?2, physical_characteristics = ?3,
                   physical_description = ?4, age_range_text = ?5, age_min = ?6,
                   age_max = ?7, size = ?8, base_magic = ?9, racial_quirk_name = ?10,
                   quirk_success_effect = ?11, quirk_failure_effect = ?12,
                   common_languages_known = ?13, common_archetypes = ?14,
                   genre_examples = ?15, cultural_mindset = ?16, outlook_on_magic = ?17,
                   created_by_user_id = ?18, source_system = ?19, source_external_id = ?20,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?21",
                params![
                    input.core.name,
                    input.core.legacy_description,
                    input.core.physical_characteristics,
                    input.core.physical_description,
                    input.core.age_range_text,
                    input.core.age_min,
                    input.core.age_max,
                    input.core.size,
                    input.core.base_magic,
                    input.core.racial_quirk_name,
                    input.core.quirk_success_effect,
                    input.core.quirk_failure_effect,
                    input.core.common_languages_known,
                    input.core.common_archetypes,
                    input.core.genre_examples,
                    input.core.cultural_mindset,
                    input.core.outlook_on_magic,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                    race_id,
                ],
            )
            .map_err(|error| format!("The Race record could not be updated: {error}"))?;
        if rows_affected == 0 {
            return Err("The selected Race no longer exists.".to_string());
        }
        race_id
    } else {
        transaction
            .execute(
                "INSERT INTO races (
                   name, legacy_description, physical_characteristics, physical_description,
                   age_range_text, age_min, age_max, size, base_magic, racial_quirk_name,
                   quirk_success_effect, quirk_failure_effect, common_languages_known,
                   common_archetypes, genre_examples, cultural_mindset, outlook_on_magic,
                   created_by_user_id, source_system, source_external_id
                 ) VALUES (
                   ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                   ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
                 )",
                params![
                    input.core.name,
                    input.core.legacy_description,
                    input.core.physical_characteristics,
                    input.core.physical_description,
                    input.core.age_range_text,
                    input.core.age_min,
                    input.core.age_max,
                    input.core.size,
                    input.core.base_magic,
                    input.core.racial_quirk_name,
                    input.core.quirk_success_effect,
                    input.core.quirk_failure_effect,
                    input.core.common_languages_known,
                    input.core.common_archetypes,
                    input.core.genre_examples,
                    input.core.cultural_mindset,
                    input.core.outlook_on_magic,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                ],
            )
            .map_err(|error| format!("The Race record could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    transaction
        .execute(
            "DELETE FROM race_attribute_caps WHERE race_id = ?1",
            [race_id],
        )
        .map_err(|error| format!("Existing Race attribute caps could not be replaced: {error}"))?;
    for cap in input.attribute_caps {
        transaction
            .execute(
                "INSERT INTO race_attribute_caps (race_id, attribute_key, max_value, sort_order)
                 VALUES (?1, ?2, ?3, ?4)",
                params![race_id, cap.attribute_key, cap.max_value, cap.sort_order],
            )
            .map_err(|error| format!("A Race attribute cap could not be saved: {error}"))?;
    }

    transaction
        .execute(
            "DELETE FROM race_movement_modes WHERE race_id = ?1",
            [race_id],
        )
        .map_err(|error| format!("Existing Race movement modes could not be replaced: {error}"))?;
    for movement in input.movement_modes {
        transaction
            .execute(
                "INSERT INTO race_movement_modes (
                   race_id, movement_mode, base_value, notes, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    race_id,
                    movement.movement_mode,
                    movement.base_value,
                    movement.notes,
                    movement.sort_order,
                ],
            )
            .map_err(|error| format!("A Race movement mode could not be saved: {error}"))?;
    }

    transaction
        .execute("DELETE FROM race_skill_links WHERE race_id = ?1", [race_id])
        .map_err(|error| format!("Existing Race Skill links could not be replaced: {error}"))?;
    for link in input.skill_links {
        if link.link_type.eq_ignore_ascii_case("granted") {
            let classification: String = transaction
                .query_row(
                    "SELECT classification FROM skills WHERE id = ?1",
                    [link.skill_id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("The granted Skill could not be verified: {error}"))?;
            if !classification.eq_ignore_ascii_case("special ability") {
                return Err(
                    "Granted Skills / Racial Abilities must be classified as Special Ability."
                        .to_string(),
                );
            }
        }
        transaction
            .execute(
                "INSERT INTO race_skill_links (
                   race_id, skill_id, link_type, value, sort_order
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    race_id,
                    link.skill_id,
                    link.link_type,
                    link.value,
                    link.sort_order
                ],
            )
            .map_err(|error| format!("A Race Skill link could not be saved: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("The Race save transaction could not be committed: {error}"))?;
    Ok(race_id)
}

#[cfg(test)]
mod tests {
    use super::{save_race_aggregate_in_connection, SaveRaceAggregateInput};
    use rusqlite::Connection;

    const ACCOUNT_MIGRATION: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS_MIGRATION: &str = include_str!("../migrations/0002_create_skills.sql");
    const RACES_MIGRATION: &str = include_str!("../migrations/0005_create_races.sql");

    fn setup() -> (Connection, i64, i64) {
        let connection = Connection::open_in_memory().expect("open test database");
        connection
            .execute_batch(ACCOUNT_MIGRATION)
            .expect("apply accounts");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply Skills");
        connection
            .execute_batch(RACES_MIGRATION)
            .expect("apply Races");
        connection
            .execute(
                "INSERT INTO skills (name, classification) VALUES ('Survival', 'standard')",
                [],
            )
            .expect("insert bonus Skill");
        let bonus_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skills (name, classification) VALUES ('Shift Forms', 'special ability')",
                [],
            )
            .expect("insert granted Skill");
        let granted_skill_id = connection.last_insert_rowid();
        (connection, bonus_skill_id, granted_skill_id)
    }

    fn input(name: &str, bonus_skill_id: i64, granted_skill_id: i64) -> SaveRaceAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core": {
                "name": name,
                "legacyDescription": "Legacy lore.",
                "physicalCharacteristics": "Average humanoid.",
                "physicalDescription": "Varied appearance.",
                "ageRangeText": "15-90",
                "ageMin": 15,
                "ageMax": 90,
                "size": "Medium",
                "baseMagic": 2,
                "racialQuirkName": "Adaptable",
                "quirkSuccessEffect": "Gain insight.",
                "quirkFailureEffect": "No effect.",
                "commonLanguagesKnown": "Common",
                "commonArchetypes": "Generalist",
                "genreExamples": "Fantasy; Sci-Fi",
                "culturalMindset": "Adapt and persist.",
                "outlookOnMagic": "Curious.",
                "createdByUserId": null,
                "sourceSystem": null,
                "sourceExternalId": null
            },
            "attributeCaps": [
                { "attributeKey": "STR", "maxValue": 50, "sortOrder": 0 },
                { "attributeKey": "Energon", "maxValue": 60, "sortOrder": 1 }
            ],
            "movementModes": [
                { "movementMode": "Land", "baseValue": 2, "notes": "", "sortOrder": 0 },
                { "movementMode": "Swim", "baseValue": 4, "notes": "", "sortOrder": 1 }
            ],
            "skillLinks": [
                { "skillId": bonus_skill_id, "linkType": "bonus", "value": 4, "sortOrder": 0 },
                { "skillId": granted_skill_id, "linkType": "granted", "value": null, "sortOrder": 0 }
            ]
        }))
        .expect("create Race aggregate input")
    }

    #[test]
    fn command_creates_and_updates_the_complete_race_aggregate() {
        let (mut connection, bonus_skill_id, granted_skill_id) = setup();
        let race_id = save_race_aggregate_in_connection(
            &mut connection,
            input("Temporary Humanoid", bonus_skill_id, granted_skill_id),
        )
        .expect("save aggregate");

        let counts: (i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM race_attribute_caps WHERE race_id = ?1),
                   (SELECT COUNT(*) FROM race_movement_modes WHERE race_id = ?1),
                   (SELECT COUNT(*) FROM race_skill_links WHERE race_id = ?1)",
                [race_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("load aggregate counts");
        assert_eq!(counts, (2, 2, 2));

        let mut updated = input(
            "Temporary Humanoid Revised",
            bonus_skill_id,
            granted_skill_id,
        );
        updated.id = Some(race_id);
        updated.attribute_caps.truncate(1);
        updated.movement_modes.truncate(1);
        updated.skill_links.truncate(1);
        save_race_aggregate_in_connection(&mut connection, updated).expect("update aggregate");

        let name: String = connection
            .query_row("SELECT name FROM races WHERE id = ?1", [race_id], |row| {
                row.get(0)
            })
            .expect("reload Race");
        assert_eq!(name, "Temporary Humanoid Revised");
        let child_counts: (i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM race_attribute_caps WHERE race_id = ?1),
                   (SELECT COUNT(*) FROM race_movement_modes WHERE race_id = ?1),
                   (SELECT COUNT(*) FROM race_skill_links WHERE race_id = ?1)",
                [race_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("reload child counts");
        assert_eq!(child_counts, (1, 1, 1));
    }

    #[test]
    fn command_rolls_back_every_write_when_a_child_row_fails() {
        let (mut connection, bonus_skill_id, granted_skill_id) = setup();
        let valid_id = save_race_aggregate_in_connection(
            &mut connection,
            input("Existing Race", bonus_skill_id, granted_skill_id),
        )
        .expect("save baseline");

        let mut invalid = input("Changed Name", bonus_skill_id, granted_skill_id);
        invalid.id = Some(valid_id);
        invalid.skill_links[0].skill_id = 999_999;
        assert!(save_race_aggregate_in_connection(&mut connection, invalid).is_err());

        let name: String = connection
            .query_row("SELECT name FROM races WHERE id = ?1", [valid_id], |row| {
                row.get(0)
            })
            .expect("reload rolled-back Race");
        let links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM race_skill_links WHERE race_id = ?1",
                [valid_id],
                |row| row.get(0),
            )
            .expect("reload rolled-back links");
        assert_eq!(name, "Existing Race");
        assert_eq!(links, 2);
    }

    #[test]
    fn duplicate_attribute_caps_are_rejected_without_partial_creation() {
        let (mut connection, bonus_skill_id, granted_skill_id) = setup();
        let mut invalid = input("Duplicate Caps", bonus_skill_id, granted_skill_id);
        invalid.attribute_caps[1].attribute_key = "str".to_string();
        assert!(save_race_aggregate_in_connection(&mut connection, invalid).is_err());
        let race_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM races", [], |row| row.get(0))
            .expect("count Races");
        assert_eq!(race_count, 0);
    }

    #[test]
    fn command_rejects_a_non_special_ability_granted_link() {
        let (mut connection, bonus_skill_id, granted_skill_id) = setup();
        let mut invalid = input("Invalid Grant", bonus_skill_id, granted_skill_id);
        invalid.skill_links[1].skill_id = bonus_skill_id;
        assert!(save_race_aggregate_in_connection(&mut connection, invalid).is_err());
        let race_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM races", [], |row| row.get(0))
            .expect("count Races after invalid granted link");
        assert_eq!(race_count, 0);
    }
}
