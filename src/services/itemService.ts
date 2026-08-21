import {
  itemRepository,
  type ItemRepository,
} from "../data/repositories/itemRepository";
import type {
  ItemAggregate,
  ItemLibraryFilters,
  ItemLibraryOptions,
  ItemLibraryPage,
  SaveItemAggregate,
} from "../types/item";

export class ItemValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemValidationError";
  }
}

function cleanOptional(value: string | null): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function finite(value: number, label: string, allowNegative = false): number {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    throw new ItemValidationError(
      `${label} must be a ${allowNegative ? "finite" : "non-negative"} number.`,
    );
  }
  return value;
}

export function normalizeItem(input: SaveItemAggregate): SaveItemAggregate {
  const name = input.core.name.trim();
  const catalogScope = input.core.catalogScope.trim();
  if (!name) throw new ItemValidationError("Item name is required.");
  if (!catalogScope) throw new ItemValidationError("Catalog Scope is required.");

  const genreTags: string[] = [];
  const genreKeys = new Set<string>();
  for (const sourceTag of input.genreTags) {
    const tag = sourceTag.trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (!genreKeys.has(key)) {
      genreKeys.add(key);
      genreTags.push(tag);
    }
  }

  const sourceSystem = cleanOptional(input.core.sourceSystem);
  const sourceExternalId = cleanOptional(input.core.sourceExternalId);
  if ((sourceSystem === null) !== (sourceExternalId === null)) {
    throw new ItemValidationError(
      "Canonical source system and external identity must be supplied together.",
    );
  }

  const weaponProfile = input.weaponProfile
    ? {
        ...input.weaponProfile,
        weaponRole: input.weaponProfile.weaponRole.trim(),
        weaponCategory: input.weaponProfile.weaponCategory.trim(),
        handedness: input.weaponProfile.handedness.trim(),
        damageType: input.weaponProfile.damageType.trim(),
        rangeType: input.weaponProfile.rangeType.trim(),
        rangeText: input.weaponProfile.rangeText.trim(),
        damage: finite(input.weaponProfile.damage, "Damage"),
        weaponEffectDescription:
          input.weaponProfile.weaponEffectDescription.trim(),
        weaponNarrativeNotes: input.weaponProfile.weaponNarrativeNotes.trim(),
        sourceSystem: cleanOptional(input.weaponProfile.sourceSystem),
        sourceExternalId: cleanOptional(input.weaponProfile.sourceExternalId),
      }
    : null;
  if (weaponProfile && !weaponProfile.weaponRole) {
    throw new ItemValidationError("Weapon Role is required for a Weapon Profile.");
  }
  if (
    weaponProfile &&
    (weaponProfile.sourceSystem === null) !==
      (weaponProfile.sourceExternalId === null)
  ) {
    throw new ItemValidationError(
      "Weapon Profile source system and external identity must be supplied together.",
    );
  }

  const armorProfile = input.armorProfile
    ? {
        ...input.armorProfile,
        areaCovered: input.armorProfile.areaCovered.trim(),
        soak: finite(input.armorProfile.soak, "Soak"),
        armorCategory: input.armorProfile.armorCategory.trim(),
        armorType: input.armorProfile.armorType.trim(),
        encumbrancePenalty: finite(
          input.armorProfile.encumbrancePenalty,
          "Encumbrance Penalty",
          true,
        ),
        armorEffectDescription:
          input.armorProfile.armorEffectDescription.trim(),
        armorNarrativeNotes: input.armorProfile.armorNarrativeNotes.trim(),
        sourceSystem: cleanOptional(input.armorProfile.sourceSystem),
        sourceExternalId: cleanOptional(input.armorProfile.sourceExternalId),
      }
    : null;
  if (
    armorProfile &&
    (armorProfile.sourceSystem === null) !==
      (armorProfile.sourceExternalId === null)
  ) {
    throw new ItemValidationError(
      "Armor Profile source system and external identity must be supplied together.",
    );
  }

  return {
    id: input.id,
    core: {
      ...input.core,
      name,
      catalogScope,
      timelineTag: input.core.timelineTag.trim(),
      costCredits: finite(input.core.costCredits, "Cost"),
      category: input.core.category.trim(),
      subtype: input.core.subtype.trim(),
      weight: finite(input.core.weight, "Weight"),
      effectDescription: input.core.effectDescription.trim(),
      narrativeVariantNotes: input.core.narrativeVariantNotes.trim(),
      sourceSystem,
      sourceExternalId,
    },
    genreTags,
    weaponProfile,
    armorProfile,
  };
}

export class ItemService {
  constructor(private readonly repository: ItemRepository = itemRepository) {}

  listItems(filters: ItemLibraryFilters): Promise<ItemLibraryPage> {
    return this.repository.listItems(filters);
  }

  listOptions(filters: ItemLibraryFilters): Promise<ItemLibraryOptions> {
    return this.repository.listOptions(filters);
  }

  getItem(id: number): Promise<ItemAggregate | null> {
    return this.repository.getItemAggregate(id);
  }

  async saveItem(input: SaveItemAggregate): Promise<ItemAggregate> {
    return this.repository.saveItemAggregate(normalizeItem(input));
  }

  deleteItem(id: number): Promise<void> {
    return this.repository.deleteItem(id);
  }
}

export const itemService = new ItemService();
