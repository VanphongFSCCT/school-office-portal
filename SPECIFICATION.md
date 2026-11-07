# ĐẶC TẢ KỸ THUẬT, NGHIỆP VỤ & BẢO MẬT HỆ THỐNG (TECHNICAL SPECIFICATION v5.0)
**Dự án:** Cổng Thông tin Quản lý Tài liệu & Quy trình Văn phòng Trường (School Office Portal - FSC Cần Thơ)  
**Phiên bản:** 5.0 (Production-Ready Release)  
**Đơn vị vận hành:** Văn phòng Trường THPT FPT Cần Thơ (FSC Cần Thơ)  

---

## 1. Mục tiêu & Phạm vi Nâng cấp v5.0
Bản nâng cấp v5.0 giải quyết triệt để các yêu cầu vận hành thực tế tại FSC Cần Thơ:
1. **Quản lý Vòng đời & Lịch sử Phiên bản Quy trình (`v1.0` ➔ `v2.0`):** Lưu trữ nguyên vẹn các phiên bản cũ để Quản trị viên (Admin) đối soát, tra cứu hoặc tải lại khi cần, trong khi Người dùng thông thường (Cán bộ / Giảng viên / Khách) chỉ nhìn thấy và sử dụng phiên bản hiệu lực mới nhất.
2. **Hiển thị Trung thực File Word (`.docx`) & Excel (`.xlsx`) + Chế độ Chỉ xem Mặc định (View-Only Default):**
   - Khắc phục hoàn toàn lỗi mất định dạng Word bằng cách tích hợp bộ dựng `docx-preview` (kết hợp `JSZip`), giữ nguyên 100% căn lề (trái, giữa, phải, đều), phông chữ, cỡ chữ, màu sắc, bảng biểu và khung chữ ký như trên Microsoft Word.
   - Bảng tính Excel (`.xlsx`, `.xls`) hỗ trợ chuyển đổi qua lại giữa nhiều Sheet, hiển thị rõ tiêu đề cột và đường kẻ lưới chuẩn.
   - **Mặc định khi mở tài liệu là Chế độ CHỈ XEM (`contenteditable="false"`):** Người dùng không thể vô tình sửa chữ khi đang đọc. Chỉ khi bấm nút **`✍️ Chỉnh sửa / Điền biểu mẫu`**, hệ thống mới mở thanh công cụ soạn thảo chuẩn Word (Font chữ, Cỡ chữ, Màu chữ, Màu nền, Đậm/Nghiêng/Gạch chân, Căn Trái/Giữa/Phải/Đều, Danh sách, Thêm dòng bảng) để điền thông tin rồi **In** hoặc **Tải xuống** mà không làm thay đổi file gốc của hệ thống.
3. **Kiến trúc Điều hướng 2 Cấp theo Lĩnh vực (Category-First Drill-Down Navigation):**
   - **Cấp 1 (Màn hình Tổng quan Lĩnh vực):** Hiển thị danh sách các Thẻ Lĩnh vực hoạt động (*IT, Tài vụ, Hành chính, Y tế, Kỹ thuật, ATVSTP, Mua sắm*...) kèm thống kê số lượng *Quy trình (SOP)*, *Hướng dẫn (WI)*, *Biểu mẫu* trong từng lĩnh vực.
   - **Cấp 2 (Không gian Lĩnh vực Chi tiết):** Khi bấm chọn một Lĩnh vực bất kỳ, hệ thống chuyển vào trang chi tiết của Lĩnh vực đó với **các Tab phân loại rõ ràng**:
     - `Tất cả tài liệu`
     - `📁 Quy trình (SOP)`
     - `📄 Hướng dẫn (WI)`
     - `📝 Biểu mẫu`
     Kèm nút `← Quay lại danh sách lĩnh vực` để chuyển đổi nhanh chóng, trực quan.
4. **Kiểm soát Phân quyền (RBAC), Khóa Bí mật & Header Bảo mật (Pre-Go-Live Security):**
   - Áp dụng bộ HTTP Security Headers chuẩn OWASP trên `vercel.json` và toàn bộ Serverless APIs.
   - Tuyệt đối không lưu khóa bí mật (`DATABASE_URL`, `GOOGLE_CLIENT_ID`) cứng trong mã nguồn; toàn bộ đọc từ biến môi trường (`process.env`).
   - Phân quyền 3 tầng chặt chẽ: `Root Admin / Admin`, `Editor`, `User (Cán bộ @fpt.edu.vn)`, và `Guest (Khách tra cứu tài liệu Mở)`.

---

## 2. Đặc tả Chi tiết Các Phân hệ Chức năng

### 2.1. Quản lý Phiên bản Tài liệu (Version Control Engine)
- **Cấu trúc dữ liệu phiên bản (`versionHistory`):**
  Mỗi đối tượng tài liệu `doc` có mảng `versionHistory: Array<{ version, effectiveDate, updatedAt, updatedBy, currentFile, fileData, desc, note }>`.
