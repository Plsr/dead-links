import { normalizeOptions } from "../lib/options.js";
import * as jobRepository from "../repositories/job.repository.js";
import { processJob } from "../processor.js";
import type { CreateJobDto, JobResponseDto, JobCreatedDto } from "../dto/job.dto.js";
import { toJobResponseDto, toJobCreatedDto } from "../dto/job.dto.js";
import type { Job, JobResult } from "../db/schema.js";

export async function createJob(dto: CreateJobDto): Promise<JobCreatedDto> {
  const options = normalizeOptions(dto.options);

  const job = await jobRepository.createJob({
    url: dto.url,
    userId: dto.userId,
    options,
  });

  console.log(`Job ${job.id} created for ${dto.url}`);

  // Start processing in background (fire-and-forget)
  startProcessing(job);

  return toJobCreatedDto(job);
}

export async function getJob(id: string): Promise<JobResponseDto | undefined> {
  const job = await jobRepository.findJobById(id);
  if (!job) return undefined;
  return toJobResponseDto(job);
}

export async function getJobsByUser(userId: string): Promise<JobResponseDto[]> {
  const jobs = await jobRepository.findJobsByUserId(userId);
  return jobs.map(toJobResponseDto);
}

async function startProcessing(job: Job): Promise<void> {
  processJob(
    {
      id: job.id,
      url: job.url,
      options: job.options,
    },
    {
      onProcessing: async () => {
        await jobRepository.updateJob(job.id, { status: "processing" });
      },
      onCompleted: async (result: JobResult) => {
        await jobRepository.updateJob(job.id, {
          status: "completed",
          result,
          completedAt: new Date(),
        });
      },
      onFailed: async (error: string) => {
        await jobRepository.updateJob(job.id, {
          status: "failed",
          error,
          completedAt: new Date(),
        });
      },
    }
  );
}
