use tauri_plugin_sql::{Migration, MigrationKind};

mod campaign_commands;
mod character_commands;
mod creature_commands;
mod creature_npc_commands;
mod item_commands;
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
const RACE_CATALOG_MIGRATION: &str = include_str!("../migrations/0006_seed_race_catalog.sql");
const CREATURES_MIGRATION: &str = include_str!("../migrations/0007_create_creatures.sql");
const CREATURE_CATALOG_MIGRATION: &str =
    include_str!("../migrations/0008_seed_creature_catalog.sql");
const DROP_CREATURE_IP_PROVENANCE_MIGRATION: &str =
    include_str!("../migrations/0009_drop_creature_ip_provenance.sql");
const CAT_AND_FALCON_MIGRATION: &str = include_str!("../migrations/0010_seed_cat_and_falcon.sql");
const REMOVE_CREATURE_REVIEW_NOTES_MIGRATION: &str =
    include_str!("../migrations/0011_remove_creature_review_notes.sql");
const DERIVED_CREATURES_AND_CR_MIGRATION: &str =
    include_str!("../migrations/0012_create_derived_creatures_and_cr.sql");
const ITEMS_MIGRATION: &str = include_str!("../migrations/0013_create_items.sql");
const ITEM_CATALOG_MIGRATION: &str = include_str!("../migrations/0014_seed_item_catalog.sql");
const CAMPAIGNS_MIGRATION: &str = include_str!("../migrations/0015_create_campaigns.sql");
const CAMPAIGN_PLAYERS_MIGRATION: &str =
    include_str!("../migrations/0016_create_campaign_players.sql");
const CAMPAIGN_CHARACTERS_MIGRATION: &str =
    include_str!("../migrations/0017_create_campaign_characters.sql");
const CHARACTER_AGGREGATE_MIGRATION: &str =
    include_str!("../migrations/0018_create_character_aggregate.sql");
const LOCK_COMPLETED_CHARACTER_CREATION_MIGRATION: &str =
    include_str!("../migrations/0019_lock_completed_character_creation.sql");
const CHARACTER_HEIGHT_UNITS_MIGRATION: &str =
    include_str!("../migrations/0020_add_character_height_units.sql");
const CORRECT_SPELL_TIER_MIGRATION: &str =
    include_str!("../migrations/0021_correct_spell_tier.sql");
const LINK_SPHERES_TO_MAGIC_ACCESS_MIGRATION: &str =
    include_str!("../migrations/0022_link_spheres_to_magic_access.sql");
const ALLOW_RACIAL_SKILL_ANCHORS_MIGRATION: &str =
    include_str!("../migrations/0023_allow_racial_skill_anchors.sql");
const BACKFILL_CAMPAIGN_EQUIPMENT_MIGRATION: &str =
    include_str!("../migrations/0024_backfill_campaign_equipment.sql");
const REOPEN_INCOMPLETE_CHARACTERS_MIGRATION: &str =
    include_str!("../migrations/0025_reopen_incomplete_characters.sql");
const ADD_CAMPAIGN_NPCS_MIGRATION: &str = include_str!("../migrations/0026_add_campaign_npcs.sql");
const STORE_CHARACTER_CURRENCY_HOLDINGS_MIGRATION: &str =
    include_str!("../migrations/0027_store_character_currency_holdings.sql");
