import type { RaceCoreDraft } from "../../types/race";

type Props = { core: RaceCoreDraft; onChange: (core: RaceCoreDraft) => void };

export function RaceCultureEditor({ core, onChange }: Props) {
  const update = (change: Partial<RaceCoreDraft>) => onChange({ ...core, ...change });
  return (
    <div className="race-form race-form__long-fields">
      <div className="skill-editor__intro">
        <p>Flexible setting and play guidance preserved without creating new Languages, Archetypes, or Genres systems.</p>
      </div>
      <label><span>Common Languages Known</span><textarea rows={4} value={core.commonLanguagesKnown} onChange={(event) => update({ commonLanguagesKnown: event.target.value })} /></label>
      <label><span>Common Archetypes</span><textarea rows={4} value={core.commonArchetypes} onChange={(event) => update({ commonArchetypes: event.target.value })} /></label>
      <label><span>Examples of Use in Different Genres</span><textarea rows={7} value={core.genreExamples} onChange={(event) => update({ genreExamples: event.target.value })} /></label>
      <label><span>Cultural Mindset</span><textarea rows={8} value={core.culturalMindset} onChange={(event) => update({ culturalMindset: event.target.value })} /></label>
      <label><span>Outlook On Magic</span><textarea rows={6} value={core.outlookOnMagic} onChange={(event) => update({ outlookOnMagic: event.target.value })} /></label>
    </div>
  );
}
