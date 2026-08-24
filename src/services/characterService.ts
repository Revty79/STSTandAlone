import {
  characterRepository,
  type CharacterRepository,
} from "../data/repositories/characterRepository";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAggregate,
  type AdvanceCharacterSkill,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterEditorMode,
  type CharacterProfileDraft,
  type SaveCharacterAggregate,
} from "../types/character";
import type { RaceAggregate } from "../types/race";
import { buildSkillAllocationTree } from "../features/characters/characterRules";
import { getCampaignMoneyBreakdown } from "../features/currency/currencyRules";

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
  const currencyHoldings = aggregate.currencyHoldings.length > 0
    ? aggregate.currencyHoldings.map((holding) => ({
        currencyId: holding.currencyId,
        quantity: holding.quantity,
      }))
    : aggregate.campaign.currencySystem === "Derived Currency"
      ? getCampaignMoneyBreakdown(
          aggregate.profile.creditsRemaining,
          aggregate.campaign.currencySystem,
          aggregate.campaign.derivedCurrencies,
        ).entries.map((entry) => ({ currencyId: entry.id, quantity: entry.quantity }))
      : [];
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
    currencyHoldings,
  };
}

function normalizeSave(
  aggregate: CharacterAggregate,
  draft: CharacterDraft,
  requestingUserId: number,
  editorMode: CharacterEditorMode,
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
  const seenCurrencies = new Set<number>();
  const currencyHoldings = draft.currencyHoldings.map((holding) => {
    const currencyId = savedId(holding.currencyId, "Campaign Currency");
    if (seenCurrencies.has(currencyId)) {
      throw new CharacterValidationError("A Campaign Currency can only appear once in a purse.");
    }
    seenCurrencies.add(currencyId);
    if (!Number.isInteger(holding.quantity) || holding.quantity < 0) {
      throw new CharacterValidationError("Currency quantity must be a whole number zero or greater.");
    }
    return { currencyId, quantity: holding.quantity };
  });
  const normalizeText = (value: string) => value.trim();
  return {
    characterId: savedId(aggregate.character.id, "Character"),
    campaignId: savedId(aggregate.campaign.id, "Campaign"),
    requestingUserId: savedId(requestingUserId, "Player Profile"),
    administrativeOverride: editorMode === "god",
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
      fatePoints: editorMode === "player" && aggregate.campaign.fatePointMethod === "Assigned"
        ? aggregate.campaign.assignedFatePoints ?? 0
        : optionalWholeNonNegative(draft.profile.fatePoints, "Fate Points"),
      creditsRemaining: nonNegative(draft.profile.creditsRemaining, "Current funds"),
    },
    attributes,
    skillAllocations: buildSkillAllocationTree(draft.skillAllocations),
    items,
    currencyHoldings,
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

  async createNpc(
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterAggregate> {
    return this.repository.createNpcAggregate(
      savedId(campaignId, "Campaign"),
      savedId(requestingUserId, "G.O.D. Profile"),
    );
  }

  async getCharacter(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
    editorMode: CharacterEditorMode = "player",
  ): Promise<CharacterAggregate | null> {
    return this.repository.getCharacterAggregate(
      savedId(characterId, "Character"),
      savedId(campaignId, "Campaign"),
      savedId(requestingUserId, "Player Profile"),
      editorMode === "god",
    );
  }

  async saveCharacter(
    aggregate: CharacterAggregate,
    draft: CharacterDraft,
    requestingUserId: number,
    completeCreation = false,
    editorMode: CharacterEditorMode = "player",
  ): Promise<CharacterAggregate> {
    if (editorMode === "player" && aggregate.character.playerUserId !== requestingUserId) {
      throw new CharacterValidationError("A Player may only save their own Character.");
    }
    if (editorMode === "player" && aggregate.profile.creationCompletedAt) {
      throw new CharacterValidationError(
        "Character creation is complete and its creation record is permanently locked.",
      );
    }
    return this.repository.saveCharacterAggregate(
      normalizeSave(
        aggregate,
        draft,
        requestingUserId,
        editorMode,
        completeCreation,
      ),
    );
  }

  async advanceSkill(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    skillId: number,
    parentAllocationId: number | null,
    pointsToAdd = 1,
  ): Promise<CharacterAggregate> {
    if (aggregate.character.playerUserId !== requestingUserId) {
      throw new CharacterValidationError("A Player may only advance their own Character.");
    }
    if (!aggregate.profile.creationCompletedAt) {
      throw new CharacterValidationError(
        "Character creation must be completed before Experience can be spent.",
      );
    }
    if (!Number.isInteger(pointsToAdd) || pointsToAdd <= 0) {
      throw new CharacterValidationError("Skill advancement points must be a positive whole number.");
    }
    const input: AdvanceCharacterSkill = {
      characterId: savedId(aggregate.character.id, "Character"),
      campaignId: savedId(aggregate.campaign.id, "Campaign"),
      requestingUserId: savedId(requestingUserId, "Player Profile"),
      skillId: savedId(skillId, "Skill"),
      parentAllocationId: parentAllocationId === null
        ? null
        : savedId(parentAllocationId, "Parent Skill Allocation"),
      pointsToAdd,
    };
    return this.repository.advanceCharacterSkill(input);
  }

  async getAllowedRace(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    raceId: number,
    editorMode: CharacterEditorMode = "player",
  ): Promise<RaceAggregate | null> {
    if (editorMode === "player" && aggregate.character.playerUserId !== requestingUserId) {
      throw new CharacterValidationError("A Player may only read Races for their own Character.");
    }
    return this.repository.getAllowedRaceForCharacter(
      aggregate.character.id,
      aggregate.campaign.id,
      requestingUserId,
      savedId(raceId, "Race"),
      editorMode === "god",
    );
  }
}

export const characterService = new CharacterService();
