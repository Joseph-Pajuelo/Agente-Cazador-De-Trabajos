import { describe, it, expect } from 'vitest';
import {
  buildCallbackRedirectUrl,
  buildPasswordRecoveryUrl,
  mapSupabaseAuthErrorToSpanish,
  parseCallbackParams,
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
});
