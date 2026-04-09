-- ============================================
-- v4: Stripe決済対応カラム追加
-- clinicsテーブルにStripe関連カラムを追加
-- ============================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- インデックス追加（検索高速化）
CREATE INDEX IF NOT EXISTS idx_clinics_stripe_customer ON clinics(stripe_customer_id);
