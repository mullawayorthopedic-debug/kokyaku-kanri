-- 次回予約未定リスト

CREATE TABLE IF NOT EXISTS cm_pending_next_visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES cm_patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL DEFAULT '',
  last_visit_date DATE,
  planned_date_text TEXT DEFAULT '',
  category TEXT DEFAULT '' CHECK (category IN ('', '整体', 'ダイエット')),
  ticket_type TEXT DEFAULT '' CHECK (ticket_type IN ('', '回数券', '都度')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cm_pending_next_visits_clinic ON cm_pending_next_visits(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cm_pending_next_visits_patient ON cm_pending_next_visits(patient_id);

ALTER TABLE cm_pending_next_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_data_isolation" ON cm_pending_next_visits;
CREATE POLICY "clinic_data_isolation" ON cm_pending_next_visits
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS cm_pending_next_visits_updated_at ON cm_pending_next_visits;
CREATE TRIGGER cm_pending_next_visits_updated_at
  BEFORE UPDATE ON cm_pending_next_visits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
