import Database from "@tauri-apps/plugin-sql";

export const DATABASE_URL = "sqlite:serrian-tide.db";

let databasePromise: Promise<Database> | null = null;

export function initializeDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(DATABASE_URL)
      .then(async (database) => {
        await database.execute("PRAGMA foreign_keys = ON");
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
  }

  return databasePromise;
}

export function getDatabase(): Promise<Database> {
  return initializeDatabase();
}
