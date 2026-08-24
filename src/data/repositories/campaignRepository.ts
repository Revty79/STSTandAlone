import { invoke } from "@tauri-apps/api/core";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  type CampaignAggregate,
  type CampaignCharacterReference,
  type CampaignCore,
  type CampaignCurrencySystem,
  type CampaignFatePointMethod,
  type CampaignDerivedCurrencyRecord,
  type CampaignInventoryGenreReference,
  type CampaignInventoryItemReference,
  type CampaignNpcReference,
  type CampaignPlayerReference,
  type CampaignProfileReference,
  type CampaignRaceReference,
  type CampaignSummary,
  type CampaignSystemOption,
  type PlayerCampaignReference,
  type SaveCampaignAggregate,
} from "../../types/campaign";
import { isUserRole } from "../../types/user";
import { getDatabase } from "../database";

export interface CampaignDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[],
  ): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

type CampaignCoreRow = Omit<CampaignCore, "currencySystem" | "fatePointMethod"> & {
  currencySystem: string;
  fatePointMethod: string;
};
type CampaignSummaryRow = Omit<CampaignSummary, "currencySystem"> & {
  currencySystem: string;
};
type CampaignSystemRow = { systemName: string };
type CampaignInventoryItemRow = Omit<CampaignInventoryItemReference, "tags"> & {
  tagsText: string;
};
type CampaignProfileRow = Omit<CampaignProfileReference, "roles" | "isCampaignPlayer"> & {
  rolesText: string;
  isCampaignPlayer: number;
};

function mapCurrencySystem(value: string): CampaignCurrencySystem {
  if (value === "Credits" || value === "Derived Currency") return value;
  throw new Error(`Stored Campaign has unsupported Currency System ${JSON.stringify(value)}.`);
}

function mapFatePointMethod(value: string): CampaignFatePointMethod {
  if (value === "Assigned" || value === "Rolled") return value;
  throw new Error(`Stored Campaign has unsupported Fate Point method ${JSON.stringify(value)}.`);
}

function mapSystem(value: string): CampaignSystemOption {
  if (CAMPAIGN_SYSTEM_OPTIONS.includes(value as CampaignSystemOption)) {
    return value as CampaignSystemOption;
  }
  throw new Error(`Stored Campaign has unsupported Allowed System ${JSON.stringify(value)}.`);
}

function parseTags(value: string): string[] {
  return value ? value.split("\u001f").filter(Boolean) : [];
}

function parseRoles(value: string): CampaignProfileReference["roles"] {
  return value ? value.split("\u001f").filter(Boolean).map((role) => {
    if (!isUserRole(role)) throw new Error("A profile contains an unsupported role.");
    return role;
  }) : [];
}

export interface CampaignRepository {
  listCampaigns(): Promise<CampaignSummary[]>;
  getCampaignAggregate(id: number): Promise<CampaignAggregate | null>;
  saveCampaignAggregate(input: SaveCampaignAggregate): Promise<CampaignAggregate>;
  listProfilesForCampaign(campaignId: number): Promise<CampaignProfileReference[]>;
  listCampaignPlayers(campaignId: number): Promise<CampaignPlayerReference[]>;
  addCampaignPlayer(campaignId: number, userId: number): Promise<void>;
  listCampaignCharacters(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference[]>;
  listCampaignNpcs(campaignId: number): Promise<CampaignNpcReference[]>;
  listCampaignsForPlayerMembership(
    playerUserId: number,
  ): Promise<PlayerCampaignReference[]>;
}

export class TauriCampaignRepository implements CampaignRepository {
  constructor(
    private readonly databaseProvider: () => Promise<CampaignDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveCampaignAggregate) => Promise<number> =
      (input) => invoke<number>("save_campaign_aggregate", { input }),
  ) {}

  async listCampaigns(): Promise<CampaignSummary[]> {
    const database = await this.databaseProvider();
    const rows = await database.select<CampaignSummaryRow[]>(
      `SELECT id,name,currency_system AS currencySystem,updated_at AS updatedAt
       FROM campaigns ORDER BY name COLLATE NOCASE,id`,
    );
    return rows.map((row) => ({ ...row, currencySystem: mapCurrencySystem(row.currencySystem) }));
  }

