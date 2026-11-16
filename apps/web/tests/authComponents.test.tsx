import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockSignInWithOAuth = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

import {
  checkGoogleOAuthAvailability,
  mapSupabaseAuthErrorToSpanish,
  performGoogleOAuth,
} from '../src/lib/auth/authHelpers';
import {
  AuthGoogleSection,
  AuthModeTabs,
  AuthStatusBanners,
  getAuthTransitionDirection,
} from '../src/components/auth/AuthFormPrimitives';
import { AuthModal } from '../src/components/auth/AuthModal';
import { resolveAuthRefreshAction } from '../src/components/auth/AuthSessionSync';

describe('Auth Helpers: Google OAuth precheck, error mapping & mode transitions', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    mockSignInWithOAuth.mockReset();
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });

  it('detects Google OAuth disabled from Supabase /auth/v1/settings and prevents OAuth redirect', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-demo';
    vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { email: true, google: false } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const status = await checkGoogleOAuthAvailability({ forceRefresh: true });
    expect(status).toBe('disabled');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.supabase.co/auth/v1/settings',
      expect.objectContaining({
        method: 'GET',
        headers: { apikey: 'anon-key-demo' },
      })
    );

    const oauthRes = await performGoogleOAuth({
      origin: 'https://job-hunter-agent-blond.vercel.app',
    });
    expect(oauthRes.success).toBe(false);
    expect(oauthRes.error?.code).toBe('OAUTH_DISABLED');
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  it('detects Google OAuth enabled and unknown cleanly', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-demo';
    vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ external: { google: true } }),
      })
    );

    expect(await checkGoogleOAuthAvailability({ forceRefresh: true })).toBe('enabled');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await checkGoogleOAuthAvailability({ forceRefresh: true })).toBe('unknown');
  });

  it('maps already-registered messages to USER_ALREADY_EXISTS in Spanish', () => {
    const mapped = mapSupabaseAuthErrorToSpanish('User already registered');
    expect(mapped.code).toBe('USER_ALREADY_EXISTS');
    expect(mapped.message).toMatch(/ya está registrado|ya tiene una cuenta/i);
  });

  it('computes slide direction between signin, signup and recovery', () => {
    expect(getAuthTransitionDirection('signin', 'signup')).toBe('forward');
    expect(getAuthTransitionDirection('signup', 'recovery')).toBe('forward');
    expect(getAuthTransitionDirection('signup', 'signin')).toBe('backward');
    expect(getAuthTransitionDirection('recovery', 'signin')).toBe('backward');
  });
});

describe('Auth UI Primitives & AuthModal SSR', () => {
  it('renders segmented tabs with active indicator and aria-selected state', () => {
    const html = renderToStaticMarkup(
      <AuthModeTabs mode="signup" onSelectMode={vi.fn()} />
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('auth-tab-indicator');
    expect(html).toContain('translate-x-full');
    expect(html).toContain('Iniciar sesión');
    expect(html).toContain('Crear cuenta');
  });

  it('renders direct recovery buttons on USER_ALREADY_EXISTS and INVALID_CREDENTIALS', () => {
    const existsHtml = renderToStaticMarkup(
      <AuthStatusBanners
        errorMessage="Este correo ya tiene una cuenta registrada."
        errorCode="USER_ALREADY_EXISTS"
        successMessage={null}
        isResending={false}
        configured={true}
        onResendConfirmation={vi.fn()}
        onSwitchMode={vi.fn()}
      />
    );
    expect(existsHtml).toContain('Ir a Iniciar sesión');
    expect(existsHtml).toContain('Restablecer contraseña');

    const invalidHtml = renderToStaticMarkup(
      <AuthStatusBanners
        errorMessage="Correo o contraseña incorrectos."
        errorCode="INVALID_CREDENTIALS"
        successMessage={null}
        isResending={false}
        configured={true}
        onResendConfirmation={vi.fn()}
        onSwitchMode={vi.fn()}
      />
    );
    expect(invalidHtml).toContain('¿Olvidaste tu contraseña? Recupérala aquí');
  });

  it('renders non-navigating disabled Google state when provider is disabled', () => {
    const html = renderToStaticMarkup(
      <AuthGoogleSection
        googleStatus="disabled"
        isOAuthSubmitting={false}
        isSubmitting={false}
        configured={true}
        onGoogleSignIn={vi.fn()}
      />
    );
    expect(html).toContain('Continuar con Google');
    expect(html).toContain('Deshabilitado');
    expect(html).toContain('disabled=""');
    expect(html).toContain('El acceso con Google está deshabilitado temporalmente');
  });

  it('renders AuthModal with mode switcher and transition wrapper class', () => {
    const html = renderToStaticMarkup(
      <AuthModal isOpen={true} onClose={vi.fn()} defaultMode="signup" />
    );
    expect(html).toContain('auth-modal-dialog');
    expect(html).toContain('auth-mode-forward');
    expect(html).toContain('Crear tu cuenta');
    expect(html).toContain('Continuar con Google');
  });

  it('ignores same-user SIGNED_IN visibilitychange events and refreshes only on real identity transitions', () => {
    // 1. Initial session sets baseline without forcing router.refresh()
    expect(resolveAuthRefreshAction('INITIAL_SESSION', undefined, 'user-1')).toEqual({
      shouldRefresh: false,
      nextUserId: 'user-1',
    });

    // 2. Returning to tab triggers SIGNED_IN for same user -> must NOT refresh
    expect(resolveAuthRefreshAction('SIGNED_IN', 'user-1', 'user-1')).toEqual({
      shouldRefresh: false,
      nextUserId: 'user-1',
    });

    // 3. Guest -> Signed in triggers refresh
    expect(resolveAuthRefreshAction('SIGNED_IN', null, 'user-1')).toEqual({
      shouldRefresh: true,
      nextUserId: 'user-1',
    });

    // 4. Signed in -> Signed out triggers refresh; repeated SIGNED_OUT does not
    expect(resolveAuthRefreshAction('SIGNED_OUT', 'user-1', null)).toEqual({
      shouldRefresh: true,
      nextUserId: null,
    });
    expect(resolveAuthRefreshAction('SIGNED_OUT', null, null)).toEqual({
      shouldRefresh: false,
      nextUserId: null,
    });
  });
});
