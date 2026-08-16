import { getDatabase } from "../database";
import { isUserRole, type StoredUser, type UserRole } from "../../types/user";

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  created_at: string;
  updated_at: string;
};

type RoleRow = {
  role: string;
};

type CountRow = {
  count: number | string;
};

export type CreateStoredUser = {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  roles: UserRole[];
};

export interface UserRepository {
  countUsers(): Promise<number>;
  findByUsername(username: string): Promise<StoredUser | null>;
  createUser(user: CreateStoredUser): Promise<StoredUser>;
}

export class DuplicateUsernameError extends Error {
  constructor() {
    super("A local profile with that username already exists.");
    this.name = "DuplicateUsernameError";
  }
}

class TauriUserRepository implements UserRepository {
  async countUsers(): Promise<number> {
    const database = await getDatabase();
    const rows = await database.select<CountRow[]>(
      "SELECT COUNT(*) AS count FROM users",
    );

    return Number(rows[0]?.count ?? 0);
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    const database = await getDatabase();
    const rows = await database.select<UserRow[]>(
      `SELECT
         id,
         username,
         password_hash,
         password_salt,
         password_iterations,
         created_at,
         updated_at
       FROM users
       WHERE username = $1
       LIMIT 1`,
      [username],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const roleRows = await database.select<RoleRow[]>(
      "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role",
      [row.id],
    );
    const roles = roleRows.map(({ role }) => {
      if (!isUserRole(role)) {
        throw new Error("The local profile contains an unsupported role.");
      }

      return role;
    });

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      passwordIterations: row.password_iterations,
      roles,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createUser(user: CreateStoredUser): Promise<StoredUser> {
    const database = await getDatabase();
    let userId: number;

    try {
      const result = await database.execute(
        `INSERT INTO users (
           username,
           password_hash,
           password_salt,
           password_iterations
         ) VALUES ($1, $2, $3, $4)`,
        [
          user.username,
          user.passwordHash,
          user.passwordSalt,
          user.passwordIterations,
        ],
      );

      if (result.lastInsertId === undefined) {
        throw new Error("SQLite did not return the new profile identifier.");
      }

      userId = result.lastInsertId;
    } catch (error: unknown) {
      if (
        String(error).includes("UNIQUE constraint failed") ||
        String(error).includes("users.username")
      ) {
        throw new DuplicateUsernameError();
      }

      throw error;
    }

    try {
      for (const role of user.roles) {
        await database.execute(
          "INSERT INTO user_roles (user_id, role) VALUES ($1, $2)",
          [userId, role],
        );
      }
    } catch (error: unknown) {
      await database
        .execute("DELETE FROM user_roles WHERE user_id = $1", [userId])
        .catch(() => undefined);
      await database
        .execute("DELETE FROM users WHERE id = $1", [userId])
        .catch(() => undefined);
      throw error;
    }

    const createdUser = await this.findByUsername(user.username);
    if (!createdUser) {
      throw new Error("The local profile could not be read after creation.");
    }

    return createdUser;
  }
}

export const userRepository: UserRepository = new TauriUserRepository();
