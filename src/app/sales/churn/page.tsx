'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId } from '@/lib/clinic'

interface ChurnPatient {
  id: string
  name: string
  furigana: string | null
  status: string
  status_date: string | null
  status_reason: string | null
  customer_category: string | null
  first_visit_date: string | null
}

export default function ChurnPage() {
  const supabase = createClient()
  const clinicId = getClinicId()

  const today = new Date()
  const defaultMonth = today.toISOString().slice(0, 7)

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const [filter, setFilter] = useState<'all' | 'inactive' | 'completed'>('all')
  const [patients, setPatients] = useState<ChurnPatient[]>([])
  const [loading, setLoading] = useState(true)

  // 月別集計
  const [monthlySummary, setMonthlySummary] = useState<{ month: string; dropouts: number; graduations: number }[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // 離脱・卒業患者を取得
      let query = supabase.from('cm_patients')
        .select('id, name, furigana, status, status_date, status_reason, customer_category, first_visit_date')
        .eq('clinic_id', clinicId)
        .in('status', ['inactive', 'completed'])
        .order('status_date', { ascending: false })

      if (filter === 'inactive') {
        query = supabase.from('cm_patients')
          .select('id, name, furigana, status, status_date, status_reason, customer_category, first_visit_date')
          .eq('clinic_id', clinicId)
          .eq('status', 'inactive')
          .order('status_date', { ascending: false })
      } else if (filter === 'completed') {
        query = supabase.from('cm_patients')
          .select('id, name, furigana, status, status_date, status_reason, customer_category, first_visit_date')
          .eq('clinic_id', clinicId)
          .eq('status', 'completed')
          .order('status_date', { ascending: false })
      }

      const { data } = await query
      setPatients(data || [])

      // 月別集計（過去12ヶ月）
      const allRes = await supabase.from('cm_patients')
        .select('status, status_date')
        .eq('clinic_id', clinicId)
        .in('status', ['inactive', 'completed'])
        .not('status_date', 'is', null)

      const allData = allRes.data || []
      const months: { month: string; dropouts: number; graduations: number }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const m = d.toISOString().slice(0, 7)
        const dropouts = allData.filter(p => p.status === 'inactive' && p.status_date?.startsWith(m)).length
        const graduations = allData.filter(p => p.status === 'completed' && p.status_date?.startsWith(m)).length
        months.push({ month: m, dropouts, graduations })
      }
      setMonthlySummary(months)
      setLoading(false)
    }
    load()
  }, [filter])

  // 選択月でフィルタした患者
  const monthPatients = patients.filter(p => p.status_date?.startsWith(selectedMonth))
  const allMonthPatients = patients

  const dropoutCount = patients.filter(p => p.status === 'inactive').length
  const graduationCount = patients.filter(p => p.status === 'completed').length

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* タブ */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-2 border-b border-gray-200">
          {saleTabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales/churn' ? 'bg-[#14252A] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <h1 className="text-lg font-bold text-gray-800 mb-4">離脱・卒業一覧</h1>

        {/* 統計カード */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-gray-400">
            <p className="text-2xl font-bold text-gray-700">{dropoutCount + graduationCount}</p>
            <p className="text-xs text-gray-500 mt-1">合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-red-500">
            <p className="text-2xl font-bold text-red-600">{dropoutCount}</p>
            <p className="text-xs text-gray-500 mt-1">離脱</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-blue-500">
            <p className="text-2xl font-bold text-blue-600">{graduationCount}</p>
            <p className="text-xs text-gray-500 mt-1">卒業</p>
          </div>
        </div>

        {/* 月別推移 */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
          <h2 className="font-bold text-sm text-gray-800 mb-3">月別推移（過去12ヶ月）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">月</th>
                  <th className="text-right py-2 px-2 text-red-500 font-medium">離脱</th>
                  <th className="text-right py-2 px-2 text-blue-500 font-medium">卒業</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">合計</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map(row => (
                  <tr key={row.month} className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                    row.month === selectedMonth ? 'bg-blue-50' : ''
                  }`}
                    onClick={() => setSelectedMonth(row.month)}
                  >
                    <td className="py-2 px-2 font-medium text-gray-700">{row.month}</td>
                    <td className="py-2 px-2 text-right text-red-600 font-bold">{row.dropouts || '-'}</td>
                    <td className="py-2 px-2 text-right text-blue-600 font-bold">{row.graduations || '-'}</td>
                    <td className="py-2 px-2 text-right text-gray-700 font-bold">{row.dropouts + row.graduations || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* フィルタ */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === 'all' ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>すべて</button>
          <button onClick={() => setFilter('inactive')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === 'inactive' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
            }`}>離脱のみ</button>
          <button onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === 'completed' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}>卒業のみ</button>
        </div>

        {/* 患者一覧 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-sm text-gray-800 mb-3">
            {selectedMonth} の{filter === 'inactive' ? '離脱' : filter === 'completed' ? '卒業' : '離脱・卒業'}患者
            <span className="text-gray-400 font-normal ml-2">（{monthPatients.length}名）</span>
          </h2>

          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>
          ) : monthPatients.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">該当する患者はいません</p>
          ) : (
            <div className="space-y-2">
              {monthPatients.map(p => (
                <Link key={p.id} href={`/patients/${p.id}`}
                  className={`block border rounded-lg p-3 hover:shadow-sm transition-all ${
                    p.status === 'inactive' ? 'border-red-100 bg-red-50/30 hover:bg-red-50' : 'border-blue-100 bg-blue-50/30 hover:bg-blue-50'
                  }`}>
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.status === 'inactive' ? 'bg-red-500' : 'bg-blue-500'}`} />
                      <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                      {p.furigana && <span className="text-[10px] text-gray-400 truncate">{p.furigana}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.customer_category && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          p.customer_category === 'ダイエット' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                        }`}>{p.customer_category}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        p.status === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>{p.status === 'inactive' ? '離脱' : '卒業'}</span>
                      {p.status_date && <span className="text-[10px] text-gray-500">{p.status_date}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* 全期間一覧 */}
          {!loading && allMonthPatients.length > monthPatients.length && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 mb-2">全期間（{allMonthPatients.length}名）</h3>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {allMonthPatients.map(p => (
                  <Link key={p.id} href={`/patients/${p.id}`}
                    className="block border border-gray-100 rounded-lg p-2.5 hover:bg-gray-50">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.status === 'inactive' ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <p className="text-xs font-bold text-gray-800 truncate">{p.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          p.status === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                        }`}>{p.status === 'inactive' ? '離脱' : '卒業'}</span>
                        {p.status_date && <span className="text-[10px] text-gray-400">{p.status_date}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
