import { invoke } from "@tauri-apps/api/core";
import type {
  ItemAggregate,
  ItemAuthoringReferences,
  ItemCatalogScope,
  ItemCore,
  ItemDamageModifierDraft,
  ItemLibraryFacets,
  ItemLibraryFilters,
  ItemLibraryPage,
  ItemSummary,
  RelatedCreatureCandidate,
  RelatedItemCandidate,
  SaveItemAggregate,
} from "../../types/item";
import { getDatabase } from "../database";

type ExecuteResult = { rowsAffected: number; lastInsertId?: number };
export interface ItemDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<ExecuteResult>;
}

type CountRow = { count: number | string };
type TextRow = { value: string };
type ItemSummaryRow = Omit<ItemSummary, "tags" | "hasWeaponProfile" | "hasArmorProfile"> & {
  tagsText: string;
  hasWeaponProfile: number;
  hasArmorProfile: number;
};

const COLLATOR = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

function uniqueSorted(rows: TextRow[]): string[] {
  const values = new Map<string, string>();
  for (const row of rows) {
    const value = row.value.trim();
    if (value) values.set(value.toLocaleLowerCase("en-US"), value);
  }
  return [...values.values()].sort(COLLATOR.compare);
}

function parseTags(value: string): string[] {
  return value ? value.split("\u001f").filter(Boolean) : [];
}

function parseFireModes(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) throw new Error("invalid array");
    return parsed;
  } catch {
    throw new Error("A stored Weapon Profile has invalid Fire Modes data.");
  }
}

export interface ItemRepository {
  listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage>;
  listFacets(catalogScope: ItemCatalogScope): Promise<ItemLibraryFacets>;
  listAuthoringReferences(): Promise<ItemAuthoringReferences>;
  getItemAggregate(id: number): Promise<ItemAggregate | null>;
  saveItemAggregate(input: SaveItemAggregate): Promise<ItemAggregate>;
  deleteItem(id: number): Promise<void>;
  createVariant(parentItemId: number, variantName: string, userId: number): Promise<ItemAggregate>;
  findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]>;
  findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]>;
}

