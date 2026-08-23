import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemArmorProfileEditor } from "../components/items/ItemArmorProfileEditor";
import { ItemEditor } from "../components/items/ItemEditor";
import { ItemLibrary } from "../components/items/ItemLibrary";
import { ItemPropertiesEditor } from "../components/items/ItemPropertiesEditor";
import { ItemTagsEditor } from "../components/items/ItemTagsEditor";
import { ItemWeaponProfileEditor } from "../components/items/ItemWeaponProfileEditor";
import { TEMPORARY_ITEM_CATALOG } from "../data/temporaryItemCatalog";
import { USER_ROLE, type AuthSession } from "../types/user";
import { EquipmentPage, InventoryPage, itemAggregateToDraft, newItemDraft } from "./ItemsPage";

const godSession: AuthSession = {
  isAuthenticated: true,
  userId: 7,
  username: "Voyager",
  roles: [USER_ROLE.GOD],
};

const noItems = vi.fn(async () => []);
const noCreatures = vi.fn(async () => []);

describe("G.O.D. Item authoring windows", () => {
  it("renders Equipment and Inventory as visibly separate Heavens destinations", () => {
    const equipment = renderToStaticMarkup(<EquipmentPage session={godSession} onBack={vi.fn()} onLogout={vi.fn()} />);
    const inventory = renderToStaticMarkup(<InventoryPage session={godSession} onBack={vi.fn()} onLogout={vi.fn()} />);

    expect(equipment).toContain("THE HEAVENS / EQUIPMENT");
    expect(equipment).toContain("Equipment Catalog");
    expect(equipment).toContain("Weapons");
    expect(equipment).toContain("Armor");
    expect(equipment).toContain("General Equipment");
    expect(inventory).toContain("THE HEAVENS / INVENTORY");
    expect(inventory).toContain("Inventory Catalog");
    expect(inventory).not.toContain("Equipment groups");
    expect(equipment).toContain("SHARED ITEM EDITOR");
    expect(inventory).toContain("SHARED ITEM EDITOR");
  });

  it("uses one shared editor with optional specialized profile tabs", () => {
    const weapon = itemAggregateToDraft(TEMPORARY_ITEM_CATALOG[0]!);
    const markup = renderToStaticMarkup(
      <ItemEditor
        draft={weapon}
        references={{ tags: ["Universal"], armorBodyLocations: [] }}
        saving={false}
        dirty={true}
        feedback={null}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCreateVariant={vi.fn()}
        findItems={noItems}
        findCreatures={noCreatures}
      />,
    );

    for (const label of ["Overview", "Properties", "Weapon", "Tags", "Variants"]) expect(markup).toContain(`>${label}<`);
    expect(markup).not.toContain(">Armor</button>");
    expect(markup).toContain("Add Armor Profile");
    expect(markup).toContain("Unsaved changes");
    expect(markup).toContain("Save Item");
    expect(markup).toContain("Delete");
  });

  it("keeps Weapon fields together without Armor clutter", () => {
    const profile = TEMPORARY_ITEM_CATALOG[0]!.weaponProfile!;
    const markup = renderToStaticMarkup(<ItemWeaponProfileEditor profile={profile} onChange={vi.fn()} onRemove={vi.fn()} findItems={noItems} />);

    for (const label of ["Weapon Type", "Handedness", "Damage Source", "Damage", "Damage Type", "Range", "Reach", "Ammunition Reference", "Compatibility", "Capacity", "Fire Modes", "Rate of Fire", "Reload Initiative", "Rules Text"]) expect(markup).toContain(label);
    expect(markup).not.toContain("Base Soak");
    expect(markup).not.toContain("Body Shot Bob Locations");
  });

  it("keeps Armor fields together and waits for canonical Body Shot Bob locations", () => {
    const profile = TEMPORARY_ITEM_CATALOG[1]!.armorProfile!;
    const markup = renderToStaticMarkup(<ItemArmorProfileEditor profile={profile} bodyLocations={[]} onChange={vi.fn()} onRemove={vi.fn()} />);

    for (const label of ["Armor Type", "Coverage", "Base Soak", "Damage Modifiers", "Body Shot Bob Locations", "Rules Text"]) expect(markup).toContain(label);
    expect(markup).toContain("upcoming database/reference provider must supply the canonical choices");
    expect(markup).not.toContain("Handedness");
    expect(markup).not.toContain("Fire Modes");
  });

  it("supports repeatable Properties and canonical Creature relationships", () => {
    const properties = TEMPORARY_ITEM_CATALOG[6]!.properties;
    const markup = renderToStaticMarkup(<ItemPropertiesEditor itemId={7} properties={properties} onChange={vi.fn()} findItems={noItems} findCreatures={noCreatures} />);

    expect(markup).toContain("Add Property");
    expect(markup).toContain("Property Name");
    expect(markup).toContain("Quantity");
    expect(markup).toContain("Related Creature");
    expect(markup).toContain(">Dog<");
    expect(markup).toContain("Creature statistics are not duplicated here.");
  });

  it("presents campaign and genre Tags as simple selections", () => {
    const markup = renderToStaticMarkup(<ItemTagsEditor availableTags={["Universal", "Fantasy", "Sci-Fi"]} selectedTags={["Fantasy"]} onChange={vi.fn()} />);
    expect(markup).toContain("CAMPAIGN &amp; GENRE FILTERING");
    expect(markup).toContain("Universal");
    expect(markup).toContain("Fantasy");
    expect(markup).toContain("Sci-Fi");
    expect(markup).toContain('checked=""');
  });

  it("creates neutral drafts without any player-instance state", () => {
    const equipment = newItemDraft(7, "equipment");
    const inventory = newItemDraft(7, "inventory");

    expect(equipment.core).toMatchObject({ catalogScope: "equipment", equipmentGroup: "general", durability: null });
    expect(inventory.core).toMatchObject({ catalogScope: "inventory", equipmentGroup: null, durability: null });
    for (const forbidden of ["ownerId", "quantityOwned", "currentDurability", "equipped", "characterId"]) {
      expect(forbidden in equipment.core).toBe(false);
      expect(forbidden in inventory.core).toBe(false);
    }
  });

  it("does not ask the G.O.D. to assign an Item ID", () => {
    const inventory = newItemDraft(7, "inventory");
    const markup = renderToStaticMarkup(
      <ItemEditor
        draft={inventory}
        references={{ tags: [], armorBodyLocations: [] }}
        saving={false}
        dirty={false}
        feedback={null}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCreateVariant={vi.fn()}
        findItems={noItems}
        findCreatures={noCreatures}
      />,
    );

    expect(markup).toContain("Assigned automatically when saved");
    expect(markup).toContain("The program assigns this ID.");
    expect(markup).toContain("readOnly");
    expect(markup).not.toContain("Item ID / Canonical ID");
  });

  it("offers search and all requested basic catalog filters", () => {
    const markup = renderToStaticMarkup(
      <ItemLibrary
        catalogScope="inventory"
        page={{ items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 }}
        facets={{ recordTypes: ["Consumable"], categories: ["Food"], tags: ["Universal"] }}
        filters={{ catalogScope: "inventory", page: 1, pageSize: 40 }}
        loading={false}
        onFiltersChange={vi.fn()}
        onSelect={vi.fn()}
        onNewItem={vi.fn()}
      />,
    );
    for (const label of ["Search", "Record Type", "Category", "Tag", "New Item"]) expect(markup).toContain(label);
  });
});
