export interface Patient {
  id: string
  name: string
  furigana: string
  birth_date: string | null
  gender: '男性' | '女性' | 'その他'
  phone: string
  email: string
  zipcode: string
  prefecture: string
  city: string
  address: string
  building: string
  occupation: string
  referral_source: string
  visit_motive: string
  customer_category: string
  chief_complaint: string
  medical_history: string
  notes: string
  status: 'active' | 'inactive' | 'completed'
  status_date: string | null
  status_reason: string
  is_enabled: boolean
  is_direct_mail: boolean
  first_visit_date: string | null
  last_visit_date: string | null
  visit_count: number
  ltv: number
  days_since_last_visit: number | null
  line_date: string | null
  line_count: number
  chart_no: number | null
  created_at: string
  updated_at: string
}

export interface VisitRecord {
  id: string
  patient_id: string
  visit_date: string
  visit_number: number
  symptoms: string
  treatment_content: string
  body_condition: string
  improvement: string
  atmosphere: '良好' | '普通' | 'やや悪い' | '悪い'
  next_plan: string
  next_appointment: string | null
  payment_amount: number
  payment_method: '現金' | 'カード' | 'QR決済' | 'PayPay' | '回数券' | 'その他'
  notes: string
  created_at: string
  patient?: Patient
}

export const REFERRAL_SOURCES = [
  'HP', 'Google検索', 'Googleマップ', 'Instagram', 'YouTube', 'Facebook', 'TikTok', 'SEO',
  '紹介', '折込', 'チラシ（ポスティング）', '通りがかり', 'LINE',
  'エキテン', 'イーパーク', 'HPB', 'その他'
] as const

export const PAYMENT_METHODS = [
  '現金', 'カード', 'QR決済', 'PayPay', '回数券', 'その他'
] as const

export interface Reservation {
  id: string
  patient_id: string | null
  patient_name: string
  staff_id: string | null
  reservation_date: string
  start_time: string
  end_time: string
  menu_name: string
  menu_price: number
  status: 'reserved' | 'visited' | 'cancelled' | 'no_show'
  notes: string
  created_at: string
  updated_at: string
  patient?: Patient
}

export interface Slip {
  id: string
  patient_id: string | null
  patient_name: string
  visit_date: string
  staff_id: string | null
  staff_name: string
  menu_name: string
  base_price: number
  option_names: string
  option_price: number
  total_price: number
  payment_method: string
  discount: number
  tax: number
  duration_minutes: number
  notes: string
  created_at: string
}

export const RESERVATION_STATUSES = {
  reserved: '予約済み',
  visited: '来店',
  cancelled: 'キャンセル',
  no_show: '無断キャンセル',
} as const

export const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
] as const
