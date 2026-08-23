type Props = {
  availableTags: string[];
  selectedTags: string[];
  onChange: (tags: string[]) => void;
};

export function ItemTagsEditor({ availableTags, selectedTags, onChange }: Props) {
  const allTags = [...new Set([...availableTags, ...selectedTags])];
  return (
    <section className="item-section">
      <div className="item-section__heading"><div><p>CAMPAIGN &amp; GENRE FILTERING</p><h3>Tags</h3></div></div>
      <p className="item-section__description">Select the concepts that apply. Relational storage stays behind this simple authoring control.</p>
      <div className="item-tags__grid">
        {allTags.map((tag) => <label key={tag}><input type="checkbox" checked={selectedTags.includes(tag)} onChange={(event) => onChange(event.target.checked ? [...selectedTags, tag] : selectedTags.filter((value) => value !== tag))} /><span>{tag}</span></label>)}
      </div>
    </section>
  );
}
