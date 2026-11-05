import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
      const result = await sql`
        INSERT INTO users (email, full_name, role, department)
        VALUES (${cleanEmail}, ${name || cleanEmail.split('@')[0]}, ${role || 'user'}, ${department || 'Văn phòng'})
        ON CONFLICT (email) DO UPDATE SET role = ${role}, full_name = ${name}, department = ${department}
        RETURNING email, full_name as name, role, department
      `;
      return res.status(200).json({ success: true, data: result[0] });
    }

    if (req.method === 'DELETE') {
      const { email } = req.query;
      await sql`DELETE FROM users WHERE email = ${email}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
