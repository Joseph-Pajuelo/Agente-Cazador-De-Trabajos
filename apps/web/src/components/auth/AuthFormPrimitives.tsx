'use client';

import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import type {
  AuthErrorCode,
  GoogleOAuthAvailability,
} from '@/lib/auth/authHelpers';

/**
 * Computes slide direction when transitioning between auth modes so
 * `signin -> signup -> recovery` slides forward and reversing slides backward.
 */
export function getAuthTransitionDirection(
  fromMode: string,
  toMode: string
): 'forward' | 'backward' {
  const rank: Record<string, number> = {
    signin: 0,
    signup: 1,
    recovery: 2,
    'update-password': 3,
  };
  return (rank[toMode] ?? 0) >= (rank[fromMode] ?? 0) ? 'forward' : 'backward';
}

export interface AuthModeTabsProps {
  mode: 'signin' | 'signup';
  onSelectMode: (mode: 'signin' | 'signup') => void;
}

/**
 * Segmented control switching cleanly between Sign In and Sign Up with a GPU-translated pill indicator.
 */
export function AuthModeTabs({ mode, onSelectMode }: AuthModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Modo de acceso"
      className="relative mb-5 grid grid-cols-2 rounded-xl bg-slate-100/90 p-1 border border-slate-200/80"
    >
      <div
        aria-hidden="true"
        className={`auth-tab-indicator pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-xs border border-slate-200/70 ${
          mode === 'signup' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'signin'}
        onClick={() => onSelectMode('signin')}
        className={`auth-tab-label relative z-10 rounded-lg py-2 text-xs sm:text-sm font-bold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
          mode === 'signin'
            ? 'text-[#1E3A8A]'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Iniciar sesión
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'signup'}
        onClick={() => onSelectMode('signup')}
        className={`auth-tab-label relative z-10 rounded-lg py-2 text-xs sm:text-sm font-bold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
          mode === 'signup'
            ? 'text-[#1E3A8A]'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Crear cuenta
      </button>
    </div>
  );
}

export interface AuthStatusBannersProps {
  errorMessage: string | null;
  errorCode: AuthErrorCode | null;
  successMessage: string | null;
  isResending: boolean;
  configured: boolean;
  onResendConfirmation: () => void;
  onSwitchMode: (mode: 'signin' | 'signup' | 'recovery') => void;
}

/**
 * Accessible animated feedback banners with direct recovery shortcuts for common Supabase auth errors.
 */
export function AuthStatusBanners({
  errorMessage,
  errorCode,
  successMessage,
  isResending,
  configured,
  onResendConfirmation,
  onSwitchMode,
}: AuthStatusBannersProps) {
  return (
    <>
      {errorMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="auth-feedback-enter mb-4 rounded-xl border border-red-200 bg-red-50/95 p-3.5 text-xs text-red-900 flex flex-col gap-2"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>

          {errorCode === 'EMAIL_NOT_CONFIRMED' && (
            <div className="pl-6">
              <button
                type="button"
                onClick={onResendConfirmation}
                disabled={isResending || !configured}
                className="inline-flex items-center gap-1.5 font-semibold text-red-900 underline hover:text-red-950 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isResending ? 'animate-spin' : ''}`}
                />
                <span>Reenviar correo de confirmación</span>
              </button>
            </div>
          )}

          {errorCode === 'USER_ALREADY_EXISTS' && (
            <div className="flex flex-wrap gap-2 pl-6 pt-0.5">
              <button
                type="button"
                onClick={() => onSwitchMode('signin')}
                className="auth-btn inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#1E3A8A] border border-red-200 hover:bg-blue-50 cursor-pointer"
              >
                <LogIn className="h-3 w-3" />
                <span>Ir a Iniciar sesión</span>
              </button>
              <button
                type="button"
                onClick={() => onSwitchMode('recovery')}
                className="auth-btn inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                <KeyRound className="h-3 w-3" />
                <span>Restablecer contraseña</span>
              </button>
            </div>
          )}

          {errorCode === 'INVALID_CREDENTIALS' && (
            <div className="pl-6">
              <button
                type="button"
                onClick={() => onSwitchMode('recovery')}
                className="inline-flex items-center gap-1.5 font-semibold text-red-900 underline hover:text-red-950 transition-colors cursor-pointer"
              >
                <KeyRound className="h-3 w-3" />
                <span>¿Olvidaste tu contraseña? Recupérala aquí</span>
              </button>
            </div>
          )}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="auth-feedback-enter mb-4 rounded-xl border border-emerald-200 bg-emerald-50/95 p-3.5 text-xs text-emerald-900 flex items-start gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <span className="leading-relaxed">{successMessage}</span>
        </div>
      )}
    </>
  );
}

export interface AuthPasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  autoComplete: string;
  showError: boolean;
  rightSlot?: React.ReactNode;
}

/**
 * Password field with client validation message and an accessible visibility toggle.
 */
export function AuthPasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  autoComplete,
  showError,
  rightSlot,
}: AuthPasswordFieldProps) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-700"
        >
          {label}
        </label>
        {rightSlot}
      </div>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          id={id}
          name="password"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder="••••••••"
          minLength={6}
          className={`w-full rounded-xl border pl-3.5 pr-10 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-1 ${
            showError
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600'
          }`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={showPassword}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {showError && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          La contraseña debe tener al menos 6 caracteres.
        </p>
      )}
    </div>
  );
}

export interface AuthGoogleSectionProps {
  googleStatus: GoogleOAuthAvailability;
  isOAuthSubmitting: boolean;
  isSubmitting: boolean;
  configured: boolean;
  onGoogleSignIn: () => void;
}

/**
 * Renders the secondary Google OAuth button, disabling navigation gracefully when Supabase
 * reports Google OAuth is disabled instead of letting users crash onto a raw 400 JSON response.
 */
export function AuthGoogleSection({
  googleStatus,
  isOAuthSubmitting,
  isSubmitting,
  configured,
  onGoogleSignIn,
}: AuthGoogleSectionProps) {
  const isDisabledProvider = googleStatus === 'disabled';

  return (
    <>
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-500 font-medium">
            o también
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={
          isDisabledProvider ||
          isOAuthSubmitting ||
          isSubmitting ||
          !configured
        }
        aria-disabled={isDisabledProvider}
        className={`auth-btn flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          isDisabledProvider
            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-85'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer'
        }`}
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill={isDisabledProvider ? '#94A3B8' : '#4285F4'}
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill={isDisabledProvider ? '#CBD5E1' : '#34A853'}
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill={isDisabledProvider ? '#CBD5E1' : '#FBBC05'}
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill={isDisabledProvider ? '#94A3B8' : '#EA4335'}
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>
          {isOAuthSubmitting
            ? 'Conectando con Google...'
            : 'Continuar con Google'}
        </span>
        {isDisabledProvider && (
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            Deshabilitado
          </span>
        )}
      </button>

      {isDisabledProvider && (
        <p className="mt-2 text-center text-[11px] text-slate-500 leading-snug">
          El acceso con Google está deshabilitado temporalmente; usa tu correo y
          contraseña arriba.
        </p>
      )}
    </>
  );
}
