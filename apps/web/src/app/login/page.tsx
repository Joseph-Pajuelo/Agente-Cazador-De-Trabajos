'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { BrandMark, BRAND_NAME } from '@/components/brand/BrandLogo';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { sanitizeNextPath } from '@/lib/auth/safeRedirect';
import {
  checkGoogleOAuthAvailability,
  mapSupabaseAuthErrorToSpanish,
  performGoogleOAuth,
  performResendConfirmation,
  performPasswordRecovery,
  performPasswordUpdate,
  performPasswordAuth,
  type AuthErrorCode,
  type GoogleOAuthAvailability,
} from '@/lib/auth/authHelpers';
import {
  AuthGoogleSection,
  AuthModeTabs,
  AuthPasswordField,
  AuthStatusBanners,
  getAuthTransitionDirection,
} from '@/components/auth/AuthFormPrimitives';

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
  const [transitionDirection, setTransitionDirection] = React.useState<
    'forward' | 'backward'
  >('forward');

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [googleStatus, setGoogleStatus] =
    React.useState<GoogleOAuthAvailability>('checking');

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

  React.useEffect(() => {
    let active = true;
    checkGoogleOAuthAvailability().then((status) => {
      if (active) setGoogleStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

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
        if (res.error.code === 'OAUTH_DISABLED') {
          setGoogleStatus('disabled');
        }
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
        } else if (res.hasSession) {
          setSuccessMessage('¡Sesión iniciada! Ingresando a tu radar...');
          router.push(safeNext);
          router.refresh();
          if (
            typeof window !== 'undefined' &&
            typeof window.location?.assign === 'function' &&
            process.env.NODE_ENV !== 'test'
          ) {
            window.location.assign(safeNext);
          }
        } else {
          setSuccessMessage(res.message || '¡Operación exitosa!');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    if (newMode === mode) return;
    setTransitionDirection(getAuthTransitionDirection(mode, newMode));
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

  const panelAnimationClass =
    transitionDirection === 'forward' ? 'auth-mode-forward' : 'auth-mode-backward';

  return (
    <div className="auth-card-enter w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl overflow-hidden">
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-3 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Volver al radar de empleos</span>
        </Link>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50/90 px-3 py-1 text-xs font-bold text-slate-900 border border-blue-200/70">
            <BrandMark size="xs" />
            <span>{BRAND_NAME}</span>
          </div>
        </div>
      </div>

      {/* Segmented Tab Switcher */}
      {(mode === 'signin' || mode === 'signup') && (
        <AuthModeTabs mode={mode} onSelectMode={switchMode} />
      )}

      {/* Animated Mode Panel */}
      <div key={mode} className={panelAnimationClass}>
        <div className="mb-5">
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

        <AuthStatusBanners
          errorMessage={errorMessage}
          errorCode={errorCode}
          successMessage={successMessage}
          isResending={isResending}
          configured={configured}
          onResendConfirmation={handleResendConfirmation}
          onSwitchMode={switchMode}
        />

        {/* Main Form (Primary) */}
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
                  touched.email && (!email.trim() || !email.includes('@'))
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
                }`}
              />
              {touched.email && (!email.trim() || !email.includes('@')) && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  Ingresa un correo electrónico válido.
                </p>
              )}
            </div>
          )}

          {(mode === 'signin' || mode === 'signup' || mode === 'update-password') && (
            <AuthPasswordField
              id="login-password"
              label={mode === 'update-password' ? 'Nueva contraseña' : 'Contraseña'}
              value={password}
              onChange={setPassword}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              showError={Boolean(touched.password && password.length < 6)}
              rightSlot={
                mode === 'signin' ? (
                  <button
                    type="button"
                    onClick={() => switchMode('recovery')}
                    className="text-xs font-medium text-blue-900 hover:underline cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                ) : undefined
              }
            />
          )}

          <button
            type="submit"
            disabled={isSubmitting || !configured}
            className="auth-btn auth-btn-primary w-full rounded-xl bg-[#2563EB] py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting
              ? mode === 'signup'
                ? 'Creando cuenta...'
                : 'Ingresando...'
              : mode === 'signin'
              ? 'Iniciar sesión'
              : mode === 'signup'
              ? 'Crear cuenta e ingresar'
              : mode === 'recovery'
              ? 'Enviar instrucciones de recuperación'
              : 'Actualizar contraseña'}
          </button>
        </form>

        {/* Google OAuth (Secondary - checks live availability cleanly) */}
        {(mode === 'signin' || mode === 'signup') && (
          <AuthGoogleSection
            googleStatus={googleStatus}
            isOAuthSubmitting={isOAuthSubmitting}
            isSubmitting={isSubmitting}
            configured={configured}
            onGoogleSignIn={handleGoogleSignIn}
          />
        )}

        {/* Toggle mode links */}
        <div className="mt-5 text-center text-xs text-slate-600">
          {mode === 'signin' && (
            <p>
              ¿No tienes una cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-semibold text-blue-900 hover:underline cursor-pointer"
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
                className="font-semibold text-blue-900 hover:underline cursor-pointer"
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
                className="font-semibold text-blue-900 hover:underline cursor-pointer"
              >
                Iniciar sesión
              </button>
            </p>
          )}
        </div>
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
