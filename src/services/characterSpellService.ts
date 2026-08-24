import {
  characterSpellRepository,
  type CharacterSpellRepository,
} from "../data/repositories/characterSpellRepository";
import { parseSpellDocument } from "../features/spell-construction/spellDocumentCodec";
import type { SpellDocument } from "../features/spell-construction/models/spell";
import {
  getAvailableSpellCastingContexts,
  resolveCharacterSpellCastingContext,
} from "../features/characters/characterSpellCasting";
import {
  cloneContainerWithNewIds,
  cloneModifierWithNewId,
  cloneProgressiveDataWithNewIds,
  withCalculationSnapshot,
} from "../features/spell-construction/utilities/spellFactory";
import { createStableId } from "../features/spell-construction/utilities/ids";
import type { CharacterAggregate } from "../types/character";
import type { CharacterSavedSpell } from "../types/characterSpell";

export class CharacterSpellValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterSpellValidationError";
  }
}

function savedId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CharacterSpellValidationError(`${label} must reference a saved record.`);
  }
  return value;
}

function requireOwnedCharacter(
  aggregate: CharacterAggregate,
  requestingUserId: number,
) {
  if (aggregate.character.playerUserId !== requestingUserId || aggregate.character.isNpc) {
    throw new CharacterSpellValidationError(
      "A Player may only manage Spells for their own Character.",
    );
  }
}

function normalizeCastingSystem(
  aggregate: CharacterAggregate,
  source: SpellDocument,
): SpellDocument {
  const normalized = parseSpellDocument(source);
  if (normalized.castingSystem) return normalized;
  const contexts = getAvailableSpellCastingContexts(aggregate, normalized);
  return contexts.length === 1
    ? { ...normalized, castingSystem: contexts[0]!.system }
    : normalized;
}

function requireSpellbookCastingContext(
  aggregate: CharacterAggregate,
  document: SpellDocument,
): void {
  if (resolveCharacterSpellCastingContext(aggregate, document)) return;
  throw new CharacterSpellValidationError(
    document.tradition === "Spellcraft/Talismanism/Faith"
      ? "Choose this Character's Spellcraft, Talismanism, or Faith casting system before adding the Spell to the Spellbook."
      : "This Character does not have the magic system needed to add this Spell to their Spellbook.",
  );
}

export class CharacterSpellService {
  constructor(
    private readonly repository: CharacterSpellRepository = characterSpellRepository,
  ) {}

  listSpells(
    aggregate: CharacterAggregate,
    requestingUserId: number,
  ): Promise<CharacterSavedSpell[]> {
    requireOwnedCharacter(aggregate, requestingUserId);
    return this.repository.listCharacterSpells(
      savedId(aggregate.character.id, "Character"),
      savedId(aggregate.campaign.id, "Campaign"),
      savedId(requestingUserId, "Player Profile"),
    );
  }

  saveSpell(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    document: SpellDocument,
    addToSpellbook = false,
  ): Promise<CharacterSavedSpell> {
    requireOwnedCharacter(aggregate, requestingUserId);
    const normalizedDocument = normalizeCastingSystem(aggregate, document);
    if (addToSpellbook) requireSpellbookCastingContext(aggregate, normalizedDocument);
    const normalized = withCalculationSnapshot(normalizedDocument);
    return this.repository.saveCharacterSpell({
      characterId: savedId(aggregate.character.id, "Character"),
      campaignId: savedId(aggregate.campaign.id, "Campaign"),
      requestingUserId: savedId(requestingUserId, "Player Profile"),
      documentJson: JSON.stringify(normalized),
      addToSpellbook,
    });
  }

  setSpellbookStatus(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    savedSpellId: number,
    inSpellbook: boolean,
  ): Promise<CharacterSavedSpell> {
    requireOwnedCharacter(aggregate, requestingUserId);
    return this.repository.setSpellbookStatus({
      savedSpellId: savedId(savedSpellId, "Saved Spell"),
      characterId: savedId(aggregate.character.id, "Character"),
      campaignId: savedId(aggregate.campaign.id, "Campaign"),
      requestingUserId: savedId(requestingUserId, "Player Profile"),
      inSpellbook,
    });
  }

  duplicateSpell(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    source: SpellDocument,
  ): Promise<CharacterSavedSpell> {
    const now = new Date().toISOString();
    const idMap = new Map<string, string>();
    const duplicate: SpellDocument = {
      ...parseSpellDocument(source),
      id: createStableId("spell"),
      name: `${source.name.trim() || "Untitled Spell"} (Copy)`,
      containers: source.containers.map((container) =>
        cloneContainerWithNewIds(container, idMap)),
      modifiers: source.modifiers.map((modifier) =>
        cloneModifierWithNewId(modifier, idMap)),
      progressive: cloneProgressiveDataWithNewIds(source.progressive, idMap),
      calculation: undefined,
      createdAt: now,
      modifiedAt: now,
    };
    return this.saveSpell(aggregate, requestingUserId, duplicate, false);
  }

  async deleteSpell(
    aggregate: CharacterAggregate,
    requestingUserId: number,
    savedSpellId: number,
  ): Promise<void> {
    requireOwnedCharacter(aggregate, requestingUserId);
    await this.repository.deleteCharacterSpell({
      savedSpellId: savedId(savedSpellId, "Saved Spell"),
      characterId: savedId(aggregate.character.id, "Character"),
      campaignId: savedId(aggregate.campaign.id, "Campaign"),
      requestingUserId: savedId(requestingUserId, "Player Profile"),
    });
  }
}

export const characterSpellService = new CharacterSpellService();
