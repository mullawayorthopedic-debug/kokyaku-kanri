'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { fetchAllSlips } from '@/lib/fetchAll'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId, getClinicIdClient } from '@/lib/clinic'

interface MonthRow {
  yearMonth: string
  label: string
  visits: number
  patients: number
  frequency: number
  newCount: number
  newSeitai: number
  newDiet: number
  revenue: number
  newRevenue: number
  existRevenue: number
  existRevSeitai: number
  existRevDiet: number
  adCost: number
  ltv: number
  cpa: number
  profitLtv: number
}

interface ExistPatient {
  pid: string
  name: string
  revenue: number
}

interface ExistDetail {
  seitai: ExistPatient[]
  diet: ExistPatient[]
  seitaiTotal: number
  dietTotal: number
}

function fmtY(n: number) {
  if (n === 0) return '-'
  return '¥' + n.toLocaleString()
}
function fmtN(n: number) {
  return n === 0 ? '-' : n.toLocaleString()
}
function fmtP(n: number) {
  return n === 0 ? '-' : n.toFixed(1)
}

export default function MonthlyReportPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [rows, setRows] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [existDetails, setExistDetails] = useState<Record<string, ExistDetail>>({})
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [exportingMonth, setExportingMonth] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<{ type: 'ok' | 'err'; text: string; month?: string } | null>(null)

  const exportMonthToSheets = async (yearMonth: string) => {
    const [y, m] = yearMonth.split('-')
    setExportingMonth(yearMonth)
    setExportMsg(null)
    try {
      const res = await fetch('/api/export-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: y, month: parseInt(m), clinicId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '書き込み失敗')
      const d = json.debug || {}
      setExportMsg({ type: 'ok', text: `${y}年${m}月 → 反映完了！シート「${json.sheet}」（新規${d.newPatientCount}名: ${(d.newNames||[]).join(', ')}）`, month: yearMonth })
    } catch (e) {
      setExportMsg({ type: 'err', text: e instanceof Error ? e.message : '書き込み失敗', month: yearMonth })
    } finally {
      setExportingMonth(null)
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const allSlips = await fetchAllSlips(supabase, 'patient_id,visit_date,total_price') as {
        patient_id: string; visit_date: string; total_price: number
      }[]

      const firstVisitMonth: Record<string, string> = {}
      allSlips.forEach(s => {
        const m = s.visit_date.slice(0, 7)
        if (!firstVisitMonth[s.patient_id] || m < firstVisitMonth[s.patient_id]) {
          firstVisitMonth[s.patient_id] = m
        }
      })

      const cid = await getClinicIdClient()
      const { data: patientData } = await supabase
        .from('cm_patients')
        .select('id, name, customer_category')
        .eq('clinic_id', cid)
      const patientTypeMap: Record<string, string> = {}
      const patientNameMap: Record<string, string> = {}
      patientData?.forEach((p: { id: string; name: string; customer_category: string }) => {
        patientTypeMap[p.id] = p.customer_category || ''
        patientNameMap[p.id] = p.name || ''
      })

      const { data: adCosts } = await supabase
        .from('cm_ad_costs')
        .select('month, cost')
        .eq('clinic_id', clinicId)
        .gte('month', selectedYear + '-01')
        .lte('month', selectedYear + '-12')

      const adByMonth: Record<string, number> = {}
      adCosts?.forEach(ac => { adByMonth[ac.month] = (adByMonth[ac.month] || 0) + (ac.cost || 0) })

      // 月別集計（既存患者の個別売上も追跡）
      const byMonth: Record<string, {
        pids: Set<string>; newPids: Set<string>; newSeitaiPids: Set<string>; newDietPids: Set<string>;
        visits: number; revenue: number; newRevenue: number;
        existRevSeitai: number; existRevDiet: number;
        existPidRev: Record<string, number>;
      }> = {}

      allSlips.forEach(s => {
        const m = s.visit_date.slice(0, 7)
        if (!byMonth[m]) byMonth[m] = {
          pids: new Set(), newPids: new Set(), newSeitaiPids: new Set(), newDietPids: new Set(),
          visits: 0, revenue: 0, newRevenue: 0, existRevSeitai: 0, existRevDiet: 0,
          existPidRev: {},
        }
        const ptype = patientTypeMap[s.patient_id] || ''
        byMonth[m].pids.add(s.patient_id)
        byMonth[m].visits++
        byMonth[m].revenue += s.total_price || 0
        if (firstVisitMonth[s.patient_id] === m) {
          byMonth[m].newPids.add(s.patient_id)
          byMonth[m].newRevenue += s.total_price || 0
          if (ptype === '整体') byMonth[m].newSeitaiPids.add(s.patient_id)
          if (ptype === 'ダイエット') byMonth[m].newDietPids.add(s.patient_id)
        } else {
          // 既存患者の個別売上追跡
          byMonth[m].existPidRev[s.patient_id] = (byMonth[m].existPidRev[s.patient_id] || 0) + (s.total_price || 0)
          if (ptype === '整体') byMonth[m].existRevSeitai += s.total_price || 0
          if (ptype === 'ダイエット') byMonth[m].existRevDiet += s.total_price || 0
        }
      })

      // 月行データ生成
      const result: MonthRow[] = []
      for (let m = 1; m <= 12; m++) {
        const ym = `${selectedYear}-${String(m).padStart(2, '0')}`
        const label = `${selectedYear}年${String(m).padStart(2, '0')}月`
        const d = byMonth[ym]
        if (!d) {
          result.push({ yearMonth: ym, label, visits: 0, patients: 0, frequency: 0, newCount: 0, newSeitai: 0, newDiet: 0, revenue: 0, newRevenue: 0, existRevenue: 0, existRevSeitai: 0, existRevDiet: 0, adCost: 0, ltv: 0, cpa: 0, profitLtv: 0 })
          continue
        }
        const newCount = d.newPids.size
        const adCost = adByMonth[ym] || 0
        const ltv = newCount > 0 ? Math.round(d.newRevenue / newCount) : 0
        const cpa = newCount > 0 ? Math.round(adCost / newCount) : 0
        result.push({
          yearMonth: ym, label,
          visits: d.visits,
          patients: d.pids.size,
          frequency: d.pids.size > 0 ? parseFloat((d.visits / d.pids.size).toFixed(1)) : 0,
          newCount,
          newSeitai: d.newSeitaiPids.size,
          newDiet: d.newDietPids.size,
          revenue: d.revenue,
          newRevenue: d.newRevenue,
          existRevenue: d.revenue - d.newRevenue,
          existRevSeitai: d.existRevSeitai,
          existRevDiet: d.existRevDiet,
          adCost,
          ltv,
          cpa,
          profitLtv: ltv - cpa,
        })
      }

      // 既存患者の整体/ダイエット別詳細データ
      const details: Record<string, ExistDetail> = {}
      for (const [month, d] of Object.entries(byMonth)) {
        const seitaiList: ExistPatient[] = []
        const dietList: ExistPatient[] = []

        for (const [pid, rev] of Object.entries(d.existPidRev)) {
          const ptype = patientTypeMap[pid] || ''
          const entry = { pid, name: patientNameMap[pid] || '不明', revenue: rev }
          if (ptype === '整体') seitaiList.push(entry)
          else if (ptype === 'ダイエット') dietList.push(entry)
          else seitaiList.push(entry) // 未分類は整体側に
        }

        seitaiList.sort((a, b) => b.revenue - a.revenue)
        dietList.sort((a, b) => b.revenue - a.revenue)

        details[month] = {
          seitai: seitaiList,
          diet: dietList,
          seitaiTotal: seitaiList.reduce((s, p) => s + p.revenue, 0),
          dietTotal: dietList.reduce((s, p) => s + p.revenue, 0),
        }
      }

      setRows(result)
      setExistDetails(details)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear])

  const totals = rows.reduce((acc, r) => ({
    visits: acc.visits + r.visits,
    patients: Math.max(acc.patients, r.patients),
    newCount: acc.newCount + r.newCount,
    revenue: acc.revenue + r.revenue,
    newRevenue: acc.newRevenue + r.newRevenue,
    existRevenue: acc.existRevenue + r.existRevenue,
    adCost: acc.adCost + r.adCost,
  }), { visits: 0, patients: 0, newCount: 0, revenue: 0, newRevenue: 0, existRevenue: 0, adCost: 0 })
  const totalLtv = totals.newCount > 0 ? Math.round(totals.newRevenue / totals.newCount) : 0
  const totalCpa = totals.newCount > 0 ? Math.round(totals.adCost / totals.newCount) : 0

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales/monthly-report' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 text-lg">月別KPI一覧</h2>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {years.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>

        {/* 年間サマリカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-gray-800">{fmtY(totals.revenue)}</p>
            <p className="text-[10px] text-gray-500">年間売上</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totals.newCount}<span className="text-xs">人</span></p>
            <p className="text-[10px] text-gray-500">年間新規数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{fmtY(totalLtv)}</p>
            <p className="text-[10px] text-gray-500">平均LTV</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className={`text-lg sm:text-2xl font-bold ${(totalLtv - totalCpa) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtY(totalLtv - totalCpa)}</p>
            <p className="text-[10px] text-gray-500">平均利益LTV ★</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#14252A] text-white text-xs">
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap border-r border-[#2a3f45]">月</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">施術回数</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">患者数</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-[#2a3f45]">頻度</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-[#2a3f45]">新規数<br/><span className="font-normal text-gray-400 text-[10px]">整体/ダイエット</span></th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">売上</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">新規売上</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-[#2a3f45]">既存売上<br/><span className="font-normal text-gray-400 text-[10px]">整体/ダイエット</span></th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-[#2a3f45]">広告費</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">新規LTV</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPA</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">利益LTV★</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const hasData = row.visits > 0
                    const isExpanded = expandedMonth === row.yearMonth
                    return (
                      <>
                      <tr key={row.yearMonth}
                        className={`border-b cursor-pointer transition-colors ${isExpanded ? 'bg-green-50' : i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'} ${!hasData ? 'opacity-40' : ''}`}
                        onClick={() => hasData ? setExpandedMonth(isExpanded ? null : row.yearMonth) : undefined}>
                        <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap border-r border-gray-100">
                          <div className="flex items-center gap-1">
                            {row.label}
                            {hasData && <span className="text-[10px] text-green-500">{isExpanded ? '▲' : '▼'}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtN(row.visits)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtN(row.patients)}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">{fmtP(row.frequency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">
                          <span className="text-blue-600 font-medium">{fmtN(row.newCount)}</span>
                          {row.newCount > 0 && <div className="text-[10px] text-gray-400 mt-0.5"><span className="text-teal-600">{row.newSeitai}</span>/<span className="text-orange-500">{row.newDiet}</span></div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtY(row.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-600">{fmtY(row.newRevenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">
                          <span className="text-green-600">{fmtY(row.existRevenue)}</span>
                          {row.existRevenue > 0 && <div className="text-[10px] text-gray-400 mt-0.5"><span className="text-teal-600">{row.existRevSeitai.toLocaleString()}</span>/<span className="text-orange-500">{row.existRevDiet.toLocaleString()}</span></div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-500 border-r border-gray-100">{fmtY(row.adCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtY(row.ltv)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtY(row.cpa)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">
                          {row.newCount > 0 ? (
                            <span className={row.profitLtv >= 0 ? 'text-green-600' : 'text-red-500'}>{fmtY(row.profitLtv)}</span>
                          ) : '-'}
                        </td>
                      </tr>
                      {/* 既存患者詳細パネル */}
                      {isExpanded && hasData && (
                        <tr key={`${row.yearMonth}-detail`}>
                          <td colSpan={12} className="px-4 py-4 bg-green-50 border-b">
                            <ExistDetailPanel
                              month={row.label}
                              detail={existDetails[row.yearMonth] || { seitai: [], diet: [], seitaiTotal: 0, dietTotal: 0 }}
                              existRevenue={row.existRevenue}
                            />
                            <div className="mt-3 pt-3 border-t border-green-200 flex items-center justify-between">
                              <span className="text-[10px] text-gray-400">スプレッドシートに新規・既存データを書き出す</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); exportMonthToSheets(row.yearMonth); }}
                                disabled={exportingMonth !== null}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-green-300 text-green-700 bg-white hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                              >
                                {exportingMonth === row.yearMonth ? (
                                  <><span className="animate-spin inline-block w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full" /> 書き出し中...</>
                                ) : exportMsg?.type === 'ok' && exportMsg.month === row.yearMonth ? (
                                  <>反映完了</>
                                ) : (
                                  <>{row.label} を書き出す</>
                                )}
                              </button>
                              {exportMsg?.month === row.yearMonth && (
                                <p className={`text-[10px] mt-1 ${exportMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                                  {exportMsg.text}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#14252A] text-white text-xs font-bold border-t-2">
                    <td className="px-3 py-2 border-r border-[#2a3f45]">年間合計</td>
                    <td className="px-3 py-2 text-right">{fmtN(totals.visits)}</td>
                    <td className="px-3 py-2 text-right">-</td>
                    <td className="px-3 py-2 text-right border-r border-[#2a3f45]">-</td>
                    <td className="px-3 py-2 text-right border-r border-[#2a3f45]">{fmtN(totals.newCount)}</td>
                    <td className="px-3 py-2 text-right">{fmtY(totals.revenue)}</td>
                    <td className="px-3 py-2 text-right">{fmtY(totals.newRevenue)}</td>
                    <td className="px-3 py-2 text-right border-r border-[#2a3f45]">{fmtY(totals.existRevenue)}</td>
                    <td className="px-3 py-2 text-right border-r border-[#2a3f45]">{fmtY(totals.adCost)}</td>
                    <td className="px-3 py-2 text-right">{fmtY(totalLtv)}</td>
                    <td className="px-3 py-2 text-right">{fmtY(totalCpa)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={(totalLtv - totalCpa) >= 0 ? 'text-green-300' : 'text-red-300'}>{fmtY(totalLtv - totalCpa)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          ★ 利益LTV = 新規LTV - CPA（新規患者1人あたりの利益）/ 施術回数・患者数は期間内スリップ集計
        </p>
      </div>
    </AppShell>
  )
}

function ExistDetailPanel({ month, detail, existRevenue }: {
  month: string
  detail: ExistDetail
  existRevenue: number
}) {
  const totalCards = detail.seitai.length + detail.diet.length

  return (
    <div>
      <p className="text-xs font-semibold text-green-700 mb-3">
        {month} 既存患者売上実績（計 {totalCards}名 / {existRevenue.toLocaleString()}円）
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 整体 */}
        <div className="bg-teal-50 rounded-xl border border-teal-200 overflow-hidden">
          <div className="bg-teal-100 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-600 text-white font-bold">整体</span>
              <span className="text-xs text-teal-700 font-semibold">カルテ {detail.seitai.length}枚</span>
            </div>
            <span className="text-sm font-bold text-teal-700">¥{detail.seitaiTotal.toLocaleString()}</span>
          </div>
          <div className="px-3 py-2">
            {detail.seitai.length === 0 ? (
              <p className="text-xs text-teal-400 py-1">-</p>
            ) : (
              <div className="space-y-0.5">
                {detail.seitai.map(p => (
                  <div key={p.pid} className="flex justify-between text-xs py-0.5">
                    <span className="text-teal-800">{p.name}</span>
                    <span className="text-teal-700 font-medium tabular-nums">¥{p.revenue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ダイエット */}
        <div className="bg-orange-50 rounded-xl border border-orange-200 overflow-hidden">
          <div className="bg-orange-100 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500 text-white font-bold">ダイエット</span>
              <span className="text-xs text-orange-700 font-semibold">カルテ {detail.diet.length}枚</span>
            </div>
            <span className="text-sm font-bold text-orange-700">¥{detail.dietTotal.toLocaleString()}</span>
          </div>
          <div className="px-3 py-2">
            {detail.diet.length === 0 ? (
              <p className="text-xs text-orange-400 py-1">-</p>
            ) : (
              <div className="space-y-0.5">
                {detail.diet.map(p => (
                  <div key={p.pid} className="flex justify-between text-xs py-0.5">
                    <span className="text-orange-800">{p.name}</span>
                    <span className="text-orange-700 font-medium tabular-nums">¥{p.revenue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 整体・ダイエット合計 */}
      <div className="mt-3 bg-white rounded-xl border border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">整体・ダイエット合計</span>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">カルテ <span className="font-bold text-gray-800">{totalCards}</span>枚</span>
          <span className="font-bold text-gray-800 text-sm">¥{(detail.seitaiTotal + detail.dietTotal).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
