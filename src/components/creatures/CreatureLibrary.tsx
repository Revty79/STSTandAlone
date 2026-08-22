import { SIZE_OPTIONS } from "../../data/sizeOptions";
import type { CreatureLibraryFacets, CreatureLibraryFilters, CreatureLibraryPage, CreatureSummary } from "../../types/creature";

type Props = {
  page: CreatureLibraryPage;
  facets: CreatureLibraryFacets;
  filters: CreatureLibraryFilters;
  selectedCreatureId?: number;
  loading: boolean;
  onFiltersChange: (filters: CreatureLibraryFilters) => void;
  onSelect: (creature: CreatureSummary) => void;
  onNewCreature: () => void;
};

export function CreatureLibrary({ page, facets, filters, selectedCreatureId, loading, onFiltersChange, onSelect, onNewCreature }: Props) {
  const patchFilters = (patch: Partial<CreatureLibraryFilters>) => onFiltersChange({ ...filters, ...patch, page: patch.page ?? 1 });
  return (
    <aside className="skill-library creature-library">
      <header className="skill-library__header"><div><p>MASTER CONTENT</p><h2>Creature Library</h2></div><button type="button" onClick={onNewCreature}>New Creature</button></header>
      <label className="skill-library__search"><span>Search</span><input value={filters.search ?? ""} placeholder="Search by canonical name" onChange={(event) => patchFilters({ search: event.target.value })} /></label>
      <div className="creature-library__filters">
        <label><span>Family</span><select value={filters.family ?? ""} onChange={(event) => patchFilters({ family: event.target.value || undefined })}><option value="">All</option>{facets.families.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Type</span><select value={filters.creatureType ?? ""} onChange={(event) => patchFilters({ creatureType: event.target.value || undefined })}><option value="">All</option>{facets.creatureTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Size</span><select value={filters.size ?? ""} onChange={(event) => patchFilters({ size: event.target.value ? event.target.value as CreatureLibraryFilters["size"] : undefined })}><option value="">All</option>{SIZE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>CR</span><select value={filters.challengeRating ?? ""} onChange={(event) => patchFilters({ challengeRating: event.target.value ? Number(event.target.value) : undefined })}><option value="">All</option>{Array.from({ length: 50 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="skill-library__toolbar creature-library__toolbar"><span>{loading ? "Reading archive…" : `${page.total} creatures`}</span></div>
      <div className={`skill-library__results creature-library__results${loading ? " is-loading" : ""}`} aria-busy={loading}>
        {!loading && page.items.length === 0 ? <p className="skill-library__empty">No Creatures match these filters.</p> : page.items.map((creature) => (
          <button key={creature.id} type="button" className={`skill-library__row creature-library__row${selectedCreatureId === creature.id ? " is-selected" : ""}`} onClick={() => onSelect(creature)}>
            <strong className="skill-library__row-name">{creature.canonicalName}</strong>
          </button>
        ))}
      </div>
      <footer className="skill-library__pagination">
        <button type="button" disabled={page.page <= 1} onClick={() => patchFilters({ page: page.page - 1 })}>Previous</button>
        <span>Page {page.page} of {page.pageCount}</span>
        <button type="button" disabled={page.page >= page.pageCount} onClick={() => patchFilters({ page: page.page + 1 })}>Next</button>
      </footer>
    </aside>
  );
}
