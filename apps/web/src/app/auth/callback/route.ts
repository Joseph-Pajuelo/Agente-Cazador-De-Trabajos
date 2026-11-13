import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { parseCallbackParams } from '@/lib/auth/authHelpers';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsed = parseCallbackParams(requestUrl.searchParams);

  // If OAuth or provider returned an error, redirect directly to /login with error param
  if (parsed.mode === 'error') {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(parsed.errorMessage || 'auth_failed')}`,
        request.url
      )
    );
  }

  // If Supabase is not configured or callback is empty, safely fallback to next path
  if (!isSupabaseConfigured() || parsed.mode === 'empty') {
    return NextResponse.redirect(new URL(parsed.next, request.url));
  }

  try {
    const supabase = await createClient();

    if (parsed.mode === 'pkce' && parsed.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);

      if (error) {
        console.error('Error exchanging auth code for session:', error);
        return NextResponse.redirect(
          new URL(
            `/login?error=${encodeURIComponent(error.message || 'auth_failed')}`,
            request.url
          )
        );
      }

      return NextResponse.redirect(new URL(parsed.next, request.url));
    }

    if (parsed.mode === 'otp' && parsed.tokenHash && parsed.type) {
      const { error } = await supabase.auth.verifyOtp({
        type: parsed.type,
        token_hash: parsed.tokenHash,
      });

      if (error) {
        console.error('Error verifying auth OTP token:', error);
        return NextResponse.redirect(
          new URL(
            `/login?error=${encodeURIComponent(error.message || 'auth_failed')}`,
            request.url
          )
        );
      }

      return NextResponse.redirect(new URL(parsed.next, request.url));
    }

    return NextResponse.redirect(new URL(parsed.next, request.url));
  } catch (err) {
    console.error('Auth callback exception:', err);
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed`, request.url)
    );
  }
}
