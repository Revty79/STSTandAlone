import { describe, expect, it } from "vitest";
import {
  HEAVENS_CORE_TOOLS,
  HEAVENS_DASHBOARD_TOOLS,
  HEAVENS_FUTURE_TOOLS,
  getHeavensToolDestination,
} from "./heavensDashboardTools";

describe("Heavens dashboard tools", () => {
  it("keeps Creatures and NPCs as separate core systems", () => {
    expect(HEAVENS_CORE_TOOLS.map((tool) => tool.title)).toEqual([
      "Races",
      "Skills",
      "Equipment",
      "Inventory",
      "Creatures",
      "NPCs",
    ]);
    expect(HEAVENS_CORE_TOOLS.map((tool) => tool.id)).toEqual([
      "races",
      "skills",
      "equipment",
      "inventory",
      "creatures",
      "npcs",
    ]);
  });

  it("keeps the two undecided systems in future expansion", () => {
    expect(HEAVENS_FUTURE_TOOLS.map((tool) => tool.title)).toEqual([
      "Genres / Worlds",
      "Game Rules",
    ]);
  });

  it("does not model Magic or Special Abilities as separate systems", () => {
    const titles = HEAVENS_DASHBOARD_TOOLS.map((tool) => tool.title);
    const skills = HEAVENS_CORE_TOOLS.find((tool) => tool.id === "skills");

    expect(titles).not.toContain("Magic & Spells");
    expect(titles).not.toContain("Special Abilities");
    expect(skills?.description).toContain("magical");
    expect(new Set(HEAVENS_DASHBOARD_TOOLS.map((tool) => tool.id)).size).toBe(
      HEAVENS_DASHBOARD_TOOLS.length,
    );
  });

  it("connects completed authoring cards to their real destinations", () => {
    expect(getHeavensToolDestination("races")).toBe("races");
    expect(getHeavensToolDestination("skills")).toBe("skills");
    expect(getHeavensToolDestination("equipment")).toBe("equipment");
    expect(getHeavensToolDestination("inventory")).toBe("inventory");
    expect(getHeavensToolDestination("creatures")).toBe("creatures");
    expect(getHeavensToolDestination("npcs")).toBeNull();
  });
});
