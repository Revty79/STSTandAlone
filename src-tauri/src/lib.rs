use tauri_plugin_sql::{Migration, MigrationKind};

mod skill_commands;

const DATABASE_URL: &str = "sqlite:serrian-tide.db";
const INITIAL_ACCOUNT_MIGRATION: &str =
    include_str!("../migrations/0001_create_local_accounts.sql");
const SKILLS_MIGRATION: &str = include_str!("../migrations/0002_create_skills.sql");

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
    ];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
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
    use super::{INITIAL_ACCOUNT_MIGRATION, SKILLS_MIGRATION};
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
}
