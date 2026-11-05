-- Bảng danh mục lĩnh vực hoạt động (Categories)
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10) NOT NULL DEFAULT '📁',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng tài liệu và quy trình (Documents)
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    doc_type VARCHAR(50) NOT NULL, -- 'Quy trình', 'Hướng dẫn công việc', 'Biểu mẫu'
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    effective_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Có hiệu lực',
    access_level VARCHAR(50) DEFAULT 'Mở', -- 'Mở', 'Nội bộ'
    department VARCHAR(100) NOT NULL,
    file_size VARCHAR(50) DEFAULT '1.5 MB',
    file_url TEXT,
    description TEXT,
    related_codes TEXT[], -- danh sách mã liên kết
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lịch sử các phiên bản file cũ (Document File History)
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

-- Bảng người dùng và phân quyền (Users & Roles)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'guest', -- 'guest', 'user', 'editor', 'approver', 'admin'
    department VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dữ liệu mẫu khởi tạo (Seed data)
INSERT INTO categories (id, name, icon, display_order) VALUES
('IT', 'IT', '💻', 1),
('Tài vụ', 'Tài vụ', '💰', 2),
('Hành chính', 'Hành chính', '🏢', 3),
('Y tế', 'Y tế', '🏥', 4),
('Kỹ thuật', 'Kỹ thuật', '⚙️', 5),
('ATVSTP', 'ATVSTP', '✅', 6),
('Mua sắm', 'Mua sắm', '📦', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO documents (id, code, title, category_id, doc_type, version, effective_date, status, access_level, department, file_size, description, related_codes) VALUES
('IT-02', 'IT-WI-02', 'Hướng dẫn Khắc phục Sự cố Mạng và Máy in Văn phòng', 'IT', 'Hướng dẫn công việc', '1.0', '01/03/2026', 'Có hiệu lực', 'Mở', 'Bộ phận IT', '2.4 MB', 'Cẩm nang hỗ trợ cán bộ tự xử lý các sự cố mạng, máy in phổ biến.', ARRAY['IT-BM-01']),
('IT-03', 'IT-BM-01', 'Biểu mẫu Yêu cầu Cấp phát Thiết bị & Phần mềm', 'IT', 'Biểu mẫu', '1.3', '20/04/2026', 'Có hiệu lực', 'Mở', 'Bộ phận IT', '1.2 MB', 'Phiếu đăng ký tiếp nhận máy tính, thiết bị và phần mềm làm việc.', ARRAY['IT-WI-02']),
('TV-02', 'TV-BM-01', 'Giấy đề nghị Tạm ứng Ngân sách Hoạt động', 'Tài vụ', 'Biểu mẫu', '2.0', '10/02/2026', 'Có hiệu lực', 'Mở', 'Phòng Kế toán - Tài vụ', '1.1 MB', 'Mẫu biểu đề nghị tạm ứng ngân sách cho các hoạt động của đơn vị.', ARRAY['TV-SOP-01']),
('HC-01', 'HC-SOP-01', 'Quy trình Đặt phòng họp và Mượn/Trả Tài sản Công', 'Hành chính', 'Quy trình', '1.2', '05/01/2026', 'Có hiệu lực', 'Mở', 'Phòng Hành chính', '1.8 MB', 'Quy định đặt lịch phòng họp trực tuyến và mượn/trả thiết bị công.', ARRAY['HC-BM-01']),
('HC-02', 'HC-BM-01', 'Phiếu Đăng ký Sử dụng Văn phòng phẩm Định kỳ', 'Hành chính', 'Biểu mẫu', '1.0', '15/01/2026', 'Có hiệu lực', 'Mở', 'Phòng Hành chính', '850 KB', 'Mẫu biểu tổng hợp nhu cầu văn phòng phẩm trước ngày 25 hằng tháng.', ARRAY['HC-SOP-01']),
('YT-01', 'YT-SOP-01', 'Quy trình Tiếp nhận Sơ cứu ban đầu và Chuyển viện khẩn cấp', 'Y tế', 'Quy trình', '1.1', '12/03/2026', 'Có hiệu lực', 'Mở', 'Bộ phận Y tế', '2.1 MB', 'Trình tự sơ cứu khẩn cấp tại chỗ và phân công liên hệ chuyển viện 115.', ARRAY[]::text[]),
('KT-01', 'KT-SOP-01', 'Quy trình Báo hỏng và Bảo trì Cơ sở Vật chất Tòa nhà', 'Kỹ thuật', 'Quy trình', '2.0', '01/04/2026', 'Có hiệu lực', 'Mở', 'Tổ Kỹ thuật', '1.5 MB', 'Tiếp nhận báo hỏng điện nước, máy lạnh và cam kết phản hồi kỹ thuật SLA ≤ 2h.', ARRAY[]::text[]),
('MS-02', 'MS-BM-01', 'Phiếu Đề xuất Mua sắm Vật tư & Báo giá Cạnh tranh', 'Mua sắm', 'Biểu mẫu', '1.4', '10/05/2026', 'Có hiệu lực', 'Mở', 'Bộ phận Mua sắm', '1.3 MB', 'Biểu mẫu đối sánh giá nhà cung cấp trước khi trình Lãnh đạo phê duyệt.', ARRAY[]::text[]),
('IT-01', 'IT-SOP-01', 'Quy trình Cấp mới và Thu hồi Tài khoản Hệ thống', 'IT', 'Quy trình', '2.1', '15/01/2026', 'Có hiệu lực', 'Nội bộ', 'Bộ phận IT', '2.8 MB', 'Trình tự cấp tài khoản email FPT, quyền truy cập hệ thống cho nhân sự mới.', ARRAY['IT-BM-01']),
('TV-01', 'TV-SOP-01', 'Quy trình Thanh toán Chi phí và Hoàn ứng Công tác', 'Tài vụ', 'Quy trình', '3.0', '01/02/2026', 'Có hiệu lực', 'Nội bộ', 'Phòng Kế toán - Tài vụ', '3.2 MB', 'Quy định chứng từ hợp lệ, định mức công tác phí và giải ngân tạm ứng.', ARRAY['TV-BM-01'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO document_history (document_id, version, filename, archive_date, note) VALUES
('IT-03', '1.0', 'IT-BM-01_v1.0.docx', '10/01/2025', 'Bản lưu trữ trước đây'),
('IT-01', '2.0', 'IT-SOP-01_v2.0.docx', '10/05/2025', 'Bản lưu trữ 2025')
ON CONFLICT DO NOTHING;
