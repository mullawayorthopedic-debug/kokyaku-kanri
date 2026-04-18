'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getClinicId } from '@/lib/clinic'
import { getToday, formatLocalDate } from '@/lib/dateUtils'

// ====== 集計軸の定義 ======
type AxisKey = 'gender' | 'age_group' | 'referral_source' | 'visit_motive' | 'occupation'
  | 'chief_complaint' | 'customer_category' | 'prefecture' | 'status'
  | 'staff_name' | 'menu_name'

interface AxisOption {
  key: AxisKey
  label: string
  source: 'patient' | 'slip'
}

const axisOptions: AxisOption[] = [
  { key: 'gender', label: '性別', source: 'patient' },
  { key: 'age_group', label: '年齢層', source: 'patient' },
  { key: 'referral_source', label: '来院経路', source: 'patient' },
  { key: 'visit_motive', label: '来院動機', source: 'patient' },
  { key: 'chief_complaint', label: '主訴・症状', source: 'patient' },
  { key: 'occupation', label: '職業', source: 'patient' },
  { key: 'customer_category', label: '顧客カテゴリ', source: 'patient' },
  { key: 'prefecture', label: '都道府県', source: 'patient' },
  { key: 'status', label: 'ステータス', source: 'patient' },
  { key: 'staff_name', label: '担当者', source: 'slip' },
  { key: 'menu_name', label: 'メニュー', source: 'slip' },
]

function getAgeGroup(birthDate: string | null): string {
  if (!birthDate) return '不明'
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  if (age < 10) return '10歳未満'
  if (age < 20) return '10代'
  if (age < 30) return '20代'
  if (age < 40) return '30代'
  if (age < 50) return '40代'
  if (age < 60) return '50代'
  if (age < 70) return '60代'
  if (age < 80) return '70代'
  return '80歳以上'
}

function getStatusLabel(status: string): string {
  if (status === 'active') return '通院中'
  if (status === 'completed') return '卒業'
  if (status === 'inactive') return '休止'
  return status || '不明'
}

function normalizeComplaint(complaint: string | null): string {
  if (!complaint) return '不明'
  const trimmed = complaint.trim()
  if (trimmed.length === 0) return '不明'
  const first = trimmed.split(/[、,\/　\s]+/)[0]
  return first.length > 10 ? first.slice(0, 10) + '…' : first
}

interface CellData {
  count: number
  revenue: number
  patients: Set<string>
}

