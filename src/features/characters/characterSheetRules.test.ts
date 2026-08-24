import { describe, expect, it } from "vitest";
import type { CharacterAuthorizedItem } from "../../types/character";
import { getCharacterWeaponDamageSummary } from "./characterSheetRules";

function weapon(overrides: Partial<CharacterAuthorizedItem>): CharacterAuthorizedItem {
  return {
    id: 1,
    canonicalId: "ITEM-TEST",
    name: "Test Weapon",
    catalogScope: "Equipment",
    equipmentGroup: "weapon",
    recordType: "Weapon",
    category: "Weapon",
    credits: 1,
    priceBasis: "Each",
    description: "",
    weight: null,
    weightUnit: "",
    size: "Medium",
    durability: null,
    weaponType: "Sword",
    handedness: "One-Handed",
    damage: "8",
    damageType: "Slashing",
    rangeText: null,
    reachText: "5 ft",
    weaponRulesText: null,
    armorType: null,
    coverage: null,
    baseSoak: null,
    armorDamageModifiers: null,
    armorRulesText: null,
    ...overrides,
  };
}

const attributes = { STR: 40, DEX: 30, CON: 25, INT: 25, WIS: 25, CHR: 25 };

describe("character-sheet weapon damage", () => {
  it("uses Strength for a melee weapon and includes it in total damage", () => {
    expect(getCharacterWeaponDamageSummary(weapon({}), attributes)).toEqual({
      modifier: "STR +3",
      totalDamage: "11",
    });
  });

  it("uses Dexterity for a ranged weapon", () => {
    expect(getCharacterWeaponDamageSummary(weapon({ weaponType: "Bow", rangeText: "120 ft", reachText: null }), attributes)).toEqual({
      modifier: "DEX +1",
      totalDamage: "9",
    });
  });

  it("shows both uses when a weapon has melee reach and a ranged use", () => {
    expect(getCharacterWeaponDamageSummary(weapon({ weaponType: "Axe", rangeText: "15 ft" }), attributes)).toEqual({
      modifier: "STR +3 / DEX +1",
      totalDamage: "M 11 / R 9",
    });
  });
});
