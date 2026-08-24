export type PublicScreen = "landing" | "login";

export type AuthenticatedDestination =
  | "access-choice"
  | "heavens"
  | "campaign-create"
  | "skills"
  | "races"
  | "creatures"
  | "equipment"
  | "inventory"
  | "npcs"
  | "creature-npc-edit"
  | "realms"
  | "character-create"
  | "character-advance";

export type AppScreen = PublicScreen | AuthenticatedDestination;
