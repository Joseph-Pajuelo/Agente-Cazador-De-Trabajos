'use server';

/**
 * Server Action para el seguimiento CRM personal por usuario (`public.user_job_states`).
 * Soporta creación/actualización idempotente (`upsert`) y retorno a "Activas" (`status === null`).
 */
import { createClient, isSupabaseConfigured } from '../lib/supabase/server';
import { CrmStatus } from '../lib/domain/types';
import { crmStateSchema, type CrmStateInput } from './schemas';

export type { CrmStateInput };

export async function upsertJobState(input: {
  listingId: number;
  status: CrmStatus | null;
  notes?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  appliedAt?: string | null;
  updatedAt?: string | null;
}> {
  // 1. Validar entrada con Zod
  const parsed = crmStateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  try {
    // 2. Verificar sesión autenticada
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, error: 'AUTH_REQUIRED' };
    }

    // 3. Si status es null ("Regresar a Activas"), eliminar el registro de seguimiento
    if (parsed.data.status === null) {
      const { error: deleteError } = await supabase
        .from('user_job_states')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', parsed.data.listingId);

      if (deleteError) {
        console.error('upsertJobState delete error:', deleteError);
        return { ok: false, error: deleteError.message };
      }

      return { ok: true, appliedAt: null, updatedAt: null };
    }

    // 4. Preservar timestamp `applied_at` previo o asignarlo al pasar a 'applied'
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

    // 5. Upsert atómico sobre la restricción única (user_id, listing_id)
    const updatedAt = new Date().toISOString();
    const { error: upsertError } = await supabase.from('user_job_states').upsert(
      {
        user_id: user.id,
        listing_id: parsed.data.listingId,
        status: parsed.data.status,
        notes: (parsed.data.notes ?? '').trim(),
        applied_at: appliedAt,
        updated_at: updatedAt,
      },
      { onConflict: 'user_id,listing_id' }
    );

    if (upsertError) {
      console.error('upsertJobState database error:', upsertError);
      return { ok: false, error: upsertError.message };
    }

    return { ok: true, appliedAt, updatedAt };
  } catch (err: unknown) {
    console.error('upsertJobState exception:', err);
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
}
