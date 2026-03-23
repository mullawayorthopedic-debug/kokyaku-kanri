'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import type { Patient, Slip } from '@/lib/types'

interface TodaySlip extends Slip {
  patient?: Patient
}

type PaymentMethod = '現金' | 'カード' | 'QR決済' | 'PayPay' | '回数券' | 'その他'
const PAYMENT_METHODS: PaymentMethod[] = ['現金', 'カード', 'QR決済', 'PayPay', '回数券', 'その他']

const paymentStyle: Record<string, { label: string; bg: string; text: string; border: string }> = {
  '現金':   { label: '💴 現金',   bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
  'カード': { label: '💳 カード', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  'QR決済': { label: '📱 QR',    bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'PayPay': { label: '🟡 PayPay', bg: 'bg-red-50',   text: 'text-red-600',   border: 'border-red-200' },
  '回数券': { label: '🎟️ 回数券', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  'その他': { label: '🔖 その他', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
}

function PaymentBadge({ slipId, current, onUpdate }: {
  slipId: string
  current: string | null
  onUpdate: (id: string, method: PaymentMethod) => void
}) {
  const [open, setOpen] = useState(false)
  const style = paymentStyle[current || ''] || { label: '- 未設定', bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' }

  return (
    <div className="relative">
      <button
        onClick={e => { e.preventDefault(); setOpen(!open) }}
        className={`text-[11px] font-medium px-2 py-1 rounded-full border ${style.bg} ${style.text} ${style.border} whitespace-nowrap`}
      >
        {style.label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[110px]">
            {PAYMENT_METHODS.map(m => {
              const s = paymentStyle[m]
              return (
                <button
                  key={m}
                  onClick={e => { e.preventDefault(); onUpdate(slipId, m); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${current === m ? 'font-bold' : ''}`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function HomePage() {
  const supabase = createClient()
  const clinicId = getClinicId()

  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [dateSlips, setDateSlips] = useState<TodaySlip[]>([])
  const [todayPatients, setTodayPatients] = useState<{ id: string; name: string }[]>([])
  const [stats, setStats] = useState({ totalPatients: 0, monthVisits: 0, todayVisits: 0, todayRevenue: 0 })
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingSlips, setLoadingSlips] = useState(false)

  // ===== 問い合わせ入力パネル =====
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquiryDate, setInquiryDate] = useState(today)
  const [adChannels, setAdChannels] = useState<string[]>([])
  // Daily inputs for the selected date (what user is typing)
  const [dailyInputs, setDailyInputs] = useState<Record<string, { inquiries: number; conversions: number }>>({})
  // Monthly sums EXCLUDING the selected date (from DB)
  const [monthlyExcluding, setMonthlyExcluding] = useState<Record<string, { inquiries: number; conversions: number }>>({})
  // Monthly ad costs from cm_ad_costs
  const [monthlyCosts, setMonthlyCosts] = useState<Record<string, number>>({})
  const [savingInquiry, setSavingInquiry] = useState(false)
  const [inquirySaved, setInquirySaved] = useState(false)
  const [loadingInquiry, setLoadingInquiry] = useState(false)

  useEffect(() => {
    const loadStats = async () => {
      const monthStart = today.slice(0, 7) + '-01'
      const [todayRes, monthRes, countRes] = await Promise.all([
        supabase.from('cm_slips').select('id, patient_id, patient_name, total_price').eq('clinic_id', clinicId).eq('visit_date', today),
        supabase.from('cm_slips').select('id, total_price', { count: 'exact' }).eq('clinic_id', clinicId).gte('visit_date', monthStart),
        supabase.from('cm_patients').select('id', { count: 'exact' }).eq('clinic_id', clinicId),
      ])
      const slips = todayRes.data || []
      const todayRevenue = slips.reduce((sum: number, s: { total_price?: number }) => sum + (s.total_price || 0), 0)
      const seen = new Set<string>()
      const uniquePatients = slips
        .filter(s => { if (seen.has(s.patient_id)) return false; seen.add(s.patient_id); return true })
        .map(s => ({ id: s.patient_id, name: s.patient_name || '' }))
      setTodayPatients(uniquePatients)
      setStats({ totalPatients: countRes.count || 0, monthVisits: monthRes.count || 0, todayVisits: slips.length, todayRevenue })
      setLoadingStats(false)
    }
    loadStats()
  }, [])

  const fetchSlips = useCallback(async (date: string) => {
    setLoadingSlips(true)
    const { data } = await supabase
      .from('cm_slips').select('*').eq('clinic_id', clinicId)
      .eq('visit_date', date).order('created_at', { ascending: false })
    setDateSlips(data || [])
    setLoadingSlips(false)
  }, [clinicId])

  useEffect(() => { fetchSlips(selectedDate) }, [selectedDate, fetchSlips])

  // 広告チャネル読み込み
  useEffect(() => {
    const loadChannels = async () => {
      const { data } = await supabase
        .from('cm_ad_channels')
        .select('name')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('sort_order')
      setAdChannels(data?.map(c => c.name) || [])
    }
    loadChannels()
  }, [clinicId])

  // 問い合わせデータ読み込み（日付変更時）
  useEffect(() => {
    if (!inquiryOpen || adChannels.length === 0) return
    const loadInquiry = async () => {
      setLoadingInquiry(true)
      const month = inquiryDate.slice(0, 7)
      const monthStart = month + '-01'
      const [year, mon] = month.split('-').map(Number)
      const lastDate = new Date(year, mon, 0)
      const monthEnd = `${month}-${String(lastDate.getDate()).padStart(2, '0')}`

      const [dailyRes, monthlyRes, costsRes] = await Promise.all([
        // Today's saved data
        supabase.from('cm_daily_inquiries')
          .select('channel, inquiries, conversions')
          .eq('clinic_id', clinicId)
          .eq('date', inquiryDate),
        // All month's data excluding today
        supabase.from('cm_daily_inquiries')
          .select('channel, inquiries, conversions')
          .eq('clinic_id', clinicId)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .neq('date', inquiryDate),
        // Monthly ad costs
        supabase.from('cm_ad_costs')
          .select('channel, cost')
          .eq('clinic_id', clinicId)
          .eq('month', month),
      ])

      // Daily inputs for selected date
      const daily: Record<string, { inquiries: number; conversions: number }> = {}
      adChannels.forEach(ch => { daily[ch] = { inquiries: 0, conversions: 0 } })
      dailyRes.data?.forEach(d => {
        daily[d.channel] = { inquiries: d.inquiries || 0, conversions: d.conversions || 0 }
      })
      setDailyInputs(daily)

      // Monthly sums excluding today
      const monthly: Record<string, { inquiries: number; conversions: number }> = {}
      adChannels.forEach(ch => { monthly[ch] = { inquiries: 0, conversions: 0 } })
      monthlyRes.data?.forEach(d => {
        if (!monthly[d.channel]) monthly[d.channel] = { inquiries: 0, conversions: 0 }
        monthly[d.channel].inquiries += d.inquiries || 0
        monthly[d.channel].conversions += d.conversions || 0
      })
      setMonthlyExcluding(monthly)

      // Monthly costs
      const costs: Record<string, number> = {}
      costsRes.data?.forEach(d => { costs[d.channel] = d.cost || 0 })
      setMonthlyCosts(costs)

      setInquirySaved(false)
      setLoadingInquiry(false)
    }
    loadInquiry()
  }, [inquiryOpen, inquiryDate, adChannels, clinicId])

  const updateDailyInput = (channel: string, key: 'inquiries' | 'conversions', value: number) => {
    setDailyInputs(prev => ({ ...prev, [channel]: { ...prev[channel], [key]: value } }))
  }

  const saveInquiries = async () => {
    setSavingInquiry(true)
    const upsertData = adChannels
      .filter(ch => (dailyInputs[ch]?.inquiries || 0) > 0 || (dailyInputs[ch]?.conversions || 0) > 0)
      .map(ch => ({
        clinic_id: clinicId,
        date: inquiryDate,
        channel: ch,
        inquiries: dailyInputs[ch]?.inquiries || 0,
        conversions: dailyInputs[ch]?.conversions || 0,
      }))

    if (upsertData.length > 0) {
      await supabase.from('cm_daily_inquiries')
        .upsert(upsertData, { onConflict: 'clinic_id,date,channel' })
    }

    // Also delete rows that were zeroed out (if previously saved)
    const zeroChannels = adChannels.filter(ch =>
      (dailyInputs[ch]?.inquiries || 0) === 0 && (dailyInputs[ch]?.conversions || 0) === 0
    )
    if (zeroChannels.length > 0) {
      await supabase.from('cm_daily_inquiries')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('date', inquiryDate)
        .in('channel', zeroChannels)
    }

    setSavingInquiry(false)
    setInquirySaved(true)
    setTimeout(() => setInquirySaved(false), 3000)
  }

  const handlePaymentUpdate = async (slipId: string, method: PaymentMethod) => {
    setDateSlips(prev => prev.map(s => s.id === slipId ? { ...s, payment_method: method } : s))
    await supabase.from('cm_slips').update({ payment_method: method }).eq('id', slipId)
  }

  const dateRevenue = dateSlips.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const paymentBreakdown = dateSlips.reduce<Record<string, number>>((acc, s) => {
    const m = s.payment_method || 'その他'
    acc[m] = (acc[m] || 0) + (s.total_price || 0)
    return acc
  }, {})

  // Live monthly totals = excluding + today's inputs
  const liveMonthly = adChannels.reduce<Record<string, { inquiries: number; conversions: number }>>((acc, ch) => {
    acc[ch] = {
      inquiries: (monthlyExcluding[ch]?.inquiries || 0) + (dailyInputs[ch]?.inquiries || 0),
      conversions: (monthlyExcluding[ch]?.conversions || 0) + (dailyInputs[ch]?.conversions || 0),
    }
    return acc
  }, {})

  const totalMonthlyCV = adChannels.reduce((s, ch) => s + (liveMonthly[ch]?.conversions || 0), 0)
  const totalMonthlyCost = adChannels.reduce((s, ch) => s + (monthlyCosts[ch] || 0), 0)
  const totalCPA = totalMonthlyCV > 0 ? Math.round(totalMonthlyCost / totalMonthlyCV) : null

  const inquiryMonth = inquiryDate.slice(0, 7)

  return (
    <AppShell>
      <Header title="顧客管理シート" />
      <div className="px-4 py-5 max-w-lg mx-auto">

        {/* 統計カード */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4" style={{ borderLeftColor: '#14252A' }}>
            <div className="text-2xl mb-1">👥</div>
            <p className="text-2xl sm:text-3xl font-bold" style={{ color: '#14252A' }}>{stats.totalPatients}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4 border-l-blue-500">
            <div className="text-2xl mb-1">📋</div>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.monthVisits}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">今月の施術</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4 border-l-green-500">
            <div className="text-2xl mb-1">✅</div>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{stats.todayVisits}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">本日の施術</p>
          </div>
        </div>

        {/* クイックアクション（5ボタン） */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-2">
          <Link href="/patients/new" className="text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs" style={{ background: '#14252A' }}>
            + 新規患者
          </Link>
          <Link href="/visits/new" className="bg-blue-600 text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs">
            + 施術記録
          </Link>
          <Link href="/visits/quick" className="bg-green-600 text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs">
            一括入力
          </Link>
          <Link href="/visits/import" className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl p-3 text-center font-bold shadow-sm text-xs hover:bg-gray-50">
            CSV取込
          </Link>
          <button
            onClick={() => setInquiryOpen(v => !v)}
            className={`col-span-2 sm:col-span-1 rounded-xl p-3 text-center font-bold shadow-sm text-xs transition-all ${
              inquiryOpen
                ? 'bg-orange-600 text-white'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
          >
            📞 問い合わせ入力
          </button>
        </div>

        {/* ===== 問い合わせ入力パネル（拡張） ===== */}
        {inquiryOpen && (
          <div className="bg-white rounded-xl shadow-sm mb-5 border border-orange-100 overflow-hidden mt-2">
            {/* パネルヘッダー */}
            <div className="flex justify-between items-center px-4 py-3 bg-orange-50 border-b border-orange-100">
              <h2 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <span>📞</span> 問い合わせ・CV入力
              </h2>
              <button onClick={() => setInquiryOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="p-4">
              {/* 日付ピッカー */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500 whitespace-nowrap">入力日:</span>
                <input
                  type="date"
                  value={inquiryDate}
                  onChange={e => setInquiryDate(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300"
                />
              </div>

              {adChannels.length === 0 ? (
                <div className="text-center py-5">
                  <p className="text-gray-400 text-sm mb-2">広告チャネルが未設定です</p>
                  <Link href="/master" className="text-xs text-blue-600 underline">マスター設定で広告媒体を登録する →</Link>
                </div>
              ) : loadingInquiry ? (
                <p className="text-gray-400 text-sm text-center py-4">読み込み中...</p>
              ) : (
                <>
                  {/* 入力テーブル */}
                  <div className="grid grid-cols-[1fr_72px_72px] gap-1 mb-1.5 px-1">
                    <div className="text-[10px] text-gray-400 font-medium">広告媒体</div>
                    <div className="text-[10px] text-gray-400 font-medium text-center">問い合わせ</div>
                    <div className="text-[10px] text-green-600 font-medium text-center">CV（来院）</div>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {adChannels.map(ch => (
                      <div key={ch} className="grid grid-cols-[1fr_72px_72px] gap-1 items-center bg-gray-50 rounded-lg px-2 py-1.5">
                        <div className="text-xs font-medium text-gray-700 truncate">{ch}</div>
                        <input
                          type="number"
                          min={0}
                          value={dailyInputs[ch]?.inquiries || ''}
                          placeholder="0"
                          onChange={e => updateDailyInput(ch, 'inquiries', parseInt(e.target.value) || 0)}
                          className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                        />
                        <input
                          type="number"
                          min={0}
                          value={dailyInputs[ch]?.conversions || ''}
                          placeholder="0"
                          onChange={e => updateDailyInput(ch, 'conversions', parseInt(e.target.value) || 0)}
                          className="w-full text-center border border-green-200 rounded px-1 py-1 text-sm font-bold text-green-700 focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
                        />
                      </div>
                    ))}
                  </div>

                  {/* 保存ボタン */}
                  <button
                    onClick={saveInquiries}
                    disabled={savingInquiry}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-4 ${
                      inquirySaved ? 'bg-green-600 text-white' : 'text-white'
                    }`}
                    style={inquirySaved ? {} : { background: '#14252A' }}
                  >
                    {inquirySaved ? <><span>✓</span> 保存しました</> : savingInquiry ? '保存中...' : '保存する'}
                  </button>

                  {/* 月累計 + CPA */}
                  <div className="border-t border-orange-100 pt-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-bold text-gray-600">{inquiryMonth} 月間累計</p>
                      <Link href="/master" className="text-[10px] text-blue-500 hover:underline">媒体設定 →</Link>
                    </div>

                    {/* 媒体別サマリ */}
                    <div className="space-y-1.5 mb-3">
                      {adChannels.map(ch => {
                        const mo = liveMonthly[ch] || { inquiries: 0, conversions: 0 }
                        const cost = monthlyCosts[ch] || 0
                        const cpa = mo.conversions > 0 ? Math.round(cost / mo.conversions) : null
                        return (
                          <div key={ch} className="grid grid-cols-[1fr_auto] gap-2 items-center bg-orange-50 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-xs font-semibold text-gray-700">{ch}</span>
                              <span className="text-[10px] text-gray-400 ml-2">
                                問{mo.inquiries}件 / CV {mo.conversions}件
                              </span>
                            </div>
                            <div className="text-right">
                              {cpa !== null ? (
                                <span className={`text-xs font-bold ${
                                  cpa <= 10000 ? 'text-green-600' : cpa <= 30000 ? 'text-yellow-600' : 'text-red-500'
                                }`}>
                                  CPA ¥{cpa.toLocaleString()}
                                </span>
                              ) : cost > 0 ? (
                                <span className="text-xs text-gray-400">CV未入力</span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* 合計CPA */}
                    <div className="rounded-xl px-3 py-2.5 flex justify-between items-center" style={{ background: 'rgba(20,37,42,0.06)' }}>
                      <div className="text-xs text-gray-600">
                        月間合計: 広告費 <strong className="text-gray-800">¥{totalMonthlyCost.toLocaleString()}</strong>
                        　CV <strong className="text-green-700">{totalMonthlyCV}件</strong>
                      </div>
                      {totalCPA !== null && (
                        <span className={`text-sm font-bold ${
                          totalCPA <= 10000 ? 'text-green-600' : totalCPA <= 30000 ? 'text-yellow-600' : 'text-red-500'
                        }`}>
                          CPA ¥{totalCPA.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                      ※ CPA = 広告費 ÷ CV数（来院）　詳細は <Link href="/sales/roas" className="text-blue-500 hover:underline">ROAS分析</Link>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 施術記録（日付ピッカー付き） */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-5 mt-3">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-gray-800 text-base">🩺 施術記録</h2>
          </div>

          {/* 日付ピッカー */}
          <div className="mb-4">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {loadingSlips ? (
            <p className="text-gray-400 text-sm text-center py-4">読み込み中...</p>
          ) : dateSlips.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">この日の施術記録はありません</p>
          ) : (
            <>
              {/* 合計金額 */}
              <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(20,37,42,0.05)' }}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm font-semibold text-gray-700">合計売上</span>
                  <span className="text-2xl font-bold" style={{ color: '#14252A' }}>{dateRevenue.toLocaleString()}円</span>
                </div>
                {Object.keys(paymentBreakdown).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                    {Object.entries(paymentBreakdown).map(([method, amount]) => {
                      const s = paymentStyle[method] || paymentStyle['その他']
                      return (
                        <div key={method} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.bg} ${s.text} ${s.border}`}>
                          <span>{s.label}</span>
                          <span className="font-bold">{amount.toLocaleString()}円</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* スリップ一覧 */}
              <div className="space-y-2">
                {dateSlips.map(s => (
                  <div key={s.id} className="border border-gray-100 rounded-lg p-3.5 hover:bg-gray-50">
                    <div className="flex justify-between items-start gap-2">
                      <Link href={`/patients/${s.patient_id}`} className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-blue-700 hover:underline">{s.patient_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{s.menu_name}</p>
                      </Link>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                          (s.total_price || 0) === 0
                            ? 'bg-gray-50 text-gray-400 border-gray-100'
                            : 'bg-green-50 text-green-700 border-green-100'
                        }`}>
                          {(s.total_price || 0).toLocaleString()}円
                        </span>
                        <PaymentBadge
                          slipId={s.id}
                          current={s.payment_method || null}
                          onUpdate={handlePaymentUpdate}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 本日の来院患者 */}
        {!loadingStats && (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800 text-base">👤 本日の来院患者</h2>
              <Link href="/patients" className="text-xs text-blue-600 font-medium hover:text-blue-800">すべて見る →</Link>
            </div>
            {todayPatients.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">本日の来院患者はいません</p>
            ) : (
              <div className="space-y-2">
                {todayPatients.map(p => (
                  <Link key={p.id} href={`/patients/${p.id}`} className="block border border-gray-100 rounded-lg p-3.5 hover:bg-gray-50 hover:shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-green-500" />
                      <p className="font-bold text-sm">{p.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </AppShell>
  )
}
