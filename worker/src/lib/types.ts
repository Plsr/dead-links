export interface JobOptions {
  /**
   * When sitemap discovery fails and we fall back to scraping, also visit a
   * limited number of internal links found on the root page (depth 1) and
   * collect links from those pages too.
   */
  followInternalLinks?: boolean;
  /**
   * Max number of internal (same-origin) pages to visit from the root page when
   * followInternalLinks is enabled.
   */
  maxInternalPages?: number;
  /**
   * Cap discovered URLs to check (prevents huge sitemaps from hammering servers).
   */
  maxLinksToCheck?: number;
  /**
   * Link check concurrency (lower is gentler).
   */
  linkCheckConcurrency?: number;
  /**
   * Delay between link-check batches in ms (adds backpressure).
   */
  linkBatchDelayMs?: number;
  /**
   * Random jitter (0..N ms) added to each batch delay.
   */
  linkBatchJitterMs?: number;
  /**
   * Delay between page navigations while scraping in ms.
   */
  navigationDelayMs?: number;
  /**
   * Random jitter (0..N ms) added to each navigation delay.
   */
  navigationJitterMs?: number;
}
