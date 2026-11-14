'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  checkGoogleOAuthAvailability,
  isPointerEventOutsideRect,
  performGoogleOAuth,
  performResendConfirmation,
  performPasswordRecovery,
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

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
  actionPrompt?: string;
  next?: string;
  onAuthSuccess?: (user: { id: string; email?: string | null }) => void;
}

export function AuthModal({
  isOpen,
  onClose,
  defaultMode = 'signin',
  actionPrompt = 'Inicia sesión para guardar esta vacante en tu radar personal',
  next,
  onAuthSuccess,
}: AuthModalProps) {
  const router = useRouter();
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const pointerDownOutsideRef = React.useRef<boolean>(false);

  const [mode, setMode] = React.useState<'signin' | 'signup' | 'recovery'>(
    defaultMode
  );
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

  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<AuthErrorCode | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Field touch state for post-interaction validation
  const [touched, setTouched] = React.useState<{
    email?: boolean;
    password?: boolean;
    fullName?: boolean;
  }>({});

  const configured = isSupabaseConfigured();

  const getEffectiveNextPath = React.useCallback(() => {
    if (next) return next;
    if (typeof window !== 'undefined') {
      return window.location.pathname + window.location.search;
    }
    return '/';
  }, [next]);

  const handleClose = React.useCallback(() => {
    if (dialogRef.current) {
      dialogRef.current.returnValue = '';
    }
    onClose();
  }, [onClose]);

  // Sync modal state with native <dialog>
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Sync mode, state, and Google OAuth capability when opening
  React.useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode);
    setTransitionDirection('forward');
    setErrorMessage(null);
    setErrorCode(null);
    setSuccessMessage(null);
    setTouched({});

    let active = true;
    checkGoogleOAuthAvailability().then((status) => {
      if (active) setGoogleStatus(status);
    });
    return () => {
      active = false;
    };
  }, [isOpen, defaultMode]);

  // Safe light-dismiss: only trigger if BOTH pointerdown AND pointerup occurred strictly outside the bounding box
  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) {
      pointerDownOutsideRef.current = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    pointerDownOutsideRef.current = isPointerEventOutsideRect(
      rect,
      e.clientX,
      e.clientY
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) {
      pointerDownOutsideRef.current = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const pointerUpOutside = isPointerEventOutsideRect(
      rect,
      e.clientX,
      e.clientY
    );

    if (pointerDownOutsideRef.current && pointerUpOutside) {
      handleClose();
    }
    pointerDownOutsideRef.current = false;
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    handleClose();
  };

  const switchMode = (newMode: 'signin' | 'signup' | 'recovery') => {
    if (newMode === mode) return;
    setTransitionDirection(getAuthTransitionDirection(mode, newMode));
    setMode(newMode);
    setErrorMessage(null);
    setErrorCode(null);
    setSuccessMessage(null);
    setTouched({});
  };

  const handleGoogleSignIn = async () => {
    setIsOAuthSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      const res = await performGoogleOAuth({
        origin: window.location.origin,
        nextPath: getEffectiveNextPath(),
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
        nextPath: getEffectiveNextPath(),
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
      } else {
        const res = await performPasswordAuth({
          mode,
          email,
          password,
          fullName,
          origin: window.location.origin,
          nextPath: getEffectiveNextPath(),
        });

        if (!res.success && res.error) {
          setErrorMessage(res.error.message);
          setErrorCode(res.error.code);
        } else if (res.hasSession) {
          const authedUser = res.user || {
            id: 'authenticated',
            email: email.trim(),
          };
          onAuthSuccess?.(authedUser);
          handleClose();
          router.refresh();
        } else {
          setSuccessMessage(res.message || '¡Operación exitosa!');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getHeading = () => {
    switch (mode) {
      case 'signin':
        return 'Iniciar sesión';
      case 'signup':
        return 'Crear tu cuenta';
      case 'recovery':
        return 'Recuperar contraseña';
    }
  };

  const panelAnimationClass =
    transitionDirection === 'forward' ? 'auth-mode-forward' : 'auth-mode-backward';

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      aria-labelledby="auth-modal-title"
      className="auth-modal-dialog m-auto rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs max-w-md w-full border border-slate-200 text-slate-900 overscroll-contain overflow-hidden"
    >
      <div className="relative p-6 sm:p-8">
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="auth-btn absolute right-4 top-4 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
          aria-label="Cerrar ventana de inicio de sesión"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Pill Badge */}
        <div className="mb-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 border border-blue-200/60">
            <Sparkles className="h-3 w-3 text-blue-700" />
            Acceso a tu Radar Personal
          </div>
        </div>

        {/* Segmented Tab Switcher (with gliding indicator) */}
        {(mode === 'signin' || mode === 'signup') && (
          <AuthModeTabs mode={mode} onSelectMode={switchMode} />
        )}

        {/* Animated Header + Form Container */}
        <div key={mode} className={panelAnimationClass}>
          <div className="mb-5">
            <h2
              id="auth-modal-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900"
            >
              {getHeading()}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              {mode === 'recovery'
                ? 'Ingresa tu correo para recibir las instrucciones de recuperación'
                : actionPrompt}
            </p>
          </div>

          {/* Supabase Unconfigured Warning */}
          {!configured && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong className="font-semibold">Modo Demostración / Lectura:</strong> Supabase
                aún no está configurado en las variables de entorno. Puedes explorar el radar
                públicamente. Para guardar notas o postular, añade tus credenciales en{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env.local</code>.
              </div>
            </div>
          )}

          {/* Error / Success Feedback */}
          <AuthStatusBanners
            errorMessage={errorMessage}
            errorCode={errorCode}
            successMessage={successMessage}
            isResending={isResending}
            configured={configured}
            onResendConfirmation={handleResendConfirmation}
            onSwitchMode={switchMode}
          />

          {/* Email/Password Form (Primary) */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-modal-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nombre completo
                </label>
                <input
                  type="text"
                  id="auth-modal-name"
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

            <div>
              <label
                htmlFor="auth-modal-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Correo electrónico
              </label>
              <input
                type="email"
                id="auth-modal-email"
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

            {(mode === 'signin' || mode === 'signup') && (
              <AuthPasswordField
                id="auth-modal-password"
                label="Contraseña"
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
                : 'Enviar instrucciones de recuperación'}
            </button>
          </form>

          {/* Google OAuth Button (Secondary - checks live availability cleanly) */}
          {(mode === 'signin' || mode === 'signup') && (
            <AuthGoogleSection
              googleStatus={googleStatus}
              isOAuthSubmitting={isOAuthSubmitting}
              isSubmitting={isSubmitting}
              configured={configured}
              onGoogleSignIn={handleGoogleSignIn}
            />
          )}

          {/* Toggle Mode footer links */}
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
            {mode === 'recovery' && (
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
    </dialog>
  );
}
