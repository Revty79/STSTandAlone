import { invoke } from "@tauri-apps/api/core";
import type {
  Creature, CreatureAggregate, CreatureAltName, CreatureAttack, CreatureAttribute,
  CreatureGenreTag, CreatureHpLocation, CreatureItemCandidate, CreatureLibraryFilters,
  CreatureLibraryOptions, CreatureLibraryPage, CreatureMovementMode, CreaturePurchaseItemLink,
  CreatureSkillCandidate, CreatureSkillLink, CreatureSummary, CreatureUse, CreatureVariant,
  SaveCreatureAggregate,
} from "../../types/creature";
import { getDatabase } from "../database";

type ExecuteResult = { rowsAffected: number; lastInsertId?: number };
export interface CreatureDatabase { select<T>(query: string, bindValues?: unknown[]): Promise<T>; execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult> }
type CreatureRow = { id: number; name: string; challenge_rating: number | null; encounter_scale: string; type: string; role: string; size: string; description_short: string; hp_total: number | null; initiative: number | null; armor_soak: number | null; magic_resonance_interaction: string; behavior_tactics: string; habitat: string; diet: string; loot_harvest: string; story_hooks: string; notes: string; created_by_user_id: number | null; source_system: string | null; source_external_id: string | null; created_at: string; updated_at: string };
type SummaryRow = Pick<CreatureRow, "id" | "name" | "challenge_rating" | "type" | "role" | "size" | "updated_at"> & { genre_tags: string; attack_count: number | string; skill_link_count: number | string; purchase_item_count: number | string };
type AltNameRow = { id: number; creature_id: number; alt_name: string; sort_order: number; created_at: string };
type GenreRow = { id: number; creature_id: number; genre_tag: string; sort_order: number; created_at: string };
type AttributeRow = { id: number; creature_id: number; attribute_key: string; value: number; notes: string; sort_order: number; created_at: string; updated_at: string };
type MovementRow = { id: number; creature_id: number; movement_mode: string; base_value: number; notes: string; sort_order: number; created_at: string; updated_at: string };
type HpRow = { id: number; creature_id: number; location_name: string; hp_value: number; notes: string; sort_order: number; created_at: string; updated_at: string };
type AttackRow = { id: number; creature_id: number; name: string; damage: number | null; range_text: string; effect: string; notes: string; sort_order: number; created_at: string; updated_at: string };
type SkillRow = { id: number; creature_id: number; skill_id: number; skill_name: string; skill_classification: string; link_type: string; value: number | null; notes: string; sort_order: number; created_at: string; updated_at: string };
type UseRow = { id: number; creature_id: number; use_type: string; notes: string; sort_order: number; created_at: string; updated_at: string };
type VariantRow = { id: number; creature_id: number; name: string; description: string; notes: string; sort_order: number; created_at: string; updated_at: string };
type PurchaseRow = { id: number; creature_id: number; item_id: number; item_name: string; cost_credits: number | null; category: string; subtype: string; genre_tags: string; relationship: string; notes: string; created_at: string; updated_at: string };
type CandidateSkillRow = { id: number; name: string; classification: string; tier: number | null };
type CandidateItemRow = { id: number; name: string; cost_credits: number | null; category: string; subtype: string; genre_tags: string };
type CountRow = { count: number | string };
type ValueRow = { value: string };

export interface CreatureRepository {
  listCreatures(filters: CreatureLibraryFilters): Promise<CreatureLibraryPage>;
  listOptions(): Promise<CreatureLibraryOptions>;
  listSkillCandidates(search: string, classification?: string): Promise<CreatureSkillCandidate[]>;
  listItemCandidates(search: string): Promise<CreatureItemCandidate[]>;
  getCreatureAggregate(id: number): Promise<CreatureAggregate | null>;
  saveCreatureAggregate(input: SaveCreatureAggregate): Promise<CreatureAggregate>;
  deleteCreature(id: number): Promise<void>;
}

