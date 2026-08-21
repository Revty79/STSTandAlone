import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { ItemEditor, emptyArmorProfile, emptyWeaponProfile } from "../components/items/ItemEditor";
import { ItemLibrary } from "../components/items/ItemLibrary";
import { ItemValidationError, itemService } from "../services/itemService";
import type {
  ItemAggregate,
  ItemCatalogView,
  ItemLibraryFilters,
  ItemLibraryOptions,
  ItemLibraryPage,
  ItemSummary,
  SaveItemAggregate,
} from "../types/item";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/items-page.css";

export type ItemCatalogSection = { id: ItemCatalogView; label: string };
type Props = {
  session: AuthSession;
  title: string;
  eyebrow: string;
  sections: readonly ItemCatalogSection[];
  onBack: () => void;
  onLogout: () => void;
};
type PendingChange =
  | { kind: "open"; item: ItemSummary }
  | { kind: "new" }
  | { kind: "view"; view: ItemCatalogView };

const EMPTY_PAGE: ItemLibraryPage = { items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 };
const EMPTY_OPTIONS: ItemLibraryOptions = { categories: [], subtypes: [], types: [], genres: [] };

export function itemAggregateToDraft(aggregate: ItemAggregate): SaveItemAggregate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...core } = aggregate.item;
  const weaponProfile = aggregate.weaponProfile
    ? (({ id: _profileId, itemId: _itemId, createdAt: _profileCreated, updatedAt: _profileUpdated, ...profile }) => profile)(aggregate.weaponProfile)
    : null;
  const armorProfile = aggregate.armorProfile
    ? (({ id: _profileId, itemId: _itemId, createdAt: _profileCreated, updatedAt: _profileUpdated, ...profile }) => profile)(aggregate.armorProfile)
    : null;
  return { id: aggregate.item.id, core, genreTags: [...aggregate.genreTags], weaponProfile, armorProfile };
}

export function newItemDraft(userId: number, view: ItemCatalogView): SaveItemAggregate {
  return {
    core: {
      name: "",
      catalogScope: view === "inventory" ? "inventory" : "equipment",
      timelineTag: "",
      costCredits: 0,
      category: "",
      subtype: "",
      weight: 0,
      effectDescription: "",
      narrativeVariantNotes: "",
      createdByUserId: userId,
      sourceSystem: null,
      sourceExternalId: null,
    },
    genreTags: [],
    weaponProfile: view === "weapons" ? emptyWeaponProfile("primary") : null,
    armorProfile: view === "armor" ? emptyArmorProfile() : null,
  };
}

export function ItemCatalogPage({ session, title, eyebrow, sections, onBack, onLogout }: Props) {
  const initialView = sections[0].id;
  const [filters, setFilters] = useState<ItemLibraryFilters>({ view: initialView, page: 1, pageSize: 40 });
  const [library, setLibrary] = useState<ItemLibraryPage>(EMPTY_PAGE);
  const [options, setOptions] = useState<ItemLibraryOptions>(EMPTY_OPTIONS);
  const [draft, setDraft] = useState<SaveItemAggregate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  const loadLibrary = useCallback(async (next: ItemLibraryFilters) => {
    setLoadingLibrary(true);
    try { setLibrary(await itemService.listItems(next)); }
    catch { setFeedback({ kind: "error", message: "The Item Library could not be read from the local archive." }); }
    finally { setLoadingLibrary(false); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadLibrary]);
  useEffect(() => {
    itemService.listOptions(filters).then(setOptions).catch(() => setOptions(EMPTY_OPTIONS));
  }, [filters.view, filters.includeImprovised]);

  async function openItem(summary: ItemSummary) {
    setLoadingEditor(true); setFeedback(null);
    try {
      const aggregate = await itemService.getItem(summary.id);
      if (!aggregate) throw new Error("Item not found");
      setDraft(itemAggregateToDraft(aggregate)); setDirty(false);
    } catch { setFeedback({ kind: "error", message: "That Item could not be loaded." }); }
    finally { setLoadingEditor(false); }
  }

  function selectItem(item: ItemSummary) {
    if (dirty) setPendingChange({ kind: "open", item }); else void openItem(item);
  }
  function createItem() { setDraft(newItemDraft(session.userId, filters.view)); setDirty(false); setFeedback(null); }
  function beginItem() { if (dirty) setPendingChange({ kind: "new" }); else createItem(); }
  function switchView(view: ItemCatalogView) {
    setFilters({ view, page: 1, pageSize: 40 });
    setDraft(null); setDirty(false); setFeedback(null);
  }
  function requestView(view: ItemCatalogView) {
    if (view === filters.view) return;
    if (dirty) setPendingChange({ kind: "view", view }); else switchView(view);
  }
  function discardAndContinue() {
    const pending = pendingChange; setPendingChange(null);
    if (pending?.kind === "new") createItem();
    else if (pending?.kind === "open") void openItem(pending.item);
    else if (pending?.kind === "view") switchView(pending.view);
  }

  async function saveItem() {
    if (!draft) return;
    setSaving(true); setFeedback(null);
    try {
      const saved = await itemService.saveItem(draft);
      setDraft(itemAggregateToDraft(saved)); setDirty(false);
      setFeedback({ kind: "success", message: `${saved.item.name} was saved.` });
      await Promise.all([loadLibrary(filters), itemService.listOptions(filters).then(setOptions)]);
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: error instanceof ItemValidationError ? error.message : "The Item could not be saved. Existing data was left intact." });
    } finally { setSaving(false); }
  }

  async function deleteItem() {
    if (!draft?.id) return;
    setSaving(true); setFeedback(null);
    try {
      const name = draft.core.name;
      await itemService.deleteItem(draft.id);
      setDraft(null); setDirty(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await Promise.all([loadLibrary(filters), itemService.listOptions(filters).then(setOptions)]);
    } catch { setFeedback({ kind: "error", message: "The Item could not be deleted." }); }
    finally { setSaving(false); }
  }

  const sectionLabel = sections.find(({ id }) => id === filters.view)?.label ?? title;
  return <main className="skills-page items-page">
    <header className="skills-page__header">
      <div className="skills-page__brand"><BrandLogo /></div>
      <div className="skills-page__title"><p>{eyebrow}</p><h1>{title}</h1><span>G.O.D. master catalog · {session.username}</span></div>
      <div className="skills-page__navigation"><button type="button" onClick={onBack}>Back to The Heavens</button><button type="button" onClick={onLogout}>Log Out</button></div>
    </header>
    {sections.length > 1 && <nav className="item-catalog-tabs" aria-label={`${title} sections`}>
      {sections.map((section) => <button key={section.id} type="button" className={filters.view === section.id ? "is-active" : ""} onClick={() => requestView(section.id)}>{section.label}</button>)}
    </nav>}
    <div className="skills-workspace items-workspace">
      <ItemLibrary title={sectionLabel} page={library} filters={filters} options={options} selectedItemId={draft?.id} loading={loadingLibrary} onFiltersChange={setFilters} onSelect={selectItem} onNewItem={beginItem} />
      {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING ITEM</p></section> : <ItemEditor draft={draft} saving={saving} dirty={dirty} feedback={feedback} onChange={(next) => { setDraft(next); setDirty(true); setFeedback(null); }} onSave={() => void saveItem()} onDelete={() => void deleteItem()} />}
    </div>
    {pendingChange && <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-item-title">
      <div><p id="discard-item-title">Unsaved changes</p><span>Leave this Item draft and discard the changes you have not saved?</span></div>
      <div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingChange(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div>
    </div>}
  </main>;
}
