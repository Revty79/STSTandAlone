import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SpellCastingPanel } from "../components/spells/SpellCastingPanel";
import { SpellPreview } from "../components/skills/SpellPreview";
import { calculateSpell } from "../features/spell-construction/engine/calculateSpell";
import { validateSpell } from "../features/spell-construction/engine/validateSpell";
import {
  SPELL_CASTING_SYSTEMS,
  type SpellCastingSystem,
  type SpellDocument,
} from "../features/spell-construction/models/spell";
import { parseSpellDocument } from "../features/spell-construction/spellDocumentCodec";
import { getSpellFrameworkName } from "../features/spell-construction/data/spellIdentity";
import {
  resolveCharacterSpellCastingContext,
  type CharacterSpellCastingContext,
} from "../features/characters/characterSpellCasting";
import { characterService } from "../services/characterService";
import { characterSpellService } from "../services/characterSpellService";
import type { CharacterAggregate } from "../types/character";
import type { CharacterSavedSpell } from "../types/characterSpell";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/spell-player.css";

type SpellbookEntry = {
  key: string;
  source: "catalog" | "personal";
  sourceLabel: string;
  document: SpellDocument;
  allocationId?: number;
};

type OrganizedSpellbookEntry = SpellbookEntry & {
  castingContext: CharacterSpellCastingContext | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Spellbook could not be opened.";
}

function knownCatalogSpells(aggregate: CharacterAggregate): SpellbookEntry[] {
  const skillsById = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
  const entries: SpellbookEntry[] = [];
  for (const allocation of aggregate.skillAllocations) {
    if (allocation.points <= 0) continue;
    const skill = skillsById.get(allocation.skillId);
    if (!skill?.spellDocumentJson) continue;
    try {
      entries.push({
        key: `catalog:${allocation.id}`,
        source: "catalog",
        sourceLabel: "Known Catalog Spell",
        document: parseSpellDocument(skill.spellDocumentJson),
        allocationId: allocation.id,
      });
    } catch {
      // A damaged master Spell remains hidden instead of breaking the full book.
    }
  }
  return entries;
}

function personalSpellbookSpells(spells: CharacterSavedSpell[]): SpellbookEntry[] {
  return spells
    .filter(({ inSpellbook }) => inSpellbook)
    .map((saved) => ({
      key: `personal:${saved.id}`,
      source: "personal" as const,
      sourceLabel: "Personal Spell",
      document: saved.document,
    }));
}

