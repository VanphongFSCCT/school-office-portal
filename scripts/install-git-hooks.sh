#!/usr/bin/env sh
# =============================================================================
# CÀI ĐẶT GIT HOOKS BẢO VỆ NHÁNH MAIN & CHỐNG LỘ SECRET TRÊN MÁY TRẠM
# Giải pháp miễn phí bù đắp giới hạn Branch Protection trên Private Repo của GitHub Free
# =============================================================================
set -e
HOOKS_DIR=".git/hooks"
if [ ! -d "$HOOKS_DIR" ]; then
  echo "[THÔNG BÁO] Thư mục .git/hooks chưa tồn tại. Hãy chạy lệnh này bên trong thư mục Git repository."
  exit 0
fi

cat << 'HOOK_EOF' > "$HOOKS_DIR/pre-commit"
#!/usr/bin/env sh
echo "🔒 [FSC Pre-Commit Gate] Đang kiểm tra lộ khóa bí mật và cú pháp..."
if git diff --cached --name-only | grep -E '\.(sql|dump|backup|bak|enc|fscbak)$|^\.env|Backup.*\.json$'; then
  echo "❌ CHẶN COMMIT: Phát hiện file .env hoặc file sao lưu CSDL trong danh sách staged!"
  exit 1
fi
node tests/automated_qa_and_security_scan.js
HOOK_EOF

cat << 'HOOK_EOF' > "$HOOKS_DIR/pre-push"
#!/usr/bin/env sh
current_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
  if [ "$ALLOW_DIRECT_MAIN_PUSH" != "true" ]; then
    echo "⛔ [CHẶN PUSH THẲNG LÊN MAIN]: Để bảo vệ Production, vui lòng đẩy lên nhánh riêng (VD: git checkout -b feat/cap-nhat) và tạo Pull Request!"
    echo "   (Nếu đã kiểm tra Preview và được phê duyệt hợp nhất, chạy: ALLOW_DIRECT_MAIN_PUSH=true git push origin main)"
    exit 1
  fi
fi
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-push"
echo "✅ Đã cài đặt thành công Git Hooks (pre-commit & pre-push) bảo vệ nhánh main!"
