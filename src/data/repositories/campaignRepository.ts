import { invoke } from "@tauri-apps/api/core";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  type CampaignAggregate,
  type CampaignCharacterReference,
  type CampaignCore,
  type CampaignCurrencySystem,
  type CampaignDerivedCurrencyRecord,
  type CampaignInventoryGenreReference,
  type CampaignInventoryItemReference,
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

type CampaignCoreRow = Omit<CampaignCore, "currencySystem"> & {
  currencySystem: string;
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
  createCampaignCharacter(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference>;
  listCampaignsForPlayerWithCharacters(
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
         currency_system AS currencySystem,created_by_user_id AS createdByUserId,
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
             item.family,item.category,
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
       WHERE membership.campaign_id=$1
       ORDER BY profile.username COLLATE NOCASE,profile.id`,
      [campaignId],
    );
  }

  async addCampaignPlayer(campaignId: number, userId: number): Promise<void> {
    const database = await this.databaseProvider();
    await database.execute(
      "INSERT INTO campaign_players (campaign_id,user_id) VALUES ($1,$2)",
      [campaignId, userId],
    );
  }

  async listCampaignCharacters(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference[]> {
    const database = await this.databaseProvider();
    return database.select<CampaignCharacterReference[]>(
      `SELECT id,campaign_id AS campaignId,player_user_id AS playerUserId,
         name,created_at AS createdAt,updated_at AS updatedAt
       FROM campaign_characters
       WHERE campaign_id=$1 AND player_user_id=$2
       ORDER BY name COLLATE NOCASE,id`,
      [campaignId, playerUserId],
    );
  }

  async createCampaignCharacter(
    campaignId: number,
    playerUserId: number,
  ): Promise<CampaignCharacterReference> {
    const database = await this.databaseProvider();
    const result = await database.execute(
      "INSERT INTO campaign_characters (campaign_id,player_user_id) VALUES ($1,$2)",
      [campaignId, playerUserId],
    );
    if (result.lastInsertId === undefined) {
      throw new Error("SQLite did not return the new Character identifier.");
    }
    const rows = await database.select<CampaignCharacterReference[]>(
      `SELECT id,campaign_id AS campaignId,player_user_id AS playerUserId,
         name,created_at AS createdAt,updated_at AS updatedAt
       FROM campaign_characters WHERE id=$1 LIMIT 1`,
      [result.lastInsertId],
    );
    if (!rows[0]) throw new Error("The saved Character could not be reloaded.");
    return rows[0];
  }

  async listCampaignsForPlayerWithCharacters(
    playerUserId: number,
  ): Promise<PlayerCampaignReference[]> {
    const database = await this.databaseProvider();
    return database.select<PlayerCampaignReference[]>(
      `SELECT campaign.id,campaign.name
       FROM campaigns campaign
       WHERE EXISTS (
         SELECT 1 FROM campaign_characters character
         WHERE character.campaign_id=campaign.id
           AND character.player_user_id=$1
       )
       ORDER BY campaign.name COLLATE NOCASE,campaign.id`,
      [playerUserId],
    );
  }
}

export const campaignRepository: CampaignRepository = new TauriCampaignRepository();
