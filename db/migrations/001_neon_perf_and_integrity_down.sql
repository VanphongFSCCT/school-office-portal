-- =============================================================================
-- ROLLBACK AN TOÀN (NON-DESTRUCTIVE ROLLBACK): 001_neon_perf_and_integrity_down.sql
-- Mục tiêu: Hoàn tác các chỉ mục mới mà không làm mất bất kỳ bản ghi nào
-- =============================================================================
BEGIN;

DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS uq_users_email_hash;
DROP INDEX IF EXISTS idx_documents_cat_updated;
DROP INDEX IF EXISTS uq_documents_lower_code;

COMMIT;
