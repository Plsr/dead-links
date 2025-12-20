export interface SelectInternalPagesArgs {
  rootUrl: string;
  candidates: Iterable<string>;
  maxInternalPages: number;
}

/**
 * Select which pages we should crawl (follow) next.
 *
 * - Only http(s)
 * - Only exact host match to the requested root URL
 * - Drops fragment-only differences
 */
export function selectInternalPagesToCrawl({
  rootUrl,
  candidates,
  maxInternalPages,
}: SelectInternalPagesArgs): string[] {
  const root = new URL(rootUrl);
  const rootHost = root.host;
  root.hash = "";

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const u of candidates) {
    if (selected.length >= maxInternalPages) break;

    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.host !== rootHost) continue;

    parsed.hash = "";
    if (parsed.href === root.href) continue;

    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    selected.push(parsed.href);
  }

  return selected;
}

