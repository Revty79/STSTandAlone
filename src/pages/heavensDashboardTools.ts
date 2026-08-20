import type { PortalActionDefinition } from "../components/PortalActionCard";

export const HEAVENS_CORE_TOOLS: readonly PortalActionDefinition[] = [
  {
    id: "races",
    title: "Races",
    description: "Create and manage playable races.",
  },
  {
    id: "skills",
    title: "Skills",
    description:
      "Manage every Serrian Tide skill, including magical and specialized abilities.",
  },
  {
    id: "equipment",
    title: "Equipment",
    description: "Create weapons, armor, and equipment.",
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Shape the inventory content available within Serrian Tide.",
  },
  {
    id: "creatures-npcs",
    title: "Creatures & NPCs",
    description: "Create and manage creatures and non-player characters.",
  },
];

export const HEAVENS_FUTURE_TOOLS: readonly PortalActionDefinition[] = [
  {
    id: "genres-worlds",
    title: "Genres / Worlds",
    description: "Reserved for future world and setting expansion.",
  },
  {
    id: "game-rules",
    title: "Game Rules",
    description: "Reserved for future foundational rules work.",
  },
];

export const HEAVENS_DASHBOARD_TOOLS: readonly PortalActionDefinition[] = [
  ...HEAVENS_CORE_TOOLS,
  ...HEAVENS_FUTURE_TOOLS,
];

export function getHeavensToolDestination(
  toolId: string,
): "races" | "skills" | null {
  if (toolId === "races" || toolId === "skills") return toolId;
  return null;
}
