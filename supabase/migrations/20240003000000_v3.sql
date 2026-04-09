-- ============================================
-- A案: マルチテナント化マイグレーション
-- 全3アプリ共有のclinicsテーブルを作成し、
-- 全テーブルにclinic_idを追加
-- ============================================

-- =====================
-- 1. clinicsテーブル作成
-- =====================
CREATE TABLE IF NOT EXISTS clinics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,          -- URL用の短縮コード (例: hare-shinkyu)
  owner_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはclinicsを参照可能" ON clinics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "認証ユーザーはclinicsを操作可能" ON clinics FOR ALL USING (auth.role() = 'authenticated');

-- updated_atトリガー
CREATE TRIGGER clinics_updated_at
  BEFORE UPDATE ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================
-- 2. デフォルト院を登録
-- =====================
INSERT INTO clinics (id, name, code, owner_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '晴れ鍼灸院・整骨院',
  'hare-shinkyu',
  '大口陽平'
) ON CONFLICT (code) DO NOTHING;

-- =====================
-- 3. cm_ テーブルにclinic_id追加
-- =====================

-- cm_patients
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_patients SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_patients_clinic ON cm_patients(clinic_id);

-- cm_slips
ALTER TABLE cm_slips ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_slips SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_slips_clinic ON cm_slips(clinic_id);

-- cm_reservations
ALTER TABLE cm_reservations ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_reservations SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_reservations_clinic ON cm_reservations(clinic_id);

-- cm_base_menus
ALTER TABLE cm_base_menus ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_base_menus SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_base_menus_clinic ON cm_base_menus(clinic_id);

-- cm_option_menus
ALTER TABLE cm_option_menus ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_option_menus SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_option_menus_clinic ON cm_option_menus(clinic_id);

-- cm_facility_info
ALTER TABLE cm_facility_info ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_facility_info SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_facility_info_clinic ON cm_facility_info(clinic_id);

-- cm_ad_costs
ALTER TABLE cm_ad_costs ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_ad_costs SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_ad_costs_clinic ON cm_ad_costs(clinic_id);

-- cm_ad_channels
ALTER TABLE cm_ad_channels ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_ad_channels SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_ad_channels_clinic ON cm_ad_channels(clinic_id);

-- cm_staff
ALTER TABLE cm_staff ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_staff SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_staff_clinic ON cm_staff(clinic_id);

-- cm_symptoms
ALTER TABLE cm_symptoms ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_symptoms SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_symptoms_clinic ON cm_symptoms(clinic_id);

-- cm_visit_motives
ALTER TABLE cm_visit_motives ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_visit_motives SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_visit_motives_clinic ON cm_visit_motives(clinic_id);

-- cm_menu_categories
ALTER TABLE cm_menu_categories ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_menu_categories SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- cm_occupations
ALTER TABLE cm_occupations ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_occupations SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- cm_customer_categories
ALTER TABLE cm_customer_categories ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_customer_categories SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- cm_display_columns
ALTER TABLE cm_display_columns ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_display_columns SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- cm_regular_holidays
ALTER TABLE cm_regular_holidays ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_regular_holidays SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- cm_irregular_holidays
ALTER TABLE cm_irregular_holidays ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE cm_irregular_holidays SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

-- =====================
-- 4. rv_ テーブルにclinic_id追加
-- =====================

-- rv_reservations
ALTER TABLE rv_reservations ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE rv_reservations ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES cm_patients(id) ON DELETE SET NULL;
UPDATE rv_reservations SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_rv_reservations_clinic ON rv_reservations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_rv_reservations_patient ON rv_reservations(patient_id);

-- rv_menus
ALTER TABLE rv_menus ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE rv_menus SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_rv_menus_clinic ON rv_menus(clinic_id);

-- rv_settings
ALTER TABLE rv_settings ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE rv_settings SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_rv_settings_clinic ON rv_settings(clinic_id);

-- =====================
-- 5. ms_ テーブルにclinic_id追加
-- =====================

-- ms_submissions
ALTER TABLE ms_submissions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE ms_submissions ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES cm_patients(id) ON DELETE SET NULL;
UPDATE ms_submissions SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ms_submissions_clinic ON ms_submissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_ms_submissions_patient ON ms_submissions(patient_id);

-- =====================
-- 6. clinic_membersテーブル（将来のユーザー管理用）
-- =====================
CREATE TABLE IF NOT EXISTS clinic_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, user_id)
);

ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはclinic_membersを操作可能" ON clinic_members FOR ALL USING (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_clinic_members_clinic ON clinic_members(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_members_user ON clinic_members(user_id);
