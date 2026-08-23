import { useState } from "react";
import type { ItemWeaponProfileDraft, RelatedItemCandidate } from "../../types/item";
import { ItemRelationPicker } from "./ItemRelationPicker";

type Props = {
  itemId?: number;
  profile: ItemWeaponProfileDraft;
  onChange: (profile: ItemWeaponProfileDraft) => void;
  onRemove: () => void;
  findItems: (search: string, excludeItemId?: number) => Promise<RelatedItemCandidate[]>;
};

const numberValue = (value: number | null): number | "" => value ?? "";
const parseNumber = (value: string): number | null => value === "" ? null : Number(value);

export function ItemWeaponProfileEditor({ itemId, profile, onChange, onRemove, findItems }: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const update = (patch: Partial<ItemWeaponProfileDraft>) => onChange({ ...profile, ...patch });
  return (
    <section className="item-section">
      <div className="item-section__heading">
        <div><p>OPTIONAL SPECIALIZED PROFILE</p><h3>Weapon Profile</h3></div>
        {!confirmRemove ? <button className="is-danger" type="button" onClick={() => setConfirmRemove(true)}>Remove Weapon Profile</button> : null}
      </div>
      {confirmRemove ? <div className="item-profile__remove-confirm" role="alert"><span>Remove this Item’s Weapon Profile?</span><div><button type="button" onClick={() => setConfirmRemove(false)}>Keep Profile</button><button className="is-danger" type="button" onClick={onRemove}>Remove Profile</button></div></div> : null}
      <p className="item-section__description">This profile extends the Item. It does not replace the Item’s identity or browse classification.</p>
      <div className="item-profile__grid">
        <label><span>Weapon Type</span><input value={profile.weaponType} onChange={(event) => update({ weaponType: event.target.value })} /></label>
        <label><span>Handedness</span><input value={profile.handedness} onChange={(event) => update({ handedness: event.target.value })} /></label>
        <label><span>Damage Source</span><input value={profile.damageSource} placeholder="Weapon or ammunition" onChange={(event) => update({ damageSource: event.target.value })} /></label>
        <label><span>Damage</span><input value={profile.damage} onChange={(event) => update({ damage: event.target.value })} /></label>
        <label><span>Damage Type</span><input value={profile.damageType} onChange={(event) => update({ damageType: event.target.value })} /></label>
        <label><span>Range</span><input value={profile.range} onChange={(event) => update({ range: event.target.value })} /></label>
        <label><span>Reach</span><input value={profile.reach} onChange={(event) => update({ reach: event.target.value })} /></label>
        <label><span>Capacity</span><input type="number" min="0" step="1" value={numberValue(profile.capacity)} onChange={(event) => update({ capacity: parseNumber(event.target.value) })} /></label>
        <label><span>Rate of Fire</span><input value={profile.rateOfFire} onChange={(event) => update({ rateOfFire: event.target.value })} /></label>
        <label><span>Reload Initiative</span><input type="number" min="0" step="any" value={numberValue(profile.reloadInitiative)} onChange={(event) => update({ reloadInitiative: parseNumber(event.target.value) })} /></label>
        <label className="item-field--wide"><span>Fire Modes</span><input value={profile.fireModes.join(", ")} placeholder="Single, Burst, Automatic" onChange={(event) => update({ fireModes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
        <label className="item-field--wide"><span>Compatibility</span><textarea value={profile.compatibility} onChange={(event) => update({ compatibility: event.target.value })} /></label>
        <ItemRelationPicker kind="item" label="Ammunition Reference" selectedName={profile.ammunitionItemName} findItems={(search) => findItems(search, itemId)} onSelect={(candidate) => update({ ammunitionItemId: candidate?.id ?? null, ammunitionItemName: candidate?.name ?? null })} />
        <label className="item-field--wide"><span>Rules Text</span><textarea value={profile.rulesText} onChange={(event) => update({ rulesText: event.target.value })} /></label>
      </div>
    </section>
  );
}
