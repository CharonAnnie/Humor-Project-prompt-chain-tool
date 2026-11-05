const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const IMAGE_BUCKET = "images";

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // mirrors the bucket's own limit

// The bucket is public, so a storage path maps to a URL by string concatenation.
export function publicImageUrl(storagePath: string) {
  return `${supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/${storagePath}`;
}

// Caption Drop's own convention: "<uploader uid>/<name>", which its storage
// policies depend on -- a member may only write under their own uid. Uploads
// from this tool follow it too, so the member policy still describes reality
// and the superadmin storage policies are not what makes the upload work.
export function buildStoragePath(userId: string, fileName: string) {
  const extension = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
    : ".jpg";
  return `${userId}/chain-${Date.now()}${extension}`;
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
