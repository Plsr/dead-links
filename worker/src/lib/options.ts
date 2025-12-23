import type { JobOptions } from "./types.js";

export const DEFAULT_OPTIONS: Required<JobOptions> = {
  followInternalLinks: true,
  maxInternalPages: 10,
  maxLinksToCheck: 500,
  linkCheckConcurrency: 3,
  linkBatchDelayMs: 600,
  linkBatchJitterMs: 400,
  navigationDelayMs: 800,
  navigationJitterMs: 500,
};

export function normalizeOptions(options?: JobOptions): Required<JobOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...(options ?? {}),
  };
}


