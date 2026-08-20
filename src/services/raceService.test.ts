import { describe, expect, it } from "vitest";
import type { RaceRepository } from "../data/repositories/raceRepository";
import type {
  RaceAggregate,
  RaceLibraryFilters,
  RaceSkillCandidate,
  SaveRaceAggregate,
} from "../types/race";
import { RaceService, RaceValidationError } from "./raceService";

const clone = <T>(value: T): T => structuredClone(value);

class MemoryRaceRepository implements RaceRepository {
  private readonly records = new Map<number, RaceAggregate>();
  private nextId = 1;

  async listRaces(filters: RaceLibraryFilters) {
    const all = [...this.records.values()]
      .filter(({ race }) => race.name.toLocaleLowerCase().includes(filters.search?.toLocaleLowerCase() ?? ""))
      .filter(({ race }) => !filters.size || race.size.toLocaleLowerCase() === filters.size.toLocaleLowerCase())
      .sort((a, b) => a.race.name.localeCompare(b.race.name));
    const pageSize = Math.min(100, Math.max(1, filters.pageSize));
    const page = Math.max(1, filters.page);
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize).map(({ race, attributeCaps, movementModes, skillLinks }) => ({
        id: race.id, name: race.name, size: race.size, ageRangeText: race.ageRangeText,
        baseMagic: race.baseMagic, updatedAt: race.updatedAt,
        attributeCapCount: attributeCaps.length, movementModeCount: movementModes.length,
        skillLinkCount: skillLinks.length,
      })),
      total: all.length, page, pageSize, pageCount: Math.max(1, Math.ceil(all.length / pageSize)),
    };
  }
  async listSizes() { return [...new Set([...this.records.values()].map(({ race }) => race.size).filter(Boolean))]; }
  async listSkillCandidates(): Promise<RaceSkillCandidate[]> { return []; }
  async getRaceAggregate(id: number) { return this.records.has(id) ? clone(this.records.get(id)!) : null; }
  async saveRaceAggregate(input: SaveRaceAggregate) {
    const id = input.id ?? this.nextId++;
    const now = new Date().toISOString();
    const existing = this.records.get(id);
    const aggregate: RaceAggregate = {
      race: { id, ...clone(input.core), createdAt: existing?.race.createdAt ?? now, updatedAt: now },
      attributeCaps: input.attributeCaps.map((cap, index) => ({ id: index + 1, raceId: id, ...clone(cap), createdAt: now, updatedAt: now })),
      movementModes: input.movementModes.map((mode, index) => ({ id: index + 1, raceId: id, ...clone(mode), createdAt: now, updatedAt: now })),
      skillLinks: input.skillLinks.map((link, index) => ({ id: index + 1, raceId: id, ...clone(link), createdAt: now, updatedAt: now })),
    };
    this.records.set(id, aggregate);
    return clone(aggregate);
  }
  async deleteRace(id: number) { this.records.delete(id); }
}

function draft(name = "Temporary Humanoid"): SaveRaceAggregate {
  return {
    core: {
      name, legacyDescription: " Lore ", physicalCharacteristics: " Humanoid ",
      physicalDescription: " Varied ", ageRangeText: " 15-90 ", ageMin: 15, ageMax: 90,
      size: " Medium ", baseMagic: 2, racialQuirkName: " Adaptable ",
      quirkSuccessEffect: " Succeeds ", quirkFailureEffect: " Falters ",
      commonLanguagesKnown: " Common ", commonArchetypes: " Generalist ",
      genreExamples: " Fantasy ", culturalMindset: " Persistent ", outlookOnMagic: " Curious ",
      createdByUserId: 1, sourceSystem: null, sourceExternalId: null,
    },
    attributeCaps: ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((attributeKey, sortOrder) => ({ attributeKey, maxValue: 50, sortOrder })),
    movementModes: [{ movementMode: "Land", baseValue: 3, notes: "", sortOrder: 0 }],
    skillLinks: [
      { skillId: 1, skillName: "Survival", skillClassification: "standard", linkType: "bonus", value: 4, sortOrder: 0 },
      { skillId: 2, skillName: "Persuasion", skillClassification: "standard", linkType: "bonus", value: 3, sortOrder: 1 },
      { skillId: 3, skillName: "Shift Forms", skillClassification: "special ability", linkType: "granted", value: null, sortOrder: 0 },
    ],
  };
}

describe("RaceService", () => {
  it("creates, reloads, edits, searches, and deletes a complete Race", async () => {
    const service = new RaceService(new MemoryRaceRepository());
    const created = await service.saveRace(draft());
    expect(created.race.name).toBe("Temporary Humanoid");
    expect(created.attributeCaps).toHaveLength(6);
    expect(created.movementModes).toMatchObject([{ movementMode: "Land", baseValue: 3 }]);
    expect(created.skillLinks.filter(({ linkType }) => linkType === "bonus")).toHaveLength(2);
    expect(created.skillLinks.filter(({ linkType }) => linkType === "granted")).toHaveLength(1);

    const update = draft("Revised Humanoid");
    update.id = created.race.id;
    update.attributeCaps.push({ attributeKey: "Energon", maxValue: 60, sortOrder: 99 });
    update.movementModes = [
      { movementMode: "Land", baseValue: 2, notes: "", sortOrder: 8 },
      { movementMode: "Swim", baseValue: 4, notes: "Amphibious", sortOrder: 9 },
    ];
    const saved = await service.saveRace(update);
    expect(saved.attributeCaps[saved.attributeCaps.length - 1]).toMatchObject({ attributeKey: "Energon", sortOrder: 6 });
    expect(saved.movementModes).toMatchObject([
      { movementMode: "Land", baseValue: 2, sortOrder: 0 },
      { movementMode: "Swim", baseValue: 4, sortOrder: 1 },
    ]);
    await expect(service.listRaces({ search: "revised", page: 1, pageSize: 40 })).resolves.toMatchObject({ total: 1 });
    await service.deleteRace(created.race.id);
    await expect(service.getRace(created.race.id)).resolves.toBeNull();
  });

  it("rejects duplicate cap keys before any aggregate is persisted", async () => {
    const repository = new MemoryRaceRepository();
    const service = new RaceService(repository);
    const invalid = draft("Duplicate Caps");
    invalid.attributeCaps.push({ attributeKey: "str", maxValue: 55, sortOrder: 10 });
    await expect(service.saveRace(invalid)).rejects.toBeInstanceOf(RaceValidationError);
    await expect(service.listRaces({ page: 1, pageSize: 40 })).resolves.toMatchObject({ total: 0 });
  });

  it("rejects invalid core, numeric, movement, and duplicate Skill-link data", async () => {
    const service = new RaceService(new MemoryRaceRepository());
    await expect(service.saveRace(draft("   "))).rejects.toThrow(/name is required/i);
    const age = draft(); age.core.ageMin = 100; age.core.ageMax = 20;
    await expect(service.saveRace(age)).rejects.toThrow(/cannot exceed/i);
    const movement = draft(); movement.movementModes[0].movementMode = "";
    await expect(service.saveRace(movement)).rejects.toThrow(/movement mode/i);
    const duplicateSkill = draft(); duplicateSkill.skillLinks.push({ ...duplicateSkill.skillLinks[0], sortOrder: 9 });
    await expect(service.saveRace(duplicateSkill)).rejects.toThrow(/cannot be added twice/i);
    const invalidGrant = draft();
    invalidGrant.skillLinks[2].skillClassification = "standard";
    await expect(service.saveRace(invalidGrant)).rejects.toThrow(/classified as Special Ability/i);
  });
});
