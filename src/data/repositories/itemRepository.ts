import { invoke } from "@tauri-apps/api/core";
import type {
  Item,
  ItemAggregate,
  ItemArmorProfile,
  ItemCatalogView,
  ItemCreatureLinkSummary,
  ItemLibraryFilters,
  ItemLibraryOptions,
  ItemLibraryPage,
  ItemSummary,
  ItemWeaponProfile,
  SaveItemAggregate,
} from "../../types/item";
import { getDatabase } from "../database";

type ExecuteResult = { rowsAffected: number; lastInsertId?: number };
export interface ItemDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult>;
}

type ItemRow = {
  id: number; name: string; catalog_section: string; timeline_tag: string;
  cost_credits: number | null; category: string; subtype: string; weight: number | null;
  effect_description: string; narrative_variant_notes: string; created_by_user_id: number | null;
  source_system: string | null; source_external_id: string | null; created_at: string; updated_at: string;
};
type SummaryRow = Pick<ItemRow, "id" | "name" | "catalog_section" | "timeline_tag" | "cost_credits" | "category" | "subtype" | "weight" | "updated_at"> & {
  genre_tags: string; weapon_role: string | null; weapon_category: string | null;
  damage_type: string | null; armor_category: string | null; armor_type: string | null;
  has_weapon_profile: number | string; has_armor_profile: number | string; has_purchase_creature_link: number | string;
};
type WeaponRow = { id: number; item_id: number; weapon_role: string; weapon_category: string; handedness: string; damage_type: string; range_type: string; range_text: string; damage: number | null; weapon_effect_description: string; weapon_narrative_notes: string; source_system: string | null; source_external_id: string | null; created_at: string; updated_at: string };
type ArmorRow = { id: number; item_id: number; area_covered: string; soak: number | null; armor_category: string; armor_type: string; encumbrance_penalty: number | null; armor_effect_description: string; armor_narrative_notes: string; source_system: string | null; source_external_id: string | null; created_at: string; updated_at: string };
type CreatureLinkRow = { creature_id: number; creature_name: string; relationship: string; notes: string };
type GenreRow = { genre_tag: string };
type CountRow = { count: number | string };
type ValueRow = { value: string };

export interface ItemRepository {
  listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage>;
  listOptions(filters: ItemLibraryFilters): Promise<ItemLibraryOptions>;
  getItemAggregate(id: number): Promise<ItemAggregate | null>;
  saveItemAggregate(input: SaveItemAggregate): Promise<ItemAggregate>;
  deleteItem(id: number): Promise<void>;
}

