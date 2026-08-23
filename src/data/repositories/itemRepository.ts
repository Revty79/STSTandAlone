import { creatureRepository } from "./creatureRepository";
import { TEMPORARY_ITEM_CATALOG, TEMPORARY_ITEM_TAGS } from "../temporaryItemCatalog";
import type {
  ItemAggregate,
  ItemAuthoringReferences,
  ItemLibraryFacets,
  ItemLibraryFilters,
  ItemLibraryPage,
  ItemSummary,
  RelatedCreatureCandidate,
  RelatedItemCandidate,
  SaveItemAggregate,
} from "../../types/item";

const COLLATOR = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uniqueSorted(values: string[]): string[] {
  const unique = new Map<string, string>();
  for (const candidate of values) {
    const value = candidate.trim();
    if (value) unique.set(value.toLocaleLowerCase("en-US"), value);
  }
  return [...unique.values()].sort(COLLATOR.compare);
}

function toSummary(item: ItemAggregate): ItemSummary {
  return {
    id: item.id,
    canonicalId: item.core.canonicalId,
    name: item.core.name,
    catalogScope: item.core.catalogScope,
    equipmentGroup: item.core.equipmentGroup,
    recordType: item.core.recordType,
    family: item.core.family,
    category: item.core.category,
    updatedAt: item.core.updatedAt,
    tags: [...item.tags],
    hasWeaponProfile: item.weaponProfile !== null,
    hasArmorProfile: item.armorProfile !== null,
  };
}

export interface ItemRepository {
  listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage>;
  listFacets(catalogScope: ItemLibraryFilters["catalogScope"]): Promise<ItemLibraryFacets>;
  listAuthoringReferences(): Promise<ItemAuthoringReferences>;
  getItemAggregate(id: number): Promise<ItemAggregate | null>;
  saveItemAggregate(input: SaveItemAggregate): Promise<ItemAggregate>;
  deleteItem(id: number): Promise<void>;
  createVariant(parentItemId: number, variantName: string, userId: number): Promise<ItemAggregate>;
  findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]>;
  findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]>;
}

type CreatureFinder = (search: string) => Promise<RelatedCreatureCandidate[]>;

async function findCanonicalCreatures(search: string): Promise<RelatedCreatureCandidate[]> {
  const page = await creatureRepository.listCreatures({ search, page: 1, pageSize: 20 });
  return page.items.map((creature) => ({
    canonicalId: creature.canonicalId,
    name: creature.canonicalName,
    family: creature.family,
    creatureType: creature.creatureType,
  }));
}

export class TemporaryItemRepository implements ItemRepository {
  private readonly records = new Map<number, ItemAggregate>();
  private nextId: number;

  constructor(
    seed: readonly ItemAggregate[] = TEMPORARY_ITEM_CATALOG,
    private readonly creatureFinder: CreatureFinder = findCanonicalCreatures,
  ) {
    for (const item of seed) this.records.set(item.id, clone(item));
    this.nextId = Math.max(0, ...this.records.keys()) + 1;
  }

