import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { isSupabaseConfigured } from './client';

export { isSupabaseConfigured };

type CookieOptions = Parameters<Awaited<ReturnType<typeof cookies>>['set']>[2];

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Stateless Supabase client for querying public catalog tables (`job_listings`,
 * `job_evaluations`) without reading dynamic request cookies (safe inside `unstable_cache`).
 */
export function createPublicClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Deduplicates `supabase.auth.getUser()` per server request via React `cache()`
 * and skips the remote Auth roundtrip completely when no `sb-*` cookie exists.
 */
export const getCachedServerUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore
      .getAll()
      .some((cookie) => cookie.name.startsWith('sb-'));
    if (!hasAuthCookie) {
      return null;
    }
  } catch {
    // Outside a Next.js request store, fall through to createClient().
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
});

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
