import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(200).json({ success: true, count: 0, data: [] });
  }

  const sql = neon(databaseUrl);

  try {
    // Tự động nâng cấp bảng documents để lưu trữ đầy đủ tệp đính kèm thực tế (file_data, current_file, download_perm)
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS current_file VARCHAR(255)`;
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data TEXT`;
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS download_perm VARCHAR(50) DEFAULT 'allow_all'`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM documents ORDER BY created_at DESC`;
      return res.status(200).json({ success: true, count: rows.length, data: rows });
    }

    if (req.method === 'POST') {
      const { code, title, category_id, doc_type, version, department, description, access_level, download_perm, current_file, file_data } = req.body;
      const id = code || ('DOC-' + Date.now());
      const result = await sql`
        INSERT INTO documents (id, code, title, category_id, doc_type, version, department, description, access_level, download_perm, current_file, file_data, file_url)
        VALUES (${id}, ${code}, ${title}, ${category_id}, ${doc_type}, ${version || '1.0'}, ${department}, ${description}, ${access_level || 'Mở'}, ${download_perm || 'allow_all'}, ${current_file || ''}, ${file_data || ''}, ${file_data || ''})
        ON CONFLICT (code) DO UPDATE SET
          title = ${title},
          category_id = ${category_id},
          doc_type = ${doc_type},
          version = ${version},
          department = ${department},
          description = ${description},
          access_level = ${access_level},
          download_perm = COALESCE(${download_perm}, documents.download_perm),
          current_file = COALESCE(NULLIF(${current_file}, ''), documents.current_file),
          file_data = COALESCE(NULLIF(${file_data}, ''), documents.file_data),
          file_url = COALESCE(NULLIF(${file_data}, ''), documents.file_url),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      return res.status(201).json({ success: true, data: result[0] });
    }

    if (req.method === 'DELETE') {
      const { id, purge } = req.query;
      if (purge === 'all') {
        await sql`DELETE FROM document_history`;
        await sql`DELETE FROM documents`;
        return res.status(200).json({ success: true, message: 'Đã làm sạch toàn bộ dữ liệu tài liệu trên Neon DB.' });
      }
      if (id) {
        await sql`DELETE FROM documents WHERE id = ${id} OR code = ${id}`;
        return res.status(200).json({ success: true, message: 'Đã xóa tài liệu.' });
      }
      return res.status(400).json({ error: 'Thiếu tham số xóa' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Database query error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
