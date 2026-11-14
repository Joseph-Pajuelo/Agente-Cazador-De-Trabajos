import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from './client';

type CookieOptions = Parameters<NextResponse['cookies']['set']>[2];

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export function shouldRedirectToLogin(
  pathname: string,
  hasUser: boolean
): string | null {
  if (hasUser) return null;

  const isProtected =
    pathname === '/pipeline' ||
    pathname.startsWith('/pipeline/') ||
    pathname === '/profile' ||
    pathname.startsWith('/profile/');

  if (isProtected) {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  return null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

  // Forward Supabase Site URL fallback redirects (/?code=... or /?token_hash=...&type=...)
  // directly to /auth/callback so email verification & recovery links always exchange tokens.
  if (pathname !== '/auth/callback') {
    const hasAuthCode = request.nextUrl.searchParams.has('code');
    const hasOtpToken =
      request.nextUrl.searchParams.has('token_hash') &&
      request.nextUrl.searchParams.has('type');
    if (hasAuthCode || hasOtpToken) {
      const callbackUrl = request.nextUrl.clone();
      callbackUrl.pathname = '/auth/callback';
      return NextResponse.redirect(callbackUrl);
    }
  }

  if (!isSupabaseConfigured()) {
    const redirectUrl = shouldRedirectToLogin(pathname, false);
    if (redirectUrl) {
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
    return response;
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const redirectUrl = shouldRedirectToLogin(pathname, Boolean(user));
    if (redirectUrl) {
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  } catch (error) {
    console.error('Supabase middleware auth check failed:', error);
  }

  return response;
}
