/**
 * ============================================================================
 * BỘ KIỂM THỬ NGHIỆM THU TỔNG THỂ (PRODUCTION READINESS E2E AUDIT SUITE)
 * Thực thi trực tiếp trên các module API, Crypto, DR Backup và DOM Logic
 * ============================================================================
 */
import fs from "fs";
import vm from "vm";
import assert from "assert";
import docsHandler, {
  encryptSensitiveText,
  decryptSensitiveText,
  signUserSessionToken,
  verifyUserSessionToken,
  hashIdentifierSHA256
} from "../api/documents.js";
import usersHandler from "../api/users.js";
import configHandler from "../api/config.js";
import authGoogleHandler from "../api/auth/google.js";
import {
  encryptBackupPayload,
  decryptAndVerifyBackupPayload,
  validateBackupPassphrase
} from "../scripts/fsc_backup_restore_dr.mjs";

function createMockReqRes({ method = "GET", query = {}, body = {}, headers = {}, cookies = "" }) {
  const reqHeaders = { ...headers };
  if (cookies) reqHeaders.cookie = cookies;
  const req = {
    method,
    query,
    body,
    headers: reqHeaders,
    socket: { remoteAddress: "127.0.0.1" }
  };
  const resHeaders = {};
  let statusCode = 200;
  let jsonBody = null;
  let ended = false;
  const res = {
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
    getHeader(k) { return resHeaders[k.toLowerCase()]; },
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; ended = true; return this; },
    end() { ended = true; return this; },
    getResult() { return { statusCode, headers: resHeaders, body: jsonBody, ended }; }
  };
  return { req, res };
}

