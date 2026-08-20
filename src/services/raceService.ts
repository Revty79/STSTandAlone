import {
  raceRepository,
  type RaceRepository,
} from "../data/repositories/raceRepository";
import type {
  RaceAggregate,
  RaceLibraryFilters,
  RaceLibraryPage,
  RaceSkillCandidate,
  SaveRaceAggregate,
} from "../types/race";
import { GRANTED_RACE_SKILL_CLASSIFICATION } from "../data/raceOptions";

export class RaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RaceValidationError";
  }
}

function cleanOptional(value: string | null): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RaceValidationError(`${label} must be a number.`);
  }
  return value;
}

function normalize(input: SaveRaceAggregate): SaveRaceAggregate {
  const name = input.core.name.trim();
  if (!name) throw new RaceValidationError("Race name is required.");
  for (const [value, label] of [
    [input.core.ageMin, "Minimum Age"],
    [input.core.ageMax, "Maximum Age"],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new RaceValidationError(`${label} must be a non-negative whole number.`);
    }
  }
  if (
    input.core.ageMin !== null &&
    input.core.ageMax !== null &&
    input.core.ageMin > input.core.ageMax
  ) {
    throw new RaceValidationError("Minimum Age cannot exceed Maximum Age.");
  }
  if (input.core.baseMagic !== null) {
    requireFinite(input.core.baseMagic, "Base Magic");
  }

  const capKeys = new Set<string>();
  const attributeCaps = input.attributeCaps.map((cap, index) => {
    const attributeKey = cap.attributeKey.trim();
    if (!attributeKey) {
      throw new RaceValidationError("Every attribute cap needs an Attribute name.");
    }
    const identity = attributeKey.toLocaleLowerCase();
    if (capKeys.has(identity)) {
      throw new RaceValidationError(`${attributeKey} cannot be added twice to the same Race.`);
    }
    capKeys.add(identity);
    return {
      attributeKey,
      maxValue: requireFinite(cap.maxValue, `${attributeKey} Maximum`),
      sortOrder: index,
    };
  });

  const movementModes = input.movementModes.map((movement, index) => {
    const movementMode = movement.movementMode.trim();
    if (!movementMode) {
      throw new RaceValidationError("Every movement row needs a Movement Mode.");
    }
    return {
      movementMode,
      baseValue: requireFinite(movement.baseValue, `${movementMode} Base Value`),
      notes: movement.notes.trim(),
      sortOrder: index,
    };
  });

  const skillLinks = input.skillLinks.map((link, index) => {
    const linkType = link.linkType.trim();
    if (!Number.isInteger(link.skillId) || link.skillId <= 0) {
      throw new RaceValidationError("Every Race Skill link must reference a saved Skill.");
    }
    if (!linkType) throw new RaceValidationError("Every Race Skill link needs a type.");
    if (
      linkType.toLocaleLowerCase() === "granted" &&
      link.skillClassification.trim().toLocaleLowerCase() !==
        GRANTED_RACE_SKILL_CLASSIFICATION
    ) {
      throw new RaceValidationError(
        "Granted Skills / Racial Abilities must be classified as Special Ability.",
      );
    }
    if (link.value !== null) requireFinite(link.value, `${link.skillName} value`);
    return {
      ...link,
      skillName: link.skillName.trim(),
      skillClassification: link.skillClassification.trim(),
      linkType,
      value: link.value,
      sortOrder: input.skillLinks
        .slice(0, index)
        .filter((candidate) => candidate.linkType.trim().toLocaleLowerCase() === linkType.toLocaleLowerCase())
        .length,
    };
  });
  const linkIdentities = new Set<string>();
  for (const link of skillLinks) {
    const identity = `${link.skillId}:${link.linkType.toLocaleLowerCase()}`;
    if (linkIdentities.has(identity)) {
      throw new RaceValidationError(`${link.skillName || "That Skill"} cannot be added twice as ${link.linkType}.`);
    }
    linkIdentities.add(identity);
  }

  const text = (value: string) => value.trim();
  return {
    id: input.id,
    core: {
      ...input.core,
      name,
      legacyDescription: text(input.core.legacyDescription),
      physicalCharacteristics: text(input.core.physicalCharacteristics),
      physicalDescription: text(input.core.physicalDescription),
      ageRangeText: text(input.core.ageRangeText),
      size: text(input.core.size),
      racialQuirkName: text(input.core.racialQuirkName),
      quirkSuccessEffect: text(input.core.quirkSuccessEffect),
      quirkFailureEffect: text(input.core.quirkFailureEffect),
      commonLanguagesKnown: text(input.core.commonLanguagesKnown),
      commonArchetypes: text(input.core.commonArchetypes),
      genreExamples: text(input.core.genreExamples),
      culturalMindset: text(input.core.culturalMindset),
      outlookOnMagic: text(input.core.outlookOnMagic),
      sourceSystem: cleanOptional(input.core.sourceSystem),
      sourceExternalId: cleanOptional(input.core.sourceExternalId),
    },
    attributeCaps,
    movementModes,
    skillLinks,
  };
}

export class RaceService {
  constructor(private readonly repository: RaceRepository = raceRepository) {}

  listRaces(filters: RaceLibraryFilters): Promise<RaceLibraryPage> {
    return this.repository.listRaces(filters);
  }

  listSizes(): Promise<string[]> {
    return this.repository.listSizes();
  }

  listSkillCandidates(search: string, classification?: string): Promise<RaceSkillCandidate[]> {
    return this.repository.listSkillCandidates(search, classification);
  }

  getRace(id: number): Promise<RaceAggregate | null> {
    return this.repository.getRaceAggregate(id);
  }

  async saveRace(input: SaveRaceAggregate): Promise<RaceAggregate> {
    return this.repository.saveRaceAggregate(normalize(input));
  }

  deleteRace(id: number): Promise<void> {
    return this.repository.deleteRace(id);
  }
}

export const raceService = new RaceService();
