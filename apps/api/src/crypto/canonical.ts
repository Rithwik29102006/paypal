/**
 * Deterministic canonical JSON serialization.
 * Recursively sorts keys alphabetically, uses compact format (no whitespace),
 * and rejects undefined, NaN, and Infinity.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("canonicalJson cannot serialize undefined");
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `canonicalJson cannot serialize non-finite number: ${value}`
      );
    }
    return JSON.stringify(value);
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalJson(item));
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const val = obj[key];
      if (val === undefined) {
        throw new TypeError(
          `canonicalJson cannot serialize object with undefined property "${key}"`
        );
      }
      pairs.push(`${JSON.stringify(key)}:${canonicalJson(val)}`);
    }
    return `{${pairs.join(",")}}`;
  }

  throw new TypeError(
    `canonicalJson cannot serialize unsupported type: ${typeof value}`
  );
}
