import type { SaveRaceAggregate } from "../../types/race";

type Props = { draft: SaveRaceAggregate };

function TextSection({ title, value }: { title: string; value: string }) {
  if (!value.trim()) return null;
  return <section><h4>{title}</h4><p>{value}</p></section>;
}

export function RacePreview({ draft }: Props) {
  const { core } = draft;
  const bonuses = draft.skillLinks.filter((link) => link.linkType.toLocaleLowerCase() === "bonus");
  const granted = draft.skillLinks.filter((link) => link.linkType.toLocaleLowerCase() === "granted");
  return (
    <article className="skill-preview race-preview">
      <header><p>SERRIAN TIDE RACE</p><h3>{core.name || "Untitled Race"}</h3></header>
      <dl className="skill-preview__facts race-preview__facts">
        <div><dt>Age</dt><dd>{core.ageRangeText || (core.ageMin !== null || core.ageMax !== null ? `${core.ageMin ?? "?"}–${core.ageMax ?? "?"}` : "Not set")}</dd></div>
        <div><dt>Size</dt><dd>{core.size || "Not set"}</dd></div>
        <div><dt>Base Magic</dt><dd>{core.baseMagic ?? "Not set"}</dd></div>
      </dl>

      <TextSection title="Legacy Description" value={core.legacyDescription} />
      <TextSection title="Physical Characteristics" value={core.physicalCharacteristics} />
      <TextSection title="Physical Description" value={core.physicalDescription} />

      <section><h4>Attribute Caps</h4>
        {draft.attributeCaps.length ? <dl className="race-preview__mechanics">{draft.attributeCaps.map((cap, index) => <div key={`${cap.attributeKey}-${index}`}><dt>{cap.attributeKey}</dt><dd>{cap.maxValue}</dd></div>)}</dl> : <p>None assigned.</p>}
      </section>
      <section><h4>Movement</h4>
        {draft.movementModes.length ? <ul className="race-preview__list">{draft.movementModes.map((movement, index) => <li key={`${movement.movementMode}-${index}`}><strong>{movement.movementMode}</strong> {movement.baseValue}{movement.notes ? <span>{movement.notes}</span> : null}</li>)}</ul> : <p>None assigned.</p>}
      </section>

      {(core.racialQuirkName || core.quirkSuccessEffect || core.quirkFailureEffect) && <section>
        <h4>Racial Quirk</h4>
        <h5>{core.racialQuirkName || "Unnamed Quirk"}</h5>
        <dl className="skill-preview__text-facts">
          <div><dt>Success Effect</dt><dd>{core.quirkSuccessEffect || "None recorded."}</dd></div>
          <div><dt>Failure Effect</dt><dd>{core.quirkFailureEffect || "None recorded."}</dd></div>
        </dl>
      </section>}

      <section><h4>Skill Bonuses</h4>
        {bonuses.length ? <ul className="race-preview__list">{bonuses.map((link) => <li key={`bonus-${link.skillId}`}><strong>{link.skillName}</strong><b>{link.value === null ? "—" : `${link.value >= 0 ? "+" : ""}${link.value}`}</b></li>)}</ul> : <p>None assigned.</p>}
      </section>
      <section><h4>Granted Skills / Racial Abilities</h4>
        {granted.length ? <ul className="race-preview__list">{granted.map((link) => <li key={`granted-${link.skillId}`}><strong>{link.skillName}</strong>{link.value !== null ? <b>{link.value} points</b> : null}</li>)}</ul> : <p>None assigned.</p>}
      </section>

      <TextSection title="Common Languages Known" value={core.commonLanguagesKnown} />
      <TextSection title="Common Archetypes" value={core.commonArchetypes} />
      <TextSection title="Examples of Use in Different Genres" value={core.genreExamples} />
      <TextSection title="Cultural Mindset" value={core.culturalMindset} />
      <TextSection title="Outlook On Magic" value={core.outlookOnMagic} />
    </article>
  );
}
