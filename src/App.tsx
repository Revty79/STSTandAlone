import { useEffect, useState } from "react";
import { initializeDatabase } from "./data/database";
import { AccessChoicePage } from "./pages/AccessChoicePage";
import { HeavensDashboardPage } from "./pages/HeavensDashboardPage";
import { CampaignPrototypePage } from "./pages/CampaignPrototypePage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RealmsDashboardPage } from "./pages/RealmsDashboardPage";
import { CharacterCreationPage } from "./pages/CharacterCreationPage";
import { RacesPage } from "./pages/RacesPage";
import { CreaturesPage } from "./pages/CreaturesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { EquipmentPage, InventoryPage } from "./pages/ItemsPage";
import { authService } from "./services/authService";
import {
  authorizeDestination,
  canAccessDestination,
  getPostLoginDestination,
} from "./services/authorization";
import type {
  AppScreen,
  AuthenticatedDestination,
} from "./types/navigation";
import type { AuthSession } from "./types/user";
import type { CharacterEditorMode } from "./types/character";
import "./styles/app-shell.css";

type DatabaseState = "initializing" | "ready" | "error";

function App() {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [databaseState, setDatabaseState] =
    useState<DatabaseState>("initializing");
  const [characterContext, setCharacterContext] = useState<{
    campaignId: number;
    characterId: number;
    editorMode: CharacterEditorMode;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;

    initializeDatabase()
      .then(() => {
        if (isCurrent) {
          setDatabaseState("ready");
        }
      })
      .catch(() => {
        if (isCurrent) {
          setDatabaseState("error");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function completeAuthentication(authenticatedSession: AuthSession) {
    setSession(authenticatedSession);
    setScreen(getPostLoginDestination(authenticatedSession));
  }

  function navigateAuthenticated(destination: AuthenticatedDestination) {
    if (!session) {
      setScreen("login");
      return;
    }

    setScreen(authorizeDestination(session, destination));
  }

  function logout() {
    setCharacterContext(null);
    setSession(null);
    setScreen("login");
  }

  function renderScreen() {
    if (screen === "landing") {
      return <LandingPage onEnter={() => setScreen("login")} />;
    }

    if (screen === "login" || !session) {
      return (
        <LoginPage
          databaseState={databaseState}
          onBack={() => setScreen("landing")}
          onLogin={(credentials) => authService.login(credentials)}
          onCreateProfile={(credentials) =>
            authService.createProfile(credentials)
          }
          onAuthenticated={completeAuthentication}
        />
      );
    }

    const destination = authorizeDestination(session, screen);
    switch (destination) {
      case "access-choice":
        return (
          <AccessChoicePage
            session={session}
            onEnterHeavens={() => navigateAuthenticated("heavens")}
            onEnterRealms={() => navigateAuthenticated("realms")}
            onLogout={logout}
          />
        );
      case "heavens":
        return (
          <HeavensDashboardPage
            session={session}
            onCreateCampaign={() => navigateAuthenticated("campaign-create")}
            onOpenRaces={() => navigateAuthenticated("races")}
            onOpenSkills={() => navigateAuthenticated("skills")}
            onOpenCreatures={() => navigateAuthenticated("creatures")}
            onOpenEquipment={() => navigateAuthenticated("equipment")}
            onOpenInventory={() => navigateAuthenticated("inventory")}
            onOpenCharacter={(campaignId, characterId) => {
              setCharacterContext({ campaignId, characterId, editorMode: "god" });
              navigateAuthenticated("character-create");
            }}
            onReturn={() => navigateAuthenticated("access-choice")}
            onLogout={logout}
          />
        );
      case "campaign-create":
        return (
          <CampaignPrototypePage
            session={session}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "skills":
        return (
          <SkillsPage
            session={session}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "races":
        return (
          <RacesPage
            session={session}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "creatures":
        return (
          <CreaturesPage
            session={session}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "equipment":
        return (
          <EquipmentPage
            session={session}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "inventory":
        return (
          <InventoryPage
            session={session}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "realms":
        return (
          <RealmsDashboardPage
            session={session}
            onReturn={
              canAccessDestination(session, "access-choice")
                ? () => navigateAuthenticated("access-choice")
                : undefined
            }
            onLogout={logout}
            onOpenCharacter={(campaignId, characterId) => {
              setCharacterContext({ campaignId, characterId, editorMode: "player" });
              navigateAuthenticated("character-create");
            }}
          />
        );
      case "character-create":
        if (!characterContext) {
          return (
            <RealmsDashboardPage
              session={session}
              onReturn={
                canAccessDestination(session, "access-choice")
                  ? () => navigateAuthenticated("access-choice")
                  : undefined
              }
              onLogout={logout}
              onOpenCharacter={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player" });
                navigateAuthenticated("character-create");
              }}
            />
          );
        }
        return (
          <CharacterCreationPage
            session={session}
            campaignId={characterContext.campaignId}
            characterId={characterContext.characterId}
            editorMode={characterContext.editorMode}
            onBack={() => {
              const returnDestination = characterContext.editorMode === "god"
                ? "heavens"
                : "realms";
              setCharacterContext(null);
              navigateAuthenticated(returnDestination);
            }}
            onLogout={logout}
          />
        );
    }
  }

  return (
    <div className="app-shell" key={screen}>
      {renderScreen()}
    </div>
  );
}

export default App;