export class TauriItemRepository implements ItemRepository {
  constructor(
    private readonly databaseProvider: () => Promise<ItemDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveItemAggregate) => Promise<number> =
      (input) => invoke<number>("save_item_aggregate", { input }),
    private readonly cloneInvoker: (parentItemId: number, variantName: string, userId: number) => Promise<number> =
      (parentItemId, variantName, userId) => invoke<number>("clone_item_as_variant", { parentItemId, variantName, userId }),
  ) {}

  async listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage> {
    const database = await this.databaseProvider();
    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const conditions = [`item.catalog_scope = ${bind(filters.catalogScope)}`];
    if (filters.search?.trim()) {
      const search = bind(filters.search.trim());
      conditions.push(`(instr(lower(item.name), lower(${search})) > 0 OR instr(lower(item.canonical_id), lower(${search})) > 0)`);
    }
    if (filters.equipmentGroup) conditions.push(`item.equipment_group = ${bind(filters.equipmentGroup)}`);
    if (filters.recordType?.trim()) conditions.push(`item.record_type = ${bind(filters.recordType.trim())} COLLATE NOCASE`);
    if (filters.category?.trim()) conditions.push(`item.category = ${bind(filters.category.trim())} COLLATE NOCASE`);
    if (filters.tag?.trim()) {
      conditions.push(`EXISTS (
        SELECT 1 FROM item_tag_links link JOIN item_tags_catalog tag ON tag.id = link.tag_id
        WHERE link.item_id = item.id AND tag.name = ${bind(filters.tag.trim())} COLLATE NOCASE
      )`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const countRows = await database.select<CountRow[]>(`SELECT COUNT(*) AS count FROM items item ${where}`, values);
    const total = Number(countRows[0]?.count ?? 0);
    const limit = bind(pageSize);
    const offset = bind((page - 1) * pageSize);
    const rows = await database.select<ItemSummaryRow[]>(
      `SELECT item.id, item.canonical_id AS canonicalId, item.name,
         item.catalog_scope AS catalogScope, item.equipment_group AS equipmentGroup,
         item.record_type AS recordType, item.family, item.category, item.updated_at AS updatedAt,
         COALESCE((SELECT group_concat(tag_name, char(31)) FROM (
           SELECT tag.name AS tag_name FROM item_tag_links link JOIN item_tags_catalog tag ON tag.id = link.tag_id
           WHERE link.item_id = item.id ORDER BY tag.name COLLATE NOCASE
         )), '') AS tagsText,
         EXISTS(SELECT 1 FROM weapon_profiles profile WHERE profile.item_id = item.id) AS hasWeaponProfile,
         EXISTS(SELECT 1 FROM armor_profiles profile WHERE profile.item_id = item.id) AS hasArmorProfile
       FROM items item ${where}
       ORDER BY item.name COLLATE NOCASE, item.id LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      items: rows.map(({ tagsText, ...row }) => ({ ...row, tags: parseTags(tagsText), hasWeaponProfile: Boolean(row.hasWeaponProfile), hasArmorProfile: Boolean(row.hasArmorProfile) })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listFacets(catalogScope: ItemCatalogScope): Promise<ItemLibraryFacets> {
    const database = await this.databaseProvider();
    const [recordTypes, categories, tags] = await Promise.all([
      database.select<TextRow[]>("SELECT DISTINCT trim(record_type) AS value FROM items WHERE catalog_scope=$1 AND length(trim(record_type))>0", [catalogScope]),
      database.select<TextRow[]>("SELECT DISTINCT trim(category) AS value FROM items WHERE catalog_scope=$1 AND length(trim(category))>0", [catalogScope]),
      database.select<TextRow[]>(`SELECT DISTINCT tag.name AS value FROM item_tags_catalog tag
        JOIN item_tag_links link ON link.tag_id=tag.id JOIN items item ON item.id=link.item_id
        WHERE item.catalog_scope=$1`, [catalogScope]),
    ]);
    return { recordTypes: uniqueSorted(recordTypes), categories: uniqueSorted(categories), tags: uniqueSorted(tags) };
  }

  async listAuthoringReferences(): Promise<ItemAuthoringReferences> {
    const database = await this.databaseProvider();
    const [tags, armorBodyLocations] = await Promise.all([
      database.select<Array<{ name: string }>>("SELECT name FROM item_tags_catalog ORDER BY name COLLATE NOCASE, id"),
      database.select<Array<{ key: string; label: string }>>("SELECT location_code AS key, location_name AS label FROM armor_location_reference ORDER BY sort_order, location_code"),
    ]);
    return { tags: tags.map((row) => row.name), armorBodyLocations };
  }

  async getItemAggregate(id: number): Promise<ItemAggregate | null> {
    const database = await this.databaseProvider();
    const cores = await database.select<ItemCore[]>(
      `SELECT item.id, item.canonical_id AS canonicalId, item.name,
         item.catalog_scope AS catalogScope, item.equipment_group AS equipmentGroup,
         item.record_type AS recordType, item.family, item.category, item.subtype,
         item.description, item.weight, item.weight_unit AS weightUnit, item.size,
         item.durability, item.credits, item.price_basis AS priceBasis,
         item.parent_item_id AS parentItemId, parent.name AS parentItemName,
         item.created_by_user_id AS createdByUserId, item.source_system AS sourceSystem,
         item.created_at AS createdAt, item.updated_at AS updatedAt
       FROM items item LEFT JOIN items parent ON parent.id=item.parent_item_id
       WHERE item.id=$1 LIMIT 1`, [id],
    );
    const core = cores[0];
    if (!core) return null;
    const [properties, weaponRows, armorRows, damageModifiers, coveredLocations, tagRows, variants] = await Promise.all([
      database.select<ItemAggregate["properties"]>(`SELECT property.property_name AS propertyName, property.value, property.unit,
        property.quantity, CASE WHEN property.related_item_id IS NOT NULL THEN 'item' WHEN property.related_creature_canonical_id IS NOT NULL THEN 'creature' ELSE 'none' END AS relationKind,
        property.related_item_id AS relatedItemId, related_item.name AS relatedItemName,
        property.related_creature_canonical_id AS relatedCreatureCanonicalId, creature.canonical_name AS relatedCreatureName,
        property.notes, property.sort_order AS sortOrder
        FROM item_properties property LEFT JOIN items related_item ON related_item.id=property.related_item_id
        LEFT JOIN creatures creature ON creature.canonical_id=property.related_creature_canonical_id COLLATE NOCASE
        WHERE property.item_id=$1 ORDER BY property.sort_order, property.id`, [id]),
      database.select<Array<Omit<NonNullable<ItemAggregate["weaponProfile"]>, "fireModes"> & { fireModesJson: string }>>(`SELECT profile.profile_record_type AS profileRecordType,
        profile.weapon_type AS weaponType, profile.handedness, profile.damage_source AS damageSource,
        profile.damage, profile.damage_type AS damageType, profile.range_text AS range,
        profile.reach_text AS reach, profile.ammunition_item_id AS ammunitionItemId,
        ammunition.name AS ammunitionItemName, profile.compatibility, profile.capacity,
        profile.fire_modes AS fireModesJson, profile.rate_of_fire AS rateOfFire,
        profile.reload_initiative AS reloadInitiative, profile.rules_text AS rulesText
        FROM weapon_profiles profile LEFT JOIN items ammunition ON ammunition.id=profile.ammunition_item_id
        WHERE profile.item_id=$1 LIMIT 1`, [id]),
      database.select<Array<{ armorType: string; coverage: string; baseSoak: number | null; damageModifiersSourceText: string; rulesText: string }>>(`SELECT armor_type AS armorType, coverage, base_soak AS baseSoak,
        damage_modifiers_source_text AS damageModifiersSourceText, rules_text AS rulesText
        FROM armor_profiles WHERE item_id=$1 LIMIT 1`, [id]),
      database.select<ItemDamageModifierDraft[]>("SELECT modifier_text AS modifierText, damage_type AS damageType, modifier, notes, sort_order AS sortOrder FROM item_armor_damage_modifiers WHERE item_id=$1 ORDER BY sort_order,id", [id]),
      database.select<Array<{ key: string }>>("SELECT location_code AS key FROM armor_locations WHERE item_id=$1 ORDER BY sort_order, location_code", [id]),
      database.select<Array<{ name: string }>>("SELECT tag.name FROM item_tag_links link JOIN item_tags_catalog tag ON tag.id=link.tag_id WHERE link.item_id=$1 ORDER BY tag.name COLLATE NOCASE, tag.id", [id]),
      database.select<ItemAggregate["variants"]>("SELECT id, canonical_id AS canonicalId, name, catalog_scope AS catalogScope FROM items WHERE parent_item_id=$1 ORDER BY name COLLATE NOCASE,id", [id]),
    ]);
    const weaponRow = weaponRows[0];
    const armorRow = armorRows[0];
    return {
      id,
      core,
      properties,
      weaponProfile: weaponRow ? { ...weaponRow, fireModes: parseFireModes(weaponRow.fireModesJson) } : null,
      armorProfile: armorRow ? { ...armorRow, damageModifiers, coveredBodyLocationKeys: coveredLocations.map((row) => row.key) } : null,
      tags: tagRows.map((row) => row.name),
      variants,
    };
  }

  async saveItemAggregate(input: SaveItemAggregate): Promise<ItemAggregate> {
    const id = await this.saveInvoker(input);
    const saved = await this.getItemAggregate(id);
    if (!saved) throw new Error("The saved Item could not be reloaded.");
    return saved;
  }

  async createVariant(parentItemId: number, variantName: string, userId: number): Promise<ItemAggregate> {
    const id = await this.cloneInvoker(parentItemId, variantName, userId);
    const saved = await this.getItemAggregate(id);
    if (!saved) throw new Error("The saved Item Variant could not be reloaded.");
    return saved;
  }

  async deleteItem(id: number): Promise<void> {
    const database = await this.databaseProvider();
    const [children, ammunitionReferences, propertyReferences] = await Promise.all([
      database.select<CountRow[]>("SELECT COUNT(*) AS count FROM items WHERE parent_item_id=$1", [id]),
      database.select<CountRow[]>("SELECT COUNT(*) AS count FROM weapon_profiles WHERE ammunition_item_id=$1", [id]),
      database.select<CountRow[]>("SELECT COUNT(*) AS count FROM item_properties WHERE related_item_id=$1", [id]),
    ]);
    if (Number(children[0]?.count ?? 0) > 0) throw new Error("This Item cannot be deleted while Variants still link to it.");
    if (Number(ammunitionReferences[0]?.count ?? 0) > 0) throw new Error("This Item cannot be deleted while Weapon Profiles use it as ammunition.");
    if (Number(propertyReferences[0]?.count ?? 0) > 0) throw new Error("This Item cannot be deleted while other Item Properties reference it.");
    await database.execute("DELETE FROM items WHERE id=$1", [id]);
  }

  async findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]> {
    const database = await this.databaseProvider();
    return database.select<RelatedItemCandidate[]>(`SELECT id, canonical_id AS canonicalId, name, record_type AS recordType FROM items
      WHERE ($1 IS NULL OR id<>$1) AND (instr(lower(name),lower($2))>0 OR instr(lower(canonical_id),lower($2))>0)
      ORDER BY name COLLATE NOCASE,id LIMIT 20`, [excludeItemId ?? null, search.trim()]);
  }

  async findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]> {
    const database = await this.databaseProvider();
    return database.select<RelatedCreatureCandidate[]>(`SELECT canonical_id AS canonicalId, canonical_name AS name, family, creature_type AS creatureType
      FROM creatures WHERE instr(lower(canonical_name),lower($1))>0 OR instr(lower(canonical_id),lower($1))>0
      ORDER BY canonical_name COLLATE NOCASE,id LIMIT 20`, [search.trim()]);
  }
}

export const itemRepository: ItemRepository = new TauriItemRepository();