  async getCampaignAggregate(id: number): Promise<CampaignAggregate | null> {
    const database = await this.databaseProvider();
    const campaigns = await database.select<CampaignCoreRow[]>(
      `SELECT id,name,attribute_points AS attributePoints,skill_points AS skillPoints,
         max_starting_skill AS maxStartingSkill,
         points_to_unlock_next_tier AS pointsToUnlockNextTier,
         max_points_in_skill AS maxPointsInSkill,
         starting_credit_amount AS startingCreditAmount,
         currency_system AS currencySystem,fate_point_method AS fatePointMethod,
         assigned_fate_points AS assignedFatePoints,created_by_user_id AS createdByUserId,
         created_at AS createdAt,updated_at AS updatedAt
       FROM campaigns WHERE id=$1 LIMIT 1`,
      [id],
    );
    if (!campaigns[0]) return null;

    const [derivedCurrencies, systems, races, inventoryGenres, inventoryItems] =
      await Promise.all([
        database.select<CampaignDerivedCurrencyRecord[]>(
          `SELECT id,campaign_id AS campaignId,name,description,
             credits_per_unit AS creditsPerUnit,sort_order AS sortOrder
           FROM campaign_derived_currencies WHERE campaign_id=$1
           ORDER BY sort_order,id`,
          [id],
        ),
        database.select<CampaignSystemRow[]>(
          `SELECT system_name AS systemName FROM campaign_allowed_systems
           WHERE campaign_id=$1 ORDER BY sort_order,system_name COLLATE NOCASE`,
          [id],
        ),
        database.select<CampaignRaceReference[]>(
          `SELECT race.id,race.name FROM campaign_allowed_races link
           JOIN races race ON race.id=link.race_id WHERE link.campaign_id=$1
           ORDER BY link.sort_order,race.name COLLATE NOCASE,race.id`,
          [id],
        ),
        database.select<CampaignInventoryGenreReference[]>(
          `SELECT tag.id,tag.name,tag.tag_group AS tagGroup,tag.description
           FROM campaign_inventory_tags link
           JOIN item_tags_catalog tag ON tag.id=link.tag_id WHERE link.campaign_id=$1
           ORDER BY link.sort_order,tag.name COLLATE NOCASE,tag.id`,
          [id],
        ),
        database.select<CampaignInventoryItemRow[]>(
          `SELECT item.id,item.canonical_id AS canonicalId,item.name,item.record_type AS recordType,
             item.family,item.category,item.catalog_scope AS catalogScope,
             item.equipment_group AS equipmentGroup,
             COALESCE((SELECT group_concat(tag_name,char(31)) FROM (
               SELECT tag.name AS tag_name FROM item_tag_links item_link
               JOIN item_tags_catalog tag ON tag.id=item_link.tag_id
               WHERE item_link.item_id=item.id ORDER BY tag.name COLLATE NOCASE
             )), '') AS tagsText
           FROM campaign_inventory_items link
           JOIN items item ON item.id=link.item_id WHERE link.campaign_id=$1
           ORDER BY link.sort_order,item.name COLLATE NOCASE,item.id`,
          [id],
        ),
      ]);

    return {
      campaign: {
        ...campaigns[0],
        currencySystem: mapCurrencySystem(campaigns[0].currencySystem),
        fatePointMethod: mapFatePointMethod(campaigns[0].fatePointMethod),
      },
      derivedCurrencies,
      allowedSystems: systems.map((row) => mapSystem(row.systemName)),
      allowedRaces: races,
      inventoryGenres,
      inventoryItems: inventoryItems.map(({ tagsText, ...item }) => ({
        ...item,
        tags: parseTags(tagsText),
      })),
    };
  }

  async saveCampaignAggregate(input: SaveCampaignAggregate): Promise<CampaignAggregate> {
    const id = await this.saveInvoker(input);
    const aggregate = await this.getCampaignAggregate(id);
    if (!aggregate) throw new Error("The saved Campaign could not be reloaded.");
    return aggregate;
  }

