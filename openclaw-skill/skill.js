const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const TAGLINE_DB_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'TagLine',
  'tagmind.db'
);
const DEFAULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 50;
const MAX_TAG_LIMIT = 100;

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeLimit(value, defaultValue = DEFAULT_LIMIT, maxValue = MAX_RESULT_LIMIT) {
  if (!Number.isInteger(value) || value <= 0) {
    return defaultValue;
  }
  return Math.min(value, maxValue);
}

function normalizeFileType(fileType) {
  const normalized = normalizeText(fileType).toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function truncateText(value, maxLength = 180) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function toAbsolutePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return null;
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function buildFtsQuery(rawQuery) {
  const tokens = normalizeText(rawQuery).toLowerCase().match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) {
    return null;
  }
  return tokens.map((token) => `${token}*`).join(' AND ');
}

function hasTable(db, tableName) {
  const row = db
    .prepare('SELECT 1 AS present FROM sqlite_master WHERE name = ? LIMIT 1')
    .get(tableName);
  return Boolean(row);
}

function createMissingDbResult(dbPath) {
  return {
    ok: false,
    message: `TagLine database was not found at ${dbPath}.`,
    dbPath,
    guidance: [
      'Open the TagLine desktop app on this Mac at least once.',
      'Import a file so TagLine initializes the SQLite database.',
      'Expected location: ~/Library/Application Support/TagLine/tagmind.db'
    ]
  };
}

function createDatabaseOpenError(dbPath, error) {
  const details = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    message: `Unable to open TagLine database at ${dbPath}.`,
    dbPath,
    details,
    guidance: [
      'Verify TagLine is installed and has been opened on this Mac.',
      'Check file permissions for ~/Library/Application Support/TagLine.',
      'If the DB is missing, launch TagLine and add at least one file.'
    ]
  };
}

function openTagLineDatabase() {
  const dbPath = TAGLINE_DB_PATH;

  if (!fs.existsSync(dbPath)) {
    return { db: null, dbPath, error: createMissingDbResult(dbPath) };
  }

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return { db, dbPath, error: null };
  } catch (error) {
    return { db: null, dbPath, error: createDatabaseOpenError(dbPath, error) };
  }
}

function appendOptionalFilters(whereClauses, params, { fileType, sentiment, colour }) {
  const normalizedFileType = normalizeFileType(fileType);
  if (normalizedFileType) {
    whereClauses.push('LOWER(f.extension) = ?');
    params.push(normalizedFileType);
  }

  const normalizedSentiment = normalizeText(sentiment).toLowerCase();
  if (normalizedSentiment) {
    whereClauses.push("LOWER(COALESCE(a.sentiment, '')) = ?");
    params.push(normalizedSentiment);
  }

  const normalizedColour = normalizeText(colour).toLowerCase();
  if (normalizedColour) {
    whereClauses.push(`EXISTS (
      SELECT 1
      FROM json_each(COALESCE(a.dominant_colors_json, '[]')) dc
      WHERE LOWER(COALESCE(json_extract(dc.value, '$.name'), '')) = ?
         OR LOWER(COALESCE(json_extract(dc.value, '$.hex'), '')) = ?
    )`);
    params.push(normalizedColour, normalizedColour);
  }
}

function buildLikeSearchClause() {
  return `(
    LOWER(f.original_name) LIKE ?
    OR LOWER(COALESCE(a.summary, '')) LIKE ?
    OR LOWER(COALESCE(a.main_topic, '')) LIKE ?
    OR LOWER(COALESCE(a.ocr_text, '')) LIKE ?
    OR EXISTS (
      SELECT 1
      FROM tags t
      WHERE t.file_id = f.id
        AND LOWER(t.tag) LIKE ?
    )
  )`;
}

function buildLikeSearchParams(query) {
  const likeQuery = `%${query.toLowerCase()}%`;
  return [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery];
}

function runFileQuery(db, whereClauses, params, limit) {
  const sql = `
    SELECT
      f.id,
      f.original_name,
      f.stored_path,
      f.extension,
      f.uploaded_at,
      f.status,
      COALESCE(a.summary, '') AS summary,
      COALESCE(a.main_topic, '') AS main_topic,
      COALESCE(a.sentiment, '') AS sentiment,
      COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
    FROM files f
    LEFT JOIN analysis a ON a.file_id = f.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY f.uploaded_at DESC
    LIMIT ?`;

  return db.prepare(sql).all(...params, limit);
}

