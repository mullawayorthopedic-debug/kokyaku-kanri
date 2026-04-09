-- ============================================
-- v5: RLSポリシー強化 - clinic_idによるデータ分離
-- ============================================
-- 全cm_*テーブルに対して、ログインユーザーが所属する院のデータのみ
-- 参照・操作可能にするRLSポリシーを設定する。
-- ============================================

-- ============================================
-- 1. clinic_members テーブル
-- ============================================
DROP POLICY IF EXISTS "認証ユーザーはclinic_membersを操作可能" ON clinic_members;

-- 自分のメンバーシップのみ参照可能
CREATE POLICY "own_memberships_select" ON clinic_members
  FOR SELECT USING (user_id = auth.uid());

-- INSERTは認証済みユーザーなら可能（サインアップ時に自分のレコードを作成）
CREATE POLICY "own_memberships_insert" ON clinic_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================
-- 2. clinics テーブル
-- ============================================
DROP POLICY IF EXISTS "認証ユーザーはclinicsを参照可能" ON clinics;
DROP POLICY IF EXISTS "認証ユーザーはclinicsを操作可能" ON clinics;

-- 自分が所属する院のみ参照可能
CREATE POLICY "member_clinics_select" ON clinics
  FOR SELECT USING (
    id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- INSERTは認証済みユーザーなら可能（サインアップ時に新規院作成）
CREATE POLICY "member_clinics_insert" ON clinics
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATEは所属する院のみ
CREATE POLICY "member_clinics_update" ON clinics
  FOR UPDATE USING (
    id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 3. cm_patients テーブル
-- ============================================
DROP POLICY IF EXISTS "認証ユーザーは患者を操作可能" ON cm_patients;

CREATE POLICY "clinic_data_isolation" ON cm_patients
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 4. cm_slips テーブル
-- ============================================
DROP POLICY IF EXISTS "認証ユーザーは伝票を操作可能" ON cm_slips;

CREATE POLICY "clinic_data_isolation" ON cm_slips
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 5. cm_reservations テーブル
-- ============================================
DROP POLICY IF EXISTS "認証ユーザーは予約を操作可能" ON cm_reservations;

CREATE POLICY "clinic_data_isolation" ON cm_reservations
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 6. cm_base_menus テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_base_menus') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_base_menusを操作可能" ON cm_base_menus;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_base_menus
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 7. cm_option_menus テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_option_menus') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_option_menusを操作可能" ON cm_option_menus;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_option_menus
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 8. cm_facility_info テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_facility_info') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_facility_infoを操作可能" ON cm_facility_info;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_facility_info
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 9. cm_ad_costs テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_ad_costs') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_ad_costsを操作可能" ON cm_ad_costs;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_ad_costs
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 10. cm_ad_channels テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_ad_channels') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_ad_channelsを操作可能" ON cm_ad_channels;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_ad_channels
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 11. cm_staff テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_staff') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_staffを操作可能" ON cm_staff;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_staff
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 12. cm_symptoms テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_symptoms') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_symptomsを操作可能" ON cm_symptoms;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_symptoms
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 13. cm_visit_motives テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_visit_motives') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_visit_motivesを操作可能" ON cm_visit_motives;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_visit_motives
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 14. cm_menu_categories テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_menu_categories') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_menu_categoriesを操作可能" ON cm_menu_categories;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_menu_categories
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 15. cm_occupations テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_occupations') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_occupationsを操作可能" ON cm_occupations;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_occupations
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 16. cm_customer_categories テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_customer_categories') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_customer_categoriesを操作可能" ON cm_customer_categories;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_customer_categories
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 17. cm_display_columns テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_display_columns') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_display_columnsを操作可能" ON cm_display_columns;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_display_columns
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 18. cm_regular_holidays テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_regular_holidays') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_regular_holidaysを操作可能" ON cm_regular_holidays;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_regular_holidays
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

-- ============================================
-- 19. cm_irregular_holidays テーブル
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cm_irregular_holidays') THEN
    DROP POLICY IF EXISTS "認証ユーザーはcm_irregular_holidaysを操作可能" ON cm_irregular_holidays;
  END IF;
END $$;

CREATE POLICY "clinic_data_isolation" ON cm_irregular_holidays
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );
