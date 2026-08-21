import { describe, expect, it } from "vitest";
import raceSeedJson from "../../../data/serrian-tide-race-seed.json";
import raceReportJson from "../../../data/serrian-tide-race-import-report.json";

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
    size: string;
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
  unresolvedReferenceCount: number;
  unresolvedUniqueNameCount: number;
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
      bonusLinks: 217,
      grantedLinks: 32,
    });
    expect(raceSeed.records).toHaveLength(56);
    expect(new Set(raceSeed.records.map(({ core }) => core.name.toLocaleLowerCase())).size).toBe(56);
    expect(new Set(raceSeed.records.map(({ core }) => core.sourceExternalId)).size).toBe(56);
    expect(raceSeed.records.every(({ core }) =>
      core.legacyDescription && core.physicalCharacteristics && core.physicalDescription &&
      core.ageRangeText && core.size && core.racialQuirkName && core.commonLanguagesKnown &&
      core.culturalMindset,
    )).toBe(true);
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

  it("imports only exact existing Skill matches and grants only Special Abilities", () => {
    const links = raceSeed.records.flatMap(({ skillLinks }) => skillLinks);
    expect(links.filter(({ linkType }) => linkType === "bonus")).toHaveLength(217);
    const granted = links.filter(({ linkType }) => linkType === "granted");
    expect(granted).toHaveLength(32);
    expect(granted.every(({ skillClassification }) =>
      skillClassification.toLocaleLowerCase() === "special ability",
    )).toBe(true);

    const importedNames = new Set(links.map(({ skillName }) => skillName.toLocaleLowerCase()));
    for (const discrepancy of raceReport.unresolvedReferences) {
      expect(importedNames.has(discrepancy.sourceSkillName.toLocaleLowerCase())).toBe(false);
      expect(discrepancy.reason).toContain("exact Skill name");
    }
    expect(raceReport.policy).toContain("No Skills or aliases are created");
    expect(raceReport.unresolvedReferenceCount).toBe(35);
    expect(raceReport.unresolvedUniqueNameCount).toBe(13);
  });
});
