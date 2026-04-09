-- Add category (seitai/diet) to daily inquiries for distinguishing 整体 vs ダイエット
ALTER TABLE cm_daily_inquiries
  ADD COLUMN IF NOT EXISTS category text;

-- Replace unique constraint to include category (NULLS NOT DISTINCT so legacy NULL rows still unique per channel/day)
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'cm_daily_inquiries'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE cm_daily_inquiries DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE cm_daily_inquiries
  ADD CONSTRAINT cm_daily_inquiries_unique
  UNIQUE NULLS NOT DISTINCT (clinic_id, date, channel, category);
