'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, AlertCircle, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { sanitizeNextPath } from '@/lib/auth/safeRedirect';
import {
  mapSupabaseAuthErrorToSpanish,
  performGoogleOAuth,
  performResendConfirmation,
  performPasswordRecovery,
  performPasswordUpdate,
  performPasswordAuth,
  type AuthErrorCode,
} from '@/lib/auth/authHelpers';

type AuthMode = 'signin' | 'signup' | 'recovery' | 'update-password';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Validate next url for safe relative redirect (prevents backslash and open-redirect bypasses)
  const safeNext = sanitizeNextPath(searchParams.get('next'));
  const urlMode = searchParams.get('mode');
  const urlError = searchParams.get('error');

  const [mode, setMode] = React.useState<AuthMode>(() => {
    if (urlMode === 'update-password') return 'update-password';
    if (urlMode === 'recovery') return 'recovery';
    if (urlMode === 'signup') return 'signup';
    return 'signin';
  });

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);

  const [errorMessage, setErrorMessage] = React.useState<string | null>(() => {
    if (urlError) {
      return mapSupabaseAuthErrorToSpanish(urlError).message;
    }
    return null;
  });
  const [errorCode, setErrorCode] = React.useState<AuthErrorCode | null>(() => {
    if (urlError) {
      return mapSupabaseAuthErrorToSpanish(urlError).code;
    }
    return null;
  });
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const [touched, setTouched] = React.useState<{
    email?: boolean;
    password?: boolean;
    fullName?: boolean;
  }>({});

  const configured = isSupabaseConfigured();

  const handleGoogleSignIn = async () => {
    setIsOAuthSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      const res = await performGoogleOAuth({
        origin: window.location.origin,
        nextPath: safeNext,
      });

      if (!res.success && res.error) {
        setErrorMessage(res.error.message);
        setErrorCode(res.error.code);
      }
    } finally {
      setIsOAuthSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    setIsResending(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      const res = await performResendConfirmation({
        email,
        origin: window.location.origin,
        nextPath: safeNext,
      });

      if (!res.success && res.error) {
        setErrorMessage(res.error.message);
        setErrorCode(res.error.code);
      } else if (res.message) {
        setSuccessMessage(res.message);
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched({ email: true, password: true, fullName: true });

    setIsSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);
    setSuccessMessage(null);

    try {
      if (mode === 'recovery') {
        const res = await performPasswordRecovery({
          email,
          origin: window.location.origin,
        });

        if (!res.success && res.error) {
          setErrorMessage(res.error.message);
          setErrorCode(res.error.code);
        } else if (res.message) {
          setSuccessMessage(res.message);
        }
      } else if (mode === 'update-password') {
        const res = await performPasswordUpdate({ password });

        if (!res.success && res.error) {
          setErrorMessage(res.error.message);
          setErrorCode(res.error.code);
        } else {
          setSuccessMessage(
            res.message || '¡Contraseña actualizada correctamente! Redirigiendo...'
          );
          setTimeout(() => {
            router.push(safeNext);
            router.refresh();
          }, 800);
        }
      } else {
        const res = await performPasswordAuth({
          mode,
          email,
          password,
          fullName,
          origin: window.location.origin,
          nextPath: safeNext,
        });

        if (!res.success && res.error) {
          setErrorMessage(res.error.message);
          setErrorCode(res.error.code);
        } else {
          setSuccessMessage(res.message || '¡Operación exitosa!');
          if (res.hasSession) {
            setTimeout(() => {
              router.push(safeNext);
              router.refresh();
            }, mode === 'signup' ? 800 : 600);
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setErrorCode(null);
    setSuccessMessage(null);
    setTouched({});
  };

  const getHeading = () => {
    switch (mode) {
      case 'signin':
        return 'Iniciar sesión';
      case 'signup':
        return 'Crear tu cuenta';
      case 'recovery':
        return 'Recuperar contraseña';
      case 'update-password':
        return 'Nueva contraseña';
    }
  };

  const getSubheading = () => {
    switch (mode) {
      case 'signin':
      case 'signup':
        return 'Accede a tu pipeline de postulaciones y notas personales';
      case 'recovery':
        return 'Ingresa tu correo para recibir las instrucciones de recuperación';
      case 'update-password':
        return 'Ingresa tu nueva contraseña para acceder a tu radar personal';
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Volver al radar de empleos</span>
        </Link>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 border border-blue-200/60 mb-2">
          <Sparkles className="h-3 w-3 text-blue-700" />
          Job Hunter Agent
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {getHeading()}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{getSubheading()}</p>
      </div>

      {!configured && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong className="font-semibold">Modo Local / Sin Conexión:</strong> Supabase no está
            configurado. El catálogo público de vacantes en{' '}
            <Link href="/" className="underline font-semibold">
              /
            </Link>{' '}
            sigue disponible en modo lectura.
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex flex-col gap-1.5"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
          {errorCode === 'EMAIL_NOT_CONFIRMED' && (
            <div className="pt-1 pl-6">
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={isResending || !configured}
                className="inline-flex items-center gap-1.5 font-semibold text-red-900 underline hover:text-red-950 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isResending ? 'animate-spin' : ''}`}
                />
                <span>Reenviar correo de confirmación</span>
              </button>
            </div>
          )}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-start gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Google OAuth (only for signin and signup modes) */}
      {(mode === 'signin' || mode === 'signup') && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isOAuthSubmitting || isSubmitting || !configured}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>
              {isOAuthSubmitting ? 'Conectando con Google...' : 'Continuar con Google'}
            </span>
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-slate-600 font-medium">o con correo</span>
            </div>
          </div>
        </>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label
              htmlFor="login-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Nombre completo
            </label>
            <input
              type="text"
              id="login-name"
              name="fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
              autoComplete="name"
              placeholder="Ej. Ana Lucía Pérez"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
        )}

        {(mode === 'signin' || mode === 'signup' || mode === 'recovery') && (
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Correo electrónico
            </label>
            <input
              type="email"
              id="login-email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              autoComplete="email"
              spellCheck={false}
              placeholder="tu.correo@universidad.edu.pe"
              className={`w-full rounded-xl border px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-1 ${
                touched.email && !email
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
              }`}
            />
            {touched.email && !email && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                Ingresa un correo electrónico válido.
              </p>
            )}
          </div>
        )}

        {(mode === 'signin' || mode === 'signup' || mode === 'update-password') && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700"
              >
                {mode === 'update-password' ? 'Nueva contraseña' : 'Contraseña'}
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('recovery')}
                  className="text-xs font-medium text-blue-900 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
            </div>
            <input
              type="password"
              id="login-password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              autoComplete={
                mode === 'signin'
                  ? 'current-password'
                  : mode === 'update-password'
                  ? 'new-password'
                  : 'new-password'
              }
              placeholder="••••••••"
              minLength={6}
              className={`w-full rounded-xl border px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-1 ${
                touched.password && password.length < 6
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
              }`}
            />
            {touched.password && password.length < 6 && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                La contraseña debe tener al menos 6 caracteres.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !configured}
          className="w-full rounded-xl bg-blue-900 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 transition-colors"
        >
          {isSubmitting
            ? 'Procesando...'
            : mode === 'signin'
            ? 'Iniciar sesión'
            : mode === 'signup'
            ? 'Crear cuenta'
            : mode === 'recovery'
            ? 'Enviar instrucciones de recuperación'
            : 'Actualizar contraseña'}
        </button>
      </form>

      {/* Toggle mode links */}
      <div className="mt-6 text-center text-xs text-slate-600">
        {mode === 'signin' && (
          <p>
            ¿No tienes una cuenta?{' '}
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="font-semibold text-blue-900 hover:underline"
            >
              Regístrate gratis
            </button>
          </p>
        )}
        {mode === 'signup' && (
          <p>
            ¿Ya tienes una cuenta?{' '}
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="font-semibold text-blue-900 hover:underline"
            >
              Inicia sesión
            </button>
          </p>
        )}
        {(mode === 'recovery' || mode === 'update-password') && (
          <p>
            ¿Deseas volver?{' '}
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="font-semibold text-blue-900 hover:underline"
            >
              Iniciar sesión
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 sm:p-6 bg-slate-50">
      <Suspense fallback={<div className="text-sm text-slate-600">Cargando formulario...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
