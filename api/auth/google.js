import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Thiếu mã xác thực Google OAuth ID Token (credential).' });
  }

  try {
    // 1. Xác thực chữ ký số của Google ID Token trực tiếp với máy chủ Google OAuth2
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Token xác thực Google không hợp lệ hoặc đã hết hạn.' });
    }

    const payload = await verifyRes.json();
    const email = (payload.email || '').toLowerCase();
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || '';
    const hd = payload.hd || '';

    // 2. Xác định danh sách Super Admin từ biến môi trường ADMIN_EMAILS
    const defaultAdmins = ['buitandat1727@gmail.com', 'hethongquanlyphong.fscct@gmail.com', 'datbt13@fpt.edu.vn'];
    const envAdmins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
    const superAdmins = [...new Set([...defaultAdmins, ...envAdmins])];

    let userRole = 'guest';
    let userDept = 'Khách';
    const isSuperAdmin = superAdmins.includes(email);
    const isFptDomain = (hd === 'fpt.edu.vn') || email.endsWith('@fpt.edu.vn');

    if (isSuperAdmin) {
      userRole = 'admin';
      userDept = 'Quản trị hệ thống';
    } else if (isFptDomain) {
      userRole = 'user';
      userDept = 'Cán bộ FPT Education';
    }

    // 3. Đối soát phân quyền trong Neon PostgreSQL (Bảng users)
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        const sql = neon(databaseUrl);
        await sql`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(150) UNIQUE NOT NULL,
            full_name VARCHAR(150) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'user',
            department VARCHAR(150),
            picture TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `;

        const existing = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (existing.length > 0) {
          // Nếu tài khoản đã được phân quyền trong DB, lấy đúng role trong DB (trừ khi là Super Admin gốc)
          userRole = isSuperAdmin ? 'admin' : existing[0].role;
          userDept = existing[0].department || userDept;
          await sql`UPDATE users SET full_name = ${name}, picture = ${picture}, updated_at = CURRENT_TIMESTAMP WHERE email = ${email}`;
        } else {
          // Nếu chưa có trong DB: chỉ cho phép nếu là Super Admin hoặc thuộc miền @fpt.edu.vn
          if (!isSuperAdmin && !isFptDomain) {
            return res.status(403).json({
              error: `Tài khoản ${email} chưa được cấp quyền truy cập hệ thống. Vui lòng sử dụng email @fpt.edu.vn hoặc liên hệ Quản trị viên để được phân quyền.`
            });
          }
          await sql`
            INSERT INTO users (email, full_name, role, department, picture)
            VALUES (${email}, ${name}, ${userRole}, ${userDept}, ${picture})
          `;
        }
      } catch (dbErr) {
        console.error('Database query warning:', dbErr);
      }
    } else {
      // Nếu chưa kết nối DB, chỉ cho phép Super Admin hoặc @fpt.edu.vn
      if (!isSuperAdmin && !isFptDomain) {
        return res.status(403).json({
          error: `Tài khoản ${email} không thuộc tổ chức @fpt.edu.vn và chưa được cấp quyền quản trị.`
        });
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        email,
        name,
        picture,
        role: userRole,
        department: userDept,
        idToken: credential
      }
    });

  } catch (err) {
    return res.status(500).json({ error: 'Lỗi máy chủ xác thực: ' + err.message });
  }
}
