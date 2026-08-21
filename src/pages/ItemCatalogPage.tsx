import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { ItemEditor } from "../components/items/ItemEditor";
import { ItemLibrary } from "../components/items/ItemLibrary";
import { ItemValidationError, itemService } from "../services/itemService";
import type { AuthSession } from "../types/user";
import type { ItemAggregate, ItemCatalogView, ItemLibraryFilters, ItemLibraryOptions, ItemLibraryPage, ItemSummary, SaveItemAggregate } from "../types/item";
import "../styles/skills-page.css";
import "../styles/items-page.css";

type Props = { session: AuthSession; mode: "equipment" | "inventory"; onBack: () => void; onLogout: () => void };
const EMPTY_PAGE: ItemLibraryPage = { items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 };
const EMPTY_OPTIONS: ItemLibraryOptions = { categories: [], subtypes: [], types: [], genres: [] };

export function itemAggregateToDraft(aggregate: ItemAggregate): SaveItemAggregate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...core } = aggregate.item;
  const weaponProfile = aggregate.weaponProfile ? (({ id: _profileId, itemId: _itemId, createdAt: _profileCreated, updatedAt: _profileUpdated, ...profile }) => profile)(aggregate.weaponProfile) : null;
  const armorProfile = aggregate.armorProfile ? (({ id: _profileId, itemId: _itemId, createdAt: _profileCreated, updatedAt: _profileUpdated, ...profile }) => profile)(aggregate.armorProfile) : null;
  const aliases = aggregate.aliases.map(({ alias, notes, sourceReference }) => ({ alias, notes, sourceReference }));
  return { id: aggregate.item.id, core, genreTags: aggregate.genreTags, aliases, weaponProfile, armorProfile };
}

export function newItemDraft(userId: number, catalogSection: "Equipment" | "Inventory"): SaveItemAggregate {
  return { core: { name: "", catalogSection, timelineTag: "", costCredits: null, category: "", subtype: "", weight: null, effectDescription: "", narrativeVariantNotes: "", createdByUserId: userId, sourceSystem: null, sourceExternalId: null }, genreTags: [], aliases: [], weaponProfile: null, armorProfile: null };
}

export function ItemCatalogPage({ session, mode, onBack, onLogout }: Props) {
  const initialView: ItemCatalogView = mode === "inventory" ? "inventory" : "weapons";
  const [filters, setFilters] = useState<ItemLibraryFilters>({ view: initialView, page: 1, pageSize: 40 });
  const [page, setPage] = useState(EMPTY_PAGE); const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [draft, setDraft] = useState<SaveItemAggregate | null>(null); const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const load = useCallback(async (next: ItemLibraryFilters) => { setLoading(true); try { const [result, filterOptions] = await Promise.all([itemService.listItems(next), itemService.listOptions(next)]); setPage(result); setOptions(filterOptions); } catch { setFeedback({ kind: "error", message: "The Item catalog could not be read from the local archive." }); } finally { setLoading(false); } }, []);
  useEffect(() => { const timeout = window.setTimeout(() => void load(filters), 180); return () => window.clearTimeout(timeout); }, [filters, load]);
  async function open(item: ItemSummary) { setFeedback(null); try { const aggregate = await itemService.getItem(item.id); if (!aggregate) throw new Error(); setDraft(itemAggregateToDraft(aggregate)); setDirty(false); } catch { setFeedback({ kind: "error", message: "That Item could not be loaded." }); } }
  async function save() { if (!draft) return; setSaving(true); setFeedback(null); try { const aggregate = await itemService.saveItem(draft); setDraft(itemAggregateToDraft(aggregate)); setDirty(false); setFeedback({ kind: "success", message: `${aggregate.item.name} was saved.` }); await load(filters); } catch (error) { setFeedback({ kind: "error", message: error instanceof ItemValidationError ? error.message : "The Item could not be saved. Existing data was left intact." }); } finally { setSaving(false); } }
  async function remove() { if (!draft?.id) return; setSaving(true); try { const name = draft.core.name; await itemService.deleteItem(draft.id); setDraft(null); setDirty(false); setFeedback({ kind: "success", message: `${name} was deleted.` }); await load(filters); } catch { setFeedback({ kind: "error", message: "The Item could not be deleted." }); } finally { setSaving(false); } }
  const views: { id: ItemCatalogView; label: string }[] = mode === "equipment" ? [{ id: "weapons", label: "Weapons" }, { id: "armor", label: "Armor" }, { id: "general-equipment", label: "General Equipment" }] : [{ id: "inventory", label: "Inventory" }];
  return <main className="skills-page items-page"><header className="skills-page__header"><div className="skills-page__brand"><BrandLogo /></div><div className="skills-page__title"><p>THE HEAVENS / {mode.toUpperCase()}</p><h1>{mode === "equipment" ? "Equipment" : "Inventory"}</h1><span>G.O.D. master catalog · {session.username}</span></div><div className="skills-page__navigation"><button type="button" onClick={onBack}>Back to The Heavens</button><button type="button" onClick={onLogout}>Log Out</button></div></header>
    {mode === "equipment" && <nav className="catalog-view-tabs" aria-label="Equipment sections">{views.map((view) => <button key={view.id} type="button" className={filters.view === view.id ? "is-active" : ""} onClick={() => { setFilters({ view: view.id, page: 1, pageSize: 40 }); setDraft(null); setDirty(false); }}>{view.label}</button>)}</nav>}
    <div className="skills-workspace items-workspace"><ItemLibrary title={mode === "equipment" ? views.find((view) => view.id === filters.view)?.label ?? "Equipment" : "Inventory Catalog"} page={page} filters={filters} options={options} selectedItemId={draft?.id} loading={loading} onFiltersChange={setFilters} onSelect={(item) => { if (!dirty || window.confirm("Discard unsaved Item changes?")) void open(item); }} onNew={() => { if (!dirty || window.confirm("Discard unsaved Item changes?")) { setDraft(newItemDraft(session.userId, mode === "equipment" ? "Equipment" : "Inventory")); setDirty(false); setFeedback(null); } }} /><ItemEditor draft={draft} saving={saving} dirty={dirty} feedback={feedback} onChange={(next) => { setDraft(next); setDirty(true); setFeedback(null); }} onSave={() => void save()} onDelete={() => void remove()} /></div>
  </main>;
}
