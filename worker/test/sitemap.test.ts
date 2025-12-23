import { describe, expect, it } from "vitest";
import {
  extractSitemapUrlsFromRobotsTxt,
  extractSitemapUrlsFromXml,
} from "../src/lib/sitemap.js";

describe("sitemap", () => {
  it("extracts sitemap URLs from robots.txt", () => {
    const robots = [
      "User-agent: *",
      "Disallow:",
      "Sitemap: https://example.com/sitemap.xml",
      "Sitemap: https://example.com/sitemap_index.xml",
      "",
    ].join("\n");

    expect(extractSitemapUrlsFromRobotsTxt(robots)).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/sitemap_index.xml",
    ]);
  });

  it("parses sitemap index XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex>
  <sitemap><loc>https://example.com/a.xml</loc></sitemap>
  <sitemap><loc>https://example.com/b.xml</loc></sitemap>
</sitemapindex>`;

    expect(extractSitemapUrlsFromXml(xml)).toEqual({
      childSitemaps: ["https://example.com/a.xml", "https://example.com/b.xml"],
      urls: [],
    });
  });

  it("parses urlset sitemap XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/posts</loc></url>
</urlset>`;

    expect(extractSitemapUrlsFromXml(xml)).toEqual({
      childSitemaps: [],
      urls: ["https://example.com/", "https://example.com/posts"],
    });
  });
});