  async listProfilesForCampaign(campaignId: number): Promise<CampaignProfileReference[]> {
    const database = await this.databaseProvider();
    const rows = await database.select<CampaignProfileRow[]>(
      `SELECT profile.id,profile.username,
         COALESCE((SELECT group_concat(role_name,char(31)) FROM (
           SELECT role AS role_name FROM user_roles
           WHERE user_id=profile.id ORDER BY role
         )), '') AS rolesText,
         EXISTS(
           SELECT 1 FROM campaign_players membership
           WHERE membership.campaign_id=$1 AND membership.user_id=profile.id
             AND membership.is_npc_controller=0
         ) AS isCampaignPlayer
       FROM users profile
       ORDER BY profile.username COLLATE NOCASE,profile.id`,
      [campaignId],
    );
    return rows.map(({ rolesText, isCampaignPlayer, ...profile }) => ({
      ...profile,
      roles: parseRoles(rolesText),
      isCampaignPlayer: Boolean(isCampaignPlayer),
    }));
  }

  async listCampaignPlayers(campaignId: number): Promise<CampaignPlayerReference[]> {
    const database = await this.databaseProvider();
    return database.select<CampaignPlayerReference[]>(
      `SELECT profile.id,profile.username,membership.created_at AS addedAt
       FROM campaign_players membership
       JOIN users profile ON profile.id=membership.user_id
       WHERE membership.campaign_id=$1 AND membership.is_npc_controller=0
       ORDER BY profile.username COLLATE NOCASE,profile.id`,
      [campaignId],
    );
  }

  async addCampaignPlayer(campaignId: number, userId: number): Promise<void> {
    const database = await this.databaseProvider();
    await database.execute(
      `INSERT INTO campaign_players (campaign_id,user_id,is_npc_controller)
       VALUES ($1,$2,0)
       ON CONFLICT(campaign_id,user_id) DO UPDATE SET is_npc_controller=0`,
      [campaignId, userId],
    );
  }

  async listCampaignCharacters(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference[]> {
    const database = await this.databaseProvider();
    return database.select<CampaignCharacterReference[]>(
      `SELECT character.id,character.campaign_id AS campaignId,
         character.player_user_id AS playerUserId,character.name,
         character.created_at AS createdAt,character.updated_at AS updatedAt,
         profile.creation_completed_at AS creationCompletedAt
       FROM campaign_characters character
       LEFT JOIN campaign_character_profiles profile ON profile.character_id=character.id
       WHERE character.campaign_id=$1 AND character.player_user_id=$2
         AND character.is_npc=0
       ORDER BY character.name COLLATE NOCASE,character.id`,
      [campaignId, playerUserId],
    );
  }

  async listCampaignNpcs(campaignId: number): Promise<CampaignNpcReference[]> {
    const database = await this.databaseProvider();
    return database.select<CampaignNpcReference[]>(
      `SELECT character.id,character.campaign_id AS campaignId,character.name,
         character.created_at AS createdAt,character.updated_at AS updatedAt,
         profile.creation_completed_at AS creationCompletedAt,
         character.npc_kind AS npcKind,
         creature.canonical_name AS creatureTemplateName
       FROM campaign_characters character
       LEFT JOIN campaign_character_profiles profile ON profile.character_id=character.id
       LEFT JOIN campaign_creature_npc_profiles creature_profile
         ON creature_profile.character_id=character.id
       LEFT JOIN creatures creature ON creature.id=creature_profile.creature_id
       WHERE character.campaign_id=$1 AND character.is_npc=1
       ORDER BY character.name COLLATE NOCASE,character.id`,
      [campaignId],
    );
  }

  async listCampaignsForPlayerMembership(
    playerUserId: number,
  ): Promise<PlayerCampaignReference[]> {
    const database = await this.databaseProvider();
    return database.select<PlayerCampaignReference[]>(
      `SELECT campaign.id,campaign.name
       FROM campaign_players membership
       JOIN campaigns campaign ON campaign.id=membership.campaign_id
       WHERE membership.user_id=$1 AND membership.is_npc_controller=0
       ORDER BY campaign.name COLLATE NOCASE,campaign.id`,
      [playerUserId],
    );
  }
}

export const campaignRepository: CampaignRepository = new TauriCampaignRepository();
