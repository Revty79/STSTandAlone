import { describe, expect, it } from "vitest";
import raceSeedJson from "../../../data/serrian-tide-race-seed.json";
import raceReportJson from "../../../data/serrian-tide-race-import-report.json";
import { isSize, type Size } from "../../data/sizeOptions";

type RaceSeedRecord = {
  core: {
    sourceExternalId: string;
    name: string;
    legacyDescription: string;
    physicalCharacteristics: string;
    physicalDescription: string;
    ageRangeText: string;
    ageMin: number | null;
    ageMax: number | null;
    size: Size;
    baseMagic: number | null;
    racialQuirkName: string;
    commonLanguagesKnown: string;
    culturalMindset: string;
  };
  attributeCaps: Array<{ attributeKey: string; maxValue: number; sortOrder: number }>;
  movementModes: Array<{ movementMode: string; baseValue: number; sortOrder: number }>;
  skillLinks: Array<{
    skillName: string;
    skillClassification: string;
    linkType: string;
    value: number | null;
    sourceSkillName: string;
    resolution: "exact-match" | "approved-mapping";
  }>;
};

const raceSeed = raceSeedJson as unknown as {
  sourceSystem: string;
  counts: {
    races: number;
    attributeCaps: number;
    movementModes: number;
    bonusLinks: number;
    grantedLinks: number;
  };
  records: RaceSeedRecord[];
};
const raceReport = raceReportJson as unknown as {
  policy: string;
  exactMatchReferenceCount: number;
  approvedMappedReferenceCount: number;
  intentionallyIgnoredReferenceCount: number;
  unresolvedReferenceCount: number;
  unresolvedUniqueNameCount: number;
  approvedMappedReferences: Array<{
    raceName: string;
    linkType: string;
    sourceSkillName: string;
    targetSkillName: string;
  }>;
  intentionallyIgnoredReferences: Array<{
    raceName: string;
    linkType: string;
    sourceSkillName: string;
    reason: string;
  }>;
  unresolvedReferences: Array<{
    raceName: string;
    linkType: string;
    sourceSkillName: string;
    reason: string;
  }>;
};

