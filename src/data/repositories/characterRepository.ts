import { invoke } from "@tauri-apps/api/core";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  type CampaignCurrencySystem,
  type CampaignFatePointMethod,
  type CampaignSystemOption,
} from "../../types/campaign";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  type AdvanceCharacterSkill,
  type CharacterAggregate,
  type CharacterAttributeAllocation,
  type CharacterAttributeKey,
  type CharacterCampaignRules,
  type CharacterProfile,
  type SaveCharacterAggregate,
} from "../../types/character";
import type { RaceAggregate } from "../../types/race";
import { getDatabase } from "../database";
import { raceRepository, type RaceRepository } from "./raceRepository";

export interface CharacterDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[],
  ): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

type CharacterCoreAndCampaignRow = Omit<
  CharacterAggregate["character"],
  "isNpc"
> & Omit<CharacterCampaignRules, "id" | "name" | "currencySystem" | "fatePointMethod" | "allowedSystems" | "derivedCurrencies"> & {
  currencySystem: string;
  fatePointMethod: string;
  isNpc: number;
};

type CharacterSystemRow = { systemName: string };

function currencySystem(value: string): CampaignCurrencySystem {
  if (value === "Credits" || value === "Derived Currency") return value;
  throw new Error(`Stored Character Campaign has unsupported Currency System ${JSON.stringify(value)}.`);
}

function fatePointMethod(value: string): CampaignFatePointMethod {
  if (value === "Assigned" || value === "Rolled") return value;
  throw new Error(`Stored Character Campaign has unsupported Fate Point method ${JSON.stringify(value)}.`);
}

function campaignSystem(value: string): CampaignSystemOption {
  if (CAMPAIGN_SYSTEM_OPTIONS.includes(value as CampaignSystemOption)) {
    return value as CampaignSystemOption;
  }
  throw new Error(`Stored Character Campaign has unsupported system ${JSON.stringify(value)}.`);
}

function attributeKey(value: string): CharacterAttributeKey {
  if (CHARACTER_ATTRIBUTE_KEYS.includes(value as CharacterAttributeKey)) {
    return value as CharacterAttributeKey;
  }
  throw new Error(`Stored Character has unsupported Attribute ${JSON.stringify(value)}.`);
}

export interface CharacterRepository {
  getCharacterAggregate(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
    administrativeOverride: boolean,
  ): Promise<CharacterAggregate | null>;
  createCharacterAggregate(
    campaignId: number,
    playerUserId: number,
  ): Promise<CharacterAggregate>;
  createNpcAggregate(
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterAggregate>;
  saveCharacterAggregate(input: SaveCharacterAggregate): Promise<CharacterAggregate>;
  advanceCharacterSkill(input: AdvanceCharacterSkill): Promise<CharacterAggregate>;
  getAllowedRaceForCharacter(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
    raceId: number,
    administrativeOverride: boolean,
  ): Promise<RaceAggregate | null>;
}

export class TauriCharacterRepository implements CharacterRepository {
  constructor(
    private readonly databaseProvider: () => Promise<CharacterDatabase> = getDatabase,
    private readonly races: RaceRepository = raceRepository,
    private readonly createInvoker: (
      campaignId: number,
      playerUserId: number,
    ) => Promise<number> = (campaignId, playerUserId) => invoke<number>(
      "create_character_aggregate",
      { input: { campaignId, playerUserId } },
    ),
    private readonly saveInvoker: (input: SaveCharacterAggregate) => Promise<number> =
      (input) => invoke<number>("save_character_aggregate", { input }),
    private readonly advanceSkillInvoker: (input: AdvanceCharacterSkill) => Promise<number> =
      (input) => invoke<number>("advance_character_skill", { input }),
    private readonly createNpcInvoker: (
      campaignId: number,
      requestingUserId: number,
    ) => Promise<number> = (campaignId, requestingUserId) => invoke<number>(
      "create_npc_aggregate",
      { input: { campaignId, requestingUserId } },
    ),
  ) {}

