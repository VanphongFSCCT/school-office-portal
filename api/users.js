import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-Role');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(200).json({ success: true, data: [], note: 'Chưa cấu hình DATABASE_URL' });
  }

  const sql = neon(databaseUrl);

  try {
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

    if (req.method === 'GET') {
      const users = await sql`SELECT email, full_name as name, role, department FROM users ORDER BY id ASC`;
      return res.status(200).json({ success: true, data: users });
    }

    if (req.method === 'POST') {
      const { email, name, role, department } = req.body;
      if (!email) return res.status(400).json({ error: 'Thiếu email' });
      const cleanEmail = email.trim().toLowerCase();
      const allowedRoles = ['admin', 'editor', 'user'];
      const safeRole = allowedRoles.includes(role) ? role : 'user';
      const result = await sql`
        INSERT INTO users (email, full_name, role, department)
        VALUES (${cleanEmail}, ${name || cleanEmail.split('@')[0]}, ${safeRole}, ${department || 'Văn phòng'})
        ON CONFLICT (email) DO UPDATE SET role = ${safeRole}, full_name = ${name}, department = ${department}
        RETURNING email, full_name as name, role, department
      `;
      return res.status(200).json({ success: true, data: result[0] });
    }

    if (req.method === 'DELETE') {
      const { email } = req.query;
      const rootProtected = ['buitandat1727@gmail.com', 'hethongquanlyphong.fscct@gmail.com', 'vp.fsc@fpt.edu.vn'];
      if (rootProtected.includes((email || '').toLowerCase())) {
        return res.status(403).json({ error: 'Không được phép xóa tài khoản Quản trị viên gốc (Root Admin).' });
      }
      await sql`DELETE FROM users WHERE email = ${email}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
