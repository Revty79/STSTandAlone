import { describe, expect, it } from "vitest";
import spellSeed from "../../../data/serrian-tide-spell-seed.json";
import { calculateSpell } from "./engine/calculateSpell";
import { validateSpell } from "./engine/validateSpell";
import type { SpellDocument } from "./models/spell";
import { parseSpellDocument } from "./spellDocumentCodec";

interface SeedRecord {
  targetName: string;
  spell: unknown;
  source: {
    sourceRows: Array<{ rowNumber: number; values: Record<string, string> }>;
    spreadsheetReference: {
      referenceOnly: boolean;
      masteryLabel: string;
      statedSpellCost: number;
      statedCastingTime: number;
    };
    parseWarnings: string[];
  };
}

const seed = spellSeed as unknown as {
  sourceRowCount: number;
  recordCount: number;
  records: SeedRecord[];
};

function allContainers(spell: SpellDocument) {
  const containers = [...spell.containers];
  for (let index = 0; index < containers.length; index += 1) {
    containers.push(...containers[index]!.children);
  }
  return containers;
}

describe("canonical Spell Construction seed", () => {
  it("maps all 373 source rows into 371 unique, parseable construction records", () => {
    expect(seed.sourceRowCount).toBe(373);
    expect(seed.recordCount).toBe(371);
    expect(seed.records).toHaveLength(371);
    expect(new Set(seed.records.map(({ targetName }) => targetName.toLocaleLowerCase("en-US"))).size).toBe(371);
    expect(seed.records.reduce((total, record) => total + record.source.sourceRows.length, 0)).toBe(373);

    const traditions = new Map<string, number>();
    const invalidSpells: Array<{ name: string; errors: string[] }> = [];
    for (const record of seed.records) {
      const spell = parseSpellDocument(record.spell);
      const calculation = calculateSpell(spell);
      const validation = validateSpell(spell, undefined, calculation);

      expect(spell.name).toBe(record.targetName);
      expect(spell.schemaVersion).toBe(6);
      expect(spell.practitionerLevel).toBeUndefined();
      expect(calculation.totalMana).toBeTypeOf("number");
      expect(["VALID", "WARNING", "ERROR"]).toContain(validation.status);
      const errors = validation.issues
        .filter(({ severity }) => severity === "ERROR")
        .map(({ message }) => message);
      if (errors.length > 0) invalidSpells.push({ name: spell.name, errors });
      traditions.set(spell.tradition, (traditions.get(spell.tradition) ?? 0) + 1);
    }

    expect(invalidSpells).toEqual([]);

    expect(Object.fromEntries(traditions)).toEqual({
      "Bardic Resonance": 71,
      Psionics: 108,
      "Spellcraft/Talismanism/Faith": 192,
    });
  });

  it("adds Soul Lock under Death with its full source row and construction components", () => {
    const record = seed.records.find(({ targetName }) => targetName === "Soul Lock");
    expect(record).toBeDefined();
    const spell = parseSpellDocument(record!.spell);
    const containers = allContainers(spell);

    expect(spell.sphere).toBe("Death");
    expect(spell.description).toContain("spectral chains");
    expect(record!.source.spreadsheetReference).toMatchObject({
      referenceOnly: true,
      statedSpellCost: 84,
      statedCastingTime: 42,
    });
    expect(record!.source.sourceRows).toHaveLength(1);
    expect(record!.source.sourceRows[0]!.values["Parent Skill"]).toBe("Death");
    expect(containers.map(({ containerRuleId }) => containerRuleId)).toEqual(
      expect.arrayContaining(["aoe", "control"]),
    );
    expect(containers.flatMap(({ effects }) => effects.map(({ ruleId }) => ruleId))).toEqual(
      expect.arrayContaining(["anchor-lock", "immobilize", "link-bind"]),
    );
    expect(calculateSpell(spell)).toMatchObject({
      totalMana: 38,
      castingTime: 19,
      spellMastery: "Master",
    });
  });

  it("stores Progressive prose without inventing higher-tier component deltas", () => {
    const progressiveRecords = seed.records
      .map((record) => ({ record, spell: parseSpellDocument(record.spell) }))
      .filter(({ spell }) => spell.progressive.enabled);

    expect(progressiveRecords).toHaveLength(35);
    for (const { spell } of progressiveRecords) {
      expect(spell.progressive.costMode).toBe("original-base");
      expect(spell.progressive.milestones).toHaveLength(5);
      expect(spell.progressive.milestones.every(({ changes }) => changes.length === 0)).toBe(true);
      expect(spell.modifiers.some(({ ruleId }) => ruleId === "progressive-spell")).toBe(true);
    }
  });

  it("keeps spreadsheet math reference-only and lets the calculator determine truth", () => {
    for (const record of seed.records) {
      const spell = parseSpellDocument(record.spell);
      const calculated = calculateSpell(spell);
      expect(spell.calculation).toBeUndefined();
      expect(record.source.spreadsheetReference.referenceOnly).toBe(true);
      expect(calculated.totalMana).toBeTypeOf("number");
      expect(calculated.castingTime).toBeTypeOf("number");
    }
  });
});
