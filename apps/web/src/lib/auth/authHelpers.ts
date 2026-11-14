import type { EmailOtpType } from '@supabase/supabase-js';
import { sanitizeNextPath } from '@/lib/auth/safeRedirect';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export type AuthErrorCode =
  | 'EMAIL_NOT_CONFIRMED'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'OAUTH_DISABLED'
  | 'USER_ALREADY_EXISTS'
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
      message:
        'El proveedor de autenticación no está habilitado. Inicia sesión o regístrate con tu correo y contraseña.',
    };
  }

  if (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('user already exists') ||
    normalized.includes('ya está registrado')
  ) {
    return {
      code: 'USER_ALREADY_EXISTS',
      message:
        'Este correo ya tiene una cuenta registrada. Inicia sesión con tu contraseña anterior o recupérala si no la recuerdas.',
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
  user?: { id: string; email?: string | null } | null;
  data?: T;
  error?: MappedAuthError;
}

export type GoogleOAuthAvailability = 'checking' | 'enabled' | 'disabled' | 'unknown';

interface SupabaseAuthSettingsResponse {
  external?: {
    google?: boolean;
  };
}

let cachedGoogleAvailability: { value: 'enabled' | 'disabled'; checkedAt: number } | null = null;
const GOOGLE_AVAILABILITY_TTL_MS = 60_000;

/**
 * Checks Supabase GoTrue public /auth/v1/settings to verify whether Google OAuth
 * is currently enabled before redirecting the user off-app to a raw JSON 400 error.
 */
export async function checkGoogleOAuthAvailability(options?: {
  timeoutMs?: number;
  forceRefresh?: boolean;
}): Promise<'enabled' | 'disabled' | 'unknown'> {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) {
    return 'unknown';
  }

  const now = Date.now();
  if (
    !options?.forceRefresh &&
    cachedGoogleAvailability &&
    now - cachedGoogleAvailability.checkedAt < GOOGLE_AVAILABILITY_TTL_MS
  ) {
    return cachedGoogleAvailability.value;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    return 'unknown';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 2500);

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: { apikey: anonKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      return 'unknown';
    }

    const payload = (await response.json()) as SupabaseAuthSettingsResponse;
    const status = payload?.external?.google === true ? 'enabled' : 'disabled';
    cachedGoogleAvailability = { value: status, checkedAt: Date.now() };
    return status;
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
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
    // Only pre-check live Supabase settings in real browser runtime (not injected test mocks)
    if (!params.client) {
      const googleStatus = await checkGoogleOAuthAvailability({ forceRefresh: true });
      if (googleStatus === 'disabled') {
        return {
          success: false,
          error: {
            code: 'OAUTH_DISABLED',
            message:
              'El acceso con Google está deshabilitado temporalmente. Inicia sesión o regístrate con tu correo y contraseña.',
          },
        };
      }
    }

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
  const cleanEmail = params.email.trim();
  if (!cleanEmail) {
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
      email: cleanEmail,
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
  const cleanEmail = params.email.trim();
  if (!cleanEmail) {
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

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
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
  const cleanEmail = params.email.trim();

  if (!cleanEmail || !params.password) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Por favor completa todos los campos requeridos.',
      },
    };
  }

  if (!cleanEmail.includes('@')) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'Ingresa un correo electrónico válido.',
      },
    };
  }

  if (params.password.length < 6) {
    return {
      success: false,
      error: {
        code: 'GENERIC',
        message: 'La contraseña debe tener al menos 6 caracteres.',
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
        email: cleanEmail,
        password: params.password,
        options: {
          emailRedirectTo,
          data: {
            full_name: params.fullName?.trim() || undefined,
          },
        },
      });

      if (error) {
        const lowerErr = (error.message || '').toLowerCase();
        if (
          lowerErr.includes('already registered') ||
          lowerErr.includes('already been registered') ||
          lowerErr.includes('user already exists') ||
          lowerErr.includes('ya está registrado')
        ) {
          if (typeof supabase.auth.signInWithPassword === 'function') {
            const fallbackSignIn = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password: params.password,
            });
            if (!fallbackSignIn.error && fallbackSignIn.data?.session) {
              return {
                success: true,
                hasSession: true,
                user: fallbackSignIn.data.user
                  ? {
                      id: fallbackSignIn.data.user.id,
                      email: fallbackSignIn.data.user.email,
                    }
                  : { id: 'authenticated', email: cleanEmail },
                message: '¡Sesión iniciada correctamente!',
              };
            }
          }

          return {
            success: false,
            error: {
              code: 'USER_ALREADY_EXISTS',
              message:
                'Este correo ya tiene una cuenta registrada. Inicia sesión con tu contraseña anterior o recupérala si no la recuerdas.',
            },
          };
        }
        return {
          success: false,
          error: mapSupabaseAuthErrorToSpanish(error.message),
        };
      }

      if (data?.session) {
        return {
          success: true,
          hasSession: true,
          user: data.user
            ? { id: data.user.id, email: data.user.email }
            : { id: 'authenticated', email: cleanEmail },
          message: '¡Cuenta creada exitosamente! Ingresando...',
        };
      }

      const isRepeatedSignup = Boolean(
        data?.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
      );

      if (typeof supabase.auth.signInWithPassword === 'function') {
        const signInAttempt = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: params.password,
        });
        if (!signInAttempt.error && signInAttempt.data?.session) {
          return {
            success: true,
            hasSession: true,
            user: signInAttempt.data.user
              ? {
                  id: signInAttempt.data.user.id,
                  email: signInAttempt.data.user.email,
                }
              : { id: 'authenticated', email: cleanEmail },
            message: '¡Cuenta creada e iniciada exitosamente! Ingresando...',
          };
        }
      }

      if (isRepeatedSignup) {
        return {
          success: false,
          error: {
            code: 'USER_ALREADY_EXISTS',
            message:
              'Este correo ya tiene una cuenta registrada. Inicia sesión con tu contraseña anterior o usa «¿Olvidaste tu contraseña?» para restablecerla.',
          },
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
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: params.password,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseAuthErrorToSpanish(error.message),
      };
    }

    if (signInData !== undefined && !signInData.session && !signInData.user) {
      return {
        success: false,
        error: {
          code: 'GENERIC',
          message: 'No se pudo iniciar la sesión. Intenta nuevamente.',
        },
      };
    }

    return {
      success: true,
      hasSession: true,
      user: signInData?.user
        ? { id: signInData.user.id, email: signInData.user.email }
        : { id: 'authenticated', email: cleanEmail },
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
