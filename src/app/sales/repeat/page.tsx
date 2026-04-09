'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getClinicId } from '@/lib/clinic'

// ===== セグメント分類 =====
const DIET_KEYWORDS = [
  'ダイエット', 'ファスティング', 'KALA', 'MANA', 'ルイボスティー',
  'アッケシソウ', 'グレートマグネシウム', 'ネイジュ', '空気清浄カード',
  '遺伝子検査', '毛髪ミネラル', 'カウンセリング紹介割',
]
function isDiet(menuName: string) {
  return DIET_KEYWORDS.some(kw => menuName.includes(kw))
}

// 整体: 回数券・コース購入キーワード（利用≠購入）
const KAIKEN_PURCHASE = [
  'サブスク購入', '回数券5回', '回数券20回', '8回（2ヶ月）', '12回（3ヶ月）',
  '体質改善2', 'ライト回数券', '10回券回数券購入', '1５回回数券購入',
  'トライアル3回', '５回回数券購入', '6回回数券購入', '10回回数券購入',
]
function isKaikenPurchase(menuName: string) {
  return KAIKEN_PURCHASE.some(kw => menuName.includes(kw))
}

// ダイエット体験・成約キーワード
const DIET_TRIAL_KEYWORDS = ['カウンセリングリング', 'カウンセリング紹介割', 'カウンセリング']
const DIET_CONTRACT_KEYWORDS = [
  'パーソナルダイエット', 'ダイエット半年', 'ダイエット２４万', 'ダイエット１４万',
  'ファスティングモニター', '8日間ファスティング', '10日間ファスティング', '60日間ファスティング',
]
function isDietTrial(menuName: string) {
  return DIET_TRIAL_KEYWORDS.some(kw => menuName.includes(kw))
}
function isDietContract(menuName: string) {
  return DIET_CONTRACT_KEYWORDS.some(kw => menuName.includes(kw))
}

type Segment = 'all' | 'seikotsu' | 'diet'

interface SlipRow {
  patient_id: string
  visit_date: string
  total_price: number
  menu_name: string
}

// 全体（既存リピート率）用
interface MonthlyRepeat {
  month: string
  totalVisits: number
  newPatients: number
  newVisits: number
  repeatPatients: number
  repeatVisits: number
  repeatRate: number
}

// 整体コホート（新規→転換率）用
interface SeikotsuCohort {
  month: string           // 初来院月
  newCount: number        // 新規患者数
  convertedCount: number  // 2回目or回数券購入した人数（= ２回目リピ率）
  conversionRate: number  // ２回目リピ率
  reached6Count: number   // 6回目到達数
  rate6: number           // ６回目リピ率
}

// ダイエットコホート（体験→成約率）用
interface DietCohort {
  month: string           // 体験月
  trialCount: number      // 体験患者数
  contractedCount: number // 成約数（= ２回目リピ率）
  contractRate: number    // 成約率
  visited6Count: number   // 6回目到達数
  rate6: number           // ６回目リピ率
}

const SEGMENT_LABELS: Record<Segment, string> = { all: '全体', seikotsu: '整体', diet: 'ダイエット' }
const SEGMENT_COLORS: Record<Segment, string> = { all: '#14252A', seikotsu: '#2563eb', diet: '#16a34a' }

