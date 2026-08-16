export type PublicScreen = "landing" | "login";

export type AuthenticatedDestination =
  | "access-choice"
  | "heavens"
  | "skills"
  | "realms";

export type AppScreen = PublicScreen | AuthenticatedDestination;
