import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  DominantColor,
  FileAnalysis,
  FileProcessStatus,
  FileRow,
  LibraryFilters,
  SearchResult,
  TagCloudItem
} from "../../shared/types";

interface DbRow {
  id: string;
  original_name: string;
  source_path: string | null;
  stored_path: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  uploaded_at: string;
  processed_at: string | null;
  status: FileProcessStatus;
  error_message: string | null;
  main_topic: string | null;
  summary: string | null;
  scene_description: string | null;
  mood_tone: string | null;
  sentiment: FileAnalysis["sentiment"];
  dominant_colors_json: string | null;
  entities_json: string | null;
  ocr_text: string | null;
  model_used: string | null;
  tags_json: string;
}

export interface FileInsertInput {
  id: string;
  originalName: string;
  sourcePath: string | null;
  storedPath: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  uploadedAt: string;
  status: FileProcessStatus;
}

export interface AnalysisSaveInput {
  mainTopic: string | null;
  summary: string | null;
  sceneDescription: string | null;
  moodTone: string | null;
  sentiment: FileAnalysis["sentiment"];
  dominantColors: DominantColor[];
  entities: string[];
  ocrText: string | null;
  keywordTags: string[];
  modelUsed: string;
  rawJson: string;
}

export interface RestSearchResultItem {
  id: string;
  originalName: string;
  uploadedAt: string;
  status: FileProcessStatus;
  summary: string | null;
  mainTopic: string | null;
  tags: string[];
  matchedTags: string[];
}

export interface RestSearchSnapshot {
  normalizedQuery: string;
  results: RestSearchResultItem[];
}

interface RestSearchDbRow {
  id: string;
  original_name: string;
  uploaded_at: string;
  status: FileProcessStatus;
  summary: string;
  main_topic: string;
  tags_json: string;
}

function parseJsonArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) {
    return fallback;
  }
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : fallback;
}

function normalizeSearchQuery(rawQuery: string): string {
  return rawQuery.trim().replace(/\s+/g, " ");
}

function buildFtsQuery(rawQuery: string): string | null {
  const tokens = normalizeSearchQuery(rawQuery).toLowerCase().match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `${token}*`).join(" AND ");
}

function sanitizeLimit(value: number, defaultValue: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    return defaultValue;
  }
  return Math.min(value, 100);
}

function mapRow(row: DbRow): FileRow {
  const dominantColors = parseJsonArray<DominantColor>(row.dominant_colors_json, []);
  const entities = parseJsonArray<string>(row.entities_json, []);
  const tags = parseJsonArray<string>(row.tags_json, []);

  const analysis: FileAnalysis | null =
    row.main_topic ||
    row.summary ||
    row.scene_description ||
    row.mood_tone ||
    row.sentiment ||
    row.dominant_colors_json ||
    row.entities_json ||
    row.ocr_text
      ? {
          mainTopic: row.main_topic,
          summary: row.summary,
          sceneDescription: row.scene_description,
          moodTone: row.mood_tone,
          sentiment: row.sentiment,
          dominantColors,
          entities,
          ocrText: row.ocr_text,
          keywordTags: tags,
          modelUsed: row.model_used
        }
      : null;

  return {
    id: row.id,
    originalName: row.original_name,
    sourcePath: row.source_path,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    extension: row.extension,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    processedAt: row.processed_at,
    status: row.status,
    errorMessage: row.error_message,
    tags,
    analysis
  };
}

function mapRestSearchRow(row: RestSearchDbRow, normalizedQuery: string): RestSearchResultItem {
  const tags = parseJsonArray<string>(row.tags_json, []);
  const queryTokens = normalizedQuery.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const matchedTags =
    queryTokens.length === 0
      ? []
      : tags.filter((tag) => queryTokens.some((token) => tag.toLowerCase().includes(token)));

  return {
    id: row.id,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    status: row.status,
    summary: row.summary || null,
    mainTopic: row.main_topic || null,
    tags,
    matchedTags
  };
}

export class RememberRepository {
  constructor(private readonly db: Database.Database) {}

