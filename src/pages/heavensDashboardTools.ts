export type HeavensDashboardTool = {
  id: string;
  title: string;
  description: string;
};

export const HEAVENS_DASHBOARD_TOOLS: readonly HeavensDashboardTool[] = [
  {
    id: "races",
    title: "Races",
    description: "Create and manage playable races.",
  },
  {
    id: "skills",
    title: "Skills",
    description: "Build and manage Serrian Tide skill trees.",
  },
  {
    id: "magic-spells",
    title: "Magic & Spells",
    description: "Manage magical systems and spell construction.",
  },
  {
    id: "equipment",
    title: "Equipment",
    description: "Create weapons, armor, and equipment.",
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Manage collections, shops, and available items.",
  },
  {
    id: "special-abilities",
    title: "Special Abilities",
    description: "Create abilities outside normal skill trees.",
  },
  {
    id: "genres-worlds",
    title: "Genres / Worlds",
    description: "Manage genres, settings, and world modules.",
  },
  {
    id: "creatures-npcs",
    title: "Creatures & NPCs",
    description: "Create and manage creatures and NPC templates.",
  },
  {
    id: "game-rules",
    title: "Game Rules",
    description: "Manage foundational game data and rules.",
  },
];
