"use client";

import { useState, useEffect } from "react";
import { submitJob, pollJobs } from "./actions";
import type { JobResponseDto } from "@/dto/job.dto";

const POLL_INTERVAL = 3000;

export function JobDashboard({ initialJobs }: { initialJobs: JobResponseDto[] }) {
  const [jobs, setJobs] = useState<JobResponseDto[]>(initialJobs);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div>
      <form onSubmit={handleSubmit}>
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

      {error && <p style={{ color: "red" }}>{error}</p>}

      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            <span>{job.url}</span>
            <span>{job.status}</span>
            {job.status === "completed" && job.result && (
              <span>
                {job.result.alive} alive / {job.result.dead} dead /{" "}
                {job.result.errors} errors
              </span>
            )}
            {job.status === "failed" && <span>{job.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
