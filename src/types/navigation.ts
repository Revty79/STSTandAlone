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
  | "realms";

export type AppScreen = PublicScreen | AuthenticatedDestination;
