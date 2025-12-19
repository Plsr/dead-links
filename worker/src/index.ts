import express from "express";
import {
  initBrowser,
  closeBrowser,
  createJob,
  getJob,
  JobOptions,
} from "./job.js";

const PORT = process.env.PORT || 3001;

async function main(): Promise<void> {
  await initBrowser();

  const app = express();
  app.use(express.json());

  app.post("/jobs", (req, res) => {
    const { url, options, ...rest } = req.body ?? {};

    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    // Allow options either under `options` or as top-level fields for convenience.
    const mergedOptions: JobOptions | undefined = {
      ...(typeof rest === "object" ? (rest as JobOptions) : {}),
      ...(typeof options === "object" ? (options as JobOptions) : {}),
    };

    const job = createJob(url, mergedOptions);
    res.status(202).json({ id: job.id, status: job.status });
  });

  app.get("/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(job);
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
