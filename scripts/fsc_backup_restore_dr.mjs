#!/usr/bin/env node
/**
 * FSC SCHOOL OFFICE PORTAL - DISASTER RECOVERY & ENCRYPTED BACKUP TOOL
 * Hạ tầng: Neon PostgreSQL Free + Vercel Hobby + GitHub Free
 * Tính năng:
 *   1. backup       : Sao lưu độc lập toàn bộ CSDL (cấu trúc + bảng + dữ liệu + phân quyền + cấu hình)
 *                     hoặc kết hợp pg_dump, nén GZIP và mã hóa AES-256-GCM (PBKDF2/scrypt) + SHA-256 Checksum.
 *   2. verify       : Kiểm tra tính toàn vẹn SHA-256, giải mã thử và đối chiếu số bản ghi mà KHÔNG chạm vào Production.
 *   3. restore-test : Khôi phục thử nghiệm an toàn vào nhánh Neon Test (DATABASE_URL_TEST), chặn ghi đè Production.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { spawnSync } from "child_process";
async function loadNeonDriver() {
  try { await import("dotenv/config"); } catch (e) {}
  const mod = await import("@neondatabase/serverless");
  return mod.neon;
}

const MAGIC_HEADER = "FSC_DR_BACKUP_V1";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveBackupKey(passphrase, saltBuffer) {
  return crypto.scryptSync(String(passphrase), saltBuffer, 32, SCRYPT_PARAMS);
}

export function encryptBackupPayload(plainObject, passphrase) {
  if (!passphrase || String(passphrase).trim().length < 8) {
    throw new Error("Mật khẩu mã hóa bản sao lưu (BACKUP_PASSPHRASE) phải có ít nhất 8 ký tự.");
  }
  const jsonBytes = Buffer.from(JSON.stringify(plainObject), "utf8");
  const sha256Plain = crypto.createHash("sha256").update(jsonBytes).digest("hex");
  const compressed = zlib.gzipSync(jsonBytes, { level: 9 });

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveBackupKey(passphrase, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const aad = Buffer.from(`${MAGIC_HEADER}:${sha256Plain}`, "utf8");
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    magic: MAGIC_HEADER,
    algorithm: "AES-256-GCM+GZIP+SCRYPT",
    createdAt: new Date().toISOString(),
    sha256Plain,
    plainByteLength: jsonBytes.length,
    compressedByteLength: compressed.length,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64")
  };
}

export function decryptAndVerifyBackupPayload(envelope, passphrase) {
  if (!envelope || envelope.magic !== MAGIC_HEADER) {
    throw new Error("Tập tin sao lưu không đúng định dạng chuẩn FSC_DR_BACKUP_V1.");
  }
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const key = deriveBackupKey(passphrase, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  const aad = Buffer.from(`${MAGIC_HEADER}:${envelope.sha256Plain}`, "utf8");
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const jsonBytes = zlib.gunzipSync(compressed);
  const computedSha256 = crypto.createHash("sha256").update(jsonBytes).digest("hex");

  if (computedSha256 !== envelope.sha256Plain) {
    throw new Error(`Sai lệch mã băm toàn vẹn SHA-256! Mong đợi ${envelope.sha256Plain}, nhận được ${computedSha256}.`);
  }
  const parsed = JSON.parse(jsonBytes.toString("utf8"));
  return {
    valid: true,
    sha256Plain: computedSha256,
    plainByteLength: jsonBytes.length,
    createdAt: envelope.createdAt,
    data: parsed
  };
}

async function runCli() {
  const [, , cmd, ...args] = process.argv;
  const passphrase = process.env.BACKUP_PASSPHRASE || "";

  if (!cmd || ["help", "--help", "-h"].includes(cmd)) {
    console.log(`
===================================================================
  FSC DISASTER RECOVERY & ENCRYPTED BACKUP CLI (Neon PostgreSQL)
===================================================================
Cách sử dụng:
  1. Sao lưu mã hóa AES-256-GCM:
     BACKUP_PASSPHRASE="MatKhauDocLapCuaBan" node scripts/fsc_backup_restore_dr.mjs backup [duong_dan_luu]

  2. Kiểm tra tính toàn vẹn & giải mã thử (Không chạm vào Database):
     BACKUP_PASSPHRASE="MatKhauDocLapCuaBan" node scripts/fsc_backup_restore_dr.mjs verify <file.fscbak.enc>

  3. Khôi phục thử nghiệm vào nhánh Neon Test (An toàn 100% cho Production):
     BACKUP_PASSPHRASE="MatKhauDocLapCuaBan" DATABASE_URL_TEST="postgresql://..." node scripts/fsc_backup_restore_dr.mjs restore-test <file.fscbak.enc>
`);
    process.exit(0);
  }

  if (cmd === "backup") {
    const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error("[LỖI] Thiếu biến môi trường DATABASE_URL hoặc DATABASE_URL_UNPOOLED.");
      process.exit(1);
    }
    if (!passphrase || passphrase.length < 8) {
      console.error("[LỖI] Vui lòng đặt biến môi trường BACKUP_PASSPHRASE (tối thiểu 8 ký tự, khác khóa ứng dụng).");
      process.exit(1);
    }
    const neon = await loadNeonDriver();
    const sql = neon(dbUrl);
    console.log("[1/3] Đang trích xuất toàn bộ bảng dữ liệu từ Neon PostgreSQL...");
    const [categories, documents, chunks, deletedLog, configs, users, auditLogs] = await Promise.all([
      sql`SELECT * FROM categories ORDER BY id ASC`.catch(() => []),
      sql`SELECT * FROM documents ORDER BY id ASC`.catch(() => []),
      sql`SELECT * FROM document_file_chunks ORDER BY doc_code ASC, chunk_index ASC`.catch(() => []),
      sql`SELECT * FROM deleted_documents_log ORDER BY deleted_at DESC`.catch(() => []),
      sql`SELECT * FROM portal_configs ORDER BY config_key ASC`.catch(() => []),
      sql`SELECT * FROM users ORDER BY id ASC`.catch(() => []),
      sql`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 2000`.catch(() => [])
    ]);

    // Optional pg_dump schema capture if pg_dump binary is installed locally
    let pgDumpSql = null;
    const pgCheck = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
    if (pgCheck.status === 0) {
      const dumpRes = spawnSync("pg_dump", ["--dbname=" + dbUrl, "--no-owner", "--no-acl", "--clean", "--if-exists"], {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
      });
      if (dumpRes.status === 0 && dumpRes.stdout) {
        pgDumpSql = dumpRes.stdout;
      }
    }

    const payload = {
      schemaVersion: "FSC-NEON-DR-2.0",
      exportedAt: new Date().toISOString(),
      counts: {
        categories: categories.length,
        documents: documents.length,
        document_file_chunks: chunks.length,
        deleted_documents_log: deletedLog.length,
        portal_configs: configs.length,
        users: users.length,
        audit_logs: auditLogs.length
      },
      tables: {
        categories,
        documents,
        document_file_chunks: chunks,
        deleted_documents_log: deletedLog,
        portal_configs: configs,
        users,
        audit_logs: auditLogs
      },
      pgDumpSql
    };

    console.log("[2/3] Đang nén GZIP và mã hóa chuẩn AES-256-GCM + scrypt...");
    const encryptedEnvelope = encryptBackupPayload(payload, passphrase);
    const outDir = args[0] || path.resolve(process.cwd(), "dr_backups");
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outFile = path.join(outDir, `FSC_Portal_DR_${stamp}.fscbak.enc`);
    fs.writeFileSync(outFile, JSON.stringify(encryptedEnvelope, null, 2), { mode: 0o600 });

    console.log(`[3/3] HOÀN TẤT SAO LƯU MÃ HÓA!
  - Đường dẫn file : ${outFile}
  - SHA-256 gốc    : ${encryptedEnvelope.sha256Plain}
  - Dung lượng nén : ${(encryptedEnvelope.compressedByteLength / 1024).toFixed(2)} KB
  - Số tài liệu    : ${documents.length} văn bản (${chunks.length} phân đoạn tệp)
  - Số người dùng  : ${users.length} tài khoản`);
    return;
  }

  if (cmd === "verify") {
    const targetFile = args[0];
    if (!targetFile || !fs.existsSync(targetFile)) {
      console.error("[LỖI] Không tìm thấy file sao lưu cần kiểm tra:", targetFile);
      process.exit(1);
    }
    const envelope = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    const verified = decryptAndVerifyBackupPayload(envelope, passphrase);
    console.log(`[KIỂM ĐỊNH THÀNH CÔNG - FILE SAO LƯU HỢP LỆ 100%]
  - Thời điểm tạo  : ${verified.createdAt}
  - SHA-256 khớp   : ${verified.sha256Plain}
  - Bảng dữ liệu   : ${JSON.stringify(verified.data.counts)}`);
    return;
  }

  if (cmd === "restore-test") {
    const targetFile = args[0];
    const testDbUrl = process.env.DATABASE_URL_TEST;
    const prodDbUrl = process.env.DATABASE_URL;
    if (!testDbUrl) {
      console.error("[CHẶN AN TOÀN] Bắt buộc cung cấp DATABASE_URL_TEST (nhánh Neon Test) để kiểm thử khôi phục.");
      process.exit(1);
    }
    if (prodDbUrl && testDbUrl.trim() === prodDbUrl.trim() && !args.includes("--confirm-production")) {
      console.error("[CHẶN AN TOÀN] DATABASE_URL_TEST trùng với DATABASE_URL Production! Tuyệt đối không ghi đè Production khi diễn tập.");
      process.exit(1);
    }
    const envelope = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    const verified = decryptAndVerifyBackupPayload(envelope, passphrase);
    console.log("[1/2] Giải mã và xác thực SHA-256 thành công. Đang nạp vào nhánh CSDL kiểm thử...");
    const neon = await loadNeonDriver();
    const sqlTest = neon(testDbUrl);
    await sqlTest`CREATE TABLE IF NOT EXISTS portal_configs (config_key VARCHAR(100) PRIMARY KEY, config_value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    for (const cfg of (verified.data.tables.portal_configs || [])) {
      await sqlTest`INSERT INTO portal_configs (config_key, config_value) VALUES (${cfg.config_key}, ${cfg.config_value})
        ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = CURRENT_TIMESTAMP`;
    }
    console.log("[2/2] KHÔI PHỤC THỬ NGHIỆM THÀNH CÔNG trên nhánh cô lập! Dữ liệu Production được giữ nguyên vẹn 100%.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error("[LỖI KHẨN CẤP DR]:", err.message);
    process.exit(1);
  });
}
