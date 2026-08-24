import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CharacterHitLocationChart } from "../components/characters/CharacterHitLocationChart";
import {
  formatCampaignMoney,
  getCanonicalCreditsFromHoldings,
  getCampaignMoneyBreakdown,
  getStoredCampaignMoneyBreakdown,
} from "../features/currency/currencyRules";
import {
  canAccessSupernaturalSkillAtLevel,
  evaluateCharacterReadiness,
  getAttributeModifier,
  getAttributePointsUsed,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterHp,
  getCharacterHpBreakdown,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCharacterSkillRanks,
  getCharacterSkillGroupKey,
  getEffectiveSkillPoints,
  getCreationPurchasedSkillMaximum,
  getPurchasedSkillMaximum,
  getMovementInitiative,
  getRaceAttributeCap,
  getRacialSkillGrant,
  getSkillPointsUsed,
  getSkillRank,
  getSkillRollTarget,
  getSkillTierLabel,
  getSkillUnlockThreshold,
  getSpecialAbilityRollTarget,
  getStartingFundsRemaining,
  hasSkillPoints,
  isSkillAllowedByCampaign,
  requiresCastingLevel,
  isSpecialAbilitySkill,
  normalizeSkillAttributeKey,
  reconcileRacialSkillAnchors,
  type CharacterManaProfile,
  SPECIAL_ABILITY_EFFECTIVE_MAXIMUM,
} from "../features/characters/characterRules";
import { getCharacterWeaponDamageSummary } from "../features/characters/characterSheetRules";
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
  type CharacterEditorMode,
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
  ["god", "G.O.D. Controls"],
  ["sheet", "Character Sheet"],
] as const;

type TabId = (typeof TABS)[number][0];
type PendingExit = "back" | "logout";

type Props = {
  session: AuthSession;
  campaignId: number;
  characterId: number;
  editorMode: CharacterEditorMode;
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
  selectedRace: RaceAggregate | null;
  administrativeOverride: boolean;
  enforceCampaignTierLimits: boolean;
  manaProfiles: readonly CharacterManaProfile[];
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
  selectedRace,
  administrativeOverride,
  enforceCampaignTierLimits,
  manaProfiles,
  onPointsChange,
  onShowDescription,
}: SkillBranchProps) {
  if (visited.has(skill.id)) return null;
  const racialGrant = getRacialSkillGrant(selectedRace, skill.id);
  if (!isSkillAllowedByCampaign(
    skill,
    rootSkill,
    aggregate.campaign.allowedSystems,
    enforceCampaignTierLimits,
    racialGrant.granted,
  )) return null;

  const allocation = allocationFor(draft, skill.id, parentDraftId);
  const points = allocation?.points ?? 0;
  const effectivePoints = getEffectiveSkillPoints(points, selectedRace, skill.id);
  const hasPoints = hasSkillPoints(effectivePoints);
  const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
  const attributeScore = attributeKey ? draft.attributes[attributeKey] : 0;
  const rank = hasPoints && allocation
    ? ranks.get(allocation.draftId) ?? 0
    : hasPoints ? getSkillRank(
        effectivePoints,
        attributeKey ? getAttributeModifier(attributeScore) : 0,
        parentRank,
        skill.tier,
      ) : 0;
  const unlockThreshold = getSkillUnlockThreshold(
    rootSkill,
    aggregate.campaign.pointsToUnlockNextTier,
  );
  const nextVisited = new Set(visited).add(skill.id);
  const children = childrenByParent.get(skill.id) ?? [];
  const magicSystem = getCharacterMagicSystem(rootSkill);
  const spellAccessLevel = magicSystem
    ? manaProfiles.find((profile) => profile.system === magicSystem)?.spellAccessLevel ?? null
    : null;
  const visibleChildren = children.filter((child) =>
    (effectivePoints >= unlockThreshold
      || getRacialSkillGrant(selectedRace, child.id).granted)
      && (administrativeOverride
        || canAccessSupernaturalSkillAtLevel(child, rootSkill, spellAccessLevel)),
  );
  const hiddenSpellCount = children.filter((child) =>
    requiresCastingLevel(child, rootSkill)).length
    - visibleChildren.filter((child) => requiresCastingLevel(child, rootSkill)).length;
  const maxPurchased = administrativeOverride
    ? getPurchasedSkillMaximum(
        skill,
        aggregate.campaign.maxPointsInSkill,
        racialGrant.minimum,
      )
    : getCreationPurchasedSkillMaximum(
        skill,
        aggregate.campaign.maxStartingSkill,
        aggregate.campaign.maxPointsInSkill,
        racialGrant.minimum,
      );
  const maxTotal = racialGrant.minimum + maxPurchased;
  const rollTarget = !hasPoints
    ? null
    : attributeKey
    ? getSkillRollTarget(attributeScore, rank)
    : isSpecialAbilitySkill(skill)
      ? getSpecialAbilityRollTarget(rank)
      : null;

  return (
    <div className="character-skill-branch" style={{ "--skill-depth": depth } as React.CSSProperties}>
      <div className="character-skill-row">
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
            {getSkillTierLabel(skill)}
            {skill.manaCost !== null && skill.manaCost !== undefined ? ` · ${displayNumber(skill.manaCost)} Mana` : ""}
            {attributeKey ? ` · ${attributeKey}` : ""}
            {racialGrant.granted
              ? racialGrant.minimum > 0
                ? ` · Racial +${displayNumber(racialGrant.minimum)}`
                : " · Racially granted"
              : ""}
          </span>
        </div>
        <label>
          <span>{racialGrant.granted ? "Total Points" : "Points"}</span>
          <input
            aria-label={`${skill.name} Points Invested`}
            type="number"
            min={racialGrant.minimum}
            max={maxTotal}
            step="1"
            value={effectivePoints}
            onChange={(event) => onPointsChange(
              skill.id,
              parentDraftId,
              Math.max(0, numericValue(event.target.value) - racialGrant.minimum),
            )}
          />
          {racialGrant.granted ? <small>{displayNumber(points)} purchased</small> : null}
        </label>
        <div><span>Rank</span><strong>{displayNumber(rank)}</strong></div>
        <div>
          <span>Roll Target</span>
          <strong>{rollTarget === null ? "N/A" : `${displayNumber(rollTarget)}%`}</strong>
        </div>
      </div>
      {allocation && visibleChildren.length > 0 ? (
        <div className="character-skill-children">
          {visibleChildren.map((child) => (
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
              selectedRace={selectedRace}
              administrativeOverride={administrativeOverride}
              enforceCampaignTierLimits={enforceCampaignTierLimits}
              manaProfiles={manaProfiles}
              onPointsChange={onPointsChange}
              onShowDescription={onShowDescription}
            />
          ))}
        </div>
      ) : null}
      {allocation && !administrativeOverride && hiddenSpellCount > 0 ? (
        <p className="character-spell-access-note">
          Higher-level {magicSystem ?? "supernatural"} spells remain hidden at {spellAccessLevel ?? "Below Apprentice"} spell access.
        </p>
      ) : null}
    </div>
  );
}

