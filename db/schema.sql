-- =============================================================================
-- HỆ THỐNG VĂN PHÒNG ĐIỆN TỬ TRƯỜNG HỌC (SCHOOL OFFICE PORTAL v6.0)
-- Cơ sở dữ liệu: Neon Serverless PostgreSQL (Tương thích AES-256-GCM & Chunked Files)
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
    status TEXT DEFAULT 'Có hiệu lực',
    department TEXT,
    description TEXT,
    access_level TEXT DEFAULT 'Mở',
    download_perm TEXT DEFAULT 'allow_all',
    current_file TEXT,
    file_data TEXT,
    version_history JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_file_chunks (
    doc_code TEXT NOT NULL,
    chunk_index INT NOT NULL,
    encrypted_chunk TEXT NOT NULL,
    PRIMARY KEY (doc_code, chunk_index)
);
