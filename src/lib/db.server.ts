// Dual-engine database layer. NEVER imported by UI code — UI goes through
// app.functions.ts (createServerFn) only.
//
//  - DATABASE_URL set  -> native pg.Pool over TCP (EC2 + AWS RDS).
//    Schema self-initializes on first connection, fully idempotent.
//  - DATABASE_URL unset -> in-memory preview store so the Lovable preview
//    renders, submits and lists without a database.

import { SCHEMA_SQL } from "./schema.mjs";

export type EngineMode = "production" | "preview";

export function dbMode(): EngineMode {
  return process.env.DATABASE_URL ? "production" : "preview";
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
}

export interface FileRow {
  id: string;
  project_id: string | null;
  file_name: string;
  s3_key: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

// ---- Production engine (pg.Pool, port 5432) --------------------------------

let poolPromise: Promise<import("pg").Pool> | null = null;

function getPool(): Promise<import("pg").Pool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        ssl: /sslmode=(require|verify-full)/.test(process.env.DATABASE_URL ?? "")
          ? { rejectUnauthorized: false }
          : undefined,
      });
      pool.on("error", (err) => console.error("[dual-engine] pg pool error:", err));
      await pool.query(SCHEMA_SQL); // idempotent: safe on boot and restarts
      console.log("[dual-engine] RDS connected, schema ensured");
      return pool;
    })();
  }
  return poolPromise;
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const pool = await getPool();
  const result = await pool.query(text, params as never[]);
  return result.rows as T[];
}

// ---- Preview engine (in-memory) --------------------------------------------

interface MockFile extends FileRow {
  content: string;
}

const state: { projects: ProjectRow[] | null; files: MockFile[] } = {
  projects: null,
  files: [],
};

function seedProjects(): ProjectRow[] {
  if (!state.projects) {
    const now = Date.now();
    state.projects = [
      { name: "API Gateway Rollout", description: "Migrate edge traffic to the new gateway.", status: "active" },
      { name: "RDS Failover Drill", description: "Quarterly multi-AZ failover exercise.", status: "planned" },
      { name: "S3 Lifecycle Policy", description: "Tier cold documents to infrequent access.", status: "active" },
      { name: "EC2 Image Hardening", description: "Rebuild AMIs with patched base images.", status: "done" },
      { name: "Observability Stack", description: "Ship structured logs and alerts.", status: "planned" },
    ].map((p, i) => ({
      ...p,
      id: crypto.randomUUID(),
      created_at: new Date(now - i * 86_400_000).toISOString(),
    }));
  }
  return state.projects;
}

export const mockStore = {
  seedProjects,
  listProjects: (): ProjectRow[] => seedProjects(),
  addProject(name: string, description: string): ProjectRow {
    const row: ProjectRow = {
      id: crypto.randomUUID(),
      name,
      description,
      status: "active",
      created_at: new Date().toISOString(),
    };
    state.projects = [...seedProjects(), row];
    return row;
  },
  listFiles(): FileRow[] {
    return state.files.map(({ content: _c, ...row }) => row);
  },
  addFile(file: Omit<FileRow, "id" | "created_at">): FileRow {
    const { content: _drop, ...rest } = state.files.find((f) => f.s3_key === file.s3_key) ?? { content: "" };
    const row: MockFile = {
      ...rest,
      ...file,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      content: `Preview placeholder for ${file.file_name} (${file.file_size} bytes). On EC2 this lives in S3 bucket ${process.env.S3_BUCKET ?? "(none)"} under key ${file.s3_key}.`,
    };
    state.files = [...state.files.filter((f) => f.s3_key !== file.s3_key), row];
    return row;
  },
  readMockFile(s3Key: string): string {
    return state.files.find((f) => f.s3_key === s3Key)?.content ?? `Preview placeholder for ${s3Key}.`;
  },
};
