import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

const DB_FILENAME = "remember.db";
const LEGACY_DB_FILENAMES = ["remember.sqlite", "tagmind.db", "tagmind.sqlite"] as const;

export interface CreateDatabaseOptions {
  userDataPath: string;
  legacyUserDataPaths?: string[];
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function moveFile(sourcePath: string, targetPath: string): void {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "EXDEV") {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      return;
    }
    throw error;
  }
}

function moveDatabaseArtifacts(sourcePath: string, targetPath: string): void {
  moveFile(sourcePath, targetPath);
  for (const suffix of ["-wal", "-shm"]) {
    const sourceSidecarPath = `${sourcePath}${suffix}`;
    if (!fs.existsSync(sourceSidecarPath)) {
      continue;
    }
    moveFile(sourceSidecarPath, `${targetPath}${suffix}`);
  }
}

function collectLegacyCandidates(
  targetPath: string,
  userDataPath: string,
  legacyUserDataPaths: string[]
): string[] {
  const resolvedTargetPath = path.resolve(targetPath);
  const candidates = new Set<string>();

  for (const rootPath of [userDataPath, ...legacyUserDataPaths]) {
    for (const filename of [DB_FILENAME, ...LEGACY_DB_FILENAMES]) {
      const candidatePath = path.resolve(path.join(rootPath, filename));
      if (candidatePath !== resolvedTargetPath) {
        candidates.add(candidatePath);
      }
    }
  }

  return [...candidates];
}

function migrateLegacyDatabase(targetPath: string, candidates: string[]): void {
  if (fs.existsSync(targetPath)) {
    return;
  }

  const sourcePath = candidates.find((candidatePath) => fs.existsSync(candidatePath));
  if (!sourcePath) {
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  moveDatabaseArtifacts(sourcePath, targetPath);
}

function ensureSourcePathColumn(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(files)").all() as Array<{ name: string }>;
  const hasSourcePathColumn = columns.some((column) => column.name === "source_path");
  if (!hasSourcePathColumn) {
    db.exec("ALTER TABLE files ADD COLUMN source_path TEXT");
  }
}

export function createDatabase({
  userDataPath,
  legacyUserDataPaths = []
}: CreateDatabaseOptions): Database.Database {
  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, DB_FILENAME);
  const legacyCandidates = collectLegacyCandidates(dbPath, userDataPath, legacyUserDataPaths);
  migrateLegacyDatabase(dbPath, legacyCandidates);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  ensureSourcePathColumn(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_files_source_path ON files(source_path)");
  return db;
}
