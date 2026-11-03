// Client-safe types for staged uploads (lib/storage.ts is server-only).
export type StagedFile = { path: string; fileName: string; mimeType: string; size: number };
