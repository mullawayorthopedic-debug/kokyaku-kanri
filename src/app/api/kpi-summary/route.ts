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
    const allSlips = await fetchAll(supabase, 'cm_slips', 'patient_id, visit_date, total_price', {
      'clinic_id': clinicId,
    })

    // 患者データ（直接取得、エラーログ付き）
    const { data: allPatientsData, error: patientError } = await supabase
      .from('cm_patients')
      .select('id, customer_category, referral_source, status')
      .eq('clinic_id', clinicId)

    if (patientError) {
      return NextResponse.json({ error: 'Patient query failed', detail: patientError.message }, { status: 500, headers: CORS_HEADERS })
    }
    const allPatients = allPatientsData || []

    const patientCategoryMap: Record<string, string> = {}
    const patientRefMap: Record<string, string> = {}
    allPatients.forEach((p: { id: string; customer_category: string; referral_source: string }) => {
      patientCategoryMap[p.id] = p.customer_category || ''
      patientRefMap[p.id] = p.referral_source || ''
    })

    // 各患者の初回来院月を伝票から算出（月次レポートと同じロジック）
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

    // 集計（月次レポートと同じロジック）
    let totalRevenue = 0, newRevenue = 0
    let existRevSeitai = 0, existRevDiet = 0
    const uniquePids = new Set<string>()
    const newPids = new Set<string>()
    const newSeitaiPids = new Set<string>()
    const newDietPids = new Set<string>()

    monthSlips.forEach((s: { patient_id: string; total_price: number }) => {
      const amount = s.total_price || 0
      totalRevenue += amount
      if (s.patient_id) uniquePids.add(s.patient_id)

      const ptype = patientCategoryMap[s.patient_id] || ''

      if (s.patient_id && firstVisitMonth[s.patient_id] === ym) {
        // 新規
        newPids.add(s.patient_id)
        newRevenue += amount
        if (ptype === '整体') newSeitaiPids.add(s.patient_id)
        if (ptype === 'ダイエット') newDietPids.add(s.patient_id)
      } else {
        // 既存
        if (ptype === 'ダイエット') { existRevDiet += amount }
        else { existRevSeitai += amount }
      }
    })

    const existRevenue = totalRevenue - newRevenue
    const totalVisits = monthSlips.length
    const frequency = uniquePids.size > 0 ? parseFloat((totalVisits / uniquePids.size).toFixed(1)) : 0

    // 平均客単価（通常施術: 0円超・50,000円未満）
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

    // 新規LTV
    const newLtv = newPids.size > 0 ? Math.round(newRevenue / newPids.size) : 0

    // リピート率（新規患者のうち2回以上来院した比率）
    // 当月の新規患者ごとの当月来院回数を集計
    const newPidVisitCount: Record<string, number> = {}
    monthSlips.forEach((s: { patient_id: string }) => {
      if (s.patient_id && newPids.has(s.patient_id)) {
        newPidVisitCount[s.patient_id] = (newPidVisitCount[s.patient_id] || 0) + 1
      }
    })
    const newRepeatCount = Object.values(newPidVisitCount).filter(c => c >= 2).length
    const repeatRate = newPids.size > 0 ? Math.round((newRepeatCount / newPids.size) * 100) : 0

    // 全患者の来院回数（整体/ダイエット別リピート率用）
    const visitCountByPatient: Record<string, number> = {}
    allSlips.forEach((s: { patient_id: string }) => {
      if (s.patient_id) visitCountByPatient[s.patient_id] = (visitCountByPatient[s.patient_id] || 0) + 1
    })
    const activePatients = allPatients.filter((p: { status: string }) => p.status === 'active')

    // 広告費
    const { data: adCosts } = await supabase
      .from('cm_ad_costs')
      .select('cost, channel')
      .eq('clinic_id', clinicId)
      .gte('month', ym)
      .lte('month', ym)

    const adSpend = (adCosts || []).reduce((sum: number, r: { cost: number }) => sum + (r.cost || 0), 0)
    const adSpendMeta = (adCosts || []).filter((r: { channel: string }) => (r.channel || '').includes('Meta') || (r.channel || '').includes('meta') || (r.channel || '').includes('Facebook')).reduce((sum: number, r: { cost: number }) => sum + (r.cost || 0), 0)
    const adSpendPpc = (adCosts || []).filter((r: { channel: string }) => (r.channel || '').includes('PPC') || (r.channel || '').includes('Google') || (r.channel || '').includes('ppc')).reduce((sum: number, r: { cost: number }) => sum + (r.cost || 0), 0)
    const cpa = newPids.size > 0 ? Math.round(adSpend / newPids.size) : 0

    // 問い合わせデータ
    const { data: inquiryData } = await supabase
      .from('cm_daily_inquiries')
      .select('inquiries, conversions')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)

    const totalInquiries = (inquiryData || []).reduce((sum: number, r: { inquiries: number }) => sum + (r.inquiries || 0), 0)

    // 整体/ダイエット別の新規売上
    let newRevSeitai = 0, newRevDiet = 0
    monthSlips.forEach((s: { patient_id: string; total_price: number }) => {
      if (s.patient_id && firstVisitMonth[s.patient_id] === ym) {
        const cat = patientCategoryMap[s.patient_id] || ''
        if (cat === 'ダイエット') newRevDiet += (s.total_price || 0)
        else newRevSeitai += (s.total_price || 0)
      }
    })

    // 整体/ダイエット別LTV
    const newLtvSeitai = newSeitaiPids.size > 0 ? Math.round(newRevSeitai / newSeitaiPids.size) : 0
    const newLtvDiet = newDietPids.size > 0 ? Math.round(newRevDiet / newDietPids.size) : 0

    // 整体/ダイエット別リピート率（新規ベース）
    const newSeitaiRepeat = Array.from(newSeitaiPids).filter(pid => (newPidVisitCount[pid] || 0) >= 2).length
    const newDietRepeat = Array.from(newDietPids).filter(pid => (newPidVisitCount[pid] || 0) >= 2).length
    const repeatRateSeitai = newSeitaiPids.size > 0 ? Math.round((newSeitaiRepeat / newSeitaiPids.size) * 100) : 0
    const repeatRateDiet = newDietPids.size > 0 ? Math.round((newDietRepeat / newDietPids.size) * 100) : 0

    // 整体/ダイエット別CPA (広告費は全体のみのため、新規比率で按分)
    const totalNew = newPids.size
    const cpaSeitai = newSeitaiPids.size > 0 && totalNew > 0 ? Math.round((adSpend * newSeitaiPids.size / totalNew) / newSeitaiPids.size) : 0
    const cpaDiet = newDietPids.size > 0 && totalNew > 0 ? Math.round((adSpend * newDietPids.size / totalNew) / newDietPids.size) : 0
    const profitLtvSeitai = newLtvSeitai - cpaSeitai
    const profitLtvDiet = newLtvDiet - cpaDiet

    // KGI用: 稼働日数（伝票がある日数）
    const workDays = new Set(monthSlips.map((s: { visit_date: string }) => s.visit_date)).size
    // KGI用: 整体/ダイエット別カルテ枚数
    const seitaiPids = new Set<string>()
    const dietPids = new Set<string>()
    monthSlips.forEach((s: { patient_id: string }) => {
      const cat = patientCategoryMap[s.patient_id] || ''
      if (cat === 'ダイエット') dietPids.add(s.patient_id)
      else seitaiPids.add(s.patient_id)
    })
    // KGI用: 稼働率（1日9時間=9枠として計算、稼働日×9枠中の施術回数）
    const maxSlots = workDays * 9
    const utilization = maxSlots > 0 ? Math.round((totalVisits / maxSlots) * 100) : 0

    const result = {
      total_revenue: totalRevenue,
      new_revenue: newRevenue,
      exist_revenue: existRevenue,
      exist_revenue_seitai: existRevSeitai,
      exist_revenue_diet: existRevDiet,
      avg_price: avgPrice,
      total_patients: uniquePids.size,
      total_visits: totalVisits,
      frequency: frequency,
      new_patients: newPids.size,
      new_seitai: newSeitaiPids.size,
      new_diet: newDietPids.size,
      existing_patients: uniquePids.size - newPids.size,
      new_from_ad: adNew,
      new_from_referral: referralNew,
      repeat_rate: repeatRate,
      repeat_rate_seitai: repeatRateSeitai,
      repeat_rate_diet: repeatRateDiet,
      inquiry_count: totalInquiries,
      new_ltv: newLtv,
      new_ltv_seitai: newLtvSeitai,
      new_ltv_diet: newLtvDiet,
      ad_spend: adSpend,
      ad_spend_meta: adSpendMeta,
      ad_spend_ppc: adSpendPpc,
      cpa: cpa,
      cpa_seitai: cpaSeitai,
      cpa_diet: cpaDiet,
      profit_ltv: newLtv - cpa,
      profit_ltv_seitai: profitLtvSeitai,
      profit_ltv_diet: profitLtvDiet,
      // KGI用
      kgi_work_days: workDays,
      kgi_karte_total: uniquePids.size,
      kgi_karte_seitai: seitaiPids.size,
      kgi_karte_diet: dietPids.size,
      kgi_frequency: frequency,
      kgi_unit_price: avgPrice,
      kgi_utilization: utilization,
      kgi_revenue_target: totalRevenue,
    }

    return NextResponse.json(result, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}
