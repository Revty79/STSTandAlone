import { beforeEach, describe, expect, it } from "vitest";
import type {
  CreateStoredUser,
  UserRepository,
} from "../data/repositories/userRepository";
import type { StoredUser } from "../types/user";
import { USER_ROLE } from "../types/user";
import { getPostLoginDestination } from "./authorization";
import { AuthService } from "./authService";

class MemoryUserRepository implements UserRepository {
  users: StoredUser[] = [];
  private nextId = 1;

  async countUsers(): Promise<number> {
    return this.users.length;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    return (
      this.users.find(
        (user) => user.username.toLocaleLowerCase() === username.toLocaleLowerCase(),
      ) ?? null
    );
  }

  async createUser(user: CreateStoredUser): Promise<StoredUser> {
    const timestamp = new Date().toISOString();
    const storedUser: StoredUser = {
      id: this.nextId,
      username: user.username,
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
      passwordIterations: user.passwordIterations,
      roles: [...user.roles],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.nextId += 1;
    this.users.push(storedUser);
    return storedUser;
  }
}

describe("AuthService", () => {
  let repository: MemoryUserRepository;
  let service: AuthService;

  beforeEach(() => {
    repository = new MemoryUserRepository();
    service = new AuthService(repository);
  });

  it("creates the first profile with both roles and never stores its password", async () => {
    const result = await service.createProfile({
      username: "Brannan",
      password: "a local secret",
      confirmPassword: "a local secret",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.session.roles).toEqual([USER_ROLE.GOD, USER_ROLE.PLAYER]);
    expect(getPostLoginDestination(result.session)).toBe("access-choice");
    expect(repository.users[0].passwordHash).not.toBe("a local secret");
    expect(repository.users[0].passwordSalt).not.toBe("");
    expect(repository.users[0].passwordIterations).toBeGreaterThan(0);
  });

  it("creates later profiles as Player-only and routes them directly to Realms", async () => {
    await service.createProfile({
      username: "Owner",
      password: "owner secret",
      confirmPassword: "owner secret",
    });
    const result = await service.createProfile({
      username: "Player",
      password: "player secret",
      confirmPassword: "player secret",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.session.roles).toEqual([USER_ROLE.PLAYER]);
    expect(getPostLoginDestination(result.session)).toBe("realms");
    expect(repository.users[0].passwordSalt).not.toBe(
      repository.users[1].passwordSalt,
    );
  });

  it("accepts the correct password and rejects an incorrect password", async () => {
    await service.createProfile({
      username: "Voyager",
      password: "correct passage",
      confirmPassword: "correct passage",
    });

    const accepted = await service.login({
      username: "voyager",
      password: "correct passage",
    });
    const rejected = await service.login({
      username: "Voyager",
      password: "incorrect passage",
    });

    expect(accepted.ok).toBe(true);
    expect(rejected).toEqual({
      ok: false,
      message: "The username or password is incorrect.",
    });
  });

  it("validates confirmation and case-insensitive duplicate usernames", async () => {
    const mismatch = await service.createProfile({
      username: "Voyager",
      password: "one passage",
      confirmPassword: "another passage",
    });
    expect(mismatch).toEqual({
      ok: false,
      message: "The password confirmation does not match.",
    });

    await service.createProfile({
      username: "Voyager",
      password: "one passage",
      confirmPassword: "one passage",
    });
    const duplicate = await service.createProfile({
      username: "VOYAGER",
      password: "another passage",
      confirmPassword: "another passage",
    });

    expect(duplicate).toEqual({
      ok: false,
      message: "A local profile with that username already exists.",
    });
  });
});
