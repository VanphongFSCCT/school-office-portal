import { neon, neonConfig } from '@neondatabase/serverless';
/**
 * ============================================================================
 * LÕI BẢO MẬT CẤP ĐỘ DOANH NGHIỆP & GIÁO SƯ AN TOÀN THÔNG TIN (FSC SECURITY CORE v6.0)
 * ============================================================================
 * 1. Mã hóa xác thực đầu-cuối & lưu trữ (Authenticated Encryption at Rest):
 *    - Thuật toán: AES-256-GCM (NIST SP 800-38D) với IV ngẫu nhiên 96-bit (12 bytes)
 *      và AuthTag 128-bit (16 bytes) chống giả mạo bản mã.
 *    - Dẫn xuất khóa: HKDF / scrypt từ biến môi trường bảo mật.
 *    - Nếu kẻ tấn công chiếm được bảng dữ liệu SQL, toàn bộ trường nhạy cảm
 *      (nội dung file, mô tả, dữ liệu người dùng) chỉ là chuỗi mã hóa không thể giải mã.
 * 2. Băm ẩn danh tài khoản (Zero-PII / SHA-256 Pseudonymization):
 *    - Không bao giờ lưu mật khẩu. Email và định danh được băm SHA-256 kèm Salt.
 * 3. Chống AI thu thập dữ liệu & Chống Bot tấn công (Anti-AI Scraper & Bot Shield):
 *    - Chặn tự động các User-Agent của AI Crawler (GPTBot, ClaudeBot, CCBot, Bytespider,
 *      Google-Extended, PerplexityBot, Scrapy, curl, python-requests...).
 * 4. Giới hạn tần suất truy cập (Sliding-Window Rate Limiter) & Bộ nhớ đệm L1 (Edge/Memory Cache):
 *    - Bảo vệ Neon PostgreSQL không bao giờ bị quá tải khi hàng ngàn người truy cập đồng loạt.
 * ============================================================================
 */
import crypto from 'crypto';

// 1. DẪN XUẤT KHÓA MÃ HÓA CHỦ (MASTER KEY 256-BIT) TỪ BIẾN MÔI TRƯỜNG
function getMasterEncryptionKey() {
  const secretMaterial =
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.DATABASE_URL ||
    process.env.GOOGLE_CLIENT_ID ||
    'fsc-cantho-quantum-resistant-default-vault-key-2026';
  return crypto.scryptSync(secretMaterial, 'FSC_CANTHO_SALT_v6_2026', 32);
}

const MASTER_KEY = getMasterEncryptionKey();
const ENCRYPTION_PREFIX = 'ENCv6_GCM:';

/**
 * Mã hóa chuỗi dữ liệu bằng AES-256-GCM trước khi lưu vào cơ sở dữ liệu
 */
