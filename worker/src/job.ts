import { randomUUID } from "node:crypto";
import { chromium, Browser } from "playwright";

type JobStatus = "pending" | "processing" | "completed" | "failed";

type LinkStatus = "alive" | "dead" | "error";

export interface LinkResult {
  url: string;
  status: LinkStatus;
  statusCode?: number;
  error?: string;
}

export interface JobResult {
  title: string;
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

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

async function processJob(job: Job): Promise<void> {
  job.status = "processing";
  const page = await browser.newPage();

  try {
    await page.goto(job.url);
    const title = await page.title();

    // Extract all unique hyperlinks
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

    console.log(`Job ${job.id}: Found ${links.length} links to check`);

    // Check all links in parallel (with concurrency limit)
    const results: LinkResult[] = [];
    const concurrency = 5;

    for (let i = 0; i < links.length; i += concurrency) {
      const batch = links.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(checkLink));
      results.push(...batchResults);
      console.log(`Job ${job.id}: Checked ${Math.min(i + concurrency, links.length)}/${links.length} links`);
    }

    const alive = results.filter((r) => r.status === "alive").length;
    const dead = results.filter((r) => r.status === "dead").length;
    const errors = results.filter((r) => r.status === "error").length;

    job.result = {
      title,
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
    await page.close();
  }
}
