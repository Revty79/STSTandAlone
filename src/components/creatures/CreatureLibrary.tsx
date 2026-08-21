import type { CreatureLibraryFilters, CreatureLibraryOptions, CreatureLibraryPage, CreatureSummary } from "../../types/creature";

type Props = { page: CreatureLibraryPage; filters: CreatureLibraryFilters; options: CreatureLibraryOptions; selectedCreatureId?: number; loading: boolean; onFiltersChange: (filters: CreatureLibraryFilters) => void; onSelect: (creature: CreatureSummary) => void; onNew: () => void };

export function CreatureLibrary({ page, filters, options, selectedCreatureId, loading, onFiltersChange, onSelect, onNew }: Props) {
  const change = (update: Partial<CreatureLibraryFilters>, reset = true) => onFiltersChange({ ...filters, ...update, page: reset ? 1 : filters.page });
  return <aside className="skill-library creature-library" aria-label="Creature Library">
    <div className="skill-library__heading"><div><p>MASTER CONTENT</p><h2>Creature Library</h2></div><button className="skills-primary-button" type="button" onClick={onNew}>New Creature</button></div>
    <div className="skill-library__search"><label htmlFor="creature-search">Search</label><input id="creature-search" type="search" value={filters.search ?? ""} placeholder="Name or alt name" onChange={(event) => change({ search: event.target.value })} /></div>
    <div className="skill-library__filters creature-library__filters">
      {(["type", "role", "size", "genre"] as const).map((key) => <label key={key}><span>{key[0].toUpperCase() + key.slice(1)}</span><select value={filters[key] ?? ""} onChange={(event) => change({ [key]: event.target.value || undefined })}><option value="">All</option>{options[`${key === "genre" ? "genres" : `${key}s`}` as keyof CreatureLibraryOptions].map((value) => <option key={value}>{value}</option>)}</select></label>)}
    </div>
    <div className="skill-library__toolbar"><span>{page.total.toLocaleString()} creatures</span><span>Lightweight library</span></div>
    <div className={`skill-library__results${loading ? " is-loading" : ""}`}>{!loading && !page.items.length ? <p className="skill-library__empty">No Creatures match this library view.</p> : page.items.map((creature) => <button key={creature.id} type="button" className={`skill-library__row${selectedCreatureId === creature.id ? " is-selected" : ""}`} aria-pressed={selectedCreatureId === creature.id} onClick={() => onSelect(creature)}><span className="skill-library__row-name">{creature.name}</span><span className="skill-library__row-meta">{creature.type || "Type not set"} · {creature.role || "Role not set"} · {creature.size || "Size not set"}</span><span className="skill-library__row-parents">{creature.attackCount} attacks · {creature.skillLinkCount} Skills · {creature.purchaseItemCount} purchase listings</span></button>)}</div>
    <nav className="skill-library__pagination" aria-label="Creature pages"><button type="button" disabled={page.page <= 1 || loading} onClick={() => change({ page: page.page - 1 }, false)}>Previous</button><span>Page {page.page} of {page.pageCount}</span><button type="button" disabled={page.page >= page.pageCount || loading} onClick={() => change({ page: page.page + 1 }, false)}>Next</button></nav>
  </aside>;
}