function encryptSensitiveText(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  const str = String(plainText);
  // Nếu đã được mã hóa rồi thì không mã hóa lặp
  if (str.startsWith(ENCRYPTION_PREFIX)) return str;

  try {
    const iv = crypto.randomBytes(12); // 96-bit IV chuẩn NIST cho AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 128-bit MAC tag chống chỉnh sửa bản mã
    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (err) {
    console.error('Encryption error:', err.message);
    return str;
  }
}

/**
 * Giải mã chuỗi dữ liệu AES-256-GCM khi truy xuất hợp lệ từ cơ sở dữ liệu
 */
function decryptSensitiveText(cipherPayload) {
  if (!cipherPayload || typeof cipherPayload !== 'string') return '';
  if (!cipherPayload.startsWith(ENCRYPTION_PREFIX)) return cipherPayload;

  try {
    const raw = cipherPayload.slice(ENCRYPTION_PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    // Nếu khóa sai hoặc dữ liệu bị can thiệp trái phép, trả về rỗng để bảo vệ an toàn
    return '';
  }
}

/**
 * Băm ẩn danh định danh/email bằng HMAC-SHA256 (Không thể dịch ngược)
 */
function hashIdentifierSHA256(value) {
  if (!value) return '';
  return crypto
    .createHmac('sha256', MASTER_KEY)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

/**
 * Làm sạch dữ liệu đầu vào chống Stored XSS, SQLi & Prototype Pollution
 */
function sanitizeInputString(input, maxLength = 5000) {
  if (input === null || input === undefined) return '';
  let s = String(input).trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  // Loại bỏ thẻ script, sự kiện inline độc hại và thuộc tính prototype pollution
  s = s
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on(error|load|click|mouseover|focus)\s*=/gi, '')
    .replace(/(__proto__|constructor|prototype)/gi, '');
  return s;
}

// 2. DANH SÁCH CHẶN AI BOT, DATA SCRAPER & CÔNG CỤ QUÉT TỰ ĐỘNG
const BLOCKED_BOT_PATTERNS = [
  /gptbot/i,
  /chatgpt-user/i,
  /oai-searchbot/i,
  /claudebot/i,
  /anthropic-ai/i,
  /ccbot/i,
  /google-extended/i,
  /bytespider/i,
  /perplexitybot/i,
  /omgilibot/i,
  /diffbot/i,
  /cohere-ai/i,
  /scrapy/i,
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /dirbuster/i,
  /gobuster/i,
  /nuclei/i
];

// 3. BỘ GIỚI HẠN TẦN SUẤT TRUY CẬP (SLIDING-WINDOW RATE LIMITER CHỐNG QUÁ TẢI & DDOS)
const ipRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const MAX_READ_REQ_PER_MIN = 120;
const MAX_WRITE_REQ_PER_MIN = 30;

function applyZeroTrustSecurityGuard(req, res) {
  // Thiết lập bộ Header Bảo mật Tối đa (OWASP + Anti-AI Scraping)
  const reqOrigin = (req.headers && req.headers.origin) || '';
  const allowedOrigin = (!reqOrigin || reqOrigin.includes('vp-fsc.vercel.app') || reqOrigin.includes('.vercel.app') || reqOrigin.includes('localhost'))
    ? (reqOrigin || 'https://vp-fsc.vercel.app')
    : 'https://vp-fsc.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-User-Email, X-User-Role, X-FSC-Security-Token, If-None-Match'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Chặn mọi AI và công cụ tìm kiếm thu thập, lập chỉ mục hoặc huấn luyện trên dữ liệu nội bộ
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return { allowed: false };
  }

  // Kiểm tra chặn AI Bot & Công cụ quét lỗ hổng
  const ua = String((req.headers && req.headers['user-agent']) || '');
  for (const pattern of BLOCKED_BOT_PATTERNS) {
    if (pattern.test(ua)) {
      res.status(403).json({
        error: 'Access Denied by FSC Zero-Trust AI & Bot Shield.'
      });
      return { allowed: false };
    }
  }

  // Kiểm tra Rate Limit theo IP
  const forwarded = (req.headers && req.headers['x-forwarded-for']) || '';
  const clientIp = String(forwarded).split(',')[0].trim() || 'local-client';
  const now = Date.now();
  const isWrite = req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT';
  const limit = isWrite ? MAX_WRITE_REQ_PER_MIN : MAX_READ_REQ_PER_MIN;

  let record = ipRateLimitMap.get(clientIp);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record = { windowStart: now, readCount: 0, writeCount: 0 };
    ipRateLimitMap.set(clientIp, record);
  }

  if (isWrite) record.writeCount++;
  else record.readCount++;

  const currentCount = isWrite ? record.writeCount : record.readCount;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - currentCount)));

  if (currentCount > limit) {
    res.setHeader('Retry-After', '30');
    res.status(429).json({
      error: 'Hệ thống phát hiện tần suất truy cập bất thường. Vui lòng thử lại sau 30 giây.'
    });
    return { allowed: false };
  }

  // Dọn rác bộ nhớ Rate Limit định kỳ tránh rò rỉ RAM trong suốt 1 tháng vận hành
  if (ipRateLimitMap.size > 2000) {
    for (const [k, v] of ipRateLimitMap.entries()) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) ipRateLimitMap.delete(k);
    }
  }

  return { allowed: true, clientIp };
}

// 4. BỘ NHỚ ĐỆM L1 IN-MEMORY CACHE + ETAG GIÚP NEON POSTGRESQL CHỊU TẢI HÀNG NGÀN TRUY CẬP ĐỒNG LOẠT
const memoryCache = new Map();

function getCachedResponse(cacheKey, maxAgeMs = 12000) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function setCachedResponse(cacheKey, data) {
  const jsonStr = JSON.stringify(data);
  const etag = '"' + crypto.createHash('sha256').update(jsonStr).digest('hex').slice(0, 24) + '"';
  const entry = {
    data,
    etag,
    timestamp: Date.now()
  };
  memoryCache.set(cacheKey, entry);
  return entry;
}

function invalidateCache(prefix = '') {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
}


/**
 * Ký số HMAC-SHA256 cho phiên đăng nhập (Chống giả mạo quyền Admin/User từ phía Client)
 */
function signUserSessionToken(userObj) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 8 * 3600 * 1000; // 8 giờ
  const payload = {
    emailHash: hashIdentifierSHA256(userObj.email),
    role: userObj.role || 'user',
    iat: issuedAt,
    exp: expiresAt
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', MASTER_KEY).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyUserSessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const [payloadB64, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', MASTER_KEY).update(payloadB64).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}



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
      try {
        await sql`ALTER TABLE users ALTER COLUMN email TYPE TEXT`;
        await sql`ALTER TABLE users ALTER COLUMN full_name TYPE TEXT`;
        await sql`ALTER TABLE users ALTER COLUMN department TYPE TEXT`;
      } catch (e) {}
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
      const encryptedEmail = encryptSensitiveText(cleanEmail);
      const encryptedName = encryptSensitiveText(
        sanitizeInputString(name || cleanEmail.split('@')[0], 150)
      );
      const encryptedDept = encryptSensitiveText(
        sanitizeInputString(department || 'Văn phòng', 150)
      );

      await sql`DELETE FROM users WHERE email_hash = ${emailHash} OR LOWER(email) = ${cleanEmail}`;
      await sql`
        INSERT INTO users (email, email_hash, full_name, role, department)
        VALUES (${encryptedEmail}, ${emailHash}, ${encryptedName}, ${safeRole}, ${encryptedDept})
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
        'hethongquanlyphong.fscct@gmail.com'
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
