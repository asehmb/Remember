import { readFile } from "node:fs/promises";
import pdf from "pdf-parse";

export async function parsePdf(filePath: string): Promise<string> {
  const fileBuffer = await readFile(filePath);
  const parsed = await pdf(fileBuffer);
  return parsed.text;
}
