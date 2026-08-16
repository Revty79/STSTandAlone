import React from "react";
import ReactDOM from "react-dom/client";
import { HeavensDashboardPage } from "./pages/HeavensDashboardPage";
import { USER_ROLE, type AuthSession } from "./types/user";
import "./styles/global.css";

const previewSession: AuthSession = {
  isAuthenticated: true,
  userId: 0,
  username: "Responsive Preview",
  roles: [USER_ROLE.GOD, USER_ROLE.PLAYER],
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HeavensDashboardPage
      session={previewSession}
      onReturn={() => undefined}
      onLogout={() => undefined}
    />
  </React.StrictMode>,
);
