"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startRun } from "@/lib/run/actions";
import {
  ALLOWED_MIME,
  IMAGE_BUCKET,
  MAX_IMAGE_BYTES,
  buildStoragePath,
} from "@/lib/storage";

type SeedImage = {
  id: string;
  storage_path: string;
  file_name: string | null;
};

type Mode = "upload" | "existing" | "text";

/**
 * Starting a run: an upload, an image already in the database, or plain text.
 *
 * The file goes browser -> Storage directly and only its path is sent to the
 * Server Function, because a Server Function body is capped at 1MB -- smaller
 * than most phone photos, so routing the bytes through the action would fail on
 * exactly the images people actually have.
 */
export default function RunLauncher({
  chainId,
  adminId,
  images,
  firstStepReadsImage,
  imageBaseUrl,
}: {
  chainId: number;
  adminId: string;
  images: SeedImage[];
  firstStepReadsImage: boolean;
  imageBaseUrl: string;
}) {
  const [state, action, pending] = useActionState(startRun, null);
  const [mode, setMode] = useState<Mode>(firstStepReadsImage ? "upload" : "text");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = (chosen: File | null) => {
    setUploadError(null);
    setFile(null);
    setPreview(null);
    if (!chosen) return;

    if (!ALLOWED_MIME.includes(chosen.type as (typeof ALLOWED_MIME)[number])) {
      setUploadError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (chosen.size > MAX_IMAGE_BYTES) {
      setUploadError("That image is larger than 10MB.");
      return;
    }

    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  };

  const measure = (source: string) =>
    new Promise<{ width: number | null; height: number | null }>((resolve) => {
      const probe = new window.Image();
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => resolve({ width: null, height: null });
      probe.src = source;
    });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadError(null);

    // Read the fields before any `await`: after one, React may have recycled
    // the event and `currentTarget` is null.
    const form = new FormData(event.currentTarget);
    form.set("chain_id", String(chainId));

    if (mode === "existing") {
      if (!selected) {
        setUploadError("Pick an image, or switch to an upload.");
        return;
      }
      form.set("image_id", selected);
    }

    if (mode === "upload") {
      if (!file) {
        setUploadError("Choose an image to upload.");
        return;
      }

      setUploading(true);

      const supabase = createClient();
      const storagePath = buildStoragePath(adminId, file.name);

      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type });

      if (error) {
        setUploading(false);
        setUploadError(`Upload failed: ${error.message}`);
        return;
      }

      const { width, height } = preview
        ? await measure(preview)
        : { width: null, height: null };

      setUploading(false);

      form.set("storage_path", storagePath);
      form.set("file_name", file.name);
      form.set("mime_type", file.type);
      form.set("size_bytes", String(file.size));
      if (width) form.set("width", String(width));
      if (height) form.set("height", String(height));
    }

    action(form);
  };

  const busy = pending || uploading;

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div>
        <p className="label mb-1.5">What does step 1 read?</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["upload", "Upload an image"],
              ["existing", "An image already here"],
              ["text", "Text only"],
            ] as [Mode, string][]
          ).map(([value, labelText]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={mode === value ? "btn btn-primary" : "btn btn-secondary"}
            >
              {labelText}
            </button>
          ))}
        </div>
        {!firstStepReadsImage && (
          <p className="mt-2 text-xs" style={{ color: "var(--warning)" }}>
            Step 1 of this chain is on a model without vision, so an image would
            not be sent to it. Give it text instead, or point step 1 at a
            vision-capable model.
          </p>
        )}
      </div>

      {mode === "upload" && (
        <div>
          <label className="label" htmlFor="file">
            Image
          </label>
          <input
            id="file"
            type="file"
            accept={ALLOWED_MIME.join(",")}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="input mt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-transparent file:text-sm"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            JPEG, PNG or WebP up to 10MB — the limits the <code>images</code>{" "}
            bucket itself enforces. It is stored under your own user id, which is
            what the bucket&rsquo;s policies require.
          </p>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Selected image preview"
              className="mt-3 max-h-72 w-full rounded-xl object-contain"
              style={{ background: "var(--surface-2)" }}
            />
          )}
        </div>
      )}

      {mode === "existing" && (
        <div>
          <p className="label mb-1.5">
            Pick one of the {images.length} most recent images
          </p>
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelected(image.id)}
                className="overflow-hidden rounded-lg border-2 transition-colors"
                style={{
                  borderColor:
                    selected === image.id ? "var(--accent)" : "var(--border)",
                }}
                title={image.file_name ?? image.storage_path}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${imageBaseUrl}/${image.storage_path}`}
                  alt={image.file_name ?? "Stored image"}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="seed_input">
          {mode === "text" ? "Input for step 1" : "Extra context (optional)"}
        </label>
        <textarea
          id="seed_input"
          name="seed_input"
          rows={mode === "text" ? 5 : 2}
          className="input mt-1.5"
          placeholder={
            mode === "text"
              ? "The text step 1 should work from. Reachable in any step's prompt as {{input}}."
              : "Anything the model should know about the image. Reachable as {{input}}."
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg">
          {uploading ? "Uploading…" : pending ? "Starting…" : "Run chain"}
        </button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          The run opens on its own page and advances one step at a time, so you
          can watch each step&rsquo;s output as it arrives.
        </span>
      </div>

      {uploadError && <p className="notice-error">{uploadError}</p>}
      {state && !state.ok && <p className="notice-error">{state.message}</p>}
    </form>
  );
}
