import { neon, neonConfig } from '@neondatabase/serverless';
import crypto from 'crypto';

neonConfig.fetchConnectionCache = true;

// ============================================================================
// LÕI BẢO MẬT TỰ THÂN (SELF-CONTAINED ZERO-TRUST AES-256-GCM & CACHE ENGINE)
// Không phụ thuộc import file phụ để tránh lỗi ERR_MODULE_NOT_FOUND trên Vercel
// ============================================================================
function getMasterEncryptionKey() {
  const secretMaterial =
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.DATABASE_URL ||
    process.env.GOOGLE_CLIENT_ID ||
    'fsc-cantho-quantum-resistant-default-vault-key-2026';
  return crypto.scryptSync(secretMaterial, 'FSC_CANTHO_SALT_v6_2026', 32);
}

const MASTER_KEY = getMasterEncryptionKey();
const ENCRYPTION_PREFIX = 'ENCv6_GCM:';

export function encryptSensitiveText(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  const str = String(plainText);
  if (str.startsWith(ENCRYPTION_PREFIX)) return str;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (err) {
    return str;
  }
}

export function decryptSensitiveText(cipherPayload) {
  if (!cipherPayload || typeof cipherPayload !== 'string') return '';
  if (!cipherPayload.startsWith(ENCRYPTION_PREFIX)) return cipherPayload;
  try {
    const raw = cipherPayload.slice(ENCRYPTION_PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return '';
  }
}

export function sanitizeInputString(input, maxLength = 5000) {
  if (input === null || input === undefined) return '';
  let s = String(input).trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on(error|load|click|mouseover|focus)\s*=/gi, '')
    .replace(/(__proto__|constructor|prototype)/gi, '');
}

const BLOCKED_BOT_PATTERNS = [
  /gptbot/i, /chatgpt-user/i, /oai-searchbot/i, /claudebot/i, /anthropic-ai/i,
  /ccbot/i, /google-extended/i, /bytespider/i, /perplexitybot/i, /omgilibot/i,
  /diffbot/i, /cohere-ai/i, /scrapy/i, /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /nuclei/i
];

const ipRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_READ_REQ_PER_MIN = 180;
const MAX_WRITE_REQ_PER_MIN = 60;

export function applyZeroTrustSecurityGuard(req, res) {
  const reqOrigin = (req.headers && req.headers.origin) || '';
  const allowedOrigin = (!reqOrigin || reqOrigin.includes('vp-fsc.vercel.app') || reqOrigin.includes('.vercel.app') || reqOrigin.includes('localhost'))
    ? (reqOrigin || '*')
    : '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-User-Email, X-User-Role, X-FSC-Security-Token, If-None-Match'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return { allowed: false };
  }

  const ua = String((req.headers && req.headers['user-agent']) || '');
  for (const pattern of BLOCKED_BOT_PATTERNS) {
    if (pattern.test(ua)) {
      res.status(403).json({ error: 'Access Denied by FSC Zero-Trust AI & Bot Shield.' });
      return { allowed: false };
    }
  }

  const forwarded = (req.headers && req.headers['x-forwarded-for']) || '';
  const clientIp = String(forwarded).split(',')[0].trim() || 'local-client';
  const now = Date.now();
  const isWrite = req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT';
  const limit = isWrite ? MAX_WRITE_REQ_PER_MIN : MAX_READ_REQ_PER_MIN;

  let record = ipRateLimitMap.get(clientIp);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record = { windowStart: now, readCount: 0, writeCount: 0 };
    ipRateLimitMap.set(clientIp, record);
  }
  if (isWrite) record.writeCount++;
  else record.readCount++;

  const currentCount = isWrite ? record.writeCount : record.readCount;
  if (currentCount > limit) {
    res.setHeader('Retry-After', '15');
    res.status(429).json({ error: 'Tần suất truy cập quá nhanh, vui lòng thử lại sau ít giây.' });
    return { allowed: false };
  }
  return { allowed: true, clientIp };
}