describe("canonical Race seed", () => {
  it("contains every normalized Race aggregate from the spreadsheet", () => {
    expect(raceSeed.sourceSystem).toBe("serrian-tide-race-sheet");
    expect(raceSeed.counts).toEqual({
      races: 56,
      attributeCaps: 336,
      movementModes: 57,
      bonusLinks: 248,
      grantedLinks: 35,
    });
    expect(raceSeed.records).toHaveLength(56);
    expect(new Set(raceSeed.records.map(({ core }) => core.name.toLocaleLowerCase())).size).toBe(56);
    expect(new Set(raceSeed.records.map(({ core }) => core.sourceExternalId)).size).toBe(56);
    expect(raceSeed.records.every(({ core }) =>
      core.legacyDescription && core.physicalCharacteristics && core.physicalDescription &&
      core.ageRangeText && core.size && core.racialQuirkName && core.commonLanguagesKnown &&
      core.culturalMindset,
    )).toBe(true);
    expect(raceSeed.records.every(({ core }) => isSize(core.size))).toBe(true);
    expect(new Set(raceSeed.records.map(({ core }) => core.size))).toEqual(
      new Set(["Small", "Medium", "Large"]),
    );
  });

  it("maps Charisma to CHR and preserves Mer-Folk movement as independent modes", () => {
    const standardHuman = raceSeed.records.find(({ core }) => core.name === "Standard Human");
    expect(standardHuman?.core).toMatchObject({
      ageRangeText: "15-90",
      ageMin: 15,
      ageMax: 90,
      size: "Medium",
      baseMagic: 2,
    });
    expect(standardHuman?.attributeCaps.map(({ attributeKey, maxValue }) => [attributeKey, maxValue])).toEqual([
      ["STR", 50], ["DEX", 50], ["CON", 50],
      ["INT", 50], ["WIS", 50], ["CHR", 50],
    ]);

    const merFolk = raceSeed.records.find(({ core }) => core.name === "Mer-Folk");
    expect(merFolk?.movementModes).toMatchObject([
      { movementMode: "Land", baseValue: 2, sortOrder: 0 },
      { movementMode: "Swim", baseValue: 4, sortOrder: 1 },
    ]);
  });

  it("imports exact and approved mapped Skills while granting only Special Abilities", () => {
    const links = raceSeed.records.flatMap(({ skillLinks }) => skillLinks);
    expect(links.filter(({ linkType }) => linkType === "bonus")).toHaveLength(248);
    const granted = links.filter(({ linkType }) => linkType === "granted");
    expect(granted).toHaveLength(35);
    expect(granted.every(({ skillClassification }) =>
      skillClassification.toLocaleLowerCase() === "special ability",
    )).toBe(true);

    expect(raceReport.policy).toContain("No Skills or global aliases are created");
    expect(raceReport.exactMatchReferenceCount).toBe(249);
    expect(raceReport.approvedMappedReferenceCount).toBe(34);
    expect(raceReport.intentionallyIgnoredReferenceCount).toBe(1);
    expect(raceReport.unresolvedReferenceCount).toBe(0);
    expect(raceReport.unresolvedUniqueNameCount).toBe(0);
    expect(raceReport.unresolvedReferences).toEqual([]);
  });

  it("applies the approved canonical Race-Skill conversions", () => {
    const linksFor = (raceName: string) =>
      raceSeed.records.find(({ core }) => core.name === raceName)?.skillLinks ?? [];
    const expectLinks = (
      raceName: string,
      expected: Array<{ skillName: string; linkType: string; value?: number | null }>,
    ) => {
      const links = linksFor(raceName);
      for (const expectedLink of expected) {
        expect(links).toContainEqual(expect.objectContaining(expectedLink));
      }
    };

    expectLinks("Féarai Elves", [
      { skillName: "Spellcraft", linkType: "bonus", value: 5 },
      { skillName: "Research & Analysis", linkType: "bonus", value: 4 },
      { skillName: "Tactical Planning", linkType: "bonus", value: 3 },
      { skillName: "Hovering", linkType: "granted", value: 3 },
      { skillName: "Full Sphere Access", linkType: "granted", value: 3 },
    ]);
    expectLinks("Harbinger Elf", [
      { skillName: "Harbinger Elf Berserker Rage", linkType: "granted" },
    ]);
    expectLinks("Moonshade Elf", [
      { skillName: "Perception", linkType: "bonus", value: 5 },
    ]);
    expectLinks("Shift-Folk (Lagomorph)", [
      { skillName: "Agile Movement", linkType: "bonus", value: 5 },
      { skillName: "Burst Power", linkType: "bonus", value: 2 },
    ]);
    expectLinks("Shift-Folk (Marsupial)", [
      { skillName: "Agile Movement", linkType: "bonus", value: 4 },
      { skillName: "Burst Power", linkType: "bonus", value: 5 },
    ]);
    expectLinks("Shift-Folk (Primate)", [
      { skillName: "Agile Movement", linkType: "bonus", value: 4 },
      { skillName: "Grip Mastery", linkType: "bonus", value: 4 },
    ]);
    expectLinks("Mer-Folk", [
      { skillName: "Water Breathing", linkType: "granted" },
    ]);

    expect(linksFor("Wild Elf").some(({ skillName, sourceSkillName }) =>
      skillName.toLocaleLowerCase() === "non" || sourceSkillName.toLocaleLowerCase() === "non",
    )).toBe(false);
    expect(raceReport.intentionallyIgnoredReferences).toEqual([
      expect.objectContaining({
        raceName: "Wild Elf",
        linkType: "granted",
        sourceSkillName: "Non",
      }),
    ]);
  });
});
