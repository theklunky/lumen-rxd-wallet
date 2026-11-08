/**
 * Password-based vault encryption for the BIP-39 mnemonic.
 *
 * KDF:  PBKDF2-SHA-256, 310,000 iterations (OWASP 2023 recommendation).
 * Cipher: AES-256-GCM (authenticated — a wrong password fails decryption).
 *
 * The mnemonic never touches disk in plaintext. Only the VaultBlob is stored.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** Shape persisted in the local store. */
export interface VaultBlob {
  v: 1;
  /** PBKDF2 salt, hex (16 bytes). */
  salt: string;
  /** PBKDF2 iteration count. */
  iterations: number;
  /** AES-GCM nonce, hex (12 bytes). */
  iv: string;
  /** AES-GCM ciphertext of the JSON wallet payload, hex. */
  ciphertext: string;
}

/** Plaintext payload protected by the vault (JSON string inside the cipher). */
export interface VaultPayload {
  mnemonic: string;
  /** SLIP-0044 coin type: 512 (Radiant, default) or 0 (legacy wallets). */
  coinType: number;
}

export const KDF_ITERATIONS = 310_000;
export const MIN_PASSWORD_LENGTH = 10;

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPayload(
  payload: VaultPayload,
  password: string,
): Promise<VaultBlob> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const plaintext = enc.encode(JSON.stringify(payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return {
    v: 1,
    salt: bytesToHex(salt),
    iterations: KDF_ITERATIONS,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ct),
  };
}

export async function decryptPayload(
  blob: VaultBlob,
  password: string,
): Promise<VaultPayload> {
  const key = await deriveKey(password, hexToBytes(blob.salt));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBytes(blob.iv) },
      key,
      hexToBytes(blob.ciphertext),
    );
  } catch {
    throw new Error("Incorrect password");
  }
  const parsed = JSON.parse(dec.decode(plaintext)) as VaultPayload;
  if (typeof parsed.mnemonic !== "string" || !parsed.mnemonic.trim()) {
    throw new Error("Vault payload is corrupt");
  }
  return parsed;
}
