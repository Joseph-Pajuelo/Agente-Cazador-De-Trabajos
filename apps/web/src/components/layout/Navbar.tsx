'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Compass, Briefcase, User, Sparkles, LogIn, LogOut } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface NavbarProps {
  user: { id: string; email?: string | null } | null;
  favoriteCount?: number;
  appliedCount?: number;
  lastUpdated?: string | null;
  onOpenAuth?: (mode?: 'signin' | 'signup') => void;
}

export function Navbar({
  user,
  favoriteCount = 0,
  appliedCount = 0,
  lastUpdated,
  onOpenAuth,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured()) return;
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

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

  const navLinks = [
    { href: '/', label: 'Radar', icon: Compass },
    {
      href: '/pipeline',
      label: 'Mi Pipeline',
      icon: Briefcase,
      badge: appliedCount > 0 ? appliedCount : undefined,
    },
    { href: '/profile', label: 'Mi Perfil', icon: User },
  ];

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
            aria-label="Job Hunter Agent - Inicio"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-900 text-white font-bold shadow-sm">
              JH
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-base sm:text-lg">
                  Job Hunter
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 border border-blue-200/60">
                  <Sparkles className="h-2.5 w-2.5 text-blue-700" />
                  Radar IA
                </span>
              </div>
              <p className="text-[11px] text-slate-600 hidden sm:block">
                Prácticas Preprofesionales · Lima
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-blue-900 font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-blue-900' : 'text-slate-600'}`} />
                  <span>{link.label}</span>
                  {typeof link.badge === 'number' && (
                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Actions: Sync status + Auth state */}
        <div className="flex items-center gap-3">
          {/* Live quick counter for favorites */}
          {favoriteCount > 0 && (
            <div
              className="hidden lg:inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200"
              title="Vacantes destacadas en tu radar"
            >
              <span>⭐</span>
              <span>{favoriteCount} destacadas</span>
            </div>
          )}

          {/* Timestamp indicator */}
          <span className="hidden xl:inline-block text-xs text-slate-600">
            {formattedUpdate}
          </span>

          {/* User auth state */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-medium text-slate-800 max-w-[160px] truncate">
                  {user.email || 'Usuario'}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium">Conectado</span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5 text-slate-600" />
                <span className="hidden sm:inline">
                  {isSigningOut ? 'Saliendo...' : 'Salir'}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('signin') : router.push('/login')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5 text-blue-200" />
                <span>Ingresar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav pills bar */}
      <div className="flex md:hidden border-t border-slate-100 bg-slate-50/80 px-4 py-2 overflow-x-auto gap-2">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                isActive
                  ? 'bg-white text-blue-900 font-semibold shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{link.label}</span>
              {typeof link.badge === 'number' && (
                <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-100 px-1 text-[9px] font-bold text-emerald-800">
                  {link.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
