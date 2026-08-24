import { useEffect, useState } from "react";
import { initializeDatabase } from "./data/database";
import { AccessChoicePage } from "./pages/AccessChoicePage";
import { HeavensDashboardPage } from "./pages/HeavensDashboardPage";
import { CampaignPrototypePage } from "./pages/CampaignPrototypePage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RealmsDashboardPage } from "./pages/RealmsDashboardPage";
import { CharacterCreationPage } from "./pages/CharacterCreationPage";
import { CharacterAdvancementPage } from "./pages/CharacterAdvancementPage";
import { SpellbookPage } from "./pages/SpellbookPage";
import { MagicCalculatorPage } from "./pages/MagicCalculatorPage";
import { NpcsPage } from "./pages/NpcsPage";
import { CreatureNpcPage } from "./pages/CreatureNpcPage";
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
import type { CharacterGenerationMode } from "./features/characters/randomCharacter";
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
    returnDestination: "heavens" | "realms" | "npcs";
    generationMode?: CharacterGenerationMode;
  } | null>(null);
  const [campaignEditId, setCampaignEditId] = useState<number | null>(null);
  const [creatureNpcContext, setCreatureNpcContext] = useState<{
    campaignId: number;
    npcId: number;
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
    setCampaignEditId(null);
    setCreatureNpcContext(null);
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
    const realmsFallback = (
      <RealmsDashboardPage
        session={session}
        onReturn={
          canAccessDestination(session, "access-choice")
            ? () => navigateAuthenticated("access-choice")
            : undefined
        }
        onLogout={logout}
        onOpenCharacter={(campaignId, characterId) => {
          setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
          navigateAuthenticated("character-create");
        }}
        onOpenRandomCharacter={(campaignId, characterId, generationMode) => {
          setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms", generationMode });
          navigateAuthenticated("character-create");
        }}
        onAdvanceCharacter={(campaignId, characterId) => {
          setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
          navigateAuthenticated("character-advance");
        }}
        onOpenSpellbook={(campaignId, characterId) => {
          setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
          navigateAuthenticated("spellbook");
        }}
        onOpenMagicCalculator={(campaignId, characterId) => {
          setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
          navigateAuthenticated("magic-calculator");
        }}
      />
    );
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
            onCreateCampaign={() => {
              setCampaignEditId(null);
              navigateAuthenticated("campaign-create");
            }}
            onEditCampaign={(campaignId) => {
              setCampaignEditId(campaignId);
              navigateAuthenticated("campaign-create");
            }}
            onOpenRaces={() => navigateAuthenticated("races")}
            onOpenSkills={() => navigateAuthenticated("skills")}
            onOpenCreatures={() => navigateAuthenticated("creatures")}
            onOpenEquipment={() => navigateAuthenticated("equipment")}
            onOpenInventory={() => navigateAuthenticated("inventory")}
            onOpenNpcs={() => navigateAuthenticated("npcs")}
            onOpenCharacter={(campaignId, characterId) => {
              setCharacterContext({
                campaignId,
                characterId,
                editorMode: "god",
                returnDestination: "heavens",
              });
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
            initialCampaignId={campaignEditId}
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
      case "npcs":
        return (
          <NpcsPage
            session={session}
            onOpenNpc={(campaignId, characterId, npcKind) => {
              if (npcKind === "creature") {
                setCreatureNpcContext({ campaignId, npcId: characterId });
                navigateAuthenticated("creature-npc-edit");
              } else {
                setCharacterContext({
                  campaignId,
                  characterId,
                  editorMode: "god",
                  returnDestination: "npcs",
                });
                navigateAuthenticated("character-create");
              }
            }}
            onBack={() => navigateAuthenticated("heavens")}
            onLogout={logout}
          />
        );
      case "creature-npc-edit":
        if (!creatureNpcContext) {
          return null;
        }
        return (
          <CreatureNpcPage
            session={session}
            campaignId={creatureNpcContext.campaignId}
            npcId={creatureNpcContext.npcId}
            onBack={() => {
              setCreatureNpcContext(null);
              navigateAuthenticated("npcs");
            }}
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
              setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
              navigateAuthenticated("character-create");
            }}
            onOpenRandomCharacter={(campaignId, characterId, generationMode) => {
              setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms", generationMode });
              navigateAuthenticated("character-create");
            }}
            onAdvanceCharacter={(campaignId, characterId) => {
              setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
              navigateAuthenticated("character-advance");
            }}
            onOpenSpellbook={(campaignId, characterId) => {
              setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
              navigateAuthenticated("spellbook");
            }}
            onOpenMagicCalculator={(campaignId, characterId) => {
              setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
              navigateAuthenticated("magic-calculator");
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
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("character-create");
              }}
              onOpenRandomCharacter={(campaignId, characterId, generationMode) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms", generationMode });
                navigateAuthenticated("character-create");
              }}
              onAdvanceCharacter={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("character-advance");
              }}
              onOpenSpellbook={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("spellbook");
              }}
              onOpenMagicCalculator={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("magic-calculator");
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
            generationMode={characterContext.generationMode}
            onBack={() => {
              const returnDestination = characterContext.returnDestination;
              setCharacterContext(null);
              navigateAuthenticated(returnDestination);
            }}
            onLogout={logout}
          />
        );
      case "character-advance":
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
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("character-create");
              }}
              onOpenRandomCharacter={(campaignId, characterId, generationMode) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms", generationMode });
                navigateAuthenticated("character-create");
              }}
              onAdvanceCharacter={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("character-advance");
              }}
              onOpenSpellbook={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("spellbook");
              }}
              onOpenMagicCalculator={(campaignId, characterId) => {
                setCharacterContext({ campaignId, characterId, editorMode: "player", returnDestination: "realms" });
                navigateAuthenticated("magic-calculator");
              }}
            />
          );
        }
        return (
          <CharacterAdvancementPage
            session={session}
            campaignId={characterContext.campaignId}
            characterId={characterContext.characterId}
            onBack={() => {
              setCharacterContext(null);
              navigateAuthenticated("realms");
            }}
            onLogout={logout}
          />
        );
      case "spellbook":
        if (!characterContext) {
          return realmsFallback;
        }
        return (
          <SpellbookPage
            session={session}
            campaignId={characterContext.campaignId}
            characterId={characterContext.characterId}
            onOpenCalculator={() => navigateAuthenticated("magic-calculator")}
            onBack={() => {
              setCharacterContext(null);
              navigateAuthenticated("realms");
            }}
            onLogout={logout}
          />
        );
      case "magic-calculator":
        if (!characterContext) {
          return realmsFallback;
        }
        return (
          <MagicCalculatorPage
            session={session}
            campaignId={characterContext.campaignId}
            characterId={characterContext.characterId}
            onOpenSpellbook={() => navigateAuthenticated("spellbook")}
            onBack={() => {
              setCharacterContext(null);
              navigateAuthenticated("realms");
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
