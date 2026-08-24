import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SpellCastingPanel } from "../components/spells/SpellCastingPanel";
import { SpellConstructionEditor } from "../components/skills/SpellConstructionEditor";
import { calculateSpell } from "../features/spell-construction/engine/calculateSpell";
import type { SpellCastingSystem, SpellDocument, Tradition } from "../features/spell-construction/models/spell";
import { createEmptySpell } from "../features/spell-construction/utilities/spellFactory";
import { getSpellFrameworkName } from "../features/spell-construction/data/spellIdentity";
import { getAvailableSpellCastingContexts } from "../features/characters/characterSpellCasting";
import { characterService } from "../services/characterService";
import { characterSpellService } from "../services/characterSpellService";
import { skillService } from "../services/skillService";
import type { CharacterAggregate } from "../types/character";
import type { CharacterSavedSpell } from "../types/characterSpell";
import type { AuthSession } from "../types/user";
import "../styles/spell-construction.css";
import "../styles/spell-player.css";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Spell could not be saved.";
}

type PendingCalculatorAction =
  | { kind: "new" }
  | { kind: "open"; savedSpellId: number }
  | { kind: "spellbook" }
  | { kind: "realms" }
  | { kind: "logout" };

export function MagicCalculatorPage({
  session,
  campaignId,
  characterId,
  onOpenSpellbook,
  onBack,
  onLogout,
}: {
  session: AuthSession;
  campaignId: number;
  characterId: number;
  onOpenSpellbook: () => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [aggregate, setAggregate] = useState<CharacterAggregate | null>(null);
  const [savedSpells, setSavedSpells] = useState<CharacterSavedSpell[]>([]);
  const [document, setDocument] = useState<SpellDocument>(() => createEmptySpell());
  const [selectedSavedId, setSelectedSavedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingCalculatorAction | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    characterService.getCharacter(characterId, campaignId, session.userId, "player")
      .then(async (character) => {
        if (!character) throw new Error("This Character could not be found in the selected Campaign.");
        const spells = await characterSpellService.listSpells(character, session.userId);
        if (!active) return;
        setAggregate(character);
        setSavedSpells(spells);
      })
      .catch((error: unknown) => {
        if (active) setFeedback({ kind: "error", message: errorMessage(error) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [campaignId, characterId, session.userId]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeClosing = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [dirty]);

  const findFrameworkSkills = useCallback(
    (tradition: Tradition) => skillService.listSpellFrameworkSkills(tradition),
    [],
  );
  const selectedSaved = savedSpells.find(({ id }) => id === selectedSavedId) ?? null;
  const filteredSpells = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return savedSpells.filter(({ document: spell, inSpellbook }) => !query || [
      spell.name,
      spell.tradition,
      getSpellFrameworkName(spell),
      inSpellbook ? "spellbook" : "draft",
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [savedSpells, search]);
  const calculation = useMemo(() => calculateSpell(document), [document]);
  const availableCastingContexts = useMemo(
    () => aggregate ? getAvailableSpellCastingContexts(aggregate, document) : [],
    [aggregate, document],
  );

  useEffect(() => {
    if (document.castingSystem || availableCastingContexts.length !== 1) return;
    const system = availableCastingContexts[0]!.system;
    setDocument((current) => current.castingSystem
      ? current
      : { ...current, castingSystem: system });
  }, [availableCastingContexts, document.castingSystem]);

  function startNewSpell() {
    setDocument(createEmptySpell());
    setSelectedSavedId(null);
    setDirty(false);
    setFeedback(null);
  }

  function loadSpell(saved: CharacterSavedSpell) {
    setDocument(structuredClone(saved.document));
    setSelectedSavedId(saved.id);
    setDirty(false);
    setFeedback(null);
  }

  function performAction(action: PendingCalculatorAction) {
    if (action.kind === "new") startNewSpell();
    if (action.kind === "open") {
      const saved = savedSpells.find(({ id }) => id === action.savedSpellId);
      if (saved) loadSpell(saved);
    }
    if (action.kind === "spellbook") onOpenSpellbook();
    if (action.kind === "realms") onBack();
    if (action.kind === "logout") onLogout();
  }

  function requestAction(action: PendingCalculatorAction) {
    if (dirty) setPendingAction(action);
    else performAction(action);
  }

  function discardAndContinue() {
    const action = pendingAction;
    setPendingAction(null);
    setDirty(false);
    if (action) performAction(action);
  }

  function changeDocument(next: SpellDocument) {
    setDocument(next);
    setDirty(true);
    setFeedback(null);
  }

  function mergeSaved(saved: CharacterSavedSpell) {
    setSavedSpells((current) => [
      saved,
      ...current.filter(({ id }) => id !== saved.id),
    ]);
  }

  async function saveSpell(addToSpellbook: boolean) {
    if (!aggregate || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await characterSpellService.saveSpell(
        aggregate,
        session.userId,
        document,
        addToSpellbook,
      );
      mergeSaved(saved);
      setDocument(saved.document);
      setSelectedSavedId(saved.id);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: addToSpellbook
          ? `${saved.name.trim() || "Untitled Spell"} was saved and added to ${aggregate.character.name}'s Spellbook.`
          : `${saved.name.trim() || "Untitled Spell"} was saved as a personal Spell.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleSpellbook() {
    if (!aggregate || !selectedSaved || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = selectedSaved.inSpellbook
        ? await characterSpellService.setSpellbookStatus(
            aggregate,
            session.userId,
            selectedSaved.id,
            false,
          )
        : await characterSpellService.saveSpell(
            aggregate,
            session.userId,
            document,
            true,
          );
      mergeSaved(saved);
      setDocument(saved.document);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: saved.inSpellbook
          ? `${saved.name.trim() || "Untitled Spell"} was added to the Spellbook.`
          : `${saved.name.trim() || "Untitled Spell"} remains saved but was removed from the Spellbook.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSpell() {
    if (!aggregate || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await characterSpellService.duplicateSpell(
        aggregate,
        session.userId,
        document,
      );
      mergeSaved(saved);
      setDocument(saved.document);
      setSelectedSavedId(saved.id);
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.name} was created as an independent draft.` });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSpell() {
    if (!aggregate || !selectedSaved || saving) return;
    if (!window.confirm(`Permanently delete ${selectedSaved.name.trim() || "this saved Spell"}?`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      await characterSpellService.deleteSpell(
        aggregate,
        session.userId,
        selectedSaved.id,
      );
      setSavedSpells((current) => current.filter(({ id }) => id !== selectedSaved.id));
      setDocument(createEmptySpell());
      setSelectedSavedId(null);
      setDirty(false);
      setFeedback({ kind: "success", message: "The saved Spell was deleted." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="spell-player-page">
      <div className="spell-player-page__texture" aria-hidden="true" />
      <header className="spell-player-header">
        <div className="spell-player-header__brand"><BrandLogo /></div>
        <div className="spell-player-header__title">
          <p>THE REALMS · SPELL CONSTRUCTION</p>
          <h1>Magic Calculator</h1>
          <span>{aggregate ? `${aggregate.character.name} · ${aggregate.campaign.name}` : "Opening the formulae"}</span>
        </div>
        <div className="spell-player-header__actions">
          <button type="button" onClick={() => requestAction({ kind: "spellbook" })}>Spellbook</button>
          <button type="button" onClick={() => requestAction({ kind: "realms" })}>Return to Realms</button>
          <button type="button" onClick={() => requestAction({ kind: "logout" })}>Log Out</button>
        </div>
      </header>

      {loading ? (
        <section className="spell-player-loading"><p>PREPARING THE CALCULATOR</p><h2>Reading saved formulae…</h2></section>
      ) : !aggregate ? (
        <section className="spell-player-loading is-error"><p>THE CALCULATOR COULD NOT BE OPENED</p><h2>{feedback?.message ?? "Character magic is unavailable."}</h2><button type="button" onClick={onBack}>Return to Realms</button></section>
      ) : (
        <div className="spell-player-workspace spell-player-workspace--calculator">
          <aside className="spell-calculator-library">
            <div className="spell-player-section-heading"><div><p>PERSONAL FORMULAE</p><h3>Saved Spells</h3></div><button type="button" onClick={() => requestAction({ kind: "new" })}>New Spell</button></div>
            <label className="spell-player-search"><span>Search Saved Spells</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, type, or framework" /></label>
            <div className="spell-calculator-library__list">
              {filteredSpells.length === 0 ? <p className="spell-player-empty">No personal Spells have been saved yet.</p> : filteredSpells.map((saved) => {
                const savedCalculation = calculateSpell(saved.document);
                return (
                  <button type="button" key={saved.id} className={saved.id === selectedSavedId ? "is-active" : ""} onClick={() => requestAction({ kind: "open", savedSpellId: saved.id })}>
                    <span>{saved.inSpellbook ? "IN SPELLBOOK" : "SAVED DRAFT"}</span>
                    <strong>{saved.name.trim() || "Untitled Spell"}</strong>
                    <small>{savedCalculation.baseSpellManaCost} Mana · {savedCalculation.baseSpellMastery}</small>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="spell-calculator-editor">
            {feedback ? <p className={`spell-player-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
            <div className="spell-calculator-toolbar">
              <div><span>{selectedSaved ? (selectedSaved.inSpellbook ? "SAVED · IN SPELLBOOK" : "SAVED DRAFT") : "UNSAVED FORMULA"}</span><strong>{dirty ? "Unsaved changes" : "Current"}</strong></div>
              <div>
                <button type="button" disabled={saving} onClick={() => void saveSpell(false)}>{saving ? "Saving…" : "Save Spell"}</button>
                <button type="button" disabled={saving} onClick={() => void saveSpell(true)}>Save & Add to Spellbook</button>
                {selectedSaved ? <button type="button" disabled={saving} onClick={() => void toggleSpellbook()}>{selectedSaved.inSpellbook ? "Remove from Spellbook" : "Add to Spellbook"}</button> : null}
                <button type="button" disabled={saving} onClick={() => void duplicateSpell()}>Duplicate</button>
                {selectedSaved ? <button className="is-danger" type="button" disabled={saving} onClick={() => void deleteSpell()}>Delete</button> : null}
              </div>
            </div>
            <label className="spell-calculator-name"><span>Spell Name</span><input value={document.name} placeholder="Untitled Spell" onChange={(event) => changeDocument({ ...document, name: event.target.value, modifiedAt: new Date().toISOString() })} /></label>
            <label className="spell-calculator-casting-system">
              <span>Casting System</span>
              {document.tradition === "Spellcraft/Talismanism/Faith" ? (
                <select
                  value={document.castingSystem ?? ""}
                  onChange={(event) => changeDocument({
                    ...document,
                    castingSystem: event.target.value
                      ? event.target.value as SpellCastingSystem
                      : undefined,
                    modifiedAt: new Date().toISOString(),
                  })}
                >
                  <option value="">Choose Spellcraft, Talismanism, or Faith</option>
                  {document.castingSystem && !availableCastingContexts.some(({ system }) => system === document.castingSystem)
                    ? <option value={document.castingSystem}>{document.castingSystem} (not currently available)</option>
                    : null}
                  {availableCastingContexts.map(({ system, profile }) => (
                    <option key={system} value={system}>{system} · {profile.spellAccessLevel ?? "No caster level"} · {profile.manaPool} Mana</option>
                  ))}
                </select>
              ) : (
                <strong>{document.castingSystem ?? (document.tradition === "Psionics" ? "Psyonics" : "Bardic Resonance")}</strong>
              )}
              <small>{document.tradition === "Spellcraft/Talismanism/Faith"
                ? "This keeps Sphere magic tied to the Character's correct Spellcraft, Talismanism, or Faith tree."
                : "This magic type determines the Character's caster level and Mana pool."}</small>
            </label>
            <SpellCastingPanel
              spell={document}
              practitionerLevel={document.practitionerLevel}
              onPractitionerLevelChange={(practitionerLevel) => changeDocument({ ...document, practitionerLevel, modifiedAt: new Date().toISOString() })}
            />
            <div className="spell-calculator-editor__builder">
              <SpellConstructionEditor document={document} onChange={changeDocument} findFrameworkSkills={findFrameworkSkills} />
            </div>
            <div className="spell-calculator-save-footer">
              <span>Current base cost: <strong>{calculation.baseSpellManaCost} Mana</strong> · {calculation.baseSpellMastery}</span>
              <button type="button" disabled={saving} onClick={() => void saveSpell(false)}>{saving ? "Saving…" : "Save Spell"}</button>
              <button type="button" disabled={saving} onClick={() => void saveSpell(true)}>Save & Add to Spellbook</button>
            </div>
          </section>
        </div>
      )}
      {pendingAction ? (
        <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-spell-title">
          <div>
            <p id="discard-spell-title">Unsaved changes</p>
            <span>Leave this Spell and discard the changes you have not saved?</span>
          </div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPendingAction(null)}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
