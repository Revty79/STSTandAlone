import type { ItemArmorProfileDraft } from "../../types/item";

type Props = {
  profile: ItemArmorProfileDraft;
  onChange: (profile: ItemArmorProfileDraft) => void;
  onRemove: () => void;
};

export function ArmorProfileEditor({ profile, onChange, onRemove }: Props) {
  const set = <Key extends keyof ItemArmorProfileDraft>(key: Key, value: ItemArmorProfileDraft[Key]) =>
    onChange({ ...profile, [key]: value });
  return (
    <section className="item-editor-section">
      <div className="item-editor-section__heading">
        <div><p>OPTIONAL PROTECTIVE PROFILE</p><h3>Armor Profile</h3></div>
        <button className="skills-danger-button" type="button" onClick={onRemove}>Remove Profile</button>
      </div>
      <p className="item-editor-section__note">
        Removing this profile leaves the universal Item and any Weapon Profile intact.
      </p>
      <div className="item-form__grid">
        <label><span>Area Covered</span><input value={profile.areaCovered} onChange={(event) => set("areaCovered", event.target.value)} /></label>
        <label><span>Soak</span><input type="number" min="0" step="any" value={profile.soak} onChange={(event) => set("soak", Number(event.target.value))} /></label>
        <label><span>Armor Category</span><input value={profile.armorCategory} onChange={(event) => set("armorCategory", event.target.value)} /></label>
        <label><span>Armor Type</span><input value={profile.armorType} onChange={(event) => set("armorType", event.target.value)} /></label>
        <label><span>Encumbrance Penalty</span><input type="number" step="any" value={profile.encumbrancePenalty} onChange={(event) => set("encumbrancePenalty", Number(event.target.value))} /></label>
        <label className="item-form__wide"><span>Armor Effect</span><textarea value={profile.armorEffectDescription} onChange={(event) => set("armorEffectDescription", event.target.value)} /></label>
        <label className="item-form__wide"><span>Armor Narrative / Variant Notes</span><textarea value={profile.armorNarrativeNotes} onChange={(event) => set("armorNarrativeNotes", event.target.value)} /></label>
      </div>
    </section>
  );
}
