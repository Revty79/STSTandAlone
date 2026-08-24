import { useEffect, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CampaignPrototypeForm } from "../components/campaigns/CampaignPrototypeForm";
import { CampaignPrototypeReview } from "../components/campaigns/CampaignPrototypeReview";
import {
  completeCampaignPrototype,
  createEmptyCampaignPrototypeDraft,
  deduplicateCampaignInventoryItems,
  type CampaignInventoryItem,
  type CampaignPrototypeDraft,
  type CampaignPrototypeErrors,
  type CampaignPrototypeSnapshot,
  type CampaignRaceOption,
} from "../features/campaign-prototype/campaignPrototype";
import { itemService } from "../services/itemService";
import { campaignService } from "../services/campaignService";
import { raceService } from "../services/raceService";
import type { CampaignAggregate } from "../types/campaign";
import type { ItemTagReference } from "../types/item";
import type { AuthSession } from "../types/user";
import "../styles/skills-page.css";
import "../styles/campaign-prototype.css";

type Props = {
  session: AuthSession;
  onBack: () => void;
  onLogout: () => void;
};

type PendingExit = "back" | "logout";

function campaignAggregateToSnapshot(
  aggregate: CampaignAggregate,
): CampaignPrototypeSnapshot {
  return {
    name: aggregate.campaign.name,
    attributePoints: aggregate.campaign.attributePoints,
    skillPoints: aggregate.campaign.skillPoints,
    maxStartingSkill: aggregate.campaign.maxStartingSkill,
    pointsToUnlockNextTier: aggregate.campaign.pointsToUnlockNextTier,
    maxPointsInSkill: aggregate.campaign.maxPointsInSkill,
    startingCreditAmount: aggregate.campaign.startingCreditAmount,
    currencySystem: aggregate.campaign.currencySystem,
    derivedCurrencies: aggregate.derivedCurrencies.map((currency) => ({
      name: currency.name,
      description: currency.description,
      creditsPerUnit: currency.creditsPerUnit,
    })),
    allowedSystems: aggregate.allowedSystems,
    allowedRaces: aggregate.allowedRaces,
    inventoryGenres: aggregate.inventoryGenres.map((genre) => genre.name),
    inventoryItems: aggregate.inventoryItems,
  };
}

export async function readCampaignRaceOptions(): Promise<CampaignRaceOption[]> {
  const firstPage = await raceService.listRaces({ page: 1, pageSize: 100 });
  const races = [...firstPage.items];

  for (let page = 2; page <= firstPage.pageCount; page += 1) {
    const nextPage = await raceService.listRaces({ page, pageSize: 100 });
    races.push(...nextPage.items);
  }

  return races.map(({ id, name }) => ({ id, name }));
}

