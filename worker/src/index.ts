import express from "express";
import { initBrowser, closeBrowser } from "./processor.js";
import * as jobService from "./services/job.service.js";
import type { JobOptions } from "./lib/types.js";

const PORT = process.env.PORT || 3001;

async function main(): Promise<void> {
  await initBrowser();

  const app = express();
  app.use(express.json());

  app.post("/jobs", async (req, res) => {
    const { url, userId, options, ...rest } = req.body ?? {};

    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    // Allow options either under `options` or as top-level fields for convenience.
    const mergedOptions: JobOptions | undefined = {
      ...(typeof rest === "object" ? (rest as JobOptions) : {}),
      ...(typeof options === "object" ? (options as JobOptions) : {}),
    };

    try {
      const job = await jobService.createJob({ url, userId, options: mergedOptions });
      res.status(202).json(job);
    } catch (error) {
      console.error("Failed to create job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  app.get("/jobs", async (req, res) => {
    const { userId } = req.query;

    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    try {
      const jobs = await jobService.getJobsByUser(userId);
      res.json(jobs);
    } catch (error) {
      console.error("Failed to get jobs:", error);
      res.status(500).json({ error: "Failed to get jobs" });
    }
  });

  app.get("/jobs/:id", async (req, res) => {
    try {
      const job = await jobService.getJob(req.params.id);

      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      res.json(job);
    } catch (error) {
      console.error("Failed to get job:", error);
      res.status(500).json({ error: "Failed to get job" });
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`Worker listening on port ${PORT}`);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    server.close();
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Worker error:", error);
  process.exit(1);
});
