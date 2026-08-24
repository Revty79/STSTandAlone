use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCreatureNpcInput {
    campaign_id: i64,
    requesting_user_id: i64,
    creature_id: i64,
    template_snapshot_json: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCreatureNpcInput {
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
    name: String,
    personality: String,
    instance_notes: String,
    hp_adjustment: f64,
    current_snapshot_json: String,
    items: Vec<CreatureNpcItemInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatureNpcItemInput {
    item_id: i64,
    quantity: i64,
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

fn parse_snapshot(value: &str, label: &str) -> Result<Value, String> {
    let snapshot: Value = serde_json::from_str(value)
        .map_err(|error| format!("{label} is not valid Creature data: {error}"))?;
    if !snapshot.is_object() || !snapshot.get("core").is_some_and(Value::is_object) {
        return Err(format!("{label} must contain a Creature core record."));
    }
    Ok(snapshot)
}

fn canonical_id(snapshot: &Value) -> Option<&str> {
    snapshot
        .get("core")?
        .get("canonicalId")?
        .as_str()
        .map(str::trim)
}

#[tauri::command]
pub fn create_creature_npc(app: AppHandle, input: CreateCreatureNpcInput) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    create_creature_npc_in_connection(&mut connection, input)
}

fn create_creature_npc_in_connection(
    connection: &mut Connection,
    input: CreateCreatureNpcInput,
) -> Result<i64, String> {
    if input.campaign_id <= 0 || input.requesting_user_id <= 0 || input.creature_id <= 0 {
        return Err(
            "Creature NPC creation must reference a Campaign, Creature, and G.O.D. profile."
                .to_string(),
        );
    }
    let snapshot = parse_snapshot(&input.template_snapshot_json, "Creature template snapshot")?;
    let snapshot_canonical_id = required(
        canonical_id(&snapshot).unwrap_or_default(),
        "Creature template identity",
    )?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Creature NPC transaction could not begin: {error}"))?;
    let template: Option<(String, String)> = transaction
        .query_row(
            "SELECT creature.canonical_id,creature.canonical_name
             FROM creatures creature
             JOIN campaigns campaign ON campaign.id=?1
             WHERE creature.id=?2 AND EXISTS (
               SELECT 1 FROM user_roles actor_role
               WHERE actor_role.user_id=?3 AND actor_role.role='god'
             )",
            params![
                input.campaign_id,
                input.creature_id,
                input.requesting_user_id
            ],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| format!("Creature NPC access could not be checked: {error}"))?;
    let Some((stored_canonical_id, template_name)) = template else {
        return Err("Creature NPC creation requires a saved Creature and G.O.D. profile.".into());
    };
    if !stored_canonical_id.eq_ignore_ascii_case(&snapshot_canonical_id) {
        return Err("The Creature template snapshot does not match the master Creature.".into());
    }
    transaction
        .execute(
            "INSERT INTO campaign_players (campaign_id,user_id,is_npc_controller)
             VALUES (?1,?2,1) ON CONFLICT(campaign_id,user_id) DO NOTHING",
            params![input.campaign_id, input.requesting_user_id],
        )
        .map_err(|error| format!("The Creature NPC controller could not be linked: {error}"))?;
    transaction
        .execute(
            "INSERT INTO campaign_characters
             (campaign_id,player_user_id,name,is_npc,npc_kind)
             VALUES (?1,?2,?3,1,'creature')",
            params![
                input.campaign_id,
                input.requesting_user_id,
                format!("New {template_name} NPC")
            ],
        )
        .map_err(|error| format!("The Creature NPC identity could not be created: {error}"))?;
    let character_id = transaction.last_insert_rowid();
    transaction
        .execute(
            "INSERT INTO campaign_creature_npc_profiles
             (character_id,creature_id,baseline_snapshot_json,current_snapshot_json)
             VALUES (?1,?2,?3,?3)",
            params![
                character_id,
                input.creature_id,
                input.template_snapshot_json
            ],
        )
        .map_err(|error| format!("The Creature NPC baseline could not be stored: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("The Creature NPC transaction could not be committed: {error}"))?;
    Ok(character_id)
}

#[tauri::command]
pub fn save_creature_npc(app: AppHandle, input: SaveCreatureNpcInput) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    save_creature_npc_in_connection(&mut connection, input)
}

fn save_creature_npc_in_connection(
    connection: &mut Connection,
    input: SaveCreatureNpcInput,
) -> Result<i64, String> {
    if input.character_id <= 0 || input.campaign_id <= 0 || input.requesting_user_id <= 0 {
        return Err("Creature NPC save must reference saved records.".into());
    }
    let name = required(&input.name, "Creature NPC Name")?;
    if !input.hp_adjustment.is_finite() {
        return Err("Creature NPC HP Adjustment must be a finite number.".into());
    }
    let current_snapshot = parse_snapshot(&input.current_snapshot_json, "Creature NPC record")?;
    let current_canonical_id = required(
        canonical_id(&current_snapshot).unwrap_or_default(),
        "Creature NPC template identity",
    )?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Creature NPC save transaction could not begin: {error}"))?;
    let baseline_canonical_id: Option<String> = transaction
        .query_row(
            "SELECT json_extract(profile.baseline_snapshot_json,'$.core.canonicalId')
             FROM campaign_characters character
             JOIN campaign_creature_npc_profiles profile ON profile.character_id=character.id
             WHERE character.id=?1 AND character.campaign_id=?2
               AND character.is_npc=1 AND character.npc_kind='creature'
               AND EXISTS (
                 SELECT 1 FROM user_roles actor_role
                 WHERE actor_role.user_id=?3 AND actor_role.role='god'
               )",
            params![
                input.character_id,
                input.campaign_id,
                input.requesting_user_id
            ],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Creature NPC access could not be checked: {error}"))?;
    let Some(baseline_canonical_id) = baseline_canonical_id else {
        return Err("The Creature NPC does not belong to this Campaign or G.O.D. profile.".into());
    };
    if !baseline_canonical_id.eq_ignore_ascii_case(&current_canonical_id) {
        return Err("A Creature NPC cannot change its master Creature identity.".into());
    }
    transaction
        .execute(
            "UPDATE campaign_characters SET name=?1,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?2",
            params![name, input.character_id],
        )
        .map_err(|error| format!("The Creature NPC name could not be saved: {error}"))?;
    transaction
        .execute(
            "UPDATE campaign_creature_npc_profiles
             SET personality=?1,instance_notes=?2,hp_adjustment=?3,
                 current_snapshot_json=?4,
                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE character_id=?5",
            params![
                input.personality.trim(),
                input.instance_notes.trim(),
                input.hp_adjustment,
                input.current_snapshot_json,
                input.character_id
            ],
        )
        .map_err(|error| format!("The Creature NPC record could not be saved: {error}"))?;
    transaction
        .execute(
            "DELETE FROM campaign_character_items WHERE character_id=?1",
            [input.character_id],
        )
        .map_err(|error| {
            format!("Existing Creature NPC inventory could not be replaced: {error}")
        })?;
    let mut item_ids = std::collections::HashSet::new();
    for item in input.items {
        if item.item_id <= 0 || item.quantity <= 0 || !item_ids.insert(item.item_id) {
            return Err(
                "Creature NPC inventory must contain unique saved Items with positive quantities."
                    .into(),
            );
        }
        let unit_cost: Option<f64> = transaction
            .query_row(
                "SELECT COALESCE(item.credits,0)
                 FROM campaign_inventory_items allowed
                 JOIN items item ON item.id=allowed.item_id
                 WHERE allowed.campaign_id=?1 AND allowed.item_id=?2",
                params![input.campaign_id, item.item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("A Creature NPC Item could not be checked: {error}"))?;
        let Some(unit_cost) = unit_cost else {
            return Err("Creature NPC inventory must use Campaign-authorized Items.".into());
        };
        transaction
            .execute(
                "INSERT INTO campaign_character_items
                 (character_id,item_id,quantity,unit_cost_credits)
                 VALUES (?1,?2,?3,?4)",
                params![input.character_id, item.item_id, item.quantity, unit_cost],
            )
            .map_err(|error| format!("A Creature NPC Item could not be saved: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("The Creature NPC save could not be committed: {error}"))?;
    Ok(input.character_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const USERS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS: &str = include_str!("../migrations/0002_create_skills.sql");
    const RACES: &str = include_str!("../migrations/0005_create_races.sql");
    const CREATURES: &str = include_str!("../migrations/0007_create_creatures.sql");
    const ITEMS: &str = include_str!("../migrations/0013_create_items.sql");
    const CAMPAIGNS: &str = include_str!("../migrations/0015_create_campaigns.sql");
    const PLAYERS: &str = include_str!("../migrations/0016_create_campaign_players.sql");
    const CHARACTERS: &str = include_str!("../migrations/0017_create_campaign_characters.sql");
    const CHARACTER_AGGREGATE: &str =
        include_str!("../migrations/0018_create_character_aggregate.sql");
    const NPCS: &str = include_str!("../migrations/0026_add_campaign_npcs.sql");
    const CREATURE_NPCS: &str = include_str!("../migrations/0029_add_creature_npcs.sql");

    fn setup() -> (Connection, i64, i64, i64, i64) {
        let connection = Connection::open_in_memory().expect("database");
        for migration in [
            USERS,
            SKILLS,
            RACES,
            CREATURES,
            ITEMS,
            CAMPAIGNS,
            PLAYERS,
            CHARACTERS,
            CHARACTER_AGGREGATE,
            NPCS,
            CREATURE_NPCS,
        ] {
            connection.execute_batch(migration).expect("migration");
        }
        connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('GOD','hash','salt',1),('Player','hash','salt',1)",
                [],
            )
            .expect("users");
        let god_id = 1;
        let player_id = 2;
        connection
            .execute("INSERT INTO user_roles (user_id,role) VALUES (1,'god')", [])
            .expect("role");
        connection
            .execute(
                "INSERT INTO campaigns
                 (name,attribute_points,skill_points,max_starting_skill,
                  points_to_unlock_next_tier,max_points_in_skill,
                  starting_credit_amount,currency_system,created_by_user_id)
                 VALUES ('Tidefall',0,0,0,0,0,0,'Credits',1)",
                [],
            )
            .expect("campaign");
        let campaign_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO creatures
                 (canonical_id,canonical_name,size,created_by_user_id)
                 VALUES ('CRE-GOBLIN','Goblin','Small',1)",
                [],
            )
            .expect("creature");
        let creature_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO items
                 (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis)
                 VALUES ('ITEM-SWORD','Short Sword','equipment','weapon','Weapon','Sword','Weapon',10,'each')",
                [],
            )
            .expect("item");
        let item_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaign_inventory_items (campaign_id,item_id,sort_order)
                 VALUES (?1,?2,0)",
                params![campaign_id, item_id],
            )
            .expect("allowed item");
        (connection, god_id, player_id, campaign_id, creature_id)
    }

    fn snapshot(creature_id: i64) -> String {
        serde_json::json!({
            "id": creature_id,
            "core": { "canonicalId": "CRE-GOBLIN", "canonicalName": "Goblin" },
            "attributes": [], "movement": [], "hpPools": [], "hitLocations": [],
            "attacks": [], "skillLinks": [], "abilities": [], "defenses": [],
            "uses": [], "derivedCreatures": []
        })
        .to_string()
    }

    #[test]
    fn creates_and_edits_an_individual_without_changing_the_master_creature() {
        let (mut connection, god_id, player_id, campaign_id, creature_id) = setup();
        let character_id = create_creature_npc_in_connection(
            &mut connection,
            CreateCreatureNpcInput {
                campaign_id,
                requesting_user_id: god_id,
                creature_id,
                template_snapshot_json: snapshot(creature_id),
            },
        )
        .expect("create Creature NPC");
        let kind: String = connection
            .query_row(
                "SELECT npc_kind FROM campaign_characters WHERE id=?1",
                [character_id],
                |row| row.get(0),
            )
            .expect("NPC kind");
        assert_eq!(kind, "creature");

        save_creature_npc_in_connection(
            &mut connection,
            SaveCreatureNpcInput {
                character_id,
                campaign_id,
                requesting_user_id: god_id,
                name: "Grik One-Eye".into(),
                personality: "Suspicious scout".into(),
                instance_notes: "Scarred left eye".into(),
                hp_adjustment: 4.0,
                current_snapshot_json: snapshot(creature_id),
                items: vec![CreatureNpcItemInput {
                    item_id: 1,
                    quantity: 1,
                }],
            },
        )
        .expect("save Creature NPC");
        let stored: (String, f64, i64, String) = connection
            .query_row(
                "SELECT character.name,profile.hp_adjustment,
                    (SELECT COUNT(*) FROM campaign_character_items WHERE character_id=character.id),
                    creature.canonical_name
                 FROM campaign_characters character
                 JOIN campaign_creature_npc_profiles profile ON profile.character_id=character.id
                 JOIN creatures creature ON creature.id=profile.creature_id
                 WHERE character.id=?1",
                [character_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("stored Creature NPC");
        assert_eq!(stored, ("Grik One-Eye".into(), 4.0, 1, "Goblin".into()));

        let denied = create_creature_npc_in_connection(
            &mut connection,
            CreateCreatureNpcInput {
                campaign_id,
                requesting_user_id: player_id,
                creature_id,
                template_snapshot_json: snapshot(creature_id),
            },
        );
        assert!(denied.is_err(), "Players cannot create Creature NPCs");
    }
}
