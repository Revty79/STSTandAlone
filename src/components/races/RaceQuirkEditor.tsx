import type { RaceCoreDraft } from "../../types/race";

type Props = { core: RaceCoreDraft; onChange: (core: RaceCoreDraft) => void };

export function RaceQuirkEditor({ core, onChange }: Props) {
  const update = (change: Partial<RaceCoreDraft>) => onChange({ ...core, ...change });
  return (
    <div className="race-form race-form__long-fields">
      <div className="skill-editor__intro">
        <p>The racial quirk remains a Race mechanic and is not converted into a Skill.</p>
      </div>
      <label><span>Racial Quirk Name</span><input value={core.racialQuirkName} onChange={(event) => update({ racialQuirkName: event.target.value })} /></label>
      <label><span>Success Effect</span><textarea rows={8} value={core.quirkSuccessEffect} onChange={(event) => update({ quirkSuccessEffect: event.target.value })} /></label>
      <label><span>Failure Effect</span><textarea rows={8} value={core.quirkFailureEffect} onChange={(event) => update({ quirkFailureEffect: event.target.value })} /></label>
    </div>
  );
}
