import { useEffect, useMemo, useState } from "react";
import type {
  ItemAuthoringReferences,
  ItemArmorProfileDraft,
  ItemWeaponProfileDraft,
  RelatedCreatureCandidate,
  RelatedItemCandidate,
  SaveItemAggregate,
} from "../../types/item";
import { ItemArmorProfileEditor } from "./ItemArmorProfileEditor";
import { ItemOverviewEditor } from "./ItemOverviewEditor";
import { ItemPropertiesEditor } from "./ItemPropertiesEditor";
import { ItemTagsEditor } from "./ItemTagsEditor";
import { ItemVariantEditor } from "./ItemVariantEditor";
import { ItemWeaponProfileEditor } from "./ItemWeaponProfileEditor";

type Tab = "overview" | "properties" | "weapon" | "armor" | "tags" | "variants";
type Props = {
  draft: SaveItemAggregate | null;
  references: ItemAuthoringReferences;
  saving: boolean;
  dirty: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: SaveItemAggregate) => void;
  onSave: () => void;
  onDelete: () => void;
  onCreateVariant: (name: string) => void;
  findItems: (search: string, excludeItemId?: number) => Promise<RelatedItemCandidate[]>;
  findCreatures: (search: string) => Promise<RelatedCreatureCandidate[]>;
};

export const EMPTY_WEAPON_PROFILE: ItemWeaponProfileDraft = {
  profileRecordType: "",
  weaponType: "", handedness: "", damageSource: "", damage: "", damageType: "",
  range: "", reach: "", ammunitionItemId: null, ammunitionItemName: null,
  compatibility: "", capacity: "", fireModes: [], rateOfFire: "",
  reloadInitiative: "", rulesText: "",
};

export const EMPTY_ARMOR_PROFILE: ItemArmorProfileDraft = {
  armorType: "", coverage: "", baseSoak: null, damageModifiersSourceText: "", damageModifiers: [],
  coveredBodyLocationKeys: [], rulesText: "",
};

export function ItemEditor({ draft, references, saving, dirty, feedback, onChange, onSave, onDelete, onCreateVariant, findItems, findCreatures }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tabs = useMemo(() => {
    const result: { id: Tab; label: string }[] = [
      { id: "overview", label: "Overview" },
      { id: "properties", label: "Properties" },
    ];
    if (draft?.weaponProfile) result.push({ id: "weapon", label: "Weapon" });
    if (draft?.armorProfile) result.push({ id: "armor", label: "Armor" });
    result.push({ id: "tags", label: "Tags" }, { id: "variants", label: "Variants" });
    return result;
  }, [draft?.armorProfile, draft?.weaponProfile]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) setActiveTab("overview");
  }, [activeTab, tabs]);

  if (!draft) return <section className="skill-editor skill-editor--empty item-editor"><p>SHARED ITEM EDITOR</p><h2>Select an Item or begin a new one.</h2><span>Equipment and Inventory both use this aggregate editor.</span></section>;

  return (
    <section className="skill-editor item-editor">
      <header className="skill-editor__header"><div><p>{draft.id ? draft.core.canonicalId : "NEW ITEM DRAFT"}</p><h2>{draft.core.name || "Untitled Item"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}<button className="skills-primary-button" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save Item"}</button></div></header>
      {confirmDelete ? <div className="skill-editor__delete-confirm" role="alert"><div><strong>Delete {draft.core.name || "this Item"}?</strong><span>The Item definition and its owned profiles will be removed. Referenced Items and canonical Creatures remain untouched.</span></div><button className="skills-danger-button" type="button" onClick={onDelete}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
      {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
      <div className="item-editor__profile-strip"><div><strong>Optional profiles</strong><span>Add only the specialized mechanics this Item actually needs.</span></div><div>{!draft.weaponProfile ? <button type="button" onClick={() => { onChange({ ...draft, weaponProfile: { ...EMPTY_WEAPON_PROFILE, profileRecordType: draft.core.recordType } }); setActiveTab("weapon"); }}>Add Weapon Profile</button> : <span>Weapon Profile added</span>}{!draft.armorProfile ? <button type="button" onClick={() => { onChange({ ...draft, armorProfile: { ...EMPTY_ARMOR_PROFILE, damageModifiers: [], coveredBodyLocationKeys: [] } }); setActiveTab("armor"); }}>Add Armor Profile</button> : <span>Armor Profile added</span>}</div></div>
      <nav className="skill-editor__tabs item-editor__tabs" aria-label="Item editor sections">{tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>
      <div className="skill-editor__content">
        {activeTab === "overview" ? <ItemOverviewEditor draft={draft} onChange={onChange} /> : null}
        {activeTab === "properties" ? <ItemPropertiesEditor itemId={draft.id} properties={draft.properties} onChange={(properties) => onChange({ ...draft, properties })} findItems={findItems} findCreatures={findCreatures} /> : null}
        {activeTab === "weapon" && draft.weaponProfile ? <ItemWeaponProfileEditor itemId={draft.id} profile={draft.weaponProfile} onChange={(weaponProfile) => onChange({ ...draft, weaponProfile })} onRemove={() => { onChange({ ...draft, weaponProfile: null }); setActiveTab("overview"); }} findItems={findItems} /> : null}
        {activeTab === "armor" && draft.armorProfile ? <ItemArmorProfileEditor profile={draft.armorProfile} bodyLocations={references.armorBodyLocations} onChange={(armorProfile) => onChange({ ...draft, armorProfile })} onRemove={() => { onChange({ ...draft, armorProfile: null }); setActiveTab("overview"); }} /> : null}
        {activeTab === "tags" ? <ItemTagsEditor availableTags={references.tags} selectedTags={draft.tags} onChange={(tags) => onChange({ ...draft, tags })} /> : null}
        {activeTab === "variants" ? <ItemVariantEditor draft={draft} dirty={dirty} saving={saving} onCreateVariant={onCreateVariant} /> : null}
      </div>
    </section>
  );
}
