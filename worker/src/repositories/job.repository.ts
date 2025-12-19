import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, Job, NewJob, JobStatus, JobResult } from "../db/schema.js";

export interface JobUpdateData {
  status?: JobStatus;
  result?: JobResult;
  error?: string;
  completedAt?: Date;
}

export async function createJob(data: NewJob): Promise<Job> {
  const [job] = await db.insert(jobs).values(data).returning();
  return job;
}

export async function findJobById(id: string): Promise<Job | undefined> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return job;
}

export async function updateJob(
  id: string,
  data: JobUpdateData
): Promise<Job | undefined> {
  const [job] = await db
    .update(jobs)
    .set(data)
    .where(eq(jobs.id, id))
    .returning();
  return job;
}
