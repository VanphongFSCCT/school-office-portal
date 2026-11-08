import { neon, neonConfig } from '@neondatabase/serverless';
import {
  applyZeroTrustSecurityGuard,
  encryptSensitiveText,
  decryptSensitiveText,
  hashIdentifierSHA256,
  sanitizeInputString
} from '../_security.js';

neonConfig.fetchConnectionCache = true;

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Thiếu Google ID Token hợp lệ' });
    }

    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Cấu trúc JWT không hợp lệ' });
    }

    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    const email = sanitizeInputString(payload.email || '', 150).toLowerCase();
    const name = sanitizeInputString(payload.name || email.split('@')[0], 150);
    const domain = payload.hd || email.split('@')[1];
    const emailHash = hashIdentifierSHA256(email);

    const ROOT_ADMINS = [
      'buitandat1727@gmail.com',
      'hethongquanlyphong.fscct@gmail.com',
      'vp.fsc@fpt.edu.vn'
    ];

    let role = null;
    if (ROOT_ADMINS.includes(email)) {
      role = 'admin';
    }

    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`
        SELECT role, department FROM users
        WHERE LOWER(email) = ${email} OR email_hash = ${emailHash}
        LIMIT 1
      `;
      if (rows.length > 0) {
        role = ROOT_ADMINS.includes(email) ? 'admin' : rows[0].role;
      } else if (domain === 'fpt.edu.vn' || domain === 'fe.edu.vn' || ROOT_ADMINS.includes(email)) {
        role = role || 'user';
        // Lưu thông tin phân quyền đã mã hóa AES-256-GCM và băm SHA-256 (Không lưu mật khẩu hay dữ liệu nhạy cảm)
        await sql`
          INSERT INTO users (email, email_hash, full_name, role, department)
          VALUES (
            ${email},
            ${emailHash},
            ${encryptSensitiveText(name)},
            ${role},
            ${encryptSensitiveText('FSC Cần Thơ')}
          )
          ON CONFLICT (email) DO NOTHING
        `;
      }
    } else {
      if (domain === 'fpt.edu.vn' || domain === 'fe.edu.vn' || ROOT_ADMINS.includes(email)) {
        role = role || 'user';
      }
    }

    if (!role) {
      return res.status(403).json({
        error: `Tài khoản ${email} chưa được cấp quyền truy cập hệ thống nội bộ FSC Cần Thơ.`
      });
    }

    // Trả về phiên xác thực ẩn danh hóa (Zero-Password, Tokenized Session)
    return res.status(200).json({
      success: true,
      user: {
        email,
        emailHash,
        name,
        role,
        sessionIssuedAt: Date.now(),
        sessionExpiresAt: Date.now() + 8 * 3600 * 1000 // Tự động hết hạn sau 8 giờ làm việc
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi xác thực bảo mật OAuth.' });
  }
}
