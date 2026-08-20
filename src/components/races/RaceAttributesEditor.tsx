import type {
  RaceAttributeCapDraft,
  RaceCoreDraft,
  RaceMovementModeDraft,
} from "../../types/race";
import { STANDARD_RACE_ATTRIBUTES } from "../../data/raceOptions";

type Props = {
  core: RaceCoreDraft;
  attributeCaps: RaceAttributeCapDraft[];
  movementModes: RaceMovementModeDraft[];
  onCoreChange: (core: RaceCoreDraft) => void;
  onAttributeCapsChange: (caps: RaceAttributeCapDraft[]) => void;
  onMovementModesChange: (modes: RaceMovementModeDraft[]) => void;
};

const MOVEMENT_SUGGESTIONS = ["Land", "Swim", "Flight"];

function move<T>(values: T[], from: number, offset: number): T[] {
  const to = from + offset;
  if (to < 0 || to >= values.length) return values;
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function RaceAttributesEditor({
  core,
  attributeCaps,
  movementModes,
  onCoreChange,
  onAttributeCapsChange,
  onMovementModesChange,
}: Props) {
  const setCap = (index: number, change: Partial<RaceAttributeCapDraft>) =>
    onAttributeCapsChange(attributeCaps.map((cap, current) => current === index ? { ...cap, ...change } : cap));
  const setMovement = (index: number, change: Partial<RaceMovementModeDraft>) =>
    onMovementModesChange(movementModes.map((mode, current) => current === index ? { ...mode, ...change } : mode));

  return (
    <div className="race-mechanics-editor">
      <datalist id="race-attribute-suggestions">
        {STANDARD_RACE_ATTRIBUTES.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="race-movement-suggestions">
        {MOVEMENT_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
      </datalist>

      <section className="race-editor-section">
        <div className="race-editor-section__heading">
          <div><p>RACIAL LIMITS</p><h3>Attribute Caps</h3></div>
          <button type="button" onClick={() => onAttributeCapsChange([
            ...attributeCaps,
            { attributeKey: "", maxValue: 50, sortOrder: attributeCaps.length },
          ])}>Add Attribute</button>
        </div>
        <p className="race-editor-section__note">Suggested keys are available, and custom module attributes remain valid.</p>
        <div className="race-repeat-list">
          {attributeCaps.length === 0 ? <p className="race-empty-row">No attribute caps assigned.</p> : null}
          {attributeCaps.map((cap, index) => (
            <div className="race-repeat-row race-repeat-row--cap" key={`${index}-${cap.attributeKey}`}>
              <label><span>Attribute</span><input list="race-attribute-suggestions" value={cap.attributeKey} onChange={(event) => setCap(index, { attributeKey: event.target.value })} /></label>
              <label><span>Maximum</span><input type="number" value={cap.maxValue} onChange={(event) => setCap(index, { maxValue: Number(event.target.value) })} /></label>
              <div className="race-repeat-row__actions">
                <button type="button" disabled={index === 0} onClick={() => onAttributeCapsChange(move(attributeCaps, index, -1))}>Up</button>
                <button type="button" disabled={index === attributeCaps.length - 1} onClick={() => onAttributeCapsChange(move(attributeCaps, index, 1))}>Down</button>
                <button className="is-danger" type="button" onClick={() => onAttributeCapsChange(attributeCaps.filter((_, current) => current !== index))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="race-editor-section">
        <div className="race-editor-section__heading">
          <div><p>MAGICAL BASELINE</p><h3>Base Magic</h3></div>
        </div>
        <label className="race-base-magic">
          <span>Base Magic</span>
          <input type="number" value={core.baseMagic ?? ""} onChange={(event) => onCoreChange({ ...core, baseMagic: event.target.value === "" ? null : Number(event.target.value) })} />
        </label>
      </section>

      <section className="race-editor-section">
        <div className="race-editor-section__heading">
          <div><p>MOVEMENT PROFILE</p><h3>Movement Modes</h3></div>
          <button type="button" onClick={() => onMovementModesChange([
            ...movementModes,
            { movementMode: "", baseValue: 0, notes: "", sortOrder: movementModes.length },
          ])}>Add Movement</button>
        </div>
        <div className="race-repeat-list">
          {movementModes.length === 0 ? <p className="race-empty-row">No movement modes assigned.</p> : null}
          {movementModes.map((movement, index) => (
            <div className="race-repeat-row race-repeat-row--movement" key={`${index}-${movement.movementMode}`}>
              <label><span>Movement Mode</span><input list="race-movement-suggestions" value={movement.movementMode} onChange={(event) => setMovement(index, { movementMode: event.target.value })} /></label>
              <label><span>Base Value</span><input type="number" value={movement.baseValue} onChange={(event) => setMovement(index, { baseValue: Number(event.target.value) })} /></label>
              <label><span>Optional Notes</span><input value={movement.notes} onChange={(event) => setMovement(index, { notes: event.target.value })} /></label>
              <div className="race-repeat-row__actions">
                <button type="button" disabled={index === 0} onClick={() => onMovementModesChange(move(movementModes, index, -1))}>Up</button>
                <button type="button" disabled={index === movementModes.length - 1} onClick={() => onMovementModesChange(move(movementModes, index, 1))}>Down</button>
                <button className="is-danger" type="button" onClick={() => onMovementModesChange(movementModes.filter((_, current) => current !== index))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
