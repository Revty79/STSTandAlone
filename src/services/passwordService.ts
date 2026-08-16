const PASSWORD_DERIVATION = {
  algorithm: "PBKDF2",
  hash: "SHA-256",
  iterations: 310_000,
  saltBytes: 16,
  derivedKeyBytes: 32,
} as const;

export type PasswordRecord = {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    PASSWORD_DERIVATION.algorithm,
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: PASSWORD_DERIVATION.algorithm,
      hash: PASSWORD_DERIVATION.hash,
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations,
    },
    keyMaterial,
    PASSWORD_DERIVATION.derivedKeyBytes * 8,
  );

  return new Uint8Array(derivedBits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

export async function createPasswordRecord(
  password: string,
): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(
    new Uint8Array(PASSWORD_DERIVATION.saltBytes),
  );
  const derivedPassword = await derivePassword(
    password,
    salt,
    PASSWORD_DERIVATION.iterations,
  );

  return {
    passwordHash: bytesToBase64(derivedPassword),
    passwordSalt: bytesToBase64(salt),
    passwordIterations: PASSWORD_DERIVATION.iterations,
  };
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const storedHash = base64ToBytes(record.passwordHash);
  const candidateHash = await derivePassword(
    password,
    base64ToBytes(record.passwordSalt),
    record.passwordIterations,
  );

  return constantTimeEqual(candidateHash, storedHash);
}
