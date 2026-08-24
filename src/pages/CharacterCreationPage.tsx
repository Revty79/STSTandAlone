import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import {
  formatCampaignMoney,
  getCampaignMoneyBreakdown,
} from "../features/currency/currencyRules";
import {
  evaluateCharacterReadiness,
  getAttributeModifier,
  getAttributePointsUsed,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterHp,
  getCharacterSkillRanks,
  getMovementInitiative,
  getRaceAttributeCap,
  getSkillPointsUsed,
  getSkillRank,
  getSkillRollTarget,
  getStartingFundsRemaining,
  isSkillAllowedByCampaign,
  normalizeSkillAttributeKey,
} from "../features/characters/characterRules";
import {
  characterAggregateToDraft,
  characterService,
} from "../services/characterService";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterSkillAllocationDraft,
  type CharacterSkillReference,
} from "../types/character";
import type { RaceAggregate } from "../types/race";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/character-creation.css";

const TABS = [
  ["identity", "Identity"],
  ["attributes", "Attributes"],
  ["skills", "Skills & Abilities"],
  ["story", "Story & Personality"],
  ["equipment", "Equipment"],
  ["sheet", "Character Sheet"],
] as const;

type TabId = (typeof TABS)[number][0];
type PendingExit = "back" | "logout";

type Props = {
  session: AuthSession;
  campaignId: number;
  characterId: number;
  onBack: () => void;
  onLogout: () => void;
};

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function signedNumber(value: number): string {
  return value > 0 ? `+${displayNumber(value)}` : displayNumber(value);
}

