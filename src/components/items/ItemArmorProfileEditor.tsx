import { useState } from "react";
import type { ItemArmorProfileDraft, ItemAuthoringReferences } from "../../types/item";

type Props = {
  profile: ItemArmorProfileDraft;
  bodyLocations: ItemAuthoringReferences["armorBodyLocations"];
  onChange: (profile: ItemArmorProfileDraft) => void;
  onRemove: () => void;
};

const numberValue = (value: number | null): number | "" => value ?? "";
const parseNumber = (value: string): number | null => value === "" ? null : Number(value);

export function ItemArmorProfileEditor({ profile, bodyLocations, onChange, onRemove }: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const update = (patch: Partial<ItemArmorProfileDraft>) => onChange({ ...profile, ...patch });
  const updateModifier = (index: number, patch: Partial<ItemArmorProfileDraft["damageModifiers"][number]>) => update({ damageModifiers: profile.damageModifiers.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) });
  return (
    <section className="item-section">
      <div className="item-section__heading">
        <div><p>OPTIONAL SPECIALIZED PROFILE</p><h3>Armor Profile</h3></div>
        {!confirmRemove ? <button className="is-danger" type="button" onClick={() => setConfirmRemove(true)}>Remove Armor Profile</button> : null}
      </div>
      {confirmRemove ? <div className="item-profile__remove-confirm" role="alert"><span>Remove this Item’s Armor Profile?</span><div><button type="button" onClick={() => setConfirmRemove(false)}>Keep Profile</button><button className="is-danger" type="button" onClick={onRemove}>Remove Profile</button></div></div> : null}
      <p className="item-section__description">Armor mechanics remain an optional extension of the Item’s universal catalog identity.</p>
      <div className="item-profile__grid">
        <label><span>Armor Type</span><input value={profile.armorType} onChange={(event) => update({ armorType: event.target.value })} /></label>
        <label><span>Coverage</span><input value={profile.coverage} onChange={(event) => update({ coverage: event.target.value })} /></label>
        <label><span>Base Soak</span><input type="number" min="0" step="any" value={numberValue(profile.baseSoak)} onChange={(event) => update({ baseSoak: parseNumber(event.target.value) })} /></label>
      </div>

      <div className="item-profile__subsection">
        <div className="item-profile__subheading"><div><p>TYPE-SPECIFIC ADJUSTMENTS</p><h4>Damage Modifiers</h4></div><button type="button" onClick={() => update({ damageModifiers: [...profile.damageModifiers, { damageType: "", modifier: "", notes: "", sortOrder: profile.damageModifiers.length }] })}>Add Modifier</button></div>
        {profile.damageModifiers.length === 0 ? <p className="item-empty-row">No damage modifiers are assigned.</p> : <div className="item-repeat-list">{profile.damageModifiers.map((row, index) => <article className="item-repeat-row" key={index}><header><strong>{row.damageType || `Modifier ${index + 1}`}</strong><button type="button" onClick={() => update({ damageModifiers: profile.damageModifiers.filter((_, rowIndex) => rowIndex !== index) })}>Remove</button></header><div className="item-repeat-row__fields"><label><span>Damage Type</span><input value={row.damageType} onChange={(event) => updateModifier(index, { damageType: event.target.value })} /></label><label><span>Modifier</span><input value={row.modifier} onChange={(event) => updateModifier(index, { modifier: event.target.value })} /></label><label className="item-field--wide"><span>Notes</span><textarea value={row.notes} onChange={(event) => updateModifier(index, { notes: event.target.value })} /></label></div></article>)}</div>}
      </div>

      <div className="item-profile__subsection">
        <div className="item-profile__subheading"><div><p>CANONICAL REFERENCE</p><h4>Body Shot Bob Locations</h4></div></div>
        {bodyLocations.length === 0 ? <p className="item-reference-notice">No Body Shot Bob location list is defined in this UI prototype. The upcoming database/reference provider must supply the canonical choices.</p> : <div className="item-tags__grid">{bodyLocations.map((location) => <label key={location.key}><input type="checkbox" checked={profile.coveredBodyLocationKeys.includes(location.key)} onChange={(event) => update({ coveredBodyLocationKeys: event.target.checked ? [...profile.coveredBodyLocationKeys, location.key] : profile.coveredBodyLocationKeys.filter((key) => key !== location.key) })} /><span>{location.label}</span></label>)}</div>}
      </div>

      <label className="item-profile__rules"><span>Rules Text</span><textarea value={profile.rulesText} onChange={(event) => update({ rulesText: event.target.value })} /></label>
    </section>
  );
}
