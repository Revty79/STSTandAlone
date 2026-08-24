import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import {
  buildCharacterAdvancementSkills,
  getMaximumAffordableSkillPoints,
  getSkillAdvancementCost,
  type CharacterAdvancementSkill,
} from "../features/characters/characterAdvancementRules";
import { CHARACTER_ATTRIBUTE_LABELS, type CharacterAggregate } from "../types/character";
import { SPECIAL_ABILITY_EFFECTIVE_MAXIMUM } from "../features/characters/characterRules";
import type { AuthSession } from "../types/user";
import { characterService } from "../services/characterService";
import "../styles/character-advancement.css";

type CharacterAdvancementPageProps = {
  session: AuthSession;
  campaignId: number;
  characterId: number;
  onBack: () => void;
  onLogout: () => void;
};

type AdvancementMode = "choice" | "experience" | "quintessence";
type OwnershipFilter = "all" | "owned" | "new";
type GroupFilter = "ALL" | "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHR" | "SPECIAL" | "OTHER";

const GROUPS: ReadonlyArray<{ id: GroupFilter; label: string }> = [
  { id: "ALL", label: "All" },
  ...Object.entries(CHARACTER_ATTRIBUTE_LABELS).map(([id, label]) => ({
    id: id as GroupFilter,
    label,
  })),
  { id: "SPECIAL", label: "Special Abilities" },
  { id: "OTHER", label: "Other" },
];

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Character advancement could not be completed.";
}

