import { useEffect, useState } from "react";
import { initializeDatabase } from "./data/database";
import { AccessChoicePage } from "./pages/AccessChoicePage";
import { HeavensDashboardPage } from "./pages/HeavensDashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RealmsDashboardPage } from "./pages/RealmsDashboardPage";
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
import "./styles/app-shell.css";

type DatabaseState = "initializing" | "ready" | "error";

function App() {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [databaseState, setDatabaseState] =
    useState<DatabaseState>("initializing");

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
            onOpenRaces={() => navigateAuthenticated("races")}
            onOpenSkills={() => navigateAuthenticated("skills")}
            onOpenCreatures={() => navigateAuthenticated("creatures")}
            onOpenEquipment={() => navigateAuthenticated("equipment")}
            onOpenInventory={() => navigateAuthenticated("inventory")}
            onReturn={() => navigateAuthenticated("access-choice")}
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
