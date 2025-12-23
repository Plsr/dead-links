import { defineConfig } from "vitest/config";

// In some sandboxed environments, Vitest's default fork pool can have trouble
// terminating child processes. Threads avoid this and are fine for unit tests.
export default defineConfig({
  test: {
    pool: "threads",
  },
});


