import { RouteLoadingShell } from '@/components/layout/RouteLoadingShell';

export default function RadarLoading() {
  return (
    <RouteLoadingShell activeHref="/">
      <div className="flex flex-1 min-h-[calc(100vh-57px)] lg:min-h-screen">
        {/* Filter Sidebar Placeholder */}
        <div className="hidden lg:block w-[296px] shrink-0 border-r border-[#E2E8F0] bg-white p-4 space-y-5">
          <div className="h-7 w-40 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-9 w-full rounded-xl bg-slate-100 animate-pulse" />
          <div className="space-y-2.5 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-6 rounded-lg bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Feed Skeleton */}
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-9 w-72 rounded-xl bg-slate-200/80 animate-pulse" />
            <div className="h-9 w-40 rounded-xl bg-slate-200/70 animate-pulse" />
          </div>
          {[1, 2, 3, 4].map((card) => (
            <div
              key={card}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 shadow-xs"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-12 w-12 rounded-xl bg-slate-100 animate-pulse shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-3/4 rounded-md bg-slate-200/80 animate-pulse" />
                    <div className="h-4 w-1/2 rounded-md bg-slate-100 animate-pulse" />
                  </div>
                </div>
                <div className="h-12 w-12 rounded-full bg-slate-100 animate-pulse shrink-0" />
              </div>
              <div className="flex gap-2 pt-1">
                <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
                <div className="h-6 w-24 rounded-full bg-slate-100 animate-pulse" />
                <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </RouteLoadingShell>
  );
}
