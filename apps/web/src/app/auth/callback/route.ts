import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') || '/';

  // Strict check for relative redirect to prevent open redirect vulnerabilities
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL(safeNext, request.url));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Error exchanging auth code for session:', error);
      return NextResponse.redirect(
        new URL(`/login?error=auth_failed`, request.url)
      );
    }

    return NextResponse.redirect(new URL(safeNext, request.url));
  } catch (err) {
    console.error('OAuth callback exception:', err);
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed`, request.url)
    );
  }
}
