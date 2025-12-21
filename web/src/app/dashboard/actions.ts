"use server";

import * as jobService from "@/services/job.service";
import type { JobResponseDto, JobCreatedDto } from "@/dto/job.dto";
import type { Result } from "@/lib/result";

export async function submitJob(url: string): Promise<Result<JobCreatedDto>> {
  return jobService.createJob(url);
}

export async function pollJobs(
  ids: string[]
): Promise<Result<JobResponseDto[]>> {
  if (ids.length === 0) {
    return { success: true, data: [] };
  }

  return jobService.getJobsByIds(ids);
}
