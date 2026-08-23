import { useEffect, useState } from "react";
import type { SaveItemAggregate } from "../../types/item";

type Props = {
  draft: SaveItemAggregate;
  dirty: boolean;
  saving: boolean;
  onCreateVariant: (name: string) => void;
};

export function ItemVariantEditor({ draft, dirty, saving, onCreateVariant }: Props) {
  const [variantName, setVariantName] = useState("");
  useEffect(() => setVariantName(""), [draft.id]);
  const canCreate = Boolean(draft.id && variantName.trim() && !dirty && !saving);
  return (
    <section className="item-section item-lineage">
      <div className="item-section__heading"><div><p>COMPLETE INDEPENDENT RECORDS</p><h3>Variants &amp; Lineage</h3></div></div>
      <p className="item-section__description">Create Variant copies this complete Item as a starting point. The copy keeps permanent lineage but does not depend on parent overrides at runtime.</p>
      <div className="item-lineage__parent"><span>{draft.core.parentItemId ? "Derived From" : "Lineage Root"}</span><strong>{draft.core.parentItemName ?? draft.core.name || "Unsaved Item"}</strong><small>{draft.core.parentItemId ? "The parent link and family remain fixed." : "This Item has no parent."}</small></div>
      <div className="item-lineage__creator"><label><span>New Variant Name</span><input value={variantName} placeholder="Example: Titanium Longsword" onChange={(event) => setVariantName(event.target.value)} /></label><button type="button" disabled={!canCreate} onClick={() => { onCreateVariant(variantName.trim()); setVariantName(""); }}>Create Variant</button></div>
      {!draft.id ? <p className="item-lineage__notice">Save this Item before creating a Variant.</p> : null}
      {dirty ? <p className="item-lineage__notice">Save current changes first so the Variant copies the latest complete Item.</p> : null}
      <div className="item-lineage__children"><h4>Created Variants</h4>{draft.variants.length ? draft.variants.map((variant) => <article key={variant.id}><div><strong>{variant.name}</strong><span>{variant.canonicalId}</span></div><b>{variant.catalogScope === "equipment" ? "Equipment" : "Inventory"}</b></article>) : <p className="item-empty-row">No Variants have been created from this Item.</p>}</div>
    </section>
  );
}