function mapItem(row: ItemRow): Item {
  return {
    id: row.id, name: row.name, catalogSection: row.catalog_section,
    timelineTag: row.timeline_tag, costCredits: row.cost_credits,
    category: row.category, subtype: row.subtype, weight: row.weight,
    effectDescription: row.effect_description, narrativeVariantNotes: row.narrative_variant_notes,
    createdByUserId: row.created_by_user_id, sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapWeapon(row: WeaponRow): ItemWeaponProfile {
  return {
    id: row.id, itemId: row.item_id, weaponRole: row.weapon_role,
    weaponCategory: row.weapon_category, handedness: row.handedness,
    damageType: row.damage_type, rangeType: row.range_type, rangeText: row.range_text,
    damage: row.damage, weaponEffectDescription: row.weapon_effect_description,
    weaponNarrativeNotes: row.weapon_narrative_notes, sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapArmor(row: ArmorRow): ItemArmorProfile {
  return {
    id: row.id, itemId: row.item_id, areaCovered: row.area_covered, soak: row.soak,
    armorCategory: row.armor_category, armorType: row.armor_type,
    encumbrancePenalty: row.encumbrance_penalty,
    armorEffectDescription: row.armor_effect_description,
    armorNarrativeNotes: row.armor_narrative_notes, sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function viewCondition(view: ItemCatalogView, includeImprovised = false): string {
  if (view === "weapons") {
    return `EXISTS (SELECT 1 FROM item_weapon_profiles view_weapon WHERE view_weapon.item_id = i.id${includeImprovised ? "" : " AND view_weapon.weapon_role <> 'Improvised' COLLATE NOCASE"})`;
  }
  if (view === "armor") return "EXISTS (SELECT 1 FROM item_armor_profiles view_armor WHERE view_armor.item_id = i.id)";
  if (view === "general-equipment") {
    return `i.catalog_section = 'Equipment' COLLATE NOCASE
      AND NOT EXISTS (SELECT 1 FROM item_weapon_profiles general_weapon WHERE general_weapon.item_id = i.id AND general_weapon.weapon_role <> 'Improvised' COLLATE NOCASE)
      AND NOT EXISTS (SELECT 1 FROM item_armor_profiles general_armor WHERE general_armor.item_id = i.id)`;
  }
  return "i.catalog_section = 'Inventory' COLLATE NOCASE";
}

function optionField(view: ItemCatalogView, kind: "category" | "subtype" | "type"): string | null {
  if (kind === "category") return view === "weapons" ? "weapon.weapon_category" : view === "armor" ? "armor.armor_category" : "i.category";
  if (kind === "subtype") return view === "general-equipment" || view === "inventory" ? "i.subtype" : null;
  return view === "weapons" ? "weapon.damage_type" : view === "armor" ? "armor.armor_type" : null;
}

function summarySelect(): string {
  return `SELECT i.id, i.name, i.catalog_section, i.timeline_tag, i.cost_credits, i.category, i.subtype, i.weight, i.updated_at,
      COALESCE((SELECT group_concat(ordered.genre_tag, char(31)) FROM (
        SELECT genre.genre_tag FROM item_genre_tags genre WHERE genre.item_id = i.id ORDER BY genre.sort_order, genre.id
      ) ordered), '') AS genre_tags,
      weapon.weapon_role, weapon.weapon_category, weapon.damage_type,
      armor.armor_category, armor.armor_type,
      CASE WHEN weapon.id IS NULL THEN 0 ELSE 1 END AS has_weapon_profile,
      CASE WHEN armor.id IS NULL THEN 0 ELSE 1 END AS has_armor_profile,
      CASE WHEN EXISTS (SELECT 1 FROM item_creature_links creature_link WHERE creature_link.item_id = i.id AND creature_link.relationship = 'Purchase' COLLATE NOCASE) THEN 1 ELSE 0 END AS has_purchase_creature_link
    FROM items i
    LEFT JOIN item_weapon_profiles weapon ON weapon.item_id = i.id
    LEFT JOIN item_armor_profiles armor ON armor.item_id = i.id`;
}

function mapSummary(row: SummaryRow): ItemSummary {
  return {
    id: row.id, name: row.name, catalogSection: row.catalog_section,
    timelineTag: row.timeline_tag, costCredits: row.cost_credits,
    category: row.category, subtype: row.subtype, weight: row.weight,
    updatedAt: row.updated_at, genreTags: row.genre_tags ? row.genre_tags.split("\u001f") : [],
    weaponRole: row.weapon_role, weaponCategory: row.weapon_category,
    damageType: row.damage_type, armorCategory: row.armor_category, armorType: row.armor_type,
    hasWeaponProfile: Boolean(Number(row.has_weapon_profile)),
    hasArmorProfile: Boolean(Number(row.has_armor_profile)),
    hasPurchaseCreatureLink: Boolean(Number(row.has_purchase_creature_link)),
  };
}

export class TauriItemRepository implements ItemRepository {
  constructor(
    private readonly databaseProvider: () => Promise<ItemDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveItemAggregate) => Promise<number> =
      (input) => invoke<number>("save_item_aggregate", { input }),
  ) {}

  async listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage> {
    const database = await this.databaseProvider();
    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const conditions = [viewCondition(filters.view, filters.includeImprovised)];
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (filters.search?.trim()) {
      const token = bind(filters.search.trim());
      conditions.push(`(instr(lower(i.name), lower(${token})) > 0 OR instr(lower(i.category), lower(${token})) > 0 OR instr(lower(i.subtype), lower(${token})) > 0)`);
    }
    const category = optionField(filters.view, "category");
    const subtype = optionField(filters.view, "subtype");
    const type = optionField(filters.view, "type");
    if (filters.category?.trim() && category) conditions.push(`${category} = ${bind(filters.category.trim())} COLLATE NOCASE`);
    if (filters.subtype?.trim() && subtype) conditions.push(`${subtype} = ${bind(filters.subtype.trim())} COLLATE NOCASE`);
    if (filters.type?.trim() && type) conditions.push(`${type} = ${bind(filters.type.trim())} COLLATE NOCASE`);
    if (filters.genre?.trim()) conditions.push(`EXISTS (SELECT 1 FROM item_genre_tags filter_genre WHERE filter_genre.item_id = i.id AND filter_genre.genre_tag = ${bind(filters.genre.trim())} COLLATE NOCASE)`);
    if (filters.view === "inventory" && filters.purchasableCreaturesOnly) {
      conditions.push("EXISTS (SELECT 1 FROM item_creature_links purchase_link WHERE purchase_link.item_id = i.id AND purchase_link.relationship = 'Purchase' COLLATE NOCASE)");
    }
    const from = `${summarySelect()} WHERE ${conditions.join(" AND ")}`;
    const count = await database.select<CountRow[]>(`SELECT COUNT(*) AS count FROM (${from}) filtered_items`, values);
    const total = Number(count[0]?.count ?? 0);
    const limit = bind(pageSize);
    const offset = bind((page - 1) * pageSize);
    const rows = await database.select<SummaryRow[]>(`${from} ORDER BY i.name COLLATE NOCASE, i.id LIMIT ${limit} OFFSET ${offset}`, values);
    return { items: rows.map(mapSummary), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async listOptions(filters: ItemLibraryFilters): Promise<ItemLibraryOptions> {
    const database = await this.databaseProvider();
    const condition = viewCondition(filters.view, filters.includeImprovised);
    const base = `FROM items i LEFT JOIN item_weapon_profiles weapon ON weapon.item_id = i.id LEFT JOIN item_armor_profiles armor ON armor.item_id = i.id WHERE ${condition}`;
    const valuesFor = async (field: string | null) => {
      if (!field) return [];
      const rows = await database.select<ValueRow[]>(`SELECT DISTINCT ${field} AS value ${base} AND length(trim(${field})) > 0 ORDER BY value COLLATE NOCASE LIMIT 500`);
      return rows.map(({ value }) => value);
    };
    const [categories, subtypes, types, genres] = await Promise.all([
      valuesFor(optionField(filters.view, "category")),
      valuesFor(optionField(filters.view, "subtype")),
      valuesFor(optionField(filters.view, "type")),
      database.select<ValueRow[]>(`SELECT DISTINCT genre.genre_tag AS value FROM item_genre_tags genre JOIN items i ON i.id = genre.item_id LEFT JOIN item_weapon_profiles weapon ON weapon.item_id = i.id LEFT JOIN item_armor_profiles armor ON armor.item_id = i.id WHERE ${condition} ORDER BY value COLLATE NOCASE LIMIT 500`).then((rows) => rows.map(({ value }) => value)),
    ]);
    return { categories, subtypes, types, genres };
  }

  async getItemAggregate(id: number): Promise<ItemAggregate | null> {
    const database = await this.databaseProvider();
    const items = await database.select<ItemRow[]>(`SELECT id, name, catalog_section, timeline_tag, cost_credits, category, subtype, weight, effect_description, narrative_variant_notes, created_by_user_id, source_system, source_external_id, created_at, updated_at FROM items WHERE id = $1 LIMIT 1`, [id]);
    if (!items[0]) return null;
    const [genres, weapons, armor, creatureLinks] = await Promise.all([
      database.select<GenreRow[]>("SELECT genre_tag FROM item_genre_tags WHERE item_id = $1 ORDER BY sort_order, id", [id]),
      database.select<WeaponRow[]>("SELECT id, item_id, weapon_role, weapon_category, handedness, damage_type, range_type, range_text, damage, weapon_effect_description, weapon_narrative_notes, source_system, source_external_id, created_at, updated_at FROM item_weapon_profiles WHERE item_id = $1 LIMIT 1", [id]),
      database.select<ArmorRow[]>("SELECT id, item_id, area_covered, soak, armor_category, armor_type, encumbrance_penalty, armor_effect_description, armor_narrative_notes, source_system, source_external_id, created_at, updated_at FROM item_armor_profiles WHERE item_id = $1 LIMIT 1", [id]),
      database.select<CreatureLinkRow[]>(`SELECT creature.id AS creature_id, creature.name AS creature_name, link.relationship, link.notes FROM item_creature_links link JOIN creatures creature ON creature.id = link.creature_id WHERE link.item_id = $1 ORDER BY link.relationship, creature.name COLLATE NOCASE, creature.id`, [id]),
    ]);
    return {
      item: mapItem(items[0]), genreTags: genres.map(({ genre_tag }) => genre_tag),
      weaponProfile: weapons[0] ? mapWeapon(weapons[0]) : null,
      armorProfile: armor[0] ? mapArmor(armor[0]) : null,
      creatureLinks: creatureLinks.map((row): ItemCreatureLinkSummary => ({ creatureId: row.creature_id, creatureName: row.creature_name, relationship: row.relationship, notes: row.notes })),
    };
  }

  async saveItemAggregate(input: SaveItemAggregate): Promise<ItemAggregate> {
    const id = await this.saveInvoker(input);
    const aggregate = await this.getItemAggregate(id);
    if (!aggregate) throw new Error("The saved Item could not be reloaded.");
    return aggregate;
  }

  async deleteItem(id: number): Promise<void> {
    const database = await this.databaseProvider();
    await database.execute("DELETE FROM items WHERE id = $1", [id]);
  }
}

export const itemRepository: ItemRepository = new TauriItemRepository();
