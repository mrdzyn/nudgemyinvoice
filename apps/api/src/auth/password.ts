import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** scrypt N=2^17, r=8, p=1 (~128 MiB): the OWASP-recommended minimum-cost configuration. */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// Upper bounds protect verification from absurd parameters in a tampered database row.
const MAX_N = 2 ** 20;
const MAX_R = 16;
const MAX_P = 4;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns `scrypt$N$r$p$<salt b64url>$<hash b64url>` with an independent random salt per call. */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Constant-time comparison. Malformed or out-of-bounds stored values simply fail verification. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const validN = Number.isInteger(N) && N >= 2 && N <= MAX_N && (N & (N - 1)) === 0;
  if (
    !validN ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > MAX_R ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > MAX_P
  ) {
    return false;
  }
  try {
    const salt = Buffer.from(parts[4] as string, "base64url");
    const expected = Buffer.from(parts[5] as string, "base64url");
    if (salt.length < 8 || expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, salt, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummy: { key: string; hash: Promise<string> } | undefined;
/** A throwaway hash with the same cost, verified for unknown usernames so timing does not reveal them. */
export function dummyHash(params: ScryptParams): Promise<string> {
  const key = `${params.N}:${params.r}:${params.p}`;
  if (!dummy || dummy.key !== key)
    dummy = { key, hash: hashPassword(randomBytes(16).toString("hex"), params) };
  return dummy.hash;
}
