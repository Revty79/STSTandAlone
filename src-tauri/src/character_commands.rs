use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const DATABASE_FILENAME: &str = "serrian-tide.db";
const ATTRIBUTE_KEYS: [&str; 6] = ["STR", "DEX", "CON", "INT", "WIS", "CHR"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCharacterInput {
    campaign_id: i64,
    player_user_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCharacterAggregateInput {
    character_id: i64,
    campaign_id: i64,
    requesting_user_id: i64,
    complete_creation: bool,
    name: String,
    profile: CharacterProfileInput,
    attributes: Vec<CharacterAttributeInput>,
    skill_allocations: Vec<CharacterSkillAllocationInput>,
    items: Vec<CharacterItemInput>,
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

#[derive(Clone)]
struct CampaignSkillRules {
    skill_points: f64,
    max_starting_skill: f64,
    points_to_unlock_next_tier: f64,
    max_points_in_skill: f64,
    allowed_systems: HashSet<String>,
}

#[derive(Clone)]
struct SkillMeta {
    id: i64,
    name: String,
    classification: String,
    tier: Option<i64>,
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
             WHERE membership.campaign_id=?1 AND membership.user_id=?2",
            params![input.campaign_id, input.player_user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Campaign membership could not be checked: {error}"))?;
    let Some(starting_credits) = starting_credits else {
        return Err("The Player does not belong to the requested Campaign.".to_string());
    };

    transaction
        .execute(
            "INSERT INTO campaign_characters (campaign_id,player_user_id)
             VALUES (?1,?2)",
            params![input.campaign_id, input.player_user_id],
        )
        .map_err(|error| format!("The Character identity could not be created: {error}"))?;
    let character_id = transaction.last_insert_rowid();
    transaction
        .execute(
            "INSERT INTO campaign_character_profiles (character_id,credits_remaining)
             VALUES (?1,?2)",
            params![character_id, starting_credits],
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
    transaction.commit().map_err(|error| {
        format!("The Character creation transaction could not be committed: {error}")
    })?;
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

    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("The Character save transaction could not begin: {error}"))?;
    let campaign_rules: Option<(f64, f64, f64, f64, f64, Option<String>)> = transaction
        .query_row(
            "SELECT campaign.attribute_points,campaign.skill_points,
                    campaign.max_starting_skill,campaign.points_to_unlock_next_tier,
                    campaign.max_points_in_skill,profile.creation_completed_at
             FROM campaign_characters character
             JOIN campaign_players membership
               ON membership.campaign_id=character.campaign_id
              AND membership.user_id=character.player_user_id
             JOIN campaigns campaign ON campaign.id=character.campaign_id
             JOIN campaign_character_profiles profile ON profile.character_id=character.id
             WHERE character.id=?1 AND character.campaign_id=?2
               AND character.player_user_id=?3",
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
        creation_completed_at,
    )) = campaign_rules
    else {
        return Err("The Character does not belong to this Player and Campaign.".to_string());
    };
    if creation_completed_at.is_some() {
        return Err(
            "Character creation is complete and its creation record is permanently locked."
                .to_string(),
        );
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
    let skill_rules = CampaignSkillRules {
        skill_points: skill_budget,
        max_starting_skill,
        points_to_unlock_next_tier: tier_unlock_points,
        max_points_in_skill,
        allowed_systems: allowed_system_rows.into_iter().collect(),
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
    if total_skill_points > skill_rules.skill_points + 0.000_001 {
        return Err(
            "Character Skill allocations exceed the Campaign Skill Point budget.".to_string(),
        );
    }
    if input.complete_creation {
        validate_creation_completion(
            &input,
            &name,
            normalized_height,
            weight,
            total_attribute_points,
            total_skill_points,
            attribute_budget,
            skill_budget,
        )?;
    }

    let credits_remaining = validate_and_insert_items(
        &transaction,
        input.character_id,
        input.campaign_id,
        &input.items,
    )?;
    transaction
        .execute(
            "INSERT INTO campaign_character_profiles (
               character_id,race_id,age,sex,height,weight,skin_color,eye_color,hair_color,
               deity,defining_marks,personality,goals,secrets,backstory,motivations,
               fame,experience,total_experience,quintessence,total_quintessence,
               credits_remaining
             ) VALUES (
               ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
               ?17,?18,?19,?20,?21,?22
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

fn validate_attributes(
    transaction: &Transaction<'_>,
    attributes: &[CharacterAttributeInput],
    race_id: Option<i64>,
    attribute_budget: f64,
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
        if let Some(race_id) = race_id {
            let cap: Option<f64> = transaction
                .query_row(
                    "SELECT max_value FROM race_attribute_caps
                     WHERE race_id=?1 AND attribute_key=?2 LIMIT 1",
                    params![race_id, key],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| format!("The Race Attribute cap could not be read: {error}"))?;
            if cap.is_some_and(|maximum| value > maximum + 0.000_001) {
                return Err(format!("{key} exceeds the selected Race maximum."));
            }
        }
    }
    if total > attribute_budget + 0.000_001 {
        return Err("Character Attributes exceed the Campaign Attribute Point budget.".to_string());
    }
    Ok(total)
}

#[allow(clippy::too_many_arguments)]
fn validate_creation_completion(
    input: &SaveCharacterAggregateInput,
    name: &str,
    height: Option<(i64, i64)>,
    weight: Option<f64>,
    total_attribute_points: f64,
    total_skill_points: f64,
    attribute_budget: f64,
    skill_budget: f64,
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
        && !profile.hair_color.trim().is_empty();
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
    Ok(())
}

fn read_skill(transaction: &Transaction<'_>, skill_id: i64) -> Result<SkillMeta, String> {
    transaction
        .query_row(
            "SELECT id,name,classification,tier FROM skills WHERE id=?1",
            [skill_id],
            |row| {
                Ok(SkillMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    classification: row.get(2)?,
                    tier: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("A Skill allocation could not be read: {error}"))?
        .ok_or_else(|| "A Skill allocation references a missing Skill.".to_string())
}

fn root_systems(skill: &SkillMeta) -> Result<Vec<&'static str>, String> {
    let name = skill.name.to_lowercase();
    let classification = skill.classification.to_lowercase();
    if classification == "standard" {
        return Ok(vec![]);
    }
    if classification == "special ability" {
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

fn validate_skill_access(
    skill: &SkillMeta,
    root: &SkillMeta,
    rules: &CampaignSkillRules,
) -> Result<(), String> {
    if let Some(tier) = skill.tier {
        let tier_name = format!("Tier {tier}");
        if !rules.allowed_systems.contains(&tier_name) {
            return Err(format!("{tier_name} is not allowed in this Campaign."));
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
    if points <= 0.0 {
        return Err("Stored Skill allocations must invest more than zero points.".to_string());
    }
    if points > rules.max_starting_skill + 0.000_001 {
        return Err("A starting Skill allocation exceeds Max Starting Skill.".to_string());
    }
    if points > rules.max_points_in_skill + 0.000_001 {
        return Err("A Skill allocation exceeds Max Points in a Skill.".to_string());
    }
    let skill = read_skill(transaction, allocation.skill_id)?;
    let root_skill = root.unwrap_or(&skill);
    validate_skill_access(&skill, root_skill, rules)?;

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
        if parent_points + 0.000_001 < rules.points_to_unlock_next_tier {
            return Err(format!(
                "Skill {:?} is locked until its parent reaches the Campaign threshold.",
                skill.name
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
        let Some(Some(catalog_cost)) = catalog_cost else {
            return Err(
                "A Character Item is not authorized and priced by this Campaign.".to_string(),
            );
        };
        if (catalog_cost - unit_cost).abs() > 0.000_001 {
            return Err("A Character Item cost no longer matches its master Item.".to_string());
        }
        spent += catalog_cost * item.quantity as f64;
        if spent > starting_credits + 0.000_001 {
            return Err("Character Items exceed the remaining starting funds.".to_string());
        }
        transaction
            .execute(
                "INSERT INTO campaign_character_items
                 (character_id,item_id,quantity,unit_cost_credits)
                 VALUES (?1,?2,?3,?4)",
                params![character_id, item.item_id, item.quantity, catalog_cost],
            )
            .map_err(|error| format!("A Character Item could not be saved: {error}"))?;
    }
    Ok((starting_credits - spent).max(0.0))
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

    struct Fixture {
        connection: Connection,
        user_id: i64,
        campaign_id: i64,
        race_id: i64,
        root_skill_id: i64,
        child_skill_id: i64,
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
        for (index, system) in ["Tier 1", "Tier 2"].into_iter().enumerate() {
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
                "INSERT INTO items (
                   canonical_id,name,catalog_scope,equipment_group,record_type,
                   family,category,credits,price_basis
                 ) VALUES ('ITEM-TEST','Rope','inventory',NULL,'Item','Gear','Gear',10,'each')",
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
            item_id,
        }
    }

    fn save_input(fixture: &Fixture, character_id: i64) -> SaveCharacterAggregateInput {
        SaveCharacterAggregateInput {
            character_id,
            campaign_id: fixture.campaign_id,
            requesting_user_id: fixture.user_id,
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
                deity: "".to_string(),
                defining_marks: "".to_string(),
                personality: "Patient".to_string(),
                goals: "Explore".to_string(),
                secrets: "".to_string(),
                backstory: "A traveler.".to_string(),
                motivations: "Discovery".to_string(),
                fame: 0.0,
                experience: 0.0,
                total_experience: 0.0,
                quintessence: 0.0,
                total_quintessence: 0.0,
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
        }
    }

    #[test]
    fn creation_requires_membership_and_initializes_the_complete_aggregate() {
        let mut fixture = setup();
        let character_id = create_character_aggregate_in_connection(
            &mut fixture.connection,
            CreateCharacterInput {
                campaign_id: fixture.campaign_id,
                player_user_id: fixture.user_id,
            },
        )
        .expect("create Character");
        let initialized: (String, f64, i64, i64, i64) = fixture
            .connection
            .query_row(
                "SELECT character.name,profile.credits_remaining,
                   (SELECT COUNT(*) FROM campaign_character_attributes WHERE character_id=character.id),
                   (SELECT COUNT(*) FROM campaign_character_skill_allocations WHERE character_id=character.id),
                   (SELECT COUNT(*) FROM campaign_character_items WHERE character_id=character.id)
                 FROM campaign_characters character
                 JOIN campaign_character_profiles profile ON profile.character_id=character.id
                 WHERE character.id=?1",
                [character_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .expect("initialized aggregate");
        assert_eq!(initialized, ("New Character".into(), 100.0, 6, 0, 0));

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
