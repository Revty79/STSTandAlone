import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { ItemEditor } from "../components/items/ItemEditor";
import { ItemLibrary } from "../components/items/ItemLibrary";
import { ItemValidationError, itemService } from "../services/itemService";
import type {
  ItemAggregate,
  ItemAuthoringReferences,
  ItemCatalogScope,
  ItemLibraryFacets,
  ItemLibraryFilters,
  ItemLibraryPage,
  ItemSummary,
  SaveItemAggregate,
} from "../types/item";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/items-page.css";

type PageProps = { session: AuthSession; onBack: () => void; onLogout: () => void };
type Props = PageProps & { catalogScope: ItemCatalogScope };
type PendingChange =
  | { kind: "open"; item: ItemSummary }
  | { kind: "new" }
  | { kind: "exit"; destination: "heavens" | "logout" };

const EMPTY_PAGE: ItemLibraryPage = { items: [], total: 0, page: 1, pageSize: 40, pageCount: 1 };
const EMPTY_FACETS: ItemLibraryFacets = { recordTypes: [], categories: [], tags: [] };
const EMPTY_REFERENCES: ItemAuthoringReferences = { tags: [], armorBodyLocations: [] };

export function itemAggregateToDraft(aggregate: ItemAggregate): SaveItemAggregate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...core } = aggregate.core;
  return { ...aggregate, id: aggregate.id, core };
}

export function newItemDraft(userId: number, catalogScope: ItemCatalogScope): SaveItemAggregate {
  return {
    core: {
      canonicalId: "",
      name: "",
      catalogScope,
      equipmentGroup: catalogScope === "equipment" ? "general" : null,
      recordType: "",
      family: "",
      category: "",
      subtype: "",
      description: "",
      weight: null,
      weightUnit: "",
      size: "",
      durability: null,
      credits: null,
      priceBasis: "each",
      parentItemId: null,
      parentItemName: null,
      createdByUserId: userId,
      sourceSystem: null,
    },
    properties: [],
    weaponProfile: null,
    armorProfile: null,
    tags: [],
    variants: [],
  };
}

