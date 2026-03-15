import path from "node:path";
import { SUPPORTED_EXTENSIONS } from "../../shared/types";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".txt", ".docx"]);

export function normalizeExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function isSupportedExtension(extension: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number]);
}

export function isImageExtension(extension: string): boolean {
  return IMAGE_EXTENSIONS.has(extension.toLowerCase());
}

export function isDocumentExtension(extension: string): boolean {
  return DOCUMENT_EXTENSIONS.has(extension.toLowerCase());
}

export function guessMimeType(extension: string): string {
  const normalized = extension.toLowerCase();
  if (normalized === ".png") return "image/png";
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".pdf") return "application/pdf";
  if (normalized === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (normalized === ".txt") return "text/plain";
  return "application/octet-stream";
}
