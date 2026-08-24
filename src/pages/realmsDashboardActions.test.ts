import { describe, expect, it } from "vitest";
import {
  REALMS_DASHBOARD_ACTIONS,
  canOpenCharacterCreation,
} from "./realmsDashboardActions";

describe("Realms dashboard actions", () => {
  it("contains the five approved player actions exactly once", () => {
    const titles = REALMS_DASHBOARD_ACTIONS.map((action) => action.title);

    expect(titles).toEqual([
      "Character Sheet",
      "Advance Character",
      "Skills",
      "Inventory & Equipment",
      "Magic & Spells",
    ]);
    expect(new Set(REALMS_DASHBOARD_ACTIONS.map((action) => action.id)).size).toBe(
      REALMS_DASHBOARD_ACTIONS.length,
    );
  });

  it("opens Character creation only for a selected unfinished G.O.D.-created record", () => {
    const unfinished = {
      id: 31, campaignId: 12, playerUserId: 2, name: "New Character",
      createdAt: "created", updatedAt: "updated", creationCompletedAt: null,
    };
    expect(canOpenCharacterCreation("", unfinished)).toBe(false);
    expect(canOpenCharacterCreation("12", undefined)).toBe(false);
    expect(canOpenCharacterCreation("12", unfinished)).toBe(true);
    expect(canOpenCharacterCreation("12", {
      ...unfinished,
      creationCompletedAt: "completed",
    })).toBe(false);
  });
});
