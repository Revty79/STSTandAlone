import { useMemo, useState, type FormEvent } from "react";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  convertCreditsToDerivedUnits,
  createEmptyDerivedCurrencyDraft,
  type CampaignDerivedCurrencyDraft,
  type CampaignInventoryItem,
  type CampaignPrototypeDraft,
  type CampaignPrototypeErrors,
  type CampaignRaceOption,
  type CampaignSystemOption,
} from "../../features/campaign-prototype/campaignPrototype";
import type { ItemTagReference } from "../../types/item";
import { CampaignInventorySelector } from "./CampaignInventorySelector";

type Props = {
  draft: CampaignPrototypeDraft;
  errors: CampaignPrototypeErrors;
  races: readonly CampaignRaceOption[];
  racesLoading: boolean;
  racesError: string;
  inventoryGenres: readonly ItemTagReference[];
  inventoryGenresLoading: boolean;
  inventoryGenresError: string;
  inventoryItems: readonly CampaignInventoryItem[];
  inventoryItemsLoading: boolean;
  inventoryItemsError: string;
  saving: boolean;
  submitLabel: string;
  onChange: (draft: CampaignPrototypeDraft) => void;
  onSubmit: () => void | Promise<void>;
};

type NumericField =
  | "attributePoints"
  | "skillPoints"
  | "maxStartingSkill"
  | "pointsToUnlockNextTier"
  | "maxPointsInSkill";

const STARTING_RULE_FIELDS: readonly [NumericField, string][] = [
  ["attributePoints", "Attribute Points"],
  ["skillPoints", "Skill Points"],
  ["maxStartingSkill", "Max Starting Skill"],
  ["pointsToUnlockNextTier", "Needed to Unlock Next Tier"],
  ["maxPointsInSkill", "Max Points in a Skill"],
];

const CURRENCY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

