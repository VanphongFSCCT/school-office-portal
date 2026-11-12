import { neon, neonConfig } from '@neondatabase/serverless';
import {
  applyZeroTrustSecurityGuard,
  encryptSensitiveText,
  decryptSensitiveText,
  getCachedResponse,
  setCachedResponse,
  invalidateCache
} from './_security.js';

neonConfig.fetchConnectionCache = true;
let isSettingsSchemaReady = false;

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  const databaseUrl = process.env.DATABASE_URL;

  try {
    if (databaseUrl) {
      const sql = neon(databaseUrl);
      if (!isSettingsSchemaReady) {
        await sql`
          CREATE TABLE IF NOT EXISTS portal_settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            encrypted_value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `;
        isSettingsSchemaReady = true;
      }

      if (req.method === 'POST') {
        const { categories } = req.body || {};
        if (!Array.isArray(categories)) {
          return res.status(400).json({ error: 'Dữ liệu danh mục bộ phận không hợp lệ.' });
        }
        const cipherCats = encryptSensitiveText(JSON.stringify(categories));
        await sql`
          INSERT INTO portal_settings (setting_key, encrypted_value, updated_at)
          VALUES ('portal_categories_v6', ${cipherCats}, CURRENT_TIMESTAMP)
          ON CONFLICT (setting_key) DO UPDATE SET
            encrypted_value = EXCLUDED.encrypted_value,
            updated_at = CURRENT_TIMESTAMP
        `;
        invalidateCache('portal_cfg_');
        return res.status(200).json({ success: true, encryptedAtRest: true });
      }

      if (req.method === 'GET') {
        const cached = getCachedResponse('portal_cfg_v6', 15000);
        if (cached) {
          return res.status(200).json(cached.data);
        }
        const rows = await sql`
          SELECT encrypted_value FROM portal_settings WHERE setting_key = 'portal_categories_v6' LIMIT 1
        `;
        let savedCategories = null;
        if (rows.length > 0 && rows[0].encrypted_value) {
          try {
            const dec = decryptSensitiveText(rows[0].encrypted_value);
            savedCategories = JSON.parse(dec);
          } catch (e) {}
        }

        const payload = {
          portalName: 'vp-fsc',
          portalDomain: 'https://vp-fsc.vercel.app',
          googleClientId: process.env.GOOGLE_CLIENT_ID || '',
          hasDatabase: true,
          categories: Array.isArray(savedCategories) ? savedCategories : null,
          securityProtocol: 'Zero-Trust AES-256-GCM + SHA-256 E2EE v6.0',
          organization: 'Văn phòng - FSC Cần Thơ',
          allowedDomain: 'fpt.edu.vn'
        };
        setCachedResponse('portal_cfg_v6', payload);
        return res.status(200).json(payload);
      }
    }

    return res.status(200).json({
      portalName: 'vp-fsc',
      portalDomain: 'https://vp-fsc.vercel.app',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      hasDatabase: Boolean(databaseUrl),
      categories: null,
      securityProtocol: 'Zero-Trust AES-256-GCM + SHA-256 E2EE v6.0',
      organization: 'Văn phòng - FSC Cần Thơ',
      allowedDomain: 'fpt.edu.vn'
    });
  } catch (err) {
    return res.status(200).json({
      portalName: 'vp-fsc',
      portalDomain: 'https://vp-fsc.vercel.app',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      hasDatabase: Boolean(databaseUrl),
      categories: null
    });
  }
}
