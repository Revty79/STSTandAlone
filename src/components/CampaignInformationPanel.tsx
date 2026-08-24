import type { CampaignAggregate } from "../types/campaign";

type CampaignInformationPanelProps = {
  campaign: CampaignAggregate | null;
  loading: boolean;
  error: string;
  onEdit: () => void;
  onClose: () => void;
};

export function CampaignInformationPanel({
  campaign,
  loading,
  error,
  onEdit,
  onClose,
}: CampaignInformationPanelProps) {
  const heading = loading
    ? "Reading Campaign…"
    : campaign?.campaign.name ?? "No Campaign Selected";

  return (
    <section
      className="campaign-information"
      id="campaign-information"
      aria-labelledby="campaign-information-heading"
    >
      <header className="campaign-information__header">
        <div>
          <p>CAMPAIGN INFORMATION</p>
          <h4 id="campaign-information-heading">{heading}</h4>
        </div>
        <div className="campaign-information__header-actions">
          {campaign ? <button className="campaign-information__edit" type="button" onClick={onEdit}>Edit Campaign</button> : null}
          <button
            className="campaign-information__close"
            type="button"
            onClick={onClose}
            aria-label="Close campaign information"
          >
            Close
          </button>
        </div>
      </header>
      {loading ? (
        <p className="campaign-information__message">Reading the saved Campaign and its linked records…</p>
      ) : error ? (
        <p className="campaign-information__message campaign-information__message--error" role="alert">{error}</p>
      ) : !campaign ? (
        <p className="campaign-information__message">Select a campaign to view its information.</p>
      ) : (
        <div className="campaign-information__body">
          <dl className="campaign-information__rules">
            <div><dt>Attribute Points</dt><dd>{campaign.campaign.attributePoints}</dd></div>
            <div><dt>Skill Points</dt><dd>{campaign.campaign.skillPoints}</dd></div>
            <div><dt>Max Starting Points Spent per Skill</dt><dd>{campaign.campaign.maxStartingSkill}</dd></div>
            <div><dt>Unlock Next Tier</dt><dd>{campaign.campaign.pointsToUnlockNextTier}</dd></div>
            <div><dt>Max Points in a Standard Skill</dt><dd>{campaign.campaign.maxPointsInSkill}</dd></div>
            <div><dt>Starting Credits</dt><dd>{campaign.campaign.startingCreditAmount}</dd></div>
            <div><dt>Fate Points</dt><dd>{campaign.campaign.fatePointMethod === "Assigned" ? `Assigned · ${campaign.campaign.assignedFatePoints ?? 0}` : "Rolled by each player"}</dd></div>
          </dl>

          <div className="campaign-information__columns">
            <section>
              <h5>Currency</h5>
              <p>{campaign.campaign.currencySystem}</p>
              {campaign.derivedCurrencies.length > 0 ? (
                <ul>{campaign.derivedCurrencies.map((currency) => (
                  <li key={currency.id}>
                    <strong>{currency.name}</strong>
                    <span>{currency.description} · 1 = {currency.creditsPerUnit} Credits</span>
                  </li>
                ))}</ul>
              ) : null}
            </section>
            <section>
              <h5>Campaign Access</h5>
              {campaign.allowedSystems.length > 0
                ? <ul>{campaign.allowedSystems.map((system) => <li key={system}>{system}</li>)}</ul>
                : <p>None selected</p>}
            </section>
            <section>
              <h5>Allowed Races</h5>
              {campaign.allowedRaces.length > 0
                ? <ul>{campaign.allowedRaces.map((race) => <li key={race.id}>{race.name}</li>)}</ul>
                : <p>None selected</p>}
            </section>
            <section>
              <h5>Inventory Genres</h5>
              {campaign.inventoryGenres.length > 0
                ? <ul>{campaign.inventoryGenres.map((genre) => <li key={genre.id}>{genre.name}</li>)}</ul>
                : <p>None selected</p>}
            </section>
          </div>

          <section className="campaign-information__inventory">
            <h5>Campaign Inventory <span>{campaign.inventoryItems.length} Items</span></h5>
            {campaign.inventoryItems.length > 0 ? (
              <ul>{campaign.inventoryItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.canonicalId} · {item.category}</span>
                </li>
              ))}</ul>
            ) : <p>No Items selected</p>}
          </section>
        </div>
      )}
    </section>
  );
}
