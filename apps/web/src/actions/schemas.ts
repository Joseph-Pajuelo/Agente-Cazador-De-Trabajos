import { z } from 'zod';

export const crmStateSchema = z.object({
  listingId: z.number().int().positive(),
  status: z.enum(['to_apply', 'favorite', 'applied', 'interview', 'discarded']),
  notes: z.string().max(2000).optional(),
});

export type CrmStateInput = z.infer<typeof crmStateSchema>;

export const profileUpdateSchema = z
  .object({
    full_name: z.string().min(1).max(100).optional(),
    headline: z.string().max(150).optional(),
    university: z.string().max(100).optional(),
    current_cycle: z.string().max(50).optional(),
    cycle_label: z.string().max(50).optional(),
    preferred_districts: z.array(z.string().max(50)).max(50).optional(),
    target_districts: z.array(z.string().max(50)).max(50).optional(),
    excluded_districts: z.array(z.string().max(50)).max(50).optional(),
    modality_priority: z.array(z.string().max(50)).max(10).optional(),
    target_areas: z.array(z.string().max(50)).max(20).optional(),
    technical_skills: z.record(z.unknown()).optional(),
    skills_json: z.record(z.unknown()).optional(),
    min_score_pref: z.number().min(0).max(100).optional(),
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
