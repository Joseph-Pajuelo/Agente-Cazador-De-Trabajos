import { RouteLoadingShell } from '@/components/layout/RouteLoadingShell';

export default function PipelineLoading() {
  return (
    <RouteLoadingShell activeHref="/pipeline">
      <div className="mx-auto max-w-[1380px] w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-56 rounded-lg bg-slate-200/80 animate-pulse" />
            <div className="h-4 w-80 rounded-md bg-slate-100 animate-pulse" />
          </div>
          <div className="h-10 w-64 rounded-xl bg-slate-200/70 animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((col) => (
            <div
              key={col}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-3 min-h-[420px]"
            >
              <div className="h-6 w-32 rounded-md bg-slate-200/80 animate-pulse" />
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2.5"
                >
                  <div className="h-4 w-4/5 rounded bg-slate-200/80 animate-pulse" />
                  <div className="h-3.5 w-1/2 rounded bg-slate-100 animate-pulse" />
                  <div className="h-7 w-full rounded-lg bg-slate-100 animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </RouteLoadingShell>
  );
}
