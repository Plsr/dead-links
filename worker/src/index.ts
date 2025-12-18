async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("Worker starting...");

  while (true) {
    console.log("Processing task...");
    await sleep(2000);
    console.log("Task completed!");
  }
}

main().catch((error) => {
  console.error("Worker error:", error);
  process.exit(1);
});
