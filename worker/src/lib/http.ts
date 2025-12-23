export function isAlive(statusCode: number): boolean {
  if (statusCode >= 200 && statusCode < 400) return true;
  // Treat auth-required as alive (page exists, just restricted)
  if (statusCode === 401 || statusCode === 403) return true;
  return false;
}