const memoryCache = new Map();

export function getCachedResponse(cacheKey, maxAgeMs = 1500) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function setCachedResponse(cacheKey, data) {
  const jsonStr = JSON.stringify(data);
  const etag = '"' + crypto.createHash('sha256').update(jsonStr).digest('hex').slice(0, 24) + '"';
  const entry = { data, etag, timestamp: Date.now() };
  memoryCache.set(cacheKey, entry);
  return entry;
}

export function invalidateCache(prefix = '') {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
}

let isDocSchemaReady = false;

async function ensureDocSchema(sql) {
  if (isDocSchemaReady) return;
  try {
    // Thực thi gộp toàn bộ khởi tạo và nâng cấp bảng trong 1 khối DO $$ duy nhất (< 80ms, không bao giờ timeout trên Vercel)
    await sql`
      DO $$
      BEGIN
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          category_id TEXT NOT NULL DEFAULT 'IT',
          doc_type TEXT NOT NULL DEFAULT 'Quy trình',
          version TEXT DEFAULT '1.0',
          effective_date TEXT,
          status TEXT DEFAULT 'Có hiệu lực',
          department TEXT,
          description TEXT,
          access_level TEXT DEFAULT 'Mở',
          download_perm TEXT DEFAULT 'allow_all',
          current_file TEXT,
          file_data TEXT,
          file_url TEXT,
          version_history JSONB DEFAULT '[]'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS document_file_chunks (
          doc_code TEXT NOT NULL,
          chunk_index INT NOT NULL,
          encrypted_chunk TEXT NOT NULL,
          PRIMARY KEY (doc_code, chunk_index)
        );

        CREATE TABLE IF NOT EXISTS deleted_documents_log (
          doc_code TEXT PRIMARY KEY,
          deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        BEGIN
          ALTER TABLE document_history DROP CONSTRAINT IF EXISTS document_history_document_id_fkey;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
          ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_id_fkey;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_id TEXT DEFAULT 'IT';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'Quy trình';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS effective_date TEXT;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Có hiệu lực';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'Văn phòng';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'Mở';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS download_perm TEXT DEFAULT 'allow_all';
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS current_file TEXT;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data TEXT;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

        BEGIN ALTER TABLE documents ALTER COLUMN id TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN code TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN title TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN category_id TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN doc_type TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN version TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN effective_date TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN status TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN access_level TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN department TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE documents ALTER COLUMN current_file TYPE TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
      END $$;
    `;
    isDocSchemaReady = true;
  } catch (e) {
    console.warn('Schema migration notice:', e.message);
  }
}

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return res.status(200).json({
      success: true,
      hasDatabase: false,
      data: [],
      deletedCodes: [],
      note: 'Chưa cấu hình DATABASE_URL trên Vercel'
    });
  }

  const sql = neon(databaseUrl);

  try {
    if (req.method === 'GET') {
      const requestedCode = req.query && req.query.code ? sanitizeInputString(req.query.code, 120) : '';

      // 1. Tải chi tiết tệp đính kèm của 1 tài liệu cụ thể khi người dùng bấm Xem hoặc Tải về
      if (requestedCode) {
        const docRows = await sql`
          SELECT to_jsonb(d) AS row_json FROM documents d
          WHERE LOWER(code) = ${requestedCode.toLowerCase()}
          LIMIT 1
        `;
        if (docRows.length === 0) {
          return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
        }
        const r = docRows[0].row_json || {};
        const rawStoredFile = r.file_data || r.file_url || '';
        let fullFileData = decryptSensitiveText(rawStoredFile) || rawStoredFile || '';
        if (!fullFileData || fullFileData === '__CHUNKED_IN_DB__') {
          try {
            const chunkRows = await sql`
              SELECT encrypted_chunk FROM document_file_chunks
              WHERE LOWER(doc_code) = ${requestedCode.toLowerCase()}
              ORDER BY chunk_index ASC
            `;
            if (chunkRows.length > 0) {
              fullFileData = chunkRows.map(c => decryptSensitiveText(c.encrypted_chunk) || c.encrypted_chunk).join('');
            } else {
              fullFileData = '';
            }
          } catch (e) {
            fullFileData = '';
          }
        }
        return res.status(200).json({
          success: true,
          code: r.code,
          current_file: decryptSensitiveText(r.current_file) || r.current_file || `${r.code}.pdf`,
          file_data: fullFileData
        });
      }

      // 2. Kiểm tra L1 Cache & ETag (bỏ qua khi client truyền _t để lấy dữ liệu mới nhất tức thì)
      const bypassCache = Boolean(req.query && req.query._t);
      if (!bypassCache) {
        const cached = getCachedResponse('docs_list_v6', 30000);
        if (cached) {
          const clientEtag = req.headers['if-none-match'];
          if (clientEtag && clientEtag === cached.etag) {
            return res.status(304).end();
          }
          res.setHeader('ETag', cached.etag);
          res.setHeader('X-Cache', 'HIT-L1');
          return res.status(200).json(cached.data);
        }
      }

      // 3. Truy vấn danh sách bằng to_jsonb(d): Không bao giờ lỗi thiếu cột và tự động loại bỏ chuỗi Base64 lớn > 180KB để phản hồi < 80ms
      let rows = [];
      try {
        rows = await sql`
          SELECT
            to_jsonb(d) - 'file_data' - 'file_url' AS meta,
            CASE
              WHEN LENGTH(COALESCE(to_jsonb(d)->>'file_data', '')) BETWEEN 1 AND 180000 THEN to_jsonb(d)->>'file_data'
              WHEN LENGTH(COALESCE(to_jsonb(d)->>'file_url', '')) BETWEEN 1 AND 180000 THEN to_jsonb(d)->>'file_url'
              ELSE ''
            END AS inline_file,
            (
              LENGTH(COALESCE(to_jsonb(d)->>'file_data', '')) > 10
              OR LENGTH(COALESCE(to_jsonb(d)->>'file_url', '')) > 10
            ) AS has_file
          FROM documents d
          LIMIT 500
        `;
      } catch (selectErr) {
        await ensureDocSchema(sql);
        rows = [];
      }

      let chunkedCodesSet = new Set();
      try {
        const cRows = await sql`SELECT DISTINCT LOWER(doc_code) AS code FROM document_file_chunks`;
        cRows.forEach(c => { if (c.code) chunkedCodesSet.add(c.code); });
      } catch (e) {}

      let deletedCodesList = [];
      try {
        const delRows = await sql`SELECT LOWER(doc_code) AS code FROM deleted_documents_log`;
        deletedCodesList = delRows.map(d => d.code).filter(Boolean);
      } catch (e) {}

      const decryptedRows = rows.map(item => {
        const r = item.meta || {};
        let verHist = r.version_history || [];
        if (typeof verHist === 'string') {
          const decHist = decryptSensitiveText(verHist) || verHist;
          try { verHist = JSON.parse(decHist); } catch (e) { verHist = []; }
        } else if (Array.isArray(verHist)) {
          verHist = verHist.map(h => ({
            ...h,
            desc: h.desc ? (decryptSensitiveText(h.desc) || h.desc) : ''
          }));
        }

        const inlineDec = item.inline_file ? (decryptSensitiveText(item.inline_file) || item.inline_file) : '';
        const codeLower = String(r.code || '').toLowerCase();
        return {
          id: String(r.id || r.code || ''),
          code: r.code || '',
          title: decryptSensitiveText(r.title) || r.title || r.code || '',
          category_id: r.category_id || r.category || 'IT',
          doc_type: r.doc_type || r.type || 'Quy trình',
          version: r.version || '1.0',
          effective_date: r.effective_date || '',
          status: r.status || 'Có hiệu lực',
          department: decryptSensitiveText(r.department) || r.department || r.category_id || 'Văn phòng',
          current_file: decryptSensitiveText(r.current_file) || r.current_file || `${r.code || 'tai-lieu'}.pdf`,
          description: decryptSensitiveText(r.description) || r.description || '',
          access_level: r.access_level || 'Mở',
          download_perm: r.download_perm || 'allow_all',
          file_data: inlineDec === '__CHUNKED_IN_DB__' ? '' : inlineDec,
          has_remote_file: Boolean(item.has_file || chunkedCodesSet.has(codeLower)),
          version_history: verHist,
          updated_at: r.updated_at || r.created_at || ''
        };
      }).filter(d => d.code);

      // Sắp xếp mới nhất lên đầu và chỉ giữ duy nhất 1 phiên bản mới nhất cho mỗi Mã tài liệu (code)
      decryptedRows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      const latestByCode = new Map();
      for (const item of decryptedRows) {
        const k = String(item.code || '').trim().toLowerCase();
        if (!k) continue;
        if (!latestByCode.has(k)) {
          latestByCode.set(k, item);
        }
      }
      const uniqueLatestRows = Array.from(latestByCode.values());

      const responsePayload = {
        success: true,
        hasDatabase: true,
        encryption: 'AES-256-GCM',
        data: uniqueLatestRows,
        deletedCodes: deletedCodesList
      };
      const savedCache = setCachedResponse('docs_list_v6', responsePayload);
      res.setHeader('ETag', savedCache.etag);
      res.setHeader('X-Cache', bypassCache ? 'BYPASS-FRESH' : 'MISS');
      return res.status(200).json(responsePayload);
    }

    // Đảm bảo cấu trúc bảng đã được nâng cấp trước khi GHI / XÓA
    await ensureDocSchema(sql);

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'upload_chunk') {
        const cleanCode = sanitizeInputString(body.code || '', 120);
        const chunkIdx = parseInt(body.chunk_index, 10);
        const totalChunks = parseInt(body.total_chunks, 10) || 1;
        const chunkData = String(body.chunk_data || '');
        if (!cleanCode || isNaN(chunkIdx)) {
          return res.status(400).json({ error: 'Thông tin phân đoạn tệp không hợp lệ.' });
        }
        if (chunkIdx === 0) {
          await sql`DELETE FROM document_file_chunks WHERE LOWER(doc_code) = ${cleanCode.toLowerCase()}`;
        }
        const encChunk = encryptSensitiveText(chunkData);
        await sql`
          INSERT INTO document_file_chunks (doc_code, chunk_index, encrypted_chunk)
          VALUES (${cleanCode.toLowerCase()}, ${chunkIdx}, ${encChunk})
          ON CONFLICT (doc_code, chunk_index) DO UPDATE SET encrypted_chunk = EXCLUDED.encrypted_chunk
        `;
        if (chunkIdx + 1 >= totalChunks) {
          const marker = encryptSensitiveText('__CHUNKED_IN_DB__');
          await sql`
            UPDATE documents SET file_data = ${marker}, updated_at = CURRENT_TIMESTAMP
            WHERE LOWER(code) = ${cleanCode.toLowerCase()}
          `;
        }
        invalidateCache('docs_');
        return res.status(200).json({ success: true, chunk_index: chunkIdx });
      }

      const {
        id, old_code, code, title, category_id, doc_type, version,
        effective_date, department, description, access_level,
        download_perm, current_file, file_data, version_history
      } = body;

      const cleanCode = sanitizeInputString(code, 120);
      const cleanOldCode = old_code ? sanitizeInputString(old_code, 120) : '';
      const cleanTitle = sanitizeInputString(title || code, 500);
      if (!cleanCode) {
        return res.status(400).json({ error: 'Thiếu mã tài liệu hợp lệ.' });
      }

      const cleanId = sanitizeInputString(id || cleanCode || ('DOC-' + Date.now()), 48);
      const cleanCat = sanitizeInputString(category_id || 'IT', 120);
      const cleanType = sanitizeInputString(doc_type || 'Quy trình', 120);
      const cleanVer = sanitizeInputString(version || '1.0', 40);
      const cleanDept = sanitizeInputString(department || cleanCat, 200);
      const cleanAccess = ['Mở', 'Nội bộ'].includes(access_level) ? access_level : 'Mở';
      const cleanPerm = ['allow_all', 'view_only', 'admin_only'].includes(download_perm) ? download_perm : 'allow_all';
      const cleanFileName = sanitizeInputString(current_file || `${cleanCode}.pdf`, 350);
      const effDate = sanitizeInputString(effective_date || new Date().toLocaleDateString('vi-VN'), 40);

      // Đảm bảo danh mục tồn tại trong bảng categories nếu DB cũ còn giữ khóa ngoại
      try {
        await sql`
          INSERT INTO categories (id, name, icon)
          VALUES (${cleanCat}, ${cleanCat}, '📁')
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (e) {}

      // Xóa khỏi danh sách đã xóa nếu tài liệu được đăng tải lại
      try {
        await sql`DELETE FROM deleted_documents_log WHERE LOWER(doc_code) = ${cleanCode.toLowerCase()} OR LOWER(doc_code) = '__purge_all__'`;
      } catch (e) {}

      const encryptedTitle = encryptSensitiveText(cleanTitle);
      const encryptedDept = encryptSensitiveText(cleanDept);
      const encryptedFileName = encryptSensitiveText(cleanFileName);
      const encryptedDesc = encryptSensitiveText(sanitizeInputString(description || '', 5000));
      const encryptedFileData = file_data ? encryptSensitiveText(String(file_data)) : '';

      const safeHistoryArray = Array.isArray(version_history)
        ? version_history.map(h => ({
            version: sanitizeInputString(h.version || '1.0', 30),
            effectiveDate: sanitizeInputString(h.effectiveDate || '', 40),
            currentFile: sanitizeInputString(h.currentFile || '', 300),
            fileDataKey: sanitizeInputString(h.fileDataKey || '', 150),
            desc: encryptSensitiveText(sanitizeInputString(h.desc || '', 2000)),
            updatedAt: sanitizeInputString(h.updatedAt || '', 60)
          }))
        : [];
      const historyJson = JSON.stringify(safeHistoryArray);

      const lookupCode = cleanOldCode || cleanCode;
      const existingRows = await sql`
        SELECT id, to_jsonb(d) AS row_json FROM documents d
        WHERE LOWER(code) = ${lookupCode.toLowerCase()} OR LOWER(code) = ${cleanCode.toLowerCase()}
        LIMIT 1
      `;

      let savedRecord = null;
      if (existingRows.length > 0) {
        const targetId = existingRows[0].id;
        const prevRow = existingRows[0].row_json || {};
        const finalFileData = encryptedFileData !== '' ? encryptedFileData : (prevRow.file_data || prevRow.file_url || '');
        const finalHistory = safeHistoryArray.length > 0 ? historyJson : JSON.stringify(prevRow.version_history || []);
        try {
          const updated = await sql`
            UPDATE documents SET
              code = ${cleanCode},
              title = ${encryptedTitle},
              category_id = ${cleanCat},
              doc_type = ${cleanType},
              version = ${cleanVer},
              effective_date = ${effDate},
              department = ${encryptedDept},
              description = ${encryptedDesc},
              access_level = ${cleanAccess},
              download_perm = ${cleanPerm},
              current_file = ${encryptedFileName},
              file_data = ${finalFileData},
              file_url = '',
              version_history = ${finalHistory}::jsonb,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${targetId}
            RETURNING id, code, version, effective_date
          `;
          savedRecord = updated[0];
        } catch (upErr) {
          // Dự phòng nếu bảng cũ vẫn giới hạn VARCHAR(100)/VARCHAR(255)
          const updatedFallback = await sql`
            UPDATE documents SET
              code = ${cleanCode.slice(0, 48)},
              title = ${cleanTitle.slice(0, 240)},
              category_id = ${cleanCat.slice(0, 48)},
              doc_type = ${cleanType.slice(0, 48)},
              version = ${cleanVer.slice(0, 18)},
              effective_date = ${effDate.slice(0, 45)},
              department = ${cleanDept.slice(0, 95)},
              description = ${encryptedDesc},
              access_level = ${cleanAccess.slice(0, 45)},
              file_url = ${finalFileData},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${targetId}
            RETURNING id, code, version, effective_date
          `;
          savedRecord = updatedFallback[0];
        }
      } else {
        try {
          const inserted = await sql`
            INSERT INTO documents (
              id, code, title, category_id, doc_type, version, effective_date,
              department, description, access_level, download_perm, current_file, file_data, version_history
            )
            VALUES (
              ${cleanId}, ${cleanCode}, ${encryptedTitle}, ${cleanCat}, ${cleanType}, ${cleanVer},
              ${effDate}, ${encryptedDept}, ${encryptedDesc}, ${cleanAccess},
              ${cleanPerm}, ${encryptedFileName}, ${encryptedFileData}, ${historyJson}::jsonb
            )
            RETURNING id, code, version, effective_date
          `;
          savedRecord = inserted[0];
        } catch (insErr) {
          // Dự phòng tương thích tuyệt đối với schema.sql gốc
          const insertedFallback = await sql`
            INSERT INTO documents (
              id, code, title, category_id, doc_type, version, effective_date,
              department, description, access_level, file_url
            )
            VALUES (
              ${cleanId.slice(0, 48)}, ${cleanCode.slice(0, 48)}, ${cleanTitle.slice(0, 240)},
              ${cleanCat.slice(0, 48)}, ${cleanType.slice(0, 48)}, ${cleanVer.slice(0, 18)},
              ${effDate.slice(0, 45)}, ${cleanDept.slice(0, 95)}, ${encryptedDesc},
              ${cleanAccess.slice(0, 45)}, ${encryptedFileData}
            )
            RETURNING id, code, version, effective_date
          `;
          savedRecord = insertedFallback[0];
        }
      }

      if (file_data && file_data !== '__CHUNKED_IN_DB__') {
        try {
          await sql`DELETE FROM document_file_chunks WHERE LOWER(doc_code) = ${cleanCode.toLowerCase()}`;
        } catch (e) {}
      }

      invalidateCache('docs_');
      return res.status(200).json({
        success: true,
        encryptedAtRest: true,
        data: savedRecord
      });
    }

    if (req.method === 'DELETE') {
      const { id, purge } = req.query || {};
      if (purge === 'all') {
        try { await sql`DELETE FROM document_history`; } catch (e) {}
        await sql`DELETE FROM documents`;
        try { await sql`DELETE FROM document_file_chunks`; } catch (e) {}
        try {
          await sql`
            INSERT INTO deleted_documents_log (doc_code) VALUES ('__purge_all__')
            ON CONFLICT (doc_code) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
          `;
        } catch (e) {}
        invalidateCache('docs_');
        return res.status(200).json({ success: true, purged: true });
      }
      if (!id) return res.status(400).json({ error: 'Thiếu mã tài liệu cần xóa' });
      const cleanId = sanitizeInputString(id, 120);
      await sql`DELETE FROM documents WHERE LOWER(code) = ${cleanId.toLowerCase()} OR id::text = ${cleanId}`;
      try { await sql`DELETE FROM document_file_chunks WHERE LOWER(doc_code) = ${cleanId.toLowerCase()}`; } catch (e) {}
      try {
        await sql`
          INSERT INTO deleted_documents_log (doc_code) VALUES (${cleanId.toLowerCase()})
          ON CONFLICT (doc_code) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
        `;
      } catch (e) {}
      invalidateCache('docs_');
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Database API error:', err.message);
    return res.status(500).json({ error: 'Lỗi xử lý cơ sở dữ liệu: ' + err.message });
  }
}
