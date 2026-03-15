import { readFile } from "node:fs/promises";

export async function parseTxt(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
