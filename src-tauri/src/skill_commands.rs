use rusqlite::{params, Connection, TransactionBehavior};
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillAggregateInput {
    id: Option<i64>,
    core: SkillCoreInput,
    relationships: Vec<SkillRelationshipInput>,
    extensions: Vec<SkillExtensionInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillCoreInput {
    name: String,
    classification: String,
    tier: Option<i64>,
    primary_attribute: Option<String>,
    secondary_attribute: Option<String>,
    definition: String,
    created_by_user_id: Option<i64>,
    source_system: Option<String>,
    source_external_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillRelationshipInput {
    related_skill_id: i64,
    relationship_type: String,
    sort_order: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillExtensionInput {
    extension_type: String,
    schema_version: i64,
    data_json: String,
}

#[tauri::command]
pub fn save_skill_aggregate(app: AppHandle, input: SaveSkillAggregateInput) -> Result<i64, String> {
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("The local archive path is unavailable: {error}"))?
        .join(DATABASE_FILENAME);
    save_skill_aggregate_at_path(&database_path, input)
}

fn save_skill_aggregate_at_path(
    database_path: &Path,
    input: SaveSkillAggregateInput,
) -> Result<i64, String> {
    let mut connection = Connection::open(database_path)
        .map_err(|error| format!("The local archive could not be opened: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("SQLite foreign-key protection could not be enabled: {error}"))?;
    save_skill_aggregate_in_connection(&mut connection, input)
}

fn save_skill_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveSkillAggregateInput,
) -> Result<i64, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Skill save transaction could not begin: {error}"))?;

    let skill_id = if let Some(skill_id) = input.id {
        let rows_affected = transaction
            .execute(
                "UPDATE skills SET
                   name = ?1,
                   classification = ?2,
                   tier = ?3,
                   primary_attribute = ?4,
                   secondary_attribute = ?5,
                   definition = ?6,
                   created_by_user_id = ?7,
                   source_system = ?8,
                   source_external_id = ?9,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?10",
                params![
                    input.core.name,
                    input.core.classification,
                    input.core.tier,
                    input.core.primary_attribute,
                    input.core.secondary_attribute,
                    input.core.definition,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                    skill_id,
                ],
            )
            .map_err(|error| format!("The Skill record could not be updated: {error}"))?;
        if rows_affected == 0 {
            return Err("The selected Skill no longer exists.".to_string());
        }
        skill_id
    } else {
        transaction
            .execute(
                "INSERT INTO skills (
                   name, classification, tier, primary_attribute, secondary_attribute,
                   definition, created_by_user_id, source_system, source_external_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    input.core.name,
                    input.core.classification,
                    input.core.tier,
                    input.core.primary_attribute,
                    input.core.secondary_attribute,
                    input.core.definition,
                    input.core.created_by_user_id,
                    input.core.source_system,
                    input.core.source_external_id,
                ],
            )
            .map_err(|error| format!("The Skill record could not be created: {error}"))?;
        transaction.last_insert_rowid()
    };

    transaction
        .execute(
            "DELETE FROM skill_relationships WHERE skill_id = ?1",
            [skill_id],
        )
        .map_err(|error| format!("Existing Skill relationships could not be replaced: {error}"))?;
    for relationship in input.relationships {
        transaction
            .execute(
                "INSERT INTO skill_relationships (
                   skill_id, related_skill_id, relationship_type, sort_order
                 ) VALUES (?1, ?2, ?3, ?4)",
                params![
                    skill_id,
                    relationship.related_skill_id,
                    relationship.relationship_type,
                    relationship.sort_order,
                ],
            )
            .map_err(|error| format!("A Skill relationship could not be saved: {error}"))?;
    }

    transaction
        .execute(
            "DELETE FROM skill_extensions WHERE skill_id = ?1",
            [skill_id],
        )
        .map_err(|error| format!("Existing Skill extensions could not be replaced: {error}"))?;
    for extension in input.extensions {
        transaction
            .execute(
                "INSERT INTO skill_extensions (
                   skill_id, extension_type, schema_version, data_json
                 ) VALUES (?1, ?2, ?3, ?4)",
                params![
                    skill_id,
                    extension.extension_type,
                    extension.schema_version,
                    extension.data_json,
                ],
            )
            .map_err(|error| format!("A Skill extension could not be saved: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("The Skill save transaction could not be committed: {error}"))?;
    Ok(skill_id)
}

#[cfg(test)]
mod tests {
    use super::{save_skill_aggregate_in_connection, SaveSkillAggregateInput};
    use rusqlite::Connection;

    const ACCOUNT_MIGRATION: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS_MIGRATION: &str = include_str!("../migrations/0002_create_skills.sql");

    fn input(name: &str) -> SaveSkillAggregateInput {
        serde_json::from_value(serde_json::json!({
            "core": {
                "name": name,
                "classification": "standard",
                "tier": 1,
                "primaryAttribute": "STR",
                "secondaryAttribute": null,
                "definition": "Test definition.",
                "createdByUserId": null,
                "sourceSystem": null,
                "sourceExternalId": null
            },
            "relationships": [],
            "extensions": []
        }))
        .expect("create aggregate input")
    }

    #[test]
    fn command_save_is_atomic_when_a_related_write_fails() {
        let mut connection = Connection::open_in_memory().expect("open test database");
        connection
            .execute_batch(ACCOUNT_MIGRATION)
            .expect("apply account migration");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply skills migration");

        let first_id = save_skill_aggregate_in_connection(&mut connection, input("Athletics"))
            .expect("save first aggregate");
        let mut invalid = input("Invalid Child");
        invalid.relationships.push(
            serde_json::from_value(serde_json::json!({
                "relatedSkillId": 99999,
                "relationshipType": "parent",
                "sortOrder": 0
            }))
            .expect("create invalid relationship"),
        );

        assert!(save_skill_aggregate_in_connection(&mut connection, invalid).is_err());
        let skill_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count Skills after failed aggregate");
        assert_eq!(skill_count, 1, "the failed aggregate must fully roll back");
        assert_eq!(first_id, 1);
    }
}
