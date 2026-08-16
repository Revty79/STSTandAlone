import "../styles/portal-action-card.css";

export type PortalActionDefinition = {
  id: string;
  title: string;
  description: string;
  featured?: boolean;
};

type PortalActionCardProps = {
  action: PortalActionDefinition;
  variant: "heavens" | "realms";
  onSelect: (action: PortalActionDefinition) => void;
};

export function PortalActionCard({
  action,
  variant,
  onSelect,
}: PortalActionCardProps) {
  const classes = [
    "portal-action-card",
    `portal-action-card--${variant}`,
    action.featured ? "portal-action-card--featured" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} type="button" onClick={() => onSelect(action)}>
      <span className="portal-action-card__ornament" aria-hidden="true">
        ◇
      </span>
      <span className="portal-action-card__title">{action.title}</span>
      <span className="portal-action-card__description">
        {action.description}
      </span>
    </button>
  );
}