  async getCharacterAggregate(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
    administrativeOverride = false,
  ): Promise<CharacterAggregate | null> {
    const database = await this.databaseProvider();
    const coreRows = await database.select<CharacterCoreAndCampaignRow[]>(
      `SELECT character.id,character.campaign_id AS campaignId,
         character.player_user_id AS playerUserId,character.name,
         character.is_npc AS isNpc,
         campaign.name AS campaignName,profile.username AS playerUsername,
         character.created_at AS createdAt,character.updated_at AS updatedAt,
         campaign.attribute_points AS attributePoints,
         campaign.skill_points AS skillPoints,
         campaign.max_starting_skill AS maxStartingSkill,
         campaign.points_to_unlock_next_tier AS pointsToUnlockNextTier,
         campaign.max_points_in_skill AS maxPointsInSkill,
         campaign.starting_credit_amount AS startingCreditAmount,
         campaign.currency_system AS currencySystem,
         campaign.fate_point_method AS fatePointMethod,
         campaign.assigned_fate_points AS assignedFatePoints
       FROM campaign_characters character
       JOIN campaigns campaign ON campaign.id=character.campaign_id
       JOIN users profile ON profile.id=character.player_user_id
       WHERE character.id=$1 AND character.campaign_id=$2
         AND (
           ($4=0 AND character.is_npc=0 AND character.player_user_id=$3)
           OR ($4=1 AND EXISTS (
             SELECT 1 FROM user_roles actor_role
             WHERE actor_role.user_id=$3 AND actor_role.role='god'
           ))
         )
         AND EXISTS (
           SELECT 1 FROM campaign_players membership
           WHERE membership.campaign_id=character.campaign_id
             AND membership.user_id=character.player_user_id
         )
       LIMIT 1`,
      [characterId, campaignId, requestingUserId, administrativeOverride ? 1 : 0],
    );
    const row = coreRows[0];
    if (!row) return null;

    const [
      profileRows,
      attributeRows,
      skillAllocations,
      items,
      currencyHoldings,
      systemRows,
      derivedCurrencies,
      allowedRaces,
      skillCatalog,
      skillRelationships,
      authorizedItems,
    ] = await Promise.all([
      database.select<CharacterProfile[]>(
        `SELECT character_id AS characterId,race_id AS raceId,age,sex,
           height_feet AS heightFeet,height_inches AS heightInches,weight,
           skin_color AS skinColor,eye_color AS eyeColor,hair_color AS hairColor,
           deity,defining_marks AS definingMarks,personality,goals,secrets,
           backstory,motivations,fame,experience,total_experience AS totalExperience,
           quintessence,total_quintessence AS totalQuintessence,
           fate_points AS fatePoints,
           credits_remaining AS creditsRemaining,
           creation_completed_at AS creationCompletedAt,created_at AS createdAt,
           updated_at AS updatedAt
         FROM campaign_character_profiles WHERE character_id=$1 LIMIT 1`,
        [characterId],
      ),
      database.select<Array<Omit<CharacterAttributeAllocation, "attributeKey"> & { attributeKey: string }>>(
        `SELECT character_id AS characterId,attribute_key AS attributeKey,value
         FROM campaign_character_attributes WHERE character_id=$1
         ORDER BY CASE attribute_key
           WHEN 'STR' THEN 1 WHEN 'DEX' THEN 2 WHEN 'CON' THEN 3
           WHEN 'INT' THEN 4 WHEN 'WIS' THEN 5 WHEN 'CHR' THEN 6 END`,
        [characterId],
      ),
      database.select<CharacterAggregate["skillAllocations"]>(
        `SELECT allocation.id,allocation.character_id AS characterId,
           allocation.skill_id AS skillId,skill.name AS skillName,
           skill.classification AS skillClassification,skill.tier AS skillTier,
           skill.primary_attribute AS primaryAttribute,
           allocation.parent_allocation_id AS parentAllocationId,
           allocation.points,allocation.created_at AS createdAt,
           allocation.updated_at AS updatedAt
         FROM campaign_character_skill_allocations allocation
         JOIN skills skill ON skill.id=allocation.skill_id
         WHERE allocation.character_id=$1
         ORDER BY allocation.id`,
        [characterId],
      ),
      database.select<CharacterAggregate["items"]>(
        `SELECT owned.character_id AS characterId,owned.item_id AS itemId,
           item.canonical_id AS canonicalId,item.name,item.catalog_scope AS catalogScope,
           item.equipment_group AS equipmentGroup,item.record_type AS recordType,
           item.category,owned.quantity,owned.unit_cost_credits AS unitCostCredits,
           owned.acquired_at AS acquiredAt
         FROM campaign_character_items owned
         JOIN items item ON item.id=owned.item_id
         WHERE owned.character_id=$1
         ORDER BY item.name COLLATE NOCASE,item.id`,
        [characterId],
      ),
      database.select<CharacterAggregate["currencyHoldings"]>(
        `SELECT character_id AS characterId,currency_id AS currencyId,quantity
         FROM campaign_character_currency_holdings
         WHERE character_id=$1 ORDER BY currency_id`,
        [characterId],
      ),
      database.select<CharacterSystemRow[]>(
        `SELECT system_name AS systemName FROM campaign_allowed_systems
         WHERE campaign_id=$1 ORDER BY sort_order,system_name COLLATE NOCASE`,
        [campaignId],
      ),
      database.select<CharacterCampaignRules["derivedCurrencies"]>(
        `SELECT id,campaign_id AS campaignId,name,description,
           credits_per_unit AS creditsPerUnit,sort_order AS sortOrder
         FROM campaign_derived_currencies WHERE campaign_id=$1
         ORDER BY sort_order,id`,
        [campaignId],
      ),
      database.select<CharacterAggregate["allowedRaces"]>(
        `SELECT race.id,race.name FROM campaign_allowed_races allowed
         JOIN races race ON race.id=allowed.race_id
         WHERE allowed.campaign_id=$1
         ORDER BY allowed.sort_order,race.name COLLATE NOCASE,race.id`,
        [campaignId],
      ),
      database.select<CharacterAggregate["skillCatalog"]>(
        `SELECT id,name,classification,tier,primary_attribute AS primaryAttribute,
           secondary_attribute AS secondaryAttribute,definition,
           (SELECT json_extract(extension.data_json,'$.spreadsheetReference.masteryLabel')
            FROM skill_extensions extension
            WHERE extension.skill_id=skills.id
              AND extension.extension_type='spell-import-source'
            LIMIT 1) AS spellLevel,
           (SELECT CAST(json_extract(extension.data_json,'$.spreadsheetReference.statedSpellCost') AS REAL)
            FROM skill_extensions extension
            WHERE extension.skill_id=skills.id
              AND extension.extension_type='spell-import-source'
            LIMIT 1) AS manaCost
         FROM skills ORDER BY name COLLATE NOCASE,id`,
      ),
      database.select<CharacterAggregate["skillRelationships"]>(
        `SELECT skill_id AS skillId,related_skill_id AS relatedSkillId,
           relationship_type AS relationshipType,sort_order AS sortOrder
         FROM skill_relationships
         WHERE relationship_type='parent' COLLATE NOCASE
         ORDER BY skill_id,sort_order,id`,
      ),
      database.select<CharacterAggregate["authorizedItems"]>(
        `SELECT item.id,item.canonical_id AS canonicalId,item.name,
           item.catalog_scope AS catalogScope,item.equipment_group AS equipmentGroup,
           item.record_type AS recordType,item.category,item.credits,
           item.price_basis AS priceBasis,item.description,item.weight,
           item.weight_unit AS weightUnit,item.size,item.durability,
           weapon.weapon_type AS weaponType,weapon.handedness,
           weapon.damage,weapon.damage_type AS damageType,
           weapon.range_text AS rangeText,weapon.reach_text AS reachText,
           weapon.rules_text AS weaponRulesText,
           armor.armor_type AS armorType,armor.coverage,armor.base_soak AS baseSoak,
           armor.damage_modifiers_source_text AS armorDamageModifiers,
           armor.rules_text AS armorRulesText
         FROM campaign_inventory_items allowed
         JOIN items item ON item.id=allowed.item_id
         LEFT JOIN weapon_profiles weapon ON weapon.item_id=item.id
         LEFT JOIN armor_profiles armor ON armor.item_id=item.id
         WHERE allowed.campaign_id=$1
         ORDER BY item.name COLLATE NOCASE,item.id`,
        [campaignId],
      ),
    ]);
    const storedProfile = profileRows[0];
    if (!storedProfile) {
      throw new Error("The Character aggregate is missing its profile row.");
    }
    const profile = row.currencySystem === "Derived Currency" && currencyHoldings.length > 0
      ? {
          ...storedProfile,
          creditsRemaining: Math.round(currencyHoldings.reduce((total, holding) => (
            total + holding.quantity * (
              derivedCurrencies.find((currency) => currency.id === holding.currencyId)
                ?.creditsPerUnit ?? 0
            )
          ), 0) * 1_000_000) / 1_000_000,
        }
      : storedProfile;
    const selectedRace = profile.raceId === null
      ? null
      : await this.getAllowedRaceForCharacter(
          characterId,
          campaignId,
          requestingUserId,
          profile.raceId,
          administrativeOverride,
        );
    if (profile.raceId !== null && !selectedRace) {
      throw new Error("The Character references a Race that is not allowed by its Campaign.");
    }

    return {
      character: {
        id: row.id,
        campaignId: row.campaignId,
        playerUserId: row.playerUserId,
        name: row.name,
        campaignName: row.campaignName,
        playerUsername: row.playerUsername,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isNpc: Boolean(row.isNpc),
      },
      profile,
      attributes: attributeRows.map((attribute) => ({
        ...attribute,
        attributeKey: attributeKey(attribute.attributeKey),
      })),
      skillAllocations,
      items,
      currencyHoldings,
      campaign: {
        id: row.campaignId,
        name: row.campaignName,
        attributePoints: row.attributePoints,
        skillPoints: row.skillPoints,
        maxStartingSkill: row.maxStartingSkill,
        pointsToUnlockNextTier: row.pointsToUnlockNextTier,
        maxPointsInSkill: row.maxPointsInSkill,
        startingCreditAmount: row.startingCreditAmount,
        currencySystem: currencySystem(row.currencySystem),
        fatePointMethod: fatePointMethod(row.fatePointMethod),
        assignedFatePoints: row.assignedFatePoints,
        allowedSystems: systemRows.map(({ systemName }) => campaignSystem(systemName)),
        derivedCurrencies,
      },
      allowedRaces,
      selectedRace,
      skillCatalog,
      skillRelationships,
      authorizedItems,
    };
  }

