import { useEffect, useState } from "react";
import type {
  ItemArmorProfileDraft,
  ItemWeaponProfileDraft,
  SaveItemAggregate,
} from "../../types/item";
import { ArmorProfileEditor } from "./ArmorProfileEditor";
import { GeneralItemEditor } from "./GeneralItemEditor";
import { ItemPreview } from "./ItemPreview";
import { WeaponProfileEditor } from "./WeaponProfileEditor";

type Tab = "item" | "weapon" | "armor" | "preview";
type Props = {
  draft: SaveItemAggregate | null;
  saving: boolean;
  dirty: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: SaveItemAggregate) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function emptyWeaponProfile(role = "primary"): ItemWeaponProfileDraft {
  return {
    weaponRole: role,
    weaponCategory: "",
    handedness: "",
    damageType: "",
    rangeType: "",
    rangeText: "",
    damage: 0,
    weaponEffectDescription: "",
    weaponNarrativeNotes: "",
    sourceSystem: null,
    sourceExternalId: null,
  };
}

export function emptyArmorProfile(): ItemArmorProfileDraft {
  return {
    areaCovered: "",
    soak: 0,
    armorCategory: "",
    armorType: "",
    encumbrancePenalty: 0,
    armorEffectDescription: "",
    armorNarrativeNotes: "",
    sourceSystem: null,
    sourceExternalId: null,
  };
}

export function ItemEditor({ draft, saving, dirty, feedback, onChange, onSave, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("item");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setActiveTab("item"); setConfirmDelete(false); }, [draft?.id]);

  if (!draft) return <section className="skill-editor skill-editor--empty item-editor">
    <p>ITEM EDITOR</p><h2>Select an Item or begin a new one.</h2>
    <span>Only the selected universal Item aggregate is loaded into the editor.</span>
  </section>;

  return <section className="skill-editor item-editor">
    <header className="skill-editor__header">
      <div><p>{draft.id ? `ITEM ${draft.id}` : "NEW ITEM DRAFT"}</p><h2>{draft.core.name || "Untitled Item"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div>
      <div className="skill-editor__actions">
        {draft.id && !confirmDelete && <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button>}
        <button className="skills-primary-button" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save Item"}</button>
      </div>
    </header>
    {confirmDelete && <div className="skill-editor__delete-confirm" role="alert">
      <div><strong>Delete {draft.core.name || "this Item"}?</strong><span>Its Genre Tags and profiles will be removed. Skills, Races, and users remain untouched.</span></div>
      <button className="skills-danger-button" type="button" onClick={onDelete}>Confirm Delete</button>
      <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
    </div>}
    {feedback && <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">{feedback.message}</p>}
    <nav className="skill-editor__tabs" aria-label="Item editor sections">
      <button type="button" className={activeTab === "item" ? "is-active" : ""} onClick={() => setActiveTab("item")}>Item Details</button>
      <button type="button" className={activeTab === "weapon" ? "is-active" : ""} onClick={() => setActiveTab("weapon")}>Weapon Profile{draft.weaponProfile ? " · Active" : ""}</button>
      <button type="button" className={activeTab === "armor" ? "is-active" : ""} onClick={() => setActiveTab("armor")}>Armor Profile{draft.armorProfile ? " · Active" : ""}</button>
      <button type="button" className={activeTab === "preview" ? "is-active" : ""} onClick={() => setActiveTab("preview")}>Preview</button>
    </nav>
    <div className="skill-editor__content">
      {activeTab === "item" && <GeneralItemEditor core={draft.core} genreTags={draft.genreTags} onCoreChange={(core) => onChange({ ...draft, core })} onGenreTagsChange={(genreTags) => onChange({ ...draft, genreTags })} />}
      {activeTab === "weapon" && (draft.weaponProfile
        ? <WeaponProfileEditor profile={draft.weaponProfile} onChange={(weaponProfile) => onChange({ ...draft, weaponProfile })} onRemove={() => onChange({ ...draft, weaponProfile: null })} />
        : <div className="item-profile-empty"><p>NO WEAPON PROFILE</p><h3>This Item currently has no combat weapon behavior.</h3><button className="skills-primary-button" type="button" onClick={() => onChange({ ...draft, weaponProfile: emptyWeaponProfile("improvised") })}>Add Weapon Profile</button></div>)}
      {activeTab === "armor" && (draft.armorProfile
        ? <ArmorProfileEditor profile={draft.armorProfile} onChange={(armorProfile) => onChange({ ...draft, armorProfile })} onRemove={() => onChange({ ...draft, armorProfile: null })} />
        : <div className="item-profile-empty"><p>NO ARMOR PROFILE</p><h3>This Item currently has no protective profile.</h3><button className="skills-primary-button" type="button" onClick={() => onChange({ ...draft, armorProfile: emptyArmorProfile() })}>Add Armor Profile</button></div>)}
      {activeTab === "preview" && <ItemPreview draft={draft} />}
    </div>
  </section>;
}
