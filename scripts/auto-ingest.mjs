// Idempotent production bootstrap: schema + seed data + initial files.
// Usage: npm run setup:production     (requires DATABASE_URL; S3_BUCKET optional)
// Safe to re-run at any time — every step is guarded against duplicates.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL, SEED_PROJECTS } from "../src/lib/schema.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_URL = process.env.DATABASE_URL;
const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required for setup:production");
  process.exit(1);
}

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

try {
  // 1. Idempotent schema bootstrap (same DDL the app runs on startup).
  await pool.query(SCHEMA_SQL);
  console.log("✓ schema ensured");

  // 2. Seed projects — only when the table is still empty.
  const { rows: counts } = await pool.query("SELECT COUNT(*)::int AS n FROM public.projects");
  if (counts[0].n === 0) {
    for (const p of SEED_PROJECTS) {
      await pool.query(
        "INSERT INTO public.projects (name, description, status) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE name = $1)",
        [p.name, p.description, p.status],
      );
    }
    console.log(`✓ seeded ${SEED_PROJECTS.length} projects`);
  } else {
    console.log(`• projects already seeded (${counts[0].n} rows) — skipped`);
  }
  // Also mirror the CSV in data/seeds/projects.csv if present.
  try {
    const csv = readFileSync(join(root, "data/seeds/projects.csv"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(1)
      .map((line) => {
        const [name, description, status] = line.split(",");
        return { name, description, status: status ?? "active" };
      });
    for (const p of csv) {
      await pool.query(
        "INSERT INTO public.projects (name, description, status) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE name = $1)",
        [p.name, p.description, p.status],
      );
    }
  } catch {
    /* no CSV — fine */
  }

  // 3. Initial files -> S3 + metadata rows in RDS.
  let s3 = null;
  if (S3_BUCKET) {
    const [{ S3Client, PutObjectCommand, HeadObjectCommand }] = await Promise.all([
      import("@aws-sdk/client-s3"),
    ]);
    s3 = { client: new S3Client({ region: REGION }), PutObjectCommand, HeadObjectCommand, bucket: S3_BUCKET };
  } else {
    console.log("• S3_BUCKET not set — recording metadata only");
  }

  const dir = join(root, "data/initial-files");
  const names = readdirSync(dir);
  for (const name of names) {
    const s3Key = `initial-files/${name}`;
    const { rows } = await pool.query("SELECT 1 FROM public.files WHERE s3_key = $1", [s3Key]);
    if (rows.length > 0) {
      console.log(`• ${s3Key} already recorded — skipped`);
      continue;
    }
    let size = 0;
    if (s3) {
      const body = readFileSync(join(dir, name));
      size = body.byteLength;
      try {
        await s3.client.send(new s3.HeadObjectCommand({ Bucket: s3.bucket, Key: s3Key }));
        console.log(`• ${s3Key} already in S3 — skipped upload`);
      } catch {
        await s3.client.send(
          new s3.PutObjectCommand({
            Bucket: s3.bucket,
            Key: s3Key,
            Body: body,
            ContentType: "text/markdown",
          }),
        );
        console.log(`✓ uploaded ${s3Key} to s3://${S3_BUCKET}`);
      }
    } else {
      size = readFileSync(join(dir, name)).byteLength;
    }
    await pool.query(
      "INSERT INTO public.files (file_name, s3_key, file_size, mime_type) VALUES ($1, $2, $3, $4) ON CONFLICT (s3_key) DO NOTHING",
      [name, s3Key, size, "text/markdown"],
    );
    console.log(`✓ metadata recorded for ${s3Key}`);
  }

  console.log("Done. Production setup complete.");
} finally {
  await pool.end();
}
