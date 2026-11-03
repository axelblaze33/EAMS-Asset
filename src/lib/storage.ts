import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ActionError } from "@/lib/action";

// Files live in a PRIVATE Supabase Storage bucket. The service-role key never
// leaves the server; browsers only ever get short-lived signed URLs.

export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  image: ["image/jpeg", "image/png", "image/webp"],
  document: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
} as const;

// Magic-number prefixes, so a renamed .exe can't pass as a PDF.
const SIGNATURES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};

let client: SupabaseClient | null = null;

function storage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ActionError("File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? "eams-documents");
}

export function isStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function assertValidFile(file: File, allowed: readonly string[]) {
  if (file.size === 0) throw new ActionError(`"${file.name}" is empty.`);
  if (file.size > UPLOAD_LIMITS.maxBytes) throw new ActionError(`"${file.name}" is larger than 10 MB.`);
  if (!allowed.includes(file.type)) throw new ActionError(`"${file.name}" has an unsupported file type.`);
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const matches = SIGNATURES[file.type]?.some((sig) => sig.every((byte, i) => head[i] === byte));
  if (!matches) throw new ActionError(`"${file.name}" doesn't look like a valid ${file.type} file.`);
}

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-100) || "file";
}

/** Validates and uploads a file; returns the metadata to store in asset_documents. */
export async function uploadFile(file: File, folder: string, allowed: readonly string[] = UPLOAD_LIMITS.document) {
  await assertValidFile(file, allowed);
  const path = `${folder}/${randomUUID()}-${safeName(file.name)}`;
  const { error } = await storage().upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[storage] upload failed", error);
    throw new ActionError("Upload failed. Please try again.");
  }
  return { storagePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
}

/**
 * Large files skip our server (Vercel caps request bodies at 4.5 MB): the browser
 * PUTs straight to a one-time signed upload URL, then calls verifyUpload.
 */
export async function createUploadTarget(input: { folder: string; fileName: string; mimeType: string; size: number; allowed?: readonly string[] }) {
  const allowed = input.allowed ?? UPLOAD_LIMITS.document;
  if (input.size <= 0 || input.size > UPLOAD_LIMITS.maxBytes) throw new ActionError("Files must be between 1 byte and 10 MB.");
  if (!allowed.includes(input.mimeType)) throw new ActionError("Unsupported file type. Use PDF, JPG, PNG or WebP.");
  const path = `${input.folder}/${randomUUID()}-${safeName(input.fileName)}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage] signed upload failed", error);
    throw new ActionError("Couldn't prepare the upload. Please try again.");
  }
  return { path, signedUrl: data.signedUrl };
}

/** Confirms an uploaded object exists, has the declared size, and real file content. Deletes it otherwise. */
export async function verifyUpload(path: string, mimeType: string, size: number) {
  const { data, error } = await storage().download(path);
  if (error || !data) throw new ActionError("The upload didn't complete. Please try again.");
  const head = new Uint8Array(await data.slice(0, 8).arrayBuffer());
  const valid =
    data.size === size && (SIGNATURES[mimeType]?.some((sig) => sig.every((byte, i) => head[i] === byte)) ?? false);
  if (!valid) {
    await removeFiles([path]);
    throw new ActionError("The uploaded file doesn't match its type and was discarded.");
  }
}

// Files attached while a form is being filled in (handover copies, return
// photos) are uploaded before the record exists, into a per-user staging folder.
// The server action then checks ownership of each path and verifies it.
export const stagingFolder = (userId: string) => `staging/${userId}`;

import type { StagedFile } from "./storage-types";
export type { StagedFile };

export async function verifyStagedFiles(userId: string, files: StagedFile[], allowed: readonly string[] = UPLOAD_LIMITS.document) {
  for (const f of files) {
    if (!f.path.startsWith(`${stagingFolder(userId)}/`) || f.path.includes("..")) {
      throw new ActionError("Invalid upload reference.");
    }
    if (!allowed.includes(f.mimeType)) throw new ActionError(`"${f.fileName}" has an unsupported file type.`);
    await verifyUpload(f.path, f.mimeType, f.size);
  }
}

export async function signedUrl(path: string, expiresInSeconds = 300) {
  const { data, error } = await storage().createSignedUrl(path, expiresInSeconds);
  if (error) throw new ActionError("Could not generate a download link.");
  return data.signedUrl;
}

export async function removeFiles(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await storage().remove(paths);
  if (error) console.error("[storage] remove failed", error);
}
