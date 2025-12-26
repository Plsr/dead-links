"use server";

import * as jobService from "@/services/job.service";
import type { JobResponseDto, JobCreatedDto } from "@/dto/job.dto";
import type { Result } from "@/lib/result";

function validateUrl(url: string): { valid: true } | { valid: false; error: string } {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return { valid: false, error: "URL is required" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  const allowedProtocols = ["http:", "https:"];
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return { valid: false, error: "Only HTTP and HTTPS URLs are allowed" };
  }

  if (!parsedUrl.hostname) {
    return { valid: false, error: "URL must include a hostname" };
  }

  return { valid: true };
}

export async function submitJob(url: string): Promise<Result<JobCreatedDto>> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  return jobService.createJob(url.trim());
}

export async function pollJobs(
  ids: string[]
): Promise<Result<JobResponseDto[]>> {
  if (ids.length === 0) {
    return { success: true, data: [] };
  }

  return jobService.getJobsByIds(ids);
}
