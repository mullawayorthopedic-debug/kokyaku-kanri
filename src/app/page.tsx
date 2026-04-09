'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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
                <button key={m} onClick={e => { e.preventDefault(); onUpdate(slipId, m); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${current === m ? 'font-bold' : ''}`}>
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
  const [dropoutPatients, setDropoutPatients] = useState<{ id: string; name: string; status_date: string | null; status_reason: string }[]>([])
  const [stats, setStats] = useState({ totalPatients: 0, monthVisits: 0, todayVisits: 0, todayRevenue: 0, monthRevenue: 0 })

  // ===== 当日問い合わせクイック入力 =====
  const [quickInquiry, setQuickInquiry] = useState({ inquiries: 0, reservations: 0, inquiryChannel: '', reservationChannel: '', inquiryCategory: '' as '' | 'seitai' | 'diet', reservationCategory: '' as '' | 'seitai' | 'diet' })
  const [quickDate, setQuickDate] = useState(new Date().toISOString().split('T')[0])
  const [savingQuick, setSavingQuick] = useState(false)
  const [quickSaved, setQuickSaved] = useState(false)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingSlips, setLoadingSlips] = useState(false)

  // ===== 問い合わせ入力パネル =====
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false)
  const [inquiryDate, setInquiryDate] = useState(today)
  const [adChannels, setAdChannels] = useState<string[]>([])
  const [dailyInputs, setDailyInputs] = useState<Record<string, { inquiries: number; conversions: number }>>({})
  // Monthly excluding selected date (from DB)
  const [monthlyExcluding, setMonthlyExcluding] = useState<Record<string, { inquiries: number; conversions: number }>>({})
  const [monthlyCosts, setMonthlyCosts] = useState<Record<string, number>>({})
  const [isHistoricalFallback, setIsHistoricalFallback] = useState(false)
  const [savingInquiry, setSavingInquiry] = useState(false)
  const [inquirySaved, setInquirySaved] = useState(false)
  const [loadingInquiry, setLoadingInquiry] = useState(false)

  // ===== 統計 =====
  useEffect(() => {
    const loadStats = async () => {
      const monthStart = today.slice(0, 7) + '-01'
      const [todayRes, monthRes, countRes] = await Promise.all([
        supabase.from('cm_slips').select('id, patient_id, patient_name, total_price').eq('clinic_id', clinicId).eq('visit_date', today),
        supabase.from('cm_slips').select('id, total_price', { count: 'exact' }).eq('clinic_id', clinicId).gte('visit_date', monthStart).lte('visit_date', today),
        supabase.from('cm_patients').select('id', { count: 'exact' }).eq('clinic_id', clinicId),
      ])
      const slips = todayRes.data || []
      const todayRevenue = slips.reduce((sum: number, s: { total_price?: number }) => sum + (s.total_price || 0), 0)
      const seen = new Set<string>()
      const uniquePatients = slips
        .filter(s => { if (seen.has(s.patient_id)) return false; seen.add(s.patient_id); return true })
        .map(s => ({ id: s.patient_id, name: s.patient_name || '' }))
      const monthRevenue = (monthRes.data || []).reduce((sum: number, s: { total_price?: number }) => sum + (s.total_price || 0), 0)
      setTodayPatients(uniquePatients)
      setStats({ totalPatients: countRes.count || 0, monthVisits: monthRes.count || 0, todayVisits: slips.length, todayRevenue, monthRevenue })
      setLoadingStats(false)
    }
    loadStats()

    // 離脱患者を取得
    const loadDropouts = async () => {
      const { data } = await supabase.from('cm_patients')
        .select('id, name, status_date, status_reason')
        .eq('clinic_id', clinicId)
        .eq('status', 'inactive')
        .order('status_date', { ascending: false })
        .limit(20)
      setDropoutPatients(data || [])
    }
    loadDropouts()

  }, [])

  // 選択日のクイック問い合わせをロード
  useEffect(() => {
    const loadQuickInquiry = async () => {
      const { data } = await supabase.from('cm_daily_inquiries')
        .select('channel, category, inquiries, conversions')
        .eq('clinic_id', clinicId)
        .eq('date', quickDate)
      const inqRow = data?.find(d => (d.inquiries || 0) > 0 && (d.conversions || 0) === 0)
      const rsvRow = data?.find(d => (d.conversions || 0) > 0)
      setQuickInquiry({
        inquiries: inqRow?.inquiries || 0,
        reservations: rsvRow?.conversions || 0,
        inquiryChannel: inqRow?.channel || '',
        reservationChannel: rsvRow?.channel || '',
        inquiryCategory: (inqRow?.category as 'seitai' | 'diet' | undefined) || '',
        reservationCategory: (rsvRow?.category as 'seitai' | 'diet' | undefined) || '',
      })
    }
    loadQuickInquiry()
  }, [quickDate, clinicId])

  const saveQuickInquiry = async () => {
    if (quickInquiry.inquiries > 0 && (!quickInquiry.inquiryChannel || !quickInquiry.inquiryCategory)) {
      alert('問い合わせの経路と区分（整体／ダイエット）を選択してください'); return
    }
    if (quickInquiry.reservations > 0 && (!quickInquiry.reservationChannel || !quickInquiry.reservationCategory)) {
      alert('予約の経路と区分（整体／ダイエット）を選択してください'); return
    }
    setSavingQuick(true)
    setQuickSaved(false)
    try {
      const rows: { clinic_id: string; date: string; channel: string; category: string; inquiries: number; conversions: number }[] = []

      const sameKey = quickInquiry.inquiryChannel === quickInquiry.reservationChannel
        && quickInquiry.inquiryCategory === quickInquiry.reservationCategory

      if (quickInquiry.inquiries > 0 && quickInquiry.inquiryChannel) {
        if (sameKey && quickInquiry.reservations > 0) {
          rows.push({ clinic_id: clinicId, date: quickDate, channel: quickInquiry.inquiryChannel, category: quickInquiry.inquiryCategory, inquiries: quickInquiry.inquiries, conversions: quickInquiry.reservations })
        } else {
          rows.push({ clinic_id: clinicId, date: quickDate, channel: quickInquiry.inquiryChannel, category: quickInquiry.inquiryCategory, inquiries: quickInquiry.inquiries, conversions: 0 })
        }
      }
      if (quickInquiry.reservations > 0 && quickInquiry.reservationChannel && !sameKey) {
        rows.push({ clinic_id: clinicId, date: quickDate, channel: quickInquiry.reservationChannel, category: quickInquiry.reservationCategory, inquiries: quickInquiry.reservations, conversions: quickInquiry.reservations })
      }

      if (rows.length > 0) {
        await supabase.from('cm_daily_inquiries').upsert(rows, { onConflict: 'clinic_id,date,channel,category' })
      }
      setQuickSaved(true)
      setTimeout(() => setQuickSaved(false), 2000)
    } catch (e) {
      alert('保存失敗: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSavingQuick(false)
    }
  }

  const fetchSlips = useCallback(async (date: string) => {
    setLoadingSlips(true)
    const { data } = await supabase.from('cm_slips').select('*').eq('clinic_id', clinicId)
      .eq('visit_date', date).order('created_at', { ascending: false })
    setDateSlips(data || [])
    setLoadingSlips(false)
  }, [clinicId])

  useEffect(() => { fetchSlips(selectedDate) }, [selectedDate, fetchSlips])

  // 広告チャネル読み込み
  useEffect(() => {
    const loadChannels = async () => {
      const { data } = await supabase.from('cm_ad_channels').select('name')
        .eq('clinic_id', clinicId).eq('is_active', true).order('sort_order')
      setAdChannels(data?.map(c => c.name) || [])
    }
    loadChannels()
  }, [clinicId])

  // 問い合わせデータ読み込み（日付変更 or パネルopen時）
  useEffect(() => {
    if (!inquiryOpen || adChannels.length === 0) return
    const loadInquiry = async () => {
      setLoadingInquiry(true)
      const month = inquiryDate.slice(0, 7)
      const monthStart = month + '-01'
      const [year, mon] = month.split('-').map(Number)
      const lastDate = new Date(year, mon, 0)
      const monthEnd = `${month}-${String(lastDate.getDate()).padStart(2, '0')}`

      const [dailyRes, costsRes] = await Promise.all([
        supabase.from('cm_daily_inquiries')
          .select('date, channel, inquiries, conversions')
          .eq('clinic_id', clinicId)
          .gte('date', monthStart)
          .lte('date', monthEnd),
        supabase.from('cm_ad_costs')
          .select('channel, cost, inquiries, conversions')
          .eq('clinic_id', clinicId)
          .eq('month', month),
      ])

      const allDailyRows = dailyRes.data || []
      const hasAnyDailyThisMonth = allDailyRows.length > 0

      // Daily inputs for selected date
      const daily: Record<string, { inquiries: number; conversions: number }> = {}
      adChannels.forEach(ch => { daily[ch] = { inquiries: 0, conversions: 0 } })
      allDailyRows.filter(d => d.date === inquiryDate).forEach(d => {
        daily[d.channel] = { inquiries: d.inquiries || 0, conversions: d.conversions || 0 }
      })
      setDailyInputs(daily)

      // Monthly sums excluding today
      const monthly: Record<string, { inquiries: number; conversions: number }> = {}
      adChannels.forEach(ch => { monthly[ch] = { inquiries: 0, conversions: 0 } })

      if (hasAnyDailyThisMonth) {
        // Use daily data (new system) — sum excluding selected date
        allDailyRows.filter(d => d.date !== inquiryDate).forEach(d => {
          if (!monthly[d.channel]) monthly[d.channel] = { inquiries: 0, conversions: 0 }
          monthly[d.channel].inquiries += d.inquiries || 0
          monthly[d.channel].conversions += d.conversions || 0
        })
        setIsHistoricalFallback(false)
      } else {
        // No daily data → fallback to cm_ad_costs historical monthly values
        costsRes.data?.forEach(d => {
          if (monthly[d.channel] !== undefined) {
            monthly[d.channel] = { inquiries: d.inquiries || 0, conversions: d.conversions || 0 }
          } else {
            monthly[d.channel] = { inquiries: d.inquiries || 0, conversions: d.conversions || 0 }
          }
        })
        setIsHistoricalFallback(true)
      }
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
        clinic_id: clinicId, date: inquiryDate, channel: ch,
        inquiries: dailyInputs[ch]?.inquiries || 0,
        conversions: dailyInputs[ch]?.conversions || 0,
      }))
    if (upsertData.length > 0) {
      await supabase.from('cm_daily_inquiries')
        .upsert(upsertData, { onConflict: 'clinic_id,date,channel' })
    }
    const zeroChannels = adChannels.filter(ch =>
      (dailyInputs[ch]?.inquiries || 0) === 0 && (dailyInputs[ch]?.conversions || 0) === 0
    )
    if (zeroChannels.length > 0) {
      await supabase.from('cm_daily_inquiries').delete()
        .eq('clinic_id', clinicId).eq('date', inquiryDate).in('channel', zeroChannels)
    }
    // Update monthlyExcluding state so right panel refreshes without reload
    setIsHistoricalFallback(false)
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

  // Live monthly totals = saved (excluding today) + today's live input
  const liveMonthly = adChannels.reduce<Record<string, { inquiries: number; conversions: number }>>((acc, ch) => {
    const base = isHistoricalFallback
      ? (monthlyExcluding[ch] || { inquiries: 0, conversions: 0 })
      : {
          inquiries: (monthlyExcluding[ch]?.inquiries || 0) + (dailyInputs[ch]?.inquiries || 0),
          conversions: (monthlyExcluding[ch]?.conversions || 0) + (dailyInputs[ch]?.conversions || 0),
        }
    acc[ch] = base
    return acc
  }, {})

  const totalMonthlyCV = adChannels.reduce((s, ch) => s + (liveMonthly[ch]?.conversions || 0), 0)
  const totalMonthlyInq = adChannels.reduce((s, ch) => s + (liveMonthly[ch]?.inquiries || 0), 0)
  const totalMonthlyCost = adChannels.reduce((s, ch) => s + (monthlyCosts[ch] || 0), 0)
  const totalCPA = totalMonthlyCV > 0 ? Math.round(totalMonthlyCost / totalMonthlyCV) : null
  const inquiryMonth = inquiryDate.slice(0, 7)

  return (
    <AppShell>
      <div className="px-4 py-4 max-w-6xl mx-auto">

        {/* ===== 統計カード（5枚） ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4" style={{ borderLeftColor: '#14252A' }}>
            <div className="text-xl mb-1">👥</div>
            <p className="text-2xl font-bold" style={{ color: '#14252A' }}>{stats.totalPatients}</p>
            <p className="text-xs text-gray-500 mt-0.5">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-blue-500">
            <div className="text-xl mb-1">📋</div>
            <p className="text-2xl font-bold text-blue-600">{stats.monthVisits}</p>
            <p className="text-xs text-gray-500 mt-0.5">今月の施術</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-green-500">
            <div className="text-xl mb-1">✅</div>
            <p className="text-2xl font-bold text-green-600">{stats.todayVisits}</p>
            <p className="text-xs text-gray-500 mt-0.5">本日の施術</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-amber-500">
            <div className="text-xl mb-1">💰</div>
            <p className="text-2xl font-bold text-amber-600">{loadingStats ? '-' : stats.todayRevenue.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">本日の売上 円</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-l-4 border-l-rose-500">
            <div className="text-xl mb-1">📈</div>
            <p className="text-2xl font-bold text-rose-600">{loadingStats ? '-' : stats.monthRevenue.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">当月の売上 円</p>
          </div>
        </div>

        {/* ===== クイックアクション（5ボタン） ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          <Link href="/patients/new" className="text-white rounded-xl py-3 text-center font-bold shadow-sm text-sm" style={{ background: '#14252A' }}>
            + 新規患者
          </Link>
          <Link href="/visits/new" className="bg-blue-600 text-white rounded-xl py-3 text-center font-bold shadow-sm text-sm">
            + 施術記録
          </Link>
          <Link href="/visits/quick" className="bg-green-600 text-white rounded-xl py-3 text-center font-bold shadow-sm text-sm">
            一括入力
          </Link>
          <Link href="/visits/import" className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl py-3 text-center font-bold shadow-sm text-sm hover:bg-gray-50">
            CSV取込
          </Link>
          <button
            onClick={() => setInquiryOpen(v => !v)}
            className={`col-span-2 sm:col-span-1 rounded-xl py-3 text-center font-bold shadow-sm text-sm transition-all ${
              inquiryOpen ? 'bg-orange-600 text-white' : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
          >
            📞 問い合わせ入力
          </button>
        </div>

        {/* ===== 問い合わせ入力パネル（拡張 / 2カラム） ===== */}
        {inquiryOpen && (
          <div className="bg-white rounded-xl shadow-sm mb-4 border border-orange-100 overflow-hidden">
            {/* パネルヘッダー */}
            <div className="flex justify-between items-center px-5 py-3 bg-orange-50 border-b border-orange-100">
              <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <span>📞</span> 問い合わせ・CV日次入力
                {isHistoricalFallback && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">過去データ表示中</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChannelSettingsOpen(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                    channelSettingsOpen
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  ⚙️ 媒体設定
                </button>
                <button onClick={() => setInquiryOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
            </div>

            {/* 媒体設定パネル（トグル） */}
            {channelSettingsOpen && (
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-gray-500">登録済み媒体:</span>
                  {adChannels.length === 0 ? (
                    <span className="text-xs text-gray-400">未登録</span>
                  ) : (
                    adChannels.map(ch => (
                      <span key={ch} className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full">{ch}</span>
                    ))
                  )}
                  <Link href="/master" className="ml-auto text-xs text-blue-600 hover:underline font-medium">
                    マスター設定で媒体を編集 →
                  </Link>
                </div>
              </div>
            )}

            {adChannels.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-2">広告チャネルが未設定です</p>
                <Link href="/master" className="text-xs text-blue-600 underline">マスター設定で広告媒体を登録する →</Link>
              </div>
            ) : loadingInquiry ? (
              <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

                {/* ===== 左: 日次入力 ===== */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-gray-500 whitespace-nowrap font-medium">入力日:</span>
                    <input
                      type="date"
                      value={inquiryDate}
                      onChange={e => setInquiryDate(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300"
                    />
                  </div>

                  {/* 入力テーブルヘッダー */}
                  <div className="grid grid-cols-[1fr_80px_80px] gap-2 mb-1.5 px-1">
                    <div className="text-[10px] text-gray-400 font-medium">広告媒体</div>
                    <div className="text-[10px] text-gray-400 font-medium text-center">問い合わせ</div>
                    <div className="text-[10px] text-green-600 font-medium text-center">CV（来院）</div>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {adChannels.map(ch => (
                      <div key={ch} className="grid grid-cols-[1fr_80px_80px] gap-2 items-center bg-gray-50 rounded-lg px-3 py-1.5">
                        <div className="text-xs font-medium text-gray-700 truncate">{ch}</div>
                        <input
                          type="number" min={0}
                          value={dailyInputs[ch]?.inquiries || ''}
                          placeholder="0"
                          onChange={e => updateDailyInput(ch, 'inquiries', parseInt(e.target.value) || 0)}
                          className="w-full text-center border border-gray-200 rounded px-1 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                        />
                        <input
                          type="number" min={0}
                          value={dailyInputs[ch]?.conversions || ''}
                          placeholder="0"
                          onChange={e => updateDailyInput(ch, 'conversions', parseInt(e.target.value) || 0)}
                          className="w-full text-center border border-green-200 rounded px-1 py-1.5 text-sm font-bold text-green-700 focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={saveInquiries}
                    disabled={savingInquiry || isHistoricalFallback}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                      inquirySaved ? 'bg-green-600 text-white' : 'text-white'
                    }`}
                    style={inquirySaved ? {} : { background: '#14252A' }}
                  >
                    {inquirySaved ? <><span>✓</span> 保存しました</> : savingInquiry ? '保存中...' : '保存する'}
                  </button>
                  {isHistoricalFallback && (
                    <p className="text-[10px] text-amber-600 mt-1.5 text-center">
                      ※ この月は過去データ（月次集計）を表示しています。日次入力するには日付を入力してください。
                    </p>
                  )}
                </div>

                {/* ===== 右: 月間累計 + CPA ===== */}
                <div className="p-5">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm font-bold text-gray-700">
                      {inquiryMonth} 月間累計
                      {isHistoricalFallback && <span className="text-[10px] text-amber-600 ml-1">（旧システム）</span>}
                    </p>
                    <div className="text-right">
                      {totalCPA !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          totalCPA <= 10000 ? 'bg-green-100 text-green-700' :
                          totalCPA <= 30000 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                        }`}>
                          総CPA ¥{totalCPA.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 媒体別サマリテーブル */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="px-3 py-2 text-left font-medium">媒体</th>
                          <th className="px-2 py-2 text-right font-medium">問合</th>
                          <th className="px-2 py-2 text-right font-medium text-green-600">CV</th>
                          <th className="px-2 py-2 text-right font-medium">広告費</th>
                          <th className="px-3 py-2 text-right font-medium">CPA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adChannels.map((ch, i) => {
                          const mo = liveMonthly[ch] || { inquiries: 0, conversions: 0 }
                          const cost = monthlyCosts[ch] || 0
                          const cpa = mo.conversions > 0 ? Math.round(cost / mo.conversions) : null
                          const hasData = mo.inquiries > 0 || mo.conversions > 0 || cost > 0
                          return (
                            <tr key={ch} className={`border-t border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${!hasData ? 'opacity-40' : ''}`}>
                              <td className="px-3 py-2 font-medium text-gray-700 truncate max-w-[100px]">{ch}</td>
                              <td className="px-2 py-2 text-right text-gray-600 tabular-nums">{mo.inquiries || '-'}</td>
                              <td className="px-2 py-2 text-right font-bold text-green-600 tabular-nums">{mo.conversions || '-'}</td>
                              <td className="px-2 py-2 text-right text-gray-600 tabular-nums">{cost > 0 ? `¥${cost.toLocaleString()}` : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {cpa !== null ? (
                                  <span className={`font-bold ${cpa <= 10000 ? 'text-green-600' : cpa <= 30000 ? 'text-yellow-600' : 'text-red-500'}`}>
                                    ¥{cpa.toLocaleString()}
                                  </span>
                                ) : cost > 0 ? (
                                  <span className="text-gray-300">CV未入力</span>
                                ) : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-800 text-white font-bold text-xs">
                          <td className="px-3 py-2">合計</td>
                          <td className="px-2 py-2 text-right tabular-nums">{totalMonthlyInq || '-'}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{totalMonthlyCV || '-'}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{totalMonthlyCost > 0 ? `¥${totalMonthlyCost.toLocaleString()}` : '-'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {totalCPA !== null ? (
                              <span className={totalCPA <= 10000 ? 'text-green-300' : totalCPA <= 30000 ? 'text-yellow-300' : 'text-red-300'}>
                                ¥{totalCPA.toLocaleString()}
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <p className="text-[10px] text-gray-400 text-center">
                    CPA = 広告費 ÷ CV数（緑≤¥10,000 / 黄≤¥30,000 / 赤&gt;¥30,000）
                    <Link href="/sales/roas" className="text-blue-500 hover:underline">ROAS詳細分析 →</Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== メインコンテンツ（2カラム） ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ===== 左: 施術記録 ===== */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-gray-800 text-base">🩺 施術記録</h2>
            </div>
            <div className="mb-4">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            {loadingSlips ? (
              <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>
            ) : dateSlips.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">この日の施術記録はありません</p>
            ) : (
              <>
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
                            (s.total_price || 0) === 0 ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-green-50 text-green-700 border-green-100'
                          }`}>
                            {(s.total_price || 0).toLocaleString()}円
                          </span>
                          <PaymentBadge slipId={s.id} current={s.payment_method || null} onUpdate={handlePaymentUpdate} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ===== 右: 本日の来院患者 + 離脱患者 ===== */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-gray-800 text-base">👤 本日の来院患者</h2>
                <Link href="/patients" className="text-xs text-blue-600 font-medium hover:text-blue-800">すべて見る →</Link>
              </div>
              {loadingStats ? (
                <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>
              ) : todayPatients.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">本日の来院患者はいません</p>
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

              {/* 離脱患者セクション */}
              {dropoutPatients.length > 0 && (
                <div className="mt-5 pt-4 border-t border-red-100">
                  <h3 className="font-bold text-sm text-red-700 mb-3">🚨 離脱患者（{dropoutPatients.length}名）</h3>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {dropoutPatients.map(p => (
                      <Link key={p.id} href={`/patients/${p.id}`} className="block border border-red-100 rounded-lg p-2.5 bg-red-50/30 hover:bg-red-50">
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                            <p className="text-xs font-bold text-gray-800 truncate">{p.name}</p>
                          </div>
                          {p.status_date && <span className="text-[10px] text-red-500 shrink-0">{p.status_date}</span>}
                        </div>
                        {p.status_reason && <p className="text-[10px] text-gray-500 mt-1 ml-4 truncate">{p.status_reason}</p>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ===== 当日問い合わせ・予約クイック入力 ===== */}
            <div className="bg-white rounded-xl shadow-sm p-5 border border-orange-100">
              <h2 className="font-bold text-gray-800 text-base mb-3 flex items-center gap-2">
                <span>📞</span> {quickDate === today ? '本日' : quickDate} の問い合わせ・予約
              </h2>
              <input type="date" value={quickDate} max={today}
                onChange={e => setQuickDate(e.target.value)}
                className="w-full mb-3 px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">問い合わせ数</label>
                    <input type="number" min="0" value={quickInquiry.inquiries}
                      onChange={e => setQuickInquiry({ ...quickInquiry, inquiries: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-orange-200 rounded-xl text-center text-2xl font-bold text-orange-600 focus:outline-none focus:border-orange-400" />
                    <select value={quickInquiry.inquiryChannel}
                      onChange={e => setQuickInquiry({ ...quickInquiry, inquiryChannel: e.target.value })}
                      className="w-full mt-2 px-2 py-1.5 border border-orange-200 rounded-lg text-xs focus:outline-none focus:border-orange-400">
                      <option value="">媒体を選択</option>
                      <option value="LINE">LINE</option>
                      <option value="電話">電話</option>
                    </select>
                    <select value={quickInquiry.inquiryCategory}
                      onChange={e => setQuickInquiry({ ...quickInquiry, inquiryCategory: e.target.value as '' | 'seitai' | 'diet' })}
                      className="w-full mt-2 px-2 py-1.5 border border-orange-200 rounded-lg text-xs focus:outline-none focus:border-orange-400">
                      <option value="">区分を選択</option>
                      <option value="seitai">整体</option>
                      <option value="diet">ダイエット</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">予約数</label>
                    <input type="number" min="0" value={quickInquiry.reservations}
                      onChange={e => setQuickInquiry({ ...quickInquiry, reservations: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-blue-200 rounded-xl text-center text-2xl font-bold text-blue-600 focus:outline-none focus:border-blue-400" />
                    <select value={quickInquiry.reservationChannel}
                      onChange={e => setQuickInquiry({ ...quickInquiry, reservationChannel: e.target.value })}
                      className="w-full mt-2 px-2 py-1.5 border border-blue-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
                      <option value="">経路を選択</option>
                      {adChannels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                    </select>
                    <select value={quickInquiry.reservationCategory}
                      onChange={e => setQuickInquiry({ ...quickInquiry, reservationCategory: e.target.value as '' | 'seitai' | 'diet' })}
                      className="w-full mt-2 px-2 py-1.5 border border-blue-200 rounded-lg text-xs focus:outline-none focus:border-blue-400">
                      <option value="">区分を選択</option>
                      <option value="seitai">整体</option>
                      <option value="diet">ダイエット</option>
                    </select>
                  </div>
                </div>
                <button onClick={saveQuickInquiry} disabled={savingQuick}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-50"
                  style={{ background: quickSaved ? '#10b981' : '#ea580c' }}>
                  {savingQuick ? '保存中...' : quickSaved ? '✓ 保存しました' : '保存'}
                </button>
                <p className="text-[10px] text-gray-400 text-center">※ 営業データの新規集客に自動反映されます</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
