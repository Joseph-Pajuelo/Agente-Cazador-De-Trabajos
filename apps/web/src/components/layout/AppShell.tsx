'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Compass,
  Briefcase,
  User,
  Sparkles,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { isPointerEventOutsideRect } from '@/lib/auth/authHelpers';

export interface AppShellPipelineCounts {
  favoriteCount?: number;
  appliedCount?: number;
  interviewCount?: number;
  discardedCount?: number;
  totalTracked?: number;
}

export interface AppShellProps {
  user: { id: string; email?: string | null } | null;
  pipelineCounts?: AppShellPipelineCounts;
  lastUpdated?: string | null;
  mobileFilterTrigger?: React.ReactNode;
  onOpenAuthModal?: () => void;
  children: React.ReactNode;
}

export function AppShell({
  user,
  pipelineCounts,
  lastUpdated,
  mobileFilterTrigger,
  onOpenAuthModal,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const pointerDownOutsideRef = React.useRef(false);

  const activePipelineCount = React.useMemo(() => {
    if (!pipelineCounts) return 0;
    if (typeof pipelineCounts.appliedCount === 'number' && pipelineCounts.appliedCount > 0) {
      return pipelineCounts.appliedCount;
    }
    if (typeof pipelineCounts.totalTracked === 'number' && pipelineCounts.totalTracked > 0) {
      return pipelineCounts.totalTracked;
    }
    return 0;
  }, [pipelineCounts]);

  const formattedUpdate = React.useMemo(() => {
    if (!lastUpdated) return 'Actualizado hoy';
    try {
      const date = new Date(lastUpdated);
      return `Actualizado ${date.toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return 'Actualizado hoy';
    }
  }, [lastUpdated]);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured()) return;
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      closeDrawer();
      router.refresh();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const openDrawer = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      setIsDrawerOpen(true);
    }
  };

  const closeDrawer = () => {
    const dialog = dialogRef.current;
    if (dialog && dialog.open) {
      dialog.returnValue = '';
      dialog.close();
    }
    setIsDrawerOpen(false);
  };

  // Close drawer on navigation
  React.useEffect(() => {
    closeDrawer();
  }, [pathname]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (!dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    pointerDownOutsideRef.current = isPointerEventOutsideRect(
      rect,
      e.clientX,
      e.clientY
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (!dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    if (
      pointerDownOutsideRef.current &&
      isPointerEventOutsideRect(rect, e.clientX, e.clientY)
    ) {
      closeDrawer();
    }
    pointerDownOutsideRef.current = false;
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    closeDrawer();
  };

  const navLinks = [
    {
      href: '/',
      label: 'Radar',
      icon: Compass,
      exact: true,
    },
    {
      href: '/pipeline',
      label: 'Mis Postulaciones',
      icon: Briefcase,
      badge: activePipelineCount > 0 ? activePipelineCount : undefined,
      exact: false,
    },
    {
      href: '/profile',
      label: 'Mi Perfil',
      icon: User,
      exact: false,
    },
  ];

  const userInitial = React.useMemo(() => {
    if (!user?.email) return 'U';
    return user.email[0].toUpperCase();
  }, [user?.email]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col lg:flex-row">
      {/* ------------------------------------------------------------- */}
      {/* Desktop Fixed Left Sidebar (232px)                            */}
      {/* ------------------------------------------------------------- */}
      <aside
        className="hidden lg:flex w-[232px] shrink-0 border-r border-[#E2E8F0] bg-white flex-col h-screen sticky top-0 z-20"
        aria-label="Barra lateral de navegación"
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#E2E8F0]">
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-90"
            aria-label="Job Hunter Agent - Inicio"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1E3A8A] text-white font-bold shadow-xs">
              JH
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-base truncate">
                  Job Hunter
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                Prácticas Lima
              </p>
            </div>
          </Link>
          <div className="mt-2.5 inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 border border-blue-200/60">
            <Sparkles className="h-2.5 w-2.5 text-blue-700" />
            <span>Radar Inteligente</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav
          className="flex-1 p-3 space-y-1 overflow-y-auto"
          aria-label="Navegación principal"
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#1E3A8A] font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-[#1E3A8A]' : 'text-slate-500'
                    }`}
                  />
                  <span className="truncate">{link.label}</span>
                </div>
                {typeof link.badge === 'number' && (
                  <span className="ml-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[11px] font-bold text-emerald-800">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Timestamp Footer */}
        <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          <span className="block truncate">{formattedUpdate}</span>
        </div>

        {/* User Account Panel at bottom */}
        <div className="p-3 border-t border-[#E2E8F0] bg-slate-50/60">
          {user ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#1E3A8A] text-xs font-bold border border-blue-200">
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <span
                    className="block text-xs font-semibold text-slate-800 truncate"
                    title={user.email || 'Usuario'}
                  >
                    {user.email || 'Usuario'}
                  </span>
                  <span className="block text-[10px] text-emerald-700 font-medium">
                    Conectado
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-2xs border border-transparent hover:border-slate-200 transition-colors disabled:opacity-50"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-slate-500">
                Modo Explorador (Público)
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenAuthModal ? onOpenAuthModal() : router.push('/login')
                }
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1E3A8A] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5 text-blue-200" />
                <span>Ingresar</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* Mobile Top Header Bar (< 1024px)                              */}
      {/* ------------------------------------------------------------- */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-[#E2E8F0] bg-white/95 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Abrir menú de navegación"
            aria-expanded={isDrawerOpen}
            aria-controls="mobile-nav-drawer"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Job Hunter Agent"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1E3A8A] text-white text-xs font-bold shadow-2xs">
              JH
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">
              Job Hunter
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {mobileFilterTrigger && <div>{mobileFilterTrigger}</div>}
          {!user && (
            <button
              type="button"
              onClick={() =>
                onOpenAuthModal ? onOpenAuthModal() : router.push('/login')
              }
              className="inline-flex items-center gap-1 rounded-md bg-[#1E3A8A] px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-blue-800 transition-colors"
            >
              <LogIn className="h-3 w-3" />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* Mobile Native Navigation Dialog Drawer                        */}
      {/* ------------------------------------------------------------- */}
      <dialog
        ref={dialogRef}
        id="mobile-nav-drawer"
        aria-label="Menú de navegación"
        className="app-nav-drawer"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onCancel={handleCancel}
      >
        <div className="flex h-full flex-col">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E3A8A] text-white text-xs font-bold shadow-xs">
                JH
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  Job Hunter
                </span>
                <span className="block text-[10px] text-slate-500">
                  Prácticas Lima
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Cerrar menú"
              autoFocus
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer Nav links */}
          <nav
            className="flex-1 p-3 space-y-1 overflow-y-auto"
            aria-label="Navegación móvil"
          >
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = link.exact
                ? pathname === link.href
                : pathname === link.href || pathname.startsWith(`${link.href}/`);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeDrawer}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#EFF6FF] text-[#1E3A8A] font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? 'text-[#1E3A8A]' : 'text-slate-500'
                      }`}
                    />
                    <span>{link.label}</span>
                  </div>
                  {typeof link.badge === 'number' && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[11px] font-bold text-emerald-800">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Drawer Bottom User Panel */}
          <div className="border-t border-slate-100 p-4 bg-slate-50">
            {user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#1E3A8A] text-xs font-bold">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs font-medium text-slate-800 truncate max-w-[130px]">
                      {user.email || 'Usuario'}
                    </span>
                    <span className="block text-[10px] text-emerald-700">
                      Conectado
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Salir</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  closeDrawer();
                  if (onOpenAuthModal) onOpenAuthModal();
                  else router.push('/login');
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1E3A8A] px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Iniciar sesión</span>
              </button>
            )}
          </div>
        </div>
      </dialog>

      {/* ------------------------------------------------------------- */}
      {/* Main Content Viewport                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
