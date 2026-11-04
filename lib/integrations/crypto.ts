import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/*
 * Encrypts third-party API keys (e.g. Blotato) before they're stored. AES-256-GCM with the
 * 32-byte key in INTEGRATIONS_ENCRYPTION_KEY (base64). Generate one with: openssl rand -base64 32
 */

const VERSION = "v1"

export class EncryptionKeyError extends Error {
  constructor() {
    super("INTEGRATIONS_ENCRYPTION_KEY must be set to 32 random bytes in base64 (openssl rand -base64 32).")
    this.name = "EncryptionKeyError"
  }
}

function key() {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY
  const bytes = raw ? Buffer.from(raw, "base64") : null
  if (!bytes || bytes.length !== 32) throw new EncryptionKeyError()
  return bytes
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

export function decryptSecret(stored: string) {
  const [version, iv, tag, data] = stored.split(":")
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unknown secret format")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}
