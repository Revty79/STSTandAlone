import type { ItemPropertyDraft, RelatedCreatureCandidate, RelatedItemCandidate } from "../../types/item";
import { ItemRelationPicker } from "./ItemRelationPicker";

type Props = {
  itemId?: number;
  properties: ItemPropertyDraft[];
  onChange: (properties: ItemPropertyDraft[]) => void;
  findItems: (search: string, excludeItemId?: number) => Promise<RelatedItemCandidate[]>;
  findCreatures: (search: string) => Promise<RelatedCreatureCandidate[]>;
};

type RelationKind = ItemPropertyDraft["relationKind"];
const numberValue = (value: number | null): number | "" => value ?? "";
const parseNumber = (value: string): number | null => value === "" ? null : Number(value);

export function ItemPropertiesEditor({ itemId, properties, onChange, findItems, findCreatures }: Props) {
  const update = (index: number, patch: Partial<ItemPropertyDraft>) => onChange(properties.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= properties.length) return;
    const next = [...properties];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const setRelationKind = (index: number, kind: RelationKind) => update(index, {
    relationKind: kind,
    relatedItemId: null,
    relatedItemName: null,
    relatedCreatureCanonicalId: null,
    relatedCreatureName: null,
  });

  return (
    <section className="item-section">
      <div className="item-section__heading">
        <div><p>FLEXIBLE SUPPORTING FACTS</p><h3>Properties</h3></div>
        <button type="button" onClick={() => onChange([...properties, { propertyName: "", value: "", unit: "", quantity: null, relationKind: "none", relatedItemId: null, relatedItemName: null, relatedCreatureCanonicalId: null, relatedCreatureName: null, notes: "", sortOrder: properties.length }])}>Add Property</button>
      </div>
      <p className="item-section__description">Use repeatable Properties for ordinary facts and canonical relationships that do not require a specialized profile.</p>
      <div className="item-repeat-list">
        {properties.length === 0 ? <p className="item-empty-row">No Properties are assigned.</p> : properties.map((row, index) => {
          const kind = row.relationKind;
          return (
            <article className="item-repeat-row" key={index}>
              <header><strong>{row.propertyName || `Property ${index + 1}`}</strong><div className="item-repeat-row__actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move Property ${index + 1} up`}>↑</button><button type="button" disabled={index === properties.length - 1} onClick={() => move(index, 1)} aria-label={`Move Property ${index + 1} down`}>↓</button><button type="button" onClick={() => onChange(properties.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div></header>
              <div className="item-repeat-row__fields">
                <label><span>Property Name</span><input value={row.propertyName} onChange={(event) => update(index, { propertyName: event.target.value })} /></label>
                <label><span>Value</span><input value={row.value} onChange={(event) => update(index, { value: event.target.value })} /></label>
                <label><span>Unit</span><input value={row.unit} onChange={(event) => update(index, { unit: event.target.value })} /></label>
                <label><span>Quantity</span><input type="number" min="0" step="any" value={numberValue(row.quantity)} onChange={(event) => update(index, { quantity: parseNumber(event.target.value) })} /></label>
                <label><span>Relationship</span><select value={kind} onChange={(event) => setRelationKind(index, event.target.value as RelationKind)}><option value="none">None</option><option value="item">Related Item</option><option value="creature">Related Creature</option></select></label>
                {kind === "item" ? <ItemRelationPicker kind="item" label="Canonical Item" selectedName={row.relatedItemName} findItems={(search) => findItems(search, itemId)} onSelect={(candidate) => update(index, { relatedItemId: candidate?.id ?? null, relatedItemName: candidate?.name ?? null })} /> : null}
                {kind === "creature" ? <ItemRelationPicker kind="creature" label="Canonical Creature" selectedName={row.relatedCreatureName} findCreatures={findCreatures} onSelect={(candidate) => update(index, { relatedCreatureCanonicalId: candidate?.canonicalId ?? null, relatedCreatureName: candidate?.name ?? null })} /> : null}
                <label className="item-field--wide"><span>Notes</span><textarea value={row.notes} onChange={(event) => update(index, { notes: event.target.value })} /></label>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
