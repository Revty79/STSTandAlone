import type { HeavensDashboardTool } from "../pages/heavensDashboardTools";

type HeavensToolCardProps = {
  tool: HeavensDashboardTool;
  onSelect: (tool: HeavensDashboardTool) => void;
};

export function HeavensToolCard({ tool, onSelect }: HeavensToolCardProps) {
  return (
    <button
      className="heavens-tool-card"
      type="button"
      onClick={() => onSelect(tool)}
    >
      <span className="heavens-tool-card__ornament" aria-hidden="true">
        ◇
      </span>
      <span className="heavens-tool-card__title">{tool.title}</span>
      <span className="heavens-tool-card__description">{tool.description}</span>
    </button>
  );
}