export function ItemsPage({ session, catalogScope, onBack, onLogout }: Props) {
  const [filters, setFilters] = useState<ItemLibraryFilters>({ catalogScope, page: 1, pageSize: 40 });
  const [library, setLibrary] = useState<ItemLibraryPage>(EMPTY_PAGE);
  const [facets, setFacets] = useState<ItemLibraryFacets>(EMPTY_FACETS);
  const [references, setReferences] = useState<ItemAuthoringReferences>(EMPTY_REFERENCES);
  const [draft, setDraft] = useState<SaveItemAggregate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const loadLibrary = useCallback(async (nextFilters: ItemLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await itemService.listItems(nextFilters));
    } catch {
      setFeedback({ kind: "error", message: "The Item catalog could not be read from the local archive." });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  const refreshFacets = useCallback(async () => {
    setFacets(await itemService.listFacets(catalogScope));
  }, [catalogScope]);

  useEffect(() => {
    void Promise.all([refreshFacets(), itemService.listAuthoringReferences().then(setReferences)])
      .catch(() => setFeedback({ kind: "error", message: "Item authoring reference data could not be read." }));
  }, [refreshFacets]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadLibrary]);

  useEffect(() => {
    const warnBeforeClosing = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [dirty]);

  async function openItem(summary: ItemSummary) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await itemService.getItem(summary.id);
      if (!aggregate) throw new Error("Item not found");
      setDraft(itemAggregateToDraft(aggregate));
      setDirty(false);
      setEditorKey((value) => value + 1);
    } catch {
      setFeedback({ kind: "error", message: "That Item could not be loaded." });
    } finally {
      setLoadingEditor(false);
    }
  }

  function selectItem(item: ItemSummary) {
    if (dirty) setPendingChange({ kind: "open", item });
    else void openItem(item);
  }

  function createItem() {
    setDraft(newItemDraft(session.userId, catalogScope));
    setDirty(false);
    setFeedback(null);
    setEditorKey((value) => value + 1);
  }

  function beginItem() {
    if (dirty) setPendingChange({ kind: "new" });
    else createItem();
  }

  function requestExit(destination: "heavens" | "logout") {
    if (dirty) setPendingChange({ kind: "exit", destination });
    else if (destination === "heavens") onBack();
    else onLogout();
  }

  function discardAndContinue() {
    const pending = pendingChange;
    setPendingChange(null);
    if (pending?.kind === "new") createItem();
    else if (pending?.kind === "open") void openItem(pending.item);
    else if (pending?.kind === "exit" && pending.destination === "heavens") onBack();
    else if (pending?.kind === "exit") onLogout();
  }

  async function saveItem() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await itemService.saveItem(draft);
      setDraft(itemAggregateToDraft(saved));
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.name} was saved to the local Item archive.` });
      await Promise.all([refreshFacets(), loadLibrary(filters)]);
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof ItemValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The Item could not be saved. Existing archive data was left intact.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!draft?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      const name = draft.core.name;
      await itemService.deleteItem(draft.id);
      setDraft(null);
      setDirty(false);
      setFeedback({ kind: "success", message: `${name} was deleted from the local Item archive.` });
      await Promise.all([refreshFacets(), loadLibrary(filters)]);
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Item could not be deleted." });
    } finally {
      setSaving(false);
    }
  }

  async function createVariant(variantName: string) {
    if (!draft?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await itemService.createVariant(draft.id, variantName, session.userId);
      setDraft(itemAggregateToDraft(saved));
      setDirty(false);
      setEditorKey((value) => value + 1);
      setFeedback({ kind: "success", message: `${saved.core.name} was created as a complete Item record.` });
      await Promise.all([refreshFacets(), loadLibrary(filters)]);
    } catch (error: unknown) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Item Variant could not be created." });
    } finally {
      setSaving(false);
    }
  }

  const title = catalogScope === "equipment" ? "Equipment" : "Inventory";
  const subtitle = catalogScope === "equipment"
    ? "Weapons, armor, and active equipment definitions"
    : "Non-equipment definitions in the master Item catalog";

  return (
    <main className="skills-page items-page">
      <header className="skills-page__header"><div className="skills-page__brand"><BrandLogo /></div><div className="skills-page__title"><p>THE HEAVENS / {title.toLocaleUpperCase("en-US")}</p><h1>{title}</h1><span>G.O.D. master catalog · {session.username}</span></div><div className="skills-page__navigation"><button type="button" onClick={() => requestExit("heavens")}>Back to The Heavens</button><button type="button" onClick={() => requestExit("logout")}>Log Out</button></div></header>
      <div className="items-page__notice" role="note"><strong>Master Item archive</strong><span>{subtitle}. Changes are stored permanently in this installation&apos;s local SQLite archive.</span></div>
      <div className="skills-workspace items-workspace">
        <ItemLibrary catalogScope={catalogScope} page={library} facets={facets} filters={filters} selectedItemId={draft?.id} loading={loadingLibrary} onFiltersChange={setFilters} onSelect={selectItem} onNewItem={beginItem} />
        {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING ITEM</p></section> : <ItemEditor key={editorKey} draft={draft} references={references} saving={saving} dirty={dirty} feedback={feedback} onChange={(next) => { setDraft(next); setDirty(true); setFeedback(null); }} onSave={() => void saveItem()} onDelete={() => void deleteItem()} onCreateVariant={(name) => void createVariant(name)} findItems={(search, excludeItemId) => itemService.findRelatedItems(search, excludeItemId)} findCreatures={(search) => itemService.findRelatedCreatures(search)} />}
      </div>
      {pendingChange ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-item-title"><div><p id="discard-item-title">Unsaved changes</p><span>Leave this Item draft and discard the changes you have not saved?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingChange(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div></div> : null}
    </main>
  );
}

export function EquipmentPage(props: PageProps) {
  return <ItemsPage {...props} catalogScope="equipment" />;
}

export function InventoryPage(props: PageProps) {
  return <ItemsPage {...props} catalogScope="inventory" />;
}
