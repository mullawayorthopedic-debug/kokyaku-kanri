'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { fetchAllSlips } from '@/lib/fetchAll'
import type { Patient, Slip } from '@/lib/types'
import { getClinicId } from '@/lib/clinic'
import { formatLocalDate } from '@/lib/dateUtils'

export default function StatsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [slips, setSlips] = useState<Slip[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const now = new Date()
      let startDate: string

      if (period === 'week') {
        const d = new Date(now)
        d.setDate(d.getDate() - 7)
        startDate = formatLocalDate(d)
      } else if (period === 'month') {
        startDate = now.toISOString().slice(0, 7) + '-01'
      } else {
        startDate = now.getFullYear() + '-01-01'
      }

      const [slipsData, patientsRes] = await Promise.all([
        fetchAllSlips(supabase, '*', { gte: ['visit_date', startDate] }),
        supabase.from('cm_patients').select('*').eq('clinic_id', clinicId),
      ])

      setSlips(slipsData || [])
      setPatients(patientsRes.data || [])
      setLoading(false)
    }
    load()
  }, [period])

  const totalRevenue = slips.reduce((sum, s) => sum + (s.total_price || 0), 0)
  // 通常施術（0円超・50,000円未満）の平均単価
  const normalTreatments = slips.filter(s => (s.total_price || 0) > 0 && (s.total_price || 0) < 50000)
  const normalRevTotal = normalTreatments.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const avgRevenue = normalTreatments.length > 0 ? Math.round(normalRevTotal / normalTreatments.length) : 0
  const uniquePatients = new Set(slips.map(s => s.patient_id)).size

  // 来院経路別
  const referralCounts: Record<string, number> = {}
  patients.forEach(p => {
    if (p.referral_source) {
      referralCounts[p.referral_source] = (referralCounts[p.referral_source] || 0) + 1
    }
  })
  const referralSorted = Object.entries(referralCounts).sort((a, b) => b[1] - a[1])

  // 支払方法別
  const paymentCounts: Record<string, number> = {}
  slips.forEach(s => {
    if (s.payment_method) {
      paymentCounts[s.payment_method] = (paymentCounts[s.payment_method] || 0) + 1
    }
  })

  const statusCounts = {
    active: patients.filter(p => p.status === 'active').length,
    inactive: patients.filter(p => p.status === 'inactive').length,
    completed: patients.filter(p => p.status === 'completed').length,
  }

  return (
    <AppShell>
      <Header title="統計" />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

        {/* 期間選択 */}
        <div className="flex gap-2">
          {[
            { key: 'week', label: '直近1週間' },
            { key: 'month', label: '今月' },
            { key: 'year', label: '今年' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
              }`}
            >{p.label}</button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
            {/* メイン指標 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4" style={{ borderTopColor: '#14252A' }}>
                <p className="text-xs text-gray-400 mb-1">売上合計</p>
                <p className="text-3xl font-bold" style={{ color: '#14252A' }}>{totalRevenue.toLocaleString()}<span className="text-sm font-normal text-gray-400 ml-0.5">円</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4 border-t-blue-500">
                <p className="text-xs text-gray-400 mb-1">施術件数</p>
                <p className="text-3xl font-bold text-blue-600">{slips.length}<span className="text-sm font-normal text-gray-400 ml-0.5">件</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4 border-t-green-500">
                <p className="text-xs text-gray-400 mb-1">施術単価</p>
                <p className="text-3xl font-bold text-green-600">{avgRevenue.toLocaleString()}<span className="text-sm font-normal text-gray-400 ml-0.5">円</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4 border-t-orange-500">
                <p className="text-xs text-gray-400 mb-1">施術患者数</p>
                <p className="text-3xl font-bold text-orange-600">{uniquePatients}<span className="text-sm font-normal text-gray-400 ml-0.5">人</span></p>
              </div>
            </div>

            {/* 患者ステータス */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3">患者ステータス</h3>
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-700">{statusCounts.active}</p>
                  <p className="text-xs text-green-600">通院中</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gray-600">{statusCounts.inactive}</p>
                  <p className="text-xs text-gray-500">休止</p>
                </div>
                <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{statusCounts.completed}</p>
                  <p className="text-xs text-blue-600">卒業</p>
                </div>
              </div>
            </div>

            {/* 来院経路 */}
            {referralSorted.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3">来院経路</h3>
                <div className="space-y-3">
                  {referralSorted.map(([source, count], idx) => {
                    const colors = ['#14252A', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548']
                    const color = colors[idx % colors.length]
                    const pct = Math.round((count / patients.length) * 100)
                    return (
                      <div key={source}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-gray-700">{source}</span>
                          <span className="text-xs font-bold" style={{ color }}>{count}人 ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3">
                          <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 支払方法別 */}
            {Object.keys(paymentCounts).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3">支払方法</h3>
                <div className="flex gap-2.5 flex-wrap">
                  {Object.entries(paymentCounts).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
                    const icons: Record<string, string> = { '現金': '💴', 'カード': '💳', 'QR決済': '📱', '回数券': '🎫', 'その他': '📦' }
                    return (
                      <div key={method} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center shadow-sm hover:shadow-md transition-shadow min-w-[80px]">
                        <div className="text-xl mb-1">{icons[method] || '💰'}</div>
                        <p className="text-xl font-bold" style={{ color: '#14252A' }}>{count}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{method}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
