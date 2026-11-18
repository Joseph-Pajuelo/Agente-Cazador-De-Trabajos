/**
 * Esquemas de validación Zod para todas las Server Actions (CRM y Perfil).
 * Garantizan integridad de tipos y rechazan campos no autorizados (.strict()).
 */
import { z } from 'zod';

// ============================================================================
// 1. Esquema de Estado CRM por Vacante (public.user_job_states)
// ============================================================================
export const crmStateSchema = z.object({
  listingId: z.number().int().positive(),
  status: z
    .enum(['to_apply', 'favorite', 'applied', 'interview', 'discarded'])
    .nullable(),
  notes: z.string().max(2000).optional(),
});

export type CrmStateInput = z.infer<typeof crmStateSchema>;

// ============================================================================
// 2. Esquema de Actualización de Perfil Profesional (public.profiles)
// ============================================================================
export const profileUpdateSchema = z
  .object({
    full_name: z.string().min(1).max(100).optional(),
    headline: z.string().max(150).optional(),
    university: z.string().max(100).optional(),
    current_cycle: z.string().max(50).optional(),
    preferred_districts: z.array(z.string().max(50)).max(50).optional(),
    excluded_districts: z.array(z.string().max(50)).max(50).optional(),
    modality_priority: z.array(z.string().max(50)).max(10).optional(),
    target_areas: z.array(z.string().max(50)).max(20).optional(),
    technical_skills: z.record(z.unknown()).optional(),
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
