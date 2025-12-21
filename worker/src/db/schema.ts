import {
  pgSchema,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import type { JobOptions } from "../lib/types.js";

export const workerSchema = pgSchema("worker");

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type LinkStatus = "alive" | "dead" | "error";

export type DiscoveryMethod = "sitemap" | "scrape";

export interface LinkResult {
  url: string;
  status: LinkStatus;
  statusCode?: number;
  error?: string;
}

export interface JobResult {
  title: string;
  discoveryMethod: DiscoveryMethod;
  pagesCrawled: number;
  pagesCrawledUrls: string[];
  linksChecked: number;
  alive: number;
  dead: number;
  errors: number;
  links: LinkResult[];
}

export const jobs = workerSchema.table("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  status: text("status").$type<JobStatus>().notNull().default("pending"),
  options: jsonb("options").$type<Required<JobOptions>>().notNull(),
  result: jsonb("result").$type<JobResult>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
