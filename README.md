# Cloud Data Hub

I am building this application with a Dual-Engine architecture for EC2 + AWS RDS + AWS S3 deployment. Follow these architectural rules strictly for all data, files, and previews:

1. ARCHITECTURE & SERVER BOUNDARIES:
- Never query databases or storage directly from React UI components.
- All database queries and file operations MUST be implemented inside TanStack server functions (`createServerFn`) under `src/lib/` or `src/server/`.
- The application must auto-detect its runtime environment using `process.env.DATABASE_URL` and `process.env.S3_BUCKET`.

2. ZERO-TOUCH DATABASE SETUP (PLAIN EMPTY AWS RDS):
- The target AWS RDS PostgreSQL database is completely blank and plain. The developer or DevOps engineer will NEVER run manual SQL scripts, DDL commands, or migration tools.
- The application must fully self-initialize its own schema on first connection:
  • Enable required extensions: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  • Create all tables with `CREATE TABLE IF NOT EXISTS ...`
  • Add all columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
  • Create all foreign keys, constraints, and indexes with `CREATE INDEX IF NOT EXISTS ...`
  • Any initial demo/seed data must use conditional guards (`WHERE NOT EXISTS (...)`) so it only seeds when the table is empty and never duplicates.
- All DDL statements must be 100% idempotent: safe to run on boot, safe on restarts, safe when tables already exist.

3. DUAL-ENGINE RUNTIME SWITCH:
- In EC2 Production (when `process.env.DATABASE_URL` is set):
  • Connect strictly via the native `pg.Pool` driver over TCP port 5432.
  • Execute the idempotent schema initialization once on startup.
  • Do NOT import, call, or require any Supabase client SDKs or Supabase environment variables.
- In Lovable Preview (when `process.env.DATABASE_URL` is NOT set):
  • Automatically provide working mock/preview data so the UI renders, forms submit, and actions work inside Lovable without crashing.

4. FILES & UNSTRUCTURED DATA (AWS S3):
- In EC2 Production (when `process.env.S3_BUCKET` is set):
  • Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to generate direct-to-S3 presigned PUT and GET URLs.
  • Binary files upload directly from the browser to S3; the server only records file metadata (`file_name`, `s3_key`, `file_size`, `mime_type`, `created_at`) in a PostgreSQL RDS table.
  • Credentials must come automatically from the EC2 IAM Role at runtime — never hardcode access keys.
- In Lovable Preview (when `process.env.S3_BUCKET` is NOT set):
  • Fall back to mock file handling so developers can test upload buttons, document cards, and download actions live in the preview.

5. BIG DATA & INITIAL FILES INGESTION:
- Place large datasets (CSV or JSON with >1,000 rows) in `data/seeds/`.
- Place initial documents/media in `data/initial-files/`.
- Provide an idempotent standalone CLI script `scripts/auto-ingest.mjs` (callable via `npm run setup:production`) that connects to `DATABASE_URL`, ensures tables exist, streams seeds into RDS without duplicates, and syncs initial files to S3 with metadata saved in RDS.

6. DEPLOYMENT CONTRACT (EC2):
- The production application must require ONLY these 3 environment variables in `.env`:
  DATABASE_URL="postgresql://user:password@host:5432/dbname"
  S3_BUCKET="your-bucket-name"
  AWS_REGION="ap-south-1"        




Generate me an application with a small set of database and files, with less tokens. I will build the same in EC2.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/51cf36e1-ad79-4cac-9089-b6a9a4ff8594).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