export default function CrossPage() {
  const supabase = createClient()
  const clinicId = getClinicId()

  const [rowAxis, setRowAxis] = useState<AxisKey>('referral_source')
  const [colAxis, setColAxis] = useState<AxisKey>('gender')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(getToday())
  const [endDate, setEndDate] = useState(getToday())
  const [metric, setMetric] = useState<'count' | 'revenue' | 'avgRevenue' | 'patients'>('count')

  const [slips, setSlips] = useState<{ patient_id: string; total_price: number; staff_name: string; menu_name: string }[]>([])
  const [patients, setPatients] = useState<Record<string, {
    gender: string; birth_date: string | null; referral_source: string; visit_motive: string
    occupation: string; chief_complaint: string; customer_category: string; prefecture: string; status: string
  }>>({})

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      let queryStart: string | null = null
      let queryEnd: string | null = null

      if (period === 'day') {
        queryStart = getToday()
        queryEnd = queryStart
      } else if (period === 'month') {
        queryStart = selectedMonth + '-01'
        const d = new Date(queryStart)
        d.setMonth(d.getMonth() + 1)
        d.setDate(0)
        queryEnd = formatLocalDate(d)
      } else if (period === 'year') {
        queryStart = selectedYear + '-01-01'
        queryEnd = selectedYear + '-12-31'
      } else if (period === 'custom') {
        queryStart = startDate
        queryEnd = endDate
      }

      const filters: Record<string, [string, string]> = {}
      if (queryStart) filters.gte = ['visit_date', queryStart]
      if (queryEnd) filters.lte = ['visit_date', queryEnd]

      const slipData = await fetchAllSlips(
        supabase,
        'patient_id, total_price, staff_name, menu_name',
        Object.keys(filters).length > 0 ? filters : undefined,
      ) as { patient_id: string; total_price: number; staff_name: string; menu_name: string }[]

      const PAGE_SIZE = 1000
      let allPatients: { id: string; gender: string; birth_date: string | null; referral_source: string; visit_motive: string; occupation: string; chief_complaint: string; customer_category: string; prefecture: string; status: string }[] = []
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const { data } = await supabase
          .from('cm_patients')
          .select('id, gender, birth_date, referral_source, visit_motive, occupation, chief_complaint, customer_category, prefecture, status')
          .eq('clinic_id', clinicId)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (!data) break
        allPatients = allPatients.concat(data)
        hasMore = data.length === PAGE_SIZE
        offset += PAGE_SIZE
      }

      const patientMap: Record<string, typeof allPatients[0]> = {}
      allPatients.forEach(p => { patientMap[p.id] = p })

      setSlips(slipData || [])
      setPatients(patientMap)
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const getAxisValue = (axis: AxisKey, slip: typeof slips[0]): string => {
    const axisOpt = axisOptions.find(a => a.key === axis)!
    if (axisOpt.source === 'slip') {
      if (axis === 'staff_name') return slip.staff_name || '不明'
      if (axis === 'menu_name') return slip.menu_name || '不明'
    }
    const patient = slip.patient_id ? patients[slip.patient_id] : null
    if (!patient) return '不明'
    if (axis === 'age_group') return getAgeGroup(patient.birth_date)
    if (axis === 'status') return getStatusLabel(patient.status)
    if (axis === 'chief_complaint') return normalizeComplaint(patient.chief_complaint)
    return (patient[axis as keyof typeof patient] as string) || '不明'
  }

  // === Matrix results ===
  const matrixData = useMemo(() => {
    const cells: Record<string, Record<string, CellData>> = {}
    const rowTotals: Record<string, CellData> = {}
    const colTotals: Record<string, CellData> = {}
    const grandTotal: CellData = { count: 0, revenue: 0, patients: new Set() }

    slips.forEach(s => {
      const rowKey = getAxisValue(rowAxis, s)
      const colKey = getAxisValue(colAxis, s)

      if (!cells[rowKey]) cells[rowKey] = {}
      if (!cells[rowKey][colKey]) cells[rowKey][colKey] = { count: 0, revenue: 0, patients: new Set() }
      cells[rowKey][colKey].count++
      cells[rowKey][colKey].revenue += s.total_price || 0
      if (s.patient_id) cells[rowKey][colKey].patients.add(s.patient_id)

      if (!rowTotals[rowKey]) rowTotals[rowKey] = { count: 0, revenue: 0, patients: new Set() }
      rowTotals[rowKey].count++
      rowTotals[rowKey].revenue += s.total_price || 0
      if (s.patient_id) rowTotals[rowKey].patients.add(s.patient_id)

      if (!colTotals[colKey]) colTotals[colKey] = { count: 0, revenue: 0, patients: new Set() }
      colTotals[colKey].count++
      colTotals[colKey].revenue += s.total_price || 0
      if (s.patient_id) colTotals[colKey].patients.add(s.patient_id)

      grandTotal.count++
      grandTotal.revenue += s.total_price || 0
      if (s.patient_id) grandTotal.patients.add(s.patient_id)
    })

    const rows = Object.keys(rowTotals).sort((a, b) => rowTotals[b].revenue - rowTotals[a].revenue)
    const cols = Object.keys(colTotals).sort((a, b) => colTotals[b].revenue - colTotals[a].revenue)

    return { rows, cols, cells, rowTotals, colTotals, grandTotal }
  }, [slips, patients, rowAxis, colAxis])

  const getCellValue = (cell: CellData | undefined): string => {
    if (!cell) return '-'
    if (metric === 'count') return cell.count.toLocaleString()
    if (metric === 'revenue') return cell.revenue.toLocaleString() + '円'
    if (metric === 'avgRevenue') return cell.count > 0 ? Math.round(cell.revenue / cell.count).toLocaleString() + '円' : '-'
    return cell.patients.size.toLocaleString()
  }

  const getCellNumber = (cell: CellData | undefined): number => {
    if (!cell) return 0
    if (metric === 'count') return cell.count
    if (metric === 'revenue') return cell.revenue
    if (metric === 'avgRevenue') return cell.count > 0 ? Math.round(cell.revenue / cell.count) : 0
    return cell.patients.size
  }

  const getHeatBg = (value: number, max: number): string => {
    if (max === 0 || value === 0) return ''
    const ratio = value / max
    if (ratio > 0.7) return 'rgba(20,37,42,0.2)'
    if (ratio > 0.4) return 'rgba(20,37,42,0.12)'
    if (ratio > 0.15) return 'rgba(20,37,42,0.06)'
    return ''
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/cross' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">クロス集計</h2>

        {/* 期間フィルター */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {[
            { key: 'all', label: '全期間' },
            { key: 'day', label: '本日' },
            { key: 'month', label: '月別' },
            { key: 'year', label: '年間' },
            { key: 'custom', label: '期間指定' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
              }`}>{p.label}</button>
          ))}
        </div>

        <div className="mb-4">
          {period === 'month' && (
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
          )}
          {period === 'year' && (
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          )}
          {period === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
              <span className="text-gray-400 text-sm">〜</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
            </div>
          )}
        </div>

        {/* 軸選択 */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="mb-3">
            <span className="text-xs text-gray-500 font-medium mr-2">行軸:</span>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {axisOptions.map(a => (
                <button key={a.key} onClick={() => { setRowAxis(a.key); if (a.key === colAxis) setColAxis(axisOptions.find(o => o.key !== a.key)!.key) }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    rowAxis === a.key ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{a.label}</button>
              ))}
            </div>
          </div>

          <div className="mb-3 border-t pt-3">
            <span className="text-xs text-gray-500 font-medium mr-2">列軸:</span>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {axisOptions.filter(a => a.key !== rowAxis).map(a => (
                <button key={a.key} onClick={() => setColAxis(a.key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    colAxis === a.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{a.label}</button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <span className="text-xs text-gray-500 font-medium mr-2">表示値:</span>
            <div className="flex gap-1.5 mt-1">
              {([
                { key: 'count' as const, label: '件数' },
                { key: 'revenue' as const, label: '売上' },
                { key: 'avgRevenue' as const, label: '平均単価' },
                { key: 'patients' as const, label: '患者数' },
              ]).map(m => (
                <button key={m.key} onClick={() => setMetric(m.key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    metric === m.key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : matrixData.rows.length === 0 ? (
          <p className="text-center py-8 text-gray-400">データがありません</p>
        ) : (
          <>
            {/* サマリー */}
            <div className="bg-blue-50 rounded-lg p-3 mb-4 flex flex-wrap gap-4 text-xs text-gray-600">
              <span>行: <strong>{axisOptions.find(a => a.key === rowAxis)?.label}</strong>（{matrixData.rows.length}種）</span>
              <span>列: <strong>{axisOptions.find(a => a.key === colAxis)?.label}</strong>（{matrixData.cols.length}種）</span>
              <span>総件数: <strong>{matrixData.grandTotal.count.toLocaleString()}</strong></span>
              <span>総売上: <strong>{matrixData.grandTotal.revenue.toLocaleString()}円</strong></span>
            </div>

            {/* モバイル: カード表示 */}
            <div className="sm:hidden space-y-3">
              {matrixData.rows.map(row => (
                <div key={row} className="bg-white rounded-xl shadow-sm p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-sm">{row}</span>
                    <span className="text-xs text-gray-500">
                      計 {getCellValue(matrixData.rowTotals[row])}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {matrixData.cols.map(col => {
                      const cell = matrixData.cells[row]?.[col]
                      if (!cell || getCellNumber(cell) === 0) return null
                      return (
                        <div key={col} className="bg-gray-50 rounded px-2 py-1 flex justify-between">
                          <span className="text-[10px] text-gray-500 truncate">{col}</span>
                          <span className="text-[10px] font-medium ml-1">{getCellValue(cell)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* PC: マトリクステーブル */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-2 py-2 text-gray-500 font-medium sticky left-0 bg-gray-50 z-10 min-w-[100px]">
                        {axisOptions.find(a => a.key === rowAxis)?.label} ＼ {axisOptions.find(a => a.key === colAxis)?.label}
                      </th>
                      {matrixData.cols.map(col => (
                        <th key={col} className="text-right px-2 py-2 text-gray-500 font-medium whitespace-nowrap min-w-[70px]">
                          {col}
                        </th>
                      ))}
                      <th className="text-right px-2 py-2 text-gray-700 font-bold bg-gray-100 min-w-[70px]">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let maxVal = 0
                      matrixData.rows.forEach(row => {
                        matrixData.cols.forEach(col => {
                          const v = getCellNumber(matrixData.cells[row]?.[col])
                          if (v > maxVal) maxVal = v
                        })
                      })

                      return matrixData.rows.map(row => (
                        <tr key={row} className="border-b hover:bg-gray-50/50">
                          <td className="px-2 py-1.5 font-medium sticky left-0 bg-white z-10 border-r">{row}</td>
                          {matrixData.cols.map(col => {
                            const cell = matrixData.cells[row]?.[col]
                            const val = getCellNumber(cell)
                            return (
                              <td key={col} className="px-2 py-1.5 text-right"
                                style={{ backgroundColor: getHeatBg(val, maxVal) }}>
                                {val > 0 ? getCellValue(cell) : <span className="text-gray-300">-</span>}
                              </td>
                            )
                          })}
                          <td className="px-2 py-1.5 text-right font-bold bg-gray-50 border-l">
                            {getCellValue(matrixData.rowTotals[row])}
                          </td>
                        </tr>
                      ))
                    })()}
                    <tr className="bg-gray-100 font-bold border-t-2">
                      <td className="px-2 py-2 sticky left-0 bg-gray-100 z-10">合計</td>
                      {matrixData.cols.map(col => (
                        <td key={col} className="px-2 py-2 text-right">
                          {getCellValue(matrixData.colTotals[col])}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right bg-gray-200">
                        {getCellValue(matrixData.grandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
