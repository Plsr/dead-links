import { randomUUID } from "node:crypto";
import { chromium, Browser } from "playwright";

type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  result?: { title: string };
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

async function processJob(job: Job): Promise<void> {
  job.status = "processing";
  const page = await browser.newPage();
  try {
    await page.goto(job.url);
    const title = await page.title();
    job.result = { title };
    job.status = "completed";
    console.log(`Job ${job.id} completed: ${title}`);
  } catch (error) {
    job.status = "failed";
    job.error = String(error);
    console.error(`Job ${job.id} failed:`, error);
  } finally {
    job.completedAt = new Date();
    await page.close();
  }
}
