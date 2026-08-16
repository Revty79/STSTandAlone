import { describe, expect, it } from "vitest";
import { calculateCastingCircumstance } from "./engine/calculateCastingCircumstance";
import { calculatePractitioner } from "./engine/calculatePractitioner";
import { calculateSpell } from "./engine/calculateSpell";
import {
  cloneProgressiveStructure,
  diffProgressiveStructures,
  resolveProgressiveSpellForLevel,
} from "./engine/progressiveSpell";
import { validateSpell } from "./engine/validateSpell";
import { parseSpellDocument } from "./spellDocumentCodec";
import type {
  ProgressiveSpellStructure,
  SpellContainer,
  SpellDocument,
} from "./models/spell";
import {
  createContainer,
  createEmptySpell,
  createModifierSelection,
  withCalculationSnapshot,
} from "./utilities/spellFactory";

let sequence = 0;

function effect(ruleId: string, quantity = 1) {
  sequence += 1;
  return { id: `effect-${sequence}`, ruleId, quantity, description: "" };
}

function addOn(ruleId: string, quantity: number) {
  sequence += 1;
  return { id: `addon-${sequence}`, ruleId, quantity, description: "" };
}

function spellWith(...containers: SpellContainer[]): SpellDocument {
  return {
    ...createEmptySpell(),
    name: "Integration Spell",
    frameworkSkillId: 1,
    sphere: "Charm",
    containers,
  };
}

describe("current Spell Calculator integration", () => {
  it("matches the current simple Target, Damage, and Range calculation", () => {
    const target = {
      ...createContainer("target"),
      effects: [effect("damage", 3)],
      rangeRuleId: "short",
    };
    const spell = spellWith(target);
    const result = calculateSpell(spell);

    expect(result.totalMana).toBe(12);
    expect(result.baseSpellMastery).toBe("Novice");
    expect(result.baseCombatCastingTime).toBe(6);
    expect(result.baseOutOfCombatCastingTimeSeconds).toBe(12);
    expect(validateSpell(spell, undefined, result).status).toBe("VALID");
  });

  it("matches current AoE shape and fixed Combat Round behavior", () => {
    const area = {
      ...createContainer("aoe"),
      effects: [effect("damage")],
      shape: addOn("radius", 2),
      durations: [addOn("combat-round", 0)],
    };
    const spell = spellWith(area);
    const result = calculateSpell(spell);

    expect(result.totalMana).toBe(17);
    expect(result.totals.addons).toBe(12);
    expect(validateSpell(spell, undefined, result).status).toBe("VALID");
  });

  it("recursively calculates deeply nested containers", () => {
    const first = { ...createContainer("target"), effects: [effect("damage")] };
    const spell = spellWith(first);
    let parent = first;
    for (let depth = 0; depth < 15; depth += 1) {
      const child = { ...createContainer("target"), effects: [effect("damage")] };
      parent.children = [child];
      parent = child;
    }

    const result = calculateSpell(spell);
    expect(result.totalMana).toBe(16 * 4);
    expect(Math.max(...result.breakdown.map((line) => line.depth))).toBe(16);
  });

  it("uses the confirmed practitioner and Raw Casting layers", () => {
    const practitioner = calculatePractitioner(
      { baseSpellManaCost: 35, baseSpellMastery: "Master" },
      "High Master",
    );
    expect(practitioner.calculation.adjustedManaCost).toBe(28);
    expect(practitioner.calculation.combatCastingTime).toBe(14);

    const raw = calculateCastingCircumstance(
      practitioner.calculation,
      "no-open-framework-slot",
    );
    expect(raw.finalCastingMana).toBe(49);
    expect(raw.finalCombatCastingTime).toBe(25);
  });

  it("keeps the original Apprentice casting cost for higher Progressive tiers", () => {
    const spell = createEmptySpell();
    spell.name = "Growing Tide Bolt";
    spell.frameworkSkillId = 1;
    spell.sphere = "Water";
    spell.containers[0]!.effects = [effect("damage")];
    spell.containers[0]!.rangeRuleId = "melee-reach";
    spell.modifiers = [createModifierSelection("progressive-spell")];

    const inherited = resolveProgressiveSpellForLevel(
      spell,
      "Apprentice",
    ).resolvedStructure;
    const stronger: ProgressiveSpellStructure = cloneProgressiveStructure(inherited);
    stronger.containers[0]!.effects[0]!.quantity = 5;
    stronger.containers[0]!.rangeRuleId = "long";
    spell.progressive.milestones.find(({ level }) => level === "Novice")!.changes =
      diffProgressiveStructures(inherited, stronger);

    const original = calculateSpell(spell);
    const novice = resolveProgressiveSpellForLevel(spell, "Novice");
    expect(novice.resolvedConstructionCalculation.baseSpellManaCost).toBeGreaterThan(
      original.baseSpellManaCost,
    );
    expect(novice.castingCalculation.baseSpellManaCost).toBe(
      original.baseSpellManaCost,
    );
    expect(novice.castingCalculation.combatCastingTime).toBe(
      original.combatCastingTime,
    );
  });

  it("round-trips a versioned construction document and its snapshot", () => {
    const spell = createEmptySpell();
    spell.name = "Archive Test";
    spell.frameworkSkillId = 1;
    spell.sphere = "Charm";
    spell.containers[0]!.effects = [effect("damage", 3)];
    const saved = withCalculationSnapshot(spell);
    const parsed = parseSpellDocument(JSON.stringify(saved));

    expect(parsed.name).toBe("Archive Test");
    expect(parsed.schemaVersion).toBe(6);
    expect(parsed.calculation?.ruleProfileId).toBe(saved.calculation?.ruleProfileId);
    expect(calculateSpell(parsed).totalMana).toBe(calculateSpell(spell).totalMana);
  });

  it("migrates each legacy sphere tradition into the tied shared pool", () => {
    for (const tradition of ["Spellcraft", "Talismanism", "Faith"]) {
      const legacy = {
        ...createEmptySpell(),
        schemaVersion: 5,
        tradition,
        frameworkSkillId: undefined,
        sphere: "Charm",
      };
      const parsed = parseSpellDocument(legacy);
      expect(parsed.tradition).toBe("Spellcraft/Talismanism/Faith");
      expect(parsed.sphere).toBe("Charm");
      expect(parsed.frameworkSkillId).toBeUndefined();
    }
  });

  it("rejects documents written by a future unsupported schema", () => {
    expect(() =>
      parseSpellDocument({ ...createEmptySpell(), schemaVersion: 999 }),
    ).toThrow(/newer than this application supports/i);
  });
});
