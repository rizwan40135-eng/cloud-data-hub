import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  createProject,
  createUploadUrl,
  getDownloadUrl,
  getSystemStatus,
  listFiles,
  listProjects,
  recordFile,
} from "@/lib/app.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ops Deck — Dual-Engine Console" },
      {
        name: "description",
        content: "EC2 + RDS + S3 operations console with automatic preview fallback.",
      },
      { property: "og:title", content: "Ops Deck — Dual-Engine Console" },
      {
        property: "og:description",
        content: "EC2 + RDS + S3 operations console with automatic preview fallback.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function EngineBadge({ label, mode }: { label: string; mode: "production" | "preview" }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
      <span
        aria-hidden
        className={`size-2 rounded-full ${mode === "production" ? "bg-chart-2" : "bg-chart-4"}`}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{mode === "production" ? "Live" : "Preview mock"}</span>
    </span>
  );
}

function Index() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: status } = useQuery({ queryKey: ["status"], queryFn: () => getSystemStatus() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: files } = useQuery({ queryKey: ["files"], queryFn: () => listFiles() });

  const addProject = useMutation({
    mutationFn: (input: { name: string; description: string }) => createProject({ data: input }),
    onSuccess: () => {
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const download = useMutation({
    mutationFn: (fileId: string) => getDownloadUrl({ data: { fileId } }),
    onSuccess: ({ url }) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      a.click();
    },
  });

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const step1 = await createUploadUrl({
        data: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        },
      });
      if (step1.mode === "production" && step1.uploadUrl) {
        const put = await fetch(step1.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`S3 upload failed [${put.status}]`);
      }
      await recordFile({
        data: {
          fileName: file.name,
          s3Key: step1.s3Key,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ops Deck</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dual-engine console: EC2 + RDS + S3 in production, working mocks in preview.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <EngineBadge label="Database" mode={status?.dbEngine ?? "preview"} />
            <EngineBadge label="Files" mode={status?.s3Engine ?? "preview"} />
            {status?.region && (
              <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                Region {status.region}
              </span>
            )}
          </div>
        </header>

        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">Projects</h2>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) addProject.mutate({ name: name.trim(), description: description.trim() });
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={addProject.isPending || !name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Add
            </button>
          </form>
          <ul className="mt-4 divide-y divide-border">
            {(projects ?? []).map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                </div>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Documents</h2>
            <label className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              {uploading ? "Uploading…" : "Upload file"}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files)}
                disabled={uploading}
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Files go straight to S3 via presigned URLs; only metadata lands in the database.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {(files ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.file_size / 1024).toFixed(1)} KB · {f.mime_type}
                  </p>
                </div>
                <button
                  onClick={() => download.mutate(f.id)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
