import type { ItemCoreDraft } from "../../types/item";
import { GenreTagEditor } from "./GenreTagEditor";

type Props = {
  core: ItemCoreDraft;
  genreTags: string[];
  onCoreChange: (core: ItemCoreDraft) => void;
  onGenreTagsChange: (genreTags: string[]) => void;
};

export function GeneralItemEditor({
  core,
  genreTags,
  onCoreChange,
  onGenreTagsChange,
}: Props) {
  const set = <Key extends keyof ItemCoreDraft>(key: Key, value: ItemCoreDraft[Key]) =>
    onCoreChange({ ...core, [key]: value });

  return (
    <section className="item-editor-section">
      <div className="item-editor-section__heading">
        <div><p>UNIVERSAL IDENTITY</p><h3>Item Details</h3></div>
      </div>
      <p className="item-editor-section__note">
        These fields belong to the single Item record used by Equipment, Inventory,
        and any optional combat profiles.
      </p>
      <div className="item-form__grid">
        <label className="item-form__wide">
          <span>Name</span>
          <input value={core.name} onChange={(event) => set("name", event.target.value)} />
        </label>
        <label>
          <span>Catalog Scope</span>
          <select value={core.catalogScope} onChange={(event) => set("catalogScope", event.target.value)}>
            <option value="equipment">Equipment</option>
            <option value="inventory">Inventory</option>
          </select>
        </label>
        <label>
          <span>Timeline Tag</span>
          <input value={core.timelineTag} onChange={(event) => set("timelineTag", event.target.value)} />
        </label>
        <label>
          <span>Cost (Credits)</span>
          <input type="number" min="0" step="any" value={core.costCredits} onChange={(event) => set("costCredits", Number(event.target.value))} />
        </label>
        <label>
          <span>Weight</span>
          <input type="number" min="0" step="any" value={core.weight} onChange={(event) => set("weight", Number(event.target.value))} />
        </label>
        <label>
          <span>Category</span>
          <input value={core.category} onChange={(event) => set("category", event.target.value)} />
        </label>
        <label>
          <span>Subtype</span>
          <input value={core.subtype} onChange={(event) => set("subtype", event.target.value)} />
        </label>
        <GenreTagEditor value={genreTags} onChange={onGenreTagsChange} />
        <label className="item-form__wide">
          <span>Effect</span>
          <textarea value={core.effectDescription} onChange={(event) => set("effectDescription", event.target.value)} />
        </label>
        <label className="item-form__wide">
          <span>Narrative / Variant Notes</span>
          <textarea value={core.narrativeVariantNotes} onChange={(event) => set("narrativeVariantNotes", event.target.value)} />
        </label>
      </div>
    </section>
  );
}
