import { useMemo, useState } from "react";
import type { CampaignInventoryItem } from "../../features/campaign-prototype/campaignPrototype";
import type { ItemTagReference } from "../../types/item";

type Props = {
  genres: readonly ItemTagReference[];
  genresLoading: boolean;
  genresError: string;
  selectedGenres: readonly string[];
  availableItems: readonly CampaignInventoryItem[];
  itemsLoading: boolean;
  itemsError: string;
  campaignItems: readonly CampaignInventoryItem[];
  onSelectedGenresChange: (genres: string[]) => void;
  onCampaignItemsChange: (items: CampaignInventoryItem[]) => void;
};

export function CampaignInventorySelector({
  genres,
  genresLoading,
  genresError,
  selectedGenres,
  availableItems,
  itemsLoading,
  itemsError,
  campaignItems,
  onSelectedGenresChange,
  onCampaignItemsChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "weapon" | "armor" | "general" | "inventory">("all");
  const [activeAvailableId, setActiveAvailableId] = useState<number | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);
  const campaignItemIds = useMemo(
    () => new Set(campaignItems.map((item) => item.id)),
    [campaignItems],
  );
  const unselectedItems = useMemo(
    () => availableItems.filter((item) => !campaignItemIds.has(item.id)),
    [availableItems, campaignItemIds],
  );
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const catalogItems = unselectedItems.filter((item) => catalogFilter === "all"
      || (catalogFilter === "inventory" && item.catalogScope === "inventory")
      || (catalogFilter !== "inventory" && item.equipmentGroup === catalogFilter));
    if (!query) return catalogItems;
    return catalogItems.filter((item) =>
      [item.name, item.canonicalId, item.recordType, item.family, item.category, item.equipmentGroup ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [catalogFilter, search, unselectedItems]);

  function addItems(items: readonly CampaignInventoryItem[]) {
    if (items.length === 0) return;
    const next = [...campaignItems];
    const ids = new Set(next.map((item) => item.id));
    for (const item of items) {
      if (!ids.has(item.id)) {
        ids.add(item.id);
        next.push(item);
      }
    }
    onCampaignItemsChange(next);
    setActiveAvailableId(null);
  }

  function removeItems(itemIds: readonly number[]) {
    const ids = new Set(itemIds);
    onCampaignItemsChange(campaignItems.filter((item) => !ids.has(item.id)));
    setActiveCampaignId(null);
  }

  function toggleGenre(genre: string) {
    setSearch("");
    setActiveAvailableId(null);
    onSelectedGenresChange(
      selectedGenres.includes(genre)
        ? selectedGenres.filter((candidate) => candidate !== genre)
        : [...selectedGenres, genre],
    );
  }

  return (
    <div className="campaign-inventory">
      <div className="campaign-inventory__genre-toolbar">
        <span>{selectedGenres.length} genres selected</span>
        <div>
          <button
            type="button"
            disabled={genresLoading || genres.length === 0}
            onClick={() => onSelectedGenresChange(genres.map((genre) => genre.name))}
          >
            Select All
          </button>
          <button
            type="button"
            disabled={selectedGenres.length === 0}
            onClick={() => onSelectedGenresChange([])}
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="campaign-inventory__genres" aria-label="Item genres">
        {genresLoading ? <p>Reading item genres…</p> : null}
        {!genresLoading && genresError ? <p role="status">{genresError}</p> : null}
        {!genresLoading && !genresError && genres.length === 0 ? (
          <p>No item genres are currently available.</p>
        ) : null}
        {!genresLoading && !genresError
          ? genres.map((genre) => {
              const selected = selectedGenres.includes(genre.name);
              return <label
                className={selected ? "is-selected" : ""}
                key={genre.name}
                title={genre.description}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleGenre(genre.name)}
                />
                <span><strong>{genre.name}</strong><small>{genre.tagGroup}</small></span>
              </label>;
            })
          : null}
      </div>

      {selectedGenres.length === 0 ? (
        <p className="campaign-inventory__prompt">
          Choose one or more genres above to combine their tagged Equipment and Inventory.
        </p>
      ) : (
        <>
          <label className="campaign-inventory__search">
            <span>Search Available Equipment & Inventory</span>
            <input
              type="search"
              value={search}
              placeholder="Search selected genres"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <nav className="campaign-inventory__catalog-tabs" aria-label="Available item type">
            {([
              ["all", "All"],
              ["weapon", "Weapons"],
              ["armor", "Armor"],
              ["general", "General Equipment"],
              ["inventory", "Inventory"],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                className={catalogFilter === value ? "is-active" : ""}
                key={value}
                onClick={() => setCatalogFilter(value)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="campaign-inventory__transfer">
            <section aria-labelledby="available-inventory-heading">
              <header>
                <h4 id="available-inventory-heading">Available in Selected Genres</h4>
                <span>{filteredItems.length} shown</span>
              </header>
              <div className="campaign-inventory__item-list" aria-busy={itemsLoading}>
                {itemsLoading ? <p>Reading matching Items…</p> : null}
                {!itemsLoading && itemsError ? <p role="status">{itemsError}</p> : null}
                {!itemsLoading && !itemsError && filteredItems.length === 0 ? (
                  <p>{unselectedItems.length === 0 ? "All matching Items have been added." : "No Items match that search."}</p>
                ) : null}
                {!itemsLoading && !itemsError
                  ? filteredItems.map((item) => (
                      <button
                        className={activeAvailableId === item.id ? "is-active" : ""}
                        type="button"
                        key={item.id}
                        title={`Double-click to add ${item.name}`}
                        onClick={() => setActiveAvailableId(item.id)}
                        onDoubleClick={() => addItems([item])}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.canonicalId} · {item.equipmentGroup ?? "Inventory"} · {item.category}</span>
                      </button>
                    ))
                  : null}
              </div>
            </section>

            <div className="campaign-inventory__transfer-actions">
              <button
                type="button"
                disabled={!activeAvailableId}
                onClick={() => {
                  const item = availableItems.find((candidate) => candidate.id === activeAvailableId);
                  if (item) addItems([item]);
                }}
              >
                Add Selected →
              </button>
              <button
                type="button"
                disabled={unselectedItems.length === 0 || itemsLoading}
                onClick={() => addItems(unselectedItems)}
              >
                Move All →
              </button>
              <button
                type="button"
                disabled={!activeCampaignId}
                onClick={() => activeCampaignId && removeItems([activeCampaignId])}
              >
                ← Remove Selected
              </button>
              <button
                type="button"
                disabled={campaignItems.length === 0}
                onClick={() => onCampaignItemsChange([])}
              >
                Clear Campaign Items
              </button>
            </div>

            <section aria-labelledby="campaign-inventory-heading">
              <header>
                <h4 id="campaign-inventory-heading">Available in Campaign</h4>
                <span>{campaignItems.length} selected</span>
              </header>
              <div className="campaign-inventory__item-list">
                {campaignItems.length === 0 ? (
                  <p>Double-click an Item on the left or use the move buttons.</p>
                ) : campaignItems.map((item) => (
                  <button
                    className={activeCampaignId === item.id ? "is-active" : ""}
                    type="button"
                    key={item.id}
                    title={`Double-click to remove ${item.name}`}
                    onClick={() => setActiveCampaignId(item.id)}
                    onDoubleClick={() => removeItems([item.id])}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.canonicalId} · {item.equipmentGroup ?? "Inventory"} · {item.category}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <p className="campaign-inventory__hint">
            Double-click Items to move them between lists. Selected Items will be linked to the saved Campaign.
          </p>
        </>
      )}
    </div>
  );
}
