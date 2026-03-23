'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getClinicId } from '@/lib/clinic'

const DIET_KEYWORDS = [
  'ダイエット', 'ファスティング', 'KALA', 'MANA', 'ルイボスティー',
  'アッケシソウ', 'グレートマグネシウム', 'ネイジュ', '空気清浄カード',
  '遺伝子検査', '毛髪ミネラル', 'カウンセリング紹介割',
]
function isDiet(menuName: string) {
  return DIET_KEYWORDS.some(kw => menuName.includes(kw))
}

interface ChannelRow {
  channel: string
  cost: number
  seikotsuNew: number
  seikotsuRev: number
  dietNew: number
  dietRev: number
}

interface InquiryStat {
  cost: number
  inquiries: number
  conversions: number
}

function fmt(n: number) { return n.toLocaleString() }
function fmtY(n: number) { return n === 0 ? '-' : '¥' + n.toLocaleString() }

export default function RoasPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([])
  const [totalExistingRevenue, setTotalExistingRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  // 問い合わせ・CV別CPA用
  const [inquiryStats, setInquiryStats] = useState<Record<string, InquiryStat>>({})

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      let queryStart: string, queryEnd: string
      if (period === 'day') {
        queryStart = queryEnd = new Date().toISOString().split('T')[0]
      } else if (period === 'month') {
        queryStart = selectedMonth + '-01'
        const d = new Date(queryStart); d.setMonth(d.getMonth() + 1); d.setDate(0)
        queryEnd = d.toISOString().split('T')[0]
      } else if (period === 'year') {
        queryStart = selectedYear + '-01-01'; queryEnd = selectedYear + '-12-31'
      } else {
        queryStart = startDate; queryEnd = endDate
      }

      // 広告費データ
      const startMonth = queryStart.slice(0, 7)
      const endMonth = queryEnd.slice(0, 7)
      const { data: adCosts } = await supabase
        .from('cm_ad_costs')
        .select('*')
        .eq('clinic_id', clinicId)
        .gte('month', startMonth)
        .lte('month', endMonth)

      // ===== 問い合わせ・CV統計を計算 =====
      const inqMap: Record<string, InquiryStat> = {}
      if (adCosts) {
        adCosts.forEach(ac => {
          const ch = ac.channel || 'その他'
          if (!inqMap[ch]) inqMap[ch] = { cost: 0, inquiries: 0, conversions: 0 }
          inqMap[ch].cost += ac.cost || 0
          inqMap[ch].inquiries += ac.inquiries || 0
          inqMap[ch].conversions += ac.conversions || 0
        })
      }
      setInquiryStats(inqMap)

      // 期間内スリップ（menu_name含む）
      const slips = await fetchAllSlips(supabase, 'patient_id,total_price,menu_name', {
        gte: ['visit_date', queryStart],
        lte: ['visit_date', queryEnd],
      }) as { patient_id: string; total_price: number; menu_name: string }[]

      if (!slips || slips.length === 0) {
        setChannelRows([]); setTotalExistingRevenue(0); setLoading(false); return
      }

      // 全期間スリップ（初回来院日・セグメント判定用）
      const allSlipsRaw = await fetchAllSlips(supabase, 'patient_id,visit_date,menu_name') as { patient_id: string; visit_date: string; menu_name: string }[]

      const firstVisitDate: Record<string, string> = {}
      const firstMenuName: Record<string, string> = {}
      allSlipsRaw.forEach(s => {
        if (!s.patient_id) return
        if (!firstVisitDate[s.patient_id] || s.visit_date < firstVisitDate[s.patient_id]) {
          firstVisitDate[s.patient_id] = s.visit_date
          firstMenuName[s.patient_id] = s.menu_name || ''
        }
      })

      const newPatientIds = [...new Set(
        slips.filter(s => s.patient_id && firstVisitDate[s.patient_id] >= queryStart && firstVisitDate[s.patient_id] <= queryEnd)
          .map(s => s.patient_id)
      )]

      const { data: patientsData } = await supabase
        .from('cm_patients')
        .select('id, referral_source')
        .eq('clinic_id', clinicId)
        .in('id', newPatientIds.length > 0 ? newPatientIds : ['__none__'])

      const patientSourceMap: Record<string, string> = {}
      patientsData?.forEach(p => { patientSourceMap[p.id] = p.referral_source || 'その他' })

      const channelMap: Record<string, { seikotsuPids: Set<string>; seikotsuRev: number; dietPids: Set<string>; dietRev: number; cost: number }> = {}

      if (adCosts) {
        adCosts.forEach(ac => {
          const ch = ac.channel || 'その他'
          if (!channelMap[ch]) channelMap[ch] = { seikotsuPids: new Set(), seikotsuRev: 0, dietPids: new Set(), dietRev: 0, cost: 0 }
          channelMap[ch].cost += ac.cost || 0
        })
      }

      let existRev = 0
      slips.forEach(s => {
        const pid = s.patient_id
        const amount = s.total_price || 0
        const isNew = pid && firstVisitDate[pid] >= queryStart && firstVisitDate[pid] <= queryEnd
        if (!isNew) { existRev += amount; return }
        const source = patientSourceMap[pid] || 'その他'
        const channel = mapSourceToChannel(source)
        const seg = isDiet(firstMenuName[pid] || '') ? 'diet' : 'seikotsu'
        if (!channelMap[channel]) channelMap[channel] = { seikotsuPids: new Set(), seikotsuRev: 0, dietPids: new Set(), dietRev: 0, cost: 0 }
        if (seg === 'seikotsu') {
          channelMap[channel].seikotsuPids.add(pid)
          channelMap[channel].seikotsuRev += amount
        } else {
          channelMap[channel].dietPids.add(pid)
          channelMap[channel].dietRev += amount
        }
      })

      const rows: ChannelRow[] = Object.entries(channelMap).map(([channel, d]) => ({
        channel,
        cost: d.cost,
        seikotsuNew: d.seikotsuPids.size,
        seikotsuRev: d.seikotsuRev,
        dietNew: d.dietPids.size,
        dietRev: d.dietRev,
      })).filter(r => r.cost > 0 || r.seikotsuNew > 0 || r.dietNew > 0)
        .sort((a, b) => b.cost - a.cost)

      setChannelRows(rows)
      setTotalExistingRevenue(existRev)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const totalCost = channelRows.reduce((s, r) => s + r.cost, 0)
  const totalSeikotsuNew = channelRows.reduce((s, r) => s + r.seikotsuNew, 0)
  const totalDietNew = channelRows.reduce((s, r) => s + r.dietNew, 0)
  const totalNewRev = channelRows.reduce((s, r) => s + r.seikotsuRev + r.dietRev, 0)
  const overallRoas = totalCost > 0 ? Math.round(totalNewRev / totalCost * 100) : 0

  // 問い合わせ集計
  const totalInquiries = Object.values(inquiryStats).reduce((s, r) => s + r.inquiries, 0)
  const totalCVs = Object.values(inquiryStats).reduce((s, r) => s + r.conversions, 0)
  const totalInqCost = Object.values(inquiryStats).reduce((s, r) => s + r.cost, 0)
  const overallCvCpa = totalCVs > 0 ? Math.round(totalInqCost / totalCVs) : 0
  const overallCVR = totalInquiries > 0 ? Math.round(totalCVs / totalInquiries * 100) : 0

  function SegmentTable({ type }: { type: 'seikotsu' | 'diet' }) {
    const rows = channelRows.filter(r => type === 'seikotsu' ? r.seikotsuNew > 0 || r.cost > 0 : r.dietNew > 0 || r.cost > 0)
    const color = type === 'seikotsu' ? '#2563eb' : '#16a34a'
    const label = type === 'seikotsu' ? '整体' : 'ダイエット'

    const totalSectionNew = rows.reduce((s, r) => s + (type === 'seikotsu' ? r.seikotsuNew : r.dietNew), 0)
    const totalSectionRev = rows.reduce((s, r) => s + (type === 'seikotsu' ? r.seikotsuRev : r.dietRev), 0)
    const totalSectionCost = rows.reduce((s, r) => s + r.cost, 0)
    const avgLtv = totalSectionNew > 0 ? Math.round(totalSectionRev / totalSectionNew) : 0
    const avgCpa = totalSectionNew > 0 ? Math.round(totalSectionCost / totalSectionNew) : 0
    const avgProfitLtv = avgLtv - avgCpa
    const sectionRoas = totalSectionCost > 0 ? Math.round(totalSectionRev / totalSectionCost * 100) : 0

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-4 rounded inline-block" style={{ background: color }} />
          <span className="font-bold text-sm" style={{ color }}>{label}↓</span>
          <span className="text-xs text-gray-400 ml-2">新規{totalSectionNew}人 / 売上{fmtY(totalSectionRev)} / 平均LTV {fmtY(avgLtv)} / 平均CPA {fmtY(avgCpa)} / 利益LTV
            <span className={avgProfitLtv >= 0 ? ' text-green-600 font-bold' : ' text-red-500 font-bold'}> {fmtY(avgProfitLtv)}</span>
          </span>
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500">
                  <th className="text-left px-3 py-2">広告媒体</th>
                  <th className="text-right px-3 py-2">広告費</th>
                  <th className="text-right px-3 py-2">{label}新規</th>
                  <th className="text-right px-3 py-2">{label}売上</th>
                  <th className="text-right px-3 py-2 font-bold">LTV</th>
                  <th className="text-right px-3 py-2">CPA</th>
                  <th className="text-right px-3 py-2 font-bold">利益LTV</th>
                  <th className="text-right px-3 py-2">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-6 text-gray-400">データなし</td></tr>
                ) : rows.map(r => {
                  const newCount = type === 'seikotsu' ? r.seikotsuNew : r.dietNew
                  const rev = type === 'seikotsu' ? r.seikotsuRev : r.dietRev
                  const ltv = newCount > 0 ? Math.round(rev / newCount) : 0
                  const cpa = newCount > 0 ? Math.round(r.cost / newCount) : 0
                  const profitLtv = ltv - cpa
                  const roas = r.cost > 0 ? Math.round(rev / r.cost * 100) : 0
                  return (
                    <tr key={r.channel} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{r.channel}</td>
                      <td className="px-3 py-2 text-right text-red-600">{r.cost > 0 ? fmtY(r.cost) : '-'}</td>
                      <td className="px-3 py-2 text-right" style={{ color }}>{newCount > 0 ? `${newCount}人` : '-'}</td>
                      <td className="px-3 py-2 text-right">{rev > 0 ? fmtY(rev) : '-'}</td>
                      <td className="px-3 py-2 text-right font-bold">{ltv > 0 ? fmtY(ltv) : '-'}</td>
                      <td className="px-3 py-2 text-right">{cpa > 0 ? fmtY(cpa) : '-'}</td>
                      <td className="px-3 py-2 text-right font-bold">
                        {newCount > 0 ? (
                          <span className={profitLtv >= 0 ? 'text-green-600' : 'text-red-500'}>{fmtY(profitLtv)}</span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.cost > 0 ? (
                          <span className={roas >= 100 ? 'text-green-600 font-bold' : 'text-red-500'}>{fmt(roas)}%</span>
                        ) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 text-xs">
                  <td className="px-3 py-2 text-gray-700">合計</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmtY(totalSectionCost)}</td>
                  <td className="px-3 py-2 text-right" style={{ color }}>{totalSectionNew}人</td>
                  <td className="px-3 py-2 text-right">{fmtY(totalSectionRev)}</td>
                  <td className="px-3 py-2 text-right">{fmtY(avgLtv)}</td>
                  <td className="px-3 py-2 text-right">{fmtY(avgCpa)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={avgProfitLtv >= 0 ? 'text-green-600' : 'text-red-500'}>{fmtY(avgProfitLtv)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={sectionRoas >= 100 ? 'text-green-600' : 'text-red-500'}>{sectionRoas}%</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // 問い合わせ・CV別CPAテーブルの行データ
  const inquiryTableRows = Object.entries(inquiryStats)
    .filter(([, d]) => d.cost > 0 || d.inquiries > 0 || d.conversions > 0)
    .sort(([, a], [, b]) => b.cost - a.cost)

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/roas' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">ROAS・広告分析</h2>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[{ key: 'day', label: '本日' }, { key: 'month', label: '月別' }, { key: 'year', label: '年間' }, { key: 'custom', label: '期間指定' }].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
              }`}>{p.label}</button>
          ))}
        </div>

        <div className="mb-4">
          {period === 'month' && <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />}
          {period === 'year' && (
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          )}
          {period === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
              <span className="text-gray-400 text-sm">〜</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
            </div>
          )}
        </div>

        {/* 全体サマリ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{fmt(overallRoas)}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">全体ROAS</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-red-600">{fmtY(totalCost)}</p>
            <p className="text-[10px] sm:text-xs text-gray-500">広告費合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalSeikotsuNew}<span className="text-xs">人</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">整体 新規</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{totalDietNew}<span className="text-xs">人</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">ダイエット 新規</p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : channelRows.length === 0 && inquiryTableRows.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-400 mb-3">広告費データがありません</p>
            <Link href="/sales/ad-costs" className="text-blue-600 text-sm hover:underline">広告費入力ページで登録してください →</Link>
          </div>
        ) : (
          <>
            {channelRows.length > 0 && (
              <>
                <SegmentTable type="seikotsu" />
                <SegmentTable type="diet" />
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 mt-2 mb-6">
                  既存患者売上: <span className="font-medium text-gray-700">{fmtY(totalExistingRevenue)}</span>
                  （新規売上: {fmtY(totalNewRev)} / 合計: {fmtY(totalNewRev + totalExistingRevenue)}）
                </div>
              </>
            )}

            {/* ===== 問い合わせ・CV別CPA ===== */}
            {inquiryTableRows.length > 0 && (
              <div className="mt-2">
                {/* セクションヘッダー */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-1 h-5 rounded bg-orange-400 inline-block" />
                  <h3 className="font-bold text-gray-800 text-sm">📞 問い合わせ・CV別CPA</h3>
                  <Link href="/" className="text-[11px] text-blue-500 hover:underline ml-auto">ホームで入力 →</Link>
                </div>

                {/* 集計サマリ */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                    <p className="text-lg font-bold text-orange-700">{totalInquiries}<span className="text-xs">件</span></p>
                    <p className="text-[10px] text-gray-500">問い合わせ合計</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                    <p className="text-lg font-bold text-green-700">{totalCVs}<span className="text-xs">件</span></p>
                    <p className="text-[10px] text-gray-500">CV（来院）合計</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                    <p className="text-lg font-bold text-gray-700">{overallCVR}<span className="text-xs">%</span></p>
                    <p className="text-[10px] text-gray-500">全体CVR</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                    <p className={`text-lg font-bold ${overallCvCpa <= 10000 ? 'text-green-600' : overallCvCpa <= 30000 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {overallCvCpa > 0 ? fmtY(overallCvCpa) : '-'}
                    </p>
                    <p className="text-[10px] text-gray-500">全体 CV-CPA</p>
                  </div>
                </div>

                {/* 媒体別テーブル */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-xs text-gray-500">
                          <th className="text-left px-3 py-2.5 whitespace-nowrap">広告媒体</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap text-red-500">広告費</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap">問い合わせ</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap">問合CPA</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap text-green-600 font-bold">CV（来院）</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap font-bold text-orange-600">CV-CPA</th>
                          <th className="text-right px-3 py-2.5 whitespace-nowrap">CVR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inquiryTableRows.map(([channel, d]) => {
                          const inqCpa = d.inquiries > 0 ? Math.round(d.cost / d.inquiries) : null
                          const cvCpa = d.conversions > 0 ? Math.round(d.cost / d.conversions) : null
                          const cvr = d.inquiries > 0 ? Math.round(d.conversions / d.inquiries * 100) : null
                          return (
                            <tr key={channel} className="border-b hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{channel}</td>
                              <td className="px-3 py-2 text-right text-red-600">{d.cost > 0 ? fmtY(d.cost) : '-'}</td>
                              <td className="px-3 py-2 text-right">{d.inquiries > 0 ? `${d.inquiries}件` : '-'}</td>
                              <td className="px-3 py-2 text-right text-gray-500 text-xs">{inqCpa ? fmtY(inqCpa) : '-'}</td>
                              <td className="px-3 py-2 text-right font-bold text-green-700">{d.conversions > 0 ? `${d.conversions}件` : '-'}</td>
                              <td className="px-3 py-2 text-right font-bold">
                                {cvCpa ? (
                                  <span className={cvCpa <= 10000 ? 'text-green-600' : cvCpa <= 30000 ? 'text-yellow-600' : 'text-red-500'}>
                                    {fmtY(cvCpa)}
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {cvr !== null ? (
                                  <span className={cvr >= 30 ? 'text-green-600 font-bold' : cvr >= 10 ? 'text-yellow-600' : 'text-red-500'}>
                                    {cvr}%
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-bold border-t-2 text-xs">
                          <td className="px-3 py-2 text-gray-700">合計</td>
                          <td className="px-3 py-2 text-right text-red-600">{fmtY(totalInqCost)}</td>
                          <td className="px-3 py-2 text-right">{totalInquiries > 0 ? `${totalInquiries}件` : '-'}</td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {totalInquiries > 0 && totalInqCost > 0 ? fmtY(Math.round(totalInqCost / totalInquiries)) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-green-700">{totalCVs > 0 ? `${totalCVs}件` : '-'}</td>
                          <td className="px-3 py-2 text-right">
                            {overallCvCpa > 0 ? (
                              <span className={overallCvCpa <= 10000 ? 'text-green-600' : overallCvCpa <= 30000 ? 'text-yellow-600' : 'text-red-500'}>
                                {fmtY(overallCvCpa)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {overallCVR > 0 ? (
                              <span className={overallCVR >= 30 ? 'text-green-600' : overallCVR >= 10 ? 'text-yellow-600' : 'text-red-500'}>
                                {overallCVR}%
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 px-1 mb-2">
                  ※ CV（来院）はホーム画面の「新規問い合わせ入力」で入力した手動データです。CV-CPA = 広告費 ÷ CV数。CVR = CV ÷ 問い合わせ数。
                </p>
                <p className="text-[11px] text-gray-400 px-1">
                  ※ CPA判定目安：<span className="text-green-600 font-medium">¥10,000以下</span>（優良）／<span className="text-yellow-600 font-medium">¥10,001〜¥30,000</span>（普通）／<span className="text-red-500 font-medium">¥30,001以上</span>（要改善）
                </p>
              </div>
            )}

            {inquiryTableRows.length === 0 && !loading && (
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 text-sm text-gray-600">
                <p className="font-medium text-orange-700 mb-1">📞 問い合わせ・CV別CPAを表示するには</p>
                <p className="text-xs text-gray-500">ホーム画面の「新規問い合わせ入力」セクションで媒体ごとの問い合わせ数とCV数を入力してください。</p>
                <Link href="/" className="inline-block mt-2 text-xs text-blue-600 hover:underline">ホームへ →</Link>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function mapSourceToChannel(source: string): string {
  const mapping: Record<string, string> = {
    'Google検索': 'SEO(自然検索)',
    'Googleマップ': 'Googleマップ(MEO)',
    'Instagram': 'Instagram広告',
    'YouTube': 'YouTube',
    'チラシ': 'チラシ',
    '紹介': '紹介',
    'LINE': 'LINE広告',
    '通りがかり': 'その他',
    'ホットペッパービューティー': 'ホットペッパービューティー',
  }
  return mapping[source] || source
}
