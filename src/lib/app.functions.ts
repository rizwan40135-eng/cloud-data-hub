// The ONLY module UI code may import for data/files. Every database query and
// every S3 operation lives behind these createServerFn boundaries.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbMode, mockStore, query, type FileRow, type ProjectRow } from "./db.server";
import { buildS3Key, mockDownloadUrl, presignGet, presignPut, s3Mode } from "./storage.server";

export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => ({
  dbEngine: dbMode(),
  s3Engine: s3Mode(),
  region: process.env["AWS_REGION"] ?? null,
}));

// ---- Projects ----

export const listProjects = createServerFn({ method: "GET" }).handler(async (): Promise<ProjectRow[]> => {
  if (dbMode() === "preview") return mockStore.listProjects();
  return query<ProjectRow>(
    "SELECT id, name, description, status, created_at FROM public.projects ORDER BY created_at DESC LIMIT 100",
  );
});

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { name: string; description: string }) =>
      z.object({ name: z.string().min(1).max(120), description: z.string().max(500) }).parse(input),
  )
  .handler(async ({ data }): Promise<ProjectRow> => {
    if (dbMode() === "preview") return mockStore.addProject(data.name, data.description);
    const rows = await query<ProjectRow>(
      "INSERT INTO public.projects (name, description) VALUES ($1, $2) RETURNING id, name, description, status, created_at",
      [data.name, data.description],
    );
    return rows[0]!;
  });

// ---- Files ----

export const listFiles = createServerFn({ method: "GET" }).handler(async (): Promise<FileRow[]> => {
  if (dbMode() === "preview") return mockStore.listFiles();
  return query<FileRow>(
    "SELECT id, project_id, file_name, s3_key, file_size, mime_type, created_at FROM public.files ORDER BY created_at DESC LIMIT 100",
  );
});

/**
 * Step 1 of an upload: server presigns a direct browser->S3 PUT (production)
 * or hands back a mock key (preview). The server never touches file bytes.
 */
export const createUploadUrl = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { fileName: string; mimeType: string; fileSize: number }) =>
      z
        .object({
          fileName: z.string().min(1).max(255),
          mimeType: z.string().max(120),
          fileSize: z.number().int().positive().max(500 * 1024 * 1024),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const s3Key = buildS3Key(data.fileName);
    const mode = s3Mode();
    const uploadUrl = mode === "production" ? await presignPut(s3Key, data.mimeType) : null;
    return { mode, s3Key, uploadUrl };
  });

/** Step 2: after the browser PUT succeeds, record the metadata in the database. */
export const recordFile = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { fileName: string; s3Key: string; fileSize: number; mimeType: string; projectId?: string | null }) =>
      z
        .object({
          fileName: z.string().min(1).max(255),
          s3Key: z.string().min(1).max(600),
          fileSize: z.number().int().nonnegative(),
          mimeType: z.string().max(120),
          projectId: z.string().uuid().nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<FileRow> => {
    if (dbMode() === "preview") {
      return mockStore.addFile({
        project_id: data.projectId ?? null,
        file_name: data.fileName,
        s3_key: data.s3Key,
        file_size: data.fileSize,
        mime_type: data.mimeType,
      });
    }
    const rows = await query<FileRow>(
      `INSERT INTO public.files (file_name, s3_key, file_size, mime_type, project_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (s3_key) DO UPDATE SET file_size = EXCLUDED.file_size
       RETURNING id, project_id, file_name, s3_key, file_size, mime_type, created_at`,
      [data.fileName, data.s3Key, data.fileSize, data.mimeType, data.projectId ?? null],
    );
    return rows[0]!;
  });

/** Short-lived presigned GET URL (production) or data-URL placeholder (preview). */
export const getDownloadUrl = createServerFn({ method: "GET" })
  .inputValidator((input: { fileId: string }) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const mode = s3Mode();
    if (mode === "preview") {
      const file = mockStore.listFiles().find((f) => f.id === data.fileId);
      if (!file) throw new Error("File not found");
      return { mode, url: mockDownloadUrl(file, mockStore.readMockFile(file.s3_key)) };
    }
    const rows = await query<Pick<FileRow, "s3_key">>("SELECT s3_key FROM public.files WHERE id = $1", [
      data.fileId,
    ]);
    if (!rows[0]) throw new Error("File not found");
    return { mode, url: await presignGet(rows[0].s3_key) };
  });