function numericValue(value: string, fallback = 0): number {
  if (!value.trim()) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function allocationFor(
  draft: CharacterDraft,
  skillId: number,
  parentDraftId: number | null,
): CharacterSkillAllocationDraft | undefined {
  return draft.skillAllocations.find((allocation) =>
    allocation.skillId === skillId && allocation.parentDraftId === parentDraftId,
  );
}

type SkillBranchProps = {
  skill: CharacterSkillReference;
  rootSkill: CharacterSkillReference;
  parentDraftId: number | null;
  parentRank: number | null;
  depth: number;
  visited: ReadonlySet<number>;
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  ranks: ReadonlyMap<number, number>;
  childrenByParent: ReadonlyMap<number, CharacterSkillReference[]>;
  onPointsChange: (
    skillId: number,
    parentDraftId: number | null,
    points: number,
  ) => void;
  onShowDescription: (skill: CharacterSkillReference) => void;
};

function SkillBranch({
  skill,
  rootSkill,
  parentDraftId,
  parentRank,
  depth,
  visited,
  aggregate,
  draft,
  ranks,
  childrenByParent,
  onPointsChange,
  onShowDescription,
}: SkillBranchProps) {
  if (visited.has(skill.id)) return null;
  if (!isSkillAllowedByCampaign(skill, rootSkill, aggregate.campaign.allowedSystems)) return null;

  const allocation = allocationFor(draft, skill.id, parentDraftId);
  const points = allocation?.points ?? 0;
  const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
  const attributeScore = attributeKey ? draft.attributes[attributeKey] : 0;
  const rank = allocation
    ? ranks.get(allocation.draftId) ?? 0
    : getSkillRank(
        0,
        attributeKey ? getAttributeModifier(attributeScore) : 0,
        parentRank,
        skill.tier,
      );
  const isLocked = parentDraftId !== null
    && (parentRank === null
      || !draft.skillAllocations.some((row) =>
        row.draftId === parentDraftId
          && row.points >= aggregate.campaign.pointsToUnlockNextTier,
      ));
  const nextVisited = new Set(visited).add(skill.id);
  const children = childrenByParent.get(skill.id) ?? [];
  const maxAllocation = Math.min(
    aggregate.campaign.maxStartingSkill,
    aggregate.campaign.maxPointsInSkill,
  );

  return (
    <div className="character-skill-branch" style={{ "--skill-depth": depth } as React.CSSProperties}>
      <div className={`character-skill-row${isLocked ? " is-locked" : ""}`}>
        <div className="character-skill-row__identity">
          <div>
            <strong>{skill.name}</strong>
            <a
              href={`#skill-description-${skill.id}`}
              role="button"
              aria-label={`Read ${skill.name} description`}
              title={`Read ${skill.name} description`}
              onClick={(event) => {
                event.preventDefault();
                onShowDescription(skill);
              }}
            >?</a>
          </div>
          <span>
            {skill.tier === null ? skill.classification : `Tier ${skill.tier}`}
            {attributeKey ? ` · ${attributeKey}` : ""}
          </span>
        </div>
        <label>
          <span>Points</span>
          <input
            aria-label={`${skill.name} Points Invested`}
            type="number"
            min="0"
            max={maxAllocation}
            step="1"
            disabled={isLocked}
            value={points}
            onChange={(event) => onPointsChange(
              skill.id,
              parentDraftId,
              numericValue(event.target.value),
            )}
          />
        </label>
        <div><span>Rank</span><strong>{displayNumber(rank)}</strong></div>
        <div>
          <span>Roll Target</span>
          <strong>{attributeKey ? `${displayNumber(getSkillRollTarget(attributeScore, rank))}%` : "—"}</strong>
        </div>
      </div>
      {isLocked ? (
        <p className="character-skill-row__lock">
          Parent requires {displayNumber(aggregate.campaign.pointsToUnlockNextTier)} invested points.
        </p>
      ) : null}
      {allocation && children.length > 0 ? (
        <div className="character-skill-children">
          {children.map((child) => (
            <SkillBranch
              key={`${allocation.draftId}:${child.id}`}
              skill={child}
              rootSkill={rootSkill}
              parentDraftId={allocation.draftId}
              parentRank={rank}
              depth={depth + 1}
              visited={nextVisited}
              aggregate={aggregate}
              draft={draft}
              ranks={ranks}
              childrenByParent={childrenByParent}
              onPointsChange={onPointsChange}
              onShowDescription={onShowDescription}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CharacterCreationPage({
  session,
  campaignId,
  characterId,
  onBack,
  onLogout,
}: Props) {
  const [aggregate, setAggregate] = useState<CharacterAggregate | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [selectedRace, setSelectedRace] = useState<RaceAggregate | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("identity");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [raceLoading, setRaceLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const [confirmCompletion, setConfirmCompletion] = useState(false);
  const [describedSkill, setDescribedSkill] = useState<CharacterSkillReference | null>(null);
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [activeSkillGroup, setActiveSkillGroup] = useState("STR");
  const nextDraftId = useRef(-1);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFeedback(null);
    characterService.getCharacter(characterId, campaignId, session.userId)
      .then((loaded) => {
        if (!current) return;
        if (!loaded) {
          setFeedback({
            kind: "error",
            message: "This Character is not available to the logged-in Player in the selected Campaign.",
          });
          return;
        }
        setAggregate(loaded);
        setDraft(characterAggregateToDraft(loaded));
        setSelectedRace(loaded.selectedRace);
        if (loaded.profile.creationCompletedAt) setActiveTab("sheet");
        setDirty(false);
      })
      .catch((error) => {
        if (current) {
          setFeedback({
            kind: "error",
            message: error instanceof Error
              ? `The Character could not be opened: ${error.message}`
              : "The Character could not be opened from the local archive.",
          });
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [campaignId, characterId, session.userId]);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeClosing(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [dirty]);

  const readiness = useMemo(
    () => aggregate && draft
      ? evaluateCharacterReadiness(draft, aggregate, selectedRace)
      : null,
    [aggregate, draft, selectedRace],
  );
  const creationLocked = aggregate?.profile.creationCompletedAt !== null
    && aggregate?.profile.creationCompletedAt !== undefined;

  function campaignMoney(canonicalCredits: number): string {
    if (!aggregate) return "";
    return formatCampaignMoney(
      canonicalCredits,
      aggregate.campaign.currencySystem,
      aggregate.campaign.derivedCurrencies,
    );
  }
  const ranks = useMemo(
    () => aggregate && draft
      ? getCharacterSkillRanks(draft, aggregate.skillCatalog)
      : new Map<number, number>(),
    [aggregate, draft],
  );
  const childrenByParent = useMemo(() => {
    const result = new Map<number, CharacterSkillReference[]>();
    if (!aggregate) return result;
    const skills = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
    for (const relationship of aggregate.skillRelationships) {
      if (relationship.relationshipType.toLocaleLowerCase() !== "parent") continue;
      const child = skills.get(relationship.skillId);
      if (!child) continue;
      const children = result.get(relationship.relatedSkillId) ?? [];
      if (!children.some((candidate) => candidate.id === child.id)) children.push(child);
      result.set(relationship.relatedSkillId, children);
    }
    for (const children of result.values()) {
      children.sort((left, right) => left.name.localeCompare(right.name));
    }
    return result;
  }, [aggregate]);
  const skillGroups = useMemo(() => {
    if (!aggregate) return [] as Array<{ key: string; label: string; skills: CharacterSkillReference[] }>;
    const childIds = new Set(aggregate.skillRelationships
      .filter((relationship) => relationship.relationshipType.toLocaleLowerCase() === "parent")
      .map((relationship) => relationship.skillId));
    const groups = new Map<string, CharacterSkillReference[]>();
    for (const skill of aggregate.skillCatalog) {
      if (childIds.has(skill.id) || (skill.tier !== null && skill.tier > 1)) continue;
      if (!isSkillAllowedByCampaign(skill, skill, aggregate.campaign.allowedSystems)) continue;
      const attribute = normalizeSkillAttributeKey(skill.primaryAttribute);
      const key = skill.classification.toLocaleLowerCase() === "standard" && attribute
        ? attribute
        : "SPECIAL";
      const rows = groups.get(key) ?? [];
      rows.push(skill);
      groups.set(key, rows);
    }
    return [...CHARACTER_ATTRIBUTE_KEYS.map((key) => ({
      key,
      label: CHARACTER_ATTRIBUTE_LABELS[key],
      skills: (groups.get(key) ?? []).sort((left, right) => left.name.localeCompare(right.name)),
    })), {
      key: "SPECIAL",
      label: "Special Abilities & Systems",
      skills: (groups.get("SPECIAL") ?? []).sort((left, right) => left.name.localeCompare(right.name)),
    }].filter((group) => group.skills.length > 0);
  }, [aggregate]);

  function changeDraft(updater: (current: CharacterDraft) => CharacterDraft) {
    if (creationLocked) return;
    setDraft((current) => current ? updater(current) : current);
    setFeedback(null);
    setDirty(true);
  }

  function changeText(field: keyof CharacterDraft["profile"], value: string) {
    changeDraft((current) => ({
      ...current,
      profile: { ...current.profile, [field]: value },
    }));
  }

  function changeOptionalNumber(
    field: "age" | "weight",
    value: string,
  ) {
    changeDraft((current) => ({
      ...current,
      profile: {
        ...current.profile,
        [field]: value.trim() ? Math.max(0, numericValue(value)) : null,
      },
    }));
  }

  function changeHeightPart(
    field: "heightFeet" | "heightInches",
    value: string,
  ) {
    changeDraft((current) => ({
      ...current,
      profile: {
        ...current.profile,
        [field]: value.trim()
          ? Math.min(field === "heightInches" ? 11 : Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(numericValue(value))))
          : null,
      },
    }));
  }

  async function chooseRace(value: string) {
    if (!aggregate || !draft || creationLocked) return;
    if (!value) {
      setSelectedRace(null);
      changeDraft((current) => ({
        ...current,
        profile: { ...current.profile, raceId: null },
      }));
      return;
    }
    setRaceLoading(true);
    setFeedback(null);
    try {
      const race = await characterService.getAllowedRace(
        aggregate,
        session.userId,
        Number(value),
      );
      if (!race) throw new Error("That Race is not allowed by this Campaign.");
      setSelectedRace(race);
      changeDraft((current) => {
        const attributes = { ...current.attributes };
        for (const key of CHARACTER_ATTRIBUTE_KEYS) {
          const cap = getRaceAttributeCap(race, key);
          if (cap !== null) attributes[key] = Math.min(attributes[key], cap);
        }
        return {
          ...current,
          attributes,
          profile: { ...current.profile, raceId: race.race.id },
        };
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The selected Race could not be read.",
      });
    } finally {
      setRaceLoading(false);
    }
  }

  function setAttribute(key: CharacterAttributeKey, requested: number) {
    if (!aggregate || !draft || creationLocked) return;
    const otherPoints = getAttributePointsUsed(draft) - draft.attributes[key];
    const budgetMaximum = Math.max(0, aggregate.campaign.attributePoints - otherPoints);
    const cap = getRaceAttributeCap(selectedRace, key);
    const maximum = cap === null ? budgetMaximum : Math.min(budgetMaximum, cap);
    const value = Math.min(Math.max(0, requested), maximum);
    changeDraft((current) => ({
      ...current,
      attributes: { ...current.attributes, [key]: value },
    }));
  }

  function removeSkillDescendants(
    allocations: readonly CharacterSkillAllocationDraft[],
    parentDraftId: number,
  ): CharacterSkillAllocationDraft[] {
    const removeIds = new Set<number>([parentDraftId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const allocation of allocations) {
        if (allocation.parentDraftId !== null
          && removeIds.has(allocation.parentDraftId)
          && !removeIds.has(allocation.draftId)) {
          removeIds.add(allocation.draftId);
          changed = true;
        }
      }
    }
    removeIds.delete(parentDraftId);
    return allocations.filter((allocation) => !removeIds.has(allocation.draftId));
  }

  function setSkillPoints(
    skillId: number,
    parentDraftId: number | null,
    requested: number,
  ) {
    if (!aggregate || !draft || creationLocked) return;
    const currentAllocation = allocationFor(draft, skillId, parentDraftId);
    const currentPoints = currentAllocation?.points ?? 0;
    const remainingWithCurrent = aggregate.campaign.skillPoints
      - getSkillPointsUsed(draft)
      + currentPoints;
    const maximum = Math.min(
      aggregate.campaign.maxStartingSkill,
      aggregate.campaign.maxPointsInSkill,
      Math.max(0, remainingWithCurrent),
    );
    const points = Math.min(Math.max(0, requested), maximum);
    changeDraft((current) => {
      let allocations = [...current.skillAllocations];
      const existing = allocationFor(current, skillId, parentDraftId);
      if (!existing && points > 0) {
        allocations.push({
          draftId: nextDraftId.current--,
          skillId,
          parentDraftId,
          points,
        });
      } else if (existing && points <= 0) {
        allocations = removeSkillDescendants(allocations, existing.draftId)
          .filter((allocation) => allocation.draftId !== existing.draftId);
      } else if (existing) {
        allocations = allocations.map((allocation) =>
          allocation.draftId === existing.draftId ? { ...allocation, points } : allocation,
        );
        if (points < aggregate.campaign.pointsToUnlockNextTier) {
          allocations = removeSkillDescendants(allocations, existing.draftId);
        }
      }
      return { ...current, skillAllocations: allocations };
    });
  }

  function changeItemQuantity(itemId: number, requestedQuantity: number) {
    if (!aggregate || !draft || creationLocked) return;
    const catalogItem = aggregate.authorizedItems.find((item) => item.id === itemId);
    if (!catalogItem || catalogItem.credits === null || catalogItem.credits < 0) return;
    const existing = draft.items.find((item) => item.itemId === itemId);
    const spentWithoutItem = draft.items
      .filter((item) => item.itemId !== itemId)
      .reduce((sum, item) => sum + item.quantity * item.unitCostCredits, 0);
    const maximumQuantity = catalogItem.credits === 0
      ? 999
      : Math.floor((aggregate.campaign.startingCreditAmount - spentWithoutItem) / catalogItem.credits);
    const quantity = Math.min(Math.max(0, Math.trunc(requestedQuantity)), maximumQuantity);
    changeDraft((current) => ({
      ...current,
      items: quantity === 0
        ? current.items.filter((item) => item.itemId !== itemId)
        : existing
          ? current.items.map((item) => item.itemId === itemId
              ? { ...item, quantity, unitCostCredits: catalogItem.credits as number }
              : item)
          : [...current.items, {
              itemId,
              quantity,
              unitCostCredits: catalogItem.credits as number,
            }],
    }));
  }

  async function saveCharacter(completeCreation = false) {
    if (!aggregate || !draft || saving || creationLocked) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await characterService.saveCharacter(
        aggregate,
        draft,
        session.userId,
        completeCreation,
      );
      setAggregate(saved);
      setDraft(characterAggregateToDraft(saved));
      setSelectedRace(saved.selectedRace);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: completeCreation
          ? "Character creation is complete. The creation record is now permanently locked."
          : "Character draft saved to the local archive.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error
          ? `The Character could not be saved: ${error.message}`
          : "The Character could not be saved. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function requestExit(destination: PendingExit) {
    if (dirty) setPendingExit(destination);
    else if (destination === "back") onBack();
    else onLogout();
  }

  function discardAndExit() {
    const destination = pendingExit;
    setPendingExit(null);
    if (destination === "back") onBack();
    else if (destination === "logout") onLogout();
  }

  function renderIdentity() {
    if (!aggregate || !draft) return null;
    const race = selectedRace?.race;
    return (
      <section className="character-panel" aria-labelledby="character-identity-title">
        <header className="character-panel__heading">
          <div><p>PERSONAL RECORD</p><h2 id="character-identity-title">Identity</h2></div>
          <span>Fields marked Required determine readiness.</span>
        </header>
        <div className="character-field-grid character-field-grid--identity">
          <label><span>Character Name · Required</span><input value={draft.name} onChange={(event) => changeDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>Player</span><input value={aggregate.character.playerUsername} readOnly /></label>
          <label><span>Campaign</span><input value={aggregate.campaign.name} readOnly /></label>
          <label>
            <span>Race · Required</span>
            <select value={draft.profile.raceId ?? ""} disabled={raceLoading} onChange={(event) => void chooseRace(event.target.value)}>
              <option value="">Choose a Campaign Race</option>
              {aggregate.allowedRaces.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <label><span>Age · Required</span><input type="number" min="0" value={draft.profile.age ?? ""} onChange={(event) => changeOptionalNumber("age", event.target.value)} /></label>
          <label><span>Sex · Required</span><input value={draft.profile.sex} onChange={(event) => changeText("sex", event.target.value)} /></label>
          <div className="character-height-field">
            <span>Height · Required</span>
            <div>
              <label><span>Feet</span><input aria-label="Height in feet" type="number" min="0" step="1" value={draft.profile.heightFeet ?? ""} onChange={(event) => changeHeightPart("heightFeet", event.target.value)} /></label>
              <label><span>Inches</span><input aria-label="Additional height in inches" type="number" min="0" max="11" step="1" value={draft.profile.heightInches ?? ""} onChange={(event) => changeHeightPart("heightInches", event.target.value)} /></label>
            </div>
          </div>
          <label><span>Weight · Required</span><input type="number" min="0" step="0.01" value={draft.profile.weight ?? ""} onChange={(event) => changeOptionalNumber("weight", event.target.value)} /></label>
          <label><span>Skin Color · Required</span><input value={draft.profile.skinColor} onChange={(event) => changeText("skinColor", event.target.value)} /></label>
          <label><span>Eye Color · Required</span><input value={draft.profile.eyeColor} onChange={(event) => changeText("eyeColor", event.target.value)} /></label>
          <label><span>Hair Color · Required</span><input value={draft.profile.hairColor} onChange={(event) => changeText("hairColor", event.target.value)} /></label>
          <label><span>Deity · Optional</span><input value={draft.profile.deity} onChange={(event) => changeText("deity", event.target.value)} /></label>
          <label className="character-field-grid__wide"><span>Defining Marks & Character Quirks · Optional</span><textarea rows={3} value={draft.profile.definingMarks} onChange={(event) => changeText("definingMarks", event.target.value)} /></label>
        </div>
        {race ? (
          <div className="character-race-record">
            <header><p>RACE RECORD</p><h3>{race.name}</h3></header>
            <div className="character-record-grid">
              <div><span>Size</span><strong>{race.size || "Not recorded"}</strong></div>
              <div><span>Base Magic</span><strong>{race.baseMagic ?? "Not recorded"}</strong></div>
              <div className="character-record-grid__wide"><span>Racial Quirk</span><strong>{race.racialQuirkName || "None recorded"}</strong><small>{[race.quirkSuccessEffect, race.quirkFailureEffect].filter(Boolean).join(" · ")}</small></div>
            </div>
            <div className="character-race-columns">
              <div><h4>Movement Modes</h4>{selectedRace?.movementModes.length ? selectedRace.movementModes.map((mode) => <p key={mode.id}>{mode.movementMode} · Base {displayNumber(mode.baseValue)}{mode.notes ? ` · ${mode.notes}` : ""}</p>) : <p>No movement modes recorded.</p>}</div>
              <div><h4>Racial Skill Links</h4>{selectedRace?.skillLinks.length ? selectedRace.skillLinks.map((link) => <p key={link.id}>{link.skillName} · {link.linkType}{link.value === null ? "" : ` ${displayNumber(link.value)}`}</p>) : <p>No racial Skill links recorded.</p>}</div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  function renderAttributes() {
    if (!aggregate || !draft) return null;
    const used = getAttributePointsUsed(draft);
    const dexterity = draft.attributes.DEX;
    return (
      <section className="character-panel" aria-labelledby="character-attributes-title">
        <header className="character-panel__heading">
          <div><p>CAMPAIGN ALLOCATION</p><h2 id="character-attributes-title">Attributes</h2></div>
          <span>{displayNumber(used)} used · {displayNumber(aggregate.campaign.attributePoints - used)} remaining</span>
        </header>
        {!selectedRace ? <p className="character-panel__note">Choose a Race to apply its recorded Attribute caps. Missing Race caps are never replaced with an invented maximum.</p> : null}
        <div className="character-attribute-grid">
          {CHARACTER_ATTRIBUTE_KEYS.map((key) => {
            const score = draft.attributes[key];
            const cap = getRaceAttributeCap(selectedRace, key);
            return (
              <article key={key} className="character-attribute-card">
                <header><div><p>{key}</p><h3>{CHARACTER_ATTRIBUTE_LABELS[key]}</h3></div><span>{cap === null ? "No recorded cap" : `Race cap ${displayNumber(cap)}`}</span></header>
                <label><span>Score</span><input aria-label={`${CHARACTER_ATTRIBUTE_LABELS[key]} Score`} type="number" min="0" step="1" value={score} onChange={(event) => setAttribute(key, numericValue(event.target.value))} /></label>
                <dl><div><dt>Modifier</dt><dd>{signedNumber(getAttributeModifier(score))}</dd></div><div><dt>Roll Target</dt><dd>{displayNumber(getAttributeRollTarget(score))}%</dd></div></dl>
              </article>
            );
          })}
        </div>
        <div className="character-derived-strip">
          <div><span>HP Total</span><strong>{displayNumber(getCharacterHp(draft.attributes.CON))}</strong></div>
          <div><span>Base Initiative</span><strong>{displayNumber(getBaseInitiative(dexterity))}</strong></div>
          {selectedRace?.movementModes.map((mode) => <div key={mode.id}><span>{mode.movementMode} Initiative</span><strong>{displayNumber(getMovementInitiative(dexterity, mode.baseValue))}</strong></div>)}
        </div>
      </section>
    );
  }

  function renderSkills() {
    if (!aggregate || !draft) return null;
    const used = getSkillPointsUsed(draft);
    const selectedGroup = skillGroups.find((group) => group.key === activeSkillGroup)
      ?? skillGroups[0];
    return (
      <section className="character-panel" aria-labelledby="character-skills-title">
        <header className="character-panel__heading">
          <div><p>CURRENT SKILL CATALOG</p><h2 id="character-skills-title">Skills & Abilities</h2></div>
          <span>{displayNumber(used)} / {displayNumber(aggregate.campaign.skillPoints)} points</span>
        </header>
        <div className="character-rule-ledger">
          <span>Max Starting Skill <strong>{displayNumber(aggregate.campaign.maxStartingSkill)}</strong></span>
          <span>Unlock Next Tier <strong>{displayNumber(aggregate.campaign.pointsToUnlockNextTier)}</strong></span>
          <span>Max Points in a Skill <strong>{displayNumber(aggregate.campaign.maxPointsInSkill)}</strong></span>
          <span>Allowed <strong>{aggregate.campaign.allowedSystems.join(" · ") || "None"}</strong></span>
        </div>
        <p className="character-panel__note">A nested Skill appears beneath each valid parent path. Only Campaign-authorized tiers and systems are shown.</p>
        <nav className="character-skill-attribute-tabs" role="tablist" aria-label="Skill Attribute groups">
          {skillGroups.map((group) => (
            <a
              key={group.key}
              href={`#character-skill-group-${group.key.toLocaleLowerCase()}`}
              role="tab"
              aria-selected={selectedGroup?.key === group.key}
              className={selectedGroup?.key === group.key ? "is-active" : ""}
              onClick={(event) => {
                event.preventDefault();
                setActiveSkillGroup(group.key);
              }}
            >
              <span>{group.label}</span>
              <small>{group.skills.length}</small>
            </a>
          ))}
        </nav>
        <div className="character-skill-groups" role="tabpanel">
          {selectedGroup ? (
            <section id={`character-skill-group-${selectedGroup.key.toLocaleLowerCase()}`} className="character-skill-group">
              <header><span>{selectedGroup.label}</span><small>{selectedGroup.skills.length} root {selectedGroup.skills.length === 1 ? "Skill" : "Skills"}</small></header>
              <div className="character-skill-group__body">
                {selectedGroup.skills.map((skill) => (
                  <SkillBranch
                    key={skill.id}
                    skill={skill}
                    rootSkill={skill}
                    parentDraftId={null}
                    parentRank={null}
                    depth={0}
                    visited={new Set()}
                    aggregate={aggregate}
                    draft={draft}
                    ranks={ranks}
                    childrenByParent={childrenByParent}
                    onPointsChange={setSkillPoints}
                    onShowDescription={setDescribedSkill}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {skillGroups.length === 0 ? <p className="character-empty">This Campaign does not currently authorize any root Skills.</p> : null}
        </div>
      </section>
    );
  }

  function renderStory() {
    if (!draft) return null;
    const fields = [
      ["personality", "Personality Summary"],
      ["goals", "Goals"],
      ["secrets", "Secrets"],
      ["backstory", "Backstory"],
      ["motivations", "Motivations"],
    ] as const;
    return (
      <section className="character-panel" aria-labelledby="character-story-title">
        <header className="character-panel__heading"><div><p>OPTIONAL NARRATIVE RECORD</p><h2 id="character-story-title">Story & Personality</h2></div><span>Write as much or as little as serves the Character.</span></header>
        <div className="character-story-grid">
          {fields.map(([field, label]) => <label key={field}><span>{label}</span><textarea rows={field === "backstory" ? 8 : 5} value={draft.profile[field]} onChange={(event) => changeText(field, event.target.value)} /></label>)}
        </div>
      </section>
    );
  }

  function renderEquipment() {
    if (!aggregate || !draft) return null;
    const remaining = getStartingFundsRemaining(draft, aggregate.campaign.startingCreditAmount);
    const purse = getCampaignMoneyBreakdown(
      remaining,
      aggregate.campaign.currencySystem,
      aggregate.campaign.derivedCurrencies,
    );
    const search = equipmentSearch.trim().toLocaleLowerCase();
    const available = aggregate.authorizedItems.filter((item) => !search
      || [item.name, item.canonicalId, item.category, item.recordType]
        .some((value) => value.toLocaleLowerCase().includes(search)));
    return (
      <section className="character-panel" aria-labelledby="character-equipment-title">
        <header className="character-panel__heading"><div><p>CAMPAIGN-AUTHORIZED CATALOG</p><h2 id="character-equipment-title">Equipment</h2></div><span>{purse.formatted} remaining</span></header>
        {aggregate.campaign.currencySystem === "Derived Currency" ? (
          <>
            <div className="character-currency-ledger" aria-label="Current game currency breakdown">
              {purse.entries.map((currency) => <div key={currency.id}><strong>{displayNumber(currency.quantity)} {currency.name}</strong><span>{currency.description || "Campaign currency"}</span></div>)}
            </div>
            {!purse.fullyRepresented ? <p className="character-currency-warning">The configured denominations cannot exactly represent this balance. Ask the G.O.D. to add a smaller denomination.</p> : null}
          </>
        ) : null}
        <label className="character-equipment-search"><span>Search permitted Items</span><input type="search" value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="Name, ID, category, or type" /></label>
        <div className="character-equipment-list">
          {available.map((item) => {
            const owned = draft.items.find((row) => row.itemId === item.id);
            const quantity = owned?.quantity ?? 0;
            return (
              <article key={item.id}>
                <div><p>{item.canonicalId} · {item.recordType}</p><h3>{item.name}</h3><span>{item.category}{item.equipmentGroup ? ` · ${item.equipmentGroup}` : ""}</span></div>
                <div className="character-equipment-list__cost"><span>Cost</span><strong>{item.credits === null ? "Not priced" : campaignMoney(item.credits)}</strong><small>{item.priceBasis}</small></div>
                <label><span>Owned</span><input aria-label={`${item.name} Quantity`} type="number" min="0" step="1" disabled={item.credits === null} value={quantity} onChange={(event) => changeItemQuantity(item.id, numericValue(event.target.value))} /></label>
                <button type="button" disabled={item.credits === null || (item.credits > remaining && quantity === 0)} onClick={() => changeItemQuantity(item.id, quantity + 1)}>Add One</button>
              </article>
            );
          })}
          {available.length === 0 ? <p className="character-empty">No Campaign-authorized Items match this search.</p> : null}
        </div>
      </section>
    );
  }

  function renderSheet() {
    if (!aggregate || !draft) return null;
    const dexterity = draft.attributes.DEX;
    const allocatedSkills = draft.skillAllocations.filter((allocation) => allocation.points > 0);
    return (
      <section className="character-sheet" aria-labelledby="character-sheet-title">
        <header><div><p>SERRIAN TIDE CHARACTER RECORD</p><h2 id="character-sheet-title">{draft.name || "Unnamed Character"}</h2><span>{selectedRace?.race.name ?? "No Race selected"} · {aggregate.campaign.name} · {aggregate.character.playerUsername}</span></div><strong>{readiness?.ready ? "CHARACTER READY" : "DRAFT CHARACTER"}</strong></header>
        <div className="character-sheet__vitals">
          <div><span>HP</span><strong>{displayNumber(getCharacterHp(draft.attributes.CON))}</strong></div>
          <div><span>Base Initiative</span><strong>{displayNumber(getBaseInitiative(dexterity))}</strong></div>
          <div><span>Base Magic</span><strong>{selectedRace?.race.baseMagic ?? "—"}</strong></div>
          <div><span>Currency Remaining</span><strong>{campaignMoney(getStartingFundsRemaining(draft, aggregate.campaign.startingCreditAmount))}</strong></div>
        </div>
        <div className="character-sheet__columns">
          <section><h3>Identity</h3><dl className="character-sheet__details"><div><dt>Age</dt><dd>{draft.profile.age ?? "—"}</dd></div><div><dt>Sex</dt><dd>{draft.profile.sex || "—"}</dd></div><div><dt>Height</dt><dd>{(draft.profile.heightFeet ?? 0) * 12 + (draft.profile.heightInches ?? 0) > 0 ? `${draft.profile.heightFeet ?? 0} ft ${draft.profile.heightInches ?? 0} in` : "—"}</dd></div><div><dt>Weight</dt><dd>{draft.profile.weight ?? "—"}</dd></div><div><dt>Eyes</dt><dd>{draft.profile.eyeColor || "—"}</dd></div><div><dt>Hair</dt><dd>{draft.profile.hairColor || "—"}</dd></div><div><dt>Skin</dt><dd>{draft.profile.skinColor || "—"}</dd></div><div><dt>Deity</dt><dd>{draft.profile.deity || "—"}</dd></div></dl></section>
          <section><h3>Attributes</h3><div className="character-sheet__attributes">{CHARACTER_ATTRIBUTE_KEYS.map((key) => <div key={key}><span>{key}</span><strong>{displayNumber(draft.attributes[key])}</strong><small>{signedNumber(getAttributeModifier(draft.attributes[key]))} · {displayNumber(getAttributeRollTarget(draft.attributes[key]))}%</small></div>)}</div></section>
        </div>
        <section className="character-sheet__section"><h3>Movement</h3><div className="character-sheet__movement">{selectedRace?.movementModes.length ? selectedRace.movementModes.map((mode) => <div key={mode.id}><span>{mode.movementMode}</span><strong>{displayNumber(getMovementInitiative(dexterity, mode.baseValue))} Initiative</strong><small>Race base {displayNumber(mode.baseValue)}</small></div>) : <p>No Race movement modes recorded.</p>}</div></section>
        <section className="character-sheet__section"><h3>Skills & Abilities</h3><div className="character-sheet__skills">{allocatedSkills.map((allocation) => { const skill = aggregate.skillCatalog.find((candidate) => candidate.id === allocation.skillId); const attributeKey = normalizeSkillAttributeKey(skill?.primaryAttribute ?? null); const rank = ranks.get(allocation.draftId) ?? 0; return <div key={allocation.draftId}><strong>{skill?.name ?? `Skill ${allocation.skillId}`}</strong><span>{displayNumber(allocation.points)} points · Rank {displayNumber(rank)}{attributeKey ? ` · ${displayNumber(getSkillRollTarget(draft.attributes[attributeKey], rank))}%` : ""}</span></div>; })}{allocatedSkills.length === 0 ? <p>No Skill points allocated.</p> : null}</div></section>
        <section className="character-sheet__section"><h3>Story</h3><div className="character-sheet__story"><div><strong>Personality</strong><p>{draft.profile.personality || "Not recorded."}</p></div><div><strong>Goals</strong><p>{draft.profile.goals || "Not recorded."}</p></div><div><strong>Motivations</strong><p>{draft.profile.motivations || "Not recorded."}</p></div><div><strong>Backstory</strong><p>{draft.profile.backstory || "Not recorded."}</p></div><div><strong>Secrets</strong><p>{draft.profile.secrets || "Not recorded."}</p></div></div></section>
        <section className="character-sheet__section"><h3>Equipment & Inventory</h3><div className="character-sheet__items">{draft.items.map((owned) => { const item = aggregate.authorizedItems.find((candidate) => candidate.id === owned.itemId); return <div key={owned.itemId}><strong>{item?.name ?? `Item ${owned.itemId}`}</strong><span>× {owned.quantity}</span><small>{campaignMoney(owned.quantity * owned.unitCostCredits)}</small></div>; })}{draft.items.length === 0 ? <p>No starting possessions selected.</p> : null}</div></section>
      </section>
    );
  }

  const content = activeTab === "identity" ? renderIdentity()
    : activeTab === "attributes" ? renderAttributes()
      : activeTab === "skills" ? renderSkills()
        : activeTab === "story" ? renderStory()
          : activeTab === "equipment" ? renderEquipment()
            : renderSheet();

  return (
    <main className="character-creation-page">
      <div className="character-creation-page__texture" aria-hidden="true" />
      <header className="character-creation-header">
        <div className="character-creation-header__brand"><BrandLogo /></div>
        <div className="character-creation-header__title"><p>THE REALMS / CHARACTER CREATION</p><h1>Character Creation</h1><span>Campaign: {aggregate?.campaign.name ?? campaignId} · Player: {session.username} · Character: {draft?.name ?? "Loading…"}</span></div>
        <div className="character-creation-header__actions"><button type="button" onClick={() => requestExit("back")}>Back to The Realms</button><button type="button" onClick={() => requestExit("logout")}>Log Out</button></div>
      </header>

      {aggregate && draft && readiness ? (
        <div className="character-status" role="status" aria-live="polite">
          <div className="character-status__metrics">
            <span>Attributes <strong>{displayNumber(readiness.attributesUsed)} / {displayNumber(aggregate.campaign.attributePoints)}</strong></span>
            <span>Skills <strong>{displayNumber(readiness.skillPointsUsed)} / {displayNumber(aggregate.campaign.skillPoints)}</strong></span>
            <span>Race <strong>{readiness.raceComplete ? "✓" : "—"}</strong></span>
            <span>Starting Funds <strong>{campaignMoney(readiness.fundsRemaining)} remaining</strong></span>
          </div>
          <div className={`character-status__readiness${readiness.ready || creationLocked ? " is-ready" : ""}`}>
            <strong>{creationLocked ? "Creation Complete" : readiness.ready ? "Character Ready" : "Character Draft"}</strong>
            <span>{creationLocked ? "Permanent creation record" : dirty ? "Unsaved changes" : "Saved draft"}</span>
          </div>
          {!creationLocked ? (
            <div className="character-status__actions">
              <button type="button" disabled={saving || !dirty} onClick={() => void saveCharacter()}>{saving ? "Saving…" : "Save Character"}</button>
              {readiness.ready ? <button className="character-status__complete" type="button" disabled={saving} onClick={() => setConfirmCompletion(true)}>Complete Character</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="character-creation-workspace">
        {feedback ? <div className={`character-feedback character-feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
        {loading ? <section className="character-loading"><p>READING CHARACTER RECORD</p><h2>Opening the local archive…</h2></section> : null}
        {!loading && aggregate && draft ? (
          <>
            <nav className="character-tabs" aria-label="Character creation sections">{TABS.map(([id, label]) => <button key={id} type="button" className={activeTab === id ? "is-active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>
            {creationLocked ? <aside className="character-locked-notice"><strong>Character creation is complete.</strong><span>Identity, Attributes, starting Skills, Story, and starting Equipment are now read-only. Advancement and later purchases use their own controlled workflows.</span></aside> : null}
            <fieldset className="character-creation-lockable" disabled={creationLocked}>{content}</fieldset>
            {!creationLocked && !readiness?.ready && readiness?.issues.length ? <aside className="character-readiness"><strong>Before this Character is ready</strong><ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></aside> : null}
          </>
        ) : null}
      </div>

      {pendingExit ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-character-title"><div><p id="discard-character-title">Unsaved changes</p><span>Leave this Character and discard the changes you have not saved?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingExit(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndExit}>Discard Changes</button></div></div> : null}
      {confirmCompletion ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="complete-character-title"><div><p id="complete-character-title">Complete this Character?</p><span>This permanently locks Character creation. Later XP, Quintessence, inventory, and equipment changes must use their separate controlled workflows.</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setConfirmCompletion(false)}>Keep Editing</button><button className="character-complete-confirm" type="button" disabled={saving} onClick={() => { setConfirmCompletion(false); void saveCharacter(true); }}>Complete Character</button></div></div> : null}
      {describedSkill ? (
        <div className="character-skill-description-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDescribedSkill(null); }}>
          <section id={`skill-description-${describedSkill.id}`} className="character-skill-description" role="dialog" aria-modal="true" aria-labelledby="character-skill-description-title">
            <header>
              <div><p>SKILL DESCRIPTION</p><h2 id="character-skill-description-title">{describedSkill.name}</h2></div>
              <button type="button" aria-label="Close Skill description" onClick={() => setDescribedSkill(null)}>×</button>
            </header>
            <div className="character-skill-description__details">
              <span>{describedSkill.tier === null ? describedSkill.classification : `Tier ${describedSkill.tier}`}</span>
              {describedSkill.primaryAttribute ? <span>Primary: {normalizeSkillAttributeKey(describedSkill.primaryAttribute) ?? describedSkill.primaryAttribute}</span> : null}
              {describedSkill.secondaryAttribute ? <span>Secondary: {normalizeSkillAttributeKey(describedSkill.secondaryAttribute) ?? describedSkill.secondaryAttribute}</span> : null}
            </div>
            <p className="character-skill-description__definition">{describedSkill.definition.trim() || "No description is currently recorded for this Skill."}</p>
            <footer><button type="button" onClick={() => setDescribedSkill(null)}>Close</button></footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
