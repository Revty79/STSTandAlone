import type {
  RaceLibraryFilters,
  RaceLibraryPage,
  RaceSummary,
} from "../../types/race";
import { isSize, SIZE_OPTIONS } from "../../data/sizeOptions";

type RaceLibraryProps = {
  page: RaceLibraryPage;
  filters: RaceLibraryFilters;
  selectedRaceId?: number;
  loading: boolean;
  onFiltersChange: (filters: RaceLibraryFilters) => void;
  onSelect: (race: RaceSummary) => void;
  onNewRace: () => void;
};

export function RaceLibrary({
  page,
  filters,
  selectedRaceId,
  loading,
  onFiltersChange,
  onSelect,
  onNewRace,
}: RaceLibraryProps) {
  const changeFilter = (update: Partial<RaceLibraryFilters>, resetPage = true) =>
    onFiltersChange({ ...filters, ...update, page: resetPage ? 1 : filters.page });

  return (
    <aside className="skill-library race-library" aria-label="Race Library">
      <div className="skill-library__heading">
        <div>
          <p>MASTER CONTENT</p>
          <h2>Race Library</h2>
        </div>
        <button className="skills-primary-button" type="button" onClick={onNewRace}>
          New Race
        </button>
      </div>

      <div className="skill-library__search">
        <label htmlFor="race-search">Search</label>
        <input
          id="race-search"
          type="search"
          value={filters.search ?? ""}
          placeholder="Search by name"
          onChange={(event) => changeFilter({ search: event.target.value })}
        />
      </div>

      <div className="race-library__filter">
        <label>
          <span>Size</span>
          <select
            value={filters.size ?? ""}
            onChange={(event) => {
              const size = event.target.value;
              changeFilter({ size: isSize(size) ? size : undefined });
            }}
          >
            <option value="">All sizes</option>
            {SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="skill-library__toolbar">
        <span>{page.total.toLocaleString()} races</span>
        <span>Lightweight library</span>
      </div>

      <div className={`skill-library__results${loading ? " is-loading" : ""}`}>
        {page.items.length === 0 && !loading ? (
          <p className="skill-library__empty">No races match this library view.</p>
        ) : page.items.map((race) => (
          <button
            key={race.id}
            className={`skill-library__row${selectedRaceId === race.id ? " is-selected" : ""}`}
            type="button"
            aria-pressed={selectedRaceId === race.id}
            onClick={() => onSelect(race)}
          >
            <span className="skill-library__row-name">{race.name}</span>
            <span className="skill-library__row-meta">
              {race.size || "Size not set"} · {race.ageRangeText || "Age not set"}
            </span>
            <span className="skill-library__row-parents">
              {race.attributeCapCount} caps · {race.movementModeCount} movement · {race.skillLinkCount} Skills
            </span>
          </button>
        ))}
      </div>

      <nav className="skill-library__pagination" aria-label="Race pages">
        <button
          type="button"
          disabled={page.page <= 1 || loading}
          onClick={() => onFiltersChange({ ...filters, page: page.page - 1 })}
        >
          Previous
        </button>
        <span>Page {page.page} of {page.pageCount}</span>
        <button
          type="button"
          disabled={page.page >= page.pageCount || loading}
          onClick={() => onFiltersChange({ ...filters, page: page.page + 1 })}
        >
          Next
        </button>
      </nav>
    </aside>
  );
}
