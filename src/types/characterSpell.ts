import type { SpellDocument } from "../features/spell-construction/models/spell";

export type CharacterSavedSpell = {
  id: number;
  characterId: number;
  documentId: string;
  name: string;
  tradition: SpellDocument["tradition"];
  document: SpellDocument;
  inSpellbook: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveCharacterSpell = {
  characterId: number;
  campaignId: number;
  requestingUserId: number;
  documentJson: string;
  addToSpellbook: boolean;
};

export type SetCharacterSpellbookStatus = {
  savedSpellId: number;
  characterId: number;
  campaignId: number;
  requestingUserId: number;
  inSpellbook: boolean;
};

export type DeleteCharacterSpell = {
  savedSpellId: number;
  characterId: number;
  campaignId: number;
  requestingUserId: number;
};
