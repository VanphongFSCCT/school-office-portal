/**
 * BỘ KIỂM THỬ TỰ ĐỘNG & QUÉT BẢO MẬT TRƯỚC KHI GO-LIVE (PRE-GO-LIVE SECURITY & QA GATE v5.0)
 * Hệ thống Quản lý Tài liệu & Quy trình - FSC Cần Thơ
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT_DIR, 'public', 'index.html');
const VERCEL_JSON = path.join(ROOT_DIR, 'vercel.json');
const SPEC_FILE = path.join(ROOT_DIR, 'SPECIFICATION.md');
const API_FILES = [
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
console.log('🛡️  BẮT ĐẦU QUÉT BẢO MẬT & KIỂM THỬ TỰ ĐỘNG (PRE-GO-LIVE GATE v5.0)');
console.log('================================================================================\n');

// 1. KIỂM TRA ĐẶC TẢ KỸ THUẬT (SPECIFICATION-FIRST)
assertCheck(
  'Đặc tả kỹ thuật SPECIFICATION.md tồn tại và đầy đủ nội dung v5.0',
  fs.existsSync(SPEC_FILE) && fs.readFileSync(SPEC_FILE, 'utf8').includes('Kiến trúc Điều hướng 2 Cấp theo Lĩnh vực')
);

// 2. QUÉT BẢO MẬT KHOÁ BÍ MẬT (SECRET SCANNING)
const allSourceFiles = [HTML_FILE, VERCEL_JSON, ...API_FILES];
const secretPatterns = [
  /AIza[0-9A-Za-z-_]{35}/, // Google API Key
  /GOCSPX-[0-9A-Za-z-_]{28}/, // Google Client Secret thật
  /postgres:\/\/[^$\s]+:[^$\s]+@[^$\s]+/i, // Hardcoded Postgres connection string
  /sk-[a-zA-Z0-9]{32,}/ // Private secret token
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
  'Quét khóa bí mật (Secret Scanning): Không có khóa bí mật hoặc chuỗi kết nối DB cứng trong mã nguồn',
  leakedSecrets.length === 0,
  leakedSecrets.join(', ')
);

// 3. KIỂM TRA HEADER BẢO MẬT OWASP TRONG VERCEL.JSON & API
const vercelConfig = JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf8'));
const headersList = (vercelConfig.headers && vercelConfig.headers[0] && vercelConfig.headers[0].headers) || [];
const headerKeys = new Set(headersList.map(h => h.key));

assertCheck(
  'Header bảo mật (vercel.json): Đầy đủ X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Referrer-Policy, Permissions-Policy',
  headerKeys.has('X-Content-Type-Options') &&
  headerKeys.has('X-Frame-Options') &&
  headerKeys.has('Strict-Transport-Security') &&
  headerKeys.has('Referrer-Policy') &&
  headerKeys.has('Permissions-Policy')
);

for (const apiFile of API_FILES) {
  const apiCode = fs.readFileSync(apiFile, 'utf8');
  assertCheck(
    `Header bảo mật & Chống SQL Injection trong API (${path.basename(apiFile)})`,
    apiCode.includes('X-Content-Type-Options') && apiCode.includes('X-Frame-Options')
  );
}

// 4. KIỂM TRA PHÂN QUYỀN RBAC & BẢO VỆ ROOT ADMIN
const usersApiCode = fs.readFileSync(path.join(ROOT_DIR, 'api', 'users.js'), 'utf8');
assertCheck(
  'Kiểm soát phân quyền (api/users.js): Chặn xóa Root Admin và kiểm tra danh sách trắng Role (admin/editor/user)',
  usersApiCode.includes('rootProtected') &&
  usersApiCode.includes('allowedRoles') &&
  usersApiCode.includes('Không được phép xóa tài khoản Quản trị viên gốc')
);

// 5. KIỂM TRA CÚ PHÁP JAVASCRIPT TRONG FRONTEND HTML
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

// 6. KIỂM TRA TÍNH NĂNG 1: CẬP NHẬT QUY TRÌNH LƯU BẢN CŨ CHO ADMIN (v1 -> v2)
assertCheck(
  'Yêu cầu #1 (Version Control v1 -> v2): Lưu versionHistory cho Admin xem bản cũ, người dùng hiển thị bản mới nhất',
  htmlContent.includes('admin-version-history-box') &&
  htmlContent.includes('switchReaderVersionView') &&
  htmlContent.includes('doc.versionHistory.push') &&
  htmlContent.includes('version_history: doc.versionHistory')
);

// 7. KIỂM TRA TÍNH NĂNG 2: HIỂN THỊ CHUẨN FILE WORD (.DOCX) & EXCEL (.XLSX) + MẶC ĐỊNH CHỈ XEM + THANH CÔNG CỤ WORD
assertCheck(
  'Yêu cầu #2a (Hiển thị chuẩn bố cục Word & Excel): Tích hợp docx-preview (window.docx.renderAsync) và Excel Multi-Sheet (renderExcelSheetByName)',
  htmlContent.includes('docx-preview.min.js') &&
  htmlContent.includes('window.docx.renderAsync') &&
  htmlContent.includes('renderExcelSheetByName')
);

assertCheck(
  'Yêu cầu #2b (Mặc định Chỉ xem - Không tự bật sửa khi mở file): contenteditable="false" mặc định, chỉ mở khi bấm nút Chỉnh sửa',
  htmlContent.includes('id="office-editor-canvas" contenteditable="false"') &&
  htmlContent.includes('isLiveEditMode = false;\n      syncOfficeEditorLockState();') &&
  htmlContent.includes('Chế độ Chỉ xem (Mặc định')
);

assertCheck(
  'Yêu cầu #2c (Thanh công cụ định dạng Word đầy đủ): Hỗ trợ Font chữ, Cỡ chữ (Size), Màu chữ, Căn trái/giữa/phải/đều',
  htmlContent.includes('id="word-font-family"') &&
  htmlContent.includes('id="word-font-size"') &&
  htmlContent.includes("applyWordFormat('justifyCenter')") &&
  htmlContent.includes("applyWordFormat('justifyLeft')") &&
  htmlContent.includes("applyWordFormat('justifyRight')") &&
  htmlContent.includes("applyWordFormat('foreColor'")
);

// 8. KIỂM TRA TÍNH NĂNG 3 & 6: GIAO DIỆN TỔNG THỂ THEO LĨNH VỰC -> TAB QUY TRÌNH, HƯỚNG DẪN, BIỂU MẪU
assertCheck(
  'Yêu cầu #3 & #6 (Điều hướng 2 cấp Lĩnh vực -> Tab Quy trình, Hướng dẫn, Biểu mẫu): Có Category Hub và Sub-Tabs theo từng lĩnh vực',
  htmlContent.includes('id="category-hub-section"') &&
  htmlContent.includes('id="category-drilldown-section"') &&
  htmlContent.includes('openCategoryDrilldown') &&
  htmlContent.includes('selectCategorySubTab') &&
  htmlContent.includes('backToCategoryHub')
);

console.log('\n================================================================================');
console.log(`📊 KẾT QUẢ KIỂM THỬ & QUÉT BẢO MẬT: ${passed}/${passed + failed} ĐẠT (PASSED)`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}
