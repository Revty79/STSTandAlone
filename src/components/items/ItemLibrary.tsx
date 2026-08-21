import type { ItemLibraryFilters, ItemLibraryOptions, ItemLibraryPage, ItemSummary } from "../../types/item";

type Props = {
  title: string;
  page: ItemLibraryPage;
  filters: ItemLibraryFilters;
  options: ItemLibraryOptions;
  selectedItemId?: number;
  loading: boolean;
  onFiltersChange: (filters: ItemLibraryFilters) => void;
  onSelect: (item: ItemSummary) => void;
  onNew: () => void;
};

export function ItemLibrary({ title, page, filters, options, selectedItemId, loading, onFiltersChange, onSelect, onNew }: Props) {
  const change = (update: Partial<ItemLibraryFilters>, resetPage = true) => onFiltersChange({ ...filters, ...update, page: resetPage ? 1 : filters.page });
  return <aside className="skill-library item-library" aria-label={`${title} Library`}>
    <div className="skill-library__heading"><div><p>MASTER CONTENT</p><h2>{title}</h2></div><button className="skills-primary-button" type="button" onClick={onNew}>New Item</button></div>
    <div className="skill-library__search"><label htmlFor="item-search">Search</label><input id="item-search" type="search" value={filters.search ?? ""} placeholder="Search by name or category" onChange={(event) => change({ search: event.target.value })} /></div>
    <div className="skill-library__filters item-library__filters">
      <label><span>Category</span><select value={filters.category ?? ""} onChange={(event) => change({ category: event.target.value || undefined })}><option value="">All</option>{options.categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      {(filters.view === "inventory" || filters.view === "general-equipment") && <label><span>Subtype</span><select value={filters.subtype ?? ""} onChange={(event) => change({ subtype: event.target.value || undefined })}><option value="">All</option>{options.subtypes.map((value) => <option key={value}>{value}</option>)}</select></label>}
      {(filters.view === "weapons" || filters.view === "armor") && <label><span>Type</span><select value={filters.type ?? ""} onChange={(event) => change({ type: event.target.value || undefined })}><option value="">All</option>{options.types.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label><span>Genre</span><select value={filters.genre ?? ""} onChange={(event) => change({ genre: event.target.value || undefined })}><option value="">All</option>{options.genres.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    {filters.view === "weapons" && <label className="catalog-toggle"><input type="checkbox" checked={Boolean(filters.includeImprovised)} onChange={(event) => change({ includeImprovised: event.target.checked })} /><span>Show Improvised Weapons</span></label>}
    {filters.view === "inventory" && <label className="catalog-toggle"><input type="checkbox" checked={Boolean(filters.purchasableCreaturesOnly)} onChange={(event) => change({ purchasableCreaturesOnly: event.target.checked })} /><span>Purchasable Creatures</span></label>}
    <div className="skill-library__toolbar"><span>{page.total.toLocaleString()} items</span><span>Database-backed view</span></div>
    <div className={`skill-library__results${loading ? " is-loading" : ""}`}>
      {!loading && !page.items.length ? <p className="skill-library__empty">No Items match this catalog view.</p> : page.items.map((item) => <button key={item.id} type="button" className={`skill-library__row${selectedItemId === item.id ? " is-selected" : ""}`} aria-pressed={selectedItemId === item.id} onClick={() => onSelect(item)}>
        <span className="skill-library__row-name">{item.name}</span>
        <span className="skill-library__row-meta">{item.category || "Uncategorized"}{item.subtype ? ` · ${item.subtype}` : ""} · {item.costCredits === null ? "Cost unknown" : `${item.costCredits.toLocaleString()} credits`}</span>
        <span className="skill-library__row-parents">{item.genreTags.join(" · ") || "No genre tags"}{item.hasPurchaseCreatureLink ? " · Creature purchase" : ""}</span>
      </button>)}
    </div>
    <nav className="skill-library__pagination" aria-label="Item pages"><button type="button" disabled={page.page <= 1 || loading} onClick={() => change({ page: page.page - 1 }, false)}>Previous</button><span>Page {page.page} of {page.pageCount}</span><button type="button" disabled={page.page >= page.pageCount || loading} onClick={() => change({ page: page.page + 1 }, false)}>Next</button></nav>
  </aside>;
}
