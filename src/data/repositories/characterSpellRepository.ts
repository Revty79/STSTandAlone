import { invoke } from "@tauri-apps/api/core";
import { parseSpellDocument } from "../../features/spell-construction/spellDocumentCodec";
import type {
  CharacterSavedSpell,
  DeleteCharacterSpell,
  SaveCharacterSpell,
  SetCharacterSpellbookStatus,
} from "../../types/characterSpell";
import { getDatabase } from "../database";
import type { CharacterDatabase } from "./characterRepository";

type CharacterSavedSpellRow = Omit<CharacterSavedSpell, "document" | "inSpellbook"> & {
  documentJson: string;
  inSpellbook: number;
};

function mapSavedSpell(row: CharacterSavedSpellRow): CharacterSavedSpell {
  return {
    id: row.id,
    characterId: row.characterId,
    documentId: row.documentId,
    name: row.name,
    tradition: row.tradition,
    document: parseSpellDocument(row.documentJson),
    inSpellbook: Boolean(row.inSpellbook),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CharacterSpellRepository {
  listCharacterSpells(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterSavedSpell[]>;
  saveCharacterSpell(input: SaveCharacterSpell): Promise<CharacterSavedSpell>;
  setSpellbookStatus(input: SetCharacterSpellbookStatus): Promise<CharacterSavedSpell>;
  deleteCharacterSpell(input: DeleteCharacterSpell): Promise<void>;
}

export class TauriCharacterSpellRepository implements CharacterSpellRepository {
  constructor(
    private readonly databaseProvider: () => Promise<CharacterDatabase> = getDatabase,
    private readonly saveInvoker: (input: SaveCharacterSpell) => Promise<number> =
      (input) => invoke<number>("save_character_spell", { input }),
    private readonly statusInvoker: (input: SetCharacterSpellbookStatus) => Promise<number> =
      (input) => invoke<number>("set_character_spellbook_status", { input }),
    private readonly deleteInvoker: (input: DeleteCharacterSpell) => Promise<number> =
      (input) => invoke<number>("delete_character_spell", { input }),
  ) {}

  async listCharacterSpells(
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterSavedSpell[]> {
    const database = await this.databaseProvider();
    const rows = await database.select<CharacterSavedSpellRow[]>(
      `SELECT saved.id,saved.character_id AS characterId,
         saved.document_id AS documentId,saved.name,saved.tradition,
         saved.document_json AS documentJson,saved.in_spellbook AS inSpellbook,
         saved.created_at AS createdAt,saved.updated_at AS updatedAt
       FROM campaign_character_spell_documents saved
       JOIN campaign_characters character ON character.id=saved.character_id
       JOIN campaign_players membership
         ON membership.campaign_id=character.campaign_id
        AND membership.user_id=character.player_user_id
       WHERE saved.character_id=$1 AND character.campaign_id=$2
         AND character.player_user_id=$3 AND character.is_npc=0
       ORDER BY saved.updated_at DESC,saved.id DESC`,
      [characterId, campaignId, requestingUserId],
    );
    return rows.map(mapSavedSpell);
  }

  private async reload(
    savedSpellId: number,
    characterId: number,
    campaignId: number,
    requestingUserId: number,
  ): Promise<CharacterSavedSpell> {
    const spells = await this.listCharacterSpells(characterId, campaignId, requestingUserId);
    const saved = spells.find(({ id }) => id === savedSpellId);
    if (!saved) throw new Error("The saved Character Spell could not be reloaded.");
    return saved;
  }

  async saveCharacterSpell(input: SaveCharacterSpell): Promise<CharacterSavedSpell> {
    const id = await this.saveInvoker(input);
    return this.reload(id, input.characterId, input.campaignId, input.requestingUserId);
  }

  async setSpellbookStatus(input: SetCharacterSpellbookStatus): Promise<CharacterSavedSpell> {
    const id = await this.statusInvoker(input);
    return this.reload(id, input.characterId, input.campaignId, input.requestingUserId);
  }

  async deleteCharacterSpell(input: DeleteCharacterSpell): Promise<void> {
    await this.deleteInvoker(input);
  }
}

export const characterSpellRepository: CharacterSpellRepository =
  new TauriCharacterSpellRepository();
