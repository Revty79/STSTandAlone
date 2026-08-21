import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemPreview } from "../components/items/ItemPreview";
import type { AuthSession } from "../types/user";
import { USER_ROLE } from "../types/user";
import { EquipmentPage } from "./EquipmentPage";
import { InventoryPage } from "./InventoryPage";
import { newItemDraft } from "./ItemCatalogPage";

const session: AuthSession = { isAuthenticated: true, userId: 1, username: "Owner", roles: [USER_ROLE.GOD, USER_ROLE.PLAYER] };

describe("Equipment and Inventory catalog pages", () => {
  it("renders the three Equipment sections and the improvised-weapon control", () => {
    const markup = renderToStaticMarkup(<EquipmentPage session={session} onBack={vi.fn()} onLogout={vi.fn()} />);
    for (const label of ["Weapons", "Armor", "General Equipment", "Show Improvised Weapons", "Back to The Heavens", "Log Out"]) {
      expect(markup).toContain(label);
    }
  });

  it("renders Inventory as master authoring rather than character ownership", () => {
    const markup = renderToStaticMarkup(<InventoryPage session={session} onBack={vi.fn()} onLogout={vi.fn()} />);
    expect(markup).toContain("Inventory Catalog");
    expect(markup).toContain("MASTER CONTENT");
    expect(markup).not.toContain("Equipped Slot");
    expect(newItemDraft(1, "inventory").core.catalogScope).toBe("inventory");
  });

  it("prepares the correct optional profile for each Equipment creation path", () => {
    expect(newItemDraft(1, "weapons")).toMatchObject({ weaponProfile: { weaponRole: "primary" }, armorProfile: null });
    expect(newItemDraft(1, "armor")).toMatchObject({ weaponProfile: null, armorProfile: { soak: 0 } });
    expect(newItemDraft(1, "general-equipment")).toMatchObject({ weaponProfile: null, armorProfile: null });
  });

  it("previews one Item with both optional profiles", () => {
    const draft = newItemDraft(1, "weapons");
    draft.core.name = "Spiked Shield";
    draft.genreTags = ["Fantasy"];
    draft.weaponProfile!.weaponCategory = "Exotic";
    draft.weaponProfile!.damage = 8;
    draft.armorProfile = { areaCovered: "Arms", soak: 2, armorCategory: "Shield", armorType: "Steel", encumbrancePenalty: -2, armorEffectDescription: "Block", armorNarrativeNotes: "", sourceSystem: null, sourceExternalId: null };
    const markup = renderToStaticMarkup(<ItemPreview draft={draft} />);
    for (const value of ["Spiked Shield", "Weapon Profile", "Armor Profile", "Exotic", "Shield", "Fantasy"]) expect(markup).toContain(value);
  });
});
