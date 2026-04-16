'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { fetchAllSlips } from '@/lib/fetchAll'
import { saleTabs } from '@/lib/saleTabs'

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

interface SlipDetail {
  patient_name: string
  total_price: number
  payment_method: string | null
  isNew: boolean
}

interface DayRow {
  date: string // YYYY-MM-DD
  revenue: number
  cash: number
  credit: number
  qr: number
  paypay: number
  visits: number
  newPatients: number
  repeat: number
  slips: SlipDetail[]
}

export default function DailyReportPage() {
  const supabase = createClient()
  const today = new Date()
  const defaultMonth = today.toISOString().slice(0, 7)

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const [rows, setRows] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const [year, month] = selectedMonth.split('-').map(Number)
      const firstDay = `${selectedMonth}-01`
      const lastDate = new Date(year, month, 0)
      const lastDay = `${selectedMonth}-${String(lastDate.getDate()).padStart(2, '0')}`

      // Fetch slips for the selected month
      const monthSlips = await fetchAllSlips(supabase, 'id,patient_id,patient_name,visit_date,total_price,payment_method', {
        gte: ['visit_date', firstDay],
        lte: ['visit_date', lastDay],
      })

      // Fetch all slips to compute first-ever visit per patient
      const allSlips = await fetchAllSlips(supabase, 'patient_id,visit_date')

      // Compute minDate per patient
      const minDate: Record<string, string> = {}
      for (const s of allSlips) {
        if (!s.patient_id) continue
        if (!minDate[s.patient_id] || s.visit_date < minDate[s.patient_id]) {
          minDate[s.patient_id] = s.visit_date
        }
      }

      // Group by date
      const byDate: Record<string, DayRow> = {}
      for (const s of monthSlips) {
        const d = s.visit_date as string
        if (!byDate[d]) {
          byDate[d] = { date: d, revenue: 0, cash: 0, credit: 0, qr: 0, paypay: 0, visits: 0, newPatients: 0, repeat: 0, slips: [] }
        }
        const row = byDate[d]
        row.revenue += s.total_price || 0
        if (s.payment_method === '現金') row.cash += s.total_price || 0
        if (s.payment_method === 'カード') row.credit += s.total_price || 0
        if (s.payment_method === 'QR決済') row.qr += s.total_price || 0
        if (s.payment_method === 'PayPay') row.paypay += s.total_price || 0
        row.visits++
        const isNew = s.patient_id && minDate[s.patient_id] === d
        if (isNew) {
          row.newPatients++
        } else {
          row.repeat++
        }
        row.slips.push({
          patient_name: s.patient_name || '不明',
          total_price: s.total_price || 0,
          payment_method: s.payment_method || null,
          isNew: !!isNew,
        })
      }

      const sorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
      setRows(sorted)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const dd = String(d.getDate()).padStart(2, '0')
    const dow = DOW_JA[d.getDay()]
    return `${dd}(${dow})`
  }

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const fmt = (n: number) => n === 0 ? '-' : n.toLocaleString()
  const fmtNum = (n: number) => n === 0 ? '-' : n.toLocaleString()

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cash: acc.cash + r.cash,
      credit: acc.credit + r.credit,
      qr: acc.qr + r.qr,
      paypay: acc.paypay + r.paypay,
      visits: acc.visits + r.visits,
      newPatients: acc.newPatients + r.newPatients,
      repeat: acc.repeat + r.repeat,
    }),
    { revenue: 0, cash: 0, credit: 0, qr: 0, paypay: 0, visits: 0, newPatients: 0, repeat: 0 }
  )

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* タブ */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales/daily-report' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">日報集計</h2>

        {/* Month picker */}
        <div className="mb-4">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">この月のデータはありません</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#14252A] text-white text-xs">
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">日（曜日）</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">売上</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">現金</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">クレジット</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">QR</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">PayPay</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">客数</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">新規</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">リピート</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isExpanded = expandedDates.has(row.date)
                    return (
                      <React.Fragment key={row.date}>
                        <tr
                          className={`cursor-pointer hover:bg-teal-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                          onClick={() => toggleDate(row.date)}
                        >
                          <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">
                            <span className="inline-block w-4 text-xs text-gray-400 mr-1">{isExpanded ? '▼' : '▶'}</span>
                            {formatDay(row.date)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{fmt(row.revenue)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(row.cash)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(row.credit)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(row.qr)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(row.paypay)}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmtNum(row.visits)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.newPatients > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {fmtNum(row.newPatients)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmtNum(row.repeat)}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <div className="bg-gray-50 border-y border-gray-200 px-4 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-1 px-2 font-medium">顧客名</th>
                                      <th className="text-right py-1 px-2 font-medium">金額</th>
                                      <th className="text-center py-1 px-2 font-medium">支払い方法</th>
                                      <th className="text-center py-1 px-2 font-medium">区分</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.slips.map((slip, j) => (
                                      <tr key={j} className="border-t border-gray-100">
                                        <td className="py-1.5 px-2 text-gray-700">{slip.patient_name}</td>
                                        <td className="py-1.5 px-2 text-right text-gray-700 tabular-nums">
                                          {slip.total_price > 0 ? slip.total_price.toLocaleString() + '円' : '-'}
                                        </td>
                                        <td className="py-1.5 px-2 text-center text-gray-600">
                                          {slip.payment_method || '-'}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            slip.isNew ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                          }`}>
                                            {slip.isNew ? '新規' : 'リピート'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                  {/* Totals row */}
                  <tr className="bg-[#14252A] text-white font-bold">
                    <td className="px-3 py-2.5 whitespace-nowrap">合計</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.revenue.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.cash.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.credit.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.qr.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.paypay.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.visits.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.newPatients.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totals.repeat.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
