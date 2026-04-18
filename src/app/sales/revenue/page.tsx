'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { fetchAllSlips } from '@/lib/fetchAll'
import type { Slip } from '@/lib/types'
import { saleTabs } from '@/lib/saleTabs'
import { getToday, formatLocalDate } from '@/lib/dateUtils'

export default function RevenuePage() {
  const supabase = createClient()
  const [slips, setSlips] = useState<Slip[]>([])
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(getToday())
  const [endDate, setEndDate] = useState(getToday())
  const [loading, setLoading] = useState(true)

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
        // カスタム期間
        queryStart = startDate
        queryEnd = endDate
      }

      const data = await fetchAllSlips(supabase, '*', {
        gte: ['visit_date', queryStart],
        lte: ['visit_date', queryEnd],
      })

      setSlips(data || [])
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const totalRevenue = slips.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const visitCount = slips.length

  // 通常施術（0円超・50,000円未満）の平均単価
  const normalTreatments = slips.filter(s => (s.total_price || 0) > 0 && (s.total_price || 0) < 50000)
  const normalRevenue = normalTreatments.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const avgTreatmentPrice = normalTreatments.length > 0 ? Math.round(normalRevenue / normalTreatments.length) : 0

  // 回数券購入（50,000円以上）
  const ticketPurchases = slips.filter(s => (s.total_price || 0) >= 50000)
  const ticketRevenue = ticketPurchases.reduce((sum, s) => sum + (s.total_price || 0), 0)

  // 0円の来院（回数券利用）
  const freeVisits = slips.filter(s => (s.total_price || 0) === 0)

  const dailyRevenue: Record<string, { count: number; amount: number }> = {}
  slips.forEach(s => {
    if (!dailyRevenue[s.visit_date]) dailyRevenue[s.visit_date] = { count: 0, amount: 0 }
    dailyRevenue[s.visit_date].count++
    dailyRevenue[s.visit_date].amount += s.total_price || 0
  })

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales/revenue' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">売上集計</h2>

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

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
            {/* メイン指標 */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
              <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
                <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{totalRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
                <p className="text-[10px] sm:text-xs text-gray-500">売上合計</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
                <p className="text-lg sm:text-2xl font-bold text-blue-600">{visitCount}<span className="text-xs sm:text-sm">件</span></p>
                <p className="text-[10px] sm:text-xs text-gray-500">来院数</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
                <p className="text-lg sm:text-2xl font-bold text-green-600">{avgTreatmentPrice.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
                <p className="text-[10px] sm:text-xs text-gray-500">施術単価</p>
              </div>
            </div>

            {/* 内訳 */}
            <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 mb-4">
              <h3 className="font-bold text-gray-800 text-xs mb-2">内訳</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-blue-50 rounded-lg p-2">
                  <p className="text-sm sm:text-base font-bold text-blue-700">{normalTreatments.length}<span className="text-[10px] sm:text-xs">件</span></p>
                  <p className="text-[10px] sm:text-xs text-blue-600">通常施術</p>
                  <p className="text-[10px] text-blue-500">{normalRevenue.toLocaleString()}円</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-2">
                  <p className="text-sm sm:text-base font-bold text-purple-700">{ticketPurchases.length}<span className="text-[10px] sm:text-xs">件</span></p>
                  <p className="text-[10px] sm:text-xs text-purple-600">回数券購入</p>
                  <p className="text-[10px] text-purple-500">{ticketRevenue.toLocaleString()}円</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-sm sm:text-base font-bold text-gray-600">{freeVisits.length}<span className="text-[10px] sm:text-xs">件</span></p>
                  <p className="text-[10px] sm:text-xs text-gray-500">回数券利用</p>
                  <p className="text-[10px] text-gray-400">0円</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
              <div className="p-4 border-b">
                <h3 className="font-bold text-gray-800 text-sm">日別売上</h3>
              </div>
              {Object.keys(dailyRevenue).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">データがありません</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 sm:px-4 py-2 text-xs text-gray-500">日付</th>
                      <th className="text-right px-3 sm:px-4 py-2 text-xs text-gray-500">施術数</th>
                      <th className="text-right px-3 sm:px-4 py-2 text-xs text-gray-500">売上</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dailyRevenue).sort(([a], [b]) => b.localeCompare(a)).map(([date, data]) => (
                      <tr key={date} className="border-b hover:bg-gray-50">
                        <td className="px-3 sm:px-4 py-2">
                          {new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                        </td>
                        <td className="px-3 sm:px-4 py-2 text-right">{data.count}件</td>
                        <td className="px-3 sm:px-4 py-2 text-right font-medium">{data.amount.toLocaleString()}円</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
