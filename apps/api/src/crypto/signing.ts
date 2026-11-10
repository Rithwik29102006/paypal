import crypto, { type KeyObject } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Rules } from "@mandate/shared";
import { config } from "../config.js";
import { canonicalJson } from "./canonical.js";

const KEYS_DIR = path.resolve(import.meta.dirname, "../../.keys");
const KEY_FILE = path.join(KEYS_DIR, "ed25519.pem");

let cachedKeyPair: { privateKey: KeyObject; publicKey: KeyObject } | null = null;

export function getSigningKeyPair(): {
  privateKey: KeyObject;
  publicKey: KeyObject;
} {
  if (cachedKeyPair) return cachedKeyPair;

  if (config.SIGNING_KEY && config.SIGNING_KEY.trim().length > 0) {
    let raw = config.SIGNING_KEY.trim();
    if (!raw.includes("-----BEGIN")) {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) {
        raw = decoded;
      }
    }
    const privateKey = crypto.createPrivateKey(raw);
    const publicKey = crypto.createPublicKey(privateKey);
    cachedKeyPair = { privateKey, publicKey };
    return cachedKeyPair;
  }

  // Read existing persisted key
  if (fs.existsSync(KEY_FILE)) {
    const pem = fs.readFileSync(KEY_FILE, "utf8");
    const privateKey = crypto.createPrivateKey(pem);
    const publicKey = crypto.createPublicKey(privateKey);
    cachedKeyPair = { privateKey, publicKey };
    return cachedKeyPair;
  }

  // Generate once and persist
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  fs.writeFileSync(KEY_FILE, pem, "utf8");

  cachedKeyPair = { privateKey, publicKey };
  return cachedKeyPair;
}

export function getPublicKeyPem(): string {
  const { publicKey } = getSigningKeyPair();
  return publicKey.export({ type: "spki", format: "pem" }) as string;
}

/**
 * Signs the canonical representation of { rules, mandateId, createdAt, vaultId? }
 * with the active Ed25519 private key.
 */
export function signMandate(
  rules: Rules,
  mandateId: string,
  createdAt: string,
  vaultId?: string | null
): string {
  const { privateKey } = getSigningKeyPair();
  const payload: Record<string, unknown> = {
    rules,
    mandateId,
    createdAt,
  };
  if (vaultId) {
    payload.vaultId = vaultId;
  }
  const canonical = canonicalJson(payload);
  const sigBuffer = crypto.sign(
    null,
    Buffer.from(canonical, "utf8"),
    privateKey
  );
  return sigBuffer.toString("base64");
}

/**
 * Recomputes canonical payload and verifies signature using the provided public key.
 */
export function verifyMandate(mandate: {
  rules: Rules;
  id: string;
  createdAt: string;
  signature: string;
  publicKey: string;
  vaultId?: string | null;
}): boolean {
  try {
    const payload: Record<string, unknown> = {
      rules: mandate.rules,
      mandateId: mandate.id,
      createdAt: mandate.createdAt,
    };
    if (mandate.vaultId) {
      payload.vaultId = mandate.vaultId;
    }
    const canonical = canonicalJson(payload);
    const keyObject = crypto.createPublicKey(mandate.publicKey);
    return crypto.verify(
      null,
      Buffer.from(canonical, "utf8"),
      keyObject,
      Buffer.from(mandate.signature, "base64")
    );
  } catch {
    return false;
  }
}
