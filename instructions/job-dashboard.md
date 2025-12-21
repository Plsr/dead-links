# Job Dashboard Implementation

Connect web to worker: submit URLs, list jobs, poll for updates.

## 1. Schema Changes

### Worker: Add userId to jobs

```ts
// worker/src/db/schema.ts
export const jobs = workerSchema.table("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // NEW
  url: text("url").notNull(),
  // ... rest unchanged
});
```

Generate migration: `pnpm --filter worker drizzle-kit generate`

### Worker: Update API to accept userId

```ts
// POST /jobs body
{ url: string; userId: string; options?: JobOptions }
```

Update `CreateJobDto`, `job.service.ts`, and `job.repository.ts` to handle `userId`.

### Worker: Add list endpoint

```ts
// worker/src/index.ts
app.get("/jobs", async (req, res) => {
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId required" });
  }
  const jobs = await jobService.getJobsByUser(userId);
  res.json(jobs);
});
```

```ts
// job.repository.ts
export async function findJobsByUserId(userId: string): Promise<Job[]> {
  return db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt));
}
```

## 2. Web API Routes

### POST /api/jobs - Create job

```ts
// web/src/app/api/jobs/route.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3001";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const res = await fetch(`${WORKER_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, userId: session.user.id }),
  });

  return NextResponse.json(await res.json(), { status: res.status });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${WORKER_URL}/jobs?userId=${session.user.id}`);
  return NextResponse.json(await res.json());
}
```

### GET /api/jobs/pending - Poll pending jobs

```ts
// web/src/app/api/jobs/pending/route.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3001";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch each job status in parallel
  const jobs = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${WORKER_URL}/jobs/${id}`);
      return res.ok ? res.json() : null;
    })
  );

  return NextResponse.json(jobs.filter(Boolean));
}
```

## 3. Dashboard Page

```tsx
// web/src/app/dashboard/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { JobDashboard } from "./job-dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const res = await fetch(`${process.env.WORKER_URL || "http://localhost:3001"}/jobs?userId=${session.user.id}`, {
    cache: "no-store",
  });
  const initialJobs = await res.json();

  return <JobDashboard initialJobs={initialJobs} />;
}
```

## 4. Client Component with Polling

```tsx
// web/src/app/dashboard/job-dashboard.tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface Job {
  id: string;
  url: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: { alive: number; dead: number; errors: number };
  error?: string;
  createdAt: string;
}

const POLL_INTERVAL = 3000;

export function JobDashboard({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Get IDs of pending/processing jobs
  const pendingIds = jobs
    .filter((j) => j.status === "pending" || j.status === "processing")
    .map((j) => j.id);

  // Poll for updates
  useEffect(() => {
    if (pendingIds.length === 0) return;

    const poll = async () => {
      const res = await fetch(`/api/jobs/pending?ids=${pendingIds.join(",")}`);
      if (!res.ok) return;
      const updated: Job[] = await res.json();

      setJobs((prev) =>
        prev.map((job) => updated.find((u) => u.id === job.id) || job)
      );
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pendingIds.join(",")]); // Re-create interval when pending list changes

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (res.ok) {
      const { id, status } = await res.json();
      setJobs((prev) => [{ id, url, status, createdAt: new Date().toISOString() }, ...prev]);
      setUrl("");
    }
    setSubmitting(false);
  };

  return (
    <div>
      {/* URL Input Form */}
      <form onSubmit={submit}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Scheduling..." : "Scan"}
        </button>
      </form>

      {/* Jobs List */}
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            <span>{job.url}</span>
            <span>{job.status}</span>
            {job.status === "completed" && job.result && (
              <span>
                ✓{job.result.alive} ✗{job.result.dead} ⚠{job.result.errors}
              </span>
            )}
            {job.status === "failed" && <span>{job.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## 5. Environment

Add to `web/.env`:

```
WORKER_URL=http://localhost:3001
```

## Summary

| File | Purpose |
|------|---------|
| `worker/src/db/schema.ts` | Add `userId` column |
| `worker/src/index.ts` | Add `GET /jobs?userId=` endpoint |
| `worker/src/dto/job.dto.ts` | Add `userId` to CreateJobDto |
| `worker/src/repositories/job.repository.ts` | Add `findJobsByUserId` |
| `worker/src/services/job.service.ts` | Add `getJobsByUser` |
| `web/src/app/api/jobs/route.ts` | Proxy POST/GET to worker |
| `web/src/app/api/jobs/pending/route.ts` | Batch fetch for polling |
| `web/src/app/dashboard/page.tsx` | Server component, auth guard |
| `web/src/app/dashboard/job-dashboard.tsx` | Client component with form + polling |

