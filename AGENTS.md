<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Dual-Engine Architecture (user mandate)

- UI components NEVER touch databases or storage directly. All queries and file operations live behind `createServerFn` in `src/lib/app.functions.ts`; `db.server.ts` / `storage.server.ts` are server-only helpers imported only from `.functions.ts`.
- Engine switch is env-driven: `DATABASE_URL` set → native `pg.Pool` (TCP 5432) with idempotent schema bootstrap (`src/lib/schema.mjs` is the single DDL source, shared with `scripts/auto-ingest.mjs`); unset → in-memory preview mocks. `S3_BUCKET` set → presigned PUT/GET via `@aws-sdk/*` with EC2 IAM-role credentials (never hardcode keys); unset → mock file handling.
- All DDL is 100% idempotent (`IF NOT EXISTS`, `ON CONFLICT`/`WHERE NOT EXISTS` guards). Never add a migration tool or manual SQL step — the app self-initializes its schema on first connection.
- Production deploy contract is exactly three env vars: `DATABASE_URL`, `S3_BUCKET`, `AWS_REGION`.
- `pg` and `@aws-sdk/*` must only be imported dynamically inside server handlers/helpers, so the client bundle never pulls them in.
