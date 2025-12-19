import { randomUUID } from "node:crypto";
import { chromium, Browser } from "playwright";

type JobStatus = "pending" | "processing" | "completed" | "failed";

type LinkStatus = "alive" | "dead" | "error";

type DiscoveryMethod = "sitemap" | "scrape";

export interface LinkResult {
  url: string;
  status: LinkStatus;
  statusCode?: number;
  error?: string;
}

export interface JobResult {
  title: string;
  discoveryMethod: DiscoveryMethod;
  linksChecked: number;
  alive: number;
  dead: number;
  errors: number;
  links: LinkResult[];
}

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  result?: JobResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

let browser: Browser;

const jobs = new Map<string, Job>();

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function initBrowser(): Promise<void> {
  console.log("Starting browser...");
  browser = await chromium.launch();
}

export async function closeBrowser(): Promise<void> {
  await browser.close();
}

export function createJob(url: string): Job {
  const job: Job = {
    id: randomUUID(),
    url,
    status: "pending",
    createdAt: new Date(),
  };

  jobs.set(job.id, job);
  console.log(`Job ${job.id} created for ${url}`);

  processJob(job);

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function getSitemapUrlsFromRobots(baseUrl: string): Promise<string[]> {
  const robotsUrl = new URL("/robots.txt", baseUrl).href;
  const robotsTxt = await fetchText(robotsUrl);
  if (!robotsTxt) return [];

  const sitemapUrls: string[] = [];
  for (const line of robotsTxt.split("\n")) {
    const match = line.match(/^Sitemap:\s*(.+)$/i);
    if (match) {
      sitemapUrls.push(match[1].trim());
    }
  }
  return sitemapUrls;
}

async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchText(sitemapUrl);
  if (!xml) return [];

  const urls: string[] = [];

  // Check if it's a sitemap index
  const sitemapIndexMatches = xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
  const childSitemaps = Array.from(sitemapIndexMatches, (m) => m[1].trim());

  if (childSitemaps.length > 0) {
    // It's a sitemap index, recursively parse each sitemap
    console.log(`Found sitemap index with ${childSitemaps.length} sitemaps`);
    for (const childUrl of childSitemaps) {
      const childUrls = await parseSitemap(childUrl);
      urls.push(...childUrls);
    }
  } else {
    // Regular sitemap, extract URLs
    const urlMatches = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi);
    for (const match of urlMatches) {
      urls.push(match[1].trim());
    }
  }

  return urls;
}

async function discoverFromSitemap(baseUrl: string): Promise<string[]> {
  const urls = new Set<string>();

  // Try to find sitemaps from robots.txt
  const sitemapUrls = await getSitemapUrlsFromRobots(baseUrl);

  // Also try common sitemap locations
  const commonSitemapPaths = ["/sitemap.xml", "/sitemap_index.xml"];
  for (const path of commonSitemapPaths) {
    const url = new URL(path, baseUrl).href;
    if (!sitemapUrls.includes(url)) {
      sitemapUrls.push(url);
    }
  }

  console.log(`Checking ${sitemapUrls.length} potential sitemap locations`);

  for (const sitemapUrl of sitemapUrls) {
    const sitemapLinks = await parseSitemap(sitemapUrl);
    sitemapLinks.forEach((link) => urls.add(link));
  }

  return Array.from(urls);
}

async function discoverFromPage(url: string): Promise<{ title: string; links: string[] }> {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const title = await page.title();

    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll("a[href]");
      const urls = new Set<string>();

      anchors.forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (href.startsWith("http://") || href.startsWith("https://")) {
          urls.add(href);
        }
      });

      return Array.from(urls);
    });

    return { title, links };
  } finally {
    await page.close();
  }
}

function isAlive(statusCode: number): boolean {
  if (statusCode >= 200 && statusCode < 400) return true;
  // Treat auth-required as alive (page exists, just restricted)
  if (statusCode === 401 || statusCode === 403) return true;
  return false;
}

async function checkLink(url: string): Promise<LinkResult> {
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    // Retry with GET if server doesn't support HEAD
    if (response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": USER_AGENT,
        },
      });
    }

    return {
      url,
      status: isAlive(response.status) ? "alive" : "dead",
      statusCode: response.status,
    };
  } catch (error) {
    return {
      url,
      status: "error",
      error: String(error),
    };
  }
}

async function checkLinks(links: string[], jobId: string): Promise<LinkResult[]> {
  const results: LinkResult[] = [];
  const concurrency = 5;

  for (let i = 0; i < links.length; i += concurrency) {
    const batch = links.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(checkLink));
    results.push(...batchResults);
    console.log(`Job ${jobId}: Checked ${Math.min(i + concurrency, links.length)}/${links.length} links`);
  }

  return results;
}

async function processJob(job: Job): Promise<void> {
  job.status = "processing";

  try {
    const baseUrl = new URL(job.url).origin;
    let links: string[] = [];
    let title = "";
    let discoveryMethod: DiscoveryMethod = "sitemap";

    // Try sitemap first
    console.log(`Job ${job.id}: Trying sitemap discovery`);
    links = await discoverFromSitemap(baseUrl);

    if (links.length > 0) {
      console.log(`Job ${job.id}: Found ${links.length} URLs from sitemap`);
      // Get title from the main page
      const page = await browser.newPage();
      try {
        await page.goto(job.url);
        title = await page.title();
      } finally {
        await page.close();
      }
    } else {
      // Fall back to page scraping
      console.log(`Job ${job.id}: No sitemap found, falling back to page scraping`);
      discoveryMethod = "scrape";
      const pageData = await discoverFromPage(job.url);
      title = pageData.title;
      links = pageData.links;
    }

    console.log(`Job ${job.id}: Found ${links.length} links to check`);

    const results = await checkLinks(links, job.id);

    const alive = results.filter((r) => r.status === "alive").length;
    const dead = results.filter((r) => r.status === "dead").length;
    const errors = results.filter((r) => r.status === "error").length;

    job.result = {
      title,
      discoveryMethod,
      linksChecked: results.length,
      alive,
      dead,
      errors,
      links: results,
    };
    job.status = "completed";

    console.log(`Job ${job.id} completed: ${alive} alive, ${dead} dead, ${errors} errors`);
  } catch (error) {
    job.status = "failed";
    job.error = String(error);
    console.error(`Job ${job.id} failed:`, error);
  } finally {
    job.completedAt = new Date();
  }
}
