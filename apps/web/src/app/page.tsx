import { getInitialRadarData } from '@/lib/supabase/queries';
import { JobsWorkspace } from '@/components/jobs/JobsWorkspace';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const { jobs, user, profileExcludedDistricts, lastUpdated, isConfigured } =
    await getInitialRadarData();

  return (
    <JobsWorkspace
      initialJobs={jobs}
      user={user}
      profileExcludedDistricts={profileExcludedDistricts}
      lastUpdated={lastUpdated}
      isConfigured={isConfigured}
      initialSearchParams={resolvedSearchParams}
    />
  );
}
