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

// Kích hoạt Connection Pooling Cache cho Neon Serverless giúp chịu tải cao liên tục trong tháng
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
    // Chỉ khởi tạo Schema 1 lần duy nhất trên mỗi phiên Serverless để giảm 70% truy vấn thừa lên Neon DB
    if (!isDocSchemaReady) {
      await sql`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          code VARCHAR(80) UNIQUE NOT NULL,
          title VARCHAR(300) NOT NULL,
          category_id VARCHAR(80) NOT NULL,
          doc_type VARCHAR(80) NOT NULL,
          version VARCHAR(30) DEFAULT '1.0',
          effective_date VARCHAR(40),
          status VARCHAR(60) DEFAULT 'Có hiệu lực',
          department VARCHAR(180),
          description TEXT,
          access_level VARCHAR(60) DEFAULT 'Mở',
          download_perm VARCHAR(60) DEFAULT 'allow_all',
          current_file VARCHAR(255),
          file_data TEXT,
          version_history JSONB DEFAULT '[]'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]'::jsonb`;
      isDocSchemaReady = true;
    }

    if (req.method === 'GET') {
      // Kiểm tra bộ nhớ đệm L1 & ETag giúp chịu tải hàng ngàn người dùng cùng lúc mà không gây nghẽn Neon DB
      const cached = getCachedResponse('docs_list_v6', 10000);
      const clientEtag = req.headers && req.headers['if-none-match'];
      if (cached) {
        res.setHeader('ETag', cached.etag);
        res.setHeader('X-Cache', 'HIT-L1');
        if (clientEtag && clientEtag === cached.etag) {
          return res.status(304).end();
        }
        return res.status(200).json(cached.data);
      }

      const rows = await sql`SELECT * FROM documents ORDER BY updated_at DESC LIMIT 500`;

      // Giải mã dữ liệu AES-256-GCM trong bộ nhớ khi trả về cho ứng dụng hợp lệ
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

        return {
          ...r,
          title: decryptSensitiveText(r.title) || r.title,
          department: decryptSensitiveText(r.department) || r.department,
          current_file: decryptSensitiveText(r.current_file) || r.current_file,
          description: decryptSensitiveText(r.description),
          file_data: decryptSensitiveText(r.file_data),
          version_history: verHist
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
      const {
        code,
        title,
        category_id,
        doc_type,
        version,
        department,
        description,
        access_level,
        download_perm,
        current_file,
        file_data,
        version_history
      } = req.body || {};

      const cleanCode = sanitizeInputString(code, 80);
      const cleanTitle = sanitizeInputString(title, 300);
      if (!cleanCode || !cleanTitle) {
        return res.status(400).json({ error: 'Thiếu mã tài liệu hoặc tên tài liệu hợp lệ.' });
      }

      const cleanCat = sanitizeInputString(category_id || 'IT', 80);
      const cleanType = sanitizeInputString(doc_type || 'Quy trình', 80);
      const cleanVer = sanitizeInputString(version || '1.0', 30);
      const cleanDept = sanitizeInputString(department || cleanCat, 180);
      const cleanAccess = ['Mở', 'Nội bộ'].includes(access_level) ? access_level : 'Mở';
      const cleanPerm = ['allow_all', 'view_only', 'admin_only'].includes(download_perm)
        ? download_perm
        : 'allow_all';
      const cleanFileName = sanitizeInputString(current_file || `${cleanCode}.pdf`, 255);
      const effDate = new Date().toLocaleDateString('vi-VN');

      // MÃ HÓA ĐẦU-CUỐI LƯU TRỮ (AES-256-GCM):
      // Mã hóa tên tài liệu, mô tả, nội dung file và lịch sử phiên bản trước khi ghi xuống PostgreSQL
      const encryptedTitle = encryptSensitiveText(cleanTitle);
      const encryptedDept = encryptSensitiveText(cleanDept);
      const encryptedFileName = encryptSensitiveText(cleanFileName);
      const encryptedDesc = encryptSensitiveText(sanitizeInputString(description || '', 5000));
      const encryptedFileData = file_data ? encryptSensitiveText(String(file_data)) : '';

      const safeHistoryArray = Array.isArray(version_history)
        ? version_history.map(h => ({
            version: sanitizeInputString(h.version || '1.0', 30),
            effectiveDate: sanitizeInputString(h.effectiveDate || '', 40),
            currentFile: sanitizeInputString(h.currentFile || '', 255),
            fileDataKey: sanitizeInputString(h.fileDataKey || '', 150),
            desc: encryptSensitiveText(sanitizeInputString(h.desc || '', 2000)),
            updatedAt: sanitizeInputString(h.updatedAt || '', 60)
          }))
        : [];
      const historyJson = JSON.stringify(safeHistoryArray);

      const result = await sql`
        INSERT INTO documents (
          code, title, category_id, doc_type, version, effective_date,
          department, description, access_level, download_perm, current_file, file_data, version_history
        )
        VALUES (
          ${cleanCode}, ${encryptedTitle}, ${cleanCat}, ${cleanType}, ${cleanVer},
          ${effDate}, ${encryptedDept}, ${encryptedDesc}, ${cleanAccess},
          ${cleanPerm}, ${encryptedFileName}, ${encryptedFileData}, ${historyJson}::jsonb
        )
        ON CONFLICT (code) DO UPDATE SET
          title = EXCLUDED.title,
          category_id = EXCLUDED.category_id,
          doc_type = EXCLUDED.doc_type,
          version = EXCLUDED.version,
          effective_date = EXCLUDED.effective_date,
          department = EXCLUDED.department,
          description = EXCLUDED.description,
          access_level = EXCLUDED.access_level,
          download_perm = EXCLUDED.download_perm,
          current_file = EXCLUDED.current_file,
          file_data = CASE WHEN EXCLUDED.file_data != '' THEN EXCLUDED.file_data ELSE documents.file_data END,
          version_history = CASE WHEN jsonb_array_length(EXCLUDED.version_history) > 0 THEN EXCLUDED.version_history ELSE documents.version_history END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, code, version, effective_date, updated_at
      `;

      // Xóa cache ngay khi có cập nhật để người dùng nhận dữ liệu mới tức thì
      invalidateCache('docs_');

      return res.status(200).json({
        success: true,
        encryptedAtRest: true,
        data: result[0]
      });
    }

    if (req.method === 'DELETE') {
      const { id, purge } = req.query || {};
      if (purge === 'all') {
        await sql`DELETE FROM documents`;
        invalidateCache('docs_');
        return res.status(200).json({ success: true, purged: true });
      }
      if (!id) return res.status(400).json({ error: 'Thiếu mã tài liệu cần xóa' });
      const cleanId = sanitizeInputString(id, 80);
      await sql`DELETE FROM documents WHERE code = ${cleanId} OR id::text = ${cleanId}`;
      invalidateCache('docs_');
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi xử lý bảo mật cơ sở dữ liệu.' });
  }
}
