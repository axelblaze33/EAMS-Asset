import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Authenticated encryption for stored device passwords (AES-256-GCM).
// Format: "v1.<iv>.<auth tag>.<ciphertext>", all base64url. The key comes from
// CREDENTIALS_ENCRYPTION_KEY (32 random bytes, base64). Losing the key makes
// stored passwords unrecoverable; changing it requires re-encrypting them.

const VERSION = "v1";

function key() {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  return k;
}

export function isSecretBoxConfigured() {
  try {
    return key() !== null;
  } catch {
    return false;
  }
}

export function seal(plaintext: string) {
  const k = key();
  if (!k) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string) {
  const k = key();
  if (!k) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set.");
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Unrecognised secret format.");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  // Throws if the ciphertext or tag was altered, or the key is wrong.
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
