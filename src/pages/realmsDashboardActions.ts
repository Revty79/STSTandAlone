import type { PortalActionDefinition } from "../components/PortalActionCard";

export const REALMS_DASHBOARD_ACTIONS: readonly PortalActionDefinition[] = [
  {
    id: "character-sheet",
    title: "Character Sheet",
    description: "View the heart of your adventurer and their story.",
    featured: true,
  },
  {
    id: "advance-character",
    title: "Advance Character",
    description: "Prepare for the next chapter of your journey.",
  },
  {
    id: "skills",
    title: "Skills",
    description: "Review the talents your character brings to the realms.",
  },
  {
    id: "inventory-equipment",
    title: "Inventory & Equipment",
    description: "Keep track of the tools, treasures, and gear you carry.",
  },
  {
    id: "magic-spells",
    title: "Magic & Spells",
    description: "Explore the magic known to your character.",
  },
] as const;
