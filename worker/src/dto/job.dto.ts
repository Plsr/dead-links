import type { JobOptions } from "../lib/types.js";
import type { Job, JobResult, JobStatus } from "../db/schema.js";

export interface CreateJobDto {
  url: string;
  options?: JobOptions;
}

export interface JobResponseDto {
  id: string;
  url: string;
  status: JobStatus;
  options: Required<JobOptions>;
  result?: JobResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface JobCreatedDto {
  id: string;
  status: JobStatus;
}

export function toJobResponseDto(job: Job): JobResponseDto {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    options: job.options,
    result: job.result ?? undefined,
    error: job.error ?? undefined,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  };
}

export function toJobCreatedDto(job: Job): JobCreatedDto {
  return {
    id: job.id,
    status: job.status,
  };
}
