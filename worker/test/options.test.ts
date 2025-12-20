import { describe, expect, it } from "vitest";
import { normalizeOptions, DEFAULT_OPTIONS } from "../src/lib/options.js";

describe("options", () => {
  it("normalizeOptions fills defaults", () => {
    expect(normalizeOptions()).toEqual(DEFAULT_OPTIONS);
  });

  it("normalizeOptions overrides defaults", () => {
    const out = normalizeOptions({
      followInternalLinks: false,
      maxInternalPages: 3,
    });
    expect(out.followInternalLinks).toBe(false);
    expect(out.maxInternalPages).toBe(3);
    // untouched defaults remain
    expect(out.maxLinksToCheck).toBe(DEFAULT_OPTIONS.maxLinksToCheck);
  });
});

