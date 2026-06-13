import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001'

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

    // clinic_idを動的に取得（デフォルト値が間違っている場合に対応）
    const { data: clinics } = await supabase.from('clinics').select('id').limit(1)
    const resolvedClinicId = clinics?.[0]?.id || clinicId

    const ym = `${year}-${String(Number(month)).padStart(2, '0')}`
    const startDate = `${ym}-01`
    const endDate = `${ym}-31`

    // 1. 伝票(cm_slips)から月間売上・施術人数を集計
    const { data: slips } = await supabase
      .from('cm_slips')
      .select('patient_id, patient_name, total_price, visit_date, menu_name')
      .eq('clinic_id', resolvedClinicId)
      .gte('visit_date', startDate)
      .lte('visit_date', endDate)

    const totalRevenue = (slips || []).reduce((sum, s) => sum + (s.total_price || 0), 0)
    const uniquePatientIds = new Set((slips || []).map(s => s.patient_id).filter(Boolean))
    const totalVisits = (slips || []).length
    const avgPrice = totalVisits > 0 ? Math.round(totalRevenue / totalVisits) : 0

    // ダイエット売上（menu_nameにダイエットを含む）
    const dietSlips = (slips || []).filter(s => (s.menu_name || '').includes('ダイエット'))
    const dietRevenue = dietSlips.reduce((sum, s) => sum + (s.total_price || 0), 0)
    const seitaiRevenue = totalRevenue - dietRevenue

    // 2. 患者データから新規数を取得
    const { data: newPatients } = await supabase
      .from('cm_patients')
      .select('id, referral_source, first_visit_date')
      .eq('clinic_id', resolvedClinicId)
      .gte('first_visit_date', startDate)
      .lte('first_visit_date', endDate)

    const newCount = (newPatients || []).length

    // 紹介経由の新規
    const referralNew = (newPatients || []).filter(p =>
      (p.referral_source || '').includes('紹介')
    ).length

    // 広告経由の新規
    const adNew = (newPatients || []).filter(p => {
      const src = (p.referral_source || '')
      return src.includes('PPC') || src.includes('インスタ') || src.includes('HPB') || src.includes('MEO')
    }).length

    // 3. リピート率（2回以上来院の患者比率）
    const { data: allActive } = await supabase
      .from('cm_patients')
      .select('id, visit_count')
      .eq('clinic_id', resolvedClinicId)
      .eq('status', 'active')

    const activeCount = (allActive || []).length
    const repeatCount = (allActive || []).filter(p => (p.visit_count || 0) >= 2).length
    const repeatRate = activeCount > 0 ? Math.round((repeatCount / activeCount) * 100) : 0

    // 4. ダイエット事業
    const dietNewPatients = (newPatients || []).filter(p =>
      (p.referral_source || '').includes('ダイエット')
    ).length

    const result = {
      total_revenue: totalRevenue,
      seitai_revenue: seitaiRevenue,
      diet_revenue: dietRevenue,
      avg_price: avgPrice,
      total_patients: uniquePatientIds.size,
      total_visits: totalVisits,
      new_patients: newCount,
      new_from_ad: adNew,
      new_from_referral: referralNew,
      repeat_rate: repeatRate,
      diet_new: dietNewPatients,
    }

    return NextResponse.json({ ...result, _debug: { clinic_id: resolvedClinicId, slips_count: (slips || []).length, period: `${startDate} ~ ${endDate}` } }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}
