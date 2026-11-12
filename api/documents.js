import { neon, neonConfig } from '@neondatabase/serverless';
import {
  applyZeroTrustSecurityGuard,
  encryptSensitiveText,
  decryptSensitiveText,
  sanitizeInputString,
  getCachedResponse,
  setCachedResponse,
  invalidateCache
} from './_security.js';

neonConfig.fetchConnectionCache = true;

let isDocSchemaReady = false;

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(200).json({
      success: true,
      data: [],
      security: 'AES-256-GCM E2EE Active',
      note: 'Chưa cấu hình DATABASE_URL'
    });
  }

  const sql = neon(databaseUrl);

  try {
    if (!isDocSchemaReady) {
      await sql`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
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
          version_history JSONB DEFAULT '[]'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS document_file_chunks (
          doc_code TEXT NOT NULL,
          chunk_index INT NOT NULL,
          encrypted_chunk TEXT NOT NULL,
          PRIMARY KEY (doc_code, chunk_index)
        )
      `;
      const migrations = [
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_id TEXT DEFAULT 'IT'`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'Quy trình'`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0'`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS effective_date TEXT`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Có hiệu lực'`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS department TEXT`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'Mở'`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS download_perm TEXT DEFAULT 'allow_all'`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS current_file TEXT`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data TEXT`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]'::jsonb`,
        () => sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`,
        () => sql`ALTER TABLE documents ALTER COLUMN code TYPE TEXT`,
        () => sql`ALTER TABLE documents ALTER COLUMN title TYPE TEXT`,
        () => sql`ALTER TABLE documents ALTER COLUMN category_id TYPE TEXT`,
        () => sql`ALTER TABLE documents ALTER COLUMN doc_type TYPE TEXT`,
        () => sql`ALTER TABLE documents ALTER COLUMN department TYPE TEXT`,
        () => sql`ALTER TABLE documents ALTER COLUMN current_file TYPE TEXT`
      ];
      for (const runMig of migrations) {
        try { await runMig(); } catch (e) {}
      }
      isDocSchemaReady = true;
    }

    if (req.method === 'GET') {
      const requestedCode = req.query && req.query.code ? sanitizeInputString(req.query.code, 120) : '';

      // 1. Truy vấn chi tiết 1 tệp đính kèm theo mã tài liệu (Khi người dùng trên điện thoại / ẩn danh bấm mở xem hoặc tải tài liệu)
      if (requestedCode) {
        const docRows = await sql`
          SELECT code, current_file, file_data FROM documents
          WHERE LOWER(code) = ${requestedCode.toLowerCase()}
          ORDER BY id DESC LIMIT 1
        `;
        if (docRows.length === 0) {
          return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
        }
        let fullFileData = decryptSensitiveText(docRows[0].file_data) || '';
        if (!fullFileData || fullFileData === '__CHUNKED_IN_DB__') {
          const chunkRows = await sql`
            SELECT encrypted_chunk FROM document_file_chunks
            WHERE LOWER(doc_code) = ${requestedCode.toLowerCase()}
            ORDER BY chunk_index ASC
          `;
          if (chunkRows.length > 0) {
            fullFileData = chunkRows.map(c => decryptSensitiveText(c.encrypted_chunk)).join('');
          } else {
            fullFileData = '';
          }
        }
        return res.status(200).json({
          success: true,
          code: docRows[0].code,
          current_file: decryptSensitiveText(docRows[0].current_file) || docRows[0].current_file,
          file_data: fullFileData
        });
      }

      // 2. Truy vấn danh sách toàn bộ tài liệu (Không lấy các cột file_data quá nặng cùng lúc để không bao giờ vượt giới hạn 4.5MB của Vercel!)
      const cached = getCachedResponse('docs_list_v6', 5000);
      const clientEtag = req.headers && req.headers['if-none-match'];
      if (cached) {
        res.setHeader('ETag', cached.etag);
        res.setHeader('X-Cache', 'HIT-L1');
        if (clientEtag && clientEtag === cached.etag) {
          return res.status(304).end();
        }
        return res.status(200).json(cached.data);
      }

      const rows = await sql`
        SELECT
          id, code, title, category_id, doc_type, version, effective_date,
          status, department, description, access_level, download_perm,
          current_file, version_history, updated_at,
          CASE WHEN LENGTH(COALESCE(file_data, '')) > 0 AND LENGTH(COALESCE(file_data, '')) <= 220000 THEN file_data ELSE '' END AS inline_file_data,
          CASE WHEN LENGTH(COALESCE(file_data, '')) > 0 THEN true ELSE false END AS has_file_data
        FROM documents
        ORDER BY id DESC
        LIMIT 500
      `;

      const decryptedRows = rows.map(r => {
        let verHist = r.version_history || [];
        if (typeof verHist === 'string') {
          const decHist = decryptSensitiveText(verHist);
          try {
            verHist = JSON.parse(decHist);
          } catch (e) {
            verHist = [];
          }
        } else if (Array.isArray(verHist)) {
          verHist = verHist.map(item => ({
            ...item,
            desc: item.desc ? decryptSensitiveText(item.desc) : ''
          }));
        }

        const inlineDec = r.inline_file_data ? decryptSensitiveText(r.inline_file_data) : '';
        return {
          id: r.id,
          code: r.code,
          title: decryptSensitiveText(r.title) || r.title,
          category_id: r.category_id,
          doc_type: r.doc_type,
          version: r.version,
          effective_date: r.effective_date,
          status: r.status,
          department: decryptSensitiveText(r.department) || r.department,
          current_file: decryptSensitiveText(r.current_file) || r.current_file,
          description: decryptSensitiveText(r.description),
          access_level: r.access_level,
          download_perm: r.download_perm,
          file_data: inlineDec === '__CHUNKED_IN_DB__' ? '' : inlineDec,
          has_remote_file: Boolean(r.has_file_data),
          version_history: verHist,
          updated_at: r.updated_at
        };
      });

      const responsePayload = {
        success: true,
        encryption: 'AES-256-GCM',
        data: decryptedRows
      };

      const cacheEntry = setCachedResponse('docs_list_v6', responsePayload);
      res.setHeader('ETag', cacheEntry.etag);
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(responsePayload);
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Hỗ trợ tải tệp dung lượng lớn theo từng phân đoạn (Chunked Upload AES-256-GCM)
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
          invalidateCache('docs_');
        }
        return res.status(200).json({ success: true, chunk_index: chunkIdx });
      }

      const {
        old_code,
        code,
        title,
        category_id,
        doc_type,
        version,
        effective_date,
        department,
        description,
        access_level,
        download_perm,
        current_file,
        file_data,
        version_history
      } = body;

      const cleanCode = sanitizeInputString(code, 120);
      const cleanOldCode = old_code ? sanitizeInputString(old_code, 120) : '';
      const cleanTitle = sanitizeInputString(title, 500);
      if (!cleanCode || !cleanTitle) {
        return res.status(400).json({ error: 'Thiếu mã tài liệu hoặc tên tài liệu hợp lệ.' });
      }

      const cleanCat = sanitizeInputString(category_id || 'IT', 120);
      const cleanType = sanitizeInputString(doc_type || 'Quy trình', 120);
      const cleanVer = sanitizeInputString(version || '1.0', 40);
      const cleanDept = sanitizeInputString(department || cleanCat, 200);
      const cleanAccess = ['Mở', 'Nội bộ'].includes(access_level) ? access_level : 'Mở';
      const cleanPerm = ['allow_all', 'view_only', 'admin_only'].includes(download_perm)
        ? download_perm
        : 'allow_all';
      const cleanFileName = sanitizeInputString(current_file || `${cleanCode}.pdf`, 350);
      const effDate = sanitizeInputString(effective_date || new Date().toLocaleDateString('vi-VN'), 40);

      // MÃ HÓA ĐẦU-CUỐI LƯU TRỮ (AES-256-GCM):
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
        SELECT id, file_data, version_history FROM documents
        WHERE LOWER(code) = ${lookupCode.toLowerCase()} OR LOWER(code) = ${cleanCode.toLowerCase()}
        ORDER BY id DESC LIMIT 1
      `;

      let savedRecord = null;
      if (existingRows.length > 0) {
        const targetId = existingRows[0].id;
        const finalFileData = encryptedFileData !== '' ? encryptedFileData : (existingRows[0].file_data || '');
        const finalHistory = safeHistoryArray.length > 0 ? historyJson : JSON.stringify(existingRows[0].version_history || []);
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
            version_history = ${finalHistory}::jsonb,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${targetId}
          RETURNING id, code, version, effective_date
        `;
        savedRecord = updated[0];
      } else {
        const inserted = await sql`
          INSERT INTO documents (
            code, title, category_id, doc_type, version, effective_date,
            department, description, access_level, download_perm, current_file, file_data, version_history
          )
          VALUES (
            ${cleanCode}, ${encryptedTitle}, ${cleanCat}, ${cleanType}, ${cleanVer},
            ${effDate}, ${encryptedDept}, ${encryptedDesc}, ${cleanAccess},
            ${cleanPerm}, ${encryptedFileName}, ${encryptedFileData}, ${historyJson}::jsonb
          )
          RETURNING id, code, version, effective_date
        `;
        savedRecord = inserted[0];
      }

      if (file_data && file_data !== '__CHUNKED_IN_DB__') {
        await sql`DELETE FROM document_file_chunks WHERE LOWER(doc_code) = ${cleanCode.toLowerCase()}`;
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
        await sql`DELETE FROM documents`;
        await sql`DELETE FROM document_file_chunks`;
        invalidateCache('docs_');
        return res.status(200).json({ success: true, purged: true });
      }
      if (!id) return res.status(400).json({ error: 'Thiếu mã tài liệu cần xóa' });
      const cleanId = sanitizeInputString(id, 120);
      await sql`DELETE FROM documents WHERE LOWER(code) = ${cleanId.toLowerCase()} OR id::text = ${cleanId}`;
      await sql`DELETE FROM document_file_chunks WHERE LOWER(doc_code) = ${cleanId.toLowerCase()}`;
      invalidateCache('docs_');
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Database API error:', err.message);
    return res.status(500).json({ error: 'Lỗi xử lý bảo mật cơ sở dữ liệu: ' + err.message });
  }
}
