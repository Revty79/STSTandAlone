import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ItemLibraryPage, ItemSummary } from "../../types/item";
import { ItemLibrary } from "./ItemLibrary";

const options = { categories: ["Sword", "Club"], subtypes: [], types: ["Slashing", "Bludgeoning"], genres: ["Fantasy"] };
const item = (overrides: Partial<ItemSummary>): ItemSummary => ({
  id: 1, name: "Longsword", catalogScope: "equipment", timelineTag: "",
  costCredits: 100, category: "", subtype: "", weight: 4, updatedAt: "now",
  genreTags: ["Fantasy"], weaponRole: "primary", weaponCategory: "Sword",
  damageType: "Slashing", armorCategory: null, armorType: null,
  hasWeaponProfile: true, hasArmorProfile: false, ...overrides,
});
const page = (items: ItemSummary[]): ItemLibraryPage => ({ items, total: items.length, page: 1, pageSize: 40, pageCount: 1 });

describe("ItemLibrary improvised Weapon presentation", () => {
  it("shows the explicit control while the default result set remains purpose-built", () => {
    const markup = renderToStaticMarkup(<ItemLibrary
      title="Weapons" page={page([item({})])}
      filters={{ view: "weapons", page: 1, pageSize: 40 }} options={options}
      loading={false} onFiltersChange={vi.fn()} onSelect={vi.fn()} onNewItem={vi.fn()}
    />);
    expect(markup).toContain("Show Improvised Weapons");
    expect(markup).toContain("Longsword");
    expect(markup).not.toContain("Crowbar");
  });

  it("can display an improvised profile when that mode is enabled", () => {
    const markup = renderToStaticMarkup(<ItemLibrary
      title="Weapons" page={page([item({ id: 2, name: "Crowbar", weaponRole: "improvised", weaponCategory: "Club", damageType: "Bludgeoning" })])}
      filters={{ view: "weapons", includeImprovised: true, page: 1, pageSize: 40 }} options={options}
      loading={false} onFiltersChange={vi.fn()} onSelect={vi.fn()} onNewItem={vi.fn()}
    />);
    expect(markup).toContain("checked");
    expect(markup).toContain("Crowbar");
    expect(markup).toContain("Improvised profile");
  });

  it("presents an ordinary improvised-profile Item in General Equipment", () => {
    const markup = renderToStaticMarkup(<ItemLibrary
      title="General Equipment" page={page([item({ id: 2, name: "Crowbar", category: "Tool", subtype: "Utility", weaponRole: "improvised", weaponCategory: "Club", damageType: "Bludgeoning" })])}
      filters={{ view: "general-equipment", page: 1, pageSize: 40 }} options={{ ...options, subtypes: ["Utility"] }}
      loading={false} onFiltersChange={vi.fn()} onSelect={vi.fn()} onNewItem={vi.fn()}
    />);
    expect(markup).toContain("Crowbar");
    expect(markup).toContain("Tool");
    expect(markup).toContain("Utility");
    expect(markup).toContain("Improvised profile");
  });
});
