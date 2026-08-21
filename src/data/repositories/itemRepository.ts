import { invoke } from "@tauri-apps/api/core";
import type {
  Item,
  ItemAggregate,
  ItemArmorProfile,
  ItemCatalogView,
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
  id: number;
  name: string;
  catalog_scope: string;
  timeline_tag: string;
  cost_credits: number;
  category: string;
  subtype: string;
  weight: number;
  effect_description: string;
  narrative_variant_notes: string;
  created_by_user_id: number | null;
  source_system: string | null;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

type ItemSummaryRow = Pick<
  ItemRow,
  | "id"
  | "name"
  | "catalog_scope"
  | "timeline_tag"
  | "cost_credits"
  | "category"
  | "subtype"
  | "weight"
  | "updated_at"
> & {
  genre_tags: string;
  weapon_role: string | null;
  weapon_category: string | null;
  damage_type: string | null;
  armor_category: string | null;
  armor_type: string | null;
  has_weapon_profile: number | string;
  has_armor_profile: number | string;
};

type WeaponProfileRow = {
  id: number;
  item_id: number;
  weapon_role: string;
  weapon_category: string;
  handedness: string;
  damage_type: string;
  range_type: string;
  range_text: string;
  damage: number;
  weapon_effect_description: string;
  weapon_narrative_notes: string;
  source_system: string | null;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

type ArmorProfileRow = {
  id: number;
  item_id: number;
  area_covered: string;
  soak: number;
  armor_category: string;
  armor_type: string;
  encumbrance_penalty: number;
  armor_effect_description: string;
  armor_narrative_notes: string;
  source_system: string | null;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

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
    id: row.id,
    name: row.name,
    catalogScope: row.catalog_scope,
    timelineTag: row.timeline_tag,
    costCredits: row.cost_credits,
    category: row.category,
    subtype: row.subtype,
    weight: row.weight,
    effectDescription: row.effect_description,
    narrativeVariantNotes: row.narrative_variant_notes,
    createdByUserId: row.created_by_user_id,
    sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWeapon(row: WeaponProfileRow): ItemWeaponProfile {
  return {
    id: row.id,
    itemId: row.item_id,
    weaponRole: row.weapon_role,
    weaponCategory: row.weapon_category,
    handedness: row.handedness,
    damageType: row.damage_type,
    rangeType: row.range_type,
    rangeText: row.range_text,
    damage: row.damage,
    weaponEffectDescription: row.weapon_effect_description,
    weaponNarrativeNotes: row.weapon_narrative_notes,
    sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArmor(row: ArmorProfileRow): ItemArmorProfile {
  return {
    id: row.id,
    itemId: row.item_id,
    areaCovered: row.area_covered,
    soak: row.soak,
    armorCategory: row.armor_category,
    armorType: row.armor_type,
    encumbrancePenalty: row.encumbrance_penalty,
    armorEffectDescription: row.armor_effect_description,
    armorNarrativeNotes: row.armor_narrative_notes,
    sourceSystem: row.source_system,
    sourceExternalId: row.source_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function viewCondition(view: ItemCatalogView, includeImprovised = false): string {
  switch (view) {
    case "weapons":
      return `EXISTS (SELECT 1 FROM item_weapon_profiles view_weapon WHERE view_weapon.item_id = i.id${
        includeImprovised ? "" : " AND view_weapon.weapon_role <> 'improvised' COLLATE NOCASE"
      })`;
    case "armor":
      return "EXISTS (SELECT 1 FROM item_armor_profiles view_armor WHERE view_armor.item_id = i.id)";
    case "general-equipment":
      return `i.catalog_scope = 'equipment' COLLATE NOCASE AND (
        length(trim(i.category)) > 0
        OR EXISTS (SELECT 1 FROM item_weapon_profiles view_weapon WHERE view_weapon.item_id = i.id AND view_weapon.weapon_role = 'improvised' COLLATE NOCASE)
        OR (
          NOT EXISTS (SELECT 1 FROM item_weapon_profiles view_weapon WHERE view_weapon.item_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM item_armor_profiles view_armor WHERE view_armor.item_id = i.id)
        )
      )`;
    case "inventory":
      return "i.catalog_scope = 'inventory' COLLATE NOCASE";
  }
}

function summarySelect(): string {
  return `SELECT i.id, i.name, i.catalog_scope, i.timeline_tag, i.cost_credits,
      i.category, i.subtype, i.weight, i.updated_at,
      COALESCE((SELECT group_concat(ordered.genre_tag, char(31)) FROM (
        SELECT genre.genre_tag FROM item_genre_tags genre
        WHERE genre.item_id = i.id ORDER BY genre.sort_order, genre.id
      ) ordered), '') AS genre_tags,
      weapon.weapon_role, weapon.weapon_category, weapon.damage_type,
      armor.armor_category, armor.armor_type,
      CASE WHEN weapon.id IS NULL THEN 0 ELSE 1 END AS has_weapon_profile,
      CASE WHEN armor.id IS NULL THEN 0 ELSE 1 END AS has_armor_profile
    FROM items i
    LEFT JOIN item_weapon_profiles weapon ON weapon.item_id = i.id
    LEFT JOIN item_armor_profiles armor ON armor.item_id = i.id`;
}

function mapSummary(row: ItemSummaryRow): ItemSummary {
  return {
    id: row.id,
    name: row.name,
    catalogScope: row.catalog_scope,
    timelineTag: row.timeline_tag,
    costCredits: row.cost_credits,
    category: row.category,
    subtype: row.subtype,
    weight: row.weight,
    updatedAt: row.updated_at,
    genreTags: row.genre_tags ? row.genre_tags.split("\u001f") : [],
    weaponRole: row.weapon_role,
    weaponCategory: row.weapon_category,
    damageType: row.damage_type,
    armorCategory: row.armor_category,
    armorType: row.armor_type,
    hasWeaponProfile: Boolean(Number(row.has_weapon_profile)),
    hasArmorProfile: Boolean(Number(row.has_armor_profile)),
  };
}

function optionField(view: ItemCatalogView, kind: "category" | "subtype" | "type"): string | null {
  if (kind === "category") {
    if (view === "weapons") return "weapon.weapon_category";
    if (view === "armor") return "armor.armor_category";
    return "i.category";
  }
  if (kind === "subtype") return view === "general-equipment" || view === "inventory" ? "i.subtype" : null;
  if (view === "weapons") return "weapon.damage_type";
  if (view === "armor") return "armor.armor_type";
  return null;
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
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filters.search?.trim()) {
      const token = bind(filters.search.trim());
      conditions.push(`(
        instr(lower(i.name), lower(${token})) > 0
        OR instr(lower(i.category), lower(${token})) > 0
        OR instr(lower(i.subtype), lower(${token})) > 0
        OR instr(lower(COALESCE(weapon.weapon_category, '')), lower(${token})) > 0
        OR instr(lower(COALESCE(armor.armor_category, '')), lower(${token})) > 0
      )`);
    }
    const categoryField = optionField(filters.view, "category");
    if (filters.category?.trim() && categoryField) {
      conditions.push(`${categoryField} = ${bind(filters.category.trim())} COLLATE NOCASE`);
    }
    const subtypeField = optionField(filters.view, "subtype");
    if (filters.subtype?.trim() && subtypeField) {
      conditions.push(`${subtypeField} = ${bind(filters.subtype.trim())} COLLATE NOCASE`);
    }
    const typeField = optionField(filters.view, "type");
    if (filters.type?.trim() && typeField) {
      conditions.push(`${typeField} = ${bind(filters.type.trim())} COLLATE NOCASE`);
    }
    if (filters.genre?.trim()) {
      conditions.push(`EXISTS (
        SELECT 1 FROM item_genre_tags filter_genre
        WHERE filter_genre.item_id = i.id
          AND filter_genre.genre_tag = ${bind(filters.genre.trim())} COLLATE NOCASE
      )`);
    }
    const from = `${summarySelect()} WHERE ${conditions.join(" AND ")}`;
    const countRows = await database.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM (${from}) filtered_items`,
      values,
    );
    const total = Number(countRows[0]?.count ?? 0);
    const limit = bind(pageSize);
    const offset = bind((page - 1) * pageSize);
    const rows = await database.select<ItemSummaryRow[]>(
      `${from} ORDER BY i.name COLLATE NOCASE, i.id LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: rows.map(mapSummary),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listOptions(filters: ItemLibraryFilters): Promise<ItemLibraryOptions> {
    const database = await this.databaseProvider();
    const condition = viewCondition(filters.view, filters.includeImprovised);
    const base = `FROM items i
      LEFT JOIN item_weapon_profiles weapon ON weapon.item_id = i.id
      LEFT JOIN item_armor_profiles armor ON armor.item_id = i.id
      WHERE ${condition}`;
    const valuesFor = async (field: string | null) => {
      if (!field) return [];
      const rows = await database.select<ValueRow[]>(
        `SELECT DISTINCT ${field} AS value ${base}
         AND length(trim(${field})) > 0 ORDER BY value COLLATE NOCASE LIMIT 500`,
      );
      return rows.map(({ value }) => value);
    };
    const [categories, subtypes, types, genres] = await Promise.all([
      valuesFor(optionField(filters.view, "category")),
      valuesFor(optionField(filters.view, "subtype")),
      valuesFor(optionField(filters.view, "type")),
      database.select<ValueRow[]>(
        `SELECT DISTINCT genre.genre_tag AS value
         FROM item_genre_tags genre JOIN items i ON i.id = genre.item_id
         LEFT JOIN item_weapon_profiles weapon ON weapon.item_id = i.id
         LEFT JOIN item_armor_profiles armor ON armor.item_id = i.id
         WHERE ${condition}
         ORDER BY value COLLATE NOCASE LIMIT 500`,
      ).then((rows) => rows.map(({ value }) => value)),
    ]);
    return { categories, subtypes, types, genres };
  }

  async getItemAggregate(id: number): Promise<ItemAggregate | null> {
    const database = await this.databaseProvider();
    const items = await database.select<ItemRow[]>(
      `SELECT id, name, catalog_scope, timeline_tag, cost_credits, category,
         subtype, weight, effect_description, narrative_variant_notes,
         created_by_user_id, source_system, source_external_id, created_at, updated_at
       FROM items WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!items[0]) return null;
    const [genres, weapons, armor] = await Promise.all([
      database.select<GenreRow[]>(
        `SELECT genre_tag FROM item_genre_tags WHERE item_id = $1 ORDER BY sort_order, id`,
        [id],
      ),
      database.select<WeaponProfileRow[]>(
        `SELECT id, item_id, weapon_role, weapon_category, handedness,
           damage_type, range_type, range_text, damage, weapon_effect_description,
           weapon_narrative_notes, source_system, source_external_id, created_at, updated_at
         FROM item_weapon_profiles WHERE item_id = $1 LIMIT 1`,
        [id],
      ),
      database.select<ArmorProfileRow[]>(
        `SELECT id, item_id, area_covered, soak, armor_category, armor_type,
           encumbrance_penalty, armor_effect_description, armor_narrative_notes,
           source_system, source_external_id, created_at, updated_at
         FROM item_armor_profiles WHERE item_id = $1 LIMIT 1`,
        [id],
      ),
    ]);
    return {
      item: mapItem(items[0]),
      genreTags: genres.map(({ genre_tag }) => genre_tag),
      weaponProfile: weapons[0] ? mapWeapon(weapons[0]) : null,
      armorProfile: armor[0] ? mapArmor(armor[0]) : null,
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
