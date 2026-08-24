use rusqlite::{params, Connection, Transaction, TransactionBehavior};
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";
const SUPPORTED_TRADITIONS: [&str; 3] = [
    "Spellcraft/Talismanism/Faith",
    "Psionics",
    "Bardic Resonance",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCharacterSpellInput {
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
    document_json: String,
    add_to_spellbook: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCharacterSpellbookStatusInput {
    saved_spell_id: i64,
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
    in_spellbook: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCharacterSpellInput {
    saved_spell_id: i64,
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
}

struct ParsedSpellDocument {
    document_id: String,
    name: String,
    tradition: String,
    document_json: String,
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

fn parse_spell_document(document_json: &str) -> Result<ParsedSpellDocument, String> {
    let document: Value = serde_json::from_str(document_json)
        .map_err(|error| format!("The saved Spell is not valid JSON: {error}"))?;
    let object = document
        .as_object()
        .ok_or_else(|| "The saved Spell must be a document.".to_string())?;
    let document_id = object
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The saved Spell is missing its stable document ID.".to_string())?;
    let name = object
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "The saved Spell is missing its name field.".to_string())?
        .trim();
    let tradition = object
        .get("tradition")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| SUPPORTED_TRADITIONS.contains(value))
        .ok_or_else(|| "The saved Spell has an unsupported magical tradition.".to_string())?;
    if !object.get("schemaVersion").is_some_and(Value::is_number)
        || !object.get("containers").is_some_and(Value::is_array)
        || !object.get("modifiers").is_some_and(Value::is_array)
    {
        return Err("The saved Spell is missing required construction fields.".to_string());
    }
    Ok(ParsedSpellDocument {
        document_id: document_id.to_string(),
        name: name.to_string(),
        tradition: tradition.to_string(),
        document_json: serde_json::to_string(&document)
            .map_err(|error| format!("The saved Spell could not be normalized: {error}"))?,
    })
}

fn require_character_access(
    transaction: &Transaction<'_>,
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
) -> Result<(), String> {
    let allowed: bool = transaction
        .query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM campaign_characters character
               JOIN campaign_players membership
                 ON membership.campaign_id=character.campaign_id
                AND membership.user_id=character.player_user_id
               WHERE character.id=?1 AND character.campaign_id=?2
                 AND character.player_user_id=?3 AND character.is_npc=0
             )",
            params![character_id, campaign_id, requesting_user_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("Character Spell access could not be checked: {error}"))?;
    if !allowed {
        return Err("A Player may only manage Spells for their own Character.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn save_character_spell(app: AppHandle, input: SaveCharacterSpellInput) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    save_character_spell_in_connection(&mut connection, input)
}

fn save_character_spell_in_connection(
    connection: &mut Connection,
    input: SaveCharacterSpellInput,
) -> Result<i64, String> {
    if input.character_id <= 0 || input.campaign_id <= 0 || input.requesting_user_id <= 0 {
        return Err("Character Spell storage must reference saved records.".to_string());
    }
    let document = parse_spell_document(&input.document_json)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Character Spell transaction could not begin: {error}"))?;
    require_character_access(
        &transaction,
        input.character_id,
        input.campaign_id,
        input.requesting_user_id,
    )?;
    transaction
        .execute(
            "INSERT INTO campaign_character_spell_documents (
               character_id,document_id,name,tradition,document_json,in_spellbook
             ) VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(character_id,document_id) DO UPDATE SET
               name=excluded.name,
               tradition=excluded.tradition,
               document_json=excluded.document_json,
               in_spellbook=CASE
                 WHEN excluded.in_spellbook=1 THEN 1
                 ELSE campaign_character_spell_documents.in_spellbook
               END,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            params![
                input.character_id,
                document.document_id,
                document.name,
                document.tradition,
                document.document_json,
                input.add_to_spellbook,
            ],
        )
        .map_err(|error| format!("The Character Spell could not be saved: {error}"))?;
    let saved_spell_id: i64 = transaction
        .query_row(
            "SELECT id FROM campaign_character_spell_documents
             WHERE character_id=?1 AND document_id=?2",
            params![input.character_id, document.document_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("The saved Character Spell could not be reloaded: {error}"))?;
    transaction.commit().map_err(|error| {
        format!("The Character Spell transaction could not be committed: {error}")
    })?;
    Ok(saved_spell_id)
}

#[tauri::command]
pub fn set_character_spellbook_status(
    app: AppHandle,
    input: SetCharacterSpellbookStatusInput,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    set_character_spellbook_status_in_connection(&mut connection, input)
}

fn set_character_spellbook_status_in_connection(
    connection: &mut Connection,
    input: SetCharacterSpellbookStatusInput,
) -> Result<i64, String> {
    if input.saved_spell_id <= 0
        || input.character_id <= 0
        || input.campaign_id <= 0
        || input.requesting_user_id <= 0
    {
        return Err("Spellbook changes must reference saved records.".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Spellbook transaction could not begin: {error}"))?;
    require_character_access(
        &transaction,
        input.character_id,
        input.campaign_id,
        input.requesting_user_id,
    )?;
    let rows = transaction
        .execute(
            "UPDATE campaign_character_spell_documents
             SET in_spellbook=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?1 AND character_id=?2",
            params![input.saved_spell_id, input.character_id, input.in_spellbook],
        )
        .map_err(|error| format!("The Spellbook could not be updated: {error}"))?;
    if rows != 1 {
        return Err("The selected saved Spell could not be found.".to_string());
    }
    transaction
        .commit()
        .map_err(|error| format!("The Spellbook transaction could not be committed: {error}"))?;
    Ok(input.saved_spell_id)
}

#[tauri::command]
pub fn delete_character_spell(
    app: AppHandle,
    input: DeleteCharacterSpellInput,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    delete_character_spell_in_connection(&mut connection, input)
}

fn delete_character_spell_in_connection(
    connection: &mut Connection,
    input: DeleteCharacterSpellInput,
) -> Result<i64, String> {
    if input.saved_spell_id <= 0
        || input.character_id <= 0
        || input.campaign_id <= 0
        || input.requesting_user_id <= 0
    {
        return Err("Spell deletion must reference saved records.".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Character Spell deletion could not begin: {error}"))?;
    require_character_access(
        &transaction,
        input.character_id,
        input.campaign_id,
        input.requesting_user_id,
    )?;
    let rows = transaction
        .execute(
            "DELETE FROM campaign_character_spell_documents
             WHERE id=?1 AND character_id=?2",
            params![input.saved_spell_id, input.character_id],
        )
        .map_err(|error| format!("The Character Spell could not be deleted: {error}"))?;
    if rows != 1 {
        return Err("The selected saved Spell could not be found.".to_string());
    }
    transaction
        .commit()
        .map_err(|error| format!("The Character Spell deletion could not be committed: {error}"))?;
    Ok(input.saved_spell_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPELL_DOCUMENTS_MIGRATION: &str =
        include_str!("../migrations/0030_add_character_spell_documents.sql");

    fn setup() -> (Connection, i64, i64, i64) {
        let connection = Connection::open_in_memory().expect("open database");
        connection
            .execute_batch(
                "PRAGMA foreign_keys=ON;
                 CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL);
                 CREATE TABLE campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
                 CREATE TABLE campaign_players (
                   campaign_id INTEGER NOT NULL,user_id INTEGER NOT NULL,
                   PRIMARY KEY(campaign_id,user_id)
                 );
                 CREATE TABLE campaign_characters (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   campaign_id INTEGER NOT NULL,
                   player_user_id INTEGER NOT NULL,
                   name TEXT NOT NULL DEFAULT 'New Character',
                   is_npc INTEGER NOT NULL DEFAULT 0
                 );",
            )
            .expect("base schema");
        connection
            .execute_batch(SPELL_DOCUMENTS_MIGRATION)
            .expect("Spell storage migration");
        connection
            .execute("INSERT INTO users (username) VALUES ('Mariner')", [])
            .expect("user");
        let user_id = connection.last_insert_rowid();
        connection
            .execute("INSERT INTO campaigns (name) VALUES ('Tidefall')", [])
            .expect("campaign");
        let campaign_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaign_players (campaign_id,user_id) VALUES (?1,?2)",
                params![campaign_id, user_id],
            )
            .expect("membership");
        connection
            .execute(
                "INSERT INTO campaign_characters (campaign_id,player_user_id,name)
                 VALUES (?1,?2,'Neris')",
                params![campaign_id, user_id],
            )
            .expect("character");
        let character_id = connection.last_insert_rowid();
        (connection, user_id, campaign_id, character_id)
    }

    fn document(name: &str) -> String {
        serde_json::json!({
            "schemaVersion": 6,
            "id": "spell-personal-1",
            "name": name,
            "tradition": "Psionics",
            "containers": [],
            "modifiers": []
        })
        .to_string()
    }

    #[test]
    fn saved_spells_remain_character_scoped_and_can_join_or_leave_the_spellbook() {
        let (mut connection, user_id, campaign_id, character_id) = setup();
        let saved_spell_id = save_character_spell_in_connection(
            &mut connection,
            SaveCharacterSpellInput {
                character_id,
                campaign_id,
                requesting_user_id: user_id,
                document_json: document("Mind Tide"),
                add_to_spellbook: false,
            },
        )
        .expect("save draft");
        let same_id = save_character_spell_in_connection(
            &mut connection,
            SaveCharacterSpellInput {
                character_id,
                campaign_id,
                requesting_user_id: user_id,
                document_json: document("Mind Tide Revised"),
                add_to_spellbook: true,
            },
        )
        .expect("update and add to Spellbook");
        assert_eq!(same_id, saved_spell_id);
        let saved: (String, bool, i64) = connection
            .query_row(
                "SELECT name,in_spellbook,COUNT(*) OVER()
                 FROM campaign_character_spell_documents WHERE character_id=?1",
                [character_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("saved Spell");
        assert_eq!(saved, ("Mind Tide Revised".to_string(), true, 1));

        set_character_spellbook_status_in_connection(
            &mut connection,
            SetCharacterSpellbookStatusInput {
                saved_spell_id,
                character_id,
                campaign_id,
                requesting_user_id: user_id,
                in_spellbook: false,
            },
        )
        .expect("remove from Spellbook without deleting draft");
        let still_saved: bool = connection
            .query_row(
                "SELECT in_spellbook FROM campaign_character_spell_documents WHERE id=?1",
                [saved_spell_id],
                |row| row.get(0),
            )
            .expect("retained draft");
        assert!(!still_saved);

        let denied = save_character_spell_in_connection(
            &mut connection,
            SaveCharacterSpellInput {
                character_id,
                campaign_id,
                requesting_user_id: user_id + 999,
                document_json: document("Stolen"),
                add_to_spellbook: true,
            },
        )
        .expect_err("another profile cannot save to this Character");
        assert!(denied.contains("own Character"));

        delete_character_spell_in_connection(
            &mut connection,
            DeleteCharacterSpellInput {
                saved_spell_id,
                character_id,
                campaign_id,
                requesting_user_id: user_id,
            },
        )
        .expect("delete saved Spell");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM campaign_character_spell_documents",
                [],
                |row| row.get(0),
            )
            .expect("remaining rows");
        assert_eq!(count, 0);
    }
}
