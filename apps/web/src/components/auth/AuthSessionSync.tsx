'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * Headless client component that listens for Supabase auth state transitions
 * (SIGNED_IN, SIGNED_OUT, USER_UPDATED) and syncs server-side session cookies
 * by triggering a Next.js router.refresh().
 */
export function AuthSessionSync(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      const supabase = createClient();
      if (!supabase?.auth) {
        return;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT' ||
          event === 'USER_UPDATED'
        ) {
          router.refresh();
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch (err) {
      console.error('Failed to initialize AuthSessionSync:', err);
    }
  }, [router]);

  return null;
}