function mapFileSummaryRow(row) {
  const tags = parseJsonArray(row.tags_json)
    .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    .slice(0, 8);

  return {
    id: row.id,
    name: row.original_name,
    path: toAbsolutePath(row.stored_path),
    fileType: row.extension,
    uploadedAt: row.uploaded_at,
    status: row.status,
    sentiment: row.sentiment || null,
    mainTopic: row.main_topic || null,
    summary: truncateText(row.summary, 180),
    tags
  };
}

function search_files(args = {}, context = {}) {
  void context;
  const query = normalizeText(args.query);
  const limit = normalizeLimit(args.limit, 10, MAX_RESULT_LIMIT);
  const whereClauses = ['1=1'];
  const params = [];

  appendOptionalFilters(whereClauses, params, {
    fileType: args.fileType,
    sentiment: args.sentiment,
    colour: args.colour
  });

  const { db, dbPath, error } = openTagLineDatabase();
  if (error || !db) {
    return error;
  }

  try {
    let rows = [];
    let searchMode = 'recent';

    if (query) {
      const ftsQuery = buildFtsQuery(query);
      if (ftsQuery && hasTable(db, 'search_index')) {
        try {
          const ftsWhereClauses = [...whereClauses];
          const ftsParams = [...params];
          ftsWhereClauses.push(
            'f.id IN (SELECT file_id FROM search_index WHERE search_index MATCH ?)'
          );
          ftsParams.push(ftsQuery);
          rows = runFileQuery(db, ftsWhereClauses, ftsParams, limit);
          searchMode = 'fts5';
        } catch {
          const fallbackWhereClauses = [...whereClauses, buildLikeSearchClause()];
          const fallbackParams = [...params, ...buildLikeSearchParams(query)];
          rows = runFileQuery(db, fallbackWhereClauses, fallbackParams, limit);
          searchMode = 'like';
        }
      } else {
        const fallbackWhereClauses = [...whereClauses, buildLikeSearchClause()];
        const fallbackParams = [...params, ...buildLikeSearchParams(query)];
        rows = runFileQuery(db, fallbackWhereClauses, fallbackParams, limit);
        searchMode = 'like';
      }
    } else {
      rows = runFileQuery(db, whereClauses, params, limit);
    }

    const results = rows.map(mapFileSummaryRow);
    return {
      ok: true,
      dbPath,
      searchMode,
      query: query || null,
      count: results.length,
      results,
      message: results.length === 0 ? 'No matching files found.' : undefined
    };
  } catch (queryError) {
    const details = queryError instanceof Error ? queryError.message : String(queryError);
    return {
      ok: false,
      message: 'Failed to query TagLine database for search_files.',
      dbPath,
      details
    };
  } finally {
    db.close();
  }
}

function get_file_detail(args = {}, context = {}) {
  void context;
  const fileId = normalizeText(args.fileId);

  if (!fileId) {
    return {
      ok: false,
      message: 'fileId is required.'
    };
  }

  const { db, dbPath, error } = openTagLineDatabase();
  if (error || !db) {
    return error;
  }

  try {
    const row = db
      .prepare(
        `SELECT
          f.id,
          f.original_name,
          f.stored_path,
          f.mime_type,
          f.extension,
          f.size_bytes,
          f.uploaded_at,
          f.processed_at,
          f.status,
          f.error_message,
          COALESCE(a.main_topic, '') AS main_topic,
          COALESCE(a.summary, '') AS summary,
          COALESCE(a.scene_description, '') AS scene_description,
          COALESCE(a.mood_tone, '') AS mood_tone,
          COALESCE(a.sentiment, '') AS sentiment,
          COALESCE(a.dominant_colors_json, '[]') AS dominant_colors_json,
          COALESCE(a.entities_json, '[]') AS entities_json,
          COALESCE(a.ocr_text, '') AS ocr_text,
          COALESCE(a.model_used, '') AS model_used,
          COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
        FROM files f
        LEFT JOIN analysis a ON a.file_id = f.id
        WHERE f.id = ?
        LIMIT 1`
      )
      .get(fileId);

    if (!row) {
      return {
        ok: false,
        dbPath,
        message: `No file found for id \"${fileId}\".`
      };
    }

    const tags = parseJsonArray(row.tags_json)
      .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
      .slice(0, 20);
    const dominantColors = parseJsonArray(row.dominant_colors_json).slice(0, 10);
    const entities = parseJsonArray(row.entities_json)
      .filter((entity) => typeof entity === 'string' && entity.trim().length > 0)
      .slice(0, 20);

    const analysis =
      row.main_topic ||
      row.summary ||
      row.scene_description ||
      row.mood_tone ||
      row.sentiment ||
      row.ocr_text ||
      dominantColors.length > 0 ||
      entities.length > 0
        ? {
            mainTopic: row.main_topic || null,
            summary: truncateText(row.summary, 300),
            sceneDescription: truncateText(row.scene_description, 220),
            moodTone: row.mood_tone || null,
            sentiment: row.sentiment || null,
            dominantColors,
            entities,
            ocrExcerpt: truncateText(row.ocr_text, 300),
            modelUsed: row.model_used || null
          }
        : null;

    return {
      ok: true,
      dbPath,
      file: {
        id: row.id,
        name: row.original_name,
        path: toAbsolutePath(row.stored_path),
        mimeType: row.mime_type,
        fileType: row.extension,
        sizeBytes: row.size_bytes,
        uploadedAt: row.uploaded_at,
        processedAt: row.processed_at,
        status: row.status,
        errorMessage: row.error_message || null
      },
      tags,
      analysis
    };
  } catch (queryError) {
    const details = queryError instanceof Error ? queryError.message : String(queryError);
    return {
      ok: false,
      message: 'Failed to query TagLine database for get_file_detail.',
      dbPath,
      details
    };
  } finally {
    db.close();
  }
}