  insertFile(input: FileInsertInput): void {
    const statement = this.db.prepare(
      `INSERT INTO files (id, original_name, source_path, stored_path, mime_type, extension, size_bytes, uploaded_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    statement.run(
      input.id,
      input.originalName,
      input.sourcePath,
      input.storedPath,
      input.mimeType,
      input.extension,
      input.sizeBytes,
      input.uploadedAt,
      input.status
    );

    this.refreshSearchIndex(input.id);
  }

  updateFileStatus(fileId: string, status: FileProcessStatus, errorMessage: string | null = null): void {
    const processedAt = status === "done" ? new Date().toISOString() : null;
    const statement = this.db.prepare(
      `UPDATE files
       SET status = ?, error_message = ?, processed_at = COALESCE(?, processed_at)
       WHERE id = ?`
    );
    statement.run(status, errorMessage, processedAt, fileId);
  }

  getFile(fileId: string): FileRow | null {
    const row = this.db
      .prepare(
        `SELECT
          f.*,
          a.main_topic,
          a.summary,
          a.scene_description,
          a.mood_tone,
          a.sentiment,
          a.dominant_colors_json,
          a.entities_json,
          a.ocr_text,
          a.model_used,
          COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
        FROM files f
        LEFT JOIN analysis a ON a.file_id = f.id
        WHERE f.id = ?`
      )
      .get(fileId) as DbRow | undefined;

    return row ? mapRow(row) : null;
  }

  getFileCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM files").get() as { count: number };
    return row.count;
  }

  searchSnapshot(rawQuery: string, limit = 25): RestSearchSnapshot {
    const normalizedQuery = normalizeSearchQuery(rawQuery);
    const safeLimit = sanitizeLimit(limit, 25);

    if (!normalizedQuery) {
      const rows = this.db
        .prepare(
          `SELECT
            f.id,
            f.original_name,
            f.uploaded_at,
            f.status,
            COALESCE(a.summary, '') AS summary,
            COALESCE(a.main_topic, '') AS main_topic,
            COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
           FROM files f
           LEFT JOIN analysis a ON a.file_id = f.id
           ORDER BY f.uploaded_at DESC
           LIMIT ?`
        )
        .all(safeLimit) as RestSearchDbRow[];

      return {
        normalizedQuery,
        results: rows.map((row) => mapRestSearchRow(row, normalizedQuery))
      };
    }

    const ftsQuery = buildFtsQuery(normalizedQuery);
    if (!ftsQuery) {
      return {
        normalizedQuery,
        results: []
      };
    }

    const rows = this.db
      .prepare(
        `SELECT
          f.id,
          f.original_name,
          f.uploaded_at,
          f.status,
          COALESCE(a.summary, '') AS summary,
          COALESCE(a.main_topic, '') AS main_topic,
          COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
         FROM files f
         LEFT JOIN analysis a ON a.file_id = f.id
         WHERE f.id IN (SELECT file_id FROM search_index WHERE search_index MATCH ?)
         ORDER BY f.uploaded_at DESC
         LIMIT ?`
      )
      .all(ftsQuery, safeLimit) as RestSearchDbRow[];

    return {
      normalizedQuery,
      results: rows.map((row) => mapRestSearchRow(row, normalizedQuery))
    };
  }

  listFiles(filters: LibraryFilters): SearchResult[] {
    const clauses: string[] = ["1=1"];
    const params: Array<string | number> = [];

    if (filters.fileType) {
      clauses.push("LOWER(f.extension) = LOWER(?)");
      params.push(filters.fileType.startsWith(".") ? filters.fileType : `.${filters.fileType}`);
    }

    if (filters.sentiment) {
      clauses.push("a.sentiment = ?");
      params.push(filters.sentiment);
    }

    if (filters.selectedTag) {
      clauses.push(
        "EXISTS (SELECT 1 FROM tags ft WHERE ft.file_id = f.id AND LOWER(ft.tag) = LOWER(?))"
      );
      params.push(filters.selectedTag);
    }

    if (filters.dominantColor) {
      clauses.push(
        `EXISTS (
          SELECT 1
          FROM json_each(COALESCE(a.dominant_colors_json, '[]')) dc
          WHERE LOWER(json_extract(dc.value, '$.name')) = LOWER(?)
             OR LOWER(json_extract(dc.value, '$.hex')) = LOWER(?)
        )`
      );
      params.push(filters.dominantColor, filters.dominantColor);
    }

    if (filters.uploadedWithin !== "all") {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const lookup: Record<Exclude<LibraryFilters["uploadedWithin"], "all">, number> = {
        "7d": now - dayMs * 7,
        "30d": now - dayMs * 30,
        "365d": now - dayMs * 365
      };
      clauses.push("f.uploaded_at >= ?");
      params.push(new Date(lookup[filters.uploadedWithin]).toISOString());
    }

    const ftsQuery = buildFtsQuery(filters.query);
    if (ftsQuery) {
      clauses.push("f.id IN (SELECT file_id FROM search_index WHERE search_index MATCH ?)");
      params.push(ftsQuery);
    }

    const sql = `
      SELECT
        f.*,
        a.main_topic,
        a.summary,
        a.scene_description,
        a.mood_tone,
        a.sentiment,
        a.dominant_colors_json,
        a.entities_json,
        a.ocr_text,
        a.model_used,
        COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
      FROM files f
      LEFT JOIN analysis a ON a.file_id = f.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY f.uploaded_at DESC
    `;

    const rows = this.db.prepare(sql).all(...params) as DbRow[];
    const normalizedQuery = normalizeSearchQuery(filters.query).toLowerCase();

    return rows.map((row) => {
      const file = mapRow(row);
      const matchedTags = normalizedQuery
        ? file.tags.filter((tag) => tag.toLowerCase().includes(normalizedQuery))
        : [];

      return {
        file,
        matchedTags
      };
    });
  }

  saveAnalysis(fileId: string, input: AnalysisSaveInput): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO analysis (
            file_id,
            main_topic,
            summary,
            scene_description,
            mood_tone,
            sentiment,
            dominant_colors_json,
            entities_json,
            ocr_text,
            raw_json,
            model_used
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_id) DO UPDATE SET
            main_topic=excluded.main_topic,
            summary=excluded.summary,
            scene_description=excluded.scene_description,
            mood_tone=excluded.mood_tone,
            sentiment=excluded.sentiment,
            dominant_colors_json=excluded.dominant_colors_json,
            entities_json=excluded.entities_json,
            ocr_text=excluded.ocr_text,
            raw_json=excluded.raw_json,
            model_used=excluded.model_used`
        )
        .run(
          fileId,
          input.mainTopic,
          input.summary,
          input.sceneDescription,
          input.moodTone,
          input.sentiment,
          JSON.stringify(input.dominantColors),
          JSON.stringify(input.entities),
          input.ocrText,
          input.rawJson,
          input.modelUsed
        );

      this.db.prepare("DELETE FROM tags WHERE file_id = ? AND source = 'ai'").run(fileId);

      const insertTag = this.db.prepare(
        "INSERT OR IGNORE INTO tags (id, file_id, tag, source, created_at) VALUES (?, ?, ?, 'ai', ?)"
      );
      const now = new Date().toISOString();

      for (const rawTag of input.keywordTags) {
        const tag = rawTag.trim();
        if (tag.length === 0) {
          continue;
        }
        insertTag.run(crypto.randomUUID(), fileId, tag, now);
      }

      this.refreshSearchIndex(fileId);
    });

    transaction();
  }

  addManualTag(fileId: string, tag: string): void {
    const normalizedTag = tag.trim();
    if (!normalizedTag) {
      throw new Error("Tag cannot be empty");
    }

    this.db
      .prepare(
        "INSERT OR IGNORE INTO tags (id, file_id, tag, source, created_at) VALUES (?, ?, ?, 'manual', ?)"
      )
      .run(crypto.randomUUID(), fileId, normalizedTag, new Date().toISOString());

    this.refreshSearchIndex(fileId);
  }

  deleteTag(fileId: string, tag: string): void {
    this.db.prepare("DELETE FROM tags WHERE file_id = ? AND tag = ?").run(fileId, tag);
    this.refreshSearchIndex(fileId);
  }

  getTagCloud(): TagCloudItem[] {
    return this.db
      .prepare(
        `SELECT tag, COUNT(*) AS count
         FROM tags
         GROUP BY tag
         ORDER BY count DESC, tag ASC`
      )
      .all() as TagCloudItem[];
  }

  clearLibrary(): string[] {
    const fileRows = this.db
      .prepare("SELECT stored_path FROM files")
      .all() as Array<{ stored_path: string }>;

    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM tags").run();
      this.db.prepare("DELETE FROM analysis").run();
      this.db.prepare("DELETE FROM files").run();
      this.db.prepare("DELETE FROM search_index").run();
    });

    transaction();

    return fileRows.map((row) => row.stored_path);
  }

  listTrackedSourceFilesByRoots(roots: string[]): Array<{ id: string; sourcePath: string }> {
    const normalizedRoots = [...new Set(roots.map((root) => path.normalize(root.trim())).filter(Boolean))];
    if (normalizedRoots.length === 0) {
      return [];
    }

    const clauses = normalizedRoots.map(() => "(source_path = ? OR source_path LIKE ?)");
    const params: string[] = [];
    for (const root of normalizedRoots) {
      params.push(root, `${root}${path.sep}%`);
    }

    const rows = this.db
      .prepare(
        `SELECT id, source_path
         FROM files
         WHERE source_path IS NOT NULL
           AND (${clauses.join(" OR ")})`
      )
      .all(...params) as Array<{ id: string; source_path: string | null }>;

    return rows
      .filter((row): row is { id: string; source_path: string } => typeof row.source_path === "string")
      .map((row) => ({ id: row.id, sourcePath: row.source_path }));
  }

  removeFilesBySourcePaths(sourcePaths: string[]): string[] {
    const normalizedPaths = [
      ...new Set(sourcePaths.map((sourcePath) => path.normalize(sourcePath.trim())).filter(Boolean))
    ];
    if (normalizedPaths.length === 0) {
      return [];
    }

    const placeholders = normalizedPaths.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT id, stored_path
         FROM files
         WHERE source_path IN (${placeholders})`
      )
      .all(...normalizedPaths) as Array<{ id: string; stored_path: string }>;

    if (rows.length === 0) {
      return [];
    }

    const deleteSearchIndex = this.db.prepare("DELETE FROM search_index WHERE file_id = ?");
    const deleteFile = this.db.prepare("DELETE FROM files WHERE id = ?");
    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        deleteSearchIndex.run(row.id);
        deleteFile.run(row.id);
      }
    });
    transaction();

    return rows.map((row) => row.stored_path);
  }

  refreshSearchIndex(fileId: string): void {
    const row = this.db
      .prepare(
        `SELECT
          f.id,
          f.original_name,
          COALESCE(a.summary, '') AS summary,
          COALESCE(a.main_topic, '') AS main_topic,
          COALESCE(a.ocr_text, '') AS ocr_text,
          COALESCE(a.entities_json, '[]') AS entities_json,
          COALESCE((SELECT group_concat(tag, ' ') FROM tags t WHERE t.file_id = f.id), '') AS tag_blob
         FROM files f
         LEFT JOIN analysis a ON a.file_id = f.id
         WHERE f.id = ?`
      )
      .get(fileId) as
      | {
          id: string;
          original_name: string;
          summary: string;
          main_topic: string;
          ocr_text: string;
          entities_json: string;
          tag_blob: string;
        }
      | undefined;

    if (!row) {
      this.db.prepare("DELETE FROM search_index WHERE file_id = ?").run(fileId);
      return;
    }

    const entities = parseJsonArray<string>(row.entities_json, []).join(" ");
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM search_index WHERE file_id = ?").run(fileId);
      this.db
        .prepare(
          `INSERT INTO search_index (file_id, filename, summary, main_topic, tags, ocr_text, entities)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          row.id,
          row.original_name,
          row.summary,
          row.main_topic,
          row.tag_blob,
          row.ocr_text,
          entities
        );
    });

    transaction();
  }
}
