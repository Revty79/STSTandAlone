import { SIZE_OPTIONS } from "../../data/sizeOptions";
import { calculateCreatureChallengeRating } from "../../features/creatures/challengeRating";
import type { ChallengeRatingReference, SaveCreatureAggregate } from "../../types/creature";

type Props = {
  draft: SaveCreatureAggregate;
  challengeRatings: ChallengeRatingReference[];
  onChange: (draft: SaveCreatureAggregate) => void;
};

const ratingText = (value: number | null) => value === null ? "Not scored" : `CR ${value}`;

export function CreatureOverviewEditor({ draft, challengeRatings, onChange }: Props) {
  const core = draft.core;
  const updateCore = (patch: Partial<typeof core>) => onChange({ ...draft, core: { ...core, ...patch } });
  const calculation = calculateCreatureChallengeRating(draft, challengeRatings);
  const reference = challengeRatings.find((row) => row.challengeRating === calculation.finalRating);

  return (
    <div className="creature-overview">
      <section className="creature-section">
        <div className="creature-section__heading"><div><p>CANONICAL RECORD</p><h3>Overview</h3></div></div>
        {core.parentCreatureId ? <p className="creature-overview__lineage">Derived from <strong>{core.parentCreatureName}</strong>. The Variant ID and family are managed by the system.</p> : null}
        <div className="creature-overview__grid">
          <label><span>Creature ID</span><input value={core.canonicalId} readOnly={Boolean(core.parentCreatureId)} onChange={(event) => updateCore({ canonicalId: event.target.value })} /></label>
          <label><span>Canonical Name</span><input value={core.canonicalName} onChange={(event) => updateCore({ canonicalName: event.target.value })} /></label>
          <label><span>Family</span><input value={core.family} readOnly={Boolean(core.parentCreatureId)} onChange={(event) => updateCore({ family: event.target.value })} /></label>
          <label><span>Creature Type</span><input value={core.creatureType} onChange={(event) => updateCore({ creatureType: event.target.value })} /></label>
          <label><span>Size</span><select value={core.size} onChange={(event) => updateCore({ size: event.target.value as typeof core.size })}>{SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></label>
          <label><span>Calculated CR</span><output>{calculation.calculatedRating}</output></label>
          <label><span>Final CR</span><output>{calculation.finalRating}</output></label>
          <label><span>Kill XP</span><output>{calculation.killXp}</output></label>
          <label><span>G.O.D. Adjustment</span><input type="number" min={-49} max={49} step={1} value={core.challengeRatingAdjustment} onChange={(event) => updateCore({ challengeRatingAdjustment: Number(event.target.value) || 0 })} /></label>
          <label className="creature-field--wide"><span>Adjustment Reason</span><input value={core.challengeRatingAdjustmentReason} disabled={core.challengeRatingAdjustment === 0} placeholder={core.challengeRatingAdjustment === 0 ? "No adjustment applied" : "Explain the exceptional threat"} onChange={(event) => updateCore({ challengeRatingAdjustmentReason: event.target.value })} /></label>
        </div>
        <div className="creature-overview__long-fields">
          <label><span>Description</span><textarea value={core.description} onChange={(event) => updateCore({ description: event.target.value })} /></label>
          <label><span>Typical Behavior</span><textarea value={core.typicalBehavior} onChange={(event) => updateCore({ typicalBehavior: event.target.value })} /></label>
          <label><span>Habitat / Ecology</span><textarea value={core.habitatEcology} onChange={(event) => updateCore({ habitatEcology: event.target.value })} /></label>
          <label><span>Notes</span><textarea value={core.notes} onChange={(event) => updateCore({ notes: event.target.value })} /></label>
        </div>
      </section>

      <section className="creature-section creature-cr-reference">
        <div className="creature-section__heading"><div><p>TRANSPARENT CALCULATION</p><h3>Challenge Rating {calculation.finalRating}</h3></div></div>
        <dl className="creature-cr-breakdown">
          <div><dt>Attack Accuracy</dt><dd>{ratingText(calculation.accuracyRating)}</dd></div>
          <div><dt>Attack Damage</dt><dd>{ratingText(calculation.damageRating)}</dd></div>
          <div><dt>Offense</dt><dd>CR {calculation.offenseRating}</dd></div>
          <div><dt>Protection</dt><dd>CR {calculation.defenseRating}</dd></div>
          <div><dt>Initiative</dt><dd>{ratingText(calculation.initiativeRating)}</dd></div>
          <div><dt>Mobility Lift</dt><dd>+{calculation.mobilityBonus}</dd></div>
          <div><dt>Abilities &amp; Defenses</dt><dd>+{calculation.specialImpact}</dd></div>
          <div><dt>G.O.D. Adjustment</dt><dd>{calculation.adjustment >= 0 ? "+" : ""}{calculation.adjustment}</dd></div>
        </dl>
        {reference ? <>
          <h4>{reference.threatBand} reference</h4>
          <dl>
            <div><dt>Attack Target</dt><dd>{reference.attackTargetGuidance || "—"}</dd></div>
            <div><dt>Damage</dt><dd>{reference.damageGuidance || "—"}</dd></div>
            <div><dt>Initiative</dt><dd>{reference.initiativeGuidance || "—"}</dd></div>
            <div><dt>Soak</dt><dd>{reference.soakGuidance || "—"}</dd></div>
            <div><dt>HP / Toughness</dt><dd>{reference.hpToughnessGuidance || "—"}</dd></div>
          </dl>
          {reference.exampleNotes ? <p>{reference.exampleNotes}</p> : null}
        </> : <p className="race-empty-row">Challenge Rating reference data is unavailable.</p>}
        <small>Version 1 uses the strongest measurable offense or protection as its baseline. Protection uses the stronger of Natural Armor or Soak at each location, then adds limited mobility and explicitly authored special-mechanic impact. Every adjustment remains visible.</small>
      </section>
    </div>
  );
}
