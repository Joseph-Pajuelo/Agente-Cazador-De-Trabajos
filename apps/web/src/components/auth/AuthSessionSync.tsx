'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export interface AuthRefreshDecision {
  shouldRefresh: boolean;
  nextUserId: string | null | undefined;
}

/**
 * Determines whether a Supabase auth event represents a real identity transition
 * requiring a Next.js Server Component refresh. Prevents spurious `router.refresh()`
 * calls when `@supabase/auth-js` re-emits `SIGNED_IN` on browser tab focus (`visibilitychange`).
 */
export function resolveAuthRefreshAction(
  event: string,
  prevUserId: string | null | undefined,
  nextUserId: string | null
): AuthRefreshDecision {
  if (event === 'INITIAL_SESSION') {
    return { shouldRefresh: false, nextUserId };
  }

  if (event === 'SIGNED_IN') {
    if (prevUserId === undefined) {
      return { shouldRefresh: false, nextUserId };
    }
    return {
      shouldRefresh: prevUserId !== nextUserId,
      nextUserId,
    };
  }

  if (event === 'SIGNED_OUT') {
    return {
      shouldRefresh: prevUserId !== null && prevUserId !== undefined,
      nextUserId: null,
    };
  }

  if (event === 'USER_UPDATED') {
    return {
      shouldRefresh: true,
      nextUserId,
    };
  }

  return { shouldRefresh: false, nextUserId: prevUserId };
}

/**
 * Headless client component that listens for Supabase auth state transitions
 * and syncs server-side session cookies only when identity actually changes.
 */
export function AuthSessionSync(): null {
  const router = useRouter();
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

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
      } = supabase.auth.onAuthStateChange((event, session) => {
        const decision = resolveAuthRefreshAction(
          event,
          lastUserIdRef.current,
          session?.user?.id ?? null
        );
        lastUserIdRef.current = decision.nextUserId;
        if (decision.shouldRefresh) {
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
