import { describe, expect, it } from "vitest";
import { isAlive } from "../src/lib/http.js";

describe("http", () => {
  it("treats 2xx/3xx as alive", () => {
    expect(isAlive(200)).toBe(true);
    expect(isAlive(301)).toBe(true);
    expect(isAlive(399)).toBe(true);
  });

  it("treats 401/403 as alive", () => {
    expect(isAlive(401)).toBe(true);
    expect(isAlive(403)).toBe(true);
  });

  it("treats other codes as not alive", () => {
    expect(isAlive(400)).toBe(false);
    expect(isAlive(404)).toBe(false);
    expect(isAlive(500)).toBe(false);
  });
});

