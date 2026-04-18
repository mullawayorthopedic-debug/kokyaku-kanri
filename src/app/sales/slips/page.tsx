'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import type { Slip } from '@/lib/types'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getToday, formatLocalDate } from '@/lib/dateUtils'

export default function SlipsPage() {
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
        queryStart = startDate
        queryEnd = endDate
      }

      const data = await fetchAllSlips(supabase, '*', {
        gte: ['visit_date', queryStart],
        lte: ['visit_date', queryEnd],
      }) as Slip[]

      // fetchAllSlipsはid昇順なので、visit_date降順にソート
      data.sort((a, b) => b.visit_date.localeCompare(a.visit_date))

      setSlips(data || [])
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const totalAmount = slips.reduce((sum, s) => sum + (s.total_price || 0), 0)

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales/slips' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 text-lg">伝票一覧</h2>
          <Link href="/visits/import" className="px-4 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            📥 CSV取込
          </Link>
        </div>

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

        <div className="bg-blue-50 rounded-lg p-3 mb-4 flex justify-between items-center">
          <span className="text-sm text-gray-700">{slips.length}件の伝票</span>
          <span className="font-bold text-lg" style={{ color: '#14252A' }}>{totalAmount.toLocaleString()}円</span>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
          <div className="sm:hidden space-y-2">
            {slips.length === 0 ? (
              <p className="text-center py-8 text-gray-400">データがありません</p>
            ) : slips.map(s => (
              <div key={s.id} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{s.patient_name || '-'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.staff_name || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{(s.total_price || 0).toLocaleString()}円</p>
                    {s.base_price > 0 && <p className="text-[10px] text-gray-400">基本 {s.base_price.toLocaleString()}円</p>}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(s.visit_date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 text-xs text-gray-500">日付</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">患者名</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">基本</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">オプション</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">合計</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">担当</th>
                  </tr>
                </thead>
                <tbody>
                  {slips.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">データがありません</td></tr>
                  ) : slips.map(s => (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(s.visit_date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                      </td>
                      <td className="px-3 py-2 font-medium">{s.patient_name || '-'}</td>
                      <td className="px-3 py-2 text-right">{s.base_price > 0 ? `${s.base_price.toLocaleString()}円` : '-'}</td>
                      <td className="px-3 py-2 text-right">{s.option_price > 0 ? `${s.option_price.toLocaleString()}円` : '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">{(s.total_price || 0).toLocaleString()}円</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{s.staff_name || '-'}</td>
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
