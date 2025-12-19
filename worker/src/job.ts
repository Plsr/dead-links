import { randomUUID } from "node:crypto";
import { chromium, Browser } from "playwright";

type JobStatus = "pending" | "processing" | "completed" | "failed";

type LinkStatus = "alive" | "dead" | "error";

type DiscoveryMethod = "sitemap" | "scrape";

export interface JobOptions {
  /**
   * When sitemap discovery fails and we fall back to scraping, also visit a
   * limited number of internal links found on the root page (depth 1) and
   * collect links from those pages too.
   */
  followInternalLinks?: boolean;
  /**
   * Max number of internal (same-origin) pages to visit from the root page when
   * followInternalLinks is enabled.
   */
  maxInternalPages?: number;
  /**
   * Cap discovered URLs to check (prevents huge sitemaps from hammering servers).
   */
  maxLinksToCheck?: number;
  /**
   * Link check concurrency (lower is gentler).
   */
  linkCheckConcurrency?: number;
  /**
   * Delay between link-check batches in ms (adds backpressure).
   */
  linkBatchDelayMs?: number;
  /**
   * Random jitter (0..N ms) added to each batch delay.
   */
  linkBatchJitterMs?: number;
  /**
   * Delay between page navigations while scraping in ms.
   */
  navigationDelayMs?: number;
  /**
   * Random jitter (0..N ms) added to each navigation delay.
   */
  navigationJitterMs?: number;
}

export interface LinkResult {
  url: string;
  status: LinkStatus;
  statusCode?: number;
  error?: string;
}

export interface JobResult {
  title: string;
  discoveryMethod: DiscoveryMethod;
  pagesCrawled: number;
  pagesCrawledUrls: string[];
  linksChecked: number;
  alive: number;
  dead: number;
  errors: number;
  links: LinkResult[];
}

export interface Job {
  id: string;
  url: string;
  options: Required<JobOptions>;
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

const DEFAULT_OPTIONS: Required<JobOptions> = {
  followInternalLinks: true,
  maxInternalPages: 10,
  maxLinksToCheck: 500,
  linkCheckConcurrency: 3,
  linkBatchDelayMs: 600,
  linkBatchJitterMs: 400,
  navigationDelayMs: 800,
  navigationJitterMs: 500,
};

function normalizeOptions(options?: JobOptions): Required<JobOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...(options ?? {}),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(maxMs: number): number {
  if (maxMs <= 0) return 0;
  return Math.floor(Math.random() * (maxMs + 1));
}

export async function initBrowser(): Promise<void> {
  console.log("Starting browser...");
  browser = await chromium.launch();
}

export async function closeBrowser(): Promise<void> {
  await browser.close();
}

export function createJob(url: string, options?: JobOptions): Job {
  const normalized = normalizeOptions(options);
  const job: Job = {
    id: randomUUID(),
    url,
    options: normalized,
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
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
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

async function discoverFromPages(
  rootUrl: string,
  options: Required<JobOptions>,
  extraInternalPages?: string[]
): Promise<{ title: string; links: string[]; pagesCrawledUrls: string[] }> {
  const root = new URL(rootUrl);
  const rootOrigin = root.origin;
  const rootHost = root.host;

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-US",
    viewport: { width: 1365, height: 768 },
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  // Make Playwright a bit less "obviously automated" where possible.
  // This is not guaranteed, but it helps some basic checks.
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    } catch {
      // ignore
    }
  });

