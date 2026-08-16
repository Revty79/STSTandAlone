import { useState, type FormEvent } from "react";
import { AtmosphericPage } from "../components/AtmosphericPage";
import type { AuthenticationResult } from "../services/authService";
import type {
  AuthSession,
  CreateProfileCredentials,
  LoginCredentials,
} from "../types/user";
import "../styles/login-page.css";

type LoginMode = "login" | "create";
type DatabaseState = "initializing" | "ready" | "error";

type LoginPageProps = {
  databaseState: DatabaseState;
  onBack: () => void;
  onLogin: (credentials: LoginCredentials) => Promise<AuthenticationResult>;
  onCreateProfile: (
    credentials: CreateProfileCredentials,
  ) => Promise<AuthenticationResult>;
  onAuthenticated: (session: AuthSession) => void;
};

export function LoginPage({
  databaseState,
  onBack,
  onLogin,
  onCreateProfile,
  onAuthenticated,
}: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDatabaseReady = databaseState === "ready";

  function changeMode(nextMode: LoginMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setFeedback("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDatabaseReady || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFeedback("");

    const result =
      mode === "login"
        ? await onLogin({ username, password })
        : await onCreateProfile({ username, password, confirmPassword });

    setIsSubmitting(false);
    if (result.ok) {
      onAuthenticated(result.session);
      return;
    }

    setFeedback(result.message);
  }

  const databaseFeedback =
    databaseState === "initializing"
      ? "Preparing the local archives…"
      : databaseState === "error"
        ? "The local archives could not be opened. Close and restart Serrian Tide to try again."
        : "";

  return (
    <AtmosphericPage className="login-page">
      <button className="login-page__back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Return
      </button>

      <section className="login-page__panel" aria-labelledby="login-heading">
        <header className="login-page__header">
          <p className="login-page__eyebrow">LOCAL PASSAGE</p>
          <h2 id="login-heading">
            {mode === "login" ? "Enter Serrian Tide" : "Create Local Profile"}
          </h2>
          <p>
            {mode === "login"
              ? "Open the path held by this installation."
              : "Establish a profile kept only on this device."}
          </p>
        </header>

        <form className="login-page__form" onSubmit={handleSubmit} noValidate>
          <label className="login-page__field">
            <span>Username</span>
            <input
              autoComplete="username"
              disabled={!isDatabaseReady || isSubmitting}
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          </label>

          <label className="login-page__field">
            <span>Password</span>
            <input
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              disabled={!isDatabaseReady || isSubmitting}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>

          {mode === "create" && (
            <label className="login-page__field">
              <span>Confirm Password</span>
              <input
                autoComplete="new-password"
                disabled={!isDatabaseReady || isSubmitting}
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.currentTarget.value)
                }
              />
            </label>
          )}

          <p
            className={`login-page__feedback${
              feedback || databaseFeedback ? " is-visible" : ""
            }`}
            role={databaseState === "error" || feedback ? "alert" : "status"}
            aria-live="polite"
          >
            {feedback || databaseFeedback || " "}
          </p>

          <button
            className="login-page__primary-action"
            disabled={!isDatabaseReady || isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "Opening…"
              : mode === "login"
                ? "Login"
                : "Create Local Profile"}
          </button>
        </form>

        <button
          className="login-page__mode-action"
          disabled={isSubmitting}
          type="button"
          onClick={() => changeMode(mode === "login" ? "create" : "login")}
        >
          {mode === "login" ? "Create Local Profile" : "Return to Login"}
        </button>
      </section>
    </AtmosphericPage>
  );
}
