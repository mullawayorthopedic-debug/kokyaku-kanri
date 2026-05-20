import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClinicIdServer } from '@/lib/clinic-server'
import { fetchAllSlipsServer } from '@/lib/fetchAllServer'
import { writeMonthlySheet, normalizeReferral, normalizeAdChannel } from '@/lib/googleSheets'
import type { MonthExportData } from '@/lib/googleSheets'

function calcAge(birthDate: string): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export async function POST(req: NextRequest) {
  try {
    const { year, month, clinicId: clientClinicId } = await req.json()
    if (!year || !month) {
      return NextResponse.json({ error: 'yearとmonthは必須です' }, { status: 400 })
    }

    const serverClinicId = await getClinicIdServer()
    const clinicId = clientClinicId || serverClinicId
    const supabase = await createClient()
    const ym = `${year}-${String(month).padStart(2, '0')}`

    // 全スリップ取得
    const allSlips = await fetchAllSlipsServer(supabase, clinicId, 'patient_id,visit_date,total_price,menu_name') as {
      patient_id: string; visit_date: string; total_price: number; menu_name: string
    }[]

    // 患者データ取得
    const { data: patientData } = await supabase
      .from('cm_patients')
      .select('id, name, customer_category, gender, birth_date, city, prefecture, chief_complaint, referral_source, visit_motive')
      .eq('clinic_id', clinicId)

    const patientMap: Record<string, {
      name: string; category: string; gender: string; birth_date: string;
      city: string; chief_complaint: string; referral_source: string; visit_motive: string;
    }> = {}
    patientData?.forEach((p: {
      id: string; name: string; customer_category: string; gender: string; birth_date: string;
      city: string; prefecture: string; chief_complaint: string; referral_source: string; visit_motive: string;
    }) => {
      patientMap[p.id] = {
        name: p.name || '', category: p.customer_category || '',
        gender: p.gender || '', birth_date: p.birth_date || '',
        city: (p.prefecture || '') + (p.city || ''),
        chief_complaint: p.chief_complaint || '',
        referral_source: p.referral_source || '',
        visit_motive: p.visit_motive || '',
      }
    })

    // 初回来院月
    const firstVisitMonth: Record<string, string> = {}
    allSlips.forEach(s => {
      if (!s.patient_id) return
      const m = s.visit_date.slice(0, 7)
      if (!firstVisitMonth[s.patient_id] || m < firstVisitMonth[s.patient_id]) {
        firstVisitMonth[s.patient_id] = m
      }
    })

    // 対象月のスリップ集計
    const monthSlips = allSlips.filter(s => s.visit_date.slice(0, 7) === ym)
    const pids = new Set<string>()
    const newPids = new Set<string>()
    const existPidRev: Record<string, number> = {}
    const newPidRev: Record<string, number> = {}

    monthSlips.forEach(s => {
      pids.add(s.patient_id)
      const amount = s.total_price || 0
      if (firstVisitMonth[s.patient_id] === ym) {
        newPids.add(s.patient_id)
        newPidRev[s.patient_id] = (newPidRev[s.patient_id] || 0) + amount
      } else {
        existPidRev[s.patient_id] = (existPidRev[s.patient_id] || 0) + amount
      }
    })

    // 営業日数（来院がある日のユニーク数）
    const workingDays = new Set(monthSlips.map(s => s.visit_date)).size

    // 既存患者を整体/ダイエット別に分ける
    const existSeitai: { name: string; revenue: number }[] = []
    const existDiet: { name: string; revenue: number }[] = []
    for (const [pid, rev] of Object.entries(existPidRev)) {
      const p = patientMap[pid]
      const entry = { name: p?.name || '不明', revenue: rev }
      if (p?.category === 'ダイエット') existDiet.push(entry)
      else existSeitai.push(entry)
    }
    existSeitai.sort((a, b) => b.revenue - a.revenue)
    existDiet.sort((a, b) => b.revenue - a.revenue)

    // 新規患者の詳細
    const newPatients = Array.from(newPids).map(pid => {
      const p = patientMap[pid] || { name: '不明', category: '', gender: '', birth_date: '', city: '', chief_complaint: '', referral_source: '', visit_motive: '' }
      return {
        name: p.name, city: p.city, gender: p.gender,
        age: calcAge(p.birth_date),
        visitMotive: p.visit_motive, chiefComplaint: p.chief_complaint,
        referralSource: p.referral_source, category: p.category,
      }
    }).sort((a, b) => {
      if (a.category === '整体' && b.category !== '整体') return -1
      if (a.category !== '整体' && b.category === '整体') return 1
      return 0
    })

    // 新規患者の媒体別集計（新規数+売上）
    // 媒体にマッピングできない患者は整体→「紹介」、ダイエット→「紹介」に振り分け
    // （シートの数式 H28=SUM(H18:H23), H29=SUM(H25:H27) で新規売上が合算されるため、
    //  全新規売上が必ずいずれかの媒体行に入る必要がある）
    type MediaEntry = { count: number; revenue: number; cost: number; inquiries: number; clicks: number }
    const mediaData: { seitai: Record<string, MediaEntry>; diet: Record<string, MediaEntry> } = {
      seitai: {}, diet: {},
    }
    for (const pid of newPids) {
      const p = patientMap[pid]
      if (!p) continue
      let media = normalizeReferral(p.referral_source) || normalizeReferral(p.visit_motive)
      // 媒体不明の場合は「紹介」に振り分け（売上の漏れを防ぐ）
      if (!media) media = '紹介'
      const rev = newPidRev[pid] || 0
      const target = p.category === 'ダイエット' ? mediaData.diet : mediaData.seitai
      if (!target[media]) target[media] = { count: 0, revenue: 0, cost: 0, inquiries: 0, clicks: 0 }
      target[media].count++
      target[media].revenue += rev
    }

    // 広告費データ取得（媒体別）
    const { data: adCostData } = await supabase
      .from('cm_ad_costs')
      .select('channel, cost, impressions, clicks, inquiries')
      .eq('clinic_id', clinicId)
      .eq('month', ym)

    let adCost = 0
    adCostData?.forEach(ac => {
      adCost += ac.cost || 0
      const mapped = normalizeAdChannel(ac.channel || '')
      if (!mapped) return
      const target = mapped.type === 'diet' ? mediaData.diet : mediaData.seitai
      if (!target[mapped.media]) target[mapped.media] = { count: 0, revenue: 0, cost: 0, inquiries: 0, clicks: 0 }
      target[mapped.media].cost += ac.cost || 0
      target[mapped.media].inquiries += ac.inquiries || 0
      target[mapped.media].clicks += ac.clicks || 0
    })

    // 新規カウント
    let seitaiNewCount = 0
    let dietNewCount = 0
    for (const pid of newPids) {
      const p = patientMap[pid]
      if (p?.category === 'ダイエット') dietNewCount++
      else seitaiNewCount++
    }

    const existPatientCount = pids.size - newPids.size
    const totalRevenue = monthSlips.reduce((s, sl) => s + (sl.total_price || 0), 0)
    const newRevenue = Object.values(newPidRev).reduce((s, v) => s + v, 0)
    const existRevenue = Object.values(existPidRev).reduce((s, v) => s + v, 0)
    const avgPrice = monthSlips.length > 0 ? Math.round(totalRevenue / monthSlips.length) : 0

    const exportData: MonthExportData = {
      visits: monthSlips.length,
      patients: pids.size,
      existPatientCount,
      seitaiNewCount,
      dietNewCount,
      totalRevenue,
      newRevenue,
      existRevenue,
      adCost,
      workingDays,
      avgPrice,
      existSeitai,
      existDiet,
      newPatients,
      mediaData,
    }

    const sheetTitle = await writeMonthlySheet(year, month, exportData)

    const url = `https://docs.google.com/spreadsheets/d/${(process.env.GOOGLE_SPREADSHEET_ID || '').replace(/[\s\\n]+$/g, '').trim()}`
    return NextResponse.json({
      success: true, url, sheet: sheetTitle,
      summary: {
        month: ym,
        monthSlips: monthSlips.length,
        newPatientCount: newPids.size,
        existPatientCount,
      }
    })
  } catch (error) {
    console.error('Export to Sheets error:', error)
    const message = error instanceof Error ? error.message : 'サーバーエラーが発生しました'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
