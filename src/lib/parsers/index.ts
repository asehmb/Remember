import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";
import { parseTxt } from "./txt";

export async function extractDocumentText(filePath: string, extension: string): Promise<string> {
  const ext = extension.toLowerCase();

  if (ext === ".txt") {
    return parseTxt(filePath);
  }

  if (ext === ".pdf") {
    return parsePdf(filePath);
  }

  if (ext === ".docx") {
    return parseDocx(filePath);
  }

  throw new Error(`Unsupported document extension: ${extension}`);
}