  async createCharacterAggregate(
    campaignId: number,
    playerUserId: number,
  ): Promise<CharacterAggregate> {
    const id = await this.createInvoker(campaignId, playerUserId);
    const aggregate = await this.getCharacterAggregate(id, campaignId, playerUserId, false);
    if (!aggregate) throw new Error("The new Character aggregate could not be reloaded.");
    return aggregate;
  }

  async createNpcAggregate(
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterAggregate> {
    const id = await this.createNpcInvoker(campaignId, requestingUserId);
    const aggregate = await this.getCharacterAggregate(
      id,
      campaignId,
      requestingUserId,
      true,
    );
    if (!aggregate) throw new Error("The new NPC aggregate could not be reloaded.");
    return aggregate;
  }

  async saveCharacterAggregate(input: SaveCharacterAggregate): Promise<CharacterAggregate> {
    const id = await this.saveInvoker(input);
    const aggregate = await this.getCharacterAggregate(
      id,
      input.campaignId,
      input.requestingUserId,
      input.administrativeOverride,
    );
    if (!aggregate) throw new Error("The saved Character aggregate could not be reloaded.");
    return aggregate;
  }

  async advanceCharacterSkill(input: AdvanceCharacterSkill): Promise<CharacterAggregate> {
    const id = await this.advanceSkillInvoker(input);
    const aggregate = await this.getCharacterAggregate(
      id,
      input.campaignId,
      input.requestingUserId,
      false,
    );
    if (!aggregate) throw new Error("The advanced Character aggregate could not be reloaded.");
    return aggregate;
  }

  async getAllowedRaceForCharacter(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
    raceId: number,
    administrativeOverride = false,
  ): Promise<RaceAggregate | null> {
    const database = await this.databaseProvider();
    const rows = await database.select<Array<{ allowed: number }>>(
      `SELECT EXISTS(
         SELECT 1 FROM campaign_characters character
         JOIN campaign_allowed_races allowed
           ON allowed.campaign_id=character.campaign_id
          AND allowed.race_id=$4
         WHERE character.id=$1 AND character.campaign_id=$2
           AND (
             ($5=0 AND character.is_npc=0 AND character.player_user_id=$3)
             OR ($5=1 AND EXISTS (
               SELECT 1 FROM user_roles actor_role
               WHERE actor_role.user_id=$3 AND actor_role.role='god'
             ))
           )
       ) AS allowed`,
      [characterId, campaignId, requestingUserId, raceId, administrativeOverride ? 1 : 0],
    );
    if (!Boolean(Number(rows[0]?.allowed ?? 0))) return null;
    return this.races.getRaceAggregate(raceId);
  }
}

export const characterRepository: CharacterRepository = new TauriCharacterRepository();
