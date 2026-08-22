import { SIZE_OPTIONS } from "../../data/sizeOptions";
import type { ChallengeRatingReference, SaveCreatureAggregate } from "../../types/creature";

type Props = {
  draft: SaveCreatureAggregate;
  challengeReference?: ChallengeRatingReference;
  onChange: (draft: SaveCreatureAggregate) => void;
};

export function CreatureOverviewEditor({ draft, challengeReference, onChange }: Props) {
  const core = draft.core;
  const updateCore = (patch: Partial<typeof core>) => onChange({ ...draft, core: { ...core, ...patch } });
  return (
    <div className="creature-overview">
      <section className="creature-section">
        <div className="creature-section__heading"><div><p>CANONICAL RECORD</p><h3>Overview</h3></div></div>
        <div className="creature-overview__grid">
          <label><span>Creature ID</span><input value={core.canonicalId} onChange={(event) => updateCore({ canonicalId: event.target.value })} /></label>
          <label><span>Canonical Name</span><input value={core.canonicalName} onChange={(event) => updateCore({ canonicalName: event.target.value })} /></label>
          <label><span>Family</span><input value={core.family} onChange={(event) => updateCore({ family: event.target.value })} /></label>
          <label><span>Creature Type</span><input value={core.creatureType} onChange={(event) => updateCore({ creatureType: event.target.value })} /></label>
          <label><span>Size</span><select value={core.size} onChange={(event) => updateCore({ size: event.target.value as typeof core.size })}>{SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></label>
          <label><span>Challenge Rating <small>Blank remains unresolved</small></span><select value={core.challengeRating ?? ""} onChange={(event) => updateCore({ challengeRating: event.target.value === "" ? null : Number(event.target.value) })}><option value="">Unresolved</option>{Array.from({ length: 50 }, (_, index) => index + 1).map((cr) => <option key={cr} value={cr}>{cr}</option>)}</select></label>
          <label><span>Kill XP <small>Blank remains unresolved</small></span><input type="number" min={0} step={1} value={core.killXp ?? ""} onChange={(event) => updateCore({ killXp: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        </div>
        <div className="creature-overview__long-fields">
          <label><span>Description</span><textarea value={core.description} onChange={(event) => updateCore({ description: event.target.value })} /></label>
          <label><span>Typical Behavior</span><textarea value={core.typicalBehavior} onChange={(event) => updateCore({ typicalBehavior: event.target.value })} /></label>
          <label><span>Habitat / Ecology</span><textarea value={core.habitatEcology} onChange={(event) => updateCore({ habitatEcology: event.target.value })} /></label>
          <label><span>Notes</span><textarea value={core.notes} onChange={(event) => updateCore({ notes: event.target.value })} /></label>
        </div>
      </section>

      <section className="creature-section creature-cr-reference">
        <div className="creature-section__heading"><div><p>BUILDING REFERENCE</p><h3>Challenge Rating {core.challengeRating ?? "Unresolved"}</h3></div></div>
        {challengeReference ? <>
          <dl>
            <div><dt>Threat Band</dt><dd>{challengeReference.threatBand || "—"}</dd></div>
            <div><dt>Attack Target</dt><dd>{challengeReference.attackTargetGuidance || "—"}</dd></div>
            <div><dt>Damage</dt><dd>{challengeReference.damageGuidance || "—"}</dd></div>
            <div><dt>Initiative</dt><dd>{challengeReference.initiativeGuidance || "—"}</dd></div>
            <div><dt>Soak</dt><dd>{challengeReference.soakGuidance || "—"}</dd></div>
            <div><dt>HP / Toughness</dt><dd>{challengeReference.hpToughnessGuidance || "—"}</dd></div>
            <div><dt>Reference XP</dt><dd>{challengeReference.killXp ?? "Unresolved"}</dd></div>
          </dl>
          {challengeReference.exampleNotes ? <p>{challengeReference.exampleNotes}</p> : null}
        </> : <p className="race-empty-row">CR reference data is unavailable.</p>}
        <small>This is authored guidance, not an automatic stat formula or validation wall.</small>
      </section>
    </div>
  );
}
