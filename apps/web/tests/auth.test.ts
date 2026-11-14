import { describe, it, expect, vi } from 'vitest';
import {
  buildCallbackRedirectUrl,
  buildPasswordRecoveryUrl,
  mapSupabaseAuthErrorToSpanish,
  parseCallbackParams,
  isPointerEventOutsideRect,
  performPasswordAuth,
  performGoogleOAuth,
  performResendConfirmation,
  performPasswordRecovery,
  performPasswordUpdate,
} from '@/lib/auth/authHelpers';

describe('authHelpers', () => {
  describe('buildCallbackRedirectUrl', () => {
    it('produces callback redirect url with sanitized next parameter', () => {
      const url = buildCallbackRedirectUrl('https://example.com', '/workspace');
      expect(url).toBe('https://example.com/auth/callback?next=%2Fworkspace');
    });

    it('defaults next to root slash when omitted or empty', () => {
      expect(buildCallbackRedirectUrl('https://example.com')).toBe(
        'https://example.com/auth/callback?next=%2F'
      );
      expect(buildCallbackRedirectUrl('https://example.com', '')).toBe(
        'https://example.com/auth/callback?next=%2F'
      );
      expect(buildCallbackRedirectUrl('https://example.com', null)).toBe(
        'https://example.com/auth/callback?next=%2F'
      );
    });

    it('sanitizes unsafe open-redirect attempts back to root slash', () => {
      expect(buildCallbackRedirectUrl('https://example.com', '//evil.com')).toBe(
        'https://example.com/auth/callback?next=%2F'
      );
      expect(
        buildCallbackRedirectUrl('https://example.com', '/\\evil.com')
      ).toBe('https://example.com/auth/callback?next=%2F');
      expect(
        buildCallbackRedirectUrl('https://example.com', 'https://evil.com/hack')
      ).toBe('https://example.com/auth/callback?next=%2F');
    });

    it('preserves query strings inside next path', () => {
      const url = buildCallbackRedirectUrl(
        'http://localhost:3000',
        '/login?mode=update-password'
      );
      expect(url).toBe(
        'http://localhost:3000/auth/callback?next=%2Flogin%3Fmode%3Dupdate-password'
      );
    });

    it('handles trailing slash on origin safely', () => {
      const url = buildCallbackRedirectUrl('https://example.com/', '/workspace');
      expect(url).toBe('https://example.com/auth/callback?next=%2Fworkspace');
    });
  });

  describe('buildPasswordRecoveryUrl', () => {
    it('produces callback url targeting mode=update-password', () => {
      const url = buildPasswordRecoveryUrl('https://example.com');
      expect(url).toBe(
        'https://example.com/auth/callback?next=%2Flogin%3Fmode%3Dupdate-password'
      );
    });

    it('handles origin with trailing slash cleanly', () => {
      const url = buildPasswordRecoveryUrl('http://localhost:3000/');
      expect(url).toBe(
        'http://localhost:3000/auth/callback?next=%2Flogin%3Fmode%3Dupdate-password'
      );
    });
  });

  describe('mapSupabaseAuthErrorToSpanish', () => {
    it('classifies email not confirmed errors as EMAIL_NOT_CONFIRMED', () => {
      const res1 = mapSupabaseAuthErrorToSpanish('Email not confirmed');
      expect(res1.code).toBe('EMAIL_NOT_CONFIRMED');
      expect(res1.message).toMatch(/confirm/i);

      const res2 = mapSupabaseAuthErrorToSpanish('email not confirmed');
      expect(res2.code).toBe('EMAIL_NOT_CONFIRMED');

      const res3 = mapSupabaseAuthErrorToSpanish(
        'User email has not been confirmed yet'
      );
      expect(res3.code).toBe('EMAIL_NOT_CONFIRMED');
    });

    it('classifies invalid credentials errors as INVALID_CREDENTIALS', () => {
      const res1 = mapSupabaseAuthErrorToSpanish('Invalid login credentials');
      expect(res1.code).toBe('INVALID_CREDENTIALS');
      expect(res1.message).toBe(
        'Correo o contraseña incorrectos. Verifica tus credenciales.'
      );

      const res2 = mapSupabaseAuthErrorToSpanish('invalid credentials');
      expect(res2.code).toBe('INVALID_CREDENTIALS');
    });

    it('classifies rate limit errors as RATE_LIMITED', () => {
      const res1 = mapSupabaseAuthErrorToSpanish('rate limit exceeded');
      expect(res1.code).toBe('RATE_LIMITED');
      expect(res1.message).toMatch(/intentos|espera/i);

      const res2 = mapSupabaseAuthErrorToSpanish('over_email_send_rate_limit');
      expect(res2.code).toBe('RATE_LIMITED');

      const res3 = mapSupabaseAuthErrorToSpanish('Too many requests');
      expect(res3.code).toBe('RATE_LIMITED');
    });

    it('classifies disabled oauth providers as OAUTH_DISABLED', () => {
      const res1 = mapSupabaseAuthErrorToSpanish('provider is not enabled');
      expect(res1.code).toBe('OAUTH_DISABLED');
      expect(res1.message).toMatch(/proveedor.*no está habilitado/i);

      const res2 = mapSupabaseAuthErrorToSpanish('Unsupported provider: github');
      expect(res2.code).toBe('OAUTH_DISABLED');
    });

    it('maps raw callback error codes to Spanish with no English leak', () => {
      const authFailed = mapSupabaseAuthErrorToSpanish('auth_failed');
      expect(authFailed.code).toBe('GENERIC');
      expect(authFailed.message).toBe(
        'No se pudo completar la autenticación. Por favor intenta nuevamente.'
      );
      expect(authFailed.message).not.toContain('auth_failed');

      const accessDenied = mapSupabaseAuthErrorToSpanish('access_denied');
      expect(accessDenied.code).toBe('GENERIC');
      expect(accessDenied.message).toBe(
        'Acceso denegado o solicitud cancelada por el usuario.'
      );
      expect(accessDenied.message).not.toContain('access_denied');

      const serverError = mapSupabaseAuthErrorToSpanish('server_error');
      expect(serverError.code).toBe('GENERIC');
      expect(serverError.message).toBe(
        'Error interno en el servidor de autenticación. Por favor intenta más tarde.'
      );
      expect(serverError.message).not.toContain('server_error');

      const otpExpired = mapSupabaseAuthErrorToSpanish('otp_expired');
      expect(otpExpired.code).toBe('GENERIC');
      expect(otpExpired.message).toBe(
        'El enlace o código de verificación ha expirado. Por favor solicita uno nuevo.'
      );
      expect(otpExpired.message).not.toContain('otp_expired');

      const tokenExpired = mapSupabaseAuthErrorToSpanish(
        'Token has expired or is invalid'
      );
      expect(tokenExpired.code).toBe('GENERIC');
      expect(tokenExpired.message).toBe(
        'El enlace o código de verificación ha expirado. Por favor solicita uno nuevo.'
      );

      const noCode = mapSupabaseAuthErrorToSpanish('no_code');
      expect(noCode.code).toBe('GENERIC');
      expect(noCode.message).toBe(
        'No se proporcionó un código de verificación válido.'
      );
    });

    it('handles unexpected messages as GENERIC with preserved message', () => {
      const res = mapSupabaseAuthErrorToSpanish('Database connection failed');
      expect(res.code).toBe('GENERIC');
      expect(res.message).toBe('Database connection failed');
    });

    it('handles null, undefined, or empty messages gracefully with fallback', () => {
      const resNull = mapSupabaseAuthErrorToSpanish(null);
      expect(resNull.code).toBe('GENERIC');
      expect(resNull.message.length).toBeGreaterThan(0);

      const resUndef = mapSupabaseAuthErrorToSpanish(undefined);
      expect(resUndef.code).toBe('GENERIC');
      expect(resUndef.message.length).toBeGreaterThan(0);

      const resEmpty = mapSupabaseAuthErrorToSpanish('');
      expect(resEmpty.code).toBe('GENERIC');
      expect(resEmpty.message.length).toBeGreaterThan(0);
    });
  });

  describe('isPointerEventOutsideRect', () => {
    const rect = { left: 100, top: 100, right: 300, bottom: 400 };

    it('returns false for points strictly inside the bounding box', () => {
      expect(isPointerEventOutsideRect(rect, 200, 250)).toBe(false);
    });

    it('returns false for points directly on bounding box edges or padding', () => {
      expect(isPointerEventOutsideRect(rect, 100, 100)).toBe(false); // top-left
      expect(isPointerEventOutsideRect(rect, 300, 100)).toBe(false); // top-right
      expect(isPointerEventOutsideRect(rect, 100, 400)).toBe(false); // bottom-left
      expect(isPointerEventOutsideRect(rect, 300, 400)).toBe(false); // bottom-right
      expect(isPointerEventOutsideRect(rect, 200, 100)).toBe(false); // top edge
      expect(isPointerEventOutsideRect(rect, 200, 400)).toBe(false); // bottom edge
      expect(isPointerEventOutsideRect(rect, 100, 250)).toBe(false); // left edge
      expect(isPointerEventOutsideRect(rect, 300, 250)).toBe(false); // right edge
    });

    it('returns true for points outside any edge of the bounding box', () => {
      expect(isPointerEventOutsideRect(rect, 99, 250)).toBe(true); // outside left
      expect(isPointerEventOutsideRect(rect, 301, 250)).toBe(true); // outside right
      expect(isPointerEventOutsideRect(rect, 200, 99)).toBe(true); // outside top
      expect(isPointerEventOutsideRect(rect, 200, 401)).toBe(true); // outside bottom
    });
  });

  describe('parseCallbackParams', () => {
    it('prioritizes error_description over error code in error mode', () => {
      const params = new URLSearchParams(
        'error=access_denied&error_description=User+declined+the+authorization+request'
      );
      const parsed = parseCallbackParams(params);
      expect(parsed.mode).toBe('error');
      expect(parsed.errorMessage).toBe(
        'User declined the authorization request'
      );
    });

    it('falls back to error code when error_description is absent', () => {
      const params = new URLSearchParams('error=server_error');
      const parsed = parseCallbackParams(params);
      expect(parsed.mode).toBe('error');
      expect(parsed.errorMessage).toBe('server_error');
    });

    it('parses PKCE authorization code successfully', () => {
      const params = new URLSearchParams('code=pkce-auth-code-123&next=/radar');
      const parsed = parseCallbackParams(params);
      expect(parsed.mode).toBe('pkce');
      expect(parsed.code).toBe('pkce-auth-code-123');
      expect(parsed.tokenHash).toBeNull();
      expect(parsed.type).toBeNull();
      expect(parsed.next).toBe('/radar');
      expect(parsed.errorMessage).toBeNull();
    });

    it('parses OTP token_hash and valid type', () => {
      const params = new URLSearchParams(
        'token_hash=th_signup_999&type=signup&next=/onboarding'
      );
      const parsed = parseCallbackParams(params);
      expect(parsed.mode).toBe('otp');
      expect(parsed.code).toBeNull();
      expect(parsed.tokenHash).toBe('th_signup_999');
      expect(parsed.type).toBe('signup');
      expect(parsed.next).toBe('/onboarding');
      expect(parsed.errorMessage).toBeNull();
    });

    it('defaults next to /login?mode=update-password for recovery type when next is root or missing', () => {
      const paramsDefault = new URLSearchParams(
        'token_hash=th_rec_111&type=recovery'
      );
      const parsed1 = parseCallbackParams(paramsDefault);
      expect(parsed1.mode).toBe('otp');
      expect(parsed1.type).toBe('recovery');
      expect(parsed1.next).toBe('/login?mode=update-password');

      const paramsRoot = new URLSearchParams(
        'token_hash=th_rec_111&type=recovery&next=/'
      );
      const parsed2 = parseCallbackParams(paramsRoot);
      expect(parsed2.mode).toBe('otp');
      expect(parsed2.type).toBe('recovery');
      expect(parsed2.next).toBe('/login?mode=update-password');
    });

    it('preserves custom next path for recovery type when explicitly specified', () => {
      const paramsCustom = new URLSearchParams(
        'token_hash=th_rec_111&type=recovery&next=/custom-reset'
      );
      const parsed = parseCallbackParams(paramsCustom);
      expect(parsed.mode).toBe('otp');
      expect(parsed.type).toBe('recovery');
      expect(parsed.next).toBe('/custom-reset');
    });

    it('supports all valid Supabase email otp types', () => {
      const types = [
        'signup',
        'email',
        'recovery',
        'magiclink',
        'invite',
        'email_change',
      ] as const;

      for (const t of types) {
        const params = new URLSearchParams(`token_hash=th_${t}&type=${t}`);
        const parsed = parseCallbackParams(params);
        expect(parsed.mode).toBe('otp');
        expect(parsed.type).toBe(t);
        expect(parsed.tokenHash).toBe(`th_${t}`);
      }
    });

    it('sanitizes unsafe next parameters in callback params', () => {
      const params1 = new URLSearchParams('code=abc&next=//evil.com');
      const parsed1 = parseCallbackParams(params1);
      expect(parsed1.next).toBe('/');

      const params2 = new URLSearchParams(
        'token_hash=th_123&type=signup&next=/\\evil.com'
      );
      const parsed2 = parseCallbackParams(params2);
      expect(parsed2.next).toBe('/');

      const params3 = new URLSearchParams(
        'token_hash=th_123&type=signup&next=https://malicious.org'
      );
      const parsed3 = parseCallbackParams(params3);
      expect(parsed3.next).toBe('/');
    });

    it('returns empty mode when no actionable parameters are present', () => {
      const params = new URLSearchParams('');
      const parsed = parseCallbackParams(params);
      expect(parsed.mode).toBe('empty');
      expect(parsed.code).toBeNull();
      expect(parsed.tokenHash).toBeNull();
      expect(parsed.type).toBeNull();
      expect(parsed.next).toBe('/');
      expect(parsed.errorMessage).toBeNull();
    });

    it('prioritizes error mode even if code or token_hash are also present', () => {
      const params = new URLSearchParams(
        'error=access_denied&code=abc&token_hash=xyz'
      );
      const parsed = parseCallbackParams(params);
      expect(parsed.mode).toBe('error');
      expect(parsed.errorMessage).toBe('access_denied');
    });
  });

  describe('Shared Auth Orchestration Helpers', () => {
    it('validates required fields for performPasswordAuth', async () => {
      const res = await performPasswordAuth({
        mode: 'signin',
        email: '',
        password: '',
        origin: 'http://localhost:3000',
      });
      expect(res.success).toBe(false);
      expect(res.error?.message).toMatch(/completa todos los campos/i);
    });

    it('performs signin successfully with mock client', async () => {
      const mockClient = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        },
      } as unknown as Parameters<typeof performPasswordAuth>[0]['client'];

      const res = await performPasswordAuth({
        mode: 'signin',
        email: 'user@test.com',
        password: 'password123',
        origin: 'http://localhost:3000',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(res.hasSession).toBe(true);
      expect(mockClient?.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'password123',
      });
    });

    it('performs signup with emailRedirectTo and data payload with mock client', async () => {
      const mockClient = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { session: null, user: { id: 'u123' } },
            error: null,
          }),
        },
      } as unknown as Parameters<typeof performPasswordAuth>[0]['client'];

      const res = await performPasswordAuth({
        mode: 'signup',
        email: 'user@test.com',
        password: 'password123',
        fullName: 'Ana Pérez',
        origin: 'http://localhost:3000',
        nextPath: '/radar',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(res.hasSession).toBe(false);
      expect(mockClient?.auth.signUp).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'password123',
        options: {
          emailRedirectTo: 'http://localhost:3000/auth/callback?next=%2Fradar',
          data: { full_name: 'Ana Pérez' },
        },
      });
    });

    it('performs google oauth redirect generation with mock client', async () => {
      const mockClient = {
        auth: {
          signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
        },
      } as unknown as Parameters<typeof performGoogleOAuth>[0]['client'];

      const res = await performGoogleOAuth({
        origin: 'http://localhost:3000',
        nextPath: '/workspace',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(mockClient?.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo:
            'http://localhost:3000/auth/callback?next=%2Fworkspace',
        },
      });
    });

    it('performs resend confirmation with mock client', async () => {
      const mockClient = {
        auth: {
          resend: vi.fn().mockResolvedValue({ error: null }),
        },
      } as unknown as Parameters<typeof performResendConfirmation>[0]['client'];

      const res = await performResendConfirmation({
        email: 'test@example.com',
        origin: 'http://localhost:3000',
        nextPath: '/welcome',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(mockClient?.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'test@example.com',
        options: {
          emailRedirectTo:
            'http://localhost:3000/auth/callback?next=%2Fwelcome',
        },
      });
    });

    it('performs password recovery with mock client', async () => {
      const mockClient = {
        auth: {
          resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
        },
      } as unknown as Parameters<typeof performPasswordRecovery>[0]['client'];

      const res = await performPasswordRecovery({
        email: 'recover@example.com',
        origin: 'http://localhost:3000',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(mockClient?.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'recover@example.com',
        {
          redirectTo:
            'http://localhost:3000/auth/callback?next=%2Flogin%3Fmode%3Dupdate-password',
        }
      );
    });

    it('performs password update with mock client', async () => {
      const mockClient = {
        auth: {
          updateUser: vi.fn().mockResolvedValue({ error: null }),
        },
      } as unknown as Parameters<typeof performPasswordUpdate>[0]['client'];

      const res = await performPasswordUpdate({
        password: 'new-strong-password',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(mockClient?.auth.updateUser).toHaveBeenCalledWith({
        password: 'new-strong-password',
      });
    });

    it('falls back to signInWithPassword when signup returns User already registered', async () => {
      const mockClient = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'User already registered' },
          }),
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'u-123', email: 'existing@uni.edu.pe' },
              session: { access_token: 'tok' },
            },
            error: null,
          }),
        },
      } as unknown as Parameters<typeof performPasswordAuth>[0]['client'];

      const res = await performPasswordAuth({
        mode: 'signup',
        email: 'existing@uni.edu.pe',
        password: 'secretpassword',
        origin: 'http://localhost:3000',
        client: mockClient,
      });

      expect(res.success).toBe(true);
      expect(res.hasSession).toBe(true);
      expect(res.user).toEqual({ id: 'u-123', email: 'existing@uni.edu.pe' });
    });
  });
});
