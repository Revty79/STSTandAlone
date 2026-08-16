import {
  DuplicateUsernameError,
  userRepository,
  type UserRepository,
} from "../data/repositories/userRepository";
import {
  USER_ROLE,
  type AuthSession,
  type CreateProfileCredentials,
  type LoginCredentials,
  type StoredUser,
} from "../types/user";
import { createPasswordRecord, verifyPassword } from "./passwordService";

export type AuthenticationResult =
  | { ok: true; session: AuthSession }
  | { ok: false; message: string };

function success(user: StoredUser): AuthenticationResult {
  return {
    ok: true,
    session: {
      isAuthenticated: true,
      userId: user.id,
      username: user.username,
      roles: [...user.roles],
    },
  };
}

function failure(message: string): AuthenticationResult {
  return { ok: false, message };
}

export class AuthService {
  constructor(private readonly repository: UserRepository) {}

  async login(credentials: LoginCredentials): Promise<AuthenticationResult> {
    const username = credentials.username.trim();
    if (!username) {
      return failure("Enter your username.");
    }

    if (!credentials.password) {
      return failure("Enter your password.");
    }

    try {
      const user = await this.repository.findByUsername(username);
      if (!user) {
        return failure("The username or password is incorrect.");
      }

      const passwordMatches = await verifyPassword(credentials.password, {
        passwordHash: user.passwordHash,
        passwordSalt: user.passwordSalt,
        passwordIterations: user.passwordIterations,
      });
      if (!passwordMatches) {
        return failure("The username or password is incorrect.");
      }

      if (user.roles.length === 0) {
        return failure("This local profile has no Serrian Tide access assigned.");
      }

      return success(user);
    } catch {
      return failure(
        "The local archives could not verify this profile. Please try again.",
      );
    }
  }

  async createProfile(
    credentials: CreateProfileCredentials,
  ): Promise<AuthenticationResult> {
    const username = credentials.username.trim();
    if (!username) {
      return failure("Choose a username for this local profile.");
    }

    if (!credentials.password) {
      return failure("Choose a password for this local profile.");
    }

    if (credentials.password !== credentials.confirmPassword) {
      return failure("The password confirmation does not match.");
    }

    try {
      if (await this.repository.findByUsername(username)) {
        return failure("A local profile with that username already exists.");
      }

      const isFirstProfile = (await this.repository.countUsers()) === 0;
      const passwordRecord = await createPasswordRecord(credentials.password);
      const roles = isFirstProfile
        ? [USER_ROLE.GOD, USER_ROLE.PLAYER]
        : [USER_ROLE.PLAYER];
      const user = await this.repository.createUser({
        username,
        ...passwordRecord,
        roles,
      });

      return success(user);
    } catch (error: unknown) {
      if (error instanceof DuplicateUsernameError) {
        return failure(error.message);
      }

      return failure(
        "The local profile could not be created. Please try again.",
      );
    }
  }
}

export const authService = new AuthService(userRepository);
