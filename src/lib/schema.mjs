// Single source of truth for the idempotent RDS schema.
// Runs on every boot (app startup + `npm run setup:production`) — 100% safe
// to re-run: every statement is IF NOT EXISTS / guarded.

export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_email text;

CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  s3_key text NOT NULL UNIQUE,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_project ON public.files(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_created ON public.projects(created_at DESC);
`;

// Demo rows for a blank database (used by scripts/auto-ingest.mjs).
export const SEED_PROJECTS = [
  { name: "API Gateway Rollout", description: "Migrate edge traffic to the new gateway.", status: "active" },
  { name: "RDS Failover Drill", description: "Quarterly multi-AZ failover exercise.", status: "planned" },
  { name: "S3 Lifecycle Policy", description: "Tier cold documents to infrequent access.", status: "active" },
  { name: "EC2 Image Hardening", description: "Rebuild AMIs with patched base images.", status: "done" },
  { name: "Observability Stack", description: "Ship structured logs and alerts.", status: "planned" },
];
