import { describe, expect, it } from "vitest";
import {
  HEAVENS_CORE_TOOLS,
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

  it("does not render undecided or duplicate systems as dashboard tools", () => {
    const titles = HEAVENS_CORE_TOOLS.map((tool) => tool.title);
    const skills = HEAVENS_CORE_TOOLS.find((tool) => tool.id === "skills");

    expect(titles).not.toContain("Genres / Worlds");
    expect(titles).not.toContain("Genres");
    expect(titles).not.toContain("Game Rules");
    expect(titles).not.toContain("Magic & Spells");
    expect(titles).not.toContain("Special Abilities");
    expect(skills?.description).toContain("magical");
    expect(new Set(HEAVENS_CORE_TOOLS.map((tool) => tool.id)).size).toBe(
      HEAVENS_CORE_TOOLS.length,
    );
  });

  it("connects the implemented library cards to their real destinations", () => {
    expect(getHeavensToolDestination("races")).toBe("races");
    expect(getHeavensToolDestination("skills")).toBe("skills");
    expect(getHeavensToolDestination("creatures")).toBe("creatures");
    expect(getHeavensToolDestination("equipment")).toBe("equipment");
    expect(getHeavensToolDestination("inventory")).toBe("inventory");
  });
});
