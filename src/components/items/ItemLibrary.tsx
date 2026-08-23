import type {
  EquipmentCatalogGroup,
  ItemCatalogScope,
  ItemLibraryFacets,
  ItemLibraryFilters,
  ItemLibraryPage,
  ItemSummary,
} from "../../types/item";

type Props = {
  catalogScope: ItemCatalogScope;
  page: ItemLibraryPage;
  facets: ItemLibraryFacets;
  filters: ItemLibraryFilters;
  selectedItemId?: number;
  loading: boolean;
  onFiltersChange: (filters: ItemLibraryFilters) => void;
  onSelect: (item: ItemSummary) => void;
  onNewItem: () => void;
};

const EQUIPMENT_GROUPS: readonly { value: EquipmentCatalogGroup | ""; label: string }[] = [
  { value: "", label: "All Equipment" },
  { value: "weapon", label: "Weapons" },
  { value: "armor", label: "Armor" },
  { value: "general", label: "General Equipment" },
];

export function ItemLibrary({ catalogScope, page, facets, filters, selectedItemId, loading, onFiltersChange, onSelect, onNewItem }: Props) {
  const title = catalogScope === "equipment" ? "Equipment Catalog" : "Inventory Catalog";
  const patchFilters = (patch: Partial<ItemLibraryFilters>) => onFiltersChange({ ...filters, ...patch, page: patch.page ?? 1 });
  return (
    <aside className="skill-library item-library">
      <header className="skill-library__heading"><div><p>MASTER ITEM CATALOG</p><h2>{title}</h2></div><button type="button" onClick={onNewItem}>New Item</button></header>
      {catalogScope === "equipment" ? <nav className="item-library__groups" aria-label="Equipment groups">{EQUIPMENT_GROUPS.map((group) => <button key={group.label} type="button" className={(filters.equipmentGroup ?? "") === group.value ? "is-active" : ""} aria-pressed={(filters.equipmentGroup ?? "") === group.value} onClick={() => patchFilters({ equipmentGroup: group.value || undefined })}>{group.label}</button>)}</nav> : null}
      <label className="skill-library__search"><span>Search</span><input value={filters.search ?? ""} placeholder="Search name or canonical ID" onChange={(event) => patchFilters({ search: event.target.value })} /></label>
      <div className="item-library__filters">
        <label><span>Record Type</span><select value={filters.recordType ?? ""} onChange={(event) => patchFilters({ recordType: event.target.value || undefined })}><option value="">All</option>{facets.recordTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Category</span><select value={filters.category ?? ""} onChange={(event) => patchFilters({ category: event.target.value || undefined })}><option value="">All</option>{facets.categories.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Tag</span><select value={filters.tag ?? ""} onChange={(event) => patchFilters({ tag: event.target.value || undefined })}><option value="">All</option>{facets.tags.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="skill-library__toolbar item-library__toolbar"><span>{loading ? "Reading Item catalog…" : `${page.total} items`}</span><em>SQLite archive</em></div>
      <div className={`skill-library__results item-library__results${loading ? " is-loading" : ""}`} aria-busy={loading}>
        {!loading && page.items.length === 0 ? <p className="skill-library__empty">No Items match these filters.</p> : page.items.map((item) => <button key={item.id} type="button" className={`skill-library__row item-library__row${selectedItemId === item.id ? " is-selected" : ""}`} onClick={() => onSelect(item)}><strong className="skill-library__row-name">{item.name}</strong><span className="skill-library__row-meta">{item.recordType}{item.category ? ` · ${item.category}` : ""}</span><span className="item-library__profiles">{item.hasWeaponProfile ? "Weapon Profile" : ""}{item.hasWeaponProfile && item.hasArmorProfile ? " · " : ""}{item.hasArmorProfile ? "Armor Profile" : ""}</span></button>)}
      </div>
      <footer className="skill-library__pagination"><button type="button" disabled={page.page <= 1} onClick={() => patchFilters({ page: page.page - 1 })}>Previous</button><span>Page {page.page} of {page.pageCount}</span><button type="button" disabled={page.page >= page.pageCount} onClick={() => patchFilters({ page: page.page + 1 })}>Next</button></footer>
    </aside>
  );
}
