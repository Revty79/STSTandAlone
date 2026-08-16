export const USER_ROLE = {
  GOD: "god",
  PLAYER: "player",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export function isUserRole(value: string): value is UserRole {
  return Object.values(USER_ROLE).includes(value as UserRole);
}

export type StoredUser = {
  id: number;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  isAuthenticated: true;
  userId: number;
  username: string;
  roles: UserRole[];
};

export type LoginCredentials = {
  username: string;
  password: string;
};

export type CreateProfileCredentials = LoginCredentials & {
  confirmPassword: string;
};
