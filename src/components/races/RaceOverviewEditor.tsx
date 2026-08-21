import type { RaceCoreDraft } from "../../types/race";
import { isSize, SIZE_OPTIONS } from "../../data/sizeOptions";

type Props = {
  core: RaceCoreDraft;
  onChange: (core: RaceCoreDraft) => void;
};

export function RaceOverviewEditor({ core, onChange }: Props) {
  const update = (change: Partial<RaceCoreDraft>) => onChange({ ...core, ...change });
  const optionalNumber = (value: string) => value === "" ? null : Number(value);
  const updateSize = (value: string) => {
    if (value === "") update({ size: "" });
    else if (isSize(value)) update({ size: value });
  };

  return (
    <div className="race-form">
      <div className="skill-editor__intro">
        <p>Identity, lifespan, and the distinct physical records preserved from the source material.</p>
      </div>
      <div className="race-form__grid race-form__grid--overview">
        <label className="race-form__wide">
          <span>Name *</span>
          <input value={core.name} onChange={(event) => update({ name: event.target.value })} />
        </label>
        <label>
          <span>Age Range</span>
          <input
            value={core.ageRangeText}
            placeholder="15-90"
            onChange={(event) => update({ ageRangeText: event.target.value })}
          />
        </label>
        <label>
          <span>Minimum Age</span>
          <input
            type="number"
            min={0}
            value={core.ageMin ?? ""}
            onChange={(event) => update({ ageMin: optionalNumber(event.target.value) })}
          />
        </label>
        <label>
          <span>Maximum Age</span>
          <input
            type="number"
            min={0}
            value={core.ageMax ?? ""}
            onChange={(event) => update({ ageMax: optionalNumber(event.target.value) })}
          />
        </label>
        <label>
          <span>Size</span>
          <select value={core.size} onChange={(event) => updateSize(event.target.value)}>
            <option value="">Select a size</option>
            {SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="race-form__long-fields">
        <label>
          <span>Legacy Description</span>
          <textarea rows={8} value={core.legacyDescription} onChange={(event) => update({ legacyDescription: event.target.value })} />
        </label>
        <label>
          <span>Physical Characteristics</span>
          <textarea rows={6} value={core.physicalCharacteristics} onChange={(event) => update({ physicalCharacteristics: event.target.value })} />
        </label>
        <label>
          <span>Physical Description</span>
          <textarea rows={7} value={core.physicalDescription} onChange={(event) => update({ physicalDescription: event.target.value })} />
        </label>
      </div>
    </div>
  );
}
