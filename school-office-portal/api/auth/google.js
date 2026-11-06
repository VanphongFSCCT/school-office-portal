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
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Token xác thực Google không hợp lệ hoặc đã hết hạn.' });
    }

    const payload = await verifyRes.json();
    const email = (payload.email || '').toLowerCase();
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || '';
    const hd = payload.hd || '';

    // CHỈ các email được set riêng trong ADMIN_EMAILS mới là Super Admin gốc (KHÔNG gán mặc định cho @fpt.edu.vn)
    const rootAdmins = ['buitandat1727@gmail.com', 'hethongquanlyphong.fscct@gmail.com', 'vp.fsc@fpt.edu.vn'];
    const envAdmins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
    const superAdmins = [...new Set([...rootAdmins, ...envAdmins])];

    const isSuperAdmin = superAdmins.includes(email);
    const isFptDomain = (hd === 'fpt.edu.vn') || email.endsWith('@fpt.edu.vn');

    // Mặc định tài khoản @fpt.edu.vn chỉ là 'user' (Cán bộ xem nội bộ), KHÔNG phải 'admin'
    let userRole = isSuperAdmin ? 'admin' : 'user';
    let userDept = isSuperAdmin ? 'Quản trị hệ thống' : 'Cán bộ FPT Education';

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
          // Lấy đúng quyền được set riêng trong bảng users (hoặc giữ quyền admin nếu là rootAdmins)
          userRole = isSuperAdmin ? 'admin' : existing[0].role;
          userDept = existing[0].department || userDept;
          await sql`UPDATE users SET full_name = ${name}, picture = ${picture}, role = ${userRole}, updated_at = CURRENT_TIMESTAMP WHERE email = ${email}`;
        } else {
          // Nếu chưa có trong bảng phân quyền:
          // - Nếu là @fpt.edu.vn -> chỉ được quyền 'user' (xem & tải tài liệu nội bộ được cấp phép)
          // - Nếu là Gmail ngoài và không nằm trong bảng phân quyền -> từ chối
          if (!isSuperAdmin && !isFptDomain) {
            return res.status(403).json({
              error: `Tài khoản ${email} chưa được cấp quyền trong hệ thống. Vui lòng sử dụng tài khoản @fpt.edu.vn hoặc liên hệ Quản trị viên để được cấp quyền.`
            });
          }
          await sql`
            INSERT INTO users (email, full_name, role, department, picture)
            VALUES (${email}, ${name}, ${userRole}, ${userDept}, ${picture})
          `;
        }
      } catch (dbErr) {
        console.error('Database RBAC check warning:', dbErr);
      }
    } else {
      if (!isSuperAdmin && !isFptDomain) {
        return res.status(403).json({
          error: `Tài khoản ${email} chưa được phân quyền trong hệ thống.`
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
        department: userDept
      }
    });

  } catch (err) {
    return res.status(500).json({ error: 'Lỗi máy chủ xác thực: ' + err.message });
  }
}
