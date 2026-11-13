import type { EmailOtpType } from '@supabase/supabase-js';
import { sanitizeNextPath } from '@/lib/auth/safeRedirect';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

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

export interface RectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Pure helper verifying whether a pointer coordinate falls strictly outside
 * a given rectangular bounding box (e.g., a native <dialog>'s content box).
 */
export function isPointerEventOutsideRect(
  rect: RectBounds,
  clientX: number,
  clientY: number
): boolean {
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
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
 * Maps raw Supabase Auth and callback error codes to standardized error codes and friendly Spanish messages,
 * ensuring no raw English system error codes leak to the UI.
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

  const normalized = rawMessage.toLowerCase().trim();

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

  // Handle standard Supabase / OAuth callback error codes
  if (normalized === 'auth_failed' || normalized.includes('auth_failed')) {
    return {
      code: 'GENERIC',
      message:
        'No se pudo completar la autenticación. Por favor intenta nuevamente.',
    };
  }

  if (normalized === 'access_denied' || normalized.includes('access_denied')) {
    return {
      code: 'GENERIC',
      message: 'Acceso denegado o solicitud cancelada por el usuario.',
    };
  }

  if (normalized === 'server_error' || normalized.includes('server_error')) {
    return {
      code: 'GENERIC',
      message:
        'Error interno en el servidor de autenticación. Por favor intenta más tarde.',
    };
  }

  if (
    normalized === 'otp_expired' ||
    normalized.includes('otp_expired') ||
    normalized.includes('token has expired') ||
    normalized.includes('token is expired')
  ) {
    return {
      code: 'GENERIC',
      message:
        'El enlace o código de verificación ha expirado. Por favor solicita uno nuevo.',
    };
  }

  if (normalized === 'no_code' || normalized.includes('no_code')) {
    return {
      code: 'GENERIC',
      message: 'No se proporcionó un código de verificación válido.',
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

// ---------------------------------------------------------------------------
// Shared Asynchronous Auth Orchestration Dispatchers
// ---------------------------------------------------------------------------

export interface AuthActionResult<T = unknown> {
  success: boolean;
  message?: string;
  hasSession?: boolean;
  data?: T;
  error?: MappedAuthError;
}

export async function performGoogleOAuth(params: {
  origin: string;
  nextPath?: string | null;
  client?: ReturnType<typeof createClient>;
}): Promise<AuthActionResult> {
  if (!params.client && !isSupabaseConfigured()) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message:
          'Supabase no está configurado en las variables de entorno (.env.local).',
      },
    };
  }

  try {
    const supabase = params.client || createClient();
    const redirectTo = buildCallbackRedirectUrl(params.origin, params.nextPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthErrorToSpanish(error.message),
      };
    }

    return {
      success: true,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapSupabaseAuthErrorToSpanish(
        err instanceof Error ? err.message : 'Error al conectar con Google OAuth'
      ),
    };
  }
}

export async function performResendConfirmation(params: {
  email: string;
  origin: string;
  nextPath?: string | null;
  client?: ReturnType<typeof createClient>;
}): Promise<AuthActionResult> {
  if (!params.email) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Ingresa tu correo para reenviar la confirmación.',
      },
    };
  }

  if (!params.client && !isSupabaseConfigured()) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Supabase no está configurado.',
      },
    };
  }

  try {
    const supabase = params.client || createClient();
    const emailRedirectTo = buildCallbackRedirectUrl(
      params.origin,
      params.nextPath
    );

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: params.email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthErrorToSpanish(error.message),
      };
    }

    return {
      success: true,
      message:
        '¡Correo de confirmación reenviado! Por favor revisa tu bandeja de entrada o spam.',
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Error al reenviar el correo de confirmación.',
      },
    };
  }
}

export async function performPasswordRecovery(params: {
  email: string;
  origin: string;
  client?: ReturnType<typeof createClient>;
}): Promise<AuthActionResult> {
  if (!params.email) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Por favor ingresa tu correo electrónico.',
      },
    };
  }

  if (!params.client && !isSupabaseConfigured()) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message:
          'Supabase no está configurado en las variables de entorno (.env.local).',
      },
    };
  }

  try {
    const supabase = params.client || createClient();
    const redirectTo = buildPasswordRecoveryUrl(params.origin);

    const { error } = await supabase.auth.resetPasswordForEmail(params.email, {
      redirectTo,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthErrorToSpanish(error.message),
      };
    }

    return {
      success: true,
      message:
        'Te hemos enviado un correo con las instrucciones para restablecer tu contraseña. Por favor revisa tu bandeja de entrada.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapSupabaseAuthErrorToSpanish(
        err instanceof Error
          ? err.message
          : 'Error al procesar la recuperación de contraseña'
      ),
    };
  }
}

export async function performPasswordUpdate(params: {
  password: string;
  client?: ReturnType<typeof createClient>;
}): Promise<AuthActionResult> {
  if (!params.password || params.password.length < 6) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'La nueva contraseña debe tener al menos 6 caracteres.',
      },
    };
  }

  if (!params.client && !isSupabaseConfigured()) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message:
          'Supabase no está configurado en las variables de entorno (.env.local).',
      },
    };
  }

  try {
    const supabase = params.client || createClient();
    const { error } = await supabase.auth.updateUser({
      password: params.password,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthErrorToSpanish(error.message),
      };
    }

    return {
      success: true,
      message: '¡Contraseña actualizada correctamente! Redirigiendo...',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapSupabaseAuthErrorToSpanish(
        err instanceof Error ? err.message : 'Error al actualizar la contraseña'
      ),
    };
  }
}

export async function performPasswordAuth(params: {
  mode: 'signin' | 'signup';
  email: string;
  password: string;
  fullName?: string;
  origin: string;
  nextPath?: string | null;
  client?: ReturnType<typeof createClient>;
}): Promise<AuthActionResult> {
  if (!params.email || !params.password) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Por favor completa todos los campos requeridos.',
      },
    };
  }

  if (!params.client && !isSupabaseConfigured()) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message:
          'Supabase no está configurado en las variables de entorno (.env.local).',
      },
    };
  }

  try {
    const supabase = params.client || createClient();

    if (params.mode === 'signup') {
      const emailRedirectTo = buildCallbackRedirectUrl(
        params.origin,
        params.nextPath
      );
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          emailRedirectTo,
          data: {
            full_name: params.fullName?.trim() || undefined,
          },
        },
      });

      if (error) {
        return {
          success: false,
          error: mapSupabaseAuthErrorToSpanish(error.message),
        };
      }

      if (data.session) {
        return {
          success: true,
          hasSession: true,
          message: '¡Cuenta creada exitosamente! Redirigiendo...',
        };
      }

      return {
        success: true,
        hasSession: false,
        message:
          '¡Registro recibido! Por favor revisa tu correo electrónico para confirmar tu cuenta.',
      };
    }

    // signin mode
    const { error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthErrorToSpanish(error.message),
      };
    }

    return {
      success: true,
      hasSession: true,
      message: '¡Sesión iniciada correctamente!',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: mapSupabaseAuthErrorToSpanish(
        err instanceof Error
          ? err.message
          : 'Error al procesar la autenticación'
      ),
    };
  }
}
