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
    id: "creatures",
    title: "Creatures",
    description: "Create and manage creatures within Serrian Tide.",
  },
  {
    id: "npcs",
    title: "NPCs",
    description: "Create and manage non-player characters.",
  },
];

export function getHeavensToolDestination(
  toolId: string,
): "races" | "skills" | "creatures" | "equipment" | "inventory" | "npcs" | null {
  if (
    toolId === "races" ||
    toolId === "skills" ||
    toolId === "creatures" ||
    toolId === "equipment" ||
    toolId === "inventory" ||
    toolId === "npcs"
  ) return toolId;
  return null;
}
