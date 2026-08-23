import type { ItemCatalogScope, SaveItemAggregate } from "../../types/item";

type Props = {
  draft: SaveItemAggregate;
  onChange: (draft: SaveItemAggregate) => void;
};

const numberValue = (value: number | null): number | "" => value ?? "";
const parseNumber = (value: string): number | null => value === "" ? null : Number(value);

export function ItemOverviewEditor({ draft, onChange }: Props) {
  const core = draft.core;
  const updateCore = (patch: Partial<typeof core>) => onChange({ ...draft, core: { ...core, ...patch } });
  const changeScope = (catalogScope: ItemCatalogScope) => updateCore({
    catalogScope,
    equipmentGroup: catalogScope === "equipment" ? core.equipmentGroup ?? "general" : null,
  });

  return (
    <section className="item-section">
      <div className="item-section__heading"><div><p>ONE CATALOG OBJECT</p><h3>Overview</h3></div></div>
      <p className="item-section__description">Identity, organization, physical definition, and universal credit value stay together in one understandable Item editor.</p>
      {core.parentItemId ? <p className="item-overview__lineage">Variant of <strong>{core.parentItemName}</strong>. This is a complete Item record with permanent lineage, not an inherited override.</p> : null}
      <div className="item-overview__grid">
        <label><span>Item ID / Canonical ID</span><input value={core.canonicalId} onChange={(event) => updateCore({ canonicalId: event.target.value })} /></label>
        <label><span>Name</span><input value={core.name} onChange={(event) => updateCore({ name: event.target.value })} /></label>
        <label><span>Catalog Scope</span><select value={core.catalogScope} onChange={(event) => changeScope(event.target.value as ItemCatalogScope)}><option value="equipment">Equipment</option><option value="inventory">Inventory</option></select></label>
        {core.catalogScope === "equipment" ? <label><span>Equipment Browse Group</span><select value={core.equipmentGroup ?? "general"} onChange={(event) => updateCore({ equipmentGroup: event.target.value as typeof core.equipmentGroup })}><option value="weapon">Weapons</option><option value="armor">Armor</option><option value="general">General Equipment</option></select></label> : null}
        <label><span>Record Type</span><input value={core.recordType} placeholder="Weapon, Tool, Consumable…" onChange={(event) => updateCore({ recordType: event.target.value })} /></label>
        <label><span>Family</span><input value={core.family} readOnly={Boolean(core.parentItemId)} onChange={(event) => updateCore({ family: event.target.value })} /></label>
        <label><span>Category</span><input value={core.category} onChange={(event) => updateCore({ category: event.target.value })} /></label>
        <label><span>Subtype</span><input value={core.subtype} onChange={(event) => updateCore({ subtype: event.target.value })} /></label>
        <label><span>Weight</span><input type="number" min="0" step="any" value={numberValue(core.weight)} onChange={(event) => updateCore({ weight: parseNumber(event.target.value) })} /></label>
        <label><span>Weight Unit</span><input value={core.weightUnit} placeholder="lb" onChange={(event) => updateCore({ weightUnit: event.target.value })} /></label>
        <label><span>Size</span><input value={core.size} onChange={(event) => updateCore({ size: event.target.value })} /></label>
        <label><span>Base Durability / Item HP</span><input type="number" min="0" step="any" value={numberValue(core.durability)} onChange={(event) => updateCore({ durability: parseNumber(event.target.value) })} /><small>Catalog definition only. This is never current durability.</small></label>
        <label><span>Credits</span><input type="number" min="0" step="any" value={numberValue(core.credits)} onChange={(event) => updateCore({ credits: parseNumber(event.target.value) })} /></label>
        <label><span>Price Basis</span><input value={core.priceBasis} placeholder="each, meal, day…" onChange={(event) => updateCore({ priceBasis: event.target.value })} /></label>
      </div>
      <label className="item-overview__description"><span>Description</span><textarea value={core.description} onChange={(event) => updateCore({ description: event.target.value })} /></label>
    </section>
  );
}
