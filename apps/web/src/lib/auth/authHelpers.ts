import type { EmailOtpType } from '@supabase/supabase-js';
import { sanitizeNextPath } from '@/lib/auth/safeRedirect';

export type AuthErrorCode =
  | 'EMAIL_NOT_CONFIRMED'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'OAUTH_DISABLED'
  | 'GENERIC';

export interface MappedAuthError {
  message: string;
  code: AuthErrorCode;
}

export type CallbackMode = 'pkce' | 'otp' | 'error' | 'empty';

export interface ParsedCallbackParams {
  mode: CallbackMode;
  code: string | null;
  tokenHash: string | null;
  type: EmailOtpType | null;
  next: string;
  errorMessage: string | null;
}

const VALID_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function isValidOtpType(val: string | null): val is EmailOtpType {
  return val !== null && (VALID_OTP_TYPES as readonly string[]).includes(val);
}

/**
 * Builds the canonical OAuth and email verification callback URL with a sanitized relative redirect path.
 */
export function buildCallbackRedirectUrl(
  origin: string,
  nextPath?: string | null
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const safeNext = sanitizeNextPath(nextPath, '/');
  const url = new URL('/auth/callback', cleanOrigin);
  url.searchParams.set('next', safeNext);
  return url.toString();
}

/**
 * Builds the callback redirect URL specifically for password recovery flows,
 * pointing to `/login?mode=update-password` on completion.
 */
export function buildPasswordRecoveryUrl(origin: string): string {
  return buildCallbackRedirectUrl(origin, '/login?mode=update-password');
}

/**
 * Maps raw Supabase Auth errors to standardized error codes and friendly Spanish messages.
 */
export function mapSupabaseAuthErrorToSpanish(
  rawMessage?: string | null
): MappedAuthError {
  if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
    return {
      code: 'GENERIC',
      message: 'Ocurrió un error inesperado al procesar la autenticación.',
    };
  }

  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('email not confirmed') ||
    normalized.includes('email has not been confirmed')
  ) {
    return {
      code: 'EMAIL_NOT_CONFIRMED',
      message:
        'Tu correo electrónico aún no ha sido confirmado. Por favor revisa tu bandeja de entrada o solicita un nuevo enlace.',
    };
  }

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials')
  ) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Correo o contraseña incorrectos. Verifica tus credenciales.',
    };
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('over_email_send_rate_limit') ||
    normalized.includes('too many requests')
  ) {
    return {
      code: 'RATE_LIMITED',
      message:
        'Demasiados intentos. Por favor espera unos momentos antes de volver a intentar.',
    };
  }

  if (
    normalized.includes('provider is not enabled') ||
    normalized.includes('unsupported provider')
  ) {
    return {
      code: 'OAUTH_DISABLED',
      message: 'El proveedor de autenticación no está habilitado.',
    };
  }

  return {
    code: 'GENERIC',
    message: rawMessage,
  };
}

/**
 * Extracts, validates, and normalizes callback parameters from the incoming URL.
 */
export function parseCallbackParams(
  searchParams: URLSearchParams
): ParsedCallbackParams {
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const otpType = isValidOtpType(rawType) ? rawType : null;

  let next = sanitizeNextPath(searchParams.get('next'), '/');

  // If recovery callback did not specify a custom redirect, route directly to update-password
  if (otpType === 'recovery' && next === '/') {
    next = '/login?mode=update-password';
  }

  if (error || errorDescription) {
    return {
      mode: 'error',
      code: null,
      tokenHash: null,
      type: null,
      next,
      errorMessage: errorDescription || error || 'auth_failed',
    };
  }

  if (code) {
    return {
      mode: 'pkce',
      code,
      tokenHash: null,
      type: null,
      next,
      errorMessage: null,
    };
  }

  if (tokenHash && otpType) {
    return {
      mode: 'otp',
      code: null,
      tokenHash,
      type: otpType,
      next,
      errorMessage: null,
    };
  }

  return {
    mode: 'empty',
    code: null,
    tokenHash: null,
    type: null,
    next,
    errorMessage: null,
  };
}