export async function readCampaignInventoryGenres(): Promise<ItemTagReference[]> {
  const references = await Promise.all([
    itemService.listTagReferences("equipment"),
    itemService.listTagReferences("inventory"),
  ]);
  const byName = new Map<string, ItemTagReference>();
  for (const reference of references.flat()) {
    if (!byName.has(reference.name)) byName.set(reference.name, reference);
  }
  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export async function readCampaignInventoryItems(
  genres: readonly string[],
): Promise<CampaignInventoryItem[]> {
  const taggedItemGroups = await Promise.all(genres.flatMap((genre) =>
    (["equipment", "inventory"] as const).map(async (catalogScope) => {
      const firstPage = await itemService.listItems({
        catalogScope,
        tag: genre,
        page: 1,
        pageSize: 100,
      });
      const items = [...firstPage.items];

      for (let page = 2; page <= firstPage.pageCount; page += 1) {
        const nextPage = await itemService.listItems({
          catalogScope,
          tag: genre,
          page,
          pageSize: 100,
        });
        items.push(...nextPage.items);
      }
      return items;
    }),
  ));

  return deduplicateCampaignInventoryItems(taggedItemGroups.flatMap((items) =>
    items.map(({ id, canonicalId, name, recordType, family, category, catalogScope, equipmentGroup, tags }) => ({
      id,
      canonicalId,
      name,
      recordType,
      family,
      category,
      catalogScope,
      equipmentGroup,
      tags,
    })),
  ));
}

export function CampaignPrototypePage({ session, onBack, onLogout }: Props) {
  const [draft, setDraft] = useState<CampaignPrototypeDraft>(
    createEmptyCampaignPrototypeDraft,
  );
  const [errors, setErrors] = useState<CampaignPrototypeErrors>({});
  const [snapshot, setSnapshot] = useState<CampaignPrototypeSnapshot | null>(null);
  const [campaignId, setCampaignId] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [races, setRaces] = useState<CampaignRaceOption[]>([]);
  const [racesLoading, setRacesLoading] = useState(true);
  const [racesError, setRacesError] = useState("");
  const [inventoryGenres, setInventoryGenres] = useState<ItemTagReference[]>([]);
  const [inventoryGenresLoading, setInventoryGenresLoading] = useState(true);
  const [inventoryGenresError, setInventoryGenresError] = useState("");
  const [inventoryItems, setInventoryItems] = useState<CampaignInventoryItem[]>([]);
  const [inventoryItemsLoading, setInventoryItemsLoading] = useState(false);
  const [inventoryItemsError, setInventoryItemsError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);

  useEffect(() => {
    let active = true;
    readCampaignRaceOptions()
      .then((options) => {
        if (active) setRaces(options);
      })
      .catch(() => {
        if (active) {
          setRacesError(
            "The Race catalog could not be read. You can still complete the rest of the Campaign form.",
          );
        }
      })
      .finally(() => {
        if (active) setRacesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readCampaignInventoryGenres()
      .then((genres) => {
        if (active) setInventoryGenres(genres);
      })
      .catch(() => {
        if (active) {
          setInventoryGenresError(
            "The inventory genres could not be read from the local catalog.",
          );
        }
      })
      .finally(() => {
        if (active) setInventoryGenresLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (draft.inventoryGenres.length === 0) {
      setInventoryItems([]);
      setInventoryItemsError("");
      setInventoryItemsLoading(false);
      return () => {
        active = false;
      };
    }

    setInventoryItems([]);
    setInventoryItemsError("");
    setInventoryItemsLoading(true);
    readCampaignInventoryItems(draft.inventoryGenres)
      .then((items) => {
        if (active) setInventoryItems(items);
      })
      .catch(() => {
        if (active) {
          setInventoryItemsError(
            "The selected inventory genres could not be read from the local catalog.",
          );
        }
      })
      .finally(() => {
        if (active) setInventoryItemsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [draft.inventoryGenres]);

  useEffect(() => {
    if (!dirty) return;

    function warnBeforeClosing(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [dirty]);

  function changeDraft(nextDraft: CampaignPrototypeDraft) {
    setDraft(nextDraft);
    setErrors({});
    setSnapshot(null);
    setSaveError("");
    setDirty(true);
  }

  async function submitDraft() {
    const result = completeCampaignPrototype(draft, races);
    setErrors(result.errors);
    if (!result.ok) return;

    setSaving(true);
    setSaveError("");
    try {
      const savedCampaign = await campaignService.saveCampaign({
        id: campaignId,
        core: {
          name: result.snapshot.name,
          attributePoints: result.snapshot.attributePoints,
          skillPoints: result.snapshot.skillPoints,
          maxStartingSkill: result.snapshot.maxStartingSkill,
          pointsToUnlockNextTier: result.snapshot.pointsToUnlockNextTier,
          maxPointsInSkill: result.snapshot.maxPointsInSkill,
          startingCreditAmount: result.snapshot.startingCreditAmount,
          currencySystem: result.snapshot.currencySystem,
          createdByUserId: session.userId,
        },
        derivedCurrencies: result.snapshot.derivedCurrencies,
        allowedSystems: result.snapshot.allowedSystems,
        allowedRaceIds: result.snapshot.allowedRaces.map((race) => race.id),
        inventoryGenreNames: result.snapshot.inventoryGenres,
        inventoryItemIds: result.snapshot.inventoryItems.map((item) => item.id),
      });
      setCampaignId(savedCampaign.campaign.id);
      setSnapshot(campaignAggregateToSnapshot(savedCampaign));
      setDirty(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `The Campaign could not be saved: ${error.message}`
          : "The Campaign could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function requestExit(destination: PendingExit) {
    if (dirty) {
      setPendingExit(destination);
      return;
    }
    if (destination === "back") onBack();
    else onLogout();
  }

  function discardAndExit() {
    const destination = pendingExit;
    setPendingExit(null);
    if (destination === "back") onBack();
    else if (destination === "logout") onLogout();
  }

  return (
    <main className="skills-page campaign-prototype-page">
      <header className="skills-page__header">
        <div className="skills-page__brand"><BrandLogo /></div>
        <div className="skills-page__title">
          <p>THE HEAVENS / CAMPAIGN CREATION</p>
          <h1>Create Campaign</h1>
          <span>Permanent Campaign archive · {session.username}</span>
        </div>
        <div className="skills-page__navigation">
          <button type="button" onClick={() => requestExit("back")}>Back to The Heavens</button>
          <button type="button" onClick={() => requestExit("logout")}>Log Out</button>
        </div>
      </header>

      <div className="campaign-prototype-workspace">
        <aside className="campaign-prototype__notice" role="note">
          <strong>Campaign database</strong>
          <span>Saved Campaigns remain in the local archive. Unsaved edits are protected before you leave.</span>
        </aside>

        {saveError ? (
          <div className="campaign-prototype__validation" role="alert">
            <strong>Campaign save failed.</strong>
            <span>{saveError}</span>
          </div>
        ) : null}

        {snapshot && campaignId ? (
          <CampaignPrototypeReview
            campaignId={campaignId}
            snapshot={snapshot}
            onEdit={() => setSnapshot(null)}
          />
        ) : (
          <CampaignPrototypeForm
            draft={draft}
            errors={errors}
            races={races}
            racesLoading={racesLoading}
            racesError={racesError}
            inventoryGenres={inventoryGenres}
            inventoryGenresLoading={inventoryGenresLoading}
            inventoryGenresError={inventoryGenresError}
            inventoryItems={inventoryItems}
            inventoryItemsLoading={inventoryItemsLoading}
            inventoryItemsError={inventoryItemsError}
            saving={saving}
            submitLabel={campaignId ? "Update Campaign" : "Create Campaign"}
            onChange={changeDraft}
            onSubmit={submitDraft}
          />
        )}
      </div>

      {pendingExit ? (
        <div
          className="skills-page__discard-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="discard-campaign-title"
        >
          <div>
            <p id="discard-campaign-title">Unsaved changes</p>
            <span>Leave Campaign creation and discard these unsaved changes?</span>
          </div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPendingExit(null)}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={discardAndExit}>Discard Changes</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
