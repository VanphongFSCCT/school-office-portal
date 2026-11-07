# 🏛️ CỔNG THÔNG TIN VĂN PHÒNG ĐIỆN TỬ — SCHOOL OFFICE PORTAL v5.0 (FSC CẦN THƠ)

Hệ thống Quản lý Tài liệu, Quy trình Chuẩn Vận hành (SOP), Hướng dẫn Công việc (WI) và Biểu mẫu Điện tử dành cho **Trường THPT FPT Cần Thơ (FSC Cần Thơ)**.

---

## 🌟 Điểm mới nổi bật trong Phiên bản v5.0

1. **Quản lý Phiên bản Tài liệu & Quy trình (`v1.0` ➔ `v2.0`)**:
   - Khi Admin cập nhật quy trình hoặc tải tệp mới thay thế (ví dụ nâng từ bản `1.0` lên `2.0`), hệ thống **tự động lưu trữ bản cũ (`1.0`) vào lịch sử phiên bản**.
   - **Người dùng (Cán bộ / Giảng viên / Khách)**: Chỉ nhìn thấy và áp dụng phiên bản mới nhất (`v2.0`).
   - **Quản trị viên (Admin)**: Có hộp chọn **`🕓 Lịch sử bản lưu (Admin)`** ngay trên thanh tiêu đề trình đọc để chuyển đổi xem lại hoặc tải xuống bất kỳ phiên bản cũ nào (`v1.0`).

2. **Hiển thị File Word (`.docx`) & Excel (`.xlsx`) chuẩn 100% bố cục máy tính + Mặc định Chỉ xem (View-Only)**:
   - **Hiển thị Word chuẩn xác (`docx-preview` + `jszip`)**: Giữ nguyên 100% định dạng gốc trên máy tính gồm căn giữa tiêu đề, căn phải khối chữ ký (`LỜI CẢM ƠN.docx`), bảng biểu, lề trang A4 và phông chữ.
   - **Hiển thị Excel đa Sheet (`SheetJS`)**: Hỗ trợ chuyển đổi mượt mà giữa tất cả các Sheet trong tệp `.xlsx`/`.xls`.
   - **Mặc định Chỉ xem (`View-Only Default`)**: Khi mở bất kỳ tài liệu nào, hệ thống luôn ở chế độ **Chỉ xem** (`contenteditable="false"`), tuyệt đối không tự ý bật khung chỉnh sửa.
   - **Thanh công cụ Word/Excel khi chọn Chỉnh sửa**: Chỉ khi người dùng bấm nút **`✍️ Chỉnh sửa / Điền biểu mẫu`**, thanh công cụ định dạng Word mới xuất hiện đầy đủ: **Font chữ** (`Times New Roman`, `Arial`, `Be Vietnam Pro`, `Calibri`), **Cỡ chữ (`10pt` – `24pt`)**, **In đậm / In nghiêng / Gạch chân**, **Màu chữ & Màu tô sáng**, **Căn lề Trái / Giữa / Phải / Đều 2 bên**, cùng nút thêm dòng/cột Excel để điền và **In** hoặc **Tải xuống** mà không làm thay đổi bản gốc của hệ thống.

3. **Kiến trúc Điều hướng 2 Cấp theo Lĩnh vực hoạt động**:
   - **Cấp 1 (Giao diện Tổng quan Lĩnh vực)**: Hiển thị trực quan các thẻ **Lĩnh vực hoạt động** (*IT*, *Tài vụ*, *Hành chính*, *Y tế*, *Kỹ thuật*, *ATVSTP*, *Mua sắm*...) kèm thống kê số lượng từng loại văn bản.
   - **Cấp 2 (Chi tiết theo Lĩnh vực)**: Khi bấm chọn một Lĩnh vực, hệ thống mở giao diện riêng của lĩnh vực đó với **các Tab phân loại rõ ràng**:
     - `📚 Tất cả`
     - `📘 Quy trình (SOP)`
     - `📗 Hướng dẫn (WI)`
     - `📝 Biểu mẫu (Forms)`

4. **Kiểm soát Phân quyền (RBAC), Khóa bí mật & Header Bảo mật OWASP**:
   - Không lưu trữ bất kỳ khóa bí mật nào trong mã nguồn (`process.env.POSTGRES_URL`, `process.env.GOOGLE_CLIENT_ID`).
   - Cấu hình đầy đủ các HTTP Security Headers chuẩn OWASP (`Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) trong `vercel.json` và toàn bộ Serverless API.
   - Tích hợp công cụ kiểm thử tự động & quét bảo mật trước khi Go-Live tại `tests/automated_qa_and_security_scan.js`.

---

## 🧪 Chạy Kiểm thử Tự động & Quét Bảo mật trước khi Go-Live

```bash
node tests/automated_qa_and_security_scan.js
```

---

## 📦 Danh sách các File cần cập nhật lên GitHub / Vercel

Nếu bạn đã triển khai hệ thống trước đó, chỉ cần giải nén gói **`files-can-cap-nhat.zip`** và cập nhật các tệp sau:
- `public/index.html` (Giao diện & toàn bộ tính năng v5.0)
- `api/documents.js` (API lưu trữ tài liệu & lịch sử phiên bản `version_history` + Header bảo mật)
- `api/users.js` (API phân quyền RBAC & bảo vệ Root Admin + Header bảo mật)
- `api/config.js` (API cấu hình + Header bảo mật)
- `api/auth/google.js` (API xác thực OAuth + Header bảo mật)
- `vercel.json` (Cấu hình định tuyến & OWASP Security Headers)
- `SPECIFICATION.md` & `tests/automated_qa_and_security_scan.js` (Tài liệu đặc tả & bộ test tự động)