async function runAudit() {
  process.env.DATABASE_URL = "postgresql://mock_user:mock_pass@ep-mock-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  console.log("================================================================================");
  console.log("🔍 BẮT ĐẦU KIỂM THỬ NGHIỆM THU PRODUCTION READINESS (E2E FUNCTIONAL & SECURITY)");
  console.log("================================================================================");
  let passed = 0;
  let total = 0;

  function recordTest(id, name, ok, evidence) {
    total++;
    if (ok) passed++;
    console.log(`${ok ? "✅ [ĐẠT]" : "❌ [CHƯA ĐẠT]"} [${id}] ${name} -> Bằng chứng: ${evidence}`);
    if (!ok) throw new Error(`Test failed: ${id} - ${name}`);
  }

  // 1. Kiểm thử Quản lý Phiên (Session Token HMAC-SHA256 + Cookie Fallback + Logout)
  const adminToken = signUserSessionToken({ email: "buitandat1727@gmail.com", role: "admin" });
  const cbgvToken = signUserSessionToken({ email: "giaovien01@fpt.edu.vn", role: "cbgv" });
  const forgedToken = adminToken.slice(0, -4) + "XXXX";

  const verifiedAdmin = verifyUserSessionToken(adminToken);
  const verifiedForged = verifyUserSessionToken(forgedToken);
  recordTest(
    "FUNC-01",
    "Ký và xác minh chữ ký phiên HMAC-SHA256 & Chặn token bị sửa đổi",
    Boolean(verifiedAdmin && verifiedAdmin.role === "admin" && verifiedForged === null),
    `Admin role=${verifiedAdmin?.role}, Forged token=${verifiedForged}`
  );

  // Kiểm thử Logout xóa HttpOnly Cookie trên api/auth/google.js
  {
    const { req, res } = createMockReqRes({
      method: "POST",
      body: { action: "logout" }
    });
    await authGoogleHandler(req, res);
    const out = res.getResult();
    const setCookieStr = String(out.headers["set-cookie"] || "");
    recordTest(
      "FUNC-02",
      "Đăng xuất (Logout) thu hồi ngay lập tức HttpOnly Cookie (Max-Age=0)",
      out.statusCode === 200 && setCookieStr.includes("Max-Age=0") && setCookieStr.includes("HttpOnly"),
      `HTTP ${out.statusCode}, Set-Cookie="${setCookieStr}"`
    );
  }

  // 2. Kiểm thử Phân quyền API (RBAC) với Bearer Token và HttpOnly Cookie
  {
    // Unauthenticated POST /api/documents -> 401
    const { req: r1, res: s1 } = createMockReqRes({
      method: "POST",
      body: { code: "01-QT/IT/FSC", title: "Test Unauth" }
    });
    await docsHandler(r1, s1);
    const resUnauth = s1.getResult();

    // CBGV role POST /api/documents -> 403
    const { req: r2, res: s2 } = createMockReqRes({
      method: "POST",
      headers: { authorization: `Bearer ${cbgvToken}` },
      body: { code: "01-QT/IT/FSC", title: "Test CBGV Write" }
    });
    await docsHandler(r2, s2);
    const resCbgv = s2.getResult();

    // Unauthenticated GET /api/users -> 401, CBGV GET /api/users -> 403
    const { req: r3, res: s3 } = createMockReqRes({ method: "GET" });
    await usersHandler(r3, s3);
    const resUsersUnauth = s3.getResult();

    const { req: r4, res: s4 } = createMockReqRes({
      method: "GET",
      cookies: `fsc_session_token=${encodeURIComponent(cbgvToken)}`
    });
    await usersHandler(r4, s4);
    const resUsersCbgvCookie = s4.getResult();

    recordTest(
      "SEC-01",
      "Chặn truy cập trái phép trên POST /api/documents và GET /api/users (Bearer & Cookie)",
      resUnauth.statusCode === 401 && resCbgv.statusCode === 403 && resUsersUnauth.statusCode === 401 && resUsersCbgvCookie.statusCode === 403,
      `POST doc(no-token)=${resUnauth.statusCode}, POST doc(cbgv)=${resCbgv.statusCode}, GET users(no-token)=${resUsersUnauth.statusCode}, GET users(cbgv-cookie)=${resUsersCbgvCookie.statusCode}`
    );
  }

  // 2B. Kiểm thử Chặn tải lên tập tin chứa mã thực thi (.html / .svg / .js) trên POST /api/documents
  {
    const { req: rBadExt, res: sBadExt } = createMockReqRes({
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        code: "99-XSS/IT/FSC",
        title: "Test XSS File",
        current_file: "malicious.html",
        file_data: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="
      }
    });
    await docsHandler(rBadExt, sBadExt);
    const outBad = sBadExt.getResult();
    recordTest(
      "SEC-02",
      "Chặn tải lên tập tin thực thi nguy hiểm (.html/.svg/.js) theo chuẩn OWASP ASVS V12",
      outBad.statusCode === 400 && String(outBad.body?.error || "").includes("OWASP ASVS"),
      `HTTP ${outBad.statusCode}: "${outBad.body?.error}"`
    );
  }

  
  // 2C. Kiểm thử Thu hồi Phiên tức thì khi tài khoản đang có Token cũ bị chuyển sang 'blocked' trên toàn bộ API (GET/POST/DELETE)
  {
    const staffEmail = "canbo_vp_test@fpt.edu.vn";
    const staffHash = hashIdentifierSHA256(staffEmail);
    const oldActiveOfficeToken = signUserSessionToken({ email: staffEmail, role: "office" });
    const oldActiveAdminToken = signUserSessionToken({ email: staffEmail, role: "admin" });

    // Giả lập bảng users trong DB đã chuyển tài khoản này sang role = 'blocked'
    globalThis.__MOCK_DB_USERS__ = [{ email: staffEmail, email_hash: staffHash, role: "blocked" }];

    // (1) GET /api/documents (dùng Bearer token cũ) -> Phải bị chặn 403
    const { req: rGetList, res: sGetList } = createMockReqRes({
      method: "GET",
      query: { _t: "1" },
      headers: { authorization: `Bearer ${oldActiveOfficeToken}` }
    });
    await docsHandler(rGetList, sGetList);
    const outGetList = sGetList.getResult();

    // (2) GET /api/documents?code=01-QT/TV/VPFSC (dùng HttpOnly Cookie cũ) -> Phải bị chặn 403
    const { req: rGetDetail, res: sGetDetail } = createMockReqRes({
      method: "GET",
      query: { code: "01-QT/TV/VPFSC" },
      cookies: `fsc_session_token=${encodeURIComponent(oldActiveOfficeToken)}`
    });
    await docsHandler(rGetDetail, sGetDetail);
    const outGetDetail = sGetDetail.getResult();

    // (3) POST /api/documents (dùng token cũ) -> Phải bị chặn 403
    const { req: rPostDoc, res: sPostDoc } = createMockReqRes({
      method: "POST",
      headers: { authorization: `Bearer ${oldActiveOfficeToken}` },
      body: { code: "02-QT/TV/VPFSC", title: "Thử ghi bằng token cũ của tài khoản đã khóa" }
    });
    await docsHandler(rPostDoc, sPostDoc);
    const outPostDoc = sPostDoc.getResult();

    // (4) DELETE /api/documents (dùng token Admin phụ cũ đã bị khóa) -> Phải bị chặn 403
    const { req: rDelDoc, res: sDelDoc } = createMockReqRes({
      method: "DELETE",
      query: { id: "01-QT/TV/VPFSC" },
      headers: { authorization: `Bearer ${oldActiveAdminToken}` }
    });
    await docsHandler(rDelDoc, sDelDoc);
    const outDelDoc = sDelDoc.getResult();

    // (5) GET & POST & DELETE /api/users (dùng token Admin phụ cũ đã bị khóa) -> Phải bị chặn 403
    const { req: rGetUsr, res: sGetUsr } = createMockReqRes({
      method: "GET",
      query: { _t: "1" },
      headers: { authorization: `Bearer ${oldActiveAdminToken}` }
    });
    await usersHandler(rGetUsr, sGetUsr);
    const outGetUsr = sGetUsr.getResult();

    const { req: rPostUsr, res: sPostUsr } = createMockReqRes({
      method: "POST",
      headers: { authorization: `Bearer ${oldActiveAdminToken}` },
      body: { email: "new@fpt.edu.vn", role: "admin" }
    });
    await usersHandler(rPostUsr, sPostUsr);
    const outPostUsr = sPostUsr.getResult();

    // (6) POST /api/config (dùng token Admin phụ cũ đã bị khóa) -> Phải bị chặn 403
    const { req: rPostCfg, res: sPostCfg } = createMockReqRes({
      method: "POST",
      cookies: `fsc_session_token=${encodeURIComponent(oldActiveAdminToken)}`,
      body: { categories: [] }
    });
    await configHandler(rPostCfg, sPostCfg);
    const outPostCfg = sPostCfg.getResult();

    globalThis.__MOCK_DB_USERS__ = [];

    const allBlocked403 = [
      outGetList.statusCode,
      outGetDetail.statusCode,
      outPostDoc.statusCode,
      outDelDoc.statusCode,
      outGetUsr.statusCode,
      outPostUsr.statusCode,
      outPostCfg.statusCode
    ].every(code => code === 403);

    recordTest(
      "SEC-03",
      "Thu hồi phiên tức thì đối với tài khoản 'blocked' đang giữ Token/Cookie cũ trên toàn bộ API (GET/POST/DELETE)",
      allBlocked403,
      `GET_docs=${outGetList.statusCode}, GET_detail(cookie)=${outGetDetail.statusCode}, POST_docs=${outPostDoc.statusCode}, DEL_docs=${outDelDoc.statusCode}, GET_users=${outGetUsr.statusCode}, POST_users=${outPostUsr.statusCode}, POST_config(cookie)=${outPostCfg.statusCode}`
    );
  }

  // 2D. Kiểm thử Chống lộ thông tin lỗi Database (HTTP 500 Sanitization - OWASP ASVS V7.4)
  {
    globalThis.__SIMULATE_DB_THROW__ = true;
    const { req: rErr, res: sErr } = createMockReqRes({
      method: "DELETE",
      query: { id: "01-QT/TV/VPFSC" },
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await docsHandler(rErr, sErr);
    const outErr = sErr.getResult();
    globalThis.__SIMULATE_DB_THROW__ = false;

    const errMsg = String(outErr.body?.error || "");
    recordTest(
      "SEC-04",
      "Ẩn hoàn toàn chi tiết lỗi nội bộ PostgreSQL khi xảy ra ngoại lệ HTTP 500 (OWASP ASVS V7.4)",
      outErr.statusCode === 500 && !errMsg.includes("secret_internal_pg_table") && errMsg.includes("Lỗi xử lý cơ sở dữ liệu nội bộ"),
      `HTTP ${outErr.statusCode}: "${errMsg}" (Không lộ tên bảng nội bộ)`
    );
  }

  // 3. Kiểm thử Chốt chặn Môi trường Preview (Chống Preview ghi/xóa nhầm vào DB Production)
  {
    process.env.VERCEL_ENV = "preview";
    delete process.env.DATABASE_URL_PREVIEW;
    delete process.env.ALLOW_PREVIEW_PROD_WRITE;

    const { req, res } = createMockReqRes({
      method: "DELETE",
      query: { id: "01-QT/TV/VPFSC" },
      headers: { authorization: `Bearer ${adminToken}` }
    });
    await docsHandler(req, res);
    const out = res.getResult();
    delete process.env.VERCEL_ENV;

    recordTest(
      "DEPLOY-01",
      "Chốt chặn Preview Environment: Ngăn bản Preview xóa/sửa dữ liệu Production",
      out.statusCode === 403 && String(out.body?.error || "").includes("Preview"),
      `HTTP ${out.statusCode}: "${out.body?.error}"`
    );
  }

  // 4. Kiểm thử Mã hóa AES-256-GCM & Chống giả mạo Ciphertext (Tamper Detection)
  {
    const sampleSecretText = "Quy trình Nội bộ Văn phòng: Đăng ký cấp phát đồng phục 2026";
    const cipher = encryptSensitiveText(sampleSecretText);
    const decrypted = decryptSensitiveText(cipher);
    // Tamper 1 byte in ciphertext
    const parts = cipher.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("a") ? "b" : "a");
    const tamperedResult = decryptSensitiveText(parts.join(":"));

    recordTest(
      "DATA-01",
      "Mã hóa trường nhạy cảm AES-256-GCM và từ chối bản mã bị can thiệp (AuthTag check)",
      cipher.startsWith("ENCv6_GCM:") && decrypted === sampleSecretText && tamperedResult === "",
      `Prefix=${cipher.slice(0, 11)}, DecryptedMatch=${decrypted === sampleSecretText}, TamperedRejected=${tamperedResult === ""}`
    );
  }

  // 5. Kiểm thử Sao lưu Độc lập & Tách biệt Khóa Giải mã (Disaster Recovery Tool)
  {
    const appKey = "app-master-key-1234567890";
    let rejectedSameKey = false;
    try { validateBackupPassphrase(appKey, appKey); } catch (e) { rejectedSameKey = true; }

    const drPass = "FSC-DR-IndependentPassphrase-2026!";
    const backupEnvelope = encryptBackupPayload({
      schemaVersion: "FSC-NEON-DR-2.0",
      tables: {
        categories: [{ id: "TV", name: "Tài vụ" }],
        documents: [{ code: "01-QT/TV/VPFSC", title: "Đồng phục", access_level: "Nội bộ Văn phòng" }],
        document_file_chunks: [],
        deleted_documents_log: [],
        portal_configs: [],
        users: [{ email_hash: hashIdentifierSHA256("buitandat1727@gmail.com"), role: "admin" }],
        audit_logs: []
      }
    }, drPass, appKey);

    const verifiedDr = decryptAndVerifyBackupPayload(backupEnvelope, drPass);
    recordTest(
      "DR-01",
      "Sao lưu mã hóa AES-256-GCM + scrypt(N=32768), tách biệt khóa & đối chiếu SHA-256 7 bảng",
      rejectedSameKey && verifiedDr.valid && verifiedDr.tableManifest.documents.rowCount === 1,
      `SameKeyRejected=${rejectedSameKey}, SHA256=${verifiedDr.sha256Plain.slice(0, 16)}..., DocsCount=${verifiedDr.tableManifest.documents.rowCount}`
    );
  }

  // 6. Kiểm thử Hồi quy Giao diện & Cú pháp 4 khối Script trong public/index.html
  {
    const html = fs.readFileSync("public/index.html", "utf8");
    const scriptBlocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
    for (let i = 0; i < scriptBlocks.length; i++) {
      new vm.Script(scriptBlocks[i][1], { filename: `index_html_script_${i + 1}.js` });
    }
    const hasDeferViewer = html.includes("mammoth.browser.min.js\" defer") && html.includes("xlsx.full.min.js\" defer") && html.includes("pdf.min.js\" defer");
    const hasDebounceSearch = html.includes("searchDebounceTimer") && html.includes("150");
    const hasOptimisticLock = html.includes("expected_updated_at") && html.includes("res.status === 409");
    const hasIdempotencyHeader = html.includes("X-Idempotency-Key");
    const hasExcelExport = html.includes("window.exportDocumentsExcelReport = function()");
    const hasHealthAudit = html.includes("window.runAdminSystemHealthAndAudit = async function()");
    const hasBlockedRoleOption = html.includes('<option value="blocked"');
    const hasQrCenterPrint = html.includes("@page { margin: 0mm !important; }") && html.includes("SCHOOL OFFICE");

    recordTest(
      "UI-REG-01",
      "Kiểm thử hồi quy toàn bộ tính năng Frontend (Cú pháp JS, Defer, Debounce, 409 Lock, QR A4/A5, Excel, Audit Log)",
      scriptBlocks.length === 4 && hasDeferViewer && hasDebounceSearch && hasOptimisticLock && hasIdempotencyHeader && hasExcelExport && hasHealthAudit && hasBlockedRoleOption && hasQrCenterPrint,
      `ScriptsCompiled=${scriptBlocks.length}/4, DeferJS=${hasDeferViewer}, Debounce150ms=${hasDebounceSearch}, 409Lock=${hasOptimisticLock}, ExcelExport=${hasExcelExport}, QRPrintA4A5=${hasQrCenterPrint}`
    );
  }

  console.log("================================================================================");
  console.log(`🎯 KẾT QUẢ NGHIỆM THU THỰC NGHIỆM TRONG SANDBOX: ${passed}/${total} ĐẠT 100%`);
  console.log("================================================================================");
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
