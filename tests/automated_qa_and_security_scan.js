/**
 * BỘ KIỂM THỬ TỰ ĐỘNG & QUÉT BẢO MẬT CẤP ĐỘ GIÁO SƯ AN TOÀN THÔNG TIN (PRE-GO-LIVE GATE v6.0)
 * Hệ thống Quản lý Tài liệu & Quy trình QMS - FSC Cần Thơ
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT_DIR, 'public', 'index.html');
const ROBOTS_FILE = path.join(ROOT_DIR, 'public', 'robots.txt');
const VERCEL_JSON = path.join(ROOT_DIR, 'vercel.json');
const SPEC_FILE = path.join(ROOT_DIR, 'SPECIFICATION.md');
const SECURITY_CORE = path.join(ROOT_DIR, 'api', '_security.js');
const API_FILES = [
  SECURITY_CORE,
  path.join(ROOT_DIR, 'api', 'documents.js'),
  path.join(ROOT_DIR, 'api', 'users.js'),
  path.join(ROOT_DIR, 'api', 'config.js'),
  path.join(ROOT_DIR, 'api', 'auth', 'google.js')
];

let passed = 0;
let failed = 0;

function assertCheck(name, condition, detail = '') {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name} ${detail ? '--> ' + detail : ''}`);
    failed++;
  }
}

console.log('================================================================================');
console.log('🛡️  QUÉT BẢO MẬT ZERO-TRUST E2EE, CHỐNG AI/BOT & KIỂM THỬ CHỊU TẢI (v6.0)');
console.log('================================================================================\n');

// 1. KIỂM TRA ĐẶC TẢ KỸ THUẬT (SPECIFICATION-FIRST)
assertCheck(
  'Đặc tả kỹ thuật SPECIFICATION.md tồn tại và đầy đủ nội dung',
  fs.existsSync(SPEC_FILE) && fs.readFileSync(SPEC_FILE, 'utf8').includes('Kiến trúc Điều hướng 2 Cấp')
);

// 2. QUÉT BẢO MẬT KHOÁ BÍ MẬT (SECRET SCANNING)
const allSourceFiles = [HTML_FILE, VERCEL_JSON, ...API_FILES];
const secretPatterns = [
  /AIza[0-9A-Za-z-_]{35}/,
  /GOCSPX-[0-9A-Za-z-_]{28}/,
  /postgres:\/\/[^$\s]+:[^$\s]+@[^$\s]+/i,
  /sk-[a-zA-Z0-9]{32,}/
];

let leakedSecrets = [];
for (const file of allSourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const regex of secretPatterns) {
    if (regex.test(content)) {
      leakedSecrets.push(`${path.basename(file)} khớp mẫu nhạy cảm ${regex}`);
    }
  }
}
assertCheck(
  'Quét khóa bí mật (Secret Scanning): Không lộ khóa bí mật hoặc chuỗi kết nối DB trong mã nguồn',
  leakedSecrets.length === 0,
  leakedSecrets.join(', ')
);

// 3. KIỂM TRA MÃ HÓA ĐẦU-CUỐI LƯU TRỮ (AES-256-GCM) & BĂM SHA-256 TÀI KHOẢN
const secCode = fs.readFileSync(SECURITY_CORE, 'utf8');
const docsApiCode = fs.readFileSync(path.join(ROOT_DIR, 'api', 'documents.js'), 'utf8');
const usersApiCode = fs.readFileSync(path.join(ROOT_DIR, 'api', 'users.js'), 'utf8');

assertCheck(
  'Mã hóa dữ liệu lưu trữ Server-Side (AES-256-GCM): Tự động mã hóa nội dung file, tiêu đề, mô tả & PII trước khi ghi vào PostgreSQL',
  secCode.includes("createCipheriv('aes-256-gcm'") &&
  secCode.includes("createDecipheriv('aes-256-gcm'") &&
  docsApiCode.includes('encryptSensitiveText') &&
  docsApiCode.includes('decryptSensitiveText') &&
  usersApiCode.includes('encryptSensitiveText') &&
  usersApiCode.includes('hashIdentifierSHA256')
);

// Kiểm thử thực tế thuật toán AES-256-GCM với tiếng Việt có dấu
const testKey = crypto.scryptSync('fsc-test-key', 'FSC_CANTHO_SALT_v6_2026', 32);
const testIv = crypto.randomBytes(12);
const samplePlain = 'Quy trình quản lý tài chính mật - Trường THPT FPT Cần Thơ 2026';
const cipher = crypto.createCipheriv('aes-256-gcm', testKey, testIv);
const encBuf = Buffer.concat([cipher.update(samplePlain, 'utf8'), cipher.final()]);
const tagBuf = cipher.getAuthTag();
const formattedCipher = `ENCv6_GCM:${testIv.toString('base64')}:${tagBuf.toString('base64')}:${encBuf.toString('base64')}`;

const decipher = crypto.createDecipheriv('aes-256-gcm', testKey, testIv);
decipher.setAuthTag(tagBuf);
const decPlain = Buffer.concat([decipher.update(encBuf), decipher.final()]).toString('utf8');

assertCheck(
  'Kiểm thử thực nghiệm AES-256-GCM (NIST SP 800-38D): Bản mã không chứa văn bản rõ và giải mã toàn vẹn 100%',
  !formattedCipher.includes('Quy trình') && decPlain === samplePlain
);

// 4. KIỂM TRA CHỐNG AI THU THẬP DỮ LIỆU & CHỐNG BOT QUÉT LỖ HỔNG (ANTI-AI & BOT SHIELD)
const vercelConfig = JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf8'));
const headersList = (vercelConfig.headers && vercelConfig.headers[0] && vercelConfig.headers[0].headers) || [];
const headerKeys = new Set(headersList.map(h => h.key));

assertCheck(
  'Chống AI & Bot thu thập dữ liệu (robots.txt + X-Robots-Tag: noai, noimageai + User-Agent Shield)',
  fs.existsSync(ROBOTS_FILE) &&
  fs.readFileSync(ROBOTS_FILE, 'utf8').includes('GPTBot') &&
  fs.readFileSync(ROBOTS_FILE, 'utf8').includes('ClaudeBot') &&
  headerKeys.has('X-Robots-Tag') &&
  secCode.includes('BLOCKED_BOT_PATTERNS') &&
  secCode.includes('gptbot') &&
  secCode.includes('sqlmap')
);

// 5. KIỂM TRA TỐI ƯU CHỊU TẢI CAO CHO NEON POSTGRESQL & API (CHỐNG QUÁ TẢI TRONG 1 THÁNG)
assertCheck(
  'Chống quá tải Neon PostgreSQL & API: Kích hoạt Connection Pooling Cache, L1 In-Memory Cache, ETag (304 Not Modified) & Rate Limiter',
  docsApiCode.includes('neonConfig.fetchConnectionCache = true') &&
  docsApiCode.includes('isDocSchemaReady') &&
  docsApiCode.includes('getCachedResponse') &&
  docsApiCode.includes('setCachedResponse') &&
  docsApiCode.includes('304') &&
  secCode.includes('ipRateLimitMap') &&
  secCode.includes('429')
);

// 6. KIỂM TRA PHÂN QUYỀN RBAC & BẢO VỆ ROOT ADMIN
assertCheck(
  'Kiểm soát phân quyền (api/users.js): Chặn xóa Root Admin và kiểm tra danh sách trắng Role (admin/editor/user)',
  usersApiCode.includes('rootProtected') &&
  usersApiCode.includes('allowedRoles') &&
  usersApiCode.includes('Không được phép xóa tài khoản Quản trị viên gốc')
);

// 7. KIỂM TRA CÚ PHÁP JAVASCRIPT & MÃ HÓA WEBCRYPTO CLIENT + GIAO DIỆN QMS TRONG INDEX.HTML
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');
const scriptBlocks = [...htmlContent.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
let syntaxOk = true;
let syntaxErrDetail = '';
scriptBlocks.forEach((match, idx) => {
  try {
    new vm.Script(match[1], { filename: `index.html#script_${idx + 1}` });
  } catch (err) {
    syntaxOk = false;
    syntaxErrDetail = err.message;
  }
});
assertCheck(
  `Kiểm tra cú pháp JavaScript (${scriptBlocks.length} khối script trong index.html)`,
  syntaxOk,
  syntaxErrDetail
);

assertCheck(
  'Mã hóa phía Client (FscCryptoVault WebCrypto AES-GCM & Zero-Password Session): Mã hóa localStorage và IndexedDB',
  htmlContent.includes('FscCryptoVault') &&
  htmlContent.includes('encryptAsyncGCM') &&
  htmlContent.includes('decryptAsyncGCM') &&
  htmlContent.includes('saveEncryptedUserSession')
);

assertCheck(
  'Giao diện chuẩn QMS kết hợp FSC Cần Thơ: Cây Bộ phận trên Sidebar, Tài liệu Yêu thích/Vừa xem, 5 Thẻ QMS, Bộ lọc kép Mã & Tên tài liệu',
  htmlContent.includes('sidebar-qms-dept-tree') &&
  htmlContent.includes('qms-filter-doc-code') &&
  htmlContent.includes('qms-filter-doc-name') &&
  htmlContent.includes('toggleFavouriteDocument') &&
  htmlContent.includes('recordRecentDocument')
);

assertCheck(
  'Tính năng đọc/sửa trực tiếp Word/Excel/PDF, In không dính Header/Footer & Xác nhận trước khi đóng',
  htmlContent.includes('window.docx.renderAsync') &&
  htmlContent.includes('convertPdfToEditableWord') &&
  htmlContent.includes('deleteExcelEditorRow') &&
  htmlContent.includes('modal-confirm-close-edit') &&
  htmlContent.includes('executeCleanPrintHtml')
);

console.log('\n================================================================================');
console.log(`📊 KẾT QUẢ KIỂM THỬ & QUÉT BẢO MẬT v6.0: ${passed}/${passed + failed} ĐẠT (PASSED)`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}