  // Reduce bandwidth / server load by skipping non-essential assets.
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      route.abort();
      return;
    }
    route.continue();
  });

  const page = await context.newPage();

  const allLinks = new Set<string>();
  const crawledPages = new Set<string>();

  async function extractLinks(
    currentPageUrl: string
  ): Promise<{ title?: string; internalLinks: string[] }> {
    await page.goto(currentPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Small human-ish pause after load.
    await sleep(250 + jitter(250));

    const title = await page.title().catch(() => "");

    // Track crawled pages (for reporting).
    try {
      const normalized = new URL(currentPageUrl);
      normalized.hash = "";
      crawledPages.add(normalized.href);
    } catch {
      // ignore
    }

    const { absoluteLinks, internalLinks } = await page.evaluate<
      {
        absoluteLinks: string[];
        internalLinks: string[];
      },
      string
    >((origin) => {
      // Keep this callback "flat" (no nested helper functions). Some dev
      // toolchains (tsx/esbuild) inject helpers like __name() for inner
      // functions, which would break when Playwright executes this in-page.

      // Only extract from HTML body content (avoid head/scripts/etc),
      // but include nav/footer links too.
      const container = document.body ?? document.documentElement;
      const anchors = Array.from(container.querySelectorAll("a[href]"));

      const abs = new Set<string>();
      const internal = new Set<string>();

      const nonContentExt =
        /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|bz2|mp[34]|m4a|wav|ogg|mov|mp4|avi|webm|png|jpe?g|gif|webp|svg|ico|css|js|map|json|xml|rss|atom|woff2?|ttf|otf|eot)$/i;

      const trackingParams = new Set([
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
        "fbclid",
        "msclkid",
      ]);

      for (const el of anchors) {
        const a = el;
        const raw = a.getAttribute("href") || "";
        if (!raw) continue;
        if (
          raw.startsWith("mailto:") ||
          raw.startsWith("tel:") ||
          raw.startsWith("javascript:")
        ) {
          continue;
        }

        let resolved;
        try {
          resolved = new URL(raw, window.location.href);
        } catch {
          continue;
        }

        // Normalize for discovery / dedupe
        resolved.hash = "";

        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
          continue;
        }

        abs.add(resolved.href);

        if (resolved.origin !== origin) continue;

        const rel = (a.getAttribute("rel") || "").toLowerCase();
        if (a.hasAttribute("download")) continue;
        if (rel.split(/\s+/).includes("nofollow")) continue;
        if (nonContentExt.test(resolved.pathname)) continue;

        // Drop common tracking params to reduce duplicate crawling.
        for (const key of Array.from(resolved.searchParams.keys())) {
          if (trackingParams.has(key.toLowerCase())) {
            resolved.searchParams.delete(key);
          }
        }

        internal.add(resolved.href);
      }

      return {
        absoluteLinks: Array.from(abs),
        internalLinks: Array.from(internal),
      };
    }, rootOrigin);

    for (const link of absoluteLinks) allLinks.add(link);

    return { title, internalLinks };
  }

  try {
    const root = await extractLinks(rootUrl);
    const title = root.title ?? "";

    if (options.followInternalLinks) {
      const normalizedRoot = new URL(rootUrl);
      normalizedRoot.hash = "";
      const candidates = new Set<string>();

      for (const u of root.internalLinks) candidates.add(u);
      for (const u of extraInternalPages ?? []) candidates.add(u);

      const internalToVisit = Array.from(candidates)
        .filter((u) => {
          try {
            const parsed = new URL(u);
            return (
              (parsed.protocol === "http:" || parsed.protocol === "https:") &&
              parsed.host === rootHost
            );
          } catch {
            return false;
          }
        })
        .filter((u) => u !== normalizedRoot.href)
        .slice(0, options.maxInternalPages);

      for (const internalUrl of internalToVisit) {
        await sleep(
          options.navigationDelayMs + jitter(options.navigationJitterMs)
        );
        await extractLinks(internalUrl).catch(() => {
          // ignore navigation failures while scraping; link checking will reveal issues
        });
      }
    }

    return {
      title,
      links: Array.from(allLinks),
      pagesCrawledUrls: Array.from(crawledPages),
    };
  } finally {
    await page.close();
    await context.close();
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
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
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
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
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

async function checkLinks(
  links: string[],
  jobId: string,
  options: Required<JobOptions>
): Promise<LinkResult[]> {
  const results: LinkResult[] = [];
  const concurrency = Math.max(1, options.linkCheckConcurrency);

  for (let i = 0; i < links.length; i += concurrency) {
    const batch = links.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(checkLink));
    results.push(...batchResults);
    console.log(
      `Job ${jobId}: Checked ${Math.min(i + concurrency, links.length)}/${
        links.length
      } links`
    );

    if (i + concurrency < links.length) {
      await sleep(options.linkBatchDelayMs + jitter(options.linkBatchJitterMs));
    }
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
    let pagesCrawledUrls: string[] = [];

    // Try sitemap first
    console.log(`Job ${job.id}: Trying sitemap discovery`);
    const sitemapPages = await discoverFromSitemap(baseUrl);

    if (sitemapPages.length > 0) {
      console.log(
        `Job ${job.id}: Found ${sitemapPages.length} URLs from sitemap`
      );

      // Even if sitemap exists, we still need to *scrape pages* to discover
      // outbound links to check. Use the sitemap as additional internal pages
      // to crawl (bounded by maxInternalPages).
      const extraInternalPages = sitemapPages
        .filter((u) => {
          try {
            return new URL(u).origin === baseUrl;
          } catch {
            return false;
          }
        })
        .slice(0, job.options.maxInternalPages);

      const pageData = await discoverFromPages(
        job.url,
        job.options,
        extraInternalPages
      );
      title = pageData.title;
      links = pageData.links;
      pagesCrawledUrls = pageData.pagesCrawledUrls;
    } else {
      // Fall back to page scraping
      console.log(
        `Job ${job.id}: No sitemap found, falling back to page scraping`
      );
      discoveryMethod = "scrape";
      const pageData = await discoverFromPages(job.url, job.options);
      title = pageData.title;
      links = pageData.links;
      pagesCrawledUrls = pageData.pagesCrawledUrls;
    }

    if (links.length > job.options.maxLinksToCheck) {
      console.log(
        `Job ${job.id}: Capping links from ${links.length} to ${job.options.maxLinksToCheck} to reduce load`
      );
      links = links.slice(0, job.options.maxLinksToCheck);
    }

    console.log(`Job ${job.id}: Found ${links.length} links to check`);

    const results = await checkLinks(links, job.id, job.options);

    const alive = results.filter((r) => r.status === "alive").length;
    const dead = results.filter((r) => r.status === "dead").length;
    const errors = results.filter((r) => r.status === "error").length;

    job.result = {
      title,
      discoveryMethod,
      pagesCrawled: pagesCrawledUrls.length,
      pagesCrawledUrls,
      linksChecked: results.length,
      alive,
      dead,
      errors,
      links: results,
    };
    job.status = "completed";

    console.log(
      `Job ${job.id} completed: ${alive} alive, ${dead} dead, ${errors} errors`
    );
  } catch (error) {
    job.status = "failed";
    job.error = String(error);
    console.error(`Job ${job.id} failed:`, error);
  } finally {
    job.completedAt = new Date();
  }
}
