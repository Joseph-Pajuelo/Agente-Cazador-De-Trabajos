'use server';

import { createClient, isSupabaseConfigured } from '../lib/supabase/server';
import { profileUpdateSchema, type ProfileUpdateInput } from './schemas';

export type { ProfileUpdateInput };

export async function validateProfileUpdatePayload(payload: unknown): Promise<{
  ok: boolean;
  data?: ProfileUpdateInput;
  error?: string;
}> {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'INVALID_PAYLOAD' };
  }

  const raw = payload as Record<string, unknown>;
  if ('is_admin' in raw || 'isAdmin' in raw) {
    return { ok: false, error: 'FORBIDDEN_FIELD' };
  }

  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  return { ok: true, data: parsed.data };
}

export async function updateProfile(
  input: ProfileUpdateInput
): Promise<{ ok: boolean; error?: string }> {
  const validation = await validateProfileUpdatePayload(input);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.error || 'INVALID_INPUT' };
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

    const d = validation.data;
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (d.full_name !== undefined) updateData.full_name = d.full_name.trim();
    if (d.headline !== undefined) updateData.headline = d.headline.trim();
    if (d.university !== undefined) updateData.university = d.university.trim();
    if (d.current_cycle !== undefined) updateData.current_cycle = d.current_cycle.trim();
    else if (d.cycle_label !== undefined) updateData.current_cycle = d.cycle_label.trim();

    if (d.preferred_districts !== undefined) updateData.preferred_districts = d.preferred_districts;
    else if (d.target_districts !== undefined) updateData.preferred_districts = d.target_districts;

    if (d.excluded_districts !== undefined) updateData.excluded_districts = d.excluded_districts;

    if (d.modality_priority !== undefined) updateData.modality_priority = d.modality_priority;
    if (d.target_areas !== undefined) updateData.target_areas = d.target_areas;

    if (d.technical_skills !== undefined) updateData.technical_skills = d.technical_skills;
    else if (d.skills_json !== undefined) updateData.technical_skills = d.skills_json;

    // Explicitly guarantee is_admin is NEVER included
    delete updateData.is_admin;
    delete updateData.isAdmin;

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.error('updateProfile database error:', updateError);
      return { ok: false, error: updateError.message };
    }

    return { ok: true };
  } catch (err: unknown) {
    console.error('updateProfile exception:', err);
    return { ok: false, error: 'AUTH_REQUIRED' };
  }
}

export const updateUserProfile = updateProfile;
