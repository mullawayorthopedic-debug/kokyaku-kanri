'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getToday, formatLocalDate } from '@/lib/dateUtils'

interface DayUtilization {
  date: string
  visitCount: number
  maxSlots: number
  utilizationRate: number
}

export default function UtilizationPage() {
  const supabase = createClient()
  const [data, setData] = useState<DayUtilization[]>([])
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(getToday())
  const [endDate, setEndDate] = useState(getToday())
  const [maxSlotsPerDay, setMaxSlotsPerDay] = useState(8) // 1日最大枠数
  const [loading, setLoading] = useState(true)

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      let queryStart: string
      let queryEnd: string

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
      } else {
        queryStart = startDate
        queryEnd = endDate
      }

      const slips = await fetchAllSlips(supabase, 'visit_date', {
        gte: ['visit_date', queryStart],
        lte: ['visit_date', queryEnd],
      }) as { visit_date: string }[]

      if (!slips || slips.length === 0) { setData([]); setLoading(false); return }

      const dayMap: Record<string, number> = {}
      slips.forEach(s => {
        dayMap[s.visit_date] = (dayMap[s.visit_date] || 0) + 1
      })

      // 期間の全日を生成（営業日のみ = 日曜除外）
      const result: DayUtilization[] = []
      const current = new Date(queryStart)
      const end = new Date(queryEnd)
      while (current <= end) {
        const dateStr = formatLocalDate(current)
        const dayOfWeek = current.getDay()
        if (dayOfWeek !== 0) { // 日曜を除外
          const count = dayMap[dateStr] || 0
          result.push({
            date: dateStr,
            visitCount: count,
            maxSlots: maxSlotsPerDay,
            utilizationRate: Math.min(100, Math.round((count / maxSlotsPerDay) * 100)),
          })
        }
        current.setDate(current.getDate() + 1)
      }

      setData(result.reverse())
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate, maxSlotsPerDay])

  const avgRate = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.utilizationRate, 0) / data.length) : 0
  const totalVisits = data.reduce((s, d) => s + d.visitCount, 0)
  const workDays = data.filter(d => d.visitCount > 0).length

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/utilization' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">稼働率分析</h2>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { key: 'day', label: '本日' },
            { key: 'month', label: '月別' },
            { key: 'year', label: '年間' },
            { key: 'custom', label: '期間指定' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
              }`}>{p.label}</button>
          ))}
        </div>

        {/* 期間選択UI */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
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
          <label className="text-xs text-gray-500 ml-2">1日最大枠:</label>
          <input type="number" value={maxSlotsPerDay} onChange={e => setMaxSlotsPerDay(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" min={1} max={20} />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold" style={{ color: '#14252A' }}>{avgRate}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">平均稼働率</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-blue-600">{totalVisits}<span className="text-xs sm:text-sm">件</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">施術数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-green-600">{workDays}<span className="text-xs sm:text-sm">日</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">稼働日数</p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
          {/* モバイル: カード表示 */}
          <div className="sm:hidden space-y-2">
            {data.length === 0 ? (
              <p className="text-center py-8 text-gray-400">データがありません</p>
            ) : data.map(d => (
              <div key={d.date} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                  </span>
                  <span className={`font-bold text-sm ${d.utilizationRate >= 80 ? 'text-green-600' : d.utilizationRate >= 50 ? '' : 'text-red-500'}`}>
                    {d.utilizationRate}%
                  </span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500 mb-1">
                  <span>{d.visitCount}件 / {d.maxSlots}枠</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{
                    width: `${d.utilizationRate}%`,
                    background: d.utilizationRate >= 80 ? '#16a34a' : d.utilizationRate >= 50 ? '#14252A' : '#ef4444'
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500">日付</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">施術数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">最大枠</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">稼働率</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">データがありません</td></tr>
                ) : data.map(d => (
                  <tr key={d.date} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                    </td>
                    <td className="px-3 py-2 text-right">{d.visitCount}件</td>
                    <td className="px-3 py-2 text-right text-gray-400">{d.maxSlots}枠</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{
                            width: `${d.utilizationRate}%`,
                            background: d.utilizationRate >= 80 ? '#16a34a' : d.utilizationRate >= 50 ? '#14252A' : '#ef4444'
                          }} />
                        </div>
                        <span className={`font-medium ${d.utilizationRate >= 80 ? 'text-green-600' : d.utilizationRate >= 50 ? '' : 'text-red-500'}`}>
                          {d.utilizationRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
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
