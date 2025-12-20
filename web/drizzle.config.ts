import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

// TODO: Use strong typing on server start to validate in the future instead of doing
// in here
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
