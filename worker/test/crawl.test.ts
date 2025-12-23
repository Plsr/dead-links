import { describe, expect, it } from "vitest";
import { selectInternalPagesToCrawl } from "../src/lib/crawl.js";

describe("crawl", () => {
  it("keeps only pages on same host and http(s)", () => {
    const out = selectInternalPagesToCrawl({
      rootUrl: "https://example.com/",
      candidates: [
        "https://example.com/posts",
        "https://facebook.com/example",
        "mailto:test@example.com",
        "ftp://example.com/file",
      ],
      maxInternalPages: 10,
    });

    expect(out).toEqual(["https://example.com/posts"]);
  });

  it("drops root URL and fragments and de-dupes", () => {
    const out = selectInternalPagesToCrawl({
      rootUrl: "https://example.com/",
      candidates: [
        "https://example.com/#a",
        "https://example.com/posts#one",
        "https://example.com/posts#two",
        "https://example.com/posts",
      ],
      maxInternalPages: 10,
    });

    expect(out).toEqual(["https://example.com/posts"]);
  });

  it("respects maxInternalPages", () => {
    const out = selectInternalPagesToCrawl({
      rootUrl: "https://example.com/",
      candidates: [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ],
      maxInternalPages: 2,
    });

    expect(out.length).toBe(2);
    expect(out).toEqual(["https://example.com/a", "https://example.com/b"]);
  });
});


