import { itemRepository, type ItemRepository } from "../data/repositories/itemRepository";
import type { ItemAggregate, ItemLibraryFilters, ItemLibraryOptions, ItemLibraryPage, SaveItemAggregate } from "../types/item";

export class ItemValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ItemValidationError"; }
}

function cleanOptional(value: string | null): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function nullableFinite(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new ItemValidationError(`${label} must be a number or left unknown.`);
  return value;
}

function validateSourcePair(sourceSystem: string | null, sourceExternalId: string | null, label: string) {
  if ((sourceSystem === null) !== (sourceExternalId === null)) throw new ItemValidationError(`${label} source system and external identity must be supplied together.`);
}

export function normalizeItem(input: SaveItemAggregate): SaveItemAggregate {
  const name = input.core.name.trim();
  const catalogSection = input.core.catalogSection.trim();
  if (!name) throw new ItemValidationError("Item name is required.");
  if (!catalogSection) throw new ItemValidationError("Catalog Section is required.");
  const sourceSystem = cleanOptional(input.core.sourceSystem);
  const sourceExternalId = cleanOptional(input.core.sourceExternalId);
  validateSourcePair(sourceSystem, sourceExternalId, "Item");
  const genreTags: string[] = [];
  const seen = new Set<string>();
  for (const source of input.genreTags) {
    const tag = source.trim(); const key = tag.toLocaleLowerCase();
    if (tag && !seen.has(key)) { seen.add(key); genreTags.push(tag); }
  }
  const aliases: SaveItemAggregate["aliases"] = [];
  const seenAliases = new Set<string>();
  for (const source of input.aliases ?? []) {
    const alias = source.alias.trim(); const key = alias.toLocaleLowerCase();
    if (alias && key !== name.toLocaleLowerCase() && !seenAliases.has(key)) {
      seenAliases.add(key);
      aliases.push({ alias, notes: source.notes.trim(), sourceReference: source.sourceReference.trim() });
    }
  }
  const weaponProfile = input.weaponProfile ? {
    ...input.weaponProfile,
    weaponRole: input.weaponProfile.weaponRole.trim(), weaponCategory: input.weaponProfile.weaponCategory.trim(),
    handedness: input.weaponProfile.handedness.trim(), damageType: input.weaponProfile.damageType.trim(),
    rangeType: input.weaponProfile.rangeType.trim(), rangeText: input.weaponProfile.rangeText.trim(),
    damage: nullableFinite(input.weaponProfile.damage, "Damage"),
    weaponEffectDescription: input.weaponProfile.weaponEffectDescription.trim(),
    weaponNarrativeNotes: input.weaponProfile.weaponNarrativeNotes.trim(),
    sourceSystem: cleanOptional(input.weaponProfile.sourceSystem), sourceExternalId: cleanOptional(input.weaponProfile.sourceExternalId),
  } : null;
  if (weaponProfile && !weaponProfile.weaponRole) throw new ItemValidationError("Weapon Role is required for a Weapon Profile.");
  if (weaponProfile) validateSourcePair(weaponProfile.sourceSystem, weaponProfile.sourceExternalId, "Weapon Profile");
  const armorProfile = input.armorProfile ? {
    ...input.armorProfile,
    areaCovered: input.armorProfile.areaCovered.trim(), soak: nullableFinite(input.armorProfile.soak, "Soak"),
    armorCategory: input.armorProfile.armorCategory.trim(), armorType: input.armorProfile.armorType.trim(),
    encumbrancePenalty: nullableFinite(input.armorProfile.encumbrancePenalty, "Encumbrance Penalty"),
    armorEffectDescription: input.armorProfile.armorEffectDescription.trim(), armorNarrativeNotes: input.armorProfile.armorNarrativeNotes.trim(),
    sourceSystem: cleanOptional(input.armorProfile.sourceSystem), sourceExternalId: cleanOptional(input.armorProfile.sourceExternalId),
  } : null;
  if (armorProfile) validateSourcePair(armorProfile.sourceSystem, armorProfile.sourceExternalId, "Armor Profile");
  return {
    id: input.id,
    core: {
      ...input.core, name, catalogSection, timelineTag: input.core.timelineTag.trim(),
      costCredits: nullableFinite(input.core.costCredits, "Cost"), category: input.core.category.trim(),
      subtype: input.core.subtype.trim(), weight: nullableFinite(input.core.weight, "Weight"),
      effectDescription: input.core.effectDescription.trim(), narrativeVariantNotes: input.core.narrativeVariantNotes.trim(),
      sourceSystem, sourceExternalId,
    },
    genreTags, aliases, weaponProfile, armorProfile,
  };
}

export class ItemService {
  constructor(private readonly repository: ItemRepository = itemRepository) {}
  listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage> { return this.repository.listItems(filters); }
  listOptions(filters: ItemLibraryFilters): Promise<ItemLibraryOptions> { return this.repository.listOptions(filters); }
  getItem(id: number): Promise<ItemAggregate | null> { return this.repository.getItemAggregate(id); }
  async saveItem(input: SaveItemAggregate): Promise<ItemAggregate> { return this.repository.saveItemAggregate(normalizeItem(input)); }
  deleteItem(id: number): Promise<void> { return this.repository.deleteItem(id); }
}

export const itemService = new ItemService();
