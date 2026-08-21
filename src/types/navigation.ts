export type PublicScreen = "landing" | "login";

export type AuthenticatedDestination =
  | "access-choice"
  | "heavens"
  | "skills"
  | "races"
  | "equipment"
  | "inventory"
  | "creatures"
  | "realms";

export type AppScreen = PublicScreen | AuthenticatedDestination;