export function SpellbookPage({
  session,
  campaignId,
  characterId,
  onOpenCalculator,
  onBack,
  onLogout,
}: {
  session: AuthSession;
  campaignId: number;
  characterId: number;
  onOpenCalculator: () => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [aggregate, setAggregate] = useState<CharacterAggregate | null>(null);
  const [savedSpells, setSavedSpells] = useState<CharacterSavedSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [activeSystem, setActiveSystem] = useState<SpellCastingSystem>("Spellcraft");

  useEffect(() => {
    let active = true;
    setLoading(true);
    characterService.getCharacter(characterId, campaignId, session.userId, "player")
      .then(async (character) => {
        if (!character) throw new Error("This Character could not be found in the selected Campaign.");
        const personal = await characterSpellService.listSpells(character, session.userId);
        if (!active) return;
        setAggregate(character);
        setSavedSpells(personal);
      })
      .catch((error: unknown) => {
        if (active) setFeedback(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [campaignId, characterId, session.userId]);

  const entries = useMemo(
    () => aggregate
      ? [...knownCatalogSpells(aggregate), ...personalSpellbookSpells(savedSpells)]
          .sort((left, right) => left.document.name.localeCompare(right.document.name))
      : [],
    [aggregate, savedSpells],
  );
  const organizedEntries = useMemo<OrganizedSpellbookEntry[]>(
    () => aggregate
      ? entries.map((entry) => ({
          ...entry,
          castingContext: resolveCharacterSpellCastingContext(
            aggregate,
            entry.document,
            entry.allocationId,
          ),
        }))
      : [],
    [aggregate, entries],
  );
  const activeEntries = useMemo(
    () => organizedEntries.filter(({ castingContext }) => castingContext?.system === activeSystem),
    [activeSystem, organizedEntries],
  );
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return activeEntries;
    return activeEntries.filter(({ document, sourceLabel }) => [
      document.name,
      document.tradition,
      getSpellFrameworkName(document),
      document.description,
      sourceLabel,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [activeEntries, search]);
  const selected = filteredEntries.find(({ key }) => key === selectedKey) ?? filteredEntries[0];
  const unassignedCount = organizedEntries.filter(({ castingContext }) => !castingContext).length;

  useEffect(() => {
    if (selected && selected.key !== selectedKey) setSelectedKey(selected.key);
  }, [selected, selectedKey]);

  const calculation = selected ? calculateSpell(selected.document) : null;
  const validation = selected && calculation
    ? validateSpell(selected.document, undefined, calculation)
    : null;
  const castingContext = selected?.castingContext ?? null;

  return (
    <main className="spell-player-page">
      <div className="spell-player-page__texture" aria-hidden="true" />
      <header className="spell-player-header">
        <div className="spell-player-header__brand"><BrandLogo /></div>
        <div className="spell-player-header__title">
          <p>THE REALMS · CHARACTER MAGIC</p>
          <h1>Spellbook</h1>
          <span>{aggregate ? `${aggregate.character.name} · ${aggregate.campaign.name}` : "Opening the grimoire"}</span>
        </div>
        <div className="spell-player-header__actions">
          <button type="button" onClick={onOpenCalculator}>Magic Calculator</button>
          <button type="button" onClick={onBack}>Return to Realms</button>
          <button type="button" onClick={onLogout}>Log Out</button>
        </div>
      </header>

      {loading ? (
        <section className="spell-player-loading"><p>OPENING THE GRIMOIRE</p><h2>Reading known Spells…</h2></section>
      ) : feedback || !aggregate ? (
        <section className="spell-player-loading is-error"><p>THE GRIMOIRE COULD NOT BE OPENED</p><h2>{feedback || "Character Spellbook is unavailable."}</h2><button type="button" onClick={onBack}>Return to Realms</button></section>
      ) : (
        <div className="spellbook-system-layout">
          <nav className="spellbook-system-tabs" aria-label="Spellbook magic systems" role="tablist">
            {SPELL_CASTING_SYSTEMS.map((system) => {
              const count = organizedEntries.filter(({ castingContext: context }) => context?.system === system).length;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSystem === system}
                  className={activeSystem === system ? "is-active" : ""}
                  key={system}
                  onClick={() => {
                    setActiveSystem(system);
                    setSelectedKey("");
                  }}
                >
                  <span>{system}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </nav>
          <div className="spell-player-workspace spell-player-workspace--book">
          <aside className="spellbook-library">
            <div className="spell-player-section-heading"><div><p>KNOWN MAGIC</p><h3>{entries.length} {entries.length === 1 ? "Spell" : "Spells"}</h3></div></div>
            <label className="spell-player-search"><span>Search {activeSystem}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or framework" /></label>
            {unassignedCount > 0 ? <p className="spellbook-library__warning">{unassignedCount} personal {unassignedCount === 1 ? "Spell needs" : "Spells need"} a casting system selected in the Magic Calculator.</p> : null}
            <div className="spellbook-library__list">
              {filteredEntries.length === 0 ? (
                <p className="spell-player-empty">{entries.length === 0 ? "This Character does not know any Spells yet." : search.trim() ? `No ${activeSystem} Spells match this search.` : `This Character has no ${activeSystem} Spells.`}</p>
              ) : filteredEntries.map((entry) => {
                const spellCalculation = calculateSpell(entry.document);
                return (
                  <button type="button" key={entry.key} className={entry.key === selected?.key ? "is-active" : ""} onClick={() => setSelectedKey(entry.key)}>
                    <span>{entry.sourceLabel}</span>
                    <strong>{entry.document.name.trim() || "Untitled Spell"}</strong>
                    <small>{getSpellFrameworkName(entry.document) || entry.document.tradition} · {spellCalculation.baseSpellManaCost} Mana · {spellCalculation.baseSpellMastery}</small>
                  </button>
                );
              })}
            </div>
          </aside>
          <section className="spellbook-detail">
            {selected && calculation && validation ? (
              <>
                <div className="spellbook-detail__source"><span>{selected.sourceLabel}{castingContext ? ` · ${castingContext.system}` : ""}</span><strong>{selected.document.name.trim() || "Untitled Spell"}</strong></div>
                <SpellCastingPanel
                  spell={selected.document}
                  practitionerLevel={castingContext?.profile.spellAccessLevel ?? undefined}
                  castingSystem={castingContext?.system}
                  manaPool={castingContext?.profile.manaPool}
                  automaticKnownSpell
                />
                <article className="skill-preview spellbook-detail__preview">
                  <SpellPreview spell={selected.document} calculation={calculation} validation={validation} />
                </article>
              </>
            ) : (
              <div className="spell-player-empty spell-player-empty--large"><h2>No {activeSystem} Spells</h2><p>Choose another magic-system tab, or add a personal Spell from the Magic Calculator.</p><button type="button" onClick={onOpenCalculator}>Open Magic Calculator</button></div>
            )}
          </section>
        </div>
        </div>
      )}
    </main>
  );
}
