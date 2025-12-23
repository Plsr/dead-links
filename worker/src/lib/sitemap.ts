export function extractSitemapUrlsFromRobotsTxt(robotsTxt: string): string[] {
  const sitemapUrls: string[] = [];

  for (const line of robotsTxt.split("\n")) {
    const match = line.match(/^Sitemap:\s*(.+)$/i);
    if (match) sitemapUrls.push(match[1].trim());
  }

  return sitemapUrls;
}

export function extractSitemapUrlsFromXml(xml: string): {
  childSitemaps: string[];
  urls: string[];
} {
  // Sitemap index
  const sitemapIndexMatches = xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
  const childSitemaps = Array.from(sitemapIndexMatches, (m) => m[1].trim());

  if (childSitemaps.length > 0) {
    return { childSitemaps, urls: [] };
  }

  const urls: string[] = [];
  const urlMatches = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi);
  for (const match of urlMatches) urls.push(match[1].trim());

  return { childSitemaps: [], urls };
}


