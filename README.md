# 🏛️ HỒ SƠ BÀN GIAO KỸ THUẬT TOÀN DIỆN & NGỮ CẢNH DÀNH CHO KỸ SƯ / AI KẾ NHIỆM
## Dự án: Cổng Thông tin Văn phòng Điện tử — Trường THPT FPT Cần Thơ (`School Office Portal v6.5`)
- **Địa chỉ vận hành chính thức (Production URL)**: [https://vp-fsc.vercel.app](https://vp-fsc.vercel.app)
- **Đơn vị chủ quản**: Văn phòng — Trường THPT FPT Cần Thơ (FSchool Cần Thơ)
- **Kiến trúc sư & Quản trị hệ thống**: Bùi Tấn Đạt (`buitandat1727@gmail.com` / `hethongquanlyphong.fscct@gmail.com`)
- **Phiên bản kiến trúc**: `v6.5 Enterprise Zero-Trust & High-Concurrency Edition`

---

## PHẦN 1: GIỚI THIỆU TỔNG QUAN (DÀNH CHO NGƯỜI MỚI BẮT ĐẦU)

### 1.1. Hệ thống này là gì và dùng để làm gì?
**School Office Portal (`vp-fsc.vercel.app`)** là cổng thông tin quản lý tập trung toàn bộ **Quy trình (SOP)**, **Hướng dẫn công việc (WI)**, **Biểu mẫu (Forms)** và **Hệ sinh thái ứng dụng nội bộ** của Văn phòng Trường THPT FPT Cần Thơ (bao gồm các bộ phận: *Hành chính, Tài vụ, Mua sắm, IT, Kỹ thuật, Y tế, An toàn vệ sinh thực phẩm - ATVSTP*).

Thay vì gửi file rời rạc qua email/Zalo hoặc tìm kiếm thủ công trên nhiều thư mục, hệ thống cho phép:
1. **Tra cứu & Đọc trực tuyến tức thì**: Xem trực tiếp nội dung file Word (`.docx`), Excel (`.xlsx`), PDF ngay trên trình duyệt mà không cần tải về máy.
2. **Điền & Chỉnh sửa trực tiếp biểu mẫu**: Cán bộ có thể điền thông tin trực tiếp vào biểu mẫu trên web và bấm in chuẩn khổ A4 không dính tiêu đề/chân trang thừa của trình duyệt.
3. **Tạo & In Bảng Mã QR Quy trình chuẩn A4 / A5**: Mỗi quy trình tự động có một mã QR độ phân giải siêu nét (`1600×1600px`) gắn nhãn trung tâm `SCHOOL OFFICE PORTAL` để in dán tại phòng làm việc, hành lang hoặc khu kỹ thuật (quét QR trên điện thoại mở thẳng quy trình đó).
4. **Phân quyền bảo mật đa tầng (RBAC)**: Tách biệt rõ ràng tài liệu **Mở (Công khai)**, tài liệu dành cho **CBGV Trường (`@fpt.edu.vn`)**, tài liệu **Nội bộ Văn phòng** (chỉ nhân sự được Admin gán quyền Văn phòng mới thấy) và tài liệu **Chỉ Admin**.
5. **Theo dõi vòng đời & Hạn rà soát văn bản**: Tự động tính toán và cảnh báo các văn bản sắp đến hạn hoặc quá hạn rà soát, cho phép chỉnh hạn rà soát riêng cho từng quy trình.

### 1.2. Hạ tầng vận hành 100% Miễn phí (Zero-Cost Cloud Stack)
Hệ thống được thiết kế tối ưu để vận hành bền vững trên 3 nền tảng miễn phí mà không phát sinh chi phí hàng tháng:
- **Mã nguồn & CI/CD**: [GitHub Free](https://github.com/pricing) (Private Repository + GitHub Actions kiểm thử tự động + Git Hooks bảo vệ nhánh `main`).
- **Máy chủ Web & Serverless API**: [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) (Định tuyến vùng thực thi tại Singapore `"regions": ["sin1"]` để đạt độ trễ thấp nhất về Việt Nam và cụm cơ sở dữ liệu).
- **Cơ sở dữ liệu Đám mây**: [Neon Serverless PostgreSQL Free](https://neon.com/docs/introduction/plans) (Project: `school-office-portal-db`, Branch mặc định: `production`, Database: `neondb`, kết nối qua PgBouncer Connection Pooler `-pooler`).

---

## PHẦN 2: CẤU TRÚC THƯ MỤC & VAI TRÒ TỪNG TẬP TIN TRONG GÓI MÃ NGUỒN

Khi giải nén gói `files-can-cap-nhat.zip`, bạn sẽ thấy cấu trúc thư mục chuẩn như sau:

```text
school-office-portal/
├── api/                                      # Tầng Backend Serverless Functions (Node.js ES Modules)
│   ├── documents.js                          # API Quản lý Văn bản/Quy trình (GET danh sách/chi tiết, POST lưu/chunk, DELETE)
│   ├── users.js                              # API Quản lý Phân quyền RBAC, Khóa tài khoản, Sức khỏe DB & Audit Log
│   ├── config.js                             # API Đồng bộ Danh mục Bộ phận (Categories) & Liên kết Hệ sinh thái FSC
│   └── auth/
│       └── google.js                         # API Xác thực Google OIDC, kiểm tra Role DB & cấp Session Token + HttpOnly Cookie
├── db/                                       # Tầng Cơ sở dữ liệu PostgreSQL
│   ├── schema.sql                            # Cấu trúc chuẩn của toàn bộ 7 bảng và 6 chỉ mục tối ưu
│   └── migrations/
│       ├── 001_neon_perf_and_integrity_up.sql   # Kịch bản SQL nâng cấp Index & bảng audit_logs (Không phá hủy dữ liệu)
│       └── 001_neon_perf_and_integrity_down.sql # Kịch bản SQL hoàn tác Index an toàn
├── public/                                   # Tầng Giao diện Người dùng (Frontend Single-Page Application)
│   ├── index.html                            # Toàn bộ Giao diện, CSS hiệu ứng, Mã hóa Client & Logic nghiệp vụ
│   ├── tao_khoa_bao_mat_fsc.html             # Công cụ độc lập tạo khóa mã hóa DATA_ENCRYPTION_KEY trên trình duyệt
│   ├── robots.txt                            # Chặn tuyệt đối các Bot tìm kiếm và AI thu thập dữ liệu nội bộ
│   ├── favicon.png                           # Biểu tượng trang web
│   └── logo-3d-*.png                         # Bộ tài nguyên logo 3D độ phân giải cao
├── scripts/                                  # Công cụ Quản trị & Phục hồi Thảm họa (Disaster Recovery)
│   ├── fsc_backup_restore_dr.mjs             # CLI Sao lưu mã hóa AES-256-GCM + scrypt, kiểm định SHA-256 & diễn tập khôi phục
│   └── install-git-hooks.sh                  # Cài đặt pre-commit (chặn lộ file .env/backup) & pre-push (bảo vệ nhánh main)
├── tests/                                    # Bộ Kiểm thử Tự động (QA, E2E, Bảo mật & Chịu tải)
│   ├── automated_qa_and_security_scan.js     # 16 bài kiểm thử bảo mật, mã hóa, cú pháp JS và tính năng QMS
│   ├── production_readiness_e2e_audit.mjs    # 10 bài kiểm thử nghiệm thu E2E gọi trực tiếp vào 4 API handlers
│   └── load_and_concurrency_benchmark.mjs    # 5 bài kiểm thử chịu tải từng bước (10->25->50 VU) & chống xung đột 409
├── .github/workflows/
│   └── ci-security-qa.yml                    # GitHub Actions tự động kiểm tra bảo mật & cú pháp khi mở Pull Request
├── vercel.json                               # Cấu hình Vercel (Region sin1, Security Headers HSTS/CSP, Rewrites)
├── package.json                              # Khai báo dependencies (@neondatabase/serverless, dotenv) & npm scripts
├── .gitignore                                # Chặn tuyệt đối .env, *.sql, *.fscbak.enc, *Backup*.json lên GitHub
├── SPECIFICATION.md                          # Đặc tả kỹ thuật lõi bảo mật Zero-Trust
└── TAI_LIEU_BAN_GIAO_TOAN_DIEN_HE_THONG_VA_AI_HANDOFF.md # (Tài liệu bàn giao toàn diện này)
```

---

## PHẦN 3: THIẾT KẾ GIAO DIỆN (UI/UX), HIỆU ỨNG & CHI TIẾT CÁC TÍNH NĂNG

### 3.1. Ngôn ngữ Thiết kế & Hiệu ứng Chuyển động (Animations)
1. **Bảng màu Luxury Navy & Gold Enterprise**:
   - Nền chính sâu sang trọng: `#03152D` (Deep Navy) kết hợp nền thẻ `#071F3D` và `#102E52`.
   - Điểm nhấn thương hiệu: Vàng ánh kim `#FFC857` và viền vàng đồng `#B98A33`.
   - Màu trạng thái ngữ nghĩa: Xanh ngọc lục bảo `#22C58B` (Có hiệu lực / An toàn), Xanh lam sáng `#16A8F4` (Mã văn bản / CBGV), Tím `#A855F7` (Nội bộ Văn phòng), Đỏ hồng `#F43F5E` (Quá hạn / Khóa / Cảnh báo).
2. **Hiệu ứng Chuyển cảnh 60fps (`GPU-Accelerated Animations`)**:
   - `@keyframes fscSmoothTabEnter`: Hiệu ứng trượt nhẹ `translate3d(0, 10px, 0) scale(0.992)` trong `0.22s` với hàm gia tốc `cubic-bezier(0.16, 1, 0.3, 1)` khi chuyển giữa các phân hệ.
   - `@keyframes fscSmoothSubTabPulse`: Hiệu ứng chuyển mượt `0.18s` khi lọc bộ phận hoặc chuyển danh mục con.
   - **Tối ưu tốc độ hiển thị đầu tiên (`0ms Boot Pre-fetch`)**: Ngay dòng đầu tiên của thẻ `<head>`, trình duyệt đã phát lệnh tải song song `/api/config` và `/api/documents` (`window._earlyConfigFetchPromise` và `window._earlyDocsFetchPromise`), đồng thời gắn thuộc tính `defer` cho cả 5 thư viện đọc tài liệu nặng (`jszip`, `docx-preview`, `mammoth`, `xlsx`, `pdf.js` — tổng cộng `~2.45 MB`) để giao diện hiện ra tức thì mà không bị chặn luồng dựng hình.

### 3.2. Chi tiết 10 Phân hệ & Tính năng Nghiệp vụ trong `public/index.html`
1. **Cây Bộ phận & Bộ lọc Kép (Mã & Tên tài liệu)**:
   - Sidebar bên trái hiển thị danh sách Bộ phận kèm số lượng văn bản từng loại (`Quy trình`, `Hướng dẫn công việc`, `Biểu mẫu`).
   - Ô tìm kiếm chính (`#main-search-input`) được gắn bộ trễ **`Debounce 150ms`** giúp gõ phím mượt mà, hiển thị khung gợi ý nổi (`#search-suggestions-dropdown`) có hỗ trợ phím mũi tên `↑`/`↓` và `Enter`.
2. **Trình đọc & Chỉnh sửa Trực tiếp Word / Excel / PDF (`#modal-reader`)**:
   - **File PDF**: Kết xuất từng trang sắc nét qua `PDF.js` (`renderCustomSplitPdf`).
   - **File Word (`.docx`)**: Kết xuất giữ nguyên định dạng bảng biểu/căn lề qua `docx-preview` và `mammoth`, cho phép bật chế độ **"✍️ Điền / Chỉnh sửa trực tiếp"** (`contenteditable="true"`) để điền biểu mẫu ngay trên màn hình và bấm In chuẩn khổ giấy A4.
   - **File Excel (`.xlsx` / `.xls`)**: Kết xuất thành bảng tính tương tác qua `SheetJS (XLSX)`, cho phép sửa ô trực tiếp và in ấn gọn gàng.
3. **Tạo & In Mã QR Quy trình Chuẩn Khổ A4 / A5 (`#modal-doc-qrcode`)**:
   - Vẽ mã QR trên Canvas độ phân giải cao **`1600×1600px`** (mức sửa lỗi cao nhất `Error Correction Level H`), ở chính giữa đặt huy hiệu вектор sắc nét **`820×294px`** mang dòng chữ `SCHOOL OFFICE PORTAL`.
   - Hỗ trợ 2 nút chọn khổ in gọn gàng: **In Khổ A5 (`148 × 210 mm`)** và **In Khổ A4 (`210 × 297 mm`)**.
   - Trang in có đầy đủ Logo tiêu đề phía trên, khung viền sang trọng và quy tắc CSS `@page { margin: 0mm !important; }` kết hợp Flexbox căn giữa tuyệt đối vào tâm tờ giấy khi in.
4. **Cửa sổ Hệ sinh thái Số FSC Cần Thơ (`#modal-fsc-ecosystem`)**:
   - Giao diện rộng rãi (`w-[96vw] max-w-6xl`), **đã lược bỏ biểu tượng (icon) rườm rà** theo đúng yêu cầu để hiển thị tập trung vào số thứ tự, tên hệ thống, nhãn bộ phận, phạm vi phân quyền và mô tả.
   - Danh sách (`#fsc-ecosystem-grid`) có thanh cuộn dọc mượt mà (`overflow-y-auto`, `max-height: calc(90vh - 110px)`), hiển thị huy hiệu tổng số mục (`#fsc-eco-count-badge`) và hỗ trợ **nhấn phím `Esc` trên bàn phím để đóng nhanh cửa sổ**.
   - **Điều chỉnh thứ tự hiển thị dành cho Admin**: Trên mỗi dòng liên kết, Admin có thể bấm nút **`▲` (Đưa lên)**, **`▼` (Đưa xuống)** hoặc **nhập trực tiếp số thứ tự vị trí (`1, 2, 3...`)** vào ô số để đổi vị trí tức thì và tự động đồng bộ lên đám mây qua `/api/config`.
5. **Đăng tải 1 hoặc Nhiều Quy trình Cùng lúc (`#modal-add-document`)**:
   - Cho phép thêm nhiều khối quy trình trong 1 lần mở cửa sổ, mỗi quy trình đính kèm 1 file riêng biệt, tự động gợi ý Mã chuẩn tiếp theo (`01-QT/IT/FSC`, `02-QT/IT/FSC`...) và cho phép chọn **Hạn rà soát riêng** (`nextReviewDateIso`) cho từng quy trình.
6. **Chỉnh sửa Tài liệu, Lưu Lịch sử Phiên bản (`v1.0` $\rightarrow$ `v2.0`) & Hạn rà soát riêng (`#modal-edit-document`)**:
   - Khi Admin tăng số phiên bản hoặc tải tệp mới thay thế, phiên bản cũ được tự động đóng gói vào mảng `versionHistory` (kèm kho lưu trữ `IndexedDB`) để Admin có thể chuyển đổi xem lại bản cũ bất kỳ lúc nào.
   - Mục **Hạn rà soát riêng** hỗ trợ chọn ngày tháng cụ thể trên lịch hoặc bấm nút chọn nhanh **`+3T` (3 tháng)**, **`+6T` (6 tháng)**, **`+1N` (1 năm)**, **`+2N` (2 năm)**.
7. **Bảng Theo dõi Hạn rà soát Văn bản (`#modal-qms-review-tracker`)**:
   - Tự động phân loại văn bản thành 3 nhóm: **Quá hạn (Đỏ)**, **Sắp đến hạn $\le 30$ ngày (Vàng)** và **Còn hạn (Xanh)**; cho phép đổi ngày hạn rà soát trực tiếp trên từng dòng hoặc bấm gia hạn `+6 tháng` / `+12 tháng`.
8. **Trung tâm Giám sát Quản trị, Sức khỏe Hệ thống, Audit Log & Xuất Báo cáo Excel (`#view-admin-settings`)**:
   - Hiển thị 4 thẻ thống kê tức thì tính từ RAM (tổng số văn bản, phân bổ theo mức truy cập, số tài khoản phân quyền/đang khóa, trạng thái vùng `sin1`).
   - Nút **"📊 Xuất Báo cáo (.xlsx)"**: Xuất toàn bộ danh mục văn bản và tình trạng rà soát ra file Excel ngay trên trình duyệt bằng thư viện `SheetJS` (không tốn tài nguyên máy chủ).
   - Nút **"🩺 Kiểm tra Sức khỏe & Tải Nhật ký Audit"**: Đo độ trễ phản hồi thực tế của Neon DB (`ms`) và hiển thị 50 bản ghi `audit_logs` mới nhất.

---

## PHẦN 4: MA TRẬN PHÂN QUYỀN 5 CẤP (RBAC) & KIẾN TRÚC BẢO MẬT ZERO-TRUST

### 4.1. Ma trận Phân quyền Người dùng (RBAC)
Hệ thống thực thi phân quyền nghiêm ngặt ở **cả tầng Server API (`api/documents.js`, `api/users.js`, `api/config.js`) lẫn tầng Giao diện (`public/index.html`)**:

| Vai trò (Role) | Cách gán quyền | Tài liệu được phép hiển thị & xem | Quyền Thêm / Sửa / Xóa / Quản trị |
| :--- | :--- | :--- | :--- |
| **`admin` (Quản trị viên)** | 2 email gốc (`buitandat1727@gmail.com`, `hethongquanlyphong.fscct@gmail.com`) hoặc do Admin cấp trong bảng RBAC. | Xem toàn bộ: **Chỉ Admin**, **Nội bộ Văn phòng**, **CBGV** và **Mở**. | Toàn quyền: Đăng tải, sửa, xóa văn bản, chia Role, khóa tài khoản, sửa bộ phận, xuất/nhập sao lưu, xem Audit Log. |
| **`office` (Cán bộ Văn phòng)** | Do Admin cấp quyền trong bảng RBAC. | Xem được tài liệu **Nội bộ / Nội bộ Văn phòng**, **CBGV** và **Mở** (Ẩn tài liệu *Chỉ Admin*). | Được quyền cập nhật dữ liệu quy trình được giao; xuất danh mục Excel. |
| **`editor` (Biên tập Văn phòng)** | Do Admin cấp quyền trong bảng RBAC. | Xem được tài liệu **Nội bộ / Nội bộ Văn phòng**, **CBGV** và **Mở**. | Được quyền **Đăng tải tài liệu mới** và cập nhật văn bản. |
| **`cbgv` (CBGV Trường FPT)** | Tự động gán mặc định cho mọi email `@fpt.edu.vn` / `@fe.edu.vn` **chưa được Admin phân quyền Văn phòng**. | Chỉ xem được tài liệu **CBGV** và **Mở**. **Tuyệt đối không thấy và không mở được tài liệu Nội bộ Văn phòng**. | Chỉ xem & tải xuống (nếu văn bản cho phép tải). |
| **`user` / `guest`** | Người dùng chưa đăng nhập hoặc tài khoản ngoài chỉ được cấp quyền `user`. | Chỉ xem được tài liệu **Mở (Công khai)**. | Chỉ xem tài liệu công khai. |
| **`blocked` (Tạm khóa)** | Admin chọn `🔒 Tạm khóa tài khoản` trong bảng RBAC. | **Chặn 100% (`HTTP 403 Forbidden`)** trên mọi API đọc/ghi và thu hồi ngay phiên đăng nhập cũ. | Bị khóa hoàn toàn. |

### 4.2. Cơ chế Mã hóa & Bảo mật theo chuẩn OWASP ASVS
- **Mã hóa dữ liệu lưu trữ trên Server (`AES-256-GCM`)**: Trước khi lưu vào PostgreSQL, tiêu đề, phòng ban, mô tả, tên file, nội dung file (`file_data` / `encrypted_chunk`) và email trong bảng `users` đều được mã hóa bằng thuật toán `AES-256-GCM` với khóa dẫn xuất `scrypt` từ biến môi trường `DATA_ENCRYPTION_KEY` (có tiền tố `ENCv6_GCM:<iv_base64>:<authTag_base64>:<ciphertext_base64>`).
- **Xác thực Phiên Kép (`Bearer Token` + `HttpOnly Cookie`)**: Khi đăng nhập qua `/api/auth/google`, máy chủ xác minh token trực tiếp với Google (`oauth2.googleapis.com/tokeninfo` hoặc `userinfo`), sau đó ký `sessionToken` bằng `HMAC-SHA256` (thời hạn 8 giờ) và đồng thời gắn cookie `Set-Cookie: fsc_session_token=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`.
- **Kiểm soát Tải lên Tập tin (`validateUploadedDocumentFile`)**: Chặn cứng các phần mở rộng và MIME chứa mã thực thi nguy hiểm (`.html`, `.htm`, `.svg`, `.js`, `.exe`, `.php`, `.sh`...) ngay tại `POST /api/documents` với mã lỗi `400 Bad Request`.
- **Chốt chặn Môi trường Preview (`Preview Write-Guard`)**: Nếu biến môi trường của Vercel là `VERCEL_ENV === 'preview'` và chưa cấu hình nhánh DB thử nghiệm `DATABASE_URL_PREVIEW`, mọi thao tác `POST`/`DELETE` đều bị chặn `403` để bản thử nghiệm không bao giờ ghi đè hay xóa nhầm dữ liệu thật trên Production.

---

## PHẦN 5: KIẾN TRÚC CƠ SỞ DỮ LIỆU NEON POSTGRESQL & TỐI ƯU CHỊU TẢI

### 5.1. Sơ đồ 7 Bảng Dữ liệu (`db/schema.sql`)
1. **`categories`**: Lưu danh mục các Bộ phận (`id`, `name`, `description`, `icon`, `status`, `updated_at`).
2. **`documents`**: Lưu thông tin văn bản (`id`, `code`, `title`, `category_id`, `doc_type`, `version`, `effective_date`, `next_review_date`, `status`, `department`, `description`, `access_level`, `download_perm`, `current_file`, `file_data`, `file_url`, `version_history`, `updated_at`).
3. **`document_file_chunks`**: Lưu các phân đoạn (`950 KB/chunk`) của những tệp đính kèm lớn (`>950 KB`) để vượt qua giới hạn payload `4.5 MB` của Vercel Serverless Functions (`doc_code`, `chunk_index`, `encrypted_chunk`).
4. **`deleted_documents_log`**: Lưu mã văn bản đã xóa (`doc_code`, `deleted_at`) để đồng bộ xóa sạch bản lưu tạm trên trình duyệt của mọi thiết bị khác.
5. **`portal_settings`**: Lưu cấu hình toàn cục đã mã hóa (`portal_categories_v6`, `portal_ecosystem_links_v6`).
6. **`users`**: Lưu danh sách tài khoản phân quyền (`id`, `email` mã hóa, `email_hash` băm HMAC-SHA256, `full_name` mã hóa, `role`, `department`, `updated_at`).
7. **`audit_logs`**: Lưu nhật ký kiểm toán ẩn danh (`id`, `action`, `target_code`, `actor_hash`, `actor_role`, `created_at`) — tự động cắt tỉa giữ tối đa **2.000 dòng / 90 ngày** để không làm đầy dung lượng `1 GB` của Neon Free.

### 5.2. Các Kỹ thuật Tối ưu Hiệu suất & Chống Xung đột Đồng thời
- **Single-Round-Trip CTE & Zero-TOAST Detoasting**: Trong `GET /api/documents`, hệ thống gộp cả 4 truy vấn (`documents`, `document_file_chunks`, `deleted_documents_log`, `users`) vào **1 câu lệnh `WITH ... SELECT` duy nhất** và dùng `OCTET_LENGTH(d.file_data) > 10` để kiểm tra sự tồn tại của tệp mà không giải nén cột TOAST nặng hàng MB vào RAM khi tải danh sách trang chủ.
- **Singleflight Query Coalescing (`coalesceInFlightQuery`) & Micro-Cache phân lập**: Khi hàng chục người dùng mở trang cùng một thời điểm, các truy vấn cùng phạm vi quyền được gộp lại thành 1 truy vấn DB duy nhất; bộ nhớ đệm `L1 Cache` phân tách khóa theo `role + emailHash + category + page` nên không bao giờ lộ dữ liệu nhạy cảm giữa các tài khoản.
- **Chống Ghi đè Đồng thời (`Optimistic Locking - 409 Conflict`) & `X-Idempotency-Key`**: Khi lưu văn bản, trình duyệt gửi kèm mốc `expected_updated_at` và khóa `X-Idempotency-Key`. Nếu một cán bộ khác vừa sửa văn bản đó trước, máy chủ trả về `409 Conflict` và báo rõ trên màn hình thay vì âm thầm ghi đè; đồng thời giao diện **chỉ hiển thị thông báo xanh "Đã lưu thành công" sau khi cơ sở dữ liệu xác nhận (`dbConfirmed: true`)**.

---

## PHẦN 6: QUY TRÌNH VẬN HÀNH, CẬP NHẬT CODE & SAO LƯU KHÔI PHỤC (DR)

### 6.1. Các lệnh Kiểm thử & Sao lưu trong `package.json`
Mở Terminal tại thư mục dự án, bạn có sẵn các lệnh sau:
```bash
# 1. Chạy 16 bài kiểm thử bảo mật, mã hóa và cú pháp giao diện
npm test

# 2. Chạy 10 bài kiểm thử nghiệm thu E2E trực tiếp trên 4 API handlers
node tests/production_readiness_e2e_audit.mjs

# 3. Chạy kiểm thử chịu tải từng bước (10 -> 25 -> 50 người dùng đồng thời) & kiểm thử 409 Conflict
npm run test:load

# 4. Cài đặt Git Hooks bảo vệ nhánh main & chặn commit nhầm file .env / backup
npm run hooks:install

# 5. Sinh khóa giải mã sao lưu độc lập (Lưu vào trình quản lý mật khẩu)
npm run dr:keygen

# 6. Sao lưu mã hóa toàn bộ 7 bảng từ Neon PostgreSQL ra file .fscbak.enc
BACKUP_PASSPHRASE="KhoaDocLapCuaBan" DATABASE_URL_UNPOOLED="postgresql://..." npm run dr:backup ~/FSC_Safe_Backups

# 7. Kiểm tra tính toàn vẹn SHA-256 và giải mã thử file sao lưu (Offline 100%)
BACKUP_PASSPHRASE="KhoaDocLapCuaBan" npm run dr:verify ~/FSC_Safe_Backups/FSC_Portal_DR_....fscbak.enc
```

---

## PHẦN 7: BẢN "SYSTEM PROMPT / CHỈ DẪN BÀN GIAO" DÀNH CHO AI KHÁC HOẶC LẬP TRÌNH VIÊN KẾ NHIỆM

*(Nếu sau này bạn muốn nhờ một AI khác hoặc một lập trình viên khác chỉnh sửa/nâng cấp thêm tính năng cho hệ thống, bạn chỉ cần copy nguyên khối dưới đây gửi kèm gói `files-can-cap-nhat.zip` cho họ)*:

```markdown
### BỐI CẢNH & NGUYÊN TẮC BẤT KHẢ XÂM PHẠM KHI CHỈNH SỬA HỆ THỐNG SCHOOL OFFICE PORTAL (vp-fsc.vercel.app)

Bạn đang tiếp nhận mã nguồn hệ thống **School Office Portal v6.5** của Văn phòng Trường THPT FPT Cần Thơ, đang vận hành thực tế với dữ liệu thật trên **GitHub Free**, **Vercel Hobby (`regions: ["sin1"]`)** và **Neon PostgreSQL Free (`school-office-portal-db`, branch `production`, database `neondb`)**.

Khi thực hiện bất kỳ chỉnh sửa hay nâng cấp nào, bạn BẮT BUỘC phải tuân thủ 8 nguyên tắc kỹ thuật sau đây để không làm gãy các chức năng đang hoạt động:

1. **Giữ nguyên cấu trúc tự thân (Self-Contained Serverless APIs)**:
   - 4 tập tin API (`api/documents.js`, `api/users.js`, `api/config.js`, `api/auth/google.js`) dùng chuẩn ES Modules (`"type": "module"` trong `package.json`) và dùng chung thuật toán mã hóa `AES-256-GCM` (`ENCv6_GCM:`) + hàm băm định danh `hashIdentifierSHA256` (HMAC-SHA256 dẫn xuất từ `DATA_ENCRYPTION_KEY`).
   - Trong `signUserSessionToken(userObj)`, nếu `userObj.emailHash` đã là chuỗi hex 64 ký tự (`/^[a-f0-9]{64}$/i`) thì giữ nguyên, tuyệt đối không băm lần thứ hai.

2. **Bảo toàn 100% logic Phân quyền 5 cấp (RBAC) & Thu hồi phiên tức thì**:
   - Tài khoản `@fpt.edu.vn` / `@fe.edu.vn` chưa được Admin thêm vào bảng `users` mặc định có vai trò `cbgv` và TUYỆT ĐỐI KHÔNG được nhìn thấy hoặc tải về các văn bản có mức truy cập `Nội bộ`, `Nội bộ Văn phòng` hoặc `Chỉ Admin`.
   - Trong `public/index.html`, hàm `resolveUserEffectiveRole(userObj)` phải luôn ưu tiên kiểm tra `userObj.role` (`admin`, `office`, `editor`, `cbgv`, `user`, `blocked`) do Server trả về TRƯỚC KHI áp dụng quy tắc mặc định đuôi `@fpt.edu.vn -> cbgv` (bởi vì trên trình duyệt của người dùng không phải Admin, mảng `rbacUsers` không tải danh sách từ `/api/users`).
   - Khi đồng bộ `/api/users` trong `syncBackendConfigAndData()`, luôn hợp nhất (`merge`) với `rbacUsers` cục bộ và đẩy bù các tài khoản mới tạo lên Server, không ghi đè làm mất tài khoản vừa tạo khi F5.

3. **Không gây nghẽn hiệu năng Frontend & Không tiêu tốn Compute vô ích của Neon Free**:
   - Giữ nguyên thuộc tính `defer` trên 5 thư viện đọc file (`jszip`, `docx-preview`, `mammoth`, `xlsx`, `pdf.js`) và giữ nguyên 2 lệnh tải sớm `window._earlyConfigFetchPromise`, `window._earlyDocsFetchPromise` ở đỉnh thẻ `<head>`.
   - Tuyệt đối KHÔNG dùng `setInterval` hỏi thăm máy chủ liên tục (polling) hay tạo Cron Job đánh thức database liên tục để bảo vệ hạn mức `100 CU-hours/tháng` của Neon Free.

4. **Bảo toàn hiệu suất truy vấn PostgreSQL**:
   - Trong `GET /api/documents`, không bao giờ gọi `SELECT file_data` hay `to_jsonb(d)` trên toàn bộ danh sách văn bản (vì cột `file_data` chứa chuỗi Base64 lớn nằm trong bảng TOAST); chỉ dùng `OCTET_LENGTH(d.file_data) > 10` ở truy vấn danh sách và chỉ tải `file_data` / `document_file_chunks` khi người dùng mở xem 1 mã văn bản cụ thể (`GET /api/documents?code=...`).
   - Khi cập nhật thông tin văn bản mà không đổi tệp (`POST /api/documents`), giữ nguyên `file_data` trong PostgreSQL bằng biểu thức `CASE WHEN ${encryptedFileData} <> '' THEN ${encryptedFileData} ELSE file_data END`.

5. **Giữ nguyên các chi tiết UI/UX đặc thù đã chuẩn hóa**:
   - Trang in Mã QR (`#modal-doc-qrcode`): Độ phân giải QR `1600×1600px`, nhãn giữa `820×294px`, có Logo tiêu đề trang in và giữ nguyên `@page { margin: 0mm !important; }` để căn chính giữa tờ giấy A4 / A5.
   - Cửa sổ Hệ sinh thái Số FSC (`#modal-fsc-ecosystem`): Không hiển thị icon ở từng dòng mục, giữ thanh cuộn dọc (`#fsc-ecosystem-grid { overflow-y: auto !important; }`), giữ tính năng nhấn phím `Esc` để đóng cửa sổ và giữ bộ nút `▲`/`▼` + ô nhập số thứ tự vị trí cho Admin.
   - Hạn rà soát văn bản (`next_review_date` / `nextReviewDate`): Cho phép chỉnh ngày cụ thể riêng cho từng quy trình khi thêm mới, khi chỉnh sửa (kèm nút `+3T`, `+6T`, `+1N`, `+2N`) và trong bảng theo dõi hạn rà soát.

6. **Kiểm thử bắt buộc trước khi bàn giao**:
   - Mọi thay đổi trên `public/index.html` phải được kiểm tra cú pháp và chạy đạt 100% lệnh `npm test` (`tests/automated_qa_and_security_scan.js`) trước khi đóng gói.
```
