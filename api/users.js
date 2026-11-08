import { neon, neonConfig } from '@neondatabase/serverless';
import {
  applyZeroTrustSecurityGuard,
  encryptSensitiveText,
  decryptSensitiveText,
  hashIdentifierSHA256,
  sanitizeInputString,
  getCachedResponse,
  setCachedResponse,
  invalidateCache
} from './_security.js';

neonConfig.fetchConnectionCache = true;
let isUserSchemaReady = false;

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(200).json({
      success: true,
      data: [],
      note: 'Chưa cấu hình DATABASE_URL'
    });
  }

  const sql = neon(databaseUrl);

  try {
    // Khởi tạo bảng người dùng (Không bao giờ lưu mật khẩu, mã hóa tên & băm SHA-256 email_hash)
    if (!isUserSchemaReady) {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(150) UNIQUE NOT NULL,
          email_hash VARCHAR(64),
          full_name TEXT NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'user',
          department TEXT,
          picture TEXT,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64)`;
      isUserSchemaReady = true;
    }

    if (req.method === 'GET') {
      const cached = getCachedResponse('users_list_v6', 15000);
      if (cached) {
        res.setHeader('ETag', cached.etag);
        return res.status(200).json(cached.data);
      }

      const users = await sql`SELECT email, email_hash, full_name, role, department FROM users ORDER BY id ASC LIMIT 300`;
      const decryptedUsers = users.map(u => ({
        email: decryptSensitiveText(u.email) || u.email,
        emailHash: u.email_hash || hashIdentifierSHA256(u.email),
        name: decryptSensitiveText(u.full_name) || u.full_name,
        role: u.role,
        department: decryptSensitiveText(u.department) || u.department || 'Văn phòng'
      }));

      const payload = { success: true, data: decryptedUsers };
      const entry = setCachedResponse('users_list_v6', payload);
      res.setHeader('ETag', entry.etag);
      return res.status(200).json(payload);
    }

    if (req.method === 'POST') {
      const { email, name, role, department } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Thiếu email' });
      const cleanEmail = sanitizeInputString(email, 150).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Định dạng email không hợp lệ' });
      }

      const allowedRoles = ['admin', 'editor', 'user'];
      const safeRole = allowedRoles.includes(role) ? role : 'user';

      const emailHash = hashIdentifierSHA256(cleanEmail);
      const encryptedName = encryptSensitiveText(
        sanitizeInputString(name || cleanEmail.split('@')[0], 150)
      );
      const encryptedDept = encryptSensitiveText(
        sanitizeInputString(department || 'Văn phòng', 150)
      );

      await sql`
        INSERT INTO users (email, email_hash, full_name, role, department)
        VALUES (${cleanEmail}, ${emailHash}, ${encryptedName}, ${safeRole}, ${encryptedDept})
        ON CONFLICT (email) DO UPDATE SET
          email_hash = EXCLUDED.email_hash,
          role = EXCLUDED.role,
          full_name = EXCLUDED.full_name,
          department = EXCLUDED.department,
          updated_at = CURRENT_TIMESTAMP
      `;

      invalidateCache('users_');
      return res.status(200).json({
        success: true,
        encryptedAtRest: true,
        data: {
          email: cleanEmail,
          emailHash,
          name: sanitizeInputString(name || cleanEmail.split('@')[0], 150),
          role: safeRole
        }
      });
    }

    if (req.method === 'DELETE') {
      const { email } = req.query || {};
      const cleanEmail = sanitizeInputString(email || '', 150).toLowerCase();
      const rootProtected = [
        'buitandat1727@gmail.com',
        'hethongquanlyphong.fscct@gmail.com',
        'vp.fsc@fpt.edu.vn'
      ];
      if (rootProtected.includes(cleanEmail)) {
        return res.status(403).json({
          error: 'Không được phép xóa tài khoản Quản trị viên gốc (Root Admin).'
        });
      }
      const emailHash = hashIdentifierSHA256(cleanEmail);
      await sql`DELETE FROM users WHERE email = ${cleanEmail} OR email_hash = ${emailHash}`;
      invalidateCache('users_');
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi bảo mật khi xử lý phân quyền.' });
  }
}
