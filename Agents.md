# Dead Links Checker

A monorepo with two services: a Next.js web app and a Node.js worker that checks URLs for dead links.

## Structure

```
web/      → Next.js frontend (port 3000)
worker/   → Express + Playwright link checker (port 3001)
```

## Scripts

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Run both services in parallel
pnpm --filter web dev     # Run only web
pnpm --filter worker dev  # Run only worker
pnpm build                # Build both services
```

## Worker API

**Create job:**
```bash
POST /jobs
{"url": "https://example.com"}
→ {"id": "...", "status": "pending"}
```

**Get job status:**
```bash
GET /jobs/:id
→ {"id": "...", "status": "completed", "result": {...}}
```

## How it works

1. Tries to discover URLs from `robots.txt` / `sitemap.xml`
2. Falls back to scraping `<a href>` links from the page
3. Checks each URL with HEAD request (falls back to GET if 405)
4. Returns alive/dead/error status for each link

## Docker

```bash
docker compose up --build           # Run both services
docker build --target web -t web .  # Build web only
docker build --target worker -t worker .  # Build worker only
```
