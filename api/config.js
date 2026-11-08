import { applyZeroTrustSecurityGuard } from './_security.js';

export default async function handler(req, res) {
  const guard = applyZeroTrustSecurityGuard(req, res);
  if (!guard.allowed) return;

  // Cache cấu hình công khai trong 60 giây để giảm tải tuyệt đối cho Serverless API
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

  return res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    hasDatabase: Boolean(process.env.DATABASE_URL),
    securityProtocol: 'Zero-Trust AES-256-GCM + SHA-256 E2EE v6.0',
    organization: 'Trường THPT FPT Cần Thơ (FSC Cần Thơ)',
    allowedDomain: 'fpt.edu.vn'
  });
}
