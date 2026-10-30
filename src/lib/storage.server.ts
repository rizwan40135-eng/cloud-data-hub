// Dual-engine file layer. NEVER imported by UI code — UI goes through
// app.functions.ts (createServerFn) only.
//
//  - S3_BUCKET set  -> presigned PUT/GET URLs via @aws-sdk/client-s3 +
//    s3-request-presigner. Credentials come from the EC2 IAM role through the
//    SDK default credential chain — never hardcoded keys.
//  - S3_BUCKET unset -> preview mock: uploads are recorded and downloads
//    return generated placeholder content so the UI is fully testable.

import type { FileRow } from "./db.server";

export type EngineMode = "production" | "preview";

export function s3Mode(): EngineMode {
  return process.env["S3_BUCKET"] ? "production" : "preview";
}

function s3Config() {
  return {
    region: process.env["AWS_REGION"] ?? "ap-south-1",
    bucket: process.env["S3_BUCKET"] as string,
  };
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  const [{ S3Client, PutObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);
  const { region, bucket } = s3Config();
  const client = new S3Client({ region }); // no credentials -> EC2 IAM role
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 900 },
  );
}

export async function presignGet(key: string): Promise<string> {
  const [{ S3Client, GetObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);
  const { region, bucket } = s3Config();
  const client = new S3Client({ region });
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 900,
  });
}

/** Preview-mode download: a small text file served as a data URL. */
export function mockDownloadUrl(file: Pick<FileRow, "file_name" | "s3_key" | "file_size">, content: string): string {
  const body = `${content}\n`;
  return `data:text/plain;charset=utf-8,${encodeURIComponent(body)}`;
}

export function buildS3Key(fileName: string): string {
  return `uploads/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
