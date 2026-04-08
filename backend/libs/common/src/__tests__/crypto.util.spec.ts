import {
  generateIdempotencyKey,
  verifyHmacSignature,
  computeHmacSignature,
} from "@app/common";
import { LeaveType } from "@app/common";

describe("crypto.util", () => {
  describe("generateIdempotencyKey", () => {
    it("returns a 64-char hex string", () => {
      const key = generateIdempotencyKey(
        "emp-1",
        "2026-05-01",
        "2026-05-03",
        LeaveType.VACATION,
      );
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for same inputs", () => {
      const k1 = generateIdempotencyKey(
        "emp-1",
        "2026-05-01",
        "2026-05-03",
        LeaveType.VACATION,
      );
      const k2 = generateIdempotencyKey(
        "emp-1",
        "2026-05-01",
        "2026-05-03",
        LeaveType.VACATION,
      );
      expect(k1).toBe(k2);
    });

    it("differs when any input changes", () => {
      const k1 = generateIdempotencyKey(
        "emp-1",
        "2026-05-01",
        "2026-05-03",
        LeaveType.VACATION,
      );
      const k2 = generateIdempotencyKey(
        "emp-1",
        "2026-05-01",
        "2026-05-03",
        LeaveType.SICK,
      );
      expect(k1).not.toBe(k2);
    });
  });

  describe("HMAC signature", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ foo: "bar" });

    it("verifies a valid signature", () => {
      const sig = computeHmacSignature(payload, secret);
      expect(verifyHmacSignature(payload, sig, secret)).toBe(true);
    });

    it("rejects a tampered payload", () => {
      const sig = computeHmacSignature(payload, secret);
      expect(verifyHmacSignature('{"foo":"baz"}', sig, secret)).toBe(false);
    });

    it("rejects a wrong secret", () => {
      const sig = computeHmacSignature(payload, secret);
      expect(verifyHmacSignature(payload, sig, "wrong-secret")).toBe(false);
    });

    it("rejects empty signature", () => {
      expect(verifyHmacSignature(payload, "", secret)).toBe(false);
    });
  });
});
