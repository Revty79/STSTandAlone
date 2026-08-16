use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:serrian-tide.db";
const INITIAL_ACCOUNT_MIGRATION: &str =
    include_str!("../migrations/0001_create_local_accounts.sql");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_local_accounts",
        sql: INITIAL_ACCOUNT_MIGRATION,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
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
    use super::INITIAL_ACCOUNT_MIGRATION;
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
}
