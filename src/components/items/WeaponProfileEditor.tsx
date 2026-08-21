import type { ItemWeaponProfileDraft } from "../../types/item";

type Props = {
  profile: ItemWeaponProfileDraft;
  onChange: (profile: ItemWeaponProfileDraft) => void;
  onRemove: () => void;
};

export function WeaponProfileEditor({ profile, onChange, onRemove }: Props) {
  const set = <Key extends keyof ItemWeaponProfileDraft>(key: Key, value: ItemWeaponProfileDraft[Key]) =>
    onChange({ ...profile, [key]: value });
  return (
    <section className="item-editor-section">
      <div className="item-editor-section__heading">
        <div><p>OPTIONAL COMBAT PROFILE</p><h3>Weapon Profile</h3></div>
        <button className="skills-danger-button" type="button" onClick={onRemove}>Remove Profile</button>
      </div>
      <p className="item-editor-section__note">
        Removing this profile leaves the universal Item and any Armor Profile intact.
      </p>
      <div className="item-form__grid">
        <label><span>Weapon Role</span><select value={profile.weaponRole} onChange={(event) => set("weaponRole", event.target.value)}><option value="primary">Primary</option><option value="improvised">Improvised</option></select></label>
        <label><span>Weapon Category</span><input value={profile.weaponCategory} onChange={(event) => set("weaponCategory", event.target.value)} /></label>
        <label><span>Handedness</span><input value={profile.handedness} onChange={(event) => set("handedness", event.target.value)} /></label>
        <label><span>Damage Type</span><input value={profile.damageType} onChange={(event) => set("damageType", event.target.value)} /></label>
        <label><span>Range Type</span><input value={profile.rangeType} onChange={(event) => set("rangeType", event.target.value)} /></label>
        <label><span>Range</span><input value={profile.rangeText} onChange={(event) => set("rangeText", event.target.value)} /></label>
        <label><span>Damage</span><input type="number" min="0" step="any" value={profile.damage} onChange={(event) => set("damage", Number(event.target.value))} /></label>
        <label className="item-form__wide"><span>Weapon Effect</span><textarea value={profile.weaponEffectDescription} onChange={(event) => set("weaponEffectDescription", event.target.value)} /></label>
        <label className="item-form__wide"><span>Weapon Narrative / Variant Notes</span><textarea value={profile.weaponNarrativeNotes} onChange={(event) => set("weaponNarrativeNotes", event.target.value)} /></label>
      </div>
    </section>
  );
}
