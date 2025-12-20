import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// TODO: Use strong typing on server start to validate in the future instead of doing
// in here
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const poolMax = process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 10;
const idleTimeoutSeconds = process.env.DB_IDLE_TIMEOUT
  ? Number(process.env.DB_IDLE_TIMEOUT)
  : 30;
const connectTimeoutSeconds = process.env.DB_CONNECT_TIMEOUT
  ? Number(process.env.DB_CONNECT_TIMEOUT)
  : 10;

const client = postgres(connectionString, {
  max: poolMax,
  idle_timeout: idleTimeoutSeconds,
  connect_timeout: connectTimeoutSeconds,
});
export const db = drizzle(client, { schema });
