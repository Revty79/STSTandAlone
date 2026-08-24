import {
  convertCreditsToDerivedUnits,
  type CampaignPrototypeSnapshot,
} from "../../features/campaign-prototype/campaignPrototype";

type Props = {
  campaignId: number;
  snapshot: CampaignPrototypeSnapshot;
  onEdit: () => void;
};

const CURRENCY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

function ReviewList({ values, emptyLabel }: { values: readonly string[]; emptyLabel: string }) {
  return values.length > 0 ? (
    <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul>
  ) : (
    <p className="campaign-review__empty">{emptyLabel}</p>
  );
}

export function CampaignPrototypeReview({ campaignId, snapshot, onEdit }: Props) {
  return (
    <article className="campaign-review">
      <header className="campaign-review__header">
        <div>
          <p>CAMPAIGN SAVED</p>
          <h2>Campaign Ready</h2>
          <span>Campaign #{campaignId} and all linked selections are stored in the local archive.</span>
        </div>
        <button className="skills-primary-button" type="button" onClick={onEdit}>
          Return to Editing
        </button>
      </header>

      <section className="campaign-review__section">
        <p>CAMPAIGN IDENTITY</p>
        <dl className="campaign-review__details campaign-review__details--identity">
          <div><dt>Campaign Name</dt><dd>{snapshot.name}</dd></div>
        </dl>
      </section>

      <section className="campaign-review__section">
        <p>CHARACTER STARTING RULES</p>
        <dl className="campaign-review__details campaign-review__details--rules">
          <div><dt>Attribute Points</dt><dd>{snapshot.attributePoints}</dd></div>
          <div><dt>Skill Points</dt><dd>{snapshot.skillPoints}</dd></div>
          <div><dt>Max Starting Points Spent per Skill</dt><dd>{snapshot.maxStartingSkill}</dd></div>
          <div><dt>Needed to Unlock Next Tier</dt><dd>{snapshot.pointsToUnlockNextTier}</dd></div>
          <div><dt>Max Points in a Standard Skill</dt><dd>{snapshot.maxPointsInSkill}</dd></div>
        </dl>
      </section>

      <section className="campaign-review__section">
        <p>STARTING ECONOMY</p>
        <dl className="campaign-review__details">
          <div>
            <dt>Starting Credit Amount</dt>
            <dd>{snapshot.startingCreditAmount} Credits</dd>
          </div>
          <div><dt>Currency System</dt><dd>{snapshot.currencySystem}</dd></div>
        </dl>
        {snapshot.derivedCurrencies.length > 0 ? (
          <div className="campaign-review__derived-currencies">
            {snapshot.derivedCurrencies.map((currency, index) => {
              const equivalent = convertCreditsToDerivedUnits(
                snapshot.startingCreditAmount,
                currency.creditsPerUnit,
              );
              return (
                <div className="campaign-review__derived-currency" key={`${currency.name}-${index}`}>
                  <div><strong>{currency.name}</strong><span>Derived Currency {index + 1}</span></div>
                  <p>{currency.description}</p>
                  <div className="campaign-review__currency-math">
                    <b>1 {currency.name} = {CURRENCY_NUMBER_FORMAT.format(currency.creditsPerUnit)} Credits</b>
                    {equivalent !== null ? (
                      <small>{CURRENCY_NUMBER_FORMAT.format(snapshot.startingCreditAmount)} Credits = {CURRENCY_NUMBER_FORMAT.format(equivalent)} {currency.name}</small>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="campaign-review__selection-grid">
        <section className="campaign-review__section">
          <p>ALLOWED TIERS / SYSTEMS</p>
          <ReviewList values={snapshot.allowedSystems} emptyLabel="None selected" />
        </section>
        <section className="campaign-review__section">
          <p>ALLOWED RACES</p>
          <ReviewList values={snapshot.allowedRaces.map((race) => race.name)} emptyLabel="None selected" />
        </section>
      </div>

      <section className="campaign-review__section campaign-review__inventory">
        <p>CAMPAIGN INVENTORY</p>
        <div className="campaign-review__inventory-genres">
          <h3>Inventory Genres</h3>
          <ReviewList values={snapshot.inventoryGenres} emptyLabel="No inventory genres selected" />
        </div>
        <div className="campaign-review__inventory-heading">
          <h3>Available Campaign Items</h3>
          <span>{snapshot.inventoryItems.length} selected</span>
        </div>
        <ReviewList
          values={snapshot.inventoryItems.map((item) => `${item.name} (${item.canonicalId})`)}
          emptyLabel="No inventory Items selected"
        />
      </section>
    </article>
  );
}
