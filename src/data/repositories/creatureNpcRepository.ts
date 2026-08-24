import { invoke } from "@tauri-apps/api/core";
import type { CharacterAuthorizedItem } from "../../types/character";
import type { SaveCreatureAggregate } from "../../types/creature";
import type {
  CreateCreatureNpc,
  CreatureNpcAggregate,
  CreatureNpcCore,
  CreatureNpcOwnedItem,
  SaveCreatureNpc,
} from "../../types/creatureNpc";
import { getDatabase } from "../database";

export interface CreatureNpcDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

type CreatureNpcCoreRow = CreatureNpcCore & {
  personality: string;
  instanceNotes: string;
  hpAdjustment: number;
  baselineSnapshotJson: string;
  currentSnapshotJson: string;
};

function parseSnapshot(value: string, label: string): SaveCreatureAggregate {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || !("core" in parsed)) {
    throw new Error(`${label} is not a valid Creature aggregate.`);
  }
  return parsed as SaveCreatureAggregate;
}

export interface CreatureNpcRepository {
  getCreatureNpc(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CreatureNpcAggregate | null>;
  createCreatureNpc(input: CreateCreatureNpc): Promise<CreatureNpcAggregate>;
  saveCreatureNpc(input: SaveCreatureNpc): Promise<CreatureNpcAggregate>;
}

export class TauriCreatureNpcRepository implements CreatureNpcRepository {
  constructor(
    private readonly databaseProvider: () => Promise<CreatureNpcDatabase> = getDatabase,
    private readonly createInvoker: (input: CreateCreatureNpc) => Promise<number> =
      (input) => invoke<number>("create_creature_npc", { input }),
    private readonly saveInvoker: (input: SaveCreatureNpc) => Promise<number> =
      (input) => invoke<number>("save_creature_npc", { input }),
  ) {}

  async getCreatureNpc(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CreatureNpcAggregate | null> {
    const database = await this.databaseProvider();
    const rows = await database.select<CreatureNpcCoreRow[]>(
      `SELECT character.id,character.campaign_id AS campaignId,
         campaign.name AS campaignName,character.player_user_id AS controllerUserId,
         character.name,profile.creature_id AS creatureId,
         creature.canonical_id AS creatureCanonicalId,
         creature.canonical_name AS creatureName,
         character.created_at AS createdAt,character.updated_at AS updatedAt,
         profile.personality,profile.instance_notes AS instanceNotes,
         profile.hp_adjustment AS hpAdjustment,
         profile.baseline_snapshot_json AS baselineSnapshotJson,
         profile.current_snapshot_json AS currentSnapshotJson
       FROM campaign_characters character
       JOIN campaigns campaign ON campaign.id=character.campaign_id
       JOIN campaign_creature_npc_profiles profile ON profile.character_id=character.id
       JOIN creatures creature ON creature.id=profile.creature_id
       WHERE character.id=$1 AND character.campaign_id=$2
         AND character.is_npc=1 AND character.npc_kind='creature'
         AND EXISTS (
           SELECT 1 FROM user_roles actor_role
           WHERE actor_role.user_id=$3 AND actor_role.role='god'
         )
       LIMIT 1`,
      [characterId, campaignId, requestingUserId],
    );
    const row = rows[0];
    if (!row) return null;

    const [items, authorizedItems] = await Promise.all([
      database.select<CreatureNpcOwnedItem[]>(
        `SELECT owned.item_id AS itemId,item.canonical_id AS canonicalId,item.name,
           item.catalog_scope AS catalogScope,item.equipment_group AS equipmentGroup,
           item.record_type AS recordType,item.category,owned.quantity
         FROM campaign_character_items owned
         JOIN items item ON item.id=owned.item_id
         WHERE owned.character_id=$1
         ORDER BY item.name COLLATE NOCASE,item.id`,
        [characterId],
      ),
      database.select<CharacterAuthorizedItem[]>(
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

    const {
      personality,
      instanceNotes,
      hpAdjustment,
      baselineSnapshotJson,
      currentSnapshotJson,
      ...core
    } = row;
    return {
      core,
      profile: {
        personality,
        instanceNotes,
        hpAdjustment,
        baselineSnapshot: parseSnapshot(baselineSnapshotJson, "Creature NPC baseline"),
        currentSnapshot: parseSnapshot(currentSnapshotJson, "Creature NPC record"),
      },
      items,
      authorizedItems,
    };
  }

  async createCreatureNpc(input: CreateCreatureNpc): Promise<CreatureNpcAggregate> {
    const characterId = await this.createInvoker(input);
    const aggregate = await this.getCreatureNpc(
      characterId,
      input.campaignId,
      input.requestingUserId,
    );
    if (!aggregate) throw new Error("The new Creature NPC could not be reloaded.");
    return aggregate;
  }

  async saveCreatureNpc(input: SaveCreatureNpc): Promise<CreatureNpcAggregate> {
    const characterId = await this.saveInvoker(input);
    const aggregate = await this.getCreatureNpc(
      characterId,
      input.campaignId,
      input.requestingUserId,
    );
    if (!aggregate) throw new Error("The saved Creature NPC could not be reloaded.");
    return aggregate;
  }
}

export const creatureNpcRepository: CreatureNpcRepository = new TauriCreatureNpcRepository();
