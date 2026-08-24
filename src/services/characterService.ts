import {
  characterRepository,
  type CharacterRepository,
} from "../data/repositories/characterRepository";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterProfileDraft,
  type SaveCharacterAggregate,
} from "../types/character";
import type { RaceAggregate } from "../types/race";
import { buildSkillAllocationTree } from "../features/characters/characterRules";

export class CharacterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterValidationError";
  }
}

function savedId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CharacterValidationError(`${label} must reference a saved record.`);
  }
  return value;
}

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new CharacterValidationError(`${label} is required.`);
  return result;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new CharacterValidationError(`${label} must be a number zero or greater.`);
  }
  return value;
}

function optionalNonNegative(value: number | null, label: string): number | null {
  return value === null ? null : nonNegative(value, label);
}

function optionalWholeNonNegative(value: number | null, label: string): number | null {
  if (value === null) return null;
  const result = nonNegative(value, label);
  if (!Number.isInteger(result)) {
    throw new CharacterValidationError(`${label} must be a whole number.`);
  }
  return result;
}

function profileDraft(aggregate: CharacterAggregate): CharacterProfileDraft {
  const {
    characterId: _characterId,
    creditsRemaining: _creditsRemaining,
    creationCompletedAt: _creationCompletedAt,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...profile
  } = aggregate.profile;
  return profile;
}

export function characterAggregateToDraft(aggregate: CharacterAggregate): CharacterDraft {
  const attributes = Object.fromEntries(
    CHARACTER_ATTRIBUTE_KEYS.map((key) => [
      key,
      aggregate.attributes.find((attribute) => attribute.attributeKey === key)?.value ?? 25,
    ]),
  ) as Record<CharacterAttributeKey, number>;
  return {
    name: aggregate.character.name,
    profile: profileDraft(aggregate),
    attributes,
    skillAllocations: aggregate.skillAllocations.map((allocation) => ({
      draftId: allocation.id,
      skillId: allocation.skillId,
      parentDraftId: allocation.parentAllocationId,
      points: allocation.points,
    })),
    items: aggregate.items.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      unitCostCredits: item.unitCostCredits,
    })),
  };
}

function normalizeSave(
  aggregate: CharacterAggregate,
  draft: CharacterDraft,
  requestingUserId: number,
  completeCreation: boolean,
): SaveCharacterAggregate {
  const heightFeet = optionalWholeNonNegative(draft.profile.heightFeet, "Height feet");
  const heightInches = optionalWholeNonNegative(draft.profile.heightInches, "Height inches");
  if (heightInches !== null && heightInches > 11) {
    throw new CharacterValidationError("Height inches must be between 0 and 11.");
  }
  const attributes = CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
    attributeKey,
    value: nonNegative(draft.attributes[attributeKey], `${attributeKey} Attribute`),
  }));
  const seenItems = new Set<number>();
  const items = draft.items.map((item) => {
    const itemId = savedId(item.itemId, "Character Item");
    if (seenItems.has(itemId)) {
      throw new CharacterValidationError("A master Item can only appear once in Character possessions.");
    }
    seenItems.add(itemId);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new CharacterValidationError("Character Item quantity must be a positive whole number.");
    }
    return {
      itemId,
      quantity: item.quantity,
      unitCostCredits: nonNegative(item.unitCostCredits, "Item unit cost"),
    };
  });
  const normalizeText = (value: string) => value.trim();
  return {
    characterId: savedId(aggregate.character.id, "Character"),
    campaignId: savedId(aggregate.campaign.id, "Campaign"),
    requestingUserId: savedId(requestingUserId, "Player Profile"),
    completeCreation,
    name: required(draft.name, "Character Name"),
    profile: {
      raceId: draft.profile.raceId === null
        ? null
        : savedId(draft.profile.raceId, "Race"),
      age: draft.profile.age === null
        ? null
        : Math.trunc(nonNegative(draft.profile.age, "Age")),
      sex: normalizeText(draft.profile.sex),
      heightFeet,
      heightInches,
      weight: optionalNonNegative(draft.profile.weight, "Weight"),
      skinColor: normalizeText(draft.profile.skinColor),
      eyeColor: normalizeText(draft.profile.eyeColor),
      hairColor: normalizeText(draft.profile.hairColor),
      deity: normalizeText(draft.profile.deity),
      definingMarks: normalizeText(draft.profile.definingMarks),
      personality: normalizeText(draft.profile.personality),
      goals: normalizeText(draft.profile.goals),
      secrets: normalizeText(draft.profile.secrets),
      backstory: normalizeText(draft.profile.backstory),
      motivations: normalizeText(draft.profile.motivations),
      fame: nonNegative(draft.profile.fame, "Fame"),
      experience: nonNegative(draft.profile.experience, "Experience"),
      totalExperience: nonNegative(draft.profile.totalExperience, "Total Experience"),
      quintessence: nonNegative(draft.profile.quintessence, "Quintessence"),
      totalQuintessence: nonNegative(
        draft.profile.totalQuintessence,
        "Total Quintessence",
      ),
    },
    attributes,
    skillAllocations: buildSkillAllocationTree(draft.skillAllocations),
    items,
  };
}

export class CharacterService {
  constructor(private readonly repository: CharacterRepository = characterRepository) {}

  async createCharacter(
    campaignId: number,
    playerUserId: number,
  ): Promise<CharacterAggregate> {
    return this.repository.createCharacterAggregate(
      savedId(campaignId, "Campaign"),
      savedId(playerUserId, "Player Profile"),
    );
  }

  async getCharacter(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterAggregate | null> {
    return this.repository.getCharacterAggregate(
      savedId(characterId, "Character"),
      savedId(campaignId, "Campaign"),
      savedId(requestingUserId, "Player Profile"),
    );
  }

  async saveCharacter(
    aggregate: CharacterAggregate,
    draft: CharacterDraft,
    requestingUserId: number,
    completeCreation = false,
  ): Promise<CharacterAggregate> {
    if (aggregate.character.playerUserId !== requestingUserId) {
      throw new CharacterValidationError("A Player may only save their own Character.");
    }
    if (aggregate.profile.creationCompletedAt) {
      throw new CharacterValidationError(
        "Character creation is complete and its creation record is permanently locked.",
      );
    }
    return this.repository.saveCharacterAggregate(
      normalizeSave(aggregate, draft, requestingUserId, completeCreation),
    );
  }

  async getAllowedRace(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    raceId: number,
  ): Promise<RaceAggregate | null> {
    if (aggregate.character.playerUserId !== requestingUserId) {
      throw new CharacterValidationError("A Player may only read Races for their own Character.");
    }
    return this.repository.getAllowedRaceForCharacter(
      aggregate.character.id,
      aggregate.campaign.id,
      requestingUserId,
      savedId(raceId, "Race"),
    );
  }
}

export const characterService = new CharacterService();
