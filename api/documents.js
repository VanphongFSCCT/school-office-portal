import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ error: 'DATABASE_URL environment variable is missing.' });
  }

  const sql = neon(databaseUrl);

  try {
    if (req.method === 'GET') {
      const { category, type, q } = req.query;
      let queryText = 'SELECT * FROM documents WHERE 1=1';
      const params = [];

      if (category && category !== 'all') {
        params.push(category);
        queryText += ` AND category_id = $${params.length}`;
      }

      if (type && type !== 'all') {
        params.push(type);
        queryText += ` AND doc_type = $${params.length}`;
      }

      const rows = await sql(queryText, params);
      return res.status(200).json({ success: true, count: rows.length, data: rows });
    }

    if (req.method === 'POST') {
      const { code, title, category_id, doc_type, version, department, description, access_level } = req.body;
      const id = code;
      const result = await sql`
        INSERT INTO documents (id, code, title, category_id, doc_type, version, department, description, access_level)
        VALUES (${id}, ${code}, ${title}, ${category_id}, ${doc_type}, ${version || '1.0'}, ${department}, ${description}, ${access_level || 'Mở'})
        RETURNING *
      `;
      return res.status(201).json({ success: true, data: result[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Database query error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
