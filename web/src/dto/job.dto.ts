/** Possible states of a link checking job */
export type JobStatus = "pending" | "processing" | "completed" | "failed";

/** Result status for an individual link check */
export type LinkStatus = "alive" | "dead" | "error";

/** Method used to discover URLs on the target site */
export type DiscoveryMethod = "sitemap" | "scrape";

/**
 * Result of checking a single link
 */
export interface LinkResult {
  /** The URL that was checked */
  url: string;
  /** Whether the link is alive, dead, or errored */
  status: LinkStatus;
  /** HTTP status code returned (present for alive/dead, absent for errors) */
  statusCode?: number;
  /** Error message if status is "error" (e.g., network timeout, DNS failure) */
  error?: string;
}

/**
 * Complete results of a link checking job
 */
export interface JobResult {
  /** Page title of the target URL */
  title: string;
  /** How URLs were discovered (sitemap.xml or page scraping) */
  discoveryMethod: DiscoveryMethod;
  /** Number of pages crawled to find links */
  pagesCrawled: number;
  /** URLs of all pages that were crawled */
  pagesCrawledUrls: string[];
  /** Total number of links checked */
  linksChecked: number;
  /** Count of links returning 2xx/3xx status */
  alive: number;
  /** Count of links returning 4xx/5xx status */
  dead: number;
  /** Count of links that failed to check (network errors, timeouts) */
  errors: number;
  /** Detailed results for each link checked */
  links: LinkResult[];
}

/**
 * Full job response including status and results
 */
export interface JobResponseDto {
  /** Unique job identifier */
  id: string;
  /** Target URL being checked */
  url: string;
  /** Current job status */
  status: JobStatus;
  /** Job results (present when status is "completed") */
  result?: JobResult;
  /** Error message (present when status is "failed") */
  error?: string;
  /** ISO timestamp when job was created */
  createdAt: string;
  /** ISO timestamp when job finished (present when completed or failed) */
  completedAt?: string;
}

/**
 * Response when a new job is created
 */
export interface JobCreatedDto {
  /** Unique job identifier */
  id: string;
  /** Initial job status (typically "pending") */
  status: JobStatus;
}
