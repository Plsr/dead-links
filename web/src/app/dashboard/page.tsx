import { getJobsByCurrentUser } from "@/services/job.service";
import { JobDashboard } from "./job-dashboard";

export default async function DashboardPage() {
  const result = await getJobsByCurrentUser();
  const initialJobs = result.success ? result.data : [];

  return <JobDashboard initialJobs={initialJobs} />;
}
