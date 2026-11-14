/**
 * Deterministic Backfill SQL Generator
 *
 * Reads job_listings from Cloud Supabase (or optional JSON seed), applies
 * normalizeJobMetadata() from jobNormalization.ts, prints summary statistics,
 * and emits batched idempotent SQL UPDATE statements.
 *
 * Usage:
 *   node apps/web/scripts/generate-backfill-sql.ts --dry-run
 *   node apps/web/scripts/generate-backfill-sql.ts --out <path>
 *   node apps/web/scripts/generate-backfill-sql.ts --seed <path> --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// @ts-expect-error Node 24 native TS execution requires explicit .ts extension
import { normalizeJobMetadata, cleanJobTitle, cleanJobLocation, extractModality, type NormalizedJobMetadata } from '../src/lib/domain/jobNormalization.ts';

interface RawListingRow {
  id: number | string;
  title: string;
  location?: string | null;
  modality?: string | null;
  salary?: string | null;
  raw_description?: string | null;
}

interface ProcessedListing {
  id: number | string;
  cleanedTitle: string;
  cleanedLocation: string;
  cleanedModality: string;
  metadata: NormalizedJobMetadata;
}

interface CliOptions {
  dryRun: boolean;
  outPath?: string;
  seedPath?: string;
  batchSize: number;
  envPath?: string;
  showHelp: boolean;
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    batchSize: 50,
    showHelp: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--out' && i + 1 < argv.length) {
      options.outPath = argv[++i];
    } else if (arg === '--seed' && i + 1 < argv.length) {
      options.seedPath = argv[++i];
    } else if (arg === '--batch-size' && i + 1 < argv.length) {
      options.batchSize = parseInt(argv[++i], 10) || 50;
    } else if (arg === '--env' && i + 1 < argv.length) {
      options.envPath = argv[++i];
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
Deterministic Backfill SQL Generator

Options:
  --dry-run             Compute normalization and print stats without mutating or writing
  --out <path>          Output path for generated SQL migration file
  --seed <path>         Load listings from a local JSON seed file instead of Supabase
  --batch-size <num>    Number of rows per SQL UPDATE statement (default: 50)
  --env <path>          Custom path to .env.local file
  --help, -h            Show this help message

Examples:
  node apps/web/scripts/generate-backfill-sql.ts --dry-run
  node apps/web/scripts/generate-backfill-sql.ts --out supabase/migrations/202611140002_backfill.sql
  node apps/web/scripts/generate-backfill-sql.ts --seed services/pipeline/seeds/initial_catalog.json --dry-run
`);
}

function loadEnvFile(customEnvPath?: string): { url?: string; key?: string } {
  const candidates: string[] = [];

  if (customEnvPath) {
    candidates.push(path.resolve(customEnvPath));
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  candidates.push(
    path.resolve(process.cwd(), 'apps/web/.env.local'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../.env.local')
  );

  for (const envFile of candidates) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      let url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL;
      let key: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const varName = match[1].trim();
          let varVal = match[2].trim();
          // Strip wrapping quotes
          if (
            (varVal.startsWith('"') && varVal.endsWith('"')) ||
            (varVal.startsWith("'") && varVal.endsWith("'"))
          ) {
            varVal = varVal.slice(1, -1);
          }

          if (varName === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = varVal;
          if (varName === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && !key) key = varVal;
        }
      }

      if (url && key) {
        return { url, key };
      }
    }
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

async function fetchListings(options: CliOptions): Promise<RawListingRow[]> {
  if (options.seedPath) {
    const absPath = path.resolve(options.seedPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Seed file not found at: ${absPath}`);
    }
    const rawData = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    const rows = Array.isArray(rawData) ? rawData : rawData.listings || rawData.jobs || [];
    return rows.map((r: any, idx: number) => ({
      id: r.id ?? idx + 1,
      title: r.title || '',
      location: r.location || null,
      modality: r.modality || null,
      salary: r.salary || null,
      raw_description: r.raw_description || null,
    }));
  }

  const { url, key } = loadEnvFile(options.envPath);
  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).'
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  let allRows: RawListingRow[] = [];
  let from = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await supabase
      .from('job_listings')
      .select('id, title, location, modality, salary, raw_description')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to query job_listings: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allRows = allRows.concat(data as RawListingRow[]);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

function printSummaryStats(processed: ProcessedListing[]): void {
  const total = processed.length;
  console.log(`\n============================================================`);
  console.log(` Lima Job Metadata Normalization Summary (${total} listings)`);
  console.log(`============================================================\n`);

  // District distribution
  const districtCounts: Record<string, number> = {};
  const zoneCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const roleLevelCounts: Record<string, number> = {};
  const englishLevelCounts: Record<string, number> = {};
  let englishReqCount = 0;
  let salaryDetectedCount = 0;
  const salaries: number[] = [];

  for (const item of processed) {
    const m = item.metadata;
    districtCounts[m.district] = (districtCounts[m.district] || 0) + 1;
    zoneCounts[m.lima_zone] = (zoneCounts[m.lima_zone] || 0) + 1;
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
    roleLevelCounts[m.role_level] = (roleLevelCounts[m.role_level] || 0) + 1;

    if (m.english_required) {
      englishReqCount++;
      const lvlKey = m.english_level || 'no especificado';
      englishLevelCounts[lvlKey] = (englishLevelCounts[lvlKey] || 0) + 1;
    }

    if (m.salary_min !== null) {
      salaryDetectedCount++;
      salaries.push(m.salary_min);
    }
  }

  console.log(`[1] Districts (top 15):`);
  const sortedDistricts = Object.entries(districtCounts).sort((a, b) => b[1] - a[1]);
  for (const [dist, count] of sortedDistricts.slice(0, 15)) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`    - ${dist.padEnd(25)}: ${count.toString().padStart(3)} (${pct}%)`);
  }
  if (sortedDistricts.length > 15) {
    console.log(`    ... and ${sortedDistricts.length - 15} more districts`);
  }

  // Sanity check: Ensure Computrabajo rating noise ("4,3", etc.) never became a district
  const noiseDistricts = Object.keys(districtCounts).filter((d) => /^\d+([.,]\d+)?$/.test(d));
  if (noiseDistricts.length > 0) {
    console.error(`\n❌ ERROR: Found numeric rating noise in districts: ${noiseDistricts.join(', ')}`);
  } else {
    console.log(`\n  ✅ Clean: 0 numeric rating noise districts detected (e.g. "4,3" completely clean)`);
  }

  console.log(`\n[2] Lima Macro-Zones:`);
  for (const [zone, count] of Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`    - ${zone.padEnd(25)}: ${count.toString().padStart(3)} (${pct}%)`);
  }

  console.log(`\n[3] Categories:`);
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`    - ${cat.padEnd(32)}: ${count.toString().padStart(3)} (${pct}%)`);
  }

  console.log(`\n[4] Role Levels:`);
  for (const [lvl, count] of Object.entries(roleLevelCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`    - ${lvl.padEnd(25)}: ${count.toString().padStart(3)} (${pct}%)`);
  }

  console.log(`\n[5] English Requirement:`);
  console.log(
    `    - English Required        : ${englishReqCount} (${((englishReqCount / total) * 100).toFixed(1)}%)`
  );
  console.log(
    `    - Not Required            : ${total - englishReqCount} (${(((total - englishReqCount) / total) * 100).toFixed(1)}%)`
  );
  for (const [lvl, count] of Object.entries(englishLevelCounts)) {
    console.log(`      * Level: ${lvl.padEnd(16)}: ${count}`);
  }

  console.log(`\n[6] Salary (Monthly PEN):`);
  console.log(
    `    - Listings with salary   : ${salaryDetectedCount} (${((salaryDetectedCount / total) * 100).toFixed(1)}%)`
  );
  if (salaries.length > 0) {
    const minSal = Math.min(...salaries);
    const maxSal = Math.max(...salaries);
    const avgSal = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length);
    console.log(`    - Min Salary             : S/ ${minSal}`);
    console.log(`    - Max Salary             : S/ ${maxSal}`);
    console.log(`    - Avg Salary             : S/ ${avgSal}`);
  }
  console.log(`============================================================\n`);
}

function escapeSqlString(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

function generateBatchedSql(processed: ProcessedListing[], batchSize: number): string {
  const statements: string[] = [
    `-- ============================================================================`,
    `-- Idempotent Lima Listings Metadata Backfill`,
    `-- Generated rows: ${processed.length}`,
    `-- Generated at: ${new Date().toISOString()}`,
    `-- ============================================================================`,
    ``,
  ];

  for (let i = 0; i < processed.length; i += batchSize) {
    const batch = processed.slice(i, i + batchSize);
    const valuesRows = batch.map((item) => {
      const id = typeof item.id === 'number' ? item.id : escapeSqlString(String(item.id));
      const title = escapeSqlString(item.cleanedTitle);
      const location = escapeSqlString(item.cleanedLocation);
      const modality = escapeSqlString(item.cleanedModality);
      const district = escapeSqlString(item.metadata.district);
      const limaZone = escapeSqlString(item.metadata.lima_zone);
      const category = escapeSqlString(item.metadata.category);
      const roleLevel = escapeSqlString(item.metadata.role_level);
      const engReq = item.metadata.english_required ? 'true' : 'false';
      const engLvl = item.metadata.english_level
        ? escapeSqlString(item.metadata.english_level)
        : 'NULL';
      const salMin = item.metadata.salary_min !== null ? item.metadata.salary_min : 'NULL';
      const salMax = item.metadata.salary_max !== null ? item.metadata.salary_max : 'NULL';

      return `  (${id}, ${title}, ${location}, ${modality}, ${district}, ${limaZone}, ${category}, ${roleLevel}, ${engReq}, ${engLvl}, ${salMin}, ${salMax})`;
    });

    const updateSql = `UPDATE public.job_listings AS j
SET
  title = v.title::text,
  location = v.location::text,
  modality = v.modality::text,
  district = v.district::text,
  lima_zone = v.lima_zone::text,
  category = v.category::text,
  role_level = v.role_level::text,
  english_required = v.english_required::boolean,
  english_level = v.english_level::text,
  salary_min = v.salary_min::integer,
  salary_max = v.salary_max::integer
FROM (VALUES
${valuesRows.join(',\n')}
) AS v(id, title, location, modality, district, lima_zone, category, role_level, english_required, english_level, salary_min, salary_max)
WHERE j.id = v.id;
`;
    statements.push(updateSql);
  }

  return statements.join('\n');
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv);

  if (options.showHelp) {
    printUsage();
    process.exit(0);
  }

  console.log('Fetching listings...');
  const rawListings = await fetchListings(options);
  console.log(`Fetched ${rawListings.length} listings.`);

  const processed: ProcessedListing[] = rawListings.map((listing) => {
    const cleanedTitle = cleanJobTitle(listing.title);
    const cleanedModality = extractModality({
      title: cleanedTitle,
      modality: listing.modality,
      raw_description: listing.raw_description,
    });
    const metadata = normalizeJobMetadata({
      title: cleanedTitle,
      location: listing.location,
      modality: cleanedModality,
      salary: listing.salary,
      raw_description: listing.raw_description,
    });
    const cleanedLocation = cleanJobLocation(listing.location, metadata.district);
    return {
      id: listing.id,
      cleanedTitle,
      cleanedLocation,
      cleanedModality,
      metadata,
    };
  });

  printSummaryStats(processed);

  const sql = generateBatchedSql(processed, options.batchSize);

  if (options.outPath) {
    const absOutPath = path.resolve(options.outPath);
    fs.mkdirSync(path.dirname(absOutPath), { recursive: true });
    fs.writeFileSync(absOutPath, sql, 'utf8');
    console.log(`Successfully generated backfill SQL at:\n  ${absOutPath}`);
  } else if (!options.dryRun) {
    console.log(
      'Notice: No --out specified. Pass --out <path> to save SQL, or --dry-run for stats only.'
    );
  }

  if (options.dryRun) {
    console.log('Dry run completed successfully. (No DB rows modified)');
  }
}

main().catch((err) => {
  console.error('\nExecution failed:', err.message || err);
  process.exit(1);
});
