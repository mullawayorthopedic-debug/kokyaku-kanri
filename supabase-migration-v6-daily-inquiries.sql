-- Migration v6: cm_daily_inquiries table for daily inquiry/conversion tracking
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS cm_daily_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date date NOT NULL,
  channel text NOT NULL,
  inquiries integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(clinic_id, date, channel)
);

-- Index for fast monthly queries
CREATE INDEX IF NOT EXISTS cm_daily_inquiries_clinic_date
  ON cm_daily_inquiries(clinic_id, date);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cm_daily_inquiries_updated_at
  BEFORE UPDATE ON cm_daily_inquiries
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Enable RLS
ALTER TABLE cm_daily_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_inquiries_select" ON cm_daily_inquiries
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

CREATE POLICY "daily_inquiries_insert" ON cm_daily_inquiries
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

CREATE POLICY "daily_inquiries_update" ON cm_daily_inquiries
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );

CREATE POLICY "daily_inquiries_delete" ON cm_daily_inquiries
  FOR DELETE USING (
    clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
  );
