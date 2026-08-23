import type { CreatureHitLocationDraft, CreatureHpPoolDraft } from "../../types/creature";

type Props = {
  hpPools: CreatureHpPoolDraft[];
  hitLocations: CreatureHitLocationDraft[];
  onChange: (hpPools: CreatureHpPoolDraft[], hitLocations: CreatureHitLocationDraft[]) => void;
};

const numericValue = (value: number | null) => value ?? "";
const parseNumber = (value: string) => value === "" ? null : Number(value);

export function CreatureHpChartEditor({ hpPools, hitLocations, onChange }: Props) {
  const visiblePools = hpPools
    .map((row, index) => ({ row, index }))
    .sort((left, right) => left.row.sortOrder - right.row.sortOrder);
  const visibleHitLocations = hitLocations
    .map((row, index) => ({ row, index }))
    .sort((left, right) => left.row.hitLocationNumber - right.row.hitLocationNumber || left.row.sortOrder - right.row.sortOrder);
  const poolByCanonicalId = new Map(visiblePools.map(({ row }) => [row.canonicalId, row]));
  const unusedHitNumber = Array.from({ length: 10 }, (_, index) => index)
    .find((number) => !visibleHitLocations.some(({ row }) => row.hitLocationNumber === number));

  const updatePool = (index: number, patch: Partial<CreatureHpPoolDraft>) => {
    const previous = hpPools[index];
    if (!previous) return;
    const next = { ...previous, ...patch };
    const nextPools = hpPools.map((row, rowIndex) => rowIndex === index ? next : row);
    if (patch.canonicalId !== undefined && patch.canonicalId !== previous.canonicalId) {
      const nextHitLocations = hitLocations.map((row) => (
        row.hpPoolCanonicalId === previous.canonicalId
          ? { ...row, hpPoolCanonicalId: patch.canonicalId || null }
          : row
      ));
      onChange(nextPools, nextHitLocations);
      return;
    }
    onChange(nextPools, hitLocations);
  };

  const removePool = (index: number) => onChange(hpPools.filter((_, rowIndex) => rowIndex !== index), hitLocations);
  const updateHitLocation = (index: number, patch: Partial<CreatureHitLocationDraft>) => {
    onChange(hpPools, hitLocations.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };
  const removeHitLocation = (index: number) => onChange(hpPools, hitLocations.filter((_, rowIndex) => rowIndex !== index));

  return (
    <section className="creature-section creature-hp-chart">
      <header className="creature-section__heading creature-hp-chart__heading">
        <div><p>0–9 ANATOMY MAP</p><h3>HP &amp; Hit Locations</h3></div>
      </header>
      <p className="creature-section__description">HP Pools hold the Creature’s durability. The location chart maps each 0–9 result to a location and its shared pool.</p>

      <div className="creature-chart-block">
        <div className="creature-chart-block__heading"><h4>HP Pools</h4><button type="button" onClick={() => onChange([...hpPools, { canonicalId: "", poolName: "", hpPercentage: null, notes: "", sortOrder: hpPools.length }], hitLocations)}>Add HP Pool</button></div>
        <div className="creature-chart-table-wrap">
          <table className="creature-chart-table creature-hp-pool-table">
            <thead><tr><th>Pool</th><th>HP %</th><th>Used By Results</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {visiblePools.length === 0 ? <tr><td className="creature-chart-table__empty" colSpan={4}>No HP Pools are assigned to this chart.</td></tr> : visiblePools.map(({ row, index }) => {
                const usedBy = visibleHitLocations.filter(({ row: hit }) => hit.hpPoolCanonicalId === row.canonicalId).map(({ row: hit }) => hit.hitLocationNumber);
                const isUsed = usedBy.length > 0;
                return (
                  <tr key={index}>
                    <td><input aria-label={`HP Pool ${index + 1} name`} value={row.poolName} placeholder="Pool name" onChange={(event) => updatePool(index, { poolName: event.target.value })} /></td>
                    <td><input aria-label={`${row.poolName || `HP Pool ${index + 1}`} percentage`} type="number" min="0" max="100" step="0.01" value={numericValue(row.hpPercentage)} onChange={(event) => updatePool(index, { hpPercentage: parseNumber(event.target.value) })} /></td>
                    <td><span className="creature-chart-table__reference">{usedBy.length ? usedBy.join(", ") : "—"}</span></td>
                    <td><button className="is-danger" type="button" disabled={isUsed} title={isUsed ? "Reassign its hit locations before removing this HP Pool." : "Remove HP Pool"} onClick={() => removePool(index)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visiblePools.length ? (
          <details className="creature-chart-details">
            <summary>Pool IDs &amp; notes</summary>
            <div className="creature-chart-details__list">
              {visiblePools.map(({ row, index }) => (
                <div className="creature-chart-details__row" key={`pool-details-${index}`}>
                  <strong>{row.poolName || `HP Pool ${index + 1}`}</strong>
                  <label><span>HP Pool ID</span><input aria-label={`${row.poolName || `HP Pool ${index + 1}`} ID`} value={row.canonicalId} onChange={(event) => updatePool(index, { canonicalId: event.target.value })} /></label>
                  <label><span>Notes</span><textarea aria-label={`${row.poolName || `HP Pool ${index + 1}`} notes`} value={row.notes} onChange={(event) => updatePool(index, { notes: event.target.value })} /></label>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="creature-chart-block">
        <div className="creature-chart-block__heading"><h4>Hit Location Chart</h4><button type="button" disabled={unusedHitNumber === undefined} onClick={() => unusedHitNumber !== undefined && onChange(hpPools, [...hitLocations, { hitLocationNumber: unusedHitNumber, locationName: "", bodyPartsIncluded: "", hpPoolCanonicalId: null, naturalArmor: null, soak: null, locationEffect: "", notes: "", sortOrder: hitLocations.length }])}>Add Hit Location</button></div>
        <div className="creature-chart-table-wrap">
          <table className="creature-chart-table creature-hit-location-table">
            <thead><tr><th>Result</th><th>Location</th><th>HP Pool</th><th>HP %</th><th>Relevance</th><th>Armor</th><th>Soak</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {visibleHitLocations.length === 0 ? <tr><td className="creature-chart-table__empty" colSpan={8}>No hit locations are assigned to this chart.</td></tr> : visibleHitLocations.map(({ row, index }) => {
                const linkedPool = row.hpPoolCanonicalId ? poolByCanonicalId.get(row.hpPoolCanonicalId) : undefined;
                return (
                  <tr key={index}>
                    <td><select aria-label={`${row.locationName || `Hit Location ${index + 1}`} result`} value={row.hitLocationNumber} onChange={(event) => updateHitLocation(index, { hitLocationNumber: Number(event.target.value) })}>{Array.from({ length: 10 }, (_, number) => <option key={number} value={number} disabled={number !== row.hitLocationNumber && visibleHitLocations.some(({ row: other }) => other.hitLocationNumber === number)}>{number}</option>)}</select></td>
                    <td><input aria-label={`Hit Location ${row.hitLocationNumber} name`} value={row.locationName} placeholder="Location" onChange={(event) => updateHitLocation(index, { locationName: event.target.value })} /></td>
                    <td><select aria-label={`${row.locationName || `Hit Location ${row.hitLocationNumber}`} HP Pool`} value={row.hpPoolCanonicalId ?? ""} onChange={(event) => updateHitLocation(index, { hpPoolCanonicalId: event.target.value || null })}><option value="">No pool</option>{visiblePools.filter(({ row: pool }) => pool.canonicalId).map(({ row: pool }) => <option key={pool.canonicalId} value={pool.canonicalId}>{pool.poolName || pool.canonicalId}</option>)}</select></td>
                    <td><span className="creature-chart-table__reference">{linkedPool?.hpPercentage == null ? "—" : `${linkedPool.hpPercentage}%`}</span></td>
                    <td><input aria-label={`${row.locationName || `Hit Location ${row.hitLocationNumber}`} relevance`} value={row.bodyPartsIncluded} placeholder="Body area" onChange={(event) => updateHitLocation(index, { bodyPartsIncluded: event.target.value })} /></td>
                    <td><input aria-label={`${row.locationName || `Hit Location ${row.hitLocationNumber}`} natural armor`} type="number" step="0.01" value={numericValue(row.naturalArmor)} onChange={(event) => updateHitLocation(index, { naturalArmor: parseNumber(event.target.value) })} /></td>
                    <td><input aria-label={`${row.locationName || `Hit Location ${row.hitLocationNumber}`} soak`} type="number" step="0.01" value={numericValue(row.soak)} onChange={(event) => updateHitLocation(index, { soak: parseNumber(event.target.value) })} /></td>
                    <td><button className="is-danger" type="button" onClick={() => removeHitLocation(index)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleHitLocations.length ? (
          <details className="creature-chart-details">
            <summary>Location effects &amp; notes</summary>
            <div className="creature-chart-details__list">
              {visibleHitLocations.map(({ row, index }) => (
                <div className="creature-chart-details__row" key={`hit-details-${index}`}>
                  <strong>Result {row.hitLocationNumber}: {row.locationName || "Unnamed location"}</strong>
                  <label><span>Location Effect</span><textarea aria-label={`Result ${row.hitLocationNumber} location effect`} value={row.locationEffect} onChange={(event) => updateHitLocation(index, { locationEffect: event.target.value })} /></label>
                  <label><span>Notes</span><textarea aria-label={`Result ${row.hitLocationNumber} notes`} value={row.notes} onChange={(event) => updateHitLocation(index, { notes: event.target.value })} /></label>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