function mapCreature(row: CreatureRow): Creature {
  return {
    id: row.id, name: row.name, challengeRating: row.challenge_rating, encounterScale: row.encounter_scale,
    type: row.type, role: row.role, size: row.size, descriptionShort: row.description_short,
    hpTotal: row.hp_total, initiative: row.initiative, armorSoak: row.armor_soak,
    magicResonanceInteraction: row.magic_resonance_interaction, behaviorTactics: row.behavior_tactics,
    habitat: row.habitat, diet: row.diet, lootHarvest: row.loot_harvest,
    storyHooks: row.story_hooks, notes: row.notes, createdByUserId: row.created_by_user_id,
    sourceSystem: row.source_system, sourceExternalId: row.source_external_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class TauriCreatureRepository implements CreatureRepository {
  constructor(
    private readonly databaseProvider: () => Promise<CreatureDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveCreatureAggregate) => Promise<number> =
      (input) => invoke<number>("save_creature_aggregate", { input }),
  ) {}

  async listCreatures(filters: CreatureLibraryFilters): Promise<CreatureLibraryPage> {
    const database = await this.databaseProvider();
    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const conditions: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (filters.search?.trim()) {
      const token = bind(filters.search.trim());
      conditions.push(`(instr(lower(c.name), lower(${token})) > 0 OR EXISTS (SELECT 1 FROM creature_alt_names alt WHERE alt.creature_id = c.id AND instr(lower(alt.alt_name), lower(${token})) > 0))`);
    }
    if (filters.type?.trim()) conditions.push(`c.type = ${bind(filters.type.trim())} COLLATE NOCASE`);
    if (filters.role?.trim()) conditions.push(`c.role = ${bind(filters.role.trim())} COLLATE NOCASE`);
    if (filters.size?.trim()) conditions.push(`c.size = ${bind(filters.size.trim())} COLLATE NOCASE`);
    if (filters.genre?.trim()) conditions.push(`EXISTS (SELECT 1 FROM creature_genre_tags genre WHERE genre.creature_id = c.id AND genre.genre_tag = ${bind(filters.genre.trim())} COLLATE NOCASE)`);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await database.select<CountRow[]>(`SELECT COUNT(*) AS count FROM creatures c ${where}`, values);
    const total = Number(count[0]?.count ?? 0);
    const limit = bind(pageSize); const offset = bind((page - 1) * pageSize);
    const rows = await database.select<SummaryRow[]>(`SELECT c.id, c.name, c.challenge_rating, c.type, c.role, c.size, c.updated_at,
      COALESCE((SELECT group_concat(ordered.genre_tag, char(31)) FROM (SELECT genre.genre_tag FROM creature_genre_tags genre WHERE genre.creature_id = c.id ORDER BY genre.sort_order, genre.id) ordered), '') AS genre_tags,
      (SELECT COUNT(*) FROM creature_attacks attack WHERE attack.creature_id = c.id) AS attack_count,
      (SELECT COUNT(*) FROM creature_skill_links link WHERE link.creature_id = c.id) AS skill_link_count,
      (SELECT COUNT(*) FROM item_creature_links purchase WHERE purchase.creature_id = c.id AND purchase.relationship = 'Purchase' COLLATE NOCASE) AS purchase_item_count
      FROM creatures c ${where} ORDER BY c.name COLLATE NOCASE, c.id LIMIT ${limit} OFFSET ${offset}`, values);
    return {
      items: rows.map((row): CreatureSummary => ({
        id: row.id, name: row.name, challengeRating: row.challenge_rating, type: row.type,
        role: row.role, size: row.size, updatedAt: row.updated_at,
        genreTags: row.genre_tags ? row.genre_tags.split("\u001f") : [],
        attackCount: Number(row.attack_count), skillLinkCount: Number(row.skill_link_count),
        purchaseItemCount: Number(row.purchase_item_count),
      })),
      total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listOptions(): Promise<CreatureLibraryOptions> {
    const database = await this.databaseProvider();
    const values = async (field: "type" | "role" | "size") => database.select<ValueRow[]>(`SELECT DISTINCT ${field} AS value FROM creatures WHERE length(trim(${field})) > 0 ORDER BY value COLLATE NOCASE LIMIT 500`).then((rows) => rows.map(({ value }) => value));
    const [types, roles, sizes, genres] = await Promise.all([
      values("type"), values("role"), values("size"),
      database.select<ValueRow[]>("SELECT DISTINCT genre_tag AS value FROM creature_genre_tags ORDER BY value COLLATE NOCASE LIMIT 500").then((rows) => rows.map(({ value }) => value)),
    ]);
    return { types, roles, sizes, genres };
  }

  async listSkillCandidates(search: string, classification?: string): Promise<CreatureSkillCandidate[]> {
    const database = await this.databaseProvider();
    const values: unknown[] = [search.trim()];
    const classificationFilter = classification?.trim() ? `AND classification = $${values.push(classification.trim())} COLLATE NOCASE` : "";
    const rows = await database.select<CandidateSkillRow[]>(`SELECT id, name, classification, tier FROM skills WHERE instr(lower(name), lower($1)) > 0 ${classificationFilter} ORDER BY name COLLATE NOCASE, id LIMIT 30`, values);
    return rows.map((row) => ({ id: row.id, name: row.name, classification: row.classification, tier: row.tier }));
  }

  async listItemCandidates(search: string): Promise<CreatureItemCandidate[]> {
    const database = await this.databaseProvider();
    const rows = await database.select<CandidateItemRow[]>(`SELECT i.id, i.name, i.cost_credits, i.category, i.subtype,
      COALESCE((SELECT group_concat(ordered.genre_tag, char(31)) FROM (SELECT genre.genre_tag FROM item_genre_tags genre WHERE genre.item_id = i.id ORDER BY genre.sort_order, genre.id) ordered), '') AS genre_tags
      FROM items i WHERE i.catalog_section = 'Inventory' COLLATE NOCASE AND instr(lower(i.name), lower($1)) > 0
      ORDER BY i.name COLLATE NOCASE, i.id LIMIT 30`, [search.trim()]);
    return rows.map((row) => ({ id: row.id, name: row.name, costCredits: row.cost_credits, category: row.category, subtype: row.subtype, genreTags: row.genre_tags ? row.genre_tags.split("\u001f") : [] }));
  }

  async getCreatureAggregate(id: number): Promise<CreatureAggregate | null> {
    const database = await this.databaseProvider();
    const creatures = await database.select<CreatureRow[]>("SELECT id, name, challenge_rating, encounter_scale, type, role, size, description_short, hp_total, initiative, armor_soak, magic_resonance_interaction, behavior_tactics, habitat, diet, loot_harvest, story_hooks, notes, created_by_user_id, source_system, source_external_id, created_at, updated_at FROM creatures WHERE id = $1 LIMIT 1", [id]);
    if (!creatures[0]) return null;
    const [altNames, genreTags, attributes, movementModes, hpLocations, attacks, skillLinks, uses, variants, purchaseLinks] = await Promise.all([
      database.select<AltNameRow[]>("SELECT id, creature_id, alt_name, sort_order, created_at FROM creature_alt_names WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<GenreRow[]>("SELECT id, creature_id, genre_tag, sort_order, created_at FROM creature_genre_tags WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<AttributeRow[]>("SELECT id, creature_id, attribute_key, value, notes, sort_order, created_at, updated_at FROM creature_attributes WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<MovementRow[]>("SELECT id, creature_id, movement_mode, base_value, notes, sort_order, created_at, updated_at FROM creature_movement_modes WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<HpRow[]>("SELECT id, creature_id, location_name, hp_value, notes, sort_order, created_at, updated_at FROM creature_hp_locations WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<AttackRow[]>("SELECT id, creature_id, name, damage, range_text, effect, notes, sort_order, created_at, updated_at FROM creature_attacks WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<SkillRow[]>(`SELECT link.id, link.creature_id, link.skill_id, skill.name AS skill_name, skill.classification AS skill_classification, link.link_type, link.value, link.notes, link.sort_order, link.created_at, link.updated_at FROM creature_skill_links link JOIN skills skill ON skill.id = link.skill_id WHERE link.creature_id = $1 ORDER BY link.link_type, link.sort_order, skill.name COLLATE NOCASE, link.id`, [id]),
      database.select<UseRow[]>("SELECT id, creature_id, use_type, notes, sort_order, created_at, updated_at FROM creature_uses WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<VariantRow[]>("SELECT id, creature_id, name, description, notes, sort_order, created_at, updated_at FROM creature_variants WHERE creature_id = $1 ORDER BY sort_order, id", [id]),
      database.select<PurchaseRow[]>(`SELECT link.id, link.creature_id, link.item_id, item.name AS item_name, item.cost_credits, item.category, item.subtype,
        COALESCE((SELECT group_concat(ordered.genre_tag, char(31)) FROM (SELECT genre.genre_tag FROM item_genre_tags genre WHERE genre.item_id = item.id ORDER BY genre.sort_order, genre.id) ordered), '') AS genre_tags,
        link.relationship, link.notes, link.created_at, link.updated_at FROM item_creature_links link JOIN items item ON item.id = link.item_id WHERE link.creature_id = $1 ORDER BY item.name COLLATE NOCASE, item.id`, [id]),
    ]);
    return {
      creature: mapCreature(creatures[0]),
      altNames: altNames.map((row): CreatureAltName => ({ id: row.id, creatureId: row.creature_id, altName: row.alt_name, sortOrder: row.sort_order, createdAt: row.created_at })),
      genreTags: genreTags.map((row): CreatureGenreTag => ({ id: row.id, creatureId: row.creature_id, genreTag: row.genre_tag, sortOrder: row.sort_order, createdAt: row.created_at })),
      attributes: attributes.map((row): CreatureAttribute => ({ id: row.id, creatureId: row.creature_id, attributeKey: row.attribute_key, value: row.value, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      movementModes: movementModes.map((row): CreatureMovementMode => ({ id: row.id, creatureId: row.creature_id, movementMode: row.movement_mode, baseValue: row.base_value, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      hpLocations: hpLocations.map((row): CreatureHpLocation => ({ id: row.id, creatureId: row.creature_id, locationName: row.location_name, hpValue: row.hp_value, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      attacks: attacks.map((row): CreatureAttack => ({ id: row.id, creatureId: row.creature_id, name: row.name, damage: row.damage, rangeText: row.range_text, effect: row.effect, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      skillLinks: skillLinks.map((row): CreatureSkillLink => ({ id: row.id, creatureId: row.creature_id, skillId: row.skill_id, skillName: row.skill_name, skillClassification: row.skill_classification, linkType: row.link_type, value: row.value, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      uses: uses.map((row): CreatureUse => ({ id: row.id, creatureId: row.creature_id, useType: row.use_type, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      variants: variants.map((row): CreatureVariant => ({ id: row.id, creatureId: row.creature_id, name: row.name, description: row.description, notes: row.notes, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })),
      purchaseItemLinks: purchaseLinks.map((row): CreaturePurchaseItemLink => ({ id: row.id, creatureId: row.creature_id, itemId: row.item_id, itemName: row.item_name, costCredits: row.cost_credits, category: row.category, subtype: row.subtype, genreTags: row.genre_tags ? row.genre_tags.split("\u001f") : [], relationship: row.relationship, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at })),
    };
  }

  async saveCreatureAggregate(input: SaveCreatureAggregate): Promise<CreatureAggregate> {
    const id = await this.saveInvoker(input);
    const aggregate = await this.getCreatureAggregate(id);
    if (!aggregate) throw new Error("The saved Creature could not be reloaded.");
    return aggregate;
  }

  async deleteCreature(id: number): Promise<void> {
    const database = await this.databaseProvider();
    await database.execute("DELETE FROM creatures WHERE id = $1", [id]);
  }
}

export const creatureRepository: CreatureRepository = new TauriCreatureRepository();
