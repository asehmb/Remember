import yauzl from "yauzl";

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unknown PPTX parsing error");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function extractSlideText(slideXml: string): string {
  const textRuns = [...slideXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
  if (textRuns.length === 0) {
    return "";
  }

  return textRuns
    .map((match) => decodeXmlEntities(match[1] ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export async function parsePptx(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(normalizeError(openError));
        return;
      }

      const slideTexts = new Map<number, string>();
      let settled = false;

      const fail = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        zipFile.close();
        reject(normalizeError(error));
      };

      zipFile.on("error", fail);

      zipFile.on("entry", (entry) => {
        const match = entry.fileName.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
        if (!match) {
          zipFile.readEntry();
          return;
        }

        const slideNumber = Number.parseInt(match[1] ?? "0", 10);
        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            fail(streamError ?? new Error("Failed to open PPTX entry stream"));
            return;
          }

          const chunks: Buffer[] = [];
          readStream.on("error", fail);
          readStream.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          readStream.on("end", () => {
            try {
              const slideXml = Buffer.concat(chunks).toString("utf8");
              const slideText = extractSlideText(slideXml);
              if (slideText) {
                slideTexts.set(slideNumber, slideText);
              }
              zipFile.readEntry();
            } catch (error) {
              fail(error);
            }
          });
        });
      });

      zipFile.on("end", () => {
        if (settled) {
          return;
        }
        settled = true;

        const orderedSlides = [...slideTexts.entries()]
          .sort(([left], [right]) => left - right)
          .map(([slideNumber, slideText]) => `Slide ${slideNumber}\n${slideText}`);

        resolve(orderedSlides.join("\n\n"));
      });

      zipFile.readEntry();
    });
  });
}
