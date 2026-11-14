'use server';

import { createClient, isSupabaseConfigured } from '../lib/supabase/server';
import { CrmStatus } from '../lib/domain/types';
import { crmStateSchema, type CrmStateInput } from './schemas';

export type { CrmStateInput };

export async function upsertJobState(input: {
  listingId: number;
  status: CrmStatus;
  notes?: string;
}): Promise<{ ok: boolean; error?: string; appliedAt?: string | null }> {
  const parsed = crmStateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, error: 'AUTH_REQUIRED' };
    }

    // Determine applied_at timestamp
    let appliedAt: string | null = null;
    const { data: existing } = await supabase
      .from('user_job_states')
      .select('applied_at')
      .eq('user_id', user.id)
      .eq('listing_id', parsed.data.listingId)
      .maybeSingle();

    if (parsed.data.status === 'applied') {
      appliedAt = existing?.applied_at || new Date().toISOString();
    } else {
      appliedAt = existing?.applied_at ?? null;
    }

    const { error: upsertError } = await supabase.from('user_job_states').upsert(
      {
        user_id: user.id,
        listing_id: parsed.data.listingId,
        status: parsed.data.status,
        notes: (parsed.data.notes ?? '').trim(),
        applied_at: appliedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,listing_id' }
    );

    if (upsertError) {
      console.error('upsertJobState database error:', upsertError);
      return { ok: false, error: upsertError.message };
    }

    return { ok: true, appliedAt };
  } catch (err: unknown) {
    console.error('upsertJobState exception:', err);
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
}
