# Serrian Tide Standalone

A Windows-first desktop application built with Tauri 2, React, TypeScript, and Vite.

Version 0.2 adds local SQLite profiles, password-derived authentication, and role-authorized Heavens/Realms routing. The landing page remains the established application entrance.

## Development

Install dependencies:

```powershell
npm install
```

Launch the desktop application in development mode:

```powershell
npm run tauri dev
```

## Validation

Run the frontend authentication and authorization tests:

```powershell
npm test
```

Run the production frontend build:

```powershell
npm run build
```

Run the Rust migration test:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

## Local data

The application creates `serrian-tide.db` in the operating system application-data directory. Runtime SQLite files are excluded from source control. Account schema changes live in `src-tauri/migrations` and are applied by the official Tauri SQL plugin.
