import type {
  ItemLibraryFilters,
  ItemLibraryOptions,
  ItemLibraryPage,
  ItemSummary,
} from "../../types/item";

type Props = {
  title: string;
  page: ItemLibraryPage;
  filters: ItemLibraryFilters;
  options: ItemLibraryOptions;
  selectedItemId?: number;
  loading: boolean;
  onFiltersChange: (filters: ItemLibraryFilters) => void;
  onSelect: (item: ItemSummary) => void;
  onNewItem: () => void;
};

export function ItemLibrary({
  title,
  page,
  filters,
  options,
  selectedItemId,
  loading,
  onFiltersChange,
  onSelect,
  onNewItem,
}: Props) {
  const change = (update: Partial<ItemLibraryFilters>, resetPage = true) =>
    onFiltersChange({ ...filters, ...update, page: resetPage ? 1 : filters.page });
  const isWeaponView = filters.view === "weapons";
  const isArmorView = filters.view === "armor";
  const generalView = filters.view === "general-equipment" || filters.view === "inventory";

  return <aside className="skill-library item-library" aria-label={`${title} Library`}>
    <div className="skill-library__heading">
      <div><p>MASTER CONTENT</p><h2>{title}</h2></div>
      <button className="skills-primary-button" type="button" onClick={onNewItem}>+ New</button>
    </div>
    <div className="skill-library__search">
      <label htmlFor={`item-search-${filters.view}`}>Search</label>
      <input id={`item-search-${filters.view}`} type="search" value={filters.search ?? ""} placeholder="Search the catalog" onChange={(event) => change({ search: event.target.value })} />
    </div>
    {isWeaponView && <label className="item-library__improvised-toggle">
      <input type="checkbox" checked={Boolean(filters.includeImprovised)} onChange={(event) => change({ includeImprovised: event.target.checked })} />
      <span>Show Improvised Weapons</span>
    </label>}
    <div className="item-library__filters">
      <label><span>{isWeaponView ? "Weapon Category" : isArmorView ? "Armor Category" : "Category"}</span><select value={filters.category ?? ""} onChange={(event) => change({ category: event.target.value || undefined })}><option value="">All categories</option>{options.categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      {generalView && <label><span>Subtype</span><select value={filters.subtype ?? ""} onChange={(event) => change({ subtype: event.target.value || undefined })}><option value="">All subtypes</option>{options.subtypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      {(isWeaponView || isArmorView) && <label><span>{isWeaponView ? "Damage Type" : "Armor Type"}</span><select value={filters.type ?? ""} onChange={(event) => change({ type: event.target.value || undefined })}><option value="">All types</option>{options.types.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      <label><span>Genre</span><select value={filters.genre ?? ""} onChange={(event) => change({ genre: event.target.value || undefined })}><option value="">All genres</option>{options.genres.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <div className="skill-library__toolbar"><span>{page.total.toLocaleString()} items</span><span>Database-backed view</span></div>
    <div className={`skill-library__results${loading ? " is-loading" : ""}`}>
      {page.items.length === 0 && !loading ? <p className="skill-library__empty">No Items match this catalog view.</p> : page.items.map((item) => {
        const classification = isWeaponView
          ? `${item.weaponCategory || "Uncategorized"} · ${item.damageType || "Type not set"}`
          : isArmorView
            ? `${item.armorCategory || "Uncategorized"} · ${item.armorType || "Type not set"}`
            : `${item.category || "Uncategorized"} · ${item.subtype || "Subtype not set"}`;
        return <button key={item.id} className={`skill-library__row${selectedItemId === item.id ? " is-selected" : ""}`} type="button" aria-pressed={selectedItemId === item.id} onClick={() => onSelect(item)}>
          <span className="skill-library__row-name">{item.name}</span>
          <span className="skill-library__row-meta">{classification}</span>
          <span className="skill-library__row-parents">{item.costCredits.toLocaleString()} Credits · {item.weight.toLocaleString()} weight{item.weaponRole === "improvised" ? " · Improvised profile" : ""}{item.hasWeaponProfile && item.hasArmorProfile ? " · Weapon + Armor" : ""}</span>
        </button>;
      })}
    </div>
    <nav className="skill-library__pagination" aria-label={`${title} pages`}>
      <button type="button" disabled={page.page <= 1 || loading} onClick={() => onFiltersChange({ ...filters, page: page.page - 1 })}>Previous</button>
      <span>Page {page.page} of {page.pageCount}</span>
      <button type="button" disabled={page.page >= page.pageCount || loading} onClick={() => onFiltersChange({ ...filters, page: page.page + 1 })}>Next</button>
    </nav>
  </aside>;
}
