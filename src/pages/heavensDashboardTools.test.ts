import { describe, expect, it } from "vitest";
import { HEAVENS_DASHBOARD_TOOLS } from "./heavensDashboardTools";

describe("Heavens dashboard tools", () => {
  it("contains the nine approved creation libraries exactly once", () => {
    const titles = HEAVENS_DASHBOARD_TOOLS.map((tool) => tool.title);

    expect(titles).toEqual([
      "Races",
      "Skills",
      "Magic & Spells",
      "Equipment",
      "Inventory",
      "Special Abilities",
      "Genres / Worlds",
      "Creatures & NPCs",
      "Game Rules",
    ]);
    expect(new Set(HEAVENS_DASHBOARD_TOOLS.map((tool) => tool.id)).size).toBe(
      HEAVENS_DASHBOARD_TOOLS.length,
    );
  });
});
