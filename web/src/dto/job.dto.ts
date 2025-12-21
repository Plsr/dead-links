export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface JobResult {
  alive: number;
  dead: number;
  errors: number;
}

export interface JobResponseDto {
  id: string;
  url: string;
  status: JobStatus;
  result?: JobResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface JobCreatedDto {
  id: string;
  status: JobStatus;
}
