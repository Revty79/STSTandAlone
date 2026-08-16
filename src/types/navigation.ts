export type PublicScreen = "landing" | "login";

export type AuthenticatedDestination =
  | "access-choice"
  | "heavens"
  | "realms";

export type AppScreen = PublicScreen | AuthenticatedDestination;
