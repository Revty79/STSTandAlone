import { describe, expect, it } from "vitest";
import type { SaveItemAggregate } from "../types/item";
import { ItemValidationError, normalizeItem } from "./itemService";

function draft(): SaveItemAggregate {
  return {
    core: {
      name: " Field Tool ", catalogSection: " Equipment ", timelineTag: " Modern ",
      costCredits: 0, category: " Tool ", subtype: " Utility ", weight: null,
      effectDescription: " Useful ", narrativeVariantNotes: " Notes ", createdByUserId: 1,
      sourceSystem: null, sourceExternalId: null,
    },
    genreTags: [" Modern ", "modern", " Fantasy "],
    weaponProfile: {
      weaponRole: " Improvised ", weaponCategory: " Tool ", handedness: " 2h ",
      damageType: " Bludgeoning ", rangeType: " Melee ", rangeText: " Reach ",
      damage: 0, weaponEffectDescription: " Bash ", weaponNarrativeNotes: " ",
      sourceSystem: null, sourceExternalId: null,
    },
    armorProfile: {
      areaCovered: " Body ", soak: null, armorCategory: " Shield ", armorType: " Heavy ",
      encumbrancePenalty: 0, armorEffectDescription: " Guard ", armorNarrativeNotes: " ",
      sourceSystem: null, sourceExternalId: null,
    },
  };
}

describe("Item rules", () => {
  it("normalizes an Item with both optional profiles and preserves NULL versus zero", () => {
    const result = normalizeItem(draft());
    expect(result.core).toMatchObject({ name: "Field Tool", catalogSection: "Equipment", costCredits: 0, weight: null });
    expect(result.genreTags).toEqual(["Modern", "Fantasy"]);
    expect(result.weaponProfile).toMatchObject({ weaponRole: "Improvised", damage: 0 });
    expect(result.armorProfile).toMatchObject({ soak: null, encumbrancePenalty: 0 });
  });

  it("rejects missing identity, non-finite numbers, and partial source identities", () => {
    const unnamed = draft(); unnamed.core.name = " ";
    expect(() => normalizeItem(unnamed)).toThrow(ItemValidationError);
    const invalidNumber = draft(); invalidNumber.weaponProfile!.damage = Number.NaN;
    expect(() => normalizeItem(invalidNumber)).toThrow(/Damage must be a number/i);
    const source = draft(); source.core.sourceSystem = "catalog";
    expect(() => normalizeItem(source)).toThrow(/supplied together/i);
  });
});