export function CharacterCreationPage({
  session,
  campaignId,
  characterId,
  editorMode,
  onBack,
  onLogout,
}: Props) {
  const isGodEditor = editorMode === "god";
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
  const [equipmentFilter, setEquipmentFilter] = useState<"all" | "weapon" | "armor" | "general" | "inventory">("all");
  const [activeSkillGroup, setActiveSkillGroup] = useState("STR");
  const nextDraftId = useRef(-1);
  const isNpc = Boolean(aggregate?.character.isNpc);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFeedback(null);
    characterService.getCharacter(characterId, campaignId, session.userId, editorMode)
      .then((loaded) => {
        if (!current) return;
        if (!loaded) {
          setFeedback({
            kind: "error",
            message: isGodEditor
              ? "This Character is not available to this G.O.D. profile in the selected Campaign."
              : "This Character is not available to the logged-in Player in the selected Campaign.",
          });
          return;
        }
        const loadedDraft = characterAggregateToDraft(loaded);
        setAggregate(loaded);
        setDraft({
          ...loadedDraft,
          skillAllocations: reconcileRacialSkillAnchors(
            loadedDraft.skillAllocations,
            loaded.selectedRace,
            loaded.skillRelationships,
            () => nextDraftId.current--,
          ),
        });
        setSelectedRace(loaded.selectedRace);
        if (isGodEditor) setActiveTab("god");
        else if (loaded.profile.creationCompletedAt) setActiveTab("sheet");
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
  }, [campaignId, characterId, editorMode, isGodEditor, session.userId]);

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
  const manaProfiles = useMemo(
    () => aggregate && draft
      ? getCharacterManaProfiles(draft, aggregate.skillCatalog, selectedRace)
      : [],
    [aggregate, draft, selectedRace],
  );
  const creationLocked = !isGodEditor && aggregate?.profile.creationCompletedAt !== null
    && aggregate?.profile.creationCompletedAt !== undefined;
  const enforceCampaignTierLimits = !isGodEditor && !aggregate?.profile.creationCompletedAt;

  const visibleTabs = TABS.filter(([id]) => id !== "god" || isGodEditor);

  function currentFunds(): number {
    if (!aggregate || !draft) return 0;
    return isGodEditor || Boolean(aggregate.profile.creationCompletedAt)
      ? draft.profile.creditsRemaining
      : getStartingFundsRemaining(draft, aggregate.campaign.startingCreditAmount);
  }

  function campaignMoney(canonicalCredits: number): string {
    if (!aggregate) return "";
    return formatCampaignMoney(
      canonicalCredits,
      aggregate.campaign.currencySystem,
      aggregate.campaign.derivedCurrencies,
    );
  }

  function characterPurse(canonicalCredits = currentFunds()) {
    if (!aggregate || !draft) {
      return { entries: [], fullyRepresented: false, formatted: "Currency unavailable" };
    }
    const useStoredHoldings = isGodEditor || Boolean(aggregate.profile.creationCompletedAt);
    return useStoredHoldings
      ? getStoredCampaignMoneyBreakdown(
          canonicalCredits,
          aggregate.campaign.currencySystem,
          aggregate.campaign.derivedCurrencies,
          draft.currencyHoldings,
        )
      : getCampaignMoneyBreakdown(
          canonicalCredits,
          aggregate.campaign.currencySystem,
          aggregate.campaign.derivedCurrencies,
        );
  }
  const ranks = useMemo(
    () => aggregate && draft
      ? getCharacterSkillRanks(draft, aggregate.skillCatalog, selectedRace)
      : new Map<number, number>(),
    [aggregate, draft, selectedRace],
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
      if (!isSkillAllowedByCampaign(
        skill,
        skill,
        aggregate.campaign.allowedSystems,
        enforceCampaignTierLimits,
        getRacialSkillGrant(selectedRace, skill.id).granted,
      )) continue;
      const key = getCharacterSkillGroupKey(skill);
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
      label: "Special Abilities",
      skills: (groups.get("SPECIAL") ?? []).sort((left, right) => left.name.localeCompare(right.name)),
    }, {
      key: "OTHER",
      label: "Other Skills",
      skills: (groups.get("OTHER") ?? []).sort((left, right) => left.name.localeCompare(right.name)),
    }].filter((group) => group.skills.length > 0);
  }, [aggregate, enforceCampaignTierLimits, selectedRace]);

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

  function changeFatePoints(value: string) {
    changeDraft((current) => ({
      ...current,
      profile: {
        ...current.profile,
        fatePoints: value.trim() ? Math.max(0, Math.trunc(numericValue(value))) : null,
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
        skillAllocations: reconcileRacialSkillAnchors(
          current.skillAllocations,
          null,
          aggregate.skillRelationships,
          () => nextDraftId.current--,
        ),
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
        editorMode,
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
          skillAllocations: reconcileRacialSkillAnchors(
            current.skillAllocations,
            race,
            aggregate.skillRelationships,
            () => nextDraftId.current--,
          ),
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
    const maximum = isGodEditor
      ? Number.MAX_SAFE_INTEGER
      : cap === null ? budgetMaximum : Math.min(budgetMaximum, cap);
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

  function getRootSkillForPath(
    skillId: number,
    parentDraftId: number | null,
  ): CharacterSkillReference | null {
    if (!aggregate || !draft) return null;
    let rootSkillId = skillId;
    let cursor = parentDraftId;
    const visited = new Set<number>();
    while (cursor !== null && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = draft.skillAllocations.find((allocation) => allocation.draftId === cursor);
      if (!parent) break;
      rootSkillId = parent.skillId;
      cursor = parent.parentDraftId;
    }
    return aggregate.skillCatalog.find((skill) => skill.id === rootSkillId) ?? null;
  }

  function setSkillPoints(
    skillId: number,
    parentDraftId: number | null,
    requested: number,
  ) {
    if (!aggregate || !draft || creationLocked) return;
    const currentAllocation = allocationFor(draft, skillId, parentDraftId);
    const currentPoints = currentAllocation?.points ?? 0;
    const skill = aggregate.skillCatalog.find((candidate) => candidate.id === skillId);
    if (!skill) return;
    const racialGrant = getRacialSkillGrant(selectedRace, skillId);
    const remainingWithCurrent = aggregate.campaign.skillPoints
      - getSkillPointsUsed(draft)
      + currentPoints;
    const rulesMaximum = isGodEditor
      ? getPurchasedSkillMaximum(
          skill,
          aggregate.campaign.maxPointsInSkill,
          racialGrant.minimum,
        )
      : getCreationPurchasedSkillMaximum(
          skill,
          aggregate.campaign.maxStartingSkill,
          aggregate.campaign.maxPointsInSkill,
          racialGrant.minimum,
        );
    const maximum = Math.min(
      rulesMaximum,
      isGodEditor ? rulesMaximum : Math.max(0, remainingWithCurrent),
    );
    const points = Math.min(Math.max(0, requested), maximum);
    const rootSkill = getRootSkillForPath(skillId, parentDraftId);
    const unlockThreshold = rootSkill
      ? getSkillUnlockThreshold(rootSkill, aggregate.campaign.pointsToUnlockNextTier)
      : aggregate.campaign.pointsToUnlockNextTier;
    changeDraft((current) => {
      let allocations = [...current.skillAllocations];
      const existing = allocationFor(current, skillId, parentDraftId);
      if (!existing && (points > 0 || racialGrant.minimum > 0)) {
        allocations.push({
          draftId: nextDraftId.current--,
          skillId,
          parentDraftId,
          points,
        });
      } else if (existing && points <= 0) {
        if (racialGrant.minimum > 0) {
          if (racialGrant.minimum < unlockThreshold) {
            allocations = removeSkillDescendants(allocations, existing.draftId);
          }
          allocations = allocations.map((allocation) =>
            allocation.draftId === existing.draftId
              ? { ...allocation, points: 0 }
              : allocation,
          );
        } else {
          allocations = removeSkillDescendants(allocations, existing.draftId)
            .filter((allocation) => allocation.draftId !== existing.draftId);
        }
      } else if (existing) {
        allocations = allocations.map((allocation) =>
          allocation.draftId === existing.draftId ? { ...allocation, points } : allocation,
        );
        if (points + racialGrant.minimum < unlockThreshold) {
          allocations = removeSkillDescendants(allocations, existing.draftId);
        }
      }
      return { ...current, skillAllocations: allocations };
    });
  }

  function changeItemQuantity(itemId: number, requestedQuantity: number) {
    if (!aggregate || !draft || creationLocked) return;
    const catalogItem = aggregate.authorizedItems.find((item) => item.id === itemId);
    if (!catalogItem || (catalogItem.credits !== null && catalogItem.credits < 0)) return;
    const existing = draft.items.find((item) => item.itemId === itemId);
    const unitCostCredits = catalogItem.credits ?? existing?.unitCostCredits ?? 0;
    if (!isGodEditor && catalogItem.credits === null) return;
    const spentWithoutItem = draft.items
      .filter((item) => item.itemId !== itemId)
      .reduce((sum, item) => sum + item.quantity * item.unitCostCredits, 0);
    const maximumQuantity = isGodEditor
      ? Number.MAX_SAFE_INTEGER
      : catalogItem.credits === 0
        ? 999
        : Math.floor((aggregate.campaign.startingCreditAmount - spentWithoutItem) / unitCostCredits);
    const quantity = Math.min(Math.max(0, Math.trunc(requestedQuantity)), maximumQuantity);
    changeDraft((current) => ({
      ...current,
      items: quantity === 0
        ? current.items.filter((item) => item.itemId !== itemId)
        : existing
          ? current.items.map((item) => item.itemId === itemId
              ? { ...item, quantity, unitCostCredits }
              : item)
          : [...current.items, {
              itemId,
              quantity,
              unitCostCredits,
            }],
    }));
  }

  function changeAdministrativeNumber(
    field: "fame" | "experience" | "totalExperience" | "quintessence" | "totalQuintessence" | "creditsRemaining",
    value: string | number,
  ) {
    if (!isGodEditor) return;
    const number = typeof value === "number" ? value : numericValue(value);
    changeDraft((current) => ({
      ...current,
      profile: {
        ...current.profile,
        [field]: Math.max(0, number),
      },
    }));
  }

  function changeDerivedCurrencyQuantity(currencyId: number, requested: number) {
    if (!aggregate || !draft || !isGodEditor) return;
    const holdings = characterPurse(draft.profile.creditsRemaining).entries.map((currency) => ({
      currencyId: currency.id,
      quantity: currency.id === currencyId
        ? Math.max(0, Math.trunc(requested))
        : currency.quantity,
    }));
    const creditsRemaining = getCanonicalCreditsFromHoldings(
      aggregate.campaign.derivedCurrencies,
      holdings,
    );
    changeDraft((current) => ({
      ...current,
      profile: { ...current.profile, creditsRemaining },
      currencyHoldings: holdings,
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
        editorMode,
      );
      const savedDraft = characterAggregateToDraft(saved);
      setAggregate(saved);
      setDraft({
        ...savedDraft,
        skillAllocations: reconcileRacialSkillAnchors(
          savedDraft.skillAllocations,
          saved.selectedRace,
          saved.skillRelationships,
          () => nextDraftId.current--,
        ),
      });
      setSelectedRace(saved.selectedRace);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: completeCreation
          ? "Character creation is complete. The creation record is now permanently locked."
          : isGodEditor
            ? "G.O.D. changes saved to the Character record."
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
          <label><span>{isNpc ? "NPC Name" : "Character Name"} · Required</span><input value={draft.name} onChange={(event) => changeDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>{isNpc ? "Record Type" : "Player"}</span><input value={isNpc ? "Non-Player Character" : aggregate.character.playerUsername} readOnly /></label>
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
          <label><span>Deity · Required</span><input value={draft.profile.deity} placeholder="Enter None if the Character has no deity" onChange={(event) => changeText("deity", event.target.value)} /></label>
          <label>
            <span>Fate Points{aggregate.campaign.fatePointMethod === "Rolled" && !isGodEditor ? " · Rolled Result · Required" : ""}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={draft.profile.fatePoints ?? ""}
              readOnly={!isGodEditor && aggregate.campaign.fatePointMethod === "Assigned"}
              onChange={(event) => changeFatePoints(event.target.value)}
            />
            <small>{aggregate.campaign.fatePointMethod === "Assigned"
              ? `Assigned by this Campaign${isGodEditor ? "; G.O.D. may override it" : ""}.`
              : "Enter the result rolled for this character."}</small>
          </label>
          <label className="character-field-grid__wide"><span>Defining Marks & Character Quirks · Required</span><textarea rows={3} value={draft.profile.definingMarks} placeholder="Enter None if there are no defining marks or quirks" onChange={(event) => changeText("definingMarks", event.target.value)} /></label>
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
          <span>{isGodEditor ? `${displayNumber(used)} total points` : `${displayNumber(used)} used · ${displayNumber(aggregate.campaign.attributePoints - used)} remaining`}</span>
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
    const activeManaProfiles = manaProfiles.filter((profile) =>
      aggregate.campaign.allowedSystems.includes(profile.system));
    return (
      <section className="character-panel" aria-labelledby="character-skills-title">
        <header className="character-panel__heading">
          <div><p>CURRENT SKILL CATALOG</p><h2 id="character-skills-title">Skills & Abilities</h2></div>
          <span>{isGodEditor ? `${displayNumber(used)} invested points` : `${displayNumber(used)} / ${displayNumber(aggregate.campaign.skillPoints)} points`}</span>
        </header>
        <div className="character-rule-ledger">
          <span>Max Starting Points Spent per Skill <strong>{displayNumber(aggregate.campaign.maxStartingSkill)}</strong></span>
          <span>Unlock Next Tier <strong>{displayNumber(aggregate.campaign.pointsToUnlockNextTier)}</strong><small>Spellcraft, Talismanism, Faith, Psyonics, and Bardic Resonance require 1.</small></span>
          <span>Standard Skill Maximum <strong>{displayNumber(aggregate.campaign.maxPointsInSkill)}</strong></span>
          <span>Special Ability Maximum <strong>{displayNumber(SPECIAL_ABILITY_EFFECTIVE_MAXIMUM)}</strong></span>
          <span>Allowed <strong>{aggregate.campaign.allowedSystems.join(" · ") || "None"}</strong></span>
        </div>
        <p className="character-panel__note">A nested Skill appears beneath each valid parent path. Only Campaign-authorized tiers and systems are shown.</p>
        {activeManaProfiles.length > 0 ? (
          <section className="character-mana-ledger" aria-label="Character supernatural mana pools">
            <header><div><p>SUPERNATURAL CAPACITY</p><h3>Mana & Spell Access</h3></div><span>Base Magic {displayNumber(selectedRace?.race.baseMagic ?? 0)}</span></header>
            <div>
              {activeManaProfiles.map((profile) => (
                <article key={profile.system}>
                  <span>{profile.system}</span>
                  <strong>{displayNumber(profile.manaPool)} Mana</strong>
                  <small>{profile.spellAccessLevel ?? "Below Apprentice"} spell access · {displayNumber(profile.sourceSkillPoints)} {profile.sourceSkillName}</small>
                  {profile.nextLevel && profile.nextRequiredMana !== null ? <em>{displayNumber(profile.nextRequiredMana - profile.manaPool)} more Mana to unlock {profile.nextLevel} spells</em> : <em>All spell levels unlocked</em>}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {!aggregate.campaign.allowedSystems.includes("Special Abilities") ? (
          <p className="character-panel__note">General Special Ability purchasing is disabled by this Campaign. Racially granted Special Abilities still appear and may be improved.</p>
        ) : null}
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
                    selectedRace={selectedRace}
                    administrativeOverride={isGodEditor}
                    enforceCampaignTierLimits={enforceCampaignTierLimits}
                    manaProfiles={manaProfiles}
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
        <header className="character-panel__heading"><div><p>REQUIRED NARRATIVE RECORD</p><h2 id="character-story-title">Story & Personality</h2></div><span>Every field must contain something before creation can be completed.</span></header>
        <div className="character-story-grid">
          {fields.map(([field, label]) => <label key={field}><span>{label} · Required</span><textarea rows={field === "backstory" ? 8 : 5} value={draft.profile[field]} onChange={(event) => changeText(field, event.target.value)} /></label>)}
        </div>
      </section>
    );
  }

  function renderEquipment() {
    if (!aggregate || !draft) return null;
    const remaining = currentFunds();
    const purse = characterPurse(remaining);
    const creditEquivalent = aggregate.campaign.currencySystem === "Derived Currency"
      ? getCanonicalCreditsFromHoldings(
          aggregate.campaign.derivedCurrencies,
          purse.entries.map((entry) => ({ currencyId: entry.id, quantity: entry.quantity })),
        )
      : remaining;
    const search = equipmentSearch.trim().toLocaleLowerCase();
    const filterOptions = [
      ["all", "All Items"],
      ["weapon", "Weapons"],
      ["armor", "Armor"],
      ["general", "General Equipment"],
      ["inventory", "Inventory"],
    ] as const;
    const filterCount = (filter: typeof equipmentFilter) => aggregate.authorizedItems.filter((item) =>
      filter === "all"
        || (filter === "inventory" && item.catalogScope.toLocaleLowerCase() === "inventory")
        || item.equipmentGroup?.toLocaleLowerCase() === filter,
    ).length;
    const available = aggregate.authorizedItems.filter((item) => {
      const matchesFilter = equipmentFilter === "all"
        || (equipmentFilter === "inventory" && item.catalogScope.toLocaleLowerCase() === "inventory")
        || item.equipmentGroup?.toLocaleLowerCase() === equipmentFilter;
      return matchesFilter && (!search
        || [
          item.name,
          item.canonicalId,
          item.category,
          item.recordType,
          item.description,
          item.weaponType,
          item.damageType,
          item.armorType,
          item.coverage,
        ].some((value) => value?.toLocaleLowerCase().includes(search)));
    });
    return (
      <section className="character-panel" aria-labelledby="character-equipment-title">
        <header className="character-panel__heading"><div><p>CAMPAIGN-AUTHORIZED CATALOG</p><h2 id="character-equipment-title">Starting Equipment Store</h2></div><span>{purse.formatted} {isGodEditor ? "currently held" : "remaining"}</span></header>
        {aggregate.campaign.currencySystem === "Derived Currency" ? (
          <>
            <div className="character-currency-ledger" aria-label="Current game currency breakdown">
              {purse.entries.map((currency) => <div key={currency.id}><strong>{displayNumber(currency.quantity)} {currency.name}</strong><span>{currency.description || "Campaign currency"}</span></div>)}
            </div>
            <p className="character-panel__note">Credit Equivalent: {displayNumber(creditEquivalent)} Credits</p>
            {!purse.fullyRepresented ? <p className="character-currency-warning">The configured denominations cannot exactly represent this balance. Ask the G.O.D. to add a smaller denomination.</p> : null}
          </>
        ) : null}
        <div className="character-equipment-toolbar">
          <label className="character-equipment-search"><span>Search permitted Items</span><input type="search" value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="Name, ID, category, damage, armor, or type" /></label>
          <nav className="character-equipment-filters" aria-label="Equipment store sections">
            {filterOptions.map(([filter, label]) => <button type="button" className={equipmentFilter === filter ? "is-active" : ""} key={filter} onClick={() => setEquipmentFilter(filter)}><span>{label}</span><strong>{filterCount(filter)}</strong></button>)}
          </nav>
        </div>
        {!isGodEditor && !draft.items.some((owned) => aggregate.authorizedItems.find((item) => item.id === owned.itemId)?.catalogScope.toLocaleLowerCase() === "equipment") ? <p className="character-panel__note">Purchase at least one Equipment item before completing Character creation. Inventory supplies alone do not satisfy starting equipment.</p> : null}
        <div className="character-equipment-list">
          {available.map((item) => {
            const owned = draft.items.find((row) => row.itemId === item.id);
            const quantity = owned?.quantity ?? 0;
            const details: Array<[string, string]> = [];
            if (item.weaponType) details.push(["Weapon", item.weaponType]);
            if (item.handedness) details.push(["Hands", item.handedness]);
            if (item.damage) details.push(["Damage", `${item.damage}${item.damageType ? ` ${item.damageType}` : ""}`]);
            if (item.rangeText) details.push(["Range", item.rangeText]);
            if (item.reachText) details.push(["Reach", item.reachText]);
            if (item.armorType) details.push(["Armor", item.armorType]);
            if (item.coverage) details.push(["Coverage", item.coverage]);
            if (item.baseSoak !== null) details.push(["Base Soak", displayNumber(item.baseSoak)]);
            if (item.armorDamageModifiers) details.push(["Damage Modifiers", item.armorDamageModifiers]);
            if (item.weight !== null) details.push(["Weight", `${displayNumber(item.weight)} ${item.weightUnit}`.trim()]);
            if (item.durability !== null) details.push(["Durability", displayNumber(item.durability)]);
            return (
              <article className={quantity > 0 ? "is-owned" : ""} key={item.id}>
                <div className="character-equipment-list__identity"><p>{item.canonicalId} · {item.recordType}</p><h3>{item.name}</h3><span>{item.category}{item.equipmentGroup ? ` · ${item.equipmentGroup}` : " · Inventory"}</span>{item.description ? <small>{item.description}</small> : null}</div>
                {details.length > 0 ? <dl className="character-equipment-list__details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="character-equipment-list__no-details">No additional mechanics recorded.</p>}
                {(item.weaponRulesText || item.armorRulesText) ? <p className="character-equipment-list__rules">{item.weaponRulesText || item.armorRulesText}</p> : null}
                <div className="character-equipment-list__purchase">
                  <div className="character-equipment-list__cost"><span>Cost</span><strong>{item.credits === null ? "Not priced" : campaignMoney(item.credits)}</strong><small>{item.priceBasis}</small></div>
                  <label><span>Owned</span><input aria-label={`${item.name} Quantity`} type="number" min="0" step="1" disabled={!isGodEditor && item.credits === null} value={quantity} onChange={(event) => changeItemQuantity(item.id, numericValue(event.target.value))} /></label>
                  <button type="button" disabled={!isGodEditor && (item.credits === null || (item.credits > remaining && quantity === 0))} onClick={() => changeItemQuantity(item.id, quantity + 1)}>Buy One</button>
                </div>
              </article>
            );
          })}
          {available.length === 0 ? <p className="character-empty">No Campaign-authorized Items match this search.</p> : null}
        </div>
      </section>
    );
  }

  function renderGodControls() {
    if (!aggregate || !draft || !isGodEditor) return null;
    const purse = characterPurse(draft.profile.creditsRemaining);
    const creditEquivalent = getCanonicalCreditsFromHoldings(
      aggregate.campaign.derivedCurrencies,
      purse.entries.map((entry) => ({ currencyId: entry.id, quantity: entry.quantity })),
    );
    const numericFields = [
      ["fame", "Fame"],
      ["experience", "Available Experience"],
      ["totalExperience", "Lifetime Experience"],
      ["quintessence", "Available Quintessence"],
      ["totalQuintessence", "Lifetime Quintessence"],
    ] as const;
    return (
      <section className="character-panel character-god-controls" aria-labelledby="character-god-controls-title">
        <header className="character-panel__heading">
          <div><p>ADMINISTRATIVE OVERRIDE</p><h2 id="character-god-controls-title">G.O.D. Controls</h2></div>
          <span>Changes apply directly to this Character's permanent record.</span>
        </header>
        <div className="character-god-controls__notice">
          <strong>Full Character Access</strong>
          <span>Identity, Attributes, Skills, Story, and Equipment remain editable from their normal tabs—even after Character creation is complete.</span>
        </div>
        <div className="character-god-controls__grid">
          {numericFields.map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input type="number" min="0" step="1" value={draft.profile[field]} onChange={(event) => changeAdministrativeNumber(field, event.target.value)} />
            </label>
          ))}
        </div>
        <section className="character-god-currency" aria-labelledby="character-god-currency-title">
          <header><div><p>CURRENT CAMPAIGN MONEY</p><h3 id="character-god-currency-title">{purse.formatted}</h3></div><span>{aggregate.campaign.currencySystem === "Derived Currency" ? `Credit Equivalent: ${displayNumber(creditEquivalent)} Credits · ` : ""}Saved independently from inventory changes.</span></header>
          {aggregate.campaign.currencySystem === "Credits" ? (
            <label><span>Current Credits</span><input type="number" min="0" step="0.01" value={draft.profile.creditsRemaining} onChange={(event) => changeAdministrativeNumber("creditsRemaining", event.target.value)} /></label>
          ) : purse.entries.length > 0 ? (
            <div className="character-god-currency__denominations">
              {purse.entries.map((currency) => (
                <label key={currency.id}>
                  <span>{currency.name}</span>
                  <input aria-label={`${currency.name} held`} type="number" min="0" step="1" value={currency.quantity} onChange={(event) => changeDerivedCurrencyQuantity(currency.id, numericValue(event.target.value))} />
                  <small>{currency.description || "Campaign currency"}</small>
                </label>
              ))}
            </div>
          ) : (
            <label><span>Stored Currency Value</span><input type="number" min="0" step="0.01" value={draft.profile.creditsRemaining} onChange={(event) => changeAdministrativeNumber("creditsRemaining", event.target.value)} /></label>
          )}
          {!purse.fullyRepresented ? <p className="character-currency-warning">The Campaign denominations cannot exactly represent the stored balance. Adjust the denominations or update the Campaign currency system.</p> : null}
        </section>
      </section>
    );
  }

  function renderSheet() {
    if (!aggregate || !draft) return null;
    const dexterity = draft.attributes.DEX;
    const totalHp = getCharacterHp(draft.attributes.CON);
    const skillById = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
    const allocationById = new Map(draft.skillAllocations.map((allocation) => [allocation.draftId, allocation]));
    const allocatedSkills = draft.skillAllocations.filter((allocation) => hasSkillPoints(
      getEffectiveSkillPoints(allocation.points, selectedRace, allocation.skillId),
    ));
    const allocationPath = (allocation: CharacterSkillAllocationDraft): string => {
      const names: string[] = [];
      let cursor: CharacterSkillAllocationDraft | undefined = allocation;
      const visited = new Set<number>();
      while (cursor && !visited.has(cursor.draftId)) {
        visited.add(cursor.draftId);
        names.unshift(skillById.get(cursor.skillId)?.name ?? `Skill ${cursor.skillId}`);
        cursor = cursor.parentDraftId === null ? undefined : allocationById.get(cursor.parentDraftId);
      }
      return names.join(" → ");
    };
    const ownedItems = draft.items.filter((item) => item.quantity > 0);
    const heightInInches = (draft.profile.heightFeet ?? 0) * 12
      + (draft.profile.heightInches ?? 0);
    const identityDetails = [
      [isNpc ? "Record Type" : "Player", isNpc ? "Non-Player Character" : aggregate.character.playerUsername],
      ["Campaign", aggregate.campaign.name],
      ["Race", selectedRace?.race.name ?? ""],
      ["Size", selectedRace?.race.size ?? ""],
      ["Age", draft.profile.age === null ? "" : displayNumber(draft.profile.age)],
      ["Sex", draft.profile.sex.trim()],
      ["Height", heightInInches > 0 ? `${draft.profile.heightFeet ?? 0} ft ${draft.profile.heightInches ?? 0} in` : ""],
      ["Weight", draft.profile.weight === null ? "" : displayNumber(draft.profile.weight)],
      ["Eyes", draft.profile.eyeColor.trim()],
      ["Hair", draft.profile.hairColor.trim()],
      ["Skin", draft.profile.skinColor.trim()],
      ["Deity", draft.profile.deity.trim()],
      ["Defining Marks & Quirks", draft.profile.definingMarks.trim()],
      ["Racial Quirk", selectedRace?.race.racialQuirkName.trim() ?? ""],
    ].filter((detail) => detail[1]);
    const resourceDetails = [
      ["Experience", `${displayNumber(draft.profile.experience)} available · ${displayNumber(draft.profile.totalExperience)} lifetime`],
      ["Quintessence", `${displayNumber(draft.profile.quintessence)} available · ${displayNumber(draft.profile.totalQuintessence)} lifetime`],
      ["Fame", displayNumber(draft.profile.fame)],
      ["Fate Points", draft.profile.fatePoints === null ? "Not entered" : displayNumber(draft.profile.fatePoints)],
    ];
    const storyDetails = [
      ["Personality", draft.profile.personality.trim()],
      ["Goals", draft.profile.goals.trim()],
      ["Motivations", draft.profile.motivations.trim()],
      ["Backstory", draft.profile.backstory.trim()],
      ["Secrets", draft.profile.secrets.trim()],
    ].filter((detail) => detail[1]);
    const movementModes = selectedRace?.movementModes ?? [];
    const ownedManaProfiles = manaProfiles.filter((profile) =>
      profile.manaPool > 0 && aggregate.campaign.allowedSystems.includes(profile.system));
    const purse = characterPurse(currentFunds());
    const purseCreditEquivalent = aggregate.campaign.currencySystem === "Derived Currency"
      ? getCanonicalCreditsFromHoldings(
          aggregate.campaign.derivedCurrencies,
          purse.entries.map((entry) => ({ currencyId: entry.id, quantity: entry.quantity })),
        )
      : currentFunds();
    const heldCurrencies = purse.entries.some((entry) => entry.quantity > 0)
      ? purse.entries.filter((entry) => entry.quantity > 0)
      : purse.entries.slice(-1);
    const hpBreakdown = getCharacterHpBreakdown(totalHp);
    const hitResultsByPool = new Map(hpBreakdown.pools.map((pool) => [
      pool.key,
      hpBreakdown.locations
        .filter((location) => location.poolKey === pool.key)
        .map((location) => location.result)
        .join(" + "),
    ]));
    const ownedItemRows = ownedItems.map((owned) => ({
      owned,
      item: aggregate.authorizedItems.find((candidate) => candidate.id === owned.itemId),
    }));
    const weaponRows = ownedItemRows.filter(({ item }) => item?.equipmentGroup === "weapon");
    const armorRows = ownedItemRows.filter(({ item }) => item?.equipmentGroup === "armor");
    const generalItemRows = ownedItemRows.filter(({ item }) =>
      item?.equipmentGroup !== "weapon" && item?.equipmentGroup !== "armor",
    );
    const rootSkillFor = (allocation: CharacterSkillAllocationDraft): CharacterSkillReference | null => {
      let cursor: CharacterSkillAllocationDraft | undefined = allocation;
      const visited = new Set<number>();
      while (cursor.parentDraftId !== null && !visited.has(cursor.draftId)) {
        visited.add(cursor.draftId);
        cursor = allocationById.get(cursor.parentDraftId);
        if (!cursor) return null;
      }
      return skillById.get(cursor.skillId) ?? null;
    };
    const sheetSkillRows = allocatedSkills.map((allocation) => {
      const skill = skillById.get(allocation.skillId);
      const attributeKey = normalizeSkillAttributeKey(skill?.primaryAttribute ?? null);
      const racialGrant = getRacialSkillGrant(selectedRace, allocation.skillId);
      const effectivePoints = getEffectiveSkillPoints(allocation.points, selectedRace, allocation.skillId);
      const rank = ranks.get(allocation.draftId) ?? 0;
      const target = attributeKey
        ? getSkillRollTarget(draft.attributes[attributeKey], rank)
        : skill && isSpecialAbilitySkill(skill)
          ? getSpecialAbilityRollTarget(rank)
          : null;
      const rootSkill = rootSkillFor(allocation);
      return {
        id: allocation.draftId,
        name: allocationPath(allocation),
        points: effectivePoints,
        pointNote: racialGrant.minimum > 0
          ? `${displayNumber(racialGrant.minimum)} racial + ${displayNumber(allocation.points)} purchased`
          : "",
        rank,
        target,
        system: rootSkill ? getCharacterMagicSystem(rootSkill) : null,
        special: skill ? isSpecialAbilitySkill(skill) : false,
      };
    });
    const sheetSkillSections = [
      { key: "core", label: "Core Skills", rows: sheetSkillRows.filter((row) => !row.system && !row.special) },
      ...(["Spellcraft", "Talismanism", "Faith", "Psyonics", "Bardic Resonance"] as const).map((system) => ({
        key: system,
        label: system,
        rows: sheetSkillRows.filter((row) => row.system === system && !row.special),
      })),
      { key: "special", label: "Special Abilities", rows: sheetSkillRows.filter((row) => row.special) },
    ].filter((section) => section.rows.length > 0);
    const sheetContext = [
      selectedRace?.race.name,
      aggregate.campaign.name,
      isNpc ? "NPC" : aggregate.character.playerUsername,
    ].filter(Boolean).join(" · ");
    return (
      <section className="character-sheet" aria-labelledby="character-sheet-title">
        <header><div><p>{isNpc ? "SERRIAN TIDE NPC RECORD" : "SERRIAN TIDE CHARACTER RECORD"}</p><h2 id="character-sheet-title">{draft.name || (isNpc ? "Unnamed NPC" : "Unnamed Character")}</h2><span>{sheetContext}</span></div><strong>{isNpc ? "NPC RECORD" : readiness?.ready ? "CHARACTER READY" : "DRAFT CHARACTER"}</strong></header>
        <section className="character-sheet__identity" aria-label="Character identity">
          {identityDetails.map(([label, value]) => <div key={label} className={label === "Defining Marks & Quirks" ? "is-wide" : undefined}><span>{label}</span><strong>{value}</strong></div>)}
        </section>

        <section className="character-sheet__summary-grid" aria-label="Core character record">
          <article className="character-sheet__ledger character-sheet__ledger--attributes">
            <h3>Attributes</h3>
            <table><thead><tr><th>Attribute</th><th>#</th><th>Mod</th><th>%</th></tr></thead><tbody>{CHARACTER_ATTRIBUTE_KEYS.map((key) => <tr key={key}><th>{CHARACTER_ATTRIBUTE_LABELS[key]}</th><td>{displayNumber(draft.attributes[key])}</td><td>{signedNumber(getAttributeModifier(draft.attributes[key]))}</td><td>{displayNumber(getAttributeRollTarget(draft.attributes[key]))}%+</td></tr>)}</tbody></table>
          </article>
          <article className="character-sheet__ledger character-sheet__ledger--health">
            <h3>Hit Points</h3>
            <div className="character-sheet__ledger-total"><span>Total HP</span><strong>{displayNumber(totalHp)}</strong></div>
            <table className="character-sheet__hp-table"><thead><tr><th>Location</th><th>HP</th><th>Damage</th></tr></thead><tbody>{hpBreakdown.pools.map((pool) => <tr key={pool.key}><th><small className="character-sheet__hp-result">{hitResultsByPool.get(pool.key)}</small>{pool.name}</th><td>{pool.hp} HP</td><td className="character-sheet__write-in" aria-label={`${pool.name} damage taken`}><span aria-hidden="true" /></td></tr>)}</tbody></table>
          </article>
          <article className="character-sheet__ledger character-sheet__ledger--movement">
            <h3>Movement & Initiative</h3>
            <div className="character-sheet__ledger-total"><span>Base Initiative</span><strong>{displayNumber(getBaseInitiative(dexterity))}</strong></div>
            {movementModes.length > 0 ? <table><tbody>{movementModes.map((mode) => <tr key={mode.id}><th>{mode.movementMode}</th><td>{displayNumber(mode.baseValue)}×</td><td>{displayNumber(getMovementInitiative(dexterity, mode.baseValue))} Init.</td></tr>)}</tbody></table> : <p>No movement modes recorded.</p>}
          </article>
          <article className="character-sheet__ledger character-sheet__ledger--mana">
            <h3>Mana</h3>
            <div className="character-sheet__ledger-total"><span>Base Magic</span><strong>{displayNumber(selectedRace?.race.baseMagic ?? 0)}</strong></div>
            {ownedManaProfiles.length > 0 ? <table><tbody>{ownedManaProfiles.map((profile) => <tr key={profile.system}><th>{profile.system}</th><td>{displayNumber(profile.manaPool)}</td><td>{profile.spellAccessLevel ?? "Below Apprentice"}</td></tr>)}</tbody></table> : <p>No active Mana pools.</p>}
          </article>
          <article className="character-sheet__ledger character-sheet__ledger--currency">
            <h3>Currencies</h3>
            <div className="character-sheet__ledger-total"><span>Total Held</span><strong>{purse.formatted}</strong></div>
            <table><tbody>{aggregate.campaign.currencySystem === "Derived Currency" ? <tr><th>Credit Equivalent</th><td>{displayNumber(purseCreditEquivalent)}</td><td>Credits total</td></tr> : null}{heldCurrencies.map((entry) => <tr key={entry.id}><th>{entry.name}</th><td>{displayNumber(entry.quantity)}</td><td>{displayNumber(entry.creditsPerUnit)} Credit{entry.creditsPerUnit === 1 ? "" : "s"} each</td></tr>)}</tbody></table>
            {!purse.fullyRepresented ? <p className="character-currency-warning">This balance cannot be represented exactly by the Campaign denominations.</p> : null}
          </article>
          <article className="character-sheet__ledger character-sheet__ledger--advancement">
            <h3>Advancement Resources</h3>
            <table><tbody>{resourceDetails.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
          </article>
        </section>

        <div className="character-sheet__play-reference">
          <section className="character-sheet__section character-sheet__health"><div className="character-sheet__section-heading"><p>BODY TARGET</p><h3>Health & Hit Locations</h3><span>Total HP = CON {displayNumber(draft.attributes.CON)} × 2 + CON Modifier {signedNumber(getAttributeModifier(draft.attributes.CON))}. Location pools round up.</span></div><CharacterHitLocationChart totalHp={totalHp} /></section>

          <section className="character-sheet__section character-sheet__combat"><div className="character-sheet__section-heading"><p>COMBAT RECORD</p><h3>Weapons & Armor</h3></div>
            <div className="character-sheet__table-block"><h4>Weapons</h4>{weaponRows.length > 0 ? <div className="character-sheet__table-scroll"><table className="character-sheet__weapons-table"><thead><tr><th>Weapon</th><th>Qty</th><th>%</th><th>Damage Type</th><th>Damage</th><th>Mod</th><th>Total Damage</th><th>Range / Reach</th><th>Dur.</th></tr></thead><tbody>{weaponRows.map(({ owned, item }) => {
              const damage = item ? getCharacterWeaponDamageSummary(item, draft.attributes) : null;
              return <tr key={owned.itemId}><th>{item?.name ?? `Item ${owned.itemId}`}</th><td>{owned.quantity}</td><td className="character-sheet__write-in" aria-label={`${item?.name ?? `Item ${owned.itemId}`} attack percentage`}><span aria-hidden="true" /></td><td>{item?.damageType || "—"}</td><td>{item?.damage || "—"}</td><td>{damage?.modifier ?? "—"}</td><td>{damage?.totalDamage ?? "—"}</td><td>{[item?.rangeText, item?.reachText].filter(Boolean).join(" / ") || "—"}</td><td>{item?.durability === null || item?.durability === undefined ? "—" : displayNumber(item.durability)}</td></tr>;
            })}</tbody></table></div> : <p className="character-empty">No weapons recorded.</p>}</div>
            <div className="character-sheet__table-block"><h4>Armor</h4>{armorRows.length > 0 ? <div className="character-sheet__table-scroll"><table><thead><tr><th>Armor</th><th>Qty</th><th>Type</th><th>Area Covered</th><th>Durability</th><th>Base Soak</th><th>Special Properties</th></tr></thead><tbody>{armorRows.map(({ owned, item }) => <tr key={owned.itemId}><th>{item?.name ?? `Item ${owned.itemId}`}</th><td>{owned.quantity}</td><td>{item?.armorType || item?.recordType || "—"}</td><td>{item?.coverage || "—"}</td><td>{item?.durability === null || item?.durability === undefined ? "—" : displayNumber(item.durability)}</td><td>{item?.baseSoak === null || item?.baseSoak === undefined ? "—" : displayNumber(item.baseSoak)}</td><td>{item?.armorRulesText || item?.armorDamageModifiers || "—"}</td></tr>)}</tbody></table></div> : <p className="character-empty">No armor recorded.</p>}</div>
          </section>
        </div>

        <section className="character-sheet__section character-sheet__training"><div className="character-sheet__section-heading"><p>TRAINING RECORD</p><h3>Skills & Abilities</h3><span>Only Skills and Abilities with actual points are shown.</span></div>{sheetSkillSections.length > 0 ? <div className="character-sheet__skill-ledgers">{sheetSkillSections.map((section) => {
          const profile = manaProfiles.find((candidate) => candidate.system === section.key);
          return <article key={section.key} className="character-sheet__skill-ledger"><header><h4>{section.label}</h4>{profile ? <span>{displayNumber(profile.manaPool)} Mana · {profile.spellAccessLevel ?? "Below Apprentice"}</span> : null}</header><table><thead><tr><th>Skill</th><th>#</th><th>Rank</th><th>%</th></tr></thead><tbody>{section.rows.map((row) => <tr key={row.id}><th>{row.name}</th><td title={row.pointNote}>{displayNumber(row.points)}{row.pointNote ? <small>R</small> : null}</td><td>{displayNumber(row.rank)}</td><td>{row.target === null ? "N/A" : `${displayNumber(row.target)}%+`}</td></tr>)}</tbody></table></article>;
        })}</div> : <p className="character-empty">No Skills or Abilities with points are recorded.</p>}</section>

        <section className="character-sheet__section character-sheet__inventory"><div className="character-sheet__section-heading"><p>POSSESSIONS</p><h3>Inventory & General Equipment</h3><span>Weapons and armor are listed once in the Combat Record above.</span></div>{generalItemRows.length > 0 ? <div className="character-sheet__table-scroll"><table className="character-sheet__inventory-table"><thead><tr><th>Item</th><th>Catalog</th><th>Type</th><th>Qty</th><th>Weight</th><th>Unit Cost</th><th>Total Value</th></tr></thead><tbody>{generalItemRows.map(({ owned, item }) => <tr key={owned.itemId}><th>{item?.name ?? `Item ${owned.itemId}`}</th><td>{item?.equipmentGroup || item?.catalogScope || "Inventory"}</td><td>{item?.recordType || item?.category || "Item"}</td><td>{owned.quantity}</td><td>{item?.weight === null || item?.weight === undefined ? "—" : `${displayNumber(item.weight * owned.quantity)} ${item.weightUnit}`}</td><td>{campaignMoney(owned.unitCostCredits)}</td><td>{campaignMoney(owned.quantity * owned.unitCostCredits)}</td></tr>)}</tbody></table></div> : <p className="character-empty">No additional Inventory or General Equipment is currently recorded.</p>}</section>

        {storyDetails.length > 0 ? <section className="character-sheet__section character-sheet__story-section"><div className="character-sheet__section-heading"><p>CHARACTER NOTES</p><h3>Story & Personality</h3></div><div className="character-sheet__story">{storyDetails.map(([label, value]) => <div key={label} className={label === "Backstory" ? "character-sheet__story--wide" : undefined}><strong>{label}</strong><p>{value}</p></div>)}</div></section> : null}
      </section>
    );
  }

  const content = activeTab === "identity" ? renderIdentity()
    : activeTab === "attributes" ? renderAttributes()
      : activeTab === "skills" ? renderSkills()
        : activeTab === "story" ? renderStory()
        : activeTab === "equipment" ? renderEquipment()
          : activeTab === "god" ? renderGodControls()
            : renderSheet();
  const statusBalance = aggregate && draft && readiness
    ? (isGodEditor ? draft.profile.creditsRemaining : readiness.fundsRemaining)
    : 0;
  const statusPurse = aggregate && draft ? characterPurse(statusBalance) : null;
  const statusCreditEquivalent = aggregate && statusPurse
    && aggregate.campaign.currencySystem === "Derived Currency"
    ? getCanonicalCreditsFromHoldings(
        aggregate.campaign.derivedCurrencies,
        statusPurse.entries.map((entry) => ({ currencyId: entry.id, quantity: entry.quantity })),
      )
    : statusBalance;

  return (
    <main className="character-creation-page">
      <div className="character-creation-page__texture" aria-hidden="true" />
      <header className="character-creation-header">
        <div className="character-creation-header__brand"><BrandLogo /></div>
        <div className="character-creation-header__title"><p>{isNpc ? "THE HEAVENS / NPC ADMINISTRATION" : isGodEditor ? "THE HEAVENS / CHARACTER ADMINISTRATION" : "THE REALMS / CHARACTER CREATION"}</p><h1>{isNpc ? "Edit NPC" : isGodEditor ? "Edit Character" : "Character Creation"}</h1><span>Campaign: {aggregate?.campaign.name ?? campaignId} · {isNpc ? "Record: NPC" : `Player: ${aggregate?.character.playerUsername ?? session.username}`} · Character: {draft?.name ?? "Loading…"}</span></div>
        <div className="character-creation-header__actions"><button type="button" onClick={() => requestExit("back")}>Back to {isNpc ? "NPC Master Sheet" : isGodEditor ? "The Heavens" : "The Realms"}</button><button type="button" onClick={() => requestExit("logout")}>Log Out</button></div>
      </header>

      {aggregate && draft && readiness ? (
        <div className="character-status" role="status" aria-live="polite">
          <div className="character-status__metrics">
            <span>Attributes <strong>{displayNumber(readiness.attributesUsed)}{isNpc ? " total" : ` / ${displayNumber(aggregate.campaign.attributePoints)}`}</strong></span>
            <span>Skills <strong>{displayNumber(readiness.skillPointsUsed)}{isNpc ? " invested" : ` / ${displayNumber(aggregate.campaign.skillPoints)}`}</strong></span>
            <span>Race <strong>{readiness.raceComplete ? "✓" : "—"}</strong></span>
            <span>Story <strong>{readiness.storyComplete ? "✓" : "—"}</strong></span>
            <span>Equipment <strong>{readiness.equipmentComplete ? "✓" : "—"}</strong></span>
            <span>{isGodEditor ? "Current Funds" : "Starting Funds"} <strong>{statusPurse?.formatted ?? "Currency unavailable"} {isGodEditor ? "held" : "remaining"}</strong>{aggregate.campaign.currencySystem === "Derived Currency" ? <small>Credit Equivalent: {displayNumber(statusCreditEquivalent)} Credits</small> : null}</span>
          </div>
          <div className={`character-status__readiness${isGodEditor || readiness.ready || creationLocked ? " is-ready" : ""}`}>
            <strong>{isGodEditor ? "G.O.D. Full Access" : creationLocked ? "Creation Complete" : readiness.ready ? "Character Ready" : "Character Draft"}</strong>
            <span>{dirty ? "Unsaved changes" : isNpc ? "NPC record" : isGodEditor ? (aggregate.profile.creationCompletedAt ? "Completed Character" : "Draft Character") : creationLocked ? "Permanent creation record" : "Saved draft"}</span>
          </div>
          {!creationLocked ? (
            <div className="character-status__actions">
              <button type="button" disabled={saving || !dirty} onClick={() => void saveCharacter()}>{saving ? "Saving…" : isNpc ? "Save NPC" : "Save Character"}</button>
              {!isNpc && readiness.ready && !aggregate.profile.creationCompletedAt ? <button className="character-status__complete" type="button" disabled={saving} onClick={() => setConfirmCompletion(true)}>Complete Character</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="character-creation-workspace">
        {feedback ? <div className={`character-feedback character-feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
        {loading ? <section className="character-loading"><p>READING {isNpc ? "NPC" : "CHARACTER"} RECORD</p><h2>Opening the local archive…</h2></section> : null}
        {!loading && aggregate && draft ? (
          <>
            <nav className="character-tabs" aria-label="Character creation sections">{visibleTabs.map(([id, label]) => <button key={id} type="button" className={activeTab === id ? "is-active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>
            {isGodEditor ? <aside className="character-god-notice"><strong>G.O.D. administrative access is active.</strong><span>{isNpc ? "You may edit the entire NPC record directly; player starting budgets, Campaign starting-tier limits, and casting-access gates are not applied." : "You may edit this entire Character record regardless of its creation status. The Player's own completed-character lock remains unchanged."}</span></aside> : creationLocked ? <aside className="character-locked-notice"><strong>Character creation is complete.</strong><span>Identity, Attributes, starting Skills, Story, and starting Equipment are now read-only. Advancement and later purchases use their own controlled workflows.</span></aside> : null}
            {activeTab === "sheet" ? <div className="character-print-toolbar"><span>Open the system print preview to print this record or save it as a PDF.</span><button type="button" onClick={() => window.print()}>Print {isNpc ? "NPC" : "Character"} Sheet</button></div> : null}
            <fieldset className="character-creation-lockable" disabled={creationLocked}>{content}</fieldset>
            {!isGodEditor && !creationLocked && !readiness?.ready && readiness?.issues.length ? <aside className="character-readiness"><strong>Before this Character is ready</strong><ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></aside> : null}
          </>
        ) : null}
      </div>

      {pendingExit ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-character-title"><div><p id="discard-character-title">Unsaved changes</p><span>Leave this {isNpc ? "NPC" : "Character"} and discard the changes you have not saved?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPendingExit(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndExit}>Discard Changes</button></div></div> : null}
      {confirmCompletion ? <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="complete-character-title"><div><p id="complete-character-title">Complete this Character?</p><span>Identity, Story, Attributes, Skills, and starting Equipment are complete. This permanently locks Character creation; later changes use their controlled workflows.</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setConfirmCompletion(false)}>Keep Editing</button><button className="character-complete-confirm" type="button" disabled={saving} onClick={() => { setConfirmCompletion(false); void saveCharacter(true); }}>Complete Character</button></div></div> : null}
      {describedSkill ? (
        <div className="character-skill-description-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDescribedSkill(null); }}>
          <section id={`skill-description-${describedSkill.id}`} className="character-skill-description" role="dialog" aria-modal="true" aria-labelledby="character-skill-description-title">
            <header>
              <div><p>SKILL DESCRIPTION</p><h2 id="character-skill-description-title">{describedSkill.name}</h2></div>
              <button type="button" aria-label="Close Skill description" onClick={() => setDescribedSkill(null)}>×</button>
            </header>
            <div className="character-skill-description__details">
              <span>{getSkillTierLabel(describedSkill)}</span>
              {describedSkill.primaryAttribute ? <span>Primary: {normalizeSkillAttributeKey(describedSkill.primaryAttribute) ?? describedSkill.primaryAttribute}</span> : null}
              {describedSkill.secondaryAttribute ? <span>Secondary: {normalizeSkillAttributeKey(describedSkill.secondaryAttribute) ?? describedSkill.secondaryAttribute}</span> : null}
              {describedSkill.spellLevel ? <span>Spell Level: {describedSkill.spellLevel}</span> : null}
              {describedSkill.manaCost !== null && describedSkill.manaCost !== undefined ? <span>Mana Cost: {displayNumber(describedSkill.manaCost)}</span> : null}
            </div>
            <p className="character-skill-description__definition">{describedSkill.definition.trim() || "No description is currently recorded for this Skill."}</p>
            <footer><button type="button" onClick={() => setDescribedSkill(null)}>Close</button></footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
