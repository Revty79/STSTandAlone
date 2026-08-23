import { itemRepository, type ItemRepository } from "../data/repositories/itemRepository";
import type {
  ItemAggregate,
  ItemAuthoringReferences,
  ItemArmorProfileDraft,
  ItemLibraryFacets,
  ItemLibraryFilters,
  ItemLibraryPage,
  ItemPropertyDraft,
  ItemWeaponProfileDraft,
  RelatedCreatureCandidate,
  RelatedItemCandidate,
  SaveItemAggregate,
} from "../types/item";

export class ItemValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemValidationError";
  }
}

const clean = (value: string): string => value.trim();
const optionalText = (value: string | null): string | null => value?.trim() || null;

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new ItemValidationError(`${label} is required.`);
  return result;
}

function nonNegative(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new ItemValidationError(`${label} must be zero or greater, or left blank.`);
  return value;
}

function positive(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new ItemValidationError(`${label} must be greater than zero, or left blank.`);
  return value;
}

function normalizeProperty(row: ItemPropertyDraft, sortOrder: number): ItemPropertyDraft {
  const relatedItemId = row.relatedItemId;
  const relatedCreatureCanonicalId = optionalText(row.relatedCreatureCanonicalId);
  if (relatedItemId && relatedCreatureCanonicalId) {
    throw new ItemValidationError(`Property ${sortOrder + 1} cannot link both an Item and a Creature.`);
  }
  return {
    propertyName: required(row.propertyName, `Property ${sortOrder + 1} Name`),
    value: clean(row.value),
    unit: clean(row.unit),
    quantity: positive(row.quantity, `Property ${sortOrder + 1} Quantity`),
    relationKind: row.relationKind,
    relatedItemId: row.relationKind === "item" ? relatedItemId : null,
    relatedItemName: row.relationKind === "item" && relatedItemId ? optionalText(row.relatedItemName) : null,
    relatedCreatureCanonicalId: row.relationKind === "creature" ? relatedCreatureCanonicalId : null,
    relatedCreatureName: row.relationKind === "creature" && relatedCreatureCanonicalId ? optionalText(row.relatedCreatureName) : null,
    notes: clean(row.notes),
    sortOrder,
  };
}

function normalizeWeapon(profile: ItemWeaponProfileDraft | null): ItemWeaponProfileDraft | null {
  if (!profile) return null;
  return {
    weaponType: clean(profile.weaponType),
    handedness: clean(profile.handedness),
    damageSource: clean(profile.damageSource),
    damage: clean(profile.damage),
    damageType: clean(profile.damageType),
    range: clean(profile.range),
    reach: clean(profile.reach),
    ammunitionItemId: profile.ammunitionItemId,
    ammunitionItemName: profile.ammunitionItemId ? optionalText(profile.ammunitionItemName) : null,
    compatibility: clean(profile.compatibility),
    capacity: nonNegative(profile.capacity, "Weapon Capacity"),
    fireModes: [...new Set(profile.fireModes.map(clean).filter(Boolean))],
    rateOfFire: clean(profile.rateOfFire),
    reloadInitiative: nonNegative(profile.reloadInitiative, "Reload Initiative"),
    rulesText: clean(profile.rulesText),
  };
}

function normalizeArmor(profile: ItemArmorProfileDraft | null): ItemArmorProfileDraft | null {
  if (!profile) return null;
  return {
    armorType: clean(profile.armorType),
    coverage: clean(profile.coverage),
    baseSoak: nonNegative(profile.baseSoak, "Base Soak"),
    damageModifiers: profile.damageModifiers.map((row, sortOrder) => ({
      damageType: required(row.damageType, `Damage Modifier ${sortOrder + 1} Type`),
      modifier: required(row.modifier, `Damage Modifier ${sortOrder + 1} Value`),
      notes: clean(row.notes),
      sortOrder,
    })),
    coveredBodyLocationKeys: [...new Set(profile.coveredBodyLocationKeys.map(clean).filter(Boolean))],
    rulesText: clean(profile.rulesText),
  };
}

export function normalizeItemAggregate(input: SaveItemAggregate): SaveItemAggregate {
  const equipmentGroup = input.core.catalogScope === "equipment"
    ? input.core.equipmentGroup ?? "general"
    : null;
  return {
    id: input.id,
    core: {
      ...input.core,
      canonicalId: required(input.core.canonicalId, "Item ID"),
      name: required(input.core.name, "Item Name"),
      equipmentGroup,
      recordType: required(input.core.recordType, "Record Type"),
      family: clean(input.core.family),
      category: clean(input.core.category),
      subtype: clean(input.core.subtype),
      description: clean(input.core.description),
      weight: nonNegative(input.core.weight, "Weight"),
      weightUnit: clean(input.core.weightUnit),
      size: clean(input.core.size),
      durability: nonNegative(input.core.durability, "Durability"),
      credits: nonNegative(input.core.credits, "Credits"),
      priceBasis: clean(input.core.priceBasis),
      parentItemName: optionalText(input.core.parentItemName),
      sourceSystem: optionalText(input.core.sourceSystem),
    },
    properties: input.properties.map(normalizeProperty),
    weaponProfile: normalizeWeapon(input.weaponProfile),
    armorProfile: normalizeArmor(input.armorProfile),
    tags: [...new Set(input.tags.map(clean).filter(Boolean))],
    variants: input.variants,
  };
}

export class ItemService {
  constructor(private readonly repository: ItemRepository = itemRepository) {}

  listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage> {
    return this.repository.listItems(filters);
  }

  listFacets(catalogScope: ItemLibraryFilters["catalogScope"]): Promise<ItemLibraryFacets> {
    return this.repository.listFacets(catalogScope);
  }

  listAuthoringReferences(): Promise<ItemAuthoringReferences> {
    return this.repository.listAuthoringReferences();
  }

  getItem(id: number): Promise<ItemAggregate | null> {
    return this.repository.getItemAggregate(id);
  }

  async saveItem(input: SaveItemAggregate): Promise<ItemAggregate> {
    return this.repository.saveItemAggregate(normalizeItemAggregate(input));
  }

  createVariant(parentItemId: number, variantName: string, userId: number): Promise<ItemAggregate> {
    return this.repository.createVariant(parentItemId, required(variantName, "Variant Name"), userId);
  }

  deleteItem(id: number): Promise<void> {
    return this.repository.deleteItem(id);
  }

  findRelatedItems(search: string, excludeItemId?: number): Promise<RelatedItemCandidate[]> {
    return this.repository.findRelatedItems(search, excludeItemId);
  }

  findRelatedCreatures(search: string): Promise<RelatedCreatureCandidate[]> {
    return this.repository.findRelatedCreatures(search);
  }
}

export const itemService = new ItemService();
