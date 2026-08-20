use tauri_plugin_sql::{Migration, MigrationKind};

mod race_commands;
mod skill_commands;

const DATABASE_URL: &str = "sqlite:serrian-tide.db";
const INITIAL_ACCOUNT_MIGRATION: &str =
    include_str!("../migrations/0001_create_local_accounts.sql");
const SKILLS_MIGRATION: &str = include_str!("../migrations/0002_create_skills.sql");
const SKILL_CATALOG_MIGRATION: &str = include_str!("../migrations/0003_seed_skill_catalog.sql");
const SPELL_CONSTRUCTION_MIGRATION: &str =
    include_str!("../migrations/0004_seed_spell_construction.sql");
const RACES_MIGRATION: &str = include_str!("../migrations/0005_create_races.sql");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_local_accounts",
            sql: INITIAL_ACCOUNT_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_skills",
            sql: SKILLS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "seed_skill_catalog",
            sql: SKILL_CATALOG_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "seed_spell_construction",
            sql: SPELL_CONSTRUCTION_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_races",
            sql: RACES_MIGRATION,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            race_commands::save_race_aggregate,
            skill_commands::save_skill_aggregate
        ])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        INITIAL_ACCOUNT_MIGRATION, RACES_MIGRATION, SKILLS_MIGRATION, SKILL_CATALOG_MIGRATION,
        SPELL_CONSTRUCTION_MIGRATION,
    };
    use rusqlite::{params, Connection};

    #[test]
    fn account_migration_enforces_identity_role_and_foreign_key_rules() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("apply initial account migration");

        connection
            .execute(
                "INSERT INTO users (username, password_hash, password_salt, password_iterations) \
                 VALUES (?1, ?2, ?3, ?4)",
                params!["Brannan", "derived-hash", "unique-salt", 310_000],
            )
            .expect("insert first user");
        let user_id = connection.last_insert_rowid();

        let duplicate_username = connection.execute(
            "INSERT INTO users (username, password_hash, password_salt, password_iterations) \
             VALUES (?1, ?2, ?3, ?4)",
            params!["brannan", "another-hash", "another-salt", 310_000],
        );
        assert!(duplicate_username.is_err(), "usernames must ignore case");

        connection
            .execute(
                "INSERT INTO user_roles (user_id, role) VALUES (?1, 'god'), (?1, 'player')",
                [user_id],
            )
            .expect("assign both owner roles");

        let duplicate_role = connection.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?1, 'god')",
            [user_id],
        );
        assert!(duplicate_role.is_err(), "roles must be unique per user");

        let invalid_role = connection.execute(
            "INSERT INTO user_roles (user_id, role) VALUES (?1, 'overlord')",
            [user_id],
        );
        assert!(invalid_role.is_err(), "only known roles are valid");

        connection
            .execute("DELETE FROM users WHERE id = ?1", [user_id])
            .expect("delete user");
        let remaining_roles: i64 = connection
            .query_row("SELECT COUNT(*) FROM user_roles", [], |row| row.get(0))
            .expect("count remaining roles");
        assert_eq!(
            remaining_roles, 0,
            "roles must cascade when a user is deleted"
        );
    }

    #[test]
    fn skills_migration_preserves_users_and_enforces_the_skill_aggregate() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("apply account migration");
        connection
            .execute(
                "INSERT INTO users (username, password_hash, password_salt, password_iterations) \
                 VALUES (?1, ?2, ?3, ?4)",
                params!["ExistingOwner", "derived-hash", "unique-salt", 310_000],
            )
            .expect("insert existing user before migration 0002");
        let user_id = connection.last_insert_rowid();

        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply skills migration after accounts");

        let surviving_users: i64 = connection
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
            .expect("count users after migration");
        assert_eq!(
            surviving_users, 1,
            "existing profiles must survive migration"
        );

        connection
            .execute(
                "INSERT INTO skills (name, classification, tier, primary_attribute, definition, created_by_user_id) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params!["Athletics", "standard", 1, "Strength", "Physical training.", user_id],
            )
            .expect("insert a persisted skill");
        let athletics_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skills (name, classification) VALUES (?1, ?2)",
                params!["Running", "standard"],
            )
            .expect("insert a related skill");
        let running_id = connection.last_insert_rowid();

        connection
            .execute(
                "UPDATE skills SET definition = ?1 WHERE id = ?2",
                params!["Updated physical training.", athletics_id],
            )
            .expect("update skill");
        let definition: String = connection
            .query_row(
                "SELECT definition FROM skills WHERE id = ?1",
                [athletics_id],
                |row| row.get(0),
            )
            .expect("reload updated skill");
        assert_eq!(definition, "Updated physical training.");

        connection
            .execute(
                "INSERT INTO skill_relationships (skill_id, related_skill_id, relationship_type, sort_order) \
                 VALUES (?1, ?2, 'parent', 0)",
                params![running_id, athletics_id],
            )
            .expect("persist relationship");
        assert!(
            connection
                .execute(
                    "INSERT INTO skill_relationships (skill_id, related_skill_id, relationship_type) \
                     VALUES (?1, ?2, 'parent')",
                    params![running_id, athletics_id],
                )
                .is_err(),
            "duplicate relationships must be rejected"
        );
        assert!(
            connection
                .execute(
                    "INSERT INTO skill_relationships (skill_id, related_skill_id, relationship_type) \
                     VALUES (?1, ?1, 'parent')",
                    [athletics_id],
                )
                .is_err(),
            "self relationships must be rejected"
        );

        connection
            .execute(
                "INSERT INTO skill_extensions (skill_id, extension_type, schema_version, data_json) \
                 VALUES (?1, 'spell-construction', 5, ?2)",
                params![athletics_id, r#"{"schemaVersion":5,"id":"spell-test"}"#],
            )
            .expect("persist versioned extension data");

        connection
            .execute("DELETE FROM skills WHERE id = ?1", [athletics_id])
            .expect("delete selected skill");
        let remaining_relationships: i64 = connection
            .query_row("SELECT COUNT(*) FROM skill_relationships", [], |row| {
                row.get(0)
            })
            .expect("count relationships after delete");
        let remaining_extensions: i64 = connection
            .query_row("SELECT COUNT(*) FROM skill_extensions", [], |row| {
                row.get(0)
            })
            .expect("count extensions after delete");
        let remaining_skills: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count skills after delete");
        assert_eq!(remaining_relationships, 0);
        assert_eq!(remaining_extensions, 0);
        assert_eq!(remaining_skills, 1, "connected skills must not be deleted");
    }

    #[test]
    fn skill_library_queries_stay_bounded_and_use_the_filter_index() {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("apply account migration");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply skills migration");

        let transaction = connection.transaction().expect("start seed transaction");
        {
            let mut insert = transaction
                .prepare(
                    "INSERT INTO skills (name, classification, tier, primary_attribute) \
                     VALUES (?1, ?2, ?3, ?4)",
                )
                .expect("prepare bulk skill insert");
            for index in 0..2_000 {
                insert
                    .execute(params![
                        format!("Skill {index:04}"),
                        if index % 3 == 0 { "spell" } else { "standard" },
                        (index % 3) + 1,
                        if index % 2 == 0 {
                            "Strength"
                        } else {
                            "Agility"
                        },
                    ])
                    .expect("insert bulk skill");
            }
        }
        transaction.commit().expect("commit bulk skills");

        let result_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM (\
                   SELECT id FROM skills \
                   WHERE classification = 'spell' COLLATE NOCASE \
                   ORDER BY name COLLATE NOCASE, id LIMIT 40 OFFSET 0\
                 )",
                [],
                |row| row.get(0),
            )
            .expect("run bounded library page query");
        assert_eq!(result_count, 40, "a library page must remain bounded");

        let plan: String = connection
            .query_row(
                "EXPLAIN QUERY PLAN \
                 SELECT id FROM skills \
                 WHERE classification = 'spell' COLLATE NOCASE \
                 ORDER BY name COLLATE NOCASE, id LIMIT 40 OFFSET 0",
                [],
                |row| row.get(3),
            )
            .expect("inspect classification query plan");
        assert!(
            plan.contains("idx_skills_classification"),
            "classification paging should use its compound index; plan was: {plan}"
        );
    }

    #[test]
    fn catalog_migration_seeds_complete_idempotent_skill_tree() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("apply account migration");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply skills migration");
        connection
            .execute(
                "INSERT INTO skills (name, classification, tier, primary_attribute, definition) \
                 VALUES ('Load-Bearing', 'custom', 1, 'STR', 'User-authored version.')",
                [],
            )
            .expect("insert user Skill with a canonical display name");

        connection
            .execute_batch(SKILL_CATALOG_MIGRATION)
            .expect("seed canonical Skill catalog");

        let canonical_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE source_system = 'serrian-tide-core'",
                [],
                |row| row.get(0),
            )
            .expect("count canonical Skills");
        let canonical_relationships: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_relationships relationship \
                 JOIN skills child ON child.id = relationship.skill_id \
                 WHERE child.source_system = 'serrian-tide-core' \
                   AND relationship.relationship_type = 'parent' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("count canonical parent relationships");
        let spell_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills \
                 WHERE source_system = 'serrian-tide-core' \
                   AND classification = 'spell' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("count spell Skills");
        let spell_extensions: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_extensions extension \
                 JOIN skills skill ON skill.id = extension.skill_id \
                 WHERE skill.source_system = 'serrian-tide-core'",
                [],
                |row| row.get(0),
            )
            .expect("count canonical extensions");
        let duplicate_display_names: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE name = 'Load-Bearing' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("count preserved duplicate display names");

        assert_eq!(canonical_skills, 1_136);
        assert_eq!(canonical_relationships, 989);
        assert_eq!(spell_skills, 191);
        assert_eq!(spell_extensions, 0, "spell math must not be invented");
        assert_eq!(
            duplicate_display_names, 2,
            "canonical seeding must not overwrite a user-authored Skill"
        );

        let charm_parent: String = connection
            .query_row(
                "SELECT parent.name \
                 FROM skills child \
                 JOIN skill_relationships relationship ON relationship.skill_id = child.id \
                 JOIN skills parent ON parent.id = relationship.related_skill_id \
                 WHERE child.source_system = 'serrian-tide-core' \
                   AND child.name = 'Charm' COLLATE NOCASE \
                   AND relationship.relationship_type = 'parent' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("load Charm parent");
        assert_eq!(charm_parent, "Spellcraft");

        let (powerlifting_tier, powerlifting_primary, powerlifting_secondary, definition): (
            i64,
            String,
            Option<String>,
            String,
        ) = connection
            .query_row(
                "SELECT tier, primary_attribute, secondary_attribute, definition \
                 FROM skills \
                 WHERE source_system = 'serrian-tide-core' \
                   AND name = 'Powerlifting' COLLATE NOCASE",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("load Powerlifting fields");
        assert_eq!(powerlifting_tier, 2);
        assert_eq!(powerlifting_primary, "STR");
        assert_eq!(powerlifting_secondary, None);
        assert!(
            definition.contains('—'),
            "Unicode definitions must remain intact"
        );

        connection
            .execute_batch(SKILL_CATALOG_MIGRATION)
            .expect("reapply seed migration idempotently");
        let canonical_skills_after_reapply: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE source_system = 'serrian-tide-core'",
                [],
                |row| row.get(0),
            )
            .expect("recount canonical Skills");
        let relationships_after_reapply: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_relationships relationship \
                 JOIN skills child ON child.id = relationship.skill_id \
                 WHERE child.source_system = 'serrian-tide-core'",
                [],
                |row| row.get(0),
            )
            .expect("recount canonical relationships");
        assert_eq!(canonical_skills_after_reapply, 1_136);
        assert_eq!(relationships_after_reapply, 989);
    }

    #[test]
    fn spell_construction_migration_maps_every_source_row_and_preserves_user_edits() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("apply account migration");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply skills migration");
        connection
            .execute_batch(SKILL_CATALOG_MIGRATION)
            .expect("seed canonical Skill catalog");

        // Simulate a database that already received the original misspelled
        // migration 0003 identities before this correction shipped.
        connection
            .execute(
                "UPDATE skills SET name = 'CHAono-Burst', source_external_id = ?1 \
                 WHERE source_system = 'serrian-tide-core' \
                   AND name = 'Chrono-Burst' COLLATE NOCASE",
                ["skill-830880db386529175e3214b637602a93128526f826ee07f872e5ea080cec7dd8"],
            )
            .expect("restore legacy Chrono-Burst identity");
        connection
            .execute(
                "UPDATE skills SET name = 'CHAono-Stasis Field', source_external_id = ?1 \
                 WHERE source_system = 'serrian-tide-core' \
                   AND name = 'Chrono-Stasis Field' COLLATE NOCASE",
                ["skill-f56975e81ce6487f9649728c0f0cad519c9a6003520181479430adc8f8a87c55"],
            )
            .expect("restore legacy Chrono-Stasis identity");

        let flaming_dart_id: i64 = connection
            .query_row(
                "SELECT id FROM skills \
                 WHERE source_system = 'serrian-tide-core' \
                   AND name = 'Flaming Dart' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("load Flaming Dart id");
        connection
            .execute(
                "INSERT INTO skill_extensions (skill_id, extension_type, schema_version, data_json) \
                 VALUES (?1, 'spell-construction', 6, ?2)",
                params![flaming_dart_id, r#"{"schemaVersion":6,"marker":"preserved-user-edit"}"#],
            )
            .expect("insert a preexisting user Spell Construction extension");

        connection
            .execute_batch(SPELL_CONSTRUCTION_MIGRATION)
            .expect("seed Spell Construction documents");

        let canonical_magic_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills \
                 WHERE source_system = 'serrian-tide-core' \
                   AND lower(classification) IN ('spell', 'psionic skill', 'reverberation')",
                [],
                |row| row.get(0),
            )
            .expect("count canonical magic Skills");
        let construction_extensions: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_extensions extension \
                 JOIN skills skill ON skill.id = extension.skill_id \
                 WHERE skill.source_system = 'serrian-tide-core' \
                   AND extension.extension_type = 'spell-construction'",
                [],
                |row| row.get(0),
            )
            .expect("count Spell Construction extensions");
        let source_extensions: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_extensions extension \
                 JOIN skills skill ON skill.id = extension.skill_id \
                 WHERE skill.source_system = 'serrian-tide-core' \
                   AND extension.extension_type = 'spell-import-source'",
                [],
                |row| row.get(0),
            )
            .expect("count Spell source extensions");
        let retained_source_rows: i64 = connection
            .query_row(
                "SELECT SUM(json_array_length(json_extract(data_json, '$.sourceRows'))) \
                 FROM skill_extensions WHERE extension_type = 'spell-import-source'",
                [],
                |row| row.get(0),
            )
            .expect("count retained source rows");
        let invalid_json: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_extensions \
                 WHERE extension_type IN ('spell-construction', 'spell-import-source') \
                   AND json_valid(data_json) = 0",
                [],
                |row| row.get(0),
            )
            .expect("validate seeded JSON");

        assert_eq!(canonical_magic_skills, 371);
        assert_eq!(construction_extensions, 371);
        assert_eq!(source_extensions, 371);
        assert_eq!(
            retained_source_rows, 373,
            "duplicate rows must remain auditable"
        );
        assert_eq!(invalid_json, 0);

        let preserved_marker: String = connection
            .query_row(
                "SELECT json_extract(data_json, '$.marker') FROM skill_extensions \
                 WHERE skill_id = ?1 AND extension_type = 'spell-construction'",
                [flaming_dart_id],
                |row| row.get(0),
            )
            .expect("reload preserved extension");
        assert_eq!(preserved_marker, "preserved-user-edit");

        let (soul_parent, framework_id, tradition, source_cost): (String, i64, String, i64) =
            connection
                .query_row(
                    "SELECT parent.name, \
                        json_extract(construction.data_json, '$.frameworkSkillId'), \
                        json_extract(construction.data_json, '$.tradition'), \
                        json_extract(source.data_json, '$.spreadsheetReference.statedSpellCost') \
                 FROM skills soul \
                 JOIN skill_relationships relationship \
                   ON relationship.skill_id = soul.id \
                  AND relationship.relationship_type = 'parent' \
                 JOIN skills parent ON parent.id = relationship.related_skill_id \
                 JOIN skill_extensions construction \
                   ON construction.skill_id = soul.id \
                  AND construction.extension_type = 'spell-construction' \
                 JOIN skill_extensions source \
                   ON source.skill_id = soul.id \
                  AND source.extension_type = 'spell-import-source' \
                 WHERE soul.source_system = 'serrian-tide-core' \
                   AND soul.name = 'Soul Lock' COLLATE NOCASE",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .expect("load Soul Lock seed");
        let death_id: i64 = connection
            .query_row(
                "SELECT id FROM skills WHERE source_system = 'serrian-tide-core' \
                 AND name = 'Death' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("load Death framework id");
        assert_eq!(soul_parent, "Death");
        assert_eq!(framework_id, death_id);
        assert_eq!(tradition, "Spellcraft/Talismanism/Faith");
        assert_eq!(source_cost, 84);

        let legacy_chrono_names: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE source_system = 'serrian-tide-core' \
                 AND name IN ('CHAono-Burst', 'CHAono-Stasis Field')",
                [],
                |row| row.get(0),
            )
            .expect("count legacy Chrono spell names");
        assert_eq!(legacy_chrono_names, 0);

        connection
            .execute_batch(SPELL_CONSTRUCTION_MIGRATION)
            .expect("reapply Spell seed idempotently");
        let extension_count_after_reapply: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_extensions extension \
                 JOIN skills skill ON skill.id = extension.skill_id \
                 WHERE skill.source_system = 'serrian-tide-core' \
                   AND extension.extension_type IN ('spell-construction', 'spell-import-source')",
                [],
                |row| row.get(0),
            )
            .expect("recount Spell extensions");
        assert_eq!(extension_count_after_reapply, 742);
    }

    #[test]
    fn races_migration_preserves_existing_data_and_enforces_owned_relationships() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("apply account migration");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("apply Skills migration");
        connection
            .execute(
                "INSERT INTO users (username, password_hash, password_salt, password_iterations)
                 VALUES ('ExistingOwner', 'hash', 'salt', 310000)",
                [],
            )
            .expect("insert existing user");
        let user_id = connection.last_insert_rowid();
        connection
            .execute("INSERT INTO skills (name) VALUES ('Shift Forms')", [])
            .expect("insert existing Skill");
        let skill_id = connection.last_insert_rowid();

        connection
            .execute_batch(RACES_MIGRATION)
            .expect("apply Races after existing migrations");
        let surviving_users: i64 = connection
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
            .expect("count users");
        let surviving_skills: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count Skills");
        assert_eq!((surviving_users, surviving_skills), (1, 1));

        connection
            .execute(
                "INSERT INTO races (name, created_by_user_id, base_magic) VALUES (?1, ?2, 2)",
                params!["Test Race", user_id],
            )
            .expect("insert Race");
        let race_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO race_attribute_caps (race_id, attribute_key, max_value, sort_order)
                 VALUES (?1, 'STR', 50, 0), (?1, 'Energon', 60, 1)",
                [race_id],
            )
            .expect("insert standard and custom caps");
        assert!(
            connection
                .execute(
                    "INSERT INTO race_attribute_caps (race_id, attribute_key, max_value)
                     VALUES (?1, 'str', 55)",
                    [race_id],
                )
                .is_err(),
            "duplicate cap keys must be rejected without regard to case"
        );
        connection
            .execute(
                "INSERT INTO race_movement_modes (race_id, movement_mode, base_value, sort_order)
                 VALUES (?1, 'Land', 2, 0), (?1, 'Swim', 4, 1)",
                [race_id],
            )
            .expect("insert multiple movement modes");
        connection
            .execute(
                "INSERT INTO race_skill_links (race_id, skill_id, link_type, value, sort_order)
                 VALUES (?1, ?2, 'bonus', 4, 0), (?1, ?2, 'granted', NULL, 0)",
                params![race_id, skill_id],
            )
            .expect("insert bonus and granted Skill links");

        connection
            .execute("DELETE FROM skills WHERE id = ?1", [skill_id])
            .expect("delete referenced Skill safely");
        let race_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM races", [], |row| row.get(0))
            .expect("count Races after Skill delete");
        let links_after_skill_delete: i64 = connection
            .query_row("SELECT COUNT(*) FROM race_skill_links", [], |row| {
                row.get(0)
            })
            .expect("count links after Skill delete");
        assert_eq!(race_count, 1);
        assert_eq!(links_after_skill_delete, 0);

        connection
            .execute("INSERT INTO skills (name) VALUES ('Dark Vision')", [])
            .expect("insert surviving Skill");
        let surviving_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO race_skill_links (race_id, skill_id, link_type)
                 VALUES (?1, ?2, 'granted')",
                params![race_id, surviving_skill_id],
            )
            .expect("link surviving Skill");
        connection
            .execute("DELETE FROM races WHERE id = ?1", [race_id])
            .expect("delete Race");

        let child_rows: i64 = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM race_attribute_caps) +
                   (SELECT COUNT(*) FROM race_movement_modes) +
                   (SELECT COUNT(*) FROM race_skill_links)",
                [],
                |row| row.get(0),
            )
            .expect("count Race-owned rows");
        let skills_after_race_delete: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count Skills after Race delete");
        assert_eq!(child_rows, 0);
        assert_eq!(
            skills_after_race_delete, 1,
            "deleting a Race must not delete Skills"
        );
    }
}
