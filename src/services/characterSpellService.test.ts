import { describe, expect, it } from "vitest";
import type { CharacterSpellRepository } from "../data/repositories/characterSpellRepository";
import { createEmptySpell } from "../features/spell-construction/utilities/spellFactory";
import type { CharacterAggregate } from "../types/character";
import type {
  CharacterSavedSpell,
  DeleteCharacterSpell,
  SaveCharacterSpell,
  SetCharacterSpellbookStatus,
} from "../types/characterSpell";
import { CharacterSpellService } from "./characterSpellService";

function aggregate(): CharacterAggregate {
  return {
    character: { id: 9, campaignId: 12, playerUserId: 2, name: "Neris", campaignName: "Tidefall", playerUsername: "Mariner", createdAt: "created", updatedAt: "updated" },
    profile: { characterId: 9, raceId: null, age: null, sex: "", heightFeet: null, heightInches: null, weight: null, skinColor: "", eyeColor: "", hairColor: "", deity: "", definingMarks: "", personality: "", goals: "", secrets: "", backstory: "", motivations: "", fame: 0, experience: 0, totalExperience: 0, quintessence: 0, totalQuintessence: 0, fatePoints: 0, creditsRemaining: 0, creationCompletedAt: "completed", createdAt: "created", updatedAt: "updated" },
    attributes: [], skillAllocations: [], items: [], currencyHoldings: [],
    campaign: { id: 12, name: "Tidefall", attributePoints: 0, skillPoints: 0, maxStartingSkill: 0, pointsToUnlockNextTier: 0, maxPointsInSkill: 0, startingCreditAmount: 0, currencySystem: "Credits", fatePointMethod: "Assigned", assignedFatePoints: 0, allowedSystems: [], derivedCurrencies: [] },
    allowedRaces: [], selectedRace: null, skillCatalog: [], skillRelationships: [], authorizedItems: [],
  };
}

function addPsionics(character: CharacterAggregate): void {
  character.selectedRace = {
    race: {
      id: 3, name: "Human", legacyDescription: "", physicalCharacteristics: "",
      physicalDescription: "", ageRangeText: "", ageMin: null, ageMax: null,
      size: "Medium", baseMagic: 2, racialQuirkName: "", quirkSuccessEffect: "",
      quirkFailureEffect: "", commonLanguagesKnown: "", commonArchetypes: "",
      genreExamples: "", culturalMindset: "", outlookOnMagic: "",
      createdByUserId: null, sourceSystem: null, sourceExternalId: null,
      createdAt: "created", updatedAt: "updated",
    },
    attributeCaps: [], movementModes: [], skillLinks: [],
  };
  character.skillCatalog = [
    { id: 1, name: "Psionic Focus", classification: "magic access", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
    { id: 2, name: "Psionic Channeling", classification: "standard", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "" },
  ];
  character.skillAllocations = [
    { id: 1, characterId: 9, skillId: 1, skillName: "Psionic Focus", skillClassification: "magic access", skillTier: 1, primaryAttribute: "INT", parentAllocationId: null, points: 1, createdAt: "created", updatedAt: "updated" },
    { id: 2, characterId: 9, skillId: 2, skillName: "Psionic Channeling", skillClassification: "standard", skillTier: 1, primaryAttribute: "INT", parentAllocationId: 1, points: 6, createdAt: "created", updatedAt: "updated" },
  ];
}

class RecordingRepository implements CharacterSpellRepository {
  saved: SaveCharacterSpell | null = null;
  status: SetCharacterSpellbookStatus | null = null;
  deleted: DeleteCharacterSpell | null = null;
  records: CharacterSavedSpell[] = [];

  async listCharacterSpells(): Promise<CharacterSavedSpell[]> { return this.records; }
  async saveCharacterSpell(input: SaveCharacterSpell): Promise<CharacterSavedSpell> {
    this.saved = input;
    const document = JSON.parse(input.documentJson);
    const record = { id: 7, characterId: 9, documentId: document.id, name: document.name, tradition: document.tradition, document, inSpellbook: input.addToSpellbook, createdAt: "created", updatedAt: "updated" } as CharacterSavedSpell;
    this.records = [record];
    return record;
  }
  async setSpellbookStatus(input: SetCharacterSpellbookStatus): Promise<CharacterSavedSpell> {
    this.status = input;
    return { ...this.records[0]!, inSpellbook: input.inSpellbook };
  }
  async deleteCharacterSpell(input: DeleteCharacterSpell): Promise<void> { this.deleted = input; }
}

describe("CharacterSpellService", () => {
  it("saves, duplicates, shelves, and deletes only for the owned Character", async () => {
    const repository = new RecordingRepository();
    const service = new CharacterSpellService(repository);
    const character = aggregate();
    addPsionics(character);
    const spell = { ...createEmptySpell(), name: "Tidal Light", tradition: "Psionics" as const };

    await service.saveSpell(character, 2, spell, true);
    expect(repository.saved).toMatchObject({ characterId: 9, campaignId: 12, requestingUserId: 2, addToSpellbook: true });
    expect(JSON.parse(repository.saved!.documentJson)).toMatchObject({ name: "Tidal Light", castingSystem: "Psyonics", calculation: { ruleProfileId: "serrian-tide-core" } });

    const duplicate = await service.duplicateSpell(character, 2, spell);
    expect(duplicate.document.id).not.toBe(spell.id);
    expect(duplicate.name).toBe("Tidal Light (Copy)");
    await service.setSpellbookStatus(character, 2, 7, false);
    expect(repository.status?.inSpellbook).toBe(false);
    await service.deleteSpell(character, 2, 7);
    expect(repository.deleted?.savedSpellId).toBe(7);

    expect(() => service.saveSpell(character, 99, spell)).toThrow(/own Character/i);
  });

  it("refuses to shelve a personal Sphere Spell until its casting tree is known", () => {
    const service = new CharacterSpellService(new RecordingRepository());
    const character = aggregate();
    const spell = { ...createEmptySpell(), name: "Unbound Sphere Spell" };

    expect(() => service.saveSpell(character, 2, spell, true))
      .toThrow(/Spellcraft, Talismanism, or Faith casting system/i);
  });
});
