import { describe, expect, it, vi } from "vitest";
import { createEmptySpell } from "../../features/spell-construction/utilities/spellFactory";
import type { CharacterDatabase } from "./characterRepository";
import { TauriCharacterSpellRepository } from "./characterSpellRepository";

describe("TauriCharacterSpellRepository", () => {
  it("lists only ownership-scoped Spells and reloads each native mutation", async () => {
    const spell = { ...createEmptySpell(), id: "spell-one", name: "Tidal Light" };
    let inSpellbook = 0;
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const database: CharacterDatabase = {
      async select<T>(query: string, values: unknown[] = []): Promise<T> {
        calls.push({ query, values });
        return [{
          id: 7,
          characterId: 9,
          documentId: spell.id,
          name: spell.name,
          tradition: spell.tradition,
          documentJson: JSON.stringify(spell),
          inSpellbook,
          createdAt: "created",
          updatedAt: "updated",
        }] as T;
      },
      async execute() { return { rowsAffected: 0 }; },
    };
    const saveInvoker = vi.fn(async () => 7);
    const statusInvoker = vi.fn(async (input: { inSpellbook: boolean }) => {
      inSpellbook = input.inSpellbook ? 1 : 0;
      return 7;
    });
    const deleteInvoker = vi.fn(async () => 7);
    const repository = new TauriCharacterSpellRepository(
      async () => database,
      saveInvoker,
      statusInvoker,
      deleteInvoker,
    );

    await expect(repository.listCharacterSpells(9, 12, 2)).resolves.toMatchObject([
      { id: 7, characterId: 9, document: { id: "spell-one", name: "Tidal Light" }, inSpellbook: false },
    ]);
    expect(calls[0]?.values).toEqual([9, 12, 2]);
    expect(calls[0]?.query).toMatch(/character\.player_user_id=\$3 AND character\.is_npc=0/i);

    const saveInput = {
      characterId: 9,
      campaignId: 12,
      requestingUserId: 2,
      documentJson: JSON.stringify(spell),
      addToSpellbook: false,
    };
    await repository.saveCharacterSpell(saveInput);
    expect(saveInvoker).toHaveBeenCalledWith(saveInput);

    const statusInput = {
      savedSpellId: 7,
      characterId: 9,
      campaignId: 12,
      requestingUserId: 2,
      inSpellbook: true,
    };
    await expect(repository.setSpellbookStatus(statusInput)).resolves.toMatchObject({ inSpellbook: true });
    expect(statusInvoker).toHaveBeenCalledWith(statusInput);

    const deleteInput = {
      savedSpellId: 7,
      characterId: 9,
      campaignId: 12,
      requestingUserId: 2,
    };
    await repository.deleteCharacterSpell(deleteInput);
    expect(deleteInvoker).toHaveBeenCalledWith(deleteInput);
  });
});
