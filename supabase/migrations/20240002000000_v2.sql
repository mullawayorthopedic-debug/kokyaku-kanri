-- ============================================
-- 顧客管理シート v2 マイグレーション
-- css-opal参考サイトの機能を追加
-- ============================================

-- 1. 患者テーブルに新フィールド追加
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS zipcode TEXT DEFAULT '';
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS prefecture TEXT DEFAULT '';
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS building TEXT DEFAULT '';
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS is_direct_mail BOOLEAN DEFAULT true;
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS customer_category TEXT DEFAULT '';
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS visit_motive TEXT DEFAULT '';

-- 2. 予約テーブル
CREATE TABLE IF NOT EXISTS cm_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES cm_patients(id) ON DELETE SET NULL,
  patient_name TEXT DEFAULT '',
  staff_id UUID,
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  menu_name TEXT DEFAULT '',
  menu_price INTEGER DEFAULT 0,
  status TEXT DEFAULT '予約済み' CHECK (status IN ('予約済み', '来店', 'キャンセル', '無断キャンセル')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 予約インデックス
CREATE INDEX IF NOT EXISTS idx_cm_reservations_date ON cm_reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_cm_reservations_patient ON cm_reservations(patient_id);
CREATE INDEX IF NOT EXISTS idx_cm_reservations_staff ON cm_reservations(staff_id);

-- RLS
ALTER TABLE cm_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "認証ユーザーは予約を操作可能" ON cm_reservations;
CREATE POLICY "認証ユーザーは予約を操作可能" ON cm_reservations FOR ALL USING (auth.role() = 'authenticated');

-- 予約テーブルのupdated_atトリガー
DROP TRIGGER IF EXISTS cm_reservations_updated_at ON cm_reservations;
CREATE TRIGGER cm_reservations_updated_at
  BEFORE UPDATE ON cm_reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 3. 伝票テーブル（売上伝票）
CREATE TABLE IF NOT EXISTS cm_slips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES cm_patients(id) ON DELETE SET NULL,
  patient_name TEXT DEFAULT '',
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  staff_id UUID,
  staff_name TEXT DEFAULT '',
  menu_name TEXT DEFAULT '',
  base_price INTEGER DEFAULT 0,
  option_names TEXT DEFAULT '',
  option_price INTEGER DEFAULT 0,
  total_price INTEGER DEFAULT 0,
  payment_method TEXT DEFAULT '現金',
  discount INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  duration_minutes INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cm_slips_date ON cm_slips(visit_date);
CREATE INDEX IF NOT EXISTS idx_cm_slips_patient ON cm_slips(patient_id);

ALTER TABLE cm_slips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "認証ユーザーは伝票を操作可能" ON cm_slips;
CREATE POLICY "認証ユーザーは伝票を操作可能" ON cm_slips FOR ALL USING (auth.role() = 'authenticated');