- **Luồng cập nhật phiên bản mới (`v1` ➔ `v2`):**
  1. Khi Admin mở **Chỉnh sửa / Cập nhật phiên bản** (hoặc đăng tải tài liệu trùng mã `code` đã có), nếu thay đổi số phiên bản (ví dụ từ `1.0` lên `2.0`) hoặc tải lên tệp thay thế mới:
  2. Hệ thống tự động đóng gói trạng thái hiện tại của bản `v1.0` (bao gồm cả `fileData` trong IndexedDB với khóa `code + '__v_' + version`) và đẩy vào đầu mảng `doc.versionHistory`.
  3. Bản chính của `doc` được cập nhật lên `v2.0` với tệp mới và ngày hiệu lực mới.
- **Phân quyền hiển thị phiên bản:**
  - **Người dùng thường / Khách:** Chỉ nhìn thấy phiên bản mới nhất (`v2.0`) trên thẻ/bảng và trong cửa sổ đọc.
  - **Quản trị viên (Admin):** Trong cửa sổ đọc tài liệu (`#modal-reader`) và cửa sổ sửa (`#modal-edit-document`), nếu tài liệu có các bản cũ trong `versionHistory`, hệ thống hiển thị nút & thanh chọn **`🕒 Lịch sử phiên bản (Admin)`** cho phép Admin bấm xem trực tiếp hoặc tải xuống bất kỳ phiên bản cũ nào (`v1.0`, `v1.1`...).

### 2.2. Trình Xem & Chỉnh sửa Biểu mẫu Trực tiếp (Word / Excel / PDF)
- **Trạng thái mặc định (Strict View-Only Mode):**
  - Khi mở bất kỳ tài liệu `.docx`, `.xlsx`, `.pdf` hoặc văn bản chuẩn:
    - `isLiveEditMode = false`
    - Vùng tài liệu đặt `contenteditable="false"`, con trỏ chuột ở chế độ đọc bình thường.
    - Thanh công cụ định dạng Word (`#office-editor-toolbar`) ở trạng thái ẩn.
- **Kích hoạt chế độ Chỉnh sửa / Điền biểu mẫu:**
  - Khi người dùng bấm nút **`✍️ Chỉnh sửa / Điền biểu mẫu`**:
    - Bật `isLiveEditMode = true`, mở khóa `contenteditable="true"` trên vùng soạn thảo.
    - Hiển thị **Thanh công cụ Word chuyên nghiệp**:
      - Chọn Phông chữ (*Times New Roman, Be Vietnam Pro, Arial, Tahoma*)
      - Chọn Cỡ chữ (*10pt, 11pt, 12pt, 13pt, 14pt, 16pt, 18pt, 20pt*)
      - Định dạng kiểu chữ: **Đậm (`B`)**, *Nghiêng (`I`)*, <u>Gạch chân (`U`)</u>
      - Màu chữ (`foreColor`) & Màu tô sáng (`hiliteColor`)
      - Căn lề: **Căn trái**, **Căn giữa**, **Căn phải**, **Căn đều 2 bên (Justify)**
      - Danh sách chấm đầu dòng / đánh số thứ tự & nút **+ Thêm dòng bảng**.
- **Bảo toàn bản gốc:** Mọi thao tác sửa chỉ nằm trên DOM tạm thời để **In tài liệu** hoặc **Tải xuống bản đã sửa**. Khi đóng cửa sổ, bấm **`↺ Bản gốc`** hoặc tải lại trang (`F5`), dữ liệu luôn giữ nguyên bản mặc định của hệ thống.

### 2.3. Điều hướng 2 Cấp theo Lĩnh vực (Category Hub & Sub-Tabs)
- **Chế độ 1 — Màn hình Tổng quan Lĩnh vực (`selectedCat === 'all'` và không đang tìm kiếm):**
  - Hiển thị lưới **Thẻ Lĩnh vực Hoạt động** (IT, Tài vụ, Hành chính, Y tế, Kỹ thuật, ATVSTP, Mua sắm...).
  - Mỗi thẻ hiển thị: Biểu tượng lĩnh vực, Tên lĩnh vực, Tổng số tài liệu, và 3 nhãn thống kê chi tiết: `X Quy trình` • `Y Hướng dẫn` • `Z Biểu mẫu`.
- **Chế độ 2 — Không gian Chi tiết Lĩnh vực (Khi bấm chọn 1 Lĩnh vực):**
  - Hiển thị thanh tiêu đề Lĩnh vực đã chọn + nút **`← Tất cả lĩnh vực`**.
  - Hiển thị **Thanh 4 Tab phân loại ngay bên dưới**:
    1. `Tất cả (N)`
    2. `📁 Quy trình - SOP (X)`
    3. `📄 Hướng dẫn - WI (Y)`
    4. `📝 Biểu mẫu (Z)`
  - Người dùng bấm vào từng Tab để lọc ngay danh sách Quy trình, Hướng dẫn hoặc Biểu mẫu của riêng lĩnh vực đó (hỗ trợ cả chế độ xem Thẻ Grid và Bảng List).

---

## 3. Đặc tả Bảo mật & Kiểm thử Tự động (Pre-Go-Live Gate)
1. **Quét Khóa Bí mật (Secret Scan):** Đảm bảo không có chuỗi kết nối PostgreSQL hay khóa bí mật cứng trong code.
2. **HTTP Security Headers:** Cấu hình đầy đủ trong `vercel.json` và API handlers:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
3. **Kiểm soát Truy cập (RBAC & SQL Injection Prevention):** Toàn bộ truy vấn SQL sử dụng Tagged Template Literals tham số hóa của `@neondatabase/serverless`.
