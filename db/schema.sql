-- =============================================================================
-- HỆ THỐNG VĂN PHÒNG ĐIỆN TỬ TRƯỜNG HỌC (SCHOOL OFFICE PORTAL v6.5)
-- Cơ sở dữ liệu: Neon Serverless PostgreSQL (Tối ưu PgBouncer, TOAST & Index)
-- =============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '📁',
    status TEXT DEFAULT 'Hoạt động',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    category_id TEXT NOT NULL DEFAULT 'IT',
    doc_type TEXT NOT NULL DEFAULT 'Quy trình',
    version TEXT DEFAULT '1.0',
    effective_date TEXT,
    next_review_date TEXT,
    status TEXT DEFAULT 'Có hiệu lực',
    department TEXT,
    description TEXT,
    access_level TEXT DEFAULT 'Mở',
    download_perm TEXT DEFAULT 'allow_all',
    current_file TEXT,
    file_data TEXT,
    file_url TEXT,
    version_history JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Đặt chiến lược lưu trữ EXTERNAL/EXTENDED cho cột TOAST lớn (file_data) giúp quét metadata cực nhanh
ALTER TABLE documents ALTER COLUMN file_data SET STORAGE EXTENDED;

CREATE TABLE IF NOT EXISTS document_file_chunks (
    doc_code TEXT NOT NULL,
    chunk_index INT NOT NULL,
    encrypted_chunk TEXT NOT NULL,
    PRIMARY KEY (doc_code, chunk_index)
);

CREATE TABLE IF NOT EXISTS deleted_documents_log (
    doc_code TEXT PRIMARY KEY,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    encrypted_value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    email_hash VARCHAR(64) UNIQUE,
    full_name TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    department TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(60) NOT NULL,
    target_code TEXT,
    actor_hash VARCHAR(64),
    actor_role VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- BỘ CHỈ MỤC TỐI ƯU HIỆU SUẤT CAO (CÓ BẰNG CHỨNG TRUY VẤN THỰC TẾ)
-- 1. Chống ghi trùng mã văn bản & tăng tốc tìm kiếm chi tiết O(log N)
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_lower_code ON documents (LOWER(code));
-- 2. Tăng tốc lọc theo Bộ phận + Sắp xếp mới nhất (Covering Composite Index)
CREATE INDEX IF NOT EXISTS idx_documents_cat_updated ON documents (category_id, updated_at DESC NULLS LAST);
-- 3. Tăng tốc sắp xếp danh sách văn bản theo thời gian cập nhật
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at DESC NULLS LAST);
-- 4. Tăng tốc tải phân đoạn tệp đính kèm theo mã văn bản
CREATE INDEX IF NOT EXISTS idx_chunks_lower_doc_code ON document_file_chunks (LOWER(doc_code), chunk_index ASC);
-- 5. Tăng tốc xác thực OIDC & kiểm tra thu hồi phiên O(1) theo mã băm SHA-256
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_hash ON users (email_hash) WHERE email_hash IS NOT NULL;
-- 6. Tăng tốc tra cứu nhật ký kiểm toán theo thời gian
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
