import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CLINIC_ID = 'b0016b6d-6ed7-4614-a6a5-20cb9f6d78cc'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// 1000件制限を回避して全件取得
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(supabase: any, table: string, select: string, filters: Record<string, string>) {
  const PAGE_SIZE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    let query = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1)
    for (const [key, val] of Object.entries(filters)) {
      const [col, op] = key.split(':')
      if (op === 'gte') query = query.gte(col, val)
      else if (op === 'lte') query = query.lte(col, val)
      else query = query.eq(col, val)
    }
    const { data, error } = await query
    if (error || !data) break
    all = all.concat(data)
    hasMore = data.length === PAGE_SIZE
    offset += PAGE_SIZE
  }
  return all
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const clinicId = searchParams.get('clinic_id') || DEFAULT_CLINIC_ID

    if (!year || !month) {
      return NextResponse.json({ error: 'year, month are required' }, { status: 400, headers: CORS_HEADERS })
    }

    const supabase = adminClient()
    const ym = `${year}-${String(Number(month)).padStart(2, '0')}`
    const startDate = `${ym}-01`
    const endDate = `${ym}-31`

    // 全伝票を取得（初回来院月の判定に全期間必要）
    const allSlips = await fetchAll(supabase, 'cm_slips', 'patient_id, visit_date, total_price, menu_name', {
      'clinic_id': clinicId,
    })

    // 患者データ（customer_category含む）
    const allPatients = await fetchAll(supabase, 'cm_patients', 'id, customer_category, referral_source, first_visit_date, visit_count, status', {
      'clinic_id': clinicId,
    })

    const patientCategoryMap: Record<string, string> = {}
    const patientRefMap: Record<string, string> = {}
    allPatients.forEach((p: { id: string; customer_category: string; referral_source: string }) => {
      patientCategoryMap[p.id] = p.customer_category || ''
      patientRefMap[p.id] = p.referral_source || ''
    })

    // 各患者の初回来院月を伝票から算出
    const firstVisitMonth: Record<string, string> = {}
    allSlips.forEach((s: { patient_id: string; visit_date: string }) => {
      if (!s.patient_id) return
      const m = s.visit_date.slice(0, 7)
      if (!firstVisitMonth[s.patient_id] || m < firstVisitMonth[s.patient_id]) {
        firstVisitMonth[s.patient_id] = m
      }
    })

    // 当月の伝票をフィルタ
    const monthSlips = allSlips.filter((s: { visit_date: string }) =>
      s.visit_date >= startDate && s.visit_date <= endDate
    )

    // 集計
    let totalRevenue = 0
    let seitaiRevNew = 0, seitaiRevExist = 0
    let dietRevNew = 0, dietRevExist = 0
    const newPids = new Set<string>()
    const existPids = new Set<string>()
    const newSeitaiPids = new Set<string>()
    const newDietPids = new Set<string>()
    const uniquePids = new Set<string>()

    monthSlips.forEach((s: { patient_id: string; total_price: number; visit_date: string }) => {
      const amount = s.total_price || 0
      totalRevenue += amount
      if (s.patient_id) uniquePids.add(s.patient_id)

      const category = patientCategoryMap[s.patient_id] || ''
      const isNew = s.patient_id && firstVisitMonth[s.patient_id] === ym

      if (isNew) {
        newPids.add(s.patient_id)
        if (category === '整体') { seitaiRevNew += amount; newSeitaiPids.add(s.patient_id) }
        else if (category === 'ダイエット') { dietRevNew += amount; newDietPids.add(s.patient_id) }
        else { seitaiRevNew += amount } // カテゴリ未設定は整体扱い
      } else {
        if (s.patient_id) existPids.add(s.patient_id)
        if (category === 'ダイエット') { dietRevExist += amount }
        else { seitaiRevExist += amount }
      }
    })

    const seitaiRevenue = seitaiRevNew + seitaiRevExist
    const dietRevenue = dietRevNew + dietRevExist
    const totalVisits = monthSlips.length
    const normalSlips = monthSlips.filter((s: { total_price: number }) => (s.total_price || 0) > 0 && (s.total_price || 0) < 50000)
    const normalRevenue = normalSlips.reduce((sum: number, s: { total_price: number }) => sum + (s.total_price || 0), 0)
    const avgPrice = normalSlips.length > 0 ? Math.round(normalRevenue / normalSlips.length) : 0

    // 新規患者の経路分析
    const newPatientIds = Array.from(newPids)
    const adNew = newPatientIds.filter(pid => {
      const src = patientRefMap[pid] || ''
      return src.includes('PPC') || src.includes('インスタ') || src.includes('HPB') || src.includes('MEO')
    }).length
    const referralNew = newPatientIds.filter(pid => (patientRefMap[pid] || '').includes('紹介')).length

    // リピート率
    const activePatients = allPatients.filter((p: { status: string }) => p.status === 'active')
    const repeatCount = activePatients.filter((p: { visit_count: number }) => (p.visit_count || 0) >= 2).length
    const repeatRate = activePatients.length > 0 ? Math.round((repeatCount / activePatients.length) * 100) : 0

    // 問い合わせデータ
    const { data: inquiryData } = await supabase
      .from('cm_daily_inquiries')
      .select('date, inquiries, conversions')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)

    const totalInquiries = (inquiryData || []).reduce((sum, r) => sum + (r.inquiries || 0), 0)

    const result = {
      total_revenue: totalRevenue,
      seitai_revenue: seitaiRevenue,
      seitai_revenue_new: seitaiRevNew,
      seitai_revenue_exist: seitaiRevExist,
      diet_revenue: dietRevenue,
      diet_revenue_new: dietRevNew,
      diet_revenue_exist: dietRevExist,
      avg_price: avgPrice,
      total_patients: uniquePids.size,
      total_visits: totalVisits,
      new_patients: newPids.size,
      new_seitai: newSeitaiPids.size,
      new_diet: newDietPids.size,
      existing_patients: existPids.size,
      new_from_ad: adNew,
      new_from_referral: referralNew,
      repeat_rate: repeatRate,
      inquiry_count: totalInquiries,
      diet_new: newDietPids.size,
    }

    return NextResponse.json(result, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}
