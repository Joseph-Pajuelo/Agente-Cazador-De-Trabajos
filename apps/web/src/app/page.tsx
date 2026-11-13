import { getInitialRadarData } from '@/lib/supabase/queries';
import { Navbar } from '@/components/layout/Navbar';
import { JobsWorkspace } from '@/components/jobs/JobsWorkspace';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { jobs, user, lastUpdated, isConfigured } = await getInitialRadarData();

  const favoriteCount = jobs.filter((j) => j.user_status === 'favorite').length;
  const appliedCount = jobs.filter((j) => j.user_status === 'applied').length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        user={user}
        favoriteCount={favoriteCount}
        appliedCount={appliedCount}
        lastUpdated={lastUpdated}
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6">
        <JobsWorkspace
          initialJobs={jobs}
          user={user}
          lastUpdated={lastUpdated}
          isConfigured={isConfigured}
        />
      </main>
    </div>
  );
}