export function CharacterAdvancementPage({
  session,
  campaignId,
  characterId,
  onBack,
  onLogout,
}: CharacterAdvancementPageProps) {
  const [aggregate, setAggregate] = useState<CharacterAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AdvancementMode>("choice");
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<OwnershipFilter>("all");
  const [group, setGroup] = useState<GroupFilter>("ALL");
  const [pending, setPending] = useState<CharacterAdvancementSkill | null>(null);
  const [purchasePoints, setPurchasePoints] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [describedSkill, setDescribedSkill] = useState<CharacterAdvancementSkill | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    characterService.getCharacter(characterId, campaignId, session.userId, "player")
      .then((character) => {
        if (!active) return;
        if (!character) throw new Error("This Character could not be found in the selected Campaign.");
        if (!character.profile.creationCompletedAt) {
          throw new Error("Character creation must be completed before the Character can advance.");
        }
        setAggregate(character);
      })
      .catch((error: unknown) => {
        if (active) setFeedback({ kind: "error", message: errorMessage(error) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, characterId, session.userId]);

  const advancementSkills = useMemo(
    () => aggregate ? buildCharacterAdvancementSkills(aggregate) : [],
    [aggregate],
  );
  const visibleSkills = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return advancementSkills.filter((entry) => {
      if (group !== "ALL" && entry.group !== group) return false;
      if (ownership === "owned" && !entry.owned) return false;
      if (ownership === "new" && entry.owned) return false;
      return !query || [
        entry.skill.name,
        entry.skill.classification,
        entry.skill.definition,
        entry.path.join(" "),
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [advancementSkills, group, ownership, search]);
  const maximumPurchasePoints = pending && aggregate
    ? getMaximumAffordableSkillPoints(
        pending.effectivePoints,
        aggregate.profile.experience,
        pending.maximumEffectivePoints,
      )
    : 0;
  const pendingExperienceCost = pending
    ? getSkillAdvancementCost(pending.effectivePoints, purchasePoints)
    : 0;

  function beginPurchase(entry: CharacterAdvancementSkill) {
    setPurchasePoints(1);
    setPending(entry);
  }

  function changePurchasePoints(value: number) {
    setPurchasePoints(Math.min(
      maximumPurchasePoints,
      Math.max(1, Math.trunc(value || 1)),
    ));
  }

  async function confirmPurchase() {
    if (!aggregate || !pending || purchasing) return;
    setPurchasing(true);
    setFeedback(null);
    try {
      const advanced = await characterService.advanceSkill(
        aggregate,
        session.userId,
        pending.skill.id,
        pending.parentAllocationId,
        purchasePoints,
      );
      setAggregate(advanced);
      setPending(null);
      setFeedback({
        kind: "success",
        message: `${pending.skill.name} increased by ${purchasePoints} ${purchasePoints === 1 ? "point" : "points"} to ${displayNumber(pending.effectivePoints + purchasePoints)}. ${displayNumber(pendingExperienceCost)} Experience was added to Lifetime Experience.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
      setPending(null);
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <main className="character-advancement-page">
      <div className="character-advancement-page__texture" aria-hidden="true" />
      <header className="character-advancement-header">
        <div className="character-advancement-header__brand"><BrandLogo /></div>
        <div className="character-advancement-header__title">
          <p>THE REALMS · CHARACTER GROWTH</p>
          <h1>Advance Character</h1>
          <span>{aggregate ? `${aggregate.character.name} · ${aggregate.campaign.name}` : "Reading the Chronicle"}</span>
        </div>
        <div className="character-advancement-header__actions">
          {mode !== "choice" ? (
            <button type="button" onClick={() => setMode("choice")}>Advancement Paths</button>
          ) : null}
          <button type="button" onClick={onBack}>Return to Realms</button>
          <button type="button" onClick={onLogout}>Log Out</button>
        </div>
      </header>

      {loading ? (
        <section className="character-advancement-loading" aria-live="polite">
          <p>OPENING THE CHRONICLE</p>
          <h2>Reading Character advancement records…</h2>
        </section>
      ) : !aggregate ? (
        <section className="character-advancement-loading character-advancement-loading--error">
          <p>THE CHRONICLE COULD NOT BE OPENED</p>
          <h2>{feedback?.message ?? "Character advancement is unavailable."}</h2>
          <button type="button" onClick={onBack}>Return to Realms</button>
        </section>
      ) : (
        <div className="character-advancement-workspace">
          {feedback ? (
            <p className={`character-advancement-feedback character-advancement-feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
              {feedback.message}
            </p>
          ) : null}

          {mode === "choice" ? (
            <section className="advancement-choice" aria-labelledby="advancement-choice-heading">
              <div className="advancement-section-heading">
                <p>CHOOSE AN ADVANCEMENT PATH</p>
                <h2 id="advancement-choice-heading">How will {aggregate.character.name} grow?</h2>
                <span>Experience improves learned Skills. Quintessence will open a different path of advancement.</span>
              </div>
              <div className="advancement-choice__cards">
                <button type="button" onClick={() => setMode("experience")}>
                  <span className="advancement-choice__ornament" aria-hidden="true">XP</span>
                  <strong>Spend Experience</strong>
                  <span>Improve an existing Skill or purchase the first point in a new unlocked Skill.</span>
                  <small>{displayNumber(aggregate.profile.experience)} Experience available</small>
                </button>
                <button type="button" onClick={() => setMode("quintessence")}>
                  <span className="advancement-choice__ornament" aria-hidden="true">Q</span>
                  <strong>Spend Quintessence</strong>
                  <span>Enter the future Quintessence advancement store.</span>
                  <small>{displayNumber(aggregate.profile.quintessence)} Quintessence available</small>
                </button>
              </div>
            </section>
          ) : null}

          {mode === "quintessence" ? (
            <section className="advancement-placeholder">
              <p>QUINTESSENCE ADVANCEMENT</p>
              <h2>The Quintessence store is reserved for the next pass.</h2>
              <span>No Quintessence can be spent from this placeholder, so the Character record remains unchanged.</span>
              <div><strong>{displayNumber(aggregate.profile.quintessence)}</strong><small>Available Quintessence</small></div>
              <button type="button" onClick={() => setMode("choice")}>Return to Advancement Paths</button>
            </section>
          ) : null}

          {mode === "experience" ? (
            <section className="experience-advancement" aria-labelledby="experience-advancement-heading">
              <div className="experience-ledger">
                <div><span>Available Experience</span><strong>{displayNumber(aggregate.profile.experience)}</strong></div>
                <div><span>Lifetime Experience</span><strong>{displayNumber(aggregate.profile.totalExperience)}</strong></div>
                <div><span>Standard Skill Maximum</span><strong>{displayNumber(aggregate.campaign.maxPointsInSkill)}</strong></div>
                <div><span>Special Ability Maximum</span><strong>{displayNumber(SPECIAL_ABILITY_EFFECTIVE_MAXIMUM)}</strong></div>
              </div>
              <div className="advancement-section-heading advancement-section-heading--experience">
                <p>SPEND EXPERIENCE</p>
                <h2 id="experience-advancement-heading">Improve Skills & Abilities</h2>
                <span>An owned Skill costs its current effective point value to increase by one. The first point in a completely new Skill costs 10 Experience.</span>
              </div>
              <div className="experience-filters">
                <label>
                  <span>Search Skills</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, branch, or description" />
                </label>
                <label>
                  <span>Show</span>
                  <select value={ownership} onChange={(event) => setOwnership(event.target.value as OwnershipFilter)}>
                    <option value="all">Owned and New</option>
                    <option value="owned">Owned Skills</option>
                    <option value="new">New Skills</option>
                  </select>
                </label>
              </div>
              <div className="experience-group-tabs" role="tablist" aria-label="Skill Attribute Groups">
                {GROUPS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={group === option.id}
                    className={group === option.id ? "is-active" : ""}
                    onClick={() => setGroup(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="experience-skill-list">
                {visibleSkills.length === 0 ? (
                  <p className="experience-skill-list__empty">No unlocked Skills match these filters.</p>
                ) : visibleSkills.map((entry) => {
                  const disabledReason = entry.atMaximum
                    ? "Campaign maximum reached"
                    : !entry.canAfford
                      ? "Not enough Experience"
                      : null;
                  return (
                    <article
                      className={`experience-skill${entry.owned ? " is-owned" : " is-new"}`}
                      key={entry.key}
                      style={{ "--advancement-depth": entry.depth } as React.CSSProperties}
                    >
                      <div className="experience-skill__identity">
                        <div>
                          <strong>{entry.skill.name}</strong>
                          <button type="button" aria-label={`Read ${entry.skill.name} description`} onClick={() => setDescribedSkill(entry)}>?</button>
                        </div>
                        <span>{entry.tierLabel}</span>
                        {entry.path.length > 1 ? <small>{entry.path.join(" › ")}</small> : null}
                      </div>
                      <div className="experience-skill__numbers">
                        <div><span>Current #</span><strong>{entry.owned ? displayNumber(entry.effectivePoints) : "0"}</strong></div>
                        <div><span>After</span><strong>{displayNumber(entry.nextEffectivePoints)}</strong></div>
                        <div><span>Rank</span><strong>{entry.owned ? displayNumber(entry.rank) : "0"}</strong></div>
                        <div><span>Roll Target</span><strong>{entry.rollTarget === null ? "N/A" : `${displayNumber(entry.rollTarget)}%`}</strong></div>
                      </div>
                      <div className="experience-skill__purchase">
                        {entry.racialPoints > 0 ? <small>Includes {displayNumber(entry.racialPoints)} racial points</small> : <small>{entry.owned ? "Owned Skill" : "New Skill"}</small>}
                        <button type="button" disabled={Boolean(disabledReason)} title={disabledReason ?? undefined} onClick={() => beginPurchase(entry)}>
                          {disabledReason ?? `Spend ${displayNumber(entry.experienceCost)} XP`}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {pending && aggregate ? (
        <div className="advancement-dialog-backdrop" role="presentation">
          <section className="advancement-dialog" role="dialog" aria-modal="true" aria-labelledby="advancement-confirm-title">
            <p>CONFIRM EXPERIENCE PURCHASE</p>
            <h2 id="advancement-confirm-title">Increase {pending.skill.name}?</h2>
            <div className="advancement-point-picker">
              <span>Points to add</span>
              <div>
                <button type="button" aria-label="Remove one point" disabled={purchasing || purchasePoints <= 1} onClick={() => changePurchasePoints(purchasePoints - 1)}>−</button>
                <input
                  aria-label="Points to add"
                  type="number"
                  min="1"
                  max={maximumPurchasePoints}
                  step="1"
                  value={purchasePoints}
                  disabled={purchasing}
                  onChange={(event) => changePurchasePoints(Number(event.target.value))}
                />
                <button type="button" aria-label="Add one point" disabled={purchasing || purchasePoints >= maximumPurchasePoints} onClick={() => changePurchasePoints(purchasePoints + 1)}>+</button>
                <button type="button" disabled={purchasing || purchasePoints >= maximumPurchasePoints} onClick={() => changePurchasePoints(Math.min(maximumPurchasePoints, purchasePoints + 5))}>+5</button>
                <button type="button" disabled={purchasing || purchasePoints >= maximumPurchasePoints} onClick={() => changePurchasePoints(maximumPurchasePoints)}>Max affordable</button>
              </div>
              <small>Each added point costs the Skill’s projected current value. A completely new Skill begins at 10 XP.</small>
            </div>
            <dl>
              <div><dt>Skill points</dt><dd>{displayNumber(pending.effectivePoints)} → {displayNumber(pending.effectivePoints + purchasePoints)}</dd></div>
              <div><dt>Experience cost</dt><dd>{displayNumber(pendingExperienceCost)}</dd></div>
              <div><dt>Available Experience</dt><dd>{displayNumber(aggregate.profile.experience)} → {displayNumber(aggregate.profile.experience - pendingExperienceCost)}</dd></div>
              <div><dt>Lifetime Experience</dt><dd>{displayNumber(aggregate.profile.totalExperience)} → {displayNumber(aggregate.profile.totalExperience + pendingExperienceCost)}</dd></div>
            </dl>
            <span>This purchase is saved immediately to the Character.</span>
            <div className="advancement-dialog__actions">
              <button type="button" disabled={purchasing} onClick={() => setPending(null)}>Cancel</button>
              <button type="button" disabled={purchasing} onClick={confirmPurchase}>{purchasing ? "Spending Experience…" : "Confirm Purchase"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {describedSkill ? (
        <div className="advancement-dialog-backdrop" role="presentation">
          <section className="advancement-dialog advancement-dialog--description" role="dialog" aria-modal="true" aria-labelledby="advancement-description-title">
            <p>SKILL DESCRIPTION</p>
            <h2 id="advancement-description-title">{describedSkill.skill.name}</h2>
            <span>{describedSkill.skill.definition.trim() || "No description has been recorded for this Skill."}</span>
            <div className="advancement-dialog__actions"><button type="button" onClick={() => setDescribedSkill(null)}>Close</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
