import { describe, it, expect } from "vitest";
import { canonicalJson } from "../src/crypto/canonical.js";

describe("canonicalJson", () => {
  it("produces identical output regardless of object key insertion order", () => {
    const objA = { b: 1, a: 2, z: 99, c: { y: "hello", x: "world" } };
    const objB = { z: 99, c: { x: "world", y: "hello" }, a: 2, b: 1 };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":2,"b":1,"c":{"x":"world","y":"hello"},"z":99}');
  });

  it("handles nested arrays and objects preserving array index ordering", () => {
    const data = {
      list: [
        { beta: 2, alpha: 1 },
        { delta: 4, gamma: 3 },
      ],
      name: "test",
    };

    expect(canonicalJson(data)).toBe(
      '{"list":[{"alpha":1,"beta":2},{"delta":4,"gamma":3}],"name":"test"}'
    );
  });

  it("produces different output for different values", () => {
    const a = { amount: 100, currency: "USD" };
    const b = { amount: 101, currency: "USD" };
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });

  it("rejects undefined values", () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => canonicalJson(NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Infinity)).toThrow(TypeError);
    expect(() => canonicalJson(-Infinity)).toThrow(TypeError);
    expect(() => canonicalJson({ num: NaN })).toThrow(TypeError);
  });

  it("handles primitives correctly without whitespace", () => {
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson([])).toBe("[]");
    expect(canonicalJson({})).toBe("{}");
  });
});
