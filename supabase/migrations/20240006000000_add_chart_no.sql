-- cm_patientsに元の顧客管理ソフトのカルテ番号を追加
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS chart_no integer;
CREATE INDEX IF NOT EXISTS idx_cm_patients_chart_no ON cm_patients(chart_no);
