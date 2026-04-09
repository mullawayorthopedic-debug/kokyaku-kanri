-- 顧客管理シート DBセットアップ

-- 患者テーブル
CREATE TABLE IF NOT EXISTS cm_patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  furigana TEXT DEFAULT '',
  birth_date DATE,
  gender TEXT DEFAULT '男性',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  occupation TEXT DEFAULT '',
  referral_source TEXT DEFAULT '',
  chief_complaint TEXT DEFAULT '',
  medical_history TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 施術記録テーブル
CREATE TABLE IF NOT EXISTS cm_visit_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES cm_patients(id) ON DELETE CASCADE NOT NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_number INTEGER DEFAULT 1,
  symptoms TEXT DEFAULT '',
  treatment_content TEXT DEFAULT '',
  body_condition TEXT DEFAULT '',
  improvement TEXT DEFAULT '',
  atmosphere TEXT DEFAULT '普通' CHECK (atmosphere IN ('良好', '普通', 'やや悪い', '悪い')),
  next_plan TEXT DEFAULT '',
  next_appointment DATE,
  payment_amount INTEGER DEFAULT 0,
  payment_method TEXT DEFAULT '現金' CHECK (payment_method IN ('現金', 'カード', 'QR決済', '回数券', 'その他')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cm_patients_status ON cm_patients(status);
CREATE INDEX IF NOT EXISTS idx_cm_patients_name ON cm_patients(name);
CREATE INDEX IF NOT EXISTS idx_cm_visit_records_patient ON cm_visit_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_cm_visit_records_date ON cm_visit_records(visit_date);
CREATE INDEX IF NOT EXISTS idx_cm_visit_records_next ON cm_visit_records(next_appointment);

-- RLS有効化
ALTER TABLE cm_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_visit_records ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（認証ユーザーは全データアクセス可能）
DROP POLICY IF EXISTS "認証ユーザーは患者を操作可能" ON cm_patients;
CREATE POLICY "認証ユーザーは患者を操作可能" ON cm_patients FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "認証ユーザーは施術記録を操作可能" ON cm_visit_records;
CREATE POLICY "認証ユーザーは施術記録を操作可能" ON cm_visit_records FOR ALL USING (auth.role() = 'authenticated');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cm_patients_updated_at ON cm_patients;
CREATE TRIGGER cm_patients_updated_at
  BEFORE UPDATE ON cm_patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
