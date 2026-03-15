const APP_FILE_PROTOCOL = "remember-file";
const APP_FILE_HOST = "local";
const FILE_PATH_QUERY_PARAM = "path";

function normalizePathInput(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("file://") && URL.canParse(trimmed)) {
    const fileUrl = new URL(trimmed);
    if (fileUrl.protocol === "file:") {
      const decodedPathname = decodeURIComponent(fileUrl.pathname);
      if (/^\/[a-zA-Z]:\//.test(decodedPathname)) {
        return decodedPathname.slice(1);
      }
      return decodedPathname;
    }
  }

  return trimmed;
}

export function toFileUrl(absolutePath: string): string {
  if (absolutePath.startsWith(`${APP_FILE_PROTOCOL}://`)) {
    return absolutePath;
  }

  const normalizedPath = normalizePathInput(absolutePath).replace(/\\/g, "/");
  const params = new URLSearchParams({
    [FILE_PATH_QUERY_PARAM]: normalizedPath,
  });

  return `${APP_FILE_PROTOCOL}://${APP_FILE_HOST}/?${params.toString()}`;
}
