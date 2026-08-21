import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CreatureEditor } from "../components/creatures/CreatureEditor";
import { CreatureLibrary } from "../components/creatures/CreatureLibrary";
import {
  CreatureValidationError,
  creatureService,
} from "../services/creatureService";
import type {
  CreatureAggregate,
  CreatureLibraryFilters,
  CreatureLibraryOptions,
  CreatureLibraryPage,
  CreatureSummary,
  SaveCreatureAggregate,
} from "../types/creature";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/creatures-page.css";

type Props = {
  session: AuthSession;
  onBack: () => void;
  onLogout: () => void;
};

const EMPTY_PAGE: CreatureLibraryPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 40,
  pageCount: 1,
};
const EMPTY_OPTIONS: CreatureLibraryOptions = {
  types: [],
  roles: [],
  sizes: [],
  genres: [],
};

export function creatureAggregateToDraft(
  aggregate: CreatureAggregate,
): SaveCreatureAggregate {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...core
  } = aggregate.creature;
  return {
    id: aggregate.creature.id,
    core,
    altNames: aggregate.altNames.map(({ altName, sortOrder }) => ({ altName, sortOrder })),
    genreTags: aggregate.genreTags.map(({ genreTag, sortOrder }) => ({ genreTag, sortOrder })),
    attributes: aggregate.attributes.map(({ attributeKey, value, notes, sortOrder }) => ({ attributeKey, value, notes, sortOrder })),
    movementModes: aggregate.movementModes.map(({ movementMode, baseValue, notes, sortOrder }) => ({ movementMode, baseValue, notes, sortOrder })),
    hpLocations: aggregate.hpLocations.map(({ locationName, hpValue, notes, sortOrder }) => ({ locationName, hpValue, notes, sortOrder })),
    attacks: aggregate.attacks.map(({ name, damage, rangeText, effect, notes, sortOrder }) => ({ name, damage, rangeText, effect, notes, sortOrder })),
    skillLinks: aggregate.skillLinks.map(({ skillId, skillName, skillClassification, linkType, value, notes, sortOrder }) => ({ skillId, skillName, skillClassification, linkType, value, notes, sortOrder })),
    uses: aggregate.uses.map(({ useType, notes, sortOrder }) => ({ useType, notes, sortOrder })),
    variants: aggregate.variants.map(({ name, description, notes, sortOrder }) => ({ name, description, notes, sortOrder })),
    purchaseItemLinks: aggregate.purchaseItemLinks.map(({ itemId, itemName, costCredits, category, subtype, genreTags, relationship, notes }) => ({ itemId, itemName, costCredits, category, subtype, genreTags, relationship, notes })),
  };
}

export function newCreatureDraft(userId: number): SaveCreatureAggregate {
  return {
    core: {
      name: "",
      challengeRating: null,
      encounterScale: "",
      type: "",
      role: "",
      size: "",
      descriptionShort: "",
      hpTotal: null,
      initiative: null,
      armorSoak: null,
      magicResonanceInteraction: "",
      behaviorTactics: "",
      habitat: "",
      diet: "",
      lootHarvest: "",
      storyHooks: "",
      notes: "",
      createdByUserId: userId,
      sourceSystem: null,
      sourceExternalId: null,
    },
    altNames: [],
    genreTags: [],
    attributes: [],
    movementModes: [],
    hpLocations: [],
    attacks: [],
    skillLinks: [],
    uses: [],
    variants: [],
    purchaseItemLinks: [],
  };
}

export function CreaturesPage({ session, onBack, onLogout }: Props) {
  const [filters, setFilters] = useState<CreatureLibraryFilters>({
    page: 1,
    pageSize: 40,
  });
  const [page, setPage] = useState(EMPTY_PAGE);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [draft, setDraft] = useState<SaveCreatureAggregate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const load = useCallback(async (next: CreatureLibraryFilters) => {
    setLoading(true);
    try {
      const [result, filterOptions] = await Promise.all([
        creatureService.listCreatures(next),
        creatureService.listOptions(),
      ]);
      setPage(result);
      setOptions(filterOptions);
    } catch {
      setFeedback({
        kind: "error",
        message: "The Creature library could not be read from the local archive.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, load]);

  async function open(creature: CreatureSummary) {
    setFeedback(null);
    try {
      const aggregate = await creatureService.getCreature(creature.id);
      if (!aggregate) throw new Error("Creature not found");
      setDraft(creatureAggregateToDraft(aggregate));
      setDirty(false);
    } catch {
      setFeedback({ kind: "error", message: "That Creature could not be loaded." });
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const aggregate = await creatureService.saveCreature(draft);
      setDraft(creatureAggregateToDraft(aggregate));
      setDirty(false);
      setFeedback({
        kind: "success",
        message: `${aggregate.creature.name} was saved.`,
      });
      await load(filters);
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof CreatureValidationError
            ? error.message
            : "The Creature could not be saved. Existing data was left intact.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const name = draft.core.name;
      await creatureService.deleteCreature(draft.id);
      setDraft(null);
      setDirty(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await load(filters);
    } catch {
      setFeedback({ kind: "error", message: "The Creature could not be deleted." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="skills-page creatures-page">
      <header className="skills-page__header">
        <div className="skills-page__brand"><BrandLogo /></div>
        <div className="skills-page__title">
          <p>THE HEAVENS / CREATURES</p>
          <h1>Creatures</h1>
          <span>G.O.D. canonical bestiary workspace · {session.username}</span>
        </div>
        <div className="skills-page__navigation">
          <button type="button" onClick={onBack}>Back to The Heavens</button>
          <button type="button" onClick={onLogout}>Log Out</button>
        </div>
      </header>
      <div className="skills-workspace creature-workspace">
        <CreatureLibrary
          page={page}
          filters={filters}
          options={options}
          selectedCreatureId={draft?.id}
          loading={loading}
          onFiltersChange={setFilters}
          onSelect={(creature) => {
            if (!dirty || window.confirm("Discard unsaved Creature changes?")) {
              void open(creature);
            }
          }}
          onNew={() => {
            if (!dirty || window.confirm("Discard unsaved Creature changes?")) {
              setDraft(newCreatureDraft(session.userId));
              setDirty(false);
              setFeedback(null);
            }
          }}
        />
        <CreatureEditor
          draft={draft}
          saving={saving}
          dirty={dirty}
          feedback={feedback}
          onChange={(next) => {
            setDraft(next);
            setDirty(true);
            setFeedback(null);
          }}
          onSave={() => void save()}
          onDelete={() => void remove()}
          findSkills={(search, classification) =>
            creatureService.listSkillCandidates(search, classification)
          }
          findItems={(search) => creatureService.listItemCandidates(search)}
        />
      </div>
    </main>
  );
}
