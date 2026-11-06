# School Office Portal - Luxury Navy & Gold Enterprise Dashboard

Hệ thống quản lý và tra cứu Quy trình Vận hành Chuẩn (SOP), Hướng dẫn công việc (WI) và Biểu mẫu hành chính văn phòng theo phong cách quản trị doanh nghiệp cao cấp (Luxury Navy & Gold).

- **Frontend**: Single Page Dashboard responsive, Vanilla JS, Tailwind CSS, SVG Vector.
- **Backend**: Vercel Serverless Functions (`/api/documents.js`).
- **Database**: Neon Serverless PostgreSQL (`/db/schema.sql`).
- **Tác giả**: DatBT13.

---

## Cấu trúc thư mục

```
school-office-portal/
├── public/
│   └── index.html         # Giao diện chính hoàn chỉnh
├── api/
│   └── documents.js       # Vercel Serverless Function kết nối Neon
├── db/
│   └── schema.sql         # Khởi tạo bảng và dữ liệu mẫu PostgreSQL
├── vercel.json            # Cấu hình routing cho Vercel
├── package.json           # Dependencies và scripts
├── .env.example           # Mẫu biến môi trường DATABASE_URL
├── .gitignore             # Danh sách loại trừ khi đẩy lên Git
└── README.md              # Hướng dẫn chi tiết
```
