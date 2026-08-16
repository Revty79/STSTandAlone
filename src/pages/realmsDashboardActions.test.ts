import { describe, expect, it } from "vitest";
import { REALMS_DASHBOARD_ACTIONS } from "./realmsDashboardActions";

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
});
