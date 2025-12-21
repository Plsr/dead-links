import type { JobResponseDto, JobCreatedDto } from "@/dto/job.dto";
import { getCurrentUser } from "@/lib/current-user";
import { type Result, ok, err } from "@/lib/result";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3001";

export async function createJob(
  url: string
): Promise<Result<JobCreatedDto>> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return err("Unauthorized");
    }

    const res = await fetch(`${WORKER_URL}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, userId: user.id }),
    });

    if (!res.ok) {
      const error = await res.json();
      return err(error.error || "Failed to create job");
    }

    return ok(await res.json());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create job");
  }
}

export async function getJobsByCurrentUser(): Promise<
  Result<JobResponseDto[]>
> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return err("Unauthorized");
    }

    const res = await fetch(`${WORKER_URL}/jobs?userId=${user.id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return err("Failed to fetch jobs");
    }

    return ok(await res.json());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to fetch jobs");
  }
}

export async function getJob(
  id: string
): Promise<Result<JobResponseDto | null>> {
  try {
    const res = await fetch(`${WORKER_URL}/jobs/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 404) {
        // Job not found
        return ok(null);
      }

      let message = "Failed to fetch job";
      try {
        const error = await res.json();
        if (error && typeof error.error === "string") {
          message = error.error;
        }
      } catch {
        // Ignore JSON parsing errors and use the default message
      }

      return err(message);
    }

    return ok(await res.json());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to fetch job");
  }
}

export async function getJobsByIds(
  ids: string[]
): Promise<Result<JobResponseDto[]>> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return err("Unauthorized");
    }

    const results = await Promise.all(ids.map(getJob));

    const jobs: JobResponseDto[] = [];
    for (const result of results) {
      if (!result.success) {
        return err(result.error);
      }
      if (result.data !== null) {
        jobs.push(result.data);
      }
    }

    return ok(jobs);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to fetch jobs");
  }
}
