'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getToday, formatLocalDate } from '@/lib/dateUtils'

interface HourlyData {
  date: string
  totalRevenue: number
  totalMinutes: number
  hourlyRate: number
  visitCount: number
}

export default function HourlyPage() {
  const supabase = createClient()
  const [data, setData] = useState<HourlyData[]>([])
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(getToday())
  const [endDate, setEndDate] = useState(getToday())
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

      const slips = await fetchAllSlips(supabase, 'visit_date, total_price, duration_minutes', {
        gte: ['visit_date', queryStart],
        lte: ['visit_date', queryEnd],
      }) as { visit_date: string; total_price: number; duration_minutes: number }[]

      if (!slips || slips.length === 0) { setData([]); setLoading(false); return }

      const dayMap: Record<string, { revenue: number, count: number, minutes: number }> = {}
      slips.forEach(s => {
        if (!dayMap[s.visit_date]) dayMap[s.visit_date] = { revenue: 0, count: 0, minutes: 0 }
        dayMap[s.visit_date].revenue += s.total_price || 0
        dayMap[s.visit_date].count++
        dayMap[s.visit_date].minutes += s.duration_minutes || 30
      })

      const result: HourlyData[] = Object.entries(dayMap)
        .map(([date, d]) => ({
            date,
            totalRevenue: d.revenue,
            totalMinutes: d.minutes,
            hourlyRate: d.minutes > 0 ? Math.round((d.revenue / d.minutes) * 60) : 0,
            visitCount: d.count,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))

      setData(result)
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const avgHourlyRate = data.length > 0
    ? Math.round(data.reduce((sum, d) => sum + d.hourlyRate, 0) / data.length)
    : 0
  const totalRevenue = data.reduce((sum, d) => sum + d.totalRevenue, 0)

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/hourly' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">時間単価分析</h2>

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

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{avgHourlyRate.toLocaleString()}<span className="text-xs sm:text-sm">円/h</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">平均時間単価</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">売上合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{data.reduce((s, d) => s + d.visitCount, 0)}<span className="text-xs sm:text-sm">件</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">施術数</p>
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
                <div className="flex justify-between items-center">
                  <span className="text-sm">
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                  </span>
                  <span className="font-bold text-sm" style={{ color: '#14252A' }}>{d.hourlyRate.toLocaleString()}円/h</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{d.visitCount}件</span>
                  <span>{d.totalRevenue.toLocaleString()}円</span>
                  <span>{Math.round(d.totalMinutes / 60 * 10) / 10}h</span>
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
                  <th className="text-right px-3 py-2 text-xs text-gray-500">売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">稼働時間</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">時間単価</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">データがありません</td></tr>
                ) : data.map(d => (
                  <tr key={d.date} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                    </td>
                    <td className="px-3 py-2 text-right">{d.visitCount}件</td>
                    <td className="px-3 py-2 text-right font-medium">{d.totalRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right">{Math.round(d.totalMinutes / 60 * 10) / 10}h</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: '#14252A' }}>{d.hourlyRate.toLocaleString()}円/h</td>
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