function list_tags(args = {}, context = {}) {
  void context;
  const requestedSort = normalizeText(args.sortBy).toLowerCase();
  const limit = normalizeLimit(args.limit, 25, MAX_TAG_LIMIT);
  const sortBy = requestedSort || 'count';

  const sortSql = {
    count: 'usage_count DESC, LOWER(tag) ASC',
    alpha: 'LOWER(tag) ASC',
    recent: 'last_used_at DESC, LOWER(tag) ASC'
  };

  const orderBy = sortSql[sortBy] || sortSql.count;

  const { db, dbPath, error } = openTagLineDatabase();
  if (error || !db) {
    return error;
  }

  try {
    const rows = db
      .prepare(
        `SELECT
          tag,
          COUNT(*) AS usage_count,
          COUNT(DISTINCT file_id) AS file_count,
          MAX(created_at) AS last_used_at
        FROM tags
        GROUP BY tag
        ORDER BY ${orderBy}
        LIMIT ?`
      )
      .all(limit);

    return {
      ok: true,
      dbPath,
      sortBy,
      count: rows.length,
      tags: rows.map((row) => ({
        tag: row.tag,
        count: row.usage_count,
        fileCount: row.file_count,
        lastUsedAt: row.last_used_at
      })),
      message: rows.length === 0 ? 'No tags found.' : undefined
    };
  } catch (queryError) {
    const details = queryError instanceof Error ? queryError.message : String(queryError);
    return {
      ok: false,
      message: 'Failed to query TagLine database for list_tags.',
      dbPath,
      details
    };
  } finally {
    db.close();
  }
}

function get_recent_files(args = {}, context = {}) {
  void context;
  const limit = normalizeLimit(args.limit, 10, MAX_RESULT_LIMIT);
  const fileType = normalizeFileType(args.fileType);
  const whereClauses = ['1=1'];
  const params = [];

  if (fileType) {
    whereClauses.push('LOWER(f.extension) = ?');
    params.push(fileType);
  }

  const { db, dbPath, error } = openTagLineDatabase();
  if (error || !db) {
    return error;
  }

  try {
    const rows = db
      .prepare(
        `SELECT
          f.id,
          f.original_name,
          f.stored_path,
          f.extension,
          f.uploaded_at,
          f.status,
          COALESCE(a.summary, '') AS summary,
          COALESCE(a.main_topic, '') AS main_topic,
          COALESCE(a.sentiment, '') AS sentiment,
          COALESCE((SELECT json_group_array(t.tag) FROM tags t WHERE t.file_id = f.id), '[]') AS tags_json
        FROM files f
        LEFT JOIN analysis a ON a.file_id = f.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY f.uploaded_at DESC
        LIMIT ?`
      )
      .all(...params, limit);

    const results = rows.map(mapFileSummaryRow);
    return {
      ok: true,
      dbPath,
      count: results.length,
      results,
      message: results.length === 0 ? 'No files found.' : undefined
    };
  } catch (queryError) {
    const details = queryError instanceof Error ? queryError.message : String(queryError);
    return {
      ok: false,
      message: 'Failed to query TagLine database for get_recent_files.',
      dbPath,
      details
    };
  } finally {
    db.close();
  }
}

const toolHandlers = {
  search_files,
  get_file_detail,
  list_tags,
  get_recent_files
};

module.exports = {
  toolHandlers,
  search_files,
  get_file_detail,
  list_tags,
  get_recent_files
};
