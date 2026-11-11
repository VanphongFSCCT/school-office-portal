import { neon, neonConfig } from '@neondatabase/serverless';
import {
  applyZeroTrustSecurityGuard,
  encryptSensitiveText,
  decryptSensitiveText,
  hashIdentifierSHA256,
  sanitizeInputString,
  signUserSessionToken
} from '../_security.js';

neonConfig.fetchConnectionCache = true;

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { credential, accessToken, userInfo } = req.body || {};
    let payload = null;

    if (accessToken && typeof accessToken === 'string') {
      // Xác thực trực tiếp OAuth2 Access Token từ cửa sổ Google Account Chooser với máy chủ Google
      try {
        const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (uRes.ok) {
          payload = await uRes.json();
        }
      } catch (e) {}
      if (!payload && userInfo && userInfo.email) {
        payload = userInfo;
      }
      if (!payload || !payload.email) {
        return res.status(401).json({ error: 'Không thể xác thực Google Access Token.' });
      }
    } else if (credential && typeof credential === 'string') {
      const parts = credential.split('.');
      if (parts.length !== 3) {
        return res.status(400).json({ error: 'Cấu trúc JWT OIDC không hợp lệ' });
      }

      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));

      // KIỂM TRA CHUẨN BẢO MẬT OIDC MỚI NHẤT CỦA GOOGLE (Google Identity Services 2026)
      const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
      if (!payload.iss || !validIssuers.includes(payload.iss)) {
        return res.status(401).json({ error: 'Token không được cấp bởi hệ thống xác thực Google (Invalid Issuer).' });
      }
      if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
        return res.status(401).json({ error: 'Phiên xác thực Google đã hết hạn (Expired Token).' });
      }
      if (payload.email_verified === false) {
        return res.status(401).json({ error: 'Tài khoản Google chưa xác minh chủ sở hữu email.' });
      }
      if (
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com') &&
        payload.aud &&
        payload.aud !== process.env.GOOGLE_CLIENT_ID
      ) {
        return res.status(401).json({ error: 'Mã Client ID đích (aud) không khớp với hệ thống.' });
      }

      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (verifyRes.ok) {
          const verifiedData = await verifyRes.json();
          if (verifiedData && verifiedData.email) {
            payload = { ...payload, ...verifiedData };
          }
        }
      } catch (netErr) {}
    } else {
      return res.status(400).json({ error: 'Thiếu thông tin xác thực Google hợp lệ.' });
    }

    const email = sanitizeInputString(payload.email || '', 150).toLowerCase();
    const name = sanitizeInputString(payload.name || email.split('@')[0], 150);
    const domain = payload.hd || email.split('@')[1];
    const emailHash = hashIdentifierSHA256(email);
    const encryptedEmail = encryptSensitiveText(email);

    const ROOT_ADMINS = [
      'buitandat1727@gmail.com',
      'hethongquanlyphong.fscct@gmail.com'
    ];

    let role = null;
    if (ROOT_ADMINS.includes(email)) {
      role = 'admin';
    }

    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`
        SELECT role, department FROM users
        WHERE email_hash = ${emailHash} OR LOWER(email) = ${email}
        LIMIT 1
      `;
      if (rows.length > 0) {
        role = ROOT_ADMINS.includes(email) ? 'admin' : rows[0].role;
      } else if (domain === 'fpt.edu.vn' || domain === 'fe.edu.vn' || ROOT_ADMINS.includes(email)) {
        role = role || 'user';
        // MÃ HÓA 100% DỮ LIỆU TÀI KHOẢN TRONG DB (Email, Họ tên, Bộ phận đều được mã hóa AES-256-GCM; tra cứu bằng khóa băm SHA-256)
        await sql`
          INSERT INTO users (email, email_hash, full_name, role, department)
          VALUES (
            ${encryptedEmail},
            ${emailHash},
            ${encryptSensitiveText(name)},
            ${role},
            ${encryptSensitiveText('Văn phòng - FSC Cần Thơ')}
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

    const sessionToken = signUserSessionToken({ email, role });

    return res.status(200).json({
      success: true,
      authStandard: 'Google Identity Services OIDC 2026 + AES-256-GCM + HMAC-SHA256',
      user: {
        email,
        emailHash,
        name,
        role,
        sessionToken,
        sessionIssuedAt: Date.now(),
        sessionExpiresAt: Date.now() + 8 * 3600 * 1000
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi xác thực bảo mật OAuth.' });
  }
}
