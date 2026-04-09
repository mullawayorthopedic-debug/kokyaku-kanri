-- ============================================
-- 不足テーブルの作成（v3マイグレーション前提）
-- ============================================

-- cm_base_menus: 基本メニュー
CREATE TABLE IF NOT EXISTS cm_base_menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER DEFAULT 60,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_base_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_base_menusを操作可能" ON cm_base_menus FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_base_menus_updated_at BEFORE UPDATE ON cm_base_menus FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_option_menus: オプションメニュー
CREATE TABLE IF NOT EXISTS cm_option_menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_option_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_option_menusを操作可能" ON cm_option_menus FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_option_menus_updated_at BEFORE UPDATE ON cm_option_menus FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_facility_info: 施設情報
CREATE TABLE IF NOT EXISTS cm_facility_info (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_name TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  business_hours TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_facility_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_facility_infoを操作可能" ON cm_facility_info FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_facility_info_updated_at BEFORE UPDATE ON cm_facility_info FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_ad_costs: 広告費
CREATE TABLE IF NOT EXISTS cm_ad_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,
  channel TEXT DEFAULT '',
  cost INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  inquiries INTEGER DEFAULT 0,
  new_patients INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_ad_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_ad_costsを操作可能" ON cm_ad_costs FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_ad_costs_updated_at BEFORE UPDATE ON cm_ad_costs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_ad_channels: 広告チャネルマスタ
CREATE TABLE IF NOT EXISTS cm_ad_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_ad_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_ad_channelsを操作可能" ON cm_ad_channels FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_ad_channels_updated_at BEFORE UPDATE ON cm_ad_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_staff: スタッフ
CREATE TABLE IF NOT EXISTS cm_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'staff',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  color TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_staffを操作可能" ON cm_staff FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_staff_updated_at BEFORE UPDATE ON cm_staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_symptoms: 症状マスタ
CREATE TABLE IF NOT EXISTS cm_symptoms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_symptoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_symptomsを操作可能" ON cm_symptoms FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_symptoms_updated_at BEFORE UPDATE ON cm_symptoms FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_visit_motives: 来院動機マスタ
CREATE TABLE IF NOT EXISTS cm_visit_motives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_visit_motives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_visit_motivesを操作可能" ON cm_visit_motives FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_visit_motives_updated_at BEFORE UPDATE ON cm_visit_motives FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_menu_categories: メニューカテゴリマスタ
CREATE TABLE IF NOT EXISTS cm_menu_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_menu_categoriesを操作可能" ON cm_menu_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_menu_categories_updated_at BEFORE UPDATE ON cm_menu_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_occupations: 職業マスタ
CREATE TABLE IF NOT EXISTS cm_occupations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_occupations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_occupationsを操作可能" ON cm_occupations FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_occupations_updated_at BEFORE UPDATE ON cm_occupations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_customer_categories: 顧客区分マスタ
CREATE TABLE IF NOT EXISTS cm_customer_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_customer_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_customer_categoriesを操作可能" ON cm_customer_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_customer_categories_updated_at BEFORE UPDATE ON cm_customer_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_display_columns: 表示カラム設定
CREATE TABLE IF NOT EXISTS cm_display_columns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  column_key TEXT NOT NULL,
  column_label TEXT DEFAULT '',
  is_visible BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_display_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_display_columnsを操作可能" ON cm_display_columns FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_display_columns_updated_at BEFORE UPDATE ON cm_display_columns FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_regular_holidays: 定休日設定
CREATE TABLE IF NOT EXISTS cm_regular_holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week INTEGER NOT NULL,
  is_holiday BOOLEAN DEFAULT true,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_regular_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_regular_holidaysを操作可能" ON cm_regular_holidays FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_regular_holidays_updated_at BEFORE UPDATE ON cm_regular_holidays FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- cm_irregular_holidays: 不定休日
CREATE TABLE IF NOT EXISTS cm_irregular_holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cm_irregular_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはcm_irregular_holidaysを操作可能" ON cm_irregular_holidays FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER cm_irregular_holidays_updated_at BEFORE UPDATE ON cm_irregular_holidays FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- rv_reservations: 予約（RVアプリ用）
CREATE TABLE IF NOT EXISTS rv_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_name TEXT DEFAULT '',
  staff_id UUID,
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  menu_name TEXT DEFAULT '',
  menu_price INTEGER DEFAULT 0,
  status TEXT DEFAULT '予約済み',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rv_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはrv_reservationsを操作可能" ON rv_reservations FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER rv_reservations_updated_at BEFORE UPDATE ON rv_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- rv_menus: 予約メニュー
CREATE TABLE IF NOT EXISTS rv_menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  duration_minutes INTEGER DEFAULT 60,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rv_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはrv_menusを操作可能" ON rv_menus FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER rv_menus_updated_at BEFORE UPDATE ON rv_menus FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- rv_settings: 予約設定
CREATE TABLE IF NOT EXISTS rv_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rv_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはrv_settingsを操作可能" ON rv_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER rv_settings_updated_at BEFORE UPDATE ON rv_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ms_submissions: フォーム送信
CREATE TABLE IF NOT EXISTS ms_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id TEXT DEFAULT '',
  submitted_data JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ms_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "認証ユーザーはms_submissionsを操作可能" ON ms_submissions FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER ms_submissions_updated_at BEFORE UPDATE ON ms_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