const ADD_FATE_POINTS_MIGRATION: &str = include_str!("../migrations/0028_add_fate_points.sql");
const ADD_CREATURE_NPCS_MIGRATION: &str = include_str!("../migrations/0029_add_creature_npcs.sql");

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
        Migration {
            version: 6,
            description: "seed_race_catalog",
            sql: RACE_CATALOG_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_creatures",
            sql: CREATURES_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "seed_creature_catalog",
            sql: CREATURE_CATALOG_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "drop_creature_ip_provenance",
            sql: DROP_CREATURE_IP_PROVENANCE_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "seed_cat_and_falcon",
            sql: CAT_AND_FALCON_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "remove_creature_review_notes",
            sql: REMOVE_CREATURE_REVIEW_NOTES_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "create_derived_creatures_and_cr",
            sql: DERIVED_CREATURES_AND_CR_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "create_items",
            sql: ITEMS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "seed_item_catalog",
            sql: ITEM_CATALOG_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "create_campaigns",
            sql: CAMPAIGNS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "create_campaign_players",
            sql: CAMPAIGN_PLAYERS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "create_campaign_characters",
            sql: CAMPAIGN_CHARACTERS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "create_character_aggregate",
            sql: CHARACTER_AGGREGATE_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "lock_completed_character_creation",
            sql: LOCK_COMPLETED_CHARACTER_CREATION_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "add_character_height_units",
            sql: CHARACTER_HEIGHT_UNITS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "correct_spell_tier",
            sql: CORRECT_SPELL_TIER_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "link_spheres_to_magic_access",
            sql: LINK_SPHERES_TO_MAGIC_ACCESS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "allow_racial_skill_anchors",
            sql: ALLOW_RACIAL_SKILL_ANCHORS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "backfill_campaign_equipment",
            sql: BACKFILL_CAMPAIGN_EQUIPMENT_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "reopen_incomplete_characters",
            sql: REOPEN_INCOMPLETE_CHARACTERS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "add_campaign_npcs",
            sql: ADD_CAMPAIGN_NPCS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "store_character_currency_holdings",
            sql: STORE_CHARACTER_CURRENCY_HOLDINGS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "add_fate_points",
            sql: ADD_FATE_POINTS_MIGRATION,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "add_creature_npcs",
            sql: ADD_CREATURE_NPCS_MIGRATION,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            campaign_commands::save_campaign_aggregate,
            character_commands::create_character_aggregate,
            character_commands::create_npc_aggregate,
            character_commands::save_character_aggregate,
            character_commands::advance_character_skill,
            creature_npc_commands::create_creature_npc,
            creature_npc_commands::save_creature_npc,
            creature_commands::save_creature_aggregate,
            creature_commands::clone_creature_as_variant,
            item_commands::save_item_aggregate,
            item_commands::clone_item_as_variant,
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
        CAT_AND_FALCON_MIGRATION, CORRECT_SPELL_TIER_MIGRATION, CREATURES_MIGRATION,
        CREATURE_CATALOG_MIGRATION, DERIVED_CREATURES_AND_CR_MIGRATION,
        DROP_CREATURE_IP_PROVENANCE_MIGRATION, INITIAL_ACCOUNT_MIGRATION,
        LINK_SPHERES_TO_MAGIC_ACCESS_MIGRATION, RACES_MIGRATION, RACE_CATALOG_MIGRATION,
        REMOVE_CREATURE_REVIEW_NOTES_MIGRATION, SKILLS_MIGRATION, SKILL_CATALOG_MIGRATION,
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
        connection
            .execute_batch(CORRECT_SPELL_TIER_MIGRATION)
            .expect("correct canonical Spell tier");

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

        connection
            .execute_batch(LINK_SPHERES_TO_MAGIC_ACCESS_MIGRATION)
            .expect("link canonical Spheres to all three magic access roots");
        let shared_sphere_relationships: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_relationships relationship
                 JOIN skills sphere ON sphere.id=relationship.skill_id
                 JOIN skills access_skill ON access_skill.id=relationship.related_skill_id
                 WHERE sphere.source_system='serrian-tide-core'
                   AND sphere.classification='sphere' COLLATE NOCASE
                   AND access_skill.name IN ('Spellcraft','Talismanism','Faith')",
                [],
                |row| row.get(0),
            )
            .expect("count shared Sphere relationships");
        assert_eq!(shared_sphere_relationships, 48);

        let eternal_black_sun_tier: i64 = connection
            .query_row(
                "SELECT tier FROM skills
                 WHERE source_system='serrian-tide-core'
                   AND source_external_id='skill-386c592f2009be1807e6645fb730ea2f21c4b607fa0b9e21473bec9603863ca7'",
                [],
                |row| row.get(0),
            )
            .expect("load corrected Eternal Black Sun tier");
        assert_eq!(eternal_black_sun_tier, 3);

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
        assert_eq!(relationships_after_reapply, 1_021);
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

    #[test]
    fn race_catalog_migration_seeds_normalized_races_without_inventing_skills() {
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
            .execute(
                "INSERT INTO skills (name, classification) VALUES ('User Skill', 'standard')",
                [],
            )
            .expect("insert user Skill before catalog migrations");
        connection
            .execute_batch(SKILL_CATALOG_MIGRATION)
            .expect("seed Skill catalog");
        connection
            .execute_batch(SPELL_CONSTRUCTION_MIGRATION)
            .expect("seed Spell Construction");
        connection
            .execute_batch(RACES_MIGRATION)
            .expect("create Race tables");
        connection
            .execute(
                "INSERT INTO races (name, legacy_description, created_by_user_id)
                 VALUES ('Standard Human', 'User-authored duplicate name.', ?1)",
                [user_id],
            )
            .expect("insert user Race before catalog seed");
        let skill_count_before: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count Skills before Race seed");
        let canonical_skill_count_before: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE source_system = 'serrian-tide-core'",
                [],
                |row| row.get(0),
            )
            .expect("count canonical Skills before Race seed");
        assert_eq!(canonical_skill_count_before, 1137);

        connection
            .execute_batch(RACE_CATALOG_MIGRATION)
            .expect("seed Race catalog");

        let counts: (i64, i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM races WHERE source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_attribute_caps cap JOIN races race ON race.id = cap.race_id WHERE race.source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_movement_modes movement JOIN races race ON race.id = movement.race_id WHERE race.source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_skill_links link JOIN races race ON race.id = link.race_id WHERE race.source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_skill_links link JOIN races race ON race.id = link.race_id WHERE race.source_system = 'serrian-tide-race-sheet' AND link.link_type = 'bonus'),
                   (SELECT COUNT(*) FROM race_skill_links link JOIN races race ON race.id = link.race_id WHERE race.source_system = 'serrian-tide-race-sheet' AND link.link_type = 'granted')",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("count seeded Race aggregates");
        assert_eq!(counts, (56, 336, 57, 283, 248, 35));

        let standard_human_names: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM races WHERE name = 'Standard Human' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("count duplicate display names");
        let user_race_survived: String = connection
            .query_row(
                "SELECT legacy_description FROM races
                 WHERE name = 'Standard Human' COLLATE NOCASE AND source_system IS NULL",
                [],
                |row| row.get(0),
            )
            .expect("reload user Race");
        assert_eq!(standard_human_names, 2);
        assert_eq!(user_race_survived, "User-authored duplicate name.");

        let (land, swim): (f64, f64) = connection
            .query_row(
                "SELECT
                   (SELECT movement.base_value FROM race_movement_modes movement WHERE movement.race_id = race.id AND movement.movement_mode = 'Land' COLLATE NOCASE),
                   (SELECT movement.base_value FROM race_movement_modes movement WHERE movement.race_id = race.id AND movement.movement_mode = 'Swim' COLLATE NOCASE)
                 FROM races race
                 WHERE race.source_system = 'serrian-tide-race-sheet'
                   AND race.name = 'Mer-Folk' COLLATE NOCASE",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("reload Mer-Folk movement modes");
        assert_eq!((land, swim), (2.0, 4.0));

        let permanent_granted_values: (f64, f64, f64) = connection
            .query_row(
                "SELECT
                   (SELECT link.value FROM race_skill_links link
                    JOIN races race ON race.id=link.race_id
                    JOIN skills skill ON skill.id=link.skill_id
                    WHERE race.name='Harbinger Elf' COLLATE NOCASE
                      AND skill.name='Harbinger Elf Berserker Rage' COLLATE NOCASE),
                   (SELECT link.value FROM race_skill_links link
                    JOIN races race ON race.id=link.race_id
                    JOIN skills skill ON skill.id=link.skill_id
                    WHERE race.name='Moonshade Elf' COLLATE NOCASE
                      AND skill.name='Moonshadow Omen' COLLATE NOCASE),
                   (SELECT link.value FROM race_skill_links link
                    JOIN races race ON race.id=link.race_id
                    JOIN skills skill ON skill.id=link.skill_id
                    WHERE race.name='Changeling' COLLATE NOCASE
                      AND skill.name='Glamour Shift' COLLATE NOCASE)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("reload permanent racial grant values");
        assert_eq!(permanent_granted_values, (10.0, 10.0, 10.0));

        let invalid_granted_links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM race_skill_links link
                 JOIN races race ON race.id = link.race_id
                 JOIN skills skill ON skill.id = link.skill_id
                 WHERE race.source_system = 'serrian-tide-race-sheet'
                   AND link.link_type = 'granted'
                   AND skill.classification <> 'special ability' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("validate granted classifications");
        let skill_count_after: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count Skills after Race seed");
        assert_eq!(invalid_granted_links, 0);
        assert_eq!(
            skill_count_after, skill_count_before,
            "the Race seed must never create Skills"
        );

        connection
            .execute(
                "UPDATE races SET cultural_mindset = 'Preserved user edit.'
                 WHERE source_system = 'serrian-tide-race-sheet'
                   AND name = 'Standard Human' COLLATE NOCASE",
                [],
            )
            .expect("edit seeded Race");
        connection
            .execute_batch(RACE_CATALOG_MIGRATION)
            .expect("reapply Race seed idempotently");
        let counts_after_reapply: (i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM races WHERE source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_attribute_caps cap JOIN races race ON race.id = cap.race_id WHERE race.source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_movement_modes movement JOIN races race ON race.id = movement.race_id WHERE race.source_system = 'serrian-tide-race-sheet'),
                   (SELECT COUNT(*) FROM race_skill_links link JOIN races race ON race.id = link.race_id WHERE race.source_system = 'serrian-tide-race-sheet')",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("recount re-applied Race seed");
        let preserved_edit: String = connection
            .query_row(
                "SELECT cultural_mindset FROM races
                 WHERE source_system = 'serrian-tide-race-sheet'
                   AND name = 'Standard Human' COLLATE NOCASE",
                [],
                |row| row.get(0),
            )
            .expect("reload preserved edit");
        assert_eq!(counts_after_reapply, (56, 336, 57, 283));
        assert_eq!(preserved_edit, "Preserved user edit.");
    }

    #[test]
    fn creature_catalog_migration_preserves_canon_nulls_relationships_and_idempotency() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("accounts");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("Skill schema");
        connection
            .execute_batch(CREATURES_MIGRATION)
            .expect("Creature schema");
        let skill_count_before: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("Skill count");
        connection
            .execute_batch(CREATURE_CATALOG_MIGRATION)
            .expect("Creature seed");

        let counts: (i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
               (SELECT COUNT(*) FROM creatures WHERE source_system='serrian-tide-creature-canon'),
               (SELECT COUNT(*) FROM challenge_rating_reference),
               (SELECT COUNT(*) FROM creature_attributes),
               (SELECT COUNT(*) FROM creature_movement),
               (SELECT COUNT(*) FROM creature_hp_pools),
               (SELECT COUNT(*) FROM creature_hit_locations),
               (SELECT COUNT(*) FROM creature_attacks),
               (SELECT COUNT(*) FROM creature_skill_links),
               (SELECT COUNT(*) FROM creature_abilities),
               (SELECT COUNT(*) FROM creature_defenses),
               (SELECT COUNT(*) FROM creature_uses),
               (SELECT COUNT(*) FROM creature_variants)",
                [],
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
                        row.get(10)?,
                        row.get(11)?,
                    ))
                },
            )
            .expect("canonical counts");
        assert_eq!(counts, (85, 50, 510, 124, 528, 800, 158, 0, 45, 23, 27, 3));

        let null_zero: (i64, i64, i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
               (SELECT COUNT(*) FROM creature_hit_locations WHERE natural_armor IS NULL),
               (SELECT COUNT(*) FROM creature_hit_locations WHERE natural_armor=0),
               (SELECT COUNT(*) FROM creature_hit_locations WHERE soak IS NULL),
               (SELECT COUNT(*) FROM creature_hit_locations WHERE soak=0),
               (SELECT COUNT(*) FROM creature_attacks WHERE damage IS NULL),
               (SELECT COUNT(*) FROM creature_movement WHERE movement_value=0),
               (SELECT COUNT(*) FROM creature_movement WHERE initiative=0)",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .expect("null and zero audit");
        assert_eq!(null_zero, (30, 500, 30, 590, 13, 1, 1));

        let horse: (String, i64, f64, i64) = connection.query_row(
            "SELECT creature.size, creature.challenge_rating,
               (SELECT value FROM creature_attributes WHERE creature_id=creature.id AND attribute_key='Strength'),
               (SELECT COUNT(DISTINCT location.hp_pool_id) FROM creature_hit_locations location WHERE location.creature_id=creature.id)
             FROM creatures creature WHERE creature.canonical_id='CR-HORSE'", [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)),
        ).expect("Horse canon");
        assert_eq!(horse.0, "Large");
        assert_eq!(horse.1, 8);
        assert_eq!(horse.2, 45.0, "Creature Attributes remain pre-Size");
        assert!(
            horse.3 < 10,
            "several Horse die results must share HP Pools"
        );

        let variant_overrides: i64 = connection.query_row(
            "SELECT COUNT(*) FROM creature_variants WHERE size_override IS NULL AND challenge_rating_override IS NULL AND kill_xp_override IS NULL", [], |row| row.get(0),
        ).expect("blank Variant overrides");
        let proposed_notes: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM creatures WHERE notes LIKE '%PROPOSED%'",
                [],
                |row| row.get(0),
            )
            .expect("proposed notes");
        let provenance: i64 = connection
            .query_row("SELECT COUNT(*) FROM creature_ip_provenance", [], |row| {
                row.get(0)
            })
            .expect("provenance");
        let skill_count_after: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("Skill count after");
        assert_eq!(variant_overrides, 3);
        assert!(proposed_notes > 0);
        assert_eq!(provenance, 85);
        assert_eq!(
            skill_count_after, skill_count_before,
            "Creature seed must never create Skills"
        );

        connection
            .execute_batch(CREATURE_CATALOG_MIGRATION)
            .expect("reapply Creature seed");
        let counts_after: (i64, i64, i64, i64) = connection.query_row(
            "SELECT (SELECT COUNT(*) FROM creatures), (SELECT COUNT(*) FROM creature_hit_locations),
                    (SELECT COUNT(*) FROM creature_defenses), (SELECT COUNT(*) FROM creature_uses)", [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)),
        ).expect("idempotent counts");
        assert_eq!(counts_after, (85, 800, 23, 27));

        connection
            .execute_batch(DROP_CREATURE_IP_PROVENANCE_MIGRATION)
            .expect("drop unused Creature IP Provenance");
        let provenance_table: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name = 'creature_ip_provenance'",
                [],
                |row| row.get(0),
            )
            .expect("check removed provenance table");
        assert_eq!(provenance_table, 0);
    }

    #[test]
    fn cat_and_falcon_migration_completes_existing_and_fresh_creature_catalogs() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("accounts");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("Skill schema");
        connection
            .execute_batch(CREATURES_MIGRATION)
            .expect("Creature schema");
        connection
            .execute_batch(CREATURE_CATALOG_MIGRATION)
            .expect("initial Creature seed");
        connection
            .execute_batch(DROP_CREATURE_IP_PROVENANCE_MIGRATION)
            .expect("final Creature schema");
        connection
            .execute(
                "INSERT INTO creatures (canonical_id, canonical_name, size, challenge_rating, kill_xp, notes)
                 VALUES ('CR-USER-TEST', 'User Creature', 'Medium', 1, 1, 'PROPOSED FOR REVIEW — user-authored note')",
                [],
            )
            .expect("user Creature before additive migration");

        connection
            .execute_batch(CAT_AND_FALCON_MIGRATION)
            .expect("Cat and Falcon supplement");
        connection
            .execute_batch(REMOVE_CREATURE_REVIEW_NOTES_MIGRATION)
            .expect("remove canonical Creature review notes");

        let canonical_counts: (i64, i64, i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM creatures WHERE source_system='serrian-tide-creature-canon'),
                   (SELECT COUNT(*) FROM creature_attributes),
                   (SELECT COUNT(*) FROM creature_movement),
                   (SELECT COUNT(*) FROM creature_hp_pools),
                   (SELECT COUNT(*) FROM creature_hit_locations),
                   (SELECT COUNT(*) FROM creature_attacks),
                   (SELECT COUNT(*) FROM creature_uses)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            )
            .expect("supplemented catalog counts");
        assert_eq!(canonical_counts, (87, 522, 128, 543, 820, 162, 29));

        let cat: (String, String, i64, i64, f64, i64, i64, f64) = connection
            .query_row(
                "SELECT creature.family, creature.size, creature.challenge_rating, creature.kill_xp,
                   (SELECT value FROM creature_attributes WHERE creature_id=creature.id AND attribute_key='Dexterity'),
                   (SELECT COUNT(*) FROM creature_hit_locations WHERE creature_id=creature.id),
                   (SELECT COUNT(*) FROM creature_attacks WHERE creature_id=creature.id),
                   (SELECT SUM(hp_percentage) FROM creature_hp_pools WHERE creature_id=creature.id)
                 FROM creatures creature WHERE creature.canonical_id='CR-CAT'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
            )
            .expect("complete Cat aggregate");
        assert_eq!(
            cat,
            ("Feline".into(), "Tiny".into(), 2, 1, 45.0, 10, 2, 100.0)
        );

        let falcon: (String, String, i64, f64, i64, i64, f64) = connection
            .query_row(
                "SELECT creature.family, creature.size, creature.challenge_rating,
                   (SELECT movement_value FROM creature_movement WHERE creature_id=creature.id AND movement_mode='Flight'),
                   (SELECT COUNT(*) FROM creature_hit_locations WHERE creature_id=creature.id),
                   (SELECT COUNT(*) FROM creature_attacks WHERE creature_id=creature.id),
                   (SELECT SUM(hp_percentage) FROM creature_hp_pools WHERE creature_id=creature.id)
                 FROM creatures creature WHERE creature.canonical_id='CR-FALCON'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            )
            .expect("complete Falcon aggregate");
        assert_eq!(
            falcon,
            ("Raptor".into(), "Small".into(), 4, 9.0, 10, 2, 100.0)
        );

        let user_creatures: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM creatures WHERE canonical_id='CR-USER-TEST'",
                [],
                |row| row.get(0),
            )
            .expect("preserved user Creature");
        let provenance_table: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='creature_ip_provenance'",
                [],
                |row| row.get(0),
            )
            .expect("provenance remains removed");
        assert_eq!(user_creatures, 1);
        assert_eq!(provenance_table, 0);

        let canonical_review_notes: i64 = connection
            .query_row(
                "SELECT SUM(note_count) FROM (
                   SELECT COUNT(*) AS note_count FROM creatures WHERE source_system='serrian-tide-creature-canon' AND instr(lower(notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_attributes row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_movement row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_hp_pools row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_hit_locations row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_attacks row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_skill_links row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_abilities row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_defenses row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_uses row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                   UNION ALL SELECT COUNT(*) FROM creature_variants row JOIN creatures creature ON creature.id=row.creature_id WHERE creature.source_system='serrian-tide-creature-canon' AND instr(lower(row.notes), 'proposed for review') > 0
                 )",
                [],
                |row| row.get(0),
            )
            .expect("canonical review-marker notes");
        let user_note: String = connection
            .query_row(
                "SELECT notes FROM creatures WHERE canonical_id='CR-USER-TEST'",
                [],
                |row| row.get(0),
            )
            .expect("preserved user-authored note");
        assert_eq!(canonical_review_notes, 0);
        assert_eq!(user_note, "PROPOSED FOR REVIEW — user-authored note");

        connection
            .execute_batch(CAT_AND_FALCON_MIGRATION)
            .expect("reapply supplement");
        let counts_after_reapply: (i64, i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM creatures),
                        (SELECT COUNT(*) FROM creature_hit_locations),
                        (SELECT COUNT(*) FROM creature_attacks)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("idempotent supplement counts");
        assert_eq!(counts_after_reapply, (88, 820, 162));
    }

    #[test]
    fn derived_creature_migration_converts_variant_shells_and_canonicalizes_cr_xp() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(INITIAL_ACCOUNT_MIGRATION)
            .expect("accounts");
        connection
            .execute_batch(SKILLS_MIGRATION)
            .expect("Skill schema");
        connection
            .execute_batch(CREATURES_MIGRATION)
            .expect("Creature schema");
        connection
            .execute_batch(CREATURE_CATALOG_MIGRATION)
            .expect("Creature seed");
        connection
            .execute_batch(DROP_CREATURE_IP_PROVENANCE_MIGRATION)
            .expect("drop provenance");
        connection
            .execute_batch(CAT_AND_FALCON_MIGRATION)
            .expect("Cat and Falcon");
        connection
            .execute_batch(REMOVE_CREATURE_REVIEW_NOTES_MIGRATION)
            .expect("review-note cleanup");
        connection.execute(
            "INSERT INTO creatures (canonical_id, canonical_name, family, creature_type, size, notes)
             VALUES ('CR-USER-DRAFT', 'User Draft', 'User Family', 'Animal', 'Medium', 'Keep me')",
            [],
        ).expect("pre-migration user Creature");

        connection
            .execute_batch(DERIVED_CREATURES_AND_CR_MIGRATION)
            .expect("derived Creature migration");

        let counts: (i64, i64, i64) = connection.query_row(
            "SELECT
               (SELECT COUNT(*) FROM creatures),
               (SELECT COUNT(*) FROM creature_variants),
               (SELECT COUNT(*) FROM creatures child JOIN creatures parent ON parent.id=child.parent_creature_id WHERE parent.canonical_id='CR-HORSE')",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).expect("lineage counts");
        assert_eq!(counts, (91, 0, 3));

        let draft_horse: (String, String, i64, i64, i64, i64, i64) = connection
            .query_row(
                "SELECT child.family, child.canonical_id, child.challenge_rating, child.kill_xp,
               (SELECT COUNT(*) FROM creature_attributes WHERE creature_id=child.id),
               (SELECT COUNT(*) FROM creature_hit_locations WHERE creature_id=child.id),
               (SELECT COUNT(*) FROM creature_attacks WHERE creature_id=child.id)
             FROM creatures child WHERE child.canonical_id='VAR-HORSE-DRAFT'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .expect("full Draft Horse");
        assert_eq!(
            draft_horse,
            ("Equine".into(), "VAR-HORSE-DRAFT".into(), 8, 3, 6, 10, 3)
        );

        let user: (i64, i64, String) = connection.query_row(
            "SELECT challenge_rating, kill_xp, notes FROM creatures WHERE canonical_id='CR-USER-DRAFT'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).expect("upgraded user Creature");
        assert_eq!(user, (1, 1, "Keep me".into()));

        let xp_mismatches: i64 = connection.query_row(
            "SELECT COUNT(*) FROM creatures creature
             JOIN challenge_rating_reference reference ON reference.challenge_rating=creature.challenge_rating
             WHERE creature.kill_xp != reference.kill_xp
                OR creature.calculated_challenge_rating IS NULL",
            [],
            |row| row.get(0),
        ).expect("XP consistency");
        let foreign_key_errors: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .expect("foreign-key check");
        assert_eq!(xp_mismatches, 0);
        assert_eq!(foreign_key_errors, 0);
    }
}
