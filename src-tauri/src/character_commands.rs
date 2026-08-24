use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";
const ATTRIBUTE_KEYS: [&str; 6] = ["STR", "DEX", "CON", "INT", "WIS", "CHR"];
const SPECIAL_ABILITY_EFFECTIVE_MAXIMUM: f64 = 100.0;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCharacterInput {
    campaign_id: i64,
    player_user_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNpcInput {
    campaign_id: i64,
    requesting_user_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCharacterAggregateInput {
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
    administrative_override: bool,
    complete_creation: bool,
    name: String,
    profile: CharacterProfileInput,
    attributes: Vec<CharacterAttributeInput>,
    skill_allocations: Vec<CharacterSkillAllocationInput>,
    items: Vec<CharacterItemInput>,
    currency_holdings: Vec<CharacterCurrencyHoldingInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceCharacterSkillInput {
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
    skill_id: i64,
    parent_allocation_id: Option<i64>,
    points_to_add: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterProfileInput {
    race_id: Option<i64>,
    age: Option<i64>,
    sex: String,
    height_feet: Option<i64>,
    height_inches: Option<i64>,
    weight: Option<f64>,
    skin_color: String,
    eye_color: String,
    hair_color: String,
    deity: String,
    defining_marks: String,
    personality: String,
    goals: String,
    secrets: String,
    backstory: String,
    motivations: String,
    fame: f64,
    experience: f64,
    total_experience: f64,
    quintessence: f64,
    total_quintessence: f64,
    fate_points: Option<i64>,
    credits_remaining: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterAttributeInput {
    attribute_key: String,
    value: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterSkillAllocationInput {
    skill_id: i64,
    points: f64,
    children: Vec<CharacterSkillAllocationInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterItemInput {
    item_id: i64,
    quantity: i64,
    unit_cost_credits: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterCurrencyHoldingInput {
    currency_id: i64,
    quantity: i64,
}

#[derive(Clone)]
struct CampaignSkillRules {
    skill_points: f64,
    max_starting_skill: f64,
    points_to_unlock_next_tier: f64,
    max_points_in_skill: f64,
    allowed_systems: HashSet<String>,
    administrative_override: bool,
    enforce_campaign_tier_limits: bool,
    racial_skill_values: HashMap<i64, f64>,
    racial_skill_ids: HashSet<i64>,
    mana_pools: HashMap<String, f64>,
}

#[derive(Clone)]
struct SkillMeta {
    id: i64,
    name: String,
    classification: String,
    tier: Option<i64>,
    spell_level: Option<String>,
    mana_cost: Option<f64>,
}

fn allocated_points_for_skill(allocations: &[CharacterSkillAllocationInput], skill_id: i64) -> f64 {
    allocations.iter().fold(0.0, |largest, allocation| {
        let own_points = if allocation.skill_id == skill_id {
            allocation.points.max(0.0)
        } else {
            0.0
        };
        largest
            .max(own_points)
            .max(allocated_points_for_skill(&allocation.children, skill_id))
    })
}

fn build_character_mana_pools(
    transaction: &Transaction<'_>,
    race_id: Option<i64>,
    allocations: &[CharacterSkillAllocationInput],
    racial_skill_values: &HashMap<i64, f64>,
) -> Result<HashMap<String, f64>, String> {
    let base_magic = if let Some(race_id) = race_id {
        transaction
            .query_row(
                "SELECT COALESCE(base_magic,0) FROM races WHERE id=?1",
                [race_id],
                |row| row.get::<_, f64>(0),
            )
            .map_err(|error| format!("Race Base Magic could not be read: {error}"))?
    } else {
        0.0
    };

    let mut source_ids = HashMap::new();
    let mut statement = transaction
        .prepare(
            "SELECT id,lower(name) FROM skills
             WHERE lower(name) IN ('channeling','devotion','psionic channeling','resonance attunement')
             ORDER BY id",
        )
        .map_err(|error| format!("Mana source Skills could not be read: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("Mana source Skills could not be read: {error}"))?;
    for row in rows {
        let (skill_id, name) =
            row.map_err(|error| format!("Mana source Skills could not be read: {error}"))?;
        source_ids.entry(name).or_insert(skill_id);
    }

    let mana_for = |source_name: &str| {
        source_ids
            .get(source_name)
            .map(|skill_id| {
                let purchased = allocated_points_for_skill(allocations, *skill_id);
                let racial = racial_skill_values.get(skill_id).copied().unwrap_or(0.0);
                (purchased + racial) * base_magic
            })
            .unwrap_or(0.0)
    };
    let channeling_mana = mana_for("channeling");

    Ok(HashMap::from([
        ("Spellcraft".to_string(), channeling_mana),
        ("Talismanism".to_string(), channeling_mana),
        ("Faith".to_string(), mana_for("devotion")),
        ("Psyonics".to_string(), mana_for("psionic channeling")),
        (
            "Bardic Resonance".to_string(),
            mana_for("resonance attunement"),
        ),
    ]))
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

fn clean(value: &str) -> String {
    value.trim().to_string()
}

fn finite_non_negative(value: f64, label: &str) -> Result<f64, String> {
    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(format!("{label} must be a finite number zero or greater."))
    }
}

fn optional_non_negative(value: Option<f64>, label: &str) -> Result<Option<f64>, String> {
    value
        .map(|number| finite_non_negative(number, label))
        .transpose()
}

#[tauri::command]
pub fn create_character_aggregate(
    app: AppHandle,
    input: CreateCharacterInput,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    create_character_aggregate_in_connection(&mut connection, input)
}

fn create_character_aggregate_in_connection(
    connection: &mut Connection,
    input: CreateCharacterInput,
) -> Result<i64, String> {
    if input.campaign_id <= 0 || input.player_user_id <= 0 {
        return Err("Campaign and Player must reference saved records.".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Character creation transaction could not begin: {error}"))?;
    let starting_credits: Option<f64> = transaction
        .query_row(
            "SELECT campaign.starting_credit_amount
             FROM campaign_players membership
             JOIN campaigns campaign ON campaign.id=membership.campaign_id
             WHERE membership.campaign_id=?1 AND membership.user_id=?2
               AND membership.is_npc_controller=0",
            params![input.campaign_id, input.player_user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Campaign membership could not be checked: {error}"))?;
    let Some(starting_credits) = starting_credits else {
        return Err("The Player does not belong to the requested Campaign.".to_string());
    };

    let character_id = insert_character_shell(
        &transaction,
        input.campaign_id,
        input.player_user_id,
        "New Character",
        false,
        starting_credits,
    )?;
    transaction.commit().map_err(|error| {
        format!("The Character creation transaction could not be committed: {error}")
    })?;
    Ok(character_id)
}

fn insert_character_shell(
    transaction: &Transaction<'_>,
    campaign_id: i64,
    controller_user_id: i64,
    name: &str,
    is_npc: bool,
    starting_credits: f64,
) -> Result<i64, String> {
    let fate_points: Option<i64> = transaction
        .query_row(
            "SELECT CASE WHEN fate_point_method='Assigned'
                    THEN COALESCE(assigned_fate_points,0) ELSE NULL END
             FROM campaigns WHERE id=?1",
            [campaign_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("Campaign Fate Points could not be read: {error}"))?;
    transaction
        .execute(
            "INSERT INTO campaign_characters (campaign_id,player_user_id,name,is_npc)
             VALUES (?1,?2,?3,?4)",
            params![campaign_id, controller_user_id, name, is_npc],
        )
        .map_err(|error| format!("The Character identity could not be created: {error}"))?;
    let character_id = transaction.last_insert_rowid();
    transaction
        .execute(
            "INSERT INTO campaign_character_profiles
             (character_id,fate_points,credits_remaining) VALUES (?1,?2,?3)",
            params![character_id, fate_points, starting_credits],
        )
        .map_err(|error| format!("The Character profile could not be initialized: {error}"))?;
    for attribute_key in ATTRIBUTE_KEYS {
        transaction
            .execute(
                "INSERT INTO campaign_character_attributes (character_id,attribute_key,value)
                 VALUES (?1,?2,25)",
                params![character_id, attribute_key],
            )
            .map_err(|error| {
                format!("The Character Attributes could not be initialized: {error}")
            })?;
    }
    let currency_system: String = transaction
        .query_row(
            "SELECT currency_system FROM campaigns WHERE id=?1",
            [campaign_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("The Campaign currency system could not be read: {error}"))?;
    replace_character_currency_holdings(
        transaction,
        character_id,
        campaign_id,
        &currency_system,
        &[],
        starting_credits,
        false,
    )?;
    Ok(character_id)
}

#[tauri::command]
pub fn create_npc_aggregate(app: AppHandle, input: CreateNpcInput) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    create_npc_aggregate_in_connection(&mut connection, input)
}

fn create_npc_aggregate_in_connection(
    connection: &mut Connection,
    input: CreateNpcInput,
) -> Result<i64, String> {
    if input.campaign_id <= 0 || input.requesting_user_id <= 0 {
        return Err("NPC creation must reference a saved Campaign and G.O.D. profile.".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The NPC creation transaction could not begin: {error}"))?;
    let starting_credits: Option<f64> = transaction
        .query_row(
            "SELECT campaign.starting_credit_amount
             FROM campaigns campaign
             WHERE campaign.id=?1 AND EXISTS (
               SELECT 1 FROM user_roles actor_role
               WHERE actor_role.user_id=?2 AND actor_role.role='god'
             )",
            params![input.campaign_id, input.requesting_user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("NPC Campaign access could not be checked: {error}"))?;
    let Some(starting_credits) = starting_credits else {
        return Err("NPC creation requires a saved Campaign and G.O.D. profile.".to_string());
    };
    transaction
        .execute(
            "INSERT INTO campaign_players (campaign_id,user_id,is_npc_controller)
             VALUES (?1,?2,1)
             ON CONFLICT(campaign_id,user_id) DO NOTHING",
            params![input.campaign_id, input.requesting_user_id],
        )
        .map_err(|error| format!("The NPC controller link could not be saved: {error}"))?;
    let character_id = insert_character_shell(
        &transaction,
        input.campaign_id,
        input.requesting_user_id,
        "New NPC",
        true,
        starting_credits,
    )?;
    transaction
        .commit()
        .map_err(|error| format!("The NPC creation transaction could not be committed: {error}"))?;
    Ok(character_id)
}

#[tauri::command]
pub fn save_character_aggregate(
    app: AppHandle,
    input: SaveCharacterAggregateInput,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    save_character_aggregate_in_connection(&mut connection, input)
}

#[tauri::command]
pub fn advance_character_skill(
    app: AppHandle,
    input: AdvanceCharacterSkillInput,
) -> Result<i64, String> {
    let mut connection = open_database(&app)?;
    advance_character_skill_in_connection(&mut connection, input)
}

fn save_character_aggregate_in_connection(
    connection: &mut Connection,
    input: SaveCharacterAggregateInput,
) -> Result<i64, String> {
    if input.character_id <= 0 || input.campaign_id <= 0 || input.requesting_user_id <= 0 {
        return Err("Character ownership must reference saved records.".to_string());
    }
    let name = required(&input.name, "Character Name")?;
    if input.profile.height_feet.is_some_and(|value| value < 0) {
        return Err("Height feet must be zero or greater.".to_string());
    }
    if input
        .profile
        .height_inches
        .is_some_and(|value| !(0..=11).contains(&value))
    {
        return Err("Height inches must be between 0 and 11.".to_string());
    }
    let normalized_height =
        if input.profile.height_feet.is_some() || input.profile.height_inches.is_some() {
            Some((
                input.profile.height_feet.unwrap_or(0),
                input.profile.height_inches.unwrap_or(0),
            ))
        } else {
            None
        };
    let height = normalized_height.map(|(feet, inches)| (feet * 12 + inches) as f64);
    let weight = optional_non_negative(input.profile.weight, "Weight")?;
    if input.profile.age.is_some_and(|age| age < 0) {
        return Err("Age must be zero or greater.".to_string());
    }
    let fame = finite_non_negative(input.profile.fame, "Fame")?;
    let experience = finite_non_negative(input.profile.experience, "Experience")?;
    let total_experience = finite_non_negative(input.profile.total_experience, "Total Experience")?;
    let quintessence = finite_non_negative(input.profile.quintessence, "Quintessence")?;
    let total_quintessence =
        finite_non_negative(input.profile.total_quintessence, "Total Quintessence")?;
    let requested_credits_remaining =
        finite_non_negative(input.profile.credits_remaining, "Current funds")?;

    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Character save transaction could not begin: {error}"))?;
    let campaign_rules: Option<(
        f64,
        f64,
        f64,
        f64,
        f64,
        String,
        String,
        Option<i64>,
        Option<String>,
        i64,
        bool,
        bool,
    )> = transaction
        .query_row(
            "SELECT campaign.attribute_points,campaign.skill_points,
                    campaign.max_starting_skill,campaign.points_to_unlock_next_tier,
                    campaign.max_points_in_skill,campaign.currency_system,
                    campaign.fate_point_method,campaign.assigned_fate_points,
                    profile.creation_completed_at,
                    character.player_user_id,character.is_npc,
                    EXISTS(
                      SELECT 1 FROM user_roles actor_role
                      WHERE actor_role.user_id=?3 AND actor_role.role='god'
                    )
             FROM campaign_characters character
             JOIN campaign_players membership
               ON membership.campaign_id=character.campaign_id
              AND membership.user_id=character.player_user_id
             JOIN campaigns campaign ON campaign.id=character.campaign_id
             JOIN campaign_character_profiles profile ON profile.character_id=character.id
             WHERE character.id=?1 AND character.campaign_id=?2",
            params![
                input.character_id,
                input.campaign_id,
                input.requesting_user_id
            ],
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
        .optional()
        .map_err(|error| format!("Character ownership could not be checked: {error}"))?;
    let Some((
        attribute_budget,
        skill_budget,
        max_starting_skill,
        tier_unlock_points,
        max_points_in_skill,
        currency_system,
        fate_point_method,
        assigned_fate_points,
        creation_completed_at,
        character_owner_id,
        character_is_npc,
        requesting_user_is_god,
    )) = campaign_rules
    else {
        return Err("The Character does not belong to the requested Campaign.".to_string());
    };
    if input.administrative_override && !requesting_user_is_god {
        return Err("G.O.D. Character access requires a G.O.D. profile.".to_string());
    }
    if !input.administrative_override
        && (character_is_npc || character_owner_id != input.requesting_user_id)
    {
        return Err("The Character does not belong to this Player and Campaign.".to_string());
    }
    if creation_completed_at.is_some() && !input.administrative_override {
        return Err(
            "Character creation is complete and its creation record is permanently locked."
                .to_string(),
        );
    }
    let enforce_campaign_tier_limits =
        creation_completed_at.is_none() && !input.administrative_override;
    let fate_points = if input.administrative_override {
        input.profile.fate_points
    } else if fate_point_method == "Assigned" {
        Some(assigned_fate_points.unwrap_or(0))
    } else {
        input.profile.fate_points
    };
    if fate_points.is_some_and(|value| value < 0) {
        return Err("Fate Points must be a whole number zero or greater.".to_string());
    }

    if let Some(race_id) = input.profile.race_id {
        if race_id <= 0 {
            return Err("Race must reference a saved Campaign Race.".to_string());
        }
        let allowed: bool = transaction
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM campaign_allowed_races
                   WHERE campaign_id=?1 AND race_id=?2
                 )",
                params![input.campaign_id, race_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("Campaign Race access could not be checked: {error}"))?;
        if !allowed {
            return Err("The selected Race is not allowed in this Campaign.".to_string());
        }
    }

    let total_attribute_points = validate_attributes(
        &transaction,
        &input.attributes,
        input.profile.race_id,
        attribute_budget,
        !input.administrative_override,
    )?;
    let allowed_system_rows = {
        let mut statement = transaction
            .prepare(
                "SELECT system_name FROM campaign_allowed_systems
                 WHERE campaign_id=?1",
            )
            .map_err(|error| format!("Campaign Skill access could not be read: {error}"))?;
        let rows = statement
            .query_map([input.campaign_id], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Campaign Skill access could not be read: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Campaign Skill access could not be read: {error}"))?
    };
    let (racial_skill_values, racial_skill_ids) = {
        let mut values = HashMap::new();
        let mut ids = HashSet::new();
        if let Some(race_id) = input.profile.race_id {
            let mut statement = transaction
                .prepare("SELECT skill_id,value FROM race_skill_links WHERE race_id=?1")
                .map_err(|error| format!("Race Skill bonuses could not be read: {error}"))?;
            let rows = statement
                .query_map([race_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, Option<f64>>(1)?))
                })
                .map_err(|error| format!("Race Skill bonuses could not be read: {error}"))?;
            for row in rows {
                let (skill_id, value) =
                    row.map_err(|error| format!("Race Skill bonuses could not be read: {error}"))?;
                ids.insert(skill_id);
                *values.entry(skill_id).or_insert(0.0) += value.unwrap_or(0.0).max(0.0);
            }
        }
        (values, ids)
    };
    let mana_pools = build_character_mana_pools(
        &transaction,
        input.profile.race_id,
        &input.skill_allocations,
        &racial_skill_values,
    )?;
    let skill_rules = CampaignSkillRules {
        skill_points: skill_budget,
        max_starting_skill,
        points_to_unlock_next_tier: tier_unlock_points,
        max_points_in_skill,
        allowed_systems: allowed_system_rows.into_iter().collect(),
        administrative_override: input.administrative_override,
        enforce_campaign_tier_limits,
        racial_skill_values,
        racial_skill_ids,
        mana_pools,
    };

    transaction
        .execute(
            "UPDATE campaign_characters SET name=?1,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",
            params![name, input.character_id],
        )
        .map_err(|error| format!("The Character identity could not be saved: {error}"))?;

    for table in [
        "campaign_character_attributes",
        "campaign_character_skill_allocations",
        "campaign_character_items",
    ] {
        transaction
            .execute(
                &format!("DELETE FROM {table} WHERE character_id=?1"),
                [input.character_id],
            )
            .map_err(|error| {
                format!("Existing Character data in {table} could not be replaced: {error}")
            })?;
    }
    for attribute in &input.attributes {
        transaction
            .execute(
                "INSERT INTO campaign_character_attributes (character_id,attribute_key,value)
                 VALUES (?1,?2,?3)",
                params![
                    input.character_id,
                    attribute.attribute_key.trim(),
                    attribute.value
                ],
            )
            .map_err(|error| format!("A Character Attribute could not be saved: {error}"))?;
    }

    let mut total_skill_points = 0.0;
    let mut root_skills = HashSet::new();
    for allocation in &input.skill_allocations {
        if !root_skills.insert(allocation.skill_id) {
            return Err("A Tier 1 Skill cannot be allocated twice.".to_string());
        }
        validate_and_insert_skill(
            &transaction,
            input.character_id,
            allocation,
            None,
            None,
            &skill_rules,
            &mut total_skill_points,
        )?;
    }
    if !input.administrative_override && total_skill_points > skill_rules.skill_points + 0.000_001 {
        return Err(
            "Character Skill allocations exceed the Campaign Skill Point budget.".to_string(),
        );
    }
    let calculated_credits_remaining = validate_and_insert_items(
        &transaction,
        input.character_id,
        input.campaign_id,
        &input.items,
        input.administrative_override,
    )?;
    if input.complete_creation {
        validate_creation_completion(
            &transaction,
            &input,
            &name,
            normalized_height,
            weight,
            total_attribute_points,
            total_skill_points,
            attribute_budget,
            skill_budget,
            &fate_point_method,
            fate_points,
        )?;
    }
    let requested_balance = if input.administrative_override {
        requested_credits_remaining
    } else {
        calculated_credits_remaining
    };
    let credits_remaining = replace_character_currency_holdings(
        &transaction,
        input.character_id,
        input.campaign_id,
        &currency_system,
        &input.currency_holdings,
        requested_balance,
        input.administrative_override,
    )?;
    transaction
        .execute(
            "INSERT INTO campaign_character_profiles (
               character_id,race_id,age,sex,height,weight,skin_color,eye_color,hair_color,
               deity,defining_marks,personality,goals,secrets,backstory,motivations,
               fame,experience,total_experience,quintessence,total_quintessence,
               fate_points,credits_remaining
             ) VALUES (
               ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
               ?17,?18,?19,?20,?21,?22,?23
             )
             ON CONFLICT(character_id) DO UPDATE SET
               race_id=excluded.race_id,age=excluded.age,sex=excluded.sex,
               height=excluded.height,weight=excluded.weight,
               skin_color=excluded.skin_color,eye_color=excluded.eye_color,
               hair_color=excluded.hair_color,deity=excluded.deity,
               defining_marks=excluded.defining_marks,personality=excluded.personality,
               goals=excluded.goals,secrets=excluded.secrets,backstory=excluded.backstory,
               motivations=excluded.motivations,fame=excluded.fame,
               experience=excluded.experience,total_experience=excluded.total_experience,
               quintessence=excluded.quintessence,
               total_quintessence=excluded.total_quintessence,
               fate_points=excluded.fate_points,
               credits_remaining=excluded.credits_remaining,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            params![
                input.character_id,
                input.profile.race_id,
                input.profile.age,
                clean(&input.profile.sex),
                height,
                weight,
                clean(&input.profile.skin_color),
                clean(&input.profile.eye_color),
                clean(&input.profile.hair_color),
                clean(&input.profile.deity),
                clean(&input.profile.defining_marks),
                clean(&input.profile.personality),
                clean(&input.profile.goals),
                clean(&input.profile.secrets),
                clean(&input.profile.backstory),
                clean(&input.profile.motivations),
                fame,
                experience,
                total_experience,
                quintessence,
                total_quintessence,
                fate_points,
                credits_remaining,
            ],
        )
        .map_err(|error| format!("The Character profile could not be saved: {error}"))?;

    transaction
        .execute(
            "UPDATE campaign_character_profiles
             SET height_feet=?2,height_inches=?3
             WHERE character_id=?1",
            params![
                input.character_id,
                normalized_height.map(|value| value.0),
                normalized_height.map(|value| value.1),
            ],
        )
        .map_err(|error| format!("Character height units could not be saved: {error}"))?;

    if input.complete_creation {
        transaction
            .execute(
                "UPDATE campaign_character_profiles
                 SET creation_completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE character_id=?1 AND creation_completed_at IS NULL",
                [input.character_id],
            )
            .map_err(|error| format!("Character completion could not be recorded: {error}"))?;
    }

    transaction.commit().map_err(|error| {
        format!("The Character save transaction could not be committed: {error}")
    })?;
    Ok(input.character_id)
}

fn build_saved_character_mana_pools(
    transaction: &Transaction<'_>,
    character_id: i64,
    race_id: Option<i64>,
    racial_skill_values: &HashMap<i64, f64>,
) -> Result<HashMap<String, f64>, String> {
    let base_magic = if let Some(race_id) = race_id {
        transaction
            .query_row(
                "SELECT COALESCE(base_magic,0) FROM races WHERE id=?1",
                [race_id],
                |row| row.get::<_, f64>(0),
            )
            .map_err(|error| format!("Race Base Magic could not be read: {error}"))?
    } else {
        0.0
    };
    let mut source_ids = HashMap::new();
    let mut statement = transaction
        .prepare(
            "SELECT id,lower(name) FROM skills
             WHERE lower(name) IN ('channeling','devotion','psionic channeling','resonance attunement')
             ORDER BY id",
        )
        .map_err(|error| format!("Mana source Skills could not be read: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("Mana source Skills could not be read: {error}"))?;
    for row in rows {
        let (skill_id, name) =
            row.map_err(|error| format!("Mana source Skills could not be read: {error}"))?;
        source_ids.entry(name).or_insert(skill_id);
    }
    drop(statement);

    let mana_for = |source_name: &str| -> Result<f64, String> {
        let Some(skill_id) = source_ids.get(source_name) else {
            return Ok(0.0);
        };
        let purchased: f64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(points),0)
                 FROM campaign_character_skill_allocations
                 WHERE character_id=?1 AND skill_id=?2",
                params![character_id, skill_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("Character Mana Skills could not be read: {error}"))?;
        Ok((purchased + racial_skill_values.get(skill_id).copied().unwrap_or(0.0)) * base_magic)
    };
    let channeling_mana = mana_for("channeling")?;
    Ok(HashMap::from([
        ("Spellcraft".to_string(), channeling_mana),
        ("Talismanism".to_string(), channeling_mana),
        ("Faith".to_string(), mana_for("devotion")?),
        ("Psyonics".to_string(), mana_for("psionic channeling")?),
        (
            "Bardic Resonance".to_string(),
            mana_for("resonance attunement")?,
        ),
    ]))
}

fn advance_character_skill_in_connection(
    connection: &mut Connection,
    input: AdvanceCharacterSkillInput,
) -> Result<i64, String> {
    if input.character_id <= 0
        || input.campaign_id <= 0
        || input.requesting_user_id <= 0
        || input.skill_id <= 0
        || input.parent_allocation_id.is_some_and(|id| id <= 0)
        || input.points_to_add <= 0
    {
        return Err("Character advancement must reference saved records.".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| {
            format!("The Character advancement transaction could not begin: {error}")
        })?;
    let context: Option<(f64, f64, Option<i64>, f64, f64, Option<String>, i64, bool)> = transaction
        .query_row(
            "SELECT campaign.points_to_unlock_next_tier,campaign.max_points_in_skill,
                    profile.race_id,profile.experience,profile.total_experience,
                    profile.creation_completed_at,character.player_user_id,character.is_npc
             FROM campaign_characters character
             JOIN campaign_players membership
               ON membership.campaign_id=character.campaign_id
              AND membership.user_id=character.player_user_id
             JOIN campaigns campaign ON campaign.id=character.campaign_id
             JOIN campaign_character_profiles profile ON profile.character_id=character.id
             WHERE character.id=?1 AND character.campaign_id=?2",
            params![input.character_id, input.campaign_id],
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
                ))
            },
        )
        .optional()
        .map_err(|error| format!("Character advancement access could not be checked: {error}"))?;
    let Some((
        tier_unlock_points,
        max_points_in_skill,
        race_id,
        available_experience,
        lifetime_experience,
        creation_completed_at,
        character_owner_id,
        character_is_npc,
    )) = context
    else {
        return Err("The Character does not belong to the requested Campaign.".to_string());
    };
    if character_is_npc || character_owner_id != input.requesting_user_id {
        return Err("A Player may only advance their own Character.".to_string());
    }
    if creation_completed_at.is_none() {
        return Err(
            "Character creation must be completed before Experience can be spent.".to_string(),
        );
    }

    let allowed_systems = {
        let mut statement = transaction
            .prepare("SELECT system_name FROM campaign_allowed_systems WHERE campaign_id=?1")
            .map_err(|error| format!("Campaign Skill access could not be read: {error}"))?;
        let rows = statement
            .query_map([input.campaign_id], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Campaign Skill access could not be read: {error}"))?;
        rows.collect::<Result<HashSet<_>, _>>()
            .map_err(|error| format!("Campaign Skill access could not be read: {error}"))?
    };
    let (racial_skill_values, racial_skill_ids) = {
        let mut values = HashMap::new();
        let mut ids = HashSet::new();
        if let Some(race_id) = race_id {
            let mut statement = transaction
                .prepare("SELECT skill_id,value FROM race_skill_links WHERE race_id=?1")
                .map_err(|error| format!("Race Skill bonuses could not be read: {error}"))?;
            let rows = statement
                .query_map([race_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, Option<f64>>(1)?))
                })
                .map_err(|error| format!("Race Skill bonuses could not be read: {error}"))?;
            for row in rows {
                let (skill_id, value) =
                    row.map_err(|error| format!("Race Skill bonuses could not be read: {error}"))?;
                ids.insert(skill_id);
                *values.entry(skill_id).or_insert(0.0) += value.unwrap_or(0.0).max(0.0);
            }
        }
        (values, ids)
    };
    let mana_pools = build_saved_character_mana_pools(
        &transaction,
        input.character_id,
        race_id,
        &racial_skill_values,
    )?;
    let rules = CampaignSkillRules {
        skill_points: 0.0,
        max_starting_skill: 0.0,
        points_to_unlock_next_tier: tier_unlock_points,
        max_points_in_skill,
        allowed_systems,
        administrative_override: false,
        enforce_campaign_tier_limits: false,
        racial_skill_values,
        racial_skill_ids,
        mana_pools,
    };

    let skill = read_skill(&transaction, input.skill_id)?;
    let racially_granted = rules.racial_skill_ids.contains(&skill.id);
    let mut parent_context: Option<(i64, SkillMeta, f64)> = None;
    let root_skill = if let Some(parent_allocation_id) = input.parent_allocation_id {
        let parent_row: Option<(i64, Option<i64>, f64)> = transaction
            .query_row(
                "SELECT skill_id,parent_allocation_id,points
                 FROM campaign_character_skill_allocations
                 WHERE id=?1 AND character_id=?2",
                params![parent_allocation_id, input.character_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|error| format!("The parent Skill allocation could not be read: {error}"))?;
        let Some((parent_skill_id, mut ancestor_id, parent_points)) = parent_row else {
            return Err("The selected parent Skill path no longer exists.".to_string());
        };
        let parent_skill = read_skill(&transaction, parent_skill_id)?;
        let linked: bool = transaction
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM skill_relationships
                   WHERE skill_id=?1 AND related_skill_id=?2
                     AND relationship_type='parent' COLLATE NOCASE
                 )",
                params![skill.id, parent_skill.id],
                |row| row.get(0),
            )
            .map_err(|error| {
                format!("The Skill parent relationship could not be checked: {error}")
            })?;
        if !linked {
            return Err(format!(
                "Skill {:?} is not a child of {:?}.",
                skill.name, parent_skill.name
            ));
        }
        if let (Some(parent_tier), Some(child_tier)) = (parent_skill.tier, skill.tier) {
            if child_tier != parent_tier + 1 {
                return Err(
                    "Skill advancement tiers do not follow their parent branch.".to_string()
                );
            }
        }
        let mut root = parent_skill.clone();
        let mut visited = HashSet::from([parent_allocation_id]);
        while let Some(next_id) = ancestor_id {
            if !visited.insert(next_id) {
                return Err("The saved Skill path contains a cycle.".to_string());
            }
            let ancestor: Option<(i64, Option<i64>)> = transaction
                .query_row(
                    "SELECT skill_id,parent_allocation_id
                     FROM campaign_character_skill_allocations
                     WHERE id=?1 AND character_id=?2",
                    params![next_id, input.character_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|error| format!("The Skill ancestry could not be read: {error}"))?;
            let Some((ancestor_skill_id, next_parent_id)) = ancestor else {
                return Err("The saved Skill path has a missing parent.".to_string());
            };
            root = read_skill(&transaction, ancestor_skill_id)?;
            ancestor_id = next_parent_id;
        }
        parent_context = Some((parent_allocation_id, parent_skill, parent_points));
        root
    } else {
        if skill.tier.is_some_and(|tier| tier != 1) {
            return Err(
                "Tier 2 and Tier 3 Skills require an unlocked parent allocation.".to_string(),
            );
        }
        skill.clone()
    };
    validate_skill_access(&skill, &root_skill, &rules, racially_granted)?;
    if let Some((_, parent_skill, parent_points)) = &parent_context {
        let unlock_threshold = skill_unlock_threshold(&root_skill, tier_unlock_points)?;
        let parent_effective_points = parent_points
            + rules
                .racial_skill_values
                .get(&parent_skill.id)
                .copied()
                .unwrap_or(0.0);
        if !racially_granted && parent_effective_points + 0.000_001 < unlock_threshold {
            return Err(format!(
                "Skill {:?} is locked until its parent reaches {unlock_threshold} points.",
                skill.name
            ));
        }
    }

    let existing: Option<(i64, f64)> = transaction
        .query_row(
            "SELECT id,points FROM campaign_character_skill_allocations
             WHERE character_id=?1 AND skill_id=?2 AND parent_allocation_id IS ?3
             LIMIT 1",
            params![input.character_id, skill.id, input.parent_allocation_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| format!("The current Skill allocation could not be read: {error}"))?;
    let purchased_points = existing.map(|(_, points)| points).unwrap_or(0.0);
    let racial_minimum = rules
        .racial_skill_values
        .get(&skill.id)
        .copied()
        .unwrap_or(0.0);
    let effective_points = purchased_points + racial_minimum;
    let points_to_add = input.points_to_add as f64;
    let effective_maximum = effective_skill_maximum(&skill, max_points_in_skill);
    if effective_points + points_to_add > effective_maximum + 0.000_001 {
        return Err(format!(
            "Skill {:?} is already at its maximum of {effective_maximum} effective points.",
            skill.name
        ));
    }
    let mut experience_cost = 0.0;
    let mut projected_points = effective_points;
    for _ in 0..input.points_to_add {
        experience_cost += if projected_points > 0.000_001 {
            projected_points
        } else {
            10.0
        };
        projected_points += 1.0;
    }
    if available_experience + 0.000_001 < experience_cost {
        return Err(format!(
            "Skill {:?} costs {experience_cost} Experience, but only {available_experience} is available.",
            skill.name
        ));
    }

    if let Some((allocation_id, _)) = existing {
        transaction
            .execute(
                "UPDATE campaign_character_skill_allocations
                 SET points=points+?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id=?1",
                params![allocation_id, points_to_add],
            )
            .map_err(|error| format!("The Skill advancement could not be saved: {error}"))?;
    } else {
        transaction
            .execute(
                "INSERT INTO campaign_character_skill_allocations
                 (character_id,skill_id,parent_allocation_id,points)
                 VALUES (?1,?2,?3,?4)",
                params![
                    input.character_id,
                    skill.id,
                    input.parent_allocation_id,
                    points_to_add
                ],
            )
            .map_err(|error| format!("The new Skill could not be purchased: {error}"))?;
    }
    transaction
        .execute(
            "UPDATE campaign_character_profiles
             SET experience=?2,total_experience=?3,
                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE character_id=?1",
            params![
                input.character_id,
                (available_experience - experience_cost).max(0.0),
                lifetime_experience + experience_cost,
            ],
        )
        .map_err(|error| format!("Character Experience could not be spent: {error}"))?;
    transaction
        .execute(
            "UPDATE campaign_characters
             SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1",
            [input.character_id],
        )
        .map_err(|error| format!("Character advancement time could not be recorded: {error}"))?;
    transaction.commit().map_err(|error| {
        format!("The Character advancement transaction could not be committed: {error}")
    })?;
    Ok(input.character_id)
}

fn validate_attributes(
    transaction: &Transaction<'_>,
    attributes: &[CharacterAttributeInput],
    race_id: Option<i64>,
    attribute_budget: f64,
    enforce_creation_rules: bool,
) -> Result<f64, String> {
    if attributes.len() != ATTRIBUTE_KEYS.len() {
        return Err("A Character must have exactly six core Attribute allocations.".to_string());
    }
    let mut seen = HashSet::new();
    let mut total = 0.0;
    for attribute in attributes {
        let key = attribute.attribute_key.trim();
        if !ATTRIBUTE_KEYS.contains(&key) || !seen.insert(key.to_string()) {
            return Err(
                "Character Attributes must contain each canonical key exactly once.".to_string(),
            );
        }
        let value = finite_non_negative(attribute.value, &format!("{key} Attribute"))?;
        total += value;
        if enforce_creation_rules {
            if let Some(race_id) = race_id {
                let cap: Option<f64> = transaction
                    .query_row(
                        "SELECT max_value FROM race_attribute_caps
                     WHERE race_id=?1 AND attribute_key=?2 LIMIT 1",
                        params![race_id, key],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|error| {
                        format!("The Race Attribute cap could not be read: {error}")
                    })?;
                if cap.is_some_and(|maximum| value > maximum + 0.000_001) {
                    return Err(format!("{key} exceeds the selected Race maximum."));
                }
            }
        }
    }
    if enforce_creation_rules && total > attribute_budget + 0.000_001 {
        return Err("Character Attributes exceed the Campaign Attribute Point budget.".to_string());
    }
    Ok(total)
}

#[allow(clippy::too_many_arguments)]
fn validate_creation_completion(
    transaction: &Transaction<'_>,
    input: &SaveCharacterAggregateInput,
    name: &str,
    height: Option<(i64, i64)>,
    weight: Option<f64>,
    total_attribute_points: f64,
    total_skill_points: f64,
    attribute_budget: f64,
    skill_budget: f64,
    fate_point_method: &str,
    fate_points: Option<i64>,
) -> Result<(), String> {
    let profile = &input.profile;
    let identity_complete = !name.eq_ignore_ascii_case("New Character")
        && profile.race_id.is_some()
        && profile.age.is_some()
        && !profile.sex.trim().is_empty()
        && height.is_some_and(|(feet, inches)| feet * 12 + inches > 0)
        && weight.is_some_and(|value| value > 0.0)
        && !profile.skin_color.trim().is_empty()
        && !profile.eye_color.trim().is_empty()
        && !profile.hair_color.trim().is_empty()
        && !profile.deity.trim().is_empty()
        && !profile.defining_marks.trim().is_empty()
        && (fate_point_method != "Rolled" || fate_points.is_some());
    if !identity_complete {
        return Err(
            "Character creation cannot be completed until every required Identity field is valid."
                .to_string(),
        );
    }
    if (total_attribute_points - attribute_budget).abs() > 0.000_001 {
        return Err(
            "Character creation requires the exact Campaign Attribute Point budget.".to_string(),
        );
    }
    if (total_skill_points - skill_budget).abs() > 0.000_001 {
        return Err(
            "Character creation requires the exact Campaign Skill Point budget.".to_string(),
        );
    }
    let story_complete = [
        &profile.personality,
        &profile.goals,
        &profile.secrets,
        &profile.backstory,
        &profile.motivations,
    ]
    .into_iter()
    .all(|value| !value.trim().is_empty());
    if !story_complete {
        return Err(
            "Character creation cannot be completed until every Story and Personality field contains something."
                .to_string(),
        );
    }
    let equipment_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*)
             FROM campaign_character_items owned
             JOIN items item ON item.id=owned.item_id
             WHERE owned.character_id=?1
               AND item.catalog_scope='equipment' COLLATE NOCASE
               AND owned.quantity>0",
            [input.character_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("Starting Equipment could not be verified: {error}"))?;
    if equipment_count == 0 {
        return Err(
            "Character creation requires at least one Campaign-authorized Equipment purchase."
                .to_string(),
        );
    }
    Ok(())
}

fn read_skill(transaction: &Transaction<'_>, skill_id: i64) -> Result<SkillMeta, String> {
    transaction
        .query_row(
            "SELECT skill.id,skill.name,skill.classification,skill.tier,
               (SELECT json_extract(extension.data_json,'$.spreadsheetReference.masteryLabel')
                FROM skill_extensions extension
                WHERE extension.skill_id=skill.id
                  AND extension.extension_type='spell-import-source' COLLATE NOCASE
                ORDER BY extension.id LIMIT 1),
               (SELECT CAST(json_extract(extension.data_json,'$.spreadsheetReference.statedSpellCost') AS REAL)
                FROM skill_extensions extension
                WHERE extension.skill_id=skill.id
                  AND extension.extension_type='spell-import-source' COLLATE NOCASE
                ORDER BY extension.id LIMIT 1)
             FROM skills skill WHERE skill.id=?1",
            [skill_id],
            |row| {
                Ok(SkillMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    classification: row.get(2)?,
                    tier: row.get(3)?,
                    spell_level: row.get(4)?,
                    mana_cost: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("A Skill allocation could not be read: {error}"))?
        .ok_or_else(|| "A Skill allocation references a missing Skill.".to_string())
}

fn spell_level_index(level: &str) -> Option<usize> {
    match level.trim().to_lowercase().as_str() {
        "apprentice" => Some(0),
        "novice" => Some(1),
        "master" => Some(2),
        "high master" => Some(3),
        "grand master" => Some(4),
        _ => None,
    }
}

fn spell_access_level_for_mana_pool(mana_pool: f64) -> Option<usize> {
    [1.0, 12.0, 32.0, 72.0, 142.0]
        .iter()
        .rposition(|required| mana_pool + 0.000_001 >= *required)
}

fn spell_access_required_mana(level_index: usize) -> Option<f64> {
    [1.0, 12.0, 32.0, 72.0, 142.0].get(level_index).copied()
}

fn magic_system_for_root(root: &SkillMeta) -> Option<&'static str> {
    match root.name.trim().to_lowercase().as_str() {
        "spellcraft" => Some("Spellcraft"),
        "talismanism" => Some("Talismanism"),
        "faith" | "prayer" => Some("Faith"),
        "psionic focus" => Some("Psyonics"),
        "resonant performance" => Some("Bardic Resonance"),
        _ => None,
    }
}

fn validate_spell_mana_access(
    skill: &SkillMeta,
    root: &SkillMeta,
    rules: &CampaignSkillRules,
) -> Result<(), String> {
    if rules.administrative_override {
        return Ok(());
    }
    let classification = skill.classification.trim().to_lowercase();
    let requires_casting_level = skill.spell_level.is_some()
        || matches!(
            classification.as_str(),
            "spell" | "psionic skill" | "reverberation"
        )
        || (skill.tier == Some(3) && magic_system_for_root(root).is_some());
    if !requires_casting_level {
        return Ok(());
    }
    let system = magic_system_for_root(root).ok_or_else(|| {
        format!(
            "Spell or supernatural Skill {:?} is not attached to a recognized casting tree.",
            skill.name
        )
    })?;
    let spell_level = skill.spell_level.as_deref().ok_or_else(|| {
        format!(
            "Spell or Tier 3 supernatural Skill {:?} has no recorded casting level and cannot be assigned to a Player.",
            skill.name
        )
    })?;
    let required_level = spell_level_index(spell_level).ok_or_else(|| {
        format!(
            "Spell or Tier 3 supernatural Skill {:?} has an unrecognized casting level {:?}.",
            skill.name, spell_level
        )
    })?;
    let mana_pool = rules.mana_pools.get(system).copied().unwrap_or(0.0);
    let access_level = spell_access_level_for_mana_pool(mana_pool);
    if access_level.is_some_and(|level| level >= required_level) {
        return Ok(());
    }
    let required_mana = spell_access_required_mana(required_level).unwrap_or(0.0);
    let mana_cost = skill
        .mana_cost
        .map(|cost| format!("; recorded cost {cost} Mana"))
        .unwrap_or_default();
    Err(format!(
        "Spell or Tier 3 supernatural Skill {:?} requires {spell_level} casting access ({required_mana} Mana), but the {system} pool is {mana_pool}{mana_cost}.",
        skill.name
    ))
}

fn root_systems(skill: &SkillMeta) -> Result<Vec<&'static str>, String> {
    let name = skill.name.to_lowercase();
    let classification = skill.classification.to_lowercase();
    if classification == "standard" {
        return Ok(vec![]);
    }
    if classification == "special ability" || classification == "special abilities" {
        return Ok(vec!["Special Abilities"]);
    }
    match name.as_str() {
        "spellcraft" => Ok(vec!["Spellcraft"]),
        "talismanism" => Ok(vec!["Talismanism"]),
        "faith" | "prayer" | "devotion" => Ok(vec!["Faith"]),
        "psionic focus" | "psionic meditation" | "psionic channeling" => Ok(vec!["Psyonics"]),
        "resonant performance" | "resonance attunement" | "harmonic awareness" => {
            Ok(vec!["Bardic Resonance"])
        }
        "channeling" | "meditation" => Ok(vec!["Spellcraft", "Talismanism"]),
        _ => Err(format!(
            "Skill {:?} cannot be used as a root Character allocation.",
            skill.name
        )),
    }
}

fn is_special_ability(skill: &SkillMeta) -> bool {
    matches!(
        skill.classification.trim().to_lowercase().as_str(),
        "special ability" | "special abilities"
    )
}

fn effective_skill_maximum(skill: &SkillMeta, campaign_maximum: f64) -> f64 {
    if is_special_ability(skill) {
        SPECIAL_ABILITY_EFFECTIVE_MAXIMUM
    } else {
        campaign_maximum
    }
}

fn validate_skill_access(
    skill: &SkillMeta,
    root: &SkillMeta,
    rules: &CampaignSkillRules,
    racially_granted: bool,
) -> Result<(), String> {
    validate_spell_mana_access(skill, root, rules)?;
    if racially_granted {
        return Ok(());
    }
    if rules.enforce_campaign_tier_limits {
        if let Some(tier) = skill.tier {
            let tier_name = format!("Tier {tier}");
            if !rules.allowed_systems.contains(&tier_name) {
                return Err(format!("{tier_name} is not allowed in this Campaign."));
            }
        }
    }
    let systems = root_systems(root)?;
    if !systems.is_empty()
        && !systems
            .iter()
            .any(|system| rules.allowed_systems.contains(*system))
    {
        return Err(format!(
            "Skill system for {:?} is not allowed in this Campaign.",
            root.name
        ));
    }
    Ok(())
}

fn skill_unlock_threshold(root: &SkillMeta, campaign_threshold: f64) -> Result<f64, String> {
    let uses_one_point_unlock = root_systems(root)?.into_iter().any(|system| {
        matches!(
            system,
            "Spellcraft" | "Talismanism" | "Faith" | "Psyonics" | "Bardic Resonance"
        )
    });
    Ok(if uses_one_point_unlock {
        1.0
    } else {
        campaign_threshold
    })
}

#[allow(clippy::too_many_arguments)]
fn validate_and_insert_skill(
    transaction: &Transaction<'_>,
    character_id: i64,
    allocation: &CharacterSkillAllocationInput,
    parent: Option<(i64, &SkillMeta, f64)>,
    root: Option<&SkillMeta>,
    rules: &CampaignSkillRules,
    total_points: &mut f64,
) -> Result<i64, String> {
    if allocation.skill_id <= 0 {
        return Err("Skill allocations must reference saved Skills.".to_string());
    }
    let points = finite_non_negative(allocation.points, "Skill Points Invested")?;
    let racial_minimum = rules
        .racial_skill_values
        .get(&allocation.skill_id)
        .copied()
        .unwrap_or(0.0);
    let racially_granted = rules.racial_skill_ids.contains(&allocation.skill_id);
    let skill = read_skill(transaction, allocation.skill_id)?;
    if points <= 0.0 && !racially_granted && allocation.children.is_empty() {
        return Err(
            "A zero-point Skill allocation must be a racial Skill or a structural parent."
                .to_string(),
        );
    }
    if !rules.administrative_override && points > rules.max_starting_skill + 0.000_001 {
        return Err(
            "Purchased starting points exceed Max Starting Points Spent per Skill.".to_string(),
        );
    }
    let purchased_maximum =
        (effective_skill_maximum(&skill, rules.max_points_in_skill) - racial_minimum).max(0.0);
    if points > purchased_maximum + 0.000_001 {
        return Err("A Skill allocation exceeds its effective maximum.".to_string());
    }
    let root_skill = root.unwrap_or(&skill);
    validate_skill_access(&skill, root_skill, rules, racially_granted)?;

    let parent_id = if let Some((parent_allocation_id, parent_skill, parent_points)) = parent {
        let linked: bool = transaction
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM skill_relationships
                   WHERE skill_id=?1 AND related_skill_id=?2
                     AND relationship_type='parent' COLLATE NOCASE
                 )",
                params![skill.id, parent_skill.id],
                |row| row.get(0),
            )
            .map_err(|error| {
                format!("The Skill parent relationship could not be checked: {error}")
            })?;
        if !linked {
            return Err(format!(
                "Skill {:?} is not a child of {:?}.",
                skill.name, parent_skill.name
            ));
        }
        let unlock_threshold =
            skill_unlock_threshold(root_skill, rules.points_to_unlock_next_tier)?;
        let parent_effective_points = parent_points
            + rules
                .racial_skill_values
                .get(&parent_skill.id)
                .copied()
                .unwrap_or(0.0);
        if !racially_granted && parent_effective_points + 0.000_001 < unlock_threshold {
            return Err(format!(
                "Skill {:?} is locked until its parent reaches {unlock_threshold} invested points.",
                skill.name,
            ));
        }
        if let (Some(parent_tier), Some(child_tier)) = (parent_skill.tier, skill.tier) {
            if child_tier != parent_tier + 1 {
                return Err("Skill allocation tiers do not follow their parent branch.".to_string());
            }
        }
        Some(parent_allocation_id)
    } else {
        if skill.tier.is_some_and(|tier| tier != 1) {
            return Err("Tier 2 and Tier 3 Skills require a parent allocation.".to_string());
        }
        None
    };

    *total_points += points;
    let result = transaction
        .execute(
            "INSERT INTO campaign_character_skill_allocations
             (character_id,skill_id,parent_allocation_id,points)
             VALUES (?1,?2,?3,?4)",
            params![character_id, skill.id, parent_id, points],
        )
        .map_err(|error| format!("A Character Skill allocation could not be saved: {error}"))?;
    if result != 1 {
        return Err("A Character Skill allocation was not saved.".to_string());
    }
    let allocation_id = transaction.last_insert_rowid();
    let mut child_skills = HashSet::new();
    for child in &allocation.children {
        if !child_skills.insert(child.skill_id) {
            return Err(
                "A Skill cannot appear twice under the same parent allocation.".to_string(),
            );
        }
        validate_and_insert_skill(
            transaction,
            character_id,
            child,
            Some((allocation_id, &skill, points)),
            Some(root_skill),
            rules,
            total_points,
        )?;
    }
    Ok(allocation_id)
}

fn validate_and_insert_items(
    transaction: &Transaction<'_>,
    character_id: i64,
    campaign_id: i64,
    items: &[CharacterItemInput],
    administrative_override: bool,
) -> Result<f64, String> {
    let starting_credits: f64 = transaction
        .query_row(
            "SELECT starting_credit_amount FROM campaigns WHERE id=?1",
            [campaign_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("Campaign starting Credits could not be read: {error}"))?;
    let mut item_ids = HashSet::new();
    let mut spent = 0.0;
    for item in items {
        if item.item_id <= 0 || !item_ids.insert(item.item_id) {
            return Err(
                "Character Items must reference unique authorized master Items.".to_string(),
            );
        }
        if item.quantity <= 0 {
            return Err("Character Item quantity must be greater than zero.".to_string());
        }
        let unit_cost = finite_non_negative(item.unit_cost_credits, "Item unit cost")?;
        let catalog_cost: Option<Option<f64>> = transaction
            .query_row(
                "SELECT item.credits
                 FROM campaign_inventory_items allowed
                 JOIN items item ON item.id=allowed.item_id
                 WHERE allowed.campaign_id=?1 AND allowed.item_id=?2",
                params![campaign_id, item.item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| {
                format!("Campaign Item authorization could not be checked: {error}")
            })?;
        let Some(catalog_cost) = catalog_cost else {
            return Err("A Character Item is not authorized by this Campaign.".to_string());
        };
        let saved_cost = if administrative_override {
            unit_cost
        } else {
            let Some(catalog_cost) = catalog_cost else {
                return Err("A Character Item is not priced by this Campaign.".to_string());
            };
            if (catalog_cost - unit_cost).abs() > 0.000_001 {
                return Err("A Character Item cost no longer matches its master Item.".to_string());
            }
            catalog_cost
        };
        spent += saved_cost * item.quantity as f64;
        if !administrative_override && spent > starting_credits + 0.000_001 {
            return Err("Character Items exceed the remaining starting funds.".to_string());
        }
        transaction
            .execute(
                "INSERT INTO campaign_character_items
                 (character_id,item_id,quantity,unit_cost_credits)
                 VALUES (?1,?2,?3,?4)",
                params![character_id, item.item_id, item.quantity, saved_cost],
            )
            .map_err(|error| format!("A Character Item could not be saved: {error}"))?;
    }
    Ok((starting_credits - spent).max(0.0))
}

fn replace_character_currency_holdings(
    transaction: &Transaction<'_>,
    character_id: i64,
    campaign_id: i64,
    currency_system: &str,
    requested_holdings: &[CharacterCurrencyHoldingInput],
    canonical_credits: f64,
    preserve_requested_denominations: bool,
) -> Result<f64, String> {
    let mut statement = transaction
        .prepare(
            "SELECT id,credits_per_unit
             FROM campaign_derived_currencies
             WHERE campaign_id=?1
             ORDER BY credits_per_unit DESC,sort_order,id",
        )
        .map_err(|error| format!("Campaign denominations could not be read: {error}"))?;
    let currencies = statement
        .query_map([campaign_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
        })
        .map_err(|error| format!("Campaign denominations could not be read: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Campaign denominations could not be read: {error}"))?;
    drop(statement);

    if currency_system == "Credits" {
        if preserve_requested_denominations && !requested_holdings.is_empty() {
            return Err("A Credits Campaign cannot store derived Currency holdings.".to_string());
        }
        transaction
            .execute(
                "DELETE FROM campaign_character_currency_holdings WHERE character_id=?1",
                [character_id],
            )
            .map_err(|error| {
                format!("Existing Character currency could not be replaced: {error}")
            })?;
        return Ok(canonical_credits);
    }
    if currency_system != "Derived Currency" {
        return Err("The Campaign has an unsupported Currency System.".to_string());
    }
    if currencies.is_empty() {
        return Err("Derived Currency requires at least one saved denomination.".to_string());
    }

    let quantities = if preserve_requested_denominations {
        let currency_ids = currencies.iter().map(|(id, _)| *id).collect::<HashSet<_>>();
        let mut requested = HashMap::new();
        for holding in requested_holdings {
            if holding.currency_id <= 0 || !currency_ids.contains(&holding.currency_id) {
                return Err("A Character Currency is not part of this Campaign.".to_string());
            }
            if holding.quantity < 0 {
                return Err(
                    "Currency quantities must be whole numbers zero or greater.".to_string()
                );
            }
            if requested
                .insert(holding.currency_id, holding.quantity)
                .is_some()
            {
                return Err("A Character Currency cannot appear twice in one purse.".to_string());
            }
        }
        currencies
            .iter()
            .map(|(id, _)| (*id, requested.get(id).copied().unwrap_or(0)))
            .collect::<Vec<_>>()
    } else {
        const CURRENCY_SCALE: f64 = 1_000_000.0;
        let scaled_credits = (canonical_credits * CURRENCY_SCALE).round();
        if !scaled_credits.is_finite() || scaled_credits > i64::MAX as f64 {
            return Err("The Character currency balance is too large to store safely.".to_string());
        }
        let mut remaining = scaled_credits as i64;
        let mut distributed = Vec::with_capacity(currencies.len());
        for (currency_id, credits_per_unit) in &currencies {
            let unit_value = (credits_per_unit * CURRENCY_SCALE).round() as i64;
            if unit_value <= 0 {
                return Err(
                    "A Campaign denomination is too small to store at supported precision."
                        .to_string(),
                );
            }
            let quantity = remaining / unit_value;
            remaining -= quantity * unit_value;
            distributed.push((*currency_id, quantity));
        }
        distributed
    };

    transaction
        .execute(
            "DELETE FROM campaign_character_currency_holdings WHERE character_id=?1",
            [character_id],
        )
        .map_err(|error| format!("Existing Character currency could not be replaced: {error}"))?;
    for (currency_id, quantity) in &quantities {
        if *quantity == 0 {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO campaign_character_currency_holdings
                 (character_id,currency_id,quantity) VALUES (?1,?2,?3)",
                params![character_id, currency_id, quantity],
            )
            .map_err(|error| format!("A Character Currency holding could not be saved: {error}"))?;
    }

    if preserve_requested_denominations {
        let quantity_by_id = quantities.into_iter().collect::<HashMap<_, _>>();
        let total = currencies
            .iter()
            .fold(0.0, |sum, (currency_id, unit_value)| {
                sum + quantity_by_id.get(currency_id).copied().unwrap_or(0) as f64 * unit_value
            });
        Ok((total * 1_000_000.0).round() / 1_000_000.0)
    } else {
        Ok(canonical_credits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const USERS: &str = include_str!("../migrations/0001_create_local_accounts.sql");
    const SKILLS: &str = include_str!("../migrations/0002_create_skills.sql");
    const RACES: &str = include_str!("../migrations/0005_create_races.sql");
    const ITEMS: &str = include_str!("../migrations/0013_create_items.sql");
    const CAMPAIGNS: &str = include_str!("../migrations/0015_create_campaigns.sql");
    const CAMPAIGN_PLAYERS: &str = include_str!("../migrations/0016_create_campaign_players.sql");
    const CHARACTERS: &str = include_str!("../migrations/0017_create_campaign_characters.sql");
    const CHARACTER_AGGREGATE: &str =
        include_str!("../migrations/0018_create_character_aggregate.sql");
    const CHARACTER_COMPLETION: &str =
        include_str!("../migrations/0019_lock_completed_character_creation.sql");
    const CHARACTER_HEIGHT_UNITS: &str =
        include_str!("../migrations/0020_add_character_height_units.sql");
    const RACIAL_SKILL_ANCHORS: &str =
        include_str!("../migrations/0023_allow_racial_skill_anchors.sql");
    const CAMPAIGN_NPCS: &str = include_str!("../migrations/0026_add_campaign_npcs.sql");
    const CHARACTER_CURRENCY_HOLDINGS: &str =
        include_str!("../migrations/0027_store_character_currency_holdings.sql");
    const FATE_POINTS: &str = include_str!("../migrations/0028_add_fate_points.sql");

    struct Fixture {
        connection: Connection,
        user_id: i64,
        campaign_id: i64,
        race_id: i64,
        root_skill_id: i64,
        child_skill_id: i64,
        channeling_skill_id: i64,
        spellcraft_skill_id: i64,
        sphere_skill_id: i64,
        spell_skill_id: i64,
        item_id: i64,
    }

    fn base_schema(include_aggregate: bool) -> Connection {
        let connection = Connection::open_in_memory().expect("open database");
        connection.execute_batch(USERS).expect("users");
        connection.execute_batch(SKILLS).expect("skills");
        connection.execute_batch(RACES).expect("races");
        connection.execute_batch(ITEMS).expect("items");
        connection.execute_batch(CAMPAIGNS).expect("campaigns");
        connection
            .execute_batch(CAMPAIGN_PLAYERS)
            .expect("Campaign Players");
        connection.execute_batch(CHARACTERS).expect("Characters");
        connection
            .execute_batch(CAMPAIGN_NPCS)
            .expect("Campaign NPCs");
        connection
            .execute_batch(CHARACTER_CURRENCY_HOLDINGS)
            .expect("Character currency holdings");
        if include_aggregate {
            connection
                .execute_batch(CHARACTER_AGGREGATE)
                .expect("Character aggregate");
            connection
                .execute_batch(CHARACTER_COMPLETION)
                .expect("Character completion");
            connection
                .execute_batch(CHARACTER_HEIGHT_UNITS)
                .expect("Character height units");
            connection
                .execute_batch(RACIAL_SKILL_ANCHORS)
                .expect("Racial Skill anchors");
            connection.execute_batch(FATE_POINTS).expect("Fate Points");
        }
        connection
    }

    fn setup() -> Fixture {
        let connection = base_schema(true);
        connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Player','hash','salt',1)",
                [],
            )
            .expect("Player");
        let user_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaigns (
                   name,attribute_points,skill_points,max_starting_skill,
                   points_to_unlock_next_tier,max_points_in_skill,
                   starting_credit_amount,currency_system,created_by_user_id
                 ) VALUES ('Tidefall',150,10,10,5,75,100,'Credits',?1)",
                [user_id],
            )
            .expect("Campaign");
        let campaign_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaign_players (campaign_id,user_id) VALUES (?1,?2)",
                params![campaign_id, user_id],
            )
            .expect("membership");
        for (index, system) in ["Tier 1", "Tier 2", "Tier 3", "Spellcraft"]
            .into_iter()
            .enumerate()
        {
            connection
                .execute(
                    "INSERT INTO campaign_allowed_systems
                     (campaign_id,system_name,sort_order) VALUES (?1,?2,?3)",
                    params![campaign_id, system, index as i64],
                )
                .expect("system");
        }
        connection
            .execute(
                "INSERT INTO races (name,size,base_magic) VALUES ('Human','Medium',2)",
                [],
            )
            .expect("Race");
        let race_id = connection.last_insert_rowid();
        for (index, key) in ATTRIBUTE_KEYS.into_iter().enumerate() {
            connection
                .execute(
                    "INSERT INTO race_attribute_caps
                     (race_id,attribute_key,max_value,sort_order) VALUES (?1,?2,40,?3)",
                    params![race_id, key, index as i64],
                )
                .expect("Race cap");
        }
        connection
            .execute(
                "INSERT INTO campaign_allowed_races (campaign_id,race_id,sort_order)
                 VALUES (?1,?2,0)",
                params![campaign_id, race_id],
            )
            .expect("allowed Race");
        connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Athletics','standard',1,'STR')",
                [],
            )
            .expect("root Skill");
        let root_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Climbing','standard',2,'STR')",
                [],
            )
            .expect("child Skill");
        let child_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skill_relationships
                 (skill_id,related_skill_id,relationship_type,sort_order)
                 VALUES (?1,?2,'parent',0)",
                params![child_skill_id, root_skill_id],
            )
            .expect("Skill relationship");
        connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Channeling','magic stabalization',1,'INT')",
                [],
            )
            .expect("Channeling Skill");
        let channeling_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Spellcraft','magic access',1,'INT')",
                [],
            )
            .expect("Spellcraft Skill");
        let spellcraft_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Evocation','sphere',2,'INT')",
                [],
            )
            .expect("Sphere Skill");
        let sphere_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Flame Bolt','spell',3,'INT')",
                [],
            )
            .expect("Spell Skill");
        let spell_skill_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO skill_extensions
                 (skill_id,extension_type,schema_version,data_json)
                 VALUES (?1,'spell-import-source',1,?2)",
                params![
                    spell_skill_id,
                    r#"{"spreadsheetReference":{"masteryLabel":"Apprentice","statedSpellCost":8}}"#
                ],
            )
            .expect("Spell import source");
        connection
            .execute(
                "INSERT INTO skill_relationships
                 (skill_id,related_skill_id,relationship_type,sort_order)
                 VALUES (?1,?2,'parent',0), (?3,?1,'parent',0)",
                params![sphere_skill_id, spellcraft_skill_id, spell_skill_id],
            )
            .expect("Spellcraft relationships");
        connection
            .execute(
                "INSERT INTO items (
                   canonical_id,name,catalog_scope,equipment_group,record_type,
                   family,category,credits,price_basis
                 ) VALUES ('ITEM-TEST','Rope','equipment','general','Item','Gear','Gear',10,'each')",
                [],
            )
            .expect("Item");
        let item_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaign_inventory_items (campaign_id,item_id,sort_order)
                 VALUES (?1,?2,0)",
                params![campaign_id, item_id],
            )
            .expect("allowed Item");
        Fixture {
            connection,
            user_id,
            campaign_id,
            race_id,
            root_skill_id,
            child_skill_id,
            channeling_skill_id,
            spellcraft_skill_id,
            sphere_skill_id,
            spell_skill_id,
            item_id,
        }
    }

    fn save_input(fixture: &Fixture, character_id: i64) -> SaveCharacterAggregateInput {
        SaveCharacterAggregateInput {
            character_id,
            campaign_id: fixture.campaign_id,
            requesting_user_id: fixture.user_id,
            administrative_override: false,
            complete_creation: false,
            name: "Neris".to_string(),
            profile: CharacterProfileInput {
                race_id: Some(fixture.race_id),
                age: Some(24),
                sex: "Female".to_string(),
                height_feet: Some(5),
                height_inches: Some(7),
                weight: Some(65.0),
                skin_color: "Bronze".to_string(),
                eye_color: "Green".to_string(),
                hair_color: "Black".to_string(),
                deity: "None".to_string(),
                defining_marks: "None".to_string(),
                personality: "Patient".to_string(),
                goals: "Explore".to_string(),
                secrets: "None".to_string(),
                backstory: "A traveler.".to_string(),
                motivations: "Discovery".to_string(),
                fame: 0.0,
                experience: 0.0,
                total_experience: 0.0,
                quintessence: 0.0,
                total_quintessence: 0.0,
                fate_points: Some(0),
                credits_remaining: 80.0,
            },
            attributes: ATTRIBUTE_KEYS
                .into_iter()
                .map(|attribute_key| CharacterAttributeInput {
                    attribute_key: attribute_key.to_string(),
                    value: 25.0,
                })
                .collect(),
            skill_allocations: vec![CharacterSkillAllocationInput {
                skill_id: fixture.root_skill_id,
                points: 5.0,
                children: vec![CharacterSkillAllocationInput {
                    skill_id: fixture.child_skill_id,
                    points: 5.0,
                    children: vec![],
                }],
            }],
            items: vec![CharacterItemInput {
                item_id: fixture.item_id,
                quantity: 2,
                unit_cost_credits: 10.0,
            }],
            currency_holdings: vec![],
        }
    }

    #[test]
    fn creation_requires_membership_and_initializes_the_complete_aggregate() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "UPDATE campaigns SET fate_point_method='Assigned',assigned_fate_points=3
                 WHERE id=?1",
                [fixture.campaign_id],
            )
            .expect("assign Campaign Fate Points");
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let initialized: (String, f64, Option<i64>, i64, i64, i64) = fixture
            .connection
            .query_row(
                "SELECT character.name,profile.credits_remaining,profile.fate_points,
                   (SELECT COUNT(*) FROM campaign_character_attributes WHERE character_id=character.id),
                   (SELECT COUNT(*) FROM campaign_character_skill_allocations WHERE character_id=character.id),
                   (SELECT COUNT(*) FROM campaign_character_items WHERE character_id=character.id)
                 FROM campaign_characters character
                 JOIN campaign_character_profiles profile ON profile.character_id=character.id
                 WHERE character.id=?1",
                [character_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .expect("initialized aggregate");
        assert_eq!(
            initialized,
            ("New Character".into(), 100.0, Some(3), 6, 0, 0)
        );

        let mut altered_assigned_fate = save_input(&fixture, character_id);
        altered_assigned_fate.profile.fate_points = Some(99);
        save_character_aggregate_in_connection(&mut fixture.connection, altered_assigned_fate)
            .expect("save player Character");
        let stored_fate: Option<i64> = fixture
            .connection
            .query_row(
                "SELECT fate_points FROM campaign_character_profiles WHERE character_id=?1",
                [character_id],
                |row| row.get(0),
            )
            .expect("read assigned Fate Points");
        assert_eq!(
            stored_fate,
            Some(3),
            "players cannot alter assigned Fate Points"
        );

        fixture
            .connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Outsider','hash','salt',1)",
                [],
            )
            .expect("outsider");
        let outsider_id = fixture.connection.last_insert_rowid();
        assert!(create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: outsider_id,
            },
        )
        .is_err());
    }

    #[test]
    fn god_creates_a_campaign_scoped_npc_without_exposing_a_player_membership() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Game Master','hash','salt',1)",
                [],
            )
            .expect("G.O.D. profile");
        let god_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO user_roles (user_id,role) VALUES (?1,'god')",
                [god_id],
            )
            .expect("G.O.D. role");

        let npc_id = create_npc_aggregate_in_connection(
            &mut fixture.connection,
            CreateNpcInput {
                campaign_id: fixture.campaign_id,
                requesting_user_id: god_id,
            },
        )
        .expect("create NPC");
        let npc_record: (String, bool, f64, i64, bool) = fixture
            .connection
            .query_row(
                "SELECT character.name,character.is_npc,profile.credits_remaining,
                   (SELECT COUNT(*) FROM campaign_character_attributes
                    WHERE character_id=character.id),membership.is_npc_controller
                 FROM campaign_characters character
                 JOIN campaign_character_profiles profile ON profile.character_id=character.id
                 JOIN campaign_players membership
                   ON membership.campaign_id=character.campaign_id
                  AND membership.user_id=character.player_user_id
                 WHERE character.id=?1",
                [npc_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("initialized NPC aggregate");
        assert_eq!(npc_record, ("New NPC".into(), true, 100.0, 6, true));

        let player_character_error = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: god_id,
            },
        )
        .expect_err("an NPC controller link is not a Player membership");
        assert!(player_character_error.contains("does not belong"));

        let mut administrative_save = save_input(&fixture, npc_id);
        administrative_save.requesting_user_id = god_id;
        administrative_save.administrative_override = true;
        administrative_save.name = "Harbormaster Vey".to_string();
        save_character_aggregate_in_connection(&mut fixture.connection, administrative_save)
            .expect("G.O.D. can edit the complete NPC sheet");
        let saved_name: String = fixture
            .connection
            .query_row(
                "SELECT name FROM campaign_characters WHERE id=?1 AND is_npc=1",
                [npc_id],
                |row| row.get(0),
            )
            .expect("saved NPC name");
        assert_eq!(saved_name, "Harbormaster Vey");

        let outsider_error = create_npc_aggregate_in_connection(
            &mut fixture.connection,
            CreateNpcInput {
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
            },
        )
        .expect_err("Player-only profiles cannot create NPCs");
        assert!(outsider_error.contains("G.O.D."));
    }

    #[test]
    fn derived_currency_initializes_from_credits_then_preserves_exact_denominations() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "UPDATE campaigns SET currency_system='Derived Currency' WHERE id=?1",
                [fixture.campaign_id],
            )
            .expect("Derived Currency Campaign");
        fixture
            .connection
            .execute(
                "INSERT INTO campaign_derived_currencies
                 (campaign_id,name,description,credits_per_unit,sort_order)
                 VALUES (?1,'Gold','A gold coin.',1,0)",
                [fixture.campaign_id],
            )
            .expect("Gold");
        let gold_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO campaign_derived_currencies
                 (campaign_id,name,description,credits_per_unit,sort_order)
                 VALUES (?1,'Platinum','A platinum coin.',5,1)",
                [fixture.campaign_id],
            )
            .expect("Platinum");
        let platinum_id = fixture.connection.last_insert_rowid();
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character with converted starting money");
        let initial_holdings: Vec<(String, i64)> = {
            let mut statement = fixture
                .connection
                .prepare(
                    "SELECT currency.name,holding.quantity
                     FROM campaign_character_currency_holdings holding
                     JOIN campaign_derived_currencies currency ON currency.id=holding.currency_id
                     WHERE holding.character_id=?1 ORDER BY currency.credits_per_unit DESC",
                )
                .expect("initial purse query");
            statement
                .query_map([character_id], |row| Ok((row.get(0)?, row.get(1)?)))
                .expect("initial purse rows")
                .collect::<Result<Vec<_>, _>>()
                .expect("initial purse")
        };
        assert_eq!(initial_holdings, vec![("Platinum".into(), 20)]);

        fixture
            .connection
            .execute(
                "INSERT INTO user_roles (user_id,role) VALUES (?1,'god')",
                [fixture.user_id],
            )
            .expect("G.O.D. role");
        let mut input = save_input(&fixture, character_id);
        input.administrative_override = true;
        input.profile.credits_remaining = 100.0;
        input.currency_holdings = vec![
            CharacterCurrencyHoldingInput {
                currency_id: gold_id,
                quantity: 10,
            },
            CharacterCurrencyHoldingInput {
                currency_id: platinum_id,
                quantity: 0,
            },
        ];
        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("save the exact physical purse");

        let saved: (i64, i64, f64) = fixture
            .connection
            .query_row(
                "SELECT
                   (SELECT quantity FROM campaign_character_currency_holdings
                    WHERE character_id=?1 AND currency_id=?2),
                   COALESCE((SELECT quantity FROM campaign_character_currency_holdings
                    WHERE character_id=?1 AND currency_id=?3),0),
                   (SELECT credits_remaining FROM campaign_character_profiles
                    WHERE character_id=?1)",
                params![character_id, gold_id, platinum_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("saved exact purse");
        assert_eq!(saved, (10, 0, 10.0));
    }

    #[test]
    fn racial_skill_points_are_free_parent_minimums_and_zero_anchors_persist() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "INSERT INTO race_skill_links (race_id,skill_id,link_type,value,sort_order)
                 VALUES (?1,?2,'bonus',5,0)",
                params![fixture.race_id, fixture.root_skill_id],
            )
            .expect("racial Skill bonus");
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let mut input = save_input(&fixture, character_id);
        input.skill_allocations = vec![CharacterSkillAllocationInput {
            skill_id: fixture.root_skill_id,
            points: 0.0,
            children: vec![CharacterSkillAllocationInput {
                skill_id: fixture.child_skill_id,
                points: 5.0,
                children: vec![],
            }],
        }];

        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("racial bonus unlocks its child without spending the racial points");
        let saved: (f64, f64) = fixture
            .connection
            .query_row(
                "SELECT root.points,child.points
                 FROM campaign_character_skill_allocations root
                 JOIN campaign_character_skill_allocations child
                   ON child.parent_allocation_id=root.id
                 WHERE root.character_id=?1",
                [character_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("reload racial Skill path");
        assert_eq!(saved, (0.0, 5.0));
    }

    #[test]
    fn spell_access_uses_the_current_spell_range_unlock_points() {
        let levels = [0.0, 1.0, 11.0, 12.0, 31.0, 32.0, 71.0, 72.0, 141.0, 142.0]
            .map(spell_access_level_for_mana_pool);
        assert_eq!(
            levels,
            [
                None,
                Some(0),
                Some(0),
                Some(1),
                Some(1),
                Some(2),
                Some(2),
                Some(3),
                Some(3),
                Some(4),
            ]
        );
    }

    #[test]
    fn advancement_spends_current_points_or_ten_for_a_new_skill_atomically() {
        let mut fixture = setup();
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let input = save_input(&fixture, character_id);
        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("save Character");
        fixture
            .connection
            .execute(
                "UPDATE campaign_character_profiles
                 SET experience=30,total_experience=40,creation_completed_at='completed'
                 WHERE character_id=?1",
                [character_id],
            )
            .expect("completed Character with Experience");

        advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: fixture.root_skill_id,
                parent_allocation_id: None,
                points_to_add: 2,
            },
        )
        .expect("advance an owned Skill twice for five plus six Experience");
        let after_owned: (f64, f64, f64) = fixture
            .connection
            .query_row(
                "SELECT allocation.points,profile.experience,profile.total_experience
                 FROM campaign_character_skill_allocations allocation
                 JOIN campaign_character_profiles profile ON profile.character_id=allocation.character_id
                 WHERE allocation.character_id=?1 AND allocation.skill_id=?2",
                params![character_id, fixture.root_skill_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("owned advancement");
        assert_eq!(after_owned, (7.0, 19.0, 51.0));

        fixture
            .connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Survival','standard',1,'WIS')",
                [],
            )
            .expect("locked branch root");
        let locked_root_skill_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Foraging','standard',2,'WIS')",
                [],
            )
            .expect("locked branch child");
        let locked_child_skill_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO skill_relationships
                 (skill_id,related_skill_id,relationship_type,sort_order)
                 VALUES (?1,?2,'parent',0)",
                params![locked_child_skill_id, locked_root_skill_id],
            )
            .expect("locked branch relationship");
        fixture
            .connection
            .execute(
                "INSERT INTO campaign_character_skill_allocations
                 (character_id,skill_id,parent_allocation_id,points)
                 VALUES (?1,?2,NULL,4)",
                params![character_id, locked_root_skill_id],
            )
            .expect("locked parent allocation");
        let locked_parent_allocation_id = fixture.connection.last_insert_rowid();
        let locked_error = advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: locked_child_skill_id,
                parent_allocation_id: Some(locked_parent_allocation_id),
                points_to_add: 1,
            },
        )
        .expect_err("a child remains locked below the campaign threshold");
        assert!(locked_error.contains("locked until its parent reaches 5"));

        fixture
            .connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Navigation','standard',1,'INT')",
                [],
            )
            .expect("new Skill");
        let new_skill_id = fixture.connection.last_insert_rowid();
        advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: new_skill_id,
                parent_allocation_id: None,
                points_to_add: 3,
            },
        )
        .expect("purchase three points in a new Skill for ten plus one plus two Experience");
        let after_new: (f64, f64, f64) = fixture
            .connection
            .query_row(
                "SELECT allocation.points,profile.experience,profile.total_experience
                 FROM campaign_character_skill_allocations allocation
                 JOIN campaign_character_profiles profile ON profile.character_id=allocation.character_id
                 WHERE allocation.character_id=?1 AND allocation.skill_id=?2",
                params![character_id, new_skill_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("new Skill advancement");
        assert_eq!(after_new, (3.0, 6.0, 64.0));

        fixture
            .connection
            .execute(
                "UPDATE campaign_character_profiles SET experience=0 WHERE character_id=?1",
                [character_id],
            )
            .expect("empty Experience pool");
        let error = advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: new_skill_id,
                parent_allocation_id: None,
                points_to_add: 1,
            },
        )
        .expect_err("an unaffordable advancement must roll back");
        assert!(error.contains("only 0 is available"));
        let unchanged_points: f64 = fixture
            .connection
            .query_row(
                "SELECT points FROM campaign_character_skill_allocations
                 WHERE character_id=?1 AND skill_id=?2",
                params![character_id, new_skill_id],
                |row| row.get(0),
            )
            .expect("rolled back Skill");
        assert_eq!(unchanged_points, 3.0);
    }

    #[test]
    fn advancement_counts_racial_points_and_enforces_unlocks_and_the_absolute_maximum() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "INSERT INTO race_skill_links (race_id,skill_id,link_type,value,sort_order)
                 VALUES (?1,?2,'bonus',10,0)",
                params![fixture.race_id, fixture.root_skill_id],
            )
            .expect("racial Skill bonus");
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let mut input = save_input(&fixture, character_id);
        input.skill_allocations[0].points = 0.0;
        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("save racial anchor");
        fixture
            .connection
            .execute(
                "UPDATE campaign_character_profiles
                 SET experience=20,total_experience=0,creation_completed_at='completed'
                 WHERE character_id=?1",
                [character_id],
            )
            .expect("completed Character");

        advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: fixture.root_skill_id,
                parent_allocation_id: None,
                points_to_add: 1,
            },
        )
        .expect("racial ten advances to eleven for ten Experience");
        let racial_result: (f64, f64, f64) = fixture
            .connection
            .query_row(
                "SELECT allocation.points,profile.experience,profile.total_experience
                 FROM campaign_character_skill_allocations allocation
                 JOIN campaign_character_profiles profile ON profile.character_id=allocation.character_id
                 WHERE allocation.character_id=?1 AND allocation.skill_id=?2",
                params![character_id, fixture.root_skill_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("racial advancement");
        assert_eq!(racial_result, (1.0, 10.0, 10.0));

        fixture
            .connection
            .execute(
                "UPDATE campaigns SET max_points_in_skill=11 WHERE id=?1",
                [fixture.campaign_id],
            )
            .expect("absolute maximum");
        let error = advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: fixture.root_skill_id,
                parent_allocation_id: None,
                points_to_add: 1,
            },
        )
        .expect_err("effective points cannot exceed the absolute maximum");
        assert!(error.contains("already at its maximum"));
    }

    #[test]
    fn advancement_blocks_tier_three_supernatural_skills_above_casting_level() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "UPDATE races SET base_magic=1 WHERE id=?1",
                [fixture.race_id],
            )
            .expect("Base Magic");
        fixture
            .connection
            .execute(
                "INSERT INTO race_skill_links (race_id,skill_id,link_type,value,sort_order)
                 VALUES (?1,?2,'bonus',1,0)",
                params![fixture.race_id, fixture.channeling_skill_id],
            )
            .expect("Apprentice Channeling Mana");
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let mut input = save_input(&fixture, character_id);
        input.skill_allocations = vec![CharacterSkillAllocationInput {
            skill_id: fixture.spellcraft_skill_id,
            points: 1.0,
            children: vec![CharacterSkillAllocationInput {
                skill_id: fixture.sphere_skill_id,
                points: 1.0,
                children: vec![],
            }],
        }];
        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("save supernatural tree");
        fixture
            .connection
            .execute(
                "UPDATE campaign_character_profiles
                 SET experience=100,creation_completed_at='completed'
                 WHERE character_id=?1",
                [character_id],
            )
            .expect("completed caster");
        let sphere_allocation_id: i64 = fixture
            .connection
            .query_row(
                "SELECT id FROM campaign_character_skill_allocations
                 WHERE character_id=?1 AND skill_id=?2",
                params![character_id, fixture.sphere_skill_id],
                |row| row.get(0),
            )
            .expect("Sphere allocation");
        fixture
            .connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Arcane Technique','supernatural technique',3,'INT')",
                [],
            )
            .expect("Tier 3 supernatural Skill");
        let technique_skill_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO skill_relationships
                 (skill_id,related_skill_id,relationship_type,sort_order)
                 VALUES (?1,?2,'parent',0)",
                params![technique_skill_id, fixture.sphere_skill_id],
            )
            .expect("supernatural relationship");
        fixture
            .connection
            .execute(
                "INSERT INTO skill_extensions
                 (skill_id,extension_type,schema_version,data_json)
                 VALUES (?1,'spell-import-source',1,?2)",
                params![
                    technique_skill_id,
                    r#"{"spreadsheetReference":{"masteryLabel":"Novice","statedSpellCost":8}}"#
                ],
            )
            .expect("Novice casting level");

        let error = advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: technique_skill_id,
                parent_allocation_id: Some(sphere_allocation_id),
                points_to_add: 1,
            },
        )
        .expect_err("an Apprentice caster cannot purchase a Novice Tier 3 Skill");
        assert!(error.contains("requires Novice casting access"));

        fixture
            .connection
            .execute(
                "UPDATE skill_extensions
                 SET data_json=?2 WHERE skill_id=?1 AND extension_type='spell-import-source'",
                params![
                    technique_skill_id,
                    r#"{"spreadsheetReference":{"masteryLabel":"Apprentice","statedSpellCost":8}}"#
                ],
            )
            .expect("Apprentice casting level");
        advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: technique_skill_id,
                parent_allocation_id: Some(sphere_allocation_id),
                points_to_add: 1,
            },
        )
        .expect("an Apprentice caster may purchase an Apprentice Tier 3 Skill");
    }

    #[test]
    fn special_abilities_use_purchased_starting_points_and_an_effective_maximum_of_one_hundred() {
        let mut fixture = setup();
        fixture
            .connection
            .execute(
                "INSERT INTO campaign_allowed_systems (campaign_id,system_name,sort_order)
                 VALUES (?1,'Special Abilities',20)",
                [fixture.campaign_id],
            )
            .expect("Special Abilities Campaign access");
        fixture
            .connection
            .execute(
                "INSERT INTO skills (name,classification,tier,primary_attribute)
                 VALUES ('Moonshadow Omen','special ability',NULL,NULL)",
                [],
            )
            .expect("Special Ability");
        let special_ability_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO race_skill_links (race_id,skill_id,link_type,value,sort_order)
                 VALUES (?1,?2,'bonus',4,0)",
                params![fixture.race_id, special_ability_id],
            )
            .expect("racial Special Ability points");
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let mut input = save_input(&fixture, character_id);
        input.skill_allocations = vec![CharacterSkillAllocationInput {
            skill_id: special_ability_id,
            points: 10.0,
            children: vec![],
        }];
        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("ten purchased starting points may stack with four racial points");
        let starting_points: f64 = fixture
            .connection
            .query_row(
                "SELECT points FROM campaign_character_skill_allocations
                 WHERE character_id=?1 AND skill_id=?2",
                params![character_id, special_ability_id],
                |row| row.get(0),
            )
            .expect("starting Special Ability allocation");
        assert_eq!(starting_points, 10.0);
        assert_eq!(starting_points + 4.0, 14.0);

        let mut too_many_starting_points = save_input(&fixture, character_id);
        too_many_starting_points.skill_allocations = vec![CharacterSkillAllocationInput {
            skill_id: special_ability_id,
            points: 11.0,
            children: vec![],
        }];
        let error = save_character_aggregate_in_connection(
            &mut fixture.connection,
            too_many_starting_points,
        )
        .expect_err("racial points do not reduce or increase the purchased starting cap");
        assert!(error.contains("Purchased starting points exceed"));

        fixture
            .connection
            .execute(
                "UPDATE campaign_character_profiles
                 SET experience=5000,total_experience=0,creation_completed_at='completed'
                 WHERE character_id=?1",
                [character_id],
            )
            .expect("completed Character with Experience");
        advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: special_ability_id,
                parent_allocation_id: None,
                points_to_add: 86,
            },
        )
        .expect("Special Ability advances from effective fourteen to one hundred");
        let maximum_result: (f64, f64, f64) = fixture
            .connection
            .query_row(
                "SELECT allocation.points,profile.experience,profile.total_experience
                 FROM campaign_character_skill_allocations allocation
                 JOIN campaign_character_profiles profile ON profile.character_id=allocation.character_id
                 WHERE allocation.character_id=?1 AND allocation.skill_id=?2",
                params![character_id, special_ability_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("Special Ability at one hundred effective points");
        assert_eq!(maximum_result, (96.0, 141.0, 4859.0));

        let error = advance_character_skill_in_connection(
            &mut fixture.connection,
            AdvanceCharacterSkillInput {
                character_id,
                campaign_id: fixture.campaign_id,
                requesting_user_id: fixture.user_id,
                skill_id: special_ability_id,
                parent_allocation_id: None,
                points_to_add: 1,
            },
        )
        .expect_err("Special Abilities cannot exceed one hundred effective points");
        assert!(error.contains("maximum of 100 effective points"));
    }

    #[test]
    fn save_replaces_the_aggregate_and_rolls_back_invalid_rules_or_ownership() {
        let mut fixture = setup();
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let input = save_input(&fixture, character_id);
        save_character_aggregate_in_connection(&mut fixture.connection, input)
            .expect("save aggregate");
        let saved: (String, i64, i64, i64, f64, i64, i64) = fixture.connection.query_row(
            "SELECT character.name,
               (SELECT COUNT(*) FROM campaign_character_attributes WHERE character_id=character.id),
               (SELECT COUNT(*) FROM campaign_character_skill_allocations WHERE character_id=character.id),
               (SELECT COUNT(*) FROM campaign_character_items WHERE character_id=character.id),
               (SELECT credits_remaining FROM campaign_character_profiles WHERE character_id=character.id),
               (SELECT height_feet FROM campaign_character_profiles WHERE character_id=character.id),
               (SELECT height_inches FROM campaign_character_profiles WHERE character_id=character.id)
             FROM campaign_characters character WHERE character.id=?1",
            [character_id],
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
        ).expect("saved aggregate");
        assert_eq!(saved, ("Neris".into(), 6, 2, 1, 80.0, 5, 7));

        let spellcraft_allocations = || {
            vec![CharacterSkillAllocationInput {
                skill_id: fixture.spellcraft_skill_id,
                points: 1.0,
                children: vec![CharacterSkillAllocationInput {
                    skill_id: fixture.sphere_skill_id,
                    points: 1.0,
                    children: vec![CharacterSkillAllocationInput {
                        skill_id: fixture.spell_skill_id,
                        points: 8.0,
                        children: vec![],
                    }],
                }],
            }]
        };
        let mut unavailable_spell = save_input(&fixture, character_id);
        unavailable_spell.skill_allocations = spellcraft_allocations();
        let error =
            save_character_aggregate_in_connection(&mut fixture.connection, unavailable_spell)
                .expect_err("an Apprentice spell requires an Apprentice mana pool");
        assert!(error.contains("requires Apprentice casting access"));

        fixture
            .connection
            .execute(
                "UPDATE races SET base_magic=1 WHERE id=?1",
                [fixture.race_id],
            )
            .expect("one-point Base Magic fixture");
        fixture
            .connection
            .execute(
                "INSERT INTO race_skill_links (race_id,skill_id,link_type,value,sort_order)
                 VALUES (?1,?2,'bonus',1,0)",
                params![fixture.race_id, fixture.channeling_skill_id],
            )
            .expect("racial Channeling bonus");
        let mut one_point_spellcraft_unlock = save_input(&fixture, character_id);
        one_point_spellcraft_unlock.skill_allocations = spellcraft_allocations();
        save_character_aggregate_in_connection(
            &mut fixture.connection,
            one_point_spellcraft_unlock,
        )
        .expect("Spellcraft tiers unlock with one point in each parent");

        let mut invalid_cap = save_input(&fixture, character_id);
        invalid_cap.attributes[0].value = 41.0;
        invalid_cap.attributes[1].value = 9.0;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, invalid_cap,).is_err()
        );
        let still_saved: String = fixture
            .connection
            .query_row(
                "SELECT name FROM campaign_characters WHERE id=?1",
                [character_id],
                |row| row.get(0),
            )
            .expect("rolled back Character");
        assert_eq!(still_saved, "Neris");

        let mut invalid_item = save_input(&fixture, character_id);
        invalid_item.items[0].quantity = 11;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, invalid_item,).is_err()
        );
        let mut invalid_height = save_input(&fixture, character_id);
        invalid_height.profile.height_inches = Some(12);
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, invalid_height,)
                .is_err()
        );
        let mut unauthorized_item = save_input(&fixture, character_id);
        unauthorized_item.items[0].item_id += 999;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, unauthorized_item,)
                .is_err()
        );
        let mut invalid_skill = save_input(&fixture, character_id);
        invalid_skill.skill_allocations[0].points = 11.0;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, invalid_skill,)
                .is_err()
        );
        let mut locked_skill = save_input(&fixture, character_id);
        locked_skill.skill_allocations[0].points = 4.0;
        locked_skill.skill_allocations[0].children[0].points = 6.0;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, locked_skill,).is_err()
        );
        fixture
            .connection
            .execute(
                "DELETE FROM campaign_allowed_systems
                 WHERE campaign_id=?1 AND system_name='Tier 2'",
                [fixture.campaign_id],
            )
            .expect("disable Tier 2");
        let disabled_tier = save_input(&fixture, character_id);
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, disabled_tier,)
                .is_err()
        );
        fixture
            .connection
            .execute(
                "INSERT INTO campaign_allowed_systems
                 (campaign_id,system_name,sort_order) VALUES (?1,'Tier 2',1)",
                [fixture.campaign_id],
            )
            .expect("restore Tier 2");
        fixture
            .connection
            .execute(
                "INSERT INTO races (name,size,base_magic)
                 VALUES ('Forbidden','Medium',0)",
                [],
            )
            .expect("forbidden Race");
        let forbidden_race_id = fixture.connection.last_insert_rowid();
        let mut forbidden_race = save_input(&fixture, character_id);
        forbidden_race.profile.race_id = Some(forbidden_race_id);
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, forbidden_race,)
                .is_err()
        );
        let mut wrong_owner = save_input(&fixture, character_id);
        wrong_owner.requesting_user_id += 999;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, wrong_owner,).is_err()
        );

        let mut incomplete_completion = save_input(&fixture, character_id);
        incomplete_completion.name = "New Character".to_string();
        incomplete_completion.complete_creation = true;
        assert!(save_character_aggregate_in_connection(
            &mut fixture.connection,
            incomplete_completion,
        )
        .is_err());

        let mut incomplete_story = save_input(&fixture, character_id);
        incomplete_story.profile.secrets = "".to_string();
        incomplete_story.complete_creation = true;
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, incomplete_story,)
                .is_err()
        );

        let mut incomplete_equipment = save_input(&fixture, character_id);
        incomplete_equipment.items.clear();
        incomplete_equipment.complete_creation = true;
        assert!(save_character_aggregate_in_connection(
            &mut fixture.connection,
            incomplete_equipment,
        )
        .is_err());

        fixture
            .connection
            .execute(
                "UPDATE campaigns SET fate_point_method='Rolled',assigned_fate_points=NULL
                 WHERE id=?1",
                [fixture.campaign_id],
            )
            .expect("use rolled Campaign Fate Points");
        let mut missing_rolled_fate = save_input(&fixture, character_id);
        missing_rolled_fate.profile.fate_points = None;
        missing_rolled_fate.complete_creation = true;
        let fate_error =
            save_character_aggregate_in_connection(&mut fixture.connection, missing_rolled_fate)
                .expect_err("rolled Fate Points are required before completion");
        assert!(fate_error.contains("Identity"));

        let mut complete = save_input(&fixture, character_id);
        complete.complete_creation = true;
        save_character_aggregate_in_connection(&mut fixture.connection, complete)
            .expect("complete Character creation");
        let completed_at: Option<String> = fixture
            .connection
            .query_row(
                "SELECT creation_completed_at FROM campaign_character_profiles
                 WHERE character_id=?1",
                [character_id],
                |row| row.get(0),
            )
            .expect("completion timestamp");
        assert!(completed_at.is_some());
        let locked_edit = save_input(&fixture, character_id);
        assert!(
            save_character_aggregate_in_connection(&mut fixture.connection, locked_edit,).is_err()
        );

        let mut forged_administrator = save_input(&fixture, character_id);
        forged_administrator.requesting_user_id += 999;
        forged_administrator.administrative_override = true;
        assert!(save_character_aggregate_in_connection(
            &mut fixture.connection,
            forged_administrator,
        )
        .is_err());

        fixture
            .connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('GameMaster','hash','salt',1)",
                [],
            )
            .expect("G.O.D. profile");
        let god_user_id = fixture.connection.last_insert_rowid();
        fixture
            .connection
            .execute(
                "INSERT INTO user_roles (user_id,role) VALUES (?1,'god')",
                [god_user_id],
            )
            .expect("G.O.D. role");
        fixture
            .connection
            .execute(
                "DELETE FROM campaign_allowed_systems
                 WHERE campaign_id=?1 AND system_name IN ('Tier 2','Tier 3')",
                [fixture.campaign_id],
            )
            .expect("remove post-creation Campaign tier access");

        let mut god_locked_standard_tier = save_input(&fixture, character_id);
        god_locked_standard_tier.requesting_user_id = god_user_id;
        god_locked_standard_tier.administrative_override = true;
        god_locked_standard_tier.skill_allocations[0].points = 4.0;
        god_locked_standard_tier.skill_allocations[0].children[0].points = 6.0;
        assert!(save_character_aggregate_in_connection(
            &mut fixture.connection,
            god_locked_standard_tier,
        )
        .is_err());

        let mut god_exceeds_absolute_skill_max = save_input(&fixture, character_id);
        god_exceeds_absolute_skill_max.requesting_user_id = god_user_id;
        god_exceeds_absolute_skill_max.administrative_override = true;
        god_exceeds_absolute_skill_max.skill_allocations[0].points = 76.0;
        assert!(save_character_aggregate_in_connection(
            &mut fixture.connection,
            god_exceeds_absolute_skill_max,
        )
        .is_err());

        let mut god_edit = save_input(&fixture, character_id);
        god_edit.requesting_user_id = god_user_id;
        god_edit.administrative_override = true;
        god_edit.attributes[0].value = 45.0;
        god_edit.skill_allocations[0].points = 15.0;
        god_edit.items[0].quantity = 15;
        god_edit.profile.experience = 25.0;
        god_edit.profile.total_experience = 40.0;
        god_edit.profile.quintessence = 7.0;
        god_edit.profile.total_quintessence = 12.0;
        god_edit.profile.credits_remaining = 333.0;
        save_character_aggregate_in_connection(&mut fixture.connection, god_edit)
            .expect("G.O.D. edits a completed Character");
        let god_saved: (f64, f64, f64, f64, f64, f64, i64, Option<String>) = fixture
            .connection
            .query_row(
                "SELECT profile.experience,profile.total_experience,
                        profile.quintessence,profile.total_quintessence,
                        profile.credits_remaining,
                        (SELECT value FROM campaign_character_attributes
                         WHERE character_id=?1 AND attribute_key='STR'),
                        (SELECT quantity FROM campaign_character_items
                         WHERE character_id=?1 AND item_id=?2),
                        profile.creation_completed_at
                 FROM campaign_character_profiles profile
                 WHERE profile.character_id=?1",
                params![character_id, fixture.item_id],
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
                    ))
                },
            )
            .expect("G.O.D. Character values");
        assert_eq!(
            god_saved,
            (25.0, 40.0, 7.0, 12.0, 333.0, 45.0, 15, completed_at)
        );
    }

    #[test]
    fn migration_backfills_existing_lightweight_characters() {
        let connection = base_schema(false);
        connection
            .execute(
                "INSERT INTO users (username,password_hash,password_salt,password_iterations)
                 VALUES ('Legacy','hash','salt',1)",
                [],
            )
            .expect("legacy user");
        let user_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaigns (
                   name,attribute_points,skill_points,max_starting_skill,
                   points_to_unlock_next_tier,max_points_in_skill,
                   starting_credit_amount,currency_system,created_by_user_id
                 ) VALUES ('Legacy Campaign',150,50,10,25,75,620,'Credits',?1)",
                [user_id],
            )
            .expect("legacy Campaign");
        let campaign_id = connection.last_insert_rowid();
        connection
            .execute(
                "INSERT INTO campaign_players (campaign_id,user_id) VALUES (?1,?2)",
                params![campaign_id, user_id],
            )
            .expect("legacy membership");
        connection
            .execute(
                "INSERT INTO campaign_characters (campaign_id,player_user_id)
                 VALUES (?1,?2)",
                params![campaign_id, user_id],
            )
            .expect("legacy Character");
        let character_id = connection.last_insert_rowid();

        connection
            .execute_batch(CHARACTER_AGGREGATE)
            .expect("aggregate backfill");
        connection
            .execute_batch(CHARACTER_COMPLETION)
            .expect("completion migration");
        connection
            .execute_batch(CHARACTER_HEIGHT_UNITS)
            .expect("height units migration");
        let backfill: (f64, i64, f64) = connection
            .query_row(
                "SELECT profile.credits_remaining,
                   (SELECT COUNT(*) FROM campaign_character_attributes WHERE character_id=?1),
                   (SELECT SUM(value) FROM campaign_character_attributes WHERE character_id=?1)
                 FROM campaign_character_profiles profile WHERE character_id=?1",
                [character_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("backfilled Character");
        assert_eq!(backfill, (620.0, 6, 150.0));
    }
}