export function CampaignPrototypeForm({
  draft,
  errors,
  races,
  racesLoading,
  racesError,
  inventoryGenres,
  inventoryGenresLoading,
  inventoryGenresError,
  inventoryItems,
  inventoryItemsLoading,
  inventoryItemsError,
  saving,
  submitLabel,
  onChange,
  onSubmit,
}: Props) {
  const [raceSearch, setRaceSearch] = useState("");
  const selectedRaceIds = useMemo(
    () => new Set(draft.allowedRaceIds),
    [draft.allowedRaceIds],
  );
  const filteredRaces = useMemo(() => {
    const search = raceSearch.trim().toLocaleLowerCase();
    return search
      ? races.filter((race) => race.name.toLocaleLowerCase().includes(search))
      : races;
  }, [raceSearch, races]);

  function update<K extends keyof CampaignPrototypeDraft>(
    field: K,
    value: CampaignPrototypeDraft[K],
  ) {
    onChange({ ...draft, [field]: value });
  }

  function toggleSystem(option: CampaignSystemOption) {
    update(
      "allowedSystems",
      draft.allowedSystems.includes(option)
        ? draft.allowedSystems.filter((candidate) => candidate !== option)
        : [...draft.allowedSystems, option],
    );
  }

  function toggleRace(raceId: number) {
    update(
      "allowedRaceIds",
      selectedRaceIds.has(raceId)
        ? draft.allowedRaceIds.filter((candidate) => candidate !== raceId)
        : [...draft.allowedRaceIds, raceId],
    );
  }

  function changeCurrencySystem(
    currencySystem: CampaignPrototypeDraft["currencySystem"],
  ) {
    onChange({
      ...draft,
      currencySystem,
      derivedCurrencies:
        currencySystem === "Derived Currency" && draft.derivedCurrencies.length === 0
          ? [createEmptyDerivedCurrencyDraft()]
          : draft.derivedCurrencies,
    });
  }

  function updateDerivedCurrency<K extends keyof CampaignDerivedCurrencyDraft>(
    index: number,
    field: K,
    value: CampaignDerivedCurrencyDraft[K],
  ) {
    update(
      "derivedCurrencies",
      draft.derivedCurrencies.map((currency, currencyIndex) =>
        currencyIndex === index ? { ...currency, [field]: value } : currency,
      ),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="campaign-prototype__form" onSubmit={submit} noValidate>
      {Object.keys(errors).length > 0 ? (
        <div className="campaign-prototype__validation" role="alert">
          <strong>The Campaign draft needs a little more information.</strong>
          <span>Review the marked fields below.</span>
        </div>
      ) : null}

      <section className="campaign-prototype__section" aria-labelledby="campaign-identity-heading">
        <div className="campaign-prototype__section-heading">
          <p>CAMPAIGN IDENTITY</p>
          <h2 id="campaign-identity-heading">Name the Campaign</h2>
        </div>
        <div className="campaign-prototype__field-grid campaign-prototype__field-grid--identity">
          <label>
            <span>Campaign Name</span>
            <input
              type="text"
              value={draft.name}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "campaign-name-error" : undefined}
              onChange={(event) => update("name", event.target.value)}
            />
            {errors.name ? <small id="campaign-name-error">{errors.name}</small> : null}
          </label>
        </div>
      </section>

      <section className="campaign-prototype__section" aria-labelledby="campaign-rules-heading">
        <div className="campaign-prototype__section-heading">
          <p>CHARACTER STARTING RULES</p>
          <h2 id="campaign-rules-heading">Starting Values</h2>
        </div>
        <div className="campaign-prototype__field-grid campaign-prototype__field-grid--rules">
          {STARTING_RULE_FIELDS.map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={draft[field]}
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `${field}-error` : undefined}
                onChange={(event) => update(field, event.target.value)}
              />
              {errors[field] ? <small id={`${field}-error`}>{errors[field]}</small> : null}
            </label>
          ))}
        </div>
      </section>

      <section className="campaign-prototype__section" aria-labelledby="campaign-economy-heading">
        <div className="campaign-prototype__section-heading">
          <p>STARTING ECONOMY</p>
          <h2 id="campaign-economy-heading">Opening Currency</h2>
        </div>
        <div className="campaign-prototype__field-grid campaign-prototype__field-grid--economy">
          <label>
            <span>Starting Credit Amount</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={draft.startingCreditAmount}
              aria-invalid={Boolean(errors.startingCreditAmount)}
              aria-describedby={errors.startingCreditAmount ? "starting-credit-error" : undefined}
              onChange={(event) => update("startingCreditAmount", event.target.value)}
            />
            {errors.startingCreditAmount ? (
              <small id="starting-credit-error">{errors.startingCreditAmount}</small>
            ) : null}
          </label>
          <label>
            <span>Currency System</span>
            <select
              value={draft.currencySystem}
              aria-invalid={Boolean(errors.currencySystem)}
              aria-describedby={errors.currencySystem ? "currency-system-error" : undefined}
              onChange={(event) =>
                changeCurrencySystem(
                  event.target.value as CampaignPrototypeDraft["currencySystem"],
                )}
            >
              <option value="">Choose a currency system</option>
              <option value="Credits">Credits</option>
              <option value="Derived Currency">Derived Currency</option>
            </select>
            {errors.currencySystem ? <small id="currency-system-error">{errors.currencySystem}</small> : null}
          </label>
        </div>
        {draft.currencySystem === "Derived Currency" ? (
          <div className="campaign-prototype__derived-currency">
            <div className="campaign-prototype__section-heading">
              <p>DERIVED CURRENCY</p>
              <h3>Campaign Currency System</h3>
            </div>
            {errors.derivedCurrencies ? (
              <p className="campaign-prototype__derived-currency-error" role="alert">
                {errors.derivedCurrencies}
              </p>
            ) : null}
            <div className="campaign-prototype__currency-list">
              {draft.derivedCurrencies.map((currency, index) => {
                const rowErrors = errors.derivedCurrencyRows?.[index] ?? {};
                const startingCredits = Number(draft.startingCreditAmount);
                const creditsPerUnit = Number(currency.creditsPerUnit);
                const equivalent = draft.startingCreditAmount.trim()
                  ? convertCreditsToDerivedUnits(startingCredits, creditsPerUnit)
                  : null;
                return (
                  <section className="campaign-prototype__currency-row" key={index}>
                    <header>
                      <div>
                        <p>CURRENCY {index + 1}</p>
                        <h4>{currency.name.trim() || "Unnamed Currency"}</h4>
                      </div>
                      <button
                        className="is-danger"
                        type="button"
                        onClick={() => update(
                          "derivedCurrencies",
                          draft.derivedCurrencies.filter((_, currencyIndex) => currencyIndex !== index),
                        )}
                      >
                        Remove Currency
                      </button>
                    </header>
                    <div className="campaign-prototype__field-grid campaign-prototype__field-grid--derived-currency">
                      <label>
                        <span>Currency Name</span>
                        <input
                          type="text"
                          value={currency.name}
                          aria-invalid={Boolean(rowErrors.name)}
                          aria-describedby={rowErrors.name ? `derived-currency-name-${index}-error` : undefined}
                          onChange={(event) => updateDerivedCurrency(index, "name", event.target.value)}
                        />
                        {rowErrors.name ? <small id={`derived-currency-name-${index}-error`}>{rowErrors.name}</small> : null}
                      </label>
                      <label>
                        <span>Credit Value per Unit</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={currency.creditsPerUnit}
                          aria-invalid={Boolean(rowErrors.creditsPerUnit)}
                          aria-describedby={rowErrors.creditsPerUnit ? `derived-currency-value-${index}-error` : undefined}
                          onChange={(event) => updateDerivedCurrency(index, "creditsPerUnit", event.target.value)}
                        />
                        {rowErrors.creditsPerUnit ? <small id={`derived-currency-value-${index}-error`}>{rowErrors.creditsPerUnit}</small> : null}
                      </label>
                      <label className="campaign-prototype__field-wide">
                        <span>Brief Description</span>
                        <textarea
                          value={currency.description}
                          aria-invalid={Boolean(rowErrors.description)}
                          aria-describedby={rowErrors.description ? `derived-currency-description-${index}-error` : undefined}
                          onChange={(event) => updateDerivedCurrency(index, "description", event.target.value)}
                        />
                        {rowErrors.description ? <small id={`derived-currency-description-${index}-error`}>{rowErrors.description}</small> : null}
                      </label>
                    </div>
                    {equivalent !== null ? (
                      <p className="campaign-prototype__currency-equivalence">
                        {CURRENCY_NUMBER_FORMAT.format(startingCredits)} Credits = {CURRENCY_NUMBER_FORMAT.format(equivalent)} {currency.name.trim() || "currency units"}
                      </p>
                    ) : null}
                  </section>
                );
              })}
            </div>
            <button
              className="campaign-prototype__add-currency"
              type="button"
              onClick={() => update(
                "derivedCurrencies",
                [...draft.derivedCurrencies, createEmptyDerivedCurrencyDraft()],
              )}
            >
              Add Another Currency
            </button>
            <p className="campaign-prototype__derived-currency-note">
              Each Credit Value records how many Credits one coin, bill, token, or other unit is worth. Credits remain the shared value used for calculations.
            </p>
          </div>
        ) : null}
      </section>

      <section className="campaign-prototype__section" aria-labelledby="campaign-systems-heading">
        <div className="campaign-prototype__section-heading">
          <p>ALLOWED TIERS / SYSTEMS</p>
          <h2 id="campaign-systems-heading">Campaign Access</h2>
        </div>
        <div className="campaign-prototype__choice-grid">
          {CAMPAIGN_SYSTEM_OPTIONS.map((option) => {
            const selected = draft.allowedSystems.includes(option);
            return (
              <label
                className={`campaign-prototype__choice${selected ? " is-selected" : ""}`}
                key={option}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSystem(option)}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="campaign-prototype__section" aria-labelledby="campaign-races-heading">
        <div className="campaign-prototype__section-heading campaign-prototype__section-heading--races">
          <div>
            <p>ALLOWED RACES</p>
            <h2 id="campaign-races-heading">Race Catalog</h2>
          </div>
          <span>{draft.allowedRaceIds.length} selected</span>
        </div>
        <div className="campaign-prototype__race-toolbar">
          <label>
            <span>Search</span>
            <input
              type="search"
              value={raceSearch}
              placeholder="Search Serrian Tide races"
              onChange={(event) => setRaceSearch(event.target.value)}
            />
          </label>
          <div>
            <button
              type="button"
              disabled={racesLoading || races.length === 0}
              onClick={() => update("allowedRaceIds", races.map((race) => race.id))}
            >
              Select All
            </button>
            <button
              type="button"
              disabled={draft.allowedRaceIds.length === 0}
              onClick={() => update("allowedRaceIds", [])}
            >
              Clear All
            </button>
          </div>
        </div>
        <div className="campaign-prototype__race-list" aria-busy={racesLoading}>
          {racesLoading ? <p>Reading the Race catalog…</p> : null}
          {!racesLoading && racesError ? <p role="status">{racesError}</p> : null}
          {!racesLoading && !racesError && filteredRaces.length === 0 ? (
            <p>{races.length === 0 ? "No races are currently available." : "No races match that search."}</p>
          ) : null}
          {!racesLoading && !racesError
            ? filteredRaces.map((race) => (
                <label
                  className={`campaign-prototype__race${selectedRaceIds.has(race.id) ? " is-selected" : ""}`}
                  key={race.id}
                >
                  <input
                    type="checkbox"
                    checked={selectedRaceIds.has(race.id)}
                    onChange={() => toggleRace(race.id)}
                  />
                  <span>{race.name}</span>
                </label>
              ))
            : null}
        </div>
      </section>

      <section className="campaign-prototype__section" aria-labelledby="campaign-inventory-section-heading">
        <div className="campaign-prototype__section-heading campaign-prototype__section-heading--races">
          <div>
            <p>CAMPAIGN ITEM CATALOG</p>
            <h2 id="campaign-inventory-section-heading">Available Equipment & Inventory</h2>
          </div>
          <span>{draft.inventoryItems.length} Items selected</span>
        </div>
        <CampaignInventorySelector
          genres={inventoryGenres}
          genresLoading={inventoryGenresLoading}
          genresError={inventoryGenresError}
          selectedGenres={draft.inventoryGenres}
          availableItems={inventoryItems}
          itemsLoading={inventoryItemsLoading}
          itemsError={inventoryItemsError}
          campaignItems={draft.inventoryItems}
          onSelectedGenresChange={(genres) => update("inventoryGenres", genres)}
          onCampaignItemsChange={(items) => update("inventoryItems", items)}
        />
      </section>

      <footer className="campaign-prototype__form-actions">
        <div>
          <strong>Permanent Campaign record</strong>
          <span>This saves the Campaign and every selected linked record to the local archive.</span>
        </div>
        <button className="skills-primary-button" type="submit" disabled={saving}>
          {saving ? "Saving Campaign…" : submitLabel}
        </button>
      </footer>
    </form>
  );
}
