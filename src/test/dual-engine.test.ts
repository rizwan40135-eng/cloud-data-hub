import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../lib/schema.mjs";
import { dbMode } from "../lib/db.server";
import { s3Mode } from "../lib/storage.server";

describe("idempotent schema", () => {
  it("bootstraps safely on a blank RDS instance", () => {
    expect(SCHEMA_SQL).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS public.projects");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS public.files");
    expect(SCHEMA_SQL).toContain("ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS");
    expect(SCHEMA_SQL).toContain("REFERENCES public.projects(id)");
    expect(SCHEMA_SQL).toContain("CREATE INDEX IF NOT EXISTS");
  });
});

describe("dual-engine switch", () => {
  it("uses pg/S3 only when the env vars are set", () => {
    const env = process.env;
    const prevDb = env["DATABASE_URL"];
    const prevS3 = env["S3_BUCKET"];
    try {
      delete env["DATABASE_URL"];
      delete env["S3_BUCKET"];
      expect(dbMode()).toBe("preview");
      expect(s3Mode()).toBe("preview");
      env["DATABASE_URL"] = "postgresql://u:p@h:5432/db";
      env["S3_BUCKET"] = "bucket";
      expect(dbMode()).toBe("production");
      expect(s3Mode()).toBe("production");
    } finally {
      if (prevDb) env["DATABASE_URL"] = prevDb;
      else delete env["DATABASE_URL"];
      if (prevS3) env["S3_BUCKET"] = prevS3;
      else delete env["S3_BUCKET"];
    }
  });
});
