-- 卒業/離脱の日付・理由を記録するフィールド追加
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS status_date DATE;
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS status_reason TEXT DEFAULT '';
