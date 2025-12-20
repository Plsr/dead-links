import { describe, expect, it } from "vitest";
import { jitter } from "../src/lib/time.js";

describe("time", () => {
  it("jitter returns 0 for non-positive max", () => {
    expect(jitter(0)).toBe(0);
    expect(jitter(-10)).toBe(0);
  });

  it("jitter returns value in range [0..max]", () => {
    const max = 10;
    for (let i = 0; i < 100; i++) {
      const v = jitter(max);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(max);
    }
  });
});

