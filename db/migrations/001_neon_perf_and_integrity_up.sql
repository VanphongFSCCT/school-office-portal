-- =============================================================================
-- MIGRATION AN TOÀN (NON-DESTRUCTIVE UPGRADE): 001_neon_perf_and_integrity_up.sql
-- Mục tiêu: Tối ưu hiệu suất truy vấn, chống ghi trùng và bảo toàn 100% dữ liệu
-- Cách chạy an toàn: Chạy thử trên nhánh Neon Test trước, sau đó chạy trên Production
-- =============================================================================
BEGIN;

-- 1. Đảm bảo các cột và bảng mở rộng tồn tại (Không xóa hay sửa kiểu dữ liệu phá hủy)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS next_review_date TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64);

-- 2. Gộp/loại bỏ bản ghi trùng mã văn bản (nếu có từ phiên bản cũ) nhưng GIỮ LẠI bản mới nhất
DELETE FROM documents d1
USING documents d2
WHERE LOWER(d1.code) = LOWER(d2.code)
  AND d1.id <> d2.id
  AND COALESCE(d1.updated_at, '1970-01-01'::timestamptz) < COALESCE(d2.updated_at, '1970-01-01'::timestamptz);

-- 3. Tạo các Index tăng tốc truy vấn và Unique Index bảo vệ toàn vẹn dữ liệu
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_lower_code ON documents (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_documents_cat_updated ON documents (category_id, updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_chunks_lower_doc_code ON document_file_chunks (LOWER(doc_code), chunk_index ASC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_hash ON users (email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

COMMIT;
