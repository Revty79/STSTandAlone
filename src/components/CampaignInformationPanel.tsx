type CampaignInformationPanelProps = {
  onClose: () => void;
};

export function CampaignInformationPanel({
  onClose,
}: CampaignInformationPanelProps) {
  return (
    <section
      className="campaign-information"
      id="campaign-information"
      aria-labelledby="campaign-information-heading"
    >
      <header className="campaign-information__header">
        <div>
          <p>CAMPAIGN INFORMATION</p>
          <h4 id="campaign-information-heading">No Campaign Selected</h4>
        </div>
        <button
          className="campaign-information__close"
          type="button"
          onClick={onClose}
          aria-label="Close campaign information"
        >
          Close
        </button>
      </header>
      <p className="campaign-information__message">
        Select a campaign to view its information.
      </p>
    </section>
  );
}
