-- Create cm_daily_inquiries table (daily inquiry/reservation tracking per channel)
CREATE TABLE IF NOT EXISTS cm_daily_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  date date NOT NULL,
  channel text NOT NULL DEFAULT '',
  category text,
  inquiries integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT cm_daily_inquiries_unique UNIQUE NULLS NOT DISTINCT (clinic_id, date, channel, category)
);

-- RLS
ALTER TABLE cm_daily_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_daily_inquiries_clinic" ON cm_daily_inquiries
  USING (clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid()));
