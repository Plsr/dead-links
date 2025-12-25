import { getJobsByCurrentUser } from "@/services/job.service";
import { ErrorBoundary } from "@/components/error-boundary";
import { JobDashboard } from "./job-dashboard";

export default async function DashboardPage() {
  const result = await getJobsByCurrentUser();
  const initialJobs = result.success ? result.data : [];

  return (
    <ErrorBoundary>
      <JobDashboard initialJobs={initialJobs} />
    </ErrorBoundary>
  );
}
