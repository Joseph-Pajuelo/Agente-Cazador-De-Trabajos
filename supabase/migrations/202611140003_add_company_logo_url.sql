-- Add company_logo_url to store real scraped company logos from Bumeran, LinkedIn, CompuTrabajo, CVMatcher, and Practicas.pe
ALTER TABLE public.job_listings
  ADD COLUMN IF NOT EXISTS company_logo_url text;
