"use client";

import { useState, useEffect, useMemo } from "react";
import { submitJob, pollJobs } from "./actions";
import type { JobResponseDto, LinkResult } from "@/dto/job.dto";

const POLL_INTERVAL = 3000;

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-secondary text-secondary-foreground",
    processing: "bg-chart-2/20 text-chart-2",
    completed: "bg-chart-2/20 text-chart-2",
    failed: "bg-destructive/20 text-destructive",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}

function LinkStatusBadge({ status, statusCode }: { status: string; statusCode?: number }) {
  const styles: Record<string, string> = {
    dead: "bg-destructive/20 text-destructive",
    error: "bg-yellow-500/20 text-yellow-600",
  };

  const label = statusCode ? `${status} (${statusCode})` : status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.error}`}
    >
      {label}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function DeadLinksList({ links }: { links: LinkResult[] }) {
  const deadLinks = useMemo(
    () => links.filter((l) => l.status === "dead" || l.status === "error"),
    [links]
  );

  if (deadLinks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No dead links or errors found.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {deadLinks.map((link, idx) => (
        <li
          key={idx}
          className="flex items-start gap-3 text-sm p-2 rounded-md bg-muted/50"
        >
          <LinkStatusBadge status={link.status} statusCode={link.statusCode} />
          <div className="flex-1 min-w-0">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline break-all"
            >
              {link.url}
            </a>
            {link.error && (
              <p className="text-xs text-muted-foreground mt-1">{link.error}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function JobDashboard({ initialJobs }: { initialJobs: JobResponseDto[] }) {
  const [jobs, setJobs] = useState<JobResponseDto[]>(initialJobs);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const hasPendingJobs = jobs.some(
    (j) => j.status === "pending" || j.status === "processing"
  );

  useEffect(() => {
    if (!hasPendingJobs) return;

    const poll = async () => {
      setJobs((currentJobs) => {
        const pendingIds = currentJobs
          .filter((j) => j.status === "pending" || j.status === "processing")
          .map((j) => j.id);

        if (pendingIds.length === 0) return currentJobs;

        pollJobs(pendingIds).then((result) => {
          if (result.success) {
            setJobs((prev) =>
              prev.map((job) => result.data.find((u) => u.id === job.id) || job)
            );
          }
        });

        return currentJobs;
      });
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [hasPendingJobs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setError(null);

    const result = await submitJob(url);

    if (result.success) {
      const { id, status } = result.data;
      setJobs((prev) => [
        { id, url, status, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setUrl("");
    } else {
      setError(result.error);
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Scan websites for broken links</p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
          className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Scheduling..." : "Scan"}
        </button>
      </form>

      {error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}

      {jobs.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No scans yet. Enter a URL above to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const isCompleted = job.status === "completed" && job.result;
            const isExpanded = expandedJobs.has(job.id);
            const hasDeadOrErrors = isCompleted && (job.result!.dead > 0 || job.result!.errors > 0);

            return (
              <li
                key={job.id}
                className="rounded-lg border border-border bg-card"
              >
                <div
                  className={`p-4 ${hasDeadOrErrors ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                  onClick={() => hasDeadOrErrors && toggleExpanded(job.id)}
                  onKeyDown={(e) => {
                    if (hasDeadOrErrors && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      toggleExpanded(job.id);
                    }
                  }}
                  role={hasDeadOrErrors ? "button" : undefined}
                  tabIndex={hasDeadOrErrors ? 0 : undefined}
                  aria-expanded={hasDeadOrErrors ? isExpanded : undefined}
                  aria-controls={hasDeadOrErrors ? `job-details-${job.id}` : undefined}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium truncate flex-1">
                      {job.url}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.status} />
                      {hasDeadOrErrors && (
                        <ChevronIcon expanded={isExpanded} />
                      )}
                    </div>
                  </div>
                  {isCompleted && (
                    <div className="mt-3 flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">{job.result!.alive}</span> alive
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-medium text-destructive">{job.result!.dead}</span> dead
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">{job.result!.errors}</span> errors
                      </span>
                    </div>
                  )}
                  {job.status === "failed" && (
                    <p className="mt-2 text-sm text-destructive">{job.error}</p>
                  )}
                </div>
                {isExpanded && isCompleted && job.result!.links && (
                  <div
                    id={`job-details-${job.id}`}
                    className="px-4 pb-4 border-t border-border pt-4"
                  >
                    <h4 className="text-sm font-medium mb-3">Dead Links & Errors</h4>
                    <DeadLinksList links={job.result!.links} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
