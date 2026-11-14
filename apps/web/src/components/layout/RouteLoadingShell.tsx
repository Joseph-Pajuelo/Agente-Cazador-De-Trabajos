import type { ReactNode } from 'react';
import { Briefcase, Compass, User } from 'lucide-react';
import { BRAND_NAME, BRAND_TAGLINE, BrandMark } from '@/components/brand/BrandLogo';

interface RouteLoadingShellProps {
  activeHref: '/' | '/pipeline' | '/profile';
  children: ReactNode;
}

const SKELETON_NAV = [
  { href: '/', label: 'Radar', icon: Compass },
  { href: '/pipeline', label: 'Mis Postulaciones', icon: Briefcase },
  { href: '/profile', label: 'Mi Perfil', icon: User },
] as const;

/**
 * Shared route-transition skeleton matching AppShell geometry so navigating
 * between tabs paints the target layout immediately while server data streams.
 */
export function RouteLoadingShell({
  activeHref,
  children,
}: RouteLoadingShellProps) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAFC]">
      {/* Desktop Sidebar Skeleton */}
      <aside className="hidden lg:flex w-[252px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white h-screen sticky top-0">
        <div className="p-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <BrandMark size="sm" />
          <div className="min-w-0">
            <span className="font-extrabold text-slate-900 tracking-tight text-base leading-tight block truncate">
              {BRAND_NAME}
            </span>
            <span className="text-[11px] font-medium text-[#2563EB] block truncate">
              {BRAND_TAGLINE}
            </span>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1" aria-label="Cargando navegación">
          {SKELETON_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeHref;
            return (
              <div
                key={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E2E8F0]">
          <div className="h-11 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </aside>

      {/* Mobile Topbar Skeleton */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] bg-white sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <BrandMark size="xs" />
          <span className="font-extrabold text-slate-900 text-sm tracking-tight">
            {BRAND_NAME}
          </span>
        </div>
        <div className="h-8 w-8 rounded-lg bg-slate-100 animate-pulse" />
      </header>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
