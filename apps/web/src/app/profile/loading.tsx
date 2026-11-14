import { RouteLoadingShell } from '@/components/layout/RouteLoadingShell';

export default function ProfileLoading() {
  return (
    <RouteLoadingShell activeHref="/profile">
      <div className="mx-auto max-w-3xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-lg bg-slate-200/80 animate-pulse" />
          <div className="h-4 w-96 max-w-full rounded-md bg-slate-100 animate-pulse" />
        </div>

        {[1, 2, 3].map((section) => (
          <div
            key={section}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-6 space-y-4 shadow-xs"
          >
            <div className="h-5 w-48 rounded-md bg-slate-200/80 animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
            </div>
            <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
          </div>
        ))}
      </div>
    </RouteLoadingShell>
  );
}
