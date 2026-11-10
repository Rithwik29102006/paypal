import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import type { Rules } from "@mandate/shared";
import {
  signMandate,
  verifyMandate,
  getPublicKeyPem,
} from "../src/crypto/signing.js";

const sampleRules: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

describe("Ed25519 signing", () => {
  it("signs and verifies a valid mandate", () => {
    const mandateId = "mdt_test_valid";
    const createdAt = "2026-06-01T12:00:00.000Z";
    const signature = signMandate(sampleRules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    const isValid = verifyMandate({
      rules: sampleRules,
      id: mandateId,
      createdAt,
      signature,
      publicKey,
    });

    expect(isValid).toBe(true);
  });

  it("fails if any rule field is modified", () => {
    const mandateId = "mdt_test_tamper_rule";
    const createdAt = "2026-06-01T12:00:00.000Z";
    const signature = signMandate(sampleRules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    // Tamper monthlyCap
    const tamperedRules: Rules = { ...sampleRules, monthlyCap: 301 };

    expect(
      verifyMandate({
        rules: tamperedRules,
        id: mandateId,
        createdAt,
        signature,
        publicKey,
      })
    ).toBe(false);

    // Tamper allowedMerchants
    const tamperedMerchants: Rules = {
      ...sampleRules,
      allowedMerchants: ["dem0-store"],
    };

    expect(
      verifyMandate({
        rules: tamperedMerchants,
        id: mandateId,
        createdAt,
        signature,
        publicKey,
      })
    ).toBe(false);
  });

  it("fails if mandate ID is modified", () => {
    const mandateId = "mdt_test_id";
    const createdAt = "2026-06-01T12:00:00.000Z";
    const signature = signMandate(sampleRules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    expect(
      verifyMandate({
        rules: sampleRules,
        id: "mdt_tampered_id",
        createdAt,
        signature,
        publicKey,
      })
    ).toBe(false);
  });

  it("fails if createdAt date is modified", () => {
    const mandateId = "mdt_test_date";
    const createdAt = "2026-06-01T12:00:00.000Z";
    const signature = signMandate(sampleRules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    expect(
      verifyMandate({
        rules: sampleRules,
        id: mandateId,
        createdAt: "2026-06-01T12:00:01.000Z",
        signature,
        publicKey,
      })
    ).toBe(false);
  });

  it("fails if verified with a different public key", () => {
    const mandateId = "mdt_test_wrong_key";
    const createdAt = "2026-06-01T12:00:00.000Z";
    const signature = signMandate(sampleRules, mandateId, createdAt);

    // Generate an entirely different keypair
    const { publicKey: wrongKey } = crypto.generateKeyPairSync("ed25519");
    const wrongKeyPem = wrongKey.export({ type: "spki", format: "pem" }) as string;

    expect(
      verifyMandate({
        rules: sampleRules,
        id: mandateId,
        createdAt,
        signature,
        publicKey: wrongKeyPem,
      })
    ).toBe(false);
  });
});
