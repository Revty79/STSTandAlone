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

## Creature canon transfer

The authoritative Creature workbook is captured in `data/serrian-tide-creature-sheet.json`. Reviewed local additions that are not yet workbook rows live in `data/serrian-tide-creature-supplements.json`. The application never reads Google Sheets at runtime.

- `npm run generate:creature-seed` deterministically regenerates the normalized seed, import report, and additive Creature supplement migration from the checked-in sources.
- `npm run refresh:creature-seed` deliberately refreshes the snapshot from the canonical Google Sheet and then regenerates the seed and report.

After a refresh, review `data/serrian-tide-creature-import-report.json` and the generated diff before committing. The importer fails on changed headers, duplicate canonical IDs, orphaned Creature/Variant/HP Pool relationships, noncanonical Sizes, invalid CR values, or Creature Skill names that do not resolve to an existing canonical Serrian Tide Skill. It preserves blank cells as `null` and explicit zero as `0`.

Migration `0008` is the immutable initial catalog migration and is only regenerated with `node scripts/generate-creature-seed.mjs --create-initial-migration`. Once `0008` has been applied anywhere, do not rewrite it. Migration `0010` adds the approved Cat and Falcon supplement after the final Creature schema migration, so existing and fresh databases receive identical records without replacing user-authored Creatures.