  async listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage> {
    const search = filters.search?.trim().toLocaleLowerCase("en-US") ?? "";
    const recordType = filters.recordType?.trim().toLocaleLowerCase("en-US");
    const category = filters.category?.trim().toLocaleLowerCase("en-US");
    const tag = filters.tag?.trim().toLocaleLowerCase("en-US");
    const matches = [...this.records.values()]
      .filter((item) => item.core.catalogScope === filters.catalogScope)
      .filter((item) => !filters.equipmentGroup || item.core.equipmentGroup === filters.equipmentGroup)
      .filter((item) => !recordType || item.core.recordType.toLocaleLowerCase("en-US") === recordType)
      .filter((item) => !category || item.core.category.toLocaleLowerCase("en-US") === category)
      .filter((item) => !tag || item.tags.some((value) => value.toLocaleLowerCase("en-US") === tag))
      .filter((item) => {
        if (!search) return true;
        return [
          item.core.name,
          item.core.canonicalId,
          item.core.recordType,
          item.core.family,
          item.core.category,
          item.core.subtype,
        ].some((value) => value.toLocaleLowerCase("en-US").includes(search));
      })
      .map(toSummary)
      .sort((left, right) => COLLATOR.compare(left.name, right.name) || left.id - right.id);

    const page = Math.max(1, Math.trunc(filters.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize)));
    const total = matches.length;
    return {
      items: matches.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listFacets(catalogScope: ItemLibraryFilters["catalogScope"]): Promise<ItemLibraryFacets> {
    const items = [...this.records.values()].filter((item) => item.core.catalogScope === catalogScope);
    return {
      recordTypes: uniqueSorted(items.map((item) => item.core.recordType)),
      categories: uniqueSorted(items.map((item) => item.core.category)),
      tags: uniqueSorted(items.flatMap((item) => item.tags)),
    };
  }

  async listAuthoringReferences(): Promise<ItemAuthoringReferences> {
    return {
      tags: [...TEMPORARY_ITEM_TAGS],
      armorBodyLocations: [],
    };
  }

  async getItemAggregate(id: number): Promise<ItemAggregate | null> {
    const item = this.records.get(id);
    return item ? clone(item) : null;
  }

  async saveItemAggregate(input: SaveItemAggregate): Promise<ItemAggregate> {
    const now = new Date().toISOString();
    const id = input.id ?? this.nextId++;
    const existing = this.records.get(id);
    const canonicalId = existing?.core.canonicalId
      ?? `DEMO-${input.core.catalogScope === "equipment" ? "EQ" : "INV"}-${String(id).padStart(3, "0")}`;
    const saved: ItemAggregate = {
      ...clone(input),
      id,
      core: {
        ...clone(input.core),
        id,
        canonicalId,
        createdAt: existing?.core.createdAt ?? now,
        updatedAt: now,
      },
    };
    this.records.set(id, saved);

    if (saved.core.parentItemId) {
      const parent = this.records.get(saved.core.parentItemId);
      if (parent) {
        const summary = {
          id: saved.id,
          canonicalId: saved.core.canonicalId,
          name: saved.core.name,
          catalogScope: saved.core.catalogScope,
        };
        parent.variants = [...parent.variants.filter((variant) => variant.id !== saved.id), summary]
          .sort((left, right) => COLLATOR.compare(left.name, right.name));
      }
    }
    return clone(saved);
  }

  async deleteItem(id: number): Promise<void> {
    const item = this.records.get(id);
    if (!item) return;
    if ([...this.records.values()].some((candidate) => candidate.core.parentItemId === id)) {
      throw new Error("This Item cannot be deleted while Variants still link to it.");
    }
    this.records.delete(id);
    if (item.core.parentItemId) {
      const parent = this.records.get(item.core.parentItemId);
      if (parent) parent.variants = parent.variants.filter((variant) => variant.id !== id);
    }
  }

  async createVariant(parentItemId: number, variantName: string, userId: number): Promise<ItemAggregate> {
    const parent = this.records.get(parentItemId);
    if (!parent) throw new Error("The parent Item could not be found.");
    const id = this.nextId++;
    const now = new Date().toISOString();
    const saved: ItemAggregate = {
      ...clone(parent),
      id,
      core: {
        ...clone(parent.core),
        id,
        canonicalId: `DEMO-VAR-${String(id).padStart(3, "0")}`,
        name: variantName,
        parentItemId,
        parentItemName: parent.core.name,
        createdByUserId: userId,
        sourceSystem: "temporary-item-authoring-demo",
        createdAt: now,
        updatedAt: now,
      },
      variants: [],
    };
    this.records.set(id, saved);
    parent.variants = [...parent.variants, {
      id,
      canonicalId: saved.core.canonicalId,
      name: saved.core.name,
      catalogScope: saved.core.catalogScope,
    }].sort((left, right) => COLLATOR.compare(left.name, right.name));
    return clone(saved);
  }

  async findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]> {
    const query = search.trim().toLocaleLowerCase("en-US");
    if (!query) return [];
    return [...this.records.values()]
      .filter((item) => item.id !== excludeItemId)
      .filter((item) => `${item.core.name} ${item.core.canonicalId}`.toLocaleLowerCase("en-US").includes(query))
      .sort((left, right) => COLLATOR.compare(left.core.name, right.core.name))
      .slice(0, 20)
      .map((item) => ({ id: item.id, canonicalId: item.core.canonicalId, name: item.core.name, recordType: item.core.recordType }));
  }

  findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]> {
    return this.creatureFinder(search.trim());
  }
}

export const itemRepository: ItemRepository = new TemporaryItemRepository();
