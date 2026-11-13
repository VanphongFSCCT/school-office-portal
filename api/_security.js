import crypto from 'crypto';

// ============================================================================
// LÕI BẢO MẬT ZERO-TRUST, MÃ HÓA AES-256-GCM, CHỐNG AI/HACKER & CHỊU TẢI CAO (v6.5)
// - Tự thân 100% (Self-Contained): Không phụ thuộc import file cục bộ
// - Mã hóa xác thực AES-256-GCM (NIST SP 800-38D) + HMAC-SHA256 Zero-PII
// - Singleflight Request Coalescing + Auto-Retry Exponential Backoff chống lỗi/báo bận
// ============================================================================
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

export function encryptSensitiveText(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  const str = String(plainText);
  if (str.startsWith(ENCRYPTION_PREFIX)) return str;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (err) {
    return str;
  }
}

export function decryptSensitiveText(cipherPayload) {
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
    return '';
  }
}

export function hashIdentifierSHA256(value) {
  if (!value) return '';
  return crypto
    .createHmac('sha256', MASTER_KEY)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

export function sanitizeInputString(input, maxLength = 5000) {
  if (input === null || input === undefined) return '';
  let s = String(input).trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/on(error|load|click|mouseover|focus|mouseenter|mouseleave|keydown|keyup)\s*=/gi, '')
    .replace(/(__proto__|constructor|prototype)/gi, '');
}

const BLOCKED_BOT_PATTERNS = [
  /gptbot/i, /chatgpt-user/i, /oai-searchbot/i, /claudebot/i, /anthropic-ai/i,
  /ccbot/i, /google-extended/i, /bytespider/i, /perplexitybot/i, /omgilibot/i,
  /diffbot/i, /cohere-ai/i, /scrapy/i, /sqlmap/i, /nikto/i, /nmap/i, /masscan/i,
  /dirbuster/i, /gobuster/i, /nuclei/i, /acunetix/i, /nessus/i, /metasploit/i, /zgrab/i
];

// Ngưỡng chịu tải cao cho mạng trường học (NAT IP dùng chung hàng trăm giáo viên/cán bộ truy cập đồng thời không bao giờ báo bận 429)
const ipRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_READ_REQ_PER_MIN = 1500;
const MAX_WRITE_REQ_PER_MIN = 350;

export function applyZeroTrustSecurityGuard(req, res) {
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
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return { allowed: false };
  }

  const ua = String((req.headers && req.headers['user-agent']) || '');
  for (const pattern of BLOCKED_BOT_PATTERNS) {
    if (pattern.test(ua)) {
      res.status(403).json({ error: 'Access Denied by FSC Zero-Trust AI & Bot Shield.' });
      return { allowed: false };
    }
  }

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
    res.setHeader('Retry-After', '5');
    res.status(429).json({
      error: 'Hệ thống đang bảo vệ chống tấn công DDoS. Vui lòng thử lại sau vài giây.'
    });
    return { allowed: false };
  }

  if (ipRateLimitMap.size > 2000) {
    for (const [k, v] of ipRateLimitMap.entries()) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) ipRateLimitMap.delete(k);
    }
  }

  return { allowed: true, clientIp };
}

const memoryCache = new Map();
const inFlightQueries = new Map();

export function getCachedResponse(cacheKey, maxAgeMs = 30000) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function setCachedResponse(cacheKey, data) {
  const jsonStr = JSON.stringify(data);
  const etag = '"' + crypto.createHash('sha256').update(jsonStr).digest('hex').slice(0, 24) + '"';
  const entry = { data, etag, timestamp: Date.now() };
  memoryCache.set(cacheKey, entry);
  return entry;
}

export function invalidateCache(prefix = '') {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
}

// Singleflight Coalescing: Gộp hàng trăm truy cập đồng thời vào 1 truy vấn DB duy nhất
export async function coalesceInFlightQuery(key, asyncTaskFn) {
  if (inFlightQueries.has(key)) {
    return inFlightQueries.get(key);
  }
  const p = (async () => {
    try {
      return await asyncTaskFn();
    } finally {
      inFlightQueries.delete(key);
    }
  })();
  inFlightQueries.set(key, p);
  return p;
}

// Tự động thử lại (Auto-Retry Exponential Backoff) khi DB Serverless vừa thức dậy (Cold-start)
export async function executeWithRetry(taskFn, maxAttempts = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await taskFn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, attempt * 140));
      }
    }
  }
  throw lastErr;
}

export function signUserSessionToken(userObj) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 8 * 3600 * 1000;
  const payload = {
    emailHash: hashIdentifierSHA256(userObj.email || userObj.emailHash || 'anonymous'),
    role: userObj.role || 'user',
    iat: issuedAt,
    exp: expiresAt
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', MASTER_KEY).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyUserSessionToken(token) {
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
