-- Làm sạch toàn bộ dữ liệu mẫu cũ trong bảng documents (nếu đã tạo trước đó)
TRUNCATE TABLE document_history, documents RESTART IDENTITY CASCADE;

-- 1. Bảng danh mục lĩnh vực hoạt động (Categories)
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10) NOT NULL DEFAULT '📁',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng tài liệu và quy trình (Documents - Trống 100% để vận hành chính thức)
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    doc_type VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    effective_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Có hiệu lực',
    access_level VARCHAR(50) DEFAULT 'Mở',
    department VARCHAR(100) NOT NULL,
    file_size VARCHAR(50) DEFAULT '1.5 MB',
    file_url TEXT,
    description TEXT,
    related_codes TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bảng lịch sử các phiên bản file cũ (Document File History)
CREATE TABLE IF NOT EXISTS document_history (
    id SERIAL PRIMARY KEY,
    document_id VARCHAR(50) REFERENCES documents(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_url TEXT,
    archive_date VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bảng người dùng và phân quyền RBAC (Users & Roles)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'user' (Cán bộ xem nội bộ), 'editor' (Biên tập), 'admin' (Quản trị viên)
    department VARCHAR(150),
    picture TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo 7 lĩnh vực chuẩn
INSERT INTO categories (id, name, icon, display_order) VALUES
('IT', 'IT', '💻', 1),
('Tài vụ', 'Tài vụ', '💰', 2),
('Hành chính', 'Hành chính', '🏢', 3),
('Y tế', 'Y tế', '🏥', 4),
('Kỹ thuật', 'Kỹ thuật', '⚙️', 5),
('ATVSTP', 'ATVSTP', '✅', 6),
('Mua sắm', 'Mua sắm', '📦', 7)
ON CONFLICT (id) DO NOTHING;

-- Chỉ cấp quyền Admin gốc cho Gmail quản trị được chỉ định riêng.
-- Mọi tài khoản @fpt.edu.vn khi đăng nhập mặc định chỉ có role = 'user' (xem & tải tài liệu nội bộ).
DELETE FROM users WHERE email LIKE '%@fpt.edu.vn' AND role = 'admin';

INSERT INTO users (email, full_name, role, department) VALUES
('buitandat1727@gmail.com', 'Bùi Tấn Đạt (Quản trị viên)', 'admin', 'Quản trị hệ thống'),
('hethongquanlyphong.fscct@gmail.com', 'Hệ thống Quản lý Phòng', 'admin', 'Quản trị hệ thống'),
('vp.fsc@fpt.edu.vn', 'Văn phòng FSchool Cần Thơ', 'admin', 'Quản trị hệ thống')
ON CONFLICT (email) DO UPDATE SET role = 'admin';
