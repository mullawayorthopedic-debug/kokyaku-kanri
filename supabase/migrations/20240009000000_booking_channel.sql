-- Add booking_channel (予約媒体: LINE/電話/ホットペッパー) to patients
ALTER TABLE cm_patients ADD COLUMN IF NOT EXISTS booking_channel text;