export default function RepeatPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [segment, setSegment] = useState<Segment>('all')

  // 全体用
  const [monthlyData, setMonthlyData] = useState<MonthlyRepeat[]>([])
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  // 整体用コホート
  const [seikotsuCohorts, setSeikotsuCohorts] = useState<SeikotsuCohort[]>([])
  const [seikotsuSummary, setSeikotsuSummary] = useState({ newTotal: 0, convertedTotal: 0, rate: 0 })

  // ダイエット用コホート
  const [dietCohorts, setDietCohorts] = useState<DietCohort[]>([])
  const [dietSummary, setDietSummary] = useState({ trialTotal: 0, contractTotal: 0, rate: 0 })

  // 全体サマリ
  const [allSummary, setAllSummary] = useState({ repeatRate: 0, total: 0, repeater: 0, avgVisits: 0 })

  const [loading, setLoading] = useState(true)
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))
  const accentColor = SEGMENT_COLORS[segment]

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const allSlips = await fetchAllSlips(supabase, 'patient_id,visit_date,total_price,menu_name') as SlipRow[]
      if (!allSlips || allSlips.length === 0) { setLoading(false); return }

      const seikotsuSlips = allSlips.filter(v => !isDiet(v.menu_name || ''))
      const dietSlips = allSlips.filter(v => isDiet(v.menu_name || ''))

      // ===== 全体: 月別リピート率（既存比率） =====
      let qStart: string, qEnd: string
      if (period === 'day') {
        qStart = qEnd = new Date().toISOString().split('T')[0]
      } else if (period === 'month') {
        qStart = selectedMonth + '-01'
        const d = new Date(qStart); d.setMonth(d.getMonth() + 1); d.setDate(0)
        qEnd = d.toISOString().split('T')[0]
      } else if (period === 'year') {
        qStart = selectedYear + '-01-01'; qEnd = selectedYear + '-12-31'
      } else {
        qStart = startDate; qEnd = endDate
      }

      const firstVisitAll: Record<string, string> = {}
      allSlips.forEach(v => {
        const m = v.visit_date.slice(0, 7)
        if (!firstVisitAll[v.patient_id] || m < firstVisitAll[v.patient_id]) firstVisitAll[v.patient_id] = m
      })

      const mMap: Record<string, { pats: Set<string>; newPats: Set<string>; total: number; nv: number; rv: number }> = {}
      allSlips.filter(v => v.visit_date >= qStart && v.visit_date <= qEnd).forEach(v => {
        const m = v.visit_date.slice(0, 7)
        if (!mMap[m]) mMap[m] = { pats: new Set(), newPats: new Set(), total: 0, nv: 0, rv: 0 }
        mMap[m].pats.add(v.patient_id); mMap[m].total++
        if (firstVisitAll[v.patient_id] === m) { mMap[m].newPats.add(v.patient_id); mMap[m].nv++ }
        else mMap[m].rv++
      })
      const mResult: MonthlyRepeat[] = Object.entries(mMap).sort(([a],[b]) => b.localeCompare(a)).map(([month, d]) => {
        const total = d.pats.size, newP = d.newPats.size, repeat = total - newP
        return { month, totalVisits: d.total, newPatients: newP, newVisits: d.nv, repeatPatients: repeat, repeatVisits: d.rv, repeatRate: total > 0 ? Math.round(repeat / total * 100) : 0 }
      })
      setMonthlyData(mResult)

      // 全体サマリ
      const filteredAll = allSlips.filter(v => v.visit_date >= qStart && v.visit_date <= qEnd)
      const allPats = new Set(filteredAll.map(v => v.patient_id))
      const newPatsAll = new Set(filteredAll.filter(v => firstVisitAll[v.patient_id] === v.visit_date.slice(0,7)).map(v => v.patient_id))
      const repeatPatsAll = allPats.size - newPatsAll.size
      const avgV = allPats.size > 0 ? parseFloat((filteredAll.length / allPats.size).toFixed(1)) : 0
      const repeaterCount = new Set(filteredAll.filter(v => firstVisitAll[v.patient_id] < v.visit_date.slice(0,7)).map(v => v.patient_id)).size
      setAllSummary({ repeatRate: allPats.size > 0 ? Math.round(repeatPatsAll / allPats.size * 100) : 0, total: allPats.size, repeater: repeaterCount, avgVisits: avgV })

      // ===== 整体: コホート（新規→2回目 or 回数券） =====
      // 患者ごとの全整体訪問リスト
      const seikotsuByPatient: Record<string, SlipRow[]> = {}
      seikotsuSlips.forEach(v => {
        if (!seikotsuByPatient[v.patient_id]) seikotsuByPatient[v.patient_id] = []
        seikotsuByPatient[v.patient_id].push(v)
      })

      // 各患者の整体初来院月
      const firstSeikotsuMonth: Record<string, string> = {}
      seikotsuSlips.forEach(v => {
        const m = v.visit_date.slice(0, 7)
        if (!firstSeikotsuMonth[v.patient_id] || m < firstSeikotsuMonth[v.patient_id]) firstSeikotsuMonth[v.patient_id] = m
      })

      // 月別コホート集計
      const sMap: Record<string, { newPats: Set<string>; converted: Set<string>; reached6: Set<string> }> = {}
      Object.entries(firstSeikotsuMonth).forEach(([pid, m]) => {
        if (!sMap[m]) sMap[m] = { newPats: new Set(), converted: new Set(), reached6: new Set() }
        sMap[m].newPats.add(pid)
        // 転換判定: 来院2回以上 or 回数券購入
        const pVisits = seikotsuByPatient[pid] || []
        const visitCount = pVisits.length
        const boughtKaiken = pVisits.some(v => isKaikenPurchase(v.menu_name || ''))
        if (visitCount >= 2 || boughtKaiken) sMap[m].converted.add(pid)
        if (visitCount >= 6) sMap[m].reached6.add(pid)
      })
      const sCohorts: SeikotsuCohort[] = Object.entries(sMap).sort(([a],[b]) => b.localeCompare(a)).map(([month, d]) => {
        const newCount = d.newPats.size, converted = d.converted.size, reached6 = d.reached6.size
        return { month, newCount, convertedCount: converted, conversionRate: newCount > 0 ? Math.round(converted / newCount * 100) : 0,
          reached6Count: reached6, rate6: newCount > 0 ? Math.round(reached6 / newCount * 100) : 0 }
      })
      setSeikotsuCohorts(sCohorts)
      const sTotalNew = sCohorts.reduce((s, c) => s + c.newCount, 0)
      const sTotalConv = sCohorts.reduce((s, c) => s + c.convertedCount, 0)
      setSeikotsuSummary({ newTotal: sTotalNew, convertedTotal: sTotalConv, rate: sTotalNew > 0 ? Math.round(sTotalConv / sTotalNew * 100) : 0 })

      // ===== ダイエット: コホート（体験→成約） =====
      // 体験患者を特定
      const dietByPatient: Record<string, SlipRow[]> = {}
      dietSlips.forEach(v => {
        if (!dietByPatient[v.patient_id]) dietByPatient[v.patient_id] = []
        dietByPatient[v.patient_id].push(v)
      })

      // 各患者の体験月（初カウンセリング）
      const firstTrialMonth: Record<string, string> = {}
      dietSlips.filter(v => isDietTrial(v.menu_name || '')).forEach(v => {
        const m = v.visit_date.slice(0, 7)
        if (!firstTrialMonth[v.patient_id] || m < firstTrialMonth[v.patient_id]) firstTrialMonth[v.patient_id] = m
      })

      // 成約済み患者
      const contractedPatients = new Set(
        dietSlips.filter(v => isDietContract(v.menu_name || '')).map(v => v.patient_id)
      )

      // 月別ダイエットコホート
      const dMap: Record<string, { trials: Set<string>; contracted: Set<string>; visited6: Set<string> }> = {}
      Object.entries(firstTrialMonth).forEach(([pid, m]) => {
        if (!dMap[m]) dMap[m] = { trials: new Set(), contracted: new Set(), visited6: new Set() }
        dMap[m].trials.add(pid)
        if (contractedPatients.has(pid)) dMap[m].contracted.add(pid)
        const dVisitCount = (dietByPatient[pid] || []).length
        if (dVisitCount >= 6) dMap[m].visited6.add(pid)
      })
      const dCohorts: DietCohort[] = Object.entries(dMap).sort(([a],[b]) => b.localeCompare(a)).map(([month, d]) => {
        const trials = d.trials.size, contracted = d.contracted.size, visited6 = d.visited6.size
        return { month, trialCount: trials, contractedCount: contracted, contractRate: trials > 0 ? Math.round(contracted / trials * 100) : 0,
          visited6Count: visited6, rate6: trials > 0 ? Math.round(visited6 / trials * 100) : 0 }
      })
      setDietCohorts(dCohorts)
      const dTotalTrial = dCohorts.reduce((s, c) => s + c.trialCount, 0)
      const dTotalContract = dCohorts.reduce((s, c) => s + c.contractedCount, 0)
      setDietSummary({ trialTotal: dTotalTrial, contractTotal: dTotalContract, rate: dTotalTrial > 0 ? Math.round(dTotalContract / dTotalTrial * 100) : 0 })

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const avgRepeatRate = monthlyData.length > 0
    ? Math.round(monthlyData.reduce((s, d) => s + d.repeatRate, 0) / monthlyData.length)
    : 0

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/repeat' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">リピート・転換分析</h2>

        {/* セグメント選択カード */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {(['all', 'seikotsu', 'diet'] as Segment[]).map(seg => {
            const color = SEGMENT_COLORS[seg]
            const active = segment === seg
            const rate = seg === 'all' ? allSummary.repeatRate : seg === 'seikotsu' ? seikotsuSummary.rate : dietSummary.rate
            const label = seg === 'all' ? 'リピート率' : seg === 'seikotsu' ? '転換率' : '成約率'
            const sub = seg === 'all'
              ? `患者${allSummary.total}人 / 平均${allSummary.avgVisits}回`
              : seg === 'seikotsu'
              ? `新規${seikotsuSummary.newTotal}人 / 転換${seikotsuSummary.convertedTotal}人`
              : `体験${dietSummary.trialTotal}人 / 成約${dietSummary.contractTotal}人`
            return (
              <button key={seg} onClick={() => setSegment(seg)}
                className={`rounded-xl p-3 text-left transition-all border-2`}
                style={{ borderColor: active ? color : 'transparent', background: active ? `${color}10` : 'white', boxShadow: active ? `0 0 0 2px ${color}20` : '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold" style={{ color }}>{SEGMENT_LABELS[seg]}</span>
                  {active && <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>表示中</span>}
                </div>
                <div className="text-2xl font-bold" style={{ color }}>{rate}<span className="text-sm">%</span></div>
                <div className="text-[10px] text-gray-400 mb-1">{label}（全期間）</div>
                <div className="text-[10px] text-gray-500">{sub}</div>
              </button>
            )
          })}
        </div>

        {/* 全体: 期間選択 */}
        {segment === 'all' && (
          <>
            <div className="flex gap-2 mb-3 flex-wrap">
              {[{ key: 'day', label: '本日' }, { key: 'month', label: '月別' }, { key: 'year', label: '年間' }, { key: 'custom', label: '期間指定' }].map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                    period === p.key ? 'bg-[#14252A] border-[#14252A] text-white' : 'border-gray-200 text-gray-500'
                  }`}>{p.label}</button>
              ))}
            </div>
            <div className="mb-4">
              {period === 'month' && <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />}
              {period === 'year' && <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm">{years.map(y => <option key={y} value={y}>{y}年</option>)}</select>}
              {period === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-gray-400 text-sm">〜</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
                </div>
              )}
            </div>

            {/* 全体サマリ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold" style={{ color: accentColor }}>{avgRepeatRate}<span className="text-xs">%</span></p>
                <p className="text-[10px] text-gray-500">平均リピート率</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{allSummary.total}<span className="text-xs">人</span></p>
                <p className="text-[10px] text-gray-500">期間内患者数</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-green-600">{allSummary.repeater}<span className="text-xs">人</span></p>
                <p className="text-[10px] text-gray-500">リピーター</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-orange-600">{allSummary.avgVisits}<span className="text-xs">回</span></p>
                <p className="text-[10px] text-gray-500">平均来院回数</p>
              </div>
            </div>
          </>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-12">読み込み中...</p>
        ) : (
          <>
            {/* ===== 全体: 月別リピート率 ===== */}
            {segment === 'all' && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center px-4 py-2 bg-gray-50 border-b">
                  <span className="text-xs font-medium text-gray-600">月別リピート率（期間内の既存患者比率）</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 text-xs text-gray-500">月</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">総来院数</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">新規人数</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">新規回数</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">既存人数</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">既存回数</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">リピート率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">データがありません</td></tr>
                      ) : monthlyData.map(d => (
                        <tr key={d.month} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{d.month}</td>
                          <td className="px-3 py-2 text-right">{d.totalVisits}件</td>
                          <td className="px-3 py-2 text-right text-blue-600">{d.newPatients}人</td>
                          <td className="px-3 py-2 text-right text-blue-400">{d.newVisits}件</td>
                          <td className="px-3 py-2 text-right text-green-600">{d.repeatPatients}人</td>
                          <td className="px-3 py-2 text-right text-green-400">{d.repeatVisits}件</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div className="h-2 rounded-full" style={{ width: `${d.repeatRate}%`, background: accentColor }} />
                              </div>
                              <span className="font-medium w-10 text-right">{d.repeatRate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== 整体: 新規→転換率コホート ===== */}
            {segment === 'seikotsu' && (
              <>
                {/* サマリ */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                    <p className="text-2xl sm:text-3xl font-bold" style={{ color: accentColor }}>{seikotsuSummary.rate}<span className="text-xs">%</span></p>
                    <p className="text-[10px] text-gray-500">全期間転換率</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600">{seikotsuSummary.newTotal}<span className="text-xs">人</span></p>
                    <p className="text-[10px] text-gray-500">累計新規患者</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                    <p className="text-2xl sm:text-3xl font-bold text-green-600">{seikotsuSummary.convertedTotal}<span className="text-xs">人</span></p>
                    <p className="text-[10px] text-gray-500">転換済み</p>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg px-4 py-2 mb-4 text-xs text-blue-700">
                  転換 = 新規整体患者が <strong>2回目以降来院</strong> または <strong>回数券・コース購入</strong> した割合（コホート分析）
                </div>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center px-4 py-2 bg-gray-50 border-b">
                    <span className="w-2.5 h-2.5 rounded-full inline-block mr-2" style={{ background: accentColor }} />
                    <span className="text-xs font-medium text-gray-600">整体 新規患者コホート別転換率</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-3 py-2 text-xs text-gray-500">初来院月</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500">新規人数</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500">２回目数</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500 font-bold">２回目リピ率</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500">６回目数</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500 font-bold">６回目リピ率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seikotsuCohorts.map(c => (
                          <tr key={c.month} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{c.month}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{c.newCount}人</td>
                            <td className="px-3 py-2 text-right text-green-600 font-medium">{c.convertedCount}人</td>
                            <td className="px-3 py-2 text-right font-bold" style={{ color: accentColor }}>{c.conversionRate}%</td>
                            <td className="px-3 py-2 text-right text-purple-600 font-medium">{c.reached6Count}人</td>
                            <td className="px-3 py-2 text-right font-bold text-purple-600">{c.rate6}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-bold border-t-2">
                          <td className="px-3 py-2 text-gray-700">合計</td>
                          <td className="px-3 py-2 text-right text-blue-600">{seikotsuSummary.newTotal}人</td>
                          <td className="px-3 py-2 text-right text-green-600">{seikotsuSummary.convertedTotal}人</td>
                          <td className="px-3 py-2 text-right" style={{ color: accentColor }}>{seikotsuSummary.rate}%</td>
                          <td className="px-3 py-2 text-right text-purple-600">{seikotsuCohorts.reduce((s, c) => s + c.reached6Count, 0)}人</td>
                          <td className="px-3 py-2 text-right text-purple-600">{seikotsuSummary.newTotal > 0 ? Math.round(seikotsuCohorts.reduce((s, c) => s + c.reached6Count, 0) / seikotsuSummary.newTotal * 100) : 0}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ===== ダイエット: 体験→成約率コホート ===== */}
            {segment === 'diet' && (
              <>
                {/* サマリ */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                    <p className="text-2xl sm:text-3xl font-bold" style={{ color: accentColor }}>{dietSummary.rate}<span className="text-xs">%</span></p>
                    <p className="text-[10px] text-gray-500">全期間成約率</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600">{dietSummary.trialTotal}<span className="text-xs">人</span></p>
                    <p className="text-[10px] text-gray-500">累計体験人数</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                    <p className="text-2xl sm:text-3xl font-bold text-green-600">{dietSummary.contractTotal}<span className="text-xs">人</span></p>
                    <p className="text-[10px] text-gray-500">成約数</p>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg px-4 py-2 mb-4 text-xs text-green-700">
                  成約 = ダイエット体験カウンセリング後に <strong>パーソナルダイエット・ダイエット半年・ファスティング等</strong> に契約した割合
                </div>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center px-4 py-2 bg-gray-50 border-b">
                    <span className="w-2.5 h-2.5 rounded-full inline-block mr-2" style={{ background: accentColor }} />
                    <span className="text-xs font-medium text-gray-600">ダイエット 体験コホート別成約率</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-3 py-2 text-xs text-gray-500">体験月</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500">体験人数</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500">成約数</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500 font-bold">成約率</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500">６回来院数</th>
                          <th className="text-right px-3 py-2 text-xs text-gray-500 font-bold">６回到達率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dietCohorts.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-gray-400">体験データがありません</td></tr>
                        ) : dietCohorts.map(c => (
                          <tr key={c.month} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{c.month}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{c.trialCount}人</td>
                            <td className="px-3 py-2 text-right text-green-600 font-medium">{c.contractedCount}人</td>
                            <td className="px-3 py-2 text-right font-bold" style={{ color: accentColor }}>{c.contractRate}%</td>
                            <td className="px-3 py-2 text-right text-purple-600 font-medium">{c.visited6Count}人</td>
                            <td className="px-3 py-2 text-right font-bold text-purple-600">{c.rate6}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-bold border-t-2">
                          <td className="px-3 py-2 text-gray-700">合計</td>
                          <td className="px-3 py-2 text-right text-blue-600">{dietSummary.trialTotal}人</td>
                          <td className="px-3 py-2 text-right text-green-600">{dietSummary.contractTotal}人</td>
                          <td className="px-3 py-2 text-right" style={{ color: accentColor }}>{dietSummary.rate}%</td>
                          <td className="px-3 py-2 text-right text-purple-600">{dietCohorts.reduce((s, c) => s + c.visited6Count, 0)}人</td>
                          <td className="px-3 py-2 text-right text-purple-600">{dietSummary.trialTotal > 0 ? Math.round(dietCohorts.reduce((s, c) => s + c.visited6Count, 0) / dietSummary.trialTotal * 100) : 0}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
